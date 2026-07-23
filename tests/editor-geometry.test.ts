import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  buildCanvasFilter,
  fitSourceInViewport,
  getCroppedSourceRect,
  getLayerDrawRect,
  isPointInRotatedRect,
  moveTransformByViewportDelta,
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

test('maps pointer movement against viewport dimensions', () => {
  assert.deepEqual(viewportDeltaToNormalized(100, -50, { width: 1000, height: 500 }), { x: 0.1, y: -0.1 });
});

test('moves normalized layer centers consistently in landscape and portrait viewports', () => {
  const transform = { x: 0.5, y: 0.5, scale: 1, rotation: 0, flipX: false, flipY: false };
  assert.deepEqual(
    moveTransformByViewportDelta(transform, 100, -50, { width: 1000, height: 500 }),
    { ...transform, x: 0.6, y: 0.4 },
  );
  assert.deepEqual(
    moveTransformByViewportDelta(transform, 50, -100, { width: 500, height: 1000 }),
    { ...transform, x: 0.6, y: 0.4 },
  );
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

test('inverse-rotates points when testing rotated layer bounds', () => {
  const bounds = { x: 40, y: 80, width: 120, height: 40 };
  assert.equal(isPointInRotatedRect({ x: 100, y: 150 }, bounds, 90), true);
  assert.equal(isPointInRotatedRect({ x: 150, y: 100 }, bounds, 90), false);
});

test('keeps source URL lifecycle in the workspace registry across shared preview surfaces', () => {
  const editorCanvasSource = readFileSync(new URL('../components/editor/EditorCanvas.tsx', import.meta.url), 'utf8');
  const previewCanvasSource = readFileSync(
    new URL('../components/editor/VariationPreviewCanvas.tsx', import.meta.url),
    'utf8',
  );
  const workspaceSource = readFileSync(new URL('../editor/useEditorWorkspace.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(editorCanvasSource, /\bURL\.revokeObjectURL\s*\(/);
  assert.doesNotMatch(previewCanvasSource, /\bURL\.revokeObjectURL\s*\(/);
  assert.match(workspaceSource, /class AssetUrlRegistry/);
  assert.match(workspaceSource, /this\.api\.revokeObjectURL\s*\(/);
});
