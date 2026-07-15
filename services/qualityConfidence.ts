import { PrintifyProductPreset } from '../specs/printify';
import { ArtworkAnalysis } from '../types';
import { UpscaleQualityAssessment } from './upscaleQuality';

export interface QualityConfidenceItem {
  id: 'upscale' | 'background' | 'provider';
  label: string;
  detail: string;
  state: 'pass' | 'warn' | 'strong-warning';
}

export interface QualityConfidenceSummary {
  label: 'Ready' | 'Good with uprez' | 'Check softness' | 'Strong warning';
  tone: 'ready' | 'good' | 'caution' | 'strong-warning';
  detail: string;
  items: QualityConfidenceItem[];
}

export const buildQualityConfidence = (
  analysis: ArtworkAnalysis | null,
  upscaleQuality: UpscaleQualityAssessment,
  selectedProduct: PrintifyProductPreset,
  backgroundChoice: 'keep' | null,
): QualityConfidenceSummary => {
  const hasBackgroundPrompt = analysis ? !analysis.hasTransparency && backgroundChoice !== 'keep' : false;
  const providerDetail = `${selectedProduct.validation.product} with ${selectedProduct.validation.provider} was checked on ${selectedProduct.validation.checkedAt}. Other providers can use different print areas.`;

  const items: QualityConfidenceItem[] = [
    {
      id: 'upscale',
      label: upscaleQuality.level === 'ready'
        ? 'No uprez needed'
        : upscaleQuality.level === 'good'
          ? 'Local uprez looks reasonable'
          : upscaleQuality.level === 'caution'
            ? 'Fine detail may soften'
            : 'Extreme enlargement',
      detail: upscaleQuality.detail,
      state: upscaleQuality.level === 'caution'
        ? 'warn'
        : upscaleQuality.level === 'extreme'
          ? 'strong-warning'
          : 'pass',
    },
    {
      id: 'background',
      label: hasBackgroundPrompt ? 'Background choice needed' : 'Background is intentional',
      detail: hasBackgroundPrompt
        ? 'Choose keep if the artwork should print as a rectangle, or open cleanup for transparent edges.'
        : analysis?.hasTransparency
          ? 'Transparency is detected and will be preserved in the PNG.'
          : 'The current background choice will print as part of the design.',
      state: hasBackgroundPrompt ? 'warn' : 'pass',
    },
    {
      id: 'provider',
      label: 'Provider preset checked',
      detail: providerDetail,
      state: 'pass',
    },
  ];

  const strongest = items.some((item) => item.state === 'strong-warning')
    ? 'strong-warning'
    : items.some((item) => item.state === 'warn')
      ? 'caution'
      : upscaleQuality.level === 'good'
        ? 'good'
        : 'ready';

  if (strongest === 'strong-warning') {
    return {
      label: 'Strong warning',
      tone: 'strong-warning',
      detail: 'Download is allowed, but the source is far below the target size. Use a higher-resolution source when print sharpness matters.',
      items,
    };
  }

  if (strongest === 'caution') {
    return {
      label: 'Check softness',
      tone: 'caution',
      detail: 'The file can be downloaded, but review the print preview and background before uploading.',
      items,
    };
  }

  if (strongest === 'good') {
    return {
      label: 'Good with uprez',
      tone: 'good',
      detail: 'The source is being enlarged locally by a reasonable amount for this product.',
      items,
    };
  }

  return {
    label: 'Ready',
    tone: 'ready',
    detail: 'The source fits this product target without quality warnings.',
    items,
  };
};
