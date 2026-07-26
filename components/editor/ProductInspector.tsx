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
  onExport?: () => void;
  mode?: 'easy' | 'advanced';
  dispatch: (command: EditorCommand) => void;
  onRetry: () => void;
  onReturnToDesign: () => void;
}

export type ProductPlacementPresetId = 'standard-front' | 'left-chest' | 'oversized-front';

const productPlacementPresets: Record<ProductPlacementPresetId, {
  label: string;
  placement: TShirtProductVariant['placement'];
}> = {
  'standard-front': {
    label: 'Standard front',
    placement: { x: 0.5, y: 0.5, scale: 0.72, rotation: 0 },
  },
  'left-chest': {
    label: 'Left chest',
    placement: { x: 0.28, y: 0.27, scale: 0.32, rotation: 0 },
  },
  'oversized-front': {
    label: 'Oversized front',
    placement: { x: 0.5, y: 0.52, scale: 1.05, rotation: 0 },
  },
};

export const createProductPlacementPresetCommand = (
  presetId: ProductPlacementPresetId,
): EditorCommand => ({
  type: 'set-product-placement',
  placement: productPlacementPresets[presetId].placement,
  historyGroup: `product-preset:${presetId}`,
});

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

const actionClass = 'h-11 border border-neutral-700 px-3 text-xs font-medium text-neutral-200 transition hover:border-neutral-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400';
const darkGarmentSlugs = new Set(['black', 'navy', 'charcoal', 'burgundy', 'cardinal', 'forest-green', 'military-green', 'red', 'royal-blue']);

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
  const smallestSourceEdge = Math.min(...imageAssets.map((asset) => Math.min(asset.width, asset.height)));
  const preset = getTShirtExportPreset('printify-full-front');
  const renderedSide = resolveTShirtExportGeometry(preset, product.placement).renderedSide;
  const scale = renderedSide / Math.max(1, smallestSourceEdge);
  return { smallestSourceEdge, scale, status: scale <= 1 ? 'ready' as const : scale <= 2 ? 'review' as const : 'enhance' as const };
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
  onExport = () => undefined,
  mode = 'advanced',
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
  const needsBackgroundRemoval = Boolean(
    analysis && !analysis.hasTransparency && analysis.edgeBackground.isUniform,
  );
  const readinessTitle = readiness?.status === 'ready'
    ? 'Ready at this size'
    : readiness?.status === 'review'
      ? 'Check sharpness at this size'
      : readiness
        ? 'Artwork needs more resolution'
        : 'Readiness unavailable';
  const readinessDescription = readiness?.status === 'ready'
    ? 'The export uses less than the available artwork resolution.'
    : readiness?.status === 'review'
      ? 'The export enlarges the artwork. Check small details before production.'
      : readiness
        ? 'The export enlarges the artwork enough to soften visible details.'
        : 'Add raster artwork to calculate print readiness.';
  const visiblePlacementPresets: ProductPlacementPresetId[] = mode === 'advanced'
    ? ['standard-front', 'left-chest', 'oversized-front']
    : ['standard-front', 'left-chest'];

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
        <section className={`grid gap-3 border p-3 ${readiness?.status === 'ready' ? 'border-emerald-900/70 bg-emerald-950/20' : readiness?.status === 'review' ? 'border-amber-900/70 bg-amber-950/20' : 'border-red-900/70 bg-red-950/20'}`} aria-labelledby="product-readiness-title">
          <div className="flex items-center justify-between gap-3">
            <h3 id="product-readiness-title" className="text-xs font-medium text-neutral-100">{readinessTitle}</h3>
            <span className={`text-[10px] font-semibold uppercase ${readiness?.status === 'ready' ? 'text-emerald-300' : readiness?.status === 'review' ? 'text-amber-300' : 'text-red-300'}`}>
              {readiness?.status === 'ready' ? 'Ready' : readiness?.status === 'review' ? 'Review' : 'Improve'}
            </span>
          </div>
          <p className="text-xs leading-5 text-neutral-300">{readinessDescription}</p>
          {mode === 'advanced' && readiness ? (
            <p className="text-xs leading-5 text-neutral-500">
              Smallest source edge: {readiness.smallestSourceEdge}px. The production PNG uses {readiness.scale.toFixed(2)}x of that available detail.
            </p>
          ) : null}
          {needsBackgroundRemoval ? (
            <button type="button" className={`${actionClass} justify-self-start`} onClick={onRemoveBackground}>Remove background</button>
          ) : readiness?.status === 'ready' ? (
            <button type="button" className={`${actionClass} justify-self-start border-emerald-500 bg-emerald-500 text-neutral-950 hover:border-emerald-300 hover:text-neutral-950`} onClick={onExport}>Create print-ready PNG</button>
          ) : (
            <button type="button" className={`${actionClass} justify-self-start`} onClick={onEnhanceResolution}>Enhance resolution</button>
          )}
        </section>

        <section aria-labelledby="product-color-title" className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 id="product-color-title" className="text-xs font-medium text-neutral-300">Shirt color</h3>
            <span className="text-xs text-neutral-400">{activeMockup.name}</span>
          </div>
          <div className="grid grid-cols-5 gap-2">
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

        {mode === 'advanced' ? <><section className="grid gap-3" aria-labelledby="product-artwork-title">
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
        </section></> : null}

        {mode === 'advanced' ? <section className="grid gap-3 border border-neutral-800 bg-neutral-950/70 p-3" aria-labelledby="artwork-checks-title">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 id="artwork-checks-title" className="text-xs font-medium text-neutral-100">Artwork checks</h3>
              <p className="mt-1 text-xs leading-5 text-neutral-500">Check the background, shirt contrast, and print color count.</p>
            </div>
            <span className="text-[10px] font-semibold uppercase text-cyan-300">Live check</span>
          </div>
          {analysis ? <><div className="grid gap-1 border-t border-neutral-800 pt-3 text-xs">
            <div className="flex items-center justify-between gap-3"><span className="text-neutral-400">Background</span><span className={analysis.hasTransparency ? 'font-medium text-emerald-300' : analysis.edgeBackground.isUniform ? 'font-medium text-amber-300' : 'font-medium text-neutral-300'}>{analysis.hasTransparency ? 'Transparent' : analysis.edgeBackground.isUniform ? 'Review edge' : 'Mixed edge'}</span></div>
            {!analysis.hasTransparency && analysis.edgeBackground.isUniform ? <div className="flex items-center justify-between gap-3"><span className="text-neutral-500">Uniform {analysis.edgeBackground.tone} edge detected.</span><button type="button" className="text-xs font-medium text-cyan-300 hover:text-cyan-200" onClick={onRemoveBackground}>Remove background</button></div> : null}
          </div>
          <div className="grid gap-1 border-t border-neutral-800 pt-3 text-xs">
            <div className="flex items-center justify-between gap-3"><span className="text-neutral-400">Contrast on this shirt</span><span className={contrastRisk ? 'font-medium text-amber-300' : 'font-medium text-emerald-300'}>{contrastRisk ? 'May blend in' : 'Visible'}</span></div>
            <p className="text-neutral-500">{darkGarmentSlugs.has(product.mockupSlug) ? 'Checked against a dark garment.' : 'Checked against a light garment.'}</p>
          </div>
          <div className="grid gap-1 border-t border-neutral-800 pt-3 text-xs">
            <div className="flex items-center justify-between gap-3"><span className="text-neutral-400">Print color count</span><span className="font-medium text-neutral-200">{analysis.palette.length} sampled colors</span></div>
            <p className="text-neutral-500">Vector trace: {analysis.vectorSuitability === 'strong' ? 'strong candidate' : analysis.vectorSuitability === 'possible' ? 'possible candidate' : 'best kept raster'}.</p>
          </div></> : <p role="status" className="border-t border-neutral-800 pt-3 text-xs text-neutral-500">Analyzing artwork checks...</p>}
        </section> : null}

        <section aria-labelledby="product-placement-title" className="grid gap-3">
          <div>
            <h3 id="product-placement-title" className="text-xs font-medium text-neutral-300">Artwork placement</h3>
            <p className="mt-1 text-xs leading-5 text-neutral-500">Choose a starting position, then adjust the artwork directly on the mockup.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {visiblePlacementPresets.map((presetId) => (
              <button
                key={presetId}
                type="button"
                className={actionClass}
                onClick={() => {
                  dispatch(createProductPlacementPresetCommand(presetId));
                  endHistoryGroup();
                }}
              >
                {productPlacementPresets[presetId].label}
              </button>
            ))}
          </div>
        </section>

        {mode === 'advanced' ? <><div className="grid grid-cols-2 gap-3">
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
        /></> : null}

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
