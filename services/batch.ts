import JSZip from 'jszip';
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

export interface CombinedBatchPackageItem extends BatchManifestCandidate {
  format: string;
  resultBlob: Blob | null;
}

export interface SingleBatchPackageItem extends CombinedBatchPackageItem {
  recipeSelection: BatchRecipeSelection;
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

export const createBatchItemBlockers = (
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
      reasons: createBatchItemBlockers(candidate, eligibility),
      findings: candidate.findings.map(findingSummary),
    }));
  return {
    format: 'inkmaster-combined-order',
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    handoffPolicy: {
      packageType: 'batch-prep',
      productionApprovalRequired: true,
      note: 'Batch exports are preflighted artwork/order prep packages. Final production handoff still requires a current approved customer proof on each production job.',
    },
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
  `Handoff policy: ${manifest.handoffPolicy.note}`,
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

export const buildCombinedBatchOrderPackage = async (
  candidates: CombinedBatchPackageItem[],
): Promise<{ blob: Blob; filename: string; manifest: ReturnType<typeof createCombinedOrderManifest> }> => {
  const zip = new JSZip();
  const usedFilenames = new Set<string>();
  const outputFilenames = new Map<string, string>();

  for (const candidate of candidates) {
    const eligibility = batchExportEligibility(candidate.status, candidate.findings, candidate.acknowledged);
    if (!eligibility.canExport || !candidate.resultBlob) continue;

    const outputFilename = createBatchOutputFilename(candidate.filename, candidate.format, usedFilenames);
    outputFilenames.set(candidate.id, outputFilename);
    zip.file(outputFilename, await candidate.resultBlob.arrayBuffer());
  }

  const manifest = createCombinedOrderManifest(candidates.map((candidate) => ({
    id: candidate.id,
    filename: candidate.filename,
    outputFilename: outputFilenames.get(candidate.id),
    status: candidate.status,
    recipeId: candidate.recipeId,
    findings: candidate.findings,
    acknowledged: candidate.acknowledged,
  })));

  zip.file('order-manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('order-summary.txt', createCombinedOrderSummary(manifest));

  return {
    blob: await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' }),
    filename: 'inkmaster-combined-order.zip',
    manifest,
  };
};

export const createSingleBatchItemSummary = (
  manifest: ReturnType<typeof createCombinedOrderManifest>,
): string => {
  const exported = manifest.items[0];
  const blocked = manifest.excludedItems[0];

  return [
    'InkMaster Batch Design Package',
    `Generated: ${manifest.generatedAt}`,
    '',
    exported
      ? `Exported file: ${exported.filename}`
      : 'Exported file: None',
    exported
      ? `Source file: ${exported.sourceFilename}`
      : blocked
        ? `Source file: ${blocked.sourceFilename}`
        : 'Source file: Unknown',
    exported
      ? `Recipe: ${exported.recipeId ?? 'custom'}`
      : blocked
        ? `Recipe: ${blocked.recipeId ?? 'custom'}`
        : 'Recipe: custom',
    exported
      ? `Warnings: ${exported.warningCount}`
      : blocked
        ? `Blocked: ${blocked.reasons.join(' ')}`
        : 'Blocked: No item supplied.',
  ].join('\n');
};

export const buildSingleBatchItemPackage = async (
  item: SingleBatchPackageItem,
): Promise<{ blob: Blob; filename: string; manifest: ReturnType<typeof createCombinedOrderManifest> }> => {
  const eligibility = batchExportEligibility(item.status, item.findings, item.acknowledged);
  if (!eligibility.canExport || !item.resultBlob) {
    throw new Error('Batch item is not eligible for export.');
  }

  const zip = new JSZip();
  const outputFilename = createBatchOutputFilename(item.filename, item.format);
  zip.file(outputFilename, await item.resultBlob.arrayBuffer());

  const manifest = createCombinedOrderManifest([{
    id: item.id,
    filename: item.filename,
    outputFilename,
    status: item.status,
    recipeId: item.recipeId,
    findings: item.findings,
    acknowledged: item.acknowledged,
  }]);

  zip.file('design-manifest.json', JSON.stringify({
    ...manifest,
    format: 'inkmaster-batch-design',
    handoffPolicy: {
      ...manifest.handoffPolicy,
      note: 'Single-design batch exports are preflighted artwork prep packages. Final production handoff still requires a current approved customer proof on the production job.',
    },
    recipeSelection: item.recipeSelection,
  }, null, 2));
  zip.file('design-summary.txt', createSingleBatchItemSummary(manifest));

  const packageName = createBatchOutputFilename(item.filename, 'zip');

  return {
    blob: await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' }),
    filename: packageName,
    manifest,
  };
};
