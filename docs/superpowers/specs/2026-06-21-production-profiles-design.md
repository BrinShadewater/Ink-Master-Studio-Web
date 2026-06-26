# Ink Master Production Profiles Design

## Goal

Add portable, versioned production profiles for print shops that run multiple DTG/DTF setups. A profile represents one named production setup and supplies the defaults and constraints used by preflight, placement, and production export.

The beta supports multiple named profiles within one shop. One profile is the shop-wide default, while each job may explicitly use another profile.

## Product model

A `ProductionProfile` contains:

- Stable profile ID.
- Schema version.
- Human-readable name and optional description.
- Immutable profile revision.
- Printer name or model metadata.
- Production method: DTG or DTF.
- Configurable DPI thresholds for pass, warning, and critical findings.
- Printable areas by product type and placement location.
- Underbase, transparency, output-format, and package defaults.
- Created, updated, and archived timestamps.

Profiles are local-first. They are stored in versioned browser storage and support versioned JSON import/export for backup and transfer between workstations.

## Versioning and job snapshots

Profile edits create a new revision. They do not silently mutate the production assumptions attached to existing jobs.

Each `StudioJob` stores:

- Applied profile ID.
- Applied profile revision.
- Complete applied profile snapshot.

The snapshot makes historical jobs reproducible if the source profile is edited, archived, missing, or deleted from another workstation.

When the source profile has a newer revision, the job displays `Profile update available`. The operator may review and explicitly apply it. Applying an update replaces the job snapshot, increments the job revision, recalculates preflight and placement constraints, and clears any previous preflight acknowledgement.

## Default and assignment behavior

- Exactly one active profile is the shop-wide default whenever profiles exist.
- New jobs automatically receive the default profile and store its snapshot.
- Operators may assign another active profile to a job.
- Switching a job profile is explicit and resets preflight acknowledgement.
- Existing jobs with no profile migrate to a built-in `Standard DTG` profile snapshot that matches the current production defaults.
- Archiving a non-default profile does not affect existing jobs.
- Archiving the default profile requires selecting another active profile as its replacement.
- Archived profiles cannot be assigned to new jobs but remain visible in historical job metadata.

## Printable areas

Printable areas are defined per product type and placement location. The beta does not add per-garment-size calibration.

Each area includes:

- Maximum printable width and height in inches.
- Calibrated preview rectangle as x, y, width, and height percentages.
- Supported placement location.

The initial locations remain:

- Front.
- Back.
- Left chest.
- Sleeve.

The existing placement presets continue to provide starting measurements. Profile printable areas become the authority for placement validation and inch-to-preview conversion.

If a job placement no longer fits after an explicit profile update, the job receives a critical placement finding and production-package export remains blocked until corrected.

## Preflight thresholds

Each profile supplies:

- Target DPI.
- Warning DPI threshold.
- Critical DPI threshold.
- Significant-upscaling threshold.
- Extreme-upscaling threshold.
- Method defaults affecting transparency and underbase expectations.

Threshold validation requires:

- All numeric thresholds are positive.
- Critical DPI is lower than warning DPI.
- Warning DPI is no higher than target DPI.
- Significant upscaling is lower than extreme upscaling.

Preflight remains deterministic. AI output does not determine pass, warning, or critical status.

## Output defaults

Profiles may define:

- Default output format.
- Whether transparency is preserved.
- Whether an underbase is included.
- Default production-package inclusions.
- Selected default mockup indices.
- Filename pattern.

Applying a profile initializes these production settings. Operators may override them within a job; overrides remain job-specific and do not modify the source profile.

## User interface

### Job header

The studio top bar gains a `Production profile` control showing:

- Applied profile name.
- Applied revision.
- Update-available state when relevant.
- Missing or archived source-profile state without treating the job snapshot as invalid.

Operators can switch profiles or review a newer revision from this control.

### Profile manager

The profile manager supports:

- Create.
- Duplicate.
- Rename and edit.
- Set as default.
- Archive.
- Import JSON.
- Export one profile or all profiles as JSON.
- Show archived profiles.

### Profile editor

The editor is divided into:

1. Printer and method.
2. DPI and upscaling thresholds.
3. Printable areas by product and placement.
4. Underbase and transparency defaults.
5. Output, package, and filename defaults.

The editor validates fields inline and prevents saving invalid threshold or printable-area combinations.

## Import and conflict handling

The portable profile file uses:

- Format identifier: `inkmaster-production-profiles`.
- Schema version.
- Export timestamp.
- One or more complete profiles and their current revisions.

Import validates the whole file before writing anything.

For each incoming profile:

- A new ID is accepted directly.
- A matching ID and identical revision is skipped.
- A matching ID with a newer revision may update the local profile after confirmation.
- A matching ID with divergent content at the same revision is imported as a copy with a new ID and conflict suffix.
- Invalid profiles are rejected with field-level explanations.

An import must never partially overwrite local profiles when validation fails.

## Storage and boundaries

Profile records use a dedicated versioned localStorage repository because they contain lightweight configuration rather than artwork blobs.

Profile snapshots stored inside jobs remain in IndexedDB with the rest of the job record. Portable `.inkmaster-job` archives therefore remain self-contained and reproducible without requiring a separate profile export.

No accounts, cloud sync, printer connectivity, automatic ICC/color management, supplier catalogs, per-size printable areas, or online profile sharing are included in this beta.

## Error handling

- Storage failures leave the current editor state intact and show a local-save error.
- Invalid imports report every invalid profile and field.
- Missing profile references fall back to the job snapshot, never global defaults.
- A missing default profile is repaired deterministically by selecting the most recently updated active profile; if none exist, the built-in `Standard DTG` profile is created.
- Profile updates that invalidate placement or preflight are applied only after explicit operator confirmation.

## Testing

Automated tests cover:

- Built-in profile defaults.
- Profile creation, duplication, revisions, archive, and default replacement.
- Threshold and printable-area validation.
- Versioned localStorage migration.
- JSON export/import round trips and conflict behavior.
- Job migration to the built-in profile snapshot.
- New-job default assignment.
- Explicit job profile switching and acknowledgement reset.
- Historical job behavior after profile archive or removal.
- Update-available detection and explicit revision application.
- Profile-driven preflight severity.
- Profile-driven placement validation and preview conversion.
- Portable `.inkmaster-job` preservation of the applied snapshot.

Rendered QA covers desktop and mobile:

- Create and edit a production profile.
- Set it as default.
- Create a job and confirm automatic assignment.
- Switch profiles and verify recalculated preflight.
- Edit a profile, review the update from a job, and apply it explicitly.
- Archive a profile and confirm historical jobs remain usable.
- Export profiles, clear profile storage, import them, and confirm equivalent behavior.

## Success criteria

- Shops can model several real production setups without rebuilding settings for every job.
- Existing jobs never change silently when a profile is edited.
- A job remains reproducible when its source profile is unavailable.
- Preflight, placement, and output defaults derive from the applied profile snapshot.
- Profiles can move safely between workstations through a versioned JSON file.
