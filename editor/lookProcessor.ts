import type { LookById, VariationLook } from './lookModel';

export interface RgbaFrame {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

const MAX_TYPED_ARRAY_LENGTH = 0xffffffff;
const CANONICAL_SIZE = 4096;
const CANONICAL_MAX = CANONICAL_SIZE - 1;
const DESIGN_EXTENT = 1000;

const clamp = (value: number, minimum = 0, maximum = 255) =>
  Math.max(minimum, Math.min(maximum, value));

const toByte = (value: number) => clamp(Math.round(value));

const luminance = (red: number, green: number, blue: number) =>
  0.2126 * red + 0.7152 * green + 0.0722 * blue;

const applyContrast = (value: number, contrast: number, strong = false) =>
  toByte(127.5 + (value - 127.5) * (1 + contrast / (strong ? 50 : 100)));

const applySaturation = (red: number, green: number, blue: number, saturation: number) => {
  const gray = luminance(red, green, blue);
  const factor = 1 + saturation / 100;
  return [
    toByte(gray + (red - gray) * factor),
    toByte(gray + (green - gray) * factor),
    toByte(gray + (blue - gray) * factor),
  ] as const;
};

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

const mapRgb = (
  frame: RgbaFrame,
  transform: (red: number, green: number, blue: number) => readonly [number, number, number],
) => {
  const output = new Uint8ClampedArray(frame.pixels.length);
  for (let index = 0; index < output.length; index += 4) {
    const [red, green, blue] = transform(
      frame.pixels[index],
      frame.pixels[index + 1],
      frame.pixels[index + 2],
    );
    output[index] = red;
    output[index + 1] = green;
    output[index + 2] = blue;
    output[index + 3] = frame.pixels[index + 3];
  }
  return output;
};

const blurPremultiplied = (pixels: Uint8ClampedArray, width: number, height: number) => {
  const premultiplied = new Float64Array(pixels.length);
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    premultiplied[index] = pixels[index] * alpha / 255;
    premultiplied[index + 1] = pixels[index + 1] * alpha / 255;
    premultiplied[index + 2] = pixels[index + 2] * alpha / 255;
    premultiplied[index + 3] = alpha;
  }

  const horizontal = new Float64Array(pixels.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const outputIndex = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        let sum = 0;
        for (let offset = -1; offset <= 1; offset += 1) {
          const sampleX = clamp(x + offset, 0, width - 1);
          sum += premultiplied[(y * width + sampleX) * 4 + channel];
        }
        horizontal[outputIndex + channel] = sum / 3;
      }
    }
  }

  const vertical = new Float64Array(pixels.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const outputIndex = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        let sum = 0;
        for (let offset = -1; offset <= 1; offset += 1) {
          const sampleY = clamp(y + offset, 0, height - 1);
          sum += horizontal[(sampleY * width + x) * 4 + channel];
        }
        vertical[outputIndex + channel] = sum / 3;
      }
    }
  }
  return vertical;
};

const processCleanPhoto = (frame: RgbaFrame, look: LookById<'clean-photo'>) => {
  const base = mapRgb(frame, (red, green, blue) => {
    const contrasted = [
      applyContrast(red, look.contrast),
      applyContrast(green, look.contrast),
      applyContrast(blue, look.contrast),
    ] as const;
    return applySaturation(...contrasted, look.saturation);
  });
  if (look.clarity === 0) return base;

  const blurred = blurPremultiplied(base, frame.width, frame.height);
  const output = new Uint8ClampedArray(base);
  const amount = look.clarity / 30;
  for (let index = 0; index < output.length; index += 4) {
    const blurredAlpha = blurred[index + 3];
    for (let channel = 0; channel < 3; channel += 1) {
      const blurredChannel = blurredAlpha > 0
        ? blurred[index + channel] * 255 / blurredAlpha
        : 0;
      const difference = clamp(base[index + channel] - blurredChannel, -64, 64);
      output[index + channel] = toByte(base[index + channel] + difference * amount);
    }
  }
  return output;
};

const processHighContrast = (frame: RgbaFrame, look: LookById<'high-contrast'>) =>
  mapRgb(frame, (red, green, blue) => {
    const moveBlackPoint = (value: number) =>
      toByte(Math.max(0, value - look.blackPoint) * 255 / (255 - look.blackPoint));
    const contrasted = [red, green, blue].map((value) =>
      applyContrast(moveBlackPoint(value), look.contrast, true)) as [number, number, number];
    return applySaturation(...contrasted, look.saturation);
  });

const processMonochrome = (frame: RgbaFrame, look: LookById<'monochrome'>) =>
  mapRgb(frame, (red, green, blue) => {
    let gray = toByte(luminance(red, green, blue));
    gray = toByte(gray + look.brightness * 2.55);
    gray = applyContrast(gray, look.contrast);
    return [gray, gray, gray];
  });

const processDuotone = (frame: RgbaFrame, look: LookById<'duotone'>) => {
  const shadow = parseHex(look.shadowColor);
  const highlight = parseHex(look.highlightColor);
  return mapRgb(frame, (red, green, blue) => {
    const balance = clamp(toByte(luminance(red, green, blue)) / 255 + look.balance / 100, 0, 1);
    return shadow.map((value, channel) =>
      toByte(value + (highlight[channel] - value) * balance)) as [number, number, number];
  });
};

const processPosterized = (frame: RgbaFrame, look: LookById<'posterized'>) =>
  mapRgb(frame, (red, green, blue) =>
    [red, green, blue].map((value) => {
      const contrasted = applyContrast(value, look.contrast);
      const level = Math.round(contrasted * (look.levels - 1) / 255);
      return toByte(level * 255 / (look.levels - 1));
    }) as [number, number, number]);

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

const processGraphicHalftone = (frame: RgbaFrame, look: LookById<'graphic-halftone'>) => {
  const output = new Uint8ClampedArray(frame.pixels.length);
  const foreground = parseHex(look.foregroundColor);
  const background = parseHex(look.backgroundColor);
  const radians = look.angle * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const cellSize = look.cellSize * CANONICAL_SIZE / DESIGN_EXTENT;

  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const index = (y * frame.width + x) * 4;
      const alpha = frame.pixels[index + 3];
      const canonicalX = canonicalCoordinate(x, frame.width) - CANONICAL_SIZE / 2;
      const canonicalY = canonicalCoordinate(y, frame.height) - CANONICAL_SIZE / 2;
      const rotatedX = canonicalX * cosine - canonicalY * sine + CANONICAL_SIZE / 2;
      const rotatedY = canonicalX * sine + canonicalY * cosine + CANONICAL_SIZE / 2;
      const localX = modulo(rotatedX, cellSize) - cellSize / 2;
      const localY = modulo(rotatedY, cellSize) - cellSize / 2;
      const darkness = clamp(1 - luminance(
        frame.pixels[index],
        frame.pixels[index + 1],
        frame.pixels[index + 2],
      ) / 255, 0, 1);
      const isInk = alpha > 0 && darkness > 0 &&
        localX * localX + localY * localY <= darkness * cellSize * cellSize / 2;

      if (isInk) {
        output[index] = foreground[0];
        output[index + 1] = foreground[1];
        output[index + 2] = foreground[2];
        output[index + 3] = look.background === 'solid' ? 255 : alpha;
      } else if (look.background === 'solid') {
        output[index] = background[0];
        output[index + 1] = background[1];
        output[index + 2] = background[2];
        output[index + 3] = 255;
      }
    }
  }
  return output;
};

const processVintageInk = (frame: RgbaFrame, look: LookById<'vintage-ink'>) => {
  const output = new Uint8ClampedArray(frame.pixels.length);
  const shadow = [38, 30, 28] as const;
  const highlight = [245, 226, 186] as const;
  const warmth = look.warmth / 100;
  const fade = look.fade / 100;
  const fadedBlack = 32 * fade;
  const fadedWhite = 255 - 20 * fade;
  const grainAmplitude = 32 * look.grain / 100;

  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const index = (y * frame.width + x) * 4;
      const gray = toByte(luminance(
        frame.pixels[index],
        frame.pixels[index + 1],
        frame.pixels[index + 2],
      ));
      const tone = gray / 255;
      const grain = (canonicalTextureValue(x, y, frame.width, frame.height, look.seed, 1024) * 2 - 1) *
        grainAmplitude;
      for (let channel = 0; channel < 3; channel += 1) {
        const warmTarget = shadow[channel] + (highlight[channel] - shadow[channel]) * tone;
        const warmed = toByte(
          frame.pixels[index + channel] + (warmTarget - frame.pixels[index + channel]) * warmth,
        );
        const faded = toByte(fadedBlack + (fadedWhite - fadedBlack) * warmed / 255);
        output[index + channel] = toByte(faded + grain);
      }
      output[index + 3] = frame.pixels[index + 3];
    }
  }
  return output;
};

const getAlphaEdgeDistances = (frame: RgbaFrame) => {
  const distances = new Float64Array(frame.width * frame.height);
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
      if (y > 0) distances[pixel] = Math.min(distances[pixel], distances[pixel - frame.width] + 1);
    }
  }
  for (let y = frame.height - 1; y >= 0; y -= 1) {
    for (let x = frame.width - 1; x >= 0; x -= 1) {
      const pixel = y * frame.width + x;
      if (x + 1 < frame.width) {
        distances[pixel] = Math.min(distances[pixel], distances[pixel + 1] + 1);
      }
      if (y + 1 < frame.height) {
        distances[pixel] = Math.min(distances[pixel], distances[pixel + frame.width] + 1);
      }
    }
  }
  return distances;
};

const processDistressedPrint = (frame: RgbaFrame, look: LookById<'distressed-print'>) => {
  const output = new Uint8ClampedArray(frame.pixels.length);
  const edgeDistances = getAlphaEdgeDistances(frame);
  const wear = look.wear / 100;
  const edgeBreakup = look.edgeBreakup / 100;

  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const pixel = y * frame.width + x;
      const index = pixel * 4;
      const alpha = frame.pixels[index + 3];
      if (alpha === 0) continue;

      output[index] = frame.pixels[index];
      output[index + 1] = frame.pixels[index + 1];
      output[index + 2] = frame.pixels[index + 2];
      const fine = canonicalTextureValue(
        x, y, frame.width, frame.height, look.seed, look.textureScale * 48,
      );
      const coarse = canonicalTextureValue(
        x, y, frame.width, frame.height, (look.seed ^ 0x9e3779b9) >>> 0, look.textureScale * 12,
      );
      const texture = 0.65 * fine + 0.35 * coarse;
      const distanceFactor = clamp((4 - edgeDistances[pixel]) / 3, 0, 1);
      const opacityFactor = 1 - alpha / 255;
      const edgeFactor = Math.max(distanceFactor, opacityFactor);
      const wearRemoval = wear * texture;
      const edgeRemoval = edgeBreakup * edgeFactor * (0.5 + 0.5 * coarse);
      const removal = 1 - (1 - wearRemoval) * (1 - edgeRemoval);
      output[index + 3] = toByte(alpha * (1 - removal));
    }
  }
  return output;
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
  const output = new Uint8ClampedArray(original.length);
  const amount = clamp(strength, 0, 100) / 100;

  // Blend color in premultiplied space so changing alpha cannot expose color fringes.
  for (let index = 0; index < output.length; index += 4) {
    const originalAlpha = original[index + 3];
    const processedAlpha = processed[index + 3];
    const alpha = originalAlpha + (processedAlpha - originalAlpha) * amount;
    const outputAlpha = toByte(alpha);
    output[index + 3] = outputAlpha;
    if (outputAlpha === 0 || alpha <= 0) continue;

    for (let channel = 0; channel < 3; channel += 1) {
      const originalPremultiplied = original[index + channel] * originalAlpha / 255;
      const processedPremultiplied = processed[index + channel] * processedAlpha / 255;
      const premultiplied = originalPremultiplied +
        (processedPremultiplied - originalPremultiplied) * amount;
      output[index + channel] = toByte(premultiplied * 255 / alpha);
    }
  }
  return output;
};

export const applyVariationLook = (frame: RgbaFrame, look: VariationLook): RgbaFrame => {
  validateFrame(frame);
  if (look.id === 'original') {
    return { width: frame.width, height: frame.height, pixels: new Uint8ClampedArray(frame.pixels) };
  }

  let processed: Uint8ClampedArray;
  switch (look.id) {
    case 'clean-photo': processed = processCleanPhoto(frame, look); break;
    case 'high-contrast': processed = processHighContrast(frame, look); break;
    case 'monochrome': processed = processMonochrome(frame, look); break;
    case 'duotone': processed = processDuotone(frame, look); break;
    case 'posterized': processed = processPosterized(frame, look); break;
    case 'graphic-halftone': processed = processGraphicHalftone(frame, look); break;
    case 'vintage-ink': processed = processVintageInk(frame, look); break;
    case 'distressed-print': processed = processDistressedPrint(frame, look); break;
  }

  return {
    width: frame.width,
    height: frame.height,
    pixels: blendLookStrength(frame.pixels, processed, look.strength),
  };
};
