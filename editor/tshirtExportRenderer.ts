import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import createPica from 'pica';
import {
  renderDesignLayers,
  type CompositorAssets,
  type DesignCanvasContext,
} from './compositor';
import {
  buildCanvasFilter,
  getCroppedSourceRect,
  getLayerDrawRect,
  getTraceLayerDrawRect,
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

const FULL_CROP = { x: 0, y: 0, width: 1, height: 1 } as const;
const ZERO_ADJUSTMENTS = { brightness: 0, contrast: 0, saturation: 0 } as const;
const RENDER_ERROR = 'Could not render T-shirt artwork.';

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
    tile: 1024,
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

const boundedBackingScale = (
  width: number,
  height: number,
  viewport: Size,
) => Math.min(1, viewport.width / width, viewport.height / height);

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

  let bitmap: ImageBitmap | null = null;
  let cropCanvas: OffscreenCanvas | null = null;
  let resizeCanvas: OffscreenCanvas | null = null;
  let resizedCanvas: OffscreenCanvas | null = null;
  let layerCanvas: OffscreenCanvas | null = null;
  try {
    bitmap = await decodeOwnedBitmap(
      dependencies,
      ownership,
      authoritativeAsset,
    );
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
    const fullDrawRect = getLayerDrawRect(
      sourceSize,
      viewport,
      layer.transform,
      FULL_CROP,
    );
    if (
      cropRect.width <= 0 ||
      cropRect.height <= 0 ||
      drawRect.width <= 0 ||
      drawRect.height <= 0 ||
      fullDrawRect.width <= 0 ||
      fullDrawRect.height <= 0
    ) {
      return null;
    }
    const backingScale = boundedBackingScale(
      fullDrawRect.width,
      fullDrawRect.height,
      viewport,
    );

    cropCanvas = ownCanvas(
      dependencies,
      ownership,
      cropRect.width,
      cropRect.height,
    );
    const cropContext = canvasContext(cropCanvas);
    cropContext.filter = usesPreparedAsset
      ? 'none'
      : buildCanvasFilter(layer.adjustments);
    cropContext.drawImage(
      bitmap,
      cropRect.x,
      cropRect.y,
      cropRect.width,
      cropRect.height,
      0,
      0,
      cropCanvas.width,
      cropCanvas.height,
    );

    resizeCanvas = ownCanvas(
      dependencies,
      ownership,
      drawRect.width * backingScale,
      drawRect.height * backingScale,
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

    layerCanvas = ownCanvas(
      dependencies,
      ownership,
      fullDrawRect.width * backingScale,
      fullDrawRect.height * backingScale,
    );
    const layerContext = canvasContext(layerCanvas);
    layerContext.filter = 'none';
    layerContext.drawImage(
      resizedCanvas,
      (layerCanvas.width - resizedCanvas.width) / 2,
      (layerCanvas.height - resizedCanvas.height) / 2,
      resizedCanvas.width,
      resizedCanvas.height,
    );

    const renderAssetId = `tshirt-export-raster:${layer.id}`;
    const renderLayer: ImageLayer = {
      ...layer,
      assetId: renderAssetId,
      crop: { ...FULL_CROP },
      adjustments: { ...ZERO_ADJUSTMENTS },
      backgroundRemoval: {
        ...layer.backgroundRemoval,
        enabled: false,
        preparedAssetId: null,
      },
    };
    const renderAssets: CompositorAssets = {
      metadataById: {
        [renderAssetId]: {
          width: layerCanvas.width,
          height: layerCanvas.height,
        },
      },
      imagesById: {
        [renderAssetId]: layerCanvas,
      },
    };
    renderDesignLayers(masterContext, viewport, [renderLayer], renderAssets);

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
    releaseCanvas(ownership, layerCanvas);
  }
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
  const safe = sanitizeTraceSvg(
    bytesToText(asset.bytes),
    dependencies.traceXmlPlatform ?? workerXmlPlatform,
  );
  const serialized = serializeSafeTraceDocument(
    safe,
    dependencies.traceXmlPlatform ?? workerXmlPlatform,
  );
  const backingScale = boundedBackingScale(
    drawRect.width,
    drawRect.height,
    viewport,
  );
  const finalAsset: TShirtExportAssetSnapshot = {
    ...asset,
    mimeType: 'image/svg+xml',
    width: positiveCanvasEdge(drawRect.width * backingScale),
    height: positiveCanvasEdge(drawRect.height * backingScale),
    bytes: textToArrayBuffer(serialized),
  };

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await decodeOwnedBitmap(
      dependencies,
      ownership,
      finalAsset,
    );
    renderDesignLayers(masterContext, viewport, [layer], {
      metadataById: {
        [layer.svgAssetId]: {
          width: finalAsset.width,
          height: finalAsset.height,
        },
      },
      imagesById: {
        [layer.svgAssetId]: bitmap,
      },
    });
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
