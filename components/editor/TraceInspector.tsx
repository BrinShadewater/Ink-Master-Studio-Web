import { Plus, X } from 'lucide-react';
import type { EditorCommand } from '../../editor/history';
import type { TraceLayer } from '../../editor/model';
import type { TraceSettings } from '../../editor/traceModel';
import { RangeControl } from './TransformControls';
import type { TraceWorkflow } from './useTraceWorkflow';

export interface TraceInspectorProps {
  traceLayer: TraceLayer | null;
  workflow: TraceWorkflow;
  dispatch: (command: EditorCommand) => void;
  mode?: 'easy' | 'advanced';
}

const traceBounds = {
  colors: { min: 2, max: 32, step: 1 },
  detail: { min: 0, max: 100, step: 1 },
  smoothing: { min: 0, max: 100, step: 1 },
  blur: { min: 0, max: 5, step: 1 },
} as const;

const paletteDefaults = [
  '#111111',
  '#ffffff',
  '#e5484d',
  '#2f855a',
  '#2563eb',
  '#f59e0b',
];

const commandButtonClass =
  'h-9 border border-neutral-700 px-3 text-xs font-medium text-neutral-200 transition hover:border-neutral-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-40';

export const TraceInspector = ({
  traceLayer,
  workflow,
  dispatch,
  mode = 'advanced',
}: TraceInspectorProps) => {
  const update = (
    key: keyof Pick<TraceSettings, 'colors' | 'detail' | 'smoothing' | 'blur'>,
    value: number,
  ) => workflow.updateSettings(
    { ...workflow.settings, [key]: value },
    `trace-${key}`,
  );
  const updatePalette = (palette: string[]) =>
    workflow.updateSettings({ ...workflow.settings, palette }, 'trace-palette');

  return (
    <>
      <div className="sticky top-0 z-10 flex h-12 items-center justify-between border-b border-neutral-800 bg-neutral-900 px-4">
        <h2 className="text-sm font-semibold text-neutral-100">Trace</h2>
        {traceLayer ? (
          <button
            type="button"
            className={commandButtonClass}
            aria-label="Restore source"
            onClick={() => dispatch({ type: 'restore-trace-source', layerId: traceLayer.id })}
          >
            Restore source
          </button>
        ) : null}
      </div>

      <div className="grid gap-5 p-4">
        <RangeControl
          id="editor-trace-colors"
          label="Colors"
          value={workflow.settings.colors}
          bounds={traceBounds.colors}
          disabled={workflow.status === 'processing'}
          onChange={(value) => update('colors', value)}
          onEnd={workflow.endSettingsEdit}
        />
        {mode === 'advanced' ? <><RangeControl
          id="editor-trace-detail"
          label="Detail"
          value={workflow.settings.detail}
          bounds={traceBounds.detail}
          disabled={workflow.status === 'processing'}
          onChange={(value) => update('detail', value)}
          onEnd={workflow.endSettingsEdit}
        />
        <RangeControl
          id="editor-trace-smoothing"
          label="Smoothing"
          value={workflow.settings.smoothing}
          bounds={traceBounds.smoothing}
          disabled={workflow.status === 'processing'}
          onChange={(value) => update('smoothing', value)}
          onEnd={workflow.endSettingsEdit}
        />
        <RangeControl
          id="editor-trace-blur"
          label="Blur"
          value={workflow.settings.blur}
          bounds={traceBounds.blur}
          disabled={workflow.status === 'processing'}
          onChange={(value) => update('blur', value)}
          onEnd={workflow.endSettingsEdit}
        />

        <fieldset className="grid gap-2" aria-label="Trace palette">
          <div className="flex items-center justify-between gap-3">
            <legend className="text-xs font-medium text-neutral-300">Palette</legend>
            <button
              type="button"
              className="grid h-8 w-8 place-items-center text-neutral-400 transition hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-40"
              aria-label="Add palette color"
              title="Add palette color"
              disabled={
                workflow.settings.palette.length >= 32 ||
                workflow.status === 'processing'
              }
              onClick={() => updatePalette([
                ...workflow.settings.palette,
                paletteDefaults[workflow.settings.palette.length % paletteDefaults.length],
              ])}
            >
              <Plus aria-hidden="true" size={16} />
            </button>
          </div>
          {workflow.settings.palette.length === 0 ? (
            <p className="text-xs text-neutral-500">Using traced colors</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {workflow.settings.palette.map((color, index) => (
                <div key={`${index}-${color}`} className="flex items-center border border-neutral-700">
                  <input
                    type="color"
                    className="h-8 w-9 cursor-pointer border-0 bg-transparent p-1"
                    aria-label={`Palette color ${index + 1}`}
                    value={color}
                    disabled={workflow.status === 'processing'}
                    onChange={(event) => updatePalette(workflow.settings.palette.map(
                      (candidate, candidateIndex) =>
                        candidateIndex === index ? event.currentTarget.value : candidate,
                    ))}
                    onBlur={workflow.endSettingsEdit}
                  />
                  <button
                    type="button"
                    className="grid h-8 w-8 place-items-center text-neutral-400 hover:bg-neutral-800 hover:text-white"
                    aria-label={`Remove palette color ${index + 1}`}
                    title={`Remove palette color ${index + 1}`}
                    disabled={workflow.status === 'processing'}
                    onClick={() => {
                      updatePalette(workflow.settings.palette.filter((_, candidateIndex) =>
                        candidateIndex !== index));
                      workflow.endSettingsEdit();
                    }}
                  >
                    <X aria-hidden="true" size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </fieldset></> : null}

        {traceLayer && !workflow.stale && workflow.status !== 'failed' ? (
          <p className="text-xs text-neutral-500">Trace is current.</p>
        ) : null}
        {workflow.error ? (
          <p className="text-xs text-red-300" role="alert">{workflow.error}</p>
        ) : null}
        <div className="flex gap-2">
          <button
            type="button"
            className="h-9 flex-1 bg-emerald-500 px-3 text-xs font-semibold text-neutral-950 transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!workflow.canGenerate || workflow.status === 'processing'}
            onClick={workflow.generate}
          >
            {workflow.status === 'processing'
              ? 'Tracing...'
              : traceLayer ? 'Update Trace' : 'Trace Image'}
          </button>
          {workflow.status === 'failed' ? (
            <button type="button" className={commandButtonClass} onClick={workflow.retry}>
              Retry
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
};
