import { useEffect, useRef, useState, type PointerEvent } from 'react';
import {
  buildCanvasFilter,
  fitSourceInViewport,
  getCroppedSourceRect,
  getLayerDrawRect,
  type Rect,
  type Size,
  viewportDeltaToNormalized,
} from '../../editor/geometry';
import type { EditorTool, ImageLayer, LayerTransform } from '../../editor/model';

export interface EditorCanvasProps {
  sourceUrl: string | null;
  sourceSize: Size | null;
  layer: ImageLayer | null;
  tool: EditorTool;
  onTransformChange: (transform: LayerTransform, historyGroup: string) => void;
  onTransformEnd: () => void;
}

interface ViewportState {
  size: Size;
  pixelRatio: number;
}

interface DragState {
  pointerId: number;
  startPoint: { x: number; y: number };
  transform: LayerTransform;
  fittedRect: Rect;
}

const initialViewport: ViewportState = {
  size: { width: 0, height: 0 },
  pixelRatio: 1,
};

const toRadians = (degrees: number) => degrees * (Math.PI / 180);

const isPointInRect = (
  point: { x: number; y: number },
  drawRect: Rect,
  rotation: number,
) => {
  const centerX = drawRect.x + drawRect.width / 2;
  const centerY = drawRect.y + drawRect.height / 2;
  const dx = point.x - centerX;
  const dy = point.y - centerY;
  const angle = toRadians(rotation);
  const localX = dx * Math.cos(angle) + dy * Math.sin(angle);
  const localY = -dx * Math.sin(angle) + dy * Math.cos(angle);

  return Math.abs(localX) <= drawRect.width / 2 && Math.abs(localY) <= drawRect.height / 2;
};

export const EditorCanvas = ({
  sourceUrl,
  sourceSize,
  layer,
  tool,
  onTransformChange,
  onTransformEnd,
}: EditorCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [viewport, setViewport] = useState<ViewportState>(initialViewport);

  useEffect(() => {
    if (!sourceUrl) {
      setImage(null);
      return;
    }

    setImage(null);
    const nextImage = new Image();
    nextImage.onload = () => setImage(nextImage);
    nextImage.onerror = () => setImage(null);
    nextImage.src = sourceUrl;

    return () => {
      nextImage.onload = null;
      nextImage.onerror = null;
    };
  }, [sourceUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = (width: number, height: number) => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const nextWidth = Math.max(0, Math.round(width * pixelRatio));
      const nextHeight = Math.max(0, Math.round(height * pixelRatio));
      if (canvas.width !== nextWidth) canvas.width = nextWidth;
      if (canvas.height !== nextHeight) canvas.height = nextHeight;
      setViewport((current) => (
        current.size.width === width && current.size.height === height && current.pixelRatio === pixelRatio
          ? current
          : { size: { width, height }, pixelRatio }
      ));
    };

    const observer = new ResizeObserver(([entry]) => {
      resize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(canvas);
    resize(canvas.clientWidth, canvas.clientHeight);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#1f1f1f';
    context.fillRect(0, 0, canvas.width, canvas.height);

    if (!image || !sourceSize || !layer || !layer.visible || viewport.size.width === 0 || viewport.size.height === 0) return;

    const drawRect = getLayerDrawRect(sourceSize, viewport.size, layer.transform, layer.crop);
    const cropRect = getCroppedSourceRect(sourceSize, layer.crop);
    if (drawRect.width <= 0 || drawRect.height <= 0 || cropRect.width <= 0 || cropRect.height <= 0) return;

    const centerX = drawRect.x + drawRect.width / 2;
    const centerY = drawRect.y + drawRect.height / 2;
    context.save();
    context.scale(viewport.pixelRatio, viewport.pixelRatio);
    context.beginPath();
    context.rect(0, 0, viewport.size.width, viewport.size.height);
    context.clip();
    context.translate(centerX, centerY);
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
  }, [image, layer, sourceSize, viewport]);

  const getCanvasPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const finishDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    onTransformEnd();
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (tool !== 'select' || !sourceSize || !layer || !layer.visible || !image) return;

    const point = getCanvasPoint(event);
    const drawRect = getLayerDrawRect(sourceSize, viewport.size, layer.transform, layer.crop);
    if (!isPointInRect(point, drawRect, layer.transform.rotation)) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startPoint: point,
      transform: { ...layer.transform },
      fittedRect: fitSourceInViewport(sourceSize, viewport.size),
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const point = getCanvasPoint(event);
    const delta = viewportDeltaToNormalized(
      point.x - drag.startPoint.x,
      point.y - drag.startPoint.y,
      drag.fittedRect,
    );
    onTransformChange({
      ...drag.transform,
      x: drag.transform.x + delta.x,
      y: drag.transform.y + delta.y,
    }, 'canvas-drag');
  };

  return (
    <canvas
      ref={canvasRef}
      aria-label="Design canvas"
      className="block h-full min-h-0 w-full touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
    />
  );
};
