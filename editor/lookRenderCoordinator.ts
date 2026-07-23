import type { VariationLook } from './lookModel';
import type { RgbaFrame } from './lookProcessor';

const DEFAULT_MAX_CACHE_BYTES = 64 * 1024 * 1024;
const FAILURE_MESSAGE = 'Look preview failed.' as const;

export interface LookRenderRequest {
  requestId: number;
  renderKey: string;
  width: number;
  height: number;
  pixels: ArrayBuffer;
  look: VariationLook;
}

export interface LookRenderInput {
  surfaceId: string;
  renderKey: string;
  frame: RgbaFrame;
  look: VariationLook;
}

export type LookRenderOutcome =
  | { status: 'ready'; renderKey: string; frame: RgbaFrame }
  | { status: 'failed'; renderKey: string; message: typeof FAILURE_MESSAGE }
  | { status: 'stale'; renderKey: string };

type LookWorkerEventType = 'message' | 'error' | 'messageerror';
type LookWorkerEventListener = (event: Event) => void;

export interface LookWorkerLike {
  postMessage(message: LookRenderRequest, transfer: Transferable[]): void;
  addEventListener(type: LookWorkerEventType, listener: LookWorkerEventListener): void;
  removeEventListener(type: LookWorkerEventType, listener: LookWorkerEventListener): void;
  terminate(): void;
}

interface OwnedRenderInput {
  renderKey: string;
  frame: RgbaFrame;
  look: VariationLook;
}

interface PendingRender {
  requestId: number;
  surfaceId: string;
  renderKey: string;
  input: OwnedRenderInput;
  resolve: (outcome: LookRenderOutcome) => void;
  settled: boolean;
}

interface SurfaceAuthority {
  requestId: number;
  renderKey: string;
  retryInput?: OwnedRenderInput;
}

interface CacheEntry {
  frame: RgbaFrame;
  bytes: number;
}

const cloneFrame = (frame: RgbaFrame): RgbaFrame => ({
  width: frame.width,
  height: frame.height,
  pixels: new Uint8ClampedArray(frame.pixels),
});

const cloneInput = (input: LookRenderInput): OwnedRenderInput => ({
  renderKey: input.renderKey,
  frame: cloneFrame(input.frame),
  look: { ...input.look } as VariationLook,
});

const normalizeCacheBudget = (value: number | undefined) => {
  if (value === undefined) return DEFAULT_MAX_CACHE_BYTES;
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
};

class FrameLruCache {
  private readonly entries = new Map<string, CacheEntry>();
  private totalBytes = 0;

  constructor(private readonly maxBytes: number) {}

  get(renderKey: string): RgbaFrame | undefined {
    const entry = this.entries.get(renderKey);
    if (!entry) return undefined;

    let frame: RgbaFrame;
    try {
      frame = cloneFrame(entry.frame);
      this.entries.delete(renderKey);
      this.entries.set(renderKey, entry);
    } catch {
      this.recalculateBytes();
      return undefined;
    }
    return frame;
  }

  set(renderKey: string, frame: RgbaFrame): void {
    const bytes = frame.pixels.byteLength;
    if (bytes > this.maxBytes) return;

    let cachedFrame: RgbaFrame;
    try {
      cachedFrame = cloneFrame(frame);
    } catch {
      return;
    }

    try {
      const existing = this.entries.get(renderKey);
      if (existing) {
        this.entries.delete(renderKey);
        this.totalBytes -= existing.bytes;
      }
      this.entries.set(renderKey, { frame: cachedFrame, bytes });
      this.totalBytes += bytes;

      while (this.totalBytes > this.maxBytes) {
        const oldest = this.entries.entries().next().value as [string, CacheEntry] | undefined;
        if (!oldest) break;
        this.entries.delete(oldest[0]);
        this.totalBytes -= oldest[1].bytes;
      }
    } catch {
      this.clear();
    }
  }

  evictVariation(variationId: string): void {
    const prefix = `${variationId}:`;
    for (const [renderKey, entry] of this.entries) {
      if (renderKey !== variationId && !renderKey.startsWith(prefix)) continue;
      this.entries.delete(renderKey);
      this.totalBytes -= entry.bytes;
    }
  }

  clear(): void {
    this.entries.clear();
    this.totalBytes = 0;
  }

  private recalculateBytes(): void {
    this.totalBytes = 0;
    for (const entry of this.entries.values()) this.totalBytes += entry.bytes;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasValidRequestId = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0;

const isValidSuccess = (
  value: Record<string, unknown>,
  pending: PendingRender,
): value is Record<string, unknown> & {
  width: number;
  height: number;
  pixels: ArrayBuffer;
} => {
  if (
    value.width !== pending.input.frame.width ||
    value.height !== pending.input.frame.height ||
    !(value.pixels instanceof ArrayBuffer)
  ) {
    return false;
  }
  return value.pixels.byteLength === value.width * value.height * 4;
};

export class LookRenderCoordinator {
  private readonly worker: LookWorkerLike;
  private readonly cache: FrameLruCache;
  private readonly surfaces = new Map<string, SurfaceAuthority>();
  private readonly pending = new Map<number, PendingRender>();
  private requestId = 0;
  private disposed = false;

  private readonly onMessage: LookWorkerEventListener = (event) => {
    this.handleMessage((event as MessageEvent<unknown>).data);
  };

  private readonly onWorkerFailure: LookWorkerEventListener = () => {
    for (const pending of [...this.pending.values()]) this.fail(pending);
  };

  constructor(
    createWorker: () => LookWorkerLike,
    options: { maxCacheBytes?: number } = {},
  ) {
    this.worker = createWorker();
    this.cache = new FrameLruCache(normalizeCacheBudget(options.maxCacheBytes));
    this.worker.addEventListener('message', this.onMessage);
    this.worker.addEventListener('error', this.onWorkerFailure);
    this.worker.addEventListener('messageerror', this.onWorkerFailure);
  }

  render(input: LookRenderInput): Promise<LookRenderOutcome> {
    if (this.disposed) return Promise.resolve({ status: 'stale', renderKey: input.renderKey });

    this.releaseSurface(input.surfaceId);
    const requestId = this.nextRequestId();
    const authority: SurfaceAuthority = { requestId, renderKey: input.renderKey };
    this.surfaces.set(input.surfaceId, authority);

    const cached = this.cache.get(input.renderKey);
    if (cached) {
      return Promise.resolve({ status: 'ready', renderKey: input.renderKey, frame: cached });
    }

    let ownedInput: OwnedRenderInput;
    try {
      ownedInput = cloneInput(input);
    } catch {
      return Promise.resolve({
        status: 'failed',
        renderKey: input.renderKey,
        message: FAILURE_MESSAGE,
      });
    }
    return this.dispatch(input.surfaceId, authority, ownedInput);
  }

  retry(surfaceId: string): Promise<LookRenderOutcome> {
    const current = this.surfaces.get(surfaceId);
    if (this.disposed || !current?.retryInput) {
      return Promise.resolve({ status: 'stale', renderKey: current?.renderKey ?? '' });
    }

    const authority: SurfaceAuthority = {
      requestId: this.nextRequestId(),
      renderKey: current.renderKey,
    };
    this.surfaces.set(surfaceId, authority);
    return this.dispatch(surfaceId, authority, current.retryInput);
  }

  clearSurface(surfaceId: string): void {
    this.releaseSurface(surfaceId);
  }

  evictVariation(variationId: string): void {
    this.cache.evictVariation(variationId);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const pending of [...this.pending.values()]) this.settle(pending, {
      status: 'stale',
      renderKey: pending.renderKey,
    });
    this.pending.clear();
    this.surfaces.clear();
    this.cache.clear();
    this.worker.removeEventListener('message', this.onMessage);
    this.worker.removeEventListener('error', this.onWorkerFailure);
    this.worker.removeEventListener('messageerror', this.onWorkerFailure);
    this.worker.terminate();
  }

  private dispatch(
    surfaceId: string,
    authority: SurfaceAuthority,
    input: OwnedRenderInput,
  ): Promise<LookRenderOutcome> {
    return new Promise((resolve) => {
      const pending: PendingRender = {
        requestId: authority.requestId,
        surfaceId,
        renderKey: input.renderKey,
        input,
        resolve,
        settled: false,
      };
      this.pending.set(pending.requestId, pending);

      try {
        const pixels = new Uint8ClampedArray(input.frame.pixels);
        const request: LookRenderRequest = {
          requestId: pending.requestId,
          renderKey: pending.renderKey,
          width: input.frame.width,
          height: input.frame.height,
          pixels: pixels.buffer,
          look: { ...input.look } as VariationLook,
        };
        this.worker.postMessage(request, [request.pixels]);
      } catch {
        this.fail(pending);
      }
    });
  }

  private handleMessage(value: unknown): void {
    if (this.disposed) return;
    if (!isRecord(value) || !hasValidRequestId(value.requestId)) {
      for (const pending of [...this.pending.values()]) this.fail(pending);
      return;
    }

    const pending = this.pending.get(value.requestId);
    if (!pending) return;
    if (value.renderKey !== pending.renderKey) return;
    if (!this.isCurrent(pending)) return;

    if (!isValidSuccess(value, pending)) {
      this.fail(pending);
      return;
    }

    const renderedFrame: RgbaFrame = {
      width: value.width,
      height: value.height,
      pixels: new Uint8ClampedArray(value.pixels),
    };
    this.pending.delete(pending.requestId);
    const authority = this.surfaces.get(pending.surfaceId);
    if (authority) delete authority.retryInput;
    this.cache.set(pending.renderKey, renderedFrame);
    this.settle(pending, {
      status: 'ready',
      renderKey: pending.renderKey,
      frame: renderedFrame,
    });
  }

  private fail(pending: PendingRender): void {
    if (!this.isCurrent(pending)) return;
    this.pending.delete(pending.requestId);
    const authority = this.surfaces.get(pending.surfaceId);
    if (authority) authority.retryInput = pending.input;
    this.settle(pending, {
      status: 'failed',
      renderKey: pending.renderKey,
      message: FAILURE_MESSAGE,
    });
  }

  private releaseSurface(surfaceId: string): void {
    const authority = this.surfaces.get(surfaceId);
    if (!authority) return;
    const pending = this.pending.get(authority.requestId);
    if (pending) this.settle(pending, { status: 'stale', renderKey: pending.renderKey });
    this.surfaces.delete(surfaceId);
  }

  private settle(pending: PendingRender, outcome: LookRenderOutcome): void {
    if (pending.settled) return;
    pending.settled = true;
    this.pending.delete(pending.requestId);
    pending.resolve(outcome);
  }

  private isCurrent(pending: PendingRender): boolean {
    const authority = this.surfaces.get(pending.surfaceId);
    return authority?.requestId === pending.requestId && authority.renderKey === pending.renderKey;
  }

  private nextRequestId(): number {
    this.requestId = this.requestId === Number.MAX_SAFE_INTEGER ? 1 : this.requestId + 1;
    return this.requestId;
  }
}

export const createBrowserLookWorker = (): LookWorkerLike =>
  new Worker(new URL('./lookWorker.ts', import.meta.url), { type: 'module' }) as unknown as LookWorkerLike;
