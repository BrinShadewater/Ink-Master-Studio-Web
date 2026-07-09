# Ink Master Studio Web 🖨️

Local-first DTG/DTF production workbench for print-shop operators.

Ink Master Studio helps turn source artwork into usable previews and production assets: upload artwork, adjust mockup controls, generate exports, track history, and prepare client-facing visuals without leaving the browser. The goal is a practical workbench, not a shiny demo: fewer handoffs, fewer mystery steps, faster proofs.

## 👕 What This App Does

- Saves named production jobs, artwork, settings, placement, notes, versions, and exports in IndexedDB.
- Runs deterministic preflight against actual print dimensions, effective DPI, transparency, backgrounds, upscaling, detail, and output format.
- Stores garment placement in inches with full-front, chest, back, sleeve, youth, and oversized presets.
- Generates portable `.inkmaster-job` backups, production ZIP packages, print/email proofs, PDFs, mockups, and manifests.
- Supports multiple named production profiles for local DTG/DTF defaults, with a default profile for new jobs and explicit per-job override.
- Supports guided batch processing with per-file recipes, preflight findings, warning acknowledgement, cancellation, and combined-order export.
- Saves portable shop templates separately from artwork-treatment recipes.
- Uses optional AI-assisted cleanup through a server-side route when configured; core preflight and export decisions remain deterministic.

## 🧰 Stack

- Vite
- React 19
- TypeScript
- Gemini API integration
- Image processing utilities
- PDF/ZIP export helpers

## 🚦 Repository Status

Production-oriented local-first tool. The completed beta focus is jobs → preflight → measured placement → proof/package handoff → batch/templates. Gemini requests remain behind the server-side `/api/edit-image` route; `GEMINI_API_KEY` must never be exposed through a browser-public environment variable.

## ⚙️ Local Development

Prerequisites:

- Node.js
- A Gemini API key

For local development, create `.env.local`:

```text
GEMINI_API_KEY=your_key_here
```

For Vercel, add `GEMINI_API_KEY` as a server-side environment variable in Project Settings. Do not expose it as a `VITE_` or other public browser variable.

Install and run:

```shell
npm install
npm run dev
```

Build:

```shell
npm run build
```

Preview:

```shell
npm run preview
```

## 🗺️ Project Map

```text
App.tsx                 Main application and current-job orchestration
components/             Guided workflow, job library, preflight, placement, batch, and export UI
services/job*           Versioned job model, IndexedDB repository, and portable archives
services/preflight.ts   Deterministic production checks and export gating
services/placement.ts   Inch-based presets and calibrated preview conversion
services/*Package.ts    Production package, proof, naming, and template services
public/mockups/         Apparel mockup assets
public/logo/            Brand assets
PERFORMANCE_SEO_REPORT.md
SECURITY.md
nginx.conf
```

## 🔦 Key Surfaces

- `components/Dropzone.tsx` handles artwork intake.
- `components/WorkflowInspector.tsx` owns the Goal → Prepare → Preview → Export workflow.
- `components/JobLibrary.tsx` handles reopen, duplicate, archive, transfer, and import.
- `components/PreflightPanel.tsx` and `components/PlacementPanel.tsx` expose production specifications.
- `components/Preview.tsx` controls mockup review.
- `components/BatchProcessor.tsx` applies shared recipe and preflight rules to many files.
- `api/edit-image.ts`, `services/geminiService.ts`, and `services/imageProcessing.ts` are security- and cost-sensitive.
- `nginx.conf` mirrors the production security headers for non-Vercel static hosting. Keep it aligned with `vercel.json`.

## 🏷️ Production Profiles

Production profiles are local-first shop defaults for printer name, DTG/DTF method, thresholds, printable areas, package options, and proof defaults. New jobs use the selected default profile; operators can override the profile on a job before export.

Each job stores an immutable profile snapshot and revision in its IndexedDB job record, so later profile edits do not silently change existing work. When the source profile changes, review the revision update before applying it to the job. Portable `.inkmaster-job` archives remain self-contained because they include the job snapshot.

Profiles can be backed up and imported as JSON from the localStorage key `inkmaster_production_profiles_v1`. Production packages and customer proofs include profile provenance — name, revision, printer when set, and method — while shop templates stay profile-independent operational defaults.

Beta limitation: profiles do not sync to cloud accounts, printers, RIP queues, ICC profiles, or other workstations.

## 📚 Documentation

- `SECURITY.md`
- `PERFORMANCE_SEO_REPORT.md`
- `docs/PROJECT-BRIEF.md`
- `docs/MAINTENANCE.md`
- `README.md`
- `CONTRIBUTING.md`
- `CHANGELOG.md`

## 🔐 Security Note

Read `SECURITY.md` before deploying. Gemini is already routed through the server-side `/api/edit-image` function; keep that boundary intact and do not add browser-public key paths. The browser sends fixed cleanup action IDs, not arbitrary Gemini prompts.

## 🧭 Roadmap Boundaries

Current product scope is local-first DTG/DTF production. The following are intentionally deferred:

- Cloud sync, online comments, and shareable approval links. Proof approvals are local-only until accounts, storage, permissions, moderation, and audit controls exist.
- Expanded AI cleanup and edge repair. These require server-side configuration, rate limiting, quotas, billing alerts, and operator-visible failure states.
- Screen-print separations. Treat this as a distinct future production mode rather than mixing separation controls into DTG/DTF export flows.
- Printer/RIP/ICC synchronization. Profiles remain local shop defaults and do not connect to printers, RIP queues, or color-management systems.

## 🧵 Working Style

Keep the tool practical and production-minded. Every control should help someone move from artwork to proof faster, with fewer hidden steps.

## ✅ Review Checklist

- Run `npm test`; it includes strict TypeScript checking, production build verification, and the Node test suite.
- Run `npm run verify` before deployment; it adds the Chromium creator-flow acceptance suite, including export metadata, cancellation, and worker timeout recovery.
- Run `npm audit --audit-level=high`.
- Test uploads with safe sample files.
- Create, reload, duplicate, archive, export, and import a local job.
- Review profile manager create/edit/archive/default flows, profile JSON import/export, missing or archived source profile states, and revision update review.
- Review measured placement, preflight gating, production packages, proofs, templates, and batch exclusions.
- Confirm production package manifests, summaries, and proofs show profile provenance without embedding full profile snapshots.
- Check that no real client assets or secrets are committed.
- Re-read `SECURITY.md` for any API, upload, or deployment change.
