import { calculateUpscaleRatio } from './upscaleEngine';

export type UpscaleQualityLevel = 'ready' | 'good' | 'caution' | 'extreme';

export interface UpscaleQualityAssessment {
  ratio: number;
  level: UpscaleQualityLevel;
  blocksDownload: boolean;
  detail: string;
}

const formatRatio = (ratio: number) => Number(ratio.toFixed(1));

export const assessUpscaleQuality = (
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): UpscaleQualityAssessment => {
  if (!sourceWidth || !sourceHeight) {
    return {
      ratio: 1,
      level: 'ready',
      blocksDownload: false,
      detail: 'Source size is being checked.',
    };
  }

  const rawRatio = calculateUpscaleRatio(sourceWidth, sourceHeight, targetWidth, targetHeight);
  const ratio = formatRatio(rawRatio);
  if (rawRatio <= 1.05) {
    return {
      ratio: 1,
      level: 'ready',
      blocksDownload: false,
      detail: 'Source size fits this product target.',
    };
  }

  if (rawRatio <= 2) {
    return {
      ratio,
      level: 'good',
      blocksDownload: false,
      detail: `Upscaled ${ratio}x from ${sourceWidth} x ${sourceHeight}px. Good for this selected size.`,
    };
  }

  if (rawRatio <= 4) {
    return {
      ratio,
      level: 'caution',
      blocksDownload: false,
      detail: `Upscaled ${ratio}x from ${sourceWidth} x ${sourceHeight}px. Fine detail may look soft at full print size.`,
    };
  }

  return {
    ratio,
    level: 'extreme',
    blocksDownload: false,
    detail: `This image needs ${ratio}x enlargement. Download is allowed, but fine detail may look soft or artificial.`,
  };
};
