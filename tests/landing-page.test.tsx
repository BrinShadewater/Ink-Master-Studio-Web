import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { LandingPage } from '../components/LandingPage';

test('landing page presents the branded print-design workflow', () => {
  const markup = renderToStaticMarkup(<LandingPage onOpenEditor={() => undefined} />);

  assert.match(markup, /\/logo\/logo-mark\.webp/);
  assert.match(markup, /Start designing/);
  assert.match(markup, /Turn artwork into a/);
  assert.match(markup, /print-ready/);
  assert.match(markup, /shirt design/);
  assert.match(markup, /Local-first\. Printify-ready\./);
  assert.match(markup, /Printify Full Front/);
  assert.match(markup, /4500 x 5400 px/);
  assert.match(markup, /300 DPI metadata/);
  assert.match(markup, /Resolution, transparency, and file-size guidance/);
  assert.match(markup, /Every export, checked/);
  assert.match(markup, /Classic tee/);
  assert.match(markup, /landing-grid/);
  assert.doesNotMatch(markup, /landing-particle/);
  assert.match(markup, /<figure[^>]*aria-label="Interactive garment preview"/);
  assert.match(markup, /<figcaption[^>]*>Black classic T-shirt preview with siren artwork on the front/);
  assert.match(markup, /mt-11 grid gap-4/);
  assert.match(markup, /Garment color preview/);
  assert.match(markup, /Show Black T-shirt/);
  assert.match(markup, /Show Heather gray T-shirt/);
  assert.match(markup, /Show White T-shirt/);
  assert.match(markup, /aria-pressed="true"/);
  assert.doesNotMatch(markup, />Resources</);
  assert.doesNotMatch(markup, />Features</);
  assert.doesNotMatch(markup, />Sign in</);
  assert.doesNotMatch(markup, /Explore templates/);
  assert.doesNotMatch(markup, />Pricing</);
});
