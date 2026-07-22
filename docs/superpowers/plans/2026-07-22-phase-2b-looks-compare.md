# Phase 2B Looks And Compare Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add eight deterministic, editable variation-level Looks and a responsive two-to-four-variation Compare Board without flattening artwork or introducing deferred product, trace, or AI features.

**Architecture:** Editor projects migrate to schema 3 and store one normalized `VariationLook` on every variation. The existing compositor produces bounded straight-alpha RGBA frames; one pure pixel processor and one module-worker coordinator apply Looks for the main canvas, live thumbnails, and Compare Board. React components share decoded immutable assets and a single preview surface instead of implementing separate render paths.

**Tech Stack:** React 19, TypeScript 5.8, Canvas 2D, Vite module workers, Tailwind CSS 4, Node test runner with `tsx`, Playwright Chromium, IndexedDB, Vercel preview deployment.

## Global Constraints

- A Look applies after all visible image and text layers are composed.
- Selecting a Look updates only the active variation and is undoable; it never creates a variation automatically.
- The source blob, source asset ID, layer IDs, and additional immutable assets are never rewritten by Look processing.
- All eight Looks and Original use one normalized model and one pure processor.
- Strength is the primary control; Look-specific controls remain under `More`.
- Grain and distress never call `Math.random` while rendering and remain anchored in normalized design coordinates.
- Main preview is bounded to 1600 px, Compare tiles to 800 px, and thumbnails to 240 px on their longest side.
- Processed RGBA cache data is least-recently-used and capped at 64 MiB.
- Compare Board supports only neutral, light, and dark artwork backgrounds in this phase.
- Compare selection, background, zoom, and mobile page are session-only and must not trigger autosave.
- Do not add vector trace, SVG export, products, mockups, Print Lens, Print Treatments, production workflow, collaboration, or AI UI.
- Keep the existing 390-by-844 mobile toolbar dimensions and non-overlapping canvas/inspector behavior.

---

## File Structure

- `editor/lookModel.ts`: Look IDs, discriminated types, defaults, normalization, labels, stable serialization, seed creation, and seeded-recipe helpers.
- `editor/lookProcessor.ts`: Pure RGBA algorithms, canonical-coordinate hashing, premultiplied Strength blending, and no DOM/storage dependencies.
- `editor/lookRenderCoordinator.ts`: Worker protocol, request authority, retry, byte-bounded LRU cache, and disposal.
- `editor/lookWorker.ts`: Vite module-worker adapter around `applyVariationLook`.
- `editor/decodedImages.ts`: Existing URL-tagged image decoder moved out of `EditorCanvas` so all preview surfaces share decoded immutable images.
- `components/editor/VariationPreviewCanvas.tsx`: Non-interactive shared layer composition and Look-processing surface for thumbnails and Compare tiles.
- `components/editor/LooksInspector.tsx`: Look thumbnails, Strength, advanced controls, reset, reroll, error, and retry.
- `editor/compareState.ts`: Pure Compare selection reconciliation and background/zoom normalization.
- `components/editor/CompareBoard.tsx`: Responsive board controls, equal frames, and edit-variation action.
- Existing `editor/model.ts`, `editor/history.ts`, `components/editor/EditorCanvas.tsx`, `EditorApp.tsx`, `EditorToolbar.tsx`, and `EditorInspector.tsx` remain ownership boundaries for schema, history, interaction, layout, tool selection, and inspector routing.

---

### Task 1: Schema 3 And Normalized Look Model

**Files:**
- Create: `editor/lookModel.ts`
- Modify: `editor/model.ts`
- Modify: `editor/projectRepository.ts`
- Modify: `tests/editor-model.test.ts`
- Modify: `tests/editor-repository.test.ts`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Produces: `LookId`, `VariationLook`, `LOOK_IDS`, `createDefaultLook`, `normalizeVariationLook`, `serializeVariationLook`, `createLookSeed`, `isSeededLook`, and `replaceLookSeed`.
- Produces: schema-3 `DesignVariation.look` and `EditorProject.schemaVersion === 3`.
- Preserves: schema-1 asset-assisted migration, schema-2 source identity, exact text persistence, and repository save normalization.

- [ ] **Step 1: Write failing pure Look-model tests**

Create `tests/editor-look-model.test.ts` with table-driven assertions for all nine IDs and every documented boundary. The test must prove colors normalize to lowercase six-digit hex, numeric values round to integers before clamping, seeds normalize with `>>> 0`, unknown IDs return Original, and caller objects are not mutated.

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LOOK_IDS, createDefaultLook, isSeededLook, normalizeVariationLook,
  replaceLookSeed, serializeVariationLook,
} from '../editor/lookModel';

test('normalizes every Look to its documented contract', () => {
  assert.deepEqual(LOOK_IDS, [
    'original', 'clean-photo', 'high-contrast', 'monochrome', 'duotone',
    'posterized', 'graphic-halftone', 'vintage-ink', 'distressed-print',
  ]);
  assert.deepEqual(normalizeVariationLook({
    id: 'duotone', strength: 140.7, shadowColor: '#ABC',
    highlightColor: 'not-a-color', balance: -80,
  }), {
    id: 'duotone', strength: 100, shadowColor: '#aabbcc',
    highlightColor: '#f59e0b', balance: -50,
  });
  assert.deepEqual(normalizeVariationLook({
    id: 'distressed-print', strength: -1, wear: 101, textureScale: 0,
    edgeBreakup: Number.NaN, seed: -1,
  }), {
    id: 'distressed-print', strength: 0, wear: 100, textureScale: 1,
    edgeBreakup: 25, seed: 4294967295,
  });
});

test('serializes normalized recipes stably and replaces only seeded values', () => {
  const vintage = createDefaultLook('vintage-ink', 7);
  assert.equal(isSeededLook(vintage), true);
  assert.equal(replaceLookSeed(vintage, 9).seed, 9);
  assert.equal(serializeVariationLook(vintage), serializeVariationLook(structuredClone(vintage)));
  assert.deepEqual(replaceLookSeed(createDefaultLook('monochrome'), 9), createDefaultLook('monochrome'));
});
```

- [ ] **Step 2: Run the Look-model tests and confirm the red state**

Run: `npx tsx --test tests/editor-look-model.test.ts`

Expected: FAIL because `editor/lookModel.ts` does not exist.

- [ ] **Step 3: Implement the dependency-free Look model**

Define the exact discriminated union and defaults from the approved design. Keep it independent of `editor/model.ts` to avoid an import cycle.

```ts
export const LOOK_IDS = [
  'original', 'clean-photo', 'high-contrast', 'monochrome', 'duotone',
  'posterized', 'graphic-halftone', 'vintage-ink', 'distressed-print',
] as const;
export type LookId = typeof LOOK_IDS[number];
export type LookById<T extends LookId> = Extract<VariationLook, { id: T }>;

export const createDefaultLook = <T extends LookId>(id: T, seed = 0): LookById<T> => {
  switch (id) {
    case 'original': return { id, strength: 100 };
    case 'clean-photo': return { id, strength: 100, contrast: 10, saturation: 8, clarity: 8 };
    case 'high-contrast': return { id, strength: 100, contrast: 55, blackPoint: 12, saturation: 5 };
    case 'monochrome': return { id, strength: 100, contrast: 20, brightness: 0 };
    case 'duotone': return { id, strength: 100, shadowColor: '#111827', highlightColor: '#f59e0b', balance: 0 };
    case 'posterized': return { id, strength: 100, levels: 4, contrast: 20 };
    case 'graphic-halftone': return {
      id, strength: 100, cellSize: 10, angle: 45, foregroundColor: '#111111',
      background: 'transparent', backgroundColor: '#f5f5f3',
    };
    case 'vintage-ink': return { id, strength: 100, warmth: 45, fade: 25, grain: 20, seed: seed >>> 0 };
    case 'distressed-print': return {
      id, strength: 100, wear: 35, textureScale: 5, edgeBreakup: 25, seed: seed >>> 0,
    };
  }
};
```

`createLookSeed` must use `crypto.getRandomValues(new Uint32Array(1))[0]` when available. Its injected test seam accepts a `getRandomUint32` callback; production fallback combines `Date.now()`, `performance.now()` when available, and a module counter before applying `>>> 0`.

Preserve discriminated return types for seeded helpers:

```ts
export const replaceLookSeed = <T extends VariationLook>(look: T, seed: number): T;
```

- [ ] **Step 4: Write failing schema migration and repository tests**

Update model and repository tests to assert:

```ts
assert.equal(createEditorProject('New', asset).schemaVersion, 3);
assert.deepEqual(createEditorProject('New', asset).variations[0].look, { id: 'original', strength: 100 });
assert.equal(migrateEditorProject(rawSchema1, [asset]).schemaVersion, 3);
assert.equal(migrateEditorProject(rawSchema2, [asset]).schemaVersion, 3);
assert.deepEqual(migrateEditorProject(rawSchema2, [asset]).variations[0].look, { id: 'original', strength: 100 });
assert.deepEqual(migrateEditorProject(rawSchema3WithMalformedLook, [asset]).variations[0].look, expectedNormalizedLook);
```

Persist a raw schema-2 project in fake IndexedDB, reopen it through `getEditorProject`, save it, and reopen again. Assert source metadata, source asset ID, every layer ID, text content, and selected layer are unchanged while the stored project becomes schema 3 with Original.

- [ ] **Step 5: Migrate the editor model and repository to schema 3**

Set `EDITOR_PROJECT_SCHEMA_VERSION = 3`. Add `look: VariationLook` to `DesignVariation`, initialize Original in `createEditorProject`, preserve the structured-cloned Look in `duplicateVariation`, and normalize `value.look` in `normalizeVariation`.

`migrateEditorProject` must accept schema versions 1, 2, and 3. Schema 1 continues to retain only valid image layers and requires the real source asset. Schema 2 uses its source fields and gains Original. Schema 3 normalizes its saved recipe. `saveEditorProject` still rejects input whose declared schema version is not the current version before repository normalization.

- [ ] **Step 6: Run focused tests and commit**

Run:

```bash
npx tsx --test tests/editor-look-model.test.ts tests/editor-model.test.ts tests/editor-repository.test.ts
npm run typecheck
git diff --check
```

Expected: all focused tests and typecheck pass; no whitespace errors.

Commit: `feat: add versioned variation Look model`

---

### Task 2: Variation-Scoped Look History

**Files:**
- Modify: `editor/history.ts`
- Modify: `tests/editor-history.test.ts`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: `VariationLook`, `normalizeVariationLook`, `createDefaultLook`, `isSeededLook`, and `replaceLookSeed` from Task 1.
- Produces: `set-look`, `reroll-look-seed`, and `reset-look` commands.
- Changes: `VariationEditState` contains both `layers` and `look`.
- Preserves: 100-state cap, grouped control behavior, selection outside undo, independent variation stacks, and outgoing-group closure.

- [ ] **Step 1: Write failing history tests for Look edits**

Add tests covering discrete apply, continuous Strength changes, advanced parameters, reset, seed reroll, layer-and-Look undo ordering, variation isolation, duplicate cloning, and selection preservation.

```ts
history = reduceEditorHistory(history, {
  type: 'set-look',
  look: { ...createDefaultLook('duotone'), shadowColor: '#223344' },
});
assert.equal(getActiveVariation(history.present).look.id, 'duotone');
history = reduceEditorHistory(history, { type: 'undo' });
assert.equal(getActiveVariation(history.present).look.id, 'original');

for (const strength of [80, 60, 40]) {
  history = reduceEditorHistory(history, {
    type: 'set-look',
    look: { ...getActiveVariation(history.present).look, strength },
    historyGroup: 'look-strength',
  });
}
history = reduceEditorHistory(history, { type: 'end-history-group' });
history = reduceEditorHistory(history, { type: 'undo' });
assert.equal(getActiveVariation(history.present).look.strength, 100);
```

Prove `reroll-look-seed` is a no-op for non-seeded Looks and one discrete undo entry for seeded Looks. Prove switching variations closes a Look slider group just as it closes layer control groups.

- [ ] **Step 2: Run the focused history tests and confirm the red state**

Run: `npx tsx --test tests/editor-history.test.ts`

Expected: FAIL because Look commands and Look edit-state restoration do not exist.

- [ ] **Step 3: Extend edit state and restoration**

```ts
export interface VariationEditState {
  layers: DesignLayer[];
  look: VariationLook;
}

const getEditState = (variation: DesignVariation): VariationEditState => ({
  layers: structuredClone(variation.layers),
  look: structuredClone(variation.look),
});
```

`replaceVariationEditState` restores both fields, while preserving the current selected layer when possible. Project name, variation name, active variation, selected layer, and source metadata remain outside the edit snapshot.

- [ ] **Step 4: Implement normalized Look commands**

Add to `EditorCommand`:

```ts
| { type: 'set-look'; look: VariationLook; historyGroup?: string }
| { type: 'reroll-look-seed'; seed: number }
| { type: 'reset-look' }
```

`set-look` normalizes the complete recipe and is a no-op when stable serialization matches the active recipe. It calls `recordVariationEdit` with the optional group. Reset records Original only when needed. Reroll normalizes the seed, changes only seeded recipes, and records a discrete edit.

- [ ] **Step 5: Run focused tests and commit**

Run:

```bash
npx tsx --test tests/editor-history.test.ts tests/editor-model.test.ts
npm run typecheck
git diff --check
```

Expected: all focused tests and typecheck pass.

Commit: `feat: make Look edits variation scoped and undoable`

---

### Task 3: Pure Deterministic Look Processor

**Files:**
- Create: `editor/lookProcessor.ts`
- Create: `tests/editor-look-processor.test.ts`
- Create: `tests/fixtures/looks/README.md`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: normalized `VariationLook` from Task 1.
- Produces: `RgbaFrame`, `applyVariationLook`, `canonicalTextureValue`, and `blendLookStrength`.
- Prohibits: React, DOM, Canvas APIs, storage, CSS filters, object URLs, and rendering-time randomness.

- [ ] **Step 1: Write failing byte-level processor tests**

Use a fixed 4-by-4 RGBA fixture containing black, white, primary colors, midtones, partial alpha, and zero-alpha colored pixels. Store reviewed expected byte arrays directly in the test for each default Look; do not calculate expectations by calling processor helpers.

```ts
const frame = {
  width: 2,
  height: 2,
  pixels: new Uint8ClampedArray([
    255, 0, 0, 255, 0, 255, 0, 128,
    0, 0, 255, 255, 240, 120, 20, 0,
  ]),
};

test('Original returns byte-identical isolated output', () => {
  const output = applyVariationLook(frame, createDefaultLook('original'));
  assert.deepEqual([...output.pixels], [...frame.pixels]);
  assert.notEqual(output.pixels.buffer, frame.pixels.buffer);
});

test('Monochrome uses fixed Rec. 709 luminance', () => {
  const onePixel = { width: 1, height: 1, pixels: new Uint8ClampedArray([255, 0, 0, 255]) };
  const output = applyVariationLook(onePixel, { ...createDefaultLook('monochrome'), contrast: 0 });
  assert.deepEqual([...output.pixels], [54, 54, 54, 255]);
});
```

The table must include exact output for all eight processed defaults. Add separate assertions for Strength 0, 50, and 100; partial-alpha premultiplied interpolation; transparent halftone; solid halftone; zero-alpha RGB cleanup; duplicate-seed equality; different-seed inequality; and normalized-coordinate anchor samples at 8-by-8 and 16-by-16.

- [ ] **Step 2: Run processor tests and confirm the red state**

Run: `npx tsx --test tests/editor-look-processor.test.ts`

Expected: FAIL because `editor/lookProcessor.ts` does not exist.

- [ ] **Step 3: Implement shared pixel primitives**

Implement byte clamping, Rec. 709 luminance, contrast around 127.5, saturation around luminance, hex parsing, channel interpolation, and premultiplied Strength blending. Strength blending must interpolate `r*a`, `g*a`, `b*a`, and `a`, then unpremultiply; output RGB is zero when final alpha is zero.

```ts
export interface RgbaFrame {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

export const blendLookStrength = (
  original: Uint8ClampedArray,
  processed: Uint8ClampedArray,
  strength: number,
): Uint8ClampedArray;
```

Validate `pixels.length === width * height * 4`, positive integer dimensions, and a maximum safe typed-array length before allocation. Throw `Invalid Look frame.` for malformed frames.

- [ ] **Step 4: Implement tonal and palette Looks**

Implement Clean Photo, High Contrast, Monochrome, Duotone, and Posterized exactly in the approved processing order. Clarity uses a separable three-tap box blur and a bounded unsharp difference; it samples edge pixels by clamping coordinates. Duotone interpolates parsed shadow/highlight RGB from balanced luminance. Posterization uses `round(channel * (levels - 1) / 255) * 255 / (levels - 1)`.

- [ ] **Step 5: Implement canonical seeded Looks**

```ts
export const canonicalTextureValue = (
  x: number,
  y: number,
  width: number,
  height: number,
  seed: number,
  scale: number,
): number;
```

Map pixel centers into canonical 0-through-4095 integer coordinates. Hash coordinates, seed, and scale with documented `Math.imul` constants and return `[0, 1]`. Halftone rotates canonical coordinates and computes one radial threshold per cell. Vintage grain adds a zero-mean seeded offset. Distress combines two hash scales with alpha-edge distance; it cannot alter pixels outside source coverage. Add comments only for the integer hash and premultiplied blend.

- [ ] **Step 6: Run focused tests and commit**

Run:

```bash
npx tsx --test tests/editor-look-processor.test.ts tests/editor-look-model.test.ts
npm run typecheck
git diff --check
```

Expected: all byte fixtures, determinism tests, and typecheck pass.

Commit: `feat: add deterministic Look pixel processor`

---

### Task 4: Worker Protocol, Request Authority, And Bounded Cache

**Files:**
- Create: `editor/lookRenderCoordinator.ts`
- Create: `editor/lookWorker.ts`
- Create: `tests/editor-look-render-coordinator.test.ts`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: `applyVariationLook`, `RgbaFrame`, and `VariationLook`.
- Produces: `LookRenderRequest`, `LookRenderOutcome`, `LookWorkerLike`, `LookRenderCoordinator`, and `createBrowserLookWorker`.
- Contract: latest request per surface wins; cache is keyed by canonical render key and owns no object URLs.

- [ ] **Step 1: Write failing coordinator tests with a fake worker**

```ts
const coordinator = new LookRenderCoordinator(() => fakeWorker, { maxCacheBytes: 32 });
const first = coordinator.render({ surfaceId: 'main', renderKey: 'a', frame, look });
const second = coordinator.render({ surfaceId: 'main', renderKey: 'b', frame, look });
fakeWorker.succeed('a', firstRequestId, pixelsA);
fakeWorker.succeed('b', secondRequestId, pixelsB);
assert.equal((await first).status, 'stale');
assert.deepEqual(await second, { status: 'ready', renderKey: 'b', frame: expectedB });
```

Cover stale success, stale failure, independent surfaces, cache hit without `postMessage`, exact LRU eviction by RGBA byte count, retry of current key, worker crash fan-out, buffer transfer lists, variation-prefix eviction, and `dispose()` terminating the worker and resolving pending promises as stale.

- [ ] **Step 2: Run coordinator tests and confirm the red state**

Run: `npx tsx --test tests/editor-look-render-coordinator.test.ts`

Expected: FAIL because the coordinator does not exist.

- [ ] **Step 3: Define protocol and coordinator API**

```ts
export interface LookRenderInput {
  surfaceId: string;
  renderKey: string;
  frame: RgbaFrame;
  look: VariationLook;
}

export type LookRenderOutcome =
  | { status: 'ready'; renderKey: string; frame: RgbaFrame }
  | { status: 'failed'; renderKey: string; message: 'Look preview failed.' }
  | { status: 'stale'; renderKey: string };

export class LookRenderCoordinator {
  constructor(createWorker: () => LookWorkerLike, options?: { maxCacheBytes?: number });
  render(input: LookRenderInput): Promise<LookRenderOutcome>;
  retry(surfaceId: string): Promise<LookRenderOutcome>;
  clearSurface(surfaceId: string): void;
  evictVariation(variationId: string): void;
  dispose(): void;
}
```

The coordinator clones the caller's input bytes before transfer so caller-owned frames remain usable. Cache entries clone returned bytes on read and write. `clearSurface` resolves that surface's pending request as stale and removes retry authority without affecting other surfaces. Default maximum is `64 * 1024 * 1024`.

- [ ] **Step 4: Implement the module worker**

`lookWorker.ts` validates the request envelope, wraps transferred bytes in `Uint8ClampedArray`, calls the pure processor, and transfers the result buffer back. It catches all processing errors and emits only `Look preview failed.`. It never logs pixels, filenames, asset IDs, or user content.

`createBrowserLookWorker` returns:

```ts
new Worker(new URL('./lookWorker.ts', import.meta.url), { type: 'module' });
```

- [ ] **Step 5: Run focused tests and production build**

Run:

```bash
npx tsx --test tests/editor-look-render-coordinator.test.ts tests/editor-look-processor.test.ts
npm run typecheck
npm run build
git diff --check
```

Expected: coordinator tests pass and Vite emits the module worker without bundling errors.

Commit: `feat: process Looks in a bounded preview worker`

---

### Task 5: Shared Preview Surface And Looks Inspector

**Files:**
- Create: `editor/decodedImages.ts`
- Create: `components/editor/VariationPreviewCanvas.tsx`
- Create: `components/editor/LooksInspector.tsx`
- Modify: `editor/model.ts`
- Modify: `components/editor/EditorCanvas.tsx`
- Modify: `components/editor/EditorToolbar.tsx`
- Modify: `components/editor/EditorInspector.tsx`
- Modify: `components/editor/EditorApp.tsx`
- Modify: `tests/editor-compositor.test.ts`
- Modify: `tests/editor-shell.test.ts`
- Create: `tests/editor-preview-surface.test.ts`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: schema-3 variation Look, shared compositor, decoded assets, and coordinator.
- Produces: `useDecodedEditorImages`, `composeBoundedVariationFrame`, `VariationPreviewCanvas`, and `LooksInspector`.
- Changes: `EditorTool` adds `'looks'`.
- Preserves: URL ownership, direct layer hit testing/dragging, phase-one control IDs, mobile 40-by-40 toolbar targets, and selected-text image-tool gating.

- [ ] **Step 1: Write failing decoder extraction and preview-frame tests**

Move the existing URL-tagged decoder tests from compositor coverage into `tests/editor-preview-surface.test.ts` without weakening them. Add pure tests for bounded pixel dimensions:

```ts
assert.deepEqual(resolveBoundedPixelSize({ width: 1400, height: 900 }, 2, 1600), { width: 1600, height: 1029 });
assert.deepEqual(resolveBoundedPixelSize({ width: 390, height: 500 }, 2, 1600), { width: 780, height: 1000 });
```

Test that composition waits until every visible image layer has a decoded entry, hidden missing images do not block, and the render key changes for layer state, immutable asset ID, dimensions, or Look but not for replacement object URLs of the same immutable asset.

- [ ] **Step 2: Write failing Looks inspector and toolbar tests**

Server-render `EditorToolbar` and `LooksInspector`. Assert a Palette icon button named `Looks`, nine thumbnail buttons with `aria-pressed`, Strength, a `More` disclosure, selected-recipe controls, Reset Look, conditional Reroll texture, retryable error, and stable numeric bounds. Assert text selection disables only Crop and Adjust, not Looks.

- [ ] **Step 3: Extract decoded-image ownership**

Move `createDecodedImageController` and related types from `EditorCanvas.tsx` to `editor/decodedImages.ts`. Add:

```ts
export const useDecodedEditorImages = (
  assetUrlsById: Record<string, string>,
): Record<string, DecodedImageEntry>;
```

`EditorApp` calls the hook once and passes decoded entries to the interactive canvas and every preview. The hook consumes borrowed URLs and never revokes them.

- [ ] **Step 4: Implement one bounded variation-frame composer**

`composeBoundedVariationFrame` creates or resizes a caller-owned offscreen canvas, clears it to transparent, scales from CSS viewport units into bounded pixels, calls `renderDesignLayers`, and returns an isolated straight-alpha `RgbaFrame`. It must not paint editor chrome or neutral/light/dark comparison backgrounds into the frame. It returns `null` until visible assets are decoded. Build the canonical render key from stable serialized layer records, immutable asset IDs, bounded dimensions, and serialized Look.

`VariationPreviewCanvas` uses that composer plus `LookRenderCoordinator.render`. It accepts:

```ts
export interface VariationPreviewCanvasProps {
  surfaceId: string;
  variation: DesignVariation;
  assetsById: Record<string, EditorAsset>;
  imagesById: Record<string, DecodedImageEntry>;
  coordinator: LookRenderCoordinator;
  maxPixelDimension: 240 | 800 | 1600;
  background: '#1f1f1f' | '#f5f5f3' | '#161616';
  zoom?: number;
  ariaLabel: string;
  onFailureChange?: (message: string | null) => void;
}
```

It retains the last ready frame during new work, ignores stale outcomes, falls back to the unprocessed composition after first failure, and calls `clearSurface(surfaceId)` on unmount. It paints the requested display background separately before drawing the transparent processed frame, so changing a Compare background never changes processed artwork or its cache key.

- [ ] **Step 5: Integrate Look processing into the interactive canvas**

Refactor only the paint effect in `EditorCanvas`: use the shared bounded composer and coordinator for display, while pointer geometry and `hitTestDesignLayers` continue to use CSS viewport coordinates and decoded assets. Add `variation`, `imagesById`, `coordinator`, and Look error/retry props; remove internal URL decoding. Original may paint the composed frame synchronously without a worker round trip.

- [ ] **Step 6: Build the Looks inspector**

Use actual `VariationPreviewCanvas` thumbnails for Original plus all eight defaults. `LooksInspector` creates one candidate seed for each unselected seeded thumbnail when the inspector mounts; the thumbnail and the subsequent apply command use the same candidate recipe, so the selected result matches what was shown. The active Look thumbnail always uses the persisted active recipe. Strength and advanced range inputs dispatch complete recipes under stable groups such as `look-strength` and `look-duotone-balance`; blur, pointer-up, change commit, unmount, and Look switch end the active history group.

Use native color swatches, numeric inputs, a background segmented control for halftone, `<details>` for `More`, RotateCcw for reset, Dices for reroll, and RefreshCw for retry. Controls must use the exact ranges in the approved spec.

- [ ] **Step 7: Route the Looks tool through the editor shell**

Extend `EditorTool` and `sectionTitle`. Add the Palette toolbar button. Update `normalizeToolForSelectedLayer` so text selection forces Select only when the current tool is Crop or Adjust; Looks remains active. `EditorInspector` renders `LooksInspector` independent of selected layer. `EditorApp` owns one coordinator for its lifecycle, tracks the previous project/variation IDs to evict removed variations, evicts every prior variation when the project closes or changes, and disposes the coordinator on unmount.

- [ ] **Step 8: Run focused tests and commit**

Run:

```bash
npx tsx --test tests/editor-preview-surface.test.ts tests/editor-compositor.test.ts tests/editor-shell.test.ts tests/editor-history.test.ts
npm run typecheck
npm run build
git diff --check
```

Expected: all focused tests pass; the worker and editor bundle build.

Commit: `feat: add live deterministic Looks to the editor`

---

### Task 6: Responsive Compare Board

**Files:**
- Create: `editor/compareState.ts`
- Create: `components/editor/CompareBoard.tsx`
- Modify: `components/editor/EditorToolbar.tsx`
- Modify: `components/editor/EditorApp.tsx`
- Modify: `tests/editor-shell.test.ts`
- Create: `tests/editor-compare-state.test.ts`
- Modify: `tests/e2e/canvas-editor.spec.ts`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: `VariationPreviewCanvas`, decoded assets, coordinator, schema-3 variations, and `select-variation`.
- Produces: `CompareBackground`, `createCompareSelection`, `reconcileCompareSelection`, `toggleCompareVariation`, `normalizeCompareZoom`, and `CompareBoard`.
- Preserves: Compare state outside project persistence and project save timestamp.

- [ ] **Step 1: Write failing pure Compare-state tests**

```ts
assert.deepEqual(createCompareSelection(['a', 'b', 'c'], 'b'), ['b', 'c']);
assert.deepEqual(reconcileCompareSelection(['b', 'missing'], ['a', 'b', 'c'], 'b'), ['b', 'c']);
assert.deepEqual(toggleCompareVariation(['a', 'b'], 'c', true, ['a', 'b', 'c', 'd']), ['a', 'b', 'c']);
assert.deepEqual(toggleCompareVariation(['a', 'b', 'c', 'd'], 'a', false, ['a', 'b', 'c', 'd']), ['b', 'c', 'd']);
assert.equal(normalizeCompareZoom(24), 50);
assert.equal(normalizeCompareZoom(170), 150);
```

Prove minimum two, maximum four, project-order stability, active-plus-nearest-sibling defaults, deleted-ID reconciliation, and fewer-than-two exit signal.

- [ ] **Step 2: Write failing Compare Board shell tests**

Server-render two-, three-, and four-variation boards. Assert variation checkboxes use IDs, two selected entries cannot be unchecked, a fifth cannot be selected, neutral/light/dark buttons expose pressed state, zoom is 50 through 150, every canvas label contains variation and background, and every tile has `Edit <variation name>`.

Assert Compare toolbar command is disabled below two variations and layer/inspector regions are absent from Compare layout markup.

- [ ] **Step 3: Implement session-state helpers and board UI**

`CompareBoard` props:

```ts
export interface CompareBoardProps {
  variations: DesignVariation[];
  selectedVariationIds: string[];
  background: CompareBackground;
  zoom: number;
  assetsById: Record<string, EditorAsset>;
  imagesById: Record<string, DecodedImageEntry>;
  coordinator: LookRenderCoordinator;
  onSelectionChange: (ids: string[]) => void;
  onBackgroundChange: (background: CompareBackground) => void;
  onZoomChange: (zoom: number) => void;
  onEditVariation: (variationId: string) => void;
  onClose: () => void;
}
```

Use a full-width board header, checkboxes in a compact menu, a three-button segmented background control, one zoom slider, and equal unframed preview regions. Desktop uses two columns; mobile uses `grid-auto-flow: column`, `grid-auto-columns: calc(100vw - 32px)`, scroll snap, and no nested cards.

- [ ] **Step 4: Integrate Compare view without persistence**

`EditorApp` owns `compareOpen`, IDs, background, zoom, and Compare-button focus ref. Opening initializes active-plus-sibling only when current selection is invalid. Deleting or switching projects reconciles IDs in an effect. If fewer than two valid variations remain, close and return focus.

While open, the content grid omits the 280-pixel layer/inspector rail and mobile 240-pixel inspector row. It renders the toolbar plus Compare Board. Editing tools are disabled with accessible text while Compare is active. `Edit variation` dispatches `select-variation`, closes Compare, selects the Select tool, and returns focus to the Compare command.

- [ ] **Step 5: Add focused browser behavior**

Add one Chromium test that creates three named variations with three different Looks, opens Compare, selects all three, changes dark/light backgrounds and zoom, confirms all preview canvases are nonblank and equally sized, edits the second variation, and proves the editor returns with that variation active. Read IndexedDB before and after background/zoom changes and assert project `updatedAt` and serialized bytes are unchanged.

At 390 by 844, assert equal horizontal preview widths, scrollability, full viewport containment, no horizontal document overflow, and no layer or inspector overlap.

- [ ] **Step 6: Run focused tests and commit**

Run:

```bash
npx tsx --test tests/editor-compare-state.test.ts tests/editor-shell.test.ts tests/editor-preview-surface.test.ts
npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "compares Looks across variations"
npm run typecheck
git diff --check
```

Expected: pure, component, focused browser, and typecheck gates pass.

Commit: `feat: compare variation Looks side by side`

---

### Task 7: Persistence Acceptance, Visual Verification, And Protected Preview

**Files:**
- Modify: `tests/e2e/canvas-editor.spec.ts`
- Modify: `tests/editor-bundle-boundary.test.ts` only for intentional Looks/Compare vocabulary
- Modify: `.superpowers/sdd/progress.md`
- Create: `.superpowers/sdd/phase-2b-acceptance-report.md`

**Interfaces:**
- Consumes: complete Phase 2B implementation.
- Produces: persistence evidence, deterministic canvas evidence, desktop/mobile screenshots, full verification counts, and a protected Vercel preview.

- [ ] **Step 1: Add the desktop Looks persistence acceptance flow**

At 1440 by 900:

1. Import a transparent raster and add text.
2. Duplicate until three named variations exist.
3. Apply Duotone, Graphic Halftone, and Distressed Print with non-default parameters and fixed seeds.
4. Capture exact main-canvas PNG data for each variation.
5. Wait for `Saved locally`, read schema-3 IndexedDB state, and assert complete normalized recipes.
6. Reload and reopen the project.
7. Assert complete project state equality and exact canvas PNG equality for every variation.
8. Reroll one seeded variation, assert the canvas changes, undo, and assert the exact prior PNG returns.
9. Open Compare with all three and capture `test-results/phase-2b/desktop-looks-compare-1440x900.png`.

- [ ] **Step 2: Add the mobile Looks and Compare acceptance flow**

At 390 by 844, apply Vintage Ink, change Strength, open `More`, edit grain, reroll, close/reopen the tool, and verify visible values plus persisted recipe. Create a second variation, open Compare, switch dark background, change zoom, horizontally scroll, edit the second variation, and capture `test-results/phase-2b/mobile-looks-compare-390x844.png`.

Assert canvas, board controls, preview strip, and toolbar have positive dimensions, every edge is within the viewport, the document does not overflow horizontally, and visible regions do not overlap incoherently.

- [ ] **Step 3: Verify stale worker failure and retry in the browser**

Instrument `Worker.prototype.postMessage` before app load so one obsolete request fails after a newer request succeeds. Assert the newer canvas remains unchanged and no error appears. Then fail the current request, assert `Look preview failed.` and Retry are visible, restore worker behavior, retry, and assert the error clears without changing the persisted recipe.

- [ ] **Step 4: Run the complete local gate**

Run:

```bash
npm run verify
git diff --check
```

Expected: typecheck, production build, all unit/style tests, and all Playwright tests pass with no whitespace errors.

- [ ] **Step 5: Inspect both screenshots at original resolution**

Verify every canvas is nonblank, Looks are visibly distinct, selected recipes and variation names agree with controls, all text fits, Compare frames are equal, mobile previews scroll without resizing the toolbar, and no control or label overlaps another region.

- [ ] **Step 6: Record evidence and commit**

Write `.superpowers/sdd/phase-2b-acceptance-report.md` with exact commands, counts, screenshot dimensions, observed visual checks, known browser scope, and worktree status. Update the Phase 2B ledger lines in `.superpowers/sdd/progress.md`.

Commit: `test: verify phase 2b Looks and Compare Board`

- [ ] **Step 7: Run final whole-range review**

Generate a review package from the Phase 2B execution base through HEAD. The reviewer must inspect schema migration, source immutability, history grouping, byte-level determinism, alpha behavior, worker authority, cache disposal, shared rendering, mobile focus/layout, Compare non-persistence, and deferred-scope boundaries. Resolve every Critical or Important finding in one consolidated fix pass, rerun affected focused tests, and re-review before continuing.

- [ ] **Step 8: Re-run final verification after review fixes**

Run:

```bash
npm run verify
git diff --check
git status --short
```

Expected: every gate passes and the worktree is clean.

- [ ] **Step 9: Deploy and smoke-test a protected preview**

Run `npx vercel deploy --yes`; never use `--prod`. Record deployment ID, preview URL, inspector URL, ready state, and bundle filenames. Verify authenticated `/` and `/privacy` return HTTP 200 with `npx vercel curl`. Verify unauthenticated `/` redirects to Vercel SSO. Add final deployment evidence to the report and ledger, then commit bookkeeping.

---

## Final Review Checklist

- Existing projects migrate to schema 3 without changing source, asset, layer, text, or selection identity.
- Every variation has one normalized Look; duplication copies it without shared mutable data.
- Look apply, parameter edits, reset, and reroll are variation-scoped and undoable.
- All eight Looks produce exact deterministic bytes under fixed fixtures.
- Strength blending uses premultiplied alpha and avoids transparent-edge color leakage.
- Halftone and distress preserve transparency except for explicit solid halftone background.
- Main canvas, thumbnails, and Compare tiles share the compositor, processor, and coordinator.
- Missing visible assets do not cache incomplete compositions.
- Stale worker results and failures cannot replace current surfaces.
- Cache memory, listeners, transferred buffers, and worker lifecycle are bounded and disposed.
- Compare state never changes project bytes or timestamps.
- Desktop and mobile Looks/Compare workflows remain visible, keyboard reachable, and non-overlapping.
- Full local verification and protected-preview smoke tests pass.
- No trace, SVG, product, mockup, Print Lens, treatment, production-workflow, collaboration, or AI surface enters the editor bundle.
