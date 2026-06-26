import assert from 'node:assert/strict';
import test from 'node:test';

import { createStudioJob } from '../services/jobModel';
import {
  applyTemplateToJob,
  createTemplateFromJob,
  describeTemplate,
  describeTemplateChanges,
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

test('describes operator template production settings for review', () => {
  const job = createStudioJob('Review source');
  job.settings.itemType = ItemType.HOODIE;
  job.proofBranding.shopName = 'River City Prints';
  const template = createTemplateFromJob(job, 'Review template', '');

  const summary = describeTemplate(template);

  assert.equal(summary.product, ItemType.HOODIE);
  assert.equal(summary.printSize, '12×14 in DTG');
  assert.match(summary.placement, /full-front/);
  assert.match(summary.output, /PNG/);
  assert.equal(summary.proofBranding, 'River City Prints');
});

test('describes which job settings a template will replace', () => {
  const source = createStudioJob('Source');
  source.settings.itemType = ItemType.HOODIE;
  source.packageOptions.namingPattern = '{customer}_{placement}';
  source.proofBranding.shopName = 'Template shop';
  const template = createTemplateFromJob(source, 'Template', '');
  const target = createStudioJob('Target');

  const changes = describeTemplateChanges(target, template);

  assert.deepEqual(changes, ['product', 'naming', 'proof branding']);
});

test('round-trips templates through versioned JSON', () => {
  const template = createTemplateFromJob(createStudioJob('Job'), 'Template', '');
  const imported = importTemplates(exportTemplates([template]));

  assert.equal(imported.length, 1);
  assert.equal(imported[0].name, 'Template');
  assert.equal(imported[0].schemaVersion, 1);
});

test('keeps templates independent from production profile snapshots', () => {
  const job = createStudioJob('Profiled job');
  const template = createTemplateFromJob(job, 'Profile-independent template', '');
  const exported = exportTemplates([template]);
  const parsed = JSON.parse(exported);
  const portableTemplate = parsed.templates[0];

  assert.equal('productionProfile' in template, false);
  assert.equal('profileId' in template, false);
  assert.equal('profileRevision' in template, false);
  assert.equal('snapshot' in template, false);
  assert.equal('productionProfile' in portableTemplate, false);
  assert.equal('profileId' in portableTemplate, false);
  assert.equal('profileRevision' in portableTemplate, false);
  assert.equal('snapshot' in portableTemplate, false);
});

test('drops malformed template entries during migration', () => {
  assert.deepEqual(migrateTemplates('[{"nope":true}]'), []);
  assert.deepEqual(migrateTemplates('not json'), []);
});
