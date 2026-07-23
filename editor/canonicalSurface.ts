import type { Point, Rect, Size } from './geometry';

export const CANONICAL_DESIGN_SIZE = { width: 1000, height: 1000 } as const;

const round = (value: number) => Number(value.toFixed(6));
const usable = (value: number) => Number.isFinite(value) && value > 0;

export const containCanonicalSurface = (viewport: Size): Rect & { scale: number } => {
  if (!usable(viewport.width) || !usable(viewport.height)) {
    return { x: 0, y: 0, width: 0, height: 0, scale: 0 };
  }
  const edge = Math.min(viewport.width, viewport.height);
  return {
    x: round((viewport.width - edge) / 2),
    y: round((viewport.height - edge) / 2),
    width: round(edge),
    height: round(edge),
    scale: round(edge / CANONICAL_DESIGN_SIZE.width),
  };
};

export const displayPointToDesignPoint = (
  point: Point,
  display: Rect & { scale: number },
): Point | null => {
  if (
    display.scale <= 0 ||
    point.x < display.x ||
    point.y < display.y ||
    point.x > display.x + display.width ||
    point.y > display.y + display.height
  ) return null;
  return {
    x: round((point.x - display.x) / display.scale),
    y: round((point.y - display.y) / display.scale),
  };
};

export const designPointToDisplayPoint = (
  point: Point,
  display: Rect & { scale: number },
): Point | null => {
  if (display.scale <= 0 || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return null;
  }
  return {
    x: round(display.x + point.x * display.scale),
    y: round(display.y + point.y * display.scale),
  };
};
