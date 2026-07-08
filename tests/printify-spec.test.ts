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
