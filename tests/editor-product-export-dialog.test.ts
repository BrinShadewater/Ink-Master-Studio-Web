import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProductExportDialog } from '../components/editor/ProductExportDialog';
import { createEditorAsset, createEditorProject } from '../editor/model';
import { findTShirtProduct } from '../editor/productModel';

test('Product export dialog presents the fixed production and proof PNG presets', () => {
  const asset = createEditorAsset('export-dialog', new Blob(['source'], { type: 'image/png' }), {
    name: 'source.png', width: 100, height: 100,
  });
  const project = createEditorProject('Export dialog', asset);
  const variation = project.variations[0];
  const markup = renderToStaticMarkup(createElement(ProductExportDialog, {
    open: true,
    projectName: project.name,
    variation,
    product: findTShirtProduct(project.productVariants, variation.id),
    assetsById: { [asset.id]: asset },
    returnFocusRef: createRef<HTMLButtonElement>(),
    onClose: () => undefined,
  }));
  assert.match(markup, /T-shirt PNG/);
  assert.match(markup, /Printify Full Front/);
  assert.match(markup, /4500 x 5400 px, 300 DPI, 15 x 18 in/);
  assert.match(markup, /Standard Tee/);
  assert.match(markup, /Draft Proof/);
  assert.match(markup, /Proof only/);
  assert.match(markup, /15 x 18 in/);
  assert.match(markup, /3000 x 3600 px, 300 DPI, 10 x 12 in/);
  assert.match(markup, /Generate PNG/);
  assert.match(markup, /role="radiogroup"/);
});
