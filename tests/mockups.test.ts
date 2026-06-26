import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeSelectedMockups,
  getSelectedProductionMockups,
  normalizeMockupSelection,
  resolveProductionMockupLabel,
} from '../services/mockups';

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

test('describeSelectedMockups names selected colors for operator review', () => {
  assert.equal(describeSelectedMockups([6, 2]), 'Heather, Black');
  assert.equal(describeSelectedMockups([]), 'No mockup colors selected');
});

test('resolveProductionMockupLabel turns production mockup filenames into color labels', () => {
  assert.equal(resolveProductionMockupLabel('mockups/black-mockup.png'), 'Black');
  assert.equal(resolveProductionMockupLabel('royal-blue-mockup.png'), 'Royal Blue');
  assert.equal(resolveProductionMockupLabel('customer-alt-view.png'), 'Customer Alt View');
});
