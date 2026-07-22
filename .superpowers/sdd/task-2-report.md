# Phase 2B Task 2 Report: Variation-Scoped Look History

## Scope

Implemented variation-scoped, undoable Look recipes in the editor reducer. This task changes reducer/history behavior and focused tests only; it does not add processor, worker, or UI behavior.

## Changed Files

- `editor/history.ts`: snapshots and restores `look` with layers; adds normalized `set-look`, seeded `reroll-look-seed`, and `reset-look` commands.
- `tests/editor-history.test.ts`: covers Look normalization, stable no-ops, groups, advanced parameters, reset, reroll, layer ordering, selection preservation, variation isolation, cloning, and outgoing group closure.
- `.superpowers/sdd/progress.md`: marks Phase 2B Task 2 complete.

## RED TDD Evidence

Command:

```powershell
npx tsx --test tests/editor-history.test.ts
```

Result: exit `1`; 20 passing and 8 failing tests.

The new Look tests failed before implementation because `reduceEditorHistory` had no Look command cases. `set-look` returned `undefined`, while `reset-look` and `reroll-look-seed` also lacked their required no-op behavior.

## GREEN Evidence

After implementation, the focused history command passed with 28 passing and 0 failing tests.

Final required verification:

```powershell
npx tsx --test tests/editor-history.test.ts tests/editor-model.test.ts
npm run typecheck
git diff --check
```

Result: exit `0`; 37 passing and 0 failing tests, typecheck passed, and `git diff --check` found no whitespace errors. Git emitted only CRLF conversion warnings.

During the first final verification, TypeScript flagged four test-only discriminated-union accesses. The test fixtures were made explicitly duotone and the vintage-ink Look was narrowed before reading `seed`; the subsequent final verification above passed.

## Self-Review

- `VariationEditState` stores structured clones of both `layers` and `look`; restoration updates only those fields, retaining current layer selection when that layer remains and leaving project/variation metadata and source metadata untouched.
- `set-look` normalizes the complete recipe and compares stable serialized recipes before recording an optional history group.
- `reset-look` records Original only when the active recipe differs. `reroll-look-seed` rejects non-seeded recipes, normalizes the unsigned seed through the Task 1 helper, and creates a discrete history entry only for a changed recipe.
- Existing per-variation stacks, 100-state cap, redo invalidation, and outgoing-group closure remain centralized in `recordVariationEdit` and `closeVariationHistoryGroup`; focused Look coverage exercises the relevant boundaries.

## Concerns

None. Pixel processing and UI integration remain intentionally deferred to later tasks.
