import {
  buildCanvasFilter,
  getCroppedSourceRect,
  getLayerDrawRect,
  isPointInRotatedRect,
  type Point,
  type Rect,
  type Size,
} from './geometry';
import { isImageLayer, isTextLayer, type DesignLayer, type TextLayer } from './model';

export interface CompositorAssets {
  metadataById: Record<string, Size>;
  imagesById: Record<string, CanvasImageSource>;
}

interface MeasuredGlyph {
  character: string;
  penX: number;
}

interface MeasuredTextLine {
  glyphs: MeasuredGlyph[];
  minX: number;
  maxX: number;
  width: number;
}

interface MeasuredTextBlock {
  contentHeight: number;
  fontPixels: number;
  height: number;
  lineHeight: number;
  lines: MeasuredTextLine[];
  width: number;
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
  context.save();
  try {
    context.font = `${fontPixels}px ${layer.fontFamily}`;
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
    context.direction = 'ltr';
    const outlineExtent = outlinePixels / 2;
    let hasVisibleGlyph = false;
    const lines = layer.text.split('\n').map((line): MeasuredTextLine => {
      let penX = 0;
      let minX = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      const glyphs = Array.from(line).map((character) => {
        const metrics = context.measureText(character);
        const hasActualBounds = Number.isFinite(metrics.actualBoundingBoxLeft) &&
          Number.isFinite(metrics.actualBoundingBoxRight);
        const left = hasActualBounds ? metrics.actualBoundingBoxLeft : 0;
        const right = hasActualBounds ? metrics.actualBoundingBoxRight : metrics.width;
        if (!hasActualBounds || left !== 0 || right !== 0) {
          minX = Math.min(minX, penX - left - outlineExtent);
          maxX = Math.max(maxX, penX + right + outlineExtent);
          hasVisibleGlyph = true;
        }
        const glyph = { character, penX };
        penX += metrics.width + letterSpacingPixels;
        return glyph;
      });
      if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return { glyphs, minX: 0, maxX: 0, width: 0 };
      return { glyphs, minX, maxX, width: maxX - minX };
    });
    const lineHeight = fontPixels * TEXT_LINE_HEIGHT;
    const contentHeight = lines.length * lineHeight;

    return {
      contentHeight,
      fontPixels,
      height: contentHeight + (hasVisibleGlyph ? outlinePixels : 0),
      lineHeight,
      lines,
      width: Math.max(0, ...lines.map((line) => line.width)),
      outlinePixels,
    };
  } finally {
    context.restore();
  }
};

export const getTextLayerBounds = (
  context: CanvasRenderingContext2D,
  viewport: Size,
  layer: TextLayer,
): Rect => {
  const measurement = measureTextLayer(context, viewport, layer);
  const width = measurement.width * layer.transform.scale;
  const height = measurement.height * layer.transform.scale;
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
  const preparedAssetId = layer.backgroundRemoval.enabled
    ? layer.backgroundRemoval.preparedAssetId
    : null;
  const prepared = preparedAssetId
    ? assets.imagesById[preparedAssetId]
    : undefined;
  const preparedMetadata = preparedAssetId
    ? assets.metadataById[preparedAssetId]
    : undefined;
  const image = prepared && preparedMetadata
    ? prepared
    : assets.imagesById[layer.assetId];
  if (!source || !image) return;

  const drawRect = getLayerDrawRect(source, viewport, layer.transform, layer.crop);
  const cropRect = prepared && preparedMetadata
    ? { x: 0, y: 0, width: preparedMetadata.width, height: preparedMetadata.height }
    : getCroppedSourceRect(source, layer.crop);
  if (drawRect.width <= 0 || drawRect.height <= 0 || cropRect.width <= 0 || cropRect.height <= 0) return;

  context.save();
  context.translate(drawRect.x + drawRect.width / 2, drawRect.y + drawRect.height / 2);
  context.rotate(toRadians(layer.transform.rotation));
  context.scale(layer.transform.flipX ? -1 : 1, layer.transform.flipY ? -1 : 1);
  context.globalAlpha = layer.opacity;
  context.filter = prepared && preparedMetadata
    ? 'none'
    : buildCanvasFilter(layer.adjustments);
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

const getLineOrigin = (align: TextLayer['align'], blockWidth: number, line: MeasuredTextLine) => {
  if (align === 'center') return -(line.minX + line.maxX) / 2;
  if (align === 'right') return blockWidth / 2 - line.maxX;
  return -blockWidth / 2 - line.minX;
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
  context.textBaseline = 'alphabetic';
  context.direction = 'ltr';
  context.fillStyle = layer.color;
  context.strokeStyle = layer.outlineColor;
  context.lineWidth = measurement.outlinePixels;

  measurement.lines.forEach((line, lineIndex) => {
    const originX = getLineOrigin(layer.align, measurement.width, line);
    const y = -measurement.contentHeight / 2 + measurement.lineHeight * lineIndex + measurement.fontPixels;
    line.glyphs.forEach(({ character, penX }) => {
      const x = originX + penX;
      if (measurement.outlinePixels > 0) context.strokeText(character, x, y);
      context.fillText(character, x, y);
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
    else if (isTextLayer(layer)) renderTextLayer(context, viewport, layer);
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
    } else if (isTextLayer(layer)) {
      bounds = getTextLayerBounds(context, viewport, layer);
    } else {
      continue;
    }
    if (isPointInRotatedRect(point, bounds, layer.transform.rotation)) return layer;
  }
  return null;
};
