import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import createPica from 'pica';
import { getTraceLayerDrawRect } from '../editor/geometry';
import { createDefaultBackgroundRemoval } from '../editor/imagePrepModel';
import { createDefaultLook } from '../editor/lookModel';
import type {
  DesignLayer,
  ImageLayer,
  TextLayer,
  TraceLayer,
} from '../editor/model';
import { createDefaultTraceSettings } from '../editor/traceModel';
import {
  renderTShirtExport,
  type TShirtExportRendererDependencies,
} from '../editor/tshirtExportRenderer';
import type {
  TShirtExportAssetSnapshot,
  TShirtPngExportSnapshot,
} from '../editor/tshirtExportProtocol';

const edge = 1500;
const outputHeight = 1800;

interface FakeBitmap {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  closed: boolean;
  close(): void;
}

interface DrawRecord {
  canvas: FakeCanvas;
  image: CanvasImageSource;
  args: number[];
  alpha: number;
  filter: string;
  operations: unknown[][];
}

interface TextRecord {
  canvas: FakeCanvas;
  text: string;
  font: string;
}

class FakeCanvas {
  readonly id: number;
  readonly initialWidth: number;
  readonly initialHeight: number;
  disposed = false;
  getImageDataCalls = 0;
  putImageDataCalls = 0;
  pixels: Uint8ClampedArray;
  readonly context: FakeContext;
  private currentWidth: number;
  private currentHeight: number;

  constructor(
    id: number,
    width: number,
    height: number,
    records: FakeRecords,
  ) {
    this.id = id;
    this.initialWidth = width;
    this.initialHeight = height;
    this.currentWidth = width;
    this.currentHeight = height;
    this.pixels = new Uint8ClampedArray(width * height * 4);
    this.context = new FakeContext(this, records);
  }

  get width() {
    return this.currentWidth;
  }

  set width(value: number) {
    this.currentWidth = value;
    this.disposed ||= value === 0;
    this.resetPixels();
  }

  get height() {
    return this.currentHeight;
  }

  set height(value: number) {
    this.currentHeight = value;
    this.disposed ||= value === 0;
    this.resetPixels();
  }

  getContext(contextId: string) {
    return contextId === '2d' ? this.context : null;
  }

  private resetPixels() {
    this.pixels = new Uint8ClampedArray(this.currentWidth * this.currentHeight * 4);
  }
}

interface FakeRecords {
  canvases: FakeCanvas[];
  decoded: TShirtExportAssetSnapshot[];
  bitmaps: FakeBitmap[];
  draws: DrawRecord[];
  resizeCalls: Array<{
    source: FakeCanvas;
    destination: FakeCanvas;
    destinationWidth: number;
    destinationHeight: number;
    options: { filter: 'lanczos3' };
    pixels: Uint8ClampedArray;
  }>;
  texts: TextRecord[];
}

class FakeContext {
  globalAlpha = 1;
  filter = 'none';
  font = '';
  fillStyle: string | CanvasGradient | CanvasPattern = '#000000';
  strokeStyle: string | CanvasGradient | CanvasPattern = '#000000';
  lineWidth = 1;
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  direction: CanvasDirection = 'inherit';
  readonly operations: unknown[][] = [];
  private readonly stack: Array<{
    globalAlpha: number;
    filter: string;
    font: string;
    fillStyle: string | CanvasGradient | CanvasPattern;
    strokeStyle: string | CanvasGradient | CanvasPattern;
    lineWidth: number;
    textAlign: CanvasTextAlign;
    textBaseline: CanvasTextBaseline;
    direction: CanvasDirection;
  }> = [];

  constructor(
    private readonly canvas: FakeCanvas,
    private readonly records: FakeRecords,
  ) {}

  save() {
    this.stack.push({
      globalAlpha: this.globalAlpha,
      filter: this.filter,
      font: this.font,
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      textAlign: this.textAlign,
      textBaseline: this.textBaseline,
      direction: this.direction,
    });
    this.operations.push(['save']);
  }

  restore() {
    const state = this.stack.pop();
    if (state) Object.assign(this, state);
    this.operations.push(['restore']);
  }

  translate(x: number, y: number) {
    this.operations.push(['translate', x, y]);
  }

  rotate(radians: number) {
    this.operations.push(['rotate', radians]);
  }

  scale(x: number, y: number) {
    this.operations.push(['scale', x, y]);
  }

  clearRect() {
    this.canvas.pixels.fill(0);
  }

  drawImage(image: CanvasImageSource, ...args: number[]) {
    this.records.draws.push({
      canvas: this.canvas,
      image,
      args,
      alpha: this.globalAlpha,
      filter: this.filter,
      operations: this.operations.map((operation) => [...operation]),
    });
    const source = image as unknown as FakeCanvas | FakeBitmap;
    const sourcePixels = source.pixels;
    if (!sourcePixels?.length || this.canvas.pixels.length === 0) return;
    const sourceAlpha = Math.round(sourcePixels[3] * this.globalAlpha);
    this.canvas.pixels[0] = sourcePixels[0];
    this.canvas.pixels[1] = sourcePixels[1];
    this.canvas.pixels[2] = sourcePixels[2];
    this.canvas.pixels[3] = sourceAlpha;
  }

  measureText(value: string) {
    return {
      width: value.length * 10,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: value.length * 10,
    } as TextMetrics;
  }

  fillText(value: string) {
    this.records.texts.push({ canvas: this.canvas, text: value, font: this.font });
    this.canvas.pixels[0] = 12;
    this.canvas.pixels[1] = 34;
    this.canvas.pixels[2] = 56;
    this.canvas.pixels[3] = 255;
  }

  strokeText(value: string) {
    this.records.texts.push({ canvas: this.canvas, text: value, font: this.font });
  }

  getImageData(_x: number, _y: number, width: number, height: number) {
    this.canvas.getImageDataCalls += 1;
    const data = new Uint8ClampedArray(width * height * 4);
    data.set(this.canvas.pixels.subarray(0, data.length));
    return { data, width, height } as ImageData;
  }

  putImageData(imageData: ImageData) {
    this.canvas.putImageDataCalls += 1;
    this.canvas.pixels.set(imageData.data.subarray(0, this.canvas.pixels.length));
  }
}

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
  transform: transform(),
  crop: { x: 0, y: 0, width: 1, height: 1 },
  adjustments: { brightness: 0, contrast: 0, saturation: 0 },
  backgroundRemoval: createDefaultBackgroundRemoval(),
  ...overrides,
});

const textLayer = (overrides: Partial<TextLayer> = {}): TextLayer => ({
  id: 'text-layer',
  type: 'text',
  name: 'Text',
  visible: true,
  opacity: 1,
  transform: transform({ x: 0.3 }),
  text: 'INK',
  fontFamily: 'Arial',
  fontSize: 48,
  color: '#123456',
  align: 'left',
  letterSpacing: 0,
  outlineWidth: 0,
  outlineColor: '#000000',
  ...overrides,
});

const traceLayer = (overrides: Partial<TraceLayer> = {}): TraceLayer => ({
  id: 'trace-layer',
  type: 'trace',
  name: 'Trace',
  sourceLayerId: 'original-layer',
  svgAssetId: 'trace',
  visible: true,
  opacity: 0.8,
  transform: transform({ x: 0.7, scale: 0.75 }),
  settings: createDefaultTraceSettings(),
  sourceFingerprint: 'trace-current',
  sourceFrame: {
    sourceWidth: 400,
    sourceHeight: 200,
    crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 },
  },
  ...overrides,
});

const asset = (
  id: string,
  width: number,
  height: number,
  options: {
    name?: string;
    mimeType?: string;
    role?: TShirtExportAssetSnapshot['role'];
    bytes?: Uint8Array;
  } = {},
): TShirtExportAssetSnapshot => {
  const bytes = options.bytes ?? new Uint8Array([id.charCodeAt(0)]);
  return {
    id,
    name: options.name ?? `${id}.png`,
    mimeType: options.mimeType ?? 'image/png',
    width,
    height,
    role: options.role ?? null,
    bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
};

const traceAsset = asset('trace', 400, 200, {
  name: 'trace.svg',
  mimeType: 'image/svg+xml',
  role: 'trace-svg',
  bytes: new TextEncoder().encode(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">' +
    '<path fill="#ff0000" d="M0 0L400 0L400 200L0 200Z"/></svg>',
  ),
});

const snapshot = (
  layers: DesignLayer[],
  assets: TShirtExportAssetSnapshot[],
  overrides: Partial<TShirtPngExportSnapshot> = {},
): TShirtPngExportSnapshot => ({
  requestId: 1,
  fingerprint: 'tshirt-export:fixture',
  presetId: 'draft-proof',
  variation: {
    id: 'variation',
    name: 'Original',
    layers,
    selectedLayerId: layers[0]?.id ?? '',
    look: createDefaultLook('original', 0x12345678),
  },
  placement: { x: 0.3, y: 0.6, scale: 0.8, rotation: 30 },
  assets,
  ...overrides,
});

const createHarness = (
  options: {
    failCanvasAt?: number;
    failDecodeId?: string;
    bitmapPixels?: Record<string, Uint8ClampedArray>;
  } = {},
) => {
  const records: FakeRecords = {
    canvases: [],
    decoded: [],
    bitmaps: [],
    draws: [],
    resizeCalls: [],
    texts: [],
  };
  let canvasCalls = 0;
  const dependencies: TShirtExportRendererDependencies = {
    createCanvas(width, height) {
      canvasCalls += 1;
      if (canvasCalls === options.failCanvasAt) throw new Error('fake canvas failure');
      const canvas = new FakeCanvas(canvasCalls, width, height, records);
      records.canvases.push(canvas);
      return canvas as unknown as OffscreenCanvas;
    },
    async decodeBitmap(input) {
      records.decoded.push(input);
      if (input.id === options.failDecodeId) throw new Error('fake decode failure');
      const pixels = options.bitmapPixels?.[input.id] ??
        new Uint8ClampedArray([input.id === 'prepared' ? 0 : 255, 0, 0, 128]);
      const bitmap: FakeBitmap = {
        width: input.width,
        height: input.height,
        pixels,
        closed: false,
        close() {
          this.closed = true;
        },
      };
      records.bitmaps.push(bitmap);
      return bitmap as unknown as ImageBitmap;
    },
    async resize(sourceValue, destinationValue, resizeOptions) {
      const source = sourceValue as unknown as FakeCanvas;
      const destination = destinationValue as unknown as FakeCanvas;
      const sourcePixels = source.pixels;
      for (let index = 0; index < destination.pixels.length; index += 4) {
        destination.pixels[index] = sourcePixels[0];
        destination.pixels[index + 1] = sourcePixels[1];
        destination.pixels[index + 2] = sourcePixels[2];
        destination.pixels[index + 3] = sourcePixels[3];
      }
      records.resizeCalls.push({
        source,
        destination,
        destinationWidth: destination.width,
        destinationHeight: destination.height,
        options: resizeOptions,
        pixels: new Uint8ClampedArray(destination.pixels),
      });
      return destinationValue;
    },
    traceXmlPlatform: {
      DOMParser: DOMParser as unknown as new () => globalThis.DOMParser,
      XMLSerializer: XMLSerializer as unknown as new () => globalThis.XMLSerializer,
    },
  };
  return { dependencies, records };
};

test('renders authoritative raster, text, and sanitized trace content on the preset-width square', async () => {
  const original = imageLayer('original-layer', 'original', {
    name: 'Original artwork',
    crop: { x: 0.1, y: 0.2, width: 0.6, height: 0.5 },
    adjustments: { brightness: 20, contrast: -10, saturation: 35 },
  });
  const prepared = imageLayer('prepared-layer', 'source-prepared', {
    name: 'Prepared artwork',
    crop: { x: 0.2, y: 0.1, width: 0.5, height: 0.7 },
    adjustments: { brightness: -30, contrast: 40, saturation: -50 },
    backgroundRemoval: {
      ...createDefaultBackgroundRemoval(),
      enabled: true,
      preparedAssetId: 'prepared',
    },
  });
  const trace = traceLayer();
  const fixture = snapshot(
    [original, prepared, textLayer(), trace],
    [
      asset('original', 100, 50),
      asset('source-prepared', 80, 120),
      asset('prepared', 400, 420, { role: 'prepared-image' }),
      traceAsset,
      asset('mockup', 400, 500, { name: 'black-shirt-mockup.jpg' }),
    ],
  );
  const { dependencies, records } = createHarness();

  const rendered = await renderTShirtExport(fixture, dependencies);
  const output = rendered.canvas as unknown as FakeCanvas;
  const master = records.canvases.find(({ initialWidth, initialHeight }) =>
    initialWidth === edge && initialHeight === edge);
  assert.ok(master, 'canonical master canvas');
  assert.deepEqual(records.decoded.slice(0, 2).map(({ id }) => id), ['original', 'prepared']);
  assert.ok(records.decoded.every(({ name }) => !/shirt|mockup/i.test(name)));
  assert.ok(records.resizeCalls.length >= 2);
  for (const { options } of records.resizeCalls) {
    assert.deepEqual(options, { filter: 'lanczos3' });
  }
  assert.equal(records.resizeCalls[0].source.context.filter,
    'brightness(120%) contrast(90%) saturate(135%)');
  assert.equal(records.resizeCalls[1].source.context.filter, 'none');

  assert.ok(records.texts.some(({ canvas, text, font }) =>
    canvas === master && text === 'I' && font === '72px Arial'));
  const expectedTrace = getTraceLayerDrawRect(trace.sourceFrame, {
    width: edge,
    height: edge,
  }, trace.transform);
  const decodedTrace = records.decoded.find(({ id }) => id === 'trace');
  assert.ok(decodedTrace);
  assert.deepEqual(
    { width: decodedTrace.width, height: decodedTrace.height },
    { width: Math.ceil(expectedTrace.width), height: Math.ceil(expectedTrace.height) },
  );
  assert.match(new TextDecoder().decode(decodedTrace.bytes), /fill="#ff0000"/);

  const placementDraw = records.draws.find(({ canvas, image }) =>
    canvas === output && image === master as unknown as CanvasImageSource);
  assert.ok(placementDraw);
  assert.deepEqual(placementDraw.args, [-600, -600, 1200, 1200]);
  assert.deepEqual(placementDraw.operations.slice(-2), [
    ['translate', 450, 1080],
    ['rotate', Math.PI / 6],
  ]);
  assert.deepEqual(
    { width: output.width, height: output.height },
    { width: edge, height: outputHeight },
  );
  const alpha = rendered.metadata.alpha;
  assert.equal(
    alpha.transparentPixels + alpha.translucentPixels + alpha.opaquePixels,
    edge * outputHeight,
  );
  assert.equal(rendered.metadata.largestRasterLayerName, 'Original artwork');
  assert.match(rendered.metadata.pixelDigest, /^[0-9a-f]{8}$/);
  assert.equal(output.getImageDataCalls, 1, 'final output alpha is read once');
  assert.ok(records.bitmaps.every(({ closed }) => closed), 'every decoded bitmap closes');
  assert.ok(records.canvases.filter((canvas) => canvas !== output)
    .every(({ disposed }) => disposed), 'temporary canvases are released');
});

test('preserves transparent red RGB through enlargement and repeats seeded pixel digests', async () => {
  const fixture = snapshot(
    [imageLayer('edge-layer', 'edge', { name: 'Transparent red edge' })],
    [asset('edge', 2, 1)],
    {
      variation: {
        id: 'variation',
        name: 'Distressed',
        layers: [imageLayer('edge-layer', 'edge', { name: 'Transparent red edge' })],
        selectedLayerId: 'edge-layer',
        look: createDefaultLook('vintage-ink', 0x98765432),
      },
    },
  );
  const pixels = new Uint8ClampedArray([
    255, 0, 0, 255,
    255, 0, 0, 64,
  ]);
  const firstHarness = createHarness({ bitmapPixels: { edge: pixels } });
  const secondHarness = createHarness({ bitmapPixels: { edge: pixels } });

  const first = await renderTShirtExport(fixture, firstHarness.dependencies);
  const second = await renderTShirtExport(structuredClone(fixture), secondHarness.dependencies);

  const enlarged = firstHarness.records.resizeCalls[0];
  assert.ok(enlarged.destinationWidth > 2);
  for (let index = 0; index < enlarged.pixels.length; index += 4) {
    if (enlarged.pixels[index + 3] === 0) continue;
    assert.deepEqual([...enlarged.pixels.subarray(index, index + 3)], [255, 0, 0]);
  }
  assert.equal(first.metadata.pixelDigest, second.metadata.pixelDigest);
});

test('pica 10.0.2 Lanczos3 preserves colored RGB across a transparent edge', async () => {
  const resizer = createPica({
    tile: 1024,
    concurrency: 1,
    features: ['js', 'wasm'],
  });
  const source = new Uint8Array([
    255, 0, 0, 255,
    255, 0, 0, 128,
    255, 0, 0, 0,
  ]);

  const output = await resizer.resizeBuffer({
    src: source,
    width: 3,
    height: 1,
    toWidth: 24,
    toHeight: 8,
    filter: 'lanczos3',
  });

  let covered = 0;
  for (let index = 0; index < output.length; index += 4) {
    if (output[index + 3] === 0) continue;
    covered += 1;
    assert.ok(output[index] >= 240, `red channel at ${index / 4}`);
    assert.equal(output[index + 1], 0, `green fringe at ${index / 4}`);
    assert.equal(output[index + 2], 0, `blue fringe at ${index / 4}`);
  }
  assert.ok(covered > 0);
});

test('falls back to original raster authority when a requested prepared asset is absent', async () => {
  const fixture = snapshot(
    [
      imageLayer('fallback-layer', 'source', {
        adjustments: { brightness: 10, contrast: 20, saturation: 30 },
        backgroundRemoval: {
          ...createDefaultBackgroundRemoval(),
          enabled: true,
          preparedAssetId: 'missing-prepared',
        },
      }),
    ],
    [asset('source', 20, 10)],
  );
  const { dependencies, records } = createHarness();

  await renderTShirtExport(fixture, dependencies);

  assert.deepEqual(records.decoded.map(({ id }) => id), ['source']);
  assert.equal(
    records.resizeCalls[0].source.context.filter,
    'brightness(110%) contrast(120%) saturate(130%)',
  );
});

test('prepares only rotated visible raster and trace regions at canonical pixel density', async () => {
  const oversizedTrace = traceLayer({
    transform: transform({ scale: 20, rotation: 45 }),
  });
  const fixture = snapshot(
    [
      imageLayer('oversized-raster', 'source', {
        transform: transform({ scale: 20, rotation: -30 }),
      }),
      oversizedTrace,
    ],
    [asset('source', 100, 50), traceAsset],
  );
  const { dependencies, records } = createHarness();

  const rendered = await renderTShirtExport(fixture, dependencies);

  const rasterResize = records.resizeCalls[0];
  const rasterVisibleSpan = edge * (
    Math.abs(Math.cos(Math.PI / 6)) + Math.abs(Math.sin(Math.PI / 6))
  );
  assert.equal(rasterResize.destinationWidth, Math.ceil(rasterVisibleSpan));
  assert.equal(rasterResize.destinationHeight, Math.ceil(rasterVisibleSpan));
  const rasterCropDraw = records.draws.find(({ canvas }) =>
    canvas === rasterResize.source);
  assert.ok(rasterCropDraw);
  assert.ok(rasterCropDraw.args[2] < 10, 'only visible source width is cropped');
  assert.ok(rasterCropDraw.args[3] < 20, 'only visible source height is cropped');

  const master = records.canvases.find(({ initialWidth, initialHeight }) =>
    initialWidth === edge && initialHeight === edge);
  assert.ok(master);
  const rasterComposite = records.draws.find(({ canvas, image }) =>
    canvas === master &&
    image === rasterResize.destination as unknown as CanvasImageSource);
  assert.ok(rasterComposite, 'resized visible raster is composed directly');
  assert.equal(rasterComposite.args[6], rasterVisibleSpan);
  assert.equal(rasterComposite.args[7], rasterVisibleSpan);
  assert.deepEqual(rasterComposite.operations.slice(-3), [
    ['translate', edge / 2, edge / 2],
    ['rotate', -Math.PI / 6],
    ['scale', 1, 1],
  ]);

  const decodedTrace = records.decoded.find(({ id }) => id === 'trace');
  assert.ok(decodedTrace);
  const traceVisibleSpan = Math.SQRT2 * edge;
  assert.equal(decodedTrace.width, Math.ceil(traceVisibleSpan));
  assert.equal(decodedTrace.height, Math.ceil(traceVisibleSpan));
  const traceDocument = new DOMParser().parseFromString(
    new TextDecoder().decode(decodedTrace.bytes),
    'image/svg+xml',
  );
  const viewBox = traceDocument.documentElement.getAttribute('viewBox')
    ?.split(/\s+/).map(Number);
  assert.ok(viewBox);
  assert.ok(viewBox[2] < 100, 'trace viewBox contains only visible source width');
  assert.ok(viewBox[3] < 100, 'trace viewBox contains only visible source height');
  const traceBitmap = records.bitmaps.find(({ width, height }) =>
    width === decodedTrace.width && height === decodedTrace.height);
  assert.ok(traceBitmap);
  const traceComposite = records.draws.find(({ canvas, image }) =>
    canvas === master && image === traceBitmap as unknown as CanvasImageSource);
  assert.ok(traceComposite, 'decoded visible trace is composed directly');
  assert.ok(Math.abs(traceComposite.args[6] - traceVisibleSpan) < 1e-9);
  assert.ok(Math.abs(traceComposite.args[7] - traceVisibleSpan) < 1e-9);
  assert.deepEqual(traceComposite.operations.slice(-3), [
    ['translate', edge / 2, edge / 2],
    ['rotate', Math.PI / 4],
    ['scale', 1, 1],
  ]);

  const maximumVisibleEdge = Math.ceil(Math.SQRT2 * edge);
  assert.ok(records.canvases.slice(1, -1).every(({ initialWidth, initialHeight }) =>
    initialWidth <= maximumVisibleEdge && initialHeight <= maximumVisibleEdge));
  assert.ok(rendered.metadata.largestRasterScale > 100);
});

test('decode and canvas failures close bitmaps and dispose every created canvas', async () => {
  const fixture = snapshot(
    [
      imageLayer('first', 'first'),
      imageLayer('second', 'second'),
    ],
    [asset('first', 10, 10), asset('second', 10, 10)],
  );
  const decodeFailure = createHarness({ failDecodeId: 'second' });
  await assert.rejects(
    renderTShirtExport(fixture, decodeFailure.dependencies),
    /fake decode failure/,
  );
  assert.ok(decodeFailure.records.bitmaps.every(({ closed }) => closed));
  assert.ok(decodeFailure.records.canvases.every(({ disposed }) => disposed));

  const canvasFailure = createHarness({ failCanvasAt: 4 });
  await assert.rejects(
    renderTShirtExport(fixture, canvasFailure.dependencies),
    /fake canvas failure/,
  );
  assert.ok(canvasFailure.records.bitmaps.every(({ closed }) => closed));
  assert.ok(canvasFailure.records.canvases.every(({ disposed }) => disposed));
});
