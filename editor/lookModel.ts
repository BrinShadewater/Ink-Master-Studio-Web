export const LOOK_IDS = [
  'original', 'clean-photo', 'high-contrast', 'monochrome', 'duotone',
  'posterized', 'graphic-halftone', 'vintage-ink', 'distressed-print',
] as const;

export type LookId = typeof LOOK_IDS[number];

export type VariationLook =
  | { id: 'original'; strength: 100 }
  | { id: 'clean-photo'; strength: number; contrast: number; saturation: number; clarity: number }
  | { id: 'high-contrast'; strength: number; contrast: number; blackPoint: number; saturation: number }
  | { id: 'monochrome'; strength: number; contrast: number; brightness: number }
  | { id: 'duotone'; strength: number; shadowColor: string; highlightColor: string; balance: number }
  | { id: 'posterized'; strength: number; levels: number; contrast: number }
  | {
      id: 'graphic-halftone';
      strength: number;
      cellSize: number;
      angle: number;
      foregroundColor: string;
      background: 'transparent' | 'solid';
      backgroundColor: string;
    }
  | { id: 'vintage-ink'; strength: number; warmth: number; fade: number; grain: number; seed: number }
  | {
      id: 'distressed-print';
      strength: number;
      wear: number;
      textureScale: number;
      edgeBreakup: number;
      seed: number;
    };

export type LookById<T extends LookId> = Extract<VariationLook, { id: T }>;

type RecordValue = Record<string, unknown>;
type SeededVariationLook = LookById<'vintage-ink'> | LookById<'distressed-print'>;

let fallbackSeedCounter = 0;

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeInteger = (value: unknown, minimum: number, maximum: number, fallback: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
};

const normalizeColor = (value: unknown, fallback: string) => {
  if (typeof value !== 'string') return fallback;
  const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(value);
  if (!match) return fallback;
  const color = match[1].toLowerCase();
  return color.length === 3
    ? `#${color[0]}${color[0]}${color[1]}${color[1]}${color[2]}${color[2]}`
    : `#${color}`;
};

const normalizeSeed = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value >>> 0 : 0;

export const createDefaultLook = <T extends LookId>(id: T, seed = 0): LookById<T> => {
  switch (id) {
    case 'original': return { id, strength: 100 } as LookById<T>;
    case 'clean-photo': return { id, strength: 100, contrast: 10, saturation: 8, clarity: 8 } as LookById<T>;
    case 'high-contrast': return { id, strength: 100, contrast: 55, blackPoint: 12, saturation: 5 } as LookById<T>;
    case 'monochrome': return { id, strength: 100, contrast: 20, brightness: 0 } as LookById<T>;
    case 'duotone': return {
      id, strength: 100, shadowColor: '#111827', highlightColor: '#f59e0b', balance: 0,
    } as LookById<T>;
    case 'posterized': return { id, strength: 100, levels: 4, contrast: 20 } as LookById<T>;
    case 'graphic-halftone': return {
      id, strength: 100, cellSize: 10, angle: 45, foregroundColor: '#111111',
      background: 'transparent', backgroundColor: '#f5f5f3',
    } as LookById<T>;
    case 'vintage-ink': return {
      id, strength: 100, warmth: 45, fade: 25, grain: 20, seed: seed >>> 0,
    } as LookById<T>;
    case 'distressed-print': return {
      id, strength: 100, wear: 35, textureScale: 5, edgeBreakup: 25, seed: seed >>> 0,
    } as LookById<T>;
  }
};

export const normalizeVariationLook = (value: unknown): VariationLook => {
  if (!isRecord(value) || !LOOK_IDS.includes(value.id as LookId)) return createDefaultLook('original');
  switch (value.id) {
    case 'original': return createDefaultLook('original');
    case 'clean-photo': return {
      id: value.id,
      strength: normalizeInteger(value.strength, 0, 100, 100),
      contrast: normalizeInteger(value.contrast, 0, 40, 10),
      saturation: normalizeInteger(value.saturation, -20, 40, 8),
      clarity: normalizeInteger(value.clarity, 0, 30, 8),
    };
    case 'high-contrast': return {
      id: value.id,
      strength: normalizeInteger(value.strength, 0, 100, 100),
      contrast: normalizeInteger(value.contrast, 0, 100, 55),
      blackPoint: normalizeInteger(value.blackPoint, 0, 40, 12),
      saturation: normalizeInteger(value.saturation, -100, 50, 5),
    };
    case 'monochrome': return {
      id: value.id,
      strength: normalizeInteger(value.strength, 0, 100, 100),
      contrast: normalizeInteger(value.contrast, -50, 100, 20),
      brightness: normalizeInteger(value.brightness, -50, 50, 0),
    };
    case 'duotone': return {
      id: value.id,
      strength: normalizeInteger(value.strength, 0, 100, 100),
      shadowColor: normalizeColor(value.shadowColor, '#111827'),
      highlightColor: normalizeColor(value.highlightColor, '#f59e0b'),
      balance: normalizeInteger(value.balance, -50, 50, 0),
    };
    case 'posterized': return {
      id: value.id,
      strength: normalizeInteger(value.strength, 0, 100, 100),
      levels: normalizeInteger(value.levels, 2, 8, 4),
      contrast: normalizeInteger(value.contrast, 0, 100, 20),
    };
    case 'graphic-halftone': return {
      id: value.id,
      strength: normalizeInteger(value.strength, 0, 100, 100),
      cellSize: normalizeInteger(value.cellSize, 4, 32, 10),
      angle: normalizeInteger(value.angle, 0, 180, 45),
      foregroundColor: normalizeColor(value.foregroundColor, '#111111'),
      background: value.background === 'solid' ? 'solid' : 'transparent',
      backgroundColor: normalizeColor(value.backgroundColor, '#f5f5f3'),
    };
    case 'vintage-ink': return {
      id: value.id,
      strength: normalizeInteger(value.strength, 0, 100, 100),
      warmth: normalizeInteger(value.warmth, 0, 100, 45),
      fade: normalizeInteger(value.fade, 0, 100, 25),
      grain: normalizeInteger(value.grain, 0, 100, 20),
      seed: normalizeSeed(value.seed),
    };
    case 'distressed-print': return {
      id: value.id,
      strength: normalizeInteger(value.strength, 0, 100, 100),
      wear: normalizeInteger(value.wear, 0, 100, 35),
      textureScale: normalizeInteger(value.textureScale, 1, 12, 5),
      edgeBreakup: normalizeInteger(value.edgeBreakup, 0, 100, 25),
      seed: normalizeSeed(value.seed),
    };
  }
};

export const serializeVariationLook = (value: unknown) => JSON.stringify(normalizeVariationLook(value));

export const createLookSeed = (getRandomUint32?: () => number) => {
  if (getRandomUint32) return getRandomUint32() >>> 0;
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  const now = Date.now();
  const performanceNow = typeof performance === 'undefined' ? 0 : performance.now();
  fallbackSeedCounter += 1;
  return (now ^ Math.floor(performanceNow) ^ fallbackSeedCounter) >>> 0;
};

export const isSeededLook = (look: VariationLook): look is SeededVariationLook =>
  look.id === 'vintage-ink' || look.id === 'distressed-print';

export const replaceLookSeed = <T extends VariationLook>(look: T, seed: number): T => {
  if (!isSeededLook(look)) return look;
  return { ...look, seed: seed >>> 0 } as T;
};
