import { ExportHistoryEntry, WorkspaceStage } from '../types';

export const isBlockedPackageAttempt = (entry: ExportHistoryEntry) =>
  entry.metadata?.kind === 'production-package-blocked';

export const getExportDownloadLabel = (entry: ExportHistoryEntry) =>
  isBlockedPackageAttempt(entry) ? 'Download audit' : 'Download again';

export const getCompactExportDownloadLabel = (entry: ExportHistoryEntry) =>
  isBlockedPackageAttempt(entry) ? 'Audit' : 'Again';

export const getBlockedPackageRecoveryLabel = (
  entry: ExportHistoryEntry,
  targetStage: WorkspaceStage | null = null,
  currentStage: WorkspaceStage | null = null,
) => {
  if (!isBlockedPackageAttempt(entry)) return null;
  return targetStage !== null && targetStage === currentStage ? 'Review blocker above' : 'Open blocker';
};

export const getLatestBlockedPackageAttempt = (
  entries: ExportHistoryEntry[],
  currentJobRevision: number | null,
) => entries.find((entry) => (
  isBlockedPackageAttempt(entry)
  && (typeof currentJobRevision !== 'number' || entry.metadata.jobRevision === currentJobRevision)
)) ?? null;
