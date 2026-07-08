import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArtworkAnalysis,
  AiCleanupStatus,
  EdgeBehavior,
  ExportHistoryEntry,
  AppliedTemplateStatus,
  ItemType,
  JobMetadata,
  OutputFormat,
  PlacementMeasurement,
  PreflightFinding,
  PrintSpecification,
  ProofApprovalState,
  ProofBranding,
  ProductionPackageOptions,
  ProductionProfile,
  ProcessingSettings,
  RecipeId,
  RecipeRecommendation,
  ShirtColor,
  UserRecipe,
  WorkspaceStage,
} from '../types';
import { CustomerProofBuilder } from './CustomerProofBuilder';
import { PlacementPanel } from './PlacementPanel';
import { PreflightPanel } from './PreflightPanel';
import { ProductionPackageReview } from './ProductionPackageReview';
import { getPreflightGate } from '../services/preflight';
import { getRecipe, RECIPES } from '../services/recipes';
import { migrateStoredRecipes } from '../services/recipeStorage';
import { ProductionPackageReview as ProductionPackageReviewModel } from '../services/packageReview';
import { CloudApprovalCapability, getLatestProofFreshness } from '../services/proofApproval';
import { getDefaultMockupSelectionForItemType, getProductionMockupEntries } from '../services/mockups';
import { buildProductionWorkflowPath, getProductionWorkflowFocus, getWorkflowStageForStep, ProductionWorkflowStepStatus } from '../services/workflowPath';
import { formatPlacementSummary, formatPrintSizeSummary } from '../services/handoffDetails';
import { getBlockedPackageRecoveryLabel, getCompactExportDownloadLabel, getLatestBlockedPackageAttempt, isBlockedPackageAttempt } from '../services/exportHistory';

const STAGES: Array<{ id: WorkspaceStage; label: string; short: string }> = [
  { id: 'goal', label: 'Goal', short: 'Choose the result' },
  { id: 'prepare', label: 'Prepare', short: 'Clean the artwork' },
  { id: 'preview', label: 'Preview', short: 'Check the product' },
  { id: 'export', label: 'Export', short: 'Download files' },
];

const exportKindLabel = (entry: ExportHistoryEntry) => {
  switch (entry.metadata?.kind) {
    case 'production-package': return 'Production package';
    case 'production-package-blocked': return 'Blocked package attempt';
    case 'customer-proof': return 'Customer proof';
    case 'print-master': return 'Print master';
    case 'production-pdf': return 'Production PDF';
    case 'mockup-set': return 'Mockup set';
    case 'underbase': return 'White underbase';
    default: return 'Export';
  }
};

const exportReadinessClassName = (status: NonNullable<ExportHistoryEntry['metadata']>['readinessStatus']) => {
  switch (status) {
    case 'ready': return 'text-emerald-300';
    case 'attention': return 'text-amber-300';
    case 'blocked': return 'text-rose-300';
    default: return 'text-slate-500';
  }
};

const workflowStatusClass: Record<ProductionWorkflowStepStatus, string> = {
  done: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  current: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-200',
  review: 'border-amber-500/35 bg-amber-500/10 text-amber-200',
  blocked: 'border-rose-500/35 bg-rose-500/10 text-rose-200',
  pending: 'border-slate-800 bg-slate-950/50 text-slate-500',
};

const workflowStatusLabel: Record<ProductionWorkflowStepStatus, string> = {
  done: 'Done',
  current: 'Now',
  review: 'Review',
  blocked: 'Blocked',
  pending: 'Pending',
};

const stageActionLabel: Record<WorkspaceStage, string> = {
  goal: 'Open setup',
  prepare: 'Open prep',
  preview: 'Open placement',
  export: 'Open export',
};

const STORAGE_KEY = 'inkmaster_presets';

const PRODUCTS: Array<{ id: ItemType; label: string; icon: string; note: string }> = [
  { id: ItemType.TSHIRT, label: 'T-shirt', icon: '👕', note: 'Front, back, chest, sleeve' },
  { id: ItemType.HOODIE, label: 'Hoodie', icon: '🧥', note: 'Reduced front for pocket area' },
  { id: ItemType.HAT, label: 'Hat', icon: '🧢', note: 'Small platen placements' },
  { id: ItemType.MUG, label: 'Mug', icon: '☕', note: 'Front/back plus wrap area' },
  { id: ItemType.TOTE, label: 'Tote', icon: '👜', note: 'Large bag print areas' },
];

interface WorkflowInspectorProps {
  stage: WorkspaceStage;
  selectedRecipeId: RecipeId | null;
  analysis: ArtworkAnalysis | null;
  recommendation: RecipeRecommendation | null;
  settings: ProcessingSettings;
  palette: string[];
  exportHistory: ExportHistoryEntry[];
  currentJobRevision: number | null;
  hasProcessedResult: boolean;
  hasArtwork: boolean;
  lowResolutionAcknowledged: boolean;
  aiCleanupStatus: AiCleanupStatus;
  isAiCleanupProcessing: boolean;
  isEyedropperMode: boolean;
  printSpecification: PrintSpecification;
  placement: PlacementMeasurement;
  productionProfile: ProductionProfile;
  preflightFindings: PreflightFinding[];
  preflightAcknowledged: boolean;
  packageReview: ProductionPackageReviewModel | null;
  jobMetadata: JobMetadata;
  appliedTemplateStatus: AppliedTemplateStatus;
  namingPattern: string;
  packageOptions: ProductionPackageOptions;
  proofBranding: ProofBranding;
  proofApproval: ProofApprovalState;
  cloudApprovalCapability: CloudApprovalCapability;
  proofFilenames: { print: string; email: string };
  selectedMockupCount: number;
  selectedMockupSummary: string;
  onStageChange: (stage: WorkspaceStage) => void;
  onApplyRecipe: (recipeId: RecipeId, settings?: ProcessingSettings) => void;
  onSettingsChange: (settings: ProcessingSettings, commit: boolean) => void;
  onAiEdgeCleanup: () => void;
  onToggleEyedropper: () => void;
  onGenerateUnderbase: (format: 'PNG' | 'SVG' | 'JPG') => void;
  onDownloadPrintFile: () => void;
  onDownloadPdf: () => void;
  onDownloadMockups: () => void;
  onAcknowledgeLowResolution: (value: boolean) => void;
  onPrintSpecificationChange: (specification: PrintSpecification) => void;
  onPlacementChange: (placement: PlacementMeasurement) => void;
  onAcknowledgePreflight: (value: boolean) => void;
  onJobMetadataChange: (metadata: JobMetadata) => void;
  onNamingPatternChange: (pattern: string) => void;
  onPackageOptionsChange: (options: ProductionPackageOptions) => void;
  onUpdateAppliedTemplate: () => void;
  onProofBrandingChange: (branding: ProofBranding) => void;
  onProofApprovalChange: (approval: ProofApprovalState) => void;
  onMarkProofSent: () => void;
  onRecordProofResponse: (status: 'approved' | 'changes-requested') => void;
  onDownloadProductionPackage: () => void;
  onRegenerateProductionPackage: (entry: ExportHistoryEntry) => void;
  onDownloadProof: (quality: 'print' | 'email') => void;
}

const Toggle: React.FC<{ checked: boolean; onChange: () => void; label: string }> = ({ checked, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={onChange}
    className={`relative h-6 w-11 rounded-full transition ${checked ? 'bg-indigo-500' : 'bg-slate-700'}`}
  >
    <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${checked ? 'left-6' : 'left-1'}`} />
  </button>
);

const Section: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({ title, description, children }) => (
  <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
    <div className="mb-3">
      <h3 className="text-sm font-bold text-slate-100">{title}</h3>
      {description && <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>}
    </div>
    {children}
  </section>
);

const Segmented: React.FC<{
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}> = ({ value, options, onChange }) => (
  <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-700 bg-slate-950/50 p-1">
    {options.map((option) => (
      <button
        type="button"
        key={option.value}
        onClick={() => onChange(option.value)}
        className={`rounded-md px-2 py-2 text-[11px] font-bold transition ${value === option.value ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
      >
        {option.label}
      </button>
    ))}
  </div>
);

const PACKAGE_OPTION_CONTROLS: Array<{
  key: keyof Pick<
    ProductionPackageOptions,
    'includePrintMaster' | 'includeProductionPdf' | 'includeMockups' | 'includeUnderbase' | 'includeSummary' | 'includeManifest'
  >;
  label: string;
  note: string;
}> = [
  { key: 'includePrintMaster', label: 'Print master', note: 'Final processed artwork.' },
  { key: 'includeProductionPdf', label: 'Spec PDF', note: 'Operator-facing print sheet.' },
  { key: 'includeMockups', label: 'Mockups', note: 'Selected garment/product previews.' },
  { key: 'includeUnderbase', label: 'Underbase', note: 'White layer for dark garments.' },
  { key: 'includeSummary', label: 'Summary', note: 'Readable production notes.' },
  { key: 'includeManifest', label: 'Manifest', note: 'Machine-readable job metadata.' },
];

export const WorkflowInspector: React.FC<WorkflowInspectorProps> = (props) => {
  const {
    stage,
    selectedRecipeId,
    analysis,
    recommendation,
    settings,
    palette,
    exportHistory,
    currentJobRevision,
    hasProcessedResult,
    hasArtwork,
    lowResolutionAcknowledged,
    aiCleanupStatus,
    isAiCleanupProcessing,
    isEyedropperMode,
    printSpecification,
    placement,
    productionProfile,
    preflightFindings,
    preflightAcknowledged,
    packageReview,
    jobMetadata,
    appliedTemplateStatus,
    namingPattern,
    packageOptions,
    proofBranding,
    proofApproval,
    cloudApprovalCapability,
    proofFilenames,
    selectedMockupCount,
    selectedMockupSummary,
    onStageChange,
    onApplyRecipe,
    onSettingsChange,
    onAiEdgeCleanup,
    onToggleEyedropper,
    onGenerateUnderbase,
    onDownloadPrintFile,
    onDownloadPdf,
    onDownloadMockups,
    onAcknowledgeLowResolution,
    onPrintSpecificationChange,
    onPlacementChange,
    onAcknowledgePreflight,
    onJobMetadataChange,
    onNamingPatternChange,
    onPackageOptionsChange,
    onUpdateAppliedTemplate,
    onProofBrandingChange,
    onProofApprovalChange,
    onMarkProofSent,
    onRecordProofResponse,
    onDownloadProductionPackage,
    onRegenerateProductionPackage,
    onDownloadProof,
  } = props;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [userRecipes, setUserRecipes] = useState<UserRecipe[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [recipeName, setRecipeName] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const migrated = migrateStoredRecipes(localStorage.getItem(STORAGE_KEY));
    setUserRecipes(migrated);
  }, []);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [stage]);

  const selectedRecipe = selectedRecipeId ? getRecipe(selectedRecipeId) : null;
  const stageIndex = STAGES.findIndex((entry) => entry.id === stage);
  const update = <K extends keyof ProcessingSettings>(key: K, value: ProcessingSettings[K], commit = true) =>
    onSettingsChange({ ...settings, [key]: value }, commit);

  const finishMode = settings.grain >= 20 ? 'distressed' : settings.edgeBehavior === EdgeBehavior.SOFT ? 'soft' : 'clean';
  const changes = useMemo(() => recommendation?.proposedChanges ?? [], [recommendation]);
  const preflightGate = getPreflightGate(preflightFindings, preflightAcknowledged);
  const productionCheckStatus = preflightGate.criticalCount > 0
    ? 'Blocked'
    : preflightGate.requiresAcknowledgement && !preflightAcknowledged
      ? 'Review'
      : 'Ready';
  const productionCheckClass = preflightGate.criticalCount > 0
    ? 'border-rose-500/35 bg-rose-500/10 text-rose-100'
    : preflightGate.requiresAcknowledgement && !preflightAcknowledged
      ? 'border-amber-500/35 bg-amber-500/10 text-amber-100'
      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100';
  const printSizeSummary = formatPrintSizeSummary(printSpecification.widthInches, printSpecification.heightInches);
  const placementSummary = formatPlacementSummary(placement);
  const selectedProduct = PRODUCTS.find((product) => product.id === settings.itemType);
  const previewExportStatus = !hasProcessedResult
    ? 'Build preview first'
    : preflightGate.canExport
      ? 'Ready for proof'
      : productionCheckStatus;
  const proofFreshness = getLatestProofFreshness(exportHistory, currentJobRevision);
  const latestBlockedPackageAttempt = useMemo(
    () => getLatestBlockedPackageAttempt(exportHistory, currentJobRevision),
    [exportHistory, currentJobRevision],
  );
  const proofHandoffStatus = proofApproval.status === 'approved'
    ? proofFreshness?.stale
      ? 'Approved proof is stale'
      : 'Proof approved'
    : proofApproval.status === 'sent'
      ? proofFreshness?.stale
        ? 'Sent proof is stale'
        : 'Proof awaiting response'
      : proofApproval.status === 'changes-requested'
        ? 'Changes requested'
        : 'Proof not sent';
  const packageHandoffStatus = packageReview?.canExport
    ? 'Package ready'
    : packageReview?.gateStatus === 'blocked'
      ? 'Package blocked'
      : 'Package needs review';
  const workflowPath = buildProductionWorkflowPath({
    hasArtwork,
    hasProcessedResult,
    preflightFindings,
    preflightAcknowledged,
    proofApprovalStatus: proofApproval.status,
    proofFreshness,
    packageReview,
  });
  const workflowFocus = getProductionWorkflowFocus(workflowPath);
  const workflowFocusStage = workflowFocus ? getWorkflowStageForStep(workflowFocus.id) : null;
  const handoffMockupEntries = getProductionMockupEntries(settings.itemType);
  const selectedHandoffMockups = new Set(packageOptions.selectedMockupIndices);
  const togglePackageOption = <K extends keyof ProductionPackageOptions>(
    key: K,
    value: ProductionPackageOptions[K],
  ) => onPackageOptionsChange({ ...packageOptions, [key]: value });
  const toggleHandoffMockup = (index: number) => {
    const next = new Set<number>(packageOptions.selectedMockupIndices);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    onPackageOptionsChange({
      ...packageOptions,
      selectedMockupIndices: Array.from(next).sort((a, b) => a - b),
    });
  };
  const aiCleanupAvailable = aiCleanupStatus.availability === 'available' && aiCleanupStatus.supportedActions.includes('edge-cleanup');
  const aiCleanupBadgeClass = aiCleanupStatus.availability === 'available'
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
    : aiCleanupStatus.availability === 'checking'
      ? 'border-slate-700 bg-slate-950/50 text-slate-400'
      : 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  const aiCleanupBadge = aiCleanupStatus.availability === 'available'
    ? 'Available'
    : aiCleanupStatus.availability === 'checking'
      ? 'Checking'
      : aiCleanupStatus.availability === 'error'
        ? 'Status unknown'
        : 'Not configured';
  const templateStatusLabel = appliedTemplateStatus.status === 'none'
    ? 'None applied'
    : appliedTemplateStatus.status === 'matches'
      ? `${appliedTemplateStatus.appliedTemplate?.name} · matches saved template`
      : appliedTemplateStatus.status === 'missing'
        ? `${appliedTemplateStatus.appliedTemplate?.name} · template missing from library`
        : `${appliedTemplateStatus.appliedTemplate?.name} · changed after apply: ${appliedTemplateStatus.changes.join(', ')}`;
  const templateStatusClass = appliedTemplateStatus.status === 'matches'
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
    : appliedTemplateStatus.status === 'drifted'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
      : appliedTemplateStatus.status === 'missing'
        ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
        : 'border-slate-800 bg-slate-950/60 text-slate-400';

  const saveRecipe = () => {
    if (!recipeName.trim()) return;
    const recipe: UserRecipe = {
      id: `preset_${Date.now()}`,
      name: recipeName.trim(),
      description: selectedRecipe ? `Based on ${selectedRecipe.name}` : 'Custom Ink Master treatment',
      createdAt: Date.now(),
      source: 'user',
      settings: { ...settings },
    };
    const next = [recipe, ...userRecipes];
    setUserRecipes(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setRecipeName('');
    setSaveOpen(false);
  };

  return (
    <aside className="flex h-full min-h-0 flex-col border-t border-slate-800 bg-slate-950 lg:border-r lg:border-t-0">
      <nav className="grid flex-none grid-cols-4 border-b border-slate-800 px-2 py-2 lg:grid-cols-1 lg:gap-1 lg:p-3">
        {STAGES.map((entry, index) => (
          <button
            type="button"
            key={entry.id}
            onClick={() => onStageChange(entry.id)}
            className={`flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-left transition lg:px-3 ${stage === entry.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/30' : 'text-slate-500 hover:bg-slate-900 hover:text-slate-200'}`}
          >
            <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-md text-[10px] font-black ${stage === entry.id ? 'bg-white/15' : index < stageIndex ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-900'}`}>
              {index < stageIndex ? '✓' : index + 1}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[11px] font-bold lg:text-xs">{entry.label}</span>
              <span className={`hidden truncate text-[10px] lg:block ${stage === entry.id ? 'text-indigo-100/70' : 'text-slate-600'}`}>{entry.short}</span>
            </span>
          </button>
        ))}
      </nav>

      <section aria-label="Production path" className="flex-none overflow-y-auto overscroll-contain border-b border-slate-800 bg-slate-950/60 px-3 py-3 max-h-[7rem] sm:max-h-[12.5rem] lg:max-h-[18rem]">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Production path</p>
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">DTG/DTF</span>
        </div>
        {workflowFocus && (
          <div className={`mb-2 rounded-lg border px-3 py-2 ${workflowStatusClass[workflowFocus.status]}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-[11px] font-black">Next: {workflowFocus.label}</p>
              <span className="flex-none rounded-full border border-current px-2 py-0.5 text-[8px] font-black uppercase opacity-80">{workflowStatusLabel[workflowFocus.status]}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-[10px] leading-snug opacity-80 lg:line-clamp-none">{workflowFocus.note}</p>
            {workflowFocusStage && workflowFocusStage !== stage && (
              <button
                type="button"
                onClick={() => onStageChange(workflowFocusStage)}
                className="mt-2 rounded-md border border-current px-2 py-1 text-[9px] font-black uppercase tracking-wide opacity-85 transition hover:opacity-100"
              >
                {stageActionLabel[workflowFocusStage]}
              </button>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-1">
          {workflowPath.map((step) => (
            <div key={step.id} className={`rounded-lg border px-2 py-1.5 ${workflowStatusClass[step.status]} ${step.id === 'package' ? 'col-span-2 sm:col-span-1' : ''}`} title={step.note}>
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-[10px] font-black">{step.label}</span>
                <span className="rounded-full border border-current px-1.5 py-0.5 text-[8px] font-black uppercase opacity-80">{workflowStatusLabel[step.status]}</span>
              </div>
              <p className="mt-1 hidden text-[9px] leading-snug opacity-80 lg:line-clamp-2 lg:block">{step.note}</p>
            </div>
          ))}
        </div>
      </section>

      <div ref={contentRef} aria-label="Workflow stage controls" className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-5">
        {stage === 'goal' && (
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-400">Production setup</p>
              <h2 className="mt-1 text-xl font-black text-white">Choose the print recipe for this job.</h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">This sets the first treatment, output format, garment preview, and preflight assumptions. You can refine everything before export.</p>
            </div>

            <div className="grid gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-[10px] leading-relaxed text-slate-400 sm:grid-cols-3">
              <div>
                <p className="font-black uppercase tracking-widest text-emerald-300">1 · Pick recipe</p>
                <p className="mt-1">Start from a production-safe treatment instead of raw sliders.</p>
              </div>
              <div>
                <p className="font-black uppercase tracking-widest text-indigo-300">2 · Prep artwork</p>
                <p className="mt-1">Review background, garment, finish, and effective DPI.</p>
              </div>
              <div>
                <p className="font-black uppercase tracking-widest text-amber-300">3 · Export proof</p>
                <p className="mt-1">Move into placement, proof approval, and package handoff.</p>
              </div>
            </div>

            {recommendation && (
              <section className="rounded-xl border border-indigo-500/40 bg-indigo-500/10 p-4 shadow-lg shadow-indigo-950/20">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">Recommended production recipe</p>
                    <h3 className="mt-1 text-base font-black text-white">{getRecipe(recommendation.recipeId).name}</h3>
                  </div>
                  <span className="rounded-full bg-indigo-500/15 px-2 py-1 text-[10px] font-bold text-indigo-200">{Math.round(recommendation.confidence * 100)}% match</span>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {recommendation.reasons.map((reason) => <li key={reason} className="flex gap-2 text-xs leading-relaxed text-slate-300"><span className="text-indigo-400">•</span>{reason}</li>)}
                </ul>
                <details className="mt-3 text-xs text-slate-400">
                  <summary className="cursor-pointer font-semibold text-indigo-300">What this recipe will change</summary>
                  <ul className="mt-2 space-y-1 pl-3">{changes.map((change) => <li key={change}>— {change}</li>)}</ul>
                </details>
                <button type="button" onClick={() => onApplyRecipe(recommendation.recipeId)} className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-black text-white hover:bg-indigo-500">
                  Apply recipe and open prep
                </button>
              </section>
            )}

            <div className="grid grid-cols-2 gap-2">
              {RECIPES.map((recipe) => (
                <button
                  type="button"
                  key={recipe.id}
                  onClick={() => onApplyRecipe(recipe.id)}
                  className={`min-h-28 rounded-xl border p-3 text-left transition ${selectedRecipeId === recipe.id ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/30' : 'border-slate-800 bg-slate-900/70 hover:border-slate-700 hover:bg-slate-900'}`}
                >
                  <span className="text-lg text-indigo-300">{recipe.icon}</span>
                  <span className="mt-2 block text-xs font-black text-slate-100">{recipe.name}</span>
                  <span className="mt-1 block text-[10px] leading-relaxed text-slate-500">{recipe.description}</span>
                  <span className="mt-2 block rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-500">{recipe.outcome}</span>
                </button>
              ))}
            </div>

            {userRecipes.length > 0 && (
              <Section title="My Recipes" description="Your existing presets have been kept and translated into this workflow.">
                <div className="space-y-2">
                  {userRecipes.map((recipe) => (
                    <button type="button" key={recipe.id} onClick={() => onApplyRecipe('custom', recipe.settings)} className="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-left hover:border-indigo-500/50">
                      <span>
                        <span className="block text-xs font-bold text-slate-200">{recipe.name}</span>
                        <span className="block text-[10px] text-slate-500">{recipe.description || 'Saved treatment'}</span>
                      </span>
                      <span className="text-[10px] font-bold text-indigo-300">Apply</span>
                    </button>
                  ))}
                </div>
              </Section>
            )}
          </div>
        )}

        {stage === 'prepare' && (
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-400">Prepare</p>
              <h2 className="mt-1 text-xl font-black text-white">Make the artwork print-friendly.</h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">Start with the production checks, then adjust only the artwork treatment that affects this job.</p>
            </div>

            <section className={`rounded-xl border p-4 shadow-lg shadow-black/10 ${productionCheckClass}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-75">Production checks first</p>
                  <h3 className="mt-1 text-base font-black text-white">{productionCheckStatus}</h3>
                </div>
                <span className="rounded-full border border-current px-2 py-1 text-[9px] font-black uppercase opacity-80">
                  {preflightGate.warningCount} warning · {preflightGate.criticalCount} critical
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-[10px] leading-relaxed sm:grid-cols-3">
                <div className="rounded-lg border border-current/20 bg-slate-950/30 px-3 py-2">
                  <p className="font-black uppercase tracking-widest opacity-70">Print size</p>
                  <p className="mt-1 text-slate-100">{printSizeSummary} · {printSpecification.targetDpi} DPI target</p>
                </div>
                <div className="rounded-lg border border-current/20 bg-slate-950/30 px-3 py-2">
                  <p className="font-black uppercase tracking-widest opacity-70">Placement</p>
                  <p className="mt-1 text-slate-100">{placementSummary}</p>
                </div>
                <div className="rounded-lg border border-current/20 bg-slate-950/30 px-3 py-2">
                  <p className="font-black uppercase tracking-widest opacity-70">Next check</p>
                  <p className="mt-1 text-slate-100">
                    {preflightGate.criticalCount > 0
                      ? 'Fix critical preflight issues before export.'
                      : preflightGate.requiresAcknowledgement && !preflightAcknowledged
                        ? 'Review and acknowledge warnings before export.'
                        : 'Treatment controls below can be adjusted safely.'}
                  </p>
                </div>
              </div>
            </section>

            <Section title="Background" description="Remove a solid border color while protecting the artwork inside it.">
              <Segmented
                value={settings.bgRemoval ? 'remove' : 'keep'}
                options={[{ value: 'keep', label: 'Keep as-is' }, { value: 'remove', label: 'Remove solid' }, { value: 'refine', label: 'Refine' }]}
                onChange={(value) => {
                  if (value === 'keep') update('bgRemoval', false);
                  if (value === 'remove') onSettingsChange({ ...settings, bgRemoval: true, bgAutoDetect: true, bgColorOverride: null }, true);
                  if (value === 'refine') { update('bgRemoval', true); setAdvancedOpen(true); }
                }}
              />
              {analysis?.edgeBackground.isUniform && (
                <p className="mt-2 text-[10px] text-emerald-400">Solid {analysis.edgeBackground.tone} edge detected: {analysis.edgeBackground.color}</p>
              )}
            </Section>

            <Section title="AI cleanup" description="Optional server-side edge repair for leftover background haze and halos.">
              <div className={`rounded-lg border px-3 py-2 text-[10px] font-semibold ${aiCleanupBadgeClass}`}>
                {aiCleanupBadge}: <span className="font-medium">{aiCleanupStatus.message}</span>
              </div>
              <ul className="mt-3 space-y-1 text-[10px] leading-relaxed text-slate-500">
                <li>• Fixed action only: edge cleanup with transparent PNG output.</li>
                <li>• Operator reviews the result before production export.</li>
                {aiCleanupStatus.dailyLimitPerOperator !== null && <li>• Suggested daily limit: {aiCleanupStatus.dailyLimitPerOperator} cleanup requests per operator.</li>}
              </ul>
              <button
                type="button"
                disabled={!hasArtwork || !aiCleanupAvailable || isAiCleanupProcessing}
                onClick={onAiEdgeCleanup}
                className="mt-3 w-full rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-2.5 text-xs font-black text-indigo-100 hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-950/50 disabled:text-slate-600"
              >
                {isAiCleanupProcessing ? 'Cleaning edges…' : 'Clean edge halo with AI'}
              </button>
            </Section>

            <Section title="Garment treatment" description="Choose where the design needs to remain readable.">
              <Segmented
                value={settings.shirtColor}
                options={[{ value: ShirtColor.NONE, label: 'No knockout' }, { value: ShirtColor.BLACK, label: 'Dark garment' }, { value: ShirtColor.WHITE, label: 'Light garment' }]}
                onChange={(value) => update('shirtColor', value as ShirtColor)}
              />
            </Section>

            <Section title="Finish" description="Use one clear treatment. Fine controls remain available below.">
              <Segmented
                value={finishMode}
                options={[{ value: 'clean', label: 'Clean' }, { value: 'soft', label: 'Soft' }, { value: 'distressed', label: 'Distressed' }]}
                onChange={(value) => {
                  if (value === 'clean') onSettingsChange({ ...settings, edgeBehavior: EdgeBehavior.HARD, edgeFeather: 0, grain: 0, noise: 0, sharpness: 15 }, true);
                  if (value === 'soft') onSettingsChange({ ...settings, edgeBehavior: EdgeBehavior.SOFT, edgeFeather: 2, grain: 0, noise: 0, sharpness: 0 }, true);
                  if (value === 'distressed') onSettingsChange({ ...settings, edgeBehavior: EdgeBehavior.SOFT, edgeFeather: 2, grain: 36, noise: 12, sharpness: 0 }, true);
                }}
              />
              {finishMode === 'distressed' && (
                <label className="mt-3 block text-xs text-slate-400">
                  Distress intensity <span className="float-right font-mono text-indigo-300">{settings.grain}%</span>
                  <input type="range" min="10" max="80" value={settings.grain} onChange={(event) => update('grain', Number(event.target.value), false)} onMouseUp={() => update('grain', settings.grain)} className="mt-2 w-full accent-indigo-500" />
                </label>
              )}
            </Section>

            <Section title="Color" description="Pick a color from the artwork, then choose its replacement.">
              <button type="button" onClick={onToggleEyedropper} className={`w-full rounded-lg border px-3 py-2.5 text-xs font-bold transition ${isEyedropperMode ? 'border-indigo-400 bg-indigo-500/15 text-indigo-200' : 'border-slate-700 bg-slate-950/50 text-slate-300 hover:border-indigo-500'}`}>
                {isEyedropperMode ? 'Click a color on the artwork…' : 'Replace a color'}
              </button>
              {palette.length > 0 && <div className="mt-3 flex gap-2">{palette.map((color) => <span key={color} className="h-6 w-6 rounded-full border border-slate-600" style={{ backgroundColor: color }} title={color} />)}</div>}
            </Section>

            <Section title="Make scalable" description="Best for logos and limited-color artwork.">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-200">Trace artwork to SVG</p>
                  <p className="text-[10px] text-slate-500">{analysis?.vectorSuitability === 'strong' ? 'Strong fit for this artwork' : 'Use when crisp paths matter more than texture'}</p>
                </div>
                <Toggle checked={settings.vectorize} onChange={() => onSettingsChange({ ...settings, vectorize: !settings.vectorize, format: !settings.vectorize ? OutputFormat.SVG : OutputFormat.PNG }, true)} label="Make scalable" />
              </div>
            </Section>

            <PreflightPanel
              specification={printSpecification}
              findings={preflightFindings}
              acknowledged={preflightAcknowledged}
              onSpecificationChange={onPrintSpecificationChange}
              onAcknowledge={onAcknowledgePreflight}
            />

            <Section title="Job handoff details" description="These fields appear in filenames, manifests, packages, and customer proofs.">
              <div className="space-y-2">
                <p className={`rounded-lg border px-3 py-2 text-[10px] font-semibold ${templateStatusClass}`}>
                  Template: <span>{templateStatusLabel}</span>
                </p>
                {appliedTemplateStatus.status === 'drifted' && (
                  <button type="button" onClick={onUpdateAppliedTemplate} className="w-full rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[10px] font-bold text-amber-100 hover:bg-amber-500/20">
                    Update saved template from current job
                  </button>
                )}
                <input value={jobMetadata.customerName} onChange={(event) => onJobMetadataChange({ ...jobMetadata, customerName: event.target.value })} placeholder="Customer name" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-indigo-500" />
                <input value={jobMetadata.orderNumber} onChange={(event) => onJobMetadataChange({ ...jobMetadata, orderNumber: event.target.value })} placeholder="Order number" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-indigo-500" />
                <textarea value={jobMetadata.notes} onChange={(event) => onJobMetadataChange({ ...jobMetadata, notes: event.target.value })} placeholder="Production and customer notes" rows={3} className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-indigo-500" />
              </div>
            </Section>

            <Section title="File naming" description="Tokens: {job}, {customer}, {order}, {garment}, {placement}, {version}.">
              <input value={namingPattern} onChange={(event) => onNamingPatternChange(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-[10px] text-white outline-none focus:border-indigo-500" />
            </Section>

            <button type="button" onClick={() => setAdvancedOpen((value) => !value)} className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-xs font-bold text-slate-300 hover:border-slate-700">
              Advanced controls <span aria-hidden>{advancedOpen ? '−' : '+'}</span>
            </button>
            {advancedOpen && (
              <Section title="Technical controls" description="Fine-tune only when the simplified treatment needs correction.">
                <div className="space-y-4">
                  {[
                    ['Background tolerance', 'bgRemovalTolerance', settings.bgRemovalTolerance, 0, 100],
                    ['Knockout sensitivity', 'threshold', settings.threshold, 0, 100],
                    ['Edge softness', 'edgeFeather', settings.edgeFeather, 0, 20],
                    ['Sharpness', 'sharpness', settings.sharpness, 0, 100],
                    ['Fine noise', 'noise', settings.noise, 0, 100],
                    ['Grain', 'grain', settings.grain, 0, 100],
                  ].map(([label, key, value, min, max]) => (
                    <label key={String(key)} className="block text-xs text-slate-400">
                      {label} <span className="float-right font-mono text-indigo-300">{value}</span>
                      <input type="range" min={Number(min)} max={Number(max)} value={Number(value)} onChange={(event) => update(key as keyof ProcessingSettings, Number(event.target.value) as never, false)} onMouseUp={() => update(key as keyof ProcessingSettings, settings[key as keyof ProcessingSettings] as never)} className="mt-2 w-full accent-indigo-500" />
                    </label>
                  ))}
                </div>
              </Section>
            )}
          </div>
        )}

        {stage === 'preview' && (
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-400">Preview</p>
              <h2 className="mt-1 text-xl font-black text-white">Approve the placement before export.</h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">Confirm the product, printable area, garment color, and real-world size before creating proofs or package files.</p>
            </div>

            <section className={`rounded-xl border p-4 ${productionCheckClass}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-75">Placement review</p>
                  <h3 className="mt-1 text-base font-black text-white">{previewExportStatus}</h3>
                </div>
                <span className="rounded-full border border-current px-2 py-1 text-[9px] font-black uppercase opacity-80">
                  {selectedProduct?.label ?? settings.itemType}
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-[10px] leading-relaxed sm:grid-cols-3">
                <div className="rounded-lg border border-current/20 bg-slate-950/30 px-3 py-2">
                  <p className="font-black uppercase tracking-widest opacity-70">Placement</p>
                  <p className="mt-1 text-slate-100">{placementSummary}</p>
                </div>
                <div className="rounded-lg border border-current/20 bg-slate-950/30 px-3 py-2">
                  <p className="font-black uppercase tracking-widest opacity-70">Print target</p>
                  <p className="mt-1 text-slate-100">{printSizeSummary} · {printSpecification.targetDpi} DPI</p>
                </div>
                <div className="rounded-lg border border-current/20 bg-slate-950/30 px-3 py-2">
                  <p className="font-black uppercase tracking-widest opacity-70">Operator check</p>
                  <p className="mt-1 text-slate-100">
                    {preflightGate.canExport
                      ? 'Check garment colors and export a customer proof.'
                      : preflightGate.criticalCount > 0
                        ? 'Fix critical preflight issues before customer proof.'
                        : 'Acknowledge warnings before production export.'}
                  </p>
                </div>
              </div>
            </section>

            <Section title="Print readiness">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-black text-slate-100">{analysis?.printQuality.dpi ?? '—'} DPI</p>
                  <p className={`text-xs ${analysis?.printQuality.status === 'good' ? 'text-emerald-400' : analysis?.printQuality.status === 'low' ? 'text-amber-400' : 'text-rose-400'}`}>{analysis?.printQuality.label ?? 'Analyzing artwork'}</p>
                </div>
                <span className={`h-3 w-3 rounded-full ${analysis?.printQuality.status === 'good' ? 'bg-emerald-400' : analysis?.printQuality.status === 'low' ? 'bg-amber-400' : 'bg-rose-400'}`} />
              </div>
            </Section>
            <Section title="Product type" description="Switch products before checking placement. The printable area updates from the applied production profile.">
              <div className="grid grid-cols-2 gap-2">
                {PRODUCTS.map((product) => (
                  <button
                    type="button"
                    key={product.id}
                    onClick={() => update('itemType', product.id)}
                    className={`rounded-lg border p-2 text-left transition ${settings.itemType === product.id ? 'border-indigo-500 bg-indigo-500/10 text-white ring-1 ring-indigo-500/30' : 'border-slate-800 bg-slate-950/50 text-slate-400 hover:border-slate-700 hover:text-slate-200'}`}
                  >
                    <span className="text-base">{product.icon}</span>
                    <span className="ml-2 text-xs font-black">{product.label}</span>
                    <span className="mt-1 block text-[10px] leading-relaxed text-slate-500">{product.note}</span>
                  </button>
                ))}
              </div>
            </Section>
            <PlacementPanel placement={placement} profile={productionProfile} onChange={onPlacementChange} />
            <Section title="Review checklist">
              <ul className="space-y-2 text-xs text-slate-400">
                <li>✓ Check the design on both light and dark garments.</li>
                <li>✓ Use Before/After to inspect removed backgrounds and texture.</li>
                <li>✓ Make sure fine details remain visible at normal print size.</li>
              </ul>
            </Section>
            <Section title="Active setup">
              <p className="text-xs font-bold text-slate-200">{selectedRecipe?.name ?? 'Custom treatment'}</p>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{selectedRecipe?.description ?? 'Your current settings are being used.'}</p>
            </Section>
          </div>
        )}

        {stage === 'export' && (
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-400">Export</p>
              <h2 className="mt-1 text-xl font-black text-white">Package the job for approval or production.</h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">Start with the customer proof and production package. Use individual downloads only when the shop needs a specific file.</p>
            </div>

            <section className={`rounded-xl border p-4 ${productionCheckClass}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-75">Handoff path</p>
                  <h3 className="mt-1 text-base font-black text-white">{packageHandoffStatus}</h3>
                </div>
                <span className="rounded-full border border-current px-2 py-1 text-[9px] font-black uppercase opacity-80">
                  {proofApproval.status.replace('-', ' ')}
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-[10px] leading-relaxed sm:grid-cols-2">
                <div className="rounded-lg border border-current/20 bg-slate-950/30 px-3 py-2">
                  <p className="font-black uppercase tracking-widest opacity-70">Customer proof</p>
                  <p className="mt-1 text-slate-100">{proofHandoffStatus}</p>
                  <p className="mt-1 text-slate-300/80">{proofFilenames.email}</p>
                </div>
                <div className="rounded-lg border border-current/20 bg-slate-950/30 px-3 py-2">
                  <p className="font-black uppercase tracking-widest opacity-70">Production package</p>
                  <p className="mt-1 text-slate-100">{packageReview?.handoffReadiness.summary ?? 'Build a preview before package review.'}</p>
                  <p className="mt-1 text-slate-300/80">{selectedMockupCount} mockup color{selectedMockupCount === 1 ? '' : 's'} selected</p>
                </div>
              </div>
            </section>

            <Section title="Print master format" description="Controls the standalone print file. The production package still includes the selected handoff assets below.">
              <div className="grid grid-cols-4 gap-1 rounded-lg border border-slate-700 bg-slate-950/50 p-1">
                {Object.values(OutputFormat).map((format) => (
                  <button type="button" key={format} disabled={settings.vectorize && format !== OutputFormat.SVG} onClick={() => update('format', format)} className={`rounded-md py-2 text-[10px] font-black transition ${settings.format === format ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-25'}`}>{format}</button>
                ))}
              </div>
              {settings.format !== OutputFormat.JPG && (
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-slate-300">Transparent background</span>
                  <Toggle checked={settings.preserveTransparency} onChange={() => update('preserveTransparency', !settings.preserveTransparency)} label="Transparent background" />
                </div>
              )}
            </Section>

            <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-200">Step 1 · Customer proof first</p>
              <p className="mt-1 text-[10px] leading-relaxed text-indigo-100/70">
                Export the proof, mark it sent, then record approval or requested changes before the production package leaves the shop.
              </p>
            </div>

            <CustomerProofBuilder
              branding={proofBranding}
              approval={proofApproval}
              proofFreshness={proofFreshness}
              cloudCapability={cloudApprovalCapability}
              printFilename={proofFilenames.print}
              emailFilename={proofFilenames.email}
              mockupCount={selectedMockupCount}
              mockupSummary={selectedMockupSummary}
              canExport={preflightGate.canExport}
              hasProcessedResult={hasProcessedResult}
              onChange={onProofBrandingChange}
              onApprovalChange={onProofApprovalChange}
              onMarkProofSent={onMarkProofSent}
              onRecordProofResponse={onRecordProofResponse}
              onDownloadProof={onDownloadProof}
            />

            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200">Step 2 · Package after approval</p>
              <p className="mt-1 text-[10px] leading-relaxed text-emerald-100/70">
                Confirm package contents and export the complete production ZIP when proof and preflight are ready.
              </p>
            </div>

            {packageReview && (
              <ProductionPackageReview
                review={packageReview}
                currentStage={stage}
                onNavigateToStage={onStageChange}
              />
            )}

            <Section title="Production package contents" description="Configure the complete shop package after proof status is clear.">
              <div className="space-y-3">
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Package contents</p>
                    <span className="text-[10px] font-semibold text-slate-500">Per-job</span>
                  </div>
                  <div className="grid gap-2">
                    {PACKAGE_OPTION_CONTROLS.map((control) => (
                      <div key={control.key} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-slate-200">{control.label}</p>
                          <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">{control.note}</p>
                        </div>
                        <Toggle
                          checked={packageOptions[control.key]}
                          onChange={() => {
                            if (control.key === 'includeMockups' && !packageOptions.includeMockups && packageOptions.selectedMockupIndices.length === 0) {
                              onPackageOptionsChange({
                                ...packageOptions,
                                includeMockups: true,
                                selectedMockupIndices: getDefaultMockupSelectionForItemType(settings.itemType),
                              });
                              return;
                            }
                            togglePackageOption(control.key, !packageOptions[control.key]);
                          }}
                          label={`Toggle ${control.label}`}
                        />
                      </div>
                    ))}
                  </div>
                  {packageOptions.includeMockups && (
                    <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Mockup selection</p>
                          <p className="mt-0.5 text-[10px] text-slate-500">{selectedMockupCount} selected · {selectedMockupSummary}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onPackageOptionsChange({
                            ...packageOptions,
                            selectedMockupIndices: getDefaultMockupSelectionForItemType(settings.itemType),
                          })}
                          className="rounded-md border border-slate-700 px-2 py-1 text-[9px] font-bold text-slate-400 hover:border-indigo-500 hover:text-white"
                        >
                          Defaults
                        </button>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {handoffMockupEntries.map(({ index, mockup }) => (
                          <button
                            type="button"
                            key={mockup.slug}
                            onClick={() => toggleHandoffMockup(index)}
                            className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-left transition ${selectedHandoffMockups.has(index) ? 'border-indigo-500 bg-indigo-500/10 text-white' : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-600'}`}
                          >
                            <span className="h-4 w-4 flex-none rounded-full border border-white/20" style={{ backgroundColor: mockup.color }} />
                            <span className="min-w-0 truncate text-[10px] font-bold">{mockup.name}</span>
                          </button>
                        ))}
                      </div>
                      {selectedMockupCount === 0 && (
                        <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[10px] font-semibold text-amber-200">
                          Select at least one mockup color or turn mockups off for this package.
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <button type="button" disabled={!packageReview?.canExport} onClick={onDownloadProductionPackage} className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-xs font-black text-white hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500">
                  {packageReview?.exportAction.label ?? 'Production package not ready'}
                </button>
                {packageReview?.exportAction.disabledReason && (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold leading-relaxed text-amber-200">
                    {packageReview.exportAction.disabledReason}
                  </p>
                )}
                {latestBlockedPackageAttempt?.metadata?.blockedReason && (
                  <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-rose-300">Last blocked package attempt</p>
                    <p className="mt-1 text-[11px] font-semibold leading-relaxed text-rose-100">
                      {latestBlockedPackageAttempt.metadata.blockedReason}
                    </p>
                    {latestBlockedPackageAttempt.metadata.preflightSummary && (
                      <p className="mt-1 text-[10px] leading-relaxed text-rose-200/70">
                        Preflight: {latestBlockedPackageAttempt.metadata.preflightSummary}
                      </p>
                    )}
                  </div>
                )}
                {packageReview && (
                  <p className="text-[10px] leading-relaxed text-slate-500">
                    Next: {packageReview.exportAction.nextStep}
                  </p>
                )}
              </div>
            </Section>

            <PreflightPanel
              specification={printSpecification}
              findings={preflightFindings}
              acknowledged={preflightAcknowledged}
              onSpecificationChange={onPrintSpecificationChange}
              onAcknowledge={onAcknowledgePreflight}
            />

            <Section title="Individual downloads" description={`${settings.format} · 4200×5100 print master · ${selectedRecipe?.name ?? 'Custom treatment'}`}>
              <div className="space-y-2">
                <button type="button" disabled={!hasProcessedResult || !preflightGate.canExport} onClick={onDownloadPrintFile} className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-xs font-black text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500">
                  Download print file
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={!hasProcessedResult} onClick={onDownloadPdf} className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2.5 text-xs font-bold text-slate-300 hover:border-indigo-500 disabled:opacity-30">Production PDF</button>
                  <button type="button" disabled={!hasProcessedResult || !preflightGate.canExport} onClick={onDownloadMockups} className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2.5 text-xs font-bold text-slate-300 hover:border-indigo-500 disabled:opacity-30">Mockup set</button>
                </div>
              </div>
            </Section>

            {settings.shirtColor === ShirtColor.BLACK && (
              <Section title="White underbase" description="Optional silhouette layer for dark-garment DTG production.">
                <div className="grid grid-cols-3 gap-2">{(['PNG', 'SVG', 'JPG'] as const).map((format) => <button type="button" key={format} disabled={!hasProcessedResult} onClick={() => onGenerateUnderbase(format)} className="rounded-lg border border-slate-700 py-2 text-[10px] font-bold text-slate-300 hover:border-indigo-500 disabled:opacity-30">{format}</button>)}</div>
              </Section>
            )}

            {exportHistory.length > 0 && (
              <Section title="Recent exports">
                <div className="space-y-2">
                  {exportHistory.slice(0, 3).map((entry) => {
                    const isProductionPackage = entry.metadata?.kind === 'production-package';
                    const isBlockedAttempt = isBlockedPackageAttempt(entry);
                    const recoveryLabel = getBlockedPackageRecoveryLabel(entry, workflowFocusStage, stage);
                    const blockerIsOnCurrentStage = isBlockedAttempt && workflowFocusStage === stage;
                    const hasRevisionChanged = typeof entry.metadata?.jobRevision === 'number'
                      && typeof currentJobRevision === 'number'
                      && entry.metadata.jobRevision !== currentJobRevision;

                    return (
                      <div key={entry.id} className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-300">{exportKindLabel(entry)}</span>
                          <a href={entry.url} download={entry.filename} className="text-indigo-300 hover:text-indigo-200">{getCompactExportDownloadLabel(entry)}</a>
                        </div>
                        <p className="mt-1 truncate text-[10px] text-slate-500">{entry.filename}</p>
                        {(entry.metadata?.readinessStatus || entry.metadata?.proofQuality || entry.metadata?.placementSummary) && (
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                            {entry.metadata.readinessStatus && (
                              <span className={`font-bold uppercase ${exportReadinessClassName(entry.metadata.readinessStatus)}`}>{entry.metadata.readinessStatus}</span>
                            )}
                            {entry.metadata.manifestVerified && (
                              <span className="font-bold uppercase text-emerald-300">manifest verified</span>
                            )}
                            {entry.metadata.blockedReason && (
                              <span className="truncate text-rose-300">{entry.metadata.blockedReason}</span>
                            )}
                            {entry.metadata.proofQuality && (
                              <span className="font-bold uppercase text-sky-300">{entry.metadata.proofQuality === 'print' ? 'print proof' : 'email proof'}</span>
                            )}
                            {entry.metadata.placementSummary && (
                              <span className="truncate text-slate-500">{entry.metadata.placementSummary}</span>
                            )}
                          </div>
                        )}
                        {isProductionPackage && (
                          <div className="mt-2 border-t border-slate-800 pt-2">
                            {hasRevisionChanged && (
                              <p className="mb-1 text-[10px] leading-snug text-amber-300">Current job changed since this package. Regenerate uses the latest settings.</p>
                            )}
                            <button
                              type="button"
                              disabled={!hasProcessedResult || !packageReview?.canExport}
                              onClick={() => onRegenerateProductionPackage(entry)}
                              className="w-full rounded border border-emerald-500/30 px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-emerald-300 hover:bg-emerald-950/30 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
                            >
                              Regenerate package
                            </button>
                          </div>
                        )}
                        {isBlockedAttempt && recoveryLabel && workflowFocusStage && (
                          <div className="mt-2 border-t border-slate-800 pt-2">
                            {blockerIsOnCurrentStage ? (
                              <p className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-center text-[10px] font-black uppercase tracking-wide text-rose-300">
                                {recoveryLabel}
                              </p>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onStageChange(workflowFocusStage)}
                                className="w-full rounded border border-rose-500/30 px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-rose-300 hover:bg-rose-950/30"
                              >
                                {recoveryLabel}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
              {!saveOpen ? (
                <button type="button" onClick={() => setSaveOpen(true)} className="w-full text-xs font-bold text-slate-400 hover:text-white">Save current setup as My Recipe</button>
              ) : (
                <div className="flex gap-2">
                  <input value={recipeName} onChange={(event) => setRecipeName(event.target.value)} placeholder="Recipe name" maxLength={30} className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-indigo-500" />
                  <button type="button" onClick={saveRecipe} disabled={!recipeName.trim()} className="rounded-lg bg-indigo-600 px-3 text-xs font-bold text-white disabled:opacity-30">Save</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <footer className="flex flex-none items-center gap-2 border-t border-slate-800 bg-slate-950 p-3 lg:p-4">
        <button type="button" disabled={stageIndex === 0} onClick={() => onStageChange(STAGES[Math.max(0, stageIndex - 1)].id)} className="rounded-lg border border-slate-700 px-4 py-2.5 text-xs font-bold text-slate-300 hover:border-slate-600 hover:text-white disabled:opacity-25">
          Back
        </button>
        <button type="button" disabled={stageIndex === STAGES.length - 1} onClick={() => onStageChange(STAGES[Math.min(STAGES.length - 1, stageIndex + 1)].id)} className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-black text-white hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500">
          {stage === 'goal' ? 'Continue to prepare' : stage === 'prepare' ? 'Preview result' : stage === 'preview' ? 'Continue to export' : 'Ready to download'}
        </button>
      </footer>
    </aside>
  );
};
