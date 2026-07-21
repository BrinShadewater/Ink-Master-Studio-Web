import type { KeyboardEvent, PointerEvent } from 'react';
import type { EditorCommand } from '../../editor/history';
import type {
  CropRect,
  EditorProject,
  EditorTool,
  ImageLayer,
} from '../../editor/model';

export const controlBounds = {
  scale: { min: 5, max: 400, step: 1 },
  rotation: { min: -180, max: 180, step: 1 },
  crop: { min: 0, max: 45, step: 1 },
  adjustment: { min: -100, max: 100, step: 1 },
  opacity: { min: 0, max: 100, step: 1 },
} as const;

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
  layer: ImageLayer | null;
  tool: EditorTool;
  dispatch: (command: EditorCommand) => void;
}

interface RangeControlProps {
  key?: string;
  id: string;
  label: string;
  value: number;
  suffix?: string;
  bounds: { min: number; max: number; step: number };
  onChange: (value: number) => void;
  onEnd: () => void;
}

const RangeControl = ({
  id,
  label,
  value,
  suffix = '',
  bounds,
  onChange,
  onEnd,
}: RangeControlProps) => {
  const finishPointer = (_event: PointerEvent<HTMLInputElement>) => onEnd();
  const finishKey = (_event: KeyboardEvent<HTMLInputElement>) => onEnd();

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3 text-xs">
        <label className="font-medium text-neutral-300" htmlFor={id}>{label}</label>
        <output className="min-w-12 text-right tabular-nums text-neutral-400" htmlFor={id}>{value}{suffix}</output>
      </div>
      <input
        id={id}
        className="h-5 w-full accent-emerald-500"
        type="range"
        min={bounds.min}
        max={bounds.max}
        step={bounds.step}
        value={clamp(value, bounds.min, bounds.max)}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        onPointerUp={finishPointer}
        onKeyUp={finishKey}
        onBlur={onEnd}
      />
    </div>
  );
};

const sectionTitle: Record<EditorTool, string> = {
  select: 'Transform',
  crop: 'Crop',
  adjust: 'Adjustments',
};

const resetButtonClass = 'h-8 border border-neutral-700 px-3 text-xs font-medium text-neutral-300 transition hover:border-neutral-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400';

export const EditorInspector = ({ project, layer, tool, dispatch }: EditorInspectorProps) => {
  const endHistoryGroup = () => dispatch({ type: 'end-history-group' });

  if (!project || !layer) {
    return (
      <aside className="order-2 h-60 overflow-y-auto border-t border-neutral-800 bg-neutral-900 p-4 md:order-none md:h-auto md:border-l md:border-t-0" aria-label="Inspector">
        <h2 className="text-sm font-semibold text-neutral-100">{sectionTitle[tool]}</h2>
        <p className="mt-2 text-xs leading-5 text-neutral-500">Import artwork to edit.</p>
      </aside>
    );
  }

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
    <aside className="order-2 h-60 overflow-y-auto border-t border-neutral-800 bg-neutral-900 md:order-none md:h-auto md:border-l md:border-t-0" aria-label="Inspector">
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
          <>
            <RangeControl
              id="editor-scale"
              label="Scale"
              value={Math.round(layer.transform.scale * 100)}
              suffix="%"
              bounds={controlBounds.scale}
              onChange={(value) => updateTransform({ ...layer.transform, scale: value / 100 }, 'inspector-scale')}
              onEnd={endHistoryGroup}
            />
            <RangeControl
              id="editor-rotation"
              label="Rotation"
              value={Math.round(layer.transform.rotation)}
              suffix="°"
              bounds={controlBounds.rotation}
              onChange={(value) => updateTransform({ ...layer.transform, rotation: value }, 'inspector-rotation')}
              onEnd={endHistoryGroup}
            />
            <RangeControl
              id="editor-opacity"
              label="Opacity"
              value={Math.round(layer.opacity * 100)}
              suffix="%"
              bounds={controlBounds.opacity}
              onChange={(value) => dispatch({ type: 'set-opacity', layerId: layer.id, opacity: value / 100, historyGroup: 'inspector-opacity' })}
              onEnd={endHistoryGroup}
            />
            <fieldset className="grid grid-cols-2 gap-3">
              <legend className="mb-2 text-xs font-medium text-neutral-300">Flip</legend>
              <label className="flex h-10 items-center gap-2 border border-neutral-700 px-3 text-xs text-neutral-300">
                <input
                  type="checkbox"
                  className="accent-emerald-500"
                  checked={layer.transform.flipX}
                  onChange={(event) => updateTransform({ ...layer.transform, flipX: event.currentTarget.checked })}
                />
                Horizontal
              </label>
              <label className="flex h-10 items-center gap-2 border border-neutral-700 px-3 text-xs text-neutral-300">
                <input
                  type="checkbox"
                  className="accent-emerald-500"
                  checked={layer.transform.flipY}
                  onChange={(event) => updateTransform({ ...layer.transform, flipY: event.currentTarget.checked })}
                />
                Vertical
              </label>
            </fieldset>
          </>
        ) : null}

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
    </aside>
  );
};
