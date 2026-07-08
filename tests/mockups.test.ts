import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeSelectedMockups,
  getProductionMockupEntries,
  getSelectedProductionMockups,
  getSimpleMockupForItemType,
  normalizeMockupSelection,
  normalizeMockupSelectionForItemType,
  resolveMockupSelectionForItemType,
  resolveProductionMockupLabel,
} from '../services/mockups';
import { ItemType } from '../types';

test('normalizeMockupSelection sorts unique valid mockup indices', () => {
  assert.deepEqual(
    normalizeMockupSelection([6, 2, 6, 1], 11),
    [1, 2, 6],
  );
});

test('normalizeMockupSelection removes invalid and out-of-range indices', () => {
  assert.deepEqual(
    normalizeMockupSelection([0, -1, 1.5, Number.NaN, 11, 10], 11),
    [0, 10],
  );
});

test('normalizeMockupSelection handles empty selections', () => {
  assert.deepEqual(normalizeMockupSelection(undefined, 11), []);
  assert.deepEqual(normalizeMockupSelection([], 11), []);
});

test('getSelectedProductionMockups resolves selected catalog entries', () => {
  assert.deepEqual(
    getSelectedProductionMockups([6, 2]).map((mockup) => [mockup.slug, mockup.name]),
    [
      ['heather', 'Heather'],
      ['black', 'Black'],
    ],
  );
});

test('filters mockup selections by the current product type', () => {
  const hoodieEntries = getProductionMockupEntries(ItemType.HOODIE);

  assert.deepEqual(
    hoodieEntries.map((entry) => [entry.index, entry.mockup.slug]),
    [
      [11, 'hoodie-black'],
      [12, 'hoodie-heather'],
    ],
  );
  assert.deepEqual(normalizeMockupSelectionForItemType([6, 11, 12], ItemType.HOODIE), [11, 12]);
  assert.deepEqual(resolveMockupSelectionForItemType([6], ItemType.HOODIE), [11, 12]);
  assert.deepEqual(resolveMockupSelectionForItemType([], ItemType.HOODIE), []);
  assert.deepEqual(
    getSelectedProductionMockups([6, 11], ItemType.HOODIE).map((mockup) => mockup.slug),
    ['hoodie-black'],
  );
});

test('selects a predictable simple preview mockup for each supported product', () => {
  assert.equal(getSimpleMockupForItemType(ItemType.TSHIRT)?.slug, 'black');
  assert.equal(getSimpleMockupForItemType(ItemType.HOODIE)?.slug, 'hoodie-black');
  assert.equal(getSimpleMockupForItemType(ItemType.MUG)?.slug, 'mug-white');
});

test('describeSelectedMockups names selected colors for operator review', () => {
  assert.equal(describeSelectedMockups([6, 2]), 'Heather, Black');
  assert.equal(describeSelectedMockups([11, 12], ItemType.HOODIE), 'Black hoodie, Heather hoodie');
  assert.equal(describeSelectedMockups([]), 'No mockup colors selected');
});

test('resolveProductionMockupLabel turns production mockup filenames into color labels', () => {
  assert.equal(resolveProductionMockupLabel('mockups/black-mockup.png'), 'Black');
  assert.equal(resolveProductionMockupLabel('mockups/hoodie-black-mockup.png'), 'Black hoodie');
  assert.equal(resolveProductionMockupLabel('royal-blue-mockup.png'), 'Royal Blue');
  assert.equal(resolveProductionMockupLabel('customer-alt-view.png'), 'Customer Alt View');
});
