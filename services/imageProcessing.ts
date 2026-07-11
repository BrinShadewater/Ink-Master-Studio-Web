import { ProcessingSettings, ProcessedResult, OutputFormat, EdgeBehavior, DetailLevel, ResizeMode, ShirtColor } from '../types';
import { TARGET_WIDTH, TARGET_HEIGHT } from '../constants';
import {
  compositeMockupInWorker,
  generateUnderbaseInWorker,
  processImageInWorker,
  ProcessImageWorkerOptions,
} from './imageProcessingWorkerClient';
import { calculateDesignPlacement } from './designPlacement';
import { buildUpscaleMetadata } from './upscaleEngine';
// @ts-ignore
import ImageTracer from 'imagetracerjs';
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

const applyFloodFill = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  targetR: number,
  targetG: number,
  targetB: number,
  tolerance: number
) => {
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  const enqueue = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const idx = y * width + x;
    if (visited[idx]) return;
    visited[idx] = 1;
    queue[tail++] = idx;
  };

  for (let x = 0; x < width; x++) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  const limit = tolerance * 2.55;

  while (head < tail) {
    const idx = queue[head++];
    const pxIdx = idx * 4;
    const a = data[pxIdx + 3];

    if (a === 0) {
      const x = idx % width;
      const y = Math.floor(idx / width);
      enqueue(x + 1, y);
      enqueue(x - 1, y);
      enqueue(x, y + 1);
      enqueue(x, y - 1);
      continue;
    }

    const r = data[pxIdx];
    const g = data[pxIdx + 1];
    const b = data[pxIdx + 2];

    const diff = Math.max(
      Math.abs(r - targetR),
      Math.abs(g - targetG),
      Math.abs(b - targetB)
    );

    if (diff <= limit) {
      data[pxIdx + 3] = 0;
      const x = idx % width;
      const y = Math.floor(idx / width);
      enqueue(x + 1, y);
      enqueue(x - 1, y);
      enqueue(x, y + 1);
      enqueue(x, y - 1);
    }
  }
};

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
};

const applySharpen = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number // 0 to 100
) => {
  if (amount <= 0) return;
  
  const mix = amount / 100; // Normalization
  
  const input = new Uint8ClampedArray(data);
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      
      for (let c = 0; c < 3; c++) {
        const val = 
           -1 * input[((y - 1) * width + x) * 4 + c] +
           -1 * input[((y + 1) * width + x) * 4 + c] +
           -1 * input[(y * width + (x - 1)) * 4 + c] +
           -1 * input[(y * width + (x + 1)) * 4 + c] +
            5 * input[idx + c];
        
        data[idx + c] = Math.min(255, Math.max(0, 
            input[idx + c] * (1 - mix) + val * mix
        ));
      }
    }
  }
};

// --- FEATURE 5: COLOR REPLACEMENT ---
const applyColorReplacements = (
    data: Uint8ClampedArray,
    replacements: ProcessingSettings['colorReplacements']
  ) => {
    if (!replacements || replacements.length === 0) return;

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 10) continue; // skip transparent

      const r = data[i], g = data[i+1], b = data[i+2];

      for (const rep of replacements) {
        const sr = parseInt(rep.sourceColor.slice(1,3), 16);
        const sg = parseInt(rep.sourceColor.slice(3,5), 16);
        const sb = parseInt(rep.sourceColor.slice(5,7), 16);
        const tr = parseInt(rep.targetColor.slice(1,3), 16);
        const tg = parseInt(rep.targetColor.slice(3,5), 16);
        const tb = parseInt(rep.targetColor.slice(5,7), 16);

        const limit = rep.tolerance * 2.55;
        const diff = Math.max(
          Math.abs(r - sr),
          Math.abs(g - sg),
          Math.abs(b - sb)
        );

        if (diff <= limit) {
          data[i]   = tr;
          data[i+1] = tg;
          data[i+2] = tb;
          break;
        }
      }
    }
  };

export const processImage = async (
  imageSource: string | HTMLImageElement,
  settings: ProcessingSettings,
  options?: ProcessImageWorkerOptions,
): Promise<ProcessedResult> => {
  return processImageInWorker(imageSource, settings, options);
};

const processImageOnMainThread = async (
  imageSource: string | HTMLImageElement,
  settings: ProcessingSettings
): Promise<ProcessedResult> => {
  let img: HTMLImageElement;
  if (typeof imageSource === 'string') {
    img = await loadImage(imageSource);
  } else {
    img = imageSource;
  }

  const canvas = document.createElement('canvas');
  canvas.width = TARGET_WIDTH;
  canvas.height = TARGET_HEIGHT;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get canvas context');

  const srcWidth = img.naturalWidth || img.width;
  const srcHeight = img.naturalHeight || img.height;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (!settings.preserveTransparency) {
    ctx.fillStyle = settings.canvasBackground === 'black' ? '#000000' : '#ffffff';
    ctx.fillRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT);
  }

  if (settings.resizeMode === ResizeMode.TILE) {
     const pattern = ctx.createPattern(img, 'repeat');
     if (pattern) {
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT);
     } else {
        ctx.drawImage(img, 0, 0, TARGET_WIDTH, TARGET_HEIGHT);
     }
  } else {
      const placement = calculateDesignPlacement({
        sourceWidth: srcWidth,
        sourceHeight: srcHeight,
        targetWidth: TARGET_WIDTH,
        targetHeight: TARGET_HEIGHT,
        resizeMode: settings.resizeMode,
        allowUpscaling: settings.allowUpscaling,
        edit: settings,
      });
      ctx.save();
      ctx.translate(placement.centerX, placement.centerY);
      if (placement.rotationRadians !== 0) ctx.rotate(placement.rotationRadians);
      ctx.drawImage(
        img,
        -placement.drawWidth / 2,
        -placement.drawHeight / 2,
        placement.drawWidth,
        placement.drawHeight,
      );
      ctx.restore();
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // NEW: Color Replacements
  if (settings.colorReplacements && settings.colorReplacements.length > 0) {
    applyColorReplacements(data, settings.colorReplacements);
  }

  // 1. Background Removal
  if (settings.bgRemoval) {
    let targetColor: { r: number; g: number; b: number };

    if (settings.bgColorOverride) {
      targetColor = hexToRgb(settings.bgColorOverride);
    } else if (settings.bgAutoDetect) {
      targetColor = await getDominantColor(img);
    } else {
      targetColor =
        settings.shirtColor === ShirtColor.WHITE
          ? { r: 255, g: 255, b: 255 }
          : { r: 0, g: 0, b: 0 };
    }

    applyFloodFill(
      data,
      canvas.width,
      canvas.height,
      targetColor.r,
      targetColor.g,
      targetColor.b,
      settings.bgRemovalTolerance
    );
  }

  // 2. Sharpening
  if (settings.sharpness > 0) {
      applySharpen(data, canvas.width, canvas.height, settings.sharpness);
  }

  // 3. Raster Processing Loop
  const threshold = settings.threshold;
  const isHardEdge = settings.edgeBehavior === EdgeBehavior.HARD;
  const isCleanCrisper = settings.detailLevel === DetailLevel.CLEAN_CRISPER;
  const noiseIntensity = settings.noise;
  const grainIntensity = settings.grain;

  const needsLoop =
    settings.shirtColor !== ShirtColor.NONE ||
    noiseIntensity > 0 ||
    grainIntensity > 0 ||
    settings.preserveTransparency;

  if (needsLoop) {
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const originalAlpha = data[i + 3];

      let alpha = originalAlpha;

      if (settings.shirtColor === ShirtColor.BLACK) {
        const maxRGB = Math.max(r, g, b);
        alpha = maxRGB;
        if (settings.transparencyBoost > 1.0) {
          alpha = Math.min(255, alpha * settings.transparencyBoost);
        }
        if (alpha < threshold) {
          alpha = 0;
        } else {
          if (isHardEdge) {
            alpha = 255;
          } else {
            alpha = ((alpha - threshold) / (255 - threshold)) * 255;
          }
        }
        if (isCleanCrisper && alpha < 50) alpha = 0;
        if (settings.convertToWhite) {
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
        }
      } else if (settings.shirtColor === ShirtColor.WHITE) {
        const minRGB = Math.min(r, g, b);
        alpha = 255 - minRGB;
        if (alpha < threshold) {
          alpha = 0;
        } else {
          if (isHardEdge) {
            alpha = 255;
          } else {
            alpha = ((alpha - threshold) / (255 - threshold)) * 255;
          }
        }
      }

      if (settings.preserveTransparency) {
        alpha = Math.min(alpha, originalAlpha);
      }

      if (noiseIntensity > 0 && alpha > 0) {
        const noise = (Math.random() - 0.5) * noiseIntensity * 2.5;
        if (settings.shirtColor === ShirtColor.NONE) {
          data[i] = Math.max(0, Math.min(255, r + noise));
          data[i + 1] = Math.max(0, Math.min(255, g + noise));
          data[i + 2] = Math.max(0, Math.min(255, b + noise));
        } else {
          alpha = Math.max(0, Math.min(255, alpha + noise));
        }
      }

      if (grainIntensity > 0 && alpha > 0) {
        if (Math.random() * 100 < grainIntensity / 2) alpha = 0;
      }

      data[i + 3] = alpha;
    }
  }

  // Commit raster changes back to canvas
  ctx.putImageData(imageData, 0, 0);

  // --- FEATURE 7: EDGE FEATHERING ---
  if (settings.edgeFeather > 0) {
    // Use CSS filter blur on a temp canvas for edge softening
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      tempCtx.filter = `blur(${settings.edgeFeather}px)`;
      tempCtx.drawImage(canvas, 0, 0);
      // Clear original and redraw blurred version
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(tempCanvas, 0, 0);
    }
  }

  // 4. Vectorization (Optional)
  if (settings.vectorize) {
    return new Promise((resolve) => {
        // PERFORMANCE OPTIMIZATION:
        // Tracing 4200x5100px is too slow for browser (JS).
        // We scale down the raster to a reasonable size (e.g. 1500px longest side) for the tracing engine.
        // Since vectors are scalable, we can just save it with the original dimensions in the SVG attributes.
        const traceCanvas = document.createElement('canvas');
        const MAX_TRACE_DIM = 1280;
        const scale = Math.min(MAX_TRACE_DIM / TARGET_WIDTH, MAX_TRACE_DIM / TARGET_HEIGHT);
        
        traceCanvas.width = TARGET_WIDTH * scale;
        traceCanvas.height = TARGET_HEIGHT * scale;
        const traceCtx = traceCanvas.getContext('2d');
        if (traceCtx) {
            traceCtx.drawImage(canvas, 0, 0, traceCanvas.width, traceCanvas.height);
            const traceData = traceCtx.getImageData(0, 0, traceCanvas.width, traceCanvas.height);
            
            // Map detail slider (0-100) to error thresholds (10-0.1)
            // Higher slider = Lower error (More detail)
            const detailFactor = (100 - settings.vectorizeDetail) / 10;
            const ltres = Math.max(0.1, detailFactor); 
            const qtres = Math.max(0.1, detailFactor);
            
            const options = {
                ltres: ltres,
                qtres: qtres,
                pathomit: 8,
                colorsampling: 2, // Deterministic
                numberofcolors: settings.vectorizeColors,
                blurradius: settings.vectorizeBlur,
                strokewidth: 0,
                viewbox: true,
                scale: 1 / scale // Inverse scale to restore physical dimensions in path data
            };

            const svgString = ImageTracer.imagedataToSVG(traceData, options);
            
            // Force width/height attributes to match Print Master size
            // ImageTracer puts width/height based on input data usually, we want to override for Print size
            // But if we used 'scale', the coordinate system is already restored.
            // We just need to ensure the SVG tag has the right width/height attributes.
            
            // Simple replace to ensure dimensions are explicit if needed, 
            // but ImageTracer's output usually contains viewBox.
            
            const blob = new Blob([svgString], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            resolve({ blob, url, previewUrl: url, width: TARGET_WIDTH, height: TARGET_HEIGHT, upscale: legacyUpscaleMetadata() });
        } else {
             // Fallback if context fails
             resolve(exportRaster(canvas, settings));
        }
    });
  }

  return exportRaster(canvas, settings);
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
