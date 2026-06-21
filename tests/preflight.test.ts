import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_SETTINGS } from '../constants';
import { evaluatePreflight, getPreflightGate } from '../services/preflight';
import { createProductionProfile } from '../services/productionProfiles';
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

const createProfile = () => createProductionProfile('Standard DTG');

test('passes artwork that meets the requested effective DPI', () => {
  const findings = evaluatePreflight(analysis, specification, DEFAULT_SETTINGS, createProfile());
  const resolution = findings.find((finding) => finding.id === 'resolution');

  assert.equal(resolution?.severity, 'pass');
  assert.match(resolution?.message ?? '', /350 DPI/);
});

test('marks very low effective DPI as critical', () => {
  const findings = evaluatePreflight(
    { ...analysis, width: 900, height: 900 },
    specification,
    DEFAULT_SETTINGS,
    createProfile(),
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
    createProfile(),
  );

  assert.equal(findings.find((finding) => finding.id === 'background')?.severity, 'warning');
});

test('warns when transparency is requested through JPG', () => {
  const findings = evaluatePreflight(
    analysis,
    specification,
    { ...DEFAULT_SETTINGS, format: OutputFormat.JPG, preserveTransparency: true },
    createProfile(),
  );

  assert.equal(findings.find((finding) => finding.id === 'format')?.severity, 'warning');
});

test('requires acknowledgement for warnings but not passes', () => {
  const findings = evaluatePreflight(
    analysis,
    { ...specification, widthInches: 24 },
    DEFAULT_SETTINGS,
    createProfile(),
  );

  assert.equal(getPreflightGate(findings, false).canExport, false);
  assert.equal(getPreflightGate(findings, true).canExport, true);
});

test('uses applied profile DPI thresholds', () => {
  const profile = createProductionProfile('Lenient DTF');
  profile.thresholds = {
    targetDpi: 200,
    warningDpi: 150,
    criticalDpi: 100,
    significantUpscaleRatio: 2,
    extremeUpscaleRatio: 4,
  };

  const findings = evaluatePreflight(
    { ...analysis, width: 1680, height: 1680 },
    specification,
    DEFAULT_SETTINGS,
    profile,
  );

  assert.equal(findings.find((entry) => entry.id === 'resolution')?.severity, 'warning');
});

test('keeps exact critical DPI in warning severity', () => {
  const profile = createProfile();
  const findings = evaluatePreflight(
    { ...analysis, width: 1800, height: 2100 },
    specification,
    DEFAULT_SETTINGS,
    profile,
  );

  assert.equal(findings.find((entry) => entry.id === 'resolution')?.severity, 'warning');
});

test('keeps exact warning DPI in pass severity', () => {
  const profile = createProfile();
  const findings = evaluatePreflight(
    { ...analysis, width: 2400, height: 2800 },
    specification,
    DEFAULT_SETTINGS,
    profile,
  );

  assert.equal(findings.find((entry) => entry.id === 'resolution')?.severity, 'pass');
});

test('classifies fractional DPI immediately below and at the critical boundary', () => {
  const profile = createProfile();
  const squareSpecification = {
    ...specification,
    widthInches: 10,
    heightInches: 10,
  };
  const belowCritical = evaluatePreflight(
    { ...analysis, width: 1496, height: 1496 },
    squareSpecification,
    DEFAULT_SETTINGS,
    profile,
  ).find((entry) => entry.id === 'resolution');
  const atCritical = evaluatePreflight(
    { ...analysis, width: 1500, height: 1500 },
    squareSpecification,
    DEFAULT_SETTINGS,
    profile,
  ).find((entry) => entry.id === 'resolution');

  assert.equal(belowCritical?.severity, 'critical');
  assert.match(belowCritical?.message ?? '', /150 DPI/);
  assert.equal(atCritical?.severity, 'warning');
  assert.match(atCritical?.message ?? '', /150 DPI/);
});

test('classifies fractional DPI immediately below and at the warning boundary', () => {
  const profile = createProfile();
  const squareSpecification = {
    ...specification,
    widthInches: 10,
    heightInches: 10,
  };
  const belowWarning = evaluatePreflight(
    { ...analysis, width: 1996, height: 1996 },
    squareSpecification,
    DEFAULT_SETTINGS,
    profile,
  ).find((entry) => entry.id === 'resolution');
  const atWarning = evaluatePreflight(
    { ...analysis, width: 2000, height: 2000 },
    squareSpecification,
    DEFAULT_SETTINGS,
    profile,
  ).find((entry) => entry.id === 'resolution');

  assert.equal(belowWarning?.severity, 'warning');
  assert.match(belowWarning?.message ?? '', /200 DPI/);
  assert.equal(atWarning?.severity, 'pass');
  assert.match(atWarning?.message ?? '', /200 DPI/);
});

test('describes a tolerated DPI below the ideal target honestly', () => {
  const profile = createProfile();
  const findings = evaluatePreflight(
    { ...analysis, width: 3000, height: 3500 },
    specification,
    DEFAULT_SETTINGS,
    profile,
  );
  const resolution = findings.find((entry) => entry.id === 'resolution');
  const copy = `${resolution?.title ?? ''} ${resolution?.message ?? ''}`;

  assert.equal(resolution?.severity, 'pass');
  assert.doesNotMatch(copy, /meets target/i);
  assert.match(copy, /below (?:the )?ideal/i);
  assert.match(copy, /300 DPI/);
});

test('uses custom upscale thresholds and keeps exact boundaries in the lower severity', () => {
  const profile = createProfile();
  profile.thresholds.significantUpscaleRatio = 2;
  profile.thresholds.extremeUpscaleRatio = 4;

  const exactSignificant = evaluatePreflight(
    { ...analysis, width: 1800, height: 2100 },
    specification,
    DEFAULT_SETTINGS,
    profile,
  );
  const aboveSignificant = evaluatePreflight(
    { ...analysis, width: 1500, height: 1750 },
    specification,
    DEFAULT_SETTINGS,
    profile,
  );
  const exactExtreme = evaluatePreflight(
    { ...analysis, width: 900, height: 1050 },
    specification,
    DEFAULT_SETTINGS,
    profile,
  );
  const aboveExtreme = evaluatePreflight(
    { ...analysis, width: 720, height: 840 },
    specification,
    DEFAULT_SETTINGS,
    profile,
  );

  assert.equal(exactSignificant.find((entry) => entry.id === 'upscaling')?.severity, 'pass');
  assert.equal(aboveSignificant.find((entry) => entry.id === 'upscaling')?.severity, 'warning');
  assert.equal(exactExtreme.find((entry) => entry.id === 'upscaling')?.severity, 'warning');
  assert.equal(aboveExtreme.find((entry) => entry.id === 'upscaling')?.severity, 'critical');
});

test('does not let the job output target override profile preflight rules', () => {
  const profile = createProfile();
  const baseline = evaluatePreflight(
    { ...analysis, width: 1800, height: 2100 },
    specification,
    DEFAULT_SETTINGS,
    profile,
  );
  const changedJobTarget = evaluatePreflight(
    { ...analysis, width: 1800, height: 2100 },
    { ...specification, targetDpi: 600 },
    DEFAULT_SETTINGS,
    profile,
  );

  assert.equal(
    changedJobTarget.find((entry) => entry.id === 'resolution')?.severity,
    baseline.find((entry) => entry.id === 'resolution')?.severity,
  );
  assert.equal(
    changedJobTarget.find((entry) => entry.id === 'upscaling')?.severity,
    baseline.find((entry) => entry.id === 'upscaling')?.severity,
  );
});
