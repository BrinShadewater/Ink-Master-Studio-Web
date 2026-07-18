# InkMaster Studio Canvas-First Product Reset

## Summary

InkMaster Studio will return to its original purpose: turning a source image, such as a film still, into a reusable merch design and then preparing that design for print-on-demand products.

The replacement product is a local-first, canvas-first creative editor. It supports non-destructive image remixing, local enlargement, adjustable vector tracing, simple text, product placement, representative mockups, and validated Printify-ready export. It is designed for a user who understands the artwork they want but may be new to garment printing.

The current production workbench, Advanced mode, and production-job data model will be removed from the shipped application. Proven processing and validation code will be retained where it fits the new model.

## Product Principles

- The design canvas is the product's center of gravity.
- One reusable design master can feed several product-specific placements.
- Editing is non-destructive. The uploaded source is never overwritten.
- Printing guidance uses plain language and does not imply exact printer, ink, or fabric simulation.
- Expensive work runs outside the main UI thread and never blocks interaction without progress and cancellation.
- The generated file, not the mockup, is the authority for export readiness.
- Uploaded artwork and projects stay local unless the user explicitly exports a file.
- Features that do not improve image remixing or POD output are outside this reset.

## Primary Workflow

1. Upload a source image or reopen a locally saved project.
2. Remix the image on the main canvas using transforms, adjustments, curated styles, vector tracing, and optional text.
3. Save or duplicate named design variations without changing the source.
4. Open the product drawer and create a T-shirt, hoodie, mug, poster, or custom output from a selected variation.
5. Position the design independently for each product and preview an appropriate light or dark product mockup.
6. Export a transparent or background-filled PNG, or download SVG from a vector master.
7. Review a validation receipt based on the actual generated file.

## Editor Experience

### Desktop

The application opens directly into the editor or a compact local project picker. It does not use a marketing landing page or a Guided/Advanced mode split.

- The central canvas receives most of the viewport.
- A compact left toolbar selects transform, crop, image adjustments, styles, trace, text, and product preview tools.
- The right inspector displays only controls relevant to the active tool or layer.
- The right side also contains a lightweight ordered layer list.
- The bottom product drawer contains product variants and their mockup previews.
- The top bar contains project name, save state, variation control, undo, redo, import, and export commands.

### Mobile

- The canvas remains the primary view.
- The tool rail becomes a stable bottom toolbar.
- The inspector opens as a bottom sheet for the active tool.
- Layers and product previews open as full-height drawers.
- Controls must not cover the selected artwork or make the canvas jump when opened.

## Creative Toolset

### Transform

- Move, scale, rotate, and flip layers.
- Crop the source image non-destructively.
- Fit and fill commands for the design canvas and product canvases.
- Direct manipulation and numeric controls update the same stored transform.

### Image Adjustments

- Brightness.
- Contrast.
- Saturation.
- Temperature.
- Sharpness.
- Opacity.
- Local background transparency controls for simple solid or near-solid edges.

Adjustments are stored as parameters and can be reset individually or as a group.

### Merch Styles

The initial style set is:

- Clean photo.
- High contrast.
- Monochrome.
- Duotone.
- Posterized.
- Halftone.
- Vintage ink.
- Distressed print.

Each style is a named, deterministic recipe built from editable processing parameters. Applying a style does not flatten the source or prevent later adjustment.

### Vector Trace

- Generate a trace as a separate derived layer.
- Adjust color count, detail, smoothing, blur, and palette colors.
- Regenerate the trace when parameters change.
- Transform, hide, duplicate, reorder, and delete the trace layer.
- Download a valid standalone SVG of the vector design master.

The reset does not include path-node editing, freehand vector drawing, or arbitrary shape tools.

### Text

- Add a small number of independent text layers.
- Edit content, bundled or web-safe font, size, color, alignment, letter spacing, outline, opacity, and placement.
- Reorder, duplicate, hide, and delete text layers.

The reset does not include curved text, font uploads, text-on-path, or advanced typography effects.

### Resolution

- Local progressive enlargement runs during final high-resolution rendering.
- The UI reports source dimensions, output dimensions, enlargement ratio, and the local processing method.
- Enlargement warnings remain honest: interpolation and sharpening can improve presentation but cannot recover missing photographic detail.
- Extreme enlargement warns strongly but remains downloadable unless the output is technically invalid.

Cloud AI enhancement is not part of this reset. The current AI controls, Gemini client service, status route, edit route, and provider dependency will be removed from the shipped application if nothing else uses them. A future AI phase must separately define an owner-only access gate, provider, cost controls, privacy behavior, retention policy, failure fallback, and quality acceptance tests.

## Project Model

Projects use a new versioned schema and are stored in IndexedDB. Source and derived binary assets are stored as blobs rather than data URLs.

```ts
interface StudioProjectV1 {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  sourceAssetId: string;
  sourceMetadata: SourceMetadata;
  variations: DesignVariation[];
  activeVariationId: string;
  productVariants: ProductVariant[];
}

interface DesignVariation {
  id: string;
  name: string;
  canvas: DesignCanvas;
  layers: DesignLayer[];
}

type DesignLayer = ImageLayer | TraceLayer | TextLayer;

interface ProductVariant {
  id: string;
  name: string;
  variationId: string;
  target: PrintifyTarget | CustomTarget;
  placement: ProductPlacement;
  previewColor: string;
  background: TransparentOrSolidBackground;
}
```

The concrete layer types contain stable IDs, visibility, ordering, opacity, transforms, and type-specific parameters. A trace layer references the source image layer and stores trace settings plus its regenerated SVG asset. A product variant references a design variation and never copies or mutates its layers.

### Variation Behavior

- A project always contains at least one variation.
- Duplicate variation creates an independent editable layer state while reusing immutable source assets.
- Rename and delete are available; the final remaining variation cannot be deleted.
- Undo and redo are scoped to the active variation and remain session-local.
- The latest project state autosaves, but undo history does not need to survive a browser restart.

### Persistence

- Autosave states are `Saving`, `Saved`, and `Save failed`.
- A failed save leaves the in-memory project editable and offers retry.
- Portable `.inkmaster-project` files are ZIP archives containing a versioned manifest and all required source and derived assets.
- Import validates the complete archive before writing any project records.
- Existing production-job browser data is not migrated, read, or deleted by the new app.

## Products And Mockups

### Initial Targets

- Printify-oriented full-front T-shirt.
- Printify-oriented hoodie front.
- Printify-oriented mug wrap.
- Printify-oriented poster.
- Custom pixel dimensions and DPI.

Named Printify presets retain their checked product, provider, observed print area, and verification date. The app explains that provider print areas can change and that a preset is a validated starting target, not a live Printify guarantee.

Each product variant stores placement independently. Updating a product placement cannot alter the design master or another product.

### Dark And Light Products

- T-shirt and hoodie previews support representative dark and light colors.
- Contrast analysis warns when artwork may disappear against the selected product color.
- Transparent export is the default for garments unless the user intentionally selects a solid design background.
- DTG-oriented edge guidance favors soft transparency and warns about unintended rectangular backgrounds.

### Mockup Assets

The 11 original photographic T-shirt blanks in `public/mockups` remain part of the product and define the visual-quality floor. The simplistic later SVG mockups for other products are not accepted as final reset assets. Hoodie, mug, and poster previews must use coherent, locally bundled, license-safe raster assets of comparable clarity before those mockups are considered complete.

Mockups are representative compositing previews. They must not imply exact scale, fabric texture, color matching, ink coverage, or provider rendering.

## Rendering And Data Flow

1. Decode the immutable source once and retain a local asset reference.
2. Build bounded preview rasters from the active variation without allocating product-size canvases on the main thread.
3. Apply layer transforms and deterministic adjustment/style parameters in layer order.
4. Regenerate trace assets outside the main UI thread when trace parameters change.
5. For product preview, composite the design variation using that product's independent placement and preview color.
6. For final export, render the selected variation at the target canvas size in a worker.
7. Apply progressive local enlargement only where the source contribution requires it.
8. Encode the final PNG with target DPI metadata or return standalone SVG for a vector-master export.
9. Parse and validate the actual generated file before enabling its final download receipt.

Preview and final rendering use the same normalized parameters so the preview does not silently diverge from export. Final export never waits for mockup generation.

## Architecture Boundaries

- **Application shell:** project selection, active variation, active product, and global commands.
- **Project repository:** versioned IndexedDB records, blobs, autosave, import, and export.
- **Editor state:** layer operations, selected tool, selection, and session undo/redo.
- **Render pipeline:** normalized layer composition shared by bounded preview and worker-backed final render.
- **Trace engine:** adjustable SVG generation behind a worker-friendly interface.
- **Product catalog:** Printify-oriented presets, custom targets, and independent placement rules.
- **Mockup compositor:** representative preview composition only.
- **Export validation:** parses generated output and produces the validation receipt.

The current monolithic application component will be replaced by these bounded modules. Existing image processing, placement, upscaling, artwork analysis, mockup compositing, Printify specification, object URL, and print-file validation code may be reused after it is detached from production-job assumptions.

The following product concepts are removed from the shipped app and active code paths:

- Advanced mode.
- Production jobs and job library.
- Production profiles and profile revisions.
- Customer proofs and approval tracking.
- Handoff and production packages.
- Package review and export audit history.
- Shop templates and recipes that encode production jobs.
- Batch order processing.
- Workflow inspector and production preflight stages.

Git history remains the archive for removed implementations.

## Errors And Guidance

- Unsupported, corrupt, or oversized uploads fail before project creation with a plain explanation.
- Processing cancellation leaves the last valid project state and preview intact.
- Worker failure or timeout offers retry and never falls back to an unbounded main-thread render.
- Trace failure leaves the source image layer unchanged.
- Export failure does not download a lower-quality or partially generated file.
- Low resolution, extreme enlargement, contrast risk, and likely background edges are warnings unless the output is invalid.
- A custom target rejects non-positive dimensions, unsupported formats, and unsafe canvas sizes before rendering.
- Blob URLs and worker resources are released when assets, projects, or operations are replaced.

## Accessibility And Interaction

- Every icon tool has an accessible name and tooltip.
- Canvas actions have equivalent numeric controls where practical.
- Tool selection, layer operations, undo, redo, and export are keyboard accessible.
- Focus returns predictably when drawers and bottom sheets close.
- Text and controls do not overlap at supported desktop and mobile widths.
- Progress, warning, and save states are announced without stealing focus.

## Testing

### Unit And Integration

- Project schema validation and IndexedDB round trips.
- Portable project export/import, corruption rejection, and no partial import.
- Variation duplication and isolation.
- Session undo/redo scoped to the active variation.
- Layer ordering, visibility, transforms, and recipe reset behavior.
- Deterministic output for every merch style.
- Trace regeneration, palette changes, and valid SVG output.
- Text styling and transform serialization.
- Independent product placements referencing one design variation.
- Printify target dimensions and custom-target validation.
- Local upscale ratio metadata and warning boundaries.
- Final PNG dimensions, DPI metadata, color type, transparency, and file-size receipt.
- Worker cancellation, timeout, retry, and resource cleanup.
- No active Gemini route, client call, browser key path, or AI control after removal.

### Browser Acceptance

- Upload a film still, apply a style, adjust it, add text, and autosave.
- Duplicate the variation, create a vector trace, recolor it, and download SVG.
- Place one variation independently on a dark shirt, light shirt, hoodie, mug, and poster.
- Export a Printify T-shirt PNG and verify the generated receipt.
- Create and export a valid custom target.
- Reload and reopen the saved project with equivalent visual state.
- Export, remove, and re-import a portable project.
- Cancel and retry a large final export without losing edits.
- Complete the core workflow on desktop and mobile without overlapping controls.
- Confirm that production-job terminology and Advanced mode are absent.

## Success Criteria

- A novice can turn a source image into a distinct merch design and a valid POD file without learning print-shop workflow terminology.
- One design variation can be reused across products without duplicated or drifting edits.
- The source image remains recoverable after every edit and failure.
- Preview interaction stays responsive while full-resolution work runs separately.
- Exported PNG and SVG files match their declared dimensions and format.
- Original photographic shirt mockups remain available and other product mockups meet the same quality standard.
- The live application contains no production workbench or partial AI feature surface.

