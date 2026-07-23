import type { TraceRequest } from './traceCoordinator';
import { traceRgbaFrame } from './traceProcessor';
import { normalizeTraceSettings } from './traceModel';

const FAILURE = 'Vector trace failed.' as const;
interface Scope {
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  postMessage(message: Record<string, unknown>): void;
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const identity = (value: unknown) => {
  if (!isRecord(value) || !Number.isSafeInteger(value.requestId) ||
    Number(value.requestId) < 1 || typeof value.layerId !== 'string' ||
    !value.layerId || typeof value.traceFingerprint !== 'string' || !value.traceFingerprint) return null;
  return {
    requestId: Number(value.requestId),
    layerId: value.layerId,
    traceFingerprint: value.traceFingerprint,
  };
};
const parse = (value: unknown): TraceRequest | null => {
  const id = identity(value);
  if (!id || !isRecord(value) || Object.keys(value).length !== 7 ||
    !['requestId', 'layerId', 'traceFingerprint', 'width', 'height', 'pixels', 'settings']
      .every((key) => Object.hasOwn(value, key)) ||
    typeof value.width !== 'number' || typeof value.height !== 'number' ||
    !Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height) ||
    value.width < 1 || value.height < 1 || Math.max(value.width, value.height) > 1280 ||
    !(value.pixels instanceof ArrayBuffer) ||
    value.pixels.byteLength !== value.width * value.height * 4) return null;
  const settings = normalizeTraceSettings(value.settings);
  if (JSON.stringify(settings) !== JSON.stringify(value.settings)) return null;
  return { ...id, width: value.width, height: value.height, pixels: value.pixels, settings };
};

const scope = self as unknown as Scope;
scope.addEventListener('message', (event) => {
  const id = identity(event.data);
  if (!id) return;
  try {
    const request = parse(event.data);
    if (!request) throw new Error(FAILURE);
    const rawSvg = traceRgbaFrame({
      width: request.width,
      height: request.height,
      pixels: new Uint8ClampedArray(request.pixels),
    }, request.settings);
    scope.postMessage({ ...id, rawSvg });
  } catch {
    scope.postMessage({ ...id, message: FAILURE });
  }
});
