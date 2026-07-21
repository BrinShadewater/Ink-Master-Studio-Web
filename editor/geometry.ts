import type { CropRect, ImageAdjustments, LayerTransform } from './model';

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

const round = (value: number) => Number(value.toFixed(6));

const isUsableSize = ({ width, height }: Size) =>
  Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;

export const fitSourceInViewport = (source: Size, viewport: Size): Rect => {
  if (!isUsableSize(source) || !isUsableSize(viewport)) return { x: 0, y: 0, width: 0, height: 0 };

  const padding = Math.min(48, Math.min(viewport.width, viewport.height) * 0.05);
  const availableWidth = Math.max(0, viewport.width - padding * 2);
  const availableHeight = Math.max(0, viewport.height - padding * 2);
  const scale = Math.min(availableWidth / source.width, availableHeight / source.height);
  const width = source.width * scale;
  const height = source.height * scale;

  return {
    x: round((viewport.width - width) / 2),
    y: round((viewport.height - height) / 2),
    width: round(width),
    height: round(height),
  };
};

export const getCroppedSourceRect = (source: Size, crop: CropRect): Rect => ({
  x: round(source.width * crop.x),
  y: round(source.height * crop.y),
  width: round(source.width * crop.width),
  height: round(source.height * crop.height),
});

export const getLayerDrawRect = (
  source: Size,
  viewport: Size,
  transform: LayerTransform,
  crop: CropRect,
): Rect => {
  const fitted = fitSourceInViewport(source, viewport);
  const width = fitted.width * crop.width * transform.scale;
  const height = fitted.height * crop.height * transform.scale;
  const centerX = viewport.width * transform.x;
  const centerY = viewport.height * transform.y;

  return {
    x: round(centerX - width / 2),
    y: round(centerY - height / 2),
    width: round(width),
    height: round(height),
  };
};

export const viewportDeltaToNormalized = (dx: number, dy: number, base: Size) => ({
  x: round(isUsableSize(base) ? dx / base.width : 0),
  y: round(isUsableSize(base) ? dy / base.height : 0),
});

export const moveTransformByViewportDelta = (
  transform: LayerTransform,
  dx: number,
  dy: number,
  viewport: Size,
): LayerTransform => {
  const delta = viewportDeltaToNormalized(dx, dy, viewport);
  return {
    ...transform,
    x: round(transform.x + delta.x),
    y: round(transform.y + delta.y),
  };
};

export const buildCanvasFilter = (adjustments: ImageAdjustments) =>
  `brightness(${100 + adjustments.brightness}%) contrast(${100 + adjustments.contrast}%) saturate(${100 + adjustments.saturation}%)`;
