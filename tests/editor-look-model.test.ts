import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LOOK_IDS,
  createDefaultLook,
  createLookSeed,
  isSeededLook,
  normalizeVariationLook,
  replaceLookSeed,
  serializeVariationLook,
} from '../editor/lookModel';

const defaultLooks = {
  original: { id: 'original', strength: 100 },
  'clean-photo': { id: 'clean-photo', strength: 100, contrast: 10, saturation: 8, clarity: 8 },
  'high-contrast': { id: 'high-contrast', strength: 100, contrast: 55, blackPoint: 12, saturation: 5 },
  monochrome: { id: 'monochrome', strength: 100, contrast: 20, brightness: 0 },
  duotone: { id: 'duotone', strength: 100, shadowColor: '#111827', highlightColor: '#f59e0b', balance: 0 },
  posterized: { id: 'posterized', strength: 100, levels: 4, contrast: 20 },
  'graphic-halftone': {
    id: 'graphic-halftone', strength: 100, cellSize: 10, angle: 45, foregroundColor: '#111111',
    background: 'transparent', backgroundColor: '#f5f5f3',
  },
  'vintage-ink': { id: 'vintage-ink', strength: 100, warmth: 45, fade: 25, grain: 20, seed: 0 },
  'distressed-print': {
    id: 'distressed-print', strength: 100, wear: 35, textureScale: 5, edgeBreakup: 25, seed: 0,
  },
} as const;

test('creates every documented Look default', () => {
  assert.deepEqual(LOOK_IDS, [
    'original', 'clean-photo', 'high-contrast', 'monochrome', 'duotone',
    'posterized', 'graphic-halftone', 'vintage-ink', 'distressed-print',
  ]);
  for (const id of LOOK_IDS) assert.deepEqual(createDefaultLook(id), defaultLooks[id]);
  assert.deepEqual(createDefaultLook('vintage-ink', -1), {
    ...defaultLooks['vintage-ink'], seed: 4294967295,
  });
  assert.deepEqual(createDefaultLook('distressed-print', 7), {
    ...defaultLooks['distressed-print'], seed: 7,
  });
});

test('normalizes every Look to its documented contract', () => {
  assert.deepEqual(normalizeVariationLook({
    id: 'duotone', strength: 140.7, shadowColor: '#ABC',
    highlightColor: 'not-a-color', balance: -80,
  }), {
    id: 'duotone', strength: 100, shadowColor: '#aabbcc',
    highlightColor: '#f59e0b', balance: -50,
  });
  assert.deepEqual(normalizeVariationLook({
    id: 'distressed-print', strength: -1, wear: 101, textureScale: 0,
    edgeBreakup: Number.NaN, seed: -1,
  }), {
    id: 'distressed-print', strength: 0, wear: 100, textureScale: 1,
    edgeBreakup: 25, seed: 4294967295,
  });
  assert.deepEqual(normalizeVariationLook({
    id: 'clean-photo', strength: 19.6, contrast: 9.5, saturation: -2.5, clarity: 8.4,
  }), {
    id: 'clean-photo', strength: 20, contrast: 10, saturation: -2, clarity: 8,
  });
  assert.deepEqual(normalizeVariationLook({
    id: 'graphic-halftone', foregroundColor: '#AbC', background: 'solid', backgroundColor: '#A0B1C2',
  }), {
    ...defaultLooks['graphic-halftone'], foregroundColor: '#aabbcc', background: 'solid', backgroundColor: '#a0b1c2',
  });
  assert.deepEqual(normalizeVariationLook({ id: 'graphic-halftone', background: 'pattern' }), defaultLooks['graphic-halftone']);
  assert.deepEqual(normalizeVariationLook({ id: 'missing', strength: 0 }), defaultLooks.original);
  assert.deepEqual(normalizeVariationLook(null), defaultLooks.original);
});

test('normalizes every documented numeric parameter boundary', () => {
  const cases = [
    { id: 'clean-photo', bounds: [['strength', 0, 100], ['contrast', 0, 40], ['saturation', -20, 40], ['clarity', 0, 30]] },
    { id: 'high-contrast', bounds: [['strength', 0, 100], ['contrast', 0, 100], ['blackPoint', 0, 40], ['saturation', -100, 50]] },
    { id: 'monochrome', bounds: [['strength', 0, 100], ['contrast', -50, 100], ['brightness', -50, 50]] },
    { id: 'duotone', bounds: [['strength', 0, 100], ['balance', -50, 50]] },
    { id: 'posterized', bounds: [['strength', 0, 100], ['levels', 2, 8], ['contrast', 0, 100]] },
    { id: 'graphic-halftone', bounds: [['strength', 0, 100], ['cellSize', 4, 32], ['angle', 0, 180]] },
    { id: 'vintage-ink', bounds: [['strength', 0, 100], ['warmth', 0, 100], ['fade', 0, 100], ['grain', 0, 100]] },
    { id: 'distressed-print', bounds: [['strength', 0, 100], ['wear', 0, 100], ['textureScale', 1, 12], ['edgeBreakup', 0, 100]] },
  ] as const;

  for (const { id, bounds } of cases) {
    for (const [parameter, minimum, maximum] of bounds) {
      assert.deepEqual(normalizeVariationLook({ id, [parameter]: minimum }), {
        ...defaultLooks[id], [parameter]: minimum,
      }, `${id} ${parameter} accepts its lower boundary`);
      assert.deepEqual(normalizeVariationLook({ id, [parameter]: maximum }), {
        ...defaultLooks[id], [parameter]: maximum,
      }, `${id} ${parameter} accepts its upper boundary`);
    }
  }
});

test('uses documented defaults for invalid values without mutating callers', () => {
  const input = {
    id: 'high-contrast', strength: Number.POSITIVE_INFINITY, contrast: Number.NaN,
    blackPoint: 'invalid', saturation: null,
  };
  const snapshot = structuredClone(input);
  assert.deepEqual(normalizeVariationLook(input), defaultLooks['high-contrast']);
  assert.deepEqual(input, snapshot);
});

test('serializes normalized recipes stably and replaces only seeded values', () => {
  const vintage = createDefaultLook('vintage-ink', 7);
  assert.equal(isSeededLook(vintage), true);
  assert.equal(isSeededLook(createDefaultLook('monochrome')), false);
  assert.deepEqual(replaceLookSeed(vintage, 9), { ...vintage, seed: 9 });
  assert.equal(serializeVariationLook(vintage), serializeVariationLook(structuredClone(vintage)));
  assert.equal(
    serializeVariationLook({ id: 'high-contrast', saturation: 5, blackPoint: 12, contrast: 55, strength: 100 }),
    '{"id":"high-contrast","strength":100,"contrast":55,"blackPoint":12,"saturation":5}',
  );
  assert.deepEqual(replaceLookSeed(createDefaultLook('monochrome'), 9), createDefaultLook('monochrome'));
});

test('normalizes injected Look seeds to unsigned 32-bit values', () => {
  assert.equal(createLookSeed(() => -1), 4294967295);
  assert.equal(createLookSeed(() => 9), 9);
});
