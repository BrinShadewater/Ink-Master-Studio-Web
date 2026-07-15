import assert from 'node:assert/strict';
import test from 'node:test';

import { printify } from '../specs/printify';
import { buildQualityConfidence } from '../services/qualityConfidence';
import { assessUpscaleQuality } from '../services/upscaleQuality';
import { ArtworkAnalysis } from '../types';

const transparentAnalysis: ArtworkAnalysis = {
  width: 2500,
  height: 3000,
  hasTransparency: true,
  transparencyCoverage: 0.25,
  edgeBackground: { isUniform: false, color: '#000000', tone: 'mid', confidence: 0 },
  printQuality: { dpi: 167, status: 'low', label: 'Low' },
  palette: ['#000000', '#ffffff'],
  dominantTone: 'mid',
  contrastRisk: { darkGarment: false, lightGarment: false },
  vectorSuitability: 'possible',
  warnings: [],
};

test('reports good confidence for the accepted Printify tee uprez', () => {
  const summary = buildQualityConfidence(
    transparentAnalysis,
    assessUpscaleQuality(2500, 3000, 4500, 5400),
    printify.products[0],
    null,
  );

  assert.equal(summary.label, 'Good with uprez');
  assert.equal(summary.tone, 'good');
  assert.equal(summary.items.find((item) => item.id === 'upscale')?.state, 'pass');
});

test('promotes tiny sources to a strong warning without blocking download', () => {
  const summary = buildQualityConfidence(
    { ...transparentAnalysis, width: 900, height: 1080 },
    assessUpscaleQuality(900, 1080, 4500, 5400),
    printify.products[0],
    null,
  );

  assert.equal(summary.label, 'Strong warning');
  assert.equal(summary.tone, 'strong-warning');
  assert.match(summary.detail, /Download is allowed/);
  assert.equal(summary.items.find((item) => item.id === 'upscale')?.label, 'Extreme enlargement');
});

test('warns when a nontransparent source has not been acknowledged', () => {
  const summary = buildQualityConfidence(
    { ...transparentAnalysis, hasTransparency: false },
    assessUpscaleQuality(2500, 3000, 4500, 5400),
    printify.products[0],
    null,
  );

  assert.equal(summary.label, 'Check softness');
  assert.equal(summary.items.find((item) => item.id === 'background')?.label, 'Background choice needed');
});
