import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEditorAsset, createEditorProject, createTextLayer } from '../editor/model';
import {
  canRedoActiveVariation,
  canUndoActiveVariation,
  createEditorHistory,
  getSelectedLayer,
  getSelectedImageLayer,
  getSelectedTextLayer,
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

test('keeps crop and adjustment commands out of selected text layers', () => {
  const asset = createEditorAsset('project_text_history', new Blob(['x']), { name: 'x.png', width: 100, height: 100 });
  const project = createEditorProject('Text history', asset);
  const textLayer = createTextLayer('Text');
  project.variations[0].layers = [textLayer];
  project.variations[0].selectedLayerId = textLayer.id;
  const history = createEditorHistory(project);

  assert.equal(getSelectedImageLayer(history.present), null);
  assert.equal(getSelectedTextLayer(history.present)?.id, textLayer.id);
  assert.equal(reduceEditorHistory(history, {
    type: 'set-crop', layerId: textLayer.id, crop: { x: 0, y: 0, width: 0.5, height: 0.5 },
  }), history);
  assert.equal(reduceEditorHistory(history, {
    type: 'set-adjustments', layerId: textLayer.id, adjustments: { brightness: 10, contrast: 0, saturation: 0 },
  }), history);
});

test('adds image and text layers as undoable ordered edits', () => {
  const initial = makeHistory();
  const source = getSelectedImageLayer(initial.present);
  if (!source) throw new Error('Expected a source image layer.');
  const imageLayer = { ...structuredClone(source), id: 'image_added', name: 'Added image' };
  const textLayer = { ...createTextLayer('Caption'), id: 'text_added' };

  const imageAdded = reduceEditorHistory(initial, { type: 'add-image-layer', layer: imageLayer });
  const textAdded = reduceEditorHistory(imageAdded, { type: 'add-text-layer', layer: textLayer });
  const undone = reduceEditorHistory(textAdded, { type: 'undo' });

  assert.deepEqual(imageAdded.present.variations[0].layers.map(({ id }) => id), [source.id, imageLayer.id]);
  assert.equal(imageAdded.present.variations[0].selectedLayerId, imageLayer.id);
  assert.deepEqual(textAdded.present.variations[0].layers.map(({ id }) => id), [source.id, imageLayer.id, textLayer.id]);
  assert.equal(textAdded.present.variations[0].selectedLayerId, textLayer.id);
  assert.deepEqual(undone.present.variations[0].layers.map(({ id }) => id), [source.id, imageLayer.id]);
  assert.equal(undone.present.variations[0].selectedLayerId, imageLayer.id);
  assert.deepEqual(reduceEditorHistory(undone, { type: 'undo' }).present.variations[0].layers.map(({ id }) => id), [source.id]);
});

test('duplicates image layers with a fresh layer identity and shared asset identity', () => {
  const initial = makeHistory();
  const source = getSelectedImageLayer(initial.present);
  if (!source) throw new Error('Expected a source image layer.');

  const duplicated = reduceEditorHistory(initial, { type: 'duplicate-layer', layerId: source.id });
  const copy = duplicated.present.variations[0].layers[1];
  const undone = reduceEditorHistory(duplicated, { type: 'undo' });

  assert.equal(copy.type, 'image');
  if (copy.type !== 'image') throw new Error('Expected the duplicate to be an image layer.');
  assert.notEqual(copy.id, source.id);
  assert.equal(copy.assetId, source.assetId);
  assert.deepEqual(undone.present.variations[0].layers.map(({ id }) => id), [source.id]);
});

test('moves, hides, renames, and deletes layers as undoable edits with edge guards', () => {
  const initial = makeHistory();
  const source = getSelectedImageLayer(initial.present);
  if (!source) throw new Error('Expected a source image layer.');
  const textLayer = { ...createTextLayer('Caption'), id: 'text_ordered' };
  const added = reduceEditorHistory(initial, { type: 'add-text-layer', layer: textLayer });
  const moved = reduceEditorHistory(added, { type: 'move-layer', layerId: textLayer.id, direction: 'down' });
  const hidden = reduceEditorHistory(moved, { type: 'set-layer-visibility', layerId: textLayer.id, visible: false });
  const renamed = reduceEditorHistory(hidden, { type: 'rename-layer', layerId: textLayer.id, name: 'Heading' });
  const deleted = reduceEditorHistory(renamed, { type: 'delete-layer', layerId: textLayer.id });
  const deleteUndone = reduceEditorHistory(deleted, { type: 'undo' });
  const renameUndone = reduceEditorHistory(deleteUndone, { type: 'undo' });
  const visibilityUndone = reduceEditorHistory(renameUndone, { type: 'undo' });
  const moveUndone = reduceEditorHistory(visibilityUndone, { type: 'undo' });

  assert.deepEqual(moved.present.variations[0].layers.map(({ id }) => id), [textLayer.id, source.id]);
  assert.equal(reduceEditorHistory(moved, { type: 'move-layer', layerId: textLayer.id, direction: 'down' }), moved);
  assert.equal(hidden.present.variations[0].layers[0].visible, false);
  assert.equal(renamed.present.variations[0].layers[0].name, 'Heading');
  assert.deepEqual(deleted.present.variations[0].layers.map(({ id }) => id), [source.id]);
  assert.equal(deleteUndone.present.variations[0].layers[0].name, 'Heading');
  assert.equal(renameUndone.present.variations[0].layers[0].visible, false);
  assert.deepEqual(visibilityUndone.present.variations[0].layers.map(({ id }) => id), [textLayer.id, source.id]);
  assert.deepEqual(moveUndone.present.variations[0].layers.map(({ id }) => id), [source.id, textLayer.id]);
  assert.equal(reduceEditorHistory(initial, { type: 'delete-layer', layerId: source.id }), initial);
});

test('layer selection does not create a history state and is preserved when restored layers retain it', () => {
  const initial = makeHistory();
  const source = getSelectedImageLayer(initial.present);
  if (!source) throw new Error('Expected a source image layer.');
  const textLayer = { ...createTextLayer('Caption'), id: 'text_selected' };
  const added = reduceEditorHistory(initial, { type: 'add-text-layer', layer: textLayer });
  const historyBeforeSelection = structuredClone(added.variationHistory);
  const selected = reduceEditorHistory(added, { type: 'select-layer', layerId: source.id });
  const undone = reduceEditorHistory(selected, { type: 'undo' });
  const redone = reduceEditorHistory(undone, { type: 'redo' });

  assert.deepEqual(selected.variationHistory, historyBeforeSelection);
  assert.equal(getSelectedLayer(selected.present).id, source.id);
  assert.equal(undone.present.variations[0].selectedLayerId, source.id);
  assert.equal(redone.present.variations[0].selectedLayerId, source.id);
});

test('edits text content and style with normalized values and undo support', () => {
  const initial = makeHistory();
  const textLayer = { ...createTextLayer('Caption'), id: 'text_style' };
  const added = reduceEditorHistory(initial, { type: 'add-text-layer', layer: textLayer });
  const content = `first line\n${'x'.repeat(600)}`;
  const edited = reduceEditorHistory(added, { type: 'set-text-content', layerId: textLayer.id, text: content });
  const styled = reduceEditorHistory(edited, {
    type: 'set-text-style',
    layerId: textLayer.id,
    style: {
      fontFamily: 'Comic Sans MS' as never,
      fontSize: 900,
      color: '#AbC',
      align: 'justify' as never,
      letterSpacing: -10,
      outlineWidth: 99,
      outlineColor: 'red',
    },
  });
  const transformed = reduceEditorHistory(styled, {
    type: 'set-transform',
    layerId: textLayer.id,
    transform: { x: 0.4, y: 0.4, scale: 1.5, rotation: 0, flipX: false, flipY: false },
  });
  const opaque = reduceEditorHistory(transformed, { type: 'set-opacity', layerId: textLayer.id, opacity: 0.25 });
  const undone = reduceEditorHistory(opaque, { type: 'undo' });
  const layer = getSelectedTextLayer(styled.present);

  if (!layer) throw new Error('Expected a selected text layer.');
  assert.equal(layer.text.length, 500);
  assert.ok(layer.text.startsWith('first line\n'));
  assert.equal(layer.fontFamily, 'Arial');
  assert.equal(layer.fontSize, 400);
  assert.equal(layer.color, '#aabbcc');
  assert.equal(layer.align, 'left');
  assert.equal(layer.letterSpacing, -2);
  assert.equal(layer.outlineWidth, 20);
  assert.equal(layer.outlineColor, '#000000');
  assert.equal(getSelectedTextLayer(opaque.present)?.opacity, 0.25);
  assert.equal(getSelectedTextLayer(undone.present)?.opacity, 1);
  assert.equal(getSelectedTextLayer(transformed.present)?.transform.scale, 1.5);
});

test('coalesces text content and continuous style edits until each history group ends', () => {
  let history = makeHistory();
  const textLayer = { ...createTextLayer('Caption'), id: 'text_grouped' };
  history = reduceEditorHistory(history, { type: 'add-text-layer', layer: textLayer });
  const variationId = history.present.activeVariationId;
  const initialPastLength = history.variationHistory[variationId].past.length;

  for (const text of ['C', 'Ca', 'Canvas']) {
    history = reduceEditorHistory(history, {
      type: 'set-text-content', layerId: textLayer.id, text, historyGroup: 'inspector-text-content',
    });
  }
  assert.equal(history.variationHistory[variationId].past.length, initialPastLength + 1);

  history = reduceEditorHistory(history, { type: 'end-history-group' });
  for (const fontSize of [64, 72, 80]) {
    const layer = getSelectedTextLayer(history.present);
    if (!layer) throw new Error('Expected a selected text layer.');
    history = reduceEditorHistory(history, {
      type: 'set-text-style',
      layerId: textLayer.id,
      style: { ...layer, fontSize },
      historyGroup: 'inspector-font-size',
    });
  }
  assert.equal(history.variationHistory[variationId].past.length, initialPastLength + 2);

  history = reduceEditorHistory(history, { type: 'end-history-group' });
  history = reduceEditorHistory(history, {
    type: 'set-text-content', layerId: textLayer.id, text: 'Canvas text', historyGroup: 'inspector-text-content',
  });
  assert.equal(history.variationHistory[variationId].past.length, initialPastLength + 3);
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
