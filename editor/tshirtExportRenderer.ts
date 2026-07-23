import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import createPica from 'pica';
import {
  renderDesignLayers,
  type DesignCanvasContext,
} from './compositor';
import {
  buildCanvasFilter,
  getCroppedSourceRect,
  getLayerDrawRect,
  getTraceLayerDrawRect,
  type Rect,
  type Size,
} from './geometry';
import {
  applyVariationLook,
  MAX_EXPORT_LOOK_WORKING_BYTES,
} from './lookProcessor';
import type { ImageLayer, TraceLayer } from './model';
import {
  getTShirtExportPreset,
  resolveTShirtExportGeometry,
  type TShirtExportRenderMetadata,
} from './tshirtExportModel';
import type {
  TShirtExportAssetSnapshot,
  TShirtPngExportSnapshot,
} from './tshirtExportProtocol';
import {
  sanitizeTraceSvg,
  serializeSafeTraceDocument,
  type TraceXmlPlatform,
} from './traceSanitizer';

const RENDER_ERROR = 'Could not render T-shirt artwork.';
export const T_SHIRT_EXPORT_SOURCE_TILE_EDGE = 1024;
export const T_SHIRT_EXPORT_SOURCE_TILE_BYTES =
  T_SHIRT_EXPORT_SOURCE_TILE_EDGE * T_SHIRT_EXPORT_SOURCE_TILE_EDGE * 4;
export const T_SHIRT_EXPORT_LANCZOS3_RADIUS = 3;

export interface TShirtExportRendererDependencies {
  createCanvas: (width: number, height: number) => OffscreenCanvas;
  decodeBitmap: (asset: TShirtExportAssetSnapshot) => Promise<ImageBitmap>;
  resize: (
    source: OffscreenCanvas,
    destination: OffscreenCanvas,
    options: { filter: 'lanczos3' },
  ) => Promise<OffscreenCanvas>;
  traceXmlPlatform?: TraceXmlPlatform;
}

export interface TShirtExportRenderedFrame {
  canvas: OffscreenCanvas;
  metadata: TShirtExportRenderMetadata;
}

const workerXmlPlatform: TraceXmlPlatform = {
  DOMParser: DOMParser as unknown as new () => globalThis.DOMParser,
  XMLSerializer: XMLSerializer as unknown as new () => globalThis.XMLSerializer,
};

export const createBrowserTShirtExportRendererDependencies =
(): TShirtExportRendererDependencies => {
  const resizer = createPica({
    tile: T_SHIRT_EXPORT_SOURCE_TILE_EDGE,
    concurrency: 1,
    features: ['js', 'wasm'],
  });
  return {
    createCanvas: (width, height) => new OffscreenCanvas(width, height),
    decodeBitmap: async (asset) => {
      const blob = new Blob([asset.bytes], { type: asset.mimeType });
      if (asset.mimeType === 'image/svg+xml') {
        return createImageBitmap(blob, {
          resizeWidth: asset.width,
          resizeHeight: asset.height,
          resizeQuality: 'high',
        });
      }
      return createImageBitmap(blob);
    },
    resize: (source, destination, options) =>
      resizer.resize(source, destination, options),
    traceXmlPlatform: workerXmlPlatform,
  };
};

export const browserRendererDependencies =
  createBrowserTShirtExportRendererDependencies();

const canvasContext = (canvas: OffscreenCanvas): DesignCanvasContext => {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error(RENDER_ERROR);
  return context;
};

const disposeCanvas = (canvas: OffscreenCanvas) => {
  try {
    canvas.width = 0;
  } catch {
    // Continue releasing other owned resources.
  }
  try {
    canvas.height = 0;
  } catch {
    // Continue releasing other owned resources.
  }
};

const closeBitmap = (bitmap: ImageBitmap) => {
  try {
    bitmap.close();
  } catch {
    // Continue releasing other owned resources.
  }
};

const positiveCanvasEdge = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(RENDER_ERROR);
  return Math.max(1, Math.ceil(value));
};

const bytesToText = (bytes: ArrayBuffer) =>
  new TextDecoder('utf-8', { fatal: true }).decode(bytes);

const textToArrayBuffer = (value: string): ArrayBuffer => {
  const bytes = new TextEncoder().encode(value);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
};

const assetMapFromSnapshot = (
  assets: TShirtExportAssetSnapshot[],
): Map<string, TShirtExportAssetSnapshot> => {
  const byId = new Map<string, TShirtExportAssetSnapshot>();
  for (const asset of assets) {
    if (
      !asset.id ||
      byId.has(asset.id) ||
      !Number.isFinite(asset.width) ||
      !Number.isFinite(asset.height) ||
      asset.width <= 0 ||
      asset.height <= 0 ||
      !(asset.bytes instanceof ArrayBuffer) ||
      asset.bytes.byteLength === 0
    ) {
      throw new Error(RENDER_ERROR);
    }
    byId.set(asset.id, asset);
  }
  return byId;
};

interface RendererOwnership {
  canvases: Set<OffscreenCanvas>;
  bitmaps: Set<ImageBitmap>;
}

const ownCanvas = (
  dependencies: TShirtExportRendererDependencies,
  ownership: RendererOwnership,
  width: number,
  height: number,
) => {
  const expectedWidth = positiveCanvasEdge(width);
  const expectedHeight = positiveCanvasEdge(height);
  const canvas = dependencies.createCanvas(
    expectedWidth,
    expectedHeight,
  );
  ownership.canvases.add(canvas);
  if (canvas.width !== expectedWidth || canvas.height !== expectedHeight) {
    throw new Error(RENDER_ERROR);
  }
  return canvas;
};

const releaseCanvas = (
  ownership: RendererOwnership,
  canvas: OffscreenCanvas | null | undefined,
) => {
  if (!canvas || !ownership.canvases.delete(canvas)) return;
  disposeCanvas(canvas);
};

const releaseBitmap = (
  ownership: RendererOwnership,
  bitmap: ImageBitmap | null | undefined,
) => {
  if (!bitmap || !ownership.bitmaps.delete(bitmap)) return;
  closeBitmap(bitmap);
};

const decodeOwnedBitmap = async (
  dependencies: TShirtExportRendererDependencies,
  ownership: RendererOwnership,
  asset: TShirtExportAssetSnapshot,
) => {
  const bitmap = await dependencies.decodeBitmap(asset);
  if (
    !bitmap ||
    !Number.isFinite(bitmap.width) ||
    !Number.isFinite(bitmap.height) ||
    bitmap.width <= 0 ||
    bitmap.height <= 0 ||
    bitmap.width !== asset.width ||
    bitmap.height !== asset.height
  ) {
    closeBitmap(bitmap);
    throw new Error(RENDER_ERROR);
  }
  ownership.bitmaps.add(bitmap);
  return bitmap;
};

interface RasterScaleRecord {
  scale: number;
  layerName: string;
}

interface LocalPoint {
  x: number;
  y: number;
}

const clipPolygon = (
  points: LocalPoint[],
  inside: (point: LocalPoint) => boolean,
  intersection: (start: LocalPoint, end: LocalPoint) => LocalPoint,
) => {
  if (points.length === 0) return points;
  const output: LocalPoint[] = [];
  let start = points[points.length - 1];
  let startInside = inside(start);
  for (const end of points) {
    const endInside = inside(end);
    if (endInside !== startInside) output.push(intersection(start, end));
    if (endInside) output.push(end);
    start = end;
    startInside = endInside;
  }
  return output;
};

const clipPolygonToRect = (
  points: LocalPoint[],
  bounds: Rect,
): LocalPoint[] => {
  const left = bounds.x;
  const right = bounds.x + bounds.width;
  const top = bounds.y;
  const bottom = bounds.y + bounds.height;
  let clipped = clipPolygon(
    points,
    ({ x }) => x >= left,
    (start, end) => {
      const amount = (left - start.x) / (end.x - start.x);
      return { x: left, y: start.y + (end.y - start.y) * amount };
    },
  );
  clipped = clipPolygon(
    clipped,
    ({ x }) => x <= right,
    (start, end) => {
      const amount = (right - start.x) / (end.x - start.x);
      return { x: right, y: start.y + (end.y - start.y) * amount };
    },
  );
  clipped = clipPolygon(
    clipped,
    ({ y }) => y >= top,
    (start, end) => {
      const amount = (top - start.y) / (end.y - start.y);
      return { x: start.x + (end.x - start.x) * amount, y: top };
    },
  );
  return clipPolygon(
    clipped,
    ({ y }) => y <= bottom,
    (start, end) => {
      const amount = (bottom - start.y) / (end.y - start.y);
      return { x: start.x + (end.x - start.x) * amount, y: bottom };
    },
  );
};

const getVisibleLocalRect = (
  drawRect: Rect,
  viewport: Size,
  rotation: number,
  flipX: boolean,
  flipY: boolean,
): Rect | null => {
  const centerX = drawRect.x + drawRect.width / 2;
  const centerY = drawRect.y + drawRect.height / 2;
  const radians = rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const viewportInLayerSpace = [
    { x: 0, y: 0 },
    { x: viewport.width, y: 0 },
    { x: viewport.width, y: viewport.height },
    { x: 0, y: viewport.height },
  ].map((point) => {
    const dx = point.x - centerX;
    const dy = point.y - centerY;
    const unrotatedX = dx * cosine + dy * sine;
    const unrotatedY = -dx * sine + dy * cosine;
    return {
      x: flipX ? -unrotatedX : unrotatedX,
      y: flipY ? -unrotatedY : unrotatedY,
    };
  });
  const layerBounds = {
    x: -drawRect.width / 2,
    y: -drawRect.height / 2,
    width: drawRect.width,
    height: drawRect.height,
  };
  const visiblePolygon = clipPolygonToRect(viewportInLayerSpace, layerBounds);
  if (visiblePolygon.length < 3) return null;
  const minimumX = Math.min(...visiblePolygon.map(({ x }) => x));
  const maximumX = Math.max(...visiblePolygon.map(({ x }) => x));
  const minimumY = Math.min(...visiblePolygon.map(({ y }) => y));
  const maximumY = Math.max(...visiblePolygon.map(({ y }) => y));
  const width = maximumX - minimumX;
  const height = maximumY - minimumY;
  if (width <= 0 || height <= 0) return null;
  return { x: minimumX, y: minimumY, width, height };
};

const getPreparationSize = (visible: Rect, viewport: Size) => {
  const width = positiveCanvasEdge(visible.width);
  const height = positiveCanvasEdge(visible.height);
  const maximumEdge = Math.ceil(Math.hypot(viewport.width, viewport.height));
  const maximumPixels = Math.ceil(
    viewport.width * viewport.width + viewport.height * viewport.height,
  );
  if (
    width > maximumEdge ||
    height > maximumEdge ||
    width * height > maximumPixels + maximumEdge * 2
  ) {
    throw new Error(RENDER_ERROR);
  }
  return { width, height };
};

const mapLocalRectToSource = (
  local: Rect,
  drawRect: Rect,
  source: Rect,
): Rect => {
  const horizontalScale = source.width / drawRect.width;
  const verticalScale = source.height / drawRect.height;
  return {
    x: source.x + (local.x + drawRect.width / 2) * horizontalScale,
    y: source.y + (local.y + drawRect.height / 2) * verticalScale,
    width: local.width * horizontalScale,
    height: local.height * verticalScale,
  };
};

interface RasterAxisTile {
  sourceStart: number;
  sourceSize: number;
  destinationStart: number;
  destinationSize: number;
  innerDestinationStart: number;
  innerDestinationSize: number;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const getRasterAxisTiles = (
  visibleStart: number,
  visibleSize: number,
  sourceLimit: number,
  destinationSize: number,
): RasterAxisTile[] => {
  const scale = destinationSize / visibleSize;
  const overlap = Math.ceil(
    T_SHIRT_EXPORT_LANCZOS3_RADIUS / Math.min(1, scale),
  ) + 1;
  const maximumCoreSize =
    T_SHIRT_EXPORT_SOURCE_TILE_EDGE - overlap * 2;
  if (
    !Number.isFinite(scale) ||
    scale <= 0 ||
    overlap <= 0 ||
    maximumCoreSize < 1
  ) {
    throw new Error(RENDER_ERROR);
  }

  const sourceStart = clamp(Math.floor(visibleStart), 0, sourceLimit);
  const sourceEnd = clamp(
    Math.ceil(visibleStart + visibleSize),
    0,
    sourceLimit,
  );
  if (sourceEnd <= sourceStart) throw new Error(RENDER_ERROR);

  const mapToDestination = (sourcePosition: number) => clamp(
    Math.round(
      (sourcePosition - visibleStart) * destinationSize / visibleSize,
    ),
    0,
    destinationSize,
  );
  const tiles: RasterAxisTile[] = [];
  for (
    let innerSourceStart = sourceStart;
    innerSourceStart < sourceEnd;
    innerSourceStart += maximumCoreSize
  ) {
    const innerSourceEnd = Math.min(
      sourceEnd,
      innerSourceStart + maximumCoreSize,
    );
    const tileSourceStart = Math.max(
      sourceStart,
      innerSourceStart - overlap,
    );
    const tileSourceEnd = Math.min(sourceEnd, innerSourceEnd + overlap);
    const tileDestinationStart = mapToDestination(tileSourceStart);
    const tileDestinationEnd = mapToDestination(tileSourceEnd);
    const innerDestinationStart = mapToDestination(innerSourceStart);
    const innerDestinationEnd = mapToDestination(innerSourceEnd);
    const sourceSize = tileSourceEnd - tileSourceStart;
    const tileDestinationSize =
      tileDestinationEnd - tileDestinationStart;
    const innerDestinationSize =
      innerDestinationEnd - innerDestinationStart;
    if (innerDestinationSize <= 0) continue;
    if (
      sourceSize <= 0 ||
      sourceSize > T_SHIRT_EXPORT_SOURCE_TILE_EDGE ||
      tileDestinationSize <= 0 ||
      tileDestinationSize > destinationSize ||
      innerDestinationStart < tileDestinationStart ||
      innerDestinationEnd > tileDestinationEnd
    ) {
      throw new Error(RENDER_ERROR);
    }
    tiles.push({
      sourceStart: tileSourceStart,
      sourceSize,
      destinationStart: tileDestinationStart,
      destinationSize: tileDestinationSize,
      innerDestinationStart,
      innerDestinationSize,
    });
  }
  if (tiles.length === 0) throw new Error(RENDER_ERROR);
  return tiles;
};

const prepareTiledRasterRegion = async (
  bitmap: ImageBitmap,
  visibleSource: Rect,
  preparationSize: Size,
  viewport: Size,
  filter: string,
  dependencies: TShirtExportRendererDependencies,
  ownership: RendererOwnership,
) => {
  const horizontalTiles = getRasterAxisTiles(
    visibleSource.x,
    visibleSource.width,
    bitmap.width,
    preparationSize.width,
  );
  const verticalTiles = getRasterAxisTiles(
    visibleSource.y,
    visibleSource.height,
    bitmap.height,
    preparationSize.height,
  );
  const maximumDestinationEdge = Math.ceil(
    Math.hypot(viewport.width, viewport.height),
  );
  const maximumDestinationBytes =
    maximumDestinationEdge * maximumDestinationEdge * 4;
  const preparedCanvas = ownCanvas(
    dependencies,
    ownership,
    preparationSize.width,
    preparationSize.height,
  );
  const preparedContext = canvasContext(preparedCanvas);
  preparedContext.clearRect(
    0,
    0,
    preparationSize.width,
    preparationSize.height,
  );
  preparedContext.filter = 'none';

  for (const vertical of verticalTiles) {
    for (const horizontal of horizontalTiles) {
      let sourceCanvas: OffscreenCanvas | null = null;
      let destinationCanvas: OffscreenCanvas | null = null;
      let resizedCanvas: OffscreenCanvas | null = null;
      try {
        sourceCanvas = ownCanvas(
          dependencies,
          ownership,
          horizontal.sourceSize,
          vertical.sourceSize,
        );
        if (
          sourceCanvas.width * sourceCanvas.height * 4 >
          T_SHIRT_EXPORT_SOURCE_TILE_BYTES
        ) {
          throw new Error(RENDER_ERROR);
        }
        const sourceContext = canvasContext(sourceCanvas);
        sourceContext.filter = filter;
        sourceContext.drawImage(
          bitmap,
          horizontal.sourceStart,
          vertical.sourceStart,
          horizontal.sourceSize,
          vertical.sourceSize,
          0,
          0,
          horizontal.sourceSize,
          vertical.sourceSize,
        );

        destinationCanvas = ownCanvas(
          dependencies,
          ownership,
          horizontal.destinationSize,
          vertical.destinationSize,
        );
        if (
          destinationCanvas.width > maximumDestinationEdge ||
          destinationCanvas.height > maximumDestinationEdge ||
          destinationCanvas.width * destinationCanvas.height * 4 >
            maximumDestinationBytes
        ) {
          throw new Error(RENDER_ERROR);
        }
        resizedCanvas = await dependencies.resize(
          sourceCanvas,
          destinationCanvas,
          { filter: 'lanczos3' },
        );
        ownership.canvases.add(resizedCanvas);
        if (
          resizedCanvas.width !== destinationCanvas.width ||
          resizedCanvas.height !== destinationCanvas.height
        ) {
          throw new Error(RENDER_ERROR);
        }

        const innerSourceX =
          horizontal.innerDestinationStart -
          horizontal.destinationStart;
        const innerSourceY =
          vertical.innerDestinationStart -
          vertical.destinationStart;
        preparedContext.drawImage(
          resizedCanvas,
          innerSourceX,
          innerSourceY,
          horizontal.innerDestinationSize,
          vertical.innerDestinationSize,
          horizontal.innerDestinationStart,
          vertical.innerDestinationStart,
          horizontal.innerDestinationSize,
          vertical.innerDestinationSize,
        );
      } finally {
        releaseCanvas(ownership, sourceCanvas);
        releaseCanvas(ownership, destinationCanvas);
        if (resizedCanvas !== destinationCanvas) {
          releaseCanvas(ownership, resizedCanvas);
        }
      }
    }
  }

  return preparedCanvas;
};

const drawPreparedLocalRegion = (
  context: DesignCanvasContext,
  image: CanvasImageSource,
  imageSize: Size,
  drawRect: Rect,
  visible: Rect,
  transform: ImageLayer['transform'] | TraceLayer['transform'],
  opacity: number,
) => {
  context.save();
  context.translate(
    drawRect.x + drawRect.width / 2,
    drawRect.y + drawRect.height / 2,
  );
  context.rotate(transform.rotation * Math.PI / 180);
  context.scale(transform.flipX ? -1 : 1, transform.flipY ? -1 : 1);
  context.globalAlpha = opacity;
  context.filter = 'none';
  context.drawImage(
    image,
    0,
    0,
    imageSize.width,
    imageSize.height,
    visible.x,
    visible.y,
    visible.width,
    visible.height,
  );
  context.restore();
};

const renderRasterLayer = async (
  masterContext: DesignCanvasContext,
  viewport: Size,
  layer: ImageLayer,
  assetsById: Map<string, TShirtExportAssetSnapshot>,
  dependencies: TShirtExportRendererDependencies,
  ownership: RendererOwnership,
): Promise<RasterScaleRecord | null> => {
  const sourceAsset = assetsById.get(layer.assetId);
  if (!sourceAsset) return null;
  const requestedPreparedId = layer.backgroundRemoval.enabled
    ? layer.backgroundRemoval.preparedAssetId
    : null;
  const preparedAsset = requestedPreparedId
    ? assetsById.get(requestedPreparedId)
    : undefined;
  const authoritativeAsset = preparedAsset ?? sourceAsset;
  const usesPreparedAsset = Boolean(preparedAsset);
  const sourceSize = {
    width: sourceAsset.width,
    height: sourceAsset.height,
  };
  const cropRect = usesPreparedAsset
    ? {
        x: 0,
        y: 0,
        width: authoritativeAsset.width,
        height: authoritativeAsset.height,
      }
    : getCroppedSourceRect(sourceSize, layer.crop);
  const drawRect = getLayerDrawRect(
    sourceSize,
    viewport,
    layer.transform,
    layer.crop,
  );
  if (
    cropRect.width <= 0 ||
    cropRect.height <= 0 ||
    drawRect.width <= 0 ||
    drawRect.height <= 0
  ) {
    return null;
  }
  const visible = getVisibleLocalRect(
    drawRect,
    viewport,
    layer.transform.rotation,
    layer.transform.flipX,
    layer.transform.flipY,
  );
  if (!visible) return null;
  const visibleSource = mapLocalRectToSource(visible, drawRect, cropRect);
  const preparationSize = getPreparationSize(visible, viewport);

  let bitmap: ImageBitmap | null = null;
  let cropCanvas: OffscreenCanvas | null = null;
  let resizeCanvas: OffscreenCanvas | null = null;
  let resizedCanvas: OffscreenCanvas | null = null;
  try {
    bitmap = await decodeOwnedBitmap(
      dependencies,
      ownership,
      authoritativeAsset,
    );
    const filter = usesPreparedAsset
      ? 'none'
      : buildCanvasFilter(layer.adjustments);
    const sourceCanvasWidth = positiveCanvasEdge(visibleSource.width);
    const sourceCanvasHeight = positiveCanvasEdge(visibleSource.height);
    if (
      sourceCanvasWidth <= T_SHIRT_EXPORT_SOURCE_TILE_EDGE &&
      sourceCanvasHeight <= T_SHIRT_EXPORT_SOURCE_TILE_EDGE &&
      sourceCanvasWidth * sourceCanvasHeight * 4 <=
        T_SHIRT_EXPORT_SOURCE_TILE_BYTES
    ) {
      cropCanvas = ownCanvas(
        dependencies,
        ownership,
        visibleSource.width,
        visibleSource.height,
      );
      const cropContext = canvasContext(cropCanvas);
      cropContext.filter = filter;
      cropContext.drawImage(
        bitmap,
        visibleSource.x,
        visibleSource.y,
        visibleSource.width,
        visibleSource.height,
        0,
        0,
        cropCanvas.width,
        cropCanvas.height,
      );

      resizeCanvas = ownCanvas(
        dependencies,
        ownership,
        preparationSize.width,
        preparationSize.height,
      );
      resizedCanvas = await dependencies.resize(
        cropCanvas,
        resizeCanvas,
        { filter: 'lanczos3' },
      );
      ownership.canvases.add(resizedCanvas);
      if (
        resizedCanvas.width !== resizeCanvas.width ||
        resizedCanvas.height !== resizeCanvas.height
      ) {
        throw new Error(RENDER_ERROR);
      }
    } else {
      resizedCanvas = await prepareTiledRasterRegion(
        bitmap,
        visibleSource,
        preparationSize,
        viewport,
        filter,
        dependencies,
        ownership,
      );
    }

    drawPreparedLocalRegion(
      masterContext,
      resizedCanvas,
      { width: resizedCanvas.width, height: resizedCanvas.height },
      drawRect,
      visible,
      layer.transform,
      layer.opacity,
    );

    return {
      scale: Math.max(
        drawRect.width / cropRect.width,
        drawRect.height / cropRect.height,
      ),
      layerName: layer.name,
    };
  } finally {
    releaseBitmap(ownership, bitmap);
    releaseCanvas(ownership, cropCanvas);
    releaseCanvas(ownership, resizeCanvas);
    if (resizedCanvas !== resizeCanvas) {
      releaseCanvas(ownership, resizedCanvas);
    }
  }
};

const serializeTraceRegion = (
  safeMarkup: string,
  source: Rect,
  output: Size,
  platform: TraceXmlPlatform,
) => {
  const parsed = new platform.DOMParser().parseFromString(
    safeMarkup,
    'image/svg+xml',
  );
  const root = parsed.documentElement;
  root.setAttribute(
    'viewBox',
    [source.x, source.y, source.width, source.height]
      .map((value) => String(Number(value.toFixed(6))))
      .join(' '),
  );
  root.setAttribute('width', String(output.width));
  root.setAttribute('height', String(output.height));
  return new platform.XMLSerializer().serializeToString(parsed);
};

const renderTraceLayer = async (
  masterContext: DesignCanvasContext,
  viewport: Size,
  layer: TraceLayer,
  assetsById: Map<string, TShirtExportAssetSnapshot>,
  dependencies: TShirtExportRendererDependencies,
  ownership: RendererOwnership,
) => {
  if (!layer.svgAssetId) return;
  const asset = assetsById.get(layer.svgAssetId);
  if (!asset) return;
  const drawRect = getTraceLayerDrawRect(
    layer.sourceFrame,
    viewport,
    layer.transform,
  );
  if (drawRect.width <= 0 || drawRect.height <= 0) return;
  const visible = getVisibleLocalRect(
    drawRect,
    viewport,
    layer.transform.rotation,
    layer.transform.flipX,
    layer.transform.flipY,
  );
  if (!visible) return;
  const preparationSize = getPreparationSize(visible, viewport);
  const platform = dependencies.traceXmlPlatform ?? workerXmlPlatform;
  const safe = sanitizeTraceSvg(
    bytesToText(asset.bytes),
    platform,
  );
  const safeMarkup = serializeSafeTraceDocument(
    safe,
    platform,
  );
  const sourceRegion = mapLocalRectToSource(visible, drawRect, {
    x: 0,
    y: 0,
    width: safe.width,
    height: safe.height,
  });
  const serialized = serializeTraceRegion(
    safeMarkup,
    sourceRegion,
    preparationSize,
    platform,
  );
  const finalAsset: TShirtExportAssetSnapshot = {
    ...asset,
    mimeType: 'image/svg+xml',
    width: preparationSize.width,
    height: preparationSize.height,
    bytes: textToArrayBuffer(serialized),
  };

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await decodeOwnedBitmap(
      dependencies,
      ownership,
      finalAsset,
    );
    drawPreparedLocalRegion(
      masterContext,
      bitmap,
      { width: finalAsset.width, height: finalAsset.height },
      drawRect,
      visible,
      layer.transform,
      layer.opacity,
    );
  } finally {
    releaseBitmap(ownership, bitmap);
  }
};

const applySavedLook = (
  masterCanvas: OffscreenCanvas,
  masterContext: DesignCanvasContext,
  snapshot: TShirtPngExportSnapshot,
) => {
  let imageData: ImageData | null = masterContext.getImageData(
    0,
    0,
    masterCanvas.width,
    masterCanvas.height,
  );
  let sourcePixels: Uint8ClampedArray | null = imageData.data;
  let outputPixels: Uint8ClampedArray | null =
    new Uint8ClampedArray(sourcePixels.length);
  try {
    const looked = applyVariationLook(
      {
        width: masterCanvas.width,
        height: masterCanvas.height,
        pixels: sourcePixels,
      },
      snapshot.variation.look,
      {
        output: outputPixels,
        maxWorkingBytes: MAX_EXPORT_LOOK_WORKING_BYTES,
      },
    );
    imageData.data.set(looked.pixels);
    masterContext.putImageData(imageData, 0, 0);
  } finally {
    outputPixels = null;
    sourcePixels = null;
    imageData = null;
  }
};

const inspectOutput = (
  outputCanvas: OffscreenCanvas,
  outputContext: DesignCanvasContext,
): Pick<TShirtExportRenderMetadata, 'alpha' | 'pixelDigest'> => {
  let imageData: ImageData | null = outputContext.getImageData(
    0,
    0,
    outputCanvas.width,
    outputCanvas.height,
  );
  let pixels: Uint8ClampedArray | null = imageData.data;
  let transparentPixels = 0;
  let translucentPixels = 0;
  let opaquePixels = 0;
  let hash = 0x811c9dc5;
  try {
    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3];
      if (alpha === 0) transparentPixels += 1;
      else if (alpha === 255) opaquePixels += 1;
      else translucentPixels += 1;
      hash ^= pixels[index];
      hash = Math.imul(hash, 0x01000193);
      hash ^= pixels[index + 1];
      hash = Math.imul(hash, 0x01000193);
      hash ^= pixels[index + 2];
      hash = Math.imul(hash, 0x01000193);
      hash ^= alpha;
      hash = Math.imul(hash, 0x01000193);
    }
    return {
      alpha: {
        transparentPixels,
        translucentPixels,
        opaquePixels,
      },
      pixelDigest: (hash >>> 0).toString(16).padStart(8, '0'),
    };
  } finally {
    pixels = null;
    imageData = null;
  }
};

export const renderTShirtExport = async (
  snapshot: TShirtPngExportSnapshot,
  dependencies: TShirtExportRendererDependencies = browserRendererDependencies,
): Promise<TShirtExportRenderedFrame> => {
  const preset = getTShirtExportPreset(snapshot.presetId);
  const assetsById = assetMapFromSnapshot(snapshot.assets);
  const ownership: RendererOwnership = {
    canvases: new Set(),
    bitmaps: new Set(),
  };
  let outputCanvas: OffscreenCanvas | null = null;
  let completed = false;

  try {
    const viewport = { width: preset.width, height: preset.width };
    const masterCanvas = ownCanvas(
      dependencies,
      ownership,
      viewport.width,
      viewport.height,
    );
    const masterContext = canvasContext(masterCanvas);
    masterContext.clearRect(0, 0, viewport.width, viewport.height);
    let largestRasterScale = 0;
    let largestRasterLayerName: string | null = null;

    for (const layer of snapshot.variation.layers) {
      if (!layer.visible) continue;
      if (layer.type === 'image') {
        const record = await renderRasterLayer(
          masterContext,
          viewport,
          layer,
          assetsById,
          dependencies,
          ownership,
        );
        if (record && record.scale > largestRasterScale) {
          largestRasterScale = record.scale;
          largestRasterLayerName = record.layerName;
        }
      } else if (layer.type === 'trace') {
        await renderTraceLayer(
          masterContext,
          viewport,
          layer,
          assetsById,
          dependencies,
          ownership,
        );
      } else {
        renderDesignLayers(masterContext, viewport, [layer], {
          metadataById: {},
          imagesById: {},
        });
      }
    }

    applySavedLook(masterCanvas, masterContext, snapshot);
    outputCanvas = ownCanvas(
      dependencies,
      ownership,
      preset.width,
      preset.height,
    );
    const outputContext = canvasContext(outputCanvas);
    outputContext.clearRect(0, 0, preset.width, preset.height);
    const geometry = resolveTShirtExportGeometry(preset, snapshot.placement);
    outputContext.save();
    outputContext.translate(geometry.center.x, geometry.center.y);
    outputContext.rotate(geometry.rotation * Math.PI / 180);
    outputContext.drawImage(
      masterCanvas,
      -geometry.renderedSide / 2,
      -geometry.renderedSide / 2,
      geometry.renderedSide,
      geometry.renderedSide,
    );
    outputContext.restore();

    const inspected = inspectOutput(outputCanvas, outputContext);
    ownership.canvases.delete(outputCanvas);
    completed = true;
    return {
      canvas: outputCanvas,
      metadata: {
        ...inspected,
        largestRasterScale,
        largestRasterLayerName,
      },
    };
  } finally {
    for (const bitmap of ownership.bitmaps) closeBitmap(bitmap);
    ownership.bitmaps.clear();
    for (const canvas of ownership.canvases) disposeCanvas(canvas);
    ownership.canvases.clear();
    if (!completed && outputCanvas) disposeCanvas(outputCanvas);
  }
};
