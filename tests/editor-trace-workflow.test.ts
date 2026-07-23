import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  composeTraceFrame,
  hasSameTraceGeometrySettings,
  hasCurrentPreparedTraceInput,
} from '../components/editor/useTraceWorkflow';
import {
  createDefaultBackgroundRemoval,
  createImagePrepFingerprint,
} from '../editor/imagePrepModel';
import type { ImageLayer } from '../editor/model';
import { createDefaultTraceSettings } from '../editor/traceModel';

class TraceFrameContext {
  filter = 'none';
  drawArgs: number[] = [];
  clearRect() {}
  drawImage(_image: CanvasImageSource, ...args: number[]) {
    this.drawArgs = args;
  }
  getImageData(_x: number, _y: number, width: number, height: number) {
    return { data: new Uint8ClampedArray(width * height * 4) } as ImageData;
  }
}

const createCanvas = () => {
  const context = new TraceFrameContext();
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
  } as unknown as HTMLCanvasElement;
  return { canvas, context };
};

const layer: ImageLayer = {
  id: 'source-layer',
  type: 'image',
  name: 'Source',
  assetId: 'source-asset',
  visible: true,
  opacity: 0.8,
  transform: {
    x: 0.5, y: 0.5, scale: 1, rotation: 0, flipX: false, flipY: false,
  },
  crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 },
  adjustments: { brightness: 20, contrast: -10, saturation: 35 },
  backgroundRemoval: createDefaultBackgroundRemoval(),
};

test('bounds adjusted cropped source pixels to 1280 while retaining source geometry', () => {
  const { canvas, context } = createCanvas();
  const input = composeTraceFrame(
    canvas,
    {} as CanvasImageSource,
    { width: 4000, height: 2000 },
    { width: 4000, height: 2000 },
    layer,
    false,
  );

  assert.deepEqual(
    { width: input.frame.width, height: input.frame.height },
    { width: 1280, height: 640 },
  );
  assert.deepEqual(context.drawArgs, [400, 400, 2000, 1000, 0, 0, 1280, 640]);
  assert.equal(context.filter, 'brightness(120%) contrast(90%) saturate(135%)');
  assert.deepEqual(input.sourceFrame, {
    sourceWidth: 4000,
    sourceHeight: 2000,
    crop: layer.crop,
  });
});

test('uses the complete prepared cleanup output without applying adjustments twice', () => {
  const { canvas, context } = createCanvas();
  const input = composeTraceFrame(
    canvas,
    {} as CanvasImageSource,
    { width: 1600, height: 1200 },
    { width: 4000, height: 2000 },
    layer,
    true,
  );

  assert.deepEqual(
    { width: input.frame.width, height: input.frame.height },
    { width: 1280, height: 960 },
  );
  assert.deepEqual(context.drawArgs, [0, 0, 1600, 1200, 0, 0, 1280, 960]);
  assert.equal(context.filter, 'none');
});

test('blocks tracing while cleanup settings are newer than the retained prepared output', () => {
  const enabled = {
    ...layer,
    backgroundRemoval: {
      ...layer.backgroundRemoval,
      enabled: true,
      preparedAssetId: 'prepared',
      inputFingerprint: 'stale',
    },
  };
  assert.equal(hasCurrentPreparedTraceInput(enabled), false);
  enabled.backgroundRemoval.inputFingerprint =
    createImagePrepFingerprint(enabled);
  assert.equal(hasCurrentPreparedTraceInput(enabled), true);
});

test('distinguishes palette-only trace edits from geometry changes', () => {
  const settings = createDefaultTraceSettings();
  assert.equal(hasSameTraceGeometrySettings(
    settings,
    { ...settings, palette: ['#112233', '#ffffff'] },
  ), true);
  assert.equal(hasSameTraceGeometrySettings(
    settings,
    { ...settings, detail: settings.detail + 1 },
  ), false);
});
