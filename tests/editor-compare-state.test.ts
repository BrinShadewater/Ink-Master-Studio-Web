import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createCompareSelection,
  normalizeCompareZoom,
  reconcileCompareSelection,
  toggleCompareVariation,
} from '../editor/compareState';

test('creates an active-plus-nearest-sibling selection in stable project order', () => {
  assert.deepEqual(createCompareSelection(['a', 'b', 'c'], 'b'), ['b', 'c']);
  assert.deepEqual(createCompareSelection(['a', 'b', 'c'], 'c'), ['b', 'c']);
  assert.deepEqual(createCompareSelection(['a', 'b', 'c'], 'missing'), ['a', 'b']);
});

test('signals Compare exit when fewer than two variations remain', () => {
  assert.deepEqual(createCompareSelection([], 'missing'), []);
  assert.deepEqual(createCompareSelection(['a'], 'a'), []);
  assert.deepEqual(reconcileCompareSelection(['a', 'missing'], ['a'], 'a'), []);
});

test('reconciles deleted and duplicate ids without changing project order', () => {
  assert.deepEqual(
    reconcileCompareSelection(['b', 'missing'], ['a', 'b', 'c'], 'b'),
    ['b', 'c'],
  );
  assert.deepEqual(
    reconcileCompareSelection(['d', 'b', 'b', 'a'], ['a', 'b', 'c', 'd'], 'b'),
    ['a', 'b', 'd'],
  );
});

test('toggles only valid variations while enforcing the two-to-four range', () => {
  const order = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(toggleCompareVariation(['a', 'b'], 'c', true, order), ['a', 'b', 'c']);
  assert.deepEqual(
    toggleCompareVariation(['a', 'b', 'c', 'd'], 'e', true, order),
    ['a', 'b', 'c', 'd'],
  );
  assert.deepEqual(toggleCompareVariation(['a', 'b'], 'a', false, order), ['a', 'b']);
  assert.deepEqual(
    toggleCompareVariation(['a', 'b', 'c', 'd'], 'a', false, order),
    ['b', 'c', 'd'],
  );
  assert.deepEqual(toggleCompareVariation(['a', 'b'], 'missing', true, order), ['a', 'b']);
});

test('normalizes Compare zoom to an integer from 50 through 150', () => {
  assert.equal(normalizeCompareZoom(24), 50);
  assert.equal(normalizeCompareZoom(170), 150);
  assert.equal(normalizeCompareZoom(99.6), 100);
  assert.equal(normalizeCompareZoom(Number.NaN), 100);
});
