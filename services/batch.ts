import { getPreflightGate } from './preflight';
import { ArtworkAnalysis, PreflightFinding, RecipeId } from '../types';
import { recommendRecipe } from './recipes';

export type BatchProductionStatus = 'pending' | 'analyzing' | 'processing' | 'ready' | 'failed' | 'cancelled';
export type BatchRecipeSelection = 'auto' | RecipeId;

export interface BatchManifestCandidate {
  id: string;
  filename: string;
  status: BatchProductionStatus;
  recipeId: RecipeId | null;
  findings: PreflightFinding[];
  acknowledged: boolean;
}

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

export const createCombinedOrderManifest = (candidates: BatchManifestCandidate[]) => {
  const items = candidates
    .filter((candidate) => batchExportEligibility(candidate.status, candidate.findings, candidate.acknowledged).canExport)
    .map((candidate) => ({
      id: candidate.id,
      filename: candidate.filename,
      recipeId: candidate.recipeId,
      warningCount: candidate.findings.filter((finding) => finding.severity === 'warning').length,
    }));
  return {
    format: 'inkmaster-combined-order',
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    items,
    excludedCount: candidates.length - items.length,
  };
};
