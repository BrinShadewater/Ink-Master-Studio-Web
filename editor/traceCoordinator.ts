import type { RgbaFrame } from './backgroundRemovalProcessor';
import {
  recolorSafeTraceDocument,
  sanitizeTraceSvg,
} from './traceSanitizer';
import type { SafeTraceDocument, TraceSettings } from './traceModel';

const FAILURE = 'Vector trace failed.' as const;
const DEFAULT_TIMEOUT = 20_000;
const DEFAULT_CACHE_BYTES = 24 * 1024 * 1024;

export interface TraceRequest {
  requestId: number;
  layerId: string;
  traceFingerprint: string;
  width: number;
  height: number;
  pixels: ArrayBuffer;
  settings: TraceSettings;
}

export interface TraceInput {
  layerId: string;
  traceFingerprint: string;
  geometryFingerprint: string;
  frame: RgbaFrame;
  settings: TraceSettings;
}

export type TraceOutcome =
  | { status: 'ready'; traceFingerprint: string; document: SafeTraceDocument }
  | { status: 'failed'; traceFingerprint: string; message: typeof FAILURE }
  | { status: 'stale'; traceFingerprint: string };

type EventType = 'message' | 'error' | 'messageerror';
type Listener = (event: Event) => void;

export interface TraceWorkerLike {
  postMessage(message: TraceRequest, transfer: Transferable[]): void;
  addEventListener(type: EventType, listener: Listener): void;
  removeEventListener(type: EventType, listener: Listener): void;
  terminate(): void;
}

interface OwnedInput extends TraceInput {}
interface Pending {
  requestId: number;
  input: OwnedInput;
  resolve: (outcome: TraceOutcome) => void;
  timer?: ReturnType<typeof setTimeout>;
  settled: boolean;
}
interface Authority {
  requestId: number;
  traceFingerprint: string;
  retryInput?: OwnedInput;
}

const cloneDocument = (value: SafeTraceDocument) => structuredClone(value);
const cloneInput = (value: TraceInput): OwnedInput => ({
  ...value,
  frame: { ...value.frame, pixels: new Uint8ClampedArray(value.frame.pixels) },
  settings: structuredClone(value.settings),
});
const estimateDocumentBytes = (value: SafeTraceDocument) =>
  16 + value.paths.reduce((total, path) =>
    total + 48 + 2 * (
      path.d.length +
      path.fill.length +
      (path.stroke?.length ?? 0) +
      (path.transform?.length ?? 0)
    ), 0);

class GeometryCache {
  private entries = new Map<string, { document: SafeTraceDocument; bytes: number }>();
  private bytes = 0;
  constructor(private readonly maximum: number) {}
  get(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return cloneDocument(entry.document);
  }
  set(key: string, document: SafeTraceDocument) {
    const bytes = estimateDocumentBytes(document);
    if (bytes > this.maximum) return;
    const existing = this.entries.get(key);
    if (existing) this.bytes -= existing.bytes;
    this.entries.delete(key);
    this.entries.set(key, { document: cloneDocument(document), bytes });
    this.bytes += bytes;
    while (this.bytes > this.maximum) {
      const oldest = this.entries.entries().next().value as
        [string, { document: SafeTraceDocument; bytes: number }] | undefined;
      if (!oldest) break;
      this.entries.delete(oldest[0]);
      this.bytes -= oldest[1].bytes;
    }
  }
  clear() { this.entries.clear(); this.bytes = 0; }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export class TraceCoordinator {
  private worker: TraceWorkerLike;
  private cache: GeometryCache;
  private authorities = new Map<string, Authority>();
  private pending = new Map<number, Pending>();
  private requestId = 0;
  private disposed = false;
  private sanitize: (markup: string) => SafeTraceDocument;
  private timeoutMs: number;

  private onMessage: Listener = (event) => this.handle((event as MessageEvent).data);
  private onFailure: Listener = () => {
    for (const pending of [...this.pending.values()]) this.fail(pending);
  };

  constructor(
    createWorker: () => TraceWorkerLike,
    options: {
      sanitize?: (markup: string) => SafeTraceDocument;
      timeoutMs?: number;
      maxCacheBytes?: number;
    } = {},
  ) {
    this.worker = createWorker();
    this.sanitize = options.sanitize ?? ((markup) => sanitizeTraceSvg(markup));
    this.timeoutMs = Number.isFinite(options.timeoutMs)
      ? Math.max(0, Math.floor(options.timeoutMs!))
      : DEFAULT_TIMEOUT;
    this.cache = new GeometryCache(Number.isFinite(options.maxCacheBytes)
      ? Math.max(0, Math.floor(options.maxCacheBytes!))
      : DEFAULT_CACHE_BYTES);
    this.worker.addEventListener('message', this.onMessage);
    this.worker.addEventListener('error', this.onFailure);
    this.worker.addEventListener('messageerror', this.onFailure);
  }

  trace(value: TraceInput): Promise<TraceOutcome> {
    if (this.disposed) return Promise.resolve({ status: 'stale', traceFingerprint: value.traceFingerprint });
    this.clearLayer(value.layerId);
    const input = cloneInput(value);
    const requestId = this.nextId();
    this.authorities.set(value.layerId, { requestId, traceFingerprint: value.traceFingerprint });
    const { pending, promise } = this.createPending(requestId, input);
    const cached = this.cache.get(value.geometryFingerprint);
    if (cached) {
      queueMicrotask(() => this.ready(
        pending,
        recolorSafeTraceDocument(cached, value.settings.palette),
        false,
      ));
      return promise;
    }
    this.dispatch(pending);
    return promise;
  }

  retry(layerId: string): Promise<TraceOutcome> {
    const current = this.authorities.get(layerId);
    if (this.disposed || !current?.retryInput) {
      return Promise.resolve({ status: 'stale', traceFingerprint: current?.traceFingerprint ?? '' });
    }
    const requestId = this.nextId();
    const input = current.retryInput;
    this.authorities.set(layerId, { requestId, traceFingerprint: input.traceFingerprint });
    const { pending, promise } = this.createPending(requestId, input);
    this.dispatch(pending);
    return promise;
  }

  clearLayer(layerId: string) {
    const authority = this.authorities.get(layerId);
    if (!authority) return;
    const pending = this.pending.get(authority.requestId);
    if (pending) this.settle(pending, {
      status: 'stale',
      traceFingerprint: pending.input.traceFingerprint,
    });
    this.authorities.delete(layerId);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const pending of [...this.pending.values()]) this.settle(pending, {
      status: 'stale',
      traceFingerprint: pending.input.traceFingerprint,
    });
    this.authorities.clear();
    this.cache.clear();
    this.worker.removeEventListener('message', this.onMessage);
    this.worker.removeEventListener('error', this.onFailure);
    this.worker.removeEventListener('messageerror', this.onFailure);
    this.worker.terminate();
  }

  private createPending(requestId: number, input: OwnedInput) {
    let resolve!: (outcome: TraceOutcome) => void;
    const promise = new Promise<TraceOutcome>((next) => { resolve = next; });
    const pending: Pending = { requestId, input, resolve, settled: false };
    this.pending.set(requestId, pending);
    return { pending, promise };
  }

  private dispatch(pending: Pending) {
    try {
      const pixels = new Uint8ClampedArray(pending.input.frame.pixels);
      const request: TraceRequest = {
        requestId: pending.requestId,
        layerId: pending.input.layerId,
        traceFingerprint: pending.input.traceFingerprint,
        width: pending.input.frame.width,
        height: pending.input.frame.height,
        pixels: pixels.buffer,
        settings: structuredClone(pending.input.settings),
      };
      this.worker.postMessage(request, [request.pixels]);
      pending.timer = setTimeout(() => this.fail(pending), this.timeoutMs);
    } catch {
      queueMicrotask(() => this.fail(pending));
    }
  }

  private handle(value: unknown) {
    if (!isRecord(value) || !Number.isSafeInteger(value.requestId) ||
      typeof value.layerId !== 'string' || typeof value.traceFingerprint !== 'string') return;
    const pending = this.pending.get(Number(value.requestId));
    if (!pending || !this.current(pending) ||
      value.layerId !== pending.input.layerId ||
      value.traceFingerprint !== pending.input.traceFingerprint) return;
    if (value.message === FAILURE) return this.fail(pending);
    if (typeof value.rawSvg !== 'string' ||
      Object.keys(value).length !== 4) return this.fail(pending);
    try {
      const document = this.sanitize(value.rawSvg);
      this.ready(pending, document, true);
    } catch {
      this.fail(pending);
    }
  }

  private ready(pending: Pending, document: SafeTraceDocument, cache: boolean) {
    if (!this.current(pending)) return;
    if (cache) this.cache.set(pending.input.geometryFingerprint, document);
    const authority = this.authorities.get(pending.input.layerId);
    if (authority) delete authority.retryInput;
    const recolored = pending.input.settings.palette.length > 0
      ? recolorSafeTraceDocument(document, pending.input.settings.palette)
      : document;
    this.settle(pending, {
      status: 'ready',
      traceFingerprint: pending.input.traceFingerprint,
      document: recolored,
    });
  }

  private fail(pending: Pending) {
    if (!this.current(pending)) return;
    const authority = this.authorities.get(pending.input.layerId);
    if (authority) authority.retryInput = pending.input;
    this.settle(pending, {
      status: 'failed',
      traceFingerprint: pending.input.traceFingerprint,
      message: FAILURE,
    });
  }

  private settle(pending: Pending, outcome: TraceOutcome) {
    if (pending.settled) return;
    pending.settled = true;
    if (pending.timer) clearTimeout(pending.timer);
    this.pending.delete(pending.requestId);
    pending.resolve(outcome);
  }
  private current(pending: Pending) {
    const current = this.authorities.get(pending.input.layerId);
    return current?.requestId === pending.requestId &&
      current.traceFingerprint === pending.input.traceFingerprint;
  }
  private nextId() {
    this.requestId = this.requestId === Number.MAX_SAFE_INTEGER ? 1 : this.requestId + 1;
    return this.requestId;
  }
}

export const createBrowserTraceWorker = (): TraceWorkerLike =>
  new Worker(new URL('./traceWorker.ts', import.meta.url), { type: 'module' }) as unknown as TraceWorkerLike;
