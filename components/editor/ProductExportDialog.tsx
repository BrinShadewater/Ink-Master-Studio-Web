import { CircleStop, Download, FileImage, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { DesignVariation, EditorAsset } from '../../editor/model';
import type { TShirtProductVariant } from '../../editor/productModel';
import { getTShirtMockup } from '../../editor/productCatalog';
import { createProductProofMockup } from '../../editor/productProof';
import { TSHIRT_EXPORT_PRESETS, createTShirtExportFilename, getTShirtExportPreset, type TShirtExportPresetId } from '../../editor/tshirtExportModel';
import { useAccessibleDialog } from '../useAccessibleDialog';
import { useTShirtPngExport } from './useTShirtPngExport';

const formatFileSize = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;

export const getProductExportSummary = (
  product: TShirtProductVariant,
  variation: DesignVariation,
  presetId: TShirtExportPresetId,
) => {
  const preset = getTShirtExportPreset(presetId);
  return {
    garment: getTShirtMockup(product.mockupSlug).name,
    method: product.printMethod === 'dtg' ? 'DTG' : product.printMethod === 'dtf' ? 'DTF transfer' : 'Cut vinyl',
    artwork: variation.name,
    printSize: `${preset.physicalWidthInches} x ${preset.physicalHeightInches} in`,
    placement: `${Math.round(product.placement.scale * 100)}% scale at ${Math.round(product.placement.x * 100)}% x / ${Math.round(product.placement.y * 100)}% y`,
  };
};

export interface ProductExportDialogProps {
  open: boolean; projectName: string; variation: DesignVariation; product: TShirtProductVariant;
  assetsById: Record<string, EditorAsset>; returnFocusRef: RefObject<HTMLButtonElement | null>; onClose: () => void;
}

export const ProductExportDialog = ({ open, projectName, variation, product, assetsById, returnFocusRef, onClose }: ProductExportDialogProps) => {
  const [presetId, setPresetId] = useState<TShirtExportPresetId>('printify-full-front');
  const [proof, setProof] = useState<{ status: 'idle' | 'creating' | 'ready' | 'failed'; url?: string; message?: string }>({ status: 'idle' });
  const selectedRef = useRef<HTMLInputElement>(null);
  const dialogRef = useAccessibleDialog({ open, onClose, initialFocusRef: selectedRef, returnFocusRef });
  const { state, generate, cancel } = useTShirtPngExport({ presetId, variation, placement: product.placement, assetsById });
  const summary = getProductExportSummary(product, variation, presetId);
  useEffect(() => () => {
    if (proof.url) URL.revokeObjectURL(proof.url);
  }, [proof.url]);
  if (!open) return null;
  const busy = state.status === 'capturing' || state.status === 'rendering' || state.status === 'validating';
  const close = () => { cancel(); onClose(); };
  const download = () => {
    if (state.status !== 'ready') return;
    const anchor = document.createElement('a'); anchor.href = state.url;
    anchor.download = createTShirtExportFilename(projectName, variation.name, presetId); anchor.click();
  };
  const clearProof = () => setProof((current) => {
    if (current.url) URL.revokeObjectURL(current.url);
    return { status: 'idle' };
  });
  const createProof = async () => {
    if (state.status !== 'ready') return;
    clearProof();
    setProof({ status: 'creating' });
    try {
      const result = await createProductProofMockup(product, state.url, presetId);
      setProof({ status: 'ready', url: result.url });
    } catch {
      setProof({ status: 'failed', message: 'Could not create the mockup proof.' });
    }
  };
  const downloadProof = () => {
    if (proof.status !== 'ready' || !proof.url) return;
    const anchor = document.createElement('a'); anchor.href = proof.url;
    anchor.download = `${createTShirtExportFilename(projectName, variation.name, presetId).replace(/\.png$/, '')}-mockup-proof.png`;
    anchor.click();
  };
  return <div ref={dialogRef} className="fixed inset-0 z-50 flex items-start justify-end bg-black/65 p-3 md:p-4" role="dialog" aria-modal="true" aria-labelledby="product-export-title" tabIndex={-1} onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="max-h-full w-full max-w-sm overflow-y-auto border border-neutral-700 bg-neutral-900 shadow-2xl">
      <header className="flex h-12 items-center justify-between border-b border-neutral-800 px-4"><div><h2 id="product-export-title" className="text-sm font-semibold">Print-ready PNG</h2><p className="text-[11px] text-neutral-400">Recommended download</p></div><button type="button" className="grid h-8 w-8 place-items-center text-neutral-400 hover:bg-neutral-800" aria-label="Close export" title="Close export" onClick={close}><X size={17} /></button></header>
      <div className="grid gap-3 p-4"><p className="border border-cyan-900/70 bg-cyan-950/35 px-3 py-2 text-xs leading-5 text-cyan-100">Exporting a PNG keeps your cleaned raster artwork and transparency intact. SVG is only for artwork you have traced or created as text.</p><section className="border border-neutral-800 bg-neutral-950/60 p-3" aria-labelledby="production-summary-title"><h3 id="production-summary-title" className="text-xs font-medium text-neutral-100">Production summary</h3><dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs"><dt className="text-neutral-500">Garment</dt><dd className="text-neutral-200">{summary.garment}</dd><dt className="text-neutral-500">Method</dt><dd className="text-neutral-200">{summary.method}</dd><dt className="text-neutral-500">Artwork</dt><dd className="truncate text-neutral-200" title={summary.artwork}>{summary.artwork}</dd><dt className="text-neutral-500">Print size</dt><dd className="text-neutral-200">{summary.printSize}</dd><dt className="text-neutral-500">Placement</dt><dd className="text-neutral-200">{summary.placement}</dd></dl></section><div role="radiogroup" aria-label="PNG preset" className="grid gap-2">{TSHIRT_EXPORT_PRESETS.map((preset) => <label key={preset.id} className="flex cursor-pointer gap-2 border border-neutral-700 p-3 text-xs"><input ref={preset.id === presetId ? selectedRef : undefined} type="radio" name="tshirt-export-preset" value={preset.id} checked={preset.id === presetId} onChange={() => setPresetId(preset.id)} /><span><strong>{preset.name}</strong><br />{preset.width} x {preset.height} px, {preset.dpi} DPI, {preset.physicalWidthInches} x {preset.physicalHeightInches} in<br /><span className={preset.classification === 'proof' ? 'text-amber-300' : 'text-emerald-300'}>{preset.classification === 'proof' ? 'Proof only' : 'Production'}</span></span></label>)}</div>
      {state.status === 'rendering' ? <p role="status" className="text-xs text-neutral-300">{state.stage === 'preparing-artwork' ? 'Preparing artwork' : state.stage === 'rendering-layers' ? 'Rendering layers' : 'Encoding PNG'}...</p> : null}
      {state.status === 'validating' ? <p role="status" className="text-xs text-neutral-300">Validating file...</p> : null}
      {state.status === 'failed' ? <p role="alert" className="text-xs text-red-300">{state.message}</p> : null}
      {state.status === 'ready' ? <><dl className="grid grid-cols-2 gap-y-1 text-xs text-neutral-300"><dt>Readiness</dt><dd>{state.receipt.readiness === 'proof-ready' ? 'Proof ready' : 'Ready to print'}</dd><dt>File</dt><dd>{state.receipt.width} x {state.receipt.height} px</dd><dt>Physical size</dt><dd>{state.receipt.physicalWidthInches} x {state.receipt.physicalHeightInches} in</dd><dt>Resolution</dt><dd>{state.receipt.dpiX} x {state.receipt.dpiY} DPI</dd><dt>Format</dt><dd>8-bit RGBA</dd><dt>Transparency</dt><dd>Present</dd><dt>File size</dt><dd>{formatFileSize(state.receipt.byteSize)}</dd><dt>Largest raster</dt><dd>{state.receipt.largestRasterScale.toFixed(2)}x</dd></dl>{state.receipt.readiness === 'proof-ready' ? <p className="text-xs text-amber-300">Proof only. Do not send this preset to production.</p> : null}{state.receipt.warnings.map((warning) => <p key={warning} className="text-xs text-amber-300">{warning}</p>)}</> : null}
      {proof.status === 'creating' ? <p role="status" className="text-xs text-neutral-300">Creating mockup proof...</p> : null}{proof.status === 'failed' ? <p role="alert" className="text-xs text-red-300">{proof.message}</p> : null}{proof.status === 'ready' ? <div className="grid gap-2 border border-amber-900/70 bg-amber-950/20 p-3"><img src={proof.url} alt={`${summary.garment} mockup proof`} className="max-h-60 w-full object-contain" /><p className="text-xs leading-5 text-amber-100">Proof only. This mockup estimates placement and garment color; use the PNG for production.</p><button type="button" className="flex h-9 items-center justify-center gap-2 border border-neutral-700 text-xs" onClick={downloadProof}><Download size={16} />Download mockup proof</button></div> : null}
      <div className="flex gap-2">{busy ? <button type="button" className="flex h-10 flex-1 items-center justify-center gap-2 border border-neutral-700 text-xs" onClick={() => { clearProof(); cancel(); }}><CircleStop size={16} />Cancel</button> : <button type="button" className="flex h-10 flex-1 items-center justify-center gap-2 bg-cyan-400 text-xs font-semibold text-cyan-950 disabled:opacity-40" disabled={!variation} onClick={() => { clearProof(); void generate(); }}><FileImage size={16} />{state.status === 'failed' ? 'Retry PNG' : 'Create PNG'}</button>}{state.status === 'ready' ? <button type="button" className="flex h-10 flex-1 items-center justify-center gap-2 border border-neutral-700 text-xs" onClick={download}><Download size={16} />Download PNG</button> : null}{state.status === 'ready' ? <button type="button" className="flex h-10 flex-1 items-center justify-center gap-2 border border-neutral-700 text-xs" disabled={proof.status === 'creating'} onClick={() => void createProof()}><FileImage size={16} />Mockup proof</button> : null}{state.status === 'failed' ? <button type="button" className="grid h-10 w-10 place-items-center border border-neutral-700" title="Reset export" aria-label="Reset export" onClick={() => { clearProof(); cancel(); }}><RotateCcw size={16} /></button> : null}</div></div>
    </section>
  </div>;
};
