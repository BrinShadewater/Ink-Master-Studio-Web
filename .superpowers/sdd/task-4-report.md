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
- `tests/editor-compositor.test.ts`: covers image/text composition, font scaling, hidden/missing assets, reverse hit testing, hit-layer drag normalization, stale decode callbacks, and StrictMode replay.
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

Self-review found that React StrictMode effect replay would dispose the decoder before its replayed sync. A regression assertion was added before the fix:

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

## Green Verification

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
- Decoding is cached by active URL value, publishes only current URL-to-asset mappings, deactivates stale callbacks, and can restart after StrictMode cleanup. No borrowed URL is revoked.
- `EditorInspector` still receives `getSelectedImageLayer(project)`, so its existing image-only behavior is unchanged and text selection yields no image inspector layer.
- The production build, complete unit suite, and desktop/mobile editor acceptance tests passed after the final implementation.

## Concerns

- Hit testing intentionally uses transformed rectangular layer bounds rather than image alpha masks or glyph outlines.
- Text editing controls and layer inspectors remain deferred to later Phase 2A tasks, as required.
- No known functional concerns remain within Task 4 scope.
