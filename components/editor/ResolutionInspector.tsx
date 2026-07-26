import type { ResolutionWorkflow } from './useResolutionWorkflow';

export interface ResolutionInspectorProps {
  workflow: ResolutionWorkflow;
  mode?: 'easy' | 'advanced';
}

export const ResolutionInspector = ({ workflow }: ResolutionInspectorProps) => (
  <>
    <div className="sticky top-0 z-10 flex h-12 items-center border-b border-neutral-800 bg-neutral-900 px-4"><h2 className="text-sm font-semibold text-neutral-100">Enhance resolution</h2></div>
    <div className="grid gap-5 p-4">
      <p className="text-xs leading-5 text-neutral-500">Creates a larger PNG from the selected image while keeping the original in project history. Use it before Vectorize or a large print export; it improves sampling, but cannot invent missing detail.</p>
      {workflow.beforeAssetId ? <p className="border border-emerald-900/70 bg-emerald-950/20 px-3 py-2 text-xs leading-5 text-emerald-200">Use the large canvas slider to compare the enhanced result with its source.</p> : null}
      <div className="grid grid-cols-2 gap-2">
        {([2, 4] as const).map((scale) => <button key={scale} type="button" disabled={workflow.status === 'processing'} onClick={() => { void workflow.enhance(scale); }} className="h-11 border border-neutral-700 bg-neutral-950 text-sm font-semibold text-neutral-200 transition hover:border-emerald-400 hover:text-white disabled:opacity-40">{workflow.status === 'processing' ? 'Enhancing...' : `${scale}x enhance`}</button>)}
      </div>
      <p className="text-xs leading-4 text-neutral-600">The longest edge is capped at 8192 px to keep browser memory predictable.</p>
      {workflow.error ? <p role="alert" className="text-xs text-red-300">{workflow.error}</p> : null}
    </div>
  </>
);
