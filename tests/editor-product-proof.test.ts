import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_TSHIRT_PRINTABLE_REGION } from '../editor/productCatalog';
import { DEFAULT_PRODUCT_PLACEMENT, createDefaultTShirtProduct } from '../editor/productModel';
import { createProofUrlOwner, resolveProductProofGeometry } from '../editor/productProof';
import { getTShirtExportPreset } from '../editor/tshirtExportModel';

test('maps one placed production PNG region into the garment print area', () => {
  const product = createDefaultTShirtProduct('variation-a', 'product-a');
  product.placement = { ...DEFAULT_PRODUCT_PLACEMENT, x: 0.28, y: 0.27, scale: 0.32 };

  const geometry = resolveProductProofGeometry(
    product,
    getTShirtExportPreset('printify-full-front'),
    { width: 1200, height: 1200 },
    DEFAULT_TSHIRT_PRINTABLE_REGION,
  );

  assert.deepEqual(geometry.source, {
    x: 540,
    y: 738,
    width: 1440,
    height: 1440,
  });
  assert.deepEqual(geometry.destination, {
    x: 454.08,
    y: 387.12,
    width: 122.88,
    height: 122.88,
  });
});

test('expands source and destination bounds so rotated artwork is not clipped', () => {
  const product = createDefaultTShirtProduct('variation-a', 'product-a');
  product.placement = {
    ...DEFAULT_PRODUCT_PLACEMENT,
    x: 0.28,
    y: 0.27,
    scale: 0.32,
    rotation: 45,
  };

  const geometry = resolveProductProofGeometry(
    product,
    getTShirtExportPreset('printify-full-front'),
    { width: 1200, height: 1200 },
    DEFAULT_TSHIRT_PRINTABLE_REGION,
  );

  assert.ok(Math.abs(geometry.source.width - 2036.46753) < 0.00001);
  assert.ok(Math.abs(geometry.source.height - 2036.46753) < 0.00001);
  assert.ok(Math.abs(geometry.destination.width - 173.778563) < 0.00001);
  assert.ok(Math.abs(geometry.destination.height - 173.778563) < 0.00001);
});

test('revokes each owned proof URL exactly once', () => {
  const revoked: string[] = [];
  const owner = createProofUrlOwner((url) => revoked.push(url));

  owner.replace('blob:first');
  owner.replace('blob:second');
  assert.equal(owner.current(), 'blob:second');
  assert.deepEqual(revoked, ['blob:first']);

  owner.clear();
  owner.clear();
  assert.equal(owner.current(), null);
  assert.deepEqual(revoked, ['blob:first', 'blob:second']);
});
