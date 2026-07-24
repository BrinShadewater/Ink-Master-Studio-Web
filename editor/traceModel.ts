export interface TraceSettings {
  colors: number;
  detail: number;
  smoothing: number;
  blur: number;
  palette: string[];
}

export interface TraceSourceFrame {
  sourceWidth: number;
  sourceHeight: number;
  crop: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface SafeTracePath {
  d: string;
  fill: string;
  stroke: string | null;
  strokeWidth: number;
  opacity: number;
  transform: string | null;
}

export interface SafeTraceDocument {
  width: number;
  height: number;
  paths: SafeTracePath[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const finiteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

const normalizeInteger = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) => clamp(Math.round(finiteNumber(value) ? value : fallback), minimum, maximum);

const normalizeHexColor = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;
  const digits = match[1].toLowerCase();
  return digits.length === 3
    ? `#${digits.split('').map((digit) => `${digit}${digit}`).join('')}`
    : `#${digits}`;
};

export const createDefaultTraceSettings = (): TraceSettings => ({
  colors: 6,
  detail: 60,
  smoothing: 35,
  blur: 0,
  palette: [],
});

export const normalizeTraceSettings = (value: unknown): TraceSettings => {
  const source = isRecord(value) ? value : {};
  const defaults = createDefaultTraceSettings();
  const palette = Array.isArray(source.palette)
    ? source.palette
      .map(normalizeHexColor)
      .filter((color): color is string => color !== null)
      .slice(0, 32)
    : [];
  return {
    colors: normalizeInteger(source.colors, defaults.colors, 2, 32),
    detail: normalizeInteger(source.detail, defaults.detail, 0, 100),
    smoothing: normalizeInteger(source.smoothing, defaults.smoothing, 0, 100),
    blur: normalizeInteger(source.blur, defaults.blur, 0, 5),
    palette,
  };
};

export const serializeTraceInput = (value: unknown): string => {
  const normalized = normalizeTraceSettings(value);
  return JSON.stringify({
    colors: normalized.colors,
    detail: normalized.detail,
    smoothing: normalized.smoothing,
    blur: normalized.blur,
    palette: normalized.palette,
  });
};

const hashString = (value: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

export const createTraceFingerprint = (
  sourceFingerprint: string,
  settings: TraceSettings,
) => `trace:${hashString(`${sourceFingerprint}\u0000${serializeTraceInput(settings)}`)}`;
