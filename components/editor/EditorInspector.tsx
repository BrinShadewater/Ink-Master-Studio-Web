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
  product?: TShirtProductVariant | null;
  productMockupStatus?: ProductMockupLoadStatus;
  productMockupError?: string | null;
  productArtworkError?: string | null;
  onRetryProduct?: () => void;
  onReturnToDesign?: () => void;
  mode?: 'easy' | 'advanced';
  dispatch: (command: EditorCommand) => void;
}

const sectionTitle: Record<EditorTool, string> = {
  select: 'Transform',
  crop: 'Crop',
  adjust: 'Adjustments',
  looks: 'Looks',
  'remove-background': 'Remove background',
  trace: 'Trace',
  product: 'Product',
};

const resetButtonClass = 'h-8 border border-neutral-700 px-3 text-xs font-medium text-neutral-300 transition hover:border-neutral-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400';

const ImageInspector = ({
  layer,
  tool,
  mode,
  dispatch,
}: {
  layer: ImageLayer;
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
        {tool === 'select' ? <TransformControls layer={layer} dispatch={dispatch} showNumericPlacement={mode === 'advanced'} /> : null}

        {tool === 'crop' ? (
          (['left', 'top', 'right', 'bottom'] as const).map((edge) => (
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
          ))
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
  product = null,
  productMockupStatus = 'idle',
  productMockupError = null,
  productArtworkError = null,
  onRetryProduct = () => undefined,
  onReturnToDesign = () => undefined,
  mode = 'advanced',
  dispatch,
}: EditorInspectorProps) => {
  if (tool === 'product' && product) {
    return (
      <aside className="h-60 overflow-y-auto border-t border-neutral-800 bg-neutral-900 md:h-full md:min-h-0 md:border-l md:border-t-0" aria-label="Inspector">
        <ProductInspector
          product={product}
          mockupStatus={productMockupStatus}
          mockupError={productMockupError}
          artworkError={productArtworkError}
          dispatch={dispatch}
          onRetry={onRetryProduct}
          onReturnToDesign={onReturnToDesign}
        />
      </aside>
    );
  }

  if (project && variation && tool === 'looks') {
    return (
      <aside className="h-60 overflow-y-auto border-t border-neutral-800 bg-neutral-900 md:h-full md:min-h-0 md:border-l md:border-t-0" aria-label="Inspector">
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
      </aside>
    );
  }

  if (!project || !layer) {
    return (
      <aside className="h-60 overflow-y-auto border-t border-neutral-800 bg-neutral-900 p-4 md:h-full md:min-h-0 md:border-l md:border-t-0" aria-label="Inspector">
        <h2 className="text-sm font-semibold text-neutral-100">{sectionTitle[tool]}</h2>
        <p className="mt-2 text-xs leading-5 text-neutral-500">Import artwork to edit.</p>
      </aside>
    );
  }

  if (
    tool === 'trace' &&
    traceWorkflow &&
    (layer.type === 'image' || layer.type === 'trace')
  ) {
    return (
      <aside className="h-60 overflow-y-auto border-t border-neutral-800 bg-neutral-900 md:h-full md:min-h-0 md:border-l md:border-t-0" aria-label="Inspector">
        <TraceInspector
          traceLayer={layer.type === 'trace' ? layer : null}
          workflow={traceWorkflow}
          dispatch={dispatch}
          mode={mode}
        />
      </aside>
    );
  }

  return (
    <aside className="h-60 overflow-y-auto border-t border-neutral-800 bg-neutral-900 md:h-full md:min-h-0 md:border-l md:border-t-0" aria-label="Inspector">
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
          <ImageInspector layer={layer} tool={tool} mode={mode} dispatch={dispatch} />
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
    </aside>
  );
};
