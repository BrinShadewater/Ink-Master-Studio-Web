import { CircleStop, Download, FileImage, RotateCcw, X } from 'lucide-react';
import { useRef, useState, type RefObject } from 'react';
import type { DesignVariation, EditorAsset } from '../../editor/model';
import type { TShirtProductVariant } from '../../editor/productModel';
import { TSHIRT_EXPORT_PRESETS, createTShirtExportFilename, type TShirtExportPresetId } from '../../editor/tshirtExportModel';
import { useAccessibleDialog } from '../useAccessibleDialog';
import { useTShirtPngExport } from './useTShirtPngExport';

export interface ProductExportDialogProps {
  open: boolean; projectName: string; variation: DesignVariation; product: TShirtProductVariant;
  assetsById: Record<string, EditorAsset>; returnFocusRef: RefObject<HTMLButtonElement | null>; onClose: () => void;
}

export const ProductExportDialog = ({ open, projectName, variation, product, assetsById, returnFocusRef, onClose }: ProductExportDialogProps) => {
  const [presetId, setPresetId] = useState<TShirtExportPresetId>('printify-full-front');
  const selectedRef = useRef<HTMLInputElement>(null);
  const dialogRef = useAccessibleDialog({ open, onClose, initialFocusRef: selectedRef, returnFocusRef });
  const { state, generate, cancel } = useTShirtPngExport({ presetId, variation, placement: product.placement, assetsById });
  if (!open) return null;
  const busy = state.status === 'capturing' || state.status === 'rendering' || state.status === 'validating';
  const close = () => { cancel(); onClose(); };
  const download = () => {
    if (state.status !== 'ready') return;
    const anchor = document.createElement('a'); anchor.href = state.url;
    anchor.download = createTShirtExportFilename(projectName, variation.name, presetId); anchor.click();
  };
  return <div ref={dialogRef} className="fixed inset-0 z-50 flex items-start justify-end bg-black/65 p-3 md:p-4" role="dialog" aria-modal="true" aria-labelledby="product-export-title" tabIndex={-1} onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="max-h-full w-full max-w-sm overflow-y-auto border border-neutral-700 bg-neutral-900 shadow-2xl">
      <header className="flex h-12 items-center justify-between border-b border-neutral-800 px-4"><h2 id="product-export-title" className="text-sm font-semibold">T-shirt PNG</h2><button ref={undefined} type="button" className="grid h-8 w-8 place-items-center text-neutral-400 hover:bg-neutral-800" aria-label="Close export" title="Close export" onClick={close}><X size={17} /></button></header>
      <div className="grid gap-3 p-4"><div role="radiogroup" aria-label="PNG preset" className="grid gap-2">{TSHIRT_EXPORT_PRESETS.map((preset) => <label key={preset.id} className="flex cursor-pointer gap-2 border border-neutral-700 p-3 text-xs"><input ref={preset.id === presetId ? selectedRef : undefined} type="radio" name="tshirt-export-preset" value={preset.id} checked={preset.id === presetId} onChange={() => setPresetId(preset.id)} /><span><strong>{preset.name}</strong><br />{preset.width} x {preset.height} px, {preset.dpi} DPI, {preset.physicalWidthInches} x {preset.physicalHeightInches} in<br /><span className={preset.classification === 'proof' ? 'text-amber-300' : 'text-emerald-300'}>{preset.classification === 'proof' ? 'Proof only' : 'Production'}</span></span></label>)}</div>
      {state.status === 'rendering' ? <p role="status" className="text-xs text-neutral-300">{state.stage === 'preparing-artwork' ? 'Preparing artwork' : state.stage === 'rendering-layers' ? 'Rendering layers' : 'Encoding PNG'}...</p> : null}
      {state.status === 'validating' ? <p role="status" className="text-xs text-neutral-300">Validating file...</p> : null}
      {state.status === 'failed' ? <p role="alert" className="text-xs text-red-300">{state.message}</p> : null}
      {state.status === 'ready' ? <dl className="grid grid-cols-2 gap-y-1 text-xs text-neutral-300"><dt>Readiness</dt><dd>{state.receipt.readiness === 'proof-ready' ? 'Proof ready' : 'Ready to print'}</dd><dt>File</dt><dd>{state.receipt.width} x {state.receipt.height} px</dd><dt>Resolution</dt><dd>{state.receipt.dpiX} DPI</dd><dt>Format</dt><dd>8-bit RGBA</dd><dt>Transparency</dt><dd>Present</dd></dl> : null}
      <div className="flex gap-2">{busy ? <button type="button" className="flex h-10 flex-1 items-center justify-center gap-2 border border-neutral-700 text-xs" onClick={cancel}><CircleStop size={16} />Cancel</button> : <button type="button" className="flex h-10 flex-1 items-center justify-center gap-2 bg-emerald-500 text-xs font-semibold text-neutral-950 disabled:opacity-40" disabled={!variation} onClick={() => void generate()}><FileImage size={16} />{state.status === 'failed' ? 'Retry PNG' : 'Generate PNG'}</button>}{state.status === 'ready' ? <button type="button" className="flex h-10 flex-1 items-center justify-center gap-2 border border-neutral-700 text-xs" onClick={download}><Download size={16} />Download PNG</button> : null}{state.status === 'failed' ? <button type="button" className="grid h-10 w-10 place-items-center border border-neutral-700" title="Reset export" aria-label="Reset export" onClick={cancel}><RotateCcw size={16} /></button> : null}</div></div>
    </section>
  </div>;
};
