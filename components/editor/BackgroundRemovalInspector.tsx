import type { EditorCommand } from '../../editor/history';
import { createDefaultBackgroundRemoval } from '../../editor/imagePrepModel';
import type { ImageLayer } from '../../editor/model';
import { RangeControl } from './TransformControls';

export type BackgroundBrushMode = 'idle' | 'pick' | 'erase' | 'restore';

export interface BackgroundRemovalInspectorProps {
  layer: ImageLayer;
  status: 'idle' | 'processing' | 'ready' | 'failed';
  error: string | null;
  brushMode: BackgroundBrushMode;
  brushSize: number;
  dispatch: (command: EditorCommand) => void;
  onRetry: () => void;
  onBrushModeChange: (mode: BackgroundBrushMode) => void;
  onBrushSizeChange: (size: number) => void;
  onClearCorrections: () => Promise<void>;
  onDone: () => void;
}

const segmentedClass = (selected: boolean) =>
  `h-9 border px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
    selected
      ? 'border-emerald-400 bg-emerald-500 text-neutral-950'
      : 'border-neutral-700 bg-neutral-950 text-neutral-300 hover:border-neutral-500'
  }`;

const commandClass = 'h-9 border border-neutral-700 px-3 text-xs font-medium text-neutral-300 transition hover:border-neutral-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-40';

export const BackgroundRemovalInspector = ({
  layer,
  status,
  error,
  brushMode,
  brushSize,
  dispatch,
  onRetry,
  onBrushModeChange,
  onBrushSizeChange,
  onClearCorrections,
  onDone,
}: BackgroundRemovalInspectorProps) => {
  const settings = layer.backgroundRemoval;
  const processing = status === 'processing';
  const update = (
    next: ImageLayer['backgroundRemoval'],
    historyGroup?: string,
  ) => dispatch({
    type: 'set-background-removal',
    layerId: layer.id,
    settings: next,
    historyGroup,
  });
  const endHistoryGroup = () => dispatch({ type: 'end-history-group' });

  return (
    <>
      <div className="sticky top-0 z-10 flex h-12 items-center justify-between border-b border-neutral-800 bg-neutral-900 px-4">
        <h2 className="text-sm font-semibold text-neutral-100">Remove background</h2>
        <button type="button" className={commandClass} onClick={onDone}>Done</button>
      </div>
      <div className="grid gap-5 p-4">
        <label className="flex min-h-9 items-center justify-between gap-3 text-xs font-medium text-neutral-300">
          Enable background removal
          <input
            type="checkbox"
            className="h-4 w-4 accent-emerald-500"
            checked={settings.enabled}
            disabled={processing}
            onChange={(event) => update({ ...settings, enabled: event.currentTarget.checked })}
          />
        </label>

        <div className="grid grid-cols-2 gap-2" aria-label="Background selection mode">
          <button
            type="button"
            className={segmentedClass(settings.mode === 'auto')}
            aria-pressed={settings.mode === 'auto'}
            disabled={processing}
            onClick={() => {
              update({ ...settings, enabled: true, mode: 'auto' });
              onBrushModeChange('idle');
            }}
          >
            Auto
          </button>
          <button
            type="button"
            className={segmentedClass(settings.mode === 'picked')}
            aria-pressed={settings.mode === 'picked'}
            disabled={processing}
            onClick={() => {
              update({ ...settings, enabled: true, mode: 'picked' });
              onBrushModeChange('pick');
            }}
          >
            Pick color
          </button>
        </div>

        <RangeControl
          id="editor-background-tolerance"
          label="Tolerance"
          value={settings.tolerance}
          suffix="%"
          bounds={{ min: 0, max: 100, step: 1 }}
          disabled={processing}
          onChange={(value) => update(
            { ...settings, tolerance: value },
            'background-tolerance',
          )}
          onEnd={endHistoryGroup}
        />
        <RangeControl
          id="editor-background-feather"
          label="Edge feather"
          value={settings.edgeFeather}
          bounds={{ min: 0, max: 8, step: 1 }}
          disabled={processing}
          onChange={(value) => update(
            { ...settings, edgeFeather: value },
            'background-feather',
          )}
          onEnd={endHistoryGroup}
        />

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={segmentedClass(brushMode === 'erase')}
            aria-label="Erase background"
            aria-pressed={brushMode === 'erase'}
            disabled={processing}
            onClick={() => onBrushModeChange('erase')}
          >
            Erase
          </button>
          <button
            type="button"
            className={segmentedClass(brushMode === 'restore')}
            aria-label="Restore background"
            aria-pressed={brushMode === 'restore'}
            disabled={processing}
            onClick={() => onBrushModeChange('restore')}
          >
            Restore
          </button>
        </div>
        <RangeControl
          id="editor-background-brush-size"
          label="Brush size"
          value={brushSize}
          bounds={{ min: 8, max: 128, step: 1 }}
          disabled={processing}
          onChange={onBrushSizeChange}
          onEnd={() => undefined}
        />

        {status === 'processing' ? (
          <p className="text-xs text-neutral-400" role="status">Removing background...</p>
        ) : null}
        {error ? (
          <div className="grid gap-2 border border-red-900 bg-red-950/50 p-3 text-xs text-red-200" role="alert">
            <p>{error}</p>
            <button type="button" className={commandClass} onClick={onRetry}>Retry</button>
          </div>
        ) : null}

        <div className="grid gap-2">
          <button
            type="button"
            className={commandClass}
            disabled={!settings.correctionAssetId || processing}
            onClick={() => { void onClearCorrections(); }}
          >
            Clear corrections
          </button>
          <button
            type="button"
            className={commandClass}
            disabled={processing}
            onClick={() => {
              update(createDefaultBackgroundRemoval(), 'background-reset');
              endHistoryGroup();
              onBrushModeChange('idle');
            }}
          >
            Reset background
          </button>
        </div>
      </div>
    </>
  );
};
