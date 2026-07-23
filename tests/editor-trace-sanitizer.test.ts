import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import {
  recolorSafeTraceDocument,
  sanitizeTraceSvg,
  serializeSafeTraceDocument,
} from '../editor/traceSanitizer';

const xmlPlatform = { DOMParser, XMLSerializer };

test('sanitizes ImageTracer paths into a canonical safe document and markup', () => {
  const document = sanitizeTraceSvg(
    '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="10" height="20" viewBox="0 0 10 20" desc="trace">' +
      '<g transform="translate(1 2)"><path d="M 0 0 L 5 0 Q 6 1 5 2 C 4 3 2 3 0 2 Z" ' +
      'fill="rgb(17, 34, 51)" stroke="#ABC" stroke-width="1" opacity="0.5" transform="scale(2)"/></g>' +
    '</svg>',
    xmlPlatform,
  );

  assert.deepEqual(document, {
    width: 10,
    height: 20,
    paths: [{
      d: 'M 0 0 L 5 0 Q 6 1 5 2 C 4 3 2 3 0 2 Z',
      fill: '#112233',
      stroke: '#aabbcc',
      strokeWidth: 1,
      opacity: 0.5,
      transform: 'translate(1 2) scale(2)',
    }],
  });

  const serialized = serializeSafeTraceDocument(document, xmlPlatform);
  assert.match(serialized, /^<svg[^>]*viewBox="0 0 10 20"/);
  assert.match(serialized, /fill="#112233"/);
  assert.deepEqual(sanitizeTraceSvg(serialized, xmlPlatform), document);
  assert.doesNotMatch(
    serialized,
    /href|url\(|style=|on[a-z]+=|script|image|animate|foreignObject/i,
  );
});

test('rejects hostile nodes, attributes, references, transforms, and path commands', () => {
  for (const hostile of [
    '<svg viewBox="0 0 10 10"><script>alert(1)</script></svg>',
    '<svg viewBox="0 0 10 10"><image href="data:image/png;base64,AA=="/></svg>',
    '<svg viewBox="0 0 10 10"><path d="M0 0" fill="#000" onclick="alert(1)"/></svg>',
    '<svg viewBox="0 0 10 10"><foreignObject/></svg>',
    '<svg viewBox="0 0 10 10"><path d="M0 0" fill="#000" style="fill:url(https://example.com/x)"/></svg>',
    '<svg viewBox="0 0 10 10"><path d="M0 0 A1 1 0 0 0 2 2" fill="#000"/></svg>',
    '<svg viewBox="0 0 10 10"><path d="M0 0" fill="#000" transform="translate(NaN)"/></svg>',
    '<svg viewBox="0 0 Infinity 10"><path d="M0 0" fill="#000"/></svg>',
  ]) {
    assert.throws(() => sanitizeTraceSvg(hostile, xmlPlatform), /Trace output is unsafe/);
  }
});

test('recolors first-appearance fills without changing geometry or caller state', () => {
  const document = sanitizeTraceSvg(
    '<svg viewBox="0 0 10 10">' +
      '<path d="M0 0 L1 1 Z" fill="#ff0000" stroke="#ff0000"/>' +
      '<path d="M2 2 L3 3 Z" fill="#00ff00"/>' +
      '<path d="M4 4 L5 5 Z" fill="#ff0000"/>' +
    '</svg>',
    xmlPlatform,
  );
  const original = structuredClone(document);
  const recolored = recolorSafeTraceDocument(document, ['#112233']);

  assert.deepEqual(recolored.paths.map(({ d }) => d), document.paths.map(({ d }) => d));
  assert.deepEqual(recolored.paths.map(({ fill }) => fill), ['#112233', '#112233', '#112233']);
  assert.equal(recolored.paths[0].stroke, '#112233');
  assert.deepEqual(document, original);
});
