import assert from 'node:assert/strict';
import test from 'node:test';

import { getCompactExportDownloadLabel, getExportDownloadLabel, getLatestBlockedPackageAttempt, isBlockedPackageAttempt } from '../services/exportHistory';
import { ExportHistoryEntry } from '../types';

const exportEntry = (
  id: string,
  kind: NonNullable<ExportHistoryEntry['metadata']>['kind'],
  jobRevision?: number,
): ExportHistoryEntry => ({
  id,
  filename: `${id}.zip`,
  format: 'ZIP',
  timestamp: Date.UTC(2026, 0, 2, 3, 4, 5),
  url: `blob:${id}`,
  blob: new Blob([id]),
  metadata: {
    kind,
    jobRevision,
    blockedReason: kind === 'production-package-blocked' ? `Blocked ${id}` : undefined,
    preflightSummary: kind === 'production-package-blocked' ? '1 critical issue' : undefined,
  },
});

test('returns the newest blocked package attempt for the current revision', () => {
  const entries = [
    exportEntry('blocked-new', 'production-package-blocked', 4),
    exportEntry('proof', 'customer-proof', 4),
    exportEntry('blocked-old', 'production-package-blocked', 4),
  ];

  const latest = getLatestBlockedPackageAttempt(entries, 4);

  assert.equal(latest?.id, 'blocked-new');
  assert.equal(latest?.metadata?.blockedReason, 'Blocked blocked-new');
});

test('ignores blocked package attempts from stale revisions', () => {
  const entries = [
    exportEntry('blocked-stale', 'production-package-blocked', 3),
    exportEntry('package', 'production-package', 4),
    exportEntry('blocked-current', 'production-package-blocked', 4),
  ];

  const latest = getLatestBlockedPackageAttempt(entries, 4);

  assert.equal(latest?.id, 'blocked-current');
});

test('returns the latest blocked package attempt when no current revision is available', () => {
  const entries = [
    exportEntry('blocked-latest', 'production-package-blocked', 3),
    exportEntry('blocked-older', 'production-package-blocked', 2),
  ];

  const latest = getLatestBlockedPackageAttempt(entries, null);

  assert.equal(latest?.id, 'blocked-latest');
});

test('labels blocked package attempts as audit downloads', () => {
  const blocked = exportEntry('blocked-audit', 'production-package-blocked', 4);
  const packageExport = exportEntry('package', 'production-package', 4);

  assert.equal(isBlockedPackageAttempt(blocked), true);
  assert.equal(isBlockedPackageAttempt(packageExport), false);
  assert.equal(getExportDownloadLabel(blocked), 'Download audit');
  assert.equal(getCompactExportDownloadLabel(blocked), 'Audit');
  assert.equal(getExportDownloadLabel(packageExport), 'Download again');
  assert.equal(getCompactExportDownloadLabel(packageExport), 'Again');
});
