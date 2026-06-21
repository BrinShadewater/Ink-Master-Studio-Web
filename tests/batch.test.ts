import assert from 'node:assert/strict';
import test from 'node:test';

import { batchExportEligibility, createCombinedOrderManifest } from '../services/batch';
import { PreflightFinding } from '../types';

const finding = (severity: PreflightFinding['severity']): PreflightFinding => ({
  id: severity,
  severity,
  title: severity,
  message: severity,
  action: severity,
});

test('excludes failed, cancelled, and critical batch items', () => {
  assert.equal(batchExportEligibility('failed', [], true).canExport, false);
  assert.equal(batchExportEligibility('cancelled', [], true).canExport, false);
  assert.equal(batchExportEligibility('ready', [finding('critical')], true).canExport, false);
});

test('requires acknowledgement before exporting warning-state batch items', () => {
  assert.equal(batchExportEligibility('ready', [finding('warning')], false).canExport, false);
  assert.equal(batchExportEligibility('ready', [finding('warning')], true).canExport, true);
});

test('combined manifests include only eligible completed items', () => {
  const manifest = createCombinedOrderManifest([
    { id: 'pass', filename: 'pass.png', status: 'ready', findings: [finding('pass')], acknowledged: false },
    { id: 'warn', filename: 'warn.png', status: 'ready', findings: [finding('warning')], acknowledged: true },
    { id: 'blocked', filename: 'blocked.png', status: 'ready', findings: [finding('critical')], acknowledged: true },
  ]);

  assert.deepEqual(manifest.items.map((item) => item.id), ['pass', 'warn']);
  assert.equal(manifest.excludedCount, 1);
});
