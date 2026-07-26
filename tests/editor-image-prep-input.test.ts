import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  composeImagePrepInput,
  encodeRgbaPng,
  resolveImagePrepSize,
} from '../editor/imagePrepInput';
import {
  createDefaultBackgroundRemoval,
  createImagePrepFingerprint,
  convertCleanupCorrectionsToSource,
  normalizeCleanupCorrectionDocument,
} from '../editor/imagePrepModel';
import type { ImageLayer } from '../editor/model';

class FakeCanvasContext {
  filter = 'none';
  readonly clearCalls: number[][] = [];
  readonly drawCalls: unknown[][] = [];
  readonly putCalls: Array<{ imageData: ImageData; x: number; y: number }> = [];

  constructor(private readonly outputPixels: Uint8ClampedArray) {}

  clearRect(...values: number[]) {
    this.clearCalls.push(values);
  }

  drawImage(...values: unknown[]) {
    this.drawCalls.push(values);
  }

  getImageData(_x: number, _y: number, width: number, height: number): ImageData {
    assert.equal(this.outputPixels.length, width * height * 4);
    return { width, height, data: new Uint8ClampedArray(this.outputPixels) } as ImageData;
  }

  createImageData(width: number, height: number): ImageData {
    return {
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    } as ImageData;
  }

  putImageData(imageData: ImageData, x: number, y: number) {
    this.putCalls.push({ imageData, x, y });
  }
}

class FakeCanvas {
  width = 0;
  height = 0;
  blobResult: Blob | null = new Blob(['png'], { type: 'image/png' });

  constructor(readonly context: FakeCanvasContext) {}

  getContext(type: string) {
    return type === '2d' ? this.context : null;
  }

  toBlob(callback: BlobCallback, type?: string) {
    assert.equal(type, 'image/png');
    callback(this.blobResult);
  }
}

const createLayer = (): ImageLayer => ({
  id: 'layer_image',
  type: 'image',
  name: 'Image',
  assetId: 'asset_source',
  visible: true,
  opacity: 1,
  transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, flipX: false, flipY: false },
  crop: { x: 0.1, y: 0.25, width: 0.5, height: 0.5 },
  adjustments: { brightness: 10, contrast: -20, saturation: 30 },
  backgroundRemoval: {
    ...createDefaultBackgroundRemoval(),
    enabled: true,
    correctionAssetId: 'asset_corrections',
  },
});

test('resolves contain dimensions through the 2048-pixel processing bound', () => {
  assert.deepEqual(resolveImagePrepSize({ width: 5000, height: 2500 }), {
    width: 2048,
    height: 1024,
  });
  assert.deepEqual(resolveImagePrepSize({ width: 1000, height: 500 }), {
    width: 1000,
    height: 500,
  });
  assert.deepEqual(resolveImagePrepSize({ width: 1000.4, height: 500.2 }), {
    width: 1000,
    height: 500,
  });
  assert.throws(() => resolveImagePrepSize({ width: 0, height: 10 }), /Invalid image preparation size/);
});

test('composes the full source with adjustments before returning straight-alpha pixels', () => {
  const pixels = new Uint8ClampedArray(1000 * 800 * 4);
  pixels.set([10, 20, 30, 0]);
  pixels.set([40, 50, 60, 255], 4);
  const context = new FakeCanvasContext(pixels);
  const canvas = new FakeCanvas(context);
  const image = { source: true } as unknown as CanvasImageSource;
  const layer = createLayer();

  const result = composeImagePrepInput(
    canvas as unknown as HTMLCanvasElement,
    image,
    { width: 1000, height: 800 },
    layer,
    'asset_corrections',
  );

  assert.equal(canvas.width, 1000);
  assert.equal(canvas.height, 800);
  assert.deepEqual(context.clearCalls, [[0, 0, 1000, 800]]);
  assert.equal(context.filter, 'brightness(110%) contrast(80%) saturate(130%)');
  assert.deepEqual(context.drawCalls, [[
    image,
    0,
    0,
    1000,
    800,
    0,
    0,
    1000,
    800,
  ]]);
  assert.deepEqual([...result.frame.pixels.slice(0, 8)], [10, 20, 30, 0, 40, 50, 60, 255]);
  assert.notStrictEqual(result.frame.pixels, pixels);
  assert.deepEqual(result.sourceFrame, {
    sourceWidth: 1000,
    sourceHeight: 800,
    crop: layer.crop,
  });
  assert.equal(result.inputFingerprint, createImagePrepFingerprint({
    ...layer,
    correctionDigest: 'asset_corrections',
  }));
  assert.equal(result.inputFingerprint, createImagePrepFingerprint(layer));
});

test('bounds the uncropped source dimensions for non-destructive preparation', () => {
  const layer = createLayer();
  layer.crop = { x: 0.2, y: 0.2, width: 0.25, height: 0.5 };
  const expectedWidth = 2048;
  const expectedHeight = 1024;
  const context = new FakeCanvasContext(
    new Uint8ClampedArray(expectedWidth * expectedHeight * 4),
  );
  const canvas = new FakeCanvas(context);

  composeImagePrepInput(
    canvas as unknown as HTMLCanvasElement,
    {} as CanvasImageSource,
    { width: 5000, height: 2500 },
    layer,
    'digest',
  );

  assert.equal(canvas.width, expectedWidth);
  assert.equal(canvas.height, expectedHeight);
  assert.deepEqual(context.drawCalls[0].slice(1), [
    0,
    0,
    5000,
    2500,
    0,
    0,
    2048,
    1024,
  ]);
});

test('fingerprints every semantic preparation input stably', () => {
  const layer = createLayer();
  const source = { ...layer, correctionDigest: 'asset_corrections' };
  const fingerprint = createImagePrepFingerprint(source);
  assert.match(fingerprint, /^prep:v2:/);
  assert.equal(fingerprint, createImagePrepFingerprint(structuredClone(source)));
  assert.equal(
    createImagePrepFingerprint({ ...source, crop: { ...source.crop, x: 0.2 } }),
    fingerprint,
  );

  const changes = [
    { ...source, assetId: 'asset_other' },
    { ...source, adjustments: { ...source.adjustments, contrast: 4 } },
    {
      ...source,
      backgroundRemoval: { ...source.backgroundRemoval, tolerance: 40 },
    },
    {
      ...source,
      backgroundRemoval: {
        ...source.backgroundRemoval,
        mode: 'picked' as const,
        picks: [{ color: '#123456', point: { x: 0.2, y: 0.3 } }],
      },
    },
    {
      ...source,
      backgroundRemoval: {
        ...source.backgroundRemoval,
        correctionAssetId: 'asset_other_corrections',
      },
    },
  ];
  for (const changed of changes) {
    assert.notEqual(createImagePrepFingerprint(changed), fingerprint);
  }
});

test('migrates legacy crop-local corrections only when a new source-space correction is saved', () => {
  const storedLegacy = {
    schemaVersion: 1 as const,
    strokes: [{ mode: 'erase' as const, size: 32, points: [{ x: 0.5, y: 0.5 }] }],
  };
  const source = convertCleanupCorrectionsToSource(
    normalizeCleanupCorrectionDocument(storedLegacy),
    { x: 0.2, y: 0.1, width: 0.4, height: 0.6 },
  );
  assert.equal(storedLegacy.schemaVersion, 1);
  assert.deepEqual(source.strokes[0].points[0], { x: 0.4, y: 0.4 });

  const rewritten = normalizeCleanupCorrectionDocument({
    schemaVersion: 2,
    sourceCrop: source.sourceCrop,
    strokes: [
      ...source.strokes,
      { mode: 'restore', size: 24, points: [{ x: 0.7, y: 0.8 }] },
    ],
  });
  assert.equal(rewritten.schemaVersion, 2);
  assert.deepEqual(rewritten.strokes.map(({ points }) => points[0]), [
    { x: 0.4, y: 0.4 },
    { x: 0.7, y: 0.8 },
  ]);
});

test('encodes exact RGBA bytes as PNG and rejects a null browser result', async () => {
  const frame = {
    width: 2,
    height: 1,
    pixels: new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]),
  };
  const context = new FakeCanvasContext(new Uint8ClampedArray());
  const canvas = new FakeCanvas(context);

  const blob = await encodeRgbaPng(canvas as unknown as HTMLCanvasElement, frame);
  assert.equal(blob.type, 'image/png');
  assert.equal(canvas.width, 2);
  assert.equal(canvas.height, 1);
  assert.deepEqual([...context.putCalls[0].imageData.data], [...frame.pixels]);
  assert.deepEqual([context.putCalls[0].x, context.putCalls[0].y], [0, 0]);

  canvas.blobResult = null;
  await assert.rejects(
    encodeRgbaPng(canvas as unknown as HTMLCanvasElement, frame),
    /Could not encode prepared image/,
  );
});
