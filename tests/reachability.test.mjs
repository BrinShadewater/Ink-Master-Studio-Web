import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  collectReachable,
  collectSourceModules,
  findDynamicImportSpecifiers,
} from '../scripts/reachability.mjs';

const repoRoot = process.cwd();
const hasPathEnding = (paths, suffix) =>
  [...paths].some((filePath) => filePath.endsWith(suffix));
const expectedOrphans = [
  'components/AnimatedBackground.tsx',
  'components/BatchProcessor.tsx',
  'components/CheckpointBar.tsx',
  'components/CustomerProofBuilder.tsx',
  'components/Dropzone.tsx',
  'components/ExportHistory.tsx',
  'components/Header.tsx',
  'components/JobLibrary.tsx',
  'components/PlacementPanel.tsx',
  'components/PreflightPanel.tsx',
  'components/PresetsPanel.tsx',
  'components/ProductionPackageReview.tsx',
  'components/ProfileEditor.tsx',
  'components/ProfileManager.tsx',
  'components/ProfileSelector.tsx',
  'components/ProfileUpdateReview.tsx',
  'components/StudioTopBar.tsx',
  'components/TemplatesPopover.tsx',
  'components/VersionsPopover.tsx',
  'editor/backgroundRemovalWorker.ts',
  'editor/imagetracerjs.d.ts',
  'editor/lookWorker.ts',
  'editor/traceProcessor.ts',
  'editor/traceWorker.ts',
  'editor/tshirtExportRenderer.ts',
  'editor/tshirtExportWorker.ts',
  'services/batch.ts',
  'services/designNames.ts',
  // Reached only from workers/imageProcessing.worker.ts, which is itself a
  // separate worker entry point rather than a static import from index.tsx.
  // Live code, not dead code.
  'services/designPlacement.ts',
  'services/exportHistory.ts',
  'services/geminiService.ts',
  'services/handoffDetails.ts',
  'services/jobModel.ts',
  'services/jobRepository.ts',
  'services/mockups.ts',
  'services/naming.ts',
  'services/objectUrls.ts',
  'services/packageReview.ts',
  'services/placement.ts',
  'services/portableJob.ts',
  'services/preflight.ts',
  'services/printFileValidation.ts',
  'services/processingRuns.ts',
  'services/productionPackage.ts',
  'services/productionProfiles.ts',
  'services/profileStorage.ts',
  'services/proofApproval.ts',
  'services/proofBuilder.ts',
  'services/qualityConfidence.ts',
  'services/recipeStorage.ts',
  'services/recipes.ts',
  'services/templateStorage.ts',
  'services/upscaleQuality.ts',
  'services/workflowPath.ts',
  'workers/imageProcessing.worker.ts',
];

test('every source module is reachable from the app entry or is a known orphan', async (t) => {
  const reachable = await collectReachable(path.join(repoRoot, 'index.tsx'));
  const sourceModules = await collectSourceModules(repoRoot);
  const orphans = sourceModules.filter((filePath) => !reachable.has(filePath));
  assert.deepEqual(orphans, expectedOrphans);
  assert.ok(reachable.has('App.tsx'), 'expected App.tsx to be reachable from the entry');
  assert.ok(
    reachable.has('components/editor/EditorApp.tsx'),
    'expected the lazily imported editor to be treated as reachable',
  );
  assert.ok(
    reachable.has('components/LandingPage.tsx'),
    'expected the landing page to be reachable',
  );

  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'inkmaster-reachability-'));
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  await mkdir(path.join(fixtureRoot, 'folder'));
  await Promise.all([
    writeFile(
      path.join(fixtureRoot, 'entry.ts'),
      `
        import {
          value,
        } from './multiline';
        import type { Model } from './types';
        export { value as folderValue } from './folder';
        export * from './reexport';
        import './side-effect.js';
        import './priority';
        void import("./lazy.mjs");
        import 'external-package';
      `,
    ),
    writeFile(path.join(fixtureRoot, 'multiline.ts'), "export { value } from './nested';"),
    writeFile(path.join(fixtureRoot, 'nested.ts'), 'export const value = 1;'),
    writeFile(path.join(fixtureRoot, 'types.ts'), 'export type Model = string;'),
    writeFile(path.join(fixtureRoot, 'folder', 'index.ts'), 'export const value = 2;'),
    writeFile(path.join(fixtureRoot, 'reexport.ts'), 'export const value = 3;'),
    writeFile(path.join(fixtureRoot, 'side-effect.js'), 'globalThis.fixtureLoaded = true;'),
    writeFile(path.join(fixtureRoot, 'lazy.mjs'), 'export default true;'),
    writeFile(path.join(fixtureRoot, 'priority.ts'), 'export const selected = true;'),
    writeFile(path.join(fixtureRoot, 'priority.tsx'), 'export const selected = false;'),
  ]);

  const fixtureReachable = await collectReachable(path.join(fixtureRoot, 'entry.ts'));
  assert.ok(hasPathEnding(fixtureReachable, '/entry.ts'));
  assert.ok(hasPathEnding(fixtureReachable, '/multiline.ts'));
  assert.ok(hasPathEnding(fixtureReachable, '/nested.ts'));
  assert.ok(hasPathEnding(fixtureReachable, '/types.ts'));
  assert.ok(hasPathEnding(fixtureReachable, '/folder/index.ts'));
  assert.ok(hasPathEnding(fixtureReachable, '/reexport.ts'));
  assert.ok(hasPathEnding(fixtureReachable, '/side-effect.js'));
  assert.ok(hasPathEnding(fixtureReachable, '/lazy.mjs'));
  assert.ok(hasPathEnding(fixtureReachable, '/priority.ts'));
  assert.ok(!hasPathEnding(fixtureReachable, '/priority.tsx'));
  assert.ok(!hasPathEnding(fixtureReachable, '/external-package'));
});

test('no module is loaded through a computed dynamic import path', async (t) => {
  const computed = await findDynamicImportSpecifiers(repoRoot);
  assert.deepEqual(
    computed,
    [],
    `computed import() specifiers defeat static reachability analysis: ${computed.join(', ')}`,
  );

  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'inkmaster-dynamic-imports-'));
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  await mkdir(path.join(fixtureRoot, 'components'));
  await writeFile(
    path.join(fixtureRoot, 'components', 'imports.ts'),
    `
      void import('./literal');
      void import("./double-quoted");
      void import(\`./\${name}.ts\`);
      void import(modulePath);
    `,
  );

  assert.deepEqual(
    await findDynamicImportSpecifiers(fixtureRoot),
    ['`./${name}.ts`', 'modulePath'],
  );
});
