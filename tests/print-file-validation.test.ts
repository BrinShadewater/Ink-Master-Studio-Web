import assert from 'node:assert/strict';
import { test } from 'node:test';

import { printify } from '../specs/printify';
import { parsePngMetadata, validatePrintFile } from '../services/printFileValidation';

const chunk = (type: string, data: number[]) => {
  const bytes = new Uint8Array(12 + data.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  [...type].forEach((character, index) => {
    bytes[4 + index] = character.charCodeAt(0);
  });
  bytes.set(data, 8);
  return [...bytes];
};

const pngBytes = (width: number, height: number, dpi: number, colorType = 6) => {
  const pixelsPerMeter = Math.round(dpi / 0.0254);
  const uint32 = (value: number) => [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
  return new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    ...chunk('IHDR', [
      ...uint32(width),
      ...uint32(height),
      8,
      colorType,
      0,
      0,
      0,
    ]),
    ...chunk('pHYs', [
      ...uint32(pixelsPerMeter),
      ...uint32(pixelsPerMeter),
      1,
    ]),
    ...chunk('IEND', []),
  ]);
};

test('parses PNG dimensions color and DPI metadata', () => {
  assert.deepEqual(parsePngMetadata(pngBytes(4500, 5400, 300)), {
    width: 4500,
    height: 5400,
    colorType: 6,
    colorLabel: 'RGBA',
    hasAlpha: true,
    pixelsPerMeter: [11811, 11811],
    dpi: [300, 300],
    byteLength: 66,
  });
});

test('validates a downloaded Printify PNG receipt', async () => {
  const product = printify.products[0];
  const receipt = await validatePrintFile(
    new Blob([pngBytes(product.px[0], product.px[1], product.dpi, 2)], { type: 'image/png' }),
    'receipt-test_tee-front-full.png',
    product,
    printify,
  );

  assert.equal(receipt.readyForUpload, true);
  assert.equal(receipt.filename, 'receipt-test_tee-front-full.png');
  assert.equal(receipt.metadata.colorLabel, 'RGB');
  assert.equal(receipt.items.find((item) => item.id === 'dimensions')?.state, 'pass');
  assert.equal(receipt.items.find((item) => item.id === 'dpi')?.detail, '300 x 300 DPI was written into the PNG.');
});
