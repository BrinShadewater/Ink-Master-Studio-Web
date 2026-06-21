import assert from 'node:assert/strict';
import test from 'node:test';

import { createStudioJob } from '../services/jobModel';
import {
  applyTemplateToJob,
  createTemplateFromJob,
  exportTemplates,
  importTemplates,
  migrateTemplates,
} from '../services/templateStorage';
import { ItemType } from '../types';

test('creates operator templates separately from artwork and customer data', () => {
  const job = createStudioJob('Customer order');
  job.metadata.customerName = 'Sam';
  job.settings.itemType = ItemType.HOODIE;
  const template = createTemplateFromJob(job, 'Hoodie full front', 'Daily hoodie setup');

  assert.equal(template.name, 'Hoodie full front');
  assert.equal(template.itemType, ItemType.HOODIE);
  assert.equal('sourceArtwork' in template, false);
  assert.equal('metadata' in template, false);
});

test('applies production settings without replacing job identity or notes', () => {
  const source = createStudioJob('Source');
  source.metadata.notes = 'Keep this customer note';
  source.settings.itemType = ItemType.HOODIE;
  const template = createTemplateFromJob(source, 'Template', '');
  const target = createStudioJob('Target');
  target.metadata.notes = 'Target note';

  const applied = applyTemplateToJob(target, template);

  assert.equal(applied.id, target.id);
  assert.equal(applied.metadata.name, 'Target');
  assert.equal(applied.metadata.notes, 'Target note');
  assert.equal(applied.settings.itemType, ItemType.HOODIE);
});

test('round-trips templates through versioned JSON', () => {
  const template = createTemplateFromJob(createStudioJob('Job'), 'Template', '');
  const imported = importTemplates(exportTemplates([template]));

  assert.equal(imported.length, 1);
  assert.equal(imported[0].name, 'Template');
  assert.equal(imported[0].schemaVersion, 1);
});

test('drops malformed template entries during migration', () => {
  assert.deepEqual(migrateTemplates('[{"nope":true}]'), []);
  assert.deepEqual(migrateTemplates('not json'), []);
});
