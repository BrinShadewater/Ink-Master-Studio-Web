import type { EditorAsset, DesignVariation } from './model';
import type { ProductPlacement } from './productModel';
import type {
  TShirtExportPresetId,
  TShirtExportRenderMetadata,
} from './tshirtExportModel';

export type TShirtExportStage =
  | 'preparing-artwork'
  | 'rendering-layers'
  | 'encoding-png';

export interface TShirtExportProgress {
  requestId: number;
  fingerprint: string;
  stage: TShirtExportStage;
  progress: number;
}

export interface TShirtExportAssetSnapshot {
  id: string;
  name: string;
  mimeType: string;
  width: number;
  height: number;
  role: EditorAsset['role'] | null;
  bytes: ArrayBuffer;
}

export interface TShirtPngExportSnapshot {
  requestId: number;
  fingerprint: string;
  presetId: TShirtExportPresetId;
  variation: DesignVariation;
  placement: ProductPlacement;
  assets: TShirtExportAssetSnapshot[];
}

export interface TShirtExportWorkerRequest {
  type: 'render';
  snapshot: TShirtPngExportSnapshot;
}

export type TShirtExportWorkerMessage =
  | {
      type: 'progress';
      requestId: number;
      fingerprint: string;
      stage: TShirtExportStage;
      progress: number;
    }
  | {
      type: 'ready';
      requestId: number;
      fingerprint: string;
      pngBytes: ArrayBuffer;
      metadata: TShirtExportRenderMetadata;
    }
  | {
      type: 'failed';
      requestId: number;
      fingerprint: string;
      stage: TShirtExportStage;
      message: string;
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

const isRequestId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

export const isTShirtExportStage = (value: unknown): value is TShirtExportStage =>
  value === 'preparing-artwork' || value === 'rendering-layers' || value === 'encoding-png';

const isIdentity = (value: Record<string, unknown>) =>
  isRequestId(value.requestId) && typeof value.fingerprint === 'string' && value.fingerprint.length > 0;

const isMetadata = (value: unknown): value is TShirtExportRenderMetadata => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'alpha', 'largestRasterScale', 'largestRasterLayerName', 'pixelDigest',
  ])) return false;
  if (!isRecord(value.alpha) || !hasExactKeys(value.alpha, [
    'transparentPixels', 'translucentPixels', 'opaquePixels',
  ])) return false;
  const counts = [
    value.alpha.transparentPixels,
    value.alpha.translucentPixels,
    value.alpha.opaquePixels,
  ];
  return counts.every((count) => typeof count === 'number' && Number.isFinite(count) && count >= 0) &&
    typeof value.largestRasterScale === 'number' &&
    Number.isFinite(value.largestRasterScale) &&
    value.largestRasterScale >= 0 &&
    (typeof value.largestRasterLayerName === 'string' || value.largestRasterLayerName === null) &&
    typeof value.pixelDigest === 'string';
};

export const isTShirtExportWorkerMessage = (
  value: unknown,
): value is TShirtExportWorkerMessage => {
  if (!isRecord(value) || !isIdentity(value) || typeof value.type !== 'string') return false;
  if (value.type === 'progress') {
    return hasExactKeys(value, ['type', 'requestId', 'fingerprint', 'stage', 'progress']) &&
      isTShirtExportStage(value.stage) &&
      typeof value.progress === 'number' && Number.isFinite(value.progress) &&
      value.progress >= 0 && value.progress <= 1;
  }
  if (value.type === 'ready') {
    return hasExactKeys(value, ['type', 'requestId', 'fingerprint', 'pngBytes', 'metadata']) &&
      value.pngBytes instanceof ArrayBuffer && value.pngBytes.byteLength > 0 &&
      isMetadata(value.metadata);
  }
  if (value.type === 'failed') {
    return hasExactKeys(value, ['type', 'requestId', 'fingerprint', 'stage', 'message']) &&
      isTShirtExportStage(value.stage) && typeof value.message === 'string';
  }
  return false;
};
