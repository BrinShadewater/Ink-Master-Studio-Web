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
Task 3: complete (commits 98fe45d..0b4e375, spec compliant, quality approved; 267-test suite reported passing).
Task 4: complete (commits 3731198..71ced1f, spec compliant after source-URL ownership clarification, quality approved; 272-test suite reported passing).
Task 5: complete (commits e3e97bd..2ba985a, spec compliant after async race and deletion-lease fixes, quality approved; 285-test suite reported passing).
Task 6: complete (commits 6dc6a87..0bf8991, spec compliant after identity and draft-input fixes, quality approved; 292-test suite reported passing).
Task 7: complete (commits 6ae429c..f37bf65, spec compliant, quality approved; 294 unit/style tests and 4 E2E tests reported passing). Minor final-review note: pre-switch failing E2E run was not captured; no head-revision defect.
Final review: complete (range 275c919..ac61072, ready to merge; no critical or important findings). The remaining mobile retry hit-target minor was resolved with a measured 24x24 target and focused E2E coverage.

Phase 2A creative layers (plan commit ff34879)

Execution location: current checkout on main (continuing the owner-approved phase-one workflow).
Task 1: complete (commits 7ac3390..fea3d1b, spec compliant and quality approved after typecheck and save-normalization fixes; 26 focused tests and typecheck reported passing).
