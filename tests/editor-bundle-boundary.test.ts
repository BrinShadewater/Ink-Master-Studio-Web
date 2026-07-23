import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

test('production editor entry and workers preserve Phase 2C scope boundaries', () => {
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
    assert.doesNotMatch(
      source,
      /ProductionPackage|Print Lens|mockup|Printify Product/i,
      `${file} crossed the approved owner-editor scope.`,
    );
  }

  assert.doesNotMatch(entrySource, /imagetracer/i);
  const traceSource = readFileSync(path.join(assetsDirectory, traceWorkers[0]), 'utf8');
  const backgroundSource = readFileSync(path.join(assetsDirectory, backgroundWorkers[0]), 'utf8');
  assert.match(traceSource, /imagetracer/i);
  assert.doesNotMatch(backgroundSource, /imagetracer/i);
});
