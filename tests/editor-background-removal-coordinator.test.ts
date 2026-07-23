import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BackgroundRemovalCoordinator,
  createBrowserBackgroundRemovalWorker,
  type BackgroundRemovalRequest,
  type BackgroundRemovalTimer,
  type BackgroundRemovalWorkerLike,
} from '../editor/backgroundRemovalCoordinator';
import type { RgbaFrame } from '../editor/backgroundRemovalProcessor';
import { createDefaultBackgroundRemoval } from '../editor/imagePrepModel';

const FAILURE_MESSAGE = 'Background removal failed.' as const;
type WorkerEventType = 'message' | 'error' | 'messageerror';
type WorkerListener = (event: Event) => void;

interface PostedRequest {
  request: BackgroundRemovalRequest;
  transfer: Transferable[];
  transferMatchesPixels: boolean;
}

class FakeBackgroundRemovalWorker implements BackgroundRemovalWorkerLike {
  readonly posts: PostedRequest[] = [];
  readonly listeners = new Map<WorkerEventType, Set<WorkerListener>>([
    ['message', new Set()],
    ['error', new Set()],
    ['messageerror', new Set()],
  ]);
  terminateCount = 0;
  nextPostError: Error | undefined;

  postMessage(message: BackgroundRemovalRequest, transfer: Transferable[]): void {
    if (this.nextPostError) {
      const error = this.nextPostError;
      this.nextPostError = undefined;
      throw error;
    }
    const transferMatchesPixels = transfer.length === 1 && transfer[0] === message.pixels;
    const request = structuredClone(message, { transfer }) as BackgroundRemovalRequest;
    this.posts.push({ request, transfer: [...transfer], transferMatchesPixels });
  }

  addEventListener(type: WorkerEventType, listener: WorkerListener): void {
    this.listeners.get(type)?.add(listener);
  }

  removeEventListener(type: WorkerEventType, listener: WorkerListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  terminate(): void {
    this.terminateCount += 1;
  }

  succeed(post: PostedRequest, result: RgbaFrame): void {
    this.message({
      requestId: post.request.requestId,
      surfaceId: post.request.surfaceId,
      inputFingerprint: post.request.inputFingerprint,
      width: result.width,
      height: result.height,
      pixels: result.pixels.buffer,
    });
  }

  fail(post: PostedRequest): void {
    this.message({
      requestId: post.request.requestId,
      surfaceId: post.request.surfaceId,
      inputFingerprint: post.request.inputFingerprint,
      message: FAILURE_MESSAGE,
    });
  }

  message(data: unknown): void {
    for (const listener of this.listeners.get('message') ?? []) {
      listener({ data } as MessageEvent<unknown>);
    }
  }

  crash(): void {
    for (const listener of this.listeners.get('error') ?? []) listener(new Event('error'));
  }
}

class FakeTimer implements BackgroundRemovalTimer {
  private nextId = 0;
  readonly callbacks = new Map<number, () => void>();
  readonly delays: number[] = [];

  setTimeout(callback: () => void, delay: number): number {
    this.nextId += 1;
    this.callbacks.set(this.nextId, callback);
    this.delays.push(delay);
    return this.nextId;
  }

  clearTimeout(handle: unknown): void {
    this.callbacks.delete(Number(handle));
  }

  runAll(): void {
    for (const [id, callback] of [...this.callbacks]) {
      this.callbacks.delete(id);
      callback();
    }
  }
}

const frame = (...pixels: number[]): RgbaFrame => ({
  width: pixels.length / 4,
  height: 1,
  pixels: new Uint8ClampedArray(pixels),
});

const renderInput = (
  surfaceId: string,
  inputFingerprint: string,
  source = frame(1, 2, 3, 255),
) => ({
  surfaceId,
  inputFingerprint,
  frame: source,
  settings: { ...createDefaultBackgroundRemoval(), enabled: true },
  corrections: { schemaVersion: 1 as const, strokes: [] },
});

test('newer work settles old success stale and never caches its output', async (context) => {
  const worker = new FakeBackgroundRemovalWorker();
  const coordinator = new BackgroundRemovalCoordinator(() => worker);
  context.after(() => coordinator.dispose());

  const first = coordinator.render(renderInput('layer-a', 'fingerprint-a'));
  const firstPost = worker.posts[0];
  const second = coordinator.render(renderInput('layer-a', 'fingerprint-b'));
  const secondPost = worker.posts[1];

  assert.deepEqual(await first, { status: 'stale', inputFingerprint: 'fingerprint-a' });
  worker.succeed(firstPost, frame(9, 9, 9, 255));
  const probe = coordinator.render(renderInput('probe', 'fingerprint-a'));
  assert.equal(worker.posts.length, 3);
  worker.succeed(secondPost, frame(10, 20, 30, 255));
  worker.succeed(worker.posts[2], frame(40, 50, 60, 255));

  assert.deepEqual(await second, {
    status: 'ready',
    inputFingerprint: 'fingerprint-b',
    frame: frame(10, 20, 30, 255),
  });
  assert.equal((await probe).status, 'ready');
});

test('stale failures cannot replace current same-key retry authority', async (context) => {
  const worker = new FakeBackgroundRemovalWorker();
  const coordinator = new BackgroundRemovalCoordinator(() => worker);
  context.after(() => coordinator.dispose());

  const sourceA = frame(1, 1, 1, 255);
  const sourceB = frame(2, 2, 2, 255);
  const old = coordinator.render(renderInput('main', 'old', sourceA));
  const oldPost = worker.posts[0];
  const current = coordinator.render(renderInput('main', 'current', sourceB));
  const currentPost = worker.posts[1];
  sourceB.pixels.fill(99);

  assert.equal((await old).status, 'stale');
  worker.fail(currentPost);
  assert.deepEqual(await current, {
    status: 'failed',
    inputFingerprint: 'current',
    message: FAILURE_MESSAGE,
  });
  worker.fail(oldPost);

  const retry = coordinator.retry('main');
  assert.equal(worker.posts[2].request.inputFingerprint, 'current');
  assert.deepEqual([...new Uint8ClampedArray(worker.posts[2].request.pixels)], [2, 2, 2, 255]);
  worker.succeed(worker.posts[2], frame(20, 20, 20, 255));
  assert.equal((await retry).status, 'ready');
});

test('cache entries are isolated by fingerprint and returned as independent clones', async (context) => {
  const worker = new FakeBackgroundRemovalWorker();
  const coordinator = new BackgroundRemovalCoordinator(() => worker, { maxCacheBytes: 8 });
  context.after(() => coordinator.dispose());

  const initial = coordinator.render(renderInput('main', 'shared'));
  assert.equal(worker.posts[0].transferMatchesPixels, true);
  worker.succeed(worker.posts[0], frame(10, 20, 30, 255));
  const ready = await initial;
  assert.equal(ready.status, 'ready');
  if (ready.status === 'ready') ready.frame.pixels[0] = 200;

  const hit = await coordinator.render(renderInput('tile', 'shared'));
  assert.equal(worker.posts.length, 1);
  assert.equal(hit.status, 'ready');
  if (hit.status === 'ready') assert.deepEqual([...hit.frame.pixels], [10, 20, 30, 255]);

  const different = coordinator.render(renderInput('other', 'different'));
  assert.equal(worker.posts.length, 2);
  worker.succeed(worker.posts[1], frame(40, 50, 60, 255));
  assert.equal((await different).status, 'ready');
});

test('malformed current responses fail while mismatched identities are ignored', async (context) => {
  const worker = new FakeBackgroundRemovalWorker();
  const coordinator = new BackgroundRemovalCoordinator(() => worker);
  context.after(() => coordinator.dispose());

  const pending = coordinator.render(renderInput('main', 'valid'));
  const post = worker.posts[0];
  let settled = false;
  void pending.then(() => { settled = true; });
  worker.message({
    requestId: post.request.requestId,
    surfaceId: 'wrong',
    inputFingerprint: post.request.inputFingerprint,
    width: 1,
    height: 1,
    pixels: frame(1, 2, 3, 255).pixels.buffer,
  });
  await Promise.resolve();
  assert.equal(settled, false);

  worker.message({
    requestId: post.request.requestId,
    surfaceId: post.request.surfaceId,
    inputFingerprint: post.request.inputFingerprint,
    width: 2,
    height: 1,
    pixels: frame(1, 2, 3, 255).pixels.buffer,
  });
  assert.deepEqual(await pending, {
    status: 'failed',
    inputFingerprint: 'valid',
    message: FAILURE_MESSAGE,
  });
});

test('post failures and worker crashes fail only current work', async (context) => {
  const worker = new FakeBackgroundRemovalWorker();
  const coordinator = new BackgroundRemovalCoordinator(() => worker);
  context.after(() => coordinator.dispose());

  worker.nextPostError = new Error('post failed');
  const replaced = coordinator.render(renderInput('main', 'post-error'));
  const replacement = coordinator.render(renderInput('main', 'replacement'));
  assert.deepEqual(await replaced, { status: 'stale', inputFingerprint: 'post-error' });
  worker.succeed(worker.posts[0], frame(8, 8, 8, 255));
  assert.equal((await replacement).status, 'ready');

  const main = coordinator.render(renderInput('main', 'crash-main'));
  const tile = coordinator.render(renderInput('tile', 'crash-tile'));
  worker.crash();
  assert.equal((await main).status, 'failed');
  assert.equal((await tile).status, 'failed');
});

test('timeout uses injected authority and preserves retry input', async (context) => {
  const worker = new FakeBackgroundRemovalWorker();
  const timer = new FakeTimer();
  const coordinator = new BackgroundRemovalCoordinator(() => worker, {
    timer,
    timeoutMs: 123,
  });
  context.after(() => coordinator.dispose());

  const pending = coordinator.render(renderInput('main', 'timeout'));
  assert.deepEqual(timer.delays, [123]);
  timer.runAll();
  assert.deepEqual(await pending, {
    status: 'failed',
    inputFingerprint: 'timeout',
    message: FAILURE_MESSAGE,
  });

  const retry = coordinator.retry('main');
  assert.equal(worker.posts.length, 2);
  worker.succeed(worker.posts[1], frame(4, 5, 6, 255));
  assert.equal((await retry).status, 'ready');
  assert.equal(timer.callbacks.size, 0);
});

test('surface release and dispose settle pending work stale and clear resources', async () => {
  const worker = new FakeBackgroundRemovalWorker();
  const timer = new FakeTimer();
  const coordinator = new BackgroundRemovalCoordinator(() => worker, { timer });
  const released = coordinator.render(renderInput('released', 'released'));
  coordinator.clearSurface('released');
  assert.deepEqual(await released, { status: 'stale', inputFingerprint: 'released' });
  assert.deepEqual(await coordinator.retry('released'), {
    status: 'stale',
    inputFingerprint: '',
  });

  const pending = coordinator.render(renderInput('main', 'pending'));
  coordinator.dispose();
  coordinator.dispose();
  assert.deepEqual(await pending, { status: 'stale', inputFingerprint: 'pending' });
  assert.equal(timer.callbacks.size, 0);
  assert.equal(worker.terminateCount, 1);
  assert.equal(worker.listeners.get('message')?.size, 0);
  assert.deepEqual(await coordinator.render(renderInput('new', 'new')), {
    status: 'stale',
    inputFingerprint: 'new',
  });
});

test('createBrowserBackgroundRemovalWorker constructs a dedicated module worker', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  const calls: Array<{ url: URL; options?: WorkerOptions }> = [];
  class WorkerStub {
    constructor(url: URL, options?: WorkerOptions) {
      calls.push({ url, options });
    }
  }
  Object.defineProperty(globalThis, 'Worker', { configurable: true, value: WorkerStub });
  try {
    const worker = createBrowserBackgroundRemovalWorker();
    assert.ok(worker instanceof WorkerStub);
    assert.match(calls[0].url.href, /\/editor\/backgroundRemovalWorker\.ts$/);
    assert.deepEqual(calls[0].options, { type: 'module' });
  } finally {
    if (original) Object.defineProperty(globalThis, 'Worker', original);
    else Reflect.deleteProperty(globalThis, 'Worker');
  }
});

test('module worker validates exact requests and transfers successful output', async () => {
  const originalSelf = Object.getOwnPropertyDescriptor(globalThis, 'self');
  const scope = new FakeWorkerScope();
  Object.defineProperty(globalThis, 'self', { configurable: true, value: scope });
  try {
    await import('../editor/backgroundRemovalWorker');
    scope.dispatch({
      requestId: 1,
      surfaceId: 'main',
      inputFingerprint: 'valid',
      width: 1,
      height: 1,
      pixels: new Uint8ClampedArray([1, 2, 3, 255]).buffer,
      settings: createDefaultBackgroundRemoval(),
      corrections: { schemaVersion: 1, strokes: [] },
    });
    assert.equal(scope.posts[0].message.requestId, 1);
    assert.equal(scope.posts[0].message.inputFingerprint, 'valid');
    assert.equal(scope.posts[0].transferMatchesPixels, true);

    scope.dispatch({
      requestId: 2,
      surfaceId: 'main',
      inputFingerprint: 'invalid',
      width: 2,
      height: 1,
      pixels: new Uint8ClampedArray([1, 2, 3, 255]).buffer,
      settings: createDefaultBackgroundRemoval(),
      corrections: { schemaVersion: 1, strokes: [] },
    });
    assert.deepEqual(scope.posts[1].message, {
      requestId: 2,
      surfaceId: 'main',
      inputFingerprint: 'invalid',
      message: FAILURE_MESSAGE,
    });

    scope.dispatch({
      requestId: 3,
      surfaceId: 'main',
      inputFingerprint: 'unnormalized',
      width: 1,
      height: 1,
      pixels: new Uint8ClampedArray([1, 2, 3, 255]).buffer,
      settings: { ...createDefaultBackgroundRemoval(), tolerance: 24.4 },
      corrections: { schemaVersion: 1, strokes: [] },
    });
    assert.deepEqual(scope.posts[2].message, {
      requestId: 3,
      surfaceId: 'main',
      inputFingerprint: 'unnormalized',
      message: FAILURE_MESSAGE,
    });
  } finally {
    if (originalSelf) Object.defineProperty(globalThis, 'self', originalSelf);
    else Reflect.deleteProperty(globalThis, 'self');
  }
});

class FakeWorkerScope {
  readonly posts: Array<{
    message: Record<string, unknown>;
    transfer: Transferable[];
    transferMatchesPixels: boolean;
  }> = [];
  private messageListener?: (event: MessageEvent<unknown>) => void;

  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void {
    if (type === 'message') this.messageListener = listener;
  }

  postMessage(message: Record<string, unknown>, transfer: Transferable[] = []): void {
    const transferMatchesPixels = transfer.length === 1 && transfer[0] === message.pixels;
    const cloned = structuredClone(message, { transfer }) as Record<string, unknown>;
    this.posts.push({ message: cloned, transfer: [...transfer], transferMatchesPixels });
  }

  dispatch(data: unknown): void {
    assert.ok(this.messageListener);
    this.messageListener({ data } as MessageEvent<unknown>);
  }
}
