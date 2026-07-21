# Phase 2A Task 5 Report

## Status

Complete. The approved ordered layer model is exposed through a bounded desktop layer panel and a fixed full-height mobile drawer. The progress ledger was not edited.

## Commit

- `60025499af9f2ae77bae924728667005b5a06b80` `feat: add responsive layer management`

## Files

- `components/editor/LayerPanel.tsx`: added topmost-first layer rows, ID-based selection and commands, editable-name draft state, visibility controls, selected-row action strip, boundary guards, and the accessible mobile drawer.
- `components/editor/EditorApp.tsx`: integrated the 280px desktop rail split, mobile drawer state, explicit text-layer add/select behavior, text-selection tool switching, and a dedicated secondary raster input wired to `workspace.importLayerFile`.
- `components/editor/EditorToolbar.tsx`: added the mobile-only Lucide `Layers` command with a stable 40px target, tooltip, focus ring, and opener ref.
- `components/editor/EditorInspector.tsx`: moved desktop border ownership to the inspector so the measured rail section remains exactly 280px inside the split rail.
- `components/useAccessibleDialog.ts`: added an optional explicit return-focus ref while retaining previous-focus fallback and the existing focus trap/Escape behavior.
- `tests/editor-shell.test.ts`: added focused component and pure-behavior coverage for controls, ordering, IDs, edge guards, final-layer protection, name commit/restore, drawer header layout, text selection, and text creation.
- `tests/accessible-dialog.test.ts`: added explicit return-focus target precedence coverage.
- `tests/e2e/canvas-editor.spec.ts`: made the primary upload helper target the newly labeled primary input after Task 5 introduced the required second file input.
- `.superpowers/sdd/task-5-report.md`: this report.

## Red Evidence

Initial panel test command before production implementation:

```powershell
npx tsx --test tests/editor-shell.test.ts
```

Exit code: `1`.

```text
ERR_MODULE_NOT_FOUND: Cannot find module components/editor/LayerPanel
tests 1
pass 0
fail 1
```

Integration test command before drawer return-focus and panel handlers existed:

```powershell
npx tsx --test tests/editor-shell.test.ts tests/accessible-dialog.test.ts
```

Exit code: `1`.

```text
useAccessibleDialog does not provide getDialogReturnFocusTarget
EditorApp does not provide addTextLayerFromPanel
tests 2
pass 0
fail 2
```

Self-review drawer-header regression before moving Close layers into the header action group:

```powershell
npx tsx --test tests/editor-shell.test.ts
```

Exit code: `1`; `16` passed and `1` failed because the panel header did not contain `aria-label="Close layers"`.

The required second input exposed an existing ambiguous E2E selector:

```powershell
npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "imports, edits, duplicates"
```

Exit code: `1`. `locator('input[type="file"]')` resolved to both the primary and layer-image inputs. The inputs were given distinct accessible labels and the existing primary upload helper now targets `Import artwork file`.

Rendered QA then proved Escape restored the name but also closed the drawer. A focused event test was added before the fix:

```powershell
npx tsx --test tests/editor-shell.test.ts
```

Exit code: `1`; `LayerPanel` did not yet export `restoreLayerNameDraft`. The implementation now prevents default behavior and propagation before restoring and blurring.

## Green Evidence

Final focused shell command:

```powershell
npx tsx --test tests/editor-shell.test.ts tests/accessible-dialog.test.ts
```

Exit code: `0`.

```text
tests 21
pass 21
fail 0
cancelled 0
skipped 0
todo 0
```

Final typecheck:

```powershell
npm run typecheck
```

Exit code: `0`; `tsc --noEmit` passed with no diagnostics.

Desktop acceptance flow after labeling the inputs and restoring exact rail width:

```powershell
npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "imports, edits, duplicates"
```

Exit code: `0`; `1 passed (6.5s)`. The existing assertion measured the inspector at exactly `280px`.

Mobile acceptance flow:

```powershell
npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "keeps the editor usable at 390 by 844"
```

Exit code: `0`; `1 passed (4.6s)`.

Whitespace command:

```powershell
git diff --check
```

Exit code: `0`; Git emitted only the repository's LF-to-CRLF working-copy warnings.

## Rendered QA

The app was served at `http://127.0.0.1:4173/` and exercised in the Codex in-app browser.

- Desktop panel and inspector both measured exactly `280px`; the canvas retained central priority.
- At `390x844`, the canvas measured `390x444` before, during, and after opening the drawer.
- The drawer measured `390x844`, initial focus landed on `Close layers`, and there were no console warnings or errors.
- Add text created a selected topmost `Text` row, forced the Select tool, closed the drawer, and returned focus to `Layers`.
- Reopening showed `Text` above the image row with ID-backed selection and correct move/delete guards.
- Enter committed `Headline`; Escape restored a later draft to `Headline`, blurred the input, and kept the drawer open.

## Self-Review

- Stored layers remain bottom-to-top. Rendering reverses only a copied array for display, while every select, visibility, rename, order, duplicate, and delete command carries the layer ID.
- Move up is disabled for the stored top edge, move down for the stored bottom edge, and delete for a one-layer variation.
- Layer-name state is keyed by layer ID, synchronizes external changes, trims on commit, applies type-specific empty fallbacks, and suppresses blur commit after Escape restoration.
- All panel and toolbar icon buttons use Lucide icons, `title` tooltips, visible focus rings, and targets of at least 32px; the existing tool buttons remain 40px.
- The desktop right column remains the existing `280px` grid track. Its layer panel is bounded to `180px..320px`; the inspector receives the flexible remainder without nested decorative cards.
- The mobile drawer is fixed outside the editor grid, so its lifecycle cannot resize the canvas. It reuses `useAccessibleDialog`, traps focus, supports Escape/backdrop close, and explicitly restores the Layers opener.
- Primary artwork and additional-layer inputs have distinct refs, labels, handlers, and workspace methods. The layer input resets after each selection.
- Add text dispatches `add-text-layer` followed by ID selection, switches to Select, and only changes mobile drawer state; the desktop panel remains visible.
- Task 6 text inspector controls were not implemented.

## Concerns

- The image file picker intentionally leaves the mobile drawer open after file selection; only Add text is required to close it in Task 5.
- Browser acceptance was run in Chromium and the in-app browser, not Firefox or WebKit.
- No known functional concerns remain within Task 5 scope.

## Fix Review

### Status

Complete. All three Task 5 review findings were fixed. The progress ledger was not edited.

### Fix Commit

- `0acb722a9d260fd95136016965ecabb2aea14ed8` `fix: harden responsive layer interactions`

### Findings Addressed

1. An open mobile layer drawer now listens to `(min-width: 768px)`. Crossing into desktop sets the dialog's explicit return target to the already-mounted desktop Layers region before closing and unmounting the drawer. The desktop region is programmatically focusable and has a visible focus ring. Normal mobile Escape/close still targets the mobile Layers opener.
2. Tool normalization now derives centrally from the selected layer ID and type in `EditorApp`. Any reducer path that selects a text layer, including explicit selection, add, duplicate, delete fallback, undo/redo, or variation switching, changes Crop or Adjust to Select. Layer click/add handlers no longer contain path-specific tool changes.
3. Both dedicated file inputs now use the native `hidden` attribute instead of `sr-only`, removing them from rendering and sequential focus. Their refs, distinct `aria-label` values, change handlers, and programmatic `click()` behavior remain intact. E2E upload helpers use direct labeled CSS selectors when assigning files to hidden inputs.

### Fix Files

- `components/editor/EditorApp.tsx`: responsive media-query dismissal, separate normal/desktop return-focus targets, centralized selected-text tool normalization, simplified layer handlers, and native hidden file inputs.
- `components/editor/LayerPanel.tsx`: optional panel ref/focusability, focus-ring styling, and generalized HTMLElement dialog return target.
- `tests/editor-shell.test.ts`: reducer-path normalization coverage for image deletion falling back to text from Crop and text duplication from Adjust.
- `tests/e2e/canvas-editor.spec.ts`: real Chromium breakpoint, normal mobile return-focus, hidden-input/ref-click, and reducer-path tool-normalization regressions.
- `.superpowers/sdd/task-5-report.md`: this appended Fix Review.

### Fix Red Evidence

Responsive focus regression before implementation:

```powershell
npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "releases the mobile layer focus trap"
```

Exit code: `1`; `1` failed. After resizing from `390x844` to desktop, the drawer locator still resolved to one dialog node instead of the expected zero:

```text
Expected: 0
Received: 1
```

Tool normalization tests before the centralized helper/effect:

```powershell
npx tsx --test tests/editor-shell.test.ts tests/accessible-dialog.test.ts
```

Exit code: `1`.

```text
EditorApp does not provide an export named 'normalizeToolForSelectedLayer'
tests 4
pass 3
fail 1
```

The three passing tests were the existing accessible-dialog tests; the editor shell module failed to load on the missing contract.

Hidden-input regression before replacing `sr-only`:

```powershell
npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "keeps dedicated file inputs hidden"
```

Exit code: `1`; `1` failed. Chromium resolved the primary input as visible:

```text
expect(locator).toBeHidden() failed
Expected: hidden
Received: visible
```

### Fix Green Evidence

Required shell command against the final code:

```powershell
npx tsx --test tests/editor-shell.test.ts tests/accessible-dialog.test.ts
```

Exit code: `0`.

```text
tests 23
pass 23
fail 0
cancelled 0
skipped 0
todo 0
```

Relevant Chromium command against the final code:

```powershell
npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "releases the mobile layer focus trap|keeps dedicated file inputs hidden|normalizes tools after text duplicate|keeps the editor usable at 390 by 844"
```

Exit code: `0`.

```text
4 passed (6.7s)
```

The resize test proves normal mobile Escape returns focus to Layers, reopening then resizing to `1200x844` removes the dialog role/node, moves focus to the visible desktop Layers region, and allows Tab to reach a rendered sequential target that is not BODY, `sr-only`, hidden, or negative-tabindex.

The tool-path test proves duplicating selected text while Adjust is active returns to Select, then selecting and deleting the image while Crop is active falls back to text and returns to Select.

The hidden-input test proves both inputs are hidden and carry the `hidden` attribute, then opens the file chooser through the visible Import artwork command and completes a painted import through the existing ref-triggered click.

Required typecheck:

```powershell
npm run typecheck
```

Exit code: `0`; `tsc --noEmit` passed with no diagnostics.

Required whitespace check:

```powershell
git diff --check
```

Exit code: `0`; Git emitted only the repository's LF-to-CRLF working-copy warnings.

### Fix Self-Review

- The drawer return ref is mutable by design: every ordinary open/close points it at the visible mobile opener, while only a matching desktop breakpoint event replaces it with the desktop panel before unmount cleanup reads it.
- The desktop panel is always mounted but CSS-hidden on mobile, so its ref exists when the media query changes and becomes visible at the same breakpoint. The Chromium test verifies the actual focused element is visible after the resize.
- The media-query listener exists only while the drawer is open, handles an already-desktop initial condition, and is removed when the drawer closes.
- Selected-layer ID and type are primitive effect dependencies. A fresh text ID from duplication, a delete fallback, undo/redo selection restoration, variation selection, or explicit selection all run the same normalizer. Image selection preserves the current tool.
- The effect uses functional state update semantics and returns the current value for image/no-selection paths, avoiding redundant behavior in event handlers.
- Native `hidden` excludes both file inputs from the accessible and sequential focus surfaces. Visible commands still invoke their refs, while automation targets the hidden inputs directly only for file assignment.
- No Task 6 text inspector controls or progress-ledger changes were introduced.

### Fix Concerns

- The breakpoint is intentionally tied to the Tailwind `md` contract at exactly `768px`; changing the design-system breakpoint requires updating both the media query and responsive classes together.
- Browser regression coverage is Chromium-only, as requested. Firefox and WebKit were not run.
- No known functional concerns remain from the three review findings.
