# Task 1 Implementation Report

## Scope

Implemented Phase 2A Task 1: schema-version-2 editor projects, text-layer model foundations, pure legacy migration, project-scoped asset lookup, and repository hydration.

## Changed Files

- `editor/model.ts`
  - Set `EDITOR_PROJECT_SCHEMA_VERSION` to `2`.
  - Added `SourceMetadata`, `TextLayer`, `DesignLayer`, `isImageLayer`, `isTextLayer`, and `createTextLayer`.
  - Added immutable source asset fields to new projects.
  - Changed `migrateEditorProject` to accept assets, migrate schema 1 records, normalize schema 2 image/text layers, preserve image IDs and asset IDs, and reject missing source assets with `Project source image not found.`.
- `editor/projectRepository.ts`
  - Added `getEditorAssetsForProject(projectId)` using the IndexedDB `projectId` index or cloned memory records.
  - Hydrates assets before migrating projects in `getEditorProject` and `listEditorProjects`.
  - Restricts project saves to schema 2 and does not write asset blobs.
- `tests/editor-model.test.ts`
  - Added schema 2 source metadata, text normalization, and asset-assisted schema 1 migration coverage.
- `tests/editor-repository.test.ts`
  - Added direct IndexedDB legacy-record hydration and missing-source rejection coverage.

## TDD Evidence

### Red: model

Command:

```powershell
npx tsx --test tests/editor-model.test.ts
```

Observed output before implementation:

```text
tests 6
pass 3
fail 3
1 !== 2
Error: Unsupported editor project schema.
1 !== 2
```

The failures showed that new projects were still schema 1, schema 2 migration was unsupported, and legacy records were not upgraded.

### Red: repository

Command:

```powershell
npx tsx --test tests/editor-repository.test.ts
```

Observed output before repository hydration implementation:

```text
tests 8
pass 3
fail 5
TypeError: Cannot read properties of undefined (reading 'find')
```

The failures showed repository reads were not supplying stored project assets to migration and no project-scoped asset lookup existed.

### Green: focused suite

Command:

```powershell
npx tsx --test tests/editor-model.test.ts tests/editor-repository.test.ts
```

Observed output:

```text
tests 14
pass 14
fail 0
```

## Commits

- Implementation: `2ecfb4137a1ea9924dfbb52dd99c2ff73c0c04be` - `feat: migrate editor projects to layered schema`

## Self-Review

- Confirmed v1 migration derives source metadata from the stored matching asset and preserves migrated image layer and asset identifiers.
- Confirmed schema 2 records require a matching source asset and normalize retained variations, selected-layer fallback, and text/image values.
- Confirmed IndexedDB lookup uses the existing `projectId` index and memory lookup returns cloned records.
- Confirmed project save only stores cloned project JSON and does not write asset blobs.
- Ran `git diff --check`; no whitespace errors were reported.

## Concerns

- `npm run typecheck` currently fails in the intentionally untouched `editor/history.ts` because Task 2 must update its image-only assumptions for `DesignLayer`. Reported errors are at lines 51, 95, 107, and 170. No later-task file was edited for this Task 1 implementation.
