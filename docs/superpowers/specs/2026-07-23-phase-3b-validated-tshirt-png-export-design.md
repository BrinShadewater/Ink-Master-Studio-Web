# Phase 3B Validated T-Shirt PNG Export

**Date:** 2026-07-23
**Status:** Approved design
**Roadmap phase:** Phase 3B of the canvas-first reset

## Purpose

Phase 3B completes the current T-shirt workflow with a trustworthy local PNG
export. An owner chooses one of three fixed 5:6 output presets, generates the
active variation and its current product placement in a dedicated worker, sees
facts parsed from the generated file, and downloads that exact validated blob.

The export is the transparent print artwork. The photographic shirt is a
placement preview and is never included in the downloaded file.

## Scope Boundary

### Included

- PNG export for the active variation's existing T-shirt product.
- Three fixed 5:6 output presets.
- A focused export dialog opened from Product mode.
- Worker-only final-resolution composition and PNG encoding.
- High-quality local resizing of raster sources with Pica.
- Final-resolution text, trace, transform, opacity, layer-order, and Look
  rendering.
- PNG resolution metadata written for the selected preset.
- Parsing and validation of the generated PNG before download.
- A receipt showing actual dimensions, resolution, color type, transparency,
  file size, and resampling facts.
- Cancellation, timeout, retry, stale-result rejection, and resource cleanup.
- Focused unit, integration, browser, accessibility, and bundle-boundary tests.

### Excluded

- Custom dimensions, custom DPI, or additional presets.
- Hoodie, mug, poster, tote, hat, or custom-target export.
- SVG export changes; the existing design-master SVG workflow remains
  unchanged.
- JPEG, PDF, TIFF, or archive output.
- Downloading the photographic mockup.
- Multiple placements, front/back/sleeve print areas, or provider templates.
- Print Lens, garment-specific Print Treatments, ink simulation, or physical
  print guarantees.
- Printify API submission, provider accounts, orders, or live provider
  validation.
- Cloud rendering, uploads, collaboration, AI features, or background services.
- Refactoring or restoring the legacy production-workbench export flow.

The implementation plan may contain no more than seven reviewed tasks. Phase 4
features cannot be added to those tasks.

## Export Presets

The editor owns a small immutable preset catalog:

| ID | Owner-facing name | Pixels | DPI | Physical size | Classification |
| --- | --- | ---: | ---: | ---: | --- |
| `printify-full-front` | Printify Full Front | 4500 by 5400 | 300 | 15 by 18 in | Production |
| `standard-tee` | Standard Tee | 3000 by 3600 | 300 | 10 by 12 in | Production |
| `draft-proof` | Draft Proof | 1500 by 1800 | 150 | 10 by 12 in | Proof only |

All presets use a transparent 5:6 RGBA PNG. `printify-full-front` is selected
by default. The Draft Proof option is clearly labelled `Proof only` wherever it
is selected or reported. It is downloadable after validation but never receives
a production-ready state.

Preset facts are maintained in one editor-owned module and are shared by the
dialog, worker request validation, receipt validation, and tests. The feature
does not import the legacy production preset catalog.

`Printify Full Front` describes the file dimensions targeted by this release.
It is not a promise that every Printify garment, provider, print area, or future
requirement accepts the file.

## Owner Workflow

1. Open a saved design variation in Product mode.
2. Position and size the design on the photographic T-shirt.
3. Select Export from the Product surface.
4. Choose one of the three fixed presets.
5. Select Generate PNG.
6. Continue viewing the project while the worker reports bounded progress.
7. Review the receipt parsed from the generated file.
8. Download the exact validated PNG.
9. Change the preset or project state and generate a new file when needed.

The dialog is a focused completion step, not a multi-page wizard. Closing it
does not cancel or alter project edits. Export never mutates layers, the active
Look, product placement, undo history, or autosaved project state.

## Product Surface And Dialog

The existing top-level Export command remains the entry point. While Product
mode is active, it opens the Phase 3B T-shirt PNG dialog. Existing non-Product
design-master download behavior remains available outside Product mode.

The dialog contains:

- A compact preset selector with name, pixel dimensions, DPI, physical size,
  and Production or Proof-only classification.
- A Generate PNG command.
- Progress and Cancel controls while generation is active.
- Retry after a failed, timed-out, or cancelled attempt.
- A validation receipt after successful generation.
- A Download PNG command only when the current generated blob passes the
  required checks.

Changing the selected preset invalidates the current receipt and generated
blob. Changing the active variation, any layer or Look state, or the linked
T-shirt placement also invalidates them. Changing only the shirt color does not
invalidate export because the shirt photograph and color are excluded from the
file.

If the dialog stays open while relevant state changes, it returns to the
ready-to-generate state and explains that the design changed. It never presents
an older result as current.

## Canonical Placement Mapping

Every preset defines a transparent output rectangle from `(0, 0)` through
`(width, height)`. The complete 1000 by 1000 variation composition is treated
as one square design master and transformed using the active Phase 3A
`ProductPlacement`.

For output width `W`, output height `H`, and placement `{ x, y, scale,
rotation }`:

```ts
const baseSide = Math.min(W, H);
const renderedSide = baseSide * scale;
const centerX = W * x;
const centerY = H * y;
```

The worker centers the square design master at `(centerX, centerY)`, rotates it
clockwise by `rotation`, and scales it to `renderedSide` by `renderedSide`.
Pixels outside the output rectangle are clipped. No additional hidden margin,
mockup calibration, provider adjustment, or automatic fit is applied.

This mapping makes placement independent of browser viewport and shirt-image
calibration. The same normalized product state produces geometrically
equivalent output at every preset size. The photographic shirt, its selected
color, shadows, texture, and calibrated preview rectangle are excluded.

## Architecture

### Export Controller

The Product export controller owns dialog state and final-result authority. It:

- Captures an immutable export snapshot.
- Computes a deterministic fingerprint from the preset, active variation
  composition, referenced asset identities, Look recipe and seed, and product
  placement.
- Starts, cancels, and disposes worker requests.
- Accepts progress or completion only from the current request ID and
  fingerprint.
- Parses the worker's completed blob before exposing download.
- Owns and revokes the temporary download object URL.

The controller does not render pixels and cannot fall back to a main-thread
final renderer.

### Export Snapshot

The worker request contains only the active variation data required to render:

```ts
interface TShirtPngExportSnapshot {
  requestId: string;
  fingerprint: string;
  presetId: TShirtExportPresetId;
  variation: NormalizedVariationComposition;
  placement: ProductPlacement;
  assets: ExportAssetSnapshot[];
}
```

The snapshot is detached from live React and project state. Referenced local
assets are transferred as immutable byte or bitmap inputs with explicit
ownership. The worker validates the preset ID, normalized composition,
placement bounds, asset references, and decoded image dimensions before
allocating the final canvas.

The shirt mockup slug and image are intentionally absent from this contract.

### Dedicated Export Worker

A dedicated module worker performs:

1. Request and preset validation.
2. Source-asset decoding.
3. Final composition planning.
4. High-quality raster resampling.
5. Final-resolution image, text, trace, Look, opacity, transform, and layer
   composition.
6. Placement transform and clipping.
7. RGBA PNG encoding.
8. PNG resolution-chunk insertion.
9. Transfer of the completed blob and render metadata to the controller.

The final canvas is allocated only after validation succeeds. Only one export
request is active per dialog. Starting a replacement request cancels and
disposes the earlier request before large allocations continue.

### Composition Fidelity

Export uses the same normalized composition and Look definitions as editor,
Compare, and Product previews, but it does not upscale a bounded preview:

- Raster image layers are decoded from their authoritative original or
  prepared-image assets.
- Pica performs progressive high-quality resizing when raster content must be
  enlarged or reduced for its final transformed bounds.
- Text is laid out and rasterized for final output resolution from its saved
  text properties.
- Trace layers are parsed through the existing safe SVG boundary and rendered
  from vector geometry at final output resolution.
- Crop, adjustment, visibility, opacity, layer order, transparency, and
  transforms match the saved variation.
- Looks use the existing recipes and persisted seeds so deterministic effects
  reproduce the approved creative state at final resolution.

Pica is a resizing tool, not a detail-recovery claim. The receipt reports the
largest effective raster enlargement ratio and labels enlargement above the
existing quality threshold as a warning. That warning is informative and does
not block an otherwise valid file.

## PNG Metadata And File Parsing

Canvas encoding alone is not accepted as proof of the requested DPI. After
encoding, the worker writes one valid PNG `pHYs` chunk using pixels per meter:

- 300 DPI: `11811` pixels per meter on both axes.
- 150 DPI: `5906` pixels per meter on both axes.
- Unit specifier: meters.

Chunk length, type, data, placement, and CRC are written through a focused PNG
utility. If an encoder emits an existing `pHYs` chunk, it is replaced so the
final file contains exactly one authoritative resolution chunk.

The main thread then parses the bytes of the completed PNG rather than trusting
worker declarations. Parsing verifies the PNG signature and chunk bounds and
reads at least:

- IHDR width and height.
- IHDR bit depth and color type.
- `pHYs` horizontal and vertical resolution and unit.
- IEND presence.
- Total byte size.

Before encoding, the worker computes alpha statistics from the exact final RGBA
pixel buffer. The controller accepts those statistics only with the matching
request and file fingerprint. The actual PNG parser independently requires
RGBA color type 6, so validation combines final-buffer evidence of a
non-opaque pixel with actual-file evidence that the encoded file retains an
alpha channel. The file remains an RGBA PNG even when the artwork itself
contains opaque regions.

## Validation And Receipt

### Blocking Checks

Download is enabled only when all of these facts match the selected preset:

- Valid PNG signature, bounded chunk structure, and terminal IEND.
- Exact preset width and height.
- Eight-bit RGBA color type 6.
- Exactly one valid meter-based `pHYs` chunk with the preset value on both axes.
- At least one pixel with alpha below 255.
- Non-empty file no larger than 100 MiB.
- Receipt fingerprint matches the current export snapshot.

A Production preset that passes receives `Ready to print`. The Draft Proof
preset that passes receives `Proof ready` and retains its Proof-only warning.

### Non-Blocking Guidance

- Effective raster enlargement above the established quality threshold.
- Source imagery whose effective DPI is below the selected output DPI.
- File size approaching the 100 MiB blocker.

These facts are reported without implying recovered detail or exact physical
print quality. Phase 3B does not add Print Lens heuristics.

### Receipt Contents

The receipt shows facts from the actual generated file and associated render
metadata:

- Preset and readiness classification.
- Pixel dimensions.
- Horizontal and vertical DPI.
- Physical dimensions implied by pixels and DPI.
- PNG bit depth and color type, displayed as `8-bit RGBA`.
- Transparency present.
- File size.
- Largest raster enlargement ratio and affected source-layer name when
  applicable.
- Any non-blocking guidance.

The downloaded file is the same Blob instance that was parsed. It is not
re-encoded after validation.

## Naming And Lifetime

The default filename is:

```text
<sanitized-project-name>-<sanitized-variation-name>-<preset-id>.png
```

Sanitization uses ASCII lowercase letters, digits, and single hyphens. Missing
or empty names fall back to `inkmaster-design`, and the complete basename is
bounded before `.png` is appended.

Generated blobs, decoded images, transferred buffers, canvases, and object URLs
are session resources. They are never written into the project model or
IndexedDB. They are released when invalidated, replaced, cancelled, downloaded
and dismissed, or when the controller unmounts.

## Progress, Cancellation, And Errors

Progress uses a small fixed set of owner-facing stages:

- Preparing artwork
- Rendering layers
- Encoding PNG
- Validating file

Progress is monotonic within one request but does not claim byte-accurate
completion. The UI remains responsive throughout final rendering.

- Cancel terminates the active worker request, releases its resources, and
  returns the dialog to a retryable state.
- A 90-second export timeout terminates the worker and reports that generation
  took too long.
- Decode, allocation, render, encode, metadata, parse, or validation failures
  identify the failed stage and offer Retry.
- Worker crashes produce the same bounded retry path.
- A stale completion is discarded and its Blob is released.
- Failure never removes the design, changes placement, or corrupts a previously
  autosaved project.
- There is no hidden main-thread fallback and no legacy production-service
  fallback.

If browser capabilities required for worker rendering are unavailable, the
dialog explains that this browser cannot create the print file. It does not
offer a lower-fidelity file.

## Accessibility And Responsive Behavior

- The dialog has an accessible name and traps focus while open.
- Opening focuses the selected preset; closing returns focus to Export.
- Presets expose selected state and their Production or Proof-only
  classification without relying on color.
- Generate, Cancel, Retry, Close, and Download have accessible names.
- Progress and validation state changes are announced without moving focus.
- Blocking errors and proof warnings are programmatically associated with the
  relevant controls.
- Keyboard users can select a preset, generate, cancel, retry, and download.
- At 390 by 844, the dialog scrolls internally, keeps commands reachable, and
  does not place receipt content under the mobile browser edge.
- Receipt labels and values wrap without truncating essential validation facts.

## Testing And Acceptance

### Presets And Placement

- Exactly three immutable preset definitions exist with the documented pixels,
  DPI, physical sizes, and classifications.
- Every preset has a 5:6 aspect ratio.
- Placement mapping follows the documented equations for default, translated,
  scaled, rotated, and clipped cases.
- Equivalent normalized placements produce equivalent geometry at all three
  resolutions.
- Shirt color and mockup calibration cannot affect the snapshot or fingerprint.

### Rendering

- Raster, prepared-image, text, and trace fixtures render from authoritative
  sources at final resolution.
- Crop, adjustment, visibility, opacity, layer order, transparency, transforms,
  and Looks match deterministic reference fixtures.
- Seeded Looks reproduce identical final pixel digests for identical snapshots.
- Pica enlargement and reduction pass transparent-edge fixtures without dark or
  light halos.
- The worker never substitutes a bounded preview for an original asset.
- The generated output never contains shirt-photo pixels.
- Large-canvas allocation occurs only after request validation.

### PNG And Validation

- `pHYs` insertion produces a valid CRC and replaces an existing chunk.
- The parser rejects bad signatures, truncated chunks, unsafe lengths,
  duplicate resolution chunks, missing IEND, unsupported color type, wrong
  dimensions, wrong DPI, missing transparency, and oversized files.
- All three real generated fixture files parse to their exact dimensions and
  resolution.
- The receipt is derived from parsed bytes and current render metadata.
- Download uses the exact parsed Blob without re-encoding.
- Production and Proof-only readiness labels cannot be confused.

### Authority And Cleanup

- Preset, variation, layer, Look, asset, and placement changes invalidate an
  existing result.
- Shirt-color-only changes preserve a valid result.
- Stale progress and completion messages cannot update the current dialog.
- Cancel, retry, timeout, crash, close, replacement, and unmount release worker,
  bitmap, buffer, canvas, Blob, and object-URL resources.
- No generated export data is persisted.
- Unsupported capability has no main-thread or legacy fallback.

### Browser Acceptance

One deterministic Chromium owner flow must:

1. Open a project containing meaningful transparency, raster artwork, text, a
   trace layer, and a deterministic Look.
2. Enter Product mode and set a non-default placement.
3. Generate Printify Full Front and parse a real 4500 by 5400, 300 DPI RGBA PNG.
4. Prove the exported pixels contain artwork and transparency but no shirt
   photograph.
5. Verify receipt facts and download the exact validated Blob.
6. Generate Standard Tee and prove equivalent normalized placement.
7. Generate Draft Proof and prove the persistent Proof-only classification.
8. Change placement and prove the earlier receipt and download are invalidated.
9. Change only shirt color and prove the current file remains valid.
10. Cancel and retry a deliberately delayed request.
11. Exercise a deterministic validation failure without losing project state.
12. Repeat the essential generate, receipt, and download flow at 390 by 844.

Retain reviewed desktop and mobile screenshots. Canvas and downloaded-file
pixel assertions must be deterministic and must not rely only on DOM labels.

### Release Gate

- Typecheck passes.
- Production build passes and emits the dedicated export worker chunk.
- All existing and new unit and integration tests pass.
- Chromium end-to-end tests pass.
- Peak-memory and cleanup fixtures complete without leaked worker or object-URL
  ownership.
- Bundle-boundary tests prove Phase 3B does not import legacy production jobs,
  profiles, proofs, packages, batches, provider APIs, Gemini, or AI modules.
- A protected preview deployment returns the editor and privacy route.
- Desktop and mobile smoke checks pass against the deployed source.

## Implementation Order

1. Editor-owned export presets, placement mapping, fingerprints, and receipt
   types.
2. PNG metadata writer, actual-file parser, and strict validation policy.
3. Worker protocol, immutable snapshots, cancellation, timeout, and cleanup.
4. Final-resolution compositor with Pica raster handling and deterministic
   layer/Look fidelity.
5. Product export dialog, current-result authority, download ownership, and
   responsive accessibility.
6. Focused integration, real-file, failure, and lifecycle hardening.
7. Whole-flow browser acceptance, screenshots, bundle audit, and protected
   preview.

Each task requires focused tests and review before the next begins. Additional
products, custom output, mockup download, Print Lens, Print Treatments, provider
integration, AI, and unrelated legacy retirement must be rejected from the
Phase 3B plan.
