# Phase-One Canvas Editor Final-Fix Report

Date: 2026-07-20

## Status

Complete. All Important and related Minor final-review findings were implemented and verified. The execution ledger was not modified.

Code commits:

- `4360636 fix: isolate variation edits and harden local persistence`
- `2e87c3a feat: complete variation controls and save recovery`

## Files Changed

- `editor/history.ts`: replaced full-project undo snapshots with capped, independent per-variation edit-state stacks; added active-stack selectors and immutable variation deletion.
- `editor/geometry.ts`: added one viewport-normalized direct-drag transform helper.
- `editor/projectRepository.ts`: made source asset writes insert-only in memory and IndexedDB with a stable duplicate-id error.
- `editor/useEditorWorkspace.ts`: added decoded dimension/pixel validation, contained import cleanup failure handling, latest-revision retry, and the public `retrySave` command.
- `components/editor/EditorCanvas.tsx`: changed direct dragging to use viewport width for X and viewport height for Y.
- `components/editor/EditorInspector.tsx`: added accessible normalized X/Y number controls with model bounds `-2..3`.
- `components/editor/EditorTopBar.tsx`: added editable variation naming, delete, persistent mobile save status, and retry UI.
- `components/editor/EditorApp.tsx`: wired active-variation undo/redo selectors, variation management, retry, and the responsive two-row mobile top bar.
- `tests/editor-history.test.ts`: added alternating A/B history, selection isolation, project-state preservation, and variation deletion coverage.
- `tests/editor-geometry.test.ts`: added landscape and portrait normalized movement coverage.
- `tests/editor-repository.test.ts`: added memory and fake-IndexedDB asset immutability coverage.
- `tests/editor-workspace.test.ts`: added dimension, bitmap closure, retry queue, and contained cleanup rejection coverage.
- `tests/editor-shell.test.ts`: added variation draft/action and live retry status coverage.
- `tests/editor-bundle-boundary.test.ts`: added a deterministic post-build legacy-term assertion.
- `tests/e2e/canvas-editor.spec.ts`: added history isolation, direct movement, variation management, retry, and stronger final-undo persistence coverage.

## TDD Evidence

RED runs were captured before their corresponding implementations:

- History: `npx tsx --test tests/editor-history.test.ts` failed because `canRedoActiveVariation` was not exported (`0` passed, `1` file-level failure).
- Geometry/shell: focused run failed on missing `moveTransformByViewportDelta` and missing `controlBounds.position` (`4` passed, `2` failed).
- Repository/workspace: duplicate assets were still replaced and new workspace contracts were absent (`4` passed, `3` failed).
- Top bar: shell run failed on the missing variation-name draft export (`0` passed, `1` file-level failure).
- First complete E2E run exposed one strict accessible-name selector collision after adding `Variation name` (`7` passed, `1` failed); the exact `Variation` select locator fixed it, and the focused rerun passed `1/1`.

No missing historical pre-switch red run was fabricated. The existing final-review documentation note remains the only record of that earlier omission.

## Verification

- Required focused command:
  `npx tsx --test tests/editor-model.test.ts tests/editor-history.test.ts tests/editor-repository.test.ts tests/editor-workspace.test.ts tests/editor-geometry.test.ts tests/editor-shell.test.ts`
  Result: `53` passed, `0` failed.
- `npm run typecheck`: passed, TypeScript exit `0`.
- `npm test`: passed typecheck and production build; `1` production-style test and `308` TypeScript tests passed (`309` tests total), `0` failed.
- `npm run test:e2e`: `8` passed, `0` failed.
- `git diff --check`: passed with no whitespace errors; Git emitted only line-ending conversion notices.
- Production bundle scan:
  `rg -n -g 'index-*.js' "gemini|ProductionPackage|CustomerProof|Advanced mode" dist/assets/js`
  Result: no matches. The automated bundle-boundary test also passed in `npm test`.
- Production entry output: `dist/assets/js/index-C2dChhxa.js`, 52.96 kB; no AI, PDF, or batch chunk was emitted for the default route.

## Screenshot Inspection

- Desktop 1440x900: `C:\Users\Alex\Desktop\Projects\Claude\Projects\inkmasterstudio\InkMasterStudio\test-results\task-7\desktop-1440x900.png`
  Inspected: canvas is painted and unobstructed; `Print B` selection/name, duplicate, and delete actions are visible; inspector and canvas do not overlap; save status is visible.
- Mobile 390x844: `C:\Users\Alex\Desktop\Projects\Claude\Projects\inkmasterstudio\InkMasterStudio\test-results\task-7\mobile-390x844.png`
  Inspected: no horizontal overflow; two-row top bar fits; variation select/name/actions and `Saved locally` remain visible; canvas, scrollable inspector, X/Y controls, and fixed-size toolbar do not overlap.
- Mobile save failure 390x844: `C:\Users\Alex\Desktop\Projects\Claude\Projects\inkmasterstudio\InkMasterStudio\test-results\task-7\mobile-save-failure-390x844.png`
  Inspected: `Local save failed` remains visible at mobile width, the adjacent retry icon is present, the stable layout is retained, and retry subsequently persists X=`0.65`.

## Self-Review

- Undo/redo now snapshots only layers and selected-layer identity for the active variation. Selection, project name, variation names, and the variation list cannot be reverted or switched by layer undo.
- Variation A and B retain independent past/future stacks, including redo state while alternating. UI availability is derived only from the active stack.
- Deleting an active variation chooses the next sibling at the same index, or the previous sibling when deleting the last item. It removes that variation's history, cannot delete the final variation, and never mutates the prior state.
- Variation rename/delete updates `updatedAt`, autosaves, survives IndexedDB polling and reload, and remains operable on mobile.
- Retry clones and queues the latest in-memory `history.present` immediately through the existing serialized persistence controller. Failure does not discard edits.
- Superseded-import cleanup rejection is caught inside `importFile`, project listing is refreshed best-effort, and callers receive a resolved promise with the stable cleanup message surfaced in the UI.
- Source assets use `add`/presence checks, so duplicate IDs reject without replacing bytes or metadata in either storage implementation.
- The final E2E undo assertion polls IndexedDB and then reloads/reopens before checking the value.
- Legacy modules and `@google/genai` remain in source as required; only the default production bundle boundary is enforced.

## Recommendations Triaged

- Project-level `sourceAssetId` and duplicated source metadata are deferred to phase two. Existing schema-v1 projects contain only layer asset references; complete metadata requires an asynchronous asset-store join. Adding partial or placeholder metadata to the synchronous schema migrator would create misleading records and destabilize a settled schema. Current projects continue to resolve the selected image layer's immutable asset reference.
- Native browser APIs do not expose decoded dimensions through `File` before decoding without format-specific header parsers. Limits are therefore enforced immediately after `createImageBitmap`; the bitmap is closed in `finally` before any stable validation error is thrown. The pure validator caps either side at 16,384 pixels and total area at 100 megapixels.
- The production bundle boundary is now automated and deterministic because `npm test` builds before running `tests/editor-bundle-boundary.test.ts`.

## Concerns

- Source metadata normalization remains the only deliberate phase-two deferral. It should be introduced with a versioned schema migration that can hydrate from `editor-assets`, not inferred incompletely from a layer.
- The decoded pixel limit reduces post-decode risk but cannot prevent the browser decoder from allocating first; preventing that requires tested PNG/JPEG/WebP header parsing or a browser API that exposes dimensions pre-decode.
