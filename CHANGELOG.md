# Changelog

Notable changes to Ink Master Studio Web are tracked here.

## Unreleased

- Replaced the starter README with project-specific documentation.
- Added contribution, issue, and pull request guidance.
- Added project brief and maintenance documentation for production workflows.
- Added more expressive README headings and voice while keeping the documentation professional.

## 2026-08-30

- xmldom 0.9 with a structural TraceXmlPlatform.

## 2026-08-15

- The Playwright suite runs fully parallel, split into five files. The flaky desktop acceptance test is fixed.
- A build-time test guards the pre-render shell so the landing page stays readable to crawlers that do not run JavaScript.

## 2026-08-13

- The mobile top bar no longer overlaps the canvas.
- The end-to-end suite is repaired (49/49) and runs in CI on every pull request.
- Look failures are reported from the comparison view.

## 2026-08-12

- Trace layers rasterise with Path2D instead of decoding SVG. Added the missing export-rasterisation test, which found a bug that is now pinned.
