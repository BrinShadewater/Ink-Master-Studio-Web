import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  EditorTopBar,
  createProjectNameDraftState,
  createVariationNameDraftState,
  normalizeProjectNameDraft,
  normalizeVariationNameDraft,
  projectNameDraftReducer,
  variationNameDraftReducer,
  type EditorTopBarProps,
} from '../components/editor/EditorTopBar';
import { EditorToolbar } from '../components/editor/EditorToolbar';
import {
  EditorInspector,
  controlBounds,
  cropToEdgePercentages,
  edgePercentagesToCrop,
} from '../components/editor/EditorInspector';
import {
  LayerPanel,
  LayerDrawer,
  createLayerNameDraftState,
  layerNameDraftReducer,
  normalizeLayerNameDraft,
  restoreLayerNameDraft,
  type LayerPanelProps,
} from '../components/editor/LayerPanel';
import {
  addTextLayerFromPanel,
  normalizeToolForSelectedLayer,
  openProjectFromDrawer,
  selectLayerFromPanel,
} from '../components/editor/EditorApp';
import {
  createEditorAsset,
  createEditorProject,
  createTextLayer,
  type DesignLayer,
  type DesignVariation,
} from '../editor/model';
import {
  createEditorHistory,
  getSelectedImageLayer,
  getSelectedLayer,
  reduceEditorHistory,
} from '../editor/history';

const topBarProps: EditorTopBarProps = {
  projectId: 'project-a',
  projectName: 'Untitled design',
  activeVariationId: 'variation-b',
  variations: [
    { id: 'variation-a', name: 'Same name' },
    { id: 'variation-b', name: 'Same name' },
  ],
  saveStatus: 'saved',
  canUndo: false,
  canRedo: false,
  onProjectNameChange: () => undefined,
  onVariationChange: () => undefined,
  onVariationNameChange: () => undefined,
  onDuplicateVariation: () => undefined,
  onDeleteVariation: () => undefined,
  canDeleteVariation: true,
  onUndo: () => undefined,
  onRedo: () => undefined,
  onRetrySave: () => undefined,
  onImport: () => undefined,
  onOpenProjects: () => undefined,
};

const createLayerPanelVariation = (): DesignVariation => {
  const bottom = {
    ...createTextLayer('Bottom'),
    id: 'layer-bottom',
    name: 'Same name',
  };
  const top = {
    ...createTextLayer('Top'),
    id: 'layer-top',
    name: 'Same name',
    visible: false,
  };
  return {
    id: 'variation-layers',
    name: 'Original',
    layers: [bottom, top],
    selectedLayerId: top.id,
  };
};

const layerPanelProps: LayerPanelProps = {
  variation: createLayerPanelVariation(),
  onAddImage: () => undefined,
  onAddText: () => undefined,
  onSelectLayer: () => undefined,
  dispatch: () => undefined,
};

test('layer panel exposes accessible creation, visibility, and selected-layer actions', () => {
  const markup = renderToStaticMarkup(createElement(LayerPanel, layerPanelProps));

  for (const label of [
    'Add image',
    'Add text',
    'Show layer',
    'Move layer up',
    'Move layer down',
    'Duplicate layer',
    'Delete layer',
  ]) {
    assert.match(markup, new RegExp(`aria-label="${label}"`));
  }
});

test('layer panel renders topmost first and selects duplicate names by layer id', () => {
  const markup = renderToStaticMarkup(createElement(LayerPanel, layerPanelProps));
  const topIndex = markup.indexOf('value="layer-top"');
  const bottomIndex = markup.indexOf('value="layer-bottom"');

  assert.ok(topIndex >= 0 && bottomIndex >= 0 && topIndex < bottomIndex);
  assert.match(markup, /value="layer-top"[^>]*aria-pressed="true"/);
  assert.match(markup, /value="layer-bottom"[^>]*aria-pressed="false"/);
});

test('layer panel disables ordering at both edges and protects the final layer', () => {
  const topSelected = renderToStaticMarkup(createElement(LayerPanel, layerPanelProps));
  assert.match(topSelected, /aria-label="Move layer up"[^>]*disabled=""/);
  assert.doesNotMatch(topSelected, /aria-label="Move layer down"[^>]*disabled=""/);

  const bottomSelected = renderToStaticMarkup(createElement(LayerPanel, {
    ...layerPanelProps,
    variation: { ...createLayerPanelVariation(), selectedLayerId: 'layer-bottom' },
  }));
  assert.match(bottomSelected, /aria-label="Move layer down"[^>]*disabled=""/);

  const onlyLayer = createLayerPanelVariation().layers[0];
  const finalLayer = renderToStaticMarkup(createElement(LayerPanel, {
    ...layerPanelProps,
    variation: {
      ...createLayerPanelVariation(),
      layers: [onlyLayer],
      selectedLayerId: onlyLayer.id,
    },
  }));
  assert.match(finalLayer, /aria-label="Delete layer"[^>]*disabled=""/);
});

test('layer-name draft commits normalized text and restores the latest external name', () => {
  let state = createLayerNameDraftState('layer-a', 'First name');
  state = layerNameDraftReducer(state, { type: 'input', value: '  Front art  ' });
  assert.equal(normalizeLayerNameDraft(state.draft, 'text'), 'Front art');
  assert.equal(normalizeLayerNameDraft('   ', 'image'), 'Image');

  state = layerNameDraftReducer(state, {
    type: 'sync', layerId: 'layer-a', layerName: 'Renamed elsewhere',
  });
  state = layerNameDraftReducer(state, { type: 'input', value: 'Discard me' });
  state = layerNameDraftReducer(state, { type: 'restore' });
  assert.equal(state.draft, 'Renamed elsewhere');

  state = layerNameDraftReducer(state, {
    type: 'sync', layerId: 'layer-b', layerName: 'Second layer',
  });
  assert.deepEqual(state, {
    layerId: 'layer-b', externalName: 'Second layer', draft: 'Second layer',
  });
});

test('restoring a layer name consumes Escape before the drawer can close', () => {
  const events: string[] = [];
  restoreLayerNameDraft({
    preventDefault: () => events.push('prevent'),
    stopPropagation: () => events.push('stop'),
    currentTarget: { blur: () => events.push('blur') },
  }, () => events.push('restore'));

  assert.deepEqual(events, ['prevent', 'stop', 'restore', 'blur']);
});

test('mobile toolbar exposes a stable Layers command', () => {
  const markup = renderToStaticMarkup(createElement(EditorToolbar, {
    tool: 'select',
    onToolChange: () => undefined,
    onOpenLayers: () => undefined,
  }));

  assert.match(markup, /aria-label="Layers"/);
  assert.match(markup, /aria-label="Layers"[^>]*title="Layers"/);
});

test('toolbar disables image-only tools with an accessible explanation for text selection', () => {
  const markup = renderToStaticMarkup(createElement(EditorToolbar, {
    tool: 'select',
    layerType: 'text',
    onToolChange: () => undefined,
    onOpenLayers: () => undefined,
  }));

  assert.match(markup, /id="editor-image-tools-disabled-reason"/);
  assert.match(markup, /Crop and Adjust are available only for image layers\./);
  assert.match(markup, /aria-label="Crop"[^>]*aria-describedby="editor-image-tools-disabled-reason"[^>]*disabled=""/);
  assert.match(markup, /aria-label="Adjust"[^>]*aria-describedby="editor-image-tools-disabled-reason"[^>]*disabled=""/);
  assert.doesNotMatch(markup, /aria-label="Select"[^>]*disabled=""/);
});

test('mobile layer drawer keeps its close control inside the panel header', () => {
  const markup = renderToStaticMarkup(createElement(LayerDrawer, {
    ...layerPanelProps,
    open: true,
    onClose: () => undefined,
    returnFocusRef: createRef<HTMLButtonElement>(),
  }));
  const header = markup.match(/<header[^>]*>[\s\S]*?<\/header>/)?.[0] ?? '';

  assert.match(markup, /role="dialog"/);
  assert.match(header, /aria-label="Close layers"/);
});

test('selecting a text layer from the panel dispatches by id', () => {
  const commands: unknown[] = [];
  const textLayer = { ...createTextLayer('Headline'), id: 'layer-text' };

  selectLayerFromPanel(
    textLayer,
    (command) => commands.push(command),
  );

  assert.deepEqual(commands, [{ type: 'select-layer', layerId: 'layer-text' }]);
});

test('adding text creates and selects a text layer before closing the mobile drawer', () => {
  const commands: Array<{ type: string; layer?: { id: string }; layerId?: string }> = [];
  const events: string[] = [];

  const layer = addTextLayerFromPanel(
    (command) => commands.push(command),
    () => events.push('close'),
  );

  assert.equal(layer.type, 'text');
  assert.equal(layer.text, 'Text');
  assert.deepEqual(commands, [
    { type: 'add-text-layer', layer },
    { type: 'select-layer', layerId: layer.id },
  ]);
  assert.deepEqual(events, ['close']);
});

test('delete fallback from Crop normalizes to Select when the remaining layer is text', () => {
  const source = createEditorAsset('project-delete-tool', new Blob(['source']), {
    name: 'source.png', width: 100, height: 80,
  });
  const project = createEditorProject('Delete tool', source);
  const imageLayer = project.variations[0].layers[0];
  const textLayer = { ...createTextLayer('Fallback'), id: 'layer-text-fallback' };
  project.variations[0].layers = [textLayer, imageLayer];
  project.variations[0].selectedLayerId = imageLayer.id;

  const history = reduceEditorHistory(createEditorHistory(project), {
    type: 'delete-layer', layerId: imageLayer.id,
  });
  const selectedLayer = getSelectedLayer(history.present);

  assert.equal(selectedLayer.id, textLayer.id);
  assert.equal(normalizeToolForSelectedLayer('crop', selectedLayer), 'select');
});

test('duplicating selected text from Adjust normalizes the duplicate to Select', () => {
  const source = createEditorAsset('project-duplicate-tool', new Blob(['source']), {
    name: 'source.png', width: 100, height: 80,
  });
  const project = createEditorProject('Duplicate tool', source);
  const textLayer = { ...createTextLayer('Duplicate'), id: 'layer-text-duplicate' };
  project.variations[0].layers.push(textLayer);
  project.variations[0].selectedLayerId = textLayer.id;

  const history = reduceEditorHistory(createEditorHistory(project), {
    type: 'duplicate-layer', layerId: textLayer.id,
  });
  const selectedLayer = getSelectedLayer(history.present);

  assert.equal(selectedLayer.type, 'text');
  assert.notEqual(selectedLayer.id, textLayer.id);
  assert.equal(normalizeToolForSelectedLayer('adjust', selectedLayer), 'select');
});

test('variation select is controlled by active id when names are duplicated', () => {
  const markup = renderToStaticMarkup(createElement(EditorTopBar, topBarProps));
  assert.match(markup, /<option value="variation-b" selected="">Same name<\/option>/);
  assert.doesNotMatch(markup, /<option value="variation-a" selected="">/);
});

test('project-name draft preserves spaces and commits the complete multiword name', () => {
  let state = createProjectNameDraftState('project-a', '');
  for (const character of 'Film still') {
    state = projectNameDraftReducer(state, { type: 'input', value: state.draft + character });
  }

  assert.equal(state.draft, 'Film still');
  assert.equal(normalizeProjectNameDraft(state.draft), 'Film still');
  assert.equal(normalizeProjectNameDraft('  Film still  '), 'Film still');
  assert.equal(normalizeProjectNameDraft('   '), 'Untitled design');
});

test('project-name draft syncs external project changes and Escape restores the external value', () => {
  let state = createProjectNameDraftState('project-a', 'First project');
  state = projectNameDraftReducer(state, { type: 'input', value: 'Unsaved draft' });
  state = projectNameDraftReducer(state, {
    type: 'sync',
    projectId: 'project-a',
    projectName: 'Renamed elsewhere',
  });
  assert.equal(state.draft, 'Renamed elsewhere');

  state = projectNameDraftReducer(state, { type: 'input', value: 'Another draft' });
  state = projectNameDraftReducer(state, { type: 'restore' });
  assert.equal(state.draft, 'Renamed elsewhere');

  state = projectNameDraftReducer(state, {
    type: 'sync',
    projectId: 'project-b',
    projectName: 'Second project',
  });
  assert.deepEqual(state, {
    projectId: 'project-b',
    externalName: 'Second project',
    draft: 'Second project',
  });
});

test('variation-name draft commits editable names and syncs active variation changes', () => {
  let state = createVariationNameDraftState('variation-a', 'Original');
  state = variationNameDraftReducer(state, { type: 'input', value: 'Front print' });
  assert.equal(normalizeVariationNameDraft(state.draft), 'Front print');
  assert.equal(normalizeVariationNameDraft('   '), 'Original');

  state = variationNameDraftReducer(state, {
    type: 'sync', variationId: 'variation-b', variationName: 'Back print',
  });
  assert.deepEqual(state, {
    variationId: 'variation-b', externalName: 'Back print', draft: 'Back print',
  });
});

test('top bar exposes variation management and a live retryable save failure', () => {
  const markup = renderToStaticMarkup(createElement(EditorTopBar, {
    ...topBarProps,
    saveStatus: 'error',
  }));
  assert.match(markup, /aria-label="Variation name"/);
  assert.match(markup, /aria-label="Duplicate variation"/);
  assert.match(markup, /aria-label="Delete variation"/);
  assert.match(markup, /aria-live="polite"/);
  assert.match(markup, /Local save failed/);
  assert.match(markup, /aria-label="Retry save"/);
});

test('top bar disables variation deletion when only one variation remains', () => {
  const markup = renderToStaticMarkup(createElement(EditorTopBar, {
    ...topBarProps,
    variations: [{ id: 'variation-b', name: 'Original' }],
    canDeleteVariation: false,
  }));
  assert.match(markup, /aria-label="Delete variation"[^>]*disabled=""/);
});

test('inspector controls keep deterministic bounds and normalized crop dimensions', () => {
  assert.deepEqual(controlBounds.position, { min: -2, max: 3, step: 0.01 });
  assert.deepEqual(controlBounds.crop, { min: 0, max: 45, step: 1 });
  assert.deepEqual(
    edgePercentagesToCrop({ left: 45, top: 45, right: 45, bottom: 45 }),
    { x: 0.45, y: 0.45, width: 0.1, height: 0.1 },
  );
  assert.deepEqual(
    cropToEdgePercentages({ x: 0.95, y: 0.95, width: 0.05, height: 0.05 }),
    { left: 45, top: 45, right: 0, bottom: 0 },
  );
});

const renderInspector = (layer: DesignLayer, tool: 'select' | 'crop' | 'adjust' = 'select') => {
  const source = createEditorAsset('project-inspector', new Blob(['source']), {
    name: 'source.png', width: 100, height: 80,
  });
  const project = createEditorProject('Inspector', source);
  return renderToStaticMarkup(createElement(EditorInspector, {
    project,
    layer,
    tool,
    dispatch: () => undefined,
  }));
};

test('text inspector exposes complete editable text and shared transform controls', () => {
  const layer = {
    ...createTextLayer('First line\nSecond line'),
    id: 'layer-text-inspector',
  };
  const markup = renderInspector(layer);

  assert.match(markup, /<h2[^>]*>Text<\/h2>/);
  assert.match(markup, /<textarea[^>]*id="editor-text-content"[^>]*maxLength="500"[^>]*>[\s\S]*First line\nSecond line[\s\S]*<\/textarea>/);
  assert.match(markup, /<select[^>]*id="editor-font-family"/);
  for (const font of ['Arial', 'Georgia', 'Impact', 'Trebuchet MS']) {
    assert.match(markup, new RegExp(`<option value="${font}"`));
  }
  assert.match(markup, /id="editor-font-size"[^>]*min="8"[^>]*max="400"/);
  assert.match(markup, /id="editor-fill-color"[^>]*type="color"/);
  for (const alignment of ['left', 'center', 'right']) {
    assert.match(markup, new RegExp(`aria-label="Align ${alignment}"`));
  }
  assert.match(markup, /id="editor-letter-spacing"[^>]*min="-2"[^>]*max="40"/);
  assert.match(markup, /id="editor-outline-width"[^>]*min="0"[^>]*max="20"/);
  assert.match(markup, /id="editor-outline-color"[^>]*type="color"/);
  for (const id of [
    'editor-opacity',
    'editor-position-x',
    'editor-position-y',
    'editor-scale',
    'editor-rotation',
  ]) {
    assert.match(markup, new RegExp(`id="${id}"`));
  }
  assert.match(markup, />Horizontal<\/label>/);
  assert.match(markup, />Vertical<\/label>/);
  assert.doesNotMatch(markup, /editor-crop-left|editor-brightness/);
});

test('image inspector retains phase-one control ids, bounds, and image-only sections', () => {
  const source = createEditorAsset('project-image-inspector', new Blob(['source']), {
    name: 'source.png', width: 100, height: 80,
  });
  const project = createEditorProject('Image inspector', source);
  const layer = project.variations[0].layers[0];
  assert.equal(layer.type, 'image');

  const transformMarkup = renderInspector(layer);
  assert.match(transformMarkup, /id="editor-position-x"[^>]*min="-2"[^>]*max="3"[^>]*step="0.01"/);
  assert.match(transformMarkup, /id="editor-position-y"[^>]*min="-2"[^>]*max="3"[^>]*step="0.01"/);
  assert.match(transformMarkup, /id="editor-scale"[^>]*min="5"[^>]*max="400"[^>]*step="1"/);
  assert.match(transformMarkup, /id="editor-rotation"[^>]*min="-180"[^>]*max="180"[^>]*step="1"/);
  assert.match(transformMarkup, /id="editor-opacity"[^>]*min="0"[^>]*max="100"[^>]*step="1"/);

  const cropMarkup = renderInspector(layer, 'crop');
  for (const edge of ['left', 'top', 'right', 'bottom']) {
    assert.match(cropMarkup, new RegExp(`id="editor-crop-${edge}"[^>]*min="0"[^>]*max="45"[^>]*step="1"`));
  }

  const adjustmentsMarkup = renderInspector(layer, 'adjust');
  for (const adjustment of ['brightness', 'contrast', 'saturation']) {
    assert.match(adjustmentsMarkup, new RegExp(`id="editor-${adjustment}"[^>]*min="-100"[^>]*max="100"[^>]*step="1"`));
  }
});

test('project drawer closes only after the requested project opens successfully', async () => {
  let closeCount = 0;
  assert.equal(
    await openProjectFromDrawer('project-a', async () => false, () => { closeCount += 1; }),
    false,
  );
  assert.equal(closeCount, 0);

  assert.equal(
    await openProjectFromDrawer('project-a', async () => true, () => { closeCount += 1; }),
    true,
  );
  assert.equal(closeCount, 1);
});

test('selected layer helpers follow image and text selection', () => {
  const source = createEditorAsset('project-source-render', new Blob(['source']), {
    name: 'source.png', width: 100, height: 80,
  });
  const project = createEditorProject('Source render', source);
  const sourceLayer = project.variations[0].layers[0];
  assert.equal(sourceLayer.type, 'image');
  const secondaryLayer = { ...sourceLayer, id: 'layer-secondary', assetId: 'asset-secondary', name: 'Secondary' };
  let history = reduceEditorHistory(createEditorHistory(project), {
    type: 'add-image-layer', layer: secondaryLayer,
  });
  assert.equal(history.present.variations[0].selectedLayerId, secondaryLayer.id);
  assert.equal(getSelectedImageLayer(history.present)?.id, secondaryLayer.id);

  history = reduceEditorHistory(history, { type: 'add-text-layer', layer: createTextLayer('Selected text') });
  assert.equal(getSelectedImageLayer(history.present), null);
});
