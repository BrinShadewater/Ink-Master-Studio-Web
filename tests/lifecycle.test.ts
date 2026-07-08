import assert from 'node:assert/strict';
import test from 'node:test';

import { revokeExportHistoryUrls, revokeRemovedExportHistoryUrls } from '../services/objectUrls';
import { createProcessingRunRegistry } from '../services/processingRuns';
import { ExportHistoryEntry } from '../types';

const entry = (id: string, url = `blob:${id}`): ExportHistoryEntry => ({
  id,
  filename: `${id}.png`,
  format: 'PNG',
  timestamp: Date.UTC(2026, 0, 2),
  url,
  blob: new Blob([id]),
});

test('revokes only export history object URLs removed from the visible history', () => {
  const revoked: string[] = [];

  revokeRemovedExportHistoryUrls(
    [entry('kept'), entry('removed'), entry('external', 'https://example.com/file.png')],
    [entry('kept')],
    (url) => revoked.push(url),
  );

  assert.deepEqual(revoked, ['blob:removed']);
});

test('revokes all object URLs on export history teardown', () => {
  const revoked: string[] = [];

  revokeExportHistoryUrls(
    [entry('first'), entry('external', 'https://example.com/file.png'), entry('second')],
    (url) => revoked.push(url),
  );

  assert.deepEqual(revoked, ['blob:first', 'blob:second']);
});

test('processing run registry prevents stale batch runs from updating items', () => {
  const registry = createProcessingRunRegistry();
  const olderRun = registry.begin('item-1');
  const newerRun = registry.begin('item-1');

  assert.equal(registry.isActive('item-1', olderRun), false);
  assert.equal(registry.isActive('item-1', newerRun), true);

  registry.finish('item-1', olderRun);
  assert.equal(registry.isActive('item-1', newerRun), true);

  registry.finish('item-1', newerRun);
  assert.equal(registry.isActive('item-1', newerRun), false);
});
