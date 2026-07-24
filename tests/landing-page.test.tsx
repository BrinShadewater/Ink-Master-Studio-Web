import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { LandingPage } from '../components/LandingPage';

test('landing page presents the branded print-design workflow', () => {
  const markup = renderToStaticMarkup(<LandingPage onOpenEditor={() => undefined} />);

  assert.match(markup, /\/logo\/logo\.png/);
  assert.match(markup, /Start designing/);
  assert.match(markup, /Turn artwork into a print-ready shirt design/);
  assert.match(markup, /Canvas-first merch studio/);
  assert.match(markup, /Creator finish/);
  assert.match(markup, /Product preview/);
  assert.match(markup, /landing-particle/);
});
