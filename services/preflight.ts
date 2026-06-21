import {
  ArtworkAnalysis,
  OutputFormat,
  PreflightFinding,
  PrintSpecification,
  ProductionProfile,
  ProcessingSettings,
} from '../types';

const finding = (
  id: string,
  severity: PreflightFinding['severity'],
  title: string,
  message: string,
  action: string,
): PreflightFinding => ({ id, severity, title, message, action });

const calculateRawEffectiveDpi = (
  widthPixels: number,
  heightPixels: number,
  specification: PrintSpecification,
) => Math.min(
  widthPixels / Math.max(0.1, specification.widthInches),
  heightPixels / Math.max(0.1, specification.heightInches),
);

const formatDpi = (dpi: number) => {
  if (Number.isInteger(dpi)) return String(dpi);
  return (Math.floor(dpi * 10) / 10).toFixed(1);
};

export const calculateEffectiveDpi = (
  widthPixels: number,
  heightPixels: number,
  specification: PrintSpecification,
) => Math.round(calculateRawEffectiveDpi(widthPixels, heightPixels, specification));

export const evaluatePreflight = (
  analysis: ArtworkAnalysis,
  specification: PrintSpecification,
  settings: ProcessingSettings,
  profile: ProductionProfile,
): PreflightFinding[] => {
  const rawEffectiveDpi = calculateRawEffectiveDpi(
    analysis.width,
    analysis.height,
    specification,
  );
  const displayedEffectiveDpi = formatDpi(rawEffectiveDpi);
  const {
    targetDpi,
    warningDpi,
    criticalDpi,
    significantUpscaleRatio,
    extremeUpscaleRatio,
  } = profile.thresholds;
  const resolution = rawEffectiveDpi < criticalDpi
    ? finding(
        'resolution',
        'critical',
        'Resolution is below production minimum',
        `${displayedEffectiveDpi} DPI at ${specification.widthInches}×${specification.heightInches} in; profile minimum is ${criticalDpi} DPI and ideal target is ${targetDpi} DPI.`,
        'Reduce print dimensions or replace the source artwork with a larger file.',
      )
    : rawEffectiveDpi < warningDpi
      ? finding(
          'resolution',
          'warning',
          'Resolution is below the profile tolerance',
          `${displayedEffectiveDpi} DPI at ${specification.widthInches}×${specification.heightInches} in; profile tolerance is ${warningDpi} DPI and ideal target is ${targetDpi} DPI.`,
          'Reduce print dimensions, accept the softer result, or use higher-resolution artwork.',
        )
      : rawEffectiveDpi < targetDpi
        ? finding(
            'resolution',
            'pass',
            'Resolution meets profile tolerance',
            `${displayedEffectiveDpi} DPI meets the ${warningDpi} DPI minimum tolerance but is below the ideal target of ${targetDpi} DPI.`,
            'No action needed.',
          )
        : finding(
            'resolution',
            'pass',
            'Resolution meets the ideal target',
            `${displayedEffectiveDpi} DPI at ${specification.widthInches}×${specification.heightInches} in; ideal target is ${targetDpi} DPI.`,
            'No action needed.',
          );

  const background = !analysis.hasTransparency && analysis.edgeBackground.isUniform && !settings.bgRemoval
    ? finding(
        'background',
        'warning',
        'Solid edge background may print',
        `A ${analysis.edgeBackground.tone} edge background was detected at ${Math.round(analysis.edgeBackground.confidence * 100)}% confidence.`,
        'Enable solid-background removal or confirm that the background is intentional.',
      )
    : finding(
        'background',
        'pass',
        'Background treatment is consistent',
        analysis.hasTransparency ? 'Meaningful transparency is present.' : 'No unresolved uniform edge background was detected.',
        'No action needed.',
      );

  const alphaEdges = analysis.hasTransparency && analysis.transparencyCoverage < 0.02
    ? finding(
        'alpha-edges',
        'warning',
        'Possible edge halo',
        'Only a thin band of transparency was detected around the artwork.',
        'Inspect Before / After on both black and white backgrounds.',
      )
    : finding(
        'alpha-edges',
        'pass',
        'Transparency coverage is stable',
        analysis.hasTransparency ? `${Math.round(analysis.transparencyCoverage * 100)}% of sampled pixels are transparent.` : 'Artwork is fully opaque.',
        'No action needed.',
      );

  const requestedWidthPixels = specification.widthInches * targetDpi;
  const requestedHeightPixels = specification.heightInches * targetDpi;
  const upscaleRatio = Math.max(requestedWidthPixels / analysis.width, requestedHeightPixels / analysis.height);
  const upscaling = upscaleRatio > extremeUpscaleRatio
    ? finding(
        'upscaling',
        'critical',
        'Extreme upscaling required',
        `The requested print needs approximately ${upscaleRatio.toFixed(1)}× enlargement.`,
        'Use higher-resolution artwork or substantially reduce print dimensions.',
      )
    : upscaleRatio > significantUpscaleRatio
      ? finding(
          'upscaling',
          'warning',
          'Significant upscaling required',
          `The requested print needs approximately ${upscaleRatio.toFixed(1)}× enlargement.`,
          'Inspect fine detail at 100% and consider a smaller print.',
        )
      : finding(
          'upscaling',
          'pass',
          'Upscaling is within tolerance',
          upscaleRatio > 1 ? `${upscaleRatio.toFixed(1)}× enlargement is required.` : 'The source is larger than the requested output.',
          'No action needed.',
        );

  const detail = analysis.vectorSuitability === 'weak' && rawEffectiveDpi < 220
    ? finding(
        'fine-detail',
        'warning',
        'Fine detail may soften',
        'Complex artwork and the current effective DPI may lose small texture or line work.',
        'Inspect at print size, reduce dimensions, or simplify the artwork.',
      )
    : finding(
        'fine-detail',
        'pass',
        'Detail risk is acceptable',
        'Artwork complexity is compatible with the requested print size.',
        'No action needed.',
      );

  let format: PreflightFinding;
  if (settings.format === OutputFormat.JPG && settings.preserveTransparency) {
    format = finding(
      'format',
      'warning',
      'JPG cannot preserve transparency',
      'The selected output format will flatten transparent pixels.',
      'Use PNG or SVG, or intentionally disable transparent output.',
    );
  } else if (settings.format === OutputFormat.SVG && !settings.vectorize) {
    format = finding(
      'format',
      'warning',
      'SVG contains embedded raster artwork',
      'The file will be an SVG wrapper rather than true scalable paths.',
      'Enable Make scalable for suitable logo artwork or export PNG.',
    );
  } else {
    format = finding(
      'format',
      'pass',
      'Output format matches treatment',
      `${settings.format} is compatible with the current production setup.`,
      'No action needed.',
    );
  }

  return [resolution, background, alphaEdges, upscaling, detail, format];
};

export const getPreflightGate = (
  findings: PreflightFinding[],
  warningsAcknowledged: boolean,
) => {
  const criticalCount = findings.filter((entry) => entry.severity === 'critical').length;
  const warningCount = findings.filter((entry) => entry.severity === 'warning').length;
  return {
    criticalCount,
    warningCount,
    requiresAcknowledgement: warningCount > 0,
    canExport: criticalCount === 0 && (warningCount === 0 || warningsAcknowledged),
  };
};
