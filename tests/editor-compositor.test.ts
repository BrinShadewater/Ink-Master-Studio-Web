import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDecodedImageController } from '../components/editor/EditorCanvas';
import {
  getTextLayerBounds,
  hitTestDesignLayers,
  renderDesignLayers,
  type CompositorAssets,
} from '../editor/compositor';
import { moveTransformByViewportDelta, type Size } from '../editor/geometry';
import type { DesignLayer, ImageLayer, TextLayer } from '../editor/model';

const transform = (
  overrides: Partial<ImageLayer['transform']> = {},
): ImageLayer['transform'] => ({
  x: 0.5,
  y: 0.5,
  scale: 1,
  rotation: 0,
  flipX: false,
  flipY: false,
  ...overrides,
});

const imageLayer = (id: string, assetId: string, overrides: Partial<ImageLayer> = {}): ImageLayer => ({
  id,
  type: 'image',
  name: id,
  assetId,
  visible: true,
  opacity: 1,
  transform: transform(),
  crop: { x: 0, y: 0, width: 1, height: 1 },
  adjustments: { brightness: 0, contrast: 0, saturation: 0 },
  ...overrides,
});

const textLayer = (id: string, overrides: Partial<TextLayer> = {}): TextLayer => ({
  id,
  type: 'text',
  name: id,
  visible: true,
  opacity: 1,
  transform: transform(),
  text: 'Text',
  fontFamily: 'Arial',
  fontSize: 48,
  color: '#000000',
  align: 'left',
  letterSpacing: 0,
  outlineWidth: 0,
  outlineColor: '#000000',
  ...overrides,
});

interface DrawRecord {
  image: CanvasImageSource;
  args: number[];
  alpha: number;
  filter: string;
  operations: unknown[][];
}

interface TextRecord {
  kind: 'fill' | 'stroke';
  text: string;
  x: number;
  y: number;
  font: string;
  color: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  alpha: number;
}

class RecordingContext {
  globalAlpha = 1;
  filter = 'none';
  font = '';
  fillStyle: string | CanvasGradient | CanvasPattern = '#000000';
  strokeStyle: string | CanvasGradient | CanvasPattern = '#000000';
  lineWidth = 1;
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  operations: unknown[][] = [];
  draws: DrawRecord[] = [];
  textDraws: TextRecord[] = [];
  measured: string[] = [];

  save() { this.operations.push(['save']); }
  restore() { this.operations.push(['restore']); }
  translate(x: number, y: number) { this.operations.push(['translate', x, y]); }
  rotate(radians: number) { this.operations.push(['rotate', radians]); }
  scale(x: number, y: number) { this.operations.push(['scale', x, y]); }
  drawImage(image: CanvasImageSource, ...args: number[]) {
    this.draws.push({
      image,
      args,
      alpha: this.globalAlpha,
      filter: this.filter,
      operations: this.operations.map((operation) => [...operation]),
    });
  }
  measureText(value: string) {
    this.measured.push(value);
    const widths: Record<string, number> = { A: 20, B: 30, C: 25 };
    return { width: widths[value] ?? value.length * 10 } as TextMetrics;
  }
  fillText(value: string, x: number, y: number) {
    this.textDraws.push({
      kind: 'fill', text: value, x, y, font: this.font, color: this.fillStyle,
      lineWidth: this.lineWidth, alpha: this.globalAlpha,
    });
  }
  strokeText(value: string, x: number, y: number) {
    this.textDraws.push({
      kind: 'stroke', text: value, x, y, font: this.font, color: this.strokeStyle,
      lineWidth: this.lineWidth, alpha: this.globalAlpha,
    });
  }
}

const asContext = (context: RecordingContext) => context as unknown as CanvasRenderingContext2D;
const image = (id: string) => ({ id }) as unknown as CanvasImageSource;

test('renders image layers bottom-to-top with independent crop, transform, opacity, and adjustments', () => {
  const context = new RecordingContext();
  const bottomImage = image('bottom');
  const topImage = image('top');
  const assets: CompositorAssets = {
    metadataById: {
      bottom: { width: 400, height: 200 },
      top: { width: 200, height: 400 },
      hidden: { width: 100, height: 100 },
      missing: { width: 100, height: 100 },
    },
    imagesById: { bottom: bottomImage, top: topImage, hidden: image('hidden') },
  };
  const layers: DesignLayer[] = [
    imageLayer('bottom-layer', 'bottom', {
      opacity: 0.6,
      transform: transform({ x: 0.25, y: 0.75, scale: 0.5, rotation: 90, flipX: true }),
      crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 },
      adjustments: { brightness: 20, contrast: -10, saturation: 35 },
    }),
    imageLayer('hidden-layer', 'hidden', { visible: false }),
    imageLayer('missing-layer', 'missing'),
    imageLayer('top-layer', 'top', {
      opacity: 0.8,
      transform: transform({ x: 0.75, y: 0.25, scale: 1.25, rotation: -15, flipY: true }),
      crop: { x: 0.2, y: 0.1, width: 0.6, height: 0.7 },
      adjustments: { brightness: -5, contrast: 15, saturation: -20 },
    }),
  ];

  renderDesignLayers(asContext(context), { width: 1000, height: 800 }, layers, assets);

  assert.deepEqual(context.draws.map(({ image: drawnImage }) => drawnImage), [bottomImage, topImage]);
  assert.deepEqual(context.draws[0].args, [40, 40, 200, 100, -115, -57.5, 230, 115]);
  assert.equal(context.draws[0].alpha, 0.6);
  assert.equal(context.draws[0].filter, 'brightness(120%) contrast(90%) saturate(135%)');
  assert.deepEqual(context.draws[0].operations.slice(-3), [
    ['translate', 250, 600],
    ['rotate', Math.PI / 2],
    ['scale', -1, 1],
  ]);
  assert.equal(context.draws[1].alpha, 0.8);
  assert.equal(context.draws[1].filter, 'brightness(95%) contrast(115%) saturate(80%)');
});

test('measures and renders multiline text with reference scaling, outline, alignment, and explicit spacing', () => {
  const context = new RecordingContext();
  const layer = textLayer('text', {
    text: 'AB\nC',
    fontFamily: 'Georgia',
    fontSize: 100,
    color: '#123456',
    align: 'right',
    letterSpacing: 10,
    outlineWidth: 4,
    outlineColor: '#abcdef',
    opacity: 0.7,
    transform: transform({ x: 0.5, y: 0.25, scale: 2, rotation: 30, flipX: true }),
  });
  const viewport = { width: 500, height: 800 };

  assert.deepEqual(getTextLayerBounds(asContext(context), viewport, layer), {
    x: 191,
    y: 76,
    width: 118,
    height: 248,
  });
  context.measured = [];
  renderDesignLayers(asContext(context), viewport, [layer], { metadataById: {}, imagesById: {} });

  assert.deepEqual(context.measured, ['A', 'B', 'C']);
  assert.deepEqual(context.operations.slice(-5), [
    ['save'],
    ['translate', 250, 200],
    ['rotate', Math.PI / 6],
    ['scale', -2, 2],
    ['restore'],
  ]);
  assert.deepEqual(
    context.textDraws.map(({ kind, text, x, y }) => ({ kind, text, x, y })),
    [
      { kind: 'stroke', text: 'A', x: -27.5, y: -30 },
      { kind: 'fill', text: 'A', x: -27.5, y: -30 },
      { kind: 'stroke', text: 'B', x: -2.5, y: -30 },
      { kind: 'fill', text: 'B', x: -2.5, y: -30 },
      { kind: 'stroke', text: 'C', x: 2.5, y: 30 },
      { kind: 'fill', text: 'C', x: 2.5, y: 30 },
    ],
  );
  assert.ok(context.textDraws.every(({ font }) => font === '50px Georgia'));
  assert.ok(context.textDraws.every(({ alpha }) => alpha === 0.7));
  assert.ok(context.textDraws.filter(({ kind }) => kind === 'stroke')
    .every(({ color, lineWidth }) => color === '#abcdef' && lineWidth === 2));
  assert.ok(context.textDraws.filter(({ kind }) => kind === 'fill')
    .every(({ color }) => color === '#123456'));
});

test('hit tests visible layers in reverse paint order and ignores missing image assets', () => {
  const context = new RecordingContext();
  const viewport = { width: 1000, height: 1000 };
  const bottom = imageLayer('bottom', 'bottom');
  const missing = imageLayer('missing', 'missing');
  const top = textLayer('top', { text: 'A', fontSize: 200, align: 'center' });
  const assets: CompositorAssets = {
    metadataById: { bottom: { width: 500, height: 500 }, missing: { width: 500, height: 500 } },
    imagesById: { bottom: image('bottom') },
  };

  assert.equal(hitTestDesignLayers(asContext(context), { x: 500, y: 500 }, viewport, [bottom, missing, top], assets)?.id, 'top');
  assert.equal(hitTestDesignLayers(
    asContext(context), { x: 500, y: 500 }, viewport,
    [bottom, missing, { ...top, visible: false }], assets,
  )?.id, 'bottom');
});

test('moves the topmost hit layer using viewport-normalized drag deltas', () => {
  const context = new RecordingContext();
  const viewport: Size = { width: 1000, height: 500 };
  const bottom = imageLayer('bottom', 'bottom');
  const top = imageLayer('top', 'top', { transform: transform({ x: 0.4, y: 0.6 }) });
  const assets: CompositorAssets = {
    metadataById: { bottom: { width: 500, height: 500 }, top: { width: 500, height: 500 } },
    imagesById: { bottom: image('bottom'), top: image('top') },
  };
  const hit = hitTestDesignLayers(asContext(context), { x: 400, y: 300 }, viewport, [bottom, top], assets);

  assert.equal(hit?.id, 'top');
  assert.deepEqual(moveTransformByViewportDelta(hit!.transform, 100, -50, viewport), {
    ...top.transform,
    x: 0.5,
    y: 0.5,
  });
});

test('decodes each active URL once and ignores stale load callbacks without revoking borrowed URLs', () => {
  const created: Array<{
    src: string;
    onload: (() => void) | null;
    onerror: (() => void) | null;
  }> = [];
  const publications: Array<Record<string, CanvasImageSource>> = [];
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
  controller.sync({ asset: 'blob:first' });
  assert.equal(created.length, 1);

  controller.sync({ asset: 'blob:second' });
  assert.equal(created.length, 2);
  staleLoad();
  assert.deepEqual(publications.at(-1), {});

  created[1].onload!();
  assert.equal(publications.at(-1)?.asset, created[1] as unknown as CanvasImageSource);
  controller.dispose();

  controller.sync({ asset: 'blob:second' });
  assert.equal(created.length, 3);
  created[2].onload!();
  assert.equal(publications.at(-1)?.asset, created[2] as unknown as CanvasImageSource);
});
