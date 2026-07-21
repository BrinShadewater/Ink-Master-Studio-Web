import type { EditorCommand } from '../../editor/history';
import type {
  CropRect,
  DesignLayer,
  EditorProject,
  EditorTool,
  ImageLayer,
} from '../../editor/model';
import { TextInspector } from './TextInspector';
import {
  controlBounds,
  RangeControl,
  TransformControls,
} from './TransformControls';

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
  layer: DesignLayer | null;
  tool: EditorTool;
  dispatch: (command: EditorCommand) => void;
}

const sectionTitle: Record<EditorTool, string> = {
  select: 'Transform',
  crop: 'Crop',
  adjust: 'Adjustments',
};

const resetButtonClass = 'h-8 border border-neutral-700 px-3 text-xs font-medium text-neutral-300 transition hover:border-neutral-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400';

const ImageInspector = ({
  layer,
  tool,
  dispatch,
}: {
  layer: ImageLayer;
  tool: EditorTool;
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
        {tool === 'select' ? <TransformControls layer={layer} dispatch={dispatch} /> : null}

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

export const EditorInspector = ({ project, layer, tool, dispatch }: EditorInspectorProps) => {
  if (!project || !layer) {
    return (
      <aside className="h-60 overflow-y-auto border-t border-neutral-800 bg-neutral-900 p-4 md:h-full md:min-h-0 md:border-l md:border-t-0" aria-label="Inspector">
        <h2 className="text-sm font-semibold text-neutral-100">{sectionTitle[tool]}</h2>
        <p className="mt-2 text-xs leading-5 text-neutral-500">Import artwork to edit.</p>
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
      ) : <ImageInspector layer={layer} tool={tool} dispatch={dispatch} />}
    </aside>
  );
};
