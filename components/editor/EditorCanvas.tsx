import { useMemo, useRef, type PointerEvent } from 'react';
import { hitTestDesignLayers } from '../../editor/compositor';
import {
  getDecodedImageSources,
  type DecodedImageEntry,
} from '../../editor/decodedImages';
import { moveTransformByViewportDelta, type Size } from '../../editor/geometry';
import type { LookRenderCoordinator } from '../../editor/lookRenderCoordinator';
import type {
  DesignVariation,
  EditorAsset,
  EditorTool,
  LayerTransform,
} from '../../editor/model';
import { useVariationPreviewSurface } from './VariationPreviewCanvas';

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
}

interface DragState {
  pointerId: number;
  layerId: string;
  startPoint: { x: number; y: number };
  transform: LayerTransform;
  viewportSize: Size;
}

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
}: EditorCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
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
    background: '#1f1f1f',
    retryGeneration: lookRetryGeneration,
    onFailureChange: onLookFailureChange,
  });

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
    if (tool !== 'select' || viewport.size.width <= 0 || viewport.size.height <= 0) return;
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    const point = getCanvasPoint(event);
    const hitLayer = hitTestDesignLayers(
      context,
      point,
      viewport.size,
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
      viewportSize: { ...viewport.size },
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const point = getCanvasPoint(event);
    onTransformChange(
      drag.layerId,
      moveTransformByViewportDelta(
        drag.transform,
        point.x - drag.startPoint.x,
        point.y - drag.startPoint.y,
        drag.viewportSize,
      ),
      'canvas-drag',
    );
  };

  return (
    <canvas
      ref={canvasRef}
      aria-label="Design canvas"
      className="block h-full min-h-0 w-full touch-none"
      data-selected-layer-id={variation?.selectedLayerId || undefined}
      style={{ background: '#1f1f1f' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
    />
  );
};
