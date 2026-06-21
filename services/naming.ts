import { StudioJob } from '../types';

export const sanitizeFilenameSegment = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '') || 'untitled';

export const resolveFilenamePattern = (
  pattern: string,
  job: StudioJob,
  placementName: string,
) => {
  const tokens: Record<string, string> = {
    job: job.metadata.name,
    customer: job.metadata.customerName || 'customer',
    order: job.metadata.orderNumber || 'order',
    garment: job.settings.itemType.toLowerCase(),
    placement: placementName,
    version: String(job.revision),
  };
  const resolved = pattern.replace(/\{(job|customer|order|garment|placement|version)\}/g, (_, token: string) =>
    sanitizeFilenameSegment(tokens[token] ?? token),
  );
  return sanitizeFilenameSegment(resolved);
};
