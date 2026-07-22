# Task 1 Report: Schema 3 And Normalized Look Model

## Implementation

- Added the dependency-free `editor/lookModel.ts` discriminated `VariationLook` union, defaults, normalization, stable serialization, seeded-Look helpers, and seed generation fallback.
- Upgraded `EditorProject` to schema 3 and added `DesignVariation.look`, initialized as Original for new projects and normalized during all project migrations.
- Preserved schema-1 asset-assisted migration, schema-2 source identity, exact text persistence, layer IDs, selected-layer IDs, and repository save normalization.

## Files

- Added `editor/lookModel.ts`
- Added `tests/editor-look-model.test.ts`
- Modified `editor/model.ts`
- Modified `tests/editor-model.test.ts`
- Modified `tests/editor-repository.test.ts`
- Modified `tests/editor-shell.test.ts`
- Modified `.superpowers/sdd/progress.md`

## TDD Evidence

RED command: `npx tsx --test tests/editor-look-model.test.ts`

RED result: exit 1 with `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../editor/lookModel'`; 0 passing and 1 failing file.

Schema RED command: `npx tsx --test tests/editor-model.test.ts tests/editor-repository.test.ts`

Schema RED result: exit 1 with 14 passing and 8 failing tests. Failures showed schema version `2 !== 3`, missing variation Look state, rejected schema 3, and save-time schema validation still accepting version 2.

GREEN commands:

- `npx tsx --test tests/editor-look-model.test.ts`: 6 passing, 0 failing.
- `npx tsx --test tests/editor-model.test.ts tests/editor-repository.test.ts`: 22 passing, 0 failing.
- `npx tsx --test tests/editor-look-model.test.ts tests/editor-model.test.ts tests/editor-repository.test.ts`: 28 passing, 0 failing.

## Verification

- `npm run typecheck`: passed, exit 0.
- `git diff --check`: passed, exit 0 with no whitespace errors. Git emitted only existing CRLF conversion warnings.

## Self-Review

- `editor/lookModel.ts` does not import `editor/model.ts`, so no model cycle is introduced.
- Numeric values round before clamping; invalid numeric values use documented defaults; colors normalize to lowercase six-digit hex; seeded values use unsigned 32-bit normalization.
- Schema 1, 2, and 3 migration routes retain required source and layer identity while adding or normalizing Look recipes.
- Focused tests cover every Look ID, documented numeric boundaries, malformed schema-3 Look normalization, duplication isolation, and an IndexedDB schema-2 reopen/save/reopen migration.

## Concerns

None.

## Fix Review: Legacy Look Migration

Resolved the review finding that schema-1 and schema-2 records could preserve injected non-Original Look recipes. Legacy migrations now explicitly produce Original for every retained variation; only schema 3 normalizes `value.look`.

### Changed Files

- Modified `editor/model.ts`
- Modified `tests/editor-model.test.ts`
- Modified `tests/editor-repository.test.ts`
- Modified `.superpowers/sdd/task-1-report.md`

### TDD Evidence

RED command: `npx tsx --test tests/editor-model.test.ts tests/editor-repository.test.ts`

RED result: exit 1 with 21 passing and 3 failing tests. The failures showed injected `high-contrast`, `duotone`, and stored `vintage-ink` recipes surviving schema-1/schema-2 migration instead of becoming Original.

GREEN command: `npx tsx --test tests/editor-model.test.ts tests/editor-repository.test.ts`

GREEN result: exit 0 with 24 passing and 0 failing tests.

Required verification command: `npx tsx --test tests/editor-look-model.test.ts tests/editor-model.test.ts tests/editor-repository.test.ts`

Required verification result: exit 0 with 30 passing and 0 failing tests.

`npm run typecheck`: exit 0.

`git diff --check`: exit 0 with no whitespace errors; Git emitted only CRLF conversion warnings.

### Self-Review

- Schema 1 continues to use image-only layer normalization and derives its source asset from the retained image layer.
- Schema 2 retains source metadata, source asset ID, layer IDs, text content, and selection while ignoring any injected Look field.
- Schema 3 remains the sole path that calls `normalizeVariationLook` for persisted recipes.
- The fake IndexedDB reopen/save/reopen regression verifies the stored schema-2 project persists as schema 3 with Original.
