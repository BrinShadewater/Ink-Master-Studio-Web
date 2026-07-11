import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ResizeMode } from '../types';
import { calculateDesignPlacement, normalizeDesignEditSettings } from '../services/designPlacement';

test('centers a fit placement by default', () => {
  assert.deepEqual(calculateDesignPlacement({
    sourceWidth: 2500,
    sourceHeight: 3000,
    targetWidth: 4500,
    targetHeight: 5400,
    resizeMode: ResizeMode.FIT,
    allowUpscaling: true,
    edit: {},
  }), {
    drawWidth: 4500,
    drawHeight: 5400,
    centerX: 2250,
    centerY: 2700,
    rotationRadians: 0,
    scale: 1.8,
  });
});

test('applies user scale, offset, and rotation to the placement', () => {
  assert.deepEqual(calculateDesignPlacement({
    sourceWidth: 2500,
    sourceHeight: 3000,
    targetWidth: 4500,
    targetHeight: 5400,
    resizeMode: ResizeMode.FIT,
    allowUpscaling: true,
    edit: {
      designScalePercent: 80,
      designOffsetXPercent: 10,
      designOffsetYPercent: -5,
      designRotationDegrees: 15,
    },
  }), {
    drawWidth: 3600,
    drawHeight: 4320,
    centerX: 2700,
    centerY: 2430,
    rotationRadians: Number((Math.PI / 12).toFixed(6)),
    scale: 1.44,
  });
});

test('normalizes design edit settings to safe creator control ranges', () => {
  assert.deepEqual(normalizeDesignEditSettings({
    designScalePercent: 1000,
    designOffsetXPercent: -90,
    designOffsetYPercent: 90,
    designRotationDegrees: 725,
  }), {
    designScalePercent: 300,
    designOffsetXPercent: -50,
    designOffsetYPercent: 50,
    designRotationDegrees: 180,
  });
});
