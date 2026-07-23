import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  TraceCoordinator,
  createBrowserTraceWorker,
  type TraceRequest,
  type TraceWorkerLike,
} from '../editor/traceCoordinator';
import type { RgbaFrame } from '../editor/backgroundRemovalProcessor';
import { createDefaultTraceSettings } from '../editor/traceModel';
import type { SafeTraceDocument } from '../editor/traceModel';

type WorkerType = 'message' | 'error' | 'messageerror';
type Listener = (event: Event) => void;

class FakeWorker implements TraceWorkerLike {
  posts: Array<{ request: TraceRequest; transfer: Transferable[] }> = [];
  listeners = new Map<WorkerType, Set<Listener>>([
    ['message', new Set()], ['error', new Set()], ['messageerror', new Set()],
  ]);
  terminated = 0;
  postMessage(message: TraceRequest, transfer: Transferable[]) {
    this.posts.push({ request: structuredClone(message, { transfer }), transfer });
  }
  addEventListener(type: WorkerType, listener: Listener) { this.listeners.get(type)!.add(listener); }
  removeEventListener(type: WorkerType, listener: Listener) { this.listeners.get(type)!.delete(listener); }
  terminate() { this.terminated += 1; }
  succeed(index: number, rawSvg = '<svg/>') {
    const request = this.posts[index].request;
    this.message({
      requestId: request.requestId,
      layerId: request.layerId,
      traceFingerprint: request.traceFingerprint,
      rawSvg,
    });
  }
  fail(index: number) {
    const request = this.posts[index].request;
    this.message({
      requestId: request.requestId,
      layerId: request.layerId,
      traceFingerprint: request.traceFingerprint,
      message: 'Vector trace failed.',
    });
  }
  message(data: unknown) {
    for (const listener of this.listeners.get('message')!) listener({ data } as MessageEvent);
  }
  crash() { for (const listener of this.listeners.get('error')!) listener(new Event('error')); }
}

const frame = (): RgbaFrame => ({
  width: 1, height: 1, pixels: new Uint8ClampedArray([1, 2, 3, 255]),
});
const settings = createDefaultTraceSettings();
const safeDocument: SafeTraceDocument = {
  width: 1,
  height: 1,
  paths: [{
    d: 'M0 0 L1 1 Z',
    fill: '#ff0000',
    stroke: '#ff0000',
    strokeWidth: 1,
    opacity: 1,
    transform: null,
  }],
};
const input = (
  layerId: string,
  traceFingerprint: string,
  overrides: Partial<ReturnType<typeof input>> = {},
) => ({
  layerId,
  traceFingerprint,
  geometryFingerprint: traceFingerprint,
  frame: frame(),
  settings,
  ...overrides,
});

test('latest trace wins, stale output is not cached, and retry keeps the current input', async (context) => {
  const worker = new FakeWorker();
  const coordinator = new TraceCoordinator(() => worker, {
    sanitize: () => structuredClone(safeDocument),
  });
  context.after(() => coordinator.dispose());
  const first = coordinator.trace(input('layer-a', 'first'));
  const second = coordinator.trace(input('layer-a', 'second'));
  assert.deepEqual(await first, { status: 'stale', traceFingerprint: 'first' });
  worker.succeed(0);
  worker.fail(1);
  assert.deepEqual(await second, {
    status: 'failed',
    traceFingerprint: 'second',
    message: 'Vector trace failed.',
  });
  const retry = coordinator.retry('layer-a');
  assert.equal(worker.posts[2].request.traceFingerprint, 'second');
  worker.succeed(2);
  assert.equal((await retry).status, 'ready');
});

test('reuses cached geometry for palette-only requests without posting', async (context) => {
  const worker = new FakeWorker();
  const coordinator = new TraceCoordinator(() => worker, {
    sanitize: () => structuredClone(safeDocument),
  });
  context.after(() => coordinator.dispose());
  const first = coordinator.trace(input('layer-a', 'trace-red', {
    geometryFingerprint: 'geometry-a',
  }));
  worker.succeed(0);
  await first;
  const recolored = await coordinator.trace(input('layer-a', 'trace-blue', {
    geometryFingerprint: 'geometry-a',
    settings: { ...settings, palette: ['#112233'] },
  }));
  assert.equal(worker.posts.length, 1);
  assert.equal(recolored.status, 'ready');
  if (recolored.status === 'ready') {
    assert.equal(recolored.document.paths[0].d, safeDocument.paths[0].d);
    assert.equal(recolored.document.paths[0].fill, '#112233');
  }
});

test('rejects malformed sanitized results, worker crashes, release, and dispose', async () => {
  const worker = new FakeWorker();
  let unsafe = false;
  const coordinator = new TraceCoordinator(() => worker, {
    sanitize: () => {
      if (unsafe) throw new Error('unsafe');
      return structuredClone(safeDocument);
    },
  });
  const malformed = coordinator.trace(input('layer-a', 'malformed'));
  unsafe = true;
  worker.succeed(0, '<script/>');
  assert.equal((await malformed).status, 'failed');
  unsafe = false;
  const crashed = coordinator.trace(input('layer-a', 'crashed'));
  worker.crash();
  assert.equal((await crashed).status, 'failed');
  const released = coordinator.trace(input('layer-a', 'released'));
  coordinator.clearLayer('layer-a');
  assert.deepEqual(await released, { status: 'stale', traceFingerprint: 'released' });
  const pending = coordinator.trace(input('layer-b', 'pending'));
  coordinator.dispose();
  assert.deepEqual(await pending, { status: 'stale', traceFingerprint: 'pending' });
  assert.equal(worker.terminated, 1);
});

test('createBrowserTraceWorker constructs the isolated module worker', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  const calls: Array<{ url: URL; options?: WorkerOptions }> = [];
  class WorkerStub {
    constructor(url: URL, options?: WorkerOptions) { calls.push({ url, options }); }
  }
  Object.defineProperty(globalThis, 'Worker', { configurable: true, value: WorkerStub });
  try {
    assert.ok(createBrowserTraceWorker() instanceof WorkerStub);
    assert.match(calls[0].url.href, /\/editor\/traceWorker\.ts$/);
    assert.deepEqual(calls[0].options, { type: 'module' });
  } finally {
    if (original) Object.defineProperty(globalThis, 'Worker', original);
    else Reflect.deleteProperty(globalThis, 'Worker');
  }
});
