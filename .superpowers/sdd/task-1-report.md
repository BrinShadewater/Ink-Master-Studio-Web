# Task 1 Report: Export Model Contracts

## Implementation

Implemented the isolated pure TypeScript export model in `editor/tshirtExportModel.ts`.

- Added the three immutable 5:6 export presets with the exact dimensions, DPI, pixels-per-meter, physical dimensions, and classifications from the brief.
- Added preset lookup with the required `Unknown T-shirt export preset.` error.
- Added alpha statistics and render metadata receipt contracts for later tasks.
- Added normalized placement geometry resolution using the preset's smaller dimension as the base square side.
- Added semantic export fingerprints using stable JSON serialization and the existing unsigned FNV-1a eight-character hex digest convention.
- Fingerprints include preset, normalized placement, variation ID/layers/look, and sorted referenced asset metadata. They reject missing referenced assets with `Export artwork is incomplete.` and exclude shirt color, shirt image, selected layer, mockup calibration/slug, project name, and variation name.
- Added lowercase ASCII filename sanitization, per-name-part limits, complete basename limiting, fallbacks, and preset suffix preservation.

## TDD Evidence

### RED

Command:

```powershell
npx tsx --test tests/editor-tshirt-export-model.test.ts
```

Result: failed as expected because `editor/tshirtExportModel.ts` did not exist (`ERR_MODULE_NOT_FOUND`).

### GREEN

Command:

```powershell
npx tsx --test tests/editor-tshirt-export-model.test.ts
```

Result: 7 tests passed, 0 failed.

Coverage includes exact preset declarations and freezing, geometry normalization, preset lookup errors, shirt-color invariance, preset/placement/layer/look/asset-identity fingerprint mutations, missing assets, and bounded filenames.

## Verification

```powershell
npm run typecheck
```

Result: passed (`tsc --noEmit`).

```powershell
git diff --check
```

Result: passed with no whitespace errors.

## Files Changed

- `editor/tshirtExportModel.ts`
- `tests/editor-tshirt-export-model.test.ts`
- `.superpowers/sdd/task-1-report.md`

## Self-Review

- Preset dimensions preserve the required 5:6 ratio and exact production/proof values.
- Every preset object and the preset list are frozen during module construction.
- Geometry uses `normalizeProductPlacement`, so out-of-range values are clamped by the shared product contract.
- Asset references are deduplicated and sorted before metadata serialization, making equivalent reference order stable.
- The fingerprint has no mockup slug parameter and does not read mockup or selected-layer state.
- Filename truncation happens before appending the fixed preset suffix, so the suffix remains complete.

## Concerns

None identified for Task 1. PNG rendering, worker integration, and export UI were intentionally left untouched for later tasks.
