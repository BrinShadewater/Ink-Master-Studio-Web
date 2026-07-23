# Phase 3A T-shirt Placement Acceptance

## Reviewed Range

- Specification: `e8858b3`
- Runtime implementation: `049af46..2820575`
- Reviewed runtime commit: `2820575ff09eb1f9f7929a8801918d6c22d77a05`
- Consolidated review: no Critical or Important findings remain.

## Release Gate

- `npm test`: passed.
- Production build: passed with Vite 8.0.16.
- Production style test: 1 passed.
- Node tests: 540 passed.
- `npx playwright test --project=chromium`: 27 passed.
- `git diff --check`: passed.

## Product Model And Persistence

- Editor schema 5 stores exactly one `tshirt` product for every design variation.
- Products contain independent mockup color and normalized `x`, `y`, `scale`,
  and `rotation` placement.
- Duplication creates an independent product identity and placement document.
- Placement edits coalesce through variation-local history and preserve project
  metadata through undo and redo.
- Save, reload, and local-project reopen preserve exact product state.
- The deterministic acceptance flow compared the source asset SHA-256 before
  and after all Product operations and proved byte equality.
- Returning to Select proved the original variation layer JSON remained
  byte-equal to its pre-Product state.

## Catalog And Rendering

- The catalog contains exactly 11 local photographic T-shirt colors.
- Every catalog asset is a valid lossless 2048 by 2048 PNG.
- Every shirt uses an independently owned, finite, contained printable-region
  calibration.
- Product artwork reuses the shared variation renderer with transparent output,
  including image, text, trace, and Look composition.
- The acceptance flow proved the shirt center differs from its background
  corner and that the artwork canvas has both visible and transparent pixels.
- Shirt replacement retains placement; failed and stale loads are covered by
  retry, retention, authority, and disposal tests.

## Placement Evidence

- Desktop accepted state: Red, X `35`, Y `62`, scale `91%`, rotation `15deg`.
- Mobile accepted state: Royal blue, X `44`, Y `62`, scale `91%`, rotation
  `15deg`.
- Direct drag and resize, numeric controls, Center, Reset, variation switching,
  and undo/redo use the same normalized product placement.
- At 390 by 844, the preview, 240-pixel scrollable inspector, and 64-pixel
  toolbar are contained, contiguous, and produce no document overflow.

## Visual Evidence

- `test-results/phase-3a/desktop-tshirt-placement-1440x900.png`
- `test-results/phase-3a/mobile-tshirt-placement-390x844.png`

Both screenshots were inspected at original resolution. Artwork, shirts,
selection outlines, handles, labels, controls, and toolbar targets are visible
without overlap or clipping.

## Scope And Lifecycle

- The production bundle permits the intentional local Phase 3A product catalog.
- Product modules do not import legacy mockup services, production jobs,
  profiles, proofs, packages, batches, Print Lens, Printify product flows, or
  AI clients.
- The shirt loader clears `onload` and `onerror` handlers on replacement and
  disposal.
- Existing image URL registries and Look, cleanup, and trace workers retain
  paired revoke, terminate, and dispose behavior.

## Protected Preview

- Deployment: `dpl_HHWo3wbv4LF9gvkcRqYmjfydMVMX`
- URL: `https://inkmasterstudio-a56r26b3i-brincode.vercel.app`
- Target/state: preview / READY
- Framework: Vite
- Build region: `sfo1`; serverless functions deployed to `iad1`
- Runtime commit: `2820575ff09eb1f9f7929a8801918d6c22d77a05`
- Authenticated `/`: HTTP 200
- Authenticated `/privacy`: HTTP 200
- Unauthenticated `/`: HTTP 302 to Vercel SSO
- The deployment was not promoted to production.

## Deferred Scope

Phase 3B retains final high-resolution PNG rendering, download, DPI metadata,
file-size and receipt validation, and mockup export. Phase 4 retains additional
products, Printify integration, Print Lens, physical and ink-aware analysis,
garment treatments, production workflows, and AI features.
