# Phase 2A Task 4 Report

## Status

Complete. The bounded source-only compatibility canvas was replaced by an ordered image/text compositor with topmost selection and viewport-normalized dragging of the hit layer.

The progress ledger was not edited.

## Commit

- `68629448b013786758a93679dfb78dc7647abcc8` `feat: render and select ordered design layers`

## Files

- `editor/compositor.ts`: added ordered image/text rendering, deterministic text measurement, 1000-pixel reference scaling, 1.2 line height, explicit character spacing, and reverse-order hit testing.
- `editor/geometry.ts`: added inverse-rotation rectangle hit testing shared by image and text layers.
- `components/editor/EditorCanvas.tsx`: added URL-keyed image decoding, stale-callback guards, ordered composition, topmost selection, and hit-layer drag capture without URL revocation.
- `components/editor/EditorApp.tsx`: passes active layers, selection, workspace assets, and borrowed URLs; dispatches selection and layer-specific transforms.
- `tests/editor-compositor.test.ts`: covers image/text composition, font scaling, hidden/missing assets, reverse hit testing, hit-layer drag normalization, stale decode callbacks, and controller lifecycle replay.
- `tests/editor-geometry.test.ts`: covers rotated bounds and retains the borrowed-URL ownership guard.
- `tests/editor-shell.test.ts`: replaces the retired source-only compatibility assertion with selected-image inspector preservation coverage.
- `.superpowers/sdd/task-4-report.md`: this report.

## Red Evidence

Initial command before production implementation:

```powershell
npx tsx --test tests/editor-compositor.test.ts tests/editor-geometry.test.ts
```

Exit code: `1`.

```text
ERR_MODULE_NOT_FOUND: Cannot find module editor/compositor
SyntaxError: editor/geometry does not provide isPointInRotatedRect
tests 2
pass 0
fail 2
```

Self-review found that cleanup/setup lifecycle replay could dispose the decoder before a replayed sync. A pure controller regression assertion was added before the fix; it did not mount React or exercise `React.StrictMode` directly:

```powershell
npx tsx --test tests/editor-compositor.test.ts
```

Exit code: `1`.

```text
tests 5
pass 4
fail 1
AssertionError: 2 !== 3
```

The failure proved a disposed controller did not restart decoding during effect replay.

## Initial Green Verification (Pre-Review-Fix Evidence)

All commands in this section were recorded before the subsequent Task 4 review fixes. The broad suite/build and Playwright results below are historical pre-review-fix evidence, not post-review-fix verification.

Focused covering command:

```powershell
npx tsx --test tests/editor-compositor.test.ts tests/editor-geometry.test.ts tests/editor-shell.test.ts
```

Exit code: `0`.

```text
tests 22
pass 22
fail 0
cancelled 0
skipped 0
todo 0
```

Full command:

```powershell
npm test
```

Exit code: `0`. `tsc --noEmit`, the Vite production build, and the production-style guard passed. The TypeScript test suite reported:

```text
tests 342
pass 342
fail 0
cancelled 0
skipped 0
todo 0
```

Browser command:

```powershell
npx playwright test tests/e2e/canvas-editor.spec.ts
```

Exit code: `0`; `8 passed (25.2s)`.

Whitespace command:

```powershell
git diff --cached --check
```

Exit code: `0`; no whitespace errors were reported before the feature commit.

## Self-Review

- Layers are consumed in stored bottom-to-top order. Rendering iterates forward; hit testing iterates backward and skips hidden layers and image layers without both metadata and a decoded image.
- Image layers retain existing crop, fit, adjustment, opacity, centered rotation, scale, and flip behavior.
- Text preview font pixels are exactly `fontSize * min(viewport.width, viewport.height) / 1000`, then transformed by `layer.transform.scale`. Letter spacing and outline units use the same reference extent, and line height is exactly `1.2`.
- Text measurement and rendering share per-character widths, so bounds, alignment, and explicit spacing remain deterministic without `CanvasRenderingContext2D.letterSpacing`.
- Pointer-down uses compositor hit testing, dispatches `select-layer`, and captures that hit layer's ID and transform. Drag remains bound to that layer even while React applies selection state. Blank clicks do not dispatch or start history groups.
- Decoding is cached by active URL value, publishes only current URL-to-asset mappings, deactivates stale callbacks, and can restart after controller lifecycle cleanup. No borrowed URL is revoked.
- `EditorInspector` still receives `getSelectedImageLayer(project)`, so its existing image-only behavior is unchanged and text selection yields no image inspector layer.
- The production build, complete unit suite, and desktop/mobile editor acceptance tests passed for the initial implementation before review fixes; post-review evidence is recorded in the Fix Review sections below.

## Concerns

- Hit testing intentionally uses transformed rectangular layer bounds rather than image alpha masks or glyph outlines.
- Text editing controls and layer inspectors remain deferred to later Phase 2A tasks, as required.
- No known functional concerns remain within Task 4 scope.

## Fix Review

### Findings Addressed

1. Decoded state is now `assetId -> { url, image }`. `getCurrentDecodedImages` synchronously intersects that state with the current `assetUrlsById` props during render, before passive-effect controller synchronization. Both composition and pointer hit testing receive only this current-URL image map.
2. Text lines now track the minimum and maximum actual glyph extents at every pen position. Canvas outline expansion is included as half the rendered line width on each side. Bounds, left/center/right origins, drawing, and hit testing share these line extents, including when negative spacing reverses pen movement.
3. StrictMode language was corrected. The dispose/sync regression is pure controller lifecycle replay coverage; it does not mount React or directly verify `React.StrictMode` behavior.

### Fix Files

- `components/editor/EditorCanvas.tsx`: URL-tagged decoded entries, pure current-prop filtering, and lifecycle-neutral replay language.
- `editor/compositor.ts`: per-glyph actual bounding extents, outlined line unions, extent-based alignment origins, and coherent bounds.
- `tests/editor-compositor.test.ts`: pre-effect URL replacement, old callback window, post-sync stale callback, lifecycle replay, and narrow negative-spacing multiline coverage for all alignments.
- `.superpowers/sdd/task-4-report.md`: corrected prior terminology and appended this review evidence.

The progress ledger was not edited.

### Fix Red Evidence

URL-coherence command before implementation:

```powershell
npx tsx --test tests/editor-compositor.test.ts
```

Exit code: `1`.

```text
SyntaxError: EditorCanvas does not provide an export named 'getCurrentDecodedImages'
tests 1
pass 0
fail 1
```

This was the expected missing-contract failure for synchronous current-prop filtering. After the URL fix, the same command exited `0` with `6` passed and `0` failed.

Negative-spacing command before the glyph-extents implementation:

```powershell
npx tsx --test tests/editor-compositor.test.ts
```

Exit code: `1`.

```text
tests 9
pass 6
fail 3
cancelled 0
skipped 0
todo 0

left/center/right negative-spacing bounds:
actual   { x: 485.5, y: 378, width: 29, height: 244 }
expected { x: 486.5, y: 379, width: 27, height: 242 }
```

All three tests stopped at their initial bounds assertions. They proved only that the old negative-spacing bounds were `{ x: 485.5, y: 378, width: 29, height: 244 }` instead of the expected actual-outlined-extents bounds; their later rendering and hit-testing assertions did not execute in this red run.

### Fix Green Evidence

Required focused command:

```powershell
npx tsx --test tests/editor-compositor.test.ts tests/editor-geometry.test.ts tests/editor-shell.test.ts
```

Exit code: `0`.

```text
tests 26
pass 26
fail 0
cancelled 0
skipped 0
todo 0
```

Required typecheck command:

```powershell
npm run typecheck
```

Exit code: `0`.

```text
> inkmaster-studio@0.0.0 typecheck
> tsc --noEmit
```

Required whitespace command:

```powershell
git diff --check
```

Exit code: `0`; no whitespace errors were reported. Git emitted only the repository's existing LF-to-CRLF working-copy warnings.

### Fix Commit

- `9ed58dd8993d98b8edea992a94b3cb4453f5bfd2` `fix: keep canvas assets and text bounds coherent`

### Fix Self-Review

- A same-ID prop URL replacement immediately produces an empty current image map until the replacement decode completes. The previous decoded entry cannot paint or participate in topmost hit testing during the passive-effect window.
- An old callback before controller sync may publish only its old URL-tagged entry; current props reject it synchronously. After replacement sync, the old callback is deactivated and does not publish at all.
- URL reuse across asset IDs still decodes once per active URL, while each published asset entry retains the URL needed for current-generation validation. Borrowed URLs are never revoked by the canvas.
- Glyph measurement uses `actualBoundingBoxLeft` and `actualBoundingBoxRight`, with a width-based fallback for test doubles or implementations without actual bounds. Spaces with supported zero ink bounds advance the pen without inventing visible extents.
- Negative spacing cannot collapse bounds: every glyph contributes its actual min/max at its pen position, so reversed pen movement expands the union correctly. The same union determines render origins and hit bounds for left, center, and right alignment.
- Outline geometry matches Canvas stroke semantics by expanding horizontal and outer vertical bounds by half of `context.lineWidth` per side.
- The required focused suite, clean typecheck, and whitespace check all passed after the final code change.

### Fix Concerns

- Vertical layout intentionally retains the specified 1.2 line-height box; actual glyph ascent/descent does not replace that design contract.
- Hit testing remains rectangular rather than alpha- or glyph-path-aware, unchanged from Task 4 scope.
- No known functional concerns remain from the review findings.

## Final Fix Review

### Finding Addressed

Text measurement now establishes the same deterministic physical Canvas state used by drawing before the first `measureText` call: the layer font, `textAlign = 'left'`, `textBaseline = 'alphabetic'`, and `direction = 'ltr'`. Measurement is enclosed in `save()` plus `try/finally restore()`, while drawing uses the same state inside its existing save/restore block.

Alphabetic baselines are placed one font size below each 1.2-line-height box top. This keeps the requested physical baseline deterministic without leaving baselines at the previous middle coordinates.

The regression double changes `actualBoundingBoxLeft` and `actualBoundingBoxRight` when it receives inherited center or right alignment. It proves bounds, character draw coordinates, and hit results are identical for prior left, center, and right state; it also proves bounds, rendering, and hit testing restore the caller's font, alignment, baseline, and direction.

The initial broad `npm test`/build and Playwright results are now explicitly labeled as pre-review-fix evidence. They were not rerun for this final fix. The earlier negative-spacing red conclusion now states that those tests stopped at their bounds assertions and did not execute their later render/hit assertions.

### Final Fix Files

- `editor/compositor.ts`: deterministic pre-measure text state, measurement save/finally/restore, matching render state, and alphabetic baseline placement within 1.2 line boxes.
- `tests/editor-compositor.test.ts`: stateful save/restore recording double, alignment-sensitive metrics double, prior-state invariance, no-leak assertions, and physical draw-state coverage.
- `.superpowers/sdd/task-4-report.md`: historical evidence labels, narrowed prior red claim, and this final evidence.

The progress ledger was not edited.

### Final Fix Red Evidence

Physical-state regression command before implementation:

```powershell
npx tsx --test tests/editor-compositor.test.ts
```

Exit code: `1`.

```text
tests 10
pass 9
fail 1
cancelled 0
skipped 0
todo 0

text bounds, rendering, and hit testing ignore prior context alignment without leaking text state
actual   { font: '100px Arial', textAlign: 'left', textBaseline: 'bottom', direction: 'rtl' }
expected { font: '13px Legacy', textAlign: 'left', textBaseline: 'bottom', direction: 'rtl' }
```

The test stopped at its first post-bounds state assertion. It proved measurement leaked its font; it did not yet execute the center/right result comparison.

Self-review then added alphabetic baseline-position expectations before changing baseline coordinates. Red command:

```powershell
npx tsx --test tests/editor-compositor.test.ts
```

Exit code: `1`.

```text
tests 10
pass 5
fail 5
cancelled 0
skipped 0
todo 0

multiline 50px text actual y: -30, 30; expected y: -10, 50
multiline 100px text actual y: -60, 60; expected y: -20, 100
single-line 100px text actual y: 0; expected y: 40
```

These failures proved drawing still used the old line-center coordinates after switching to an alphabetic physical baseline.

### Final Fix Green Evidence

Required focused command against the final code:

```powershell
npx tsx --test tests/editor-compositor.test.ts tests/editor-geometry.test.ts
```

Exit code: `0`.

```text
tests 18
pass 18
fail 0
cancelled 0
skipped 0
todo 0
```

Required typecheck command:

```powershell
npm run typecheck
```

Exit code: `0`.

```text
> inkmaster-studio@0.0.0 typecheck
> tsc --noEmit
```

Required whitespace command:

```powershell
git diff --check
```

Exit code: `0`; no whitespace errors were reported. Git emitted only the repository's LF-to-CRLF working-copy warnings.

### Final Fix Commit

- `16534377506f38656c8f387cef67e49be1cc066b` `fix: normalize canvas text measurement state`

### Final Fix Self-Review

- `measureTextLayer` saves before changing any context property and restores in `finally`, including if `measureText` throws.
- Font, left alignment, alphabetic baseline, and LTR direction are assigned before line iteration and therefore before every `measureText` call.
- `renderTextLayer` assigns the same font/alignment/baseline/direction state before `strokeText` or `fillText`; its enclosing save/restore prevents drawing state from leaking.
- The alignment-sensitive double would return different glyph extents for inherited center/right state. Equal bounds, draw coordinates, and edge hit results across all three prior alignments prove measurement does not inherit that state.
- Caller-state assertions run after bounds, rendering, and both hit tests for every prior alignment.
- Alphabetic baseline coordinates use `lineTop + fontPixels`; consecutive lines remain exactly `1.2 * fontPixels` apart.
- Focused tests and typecheck pass on the final code. Broad build/full-suite and Playwright results remain clearly identified as pre-review-fix evidence only.

### Final Fix Concerns

- Direction is intentionally fixed to LTR because this compositor draws stored text explicitly in character order and does not yet expose bidirectional text controls.
- Vertical hit bounds retain the specified font-size-based 1.2 line boxes rather than using font-specific ascent/descent.
- No known functional concerns remain from the final finding.
