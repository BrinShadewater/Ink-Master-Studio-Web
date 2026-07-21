import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  EditorTopBar,
  createProjectNameDraftState,
  normalizeProjectNameDraft,
  projectNameDraftReducer,
  type EditorTopBarProps,
} from '../components/editor/EditorTopBar';
import {
  controlBounds,
  cropToEdgePercentages,
  edgePercentagesToCrop,
} from '../components/editor/EditorInspector';
import { openProjectFromDrawer } from '../components/editor/EditorApp';

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
  onDuplicateVariation: () => undefined,
  onUndo: () => undefined,
  onRedo: () => undefined,
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

test('inspector controls keep deterministic bounds and normalized crop dimensions', () => {
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
