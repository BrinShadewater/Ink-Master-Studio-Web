# Phase 2C Image Preparation, Vector Trace, And SVG Design

**Date:** 2026-07-23  
**Status:** Approved design  
**Roadmap phase:** Phase 2C of the canvas-first reset

## Purpose

Phase 2C completes the owner-facing artwork workflow between basic image adjustment and product placement:

1. Import and adjust an image.
2. Remove a simple background locally.
3. Refine the result with a small erase/restore brush.
4. Create and recolor an adjustable vector trace.
5. Download a structurally valid SVG master when the active variation is fully vector-capable.

Background removal is table-stakes image preparation, not a future AI feature. This phase restores that basic capability without reviving the legacy production workbench or expanding the editor into a general photo or vector application.

## Scope Boundary

### Included

- One selected raster image as the input to background removal and tracing.
- Local deterministic solid-background removal.
- Automatic edge-color detection and a manually picked removal color.
- Tolerance and edge-feather controls.
- A bounded erase/restore brush for cleanup corrections.
- Reset to the immutable uploaded source.
- One derived trace layer above its source image layer.
- Trace color count, detail, smoothing, blur, and palette controls.
- Deterministic regeneration outside the main UI thread.
- Normal layer visibility, ordering, duplication, deletion, opacity, and transforms for trace layers.
- Restoring the linked source raster.
- Standalone SVG export for the active fully vector variation.
- Schema migration, history, persistence, desktop/mobile acceptance, and a protected preview deployment.

### Excluded

- General selections, arbitrary masks, lasso tools, magic-wand suites, or mask compositing.
- Brush hardness, brush opacity, brush libraries, freehand painting, and cloning.
- Path-node editing, freehand vector drawing, arbitrary shapes, or SVG import.
- Tracing text, the whole variation, Looks, or multiple raster layers as one operation.
- General photographic subject segmentation, hair-quality masking, generative fill, and AI cleanup.
- Product placement, photographic mockups, provider integrations, Print Lens, physical DPI analysis, and validation receipts.
- High-resolution product rendering. Phase 2C preserves resolution-independent parameters that Phase 3 can replay.
- Broad asset-store or legacy-production refactors unrelated to this workflow.

The implementation plan may contain no more than eight reviewed tasks. Phase 3 or Phase 4 work cannot be added to those tasks.

## Owner Workflow

The intended workflow is:

`Import -> crop/adjust -> remove background -> correct edges -> trace -> recolor -> export SVG`

When an image layer is selected, the editor offers `Crop`, `Adjust`, `Remove Background`, and `Trace`. Desktop controls use the existing inspector. Mobile controls use the existing lower inspector area. Background brush refinement is a focused canvas tool with a `Done` action, not a modal or separate editor.

### Remove Background

1. `Remove Background` starts automatic edge-connected removal.
2. `Auto` deterministically samples likely background colors from the cropped image boundary.
3. `Pick Color` activates an eyedropper. The selected point supplies both the target color and an additional connected-region seed, allowing an intentionally selected enclosed region to be removed.
4. `Tolerance` ranges from 0 through 100 and defaults to 24.
5. `Edge Feather` ranges from 0 through 8 canonical design pixels and defaults to 1.
6. `Erase` and `Restore` apply cleanup corrections directly on the canvas.
7. `Brush Size` ranges from 8 through 128 preview pixels.
8. `Clear Corrections` removes only manual brush corrections.
9. `Reset Background` disables removal and corrections and returns to the untouched source.

Automatic mode removes only matching pixels connected to the cropped image boundary. A same-colored detail with no matching path to that boundary remains protected. Picked mode additionally removes the matching connected region containing the selected point.

### Trace

1. `Trace Image` uses the selected image after crop, brightness, contrast, saturation, background removal, and correction strokes.
2. Image opacity and layer transforms are not baked into trace geometry. The trace receives the source opacity and transform when created.
3. A successful result is inserted directly above the source image and selected. The source image is hidden.
4. Trace controls are limited to:
   - `Colors`: integer 2 through 16, default 6.
   - `Detail`: integer 0 through 100, default 60.
   - `Smoothing`: integer 0 through 100, default 35.
   - `Blur`: integer 0 through 5, default 0.
   - Editable six-digit hexadecimal palette swatches.
5. Palette changes rebuild fills without recalculating geometry.
6. `Restore Source` reveals the linked raster without deleting the trace.
7. A source crop, adjustment, or cleanup change marks the trace stale and exposes `Update Trace`.

Trace transforms become independent after creation. Later source transforms do not move or regenerate the trace.

## Project Model

Phase 2C advances the editor project to schema version 4.

### Image Preparation

An image layer gains an optional, normalized background-removal state containing:

- Enabled state.
- `auto` or `picked` mode.
- Optional picked color and normalized picked point.
- Tolerance.
- Edge feather.
- An optional cleanup-correction asset ID.
- The last valid prepared-preview asset ID.
- A source fingerprint covering source asset, crop, and image adjustments.

The source `assetId` always identifies the immutable upload. A prepared PNG is a derived asset selected by the compositor only when its fingerprint matches the current image inputs.

The cleanup-correction asset is specific to background removal. It stores normalized erase/restore stroke paths and sizes in a versioned local blob. A worker rasterizes those strokes into the bounded correction mask used for preview processing. This provides resolution-independent replay without introducing a reusable masking model.

### Trace Layer

Schema version 4 adds a `TraceLayer` to `DesignLayer`. It contains:

- Stable layer ID, name, visibility, opacity, and transform.
- Linked source image-layer ID.
- Last valid sanitized SVG asset ID.
- Color count, detail, smoothing, blur, and palette.
- Source fingerprint.
- Source aspect and captured crop frame used to align the cropped trace with its source.

The SVG asset contains trace geometry for the cropped prepared input. The captured source frame lets the shared geometry code size that cropped vector exactly as it sized the source crop when the trace was created.

### Migration And Duplication

- Schema 1 through 3 projects migrate with background removal disabled and no trace layers.
- Existing source blobs, layer values, variations, and Looks are retained.
- The fixed canonical design surface makes composition deterministic across viewport sizes; stored transform values are not rewritten.
- Variation duplication creates independent layer IDs and settings while sharing immutable uploaded and generated assets.
- Deleting or replacing generated data removes an asset only after the project and session history no longer reference it.

## History And Asset Lifecycle

Uploaded assets are immutable. Prepared PNGs, correction documents, and SVGs are also immutable once stored; a successful regeneration creates a new asset and atomically swaps the relevant reference.

- Slider and brush previews are session drafts.
- Releasing a slider or finishing a brush stroke creates one variation-scoped undo entry.
- Creating a trace first produces and validates a result, then inserts the trace and hides the source in one undoable command.
- A failed initial trace leaves the layer stack unchanged.
- A parameter regeneration keeps the previous valid trace visible until a newer valid result is ready.
- Undo and redo restore settings, visibility, and matching asset references together.
- Derived result publication does not create a second history entry beyond the owner action that requested it.
- Autosave never persists a derived asset reference before that asset has been committed successfully.
- Object URLs and decoded images are released when their immutable assets become unreferenced.

## Rendering Foundation

The editor, Compare Board, and SVG exporter compose normalized layer geometry against a fixed internal 1000 by 1000 design surface. UI canvases contain and scale this surface instead of allowing their responsive element dimensions to redefine the design.

This is a rendering invariant, not a configurable artboard feature. Product-specific output dimensions and placements remain Phase 3 work.

Prepared images and trace assets use the existing shared compositor. A trace renders as a vector-derived canvas image for bounded previews and receives the active variation-wide Look in exactly the same layer order as text and raster images. A non-Original Look is previewable but prevents SVG master export because the Look is raster processing and cannot be represented faithfully in this phase.

## Background-Removal Engine

Background removal runs locally in a dedicated worker behind a narrow request/result interface.

1. Build the cropped, adjusted input without applying layer transform or opacity.
2. Bound interactive processing to a 2048-pixel longest edge.
3. In automatic mode, sample the crop boundary at deterministic positions and cluster likely background colors deterministically.
4. Flood from qualifying boundary seeds using perceptual color distance.
5. In picked mode, also flood from the selected normalized point using its sampled target color.
6. Calculate the alpha boundary and apply 0 through 8 canonical design pixels of feathering, mapped to the bounded working resolution.
7. Rasterize and apply erase/restore correction strokes after automatic removal.
8. Return a transparent prepared PNG plus a fingerprint and bounded metadata.

Identical pixels and settings must produce identical prepared RGBA pixels. Browser-specific PNG encoding is not required to be byte-identical. The engine cannot make network requests or import the legacy production processor.

## Trace Engine

Tracing runs in a separate worker behind a trace-specific coordinator.

- Adapt the locally installed `imagetracerjs` engine behind an isolated module.
- Do not import `workers/imageProcessing.worker.ts`, `services/imageProcessing.ts`, or other legacy production modules into the editor path.
- Bound trace input to a 1280-pixel longest edge.
- Use fixed color sampling and deterministic mappings for the four numeric controls.
- Return canonical geometry and palette data before SVG asset creation.
- Reuse canonical geometry for palette-only changes.

The coordinator follows the established Look-render authority pattern: request identities include the layer, input fingerprint, settings, and dimensions; only the latest matching request may publish.

## Worker Authority And Errors

- The previous valid prepared image or trace remains visible while a replacement is processing.
- A stale response cannot update project state, cache state, failure state, or history.
- A malformed, timed-out, cancelled, or failed initial background-removal request displays the original source.
- A failed trace creation does not create a layer or hide the source.
- A failed regeneration retains the previous valid trace and presents retry.
- Retrying the same action does not duplicate history entries.
- Switching projects, variations, sources, or dimensions invalidates retained result authority.
- Worker termination, request cancellation, and object URL cleanup occur on replacement and unmount.

Failures use concise owner-facing messages and a retry action. There is no fallback to synchronous main-thread processing.

## SVG Sanitization

Trace output is never stored directly as trusted markup.

1. Parse generated markup as SVG XML.
2. Accept only the root SVG structure, groups, and paths needed by generated trace geometry.
3. Accept only approved geometry, fill, stroke, opacity, and transform attributes.
4. Normalize colors and finite numeric values.
5. Reject scripts, event attributes, stylesheets, embedded raster images, data URLs, external references, `foreignObject`, animation, and unknown elements or attributes.
6. Serialize the canonical result.
7. Parse and validate the serialized result again before asset storage.

Malformed or unsafe output fails the trace request; it is never partially repaired into an ambiguous file.

## SVG Master Export

SVG master export operates on the active variation only.

### Eligibility

Export is refused when:

- Any visible image layer remains.
- The active variation uses a non-Original Look.
- A visible trace is stale, processing, failed, or missing a valid SVG asset.
- No visible trace or text layer exists.

The Export menu identifies each blocking layer or variation state. It never embeds or silently flattens a raster.

### Serialization

- Use `viewBox="0 0 1000 1000"` and the same canonical geometry functions used by preview.
- Serialize visible trace and text layers in exact layer order.
- Preserve normalized translation, rotation, scale, flips, opacity, trace colors, and text styling.
- Emit trace geometry as paths.
- Emit text as editable SVG text using the selected web-safe font family and explicit fallback family.
- Include no scripts, external resources, embedded fonts, or raster payloads.
- Parse the completed standalone SVG and re-run structural and safety validation before enabling download.

Text remains editable but depends on the declared web-safe font being available in the application consuming the SVG. Converting text to outlined paths or embedding fonts is outside this phase.

## Testing And Acceptance

### Model, Persistence, And History

- Schema 1 through 3 migration into schema 4.
- IndexedDB round trips for preparation state, correction assets, trace layers, palettes, and generated blobs.
- Undo and redo for cleanup, corrections, trace creation, regeneration, restore-source, and layer operations.
- Variation duplication isolation and generated-asset reference cleanup.
- Proof that uploaded source bytes never change.

### Background Removal

Deterministic fixtures cover:

- Light, dark, colored, slightly uneven, and already-transparent backgrounds.
- Enclosed artwork sharing the background color.
- Automatic boundary detection and manually picked connected regions.
- Tolerance and feather boundaries.
- Erase, restore, clear corrections, and full reset.
- Latest-request authority, cancellation, retry, and failure retention.

### Vector Trace And Sanitization

- Identical input and settings produce identical canonical geometry and SVG.
- Each numeric control changes only its documented engine mapping.
- Palette edits preserve path geometry.
- Crop, adjustment, or cleanup changes mark the linked trace stale.
- Hostile SVG fixtures reject scripts, handlers, external resources, embedded images, unsupported elements, and invalid numeric data.
- Compositor and hit-testing cover trace order, visibility, transforms, duplication, and deletion.

### SVG Export

- Parsed output has the expected viewBox, layer order, transforms, flips, opacity, paths, text, and colors.
- Every export-blocking condition has a direct test.
- Export contains no raster payload, unsafe reference, or unapproved element.
- Desktop and mobile generate byte-equivalent SVG from the same saved project.

### Browser Acceptance

Run Chromium acceptance at 1440 by 900 and 390 by 844:

1. Import artwork with a solid background.
2. Remove the background automatically.
3. Pick a background region and adjust tolerance and feather.
4. Erase and restore part of an edge.
5. Create a trace, adjust it, recolor it, and transform it.
6. Autosave, reload, and reopen the project.
7. Verify the cleaned and traced variations in Compare Board.
8. Export and parse the SVG.
9. Restore the source and undo through trace creation and background cleanup.

Canvas pixel assertions must prove that previews are nonblank and removed pixels are transparent. Retain reviewed desktop and mobile screenshots.

### Release Gate

- Typecheck passes.
- Production build passes.
- All existing and new unit/integration tests pass.
- Chromium end-to-end tests pass.
- Bundle-boundary tests prove no legacy production processor or AI client enters the canvas-first editor.
- Worker, object URL, generated-asset, cancellation, and timeout cleanup tests pass.
- A protected preview deployment returns the editor and static privacy route successfully.
- Desktop and mobile smoke checks pass against that deployment.

## Implementation Order

The implementation plan must stay within these eight tasks:

1. Schema 4, normalization, migration, and generated-asset lifecycle.
2. Deterministic background-removal and correction engine.
3. Background-removal worker authority and caching.
4. Remove-background inspector and focused erase/restore canvas tool.
5. Deterministic trace engine, sanitization, and coordinator.
6. Trace-layer compositor, history, inspector, and source lifecycle.
7. Canonical design surface and validated SVG master export.
8. Whole-flow acceptance, bundle boundary, screenshots, and protected preview deployment.

Each task requires focused tests before moving to the next. Product, mockup, print-analysis, AI, and unrelated legacy-removal work must be rejected from the Phase 2C plan.
