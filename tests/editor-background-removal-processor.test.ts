import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyBackgroundRemoval,
  resolveBackgroundRemovalScale,
  samplePickedColor,
  type RgbaFrame,
} from '../editor/backgroundRemovalProcessor';
import {
  createDefaultBackgroundRemoval,
  type CleanupCorrectionDocument,
} from '../editor/imagePrepModel';

const rgbaFrame = (
  width: number,
  height: number,
  colors: string[],
): RgbaFrame => {
  assert.equal(colors.length, width * height);
  const pixels = new Uint8ClampedArray(width * height * 4);
  colors.forEach((color, index) => {
    const normalized = color.replace(/^#/, '');
    assert.match(normalized, /^[0-9a-f]{6}([0-9a-f]{2})?$/i);
    pixels[index * 4] = Number.parseInt(normalized.slice(0, 2), 16);
    pixels[index * 4 + 1] = Number.parseInt(normalized.slice(2, 4), 16);
    pixels[index * 4 + 2] = Number.parseInt(normalized.slice(4, 6), 16);
    pixels[index * 4 + 3] = normalized.length === 8
      ? Number.parseInt(normalized.slice(6, 8), 16)
      : 255;
  });
  return { width, height, pixels };
};

const alphaAt = (frame: RgbaFrame, x: number, y: number) =>
  frame.pixels[(y * frame.width + x) * 4 + 3];

const rgbAt = (frame: RgbaFrame, x: number, y: number) =>
  [...frame.pixels.slice((y * frame.width + x) * 4, (y * frame.width + x) * 4 + 3)];

const noCorrections: CleanupCorrectionDocument = { schemaVersion: 1, strokes: [] };

test('removes only edge-connected background pixels deterministically without mutating the source', () => {
  const frame = rgbaFrame(5, 5, [
    'ffffff', 'ffffff', 'ffffff', 'ffffff', 'ffffff',
    'ffffff', '111111', '111111', '111111', 'ffffff',
    'ffffff', '111111', 'ffffff', '111111', 'ffffff',
    'ffffff', '111111', '111111', '111111', 'ffffff',
    'ffffff', 'ffffff', 'ffffff', 'ffffff', 'ffffff',
  ]);
  const originalPixels = new Uint8ClampedArray(frame.pixels);
  const settings = {
    ...createDefaultBackgroundRemoval(),
    enabled: true,
    edgeFeather: 0,
  };

  const first = applyBackgroundRemoval({ frame, settings, corrections: noCorrections });
  const second = applyBackgroundRemoval({ frame, settings, corrections: noCorrections });

  assert.equal(alphaAt(first, 0, 0), 0);
  assert.equal(alphaAt(first, 2, 2), 255, 'enclosed white detail stays');
  assert.deepEqual(first.pixels, second.pixels);
  assert.deepEqual(frame.pixels, originalPixels);
  assert.deepEqual(rgbAt(first, 1, 1), [17, 17, 17]);
});

test('detects light, dark, colored, and uneven edge backgrounds', () => {
  for (const [background, artwork] of [
    ['ffffff', '111111'],
    ['000000', 'fefefe'],
    ['13a8c7', 'f4be22'],
  ]) {
    const frame = rgbaFrame(3, 3, [
      background, background, background,
      background, artwork, background,
      background, background, background,
    ]);
    const result = applyBackgroundRemoval({
      frame,
      settings: { ...createDefaultBackgroundRemoval(), enabled: true, edgeFeather: 0 },
      corrections: noCorrections,
    });
    assert.equal(alphaAt(result, 0, 0), 0, `${background} edge is removed`);
    assert.equal(alphaAt(result, 1, 1), 255, `${artwork} artwork is retained`);
  }

  const uneven = rgbaFrame(5, 5, [
    'ffffff', 'f8f8f8', 'ffffff', 'f8f8f8', 'ffffff',
    'f8f8f8', '222222', '222222', '222222', 'f8f8f8',
    'ffffff', '222222', '222222', '222222', 'ffffff',
    'f8f8f8', '222222', '222222', '222222', 'f8f8f8',
    'ffffff', 'f8f8f8', 'ffffff', 'f8f8f8', 'ffffff',
  ]);
  const result = applyBackgroundRemoval({
    frame: uneven,
    settings: { ...createDefaultBackgroundRemoval(), enabled: true, edgeFeather: 0 },
    corrections: noCorrections,
  });
  assert.equal(alphaAt(result, 0, 0), 0);
  assert.equal(alphaAt(result, 1, 0), 0);
  assert.equal(alphaAt(result, 2, 2), 255);
});

test('ignores transparent border colors and clears hidden RGB in transparent output', () => {
  const frame = rgbaFrame(3, 3, [
    'ff00ff00', 'ff00ff00', 'ff00ff00',
    'ff00ff00', 'ff0000ff', 'ff00ff00',
    'ff00ff00', 'ff00ff00', 'ff00ff00',
  ]);
  const result = applyBackgroundRemoval({
    frame,
    settings: { ...createDefaultBackgroundRemoval(), enabled: true, edgeFeather: 0 },
    corrections: noCorrections,
  });

  assert.deepEqual([...result.pixels.slice(0, 4)], [0, 0, 0, 0]);
  assert.equal(alphaAt(result, 1, 1), 255);
  assert.deepEqual(rgbAt(result, 1, 1), [255, 0, 0]);
});

test('picked mode removes exactly the selected enclosed connected region', () => {
  const frame = rgbaFrame(7, 5, [
    'ffffff', 'ffffff', 'ffffff', 'ffffff', 'ffffff', 'ffffff', 'ffffff',
    'ffffff', '111111', '111111', '111111', '111111', '111111', 'ffffff',
    'ffffff', '111111', 'ffffff', '111111', 'ffffff', '111111', 'ffffff',
    'ffffff', '111111', '111111', '111111', '111111', '111111', 'ffffff',
    'ffffff', 'ffffff', 'ffffff', 'ffffff', 'ffffff', 'ffffff', 'ffffff',
  ]);
  const automatic = applyBackgroundRemoval({
    frame,
    settings: { ...createDefaultBackgroundRemoval(), enabled: true, edgeFeather: 0 },
    corrections: noCorrections,
  });
  const picked = applyBackgroundRemoval({
    frame,
    settings: {
      ...createDefaultBackgroundRemoval(),
      enabled: true,
      mode: 'picked',
      pickedColor: '#ffffff',
      pickedPoint: { x: 2 / 6, y: 0.5 },
      edgeFeather: 0,
    },
    corrections: noCorrections,
  });

  assert.equal(alphaAt(automatic, 2, 2), 255);
  assert.equal(alphaAt(picked, 2, 2), 0);
  assert.equal(alphaAt(picked, 4, 2), 255, 'a disconnected matching region stays');
  assert.equal(alphaAt(picked, 1, 1), 255);
});

test('maps tolerance zero through one hundred to bounded perceptual matching', () => {
  const colors = Array.from({ length: 25 }, () => 'ffffff');
  colors[6] = 'bbbbbb';
  colors[7] = 'bbbbbb';
  colors[8] = 'bbbbbb';
  colors[11] = 'bbbbbb';
  colors[12] = '222222';
  colors[13] = 'bbbbbb';
  colors[16] = 'bbbbbb';
  colors[17] = 'bbbbbb';
  colors[18] = 'bbbbbb';
  const frame = rgbaFrame(5, 5, colors);

  const exact = applyBackgroundRemoval({
    frame,
    settings: {
      ...createDefaultBackgroundRemoval(),
      enabled: true,
      tolerance: 0,
      edgeFeather: 0,
    },
    corrections: noCorrections,
  });
  const broad = applyBackgroundRemoval({
    frame,
    settings: {
      ...createDefaultBackgroundRemoval(),
      enabled: true,
      tolerance: 100,
      edgeFeather: 0,
    },
    corrections: noCorrections,
  });

  assert.equal(alphaAt(exact, 1, 1), 255);
  assert.equal(alphaAt(broad, 1, 1), 0);
  assert.equal(alphaAt(broad, 2, 2), 255);
});

test('applies canonical edge feathering with exact retained-edge alpha', () => {
  const colors = Array.from({ length: 1000 * 3 }, () => 'ffffff');
  colors[1 * 1000 + 500] = '000000';
  const frame = rgbaFrame(1000, 3, colors);
  const result = applyBackgroundRemoval({
    frame,
    settings: {
      ...createDefaultBackgroundRemoval(),
      enabled: true,
      tolerance: 0,
      edgeFeather: 1,
    },
    corrections: noCorrections,
  });

  assert.equal(alphaAt(result, 499, 1), 0);
  assert.equal(alphaAt(result, 500, 1), 128);
  assert.deepEqual(rgbAt(result, 500, 1), [0, 0, 0]);
});

test('applies erase and restore strokes in document order against immutable source alpha', () => {
  const colors = Array.from({ length: 25 }, () => '2266aaff');
  colors[12] = '2266aa40';
  const frame = rgbaFrame(5, 5, colors);
  const base = {
    ...createDefaultBackgroundRemoval(),
    enabled: false,
    edgeFeather: 0,
  };
  const center = { x: 0.5, y: 0.5 };
  const eraseThenRestore = applyBackgroundRemoval({
    frame,
    settings: base,
    corrections: {
      schemaVersion: 1,
      strokes: [
        { mode: 'erase', size: 8, points: [center] },
        { mode: 'restore', size: 8, points: [center] },
      ],
    },
  });
  const restoreThenErase = applyBackgroundRemoval({
    frame,
    settings: base,
    corrections: {
      schemaVersion: 1,
      strokes: [
        { mode: 'restore', size: 8, points: [center] },
        { mode: 'erase', size: 8, points: [center] },
      ],
    },
  });
  const segment = applyBackgroundRemoval({
    frame,
    settings: base,
    corrections: {
      schemaVersion: 1,
      strokes: [{
        mode: 'erase',
        size: 8,
        points: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }],
      }],
    },
  });

  assert.equal(alphaAt(eraseThenRestore, 2, 2), 64);
  assert.equal(alphaAt(restoreThenErase, 2, 2), 0);
  assert.deepEqual(rgbAt(restoreThenErase, 2, 2), [0, 0, 0]);
  assert.equal(alphaAt(segment, 0, 2), 0);
  assert.equal(alphaAt(segment, 4, 2), 0);
  assert.equal(alphaAt(segment, 2, 0), 255);
});

test('samples picked colors and resolves the 2048-pixel caller scale', () => {
  const frame = rgbaFrame(2, 2, ['112233', '445566', '778899', 'abcdef']);

  assert.equal(samplePickedColor(frame, { x: 0.9, y: 0.1 }), '#445566');
  assert.equal(samplePickedColor(frame, { x: 0.1, y: 0.9 }), '#778899');
  assert.equal(resolveBackgroundRemovalScale(1024, 512), 1);
  assert.equal(resolveBackgroundRemovalScale(4096, 2048), 0.5);
  assert.throws(
    () => applyBackgroundRemoval({
      frame: { width: 2, height: 2, pixels: new Uint8ClampedArray(3) },
      settings: createDefaultBackgroundRemoval(),
      corrections: noCorrections,
    }),
    /Invalid background removal frame/,
  );
});
