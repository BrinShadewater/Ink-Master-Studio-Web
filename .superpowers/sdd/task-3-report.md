# Task 3: Pure Deterministic Look Processor

Status: implementation complete; pending review.

## Scope

Implemented the one pure byte-level rendering authority for normalized
`VariationLook` recipes. No worker, React, DOM, canvas, storage, URL, CSS filter,
or UI code was added.

## TDD Evidence

### RED

Command:

```text
npx tsx --test tests/editor-look-processor.test.ts
```

Result: exit 1, 0 passed, 1 failed. Node reported `ERR_MODULE_NOT_FOUND` for
`editor/lookProcessor`, which was the expected failure because the production
module did not yet exist.

### Initial GREEN

Command:

```text
npx tsx --test tests/editor-look-processor.test.ts
```

Result: exit 0, 11 passed, 0 failed. This covered Original isolation, literal
goldens for all eight processed defaults, Rec. 709 luminance, Strength 0/50/100,
partial-alpha premultiplied interpolation, zero-alpha RGB cleanup, both halftone
background modes, seeded equality/inequality, canonical anchors, Distressed Print
coverage, every normalized parameter, and malformed frames.

### Final Focused GREEN

Command:

```text
npx tsx --test tests/editor-look-processor.test.ts tests/editor-look-model.test.ts
```

Result: exit 0, 17 passed, 0 failed: 11 processor tests and 6 Look model tests.

Additional commands:

```text
npm run typecheck
git diff --check
```

Both exited 0 with no diagnostics. No broad verify command was run.

## Algorithms Locked

- Shared bytes clamp and `Math.round` each named stage. Luminance uses fixed
  Rec. 709 coefficients. Standard contrast operates around 127.5 with
  `1 + contrast / 100`; High Contrast uses `1 + contrast / 50`. Saturation
  expands or contracts channels around luminance.
- Strength interpolates alpha and premultiplied RGB at `strength / 100`, then
  unpremultiplies. A rounded zero output alpha always produces zero RGB.
- Clean Photo applies contrast, saturation, then an alpha-aware separable
  three-tap box blur and a clarity difference bounded to +/-64. Edge samples
  clamp to the nearest pixel.
- High Contrast maps the black point to zero, applies the stronger contrast
  curve, then saturation. Monochrome applies rounded Rec. 709 luminance,
  brightness in byte units, then contrast.
- Duotone offsets rounded luminance by `balance / 100` and interpolates parsed
  shadow/highlight bytes. Posterized applies contrast before the specified
  per-channel levels formula.
- Graphic Halftone maps pixel centers into canonical 4096-space, rotates around
  the canonical center, and compares radial cell distance with a square-root
  luminance radius. Transparent mode emits source-alpha ink only within source
  coverage; solid mode fills every pixel with opaque ink or background.
- Vintage Ink mixes source RGB with a warm `[38, 30, 28]` to `[245, 226, 186]`
  luminance map, contracts the tonal endpoints for fade, then adds a shared
  zero-mean seeded grain offset.
- Distressed Print combines 65 percent fine and 35 percent coarse canonical hash
  noise. Wear reduction is combined with a four-pixel Manhattan alpha-edge
  factor and partial-alpha factor; it cannot create coverage outside the source.
- Canonical texture uses integer pixel-center coordinates and a normalized
  lattice. The documented `Math.imul` avalanche constants are `0x9e3779b1`,
  `0x85ebca77`, `0xc2b2ae3d`, `0x7feb352d`, and `0x846ca68b`.

## Golden Fixture Review

The fixed 4-by-4 fixture includes black, white, primary/secondary colors,
midtones, partial alpha, and colored zero-alpha input. Expected arrays for all
eight processed default Looks were calculated before production code in a
separate arithmetic pass and stored literally. They were then reviewed against
identity/endpoints and representative Rec. 709, duotone, posterization,
halftone, alpha, and seeded-texture samples. Tests do not call processor helpers
to generate their expectations.

## Files

- `editor/lookProcessor.ts`: pure frame contract, validation, algorithms,
  canonical hash, Strength blend, and processor entry point.
- `tests/editor-look-processor.test.ts`: 11 byte-level and behavioral tests.
- `tests/fixtures/looks/README.md`: formulas, canonical constants, alpha rules,
  and golden review policy.
- `.superpowers/sdd/progress.md`: Task 3 marked implementation complete and
  pending review.
- `.superpowers/sdd/task-3-report.md`: this report.

## Self-Review

- All eight processed defaults have exact 64-byte expected arrays; Original has
  byte identity plus independent-buffer coverage.
- Frame validation checks positive integer dimensions, maximum safe byte length,
  `Uint8ClampedArray` type, and exact `width * height * 4` length before output or
  processing allocations. Every malformed case throws `Invalid Look frame.`
- Tonal Looks preserve source alpha before Strength. Transparent halftone and
  distress stay inside source coverage; solid halftone deliberately fills the
  complete frame. Partial and zero alpha behavior is explicit.
- Strength 0, 50, and 100 and a partial-alpha color transition are locked at the
  byte level. Zero final alpha clears hidden RGB.
- Duplicate seeds match, changed seeds differ, every normalized parameter changes
  the review frame, and equivalent 8-by-8/16-by-16 normalized lattice samples
  match exact hash values.
- The processor imports only Look types and contains no runtime random, clock,
  React, DOM, canvas, CSS filter, storage, URL, or mutable ambient-state access.
- Self-review found no contract issue requiring a code change.

## Concerns

No known implementation concerns. The formulas intentionally become a persisted
rendering contract through their golden bytes; future algorithm changes require
independent fixture recalculation and review. Worker transport and UI integration
remain out of scope for later tasks.

Commit subject: `feat: add deterministic Look pixel processor`.
