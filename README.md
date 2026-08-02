# InkMaster Studio Web

![Licence](https://img.shields.io/badge/licence-all%20rights%20reserved-lightgrey?style=flat-square) ![Live](https://img.shields.io/badge/live-inkmasterstudio.com-brightgreen?style=flat-square) ![Shadewater Labs](https://img.shields.io/badge/Shadewater%20Labs-%E2%9A%97%EF%B8%8F-6b4fa2?style=flat-square)

InkMaster Studio turns creator artwork into print-ready PNG files for Printify
and print-on-demand shops. Drop an image, edit it on a canvas, place it on a
product, and download a compliant file.

The app is local-first. Uploaded artwork, saved projects, and preview results
stay in the browser unless the user downloads a file or chooses optional AI
cleanup.

## What This App Does

- Canvas editor with image, text, and vector-trace layers, undo/redo history,
  and named variations of a design.
- Background removal, resolution enhancement, crop, and transform, each run in a
  dedicated Web Worker so the UI stays responsive.
- Looks: deterministic preset treatments (Clean Photo, High Contrast,
  Monochrome, Duotone, Posterized, Graphic Halftone, Vintage Ink, Distressed
  Print) with a before/after compare board.
- T-shirt product placement against photographic mockups, with a printable
  region guide and drag/resize/rotate placement.
- Print-ready PNG export at Printify Full Front (4500x5400, 300 DPI), Standard
  Tee (3000x3600, 300 DPI), and Draft Proof (1500x1800, 150 DPI), plus SVG
  export for traced and text artwork.
- Readiness checks for target pixels, DPI metadata, transparency, and upscaling
  quality before download.
- Local project persistence in IndexedDB for reopening and duplicating designs.
- Optional AI cleanup routed through a server-side API so provider keys never
  enter the browser bundle.

## Stack

- Vite 8, React 19, TypeScript 5.8
- Tailwind CSS 3.4
- Web Workers and canvas image processing
- Vercel serverless API routes for optional AI cleanup
- Playwright for browser acceptance tests

## Local Development

Prerequisites:

- Node.js 22.12 or newer (CI tests on 22 and 24)
- A Gemini API key only if testing optional AI cleanup

For local AI cleanup testing, create `.env.local`:

```text
GEMINI_API_KEY=your_key_here
```

For Vercel, add `GEMINI_API_KEY` as a server-side environment variable in
Project Settings.

Install and run:

```shell
npm ci
npm run dev
```

Use `npm ci`, not `npm install`. npm prunes optional dependencies to the host
platform when it writes a lockfile, so running `npm install` on Windows rewrites
`package-lock.json` into a form that fails `npm ci` on the Linux CI runner. Only
run `npm install` when deliberately changing a dependency, and review the
lockfile diff before committing it.

Build and preview:

```shell
npm run build
npm run preview
```

## Project Map

```text
index.tsx                      Entry point
App.tsx                        Routes / to the landing page and /editor to the editor
components/LandingPage.tsx     Marketing landing page
components/StaticPages.tsx     Privacy, terms, contact, guides, noindex fallback
components/editor/             The editor: canvas, toolbar, layer panel, inspectors
editor/                        Editor logic: geometry, history, model, coordinators
editor/*Worker.ts              Look, trace, background-removal, and export workers
services/                      Image processing, export, and persistence helpers
workers/imageProcessing.worker Worker-backed image pipeline
specs/printify.ts              Printify service and product preset data
api/edit-image.ts              Server-side AI cleanup boundary
docs/archive/                  Superseded components, excluded from the build
public/mockups/                Product mockup assets
public/logo/                   Brand assets
```

## Repository Status

The shipped application is the canvas-first editor. `App.tsx` routes to exactly
two surfaces: the landing page, and the editor at `/editor`.

An earlier production suite (saved job libraries, customer proof PDFs, batch
prep, production profiles, handoff packages, shop templates) still exists in
`components/` and `services/` but **is not reachable from the application
entry point** and is not included in the production bundle. `npm test` runs a
reachability check that lists every such module against a committed allowlist,
so this stays visible rather than drifting silently.

Four fully superseded components were moved to `docs/archive/`, which is excluded
from TypeScript compilation. They are kept for reference, not for use; see
`docs/archive/README.md`.

The editor has a Basic/Advanced mode toggle in its top bar. Advanced mode there
means denser inspector controls inside the canvas editor. It is a different
thing from the older production suite described above, and the two should not be
confused.

Gemini requests remain behind the server-side `/api/edit-image` route.
`GEMINI_API_KEY` must never be exposed through Vite `define`, `VITE_`
variables, or any browser-public path. `tests/ai-cleanup.test.ts` enforces this
by scanning client source and failing the build if it appears.

## Testing

```shell
npm test          # typecheck, production build, 593 unit tests, reachability checks
npm run test:e2e  # Playwright browser acceptance suite
npm run verify    # both of the above
```

CI runs `npm test` on Node 22 and 24 for every pull request and every push to
`main`.

The Playwright suite is not yet in CI. It needs a browser install step and takes
roughly 18 minutes, and some selectors are currently out of date with the UI, so
it is run manually for now.

## Documentation

- `SECURITY.md` — read before touching API keys, uploads, or deployment config
- `CONTRIBUTING.md`
- `CHANGELOG.md`
- `docs/PROJECT-BRIEF.md` — product purpose and audience
- `docs/MAINTENANCE.md` — routine checks
- `docs/superpowers/` — design specs, implementation plans, and agent handoff notes

`PERFORMANCE_SEO_REPORT.md` is dated February 2026 and describes a bundle
layout that the canvas-first rewrite replaced. Treat its chunk analysis as
historical.

## Security Note

Read `SECURITY.md` before deploying. The browser sends fixed cleanup action IDs,
not arbitrary model prompts. Keep AI provider keys server-side and keep upload
limits, same-origin checks, and quota controls intact.

## Roadmap Boundaries

- AI enhancement beyond local upscaling is deferred until provider selection,
  retention policy, cost controls, privacy copy, and failure fallback are
  designed.
- Printful and Gelato preset files can share the same service-spec engine later;
  Printify is the current preset target.
- Cloud sync, online comments, and shareable approval links need accounts,
  storage, permissions, moderation, and audit controls first.
- Screen-print separations remain a distinct future production mode.
- Printer, RIP, and ICC synchronization remain outside the local-first scope.

## Review Checklist

- Run `npm test`. It covers strict TypeScript checking, production build
  verification, the Node and tsx test suites, and module reachability.
- Run `npm audit --audit-level=high`.
- Test a creator flow: drop artwork, apply a Look, place it on a product,
  download a PNG, and inspect dimensions and DPI.
- If a module's reachability changed, update the allowlist in
  `tests/reachability.test.mjs` and say why in the pull request.
- Check that no real client assets or secrets are committed.

---

## 📄 Licence

All rights reserved. This repository is public so the work can be read and referenced, not relicensed. The code, copy, and creative assets remain © Brin Shadewater / Shadewater Labs. If you want to use something here, ask.
