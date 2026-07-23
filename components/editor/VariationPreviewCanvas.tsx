import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { renderDesignLayers } from '../../editor/compositor';
import {
  getDecodedImageSources,
  type DecodedImageEntry,
} from '../../editor/decodedImages';
import type { Size } from '../../editor/geometry';
import { serializeVariationLook } from '../../editor/lookModel';
import {
  type LookRenderCoordinator,
  type LookRenderOutcome,
} from '../../editor/lookRenderCoordinator';
import type { RgbaFrame } from '../../editor/lookProcessor';
import type {
  DesignLayer,
  DesignVariation,
  EditorAsset,
} from '../../editor/model';

export type PreviewBackground = '#1f1f1f' | '#f5f5f3' | '#161616';
export type PreviewPixelBound = 240 | 800 | 1600;

export interface VariationPreviewCanvasProps {
  surfaceId: string;
  variation: DesignVariation;
  assetsById: Record<string, EditorAsset>;
  imagesById: Record<string, DecodedImageEntry>;
  coordinator: LookRenderCoordinator;
  maxPixelDimension: PreviewPixelBound;
  background: PreviewBackground;
  zoom?: number;
  ariaLabel: string;
  onFailureChange?: (message: string | null) => void;
  retryGeneration?: number;
}

export interface ComposeBoundedVariationFrameOptions {
  variation: DesignVariation;
  assetsById: Record<string, EditorAsset>;
  imagesById: Record<string, DecodedImageEntry>;
  viewport: Size;
  pixelRatio: number;
  maxPixelDimension: PreviewPixelBound;
}

export interface BoundedVariationFrame {
  frame: RgbaFrame;
  renderKey: string;
}

export interface SelectedPreviewOutcome {
  displayFrame: RgbaFrame;
  readyFrame: RgbaFrame | null;
  failure: string | null;
}

export interface PreviewFailureAuthority {
  renderKey: string;
  message: string;
}

export interface ReadyPreviewFrameAuthority {
  variationId: string;
  width: number;
  height: number;
}

export const canRetainReadyPreviewFrame = (
  authority: ReadyPreviewFrameAuthority | null,
  variationId: string,
  frame: RgbaFrame,
) => Boolean(
  authority &&
  authority.variationId === variationId &&
  authority.width === frame.width &&
  authority.height === frame.height
);

export type PreviewFailureAuthorityEvent =
  | { type: 'clear' }
  | { type: 'start'; renderKey: string; retry: boolean }
  | { type: 'outcome'; expectedRenderKey: string; outcome: LookRenderOutcome };

export const reducePreviewFailureAuthority = (
  current: PreviewFailureAuthority | null,
  event: PreviewFailureAuthorityEvent,
): PreviewFailureAuthority | null => {
  if (event.type === 'clear') return null;
  if (event.type === 'start') {
    return event.retry && current?.renderKey === event.renderKey ? current : null;
  }
  if (event.outcome.status === 'stale' || event.outcome.renderKey !== event.expectedRenderKey) {
    return current;
  }
  if (event.outcome.status === 'ready') return null;
  return {
    renderKey: event.outcome.renderKey,
    message: event.outcome.message,
  };
};

interface PreviewViewport {
  size: Size;
  pixelRatio: number;
}

interface UseVariationPreviewSurfaceOptions extends Omit<VariationPreviewCanvasProps, 'ariaLabel'> {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onViewportChange?: (viewport: PreviewViewport) => void;
}

const initialViewport: PreviewViewport = {
  size: { width: 0, height: 0 },
  pixelRatio: 1,
};

const finiteDimension = (value: number) =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

export const resolveBoundedPixelSize = (
  viewport: Size,
  pixelRatio: number,
  maxPixelDimension: number,
): Size => {
  const width = finiteDimension(viewport.width);
  const height = finiteDimension(viewport.height);
  if (width === 0 || height === 0) return { width: 0, height: 0 };
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  const maximum = Number.isFinite(maxPixelDimension) ? Math.max(1, Math.floor(maxPixelDimension)) : 1;
  const rawWidth = width * ratio;
  const rawHeight = height * ratio;
  const scale = Math.min(1, maximum / Math.max(rawWidth, rawHeight));
  return {
    width: Math.max(1, Math.round(rawWidth * scale)),
    height: Math.max(1, Math.round(rawHeight * scale)),
  };
};

const canonicalTransform = (layer: DesignLayer) => ({
  x: layer.transform.x,
  y: layer.transform.y,
  scale: layer.transform.scale,
  rotation: layer.transform.rotation,
  flipX: layer.transform.flipX,
  flipY: layer.transform.flipY,
});

const canonicalLayer = (layer: DesignLayer) => layer.type === 'image' ? {
  id: layer.id,
  type: layer.type,
  name: layer.name,
  assetId: layer.assetId,
  visible: layer.visible,
  opacity: layer.opacity,
  transform: canonicalTransform(layer),
  crop: {
    x: layer.crop.x,
    y: layer.crop.y,
    width: layer.crop.width,
    height: layer.crop.height,
  },
  adjustments: {
    brightness: layer.adjustments.brightness,
    contrast: layer.adjustments.contrast,
    saturation: layer.adjustments.saturation,
  },
  backgroundRemoval: layer.backgroundRemoval,
} : layer.type === 'text' ? {
  id: layer.id,
  type: layer.type,
  name: layer.name,
  visible: layer.visible,
  opacity: layer.opacity,
  transform: canonicalTransform(layer),
  text: layer.text,
  fontFamily: layer.fontFamily,
  fontSize: layer.fontSize,
  color: layer.color,
  align: layer.align,
  letterSpacing: layer.letterSpacing,
  outlineWidth: layer.outlineWidth,
  outlineColor: layer.outlineColor,
} : {
  id: layer.id,
  type: layer.type,
  name: layer.name,
  sourceLayerId: layer.sourceLayerId,
  svgAssetId: layer.svgAssetId,
  visible: layer.visible,
  opacity: layer.opacity,
  transform: canonicalTransform(layer),
  settings: layer.settings,
  sourceFingerprint: layer.sourceFingerprint,
  sourceFrame: layer.sourceFrame,
};

const hashCanonicalValue = (value: string) => {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return [first, second]
    .map((part) => (part >>> 0).toString(16).padStart(8, '0'))
    .join('');
};

const createVariationRenderKey = (
  variation: DesignVariation,
  assetsById: Record<string, EditorAsset>,
  dimensions: Size,
) => {
  const assetIds = [...new Set(
    variation.layers
      .filter((layer): layer is Extract<DesignLayer, { type: 'image' }> => layer.type === 'image')
      .flatMap((layer) => [
        layer.assetId,
        ...(layer.backgroundRemoval.preparedAssetId
          ? [layer.backgroundRemoval.preparedAssetId]
          : []),
      ]),
  )].sort();
  const canonical = JSON.stringify({
    dimensions: [dimensions.width, dimensions.height],
    layers: variation.layers.map(canonicalLayer),
    assets: assetIds.map((assetId) => {
      const asset = assetsById[assetId];
      return asset ? [assetId, asset.id, asset.width, asset.height] : [assetId, null];
    }),
    look: JSON.parse(serializeVariationLook(variation.look)) as unknown,
  });
  return `${variation.id}:${hashCanonicalValue(canonical)}:${canonical.length}`;
};

const hasEveryVisibleImage = (
  variation: DesignVariation,
  assetsById: Record<string, EditorAsset>,
  imagesById: Record<string, DecodedImageEntry>,
) => variation.layers.every((layer) => (
  layer.type !== 'image' ||
  !layer.visible ||
  Boolean(
    (assetsById[layer.assetId] && imagesById[layer.assetId]) ||
    (
      layer.backgroundRemoval.enabled &&
      layer.backgroundRemoval.preparedAssetId &&
      assetsById[layer.backgroundRemoval.preparedAssetId] &&
      imagesById[layer.backgroundRemoval.preparedAssetId]
    ),
  )
));

export const composeBoundedVariationFrame = (
  canvas: HTMLCanvasElement,
  options: ComposeBoundedVariationFrameOptions,
): BoundedVariationFrame | null => {
  const {
    variation,
    assetsById,
    imagesById,
    viewport,
    pixelRatio,
    maxPixelDimension,
  } = options;
  const dimensions = resolveBoundedPixelSize(viewport, pixelRatio, maxPixelDimension);
  if (
    dimensions.width === 0 ||
    dimensions.height === 0 ||
    !hasEveryVisibleImage(variation, assetsById, imagesById)
  ) return null;

  if (canvas.width !== dimensions.width) canvas.width = dimensions.width;
  if (canvas.height !== dimensions.height) canvas.height = dimensions.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
  context.filter = 'none';
  context.clearRect(0, 0, dimensions.width, dimensions.height);
  context.save();
  context.scale(dimensions.width / viewport.width, dimensions.height / viewport.height);
  renderDesignLayers(context, viewport, variation.layers, {
    metadataById: assetsById,
    imagesById: getDecodedImageSources(imagesById),
  });
  context.restore();
  const imageData = context.getImageData(0, 0, dimensions.width, dimensions.height);
  return {
    frame: {
      width: dimensions.width,
      height: dimensions.height,
      pixels: new Uint8ClampedArray(imageData.data),
    },
    renderKey: createVariationRenderKey(variation, assetsById, dimensions),
  };
};

export const selectPreviewOutcomeFrame = (
  outcome: LookRenderOutcome,
  expectedRenderKey: string,
  unprocessedFrame: RgbaFrame,
  lastReadyFrame: RgbaFrame | null,
): SelectedPreviewOutcome | null => {
  if (outcome.status === 'stale' || outcome.renderKey !== expectedRenderKey) return null;
  if (outcome.status === 'ready') {
    return { displayFrame: outcome.frame, readyFrame: outcome.frame, failure: null };
  }
  return {
    displayFrame: lastReadyFrame ?? unprocessedFrame,
    readyFrame: lastReadyFrame,
    failure: outcome.message,
  };
};

const paintFrame = (
  canvas: HTMLCanvasElement,
  frameCanvas: HTMLCanvasElement,
  frame: RgbaFrame,
  background: PreviewBackground,
  zoom: number,
) => {
  if (canvas.width !== frame.width) canvas.width = frame.width;
  if (canvas.height !== frame.height) canvas.height = frame.height;
  if (frameCanvas.width !== frame.width) frameCanvas.width = frame.width;
  if (frameCanvas.height !== frame.height) frameCanvas.height = frame.height;
  const context = canvas.getContext('2d');
  const frameContext = frameCanvas.getContext('2d');
  if (!context || !frameContext) return;

  const imageData = frameContext.createImageData(frame.width, frame.height);
  imageData.data.set(frame.pixels);
  frameContext.putImageData(imageData, 0, 0);

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const safeZoom = Number.isFinite(zoom) ? Math.max(0.01, zoom) : 1;
  const width = canvas.width * safeZoom;
  const height = canvas.height * safeZoom;
  context.drawImage(
    frameCanvas,
    (canvas.width - width) / 2,
    (canvas.height - height) / 2,
    width,
    height,
  );
};

export const useVariationPreviewSurface = ({
  canvasRef,
  surfaceId,
  variation,
  assetsById,
  imagesById,
  coordinator,
  maxPixelDimension,
  background,
  zoom = 1,
  onFailureChange,
  retryGeneration = 0,
  onViewportChange,
}: UseVariationPreviewSurfaceOptions): PreviewViewport => {
  const [viewport, setViewport] = useState<PreviewViewport>(initialViewport);
  const compositionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentRenderKeyRef = useRef<string | null>(null);
  const unprocessedFrameRef = useRef<RgbaFrame | null>(null);
  const lastReadyFrameRef = useRef<RgbaFrame | null>(null);
  const lastReadyAuthorityRef = useRef<ReadyPreviewFrameAuthority | null>(null);
  const failureAuthorityRef = useRef<PreviewFailureAuthority | null>(null);
  const failureCallbackRef = useRef(onFailureChange);
  const viewportCallbackRef = useRef(onViewportChange);
  const retryGenerationRef = useRef(retryGeneration);
  failureCallbackRef.current = onFailureChange;
  viewportCallbackRef.current = onViewportChange;

  const updateFailureAuthority = useCallback((
    event: PreviewFailureAuthorityEvent,
    emitClear = false,
  ) => {
    const current = failureAuthorityRef.current;
    const next = reducePreviewFailureAuthority(current, event);
    failureAuthorityRef.current = next;
    const changed = current?.renderKey !== next?.renderKey || current?.message !== next?.message;
    if (changed || (emitClear && next === null)) {
      failureCallbackRef.current?.(next?.message ?? null);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const resize = (width: number, height: number) => {
      const next: PreviewViewport = {
        size: { width, height },
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      };
      setViewport((current) => (
        current.size.width === next.size.width &&
        current.size.height === next.size.height &&
        current.pixelRatio === next.pixelRatio
          ? current
          : next
      ));
      viewportCallbackRef.current?.(next);
    };
    const observer = new ResizeObserver(([entry]) => {
      resize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(canvas);
    resize(canvas.clientWidth, canvas.clientHeight);
    return () => observer.disconnect();
  }, [canvasRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || viewport.size.width <= 0 || viewport.size.height <= 0) {
      currentRenderKeyRef.current = null;
      unprocessedFrameRef.current = null;
      coordinator.clearSurface(surfaceId);
      updateFailureAuthority({ type: 'clear' }, true);
      return undefined;
    }
    compositionCanvasRef.current ??= document.createElement('canvas');
    frameCanvasRef.current ??= document.createElement('canvas');
    const variationChanged = Boolean(
      lastReadyAuthorityRef.current &&
      lastReadyAuthorityRef.current.variationId !== variation.id
    );
    if (variationChanged) {
      lastReadyFrameRef.current = null;
      lastReadyAuthorityRef.current = null;
    }
    const composition = composeBoundedVariationFrame(compositionCanvasRef.current, {
      variation,
      assetsById,
      imagesById,
      viewport: viewport.size,
      pixelRatio: viewport.pixelRatio,
      maxPixelDimension,
    });
    if (!composition) {
      if (variationChanged) {
        const context = canvas.getContext('2d');
        if (context) {
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.fillStyle = background;
          context.fillRect(0, 0, canvas.width, canvas.height);
        }
      }
      currentRenderKeyRef.current = null;
      unprocessedFrameRef.current = null;
      coordinator.clearSurface(surfaceId);
      updateFailureAuthority({ type: 'clear' }, true);
      return undefined;
    }

    const { frame, renderKey } = composition;
    if (!canRetainReadyPreviewFrame(lastReadyAuthorityRef.current, variation.id, frame)) {
      lastReadyFrameRef.current = null;
      lastReadyAuthorityRef.current = null;
    }
    currentRenderKeyRef.current = renderKey;
    unprocessedFrameRef.current = frame;
    paintFrame(
      canvas,
      frameCanvasRef.current,
      lastReadyFrameRef.current ?? frame,
      background,
      zoom,
    );

    if (variation.look.id === 'original') {
      coordinator.clearSurface(surfaceId);
      lastReadyFrameRef.current = frame;
      lastReadyAuthorityRef.current = {
        variationId: variation.id,
        width: frame.width,
        height: frame.height,
      };
      updateFailureAuthority({ type: 'clear' }, true);
      paintFrame(canvas, frameCanvasRef.current, frame, background, zoom);
      return undefined;
    }

    updateFailureAuthority({ type: 'start', renderKey, retry: false }, true);
    let active = true;
    void coordinator.render({
      surfaceId,
      renderKey,
      frame,
      look: variation.look,
    }).then((outcome) => {
      if (!active || currentRenderKeyRef.current !== renderKey || !frameCanvasRef.current) return;
      const selected = selectPreviewOutcomeFrame(
        outcome,
        renderKey,
        frame,
        lastReadyFrameRef.current,
      );
      if (!selected) return;
      lastReadyFrameRef.current = selected.readyFrame;
      if (selected.readyFrame) {
        lastReadyAuthorityRef.current = {
          variationId: variation.id,
          width: selected.readyFrame.width,
          height: selected.readyFrame.height,
        };
      }
      updateFailureAuthority({ type: 'outcome', expectedRenderKey: renderKey, outcome });
      if (canvasRef.current) {
        paintFrame(canvasRef.current, frameCanvasRef.current, selected.displayFrame, background, zoom);
      }
    });
    return () => { active = false; };
  }, [
    assetsById,
    background,
    canvasRef,
    coordinator,
    imagesById,
    maxPixelDimension,
    surfaceId,
    variation,
    viewport,
    zoom,
    updateFailureAuthority,
  ]);

  useEffect(() => {
    if (retryGenerationRef.current === retryGeneration) return undefined;
    retryGenerationRef.current = retryGeneration;
    const renderKey = currentRenderKeyRef.current;
    const unprocessedFrame = unprocessedFrameRef.current;
    if (!renderKey || !unprocessedFrame || variation.look.id === 'original') return undefined;

    updateFailureAuthority({ type: 'start', renderKey, retry: true });
    let active = true;
    void coordinator.retry(surfaceId).then((outcome) => {
      if (
        !active ||
        currentRenderKeyRef.current !== renderKey ||
        !frameCanvasRef.current
      ) return;
      const selected = selectPreviewOutcomeFrame(
        outcome,
        renderKey,
        unprocessedFrame,
        lastReadyFrameRef.current,
      );
      if (!selected) return;
      lastReadyFrameRef.current = selected.readyFrame;
      if (selected.readyFrame) {
        lastReadyAuthorityRef.current = {
          variationId: variation.id,
          width: selected.readyFrame.width,
          height: selected.readyFrame.height,
        };
      }
      updateFailureAuthority({ type: 'outcome', expectedRenderKey: renderKey, outcome });
      if (canvasRef.current) {
        paintFrame(canvasRef.current, frameCanvasRef.current, selected.displayFrame, background, zoom);
      }
    });
    return () => { active = false; };
  }, [
    background,
    canvasRef,
    coordinator,
    retryGeneration,
    surfaceId,
    updateFailureAuthority,
    variation.look.id,
    zoom,
  ]);

  useEffect(() => () => {
    currentRenderKeyRef.current = null;
    unprocessedFrameRef.current = null;
    lastReadyFrameRef.current = null;
    lastReadyAuthorityRef.current = null;
    coordinator.clearSurface(surfaceId);
    updateFailureAuthority({ type: 'clear' }, true);
  }, [coordinator, surfaceId, updateFailureAuthority]);

  return viewport;
};

export const VariationPreviewCanvas = (props: VariationPreviewCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useVariationPreviewSurface({ ...props, canvasRef });

  return (
    <canvas
      ref={canvasRef}
      aria-label={props.ariaLabel}
      className="block h-full min-h-0 w-full"
      data-look-preview="true"
      style={{ background: props.background }}
    />
  );
};
