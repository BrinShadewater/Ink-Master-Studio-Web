# Phase 3A T-Shirt Placement And Photographic Mockups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one independent, persisted T-shirt product placement per design variation, edited directly on the 11 restored photographic shirt blanks.

**Architecture:** Upgrade the editor project to schema 5 and keep product state linked to, but separate from, each design variation. Reuse the existing bounded variation compositor and Look authority on a transparent canvas, then place that canvas over an editor-owned photographic mockup catalog through normalized geometry. Product mode is a focused editor surface; it cannot import legacy production modules or perform final export.

**Tech Stack:** TypeScript 5.8, React 19, Canvas 2D, existing Look worker/coordinator, IndexedDB repository, Tailwind CSS, Node test runner with `tsx`, Playwright Chromium, Vite 8.

## Global Constraints

- Execution base is commit `e8858b3`.
- The implementation contains exactly seven reviewed tasks.
- Every normalized design variation has exactly one T-shirt product variant.
- Product placement transforms the complete fixed 1000 by 1000 variation composition and never mutates a layer.
- Placement bounds are `x: 0..1`, `y: 0..1`, `scale: 0.1..1.5`, and `rotation: -180..180`.
- Default placement is `{ x: 0.5, y: 0.5, scale: 0.72, rotation: 0 }`; default shirt is black.
- The catalog contains only the 11 existing 2048 by 2048 PNGs in `public/mockups`.
- The misspelled file `mockup-miltarygreen.png` is preserved only at the file-path boundary; its slug and label are `military-green` and `Military green`.
- Product state is local-first, autosaved, variation-scoped, undoable, and independent across duplicates.
- Product preview reuses the existing bounded compositor and Look coordinator; no product render worker is added.
- No final PNG, mockup download, DPI metadata, validation receipt, Printify integration, additional product, Print Lens, treatment, AI feature, or unrelated legacy retirement enters this phase.
- The canvas-first editor cannot import production jobs, profiles, proofs, packages, handoff, templates, batches, `services/mockups.ts`, `services/imageProcessing.ts`, or `workers/imageProcessing.worker.ts`.
- Existing source artwork and generated editor assets remain immutable.
- Every task ends with focused tests, `npm run typecheck`, a diff check, review, and one scoped commit.

---

### Task 1: Add The Schema-5 Product Model And Migration

**Files:**
- Create: `editor/productModel.ts`
- Create: `tests/editor-product-model.test.ts`
- Modify: `editor/model.ts`
- Modify: `tests/editor-model.test.ts`
- Modify: `tests/editor-repository.test.ts`

**Interfaces:**
- Produces:
  - `TShirtMockupSlug`
  - `ProductPlacement`
  - `TShirtProductVariant`
  - `DEFAULT_PRODUCT_PLACEMENT`
  - `createDefaultTShirtProduct(variationId, id)`
  - `normalizeProductPlacement(value)`
  - `normalizeTShirtProductVariants(value, variationIds, createId)`
  - `findTShirtProduct(products, variationId)`
- Changes `EDITOR_PROJECT_SCHEMA_VERSION` from `4` to `5`.
- Changes `EditorProject.productVariants` from `[]` to `TShirtProductVariant[]`.
- Consumes only variation IDs and an injected ID factory; `productModel.ts` cannot import `model.ts`.

- [ ] **Step 1: Write the failing product-model and migration tests**

Create `tests/editor-product-model.test.ts` with deterministic IDs and malformed inputs:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_PRODUCT_PLACEMENT,
  findTShirtProduct,
  normalizeProductPlacement,
  normalizeTShirtProductVariants,
} from '../editor/productModel';

test('normalizes exactly one product for every variation', () => {
  let nextId = 0;
  const products = normalizeTShirtProductVariants([
    {
      id: 'product-a',
      variationId: 'variation-a',
      type: 'tshirt',
      mockupSlug: 'navy',
      placement: { x: 0.25, y: 0.75, scale: 1.1, rotation: 15 },
    },
    {
      id: 'duplicate-link',
      variationId: 'variation-a',
      type: 'tshirt',
      mockupSlug: 'red',
      placement: DEFAULT_PRODUCT_PLACEMENT,
    },
    {
      id: 'orphan',
      variationId: 'missing',
      type: 'tshirt',
      mockupSlug: 'black',
      placement: DEFAULT_PRODUCT_PLACEMENT,
    },
  ], ['variation-a', 'variation-b'], () => `generated-${++nextId}`);

  assert.equal(products.length, 2);
  assert.equal(findTShirtProduct(products, 'variation-a').id, 'product-a');
  assert.equal(findTShirtProduct(products, 'variation-a').mockupSlug, 'navy');
  assert.equal(findTShirtProduct(products, 'variation-b').mockupSlug, 'black');
});

test('repairs placement values with documented defaults and bounds', () => {
  assert.deepEqual(normalizeProductPlacement({
    x: Number.NaN,
    y: 4,
    scale: 0,
    rotation: -900,
  }), {
    x: 0.5,
    y: 1,
    scale: 0.1,
    rotation: -180,
  });
});
```

Update `tests/editor-model.test.ts` to assert:

```ts
assert.equal(project.schemaVersion, 5);
assert.equal(project.productVariants.length, project.variations.length);
assert.equal(project.productVariants[0].variationId, project.variations[0].id);
assert.equal(project.productVariants[0].mockupSlug, 'black');
```

Add a schema-4 migration case and a malformed schema-5 normalization case. Update repository expectations from schema 4 to schema 5 while retaining schema-4 save normalization coverage.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```powershell
npx tsx --test tests/editor-product-model.test.ts tests/editor-model.test.ts tests/editor-repository.test.ts
```

Expected: failure because `editor/productModel.ts` does not exist and schema 5 is unsupported.

- [ ] **Step 3: Implement the isolated product model**

Create `editor/productModel.ts` with these exact public contracts:

```ts
export const TSHIRT_MOCKUP_SLUGS = [
  'black',
  'burgundy',
  'cardinal',
  'charcoal',
  'forest-green',
  'heather',
  'military-green',
  'navy',
  'orange',
  'red',
  'royal-blue',
] as const;

export type TShirtMockupSlug = typeof TSHIRT_MOCKUP_SLUGS[number];

export interface ProductPlacement {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface TShirtProductVariant {
  id: string;
  variationId: string;
  type: 'tshirt';
  mockupSlug: TShirtMockupSlug;
  placement: ProductPlacement;
}

export const PRODUCT_PLACEMENT_BOUNDS = {
  x: { min: 0, max: 1 },
  y: { min: 0, max: 1 },
  scale: { min: 0.1, max: 1.5 },
  rotation: { min: -180, max: 180 },
} as const;

export const DEFAULT_PRODUCT_PLACEMENT: ProductPlacement = {
  x: 0.5,
  y: 0.5,
  scale: 0.72,
  rotation: 0,
};
```

Use an internal record guard, finite-number guard, clamp helper, and slug set. `normalizeProductPlacement` defaults non-finite properties independently and clamps finite values. `normalizeTShirtProductVariants` must:

1. Visit requested products in array order.
2. Retain only the first valid `type: 'tshirt'` record for each known variation.
3. Replace an empty or duplicate product ID with `createId()`.
4. Default unknown slugs to `black`.
5. Normalize placement.
6. Append one default product for every still-unlinked variation in variation order.

`findTShirtProduct(products, variationId)` returns the linked product or throws
`"T-shirt product not found for variation."`. Callers use it only after project
normalization has established the invariant.

- [ ] **Step 4: Upgrade project creation and migration**

In `editor/model.ts`:

```ts
export const EDITOR_PROJECT_SCHEMA_VERSION = 5 as const;

export interface EditorProject {
  // Existing fields remain unchanged.
  productVariants: TShirtProductVariant[];
}
```

Create one default product after creating the initial variation. Extend supported migration versions to `1 | 2 | 3 | 4 | 5`. Pass `value.productVariants` only for schema 5; schema 1 through 4 pass an empty value so normalization creates defaults after variations are normalized.

Do not change source-asset lookup, generated-asset recovery, layer normalization, or Look migration behavior.

- [ ] **Step 5: Run focused tests, typecheck, and diff checks**

Run:

```powershell
npx tsx --test tests/editor-product-model.test.ts tests/editor-model.test.ts tests/editor-repository.test.ts
npm run typecheck
git diff --check
```

Expected: all focused tests pass, typecheck passes, and no whitespace errors are reported.

- [ ] **Step 6: Review and commit Task 1**

Review schema acceptance, migration ordering, product-ID uniqueness, source immutability, and caller immutability. Then commit:

```powershell
git add editor/productModel.ts editor/model.ts tests/editor-product-model.test.ts tests/editor-model.test.ts tests/editor-repository.test.ts
git commit -m "feat: add phase 3a product model"
```

---

### Task 2: Extend Variation History With Product State

**Files:**
- Modify: `editor/productModel.ts`
- Modify: `editor/history.ts`
- Modify: `tests/editor-product-model.test.ts`
- Modify: `tests/editor-history.test.ts`

**Interfaces:**
- Produces:
  - `duplicateTShirtProduct(source, variationId, id)`
  - `set-product-placement` editor command
  - `set-product-mockup` editor command
- Extends `VariationEditState` with `product: TShirtProductVariant`.
- Preserves project metadata and inactive variation products through undo/redo.

- [ ] **Step 1: Write failing lifecycle and history tests**

Add tests that prove product isolation:

```ts
test('groups product placement and restores only the active variation product', () => {
  const source = createEditorAsset('project-product-history', new Blob(['source']), {
    name: 'source.png',
    width: 1000,
    height: 1000,
  });
  let history = createEditorHistory(createEditorProject('Products', source));
  const variationId = history.present.activeVariationId;

  history = reduceEditorHistory(history, {
    type: 'set-product-placement',
    placement: { x: 0.4, y: 0.5, scale: 0.72, rotation: 0 },
    historyGroup: 'product-drag',
  });
  history = reduceEditorHistory(history, {
    type: 'set-product-placement',
    placement: { x: 0.3, y: 0.6, scale: 0.72, rotation: 0 },
    historyGroup: 'product-drag',
  });
  history = reduceEditorHistory(history, { type: 'end-history-group' });

  assert.equal(history.variationHistory[variationId].past.length, 1);
  history = reduceEditorHistory(history, { type: 'undo' });
  assert.deepEqual(
    findTShirtProduct(history.present.productVariants, variationId).placement,
    DEFAULT_PRODUCT_PLACEMENT,
  );
});
```

Also prove:

- A discrete shirt-color edit creates one undo step.
- Undo after a later project rename preserves the later name.
- Duplicating a variation copies product values under fresh variation/product IDs.
- Editing the duplicate never changes the source product.
- Deleting a variation removes only its linked product and history.
- Selecting another variation closes the outgoing product history group.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```powershell
npx tsx --test tests/editor-product-model.test.ts tests/editor-history.test.ts
```

Expected: failure because product commands and product history snapshots do not exist.

- [ ] **Step 3: Add product duplication and command contracts**

In `editor/productModel.ts` add:

```ts
export const duplicateTShirtProduct = (
  source: TShirtProductVariant,
  variationId: string,
  id: string,
): TShirtProductVariant => ({
  ...structuredClone(source),
  id,
  variationId,
  placement: normalizeProductPlacement(source.placement),
});
```

In `editor/history.ts` extend `EditorCommand`:

```ts
| {
    type: 'set-product-placement';
    placement: ProductPlacement;
    historyGroup?: string;
  }
| {
    type: 'set-product-mockup';
    mockupSlug: TShirtMockupSlug;
  }
```

Extend `VariationEditState`:

```ts
export interface VariationEditState {
  layers: DesignLayer[];
  look: VariationLook;
  product: TShirtProductVariant;
}
```

- [ ] **Step 4: Record and restore linked product snapshots**

Change `getEditState` to accept the project and variation ID, then clone the matching variation layers, Look, and product. Change `replaceVariationEditState` to replace only those three values for the same variation.

Implement product commands by normalizing requested values, returning the unchanged history for semantic no-ops, cloning the project, replacing only the active product, and calling `recordVariationEdit`.

In `duplicate-variation`, duplicate the source product after the new variation is created:

```ts
const sourceProduct = findTShirtProduct(next.productVariants, outgoingVariationId);
next.productVariants.push(duplicateTShirtProduct(
  sourceProduct,
  duplicate.id,
  createEditorId('product'),
));
```

In `delete-variation`, filter `productVariants` by the deleted variation ID. Keep variation selection outside undo history.

- [ ] **Step 5: Run focused tests, typecheck, and diff checks**

Run:

```powershell
npx tsx --test tests/editor-product-model.test.ts tests/editor-history.test.ts
npm run typecheck
git diff --check
```

Expected: all focused tests pass.

- [ ] **Step 6: Review and commit Task 2**

Review active-variation authority, metadata preservation, history grouping, duplicate isolation, deletion fallback, and no-op behavior. Then commit:

```powershell
git add editor/productModel.ts editor/history.ts tests/editor-product-model.test.ts tests/editor-history.test.ts
git commit -m "feat: add undoable product placement state"
```

---

### Task 3: Add The Editor-Owned T-Shirt Catalog And Geometry

**Files:**
- Create: `editor/productCatalog.ts`
- Create: `editor/productGeometry.ts`
- Create: `tests/editor-product-catalog.test.ts`
- Create: `tests/editor-product-geometry.test.ts`

**Interfaces:**
- Produces:
  - `TShirtMockup`
  - `TSHIRT_MOCKUPS`
  - `DEFAULT_TSHIRT_PRINTABLE_REGION`
  - `getTShirtMockup(slug)`
  - `containProductMockup(viewport)`
  - `resolveProductRegionRect(mockupRect, region)`
  - `resolveProductArtworkGeometry(regionRect, placement)`
  - `moveProductPlacement(start, delta, regionRect)`
  - `resizeProductPlacementFromPoint(start, point, regionRect)`
- Cannot import `services/mockups.ts`, `types.ts`, placement profiles, or production code.

- [ ] **Step 1: Write failing catalog and geometry tests**

The catalog test must read each public PNG, validate the PNG signature and IHDR dimensions directly from bytes, and assert unique slugs/files:

```ts
for (const mockup of TSHIRT_MOCKUPS) {
  const bytes = readFileSync(path.join(process.cwd(), 'public', mockup.file.replace(/^\//, '')));
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(bytes.readUInt32BE(16), 2048);
  assert.equal(bytes.readUInt32BE(20), 2048);
}
```

Geometry tests must cover:

```ts
assert.deepEqual(
  containProductMockup({ width: 1440, height: 900 }),
  { x: 270, y: 0, width: 900, height: 900 },
);

const moved = moveProductPlacement(
  DEFAULT_PRODUCT_PLACEMENT,
  { x: 32, y: -44 },
  { x: 340, y: 230, width: 320, height: 440 },
);
assert.deepEqual(moved, {
  ...DEFAULT_PRODUCT_PLACEMENT,
  x: 0.6,
  y: 0.4,
});
```

Also test square, portrait, zero-sized, and non-finite viewports; region mapping; rotated resize; minimum/maximum scale; and display/product round trips.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```powershell
npx tsx --test tests/editor-product-catalog.test.ts tests/editor-product-geometry.test.ts
```

Expected: module-not-found failures.

- [ ] **Step 3: Implement the exact local catalog**

Create `editor/productCatalog.ts`. Use this calibration for every entry:

```ts
export const DEFAULT_TSHIRT_PRINTABLE_REGION = {
  x: 0.34,
  y: 0.255,
  width: 0.32,
  height: 0.44,
} as const;
```

Declare all 11 entries with exact local files and the existing reviewed swatches:

```ts
const catalogRows = [
  ['black', 'Black', '/mockups/mockup-black.png', '#1A1A1A'],
  ['burgundy', 'Burgundy', '/mockups/mockup-burgundy.png', '#6B2737'],
  ['cardinal', 'Cardinal', '/mockups/mockup-cardinal.png', '#8B1A1A'],
  ['charcoal', 'Charcoal', '/mockups/mockup-charcoal.png', '#3D3D3D'],
  ['forest-green', 'Forest green', '/mockups/mockup-forestgreen.png', '#2D5A27'],
  ['heather', 'Heather', '/mockups/mockup-heather.png', '#8E9A9A'],
  ['military-green', 'Military green', '/mockups/mockup-miltarygreen.png', '#4A5240'],
  ['navy', 'Navy', '/mockups/mockup-navy.png', '#1B2A4A'],
  ['orange', 'Orange', '/mockups/mockup-orange.png', '#D4620A'],
  ['red', 'Red', '/mockups/mockup-red.png', '#C0392B'],
  ['royal-blue', 'Royal blue', '/mockups/mockup-royalblue.png', '#2255A4'],
] as const;
```

Map rows to frozen `TShirtMockup` records with copied calibration objects. `getTShirtMockup` must always resolve a normalized slug and default to black only when called with an invalid runtime value.

- [ ] **Step 4: Implement viewport-independent product geometry**

Create `editor/productGeometry.ts` using `Point` and `Size` from `editor/geometry.ts`. `containProductMockup` contains a square in the viewport. `resolveProductRegionRect` maps normalized catalog coordinates into that square.

`resolveProductArtworkGeometry` uses:

```ts
const baseEdge = Math.min(regionRect.width, regionRect.height);
return {
  center: {
    x: regionRect.x + placement.x * regionRect.width,
    y: regionRect.y + placement.y * regionRect.height,
  },
  edge: baseEdge * placement.scale,
  rotation: placement.rotation,
};
```

`moveProductPlacement` divides display deltas by region width/height and normalizes the result. `resizeProductPlacementFromPoint` inverse-rotates the point around the artwork center, takes twice the larger absolute local axis as the requested edge, divides by the base edge, and normalizes scale.

- [ ] **Step 5: Run focused tests, typecheck, and diff checks**

Run:

```powershell
npx tsx --test tests/editor-product-catalog.test.ts tests/editor-product-geometry.test.ts
npm run typecheck
git diff --check
```

Expected: all focused tests pass.

- [ ] **Step 6: Review and commit Task 3**

Visually inspect the black, heather, and red assets against the calibration rectangle. Review spelling, local paths, dimensions, finite geometry, rotation math, mobile parity, and legacy import absence. Then commit:

```powershell
git add editor/productCatalog.ts editor/productGeometry.ts tests/editor-product-catalog.test.ts tests/editor-product-geometry.test.ts
git commit -m "feat: add calibrated tshirt mockup catalog"
```

---

### Task 4: Reuse Transparent Variation Preview And Retain Mockup Authority

**Files:**
- Create: `editor/productMockupLoader.ts`
- Create: `components/editor/useProductMockup.ts`
- Create: `tests/editor-product-mockup-loader.test.ts`
- Modify: `components/editor/VariationPreviewCanvas.tsx`
- Modify: `tests/editor-preview-surface.test.ts`

**Interfaces:**
- Adds `'transparent'` to `PreviewBackground`.
- Produces `clearPreviewBackground(context, width, height, background)`.
- Produces `ProductMockupLoadState`, `createProductMockupLoadController`, and `useProductMockup`.
- `useProductMockup(mockup)` returns `{ displayedMockup, status, error, retry }`.

- [ ] **Step 1: Write failing transparent-preview and loader-authority tests**

Add preview tests proving transparent mode clears without filling and existing backgrounds still fill exactly once.

Create loader tests with injected fake images:

```ts
class FakeImage {
  src = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
}

test('retains the last ready shirt while a replacement fails', () => {
  const images: FakeImage[] = [];
  const states: ProductMockupLoadState[] = [];
  const controller = createProductMockupLoadController(
    () => {
      const image = new FakeImage();
      images.push(image);
      return image;
    },
    (state) => states.push(state),
  );

  controller.sync(getTShirtMockup('black'));
  images[0].onload?.();
  controller.sync(getTShirtMockup('red'));
  images[1].onerror?.();

  assert.equal(states.at(-1)?.requestedMockup.slug, 'red');
  assert.equal(states.at(-1)?.displayedMockup?.slug, 'black');
  assert.equal(states.at(-1)?.status, 'failed');
});
```

Also prove stale load/error callbacks cannot publish, Retry reloads only the current request, `sync(null)` clears authority, and `dispose()` nulls handlers and prevents future publication.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```powershell
npx tsx --test tests/editor-preview-surface.test.ts tests/editor-product-mockup-loader.test.ts
```

Expected: failures because transparent preview and the loader do not exist.

- [ ] **Step 3: Add transparent preview support**

In `VariationPreviewCanvas.tsx`:

```ts
export type PreviewBackground =
  | '#1f1f1f'
  | '#f5f5f3'
  | '#161616'
  | 'transparent';

export const clearPreviewBackground = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  background: PreviewBackground,
) => {
  context.clearRect(0, 0, width, height);
  if (background === 'transparent') return;
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
};
```

Use this helper in every paint and empty-composition path. Keep all render-key, ready-frame retention, failure, retry, and coordinator cleanup behavior unchanged.

- [ ] **Step 4: Implement latest-request mockup loading**

Use these exact public types:

```ts
export type ProductMockupLoadStatus = 'idle' | 'pending' | 'ready' | 'failed';

export interface ProductMockupLoadState {
  requestedMockup: TShirtMockup | null;
  displayedMockup: TShirtMockup | null;
  status: ProductMockupLoadStatus;
  error: string | null;
}

export interface ProductImageLoader {
  src: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
}

export interface ProductMockupLoadController {
  sync: (mockup: TShirtMockup | null) => void;
  retry: () => void;
  dispose: () => void;
}
```

`createProductMockupLoadController` owns:

- The requested mockup.
- The last successfully displayed mockup.
- A monotonically increasing authority generation.
- The current preloader and its `onload`/`onerror` handlers.
- `sync`, `retry`, and idempotent `dispose`.

Publishing `pending` or `failed` must retain `displayedMockup`. The stable failure message is `"<Color> shirt preview is unavailable."`.

`useProductMockup` creates one controller, synchronizes on slug/file changes, disposes on unmount, and exposes a stable Retry callback. It cannot create object URLs or make network requests beyond loading the local public path.

- [ ] **Step 5: Run focused tests, typecheck, and diff checks**

Run:

```powershell
npx tsx --test tests/editor-preview-surface.test.ts tests/editor-product-mockup-loader.test.ts
npm run typecheck
git diff --check
```

Expected: all focused tests pass.

- [ ] **Step 6: Review and commit Task 4**

Review transparent alpha, prior-frame retention, stale callback rejection, error text, retry authority, handler cleanup, and Look coordinator behavior. Then commit:

```powershell
git add editor/productMockupLoader.ts components/editor/useProductMockup.ts components/editor/VariationPreviewCanvas.tsx tests/editor-product-mockup-loader.test.ts tests/editor-preview-surface.test.ts
git commit -m "feat: add retained product preview authority"
```

---

### Task 5: Build The Direct-Manipulation Product Canvas

**Files:**
- Create: `components/editor/ProductCanvas.tsx`
- Create: `tests/editor-product-canvas.test.ts`

**Interfaces:**
- Produces `ProductCanvas`.
- Consumes active variation, linked product, displayed mockup state, decoded editor assets, and the existing `LookRenderCoordinator`.
- Emits normalized placement changes with a history-group ID and one interaction-end signal.

- [ ] **Step 1: Write failing product-canvas structure and interaction-contract tests**

Render `ProductCanvas` to static markup and assert:

- `aria-label="T-shirt product preview"`.
- The displayed shirt uses the catalog name in its alt text.
- The variation canvas uses `aria-label="Product artwork"`.
- The resize handle is a button named `Resize product artwork`.
- Pending and failed states are announced.
- Retry and Return to design actions appear on initial failure.

Add pure tests for exported `createProductCanvasPointerState` and
`resolveProductCanvasPointerPlacement` helpers. Prove move and resize resolve
through the correct geometry function and never mutate their start placement.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```powershell
npx tsx --test tests/editor-product-canvas.test.ts tests/editor-product-geometry.test.ts
```

Expected: module-not-found failure for `ProductCanvas`.

- [ ] **Step 3: Implement the stable photographic product surface**

Use these exact public contracts:

```ts
export type ProductPointerMode = 'move' | 'resize';

export interface ProductCanvasPointerState {
  pointerId: number;
  mode: ProductPointerMode;
  startPoint: Point;
  startPlacement: ProductPlacement;
  regionRect: Rect;
}

export const createProductCanvasPointerState = (
  pointerId: number,
  mode: ProductPointerMode,
  startPoint: Point,
  startPlacement: ProductPlacement,
  regionRect: Rect,
): ProductCanvasPointerState => ({
  pointerId,
  mode,
  startPoint: { ...startPoint },
  startPlacement: { ...startPlacement },
  regionRect: { ...regionRect },
});

export const resolveProductCanvasPointerPlacement = (
  state: ProductCanvasPointerState,
  point: Point,
): ProductPlacement => state.mode === 'move'
  ? moveProductPlacement(state.startPlacement, {
      x: point.x - state.startPoint.x,
      y: point.y - state.startPoint.y,
    }, state.regionRect)
  : resizeProductPlacementFromPoint(
      state.startPlacement,
      point,
      state.regionRect,
    );

export interface ProductCanvasProps {
  projectId: string;
  variation: DesignVariation;
  product: TShirtProductVariant;
  displayedMockup: TShirtMockup | null;
  mockupStatus: ProductMockupLoadStatus;
  mockupError: string | null;
  assetsById: Record<string, EditorAsset>;
  imagesById: Record<string, DecodedImageEntry>;
  coordinator: LookRenderCoordinator;
  artworkRetryGeneration: number;
  onArtworkFailureChange: (message: string | null) => void;
  onPlacementChange: (
    placement: ProductPlacement,
    historyGroup: 'product-placement-drag' | 'product-placement-resize',
  ) => void;
  onPlacementEnd: () => void;
  onRetry: () => void;
  onReturnToDesign: () => void;
}
```

`ProductCanvas` renders:

```tsx
<section aria-label="T-shirt product preview" className="relative h-full min-h-0 overflow-hidden bg-neutral-200">
  {displayedMockup ? (
    <img
      alt={`${displayedMockup.name} T-shirt`}
      src={displayedMockup.file}
      className="pointer-events-none absolute object-contain"
    />
  ) : null}
  <div data-product-artwork="true">
    <VariationPreviewCanvas
      surfaceId={`editor-product-preview:${projectId}`}
      variation={variation}
      assetsById={assetsById}
      imagesById={imagesById}
      coordinator={coordinator}
      maxPixelDimension={800}
      background="transparent"
      ariaLabel="Product artwork"
      onFailureChange={onArtworkFailureChange}
      retryGeneration={artworkRetryGeneration}
    />
    <button type="button" aria-label="Resize product artwork" />
  </div>
</section>
```

Use `ResizeObserver` on the section to resolve the contained 2048 by 2048 shirt rectangle, calibrated region, and artwork geometry. Keep the shirt image and artwork wrapper dimensions explicit so status labels and handles cannot shift layout.

- [ ] **Step 4: Implement pointer move and proportional resize**

Use pointer capture. Moving begins only inside the artwork wrapper and resizing begins only on the corner handle. Each pointer state stores the pointer ID, mode, start point, start placement, and current region rectangle.

On movement:

- Move calls `moveProductPlacement`.
- Resize calls `resizeProductPlacementFromPoint`.
- Emit the matching stable history group.
- Do not recompose layers directly.

On pointer up, pointer cancel, or lost capture:

- Release capture when held.
- Clear the pointer state.
- Call `onPlacementEnd()` exactly once.

The wrapper applies translation, rotation, and scale through resolved geometry. The canvas remains square and transparent.

- [ ] **Step 5: Run focused tests, typecheck, and diff checks**

Run:

```powershell
npx tsx --test tests/editor-product-canvas.test.ts tests/editor-product-geometry.test.ts tests/editor-preview-surface.test.ts
npm run typecheck
git diff --check
```

Expected: all focused tests pass.

- [ ] **Step 6: Review and commit Task 5**

Review pointer capture, cancel behavior, one-end-per-interaction, responsive geometry, fixed dimensions, transparent composition, status layering, accessible alternatives, and no project mutation. Then commit:

```powershell
git add components/editor/ProductCanvas.tsx tests/editor-product-canvas.test.ts
git commit -m "feat: add direct tshirt placement canvas"
```

---

### Task 6: Integrate Product Mode, Inspector, And Responsive Controls

**Files:**
- Create: `components/editor/ProductInspector.tsx`
- Modify: `components/editor/EditorApp.tsx`
- Modify: `components/editor/EditorToolbar.tsx`
- Modify: `components/editor/EditorInspector.tsx`
- Modify: `components/editor/TransformControls.tsx`
- Modify: `editor/model.ts`
- Modify: `tests/editor-shell.test.ts`
- Modify: `tests/editor-workspace.test.ts`

**Interfaces:**
- Adds `'product'` to `EditorTool`.
- Adds Product toolbar selection with Lucide `Shirt`.
- `ProductInspector` consumes the active product, catalog, preview status, and editor dispatch.
- Product mode replaces `EditorCanvas` with `ProductCanvas` and removes the desktop Layer panel.

- [ ] **Step 1: Write failing toolbar, inspector, shell, and persistence tests**

Add shell tests that assert:

```ts
const productToolbar = renderToStaticMarkup(createElement(EditorToolbar, {
  tool: 'product',
  layerType: 'image',
  hasProject: true,
  onToolChange: () => undefined,
  onOpenLayers: () => undefined,
  variationCount: 2,
}));
assert.match(productToolbar, /aria-label="Product"/);
assert.match(productToolbar, /aria-pressed="true"/);
assert.match(productToolbar, /Product mode/);
```

Render `ProductInspector` and prove:

- Exactly 11 swatch buttons with unique accessible names.
- Active color is programmatically selected and visibly named.
- X and Y controls expose `0..100`.
- Scale exposes `10..150`.
- Rotation exposes `-180..180`.
- Center and Reset dispatch normalized product placement.
- Retry and Return to design appear for preview failures.

Add workspace/repository round-trip coverage proving edited color and placement survive save, reload, and open without changing source asset bytes.

- [ ] **Step 2: Run focused tests and verify they fail**

Run:

```powershell
npx tsx --test tests/editor-shell.test.ts tests/editor-workspace.test.ts tests/editor-repository.test.ts
```

Expected: failures because Product UI and commands are not wired.

- [ ] **Step 3: Build Product inspector controls**

Export `NumberControl` and `RangeControl` from `TransformControls.tsx` for reuse.

Use this prop contract:

```ts
export interface ProductInspectorProps {
  product: TShirtProductVariant;
  mockupStatus: ProductMockupLoadStatus;
  mockupError: string | null;
  artworkError: string | null;
  dispatch: (command: EditorCommand) => void;
  onRetry: () => void;
  onReturnToDesign: () => void;
}
```

`ProductInspector` must:

- Dispatch `set-product-mockup` from swatches.
- Convert stored X/Y to integer percentages for controls and divide changes by 100.
- Convert scale to a percentage and divide changes by 100.
- Use rotation degrees directly.
- Use history groups `product-position-x`, `product-position-y`, `product-scale`, and `product-rotation`.
- Dispatch `end-history-group` on control end.
- Center by preserving scale/rotation and setting X/Y to `0.5`.
- Reset with `DEFAULT_PRODUCT_PLACEMENT`.

Swatch buttons use the catalog swatch as a square color sample, the catalog name as `aria-label` and `title`, and `aria-pressed` for selection. Show the active color name as visible text above the swatch grid.

- [ ] **Step 4: Add Product to the toolbar and tool model**

In `editor/model.ts`:

```ts
export type EditorTool =
  | 'select'
  | 'crop'
  | 'adjust'
  | 'looks'
  | 'remove-background'
  | 'trace'
  | 'product';
```

In `EditorToolbar.tsx`, add `{ id: 'product', label: 'Product', icon: Shirt }`. Add `hasProject` and product-mode disabled reasons:

- Product is disabled without a project.
- Compare is disabled while Product is active.
- Crop, Adjust, Remove background, Trace, Looks, and Layers are disabled while Product is active.
- Select remains enabled so it can leave Product.

- [ ] **Step 5: Integrate Product canvas and inspector in `EditorApp`**

Resolve the linked product with `findTShirtProduct`, resolve its requested catalog entry, and call `useProductMockup`.

When `tool === 'product'`:

- Close Compare and mobile Layers.
- Set background brush mode to idle.
- Render `ProductCanvas` instead of `EditorCanvas`.
- Remove drag-import handlers from the product surface.
- Render no desktop Layer panel.
- Give Product inspector the full right column on desktop and the existing 240-pixel lower region on mobile.
- Pass artwork and shirt failures plus Retry callbacks to `ProductInspector`.
- Dispatch `set-product-placement` from canvas interaction and `end-history-group` at interaction end.
- Return to Select from the failure action.

Put the Product branch in `EditorInspector` before layer-type branches so it
does not depend on the selected layer type. Do not clear the selected layer.
Variation changes must keep Product active and resolve the new linked product.

- [ ] **Step 6: Run focused tests, full Node tests, typecheck, and diff checks**

Run:

```powershell
npx tsx --test tests/editor-shell.test.ts tests/editor-workspace.test.ts tests/editor-repository.test.ts tests/editor-history.test.ts
npm test
git diff --check
```

Expected: typecheck, production build, production style test, and all Node tests pass.

- [ ] **Step 7: Perform real-browser desktop and mobile QA**

Run the Vite app locally and use the browser tooling:

1. Import `public/logo/logo.png`.
2. Open Product.
3. Confirm the black shirt and logo are nonblank.
4. Drag and resize the artwork.
5. Change to Heather.
6. Verify the desktop inspector and mobile lower inspector do not overlap the preview or toolbar.
7. Verify Product, Select, undo, redo, color swatches, and numeric controls.
8. Check browser console errors and warnings.

Fix any functional, layout, focus, or overlap defects before continuing.

- [ ] **Step 8: Review and commit Task 6**

Review tool normalization, product/compare mutual exclusion, direct and numeric parity, mobile bounds, accessible names, focus, autosave, variation switching, source immutability, and browser logs. Then commit:

```powershell
git add components/editor/ProductInspector.tsx components/editor/EditorApp.tsx components/editor/EditorToolbar.tsx components/editor/EditorInspector.tsx components/editor/TransformControls.tsx editor/model.ts tests/editor-shell.test.ts tests/editor-workspace.test.ts
git commit -m "feat: integrate responsive tshirt product mode"
```

---

### Task 7: Verify The Complete Phase 3A Owner Workflow

**Files:**
- Modify: `tests/e2e/canvas-editor.spec.ts`
- Modify: `tests/editor-bundle-boundary.test.ts`
- Create: `test-results/phase-3a/desktop-tshirt-placement-1440x900.png`
- Create: `test-results/phase-3a/mobile-tshirt-placement-390x844.png`
- Create: `.superpowers/sdd/phase-3a-acceptance-report.md`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Produces deterministic desktop/mobile browser proof, persisted product-state proof, pixel proof, bundle-boundary proof, reviewed screenshots, a protected preview URL, and the Phase 3A acceptance record.
- Does not add Phase 3B functionality.

- [ ] **Step 1: Update browser project typing and write the failing Phase 3A owner flow**

Change the E2E project type from `productVariants: unknown[]` to the schema-5 T-shirt product contract and update schema-4 fixtures to migrate deliberately or declare schema 5.

Add one test tagged `@phase3a-acceptance` that:

1. Imports a deterministic transparent PNG.
2. Records the immutable source blob digest.
3. Opens Product and waits for black shirt and artwork.
4. Samples canvas/image pixels to distinguish page background, shirt, and artwork.
5. Drags and resizes artwork.
6. Sets rotation to `15`.
7. Switches to Heather and proves placement bytes are unchanged.
8. Duplicates the variation.
9. Changes the duplicate to Red and moves it.
10. Switches variations and proves independent product state.
11. Undoes and redoes the duplicate placement.
12. Waits for Saved, reloads, and reopens the local project.
13. Reasserts exact persisted product state and source digest.
14. Captures the desktop screenshot.
15. Resizes to 390 by 844 and verifies preview, inspector, and toolbar containment.
16. Changes color and placement through mobile controls.
17. Captures the mobile screenshot.
18. Returns to Select and proves the variation layer state is byte-equal to its pre-Product state.

- [ ] **Step 2: Run the focused browser test and verify it fails**

Run:

```powershell
npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "@phase3a-acceptance"
```

Expected: failure until product selectors, persisted schema, and screenshots match the implemented UI.

- [ ] **Step 3: Tighten the editor bundle boundary for intentional mockup scope**

Update `tests/editor-bundle-boundary.test.ts` so local Phase 3A mockup filenames are allowed while these remain forbidden in the production entry and editor workers:

```ts
const forbidden = [
  /geminiService|@google\/genai/,
  /services\/imageProcessing|workers\/imageProcessing/,
  /ProductionPackage|production job|customer proof/i,
  /profile revision|handoff|batch order/i,
  /Print Lens|Printify Product/i,
];
```

Add a source import scan proving `editor/productCatalog.ts`, `editor/productModel.ts`, `editor/productGeometry.ts`, and all `components/editor/Product*.tsx` files do not import `services/mockups`, production placement/profile modules, jobs, proofs, packages, batches, or AI clients.

- [ ] **Step 4: Make the focused acceptance flow pass and review screenshots**

Run the focused test until it passes. Inspect both screenshots with the image viewer. Reject screenshots with blank artwork, wrong shirt color, misplaced handles, clipped controls, unreadable labels, overlap, or mobile overflow.

Expected screenshot paths:

```text
test-results/phase-3a/desktop-tshirt-placement-1440x900.png
test-results/phase-3a/mobile-tshirt-placement-390x844.png
```

- [ ] **Step 5: Run the complete release gate**

Run:

```powershell
npm test
npx playwright test --project=chromium
git diff --check
```

Expected: typecheck, production build, production style test, all Node tests, all Chromium tests, and whitespace checks pass.

Audit scope and lifecycle:

```powershell
rg -n "services/mockups|services/imageProcessing|workers/imageProcessing|ProductionPackage|production job|customer proof|profile revision|handoff|batch order|Print Lens|Printify Product|geminiService|@google/genai" editor components/editor tests/editor-bundle-boundary.test.ts
rg -n "new Worker|terminate\\(|createObjectURL|revokeObjectURL|onload|onerror|dispose\\(" editor components/editor
```

Expected: deferred terms appear only in negative assertions or unchanged legacy files; every added loader owner clears handlers or disposes; existing URL and worker owners retain paired cleanup.

- [ ] **Step 6: Perform a consolidated code review**

Review the complete range from `e8858b3` through HEAD for:

- Schema migration and one-product-per-variation invariants.
- Product history grouping and metadata preservation.
- Catalog correctness and calibration.
- Viewport-independent geometry.
- Transparent Look preview authority.
- Shirt load retention, stale callbacks, retry, and disposal.
- Pointer capture and cancel behavior.
- Desktop/mobile layout, focus, accessibility, and overlap.
- Autosave/reopen and source immutability.
- Deferred-scope and bundle boundaries.

Resolve every Critical or Important finding in one scoped fix pass, rerun affected focused tests, then repeat the review.

- [ ] **Step 7: Deploy and smoke-test a protected preview**

Deploy the exact reviewed runtime commit through the existing Vercel project:

```powershell
npx vercel deploy --yes
```

Record the deployment ID, URL, state, framework, region, and exact Git commit. Verify authenticated `/` and `/privacy` return HTTP 200 and unauthenticated `/` follows the project protection policy. Do not promote the deployment to production.

- [ ] **Step 8: Write acceptance evidence and commit Task 7**

Write `.superpowers/sdd/phase-3a-acceptance-report.md` with:

- Functional commit range.
- Release-gate test counts.
- Product model and persistence evidence.
- Source digest evidence.
- Exact desktop/mobile placement values.
- Catalog/image evidence.
- Pixel assertions.
- Screenshot paths.
- Bundle and lifecycle audit results.
- Protected preview details.
- Deferred Phase 3B and Phase 4 scope.

Append Task 7 and final-review status to `.superpowers/sdd/progress.md`. Force-add the ignored acceptance report, then commit:

```powershell
git add tests/e2e/canvas-editor.spec.ts tests/editor-bundle-boundary.test.ts test-results/phase-3a/desktop-tshirt-placement-1440x900.png test-results/phase-3a/mobile-tshirt-placement-390x844.png .superpowers/sdd/progress.md
git add -f .superpowers/sdd/phase-3a-acceptance-report.md
git commit -m "test: verify phase 3a tshirt product workflow"
```

- [ ] **Step 9: Confirm final repository state**

Run:

```powershell
git status --short
git log --oneline e8858b3..HEAD
```

Expected: clean working tree and one reviewed commit per completed Phase 3A task.
