import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { AnimatedBackground } from './components/AnimatedBackground';
import { Dropzone } from './components/Dropzone';
import { Header } from './components/Header';
import { JobLibrary } from './components/JobLibrary';
import { TemplatesPopover } from './components/TemplatesPopover';
import { Preview } from './components/Preview';
import { StudioTopBar } from './components/StudioTopBar';
import { VersionsPopover } from './components/VersionsPopover';
import { WorkflowInspector } from './components/WorkflowInspector';
import { Checkpoint } from './components/CheckpointBar';
import { AppliedProductionProfileContext } from './components/PreflightPanel';
import {
  ArtworkAnalysis,
  ExportHistoryEntry,
  ProcessingSettings,
  ProcessedResult,
  RecipeId,
  RecipeRecommendation,
  ShirtColor,
  ShopTemplate,
  StudioJob,
  WorkspaceStage,
} from './types';
import { DEFAULT_PRINT_SPECIFICATION, DEFAULT_SETTINGS } from './constants';
import {
  fileToBase64,
  compositeMockup,
  generatePalette,
  generatePrintPDF,
  generateUnderbase,
  processImage,
} from './services/imageProcessing';
import { analyzeArtwork } from './services/artworkAnalysis';
import { recommendRecipe, resolveRecipeSettings } from './services/recipes';
import { createStudioJob, duplicateStudioJob, touchStudioJob } from './services/jobModel';
import { archiveJob, listJobs, saveJob } from './services/jobRepository';
import { exportPortableJob, importPortableJob } from './services/portableJob';
import {
  combinePreflightFindings,
  createPlacementPreflightFinding,
  DEFAULT_PLACEMENT,
  ensurePlacementForProduct,
  getPrintableArea,
  mockupPercentToPlacement,
  placementToMockupPercent,
  placementVariantKey,
  storePlacementVariant,
  transitionJobProductionState,
  validatePlacement,
} from './services/placement';
import { evaluatePreflight, getPreflightGate } from './services/preflight';
import { getDefaultProfile, loadProfileStore } from './services/profileStorage';
import { createProductionProfile, snapshotProductionProfile } from './services/productionProfiles';
import { buildProductionPackage, PackageAsset } from './services/productionPackage';
import { generateCustomerProof } from './services/proofBuilder';
import {
  applyTemplateToJob,
  createTemplateFromJob,
  exportTemplates,
  importTemplates,
  loadTemplates,
  saveTemplates,
} from './services/templateStorage';

const BatchProcessor = lazy(() => import('./components/BatchProcessor').then((module) => ({ default: module.BatchProcessor })));

interface AppState {
  image: string | null;
  settings: ProcessingSettings;
  hasUsedAi: boolean;
}

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
};

const blobToDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error ?? new Error('Could not read artwork.'));
  reader.readAsDataURL(blob);
});

const jobFilename = (job: StudioJob) =>
  `${job.metadata.name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'inkmaster-job'}.inkmaster-job`;

const MOCKUP_FILES = [
  ['red', '/mockups/mockup-red.png'],
  ['charcoal', '/mockups/mockup-charcoal.png'],
  ['heather', '/mockups/mockup-heather.png'],
  ['military-green', '/mockups/mockup-miltarygreen.png'],
  ['forest-green', '/mockups/mockup-forestgreen.png'],
  ['cardinal', '/mockups/mockup-cardinal.png'],
  ['black', '/mockups/mockup-black.png'],
  ['burgundy', '/mockups/mockup-burgundy.png'],
  ['navy', '/mockups/mockup-navy.png'],
  ['orange', '/mockups/mockup-orange.png'],
  ['royal-blue', '/mockups/mockup-royalblue.png'],
] as const;

const STANDARD_DTG_FALLBACK_PROFILE = createProductionProfile('Standard DTG');
const STANDARD_DTG_FALLBACK_APPLIED = snapshotProductionProfile(STANDARD_DTG_FALLBACK_PROFILE);
const BATCH_DEFAULT_PROFILE = getDefaultProfile(loadProfileStore());

const App: React.FC = () => {
  const [history, setHistory] = useState<AppState[]>([{ image: null, settings: DEFAULT_SETTINGS, hasUsedAi: false }]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [appState, setAppState] = useState<AppState>(history[0]);
  const [processedResult, setProcessedResult] = useState<ProcessedResult | null>(null);
  const [analysis, setAnalysis] = useState<ArtworkAnalysis | null>(null);
  const [recommendation, setRecommendation] = useState<RecipeRecommendation | null>(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState<RecipeId | null>(null);
  const [stage, setStage] = useState<WorkspaceStage>('goal');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [palette, setPalette] = useState<string[]>([]);
  const [showBatch, setShowBatch] = useState(false);
  const [exportHistory, setExportHistory] = useState<ExportHistoryEntry[]>([]);
  const [isEyedropperMode, setIsEyedropperMode] = useState(false);
  const [lowResolutionAcknowledged, setLowResolutionAcknowledged] = useState(false);
  const [mockupExportToken, setMockupExportToken] = useState(0);
  const [currentJob, setCurrentJob] = useState<StudioJob | null>(null);
  const [jobs, setJobs] = useState<StudioJob[]>([]);
  const [showJobs, setShowJobs] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [shopTemplates, setShopTemplates] = useState<ShopTemplate[]>([]);

  const originalImage = appState.image;
  const settings = appState.settings;
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;
  const dpiInfo = analysis?.printQuality ?? null;
  const printSpecification = currentJob?.printSpecification ?? DEFAULT_PRINT_SPECIFICATION;
  const appliedProductionProfile = currentJob?.productionProfile ?? STANDARD_DTG_FALLBACK_APPLIED;
  const activeProductionProfile = appliedProductionProfile.snapshot;
  const fallbackPlacementKey = placementVariantKey(
    DEFAULT_PLACEMENT.itemType,
    DEFAULT_PLACEMENT.location,
    DEFAULT_PLACEMENT.garmentSize,
  );
  const placementState = ensurePlacementForProduct(
    currentJob?.placements ?? { [fallbackPlacementKey]: DEFAULT_PLACEMENT },
    currentJob?.activePlacementKey ?? fallbackPlacementKey,
    settings.itemType,
    activeProductionProfile,
  );
  const activePlacement = placementState.placement;
  const activePrintableArea = getPrintableArea(
    activePlacement.itemType,
    activePlacement.location,
    activeProductionProfile,
  );
  const preflightFindings = useMemo(
    () => combinePreflightFindings(
      analysis ? evaluatePreflight(
          analysis,
          printSpecification,
          settings,
          activeProductionProfile,
        )
        : [],
      createPlacementPreflightFinding(activePlacement, activeProductionProfile),
    ),
    [activePlacement, activeProductionProfile, analysis, printSpecification, settings],
  );
  const preflightAcknowledged = Boolean(
    currentJob && currentJob.acknowledgedPreflightRevision === currentJob.revision,
  );
  const preflightGate = getPreflightGate(preflightFindings, preflightAcknowledged);
  const productionPlacement = validatePlacement(activePlacement, activeProductionProfile).valid
    ? placementToMockupPercent(activePlacement, activeProductionProfile)
    : undefined;
  const currentProductionJob = currentJob ? {
    ...currentJob,
    settings,
    activePlacementKey: placementState.activePlacementKey,
    placements: placementState.placements,
    preflightFindings,
  } : null;

  const refreshJobs = async () => {
    try {
      setJobs(await listJobs());
    } catch (storageError) {
      console.warn('Could not load local jobs:', storageError);
    }
  };

  const updateCurrentJob = (update: (job: StudioJob) => StudioJob, incrementRevision = true) => {
    setCurrentJob((job) => {
      if (!job) return job;
      const next = update(job);
      return incrementRevision ? touchStudioJob(next) : next;
    });
  };

  useEffect(() => {
    void refreshJobs();
    setShopTemplates(loadTemplates());
  }, []);

  useEffect(() => {
    if (!currentJob) return;
    setSaveStatus('saving');
    const timer = window.setTimeout(() => {
      void saveJob(currentJob)
        .then(() => {
          setSaveStatus('saved');
          void refreshJobs();
        })
        .catch((storageError) => {
          console.error(storageError);
          setSaveStatus('error');
        });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [currentJob]);

  useEffect(() => {
    if (!currentJob || JSON.stringify(currentJob.preflightFindings) === JSON.stringify(preflightFindings)) return;
    setCurrentJob((job) => job ? { ...job, preflightFindings } : job);
  }, [currentJob?.id, preflightFindings]);

  useEffect(() => {
    const state = history[historyIndex];
    if (!state) return;
    setAppState(state);
    setCurrentJob((job) => {
      if (!job) return job;
      const synchronized = transitionJobProductionState(
        job,
        state.settings,
        job.productionProfile.snapshot,
        true,
      );
      return synchronized.changed ? touchStudioJob(synchronized.job) : job;
    });
  }, [history, historyIndex]);

  useEffect(() => {
    if (!originalImage) {
      setPalette([]);
      return;
    }
    void generatePalette(originalImage).then(setPalette).catch(() => setPalette([]));
  }, [originalImage]);

  useEffect(() => {
    if (!originalImage) return;
    const timer = window.setTimeout(async () => {
      setIsProcessing(true);
      setError(null);
      try {
        setProcessedResult(await processImage(originalImage, settings));
      } catch (processingError) {
        console.error(processingError);
        setError('Ink Master could not process this artwork. Try a different treatment or file.');
      } finally {
        setIsProcessing(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [originalImage, settings]);

  const addToHistory = (state: AppState) => {
    setHistory((current) => {
      const next = [...current.slice(0, historyIndex + 1), state];
      setHistoryIndex(next.length - 1);
      return next;
    });
    setAppState(state);
  };

  const addToExportHistory = (entry: Omit<ExportHistoryEntry, 'id'>) => {
    const storedEntry = { ...entry, id: `export_${Date.now()}` };
    setExportHistory((current) => [storedEntry, ...current].slice(0, 20));
    updateCurrentJob((job) => ({
      ...job,
      exports: [{
        id: storedEntry.id,
        filename: storedEntry.filename,
        format: storedEntry.format,
        timestamp: storedEntry.timestamp,
        blob: storedEntry.blob,
      }, ...job.exports].slice(0, 20),
    }));
  };

  const handleSettingsChange = (nextSettings: ProcessingSettings, commit: boolean) => {
    const next = { ...appState, settings: nextSettings };
    setAppState(next);
    if (commit) {
      addToHistory(next);
      setCurrentJob((job) => {
        if (!job) return job;
        const synchronized = transitionJobProductionState(
          job,
          nextSettings,
          job.productionProfile.snapshot,
          true,
        );
        return synchronized.changed ? touchStudioJob(synchronized.job) : job;
      });
    }
  };

  const handleFileAccepted = async (file: File) => {
    setError(null);
    setIsAnalyzing(true);
    setLowResolutionAcknowledged(false);
    try {
      const base64 = await fileToBase64(file);
      const dataUrl = `data:${file.type};base64,${base64}`;
      const next = { image: dataUrl, settings: DEFAULT_SETTINGS, hasUsedAi: false };
      const job = createStudioJob(file.name.replace(/\.[^.]+$/, '') || 'Untitled job');
      job.sourceArtwork = {
        name: file.name,
        type: file.type,
        lastModified: file.lastModified,
        blob: file,
      };
      addToHistory(next);
      setCurrentJob(job);
      setProcessedResult(null);
      setSelectedRecipeId(null);
      setStage('goal');
      try {
        const nextAnalysis = await analyzeArtwork(dataUrl);
        setAnalysis(nextAnalysis);
        const nextRecommendation = recommendRecipe(nextAnalysis);
        setRecommendation(nextRecommendation);
        setCurrentJob((current) => current ? {
          ...touchStudioJob(current),
          analysis: nextAnalysis,
        } : current);
      } catch (analysisError) {
        console.warn('Artwork analysis failed:', analysisError);
        setAnalysis(null);
        setRecommendation({
          recipeId: 'custom',
          confidence: 0.5,
          reasons: ['Ink Master could not confidently classify this artwork.', 'Custom starts neutral and keeps the source intact.'],
          alternatives: ['mockups-only'],
          proposedChanges: ['Start with neutral settings', 'Choose each treatment manually'],
        });
      }
    } catch {
      setError('Could not read this file. Try a JPG, PNG, or SVG under 100MB.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApplyRecipe = (recipeId: RecipeId, savedSettings?: ProcessingSettings) => {
    const nextSettings = savedSettings ?? resolveRecipeSettings(recipeId, analysis, settings);
    setSelectedRecipeId(recipeId);
    handleSettingsChange(nextSettings, true);
    updateCurrentJob((job) => ({ ...job, selectedRecipeId: recipeId }), false);
    setStage('prepare');
  };

  const handleReset = () => {
    const next = { image: null, settings: DEFAULT_SETTINGS, hasUsedAi: false };
    addToHistory(next);
    setProcessedResult(null);
    setAnalysis(null);
    setRecommendation(null);
    setSelectedRecipeId(null);
    setCurrentJob(null);
    setStage('goal');
    setLowResolutionAcknowledged(false);
  };

  const handleRestoreVersion = (checkpoint: Checkpoint) => {
    addToHistory({
      image: originalImage,
      settings: { ...checkpoint.settings },
      hasUsedAi: appState.hasUsedAi,
    });
    setCurrentJob((job) => {
      if (!job) return job;
      const synchronized = transitionJobProductionState(
        job,
        checkpoint.settings,
        job.productionProfile.snapshot,
        true,
      );
      return synchronized.changed ? touchStudioJob(synchronized.job) : job;
    });
  };

  const handleOpenJob = async (job: StudioJob) => {
    if (!job.sourceArtwork) {
      setError('This job does not contain source artwork.');
      return;
    }
    setError(null);
    setIsAnalyzing(true);
    try {
      const dataUrl = await blobToDataUrl(job.sourceArtwork.blob);
      const nextState = { image: dataUrl, settings: job.settings, hasUsedAi: false };
      setHistory([nextState]);
      setHistoryIndex(0);
      setAppState(nextState);
      setCurrentJob(job);
      setAnalysis(job.analysis);
      setRecommendation(job.analysis ? recommendRecipe(job.analysis) : null);
      setSelectedRecipeId(job.selectedRecipeId);
      setExportHistory(job.exports.map((entry) => ({
        ...entry,
        url: URL.createObjectURL(entry.blob),
      })));
      setLowResolutionAcknowledged(job.acknowledgedPreflightRevision === job.revision);
      setProcessedResult(null);
      setStage(job.selectedRecipeId ? 'prepare' : 'goal');
      setShowJobs(false);
    } catch {
      setError('Ink Master could not reopen this job artwork.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDuplicateJob = async (job: StudioJob) => {
    const duplicate = duplicateStudioJob(job);
    await saveJob(duplicate);
    await refreshJobs();
    await handleOpenJob(duplicate);
  };

  const handleArchiveJob = async (job: StudioJob) => {
    await archiveJob(job.id);
    if (currentJob?.id === job.id) handleReset();
    await refreshJobs();
  };

  const handleExportJob = async (job: StudioJob) => {
    downloadBlob(await exportPortableJob(job), jobFilename(job));
  };

  const handleImportJob = async (file: File) => {
    try {
      const imported = await importPortableJob(file);
      const duplicate = {
        ...duplicateStudioJob(imported),
        metadata: { ...imported.metadata },
      };
      await saveJob(duplicate);
      await refreshJobs();
      await handleOpenJob(duplicate);
    } catch {
      setError('That portable job could not be imported.');
    }
  };

  const buildSelectedMockups = async (): Promise<PackageAsset[]> => {
    if (!currentJob || !processedResult) return [];
    const placement = placementToMockupPercent(activePlacement, activeProductionProfile);
    const assets: PackageAsset[] = [];
    for (const index of currentJob.packageOptions.selectedMockupIndices) {
      const mockup = MOCKUP_FILES[index];
      if (!mockup) continue;
      const result = await compositeMockup(mockup[1], processedResult.url, placement, 'PNG');
      assets.push({ filename: `${mockup[0]}-mockup.png`, blob: result.blob });
    }
    return assets;
  };

  const handleDownloadProductionPackage = async () => {
    if (!currentJob || !processedResult) return;
    if (!preflightGate.canExport) {
      setError(preflightGate.criticalCount > 0
        ? 'Production export is blocked until all critical preflight findings are resolved.'
        : 'Acknowledge the preflight warnings before exporting the production package.');
      return;
    }
    try {
      const productionPdf = await generatePrintPDF(processedResult.url, settings.itemType);
      const underbase = currentJob.packageOptions.includeUnderbase
        ? await generateUnderbase(processedResult.url, 'PNG')
        : null;
      const result = await buildProductionPackage({
        job: currentProductionJob ?? currentJob,
        printMaster: { filename: `print-master.${settings.format.toLowerCase()}`, blob: processedResult.blob },
        productionPdf: { filename: 'production-spec.pdf', blob: productionPdf.blob },
        mockups: await buildSelectedMockups(),
        underbase: underbase ? { filename: 'white-underbase.png', blob: underbase.blob } : null,
        palette,
      });
      downloadBlob(result.blob, result.filename);
      addToExportHistory({ filename: result.filename, format: 'ZIP', timestamp: Date.now(), url: URL.createObjectURL(result.blob), blob: result.blob });
    } catch (packageError) {
      console.error(packageError);
      setError('The production package could not be generated.');
    }
  };

  const handleDownloadProof = async (quality: 'print' | 'email') => {
    if (!currentJob || !processedResult) return;
    if (!preflightGate.canExport) {
      setError(preflightGate.criticalCount > 0
        ? 'Proof export is blocked until all critical preflight findings are resolved.'
        : 'Acknowledge the preflight warnings before exporting a proof.');
      return;
    }
    try {
      const result = await generateCustomerProof(
        currentProductionJob ?? currentJob,
        await buildSelectedMockups(),
        quality,
      );
      downloadBlob(result.blob, result.filename);
      addToExportHistory({ filename: result.filename, format: 'PDF', timestamp: Date.now(), url: URL.createObjectURL(result.blob), blob: result.blob });
    } catch (proofError) {
      console.error(proofError);
      setError('The customer proof could not be generated.');
    }
  };

  const handleSaveTemplate = (name: string, description: string) => {
    if (!currentJob) return;
    const next = [createTemplateFromJob(currentJob, name, description), ...shopTemplates];
    setShopTemplates(next);
    saveTemplates(next);
  };

  const handleDownloadMockups = () => {
    if (!preflightGate.canExport) {
      setError(preflightGate.criticalCount > 0
        ? 'Mockup export is blocked until all critical preflight findings are resolved.'
        : 'Acknowledge the preflight warnings before exporting mockups.');
      return;
    }
    setMockupExportToken((token) => token + 1);
  };

  const handleApplyTemplate = (template: ShopTemplate) => {
    if (!currentJob) return;
    const nextJob = applyTemplateToJob(currentJob, template);
    setCurrentJob(nextJob);
    setSelectedRecipeId(nextJob.selectedRecipeId);
    const nextState = { ...appState, settings: nextJob.settings };
    addToHistory(nextState);
  };

  const handleDeleteTemplate = (template: ShopTemplate) => {
    const next = shopTemplates.filter((candidate) => candidate.id !== template.id);
    setShopTemplates(next);
    saveTemplates(next);
  };

  const handleExportTemplates = () => {
    downloadBlob(new Blob([exportTemplates(shopTemplates)], { type: 'application/json' }), 'inkmaster-shop-templates.json');
  };

  const handleImportTemplates = async (file: File) => {
    const imported = importTemplates(await file.text());
    if (!imported.length) {
      setError('That template file is invalid or empty.');
      return;
    }
    const next = [...imported, ...shopTemplates.filter((existing) => !imported.some((entry) => entry.id === existing.id))];
    setShopTemplates(next);
    saveTemplates(next);
  };

  const handleGenerateUnderbase = async (format: 'PNG' | 'SVG' | 'JPG') => {
    if (!processedResult) return;
    try {
      const result = await generateUnderbase(processedResult.url, format);
      const filename = `underbase_${settings.itemType.toLowerCase()}.${format.toLowerCase()}`;
      downloadBlob(result.blob, filename);
      addToExportHistory({ filename, format, timestamp: Date.now(), url: URL.createObjectURL(result.blob), blob: result.blob });
    } catch {
      setError('The white underbase could not be generated.');
    }
  };

  const handleDownloadPrintFile = () => {
    if (!processedResult) return;
    const filename = `inkmaster_${selectedRecipeId ?? 'custom'}_${settings.itemType.toLowerCase()}.${settings.format.toLowerCase()}`;
    downloadBlob(processedResult.blob, filename);
    addToExportHistory({ filename, format: settings.format, timestamp: Date.now(), url: URL.createObjectURL(processedResult.blob), blob: processedResult.blob });
  };

  const handleDownloadPdf = async () => {
    if (!processedResult) return;
    try {
      const result = await generatePrintPDF(processedResult.url, settings.itemType);
      const filename = `inkmaster_production_${settings.itemType.toLowerCase()}.pdf`;
      downloadBlob(result.blob, filename);
      addToExportHistory({ filename, format: 'PDF', timestamp: Date.now(), url: URL.createObjectURL(result.blob), blob: result.blob });
    } catch {
      setError('The production PDF could not be generated.');
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey && canRedo) setHistoryIndex((index) => index + 1);
        else if (canUndo) setHistoryIndex((index) => index - 1);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y' && canRedo) {
        event.preventDefault();
        setHistoryIndex((index) => index + 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canRedo, canUndo]);

  if (!originalImage) {
    return (
      <div className="relative flex min-h-screen flex-col bg-slate-950 pt-14 text-slate-200">
        <AnimatedBackground />
        <Header />
        <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-4 py-10">
          <div className="mb-7 flex flex-col items-center">
            <img src="/logo/logo.png" alt="InkMaster Studio" className="h-24 w-24 object-contain drop-shadow-2xl" />
            <h1 className="mt-3 text-center text-4xl font-black text-slate-100">InkMaster <span className="text-indigo-400">Studio</span></h1>
            <p className="mt-3 max-w-xl text-center text-sm leading-relaxed text-slate-400">Turn artwork into a print-ready file and convincing apparel mockups without learning a wall of technical controls.</p>
          </div>
          <div className="w-full max-w-2xl">
            <Dropzone onFileAccepted={handleFileAccepted} />
            {error && <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-center text-xs text-rose-300">{error}</p>}
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3 text-xs text-slate-500">
            <span>Local artwork analysis</span><span className="text-slate-700">•</span><span>Guided print recipes</span><span className="text-slate-700">•</span><span>Production files + mockups</span>
          </div>
          <button type="button" onClick={() => setShowBatch(true)} className="mt-7 rounded-lg border border-slate-700 bg-slate-900/60 px-5 py-2.5 text-xs font-bold text-slate-300 hover:border-indigo-500 hover:text-white">Open batch processing</button>
          <button type="button" onClick={() => setShowJobs(true)} className="mt-3 rounded-lg px-5 py-2 text-xs font-bold text-indigo-300 hover:text-indigo-200">
            Open saved production job{jobs.length ? ` (${jobs.length})` : ''}
          </button>
        </main>
        {showBatch && (
          <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/70" />}>
            <BatchProcessor
              onClose={() => setShowBatch(false)}
              defaultSettings={settings}
              productionProfile={currentJob?.productionProfile.snapshot ?? BATCH_DEFAULT_PROFILE}
            />
          </Suspense>
        )}
        {showJobs && (
          <JobLibrary
            jobs={jobs}
            currentJobId={currentJob?.id ?? null}
            onClose={() => setShowJobs(false)}
            onOpen={(job) => void handleOpenJob(job)}
            onDuplicate={(job) => void handleDuplicateJob(job)}
            onArchive={(job) => void handleArchiveJob(job)}
            onExport={(job) => void handleExportJob(job)}
            onImport={(file) => void handleImportJob(file)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-950 text-slate-200">
      <StudioTopBar
        jobName={currentJob?.metadata.name ?? 'Untitled job'}
        saveStatus={saveStatus}
        canUndo={canUndo}
        canRedo={canRedo}
        onNewFile={handleReset}
        onJobNameChange={(name) => updateCurrentJob((job) => ({
          ...job,
          metadata: { ...job.metadata, name },
        }))}
        onOpenJobs={() => setShowJobs(true)}
        onBatch={() => setShowBatch(true)}
        onUndo={() => canUndo && setHistoryIndex((index) => index - 1)}
        onRedo={() => canRedo && setHistoryIndex((index) => index + 1)}
        templates={(
          <TemplatesPopover
            templates={shopTemplates}
            onApply={handleApplyTemplate}
            onSave={handleSaveTemplate}
            onDelete={handleDeleteTemplate}
            onExport={handleExportTemplates}
            onImport={(file) => void handleImportTemplates(file)}
          />
        )}
        versions={<VersionsPopover currentSettings={settings} currentThumbnail={processedResult?.previewUrl || processedResult?.url || null} onRestore={handleRestoreVersion} />}
      />

      <main className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(315px,44dvh)] lg:grid-cols-[370px_minmax(0,1fr)] lg:grid-rows-1">
        <div className="order-2 min-h-0 lg:order-1">
          <AppliedProductionProfileContext.Provider value={appliedProductionProfile}>
            <WorkflowInspector
              stage={stage}
              selectedRecipeId={selectedRecipeId}
              analysis={analysis}
              recommendation={recommendation}
              settings={settings}
              palette={palette}
              exportHistory={exportHistory}
              hasProcessedResult={Boolean(processedResult)}
              lowResolutionAcknowledged={lowResolutionAcknowledged}
              isEyedropperMode={isEyedropperMode}
              printSpecification={printSpecification}
              placement={activePlacement}
              productionProfile={activeProductionProfile}
              preflightFindings={preflightFindings}
              preflightAcknowledged={preflightAcknowledged}
              jobMetadata={currentJob?.metadata ?? { name: 'Untitled job', customerName: '', orderNumber: '', notes: '', tags: [] }}
              namingPattern={currentJob?.packageOptions.namingPattern ?? ''}
              onStageChange={setStage}
              onApplyRecipe={handleApplyRecipe}
              onSettingsChange={handleSettingsChange}
              onToggleEyedropper={() => setIsEyedropperMode((value) => !value)}
              onGenerateUnderbase={handleGenerateUnderbase}
              onDownloadPrintFile={handleDownloadPrintFile}
              onDownloadPdf={handleDownloadPdf}
              onDownloadMockups={handleDownloadMockups}
              onAcknowledgeLowResolution={setLowResolutionAcknowledged}
              onPrintSpecificationChange={(specification) => updateCurrentJob((job) => ({
                ...job,
                printSpecification: specification,
              }))}
              onPlacementChange={(placement) => updateCurrentJob((job) => ({
                ...job,
                ...storePlacementVariant(job.placements, placement),
              }))}
              onAcknowledgePreflight={(acknowledged) => setCurrentJob((job) => job ? {
                ...job,
                acknowledgedPreflightRevision: acknowledged ? job.revision : null,
              } : job)}
              onJobMetadataChange={(metadata) => updateCurrentJob((job) => ({ ...job, metadata }))}
              onNamingPatternChange={(namingPattern) => updateCurrentJob((job) => ({
                ...job,
                packageOptions: { ...job.packageOptions, namingPattern },
              }))}
              onDownloadProductionPackage={() => void handleDownloadProductionPackage()}
              onDownloadProof={(quality) => void handleDownloadProof(quality)}
            />
          </AppliedProductionProfileContext.Provider>
        </div>

        <section className="relative order-1 min-h-0 overflow-hidden bg-slate-900/40 p-2 lg:order-2 lg:p-4">
          <div className="relative h-full min-h-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-2xl shadow-black/30">
            {(isAnalyzing || (isProcessing && !processedResult)) && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
                <div className="text-center">
                  <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
                  <p className="mt-3 text-xs font-bold text-slate-300">{isAnalyzing ? 'Reading the artwork…' : 'Building the print preview…'}</p>
                </div>
              </div>
            )}
            {error && (
              <div className="absolute left-3 right-3 top-3 z-40 rounded-lg border border-rose-500/30 bg-rose-950/90 px-4 py-3 text-xs text-rose-200 shadow-xl">{error}</div>
            )}
            {processedResult ? (
              <Preview
                originalImage={originalImage}
                processedResult={processedResult}
                settings={settings}
                isProcessing={isProcessing}
                onExported={(blob, filename) => addToExportHistory({ filename, format: settings.format, timestamp: Date.now(), url: URL.createObjectURL(blob), blob })}
                isEyedropperMode={isEyedropperMode}
                onEyedropperPick={(color) => {
                  setIsEyedropperMode(false);
                  handleSettingsChange({ ...settings, colorReplacements: [...settings.colorReplacements, { sourceColor: color, targetColor: '#FFFFFF', tolerance: 10 }] }, true);
                }}
                dpiInfo={dpiInfo}
                embedded
                workspaceStage={stage}
                exportRequestToken={mockupExportToken}
                mockupExportAllowed={preflightGate.canExport}
                productionPlacement={productionPlacement}
                onProductionPlacementChange={activePrintableArea && productionPlacement
                  ? (percent) => updateCurrentJob((job) => ({
                      ...job,
                      ...storePlacementVariant(
                        job.placements,
                        mockupPercentToPlacement(
                          percent,
                          activePlacement,
                          activeProductionProfile,
                        ),
                      ),
                    }))
                  : undefined}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-center text-slate-600">
                <div><div className="text-4xl">◫</div><p className="mt-2 text-xs">Preview will appear here</p></div>
              </div>
            )}
          </div>
        </section>
      </main>

      {showBatch && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/70" />}>
          <BatchProcessor
            onClose={() => setShowBatch(false)}
            defaultSettings={settings}
            productionProfile={currentJob?.productionProfile.snapshot ?? BATCH_DEFAULT_PROFILE}
          />
        </Suspense>
      )}
      {showJobs && (
        <JobLibrary
          jobs={jobs}
          currentJobId={currentJob?.id ?? null}
          onClose={() => setShowJobs(false)}
          onOpen={(job) => void handleOpenJob(job)}
          onDuplicate={(job) => void handleDuplicateJob(job)}
          onArchive={(job) => void handleArchiveJob(job)}
          onExport={(job) => void handleExportJob(job)}
          onImport={(file) => void handleImportJob(file)}
        />
      )}
    </div>
  );
};

export default App;
