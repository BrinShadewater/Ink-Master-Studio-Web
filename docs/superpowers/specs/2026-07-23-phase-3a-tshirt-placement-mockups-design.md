# Phase 3A T-Shirt Placement And Photographic Mockups

**Date:** 2026-07-23
**Status:** Approved design
**Roadmap phase:** Phase 3A of the canvas-first reset

## Purpose

Phase 3A begins the product workflow without pulling final rendering, print
analysis, or legacy production concepts into the editor. An owner can take one
saved design variation, place it directly on a photographic T-shirt blank,
switch among the 11 restored shirt colors, and reopen the project with the
product placement intact.

The product preview is an adaptation of the reusable design master. It cannot
change layer geometry, flatten the variation, or create a derived project
asset.

## Scope Boundary

### Included

- One T-shirt product variant for every design variation.
- Automatic schema migration for existing editor projects.
- Direct placement editing on the photographic shirt preview.
- Normalized move, proportional scale, and bounded rotation controls.
- Exact numeric placement controls, Center, and Reset placement commands.
- The 11 locally bundled 2048 by 2048 T-shirt PNGs in `public/mockups`.
- Independent product color and placement state for each variation.
- Session undo and redo, autosave, reload, and local-project reopen.
- Desktop right-inspector and mobile lower-inspector product controls.
- Shared variation rendering with image, text, trace, transparency, and Looks.
- Focused model, geometry, rendering, component, accessibility, bundle, and
  browser acceptance tests.

### Excluded

- Final PNG rendering or download.
- DPI metadata, file-size checks, generated-file parsing, and validation
  receipts.
- Printify provider integration or a live provider guarantee.
- Hoodie, mug, poster, custom target, hat, or tote products.
- Multiple separately named T-shirt products for one variation.
- Print Lens, physical-size analysis, ink-aware preview, or distance preview.
- Garment-specific Print Treatments.
- Mockup file export.
- Additional mockup acquisition or generated product imagery.
- Production jobs, profiles, proofs, approvals, handoff, packages, templates,
  batches, Gemini, or AI features.
- Broad refactors of legacy production code.

The implementation plan may contain no more than seven reviewed tasks. Phase
3B or Phase 4 work cannot be added to those tasks.

## Owner Workflow

1. Import artwork or reopen a local project.
2. Edit the active design variation.
3. Select Product from the editor toolbar.
4. See the complete variation centered on the black photographic T-shirt.
5. Drag the artwork directly on the shirt.
6. Resize it proportionally with a corner handle.
7. Adjust bounded rotation with the inspector.
8. Switch among the 11 shirt-color swatches without changing placement.
9. Use Center or Reset placement when required.
10. Duplicate the design variation and edit the duplicate product independently.
11. Autosave, reload, and reopen the project.
12. Return to Select to continue editing the creative master.

Product mode is a focused editor surface, not a workflow wizard or a second
application. The project top bar and variation controls remain available.

## Project Model

The project schema advances from version 4 to version 5.

```ts
type TShirtMockupSlug =
  | 'black'
  | 'burgundy'
  | 'cardinal'
  | 'charcoal'
  | 'forest-green'
  | 'heather'
  | 'military-green'
  | 'navy'
  | 'orange'
  | 'red'
  | 'royal-blue';

interface ProductPlacement {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

interface TShirtProductVariant {
  id: string;
  variationId: string;
  type: 'tshirt';
  mockupSlug: TShirtMockupSlug;
  placement: ProductPlacement;
}

interface EditorProject {
  schemaVersion: 5;
  // Existing project fields remain unchanged.
  productVariants: TShirtProductVariant[];
}
```

### Invariants

- Every design variation has exactly one T-shirt product variant.
- Every product references one existing variation in the same project.
- Two products cannot reference the same variation.
- A product never owns, copies, or mutates design layers.
- `mockupSlug` must reference one of the 11 Phase 3A catalog entries.
- Placement values are finite and normalized to documented bounds.
- The default product uses the black shirt and the centered default placement.

### Placement Contract

Placement describes the complete fixed 1000 by 1000 variation composition as a
single transparent square:

- `x`: horizontal center within the calibrated printable region, from `0`
  through `1`.
- `y`: vertical center within the calibrated printable region, from `0`
  through `1`.
- `scale`: proportional size relative to the printable region, from `0.1`
  through `1.5`.
- `rotation`: clockwise degrees, from `-180` through `180`.

The initial placement is `{ x: 0.5, y: 0.5, scale: 0.72, rotation: 0 }`.
Center changes only `x` and `y` to `0.5`. Reset restores the complete initial
placement.

The artwork may extend beyond the calibrated printable region while editing,
but normalization must keep its center reachable and its scale bounded. Phase
3A does not label the region as a provider-safe print area because provider
validation is deferred.

## Migration And Variation Lifecycle

- Schema 1 through 4 projects migrate to schema 5.
- Migration normalizes the existing variations first, then creates one default
  product for each normalized variation.
- A malformed schema-5 product is normalized when its variation link is valid.
- Unknown shirt slugs and invalid placement values fall back to the documented
  defaults.
- Products with missing variation links are discarded.
- Duplicate product links retain the first valid product in project order.
- Any variation left without a product receives a new default product.
- Duplicating a variation copies its product color and placement under a fresh
  product ID linked to the fresh variation ID.
- Deleting a variation deletes only its linked product.
- The final remaining variation retains its linked product because the final
  variation cannot be deleted.

The active variation's existing session-history record is extended so each
`VariationEditState` snapshot contains the variation's layers, Look, and linked
T-shirt product. Undo and redo replace only those three active-variation
values; they cannot switch variations or overwrite project metadata. Continuous
drag, resize, and numeric slider changes are coalesced into one undo step per
interaction. Shirt-color changes, Center, and Reset are discrete undo steps.
Variation selection remains outside undo history.

## Product Catalog

Phase 3A defines an editor-owned catalog separate from `services/mockups.ts`.
The legacy production mockup catalog is evidence only and cannot be imported
by the canvas-first editor.

Each catalog entry contains:

```ts
interface TShirtMockup {
  slug: TShirtMockupSlug;
  name: string;
  file: string;
  swatch: string;
  printableRegion: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}
```

The catalog includes black, burgundy, cardinal, charcoal, forest green,
heather, military green, navy, orange, red, and royal blue. Catalog files must
resolve to the existing `mockup-black.png`, `mockup-burgundy.png`,
`mockup-cardinal.png`, `mockup-charcoal.png`, `mockup-forestgreen.png`,
`mockup-heather.png`, `mockup-miltarygreen.png`, `mockup-navy.png`,
`mockup-orange.png`, `mockup-red.png`, and `mockup-royalblue.png` files under
`public/mockups`. The misspelling in the existing military-green filename is
preserved only at the file-path boundary; the public slug and label are spelled
correctly.

All 11 images share the same 2048 by 2048 framing. Phase 3A uses one reviewed
calibration rectangle copied into each entry so the contract can later support
asset-specific calibration without changing consumers. The rectangle is
defined in normalized mockup-image coordinates and identifies the interactive
placement region, not a guaranteed provider print area.

## Product Mode

`product` is added to `EditorTool` and the editor toolbar with a familiar shirt
icon, the accessible name `Product`, and a tooltip.

- Selecting Product replaces the design canvas with the product surface.
- Selecting Select returns to normal design editing.
- Crop, Adjust, Remove background, Trace, Looks, Layers, and Compare are
  unavailable while Product is active.
- The top bar, project commands, variation selection, undo, and redo remain
  available.
- Switching variations while Product is active loads that variation's product.
- Product mode does not alter the selected design layer.

### Direct Manipulation

- Pointer or touch drag inside the artwork moves the product placement.
- One visible corner handle resizes proportionally.
- Direct manipulation does not implement free rotation.
- Rotation uses a range input and numeric input in the inspector.
- Pointer movement is converted through the displayed mockup content rectangle
  and the calibrated printable region, never raw viewport dimensions.
- Interaction dimensions remain stable while loading labels, handles, focus
  rings, and status text change.
- Every direct manipulation has an equivalent inspector control.

### Inspector

The Product inspector contains:

- Eleven labeled color swatches.
- Horizontal and vertical position controls.
- Scale control.
- Rotation control.
- Center command.
- Reset placement command.
- Retry and Return to design actions when the preview cannot render.

Desktop uses the existing right-inspector region. Mobile uses the existing
lower-inspector pattern and keeps the photographic shirt visible above it.

## Rendering And Data Flow

1. Resolve the active variation and its linked product.
2. Compose the variation through the existing bounded transparent preview
   pipeline.
3. Preserve image layers, prepared-image output, trace geometry, text,
   visibility, opacity, layer order, transparency, and the active Look.
4. Load the selected photographic shirt from the local product catalog.
5. Contain the square shirt image in the available product surface.
6. Convert the catalog calibration rectangle into displayed coordinates.
7. Map normalized product placement into that rectangle.
8. Draw the transparent variation preview above the photographic blank.
9. Update placement geometry without recomposing the design during direct
   manipulation.
10. Persist normalized product state through the existing autosave path.

Preview composition remains bounded and cannot allocate a final product-size
canvas. Phase 3A does not add a product render worker. Worker-backed
high-resolution rendering begins with Phase 3B final export.

Product rendering must reuse the existing Look-render request authority.
Changing variation, project, composition fingerprint, or preview dimensions
invalidates older work. A stale result cannot replace the current product
preview.

## Error And Resource Behavior

- The last valid artwork preview remains visible while a replacement renders.
- Initial composition failure keeps the shirt visible and presents Retry.
- A failed replacement retains the prior valid artwork preview.
- A missing or undecodable shirt image does not silently substitute another
  color.
- Initial shirt failure shows a neutral product surface with Retry and Return
  to design.
- A failed color replacement retains the prior valid shirt and identifies the
  requested color as unavailable.
- Product mode remains reversible and cannot block normal design editing.
- Product rendering cannot fall back to legacy production processing.
- Existing decoded-image, object-URL, request-cancellation, timeout, and worker
  disposal contracts remain in force.

Messages are concise and owner-facing. They do not mention jobs, operators,
handoff, profiles, or production packages.

## Accessibility And Responsive Behavior

- Product, color, placement, Center, Reset, Retry, and Return to design controls
  have accessible names.
- Unfamiliar icon controls have tooltips.
- Active color and Product states are exposed programmatically.
- Swatches include visible labels or accessible names; color is not the only
  identifier.
- Numeric controls accept keyboard input and use documented bounds.
- Focus remains visible on the shirt preview and controls.
- A dismissed Product error state returns focus to the Product tool. Selecting
  Select to leave Product focuses the Select tool through the existing toolbar
  behavior.
- Status changes are announced without moving focus.
- The mobile lower inspector cannot cover the complete shirt or overlap the
  toolbar.
- Text, controls, handles, and artwork remain bounded at 390 by 844 and at the
  supported desktop viewport.

## Testing And Acceptance

### Model And History

- New projects contain exactly one default product.
- Schema 1 through 4 migration creates one product per normalized variation.
- Schema-5 normalization rejects or repairs malformed products
  deterministically.
- Duplicate and delete commands preserve the one-product-per-variation
  invariant.
- Product edits are immutable, undoable, redoable, and correctly coalesced.
- Product color and placement remain isolated across variations.
- Caller-owned project state is never mutated.

### Catalog And Geometry

- Exactly 11 unique catalog slugs and files are declared.
- Every catalog file is a locally bundled 2048 by 2048 PNG.
- Every calibration rectangle is finite, positive, and inside the image.
- Placement normalization applies the exact documented bounds.
- Display-to-product and product-to-display mapping round-trip within numeric
  tolerance.
- Landscape, portrait, square, desktop, and mobile product surfaces produce
  identical normalized pointer movement.

### Rendering And Components

- The product renderer uses the complete variation composition and preserves
  transparency.
- Visible image, prepared image, text, trace, layer order, opacity, and Looks
  appear in the product preview.
- Color replacement preserves placement and current artwork authority.
- Stale, failed, timed-out, and retried composition outcomes follow the
  documented retention rules.
- Toolbar and inspector controls expose their documented enabled, selected,
  labelled, and focus states.
- Product mode cannot invoke design-layer commands.

### Browser Acceptance

One deterministic Chromium owner flow must:

1. Import a PNG with meaningful transparency.
2. Open Product and prove the black photographic shirt and artwork are visible.
3. Drag, resize, and rotate the artwork.
4. Switch to another shirt color without changing placement.
5. Duplicate the variation.
6. Change the duplicate's color and placement.
7. Switch variations and prove independent product state.
8. Undo and redo product changes.
9. Autosave, reload, and reopen the local project.
10. Repeat the essential placement and color checks at 390 by 844.
11. Return to Select and prove the design master is unchanged.

Canvas-pixel assertions must distinguish the shirt, artwork, and page
background. Retain reviewed desktop and mobile screenshots.

### Release Gate

- Typecheck passes.
- Production build passes.
- All existing and new unit and integration tests pass.
- Chromium end-to-end tests pass.
- Bundle-boundary tests prove the editor does not import legacy production,
  job, proof, package, profile, batch, Gemini, or AI modules.
- Preview request, image-load, object-URL, and component-lifecycle cleanup
  checks pass.
- A protected preview deployment returns the editor and static privacy route.
- Desktop and mobile smoke checks pass against the deployed source.

## Implementation Order

1. Schema-5 product model, migration, normalization, and lifecycle commands.
2. Editor-owned T-shirt catalog and calibrated product geometry.
3. Product preview composition authority and retention behavior.
4. Desktop and mobile Product canvas interaction.
5. Product inspector, swatches, exact controls, and focus behavior.
6. Autosave, reopen, variation lifecycle, and integration hardening.
7. Whole-flow acceptance, bundle boundary, screenshots, and protected preview.

Each task requires focused tests and review before the next begins. Export,
validation, additional products, Print Lens, treatments, AI, and unrelated
legacy retirement must be rejected from the Phase 3A plan.
