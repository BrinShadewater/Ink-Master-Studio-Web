import type { KeyboardEvent, PointerEvent } from 'react';
import type { EditorCommand } from '../../editor/history';
import type { DesignLayer } from '../../editor/model';

export const controlBounds = {
  position: { min: -2, max: 3, step: 0.01 },
  scale: { min: 5, max: 400, step: 1 },
  rotation: { min: -180, max: 180, step: 1 },
  crop: { min: 0, max: 45, step: 1 },
  adjustment: { min: -100, max: 100, step: 1 },
  opacity: { min: 0, max: 100, step: 1 },
} as const;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));

export interface RangeControlProps {
  key?: string;
  id: string;
  label: string;
  value: number;
  suffix?: string;
  bounds: { min: number; max: number; step: number };
  onChange: (value: number) => void;
  onEnd: () => void;
}

export const RangeControl = ({
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

export interface NumberControlProps {
  id: string;
  label: string;
  value: number;
  bounds: { min: number; max: number; step: number };
  onChange: (value: number) => void;
  onEnd: () => void;
}

export const NumberControl = ({ id, label, value, bounds, onChange, onEnd }: NumberControlProps) => (
  <div className="grid gap-2">
    <label className="text-xs font-medium text-neutral-300" htmlFor={id}>{label}</label>
    <input
      id={id}
      className="h-9 w-full border border-neutral-700 bg-neutral-950 px-2 text-sm tabular-nums text-neutral-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
      type="number"
      min={bounds.min}
      max={bounds.max}
      step={bounds.step}
      value={Number(value.toFixed(2))}
      onChange={(event) => onChange(Number(event.currentTarget.value))}
      onKeyUp={onEnd}
      onBlur={onEnd}
    />
  </div>
);

export interface TransformControlsProps {
  layer: DesignLayer;
  dispatch: (command: EditorCommand) => void;
}

export const TransformControls = ({ layer, dispatch }: TransformControlsProps) => {
  const endHistoryGroup = () => dispatch({ type: 'end-history-group' });
  const updateTransform = (
    transform: DesignLayer['transform'],
    historyGroup?: string,
  ) => dispatch({ type: 'set-transform', layerId: layer.id, transform, historyGroup });

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <NumberControl
          id="editor-position-x"
          label="X position"
          value={layer.transform.x}
          bounds={controlBounds.position}
          onChange={(value) => updateTransform({ ...layer.transform, x: value }, 'inspector-position-x')}
          onEnd={endHistoryGroup}
        />
        <NumberControl
          id="editor-position-y"
          label="Y position"
          value={layer.transform.y}
          bounds={controlBounds.position}
          onChange={(value) => updateTransform({ ...layer.transform, y: value }, 'inspector-position-y')}
          onEnd={endHistoryGroup}
        />
      </div>
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
        onChange={(value) => dispatch({
          type: 'set-opacity',
          layerId: layer.id,
          opacity: value / 100,
          historyGroup: 'inspector-opacity',
        })}
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
  );
};
