# AGENTS.md — working on InkMaster Studio

Orientation, then the four things that are contracts rather than code.

Existing docs own the detail: [`PRODUCT.md`](PRODUCT.md) for what it is,
[`DESIGN.md`](DESIGN.md) for the visual system, [`SECURITY.md`](SECURITY.md) for
the API boundary, [`docs/MAINTENANCE.md`](docs/MAINTENANCE.md) for upkeep, and
[`docs/PROJECT-BRIEF.md`](docs/PROJECT-BRIEF.md) for the brief. Read the relevant
one before a substantial change rather than inferring intent from the code.

## 🔐 1. The Gemini key never touches the browser

AI cleanup is routed through the server-side `/api/edit-image` route **so provider
keys never enter the browser bundle**. `GEMINI_API_KEY` must never be reintroduced
via Vite `define`, a `VITE_`-prefixed variable, or any other browser-public path.

This one bites back, which is the point: `tests/ai-cleanup.test.ts` asserts that no
source file references a browser-public Gemini env. A "simplification" that calls
the provider from the client fails the suite rather than shipping quietly. **Do not
route around that test.** If it fails, the code is wrong, not the test.

## 📐 2. `specs/printify.ts` is a print contract, not configuration

The export targets — Printify Full Front at 4500×5400, Standard Tee at 3000×3600,
Draft Proof at 1500×1800, the poster area at 3600×5400, all with their stated DPI —
are what makes a downloaded file *accepted by a print service*.

Changing a number here does not adjust a preference; it changes whether a user's
product is printable. Treat this file as an external interface. If a value looks
wrong, verify against the print service's current requirement and say so — do not
round it, unify it, or refactor it into something tidier.

## 🎨 3. "Deterministic" is a promise about the look presets

Clean Photo, High Contrast, Monochrome, Duotone, Posterized, Graphic Halftone,
Vintage Ink and Distressed Print are **deterministic** treatments. The same input
gives the same output, which is why the before/after compare board and saved
variations mean anything.

So a preset's maths is not a tuning knob. Changing it silently changes what every
existing saved design produces. If a preset genuinely needs to change, that is a
new preset or a versioned change with a changelog entry, not an in-place tweak.

## 🖥️ 4. Local-first is a product promise, not an implementation detail

Uploaded artwork, saved projects and previews stay in the browser — IndexedDB for
persistence — unless the user downloads a file or explicitly chooses AI cleanup.

The consequence that is easy to miss: **do not add anything that ships user content
off the device.** Analytics that captures canvas state, an error reporter that
attaches a screenshot or a serialised project, a "helpful" auto-backup — each of
those quietly breaks the promise the README makes. Telemetry about the app is a
product decision; telemetry containing user artwork is a defect.

Heavy operations (background removal, upscaling, crop, transform) run in dedicated
**Web Workers** so the UI stays responsive. Moving one back onto the main thread to
simplify a call site is a regression users feel immediately.

## ✅ The gate

```bash
npm run verify        # npm test (typecheck + build + node/tsx tests) then playwright
npm test              # faster loop
npm run dev           # vite
```

`npm run verify` is what a change has to pass. Run it before claiming something
works — this project has an e2e suite precisely because the canvas and worker paths
do not fail in ways typechecking catches.

## 🗺️ Layout

| Path | What it is |
|---|---|
| `editor/`, `components/` | Canvas editor and UI |
| `workers/` | The off-main-thread image operations |
| `services/` | App-side logic |
| `api/` | Server-side routes — `edit-image.ts`, `ai-cleanup-status.ts` |
| `specs/` | `printify.ts`, the export contract |
| `tests/` | node + tsx tests; Playwright config at the root |
| `docs/` | Brief, maintenance, handoff, archive |

`dist/` and `node_modules/` are build output and dependencies; both are correctly
ignored and neither belongs in a commit.
