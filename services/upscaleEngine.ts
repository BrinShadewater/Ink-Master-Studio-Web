export type UpscaleMethod = 'none' | 'local-progressive' | 'ai';

export interface UpscaleResultMetadata {
  method: UpscaleMethod;
  ratio: number;
  sourceSize: [number, number];
  targetSize: [number, number];
}

export interface ProgressiveResizePass {
  width: number;
  height: number;
}

export const calculateUpscaleRatio = (
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): number => Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight, 1);

const roundRatio = (ratio: number): number => Number(ratio.toFixed(1));

export const buildUpscaleMetadata = (
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): UpscaleResultMetadata => {
  const ratio = calculateUpscaleRatio(sourceWidth, sourceHeight, targetWidth, targetHeight);

  return {
    method: ratio > 1.05 ? 'local-progressive' : 'none',
    ratio: ratio > 1.05 ? roundRatio(ratio) : 1,
    sourceSize: [sourceWidth, sourceHeight],
    targetSize: [targetWidth, targetHeight],
  };
};

export const planProgressiveResize = (
  sourceWidth: number,
  sourceHeight: number,
  scale: number,
): ProgressiveResizePass[] => {
  const safeScale = Math.max(scale, 1);
  const targetWidth = Math.round(sourceWidth * safeScale);
  const targetHeight = Math.round(sourceHeight * safeScale);
  const passes: ProgressiveResizePass[] = [];

  let width = sourceWidth;
  let height = sourceHeight;

  while (width < targetWidth || height < targetHeight) {
    const nextScale = Math.min(2, targetWidth / width, targetHeight / height);
    width = Math.min(targetWidth, Math.round(width * nextScale));
    height = Math.min(targetHeight, Math.round(sourceHeight * (width / sourceWidth)));

    if (height < targetHeight && width === targetWidth) {
      height = targetHeight;
    }

    passes.push({ width, height });
  }

  return passes;
};
