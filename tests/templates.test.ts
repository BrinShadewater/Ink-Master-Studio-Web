import assert from 'node:assert/strict';
import test from 'node:test';

import { createStudioJob } from '../services/jobModel';
import {
  applyTemplateToJob,
  createTemplateFromJob,
  describeTemplate,
  describeTemplateChanges,
  duplicateTemplate,
  exportTemplates,
  importTemplates,
  mergeImportedTemplates,
  migrateTemplates,
  renameTemplate,
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
  assert.deepEqual(applied.appliedTemplate && {
    id: applied.appliedTemplate.id,
    name: applied.appliedTemplate.name,
  }, {
    id: template.id,
    name: 'Template',
  });
  assert.equal(typeof applied.appliedTemplate?.appliedAt, 'number');
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
  assert.equal(summary.mockups, 'Charcoal, Heather, Black');
  assert.match(summary.packageContents, /print master/);
  assert.match(summary.packageContents, /manifest/);
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

test('describes template package and mockup changes separately', () => {
  const source = createStudioJob('Source');
  source.packageOptions.includeUnderbase = true;
  source.packageOptions.selectedMockupIndices = [0, 6];
  const template = createTemplateFromJob(source, 'Template', '');
  const target = createStudioJob('Target');

  const changes = describeTemplateChanges(target, template);

  assert.ok(changes.includes('package contents'));
  assert.ok(changes.includes('mockup colors'));
});

test('round-trips templates through versioned JSON', () => {
  const template = createTemplateFromJob(createStudioJob('Job'), 'Template', '');
  const imported = importTemplates(exportTemplates([template]));

  assert.equal(imported.length, 1);
  assert.equal(imported[0].name, 'Template');
  assert.equal(imported[0].schemaVersion, 1);
});

test('merges imported templates with replacement, renaming, and duplicate skipping', () => {
  const existing = createTemplateFromJob(createStudioJob('Existing'), 'Daily DTG', '');
  existing.id = 'template_existing';
  const replacement = createTemplateFromJob(createStudioJob('Replacement'), 'Updated DTG', '');
  replacement.id = existing.id;
  const sameName = createTemplateFromJob(createStudioJob('Same name'), 'Daily DTG', '');
  sameName.id = 'template_same_name';
  const duplicateImport = createTemplateFromJob(createStudioJob('Duplicate'), 'Duplicate import', '');
  duplicateImport.id = sameName.id;

  const result = mergeImportedTemplates([existing], [replacement, sameName, duplicateImport]);

  assert.equal(result.added, 1);
  assert.equal(result.replaced, 1);
  assert.equal(result.renamed, 1);
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.templates.map((template) => template.id), ['template_existing', 'template_same_name']);
  assert.equal(result.templates[0].name, 'Updated DTG');
  assert.equal(result.templates[1].name, 'Daily DTG (Imported)');
});

test('renames imported replacements that collide with another existing template name', () => {
  const replaced = createTemplateFromJob(createStudioJob('Replaced'), 'Daily DTG', '');
  replaced.id = 'template_replaced';
  const existing = createTemplateFromJob(createStudioJob('Existing'), 'Left chest', '');
  existing.id = 'template_existing';
  const replacement = createTemplateFromJob(createStudioJob('Replacement'), 'Left chest', '');
  replacement.id = replaced.id;

  const result = mergeImportedTemplates([replaced, existing], [replacement]);

  assert.equal(result.replaced, 1);
  assert.equal(result.renamed, 1);
  assert.deepEqual(result.templates.map((template) => template.id), ['template_replaced', 'template_existing']);
  assert.equal(result.templates[0].name, 'Left chest (Imported)');
  assert.equal(result.templates[1].name, 'Left chest');
});

test('duplicates templates with isolated nested production settings and unique names', () => {
  const source = createTemplateFromJob(createStudioJob('Source'), 'Daily DTG', '');
  source.settings.colorReplacements = [{ sourceColor: '#ffffff', targetColor: '#f5f5f5', tolerance: 8 }];
  source.packageOptions.selectedMockupIndices = [0, 2, 4];
  const existingCopy = createTemplateFromJob(createStudioJob('Existing copy'), 'Daily DTG Copy', '');

  const copy = duplicateTemplate(source, [source, existingCopy]);

  assert.notEqual(copy.id, source.id);
  assert.equal(copy.name, 'Daily DTG Copy (Copy)');
  assert.deepEqual(copy.settings.colorReplacements, source.settings.colorReplacements);
  assert.deepEqual(copy.packageOptions.selectedMockupIndices, [0, 2, 4]);

  copy.settings.colorReplacements[0].targetColor = '#000000';
  copy.packageOptions.selectedMockupIndices.push(6);

  assert.equal(source.settings.colorReplacements[0].targetColor, '#f5f5f5');
  assert.deepEqual(source.packageOptions.selectedMockupIndices, [0, 2, 4]);
});

test('renames templates while avoiding sibling name collisions', () => {
  const daily = createTemplateFromJob(createStudioJob('Daily'), 'Daily DTG', '');
  daily.id = 'template_daily';
  const youth = createTemplateFromJob(createStudioJob('Youth'), 'Youth DTG', '');
  youth.id = 'template_youth';

  const unchanged = renameTemplate(daily, [daily, youth], '   ');
  const renamed = renameTemplate(daily, [daily, youth], 'Youth DTG');

  assert.equal(unchanged, daily);
  assert.equal(renamed.id, daily.id);
  assert.equal(renamed.name, 'Youth DTG (Renamed)');
  assert.equal(youth.name, 'Youth DTG');
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
