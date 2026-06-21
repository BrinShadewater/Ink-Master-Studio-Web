# Ink Master Production Workbench Design

## Goal

Turn Guided Studio into a local-first DTG/DTF production workbench for print-shop operators. A named job becomes the durable unit that carries source artwork, processing choices, print dimensions, placement, notes, preflight findings, versions, and export records.

## Product model

- Jobs autosave to IndexedDB and can be reopened, duplicated, renamed, archived, exported, and imported.
- Artwork and generated export blobs live in IndexedDB. Small shop preferences and templates live in localStorage.
- Portable `.inkmaster-job` files are ZIP archives containing a versioned JSON manifest plus source artwork and stored export files.
- The existing four Guided Studio stages remain. Job metadata appears in the top bar; print specification and placement live in Prepare/Preview; production package and proof actions live in Export.

## Production behavior

- Preflight evaluates effective DPI against the requested print width/height, transparency, background-edge risk, upscaling, fine-detail risk, and output-format suitability.
- Findings are `pass`, `warning`, or `critical`. Critical findings block production exports; warnings require one explicit acknowledgement per job revision.
- Placement is stored in inches and converted to calibrated mockup percentages. Presets cover full front, center chest, left chest, full back, sleeve, youth, and oversized print.
- A production ZIP contains the print master, production PDF, selected mockups, optional white underbase, palette/processing summary, and versioned job manifest.
- Customer proofs are generated as print-ready and email-friendly PDFs with job/customer metadata, placement dimensions, notes, mockups, and approval fields.

## Batch and templates

- Batch jobs use Guided Studio recipes and the same preflight engine. Warnings are visible and require acknowledgement; critical items cannot export.
- Operator templates combine recipe, product, print specification, placement, export defaults, naming pattern, and proof branding. Templates remain distinct from image-treatment recipes and support JSON import/export.

## Constraints

- No accounts, cloud synchronization, online comments, or online approvals.
- No new screen-print separation mode.
- Gemini remains browser → `/api/edit-image` → Vercel serverless → Gemini, with `GEMINI_API_KEY` server-side only.
- Existing Guided Studio visual language and responsive shell remain the design system.
