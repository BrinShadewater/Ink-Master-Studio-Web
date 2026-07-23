import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RgbaFrame } from '../editor/backgroundRemovalProcessor';
import { mapTraceOptions, traceRgbaFrame } from '../editor/traceProcessor';
import { createDefaultTraceSettings } from '../editor/traceModel';

test('maps normalized trace controls to deterministic ImageTracer options', () => {
  assert.deepEqual(mapTraceOptions(createDefaultTraceSettings()), {
    numberofcolors: 6,
    ltres: 4.06,
    qtres: 4.06,
    pathomit: 5,
    blurradius: 0,
    colorsampling: 2,
    viewbox: true,
    strokewidth: 1,
    desc: false,
  });
  assert.deepEqual(
    [0, 100].map((detail) => mapTraceOptions({
      ...createDefaultTraceSettings(), detail,
    }).ltres),
    [10, 0.1],
  );
  assert.deepEqual(
    [0, 100].map((smoothing) => mapTraceOptions({
      ...createDefaultTraceSettings(), smoothing,
    }).pathomit),
    [12, 0],
  );
  assert.deepEqual(mapTraceOptions({
    ...createDefaultTraceSettings(),
    blur: 5,
    palette: ['#112233', '#abcdef'],
  }).pal, [
    { r: 17, g: 34, b: 51, a: 255 },
    { r: 171, g: 205, b: 239, a: 255 },
  ]);
});

test('traces bounded RGBA fixtures exactly without mutating caller pixels', () => {
  const frame: RgbaFrame = {
    width: 2,
    height: 2,
    pixels: new Uint8ClampedArray([
      255, 0, 0, 255,
      255, 0, 0, 255,
      0, 0, 255, 255,
      0, 0, 255, 255,
    ]),
  };
  const original = new Uint8ClampedArray(frame.pixels);
  const settings = createDefaultTraceSettings();
  const first = traceRgbaFrame(frame, settings);
  const second = traceRgbaFrame(structuredClone(frame), structuredClone(settings));

  assert.equal(first, second);
  assert.match(first, /^<svg/);
  assert.match(first, /<path/);
  assert.deepEqual(frame.pixels, original);
  assert.throws(
    () => traceRgbaFrame({
      width: 1281,
      height: 1,
      pixels: new Uint8ClampedArray(1281 * 4),
    }, settings),
    /Invalid trace frame/,
  );
});
