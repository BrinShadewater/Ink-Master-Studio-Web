# InkMaster Studio Canvas-First Product Reset

## Summary

InkMaster Studio will return to its original purpose: turning a source image, such as a film still, into a reusable merch design and then preparing that design for print-on-demand products.

The replacement product is a local-first, canvas-first creative editor with print-aware adaptation. It supports non-destructive image remixing, local enlargement, adjustable vector tracing, simple text, garment-specific print treatments, product placement, representative mockups, and validated Printify-ready export. It is designed for a user who understands the artwork they want but may be new to garment printing.

The current production workbench, Advanced mode, and production-job data model will be removed from the shipped application. Proven processing and validation code will be retained where it fits the new model.

## Product Principles

- The design canvas is the product's center of gravity.
- One reusable design master can feed several product-specific placements.
- Aesthetic Looks and physical Print Treatments are separate, reversible decisions.
- Editing is non-destructive. The uploaded source is never overwritten.
- Printing guidance uses plain language and does not imply exact printer, ink, or fabric simulation.
- Print risks are shown on the artwork where they occur, with an explanation and reversible fix.
- Expensive work runs outside the main UI thread and never blocks interaction without progress and cancellation.
- The generated file, not the mockup, is the authority for export readiness.
- Uploaded artwork and projects stay local unless the user explicitly exports a file.
- Features that do not improve image remixing or POD output are outside this reset.

## Product Position

InkMaster does not compete on template volume, stock assets, mockup-library size, AI generation, or full graphics-suite breadth. Its defining advantage is connecting three jobs that are usually split across separate tools:

1. Remix an imperfect source image into several intentional merch Looks.
2. Adapt a selected Look to the physical behavior of a specific garment and print size.
3. Compare the alternatives and export a file with explainable print confidence.

The product promise is: create something distinctive, understand how it may behave on fabric, and correct likely problems without flattening or losing the creative master.

## Primary Workflow

1. Upload a source image or reopen a locally saved project.
2. Remix the image on the main canvas using transforms, adjustments, curated Looks, vector tracing, and optional text.
3. Save or duplicate named design variations without changing the source.
4. Compare promising variations side by side before selecting one for a product.
5. Open the product drawer and create a T-shirt, hoodie, mug, poster, or custom output from a selected variation.
6. Position the design independently and run Print Lens at the selected physical size and substrate color.
7. Apply or adjust reversible Print Treatments for any detected risks.
8. Preview the artwork, ink-aware approximation, and representative product mockup.
9. Export a transparent or background-filled PNG, or download SVG from a vector master.
10. Review a validation receipt based on the actual generated file and applied treatment.

## Editor Experience

### Desktop

The application opens directly into the editor or a compact local project picker. It does not use a marketing landing page or a Guided/Advanced mode split.

- The central canvas receives most of the viewport.
- A compact left toolbar selects transform, crop, image adjustments, Looks, trace, text, Print Lens, Compare Board, and product preview tools.
- The right inspector displays only controls relevant to the active tool or layer.
- The right side also contains a lightweight ordered layer list.
- The bottom product drawer contains product variants and their mockup previews.
- The top bar contains project name, save state, variation control, undo, redo, import, and export commands.
- Canvas view modes are `Artwork`, `Ink-aware`, and `Mockup`; the active mode is always labeled.

### Mobile

- The canvas remains the primary view.
- The tool rail becomes a stable bottom toolbar.
- The inspector opens as a bottom sheet for the active tool.
- Layers and product previews open as full-height drawers.
- Compare Board uses horizontally scrollable, equal-size previews rather than shrinking the canvas into unreadable tiles.
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

### Looks

Looks control aesthetic intent without encoding printer or garment assumptions. The initial set is:

- Clean photo.
- High contrast.
- Monochrome.
- Duotone.
- Posterized.
- Graphic halftone.
- Vintage ink.
- Distressed print.

Each Look is a named, deterministic recipe built from editable processing parameters. Applying a Look does not flatten the source or prevent later adjustment. Texture generation uses a stored seed so previews, saved projects, and final exports reproduce the same grain and distress pattern. Graphic halftone styles the whole design for aesthetic effect; it is distinct from the product-specific opaque halftone fade treatment below.

### Print Treatments

Print Treatments adapt a selected Look to a product's physical print size, substrate color, and DTG constraints. They are stored on the product variant and never mutate the design variation.

The initial specialized treatments are enabled for DTG garment presets. Other product types still receive applicable resolution, edge, contrast, and coverage findings, but do not expose garment-only fixes.

The initial treatment operations are:

- Opaque halftone fade: replace risky partial-alpha fades with fully opaque dots while preserving perceived tone.
- Garment-color knockout: remove colors close to the selected garment color so fabric can show through intentionally.
- Edge cleanup: remove low-alpha halos and near-solid edge backgrounds without flattening interior detail.
- Detail strengthening: thicken or simplify features that the minimum-detail heuristic predicts may disappear at the selected physical size.
- Limited-palette conversion: reduce colors for a cleaner graphic treatment while retaining an editable palette.

Treatments have plain-language presets first and technical controls under `More`. Halftone controls use target-DPI-aware line frequency, dot shape, angle, and threshold. Garment knockout uses a selected color and perceptual tolerance. Every automatic treatment shows what it will change before it is applied and can be reset independently.

InkMaster does not generate or export a separate white-underbase production file for Printify. Underbase behavior is used only to explain risk and produce an explicitly labeled visual approximation.

### Print Lens

Print Lens analyzes the selected product variant at its final physical size and overlays findings directly on the artwork. Findings use `Ready`, `Review`, or `Strong warning` and identify:

- Partial-alpha regions that can interact poorly with a dark-garment white underbase.
- Hidden rectangular backgrounds, edge haze, and low-alpha halos.
- Design colors and details likely to disappear into the selected substrate color.
- Text, lines, isolated components, and texture whose final pixel width is fragile at the target DPI. POD providers publish DPI guidance but no universal DTG minimum line width, so this finding is a labeled heuristic calibrated with fixed fixtures rather than a production pass/fail guarantee.
- Effective DPI and regions dependent on significant or extreme enlargement.
- Large solid-coverage regions that may produce a heavier-feeling print.

Coverage and ink-aware previews are heuristics, not printer simulations. They never claim exact ink volume, color matching, fabric behavior, or provider output. Each non-pass finding explains the limitation and offers a relevant reversible action when one exists.

### Compare Board

Compare Board displays two to four design variations using equal framing. It supports:

- Artwork view against a neutral background.
- Light- and dark-garment comparison.
- Ink-aware approximation with Print Lens findings.
- Photographic mockup comparison.
- Distance view that reduces the displayed product to approximate quick, across-the-room readability.

Compare Board is for choosing between variations. It does not create a separate approval, proof, or collaboration workflow.

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

- Use Pica in the final-render worker for high-quality local resampling. It must preserve alpha edges and perform no worse than the existing progressive renderer on fixed photo, transparency-edge, and graphic-art fixtures. If it fails this gate, retain the existing progressive renderer for the reset and defer the resampler replacement; do not fall back to raw browser canvas scaling.
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
  printTreatment: PrintTreatment;
}

interface PrintTreatment {
  halftone: HalftoneTreatment | null;
  garmentKnockout: GarmentKnockoutTreatment | null;
  edgeCleanup: EdgeCleanupTreatment | null;
  detailStrengthening: DetailStrengtheningTreatment | null;
  paletteLimit: PaletteLimitTreatment | null;
}
```

The concrete layer types contain stable IDs, visibility, ordering, opacity, transforms, deterministic texture seeds, and type-specific parameters. A trace layer references the source image layer and stores trace settings plus its regenerated SVG asset. A product variant references a design variation and never copies or mutates its layers. Its Print Treatment is an output adaptation applied during product rendering after placement scale is known and before the treated design is composited onto the final target canvas.

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

Each product variant stores placement and Print Treatment independently. Updating either cannot alter the design master or another product. A product variant begins with no treatment; Print Lens may recommend one, but it never applies a treatment without the user selecting the fix.

### Dark And Light Products

- T-shirt and hoodie previews support representative dark and light colors.
- Contrast and minimum-detail analysis run at the selected garment color, physical print size, and target DPI.
- Transparent export is the default for garments unless the user intentionally selects a solid design background.
- DTG-oriented edge guidance distinguishes safe full transparency from risky semi-transparent fades and unintended rectangular backgrounds.
- Dark-garment recommendations can propose opaque halftones or garment-color knockout instead of merely raising a warning.

### Mockup Assets

The 11 original photographic T-shirt blanks in `public/mockups` remain part of the product and define the visual-quality floor. The simplistic later SVG mockups for other products are not accepted as final reset assets. Hoodie, mug, and poster previews must use coherent, locally bundled, license-safe raster assets of comparable clarity before those mockups are considered complete.

Mockups are representative compositing previews. They must not imply exact scale, fabric texture, color matching, ink coverage, or provider rendering.

## Rendering And Data Flow

1. Decode the immutable source once and retain a local asset reference.
2. Build bounded preview rasters from the active variation without allocating product-size canvases on the main thread.
3. Apply layer transforms and deterministic adjustment/Look parameters in layer order.
4. Regenerate trace assets outside the main UI thread when trace parameters change.
5. Normalize the selected product placement into target pixels and calculate physical-size analysis inputs.
6. Run Print Lens on the placed design contribution and selected substrate color.
7. For ink-aware preview, render the product treatment and underbase-risk approximation at bounded resolution.
8. For final export, render the selected variation and placement at the target canvas size in a worker.
9. Apply local enlargement only where the source contribution requires it, then apply the product variant's Print Treatment at final target scale.
10. Encode the final PNG with target DPI metadata or return standalone SVG for an untreated vector-master export.
11. Parse and validate the actual generated file before enabling its final download receipt.

Preview and final rendering use the same normalized Look, placement, and treatment parameters so the preview does not silently diverge from export. Print Lens may use bounded analysis rasters, but all physical thresholds are calculated against final target pixels and DPI. Final export never waits for mockup generation.

## Architecture Boundaries

- **Application shell:** project selection, active variation, active product, and global commands.
- **Project repository:** versioned IndexedDB records, blobs, autosave, import, and export.
- **Editor state:** layer operations, selected tool, selection, and session undo/redo.
- **Render pipeline:** normalized layer composition shared by bounded preview and worker-backed final render.
- **Print analysis:** deterministic physical-size, alpha, edge, contrast, detail, and coverage findings with overlay geometry.
- **Print treatment engine:** reversible halftone, knockout, cleanup, detail, and palette transforms applied at product scale.
- **Comparison renderer:** shared framing for variation, substrate, ink-aware, distance, and mockup comparisons.
- **Trace engine:** adjustable SVG generation behind a worker-friendly interface.
- **Product catalog:** Printify-oriented presets, custom targets, and independent placement rules.
- **Mockup compositor:** representative preview composition only.
- **Export validation:** parses generated output and produces the validation receipt.

The current monolithic application component will be replaced by these bounded modules. Existing image processing, placement, upscaling, artwork analysis, quality confidence, mockup compositing, Printify specification, object URL, and print-file validation code may be reused after it is detached from production-job assumptions. Existing preflight logic is reused only as evidence and calculation primitives; production profiles, gates, acknowledgements, and operator terminology do not carry forward.

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
- Print Lens failure leaves editing and export available, marks analysis unavailable, and does not report a false pass.
- A treatment that cannot complete leaves the prior valid treatment preview and settings intact.
- Export failure does not download a lower-quality or partially generated file.
- Low resolution, extreme enlargement, contrast risk, semi-transparency risk, likely background edges, minimum-detail risk, and high coverage are warnings unless the output is invalid.
- Fix actions always preview their affected regions and require an explicit user action; warnings never mutate artwork automatically.
- A custom target rejects non-positive dimensions, unsupported formats, and unsafe canvas sizes before rendering.
- Blob URLs and worker resources are released when assets, projects, or operations are replaced.

## Accessibility And Interaction

- Every icon tool has an accessible name and tooltip.
- Canvas actions have equivalent numeric controls where practical.
- Tool selection, layer operations, undo, redo, and export are keyboard accessible.
- Focus returns predictably when drawers and bottom sheets close.
- Text and controls do not overlap at supported desktop and mobile widths.
- Progress, warning, and save states are announced without stealing focus.
- Print Lens overlays use labels and patterns in addition to color.
- Compare Board gives every variation an accessible name and preserves a logical keyboard order across view changes.

## Testing

### Unit And Integration

- Project schema validation and IndexedDB round trips.
- Portable project export/import, corruption rejection, and no partial import.
- Variation duplication and isolation.
- Session undo/redo scoped to the active variation.
- Layer ordering, visibility, transforms, and recipe reset behavior.
- Deterministic output and stable texture seeds for every Look.
- Trace regeneration, palette changes, and valid SVG output.
- Text styling and transform serialization.
- Independent product placements and Print Treatments referencing one design variation.
- Print Lens detection and overlay geometry for semi-transparency, halos, garment contrast, minimum detail, enlargement, and solid coverage.
- Print Lens findings at equivalent physical sizes across different pixel dimensions and DPI values, including calibrated minimum-detail fixture boundaries.
- Opaque halftone output with preserved perceived tone and no partial-alpha pixels in treated regions.
- Garment-color knockout tolerance, edge cleanup, detail strengthening, and palette-limit transforms.
- Treatment reset and proof that treatment changes never mutate the source variation.
- Seeded preview/final equivalence for grain, distress, and halftone patterns.
- Compare Board normalization across source aspect ratios and view modes.
- Printify target dimensions and custom-target validation.
- Local resampler quality fixtures, alpha-edge preservation, ratio metadata, and warning boundaries.
- Final PNG dimensions, DPI metadata, color type, transparency, and file-size receipt.
- Worker cancellation, timeout, retry, and resource cleanup.
- No active Gemini route, client call, browser key path, or AI control after removal.

### Browser Acceptance

- Upload a film still, apply a Look, adjust it, add text, and autosave.
- Compare at least three Looks on light and dark garments and select one without flattening the alternatives.
- Duplicate the variation, create a vector trace, recolor it, and download SVG.
- Place one variation independently on a dark shirt, light shirt, hoodie, mug, and poster.
- Inspect a semi-transparent fade in Print Lens, preview the affected pixels, convert it to an opaque halftone treatment, and reset the treatment.
- Inspect a near-black design on a black garment, apply garment-color knockout, and confirm the same master remains unchanged on a light garment.
- Switch among Artwork, Ink-aware, and Mockup views with persistent placement and no claim of exact printer simulation.
- Export a Printify T-shirt PNG and verify the generated receipt.
- Create and export a valid custom target.
- Reload and reopen the saved project with equivalent visual state.
- Export, remove, and re-import a portable project.
- Cancel and retry a large final export without losing edits.
- Complete the core workflow on desktop and mobile without overlapping controls.
- Confirm that production-job terminology and Advanced mode are absent.

## Research Basis

The differentiation and treatment rules are grounded in the following current product and print guidance:

- [Printify Product Creator](https://printify.com/product-creator/) establishes layers, text, background removal, AI generation, mockups, and product data as table-stakes rather than InkMaster differentiators.
- [Kittl AI Vectorizer](https://help.kittl.com/ai-tools/ai-vectorizer/) and [Photopea bitmap vectorization](https://www.photopea.com/learn/vg-vectorize) show that tracing alone is not a defensible product position.
- [Printify DTG gradient guidance](https://help.printify.com/hc/en-us/articles/4483625121681-Can-I-use-gradients-for-DTG-products) and [Printful transparency guidance](https://www.printful.com/transparency-in-dtg-files) support detecting partial-alpha fades and offering opaque halftone treatments for dark garments.
- [Printful DTG outcome guidance](https://help.printful.com/hc/en-us/articles/360019930999-Why-does-my-design-look-different-from-what-I-intended) supports distinguishing an ink-aware approximation from a normal screen mockup.
- [Printful DPI guidance](https://help.printful.com/hc/en-us/articles/360014067019-Is-there-a-difference-in-quality-between-150-and-300-DPI) recommends at least 150 DPI for DTG and 300 DPI for fine lines and text. It does not establish a universal DTG line-width threshold, so InkMaster's minimum-detail findings remain conservative heuristics rather than export blockers.
- [Pica](https://github.com/nodeca/pica) is the selected baseline for higher-quality local browser resampling, subject to the fixture quality gate above and without implying recovered source detail.

These references inform deterministic guidance and heuristics. They do not authorize claims that InkMaster exactly reproduces any provider's proprietary print pipeline.

## Success Criteria

- A novice can turn a source image into a distinct merch design and a valid POD file without learning print-shop workflow terminology.
- A user can see where a creative Look creates physical print risk and apply a relevant reversible fix without leaving the editor.
- One design variation can be reused across products while each product retains independent placement and treatment.
- Two to four variations can be compared across light and dark substrates without flattening or duplicating the source.
- The source image remains recoverable after every edit and failure.
- Preview interaction stays responsive while full-resolution work runs separately.
- Saved and exported seeded textures reproduce the approved preview.
- Exported PNG and SVG files match their declared dimensions and format.
- Original photographic shirt mockups remain available and other product mockups meet the same quality standard.
- The live application contains no production workbench or partial AI feature surface.
