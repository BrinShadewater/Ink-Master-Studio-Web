import type { DecodedImageEntry } from '../../editor/decodedImages';
import type { EditorCommand } from '../../editor/history';
import type { LookRenderCoordinator } from '../../editor/lookRenderCoordinator';
import type {
  CropRect,
  DesignLayer,
  DesignVariation,
  EditorAsset,
  EditorProject,
  EditorTool,
  ImageLayer,
} from '../../editor/model';
import type { ProductMockupLoadStatus } from '../../editor/productMockupLoader';
import type { TShirtProductVariant } from '../../editor/productModel';
import type { ProductPreviewMode } from '../../editor/productModel';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { LooksInspector } from './LooksInspector';
import {
  BackgroundRemovalInspector,
  type BackgroundBrushMode,
} from './BackgroundRemovalInspector';
import type { BackgroundRemovalWorkflow } from './useBackgroundRemovalWorkflow';
import { TraceInspector } from './TraceInspector';
import type { TraceWorkflow } from './useTraceWorkflow';
import { TextInspector } from './TextInspector';
import {
  controlBounds,
  RangeControl,
  TransformControls,
} from './TransformControls';
import { ProductInspector } from './ProductInspector';
import { ResolutionInspector } from './ResolutionInspector';
import type { ResolutionWorkflow } from './useResolutionWorkflow';
import type { ReactNode } from 'react';

export { controlBounds } from './TransformControls';

interface CropEdges {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));

export const cropToEdgePercentages = (crop: CropRect): CropEdges => ({
  left: clamp(Math.round(crop.x * 100), controlBounds.crop.min, controlBounds.crop.max),
  top: clamp(Math.round(crop.y * 100), controlBounds.crop.min, controlBounds.crop.max),
  right: clamp(Math.round((1 - crop.x - crop.width) * 100), controlBounds.crop.min, controlBounds.crop.max),
  bottom: clamp(Math.round((1 - crop.y - crop.height) * 100), controlBounds.crop.min, controlBounds.crop.max),
});

export const edgePercentagesToCrop = (edges: CropEdges): CropRect => {
  const left = clamp(edges.left, controlBounds.crop.min, controlBounds.crop.max);
  const top = clamp(edges.top, controlBounds.crop.min, controlBounds.crop.max);
  const right = clamp(edges.right, controlBounds.crop.min, controlBounds.crop.max);
  const bottom = clamp(edges.bottom, controlBounds.crop.min, controlBounds.crop.max);
  return {
    x: left / 100,
    y: top / 100,
    width: Math.max(5, 100 - left - right) / 100,
    height: Math.max(5, 100 - top - bottom) / 100,
  };
};

export interface EditorInspectorProps {
  project: EditorProject | null;
  variation: DesignVariation | null;
  layer: DesignLayer | null;
  tool: EditorTool;
  assetsById: Record<string, EditorAsset>;
  imagesById: Record<string, DecodedImageEntry>;
  coordinator: LookRenderCoordinator;
  lookError: string | null;
  onRetryLook: () => void;
  backgroundRemoval?: BackgroundRemovalWorkflow | null;
  backgroundBrushMode?: BackgroundBrushMode;
  backgroundBrushSize?: number;
  onBackgroundBrushModeChange?: (mode: BackgroundBrushMode) => void;
  onBackgroundBrushSizeChange?: (size: number) => void;
  onBackgroundDone?: () => void;
  traceWorkflow?: TraceWorkflow | null;
  resolutionWorkflow?: ResolutionWorkflow | null;
  product?: TShirtProductVariant | null;
  productMockupStatus?: ProductMockupLoadStatus;
  productMockupError?: string | null;
  productArtworkError?: string | null;
  productPreviewMode?: ProductPreviewMode;
  onProductPreviewModeChange?: (mode: ProductPreviewMode) => void;
  productArtworkVariation?: DesignVariation | null;
  productArtworkUrl?: string | null;
  onEnhanceProductArtwork?: () => void;
  onRemoveProductArtworkBackground?: () => void;
  onProductExport?: () => void;
  onRetryProduct?: () => void;
  onReturnToDesign?: () => void;
  mode?: 'easy' | 'advanced';
  mobileExpanded?: boolean;
  onMobileExpandedChange?: (expanded: boolean) => void;
  dispatch: (command: EditorCommand) => void;
}

const sectionTitle: Record<EditorTool, string> = {
  select: 'Transform',
  crop: 'Crop',
  adjust: 'Adjustments',
  enhance: 'Enhance resolution',
  looks: 'Looks',
  'remove-background': 'Remove background',
  trace: 'Trace',
  product: 'Product',
};

const toolPurpose: Record<EditorTool, string> = {
  select: 'Place, size, rotate, and align the selected layer.',
  crop: 'Reframe image artwork without changing the canvas size.',
  adjust: 'Correct brightness, contrast, and saturation.',
  enhance: 'Prepare small raster artwork for a larger print area.',
  looks: 'Apply one consistent finish across this variation.',
  'remove-background': 'Create transparent artwork for a clean garment print.',
  trace: 'Convert suitable artwork into scalable vector shapes.',
  product: 'Check placement and color on the selected garment.',
};

const getAdvancedRecommendation = (layer: DesignLayer | null, tool: EditorTool) => {
  if (!layer || tool !== 'select') return null;
  if (layer.type === 'image') {
    return 'Crop first if framing needs work. Use Remove background only for transparency.';
  }
  if (layer.type === 'text') {
    return 'Place the text first. Use Looks only for a variation-wide finish.';
  }
  return 'Place the trace first. Use Looks only for a variation-wide finish.';
};

const basicRecommendations: Record<EditorTool, string> = {
  select: 'Crop if framing needs work, then preview the result on Product.',
  crop: 'Adjust only if the artwork needs correction, then open Product.',
  adjust: 'Preview the corrected artwork on Product.',
  enhance: 'Return to Product and check print readiness.',
  looks: 'Open Product to check the finish on a garment.',
  'remove-background': 'Preview the transparent artwork on Product.',
  trace: 'Open Product to confirm garment placement.',
  product: 'Review readiness, then export the production PNG.',
};

export const getInspectorWorkflowContext = (
  mode: 'easy' | 'advanced',
  layer: DesignLayer | null,
  tool: EditorTool,
) => ({
  stage: tool === 'product' ? 'Step 3 of 3 · Preview and export' : 'Step 2 of 3 · Prepare',
  recommendation: mode === 'easy'
    ? basicRecommendations[tool]
    : getAdvancedRecommendation(layer, tool),
});

const InspectorFrame = ({
  tool,
  mode,
  layer,
  mobileExpanded,
  onMobileExpandedChange,
  children,
}: {
  tool: EditorTool;
  mode: 'easy' | 'advanced';
  layer: DesignLayer | null;
  mobileExpanded: boolean;
  onMobileExpandedChange: (expanded: boolean) => void;
  children: ReactNode;
}) => {
  const workflow = getInspectorWorkflowContext(mode, layer, tool);
  return (
    <aside className={`flex min-h-0 flex-col overflow-hidden border-t border-neutral-800 bg-neutral-900 md:h-full md:border-l md:border-t-0 ${mobileExpanded ? 'h-60' : 'h-14'}`} aria-label="Inspector">
      <div className="shrink-0 border-b border-neutral-800 bg-neutral-950/70 px-3 py-1.5 md:hidden" aria-live="polite">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-studio-measure">
              {mode === 'easy' ? workflow.stage : 'Advanced workspace'}
            </p>
            <p className="truncate text-xs font-semibold text-neutral-200">{sectionTitle[tool]}</p>
          </div>
          <button
            type="button"
            className="flex h-11 shrink-0 items-center gap-1.5 border border-neutral-700 px-3 text-xs font-semibold text-neutral-200 transition hover:border-neutral-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            aria-controls="editor-inspector-content"
            aria-expanded={mobileExpanded}
            onClick={() => onMobileExpandedChange(!mobileExpanded)}
          >
            {mobileExpanded ? 'Collapse' : 'Expand'}
            {mobileExpanded ? <ChevronDown aria-hidden="true" size={16} /> : <ChevronUp aria-hidden="true" size={16} />}
          </button>
        </div>
        {mobileExpanded ? (
          <p className="mt-1 line-clamp-2 text-xs leading-4 text-neutral-300">
            {workflow.recommendation ?? toolPurpose[tool]}
          </p>
        ) : null}
      </div>
      <div className="hidden shrink-0 border-b border-neutral-800 bg-neutral-950/55 px-4 py-2 md:block">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-studio-measure">Print bench</p>
          <p className="text-xs font-semibold text-neutral-200">{sectionTitle[tool]}</p>
        </div>
        <p className="mt-0.5 text-xs leading-4 text-neutral-400">{toolPurpose[tool]}</p>
        {workflow.recommendation ? (
          <p className="mt-1 border-t border-neutral-800 pt-1 text-xs leading-4 text-neutral-300">
            <span className="font-semibold text-emerald-300">Recommended next: </span>
            {workflow.recommendation}
          </p>
        ) : null}
      </div>
      <div
        id="editor-inspector-content"
        className={`min-h-0 flex-1 overflow-y-auto ${mobileExpanded ? '' : 'hidden md:block'}`}
      >
        {children}
      </div>
    </aside>
  );
};

const resetButtonClass = 'h-11 border border-neutral-700 px-3 text-xs font-medium text-neutral-300 transition hover:border-neutral-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400';

const ImageInspector = ({
  layer,
  asset,
  tool,
  mode,
  dispatch,
}: {
  layer: ImageLayer;
  asset: EditorAsset | undefined;
  tool: EditorTool;
  mode: 'easy' | 'advanced';
  dispatch: (command: EditorCommand) => void;
}) => {
  const endHistoryGroup = () => dispatch({ type: 'end-history-group' });
  const updateTransform = (
    transform: ImageLayer['transform'],
    historyGroup?: string,
  ) => dispatch({ type: 'set-transform', layerId: layer.id, transform, historyGroup });
  const updateCrop = (crop: CropRect, historyGroup?: string) =>
    dispatch({ type: 'set-crop', layerId: layer.id, crop, historyGroup });
  const updateAdjustments = (
    adjustments: ImageLayer['adjustments'],
    historyGroup?: string,
  ) => dispatch({ type: 'set-adjustments', layerId: layer.id, adjustments, historyGroup });
  const cropEdges = cropToEdgePercentages(layer.crop);
  const applyAspectRatio = (ratio: number) => {
    if (!asset) return;
    const sourceRatio = asset.width / asset.height;
    let width = layer.crop.width;
    let height = width * sourceRatio / ratio;
    if (height > 1) {
      height = Math.min(1, layer.crop.height);
      width = Math.min(1, height * ratio / sourceRatio);
    }
    updateCrop({
      x: Math.max(0, Math.min(1 - width, layer.crop.x + (layer.crop.width - width) / 2)),
      y: Math.max(0, Math.min(1 - height, layer.crop.y + (layer.crop.height - height) / 2)),
      width,
      height,
    }, 'inspector-crop-ratio');
    endHistoryGroup();
  };

  return (
    <>
      <div className="sticky top-0 z-10 flex h-12 items-center justify-between border-b border-neutral-800 bg-neutral-900 px-4">
        <h2 className="text-sm font-semibold text-neutral-100">{sectionTitle[tool]}</h2>
        <button
          type="button"
          className={resetButtonClass}
          onClick={() => {
            if (tool === 'select') {
              updateTransform(
                { x: 0.5, y: 0.5, scale: 1, rotation: 0, flipX: false, flipY: false },
                'inspector-select-reset',
              );
              dispatch({ type: 'set-opacity', layerId: layer.id, opacity: 1, historyGroup: 'inspector-select-reset' });
            } else if (tool === 'crop') {
              updateCrop({ x: 0, y: 0, width: 1, height: 1 }, 'inspector-crop-reset');
            } else {
              updateAdjustments({ brightness: 0, contrast: 0, saturation: 0 }, 'inspector-adjust-reset');
            }
            endHistoryGroup();
          }}
        >
          Reset
        </button>
      </div>

      <div className="grid gap-5 p-4">
        {tool === 'select' ? (
          <div className="grid gap-4">
            {mode === 'advanced' ? <h3 className="text-xs font-semibold text-neutral-200">Precise placement</h3> : null}
            <TransformControls layer={layer} dispatch={dispatch} showNumericPlacement={mode === 'advanced'} />
          </div>
        ) : null}

        {tool === 'crop' ? (
          <><p className="text-xs leading-5 text-neutral-500">Drag the grid on the canvas to reposition the crop, or use a ratio below.</p><div className="grid grid-cols-3 gap-2" aria-label="Crop aspect ratio">{[[1, '1:1'], [4 / 5, '4:5'], [16 / 9, '16:9'], [3 / 2, '3:2'], [2 / 3, '2:3'], [0, 'Free']].map(([ratio, label]) => <button key={label as string} type="button" className="h-11 border border-neutral-700 bg-neutral-950 text-xs text-neutral-300 transition hover:border-neutral-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400" onClick={() => ratio ? applyAspectRatio(ratio as number) : updateCrop({ x: 0, y: 0, width: 1, height: 1 }, 'inspector-crop-free')}>{label as string}</button>)}</div>{(['left', 'top', 'right', 'bottom'] as const).map((edge) => (
            <RangeControl
              key={edge}
              id={`editor-crop-${edge}`}
              label={`${edge[0].toUpperCase()}${edge.slice(1)}`}
              value={cropEdges[edge]}
              suffix="%"
              bounds={controlBounds.crop}
              onChange={(value) => updateCrop(
                edgePercentagesToCrop({ ...cropEdges, [edge]: value }),
                `inspector-crop-${edge}`,
              )}
              onEnd={endHistoryGroup}
            />
          ))}</>
        ) : null}

        {tool === 'adjust' ? (
          (['brightness', 'contrast', 'saturation'] as const).map((adjustment) => (
            <RangeControl
              key={adjustment}
              id={`editor-${adjustment}`}
              label={`${adjustment[0].toUpperCase()}${adjustment.slice(1)}`}
              value={Math.round(layer.adjustments[adjustment])}
              bounds={controlBounds.adjustment}
              onChange={(value) => updateAdjustments(
                { ...layer.adjustments, [adjustment]: value },
                `inspector-${adjustment}`,
              )}
              onEnd={endHistoryGroup}
            />
          ))
        ) : null}
      </div>
    </>
  );
};

export const EditorInspector = ({
  project,
  variation,
  layer,
  tool,
  assetsById,
  imagesById,
  coordinator,
  lookError,
  onRetryLook,
  backgroundRemoval = null,
  backgroundBrushMode = 'idle',
  backgroundBrushSize = 32,
  onBackgroundBrushModeChange = () => undefined,
  onBackgroundBrushSizeChange = () => undefined,
  onBackgroundDone = () => undefined,
  traceWorkflow = null,
  resolutionWorkflow = null,
  product = null,
  productMockupStatus = 'idle',
  productMockupError = null,
  productArtworkError = null,
  productPreviewMode = 'rgb',
  onProductPreviewModeChange = () => undefined,
  productArtworkVariation = null,
  productArtworkUrl = null,
  onEnhanceProductArtwork = () => undefined,
  onRemoveProductArtworkBackground = () => undefined,
  onProductExport = () => undefined,
  onRetryProduct = () => undefined,
  onReturnToDesign = () => undefined,
  mode = 'advanced',
  mobileExpanded = true,
  onMobileExpandedChange = () => undefined,
  dispatch,
}: EditorInspectorProps) => {
  const frameProps = { tool, mode, layer, mobileExpanded, onMobileExpandedChange };
  if (tool === 'product' && product) {
    return (
      <InspectorFrame {...frameProps}>
        <ProductInspector
          product={product}
          mockupStatus={productMockupStatus}
          mockupError={productMockupError}
          artworkError={productArtworkError}
          variations={project.variations.map(({ id, name }) => ({ id, name }))}
          previewMode={productPreviewMode}
          onPreviewModeChange={onProductPreviewModeChange}
          artworkVariation={productArtworkVariation}
          assetsById={assetsById}
          artworkUrl={productArtworkUrl}
          onEnhanceResolution={onEnhanceProductArtwork}
          onRemoveBackground={onRemoveProductArtworkBackground}
          onExport={onProductExport}
          mode={mode}
          dispatch={dispatch}
          onRetry={onRetryProduct}
          onReturnToDesign={onReturnToDesign}
        />
      </InspectorFrame>
    );
  }

  if (project && variation && tool === 'looks') {
    return (
      <InspectorFrame {...frameProps}>
        <LooksInspector
          key={variation.id}
          variation={variation}
          assetsById={assetsById}
          imagesById={imagesById}
          coordinator={coordinator}
          dispatch={dispatch}
          error={lookError}
          onRetry={onRetryLook}
        />
      </InspectorFrame>
    );
  }

  if (!project || !layer) {
    return (
      <InspectorFrame {...frameProps}>
        <div className="p-4">
          <h2 className="text-sm font-semibold text-neutral-100">{sectionTitle[tool]}</h2>
          <p className="mt-2 text-xs leading-5 text-neutral-400">Import artwork to edit.</p>
        </div>
      </InspectorFrame>
    );
  }

  if (tool === 'enhance' && layer.type === 'image' && resolutionWorkflow) {
    return <InspectorFrame {...frameProps}><ResolutionInspector workflow={resolutionWorkflow} /></InspectorFrame>;
  }

  if (
    tool === 'trace' &&
    traceWorkflow &&
    (layer.type === 'image' || layer.type === 'trace')
  ) {
    return (
      <InspectorFrame {...frameProps}>
        <TraceInspector
          traceLayer={layer.type === 'trace' ? layer : null}
          workflow={traceWorkflow}
          dispatch={dispatch}
          mode={mode}
        />
      </InspectorFrame>
    );
  }

  return (
    <InspectorFrame {...frameProps}>
      {layer.type === 'text' ? (
        <>
          <div className="sticky top-0 z-10 flex h-12 items-center border-b border-neutral-800 bg-neutral-900 px-4">
            <h2 className="text-sm font-semibold text-neutral-100">Text</h2>
          </div>
          <TextInspector layer={layer} dispatch={dispatch} />
        </>
      ) : layer.type === 'image' ? (
        tool === 'remove-background' && backgroundRemoval ? (
          <BackgroundRemovalInspector
            layer={layer}
            status={backgroundRemoval.status}
            error={backgroundRemoval.error}
            brushMode={backgroundBrushMode}
            brushSize={backgroundBrushSize}
            dispatch={dispatch}
            onRetry={backgroundRemoval.retry}
            onBrushModeChange={onBackgroundBrushModeChange}
            onBrushSizeChange={onBackgroundBrushSizeChange}
            onClearCorrections={backgroundRemoval.clearCorrections}
            onDone={onBackgroundDone}
          />
        ) : (
          <ImageInspector layer={layer} asset={assetsById[layer.assetId]} tool={tool} mode={mode} dispatch={dispatch} />
        )
      ) : (
        <>
          <div className="sticky top-0 z-10 flex h-12 items-center border-b border-neutral-800 bg-neutral-900 px-4">
            <h2 className="text-sm font-semibold text-neutral-100">Transform</h2>
          </div>
          <div className="grid gap-5 p-4">
            <TransformControls layer={layer} dispatch={dispatch} showNumericPlacement={mode === 'advanced'} />
          </div>
        </>
      )}
    </InspectorFrame>
  );
};
