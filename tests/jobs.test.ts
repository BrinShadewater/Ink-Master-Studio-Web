import assert from 'node:assert/strict';
import test from 'node:test';

import { createStudioJob, duplicateStudioJob, migrateStudioJob } from '../services/jobModel';
import { archiveJob, getJob, listJobs, saveJob } from '../services/jobRepository';
import { exportPortableJob, importPortableJob } from '../services/portableJob';

test('creates a versioned job with production defaults', () => {
  const job = createStudioJob('River Street Tees');

  assert.equal(job.schemaVersion, 1);
  assert.equal(job.metadata.name, 'River Street Tees');
  assert.equal(job.printSpecification.method, 'DTG');
  assert.equal(job.printSpecification.widthInches, 12);
  assert.ok(job.activePlacementKey);
  assert.ok(job.placements[job.activePlacementKey]);
});

test('migrates partial legacy job data into the current schema', () => {
  const migrated = migrateStudioJob({
    id: 'legacy',
    metadata: { name: 'Legacy order' },
    settings: { threshold: 42 },
  });

  assert.equal(migrated.id, 'legacy');
  assert.equal(migrated.metadata.name, 'Legacy order');
  assert.equal(migrated.settings.threshold, 42);
  assert.equal(migrated.schemaVersion, 1);
  assert.ok(migrated.packageOptions.namingPattern.includes('{job}'));
});

test('duplicates jobs without sharing identity or export history', () => {
  const source = createStudioJob('Original');
  source.exports = [{
    id: 'export-1',
    filename: 'original.png',
    format: 'PNG',
    timestamp: 1,
    blob: new Blob(['png']),
  }];

  const duplicate = duplicateStudioJob(source);

  assert.notEqual(duplicate.id, source.id);
  assert.equal(duplicate.metadata.name, 'Original copy');
  assert.deepEqual(duplicate.exports, []);
  assert.equal(duplicate.sourceArtwork, source.sourceArtwork);
});

test('round-trips source artwork through a portable job archive', async () => {
  const source = createStudioJob('Portable');
  source.sourceArtwork = {
    name: 'artwork.svg',
    type: 'image/svg+xml',
    lastModified: 123,
    blob: new Blob(['<svg/>'], { type: 'image/svg+xml' }),
  };

  const archive = await exportPortableJob(source);
  const imported = await importPortableJob(archive);

  assert.equal(imported.metadata.name, 'Portable');
  assert.equal(imported.sourceArtwork?.name, 'artwork.svg');
  assert.equal(await imported.sourceArtwork?.blob.text(), '<svg/>');
});

test('rejects malformed portable job archives', async () => {
  await assert.rejects(
    () => importPortableJob(new Blob(['not a zip'])),
    /Invalid Ink Master job file/,
  );
});

test('archives jobs without removing them from local storage', async () => {
  const job = createStudioJob(`Archive ${Date.now()}`);
  await saveJob(job);

  const archived = await archiveJob(job.id);

  assert.ok(archived.archivedAt);
  assert.equal((await getJob(job.id))?.archivedAt, archived.archivedAt);
  assert.equal((await listJobs()).some((candidate) => candidate.id === job.id), false);
  assert.equal((await listJobs(true)).some((candidate) => candidate.id === job.id), true);
});
