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

test('wraps an immutable production profile snapshot with its applied revision', () => {
  const profile = createProductionProfile('Applied profile');
  const applied = snapshotProductionProfile(profile);

  assert.equal(applied.profileId, profile.id);
  assert.equal(applied.profileRevision, profile.revision);
  assert.deepEqual(applied.snapshot, profile);
  assert.notEqual(applied.snapshot, profile);
  assert.notEqual(applied.snapshot.thresholds, profile.thresholds);
  assert.notEqual(applied.snapshot.defaults.packageOptions, profile.defaults.packageOptions);
});

test('duplicates and revises profiles without mutating the source', () => {
  const source = createProductionProfile('Epson F2270');
  const sourceSnapshot = structuredClone(source);

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
  assert.deepEqual(source, sourceSnapshot);
});
