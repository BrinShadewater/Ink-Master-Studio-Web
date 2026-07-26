import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from 'react';
import { hitTestDesignLayers } from '../../editor/compositor';
import {
  CANONICAL_DESIGN_SIZE,
  containCanonicalSurface,
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
  type Rect,
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
  CropRect,
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
const MIN_CANVAS_ZOOM = 0.6;
const MAX_CANVAS_ZOOM = 3;
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

export const resolveCanvasZoom = (current: number, deltaY: number) => {
  const direction = deltaY < 0 ? 1 : -1;
  return Math.max(
    MIN_CANVAS_ZOOM,
    Math.min(MAX_CANVAS_ZOOM, Number((current * (direction > 0 ? 1.15 : 1 / 1.15)).toFixed(3))),
  );
};

export const getZoomedDesignRect = (
  designRect: ReturnType<typeof containCanonicalSurface>,
  zoom: number,
  pan: Point = { x: 0, y: 0 },
) => {
  const safeZoom = Number.isFinite(zoom) ? Math.max(MIN_CANVAS_ZOOM, Math.min(MAX_CANVAS_ZOOM, zoom)) : 1;
  const width = designRect.width * safeZoom;
  const height = designRect.height * safeZoom;
  return {
    x: designRect.x + (designRect.width - width) / 2 + pan.x,
    y: designRect.y + (designRect.height - height) / 2 + pan.y,
    width,
    height,
    scale: Number((designRect.scale * safeZoom).toFixed(6)),
  };
};

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
  onCropChange?: (layerId: string, crop: CropRect, historyGroup: string) => void;
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

interface PanState {
  pointerId: number;
  startPoint: Point;
  startPan: Point;
}

export type CropHandle = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

interface CropPointerState {
  pointerId: number;
  mode: 'move' | 'resize';
  handle?: CropHandle;
  startPoint: Point;
  crop: CropRect;
  sourceRect: Rect;
  transform: ImageLayer['transform'];
  displayScale: number;
}

const cropMinimum = 0.05;

export const resizeCropRect = (
  crop: CropRect,
  handle: CropHandle,
  delta: NormalizedPoint,
): CropRect => {
  let left = crop.x;
  let top = crop.y;
  let right = crop.x + crop.width;
  let bottom = crop.y + crop.height;

  if (handle.includes('left')) left = clamp(left + delta.x, 0, right - cropMinimum);
  if (handle.includes('right')) right = clamp(right + delta.x, left + cropMinimum, 1);
  if (handle.includes('top')) top = clamp(top + delta.y, 0, bottom - cropMinimum);
  if (handle.includes('bottom')) bottom = clamp(bottom + delta.y, top + cropMinimum, 1);

  return {
    x: Number(left.toFixed(6)),
    y: Number(top.toFixed(6)),
    width: Number((right - left).toFixed(6)),
    height: Number((bottom - top).toFixed(6)),
  };
};

const cropKeyboardStep = (largeStep: boolean) => largeStep ? 0.05 : 0.01;

export const moveCropRectWithKeyboard = (
  crop: CropRect,
  key: string,
  largeStep = false,
): CropRect => {
  const step = cropKeyboardStep(largeStep);
  const delta = key === 'ArrowLeft'
    ? { x: -step, y: 0 }
    : key === 'ArrowRight'
      ? { x: step, y: 0 }
      : key === 'ArrowUp'
        ? { x: 0, y: -step }
        : key === 'ArrowDown'
          ? { x: 0, y: step }
          : null;
  if (!delta) return crop;
  return {
    ...crop,
    x: Number(clamp(crop.x + delta.x, 0, 1 - crop.width).toFixed(6)),
    y: Number(clamp(crop.y + delta.y, 0, 1 - crop.height).toFixed(6)),
  };
};

export const resizeCropRectWithKeyboard = (
  crop: CropRect,
  handle: CropHandle,
  key: string,
  largeStep = false,
): CropRect => {
  const step = cropKeyboardStep(largeStep);
  const delta = key === 'ArrowLeft'
    ? { x: -step, y: 0 }
    : key === 'ArrowRight'
      ? { x: step, y: 0 }
      : key === 'ArrowUp'
        ? { x: 0, y: -step }
        : key === 'ArrowDown'
          ? { x: 0, y: step }
          : null;
  return delta ? resizeCropRect(crop, handle, delta) : crop;
};

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
  onCropChange,
  backgroundMode = 'idle',
  backgroundBrushSize = 32,
  onPickBackground,
  onCommitBackgroundStroke,
  onBackgroundModeChange,
}: EditorCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const strokeRef = useRef<StrokeState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const cropPointerRef = useRef<CropPointerState | null>(null);
  const [brushCursor, setBrushCursor] = useState<Point | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
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
    background: 'transparent',
    zoom,
    pan,
    retryGeneration: lookRetryGeneration,
    onFailureChange: onLookFailureChange,
  });
  const zoomedDesignRect = useMemo(
    () => getZoomedDesignRect(viewport.designRect, zoom, pan),
    [viewport.designRect, zoom, pan],
  );

  const getCanvasPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const selectedLayer = activeVariation.layers.find((candidate) =>
    candidate.id === activeVariation.selectedLayerId);
  const selectedImage = selectedLayer?.type === 'image' ? selectedLayer : undefined;

  const getBackgroundPoint = (point: Point): NormalizedPoint | null => {
    if (!selectedImage) return null;
    const source = assetsById[selectedImage.assetId];
    if (!source) return null;
    const designPoint = displayPointToDesignPoint(point, zoomedDesignRect);
    if (!designPoint) return null;
    return canvasPointToCropPoint(
      designPoint,
      CANONICAL_DESIGN_SIZE,
      source,
      selectedImage,
    );
  };

  const cropFrame = useMemo(() => {
    if (!selectedImage) return null;
    const source = assetsById[selectedImage.assetId];
    if (!source) return null;
    const sourceRect = getLayerDrawRect(
      source,
      CANONICAL_DESIGN_SIZE,
      selectedImage.transform,
      { x: 0, y: 0, width: 1, height: 1 },
    );
    const localX = (selectedImage.crop.x + selectedImage.crop.width / 2 - 0.5) * sourceRect.width * (selectedImage.transform.flipX ? -1 : 1);
    const localY = (selectedImage.crop.y + selectedImage.crop.height / 2 - 0.5) * sourceRect.height * (selectedImage.transform.flipY ? -1 : 1);
    const radians = selectedImage.transform.rotation * Math.PI / 180;
    const center = {
      x: sourceRect.x + sourceRect.width / 2 + localX * Math.cos(radians) - localY * Math.sin(radians),
      y: sourceRect.y + sourceRect.height / 2 + localX * Math.sin(radians) + localY * Math.cos(radians),
    };
    return {
      sourceRect,
      center: {
        x: zoomedDesignRect.x + center.x * zoomedDesignRect.scale,
        y: zoomedDesignRect.y + center.y * zoomedDesignRect.scale,
      },
      width: sourceRect.width * selectedImage.crop.width * zoomedDesignRect.scale,
      height: sourceRect.height * selectedImage.crop.height * zoomedDesignRect.scale,
    };
  }, [assetsById, selectedImage, zoomedDesignRect]);

  const toCropDelta = (drag: CropPointerState, point: Point): NormalizedPoint => {
    const dx = point.x - drag.startPoint.x;
    const dy = point.y - drag.startPoint.y;
    const radians = -drag.transform.rotation * Math.PI / 180;
    let localX = dx * Math.cos(radians) - dy * Math.sin(radians);
    let localY = dx * Math.sin(radians) + dy * Math.cos(radians);
    if (drag.transform.flipX) localX *= -1;
    if (drag.transform.flipY) localY *= -1;
    return {
      x: localX / Math.max(1, drag.sourceRect.width * drag.displayScale),
      y: localY / Math.max(1, drag.sourceRect.height * drag.displayScale),
    };
  };

  const beginCropPointer = (
    event: PointerEvent<HTMLElement>,
    mode: CropPointerState['mode'],
    handle?: CropHandle,
  ) => {
    if (event.button !== 0 || !selectedImage || !cropFrame) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    cropPointerRef.current = {
      pointerId: event.pointerId,
      mode,
      handle,
      startPoint: { x: event.clientX, y: event.clientY },
      crop: { ...selectedImage.crop },
      sourceRect: cropFrame.sourceRect,
      transform: { ...selectedImage.transform },
      displayScale: zoomedDesignRect.scale,
    };
  };

  const moveCrop = (event: PointerEvent<HTMLElement>) => {
    const drag = cropPointerRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !selectedImage || !onCropChange) return;
    const delta = toCropDelta(drag, { x: event.clientX, y: event.clientY });
    const nextCrop = drag.mode === 'resize' && drag.handle
      ? resizeCropRect(drag.crop, drag.handle, delta)
      : {
        ...drag.crop,
        x: clamp(drag.crop.x + delta.x, 0, 1 - drag.crop.width),
        y: clamp(drag.crop.y + delta.y, 0, 1 - drag.crop.height),
      };
    onCropChange(selectedImage.id, nextCrop, drag.mode === 'resize' ? 'canvas-crop-resize' : 'canvas-crop-move');
  };

  const finishCrop = (event: PointerEvent<HTMLElement>) => {
    if (!cropPointerRef.current || cropPointerRef.current.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    cropPointerRef.current = null;
    onTransformEnd();
  };

  const finishKeyboardChange = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!event.key.startsWith('Arrow')) return;
    onTransformEnd();
  };

  const handleCropMoveKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!selectedImage || !onCropChange || !event.key.startsWith('Arrow')) return;
    event.preventDefault();
    event.stopPropagation();
    onCropChange(
      selectedImage.id,
      moveCropRectWithKeyboard(selectedImage.crop, event.key, event.shiftKey),
      'canvas-crop-keyboard-move',
    );
  };

  const handleCropResizeKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    handle: CropHandle,
  ) => {
    if (!selectedImage || !onCropChange || !event.key.startsWith('Arrow')) return;
    event.preventDefault();
    event.stopPropagation();
    onCropChange(
      selectedImage.id,
      resizeCropRectWithKeyboard(selectedImage.crop, handle, event.key, event.shiftKey),
      `canvas-crop-keyboard-${handle}`,
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
    if (event.button === 1) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      panRef.current = {
        pointerId: event.pointerId,
        startPoint: getCanvasPoint(event),
        startPan: { ...pan },
      };
      return;
    }
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
    const designPoint = displayPointToDesignPoint(point, zoomedDesignRect);
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
      designScale: zoomedDesignRect.scale,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const panState = panRef.current;
    if (panState?.pointerId === event.pointerId) {
      const point = getCanvasPoint(event);
      setPan({
        x: panState.startPan.x + point.x - panState.startPoint.x,
        y: panState.startPan.y + point.y - panState.startPoint.y,
      });
      return;
    }
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
    const panState = panRef.current;
    if (panState?.pointerId === event.pointerId) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      panRef.current = null;
      return;
    }
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
    const panState = panRef.current;
    if (panState?.pointerId === event.pointerId) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      panRef.current = null;
      return;
    }
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

  const handleWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    if (!event.shiftKey) return;
    event.preventDefault();
    setZoom((current) => resolveCanvasZoom(current, event.deltaY));
  };

  const handleCanvasKeyDown = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    if (
      tool !== 'select' ||
      backgroundMode !== 'idle' ||
      !selectedLayer ||
      !event.key.startsWith('Arrow') ||
      zoomedDesignRect.scale <= 0
    ) return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    onTransformChange(
      selectedLayer.id,
      moveTransformByViewportDelta(
        selectedLayer.transform,
        dx / zoomedDesignRect.scale,
        dy / zoomedDesignRect.scale,
        CANONICAL_DESIGN_SIZE,
      ),
      'canvas-keyboard-move',
    );
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
    <div className="relative h-full min-h-0 w-full bg-[#101820]">
      {variation?.selectedLayerId ? (
        <p id="editor-canvas-keyboard-help" className="sr-only">
          Use the Arrow keys to move the selected layer. Hold Shift for a larger step.
        </p>
      ) : null}
      <canvas
        ref={canvasRef}
        aria-label="Design canvas"
        aria-describedby={variation?.selectedLayerId ? 'editor-canvas-keyboard-help' : undefined}
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight"
        className="block h-full min-h-0 w-full cursor-grab touch-none active:cursor-grabbing"
        tabIndex={variation ? 0 : -1}
        data-selected-layer-id={variation?.selectedLayerId || undefined}
        data-background-mode={backgroundMode}
        style={{ background: 'transparent' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => {
          if (!strokeRef.current) setBrushCursor(null);
        }}
        onPointerUp={finishPointer}
        onPointerCancel={cancelPointer}
        onWheel={handleWheel}
        onKeyDown={handleCanvasKeyDown}
        onKeyUp={finishKeyboardChange}
        onBlur={onTransformEnd}
      />
      {tool === 'crop' && selectedImage && cropFrame ? (
        <div
          aria-label="Crop frame. Drag inside or use the Arrow keys to reposition. Hold Shift for a larger step."
          className="absolute z-20 cursor-move border-2 border-emerald-400 shadow-[0_0_0_9999px_rgba(4,10,15,0.56)]"
          role="group"
          tabIndex={0}
          style={{
            left: cropFrame.center.x,
            top: cropFrame.center.y,
            width: cropFrame.width,
            height: cropFrame.height,
            transform: `translate(-50%, -50%) rotate(${selectedImage.transform.rotation}deg) scale(${selectedImage.transform.flipX ? -1 : 1}, ${selectedImage.transform.flipY ? -1 : 1})`,
            backgroundImage: 'linear-gradient(to right, transparent 33.2%, rgba(114,217,213,.8) 33.2%, rgba(114,217,213,.8) 33.8%, transparent 33.8%, transparent 66.2%, rgba(114,217,213,.8) 66.2%, rgba(114,217,213,.8) 66.8%, transparent 66.8%), linear-gradient(to bottom, transparent 33.2%, rgba(114,217,213,.8) 33.2%, rgba(114,217,213,.8) 33.8%, transparent 33.8%, transparent 66.2%, rgba(114,217,213,.8) 66.2%, rgba(114,217,213,.8) 66.8%, transparent 66.8%)',
          }}
          onPointerDown={(event) => beginCropPointer(event, 'move')}
          onPointerMove={moveCrop}
          onPointerUp={finishCrop}
          onPointerCancel={finishCrop}
          onKeyDown={handleCropMoveKeyDown}
          onKeyUp={finishKeyboardChange}
          onBlur={onTransformEnd}
        >
          <span className="absolute -top-7 left-0 bg-emerald-400 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-950">Drag or resize</span>
          {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((handle) => (
            <button
              key={handle}
              type="button"
              aria-label={`Resize crop from ${handle.replace('-', ' ')}. Use the Arrow keys. Hold Shift for a larger step.`}
              className={`absolute grid h-11 w-11 place-items-center bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${handle === 'top-left' ? '-left-[23px] -top-[23px] cursor-nwse-resize' : handle === 'top-right' ? '-right-[23px] -top-[23px] cursor-nesw-resize' : handle === 'bottom-left' ? '-bottom-[23px] -left-[23px] cursor-nesw-resize' : '-bottom-[23px] -right-[23px] cursor-nwse-resize'}`}
              onPointerDown={(event) => beginCropPointer(event, 'resize', handle)}
              onPointerMove={moveCrop}
              onPointerUp={finishCrop}
              onPointerCancel={finishCrop}
              onKeyDown={(event) => handleCropResizeKeyDown(event, handle)}
              onKeyUp={finishKeyboardChange}
              onBlur={onTransformEnd}
            >
              <span aria-hidden="true" className="h-3 w-3 border-2 border-neutral-950 bg-emerald-400" />
            </button>
          ))}
        </div>
      ) : null}
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
