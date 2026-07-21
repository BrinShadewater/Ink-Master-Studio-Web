# Phase 2A Creative Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an owner compose a merch design from multiple raster images and editable text layers, manage their order and visibility, and reopen the project without losing source fidelity or phase-one behavior.

**Architecture:** Upgrade editor projects to schema version 2 with explicit immutable source metadata and a discriminated `DesignLayer` union. Keep binary assets in the existing IndexedDB asset store, expose them through a project-scoped asset/URL registry, and render ordered layers through a shared compositor used by the interactive canvas. Layer mutations remain variation-scoped and undoable, while selection remains persisted but does not enter undo history.

**Tech Stack:** React 19, TypeScript 5.8, Canvas 2D, IndexedDB, Vite 8, Node test runner, Playwright, Tailwind CSS, Lucide React.

## Global Constraints

- The default route remains the usable canvas editor; no landing page, mode picker, AI control, or production-workbench route returns.
- Uploaded blobs are immutable and stay local. Layer duplication reuses an asset ID; it never copies or rewrites the blob.
- Existing schema-version-1 phase-one projects must open through a deterministic schema-version-2 migration using their stored source asset metadata.
- Layer arrays are stored bottom-to-top. The canvas draws from index `0` upward; the layer panel displays the reversed order.
- A variation always retains at least one layer. The final layer cannot be deleted, but it may be hidden.
- Undo and redo remain scoped to the active variation. Selecting a layer must not create history or cause undo to change an otherwise valid selection.
- Image-only tools are disabled for text layers. Transform and opacity controls work for both image and text layers.
- Text is rendered from stored parameters and remains editable; phase 2A does not flatten text into a raster asset.
- All new icon buttons have Lucide icons, accessible names, tooltips, keyboard focus states, and at least a 24 by 24 pixel hit target.
- Desktop and 390 by 844 mobile layouts must remain non-overlapping and keep the canvas visible when layer controls open.
- Phase 2A includes image and text layers only. Looks, Compare Board, trace, SVG export, product variants, Print Lens, and AI remain outside this plan.

---

### Task 1: Schema Version 2 And Legacy Migration

**Files:**
- Modify: `editor/model.ts`
- Modify: `editor/projectRepository.ts`
- Test: `tests/editor-model.test.ts`
- Test: `tests/editor-repository.test.ts`

**Interfaces:**
- Produces: `SourceMetadata`, `TextLayer`, `DesignLayer`, `isImageLayer`, `isTextLayer`, `createTextLayer`, and `migrateEditorProject(value, assets)`.
- Produces: `getEditorAssetsForProject(projectId)` for migration and workspace hydration.
- Preserves: `createEditorProject(name, asset)`, `createEditorAsset(projectId, blob, metadata)`, and immutable asset insertion.

- [ ] **Step 1: Write failing model tests for schema 2**

Add assertions covering this public shape:

```ts
export const EDITOR_PROJECT_SCHEMA_VERSION = 2 as const;

export interface SourceMetadata {
  name: string;
  mimeType: string;
  width: number;
  height: number;
}

export interface TextLayer {
  id: string;
  type: 'text';
  name: string;
  visible: boolean;
  opacity: number;
  transform: LayerTransform;
  text: string;
  fontFamily: 'Arial' | 'Georgia' | 'Impact' | 'Trebuchet MS';
  fontSize: number;
  color: string;
  align: 'left' | 'center' | 'right';
  letterSpacing: number;
  outlineWidth: number;
  outlineColor: string;
}

export type DesignLayer = ImageLayer | TextLayer;
```

The tests must prove that new projects store `sourceAssetId` and `sourceMetadata`, text values are clamped and normalized, and a legacy version-1 record is upgraded using the matching `EditorAsset` without changing its image layer ID or asset ID.

- [ ] **Step 2: Run the focused model tests and confirm the red state**

Run: `npx tsx --test tests/editor-model.test.ts`

Expected: failure because schema 2, text layers, and legacy asset-assisted migration do not exist.

- [ ] **Step 3: Implement the schema and pure migration**

Use these invariants in `editor/model.ts`:

```ts
export interface EditorProject {
  schemaVersion: 2;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  sourceAssetId: string;
  sourceMetadata: SourceMetadata;
  activeVariationId: string;
  variations: DesignVariation[];
  productVariants: [];
}

export interface DesignVariation {
  id: string;
  name: string;
  layers: DesignLayer[];
  selectedLayerId: string;
}
```

`migrateEditorProject(value, assets)` accepts schema 1 or 2. For schema 1, find the first valid image layer, require a matching asset, populate source fields from that asset, normalize every valid image layer, and return schema 2. For schema 2, require a valid `sourceAssetId`, normalized metadata, at least one valid image or text layer per retained variation, and a valid selected-layer fallback. Reject missing source assets with `Project source image not found.` rather than inventing dimensions.

- [ ] **Step 4: Write failing repository migration tests**

Persist a raw schema-1 project plus its asset directly into the fake IndexedDB stores, then assert that `getEditorProject` and `listEditorProjects` return schema 2 with complete source metadata. Add a missing-asset case that rejects with the stable source-image error.

- [ ] **Step 5: Add project asset lookup and repository hydration**

Add:

```ts
export const getEditorAssetsForProject = async (projectId: string): Promise<EditorAsset[]>;
```

For IndexedDB, query the existing `projectId` index. For memory storage, filter and clone matching assets. `getEditorProject` and `listEditorProjects` must hydrate raw records with their project assets before calling `migrateEditorProject`. `saveEditorProject` accepts only a normalized schema-2 project and does not rewrite asset blobs.

- [ ] **Step 6: Run focused tests and commit**

Run: `npx tsx --test tests/editor-model.test.ts tests/editor-repository.test.ts`

Expected: all focused tests pass.

Commit: `feat: migrate editor projects to layered schema`

---

### Task 2: Variation-Scoped Layer Commands And Selection-Safe History

**Files:**
- Modify: `editor/model.ts`
- Modify: `editor/history.ts`
- Test: `tests/editor-model.test.ts`
- Test: `tests/editor-history.test.ts`

**Interfaces:**
- Consumes: schema-2 `DesignLayer` from Task 1.
- Produces: `getSelectedLayer`, `getSelectedImageLayer`, `getSelectedTextLayer`, and complete layer commands.
- Preserves: independent history stacks per variation and 100-state cap.

- [ ] **Step 1: Write failing layer-command tests**

Cover the following command union additions:

```ts
| { type: 'select-layer'; layerId: string }
| { type: 'add-image-layer'; layer: ImageLayer }
| { type: 'add-text-layer'; layer: TextLayer }
| { type: 'rename-layer'; layerId: string; name: string }
| { type: 'duplicate-layer'; layerId: string }
| { type: 'delete-layer'; layerId: string }
| { type: 'move-layer'; layerId: string; direction: 'up' | 'down' }
| { type: 'set-layer-visibility'; layerId: string; visible: boolean }
| { type: 'set-text-content'; layerId: string; text: string; historyGroup?: string }
| { type: 'set-text-style'; layerId: string; style: TextLayerStyle; historyGroup?: string }
```

Prove that add, duplicate, delete, move, visibility, text, transform, and opacity edits are undoable; duplication assigns a fresh layer ID but reuses an image asset ID; moving at an edge is a no-op; deleting the final layer is a no-op; and selecting a layer creates no past state.

- [ ] **Step 2: Run the history tests and confirm the red state**

Run: `npx tsx --test tests/editor-history.test.ts`

Expected: failure because generalized layer commands do not exist.

- [ ] **Step 3: Generalize layer access and mutation**

Replace image-only helpers with:

```ts
export const getSelectedLayer = (project: EditorProject): DesignLayer;
export const getSelectedImageLayer = (project: EditorProject): ImageLayer | null;
export const getSelectedTextLayer = (project: EditorProject): TextLayer | null;
```

Use discriminant guards before applying crop or image adjustments. Transform, opacity, name, visibility, ordering, duplication, and deletion operate on `DesignLayer`.

- [ ] **Step 4: Make history selection-safe**

Store only `layers` in `VariationEditState`. When restoring an undo or redo state, preserve the current `selectedLayerId` if that layer still exists; otherwise select the topmost restored layer. `select-layer` updates the persisted project and `updatedAt` without calling `recordVariationEdit`.

- [ ] **Step 5: Implement normalized text mutations**

`set-text-content` limits content to 500 characters and preserves line breaks. `set-text-style` normalizes font family to the approved set, font size to 8 through 400, colors to six-digit hex strings, alignment to the approved values, letter spacing to -2 through 40 pixels, and outline width to 0 through 20 pixels.

- [ ] **Step 6: Run focused tests and commit**

Run: `npx tsx --test tests/editor-model.test.ts tests/editor-history.test.ts`

Expected: all focused tests pass.

Commit: `feat: add ordered image and text layer commands`

---

### Task 3: Multi-Asset Workspace And Additional Image Import

**Files:**
- Modify: `editor/projectRepository.ts`
- Modify: `editor/useEditorWorkspace.ts`
- Test: `tests/editor-repository.test.ts`
- Test: `tests/editor-workspace.test.ts`

**Interfaces:**
- Consumes: `getEditorAssetsForProject` and `add-image-layer`.
- Produces: `assetsById`, `assetUrlsById`, `importLayerFile(file)`, and `deleteEditorAsset(assetId)`.
- Replaces: single `sourceAsset` and `sourceUrl` workspace state.

- [ ] **Step 1: Write failing asset-registry and import-race tests**

Test a registry with this contract:

```ts
export class AssetUrlRegistry {
  sync(assets: Iterable<EditorAsset>): Record<string, string>;
  dispose(): void;
}
```

Prove it creates one URL per asset ID, reuses URLs for unchanged immutable assets, revokes removed URLs exactly once, and revokes everything on disposal. Add workspace dependency tests proving a secondary image import validates type, size, and decoded dimensions; persists the asset before dispatching its layer; cleans up a stale or failed persisted asset; and never replaces the active project.

- [ ] **Step 2: Run focused workspace tests and confirm the red state**

Run: `npx tsx --test tests/editor-workspace.test.ts tests/editor-repository.test.ts`

Expected: failure because project-scoped asset hydration and secondary import do not exist.

- [ ] **Step 3: Add individual asset cleanup**

Implement:

```ts
export const deleteEditorAsset = async (assetId: string): Promise<void>;
```

Delete only the specified asset from memory or IndexedDB. Do not delete project data or other assets.

- [ ] **Step 4: Replace single-source workspace state**

Expose:

```ts
interface EditorWorkspace {
  history: EditorHistory | null;
  projects: EditorProject[];
  assetsById: Record<string, EditorAsset>;
  assetUrlsById: Record<string, string>;
  importFile(file: File): Promise<void>;
  importLayerFile(file: File): Promise<void>;
  // existing save/open/delete methods remain
}
```

Opening or creating a project loads every project asset, validates that every image layer resolves to an asset, and synchronizes `AssetUrlRegistry`. Clearing, deleting, switching, or unmounting releases the registry URLs.

- [ ] **Step 5: Implement safe additional-image import**

Capture the active project ID before decoding. Create and persist an asset for that project, then recheck that the same project is active before dispatching a normalized image layer above the current top layer. On decode, persistence, stale-project, or dispatch failure, call `deleteEditorAsset` for a persisted orphan and surface one stable error. Keep the immutable source fields unchanged.

- [ ] **Step 6: Run focused tests and commit**

Run: `npx tsx --test tests/editor-workspace.test.ts tests/editor-repository.test.ts`

Expected: all focused tests pass.

Commit: `feat: hydrate and import multiple editor assets`

---

### Task 4: Shared Ordered-Layer Canvas Compositor

**Files:**
- Create: `editor/compositor.ts`
- Modify: `components/editor/EditorCanvas.tsx`
- Modify: `editor/geometry.ts`
- Test: `tests/editor-compositor.test.ts`
- Test: `tests/editor-geometry.test.ts`

**Interfaces:**
- Consumes: ordered `DesignLayer[]`, asset metadata, and asset URLs.
- Produces: `renderDesignLayers`, `hitTestDesignLayers`, `getTextLayerBounds`, and an interactive multi-layer canvas.
- Preserves: viewport-normalized drag behavior and source URL ownership.

- [ ] **Step 1: Write failing pure compositor tests**

Use a recording Canvas 2D test double to prove image layers draw bottom-to-top with their own crop, transform, opacity, and adjustments; hidden layers do not draw; text layers apply font, alignment, fill, outline, opacity, rotation, flip, and deterministic letter spacing; and hit testing checks visible layers from top-to-bottom.

- [ ] **Step 2: Run compositor tests and confirm the red state**

Run: `npx tsx --test tests/editor-compositor.test.ts tests/editor-geometry.test.ts`

Expected: failure because the compositor module does not exist.

- [ ] **Step 3: Implement deterministic text measurement and drawing**

`getTextLayerBounds` measures every line, includes letter spacing and outline width, and returns a rectangle centered on the layer transform. `renderDesignLayers` draws multi-line text line by line and applies explicit per-character spacing instead of depending on browser-specific `CanvasRenderingContext2D.letterSpacing` behavior.

- [ ] **Step 4: Implement image and text composition**

Define:

```ts
export interface CompositorAssets {
  metadataById: Record<string, Size>;
  imagesById: Record<string, CanvasImageSource>;
}

export const renderDesignLayers = (
  context: CanvasRenderingContext2D,
  viewport: Size,
  layers: DesignLayer[],
  assets: CompositorAssets,
): void;
```

Every layer uses the same transform convention. Image geometry continues to use `getLayerDrawRect`; text size is converted against the bounded preview viewport without changing stored font-size units.

- [ ] **Step 5: Update `EditorCanvas` for decoded asset maps and selection**

Pass `layers`, `selectedLayerId`, `assetsById`, and `assetUrlsById`. Decode each URL once per URL value, ignore stale callbacks, and never revoke borrowed URLs. On select-tool pointer down, hit-test topmost visible content, dispatch selection, and start drag from that layer's transform. Blank-canvas clicks leave selection unchanged.

- [ ] **Step 6: Run focused tests and commit**

Run: `npx tsx --test tests/editor-compositor.test.ts tests/editor-geometry.test.ts`

Expected: all focused tests pass.

Commit: `feat: render and select ordered design layers`

---

### Task 5: Layer Panel And Responsive Layer Management

**Files:**
- Create: `components/editor/LayerPanel.tsx`
- Modify: `components/editor/EditorApp.tsx`
- Modify: `components/editor/EditorToolbar.tsx`
- Test: `tests/editor-shell.test.ts`

**Interfaces:**
- Consumes: active variation, selected layer, layer commands, and `importLayerFile`.
- Produces: always-visible desktop layer panel and full-height mobile layer drawer.
- Preserves: stable mobile toolbar dimensions and central canvas priority.

- [ ] **Step 1: Write failing static UI tests**

Render the panel and assert accessible controls for `Add image`, `Add text`, `Show layer` or `Hide layer`, `Move layer up`, `Move layer down`, `Duplicate layer`, and `Delete layer`. Assert edge move buttons and final-layer deletion are disabled. Assert rows use layer IDs as selection values even when names match.

- [ ] **Step 2: Run shell tests and confirm the red state**

Run: `npx tsx --test tests/editor-shell.test.ts`

Expected: failure because the panel and layer actions do not exist.

- [ ] **Step 3: Build the layer panel**

Display rows topmost-first while dispatching against the stored bottom-to-top array. Each row contains a type icon, editable name, visibility icon, and selected state. Put ordering, duplicate, and delete commands in a compact action strip for the selected row. Use Lucide `ImagePlus`, `Type`, `Eye`, `EyeOff`, `ArrowUp`, `ArrowDown`, `Copy`, and `Trash2` icons with tooltips.

- [ ] **Step 4: Integrate desktop and mobile layouts**

On desktop, split the 280-pixel right rail into a bounded layer panel above a flexible inspector without nesting decorative cards. On mobile, add a `Layers` toolbar command that opens a fixed full-height drawer above the canvas and returns focus to the toolbar button on close. Opening or closing the drawer must not resize the canvas.

- [ ] **Step 5: Wire image and text creation**

`Add image` activates a dedicated hidden raster input and calls `workspace.importLayerFile`. `Add text` dispatches `add-text-layer` with `createTextLayer('Text')`, selects it, closes the mobile drawer, and switches to the select tool. Selecting a text layer while crop or adjust is active switches to select.

- [ ] **Step 6: Run focused tests and commit**

Run: `npx tsx --test tests/editor-shell.test.ts`

Expected: all focused tests pass.

Commit: `feat: add responsive layer management`

---

### Task 6: Image And Text Inspectors

**Files:**
- Create: `components/editor/TransformControls.tsx`
- Create: `components/editor/TextInspector.tsx`
- Modify: `components/editor/EditorInspector.tsx`
- Modify: `components/editor/EditorToolbar.tsx`
- Test: `tests/editor-shell.test.ts`
- Test: `tests/editor-history.test.ts`

**Interfaces:**
- Consumes: discriminated selected layer and normalized text commands.
- Produces: shared transform/opacity controls plus complete phase-2A text editing.
- Preserves: crop and adjustments for image layers only.

- [ ] **Step 1: Write failing inspector tests**

Assert that a selected text layer exposes content, font, size, color, alignment, letter spacing, outline width, outline color, opacity, position, scale, rotation, and flip controls. Assert crop and image-adjust tools are disabled for text. Assert image layers retain all phase-one controls.

- [ ] **Step 2: Run shell and history tests and confirm the red state**

Run: `npx tsx --test tests/editor-shell.test.ts tests/editor-history.test.ts`

Expected: failure because text controls and shared transform controls do not exist.

- [ ] **Step 3: Extract transform controls without changing behavior**

Move X, Y, scale, rotation, opacity, and flip controls into `TransformControls`. Keep the existing bounds, history-group endings, reset values, IDs for phase-one controls, and keyboard behavior.

- [ ] **Step 4: Build the text inspector**

Use a textarea for content, a select for the four allowed fonts, numeric/range inputs for size and spacing, native color swatches for fill and outline, a three-option segmented alignment control with Lucide alignment icons, and shared transform controls. Content editing uses one history group until blur; continuous sliders coalesce as in phase one.

- [ ] **Step 5: Gate image-only tools**

When text is selected, the crop and adjust toolbar buttons are disabled with an accessible explanation. The inspector title is `Text` and does not render image-only controls. When an image is selected, existing `Transform`, `Crop`, and `Adjustments` behavior remains unchanged.

- [ ] **Step 6: Run focused tests and commit**

Run: `npx tsx --test tests/editor-shell.test.ts tests/editor-history.test.ts`

Expected: all focused tests pass.

Commit: `feat: add editable text layer controls`

---

### Task 7: Persistence Acceptance, Mobile Verification, And Staging Deployment

**Files:**
- Modify: `tests/e2e/canvas-editor.spec.ts`
- Modify: `tests/editor-bundle-boundary.test.ts` only if the intentional editor vocabulary changes require it
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: complete Phase 2A editor.
- Produces: browser acceptance evidence, final screenshots, and a protected Vercel preview URL.

- [ ] **Step 1: Write the failing end-to-end composition flow**

Add one desktop test that imports a base raster, adds a second raster, adds and styles text, reorders and hides layers, duplicates a layer, verifies topmost direct selection and dragging, exercises undo/redo, waits for IndexedDB persistence, reloads, reopens the project, and verifies equivalent layer order, values, and canvas state.

- [ ] **Step 2: Write the failing mobile layer flow**

At 390 by 844, open the layer drawer, add text, reorder it, close the drawer, edit text in the bottom inspector, and assert the canvas remains visible without overlapping controls. Capture:

```text
test-results/phase-2a/desktop-layers-1440x900.png
test-results/phase-2a/mobile-layers-390x844.png
```

- [ ] **Step 3: Run the new E2E tests and confirm the red state**

Run: `npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "composes ordered image and text layers|manages layers on mobile"`

Expected: failure before the Phase 2A UI is integrated, then success after Tasks 1 through 6.

- [ ] **Step 4: Run complete verification**

Run: `npm run verify`

Expected: typecheck, production build, all unit/style tests, and all Playwright tests pass.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 5: Inspect desktop and mobile screenshots**

Verify the canvas is nonblank, image and text layers are visible in correct order, selected controls match selected layers, all text fits, mobile drawers do not resize or cover the canvas incoherently, and icon targets remain usable.

- [ ] **Step 6: Update progress and commit**

Record task commit ranges, focused test results, full verification counts, and any accurately disclosed historical red-test evidence gap in `.superpowers/sdd/progress.md`.

Commit: `test: verify phase 2a creative layers`

- [ ] **Step 7: Deploy and smoke-test a protected Vercel preview**

Run: `npx vercel deploy --yes`

Do not use `--prod`. Record the deployment ID and preview URL. Verify `/` and `/privacy` behind deployment protection with `npx vercel curl`, and report that the owner must sign in through Vercel to open the private preview.

---

## Final Review Checklist

- Schema-1 projects migrate only with their real stored source asset metadata.
- Schema-2 projects preserve immutable source identity while allowing additional image assets.
- Every layer operation is deterministic, variation-scoped, persisted, and undoable where specified.
- Layer selection persists but never enters undo history or unexpectedly changes on undo.
- Ordered image and text rendering uses the same canvas transform convention.
- Text remains editable after save, reload, variation duplication, and project reopen.
- Asset URLs and stale imported assets are released without deleting shared immutable assets.
- Desktop and mobile workflows remain usable and non-overlapping.
- No Looks, Compare Board, trace, products, Print Lens, production workflow, or AI surface enters the Phase 2A bundle.
