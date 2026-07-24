import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { LandingPage } from '../components/LandingPage';

test('landing page presents the branded print-design workflow', () => {
  const markup = renderToStaticMarkup(<LandingPage onOpenEditor={() => undefined} />);

  assert.match(markup, /\/logo\/logo\.png/);
  assert.match(markup, /Start a design/);
  assert.match(markup, /Turn original artwork into print-ready merch/);
  assert.match(markup, /Start with artwork/);
  assert.match(markup, /Shape the finish/);
  assert.match(markup, /Check the product/);
  assert.match(markup, /landing-particle/);
});
