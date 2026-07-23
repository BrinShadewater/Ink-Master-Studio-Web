# Phase 2C Image Preparation, Vector Trace, And SVG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reversible local background removal, bounded erase/restore correction, adjustable vector trace layers, and validated SVG master export to the canvas-first editor.

**Architecture:** Schema 4 keeps uploaded assets immutable and adds normalized image-preparation state plus linked trace layers. Separate pure processors and latest-wins module-worker coordinators generate bounded prepared RGBA frames and trace geometry; the workspace persists each immutable generated asset before atomically publishing its project reference. The existing compositor, history, inspector, and project repository remain the integration boundaries, with one fixed 1000-by-1000 internal surface shared by preview, hit testing, Compare Board, and SVG export.

**Tech Stack:** React 19, TypeScript 5.8, Canvas 2D, IndexedDB, Vite module workers, `imagetracerjs` 1.2.6, native DOMParser/XMLSerializer, Tailwind CSS, Node test runner with `tsx`, Playwright Chromium, Vercel preview deployment.

## Global Constraints

- Uploaded source assets are immutable; generated cleanup, prepared PNG, and trace SVG assets are immutable after storage.
- Background removal is local and deterministic. It cannot call a network service, AI client, or legacy production processor.
- Automatic removal uses deterministic edge-connected perceptual matching; picked mode adds exactly one selected connected-region seed.
- `Tolerance` is 0 through 100 with default 24; `Edge Feather` is 0 through 8 canonical design pixels with default 1.
- Erase/restore has one size control from 8 through 128 canonical design pixels and no hardness, opacity, brush library, selection, or general mask surface.
- Trace input is the selected image after crop, brightness, contrast, saturation, background removal, and corrections, but before layer transform, opacity, and variation-wide Look.
- Trace controls are exactly Colors 2 through 16 default 6, Detail 0 through 100 default 60, Smoothing 0 through 100 default 35, Blur 0 through 5 default 0, and editable six-digit hexadecimal palette swatches.
- Background-removal work is bounded to a 2048-pixel longest edge; trace input is bounded to a 1280-pixel longest edge.
- Previous valid generated output remains visible while replacement work runs; only the latest matching request may publish.
- SVG export uses `viewBox="0 0 1000 1000"`, exact visible layer order, editable text, and no raster embedding, scripts, event handlers, external references, stylesheets, animation, or `foreignObject`.
- SVG export is blocked by any visible raster, non-Original Look, stale/failed/processing trace, missing trace asset, or empty vector variation.
- Do not add products, placements, mockups, Print Lens, DPI analysis, provider integration, validation receipts, general photographic segmentation, generative cleanup, path editing, drawing, shapes, SVG import, or unrelated legacy retirement.
- Keep the existing desktop inspector and mobile lower-inspector layout; focused erase/restore interaction stays on the main canvas.
- Each task receives focused tests, a review gate, a progress-ledger update, and one commit before the next task begins.

---

## File Structure

- `editor/imagePrepModel.ts`: cleanup settings, correction-document schema, normalization, fingerprints, defaults, and generated-asset roles.
- `editor/backgroundRemovalProcessor.ts`: pure RGBA edge sampling, perceptual flood fill, feathering, and correction-stroke rasterization.
- `editor/backgroundRemovalCoordinator.ts`: latest-wins worker protocol, retry authority, cancellation, and bounded result cache.
- `editor/backgroundRemovalWorker.ts`: validated module-worker adapter around the pure cleanup processor.
- `editor/imagePrepInput.ts`: browser Canvas 2D extraction of cropped and adjusted source pixels plus deterministic input fingerprinting.
- `editor/generatedAssetLifecycle.ts`: project/history asset-reference collection, generated-asset eligibility, and orphan selection.
- `editor/traceModel.ts`: trace settings, source frame, safe trace document/path types, normalization, and stable serialization.
- `editor/traceProcessor.ts`: isolated `imagetracerjs` option mapping and trace request processing.
- `editor/traceWorker.ts`: validated module-worker adapter for ImageTracer.
- `editor/traceCoordinator.ts`: trace request authority, retry, palette-only geometry reuse, and result validation.
- `editor/traceSanitizer.ts`: native XML parsing into a strict safe trace document and canonical SVG serialization.
- `editor/canonicalSurface.ts`: 1000-by-1000 surface constants, contain geometry, display/design point conversion, and transforms.
- `editor/svgExport.ts`: export eligibility, shared layer-to-SVG transforms, standalone serialization, reparsing, and validation.
- `components/editor/BackgroundRemovalInspector.tsx`: automatic/picked controls, progress, retry, corrections, and reset.
- `components/editor/TraceInspector.tsx`: create/update trace controls, palette, progress, retry, and restore-source.
- `components/editor/ExportMenu.tsx`: SVG eligibility display and download command.
- `components/editor/useBackgroundRemovalWorkflow.ts`: cleanup generation, PNG encoding, correction-asset commits, and current-layer authority.
- `components/editor/useTraceWorkflow.ts`: trace input composition, sanitizer invocation, SVG asset commits, and current-layer authority.
- Existing `editor/model.ts`, `history.ts`, `projectRepository.ts`, `useEditorWorkspace.ts`, `compositor.ts`, `geometry.ts`, preview files, editor shell components, and tests remain their current ownership boundaries.

---

### Task 1: Schema 4, History Commands, And Generated-Asset Authority

**Files:**
- Create: `editor/imagePrepModel.ts`
- Create: `editor/traceModel.ts`
- Create: `editor/generatedAssetLifecycle.ts`
- Modify: `editor/model.ts`
- Modify: `editor/history.ts`
- Modify: `editor/useEditorWorkspace.ts`
- Modify: `tests/editor-model.test.ts`
- Modify: `tests/editor-history.test.ts`
- Modify: `tests/editor-workspace.test.ts`
- Modify: `tests/editor-repository.test.ts`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Produces: `BackgroundRemovalSettings`, `CleanupCorrectionDocument`, `CleanupStroke`, `createDefaultBackgroundRemoval`, `normalizeBackgroundRemoval`, `serializeBackgroundRemovalInput`.
- Produces: `TraceSettings`, `TraceSourceFrame`, `SafeTraceDocument`, `SafeTracePath`, `createDefaultTraceSettings`, `normalizeTraceSettings`, `serializeTraceInput`, and `createTraceFingerprint`.
- Produces: schema-4 `ImageLayer.backgroundRemoval`, `TraceLayer`, `isTraceLayer`, and `DesignLayer = ImageLayer | TextLayer | TraceLayer`.
- Produces: `GeneratedAssetCommand` and `EditorWorkspace.commitGeneratedAsset(asset, command)`.
- Produces: `collectProjectAssetIds`, `collectHistoryAssetIds`, and `findOrphanedGeneratedAssetIds`.
- Preserves: schema 1 through 3 migration, source identity, variation-scoped undo, 100-state history cap, and save-before-reference authority.

- [ ] **Step 1: Write failing schema-4 model tests**

Add table-driven tests that cover all normalization boundaries, immutable caller input, malformed correction documents, trace-source validation, schema 1 through 3 migration, and schema-4 round trips.

```ts
import {
  createDefaultBackgroundRemoval,
  normalizeBackgroundRemoval,
} from '../editor/imagePrepModel';
import {
  createDefaultTraceSettings,
  normalizeTraceSettings,
} from '../editor/traceModel';

assert.deepEqual(createDefaultBackgroundRemoval(), {
  enabled: false,
  mode: 'auto',
  pickedColor: null,
  pickedPoint: null,
  tolerance: 24,
  edgeFeather: 1,
  correctionAssetId: null,
  preparedAssetId: null,
  inputFingerprint: '',
});
assert.deepEqual(normalizeTraceSettings({
  colors: 99, detail: -2, smoothing: 45.7, blur: 7, palette: ['#ABC', 'bad'],
}), {
  colors: 16, detail: 0, smoothing: 46, blur: 5, palette: ['#aabbcc'],
});
assert.equal(migrateEditorProject(schema3Project, [sourceAsset]).schemaVersion, 4);
assert.deepEqual(
  (migrateEditorProject(schema3Project, [sourceAsset]).variations[0].layers[0] as ImageLayer)
    .backgroundRemoval,
  createDefaultBackgroundRemoval(),
);
```

Prove a malformed schema-4 trace whose `sourceLayerId` does not resolve to an image layer is dropped, while a valid stale trace with `svgAssetId: null` survives.

- [ ] **Step 2: Run model tests and confirm the red state**

Run:

```bash
npx tsx --test tests/editor-model.test.ts tests/editor-repository.test.ts
```

Expected: FAIL because schema 4 and the new model modules do not exist.

- [ ] **Step 3: Implement dependency-free preparation and trace models**

Define these exact public contracts without importing React, Canvas, storage, or worker modules:

```ts
export interface NormalizedPoint { x: number; y: number }
export interface CleanupStroke {
  mode: 'erase' | 'restore';
  size: number;
  points: NormalizedPoint[];
}
export interface CleanupCorrectionDocument {
  schemaVersion: 1;
  strokes: CleanupStroke[];
}
export interface BackgroundRemovalSettings {
  enabled: boolean;
  mode: 'auto' | 'picked';
  pickedColor: string | null;
  pickedPoint: NormalizedPoint | null;
  tolerance: number;
  edgeFeather: number;
  correctionAssetId: string | null;
  preparedAssetId: string | null;
  inputFingerprint: string;
}
```

```ts
export interface TraceSettings {
  colors: number;
  detail: number;
  smoothing: number;
  blur: number;
  palette: string[];
}
export interface TraceSourceFrame {
  sourceWidth: number;
  sourceHeight: number;
  crop: { x: number; y: number; width: number; height: number };
}
export interface SafeTracePath {
  d: string;
  fill: string;
  stroke: string | null;
  strokeWidth: number;
  opacity: number;
  transform: string | null;
}
export interface SafeTraceDocument {
  width: number;
  height: number;
  paths: SafeTracePath[];
}

export const createTraceFingerprint = (
  sourceFingerprint: string,
  settings: TraceSettings,
): string;
```

Normalization rounds numeric controls before clamping, lowercases valid three- or six-digit hex values to six digits, caps correction documents at 2,000 strokes and 20,000 points per stroke, drops consecutive duplicate points, and rejects non-finite coordinates.

- [ ] **Step 4: Migrate the editor model to schema 4**

Set `EDITOR_PROJECT_SCHEMA_VERSION = 4`, add `backgroundRemoval` to every image layer, add `TraceLayer`, add `remove-background` and `trace` to `EditorTool`, and update all discriminated helpers.

```ts
export interface TraceLayer {
  id: string;
  type: 'trace';
  name: string;
  sourceLayerId: string;
  svgAssetId: string | null;
  visible: boolean;
  opacity: number;
  transform: LayerTransform;
  settings: TraceSettings;
  sourceFingerprint: string;
  sourceFrame: TraceSourceFrame;
}
```

`duplicateVariation` remaps each duplicated trace's `sourceLayerId` to the duplicated image-layer ID using an old-to-new layer-ID map. It shares immutable asset IDs and preserves stale state.

`EditorAsset` gains optional `role?: 'prepared-image' | 'cleanup-corrections' | 'trace-svg'`; an absent role means uploaded source. Extend `createEditorAsset` with an optional fourth argument containing the generated role while preserving every existing call.

Project hydration still requires every uploaded image layer asset. Missing prepared or correction assets are cleared during normalization. A trace with a missing SVG asset remains in the layer stack with `svgAssetId: null` and an empty `sourceFingerprint`, allowing explicit regeneration instead of making the project impossible to open.

- [ ] **Step 5: Write failing history and asset-authority tests**

Cover one-step trace creation/source hiding, grouped cleanup settings, non-history result publication, stale fingerprint rejection, trace staleness after crop/adjust/cleanup changes, source-transform independence, restore-source, undo/redo asset restoration, and generated orphan detection.

```ts
history = reduceEditorHistory(history, {
  type: 'add-trace-layer',
  sourceLayerId: source.id,
  layer: traceLayer,
});
assert.equal(getActiveVariation(history.present).layers[0].visible, false);
assert.equal(getActiveVariation(history.present).selectedLayerId, traceLayer.id);
history = reduceEditorHistory(history, { type: 'undo' });
assert.equal(getActiveVariation(history.present).layers.length, 1);
assert.equal(getActiveVariation(history.present).layers[0].visible, true);

const stale = reduceEditorHistory(history, {
  type: 'publish-background-result',
  layerId: source.id,
  expectedInputFingerprint: 'old',
  preparedAssetId: 'generated-old',
});
assert.strictEqual(stale, history);
```

Assert `findOrphanedGeneratedAssetIds` excludes all uploaded assets and all generated IDs referenced by present, past, or future variation states.

- [ ] **Step 6: Run history tests and confirm the red state**

Run:

```bash
npx tsx --test tests/editor-history.test.ts tests/editor-workspace.test.ts
```

Expected: FAIL because the new commands and generated-asset commit interface do not exist.

- [ ] **Step 7: Implement semantic and publication commands**

Add these commands with exact authority behavior:

```ts
| { type: 'set-background-removal'; layerId: string; settings: BackgroundRemovalSettings; historyGroup?: string }
| { type: 'publish-background-result'; layerId: string; expectedInputFingerprint: string; preparedAssetId: string }
| { type: 'add-trace-layer'; sourceLayerId: string; layer: TraceLayer }
| { type: 'set-trace-settings'; layerId: string; settings: TraceSettings; historyGroup?: string }
| {
    type: 'publish-trace-result';
    layerId: string;
    expectedSourceFingerprint: string;
    expectedTraceFingerprint: string;
    svgAssetId: string;
    palette: string[];
  }
| { type: 'restore-trace-source'; layerId: string }
```

`publish-background-result` and `publish-trace-result` update present state without calling `recordVariationEdit`. They are no-ops unless IDs and fingerprints match current semantic state. Trace publication recomputes the linked source fingerprint and `createTraceFingerprint(currentSourceFingerprint, currentSettings)` inside the reducer; both must match the command. Crop, adjustment, and cleanup changes clear linked traces' `sourceFingerprint` but retain their previous SVG IDs. Image transform and opacity changes do not stale traces.

- [ ] **Step 8: Implement save-before-reference generated-asset commits**

Expose only the publication-capable command subset:

```ts
export type GeneratedAssetCommand =
  | Extract<EditorCommand, { type: 'set-background-removal' }>
  | Extract<EditorCommand, { type: 'publish-background-result' }>
  | Extract<EditorCommand, { type: 'add-trace-layer' }>
  | Extract<EditorCommand, { type: 'publish-trace-result' }>;

commitGeneratedAsset: (
  asset: EditorAsset,
  command: GeneratedAssetCommand,
) => Promise<boolean>;
```

The method saves the immutable asset first, reduces against `historyRef.current`, deletes the asset if the command is stale/no-op, then updates history, `assetsById`, and URL ownership as one React publication. After every semantic history change, select generated orphans against present/past/future references, delete them through `deleteEditorAsset`, and reconcile URLs only if workspace authority still matches.

- [ ] **Step 9: Run focused tests and commit**

Run:

```bash
npx tsx --test tests/editor-model.test.ts tests/editor-history.test.ts tests/editor-workspace.test.ts tests/editor-repository.test.ts
npm run typecheck
git diff --check
```

Expected: all focused tests and typecheck pass; no whitespace errors.

Commit: `feat: add phase 2c model and asset authority`

---

### Task 2: Deterministic Background-Removal And Correction Processor

**Files:**
- Create: `editor/backgroundRemovalProcessor.ts`
- Create: `tests/editor-background-removal-processor.test.ts`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: normalized `BackgroundRemovalSettings` and `CleanupCorrectionDocument`.
- Produces: `RgbaFrame`, `BackgroundRemovalInput`, `applyBackgroundRemoval`, `samplePickedColor`, and `resolveBackgroundRemovalScale`.
- Guarantees: pure deterministic RGBA output, 2048-pixel caller bound, perceptual matching, connected-region protection, canonical brush/feather scaling, and no DOM/storage/network imports.

- [ ] **Step 1: Write failing deterministic pixel fixtures**

Use small hand-authored RGBA fixtures rather than screenshot tolerances. Cover light/dark/colored boundaries, an uneven border, enclosed same-color artwork, transparent source pixels, picked enclosed regions, tolerance boundaries, feather alpha, erase, restore, overlapping stroke order, and source immutability.

```ts
const frame = rgbaFrame(5, 5, [
  'ffffff','ffffff','ffffff','ffffff','ffffff',
  'ffffff','111111','ffffff','111111','ffffff',
  'ffffff','111111','ffffff','111111','ffffff',
  'ffffff','111111','111111','111111','ffffff',
  'ffffff','ffffff','ffffff','ffffff','ffffff',
]);
const result = applyBackgroundRemoval({
  frame,
  settings: { ...createDefaultBackgroundRemoval(), enabled: true },
  corrections: { schemaVersion: 1, strokes: [] },
});
assert.equal(alphaAt(result, 0, 0), 0);
assert.equal(alphaAt(result, 2, 2), 255, 'enclosed white detail stays');
assert.deepEqual(frame.pixels, originalPixels, 'caller frame stays immutable');
```

Assert repeated calls return exactly equal pixel arrays and never alter RGB values where alpha remains 255.

- [ ] **Step 2: Run the processor tests and confirm the red state**

Run:

```bash
npx tsx --test tests/editor-background-removal-processor.test.ts
```

Expected: FAIL because the processor module does not exist.

- [ ] **Step 3: Implement perceptual edge-connected removal**

Expose this exact pure entry point:

```ts
export interface BackgroundRemovalInput {
  frame: RgbaFrame;
  settings: BackgroundRemovalSettings;
  corrections: CleanupCorrectionDocument;
}

export const applyBackgroundRemoval = (
  input: BackgroundRemovalInput,
): RgbaFrame;
```

Convert sRGB to OKLab with fixed constants, map tolerance 0 through 100 to a documented OKLab distance of 0 through 0.35, and sample the border at a deterministic stride `max(1, floor(perimeter / 512))`. Quantize border samples into fixed OKLab cells, select clusters representing at least 2 percent of sampled border pixels, and flood matching pixels with an iterative eight-neighbor queue. Auto mode seeds matching boundary pixels; picked mode also seeds the normalized selected point.

- [ ] **Step 4: Implement deterministic feather and correction strokes**

Use a bounded two-pass chamfer distance from removed to retained pixels. Map canonical feather and brush sizes by:

```ts
const designToPixel = Math.max(frame.width, frame.height) / 1000;
const featherPixels = Math.round(settings.edgeFeather * designToPixel);
const brushRadius = Math.max(1, Math.round(stroke.size * designToPixel / 2));
```

Rasterize normalized stroke segments with integer circle stamps along a deterministic Bresenham path. `erase` sets covered alpha to 0; `restore` copies covered alpha from the immutable source frame. Apply strokes in document order after automatic removal. Fully transparent pixels must have RGB zeroed to prevent hidden-color fringes.

- [ ] **Step 5: Run focused tests and commit**

Run:

```bash
npx tsx --test tests/editor-background-removal-processor.test.ts
npm run typecheck
git diff --check
```

Expected: all processor fixtures pass and repeated output is exact.

Commit: `feat: add deterministic background removal processor`

---

### Task 3: Background-Removal Worker, Authority, And Input Composition

**Files:**
- Create: `editor/backgroundRemovalCoordinator.ts`
- Create: `editor/backgroundRemovalWorker.ts`
- Create: `editor/imagePrepInput.ts`
- Create: `tests/editor-background-removal-coordinator.test.ts`
- Create: `tests/editor-image-prep-input.test.ts`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: `applyBackgroundRemoval`, `RgbaFrame`, normalized settings, and corrections.
- Produces: `BackgroundRemovalCoordinator`, `BackgroundRemovalOutcome`, `createBrowserBackgroundRemovalWorker`, `composeImagePrepInput`, `createImagePrepFingerprint`, and `encodeRgbaPng`.
- Guarantees: latest-wins publication, same-key retry, malformed-response rejection, 2048-pixel bound, crop/adjust order, timeout cleanup, and no synchronous fallback.

- [ ] **Step 1: Write failing coordinator authority tests**

Clone the fake-worker style used by `tests/editor-look-render-coordinator.test.ts`. Cover stale success/failure, malformed dimensions, cache isolation by fingerprint, same-key retry, worker crash, post failure, timeout, surface release, and dispose.

```ts
const first = coordinator.render(request('layer-a', 'fingerprint-a'));
const second = coordinator.render(request('layer-a', 'fingerprint-b'));
assert.deepEqual(await first, { status: 'stale', inputFingerprint: 'fingerprint-a' });
worker.succeed(firstPost, frame(0, 0, 0, 0));
assert.equal(worker.posts.length, 2, 'stale output never enters the cache');
worker.succeed(secondPost, frame(10, 20, 30, 255));
assert.equal((await second).status, 'ready');
```

Use an injected timer interface so the timeout test advances synchronously without sleeping.

- [ ] **Step 2: Run coordinator tests and confirm the red state**

Run:

```bash
npx tsx --test tests/editor-background-removal-coordinator.test.ts
```

Expected: FAIL because the coordinator does not exist.

- [ ] **Step 3: Implement the validated worker protocol**

Use these message identities:

```ts
export interface BackgroundRemovalRequest {
  requestId: number;
  surfaceId: string;
  inputFingerprint: string;
  width: number;
  height: number;
  pixels: ArrayBuffer;
  settings: BackgroundRemovalSettings;
  corrections: CleanupCorrectionDocument;
}
export type BackgroundRemovalOutcome =
  | { status: 'ready'; inputFingerprint: string; frame: RgbaFrame }
  | { status: 'failed'; inputFingerprint: string; message: 'Background removal failed.' }
  | { status: 'stale'; inputFingerprint: string };
```

Validate exact keys, safe integer dimensions, `width * height * 4`, normalized settings, normalized correction document, response identity, and returned buffer size. Use a 15-second default timeout, an LRU pixel cache capped at 32 MiB, and transfer cloned pixel buffers. Dispose terminates the worker and settles pending work stale.

- [ ] **Step 4: Write failing crop/adjust/input tests**

Cover contain-bound calculation through 2048 pixels, exact crop dimensions, brightness/contrast/saturation application before removal, transparent preservation, fingerprint stability, and fingerprint changes for source bytes identity, crop, adjustments, removal settings, picked point, or correction asset.

```ts
assert.deepEqual(resolveImagePrepSize({ width: 5000, height: 2500 }), {
  width: 2048,
  height: 1024,
});
assert.equal(createImagePrepFingerprint(input), createImagePrepFingerprint(structuredClone(input)));
assert.notEqual(
  createImagePrepFingerprint(input),
  createImagePrepFingerprint({ ...input, crop: { ...input.crop, x: 0.1 } }),
);
```

- [ ] **Step 5: Implement browser input composition and PNG encoding**

`composeImagePrepInput` receives the decoded source, original metadata, crop, and adjustments. It draws only the crop into a bounded canvas, applies the same filter string as the compositor, and returns straight-alpha RGBA.

```ts
export interface ComposedImagePrepInput {
  frame: RgbaFrame;
  sourceFrame: TraceSourceFrame;
  inputFingerprint: string;
}

export const composeImagePrepInput = (
  canvas: HTMLCanvasElement,
  image: CanvasImageSource,
  source: Size,
  layer: ImageLayer,
  correctionDigest: string,
): ComposedImagePrepInput;
```

`encodeRgbaPng` writes the ready frame to a scratch canvas, calls `toBlob('image/png')`, and rejects null results with `Could not encode prepared image.`.

- [ ] **Step 6: Run focused tests and commit**

Run:

```bash
npx tsx --test tests/editor-background-removal-processor.test.ts tests/editor-background-removal-coordinator.test.ts tests/editor-image-prep-input.test.ts
npm run typecheck
npm run build
git diff --check
```

Expected: focused tests, typecheck, and production worker build pass.

Commit: `feat: coordinate background removal rendering`

---

### Task 4: Remove-Background Inspector And Focused Brush Workflow

**Files:**
- Create: `components/editor/BackgroundRemovalInspector.tsx`
- Create: `components/editor/useBackgroundRemovalWorkflow.ts`
- Modify: `editor/compositor.ts`
- Modify: `components/editor/EditorToolbar.tsx`
- Modify: `components/editor/EditorInspector.tsx`
- Modify: `components/editor/EditorCanvas.tsx`
- Modify: `components/editor/EditorApp.tsx`
- Modify: `components/editor/VariationPreviewCanvas.tsx`
- Modify: `tests/editor-compositor.test.ts`
- Modify: `tests/editor-shell.test.ts`
- Modify: `tests/editor-preview-surface.test.ts`
- Modify: `tests/editor-workspace.test.ts`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: Task 1 generated-asset commits, Task 2 settings/corrections, and Task 3 coordinator/input composition.
- Produces: `BackgroundRemovalInspector`, `useBackgroundRemovalWorkflow`, prepared-image compositor selection, picked-color canvas mode, and erase/restore pointer strokes.
- Guarantees: one undo entry per control gesture or completed stroke, previous-valid preview retention, original-on-initial-failure, explicit retry, and reset without source mutation.

- [ ] **Step 1: Write failing shell and compositor tests**

Assert toolbar availability only for selected image layers, exact control IDs/ranges/defaults, disabled processing states, error/retry copy, and no controls for text/trace layers.

```ts
assert.match(markup, /aria-label="Remove background"/);
assert.match(markup, /id="editor-background-tolerance"[^>]*min="0"[^>]*max="100"[^>]*step="1"/);
assert.match(markup, /id="editor-background-feather"[^>]*min="0"[^>]*max="8"[^>]*step="1"/);
assert.match(markup, /id="editor-background-brush-size"[^>]*min="8"[^>]*max="128"[^>]*step="1"/);
assert.match(markup, /aria-label="Erase background"/);
assert.match(markup, /aria-label="Restore background"/);
```

Compositor tests prove a valid prepared asset supplies pixels while original metadata and crop still define geometry; a missing prepared asset falls back to the original; hidden images never block composition.

- [ ] **Step 2: Run shell/compositor tests and confirm the red state**

Run:

```bash
npx tsx --test tests/editor-shell.test.ts tests/editor-compositor.test.ts tests/editor-preview-surface.test.ts
```

Expected: FAIL because the tool, inspector, and prepared-image compositor path do not exist.

- [ ] **Step 3: Implement the workflow hook**

Use one coordinator owned by `EditorApp` and one hook request surface per selected image layer.

```ts
export interface BackgroundRemovalWorkflow {
  status: 'idle' | 'processing' | 'ready' | 'failed';
  error: string | null;
  retry: () => void;
  pickColor: (point: NormalizedPoint) => void;
  commitStroke: (stroke: CleanupStroke) => Promise<void>;
  clearCorrections: () => Promise<void>;
}
```

Read and normalize correction blobs before requests. On ready, encode PNG, create a `prepared-image` asset with cropped frame dimensions, and call `commitGeneratedAsset` with `publish-background-result`. On correction commit, serialize a schema-1 correction document to `application/vnd.inkmaster.cleanup+json`, persist it as `cleanup-corrections`, then publish `set-background-removal`. Reject any completion whose project, variation, layer, source asset, or fingerprint changed.

- [ ] **Step 4: Implement inspector controls and grouped history**

Add `remove-background` to the toolbar with Lucide `WandSparkles`. The inspector has an enable command, `Auto`/`Pick Color` segmented buttons, tolerance and feather ranges, `Erase`/`Restore` segmented buttons, brush size, `Done`, `Clear Corrections`, `Reset Background`, processing status, retry, and concise failure text.

Every range dispatch uses a stable history group and closes it on pointer/touch/key commit:

```ts
dispatch({
  type: 'set-background-removal',
  layerId: layer.id,
  settings: { ...layer.backgroundRemoval, tolerance: value },
  historyGroup: 'background-tolerance',
});
```

Reset restores `createDefaultBackgroundRemoval()` in one edit. Clear Corrections sets only `correctionAssetId` to null and retains automatic settings.

- [ ] **Step 5: Implement focused canvas picking and strokes**

Extend `EditorCanvas` pointer state with mutually exclusive `pick-background`, `erase-background`, and `restore-background` modes. Convert pointer coordinates through current layer rotation/flip and draw rectangle into crop-local normalized coordinates. Ignore points outside the selected image bounds.

Picked color is sampled from the current adjusted pre-removal input frame, not from the prepared transparent preview. Commit the sampled lowercase hex color and crop-local point together.

For a stroke, collect coalesced pointer events, clamp points to 0 through 1, drop consecutive duplicates, render a stable circular cursor overlay, and call `commitStroke` only on pointer up. Pointer cancel discards the draft. Escape or `Done` returns to remove-background inspector idle mode without changing the active editor tool.

- [ ] **Step 6: Route prepared assets through every preview surface**

Extend canonical layer serialization/render keys with background-removal settings and selected prepared asset identity. `renderImageLayer` uses:

```ts
const prepared = layer.backgroundRemoval.enabled
  ? assets.imagesById[layer.backgroundRemoval.preparedAssetId ?? '']
  : undefined;
const image = prepared ?? assets.imagesById[layer.assetId];
const sourceRect = prepared
  ? { x: 0, y: 0, width: prepared.width, height: prepared.height }
  : getCroppedSourceRect(sourceMetadata, layer.crop);
```

Geometry always uses original source metadata and crop. Compare Board, Look thumbnails, and the main canvas therefore show the same valid prepared result.

- [ ] **Step 7: Run focused tests and commit**

Run:

```bash
npx tsx --test tests/editor-shell.test.ts tests/editor-compositor.test.ts tests/editor-preview-surface.test.ts tests/editor-workspace.test.ts
npm run typecheck
npm run build
git diff --check
```

Expected: focused tests, typecheck, and worker build pass.

Commit: `feat: add reversible background cleanup workflow`

---

### Task 5: Deterministic Trace Engine, Sanitization, And Coordinator

**Files:**
- Create: `editor/imagetracerjs.d.ts`
- Create: `editor/traceProcessor.ts`
- Create: `editor/traceWorker.ts`
- Create: `editor/traceCoordinator.ts`
- Create: `editor/traceSanitizer.ts`
- Create: `tests/editor-trace-processor.test.ts`
- Create: `tests/editor-trace-coordinator.test.ts`
- Create: `tests/editor-trace-sanitizer.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: Task 1 trace settings/document types and Task 3 bounded RGBA input.
- Produces: `mapTraceOptions`, `traceRgbaFrame`, `TraceCoordinator`, `createBrowserTraceWorker`, `sanitizeTraceSvg`, `serializeSafeTraceDocument`, and `recolorSafeTraceDocument`.
- Guarantees: deterministic ImageTracer mapping, 1280-pixel bound, safe native XML parsing, geometry reuse for palette-only edits, latest-wins authority, and no legacy production imports.

- [ ] **Step 1: Add Node-only XML test support and type the installed tracer**

Install the XML implementation as a dev dependency only:

```bash
npm install --save-dev @xmldom/xmldom@0.8.11
```

Declare only the ImageTracer calls used by this phase:

```ts
declare module 'imagetracerjs' {
  export interface ImageTracerOptions {
    numberofcolors: number;
    ltres: number;
    qtres: number;
    pathomit: number;
    blurradius: number;
    colorsampling: 2;
    viewbox: true;
    strokewidth: 1;
    desc: false;
    pal?: Array<{ r: number; g: number; b: number; a: number }>;
  }
  const ImageTracer: {
    imagedataToSVG(
      imageData: { width: number; height: number; data: Uint8ClampedArray },
      options: ImageTracerOptions,
    ): string;
  };
  export default ImageTracer;
}
```

- [ ] **Step 2: Write failing option-mapping and deterministic trace tests**

Assert exact boundary mappings and stable output from a small color fixture.

```ts
assert.deepEqual(mapTraceOptions({
  colors: 6, detail: 60, smoothing: 35, blur: 0, palette: [],
}), {
  numberofcolors: 6,
  ltres: 4.06,
  qtres: 4.06,
  pathomit: 5,
  blurradius: 0,
  colorsampling: 2,
  viewbox: true,
  strokewidth: 1,
  desc: false,
});
assert.equal(
  traceRgbaFrame(fixture, settings),
  traceRgbaFrame(structuredClone(fixture), structuredClone(settings)),
);
```

Map `detail` linearly from threshold 10 at 0 to 0.1 at 100, `smoothing` linearly from `pathomit` 12 at 0 to 0 at 100, and blur directly to integer 0 through 5.

- [ ] **Step 3: Write failing hostile SVG sanitizer tests**

Inject `DOMParser` and `XMLSerializer` from `@xmldom/xmldom`. Accept only SVG/group/path structure, finite viewBox, path `d`, hexadecimal or integer `rgb(r,g,b)` fill/stroke colors, finite stroke width, opacity 0 through 1, and matrix/translate/rotate/scale transforms containing finite numbers. Normalize all accepted colors to lowercase six-digit hex.

```ts
for (const hostile of [
  '<svg><script>alert(1)</script></svg>',
  '<svg><image href="data:image/png;base64,AA=="/></svg>',
  '<svg><path d="M0 0" onclick="alert(1)"/></svg>',
  '<svg><foreignObject/></svg>',
  '<svg><path d="M0 0" style="fill:url(https://example.com/x)"/></svg>',
]) {
  assert.throws(() => sanitizeTraceSvg(hostile, xmlPlatform), /Trace output is unsafe/);
}
```

Assert canonical serialization parses again and contains no `href`, `url(`, `style`, `on*`, `script`, `image`, `animate`, or `foreignObject`.

- [ ] **Step 4: Run processor/sanitizer tests and confirm the red state**

Run:

```bash
npx tsx --test tests/editor-trace-processor.test.ts tests/editor-trace-sanitizer.test.ts
```

Expected: FAIL because trace processing and sanitization modules do not exist.

- [ ] **Step 5: Implement isolated tracing and strict main-thread sanitization**

`traceRgbaFrame` validates a longest edge no greater than 1280, clones pixels, maps normalized options, and calls only `imagetracerjs.imagedataToSVG`. The worker returns raw generated markup plus request identity; it does not parse XML because worker DOM availability is not assumed.

`sanitizeTraceSvg` parses on the main thread into `SafeTraceDocument`, permits ImageTracer's known root `version`, `xmlns`, and `desc` attributes while dropping them from the safe document, flattens approved nested groups by composing transform strings, and rejects all other unknown content. Path data accepts only finite numeric tokens and `M`, `L`, `Q`, `C`, and `Z` commands. Require at least one nonempty path. `serializeSafeTraceDocument` builds a fresh SVG DOM tree; it never interpolates untrusted markup.

- [ ] **Step 6: Write failing trace authority and palette-reuse tests**

Clone the cleanup coordinator authority matrix and add sanitized-result injection plus palette geometry reuse.

```ts
const first = coordinator.trace(traceInput('layer-a', 'trace-source-a-settings-a', settings));
const second = coordinator.trace(traceInput('layer-a', 'trace-source-a-settings-b', {
  ...settings,
  detail: 70,
}));
assert.deepEqual(await first, {
  status: 'stale',
  traceFingerprint: 'trace-source-a-settings-a',
});
worker.succeed(secondPost, safeRawSvg);
assert.equal((await second).status, 'ready');

const recolored = recolorSafeTraceDocument(document, ['#112233', '#445566']);
assert.deepEqual(recolored.paths.map(({ d }) => d), document.paths.map(({ d }) => d));
assert.notDeepEqual(recolored.paths.map(({ fill }) => fill), document.paths.map(({ fill }) => fill));
```

Palette recoloring maps unique source fills in first-path appearance order and updates matching fill and stroke together. Extra swatches are retained in settings but do not create geometry; missing swatches reuse the final supplied swatch.

- [ ] **Step 7: Implement trace coordinator and retry**

Use a 20-second default timeout and this result union:

```ts
export type TraceOutcome =
  | { status: 'ready'; traceFingerprint: string; document: SafeTraceDocument }
  | { status: 'failed'; traceFingerprint: string; message: 'Vector trace failed.' }
  | { status: 'stale'; traceFingerprint: string };
```

The coordinator owns one request per trace layer, validates worker identity, sanitizes raw SVG before resolving ready, retains same-key retry input, and stores safe geometry in a 24 MiB LRU cache estimated from path/string lengths. Palette-only requests recolor cached geometry without posting to the worker.

- [ ] **Step 8: Prove the bundle boundary and commit**

Run:

```bash
npx tsx --test tests/editor-trace-processor.test.ts tests/editor-trace-sanitizer.test.ts tests/editor-trace-coordinator.test.ts
npm run typecheck
npm run build
rg -n \"services/imageProcessing|workers/imageProcessing|geminiService\" dist/assets/js
git diff --check
```

Expected: tests/typecheck/build pass; `rg` returns no legacy module path in the canvas-first trace worker or entry chunks.

Commit: `feat: add safe deterministic vector trace engine`

---

### Task 6: Trace Layer Compositor, History, Inspector, And Source Lifecycle

**Files:**
- Create: `components/editor/TraceInspector.tsx`
- Create: `components/editor/useTraceWorkflow.ts`
- Modify: `editor/compositor.ts`
- Modify: `editor/geometry.ts`
- Modify: `editor/decodedImages.ts`
- Modify: `components/editor/EditorToolbar.tsx`
- Modify: `components/editor/EditorInspector.tsx`
- Modify: `components/editor/EditorCanvas.tsx`
- Modify: `components/editor/EditorApp.tsx`
- Modify: `components/editor/LayerPanel.tsx`
- Modify: `components/editor/VariationPreviewCanvas.tsx`
- Modify: `tests/editor-geometry.test.ts`
- Modify: `tests/editor-compositor.test.ts`
- Modify: `tests/editor-history.test.ts`
- Modify: `tests/editor-shell.test.ts`
- Modify: `tests/editor-preview-surface.test.ts`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: trace model/history from Task 1, prepared input from Tasks 3/4, and trace coordinator/sanitizer from Task 5.
- Produces: `TraceInspector`, `useTraceWorkflow`, `getTraceLayerDrawRect`, trace image decoding/rendering/hit testing, trace creation/update/recolor, and restore-source.
- Guarantees: successful-create atomicity, independent trace transforms, retained previous output, stale source indication, exact five controls, and shared rendering through Looks/Compare.

- [ ] **Step 1: Write failing geometry, compositor, and history integration tests**

Prove a trace created from a cropped source has the same draw rectangle before either layer is transformed independently.

```ts
assert.deepEqual(
  getTraceLayerDrawRect(sourceSize, viewport, source.transform, source.crop),
  getLayerDrawRect(sourceSize, viewport, source.transform, source.crop),
);
```

Compositor tests cover trace order, SVG decoded-image selection, opacity, transform/flip, missing/stale retained assets, hit testing, Look composition, and hidden trace behavior. History tests cover create/hide/select as one undo step, settings grouping, palette changes, source staleness, update publication, restore source, duplicate source remapping, and deletion without source deletion.

- [ ] **Step 2: Run integration tests and confirm the red state**

Run:

```bash
npx tsx --test tests/editor-geometry.test.ts tests/editor-compositor.test.ts tests/editor-history.test.ts
```

Expected: FAIL because trace geometry/rendering is not integrated.

- [ ] **Step 3: Add trace rendering and decoding**

Use `TraceLayer.sourceFrame` for geometry and the SVG asset's decoded image for pixels:

```ts
export const getTraceLayerDrawRect = (
  frame: TraceSourceFrame,
  viewport: Size,
  transform: LayerTransform,
) => getLayerDrawRect(
  { width: frame.sourceWidth, height: frame.sourceHeight },
  viewport,
  transform,
  frame.crop,
);
```

Draw the full decoded cropped SVG into that rectangle with trace opacity/transform. Extend hit testing, layer canonicalization, missing-visible-asset gating, decoded URL ownership, and render keys for trace layers.

- [ ] **Step 4: Write failing inspector and workflow tests**

Assert `Trace` is enabled only for an image or trace selection and that exact controls are present:

```ts
assert.match(markup, /aria-label="Trace"/);
assert.match(markup, /id="editor-trace-colors"[^>]*min="2"[^>]*max="16"[^>]*step="1"/);
assert.match(markup, /id="editor-trace-detail"[^>]*min="0"[^>]*max="100"[^>]*step="1"/);
assert.match(markup, /id="editor-trace-smoothing"[^>]*min="0"[^>]*max="100"[^>]*step="1"/);
assert.match(markup, /id="editor-trace-blur"[^>]*min="0"[^>]*max="5"[^>]*step="1"/);
assert.match(markup, /aria-label="Restore source"/);
```

Cover processing, initial failure, retained-result failure, retry, stale `Update Trace`, and normalized palette input.

- [ ] **Step 5: Implement trace workflow authority and asset commits**

`useTraceWorkflow` composes the current prepared input, bounds it to 1280, computes a source fingerprint including cleanup output identity, derives `createTraceFingerprint(sourceFingerprint, settings)`, and starts tracing only from an image source or linked trace source.

On initial success:

1. Serialize the safe document.
2. Create a `trace-svg` asset.
3. Create `TraceLayer` with source transform/opacity, source frame, settings, and fingerprint.
4. Call `commitGeneratedAsset` with `add-trace-layer`.

On update success, call `publish-trace-result` with both expected fingerprints. Palette-only updates use `recolorSafeTraceDocument`, create a new sanitized immutable SVG, and publish without worker geometry generation. Reject stale completions before encoding and again inside history reduction.

- [ ] **Step 6: Implement trace inspector and layer operations**

Add toolbar `ScanLine` icon and a trace-specific inspector with create/update, exact numeric ranges, palette swatches, processing/error/retry, and Restore Source. Slider edits use stable history groups; only a successfully published generated SVG becomes current.

Layer Panel uses Lucide `Spline` for trace rows and retains existing reorder, duplicate, visibility, and delete controls. Renaming defaults to `Trace` for blank trace names. Selecting a trace keeps the Trace tool active; selecting an image does not create work until `Trace Image` is invoked.

- [ ] **Step 7: Run focused tests and commit**

Run:

```bash
npx tsx --test tests/editor-geometry.test.ts tests/editor-compositor.test.ts tests/editor-history.test.ts tests/editor-shell.test.ts tests/editor-preview-surface.test.ts
npm run typecheck
npm run build
git diff --check
```

Expected: focused tests, typecheck, and production build pass.

Commit: `feat: integrate editable trace layers`

---

### Task 7: Canonical Design Surface And Validated SVG Master Export

**Files:**
- Create: `editor/canonicalSurface.ts`
- Create: `editor/svgExport.ts`
- Create: `components/editor/ExportMenu.tsx`
- Modify: `editor/compositor.ts`
- Modify: `editor/geometry.ts`
- Modify: `components/editor/VariationPreviewCanvas.tsx`
- Modify: `components/editor/EditorCanvas.tsx`
- Modify: `components/editor/CompareBoard.tsx`
- Modify: `components/editor/LooksInspector.tsx`
- Modify: `components/editor/EditorTopBar.tsx`
- Modify: `components/editor/EditorApp.tsx`
- Modify: `tests/editor-geometry.test.ts`
- Modify: `tests/editor-compositor.test.ts`
- Modify: `tests/editor-preview-surface.test.ts`
- Create: `tests/editor-svg-export.test.ts`
- Modify: `tests/editor-shell.test.ts`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Produces: `CANONICAL_DESIGN_SIZE`, `containCanonicalSurface`, `displayPointToDesignPoint`, `designPointToDisplayPoint`, `getSvgExportEligibility`, `buildSvgMaster`, `validateSvgMaster`, and `ExportMenu`.
- Consumes: safe trace documents/assets, existing text normalization, shared geometry, and active variation Look.
- Guarantees: viewport-independent 1000-by-1000 composition, display/design coordinate correctness, exact vector layer order, editable text, explicit blockers, and validated no-raster standalone SVG.

- [ ] **Step 1: Write failing canonical-surface geometry tests**

Cover wide, tall, square, zero-size, and high-DPI viewports. Prove round-trip point conversion and stable design geometry across desktop/mobile display rectangles.

```ts
assert.deepEqual(containCanonicalSurface({ width: 1440, height: 844 }), {
  x: 298, y: 0, width: 844, height: 844, scale: 0.844,
});
const design = displayPointToDesignPoint({ x: 720, y: 422 }, wide);
assert.deepEqual(design, { x: 500, y: 500 });
assert.deepEqual(designPointToDisplayPoint(design, wide), { x: 720, y: 422 });
```

- [ ] **Step 2: Implement fixed-surface preview and hit-test mapping**

Set:

```ts
export const CANONICAL_DESIGN_SIZE = { width: 1000, height: 1000 } as const;
```

Compose every variation at bounded pixel dimensions derived from the square canonical surface, then contain the resulting frame in each UI canvas. Return the contained design rectangle from `useVariationPreviewSurface`. Convert pointer/hit-test coordinates into design coordinates before layer hit testing and transform deltas. Brush and eyedropper mapping must use the same conversion. Compare tiles and Look thumbnails use identical canonical frames.

- [ ] **Step 3: Write failing export eligibility and serialization tests**

Use parsed SVG assertions rather than regex-only checks. Cover eligible trace/text ordering, transforms, flips, opacity, multiline text, alignment, letter spacing, outline, empty vector content, every blocker, hostile stored SVG, and desktop/mobile byte equivalence.

```ts
assert.deepEqual(getSvgExportEligibility(eligibleVariation, assets), {
  eligible: true,
  blockers: [],
});
assert.deepEqual(getSvgExportEligibility(rasterVariation, assets), {
  eligible: false,
  blockers: [{ layerId: 'image-a', message: 'Hide or trace Image A before exporting SVG.' }],
});
const svg = await buildSvgMaster(eligibleVariation, assets, xmlPlatform);
const root = xmlPlatform.parse(svg).documentElement;
assert.equal(root.getAttribute('viewBox'), '0 0 1000 1000');
assert.equal(root.getElementsByTagName('image').length, 0);
```

- [ ] **Step 4: Run geometry/export tests and confirm the red state**

Run:

```bash
npx tsx --test tests/editor-geometry.test.ts tests/editor-preview-surface.test.ts tests/editor-svg-export.test.ts
```

Expected: FAIL because the canonical surface and exporter do not exist.

- [ ] **Step 5: Implement eligibility and shared SVG transforms**

`getSvgExportEligibility` returns one stable blocker per visible raster plus variation/trace blockers. `buildSvgMaster` reparses every stored trace SVG through `sanitizeTraceSvg`, creates a fresh standalone root, and appends trace paths or text groups in array order.

Use one transform builder for preview-equivalent translation, rotation, scale, flips, and opacity:

```ts
export interface SvgExportEligibility {
  eligible: boolean;
  blockers: Array<{ layerId: string | null; message: string }>;
}

export const buildSvgMaster = async (
  variation: DesignVariation,
  assetsById: Record<string, EditorAsset>,
  xml: XmlPlatform,
): Promise<string>;
```

Text emits `<text>`/`<tspan>` with escaped text nodes, explicit selected font plus generic fallback, fill, optional stroke, stroke width, alignment anchor, letter spacing, opacity, and layer transform. No HTML/string interpolation is permitted.

- [ ] **Step 6: Validate the completed document**

`validateSvgMaster` reparses completed output and rejects:

- root other than SVG or viewBox other than `0 0 1000 1000`;
- `image`, `script`, `style`, `foreignObject`, animation, or unknown elements;
- event attributes, `href`, external URLs, data URLs, or `url(`;
- non-finite transforms/opacities;
- no path or text content.

Serialization returns normalized XML from `XMLSerializer`; the same project must produce identical bytes regardless of current display viewport.

- [ ] **Step 7: Add the Export menu and download path**

Add a Lucide `Download` command to `EditorTopBar` that opens `ExportMenu`. The menu lists blockers in layer order or enables `Download SVG`. Build and validate only after the explicit click, create one temporary object URL, click an anchor named from sanitized project/variation names, and revoke the URL in a `finally` block. Display generation failures without mutating project state.

- [ ] **Step 8: Run focused and regression tests, then commit**

Run:

```bash
npx tsx --test tests/editor-geometry.test.ts tests/editor-compositor.test.ts tests/editor-preview-surface.test.ts tests/editor-svg-export.test.ts tests/editor-shell.test.ts
npm run typecheck
npm run build
git diff --check
```

Expected: focused tests, typecheck, and build pass; preview tests prove stable square composition.

Commit: `feat: export validated vector design masters`

---

### Task 8: Whole-Flow Acceptance, Scope Audit, And Protected Preview

**Files:**
- Modify: `tests/e2e/canvas-editor.spec.ts`
- Modify: `tests/editor-bundle-boundary.test.ts`
- Create: `test-results/phase-2c/desktop-image-prep-trace-1440x900.png`
- Create: `test-results/phase-2c/mobile-image-prep-trace-390x844.png`
- Create: `.superpowers/sdd/phase-2c-acceptance-report.md`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: all Phase 2C owner workflows and release gates.
- Produces: desktop/mobile browser proof, parsed SVG proof, bundle-boundary proof, acceptance report, protected preview URL, and roadmap completion record.
- Preserves: all prior Phase 1, 2A, and 2B acceptance behavior.

- [ ] **Step 1: Add deterministic browser fixtures and the desktop workflow**

Generate a PNG in the browser with a colored edge background, enclosed same-color detail, opaque foreground, and one imperfect edge. The desktop test performs:

1. Import.
2. Automatic background removal.
3. Pick Color.
4. Tolerance and feather adjustment.
5. One erase and one restore stroke.
6. Trace creation.
7. Numeric trace adjustment and palette recolor.
8. Transform.
9. Autosave/reload/reopen.
10. Compare Board verification.
11. SVG download and parse.
12. Restore Source and undo through trace and cleanup.

Assert stored source digest is unchanged, generated assets have the expected roles/MIME types, removed canvas pixels are transparent, enclosed detail remains opaque, SVG contains path/text but no image/unsafe nodes, and initial trace creation is one undo step.

- [ ] **Step 2: Add the mobile workflow and reviewed screenshots**

At 390 by 844, repeat the essential cleanup/trace/export path through the lower inspector. Assert the toolbar, canvas, brush cursor, inspector controls, and export menu do not overlap; the canonical design frame remains square and nonblank; and the downloaded SVG bytes equal desktop output for the same persisted project.

Capture:

```ts
await page.screenshot({
  path: 'test-results/phase-2c/mobile-image-prep-trace-390x844.png',
  fullPage: true,
});
```

Capture the equivalent reviewed desktop screenshot at 1440 by 900.

- [ ] **Step 3: Strengthen bundle and scope boundaries**

Update the bundle test to inspect entry and worker chunks and reject:

```ts
assert.doesNotMatch(source, /geminiService|@google\/genai|services\/imageProcessing|workers\/imageProcessing/);
assert.doesNotMatch(source, /ProductionPackage|Print Lens|mockup|Printify Product/i);
```

Allow `imagetracerjs` only in the trace worker/image-processing chunk, not the main editor entry. Confirm the background worker contains no ImageTracer dependency.

- [ ] **Step 4: Run the complete local release gate**

Run:

```bash
npm run typecheck
npm run build
npm test
npx playwright test --project=chromium
git diff --check
git status --short
```

Expected:

- typecheck passes;
- production build passes;
- every existing and Phase 2C Node test passes;
- every Chromium E2E test passes;
- no whitespace errors;
- status contains only intended Phase 2C acceptance artifacts and progress updates.

- [ ] **Step 5: Perform the final scope and asset-lifecycle audit**

Search the complete Phase 2C commit range:

```bash
git diff --name-only a3e910c..HEAD
rg -n -i "gemini|ai cleanup|print lens|mockup|printify|production package" editor components/editor tests/e2e/canvas-editor.spec.ts
rg -n "createObjectURL|revokeObjectURL|new Worker|terminate\\(" editor components/editor
```

Expected: no deferred feature implementation; every created URL has a matching revoke path; every worker owner has a terminate path; legacy terms appear only in negative bundle tests or unchanged legacy files.

- [ ] **Step 6: Write the acceptance report**

Record:

- commit range and task commits;
- exact test/build counts and bundle filenames/sizes;
- desktop/mobile acceptance results;
- source-digest, transparency, trace, sanitization, and SVG parser evidence;
- reviewed screenshot paths;
- known deferrals copied from Global Constraints;
- protected preview deployment ID and URL after deployment.

- [ ] **Step 7: Deploy and verify a protected Vercel preview**

Deploy the exact committed source state using the existing Vercel project:

```bash
$previewUrl = (npx vercel deploy --yes | Select-Object -Last 1).Trim()
npx vercel inspect $previewUrl
npx vercel curl "$previewUrl/"
npx vercel curl "$previewUrl/privacy"
```

Expected: deployment reaches `READY`; authenticated `/` and `/privacy` return HTTP 200; unauthenticated access redirects to Vercel SSO when deployment protection is active. Smoke-check the desktop and mobile owner workflow against the deployed URL without creating a production deployment.

- [ ] **Step 8: Commit acceptance bookkeeping**

Run the complete release gate once more after report updates, then commit:

```bash
git add tests/e2e/canvas-editor.spec.ts tests/editor-bundle-boundary.test.ts \
  test-results/phase-2c .superpowers/sdd/phase-2c-acceptance-report.md \
  .superpowers/sdd/progress.md
git commit -m "test: verify phase 2c image prep and vector export"
git status --short
```

Expected: final worktree is clean and the acceptance report references the committed screenshot and deployment evidence.

---

## Completion Criteria

Phase 2C is complete only when all eight task commits are reviewed, the complete local release gate passes, the written SVG parses and contains no raster/unsafe content, original source bytes remain unchanged through cleanup and trace workflows, desktop/mobile screenshots are reviewed, and the protected preview is READY. Any product, mockup, Print Lens, AI, general masking, or path-editing request becomes a separately designed later phase rather than an addition to this plan.
