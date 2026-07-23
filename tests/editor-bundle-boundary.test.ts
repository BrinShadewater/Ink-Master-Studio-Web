import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

test('production editor entry and workers preserve Phase 3A owner-editor scope boundaries', () => {
  const assetsDirectory = path.join(process.cwd(), 'dist', 'assets');
  const entryDirectory = path.join(assetsDirectory, 'js');
  const entryFiles = readdirSync(entryDirectory).filter((file) => /^index-.*\.js$/.test(file));
  assert.equal(entryFiles.length, 1, 'Expected one deterministic production entry bundle.');
  const entrySource = readFileSync(path.join(entryDirectory, entryFiles[0]), 'utf8');
  const workerFiles = readdirSync(assetsDirectory).filter((file) => /Worker-.*\.js$/.test(file));
  const traceWorkers = workerFiles.filter((file) => /^traceWorker-/.test(file));
  const backgroundWorkers = workerFiles.filter((file) => /^backgroundRemovalWorker-/.test(file));
  assert.equal(traceWorkers.length, 1, 'Expected one trace worker chunk.');
  assert.equal(backgroundWorkers.length, 1, 'Expected one background-removal worker chunk.');

  const workerSources = workerFiles.map((file) => ({
    file,
    source: readFileSync(path.join(assetsDirectory, file), 'utf8'),
  }));
  const scopedSources = [
    { file: entryFiles[0], source: entrySource },
    ...workerSources,
  ];
  for (const { file, source } of scopedSources) {
    assert.doesNotMatch(
      source,
      /geminiService|@google\/genai|services\/imageProcessing|workers\/imageProcessing/,
      `${file} imported a retired image-processing boundary.`,
    );
    for (const forbidden of [
      /ProductionPackage|production job|customer proof/i,
      /profile revision|handoff|batch order/i,
      /Print Lens|Printify Product/i,
    ]) {
      assert.doesNotMatch(
        source,
        forbidden,
        `${file} crossed the approved owner-editor scope.`,
      );
    }
  }

  assert.doesNotMatch(entrySource, /imagetracer/i);
  const traceSource = readFileSync(path.join(assetsDirectory, traceWorkers[0]), 'utf8');
  const backgroundSource = readFileSync(path.join(assetsDirectory, backgroundWorkers[0]), 'utf8');
  assert.match(traceSource, /imagetracer/i);
  assert.doesNotMatch(backgroundSource, /imagetracer/i);
});

test('Phase 3A product modules do not import legacy production, mockup, or AI services', () => {
  const productComponentsDirectory = path.join(process.cwd(), 'components', 'editor');
  const sourceFiles = [
    path.join(process.cwd(), 'editor', 'productCatalog.ts'),
    path.join(process.cwd(), 'editor', 'productModel.ts'),
    path.join(process.cwd(), 'editor', 'productGeometry.ts'),
    ...readdirSync(productComponentsDirectory)
      .filter((file) => /^Product.*\.tsx$/.test(file))
      .map((file) => path.join(productComponentsDirectory, file)),
  ];
  const forbiddenImport = /from\s+['"][^'"]*(?:services\/mockups|production|jobs|proofs|packages|batches|geminiService|@google\/genai)[^'"]*['"]/i;

  for (const file of sourceFiles) {
    assert.doesNotMatch(
      readFileSync(file, 'utf8'),
      forbiddenImport,
      `${path.relative(process.cwd(), file)} imported an out-of-scope service.`,
    );
  }
});
