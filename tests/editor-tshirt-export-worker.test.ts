import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTShirtExportWorkerHandler } from '../editor/tshirtExportWorker';
import type { TShirtExportWorkerMessage, TShirtPngExportSnapshot } from '../editor/tshirtExportProtocol';

const snapshot = (): TShirtPngExportSnapshot => ({
  requestId: 7,
  fingerprint: 'fingerprint',
  presetId: 'draft-proof',
  variation: { id: 'variation', name: 'Original', layers: [], selectedLayerId: '', look: { id: 'original', strength: 100 } },
  placement: { x: 0.5, y: 0.5, scale: 0.72, rotation: 0 },
  assets: [],
});

const metadata = {
  alpha: { transparentPixels: 1, translucentPixels: 0, opaquePixels: 3 },
  largestRasterScale: 1,
  largestRasterLayerName: null,
  pixelDigest: 'deadbeef',
};

test('worker posts ordered progress, writes resolution bytes, transfers ready output, and releases its canvas', async () => {
  const calls: string[] = [];
  const canvas = {
    width: 1500,
    height: 1800,
    convertToBlob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
  } as unknown as OffscreenCanvas;
  const handler = createTShirtExportWorkerHandler({
    getPreset: (id) => ({ id, pixelsPerMeter: 5906 } as ReturnType<typeof import('../editor/tshirtExportModel').getTShirtExportPreset>),
    render: async () => ({ canvas, metadata }),
    writeResolution: (bytes, ppm) => {
      calls.push(`write:${ppm}:${bytes.join(',')}`);
      return new Uint8Array([9, 8, 7]);
    },
  });
  const messages: unknown[] = [];
  const transfers: Transferable[][] = [];
  await handler({ type: 'render', snapshot: snapshot() }, (message, transfer = []) => {
    messages.push(message);
    transfers.push(transfer);
  });
  assert.deepEqual((messages.slice(0, 3) as Array<{ type: string; stage: string; progress: number }>).map(({ type, stage, progress }) => ({ type, stage, progress })), [
    { type: 'progress', stage: 'preparing-artwork', progress: 0.1 },
    { type: 'progress', stage: 'rendering-layers', progress: 0.35 },
    { type: 'progress', stage: 'encoding-png', progress: 0.85 },
  ]);
  assert.equal(calls[0], 'write:5906:1,2,3');
  assert.equal((messages[3] as { type: string }).type, 'ready');
  assert.equal(transfers[3].length, 1);
  assert.equal(canvas.width, 1);
  assert.equal(canvas.height, 1);
});

test('worker rejects malformed requests before rendering and sanitizes stage failures', async () => {
  let rendered = false;
  const handler = createTShirtExportWorkerHandler({
    getPreset: (() => { throw new Error('secret'); }) as never,
    render: (async () => { rendered = true; throw new Error('secret'); }) as never,
    writeResolution: ((bytes) => bytes) as never,
  });
  const messages: TShirtExportWorkerMessage[] = [];
  await handler({ type: 'render', snapshot: { requestId: 2, fingerprint: 'bad' } }, (message) => messages.push(message));
  assert.equal(rendered, false);
  assert.deepEqual(messages, [{
    type: 'failed', requestId: 2, fingerprint: 'bad', stage: 'preparing-artwork',
    message: 'Could not prepare artwork for PNG export.',
  }]);
  messages.length = 0;
  await handler({ type: 'render', snapshot: snapshot() }, (message) => messages.push(message));
  const finalMessage = messages.at(-1);
  assert.ok(finalMessage && finalMessage.type === 'failed');
  assert.equal(finalMessage.message, 'Could not prepare artwork for PNG export.');
  assert.doesNotMatch(finalMessage.message, /secret/);
});
