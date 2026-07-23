import type { EditorHistory, VariationEditState } from './history';
import {
  isImageLayer,
  isTraceLayer,
  type DesignLayer,
  type EditorAsset,
  type EditorProject,
} from './model';

const collectLayerAssetIds = (
  layers: DesignLayer[],
  assetIds: Set<string>,
) => {
  for (const layer of layers) {
    if (isImageLayer(layer)) {
      assetIds.add(layer.assetId);
      if (layer.backgroundRemoval.preparedAssetId) {
        assetIds.add(layer.backgroundRemoval.preparedAssetId);
      }
      if (layer.backgroundRemoval.correctionAssetId) {
        assetIds.add(layer.backgroundRemoval.correctionAssetId);
      }
    } else if (isTraceLayer(layer) && layer.svgAssetId) {
      assetIds.add(layer.svgAssetId);
    }
  }
};

const collectEditStateAssetIds = (
  state: VariationEditState,
  assetIds: Set<string>,
) => {
  collectLayerAssetIds(state.layers, assetIds);
};

export const collectProjectAssetIds = (project: EditorProject): Set<string> => {
  const assetIds = new Set<string>([project.sourceAssetId]);
  for (const variation of project.variations) {
    collectLayerAssetIds(variation.layers, assetIds);
  }
  return assetIds;
};

export const collectHistoryAssetIds = (history: EditorHistory): Set<string> => {
  const assetIds = collectProjectAssetIds(history.present);
  for (const variationHistory of Object.values(history.variationHistory)) {
    for (const state of variationHistory.past) collectEditStateAssetIds(state, assetIds);
    for (const state of variationHistory.future) collectEditStateAssetIds(state, assetIds);
  }
  return assetIds;
};

export const findOrphanedGeneratedAssetIds = (
  assets: Iterable<EditorAsset>,
  history: EditorHistory,
): string[] => {
  const referenced = collectHistoryAssetIds(history);
  return [...assets]
    .filter((asset) =>
      asset.projectId === history.present.id &&
      asset.role !== undefined &&
      !referenced.has(asset.id))
    .map(({ id }) => id)
    .sort();
};
