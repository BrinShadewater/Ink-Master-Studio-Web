# InkMaster Studio Web

InkMaster Studio turns creator artwork into print-ready PNG files for Printify and print-on-demand shops. The default product flow is intentionally short: drop an image, pick a product preset, review plain-language checks, and download a compliant file.

The app remains local-first. Uploaded artwork, saved designs, preview results, and export history stay in the browser unless the user downloads a file or chooses optional AI cleanup. Advanced mode keeps the older production suite available for shop workflows without putting that language in the default creator path.

## What This App Does

- Creates product-sized PNG exports for Printify presets such as t-shirts, hoodies, mugs, posters, and blankets.
- Runs creator-facing checks for target pixels, DPI metadata, RGB output, transparency, file-size limits, and upscaling quality.
- Builds a bounded preview first, then generates the full print file only when Download is pressed.
- Applies local progressive upscaling in a Web Worker and reports honest warnings when artwork needs heavy enlargement.
- Saves designs locally in IndexedDB for reopening, duplicating, exporting, and importing.
- Routes optional AI cleanup through server-side APIs so provider keys never enter the browser bundle.
- Keeps Advanced mode for mockups, proofs, batch prep, production profiles, handoff packages, and shop templates.

## Stack

- Vite
- React 19
- TypeScript
- Web Workers and canvas image processing
- PDF and ZIP export helpers
- Vercel serverless API routes for optional AI cleanup

## Repository Status

Creator-first Printify file prep is the primary product. Advanced production tools are preserved behind the Advanced mode toggle for users who need job libraries, customer proofs, batch exports, production profiles, and handoff packages.

Gemini requests remain behind the server-side `/api/edit-image` route. `GEMINI_API_KEY` must never be exposed through Vite `define`, `VITE_` variables, or any browser-public path.

## Local Development

Prerequisites:

- Node.js 22.12 or newer
- A Gemini API key only if testing optional AI cleanup

For local AI cleanup testing, create `.env.local`:

```text
GEMINI_API_KEY=your_key_here
```

For Vercel, add `GEMINI_API_KEY` as a server-side environment variable in Project Settings.

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

## Project Map

```text
App.tsx                       Main application and mode routing
components/SimpleCreatorFlow  Default Drop -> Pick product -> Download flow
components/WorkflowInspector  Advanced Goal -> Prepare -> Preview -> Export workflow
components/StaticPages.tsx    Privacy, terms, contact, creator guides, and noindex fallback
specs/printify.ts             Printify service and product preset data
services/upscaleEngine.ts     Local upscaling policy, metadata, and resize planning
services/imageProcessing*     Worker-backed image processing and export pipeline
services/job*                 Versioned saved-design model, IndexedDB repository, and archives
api/edit-image.ts             Server-side AI cleanup boundary
public/mockups/               Product mockup assets
public/logo/                  Brand assets
```

## Default Flow

1. Drop artwork.
2. Pick a product preset.
3. Review checks and download the print file.

The default interface avoids production jargon. It should not mention jobs, proofs, packages, handoff, recipes, or production profiles unless Advanced mode is enabled.

## Advanced Mode

Advanced mode is for users who need print-shop workflows:

- Saved jobs, portable `.inkmaster-job` archives, and export history
- Production profiles and shop templates
- Customer proof PDFs and local approval tracking
- Batch prep ZIPs and handoff packages
- Measured placement, preflight gates, mockup sets, underbase, manifests, and summaries

These tools are intentionally secondary to the creator-first Printify workflow.

## Documentation

- `SECURITY.md`
- `PERFORMANCE_SEO_REPORT.md`
- `docs/PROJECT-BRIEF.md`
- `docs/MAINTENANCE.md`
- `CONTRIBUTING.md`
- `CHANGELOG.md`

## Security Note

Read `SECURITY.md` before deploying. The browser sends fixed cleanup action IDs, not arbitrary model prompts. Keep AI provider keys server-side and keep upload limits, same-origin checks, and quota controls intact.

## Roadmap Boundaries

- AI enhancement beyond local upscaling is deferred until provider selection, retention policy, cost controls, privacy copy, and failure fallback are designed.
- Printful and Gelato preset files can share the same service-spec engine later; Printify is the current preset target.
- Cloud sync, online comments, and shareable approval links need accounts, storage, permissions, moderation, and audit controls first.
- Screen-print separations remain a distinct future production mode.
- Printer, RIP, and ICC synchronization remain outside the local-first scope.

## Review Checklist

- Run `npm test`; it includes strict TypeScript checking, production build verification, and the Node test suite.
- Run `npm run verify` before deployment; it adds the Chromium creator-flow acceptance suite, including export metadata, cancellation, timeout recovery, and Printify preset exports.
- Run `npm audit --audit-level=high`.
- Test a creator flow: drop artwork, pick a product, download a PNG, and inspect dimensions/DPI.
- Test Advanced mode after workflow changes: saved design reopen, profile review, proof export, package gating, templates, and batch exclusions.
- Check that no real client assets or secrets are committed.
