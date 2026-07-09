import test from 'node:test';
import assert from 'node:assert/strict';
import { ItemType } from '../types';
import { DEFAULT_PRINTIFY_PRODUCT_ID, printify, printifyProductToSpecification } from '../specs/printify';

test('Printify default product targets full-front t-shirt PNG requirements', () => {
  const product = printify.products.find((candidate) => candidate.id === DEFAULT_PRINTIFY_PRODUCT_ID);
  assert.ok(product);
  assert.equal(product.itemType, ItemType.TSHIRT);
  assert.deepEqual(product.px, [4500, 5400]);
  assert.equal(product.dpi, 300);
  assert.deepEqual(printify.maxBytes, { png: 100e6, jpeg: 100e6, svg: 20e6 });
});

test('Printify presets convert pixel targets into print specifications', () => {
  const product = printify.products.find((candidate) => candidate.id === 'tee-front-full');
  assert.ok(product);
  assert.deepEqual(printifyProductToSpecification(product), {
    method: 'DTG',
    widthInches: 15,
    heightInches: 18,
    targetDpi: 300,
  });
});

test('Printify creator presets record their validated Product Creator targets', () => {
  const expected = {
    'tee-front-full': {
      px: [4500, 5400],
      dpi: 300,
      product: 'Gildan 5000',
      observedPrintArea: [3951, 4919],
    },
    'hoodie-front': {
      px: [3531, 2352],
      dpi: 300,
      product: 'Gildan 18500',
      observedPrintArea: [3531, 2352],
    },
    'mug-wrap': {
      px: [2475, 1155],
      dpi: 300,
      product: 'Accent Coffee Mug (11oz)',
      observedPrintArea: [2475, 1155],
    },
    'poster-12x18': {
      px: [3600, 5400],
      dpi: 300,
      product: 'Matte Vertical Poster (12 x 18)',
      observedPrintArea: [2400, 3000],
    },
    'large-format': {
      px: [7825, 9325],
      dpi: 150,
      product: 'Velveteen Plush Blanket (50 x 60)',
      observedPrintArea: [7825, 9325],
    },
  } as const;

  for (const product of printify.products) {
    const target = expected[product.id as keyof typeof expected];
    assert.ok(target, `Unexpected Printify preset ${product.id}`);
    assert.deepEqual(product.px, target.px);
    assert.equal(product.dpi, target.dpi);
    assert.equal(product.validation.product, target.product);
    assert.deepEqual(product.validation.observedPrintArea, target.observedPrintArea);
    assert.equal(product.validation.checkedAt, '2026-07-08');
  }
});
