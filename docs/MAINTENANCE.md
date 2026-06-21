# Maintenance

## Routine Checks

```shell
npm test
npx tsc --noEmit
npm audit --audit-level=high
```

Also test the complete local workflow with safe sample files.

## Security Review

Before deployment or API changes, review `SECURITY.md`. The safest production direction is to move Gemini requests behind a backend proxy or serverless function so secrets stay server-side.

## Asset Handling

Mockup assets live in `public/mockups/`. Keep filenames stable and descriptive. When adding a garment color, test preview alignment and export output.

## Workflow QA

Check these after UI or processing changes:

- Upload validation
- Job autosave, reopen, duplicate, rename, archive, and portable `.inkmaster-job` round-trip
- Recipe recommendation and processing
- Print dimensions and preflight pass/warning/critical behavior
- Warning acknowledgement revision reset after production changes
- Inch-based placement presets and canvas synchronization
- Production package contents, naming tokens, manifest, proofs, and export history
- Template save/apply/delete/import/export
- Batch pass, warning, critical, failed, cancelled, individual export, and combined-order exclusion behavior
- Desktop 1440×900 and mobile 390×844 layout, sticky actions, and console health

## Local Data

- Jobs and artwork/export blobs are stored in IndexedDB database `inkmaster-studio`, object store `jobs`.
- Shop templates and lightweight recipe preferences are stored in versioned localStorage records.
- Browser storage is workstation-local. Export `.inkmaster-job` archives before clearing site data or moving workstations.
- Portable job and template formats include schema versions; update migration tests whenever their shapes change.

## Production Rules

- Critical preflight findings block production-package export.
- Warning findings require explicit acknowledgement for the current job revision.
- Any production change increments the revision and clears the previous acknowledgement.
- Batch exports must exclude failed, cancelled, critical, and unacknowledged-warning items.

## Deployment Notes

The repo includes Docker and nginx configuration. Confirm the intended hosting path and environment-variable model before changing deployment files.
