import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createEditorAsset,
  createEditorProject,
  duplicateVariation,
  migrateEditorProject,
} from '../editor/model';

test('creates a schema three project that records immutable source metadata without embedding its blob', () => {
  const asset = createEditorAsset('project_a', new Blob(['pixels'], { type: 'image/png' }), {
    name: 'still.png', width: 1600, height: 900,
  });
  const project = createEditorProject('Film still', asset);
  assert.equal(project.schemaVersion, 3);
  assert.deepEqual(project.variations[0].look, { id: 'original', strength: 100 });
  assert.equal(project.sourceAssetId, asset.id);
  assert.deepEqual(project.sourceMetadata, {
    name: 'still.png', mimeType: 'image/png', width: 1600, height: 900,
  });
  const imageLayer = project.variations[0].layers[0];
  assert.equal(imageLayer.type, 'image');
  if (imageLayer.type !== 'image') throw new Error('Expected the source layer to be an image.');
  assert.equal(imageLayer.assetId, asset.id);
  assert.equal('blob' in imageLayer, false);
  assert.equal(asset.blob.size, 6);
});

test('duplicates a variation without sharing nested edit state', () => {
  const asset = createEditorAsset('project_a', new Blob(['x']), {
    name: 'source.webp', width: 800, height: 1200,
  });
  const source = createEditorProject('Poster', asset);
  const duplicate = duplicateVariation(source.variations[0], 'High contrast');
  duplicate.layers[0].transform.x = 0.25;
  assert.deepEqual(duplicate.look, source.variations[0].look);
  assert.notEqual(duplicate.look, source.variations[0].look);
  assert.equal(source.variations[0].layers[0].transform.x, 0.5);
  assert.notEqual(duplicate.id, source.variations[0].id);
});

test('rejects malformed project records instead of inventing source references', () => {
  assert.throws(
    () => migrateEditorProject({ schemaVersion: 1, id: 'broken', variations: [] }, []),
    /Project source image not found/,
  );
});

test('normalizes text layer values to the command and inspector contract', () => {
  const project = migrateEditorProject({
    schemaVersion: 2,
    id: 'project_a',
    name: 'Poster',
    createdAt: 100,
    sourceAssetId: 'asset_source',
    sourceMetadata: { name: 'source.png', mimeType: 'image/png', width: 1200, height: 800 },
    activeVariationId: 'variation_a',
    variations: [{
      id: 'variation_a',
      name: 'Original',
      selectedLayerId: 'text_a',
      layers: [
        {
          type: 'text', id: 'text_a', name: '', visible: 0, opacity: 2,
          transform: { x: 9, scale: 0 }, text: 42, fontFamily: 'Comic Sans MS', fontSize: -12,
          color: 'red', align: 'justify', letterSpacing: 100, outlineWidth: 99, outlineColor: '#12',
        },
      ],
    }],
  }, [{
    id: 'asset_source', projectId: 'project_a', name: 'source.png', mimeType: 'image/png',
    width: 1200, height: 800, createdAt: 50, blob: new Blob(['source'], { type: 'image/png' }),
  }]);

  const textLayer = project.variations[0].layers[0];
  assert.equal(project.schemaVersion, 3);
  assert.deepEqual(project.variations[0].look, { id: 'original', strength: 100 });
  assert.equal(textLayer.type, 'text');
  assert.equal(textLayer.name, 'Text');
  assert.equal(textLayer.visible, false);
  assert.equal(textLayer.opacity, 1);
  assert.deepEqual(textLayer.transform, {
    x: 3, y: 0.5, scale: 0.05, rotation: 0, flipX: false, flipY: false,
  });
  assert.equal(textLayer.text, 'Text');
  assert.equal(textLayer.fontFamily, 'Arial');
  assert.equal(textLayer.fontSize, 8);
  assert.equal(textLayer.color, '#000000');
  assert.equal(textLayer.align, 'left');
  assert.equal(textLayer.letterSpacing, 40);
  assert.equal(textLayer.outlineWidth, 20);
  assert.equal(textLayer.outlineColor, '#000000');
});

test('upgrades a version one project from its matching stored asset without changing image identities', () => {
  const asset = createEditorAsset('project_a', new Blob(['source'], { type: 'image/webp' }), {
    name: 'source.webp', width: 1200, height: 800,
  });
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
        { type: 'image', id: 'layer_a', assetId: asset.id, transform: { x: 9, scale: 0 },
          crop: { x: 0.9, y: -1, width: 0.9, height: 2 },
          opacity: 2, adjustments: { brightness: -200, contrast: 50, saturation: 200 } },
      ],
    }],
  }, [asset]);

  assert.equal(project.schemaVersion, 3);
  assert.deepEqual(project.variations[0].look, { id: 'original', strength: 100 });
  assert.equal(project.sourceAssetId, asset.id);
  assert.deepEqual(project.sourceMetadata, {
    name: 'source.webp', mimeType: 'image/webp', width: 1200, height: 800,
  });
  assert.equal(project.updatedAt, 100);
  assert.deepEqual(project.productVariants, []);
  assert.equal(project.activeVariationId, 'variation_a');
  assert.equal(project.variations[0].selectedLayerId, 'layer_a');
  const imageLayer = project.variations[0].layers[0];
  assert.equal(imageLayer.type, 'image');
  if (imageLayer.type !== 'image') throw new Error('Expected the migrated layer to be an image.');
  assert.equal(imageLayer.id, 'layer_a');
  assert.equal(imageLayer.assetId, asset.id);
  assert.deepEqual(imageLayer.transform, {
    x: 3, y: 0.5, scale: 0.05, rotation: 0, flipX: false, flipY: false,
  });
  assert.equal(imageLayer.crop.x, 0.9);
  assert.ok(Math.abs(imageLayer.crop.width - 0.1) < Number.EPSILON);
  assert.equal(imageLayer.crop.y, 0);
  assert.equal(imageLayer.crop.height, 1);
  assert.deepEqual(imageLayer.adjustments, {
    brightness: -100, contrast: 50, saturation: 100,
  });
});

test('migrates injected schema one Looks to Original', () => {
  const asset = createEditorAsset('project_schema_one', new Blob(['source']), {
    name: 'source.png', width: 10, height: 10,
  });
  const project = migrateEditorProject({
    schemaVersion: 1,
    id: 'project_schema_one',
    name: 'Legacy',
    createdAt: 100,
    activeVariationId: 'variation_schema_one',
    variations: [{
      id: 'variation_schema_one',
      name: 'Original',
      selectedLayerId: 'layer_schema_one',
      look: { id: 'high-contrast', strength: 100, contrast: 55, blackPoint: 12, saturation: 5 },
      layers: [{ type: 'image', id: 'layer_schema_one', assetId: asset.id }],
    }],
  }, [asset]);

  assert.deepEqual(project.variations[0].look, { id: 'original', strength: 100 });
});

test('migrates injected schema two Looks to Original', () => {
  const asset = createEditorAsset('project_schema_two', new Blob(['source']), {
    name: 'source.png', width: 10, height: 10,
  });
  const project = migrateEditorProject({
    schemaVersion: 2,
    id: 'project_schema_two',
    name: 'Legacy',
    createdAt: 100,
    sourceAssetId: asset.id,
    sourceMetadata: { name: asset.name, mimeType: asset.mimeType, width: asset.width, height: asset.height },
    activeVariationId: 'variation_schema_two',
    variations: [{
      id: 'variation_schema_two',
      name: 'Original',
      selectedLayerId: 'layer_schema_two',
      look: { id: 'duotone', strength: 100, shadowColor: '#111827', highlightColor: '#f59e0b', balance: 0 },
      layers: [{ type: 'image', id: 'layer_schema_two', assetId: asset.id }],
    }],
  }, [asset]);

  assert.deepEqual(project.variations[0].look, { id: 'original', strength: 100 });
});

test('normalizes saved schema three Look recipes', () => {
  const asset = createEditorAsset('project_a', new Blob(['source']), {
    name: 'source.png', width: 10, height: 10,
  });
  const project = migrateEditorProject({
    schemaVersion: 3,
    id: 'project_a',
    name: 'Poster',
    createdAt: 100,
    sourceAssetId: asset.id,
    sourceMetadata: { name: asset.name, mimeType: asset.mimeType, width: asset.width, height: asset.height },
    activeVariationId: 'variation_a',
    variations: [{
      id: 'variation_a', name: 'Original', selectedLayerId: 'layer_a',
      look: { id: 'duotone', strength: 100.4, shadowColor: '#ABC', highlightColor: 'invalid', balance: -80 },
      layers: [{ type: 'image', id: 'layer_a', assetId: asset.id }],
    }],
  }, [asset]);

  assert.equal(project.schemaVersion, 3);
  assert.deepEqual(project.variations[0].look, {
    id: 'duotone', strength: 100, shadowColor: '#aabbcc', highlightColor: '#f59e0b', balance: -50,
  });
});

test('rejects unsupported schemas and records without a valid created timestamp', () => {
  assert.throws(() => migrateEditorProject({ schemaVersion: 4 }, []), /Unsupported editor project schema/);
  const asset = createEditorAsset('project_a', new Blob(['source']), {
    name: 'source.png', width: 10, height: 10,
  });
  assert.throws(() => migrateEditorProject({ schemaVersion: 1, id: 'project_a', createdAt: Infinity, variations: [{
    id: 'variation_a', layers: [{ type: 'image', id: 'layer_a', assetId: asset.id }],
  }] }, [asset]), /valid createdAt/);
});
