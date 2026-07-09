import assert from 'node:assert/strict';
import test from 'node:test';
import { dataUrlToBlob } from '../services/dataUrls';

test('decodes a base64 data URL without network access', async () => {
  const blob = dataUrlToBlob('data:image/png;base64,aGVsbG8=');

  assert.equal(blob.type, 'image/png');
  assert.equal(await blob.text(), 'hello');
});

test('decodes a percent-encoded data URL without network access', async () => {
  const blob = dataUrlToBlob('data:text/plain,hello%20world');

  assert.equal(blob.type, 'text/plain');
  assert.equal(await blob.text(), 'hello world');
});

test('rejects malformed data URLs', () => {
  assert.throws(() => dataUrlToBlob('data:image/png'), /invalid data url/i);
});
