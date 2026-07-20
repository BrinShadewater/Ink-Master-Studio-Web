# Canvas-First Editor Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the default production workflow with a usable local canvas editor that imports raster artwork, performs non-destructive edits, manages variations, and autosaves versioned projects and immutable source blobs.

**Architecture:** A small `editor/` domain owns the project schema, repository, history reducer, and preview geometry. Focused React components consume those interfaces; the canvas renders bounded previews from object URLs while IndexedDB stores source blobs separately from project JSON. The old production modules remain unreferenced during this phase and are deleted only after product export and Print Lens replace their reusable behavior.

**Tech Stack:** React 19, TypeScript 5.8, Vite 8, Tailwind CSS 3, native Canvas 2D, native IndexedDB, Lucide React, Node test runner, Playwright.

## Global Constraints

- The design canvas is the product's center of gravity; the default route must not render a landing page or Guided/Advanced choice.
- Uploaded artwork and projects stay local unless the user explicitly exports a file.
- The uploaded source blob is immutable; edits are stored only as project parameters.
- Project JSON and binary assets are separate IndexedDB records, never data URLs.
- Preview work is bounded to the visible canvas and object URLs are revoked when replaced.
- Phase one accepts PNG, JPEG, and WebP files up to 50 MB; unsafe or unsupported input fails before persistence.
- The active UI contains no production-job, package, proof, approval, operator, profile, batch, or AI terminology.
- Controls must not overlap the artwork at 390 x 844 or supported desktop sizes.
- Existing static informational routes continue to render through `index.tsx`.
- Baseline before implementation: `npm test` passes 253 unit tests and the production build.

---

## File Structure

- `editor/model.ts`: versioned project, variation, layer, adjustment, crop, transform, and asset metadata types plus constructors and migration.
- `editor/projectRepository.ts`: IndexedDB and Node-memory persistence for project JSON and source blobs.
- `editor/history.ts`: immutable editor commands, coalesced history groups, variation isolation, undo, and redo.
- `editor/geometry.ts`: deterministic fit, crop, transform, and pointer-delta calculations.
- `editor/useEditorWorkspace.ts`: project loading, asset URL lifecycle, history dispatch, save state, and debounced autosave.
- `components/editor/EditorApp.tsx`: editor orchestration and empty-canvas import state.
- `components/editor/EditorTopBar.tsx`: project name, save state, variation control, undo/redo, import, and local-project commands.
- `components/editor/EditorToolbar.tsx`: stable desktop tool rail and mobile bottom toolbar.
- `components/editor/EditorCanvas.tsx`: bounded Canvas 2D preview and direct artwork dragging.
- `components/editor/EditorInspector.tsx`: transform, crop, and basic adjustment controls.
- `components/editor/ProjectDrawer.tsx`: local project picker with open and delete actions.
- `tests/editor-model.test.ts`, `tests/editor-repository.test.ts`, `tests/editor-history.test.ts`, `tests/editor-geometry.test.ts`: domain tests.
- `tests/e2e/canvas-editor.spec.ts`: desktop, reload, and mobile acceptance.

### Task 1: Versioned Editor Project Model

**Files:**
- Create: `editor/model.ts`
- Create: `tests/editor-model.test.ts`

**Interfaces:**
- Consumes: browser `Blob`, `crypto.randomUUID`, and millisecond timestamps.
- Produces: `EditorProject`, `EditorAsset`, `DesignVariation`, `ImageLayer`, `createEditorId`, `createEditorAsset`, `createEditorProject`, `duplicateVariation`, and `migrateEditorProject`.

- [ ] **Step 1: Write failing constructor and migration tests**

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createEditorAsset,
  createEditorProject,
  duplicateVariation,
  migrateEditorProject,
} from '../editor/model';

test('creates a project that references but does not embed its source blob', () => {
  const asset = createEditorAsset('project_a', new Blob(['pixels'], { type: 'image/png' }), {
    name: 'still.png', width: 1600, height: 900,
  });
  const project = createEditorProject('Film still', asset);
  assert.equal(project.schemaVersion, 1);
  assert.equal(project.variations[0].layers[0].assetId, asset.id);
  assert.equal('blob' in project.variations[0].layers[0], false);
  assert.equal(asset.blob.size, 6);
});

test('duplicates a variation without sharing nested edit state', () => {
  const asset = createEditorAsset('project_a', new Blob(['x']), {
    name: 'source.webp', width: 800, height: 1200,
  });
  const source = createEditorProject('Poster', asset);
  const duplicate = duplicateVariation(source.variations[0], 'High contrast');
  duplicate.layers[0].transform.x = 0.25;
  assert.equal(source.variations[0].layers[0].transform.x, 0.5);
  assert.notEqual(duplicate.id, source.variations[0].id);
});

test('rejects malformed project records instead of inventing source references', () => {
  assert.throws(
    () => migrateEditorProject({ schemaVersion: 1, id: 'broken', variations: [] }),
    /valid variation/,
  );
});
```

- [ ] **Step 2: Run the tests and verify the missing module failure**

Run: `npx tsx --test tests/editor-model.test.ts`

Expected: FAIL with `Cannot find module '../editor/model'`.

- [ ] **Step 3: Implement the schema and constructors**

Create the following public model in `editor/model.ts`; all numeric normalization stays in this file so UI components cannot persist invalid state.

```ts
export const EDITOR_PROJECT_SCHEMA_VERSION = 1 as const;

export type EditorTool = 'select' | 'crop' | 'adjust';

export interface LayerTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
}

export interface CropRect { x: number; y: number; width: number; height: number }
export interface ImageAdjustments { brightness: number; contrast: number; saturation: number }

export interface ImageLayer {
  id: string;
  type: 'image';
  name: string;
  assetId: string;
  visible: boolean;
  opacity: number;
  transform: LayerTransform;
  crop: CropRect;
  adjustments: ImageAdjustments;
}

export interface DesignVariation {
  id: string;
  name: string;
  layers: ImageLayer[];
  selectedLayerId: string;
}

export interface EditorProject {
  schemaVersion: typeof EDITOR_PROJECT_SCHEMA_VERSION;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  activeVariationId: string;
  variations: DesignVariation[];
  productVariants: [];
}

export interface EditorAsset {
  id: string;
  projectId: string;
  name: string;
  mimeType: string;
  width: number;
  height: number;
  createdAt: number;
  blob: Blob;
}

export const createEditorId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));

export const normalizeTransform = (value: LayerTransform): LayerTransform => ({
  x: clamp(value.x, -2, 3),
  y: clamp(value.y, -2, 3),
  scale: clamp(value.scale, 0.05, 20),
  rotation: clamp(value.rotation, -180, 180),
  flipX: Boolean(value.flipX),
  flipY: Boolean(value.flipY),
});

export const createEditorAsset = (
  projectId: string,
  blob: Blob,
  metadata: { name: string; width: number; height: number },
): EditorAsset => ({
  id: createEditorId('asset'), projectId, name: metadata.name, mimeType: blob.type,
  width: metadata.width, height: metadata.height, createdAt: Date.now(), blob,
});

export const createEditorProject = (name: string, asset: EditorAsset): EditorProject => {
  const timestamp = Date.now();
  const layer: ImageLayer = {
    id: createEditorId('layer'), type: 'image', name: asset.name, assetId: asset.id, visible: true, opacity: 1,
    transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, flipX: false, flipY: false },
    crop: { x: 0, y: 0, width: 1, height: 1 },
    adjustments: { brightness: 0, contrast: 0, saturation: 0 },
  };
  const variation: DesignVariation = { id: createEditorId('variation'), name: 'Original', layers: [layer], selectedLayerId: layer.id };
  return {
    schemaVersion: 1, id: asset.projectId, name: name.trim() || 'Untitled design',
    createdAt: timestamp, updatedAt: timestamp, activeVariationId: variation.id,
    variations: [variation], productVariants: [],
  };
};

export const duplicateVariation = (source: DesignVariation, name: string): DesignVariation => {
  const duplicate = structuredClone(source);
  duplicate.id = createEditorId('variation');
  duplicate.name = name.trim() || `${source.name} copy`;
  duplicate.layers = duplicate.layers.map((layer) => ({ ...layer, id: createEditorId('layer') }));
  duplicate.selectedLayerId = duplicate.layers[0].id;
  return duplicate;
};
```

Implement `migrateEditorProject(value: unknown)` with strict record checks for the project identity, non-empty variations, non-empty image layers, asset IDs, finite timestamps, normalized transforms, crops clamped to `0..1`, opacity clamped to `0..1`, and adjustments clamped to `-100..100`. Throw `Error('Project does not contain a valid variation.')` when no safe variation remains.

- [ ] **Step 4: Run the focused tests**

Run: `npx tsx --test tests/editor-model.test.ts`

Expected: 3 tests PASS.

- [ ] **Step 5: Commit the model**

```bash
git add editor/model.ts tests/editor-model.test.ts
git commit -m "feat: add canvas editor project model"
```

### Task 2: Project And Asset Repository

**Files:**
- Create: `editor/projectRepository.ts`
- Create: `tests/editor-repository.test.ts`

**Interfaces:**
- Consumes: `EditorProject`, `EditorAsset`, and `migrateEditorProject` from Task 1.
- Produces: `saveEditorProject`, `getEditorProject`, `listEditorProjects`, `deleteEditorProject`, `saveEditorAsset`, and `getEditorAsset`.

- [ ] **Step 1: Write failing repository tests**

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEditorAsset, createEditorProject } from '../editor/model';
import {
  deleteEditorProject, getEditorAsset, getEditorProject,
  listEditorProjects, saveEditorAsset, saveEditorProject,
} from '../editor/projectRepository';

test('round-trips project JSON and source blob as separate records', async () => {
  const projectId = `project_${crypto.randomUUID()}`;
  const asset = createEditorAsset(projectId, new Blob(['source'], { type: 'image/png' }), {
    name: 'source.png', width: 1200, height: 800,
  });
  const project = createEditorProject('Local design', asset);
  await saveEditorAsset(asset);
  await saveEditorProject(project);
  assert.equal((await getEditorProject(project.id))?.name, 'Local design');
  assert.equal((await getEditorAsset(asset.id))?.blob.size, 6);
  assert.ok((await listEditorProjects()).some((entry) => entry.id === project.id));
  await deleteEditorProject(project.id);
  assert.equal(await getEditorProject(project.id), null);
  assert.equal(await getEditorAsset(asset.id), null);
});
```

- [ ] **Step 2: Verify the missing repository failure**

Run: `npx tsx --test tests/editor-repository.test.ts`

Expected: FAIL with `Cannot find module '../editor/projectRepository'`.

- [ ] **Step 3: Implement IndexedDB version 2 without altering legacy jobs**

Use database `inkmaster-studio`, version `2`, stores `editor-projects` and `editor-assets`. Keep the existing `jobs` store untouched during upgrade. `editor-projects` uses key path `id` and index `updatedAt`; `editor-assets` uses key path `id` and non-unique index `projectId`.

```ts
const DB_NAME = 'inkmaster-studio';
const DB_VERSION = 2;
const PROJECT_STORE = 'editor-projects';
const ASSET_STORE = 'editor-assets';
const memoryProjects = new Map<string, EditorProject>();
const memoryAssets = new Map<string, EditorAsset>();

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(PROJECT_STORE)) {
      const projects = database.createObjectStore(PROJECT_STORE, { keyPath: 'id' });
      projects.createIndex('updatedAt', 'updatedAt');
    }
    if (!database.objectStoreNames.contains(ASSET_STORE)) {
      const assets = database.createObjectStore(ASSET_STORE, { keyPath: 'id' });
      assets.createIndex('projectId', 'projectId');
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('Could not open editor storage.'));
});
```

For browser transactions, close the database on `transaction.oncomplete`, reject both request and transaction failures, and use one read-write transaction across both stores when deleting a project and all assets returned by the `projectId` index. In Node, use the two memory maps and clone project JSON with `structuredClone`; preserve `Blob` instances.

- [ ] **Step 4: Run repository and model tests**

Run: `npx tsx --test tests/editor-model.test.ts tests/editor-repository.test.ts`

Expected: 4 tests PASS.

- [ ] **Step 5: Commit persistence**

```bash
git add editor/projectRepository.ts tests/editor-repository.test.ts
git commit -m "feat: persist editor projects and assets locally"
```

### Task 3: Undoable Editor Commands And Variation Isolation

**Files:**
- Create: `editor/history.ts`
- Create: `tests/editor-history.test.ts`

**Interfaces:**
- Consumes: `EditorProject`, `LayerTransform`, `CropRect`, `ImageAdjustments`, and `duplicateVariation`.
- Produces: `EditorCommand`, `EditorHistory`, `createEditorHistory`, `reduceEditorHistory`, `getActiveVariation`, and `getSelectedImageLayer`.

- [ ] **Step 1: Write failing history tests**

```ts
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
```

- [ ] **Step 2: Verify the missing history module failure**

Run: `npx tsx --test tests/editor-history.test.ts`

Expected: FAIL with `Cannot find module '../editor/history'`.

- [ ] **Step 3: Implement immutable commands with 100-state history**

```ts
export type EditorCommand =
  | { type: 'rename-project'; name: string }
  | { type: 'select-variation'; variationId: string }
  | { type: 'duplicate-variation'; name: string }
  | { type: 'rename-variation'; variationId: string; name: string }
  | { type: 'set-transform'; layerId: string; transform: LayerTransform; historyGroup?: string }
  | { type: 'set-crop'; layerId: string; crop: CropRect; historyGroup?: string }
  | { type: 'set-adjustments'; layerId: string; adjustments: ImageAdjustments; historyGroup?: string }
  | { type: 'set-opacity'; layerId: string; opacity: number; historyGroup?: string }
  | { type: 'end-history-group' }
  | { type: 'undo' }
  | { type: 'redo' };

export interface EditorHistory {
  past: EditorProject[];
  present: EditorProject;
  future: EditorProject[];
  activeHistoryGroup: string | null;
}

export const createEditorHistory = (project: EditorProject): EditorHistory => ({
  past: [], present: structuredClone(project), future: [], activeHistoryGroup: null,
});
```

Implement commands through a single `updateActiveLayer(project, layerId, update)` helper. Every edit clones the project, increments `updatedAt` strictly with `Math.max(Date.now(), previous + 1)`, clears redo state, and caps `past` at 100. A command with the same non-empty `historyGroup` as `activeHistoryGroup` replaces `present` without pushing another past state. `end-history-group` clears only the group. Undo and redo move cloned project states between arrays.

- [ ] **Step 4: Run model and history tests**

Run: `npx tsx --test tests/editor-model.test.ts tests/editor-history.test.ts`

Expected: 6 tests PASS.

- [ ] **Step 5: Commit history behavior**

```bash
git add editor/history.ts tests/editor-history.test.ts
git commit -m "feat: add variation-scoped editor history"
```

### Task 4: Canvas Geometry And Preview Rendering

**Files:**
- Create: `editor/geometry.ts`
- Create: `tests/editor-geometry.test.ts`
- Create: `components/editor/EditorCanvas.tsx`

**Interfaces:**
- Consumes: active `ImageLayer`, source pixel dimensions, source object URL, selected tool, and transform command callbacks.
- Produces: `fitSourceInViewport`, `getCroppedSourceRect`, `getLayerDrawRect`, `viewportDeltaToNormalized`, `buildCanvasFilter`, and `EditorCanvas`.

- [ ] **Step 1: Write failing deterministic geometry tests**

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildCanvasFilter, fitSourceInViewport, getCroppedSourceRect,
  viewportDeltaToNormalized,
} from '../editor/geometry';

test('fits a landscape source into a portrait work area without cropping', () => {
  assert.deepEqual(fitSourceInViewport({ width: 1600, height: 900 }, { width: 600, height: 800 }), {
    x: 30, y: 231.25, width: 540, height: 303.75,
  });
});

test('converts normalized crop values to source pixels', () => {
  assert.deepEqual(getCroppedSourceRect({ width: 1000, height: 800 }, { x: 0.1, y: 0.2, width: 0.7, height: 0.5 }), {
    x: 100, y: 160, width: 700, height: 400,
  });
});

test('maps pointer movement to stable normalized project movement', () => {
  assert.deepEqual(viewportDeltaToNormalized(54, -27, { width: 540, height: 270 }), { x: 0.1, y: -0.1 });
});

test('builds a Canvas 2D filter from editor adjustment units', () => {
  assert.equal(buildCanvasFilter({ brightness: 20, contrast: -10, saturation: 35 }), 'brightness(120%) contrast(90%) saturate(135%)');
});
```

- [ ] **Step 2: Run geometry tests and verify failure**

Run: `npx tsx --test tests/editor-geometry.test.ts`

Expected: FAIL with `Cannot find module '../editor/geometry'`.

- [ ] **Step 3: Implement geometry with fixed preview padding**

Use 10 percent viewport padding capped at 48 CSS pixels. Round geometry outputs to six decimal places. `getLayerDrawRect` starts from the fitted rect, applies normalized center, uniform scale, and crop aspect ratio; rotation and flips remain Canvas transforms rather than changing the axis-aligned draw rect.

```ts
export interface Size { width: number; height: number }
export interface Rect extends Size { x: number; y: number }

const round = (value: number) => Number(value.toFixed(6));

export const viewportDeltaToNormalized = (dx: number, dy: number, base: Size) => ({
  x: round(dx / base.width), y: round(dy / base.height),
});

export const buildCanvasFilter = (adjustments: ImageAdjustments) =>
  `brightness(${100 + adjustments.brightness}%) contrast(${100 + adjustments.contrast}%) saturate(${100 + adjustments.saturation}%)`;
```

- [ ] **Step 4: Implement bounded Canvas 2D rendering and direct dragging**

`EditorCanvas` uses `ResizeObserver` to set backing dimensions to CSS size times `min(devicePixelRatio, 2)`. It loads one `HTMLImageElement` from the object URL, clears the canvas, paints a neutral checkerless work surface, clips to the canvas bounds, sets `context.filter`, applies center translation/rotation/flips, draws only the cropped source rectangle, then restores state. It never creates a canvas larger than the displayed workspace.

```ts
export interface EditorCanvasProps {
  sourceUrl: string | null;
  sourceSize: Size | null;
  layer: ImageLayer | null;
  tool: EditorTool;
  onTransformChange: (transform: LayerTransform, historyGroup: string) => void;
  onTransformEnd: () => void;
}
```

In `select` mode, pointer down on the rendered artwork captures the pointer and stores the starting transform. Pointer move calls `viewportDeltaToNormalized` against the fitted source rect and emits `historyGroup: 'canvas-drag'`. Pointer up and pointer cancel release capture and call `onTransformEnd`. The canvas has `aria-label="Design canvas"`; an empty canvas remains visible when `sourceUrl` is null.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npx tsx --test tests/editor-geometry.test.ts && npm run typecheck`

Expected: 4 geometry tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit canvas rendering**

```bash
git add editor/geometry.ts components/editor/EditorCanvas.tsx tests/editor-geometry.test.ts
git commit -m "feat: render editable artwork on a bounded canvas"
```

### Task 5: Workspace Hook And Autosave

**Files:**
- Create: `editor/useEditorWorkspace.ts`
- Create: `tests/editor-workspace.test.ts`

**Interfaces:**
- Consumes: repository methods and history reducer from Tasks 2 and 3.
- Produces: `useEditorWorkspace`, `validateRasterImport`, and `readRasterDimensions`.

- [ ] **Step 1: Write failing import validation tests**

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateRasterImport } from '../editor/useEditorWorkspace';

test('accepts supported local raster files through 50 MB', () => {
  assert.equal(validateRasterImport(new File(['x'], 'still.png', { type: 'image/png' })), null);
});

test('rejects unsupported and oversized imports with stable messages', () => {
  assert.equal(
    validateRasterImport(new File(['x'], 'art.svg', { type: 'image/svg+xml' })),
    'Choose a PNG, JPEG, or WebP image.',
  );
  const oversized = new File([new Uint8Array(50 * 1024 * 1024 + 1)], 'huge.webp', { type: 'image/webp' });
  assert.equal(validateRasterImport(oversized), 'Choose an image no larger than 50 MB.');
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npx tsx --test tests/editor-workspace.test.ts`

Expected: FAIL with `Cannot find module '../editor/useEditorWorkspace'`.

- [ ] **Step 3: Implement import, project loading, and URL lifecycle**

```ts
export type SaveStatus = 'saved' | 'saving' | 'error';

export interface EditorWorkspace {
  history: EditorHistory | null;
  projects: EditorProject[];
  sourceAsset: EditorAsset | null;
  sourceUrl: string | null;
  saveStatus: SaveStatus;
  error: string | null;
  dispatch: (command: EditorCommand) => void;
  importFile: (file: File) => Promise<void>;
  openProject: (projectId: string) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  refreshProjects: () => Promise<void>;
}

export const validateRasterImport = (file: File): string | null => {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return 'Choose a PNG, JPEG, or WebP image.';
  if (file.size > 50 * 1024 * 1024) return 'Choose an image no larger than 50 MB.';
  return null;
};

export const readRasterDimensions = async (file: File) => {
  const bitmap = await createImageBitmap(file);
  const dimensions = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  if (dimensions.width < 1 || dimensions.height < 1) throw new Error('The image has invalid dimensions.');
  return dimensions;
};
```

`useEditorWorkspace` stores `EditorHistory | null` in `useState`. Its stable `dispatch` callback calls `setHistory((current) => current ? reduceEditorHistory(current, command) : current)`, while import and open operations replace state with `createEditorHistory(project)`. Import calls `createEditorId('project')`, reads dimensions, creates and saves the asset, creates and saves the project using the filename without its final extension, then selects it. `sourceUrl` is created from the loaded asset blob and revoked in effect cleanup. Autosave waits 350 ms after `history.present.updatedAt` changes, sets `saving`, persists the project, refreshes the project list, then sets `saved`; a rejected save sets `error` and leaves the current in-memory edit intact.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx tsx --test tests/editor-workspace.test.ts && npm run typecheck`

Expected: 2 import tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit workspace behavior**

```bash
git add editor/useEditorWorkspace.ts tests/editor-workspace.test.ts
git commit -m "feat: add local editor workspace and autosave"
```

### Task 6: Responsive Editor Shell And Controls

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `components/editor/EditorTopBar.tsx`
- Create: `components/editor/EditorToolbar.tsx`
- Create: `components/editor/EditorInspector.tsx`
- Create: `components/editor/ProjectDrawer.tsx`
- Create: `components/editor/EditorApp.tsx`

**Interfaces:**
- Consumes: `EditorWorkspace`, active variation/layer selectors, `EditorCanvas`, and Lucide icons.
- Produces: a complete phase-one editor route with desktop rails and mobile bottom controls.

- [ ] **Step 1: Install the icon dependency**

Run: `npm install lucide-react@^1.25.0`

Expected: `package.json` and `package-lock.json` include `lucide-react`; install exits 0.

- [ ] **Step 2: Build the top bar and tool selector**

`EditorTopBar` receives the following exact contract:

```ts
interface EditorTopBarProps {
  projectName: string;
  variationName: string;
  variations: Array<{ id: string; name: string }>;
  saveStatus: SaveStatus;
  canUndo: boolean;
  canRedo: boolean;
  onProjectNameChange: (name: string) => void;
  onVariationChange: (id: string) => void;
  onDuplicateVariation: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onImport: () => void;
  onOpenProjects: () => void;
}
```

Use `Undo2`, `Redo2`, `Upload`, `FolderOpen`, and `CopyPlus` icons. Icon-only buttons have `aria-label`, native `title`, a stable 40 x 40 pixel box, and disabled state. The project name is an inline text input; save text is exactly `Saved locally`, `Saving locally`, or `Local save failed`. Variation selection is a labeled native select and duplicate is an icon button.

`EditorToolbar` receives `tool`, `onToolChange`, and renders `MousePointer2`, `Crop`, and `SlidersHorizontal` buttons. It is a left vertical rail above 768 px and a fixed-height bottom toolbar below 768 px.

- [ ] **Step 3: Build the contextual inspector**

`EditorInspector` renders only the active tool's controls. Every range has a visible label, numeric output, and stable bounds:

```ts
const controlBounds = {
  scale: { min: 5, max: 400, step: 1 },
  rotation: { min: -180, max: 180, step: 1 },
  crop: { min: 0, max: 45, step: 1 },
  adjustment: { min: -100, max: 100, step: 1 },
  opacity: { min: 0, max: 100, step: 1 },
} as const;
```

Select controls update scale, rotation, flip, and opacity. Crop controls convert left/top/right/bottom percentages into a valid normalized `CropRect` whose width and height never fall below 0.05. Adjustment controls update brightness, contrast, and saturation. Each slider uses a stable history group and sends `end-history-group` on pointer up, key up, and blur. Reset commands write the model defaults explicitly.

- [ ] **Step 4: Build the project drawer**

`ProjectDrawer` is a modal drawer with `role="dialog"`, `aria-modal="true"`, heading `Local projects`, newest-first buttons showing project name and last-updated date, and one trash icon per project. Deletion requires a native confirmation containing the project name. Escape and the `X` icon close the drawer; focus returns to the opener.

- [ ] **Step 5: Assemble the editor as the first screen**

`EditorApp` always renders the work surface. Before import, the central canvas contains a compact file drop target labeled `Import artwork`, not a marketing hero. The hidden file input accepts `.png,.jpg,.jpeg,.webp`. Drag/drop and the top-bar import command call the same `workspace.importFile` path.

```tsx
export const EditorApp = () => {
  const workspace = useEditorWorkspace();
  const [tool, setTool] = useState<EditorTool>('select');
  const [projectsOpen, setProjectsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const project = workspace.history?.present ?? null;
  const variation = project ? getActiveVariation(project) : null;
  const layer = project ? getSelectedImageLayer(project) : null;

  return (
    <main className="grid h-dvh min-w-0 grid-rows-[56px_minmax(0,1fr)] overflow-hidden bg-neutral-950 text-neutral-100">
      <EditorTopBar
        projectName={project?.name ?? 'Untitled design'}
        variationName={variation?.name ?? 'Original'}
        variations={project?.variations.map(({ id, name }) => ({ id, name })) ?? []}
        saveStatus={workspace.saveStatus}
        canUndo={Boolean(workspace.history?.past.length)}
        canRedo={Boolean(workspace.history?.future.length)}
        onProjectNameChange={(name) => workspace.dispatch({ type: 'rename-project', name })}
        onVariationChange={(variationId) => workspace.dispatch({ type: 'select-variation', variationId })}
        onDuplicateVariation={() => workspace.dispatch({ type: 'duplicate-variation', name: `${variation?.name ?? 'Variation'} copy` })}
        onUndo={() => workspace.dispatch({ type: 'undo' })}
        onRedo={() => workspace.dispatch({ type: 'redo' })}
        onImport={() => fileInputRef.current?.click()}
        onOpenProjects={() => setProjectsOpen(true)}
      />
      <section className="grid min-h-0 grid-cols-1 md:grid-cols-[52px_minmax(0,1fr)_280px]">
        <EditorToolbar tool={tool} onToolChange={setTool} />
        <EditorCanvas
          sourceUrl={workspace.sourceUrl}
          sourceSize={workspace.sourceAsset}
          layer={layer}
          tool={tool}
          onTransformChange={(transform, historyGroup) => workspace.dispatch({ type: 'set-transform', layerId: layer!.id, transform, historyGroup })}
          onTransformEnd={() => workspace.dispatch({ type: 'end-history-group' })}
        />
        <EditorInspector project={project} layer={layer} tool={tool} dispatch={workspace.dispatch} />
      </section>
      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        accept=".png,.jpg,.jpeg,.webp"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void workspace.importFile(file);
          event.currentTarget.value = '';
        }}
      />
      <ProjectDrawer
        open={projectsOpen}
        projects={workspace.projects}
        onClose={() => setProjectsOpen(false)}
        onOpen={async (projectId) => {
          await workspace.openProject(projectId);
          setProjectsOpen(false);
        }}
        onDelete={workspace.deleteProject}
      />
    </main>
  );
};
```

Add keyboard handlers for `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, and `Ctrl/Cmd+Y`; ignore events originating from input, select, or textarea elements. Errors appear in an `aria-live="polite"` status region and never replace the canvas.

- [ ] **Step 6: Run typecheck and build**

Run: `npm run typecheck && npm run build`

Expected: both commands exit 0.

- [ ] **Step 7: Commit the editor shell**

```bash
git add package.json package-lock.json components/editor
git commit -m "feat: build responsive canvas editor shell"
```

### Task 7: Switch The Default App And Replace Acceptance Coverage

**Files:**
- Replace: `App.tsx`
- Modify: `index.html`
- Delete: `tests/e2e/creator-flow.spec.ts`
- Create: `tests/e2e/canvas-editor.spec.ts`
- Modify: `tests/static-pages.test.ts`

**Interfaces:**
- Consumes: `EditorApp` and the existing static-route behavior in `index.tsx`.
- Produces: the canvas-first default application and phase-one browser acceptance.

- [ ] **Step 1: Write the new browser acceptance flow**

Create a PNG fixture in-browser as the current suite does, then cover the new contract:

```ts
test('imports, edits, duplicates, autosaves, reloads, and reopens a local project', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Design canvas')).toBeVisible();
  await uploadFixture(page, 1600, 900, 'film-still.png');
  await expect(page.getByDisplayValue('film-still')).toBeVisible();
  await page.getByRole('button', { name: 'Adjust' }).click();
  await page.getByLabel('Contrast').fill('25');
  await page.getByRole('button', { name: 'Duplicate variation' }).click();
  await expect(page.getByLabel('Variation').locator('option:checked')).toHaveText('Original copy');
  await expect(page.getByText('Saved locally')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Open local projects' }).click();
  await page.getByRole('button', { name: /film-still/ }).click();
  await expect(page.getByLabel('Contrast')).toHaveValue('25');
  await expect(page.getByLabel('Design canvas')).toBeVisible();
});

test('keeps the editor usable at 390 by 844', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await uploadFixture(page, 900, 1200, 'mobile.png');
  await expect(page.getByRole('button', { name: 'Select' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Crop' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adjust' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
});

test('does not expose the retired workflow surface', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/Advanced mode|Production package|Customer proof|AI cleanup/i)).toHaveCount(0);
});
```

The saved project must reopen with the duplicate variation selected and contrast value `25`.

- [ ] **Step 2: Verify acceptance fails against the old app**

Run: `npx playwright test tests/e2e/canvas-editor.spec.ts`

Expected: FAIL because `Design canvas` is absent.

- [ ] **Step 3: Replace the default app entry**

```tsx
import { EditorApp } from './components/editor/EditorApp';

const App = () => <EditorApp />;

export default App;
```

Do not delete old components or services in this phase. With their imports removed from `App.tsx`, Vite must exclude them from the default bundle.

- [ ] **Step 4: Update public metadata to match the editor**

Set the document title to `InkMaster Studio | Canvas-First Merch Editor`. Describe local source remixing and print-aware product preparation without mentioning Advanced mode or AI. Update JSON-LD `featureList` to `Canvas image remixing`, `Non-destructive design variations`, `Local project storage`, `Product-specific placement`, and `Validated print export`. Keep the existing canonical URL, organization, static fallback, and social image.

Replace the current marketing fallback inside `#root` with an empty dark `main` element labeled `Loading InkMaster Studio`; JavaScript-disabled users must not see the retired drop/pick/download or Advanced workflow copy.

Update `tests/static-pages.test.ts` so metadata assertions require `Canvas-First Merch Editor` and reject `Advanced workflow tools`.

- [ ] **Step 5: Run the complete verification suite**

Run: `npm test`

Expected: typecheck, production build, all retained tests, and all new editor unit tests PASS.

Run: `npx playwright test tests/e2e/canvas-editor.spec.ts`

Expected: desktop, persistence, mobile, and retired-surface tests PASS.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 6: Inspect the production bundle boundary**

Run: `rg -n -g 'index-*.js' "gemini|ProductionPackage|CustomerProof|Advanced mode" dist/assets/js`

Expected: no matches in the default application chunk. Separate unreferenced source files may still exist until phase four.

- [ ] **Step 7: Commit phase one**

```bash
git add App.tsx index.html tests/static-pages.test.ts tests/e2e/canvas-editor.spec.ts
git add -u tests/e2e/creator-flow.spec.ts
git commit -m "feat: make the canvas editor the default experience"
```

## Phase-One Completion Gate

- [ ] Run `npm test` and confirm every retained and new unit test passes.
- [ ] Run `npm run test:e2e` after removing the obsolete creator flow and confirm the new canvas editor suite passes.
- [ ] Capture Playwright screenshots at 1440 x 900 and 390 x 844; verify the canvas remains visible, controls do not overlap, labels fit, and the mobile bottom toolbar has stable dimensions.
- [ ] Confirm import, edit, duplicate, undo, redo, autosave, reload, reopen, delete, and object URL cleanup behavior manually.
- [ ] Confirm static pages still render and the default route contains no production-workbench or AI controls.
- [ ] Record the baseline and final bundle sizes in the implementation summary; phase one must remove the AI/PDF/batch chunks from the default route even though source retirement occurs in phase four.
