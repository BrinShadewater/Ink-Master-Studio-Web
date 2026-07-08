import { ExportHistoryEntry } from '../types';

export type ObjectUrlRevoker = (url: string) => void;

export const isObjectUrl = (url: string) => url.startsWith('blob:');

export const revokeObjectUrl = (
  url: string,
  revoker: ObjectUrlRevoker = URL.revokeObjectURL,
) => {
  if (isObjectUrl(url)) {
    revoker(url);
  }
};

export const revokeRemovedExportHistoryUrls = (
  previous: ExportHistoryEntry[],
  next: ExportHistoryEntry[],
  revoker: ObjectUrlRevoker = URL.revokeObjectURL,
) => {
  const retainedUrls = new Set(next.map((entry) => entry.url));
  previous.forEach((entry) => {
    if (!retainedUrls.has(entry.url)) {
      revokeObjectUrl(entry.url, revoker);
    }
  });
};

export const revokeExportHistoryUrls = (
  entries: ExportHistoryEntry[],
  revoker: ObjectUrlRevoker = URL.revokeObjectURL,
) => {
  entries.forEach((entry) => revokeObjectUrl(entry.url, revoker));
};
