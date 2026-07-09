# Local Progressive Upscale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically enhance undersized artwork locally during final export, allow extreme enlargement with an honest warning, and keep upload-time previews bounded.

**Architecture:** Pure helpers classify enlargement and plan bounded resize passes. The existing module worker executes those passes with `OffscreenCanvas`, reports pass progress, and returns structured upscale metadata. Default mode requests a small preview after upload and creates the full Printify file only when Download is pressed; Advanced mode keeps its existing full-result workflow.

**Tech Stack:** React 19, TypeScript 5.8, Vite 8, Web Workers, `createImageBitmap`, `OffscreenCanvas`, Node test runner, Playwright.

## Global Constraints

- Artwork remains local; this release adds no model download, remote upload, provider, endpoint, API key, or AI setting.
- Progressive resize passes may enlarge by at most 2x per pass.
- Above 4x remains downloadable with a strong warning.
- Full-resolution enhancement runs only for final default-mode export.
- Preview work is bounded to 1600 pixels on its longest side.
- Worker progress, cancellation, timeout, and retry behavior remain functional.
- Missing detail is never described as restored.
- `npm run verify` must pass before deployment.

---

## File Structure

- Create `services/upscaleEngine.ts`: pure ratio classification, pass planning, metadata types, and the future engine method union.
- Create `tests/upscale-engine.test.ts`: boundary and pass-planning tests.
- Modify `services/upscaleQuality.ts`: creator-facing copy and removal of the extreme-enlargement hard block.
- Modify `tests/upscale-quality.test.ts`: exact warning behavior at and above 4x.
- Modify `types.ts`: processing purpose and result metadata.
- Modify `workers/imageProcessing.worker.ts`: bounded preview sizing and progressive worker enlargement.
- Modify `services/imageProcessingWorkerClient.ts`: transport result metadata from worker to React.
- Modify `App.tsx`: separate default preview processing from final export processing.
- Modify `components/SimpleCreatorFlow.tsx`: display export state and permit warned downloads.
- Modify `tests/e2e/creator-flow.spec.ts`: deferred export, extreme warning, cancellation, and preset matrix coverage.

### Task 1: Quality Policy and Pass Planner

**Files:**
- Create: `services/upscaleEngine.ts`
- Create: `tests/upscale-engine.test.ts`
- Modify: `services/upscaleQuality.ts`
- Modify: `tests/upscale-quality.test.ts`

**Interfaces:**
- Produces: `UpscaleMethod`, `UpscaleResultMetadata`, `calculateUpscaleRatio()`, and `planProgressiveResize()`.
- Produces: `assessUpscaleQuality()` with levels `'ready' | 'good' | 'caution' | 'extreme'` and no enlargement-based download block.

- [ ] **Step 1: Write failing policy and planner tests**

```ts
test('allows extreme enlargement with a strong warning', () => {
  assert.deepEqual(assessUpscaleQuality(900, 1080, 4500, 5400), {
    ratio: 5,
    level: 'extreme',
    blocksDownload: false,
    detail: 'This image needs 5x enlargement. Download is allowed, but fine detail may look soft or artificial.',
  });
});

test('plans progressive passes no larger than 2x', () => {
  assert.deepEqual(planProgressiveResize(900, 1080, 5), [
    { width: 1800, height: 2160 },
    { width: 3600, height: 4320 },
    { width: 4500, height: 5400 },
  ]);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npx tsx --test tests/upscale-quality.test.ts tests/upscale-engine.test.ts`

Expected: FAIL because `upscaleEngine.ts` and the `extreme` policy do not exist.

- [ ] **Step 3: Implement the pure engine contract**

```ts
export type UpscaleMethod = 'none' | 'local-progressive' | 'ai';

export interface UpscaleResultMetadata {
  method: UpscaleMethod;
  ratio: number;
  sourceSize: [number, number];
  targetSize: [number, number];
}

export const calculateUpscaleRatio = (
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
) => Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight, 1);

export const planProgressiveResize = (
  sourceWidth: number,
  sourceHeight: number,
  scale: number,
) => {
  const passes: Array<{ width: number; height: number }> = [];
  let width = sourceWidth;
  let height = sourceHeight;
  const targetWidth = Math.round(sourceWidth * Math.max(scale, 1));
  const targetHeight = Math.round(sourceHeight * Math.max(scale, 1));
  while (width < targetWidth) {
    const nextScale = Math.min(2, targetWidth / width);
    width = Math.round(width * nextScale);
    height = Math.round(sourceHeight * (width / sourceWidth));
    passes.push({ width, height });
  }
  return passes;
};
```

For default FIT behavior, pass `Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight)` into the planner so the source aspect ratio is preserved. COVER uses the corresponding maximum scale; STRETCH retains its existing direct artboard render. Update the extreme assessment to return `level: 'extreme'`, `blocksDownload: false`, and the exact warning in Step 1. Keep the existing ready, good, and caution boundaries.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npx tsx --test tests/upscale-quality.test.ts tests/upscale-engine.test.ts`

Expected: all policy and planner tests pass.

- [ ] **Step 5: Commit**

```powershell
git add services/upscaleEngine.ts services/upscaleQuality.ts tests/upscale-engine.test.ts tests/upscale-quality.test.ts
git commit -m "Add local upscale quality policy"
```

### Task 2: Worker Progressive Resize and Metadata

**Files:**
- Modify: `types.ts`
- Modify: `workers/imageProcessing.worker.ts`
- Modify: `services/imageProcessingWorkerClient.ts`
- Create: `tests/processing-result.test.ts`

**Interfaces:**
- Consumes: `planProgressiveResize()` and `UpscaleResultMetadata` from Task 1.
- Produces: `ProcessingSettings.purpose?: 'preview' | 'export'`.
- Produces: `ProcessedResult.upscale: UpscaleResultMetadata`.

- [ ] **Step 1: Write failing result-contract tests**

```ts
test('describes an unchanged export', () => {
  assert.deepEqual(buildUpscaleMetadata(5000, 6000, 4500, 5400), {
    method: 'none',
    ratio: 1,
    sourceSize: [5000, 6000],
    targetSize: [4500, 5400],
  });
});

test('describes a progressive export', () => {
  assert.deepEqual(buildUpscaleMetadata(2500, 3000, 4500, 5400), {
    method: 'local-progressive',
    ratio: 1.8,
    sourceSize: [2500, 3000],
    targetSize: [4500, 5400],
  });
});
```

- [ ] **Step 2: Run the contract test and verify RED**

Run: `npx tsx --test tests/processing-result.test.ts`

Expected: FAIL because `buildUpscaleMetadata()` and result metadata do not exist.

- [ ] **Step 3: Add processing purpose and metadata types**

```ts
// Add to ProcessingSettings after targetDpi.
purpose?: 'preview' | 'export';

export interface ProcessedResult {
  blob: Blob;
  url: string;
  previewUrl?: string;
  width: number;
  height: number;
  upscale: UpscaleResultMetadata;
}
```

Extend worker `complete` messages with `upscale: UpscaleResultMetadata` and require the client to copy it into `ProcessedResult`.

- [ ] **Step 4: Implement progressive worker rendering**

Add a worker helper that creates one `OffscreenCanvas` per planned pass, enables high-quality smoothing, draws the previous source, closes the previous `ImageBitmap` where applicable, yields, and posts:

```ts
postProgress(
  id,
  18 + Math.round(((index + 1) / passes.length) * 12),
  `Enhancing image (${index + 1} of ${passes.length})`,
);
```

Use the progressively enlarged source for final placement. Apply restrained sharpening only when `method === 'local-progressive'`; clamp the automatic amount so it cannot exceed the existing equivalent of `sharpness: 12`. Preserve any stronger explicit Advanced-mode sharpness setting.

- [ ] **Step 5: Bound preview processing**

When `settings.purpose === 'preview'`, scale the requested target so its longest side is at most 1600 pixels and return metadata based on the original product target. Do not encode product DPI into preview output.

- [ ] **Step 6: Run focused tests and typecheck**

Run: `npx tsx --test tests/processing-result.test.ts tests/upscale-engine.test.ts`

Expected: all focused tests pass.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 7: Commit**

```powershell
git add types.ts workers/imageProcessing.worker.ts services/imageProcessingWorkerClient.ts tests/processing-result.test.ts
git commit -m "Run progressive upscaling in image worker"
```

### Task 3: Preview First, Export on Download

**Files:**
- Modify: `App.tsx`
- Modify: `components/SimpleCreatorFlow.tsx`
- Modify: `tests/e2e/creator-flow.spec.ts`

**Interfaces:**
- Consumes: `ProcessingSettings.purpose` and `ProcessedResult.upscale` from Task 2.
- Produces: default-mode `onDownload: () => Promise<void>` behavior that builds and downloads the full result.

- [ ] **Step 1: Write a failing browser test for deferred export**

Intercept worker requests in a local-only Playwright test and record `event.data.settings.purpose`. Assert that upload sends `preview`, then clicking Download sends `export`.

```ts
expect(purposesBeforeDownload).toEqual(['preview']);
await page.getByRole('button', { name: 'Download print file' }).click();
expect(allPurposes).toEqual(['preview', 'export']);
```

- [ ] **Step 2: Run the browser test and verify RED**

Run: `npx playwright test tests/e2e/creator-flow.spec.ts --project=chromium -g "defers full export"`

Expected: FAIL because upload currently performs the full-size process and Download only reuses its blob.

- [ ] **Step 3: Split preview and export state in `App.tsx`**

In default mode, call `processImage()` from the existing effect with:

```ts
{ ...settings, purpose: advancedMode ? 'export' : 'preview' }
```

In `handleSimpleDownload`, create a fresh controller, call:

```ts
const exportResult = await processImage(originalImage, {
  ...settings,
  purpose: 'export',
}, {
  signal: controller.signal,
  timeoutMs: 120_000,
  onProgress: setProcessingProgress,
});
```

Add `simpleExportResult: ProcessedResult | null` and `simpleExportError: string | null` state. Clear both when the source or selected product changes. If `exportResult.blob.size` exceeds `printify.maxBytes.png`, keep the preview on screen, set `simpleExportError` to `The generated PNG is over Printify's 100 MB limit. Try a smaller product or simpler artwork.`, and do not start a download. Otherwise set `simpleExportResult`, download the blob, record it in export history, revoke its object URLs after history owns its blob, and retain the bounded preview result on screen. Advanced mode continues to use the existing full-result behavior.

- [ ] **Step 4: Update creator state and copy**

Pass `simpleExportResult` and `simpleExportError` into `SimpleCreatorFlow`. Treat `extreme` as the amber warning state. Heading remains `Ready for <product>`. Before export, the size check reads `Final file size is checked during download.` and does not use the preview blob size. Download is disabled only for a missing preview or active processing. After export, show the final byte count or the over-limit error. The completed checklist uses `simpleExportResult.upscale.method === 'local-progressive'` to label local enhancement.

- [ ] **Step 5: Run focused browser tests and verify GREEN**

Run: `npx playwright test tests/e2e/creator-flow.spec.ts --project=chromium -g "defers full export|creates a Printify-ready tee|extreme enlargement"`

Expected: all selected tests pass, the final PNG is 4500x5400 at 300 DPI, and the >4x case downloads after showing the strong warning.

- [ ] **Step 6: Commit**

```powershell
git add App.tsx components/SimpleCreatorFlow.tsx tests/e2e/creator-flow.spec.ts
git commit -m "Export enhanced print files on demand"
```

### Task 4: Printify Preset Export Matrix

**Files:**
- Modify: `tests/e2e/creator-flow.spec.ts`

**Interfaces:**
- Consumes: the product buttons and export behavior from Task 3.
- Produces: regression coverage for every current Printify product preset.

- [ ] **Step 1: Add table-driven failing acceptance coverage**

Use representative fixtures and assert the downloaded PNG header:

```ts
const cases = [
  { button: 'T-shirt', source: [2500, 3000], output: [4500, 5400], dpi: 300 },
  { button: 'Hoodie', source: [1800, 1200], output: [3531, 2352], dpi: 300 },
  { button: 'Mug', source: [1200, 560], output: [2475, 1155], dpi: 300 },
  { button: 'Poster', source: [1600, 2400], output: [3600, 5400], dpi: 300 },
  { button: 'Blanket', source: [2500, 3000], output: [7825, 9325], dpi: 150 },
] as const;
```

For each case, assert exact width, height, RGB/RGBA color type, expected pixels-per-meter, and output below 100,000,000 bytes.

- [ ] **Step 2: Run the matrix and verify RED**

Run: `npx playwright test tests/e2e/creator-flow.spec.ts --project=chromium -g "Printify preset export matrix"`

Expected: FAIL on any remaining product-selection, timeout, metadata, or size-cap defect.

- [ ] **Step 3: Make only matrix-required corrections**

Correct preset-specific product selection, progress timeout, or encoding behavior exposed by Step 2. Do not change validated preset dimensions.

- [ ] **Step 4: Run the matrix and verify GREEN**

Run: `npx playwright test tests/e2e/creator-flow.spec.ts --project=chromium -g "Printify preset export matrix"`

Expected: five passing product cases. Record elapsed time per case in test annotations and require the tee acceptance case to remain below 60 seconds.

- [ ] **Step 5: Commit**

```powershell
git add tests/e2e/creator-flow.spec.ts
git add App.tsx components/SimpleCreatorFlow.tsx workers/imageProcessing.worker.ts
git commit -m "Cover Printify export preset matrix"
```

### Task 5: Full Verification and Production Acceptance

**Files:**
- Modify only files required by a failing gate.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: verified deployable branch.

- [ ] **Step 1: Run static diff checks**

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 2: Run the repository gate**

Run: `npm run verify`

Expected: unit, build, and Chromium suites all pass.

- [ ] **Step 3: Push the verified commits**

```powershell
git push origin main
```

- [ ] **Step 4: Wait for the Vercel asset hash to change**

Fetch `https://inkmasterstudio.com/` with `Cache-Control: no-cache` until its `/assets/js/index-*.js` entry differs from the pre-push asset.

- [ ] **Step 5: Run production acceptance**

```powershell
$env:PLAYWRIGHT_BASE_URL='https://inkmasterstudio.com'
npx playwright test tests/e2e/creator-flow.spec.ts --project=chromium -g "creates a Printify-ready tee"
```

Expected: pass under 60 seconds with a 4500x5400, 300-DPI PNG below 100 MB and no browser errors.

- [ ] **Step 6: Confirm repository state**

Run: `git status --short`

Expected: no output.

Run: `git rev-parse HEAD; git rev-parse origin/main`

Expected: identical hashes.
