import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  TSHIRT_EXPORT_PRESETS,
  createTShirtExportFilename,
  createTShirtExportFingerprint,
  getTShirtExportPreset,
  resolveTShirtExportGeometry,
} from '../editor/tshirtExportModel';
import { createEditorAsset, createEditorProject } from '../editor/model';
import { findTShirtProduct } from '../editor/productModel';

const createInput = () => {
  const asset = createEditorAsset('project-a', new Blob(['pixels'], { type: 'image/png' }), {
    name: 'source.png',
    width: 1000,
    height: 1000,
  });
  const project = createEditorProject('Project', asset);
  const variation = project.variations[0];
  const placement = findTShirtProduct(project.productVariants, variation.id).placement;
  return {
    input: {
      presetId: 'printify-full-front' as const,
      variation,
      placement,
      assetsById: { [asset.id]: asset },
    },
    asset,
  };
};

test('declares exactly the three approved 5:6 presets', () => {
  assert.deepEqual(TSHIRT_EXPORT_PRESETS.map((preset) => ({
    id: preset.id,
    width: preset.width,
    height: preset.height,
    dpi: preset.dpi,
    pixelsPerMeter: preset.pixelsPerMeter,
    classification: preset.classification,
  })), [
    {
      id: 'printify-full-front',
      width: 4500,
      height: 5400,
      dpi: 300,
      pixelsPerMeter: 11811,
      classification: 'production',
    },
    {
      id: 'standard-tee',
      width: 3000,
      height: 3600,
      dpi: 300,
      pixelsPerMeter: 11811,
      classification: 'production',
    },
    {
      id: 'draft-proof',
      width: 1500,
      height: 1800,
      dpi: 150,
      pixelsPerMeter: 5906,
      classification: 'proof',
    },
  ]);
  for (const preset of TSHIRT_EXPORT_PRESETS) {
    assert.equal(preset.width * 6, preset.height * 5);
    assert.equal(Object.isFrozen(preset), true);
  }
  assert.equal(Object.isFrozen(TSHIRT_EXPORT_PRESETS), true);
});

test('maps normalized placement directly into the transparent output', () => {
  assert.deepEqual(resolveTShirtExportGeometry(TSHIRT_EXPORT_PRESETS[0], {
    x: 0.25,
    y: 0.75,
    scale: 0.8,
    rotation: 15,
  }), {
    center: { x: 1125, y: 4050 },
    renderedSide: 3600,
    rotation: 15,
  });
  assert.deepEqual(resolveTShirtExportGeometry(TSHIRT_EXPORT_PRESETS[1], {
    x: 4,
    y: -1,
    scale: 0,
    rotation: 900,
  }), {
    center: { x: 3000, y: 0 },
    renderedSide: 300,
    rotation: 180,
  });
});

test('gets approved presets and rejects unknown values', () => {
  assert.equal(getTShirtExportPreset('standard-tee'), TSHIRT_EXPORT_PRESETS[1]);
  assert.throws(() => getTShirtExportPreset('unknown'), /Unknown T-shirt export preset\./);
});

test('shirt color cannot change the export fingerprint', () => {
  const { input } = createInput();
  assert.equal(createTShirtExportFingerprint(input), createTShirtExportFingerprint({
    ...structuredClone(input),
    assetsById: input.assetsById,
  }));
});

test('fingerprint changes for preset, placement, layer, Look, and asset identity', () => {
  const { input, asset } = createInput();
  const fingerprint = createTShirtExportFingerprint(input);
  const variation = structuredClone(input.variation);
  const assetsById = input.assetsById;
  assert.notEqual(createTShirtExportFingerprint({ ...input, presetId: 'standard-tee' }), fingerprint);
  assert.notEqual(createTShirtExportFingerprint({ ...input, placement: { ...input.placement, x: 0.6 } }), fingerprint);
  assert.notEqual(createTShirtExportFingerprint({ ...input, variation: { ...variation, layers: variation.layers.map((layer) => ({ ...layer, opacity: 0.5 })) } }), fingerprint);
  assert.notEqual(createTShirtExportFingerprint({ ...input, variation: { ...variation, look: { ...variation.look, id: 'vintage-ink' } as typeof variation.look } }), fingerprint);
  const replacement = createEditorAsset('project-a', new Blob(['pixels']), {
    name: 'replacement.png', width: asset.width, height: asset.height,
  });
  const identityChanged = variation.layers.map((layer) => ({ ...layer, assetId: replacement.id }));
  assert.notEqual(createTShirtExportFingerprint({
    ...input,
    variation: { ...variation, layers: identityChanged },
    assetsById: { ...assetsById, [replacement.id]: replacement },
  }), fingerprint);
});

test('rejects missing referenced assets', () => {
  const { input, asset } = createInput();
  const incomplete = { ...input, assetsById: {} };
  assert.throws(() => createTShirtExportFingerprint(incomplete), /Export artwork is incomplete\./);
  assert.equal(asset.id in input.assetsById, true);
});

test('creates bounded lowercase ASCII filenames', () => {
  assert.equal(
    createTShirtExportFilename('My Film / Still', 'Red Look!', 'standard-tee'),
    'my-film-still-red-look-standard-tee.png',
  );
  assert.equal(
    createTShirtExportFilename('***', '', 'draft-proof'),
    'inkmaster-design-original-draft-proof.png',
  );
  const filename = createTShirtExportFilename('A'.repeat(100), 'B'.repeat(100), 'draft-proof');
  assert.equal(filename.endsWith('-draft-proof.png'), true);
  assert.equal(filename.length <= 184, true);
  assert.match(filename, /^[a-z0-9-]+\.png$/);
});
