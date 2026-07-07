import { ExportHistoryEntry } from '../types';

export const getLatestBlockedPackageAttempt = (
  entries: ExportHistoryEntry[],
  currentJobRevision: number | null,
) => entries.find((entry) => (
  entry.metadata?.kind === 'production-package-blocked'
  && (typeof currentJobRevision !== 'number' || entry.metadata.jobRevision === currentJobRevision)
)) ?? null;
