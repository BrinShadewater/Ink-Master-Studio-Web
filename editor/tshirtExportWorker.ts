import { getTShirtExportPreset } from './tshirtExportModel';
import type {
  TShirtExportStage,
  TShirtExportWorkerMessage,
  TShirtExportWorkerRequest,
  TShirtPngExportSnapshot,
} from './tshirtExportProtocol';
import { renderTShirtExport } from './tshirtExportRenderer';
import { writePngResolution } from './pngFile';

const FAILURE_BY_STAGE: Record<TShirtExportStage, string> = {
  'preparing-artwork': 'Could not prepare artwork for PNG export.',
  'rendering-layers': 'Could not render artwork for PNG export.',
  'encoding-png': 'Could not encode PNG export.',
};

export interface TShirtExportWorkerDependencies {
  render: typeof renderTShirtExport;
  writeResolution: typeof writePngResolution;
  getPreset: typeof getTShirtExportPreset;
}

type Post = (message: TShirtExportWorkerMessage, transfer?: Transferable[]) => void;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

const validIdentity = (value: Record<string, unknown>) =>
  Number.isSafeInteger(value.requestId) && Number(value.requestId) > 0 &&
  typeof value.fingerprint === 'string' && value.fingerprint.length > 0;

const isSnapshot = (value: unknown): value is TShirtPngExportSnapshot => {
  if (!isRecord(value) || !exactKeys(value, [
    'requestId', 'fingerprint', 'presetId', 'variation', 'placement', 'assets',
  ]) || !validIdentity(value) || typeof value.presetId !== 'string' ||
    !isRecord(value.variation) || !isRecord(value.placement) || !Array.isArray(value.assets)) {
    return false;
  }
  return value.assets.every((asset) => {
    if (!isRecord(asset) || !exactKeys(asset, [
      'id', 'name', 'mimeType', 'width', 'height', 'role', 'bytes',
    ])) return false;
    const { id, name, mimeType, width, height, role, bytes } = asset;
    return typeof id === 'string' && typeof name === 'string' && typeof mimeType === 'string' &&
      typeof width === 'number' && Number.isFinite(width) && width > 0 &&
      typeof height === 'number' && Number.isFinite(height) && height > 0 &&
      (role === null || role === 'prepared-image' || role === 'cleanup-corrections' || role === 'trace-svg') &&
      bytes instanceof ArrayBuffer && bytes.byteLength > 0;
  });
};

const getIdentity = (value: unknown) => {
  if (!isRecord(value) || !isRecord(value.snapshot) || !validIdentity(value.snapshot)) return null;
  return { requestId: Number(value.snapshot.requestId), fingerprint: value.snapshot.fingerprint as string };
};

const stage = (
  post: Post,
  snapshot: TShirtPngExportSnapshot,
  value: TShirtExportStage,
  progress: number,
) => post({ type: 'progress', requestId: snapshot.requestId, fingerprint: snapshot.fingerprint, stage: value, progress });

export const createTShirtExportWorkerHandler = (
  dependencies: TShirtExportWorkerDependencies,
) => async (value: unknown, post: Post): Promise<void> => {
  const identity = getIdentity(value);
  if (!isRecord(value) || !exactKeys(value, ['type', 'snapshot']) || value.type !== 'render' || !isSnapshot(value.snapshot)) {
    if (identity) post({
      type: 'failed', requestId: identity.requestId, fingerprint: identity.fingerprint,
      stage: 'preparing-artwork', message: FAILURE_BY_STAGE['preparing-artwork'],
    });
    return;
  }
  const snapshot = value.snapshot;
  let currentStage: TShirtExportStage = 'preparing-artwork';
  let frame: Awaited<ReturnType<typeof renderTShirtExport>> | null = null;
  try {
    dependencies.getPreset(snapshot.presetId);
    stage(post, snapshot, currentStage, 0.1);
    currentStage = 'rendering-layers';
    stage(post, snapshot, currentStage, 0.35);
    frame = await dependencies.render(snapshot);
    currentStage = 'encoding-png';
    stage(post, snapshot, currentStage, 0.85);
    const blob = await frame.canvas.convertToBlob({ type: 'image/png' });
    const encoded = new Uint8Array(await blob.arrayBuffer());
    const preset = dependencies.getPreset(snapshot.presetId);
    const resolved = dependencies.writeResolution(encoded, preset.pixelsPerMeter);
    const pngBytes = resolved.buffer.slice(resolved.byteOffset, resolved.byteOffset + resolved.byteLength);
    post({
      type: 'ready', requestId: snapshot.requestId, fingerprint: snapshot.fingerprint,
      pngBytes, metadata: frame.metadata,
    }, [pngBytes]);
  } catch {
    post({
      type: 'failed', requestId: snapshot.requestId, fingerprint: snapshot.fingerprint,
      stage: currentStage, message: FAILURE_BY_STAGE[currentStage],
    });
  } finally {
    if (frame) {
      frame.canvas.width = 1;
      frame.canvas.height = 1;
    }
  }
};

const scope = typeof self === 'undefined' ? null : self as unknown as {
  addEventListener: (type: 'message', listener: (event: MessageEvent<unknown>) => void) => void;
  postMessage: Post;
};

if (scope) {
  const handler = createTShirtExportWorkerHandler({
    render: renderTShirtExport,
    writeResolution: writePngResolution,
    getPreset: getTShirtExportPreset,
  });
  scope.addEventListener('message', (event) => { void handler(event.data, scope.postMessage); });
}
