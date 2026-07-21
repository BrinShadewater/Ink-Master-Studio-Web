import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildCanvasFilter,
  fitSourceInViewport,
  getCroppedSourceRect,
  getLayerDrawRect,
  viewportDeltaToNormalized,
} from '../editor/geometry';

test('fits a landscape source into a portrait work area without cropping', () => {
  assert.deepEqual(fitSourceInViewport({ width: 1600, height: 900 }, { width: 600, height: 800 }), {
    x: 30, y: 248.125, width: 540, height: 303.75,
  });
});

test('converts normalized crop values to source pixels', () => {
  assert.deepEqual(getCroppedSourceRect({ width: 1000, height: 800 }, { x: 0.1, y: 0.2, width: 0.7, height: 0.5 }), {
    x: 100, y: 160, width: 700, height: 400,
  });
});

test('maps pointer movement to stable normalized project movement', () => {
  assert.deepEqual(viewportDeltaToNormalized(54, -27, { width: 540, height: 270 }), { x: 0.1, y: -0.1 });
});

test('builds a Canvas 2D filter from editor adjustment units', () => {
  assert.equal(buildCanvasFilter({ brightness: 20, contrast: -10, saturation: 35 }), 'brightness(120%) contrast(90%) saturate(135%)');
});

test('derives a cropped draw rectangle around the normalized layer center', () => {
  assert.deepEqual(
    getLayerDrawRect(
      { width: 1000, height: 500 },
      { width: 1200, height: 800 },
      { x: 0.25, y: 0.25, scale: 2, rotation: 0, flipX: false, flipY: false },
      { x: 0.1, y: 0.2, width: 0.5, height: 0.5 },
    ),
    { x: -260, y: -80, width: 1120, height: 560 },
  );
});
