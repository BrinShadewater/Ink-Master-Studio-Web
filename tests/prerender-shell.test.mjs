// Guards the pre-render shell in index.html.
//
// Why this exists: on 2026-08-13 this site served 44 characters of visible text with
// JavaScript off — the root held an empty <main> and nothing else. GPTBot, ClaudeBot and
// PerplexityBot do not execute JavaScript, so the site was effectively blank to every AI
// crawler. Googlebot DOES render JS and saw the real app, so the gap could not appear in
// Search Console; nothing in CI would have caught it either.
//
// The shell is easy to delete by accident — it looks like dead markup inside #root, and
// React replaces it on mount, so removing it breaks nothing a human would notice. These
// assertions are the only thing standing between that and silently going invisible again.
//
// Asserts against dist/, not the source, so a build step that strips or rewrites the
// markup fails too.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const distIndex = new URL('../dist/index.html', import.meta.url);

/** Visible text a non-JS crawler would read: drop script/style/comments, then tags. */
function crawlerVisibleText(html) {
  const withoutInert = html
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  return withoutInert
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

test('the built page is readable by crawlers that do not run JavaScript', async () => {
  const html = await readFile(distIndex, 'utf8');
  const text = crawlerVisibleText(html);

  // 44 was the broken state. 400 is comfortably below the ~859 the shell produces, so
  // ordinary copy edits do not trip it but deleting the shell does.
  assert.ok(
    text.length > 400,
    `expected >400 chars of crawler-visible text, got ${text.length}. ` +
      'The pre-render shell in index.html has probably been removed — see the note at the ' +
      'top of this file.',
  );
});

test('the built page exposes a heading and body copy to crawlers', async () => {
  const html = await readFile(distIndex, 'utf8');
  const body = html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');

  assert.match(body, /<h1[\s>]/i, 'expected an <h1> in the served HTML');
  assert.match(body, /<h2[\s>]/i, 'expected at least one <h2> in the served HTML');
});

test('the shell sits inside the React root so it is replaced on mount', async () => {
  const html = await readFile(distIndex, 'utf8');

  // Anything outside #root would persist after hydration and double up with the real UI.
  const root = html.match(/<div id="root">([\s\S]*?)<\/div>\s*(?:<script|<\/body)/i);
  assert.ok(root, 'expected a <div id="root"> containing the shell');
  assert.match(root[1], /static-shell/, 'expected the shell markup inside #root');
});
