import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_SETTINGS } from '../constants';
import { evaluatePreflight, getPreflightGate } from '../services/preflight';
import { ArtworkAnalysis, OutputFormat, PrintSpecification } from '../types';

const analysis: ArtworkAnalysis = {
  width: 4200,
  height: 5100,
  hasTransparency: true,
  transparencyCoverage: 0.35,
  edgeBackground: { isUniform: false, color: '#000000', tone: 'dark', confidence: 0.2 },
  printQuality: { dpi: 300, status: 'good', label: 'Print Ready' },
  palette: ['#111111', '#FFFFFF'],
  dominantTone: 'mid',
  contrastRisk: { darkGarment: false, lightGarment: false },
  vectorSuitability: 'possible',
  warnings: [],
};

const specification: PrintSpecification = {
  method: 'DTG',
  widthInches: 12,
  heightInches: 14,
  targetDpi: 300,
};

test('passes artwork that meets the requested effective DPI', () => {
  const findings = evaluatePreflight(analysis, specification, DEFAULT_SETTINGS);
  const resolution = findings.find((finding) => finding.id === 'resolution');

  assert.equal(resolution?.severity, 'pass');
  assert.match(resolution?.message ?? '', /350 DPI/);
});

test('marks very low effective DPI as critical', () => {
  const findings = evaluatePreflight(
    { ...analysis, width: 900, height: 900 },
    specification,
    DEFAULT_SETTINGS,
  );

  assert.equal(findings.find((finding) => finding.id === 'resolution')?.severity, 'critical');
  assert.equal(getPreflightGate(findings, false).canExport, false);
});

test('warns when a solid background is likely to remain', () => {
  const findings = evaluatePreflight(
    {
      ...analysis,
      hasTransparency: false,
      transparencyCoverage: 0,
      edgeBackground: { isUniform: true, color: '#FFFFFF', tone: 'light', confidence: 0.96 },
    },
    specification,
    { ...DEFAULT_SETTINGS, bgRemoval: false },
  );

  assert.equal(findings.find((finding) => finding.id === 'background')?.severity, 'warning');
});

test('warns when transparency is requested through JPG', () => {
  const findings = evaluatePreflight(
    analysis,
    specification,
    { ...DEFAULT_SETTINGS, format: OutputFormat.JPG, preserveTransparency: true },
  );

  assert.equal(findings.find((finding) => finding.id === 'format')?.severity, 'warning');
});

test('requires acknowledgement for warnings but not passes', () => {
  const findings = evaluatePreflight(
    analysis,
    { ...specification, widthInches: 15 },
    DEFAULT_SETTINGS,
  );

  assert.equal(getPreflightGate(findings, false).canExport, false);
  assert.equal(getPreflightGate(findings, true).canExport, true);
});
