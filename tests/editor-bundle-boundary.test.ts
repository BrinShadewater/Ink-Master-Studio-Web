import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

test('production entry bundle excludes legacy workflow terminology', () => {
  const outputDirectory = path.join(process.cwd(), 'dist', 'assets', 'js');
  const entryFiles = readdirSync(outputDirectory).filter((file) => /^index-.*\.js$/.test(file));
  assert.equal(entryFiles.length, 1, 'Expected one deterministic production entry bundle.');
  const source = readFileSync(path.join(outputDirectory, entryFiles[0]), 'utf8');
  assert.doesNotMatch(source, /gemini|ProductionPackage|CustomerProof|Advanced mode/i);
});
