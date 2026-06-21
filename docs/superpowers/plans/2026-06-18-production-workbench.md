# Ink Master Production Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add durable local jobs, production preflight, measured placement, production/proof packages, guided batch processing, and operator templates to Guided Studio.

**Architecture:** Add pure domain modules for job migration/serialization, preflight, placement, filenames, templates, and export manifests. Keep browser persistence behind an IndexedDB repository and keep UI orchestration in `App.tsx`; focused panels own job-library, print-specification, and template interactions.

**Tech Stack:** React 19, TypeScript, IndexedDB, localStorage, JSZip, jsPDF, existing canvas image services, Node test runner with `tsx`.

---

### Task 1: Versioned production domain

**Files:**
- Modify: `types.ts`
- Modify: `constants.ts`
- Create: `services/placement.ts`
- Create: `tests/placement.test.ts`

- [ ] Write failing tests for placement presets, variant keys, inch validation, and conversion to calibrated mockup percentages.
- [ ] Run `npx tsx --test tests/placement.test.ts` and confirm missing exports fail.
- [ ] Add `StudioJob`, `JobMetadata`, `PrintSpecification`, `PlacementPreset`, `PlacementMeasurement`, `PreflightFinding`, `ShopTemplate`, `ProofBranding`, and `ProductionPackageOptions`.
- [ ] Implement DTG/DTF defaults, placement presets, validation, variant keys, and conversion helpers.
- [ ] Run the placement tests and `npx tsc --noEmit`.

### Task 2: Local-first jobs and portable files

**Files:**
- Create: `services/jobModel.ts`
- Create: `services/jobRepository.ts`
- Create: `services/portableJob.ts`
- Create: `components/JobLibrary.tsx`
- Create: `tests/jobs.test.ts`
- Modify: `App.tsx`
- Modify: `components/StudioTopBar.tsx`

- [ ] Write failing tests for new-job defaults, schema migration, duplication, portable ZIP round-trip, and malformed imports.
- [ ] Implement pure job creation/migration helpers and `.inkmaster-job` ZIP serialization.
- [ ] Implement IndexedDB CRUD, archive, and blob-safe storage with an in-memory fallback when IndexedDB is unavailable.
- [ ] Add autosave, named job metadata, job library, reopen, duplicate, rename, archive, import, and export flows.
- [ ] Verify upload → autosave → reload/reopen preserves artwork and settings.

### Task 3: Production preflight

**Files:**
- Create: `services/preflight.ts`
- Create: `components/PreflightPanel.tsx`
- Create: `tests/preflight.test.ts`
- Modify: `components/WorkflowInspector.tsx`
- Modify: `App.tsx`

- [ ] Write failing tests for effective DPI, pass/warning/critical severity, background risk, transparency, extreme upscaling, detail risk, and format suitability.
- [ ] Implement deterministic preflight and export-gating helpers.
- [ ] Add editable print width/height, target DPI, and production-method controls.
- [ ] Show corrective actions and require acknowledgement for warnings while blocking critical exports.
- [ ] Persist findings and acknowledgement revision in the current job.

### Task 4: Measured placement

**Files:**
- Create: `components/PlacementPanel.tsx`
- Modify: `components/Preview.tsx`
- Modify: `services/imageProcessing.ts`
- Modify: `App.tsx`

- [ ] Add tests for placement variant persistence and conversion before UI implementation.
- [ ] Replace internal percentage placement state with controlled inch-based placement.
- [ ] Add presets, location, garment size, width/height, offsets, printable-area guides, center lines, and safe zones.
- [ ] Preserve placement separately by product/location/size variant and use calibrated percentages for preview/mockup output.
- [ ] Confirm drag updates measured placement and measured inputs update the canvas.

### Task 5: Production package and customer proofs

**Files:**
- Create: `services/naming.ts`
- Create: `services/productionPackage.ts`
- Create: `services/proofBuilder.ts`
- Create: `tests/exports.test.ts`
- Modify: `components/WorkflowInspector.tsx`
- Modify: `App.tsx`

- [ ] Write failing tests for tokenized filenames, sanitized output, manifest contents, ZIP contents, and proof metadata.
- [ ] Implement filename templates using job, customer, garment, placement, and version tokens.
- [ ] Generate production ZIPs containing print master, PDF, selected mockups, optional underbase, summary, and manifest.
- [ ] Generate print-ready and email-friendly customer proof PDFs with approval fields.
- [ ] Record completed exports in the job and IndexedDB.

### Task 6: Operator templates

**Files:**
- Create: `services/templateStorage.ts`
- Create: `components/TemplatesPopover.tsx`
- Create: `tests/templates.test.ts`
- Modify: `components/StudioTopBar.tsx`
- Modify: `App.tsx`

- [ ] Write failing tests for template migration, save/update/delete, JSON import/export, and application.
- [ ] Implement versioned localStorage persistence and portable template JSON.
- [ ] Add save/apply/rename/delete/import/export UI.
- [ ] Applying a template updates recipe, product, print specification, placement, naming, package options, and proof branding without replacing artwork or customer notes.

### Task 7: Guided batch processing

**Files:**
- Create: `services/batch.ts`
- Create: `tests/batch.test.ts`
- Rewrite: `components/BatchProcessor.tsx`

- [ ] Write failing tests for recipe application, export eligibility, warning acknowledgement, critical blocking, cancellation, and combined-order manifest generation.
- [ ] Analyze every file, recommend/apply recipes, calculate preflight using shared services, and show per-file findings.
- [ ] Support per-file exceptions, retry/cancel, package-per-design, and combined order ZIP.
- [ ] Never include failed, cancelled, critical, or unacknowledged-warning items in export.

### Task 8: Integration, responsive QA, and release

**Files:**
- Modify: `README.md`
- Modify: `docs/MAINTENANCE.md`
- Modify: relevant tests and UI files only when QA identifies a defect

- [ ] Run `npm test`, `npx tsc --noEmit`, `npm audit`, and `git diff --check`.
- [ ] Test desktop 1440×900 and mobile 390×844: create job → upload → apply recommendation → set print dimensions → resolve/acknowledge preflight → place artwork → save template → export proof/package → reopen job.
- [ ] Test portable job export/import and guided batch with pass, warning, critical, failed, and cancelled items.
- [ ] Confirm no page overflow, sticky actions, console health, and server-side-only Gemini references.
- [ ] Review the diff for scoped implementation, remove temporary artifacts, commit, merge safely, push, and verify Vercel `READY`.
