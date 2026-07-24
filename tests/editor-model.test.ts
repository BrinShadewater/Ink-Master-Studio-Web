import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createDefaultBackgroundRemoval,
  normalizeBackgroundRemoval,
  normalizeCleanupCorrectionDocument,
  serializeBackgroundRemovalInput,
} from '../editor/imagePrepModel';
import {
  createEditorAsset,
  createEditorProject,
  duplicateVariation,
  migrateEditorProject,
} from '../editor/model';
import {
  createDefaultTraceSettings,
  createTraceFingerprint,
  normalizeTraceSettings,
  serializeTraceInput,
} from '../editor/traceModel';

test('normalizes background removal without mutating caller-owned state', () => {
  assert.deepEqual(createDefaultBackgroundRemoval(), {
    enabled: false,
    mode: 'auto',
    pickedColor: null,
    pickedPoint: null,
    tolerance: 24,
    edgeFeather: 1,
    correctionAssetId: null,
    preparedAssetId: null,
    inputFingerprint: '',
  });
  const input = {
    enabled: 1,
    mode: 'picked',
    pickedColor: '#ABC',
    pickedPoint: { x: -1, y: 2 },
    tolerance: 101.4,
    edgeFeather: -1,
    correctionAssetId: 'correction-a',
    preparedAssetId: 'prepared-a',
    inputFingerprint: 'fingerprint-a',
  };
  const snapshot = structuredClone(input);
  assert.deepEqual(normalizeBackgroundRemoval(input), {
    enabled: true,
    mode: 'picked',
    pickedColor: '#aabbcc',
    pickedPoint: { x: 0, y: 1 },
    tolerance: 100,
    edgeFeather: 0,
    correctionAssetId: 'correction-a',
    preparedAssetId: 'prepared-a',
    inputFingerprint: 'fingerprint-a',
  });
  assert.deepEqual(input, snapshot);
  assert.equal(
    serializeBackgroundRemovalInput(normalizeBackgroundRemoval(input)),
    serializeBackgroundRemovalInput(normalizeBackgroundRemoval(structuredClone(input))),
  );
});

test('normalizes bounded cleanup correction documents deterministically', () => {
  const points = Array.from({ length: 20_002 }, (_, index) => ({
    x: index === 0 ? Number.NaN : index / 20_000,
    y: index / 20_000,
  }));
  const document = normalizeCleanupCorrectionDocument({
    schemaVersion: 1,
    strokes: [{
      mode: 'erase',
      size: 999,
      points: [{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, ...points],
    }],
  });
  assert.equal(document.schemaVersion, 1);
  assert.equal(document.strokes.length, 1);
  assert.equal(document.strokes[0].size, 128);
  assert.equal(document.strokes[0].points.length, 20_000);
  assert.deepEqual(document.strokes[0].points[0], { x: 0.5, y: 0.5 });
});

test('normalizes trace controls and fingerprints source plus settings', () => {
  assert.deepEqual(createDefaultTraceSettings(), {
    colors: 6,
    detail: 60,
    smoothing: 35,
    blur: 0,
    palette: [],
  });
  const normalized = normalizeTraceSettings({
    colors: 99,
    detail: -2,
    smoothing: 45.7,
    blur: 7,
    palette: ['#ABC', 'bad', '#112233'],
  });
  assert.deepEqual(normalized, {
    colors: 32,
    detail: 0,
    smoothing: 46,
    blur: 5,
    palette: ['#aabbcc', '#112233'],
  });
  assert.equal(
    createTraceFingerprint('source-a', normalized),
    createTraceFingerprint('source-a', structuredClone(normalized)),
  );
  assert.notEqual(
    createTraceFingerprint('source-a', normalized),
    createTraceFingerprint('source-a', { ...normalized, detail: 1 }),
  );
  assert.equal(serializeTraceInput(normalized), serializeTraceInput(structuredClone(normalized)));
});

test('creates a schema five project with a default product and immutable source metadata', () => {
  const asset = createEditorAsset('project_a', new Blob(['pixels'], { type: 'image/png' }), {
    name: 'still.png', width: 1600, height: 900,
  });
  const project = createEditorProject('Film still', asset);
  assert.equal(project.schemaVersion, 5);
  assert.equal(project.productVariants.length, 1);
  assert.equal(project.productVariants[0].variationId, project.variations[0].id);
  assert.equal(project.productVariants[0].mockupSlug, 'black');
  assert.deepEqual(project.variations[0].look, { id: 'original', strength: 100 });
  assert.equal(project.sourceAssetId, asset.id);
  assert.deepEqual(project.sourceMetadata, {
    name: 'still.png', mimeType: 'image/png', width: 1600, height: 900,
  });
  const imageLayer = project.variations[0].layers[0];
  assert.equal(imageLayer.type, 'image');
  if (imageLayer.type !== 'image') throw new Error('Expected the source layer to be an image.');
  assert.equal(imageLayer.assetId, asset.id);
  assert.deepEqual(imageLayer.backgroundRemoval, createDefaultBackgroundRemoval());
  assert.equal('blob' in imageLayer, false);
  assert.equal(asset.blob.size, 6);
});

test('duplicates a variation without sharing nested edit state and remaps trace source ids', () => {
  const asset = createEditorAsset('project_a', new Blob(['x']), {
    name: 'source.webp', width: 800, height: 1200,
  });
  const source = createEditorProject('Poster', asset);
  const sourceLayer = source.variations[0].layers[0];
  source.variations[0].layers.push({
    id: 'trace_a',
    type: 'trace',
    name: 'Trace',
    sourceLayerId: sourceLayer.id,
    svgAssetId: 'trace_asset',
    visible: true,
    opacity: 1,
    transform: structuredClone(sourceLayer.transform),
    settings: createDefaultTraceSettings(),
    sourceFingerprint: 'source-a',
    sourceFrame: {
      sourceWidth: asset.width,
      sourceHeight: asset.height,
      crop: { x: 0, y: 0, width: 1, height: 1 },
    },
  });
  const duplicate = duplicateVariation(source.variations[0], 'High contrast');
  duplicate.layers[0].transform.x = 0.25;
  assert.deepEqual(duplicate.look, source.variations[0].look);
  assert.notEqual(duplicate.look, source.variations[0].look);
  assert.equal(source.variations[0].layers[0].transform.x, 0.5);
  assert.notEqual(duplicate.id, source.variations[0].id);
  const duplicateImage = duplicate.layers.find((layer) => layer.type === 'image');
  const duplicateTrace = duplicate.layers.find((layer) => layer.type === 'trace');
  assert.ok(duplicateImage);
  assert.ok(duplicateTrace);
  assert.notEqual(duplicateImage.id, sourceLayer.id);
  assert.equal(duplicateTrace.sourceLayerId, duplicateImage.id);
  assert.equal(duplicateTrace.svgAssetId, 'trace_asset');
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
  assert.equal(project.schemaVersion, 5);
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

  assert.equal(project.schemaVersion, 5);
  assert.deepEqual(project.variations[0].look, { id: 'original', strength: 100 });
  assert.equal(project.sourceAssetId, asset.id);
  assert.deepEqual(project.sourceMetadata, {
    name: 'source.webp', mimeType: 'image/webp', width: 1200, height: 800,
  });
  assert.equal(project.updatedAt, 100);
  assert.equal(project.productVariants.length, 1);
  assert.equal(project.productVariants[0].variationId, 'variation_a');
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

test('normalizes saved schema three Look recipes while adding schema five product state', () => {
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

  assert.equal(project.schemaVersion, 5);
  assert.equal(project.productVariants[0].variationId, 'variation_a');
  assert.deepEqual(project.variations[0].look, {
    id: 'duotone', strength: 100, shadowColor: '#aabbcc', highlightColor: '#f59e0b', balance: -50,
  });
});

test('migrates schema four generated assets and adds a default product', () => {
  const source = createEditorAsset('project_trace', new Blob(['source']), {
    name: 'source.png', width: 100, height: 80,
  });
  const prepared = createEditorAsset('project_trace', new Blob(['prepared']), {
    name: 'prepared.png', width: 80, height: 60,
  }, { role: 'prepared-image' });
  const correction = createEditorAsset('project_trace', new Blob(['corrections']), {
    name: 'corrections.json', width: 0, height: 0,
  }, { role: 'cleanup-corrections' });
  const trace = createEditorAsset('project_trace', new Blob(['svg'], { type: 'image/svg+xml' }), {
    name: 'trace.svg', width: 80, height: 60,
  }, { role: 'trace-svg' });
  const project = migrateEditorProject({
    schemaVersion: 4,
    id: 'project_trace',
    name: 'Trace',
    createdAt: 100,
    sourceAssetId: source.id,
    sourceMetadata: {
      name: source.name, mimeType: source.mimeType, width: source.width, height: source.height,
    },
    activeVariationId: 'variation_trace',
    variations: [{
      id: 'variation_trace',
      name: 'Original',
      selectedLayerId: 'trace_valid',
      look: { id: 'original', strength: 100 },
      layers: [{
        type: 'image',
        id: 'image_source',
        name: 'Source',
        assetId: source.id,
        backgroundRemoval: {
          enabled: true,
          mode: 'auto',
          tolerance: 30,
          edgeFeather: 2,
          correctionAssetId: correction.id,
          preparedAssetId: prepared.id,
          inputFingerprint: 'prepared-current',
        },
      }, {
        type: 'trace',
        id: 'trace_valid',
        name: 'Trace',
        sourceLayerId: 'image_source',
        svgAssetId: trace.id,
        settings: createDefaultTraceSettings(),
        sourceFingerprint: 'source-current',
        sourceFrame: {
          sourceWidth: 100,
          sourceHeight: 80,
          crop: { x: 0, y: 0, width: 1, height: 1 },
        },
      }, {
        type: 'trace',
        id: 'trace_invalid',
        name: 'Invalid trace',
        sourceLayerId: 'missing',
        svgAssetId: trace.id,
        settings: createDefaultTraceSettings(),
        sourceFrame: {
          sourceWidth: 100,
          sourceHeight: 80,
          crop: { x: 0, y: 0, width: 1, height: 1 },
        },
      }],
    }],
  }, [source, prepared, correction, trace]);

  assert.equal(project.schemaVersion, 5);
  assert.equal(project.productVariants.length, 1);
  assert.equal(project.productVariants[0].variationId, 'variation_trace');
  assert.deepEqual(project.variations[0].layers.map(({ id }) => id), ['image_source', 'trace_valid']);
  const image = project.variations[0].layers[0];
  const traced = project.variations[0].layers[1];
  assert.equal(image.type, 'image');
  assert.equal(traced.type, 'trace');
  if (image.type !== 'image' || traced.type !== 'trace') throw new Error('Expected image and trace.');
  assert.equal(image.backgroundRemoval.preparedAssetId, prepared.id);
  assert.equal(image.backgroundRemoval.correctionAssetId, correction.id);
  assert.equal(traced.svgAssetId, trace.id);

  const missingGenerated = migrateEditorProject(project, [source]);
  const recoveredImage = missingGenerated.variations[0].layers[0];
  const recoveredTrace = missingGenerated.variations[0].layers[1];
  assert.equal(recoveredImage.type, 'image');
  assert.equal(recoveredTrace.type, 'trace');
  if (recoveredImage.type !== 'image' || recoveredTrace.type !== 'trace') throw new Error('Expected recovery.');
  assert.equal(recoveredImage.backgroundRemoval.preparedAssetId, null);
  assert.equal(recoveredImage.backgroundRemoval.correctionAssetId, null);
  assert.equal(recoveredTrace.svgAssetId, null);
  assert.equal(recoveredTrace.sourceFingerprint, '');
});

test('rejects unsupported schemas and records without a valid created timestamp', () => {
  assert.throws(() => migrateEditorProject({ schemaVersion: 6 }, []), /Unsupported editor project schema/);
  const asset = createEditorAsset('project_a', new Blob(['source']), {
    name: 'source.png', width: 10, height: 10,
  });
  assert.throws(() => migrateEditorProject({ schemaVersion: 1, id: 'project_a', createdAt: Infinity, variations: [{
    id: 'variation_a', layers: [{ type: 'image', id: 'layer_a', assetId: asset.id }],
  }] }, [asset]), /valid createdAt/);
});
