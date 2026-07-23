import type { LookById, VariationLook } from './lookModel';

export interface RgbaFrame {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

export type LookAllocationKind = 'output-rgba' | 'clarity-row' | 'distance-buffer';
export type LookAllocationArrayType =
  | 'Uint8ClampedArray'
  | 'Uint16Array'
  | 'Uint32Array'
  | 'Float64Array';

export interface LookAllocation {
  kind: LookAllocationKind;
  arrayType: LookAllocationArrayType;
  length: number;
  bytes: number;
}

export interface LookProcessingOptions {
  output?: Uint8ClampedArray;
  maxWorkingBytes?: number;
  allocationTracker?: (allocation: LookAllocation) => void;
}

export const MAX_EXPORT_LOOK_WORKING_BYTES = 256 * 1024 * 1024;

const MAX_TYPED_ARRAY_LENGTH = 0xffffffff;
const CANONICAL_SIZE = 4096;
const CANONICAL_MAX = CANONICAL_SIZE - 1;
const DESIGN_EXTENT = 1000;
const TOO_LARGE_ERROR = 'Export artwork is too large for this browser.';

const clamp = (value: number, minimum = 0, maximum = 255) =>
  Math.max(minimum, Math.min(maximum, value));

const toByte = (value: number) => clamp(Math.round(value));

const luminance = (red: number, green: number, blue: number) =>
  0.2126 * red + 0.7152 * green + 0.0722 * blue;

const applyContrast = (value: number, contrast: number, strong = false) =>
  toByte(127.5 + (value - 127.5) * (1 + contrast / (strong ? 50 : 100)));

const parseHex = (color: string) => [
  Number.parseInt(color.slice(1, 3), 16),
  Number.parseInt(color.slice(3, 5), 16),
  Number.parseInt(color.slice(5, 7), 16),
] as const;

const validateFrame = (frame: RgbaFrame) => {
  const width = frame?.width;
  const height = frame?.height;
  if (
    !Number.isInteger(width) || width <= 0 ||
    !Number.isInteger(height) || height <= 0 ||
    width > Math.floor(MAX_TYPED_ARRAY_LENGTH / 4 / height) ||
    !(frame.pixels instanceof Uint8ClampedArray) ||
    frame.pixels.length !== width * height * 4
  ) {
    throw new Error('Invalid Look frame.');
  }
};

const validateOutput = (frame: RgbaFrame, output: Uint8ClampedArray | undefined) => {
  if (
    output !== undefined &&
    (!(output instanceof Uint8ClampedArray) ||
      output.length !== frame.pixels.length ||
      output.buffer === frame.pixels.buffer)
  ) {
    throw new Error('Invalid Look output.');
  }
};

const distanceElementBytes = (width: number, height: number) =>
  Math.min(width, height) <= 0xffff
    ? Uint16Array.BYTES_PER_ELEMENT
    : Uint32Array.BYTES_PER_ELEMENT;

export const estimateVariationLookWorkingBytes = (
  width: number,
  height: number,
  look: VariationLook,
): number => {
  const rgbaBytes = width * height * 4;
  let workingBytes = rgbaBytes * 2;
  if (look.strength === 0 || look.id === 'original') return workingBytes;
  if (look.id === 'clean-photo' && look.clarity !== 0) {
    workingBytes += width * 4 * Float64Array.BYTES_PER_ELEMENT * 3;
  } else if (look.id === 'distressed-print') {
    workingBytes += width * height * distanceElementBytes(width, height);
  }
  return workingBytes;
};

const trackAllocation = (
  options: LookProcessingOptions,
  allocation: LookAllocation,
) => {
  options.allocationTracker?.(allocation);
};

const createOutput = (
  frame: RgbaFrame,
  options: LookProcessingOptions,
): Uint8ClampedArray => {
  if (options.output) return options.output;
  trackAllocation(options, {
    kind: 'output-rgba',
    arrayType: 'Uint8ClampedArray',
    length: frame.pixels.length,
    bytes: frame.pixels.byteLength,
  });
  return new Uint8ClampedArray(frame.pixels.length);
};

const blendPixel = (
  source: Uint8ClampedArray,
  output: Uint8ClampedArray,
  index: number,
  processedRed: number,
  processedGreen: number,
  processedBlue: number,
  processedAlpha: number,
  amount: number,
) => {
  const originalAlpha = source[index + 3];
  const alpha = originalAlpha + (processedAlpha - originalAlpha) * amount;
  const outputAlpha = toByte(alpha);
  output[index] = 0;
  output[index + 1] = 0;
  output[index + 2] = 0;
  output[index + 3] = outputAlpha;
  if (outputAlpha === 0 || alpha <= 0) return;

  for (let channel = 0; channel < 3; channel += 1) {
    const originalPremultiplied = source[index + channel] * originalAlpha / 255;
    const processedChannel = channel === 0
      ? processedRed
      : channel === 1 ? processedGreen : processedBlue;
    const processedPremultiplied = processedChannel * processedAlpha / 255;
    const premultiplied = originalPremultiplied +
      (processedPremultiplied - originalPremultiplied) * amount;
    output[index + channel] = toByte(premultiplied * 255 / alpha);
  }
};

const cleanPhotoRgb = (
  pixels: Uint8ClampedArray,
  index: number,
  look: LookById<'clean-photo'>,
  target: number[],
  offset = 0,
) => {
  const red = applyContrast(pixels[index], look.contrast);
  const green = applyContrast(pixels[index + 1], look.contrast);
  const blue = applyContrast(pixels[index + 2], look.contrast);
  const gray = luminance(red, green, blue);
  const factor = 1 + look.saturation / 100;
  target[offset] = toByte(gray + (red - gray) * factor);
  target[offset + 1] = toByte(gray + (green - gray) * factor);
  target[offset + 2] = toByte(gray + (blue - gray) * factor);
};

const premultipliedCleanPhotoPixel = (
  frame: RgbaFrame,
  look: LookById<'clean-photo'>,
  x: number,
  y: number,
  target: number[],
  offset: number,
) => {
  const index = (y * frame.width + x) * 4;
  cleanPhotoRgb(frame.pixels, index, look, target, offset);
  const alpha = frame.pixels[index + 3];
  target[offset] = target[offset] * alpha / 255;
  target[offset + 1] = target[offset + 1] * alpha / 255;
  target[offset + 2] = target[offset + 2] * alpha / 255;
  target[offset + 3] = alpha;
};

const fillHorizontalClarityRow = (
  frame: RgbaFrame,
  look: LookById<'clean-photo'>,
  y: number,
  row: Float64Array,
) => {
  const samples = new Array<number>(12).fill(0);
  premultipliedCleanPhotoPixel(frame, look, 0, y, samples, 0);
  premultipliedCleanPhotoPixel(frame, look, 0, y, samples, 4);
  premultipliedCleanPhotoPixel(
    frame,
    look,
    Math.min(1, frame.width - 1),
    y,
    samples,
    8,
  );

  for (let x = 0; x < frame.width; x += 1) {
    const outputIndex = x * 4;
    for (let channel = 0; channel < 4; channel += 1) {
      row[outputIndex + channel] =
        (samples[channel] + samples[4 + channel] + samples[8 + channel]) / 3;
    }
    if (x + 1 >= frame.width) continue;
    for (let channel = 0; channel < 8; channel += 1) {
      samples[channel] = samples[channel + 4];
    }
    premultipliedCleanPhotoPixel(
      frame,
      look,
      Math.min(x + 2, frame.width - 1),
      y,
      samples,
      8,
    );
  }
};

const allocateClarityRow = (
  width: number,
  options: LookProcessingOptions,
) => {
  const length = width * 4;
  trackAllocation(options, {
    kind: 'clarity-row',
    arrayType: 'Float64Array',
    length,
    bytes: length * Float64Array.BYTES_PER_ELEMENT,
  });
  return new Float64Array(length);
};

const processCleanPhoto = (
  frame: RgbaFrame,
  look: LookById<'clean-photo'>,
  output: Uint8ClampedArray,
  amount: number,
  options: LookProcessingOptions,
) => {
  const base = [0, 0, 0];
  if (look.clarity === 0) {
    for (let index = 0; index < frame.pixels.length; index += 4) {
      cleanPhotoRgb(frame.pixels, index, look, base);
      blendPixel(
        frame.pixels,
        output,
        index,
        base[0],
        base[1],
        base[2],
        frame.pixels[index + 3],
        amount,
      );
    }
    return;
  }

  let previous = allocateClarityRow(frame.width, options);
  let current = allocateClarityRow(frame.width, options);
  let next = allocateClarityRow(frame.width, options);
  fillHorizontalClarityRow(frame, look, 0, current);
  previous.set(current);
  fillHorizontalClarityRow(frame, look, Math.min(1, frame.height - 1), next);
  const clarityAmount = look.clarity / 30;

  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const index = (y * frame.width + x) * 4;
      const rowIndex = x * 4;
      cleanPhotoRgb(frame.pixels, index, look, base);
      const blurredAlpha = (
        previous[rowIndex + 3] +
        current[rowIndex + 3] +
        next[rowIndex + 3]
      ) / 3;
      let processedRed = 0;
      let processedGreen = 0;
      let processedBlue = 0;
      for (let channel = 0; channel < 3; channel += 1) {
        const blurredPremultiplied = (
          previous[rowIndex + channel] +
          current[rowIndex + channel] +
          next[rowIndex + channel]
        ) / 3;
        const blurredChannel = blurredAlpha > 0
          ? blurredPremultiplied * 255 / blurredAlpha
          : 0;
        const difference = clamp(base[channel] - blurredChannel, -64, 64);
        const processedChannel = toByte(base[channel] + difference * clarityAmount);
        if (channel === 0) processedRed = processedChannel;
        else if (channel === 1) processedGreen = processedChannel;
        else processedBlue = processedChannel;
      }
      blendPixel(
        frame.pixels,
        output,
        index,
        processedRed,
        processedGreen,
        processedBlue,
        frame.pixels[index + 3],
        amount,
      );
    }
    if (y + 1 >= frame.height) continue;
    const recycled = previous;
    previous = current;
    current = next;
    next = recycled;
    fillHorizontalClarityRow(
      frame,
      look,
      Math.min(y + 2, frame.height - 1),
      next,
    );
  }
};

const canonicalCoordinate = (index: number, dimension: number) =>
  clamp(Math.floor((index + 0.5) * CANONICAL_SIZE / dimension), 0, CANONICAL_MAX);

export const canonicalTextureValue = (
  x: number,
  y: number,
  width: number,
  height: number,
  seed: number,
  scale: number,
): number => {
  const frequency = Math.max(1, Math.round(scale));
  const gridX = Math.floor(canonicalCoordinate(x, width) * frequency / CANONICAL_SIZE);
  const gridY = Math.floor(canonicalCoordinate(y, height) * frequency / CANONICAL_SIZE);

  // Keep this 32-bit avalanche in sync with the documented golden-fixture constants.
  let hash = seed >>> 0;
  hash ^= Math.imul(gridX + 1, 0x9e3779b1);
  hash ^= Math.imul(gridY + 1, 0x85ebca77);
  hash ^= Math.imul(frequency, 0xc2b2ae3d);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0xffffffff;
};

const modulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;

type EdgeDistances = Uint16Array | Uint32Array;

const createEdgeDistances = (
  frame: RgbaFrame,
  options: LookProcessingOptions,
): EdgeDistances => {
  const length = frame.width * frame.height;
  const useUint16 = distanceElementBytes(frame.width, frame.height) ===
    Uint16Array.BYTES_PER_ELEMENT;
  trackAllocation(options, {
    kind: 'distance-buffer',
    arrayType: useUint16 ? 'Uint16Array' : 'Uint32Array',
    length,
    bytes: length * (useUint16
      ? Uint16Array.BYTES_PER_ELEMENT
      : Uint32Array.BYTES_PER_ELEMENT),
  });
  const distances: EdgeDistances = useUint16
    ? new Uint16Array(length)
    : new Uint32Array(length);

  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const pixel = y * frame.width + x;
      distances[pixel] = frame.pixels[pixel * 4 + 3] === 0
        ? 0
        : Math.min(x + 1, y + 1, frame.width - x, frame.height - y);
    }
  }
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const pixel = y * frame.width + x;
      if (x > 0) distances[pixel] = Math.min(distances[pixel], distances[pixel - 1] + 1);
      if (y > 0) {
        distances[pixel] = Math.min(
          distances[pixel],
          distances[pixel - frame.width] + 1,
        );
      }
    }
  }
  for (let y = frame.height - 1; y >= 0; y -= 1) {
    for (let x = frame.width - 1; x >= 0; x -= 1) {
      const pixel = y * frame.width + x;
      if (x + 1 < frame.width) {
        distances[pixel] = Math.min(distances[pixel], distances[pixel + 1] + 1);
      }
      if (y + 1 < frame.height) {
        distances[pixel] = Math.min(
          distances[pixel],
          distances[pixel + frame.width] + 1,
        );
      }
    }
  }
  return distances;
};

const processDistressedPrint = (
  frame: RgbaFrame,
  look: LookById<'distressed-print'>,
  output: Uint8ClampedArray,
  amount: number,
  options: LookProcessingOptions,
) => {
  const edgeDistances = createEdgeDistances(frame, options);
  const wear = look.wear / 100;
  const edgeBreakup = look.edgeBreakup / 100;

  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const pixel = y * frame.width + x;
      const index = pixel * 4;
      const alpha = frame.pixels[index + 3];
      if (alpha === 0) {
        blendPixel(frame.pixels, output, index, 0, 0, 0, 0, amount);
        continue;
      }
      const fine = canonicalTextureValue(
        x,
        y,
        frame.width,
        frame.height,
        look.seed,
        look.textureScale * 48,
      );
      const coarse = canonicalTextureValue(
        x,
        y,
        frame.width,
        frame.height,
        (look.seed ^ 0x9e3779b9) >>> 0,
        look.textureScale * 12,
      );
      const texture = 0.65 * fine + 0.35 * coarse;
      const distanceFactor = clamp((4 - edgeDistances[pixel]) / 3, 0, 1);
      const opacityFactor = 1 - alpha / 255;
      const edgeFactor = Math.max(distanceFactor, opacityFactor);
      const wearRemoval = wear * texture;
      const edgeRemoval = edgeBreakup * edgeFactor * (0.5 + 0.5 * coarse);
      const removal = 1 - (1 - wearRemoval) * (1 - edgeRemoval);
      blendPixel(
        frame.pixels,
        output,
        index,
        frame.pixels[index],
        frame.pixels[index + 1],
        frame.pixels[index + 2],
        toByte(alpha * (1 - removal)),
        amount,
      );
    }
  }
};

const processPixelLocalLook = (
  frame: RgbaFrame,
  look: Exclude<VariationLook, LookById<'original' | 'clean-photo' | 'distressed-print'>>,
  output: Uint8ClampedArray,
  amount: number,
) => {
  const parsedA = look.id === 'duotone'
    ? parseHex(look.shadowColor)
    : look.id === 'graphic-halftone'
      ? parseHex(look.foregroundColor)
      : null;
  const parsedB = look.id === 'duotone'
    ? parseHex(look.highlightColor)
    : look.id === 'graphic-halftone'
      ? parseHex(look.backgroundColor)
      : null;
  const radians = look.id === 'graphic-halftone' ? look.angle * Math.PI / 180 : 0;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const cellSize = look.id === 'graphic-halftone'
    ? look.cellSize * CANONICAL_SIZE / DESIGN_EXTENT
    : 0;

  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const index = (y * frame.width + x) * 4;
      const red = frame.pixels[index];
      const green = frame.pixels[index + 1];
      const blue = frame.pixels[index + 2];
      const alpha = frame.pixels[index + 3];
      let processedRed = 0;
      let processedGreen = 0;
      let processedBlue = 0;
      let processedAlpha = alpha;

      switch (look.id) {
        case 'high-contrast': {
          const moveBlackPoint = (value: number) =>
            toByte(Math.max(0, value - look.blackPoint) * 255 / (255 - look.blackPoint));
          const contrastRed = applyContrast(moveBlackPoint(red), look.contrast, true);
          const contrastGreen = applyContrast(moveBlackPoint(green), look.contrast, true);
          const contrastBlue = applyContrast(moveBlackPoint(blue), look.contrast, true);
          const gray = luminance(contrastRed, contrastGreen, contrastBlue);
          const factor = 1 + look.saturation / 100;
          processedRed = toByte(gray + (contrastRed - gray) * factor);
          processedGreen = toByte(gray + (contrastGreen - gray) * factor);
          processedBlue = toByte(gray + (contrastBlue - gray) * factor);
          break;
        }
        case 'monochrome': {
          let gray = toByte(luminance(red, green, blue));
          gray = toByte(gray + look.brightness * 2.55);
          gray = applyContrast(gray, look.contrast);
          processedRed = gray;
          processedGreen = gray;
          processedBlue = gray;
          break;
        }
        case 'duotone': {
          const shadow = parsedA!;
          const highlight = parsedB!;
          const balance = clamp(
            toByte(luminance(red, green, blue)) / 255 + look.balance / 100,
            0,
            1,
          );
          processedRed = toByte(shadow[0] + (highlight[0] - shadow[0]) * balance);
          processedGreen = toByte(shadow[1] + (highlight[1] - shadow[1]) * balance);
          processedBlue = toByte(shadow[2] + (highlight[2] - shadow[2]) * balance);
          break;
        }
        case 'posterized': {
          const posterize = (value: number) => {
            const contrasted = applyContrast(value, look.contrast);
            const level = Math.round(contrasted * (look.levels - 1) / 255);
            return toByte(level * 255 / (look.levels - 1));
          };
          processedRed = posterize(red);
          processedGreen = posterize(green);
          processedBlue = posterize(blue);
          break;
        }
        case 'graphic-halftone': {
          const foreground = parsedA!;
          const background = parsedB!;
          const canonicalX = canonicalCoordinate(x, frame.width) - CANONICAL_SIZE / 2;
          const canonicalY = canonicalCoordinate(y, frame.height) - CANONICAL_SIZE / 2;
          const rotatedX = canonicalX * cosine - canonicalY * sine + CANONICAL_SIZE / 2;
          const rotatedY = canonicalX * sine + canonicalY * cosine + CANONICAL_SIZE / 2;
          const localX = modulo(rotatedX, cellSize) - cellSize / 2;
          const localY = modulo(rotatedY, cellSize) - cellSize / 2;
          const darkness = clamp(1 - luminance(red, green, blue) / 255, 0, 1);
          const isInk = alpha > 0 && darkness > 0 &&
            localX * localX + localY * localY <= darkness * cellSize * cellSize / 2;
          if (isInk) {
            processedRed = foreground[0];
            processedGreen = foreground[1];
            processedBlue = foreground[2];
            processedAlpha = look.background === 'solid' ? 255 : alpha;
          } else if (look.background === 'solid') {
            processedRed = background[0];
            processedGreen = background[1];
            processedBlue = background[2];
            processedAlpha = 255;
          } else {
            processedAlpha = 0;
          }
          break;
        }
        case 'vintage-ink': {
          const shadow = [38, 30, 28] as const;
          const highlight = [245, 226, 186] as const;
          const warmth = look.warmth / 100;
          const fade = look.fade / 100;
          const fadedBlack = 32 * fade;
          const fadedWhite = 255 - 20 * fade;
          const grainAmplitude = 32 * look.grain / 100;
          const gray = toByte(luminance(red, green, blue));
          const tone = gray / 255;
          const grain = (
            canonicalTextureValue(x, y, frame.width, frame.height, look.seed, 1024) * 2 - 1
          ) * grainAmplitude;
          for (let channel = 0; channel < 3; channel += 1) {
            const warmTarget = shadow[channel] +
              (highlight[channel] - shadow[channel]) * tone;
            const sourceChannel = channel === 0 ? red : channel === 1 ? green : blue;
            const warmed = toByte(
              sourceChannel + (warmTarget - sourceChannel) * warmth,
            );
            const faded = toByte(fadedBlack + (fadedWhite - fadedBlack) * warmed / 255);
            const processedChannel = toByte(faded + grain);
            if (channel === 0) processedRed = processedChannel;
            else if (channel === 1) processedGreen = processedChannel;
            else processedBlue = processedChannel;
          }
          break;
        }
      }
      blendPixel(
        frame.pixels,
        output,
        index,
        processedRed,
        processedGreen,
        processedBlue,
        processedAlpha,
        amount,
      );
    }
  }
};

export const blendLookStrength = (
  original: Uint8ClampedArray,
  processed: Uint8ClampedArray,
  strength: number,
): Uint8ClampedArray => {
  if (
    !(original instanceof Uint8ClampedArray) ||
    !(processed instanceof Uint8ClampedArray) ||
    original.length !== processed.length ||
    original.length % 4 !== 0
  ) {
    throw new Error('Invalid Look frame.');
  }
  const amount = clamp(strength, 0, 100) / 100;
  if (amount === 0) return new Uint8ClampedArray(original);
  const output = new Uint8ClampedArray(original.length);

  // Blend color in premultiplied space so changing alpha cannot expose color fringes.
  for (let index = 0; index < output.length; index += 4) {
    blendPixel(
      original,
      output,
      index,
      processed[index],
      processed[index + 1],
      processed[index + 2],
      processed[index + 3],
      amount,
    );
  }
  return output;
};

export const applyVariationLook = (
  frame: RgbaFrame,
  look: VariationLook,
  options: LookProcessingOptions = {},
): RgbaFrame => {
  validateFrame(frame);
  validateOutput(frame, options.output);
  const estimatedBytes = estimateVariationLookWorkingBytes(frame.width, frame.height, look);
  if (
    options.maxWorkingBytes !== undefined &&
    estimatedBytes > options.maxWorkingBytes
  ) {
    throw new Error(TOO_LARGE_ERROR);
  }

  const output = createOutput(frame, options);
  if (look.id === 'original' || look.strength === 0) {
    output.set(frame.pixels);
    return { width: frame.width, height: frame.height, pixels: output };
  }

  const amount = clamp(look.strength, 0, 100) / 100;
  if (look.id === 'clean-photo') {
    processCleanPhoto(frame, look, output, amount, options);
  } else if (look.id === 'distressed-print') {
    processDistressedPrint(frame, look, output, amount, options);
  } else {
    processPixelLocalLook(frame, look, output, amount);
  }
  return { width: frame.width, height: frame.height, pixels: output };
};
