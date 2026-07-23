import type { Point, Rect, Size } from './geometry';
import type { ProductPrintableRegion } from './productCatalog';
import {
  normalizeProductPlacement,
  type ProductPlacement,
} from './productModel';

export interface ProductArtworkGeometry {
  center: Point;
  edge: number;
  rotation: number;
}

const round = (value: number) => Number(value.toFixed(6));

const usableSize = ({ width, height }: Size) =>
  Number.isFinite(width) &&
  Number.isFinite(height) &&
  width > 0 &&
  height > 0;

export const containProductMockup = (viewport: Size): Rect => {
  if (!usableSize(viewport)) return { x: 0, y: 0, width: 0, height: 0 };
  const edge = Math.min(viewport.width, viewport.height);
  return {
    x: round((viewport.width - edge) / 2),
    y: round((viewport.height - edge) / 2),
    width: round(edge),
    height: round(edge),
  };
};

export const resolveProductRegionRect = (
  mockupRect: Rect,
  region: ProductPrintableRegion,
): Rect => {
  if (!usableSize(mockupRect)) return { x: 0, y: 0, width: 0, height: 0 };
  return {
    x: round(mockupRect.x + mockupRect.width * region.x),
    y: round(mockupRect.y + mockupRect.height * region.y),
    width: round(mockupRect.width * region.width),
    height: round(mockupRect.height * region.height),
  };
};

export const resolveProductArtworkGeometry = (
  regionRect: Rect,
  placementValue: ProductPlacement,
): ProductArtworkGeometry => {
  const placement = normalizeProductPlacement(placementValue);
  const baseEdge = Math.min(regionRect.width, regionRect.height);
  return {
    center: {
      x: round(regionRect.x + placement.x * regionRect.width),
      y: round(regionRect.y + placement.y * regionRect.height),
    },
    edge: round(Math.max(0, baseEdge) * placement.scale),
    rotation: placement.rotation,
  };
};

export const moveProductPlacement = (
  startValue: ProductPlacement,
  delta: Point,
  regionRect: Rect,
): ProductPlacement => {
  const start = normalizeProductPlacement(startValue);
  if (!usableSize(regionRect)) return start;
  return normalizeProductPlacement({
    ...start,
    x: round(start.x + delta.x / regionRect.width),
    y: round(start.y + delta.y / regionRect.height),
  });
};

export const resizeProductPlacementFromPoint = (
  startValue: ProductPlacement,
  point: Point,
  regionRect: Rect,
): ProductPlacement => {
  const start = normalizeProductPlacement(startValue);
  if (!usableSize(regionRect)) return start;
  const geometry = resolveProductArtworkGeometry(regionRect, start);
  const deltaX = point.x - geometry.center.x;
  const deltaY = point.y - geometry.center.y;
  const radians = -start.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const localX = deltaX * cosine - deltaY * sine;
  const localY = deltaX * sine + deltaY * cosine;
  const requestedEdge = Math.max(Math.abs(localX), Math.abs(localY)) * 2;
  const baseEdge = Math.min(regionRect.width, regionRect.height);
  return normalizeProductPlacement({
    ...start,
    scale: round(requestedEdge / baseEdge),
  });
};
