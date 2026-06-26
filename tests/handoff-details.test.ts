import assert from 'node:assert/strict';
import test from 'node:test';

import { formatPlacementSummary, formatPrintSizeSummary } from '../services/handoffDetails';
import { ItemType, PlacementMeasurement } from '../types';

const placement: PlacementMeasurement = {
  presetId: 'left-chest',
  itemType: ItemType.TSHIRT,
  location: 'left-chest',
  garmentSize: 'L',
  widthInches: 3.5,
  heightInches: 3.25,
  offsetXInches: -2.125,
  offsetYInches: 1.5,
};

test('formatPlacementSummary includes product, location, size, dimensions, and offsets', () => {
  assert.equal(
    formatPlacementSummary(placement),
    'left-chest placement · T-shirt left chest · size L · 3.5×3.25 in · offset -2.13 in horizontal, 1.5 in from top',
  );
});

test('formatPrintSizeSummary keeps operator-friendly inch values', () => {
  assert.equal(formatPrintSizeSummary(12, 14.5), '12×14.5 in');
});
