import { CircleStop, Download, FileImage, RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { DesignVariation, EditorAsset } from '../../editor/model';
import { createProductProofMockup, createProofUrlOwner } from '../../editor/productProof';
import { createProductMockupScene, type ProductMockupScene } from '../../editor/productProof';
import type { TShirtMockupSlug, TShirtProductVariant } from '../../editor/productModel';
import { TSHIRT_MOCKUPS, getTShirtMockup } from '../../editor/productCatalog';
import {
  TSHIRT_EXPORT_PRESETS,
  createTShirtExportFilename,
  getTShirtExportPreset,
  type TShirtExportPresetId,
} from '../../editor/tshirtExportModel';
import { useAccessibleDialog } from '../useAccessibleDialog';
import { useTShirtPngExport } from './useTShirtPngExport';

const formatFileSize = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;

const printMethodLabels = {
  dtg: 'DTG',
  dtf: 'DTF transfer',
  vinyl: 'Cut vinyl',
} as const;

export const getProductExportSummary = (
  product: TShirtProductVariant,
  variation: DesignVariation,
  presetId: TShirtExportPresetId,
) => {
  const preset = getTShirtExportPreset(presetId);
  return {
    garment: getTShirtMockup(product.mockupSlug).name,
    method: printMethodLabels[product.printMethod],
    artwork: variation.name,
    printSize: `${preset.physicalWidthInches} x ${preset.physicalHeightInches} in`,
    placement: `${Math.round(product.placement.scale * 100)}% size, ${Math.round(product.placement.x * 100)}% across, ${Math.round(product.placement.y * 100)}% down`,
  };
};

export interface ProductExportDialogProps {
  open: boolean; projectName: string; variation: DesignVariation; product: TShirtProductVariant;
  assetsById: Record<string, EditorAsset>; returnFocusRef: RefObject<HTMLButtonElement | null>; onClose: () => void;
}

type ProductProofState =
  | { status: 'idle' }
  | { status: 'creating' }
  | { status: 'ready'; blob: Blob }
  | { status: 'failed'; message: string };

type ListingKitState = 'idle' | 'creating' | 'ready' | 'failed';

const sceneOptions: Array<{ id: ProductMockupScene; label: string }> = [
  { id: 'studio', label: 'Studio' },
  { id: 'technical', label: 'Technical grid' },
  { id: 'catalog', label: 'Catalog card' },
];

export const ProductExportDialog = ({ open, projectName, variation, product, assetsById, returnFocusRef, onClose }: ProductExportDialogProps) => {
  const [presetId, setPresetId] = useState<TShirtExportPresetId>('printify-full-front');
  const selectedRef = useRef<HTMLInputElement>(null);
  const dialogRef = useAccessibleDialog({ open, onClose, initialFocusRef: selectedRef, returnFocusRef });
  const { state, generate, cancel } = useTShirtPngExport({ presetId, variation, placement: product.placement, assetsById });
  const [proofState, setProofState] = useState<ProductProofState>({ status: 'idle' });
  const [listingColors, setListingColors] = useState<TShirtMockupSlug[]>(['black', 'heather', 'white']);
  const [listingScene, setListingScene] = useState<ProductMockupScene>('studio');
  const [listingKitState, setListingKitState] = useState<ListingKitState>('idle');
  const proofGenerationRef = useRef(0);
  const proofOwnerRef = useRef<ReturnType<typeof createProofUrlOwner> | null>(null);
  if (!proofOwnerRef.current) {
    proofOwnerRef.current = createProofUrlOwner((url) => URL.revokeObjectURL(url));
  }
  const clearProof = useCallback(() => {
    proofGenerationRef.current += 1;
    proofOwnerRef.current?.clear();
    setProofState({ status: 'idle' });
  }, []);
  useEffect(() => () => {
    proofGenerationRef.current += 1;
    proofOwnerRef.current?.clear();
  }, []);
  useEffect(() => {
    clearProof();
  }, [
    clearProof,
    presetId,
    variation,
    product.mockupSlug,
    product.printMethod,
    product.placement.x,
    product.placement.y,
    product.placement.scale,
    product.placement.rotation,
  ]);
  if (!open) return null;
  const summary = getProductExportSummary(product, variation, presetId);
  const busy = state.status === 'capturing' || state.status === 'rendering' || state.status === 'validating';
  const close = () => { cancel(); clearProof(); onClose(); };
  const download = () => {
    if (state.status !== 'ready') return;
    const anchor = document.createElement('a'); anchor.href = state.url;
    anchor.download = createTShirtExportFilename(projectName, variation.name, presetId); anchor.click();
  };
  const createProof = async () => {
    if (state.status !== 'ready') return;
    clearProof();
    const request = proofGenerationRef.current + 1;
    proofGenerationRef.current = request;
    setProofState({ status: 'creating' });
    try {
      const result = await createProductProofMockup(product, state.url, presetId);
      if (proofGenerationRef.current !== request) {
        URL.revokeObjectURL(result.url);
        return;
      }
      proofOwnerRef.current?.replace(result.url);
      setProofState({ status: 'ready', blob: result.blob });
    } catch {
      if (proofGenerationRef.current === request) {
        setProofState({ status: 'failed', message: 'Could not create the mockup proof.' });
      }
    }
  };
  const downloadProof = () => {
    const proofUrl = proofOwnerRef.current?.current();
    if (proofState.status !== 'ready' || !proofUrl) return;
    const anchor = document.createElement('a');
    anchor.href = proofUrl;
    anchor.download = createTShirtExportFilename(projectName, variation.name, presetId)
      .replace(/\.png$/, '-mockup-proof.png');
    anchor.click();
  };
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };
  const toggleListingColor = (slug: TShirtMockupSlug) => setListingColors((current) =>
    current.includes(slug) ? current.filter((candidate) => candidate !== slug) : [...current, slug]);
  const downloadHandoffSheet = async () => {
    const { createProductHandoffSheet } = await import('../../editor/listingKit');
    const colors = listingColors.map((slug) => getTShirtMockup(slug).name);
    downloadBlob(createProductHandoffSheet({
      projectName,
      artworkName: variation.name,
      product,
      presetId,
      colors,
    }), `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'inkmaster'}-production-handoff.pdf`);
  };
  const downloadListingKit = async () => {
    if (state.status !== 'ready' || listingColors.length === 0) return;
    setListingKitState('creating');
    try {
      const mockups = [] as Array<{ color: string; scene: string; blob: Blob }>;
      for (const slug of listingColors) {
        const proof = await createProductProofMockup({ ...product, mockupSlug: slug }, state.url, presetId);
        try {
          mockups.push({
            color: getTShirtMockup(slug).name,
            scene: listingScene,
            blob: await createProductMockupScene(proof.url, listingScene),
          });
        } finally {
          URL.revokeObjectURL(proof.url);
        }
      }
      const { createListingKit } = await import('../../editor/listingKit');
      const result = await createListingKit({
        projectName,
        artworkName: variation.name,
        product,
        presetId,
        printFile: state.blob,
        mockups,
      });
      downloadBlob(result.blob, result.filename);
      setListingKitState('ready');
    } catch {
      setListingKitState('failed');
    }
  };
  const proofUrl = proofOwnerRef.current.current();
  return <div ref={dialogRef} className="fixed inset-0 z-50 flex items-start justify-end bg-black/65 p-3 md:p-4" role="dialog" aria-modal="true" aria-labelledby="product-export-title" tabIndex={-1} onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="max-h-full w-full max-w-sm overflow-y-auto border border-neutral-700 bg-neutral-900 shadow-2xl">
      <header className="flex min-h-12 items-center justify-between border-b border-neutral-800 pl-4 pr-2"><div><h2 id="product-export-title" className="text-sm font-semibold">Print-ready PNG</h2><p className="text-xs text-neutral-400">Recommended download</p></div><button type="button" className="grid h-11 w-11 place-items-center text-neutral-400 hover:bg-neutral-800" aria-label="Close export" title="Close export" onClick={close}><X size={17} /></button></header>
      <div className="grid gap-3 p-4"><p className="border border-cyan-900/70 bg-cyan-950/35 px-3 py-2 text-xs leading-5 text-cyan-100">Exporting a PNG keeps your cleaned raster artwork and transparency intact. SVG is only for artwork you have traced or created as text.</p><section aria-labelledby="production-summary-title" className="grid gap-2 border border-neutral-700 bg-neutral-950/60 p-3"><h3 id="production-summary-title" className="text-xs font-semibold text-neutral-100">Production summary</h3><dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-neutral-300"><dt className="text-neutral-500">Garment</dt><dd>{summary.garment}</dd><dt className="text-neutral-500">Method</dt><dd>{summary.method}</dd><dt className="text-neutral-500">Artwork</dt><dd>{summary.artwork}</dd><dt className="text-neutral-500">Print size</dt><dd>{summary.printSize}</dd><dt className="text-neutral-500">Placement</dt><dd>{summary.placement}</dd></dl></section><div role="radiogroup" aria-label="PNG preset" className="grid gap-2">{TSHIRT_EXPORT_PRESETS.map((preset) => <label key={preset.id} className="flex cursor-pointer gap-2 border border-neutral-700 p-3 text-xs"><input ref={preset.id === presetId ? selectedRef : undefined} type="radio" name="tshirt-export-preset" value={preset.id} checked={preset.id === presetId} onChange={() => { clearProof(); setPresetId(preset.id); }} /><span><strong>{preset.name}</strong><br />{preset.width} x {preset.height} px, {preset.dpi} DPI, {preset.physicalWidthInches} x {preset.physicalHeightInches} in<br /><span className={preset.classification === 'proof' ? 'text-amber-300' : 'text-emerald-300'}>{preset.classification === 'proof' ? 'Proof only' : 'Production'}</span></span></label>)}</div>
      {state.status === 'rendering' ? <p role="status" className="text-xs text-neutral-300">{state.stage === 'preparing-artwork' ? 'Preparing artwork' : state.stage === 'rendering-layers' ? 'Rendering layers' : 'Encoding PNG'}...</p> : null}
      {state.status === 'validating' ? <p role="status" className="text-xs text-neutral-300">Validating file...</p> : null}
      {state.status === 'failed' ? <p role="alert" className="text-xs text-red-300">{state.message}</p> : null}
      {state.status === 'ready' ? <><dl className="grid grid-cols-2 gap-y-1 text-xs text-neutral-300"><dt>Readiness</dt><dd>{state.receipt.readiness === 'proof-ready' ? 'Proof ready' : 'Ready to print'}</dd><dt>File</dt><dd>{state.receipt.width} x {state.receipt.height} px</dd><dt>Physical size</dt><dd>{state.receipt.physicalWidthInches} x {state.receipt.physicalHeightInches} in</dd><dt>Resolution</dt><dd>{state.receipt.dpiX} x {state.receipt.dpiY} DPI</dd><dt>Format</dt><dd>8-bit RGBA</dd><dt>Transparency</dt><dd>Present</dd><dt>File size</dt><dd>{formatFileSize(state.receipt.byteSize)}</dd><dt>Largest raster</dt><dd>{state.receipt.largestRasterScale.toFixed(2)}x</dd></dl>{state.receipt.readiness === 'proof-ready' ? <p className="text-xs text-amber-300">Proof only. Do not send this preset to production.</p> : null}{state.receipt.warnings.map((warning) => <p key={warning} className="text-xs text-amber-300">{warning}</p>)}</> : null}
      {state.status === 'ready' ? <button type="button" className="flex h-11 items-center justify-center gap-2 border border-neutral-700 text-xs font-medium disabled:opacity-40" disabled={proofState.status === 'creating'} onClick={() => void createProof()}><FileImage size={16} />{proofState.status === 'creating' ? 'Creating mockup proof' : 'Create mockup proof'}</button> : null}
      {proofState.status === 'creating' ? <p role="status" className="text-xs text-neutral-300">Creating mockup proof...</p> : null}
      {proofState.status === 'failed' ? <p role="alert" className="text-xs text-red-300">{proofState.message}</p> : null}
      {proofState.status === 'ready' && proofUrl ? <section className="grid gap-2"><img src={proofUrl} alt={`${summary.garment} mockup proof`} className="w-full border border-neutral-700" /><p className="text-xs leading-5 text-amber-300">Proof only. This mockup estimates placement and garment color. Use the PNG for production.</p><button type="button" className="flex h-11 items-center justify-center gap-2 border border-neutral-700 text-xs font-medium" onClick={downloadProof}><Download size={16} />Download mockup proof</button></section> : null}
      {state.status === 'ready' ? <section className="grid gap-3 border border-neutral-700 bg-neutral-950/60 p-3" aria-labelledby="listing-kit-title"><div><h3 id="listing-kit-title" className="text-xs font-semibold text-neutral-100">Listing kit</h3><p className="mt-1 text-xs leading-5 text-neutral-500">Bundle the production PNG, selected storefront mockups, and a printer handoff sheet.</p></div><fieldset className="grid gap-2"><legend className="text-xs font-medium text-neutral-300">Garment variants</legend><div className="grid grid-cols-3 gap-2">{TSHIRT_MOCKUPS.map((mockup) => <label key={mockup.slug} className={`flex min-h-10 cursor-pointer items-center gap-2 border px-2 text-xs ${listingColors.includes(mockup.slug) ? 'border-emerald-500 bg-emerald-950/30 text-emerald-100' : 'border-neutral-700 text-neutral-300'}`}><input type="checkbox" checked={listingColors.includes(mockup.slug)} onChange={() => toggleListingColor(mockup.slug)} /><span className="h-3 w-3 border border-neutral-500" style={{ backgroundColor: mockup.swatch }} /><span>{mockup.name}</span></label>)}</div></fieldset><label className="grid gap-1 text-xs text-neutral-300">Mockup presentation<select className="h-10 border border-neutral-700 bg-neutral-900 px-2 text-xs text-neutral-100" value={listingScene} onChange={(event) => setListingScene(event.currentTarget.value as ProductMockupScene)}>{sceneOptions.map((scene) => <option key={scene.id} value={scene.id}>{scene.label}</option>)}</select></label><div className="grid grid-cols-2 gap-2"><button type="button" className="flex h-11 items-center justify-center gap-2 border border-neutral-700 text-xs font-medium" onClick={() => void downloadHandoffSheet()}><Download size={16} />Handoff sheet</button><button type="button" className="flex h-11 items-center justify-center gap-2 bg-emerald-500 text-xs font-semibold text-neutral-950 disabled:opacity-40" disabled={listingColors.length === 0 || listingKitState === 'creating'} onClick={() => void downloadListingKit()}><Download size={16} />{listingKitState === 'creating' ? 'Building kit' : 'Download kit'}</button></div>{listingKitState === 'ready' ? <p className="text-xs text-emerald-300">Listing kit downloaded.</p> : null}{listingKitState === 'failed' ? <p role="alert" className="text-xs text-red-300">Could not build the listing kit.</p> : null}</section> : null}
      <div className="flex gap-2">{busy ? <button type="button" className="flex h-11 flex-1 items-center justify-center gap-2 border border-neutral-700 text-xs" onClick={() => { cancel(); clearProof(); }}><CircleStop size={16} />Cancel</button> : <button type="button" className="flex h-11 flex-1 items-center justify-center gap-2 bg-cyan-400 text-xs font-semibold text-cyan-950 disabled:opacity-40" disabled={!variation} onClick={() => { clearProof(); void generate(); }}><FileImage size={16} />{state.status === 'failed' ? 'Retry PNG' : 'Create PNG'}</button>}{state.status === 'ready' ? <button type="button" className="flex h-11 flex-1 items-center justify-center gap-2 border border-neutral-700 text-xs" onClick={download}><Download size={16} />Download PNG</button> : null}{state.status === 'failed' ? <button type="button" className="grid h-11 w-11 place-items-center border border-neutral-700" title="Reset export" aria-label="Reset export" onClick={() => { cancel(); clearProof(); }}><RotateCcw size={16} /></button> : null}</div></div>
    </section>
  </div>;
};
