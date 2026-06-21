import assert from 'node:assert/strict';
import test from 'node:test';

import { nextDialogFocusIndex } from '../components/useAccessibleDialog';

test('cycles dialog focus forward and backward within bounds', () => {
  assert.equal(nextDialogFocusIndex(0, 3, false), 1);
  assert.equal(nextDialogFocusIndex(2, 3, false), 0);
  assert.equal(nextDialogFocusIndex(0, 3, true), 2);
  assert.equal(nextDialogFocusIndex(2, 3, true), 1);
});

test('keeps dialog focus stable when zero or one controls are available', () => {
  assert.equal(nextDialogFocusIndex(-1, 0, false), -1);
  assert.equal(nextDialogFocusIndex(0, 1, false), 0);
  assert.equal(nextDialogFocusIndex(0, 1, true), 0);
});
