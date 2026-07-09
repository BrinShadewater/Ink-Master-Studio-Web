import assert from 'node:assert/strict';
import test from 'node:test';
import { assessUpscaleQuality } from '../services/upscaleQuality';

test('accepts the 2500 x 3000 Printify tee acceptance case', () => {
  assert.deepEqual(assessUpscaleQuality(2500, 3000, 4500, 5400), {
    ratio: 1.8,
    level: 'good',
    blocksDownload: false,
    detail: 'Upscaled 1.8x from 2500 x 3000px. Good for this selected size.',
  });
});

test('warns without blocking when enlargement may look soft', () => {
  assert.deepEqual(assessUpscaleQuality(1500, 1800, 4500, 5400), {
    ratio: 3,
    level: 'caution',
    blocksDownload: false,
    detail: 'Upscaled 3x from 1500 x 1800px. Fine detail may look soft at full print size.',
  });
});

test('allows extreme enlargement with a strong warning', () => {
  assert.deepEqual(assessUpscaleQuality(900, 1080, 4500, 5400), {
    ratio: 5,
    level: 'extreme',
    blocksDownload: false,
    detail:
      'This image needs 5x enlargement. Download is allowed, but fine detail may look soft or artificial.',
  });
});

test('does not round an enlargement over the extreme boundary down to 4x', () => {
  const assessment = assessUpscaleQuality(1114, 1337, 4500, 5400);

  assert.equal(assessment.ratio, 4);
  assert.equal(assessment.level, 'extreme');
  assert.equal(assessment.blocksDownload, false);
});

test('reports when the source already fits the target', () => {
  assert.deepEqual(assessUpscaleQuality(5000, 6000, 4500, 5400), {
    ratio: 1,
    level: 'ready',
    blocksDownload: false,
    detail: 'Source size fits this product target.',
  });
});
