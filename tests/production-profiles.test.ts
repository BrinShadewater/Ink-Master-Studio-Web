import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createProductionProfile,
  duplicateProductionProfile,
  printableAreaKey,
  reviseProductionProfile,
  snapshotProductionProfile,
  validateProductionProfile,
} from '../services/productionProfiles';
import { ItemType, OutputFormat } from '../types';

test('creates the standard DTG production profile', () => {
  const profile = createProductionProfile('Standard DTG');
  const tshirtFront = profile.printableAreas[printableAreaKey(ItemType.TSHIRT, 'front')];

  assert.equal(profile.schemaVersion, 1);
  assert.equal(profile.revision, 1);
  assert.equal(profile.method, 'DTG');
  assert.deepEqual(profile.thresholds, {
    targetDpi: 300,
    warningDpi: 200,
    criticalDpi: 150,
    significantUpscaleRatio: 1.5,
    extremeUpscaleRatio: 3,
  });
  assert.deepEqual(tshirtFront, {
    widthInches: 15,
    heightInches: 18,
    xPercent: 25,
    yPercent: 14,
    widthPercent: 50,
    heightPercent: 62,
  });
  assert.equal(profile.defaults.format, OutputFormat.PNG);
});

test('reports invalid threshold ordering and printable dimensions', () => {
  const profile = createProductionProfile();
  profile.thresholds.warningDpi = 100;
  profile.thresholds.criticalDpi = 150;
  profile.printableAreas[printableAreaKey(ItemType.TSHIRT, 'front')].widthInches = 0;

  const result = validateProductionProfile(profile);
  const fields = result.errors.map((error) => error.field);

  assert.equal(result.valid, false);
  assert.ok(fields.includes('thresholds.criticalDpi'));
  assert.ok(fields.some((field) => field.endsWith('.widthInches')));
});

test('returns field errors instead of throwing for malformed persisted data', () => {
  const malformedProfiles: unknown[] = [
    {},
    { thresholds: null, printableAreas: null },
    {
      thresholds: {},
      printableAreas: {
        'TSHIRT:front': null,
      },
    },
  ];

  for (const malformed of malformedProfiles) {
    let result: ReturnType<typeof validateProductionProfile> | undefined;
    assert.doesNotThrow(() => {
      result = validateProductionProfile(malformed);
    });
    assert.equal(result?.valid, false);
    assert.ok(result?.errors.length);
  }

  const missing = validateProductionProfile({});
  const missingFields = missing.errors.map((error) => error.field);
  assert.ok(missingFields.includes('thresholds'));
  assert.ok(missingFields.includes('printableAreas'));

  const malformedArea = validateProductionProfile({
    thresholds: {
      targetDpi: 300,
      warningDpi: 200,
      criticalDpi: 150,
      significantUpscaleRatio: 1.5,
      extremeUpscaleRatio: 3,
    },
    printableAreas: {
      'TSHIRT:front': null,
    },
  });
  assert.ok(malformedArea.errors.some((error) => error.field === 'printableAreas.TSHIRT:front'));
});

test('rejects non-finite threshold and printable area values', () => {
  const profile = createProductionProfile();
  profile.thresholds.targetDpi = Number.NaN;
  profile.thresholds.extremeUpscaleRatio = Number.POSITIVE_INFINITY;
  profile.printableAreas[printableAreaKey(ItemType.TSHIRT, 'front')].widthInches = Number.NEGATIVE_INFINITY;
  profile.printableAreas[printableAreaKey(ItemType.HOODIE, 'back')].xPercent = Number.NaN;

  const fields = validateProductionProfile(profile).errors.map((error) => error.field);

  assert.ok(fields.includes('thresholds.targetDpi'));
  assert.ok(fields.includes('thresholds.extremeUpscaleRatio'));
  assert.ok(fields.includes('printableAreas.TSHIRT:front.widthInches'));
  assert.ok(fields.includes('printableAreas.HOODIE:back.xPercent'));
});

test('wraps an immutable production profile snapshot with its applied revision', () => {
  const profile = createProductionProfile('Applied profile');
  const applied = snapshotProductionProfile(profile);
  const frontKey = printableAreaKey(ItemType.TSHIRT, 'front');

  assert.equal(applied.profileId, profile.id);
  assert.equal(applied.profileRevision, profile.revision);
  assert.deepEqual(applied.snapshot, profile);

  applied.snapshot.thresholds.targetDpi = 72;
  applied.snapshot.printableAreas[frontKey].widthInches = 2;
  applied.snapshot.defaults.packageOptions.selectedMockupIndices.push(99);

  assert.equal(profile.thresholds.targetDpi, 300);
  assert.equal(profile.printableAreas[frontKey].widthInches, 15);
  assert.deepEqual(profile.defaults.packageOptions.selectedMockupIndices, [1, 2, 6]);
});

test('duplicates and revises profiles without mutating the source', () => {
  const source = createProductionProfile('Epson F2270');
  const sourceSnapshot = structuredClone(source);
  const frontKey = printableAreaKey(ItemType.TSHIRT, 'front');

  const duplicate = duplicateProductionProfile(source);
  const revision = reviseProductionProfile(source, {
    description: 'Updated daily production profile',
  });

  assert.notEqual(duplicate.id, source.id);
  assert.equal(duplicate.name, 'Epson F2270 copy');
  assert.equal(duplicate.revision, 1);
  assert.equal(revision.id, source.id);
  assert.equal(revision.revision, 2);
  assert.equal(revision.description, 'Updated daily production profile');

  duplicate.thresholds.targetDpi = 72;
  duplicate.printableAreas[frontKey].heightInches = 2;
  duplicate.defaults.packageOptions.selectedMockupIndices.push(98);
  revision.thresholds.warningDpi = 50;
  revision.printableAreas[frontKey].widthPercent = 5;
  revision.defaults.packageOptions.selectedMockupIndices.push(97);

  assert.deepEqual(source, sourceSnapshot);
});
