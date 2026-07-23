import type { TShirtExportRenderMetadata } from './tshirtExportModel';
import {
  isTShirtExportWorkerMessage,
  type TShirtExportProgress,
  type TShirtExportStage,
  type TShirtExportWorkerMessage,
  type TShirtExportWorkerRequest,
  type TShirtPngExportSnapshot,
} from './tshirtExportProtocol';

const DEFAULT_TIMEOUT_MS = 90_000;
const CAPABILITY_FAILURE = 'This browser cannot create the print file.';

type WorkerEventType = 'message' | 'error' | 'messageerror';
type WorkerListener = (event: Event) => void;

export interface TShirtExportWorkerLike {
  postMessage(message: TShirtExportWorkerRequest, transfer: Transferable[]): void;
  addEventListener(type: WorkerEventType, listener: WorkerListener): void;
  removeEventListener(type: WorkerEventType, listener: WorkerListener): void;
  terminate(): void;
}

export type TShirtExportOutcome =
  | {
      status: 'ready';
      fingerprint: string;
      pngBytes: Uint8Array;
      metadata: TShirtExportRenderMetadata;
    }
  | { status: 'failed'; fingerprint: string; stage: TShirtExportStage; message: string }
  | { status: 'cancelled'; fingerprint: string }
  | { status: 'stale'; fingerprint: string };

interface PendingExport {
  snapshot: TShirtPngExportSnapshot;
  worker: TShirtExportWorkerLike;
  resolve: (outcome: TShirtExportOutcome) => void;
  onMessage: WorkerListener;
  onFailure: WorkerListener;
  timeoutHandle?: ReturnType<typeof setTimeout>;
  stage: TShirtExportStage;
  progress: number;
  settled: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeTimeout = (value: number | undefined): number =>
  value === undefined || !Number.isFinite(value)
    ? DEFAULT_TIMEOUT_MS
    : Math.max(0, Math.floor(value));

const stageLabel = (stage: TShirtExportStage): string => {
  switch (stage) {
    case 'preparing-artwork': return 'preparing artwork';
    case 'rendering-layers': return 'rendering layers';
    case 'encoding-png': return 'encoding PNG';
  }
};

const failureFor = (fingerprint: string, stage: TShirtExportStage): TShirtExportOutcome => ({
  status: 'failed',
  fingerprint,
  stage,
  message: `PNG generation failed while ${stageLabel(stage)}.`,
});

const cloneSnapshotForWorker = (snapshot: TShirtPngExportSnapshot): TShirtPngExportSnapshot => ({
  requestId: snapshot.requestId,
  fingerprint: snapshot.fingerprint,
  presetId: snapshot.presetId,
  variation: structuredClone(snapshot.variation),
  placement: structuredClone(snapshot.placement),
  assets: snapshot.assets.map((asset) => ({
    id: asset.id,
    name: asset.name,
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
    role: asset.role,
    bytes: asset.bytes.slice(0),
  })),
});

export class TShirtExportCoordinator {
  private readonly timeoutMs: number;
  private readonly onProgress?: (progress: TShirtExportProgress) => void;
  private active?: PendingExport;
  private disposed = false;

  constructor(
    private readonly createWorker: () => TShirtExportWorkerLike,
    options: { timeoutMs?: number; onProgress?: (progress: TShirtExportProgress) => void } = {},
  ) {
    this.timeoutMs = normalizeTimeout(options.timeoutMs);
    this.onProgress = options.onProgress;
  }

  render(snapshot: TShirtPngExportSnapshot): Promise<TShirtExportOutcome> {
    if (this.disposed) return Promise.resolve({ status: 'stale', fingerprint: snapshot.fingerprint });
    if (this.active) this.settle(this.active, { status: 'stale', fingerprint: this.active.snapshot.fingerprint });

    let request: TShirtExportWorkerRequest;
    try {
      request = { type: 'render', snapshot: cloneSnapshotForWorker(snapshot) };
    } catch {
      return Promise.resolve(failureFor(snapshot.fingerprint, 'preparing-artwork'));
    }

    let worker: TShirtExportWorkerLike;
    try {
      worker = this.createWorker();
    } catch {
      return Promise.resolve({
        status: 'failed',
        fingerprint: snapshot.fingerprint,
        stage: 'preparing-artwork',
        message: CAPABILITY_FAILURE,
      });
    }

    let resolve!: (outcome: TShirtExportOutcome) => void;
    const promise = new Promise<TShirtExportOutcome>((complete) => { resolve = complete; });
    const pending: PendingExport = {
      snapshot,
      worker,
      resolve,
      onMessage: () => undefined,
      onFailure: () => undefined,
      stage: 'preparing-artwork',
      progress: 0,
      settled: false,
    };
    pending.onMessage = (event) => this.handleMessage(pending, (event as MessageEvent<unknown>).data);
    pending.onFailure = () => this.fail(pending, pending.stage);
    this.active = pending;

    try {
      worker.addEventListener('message', pending.onMessage);
      worker.addEventListener('error', pending.onFailure);
      worker.addEventListener('messageerror', pending.onFailure);
      pending.timeoutHandle = setTimeout(() => this.fail(pending, pending.stage), this.timeoutMs);
      const transfer = request.snapshot.assets.map(({ bytes }) => bytes);
      worker.postMessage(request, transfer);
    } catch {
      this.fail(pending, pending.stage);
    }
    return promise;
  }

  cancel(): void {
    if (!this.active) return;
    this.settle(this.active, { status: 'cancelled', fingerprint: this.active.snapshot.fingerprint });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.active) this.settle(this.active, { status: 'stale', fingerprint: this.active.snapshot.fingerprint });
  }

  private handleMessage(pending: PendingExport, value: unknown): void {
    if (!this.isActive(pending)) return;
    if (!isTShirtExportWorkerMessage(value)) {
      if (this.matchesIdentity(value, pending)) this.fail(pending, pending.stage);
      return;
    }
    if (value.requestId !== pending.snapshot.requestId || value.fingerprint !== pending.snapshot.fingerprint) return;
    if (value.type === 'progress') {
      if (value.progress < pending.progress) return;
      pending.progress = value.progress;
      pending.stage = value.stage;
      this.onProgress?.({
        requestId: value.requestId,
        fingerprint: value.fingerprint,
        stage: value.stage,
        progress: value.progress,
      });
      return;
    }
    if (value.type === 'failed') {
      this.fail(pending, value.stage);
      return;
    }
    this.settle(pending, {
      status: 'ready',
      fingerprint: pending.snapshot.fingerprint,
      pngBytes: new Uint8Array(value.pngBytes.slice(0)),
      metadata: structuredClone(value.metadata),
    });
  }

  private matchesIdentity(value: unknown, pending: PendingExport): boolean {
    return isRecord(value) &&
      value.requestId === pending.snapshot.requestId &&
      value.fingerprint === pending.snapshot.fingerprint;
  }

  private fail(pending: PendingExport, stage: TShirtExportStage): void {
    if (!this.isActive(pending)) return;
    this.settle(pending, failureFor(pending.snapshot.fingerprint, stage));
  }

  private settle(pending: PendingExport, outcome: TShirtExportOutcome): void {
    if (pending.settled) return;
    pending.settled = true;
    if (pending.timeoutHandle !== undefined) clearTimeout(pending.timeoutHandle);
    pending.worker.removeEventListener('message', pending.onMessage);
    pending.worker.removeEventListener('error', pending.onFailure);
    pending.worker.removeEventListener('messageerror', pending.onFailure);
    pending.worker.terminate();
    if (this.active === pending) this.active = undefined;
    pending.resolve(outcome);
  }

  private isActive(pending: PendingExport): boolean {
    return !this.disposed && this.active === pending && !pending.settled;
  }
}

export const createBrowserTShirtExportWorker = (): TShirtExportWorkerLike =>
  new Worker(new URL('./tshirtExportWorker.ts', import.meta.url), {
    type: 'module',
    name: 'tshirt-png-export',
  }) as unknown as TShirtExportWorkerLike;
