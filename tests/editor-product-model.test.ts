import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_PRODUCT_PLACEMENT,
  duplicateTShirtProduct,
  findTShirtProduct,
  normalizeProductPlacement,
  normalizeTShirtProductVariants,
} from '../editor/productModel';

test('normalizes exactly one product for every variation', () => {
  let nextId = 0;
  const products = normalizeTShirtProductVariants([
    {
      id: 'product-a',
      variationId: 'variation-a',
      type: 'tshirt',
      mockupSlug: 'navy',
      placement: { x: 0.25, y: 0.75, scale: 1.1, rotation: 15 },
    },
    {
      id: 'duplicate-link',
      variationId: 'variation-a',
      type: 'tshirt',
      mockupSlug: 'red',
      placement: DEFAULT_PRODUCT_PLACEMENT,
    },
    {
      id: 'orphan',
      variationId: 'missing',
      type: 'tshirt',
      mockupSlug: 'black',
      placement: DEFAULT_PRODUCT_PLACEMENT,
    },
  ], ['variation-a', 'variation-b'], () => `generated-${++nextId}`);

  assert.equal(products.length, 2);
  assert.equal(findTShirtProduct(products, 'variation-a').id, 'product-a');
  assert.equal(findTShirtProduct(products, 'variation-a').mockupSlug, 'navy');
  assert.equal(findTShirtProduct(products, 'variation-b').mockupSlug, 'black');
  assert.notEqual(products[0].placement, DEFAULT_PRODUCT_PLACEMENT);
});

test('repairs placement values with documented defaults and bounds', () => {
  assert.deepEqual(normalizeProductPlacement({
    x: Number.NaN,
    y: 4,
    scale: 0,
    rotation: -900,
  }), {
    x: 0.5,
    y: 1,
    scale: 0.1,
    rotation: -180,
  });
  assert.deepEqual(normalizeProductPlacement(null), DEFAULT_PRODUCT_PLACEMENT);
});

test('repairs malformed product ids and values without sharing caller state', () => {
  const input = [{
    id: '',
    variationId: 'variation-a',
    type: 'tshirt',
    mockupSlug: 'unknown',
    placement: { x: 0.2, y: 0.3, scale: 0.4, rotation: 5 },
  }, {
    id: 'product-b',
    variationId: 'variation-b',
    type: 'tshirt',
    mockupSlug: 'red',
    placement: DEFAULT_PRODUCT_PLACEMENT,
  }, {
    id: 'product-b',
    variationId: 'variation-c',
    type: 'tshirt',
    mockupSlug: 'heather',
    placement: DEFAULT_PRODUCT_PLACEMENT,
  }];
  const snapshot = structuredClone(input);
  let nextId = 0;

  const products = normalizeTShirtProductVariants(
    input,
    ['variation-a', 'variation-b', 'variation-c'],
    () => `generated-${++nextId}`,
  );

  assert.deepEqual(input, snapshot);
  assert.deepEqual(products.map(({ id }) => id), ['generated-1', 'product-b', 'generated-2']);
  assert.equal(products[0].mockupSlug, 'black');
  products[0].placement.x = 1;
  assert.equal(input[0].placement.x, 0.2);
});

test('throws when a normalized variation has no linked product', () => {
  assert.throws(
    () => findTShirtProduct([], 'variation-missing'),
    /T-shirt product not found for variation/,
  );
});

test('duplicates a product under fresh identities without sharing placement', () => {
  const source = normalizeTShirtProductVariants([], ['variation-a'], () => 'product-a')[0];
  source.mockupSlug = 'navy';
  source.placement.x = 0.25;

  const duplicate = duplicateTShirtProduct(source, 'variation-b', 'product-b');
  duplicate.placement.x = 0.75;

  assert.equal(duplicate.id, 'product-b');
  assert.equal(duplicate.variationId, 'variation-b');
  assert.equal(duplicate.mockupSlug, 'navy');
  assert.equal(source.placement.x, 0.25);
  assert.notEqual(duplicate.placement, source.placement);
});
