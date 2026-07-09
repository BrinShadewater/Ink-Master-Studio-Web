import { ProcessingSettings, ProcessedResult } from '../types';
import { dataUrlToBlob } from './dataUrls';
import type { UpscaleResultMetadata } from './upscaleEngine';

export interface ProcessingProgress {
  percent: number;
  stage: string;
}

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

type WorkerMessage =
  | { id: string; type: 'progress'; progress: ProcessingProgress }
  | {
      id: string;
      type: 'complete';
      blob: Blob;
      previewBlob?: Blob;
      width?: number;
      height?: number;
      upscale: UpscaleResultMetadata;
    }
  | { id: string; type: 'error'; message: string };

export interface ProcessImageWorkerOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  onProgress?: (progress: ProcessingProgress) => void;
}

const imageSourceToBlob = async (imageSource: string | HTMLImageElement): Promise<Blob> => {
  if (typeof imageSource === 'string') {
    if (imageSource.startsWith('data:')) return dataUrlToBlob(imageSource);
    const response = await fetch(imageSource);
    if (!response.ok) throw new Error('Could not read artwork for processing.');
    return response.blob();
  }

  const canvas = document.createElement('canvas');
  canvas.width = imageSource.naturalWidth || imageSource.width;
  canvas.height = imageSource.naturalHeight || imageSource.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare artwork for processing.');
  context.drawImage(imageSource, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('Could not prepare artwork for processing.'));
      else resolve(blob);
    }, 'image/png');
  });
};

const createWorkerRequest = async <T>(
  request: { id: string } & T,
  options: ProcessImageWorkerOptions,
): Promise<WorkerMessage & { type: 'complete' }> => {
  if (typeof Worker === 'undefined') {
    throw new Error('This browser does not support background image processing.');
  }

  const worker = new Worker(new URL('../workers/imageProcessing.worker.ts', import.meta.url), {
    type: 'module',
  });
  const { id } = request;
  let settled = false;
  const isDev = Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);

  if (isDev) console.time(`[InkMaster] image worker ${id}`);

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      settled = true;
      window.clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
      worker.terminate();
      if (isDev) console.timeEnd(`[InkMaster] image worker ${id}`);
    };

    const fail = (error: Error) => {
      if (settled) return;
      cleanup();
      reject(error);
    };

    const abort = () => fail(new DOMException('Image processing was cancelled.', 'AbortError'));
    const timeout = window.setTimeout(
      () => fail(new Error('Image processing stalled. Try again or use a smaller source file.')),
      options.timeoutMs ?? 120_000,
    );

    options.signal?.addEventListener('abort', abort, { once: true });

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.id !== id || settled) return;

      if (message.type === 'progress') {
        options.onProgress?.(message.progress);
        return;
      }

      if (message.type === 'error') {
        fail(new Error(message.message));
        return;
      }

      cleanup();
      resolve(message);
    };

    worker.onerror = (event) => {
      fail(new Error(event.message || 'Image processing worker failed.'));
    };

    worker.postMessage(request);
  });
};

export const processImageInWorker = async (
  imageSource: string | HTMLImageElement,
  settings: ProcessingSettings,
  options: ProcessImageWorkerOptions = {},
): Promise<ProcessedResult> => {
  const source = await imageSourceToBlob(imageSource);
  const id = `process_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const message = await createWorkerRequest<ProcessRequest>({ kind: 'process', id, source, settings }, options);
  const url = URL.createObjectURL(message.blob);
  const previewUrl = message.previewBlob ? URL.createObjectURL(message.previewBlob) : url;
  return {
    blob: message.blob,
    url,
    previewUrl,
    width: message.width ?? 0,
    height: message.height ?? 0,
    upscale: message.upscale,
  };
};

export const generateUnderbaseInWorker = async (
  processedImageUrl: string,
  format: 'PNG' | 'SVG' | 'JPG',
): Promise<{ blob: Blob; url: string }> => {
  const source = await imageSourceToBlob(processedImageUrl);
  const id = `underbase_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const message = await createWorkerRequest<UnderbaseRequest>({ kind: 'underbase', id, source, format }, {});
  return { blob: message.blob, url: URL.createObjectURL(message.blob) };
};

export const compositeMockupInWorker = async (
  shirtImageSrc: string,
  designSrc: string,
  placement: { x: number; y: number; width: number; height: number },
  outputFormat: 'PNG' | 'JPG',
): Promise<{ blob: Blob; url: string }> => {
  const [shirt, design] = await Promise.all([
    imageSourceToBlob(shirtImageSrc),
    imageSourceToBlob(designSrc),
  ]);
  const id = `mockup_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const message = await createWorkerRequest<MockupRequest>({ kind: 'mockup', id, shirt, design, placement, outputFormat }, {});
  return { blob: message.blob, url: URL.createObjectURL(message.blob) };
};
