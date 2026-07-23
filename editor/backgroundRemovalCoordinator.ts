import type { RgbaFrame } from './backgroundRemovalProcessor';
import type {
  BackgroundRemovalSettings,
  CleanupCorrectionDocument,
} from './imagePrepModel';

const DEFAULT_MAX_CACHE_BYTES = 32 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 15_000;
const FAILURE_MESSAGE = 'Background removal failed.' as const;

export interface BackgroundRemovalRequest {
  requestId: number;
  surfaceId: string;
  inputFingerprint: string;
  width: number;
  height: number;
  pixels: ArrayBuffer;
  settings: BackgroundRemovalSettings;
  corrections: CleanupCorrectionDocument;
}

export interface BackgroundRemovalRenderInput {
  surfaceId: string;
  inputFingerprint: string;
  frame: RgbaFrame;
  settings: BackgroundRemovalSettings;
  corrections: CleanupCorrectionDocument;
}

export type BackgroundRemovalOutcome =
  | { status: 'ready'; inputFingerprint: string; frame: RgbaFrame }
  | { status: 'failed'; inputFingerprint: string; message: typeof FAILURE_MESSAGE }
  | { status: 'stale'; inputFingerprint: string };

type WorkerEventType = 'message' | 'error' | 'messageerror';
type WorkerEventListener = (event: Event) => void;

export interface BackgroundRemovalWorkerLike {
  postMessage(message: BackgroundRemovalRequest, transfer: Transferable[]): void;
  addEventListener(type: WorkerEventType, listener: WorkerEventListener): void;
  removeEventListener(type: WorkerEventType, listener: WorkerEventListener): void;
  terminate(): void;
}

export interface BackgroundRemovalTimer {
  setTimeout(callback: () => void, delay: number): unknown;
  clearTimeout(handle: unknown): void;
}

interface OwnedRenderInput {
  inputFingerprint: string;
  frame: RgbaFrame;
  settings: BackgroundRemovalSettings;
  corrections: CleanupCorrectionDocument;
}

interface PendingRender {
  requestId: number;
  surfaceId: string;
  inputFingerprint: string;
  width: number;
  height: number;
  input?: OwnedRenderInput;
  timeoutHandle?: unknown;
  resolve: (outcome: BackgroundRemovalOutcome) => void;
  settled: boolean;
}

interface SurfaceAuthority {
  requestId: number;
  inputFingerprint: string;
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

const cloneInput = (input: BackgroundRemovalRenderInput): OwnedRenderInput => ({
  inputFingerprint: input.inputFingerprint,
  frame: cloneFrame(input.frame),
  settings: structuredClone(input.settings),
  corrections: structuredClone(input.corrections),
});

const normalizeByteBudget = (value: number | undefined) => {
  if (value === undefined) return DEFAULT_MAX_CACHE_BYTES;
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
};

const normalizeTimeout = (value: number | undefined) => {
  if (value === undefined) return DEFAULT_TIMEOUT_MS;
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : DEFAULT_TIMEOUT_MS;
};

const defaultTimer: BackgroundRemovalTimer = {
  setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

class FrameLruCache {
  private readonly entries = new Map<string, CacheEntry>();
  private totalBytes = 0;

  constructor(private readonly maxBytes: number) {}

  get(inputFingerprint: string): RgbaFrame | undefined {
    const entry = this.entries.get(inputFingerprint);
    if (!entry) return undefined;
    let frame: RgbaFrame;
    try {
      frame = cloneFrame(entry.frame);
      this.entries.delete(inputFingerprint);
      this.entries.set(inputFingerprint, entry);
    } catch {
      return undefined;
    }
    return frame;
  }

  set(inputFingerprint: string, frame: RgbaFrame): void {
    const bytes = frame.pixels.byteLength;
    if (bytes > this.maxBytes) return;
    let owned: RgbaFrame;
    try {
      owned = cloneFrame(frame);
    } catch {
      return;
    }
    const previous = this.entries.get(inputFingerprint);
    if (previous) {
      this.entries.delete(inputFingerprint);
      this.totalBytes -= previous.bytes;
    }
    this.entries.set(inputFingerprint, { frame: owned, bytes });
    this.totalBytes += bytes;
    while (this.totalBytes > this.maxBytes) {
      const oldest = this.entries.entries().next().value as [string, CacheEntry] | undefined;
      if (!oldest) break;
      this.entries.delete(oldest[0]);
      this.totalBytes -= oldest[1].bytes;
    }
  }

  clear(): void {
    this.entries.clear();
    this.totalBytes = 0;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactKeys = (value: Record<string, unknown>, expected: string[]) =>
  Object.keys(value).length === expected.length &&
  expected.every((key) => Object.hasOwn(value, key));

const hasValidRequestId = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0;

const isValidSuccess = (
  value: Record<string, unknown>,
  pending: PendingRender,
): value is Record<string, unknown> & {
  width: number;
  height: number;
  pixels: ArrayBuffer;
} =>
  hasExactKeys(value, [
    'requestId',
    'surfaceId',
    'inputFingerprint',
    'width',
    'height',
    'pixels',
  ]) &&
  value.width === pending.width &&
  value.height === pending.height &&
  value.pixels instanceof ArrayBuffer &&
  value.pixels.byteLength === pending.width * pending.height * 4;

const isFailureResponse = (value: Record<string, unknown>) =>
  hasExactKeys(value, ['requestId', 'surfaceId', 'inputFingerprint', 'message']) &&
  value.message === FAILURE_MESSAGE;

export class BackgroundRemovalCoordinator {
  private readonly worker: BackgroundRemovalWorkerLike;
  private readonly timer: BackgroundRemovalTimer;
  private readonly timeoutMs: number;
  private readonly cache: FrameLruCache;
  private readonly surfaces = new Map<string, SurfaceAuthority>();
  private readonly pending = new Map<number, PendingRender>();
  private requestId = 0;
  private disposed = false;

  private readonly onMessage: WorkerEventListener = (event) => {
    this.handleMessage((event as MessageEvent<unknown>).data);
  };

  private readonly onWorkerFailure: WorkerEventListener = () => {
    for (const pending of [...this.pending.values()]) this.fail(pending);
  };

  constructor(
    createWorker: () => BackgroundRemovalWorkerLike,
    options: {
      maxCacheBytes?: number;
      timeoutMs?: number;
      timer?: BackgroundRemovalTimer;
    } = {},
  ) {
    this.worker = createWorker();
    this.timer = options.timer ?? defaultTimer;
    this.timeoutMs = normalizeTimeout(options.timeoutMs);
    this.cache = new FrameLruCache(normalizeByteBudget(options.maxCacheBytes));
    this.worker.addEventListener('message', this.onMessage);
    this.worker.addEventListener('error', this.onWorkerFailure);
    this.worker.addEventListener('messageerror', this.onWorkerFailure);
  }

  render(input: BackgroundRemovalRenderInput): Promise<BackgroundRemovalOutcome> {
    if (this.disposed) {
      return Promise.resolve({ status: 'stale', inputFingerprint: input.inputFingerprint });
    }
    this.releaseSurface(input.surfaceId);
    const authority: SurfaceAuthority = {
      requestId: this.nextRequestId(),
      inputFingerprint: input.inputFingerprint,
    };
    this.surfaces.set(input.surfaceId, authority);
    const { pending, promise } = this.createPending(
      input.surfaceId,
      authority,
      input.frame.width,
      input.frame.height,
    );
    const cached = this.cache.get(input.inputFingerprint);
    if (cached) {
      queueMicrotask(() => this.ready(pending, cached, false));
      return promise;
    }
    try {
      pending.input = cloneInput(input);
    } catch {
      queueMicrotask(() => this.fail(pending));
      return promise;
    }
    this.dispatch(pending);
    return promise;
  }

  retry(surfaceId: string): Promise<BackgroundRemovalOutcome> {
    const current = this.surfaces.get(surfaceId);
    if (this.disposed || !current?.retryInput) {
      return Promise.resolve({
        status: 'stale',
        inputFingerprint: current?.inputFingerprint ?? '',
      });
    }
    const authority: SurfaceAuthority = {
      requestId: this.nextRequestId(),
      inputFingerprint: current.inputFingerprint,
    };
    this.surfaces.set(surfaceId, authority);
    const input = current.retryInput;
    const { pending, promise } = this.createPending(
      surfaceId,
      authority,
      input.frame.width,
      input.frame.height,
    );
    pending.input = input;
    this.dispatch(pending);
    return promise;
  }

  clearSurface(surfaceId: string): void {
    this.releaseSurface(surfaceId);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const pending of [...this.pending.values()]) {
      this.settle(pending, {
        status: 'stale',
        inputFingerprint: pending.inputFingerprint,
      });
    }
    this.pending.clear();
    this.surfaces.clear();
    this.cache.clear();
    this.worker.removeEventListener('message', this.onMessage);
    this.worker.removeEventListener('error', this.onWorkerFailure);
    this.worker.removeEventListener('messageerror', this.onWorkerFailure);
    this.worker.terminate();
  }

  private createPending(
    surfaceId: string,
    authority: SurfaceAuthority,
    width: number,
    height: number,
  ) {
    let resolve!: (outcome: BackgroundRemovalOutcome) => void;
    const promise = new Promise<BackgroundRemovalOutcome>((settle) => {
      resolve = settle;
    });
    const pending: PendingRender = {
      requestId: authority.requestId,
      surfaceId,
      inputFingerprint: authority.inputFingerprint,
      width,
      height,
      resolve,
      settled: false,
    };
    this.pending.set(pending.requestId, pending);
    return { pending, promise };
  }

  private dispatch(pending: PendingRender): void {
    const input = pending.input;
    if (!input) {
      queueMicrotask(() => this.fail(pending));
      return;
    }
    try {
      const pixels = new Uint8ClampedArray(input.frame.pixels);
      const request: BackgroundRemovalRequest = {
        requestId: pending.requestId,
        surfaceId: pending.surfaceId,
        inputFingerprint: pending.inputFingerprint,
        width: input.frame.width,
        height: input.frame.height,
        pixels: pixels.buffer,
        settings: structuredClone(input.settings),
        corrections: structuredClone(input.corrections),
      };
      this.worker.postMessage(request, [request.pixels]);
      pending.timeoutHandle = this.timer.setTimeout(
        () => this.fail(pending),
        this.timeoutMs,
      );
    } catch {
      queueMicrotask(() => this.fail(pending));
    }
  }

  private handleMessage(value: unknown): void {
    if (
      this.disposed ||
      !isRecord(value) ||
      !hasValidRequestId(value.requestId) ||
      typeof value.surfaceId !== 'string' ||
      typeof value.inputFingerprint !== 'string'
    ) return;
    const pending = this.pending.get(value.requestId);
    if (!pending) return;
    if (
      value.surfaceId !== pending.surfaceId ||
      value.inputFingerprint !== pending.inputFingerprint ||
      !this.isCurrent(pending)
    ) return;
    if (isFailureResponse(value)) {
      this.fail(pending);
      return;
    }
    if (!isValidSuccess(value, pending)) {
      this.fail(pending);
      return;
    }
    this.ready(pending, {
      width: value.width,
      height: value.height,
      pixels: new Uint8ClampedArray(value.pixels),
    }, true);
  }

  private ready(pending: PendingRender, frame: RgbaFrame, cache: boolean): void {
    if (!this.isCurrent(pending)) return;
    const authority = this.surfaces.get(pending.surfaceId);
    if (authority) delete authority.retryInput;
    if (cache) this.cache.set(pending.inputFingerprint, frame);
    this.settle(pending, {
      status: 'ready',
      inputFingerprint: pending.inputFingerprint,
      frame,
    });
  }

  private fail(pending: PendingRender): void {
    if (!this.isCurrent(pending)) return;
    const authority = this.surfaces.get(pending.surfaceId);
    if (authority && pending.input) authority.retryInput = pending.input;
    this.settle(pending, {
      status: 'failed',
      inputFingerprint: pending.inputFingerprint,
      message: FAILURE_MESSAGE,
    });
  }

  private releaseSurface(surfaceId: string): void {
    const authority = this.surfaces.get(surfaceId);
    if (!authority) return;
    const pending = this.pending.get(authority.requestId);
    if (pending) {
      this.settle(pending, {
        status: 'stale',
        inputFingerprint: pending.inputFingerprint,
      });
    }
    this.surfaces.delete(surfaceId);
  }

  private settle(pending: PendingRender, outcome: BackgroundRemovalOutcome): void {
    if (pending.settled) return;
    pending.settled = true;
    if (pending.timeoutHandle !== undefined) {
      this.timer.clearTimeout(pending.timeoutHandle);
      delete pending.timeoutHandle;
    }
    this.pending.delete(pending.requestId);
    pending.resolve(outcome);
  }

  private isCurrent(pending: PendingRender): boolean {
    const authority = this.surfaces.get(pending.surfaceId);
    return authority?.requestId === pending.requestId &&
      authority.inputFingerprint === pending.inputFingerprint;
  }

  private nextRequestId(): number {
    this.requestId = this.requestId === Number.MAX_SAFE_INTEGER ? 1 : this.requestId + 1;
    return this.requestId;
  }
}

export const createBrowserBackgroundRemovalWorker = (): BackgroundRemovalWorkerLike =>
  new Worker(
    new URL('./backgroundRemovalWorker.ts', import.meta.url),
    { type: 'module' },
  ) as unknown as BackgroundRemovalWorkerLike;
