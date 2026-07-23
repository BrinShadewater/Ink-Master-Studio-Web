import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDefaultBackgroundRemoval } from '../editor/imagePrepModel';
import { createEditorAsset, createEditorProject } from '../editor/model';
import { findTShirtProduct } from '../editor/productModel';
import { createTShirtExportFingerprint } from '../editor/tshirtExportModel';
import { createTShirtPngExportSnapshot } from '../editor/tshirtExportSnapshot';

const makeInput = () => {
  const source = createEditorAsset('project-a', new Blob(['source'], { type: 'image/png' }), {
    name: 'source.png', width: 1000, height: 800,
  });
  const prepared = createEditorAsset('project-a', new Blob(['prepared'], { type: 'image/png' }), {
    name: 'prepared.png', width: 1000, height: 800,
  }, { role: 'prepared-image' });
  const trace = createEditorAsset('project-a', new Blob(['<svg/>'], { type: 'image/svg+xml' }), {
    name: 'trace.svg', width: 1000, height: 800,
  }, { role: 'trace-svg' });
  const correction = createEditorAsset('project-a', new Blob(['correction'], { type: 'application/json' }), {
    name: 'corrections.json', width: 1, height: 1,
  }, { role: 'cleanup-corrections' });
  const unrelated = createEditorAsset('project-a', new Blob(['unrelated'], { type: 'image/png' }), {
    name: 'mockup.png', width: 1200, height: 1200,
  });
  const project = createEditorProject('Project', source);
  const variation = structuredClone(project.variations[0]);
  const sourceLayer = variation.layers[0];
  if (sourceLayer.type !== 'image') throw new Error('Expected source image layer.');
  sourceLayer.visible = false;
  sourceLayer.backgroundRemoval = {
    ...createDefaultBackgroundRemoval(),
    enabled: true,
    preparedAssetId: prepared.id,
    correctionAssetId: correction.id,
  };
  variation.layers.push({
    id: 'trace-layer',
    type: 'trace',
    name: 'Trace',
    sourceLayerId: sourceLayer.id,
    svgAssetId: trace.id,
    visible: false,
    opacity: 1,
    transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, flipX: false, flipY: false },
    settings: { colors: 6, detail: 60, smoothing: 35, blur: 0, palette: [] },
    sourceFingerprint: 'source',
    sourceFrame: {
      sourceWidth: 1000,
      sourceHeight: 800,
      crop: { x: 0, y: 0, width: 1, height: 1 },
    },
  });
  const placement = findTShirtProduct(project.productVariants, project.variations[0].id).placement;
  const assetsById = {
    [source.id]: source,
    [prepared.id]: prepared,
    [trace.id]: trace,
    [correction.id]: correction,
    [unrelated.id]: unrelated,
  };
  const fingerprint = createTShirtExportFingerprint({
    presetId: 'standard-tee', variation, placement, assetsById,
  });
  return { source, prepared, trace, correction, unrelated, variation, placement, assetsById, fingerprint };
};

test('captures detached export artwork from visible and hidden layers without mockup data', async () => {
  const input = makeInput();
  const snapshot = await createTShirtPngExportSnapshot({
    requestId: 7,
    fingerprint: input.fingerprint,
    presetId: 'standard-tee',
    variation: input.variation,
    placement: input.placement,
    assetsById: input.assetsById,
  });

  assert.equal(snapshot.requestId, 7);
  assert.equal(snapshot.fingerprint, input.fingerprint);
  assert.notEqual(snapshot.variation, input.variation);
  assert.deepEqual(snapshot.placement, input.placement);
  assert.deepEqual(snapshot.assets.map(({ id }) => id).sort(), [
    input.prepared.id, input.source.id, input.trace.id,
  ].sort());
  assert.equal(snapshot.assets.some(({ id }) => id === input.correction.id), false);
  assert.equal(snapshot.assets.some(({ id }) => id === input.unrelated.id), false);
  assert.ok(snapshot.assets.every(({ bytes }) => bytes instanceof ArrayBuffer && bytes.byteLength > 0));
  assert.equal(snapshot.assets.find(({ id }) => id === input.prepared.id)?.role, 'prepared-image');
});

test('snapshot data and byte copies remain immutable after source state changes', async () => {
  const input = makeInput();
  const snapshot = await createTShirtPngExportSnapshot({
    requestId: 8,
    fingerprint: input.fingerprint,
    presetId: 'standard-tee',
    variation: input.variation,
    placement: input.placement,
    assetsById: input.assetsById,
  });
  const originalBytes = [...new Uint8Array(snapshot.assets.find(({ id }) => id === input.source.id)!.bytes)];

  input.variation.layers[0].name = 'Changed after capture';
  input.placement.x = 0.1;
  input.assetsById[input.source.id] = {
    ...input.source,
    blob: new Blob(['replacement'], { type: 'image/png' }),
  };

  assert.equal(snapshot.variation.layers[0].name, 'source.png');
  assert.notEqual(snapshot.placement.x, input.placement.x);
  assert.deepEqual(
    [...new Uint8Array(snapshot.assets.find(({ id }) => id === input.source.id)!.bytes)],
    originalBytes,
  );
});

test('captures all asset records and Blob references before asynchronous reads', async () => {
  const input = makeInput();
  let release!: (bytes: ArrayBuffer) => void;
  const deferredBytes = new Promise<ArrayBuffer>((resolve) => { release = resolve; });
  const capturedBlob = new Blob(['origin'], { type: 'image/png' });
  Object.defineProperty(capturedBlob, 'arrayBuffer', {
    value: () => deferredBytes,
  });
  input.assetsById[input.source.id] = { ...input.source, blob: capturedBlob };
  const pending = createTShirtPngExportSnapshot({
    requestId: 10,
    fingerprint: input.fingerprint,
    presetId: 'standard-tee',
    variation: input.variation,
    placement: input.placement,
    assetsById: input.assetsById,
  });

  input.variation.layers[0].name = 'Changed while capturing';
  input.placement.x = 0.1;
  input.assetsById[input.source.id] = {
    ...input.source,
    blob: new Blob(['change'], { type: 'image/png' }),
  };
  release(new TextEncoder().encode('origin').buffer);

  const snapshot = await pending;
  assert.equal(snapshot.variation.layers[0].name, 'source.png');
  assert.notEqual(snapshot.placement.x, input.placement.x);
  assert.deepEqual(
    [...new Uint8Array(snapshot.assets.find(({ id }) => id === input.source.id)!.bytes)],
    [...new TextEncoder().encode('origin')],
  );
});

test('rejects incomplete artwork and a stale semantic fingerprint', async () => {
  const input = makeInput();
  const base = {
    requestId: 9,
    fingerprint: input.fingerprint,
    presetId: 'standard-tee' as const,
    variation: input.variation,
    placement: input.placement,
    assetsById: input.assetsById,
  };

  await assert.rejects(
    createTShirtPngExportSnapshot({ ...base, assetsById: {} }),
    /Export artwork is incomplete\./,
  );
  await assert.rejects(
    createTShirtPngExportSnapshot({
      ...base,
      assetsById: {
        ...input.assetsById,
        [input.source.id]: { ...input.source, blob: new Blob([], { type: 'image/png' }) },
      },
    }),
    /Export artwork is incomplete\./,
  );
  await assert.rejects(
    createTShirtPngExportSnapshot({
      ...base,
      assetsById: {
        ...input.assetsById,
        [input.source.id]: {
          ...input.source,
          blob: new Blob(['wrong type'], { type: 'image/jpeg' }),
        },
      },
    }),
    /Export artwork is incomplete\./,
  );
  await assert.rejects(
    createTShirtPngExportSnapshot({ ...base, fingerprint: 'stale-fingerprint' }),
    /Export artwork is incomplete\./,
  );
});
