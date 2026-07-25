import { ProcessingSettings, ProcessedResult, OutputFormat, ShirtColor } from '../types';
import { TARGET_WIDTH, TARGET_HEIGHT } from '../constants';
import {
  compositeMockupInWorker,
  generateUnderbaseInWorker,
  processImageInWorker,
  ProcessImageWorkerOptions,
} from './imageProcessingWorkerClient';
import { buildUpscaleMetadata } from './upscaleEngine';
// @ts-ignore
import { jsPDF } from 'jspdf';

const legacyUpscaleMetadata = () => buildUpscaleMetadata(
  TARGET_WIDTH,
  TARGET_HEIGHT,
  TARGET_WIDTH,
  TARGET_HEIGHT,
);

export const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

const loadImageLocal = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Do NOT set crossOrigin for local public assets
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      } else {
        reject(new Error('Failed to read file as base64'));
      }
    };
    reader.onerror = (error) => reject(error);
  });
};

// --- FEATURE 1: DPI CHECKER ---
export const calculateDPI = (
  imageWidth: number,
  imageHeight: number,
  printWidth: number,  // in inches
  printHeight: number  // in inches
): number => {
  const dpiX = imageWidth / printWidth;
  const dpiY = imageHeight / printHeight;
  return Math.min(dpiX, dpiY);
};

// Standard DTG print area is 14x16 inches (full front)
export const getPrintDPI = (imageWidth: number, imageHeight: number): {
  dpi: number;
  status: 'good' | 'low' | 'poor';
  label: string;
} => {
  // Using 14x17 roughly for max print area on standard platen
  const dpi = Math.round(calculateDPI(imageWidth, imageHeight, 14, 17));
  if (dpi >= 300) return { dpi, status: 'good', label: 'Print Ready' };
  if (dpi >= 150) return { dpi, status: 'low', label: 'Low Resolution' };
  return { dpi, status: 'poor', label: 'Too Low — May Appear Blurry' };
};

export const generatePalette = async (imageSource: string | HTMLImageElement): Promise<string[]> => {
  let img: HTMLImageElement;
  try {
    if (typeof imageSource === 'string') {
      img = await loadImage(imageSource);
    } else {
      img = imageSource;
    }
  } catch (e) {
    console.error('Error generating palette:', e);
    return [];
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  const size = 50;
  canvas.width = size;
  canvas.height = size;
  ctx.drawImage(img, 0, 0, size, size);

  const imageData = ctx.getImageData(0, 0, size, size).data;
  const colorCounts: Record<string, number> = {};

  for (let i = 0; i < imageData.length; i += 4) {
    const r = imageData[i];
    const g = imageData[i + 1];
    const b = imageData[i + 2];
    const a = imageData[i + 3];

    if (a < 128) continue;

    const quantization = 32;
    const qR = Math.round(r / quantization) * quantization;
    const qG = Math.round(g / quantization) * quantization;
    const qB = Math.round(b / quantization) * quantization;

    const key = `${qR},${qG},${qB}`;
    colorCounts[key] = (colorCounts[key] || 0) + 1;
  }

  const sortedColors = Object.entries(colorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key]) => {
      const [r, g, b] = key.split(',').map(Number);
      return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
    });

  return sortedColors;
};

export const getDominantColor = async (
  imageSource: string | HTMLImageElement
): Promise<{ r: number; g: number; b: number }> => {
  let img: HTMLImageElement;
  if (typeof imageSource === 'string') {
    img = await loadImage(imageSource);
  } else {
    img = imageSource;
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return { r: 0, g: 0, b: 0 };

  const size = 50;
  canvas.width = size;
  canvas.height = size;
  ctx.drawImage(img, 0, 0, size, size);

  const imageData = ctx.getImageData(0, 0, size, size).data;
  const colorCounts: Record<string, { count: number; r: number; g: number; b: number }> = {};

  for (let i = 0; i < imageData.length; i += 4) {
    const r = imageData[i];
    const g = imageData[i + 1];
    const b = imageData[i + 2];
    const a = imageData[i + 3];
    if (a < 128) continue;

    const quantization = 32;
    const qR = Math.round(r / quantization) * quantization;
    const qG = Math.round(g / quantization) * quantization;
    const qB = Math.round(b / quantization) * quantization;
    const key = `${qR},${qG},${qB}`;

    if (!colorCounts[key]) {
      colorCounts[key] = { count: 0, r: qR, g: qG, b: qB };
    }
    colorCounts[key].count++;
  }

  const dominant = Object.values(colorCounts).sort((a, b) => b.count - a.count)[0];
  return dominant ? { r: dominant.r, g: dominant.g, b: dominant.b } : { r: 0, g: 0, b: 0 };
};

export const processImage = async (
  imageSource: string | HTMLImageElement,
  settings: ProcessingSettings,
  options?: ProcessImageWorkerOptions,
): Promise<ProcessedResult> => {
  return processImageInWorker(imageSource, settings, options);
};

// --- FEATURE 8: PRINT PDF EXPORT ---
export const generatePrintPDF = async (
    imageUrl: string,
    itemType: string
  ): Promise<{ blob: Blob; url: string }> => {
    // PDF dimensions at 72 DPI (standard PDF units = points)
    // 8.5" x 11" = 612 x 792 points
    const PAGE_W = 612;
    const PAGE_H = 792;
    const BLEED = 9;    // 0.125" = 9pt
    const MARGIN = 36;  // 0.5" margin
    // @ts-ignore
    const doc = new jsPDF({ unit: 'pt', format: [PAGE_W, PAGE_H] });

    const img = await loadImage(imageUrl);
    
    // Scale image to fit within safe area
    const maxW = PAGE_W - MARGIN * 2;
    const maxH = PAGE_H - MARGIN * 2 - 40; // 40pt for footer
    const aspect = img.naturalWidth / img.naturalHeight;
    let drawW = maxW;
    let drawH = maxW / aspect;
    if (drawH > maxH) { drawH = maxH; drawW = maxH * aspect; }
    
    // Center logic
    const imgX = (PAGE_W - drawW) / 2;
    const imgY = MARGIN + (maxH - drawH) / 2;

    // We can pass the URL directly to addImage if it's base64 or a blob URL that jspdf can read, 
    // but sometimes it's safer to draw to canvas first if we did complex processing.
    // Here we can use the imageUrl directly.
    doc.addImage(img, 'PNG', imgX, imgY, drawW, drawH);

    // Bleed border (red dashed)
    doc.setDrawColor(255, 0, 0);
    doc.setLineWidth(0.5);
    doc.setLineDashPattern([3, 3], 0);
    doc.rect(BLEED, BLEED, PAGE_W - BLEED * 2, PAGE_H - BLEED * 2);
    doc.setLineDashPattern([], 0);

    // Crop marks (black)
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    const MARK_LEN = 18;
    const MARK_GAP = 6;

    const drawCropMark = (x: number, y: number, hDir: number, vDir: number) => {
        // Horizontal
        doc.line(x + hDir * MARK_GAP, y, x + hDir * (MARK_GAP + MARK_LEN), y);
        // Vertical
        doc.line(x, y + vDir * MARK_GAP, x, y + vDir * (MARK_GAP + MARK_LEN));
    };

    drawCropMark(BLEED, BLEED, -1, -1);
    drawCropMark(PAGE_W - BLEED, BLEED, 1, -1);
    drawCropMark(BLEED, PAGE_H - BLEED, -1, 1);
    drawCropMark(PAGE_W - BLEED, PAGE_H - BLEED, 1, 1);

    // Footer text
    doc.setTextColor(100);
    doc.setFontSize(7);
    doc.text(
      `InkMaster AI · ${itemType} · ${img.naturalWidth}×${img.naturalHeight}px · Color Profile: sRGB IEC61966-2.1 · Bleed: 0.125"`,
      BLEED + 4,
      PAGE_H - 10
    );

    const blob = doc.output('blob');
    return { blob, url: URL.createObjectURL(blob) };
  };

// --- FEATURE 3: UNDERBASE GENERATOR ---
const generateUnderbaseOnMainThread = async (
    processedImageUrl: string,
    format: 'PNG' | 'SVG' | 'JPG'
  ): Promise<{ blob: Blob; url: string }> => {
    const img = await loadImage(processedImageUrl);

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas context');

    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Convert every visible pixel to pure white
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 10) {
        data[i] = 255;     // R
        data[i + 1] = 255; // G
        data[i + 2] = 255; // B
        // Keep original alpha for soft edges
      }
    }

    ctx.putImageData(imageData, 0, 0);

    if (format === 'SVG') {
      const dataUrl = canvas.toDataURL('image/png');
      const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">
        <image href="${dataUrl}" x="0" y="0" width="${canvas.width}" height="${canvas.height}" />
      </svg>`;
      const blob = new Blob([svgString], { type: 'image/svg+xml' });
      return { blob, url: URL.createObjectURL(blob) };
    }

    const mimeType = format === 'JPG' ? 'image/jpeg' : 'image/png';
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Failed to generate underbase'));
          resolve({ blob, url: URL.createObjectURL(blob) });
        },
        mimeType,
        0.9
      );
    });
  };

const exportRaster = async (canvas: HTMLCanvasElement, settings: ProcessingSettings): Promise<ProcessedResult> => {
  if (settings.format === OutputFormat.PDF) {
     const previewBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
     const previewUrl = previewBlob ? URL.createObjectURL(previewBlob) : '';

     const widthInches = TARGET_WIDTH / 300;
     const heightInches = TARGET_HEIGHT / 300;
     
     // @ts-ignore
     const pdf = new jsPDF({
         orientation: widthInches > heightInches ? 'l' : 'p',
         unit: 'in',
         format: [widthInches, heightInches]
     });
     
     const imgData = canvas.toDataURL('image/png');
     pdf.addImage(imgData, 'PNG', 0, 0, widthInches, heightInches);
     
     const pdfBlob = pdf.output('blob');
     const pdfUrl = URL.createObjectURL(pdfBlob);
     
     return {
         blob: pdfBlob,
         url: pdfUrl,
         previewUrl: previewUrl,
         width: TARGET_WIDTH,
         height: TARGET_HEIGHT,
         upscale: legacyUpscaleMetadata()
     };
  }

  if (settings.format === OutputFormat.JPG) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = TARGET_WIDTH;
    tempCanvas.height = TARGET_HEIGHT;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      if (settings.shirtColor === ShirtColor.WHITE) {
        tempCtx.fillStyle = '#FFFFFF';
      } else if (settings.shirtColor === ShirtColor.NONE) {
        tempCtx.fillStyle = '#FFFFFF';
      } else {
        tempCtx.fillStyle = '#000000';
      }
      tempCtx.fillRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT);
      tempCtx.drawImage(canvas, 0, 0);
      
      return new Promise((resolve) => {
        tempCanvas.toBlob(
            (blob) => {
                if (!blob) throw new Error("Failed");
                const url = URL.createObjectURL(blob);
                resolve({blob, url, previewUrl: url, width: TARGET_WIDTH, height: TARGET_HEIGHT, upscale: legacyUpscaleMetadata()});
            },
            'image/jpeg',
            0.9
        );
      });
    }
  }

  let mimeType = 'image/png';
  return new Promise((resolve) => {
    if (settings.format === OutputFormat.SVG) {
      // Raster wrapped in SVG
      const dataUrl = canvas.toDataURL('image/png');
      const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${TARGET_WIDTH}" height="${TARGET_HEIGHT}" viewBox="0 0 ${TARGET_WIDTH} ${TARGET_HEIGHT}">
         <image href="${dataUrl}" x="0" y="0" width="${TARGET_WIDTH}" height="${TARGET_HEIGHT}" />
      </svg>`;
      const blob = new Blob([svgString], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      resolve({ blob, url, previewUrl: url, width: TARGET_WIDTH, height: TARGET_HEIGHT, upscale: legacyUpscaleMetadata() });
    } else {
      canvas.toBlob(
        (blob) => {
          if (!blob) throw new Error('Failed to generate blob');
          const url = URL.createObjectURL(blob);
          resolve({ blob, url, previewUrl: url, width: TARGET_WIDTH, height: TARGET_HEIGHT, upscale: legacyUpscaleMetadata() });
        },
        mimeType,
        0.9
      );
    }
  });
};

export const generateUnderbase = async (
  processedImageUrl: string,
  format: 'PNG' | 'SVG' | 'JPG',
): Promise<{ blob: Blob; url: string }> => {
  try {
    return await generateUnderbaseInWorker(processedImageUrl, format);
  } catch (error) {
    console.warn('Underbase worker failed; retrying on main thread.', error);
    return generateUnderbaseOnMainThread(processedImageUrl, format);
  }
};

const compositeMockupOnMainThread = async (
  shirtImageSrc: string,
  designSrc: string,
  placement: { x: number; y: number; width: number; height: number },
  outputFormat: 'PNG' | 'JPG'
): Promise<{ blob: Blob; url: string }> => {
  // Use local loader for both to avoid CORS/Taint issues
  const [shirtImg, designImg] = await Promise.all([
    loadImageLocal(shirtImageSrc), // local /public file - no crossOrigin
    loadImageLocal(designSrc),     // blob URL - no crossOrigin needed
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = shirtImg.naturalWidth || shirtImg.width;
  canvas.height = shirtImg.naturalHeight || shirtImg.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context for mockup');

  ctx.drawImage(shirtImg, 0, 0);

  const px = (placement.x / 100) * canvas.width;
  const py = (placement.y / 100) * canvas.height;
  const pw = (placement.width / 100) * canvas.width;
  const ph = (placement.height / 100) * canvas.height;

  const dAspect = designImg.naturalWidth / designImg.naturalHeight;
  const bAspect = pw / ph;
  let dw: number, dh: number;
  if (dAspect > bAspect) {
    dw = pw;
    dh = pw / dAspect;
  } else {
    dh = ph;
    dw = ph * dAspect;
  }
  const dx = px + (pw - dw) / 2;
  const dy = py + (ph - dh) / 2;

  ctx.drawImage(designImg, dx, dy, dw, dh);

  const mimeType = outputFormat === 'JPG' ? 'image/jpeg' : 'image/png';
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('Failed to generate mockup blob'));
        resolve({ blob, url: URL.createObjectURL(blob) });
      },
      mimeType,
      0.92
    );
  });
};

export const compositeMockup = async (
  shirtImageSrc: string,
  designSrc: string,
  placement: { x: number; y: number; width: number; height: number },
  outputFormat: 'PNG' | 'JPG',
): Promise<{ blob: Blob; url: string }> => {
  try {
    return await compositeMockupInWorker(shirtImageSrc, designSrc, placement, outputFormat);
  } catch (error) {
    console.warn('Mockup worker failed; retrying on main thread.', error);
    return compositeMockupOnMainThread(shirtImageSrc, designSrc, placement, outputFormat);
  }
};
