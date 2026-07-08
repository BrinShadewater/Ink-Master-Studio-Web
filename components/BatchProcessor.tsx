import React, { useEffect, useRef, useState } from 'react';
import { DEFAULT_PRINT_SPECIFICATION } from '../constants';
import { ArtworkAnalysis, PreflightFinding, ProcessingSettings, ProductionProfile, RecipeId } from '../types';
import { analyzeArtwork } from '../services/artworkAnalysis';
import { fileToBase64, processImage } from '../services/imageProcessing';
import { evaluatePreflight } from '../services/preflight';
import { RECIPES, resolveRecipeSettings } from '../services/recipes';
import {
  batchExportEligibility,
  buildCombinedBatchOrderPackage,
  buildSingleBatchItemPackage,
  BatchRecipeSelection,
  BatchProductionStatus,
  createBatchItemBlockers,
  resolveBatchRecipe,
} from '../services/batch';
import { revokeObjectUrl } from '../services/objectUrls';
import { createProcessingRunRegistry, ProcessingRunRegistry } from '../services/processingRuns';

interface BatchProcessorProps {
  onClose: () => void;
  defaultSettings: ProcessingSettings;
  productionProfile: ProductionProfile;
}

interface GuidedBatchItem {
  id: string;
  file: File;
  previewUrl: string;
  status: BatchProductionStatus;
  analysis: ArtworkAnalysis | null;
  recipeId: RecipeId | null;
  recipeSelection: BatchRecipeSelection;
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

export const BatchProcessor: React.FC<BatchProcessorProps> = ({
  onClose,
  defaultSettings,
  productionProfile,
}) => {
  const [items, setItems] = useState<GuidedBatchItem[]>([]);
  const [batchRecipeSelection, setBatchRecipeSelection] = useState<BatchRecipeSelection>('auto');
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<GuidedBatchItem[]>([]);
  const processingRunsRef = useRef<ProcessingRunRegistry | null>(null);
  if (processingRunsRef.current === null) {
    processingRunsRef.current = createProcessingRunRegistry();
  }

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => () => {
    processingRunsRef.current?.cancelAll();
    itemsRef.current.forEach((item) => revokeObjectUrl(item.previewUrl));
  }, []);

  const updateItem = (id: string, update: Partial<GuidedBatchItem>) =>
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...update } : item));

  const updateItemIfRunActive = (id: string, runId: string, update: Partial<GuidedBatchItem>) =>
    setItems((current) => {
      if (!processingRunsRef.current?.isActive(id, runId)) return current;
      return current.map((item) => item.id === id ? { ...item, ...update } : item);
    });

  const processItem = async (item: GuidedBatchItem, recipeSelection = item.recipeSelection) => {
    const runId = processingRunsRef.current.begin(item.id);
    updateItemIfRunActive(item.id, runId, { status: 'analyzing', error: null });
    try {
      const base64 = await fileToBase64(item.file);
      if (!processingRunsRef.current?.isActive(item.id, runId)) return;
      const dataUrl = `data:${item.file.type};base64,${base64}`;
      const analysis = await analyzeArtwork(dataUrl);
      if (!processingRunsRef.current?.isActive(item.id, runId)) return;
      const recipeId = resolveBatchRecipe(recipeSelection, analysis);
      const settings = resolveRecipeSettings(recipeId, analysis, defaultSettings);
      const findings = evaluatePreflight(
        analysis,
        DEFAULT_PRINT_SPECIFICATION,
        settings,
        productionProfile,
      );
      updateItemIfRunActive(item.id, runId, {
        status: 'processing',
        analysis,
        recipeId,
        recipeSelection,
        settings,
        findings,
        acknowledged: false,
      });
      const result = await processImage(dataUrl, settings);
      updateItemIfRunActive(item.id, runId, { status: 'ready', resultBlob: result.blob });
    } catch (error) {
      console.error(error);
      updateItemIfRunActive(item.id, runId, { status: 'failed', error: 'Could not analyze or process this artwork.' });
    } finally {
      processingRunsRef.current?.finish(item.id, runId);
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
        recipeSelection: batchRecipeSelection,
        settings: { ...defaultSettings, colorReplacements: [...defaultSettings.colorReplacements] },
        findings: [],
        acknowledged: false,
        resultBlob: null,
        error: null,
      }));
    setItems((current) => [...current, ...next]);
    next.forEach((item) => void processItem(item));
  };

  const applyBatchRecipeToExisting = () => {
    const reprocessable = items.filter((item) => item.status !== 'processing' && item.status !== 'analyzing');
    setItems((current) => current.map((item) => reprocessable.some((candidate) => candidate.id === item.id)
      ? {
          ...item,
          recipeSelection: batchRecipeSelection,
          recipeId: null,
          findings: [],
          acknowledged: false,
          resultBlob: null,
          error: null,
          status: 'pending',
        }
      : item));
    reprocessable.forEach((item) => void processItem({ ...item, recipeSelection: batchRecipeSelection }, batchRecipeSelection));
  };

  const updateItemRecipe = (item: GuidedBatchItem, recipeSelection: BatchRecipeSelection) => {
    updateItem(item.id, {
      recipeSelection,
      recipeId: null,
      findings: [],
      acknowledged: false,
      resultBlob: null,
      error: null,
      status: 'pending',
    });
    void processItem({ ...item, recipeSelection }, recipeSelection);
  };

  const exportCombined = async () => {
    const eligible = items.filter((item) => batchExportEligibility(item.status, item.findings, item.acknowledged).canExport && item.resultBlob);
    if (!eligible.length) return;
    const result = await buildCombinedBatchOrderPackage(items.map((item) => ({
      id: item.id,
      filename: item.file.name,
      status: item.status,
      recipeId: item.recipeId,
      findings: item.findings,
      acknowledged: item.acknowledged,
      format: item.settings.format,
      resultBlob: item.resultBlob,
    })));
    downloadBlob(result.blob, result.filename);
  };

  const exportSinglePackage = async (item: GuidedBatchItem) => {
    if (!item.resultBlob) return;
    const result = await buildSingleBatchItemPackage({
      id: item.id,
      filename: item.file.name,
      status: item.status,
      recipeId: item.recipeId,
      recipeSelection: item.recipeSelection,
      findings: item.findings,
      acknowledged: item.acknowledged,
      format: item.settings.format,
      resultBlob: item.resultBlob,
    });
    downloadBlob(result.blob, result.filename);
  };

  const eligibleCount = items.filter((item) => batchExportEligibility(item.status, item.findings, item.acknowledged).canExport).length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-slate-200">
      <header className="flex min-h-16 flex-none flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 lg:px-6">
        <div className="min-w-0">
          <h2 className="text-lg font-black text-white">Guided batch production</h2>
          <p className="text-xs text-slate-500">One recipe and preflight result per artwork file. Batch ZIPs prep artwork; final production packages still require proof approval.</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-bold text-slate-300 hover:text-white">Close</button>
      </header>

      <div className="flex flex-none flex-wrap items-center gap-3 overflow-x-auto border-b border-slate-800 px-4 py-3 lg:px-6">
        <button type="button" onClick={() => inputRef.current?.click()} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-black text-white hover:bg-indigo-500">Add artwork</button>
        <input ref={inputRef} type="file" multiple accept=".jpg,.jpeg,.png,.svg,.webp" className="hidden" onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.target.value = ''; }} />
        <label className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-slate-400">
          Batch recipe
          <select value={batchRecipeSelection} onChange={(event) => setBatchRecipeSelection(event.target.value as BatchRecipeSelection)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-200 outline-none focus:border-indigo-500">
            <option value="auto">Auto per file</option>
            {RECIPES.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}
          </select>
        </label>
        <button type="button" disabled={!items.length} onClick={applyBatchRecipeToExisting} className="rounded-lg border border-slate-700 px-4 py-2.5 text-xs font-bold text-slate-300 hover:border-indigo-500 disabled:opacity-30">Apply to existing</button>
        <button type="button" disabled={!eligibleCount} onClick={() => void exportCombined()} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-black text-white hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500">Export batch prep ZIP ({eligibleCount})</button>
        <span className="text-xs text-slate-500">{items.length} total · {items.length - eligibleCount} waiting, warning, failed, cancelled, or blocked</span>
        <span className="basis-full text-[10px] font-semibold uppercase tracking-widest text-amber-300 sm:basis-auto">
          Production handoff happens in a job after customer proof approval.
        </span>
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
              const blockers = eligibility.canExport
                ? []
                : createBatchItemBlockers({
                    id: item.id,
                    filename: item.file.name,
                    status: item.status,
                    recipeId: item.recipeId,
                    findings: item.findings,
                    acknowledged: item.acknowledged,
                  }, eligibility);
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
                    {blockers.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {blockers.slice(0, 2).map((reason) => (
                          <p key={reason} className={`rounded-lg border px-3 py-2 text-[10px] font-semibold ${critical.length ? 'border-rose-500/30 bg-rose-500/10 text-rose-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>
                            {reason}
                          </p>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <select
                        value={item.recipeSelection}
                        disabled={item.status === 'processing' || item.status === 'analyzing'}
                        onChange={(event) => updateItemRecipe(item, event.target.value as BatchRecipeSelection)}
                        aria-label={`Recipe for ${item.file.name}`}
                        className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] font-bold text-slate-300 disabled:opacity-40"
                      >
                        <option value="auto">Auto recipe</option>
                        {RECIPES.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}
                      </select>
                      {warnings.length > 0 && critical.length === 0 && (
                        <label className="flex items-center gap-2 text-[10px] text-slate-300">
                          <input type="checkbox" checked={item.acknowledged} onChange={(event) => updateItem(item.id, { acknowledged: event.target.checked })} className="accent-indigo-500" />
                          Approve warnings
                        </label>
                      )}
                      {item.status === 'ready' && <button type="button" onClick={() => updateItem(item.id, { status: 'cancelled' })} className="text-[10px] font-bold text-slate-500 hover:text-rose-300">Cancel item</button>}
                      {item.status === 'failed' && <button type="button" onClick={() => void processItem(item)} className="text-[10px] font-bold text-indigo-300">Retry</button>}
                      {eligibility.canExport && item.resultBlob && <button type="button" onClick={() => void exportSinglePackage(item)} className="text-[10px] font-bold text-emerald-300">Export prep ZIP</button>}
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
