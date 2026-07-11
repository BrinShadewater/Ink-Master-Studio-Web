import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { getStaticRoute } from '../components/StaticPages';

test('unknown routes render a noindex static page model', () => {
  const route = getStaticRoute('/definitely-not-a-page-xyz');

  assert.equal(route?.id, 'not-found');
  assert.equal(route?.title, 'Page Not Found');
  assert.match(route?.description ?? '', /does not exist/i);
});

test('homepage metadata includes twitter site attribution', () => {
  const html = readFileSync('index.html', 'utf8');

  assert.match(html, /<meta name="twitter:site" content="@InkMasterStudio" \/>/);
});

test('public docs describe the creator-first Printify workflow before advanced production tools', () => {
  const readme = readFileSync('README.md', 'utf8');
  const brief = readFileSync('docs/PROJECT-BRIEF.md', 'utf8');

  assert.match(readme, /creator artwork into print-ready PNG files for Printify/i);
  assert.match(readme, /Advanced mode/i);
  assert.doesNotMatch(readme.split('\n').slice(0, 8).join('\n'), /print-shop operators/i);
  assert.match(brief, /creators preparing artwork for print-on-demand/i);
  assert.match(brief, /Drop an image.*pick a product.*download/i);
});
