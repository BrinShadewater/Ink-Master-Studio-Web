import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { LandingPage } from '../components/LandingPage';

test('landing page presents the branded print-design workflow', () => {
  const markup = renderToStaticMarkup(<LandingPage onOpenEditor={() => undefined} />);

  assert.match(markup, /\/logo\/logo\.png/);
  assert.match(markup, /Start designing/);
  assert.match(markup, /Turn artwork into a/);
  assert.match(markup, /print-ready/);
  assert.match(markup, /shirt design/);
  assert.match(markup, /Canvas-first\. Print-ready\./);
  assert.match(markup, /Every detail, dialed in/);
  assert.match(markup, /Classic tee/);
  assert.match(markup, /landing-particle/);
  assert.match(markup, /Garment color preview/);
  assert.match(markup, /Show Black T-shirt/);
  assert.match(markup, /Show Heather gray T-shirt/);
  assert.match(markup, /Show White T-shirt/);
  assert.doesNotMatch(markup, /Explore templates/);
  assert.doesNotMatch(markup, />Pricing</);
});
