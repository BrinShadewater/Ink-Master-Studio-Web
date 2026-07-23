import type { DesignVariation, EditorAsset } from './model';
import {
  normalizeProductPlacement,
  type ProductPlacement,
} from './productModel';

export type TShirtExportPresetId =
  | 'printify-full-front'
  | 'standard-tee'
  | 'draft-proof';

export interface TShirtExportPreset {
  id: TShirtExportPresetId;
  name: string;
  width: number;
  height: number;
  dpi: 150 | 300;
  pixelsPerMeter: 5906 | 11811;
  physicalWidthInches: number;
  physicalHeightInches: number;
  classification: 'production' | 'proof';
}

const createPreset = (preset: TShirtExportPreset): TShirtExportPreset => Object.freeze(preset);

export const TSHIRT_EXPORT_PRESETS: readonly TShirtExportPreset[] = Object.freeze([
  createPreset({
    id: 'printify-full-front',
    name: 'Printify Full Front',
    width: 4500,
    height: 5400,
    dpi: 300,
    pixelsPerMeter: 11811,
    physicalWidthInches: 15,
    physicalHeightInches: 18,
    classification: 'production',
  }),
  createPreset({
    id: 'standard-tee',
    name: 'Standard Tee',
    width: 3000,
    height: 3600,
    dpi: 300,
    pixelsPerMeter: 11811,
    physicalWidthInches: 10,
    physicalHeightInches: 12,
    classification: 'production',
  }),
  createPreset({
    id: 'draft-proof',
    name: 'Draft Proof',
    width: 1500,
    height: 1800,
    dpi: 150,
    pixelsPerMeter: 5906,
    physicalWidthInches: 10,
    physicalHeightInches: 12,
    classification: 'proof',
  }),
] as const);

export const getTShirtExportPreset = (id: unknown): TShirtExportPreset => {
  const preset = TSHIRT_EXPORT_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) throw new Error('Unknown T-shirt export preset.');
  return preset;
};

export interface TShirtExportAlphaStats {
  transparentPixels: number;
  translucentPixels: number;
  opaquePixels: number;
}

export interface TShirtExportRenderMetadata {
  alpha: TShirtExportAlphaStats;
  largestRasterScale: number;
  largestRasterLayerName: string | null;
  pixelDigest: string;
}

export interface TShirtExportGeometry {
  center: { x: number; y: number };
  renderedSide: number;
  rotation: number;
}

export const resolveTShirtExportGeometry = (
  preset: TShirtExportPreset,
  placementValue: ProductPlacement,
): TShirtExportGeometry => {
  const placement = normalizeProductPlacement(placementValue);
  const baseSide = Math.min(preset.width, preset.height);
  return {
    center: {
      x: preset.width * placement.x,
      y: preset.height * placement.y,
    },
    renderedSide: baseSide * placement.scale,
    rotation: placement.rotation,
  };
};

export interface TShirtExportFingerprintInput {
  presetId: TShirtExportPresetId;
  variation: DesignVariation;
  placement: ProductPlacement;
  assetsById: Record<string, EditorAsset>;
}

const hashString = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const referencedAssetIds = (variation: DesignVariation): string[] => {
  const ids = new Set<string>();
  for (const layer of variation.layers) {
    if (layer.type === 'image') {
      ids.add(layer.assetId);
      if (layer.backgroundRemoval.preparedAssetId) ids.add(layer.backgroundRemoval.preparedAssetId);
      if (layer.backgroundRemoval.correctionAssetId) ids.add(layer.backgroundRemoval.correctionAssetId);
    }
    if (layer.type === 'trace' && layer.svgAssetId) ids.add(layer.svgAssetId);
  }
  return [...ids].sort();
};

export const createTShirtExportFingerprint = (
  input: TShirtExportFingerprintInput,
): string => {
  const assets = referencedAssetIds(input.variation).map((id) => {
    const asset = input.assetsById[id];
    if (!asset) throw new Error('Export artwork is incomplete.');
    return {
      id,
      name: asset.name,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      createdAt: asset.createdAt,
      size: asset.blob.size,
    };
  });
  const receipt = {
    presetId: input.presetId,
    placement: normalizeProductPlacement(input.placement),
    variation: {
      id: input.variation.id,
      layers: input.variation.layers,
      look: input.variation.look,
    },
    assets,
  };
  return `tshirt-export:${hashString(JSON.stringify(receipt))}`;
};

const sanitizeNamePart = (value: string, fallback: string): string => {
  const ascii = value.normalize('NFKD').replace(/[^\x00-\x7F]/g, '');
  const sanitized = ascii.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '');
  return sanitized || fallback;
};

export const createTShirtExportFilename = (
  projectName: string,
  variationName: string,
  presetId: TShirtExportPresetId,
): string => {
  const project = sanitizeNamePart(projectName, 'inkmaster-design');
  const variation = sanitizeNamePart(variationName, 'original');
  const suffix = `-${presetId}`;
  const availablePrefixLength = Math.max(0, 180 - suffix.length);
  const prefix = `${project}-${variation}`.slice(0, availablePrefixLength).replace(/-+$/g, '');
  return `${prefix || 'inkmaster-design'}${suffix}.png`;
};
