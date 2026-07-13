import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatedBackground } from './components/AnimatedBackground';
import { Dropzone } from './components/Dropzone';
import { Header } from './components/Header';
import { JobLibrary } from './components/JobLibrary';
import { ProfileManager } from './components/ProfileManager';
import { ProfileSelector } from './components/ProfileSelector';
import { ProfileUpdateReview } from './components/ProfileUpdateReview';
import { SimpleCreatorFlow } from './components/SimpleCreatorFlow';
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
  AiCleanupStatus,
  OutputFormat,
  ResizeMode,
  ProcessingSettings,
  ProcessedResult,
  ProofApprovalState,
  RecipeId,
  RecipeRecommendation,
  ShirtColor,
  ShopTemplate,
  StoredJobExport,
  StudioJob,
  ProductionProfile,
  WorkspaceStage,
} from './types';
import { DEFAULT_PACKAGE_OPTIONS, DEFAULT_PRINT_SPECIFICATION, DEFAULT_PROOF_BRANDING, DEFAULT_SETTINGS } from './constants';
import {
  fileToBase64,
  compositeMockup,
  generatePalette,
  generatePrintPDF,
  generateUnderbase,
  processImage,
} from './services/imageProcessing';
import { ProcessingProgress } from './services/imageProcessingWorkerClient';
import { analyzeArtwork } from './services/artworkAnalysis';
import { recommendRecipe, resolveRecipeSettings } from './services/recipes';
import {
  applyProductionProfileTransitionToJob,
  createStudioJob,
  duplicateStudioJob,
  touchStudioJob,
} from './services/jobModel';
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
import {
  getDefaultProfile,
  loadProfileStore,
  saveProfileStore,
} from './services/profileStorage';
import {
  getProfileUpdateState,
  snapshotProductionProfile,
} from './services/productionProfiles';
import {
  describeSelectedMockups,
  resolveMockupSelectionForItemType,
  getSelectedProductionMockups,
} from './services/mockups';
import { buildProductionPackage, getProductionPackageErrorMessage, PackageAsset } from './services/productionPackage';
import { buildProductionPackageReview } from './services/packageReview';
import { buildProofFilename, generateCustomerProof } from './services/proofBuilder';
import { formatPlacementSummary } from './services/handoffDetails';
import { filenameToDesignName } from './services/designNames';
import {
  createProofApprovalState,
  getCloudApprovalCapability,
  markProofExported,
  markProofSent,
  recordProofResponse,
} from './services/proofApproval';
import { editImageWithGemini, getAiCleanupStatus } from './services/geminiService';
import {
  applyTemplateToJob,
  createTemplateFromJob,
  duplicateTemplate,
  exportTemplates,
  getAppliedTemplateStatus,
  importTemplates,
  loadTemplates,
  mergeImportedTemplates,
  renameTemplate,
  saveTemplates,
  updateTemplateFromJob,
} from './services/templateStorage';
import { sanitizeFilenameSegment } from './services/naming';
import { revokeExportHistoryUrls, revokeObjectUrl, revokeRemovedExportHistoryUrls } from './services/objectUrls';
import { DEFAULT_PRINTIFY_PRODUCT_ID, PrintifyProductPreset, printify, printifyProductToSpecification } from './specs/printify';

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

const dataUrlToImagePayload = (dataUrl: string) => {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  return {
    mimeType: match[1],
    base64: match[2],
    approximateBytes: Math.ceil((match[2].length * 3) / 4),
  };
};

const revokeProcessedResultUrls = (result: ProcessedResult | null) => {
  if (!result) return;
  revokeObjectUrl(result.url);
  if (result.previewUrl && result.previewUrl !== result.url) {
    revokeObjectUrl(result.previewUrl);
  }
};

const base64ToBlob = (base64: string, mimeType: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
};

const jobFilename = (job: StudioJob) =>
  `${job.metadata.name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'inkmaster-job'}.inkmaster-job`;

const ADVANCED_MODE_STORAGE_KEY = 'inkmaster_advanced_mode_v1';

const loadAdvancedMode = () => {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(ADVANCED_MODE_STORAGE_KEY) === 'true';
};

const SiteFooter: React.FC = () => (
  <footer className="relative z-10 border-t border-slate-900 px-4 py-5">
    <nav className="mx-auto flex max-w-6xl flex-wrap justify-center gap-3 text-xs text-slate-500 lg:justify-start" aria-label="Footer">
      <a href="/privacy" className="hover:text-slate-200">Privacy</a>
      <a href="/terms" className="hover:text-slate-200">Terms</a>
      <a href="/contact" className="hover:text-slate-200">Contact</a>
      <a href="/printify-file-requirements" className="hover:text-slate-200">Printify requirements</a>
      <a href="/print-ready-file-checklist" className="hover:text-slate-200">Checklist</a>
      <a href="/upscaling-art-for-t-shirt-printing" className="hover:text-slate-200">Upscaling</a>
    </nav>
  </footer>
);

const App: React.FC = () => {
  const [history, setHistory] = useState<AppState[]>([{ image: null, settings: DEFAULT_SETTINGS, hasUsedAi: false }]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [appState, setAppState] = useState<AppState>(history[0]);
  const [processedResult, setProcessedResult] = useState<ProcessedResult | null>(null);
  const [simpleExportResult, setSimpleExportResult] = useState<ProcessedResult | null>(null);
  const [simpleExportError, setSimpleExportError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ArtworkAnalysis | null>(null);
  const [recommendation, setRecommendation] = useState<RecipeRecommendation | null>(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState<RecipeId | null>(null);
  const [stage, setStage] = useState<WorkspaceStage>('goal');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgress | null>(null);
  const [processingRetryToken, setProcessingRetryToken] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [palette, setPalette] = useState<string[]>([]);
  const [showBatch, setShowBatch] = useState(false);
  const [exportHistory, setExportHistory] = useState<ExportHistoryEntry[]>([]);
  const exportHistoryRef = useRef<ExportHistoryEntry[]>([]);
  const simpleExportResultRef = useRef<ProcessedResult | null>(null);
  const [isEyedropperMode, setIsEyedropperMode] = useState(false);
  const [lowResolutionAcknowledged, setLowResolutionAcknowledged] = useState(false);
  const [mockupExportToken, setMockupExportToken] = useState(0);
  const [currentJob, setCurrentJob] = useState<StudioJob | null>(null);
  const [jobs, setJobs] = useState<StudioJob[]>([]);
  const [showJobs, setShowJobs] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [advancedMode, setAdvancedMode] = useState(loadAdvancedMode);
  const [selectedPrintifyProductId, setSelectedPrintifyProductId] = useState(DEFAULT_PRINTIFY_PRODUCT_ID);
  const [shopTemplates, setShopTemplates] = useState<ShopTemplate[]>([]);
  const [templateImportMessage, setTemplateImportMessage] = useState<string | null>(null);
  const [profileStore, setProfileStore] = useState(() => loadProfileStore());
  const [showProfiles, setShowProfiles] = useState(false);
  const [profileUpdateSource, setProfileUpdateSource] = useState<ProductionProfile | null>(null);
  const [aiCleanupStatus, setAiCleanupStatus] = useState<AiCleanupStatus>({
    availability: 'checking',
    message: 'Checking AI cleanup availability…',
    maxImageBytes: null,
    dailyLimitPerOperator: null,
    supportedActions: [],
  });
  const [isAiCleanupProcessing, setIsAiCleanupProcessing] = useState(false);
  const processingAbortRef = useRef<AbortController | null>(null);

  const originalImage = appState.image;
  const settings = appState.settings;
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  useEffect(() => {
    exportHistoryRef.current = exportHistory;
  }, [exportHistory]);

  useEffect(() => {
    simpleExportResultRef.current = simpleExportResult;
  }, [simpleExportResult]);

  useEffect(() => () => {
    revokeExportHistoryUrls(exportHistoryRef.current);
    revokeProcessedResultUrls(simpleExportResultRef.current);
  }, []);
  const dpiInfo = analysis?.printQuality ?? null;
  const defaultProductionProfile = useMemo(
    () => getDefaultProfile(profileStore),
    [profileStore],
  );
  const defaultAppliedProductionProfile = useMemo(
    () => snapshotProductionProfile(defaultProductionProfile),
    [defaultProductionProfile],
  );
  const printSpecification = currentJob?.printSpecification ?? DEFAULT_PRINT_SPECIFICATION;
  const appliedProductionProfile = currentJob?.productionProfile ?? defaultAppliedProductionProfile;
  const activeProductionProfile = appliedProductionProfile.snapshot;
  const profileUpdateState = useMemo(
    () => currentJob
      ? getProfileUpdateState(currentJob, profileStore.profiles)
      : { status: 'current' as const, source: defaultProductionProfile },
    [currentJob, defaultProductionProfile, profileStore.profiles],
  );
  const batchDefaultSettings = useMemo(
    () => currentJob
      ? settings
      : {
          ...settings,
          format: defaultProductionProfile.defaults.format,
          preserveTransparency: defaultProductionProfile.defaults.preserveTransparency,
        },
    [currentJob, defaultProductionProfile, settings],
  );
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
  const currentProductionJob = useMemo(
    () => currentJob ? {
      ...currentJob,
      settings,
      activePlacementKey: placementState.activePlacementKey,
      placements: placementState.placements,
      preflightFindings,
    } : null,
    [currentJob, placementState.activePlacementKey, placementState.placements, preflightFindings, settings],
  );
  const packageReview = useMemo(
    () => currentProductionJob
      ? buildProductionPackageReview(
          currentProductionJob,
          preflightFindings,
          preflightAcknowledged,
          Boolean(processedResult),
          profileUpdateState.status,
        )
      : null,
    [currentProductionJob, preflightAcknowledged, preflightFindings, processedResult, profileUpdateState.status],
  );
  const appliedTemplateStatus = useMemo(
    () => getAppliedTemplateStatus(currentProductionJob, shopTemplates),
    [currentProductionJob, shopTemplates],
  );
  const proofFilenames = useMemo(
    () => currentProductionJob
      ? {
          print: buildProofFilename(currentProductionJob, 'print'),
          email: buildProofFilename(currentProductionJob, 'email'),
        }
      : {
          print: 'customer_print-proof.pdf',
          email: 'customer_email-proof.pdf',
        },
    [currentProductionJob],
  );
  const cloudApprovalCapability = useMemo(() => getCloudApprovalCapability(), []);
  const fallbackProofApproval = useMemo(() => createProofApprovalState(), []);
  const selectedPrintifyProduct = useMemo(
    () => printify.products.find((product) => product.id === selectedPrintifyProductId) ?? printify.products[0],
    [selectedPrintifyProductId],
  );
  const canRetryProcessing = Boolean(
    originalImage
    && error
    && /processing stalled|worker|background image processing/i.test(error),
  );

  useEffect(() => {
    localStorage.setItem(ADVANCED_MODE_STORAGE_KEY, String(advancedMode));
  }, [advancedMode]);

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
    let active = true;
    void getAiCleanupStatus().then((status) => {
      if (active) setAiCleanupStatus(status);
    });
    return () => {
      active = false;
    };
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
    setSimpleExportError(null);
    setSimpleExportResult((current) => {
      revokeProcessedResultUrls(current);
      return null;
    });
    if (!originalImage) return;
    const timer = window.setTimeout(async () => {
      const controller = new AbortController();
      processingAbortRef.current?.abort();
      processingAbortRef.current = controller;
      setIsProcessing(true);
      setProcessingProgress({ percent: 0, stage: 'Starting image processor' });
      setError(null);
      try {
        setProcessedResult(await processImage(originalImage, {
          ...settings,
          purpose: advancedMode ? 'export' : 'preview',
        }, {
          signal: controller.signal,
          timeoutMs: 120_000,
          onProgress: setProcessingProgress,
        }));
      } catch (processingError) {
        if (processingError instanceof DOMException && processingError.name === 'AbortError') return;
        console.error(processingError);
        setError(processingError instanceof Error && /stalled|cancelled|worker|background/i.test(processingError.message)
          ? processingError.message
          : 'Ink Master could not process this artwork. Try a different treatment or file.');
      } finally {
        if (processingAbortRef.current === controller) {
          processingAbortRef.current = null;
          setIsProcessing(false);
          setProcessingProgress(null);
        }
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      processingAbortRef.current?.abort();
    };
  }, [originalImage, settings, processingRetryToken, advancedMode]);

  const handleCancelProcessing = () => {
    processingAbortRef.current?.abort();
    processingAbortRef.current = null;
    setIsProcessing(false);
    setProcessingProgress(null);
    setError('Preview build was cancelled.');
  };

  const handleRetryProcessing = () => {
    if (!originalImage) return;
    setError(null);
    setProcessingRetryToken((token) => token + 1);
  };

  const addToHistory = (state: AppState) => {
    setHistory((current) => {
      const next = [...current.slice(0, historyIndex + 1), state];
      setHistoryIndex(next.length - 1);
      return next;
    });
    setAppState(state);
  };

  const handleProfileStoreChange = (nextStore: typeof profileStore): boolean => {
    try {
      saveProfileStore(nextStore);
      setProfileStore(nextStore);
      return true;
    } catch (storageError) {
      console.error(storageError);
      return false;
    }
  };

  const applyProfileToCurrentJob = (profile: ProductionProfile) => {
    if (!currentJob || profile.archivedAt !== null) return;
    const transitioned = applyProductionProfileTransitionToJob(currentJob, profile);
    setCurrentJob(transitioned);
    const nextState = {
      ...appState,
      settings: structuredClone(transitioned.settings),
    };
    setHistory([nextState]);
    setHistoryIndex(0);
    setAppState(nextState);
    setProfileUpdateSource(null);
  };

  const handleAssignProfile = (profileId: string) => {
    const profile = profileStore.profiles.find(
      (candidate) => candidate.id === profileId && candidate.archivedAt === null,
    );
    if (profile) applyProfileToCurrentJob(profile);
  };

  const addToExportHistory = (
    entry: Omit<ExportHistoryEntry, 'id'>,
    shouldReplace?: (entry: ExportHistoryEntry) => boolean,
  ) => {
    const replacedEntry = shouldReplace ? exportHistory.find((current) => shouldReplace(current)) : undefined;
    const storedEntry = { ...entry, id: replacedEntry?.id ?? `export_${Date.now()}` };
    setExportHistory((current) => {
      let nextHistory: ExportHistoryEntry[];
      if (shouldReplace) {
        const matchIndex = current.findIndex((candidate) => shouldReplace(candidate));
        if (matchIndex >= 0) {
          nextHistory = [
            storedEntry,
            ...current.filter((_, index) => index !== matchIndex),
          ].slice(0, 20);
          revokeRemovedExportHistoryUrls(current, nextHistory);
          return nextHistory;
        }
      }
      nextHistory = [storedEntry, ...current].slice(0, 20);
      revokeRemovedExportHistoryUrls(current, nextHistory);
      return nextHistory;
    });
    updateCurrentJob((job) => ({
      ...job,
      exports: [
        {
          id: storedEntry.id,
          filename: storedEntry.filename,
          format: storedEntry.format,
          timestamp: storedEntry.timestamp,
          blob: storedEntry.blob,
          metadata: storedEntry.metadata,
        },
        ...job.exports.filter((exportEntry) => exportEntry.id !== storedEntry.id),
      ].slice(0, 20),
    }), false);
  };

  const packageExportMetadata = (job: StudioJob): StoredJobExport['metadata'] => {
    const review = packageReview ?? buildProductionPackageReview(
      job,
      preflightFindings,
      preflightAcknowledged,
      Boolean(processedResult),
      profileUpdateState.status,
    );
    const gate = getPreflightGate(preflightFindings, preflightAcknowledged);
    const placement = job.placements[job.activePlacementKey];
    return {
      kind: 'production-package',
      readinessStatus: review.handoffReadiness.status,
      readinessSummary: review.handoffReadiness.summary,
      packageContents: review.items
        .filter((entry) => entry.status === 'ready')
        .map((entry) => entry.label),
      manifestVerified: true,
      preflightSummary: `${preflightFindings.filter((finding) => finding.severity === 'pass').length} pass · ${gate.warningCount} warning · ${gate.criticalCount} critical`,
      proofApprovalStatus: job.proofApproval.status,
      placementSummary: placement ? formatPlacementSummary(placement) : 'No placement selected',
      jobRevision: job.revision,
    };
  };

  const packagePreflightSummary = () => {
    const gate = getPreflightGate(preflightFindings, preflightAcknowledged);
    return `${preflightFindings.filter((finding) => finding.severity === 'pass').length} pass · ${gate.warningCount} warning · ${gate.criticalCount} critical`;
  };

  const recordBlockedProductionPackageAttempt = (job: StudioJob, reason: string) => {
    const placement = job.placements[job.activePlacementKey];
    const timestamp = Date.now();
    const filename = `${sanitizeFilenameSegment(job.metadata.name)}_blocked-production-package.txt`;
    const body = [
      'Ink Master blocked production package attempt',
      `Job: ${job.metadata.name}`,
      `Customer: ${job.metadata.customerName || 'Not supplied'}`,
      `Reason: ${reason}`,
      `Preflight: ${packagePreflightSummary()}`,
      `Proof: ${job.proofApproval.status.replace(/-/g, ' ')}`,
      `Placement: ${placement ? formatPlacementSummary(placement) : 'No placement selected'}`,
      `Job revision: ${job.revision}`,
      `Recorded: ${new Date(timestamp).toISOString()}`,
    ].join('\n');
    const blob = new Blob([body], { type: 'text/plain' });
    addToExportHistory({
      filename,
      format: 'TXT',
      timestamp,
      url: URL.createObjectURL(blob),
      blob,
      metadata: {
        kind: 'production-package-blocked',
        readinessStatus: 'blocked',
        readinessSummary: 'Production package export was blocked.',
        blockedReason: reason,
        preflightSummary: packagePreflightSummary(),
        proofApprovalStatus: job.proofApproval.status,
        placementSummary: placement ? formatPlacementSummary(placement) : 'No placement selected',
        jobRevision: job.revision,
      },
    }, (entry) =>
      entry.metadata?.kind === 'production-package-blocked'
      && entry.metadata.jobRevision === job.revision
      && entry.metadata.blockedReason === reason);
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
      const job = createStudioJob(filenameToDesignName(file.name), defaultProductionProfile);
      job.printSpecification = printifyProductToSpecification(selectedPrintifyProduct);
      job.settings = {
        ...job.settings,
        itemType: selectedPrintifyProduct.itemType,
        format: OutputFormat.PNG,
        resizeMode: ResizeMode.FIT,
        allowUpscaling: true,
        preserveTransparency: true,
        targetWidth: selectedPrintifyProduct.px[0],
        targetHeight: selectedPrintifyProduct.px[1],
        targetDpi: selectedPrintifyProduct.dpi,
        designScalePercent: 100,
        designOffsetXPercent: 0,
        designOffsetYPercent: 0,
        designRotationDegrees: 0,
        canvasBackground: 'transparent',
      };
      const next = {
        image: dataUrl,
        settings: structuredClone(job.settings),
        hasUsedAi: false,
      };
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

  const handleProofApprovalChange = (proofApproval: ProofApprovalState) => updateCurrentJob((job) => ({
    ...job,
    proofApproval,
  }), false);

  const handleMarkProofSent = () => updateCurrentJob((job) => ({
    ...job,
    proofApproval: markProofSent(job.proofApproval),
  }), false);

  const handleRecordProofResponse = (status: 'approved' | 'changes-requested') => updateCurrentJob((job) => ({
    ...job,
    proofApproval: recordProofResponse(job.proofApproval, status),
  }), false);

  const handleAiEdgeCleanup = async () => {
    if (!originalImage || !currentJob) return;
    if (aiCleanupStatus.availability !== 'available') {
      setError(aiCleanupStatus.message);
      return;
    }
    const payload = dataUrlToImagePayload(originalImage);
    if (!payload || !/^image\/(png|jpe?g|webp)$/i.test(payload.mimeType)) {
      setError('AI cleanup supports PNG, JPG, and WebP artwork.');
      return;
    }
    if (aiCleanupStatus.maxImageBytes !== null && payload.approximateBytes > aiCleanupStatus.maxImageBytes) {
      setError('This artwork is larger than the configured AI cleanup limit.');
      return;
    }

    setIsAiCleanupProcessing(true);
    setError(null);
    try {
      const cleanedBase64 = await editImageWithGemini(
        payload.base64,
        payload.mimeType,
      );
      if (!cleanedBase64) {
        setError('AI cleanup did not return usable artwork.');
        return;
      }
      const cleanedDataUrl = `data:image/png;base64,${cleanedBase64}`;
      const cleanedBlob = base64ToBlob(cleanedBase64, 'image/png');
      const nextSettings = {
        ...settings,
        format: OutputFormat.PNG,
        preserveTransparency: true,
      };
      const nextAnalysis = await analyzeArtwork(cleanedDataUrl);
      const nextState = {
        image: cleanedDataUrl,
        settings: nextSettings,
        hasUsedAi: true,
      };

      addToHistory(nextState);
      setAnalysis(nextAnalysis);
      setRecommendation(recommendRecipe(nextAnalysis));
      setProcessedResult(null);
      setCurrentJob((job) => job ? touchStudioJob({
        ...job,
        sourceArtwork: {
          name: `${job.metadata.name || 'cleaned-artwork'}-ai-cleanup.png`,
          type: 'image/png',
          lastModified: Date.now(),
          blob: cleanedBlob,
        },
        settings: nextSettings,
        analysis: nextAnalysis,
      }) : job);
    } catch (cleanupError) {
      console.error(cleanupError);
      setError('AI cleanup could not finish. The original artwork was left unchanged.');
    } finally {
      setIsAiCleanupProcessing(false);
    }
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
      setError('This saved design does not contain source artwork.');
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
      const reopenedExportHistory = job.exports.map((entry) => ({
        ...entry,
        url: URL.createObjectURL(entry.blob),
      }));
      setExportHistory((current) => {
        revokeRemovedExportHistoryUrls(current, reopenedExportHistory);
        return reopenedExportHistory;
      });
      setLowResolutionAcknowledged(job.acknowledgedPreflightRevision === job.revision);
      setProcessedResult(null);
      setStage(job.selectedRecipeId ? 'prepare' : 'goal');
      setShowJobs(false);
    } catch {
      setError('InkMaster Studio could not reopen this design artwork.');
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
      setError('That design archive could not be imported.');
    }
  };

  const buildSelectedMockups = async (): Promise<PackageAsset[]> => {
    if (!currentJob || !processedResult) return [];
    const placement = placementToMockupPercent(activePlacement, activeProductionProfile);
    const assets: PackageAsset[] = [];
    for (const mockup of getSelectedProductionMockups(currentJob.packageOptions.selectedMockupIndices, currentJob.settings.itemType)) {
      const result = await compositeMockup(mockup.file, processedResult.url, placement, 'PNG');
      assets.push({ filename: `${mockup.slug}-mockup.png`, blob: result.blob });
    }
    return assets;
  };

  const handleDownloadProductionPackage = async () => {
    if (!currentJob || !processedResult) return;
    if (packageReview && !packageReview.canExport) {
      const reason = packageReview.exportAction.disabledReason ?? 'Resolve handoff readiness items before exporting the production package.';
      recordBlockedProductionPackageAttempt(currentProductionJob ?? currentJob, reason);
      setError(reason);
      return;
    }
    if (!preflightGate.canExport) {
      const reason = preflightGate.criticalCount > 0
        ? 'Production export is blocked until all critical preflight findings are resolved.'
        : 'Acknowledge the preflight warnings before exporting the production package.';
      recordBlockedProductionPackageAttempt(currentProductionJob ?? currentJob, reason);
      setError(reason);
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
        appliedTemplateStatus,
      });
      downloadBlob(result.blob, result.filename);
      addToExportHistory({
        filename: result.filename,
        format: 'ZIP',
        timestamp: Date.now(),
        url: URL.createObjectURL(result.blob),
        blob: result.blob,
        metadata: packageExportMetadata(currentProductionJob ?? currentJob),
      });
    } catch (packageError) {
      console.error(packageError);
      setError(getProductionPackageErrorMessage(packageError));
    }
  };

  const handleRegenerateProductionPackage = async (entry: ExportHistoryEntry) => {
    if (entry.metadata?.kind !== 'production-package') return;
    await handleDownloadProductionPackage();
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
      const proofExportedAt = Date.now();
      const nextProofApproval = markProofExported(currentJob.proofApproval, quality, proofExportedAt);
      updateCurrentJob((job) => ({
        ...job,
        proofApproval: markProofExported(job.proofApproval, quality, proofExportedAt),
      }), false);
      addToExportHistory({
        filename: result.filename,
        format: 'PDF',
        timestamp: proofExportedAt,
        url: URL.createObjectURL(result.blob),
        blob: result.blob,
        metadata: {
          kind: 'customer-proof',
          proofApprovalStatus: nextProofApproval.status,
          proofQuality: quality,
          placementSummary: formatPlacementSummary(activePlacement),
          jobRevision: currentJob.revision,
        },
      });
    } catch (proofError) {
      console.error(proofError);
      setError('The customer proof could not be generated.');
    }
  };

  const handleSaveTemplate = (name: string, description: string) => {
    if (!currentProductionJob) return;
    const next = [createTemplateFromJob(currentProductionJob, name, description), ...shopTemplates];
    setShopTemplates(next);
    setTemplateImportMessage(null);
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
    setTemplateImportMessage(null);
    saveTemplates(next);
  };

  const handleDuplicateTemplate = (template: ShopTemplate) => {
    const copy = duplicateTemplate(template, shopTemplates);
    const next = [copy, ...shopTemplates];
    setShopTemplates(next);
    setTemplateImportMessage(`Duplicated ${template.name} as ${copy.name}.`);
    saveTemplates(next);
  };

  const handleRenameTemplate = (template: ShopTemplate, name: string) => {
    const renamed = renameTemplate(template, shopTemplates, name);
    if (renamed === template) return;
    const next = shopTemplates.map((candidate) => candidate.id === template.id ? renamed : candidate);
    setShopTemplates(next);
    setTemplateImportMessage(`Renamed template to ${renamed.name}.`);
    saveTemplates(next);
  };

  const handleUpdateAppliedTemplate = () => {
    if (!currentProductionJob?.appliedTemplate) return;
    const template = shopTemplates.find((candidate) => candidate.id === currentProductionJob.appliedTemplate?.id);
    if (!template) {
      setError('That applied template is no longer in the template library.');
      return;
    }
    const updated = updateTemplateFromJob(template, currentProductionJob);
    const next = shopTemplates.map((candidate) => candidate.id === template.id ? updated : candidate);
    setShopTemplates(next);
    setTemplateImportMessage(`Updated ${updated.name} from the current job.`);
    saveTemplates(next);
    setError(null);
  };

  const handleExportTemplates = () => {
    downloadBlob(new Blob([exportTemplates(shopTemplates)], { type: 'application/json' }), 'inkmaster-shop-templates.json');
    setTemplateImportMessage(`Exported ${shopTemplates.length} shop template${shopTemplates.length === 1 ? '' : 's'} to JSON.`);
  };

  const handleImportTemplates = async (file: File) => {
    const imported = importTemplates(await file.text());
    if (!imported.length) {
      setError('That template file is invalid or empty.');
      return;
    }
    const result = mergeImportedTemplates(shopTemplates, imported);
    setShopTemplates(result.templates);
    saveTemplates(result.templates);
    setTemplateImportMessage(`Imported ${result.added} new, replaced ${result.replaced}, renamed ${result.renamed}, skipped ${result.skipped}.`);
    setError(null);
  };

  const handleGenerateUnderbase = async (format: 'PNG' | 'SVG' | 'JPG') => {
    if (!processedResult) return;
    try {
      const result = await generateUnderbase(processedResult.url, format);
      const filename = `underbase_${settings.itemType.toLowerCase()}.${format.toLowerCase()}`;
      downloadBlob(result.blob, filename);
      addToExportHistory({ filename, format, timestamp: Date.now(), url: URL.createObjectURL(result.blob), blob: result.blob, metadata: { kind: 'underbase', placementSummary: formatPlacementSummary(activePlacement), jobRevision: currentJob?.revision } });
    } catch {
      setError('The white underbase could not be generated.');
    }
  };

  const handleDownloadPrintFile = async () => {
    if (!processedResult) return;
    const filename = `${sanitizeFilenameSegment(currentJob?.metadata.name ?? 'untitled-design')}_${selectedPrintifyProduct.id}.${settings.format.toLowerCase()}`;

    if (advancedMode || !originalImage) {
      downloadBlob(processedResult.blob, filename);
      addToExportHistory({ filename, format: settings.format, timestamp: Date.now(), url: URL.createObjectURL(processedResult.blob), blob: processedResult.blob, metadata: { kind: 'print-master', placementSummary: formatPlacementSummary(activePlacement), jobRevision: currentJob?.revision } });
      return;
    }

    if (isProcessing) return;

    const controller = new AbortController();
    processingAbortRef.current?.abort();
    processingAbortRef.current = controller;
    setIsProcessing(true);
    setProcessingProgress({ percent: 0, stage: 'Preparing print file' });
    setError(null);
    setSimpleExportError(null);
    try {
      const exportResult = await processImage(originalImage, {
        ...settings,
        purpose: 'export',
      }, {
        signal: controller.signal,
        timeoutMs: 120_000,
        onProgress: setProcessingProgress,
      });

      if (exportResult.blob.size > printify.maxBytes.png) {
        revokeProcessedResultUrls(exportResult);
        setSimpleExportError("The generated PNG is over Printify's 100 MB limit. Try a smaller product or simpler artwork.");
        return;
      }

      setSimpleExportResult((current) => {
        revokeProcessedResultUrls(current);
        return exportResult;
      });
      downloadBlob(exportResult.blob, filename);
      addToExportHistory({ filename, format: settings.format, timestamp: Date.now(), url: URL.createObjectURL(exportResult.blob), blob: exportResult.blob, metadata: { kind: 'print-master', placementSummary: formatPlacementSummary(activePlacement), jobRevision: currentJob?.revision } });
    } catch (exportError) {
      if (exportError instanceof DOMException && exportError.name === 'AbortError') return;
      console.error(exportError);
      setError(exportError instanceof Error && /stalled|cancelled|worker|background/i.test(exportError.message)
        ? exportError.message
        : 'Ink Master could not export this print file. Try again or choose a smaller product.');
    } finally {
      if (processingAbortRef.current === controller) {
        processingAbortRef.current = null;
        setIsProcessing(false);
        setProcessingProgress(null);
      }
    }
  };

  const handleProductChange = (product: PrintifyProductPreset) => {
    setSelectedPrintifyProductId(product.id);
    const nextSettings = {
      ...settings,
      itemType: product.itemType,
      format: OutputFormat.PNG,
      resizeMode: ResizeMode.FIT,
      allowUpscaling: true,
      preserveTransparency: true,
      targetWidth: product.px[0],
      targetHeight: product.px[1],
      targetDpi: product.dpi,
      designScalePercent: 100,
      designOffsetXPercent: 0,
      designOffsetYPercent: 0,
      designRotationDegrees: 0,
      canvasBackground: 'transparent',
    };
    handleSettingsChange(nextSettings, true);
    updateCurrentJob((job) => ({
      ...job,
      settings: nextSettings,
      printSpecification: printifyProductToSpecification(product),
    }));
  };

  const handleDownloadPdf = async () => {
    if (!processedResult) return;
    try {
      const result = await generatePrintPDF(processedResult.url, settings.itemType);
      const filename = `inkmaster_production_${settings.itemType.toLowerCase()}.pdf`;
      downloadBlob(result.blob, filename);
      addToExportHistory({ filename, format: 'PDF', timestamp: Date.now(), url: URL.createObjectURL(result.blob), blob: result.blob, metadata: { kind: 'production-pdf', placementSummary: formatPlacementSummary(activePlacement), jobRevision: currentJob?.revision } });
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
        <main className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 content-center gap-8 px-4 py-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:px-8">
          <section className="mx-auto max-w-xl text-center lg:mx-0 lg:text-left" aria-labelledby="home-title">
            <img src="/logo/logo.png" alt="" className="mx-auto h-16 w-16 object-contain drop-shadow-2xl sm:h-20 sm:w-20 lg:mx-0" />
            <h1 id="home-title" className="mt-4 text-balance text-3xl font-black leading-tight text-slate-100 sm:mt-5 sm:text-5xl">
              Turn any image into a print-ready file for Printify.
            </h1>
            <p className="mt-4 text-sm leading-6 text-slate-400 sm:leading-7 sm:text-base">
              Drop artwork, pick a product, and download a PNG sized for print-on-demand upload without production jargon.
            </p>
            <div className="mt-6 hidden gap-3 text-left sm:grid sm:grid-cols-3">
              <div className="rounded-lg border border-slate-800 bg-slate-900/45 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Drop</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">Start with a PNG, JPG, WebP, or safe SVG kept on this device.</p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/45 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Pick</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">Choose a visual product preset with the right pixels and DPI.</p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/45 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">Download</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">Save a compliant file under Printify upload limits.</p>
              </div>
            </div>
            <div className="mt-6 hidden flex-wrap justify-center gap-3 text-xs text-slate-500 sm:flex lg:justify-start">
              <span>Local-first</span><span className="text-slate-700">/</span><span>Printify presets</span><span className="text-slate-700">/</span><span>PNG export</span>
            </div>
          </section>
          <section className="mx-auto w-full max-w-2xl" aria-label="Start a print-ready file">
            <Dropzone onFileAccepted={handleFileAccepted} />
            {error && <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-center text-xs text-rose-300">{error}</p>}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={() => setShowJobs(true)} className="rounded-lg border border-slate-800 px-5 py-2.5 text-xs font-bold text-indigo-300 hover:border-indigo-700 hover:text-indigo-200">
                Open saved design{jobs.length ? ` (${jobs.length})` : ''}
              </button>
              <button type="button" onClick={() => setAdvancedMode((value) => !value)} className="rounded-lg border border-slate-800 px-5 py-2.5 text-xs font-bold text-slate-400 hover:border-slate-600 hover:text-white">
                Advanced mode {advancedMode ? 'on' : 'off'}
              </button>
              {advancedMode && (
                <>
                  <button type="button" onClick={() => setShowBatch(true)} className="rounded-lg border border-slate-700 bg-slate-900/70 px-5 py-2.5 text-xs font-bold text-slate-300 hover:border-indigo-500 hover:text-white">Open batch processing</button>
                  <button type="button" onClick={() => setShowProfiles(true)} className="rounded-lg px-5 py-2.5 text-xs font-bold text-slate-400 hover:text-white">
                    Manage profiles
                  </button>
                </>
              )}
            </div>
          </section>
        </main>
        <SiteFooter />
        {showBatch && (
          <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/70" />}>
            <BatchProcessor
              onClose={() => setShowBatch(false)}
              defaultSettings={batchDefaultSettings}
              productionProfile={currentJob?.productionProfile.snapshot ?? defaultProductionProfile}
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
        {showProfiles && (
          <ProfileManager
            store={profileStore}
            onStoreChange={handleProfileStoreChange}
            onClose={() => setShowProfiles(false)}
          />
        )}
      </div>
    );
  }

  if (!advancedMode) {
    return (
      <div className="flex h-dvh flex-col overflow-hidden bg-slate-950 text-slate-200">
        <header className="flex min-h-14 flex-none items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/95 px-4">
          <div className="flex min-w-0 items-center gap-2">
            <img src="/logo/logo.png" alt="" className="h-8 w-8 object-contain" />
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-white">{currentJob?.metadata.name ?? 'Untitled design'}</p>
              <p className={`text-[10px] font-semibold ${saveStatus === 'error' ? 'text-rose-400' : 'text-slate-500'}`}>
                {saveStatus === 'saving' ? 'Saving locally…' : saveStatus === 'error' ? 'Local save failed' : 'Saved locally'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleReset} className="rounded-lg border border-slate-800 px-3 py-2 text-xs font-bold text-slate-300 hover:border-slate-600 hover:text-white">New file</button>
            <button type="button" onClick={() => setShowJobs(true)} className="rounded-lg border border-slate-800 px-3 py-2 text-xs font-bold text-slate-300 hover:border-slate-600 hover:text-white">Saved</button>
          </div>
        </header>
        <SimpleCreatorFlow
          originalImage={originalImage}
          sourceName={currentJob?.metadata.name ?? 'Untitled design'}
          analysis={analysis}
          processedResult={processedResult}
          simpleExportResult={simpleExportResult}
          simpleExportError={simpleExportError}
          isProcessing={isProcessing}
          processingProgress={processingProgress}
          selectedProduct={selectedPrintifyProduct}
          products={printify.products}
          onProductChange={handleProductChange}
          settings={settings}
          onSettingsChange={handleSettingsChange}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={() => canUndo && setHistoryIndex((index) => index - 1)}
          onRedo={() => canRedo && setHistoryIndex((index) => index + 1)}
          onDownload={handleDownloadPrintFile}
          onCancelProcessing={handleCancelProcessing}
          onAdvancedMode={() => setAdvancedMode(true)}
        />
        {error && (
          <div className="fixed left-3 right-3 top-16 z-40 flex items-center justify-between gap-3 rounded-lg border border-rose-500/30 bg-rose-950/90 px-4 py-3 text-xs text-rose-200 shadow-xl">
            <span>{error}</span>
            {canRetryProcessing && (
              <button
                type="button"
                onClick={handleRetryProcessing}
                className="flex-none rounded-md border border-rose-300/40 px-3 py-1.5 font-black text-rose-100 hover:border-rose-200 hover:text-white"
              >
                Retry processing
              </button>
            )}
          </div>
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
        productionProfile={(
          <ProfileSelector
            applied={appliedProductionProfile}
            profiles={profileStore.profiles}
            updateState={profileUpdateState}
            onAssign={handleAssignProfile}
            onApplyUpdate={() => {
              if (profileUpdateState.status === 'update-available' && profileUpdateState.source) {
                setProfileUpdateSource(structuredClone(profileUpdateState.source));
              }
            }}
            onManage={() => setShowProfiles(true)}
          />
        )}
        templates={(
          <TemplatesPopover
            templates={shopTemplates}
            currentJob={currentProductionJob}
            onApply={handleApplyTemplate}
            onSave={handleSaveTemplate}
            onDelete={handleDeleteTemplate}
            onDuplicate={handleDuplicateTemplate}
            onRename={handleRenameTemplate}
            onUpdateAppliedTemplate={handleUpdateAppliedTemplate}
            onExport={handleExportTemplates}
            onImport={(file) => void handleImportTemplates(file)}
            importMessage={templateImportMessage}
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
              currentJobRevision={currentJob?.revision ?? null}
              hasProcessedResult={Boolean(processedResult)}
              hasArtwork={Boolean(originalImage)}
              lowResolutionAcknowledged={lowResolutionAcknowledged}
              aiCleanupStatus={aiCleanupStatus}
              isAiCleanupProcessing={isAiCleanupProcessing}
              isEyedropperMode={isEyedropperMode}
              printSpecification={printSpecification}
              placement={activePlacement}
              productionProfile={activeProductionProfile}
              preflightFindings={preflightFindings}
              preflightAcknowledged={preflightAcknowledged}
              packageReview={packageReview}
              jobMetadata={currentJob?.metadata ?? { name: 'Untitled job', customerName: '', orderNumber: '', notes: '', tags: [] }}
              appliedTemplateStatus={appliedTemplateStatus}
              namingPattern={currentJob?.packageOptions.namingPattern ?? ''}
              packageOptions={currentJob?.packageOptions ?? DEFAULT_PACKAGE_OPTIONS}
              proofBranding={currentJob?.proofBranding ?? DEFAULT_PROOF_BRANDING}
              proofApproval={currentJob?.proofApproval ?? fallbackProofApproval}
              cloudApprovalCapability={cloudApprovalCapability}
              proofFilenames={proofFilenames}
              selectedMockupCount={resolveMockupSelectionForItemType(currentJob?.packageOptions.selectedMockupIndices, settings.itemType).length}
              selectedMockupSummary={describeSelectedMockups(currentJob?.packageOptions.selectedMockupIndices, settings.itemType)}
              onStageChange={setStage}
              onApplyRecipe={handleApplyRecipe}
              onSettingsChange={handleSettingsChange}
              onAiEdgeCleanup={() => void handleAiEdgeCleanup()}
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
              onPackageOptionsChange={(packageOptions) => updateCurrentJob((job) => ({
                ...job,
                packageOptions,
              }))}
              onUpdateAppliedTemplate={handleUpdateAppliedTemplate}
              onProofBrandingChange={(proofBranding) => updateCurrentJob((job) => ({
                ...job,
                proofBranding,
              }))}
              onProofApprovalChange={handleProofApprovalChange}
              onMarkProofSent={handleMarkProofSent}
              onRecordProofResponse={handleRecordProofResponse}
              onDownloadProductionPackage={() => void handleDownloadProductionPackage()}
              onRegenerateProductionPackage={(entry) => void handleRegenerateProductionPackage(entry)}
              onDownloadProof={(quality) => void handleDownloadProof(quality)}
            />
          </AppliedProductionProfileContext.Provider>
        </div>

        <section className="relative order-1 min-h-0 overflow-hidden bg-slate-900/40 p-2 lg:order-2 lg:p-4">
          <div className="relative h-full min-h-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-2xl shadow-black/30">
            {(isAnalyzing || (isProcessing && !processedResult)) && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
                <div className="w-full max-w-xs px-5 text-center">
                  <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
                  <p className="mt-3 text-xs font-bold text-slate-300">{isAnalyzing ? 'Reading the artwork…' : processingProgress?.stage ?? 'Building the print preview…'}</p>
                  {!isAnalyzing && processingProgress && (
                    <>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-indigo-500 transition-[width] duration-200"
                          style={{ width: `${processingProgress.percent}%` }}
                        />
                      </div>
                      <p className="mt-2 text-[11px] font-bold text-slate-500">{processingProgress.percent}%</p>
                      <button
                        type="button"
                        onClick={handleCancelProcessing}
                        className="mt-4 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:border-slate-500 hover:text-white"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
            {error && (
              <div className="absolute left-3 right-3 top-3 z-40 flex items-center justify-between gap-3 rounded-lg border border-rose-500/30 bg-rose-950/90 px-4 py-3 text-xs text-rose-200 shadow-xl">
                <span>{error}</span>
                {canRetryProcessing && (
                  <button
                    type="button"
                    onClick={handleRetryProcessing}
                    className="flex-none rounded-md border border-rose-300/40 px-3 py-1.5 font-black text-rose-100 hover:border-rose-200 hover:text-white"
                  >
                    Retry processing
                  </button>
                )}
              </div>
            )}
            {processedResult ? (
              <Preview
                originalImage={originalImage}
                processedResult={processedResult}
                settings={settings}
                isProcessing={isProcessing}
                onExported={(blob, filename) => addToExportHistory({
                  filename,
                  format: settings.format,
                  timestamp: Date.now(),
                  url: URL.createObjectURL(blob),
                  blob,
                  metadata: {
                    kind: 'mockup-set',
                    placementSummary: activePlacement ? formatPlacementSummary(activePlacement) : 'No placement selected',
                    jobRevision: currentJob?.revision,
                  },
                })}
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
                mockupItemType={settings.itemType}
                selectedMockupIndices={currentJob?.packageOptions.selectedMockupIndices}
                onSelectedMockupIndicesChange={(selectedMockupIndices) => updateCurrentJob((job) => ({
                  ...job,
                  packageOptions: {
                    ...job.packageOptions,
                    selectedMockupIndices,
                  },
                }))}
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
            ) : originalImage ? (
              <div className="flex h-full items-center justify-center p-6 text-center">
                <div className="w-full max-w-md">
                  <div className="mx-auto flex max-h-[46dvh] min-h-48 items-center justify-center overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 p-4 shadow-inner shadow-black/30">
                    <img src={originalImage} alt="Uploaded source artwork" className="max-h-[40dvh] max-w-full object-contain" />
                  </div>
                  <div className="mt-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 text-left">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">Artwork loaded</p>
                    <h2 className="mt-1 text-sm font-black text-white">{currentJob?.sourceArtwork?.name ?? currentJob?.metadata.name ?? 'Source artwork'} is ready for setup.</h2>
                    <p className="mt-2 text-xs leading-relaxed text-indigo-100/70">
                      Choose a print goal on the left, apply a treatment, then build the first preview.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-center text-slate-600">
                <div><div className="text-4xl">◫</div><p className="mt-2 text-xs">Upload artwork to start a design</p></div>
              </div>
            )}
          </div>
        </section>
      </main>

      {showBatch && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/70" />}>
          <BatchProcessor
            onClose={() => setShowBatch(false)}
            defaultSettings={batchDefaultSettings}
            productionProfile={currentJob?.productionProfile.snapshot ?? defaultProductionProfile}
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
      {showProfiles && (
        <ProfileManager
          store={profileStore}
          onStoreChange={handleProfileStoreChange}
          onClose={() => setShowProfiles(false)}
        />
      )}
      {currentJob && profileUpdateSource && (
        <ProfileUpdateReview
          applied={currentJob.productionProfile}
          source={profileUpdateSource}
          onCancel={() => setProfileUpdateSource(null)}
          onApply={() => applyProfileToCurrentJob(profileUpdateSource)}
        />
      )}
    </div>
  );
};

export default App;
