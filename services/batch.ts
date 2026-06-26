import { getPreflightGate } from './preflight';
import { ArtworkAnalysis, PreflightFinding, RecipeId } from '../types';
import { recommendRecipe } from './recipes';

export type BatchProductionStatus = 'pending' | 'analyzing' | 'processing' | 'ready' | 'failed' | 'cancelled';
export type BatchRecipeSelection = 'auto' | RecipeId;

export interface BatchManifestCandidate {
  id: string;
  filename: string;
  outputFilename?: string;
  status: BatchProductionStatus;
  recipeId: RecipeId | null;
  findings: PreflightFinding[];
  acknowledged: boolean;
}

export const createBatchOutputFilename = (
  sourceFilename: string,
  format: string,
  usedFilenames: Set<string> = new Set(),
): string => {
  const extension = format.toLowerCase();
  const rawStem = sourceFilename.replace(/\.[^.]+$/, '') || 'artwork';
  const safeStem = rawStem.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'artwork';
  let filename = `${safeStem}.${extension}`;
  let copy = 2;

  while (usedFilenames.has(filename.toLowerCase())) {
    filename = `${safeStem}-${copy}.${extension}`;
    copy += 1;
  }

  usedFilenames.add(filename.toLowerCase());
  return filename;
};

export const resolveBatchRecipe = (
  selection: BatchRecipeSelection,
  analysis: ArtworkAnalysis,
): RecipeId => selection === 'auto' ? recommendRecipe(analysis).recipeId : selection;

export const batchExportEligibility = (
  status: BatchProductionStatus,
  findings: PreflightFinding[],
  acknowledged: boolean,
) => {
  const gate = getPreflightGate(findings, acknowledged);
  return {
    ...gate,
    canExport: status === 'ready' && gate.canExport,
  };
};

const findingSummary = (finding: PreflightFinding) => ({
  id: finding.id,
  severity: finding.severity,
  title: finding.title,
  action: finding.action,
});

const exclusionReasons = (
  candidate: BatchManifestCandidate,
  eligibility: ReturnType<typeof batchExportEligibility>,
) => {
  const reasons: string[] = [];
  if (candidate.status !== 'ready') {
    reasons.push(`Item status is ${candidate.status}.`);
  }
  if (eligibility.criticalCount > 0) {
    reasons.push(`${eligibility.criticalCount} critical preflight issue${eligibility.criticalCount === 1 ? '' : 's'} must be resolved.`);
  }
  if (eligibility.requiresAcknowledgement && !candidate.acknowledged) {
    reasons.push(`${eligibility.warningCount} warning${eligibility.warningCount === 1 ? '' : 's'} require acknowledgement.`);
  }
  if (reasons.length === 0) {
    reasons.push('Item was not eligible for export.');
  }
  return reasons;
};

export const createCombinedOrderManifest = (candidates: BatchManifestCandidate[]) => {
  const reviewed = candidates.map((candidate) => ({
    candidate,
    eligibility: batchExportEligibility(candidate.status, candidate.findings, candidate.acknowledged),
  }));
  const items = reviewed
    .filter(({ eligibility }) => eligibility.canExport)
    .map(({ candidate, eligibility }) => ({
      id: candidate.id,
      sourceFilename: candidate.filename,
      filename: candidate.outputFilename ?? candidate.filename,
      recipeId: candidate.recipeId,
      status: candidate.status,
      acknowledged: candidate.acknowledged,
      warningCount: eligibility.warningCount,
      criticalCount: eligibility.criticalCount,
      findings: candidate.findings.map(findingSummary),
    }));
  const excludedItems = reviewed
    .filter(({ eligibility }) => !eligibility.canExport)
    .map(({ candidate, eligibility }) => ({
      id: candidate.id,
      sourceFilename: candidate.filename,
      recipeId: candidate.recipeId,
      status: candidate.status,
      acknowledged: candidate.acknowledged,
      warningCount: eligibility.warningCount,
      criticalCount: eligibility.criticalCount,
      reasons: exclusionReasons(candidate, eligibility),
      findings: candidate.findings.map(findingSummary),
    }));
  return {
    format: 'inkmaster-combined-order',
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    totalCount: candidates.length,
    exportedCount: items.length,
    blockedCount: excludedItems.length,
    items,
    excludedItems,
    excludedCount: excludedItems.length,
  };
};

export const createCombinedOrderSummary = (
  manifest: ReturnType<typeof createCombinedOrderManifest>,
): string => [
  'InkMaster Combined Batch Order',
  `Generated: ${manifest.generatedAt}`,
  '',
  `Total files: ${manifest.totalCount}`,
  `Exported files: ${manifest.exportedCount}`,
  `Blocked or skipped files: ${manifest.blockedCount}`,
  '',
  'Exported files:',
  ...(manifest.items.length > 0
    ? manifest.items.map((item) => `- ${item.filename} from ${item.sourceFilename} · recipe ${item.recipeId ?? 'custom'} · warnings ${item.warningCount}`)
    : ['- None']),
  '',
  'Blocked or skipped files:',
  ...(manifest.excludedItems.length > 0
    ? manifest.excludedItems.map((item) => `- ${item.sourceFilename} · ${item.reasons.join(' ')}`)
    : ['- None']),
].join('\n');
