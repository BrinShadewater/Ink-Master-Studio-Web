import {
  normalizeBackgroundRemoval,
  normalizeCleanupCorrectionDocument,
  type BackgroundRemovalSettings,
  type CleanupCorrectionDocument,
  type NormalizedPoint,
} from './imagePrepModel';

export interface RgbaFrame {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

export interface BackgroundRemovalInput {
  frame: RgbaFrame;
  settings: BackgroundRemovalSettings;
  corrections: CleanupCorrectionDocument;
}

interface OklabColor {
  l: number;
  a: number;
  b: number;
}

interface ColorCluster extends OklabColor {
  count: number;
}

const MAX_BACKGROUND_REMOVAL_EDGE = 2_048;
const MAX_OKLAB_DISTANCE = 0.35;
const OKLAB_CLUSTER_CELL = 0.04;
const CHAMFER_STRAIGHT = 3;
const CHAMFER_DIAGONAL = 4;
const CHAMFER_INFINITY = 0x3fffffff;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

const validateFrame = (frame: RgbaFrame) => {
  if (
    !Number.isInteger(frame.width) ||
    !Number.isInteger(frame.height) ||
    frame.width < 1 ||
    frame.height < 1 ||
    !(frame.pixels instanceof Uint8ClampedArray) ||
    frame.pixels.length !== frame.width * frame.height * 4
  ) {
    throw new Error('Invalid background removal frame.');
  }
};

export const resolveBackgroundRemovalScale = (
  width: number,
  height: number,
): number => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Invalid background removal dimensions.');
  }
  return Math.min(1, MAX_BACKGROUND_REMOVAL_EDGE / Math.max(width, height));
};

const srgbToLinear = (channel: number) => {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
};

const rgbToOklab = (red: number, green: number, blue: number): OklabColor => {
  const r = srgbToLinear(red);
  const g = srgbToLinear(green);
  const b = srgbToLinear(blue);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
};

const colorAt = (frame: RgbaFrame, pixelIndex: number) => {
  const offset = pixelIndex * 4;
  return rgbToOklab(
    frame.pixels[offset],
    frame.pixels[offset + 1],
    frame.pixels[offset + 2],
  );
};

const colorDistanceSquared = (left: OklabColor, right: OklabColor) => {
  const deltaL = left.l - right.l;
  const deltaA = left.a - right.a;
  const deltaB = left.b - right.b;
  return deltaL * deltaL + deltaA * deltaA + deltaB * deltaB;
};

const getBoundaryIndices = (width: number, height: number): number[] => {
  if (height === 1) return Array.from({ length: width }, (_, x) => x);
  if (width === 1) return Array.from({ length: height }, (_, y) => y * width);
  const indices: number[] = [];
  for (let x = 0; x < width; x += 1) indices.push(x);
  for (let y = 1; y < height; y += 1) indices.push(y * width + width - 1);
  for (let x = width - 2; x >= 0; x -= 1) indices.push((height - 1) * width + x);
  for (let y = height - 2; y > 0; y -= 1) indices.push(y * width);
  return indices;
};

const clusterKey = (color: OklabColor) =>
  `${Math.floor(color.l / OKLAB_CLUSTER_CELL)}:` +
  `${Math.floor((color.a + 0.5) / OKLAB_CLUSTER_CELL)}:` +
  `${Math.floor((color.b + 0.5) / OKLAB_CLUSTER_CELL)}`;

const getBackgroundReferences = (
  frame: RgbaFrame,
  boundary: number[],
): OklabColor[] => {
  const stride = Math.max(1, Math.floor(boundary.length / 512));
  const clusters = new Map<string, ColorCluster>();
  let sampleCount = 0;
  for (let boundaryIndex = 0; boundaryIndex < boundary.length; boundaryIndex += stride) {
    const pixelIndex = boundary[boundaryIndex];
    if (frame.pixels[pixelIndex * 4 + 3] === 0) continue;
    const color = colorAt(frame, pixelIndex);
    const key = clusterKey(color);
    const cluster = clusters.get(key);
    if (cluster) {
      cluster.l += color.l;
      cluster.a += color.a;
      cluster.b += color.b;
      cluster.count += 1;
    } else {
      clusters.set(key, { ...color, count: 1 });
    }
    sampleCount += 1;
  }
  if (sampleCount === 0) return [];
  const minimumClusterSize = Math.max(1, Math.ceil(sampleCount * 0.02));
  return [...clusters.entries()]
    .filter(([, cluster]) => cluster.count >= minimumClusterSize)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, cluster]) => ({
      l: cluster.l / cluster.count,
      a: cluster.a / cluster.count,
      b: cluster.b / cluster.count,
    }));
};

const matchesAnyReference = (
  frame: RgbaFrame,
  pixelIndex: number,
  references: OklabColor[],
  maximumDistanceSquared: number,
) => {
  if (frame.pixels[pixelIndex * 4 + 3] === 0) return false;
  const color = colorAt(frame, pixelIndex);
  return references.some((reference) =>
    colorDistanceSquared(color, reference) <= maximumDistanceSquared + 1e-12);
};

const isSolidDarkBackground = (references: OklabColor[]) => (
  references.length === 1 && references[0].l <= 0.08
);

const removeMatchingPixelsEverywhere = (
  frame: RgbaFrame,
  references: OklabColor[],
  maximumDistanceSquared: number,
  removed: Uint8Array,
) => {
  for (let index = 0; index < removed.length; index += 1) {
    if (matchesAnyReference(frame, index, references, maximumDistanceSquared)) {
      removed[index] = 1;
    }
  }
};

const floodMatchingPixels = (
  frame: RgbaFrame,
  seeds: number[],
  references: OklabColor[],
  maximumDistanceSquared: number,
  removed: Uint8Array,
) => {
  if (references.length === 0 || seeds.length === 0) return;
  const pixelCount = frame.width * frame.height;
  const considered = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;

  const enqueueIfMatching = (pixelIndex: number) => {
    if (considered[pixelIndex]) return;
    considered[pixelIndex] = 1;
    if (!matchesAnyReference(frame, pixelIndex, references, maximumDistanceSquared)) return;
    removed[pixelIndex] = 1;
    queue[tail] = pixelIndex;
    tail += 1;
  };

  for (const seed of seeds) enqueueIfMatching(seed);
  while (head < tail) {
    const pixelIndex = queue[head];
    head += 1;
    const x = pixelIndex % frame.width;
    const y = Math.floor(pixelIndex / frame.width);
    const minimumX = Math.max(0, x - 1);
    const maximumX = Math.min(frame.width - 1, x + 1);
    const minimumY = Math.max(0, y - 1);
    const maximumY = Math.min(frame.height - 1, y + 1);
    for (let nextY = minimumY; nextY <= maximumY; nextY += 1) {
      for (let nextX = minimumX; nextX <= maximumX; nextX += 1) {
        if (nextX === x && nextY === y) continue;
        enqueueIfMatching(nextY * frame.width + nextX);
      }
    }
  }
};

const pointToPixelIndex = (
  frame: RgbaFrame,
  point: NormalizedPoint,
) => {
  const x = Math.round(clamp(point.x, 0, 1) * (frame.width - 1));
  const y = Math.round(clamp(point.y, 0, 1) * (frame.height - 1));
  return y * frame.width + x;
};

export const samplePickedColor = (
  frame: RgbaFrame,
  point: NormalizedPoint,
): string => {
  validateFrame(frame);
  const offset = pointToPixelIndex(frame, point) * 4;
  return `#${[0, 1, 2]
    .map((channel) => frame.pixels[offset + channel].toString(16).padStart(2, '0'))
    .join('')}`;
};

const applyFeather = (
  frame: RgbaFrame,
  removed: Uint8Array,
  output: Uint8ClampedArray,
  featherPixels: number,
) => {
  if (featherPixels <= 0 || !removed.some((value) => value === 1)) return;
  const distances = new Int32Array(removed.length);
  for (let index = 0; index < removed.length; index += 1) {
    distances[index] = removed[index] ? 0 : CHAMFER_INFINITY;
  }

  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const index = y * frame.width + x;
      let distance = distances[index];
      if (x > 0) distance = Math.min(distance, distances[index - 1] + CHAMFER_STRAIGHT);
      if (y > 0) distance = Math.min(distance, distances[index - frame.width] + CHAMFER_STRAIGHT);
      if (x > 0 && y > 0) {
        distance = Math.min(distance, distances[index - frame.width - 1] + CHAMFER_DIAGONAL);
      }
      if (x + 1 < frame.width && y > 0) {
        distance = Math.min(distance, distances[index - frame.width + 1] + CHAMFER_DIAGONAL);
      }
      distances[index] = distance;
    }
  }
  for (let y = frame.height - 1; y >= 0; y -= 1) {
    for (let x = frame.width - 1; x >= 0; x -= 1) {
      const index = y * frame.width + x;
      let distance = distances[index];
      if (x + 1 < frame.width) distance = Math.min(distance, distances[index + 1] + CHAMFER_STRAIGHT);
      if (y + 1 < frame.height) {
        distance = Math.min(distance, distances[index + frame.width] + CHAMFER_STRAIGHT);
      }
      if (x + 1 < frame.width && y + 1 < frame.height) {
        distance = Math.min(distance, distances[index + frame.width + 1] + CHAMFER_DIAGONAL);
      }
      if (x > 0 && y + 1 < frame.height) {
        distance = Math.min(distance, distances[index + frame.width - 1] + CHAMFER_DIAGONAL);
      }
      distances[index] = distance;
    }
  }

  const fullOpacityDistance = (featherPixels + 1) * CHAMFER_STRAIGHT;
  for (let index = 0; index < distances.length; index += 1) {
    if (removed[index] || distances[index] >= fullOpacityDistance) continue;
    const alphaOffset = index * 4 + 3;
    output[alphaOffset] = Math.round(
      output[alphaOffset] * distances[index] / fullOpacityDistance,
    );
  }
};

const stampCircle = (
  frame: RgbaFrame,
  sourcePixels: Uint8ClampedArray,
  output: Uint8ClampedArray,
  centerX: number,
  centerY: number,
  radius: number,
  mode: 'erase' | 'restore',
) => {
  const radiusSquared = radius * radius;
  for (let y = Math.max(0, centerY - radius); y <= Math.min(frame.height - 1, centerY + radius); y += 1) {
    for (let x = Math.max(0, centerX - radius); x <= Math.min(frame.width - 1, centerX + radius); x += 1) {
      const deltaX = x - centerX;
      const deltaY = y - centerY;
      if (deltaX * deltaX + deltaY * deltaY > radiusSquared) continue;
      const alphaOffset = (y * frame.width + x) * 4 + 3;
      output[alphaOffset] = mode === 'erase' ? 0 : sourcePixels[alphaOffset];
    }
  }
};

const rasterizeSegment = (
  frame: RgbaFrame,
  sourcePixels: Uint8ClampedArray,
  output: Uint8ClampedArray,
  start: NormalizedPoint,
  end: NormalizedPoint,
  radius: number,
  mode: 'erase' | 'restore',
) => {
  let x = Math.round(start.x * (frame.width - 1));
  let y = Math.round(start.y * (frame.height - 1));
  const endX = Math.round(end.x * (frame.width - 1));
  const endY = Math.round(end.y * (frame.height - 1));
  const deltaX = Math.abs(endX - x);
  const stepX = x < endX ? 1 : -1;
  const deltaY = -Math.abs(endY - y);
  const stepY = y < endY ? 1 : -1;
  let error = deltaX + deltaY;

  while (true) {
    stampCircle(frame, sourcePixels, output, x, y, radius, mode);
    if (x === endX && y === endY) break;
    const doubledError = error * 2;
    if (doubledError >= deltaY) {
      error += deltaY;
      x += stepX;
    }
    if (doubledError <= deltaX) {
      error += deltaX;
      y += stepY;
    }
  }
};

const applyCorrections = (
  frame: RgbaFrame,
  sourcePixels: Uint8ClampedArray,
  output: Uint8ClampedArray,
  corrections: CleanupCorrectionDocument,
) => {
  const designToPixel = Math.max(frame.width, frame.height) / 1000;
  for (const stroke of corrections.strokes) {
    const radius = Math.max(1, Math.round(stroke.size * designToPixel / 2));
    if (stroke.points.length === 1) {
      const point = stroke.points[0];
      stampCircle(
        frame,
        sourcePixels,
        output,
        Math.round(point.x * (frame.width - 1)),
        Math.round(point.y * (frame.height - 1)),
        radius,
        stroke.mode,
      );
      continue;
    }
    for (let index = 1; index < stroke.points.length; index += 1) {
      rasterizeSegment(
        frame,
        sourcePixels,
        output,
        stroke.points[index - 1],
        stroke.points[index],
        radius,
        stroke.mode,
      );
    }
  }
};

export const applyBackgroundRemoval = (
  input: BackgroundRemovalInput,
): RgbaFrame => {
  validateFrame(input.frame);
  const settings = normalizeBackgroundRemoval(input.settings);
  const corrections = normalizeCleanupCorrectionDocument(input.corrections);
  const sourcePixels = input.frame.pixels;
  const output = new Uint8ClampedArray(sourcePixels);
  const removed = new Uint8Array(input.frame.width * input.frame.height);

  if (settings.enabled) {
    const boundary = getBoundaryIndices(input.frame.width, input.frame.height);
    const references = getBackgroundReferences(input.frame, boundary);
    const maximumDistance = settings.tolerance / 100 * MAX_OKLAB_DISTANCE;
    floodMatchingPixels(
      input.frame,
      boundary,
      references,
      maximumDistance * maximumDistance,
      removed,
    );

    // A solid black backdrop commonly remains inside closed counters in lettering.
    // Remove matching pixels globally in that narrow case; restore strokes keep black artwork recoverable.
    if (settings.mode === 'auto' && isSolidDarkBackground(references)) {
      removeMatchingPixelsEverywhere(
        input.frame,
        references,
        maximumDistance * maximumDistance,
        removed,
      );
    }

    if (settings.mode === 'picked' && settings.pickedPoint) {
      const pickedIndex = pointToPixelIndex(input.frame, settings.pickedPoint);
      if (sourcePixels[pickedIndex * 4 + 3] > 0) {
        floodMatchingPixels(
          input.frame,
          [pickedIndex],
          [colorAt(input.frame, pickedIndex)],
          maximumDistance * maximumDistance,
          removed,
        );
      }
    }

    for (let index = 0; index < removed.length; index += 1) {
      if (removed[index]) output[index * 4 + 3] = 0;
    }
    const designToPixel = Math.max(input.frame.width, input.frame.height) / 1000;
    const featherPixels = Math.round(settings.edgeFeather * designToPixel);
    applyFeather(input.frame, removed, output, featherPixels);
  }

  applyCorrections(input.frame, sourcePixels, output, corrections);
  for (let index = 0; index < output.length; index += 4) {
    if (output[index + 3] !== 0) continue;
    output[index] = 0;
    output[index + 1] = 0;
    output[index + 2] = 0;
  }
  return { width: input.frame.width, height: input.frame.height, pixels: output };
};
