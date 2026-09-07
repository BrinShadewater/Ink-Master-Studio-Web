// Guards the per-route files written by inkmaster-prerender-static-routes in vite.config.ts.
//
// Why this exists: StaticPage sets the title, description and canonical at runtime, in a
// useEffect. Googlebot executes JavaScript and sees that; GPTBot, ClaudeBot, PerplexityBot and
// every share scraper do not. So until 2026-09-06 the served HTML for /privacy, /terms,
// /contact and the three creator guides all carried the HOME page's canonical, og:url and copy
// — every one of them looked like a duplicate of the home page to exactly the clients that
// decide whether a page is indexed and what a shared link says.
//
// Two of those routes exist to be found in search ("printify file requirements",
// "print-ready file checklist"), so this is the difference between the guides ranking as
// themselves and not existing.
//
// Asserts against dist/, so removing the plugin fails here. `npm test` builds first.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { routes } from '../content/staticRoutes.ts';

const ORIGIN = 'https://inkmasterstudio.com';
const fileFor = (route) => new URL(`../dist${route.path}/index.html`, import.meta.url);

const attr = (html, pattern) => {
  const m = html.match(pattern);
  return m ? m[1] : null;
};
const visibleText = (html) => {
  const inner = html.match(/<div class="static-shell__inner">([\s\S]*?)<\/div>/);
  return inner ? inner[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
};

test('every static route names itself, not the home page', async () => {
  for (const route of routes) {
    const html = await readFile(fileFor(route), 'utf8');
    const self = `${ORIGIN}${route.path}`;

    assert.equal(
      attr(html, /<link rel="canonical" href="([^"]+)"/),
      self,
      `${route.path}: canonical must be its own URL`,
    );
    assert.equal(attr(html, /<meta property="og:url" content="([^"]+)"/), self, `${route.path}: og:url`);
    assert.equal(attr(html, /<meta name="twitter:url" content="([^"]+)"/), self, `${route.path}: twitter:url`);
    assert.match(
      attr(html, /<title>([^<]*)<\/title>/),
      new RegExp(`^${route.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`),
      `${route.path}: title must start with the route's own title`,
    );
  }
});

test('each route serves its own words to a crawler that does not run JavaScript', async () => {
  for (const route of routes) {
    const text = visibleText(await readFile(fileFor(route), 'utf8'));
    assert.ok(
      text.includes(route.sections[0].heading),
      `${route.path}: the shell must carry this route's first heading, not the home page's copy`,
    );
    assert.ok(text.length > 200, `${route.path}: expected real prose in the shell, got ${text.length} chars`);
  }
});

test('the app still hydrates inside every prerendered file, and the home page is untouched', async () => {
  for (const route of routes) {
    assert.match(await readFile(fileFor(route), 'utf8'), /<div id="root">/, `${route.path}: no mount point`);
  }
  const home = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.equal(attr(home, /<link rel="canonical" href="([^"]+)"/), `${ORIGIN}/`);
});
