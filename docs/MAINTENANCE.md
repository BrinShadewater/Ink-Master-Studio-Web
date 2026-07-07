# Maintenance

## Routine Checks

```shell
npm test
npm audit --audit-level=high
```

`npm test` runs `tsc --noEmit`, the production build, the compiled-style smoke test, and all TypeScript domain tests.

Also test the complete local workflow with safe sample files.

## Security Review

Before deployment or API changes, review `SECURITY.md`. Gemini requests must stay behind the server-side `/api/edit-image` route; `GEMINI_API_KEY` must never be reintroduced through Vite `define`, `VITE_` variables, or any browser-public path.

## Asset Handling

Mockup assets live in `public/mockups/`. Keep filenames stable and descriptive. When adding a garment color, test preview alignment and export output.

## Workflow QA

Check these after UI or processing changes:

- Upload validation
- Job autosave, reopen, duplicate, rename, archive, and portable `.inkmaster-job` round-trip
- Profile manager create/edit/archive/default assignment, explicit job override, JSON import/export, archived or missing source profile states, and revision update review
- Recipe recommendation and processing
- Print dimensions and preflight pass/warning/critical behavior
- Warning acknowledgement revision reset after production changes
- Inch-based placement presets and canvas synchronization
- Production package contents, naming tokens, manifest, proofs, and export history
- Profile provenance in production package manifests, summaries, and proofs without full profile snapshots
- Template save/apply/delete/import/export
- Batch pass, warning, critical, failed, cancelled, individual export, and combined-order exclusion behavior
- Desktop 1440×900 and mobile 390×844 layout, sticky actions, and console health

## Local Data

- Jobs and artwork/export blobs are stored in IndexedDB database `inkmaster-studio`, object store `jobs`.
- Profile snapshots remain in IndexedDB job records so existing jobs keep their applied production assumptions by revision.
- Production profiles are backed up and imported as JSON through localStorage key `inkmaster_production_profiles_v1`.
- Shop templates and lightweight recipe preferences are stored in versioned localStorage records; templates remain profile-independent operational defaults and should not carry profile IDs, revisions, or snapshots.
- Browser storage is workstation-local. Export `.inkmaster-job` archives before clearing site data or moving workstations.
- Portable job archives are self-contained because they include the applied job profile snapshot. Portable job and template formats include schema versions; update migration tests whenever their shapes change.

## Production Rules

- Critical preflight findings block production-package export.
- Warning findings require explicit acknowledgement for the current job revision.
- Any production change increments the revision and clears the previous acknowledgement.
- Batch exports must exclude failed, cancelled, critical, and unacknowledged-warning items.
- New jobs use the default production profile unless the operator explicitly overrides the job profile.
- Profile edits create revised source profiles; existing jobs should surface update review rather than silently adopting changed defaults.
- Profiles are local-first in beta. There is no cloud, printer, RIP, or ICC sync.
- Proof approval links, online comments, and cloud sync remain out of scope until account, storage, permission, moderation, and audit controls exist.
- AI cleanup must remain server-side and quota-aware. New AI features need rate limiting, payload limits, billing alerts, and clear operator-facing failure states.
- Screen-print separations are a future production mode. Do not mix separation controls into DTG/DTF preflight or package rules without a separate product design.

## Deployment Notes

The repo includes Docker and nginx configuration. Confirm the intended hosting path and environment-variable model before changing deployment files.
