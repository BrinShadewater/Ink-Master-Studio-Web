import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  collectHistoryAssetIds,
  findOrphanedGeneratedAssetIds,
} from '../editor/generatedAssetLifecycle';
import {
  createDefaultBackgroundRemoval,
  createImagePrepFingerprint,
  createTraceSourceFingerprint,
} from '../editor/imagePrepModel';
import {
  createEditorAsset,
  createEditorProject,
  createTextLayer,
  type ImageLayer,
  type TraceLayer,
} from '../editor/model';
import {
  canRedoActiveVariation,
  canUndoActiveVariation,
  createEditorHistory,
  getActiveVariation,
  getSelectedLayer,
  getSelectedImageLayer,
  getSelectedTextLayer,
  reduceEditorHistory,
} from '../editor/history';
import { createDefaultLook } from '../editor/lookModel';
import {
  createDefaultTraceSettings,
  createTraceFingerprint,
} from '../editor/traceModel';

const makeHistory = () => {
  const asset = createEditorAsset('project_history', new Blob(['x']), { name: 'x.png', width: 100, height: 100 });
  return createEditorHistory(createEditorProject('History', asset));
};

const getVintageInkSeed = (history: ReturnType<typeof makeHistory>) => {
  const look = getActiveVariation(history.present).look;
  if (look.id !== 'vintage-ink') throw new Error('Expected a vintage ink Look.');
  return look.seed;
};

const createTraceFixture = (source: ImageLayer, svgAssetId = 'asset_trace'): TraceLayer => {
  const sourceFingerprint = createTraceSourceFingerprint(source);
  return {
    id: 'trace_layer',
    type: 'trace',
    name: 'Trace',
    sourceLayerId: source.id,
    svgAssetId,
    visible: true,
    opacity: source.opacity,
    transform: structuredClone(source.transform),
    settings: createDefaultTraceSettings(),
    sourceFingerprint,
    sourceFrame: {
      sourceWidth: 100,
      sourceHeight: 100,
      crop: structuredClone(source.crop),
    },
  };
};

test('creates a trace and hides its source as one undoable edit', () => {
  const initial = makeHistory();
  const source = getSelectedImageLayer(initial.present);
  if (!source) throw new Error('Expected source image.');
  const trace = createTraceFixture(source);
  const created = reduceEditorHistory(initial, {
    type: 'add-trace-layer',
    sourceLayerId: source.id,
    layer: trace,
  });

  assert.deepEqual(
    getActiveVariation(created.present).layers.map(({ id, visible }) => ({ id, visible })),
    [{ id: source.id, visible: false }, { id: trace.id, visible: true }],
  );
  assert.equal(getActiveVariation(created.present).selectedLayerId, trace.id);
  assert.equal(created.variationHistory[created.present.activeVariationId].past.length, 1);

  const undone = reduceEditorHistory(created, { type: 'undo' });
  assert.deepEqual(getActiveVariation(undone.present).layers.map(({ id }) => id), [source.id]);
  assert.equal(getActiveVariation(undone.present).layers[0].visible, true);
});

test('groups cleanup controls and stales linked traces without changing source transforms', () => {
  let history = makeHistory();
  const source = getSelectedImageLayer(history.present);
  if (!source) throw new Error('Expected source image.');
  history = reduceEditorHistory(history, {
    type: 'add-trace-layer',
    sourceLayerId: source.id,
    layer: createTraceFixture(source),
  });
  for (const tolerance of [30, 40, 50]) {
    history = reduceEditorHistory(history, {
      type: 'set-background-removal',
      layerId: source.id,
      settings: {
        ...source.backgroundRemoval,
        enabled: true,
        tolerance,
      },
      historyGroup: 'background-tolerance',
    });
  }
  const variation = getActiveVariation(history.present);
  const changedSource = variation.layers.find(({ id }) => id === source.id);
  const staleTrace = variation.layers.find(({ id }) => id === 'trace_layer');
  assert.equal(changedSource?.type, 'image');
  assert.equal(staleTrace?.type, 'trace');
  if (changedSource?.type !== 'image' || staleTrace?.type !== 'trace') throw new Error('Expected layers.');
  assert.equal(changedSource.backgroundRemoval.tolerance, 50);
  assert.equal(staleTrace.sourceFingerprint, '');
  assert.equal(history.variationHistory[history.present.activeVariationId].past.length, 2);

  const moved = reduceEditorHistory(history, {
    type: 'set-transform',
    layerId: source.id,
    transform: { ...changedSource.transform, x: 0.7 },
  });
  const movedTrace = getActiveVariation(moved.present).layers.find(({ id }) => id === 'trace_layer');
  assert.equal(movedTrace?.type, 'trace');
  if (movedTrace?.type !== 'trace') throw new Error('Expected trace.');
  assert.equal(movedTrace.sourceFingerprint, '');
});

test('publishes generated results without adding history and rejects stale trace settings', () => {
  let history = makeHistory();
  const source = getSelectedImageLayer(history.present);
  if (!source) throw new Error('Expected source image.');
  const enabled = {
    ...createDefaultBackgroundRemoval(),
    enabled: true,
  };
  history = reduceEditorHistory(history, {
    type: 'set-background-removal',
    layerId: source.id,
    settings: enabled,
  });
  const currentSource = getSelectedImageLayer(history.present);
  if (!currentSource) throw new Error('Expected current source.');
  const inputFingerprint = createImagePrepFingerprint(currentSource);
  const beforeBackgroundPublish = history.variationHistory[history.present.activeVariationId].past.length;
  history = reduceEditorHistory(history, {
    type: 'publish-background-result',
    layerId: source.id,
    expectedInputFingerprint: inputFingerprint,
    preparedAssetId: 'asset_prepared',
  });
  assert.equal(
    getSelectedImageLayer(history.present)?.backgroundRemoval.preparedAssetId,
    'asset_prepared',
  );
  assert.equal(
    history.variationHistory[history.present.activeVariationId].past.length,
    beforeBackgroundPublish,
  );
  assert.strictEqual(reduceEditorHistory(history, {
    type: 'publish-background-result',
    layerId: source.id,
    expectedInputFingerprint: 'stale',
    preparedAssetId: 'asset_stale',
  }), history);

  const preparedSource = getSelectedImageLayer(history.present);
  if (!preparedSource) throw new Error('Expected prepared source.');
  const trace = createTraceFixture(preparedSource, null as unknown as string);
  trace.svgAssetId = null;
  history = reduceEditorHistory(history, {
    type: 'add-trace-layer',
    sourceLayerId: source.id,
    layer: trace,
  });
  const settings = { ...trace.settings, detail: 70 };
  history = reduceEditorHistory(history, {
    type: 'set-trace-settings',
    layerId: trace.id,
    settings,
  });
  const sourceFingerprint = createTraceSourceFingerprint(preparedSource);
  const traceFingerprint = createTraceFingerprint(sourceFingerprint, settings);
  assert.strictEqual(reduceEditorHistory(history, {
    type: 'publish-trace-result',
    layerId: trace.id,
    expectedSourceFingerprint: sourceFingerprint,
    expectedTraceFingerprint: createTraceFingerprint(sourceFingerprint, trace.settings),
    svgAssetId: 'asset_old_trace',
    palette: [],
  }), history);

  const published = reduceEditorHistory(history, {
    type: 'publish-trace-result',
    layerId: trace.id,
    expectedSourceFingerprint: sourceFingerprint,
    expectedTraceFingerprint: traceFingerprint,
    svgAssetId: 'asset_new_trace',
    palette: ['#112233'],
  });
  const publishedTrace = getActiveVariation(published.present).layers.find(({ id }) => id === trace.id);
  assert.equal(publishedTrace?.type, 'trace');
  if (publishedTrace?.type !== 'trace') throw new Error('Expected trace.');
  assert.equal(publishedTrace.svgAssetId, 'asset_new_trace');
  assert.equal(publishedTrace.sourceFingerprint, sourceFingerprint);
  assert.deepEqual(publishedTrace.settings.palette, ['#112233']);
});

test('invalidates a linked trace when a prepared cleanup output is replaced', () => {
  let history = makeHistory();
  const source = getSelectedImageLayer(history.present);
  if (!source) throw new Error('Expected source image.');
  history = reduceEditorHistory(history, {
    type: 'set-background-removal',
    layerId: source.id,
    settings: { ...source.backgroundRemoval, enabled: true },
  });
  const enabledSource = getSelectedImageLayer(history.present);
  if (!enabledSource) throw new Error('Expected enabled source.');
  const inputFingerprint = createImagePrepFingerprint(enabledSource);
  history = reduceEditorHistory(history, {
    type: 'publish-background-result',
    layerId: source.id,
    expectedInputFingerprint: inputFingerprint,
    preparedAssetId: 'prepared-first',
  });
  const preparedSource = getSelectedImageLayer(history.present);
  if (!preparedSource) throw new Error('Expected prepared source.');
  history = reduceEditorHistory(history, {
    type: 'add-trace-layer',
    sourceLayerId: source.id,
    layer: createTraceFixture(preparedSource),
  });

  const replaced = reduceEditorHistory(history, {
    type: 'publish-background-result',
    layerId: source.id,
    expectedInputFingerprint: inputFingerprint,
    preparedAssetId: 'prepared-second',
  });
  const linkedTrace = getActiveVariation(replaced.present).layers.find(({ type }) => type === 'trace');
  assert.equal(linkedTrace?.type, 'trace');
  if (linkedTrace?.type !== 'trace') throw new Error('Expected linked trace.');
  assert.equal(linkedTrace.sourceFingerprint, '');
});

test('keeps generated assets reachable from present, undo, and redo states', () => {
  let history = makeHistory();
  const source = getSelectedImageLayer(history.present);
  if (!source) throw new Error('Expected source image.');
  history = reduceEditorHistory(history, {
    type: 'add-trace-layer',
    sourceLayerId: source.id,
    layer: createTraceFixture(source),
  });
  const undone = reduceEditorHistory(history, { type: 'undo' });
  const assets = [
    createEditorAsset(history.present.id, new Blob(['upload']), {
      name: 'upload.png', width: 100, height: 100,
    }),
    createEditorAsset(history.present.id, new Blob(['trace']), {
      name: 'trace.svg', width: 100, height: 100,
    }, { role: 'trace-svg' }),
    createEditorAsset(history.present.id, new Blob(['orphan']), {
      name: 'orphan.svg', width: 100, height: 100,
    }, { role: 'trace-svg' }),
  ];
  assets[0].id = source.assetId;
  assets[1].id = 'asset_trace';
  assets[2].id = 'asset_orphan';

  assert.ok(collectHistoryAssetIds(undone).has('asset_trace'));
  assert.deepEqual(findOrphanedGeneratedAssetIds(assets, undone), ['asset_orphan']);
});

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

test('keeps image reset atomic and invalidates its redo after a discrete transform edit', () => {
  let history = makeHistory();
  const layer = getSelectedImageLayer(history.present);
  const variationId = history.present.activeVariationId;
  history = reduceEditorHistory(history, {
    type: 'set-transform', layerId: layer.id,
    transform: { ...layer.transform, scale: 2, rotation: 30 },
  });
  history = reduceEditorHistory(history, { type: 'set-opacity', layerId: layer.id, opacity: 0.4 });
  const beforeResetLength = history.variationHistory[variationId].past.length;

  history = reduceEditorHistory(history, {
    type: 'set-transform', layerId: layer.id,
    transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, flipX: false, flipY: false },
    historyGroup: 'inspector-select-reset',
  });
  history = reduceEditorHistory(history, {
    type: 'set-opacity', layerId: layer.id, opacity: 1, historyGroup: 'inspector-select-reset',
  });
  history = reduceEditorHistory(history, { type: 'end-history-group' });
  assert.equal(history.variationHistory[variationId].past.length, beforeResetLength + 1);

  history = reduceEditorHistory(history, { type: 'undo' });
  assert.equal(getSelectedImageLayer(history.present).transform.scale, 2);
  assert.equal(getSelectedImageLayer(history.present).opacity, 0.4);
  assert.equal(canRedoActiveVariation(history), true);
  const restored = getSelectedImageLayer(history.present);
  history = reduceEditorHistory(history, {
    type: 'set-transform', layerId: restored.id,
    transform: { ...restored.transform, flipX: true },
  });
  assert.equal(canRedoActiveVariation(history), false);
});

test('groups color edits and keeps a later discrete style edit separate across undo and redo', () => {
  let history = makeHistory();
  const textLayer = { ...createTextLayer('Color'), id: 'text_color_group' };
  history = reduceEditorHistory(history, { type: 'add-text-layer', layer: textLayer });
  const variationId = history.present.activeVariationId;
  const initialPastLength = history.variationHistory[variationId].past.length;

  for (const color of ['#112233', '#445566', '#778899']) {
    const layer = getSelectedTextLayer(history.present);
    if (!layer) throw new Error('Expected a selected text layer.');
    history = reduceEditorHistory(history, {
      type: 'set-text-style', layerId: layer.id,
      style: { ...layer, color }, historyGroup: 'inspector-fill-color',
    });
  }
  history = reduceEditorHistory(history, { type: 'end-history-group' });
  assert.equal(history.variationHistory[variationId].past.length, initialPastLength + 1);

  const colored = getSelectedTextLayer(history.present);
  if (!colored) throw new Error('Expected a selected text layer.');
  history = reduceEditorHistory(history, {
    type: 'set-text-style', layerId: colored.id, style: { ...colored, align: 'center' },
  });
  assert.equal(history.variationHistory[variationId].past.length, initialPastLength + 2);
  history = reduceEditorHistory(history, { type: 'undo' });
  assert.equal(getSelectedTextLayer(history.present)?.align, 'left');
  assert.equal(getSelectedTextLayer(history.present)?.color, '#778899');
  history = reduceEditorHistory(history, { type: 'undo' });
  assert.equal(getSelectedTextLayer(history.present)?.color, '#000000');
  history = reduceEditorHistory(history, { type: 'redo' });
  assert.equal(getSelectedTextLayer(history.present)?.color, '#778899');
  history = reduceEditorHistory(history, { type: 'redo' });
  assert.equal(getSelectedTextLayer(history.present)?.align, 'center');
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

test('switching variations closes the outgoing history group', () => {
  let history = makeHistory();
  const variationA = history.present.activeVariationId;
  const layerA = getSelectedImageLayer(history.present).id;
  history = reduceEditorHistory(history, { type: 'duplicate-variation', name: 'B' });
  const variationB = history.present.activeVariationId;
  history = reduceEditorHistory(history, { type: 'select-variation', variationId: variationA });
  history = reduceEditorHistory(history, {
    type: 'set-opacity', layerId: layerA, opacity: 0.8, historyGroup: 'inspector-opacity',
  });

  history = reduceEditorHistory(history, { type: 'select-variation', variationId: variationB });
  history = reduceEditorHistory(history, { type: 'select-variation', variationId: variationA });
  history = reduceEditorHistory(history, {
    type: 'set-opacity', layerId: layerA, opacity: 0.6, historyGroup: 'inspector-opacity',
  });
  history = reduceEditorHistory(history, { type: 'undo' });

  assert.equal(getSelectedImageLayer(history.present).opacity, 0.8);
});

test('duplicating a variation closes the source history group', () => {
  let history = makeHistory();
  const variationA = history.present.activeVariationId;
  const layerA = getSelectedImageLayer(history.present).id;
  history = reduceEditorHistory(history, {
    type: 'set-opacity', layerId: layerA, opacity: 0.8, historyGroup: 'inspector-opacity',
  });

  history = reduceEditorHistory(history, { type: 'duplicate-variation', name: 'B' });
  history = reduceEditorHistory(history, { type: 'select-variation', variationId: variationA });
  history = reduceEditorHistory(history, {
    type: 'set-opacity', layerId: layerA, opacity: 0.6, historyGroup: 'inspector-opacity',
  });
  history = reduceEditorHistory(history, { type: 'undo' });

  assert.equal(getSelectedImageLayer(history.present).opacity, 0.8);
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

test('applies normalized Look recipes as discrete edits and ignores stable no-op recipes', () => {
  let history = makeHistory();
  const initialLook = getActiveVariation(history.present).look;
  history = reduceEditorHistory(history, {
    type: 'set-look',
    look: { ...createDefaultLook('duotone'), shadowColor: '#234' },
  });

  assert.deepEqual(getActiveVariation(history.present).look, {
    id: 'duotone', strength: 100, shadowColor: '#223344', highlightColor: '#f59e0b', balance: 0,
  });
  assert.equal(history.variationHistory[history.present.activeVariationId].past.length, 1);

  const unchanged = reduceEditorHistory(history, {
    type: 'set-look',
    look: { ...createDefaultLook('duotone'), shadowColor: '#223344' },
  });
  assert.equal(unchanged, history);

  const undone = reduceEditorHistory(history, { type: 'undo' });
  const redone = reduceEditorHistory(undone, { type: 'redo' });
  assert.deepEqual(getActiveVariation(undone.present).look, initialLook);
  assert.equal(getActiveVariation(redone.present).look.id, 'duotone');
});

test('groups continuous Look strength edits into one undo step', () => {
  let history = makeHistory();
  const variationId = history.present.activeVariationId;
  history = reduceEditorHistory(history, { type: 'set-look', look: createDefaultLook('duotone') });
  for (const strength of [80, 60, 40]) {
    history = reduceEditorHistory(history, {
      type: 'set-look',
      look: { ...createDefaultLook('duotone'), strength },
      historyGroup: 'look-strength',
    });
  }
  history = reduceEditorHistory(history, { type: 'end-history-group' });

  assert.equal(history.variationHistory[variationId].past.length, 2);
  history = reduceEditorHistory(history, { type: 'undo' });
  assert.equal(getActiveVariation(history.present).look.strength, 100);
});

test('normalizes advanced Look parameters and restores them through undo', () => {
  let history = makeHistory();
  history = reduceEditorHistory(history, {
    type: 'set-look',
    look: {
      ...createDefaultLook('graphic-halftone'), strength: 63.6, cellSize: 99.2, angle: -10,
      foregroundColor: '#A3c', background: 'solid', backgroundColor: '#f0c',
    },
  });

  assert.deepEqual(getActiveVariation(history.present).look, {
    id: 'graphic-halftone', strength: 64, cellSize: 32, angle: 0,
    foregroundColor: '#aa33cc', background: 'solid', backgroundColor: '#ff00cc',
  });
  history = reduceEditorHistory(history, { type: 'undo' });
  assert.deepEqual(getActiveVariation(history.present).look, createDefaultLook('original'));
});

test('resets a Look to Original only when needed', () => {
  let history = makeHistory();
  assert.equal(reduceEditorHistory(history, { type: 'reset-look' }), history);

  history = reduceEditorHistory(history, { type: 'set-look', look: createDefaultLook('monochrome') });
  const reset = reduceEditorHistory(history, { type: 'reset-look' });
  assert.deepEqual(getActiveVariation(reset.present).look, createDefaultLook('original'));
  assert.equal(reset.variationHistory[reset.present.activeVariationId].past.length, 2);
  assert.equal(reduceEditorHistory(reset, { type: 'reset-look' }), reset);

  const undone = reduceEditorHistory(reset, { type: 'undo' });
  assert.equal(getActiveVariation(undone.present).look.id, 'monochrome');
});

test('rerolls only seeded Looks as one discrete undoable edit', () => {
  let history = makeHistory();
  assert.equal(reduceEditorHistory(history, { type: 'reroll-look-seed', seed: 9 }), history);

  history = reduceEditorHistory(history, {
    type: 'set-look', look: createDefaultLook('vintage-ink', 4),
  });
  const rerolled = reduceEditorHistory(history, { type: 'reroll-look-seed', seed: -1 });
  assert.equal(getActiveVariation(rerolled.present).look.id, 'vintage-ink');
  assert.equal(getVintageInkSeed(rerolled), 4_294_967_295);
  assert.equal(rerolled.variationHistory[rerolled.present.activeVariationId].past.length, 2);

  const undone = reduceEditorHistory(rerolled, { type: 'undo' });
  assert.equal(getVintageInkSeed(undone), 4);
  const redone = reduceEditorHistory(undone, { type: 'redo' });
  assert.equal(getVintageInkSeed(redone), 4_294_967_295);
});

test('orders layer and Look edits independently while preserving selection outside history', () => {
  let history = makeHistory();
  const imageLayer = getSelectedImageLayer(history.present);
  if (!imageLayer) throw new Error('Expected a source image layer.');
  const textLayer = { ...createTextLayer('Caption'), id: 'look_selection' };
  history = reduceEditorHistory(history, { type: 'add-text-layer', layer: textLayer });
  history = reduceEditorHistory(history, { type: 'select-layer', layerId: imageLayer.id });
  history = reduceEditorHistory(history, { type: 'set-opacity', layerId: imageLayer.id, opacity: 0.4 });
  history = reduceEditorHistory(history, { type: 'set-look', look: createDefaultLook('high-contrast') });
  history = reduceEditorHistory(history, { type: 'select-layer', layerId: textLayer.id });

  history = reduceEditorHistory(history, { type: 'undo' });
  assert.equal(getActiveVariation(history.present).look.id, 'original');
  assert.equal(getActiveVariation(history.present).layers.find(({ id }) => id === imageLayer.id)?.opacity, 0.4);
  assert.equal(getSelectedLayer(history.present).id, textLayer.id);

  history = reduceEditorHistory(history, { type: 'undo' });
  assert.equal(getActiveVariation(history.present).layers.find(({ id }) => id === imageLayer.id)?.opacity, 1);
  assert.equal(getSelectedLayer(history.present).id, textLayer.id);
});

test('keeps Look edits isolated by variation and clones a duplicate Look recipe', () => {
  let history = makeHistory();
  const variationA = history.present.activeVariationId;
  history = reduceEditorHistory(history, {
    type: 'set-look', look: { ...createDefaultLook('duotone'), shadowColor: '#223344' },
  });
  history = reduceEditorHistory(history, { type: 'duplicate-variation', name: 'Alternate' });
  const variationB = history.present.activeVariationId;
  const sourceLook = history.present.variations.find(({ id }) => id === variationA)?.look;
  const copiedLook = getActiveVariation(history.present).look;
  assert.deepEqual(copiedLook, sourceLook);
  assert.notEqual(copiedLook, sourceLook);

  history = reduceEditorHistory(history, { type: 'set-look', look: createDefaultLook('clean-photo') });
  history = reduceEditorHistory(history, { type: 'select-variation', variationId: variationA });
  assert.equal(getActiveVariation(history.present).look.id, 'duotone');
  assert.equal(canUndoActiveVariation(history), true);

  history = reduceEditorHistory(history, { type: 'select-variation', variationId: variationB });
  history = reduceEditorHistory(history, { type: 'undo' });
  assert.equal(getActiveVariation(history.present).look.id, 'duotone');
});

test('switching variations closes an outgoing Look history group', () => {
  let history = makeHistory();
  const variationA = history.present.activeVariationId;
  history = reduceEditorHistory(history, { type: 'set-look', look: createDefaultLook('duotone') });
  history = reduceEditorHistory(history, { type: 'duplicate-variation', name: 'B' });
  const variationB = history.present.activeVariationId;
  history = reduceEditorHistory(history, { type: 'select-variation', variationId: variationA });
  history = reduceEditorHistory(history, {
    type: 'set-look',
    look: { ...createDefaultLook('duotone'), strength: 80 },
    historyGroup: 'look-strength',
  });

  history = reduceEditorHistory(history, { type: 'select-variation', variationId: variationB });
  history = reduceEditorHistory(history, { type: 'select-variation', variationId: variationA });
  history = reduceEditorHistory(history, {
    type: 'set-look',
    look: { ...createDefaultLook('duotone'), strength: 60 },
    historyGroup: 'look-strength',
  });
  history = reduceEditorHistory(history, { type: 'undo' });

  assert.equal(getActiveVariation(history.present).look.strength, 80);
});
