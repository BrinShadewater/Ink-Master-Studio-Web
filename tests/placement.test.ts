import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_PLACEMENT,
  PLACEMENT_PRESETS,
  placementToMockupPercent,
  placementVariantKey,
  validatePlacement,
} from '../services/placement';
import { ItemType } from '../types';

test('ships the required DTG placement presets', () => {
  const ids = PLACEMENT_PRESETS.map((preset) => preset.id);
  assert.deepEqual(ids, [
    'full-front',
    'center-chest',
    'left-chest',
    'full-back',
    'sleeve',
    'youth',
    'oversized',
  ]);
});

test('creates stable variant keys for product, location, and garment size', () => {
  assert.equal(placementVariantKey(ItemType.TSHIRT, 'front', 'L'), 'TSHIRT:front:L');
});

test('rejects placement dimensions outside the calibrated printable area', () => {
  const result = validatePlacement({
    ...DEFAULT_PLACEMENT,
    widthInches: 20,
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('width')));
});

test('converts inch placement into calibrated mockup percentages', () => {
  const percent = placementToMockupPercent({
    ...DEFAULT_PLACEMENT,
    widthInches: 12,
    heightInches: 14,
    offsetXInches: 0,
    offsetYInches: 2,
  });

  assert.ok(percent.width > 20 && percent.width < 60);
  assert.ok(percent.height > 20 && percent.height < 70);
  assert.ok(Math.abs(percent.x + percent.width / 2 - 50) < 0.001);
  assert.ok(percent.y > 10);
});
