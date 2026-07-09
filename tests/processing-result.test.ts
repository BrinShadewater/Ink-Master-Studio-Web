import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildUpscaleMetadata, getProcessingTargetSize } from '../services/upscaleEngine';

test('describes an unchanged export', () => {
  assert.deepEqual(buildUpscaleMetadata(5000, 6000, 4500, 5400), {
    method: 'none',
    ratio: 1,
    sourceSize: [5000, 6000],
    targetSize: [4500, 5400],
  });
});

test('describes a progressive export', () => {
  assert.deepEqual(buildUpscaleMetadata(2500, 3000, 4500, 5400), {
    method: 'local-progressive',
    ratio: 1.8,
    sourceSize: [2500, 3000],
    targetSize: [4500, 5400],
  });
});

test('bounds preview processing to a 1600px longest side while keeping product metadata target', () => {
  const target = getProcessingTargetSize({
    settings: {
      targetWidth: 4500,
      targetHeight: 5400,
      purpose: 'preview',
    },
  });

  assert.deepEqual(target, {
    processingWidth: 1333,
    processingHeight: 1600,
    metadataWidth: 4500,
    metadataHeight: 5400,
  });
});
