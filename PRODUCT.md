# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Independent artists, streamers, creators, and print-on-demand sellers preparing artwork for Printify. Their primary job is to turn existing artwork into a compliant production file without needing print-production expertise.

## Product Purpose

InkMaster Studio provides the shortest reliable path from uploaded artwork to a compliant, print-ready PNG. A successful workflow moves from importing artwork through editing, garment preview, readiness checks, and download with minimal production jargon.

## Positioning

InkMaster Studio combines a local-first browser workflow with a focused canvas, real garment previews, Printify-specific output presets, and plain-language file checks. Artwork, projects, and previews remain in the browser unless the user explicitly downloads, imports, exports, or invokes optional server-side AI cleanup.

## Operating Context

Users bring PNG, JPEG, or WebP artwork into a browser-based canvas. They can edit image, text, and vector-trace layers, compare deterministic visual treatments, preview placement on apparel, and export production files. Saved projects and variations are stored locally in IndexedDB. Basic mode is the default workflow, while Advanced mode exposes denser editor controls.

## Capabilities and Constraints

- Canvas editing supports image, text, and vector-trace layers, transformations, named variations, and undo and redo history.
- Image processing runs in Web Workers where practical so full-resolution work does not block the interface.
- Product placement uses Printify-oriented presets and mockups.
- PNG exports include fixed production dimensions and DPI metadata; traced and text artwork can also be exported as SVG.
- Readiness checks cover target pixels, DPI metadata, transparency, file-size limits, and upscaling quality.
- Optional AI cleanup is an explicit user action routed through a server-side API. Provider keys must never enter the browser bundle.
- Printify is the current provider target. Printful, Gelato, cloud sync, online comments, shareable approvals, screen-print separations, and printer or RIP synchronization are outside the current scope.

## Brand Commitments

Preserve the InkMaster Studio name and the existing logo assets in `public/logo/`. Product language should remain direct, practical, and understandable without print-production expertise. The local-first privacy commitment, Printify-first focus, and explicit consent boundary around AI cleanup are durable product requirements.

## Evidence on Hand

- Existing brand assets: `public/logo/logo.png` and `public/logo/logo-mark.webp`.
- Existing product and garment imagery: `public/landing-siren-print.webp`, `public/landing-tee-black.webp`, `public/landing-tee-heather.webp`, `public/landing-tee-white.webp`, and `public/mockups/`.
- The current application provides a marketing surface at `/` and the working editor at `/editor`.
- Automated tests cover editor behavior, exports, Printify specifications, accessibility-sensitive dialogs, production configuration, and the landing page.
- No confirmed testimonials, customer logos, usage benchmarks, pricing claims, press coverage, or online collaboration infrastructure are present. Future work must not fabricate them.

## Product Principles

- Minimize time from artwork import to a trustworthy production download.
- Keep the default workflow understandable without print-production jargon.
- Automate safe corrections and explain outcomes in one plain sentence.
- Keep artwork local unless the user explicitly chooses an action that moves it.
- Preserve responsiveness by keeping expensive image work away from the main interface thread.

## Accessibility & Inclusion

Core workflows should remain keyboard operable, expose clear accessible names and status messages, and preserve focus when dialogs or drawers open and close. Plain-language guidance is part of making print preparation accessible to users without specialist knowledge.
