import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveDisplayAssetId } from '../editor/imagePrepModel';

const layer = (
  backgroundRemoval: { enabled: boolean; preparedAssetId: string | null },
  assetId = 'original',
) => ({ assetId, backgroundRemoval });

const present = (...ids: string[]) => (assetId: string) => ids.includes(assetId);

test('a finished background removal is what gets shown and analysed', () => {
  // The bug this exists for: the readiness card analysed `original`, saw an opaque image with
  // uniform edges, and went on demanding a removal that had already produced `prepared`.
  assert.equal(
    resolveDisplayAssetId(
      layer({ enabled: true, preparedAssetId: 'prepared' }),
      present('original', 'prepared'),
    ),
    'prepared',
  );
});

test('an unfinished removal still shows the original rather than nothing', () => {
  assert.equal(
    resolveDisplayAssetId(layer({ enabled: true, preparedAssetId: null }), present('original')),
    'original',
  );
});

test('a prepared asset that is not loaded falls back instead of blanking the card', () => {
  // Assets are dropped and reloaded around undo and project switches. Returning an id nothing
  // can resolve would leave the readiness card with no artwork to analyse at all.
  assert.equal(
    resolveDisplayAssetId(
      layer({ enabled: true, preparedAssetId: 'prepared' }),
      present('original'),
    ),
    'original',
  );
});

test('a disabled removal ignores any prepared asset left behind', () => {
  // Turning removal off must show the original again, even though the prepared asset survives
  // so that turning it back on is instant.
  assert.equal(
    resolveDisplayAssetId(
      layer({ enabled: false, preparedAssetId: 'prepared' }),
      present('original', 'prepared'),
    ),
    'original',
  );
});
