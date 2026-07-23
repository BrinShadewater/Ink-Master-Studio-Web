import { normalizeVariationLook, type VariationLook } from './lookModel';
import { applyVariationLook } from './lookProcessor';
import type { LookRenderRequest } from './lookRenderCoordinator';

const FAILURE_MESSAGE = 'Look preview failed.' as const;
const MAX_TYPED_ARRAY_LENGTH = 0xffffffff;

interface WorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  postMessage(message: Record<string, unknown>, transfer?: Transferable[]): void;
}

interface RequestIdentity {
  requestId: number;
  renderKey: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getIdentity = (value: unknown): RequestIdentity | undefined => {
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.requestId) ||
    Number(value.requestId) <= 0 ||
    typeof value.renderKey !== 'string' ||
    value.renderKey.length === 0
  ) {
    return undefined;
  }
  return { requestId: Number(value.requestId), renderKey: value.renderKey };
};

const isNormalizedLook = (value: unknown): value is VariationLook => {
  if (!isRecord(value)) return false;
  const normalized = normalizeVariationLook(value);
  const inputKeys = Object.keys(value);
  const normalizedKeys = Object.keys(normalized);
  return inputKeys.length === normalizedKeys.length && normalizedKeys.every((key) =>
    Object.hasOwn(value, key) && Object.is(value[key], normalized[key as keyof VariationLook]));
};

const isValidRequest = (value: unknown): value is LookRenderRequest => {
  if (!isRecord(value) || !getIdentity(value)) return false;
  const { width, height, pixels, look } = value;
  if (
    !Number.isInteger(width) || Number(width) <= 0 ||
    !Number.isInteger(height) || Number(height) <= 0 ||
    Number(width) > Math.floor(MAX_TYPED_ARRAY_LENGTH / 4 / Number(height)) ||
    !(pixels instanceof ArrayBuffer) ||
    pixels.byteLength !== Number(width) * Number(height) * 4 ||
    !isNormalizedLook(look)
  ) {
    return false;
  }
  const expectedKeys = ['requestId', 'renderKey', 'width', 'height', 'pixels', 'look'];
  return Object.keys(value).length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(value, key));
};

const scope = self as unknown as WorkerScope;

scope.addEventListener('message', (event) => {
  const identity = getIdentity(event.data);
  if (!identity) return;

  try {
    if (!isValidRequest(event.data)) throw new Error(FAILURE_MESSAGE);
    const result = applyVariationLook({
      width: event.data.width,
      height: event.data.height,
      pixels: new Uint8ClampedArray(event.data.pixels),
    }, event.data.look);
    const message = {
      requestId: identity.requestId,
      renderKey: identity.renderKey,
      width: result.width,
      height: result.height,
      pixels: result.pixels.buffer,
    };
    scope.postMessage(message, [message.pixels]);
  } catch {
    scope.postMessage({
      requestId: identity.requestId,
      renderKey: identity.renderKey,
      message: FAILURE_MESSAGE,
    });
  }
});
