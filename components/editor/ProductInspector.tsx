import { useEffect, useState } from 'react';
import type { EditorCommand } from '../../editor/history';
import type { DesignVariation, EditorAsset } from '../../editor/model';
import {
  TSHIRT_MOCKUPS,
  getTShirtMockup,
} from '../../editor/productCatalog';
import type { ProductMockupLoadStatus } from '../../editor/productMockupLoader';
import {
  DEFAULT_PRODUCT_PLACEMENT,
  PRODUCT_PLACEMENT_BOUNDS,
  type ProductPreviewMode,
  type TShirtPrintMethod,
  type TShirtProductVariant,
} from '../../editor/productModel';
import { getTShirtExportPreset, resolveTShirtExportGeometry } from '../../editor/tshirtExportModel';
import { analyzeArtwork } from '../../services/artworkAnalysis';
import type { ArtworkAnalysis } from '../../types';
import { NumberControl, RangeControl } from './TransformControls';

export interface ProductInspectorProps {
  product: TShirtProductVariant;
  mockupStatus: ProductMockupLoadStatus;
  mockupError: string | null;
  artworkError: string | null;
  variations?: Array<{ id: string; name: string }>;
  previewMode?: ProductPreviewMode;
  onPreviewModeChange?: (mode: ProductPreviewMode) => void;
  artworkVariation?: DesignVariation | null;
  assetsById?: Record<string, EditorAsset>;
  artworkUrl?: string | null;
  onEnhanceResolution?: () => void;
  onRemoveBackground?: () => void;
  dispatch: (command: EditorCommand) => void;
  onRetry: () => void;
  onReturnToDesign: () => void;
}

export const createCenterProductPlacementCommand = (
  product: TShirtProductVariant,
): EditorCommand => ({
  type: 'set-product-placement',
  placement: { ...product.placement, x: 0.5, y: 0.5 },
  historyGroup: 'product-center',
});

const productPlacementPresets = [
  { id: 'standard-front', label: 'Standard front', placement: { x: 0.5, y: 0.5, scale: 0.72, rotation: 0 } },
  { id: 'left-chest', label: 'Left chest', placement: { x: 0.28, y: 0.27, scale: 0.32, rotation: 0 } },
  { id: 'oversized-front', label: 'Oversized front', placement: { x: 0.5, y: 0.52, scale: 1.05, rotation: 0 } },
] as const;

export type ProductPlacementPresetId = typeof productPlacementPresets[number]['id'];

export const createProductPlacementPresetCommand = (
  presetId: ProductPlacementPresetId,
): EditorCommand => {
  const preset = productPlacementPresets.find((candidate) => candidate.id === presetId);
  if (!preset) throw new Error('Unknown product placement preset.');
  return {
    type: 'set-product-placement',
    placement: { ...preset.placement },
    historyGroup: `product-preset:${preset.id}`,
  };
};

export const createResetProductPlacementCommand = (): EditorCommand => ({
  type: 'set-product-placement',
  placement: DEFAULT_PRODUCT_PLACEMENT,
  historyGroup: 'product-reset',
});

const percentageBounds = { min: 0, max: 100, step: 1 } as const;
const scaleBounds = {
  min: PRODUCT_PLACEMENT_BOUNDS.scale.min * 100,
  max: PRODUCT_PLACEMENT_BOUNDS.scale.max * 100,
  step: 1,
} as const;
const rotationBounds = {
  ...PRODUCT_PLACEMENT_BOUNDS.rotation,
  step: 1,
} as const;

const actionClass = 'h-9 border border-neutral-700 px-3 text-xs font-medium text-neutral-200 transition hover:border-neutral-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400';
const darkGarmentSlugs = new Set(['black', 'navy', 'charcoal', 'burgundy', 'cardinal', 'forest-green', 'military-green', 'red', 'royal-blue']);
const printMethodOptions: Array<{ id: TShirtPrintMethod; name: string; description: string }> = [
  { id: 'dtg', name: 'DTG', description: 'Detailed, full-color artwork printed directly on the garment.' },
  { id: 'dtf', name: 'DTF transfer', description: 'Durable full-color transfer for light and dark garments.' },
  { id: 'vinyl', name: 'Cut vinyl', description: 'Best for bold, solid-color artwork with simple shapes.' },
];

export const getProductReadinessEstimate = (
  variation: DesignVariation | null | undefined,
  product: TShirtProductVariant,
  assetsById: Record<string, EditorAsset> | undefined,
) => {
  const imageAssets = variation?.layers
    .filter((layer): layer is Extract<DesignVariation['layers'][number], { type: 'image' }> => layer.type === 'image')
    .map((layer) => assetsById?.[layer.assetId])
    .filter((asset): asset is EditorAsset => Boolean(asset)) ?? [];
  if (imageAssets.length === 0) return null;
  const sourceSide = Math.min(...imageAssets.map((asset) => Math.min(asset.width, asset.height)));
  const preset = getTShirtExportPreset('printify-full-front');
  const renderedSide = resolveTShirtExportGeometry(preset, product.placement).renderedSide;
  const scale = renderedSide / Math.max(1, sourceSide);
  return { sourceSide, scale, status: scale <= 1 ? 'ready' as const : scale <= 2 ? 'review' as const : 'enhance' as const };
};

export const getPrintMethodGuidance = (
  method: TShirtPrintMethod,
  paletteSize: number,
) => {
  if (method === 'vinyl') {
    return paletteSize <= 2
      ? { status: 'ready' as const, label: 'Good fit', detail: 'This palette is suitable for a simple cut-vinyl treatment.' }
      : { status: 'review' as const, label: 'Simplify colors', detail: 'Cut vinyl works best with one or two solid colors. Trace or reduce colors before production.' };
  }
  if (method === 'dtf') {
    return { status: 'ready' as const, label: 'Full color supported', detail: 'DTF works well for detailed, full-color artwork on light and dark garments.' };
  }
  return { status: 'ready' as const, label: 'Full color supported', detail: 'DTG suits detailed, full-color art. Use Print intent for a softer on-garment estimate.' };
};

export interface PrintLensFinding {
  id: 'resolution' | 'background' | 'contrast' | 'alpha-edge' | 'transparent-fade' | 'method';
  severity: 'review' | 'fix';
  title: string;
  detail: string;
}

export const getPrintLensFindings = (
  readiness: ReturnType<typeof getProductReadinessEstimate>,
  analysis: ArtworkAnalysis,
  contrastRisk: boolean,
  methodGuidance: ReturnType<typeof getPrintMethodGuidance>,
  method: TShirtPrintMethod,
  darkGarment: boolean,
): PrintLensFinding[] => {
  const findings: PrintLensFinding[] = [];
  if (readiness?.status === 'enhance') {
    findings.push({ id: 'resolution', severity: 'fix', title: 'Enhance resolution', detail: `The artwork needs about ${readiness.scale.toFixed(1)}x enlargement for this full-front print.` });
  } else if (readiness?.status === 'review') {
    findings.push({ id: 'resolution', severity: 'review', title: 'Review print size', detail: `The artwork will be enlarged about ${readiness.scale.toFixed(1)}x for this print.` });
  }
  if (!analysis.hasTransparency && analysis.edgeBackground.isUniform) {
    findings.push({ id: 'background', severity: 'review', title: 'Review background', detail: 'A uniform edge background may print with the artwork.' });
  }
  if (contrastRisk) {
    findings.push({ id: 'contrast', severity: 'review', title: 'Review garment contrast', detail: 'The artwork may blend into this shirt color.' });
  }
  if (analysis.hasTransparency && analysis.transparencyCoverage < 0.02) {
    findings.push({ id: 'alpha-edge', severity: 'review', title: 'Inspect edge transparency', detail: 'Only a thin transparent edge was found. Check for light or dark halos.' });
  }
  if (method === 'dtg' && darkGarment && (analysis.partialTransparencyCoverage ?? 0) >= 0.02) {
    findings.push({ id: 'transparent-fade', severity: 'review', title: 'Review transparent fade', detail: 'A broad semi-transparent area may print unevenly over a dark-garment underbase. Consider an opaque halftone fade.' });
  }
  if (methodGuidance.status === 'review') {
    findings.push({ id: 'method', severity: 'review', title: methodGuidance.label, detail: methodGuidance.detail });
  }
  return findings;
};

export const getGarmentContrastCoverage = (analysis: ArtworkAnalysis) => {
  const atRisk = TSHIRT_MOCKUPS.filter((mockup) => (
    darkGarmentSlugs.has(mockup.slug)
      ? analysis.contrastRisk.darkGarment
      : analysis.contrastRisk.lightGarment
  ));
  return {
    suitableCount: TSHIRT_MOCKUPS.length - atRisk.length,
    atRisk: atRisk.map((mockup) => mockup.name),
    recommendation: analysis.contrastRisk.darkGarment && !analysis.contrastRisk.lightGarment
      ? 'Best on lighter garment colors.'
      : analysis.contrastRisk.lightGarment && !analysis.contrastRisk.darkGarment
        ? 'Best on darker garment colors.'
        : atRisk.length === 0
          ? 'Suitable across the available garment colors.'
          : 'Review each garment color before listing variants.',
  };
};

export const ProductInspector = ({
  product,
  mockupStatus,
  mockupError,
  artworkError,
  variations = [],
  previewMode = 'rgb',
  onPreviewModeChange = () => undefined,
  artworkVariation = null,
  assetsById = {},
  artworkUrl = null,
  onEnhanceResolution = () => undefined,
  onRemoveBackground = () => undefined,
  dispatch,
  onRetry,
  onReturnToDesign,
}: ProductInspectorProps) => {
  const activeMockup = getTShirtMockup(product.mockupSlug);
  const endHistoryGroup = () => dispatch({ type: 'end-history-group' });
  const updatePlacement = (
    placement: TShirtProductVariant['placement'],
    historyGroup: string,
  ) => dispatch({ type: 'set-product-placement', placement, historyGroup });
  const failure = mockupStatus === 'failed' || Boolean(artworkError);
  const readiness = getProductReadinessEstimate(artworkVariation, product, assetsById);
  const [analysis, setAnalysis] = useState<ArtworkAnalysis | null>(null);

  useEffect(() => {
    if (!artworkUrl) {
      setAnalysis(null);
      return undefined;
    }
    let isCurrent = true;
    void analyzeArtwork(artworkUrl).then(
      (nextAnalysis) => {
        if (isCurrent) setAnalysis(nextAnalysis);
      },
      () => {
        if (isCurrent) setAnalysis(null);
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [artworkUrl]);
  const contrastRisk = darkGarmentSlugs.has(product.mockupSlug)
    ? analysis?.contrastRisk.darkGarment
    : analysis?.contrastRisk.lightGarment;
  const methodGuidance = analysis
    ? getPrintMethodGuidance(product.printMethod, analysis.palette.length)
    : null;
  const printLensFindings = analysis && methodGuidance
    ? getPrintLensFindings(
      readiness,
      analysis,
      Boolean(contrastRisk),
      methodGuidance,
      product.printMethod,
      darkGarmentSlugs.has(product.mockupSlug),
    )
    : [];
  const printLensFixes = printLensFindings.filter((finding) => finding.severity === 'fix');
  const printLensReviews = printLensFindings.filter((finding) => finding.severity === 'review');
  const garmentCoverage = analysis ? getGarmentContrastCoverage(analysis) : null;

  return (
    <>
      <div className="sticky top-0 z-10 flex h-12 items-center justify-between border-b border-neutral-800 bg-neutral-900 px-4">
        <h2 className="text-sm font-semibold text-neutral-100">Product</h2>
        <button
          type="button"
          className={actionClass}
          onClick={() => {
            dispatch(createResetProductPlacementCommand());
            endHistoryGroup();
          }}
        >
          Reset
        </button>
      </div>

      <div className="grid gap-5 p-4">
        <section aria-labelledby="product-color-title" className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 id="product-color-title" className="text-xs font-medium text-neutral-300">Shirt color</h3>
            <span className="text-xs text-neutral-400">{activeMockup.name}</span>
          </div>
          <div className="grid grid-cols-6 gap-2">
            {TSHIRT_MOCKUPS.map((mockup) => {
              const selected = mockup.slug === product.mockupSlug;
              return (
                <button
                  key={mockup.slug}
                  type="button"
                  data-product-swatch="true"
                  aria-label={mockup.name}
                  aria-pressed={selected}
                  title={mockup.name}
                  className={`aspect-square w-full border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                    selected ? 'border-emerald-400 ring-1 ring-emerald-400' : 'border-neutral-600'
                  }`}
                  style={{ backgroundColor: mockup.swatch }}
                  onClick={() => dispatch({
                    type: 'set-product-mockup',
                    mockupSlug: mockup.slug,
                  })}
                />
              );
            })}
          </div>
          <p className="text-xs leading-5 text-neutral-500">Choose a garment color, then drag the artwork directly on the mockup to place it within the printable area.</p>
        </section>

        <section className="grid gap-3" aria-labelledby="product-artwork-title">
          <div>
            <h3 id="product-artwork-title" className="text-xs font-medium text-neutral-300">Artwork for {activeMockup.name}</h3>
            <p className="mt-1 text-xs leading-5 text-neutral-500">Assign a light or dark design to this shirt color without creating another product.</p>
          </div>
          <select
            className="h-9 border border-neutral-700 bg-neutral-950 px-2 text-xs text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            aria-label={`Artwork for ${activeMockup.name}`}
            value={product.colorVariationIds[product.mockupSlug] ?? ''}
            onChange={(event) => dispatch({
              type: 'set-product-color-artwork',
              mockupSlug: product.mockupSlug,
              variationId: event.currentTarget.value || null,
            })}
          >
            <option value="">Current variant</option>
            {variations.map((variation) => <option key={variation.id} value={variation.id}>{variation.name}</option>)}
          </select>
        </section>

        <section className="grid gap-2" aria-labelledby="product-preview-title">
          <div>
            <h3 id="product-preview-title" className="text-xs font-medium text-neutral-300">Mockup color</h3>
            <p className="mt-1 text-xs leading-5 text-neutral-500">RGB is vivid for storefronts. Print intent is a softer on-garment estimate.</p>
          </div>
          <div className="grid grid-cols-2 border border-neutral-700" role="group" aria-label="Mockup color mode">
            {(['rgb', 'print'] as const).map((mode) => <button key={mode} type="button" className={`h-9 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400 ${previewMode === mode ? 'bg-emerald-500 text-neutral-950' : 'bg-neutral-950 text-neutral-300 hover:bg-neutral-800'}`} aria-pressed={previewMode === mode} onClick={() => onPreviewModeChange(mode)}>{mode === 'rgb' ? 'RGB' : 'Print intent'}</button>)}
          </div>
        </section>

        <section className="grid gap-2" aria-labelledby="product-print-method-title">
          <div>
            <h3 id="product-print-method-title" className="text-xs font-medium text-neutral-300">Print method</h3>
            <p className="mt-1 text-xs leading-5 text-neutral-500">Print Lens adapts its guidance to this production method.</p>
          </div>
          <select
            className="h-9 border border-neutral-700 bg-neutral-950 px-2 text-xs text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            aria-label="Print method"
            value={product.printMethod}
            onChange={(event) => dispatch({ type: 'set-product-print-method', printMethod: event.currentTarget.value as TShirtPrintMethod })}
          >
            {printMethodOptions.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}
          </select>
          <p className="text-xs leading-5 text-neutral-500">{printMethodOptions.find((method) => method.id === product.printMethod)?.description}</p>
        </section>

        {readiness ? <section className={`grid gap-2 border p-3 ${readiness.status === 'ready' ? 'border-emerald-900/70 bg-emerald-950/20' : readiness.status === 'review' ? 'border-amber-900/70 bg-amber-950/20' : 'border-red-900/70 bg-red-950/20'}`} aria-labelledby="product-readiness-title">
          <div className="flex items-center justify-between gap-3"><h3 id="product-readiness-title" className="text-xs font-medium text-neutral-100">Full-front print check</h3><span className={`text-[10px] font-semibold uppercase ${readiness.status === 'ready' ? 'text-emerald-300' : readiness.status === 'review' ? 'text-amber-300' : 'text-red-300'}`}>{readiness.status === 'ready' ? 'Good' : readiness.status === 'review' ? 'Review' : 'Enhance'}</span></div>
          <p className="text-xs leading-5 text-neutral-400">Largest source edge: {readiness.sourceSide}px. Estimated scale for a 15 in x 18 in full-front PNG: {readiness.scale.toFixed(2)}x.</p>
          {readiness.status === 'enhance' ? <button type="button" className={`${actionClass} justify-self-start`} onClick={onEnhanceResolution}>Enhance resolution</button> : null}
        </section> : null}

        {analysis ? <section className="grid gap-3 border border-neutral-800 bg-neutral-950/70 p-3" aria-labelledby="print-lens-title">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 id="print-lens-title" className="text-xs font-medium text-neutral-100">Print Lens</h3>
              <p className="mt-1 text-xs leading-5 text-neutral-500">Checks the current art against this garment and production method.</p>
            </div>
            <span className={`text-[10px] font-semibold uppercase ${printLensFixes.length ? 'text-red-300' : printLensReviews.length ? 'text-amber-300' : 'text-emerald-300'}`}>{printLensFixes.length ? 'Fix before export' : printLensReviews.length ? 'Review recommended' : 'Ready'}</span>
          </div>
          {printLensFindings.length ? <div className="grid gap-2 border border-neutral-800 bg-neutral-900/70 p-2.5" aria-label="Print Lens findings">
            {printLensFindings.map((finding) => <div key={finding.id} className="grid gap-0.5 text-xs">
              <div className="flex items-center justify-between gap-3"><span className="font-medium text-neutral-200">{finding.title}</span><span className={`text-[10px] font-semibold uppercase ${finding.severity === 'fix' ? 'text-red-300' : 'text-amber-300'}`}>{finding.severity}</span></div>
              <p className="leading-5 text-neutral-500">{finding.detail}</p>
            </div>)}
          </div> : <p className="border border-emerald-900/60 bg-emerald-950/20 px-2.5 py-2 text-xs leading-5 text-emerald-100">No issues need attention for this artwork, garment, and print method.</p>}
          <div className="grid gap-1 border-t border-neutral-800 pt-3 text-xs">
            <div className="flex items-center justify-between gap-3"><span className="text-neutral-400">Background</span><span className={analysis.hasTransparency ? 'font-medium text-emerald-300' : analysis.edgeBackground.isUniform ? 'font-medium text-amber-300' : 'font-medium text-neutral-300'}>{analysis.hasTransparency ? 'Transparent' : analysis.edgeBackground.isUniform ? 'Review edge' : 'Mixed edge'}</span></div>
            {!analysis.hasTransparency && analysis.edgeBackground.isUniform ? <div className="flex items-center justify-between gap-3"><span className="text-neutral-500">Uniform {analysis.edgeBackground.tone} edge detected.</span><button type="button" className="text-xs font-medium text-cyan-300 hover:text-cyan-200" onClick={onRemoveBackground}>Remove background</button></div> : null}
          </div>
          <div className="grid gap-1 border-t border-neutral-800 pt-3 text-xs">
            <div className="flex items-center justify-between gap-3"><span className="text-neutral-400">Garment contrast</span><span className={contrastRisk ? 'font-medium text-amber-300' : 'font-medium text-emerald-300'}>{contrastRisk ? 'May blend in' : 'Visible'}</span></div>
            <p className="text-neutral-500">{darkGarmentSlugs.has(product.mockupSlug) ? 'Checked against a dark garment.' : 'Checked against a light garment.'}</p>
          </div>
          {garmentCoverage ? <div className="grid gap-1 border-t border-neutral-800 pt-3 text-xs">
            <div className="flex items-center justify-between gap-3"><span className="text-neutral-400">Variant coverage</span><span className={garmentCoverage.atRisk.length ? 'font-medium text-amber-300' : 'font-medium text-emerald-300'}>{garmentCoverage.suitableCount} / {TSHIRT_MOCKUPS.length} colors</span></div>
            <p className="text-neutral-500">{garmentCoverage.recommendation}</p>
            {garmentCoverage.atRisk.length ? <p className="text-neutral-500">Review: {garmentCoverage.atRisk.join(', ')}.</p> : null}
          </div> : null}
          <div className="grid gap-1 border-t border-neutral-800 pt-3 text-xs">
            <div className="flex items-center justify-between gap-3"><span className="text-neutral-400">Color complexity</span><span className="font-medium text-neutral-200">{analysis.palette.length} sampled colors</span></div>
            <p className="text-neutral-500">Vector trace: {analysis.vectorSuitability === 'strong' ? 'strong candidate' : analysis.vectorSuitability === 'possible' ? 'possible candidate' : 'best kept raster'}.</p>
          </div>
          {methodGuidance ? <div className="grid gap-1 border-t border-neutral-800 pt-3 text-xs">
            <div className="flex items-center justify-between gap-3"><span className="text-neutral-400">{printMethodOptions.find((method) => method.id === product.printMethod)?.name}</span><span className={methodGuidance.status === 'review' ? 'font-medium text-amber-300' : 'font-medium text-emerald-300'}>{methodGuidance.label}</span></div>
            <p className="text-neutral-500">{methodGuidance.detail}</p>
          </div> : null}
        </section> : null}

        <section aria-labelledby="product-placement-title" className="grid gap-3">
          <div>
            <h3 id="product-placement-title" className="text-xs font-medium text-neutral-300">Artwork placement</h3>
            <p className="mt-1 text-xs leading-5 text-neutral-500">Start with a standard placement, then drag on the mockup for the final position.</p>
          </div>
          <div className="grid gap-2">
            {productPlacementPresets.map((preset) => <button
              key={preset.id}
              type="button"
              className={actionClass}
              onClick={() => {
                dispatch(createProductPlacementPresetCommand(preset.id));
                endHistoryGroup();
              }}
            >
              {preset.label}
            </button>)}
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <NumberControl
            id="product-position-x"
            label="X position"
            value={Math.round(product.placement.x * 100)}
            bounds={percentageBounds}
            onChange={(value) => updatePlacement(
              { ...product.placement, x: value / 100 },
              'product-position-x',
            )}
            onEnd={endHistoryGroup}
          />
          <NumberControl
            id="product-position-y"
            label="Y position"
            value={Math.round(product.placement.y * 100)}
            bounds={percentageBounds}
            onChange={(value) => updatePlacement(
              { ...product.placement, y: value / 100 },
              'product-position-y',
            )}
            onEnd={endHistoryGroup}
          />
        </div>

        <RangeControl
          id="product-scale"
          label="Scale"
          value={Math.round(product.placement.scale * 100)}
          suffix="%"
          bounds={scaleBounds}
          onChange={(value) => updatePlacement(
            { ...product.placement, scale: value / 100 },
            'product-scale',
          )}
          onEnd={endHistoryGroup}
        />
        <RangeControl
          id="product-rotation"
          label="Rotation"
          value={Math.round(product.placement.rotation)}
          suffix="°"
          bounds={rotationBounds}
          onChange={(value) => updatePlacement(
            { ...product.placement, rotation: value },
            'product-rotation',
          )}
          onEnd={endHistoryGroup}
        />

        {failure ? (
          <div role="alert" className="grid gap-3 border border-red-900 bg-red-950/40 p-3 text-xs text-red-200">
            {mockupStatus === 'failed' && mockupError ? <p>{mockupError}</p> : null}
            {artworkError ? <p>{artworkError}</p> : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={actionClass} onClick={onRetry}>Retry</button>
              <button type="button" className={actionClass} onClick={onReturnToDesign}>
                Return to design
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
};
