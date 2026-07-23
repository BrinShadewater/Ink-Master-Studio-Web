# Phase 2B Acceptance Report

**Scope:** Task 7 Steps 1-6 only

**Base:** `a233c24a9c5cdf38b0a71bba33f19131ce0650ce`

**Browser:** Playwright Chromium (`Desktop Chrome` project), serial worker

**Excluded:** final whole-range review, review fixes, Vercel deployment, and preview smoke tests

## RED Evidence

1. Before adding the Task 7 tests:

   ```text
   npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium --grep "@phase2b-acceptance"
   Exit 1: Error: No tests found.
   ```

2. The first implementation run exercised three new flows. Mobile and worker authority passed; desktop failed because the test helper used a non-exact `Variation` label that matched four controls. The helper was corrected to target the exact variation select. No production defect was involved.

3. The first complete `npm run verify` reached the unit suite and exposed a stale static assertion in `tests/editor-geometry.test.ts`. The assertion still searched the pre-Phase-2B `EditorCanvas` source for old URL-ownership comments even though shared preview decoding moved that boundary. The test now verifies that neither `EditorCanvas` nor `VariationPreviewCanvas` revokes URLs and that `AssetUrlRegistry` remains the revocation owner. No production code changed.

4. That same failed unit run reported `tests/processing-result.test.ts` as an opaque file-level failure. It passed 3/3 in isolation and then passed in both complete GREEN runs, so no change was made for the non-reproducible process failure.

## GREEN Evidence

### Focused acceptance

```text
npm run typecheck
Pass

npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium --grep "@phase2b-acceptance"
3 passed, 0 failed

npx tsx --test tests/editor-geometry.test.ts tests/processing-result.test.ts
11 passed, 0 failed
```

### Complete local gate

Final command on the acceptance-test revision:

```text
npm run verify
```

- TypeScript typecheck: passed.
- Production build: passed in 2.11 seconds; 1,810 modules transformed.
- Worker chunk: `dist/assets/lookWorker-DsS6eTHn.js`, 13.68 kB.
- Compiled-style test: 1 passed, 0 failed.
- Unit tests: 441 passed, 0 failed, 0 skipped.
- Playwright: 25 passed, 0 failed, Chromium only, one worker, 1.4 minutes.
- Total executed tests: 467 passed.

```text
git diff --check
Pass; no whitespace errors.
```

## Desktop Acceptance

At 1440 by 900, the flow imports a PNG with transparent corners and an internal transparent cutout, adds an Impact text layer, and creates these complete schema-3 recipes:

- `Duotone Poster`: Strength 79, shadow `#172554`, highlight `#fde047`, balance -17.
- `Halftone Screen`: Strength 84, cell size 14, angle 32, foreground `#172554`, solid background `#fef3c7`.
- `Distressed Press`: Strength 92, wear 57, texture scale 8, edge breakup 43, fixed seed `0x10203045`.

The test captures exact main-canvas PNG data URLs for all three variations and proves they are distinct. It then waits for `Saved locally`, asserts the complete normalized recipes and schema version 3 in IndexedDB, reloads, explicitly reopens the project, and proves exact project JSON-byte and per-variation canvas-PNG equality. Reroll changes the Distressed seed and exact canvas PNG; Undo restores the original recipe and exact PNG.

## Mobile Acceptance

At 390 by 844, the flow applies Vintage Ink, sets Strength 73 and Grain 61, rerolls to fixed seed `0x22000002`, closes and reopens Looks, and verifies the selected thumbnail, visible control values, and complete persisted recipe. It duplicates to `Dark Alternate`, opens Compare, selects Dark, sets zoom to 125%, scrolls to the second page, captures the screenshot, and returns through `Edit Dark Alternate`.

Automated geometry checks require positive dimensions and viewport containment for the editor canvas, inspector, Compare Board, header controls, preview strip, and toolbar. They also prove no document-level horizontal overflow, no header-control intersections, non-overlapping canvas/inspector/toolbar and header/strip/toolbar regions, equal preview pages, real horizontal scroll, and an unchanged toolbar rectangle after scrolling.

## Worker Failure Acceptance

The browser test installs a `Worker` proxy with `page.addInitScript` before application load; no production test global or application hook is added. It holds one main-preview request, lets the newer request succeed, then emits the obsolete failure and proves the newer PNG remains exact with no error. It then fails the current request, verifies `Look preview failed.` and Retry, restores normal worker behavior, retries successfully, and proves the complete persisted project bytes and recipe never change.

## Screenshot Evidence

The parent independently inspected both generated PNGs with `view_image` at `detail: original`. That inspection confirmed three equal, nonblank, visibly distinct Duotone, Halftone, and Distressed desktop frames with agreeing names and controls and no overlap. It also confirmed the 390-by-844 mobile Dark state at 125% zoom, one equal page visible, contained header/board/toolbar regions, and no incoherent overlap.

### Desktop

- Path: `test-results/phase-2b/desktop-looks-compare-1440x900.png`
- Dimensions: 1440 by 900.
- Size: 203,650 bytes.
- SHA-256: `4394a5c4ab9555b9e749680bb83041d42bb7c73cafc84b5626cd528a2052468a`.
- Original-resolution inspection: all three canvases are nonblank, equal-sized, and visibly distinct. Duotone, solid Graphic Halftone, and seeded Distressed rendering agree with their variation names. The three-frame desktop grid is stable, every name and Edit command fits, the picker is closed, and no control or label overlaps another region.

### Mobile

- Path: `test-results/phase-2b/mobile-looks-compare-390x844.png`
- Dimensions: 390 by 844.
- Size: 57,359 bytes.
- SHA-256: `fdff522f7eb43b230de220a4c71f3b46ecc2c4d58a074445dde22af1d7b08ff4`.
- Original-resolution inspection: Dark and 125% visibly match the controls; the scrolled `Dark Alternate` page is nonblank and fully framed. Header controls and labels fit, the page remains above the fixed toolbar, and there is no clipping, incoherent overlap, or document overflow.

## Scope And Worktree

- Production code: unchanged.
- Bundle-boundary test: unchanged; no vocabulary exception was needed.
- Test-only compatibility update: `tests/editor-geometry.test.ts` now follows the shared preview URL-ownership boundary introduced before Task 7.
- Screenshot artifacts are intentionally committed despite the repository-wide `test-results` ignore rule.
- Post-commit `git status --short`: clean.
- Known browser scope: Chromium only; Firefox, WebKit, and physical mobile devices were not run.
- Final review and deployment remain pending by instruction.
