import assert from 'node:assert/strict';
import test from 'node:test';

import { batchExportEligibility, createCombinedOrderManifest, resolveBatchRecipe } from '../services/batch';
import { ArtworkAnalysis, PreflightFinding } from '../types';

const finding = (severity: PreflightFinding['severity']): PreflightFinding => ({
  id: severity,
  severity,
  title: severity,
  message: severity,
  action: severity,
});

const analysis = (override: Partial<ArtworkAnalysis> = {}): ArtworkAnalysis => ({
  width: 3000,
  height: 3000,
  hasTransparency: true,
  transparencyCoverage: 0.4,
  edgeBackground: {
    isUniform: false,
    color: '#000000',
    tone: 'mid',
    confidence: 0,
  },
  printQuality: {
    dpi: 300,
    status: 'good',
    label: 'Good',
  },
  palette: ['#000000', '#FFFFFF'],
  dominantTone: 'mid',
  contrastRisk: {
    darkGarment: false,
    lightGarment: false,
  },
  vectorSuitability: 'strong',
  warnings: [],
  ...override,
});

test('resolves batch auto recipe from artwork analysis', () => {
  assert.equal(resolveBatchRecipe('auto', analysis()), 'clean-logo');
});

test('resolves a forced batch recipe without using recommendation', () => {
  assert.equal(resolveBatchRecipe('dark-garment', analysis()), 'dark-garment');
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
    { id: 'pass', filename: 'pass.png', status: 'ready', recipeId: 'clean-logo', findings: [finding('pass')], acknowledged: false },
    { id: 'warn', filename: 'warn.png', status: 'ready', recipeId: 'dark-garment', findings: [finding('warning')], acknowledged: true },
    { id: 'blocked', filename: 'blocked.png', status: 'ready', recipeId: 'custom', findings: [finding('critical')], acknowledged: true },
  ]);

  assert.deepEqual(manifest.items.map((item) => item.id), ['pass', 'warn']);
  assert.deepEqual(manifest.items.map((item) => item.recipeId), ['clean-logo', 'dark-garment']);
  assert.equal(manifest.excludedCount, 1);
});
