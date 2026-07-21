import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createEditorAsset,
  createEditorProject,
  duplicateVariation,
  migrateEditorProject,
} from '../editor/model';

test('creates a project that references but does not embed its source blob', () => {
  const asset = createEditorAsset('project_a', new Blob(['pixels'], { type: 'image/png' }), {
    name: 'still.png', width: 1600, height: 900,
  });
  const project = createEditorProject('Film still', asset);
  assert.equal(project.schemaVersion, 1);
  assert.equal(project.variations[0].layers[0].assetId, asset.id);
  assert.equal('blob' in project.variations[0].layers[0], false);
  assert.equal(asset.blob.size, 6);
});

test('duplicates a variation without sharing nested edit state', () => {
  const asset = createEditorAsset('project_a', new Blob(['x']), {
    name: 'source.webp', width: 800, height: 1200,
  });
  const source = createEditorProject('Poster', asset);
  const duplicate = duplicateVariation(source.variations[0], 'High contrast');
  duplicate.layers[0].transform.x = 0.25;
  assert.equal(source.variations[0].layers[0].transform.x, 0.5);
  assert.notEqual(duplicate.id, source.variations[0].id);
});

test('rejects malformed project records instead of inventing source references', () => {
  assert.throws(
    () => migrateEditorProject({ schemaVersion: 1, id: 'broken', variations: [] }),
    /valid variation/,
  );
});

test('migrates schema version one records and normalizes usable layers', () => {
  const project = migrateEditorProject({
    schemaVersion: 1,
    id: 'project_a',
    name: '',
    createdAt: 100,
    updatedAt: Number.NaN,
    activeVariationId: 'missing',
    productVariants: [{ unexpected: true }],
    variations: [{
      id: 'variation_a',
      name: 'Original',
      selectedLayerId: 'missing',
      layers: [
        { type: 'text', id: 'ignored', assetId: 'asset_a' },
        { type: 'image', id: 'layer_a', assetId: 'asset_a', transform: { x: 9, scale: 0 },
          crop: { x: 0.9, y: -1, width: 0.9, height: 2 },
          opacity: 2, adjustments: { brightness: -200, contrast: 50, saturation: 200 } },
      ],
    }],
  });

  assert.equal(project.name, 'Untitled design');
  assert.equal(project.updatedAt, 100);
  assert.deepEqual(project.productVariants, []);
  assert.equal(project.activeVariationId, 'variation_a');
  assert.equal(project.variations[0].selectedLayerId, 'layer_a');
  assert.deepEqual(project.variations[0].layers[0].transform, {
    x: 3, y: 0.5, scale: 0.05, rotation: 0, flipX: false, flipY: false,
  });
  assert.equal(project.variations[0].layers[0].crop.x, 0.9);
  assert.ok(Math.abs(project.variations[0].layers[0].crop.width - 0.1) < Number.EPSILON);
  assert.equal(project.variations[0].layers[0].crop.y, 0);
  assert.equal(project.variations[0].layers[0].crop.height, 1);
  assert.deepEqual(project.variations[0].layers[0].adjustments, {
    brightness: -100, contrast: 50, saturation: 100,
  });
});

test('rejects unsupported schemas and records without a valid created timestamp', () => {
  assert.throws(() => migrateEditorProject({ schemaVersion: 2 }), /Unsupported editor project schema/);
  assert.throws(() => migrateEditorProject({ schemaVersion: 1, id: 'project_a', createdAt: Infinity, variations: [{
    id: 'variation_a', layers: [{ type: 'image', id: 'layer_a', assetId: 'asset_a' }],
  }] }), /valid createdAt/);
});
