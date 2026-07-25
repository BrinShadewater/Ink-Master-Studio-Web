import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  DEFAULT_TSHIRT_PRINTABLE_REGION,
  TSHIRT_MOCKUPS,
  getTShirtMockup,
} from '../editor/productCatalog';
import { TSHIRT_MOCKUP_SLUGS } from '../editor/productModel';

test('declares the exact eleven restored local photographic shirts', () => {
  assert.equal(TSHIRT_MOCKUPS.length, 11);
  assert.deepEqual(TSHIRT_MOCKUPS.map(({ slug }) => slug), [...TSHIRT_MOCKUP_SLUGS]);
  assert.equal(new Set(TSHIRT_MOCKUPS.map(({ slug }) => slug)).size, 11);
  assert.equal(new Set(TSHIRT_MOCKUPS.map(({ file }) => file)).size, 11);
  assert.equal(getTShirtMockup('missing').slug, 'black');
  assert.equal(getTShirtMockup('military-green').file, '/mockups/mockup-miltarygreen.webp');
});

test('resolves every catalog file to a 2048 by 2048 WebP', () => {
  for (const mockup of TSHIRT_MOCKUPS) {
    const bytes = readFileSync(path.join(
      process.cwd(),
      'public',
      mockup.file.replace(/^\//, ''),
    ));
    // RIFF container: "RIFF" ....  "WEBP" then a chunk tag.
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF', `${mockup.file} is not RIFF`);
    assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP', `${mockup.file} is not WebP`);
    const chunk = bytes.subarray(12, 16).toString('ascii');
    assert.equal(chunk, 'VP8 ', `${mockup.file} unexpected WebP chunk ${chunk}`);
    // Lossy VP8 frame header: 14-bit width at byte 26, height at byte 28.
    assert.equal(bytes.readUInt16LE(26) & 0x3fff, 2048, `${mockup.file} width`);
    assert.equal(bytes.readUInt16LE(28) & 0x3fff, 2048, `${mockup.file} height`);
  }
});

test('keeps every calibration finite, positive, contained, and independently owned', () => {
  for (const [index, mockup] of TSHIRT_MOCKUPS.entries()) {
    assert.deepEqual(mockup.printableRegion, DEFAULT_TSHIRT_PRINTABLE_REGION);
    assert.ok(Object.values(mockup.printableRegion).every(Number.isFinite));
    assert.ok(mockup.printableRegion.width > 0);
    assert.ok(mockup.printableRegion.height > 0);
    assert.ok(mockup.printableRegion.x >= 0);
    assert.ok(mockup.printableRegion.y >= 0);
    assert.ok(mockup.printableRegion.x + mockup.printableRegion.width <= 1);
    assert.ok(mockup.printableRegion.y + mockup.printableRegion.height <= 1);
    if (index > 0) {
      assert.notEqual(mockup.printableRegion, TSHIRT_MOCKUPS[index - 1].printableRegion);
    }
  }
});
