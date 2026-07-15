# Codex Handoff

Updated: 2026-07-15

## Current Product Direction

InkMaster Studio is now being rebuilt around a creator-first Printify flow:

1. Drop image.
2. Pick product.
3. Position/edit the design.
4. Download a compliant PNG.

Advanced print-shop features still exist, but they should stay behind Advanced mode. Default mode should avoid job/proof/handoff language.

## Current Repo State

- Repo: `C:\Users\Alex\Desktop\Projects\Claude\Projects\inkmasterstudio\InkMasterStudio`
- Branch: `main`
- Remote: `origin/main`
- Deploy: Vercel deploys production on push to `main`
- Git executable in this shell: `C:\Program Files\Git\mingw64\libexec\git-core\git.exe`
- Push command that works here:

```powershell
& 'C:\Program Files\Git\mingw64\libexec\git-core\git.exe' -c credential.helper=wincred push origin main
```

The push command may print stale `credential-manager` warnings, but prior pushes succeeded.

## Recent Shipped Work

- `580608d Add print file validation receipt`
  - Parses the actual downloaded PNG.
  - Shows final dimensions, DPI metadata, file size, RGB/RGBA type, and transparency state.
  - Adds a Printify upload checklist.
  - Adds parser/unit coverage and edited-export E2E coverage.
- `d263551 Polish creator presets and mobile editor`
  - Adds creator presets, reusable setup, mobile polish, and export summary.
- `1e16f62 Add creator crop and image adjustments`
  - Adds crop, brightness, contrast, saturation, sharpness, opacity, undo/redo, and before/after preview.
- `90e528c Add visual print placement editor`
  - Adds drag/resize/rotate placement canvas and quick placement presets.
- `eb7b1d3 Add creator print placement controls`
  - Adds numeric placement/background controls and worker placement support.

This handoff update also adds the in-progress quality-confidence panel work in the current commit being prepared.

## Verification Expectations

Use the repo gate before considering a phase done:

```powershell
npm run verify
```

Useful focused commands:

```powershell
npm run typecheck
npx tsx --test tests/quality-confidence.test.ts
npx tsx --test tests/print-file-validation.test.ts
npx playwright test tests/e2e/creator-flow.spec.ts --project=chromium -g "creates a Printify-ready tee"
```

Production smoke after push:

```powershell
$env:PLAYWRIGHT_BASE_URL='https://inkmasterstudio.com'
npx playwright test tests/e2e/creator-flow.spec.ts --project=chromium -g "creates a Printify-ready tee"
```

## Current Implementation Areas

- Default creator UI: `components/SimpleCreatorFlow.tsx`
- Final PNG validation: `services/printFileValidation.ts`
- Quality confidence: `services/qualityConfidence.ts`
- Printify presets: `specs/printify.ts`
- Worker pipeline: `workers/imageProcessing.worker.ts`
- Worker client timeout/cancel handling: `services/imageProcessingWorkerClient.ts`
- Main download flow: `App.tsx` `handleDownloadPrintFile`
- Creator E2E coverage: `tests/e2e/creator-flow.spec.ts`

## Product Behavior To Preserve

- Full export happens only after clicking `Download print file`; previews are downscaled.
- Download must never be gated by mockup generation.
- Extreme uprez should show a strong warning, but still allow download unless the file is truly invalid.
- AI enhancement/uprez can be added later; current uprez is local and honest about softness.
- Printify provider dimensions can vary, so default copy should say the preset targets a checked provider and may need adjustment for provider-specific warnings.
- Uploaded artwork stays local-first. AI cleanup must remain server-side through the existing API boundary.

## Next Best Work

1. Finish verifying and shipping the quality-confidence panel.
2. Add a small “provider mismatch” affordance after Printify upload feedback, likely a preset adjustment note or “try closest preset” path.
3. Continue reducing Advanced-mode leakage in default mode.
4. Add a small static help page or modal for “Why Printify still warned me” once more provider data exists.
5. Later: AI enhancement/uprez path, but keep it optional and clearly labeled.

## Known Test Notes

- Full Playwright creator flow is slow because it runs real export paths.
- The stalled-worker console error during full verify is intentional from the retry/stall test.
- Vite/Rolldown may print plugin timing warnings for terser and worker import handling; previous verify runs passed with those warnings.
