import type { Rect, Size } from './geometry';
import {
  getTShirtMockup,
  type ProductPrintableRegion,
} from './productCatalog';
import {
  resolveProductArtworkGeometry,
  resolveProductRegionRect,
} from './productGeometry';
import type { TShirtProductVariant } from './productModel';
import {
  getTShirtExportPreset,
  resolveTShirtExportGeometry,
  type TShirtExportPreset,
  type TShirtExportPresetId,
} from './tshirtExportModel';

const MAX_PROOF_EDGE = 1800;
const PROOF_ERROR = 'Could not create the mockup proof.';
export type ProductMockupScene = 'studio' | 'technical' | 'catalog';

const sceneBackgrounds: Record<ProductMockupScene, string> = {
  studio: '#17262d',
  technical: '#111827',
  catalog: '#303842',
};
const round = (value: number) => Number(value.toFixed(6));

const envelopeRect = (
  center: { x: number; y: number },
  edge: number,
  rotation: number,
): Rect => {
  const radians = rotation * Math.PI / 180;
  const envelope = Math.abs(Math.cos(radians)) + Math.abs(Math.sin(radians));
  const size = edge * envelope;
  return {
    x: round(center.x - size / 2),
    y: round(center.y - size / 2),
    width: round(size),
    height: round(size),
  };
};

export const resolveProductProofGeometry = (
  product: TShirtProductVariant,
  preset: TShirtExportPreset,
  canvasSize: Size,
  printableRegion: ProductPrintableRegion,
): { source: Rect; destination: Rect } => {
  const exportGeometry = resolveTShirtExportGeometry(preset, product.placement);
  const regionRect = resolveProductRegionRect(
    { x: 0, y: 0, width: canvasSize.width, height: canvasSize.height },
    printableRegion,
  );
  const productGeometry = resolveProductArtworkGeometry(regionRect, product.placement);
  return {
    source: envelopeRect(
      exportGeometry.center,
      exportGeometry.renderedSide,
      exportGeometry.rotation,
    ),
    destination: envelopeRect(
      productGeometry.center,
      productGeometry.edge,
      productGeometry.rotation,
    ),
  };
};

export const createProofUrlOwner = (revoke: (url: string) => void) => {
  let ownedUrl: string | null = null;
  return {
    current: () => ownedUrl,
    replace: (url: string | null) => {
      if (ownedUrl === url) return;
      if (ownedUrl) revoke(ownedUrl);
      ownedUrl = url;
    },
    clear: () => {
      if (!ownedUrl) return;
      const url = ownedUrl;
      ownedUrl = null;
      revoke(url);
    },
  };
};

const loadImage = (url: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error(PROOF_ERROR));
  image.src = url;
});

const encodePng = (canvas: HTMLCanvasElement): Promise<Blob> => new Promise((resolve, reject) => {
  canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error(PROOF_ERROR)),
    'image/png',
  );
});

export const createProductProofMockup = async (
  product: TShirtProductVariant,
  printFileUrl: string,
  presetId: TShirtExportPresetId,
): Promise<{ blob: Blob; url: string }> => {
  try {
    const mockup = getTShirtMockup(product.mockupSlug);
    const preset = getTShirtExportPreset(presetId);
    const [mockupImage, printImage] = await Promise.all([
      loadImage(mockup.file),
      loadImage(printFileUrl),
    ]);
    const longestMockupEdge = Math.max(mockupImage.naturalWidth, mockupImage.naturalHeight);
    if (longestMockupEdge <= 0) throw new Error(PROOF_ERROR);
    const scale = Math.min(1, MAX_PROOF_EDGE / longestMockupEdge);
    const width = Math.max(1, Math.round(mockupImage.naturalWidth * scale));
    const height = Math.max(1, Math.round(mockupImage.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error(PROOF_ERROR);
    context.drawImage(mockupImage, 0, 0, width, height);

    const geometry = resolveProductProofGeometry(
      product,
      preset,
      { width, height },
      mockup.printableRegion,
    );
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = Math.max(1, Math.ceil(geometry.source.width));
    cropCanvas.height = Math.max(1, Math.ceil(geometry.source.height));
    const cropContext = cropCanvas.getContext('2d');
    if (!cropContext) throw new Error(PROOF_ERROR);
    cropContext.drawImage(printImage, -geometry.source.x, -geometry.source.y);
    context.drawImage(
      cropCanvas,
      0,
      0,
      cropCanvas.width,
      cropCanvas.height,
      geometry.destination.x,
      geometry.destination.y,
      geometry.destination.width,
      geometry.destination.height,
    );

    const blob = await encodePng(canvas);
    return { blob, url: URL.createObjectURL(blob) };
  } catch {
    throw new Error(PROOF_ERROR);
  }
};

export const createProductMockupScene = async (
  proofUrl: string,
  scene: ProductMockupScene,
): Promise<Blob> => {
  try {
    const proof = await loadImage(proofUrl);
    const edge = 1600;
    const canvas = document.createElement('canvas');
    canvas.width = edge;
    canvas.height = edge;
    const context = canvas.getContext('2d');
    if (!context) throw new Error(PROOF_ERROR);
    context.fillStyle = sceneBackgrounds[scene];
    context.fillRect(0, 0, edge, edge);
    if (scene === 'technical') {
      context.strokeStyle = '#31505c';
      context.lineWidth = 1;
      for (let coordinate = 80; coordinate < edge; coordinate += 80) {
        context.beginPath();
        context.moveTo(coordinate, 0);
        context.lineTo(coordinate, edge);
        context.moveTo(0, coordinate);
        context.lineTo(edge, coordinate);
        context.stroke();
      }
    }
    if (scene === 'catalog') {
      context.fillStyle = '#b8c4c8';
      context.fillRect(90, 90, edge - 180, edge - 180);
    }
    const scale = Math.min((edge - 220) / proof.naturalWidth, (edge - 220) / proof.naturalHeight);
    const width = Math.round(proof.naturalWidth * scale);
    const height = Math.round(proof.naturalHeight * scale);
    context.drawImage(proof, Math.round((edge - width) / 2), Math.round((edge - height) / 2), width, height);
    return await encodePng(canvas);
  } catch {
    throw new Error(PROOF_ERROR);
  }
};
