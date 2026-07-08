export type UpscaleQualityLevel = 'ready' | 'good' | 'caution' | 'stop';

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

  const rawRatio = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight, 1);
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
    level: 'stop',
    blocksDownload: true,
    detail: `This source is too small for a reliable full-size print. Use an image at least ${Math.ceil(targetWidth / 4)} x ${Math.ceil(targetHeight / 4)}px.`,
  };
};
