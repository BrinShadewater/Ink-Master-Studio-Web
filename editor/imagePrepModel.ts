export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface CleanupStroke {
  mode: 'erase' | 'restore';
  size: number;
  points: NormalizedPoint[];
}

export interface CleanupCorrectionDocument {
  schemaVersion: 1;
  strokes: CleanupStroke[];
}

export interface BackgroundRemovalSettings {
  enabled: boolean;
  mode: 'auto' | 'picked';
  pickedColor: string | null;
  pickedPoint: NormalizedPoint | null;
  tolerance: number;
  edgeFeather: number;
  correctionAssetId: string | null;
  preparedAssetId: string | null;
  inputFingerprint: string;
}

const MAX_CORRECTION_STROKES = 2_000;
const MAX_STROKE_POINTS = 20_000;

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

const normalizeOptionalId = (value: unknown) =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

export const normalizeHexColor = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;
  const digits = match[1].toLowerCase();
  return digits.length === 3
    ? `#${digits.split('').map((digit) => `${digit}${digit}`).join('')}`
    : `#${digits}`;
};

const normalizePoint = (value: unknown): NormalizedPoint | null => {
  if (!isRecord(value) || !finiteNumber(value.x) || !finiteNumber(value.y)) return null;
  return {
    x: clamp(value.x, 0, 1),
    y: clamp(value.y, 0, 1),
  };
};

const samePoint = (left: NormalizedPoint, right: NormalizedPoint) =>
  left.x === right.x && left.y === right.y;

export const createDefaultBackgroundRemoval = (): BackgroundRemovalSettings => ({
  enabled: false,
  mode: 'auto',
  pickedColor: null,
  pickedPoint: null,
  tolerance: 24,
  edgeFeather: 1,
  correctionAssetId: null,
  preparedAssetId: null,
  inputFingerprint: '',
});

export const normalizeBackgroundRemoval = (value: unknown): BackgroundRemovalSettings => {
  const source = isRecord(value) ? value : {};
  const defaults = createDefaultBackgroundRemoval();
  return {
    enabled: Boolean(source.enabled),
    mode: source.mode === 'picked' ? 'picked' : 'auto',
    pickedColor: normalizeHexColor(source.pickedColor),
    pickedPoint: normalizePoint(source.pickedPoint),
    tolerance: normalizeInteger(source.tolerance, defaults.tolerance, 0, 100),
    edgeFeather: normalizeInteger(source.edgeFeather, defaults.edgeFeather, 0, 8),
    correctionAssetId: normalizeOptionalId(source.correctionAssetId),
    preparedAssetId: normalizeOptionalId(source.preparedAssetId),
    inputFingerprint: typeof source.inputFingerprint === 'string' ? source.inputFingerprint : '',
  };
};

export const normalizeCleanupCorrectionDocument = (
  value: unknown,
): CleanupCorrectionDocument => {
  const source = isRecord(value) ? value : {};
  const rawStrokes = source.schemaVersion === 1 && Array.isArray(source.strokes)
    ? source.strokes.slice(0, MAX_CORRECTION_STROKES)
    : [];
  const strokes: CleanupStroke[] = [];

  for (const rawStroke of rawStrokes) {
    if (!isRecord(rawStroke) || !Array.isArray(rawStroke.points)) continue;
    const points: NormalizedPoint[] = [];
    for (const rawPoint of rawStroke.points) {
      const point = normalizePoint(rawPoint);
      if (!point || (points.length > 0 && samePoint(points[points.length - 1], point))) continue;
      points.push(point);
      if (points.length === MAX_STROKE_POINTS) break;
    }
    if (points.length === 0) continue;
    strokes.push({
      mode: rawStroke.mode === 'restore' ? 'restore' : 'erase',
      size: normalizeInteger(rawStroke.size, 32, 8, 128),
      points,
    });
  }

  return { schemaVersion: 1, strokes };
};

export const serializeBackgroundRemovalInput = (value: unknown): string => {
  const normalized = normalizeBackgroundRemoval(value);
  return JSON.stringify({
    enabled: normalized.enabled,
    mode: normalized.mode,
    pickedColor: normalized.pickedColor,
    pickedPoint: normalized.pickedPoint,
    tolerance: normalized.tolerance,
    edgeFeather: normalized.edgeFeather,
    correctionAssetId: normalized.correctionAssetId,
  });
};

export interface ImagePrepFingerprintSource {
  assetId: string;
  crop: { x: number; y: number; width: number; height: number };
  adjustments: { brightness: number; contrast: number; saturation: number };
  backgroundRemoval: BackgroundRemovalSettings;
}

const hashString = (value: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

export const createImagePrepFingerprint = (
  source: ImagePrepFingerprintSource,
) => `prep:${hashString(JSON.stringify({
  assetId: source.assetId,
  crop: {
    x: source.crop.x,
    y: source.crop.y,
    width: source.crop.width,
    height: source.crop.height,
  },
  adjustments: {
    brightness: source.adjustments.brightness,
    contrast: source.adjustments.contrast,
    saturation: source.adjustments.saturation,
  },
  backgroundRemoval: serializeBackgroundRemovalInput(source.backgroundRemoval),
}))}`;
