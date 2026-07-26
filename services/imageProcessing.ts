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
