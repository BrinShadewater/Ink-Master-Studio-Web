import assert from 'node:assert/strict';
import { test } from 'node:test';

import { planProgressiveResize } from '../services/upscaleEngine';

test('plans progressive passes no larger than 2x', () => {
  assert.deepEqual(planProgressiveResize(900, 1080, 5), [
    { width: 1800, height: 2160 },
    { width: 3600, height: 4320 },
    { width: 4500, height: 5400 },
  ]);
});
