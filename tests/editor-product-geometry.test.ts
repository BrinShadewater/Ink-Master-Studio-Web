import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_TSHIRT_PRINTABLE_REGION } from '../editor/productCatalog';
import {
  containProductMockup,
  moveProductPlacement,
  resizeProductPlacementFromPoint,
  resolveProductArtworkGeometry,
  resolveProductRegionRect,
} from '../editor/productGeometry';
import { DEFAULT_PRODUCT_PLACEMENT } from '../editor/productModel';

test('contains the square shirt image across desktop, mobile, and invalid viewports', () => {
  assert.deepEqual(
    containProductMockup({ width: 1440, height: 900 }),
    { x: 270, y: 0, width: 900, height: 900 },
  );
  assert.deepEqual(
    containProductMockup({ width: 390, height: 600 }),
    { x: 0, y: 105, width: 390, height: 390 },
  );
  assert.deepEqual(
    containProductMockup({ width: 500, height: 500 }),
    { x: 0, y: 0, width: 500, height: 500 },
  );
  assert.deepEqual(
    containProductMockup({ width: Number.NaN, height: 500 }),
    { x: 0, y: 0, width: 0, height: 0 },
  );
});

test('maps the catalog calibration and default placement into display geometry', () => {
  const mockupRect = containProductMockup({ width: 1440, height: 900 });
  const region = resolveProductRegionRect(mockupRect, DEFAULT_TSHIRT_PRINTABLE_REGION);
  assert.deepEqual(region, { x: 576, y: 229.5, width: 288, height: 396 });
  assert.deepEqual(resolveProductArtworkGeometry(region, DEFAULT_PRODUCT_PLACEMENT), {
    center: { x: 720, y: 427.5 },
    edge: 207.36,
    rotation: 0,
  });
});

test('normalizes identical drag intent independently of viewport dimensions', () => {
  const start = { ...DEFAULT_PRODUCT_PLACEMENT };
  const desktop = moveProductPlacement(
    start,
    { x: 32, y: -44 },
    { x: 340, y: 230, width: 320, height: 440 },
  );
  const mobile = moveProductPlacement(
    start,
    { x: 16, y: -22 },
    { x: 20, y: 115, width: 160, height: 220 },
  );
  assert.deepEqual(desktop, { ...start, x: 0.6, y: 0.4 });
  assert.deepEqual(mobile, desktop);
  assert.notEqual(desktop, start);
  assert.deepEqual(start, DEFAULT_PRODUCT_PLACEMENT);
});

test('resizes from display points after reversing placement rotation', () => {
  const region = { x: 100, y: 200, width: 320, height: 440 };
  const rotated = { ...DEFAULT_PRODUCT_PLACEMENT, rotation: 90 };
  const geometry = resolveProductArtworkGeometry(region, rotated);
  const resized = resizeProductPlacementFromPoint(
    rotated,
    { x: geometry.center.x, y: geometry.center.y + 160 },
    region,
  );
  assert.deepEqual(resized, { ...rotated, scale: 1 });
});

test('bounds drag centers and resize scale through product normalization', () => {
  const region = { x: 100, y: 200, width: 320, height: 440 };
  assert.deepEqual(
    moveProductPlacement(DEFAULT_PRODUCT_PLACEMENT, { x: 9999, y: -9999 }, region),
    { ...DEFAULT_PRODUCT_PLACEMENT, x: 1, y: 0 },
  );
  const geometry = resolveProductArtworkGeometry(region, DEFAULT_PRODUCT_PLACEMENT);
  assert.equal(
    resizeProductPlacementFromPoint(
      DEFAULT_PRODUCT_PLACEMENT,
      geometry.center,
      region,
    ).scale,
    0.1,
  );
  assert.equal(
    resizeProductPlacementFromPoint(
      DEFAULT_PRODUCT_PLACEMENT,
      { x: geometry.center.x + 9999, y: geometry.center.y + 9999 },
      region,
    ).scale,
    1.5,
  );
});
