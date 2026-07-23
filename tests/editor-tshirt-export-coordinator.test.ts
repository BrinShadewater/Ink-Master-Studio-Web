import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  TShirtExportCoordinator,
  createBrowserTShirtExportWorker,
  type TShirtExportWorkerLike,
} from '../editor/tshirtExportCoordinator';
import {
  isTShirtExportWorkerMessage,
  type TShirtPngExportSnapshot,
  type TShirtExportWorkerRequest,
} from '../editor/tshirtExportProtocol';
import type { TShirtExportRenderMetadata } from '../editor/tshirtExportModel';

type WorkerEventType = 'message' | 'error' | 'messageerror';
type WorkerListener = (event: Event) => void;

const metadata: TShirtExportRenderMetadata = {
  alpha: { transparentPixels: 1, translucentPixels: 0, opaquePixels: 3 },
  largestRasterScale: 1,
  largestRasterLayerName: 'Artwork',
  pixelDigest: 'digest',
};

const snapshot = (requestId: number, fingerprint: string): TShirtPngExportSnapshot => ({
  requestId,
  fingerprint,
  presetId: 'standard-tee',
  variation: {
    id: 'variation', name: 'Original', selectedLayerId: 'layer', layers: [],
    look: { id: 'original', strength: 100 },
  },
  placement: { x: 0.5, y: 0.5, scale: 1, rotation: 0 },
  assets: [{
    id: 'asset', name: 'artwork.png', mimeType: 'image/png', width: 2, height: 2,
    role: null, bytes: new Uint8Array([1, 2, 3]).buffer,
  }],
});

class FakeWorker implements TShirtExportWorkerLike {
  readonly posts: Array<{ request: TShirtExportWorkerRequest; transfer: Transferable[] }> = [];
  readonly listeners = new Map<WorkerEventType, Set<WorkerListener>>([
    ['message', new Set()], ['error', new Set()], ['messageerror', new Set()],
  ]);
  terminateCount = 0;
  postError: Error | undefined;

  postMessage(message: TShirtExportWorkerRequest, transfer: Transferable[]): void {
    if (this.postError) throw this.postError;
    this.posts.push({ request: structuredClone(message, { transfer }), transfer: [...transfer] });
  }
  addEventListener(type: WorkerEventType, listener: WorkerListener): void {
    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(type: WorkerEventType, listener: WorkerListener): void {
    this.listeners.get(type)!.delete(listener);
  }
  terminate(): void { this.terminateCount += 1; }
  message(data: unknown): void {
    for (const listener of this.listeners.get('message')!) listener({ data } as MessageEvent<unknown>);
  }
  failure(type: 'error' | 'messageerror'): void {
    for (const listener of this.listeners.get(type)!) listener(new Event(type));
  }
}

const ready = (worker: FakeWorker, requestIndex: number, bytes = [9, 8, 7]) => {
  const request = worker.posts[requestIndex].request.snapshot;
  worker.message({
    type: 'ready', requestId: request.requestId, fingerprint: request.fingerprint,
    pngBytes: new Uint8Array(bytes).buffer, metadata,
  });
};

test('latest request wins, transfers cloned bytes, and returns a fresh PNG buffer', async () => {
  const workers: FakeWorker[] = [];
  const coordinator = new TShirtExportCoordinator(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  const firstSnapshot = snapshot(1, 'first');
  const originalBytes = firstSnapshot.assets[0].bytes;
  const first = coordinator.render(firstSnapshot);
  const second = coordinator.render(snapshot(2, 'second'));

  assert.deepEqual(await first, { status: 'stale', fingerprint: 'first' });
  assert.equal(workers[0].terminateCount, 1);
  assert.deepEqual([...new Uint8Array(originalBytes)], [1, 2, 3]);
  assert.equal(workers[0].posts[0].transfer[0] !== originalBytes, true);
  ready(workers[1], 0);
  const outcome = await second;
  assert.equal(outcome.status, 'ready');
  if (outcome.status === 'ready') {
    assert.deepEqual([...outcome.pngBytes], [9, 8, 7]);
    outcome.pngBytes[0] = 0;
  }
  coordinator.dispose();
});

test('accepts monotonic matching progress and rejects malformed or mismatched completion', async () => {
  const worker = new FakeWorker();
  const progress: number[] = [];
  const coordinator = new TShirtExportCoordinator(() => worker, {
    onProgress: (event) => progress.push(event.progress),
  });
  const pending = coordinator.render(snapshot(3, 'matching'));
  worker.message({
    type: 'progress', requestId: 3, fingerprint: 'matching',
    stage: 'preparing-artwork', progress: 0.5,
  });
  worker.message({
    type: 'progress', requestId: 3, fingerprint: 'matching',
    stage: 'rendering-layers', progress: 0.4,
  });
  worker.message({
    type: 'progress', requestId: 3, fingerprint: 'wrong',
    stage: 'encoding-png', progress: 0.9,
  });
  worker.message({ type: 'ready', requestId: 3, fingerprint: 'wrong', pngBytes: new ArrayBuffer(1), metadata });
  worker.message({ type: 'ready', requestId: 3, fingerprint: 'matching', pngBytes: new ArrayBuffer(0), metadata });

  assert.deepEqual(progress, [0.5]);
  assert.deepEqual(await pending, {
    status: 'failed', fingerprint: 'matching', stage: 'preparing-artwork',
    message: 'PNG generation failed while preparing artwork.',
  });
  coordinator.dispose();
});

test('timeout, cancellation, errors, dispose, and construction failure settle once and clean up', async () => {
  const timeoutWorker = new FakeWorker();
  const timeoutCoordinator = new TShirtExportCoordinator(() => timeoutWorker, { timeoutMs: 25 });
  const timedOut = await timeoutCoordinator.render(snapshot(4, 'timeout'));
  assert.deepEqual(timedOut, {
    status: 'failed', fingerprint: 'timeout', stage: 'preparing-artwork',
    message: 'PNG generation failed while preparing artwork.',
  });
  assert.equal(timeoutWorker.terminateCount, 1);
  assert.equal(timeoutWorker.listeners.get('message')!.size, 0);

  const firstWorker = new FakeWorker();
  const secondWorker = new FakeWorker();
  let workerCount = 0;
  const cancelCoordinator = new TShirtExportCoordinator(() => (++workerCount === 1 ? firstWorker : secondWorker));
  const cancelled = cancelCoordinator.render(snapshot(5, 'cancelled'));
  cancelCoordinator.cancel();
  assert.deepEqual(await cancelled, { status: 'cancelled', fingerprint: 'cancelled' });
  const later = cancelCoordinator.render(snapshot(6, 'later'));
  ready(secondWorker, 0);
  assert.equal((await later).status, 'ready');

  const crashWorker = new FakeWorker();
  const crashCoordinator = new TShirtExportCoordinator(() => crashWorker);
  const crashed = crashCoordinator.render(snapshot(7, 'crashed'));
  crashWorker.failure('messageerror');
  crashWorker.failure('error');
  assert.equal((await crashed).status, 'failed');
  const disposableWorker = new FakeWorker();
  const disposable = new TShirtExportCoordinator(() => disposableWorker);
  const pending = disposable.render(snapshot(8, 'pending'));
  disposable.dispose();
  assert.deepEqual(await pending, { status: 'stale', fingerprint: 'pending' });
  assert.equal(disposableWorker.listeners.get('message')!.size, 0);

  let attempts = 0;
  const unavailable = new TShirtExportCoordinator(() => {
    attempts += 1;
    throw new Error('unsupported');
  });
  assert.deepEqual(await unavailable.render(snapshot(9, 'unavailable')), {
    status: 'failed', fingerprint: 'unavailable', stage: 'preparing-artwork',
    message: 'This browser cannot create the print file.',
  });
  assert.equal(attempts, 1);
});

test('validates exact worker message shapes and creates a named module worker', () => {
  assert.equal(isTShirtExportWorkerMessage({
    type: 'progress', requestId: 1, fingerprint: 'fingerprint',
    stage: 'encoding-png', progress: 1,
  }), true);
  assert.equal(isTShirtExportWorkerMessage({
    type: 'ready', requestId: 1, fingerprint: 'fingerprint', pngBytes: new ArrayBuffer(1), metadata,
    extra: true,
  }), false);
  assert.equal(isTShirtExportWorkerMessage({
    type: 'ready', requestId: 1, fingerprint: 'fingerprint', pngBytes: new ArrayBuffer(0), metadata,
  }), false);
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  const calls: Array<{ url: URL; options?: WorkerOptions }> = [];
  class WorkerStub { constructor(url: URL, options?: WorkerOptions) { calls.push({ url, options }); } }
  Object.defineProperty(globalThis, 'Worker', { configurable: true, value: WorkerStub });
  try {
    assert.ok(createBrowserTShirtExportWorker() instanceof WorkerStub);
    assert.match(calls[0].url.href, /\/editor\/tshirtExportWorker\.ts$/);
    assert.deepEqual(calls[0].options, { type: 'module', name: 'tshirt-png-export' });
  } finally {
    if (original) Object.defineProperty(globalThis, 'Worker', original);
    else Reflect.deleteProperty(globalThis, 'Worker');
  }
});
