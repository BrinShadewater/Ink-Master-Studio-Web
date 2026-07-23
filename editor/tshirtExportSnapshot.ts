import type { DesignVariation, EditorAsset } from './model';
import type { ProductPlacement } from './productModel';
import {
  createTShirtExportFingerprint,
  type TShirtExportPresetId,
} from './tshirtExportModel';
import type {
  TShirtExportAssetSnapshot,
  TShirtPngExportSnapshot,
} from './tshirtExportProtocol';

const INCOMPLETE_ARTWORK_MESSAGE = 'Export artwork is incomplete.';

export interface CreateTShirtPngExportSnapshotInput {
  requestId: number;
  fingerprint: string;
  presetId: TShirtExportPresetId;
  variation: DesignVariation;
  placement: ProductPlacement;
  assetsById: Record<string, EditorAsset>;
}

const referencedAssetIds = (variation: DesignVariation): string[] => {
  const ids = new Set<string>();
  for (const layer of variation.layers) {
    if (layer.type === 'image') {
      ids.add(layer.assetId);
      if (layer.backgroundRemoval.enabled && layer.backgroundRemoval.preparedAssetId) {
        ids.add(layer.backgroundRemoval.preparedAssetId);
      }
    }
    if (layer.type === 'trace' && layer.svgAssetId) ids.add(layer.svgAssetId);
  }
  return [...ids].sort();
};

const semanticAssetIds = (variation: DesignVariation): string[] => {
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

const completeAsset = (id: string, asset: EditorAsset | undefined): asset is EditorAsset =>
  Boolean(asset) &&
  asset.id === id &&
  typeof asset.name === 'string' && asset.name.length > 0 &&
  typeof asset.mimeType === 'string' && asset.mimeType.length > 0 &&
  Number.isFinite(asset.width) && asset.width > 0 &&
  Number.isFinite(asset.height) && asset.height > 0 &&
  asset.blob instanceof Blob && asset.blob.size > 0 && asset.blob.type === asset.mimeType;

const captureAsset = (id: string, asset: EditorAsset): EditorAsset => ({
  id,
  projectId: asset.projectId,
  name: asset.name,
  mimeType: asset.mimeType,
  width: asset.width,
  height: asset.height,
  createdAt: asset.createdAt,
  blob: asset.blob,
  ...(asset.role ? { role: asset.role } : {}),
});

const snapshotAsset = async (asset: EditorAsset): Promise<TShirtExportAssetSnapshot> => ({
  id: asset.id,
  name: asset.name,
  mimeType: asset.mimeType,
  width: asset.width,
  height: asset.height,
  role: asset.role ?? null,
  bytes: await asset.blob.arrayBuffer(),
});

export const createTShirtPngExportSnapshot = async (
  input: CreateTShirtPngExportSnapshotInput,
): Promise<TShirtPngExportSnapshot> => {
  const variation = structuredClone(input.variation);
  const placement = structuredClone(input.placement);
  const requestId = input.requestId;
  const fingerprint = input.fingerprint;
  const presetId = input.presetId;
  const exportIds = referencedAssetIds(variation);
  const capturedAssetsById: Record<string, EditorAsset> = {};
  for (const id of semanticAssetIds(variation)) {
    const asset = input.assetsById[id];
    if (!completeAsset(id, asset)) throw new Error(INCOMPLETE_ARTWORK_MESSAGE);
    capturedAssetsById[id] = captureAsset(id, asset);
  }
  const capturedSnapshots = await Promise.all(Object.values(capturedAssetsById).map(snapshotAsset));
  if (capturedSnapshots.some(({ bytes }) => bytes.byteLength === 0)) {
    throw new Error(INCOMPLETE_ARTWORK_MESSAGE);
  }
  if (createTShirtExportFingerprint({
    presetId,
    variation,
    placement,
    assetsById: capturedAssetsById,
  }) !== fingerprint) {
    throw new Error(INCOMPLETE_ARTWORK_MESSAGE);
  }
  return {
    requestId,
    fingerprint,
    presetId,
    variation,
    placement,
    assets: exportIds.map((id) => {
      const asset = capturedSnapshots.find((candidate) => candidate.id === id);
      if (!asset) throw new Error(INCOMPLETE_ARTWORK_MESSAGE);
      return asset;
    }),
  };
};
