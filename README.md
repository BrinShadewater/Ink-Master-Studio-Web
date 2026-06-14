# Ink Master Studio Web 🖨️

AI-assisted production tool for screen-print and apparel mockup workflows.

Ink Master Studio helps turn source artwork into usable previews and production assets: upload artwork, adjust mockup controls, generate exports, track history, and prepare client-facing visuals without leaving the browser. The goal is a practical workbench, not a shiny demo: fewer handoffs, fewer mystery steps, faster proofs.

## 👕 What This App Does

- Accepts uploaded artwork for production/mockup workflows.
- Provides preset controls and preview surfaces for apparel mockups.
- Supports batch processing and export history.
- Generates PDF/ZIP output for sharing or production handoff.
- Uses AI assistance where it helps move artwork toward usable proof material.

## 🧰 Stack

- Vite
- React 19
- TypeScript
- Gemini API integration
- Image processing utilities
- PDF/ZIP export helpers

## 🚦 Repository Status

Prototype-to-production tool. The UI is practical, but API-key handling must be reviewed before public deployment.

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
App.tsx                 Main application shell
components/             Upload, controls, preview, batch, export UI
services/               Gemini and image-processing services
public/mockups/         Apparel mockup assets
public/logo/            Brand assets
PERFORMANCE_SEO_REPORT.md
SECURITY.md
Dockerfile
nginx.conf
```

## 🔦 Key Surfaces

- `components/Dropzone.tsx` handles artwork intake.
- `components/Controls.tsx` and `components/PresetsPanel.tsx` shape the production workflow.
- `components/Preview.tsx` controls mockup review.
- `components/BatchProcessor.tsx` and `components/ExportHistory.tsx` affect output workflows.
- `api/edit-image.ts`, `services/geminiService.ts`, and `services/imageProcessing.ts` are security- and cost-sensitive.
- `nginx.conf` and `Dockerfile` support production hosting.

## 📚 Documentation

- `SECURITY.md`
- `PERFORMANCE_SEO_REPORT.md`
- `docs/PROJECT-BRIEF.md`
- `docs/MAINTENANCE.md`
- `README.md`
- `CONTRIBUTING.md`
- `CHANGELOG.md`

## 🔐 Security Note

Read `SECURITY.md` before deploying. The current architecture needs careful handling of the Gemini API key; a server-side proxy or serverless function is the safer production path.

## 🧵 Working Style

Keep the tool practical and production-minded. Every control should help someone move from artwork to proof faster, with fewer hidden steps.

## ✅ Review Checklist

- Run `npm run build`.
- Test uploads with safe sample files.
- Review mockup alignment and export output.
- Check that no real client assets or secrets are committed.
- Re-read `SECURITY.md` for any API, upload, or deployment change.
