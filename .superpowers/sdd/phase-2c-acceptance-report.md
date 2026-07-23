# Phase 2C Acceptance Report

Date: 2026-07-23

## Result

Phase 2C is accepted. The owner editor now supports reversible local background removal, bounded erase/restore corrections, editable deterministic vector traces, a fixed 1000 by 1000 design surface, and validated vector-only SVG master export without adding deferred production or AI scope.

The acceptance run found and fixed one release-blocking defect: ImageTracer's opaque user palette replaced transparent input pixels during a geometry rebuild. Palette application now occurs only on sanitized trace geometry, preserving transparent paths. Unit and browser pixel assertions cover the regression.

## Commit Range

Functional range: `0f59781..43f1291`

- `0f59781` - Phase 2C design specification
- `552d209` - Phase 2C implementation plan
- `f870e29` - Schema 4, history, and generated-asset authority
- `bed02fc` - Deterministic background-removal processor
- `601ff1b` - Background-removal worker and rendering authority
- `9141fda` - Reversible background-cleanup workflow
- `416a256` - Safe deterministic vector trace engine
- `0a5ee3e` - Editable trace-layer integration
- `4c51f6b` - Canonical design surface and validated SVG export
- `43f1291` - Whole-flow acceptance, transparent-trace fix, and browser evidence

## Release Gates

- TypeScript: passed with `tsc --noEmit`.
- Production build: passed with Vite 8.0.16.
- Production style test: 1 passed.
- Node tests: 508 passed, 0 failed.
- Chromium E2E: 26 passed, 0 failed.
- Focused Phase 2C owner flow: passed in 9.1 seconds.
- Whitespace check: passed.
- Scope scan: passed; deferred terms occur only in negative boundary assertions.
- Lifecycle scan: passed; temporary export URLs revoke in `finally`, asset URLs have registry cleanup, and all worker owners terminate.

## Production Bundles

| Asset | Bytes |
| --- | ---: |
| `backgroundRemovalWorker-DeviNfcd.js` | 12,248 |
| `lookWorker-VirWboy5.js` | 13,738 |
| `traceWorker-DaEU9abD.js` | 35,715 |
| `index-DhIbjGFd.css` | 65,701 |
| `rolldown-runtime-Cko4QHwX.js` | 568 |
| `index-CDZQZRAc.js` | 179,067 |
| `react-vendor-DLGS5Ghy.js` | 199,146 |

`imagetracerjs` is present only in the trace worker. The entry and background-removal worker exclude ImageTracer, Gemini, retired image-processing modules, and deferred production workflow terminology.

## Owner-Flow Evidence

The deterministic desktop/mobile acceptance flow covers:

1. PNG import and immutable source SHA-256 capture.
2. Automatic and picked-color background removal.
3. Tolerance and feather changes.
4. One erase and one restore correction with undo/redo.
5. Trace creation as one undoable source-hide operation.
6. Detail, smoothing, palette, and transform edits.
7. Text creation for editable SVG text proof.
8. Autosave, reload, and local-project reopen.
9. Compare Board rendering for two variations.
10. Desktop/mobile SVG downloads with byte equality.
11. Restore Source, mobile Layers selection, brush-cursor proof, and undo.

The source asset digest is identical before and after cleanup, tracing, export, reload, and undo. Generated roles and MIME types are persisted as prepared PNG, correction JSON, and trace SVG assets.

Prepared-pixel evidence:

- Removed corner alpha: `0`
- Enclosed same-color detail alpha: `255`
- Foreground alpha: `255`

Trace transparency evidence:

- A removed-background canvas sample equals the neutral canvas background.
- A traced-foreground sample differs from the neutral canvas background.
- Palette-bearing transparent trace input retains an opacity-zero path.

SVG parser evidence:

- Root viewBox: `0 0 1000 1000`
- Path count: greater than zero
- Editable text count: `1`
- Raster image count: `0`
- Unsafe element count: `0`
- Parser error count: `0`
- Desktop and mobile output bytes: identical

Reviewed screenshots:

- `test-results/phase-2c/desktop-image-prep-trace-1440x900.png`
- `test-results/phase-2c/mobile-image-prep-trace-390x844.png`

In-app browser QA also created a real logo trace at desktop and mobile sizes. The page identity, nonblank canvas, toolbar, lower inspector, and generated trace were correct with no console errors or warnings.

## Protected Preview

- Deployment ID: `dpl_9KQDMCQYuy4GqscdwAmTQPZC3i1P`
- Preview URL: `https://inkmasterstudio-ivc7u7yp4-brincode.vercel.app`
- Framework: Vite
- Region: `iad1`
- State: `READY`
- Deployed commit: `43f1291b37140cae694f56d5dff98282df21846d`
- Authenticated `/`: HTTP 200
- Authenticated `/privacy`: HTTP 200
- Unauthenticated `/`: HTTP 302 to Vercel SSO

The remote deployment was HTTP-smoke-tested through authenticated Vercel tooling. The complete interactive desktop/mobile workflow was run locally against the same committed Vite source and production bundle boundaries.

Operational note: Vercel warns that `engines.node` uses `>=22.12.0`, which permits automatic major-version upgrades. This is existing deployment configuration, not a Phase 2C blocker.

## Deferred Scope

The following remain explicitly deferred:

- Products, placements, mockups, Print Lens, DPI analysis, and provider integration
- Validation receipts and production packages
- General photographic segmentation or generative cleanup
- General masks, brush libraries, selections, drawing, or shapes
- Path editing and SVG import
- Additional AI features
- Unrelated legacy workflow retirement

Any of these requires a separately reviewed phase rather than expansion of Phase 2C.
