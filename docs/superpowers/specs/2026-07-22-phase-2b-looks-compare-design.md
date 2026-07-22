# Phase 2B Looks And Compare Board Design

**Status:** Approved design

**Parent specification:** `docs/superpowers/specs/2026-07-17-canvas-first-product-reset-design.md`

**Roadmap:** `docs/superpowers/plans/2026-07-20-canvas-first-reset-roadmap.md`

## Purpose

Phase 2B turns the layered editor into a variation-making tool. It adds deterministic, editable Looks to the complete composed variation and a focused Compare Board for choosing between two to four variations. It preserves the local-first, non-destructive source and layer model completed in Phase 2A.

This phase does not add vector trace, SVG export, products, mockups, Print Lens, Print Treatments, cloud processing, collaboration, or AI.

## Product Decisions

- A Look applies to the entire composed variation, including image and text layers.
- Selecting a Look updates the active variation. It does not create another variation automatically.
- Look changes are variation-scoped, undoable, editable, autosaved, and reproducible after reopen.
- The primary Look control is `Strength`. Look-specific controls are under `More`.
- Phase 2B ships all eight approved Looks: Clean Photo, High Contrast, Monochrome, Duotone, Posterized, Graphic Halftone, Vintage Ink, and Distressed Print.
- Compare Board supports neutral, light, and dark artwork backgrounds. Mockup, distance, and ink-aware modes remain deferred.
- Compare Board selection and view state are session-only. It never creates approval or collaboration state.

## Experience

### Looks Tool

The existing toolbar gains a Looks command. Opening it keeps the canvas as the primary surface and replaces the inspector content with:

1. A compact grid containing `Original` and eight live thumbnails rendered from the active variation.
2. A `Strength` control for the selected Look.
3. A collapsed `More` section containing only the selected Look's parameters.
4. `Reset Look` and, for seeded Looks, `Reroll texture` commands.

Selecting a thumbnail applies the Look immediately to the active variation. The canvas uses the last valid frame while a new frame is processing. Rapid changes replace obsolete render requests rather than queueing visible updates.

`Original` is the absence of processing. Resetting a Look does not change layers, layer adjustments, source assets, variation names, or selection.

### Compare Board

Compare Board replaces the central editing canvas while open. It is not a modal and is not presented as decorative cards.

- A compact variation menu selects any two to four variations.
- The active variation is initially included. The nearest project-order sibling fills the second slot when available.
- Compare Board is unavailable when the project has fewer than two variations.
- Two selections use two equal frames. Three or four selections use a two-by-two desktop grid.
- At mobile widths, previews are equal-width horizontal pages in a scrollable strip.
- A segmented control selects `Neutral`, `Light`, or `Dark` background.
- One shared zoom control keeps every variation at identical framing.
- Every frame shows the variation name and an `Edit variation` command. Activating it selects that variation and returns to the editor canvas.
- Layer and Look editing controls are hidden while comparing. The top bar retains project save state and variation management.

Neutral uses the editor's neutral canvas surface. Light is `#f5f5f3`. Dark is `#161616`. These are comparison backgrounds only and are never composited into saved artwork.

## Project Schema

Phase 2B introduces editor project schema version 3.

```ts
export interface EditorProject {
  schemaVersion: 3;
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
  look: VariationLook;
}
```

Schema-1 and schema-2 projects migrate to schema 3 with `{ id: 'original', strength: 100 }`. Existing source identity, layer IDs, asset IDs, text values, selected layer, and variation order remain unchanged. Saving never stores rendered Look thumbnails or preview pixels.

## Look Model

`VariationLook` is a discriminated union. Every non-original recipe stores `strength`, an integer from 0 through 100. Invalid or non-finite values normalize to the documented defaults.

```ts
export type VariationLook =
  | { id: 'original'; strength: 100 }
  | { id: 'clean-photo'; strength: number; contrast: number; saturation: number; clarity: number }
  | { id: 'high-contrast'; strength: number; contrast: number; blackPoint: number; saturation: number }
  | { id: 'monochrome'; strength: number; contrast: number; brightness: number }
  | { id: 'duotone'; strength: number; shadowColor: string; highlightColor: string; balance: number }
  | { id: 'posterized'; strength: number; levels: number; contrast: number }
  | {
      id: 'graphic-halftone';
      strength: number;
      cellSize: number;
      angle: number;
      foregroundColor: string;
      background: 'transparent' | 'solid';
      backgroundColor: string;
    }
  | { id: 'vintage-ink'; strength: number; warmth: number; fade: number; grain: number; seed: number }
  | {
      id: 'distressed-print';
      strength: number;
      wear: number;
      textureScale: number;
      edgeBreakup: number;
      seed: number;
    };
```

### Parameter Contracts

| Look | Parameter | Range | Default |
| --- | --- | --- | --- |
| All processed Looks | Strength | 0–100 integer | 100 |
| Clean Photo | Contrast | 0–40 integer | 10 |
| Clean Photo | Saturation | -20–40 integer | 8 |
| Clean Photo | Clarity | 0–30 integer | 8 |
| High Contrast | Contrast | 0–100 integer | 55 |
| High Contrast | Black point | 0–40 integer | 12 |
| High Contrast | Saturation | -100–50 integer | 5 |
| Monochrome | Contrast | -50–100 integer | 20 |
| Monochrome | Brightness | -50–50 integer | 0 |
| Duotone | Shadow color | six-digit hex | `#111827` |
| Duotone | Highlight color | six-digit hex | `#f59e0b` |
| Duotone | Balance | -50–50 integer | 0 |
| Posterized | Levels | 2–8 integer | 4 |
| Posterized | Contrast | 0–100 integer | 20 |
| Graphic Halftone | Cell size | 4–32 integer design units | 10 |
| Graphic Halftone | Angle | 0–180 integer degrees | 45 |
| Graphic Halftone | Foreground | six-digit hex | `#111111` |
| Graphic Halftone | Background | transparent or solid | transparent |
| Graphic Halftone | Background color | six-digit hex | `#f5f5f3` |
| Vintage Ink | Warmth | 0–100 integer | 45 |
| Vintage Ink | Fade | 0–100 integer | 25 |
| Vintage Ink | Grain | 0–100 integer | 20 |
| Distressed Print | Wear | 0–100 integer | 35 |
| Distressed Print | Texture scale | 1–12 integer | 5 |
| Distressed Print | Edge breakup | 0–100 integer | 25 |

Seeds normalize to unsigned 32-bit integers. Creating a seeded Look assigns a cryptographically generated seed when available and a timestamp/counter-derived unsigned fallback otherwise. Duplicating a variation copies its Look and seed exactly. `Reroll texture` changes only the active recipe's seed and is undoable.

## History Semantics

Variation edit history expands from layers-only state to:

```ts
interface VariationEditState {
  layers: DesignLayer[];
  look: VariationLook;
}
```

The following commands are variation-scoped and undoable:

```ts
| { type: 'set-look'; look: VariationLook; historyGroup?: string }
| { type: 'reroll-look-seed'; seed: number }
| { type: 'reset-look' }
```

Every `set-look` command carries a complete normalized recipe rather than a loosely typed parameter patch. Continuous controls use `set-look` with a history group and coalesce until that group ends. Look selection uses `set-look` without a group; reset and seed reroll are also discrete history entries. Layer selection remains outside undo history. Undo restores layers and Look together without switching variations or replacing project metadata.

## Deterministic Rendering

Rendering has one fixed order:

1. Compose every visible layer bottom-to-top with the Phase 2A compositor.
2. Send the straight-alpha RGBA pixel buffer, dimensions, and normalized Look recipe to the Look processor.
3. Render the full Look result.
4. Convert original and processed colors to premultiplied-alpha components, interpolate color and alpha using `strength / 100`, then unpremultiply the result.
5. Return the bounded processed frame for display.

Original bypasses pixel processing. Clean Photo, High Contrast, Monochrome, Duotone, Posterized, and Vintage Ink preserve the composed alpha channel before Strength blending. Graphic Halftone with transparent background modulates alpha only inside existing artwork coverage. Distressed Print may reduce alpha only inside existing artwork coverage. Graphic Halftone with solid background intentionally fills the complete design canvas before Strength blending.

All color calculations use sRGB byte inputs with explicit clamping and rounding. Algorithms must not depend on CSS filters, `Math.random`, browser-specific canvas filters, or ambient canvas state.

### Look Algorithms

- **Clean Photo:** apply contrast and saturation around mid-gray, then a bounded unsharp-mask clarity pass.
- **High Contrast:** move the black point, apply the stronger contrast curve, then saturation.
- **Monochrome:** convert with fixed Rec. 709 luminance coefficients, then brightness and contrast.
- **Duotone:** convert to luminance, offset by balance, and interpolate between shadow and highlight colors.
- **Posterized:** apply contrast, then quantize each RGB channel to the selected number of levels.
- **Graphic Halftone:** rotate normalized design coordinates by angle, sample a fixed cell grid, and compare radial distance with luminance-derived dot radius. Transparent mode emits only source-covered dots; solid mode paints the chosen background across the design canvas.
- **Vintage Ink:** apply a warm shadow/highlight mapping, fade the tonal range, and add zero-mean seeded grain.
- **Distressed Print:** generate seeded multi-scale wear from normalized design coordinates and combine it with an alpha-edge factor. Wear and edge breakup control alpha removal; texture scale controls normalized pattern frequency.

Halftone and seeded textures sample normalized coordinates in a canonical 4096-by-4096 design space. Pattern placement therefore remains anchored when preview dimensions change. The seed hash uses documented integer arithmetic with `Math.imul`; it cannot use runtime randomness while rendering.

## Worker And Render Coordination

Pixel processing runs in a dedicated module worker. Font and layer composition remain on the main thread so the existing compositor stays authoritative. The worker accepts transferable RGBA buffers and returns transferable processed buffers.

```ts
interface LookRenderRequest {
  requestId: number;
  renderKey: string;
  width: number;
  height: number;
  pixels: ArrayBuffer;
  look: VariationLook;
}

interface LookRenderSuccess {
  requestId: number;
  renderKey: string;
  width: number;
  height: number;
  pixels: ArrayBuffer;
}

interface LookRenderFailure {
  requestId: number;
  renderKey: string;
  message: 'Look preview failed.';
}
```

The coordinator applies a result only when both request ID and render key still match the latest request for that surface. Obsolete results are discarded. Worker errors preserve the last valid processed frame; if no processed frame exists, the surface shows its unprocessed composition. The Looks inspector exposes the stable error and a Retry command. A failed Compare tile does not blank or block other tiles.

Render keys include variation ID, a stable canonical hash of normalized layer records and immutable asset IDs, bounded dimensions, background mode where relevant, and the normalized recipe. They never include object URLs or blob contents. A processing request begins only after every visible image layer has a decoded immutable asset; loading or decode failure continues to use the existing canvas loading/error path instead of caching an incomplete composition.

### Bounds And Cache

- Main preview longest side: at most 1600 pixels.
- Compare preview longest side: at most 800 pixels per tile.
- Look thumbnail longest side: at most 240 pixels.
- Processed-frame cache: least-recently-used, maximum 64 MiB of RGBA data.
- Closing a project, removing a variation, or disposing the editor releases matching cached buffers and worker listeners.

The cache is an optimization only. A cache miss must reproduce the same pixels.

## Components And Boundaries

- `editor/lookModel.ts`: Look types, defaults, normalization, seed creation, and labels.
- `editor/lookProcessor.ts`: pure RGBA algorithms and deterministic coordinate hashing; no React, DOM, canvas, or storage dependencies.
- `editor/lookRenderCoordinator.ts`: worker messages, stale-result protection, retry, byte-bounded LRU cache, and disposal.
- `editor/lookWorker.ts`: module-worker adapter around the pure processor.
- `components/editor/LooksInspector.tsx`: thumbnail selection, Strength, advanced controls, reset, reroll, error, and retry.
- `components/editor/CompareBoard.tsx`: selection, background mode, shared zoom, responsive frames, and return-to-edit behavior.
- The existing compositor remains the only layer-composition implementation.
- The existing project repository remains the only persistence boundary.

No old production-workbench recipe, processing, or preview component may be imported into the editor bundle. Proven pure algorithms may be adapted only after moving them behind the new Look contracts and tests.

## Responsive And Accessible Behavior

- Looks and Compare Board use the existing desktop right rail and mobile bottom inspector/drawer conventions.
- Thumbnail buttons expose selected state and the Look name.
- Advanced controls have programmatic labels, bounded numeric inputs, and matching range controls where the existing inspector pattern supports them.
- Color controls use native color swatches with six-digit text normalization.
- Compare variation controls use stable variation IDs, not names.
- Every Compare canvas has an accessible name containing its variation name and background mode.
- Mobile preview pages have stable dimensions and cannot resize the bottom toolbar.
- Focus returns to the invoking Looks or Compare command when a drawer or board closes.
- Keyboard users can select Looks, edit every parameter, choose Compare variations, change background, change zoom, and return to editing.

## Session State

The following Compare Board values are session-only and reset when the editor unmounts:

- Selected variation IDs.
- Neutral, light, or dark background mode.
- Shared zoom.
- Current mobile preview page.

They do not update project timestamps or autosave. Applying a Look from the Looks tool does update the project and autosave normally.

## Failure Handling

- Invalid persisted Look recipes normalize to Original or to the selected Look's documented defaults without changing source or layers.
- A worker failure never mutates the saved recipe and never clears a valid canvas frame.
- Retry resubmits the current render key only.
- Missing variation IDs are removed from Compare selection. If fewer than two remain, Compare Board exits to the active variation.
- A deleted active Compare variation follows the existing deterministic variation fallback before the board revalidates selection.
- Cache allocation failure bypasses caching and still returns the computed frame when possible.

## Acceptance Criteria

### Model And History

- Schema-1 and schema-2 projects migrate to schema 3 with Original and unchanged source, asset, layer, and selection identity.
- Every Look and parameter normalizes to the documented contract.
- Applying, editing, resetting, and rerolling a Look are variation-scoped and undoable.
- Duplicating a variation copies its recipe and seed without sharing mutable state.
- Look state survives save, reload, and project reopen.

### Rendering

- Fixed RGBA fixtures produce exact expected bytes for all eight Looks.
- Original is byte-identical to the composed input.
- Strength 0 is byte-identical to input and Strength 100 is byte-identical to full processing.
- Intermediate Strength blending is deterministic, including alpha-changing Looks.
- Transparent pixels remain transparent except for intentionally selected solid halftone background.
- Same pixels, dimensions, normalized recipe, and seed produce identical bytes across repeated runs.
- Seeded pattern placement remains anchored across bounded preview sizes when compared in normalized coordinates.
- Stale worker results and stale failures cannot replace the current surface.
- Cache byte bounds and disposal are verified.

### Interface

- All nine thumbnail choices render from the current variation and selecting a Look updates the main canvas.
- Strength and advanced controls match the selected recipe and remain usable on desktop and mobile.
- Compare Board selects two to four variations by ID, uses equal framing, and switches neutral/light/dark backgrounds without mutating artwork.
- Shared zoom updates every Compare frame equally.
- `Edit variation` returns to the canvas with the requested variation active.
- At 390 by 844, previews remain visible, horizontally scrollable, and clear of the inspector and toolbar.

### Final Gate

- Focused model, processor, history, coordinator, component, and browser tests pass.
- Full typecheck, production build, unit/style suite, and Playwright suite pass.
- `git diff --check` passes.
- Desktop and 390-by-844 screenshots are inspected at original resolution.
- A protected non-production Vercel preview is deployed and `/` plus `/privacy` are smoke-tested.
- No vector trace, SVG export, product, mockup, Print Lens, Print Treatment, production workflow, collaboration, or AI UI enters the Phase 2B editor bundle.

## Deferred Work

- Adjustable vector trace layers and standalone SVG master export.
- Product variants, photographic mockups, placement, and validated final export.
- Ink-aware preview, Print Lens, and reversible Print Treatments.
- Worker-backed high-resolution product rendering and Pica fixture gating.
- Retirement of unreachable production-workbench and Gemini code.
- Any AI-assisted feature.
