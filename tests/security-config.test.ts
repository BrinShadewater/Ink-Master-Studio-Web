import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('nginx CSP stays aligned with the Vercel production security boundary', () => {
  const nginx = read('nginx.conf');
  const vercel = read('vercel.json');

  assert.match(nginx, /X-Frame-Options "DENY"/);
  assert.match(nginx, /Strict-Transport-Security "max-age=63072000; includeSubDomains"/);
  assert.match(nginx, /object-src 'none'/);
  assert.match(nginx, /frame-ancestors 'none'/);
  assert.match(nginx, /connect-src 'self'/);
  assert.doesNotMatch(nginx, /generativelanguage\.googleapis\.com/);
  assert.doesNotMatch(nginx, /cdn\.tailwindcss\.com/);

  assert.match(vercel, /"X-Frame-Options", "value": "DENY"/);
  assert.match(vercel, /"Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains"/);
  assert.match(vercel, /connect-src 'self'/);
  assert.doesNotMatch(vercel, /generativelanguage\.googleapis\.com/);
});

test('Docker production hosting is not advertised without a working container path', () => {
  assert.equal(existsSync('Dockerfile'), false);
  assert.doesNotMatch(read('README.md'), /Dockerfile/);
  assert.doesNotMatch(read('README.md'), /Docker .*production hosting/i);
});
