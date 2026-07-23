import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyVariationLook,
  blendLookStrength,
  canonicalTextureValue,
  type RgbaFrame,
} from '../editor/lookProcessor';
import { createDefaultLook, type VariationLook } from '../editor/lookModel';

const frame: RgbaFrame = {
  width: 4,
  height: 4,
  pixels: new Uint8ClampedArray([
    0, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 255, 0, 255, 0, 255,
    0, 0, 255, 255, 255, 255, 0, 255, 0, 255, 255, 255, 255, 0, 255, 255,
    128, 128, 128, 255, 96, 144, 192, 255, 200, 120, 40, 255, 20, 180, 90, 128,
    240, 120, 20, 0, 32, 48, 64, 255, 220, 200, 180, 255, 70, 30, 150, 64,
  ]),
};

const defaultExpectedPixels = {
  'clean-photo': [
    0, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 255, 0, 255, 0, 255,
    0, 0, 255, 255, 255, 255, 0, 255, 0, 255, 255, 255, 255, 0, 255, 255,
    138, 136, 123, 255, 82, 148, 220, 255, 230, 111, 6, 255, 0, 206, 65, 128,
    0, 0, 0, 0, 4, 23, 44, 255, 248, 224, 200, 255, 49, 1, 170, 64,
  ],
  'high-contrast': [
    0, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 255, 0, 255, 0, 255,
    0, 0, 255, 255, 255, 255, 0, 255, 0, 255, 255, 255, 255, 0, 255, 255,
    116, 116, 116, 255, 40, 153, 255, 255, 255, 96, 0, 255, 0, 232, 25, 128,
    0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 228, 255, 0, 0, 172, 64,
  ],
  monochrome: [
    0, 0, 0, 255, 255, 255, 255, 255, 39, 39, 39, 255, 193, 193, 193, 255,
    0, 0, 0, 255, 255, 255, 255, 255, 216, 216, 216, 255, 62, 62, 62, 255,
    128, 128, 128, 255, 139, 139, 139, 255, 132, 132, 132, 255, 141, 141, 141, 128,
    0, 0, 0, 0, 30, 30, 30, 255, 218, 218, 218, 255, 31, 31, 31, 64,
  ],
  duotone: [
    17, 24, 39, 255, 245, 158, 11, 255, 65, 52, 33, 255, 180, 120, 19, 255,
    33, 33, 37, 255, 229, 149, 13, 255, 197, 130, 17, 255, 82, 62, 31, 255,
    131, 91, 25, 255, 139, 96, 24, 255, 134, 93, 25, 255, 141, 97, 24, 128,
    0, 0, 0, 0, 58, 48, 34, 255, 199, 131, 17, 255, 59, 49, 34, 64,
  ],
  posterized: [
    0, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 255, 0, 255, 0, 255,
    0, 0, 255, 255, 255, 255, 0, 255, 0, 255, 255, 255, 255, 0, 255, 255,
    170, 170, 170, 255, 85, 170, 170, 255, 255, 85, 0, 255, 0, 170, 85, 128,
    0, 0, 0, 0, 0, 0, 85, 255, 255, 255, 170, 255, 85, 0, 170, 64,
  ],
  'graphic-halftone': [
    17, 17, 17, 255, 0, 0, 0, 0, 17, 17, 17, 255, 0, 0, 0, 0,
    17, 17, 17, 255, 0, 0, 0, 0, 0, 0, 0, 0, 17, 17, 17, 255,
    17, 17, 17, 255, 0, 0, 0, 0, 0, 0, 0, 0, 17, 17, 17, 128,
    0, 0, 0, 0, 17, 17, 17, 255, 17, 17, 17, 255, 0, 0, 0, 0,
  ],
  'vintage-ink': [
    21, 18, 17, 255, 244, 236, 219, 255, 175, 37, 34, 255, 89, 215, 69, 255,
    37, 33, 164, 255, 237, 229, 80, 255, 95, 221, 207, 255, 180, 42, 169, 255,
    137, 131, 123, 255, 127, 146, 161, 255, 177, 130, 78, 255, 86, 164, 107, 128,
    0, 0, 0, 0, 58, 62, 67, 255, 203, 186, 161, 255, 73, 48, 106, 64,
  ],
  'distressed-print': [
    0, 0, 0, 160, 255, 255, 255, 174, 255, 0, 0, 205, 0, 255, 0, 153,
    0, 0, 255, 179, 255, 255, 0, 204, 0, 255, 255, 153, 255, 0, 255, 161,
    128, 128, 128, 210, 96, 144, 192, 163, 200, 120, 40, 188, 20, 180, 90, 84,
    0, 0, 0, 0, 32, 48, 64, 154, 220, 200, 180, 185, 70, 30, 150, 34,
  ],
} as const;

const processedLookIds = [
  'clean-photo', 'high-contrast', 'monochrome', 'duotone',
  'posterized', 'graphic-halftone', 'vintage-ink', 'distressed-print',
] as const;

test('Original returns byte-identical isolated output', () => {
  const output = applyVariationLook(frame, createDefaultLook('original'));
  assert.deepEqual([...output.pixels], [...frame.pixels]);
  assert.notEqual(output.pixels.buffer, frame.pixels.buffer);
  assert.deepEqual({ width: output.width, height: output.height }, { width: 4, height: 4 });
});

test('all eight processed defaults match reviewed byte fixtures', () => {
  for (const id of processedLookIds) {
    const output = applyVariationLook(frame, createDefaultLook(id, 0));
    assert.deepEqual([...output.pixels], defaultExpectedPixels[id], id);
    assert.notEqual(output.pixels.buffer, frame.pixels.buffer, `${id} output is isolated`);
  }
});

test('Monochrome uses fixed Rec. 709 luminance', () => {
  const onePixel = {
    width: 1,
    height: 1,
    pixels: new Uint8ClampedArray([255, 0, 0, 255]),
  };
  const output = applyVariationLook(onePixel, { ...createDefaultLook('monochrome'), contrast: 0 });
  assert.deepEqual([...output.pixels], [54, 54, 54, 255]);
});

test('Strength 0, 50, and 100 use premultiplied-alpha interpolation', () => {
  const original = new Uint8ClampedArray([255, 0, 0, 128]);
  const processed = new Uint8ClampedArray([0, 0, 255, 255]);
  assert.deepEqual([...blendLookStrength(original, processed, 0)], [255, 0, 0, 128]);
  assert.deepEqual([...blendLookStrength(original, processed, 50)], [85, 0, 170, 192]);
  assert.deepEqual([...blendLookStrength(original, processed, 100)], [0, 0, 255, 255]);
});

test('Strength 0 is byte-identical even when transparent pixels retain hidden RGB', () => {
  const original = new Uint8ClampedArray([240, 120, 20, 0]);
  const processed = new Uint8ClampedArray([10, 20, 30, 0]);
  assert.deepEqual([...blendLookStrength(original, processed, 0)], [240, 120, 20, 0]);
  assert.deepEqual([...blendLookStrength(original, processed, 50)], [0, 0, 0, 0]);
  assert.deepEqual([...blendLookStrength(original, processed, 100)], [0, 0, 0, 0]);
});

test('every processed Look at Strength 0 returns the exact input bytes', () => {
  for (const id of processedLookIds) {
    const look = { ...createDefaultLook(id, 0), strength: 0 } as VariationLook;
    assert.deepEqual([...applyVariationLook(frame, look).pixels], [...frame.pixels], id);
  }
});

test('Graphic Halftone has explicit transparent and solid alpha semantics', () => {
  const smallFrame = {
    width: 2,
    height: 2,
    pixels: new Uint8ClampedArray([
      0, 0, 0, 255, 255, 255, 255, 255,
      240, 120, 20, 0, 20, 180, 90, 128,
    ]),
  };
  const base = {
    ...createDefaultLook('graphic-halftone'),
    angle: 0,
    cellSize: 32,
    foregroundColor: '#102030',
    backgroundColor: '#e0d0c0',
  };

  assert.deepEqual(
    [...applyVariationLook(smallFrame, { ...base, background: 'transparent' }).pixels],
    [16, 32, 48, 255, 0, 0, 0, 0, 0, 0, 0, 0, 16, 32, 48, 128],
  );
  assert.deepEqual(
    [...applyVariationLook(smallFrame, { ...base, background: 'solid' }).pixels],
    [16, 32, 48, 255, 224, 208, 192, 255, 224, 208, 192, 255, 16, 32, 48, 255],
  );
});

test('seeded Looks repeat for duplicate seeds and change for different seeds', () => {
  for (const id of ['vintage-ink', 'distressed-print'] as const) {
    const first = applyVariationLook(frame, createDefaultLook(id, 0x12345678));
    const duplicate = applyVariationLook(frame, createDefaultLook(id, 0x12345678));
    const rerolled = applyVariationLook(frame, createDefaultLook(id, 0x12345679));
    assert.deepEqual([...duplicate.pixels], [...first.pixels], `${id} duplicate seed`);
    assert.notDeepEqual([...rerolled.pixels], [...first.pixels], `${id} different seed`);
  }
});

test('canonical texture samples stay anchored at 8-by-8 and 16-by-16', () => {
  const seed = 0x12345678;
  const samples8 = [[0, 0], [3, 5], [7, 7]].map(([x, y]) =>
    Number(canonicalTextureValue(x, y, 8, 8, seed, 8).toFixed(12)));
  const samples16 = [[0, 0], [6, 10], [15, 15]].map(([x, y]) =>
    Number(canonicalTextureValue(x, y, 16, 16, seed, 8).toFixed(12)));
  const expected = [0.350031324977, 0.698205781332, 0.360296674157];
  assert.deepEqual(samples8, expected);
  assert.deepEqual(samples16, expected);
});

test('Distressed Print never creates coverage outside the source', () => {
  const output = applyVariationLook(frame, createDefaultLook('distressed-print', 8));
  for (let index = 3; index < frame.pixels.length; index += 4) {
    if (frame.pixels[index] === 0) assert.equal(output.pixels[index], 0);
  }
});

test('every normalized Look parameter is observably effective', () => {
  const parameterFrame = createParameterFrame();
  const assertChanged = (base: VariationLook, changed: VariationLook, parameter: string) => {
    const before = applyVariationLook(parameterFrame, base).pixels;
    const after = applyVariationLook(parameterFrame, changed).pixels;
    assert.notDeepEqual([...after], [...before], `${changed.id} ${parameter}`);
  };

  const clean = createDefaultLook('clean-photo');
  assertChanged(clean, { ...clean, contrast: 0 }, 'contrast');
  assertChanged(clean, { ...clean, saturation: -20 }, 'saturation');
  assertChanged(clean, { ...clean, clarity: 30 }, 'clarity');

  const high = createDefaultLook('high-contrast');
  assertChanged(high, { ...high, contrast: 0 }, 'contrast');
  assertChanged(high, { ...high, blackPoint: 40 }, 'blackPoint');
  assertChanged(high, { ...high, saturation: -100 }, 'saturation');

  const monochrome = createDefaultLook('monochrome');
  assertChanged(monochrome, { ...monochrome, contrast: -50 }, 'contrast');
  assertChanged(monochrome, { ...monochrome, brightness: 50 }, 'brightness');

  const duotone = createDefaultLook('duotone');
  assertChanged(duotone, { ...duotone, shadowColor: '#ff0000' }, 'shadowColor');
  assertChanged(duotone, { ...duotone, highlightColor: '#00ff00' }, 'highlightColor');
  assertChanged(duotone, { ...duotone, balance: 50 }, 'balance');

  const posterized = createDefaultLook('posterized');
  assertChanged(posterized, { ...posterized, levels: 8 }, 'levels');
  assertChanged(posterized, { ...posterized, contrast: 100 }, 'contrast');

  const halftone = createDefaultLook('graphic-halftone');
  assertChanged(halftone, { ...halftone, cellSize: 4 }, 'cellSize');
  assertChanged(halftone, { ...halftone, angle: 0 }, 'angle');
  assertChanged(halftone, { ...halftone, foregroundColor: '#abcdef' }, 'foregroundColor');
  assertChanged(halftone, { ...halftone, background: 'solid' }, 'background');
  const solidHalftone = { ...halftone, background: 'solid' as const };
  assertChanged(solidHalftone, { ...solidHalftone, backgroundColor: '#010203' }, 'backgroundColor');

  const vintage = createDefaultLook('vintage-ink', 0);
  assertChanged(vintage, { ...vintage, warmth: 0 }, 'warmth');
  assertChanged(vintage, { ...vintage, fade: 100 }, 'fade');
  assertChanged(vintage, { ...vintage, grain: 100 }, 'grain');
  assertChanged(vintage, { ...vintage, seed: 1 }, 'seed');

  const distressed = createDefaultLook('distressed-print', 0);
  assertChanged(distressed, { ...distressed, wear: 100 }, 'wear');
  assertChanged(distressed, { ...distressed, textureScale: 12 }, 'textureScale');
  assertChanged(distressed, { ...distressed, edgeBreakup: 0 }, 'edgeBreakup');
  assertChanged(distressed, { ...distressed, seed: 1 }, 'seed');
});

test('rejects malformed frames before processing with the exact error', () => {
  const invalidFrames = [
    { width: 0, height: 1, pixels: new Uint8ClampedArray(0) },
    { width: 1.5, height: 1, pixels: new Uint8ClampedArray(4) },
    { width: 1, height: 2, pixels: new Uint8ClampedArray(4) },
    { width: 1_073_741_824, height: 1, pixels: new Uint8ClampedArray(0) },
    { width: 1, height: 1, pixels: new Uint8Array(4) },
  ];
  for (const invalid of invalidFrames) {
    assert.throws(
      () => applyVariationLook(invalid as RgbaFrame, createDefaultLook('original')),
      { message: 'Invalid Look frame.' },
    );
  }
});

function createParameterFrame(): RgbaFrame {
  const width = 8;
  const height = 8;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      pixels[index] = (x * 31 + y * 17) % 256;
      pixels[index + 1] = (x * 13 + y * 47) % 256;
      pixels[index + 2] = (x * 53 + y * 19) % 256;
      pixels[index + 3] = x === 0 && y % 2 === 0 ? 0 : (x + y) % 7 === 0 ? 128 : 255;
    }
  }
  return { width, height, pixels };
}
