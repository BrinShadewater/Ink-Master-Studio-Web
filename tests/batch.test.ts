import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';

import { batchExportEligibility, buildCombinedBatchOrderPackage, createBatchOutputFilename, createCombinedOrderManifest, createCombinedOrderSummary, resolveBatchRecipe } from '../services/batch';
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

test('createBatchOutputFilename sanitizes names and avoids collisions', () => {
  const used = new Set<string>();

  assert.equal(createBatchOutputFilename('logo.png', 'PNG', used), 'logo.png');
  assert.equal(createBatchOutputFilename('logo.jpg', 'PNG', used), 'logo-2.png');
  assert.equal(createBatchOutputFilename('Client Art!.webp', 'JPG', used), 'Client-Art.jpg');
  assert.equal(createBatchOutputFilename('!!!.svg', 'SVG', used), 'artwork.svg');
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
    { id: 'pass', filename: 'pass.png', outputFilename: 'pass.png', status: 'ready', recipeId: 'clean-logo', findings: [finding('pass')], acknowledged: false },
    { id: 'warn', filename: 'warn.png', outputFilename: 'warn.png', status: 'ready', recipeId: 'dark-garment', findings: [finding('warning')], acknowledged: true },
    { id: 'blocked', filename: 'blocked.png', outputFilename: 'blocked.png', status: 'ready', recipeId: 'custom', findings: [finding('critical')], acknowledged: true },
  ]);

  assert.deepEqual(manifest.items.map((item) => item.id), ['pass', 'warn']);
  assert.deepEqual(manifest.items.map((item) => item.recipeId), ['clean-logo', 'dark-garment']);
  assert.equal(manifest.excludedCount, 1);
  assert.equal(manifest.totalCount, 3);
  assert.equal(manifest.exportedCount, 2);
  assert.equal(manifest.blockedCount, 1);
  assert.equal(manifest.items[1].warningCount, 1);
  assert.deepEqual(manifest.items[1].findings, [
    { id: 'warning', severity: 'warning', title: 'warning', action: 'warning' },
  ]);
  assert.deepEqual(manifest.excludedItems.map((item) => item.id), ['blocked']);
  assert.match(manifest.excludedItems[0].reasons.join(' '), /critical preflight/);
});

test('combined manifests explain warning acknowledgement and unfinished exclusions', () => {
  const manifest = createCombinedOrderManifest([
    { id: 'warn', filename: 'warn.png', status: 'ready', recipeId: 'dark-garment', findings: [finding('warning')], acknowledged: false },
    { id: 'pending', filename: 'pending.png', status: 'pending', recipeId: null, findings: [], acknowledged: false },
  ]);

  assert.equal(manifest.exportedCount, 0);
  assert.deepEqual(manifest.excludedItems.map((item) => item.id), ['warn', 'pending']);
  assert.match(manifest.excludedItems[0].reasons.join(' '), /require acknowledgement/);
  assert.match(manifest.excludedItems[1].reasons.join(' '), /pending/);
});

test('combined order summaries are readable by production operators', () => {
  const manifest = createCombinedOrderManifest([
    { id: 'pass', filename: 'source-pass.png', outputFilename: 'source-pass.png', status: 'ready', recipeId: 'clean-logo', findings: [], acknowledged: false },
    { id: 'blocked', filename: 'blocked.png', status: 'ready', recipeId: 'custom', findings: [finding('critical')], acknowledged: true },
  ]);

  const summary = createCombinedOrderSummary(manifest);

  assert.match(summary, /InkMaster Combined Batch Order/);
  assert.match(summary, /Total files: 2/);
  assert.match(summary, /Exported files: 1/);
  assert.match(summary, /source-pass\.png from source-pass\.png · recipe clean-logo/);
  assert.match(summary, /blocked\.png · 1 critical preflight issue must be resolved\./);
});

test('combined batch order packages contain unique files, manifest, and summary', async () => {
  const result = await buildCombinedBatchOrderPackage([
    { id: 'first', filename: 'logo.png', status: 'ready', recipeId: 'clean-logo', findings: [], acknowledged: false, format: 'PNG', resultBlob: new Blob(['first']) },
    { id: 'second', filename: 'logo.jpg', status: 'ready', recipeId: 'dark-garment', findings: [], acknowledged: false, format: 'PNG', resultBlob: new Blob(['second']) },
    { id: 'blocked', filename: 'blocked.png', status: 'ready', recipeId: 'custom', findings: [finding('critical')], acknowledged: true, format: 'PNG', resultBlob: new Blob(['blocked']) },
  ]);
  const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
  const manifest = JSON.parse(await zip.file('order-manifest.json')!.async('string'));
  const summary = await zip.file('order-summary.txt')!.async('string');

  assert.equal(result.filename, 'inkmaster-combined-order.zip');
  assert.ok(zip.file('logo.png'));
  assert.ok(zip.file('logo-2.png'));
  assert.equal(zip.file('blocked.png'), null);
  assert.deepEqual(manifest.items.map((item: { filename: string }) => item.filename), ['logo.png', 'logo-2.png']);
  assert.deepEqual(manifest.excludedItems.map((item: { sourceFilename: string }) => item.sourceFilename), ['blocked.png']);
  assert.match(summary, /logo-2\.png from logo\.jpg/);
});
