import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
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
import {
  controlBounds,
  cropToEdgePercentages,
  edgePercentagesToCrop,
} from '../components/editor/EditorInspector';
import { openProjectFromDrawer } from '../components/editor/EditorApp';
import { createEditorAsset, createEditorProject, createTextLayer } from '../editor/model';
import { createEditorHistory, getSelectedImageLayer, reduceEditorHistory } from '../editor/history';

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

test('image-only inspector follows image selection and stays empty for text selection', () => {
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
