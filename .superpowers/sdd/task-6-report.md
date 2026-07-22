# Phase 2A Task 6 Report

## Status

Complete. Shared transform controls and the complete editable text-layer inspector are implemented. The progress ledger was not edited and no later-phase features were added.

## Commit

- `f941f5270e892d3c124467374357be7404599395` `feat: add editable text layer controls`

## Files

- `components/editor/TransformControls.tsx`: extracted X/Y, scale, rotation, opacity, and flip controls with the phase-one IDs, bounds, values, classes, history-group names, and interaction endings.
- `components/editor/TextInspector.tsx`: added multiline content, four-font selection, bounded size, fill and outline swatches, Lucide alignment segments, bounded letter spacing and outline width, and shared transform controls.
- `components/editor/EditorInspector.tsx`: changed the inspector boundary to the discriminated selected layer, retained image-only Transform/Crop/Adjustments behavior, and renders the Text inspector for text selection.
- `components/editor/EditorToolbar.tsx`: disables Crop and Adjust for text selection and associates both controls with a screen-reader explanation.
- `components/editor/EditorApp.tsx`: passes the selected layer and its type to the inspector and toolbar.
- `tests/editor-shell.test.ts`: added rendered component coverage for complete text controls, toolbar gating, and preservation of image control IDs and bounds.
- `tests/editor-history.test.ts`: added pure reducer coverage for coalesced text content/style history groups and explicit group endings.
- `tests/e2e/canvas-editor.spec.ts`: added a focused Chromium text-editing, image-tool gating, selection-fallback, and 390x844 fitting/scrolling flow.
- `.superpowers/sdd/task-6-report.md`: replaced the stale phase-one report that previously occupied this task-number path.

## Red Evidence

Clean focused red run before production implementation:

```powershell
npx tsx --test tests/editor-shell.test.ts tests/editor-history.test.ts
```

Exit code: `1`.

```text
tests 39
pass 37
fail 2
```

The failures were the intended missing behaviors:

- `toolbar disables image-only tools with an accessible explanation for text selection`: no explanation node and Crop/Adjust were enabled.
- `text inspector exposes complete editable text and shared transform controls`: the selected text fixture rendered the old `Transform` image inspector and no text controls.

Focused Chromium red run against the previous acceptance path:

```powershell
npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "normalizes tools after text duplicate and delete fallback selection paths"
```

Exit code: `1`; Playwright timed out attempting to click Adjust because the implemented button was correctly disabled for selected text. The flow was then updated to assert the required disabled state and exercise the text inspector.

## Green Evidence

Final focused component, pure, and history command:

```powershell
npx tsx --test tests/editor-shell.test.ts tests/editor-history.test.ts
```

Exit code: `0`.

```text
tests 39
pass 39
fail 0
cancelled 0
skipped 0
todo 0
```

Required typecheck:

```powershell
npm run typecheck
```

Exit code: `0`; `tsc --noEmit` passed with no diagnostics.

Production build:

```powershell
npm run build
```

Exit code: `0`; Vite 8.0.16 transformed 1,802 modules and built successfully in 2.16 seconds. Output included 62.73 kB CSS, 79.04 kB main JS, and 196.60 kB React vendor JS.

Focused Chromium flow:

```powershell
npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "edits text layers and gates image tools"
```

Exit code: `0`; `1 passed (3.6s)`. The flow edited multiline content, font, size, fill, alignment, letter spacing, outline, opacity, and X position; verified accessible disabled Crop/Adjust; exercised duplicate/delete fallback; then verified at 390x844 that the page and inspector had no horizontal overflow, the inspector scrolled vertically, canvas/inspector/toolbar regions did not overlap, and bottom transform controls remained reachable.

Whitespace verification:

```powershell
git diff --check
```

Exit code: `0`; Git emitted only the repository's LF-to-CRLF working-copy warnings.

## Self-Review

- `TransformControls` preserves every phase-one transform control ID: `editor-position-x`, `editor-position-y`, `editor-scale`, `editor-rotation`, and `editor-opacity`. Crop and adjustment IDs remain in `EditorInspector` unchanged.
- Phase-one bounds remain X/Y `-2..3` at `0.01`, scale `5..400` percent, rotation `-180..180`, opacity `0..100`, crop edges `0..45`, and adjustments `-100..100`.
- Image reset values and group names remain unchanged. Transform plus opacity still use `inspector-select-reset` and end as one undo group; crop and adjustment resets retain their existing groups and defaults.
- Shared range controls still end on pointer up, key up, and blur. Existing X/Y numeric keyboard and blur behavior and ungrouped flip behavior remain unchanged.
- Text content is a controlled multiline textarea with `maxLength=500`; reducer slicing remains authoritative. Every content change uses `inspector-text-content`, and blur, inspector unmount, or a selected text-layer change ends that group.
- Text style commands always send the complete authoritative `TextLayerStyle`. Font size is `8..400`, letter spacing `-2..40`, and outline width `0..20`; reducer normalization remains the final guard.
- Text numeric/range/color controls use stable history groups and explicit pointer/key/blur endings where applicable. Font and alignment are discrete edits.
- Fill and outline are native color swatches. Alignment uses Lucide `AlignLeft`, `AlignCenter`, and `AlignRight` icons with pressed state, accessible names, and titles.
- Crop and Adjust use native `disabled` for selected text, include disabled styling, and reference a concise screen-reader explanation with `aria-describedby`. Select remains enabled.
- Text selection always renders the `Text` heading and text controls, not the image empty state or image-only crop/adjustment controls.
- Text-specific `min-w-0`, bounded grid tracks, the existing 240px mobile inspector height, and overflow scrolling prevent horizontal expansion while keeping the complete control surface reachable.

## Concerns

- Browser acceptance was run in Chromium only, as requested; Firefox and WebKit were not run.
- Native color picker interaction details vary by operating system, but reducer normalization and component rendering are covered independently.
- No known functional concerns remain within Task 6 scope.

## Fix Review

### Status

DONE. Font-size editing now preserves raw keyboard drafts until an explicit commit, and text content history groups close on blur, inspector unmount, and selected text-layer changes. Phase-one image X/Y `NumberControl` behavior was not changed.

### Fix Commit

- `8f9de86ed38d49b0da7bc24a4843c6eefd7eaecd` `fix: harden text inspector edit lifecycles`

### Files

- `components/editor/TextInspector.tsx`: added the text-only font-size draft reducer/control, parsed and clamped commit behavior, Enter/Escape/blur handling, external layer synchronization, and stable layer-ID-scoped history cleanup.
- `tests/editor-shell.test.ts`: added pure draft coverage for sequential input, same-layer rerenders, empty and invalid drafts, clamping, restore, and selected-layer synchronization.
- `tests/editor-history.test.ts`: added reset atomicity, discrete redo invalidation, grouped color changes, and discrete style undo/redo coverage.
- `tests/e2e/canvas-editor.spec.ts`: expanded actual-control coverage for sequential font entry, empty blur, Enter, Escape, layer switching, one-step undo/redo, content unmount sessions, reset atomicity, discrete redo invalidation, and programmatic color-input grouping.

### Red Evidence

Focused unit/history command before implementation:

```powershell
npx tsx --test tests/editor-shell.test.ts tests/editor-history.test.ts
```

Exit code: `1`.

```text
tests 42
pass 41
fail 1
cancelled 0
skipped 0
todo 0
```

The only failure was `font-size draft preserves sequential input and normalizes commit, restore, and layer sync`: `createFontSizeDraftState` was `undefined` because the text-specific draft contract did not exist.

Focused Chromium command before implementation:

```powershell
npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "edits text layers and gates image tools|separates text content sessions"
```

Exit code: `1`; both tests failed.

```text
Expected font size: "72"
Received font size: "82"

Expected first undo content: "First session"
Received first undo content: "Text"
```

The first failure proved reducer normalization overwrote the first digit during sequential input. The second proved two content sessions separated by programmatic layer selection still shared one active history group when textarea blur did not run.

### Green Evidence

Final focused unit/history command:

```powershell
npx tsx --test tests/editor-shell.test.ts tests/editor-history.test.ts
```

Exit code: `0`.

```text
tests 42
pass 42
fail 0
cancelled 0
skipped 0
todo 0
```

Final focused Chromium command:

```powershell
npx playwright test tests/e2e/canvas-editor.spec.ts --project=chromium -g "edits text layers and gates image tools|separates text content sessions|groups text color control changes"
```

Exit code: `0`.

```text
3 passed (6.7s)
```

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

### Lifecycle Review

- Font size no longer uses shared `NumberControl`. Its local draft accepts intermediate digit, empty, and browser-valid number states without dispatching reducer commands per key.
- Blur and Enter parse the complete draft once, clamp it to `8..400`, restore the external value for empty or invalid drafts, dispatch at most one `inspector-font-size` style command, and explicitly end the group.
- Escape restores the current external value, suppresses blur commit, and ends any active group. Switching away with an uncommitted draft remounts from the selected layer's external value.
- Sequentially replacing `48` with `72` is verified through the real input. Undo returns directly to `48` and redo returns to `72`, proving one edit session creates one history step.
- `TextInspector` keeps the latest dispatch in a ref. Its cleanup effect depends only on `layer.id`, so ordinary content rerenders do not end the group; unmount or selected text-layer changes do.
- The content browser flow invokes layer buttons programmatically while the textarea remains focused, avoiding reliance on native blur. Two sessions then undo to the first session and original text separately, and redo independently.
- The existing image Reset button is exercised through the DOM: one undo restores both X and opacity, then a checkbox flip invalidates the available redo as a discrete edit.
- Color lifecycle coverage sets the native HTML color input value through Playwright three times, blurs it, and verifies one grouped undo step distinct from alignment. The native operating-system color picker UI was not opened or tested, and no such coverage is claimed.

### Concerns

- Browser lifecycle coverage remains Chromium-only; Firefox and WebKit were not run.
- Native operating-system color picker UI behavior remains outside the tested surface.
- No known functional concerns remain from the Task 6 review findings.
