import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEditorAsset, createEditorProject } from '../editor/model';
import {
  canRedoActiveVariation,
  canUndoActiveVariation,
  createEditorHistory,
  getSelectedImageLayer,
  reduceEditorHistory,
} from '../editor/history';

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
  assert.equal(history.variationHistory[history.present.activeVariationId].past.length, 1);
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
  assert.equal(history.variationHistory[history.present.activeVariationId].past.length, 2);

  for (let index = 0; index < 101; index += 1) {
    history = reduceEditorHistory(history, {
      type: 'set-opacity', layerId, opacity: index % 2,
    });
  }
  assert.equal(history.variationHistory[history.present.activeVariationId].past.length, 100);
});

test('keeps independent undo and redo stacks while alternating edits across variations', () => {
  let history = makeHistory();
  const variationA = history.present.activeVariationId;
  const layerA = getSelectedImageLayer(history.present).id;
  history = reduceEditorHistory(history, { type: 'duplicate-variation', name: 'B' });
  const variationB = history.present.activeVariationId;
  const layerB = getSelectedImageLayer(history.present).id;

  history = reduceEditorHistory(history, {
    type: 'set-transform', layerId: layerB,
    transform: { ...getSelectedImageLayer(history.present).transform, x: 0.8 },
  });
  history = reduceEditorHistory(history, { type: 'select-variation', variationId: variationA });
  assert.equal(canUndoActiveVariation(history), false);
  history = reduceEditorHistory(history, {
    type: 'set-transform', layerId: layerA,
    transform: { ...getSelectedImageLayer(history.present).transform, y: 0.2 },
  });
  history = reduceEditorHistory(history, { type: 'undo' });
  assert.equal(history.present.activeVariationId, variationA);
  assert.equal(getSelectedImageLayer(history.present).transform.y, 0.5);
  assert.equal(canRedoActiveVariation(history), true);

  history = reduceEditorHistory(history, { type: 'select-variation', variationId: variationB });
  assert.equal(canUndoActiveVariation(history), true);
  assert.equal(canRedoActiveVariation(history), false);
  history = reduceEditorHistory(history, { type: 'undo' });
  assert.equal(history.present.activeVariationId, variationB);
  assert.equal(getSelectedImageLayer(history.present).transform.x, 0.5);
  history = reduceEditorHistory(history, { type: 'redo' });
  assert.equal(getSelectedImageLayer(history.present).transform.x, 0.8);

  history = reduceEditorHistory(history, { type: 'select-variation', variationId: variationA });
  history = reduceEditorHistory(history, { type: 'redo' });
  assert.equal(history.present.activeVariationId, variationA);
  assert.equal(getSelectedImageLayer(history.present).transform.y, 0.2);
});

test('variation selection never enters undo history or lets undo switch variations', () => {
  let history = makeHistory();
  const variationA = history.present.activeVariationId;
  history = reduceEditorHistory(history, { type: 'duplicate-variation', name: 'B' });
  const variationB = history.present.activeVariationId;
  const historyBeforeSelection = structuredClone(history.variationHistory);

  history = reduceEditorHistory(history, { type: 'select-variation', variationId: variationA });
  assert.deepEqual(history.variationHistory, historyBeforeSelection);
  history = reduceEditorHistory(history, { type: 'undo' });
  assert.equal(history.present.activeVariationId, variationA);
  assert.equal(canUndoActiveVariation(history), false);

  history = reduceEditorHistory(history, { type: 'select-variation', variationId: variationB });
  assert.equal(history.present.activeVariationId, variationB);
});

test('variation undo preserves project and variation metadata changed after the edit', () => {
  let history = makeHistory();
  const variationId = history.present.activeVariationId;
  const layerId = getSelectedImageLayer(history.present).id;
  history = reduceEditorHistory(history, {
    type: 'set-opacity', layerId, opacity: 0.4,
  });
  history = reduceEditorHistory(history, { type: 'rename-project', name: 'Renamed project' });
  history = reduceEditorHistory(history, { type: 'rename-variation', variationId, name: 'Renamed variation' });
  history = reduceEditorHistory(history, { type: 'undo' });

  assert.equal(history.present.name, 'Renamed project');
  assert.equal(history.present.variations[0].name, 'Renamed variation');
  assert.equal(getSelectedImageLayer(history.present).opacity, 1);
});

test('deletes variations immutably with adjacent fallback and history cleanup', () => {
  let history = makeHistory();
  const variationA = history.present.activeVariationId;
  history = reduceEditorHistory(history, { type: 'duplicate-variation', name: 'B' });
  const variationB = history.present.activeVariationId;
  const layerB = getSelectedImageLayer(history.present).id;
  history = reduceEditorHistory(history, { type: 'set-opacity', layerId: layerB, opacity: 0.3 });
  history = reduceEditorHistory(history, { type: 'duplicate-variation', name: 'C' });
  const variationC = history.present.activeVariationId;
  const beforeDelete = structuredClone(history);

  history = reduceEditorHistory(history, { type: 'delete-variation', variationId: variationB });
  assert.deepEqual(beforeDelete.present.variations.map(({ id }) => id), [variationA, variationB, variationC]);
  assert.deepEqual(history.present.variations.map(({ id }) => id), [variationA, variationC]);
  assert.equal(variationB in history.variationHistory, false);
  assert.equal(history.present.activeVariationId, variationC);

  history = reduceEditorHistory(history, { type: 'delete-variation', variationId: variationC });
  assert.equal(history.present.activeVariationId, variationA);
  const finalHistory = reduceEditorHistory(history, { type: 'delete-variation', variationId: variationA });
  assert.equal(finalHistory, history);
});
