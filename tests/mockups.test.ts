import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeMockupSelection } from '../services/mockups';

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
