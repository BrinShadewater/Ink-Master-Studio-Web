import type { RgbaFrame } from './backgroundRemovalProcessor';
import {
  buildCanvasFilter,
  getCroppedSourceRect,
  type Size,
} from './geometry';
import { createImagePrepFingerprint } from './imagePrepModel';
import type { ImageLayer } from './model';
import type { TraceSourceFrame } from './traceModel';

const MAX_IMAGE_PREP_EDGE = 2_048;
const COMPOSITION_ERROR = 'Could not prepare image.';
const ENCODING_ERROR = 'Could not encode prepared image.';

export interface ComposedImagePrepInput {
  frame: RgbaFrame;
  sourceFrame: TraceSourceFrame;
  inputFingerprint: string;
}

const isUsableSize = ({ width, height }: Size) =>
  Number.isFinite(width) &&
  Number.isFinite(height) &&
  width > 0 &&
  height > 0;

export const resolveImagePrepSize = (source: Size): Size => {
  if (!isUsableSize(source)) throw new Error('Invalid image preparation size.');
  const scale = Math.min(1, MAX_IMAGE_PREP_EDGE / Math.max(source.width, source.height));
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  };
};

export const composeImagePrepInput = (
  canvas: HTMLCanvasElement,
  image: CanvasImageSource,
  source: Size,
  layer: ImageLayer,
  correctionDigest: string,
): ComposedImagePrepInput => {
  if (!isUsableSize(source)) throw new Error(COMPOSITION_ERROR);
  const crop = getCroppedSourceRect(source, layer.crop);
  if (!isUsableSize(crop)) throw new Error(COMPOSITION_ERROR);
  const output = resolveImagePrepSize(crop);
  canvas.width = output.width;
  canvas.height = output.height;
  const context = canvas.getContext('2d', {
    alpha: true,
    colorSpace: 'srgb',
    willReadFrequently: true,
  });
  if (!context) throw new Error(COMPOSITION_ERROR);

  context.clearRect(0, 0, output.width, output.height);
  context.filter = buildCanvasFilter(layer.adjustments);
  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    output.width,
    output.height,
  );
  const imageData = context.getImageData(0, 0, output.width, output.height);
  return {
    frame: {
      width: output.width,
      height: output.height,
      pixels: new Uint8ClampedArray(imageData.data),
    },
    sourceFrame: {
      sourceWidth: source.width,
      sourceHeight: source.height,
      crop: structuredClone(layer.crop),
    },
    inputFingerprint: createImagePrepFingerprint({
      ...layer,
      correctionDigest,
    }),
  };
};

export const encodeRgbaPng = async (
  canvas: HTMLCanvasElement,
  frame: RgbaFrame,
): Promise<Blob> => {
  if (
    !Number.isSafeInteger(frame.width) ||
    !Number.isSafeInteger(frame.height) ||
    frame.width < 1 ||
    frame.height < 1 ||
    !(frame.pixels instanceof Uint8ClampedArray) ||
    frame.pixels.length !== frame.width * frame.height * 4
  ) throw new Error(ENCODING_ERROR);

  canvas.width = frame.width;
  canvas.height = frame.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error(ENCODING_ERROR);
  const imageData = context.createImageData(frame.width, frame.height);
  imageData.data.set(frame.pixels);
  context.putImageData(imageData, 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error(ENCODING_ERROR));
    }, 'image/png');
  });
};
