import React, { useRef, useState } from 'react';
import JSZip from 'jszip';
import { DEFAULT_PRINT_SPECIFICATION } from '../constants';
import { ArtworkAnalysis, PreflightFinding, ProcessingSettings, RecipeId } from '../types';
import { analyzeArtwork } from '../services/artworkAnalysis';
import { fileToBase64, processImage } from '../services/imageProcessing';
import { evaluatePreflight } from '../services/preflight';
import { recommendRecipe, resolveRecipeSettings } from '../services/recipes';
import {
  batchExportEligibility,
  BatchProductionStatus,
  createCombinedOrderManifest,
} from '../services/batch';

interface BatchProcessorProps {
  onClose: () => void;
  defaultSettings: ProcessingSettings;
}

interface GuidedBatchItem {
  id: string;
  file: File;
  previewUrl: string;
  status: BatchProductionStatus;
  analysis: ArtworkAnalysis | null;
  recipeId: RecipeId | null;
  settings: ProcessingSettings;
  findings: PreflightFinding[];
  acknowledged: boolean;
  resultBlob: Blob | null;
  error: string | null;
}

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
};

export const BatchProcessor: React.FC<BatchProcessorProps> = ({ onClose, defaultSettings }) => {
  const [items, setItems] = useState<GuidedBatchItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateItem = (id: string, update: Partial<GuidedBatchItem>) =>
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...update } : item));

  const processItem = async (item: GuidedBatchItem) => {
    updateItem(item.id, { status: 'analyzing', error: null });
    try {
      const base64 = await fileToBase64(item.file);
      const dataUrl = `data:${item.file.type};base64,${base64}`;
      const analysis = await analyzeArtwork(dataUrl);
      const recommendation = recommendRecipe(analysis);
      const settings = resolveRecipeSettings(recommendation.recipeId, analysis, defaultSettings);
      const findings = evaluatePreflight(analysis, DEFAULT_PRINT_SPECIFICATION, settings);
      updateItem(item.id, {
        status: 'processing',
        analysis,
        recipeId: recommendation.recipeId,
        settings,
        findings,
      });
      const result = await processImage(dataUrl, settings);
      updateItem(item.id, { status: 'ready', resultBlob: result.blob });
    } catch (error) {
      console.error(error);
      updateItem(item.id, { status: 'failed', error: 'Could not analyze or process this artwork.' });
    }
  };

  const addFiles = (files: FileList | File[]) => {
    const next = Array.from(files)
      .filter((file) => ['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'].includes(file.type))
      .map<GuidedBatchItem>((file) => ({
        id: `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        status: 'pending',
        analysis: null,
        recipeId: null,
        settings: { ...defaultSettings, colorReplacements: [...defaultSettings.colorReplacements] },
        findings: [],
        acknowledged: false,
        resultBlob: null,
        error: null,
      }));
    setItems((current) => [...current, ...next]);
    next.forEach((item) => void processItem(item));
  };

  const exportCombined = async () => {
    const eligible = items.filter((item) => batchExportEligibility(item.status, item.findings, item.acknowledged).canExport && item.resultBlob);
    if (!eligible.length) return;
    const zip = new JSZip();
    for (const item of eligible) {
      zip.file(`${item.file.name.replace(/\.[^.]+$/, '')}.${item.settings.format.toLowerCase()}`, await item.resultBlob!.arrayBuffer());
    }
    zip.file('order-manifest.json', JSON.stringify(createCombinedOrderManifest(items.map((item) => ({
      id: item.id,
      filename: item.file.name,
      status: item.status,
      findings: item.findings,
      acknowledged: item.acknowledged,
    }))), null, 2));
    downloadBlob(await zip.generateAsync({ type: 'blob' }), 'inkmaster-combined-order.zip');
  };

  const eligibleCount = items.filter((item) => batchExportEligibility(item.status, item.findings, item.acknowledged).canExport).length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-slate-200">
      <header className="flex h-16 flex-none items-center justify-between border-b border-slate-800 px-4 lg:px-6">
        <div>
          <h2 className="text-lg font-black text-white">Guided batch production</h2>
          <p className="text-xs text-slate-500">One recipe and preflight result per artwork file. Nothing blocked is silently exported.</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-bold text-slate-300 hover:text-white">Close</button>
      </header>

      <div className="flex flex-none flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-3 lg:px-6">
        <button type="button" onClick={() => inputRef.current?.click()} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-black text-white hover:bg-indigo-500">Add artwork</button>
        <input ref={inputRef} type="file" multiple accept=".jpg,.jpeg,.png,.svg,.webp" className="hidden" onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.target.value = ''; }} />
        <button type="button" disabled={!eligibleCount} onClick={() => void exportCombined()} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-black text-white hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500">Export combined order ({eligibleCount})</button>
        <span className="text-xs text-slate-500">{items.length} total · {items.length - eligibleCount} waiting, warning, failed, cancelled, or blocked</span>
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
        {items.length === 0 ? (
          <button type="button" onClick={() => inputRef.current?.click()} className="flex min-h-80 w-full items-center justify-center rounded-2xl border-2 border-dashed border-slate-700 text-center hover:border-indigo-500">
            <span><span className="block text-lg font-black text-white">Drop in an order’s artwork</span><span className="mt-2 block text-sm text-slate-500">Each design receives a recipe recommendation and production preflight.</span></span>
          </button>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {items.map((item) => {
              const eligibility = batchExportEligibility(item.status, item.findings, item.acknowledged);
              const warnings = item.findings.filter((finding) => finding.severity === 'warning');
              const critical = item.findings.filter((finding) => finding.severity === 'critical');
              return (
                <article key={item.id} className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                  <img src={item.previewUrl} alt="" className="h-24 w-20 rounded-lg bg-slate-950 object-contain" />
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-black text-white">{item.file.name}</h3>
                        <p className="mt-1 text-[11px] text-slate-500">{item.recipeId ? `Recipe: ${item.recipeId}` : item.status}</p>
                      </div>
                      <span className={`rounded px-2 py-1 text-[9px] font-black uppercase ${eligibility.canExport ? 'bg-emerald-500/15 text-emerald-300' : critical.length ? 'bg-rose-500/15 text-rose-300' : warnings.length ? 'bg-amber-500/15 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>{eligibility.canExport ? 'ready' : item.status}</span>
                    </div>
                    {item.error && <p className="mt-2 text-xs text-rose-300">{item.error}</p>}
                    {item.findings.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {item.findings.filter((finding) => finding.severity !== 'pass').map((finding) => <span key={finding.id} title={finding.action} className={`rounded px-2 py-1 text-[9px] font-bold ${finding.severity === 'critical' ? 'bg-rose-500/15 text-rose-300' : 'bg-amber-500/15 text-amber-300'}`}>{finding.title}</span>)}
                        {!warnings.length && !critical.length && <span className="text-[10px] font-bold text-emerald-400">Preflight passed</span>}
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {warnings.length > 0 && critical.length === 0 && (
                        <label className="flex items-center gap-2 text-[10px] text-slate-300">
                          <input type="checkbox" checked={item.acknowledged} onChange={(event) => updateItem(item.id, { acknowledged: event.target.checked })} className="accent-indigo-500" />
                          Approve warnings
                        </label>
                      )}
                      {item.status === 'ready' && <button type="button" onClick={() => updateItem(item.id, { status: 'cancelled' })} className="text-[10px] font-bold text-slate-500 hover:text-rose-300">Cancel item</button>}
                      {item.status === 'failed' && <button type="button" onClick={() => void processItem(item)} className="text-[10px] font-bold text-indigo-300">Retry</button>}
                      {eligibility.canExport && item.resultBlob && <button type="button" onClick={() => downloadBlob(item.resultBlob!, `${item.file.name.replace(/\.[^.]+$/, '')}.${item.settings.format.toLowerCase()}`)} className="text-[10px] font-bold text-emerald-300">Export design</button>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};
