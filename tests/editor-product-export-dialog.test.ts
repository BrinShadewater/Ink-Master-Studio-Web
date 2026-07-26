import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ProductExportDialog,
  getProductExportSummary,
} from '../components/editor/ProductExportDialog';
import { createEditorAsset, createEditorProject } from '../editor/model';
import { findTShirtProduct } from '../editor/productModel';

test('Product export dialog presents the fixed production and proof PNG presets', () => {
  const asset = createEditorAsset('export-dialog', new Blob(['source'], { type: 'image/png' }), {
    name: 'source.png', width: 100, height: 100,
  });
  const project = createEditorProject('Export dialog', asset);
  const variation = project.variations[0];
  const product = findTShirtProduct(project.productVariants, variation.id);
  product.mockupSlug = 'white';
  product.printMethod = 'dtf';
  product.placement = { x: 0.28, y: 0.27, scale: 0.32, rotation: 0 };
  const markup = renderToStaticMarkup(createElement(ProductExportDialog, {
    open: true,
    projectName: project.name,
    variation,
    product,
    assetsById: { [asset.id]: asset },
    returnFocusRef: createRef<HTMLButtonElement>(),
    onClose: () => undefined,
  }));
  assert.deepEqual(getProductExportSummary(product, variation, 'printify-full-front'), {
    garment: 'White',
    method: 'DTF transfer',
    artwork: 'Original',
    printSize: '15 x 18 in',
    placement: '32% size, 28% across, 27% down',
  });
  assert.match(markup, /Print-ready PNG/);
  assert.match(markup, /Production summary/);
  assert.match(markup, /DTF transfer/);
  assert.match(markup, /Exporting a PNG keeps your cleaned raster artwork and transparency intact/);
  assert.match(markup, /Printify Full Front/);
  assert.match(markup, /4500 x 5400 px, 300 DPI, 15 x 18 in/);
  assert.match(markup, /Standard Tee/);
  assert.match(markup, /Draft Proof/);
  assert.match(markup, /Proof only/);
  assert.match(markup, /15 x 18 in/);
  assert.match(markup, /3000 x 3600 px, 300 DPI, 10 x 12 in/);
  assert.match(markup, /Create PNG/);
  assert.match(markup, /role="radiogroup"/);
  assert.match(markup, /class="[^"]*h-11[^"]*w-11[^"]*"[^>]*aria-label="Close export"/);
  assert.match(markup, /class="[^"]*h-11[^"]*"[^>]*>.*Create PNG/);
});
