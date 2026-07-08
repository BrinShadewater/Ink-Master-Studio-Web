import {
  DetailLevel,
  EdgeBehavior,
  OutputFormat,
  ProcessingSettings,
  ResizeMode,
  ShirtColor,
} from '../types';
import { TARGET_HEIGHT, TARGET_WIDTH } from '../constants';
// @ts-ignore
import ImageTracer from 'imagetracerjs';
// @ts-ignore
import { jsPDF } from 'jspdf';

interface ProcessRequest {
  kind: 'process';
  id: string;
  source: Blob;
  settings: ProcessingSettings;
}

interface UnderbaseRequest {
  kind: 'underbase';
  id: string;
  source: Blob;
  format: 'PNG' | 'SVG' | 'JPG';
}

interface MockupRequest {
  kind: 'mockup';
  id: string;
  shirt: Blob;
  design: Blob;
  placement: { x: number; y: number; width: number; height: number };
  outputFormat: 'PNG' | 'JPG';
}

type WorkerRequest = ProcessRequest | UnderbaseRequest | MockupRequest;

const postProgress = (id: string, percent: number, stage: string) => {
  self.postMessage({
    id,
    type: 'progress',
    progress: { percent: Math.max(0, Math.min(100, Math.round(percent))), stage },
  });
};

const yieldToWorker = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
};

const getDominantColor = async (bitmap: ImageBitmap): Promise<{ r: number; g: number; b: number }> => {
  const size = 50;
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return { r: 0, g: 0, b: 0 };
  context.drawImage(bitmap, 0, 0, size, size);
  const imageData = context.getImageData(0, 0, size, size).data;
  const colorCounts: Record<string, { count: number; r: number; g: number; b: number }> = {};

  for (let index = 0; index < imageData.length; index += 4) {
    if (imageData[index + 3] < 128) continue;
    const r = Math.round(imageData[index] / 32) * 32;
    const g = Math.round(imageData[index + 1] / 32) * 32;
    const b = Math.round(imageData[index + 2] / 32) * 32;
    const key = `${r},${g},${b}`;
    colorCounts[key] = colorCounts[key]
      ? { ...colorCounts[key], count: colorCounts[key].count + 1 }
      : { count: 1, r, g, b };
  }

  return Object.values(colorCounts).sort((a, b) => b.count - a.count)[0] ?? { r: 0, g: 0, b: 0 };
};

const applyColorReplacements = async (
  id: string,
  data: Uint8ClampedArray,
  replacements: ProcessingSettings['colorReplacements'],
) => {
  if (!replacements || replacements.length === 0) return;

  const chunkSize = 240_000;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] >= 10) {
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];

      for (const replacement of replacements) {
        const source = hexToRgb(replacement.sourceColor);
        const target = hexToRgb(replacement.targetColor);
        const limit = replacement.tolerance * 2.55;
        const diff = Math.max(Math.abs(r - source.r), Math.abs(g - source.g), Math.abs(b - source.b));

        if (diff <= limit) {
          data[index] = target.r;
          data[index + 1] = target.g;
          data[index + 2] = target.b;
          break;
        }
      }
    }

    if (index > 0 && index % chunkSize === 0) {
      postProgress(id, 34 + (index / data.length) * 6, 'Applying color changes');
      await yieldToWorker();
    }
  }
};

const applyFloodFill = async (
  id: string,
  data: Uint8ClampedArray,
  width: number,
  height: number,
  targetR: number,
  targetG: number,
  targetB: number,
  tolerance: number,
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
    queue[tail] = idx;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  const limit = tolerance * 2.55;
  let iterations = 0;

  while (head < tail) {
    const idx = queue[head];
    head += 1;
    const pxIdx = idx * 4;
    const alpha = data[pxIdx + 3];

    if (alpha === 0) {
      const x = idx % width;
      const y = Math.floor(idx / width);
      enqueue(x + 1, y);
      enqueue(x - 1, y);
      enqueue(x, y + 1);
      enqueue(x, y - 1);
    } else {
      const r = data[pxIdx];
      const g = data[pxIdx + 1];
      const b = data[pxIdx + 2];
      const diff = Math.max(Math.abs(r - targetR), Math.abs(g - targetG), Math.abs(b - targetB));

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

    iterations += 1;
    if (iterations % 80_000 === 0) {
      postProgress(id, 40 + Math.min(15, (head / Math.max(1, width * height)) * 15), 'Removing background');
      await yieldToWorker();
    }
  }
};

const applySharpen = async (
  id: string,
  data: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
) => {
  if (amount <= 0) return;
  const mix = amount / 100;
  const input = new Uint8ClampedArray(data);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const value =
          -1 * input[((y - 1) * width + x) * 4 + channel]
          + -1 * input[((y + 1) * width + x) * 4 + channel]
          + -1 * input[(y * width + (x - 1)) * 4 + channel]
          + -1 * input[(y * width + (x + 1)) * 4 + channel]
          + 5 * input[idx + channel];
        data[idx + channel] = Math.min(255, Math.max(0, input[idx + channel] * (1 - mix) + value * mix));
      }
    }

    if (y % 80 === 0) {
      postProgress(id, 56 + (y / height) * 10, 'Sharpening artwork');
      await yieldToWorker();
    }
  }
};

const applyRasterTreatment = async (
  id: string,
  data: Uint8ClampedArray,
  settings: ProcessingSettings,
) => {
  const threshold = settings.threshold;
  const isHardEdge = settings.edgeBehavior === EdgeBehavior.HARD;
  const isCleanCrisper = settings.detailLevel === DetailLevel.CLEAN_CRISPER;
  const needsLoop =
    settings.shirtColor !== ShirtColor.NONE
    || settings.noise > 0
    || settings.grain > 0
    || settings.preserveTransparency;

  if (!needsLoop) return;

  const chunkSize = 240_000;
  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const originalAlpha = data[index + 3];
    let alpha = originalAlpha;

    if (settings.shirtColor === ShirtColor.BLACK) {
      const maxRgb = Math.max(r, g, b);
      alpha = settings.transparencyBoost > 1 ? Math.min(255, maxRgb * settings.transparencyBoost) : maxRgb;
      if (alpha < threshold) alpha = 0;
      else alpha = isHardEdge ? 255 : ((alpha - threshold) / (255 - threshold)) * 255;
      if (isCleanCrisper && alpha < 50) alpha = 0;
      if (settings.convertToWhite) {
        data[index] = 255;
        data[index + 1] = 255;
        data[index + 2] = 255;
      }
    } else if (settings.shirtColor === ShirtColor.WHITE) {
      const minRgb = Math.min(r, g, b);
      alpha = 255 - minRgb;
      if (alpha < threshold) alpha = 0;
      else alpha = isHardEdge ? 255 : ((alpha - threshold) / (255 - threshold)) * 255;
    }

    if (settings.preserveTransparency) alpha = Math.min(alpha, originalAlpha);

    if (settings.noise > 0 && alpha > 0) {
      const noise = (Math.random() - 0.5) * settings.noise * 2.5;
      if (settings.shirtColor === ShirtColor.NONE) {
        data[index] = Math.max(0, Math.min(255, r + noise));
        data[index + 1] = Math.max(0, Math.min(255, g + noise));
        data[index + 2] = Math.max(0, Math.min(255, b + noise));
      } else {
        alpha = Math.max(0, Math.min(255, alpha + noise));
      }
    }

    if (settings.grain > 0 && alpha > 0 && Math.random() * 100 < settings.grain / 2) alpha = 0;
    data[index + 3] = alpha;

    if (index > 0 && index % chunkSize === 0) {
      postProgress(id, 68 + (index / data.length) * 12, 'Building print pixels');
      await yieldToWorker();
    }
  }
};

const blobToDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error ?? new Error('Could not read generated image.'));
  reader.readAsDataURL(blob);
});

const canvasToDataUrl = async (canvas: OffscreenCanvas, type = 'image/png', quality = 0.92) => {
  const blob = await canvas.convertToBlob({ type, quality });
  return blobToDataUrl(blob);
};

const exportRaster = async (
  id: string,
  canvas: OffscreenCanvas,
  settings: ProcessingSettings,
): Promise<{ blob: Blob; previewBlob?: Blob; width: number; height: number }> => {
  postProgress(id, 88, 'Exporting print file');

  if (settings.format === OutputFormat.PDF) {
    const previewBlob = await canvas.convertToBlob({ type: 'image/png' });
    const imageData = await blobToDataUrl(previewBlob);
    const widthInches = TARGET_WIDTH / 300;
    const heightInches = TARGET_HEIGHT / 300;
    const pdf = new jsPDF({
      orientation: widthInches > heightInches ? 'l' : 'p',
      unit: 'in',
      format: [widthInches, heightInches],
    });
    pdf.addImage(imageData, 'PNG', 0, 0, widthInches, heightInches);
    return {
      blob: pdf.output('blob'),
      previewBlob,
      width: TARGET_WIDTH,
      height: TARGET_HEIGHT,
    };
  }

  if (settings.format === OutputFormat.JPG) {
    const exportCanvas = new OffscreenCanvas(TARGET_WIDTH, TARGET_HEIGHT);
    const exportContext = exportCanvas.getContext('2d');
    if (!exportContext) throw new Error('Could not export JPG.');
    exportContext.fillStyle = settings.shirtColor === ShirtColor.BLACK ? '#000000' : '#ffffff';
    exportContext.fillRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT);
    exportContext.drawImage(canvas, 0, 0);
    return {
      blob: await exportCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 }),
      width: TARGET_WIDTH,
      height: TARGET_HEIGHT,
    };
  }

  if (settings.format === OutputFormat.SVG) {
    const dataUrl = await canvasToDataUrl(canvas);
    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${TARGET_WIDTH}" height="${TARGET_HEIGHT}" viewBox="0 0 ${TARGET_WIDTH} ${TARGET_HEIGHT}"><image href="${dataUrl}" x="0" y="0" width="${TARGET_WIDTH}" height="${TARGET_HEIGHT}" /></svg>`;
    return {
      blob: new Blob([svgString], { type: 'image/svg+xml' }),
      previewBlob: await canvas.convertToBlob({ type: 'image/png' }),
      width: TARGET_WIDTH,
      height: TARGET_HEIGHT,
    };
  }

  return {
    blob: await canvas.convertToBlob({ type: 'image/png' }),
    width: TARGET_WIDTH,
    height: TARGET_HEIGHT,
  };
};

const processImage = async ({ id, source, settings }: ProcessRequest) => {
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error('Background image processing is not supported in this browser.');
  }

  postProgress(id, 5, 'Loading artwork');
  const image = await createImageBitmap(source);
  const canvas = new OffscreenCanvas(TARGET_WIDTH, TARGET_HEIGHT);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Could not start the image processor.');

  postProgress(id, 18, 'Sizing artwork');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  if (settings.resizeMode === ResizeMode.TILE) {
    const pattern = context.createPattern(image, 'repeat');
    if (pattern) {
      context.fillStyle = pattern;
      context.fillRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT);
    } else {
      context.drawImage(image, 0, 0, TARGET_WIDTH, TARGET_HEIGHT);
    }
  } else {
    let drawWidth: number;
    let drawHeight: number;
    let offsetX: number;
    let offsetY: number;

    if (settings.resizeMode === ResizeMode.STRETCH) {
      drawWidth = TARGET_WIDTH;
      drawHeight = TARGET_HEIGHT;
      offsetX = 0;
      offsetY = 0;
    } else if (settings.resizeMode === ResizeMode.COVER) {
      const scale = Math.max(TARGET_WIDTH / image.width, TARGET_HEIGHT / image.height);
      drawWidth = image.width * scale;
      drawHeight = image.height * scale;
      offsetX = (TARGET_WIDTH - drawWidth) / 2;
      offsetY = (TARGET_HEIGHT - drawHeight) / 2;
    } else {
      let scale = Math.min(TARGET_WIDTH / image.width, TARGET_HEIGHT / image.height);
      if (!settings.allowUpscaling && scale > 1) scale = 1;
      drawWidth = image.width * scale;
      drawHeight = image.height * scale;
      offsetX = (TARGET_WIDTH - drawWidth) / 2;
      offsetY = (TARGET_HEIGHT - drawHeight) / 2;
    }

    context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  }

  postProgress(id, 30, 'Reading pixels');
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  await applyColorReplacements(id, data, settings.colorReplacements);

  if (settings.bgRemoval) {
    let targetColor: { r: number; g: number; b: number };
    if (settings.bgColorOverride) targetColor = hexToRgb(settings.bgColorOverride);
    else if (settings.bgAutoDetect) targetColor = await getDominantColor(image);
    else targetColor = settings.shirtColor === ShirtColor.WHITE ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };

    await applyFloodFill(
      id,
      data,
      canvas.width,
      canvas.height,
      targetColor.r,
      targetColor.g,
      targetColor.b,
      settings.bgRemovalTolerance,
    );
  }

  await applySharpen(id, data, canvas.width, canvas.height, settings.sharpness);
  await applyRasterTreatment(id, data, settings);

  postProgress(id, 82, 'Compositing artwork');
  context.putImageData(imageData, 0, 0);

  if (settings.edgeFeather > 0) {
    const tempCanvas = new OffscreenCanvas(canvas.width, canvas.height);
    const tempContext = tempCanvas.getContext('2d');
    if (tempContext) {
      tempContext.filter = `blur(${settings.edgeFeather}px)`;
      tempContext.drawImage(canvas, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(tempCanvas, 0, 0);
    }
  }

  if (settings.vectorize) {
    postProgress(id, 88, 'Tracing vector paths');
    const traceCanvas = new OffscreenCanvas(1280 * (TARGET_WIDTH / Math.max(TARGET_WIDTH, TARGET_HEIGHT)), 1280);
    const traceContext = traceCanvas.getContext('2d', { willReadFrequently: true });
    if (traceContext) {
      traceContext.drawImage(canvas, 0, 0, traceCanvas.width, traceCanvas.height);
      const traceData = traceContext.getImageData(0, 0, traceCanvas.width, traceCanvas.height);
      const detailFactor = (100 - settings.vectorizeDetail) / 10;
      const svgString = ImageTracer.imagedataToSVG(traceData, {
        ltres: Math.max(0.1, detailFactor),
        qtres: Math.max(0.1, detailFactor),
        pathomit: 8,
        colorsampling: 2,
        numberofcolors: settings.vectorizeColors,
        blurradius: settings.vectorizeBlur,
        strokewidth: 0,
        viewbox: true,
        scale: TARGET_HEIGHT / 1280,
      });
      return {
        blob: new Blob([svgString], { type: 'image/svg+xml' }),
        previewBlob: await canvas.convertToBlob({ type: 'image/png' }),
        width: TARGET_WIDTH,
        height: TARGET_HEIGHT,
      };
    }
  }

  return exportRaster(id, canvas, settings);
};

const generateUnderbase = async ({ id, source, format }: UnderbaseRequest) => {
  postProgress(id, 20, 'Loading underbase source');
  const image = await createImageBitmap(source);
  const canvas = new OffscreenCanvas(image.width, image.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Could not start underbase generator.');

  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] > 10) {
      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
    }
    if (index > 0 && index % 240_000 === 0) {
      postProgress(id, 20 + (index / data.length) * 60, 'Building underbase');
      await yieldToWorker();
    }
  }
  context.putImageData(imageData, 0, 0);

  if (format === 'SVG') {
    const dataUrl = await canvasToDataUrl(canvas);
    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}"><image href="${dataUrl}" x="0" y="0" width="${canvas.width}" height="${canvas.height}" /></svg>`;
    return { blob: new Blob([svgString], { type: 'image/svg+xml' }) };
  }

  return {
    blob: await canvas.convertToBlob({
      type: format === 'JPG' ? 'image/jpeg' : 'image/png',
      quality: 0.9,
    }),
  };
};

const compositeMockup = async ({ id, shirt, design, placement, outputFormat }: MockupRequest) => {
  postProgress(id, 15, 'Loading mockup artwork');
  const [shirtImage, designImage] = await Promise.all([
    createImageBitmap(shirt),
    createImageBitmap(design),
  ]);
  const canvas = new OffscreenCanvas(shirtImage.width, shirtImage.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not start mockup generator.');

  context.drawImage(shirtImage, 0, 0);
  const px = (placement.x / 100) * canvas.width;
  const py = (placement.y / 100) * canvas.height;
  const pw = (placement.width / 100) * canvas.width;
  const ph = (placement.height / 100) * canvas.height;
  const designAspect = designImage.width / designImage.height;
  const boxAspect = pw / ph;
  const drawWidth = designAspect > boxAspect ? pw : ph * designAspect;
  const drawHeight = designAspect > boxAspect ? pw / designAspect : ph;
  const dx = px + (pw - drawWidth) / 2;
  const dy = py + (ph - drawHeight) / 2;

  postProgress(id, 70, 'Compositing mockup');
  context.drawImage(designImage, dx, dy, drawWidth, drawHeight);
  return {
    blob: await canvas.convertToBlob({
      type: outputFormat === 'JPG' ? 'image/jpeg' : 'image/png',
      quality: 0.92,
    }),
  };
};

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  const work = request.kind === 'process'
    ? processImage(request)
    : request.kind === 'underbase'
      ? generateUnderbase(request)
      : compositeMockup(request);

  void work
    .then((result) => {
      postProgress(request.id, 100, 'Done');
      self.postMessage({
        id: request.id,
        type: 'complete',
        ...result,
      });
    })
    .catch((error) => {
      self.postMessage({
        id: request.id,
        type: 'error',
        message: error instanceof Error ? error.message : 'Image processing failed.',
      });
    });
};
