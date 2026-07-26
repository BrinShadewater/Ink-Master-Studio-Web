# Editor Workflow, Image Integrity, and Layered Looks Implementation Plan

**Goal:** Resolve the remaining Impeccable critique findings and the confirmed
editor workflow defects without redesigning the site or replacing its visual
identity.

**Architecture:** Four ordered passes. Pass 1 simplifies navigation and fixes
interaction accessibility. Pass 2 corrects crop and background-removal data
integrity. Pass 3 replaces the single Look recipe with a reorderable stack that
allows one instance of each preset. Pass 4 runs complete regression, browser,
Impeccable audit, and Impeccable critique verification. The work stays inside
the current React editor, browser-local persistence, and worker architecture.

**Tech Stack:** React 19.2.4, React DOM 19.2.4, TypeScript 5.8.2, Vite 8.0.16,
Tailwind CSS 3.4.17, Lucide React 1.25.0, Node 22.12 or newer, Node test runner,
tsx 4.20.6, and Playwright 1.61.1. Versions are confirmed in `package.json` and
`package-lock.json`.

**Baseline:** Run on 2026-07-26 from branch
`fix/impeccable-priority-pass` at `a02efaf`.

Run: `npm test`

Result: PASS. Type checking passed, the production build passed, and 600 tests
passed with 0 failures. Every implementation file named in this plan is tracked,
committed, and clean. Before this plan was created, the untracked paths were
`.codex/`, `AGENTS.md`, and two `.impeccable/critique/` reports. The plan file is
also untracked while planning remains in progress. None overlaps implementation
scope.

The full `npm run test:e2e` suite is not a baseline gate because it exceeded both
the initial 124 second planning run and a second 364 second run, with no result,
and has a documented history of taking more than ten minutes. Each task therefore
uses focused Playwright cases, and Task 13 runs the full suite with a long timeout
and records any pre-existing failures.

**Non-Goals:**

- No landing-page redesign.
- No product types beyond T-shirts in this pass. Hoodies, mugs, totes, hats,
  posters, and custom products require a separate product-model and export plan.
- No cloud save location. "Saved locally" continues to mean saved in this
  browser.
- No duplicate instances of the same Look preset.
- No new dependencies, AI features, account system, or server persistence.
- No visual changes outside the editor surfaces required by these findings.

**Assumptions:**

1. Basic mode shows Select, one contextual preparation command, Product, Layers,
   and More. Crop is the default preparation command. If a specialist command is
   active, that active command occupies the preparation slot until the user
   leaves it.
2. More contains Adjust, Enhance resolution, Remove background, Trace, and
   Looks. Selecting one closes More and opens that inspector.
3. Product mode does not disable the other editor commands. Choosing another
   command exits Product naturally.
4. Arrange movement remains available directly on the design canvas. Rotation,
   opacity, flips, scale, and numeric positions are Advanced controls.
5. The white shirt reuses the tracked `public/landing-tee-white.webp` asset and
   the existing T-shirt printable region.
6. A Look stack contains at most one instance of each non-Original preset.
   Array order is application order, first item first. Original is represented
   by an empty stack.
7. Look reordering uses explicit Move earlier and Move later buttons. This is
   keyboard accessible and avoids adding a drag-and-drop dependency.
8. Background-removal picks and correction strokes use coordinates normalized
   to the uncropped source image. Crop is applied when rendering, after cleanup.

## Global Constraints

- Preserve the existing dark technical visual language and current tokens.
- Every interactive target in scope must be at least 44 by 44 CSS pixels.
- Every canvas keyboard operation must expose `aria-keyshortcuts`, visible focus,
  plain-English help, and one undo step per key sequence.
- Basic and Advanced must never hide the workflow recommendation. Advanced
  reveals controls, it does not remove guidance.
- Saved-project migrations must be lossless for all fields that existed before
  this work. Migration tests must load schema versions 1 through 7.
- Background removal, preview Looks, and export Looks must remain worker-backed.
- Crop changes must not schedule a new background-removal worker request.
- All generated asset publication retains stale-result authority checks.
- No new dependency and no package-lock change.
- Stage files by exact path. Never use `git add .` or `git add -A`.
- Do not include `Co-Authored-By: Codex` in a commit message.
- If a task result contradicts this plan, stop and report before continuing.

## Definition of Done

- Product is the third visible Basic command at 390 by 844 without horizontal
  toolbar scrolling.
- Basic exposes Select, the contextual preparation command, Product, Layers,
  and More. Specialist commands are available from More.
- Product canvas movement and resizing work with Arrow keys. Shift uses the
  larger step. The resize handle is at least 44 pixels.
- Design canvas, Product canvas, crop frame, and crop handles have visible
  keyboard focus. The keyboard hint appears when the relevant canvas receives
  focus.
- Export dialog close, create, cancel, download, and reset targets are at least
  44 pixels.
- The top bar does not overlap or truncate its project, save, variation, mode,
  and command groups at 390, 768, 1024, 1280, and 1440 pixel widths.
- Basic Product leads with readiness and one recommended action. Print checks,
  preview intent, artwork mapping, and precise placement are Advanced.
- White appears as a working shirt choice.
- Crop ratios change the crop rectangle without stretching the artwork.
- Cropping does not rerun or alter completed background removal.
- Multiple picked colors remain removed after Done, after another pick, after
  reload, and after crop changes.
- Tolerance, edge feather, manual correction brushes, crop edge sliders, and
  numeric placement controls are Advanced.
- Adjust and Enhance show the same meaningful controls in both modes. Their
  recommendation stays visible in both modes.
- Trace keeps its recommendation visible while Advanced reveals its existing
  specialist controls.
- Looks can be layered, reordered, individually strengthened, disabled by a
  zero strength, and removed without changing the other stack entries.
- Distress controls exist only on an active Distressed Print stack entry.
- Preview, Compare, Product, persisted reload, undo and redo, and print-ready
  export all use the same ordered Look stack.
- `npm test` passes, focused Playwright checks pass, the full browser suite is
  classified, Impeccable audit completes, and Impeccable critique completes.

## Risks

- **Prepared-image coordinate migration:** Existing cleanup strokes are crop-local
  and do not record their historical crop. Mitigation: correction-document schema
  2 stores a source crop. Legacy correction schema 1 documents are interpreted
  against the image layer crop present when the document is read, then rewritten
  as correction schema 2 on the next correction edit. Project schema 6, introduced
  in Task 9, stores cumulative picks. Rollback is a revert of Tasks 8 and 9, which
  leaves legacy assets untouched.
- **Prepared asset shape changes:** New prepared PNGs cover the full source rather
  than the crop. Mitigation: use a versioned fingerprint prefix so every old
  prepared PNG becomes stale and regenerates before use. Compositor, trace, and
  export tests verify the same crop is applied exactly once.
- **Look project migration:** Schema 7 replaces `variation.look` with
  `variation.looks`. Mitigation: schemas 1 and 2 retain their existing Original
  behavior, while schemas 3 through 6 migrate Original to an empty stack and
  every other recipe to a one-item stack. There is no in-place storage rewrite
  until autosave succeeds.
- **Look memory use:** Sequential Looks can multiply full-frame allocations.
  Mitigation: the worker alternates two owned RGBA buffers and the estimator
  rejects a stack whose peak working bytes exceeds the existing export limit.
- **White mockup contrast:** The tracked landing image is much lighter than the
  other garment mockups. Mitigation: verify its transparent silhouette and use
  the existing light-garment contrast branch.

## If Reality Diverges From This Plan

Stop and report. Do not improvise a fix. This applies when a named path or symbol
does not match, a test fails for an unrelated reason, a migration loses a field,
or a worker produces output in a different coordinate space than described.

---

## Pass 1: Workflow and Accessibility

### Task 1: Basic presents a fixed, direct workflow and Product no longer locks editing

**Depends on:** None

**Files:**

- Modify: `components/editor/EditorToolbar.tsx`, `EditorToolbar`
- Modify: `components/editor/EditorApp.tsx`, toolbar wiring and `tool === 'product'` effects
- Test: `tests/editor-shell.test.ts`
- Test: `tests/e2e/canvas-editor.spec.ts`

**Interfaces:**

- Produce: `EditorToolbarProps.basicPreparationTool?: EditorTool`
- Produce: Basic command order `select`, contextual preparation, `product`,
  `layers`, `more`
- Produce: More menu whose items call the existing `onToolChange(EditorTool)`

- [ ] **Step 1: Replace the old toolbar assertions with failing workflow assertions**

Add these behavior tests to `tests/editor-shell.test.ts`:

```ts
test('Basic toolbar keeps the guided workflow visible and specialists behind More', () => {
  const markup = renderToStaticMarkup(createElement(EditorToolbar, {
    tool: 'select', mode: 'easy', hasProject: true, hasImageLayer: true,
    onToolChange: () => undefined, onOpenLayers: () => undefined,
  }));
  const labels = [...markup.matchAll(/aria-label="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(labels.slice(0, 5), ['Select', 'Crop', 'Product', 'Layers', 'More tools']);
  for (const label of ['Adjust', 'Enhance resolution', 'Remove background', 'Trace', 'Looks']) {
    assert.doesNotMatch(markup, new RegExp(`aria-label="${label}"[^>]*data-primary-tool`));
  }
});

test('an active Basic specialist occupies the preparation slot', () => {
  const markup = renderToStaticMarkup(createElement(EditorToolbar, {
    tool: 'remove-background', mode: 'easy', hasProject: true, hasImageLayer: true,
    onToolChange: () => undefined, onOpenLayers: () => undefined,
  }));
  assert.match(markup, /data-primary-tool="remove-background"/);
  assert.match(markup, /aria-label="Product"/);
});

test('Product mode leaves navigation and Layers enabled', () => {
  const markup = renderToStaticMarkup(createElement(EditorToolbar, {
    tool: 'product', mode: 'easy', hasProject: true, hasImageLayer: true,
    onToolChange: () => undefined, onOpenLayers: () => undefined,
  }));
  for (const label of ['Select', 'Crop', 'Product', 'Layers', 'More tools']) {
    assert.doesNotMatch(
      markup.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? '',
      /disabled=""/,
    );
  }
});
```

- [ ] **Step 2: Run the focused test and confirm the intended failure**

Run: `npx tsx --test tests/editor-shell.test.ts`

Expected: FAIL because Basic currently renders every tool in the horizontal rail
and Product disables most other commands. An import or render failure does not
satisfy this step.

- [ ] **Step 3: Implement the Basic command model**

In `EditorToolbar`:

- Keep the existing grouped command metadata as the Advanced source of truth.
- Add a local More disclosure with a 44 pixel button and a labelled menu.
- Use Crop as the default Basic preparation command.
- If `tool` is Adjust, Enhance, Remove background, Trace, or Looks, put that
  active tool in the preparation slot.
- Render Product third and Layers fourth in Basic at every width.
- Remove `productConflict` and `editor-product-mode-disabled-reason`.
- Keep only true availability rules, such as no Product before import.
- When Compare is requested from Product, first select the design canvas, then
  open Compare. Preserve Product placement and avoid the existing effect that
  immediately closes Compare while Product is active.
- Give every visible desktop command a visible text label. Widen the desktop
  rail from 60 to 88 pixels and update `EditorApp` grid columns to match.

In `EditorApp`, stop closing Layers merely because Product becomes active. Keep
the existing behavior that choosing another command replaces Product.

- [ ] **Step 4: Run the focused test**

Run: `npx tsx --test tests/editor-shell.test.ts`

Expected: PASS.

- [ ] **Step 5: Add and run the mobile browser check**

Add one Playwright case that imports artwork at 390 by 844, asserts the first
five toolbar buttons in order, asserts Product is inside the viewport before any
horizontal scroll, opens More, selects Remove background, returns to Product,
switches to Advanced, opens Compare and verifies it remains open on the design
canvas, switches back to Basic, then selects Crop without encountering a disabled
command or dangling disabled description.

Run: `npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "Basic keeps Product visible and specialists behind More"`

Expected: PASS.

- [ ] **Step 6: Commit**

Stage `components/editor/EditorToolbar.tsx`, `components/editor/EditorApp.tsx`,
`tests/editor-shell.test.ts`, and `tests/e2e/canvas-editor.spec.ts` by name.

Suggested message: `fix: simplify the basic editor workflow`

**Completion criteria:** Product is the third Basic action at phone width, More
contains specialist tools, and Product does not trap the user in a locked mode.

### Task 2: The project top bar remains readable from phone to desktop

**Depends on:** None

**Can run in parallel with:** Task 1

**Files:**

- Modify: `components/editor/EditorTopBar.tsx`, `IconButton` and header layout
- Modify: `components/editor/EditorApp.tsx`, top-row grid sizing
- Test: `tests/editor-shell.test.ts`
- Test: `tests/e2e/canvas-editor.spec.ts`

**Interfaces:**

- Produce: `IconButtonProps.visibleLabel?: string`
- Preserve: existing draft reducers, callbacks, labels, save states, and command
  availability

- [ ] **Step 1: Add failing structural and browser assertions**

Add a server-render test that requires visible `Export` and `Projects` text at
desktop breakpoints and keeps accessible names unchanged. Add a Playwright test
that measures the project group, variation group, mode group, and command group
at 390, 768, 1024, 1280, and 1440 pixels. Each rectangle must stay inside the
header and must not overlap another group.

- [ ] **Step 2: Confirm the browser check fails at the cramped breakpoint**

Run: `npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "top bar groups stay readable"`

Expected: FAIL at one or more medium widths because the current header forces all
desktop controls into one 56 pixel row from 768 pixels onward.

- [ ] **Step 3: Implement responsive grouping**

Keep two rows through the `lg` breakpoint, and use the single-row desktop layout
only at `xl`. Treat the project name and browser save status as one labelled
group. Treat variation selection, variation name, duplicate, and delete as a
second group. Keep mode, Undo, Redo, Import, Export, and Projects in a command
group. Show `Export` and `Projects` text at `xl`; keep their icon and accessible
name at smaller widths. Change save copy to `Saved in this browser`, `Saving in
this browser`, and `Save failed`.

Update `EditorApp` row sizes so the canvas begins below the actual header height
at every breakpoint.

- [ ] **Step 4: Verify**

Run: `npx tsx --test tests/editor-shell.test.ts`

Run: `npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "top bar groups stay readable"`

Expected: PASS.

- [ ] **Step 5: Commit**

Stage the four named files from this task.

Suggested message: `fix: clarify responsive project controls`

**Completion criteria:** No top-bar group overlaps or truncates its essential
control at the five specified widths.

### Task 3: Product canvas supports equivalent pointer and keyboard placement

**Depends on:** None

**Can run in parallel with:** Tasks 1 and 2

**Files:**

- Modify: `editor/productGeometry.ts`, add keyboard placement helpers
- Modify: `components/editor/ProductCanvas.tsx`, focus and keyboard handling
- Test: `tests/editor-product-geometry.test.ts`
- Test: `tests/editor-product-canvas.test.ts`
- Test: `tests/e2e/canvas-editor.spec.ts`

**Interfaces:**

- Produce: `moveProductPlacementWithKeyboard(placement, key, largeStep)`
- Produce: `resizeProductPlacementWithKeyboard(placement, key, largeStep)`
- Use: movement steps 0.01 and 0.05 in normalized Product coordinates
- Use: scale steps 0.01 and 0.05, clamped by `normalizeProductPlacement`

- [ ] **Step 1: Add failing geometry tests**

```ts
test('moves Product placement with precise and larger keyboard steps', () => {
  const placement = { x: 0.5, y: 0.5, scale: 0.72, rotation: 0 };
  assert.deepEqual(moveProductPlacementWithKeyboard(placement, 'ArrowRight', false), {
    ...placement, x: 0.51,
  });
  assert.deepEqual(moveProductPlacementWithKeyboard(placement, 'ArrowUp', true), {
    ...placement, y: 0.45,
  });
});

test('resizes Product placement with precise and larger keyboard steps', () => {
  const placement = { x: 0.5, y: 0.5, scale: 0.72, rotation: 0 };
  assert.equal(resizeProductPlacementWithKeyboard(placement, 'ArrowRight', false).scale, 0.73);
  assert.equal(resizeProductPlacementWithKeyboard(placement, 'ArrowDown', true).scale, 0.67);
});
```

- [ ] **Step 2: Confirm the helpers do not exist yet**

Run: `npx tsx --test tests/editor-product-geometry.test.ts`

Expected: FAIL because the keyboard helpers are not implemented.

- [ ] **Step 3: Implement the helpers and Product canvas keyboard contract**

Make the Product artwork itself a focusable control with the accessible name
`Product artwork placement`. Arrow keys call the movement helper. Make the resize
button 44 by 44 pixels. Arrow Up and Arrow Right enlarge; Arrow Down and Arrow
Left reduce. Shift uses the larger step. Keydown uses stable history-group names,
and keyup or blur calls `onPlacementEnd`.

Give the Product stage and resize button an inset `focus-visible` ring. Add
`aria-keyshortcuts` and a concise visible hint while either placement control has
keyboard focus: `Arrow keys move. Shift moves farther. Focus Resize to change size.`

- [ ] **Step 4: Verify component markup and behavior**

Run: `npx tsx --test tests/editor-product-geometry.test.ts tests/editor-product-canvas.test.ts`

Expected: PASS, including a markup assertion that the resize button contains
`h-11 w-11` and the artwork control exposes the shortcut description.

- [ ] **Step 5: Verify in the browser**

Add a Playwright case that focuses Product artwork, presses Arrow Right and Shift
plus Arrow Down, focuses Resize, presses Arrow Right, reloads, and confirms the
three placement changes persisted.

Run: `npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "Product canvas supports keyboard placement and resize"`

Expected: PASS.

- [ ] **Step 6: Commit**

Stage the five named files from this task.

Suggested message: `fix: add accessible product placement controls`

**Completion criteria:** Pointer, keyboard, persistence, focus, hint, and target
size behavior all pass.

### Task 4: Product Basic mode leads with readiness and supports a white shirt

**Depends on:** Task 1

**Files:**

- Modify: `editor/productModel.ts`, add `white` slug
- Modify: `editor/productCatalog.ts`, add the white catalog row
- Modify: `components/editor/ProductInspector.tsx`, mode-specific information order
- Modify: `components/editor/EditorInspector.tsx`, pass `mode` to Product
- Modify: `components/editor/EditorApp.tsx`, wire the recommended export action
- Test: `tests/editor-product-model.test.ts`
- Test: `tests/editor-product-catalog.test.ts`
- Test: `tests/editor-shell.test.ts`
- Test: `tests/e2e/canvas-editor.spec.ts`

**Interfaces:**

- Produce: `TShirtMockupSlug` includes `white`
- Produce: `ProductInspectorProps.mode: 'easy' | 'advanced'`
- Produce: `ProductInspectorProps.onExport: () => void`
- Rename: readiness field `sourceSide` to `smallestSourceEdge`

- [ ] **Step 1: Add failing catalog, Product Basic, and copy tests**

Require twelve swatches, a White entry using `/landing-tee-white.webp`, and
normalization of `white`. Render Product in Basic and assert readiness appears
before all other sections, one recommended action appears, and Print checks,
artwork mapping, RGB versus Print intent, X, Y, scale, and rotation do not. Render
Advanced and assert those details remain available.

Add this copy assertion for a ready image:

```ts
assert.match(markup, /Ready at this size/);
assert.match(markup, /The export uses less than the available artwork resolution/);
assert.doesNotMatch(markup, /Largest source edge|Estimated scale/);
```

- [ ] **Step 2: Confirm the focused tests fail for the intended reasons**

Run: `npx tsx --test tests/editor-product-model.test.ts tests/editor-product-catalog.test.ts tests/editor-shell.test.ts`

Expected: FAIL because White is absent and Product ignores editor mode.

- [ ] **Step 3: Add White and simplify Product Basic**

Add White to the existing T-shirt catalog with the same printable region. Include
it in the light-garment contrast branch.

In Basic Product, render in this order:

1. readiness status and one plain-English explanation,
2. one recommended action, either Enhance resolution, Remove background, or
   Create print-ready PNG,
3. shirt color choices,
4. Center artwork and Fit print area.

Wire the ready-state action to `EditorApp`'s existing `setExportOpen(true)` path.

In Advanced, additionally render artwork-to-color assignment, RGB versus Print
intent, an `Artwork checks` disclosure replacing `Print Lens`, X and Y, scale,
and rotation. Rewrite its rows as `Background`, `Contrast on this shirt`, and
`Print color count`, each with a complete sentence and corrective action.

- [ ] **Step 4: Verify automated behavior**

Run: `npx tsx --test tests/editor-product-model.test.ts tests/editor-product-catalog.test.ts tests/editor-shell.test.ts`

Expected: PASS.

- [ ] **Step 5: Verify Basic and Advanced Product in the browser**

At desktop and 390 by 844, choose White, reload the saved project, confirm the
mockup remains White, switch Basic to Advanced, and confirm the detailed controls
appear without moving the readiness status below them.

Run: `npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "Product Basic leads with readiness and White persists"`

Expected: PASS.

- [ ] **Step 6: Commit**

Stage all nine named paths by name.

Suggested message: `fix: simplify product readiness and add white`

**Completion criteria:** Basic Product is decision-focused, Advanced retains the
detailed checks, and White survives save and reload.

### Task 5: Canvas focus, shortcut help, and export targets meet the interaction standard

**Depends on:** Task 3

**Files:**

- Modify: `components/editor/EditorCanvas.tsx`, visible focus and focus hint
- Modify: `components/editor/ProductExportDialog.tsx`, 44 pixel targets
- Test: `tests/editor-shell.test.ts`
- Test: `tests/editor-product-export-dialog.test.ts`
- Test: `tests/e2e/canvas-editor.spec.ts`

**Interfaces:**

- Preserve: existing design-canvas movement and crop keyboard helpers
- Produce: visible hint `Arrow keys move. Shift moves farther.` on design-canvas focus

- [ ] **Step 1: Add failing markup and computed-size tests**

Require `focus-visible:ring-2 focus-visible:ring-inset` on the design canvas and
outer crop frame. Require the visible hint to be absent before focus and visible
after focus. Require the export close, Create PNG, Cancel, Download PNG, and reset
controls to have computed width and height of at least 44 pixels.

- [ ] **Step 2: Confirm the current compact targets fail**

Run: `npx tsx --test tests/editor-shell.test.ts tests/editor-product-export-dialog.test.ts`

Expected: FAIL because the export close button is 32 pixels, the primary actions
are 40 pixels, and the canvas focus ring is not visible.

- [ ] **Step 3: Implement focus and target sizing**

Use 44 pixel targets without changing the dialog hierarchy. Add focus rings to
all dialog actions. Track design-canvas keyboard focus only long enough to render
the compact hint; retain the screen-reader description at all times. Add the same
visible focus treatment to the crop group and its handles.

- [ ] **Step 4: Verify**

Run: `npx tsx --test tests/editor-shell.test.ts tests/editor-product-export-dialog.test.ts`

Run: `npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "canvas focus and export targets are visible"`

Expected: PASS.

- [ ] **Step 5: Commit**

Stage the five named paths by name.

Suggested message: `fix: expose canvas focus and enlarge export actions`

**Completion criteria:** All named targets meet 44 pixels, focus is visible, and
shortcut help is visible at the moment it is useful.

## Pass 2: Inspector Semantics and Image Integrity

### Task 6: Basic and Advanced reveal real controls without hiding guidance

**Depends on:** Task 1

**Files:**

- Modify: `components/editor/EditorInspector.tsx`, workflow guidance and mode wiring
- Modify: `components/editor/TransformControls.tsx`, Advanced-only transform groups
- Modify: `components/editor/BackgroundRemovalInspector.tsx`, mode-specific groups
- Modify: `components/editor/ResolutionInspector.tsx`, accept mode without false differences
- Modify: `components/editor/TraceInspector.tsx`, preserve recommendation context
- Test: `tests/editor-shell.test.ts`

**Interfaces:**

- Produce: `BackgroundRemovalInspectorProps.mode`
- Produce: `ResolutionInspectorProps.mode`
- Preserve: `getInspectorWorkflowContext()` recommendation in both modes

- [ ] **Step 1: Add the mode matrix test**

Add one table-driven test with these exact expectations:

```ts
const expectations = {
  select: { basicHidden: ['editor-position-x', 'editor-position-y', 'editor-scale', 'editor-rotation', 'editor-opacity', 'editor-flip-horizontal', 'editor-flip-vertical'], advancedShown: ['editor-position-x', 'editor-position-y', 'editor-scale', 'editor-rotation', 'editor-opacity', 'editor-flip-horizontal', 'editor-flip-vertical'] },
  crop: { basicHidden: ['editor-crop-left'], advancedShown: ['editor-crop-left'] },
  adjust: { basicShown: ['editor-brightness'], advancedShown: ['editor-brightness'] },
  enhance: { basicText: '2x enhance', advancedText: '2x enhance' },
  'remove-background': { basicHidden: ['editor-background-tolerance'], advancedShown: ['editor-background-tolerance'] },
  trace: { basicHidden: ['editor-trace-detail'], advancedShown: ['editor-trace-detail'] },
} as const;
```

For every row, assert `Recommended next:` remains present in both modes.

- [ ] **Step 2: Confirm the matrix fails**

Run: `npx tsx --test tests/editor-shell.test.ts`

Expected: FAIL because Advanced currently removes most recommendations, crop
edges are always visible, and background controls ignore mode.

- [ ] **Step 3: Implement the information architecture**

- Select Basic contains direct-manipulation instructions only.
- Select Advanced contains all Transform controls.
- Crop Basic contains ratio and reset actions. Crop Advanced also contains edge
  sliders.
- Adjust and Enhance are identical in both modes because no specialist controls
  exist.
- Remove background Basic contains enable, Auto, Pick color, picked-color list,
  Done, and status. Advanced additionally contains tolerance, feather, erase,
  restore, brush size, clear corrections, and full reset.
- Trace retains its current real Advanced split.
- Recommendations always render in the frame. Advanced changes the stage label,
  not the recommendation.

- [ ] **Step 4: Verify**

Run: `npx tsx --test tests/editor-shell.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Stage all six named files by name.

Suggested message: `fix: align basic and advanced inspector controls`

**Completion criteria:** Mode changes reveal actual specialist controls and never
make next-step guidance disappear.

### Task 7: Crop ratios change the crop window without distorting artwork

**Depends on:** Task 6

**Files:**

- Modify: `editor/geometry.ts`, add crop-ratio helper
- Modify: `components/editor/EditorInspector.tsx`, use the helper
- Modify: `components/editor/EditorCanvas.tsx`, retain focus and free resize
- Test: `tests/editor-geometry.test.ts`
- Test: `tests/editor-shell.test.ts`
- Test: `tests/e2e/canvas-editor.spec.ts`

**Interfaces:**

- Produce: `fitCropToAspectRatio(crop, sourceSize, targetRatio): CropRect`
- Guarantee: `(crop.width * source.width) / (crop.height * source.height)` equals
  the requested ratio within 0.000001

- [ ] **Step 1: Add failing geometry tests**

```ts
test('fits crop ratios around the current crop center without stretching source pixels', () => {
  const source = { width: 1200, height: 800 };
  const square = fitCropToAspectRatio(
    { x: 0.1, y: 0.2, width: 0.7, height: 0.6 }, source, 1,
  );
  assert.ok(Math.abs((square.width * source.width) / (square.height * source.height) - 1) < 1e-6);
  assert.ok(square.x >= 0 && square.y >= 0);
  assert.ok(square.x + square.width <= 1 && square.y + square.height <= 1);
});
```

- [ ] **Step 2: Confirm the helper is absent**

Run: `npx tsx --test tests/editor-geometry.test.ts`

Expected: FAIL because `fitCropToAspectRatio` does not exist.

- [ ] **Step 3: Implement one-shot ratio fitting**

Fit the largest requested ratio inside the current crop, preserve its center when
possible, clamp it inside source bounds, and round consistently with the existing
geometry helpers. Rename Free to `Reset crop`; free dragging already exists and
must not mutate the crop merely because a mode was selected.

- [ ] **Step 4: Add the browser regression**

Import a non-square fixture, record the canvas artwork bounding box, apply 1:1,
assert the crop frame becomes square in source pixels, and assert the artwork
inside the frame retains its original pixel aspect ratio.

Run: `npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "crop ratios resize the window without stretching artwork"`

Expected: PASS.

- [ ] **Step 5: Run focused unit tests**

Run: `npx tsx --test tests/editor-geometry.test.ts tests/editor-shell.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

Stage the six named files by name.

Suggested message: `fix: preserve artwork aspect ratio while cropping`

**Completion criteria:** Every ratio changes only the crop window and Reset crop
is explicit.

### Task 8: Background removal becomes source-based and survives crop changes

**Depends on:** Task 7

**Files:**

- Modify: `editor/imagePrepModel.ts`, schema 2 correction coordinates and fingerprint v2
- Modify: `editor/imagePrepInput.ts`, compose full-source cleanup input
- Modify: `editor/backgroundRemovalProcessor.ts`, source-coordinate corrections
- Modify: `editor/compositor.ts`, crop prepared source exactly once
- Modify: `components/editor/useBackgroundRemovalWorkflow.ts`, read legacy correction coordinates and write schema 2
- Modify: `components/editor/useTraceWorkflow.ts`, crop full-source prepared input
- Modify: `editor/tshirtExportRenderer.ts`, crop full-source prepared input
- Modify: `components/editor/EditorCanvas.tsx`, map correction points to source space
- Test: `tests/editor-image-prep-input.test.ts`
- Test: `tests/editor-background-removal-processor.test.ts`
- Test: `tests/editor-compositor.test.ts`
- Test: `tests/editor-trace-workflow.test.ts`
- Test: `tests/editor-tshirt-export-renderer.test.ts`
- Test: `tests/e2e/canvas-editor.spec.ts`

**Interfaces:**

- Produce: `CleanupCorrectionDocument` schema 2 with `sourceCrop: CropRect` and
  source-normalized stroke points
- Produce: fingerprint prefix `prep:v2:` that excludes `crop`
- Produce: prepared assets with the aspect ratio of the uncropped source
- Preserve: adjustments remain upstream of background removal
- Preserve: `createTraceSourceFingerprint()` includes crop explicitly so crop
  changes still stale linked trace geometry

- [ ] **Step 1: Replace crop-based input tests with source-based contracts**

Update `tests/editor-image-prep-input.test.ts` so a 1000 by 800 source with a
partial crop produces a 1000 by 800 preparation frame, draws the full source,
and returns the same fingerprint before and after a crop-only change. Assert that
asset, adjustment, tolerance, feather, picks, and correction-digest changes still
change the fingerprint.

Add compositor and export tests that supply a full-source prepared asset and
assert `drawImage` receives the source crop coordinates. Add a trace test that
asserts the prepared asset is cropped before tracing and that crop changes alter
the trace-source fingerprint without altering the preparation fingerprint.

- [ ] **Step 2: Confirm the current pipeline fails for the intended reason**

Run: `npx tsx --test tests/editor-image-prep-input.test.ts tests/editor-compositor.test.ts tests/editor-trace-workflow.test.ts tests/editor-tshirt-export-renderer.test.ts`

Expected: FAIL because current preparation crops first and current prepared
rendering assumes the prepared asset already represents the crop.

- [ ] **Step 3: Implement the full-source preparation contract**

Remove crop from `createImagePrepFingerprint`. Version the prefix so old assets
are stale. Make `composeImagePrepInput` draw the full source at the bounded size.
Update compositor, trace composition, and export rendering to compute the crop
against prepared-asset dimensions and apply it exactly once.

Convert new brush points from crop-local display coordinates to source-normalized
coordinates before storage. Store the layer crop with schema 2 correction
documents so schema 1 points can be interpreted against the crop available during
document reading. Rewrite as schema 2 only when the user commits a new correction.
Keep stroke order and immutable-source Restore behavior unchanged. The `prep:v2`
prefix forces old prepared assets to regenerate without changing the project
schema in this task.

Add a compatibility test that loads a schema 1 correction document containing a
crop-local stroke under a non-full layer crop. Assert the interpreted source-space
point maps to the same visible source pixel, assert reading alone leaves the stored
document at schema 1, then add one new correction and assert the rewritten schema 2
document preserves the legacy point and stores both points in source coordinates.

- [ ] **Step 4: Verify unit and migration behavior**

Run: `npx tsx --test tests/editor-image-prep-input.test.ts tests/editor-background-removal-processor.test.ts tests/editor-compositor.test.ts tests/editor-trace-workflow.test.ts tests/editor-tshirt-export-renderer.test.ts`

Expected: PASS.

- [ ] **Step 5: Verify crop stability end to end**

Add a Playwright case that removes a visible background, records the prepared
asset ID and a pixel digest, changes crop ratio and crop position, waits beyond
the worker debounce, and asserts the prepared ID and digest do not change while
the visible crop does.

Run: `npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "crop preserves completed background removal"`

Expected: PASS.

- [ ] **Step 6: Commit**

Stage all fourteen named paths by name.

Suggested message: `fix: preserve cleanup results through crop changes`

**Completion criteria:** Crop never changes cleanup authority or output, and
preview, trace, and export crop the prepared source exactly once.

### Task 9: Pick color accumulates removals instead of replacing them

**Depends on:** Task 8

**Files:**

- Modify: `editor/imagePrepModel.ts`, cumulative pick model
- Modify: `editor/model.ts`, project schema 6 migration
- Modify: `editor/backgroundRemovalProcessor.ts`, apply every pick
- Modify: `components/editor/useBackgroundRemovalWorkflow.ts`, append and remove picks
- Modify: `components/editor/BackgroundRemovalInspector.tsx`, picked-color list
- Modify: `components/editor/EditorCanvas.tsx`, repeated pick interaction
- Test: `tests/editor-background-removal-processor.test.ts`
- Test: `tests/editor-model.test.ts`
- Test: `tests/editor-shell.test.ts`
- Test: `tests/e2e/canvas-editor.spec.ts`

**Interfaces:**

- Produce: `BackgroundRemovalPick { color: string; point: NormalizedPoint }`
- Produce: `BackgroundRemovalSettings.picks: BackgroundRemovalPick[]`, maximum 16
- Produce: `BackgroundRemovalWorkflow.removePick(index)` and `clearPicks()`
- Migration: legacy `pickedColor` plus `pickedPoint` becomes one `picks` entry
- Migration: project schemas 1 through 5 normalize to project schema 6

- [ ] **Step 1: Add failing processor and normalization tests**

```ts
test('picked mode removes every selected color without losing earlier picks', () => {
  const result = applyBackgroundRemoval({
    frame: rgbaFrame(5, 1, ['ff0000', 'ff0000', '00ff00', '00ff00', '0000ff']),
    settings: {
      ...createDefaultBackgroundRemoval(), enabled: true, mode: 'picked', edgeFeather: 0,
      picks: [
        { color: '#ff0000', point: { x: 0, y: 0 } },
        { color: '#00ff00', point: { x: 0.75, y: 0 } },
      ],
    },
    corrections: noCorrections,
  });
  assert.equal(alphaAt(result, 0, 0), 0);
  assert.equal(alphaAt(result, 3, 0), 0);
  assert.equal(alphaAt(result, 4, 0), 255);
});
```

- [ ] **Step 2: Confirm only the latest pick is currently represented**

Run: `npx tsx --test tests/editor-background-removal-processor.test.ts tests/editor-shell.test.ts`

Expected: FAIL because the model stores only `pickedColor` and `pickedPoint`.

- [ ] **Step 3: Implement cumulative picks**

Append a normalized pick unless the same sampled color and point already exist.
Cap the list at 16. Process each pick into the same removal mask before feathering.
Done exits pick mode and does not modify settings. Pick color can be entered again
to append another removal. Show compact color chips in Basic with Remove buttons;
show Clear picked colors in Advanced. Bump the project schema from 5 to 6 and
migrate the legacy single pick into a one-entry array without changing projects
that never used picked mode. Explicitly preserve schema 5 `productVariants`,
including selected shirt, placement, artwork mapping, and preview intent. Add a
schema 5 to 6 fixture whose Product state is non-default and assert deep equality
after migration. Schemas 1 through 4 continue their established Product defaults.

- [ ] **Step 4: Verify persistence and repeat entry**

Add a Playwright case that picks red, presses Done, re-enters Pick color, picks
green, presses Done, reloads, and verifies both colors remain transparent. Then
crop and verify both remain transparent again.

Run: `npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "picked background colors accumulate and persist"`

Expected: PASS.

- [ ] **Step 5: Run focused unit tests**

Run: `npx tsx --test tests/editor-background-removal-processor.test.ts tests/editor-shell.test.ts tests/editor-model.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

Stage all ten named paths by name.

Suggested message: `fix: retain cumulative background color picks`

**Completion criteria:** Earlier picks survive Done, later picks, reload, crop,
and individual pick removal.

## Pass 3: Layered Looks

### Task 10: Saved variations use a normalized, undoable Look stack

**Depends on:** Task 9

**Files:**

- Modify: `editor/lookModel.ts`, Look stack contract and normalization
- Modify: `editor/model.ts`, project schema 7 and variation migration
- Modify: `editor/history.ts`, stack commands and undo grouping
- Modify: `components/editor/EditorCanvas.tsx`, default variation stack shape
- Test: `tests/editor-look-model.test.ts`
- Test: `tests/editor-model.test.ts`
- Test: `tests/editor-history.test.ts`
- Test: `tests/editor-shell.test.ts`, shared variation fixtures
- Test: `tests/editor-repository.test.ts`, persisted variation fixtures
- Test: `tests/e2e/canvas-editor.spec.ts`, browser-side project fixtures

**Interfaces:**

- Produce: `type VariationLookStack = VariationLook[]`
- Produce: `normalizeVariationLooks(value): VariationLookStack`
- Produce: `serializeVariationLooks(value): string`
- Replace: `DesignVariation.look` with `DesignVariation.looks`
- Produce commands: `add-look`, `update-look`, `remove-look`, `move-look`,
  `reset-looks`, and `reroll-look-seed`, each addressed by `LookId`

- [ ] **Step 1: Add failing stack and migration tests**

```ts
test('normalizes one ordered instance of each non-Original Look', () => {
  assert.deepEqual(normalizeVariationLooks([
    createDefaultLook('duotone'),
    createDefaultLook('distressed-print', 7),
    { ...createDefaultLook('duotone'), strength: 40 },
    createDefaultLook('original'),
  ]), [
    createDefaultLook('duotone'),
    createDefaultLook('distressed-print', 7),
  ]);
});

test('migrates one legacy Look into a one-item schema 7 stack', () => {
  const source = createEditorAsset('project-look-migration', new Blob(['source']), {
    name: 'source.png', width: 100, height: 80,
  });
  const current = createEditorProject('Legacy Look', source);
  const { looks: _looks, ...legacyVariation } = current.variations[0];
  const legacy = {
    ...current,
    schemaVersion: 6,
    variations: [{ ...legacyVariation, look: createDefaultLook('duotone') }],
  };
  const migrated = migrateEditorProject(legacy, [source]);
  assert.equal(migrated.schemaVersion, 7);
  assert.deepEqual(migrated.variations[0].looks, [createDefaultLook('duotone')]);
});
```

Add history tests for add, update strength, move earlier, move later, remove,
reset, seeded reroll, grouped undo, variation duplication, and variation isolation.

- [ ] **Step 2: Confirm the model is still single-Look**

Run: `npx tsx --test tests/editor-look-model.test.ts tests/editor-model.test.ts tests/editor-history.test.ts tests/editor-shell.test.ts tests/editor-repository.test.ts`

Add a focused Playwright case that seeds a schema 6 project containing a legacy
Look, non-default white-shirt Product state, and two background picks. Reload the
project and assert the Look stack, Product state, and both picks survive schema 7
normalization.

Run: `npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "schema 7 preserves legacy Look Product state and picks"`

Expected: FAIL because `DesignVariation` has `look` and history has single-recipe
commands.

- [ ] **Step 3: Implement schema 7 and stack commands**

Original is never stored in `looks`. Normalization keeps first occurrence order,
drops duplicates and invalid entries, and caps the stack at eight. Schemas 1 and
2 retain their established rule that injected Look data is ignored and migrate to
an empty stack. Schemas 3 through 6 read legacy `look`; Original becomes `[]`,
otherwise `[look]`. Schema 7 reads `looks` only. Update create, duplicate, and
project normalization paths.

The schema 7 migration must preserve all fields already normalized by their
owning versions. Add table-driven fixtures for schemas 1 through 7. Assert schema
5 preserves non-default `productVariants`; schema 6 preserves the same Product
state plus cumulative background picks; and schema 7 preserves both while
normalizing `looks`. Do not use a current-version-only condition to decide whether
Product state is retained.

History commands must normalize every write, no-op on stable serialization, and
keep strength drags in one history group. Move commands swap adjacent entries and
no-op at boundaries.

- [ ] **Step 4: Verify**

Run: `npx tsx --test tests/editor-look-model.test.ts tests/editor-model.test.ts tests/editor-history.test.ts tests/editor-shell.test.ts tests/editor-repository.test.ts`

Run: `npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "schema 7 preserves legacy Look Product state and picks"`

Expected: PASS.

- [ ] **Step 5: Commit**

Stage all ten named paths by name.

Suggested message: `feat: add an ordered look stack model`

**Completion criteria:** Schema 1 through 7 load, legacy Looks migrate losslessly,
and every stack edit is predictable under undo and redo.

### Task 11: Preview, Compare, Product, and export render the same Look stack

**Depends on:** Task 10

**Files:**

- Modify: `editor/lookProcessor.ts`, sequential stack renderer and memory estimate
- Modify: `editor/lookRenderCoordinator.ts`, stack-owned worker input
- Modify: `editor/lookWorker.ts`, validate and process stacks
- Modify: `components/editor/VariationPreviewCanvas.tsx`, stack render key
- Modify: `components/editor/EditorApp.tsx`, before-state and candidate wiring
- Modify: `editor/tshirtExportModel.ts`, stack-aware export fingerprint
- Modify: `editor/tshirtExportRenderer.ts`, export stack processing
- Modify: `editor/svgExport.ts`, stack eligibility check
- Test: `tests/editor-look-processor.test.ts`
- Test: `tests/editor-look-render-coordinator.test.ts`
- Test: `tests/editor-preview-surface.test.ts`
- Test: `tests/editor-tshirt-export-model.test.ts`
- Test: `tests/editor-tshirt-export-renderer.test.ts`
- Test: `tests/editor-svg-export.test.ts`
- Test: `tests/editor-tshirt-export-coordinator.test.ts`, variation fixtures
- Test: `tests/editor-tshirt-export-worker.test.ts`, variation fixtures

**Interfaces:**

- Produce: `applyVariationLooks(frame, looks, options): RgbaFrame`
- Produce: `estimateVariationLooksWorkingBytes(width, height, looks): number`
- Replace: worker and coordinator input `look` with `looks`
- Preserve: `applyVariationLook` as the tested single-recipe primitive

- [ ] **Step 1: Add failing ordered-render and memory tests**

```ts
test('applies a Look stack in array order', () => {
  const looks = [
    createDefaultLook('monochrome'),
    { ...createDefaultLook('distressed-print', 7), strength: 60 },
  ];
  const expected = applyVariationLook(
    applyVariationLook(frame, looks[0]),
    looks[1],
  );
  assert.deepEqual(applyVariationLooks(frame, looks).pixels, expected.pixels);
  assert.notDeepEqual(applyVariationLooks(frame, [...looks].reverse()).pixels, expected.pixels);
});
```

Add a 4500 square estimator test that checks the stack against the existing
export byte limit without allocating the real frame. Add coordinator tests that
mutating caller arrays after dispatch does not mutate worker input or cache keys.
Add export output tests with two Looks.

- [ ] **Step 2: Confirm single-recipe rendering fails the new contract**

Run: `npx tsx --test tests/editor-look-processor.test.ts tests/editor-look-render-coordinator.test.ts tests/editor-preview-surface.test.ts tests/editor-tshirt-export-model.test.ts tests/editor-tshirt-export-renderer.test.ts tests/editor-svg-export.test.ts tests/editor-tshirt-export-coordinator.test.ts tests/editor-tshirt-export-worker.test.ts`

Expected: FAIL because every render path accepts one recipe.

- [ ] **Step 3: Implement bounded sequential rendering**

Normalize the stack before processing. Apply recipes in array order. Reuse two
owned RGBA buffers where possible, but never mutate the caller frame. Include the
serialized stack in render keys and worker authority. Reject work before dispatch
when its peak estimate exceeds the existing limit. Update before and after view
to compare `[]` against the current stack. Include the serialized stack in the
T-shirt export fingerprint so any order or recipe change invalidates stale work.
Apply the identical stack in raster export. SVG export remains unavailable when
the normalized stack is non-empty and available when it is empty.

- [ ] **Step 4: Verify**

Run: `npx tsx --test tests/editor-look-processor.test.ts tests/editor-look-render-coordinator.test.ts tests/editor-preview-surface.test.ts tests/editor-tshirt-export-model.test.ts tests/editor-tshirt-export-renderer.test.ts tests/editor-svg-export.test.ts tests/editor-tshirt-export-coordinator.test.ts tests/editor-tshirt-export-worker.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Stage all sixteen named paths by name.

Suggested message: `feat: render ordered looks across every output`

**Completion criteria:** The same stack order and pixels reach design preview,
Compare, Product, and PNG export within the memory bound.

### Task 12: Looks UI makes layering, order, and per-layer strength explicit

**Depends on:** Tasks 10 and 11

**Files:**

- Modify: `components/editor/LooksInspector.tsx`, stack editor and Advanced controls
- Modify: `components/editor/EditorInspector.tsx`, pass mode to Looks
- Modify: `components/editor/CanvasBeforeAfter.tsx`, stack comparison labels
- Test: `tests/editor-shell.test.ts`
- Test: `tests/e2e/canvas-editor.spec.ts`

**Interfaces:**

- Produce: `LooksInspectorProps.mode`
- Consume: Look stack commands from Task 10
- Consume: ordered stack preview from Task 11

- [ ] **Step 1: Replace single-selection tests with stack UI tests**

Require an `Applied finishes` list. Adding Duotone then Distressed Print produces
two list rows, each with strength, Remove, Move earlier, and Move later controls.
The Distress slider appears only inside the Distressed Print row. The label More
does not exist. Basic hides recipe-specific controls but keeps strength and stack
order controls. Advanced reveals recipe-specific controls. Original clears the
stack after confirmation only when the stack is non-empty.

- [ ] **Step 2: Confirm the current inspector replaces recipes**

Run: `npx tsx --test tests/editor-shell.test.ts`

Expected: FAIL because preset buttons use `aria-pressed` single selection,
Distress is always visible, and specialist controls use More rather than mode.

- [ ] **Step 3: Implement the stack editor**

Keep thumbnail previews as add actions. Mark already-applied presets and disable
their Add action. Render applied entries in order with their own strength control,
remove action, and accessible order buttons. Selecting an entry changes which
Advanced controls are shown without changing order. Place all recipe-specific
controls behind global Advanced. Do not hide the recommendation in either mode.

- [ ] **Step 4: Verify end to end**

Add one desktop and one mobile Playwright case. Add Duotone and Distressed Print,
set different strengths, reorder them, reload, verify exact order and strengths,
undo the reorder, open Product, open Compare, and create a PNG. Confirm none of
those paths collapses the stack to one recipe.

Run: `npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "Look stacks remain ordered across preview and export"`

Expected: PASS.

- [ ] **Step 5: Run focused component tests**

Run: `npx tsx --test tests/editor-shell.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

Stage all five named paths by name.

Suggested message: `feat: expose layered finish controls`

**Completion criteria:** Users can see, add, reorder, strengthen, and remove
finishes without one choice silently replacing another.

## Pass 4: Final Verification

### Task 13: The complete editor passes regression, audit, and critique gates

**Depends on:** Tasks 1 through 12

**Files:**

- Modify only if verification exposes a defect in the preceding task that owns
  the behavior. Stop and return to that task before editing.
- Update: `.impeccable/` reports through the Impeccable commands

**Interfaces:**

- Consume: every acceptance contract from Tasks 1 through 12

- [ ] **Step 1: Run the complete automated baseline**

Run: `npm test`

Expected: PASS with zero failures.

- [ ] **Step 2: Run focused browser groups first**

Run each focused `-g` command named in Tasks 1 through 12. Expected: all PASS.

- [ ] **Step 3: Run the full browser suite with a long timeout**

Run: `npm run test:e2e`

Expected: PASS. If legacy cases fail, record each exact case and prove whether it
also fails at `a02efaf`. Do not classify a failure as pre-existing without that
positive evidence.

- [ ] **Step 4: Run production and responsive manual checks**

Run: `npm run build`

Open `/editor` at 390 by 844, 768 by 1024, 1024 by 768, 1280 by 800, and 1440 by
900. Verify command order, top-bar containment, canvas height, Basic and Advanced
content, visible focus, white shirt, and export dialog containment. Capture before
and after screenshots for the pull request.

- [ ] **Step 5: Run Impeccable audit**

Run `$impeccable audit` against the updated local browser build. Resolve only
verified findings in scope. Record detector false positives with evidence.

- [ ] **Step 6: Run Impeccable critique**

Run `$impeccable critique` against the improved updated browser version, not the
live production site and not a stale build. Use the current local `/editor` and
fresh screenshots. Record the score and every remaining recommendation.

- [ ] **Step 7: Review scope and recovery**

Run: `git diff --check`

Run: `git status --short`

Confirm only explicitly staged implementation, test, screenshot, and Impeccable
report files are included. If a pass regressed behavior, revert that task commit
and reassess rather than layering another patch.

- [ ] **Step 8: Commit final verification artifacts if the repository tracks them**

Stage exact paths only. Do not commit `.codex/`, untracked repository instructions,
or unrelated historical critique reports.

Suggested message: `test: verify final editor refinement pass`

**Completion criteria:** Automated, focused browser, full browser, manual,
Impeccable audit, and Impeccable critique results are all recorded against the
same final build.

## Acceptance

**Automated:**

Run: `npm test`

Expected: type checking, production build, reachability checks, and every unit
and component test pass.

Run: `npm run test:e2e`

Expected: every browser test passes, or every proven pre-existing failure is
listed with baseline reproduction evidence.

**Integration:**

1. Import non-square artwork in Basic at 390 by 844.
2. Confirm Product is the third command and More contains specialists.
3. Crop to 1:1 and confirm no stretch.
4. Remove two background colors in separate Pick sessions.
5. Crop again and confirm both removals persist without new cleanup output.
6. Add two Looks, give each a different strength, reorder them, and reload.
7. Open Product, select White, move and resize by keyboard, and read the plain
   readiness recommendation.
8. Switch to Advanced and confirm precision and print checks appear while the
   recommendation remains.
9. Export a production PNG and confirm the ordered Looks and crop match Product.
10. Undo and redo across crop, cleanup, Product placement, and Look stack edits.

**Manual:**

- Focus every canvas and resize control with the keyboard. Correct behavior is a
  clearly visible ring and nearby plain-English shortcut hint.
- Inspect the five required viewport sizes. Correct behavior is no overlap, no
  essential truncation, no hidden Product action, and no off-screen dialog.
- Compare the visual language with the current landing page. Correct behavior is
  a focused refinement of the existing site, not a new design system.

**Rollout and recovery:**

Land passes in order. Each task is a revertable commit. If schema 6 fails, revert
Tasks 8 and 9 before any schema 7 work lands. If schema 7 fails, revert Tasks 10
through 12 without reverting the workflow and image-integrity passes. Do not push
until Task 13 completes.

---

**For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement
this plan task by task. Steps use checkbox syntax for tracking. Review the diff
and verification result at every task boundary before continuing.
