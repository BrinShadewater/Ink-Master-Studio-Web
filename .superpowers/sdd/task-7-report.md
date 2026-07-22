# Phase 2A Task 7 Report: Persistence Acceptance, Mobile Verification, And Staging Deployment

## Status

Complete. Dedicated desktop and 390x844 mobile layer-management flows pass, the complete verification gate is green, both required screenshots were reviewed at original resolution, and the protected non-production Vercel preview is READY.

Acceptance test commit: `6aa315bf7b3a81657d611294031d6938c0e7b257` (`test: verify phase 2a creative layers`)

## Files

- `tests/e2e/canvas-editor.spec.ts`: added the two Phase 2A acceptance flows, IndexedDB/canvas equivalence helpers, exact mobile ordering checks, and explicit import readiness checks for the existing two-import drag test.
- `.superpowers/sdd/task-7-report.md`: replaced the prior task report with this Phase 2A gate record.
- `test-results/phase-2a/desktop-layers-1440x900.png`: regenerated acceptance artifact (gitignored).
- `test-results/phase-2a/mobile-layers-390x844.png`: regenerated acceptance artifact (gitignored).

In the initial acceptance commit, no production source, editor bundle-vocabulary assertion, or `.superpowers/sdd/progress.md` entry changed. The controller updated the ledger later during gate bookkeeping.

## Acceptance Coverage

`composes ordered image and text layers with persistence on desktop` imports a base and second raster, creates and fully styles text, reorders and hides layers, duplicates text, proves that a center-canvas drag changes selection from the exact base-layer ID to the exact topmost duplicate ID, verifies undo/redo, waits for IndexedDB, and compares complete layer order/values plus exact canvas PNG data after reload and project reopen.

`manages layers on mobile without covering the canvas` runs at 390x844 through the real modal layer drawer, adds text, proves both down/up list orders, closes the drawer, edits text through the bottom inspector, and verifies exact viewport width, no horizontal overflow, no remaining drawer, a visible canvas, and non-overlapping canvas/inspector/toolbar bounds.

## TDD Record

The first authored focused run produced one mobile pass and one desktop test-harness error because `Hide layer` was intentionally repeated per row. This was not an application behavior failure. After scoping the locator to the overlay row, both tests passed against the already-integrated Tasks 1 through 6 implementation.

A later evidence refinement exposed another test-harness API error (`allInputValues` is unavailable in the installed Playwright); replacing it with a real-input `evaluateAll` check yielded 2/2 passing flows. There is no honest pre-integration product-red capture for Task 7, because the Phase 2A implementation was present before these acceptance tests were authored. No pre-fix evidence was fabricated.

## Commands And Counts

- Focused final: `npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "composes ordered image and text layers|manages layers on mobile"` -> 2 passed, 0 failed, 10.3s.
- Initial complete `npm run verify`: typecheck/build passed; 1 style and 366 unit tests passed; E2E was 14 passed and 1 failed when an existing two-import drag test raced the second asynchronous import.
- Isolated drag rerun: 1 passed, confirming timing sensitivity. The test now waits for the second project name and exact selected layer before sampling or dragging; its `0.6`/`0.4` assertions were not weakened.
- Final `npm run verify`: typecheck passed; Vite production build passed (1,802 modules); 1 style test passed; 366 unit tests passed; 15 E2E tests passed, 0 failed; 48.2s total with E2E at 39.8s.
- `git diff --check`: passed. Git only reported the checkout's LF-to-CRLF conversion warning.
- `npx vercel deploy --yes`: passed; no `--prod` flag was used.
- `npx vercel curl / --deployment dpl_6BWCfaCR9zfZCdRpbxuGeqiU7hqt`: HTTP 200.
- `npx vercel curl /privacy --deployment dpl_6BWCfaCR9zfZCdRpbxuGeqiU7hqt`: HTTP 200.
- Unauthenticated preview request: HTTP 302 to Vercel SSO, confirming deployment protection.

## Screenshot Inspection

- `desktop-layers-1440x900.png`: confirmed as 1440x900 and inspected at original resolution. The canvas is nonblank; the base raster and high-contrast text are visible; stored layer order is base, source text, duplicate text, overlay; hidden source/overlay icons match persisted visibility; the selected duplicate row matches the text inspector; and all visible text and icon targets fit.
- `mobile-layers-390x844.png`: confirmed as 390x844 and inspected at original resolution. The canvas is nonblank with legible image/text composition; the drawer is closed; content, font, and size controls match the selected text; no horizontal overflow is present; and canvas, inspector, and bottom toolbar do not overlap.

## Deployment

- Deployment ID: `dpl_6BWCfaCR9zfZCdRpbxuGeqiU7hqt`
- Preview URL: `https://inkmasterstudio-5v9gz84ha-brincode.vercel.app`
- Inspector URL: `https://vercel.com/brincode/inkmasterstudio/6BWCfaCR9zfZCdRpbxuGeqiU7hqt`
- State: `READY`, preview target (not production), protected by Vercel SSO.

The owner must sign in through Vercel to open the private preview in a browser.

## Self-Review

- Verified every desktop acceptance clause against browser-visible behavior and persisted IndexedDB data.
- Compared the same complete persisted layer snapshot and exact canvas pixels before and after reload/reopen.
- Verified mobile ordering by actual drawer input order before, during, and after reordering.
- Kept existing behavioral assertions intact and strengthened the asynchronous import readiness condition found by the full suite.
- Inspected both final artifacts after regeneration and confirmed the requested exact filenames and dimensions.
- Confirmed no production deployment, no secrets in this report, no progress-ledger edit in the initial acceptance commit, and no unrelated worktree changes.

## Concerns

- Historical pre-integration red evidence is unavailable; only test-authoring errors occurred before the new flows first passed against the existing implementation.
- Screenshot artifacts are intentionally gitignored under `test-results/phase-2a` and are regenerated by the E2E suite.
- Vercel warned that `engines.node` uses `>=22.12.0`, so future major Node releases may be selected automatically unless the project pins a major version.

## Controller Bookkeeping

The controller recorded Task 7 implementation status, test counts, screenshot inspection, and the final protected deployment ID in `.superpowers/sdd/progress.md` before task re-review. Final completion remains subject to task and whole-branch review.

## Fix Review

### Status

DONE. Review-requested acceptance gaps were fixed in commit `47008cae1afa24fc004dc8abc255feb8fe1f431e` (`test: strengthen phase 2a persistence acceptance`). No production source or progress-ledger file changed.

### Acceptance Fixes

- Desktop persistence now reads `editor-projects` and `editor-assets` in one IndexedDB transaction. Every image layer must resolve to a project-owned asset with the expected name, `image/png` metadata/blob type, nonempty blob, SHA-256 digest, stored dimensions, and dimensions decoded from the blob itself. The complete project/asset snapshot must be identical before reload and after reopen.
- After reopen, the hidden 640x960 overlay is revealed and must change exact canvas PNG data. Hiding it again must restore the exact baseline canvas data, proving that the persisted second raster contributes to rendering and that its blob is usable.
- Mobile captures exact canvas PNG data before text exists. After editing, it verifies every visible inspector value, proves the canvas data changed from the image-only baseline, waits 500 ms past the 350 ms autosave debounce and for `Saved locally`, then reads IndexedDB and verifies exact bottom-to-top layer order, selected text identity, and all persisted `TextLayer` content/style/transform/visibility/opacity fields.
- Mobile geometry now verifies exact 390x844 client dimensions; positive width and height for canvas, inspector, and toolbar; every top/right/bottom/left edge within the viewport; and pairwise vertical separation. Existing overflow, minimum canvas height, ordering, and screenshot assertions remain unchanged.

### Verification Evidence

- Focused command: `npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "composes ordered image and text layers|manages layers on mobile"` -> 2 passed, 0 failed, 12.3s (desktop 6.0s, mobile 4.1s).
- Complete command: `npm run verify` -> typecheck passed; production build passed with 1,802 modules; 1 style test passed; 366 unit tests passed; 15 E2E tests passed, 0 failed; 50.1s total, with E2E at 41.7s.
- `git diff --check` -> passed with only the checkout's LF-to-CRLF conversion warning.
- No existing assertion was removed or weakened. The acceptance spec changed by 216 insertions and one expanded geometry return-object line.

### Screenshot Reinspection

- `test-results/phase-2a/desktop-layers-1440x900.png`: regenerated at exactly 1440x900 and inspected at original resolution after the complete run. Canvas is nonblank, selected duplicate and inspector agree, text fits, base/text composition is clear, and hidden source/overlay controls remain coherent.
- `test-results/phase-2a/mobile-layers-390x844.png`: regenerated at exactly 390x844 and inspected at original resolution after the complete run. Text is visibly rendered over the raster, inspector values shown in the capture agree with persisted values, all text fits, and canvas/inspector/toolbar remain within and non-overlapping at the requested viewport.

### Replacement Preview

Tracked test code changed after the prior preview, so a replacement protected preview was deployed even though the emitted application filenames and byte sizes remained identical (`index-ChgufQPP.css`, `index-CjjENKNR.js`, `react-vendor-BemJufFh.js`, and `rolldown-runtime-Cko4QHwX.js`).

- Command: `npx vercel deploy --yes` (never `--prod`).
- Deployment ID: `dpl_2Wa7MPhg44PdZ6Xc1hs2Zm2JJbEG`.
- Preview URL: `https://inkmasterstudio-flfyv9k7k-brincode.vercel.app`.
- Inspector URL: `https://vercel.com/brincode/inkmasterstudio/2Wa7MPhg44PdZ6Xc1hs2Zm2JJbEG`.
- State: `READY`; target `null` (preview, not production).
- `npx vercel curl / --deployment dpl_2Wa7MPhg44PdZ6Xc1hs2Zm2JJbEG` -> HTTP 200.
- `npx vercel curl /privacy --deployment dpl_2Wa7MPhg44PdZ6Xc1hs2Zm2JJbEG` -> HTTP 200.
- Unauthenticated `/` -> HTTP 302 to Vercel SSO, confirming protection. The owner must sign in through Vercel for browser access.

### Remaining Concerns

- Screenshots remain intentionally gitignored and reproducible at the required paths.
- The existing Vercel warning for open-ended `engines.node` (`>=22.12.0`) remains; it did not affect this deployment.
