import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { hitTestDesignLayers, renderDesignLayers, type CompositorAssets } from '../../editor/compositor';
import { moveTransformByViewportDelta, type Size } from '../../editor/geometry';
import type { EditorAsset, EditorTool, DesignLayer, LayerTransform } from '../../editor/model';

export interface EditorCanvasProps {
  layers: DesignLayer[];
  selectedLayerId: string | null;
  assetsById: Record<string, EditorAsset>;
  /**
   * Borrowed source URLs. Their creator owns URL lifecycle and revocation;
   * EditorCanvas consumes them without revoking them.
   */
  assetUrlsById: Record<string, string>;
  tool: EditorTool;
  onSelectLayer: (layerId: string) => void;
  onTransformChange: (layerId: string, transform: LayerTransform, historyGroup: string) => void;
  onTransformEnd: () => void;
}

interface ViewportState {
  size: Size;
  pixelRatio: number;
}

interface DragState {
  pointerId: number;
  layerId: string;
  startPoint: { x: number; y: number };
  transform: LayerTransform;
  viewportSize: Size;
}

interface DecodeEntry {
  active: boolean;
  image: HTMLImageElement;
  loaded: boolean;
  url: string;
}

export interface DecodedImageEntry {
  url: string;
  image: CanvasImageSource;
}

export interface DecodedImageController {
  sync: (assetUrlsById: Record<string, string>) => void;
  dispose: () => void;
}

export const createDecodedImageController = (
  createImage: () => HTMLImageElement,
  publish: (imagesById: Record<string, DecodedImageEntry>) => void,
): DecodedImageController => {
  const entriesByUrl = new Map<string, DecodeEntry>();
  let currentUrlsById: Record<string, string> = {};
  let disposed = false;

  const publishCurrent = () => {
    if (disposed) return;
    const imagesById: Record<string, DecodedImageEntry> = {};
    for (const [assetId, url] of Object.entries(currentUrlsById)) {
      const entry = entriesByUrl.get(url);
      if (entry?.active && entry.loaded) imagesById[assetId] = { url, image: entry.image };
    }
    publish(imagesById);
  };

  const deactivate = (entry: DecodeEntry) => {
    entry.active = false;
    entry.image.onload = null;
    entry.image.onerror = null;
  };

  return {
    sync(nextUrlsById) {
      // A cleanup/setup lifecycle replay may reuse this controller instance.
      disposed = false;
      currentUrlsById = { ...nextUrlsById };
      const activeUrls = new Set(Object.values(currentUrlsById));
      for (const [url, entry] of entriesByUrl) {
        if (activeUrls.has(url)) continue;
        deactivate(entry);
        entriesByUrl.delete(url);
      }

      for (const url of activeUrls) {
        if (entriesByUrl.has(url)) continue;
        const image = createImage();
        const entry: DecodeEntry = { active: true, image, loaded: false, url };
        entriesByUrl.set(url, entry);
        image.onload = () => {
          if (disposed || !entry.active || entriesByUrl.get(url) !== entry) return;
          entry.loaded = true;
          publishCurrent();
        };
        image.onerror = () => {
          if (disposed || !entry.active || entriesByUrl.get(url) !== entry) return;
          entry.loaded = false;
          publishCurrent();
        };
        image.src = url;
      }
      publishCurrent();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of entriesByUrl.values()) deactivate(entry);
      entriesByUrl.clear();
      currentUrlsById = {};
    },
  };
};

export const getCurrentDecodedImages = (
  decodedImagesById: Record<string, DecodedImageEntry>,
  assetUrlsById: Record<string, string>,
): Record<string, CanvasImageSource> => {
  const imagesById: Record<string, CanvasImageSource> = {};
  for (const [assetId, url] of Object.entries(assetUrlsById)) {
    const decoded = decodedImagesById[assetId];
    if (decoded?.url === url) imagesById[assetId] = decoded.image;
  }
  return imagesById;
};

const initialViewport: ViewportState = {
  size: { width: 0, height: 0 },
  pixelRatio: 1,
};

export const EditorCanvas = ({
  layers,
  selectedLayerId,
  assetsById,
  assetUrlsById,
  tool,
  onSelectLayer,
  onTransformChange,
  onTransformEnd,
}: EditorCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [decodedImagesById, setDecodedImagesById] = useState<Record<string, DecodedImageEntry>>({});
  const [viewport, setViewport] = useState<ViewportState>(initialViewport);
  const decoderRef = useRef<DecodedImageController | null>(null);
  if (!decoderRef.current) {
    decoderRef.current = createDecodedImageController(() => new Image(), setDecodedImagesById);
  }
  const decoder = decoderRef.current;
  const imagesById = useMemo(
    () => getCurrentDecodedImages(decodedImagesById, assetUrlsById),
    [assetUrlsById, decodedImagesById],
  );

  useEffect(() => {
    decoder.sync(assetUrlsById);
  }, [assetUrlsById, decoder]);

  useEffect(() => () => decoder.dispose(), [decoder]);

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
    if (viewport.size.width <= 0 || viewport.size.height <= 0) return;

    const compositorAssets: CompositorAssets = { metadataById: assetsById, imagesById };
    context.save();
    context.scale(viewport.pixelRatio, viewport.pixelRatio);
    context.beginPath();
    context.rect(0, 0, viewport.size.width, viewport.size.height);
    context.clip();
    renderDesignLayers(context, viewport.size, layers, compositorAssets);
    context.restore();
  }, [assetsById, imagesById, layers, viewport]);

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
      layers,
      { metadataById: assetsById, imagesById },
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
      data-selected-layer-id={selectedLayerId ?? undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
    />
  );
};
