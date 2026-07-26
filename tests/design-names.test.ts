import test from 'node:test';
import assert from 'node:assert/strict';
import { filenameToDesignName } from '../services/designNames';

const expectedShortDate = (year: number, monthIndex: number, day: number) =>
  new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
    .format(new Date(year, monthIndex, day));

test('filenameToDesignName hides UUID-heavy camera export names', () => {
  assert.equal(
    filenameToDesignName('hf_20260616_104354_8fa6c14b-9d31-4d72-b9c8.png'),
    `Untitled design - ${expectedShortDate(2026, 5, 16)}`,
  );
});

test('filenameToDesignName renders the date in the host locale', () => {
  const name = filenameToDesignName('hf_20260616_104354_8fa6c14b-9d31-4d72-b9c8.png');
  assert.match(name, /^Untitled design - /);
  assert.ok(name.includes('16'), 'expected the day of month in the label');
});

test('filenameToDesignName keeps readable artwork names', () => {
  assert.equal(filenameToDesignName('summer-shirt_art-final.png'), 'Summer Shirt Art Final');
});
