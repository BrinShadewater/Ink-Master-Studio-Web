import test from 'node:test';
import assert from 'node:assert/strict';
import { filenameToDesignName } from '../services/designNames';

test('filenameToDesignName hides UUID-heavy camera export names', () => {
  assert.equal(
    filenameToDesignName('hf_20260616_104354_8fa6c14b-9d31-4d72-b9c8.png'),
    'Untitled design - Jun 16',
  );
});

test('filenameToDesignName keeps readable artwork names', () => {
  assert.equal(filenameToDesignName('summer-shirt_art-final.png'), 'Summer Shirt Art Final');
});
