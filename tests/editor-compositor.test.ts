import assert from 'node:assert/strict';
import { test } from 'node:test';
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
  align: CanvasTextAlign;
  baseline: CanvasTextBaseline;
  direction: CanvasDirection;
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
  direction: CanvasDirection = 'inherit';
  operations: unknown[][] = [];
  draws: DrawRecord[] = [];
  textDraws: TextRecord[] = [];
  measured: string[] = [];
  private textStateStack: Array<{
    font: string;
    textAlign: CanvasTextAlign;
    textBaseline: CanvasTextBaseline;
    direction: CanvasDirection;
  }> = [];

  save() {
    this.textStateStack.push({
      font: this.font,
      textAlign: this.textAlign,
      textBaseline: this.textBaseline,
      direction: this.direction,
    });
    this.operations.push(['save']);
  }
  restore() {
    this.operations.push(['restore']);
    const state = this.textStateStack.pop();
    if (!state) return;
    this.font = state.font;
    this.textAlign = state.textAlign;
    this.textBaseline = state.textBaseline;
    this.direction = state.direction;
  }
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
    const widths: Record<string, number> = { A: 20, B: 30, C: 25, i: 1 };
    const width = widths[value] ?? value.length * 10;
    return {
      width,
      actualBoundingBoxLeft: value === 'i' ? 0.25 : 0,
      actualBoundingBoxRight: value === 'i' ? 0.75 : width,
    } as TextMetrics;
  }
  fillText(value: string, x: number, y: number) {
    this.textDraws.push({
      kind: 'fill', text: value, x, y, font: this.font, color: this.fillStyle,
      lineWidth: this.lineWidth, alpha: this.globalAlpha, align: this.textAlign,
      baseline: this.textBaseline, direction: this.direction,
    });
  }
  strokeText(value: string, x: number, y: number) {
    this.textDraws.push({
      kind: 'stroke', text: value, x, y, font: this.font, color: this.strokeStyle,
      lineWidth: this.lineWidth, alpha: this.globalAlpha, align: this.textAlign,
      baseline: this.textBaseline, direction: this.direction,
    });
  }
}

class AlignmentSensitiveContext extends RecordingContext {
  override measureText(value: string) {
    const metrics = super.measureText(value);
    if (this.textAlign === 'center') {
      return {
        ...metrics,
        actualBoundingBoxLeft: metrics.width / 2,
        actualBoundingBoxRight: metrics.width / 2,
      } as TextMetrics;
    }
    if (this.textAlign === 'right') {
      return {
        ...metrics,
        actualBoundingBoxLeft: metrics.width,
        actualBoundingBoxRight: 0,
      } as TextMetrics;
    }
    return metrics;
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
    x: 193,
    y: 78,
    width: 114,
    height: 244,
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
      { kind: 'stroke', text: 'A', x: -27.5, y: -10 },
      { kind: 'fill', text: 'A', x: -27.5, y: -10 },
      { kind: 'stroke', text: 'B', x: -2.5, y: -10 },
      { kind: 'fill', text: 'B', x: -2.5, y: -10 },
      { kind: 'stroke', text: 'C', x: 2.5, y: 50 },
      { kind: 'fill', text: 'C', x: 2.5, y: 50 },
    ],
  );
  assert.ok(context.textDraws.every(({ font }) => font === '50px Georgia'));
  assert.ok(context.textDraws.every(({ alpha }) => alpha === 0.7));
  assert.ok(context.textDraws.filter(({ kind }) => kind === 'stroke')
    .every(({ color, lineWidth }) => color === '#abcdef' && lineWidth === 2));
  assert.ok(context.textDraws.filter(({ kind }) => kind === 'fill')
    .every(({ color }) => color === '#123456'));
});

const negativeSpacingCases: Array<{ align: TextLayer['align']; firstX: number }> = [
  { align: 'left', firstX: -10.25 },
  { align: 'center', firstX: 0.75 },
  { align: 'right', firstX: 11.75 },
];

for (const { align, firstX } of negativeSpacingCases) {
  test(`keeps narrow negative-spaced multiline glyphs inside ${align}-aligned bounds`, () => {
    const context = new RecordingContext();
    const layer = textLayer(`negative-${align}`, {
      text: 'iii\nC',
      fontSize: 100,
      letterSpacing: -2,
      outlineWidth: 2,
      align,
    });
    const viewport = { width: 1000, height: 1000 };

    assert.deepEqual(getTextLayerBounds(asContext(context), viewport, layer), {
      x: 486.5,
      y: 379,
      width: 27,
      height: 242,
    });
    renderDesignLayers(asContext(context), viewport, [layer], { metadataById: {}, imagesById: {} });

    assert.deepEqual(
      context.textDraws.filter(({ kind }) => kind === 'fill').map(({ text, x, y }) => ({ text, x, y })),
      [
        { text: 'i', x: firstX, y: -20 },
        { text: 'i', x: firstX - 1, y: -20 },
        { text: 'i', x: firstX - 2, y: -20 },
        { text: 'C', x: -12.5, y: 100 },
      ],
    );
    assert.equal(hitTestDesignLayers(
      asContext(context), { x: 486.5, y: 500 }, viewport, [layer], { metadataById: {}, imagesById: {} },
    )?.id, layer.id);
    assert.equal(hitTestDesignLayers(
      asContext(context), { x: 486.4, y: 500 }, viewport, [layer], { metadataById: {}, imagesById: {} },
    ), null);
  });
}

test('text bounds, rendering, and hit testing ignore prior context alignment without leaking text state', () => {
  const viewport = { width: 1000, height: 1000 };
  const layer = textLayer('alignment-state', { text: 'AB', fontSize: 100, align: 'center' });
  const results = (['left', 'center', 'right'] as const).map((priorAlign) => {
    const context = new AlignmentSensitiveContext();
    context.font = '13px Legacy';
    context.textAlign = priorAlign;
    context.textBaseline = 'bottom';
    context.direction = 'rtl';
    const assertPriorState = () => assert.deepEqual(
      {
        font: context.font,
        textAlign: context.textAlign,
        textBaseline: context.textBaseline,
        direction: context.direction,
      },
      { font: '13px Legacy', textAlign: priorAlign, textBaseline: 'bottom', direction: 'rtl' },
    );

    const bounds = getTextLayerBounds(asContext(context), viewport, layer);
    assertPriorState();
    renderDesignLayers(asContext(context), viewport, [layer], { metadataById: {}, imagesById: {} });
    assertPriorState();
    const inside = hitTestDesignLayers(
      asContext(context), { x: 475, y: 500 }, viewport, [layer], { metadataById: {}, imagesById: {} },
    )?.id ?? null;
    const outside = hitTestDesignLayers(
      asContext(context), { x: 474.9, y: 500 }, viewport, [layer], { metadataById: {}, imagesById: {} },
    )?.id ?? null;
    assertPriorState();

    return {
      bounds,
      draws: context.textDraws.filter(({ kind }) => kind === 'fill')
        .map(({ text, x, y, align, baseline, direction }) => ({ text, x, y, align, baseline, direction })),
      inside,
      outside,
    };
  });

  const expected = {
    bounds: { x: 475, y: 440, width: 50, height: 120 },
    draws: [
      { text: 'A', x: -25, y: 40, align: 'left', baseline: 'alphabetic', direction: 'ltr' },
      { text: 'B', x: -5, y: 40, align: 'left', baseline: 'alphabetic', direction: 'ltr' },
    ],
    inside: layer.id,
    outside: null,
  };
  assert.deepEqual(results, [expected, expected, expected]);
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
