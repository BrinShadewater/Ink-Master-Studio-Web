import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createListingKitManifest } from '../editor/listingKit';
import { createDefaultTShirtProduct } from '../editor/productModel';

test('listing kit manifest records the authoritative export and selected storefront mockups', () => {
  const product = createDefaultTShirtProduct('variation-a', 'product-a');
  product.printMethod = 'dtf';
  product.placement = { x: 0.28, y: 0.27, scale: 0.32, rotation: 0 };
  const manifest = createListingKitManifest({
    projectName: 'Siren release',
    artworkName: 'Siren full color',
    product,
    presetId: 'printify-full-front',
    mockups: [
      { color: 'Black', scene: 'studio' },
      { color: 'White', scene: 'technical' },
    ],
  });

  assert.deepEqual(manifest, {
    format: 'inkmaster-listing-kit',
    project: 'Siren release',
    artwork: 'Siren full color',
    garment: 'Classic tee',
    printMethod: 'dtf',
    exportPreset: 'printify-full-front',
    placement: { x: 0.28, y: 0.27, scale: 0.32, rotation: 0 },
    mockups: [
      { color: 'Black', scene: 'studio' },
      { color: 'White', scene: 'technical' },
    ],
  });
});
