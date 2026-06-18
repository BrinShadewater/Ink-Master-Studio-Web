import { ArtworkAnalysis } from '../types';
import { loadImage } from './imageProcessing';

const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

const luminance = (r: number, g: number, b: number) =>
  (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

const toneFor = (r: number, g: number, b: number): 'dark' | 'light' | 'mid' => {
  const value = luminance(r, g, b);
  if (value < 0.32) return 'dark';
  if (value > 0.72) return 'light';
  return 'mid';
};

const printQuality = (width: number, height: number) => {
  const dpi = Math.round(Math.min(width / 14, height / 17));
  if (dpi >= 300) return { dpi, status: 'good' as const, label: 'Print Ready' };
  if (dpi >= 150) return { dpi, status: 'low' as const, label: 'Low Resolution' };
  return { dpi, status: 'poor' as const, label: 'Too Low — May Appear Blurry' };
};

export const analyzePixelData = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  sourceWidth: number,
  sourceHeight: number,
): ArtworkAnalysis => {
  const colorCounts = new Map<string, { count: number; r: number; g: number; b: number }>();
  const edgeSamples: Array<[number, number, number]> = [];
  let transparentPixels = 0;
  let opaquePixels = 0;
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const a = data[offset + 3];

      if (a < 32) {
        transparentPixels += 1;
        continue;
      }

      opaquePixels += 1;
      totalR += r;
      totalG += g;
      totalB += b;

      const qr = Math.min(255, Math.round(r / 32) * 32);
      const qg = Math.min(255, Math.round(g / 32) * 32);
      const qb = Math.min(255, Math.round(b / 32) * 32);
      const key = `${qr},${qg},${qb}`;
      const existing = colorCounts.get(key);
      colorCounts.set(key, existing
        ? { ...existing, count: existing.count + 1 }
        : { count: 1, r: qr, g: qg, b: qb });

      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        edgeSamples.push([r, g, b]);
      }
    }
  }

  const totalPixels = Math.max(1, width * height);
  const transparencyCoverage = transparentPixels / totalPixels;
  const edgeCount = Math.max(1, edgeSamples.length);
  const edgeAverage = edgeSamples.reduce(
    (sum, [r, g, b]) => [sum[0] + r, sum[1] + g, sum[2] + b],
    [0, 0, 0],
  ).map((value) => value / edgeCount);
  const matchingEdges = edgeSamples.filter(([r, g, b]) =>
    Math.max(
      Math.abs(r - edgeAverage[0]),
      Math.abs(g - edgeAverage[1]),
      Math.abs(b - edgeAverage[2]),
    ) <= 24,
  ).length;
  const edgeConfidence = edgeSamples.length ? matchingEdges / edgeSamples.length : 0;

  const palette = [...colorCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map(({ r, g, b }) => toHex(r, g, b));

  const average = opaquePixels
    ? [totalR / opaquePixels, totalG / opaquePixels, totalB / opaquePixels]
    : [0, 0, 0];
  const dominantTone = toneFor(average[0], average[1], average[2]);
  const quality = printQuality(sourceWidth, sourceHeight);
  const warnings: string[] = [];
  if (quality.status === 'poor') warnings.push('Artwork resolution is too low for a large full-front print.');
  if (quality.status === 'low') warnings.push('Artwork resolution may look soft at full-front print size.');
  if (transparencyCoverage > 0 && transparencyCoverage < 0.01) {
    warnings.push('A small amount of transparency was detected around the artwork.');
  }

  return {
    width: sourceWidth,
    height: sourceHeight,
    hasTransparency: transparencyCoverage >= 0.01,
    transparencyCoverage: Number(transparencyCoverage.toFixed(4)),
    edgeBackground: {
      isUniform: edgeConfidence >= 0.82 && edgeSamples.length > 0,
      color: toHex(edgeAverage[0], edgeAverage[1], edgeAverage[2]),
      tone: toneFor(edgeAverage[0], edgeAverage[1], edgeAverage[2]),
      confidence: Number(edgeConfidence.toFixed(3)),
    },
    printQuality: quality,
    palette,
    dominantTone,
    contrastRisk: {
      darkGarment: dominantTone === 'dark',
      lightGarment: dominantTone === 'light',
    },
    vectorSuitability: palette.length <= 3 ? 'strong' : palette.length <= 6 ? 'possible' : 'weak',
    warnings,
  };
};

export const analyzeArtwork = async (imageSource: string): Promise<ArtworkAnalysis> => {
  const image = await loadImage(imageSource);
  const maxSample = 96;
  const scale = Math.min(1, maxSample / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Artwork analysis is unavailable in this browser.');
  context.drawImage(image, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  return analyzePixelData(
    imageData.data,
    width,
    height,
    image.naturalWidth,
    image.naturalHeight,
  );
};
