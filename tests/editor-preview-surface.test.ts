import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createDecodedImageController,
  getCurrentDecodedImages,
  type DecodedImageEntry,
} from '../editor/decodedImages';
import { createDefaultLook } from '../editor/lookModel';
import { createDefaultBackgroundRemoval } from '../editor/imagePrepModel';
import type { LookRenderOutcome } from '../editor/lookRenderCoordinator';
import type { RgbaFrame } from '../editor/lookProcessor';
import type { DesignLayer, DesignVariation, EditorAsset, ImageLayer, TraceLayer } from '../editor/model';
import { createDefaultTraceSettings } from '../editor/traceModel';
import {
  canRetainReadyPreviewFrame,
  composeBoundedVariationFrame,
  resolveBoundedPixelSize,
  selectPreviewOutcomeFrame,
} from '../components/editor/VariationPreviewCanvas';
import * as previewSurface from '../components/editor/VariationPreviewCanvas';

const image = (id: string) => ({ id } as unknown as CanvasImageSource);

const transform: ImageLayer['transform'] = {
  x: 0.5,
  y: 0.5,
  scale: 1,
  rotation: 0,
  flipX: false,
  flipY: false,
};

const imageLayer = (
  id: string,
  assetId: string,
  overrides: Partial<ImageLayer> = {},
): ImageLayer => ({
  id,
  type: 'image',
  name: id,
  assetId,
  visible: true,
  opacity: 1,
  transform,
  crop: { x: 0, y: 0, width: 1, height: 1 },
  adjustments: { brightness: 0, contrast: 0, saturation: 0 },
  backgroundRemoval: createDefaultBackgroundRemoval(),
  ...overrides,
});

const asset = (id: string, width = 800, height = 600): EditorAsset => ({
  id,
  projectId: 'project-preview',
  name: `${id}.png`,
  mimeType: 'image/png',
  width,
  height,
  createdAt: 1,
  blob: new Blob([id]),
});

const variation = (
  layers: DesignLayer[],
  overrides: Partial<DesignVariation> = {},
): DesignVariation => ({
  id: 'variation-preview',
  name: 'Preview',
  layers,
  selectedLayerId: layers[0]?.id ?? '',
  look: createDefaultLook('original'),
  ...overrides,
});

class PreviewContext {
  globalAlpha = 1;
  filter = 'none';
  clearCount = 0;
  fillCount = 0;
  operations: string[] = [];

  setTransform() { this.operations.push('reset-transform'); }
  clearRect() {
    this.clearCount += 1;
    this.operations.push('clear');
  }
  fillRect() { this.fillCount += 1; }
  save() {}
  restore() {}
  scale() {}
  translate() {}
  rotate() {}
  drawImage() {}
  getImageData(_x: number, _y: number, width: number, height: number) {
    return { data: new Uint8ClampedArray(width * height * 4) } as ImageData;
  }
}

const createCanvas = () => {
  const context = new PreviewContext();
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
  } as unknown as HTMLCanvasElement;
  return { canvas, context };
};

const compose = (
  design: DesignVariation,
  assetsById: Record<string, EditorAsset>,
  imagesById: Record<string, DecodedImageEntry>,
  viewport = { width: 500, height: 400 },
) => {
  const { canvas, context } = createCanvas();
  const result = composeBoundedVariationFrame(canvas, {
    variation: design,
    assetsById,
    imagesById,
    viewport,
    pixelRatio: 2,
    maxPixelDimension: 1600,
  });
  return { result, context };
};

test('filters decoded entries against current prop URLs before controller synchronization', () => {
  const oldImage = image('old');
  const decoded: Record<string, DecodedImageEntry> = {
    asset: { url: 'blob:first', image: oldImage },
  };

  assert.deepEqual(getCurrentDecodedImages(decoded, { asset: 'blob:first' }), { asset: oldImage });
  assert.deepEqual(getCurrentDecodedImages(decoded, { asset: 'blob:second' }), {});
  assert.deepEqual(getCurrentDecodedImages(decoded, {}), {});
});

test('decodes each active URL once and keeps old callbacks unusable across prop and lifecycle replay windows', () => {
  const created: Array<{
    src: string;
    onload: (() => void) | null;
    onerror: (() => void) | null;
  }> = [];
  const publications: Array<Record<string, DecodedImageEntry>> = [];
  const controller = createDecodedImageController(
    () => {
      const next = { src: '', onload: null, onerror: null };
      created.push(next);
      return next as unknown as HTMLImageElement;
    },
    (images) => publications.push(images),
  );

  controller.sync({ asset: 'blob:first' });
  const staleLoad = created[0].onload!;
  staleLoad();
  assert.equal(publications.at(-1)?.asset.url, 'blob:first');
  assert.equal(publications.at(-1)?.asset.image, created[0] as unknown as CanvasImageSource);

  const replacementProps = { asset: 'blob:second' };
  assert.deepEqual(getCurrentDecodedImages(publications.at(-1)!, replacementProps), {});
  staleLoad();
  assert.deepEqual(getCurrentDecodedImages(publications.at(-1)!, replacementProps), {});

  controller.sync({ asset: 'blob:first' });
  assert.equal(created.length, 1);

  controller.sync({ asset: 'blob:second' });
  assert.equal(created.length, 2);
  const publicationsAfterReplacementSync = publications.length;
  staleLoad();
  assert.equal(publications.length, publicationsAfterReplacementSync);

  created[1].onload!();
  assert.equal(publications.at(-1)?.asset.url, 'blob:second');
  assert.equal(publications.at(-1)?.asset.image, created[1] as unknown as CanvasImageSource);
  controller.dispose();

  controller.sync({ asset: 'blob:second' });
  assert.equal(created.length, 3);
  created[2].onload!();
  assert.equal(publications.at(-1)?.asset.url, 'blob:second');
  assert.equal(publications.at(-1)?.asset.image, created[2] as unknown as CanvasImageSource);
});

test('bounds composed pixel dimensions without changing aspect ratio', () => {
  assert.deepEqual(
    resolveBoundedPixelSize({ width: 1400, height: 900 }, 2, 1600),
    { width: 1600, height: 1029 },
  );
  assert.deepEqual(
    resolveBoundedPixelSize({ width: 390, height: 500 }, 2, 1600),
    { width: 780, height: 1000 },
  );
});

test('waits for every visible image and ignores hidden missing images', () => {
  const visible = imageLayer('visible', 'asset-visible');
  const secondVisible = imageLayer('second', 'asset-second');
  const hidden = imageLayer('hidden', 'asset-hidden', { visible: false });
  const assetsById = {
    'asset-visible': asset('asset-visible'),
    'asset-second': asset('asset-second'),
  };
  const oneDecoded = {
    'asset-visible': { url: 'blob:visible', image: image('visible') },
  };

  assert.equal(compose(variation([visible, secondVisible]), assetsById, oneDecoded).result, null);
  const composed = compose(variation([visible, hidden]), assetsById, oneDecoded);
  assert.ok(composed.result);
  assert.equal(composed.context.clearCount, 1);
  assert.equal(composed.context.fillCount, 0);
  assert.deepEqual(composed.context.operations.slice(0, 2), ['reset-transform', 'clear']);

  const prepared = imageLayer('prepared', 'asset-visible', {
    backgroundRemoval: {
      ...createDefaultBackgroundRemoval(),
      enabled: true,
      preparedAssetId: 'asset-prepared',
      inputFingerprint: 'prepared-input',
    },
  });
  assert.ok(compose(variation([prepared]), {
    'asset-visible': asset('asset-visible'),
    'asset-prepared': asset('asset-prepared'),
  }, {
    'asset-prepared': { url: 'blob:prepared', image: image('prepared') },
  }).result);
});

test('waits for a visible trace SVG and composes it through the shared preview surface', () => {
  const trace: TraceLayer = {
    id: 'trace-layer',
    type: 'trace',
    name: 'Trace',
    sourceLayerId: 'source-layer',
    svgAssetId: 'trace-asset',
    visible: true,
    opacity: 1,
    transform,
    settings: createDefaultTraceSettings(),
    sourceFingerprint: 'trace-source',
    sourceFrame: {
      sourceWidth: 800,
      sourceHeight: 600,
      crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    },
  };
  const design = variation([trace]);
  const traceAsset = {
    ...asset('trace-asset', 640, 480),
    mimeType: 'image/svg+xml',
    role: 'trace-svg' as const,
  };

  assert.equal(compose(design, { 'trace-asset': traceAsset }, {}).result, null);
  assert.ok(compose(
    design,
    { 'trace-asset': traceAsset },
    { 'trace-asset': { url: 'blob:trace', image: image('trace') } },
  ).result);
  assert.ok(compose(
    variation([{ ...trace, visible: false }]),
    {},
    {},
  ).result);
});

test('render keys use stable design identity and exclude replacement object URLs', () => {
  const baseLayer = imageLayer('layer-a', 'asset-a');
  const baseVariation = variation([baseLayer]);
  const assetsById = { 'asset-a': asset('asset-a') };
  const first = compose(baseVariation, assetsById, {
    'asset-a': { url: 'blob:first', image: image('first') },
  }).result!;
  const replacementUrl = compose(baseVariation, assetsById, {
    'asset-a': { url: 'blob:replacement', image: image('replacement') },
  }).result!;
  const changedLayer = compose(variation([{ ...baseLayer, opacity: 0.5 }]), assetsById, {
    'asset-a': { url: 'blob:first', image: image('first') },
  }).result!;
  const changedAsset = compose(variation([imageLayer('layer-a', 'asset-b')]), {
    'asset-b': asset('asset-b'),
  }, {
    'asset-b': { url: 'blob:asset-b', image: image('asset-b') },
  }).result!;
  const changedDimensions = compose(baseVariation, assetsById, {
    'asset-a': { url: 'blob:first', image: image('first') },
  }, { width: 600, height: 400 }).result!;
  const changedSourceDimensions = compose(baseVariation, {
    'asset-a': asset('asset-a', 801, 600),
  }, {
    'asset-a': { url: 'blob:first', image: image('first') },
  }).result!;
  const changedLook = compose(variation([baseLayer], {
    look: createDefaultLook('monochrome'),
  }), assetsById, {
    'asset-a': { url: 'blob:first', image: image('first') },
  }).result!;
  const preparedLayer = imageLayer('layer-a', 'asset-a', {
    backgroundRemoval: {
      ...createDefaultBackgroundRemoval(),
      enabled: true,
      preparedAssetId: 'asset-prepared',
      inputFingerprint: 'prepared-input',
    },
  });
  const changedPrepared = compose(variation([preparedLayer]), {
    ...assetsById,
    'asset-prepared': asset('asset-prepared'),
  }, {
    'asset-a': { url: 'blob:first', image: image('first') },
    'asset-prepared': { url: 'blob:prepared', image: image('prepared') },
  }).result!;

  assert.match(first.renderKey, /^variation-preview:/);
  assert.equal(replacementUrl.renderKey, first.renderKey);
  for (const changed of [
    changedLayer,
    changedAsset,
    changedDimensions,
    changedSourceDimensions,
    changedLook,
    changedPrepared,
  ]) {
    assert.notEqual(changed.renderKey, first.renderKey);
  }
  assert.doesNotMatch(first.renderKey, /blob:/);
});

const frame = (value: number): RgbaFrame => ({
  width: 1,
  height: 1,
  pixels: new Uint8ClampedArray([value, value, value, 255]),
});

test('preview outcome selection ignores stale work and preserves the last ready frame on current failure', () => {
  const fallback = frame(10);
  const ready = frame(20);
  const stale: LookRenderOutcome = { status: 'stale', renderKey: 'variation-preview:old' };
  const failed: LookRenderOutcome = {
    status: 'failed',
    renderKey: 'variation-preview:current',
    message: 'Look preview failed.',
  };

  assert.equal(selectPreviewOutcomeFrame(stale, 'variation-preview:current', fallback, ready), null);
  assert.deepEqual(selectPreviewOutcomeFrame(failed, 'variation-preview:current', fallback, null), {
    displayFrame: fallback,
    readyFrame: null,
    failure: 'Look preview failed.',
  });
  assert.deepEqual(selectPreviewOutcomeFrame(failed, 'variation-preview:current', fallback, ready), {
    displayFrame: ready,
    readyFrame: ready,
    failure: 'Look preview failed.',
  });
});

test('retains a ready frame only for the same variation and bounded dimensions', () => {
  const ready = frame(1);
  const authority = { variationId: 'variation-a', width: ready.width, height: ready.height };
  assert.equal(canRetainReadyPreviewFrame(authority, 'variation-a', ready), true);
  assert.equal(canRetainReadyPreviewFrame(authority, 'variation-b', ready), false);
  assert.equal(canRetainReadyPreviewFrame(authority, 'variation-a', {
    ...ready,
    width: ready.width + 1,
  }), false);
  assert.equal(canRetainReadyPreviewFrame(null, 'variation-a', ready), false);
});

test('preview failure authority clears for normal work and survives only a same-key Retry', () => {
  type FailureAuthority = { renderKey: string; message: string } | null;
  type FailureEvent =
    | { type: 'clear' }
    | { type: 'start'; renderKey: string; retry: boolean }
    | { type: 'outcome'; expectedRenderKey: string; outcome: LookRenderOutcome };
  const reduceFailure = (previewSurface as unknown as {
    reducePreviewFailureAuthority?: (
      current: FailureAuthority,
      event: FailureEvent,
    ) => FailureAuthority;
  }).reducePreviewFailureAuthority;
  assert.equal(typeof reduceFailure, 'function');
  if (!reduceFailure) return;

  const failedA: LookRenderOutcome = {
    status: 'failed',
    renderKey: 'variation-preview:key-a',
    message: 'Look preview failed.',
  };
  const failedB: LookRenderOutcome = {
    status: 'failed',
    renderKey: 'variation-preview:key-b',
    message: 'Look preview failed.',
  };
  let authority = reduceFailure(null, {
    type: 'outcome',
    expectedRenderKey: 'variation-preview:key-a',
    outcome: failedA,
  });
  assert.deepEqual(authority, {
    renderKey: 'variation-preview:key-a',
    message: 'Look preview failed.',
  });

  const retainedForRetry = reduceFailure(authority, {
    type: 'start',
    renderKey: 'variation-preview:key-a',
    retry: true,
  });
  assert.strictEqual(retainedForRetry, authority);
  authority = reduceFailure(retainedForRetry, {
    type: 'start',
    renderKey: 'variation-preview:key-a',
    retry: false,
  });
  assert.equal(authority, null);

  authority = reduceFailure({
    renderKey: 'variation-preview:key-a',
    message: 'Look preview failed.',
  }, {
    type: 'start',
    renderKey: 'variation-preview:key-b',
    retry: false,
  });
  assert.equal(authority, null);
  authority = reduceFailure(authority, {
    type: 'outcome',
    expectedRenderKey: 'variation-preview:key-b',
    outcome: failedA,
  });
  assert.equal(authority, null);
  authority = reduceFailure(authority, {
    type: 'outcome',
    expectedRenderKey: 'variation-preview:key-b',
    outcome: { status: 'stale', renderKey: 'variation-preview:key-a' },
  });
  assert.equal(authority, null);
  assert.deepEqual(reduceFailure(authority, {
    type: 'outcome',
    expectedRenderKey: 'variation-preview:key-b',
    outcome: failedB,
  }), {
    renderKey: 'variation-preview:key-b',
    message: 'Look preview failed.',
  });
  assert.equal(reduceFailure({
    renderKey: 'variation-preview:key-b',
    message: 'Look preview failed.',
  }, { type: 'clear' }), null);
});
