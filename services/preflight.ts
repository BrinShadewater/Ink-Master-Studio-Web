import {
  ArtworkAnalysis,
  OutputFormat,
  PreflightFinding,
  PrintSpecification,
  ProcessingSettings,
} from '../types';

const finding = (
  id: string,
  severity: PreflightFinding['severity'],
  title: string,
  message: string,
  action: string,
): PreflightFinding => ({ id, severity, title, message, action });

export const calculateEffectiveDpi = (
  widthPixels: number,
  heightPixels: number,
  specification: PrintSpecification,
) => Math.round(Math.min(
  widthPixels / Math.max(0.1, specification.widthInches),
  heightPixels / Math.max(0.1, specification.heightInches),
));

export const evaluatePreflight = (
  analysis: ArtworkAnalysis,
  specification: PrintSpecification,
  settings: ProcessingSettings,
): PreflightFinding[] => {
  const effectiveDpi = calculateEffectiveDpi(analysis.width, analysis.height, specification);
  const resolution = effectiveDpi < 150
    ? finding(
        'resolution',
        'critical',
        'Resolution is below production minimum',
        `${effectiveDpi} DPI at ${specification.widthInches}×${specification.heightInches} in.`,
        'Reduce print dimensions or replace the source artwork with a larger file.',
      )
    : effectiveDpi < specification.targetDpi
      ? finding(
          'resolution',
          'warning',
          'Resolution is below the shop target',
          `${effectiveDpi} DPI at ${specification.widthInches}×${specification.heightInches} in; target is ${specification.targetDpi} DPI.`,
          'Reduce print dimensions, accept the softer result, or use higher-resolution artwork.',
        )
      : finding(
          'resolution',
          'pass',
          'Resolution meets target',
          `${effectiveDpi} DPI at ${specification.widthInches}×${specification.heightInches} in.`,
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

  const requestedWidthPixels = specification.widthInches * specification.targetDpi;
  const requestedHeightPixels = specification.heightInches * specification.targetDpi;
  const upscaleRatio = Math.max(requestedWidthPixels / analysis.width, requestedHeightPixels / analysis.height);
  const upscaling = upscaleRatio > 3
    ? finding(
        'upscaling',
        'critical',
        'Extreme upscaling required',
        `The requested print needs approximately ${upscaleRatio.toFixed(1)}× enlargement.`,
        'Use higher-resolution artwork or substantially reduce print dimensions.',
      )
    : upscaleRatio > 1.5
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

  const detail = analysis.vectorSuitability === 'weak' && effectiveDpi < 220
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
