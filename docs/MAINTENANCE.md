# Maintenance

## Routine Checks

```shell
npm test
npm run verify
npm audit --audit-level=high
```

`npm test` runs `tsc --noEmit`, the production build, the compiled-style smoke test, and all TypeScript domain tests. `npm run verify` adds the Chromium creator-flow suite.

Also test the complete local workflow with safe sample files.

## Security Review

Before deployment or API changes, review `SECURITY.md`. Gemini requests must stay behind the server-side `/api/edit-image` route; `GEMINI_API_KEY` must never be reintroduced through Vite `define`, `VITE_` variables, or any browser-public path.

## Creator Flow QA

Check these after default-mode UI, preset, or processing changes:

- Drop artwork and confirm the default UI stays on Drop -> Pick product -> Download.
- Confirm preview processing stays bounded and cancellable.
- Download a full print file and inspect PNG dimensions, file size, color type, and DPI metadata.
- Verify local progressive upscaling reports honest warnings and never claims to restore missing detail.
- Confirm Printify preset exports for t-shirt, hoodie, mug, poster, and blanket remain under 100 MB.
- Confirm background prompts, transparent output, and mockup preview do not gate the main download.
- Test desktop 1440x900 and mobile 390x844 layout, sticky actions, and console health.

## Advanced Mode QA

Check these after Advanced mode changes:

- Saved design autosave, reopen, duplicate, rename, archive, and portable `.inkmaster-job` round-trip
- Profile manager create/edit/archive/default assignment, explicit design override, JSON import/export, archived or missing source profile states, and revision update review
- Recipe recommendation and processing
- Print dimensions and preflight pass/warning/critical behavior
- Warning acknowledgement revision reset after production changes
- Inch-based placement presets and canvas synchronization
- Production package contents, naming tokens, manifest, proofs, and export history
- Profile provenance in production package manifests, summaries, and proofs without full profile snapshots
- Template save/apply/delete/import/export
- Batch pass, warning, critical, failed, cancelled, individual export, and combined-order exclusion behavior

## Local Data

- Saved designs and artwork/export blobs are stored in IndexedDB database `inkmaster-studio`, object store `jobs`.
- Profile snapshots remain in IndexedDB design records so existing Advanced-mode work keeps its applied production assumptions by revision.
- Production profiles are backed up and imported as JSON through localStorage key `inkmaster_production_profiles_v1`.
- Shop templates and lightweight recipe preferences are stored in versioned localStorage records; templates remain profile-independent operational defaults and should not carry profile IDs, revisions, or snapshots.
- Browser storage is device-local. Export `.inkmaster-job` archives before clearing site data or moving workstations.

## Production Rules

- Default mode downloads are product-preset PNG exports and should not require proof/package approval.
- Critical preflight findings block Advanced production-package export.
- Warning findings require explicit acknowledgement for the current design revision.
- Any Advanced production change increments the revision and clears the previous acknowledgement.
- Batch exports must exclude failed, cancelled, critical, and unacknowledged-warning items.
- New Advanced-mode designs use the default production profile unless the operator explicitly overrides the profile.
- Profile edits create revised source profiles; existing designs should surface update review rather than silently adopting changed defaults.
- Proof approval links, online comments, and cloud sync remain out of scope until account, storage, permission, moderation, and audit controls exist.
- AI cleanup must remain server-side and quota-aware. New AI features need rate limiting, payload limits, billing alerts, and clear user-facing failure states.
- Screen-print separations are a future production mode. Do not mix separation controls into DTG/DTF preflight or package rules without a separate product design.

## Deployment Notes

The repo includes nginx configuration for non-Vercel static hosting, but no Docker production path. Confirm the intended hosting path and environment-variable model before changing deployment files.
