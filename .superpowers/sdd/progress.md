Local progressive upscale implementation

Task 1: complete (tests `npx tsx --test tests/upscale-quality.test.ts tests/upscale-engine.test.ts`)
Task 2: complete (tests `npx tsx --test tests/processing-result.test.ts tests/upscale-engine.test.ts`; `npm run typecheck`)
Task 3: complete (tests `npx playwright test tests/e2e/creator-flow.spec.ts --project=chromium -g "defers full export|creates a Printify-ready tee|extreme enlargement"`)
Task 4: complete (tests `npx playwright test tests/e2e/creator-flow.spec.ts --project=chromium -g "Printify preset export matrix"`)
Task 5: complete (local `git diff --check`; `npm run verify`; production tee acceptance passed)

Canvas-first editor foundation (plan commit 0e26e67)

Execution location: current checkout on main (owner declined an isolated worktree on 2026-07-20).
Task 1: complete (commits 275c919..04c9519, spec compliant, quality approved; cross-task UI and persistence constraints remain assigned to later tasks).
Task 2: complete (commits dcc4b45..ff02deb, spec compliant after shared-schema fix, quality approved; 262-test suite reported passing).
