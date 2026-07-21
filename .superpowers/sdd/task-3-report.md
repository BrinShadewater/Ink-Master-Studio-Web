# Phase 2A Task 3 Report

## Scope

Implemented project-scoped multi-asset hydration, object-URL ownership, individual asset deletion, and concurrency-safe additional image import. `EditorApp` temporarily derives the existing source-only canvas inputs from `assetsById` and `assetUrlsById`; no compositor or layer UI was added.

## Changed Files

- `editor/projectRepository.ts`: added `deleteEditorAsset(assetId)` for isolated memory and IndexedDB deletion.
- `editor/useEditorWorkspace.ts`: added project asset indexing/validation, `AssetUrlRegistry`, multi-asset hook state, guarded secondary import, registry cleanup on project transitions/unmount, and active-project deletion handling.
- `components/editor/EditorApp.tsx`: mechanically derives the legacy canvas source asset and URL from the new workspace maps.
- `tests/editor-repository.test.ts`: covers isolated asset deletion in memory and IndexedDB.
- `tests/editor-workspace.test.ts`: covers registry lifecycle, complete asset hydration, validation gates, import ordering, stale/failed import cleanup, source identity, and delete/open races.
- `.superpowers/sdd/task-3-report.md`: this report.

The progress ledger was not edited.

## Red TDD Evidence

Initial Task 3 red command:

```powershell
npx tsx --test tests/editor-workspace.test.ts tests/editor-repository.test.ts
```

Exit code: `1`

Result:

```text
SyntaxError: '../editor/projectRepository' does not provide an export named 'deleteEditorAsset'
SyntaxError: '../editor/useEditorWorkspace' does not provide an export named 'ADDITIONAL_IMAGE_IMPORT_ERROR'
tests 2
pass 0
fail 2
```

This was the expected missing-feature failure before production implementation.

Self-review exposed a second deletion race, so a regression test was added before its fix. Red command:

```powershell
npx tsx --test tests/editor-workspace.test.ts tests/editor-repository.test.ts
```

Exit code: `1`

Result:

```text
SyntaxError: '../editor/useEditorWorkspace' does not provide an export named 'shouldClearWorkspaceAfterDelete'
tests 13
pass 12
fail 1
```

This proved the still-active deleted-project clearing rule did not yet exist.

## Green Verification

Focused command after the final fix:

```powershell
npx tsx --test tests/editor-workspace.test.ts tests/editor-repository.test.ts
```

Exit code: `0`

```text
tests 38
pass 38
fail 0
cancelled 0
skipped 0
todo 0
```

Typecheck command:

```powershell
npm run typecheck
```

Exit code: `0`; `tsc --noEmit` completed without diagnostics.

Full verification command:

```powershell
npm test
```

Exit code: `0`. Typecheck and Vite production build succeeded; the production-style test passed; the TypeScript suite reported `329` passed and `0` failed.

Editor E2E command:

```powershell
npx playwright test tests/e2e/canvas-editor.spec.ts
```

Exit code: `0`; `8` passed and `0` failed.

`git diff --check` also completed with exit code `0` before the feature commit.

## Commits

- `74a8e9c793e2c0ab758ab843aedcdccf4c5c65fd` `feat: hydrate and import multiple editor assets`

## Self-Review

- Opening a project loads every project asset and rejects any image layer whose asset is absent. Stale opens cannot synchronize the registry or replace a newer workspace.
- Registry identity is asset-ID based because editor assets are immutable and duplicate IDs are rejected by the repository. Removed and disposed URLs are deleted from ownership immediately, preventing double revocation.
- Secondary import captures project identity before decode, saves the asset before adding the layer, then checks navigation generation, active project ID, mount state, and deletion leases before dispatch.
- Successful additional imports append a normalized image layer and update asset maps without changing `sourceAssetId` or `sourceMetadata`.
- Stale imports and dispatch failures call isolated asset deletion. Cleanup cannot delete the project, source asset, or sibling assets.
- A completed deletion clears URLs whenever its target is still active, even if a newer open attempt failed. A delayed deletion cannot clear a successfully opened different project.
- Switching projects synchronizes the full registry, active-project deletion synchronizes it to empty, and unmount disposes all remaining URLs.
- `EditorApp` retains the current source-only renderer by looking up the immutable source ID in the new maps. Multi-layer rendering and UI remain outside Task 3.

## Concerns

- `importLayerFile` is intentionally exposed only at the workspace API in this task; there is no layer-import UI until a later layer UI task.
- The current canvas still renders only the immutable source asset through the temporary compatibility derivation. The shared ordered-layer compositor is intentionally deferred.
- No known functional concerns remain within Task 3 scope.

## Fix Review

### Findings Addressed

1. Same-project reopen reconciliation: a newer reopen can hydrate an additional asset while its originating import is still pending. Successful stale cleanup now reconciles the latest active workspace generation, `assetsByIdRef`, React asset state, URL state, and `AssetUrlRegistry`. Reconciliation preserves source, sibling, concurrent, and currently referenced assets.
2. Orphan cleanup failure: additional-image cleanup retries isolated `deleteEditorAsset(assetId)` up to three times. Successful retry retains the existing stable import error; permanent failure reports the explicit stable cleanup error `Could not clean up the failed image import. Reopen the project and try again.`
3. Temporary renderer compatibility: `EditorCanvas` now receives only the active variation image layer whose `assetId` equals immutable `project.sourceAssetId`. Secondary/text selection remains available to the inspector but cannot mismatch the source-only canvas bitmap.

### Fix Files

- `editor/useEditorWorkspace.ts`: bounded cleanup retries, reference checks before and after async deletion, restoration if a reference appears during deletion, generation-safe workspace reconciliation, and explicit cleanup-failure reporting.
- `components/editor/EditorApp.tsx`: added `getCompatibilitySourceLayer` and separated selected inspector state from source-only canvas state.
- `tests/editor-workspace.test.ts`: added real repository/registry same-project reopen coverage, transient/permanent cleanup tests, and referenced-asset retention coverage.
- `tests/editor-shell.test.ts`: added source-layer compatibility coverage for secondary and text selection.
- `.superpowers/sdd/task-3-report.md`: appended this Fix Review.

The progress ledger was not edited.

### Fix Red Evidence

Command:

```powershell
npx tsx --test tests/editor-workspace.test.ts tests/editor-repository.test.ts tests/editor-shell.test.ts
```

Exit code: `1`

```text
SyntaxError: '../components/editor/EditorApp' does not provide an export named 'getCompatibilitySourceLayer'
SyntaxError: '../editor/useEditorWorkspace' does not provide an export named 'ADDITIONAL_IMAGE_IMPORT_CLEANUP_ERROR'
tests 14
pass 12
fail 2
cancelled 0
skipped 0
todo 0
```

The failures were expected because the reviewed compatibility and cleanup-failure contracts did not exist.

### Fix Green Verification

Covering command:

```powershell
npx tsx --test tests/editor-workspace.test.ts tests/editor-repository.test.ts tests/editor-shell.test.ts
```

Exit code: `0`

```text
tests 51
pass 51
fail 0
cancelled 0
skipped 0
todo 0
```

Typecheck command:

```powershell
npm run typecheck
```

Exit code: `0`

```text
> inkmaster-studio@0.0.0 typecheck
> tsc --noEmit
```

Editor Playwright command:

```powershell
npx playwright test tests/e2e/canvas-editor.spec.ts
```

Exit code: `0`

```text
Running 8 tests using 1 worker
8 passed (25.2s)
```

`git diff --check` completed with exit code `0` before the fix commit.

### Fix Commit

- `b8cf741675a9c0947d66ecbc0c7daf6eb3e700eb` `fix: reconcile stale editor asset imports`

### Fix Self-Review

- The same-project race test uses the real memory repository. It blocks the import after asset persistence, reopens the same project so the orphan is hydrated and receives a URL, then resumes stale cleanup and proves repository, ref-equivalent state, React-equivalent state, URL state, and registry ownership all drop only that ID.
- Reconciliation reads the latest refs after cleanup and applies synchronously only while its captured generation still owns authority and the same project remains active. It clones the latest map, so concurrent sibling imports are retained.
- `projectReferencesEditorAsset` checks immutable source identity and every image layer in every variation. Cleanup checks before deletion and after deletion; a reference appearing during the asynchronous delete causes the immutable asset to be restored instead of removed from the workspace.
- Cleanup retries only `deleteAsset(asset.id)`. It cannot cascade to the project, source, or sibling assets. Permanent cleanup failure does not falsely reconcile state or revoke a URL for an asset that may remain persisted.
- The compatibility helper searches the active variation by immutable source asset ID rather than selection. Canvas transform dispatch targets that same source layer, while the inspector continues to receive the selected image layer.

### Fix Concerns

- No known functional concerns remain from the three review findings.
- Multi-layer rendering remains intentionally deferred to Task 4; the compatibility path is explicitly source-only until then.

## Restoration Race Fix Review

### Finding Addressed

The one-time restoration path now captures the current workspace generation before restoring a referenced asset. After `saveAsset(asset)` resolves, retention requires all of the following to remain true: the hook is mounted, the captured authority generation still owns the workspace, the same project is active, no deletion lease blocks that project, and the current project still references the asset.

If any condition changed during restoration, the workflow performs one final bounded isolated cleanup and reconciles workspace state only through the current-generation helper. The state machine permits at most one restoration and never returns to restoration after final cleanup. Final cleanup or reconciliation failure reports the deterministic terminal error `Could not converge cleanup for the failed image import. Reopen the project and try again.`

### Files

- `editor/useEditorWorkspace.ts`: added restoration generation capture, post-restore lifecycle/reference validation, one final bounded cleanup, and the terminal convergence error.
- `tests/editor-workspace.test.ts`: added a real repository/registry delayed-restoration race and a bounded terminal-failure test.
- `.superpowers/sdd/task-3-report.md`: appended this evidence and self-review.

The progress ledger was not edited.

### Red Evidence

Command:

```powershell
npx tsx --test tests/editor-workspace.test.ts tests/editor-repository.test.ts
```

Exit code: `1`

```text
tests 44
pass 42
fail 2
cancelled 0
skipped 0
todo 0

a delayed restoration is cleaned again after its reference and workspace authority disappear
AssertionError: 1 !== 2

restoration convergence failure has bounded cleanup and no restore oscillation
AssertionError: 1 !== 4
```

Both failures were expected: the old path performed only the initial deletion and never revalidated or cleaned the completed restoration.

### Green Evidence

Focused command:

```powershell
npx tsx --test tests/editor-workspace.test.ts tests/editor-repository.test.ts
```

Exit code: `0`

```text
tests 44
pass 44
fail 0
cancelled 0
skipped 0
todo 0
```

Typecheck command:

```powershell
npm run typecheck
```

Exit code: `0`

```text
> inkmaster-studio@0.0.0 typecheck
> tsc --noEmit
```

Whitespace verification command:

```powershell
git diff --check
```

Exit code: `0`; no whitespace errors were reported.

### Commit

- `0316bc52b85817708892db64c264a997f23bf297` `fix: bound editor asset restoration cleanup`

### Self-Review

- The real repository regression persists the imported asset, deletes it once, introduces a current-project reference during deletion, and blocks the single restoration. Before restoration resolves, it changes authority generation, active project, deletion blocking, mount state, and the current reference.
- The invalid restoration is deleted a second time. The test proves the imported record is absent, the replacement workspace maps and URL map do not retain it, its URL is revoked exactly once, and both projects' source assets plus the sibling asset remain persisted.
- Restoration acceptance is centralized in `isRestorationCurrent`, which checks mount state, captured generation ownership, active project identity, deletion lease state, and current project references after the asynchronous save.
- Cleanup has a fixed transition bound: one initial cleanup, zero or one restoration, then zero or one final cleanup with three delete attempts. No branch can restore twice or loop.
- Initial cleanup failure retains the existing cleanup-failure message. Restore/final-cleanup failure uses the terminal convergence message, so users receive one deterministic outcome for a workflow that cannot settle.

### Concerns

- No known functional concerns remain for the restoration race.
- The terminal error intentionally stops after bounded attempts; it does not oscillate between save and delete when storage remains unavailable.
