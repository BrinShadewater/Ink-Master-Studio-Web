import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { hitTestDesignLayers } from '../../editor/compositor';
import {
  CANONICAL_DESIGN_SIZE,
  displayPointToDesignPoint,
} from '../../editor/canonicalSurface';
import {
  getDecodedImageSources,
  type DecodedImageEntry,
} from '../../editor/decodedImages';
import {
  getLayerDrawRect,
  moveTransformByViewportDelta,
  type Point,
  type Size,
} from '../../editor/geometry';
import type { CleanupStroke, NormalizedPoint } from '../../editor/imagePrepModel';
import type { LookRenderCoordinator } from '../../editor/lookRenderCoordinator';
import type {
  DesignVariation,
  EditorAsset,
  EditorTool,
  ImageLayer,
  LayerTransform,
} from '../../editor/model';
import { useVariationPreviewSurface } from './VariationPreviewCanvas';
import type { BackgroundBrushMode } from './BackgroundRemovalInspector';

const emptyVariation: DesignVariation = {
  id: 'editor-empty',
  name: 'Empty',
  layers: [],
  selectedLayerId: '',
  look: { id: 'original', strength: 100 },
};

const EDITOR_CANVAS_SURFACE_ID = 'editor-main-preview';

export interface EditorCanvasProps {
  variation: DesignVariation | null;
  assetsById: Record<string, EditorAsset>;
  imagesById: Record<string, DecodedImageEntry>;
  coordinator: LookRenderCoordinator;
  lookRetryGeneration: number;
  onLookFailureChange: (message: string | null) => void;
  tool: EditorTool;
  onSelectLayer: (layerId: string) => void;
  onTransformChange: (layerId: string, transform: LayerTransform, historyGroup: string) => void;
  onTransformEnd: () => void;
  backgroundMode?: BackgroundBrushMode;
  backgroundBrushSize?: number;
  onPickBackground?: (point: NormalizedPoint) => void;
  onCommitBackgroundStroke?: (stroke: CleanupStroke) => Promise<void>;
  onBackgroundModeChange?: (mode: BackgroundBrushMode) => void;
}

interface DragState {
  pointerId: number;
  layerId: string;
  startPoint: { x: number; y: number };
  transform: LayerTransform;
  designScale: number;
}

interface StrokeState {
  pointerId: number;
  mode: 'erase' | 'restore';
  points: NormalizedPoint[];
}

export const canvasPointToCropPoint = (
  point: Point,
  viewport: Size,
  source: Size,
  layer: ImageLayer,
): NormalizedPoint | null => {
  const rect = getLayerDrawRect(source, viewport, layer.transform, layer.crop);
  if (rect.width <= 0 || rect.height <= 0) return null;
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const radians = -layer.transform.rotation * Math.PI / 180;
  const deltaX = point.x - centerX;
  const deltaY = point.y - centerY;
  let localX = deltaX * Math.cos(radians) - deltaY * Math.sin(radians);
  let localY = deltaX * Math.sin(radians) + deltaY * Math.cos(radians);
  if (layer.transform.flipX) localX *= -1;
  if (layer.transform.flipY) localY *= -1;
  const x = localX / rect.width + 0.5;
  const y = localY / rect.height + 0.5;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return {
    x: Number(Math.max(0, Math.min(1, x)).toFixed(6)),
    y: Number(Math.max(0, Math.min(1, y)).toFixed(6)),
  };
};

export const EditorCanvas = ({
  variation,
  assetsById,
  imagesById,
  coordinator,
  lookRetryGeneration,
  onLookFailureChange,
  tool,
  onSelectLayer,
  onTransformChange,
  onTransformEnd,
  backgroundMode = 'idle',
  backgroundBrushSize = 32,
  onPickBackground,
  onCommitBackgroundStroke,
  onBackgroundModeChange,
}: EditorCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const strokeRef = useRef<StrokeState | null>(null);
  const [brushCursor, setBrushCursor] = useState<Point | null>(null);
  const activeVariation = variation ?? emptyVariation;
  const imageSourcesById = useMemo(
    () => getDecodedImageSources(imagesById),
    [imagesById],
  );
  const viewport = useVariationPreviewSurface({
    canvasRef,
    surfaceId: EDITOR_CANVAS_SURFACE_ID,
    variation: activeVariation,
    assetsById,
    imagesById,
    coordinator,
    maxPixelDimension: 1600,
    background: '#27313d',
    retryGeneration: lookRetryGeneration,
    onFailureChange: onLookFailureChange,
  });

  const getCanvasPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const selectedImage = activeVariation.layers.find((candidate) =>
    candidate.id === activeVariation.selectedLayerId && candidate.type === 'image') as ImageLayer | undefined;

  const getBackgroundPoint = (point: Point): NormalizedPoint | null => {
    if (!selectedImage) return null;
    const source = assetsById[selectedImage.assetId];
    if (!source) return null;
    const designPoint = displayPointToDesignPoint(point, viewport.designRect);
    if (!designPoint) return null;
    return canvasPointToCropPoint(
      designPoint,
      CANONICAL_DESIGN_SIZE,
      source,
      selectedImage,
    );
  };

  const appendStrokePoint = (stroke: StrokeState, point: NormalizedPoint) => {
    const previous = stroke.points.at(-1);
    if (previous?.x === point.x && previous.y === point.y) return;
    stroke.points.push(point);
  };

  const finishDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    onTransformEnd();
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (
      backgroundMode !== 'idle' &&
      viewport.size.width > 0 &&
      viewport.size.height > 0
    ) {
      const point = getCanvasPoint(event);
      const normalized = getBackgroundPoint(point);
      if (!normalized) return;
      setBrushCursor(point);
      if (backgroundMode === 'pick') {
        onPickBackground?.(normalized);
        onBackgroundModeChange?.('idle');
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      strokeRef.current = {
        pointerId: event.pointerId,
        mode: backgroundMode,
        points: [normalized],
      };
      return;
    }
    if (tool !== 'select' || viewport.size.width <= 0 || viewport.size.height <= 0) return;
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    const point = getCanvasPoint(event);
    const designPoint = displayPointToDesignPoint(point, viewport.designRect);
    if (!designPoint) return;
    const hitLayer = hitTestDesignLayers(
      context,
      designPoint,
      CANONICAL_DESIGN_SIZE,
      activeVariation.layers,
      { metadataById: assetsById, imagesById: imageSourcesById },
    );
    if (!hitLayer) return;

    onSelectLayer(hitLayer.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      layerId: hitLayer.id,
      startPoint: point,
      transform: { ...hitLayer.transform },
      designScale: viewport.designRect.scale,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (backgroundMode !== 'idle') {
      const events = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
      for (const coalesced of events) {
        const bounds = event.currentTarget.getBoundingClientRect();
        const point = {
          x: coalesced.clientX - bounds.left,
          y: coalesced.clientY - bounds.top,
        };
        const normalized = getBackgroundPoint(point);
        if (!normalized) continue;
        setBrushCursor(point);
        const stroke = strokeRef.current;
        if (stroke?.pointerId === event.pointerId) appendStrokePoint(stroke, normalized);
      }
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const point = getCanvasPoint(event);
    if (drag.designScale <= 0) return;
    onTransformChange(
      drag.layerId,
      moveTransformByViewportDelta(
        drag.transform,
        (point.x - drag.startPoint.x) / drag.designScale,
        (point.y - drag.startPoint.y) / drag.designScale,
        CANONICAL_DESIGN_SIZE,
      ),
      'canvas-drag',
    );
  };

  const finishPointer = (event: PointerEvent<HTMLCanvasElement>) => {
    const stroke = strokeRef.current;
    if (stroke?.pointerId === event.pointerId) {
      const normalized = getBackgroundPoint(getCanvasPoint(event));
      if (normalized) appendStrokePoint(stroke, normalized);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      strokeRef.current = null;
      if (stroke.points.length > 0) {
        void onCommitBackgroundStroke?.({
          mode: stroke.mode,
          size: backgroundBrushSize,
          points: stroke.points,
        });
      }
      return;
    }
    finishDrag(event);
  };

  const cancelPointer = (event: PointerEvent<HTMLCanvasElement>) => {
    const stroke = strokeRef.current;
    if (stroke?.pointerId === event.pointerId) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      strokeRef.current = null;
      return;
    }
    finishDrag(event);
  };

  useEffect(() => {
    if (backgroundMode === 'idle') {
      strokeRef.current = null;
      setBrushCursor(null);
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      strokeRef.current = null;
      setBrushCursor(null);
      onBackgroundModeChange?.('idle');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [backgroundMode, onBackgroundModeChange]);

  return (
    <div className="relative h-full min-h-0 w-full">
      <canvas
        ref={canvasRef}
        aria-label="Design canvas"
        className="block h-full min-h-0 w-full touch-none"
        data-selected-layer-id={variation?.selectedLayerId || undefined}
        data-background-mode={backgroundMode}
        style={{ background: '#27313d' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => {
          if (!strokeRef.current) setBrushCursor(null);
        }}
        onPointerUp={finishPointer}
        onPointerCancel={cancelPointer}
      />
      {brushCursor && (backgroundMode === 'erase' || backgroundMode === 'restore') ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full border border-white shadow-[0_0_0_1px_rgba(0,0,0,0.8)]"
          style={{
            width: Math.max(2, backgroundBrushSize * Math.max(viewport.size.width, viewport.size.height) / 1000),
            height: Math.max(2, backgroundBrushSize * Math.max(viewport.size.width, viewport.size.height) / 1000),
            left: brushCursor.x,
            top: brushCursor.y,
            transform: 'translate(-50%, -50%)',
          }}
        />
      ) : null}
    </div>
  );
};
