import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ProductCanvas,
  createProductCanvasPointerState,
  resolveProductCanvasPointerPlacement,
  type ProductCanvasProps,
} from '../components/editor/ProductCanvas';
import { getTShirtMockup } from '../editor/productCatalog';
import { createEditorAsset, createEditorProject } from '../editor/model';
import { findTShirtProduct } from '../editor/productModel';
import type { LookRenderCoordinator } from '../editor/lookRenderCoordinator';

const createProps = (
  overrides: Partial<ProductCanvasProps> = {},
): ProductCanvasProps => {
  const asset = createEditorAsset('project-product-canvas', new Blob(['source']), {
    name: 'source.png',
    width: 1000,
    height: 1000,
  });
  const project = createEditorProject('Product canvas', asset);
  const variation = project.variations[0];
  return {
    projectId: project.id,
    variation,
    product: findTShirtProduct(project.productVariants, variation.id),
    displayedMockup: getTShirtMockup('black'),
    mockupStatus: 'ready',
    mockupError: null,
    assetsById: { [asset.id]: asset },
    imagesById: {},
    coordinator: {} as LookRenderCoordinator,
    artworkRetryGeneration: 0,
    onArtworkFailureChange: () => undefined,
    onPlacementChange: () => undefined,
    onPlacementEnd: () => undefined,
    onRetry: () => undefined,
    onReturnToDesign: () => undefined,
    ...overrides,
  };
};

test('renders a labeled photographic shirt, transparent artwork, and resize control', () => {
  const markup = renderToStaticMarkup(createElement(ProductCanvas, createProps()));
  assert.match(markup, /aria-label="T-shirt product preview"/);
  assert.match(markup, /alt="Black T-shirt"/);
  assert.match(markup, /aria-label="Product artwork"/);
  assert.match(markup, /aria-label="Resize product artwork"/);
  assert.match(markup, /data-product-artwork="true"/);
  assert.match(markup, /data-product-print="garment-blended"/);
  assert.match(markup, /mix-blend-mode:multiply/);
});

test('announces initial loading and exposes recovery for initial shirt failure', () => {
  const loading = renderToStaticMarkup(createElement(ProductCanvas, createProps({
    displayedMockup: null,
    mockupStatus: 'pending',
  })));
  assert.match(loading, /role="status"/);
  assert.match(loading, /Loading Black shirt/);

  const failed = renderToStaticMarkup(createElement(ProductCanvas, createProps({
    displayedMockup: null,
    mockupStatus: 'failed',
    mockupError: 'Black shirt preview is unavailable.',
  })));
  assert.match(failed, /role="alert"/);
  assert.match(failed, /Black shirt preview is unavailable/);
  assert.match(failed, />Retry</);
  assert.match(failed, />Return to design</);
});

test('resolves immutable move pointer state through normalized product geometry', () => {
  const placement = { x: 0.5, y: 0.5, scale: 0.72, rotation: 0 };
  const state = createProductCanvasPointerState(
    7,
    'move',
    { x: 200, y: 200 },
    placement,
    { x: 100, y: 100, width: 320, height: 440 },
  );
  const resolved = resolveProductCanvasPointerPlacement(state, { x: 232, y: 156 });

  assert.deepEqual(resolved, { ...placement, x: 0.6, y: 0.4 });
  assert.deepEqual(placement, { x: 0.5, y: 0.5, scale: 0.72, rotation: 0 });
  assert.notEqual(state.startPlacement, placement);
});

test('resolves resize pointer state without changing position or rotation', () => {
  const placement = { x: 0.5, y: 0.5, scale: 0.72, rotation: 90 };
  const region = { x: 100, y: 200, width: 320, height: 440 };
  const state = createProductCanvasPointerState(
    9,
    'resize',
    { x: 0, y: 0 },
    placement,
    region,
  );
  const resolved = resolveProductCanvasPointerPlacement(state, { x: 260, y: 580 });

  assert.deepEqual(resolved, { ...placement, scale: 1 });
  assert.deepEqual(state.regionRect, region);
  assert.notEqual(state.regionRect, region);
});
