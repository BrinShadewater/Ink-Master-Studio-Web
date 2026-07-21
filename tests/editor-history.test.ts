import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEditorAsset, createEditorProject } from '../editor/model';
import { createEditorHistory, getSelectedImageLayer, reduceEditorHistory } from '../editor/history';

const makeHistory = () => {
  const asset = createEditorAsset('project_history', new Blob(['x']), { name: 'x.png', width: 100, height: 100 });
  return createEditorHistory(createEditorProject('History', asset));
};

test('undoes and redoes a transform without mutating the original source state', () => {
  const initial = makeHistory();
  const layerId = getSelectedImageLayer(initial.present).id;
  const changed = reduceEditorHistory(initial, {
    type: 'set-transform', layerId,
    transform: { x: 0.7, y: 0.4, scale: 1.2, rotation: 10, flipX: false, flipY: false },
    historyGroup: 'drag',
  });
  const undone = reduceEditorHistory(changed, { type: 'undo' });
  const redone = reduceEditorHistory(undone, { type: 'redo' });
  assert.equal(getSelectedImageLayer(undone.present).transform.x, 0.5);
  assert.equal(getSelectedImageLayer(redone.present).transform.x, 0.7);
});

test('coalesces continuous slider changes into one undo step', () => {
  let history = makeHistory();
  const layerId = getSelectedImageLayer(history.present).id;
  for (const brightness of [10, 20, 30]) {
    history = reduceEditorHistory(history, {
      type: 'set-adjustments', layerId,
      adjustments: { brightness, contrast: 0, saturation: 0 }, historyGroup: 'brightness',
    });
  }
  assert.equal(history.past.length, 1);
});

test('keeps edits isolated after duplicating a variation', () => {
  let history = makeHistory();
  history = reduceEditorHistory(history, { type: 'duplicate-variation', name: 'Alternate' });
  const activeLayer = getSelectedImageLayer(history.present);
  history = reduceEditorHistory(history, {
    type: 'set-opacity', layerId: activeLayer.id, opacity: 0.4,
  });
  assert.equal(history.present.variations[0].layers[0].opacity, 1);
  assert.equal(history.present.variations[1].layers[0].opacity, 0.4);
});

test('normalizes layer edits and leaves caller-owned history untouched', () => {
  const initial = makeHistory();
  const layerId = getSelectedImageLayer(initial.present).id;
  const changed = reduceEditorHistory(initial, {
    type: 'set-transform', layerId,
    transform: { x: 9, y: -9, scale: 0, rotation: 500, flipX: 1 as unknown as boolean, flipY: false },
  });
  assert.deepEqual(getSelectedImageLayer(initial.present).transform, {
    x: 0.5, y: 0.5, scale: 1, rotation: 0, flipX: false, flipY: false,
  });
  assert.deepEqual(getSelectedImageLayer(changed.present).transform, {
    x: 3, y: -2, scale: 0.05, rotation: 180, flipX: true, flipY: false,
  });
});

test('ends a history group and caps past states at 100', () => {
  let history = makeHistory();
  const layerId = getSelectedImageLayer(history.present).id;
  for (const brightness of [10, 20, 30]) {
    history = reduceEditorHistory(history, {
      type: 'set-adjustments', layerId,
      adjustments: { brightness, contrast: 0, saturation: 0 }, historyGroup: 'brightness',
    });
  }
  history = reduceEditorHistory(history, { type: 'end-history-group' });
  history = reduceEditorHistory(history, {
    type: 'set-adjustments', layerId,
    adjustments: { brightness: 40, contrast: 0, saturation: 0 }, historyGroup: 'brightness',
  });
  assert.equal(history.past.length, 2);

  for (let index = 0; index < 101; index += 1) {
    history = reduceEditorHistory(history, { type: 'rename-project', name: `History ${index}` });
  }
  assert.equal(history.past.length, 100);
});
