import {
  buildCanvasFilter,
  getCroppedSourceRect,
  getLayerDrawRect,
  isPointInRotatedRect,
  type Point,
  type Rect,
  type Size,
} from './geometry';
import { isImageLayer, type DesignLayer, type TextLayer } from './model';

export interface CompositorAssets {
  metadataById: Record<string, Size>;
  imagesById: Record<string, CanvasImageSource>;
}

interface MeasuredTextBlock {
  characterWidths: number[][];
  fontPixels: number;
  letterSpacingPixels: number;
  lineHeight: number;
  lineWidths: number[];
  lines: string[][];
  width: number;
  height: number;
  outlinePixels: number;
}

const REFERENCE_DESIGN_EXTENT = 1000;
const TEXT_LINE_HEIGHT = 1.2;
const round = (value: number) => Number(value.toFixed(6));
const toRadians = (degrees: number) => degrees * (Math.PI / 180);

const getTextDesignScale = (viewport: Size) =>
  Math.max(0, Math.min(viewport.width, viewport.height)) / REFERENCE_DESIGN_EXTENT;

const measureTextLayer = (
  context: CanvasRenderingContext2D,
  viewport: Size,
  layer: TextLayer,
): MeasuredTextBlock => {
  const designScale = getTextDesignScale(viewport);
  const fontPixels = layer.fontSize * designScale;
  const letterSpacingPixels = layer.letterSpacing * designScale;
  const outlinePixels = layer.outlineWidth * designScale;
  const lines = layer.text.split('\n').map((line) => Array.from(line));
  context.font = `${fontPixels}px ${layer.fontFamily}`;
  const characterWidths = lines.map((characters) => characters.map((character) => context.measureText(character).width));
  const lineWidths = characterWidths.map((widths) => widths.reduce((width, characterWidth, index) => (
    width + characterWidth + (index === widths.length - 1 ? 0 : letterSpacingPixels)
  ), 0));

  return {
    characterWidths,
    fontPixels,
    letterSpacingPixels,
    lineHeight: fontPixels * TEXT_LINE_HEIGHT,
    lineWidths,
    lines,
    width: Math.max(0, ...lineWidths),
    height: lines.length * fontPixels * TEXT_LINE_HEIGHT,
    outlinePixels,
  };
};

export const getTextLayerBounds = (
  context: CanvasRenderingContext2D,
  viewport: Size,
  layer: TextLayer,
): Rect => {
  const measurement = measureTextLayer(context, viewport, layer);
  const width = (measurement.width + measurement.outlinePixels * 2) * layer.transform.scale;
  const height = (measurement.height + measurement.outlinePixels * 2) * layer.transform.scale;
  const centerX = viewport.width * layer.transform.x;
  const centerY = viewport.height * layer.transform.y;
  return {
    x: round(centerX - width / 2),
    y: round(centerY - height / 2),
    width: round(width),
    height: round(height),
  };
};

const renderImageLayer = (
  context: CanvasRenderingContext2D,
  viewport: Size,
  layer: Extract<DesignLayer, { type: 'image' }>,
  assets: CompositorAssets,
) => {
  const source = assets.metadataById[layer.assetId];
  const image = assets.imagesById[layer.assetId];
  if (!source || !image) return;

  const drawRect = getLayerDrawRect(source, viewport, layer.transform, layer.crop);
  const cropRect = getCroppedSourceRect(source, layer.crop);
  if (drawRect.width <= 0 || drawRect.height <= 0 || cropRect.width <= 0 || cropRect.height <= 0) return;

  context.save();
  context.translate(drawRect.x + drawRect.width / 2, drawRect.y + drawRect.height / 2);
  context.rotate(toRadians(layer.transform.rotation));
  context.scale(layer.transform.flipX ? -1 : 1, layer.transform.flipY ? -1 : 1);
  context.globalAlpha = layer.opacity;
  context.filter = buildCanvasFilter(layer.adjustments);
  context.drawImage(
    image,
    cropRect.x,
    cropRect.y,
    cropRect.width,
    cropRect.height,
    -drawRect.width / 2,
    -drawRect.height / 2,
    drawRect.width,
    drawRect.height,
  );
  context.restore();
};

const getLineStart = (align: TextLayer['align'], blockWidth: number, lineWidth: number) => {
  if (align === 'center') return -lineWidth / 2;
  if (align === 'right') return blockWidth / 2 - lineWidth;
  return -blockWidth / 2;
};

const renderTextLayer = (
  context: CanvasRenderingContext2D,
  viewport: Size,
  layer: TextLayer,
) => {
  const measurement = measureTextLayer(context, viewport, layer);
  const centerX = viewport.width * layer.transform.x;
  const centerY = viewport.height * layer.transform.y;

  context.save();
  context.translate(centerX, centerY);
  context.rotate(toRadians(layer.transform.rotation));
  context.scale(
    (layer.transform.flipX ? -1 : 1) * layer.transform.scale,
    (layer.transform.flipY ? -1 : 1) * layer.transform.scale,
  );
  context.globalAlpha = layer.opacity;
  context.filter = 'none';
  context.font = `${measurement.fontPixels}px ${layer.fontFamily}`;
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillStyle = layer.color;
  context.strokeStyle = layer.outlineColor;
  context.lineWidth = measurement.outlinePixels;

  measurement.lines.forEach((characters, lineIndex) => {
    let x = getLineStart(layer.align, measurement.width, measurement.lineWidths[lineIndex]);
    const y = -measurement.height / 2 + measurement.lineHeight * (lineIndex + 0.5);
    characters.forEach((character, characterIndex) => {
      if (measurement.outlinePixels > 0) context.strokeText(character, x, y);
      context.fillText(character, x, y);
      x += measurement.characterWidths[lineIndex][characterIndex] + measurement.letterSpacingPixels;
    });
  });
  context.restore();
};

export const renderDesignLayers = (
  context: CanvasRenderingContext2D,
  viewport: Size,
  layers: DesignLayer[],
  assets: CompositorAssets,
): void => {
  for (const layer of layers) {
    if (!layer.visible) continue;
    if (isImageLayer(layer)) renderImageLayer(context, viewport, layer, assets);
    else renderTextLayer(context, viewport, layer);
  }
};

export const hitTestDesignLayers = (
  context: CanvasRenderingContext2D,
  point: Point,
  viewport: Size,
  layers: DesignLayer[],
  assets: CompositorAssets,
): DesignLayer | null => {
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];
    if (!layer.visible) continue;
    let bounds: Rect;
    if (isImageLayer(layer)) {
      const source = assets.metadataById[layer.assetId];
      if (!source || !assets.imagesById[layer.assetId]) continue;
      bounds = getLayerDrawRect(source, viewport, layer.transform, layer.crop);
    } else {
      bounds = getTextLayerBounds(context, viewport, layer);
    }
    if (isPointInRotatedRect(point, bounds, layer.transform.rotation)) return layer;
  }
  return null;
};
