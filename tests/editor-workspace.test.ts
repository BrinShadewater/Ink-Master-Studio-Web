import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateRasterImport } from '../editor/useEditorWorkspace';

test('accepts supported local raster files through 50 MB', () => {
  assert.equal(validateRasterImport(new File(['x'], 'still.png', { type: 'image/png' })), null);
});

test('rejects unsupported and oversized imports with stable messages', () => {
  assert.equal(
    validateRasterImport(new File(['x'], 'art.svg', { type: 'image/svg+xml' })),
    'Choose a PNG, JPEG, or WebP image.',
  );
  const oversized = new File([new Uint8Array(50 * 1024 * 1024 + 1)], 'huge.webp', { type: 'image/webp' });
  assert.equal(validateRasterImport(oversized), 'Choose an image no larger than 50 MB.');
});
