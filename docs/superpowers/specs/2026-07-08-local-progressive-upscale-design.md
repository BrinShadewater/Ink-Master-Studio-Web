# Local Progressive Upscale Design

## Goal

Automatically enlarge undersized artwork for the selected Printify product while keeping the browser responsive and describing the result honestly. The first release stays local-first. It creates a stable engine boundary for an optional AI enhancer later, but does not download an AI model, upload artwork, or expose an AI control.

## User Experience

Upscaling happens automatically when the source is smaller than the selected product target.

- At or below 2x enlargement, the checklist reports that the image was enhanced locally.
- Above 2x through 4x, download remains available and the checklist warns that fine detail may look soft.
- Above 4x, download remains available with a strong warning that extreme enlargement can make fine detail look soft or artificial.
- The warning never claims that missing detail was restored.
- The existing progress display and cancel action remain active throughout enhancement.
- Preview rendering remains downscaled. Progressive enhancement runs only for the final print-file export.

The export result records the source dimensions, target dimensions, enlargement ratio, and `local-progressive` method. These details support the checklist and future diagnostics without adding creator-facing production jargon.

## Architecture

Introduce an `UpscaleEngine` contract owned by the image-processing layer:

```ts
type UpscaleMethod = 'none' | 'local-progressive' | 'ai';

interface UpscaleRequest {
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
}

interface UpscaleResultMetadata {
  method: UpscaleMethod;
  ratio: number;
  sourceSize: [number, number];
  targetSize: [number, number];
}
```

The local engine is the only configured implementation. An `ai` method remains a type-level extension point; it has no provider, endpoint, settings control, or fallback behavior in this release.

The existing image-processing worker owns the local engine. The main thread only submits work, displays progress, handles cancellation, and receives the result metadata.

## Processing Pipeline

For final raster export:

1. Decode the source with `createImageBitmap`.
2. Calculate the fit scale used by the selected product target.
3. If the scale is at or below 1x, render normally and record `method: 'none'`.
4. If enlargement is needed, resize progressively in bounded steps no larger than 2x per pass.
5. Yield between passes and report pass-level progress.
6. Apply restrained sharpening after the final enlargement pass.
7. Continue existing background, color, transparency, and export processing.
8. Encode the print file with the selected preset dimensions and DPI metadata.

Intermediate canvases are released as soon as a pass completes. Cancellation is checked before and after every pass and before sharpening. The algorithm must not create an additional full-size main-thread canvas.

## Quality Policy

The enlargement ratio is the larger of the target-to-source width and height ratios after accounting for the selected fit behavior.

| Ratio | Status | Download |
| --- | --- | --- |
| 1x or less | Ready | Allowed |
| Above 1x to 2x | Enhanced locally | Allowed |
| Above 2x to 4x | Fine detail may look soft | Allowed |
| Above 4x | Extreme enlargement may look soft or artificial | Allowed |

The existing hard download block for enlargement above 4x is removed from the default creator flow. Other true stoppers, including decode failures, worker failures, timeouts, unsupported output formats, and service file-size limits, remain blocking.

## Progress, Errors, and Cancellation

Progress messages identify the current enhancement pass without exposing implementation details, for example `Enhancing image (2 of 3)`.

Cancellation terminates the active operation and releases intermediate image resources. A worker error or timeout surfaces the existing readable retry state. The app does not silently fall back to synchronous main-thread pixel processing.

If local enhancement fails, no lower-quality file is downloaded automatically. The user can retry, choose a smaller product, or return with a larger source image.

## Testing

Unit tests cover:

- Ratio classification at 1x, 2x, 4x, and immediately above each boundary.
- Removal of the >4x download block while retaining the strong warning.
- Progressive pass planning with no pass larger than 2x.
- Metadata for unchanged and progressively enlarged exports.
- Cancellation between passes.

Worker integration tests cover:

- Exact output dimensions for every Printify preset.
- DPI metadata and service file-size limits.
- Progress events for multi-pass enlargement.
- No full-resolution preview work.

Browser acceptance covers:

- The existing 2500x3000 to 4500x5400 tee flow.
- Hoodie, mug, poster, and blanket exports using representative undersized fixtures.
- UI responsiveness and cancellation during a multi-pass export.
- A source requiring more than 4x enlargement can download only after the strong warning is visible.

The repository `npm run verify` gate must pass before deployment. Production acceptance repeats the creator-flow export against `inkmasterstudio.com`.

## Deferred AI Enhancement

A later phase may implement an `ai` engine behind an explicit opt-in. That phase must define provider selection, artwork retention, cost controls, privacy copy, server-side credentials, failure fallback, and quality comparisons. None of those concerns are implied or partially implemented by this local release.
