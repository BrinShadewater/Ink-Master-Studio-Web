import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDefaultLook } from '../editor/lookModel';
import type { RgbaFrame } from '../editor/lookProcessor';
import {
  LookRenderCoordinator,
  createBrowserLookWorker,
  type LookRenderRequest,
  type LookWorkerLike,
} from '../editor/lookRenderCoordinator';

const FAILURE_MESSAGE = 'Look preview failed.' as const;
type WorkerEventType = 'message' | 'error' | 'messageerror';
type WorkerListener = (event: Event) => void;

interface PostedRequest {
  request: LookRenderRequest;
  transfer: Transferable[];
  transferMatchesPixels: boolean;
}

class FakeLookWorker implements LookWorkerLike {
  readonly posts: PostedRequest[] = [];
  readonly listeners = new Map<WorkerEventType, Set<WorkerListener>>([
    ['message', new Set()],
    ['error', new Set()],
    ['messageerror', new Set()],
  ]);
  terminateCount = 0;
  nextPostError: Error | undefined;

  postMessage(message: LookRenderRequest, transfer: Transferable[]): void {
    if (this.nextPostError) {
      const error = this.nextPostError;
      this.nextPostError = undefined;
      throw error;
    }
    const transferMatchesPixels = transfer.length === 1 && transfer[0] === message.pixels;
    const request = structuredClone(message, { transfer }) as LookRenderRequest;
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

  succeed(post: PostedRequest, pixels: Uint8ClampedArray): void {
    this.emit('message', {
      data: {
        requestId: post.request.requestId,
        renderKey: post.request.renderKey,
        width: post.request.width,
        height: post.request.height,
        pixels: pixels.buffer,
      },
    } as MessageEvent<unknown>);
  }

  fail(post: PostedRequest): void {
    this.emit('message', {
      data: {
        requestId: post.request.requestId,
        renderKey: post.request.renderKey,
        message: FAILURE_MESSAGE,
      },
    } as MessageEvent<unknown>);
  }

  message(data: unknown): void {
    this.emit('message', { data } as MessageEvent<unknown>);
  }

  crash(): void {
    this.emit('error', new Event('error'));
  }

  private emit(type: WorkerEventType, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

const frame = (...pixels: number[]): RgbaFrame => ({
  width: pixels.length / 4,
  height: 1,
  pixels: new Uint8ClampedArray(pixels),
});

const renderInput = (surfaceId: string, renderKey: string, source = frame(1, 2, 3, 255)) => ({
  surfaceId,
  renderKey,
  frame: source,
  look: createDefaultLook('original'),
});

test('a newer request makes an older success stale without populating the cache', async (context) => {
  const worker = new FakeLookWorker();
  const coordinator = new LookRenderCoordinator(() => worker);
  context.after(() => coordinator.dispose());

  const first = coordinator.render(renderInput('main', 'variation-a:first'));
  const firstPost = worker.posts[0];
  const second = coordinator.render(renderInput('main', 'variation-a:second'));
  const secondPost = worker.posts[1];

  assert.deepEqual(await first, { status: 'stale', renderKey: 'variation-a:first' });
  worker.succeed(firstPost, new Uint8ClampedArray([10, 20, 30, 255]));

  const probe = coordinator.render(renderInput('probe', 'variation-a:first'));
  assert.equal(worker.posts.length, 3, 'a stale result must not become a cache hit');
  worker.succeed(secondPost, new Uint8ClampedArray([40, 50, 60, 255]));
  worker.succeed(worker.posts[2], new Uint8ClampedArray([70, 80, 90, 255]));

  assert.deepEqual(await second, {
    status: 'ready',
    renderKey: 'variation-a:second',
    frame: frame(40, 50, 60, 255),
  });
  assert.equal((await probe).status, 'ready');
});

test('a stale failure cannot replace retry authority for the current failed request', async (context) => {
  const worker = new FakeLookWorker();
  const coordinator = new LookRenderCoordinator(() => worker);
  context.after(() => coordinator.dispose());

  const first = coordinator.render(renderInput('main', 'variation-a:first', frame(1, 1, 1, 255)));
  const firstPost = worker.posts[0];
  const second = coordinator.render(renderInput('main', 'variation-a:second', frame(2, 2, 2, 255)));
  const secondPost = worker.posts[1];

  assert.equal((await first).status, 'stale');
  worker.fail(secondPost);
  assert.deepEqual(await second, {
    status: 'failed',
    renderKey: 'variation-a:second',
    message: FAILURE_MESSAGE,
  });

  worker.fail(firstPost);
  const retry = coordinator.retry('main');
  assert.equal(worker.posts.length, 3);
  assert.equal(worker.posts[2].request.renderKey, 'variation-a:second');
  assert.deepEqual([...new Uint8ClampedArray(worker.posts[2].request.pixels)], [2, 2, 2, 255]);
  worker.succeed(worker.posts[2], new Uint8ClampedArray([20, 20, 20, 255]));
  assert.equal((await retry).status, 'ready');
});

test('request authority is independent for each render surface', async (context) => {
  const worker = new FakeLookWorker();
  const coordinator = new LookRenderCoordinator(() => worker);
  context.after(() => coordinator.dispose());

  const oldMain = coordinator.render(renderInput('main', 'variation-a:old'));
  const tile = coordinator.render(renderInput('tile-1', 'variation-b:tile'));
  const newMain = coordinator.render(renderInput('main', 'variation-a:new'));

  assert.equal((await oldMain).status, 'stale');
  worker.succeed(worker.posts[1], new Uint8ClampedArray([8, 8, 8, 255]));
  worker.succeed(worker.posts[2], new Uint8ClampedArray([9, 9, 9, 255]));

  assert.deepEqual(await tile, {
    status: 'ready',
    renderKey: 'variation-b:tile',
    frame: frame(8, 8, 8, 255),
  });
  assert.deepEqual(await newMain, {
    status: 'ready',
    renderKey: 'variation-a:new',
    frame: frame(9, 9, 9, 255),
  });
});

test('worker transfer and cache ownership leave caller and cached bytes isolated', async (context) => {
  const worker = new FakeLookWorker();
  const coordinator = new LookRenderCoordinator(() => worker);
  context.after(() => coordinator.dispose());
  const source = frame(1, 2, 3, 255);

  const initial = coordinator.render(renderInput('main', 'variation-a:shared', source));
  assert.deepEqual([...source.pixels], [1, 2, 3, 255]);
  assert.equal(source.pixels.byteLength, 4);
  assert.equal(worker.posts[0].transferMatchesPixels, true);
  assert.equal(worker.posts[0].transfer.length, 1);
  assert.deepEqual([...new Uint8ClampedArray(worker.posts[0].request.pixels)], [1, 2, 3, 255]);

  worker.succeed(worker.posts[0], new Uint8ClampedArray([10, 20, 30, 255]));
  const ready = await initial;
  assert.equal(ready.status, 'ready');
  if (ready.status !== 'ready') return;
  ready.frame.pixels[0] = 200;

  const firstHit = await coordinator.render(renderInput('tile-1', 'variation-a:shared'));
  assert.equal(worker.posts.length, 1, 'cache hits must not post to the worker');
  assert.equal(firstHit.status, 'ready');
  if (firstHit.status !== 'ready') return;
  assert.deepEqual([...firstHit.frame.pixels], [10, 20, 30, 255]);
  firstHit.frame.pixels[1] = 201;

  const secondHit = await coordinator.render(renderInput('tile-2', 'variation-a:shared'));
  assert.equal(secondHit.status, 'ready');
  if (secondHit.status === 'ready') {
    assert.deepEqual([...secondHit.frame.pixels], [10, 20, 30, 255]);
  }
});

test('a same-stack replacement makes a cache-hit outcome stale', async (context) => {
  const worker = new FakeLookWorker();
  const coordinator = new LookRenderCoordinator(() => worker);
  context.after(() => coordinator.dispose());

  const seed = coordinator.render(renderInput('seed', 'variation-a:cached'));
  worker.succeed(worker.posts[0], new Uint8ClampedArray([10, 20, 30, 255]));
  await seed;

  const cacheHit = coordinator.render(renderInput('main', 'variation-a:cached'));
  const replacement = coordinator.render(renderInput('main', 'variation-a:replacement'));
  assert.deepEqual(await cacheHit, { status: 'stale', renderKey: 'variation-a:cached' });
  assert.equal(worker.posts.length, 2);
  worker.succeed(worker.posts[1], new Uint8ClampedArray([40, 50, 60, 255]));
  assert.equal((await replacement).status, 'ready');
});

test('clearSurface makes a same-stack cache-hit outcome stale', async (context) => {
  const worker = new FakeLookWorker();
  const coordinator = new LookRenderCoordinator(() => worker);
  context.after(() => coordinator.dispose());

  const seed = coordinator.render(renderInput('seed', 'variation-a:cached'));
  worker.succeed(worker.posts[0], new Uint8ClampedArray([10, 20, 30, 255]));
  await seed;

  const cacheHit = coordinator.render(renderInput('main', 'variation-a:cached'));
  coordinator.clearSurface('main');
  assert.deepEqual(await cacheHit, { status: 'stale', renderKey: 'variation-a:cached' });
  assert.equal(worker.posts.length, 1);
});

test('dispose makes a same-stack cache-hit outcome stale', async () => {
  const worker = new FakeLookWorker();
  const coordinator = new LookRenderCoordinator(() => worker);

  const seed = coordinator.render(renderInput('seed', 'variation-a:cached'));
  worker.succeed(worker.posts[0], new Uint8ClampedArray([10, 20, 30, 255]));
  await seed;

  const cacheHit = coordinator.render(renderInput('main', 'variation-a:cached'));
  coordinator.dispose();
  assert.deepEqual(await cacheHit, { status: 'stale', renderKey: 'variation-a:cached' });
  assert.equal(worker.terminateCount, 1);
});

test('clone failure remains staleable until its deferred authority check', async (context) => {
  const worker = new FakeLookWorker();
  const coordinator = new LookRenderCoordinator(() => worker);
  context.after(() => coordinator.dispose());
  const uncloneableFrame = {
    width: 1,
    height: 1,
    pixels: {
      [Symbol.iterator](): Iterator<number> {
        throw new Error('simulated frame clone failure');
      },
    } as unknown as Uint8ClampedArray,
  };

  const failed = coordinator.render(renderInput('main', 'variation-a:clone-failure', uncloneableFrame));
  coordinator.clearSurface('main');

  assert.deepEqual(await failed, { status: 'stale', renderKey: 'variation-a:clone-failure' });
  assert.equal(worker.posts.length, 0);
});

test('synchronous postMessage failures remain staleable by replacement and clear', async (context) => {
  const worker = new FakeLookWorker();
  const coordinator = new LookRenderCoordinator(() => worker);
  context.after(() => coordinator.dispose());

  worker.nextPostError = new Error('post failed');
  const replaced = coordinator.render(renderInput('main', 'variation-a:post-failure'));
  const replacement = coordinator.render(renderInput('main', 'variation-a:replacement'));
  assert.deepEqual(await replaced, { status: 'stale', renderKey: 'variation-a:post-failure' });
  worker.succeed(worker.posts[0], new Uint8ClampedArray([10, 20, 30, 255]));
  assert.equal((await replacement).status, 'ready');

  worker.nextPostError = new Error('post failed again');
  const cleared = coordinator.render(renderInput('tile', 'variation-b:post-failure'));
  coordinator.clearSurface('tile');
  assert.deepEqual(await cleared, { status: 'stale', renderKey: 'variation-b:post-failure' });
  assert.deepEqual(await coordinator.retry('tile'), { status: 'stale', renderKey: '' });
  assert.equal(worker.posts.length, 1);
});

test('LRU accounting uses exact RGBA bytes and promotes entries on read', async (context) => {
  const worker = new FakeLookWorker();
  const coordinator = new LookRenderCoordinator(() => worker, { maxCacheBytes: 12 });
  context.after(() => coordinator.dispose());

  const a = coordinator.render(renderInput('surface-a', 'variation-a:a', frame(1, 1, 1, 255, 2, 2, 2, 255)));
  worker.succeed(worker.posts[0], new Uint8ClampedArray([10, 10, 10, 255, 20, 20, 20, 255]));
  await a;
  const b = coordinator.render(renderInput('surface-b', 'variation-b:b'));
  worker.succeed(worker.posts[1], new Uint8ClampedArray([30, 30, 30, 255]));
  await b;

  await coordinator.render(renderInput('surface-a-hit', 'variation-a:a'));
  assert.equal(worker.posts.length, 2);

  const c = coordinator.render(renderInput('surface-c', 'variation-c:c'));
  worker.succeed(worker.posts[2], new Uint8ClampedArray([40, 40, 40, 255]));
  await c;

  const bAgain = coordinator.render(renderInput('surface-b-again', 'variation-b:b'));
  assert.equal(worker.posts.length, 4, 'the four-byte least-recent entry should be evicted');

  await coordinator.render(renderInput('surface-a-again', 'variation-a:a'));
  assert.equal(worker.posts.length, 4, 'the promoted eight-byte entry should remain cached');

  worker.succeed(worker.posts[3], new Uint8ClampedArray([50, 50, 50, 255]));
  await bAgain;
});

test('an entry larger than the cache budget bypasses caching without changing its outcome', async (context) => {
  const worker = new FakeLookWorker();
  const coordinator = new LookRenderCoordinator(() => worker, { maxCacheBytes: 4 });
  context.after(() => coordinator.dispose());
  const source = frame(1, 2, 3, 255, 4, 5, 6, 255);

  const first = coordinator.render(renderInput('main', 'variation-a:large', source));
  worker.succeed(worker.posts[0], new Uint8ClampedArray([7, 8, 9, 255, 10, 11, 12, 255]));
  assert.equal((await first).status, 'ready');

  const second = coordinator.render(renderInput('tile', 'variation-a:large', source));
  assert.equal(worker.posts.length, 2);
  worker.succeed(worker.posts[1], new Uint8ClampedArray([7, 8, 9, 255, 10, 11, 12, 255]));
  assert.equal((await second).status, 'ready');
});

test('a cache promotion failure returns the valid clone without recomputation', async (context) => {
  const worker = new FakeLookWorker();
  const coordinator = new LookRenderCoordinator(() => worker, { maxCacheBytes: 8 });
  context.after(() => coordinator.dispose());

  for (const [surfaceId, renderKey, value] of [
    ['one', 'variation-a:a', 10],
    ['two', 'variation-b:b', 20],
  ] as const) {
    const pending = coordinator.render(renderInput(surfaceId, renderKey));
    worker.succeed(worker.posts.at(-1)!, new Uint8ClampedArray([value, value, value, 255]));
    await pending;
  }

  const originalSet = Map.prototype.set;
  let throwOnPromotion = true;
  Map.prototype.set = function (key: unknown, value: unknown) {
    if (
      throwOnPromotion &&
      key === 'variation-a:a' &&
      typeof value === 'object' &&
      value !== null &&
      'bytes' in value
    ) {
      throwOnPromotion = false;
      throw new Error('simulated cache allocation failure');
    }
    return Reflect.apply(originalSet, this, [key, value]);
  } as typeof Map.prototype.set;

  let promoted: ReturnType<LookRenderCoordinator['render']>;
  try {
    promoted = coordinator.render(renderInput('probe-a', 'variation-a:a'));
  } finally {
    Map.prototype.set = originalSet;
  }
  assert.equal(worker.posts.length, 2, 'a valid cache clone must not be recomputed');
  assert.deepEqual(await promoted, {
    status: 'ready',
    renderKey: 'variation-a:a',
    frame: frame(10, 10, 10, 255),
  });

  const retainedPromise = coordinator.render(renderInput('probe-b', 'variation-b:b'));
  assert.equal(worker.posts.length, 2, 'the unrelated cache entry must remain valid');
  const retained = await retainedPromise;
  assert.equal(retained.status, 'ready');
});

test('variation eviction removes only keys with the exact variation prefix', async (context) => {
  const worker = new FakeLookWorker();
  const coordinator = new LookRenderCoordinator(() => worker, { maxCacheBytes: 32 });
  context.after(() => coordinator.dispose());

  for (const [surfaceId, renderKey, value] of [
    ['one', 'variation-a:first', 10],
    ['two', 'variation-a:second', 20],
    ['three', 'variation-ab:first', 30],
  ] as const) {
    const pending = coordinator.render(renderInput(surfaceId, renderKey));
    worker.succeed(worker.posts.at(-1)!, new Uint8ClampedArray([value, value, value, 255]));
    await pending;
  }

  coordinator.evictVariation('variation-a');
  const evicted = coordinator.render(renderInput('probe-a', 'variation-a:first'));
  assert.equal(worker.posts.length, 4);
  worker.succeed(worker.posts[3], new Uint8ClampedArray([40, 40, 40, 255]));
  await evicted;

  const retained = await coordinator.render(renderInput('probe-ab', 'variation-ab:first'));
  assert.equal(worker.posts.length, 4);
  assert.equal(retained.status, 'ready');
});

test('retry resubmits the failed current key and its coordinator-owned input', async (context) => {
  const worker = new FakeLookWorker();
  const coordinator = new LookRenderCoordinator(() => worker);
  context.after(() => coordinator.dispose());
  const source = frame(1, 2, 3, 255);

  const pending = coordinator.render(renderInput('main', 'variation-a:retry', source));
  worker.fail(worker.posts[0]);
  await pending;
  source.pixels.fill(99);

  const retry = coordinator.retry('main');
  assert.equal(worker.posts[1].request.renderKey, 'variation-a:retry');
  assert.deepEqual([...new Uint8ClampedArray(worker.posts[1].request.pixels)], [1, 2, 3, 255]);
  worker.succeed(worker.posts[1], new Uint8ClampedArray([4, 5, 6, 255]));
  assert.deepEqual(await retry, {
    status: 'ready',
    renderKey: 'variation-a:retry',
    frame: frame(4, 5, 6, 255),
  });
});

test('clearSurface resolves pending work as stale and removes retry authority', async (context) => {
  const worker = new FakeLookWorker();
  const coordinator = new LookRenderCoordinator(() => worker);
  context.after(() => coordinator.dispose());

  const pending = coordinator.render(renderInput('main', 'variation-a:pending'));
  coordinator.clearSurface('main');
  assert.deepEqual(await pending, { status: 'stale', renderKey: 'variation-a:pending' });
  worker.fail(worker.posts[0]);

  const postsBeforeRetry = worker.posts.length;
  assert.deepEqual(await coordinator.retry('main'), { status: 'stale', renderKey: '' });
  assert.equal(worker.posts.length, postsBeforeRetry);

  const failed = coordinator.render(renderInput('main', 'variation-a:failed'));
  worker.fail(worker.posts[1]);
  await failed;
  coordinator.clearSurface('main');
  assert.deepEqual(await coordinator.retry('main'), { status: 'stale', renderKey: '' });
  assert.equal(worker.posts.length, postsBeforeRetry + 1);
});

test('a worker crash fails every current surface without crossing render keys', async (context) => {
  const worker = new FakeLookWorker();
  const coordinator = new LookRenderCoordinator(() => worker);
  context.after(() => coordinator.dispose());

  const main = coordinator.render(renderInput('main', 'variation-a:main'));
  const tile = coordinator.render(renderInput('tile', 'variation-b:tile'));
  worker.crash();

  assert.deepEqual(await main, {
    status: 'failed', renderKey: 'variation-a:main', message: FAILURE_MESSAGE,
  });
  assert.deepEqual(await tile, {
    status: 'failed', renderKey: 'variation-b:tile', message: FAILURE_MESSAGE,
  });
});

test('responses require matching IDs and keys and malformed current payloads fail stably', async (context) => {
  const worker = new FakeLookWorker();
  const coordinator = new LookRenderCoordinator(() => worker);
  context.after(() => coordinator.dispose());

  const pending = coordinator.render(renderInput('main', 'variation-a:valid'));
  const post = worker.posts[0];
  let settled = false;
  void pending.then(() => { settled = true; });
  worker.message({
    requestId: post.request.requestId,
    renderKey: 'variation-a:wrong',
    width: 1,
    height: 1,
    pixels: new Uint8ClampedArray([1, 2, 3, 255]).buffer,
  });
  await Promise.resolve();
  assert.equal(settled, false);

  worker.message({
    requestId: post.request.requestId,
    renderKey: post.request.renderKey,
    width: 1,
    height: 1,
    pixels: 'not-an-array-buffer',
  });
  assert.deepEqual(await pending, {
    status: 'failed', renderKey: 'variation-a:valid', message: FAILURE_MESSAGE,
  });
});

test('an uncorrelated malformed message changes neither surface outcome nor retry authority', async (context) => {
  const worker = new FakeLookWorker();
  const coordinator = new LookRenderCoordinator(() => worker);
  context.after(() => coordinator.dispose());

  const main = coordinator.render(renderInput('main', 'variation-a:main'));
  const tile = coordinator.render(renderInput('tile', 'variation-b:tile'));
  let mainSettled = false;
  let tileSettled = false;
  void main.then(() => { mainSettled = true; });
  void tile.then(() => { tileSettled = true; });

  worker.message({ requestId: 'invalid', renderKey: null, pixels: 'malformed' });
  await Promise.resolve();
  assert.equal(mainSettled, false);
  assert.equal(tileSettled, false);
  assert.deepEqual(await coordinator.retry('main'), {
    status: 'stale', renderKey: 'variation-a:main',
  });
  assert.equal(worker.posts.length, 2);

  worker.fail(worker.posts[0]);
  worker.succeed(worker.posts[1], new Uint8ClampedArray([20, 30, 40, 255]));
  assert.deepEqual(await main, {
    status: 'failed', renderKey: 'variation-a:main', message: FAILURE_MESSAGE,
  });
  assert.deepEqual(await tile, {
    status: 'ready', renderKey: 'variation-b:tile', frame: frame(20, 30, 40, 255),
  });

  const retry = coordinator.retry('main');
  assert.equal(worker.posts[2].request.renderKey, 'variation-a:main');
  worker.succeed(worker.posts[2], new Uint8ClampedArray([50, 60, 70, 255]));
  assert.equal((await retry).status, 'ready');
});

test('dispose is idempotent, removes listeners, and makes pending and future work stale', async () => {
  const worker = new FakeLookWorker();
  const coordinator = new LookRenderCoordinator(() => worker);
  const main = coordinator.render(renderInput('main', 'variation-a:main'));
  const tile = coordinator.render(renderInput('tile', 'variation-b:tile'));

  coordinator.dispose();
  coordinator.dispose();

  assert.equal(worker.terminateCount, 1);
  assert.equal(worker.listeners.get('message')?.size, 0);
  assert.equal(worker.listeners.get('error')?.size, 0);
  assert.equal(worker.listeners.get('messageerror')?.size, 0);
  assert.deepEqual(await main, { status: 'stale', renderKey: 'variation-a:main' });
  assert.deepEqual(await tile, { status: 'stale', renderKey: 'variation-b:tile' });
  assert.deepEqual(await coordinator.render(renderInput('new', 'variation-c:new')), {
    status: 'stale', renderKey: 'variation-c:new',
  });
  assert.equal(worker.posts.length, 2);
});

test('createBrowserLookWorker constructs the dedicated module worker URL', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  const calls: Array<{ url: URL; options: WorkerOptions | undefined }> = [];
  class WorkerStub {
    constructor(url: URL, options?: WorkerOptions) {
      calls.push({ url, options });
    }
  }
  Object.defineProperty(globalThis, 'Worker', { configurable: true, value: WorkerStub });
  try {
    const worker = createBrowserLookWorker();
    assert.ok(worker instanceof WorkerStub);
    assert.match(calls[0].url.href, /\/editor\/lookWorker\.ts$/);
    assert.deepEqual(calls[0].options, { type: 'module' });
  } finally {
    if (originalDescriptor) Object.defineProperty(globalThis, 'Worker', originalDescriptor);
    else Reflect.deleteProperty(globalThis, 'Worker');
  }
});

test('the module worker validates requests, transfers results, and exposes only the stable failure', async () => {
  const originalSelf = Object.getOwnPropertyDescriptor(globalThis, 'self');
  const logged: unknown[][] = [];
  const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  const scope = new FakeWorkerScope();
  Object.defineProperty(globalThis, 'self', { configurable: true, value: scope });
  console.log = (...values: unknown[]) => { logged.push(values); };
  console.info = (...values: unknown[]) => { logged.push(values); };
  console.warn = (...values: unknown[]) => { logged.push(values); };
  console.error = (...values: unknown[]) => { logged.push(values); };

  try {
    await import('../editor/lookWorker');
    const input = new Uint8ClampedArray([1, 2, 3, 255]);
    scope.dispatch({
      requestId: 1,
      renderKey: 'variation-a:valid',
      width: 1,
      height: 1,
      pixels: input.buffer,
      look: createDefaultLook('original'),
    });
    assert.deepEqual(scope.posts[0].message, {
      requestId: 1,
      renderKey: 'variation-a:valid',
      width: 1,
      height: 1,
      pixels: new Uint8ClampedArray([1, 2, 3, 255]).buffer,
    });
    assert.equal(scope.posts[0].transferMatchesPixels, true);
    assert.equal(scope.posts[0].transfer.length, 1);

    scope.dispatch({
      requestId: 2,
      renderKey: 'variation-a:user-file-name.png',
      width: 2,
      height: 1,
      pixels: new Uint8ClampedArray([9, 9, 9, 255]).buffer,
      look: createDefaultLook('original'),
    });
    assert.deepEqual(scope.posts[1], {
      message: {
        requestId: 2,
        renderKey: 'variation-a:user-file-name.png',
        message: FAILURE_MESSAGE,
      },
      transfer: [],
      transferMatchesPixels: false,
    });
    assert.deepEqual(logged, []);
  } finally {
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
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
  private messageListener: ((event: MessageEvent<unknown>) => void) | undefined;

  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void {
    if (type === 'message') this.messageListener = listener;
  }

  postMessage(message: Record<string, unknown>, transfer: Transferable[] = []): void {
    const transferMatchesPixels = transfer.length === 1 && transfer[0] === message.pixels;
    const cloned = structuredClone(message, { transfer }) as Record<string, unknown>;
    this.posts.push({ message: cloned, transfer: [...transfer], transferMatchesPixels });
  }

  dispatch(data: unknown): void {
    assert.ok(this.messageListener, 'worker message listener was not installed');
    this.messageListener({ data } as MessageEvent<unknown>);
  }
}
