# CLAUDE.md

**Read [`AGENTS.md`](AGENTS.md) first.** This file exists so Claude Code finds the
guidance by the name it looks for; the content lives in one place on purpose.

Four things here are contracts, not code:

- **`GEMINI_API_KEY` never reaches the browser.** AI cleanup goes through the
  server-side `/api/edit-image` route. Never reintroduce it via Vite `define` or a
  `VITE_` variable — `tests/ai-cleanup.test.ts` enforces this, and a failure there
  means the code is wrong, not the test.
- **`specs/printify.ts` is a print contract.** Those pixel dimensions and DPI values
  decide whether a user's file is accepted by a print service. Not a refactor target.
- **The look presets are deterministic.** Changing a preset's maths changes what
  every existing saved design produces. New preset or versioned change, never an
  in-place tweak.
- **Local-first is a promise.** Artwork stays in the browser. Do not add analytics,
  error reporting, or backups that ship user content off the device.

**The gate is `npm run verify`** (typecheck, build, tests, then Playwright). Run it
before claiming a change works; the canvas and Web Worker paths fail in ways
typechecking does not catch.
