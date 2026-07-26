# Upstream Product Guidance Integration Plan

**Goal:** Integrate the useful parts of upstream commit `a2fa3ffaa980b1f177a28fa53db0709ad7d46c85` into `fix/impeccable-priority-pass` while preserving the fork's simpler Basic workflow, accessibility work, image integrity, and layered Looks pipeline.

**Architecture:** Port behavior by feature rather than merging the upstream files wholesale. Extend the normalized T-shirt product model additively, keep detailed production choices in Advanced, reuse the existing export PNG as the authority for mockup proofs, and add pointer plus keyboard access to the existing Compare control.

**Tech Stack:** React 19.2.4, TypeScript 5.8.2, Vite 8.0.16, Tailwind CSS 3.4.17, Node 22.12 or newer, Node test with tsx 4.20.6, Playwright 1.61.1.

**Baseline:** `npm test` passed at `9cc3d104c43a4a68a51c2eac4913ea97d864452b` with a production build and 620 passing tests. Every preexisting implementation and test path named below is tracked at that commit; `editor/productProof.ts` and `tests/editor-product-proof.test.ts` are intentional additions. The full Playwright suite was not used as the planning baseline because its previous run was stopped during session wrap-up; every new browser contract therefore has a focused command before the final complete run.

**Non-Goals:** Do not merge upstream commit `a2fa3ff` wholesale. Do not add upstream's expanded Print Lens findings, garment-color coverage panel, or revised Trace goals. Do not expose DTF or cut vinyl in Basic. Do not add Oversized front to Basic. Do not change the layered Looks model, crop behavior, background-removal persistence, export dimensions, or the landing page.

**Assumptions:** Basic replaces Center artwork and Fit print area with Standard front and Left chest. Advanced shows Standard front, Left chest, and Oversized front plus the existing precision controls. DTG remains the default and is the only method implied in Basic. The additive `printMethod` field remains inside project schema 7 because missing and unsupported values normalize safely to DTG, and older builds ignore the extra serialized field.

## Global Constraints

- Preserve `Original` and `Applied finishes` Compare labels.
- Preserve every 44 pixel export action and visible focus treatment already present in the fork.
- Pointer-only behavior is insufficient. The Looks and Enhance before-and-after divider must support Arrow keys, with Shift plus Arrow for a larger step.
- Product Basic continues to lead with one readiness result and one recommended action.
- Print method controls and Oversized front remain Advanced-only.
- Every proof must be generated locally from the already-rendered PNG. No external service, upload, or provider request is introduced. Loading a bundled mockup from the same-origin public asset path is allowed.
- The proof is a visual estimate. The production PNG remains the production authority.
- Object URLs created for proof images must be revoked on replacement, close, and unmount.
- Existing ordered Looks must remain present in production PNGs and derived mockup proofs.
- Stage exact files only. Never stage `.codex/`, `AGENTS.md`, historical Impeccable reports, or unrelated plans.

## Definition of Done

- Artwork analysis reports partial transparency separately from fully transparent pixels.
- Existing schema 7 projects load with DTG, save an explicit print method, duplicate it with a variation, and undo or redo method changes.
- Basic offers Standard front and Left chest. Advanced additionally offers Oversized front and print method selection.
- Compare can be moved by the existing range input, direct pointer dragging, Arrow keys, and Shift plus Arrow keys.
- Export shows a plain-language production summary before generation.
- A completed PNG can produce and download a local garment mockup proof with an explicit proof-only warning, using the same garment-assigned variation shown on Product.
- Desktop and mobile focused browser tests pass, followed by `npm test` and `npm run test:e2e`.

## Risks

- **Persisted product compatibility:** A required `printMethod` field can break callers that construct product literals. Mitigate by updating all tracked fixtures, defaulting missing values to DTG, and testing normalization, duplication, reload, undo, and redo.
- **Proof geometry drift:** Applying placement twice can move or scale artwork incorrectly, while an unrotated crop can clip rotated artwork. Mitigate with a pure rotation-aware geometry contract that crops the complete placed artwork from the production PNG and maps it once into the garment printable region.
- **Proof URL leaks:** Repeated proof generation can retain blobs. Mitigate with one owned proof URL and explicit cleanup tests in the browser flow.
- **Inspector regression:** Copying upstream `ProductInspector.tsx` would restore the density this fork removed. Mitigate by adding only preset and method sections at the specified Basic and Advanced boundaries.
- **Compare control duplication:** The stage handle and bottom range share one position. Mitigate by keeping one state value and testing that either control updates the other.

## If Reality Diverges From This Plan

Stop and report. Do not improvise a fix.

This applies when a path or symbol does not match what the plan says, when a test fails for a reason the plan did not predict, when a step's expected output does not appear, or when a dependency behaves differently than described. Report what was found and what the plan expected, then wait.

---

## File Structure

- Modify `types.ts`, add `ArtworkAnalysis.partialTransparencyCoverage`.
- Modify `services/artworkAnalysis.ts`, measure partial alpha coverage.
- Modify `editor/productModel.ts`, own print-method normalization and persistence.
- Modify `editor/history.ts`, own undoable print-method changes.
- Modify `components/editor/ProductInspector.tsx`, own placement presets and Advanced print-method controls.
- Modify `components/editor/CanvasBeforeAfter.tsx`, own one synchronized Compare position across range, pointer, and keyboard input.
- Modify `components/editor/ProductExportDialog.tsx`, own the production summary and proof lifecycle.
- Modify `components/editor/EditorApp.tsx`, pass the garment-assigned Product variation to export.
- Create `editor/productProof.ts`, own proof geometry and local canvas rendering.
- Modify the nearest existing tests and add `tests/editor-product-proof.test.ts` for pure proof geometry.
- Modify `tests/e2e/canvas-editor.spec.ts`, verify integrated desktop and mobile behavior.

### Task 1: Artwork analysis distinguishes translucent edges from transparent pixels

**Depends on:** None

**Files:**
- Modify: `types.ts`, `ArtworkAnalysis`
- Modify: `services/artworkAnalysis.ts`, `analyzePixelData()`
- Test: `tests/artwork-analysis.test.ts`

**Interfaces:**
- Produce: `ArtworkAnalysis.partialTransparencyCoverage: number`
- Preserve: `hasTransparency` and `transparencyCoverage` semantics for alpha values below 32
- Count as partial transparency: sampled pixels with alpha from 32 through 222 inclusive

- [ ] **Step 1: Write the failing analysis test**

Add this test to `tests/artwork-analysis.test.ts`:

```ts
test("measures partial transparency separately from transparent pixels", () => {
  const data = pixels(4, 4, [20, 20, 20, 255]);
  for (let index = 0; index < 4; index += 1) data[index * 4 + 3] = 128;

  const analysis = analyzePixelData(data, 4, 4, 1200, 1200);

  assert.equal(analysis.hasTransparency, false);
  assert.equal(analysis.transparencyCoverage, 0);
  assert.equal(analysis.partialTransparencyCoverage, 0.25);
});
```

- [ ] **Step 2: Confirm the intended failure**

Run: `npx tsx --test tests/artwork-analysis.test.ts`

Expected: FAIL because `ArtworkAnalysis` and `analyzePixelData()` do not expose partial transparency. A TypeScript import or test collection failure does not satisfy this step.

- [ ] **Step 3: Implement the additive analysis field**

In `types.ts`, add the required numeric field beside `transparencyCoverage`.

In `analyzePixelData()`:

- Increment fully transparent coverage only through the existing alpha below 32 branch.
- Increment partial transparency after that branch when alpha is below 223.
- Divide by total sampled pixels and round to four decimal places, matching `transparencyCoverage`.
- Do not change palette, edge, contrast, or existing warning behavior in this task.

- [ ] **Step 4: Verify the focused contract**

Run: `npx tsx --test tests/artwork-analysis.test.ts`

Expected: PASS with five tests.

- [ ] **Step 5: Run the direct type check**

Run: `npm run typecheck`

Expected: PASS. If object literals elsewhere require the new field, add `partialTransparencyCoverage: 0` only to fixtures that directly construct `ArtworkAnalysis`.

- [ ] **Step 6: Commit**

Stage `types.ts`, `services/artworkAnalysis.ts`, `tests/artwork-analysis.test.ts`, plus any exact fixture path required by Step 5.

Suggested message: `feat: measure partial artwork transparency`

**Completion criteria:** Partial alpha coverage is available to later guidance without changing the existing transparent-background decision.

### Task 2: Print method persists as an undoable schema 7 product field

**Depends on:** None

**Files:**
- Modify: `editor/productModel.ts`, `TShirtProductVariant`, defaults, normalization, duplication
- Modify: `editor/history.ts`, `EditorCommand` and `reduceEditorHistory()`
- Test: `tests/editor-product-model.test.ts`
- Test: `tests/editor-history.test.ts`
- Test: `tests/editor-model.test.ts`, schema 7 product fixture
- Test: `tests/editor-repository.test.ts`, persisted project fixture if its exact product literals require the field

**Interfaces:**
- Produce: `const TSHIRT_PRINT_METHODS = ['dtg', 'dtf', 'vinyl'] as const`
- Produce: `type TShirtPrintMethod = typeof TSHIRT_PRINT_METHODS[number]`
- Produce: `normalizeTShirtPrintMethod(value: unknown): TShirtPrintMethod`
- Extend: `TShirtProductVariant.printMethod: TShirtPrintMethod`
- Produce command: `{ type: 'set-product-print-method'; printMethod: TShirtPrintMethod }`
- Preserve: `EDITOR_PROJECT_SCHEMA_VERSION === 7`

- [ ] **Step 1: Add failing product normalization tests**

Update the imports and add this test to `tests/editor-product-model.test.ts`:

```ts
test('normalizes print methods and defaults missing or unsupported values to DTG', () => {
  assert.equal(normalizeTShirtPrintMethod('dtg'), 'dtg');
  assert.equal(normalizeTShirtPrintMethod('dtf'), 'dtf');
  assert.equal(normalizeTShirtPrintMethod('vinyl'), 'vinyl');
  assert.equal(normalizeTShirtPrintMethod('embroidery'), 'dtg');
  assert.equal(normalizeTShirtPrintMethod(undefined), 'dtg');

  const legacy = normalizeTShirtProductVariants([{
    id: 'product-a',
    variationId: 'variation-a',
    type: 'tshirt',
    mockupSlug: 'white',
    placement: DEFAULT_PRODUCT_PLACEMENT,
  }], ['variation-a'], () => 'generated');

  assert.equal(legacy[0].printMethod, 'dtg');
});
```

- [ ] **Step 2: Add the failing undo contract**

Add this test to `tests/editor-history.test.ts`:

```ts
test('records a print method as one discrete no-op-aware product edit', () => {
  let history = makeHistory();
  const variationId = history.present.activeVariationId;

  history = reduceEditorHistory(history, {
    type: 'set-product-print-method',
    printMethod: 'vinyl',
  });
  const changed = history;
  history = reduceEditorHistory(history, {
    type: 'set-product-print-method',
    printMethod: 'vinyl',
  });

  assert.equal(history, changed);
  assert.equal(
    findTShirtProduct(history.present.productVariants, variationId).printMethod,
    'vinyl',
  );
  history = reduceEditorHistory(history, { type: 'undo' });
  assert.equal(
    findTShirtProduct(history.present.productVariants, variationId).printMethod,
    'dtg',
  );
  history = reduceEditorHistory(history, { type: 'redo' });
  assert.equal(
    findTShirtProduct(history.present.productVariants, variationId).printMethod,
    'vinyl',
  );
});
```

- [ ] **Step 3: Add schema 7 compatibility coverage**

In the existing schema 7 migration table in `tests/editor-model.test.ts`, inject one product with `printMethod: 'dtf'` and assert it remains `dtf`. Add a second schema 7 copy with the property removed and assert normalization produces `dtg` while preserving White, placement, color assignments, cumulative background picks, and the ordered Look stack.

- [ ] **Step 4: Confirm the intended failures**

Run: `npx tsx --test tests/editor-product-model.test.ts tests/editor-history.test.ts tests/editor-model.test.ts`

Expected: FAIL because products have no `printMethod` and history has no method command. Fixture or import failures do not satisfy this step.

- [ ] **Step 5: Implement the product field and command**

In `editor/productModel.ts`:

- Add the constant, type, set, and normalizer next to the mockup equivalents.
- Set `printMethod: 'dtg'` in `createDefaultTShirtProduct()`.
- Normalize `candidate.printMethod` in `normalizeTShirtProductVariants()`.
- Rely on the existing structured clone in `duplicateTShirtProduct()` to preserve the method, and add a duplication assertion.

In `editor/history.ts`:

- Add the command to `EditorCommand`.
- Normalize the requested method before comparing.
- No-op when stable.
- Record one variation edit so undo and redo use the existing product history path.

Do not bump schema 7. `migrateProjectFields()` already routes schemas 5 through 7 through `normalizeTShirtProductVariants()`, which supplies the compatibility default.

- [ ] **Step 6: Verify model, history, and persistence**

Run: `npx tsx --test tests/editor-product-model.test.ts tests/editor-history.test.ts tests/editor-model.test.ts tests/editor-repository.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

Stage every exact modified path named in this task.

Suggested message: `feat: persist product print methods`

**Completion criteria:** DTG is the backward-compatible default, supported methods persist, variation duplication preserves them, and undo or redo never affects sibling variations.

### Task 3: Placement presets simplify Basic and expand Advanced deliberately

**Depends on:** Task 2

**Files:**
- Modify: `components/editor/ProductInspector.tsx`, placement command helpers and inspector sections
- Test: `tests/editor-shell.test.ts`
- Test: `tests/e2e/canvas-editor.spec.ts`

**Interfaces:**
- Produce: `type ProductPlacementPresetId = 'standard-front' | 'left-chest' | 'oversized-front'`
- Produce: `createProductPlacementPresetCommand(presetId: ProductPlacementPresetId): EditorCommand`
- Preset values:
  - Standard front: `{ x: 0.5, y: 0.5, scale: 0.72, rotation: 0 }`
  - Left chest: `{ x: 0.28, y: 0.27, scale: 0.32, rotation: 0 }`
  - Oversized front: `{ x: 0.5, y: 0.52, scale: 1.05, rotation: 0 }`

- [ ] **Step 1: Replace the old button assertions with mode-aware preset assertions**

In the Product inspector tests in `tests/editor-shell.test.ts`, create Basic and Advanced markup using the existing fixture, then add:

```ts
assert.match(basic, />Standard front<\/button>/);
assert.match(basic, />Left chest<\/button>/);
assert.doesNotMatch(basic, />Oversized front<\/button>/);
assert.doesNotMatch(basic, />Center artwork<\/button>/);
assert.doesNotMatch(basic, />Fit print area<\/button>/);

assert.match(advanced, />Standard front<\/button>/);
assert.match(advanced, />Left chest<\/button>/);
assert.match(advanced, />Oversized front<\/button>/);
assert.deepEqual(createProductPlacementPresetCommand('left-chest'), {
  type: 'set-product-placement',
  placement: { x: 0.28, y: 0.27, scale: 0.32, rotation: 0 },
  historyGroup: 'product-preset:left-chest',
});
```

- [ ] **Step 2: Confirm the intended component failure**

Run: `npx tsx --test tests/editor-shell.test.ts`

Expected: FAIL because Basic still exposes Center artwork and Fit print area and no preset command exists.

- [ ] **Step 3: Implement preset placement without adding inspector density**

In `ProductInspector.tsx`:

- Replace `createCenterProductPlacementCommand()` with the preset table and `createProductPlacementPresetCommand()`.
- Keep `createResetProductPlacementCommand()` for the header Reset action.
- In Basic, render Standard front and Left chest only.
- In Advanced, render all three presets before X, Y, Scale, and Rotation.
- Dispatch `end-history-group` after a preset so each click is one undo step.
- Use the existing `actionClass`, which already provides 44 pixel height and focus treatment.

- [ ] **Step 4: Add a focused browser persistence case**

Add this test to `tests/e2e/canvas-editor.spec.ts` using the existing `uploadTransparentFixture()` and persisted workspace reader:

```ts
test('Product placement presets stay simple in Basic and persist after reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/editor');
  await uploadTransparentFixture(page, 4000, 4000, 'product-presets.png');
  await page.getByRole('button', { name: 'Product', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Standard front', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Left chest', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Oversized front', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Left chest', exact: true }).click();

  await page.reload();
  await page.getByRole('button', { name: 'Open local projects', exact: true }).click();
  await page.getByRole('dialog').getByRole('button').filter({ hasText: 'product-presets' }).click();
  await page.getByRole('button', { name: 'Product', exact: true }).click();
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Oversized front', exact: true })).toBeVisible();
  await expect(page.getByLabel('X position', { exact: true })).toHaveValue('28');
  await expect(page.getByLabel('Y position', { exact: true })).toHaveValue('27');
  await expect(page.getByLabel('Scale', { exact: true })).toHaveValue('32');
});
```

- [ ] **Step 5: Verify component and browser behavior**

Run: `npx tsx --test tests/editor-shell.test.ts`

Run: `npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "Product placement presets stay simple in Basic and persist after reload"`

Expected: PASS.

- [ ] **Step 6: Commit**

Stage `components/editor/ProductInspector.tsx`, `tests/editor-shell.test.ts`, and `tests/e2e/canvas-editor.spec.ts`.

Suggested message: `feat: add focused product placement presets`

**Completion criteria:** Basic presents two safe starting points, Advanced adds the higher-risk option, and selection persists without changing garment color or Looks.

### Task 4: Looks and Enhance before-and-after divider supports pointer and keyboard manipulation

**Depends on:** None

**Files:**
- Modify: `components/editor/CanvasBeforeAfter.tsx`, synchronized divider controls
- Test: `tests/e2e/canvas-editor.spec.ts`

**Interfaces:**
- Preserve: bottom `input[aria-label="Before and after position"]`
- Produce: stage control `role="slider"`, `aria-label="Before and after divider"`, range 0 through 100
- Keyboard steps: Arrow keys move 1 percentage point; Shift plus Arrow moves 10
- Pointer behavior: clamp against the stage bounds, use pointer capture, and update the same `position` state

- [ ] **Step 1: Add the failing focused browser test**

Add this test beside the existing Compare cases in `tests/e2e/canvas-editor.spec.ts`:

```ts
test('Before and after divider stays synchronized across pointer and keyboard controls', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 844 });
  await page.goto('/editor');
  await uploadFixture(page, 1200, 900, 'compare-divider.png');
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  await page.getByRole('button', { name: 'Looks', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Finish comparison', exact: true })).toBeVisible();

  const divider = page.getByRole('slider', { name: 'Before and after divider', exact: true });
  const range = page.getByLabel('Before and after position', { exact: true });
  await expect(divider).toHaveAttribute('aria-valuenow', '50');
  await divider.focus();
  await divider.press('ArrowRight');
  await expect(range).toHaveValue('51');
  await divider.press('Shift+ArrowLeft');
  await expect(range).toHaveValue('41');

  const bounds = await divider.boundingBox();
  if (!bounds) throw new Error('Before and after divider bounds are unavailable.');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 120, bounds.y + bounds.height / 2);
  await page.mouse.up();
  await expect.poll(async () => Number(await range.inputValue())).toBeGreaterThan(41);
});
```

- [ ] **Step 2: Confirm the intended browser failure**

Run: `npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "Before and after divider stays synchronized across pointer and keyboard controls"`

Expected: FAIL because the Looks before-and-after stage has no interactive divider. Failure to import artwork, enter Advanced, or open Looks does not satisfy this step.

- [ ] **Step 3: Implement one divider state with two accessible controls**

In `CanvasBeforeAfter.tsx`:

- Add a ref to the preview stage and a ref for active pointer authority.
- Derive position from `clientX` and the stage bounding rectangle.
- Clamp to 0 through 100.
- Add a 44 by 44 stage handle with `role="slider"`, `tabIndex={0}`, `aria-valuemin`, `aria-valuemax`, and rounded integer `aria-valuenow`.
- Handle ArrowLeft and ArrowDown as negative, ArrowRight and ArrowUp as positive.
- End pointer authority on up, cancel, or lost capture.
- Keep the bottom native range synchronized to the same state.
- Keep `Original` and `Applied finishes` labels unchanged.
- Show the existing interaction language in a compact focus-visible hint: `Arrow keys move. Shift moves farther.`

- [ ] **Step 4: Verify desktop and mobile control size**

Extend the focused test with a 390 by 844 viewport check that the divider bounding box is at least 44 by 44 and the bottom range remains within the viewport.

Run: `npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "Before and after divider stays synchronized across pointer and keyboard controls"`

Expected: PASS.

- [ ] **Step 5: Commit**

Stage `components/editor/CanvasBeforeAfter.tsx` and `tests/e2e/canvas-editor.spec.ts`.

Suggested message: `feat: make before-and-after comparison accessible`

**Completion criteria:** Pointer, keyboard, and range input all control the same Looks or Enhance divider position without changing project persistence or Look rendering. The separate multi-variation Compare Board remains unchanged.

### Task 5: Advanced print-method selection stays out of Basic

**Depends on:** Task 2 and Task 3

**Files:**
- Modify: `components/editor/ProductInspector.tsx`, Advanced print-method section
- Test: `tests/editor-shell.test.ts`
- Test: `tests/e2e/canvas-editor.spec.ts`

**Interfaces:**
- Consume: `TShirtPrintMethod`
- Consume command: `{ type: 'set-product-print-method'; printMethod: TShirtPrintMethod }`
- Options and plain-language descriptions:
  - DTG: `Detailed, full-color artwork printed directly on the shirt.`
  - DTF transfer: `Durable full-color transfer for light and dark shirts.`
  - Cut vinyl: `Best for bold artwork with one or two solid colors.`

- [ ] **Step 1: Add mode-boundary assertions**

In `tests/editor-shell.test.ts`, extend the Basic and Advanced Product markup test:

```ts
assert.doesNotMatch(basic, /aria-label="Print method"/);
assert.doesNotMatch(basic, /DTF transfer/);
assert.doesNotMatch(basic, /Cut vinyl/);

assert.match(advanced, /aria-label="Print method"/);
assert.match(advanced, />DTG</);
assert.match(advanced, />DTF transfer</);
assert.match(advanced, />Cut vinyl</);
```

- [ ] **Step 2: Confirm the intended component failure**

Run: `npx tsx --test tests/editor-shell.test.ts`

Expected: FAIL because no print-method UI exists.

- [ ] **Step 3: Implement the Advanced-only method selector**

In `ProductInspector.tsx`:

- Import `TShirtPrintMethod`.
- Add the three method definitions beside the placement presets.
- Render a fieldset only when `mode === 'advanced'`.
- Use a radio group with one 44 pixel row per method, the method name, and the description above.
- Dispatch `set-product-print-method` on selection.
- Do not add method-specific readiness claims or Print Lens findings in this plan.

- [ ] **Step 4: Extend the preset browser case**

After switching to Advanced in the Task 3 browser case:

```ts
await page.getByRole('radio', { name: 'DTF transfer', exact: true }).check();
await page.reload();
await page.getByRole('button', { name: 'Open local projects', exact: true }).click();
await page.getByRole('dialog').getByRole('button').filter({ hasText: 'product-presets' }).click();
await page.getByRole('button', { name: 'Product', exact: true }).click();
await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
await expect(page.getByRole('radio', { name: 'DTF transfer', exact: true })).toBeChecked();
```

- [ ] **Step 5: Verify the UI and persistence seam**

Run: `npx tsx --test tests/editor-shell.test.ts tests/editor-history.test.ts tests/editor-product-model.test.ts`

Run: `npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "Product placement presets stay simple in Basic and persist after reload"`

Expected: PASS.

- [ ] **Step 6: Commit**

Stage `components/editor/ProductInspector.tsx`, `tests/editor-shell.test.ts`, and `tests/e2e/canvas-editor.spec.ts`.

Suggested message: `feat: add advanced print method selection`

**Completion criteria:** Basic remains unchanged in density, while Advanced can persist and restore each supported method.

### Task 6: Export presents a production summary before generation

**Depends on:** Task 2 and Task 5

**Files:**
- Modify: `components/editor/ProductExportDialog.tsx`, summary model and markup
- Modify: `components/editor/EditorApp.tsx`, Product export variation authority
- Test: `tests/editor-product-export-dialog.test.ts`
- Test: `tests/editor-shell.test.ts`, exported variation wiring source assertion

**Interfaces:**
- Produce: `getProductExportSummary(product, variation, presetId)`
- Consume: `productArtworkVariation`, the existing variation resolved from `product.colorVariationIds[product.mockupSlug]` with active-variation fallback
- Return:

```ts
{
  garment: string;
  method: 'DTG' | 'DTF transfer' | 'Cut vinyl';
  artwork: string;
  printSize: string;
  placement: string;
}
```

- [ ] **Step 1: Add the failing summary contract**

Update the dialog test import and add:

```ts
const product = findTShirtProduct(project.productVariants, variation.id);
product.mockupSlug = 'white';
product.printMethod = 'dtf';
product.placement = { x: 0.28, y: 0.27, scale: 0.32, rotation: 0 };

assert.deepEqual(getProductExportSummary(
  product,
  variation,
  'printify-full-front',
), {
  garment: 'White',
  method: 'DTF transfer',
  artwork: 'Original',
  printSize: '15 x 18 in',
  placement: '32% size, 28% across, 27% down',
});
assert.match(markup, /Production summary/);
assert.match(markup, /DTF transfer/);
```

Ensure the mutated `product` is passed to the existing static dialog render.

- [ ] **Step 2: Confirm the intended failure**

Run: `npx tsx --test tests/editor-product-export-dialog.test.ts`

Expected: FAIL because the summary helper and markup do not exist.

- [ ] **Step 3: Implement the summary without changing export authority**

In `ProductExportDialog.tsx`:

- Import `getTShirtMockup()` and `getTShirtExportPreset()`.
- Map the three persisted method IDs to the exact display names in the interface.
- Format placement using rounded percentages and the plain labels `size`, `across`, and `down`.
- Render a `Production summary` section before the preset radio group with Garment, Method, Artwork, Print size, and Placement.
- Preserve existing export copy, presets, receipts, 44 pixel controls, and focus behavior.

In `EditorApp.tsx`, pass `productArtworkVariation` to `ProductExportDialog` instead of the active `variation`. Keep the active product record as the source of garment, method, and placement. This makes Product preview, summary, PNG rendering, and proof generation share one artwork authority when a garment color has an assigned variation.

- [ ] **Step 4: Verify dialog and shell coverage**

In `tests/editor-shell.test.ts`, extend the existing source-boundary assertions to require `variation={productArtworkVariation}` at the `ProductExportDialog` call and reject `variation={variation}` on that call.

Run: `npx tsx --test tests/editor-product-export-dialog.test.ts tests/editor-shell.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Stage `components/editor/ProductExportDialog.tsx`, `components/editor/EditorApp.tsx`, `tests/editor-product-export-dialog.test.ts`, and `tests/editor-shell.test.ts`.

Suggested message: `feat: summarize production choices before export`

**Completion criteria:** Users can confirm garment, method, artwork, dimensions, and placement before rendering a file.

### Task 7: Completed production PNGs can create local mockup proofs

**Depends on:** Task 3, Task 5, and Task 6

**Files:**
- Create: `editor/productProof.ts`, pure geometry and browser renderer
- Modify: `components/editor/ProductExportDialog.tsx`, proof state, generation, download, cleanup
- Create: `tests/editor-product-proof.test.ts`
- Modify: `tests/editor-product-export-dialog.test.ts`
- Modify: `tests/e2e/canvas-editor.spec.ts`

**Interfaces:**
- Produce: `resolveProductProofGeometry(product: TShirtProductVariant, preset: TShirtExportPreset, canvasSize: Size, printableRegion: ProductPrintableRegion): { source: Rect; destination: Rect }`
- Produce: `createProductProofMockup(product, printFileUrl, presetId): Promise<{ blob: Blob; url: string }>`
- Produce: `createProofUrlOwner(revoke: (url: string) => void): { current(): string | null; replace(url: string | null): void; clear(): void }`
- Source rectangle: the rotation-aware axis-aligned envelope around the square returned by `resolveTShirtExportGeometry()` in production-PNG coordinates
- Destination rectangle: the same rotation-aware envelope mapped into the garment printable region
- Maximum proof canvas edge: 1800 pixels

- [ ] **Step 1: Write the failing pure geometry test**

Create `tests/editor-product-proof.test.ts`:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_TSHIRT_PRINTABLE_REGION } from '../editor/productCatalog';
import { DEFAULT_PRODUCT_PLACEMENT, createDefaultTShirtProduct } from '../editor/productModel';
import { createProofUrlOwner, resolveProductProofGeometry } from '../editor/productProof';
import { getTShirtExportPreset } from '../editor/tshirtExportModel';

test('maps one placed production PNG region into the garment print area', () => {
  const product = createDefaultTShirtProduct('variation-a', 'product-a');
  product.placement = { ...DEFAULT_PRODUCT_PLACEMENT, x: 0.28, y: 0.27, scale: 0.32 };

  const geometry = resolveProductProofGeometry(
    product,
    getTShirtExportPreset('printify-full-front'),
    { width: 1200, height: 1200 },
    DEFAULT_TSHIRT_PRINTABLE_REGION,
  );

  assert.deepEqual(geometry.source, {
    x: 540,
    y: 738,
    width: 1440,
    height: 1440,
  });
  assert.deepEqual(geometry.destination, {
    x: 454.08,
    y: 387.12,
    width: 122.88,
    height: 122.88,
  });
});

test('expands source and destination bounds so rotated artwork is not clipped', () => {
  const product = createDefaultTShirtProduct('variation-a', 'product-a');
  product.placement = {
    ...DEFAULT_PRODUCT_PLACEMENT,
    x: 0.28,
    y: 0.27,
    scale: 0.32,
    rotation: 45,
  };

  const geometry = resolveProductProofGeometry(
    product,
    getTShirtExportPreset('printify-full-front'),
    { width: 1200, height: 1200 },
    DEFAULT_TSHIRT_PRINTABLE_REGION,
  );

  assert.ok(Math.abs(geometry.source.width - 2036.46753) < 0.00001);
  assert.ok(Math.abs(geometry.source.height - 2036.46753) < 0.00001);
  assert.ok(Math.abs(geometry.destination.width - 173.778613) < 0.00001);
  assert.ok(Math.abs(geometry.destination.height - 173.778613) < 0.00001);
});

test('revokes each owned proof URL exactly once', () => {
  const revoked: string[] = [];
  const owner = createProofUrlOwner((url) => revoked.push(url));

  owner.replace('blob:first');
  owner.replace('blob:second');
  assert.equal(owner.current(), 'blob:second');
  assert.deepEqual(revoked, ['blob:first']);

  owner.clear();
  owner.clear();
  assert.equal(owner.current(), null);
  assert.deepEqual(revoked, ['blob:first', 'blob:second']);
});
```

- [ ] **Step 2: Confirm the intended geometry failure**

Run: `npx tsx --test tests/editor-product-proof.test.ts`

Expected: FAIL because `editor/productProof.ts` does not exist. A test loader failure unrelated to that missing module does not satisfy this step.

- [ ] **Step 3: Implement pure geometry first**

In new `editor/productProof.ts`:

- Import `getTShirtMockup`, `resolveProductRegionRect`, `resolveProductArtworkGeometry`, `getTShirtExportPreset`, and `resolveTShirtExportGeometry`.
- Calculate `rotationEnvelope = abs(cos(rotation)) + abs(sin(rotation))`.
- Multiply both the export rendered side and the garment destination side by `rotationEnvelope` so a 45 degree placement uses a square-root-of-two envelope and does not clip corners.
- Use the export geometry center to define the source envelope around already-positioned artwork in the production PNG.
- Use the product geometry center to define the destination envelope inside the rendered garment image.
- Round geometry to at most six decimals, matching `editor/productGeometry.ts`.
- Do not apply placement or rotation a second time. The production PNG has already rendered the layer stack and rotation.
- Implement `createProofUrlOwner()` as an independent ownership primitive. Replacing a URL revokes the previous URL, clearing revokes the current URL, and repeated clear calls no-op.

- [ ] **Step 4: Verify geometry**

Run: `npx tsx --test tests/editor-product-proof.test.ts`

Expected: PASS.

- [ ] **Step 5: Implement the local browser renderer**

In `createProductProofMockup()`:

- Load the selected local mockup and generated PNG URL with `Image`.
- Scale the garment canvas so its longest edge is at most 1800 pixels.
- Draw the garment normally, preserving its existing pixels and transparency.
- Draw the production PNG into a transparent intermediate crop canvas offset by the source envelope. This safely clips envelopes that extend beyond the PNG without distorting their corresponding destination.
- Draw the complete intermediate crop canvas into the destination envelope from `resolveProductProofGeometry()`.
- Encode PNG with `canvas.toBlob()`.
- Return one Blob and one object URL.
- Throw the plain error `Could not create the mockup proof.` for image, context, or encoding failures.

- [ ] **Step 6: Add proof lifecycle UI**

In `ProductExportDialog.tsx`:

- Enable `Create mockup proof` only after the production PNG state is ready.
- Show creating, ready, and failed states with `role="status"` or `role="alert"`.
- Show the proof image with alt text based on the selected garment.
- Show: `Proof only. This mockup estimates placement and garment color. Use the PNG for production.`
- Provide a 44 pixel `Download mockup proof` action.
- Revoke the previous URL before replacement, when export is reset, when the dialog closes, and on unmount.
- Clear proof state whenever preset, placement, variation, garment, method, or a new export render changes the production authority.
- Hold the proof URL through `createProofUrlOwner(URL.revokeObjectURL)`. State may describe status, but it must not become a second URL owner.

- [ ] **Step 7: Add the dialog-state static contract**

In `tests/editor-product-export-dialog.test.ts`, assert the initial render contains `Production summary` and does not contain `Download mockup proof`. This confirms proof actions do not appear before a production PNG exists. The `createProofUrlOwner()` test from Step 1 is the deterministic cleanup contract for replacement, close, and unmount paths used by the component.

- [ ] **Step 8: Extend the real export browser case**

In `@phase3b-acceptance generates a validated transparent T-shirt PNG from the product editor`, after the existing PNG is ready and before closing:

Before `page.goto('/editor')`, install a revocation observer:

```ts
await page.addInitScript(() => {
  const original = URL.revokeObjectURL.bind(URL);
  const target = window as typeof window & { __revokedProofUrls: string[] };
  target.__revokedProofUrls = [];
  URL.revokeObjectURL = (url) => {
    target.__revokedProofUrls.push(url);
    original(url);
  };
});
```

Then extend the ready-state flow:

```ts
const createProof = dialog.getByRole('button', { name: 'Create mockup proof', exact: true });
await expect.poll(async () => (await createProof.boundingBox())?.height).toBeGreaterThanOrEqual(44);
await createProof.click();
await expect(dialog.getByRole('img', { name: /mockup proof/ })).toBeVisible();
await expect(dialog).toContainText('Proof only. This mockup estimates placement and garment color. Use the PNG for production.');

const proofDownloadPromise = page.waitForEvent('download');
const downloadProof = dialog.getByRole('button', { name: 'Download mockup proof', exact: true });
await expect.poll(async () => (await downloadProof.boundingBox())?.height).toBeGreaterThanOrEqual(44);
await downloadProof.click();
const proofDownload = await proofDownloadPromise;
expect(proofDownload.suggestedFilename()).toMatch(/-mockup-proof\.png$/);
const proofPath = await proofDownload.path();
if (!proofPath) throw new Error('The mockup proof download is unavailable.');
const proofBytes = readFileSync(proofPath);
expect([...proofBytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

const firstProofUrl = await dialog.getByRole('img', { name: /mockup proof/ }).getAttribute('src');
if (!firstProofUrl) throw new Error('The first mockup proof URL is unavailable.');
await dialog.getByRole('radio', { name: /Standard Tee/ }).check();
await expect(dialog.getByRole('img', { name: /mockup proof/ })).toHaveCount(0);
await expect(dialog.getByRole('button', { name: 'Download mockup proof', exact: true })).toHaveCount(0);
await expect.poll(async () => page.evaluate(() => (
  window as typeof window & { __revokedProofUrls: string[] }
).__revokedProofUrls)).toContain(firstProofUrl);
```

Regenerate the Standard Tee PNG and one proof, record its image URL, close the dialog, and assert the revocation observer contains that second URL. The unit owner test covers repeated clear and replacement idempotence; this browser assertion proves the dialog actually calls the owner on preset invalidation and close. Keep the component unmount cleanup in a `useEffect` return using the same `clear()` method.

Add a second focused browser case named `Product export uses the garment-assigned variation for PNG and proof`:

1. Import transparent 4000 by 4000 artwork.
2. Duplicate the variation and rename it `White proof artwork`.
3. Add Duotone to that duplicate so it has a nonempty ordered Look stack.
4. Return to the original variation, open Product, select White, switch to Advanced, and assign `White proof artwork` through `Artwork for White`.
5. Open export and assert the Production summary Artwork value is `White proof artwork`, not `Original`.
6. Generate a Draft Proof PNG and a mockup proof, download both, and assert both PNG signatures.
7. Reload the project and assert White still resolves to the assigned variation with its Duotone stack before reopening export.

This case proves the seam between `productArtworkVariation`, the export renderer, the proof renderer, garment assignment persistence, and ordered Looks.

- [ ] **Step 9: Verify focused proof behavior**

Run: `npx tsx --test tests/editor-product-proof.test.ts tests/editor-product-export-dialog.test.ts tests/editor-tshirt-export-model.test.ts tests/editor-tshirt-export-renderer.test.ts`

Run: `npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "@phase3b-acceptance generates a validated transparent T-shirt PNG from the product editor"`

Run: `npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "Product export uses the garment-assigned variation for PNG and proof"`

Expected: PASS, including actual PNG signatures for both downloads.

- [ ] **Step 10: Commit**

Stage `editor/productProof.ts`, `components/editor/ProductExportDialog.tsx`, `tests/editor-product-proof.test.ts`, `tests/editor-product-export-dialog.test.ts`, and `tests/e2e/canvas-editor.spec.ts`.

Suggested message: `feat: create local product mockup proofs`

**Completion criteria:** A production PNG with its crop and ordered Looks can generate one local proof, proof URLs are cleaned up, and production authority remains explicit.

## Acceptance

**Automated:**

Run: `npm test`

Expected: Type checking, production build, reachability checks, and every unit or component test pass.

Run each focused browser group first:

```text
npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "Product placement presets stay simple in Basic and persist after reload"
npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "Before and after divider stays synchronized across pointer and keyboard controls"
npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "@phase3b-acceptance generates a validated transparent T-shirt PNG from the product editor"
npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "Look stacks remain ordered across preview and export"
```

Expected: All pass.

Run: `npm run test:e2e`

Expected: Every Playwright test passes. Use a long command timeout because real PNG generation is intentionally slow. If the runner stops making progress, capture the exact active test and process state before terminating it. Do not call an interrupted suite a pass.

**Integration:**

1. Import 4000 by 4000 transparent artwork in Basic at 390 by 844.
2. Add Duotone and Distressed Print with different strengths.
3. Open Product and confirm only Standard front and Left chest placement presets are visible.
4. Select White and Left chest, reload the saved project, and confirm garment and placement persist.
5. Switch to Advanced and confirm Oversized front, DTG, DTF transfer, and Cut vinyl are visible.
6. Select DTF transfer, undo, redo, reload, and confirm the final method persists.
7. Open Looks. Drag the before-and-after divider, use Arrow keys, then Shift plus Arrow. Confirm the native range follows the same position and labels remain Original and Applied finishes.
8. Open the PNG export. Confirm the production summary matches White, DTF transfer, active artwork, output size, and Left chest placement.
9. Generate the production PNG. Confirm its ordered Looks and crop match Product.
10. Generate and download the mockup proof. Confirm the warning calls it a proof estimate and both downloads are valid PNG files.

**Manual:**

- At 390 by 844, confirm the Product inspector and export dialog have no horizontal overflow and every action is at least 44 pixels high.
- At 768 by 1024, 1280 by 800, and 1440 by 900, confirm the before-and-after handle remains inside the preview and does not cover Original or Applied finishes labels.
- Tab through the before-and-after handle, method radios, placement presets, export controls, and proof download. Correct behavior is a visible focus ring and a logical order.
- Confirm Basic still leads with readiness and one recommended action before garment and placement choices.
- Confirm the mockup proof visually matches the selected garment, placement, crop, and ordered Looks.

**Rollout and recovery:**

- Land Tasks 1 through 7 in order. Tasks 1 and 4 are independent, but sequential landing keeps review simple.
- If print-method normalization fails, revert Task 2 and every dependent task, leaving partial transparency and Compare intact.
- If proof geometry fails, revert Task 7 only. Production PNG export remains unchanged.
- Do not merge upstream `a2fa3ff` after these tasks. Its useful behavior will have been ported and the five original text conflicts will remain intentionally unresolved.
- Before pushing, run `git diff --check`, `git status --short`, and inspect every staged path explicitly.

---

**For agentic workers:** REQUIRED SUB-SKILL: Use `$executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking. Review the diff and verification result at every task boundary before continuing.
