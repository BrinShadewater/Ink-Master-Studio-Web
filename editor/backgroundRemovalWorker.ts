import { applyBackgroundRemoval } from './backgroundRemovalProcessor';
import type { BackgroundRemovalRequest } from './backgroundRemovalCoordinator';
import {
  normalizeBackgroundRemoval,
  normalizeCleanupCorrectionDocument,
  type BackgroundRemovalSettings,
  type CleanupCorrectionDocument,
} from './imagePrepModel';

const FAILURE_MESSAGE = 'Background removal failed.' as const;
const MAX_BACKGROUND_REMOVAL_EDGE = 2_048;

interface WorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  postMessage(message: Record<string, unknown>, transfer?: Transferable[]): void;
}

interface RequestIdentity {
  requestId: number;
  surfaceId: string;
  inputFingerprint: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactKeys = (value: Record<string, unknown>, expected: string[]) =>
  Object.keys(value).length === expected.length &&
  expected.every((key) => Object.hasOwn(value, key));

const deeplyEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length &&
      left.every((value, index) => deeplyEqual(value, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.hasOwn(right, key) && deeplyEqual(left[key], right[key]));
};

const getIdentity = (value: unknown): RequestIdentity | null => {
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.requestId) ||
    Number(value.requestId) <= 0 ||
    typeof value.surfaceId !== 'string' ||
    value.surfaceId.length === 0 ||
    typeof value.inputFingerprint !== 'string' ||
    value.inputFingerprint.length === 0
  ) return null;
  return {
    requestId: Number(value.requestId),
    surfaceId: value.surfaceId,
    inputFingerprint: value.inputFingerprint,
  };
};

const getNormalizedSettings = (value: unknown): BackgroundRemovalSettings | null => {
  const normalized = normalizeBackgroundRemoval(value);
  return deeplyEqual(value, normalized) ? normalized : null;
};

const getNormalizedCorrections = (value: unknown): CleanupCorrectionDocument | null => {
  const normalized = normalizeCleanupCorrectionDocument(value);
  return deeplyEqual(value, normalized) ? normalized : null;
};

const parseRequest = (value: unknown): BackgroundRemovalRequest | null => {
  if (!isRecord(value) || !getIdentity(value) || !hasExactKeys(value, [
    'requestId',
    'surfaceId',
    'inputFingerprint',
    'width',
    'height',
    'pixels',
    'settings',
    'corrections',
  ])) return null;
  if (typeof value.width !== 'number' || typeof value.height !== 'number') return null;
  const width = value.width;
  const height = value.height;
  const settings = getNormalizedSettings(value.settings);
  const corrections = getNormalizedCorrections(value.corrections);
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    Math.max(width, height) > MAX_BACKGROUND_REMOVAL_EDGE ||
    width > Math.floor(0xffffffff / 4 / height) ||
    !(value.pixels instanceof ArrayBuffer) ||
    value.pixels.byteLength !== width * height * 4 ||
    !settings ||
    !corrections
  ) return null;
  return {
    requestId: Number(value.requestId),
    surfaceId: String(value.surfaceId),
    inputFingerprint: String(value.inputFingerprint),
    width,
    height,
    pixels: value.pixels,
    settings,
    corrections,
  };
};

const scope = self as unknown as WorkerScope;

scope.addEventListener('message', (event) => {
  const identity = getIdentity(event.data);
  if (!identity) return;
  try {
    const request = parseRequest(event.data);
    if (!request) throw new Error(FAILURE_MESSAGE);
    const result = applyBackgroundRemoval({
      frame: {
        width: request.width,
        height: request.height,
        pixels: new Uint8ClampedArray(request.pixels),
      },
      settings: request.settings,
      corrections: request.corrections,
    });
    const message = {
      ...identity,
      width: result.width,
      height: result.height,
      pixels: result.pixels.buffer,
    };
    scope.postMessage(message, [message.pixels]);
  } catch {
    scope.postMessage({ ...identity, message: FAILURE_MESSAGE });
  }
});
