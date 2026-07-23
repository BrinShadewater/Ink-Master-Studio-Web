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
import { CompareBoard, type CompareBoardProps } from '../components/editor/CompareBoard';
import {
  LooksInspector,
  createLookCandidateRecipes,
  lookControlBounds,
} from '../components/editor/LooksInspector';
import {
  EditorInspector,
  controlBounds,
  cropToEdgePercentages,
  edgePercentagesToCrop,
} from '../components/editor/EditorInspector';
import {
  createFontSizeDraftState,
  fontSizeDraftReducer,
  normalizeFontSizeDraft,
} from '../components/editor/TextInspector';
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
  getVariationPreviewEvictions,
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
import { LOOK_IDS, createDefaultLook, type LookId } from '../editor/lookModel';
import type { LookRenderCoordinator } from '../editor/lookRenderCoordinator';
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
    look: { id: 'original', strength: 100 },
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

test('toolbar exposes the Looks tool with the Palette icon and stable mobile target', () => {
  const markup = renderToStaticMarkup(createElement(EditorToolbar, {
    tool: 'looks',
    onToolChange: () => undefined,
    onOpenLayers: () => undefined,
  }));

  assert.match(markup, /aria-label="Looks"[^>]*aria-pressed="true"/);
  assert.match(markup, /aria-label="Looks"[\s\S]*?lucide-palette/);
  const looksButton = markup.match(/<button[^>]*aria-label="Looks"[^>]*>/)?.[0] ?? '';
  assert.match(looksButton, /class="[^"]*h-10 w-10/);
});

const createCompareVariations = (count: number): DesignVariation[] => {
  const source = createEditorAsset('project-compare-shell', new Blob(['source']), {
    name: 'source.png', width: 100, height: 80,
  });
  const base = createEditorProject('Compare shell', source).variations[0];
  return Array.from({ length: count }, (_, index) => ({
    ...structuredClone(base),
    id: `variation-${index + 1}`,
    name: `Variation ${index + 1}`,
  }));
};

const renderCompareBoard = (
  count: number,
  selectedVariationIds: string[],
  background: CompareBoardProps['background'] = 'neutral',
) => {
  const variations = createCompareVariations(count);
  return renderToStaticMarkup(createElement(CompareBoard, {
    variations,
    selectedVariationIds,
    background,
    zoom: 100,
    assetsById: {},
    imagesById: {},
    coordinator: {} as LookRenderCoordinator,
    onSelectionChange: () => undefined,
    onBackgroundChange: () => undefined,
    onZoomChange: () => undefined,
    onEditVariation: () => undefined,
    onClose: () => undefined,
  }));
};

test('Compare Board exposes stable selection, background, zoom, and edit controls', () => {
  const markup = renderCompareBoard(3, ['variation-1', 'variation-2'], 'dark');

  assert.match(markup, /aria-label="Compare variations"/);
  for (let index = 1; index <= 3; index += 1) {
    assert.match(markup, new RegExp(`type="checkbox"[^>]*value="variation-${index}"`));
  }
  for (const background of ['Neutral', 'Light', 'Dark']) {
    assert.match(markup, new RegExp(`aria-label="${background} background"`));
  }
  assert.match(markup, /aria-label="Dark background"[^>]*aria-pressed="true"/);
  assert.match(markup, /aria-label="Neutral background"[^>]*aria-pressed="false"/);
  assert.match(markup, /aria-label="Compare zoom"[^>]*min="50"[^>]*max="150"[^>]*value="100"/);
  for (let index = 1; index <= 2; index += 1) {
    assert.match(markup, new RegExp(`aria-label="Variation ${index} preview on dark background"`));
    assert.match(markup, new RegExp(`aria-label="Edit Variation ${index}"`));
  }
  assert.doesNotMatch(markup, /aria-label="Inspector"|aria-label="Layers panel"/);
});

test('Compare Board enforces two-to-four selections in rendered checkbox states', () => {
  const two = renderCompareBoard(3, ['variation-1', 'variation-2']);
  for (const id of ['variation-1', 'variation-2']) {
    const checkbox = two.match(new RegExp(`<input[^>]*value="${id}"[^>]*>`))?.[0] ?? '';
    assert.match(checkbox, /type="checkbox"/);
    assert.match(checkbox, /disabled=""/);
  }

  const four = renderCompareBoard(
    5,
    ['variation-1', 'variation-2', 'variation-3', 'variation-4'],
  );
  const fifthCheckbox = four.match(/<input[^>]*value="variation-5"[^>]*>/)?.[0] ?? '';
  assert.match(fifthCheckbox, /type="checkbox"/);
  assert.match(fifthCheckbox, /disabled=""/);
  assert.equal(four.match(/data-compare-preview="true"/g)?.length, 4);
});

test('Compare Board keeps equal desktop frames and mobile scroll-page sizing', () => {
  for (const count of [2, 3, 4]) {
    const ids = Array.from({ length: count }, (_, index) => `variation-${index + 1}`);
    const markup = renderCompareBoard(count, ids);
    assert.match(markup, /data-compare-preview-strip="true"/);
    assert.match(markup, /md:grid-cols-2/);
    assert.match(markup, /grid-flow-col/);
    assert.match(markup, /auto-cols-\[calc\(100vw-32px\)\]/);
    assert.match(markup, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
    assert.match(markup, /col-span-2/);
    assert.equal(markup.match(/data-compare-preview="true"/g)?.length, count);
  }
});

test('toolbar disables editing commands while Compare is active and disables Compare below two variations', () => {
  const unavailable = renderToStaticMarkup(createElement(EditorToolbar, {
    tool: 'select',
    variationCount: 1,
    compareOpen: false,
    onToolChange: () => undefined,
    onOpenLayers: () => undefined,
    onToggleCompare: () => undefined,
  }));
  assert.match(unavailable, /aria-label="Compare"[^>]*disabled=""/);

  const active = renderToStaticMarkup(createElement(EditorToolbar, {
    tool: 'select',
    variationCount: 3,
    compareOpen: true,
    onToolChange: () => undefined,
    onOpenLayers: () => undefined,
    onToggleCompare: () => undefined,
  }));
  assert.match(active, /id="editor-compare-disabled-reason"/);
  assert.match(active, /aria-label="Compare"[^>]*aria-pressed="true"/);
  for (const label of ['Select', 'Crop', 'Adjust', 'Looks', 'Layers']) {
    assert.match(
      active,
      new RegExp(`aria-label="${label}"[^>]*aria-describedby="editor-compare-disabled-reason"[^>]*disabled=""`),
    );
  }
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
  assert.doesNotMatch(markup, /aria-label="Looks"[^>]*disabled=""/);
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
  assert.equal(normalizeToolForSelectedLayer('looks', selectedLayer), 'looks');
});

const renderLooksInspector = (
  lookId: LookId,
  options: { error?: string | null; seed?: number } = {},
) => {
  const source = createEditorAsset('project-looks-inspector', new Blob(['source']), {
    name: 'source.png', width: 100, height: 80,
  });
  const project = createEditorProject('Looks inspector', source);
  const variation = {
    ...project.variations[0],
    id: 'variation-looks-inspector',
    look: createDefaultLook(lookId, options.seed ?? 7),
  };
  return renderToStaticMarkup(createElement(LooksInspector, {
    variation,
    assetsById: { [source.id]: source },
    imagesById: {},
    coordinator: {} as LookRenderCoordinator,
    dispatch: () => undefined,
    error: options.error ?? null,
    onRetry: () => undefined,
  }));
};

test('Looks inspector renders nine actual selected-state previews and complete commands', () => {
  const markup = renderLooksInspector('distressed-print', {
    error: 'Look preview failed.',
    seed: 19,
  });

  assert.equal(markup.match(/data-look-thumbnail="true"/g)?.length, LOOK_IDS.length);
  assert.equal(markup.match(/<canvas[^>]*data-look-preview="true"/g)?.length, LOOK_IDS.length);
  for (const id of LOOK_IDS) {
    assert.match(markup, new RegExp(`data-look-id="${id}"`));
  }
  assert.match(markup, /data-look-id="distressed-print"[^>]*aria-pressed="true"/);
  assert.match(markup, />Strength</);
  assert.match(markup, /<summary[^>]*>More<\/summary>/);
  assert.match(markup, /aria-label="Reset Look"/);
  assert.match(markup, /aria-label="Reroll texture"/);
  assert.match(markup, /Look preview failed\./);
  assert.match(markup, /aria-label="Retry Look preview"/);
});

test('Look controls expose stable numeric bounds for every documented recipe parameter', () => {
  assert.deepEqual(lookControlBounds, {
    strength: { min: 0, max: 100, step: 1 },
    contrastClean: { min: 0, max: 40, step: 1 },
    saturationClean: { min: -20, max: 40, step: 1 },
    clarity: { min: 0, max: 30, step: 1 },
    contrastHigh: { min: 0, max: 100, step: 1 },
    blackPoint: { min: 0, max: 40, step: 1 },
    saturationHigh: { min: -100, max: 50, step: 1 },
    contrastMonochrome: { min: -50, max: 100, step: 1 },
    brightness: { min: -50, max: 50, step: 1 },
    balance: { min: -50, max: 50, step: 1 },
    levels: { min: 2, max: 8, step: 1 },
    contrastPosterized: { min: 0, max: 100, step: 1 },
    cellSize: { min: 4, max: 32, step: 1 },
    angle: { min: 0, max: 180, step: 1 },
    warmth: { min: 0, max: 100, step: 1 },
    fade: { min: 0, max: 100, step: 1 },
    grain: { min: 0, max: 100, step: 1 },
    wear: { min: 0, max: 100, step: 1 },
    textureScale: { min: 1, max: 12, step: 1 },
    edgeBreakup: { min: 0, max: 100, step: 1 },
  });
  assert.deepEqual(LOOK_IDS.map((lookId) => createDefaultLook(lookId, 77)), [
    { id: 'original', strength: 100 },
    { id: 'clean-photo', strength: 100, contrast: 10, saturation: 8, clarity: 8 },
    { id: 'high-contrast', strength: 100, contrast: 55, blackPoint: 12, saturation: 5 },
    { id: 'monochrome', strength: 100, contrast: 20, brightness: 0 },
    {
      id: 'duotone',
      strength: 100,
      shadowColor: '#111827',
      highlightColor: '#f59e0b',
      balance: 0,
    },
    { id: 'posterized', strength: 100, levels: 4, contrast: 20 },
    {
      id: 'graphic-halftone',
      strength: 100,
      cellSize: 10,
      angle: 45,
      foregroundColor: '#111111',
      background: 'transparent',
      backgroundColor: '#f5f5f3',
    },
    { id: 'vintage-ink', strength: 100, warmth: 45, fade: 25, grain: 20, seed: 77 },
    {
      id: 'distressed-print',
      strength: 100,
      wear: 35,
      textureScale: 5,
      edgeBreakup: 25,
      seed: 77,
    },
  ]);

  const expected: Record<Exclude<LookId, 'original'>, Array<[string, number, number]>> = {
    'clean-photo': [['contrast', 0, 40], ['saturation', -20, 40], ['clarity', 0, 30]],
    'high-contrast': [['contrast', 0, 100], ['black-point', 0, 40], ['saturation', -100, 50]],
    monochrome: [['contrast', -50, 100], ['brightness', -50, 50]],
    duotone: [['balance', -50, 50]],
    posterized: [['levels', 2, 8], ['contrast', 0, 100]],
    'graphic-halftone': [['cell-size', 4, 32], ['angle', 0, 180]],
    'vintage-ink': [['warmth', 0, 100], ['fade', 0, 100], ['grain', 0, 100]],
    'distressed-print': [['wear', 0, 100], ['texture-scale', 1, 12], ['edge-breakup', 0, 100]],
  };

  for (const [lookId, controls] of Object.entries(expected) as Array<[
    Exclude<LookId, 'original'>,
    Array<[string, number, number]>,
  ]>) {
    const markup = renderLooksInspector(lookId);
    assert.match(markup, /id="editor-look-strength"[^>]*type="range"[^>]*min="0"[^>]*max="100"/);
    assert.match(markup, /id="editor-look-strength-number"[^>]*type="number"[^>]*min="0"[^>]*max="100"/);
    for (const [parameter, minimum, maximum] of controls) {
      assert.match(markup, new RegExp(
        `id="editor-look-${parameter}"[^>]*type="range"[^>]*min="${minimum}"[^>]*max="${maximum}"`,
      ));
      assert.match(markup, new RegExp(
        `id="editor-look-${parameter}-number"[^>]*type="number"[^>]*min="${minimum}"[^>]*max="${maximum}"`,
      ));
    }
  }
});

test('Duotone and Halftone expose native swatches and Halftone background modes', () => {
  const duotone = renderLooksInspector('duotone');
  assert.match(duotone, /id="editor-look-shadow-color"[^>]*type="color"[^>]*value="#111827"/);
  assert.match(duotone, /id="editor-look-highlight-color"[^>]*type="color"[^>]*value="#f59e0b"/);

  const halftone = renderLooksInspector('graphic-halftone');
  assert.match(halftone, /id="editor-look-foreground-color"[^>]*type="color"[^>]*value="#111111"/);
  assert.match(halftone, /id="editor-look-background-color"[^>]*type="color"[^>]*value="#f5f5f3"/);
  assert.match(halftone, /aria-label="Transparent background"[^>]*aria-pressed="true"/);
  assert.match(halftone, /aria-label="Solid background"/);
  assert.doesNotMatch(halftone, /aria-label="Reroll texture"/);
});

test('candidate thumbnail recipes use one mount seed for both preview and apply', () => {
  const seeds = [101, 202];
  const candidates = createLookCandidateRecipes(
    createDefaultLook('original'),
    () => seeds.shift()!,
  );

  assert.equal(candidates['vintage-ink'].id, 'vintage-ink');
  assert.equal(candidates['distressed-print'].id, 'distressed-print');
  if (candidates['vintage-ink'].id !== 'vintage-ink' ||
    candidates['distressed-print'].id !== 'distressed-print') {
    throw new Error('Expected seeded candidate recipes.');
  }
  assert.equal(candidates['vintage-ink'].seed, 101);
  assert.equal(candidates['distressed-print'].seed, 202);
});

test('preview eviction removes deleted variations and every variation from a replaced project', () => {
  const projectA = { projectId: 'project-a', variationIds: ['variation-a', 'variation-b'] };
  assert.deepEqual(getVariationPreviewEvictions(projectA, {
    projectId: 'project-a', variationIds: ['variation-b'],
  }), ['variation-a']);
  assert.deepEqual(getVariationPreviewEvictions(projectA, {
    projectId: 'project-b', variationIds: ['variation-c'],
  }), ['variation-a', 'variation-b']);
  assert.deepEqual(getVariationPreviewEvictions(projectA, null), ['variation-a', 'variation-b']);
  assert.deepEqual(getVariationPreviewEvictions(null, projectA), []);
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

test('Looks inspector replaces layer-specific content for a selected text layer', () => {
  const source = createEditorAsset('project-text-looks', new Blob(['source']), {
    name: 'source.png', width: 100, height: 80,
  });
  const project = createEditorProject('Text Looks', source);
  const textLayer = { ...createTextLayer('Headline'), id: 'layer-text-looks' };
  project.variations[0].layers.push(textLayer);
  project.variations[0].selectedLayerId = textLayer.id;
  const markup = renderToStaticMarkup(createElement(EditorInspector, {
    project,
    variation: project.variations[0],
    layer: textLayer,
    tool: 'looks',
    assetsById: { [source.id]: source },
    imagesById: {},
    coordinator: {} as LookRenderCoordinator,
    lookError: null,
    onRetryLook: () => undefined,
    dispatch: () => undefined,
  }));

  assert.match(markup, /<h2[^>]*>Looks<\/h2>/);
  assert.equal(markup.match(/data-look-thumbnail="true"/g)?.length, LOOK_IDS.length);
  assert.doesNotMatch(markup, /<h2[^>]*>Text<\/h2>/);
});

test('font-size draft preserves sequential input and normalizes commit, restore, and layer sync', () => {
  let state = createFontSizeDraftState('text-a', 48);
  state = fontSizeDraftReducer(state, { type: 'input', value: '7' });
  state = fontSizeDraftReducer(state, { type: 'sync', layerId: 'text-a', fontSize: 48 });
  state = fontSizeDraftReducer(state, { type: 'input', value: '72' });
  assert.equal(state.draft, '72');
  assert.equal(normalizeFontSizeDraft(state.draft, state.externalValue), 72);
  assert.equal(normalizeFontSizeDraft('', 48), 48);
  assert.equal(normalizeFontSizeDraft('not-a-number', 48), 48);
  assert.equal(normalizeFontSizeDraft('2', 48), 8);
  assert.equal(normalizeFontSizeDraft('900', 48), 400);

  state = fontSizeDraftReducer(state, { type: 'restore' });
  assert.equal(state.draft, '48');
  state = fontSizeDraftReducer(state, { type: 'input', value: '96' });
  state = fontSizeDraftReducer(state, { type: 'sync', layerId: 'text-b', fontSize: 120 });
  assert.deepEqual(state, { layerId: 'text-b', externalValue: 120, draft: '120' });
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
