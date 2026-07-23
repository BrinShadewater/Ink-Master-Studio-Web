import {
  createEditorId,
  duplicateVariation,
  isImageLayer,
  isTextLayer,
  isTraceLayer,
  normalizeTransform,
  type CropRect,
  type DesignLayer,
  type DesignVariation,
  type EditorProject,
  type ImageAdjustments,
  type ImageLayer,
  type LayerTransform,
  type TextLayer,
  type TextLayerStyle,
  type TraceLayer,
} from './model';
import {
  createImagePrepFingerprint,
  createTraceSourceFingerprint,
  normalizeBackgroundRemoval,
  type BackgroundRemovalSettings,
} from './imagePrepModel';
import {
  createDefaultLook,
  isSeededLook,
  normalizeVariationLook,
  replaceLookSeed,
  serializeVariationLook,
  type VariationLook,
} from './lookModel';
import { normalizeTextContent, normalizeTextStyle } from './textNormalization';
import {
  createTraceFingerprint,
  normalizeTraceSettings,
  serializeTraceInput,
  type TraceSettings,
} from './traceModel';
import {
  duplicateTShirtProduct,
  findTShirtProduct,
  normalizeProductPlacement,
  normalizeTShirtMockupSlug,
  type ProductPlacement,
  type TShirtMockupSlug,
  type TShirtProductVariant,
} from './productModel';

export type EditorCommand =
  | { type: 'rename-project'; name: string }
  | { type: 'select-variation'; variationId: string }
  | { type: 'duplicate-variation'; name: string }
  | { type: 'rename-variation'; variationId: string; name: string }
  | { type: 'delete-variation'; variationId: string }
  | { type: 'select-layer'; layerId: string }
  | { type: 'add-image-layer'; layer: ImageLayer }
  | { type: 'add-text-layer'; layer: TextLayer }
  | { type: 'add-trace-layer'; sourceLayerId: string; layer: TraceLayer }
  | { type: 'rename-layer'; layerId: string; name: string }
  | { type: 'duplicate-layer'; layerId: string }
  | { type: 'delete-layer'; layerId: string }
  | { type: 'move-layer'; layerId: string; direction: 'up' | 'down' }
  | { type: 'set-layer-visibility'; layerId: string; visible: boolean }
  | { type: 'set-transform'; layerId: string; transform: LayerTransform; historyGroup?: string }
  | { type: 'set-crop'; layerId: string; crop: CropRect; historyGroup?: string }
  | { type: 'set-adjustments'; layerId: string; adjustments: ImageAdjustments; historyGroup?: string }
  | { type: 'set-background-removal'; layerId: string; settings: BackgroundRemovalSettings; historyGroup?: string }
  | { type: 'publish-background-result'; layerId: string; expectedInputFingerprint: string; preparedAssetId: string }
  | { type: 'set-trace-settings'; layerId: string; settings: TraceSettings; historyGroup?: string }
  | {
    type: 'publish-trace-result';
    layerId: string;
    expectedSourceFingerprint: string;
    expectedTraceFingerprint: string;
    svgAssetId: string;
    palette: string[];
  }
  | { type: 'restore-trace-source'; layerId: string }
  | { type: 'set-opacity'; layerId: string; opacity: number; historyGroup?: string }
  | { type: 'set-text-content'; layerId: string; text: string; historyGroup?: string }
  | { type: 'set-text-style'; layerId: string; style: TextLayerStyle; historyGroup?: string }
  | { type: 'set-look'; look: VariationLook; historyGroup?: string }
  | { type: 'reroll-look-seed'; seed: number }
  | { type: 'reset-look' }
  | { type: 'set-product-placement'; placement: ProductPlacement; historyGroup?: string }
  | { type: 'set-product-mockup'; mockupSlug: TShirtMockupSlug }
  | { type: 'end-history-group' }
  | { type: 'undo' }
  | { type: 'redo' };

export interface VariationEditState {
  layers: DesignLayer[];
  look: VariationLook;
  product: TShirtProductVariant;
}

export interface VariationHistory {
  past: VariationEditState[];
  future: VariationEditState[];
  activeHistoryGroup: string | null;
}

export interface EditorHistory {
  present: EditorProject;
  variationHistory: Record<string, VariationHistory>;
}

const MAX_PAST_STATES = 100;

const cloneProject = (project: EditorProject): EditorProject => structuredClone(project);

const cloneEditState = (state: VariationEditState): VariationEditState => structuredClone(state);

const cloneEditStates = (states: VariationEditState[]) => states.map(cloneEditState);

const getEditState = (
  project: EditorProject,
  variationId: string,
): VariationEditState => {
  const variation = project.variations.find(({ id }) => id === variationId);
  if (!variation) throw new Error('Active editor variation not found.');
  return {
    layers: structuredClone(variation.layers),
    look: structuredClone(variation.look),
    product: structuredClone(findTShirtProduct(project.productVariants, variationId)),
  };
};

const createVariationHistory = (): VariationHistory => ({
  past: [],
  future: [],
  activeHistoryGroup: null,
});

const closeVariationHistoryGroup = (
  variationHistory: EditorHistory['variationHistory'],
  variationId: string,
): EditorHistory['variationHistory'] => {
  const current = variationHistory[variationId];
  if (!current?.activeHistoryGroup) return variationHistory;
  return {
    ...variationHistory,
    [variationId]: { ...current, activeHistoryGroup: null },
  };
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));

const normalizeCrop = (crop: CropRect): CropRect => {
  const x = clamp(crop.x, 0, 0.95);
  const y = clamp(crop.y, 0, 0.95);
  return {
    x,
    y,
    width: clamp(crop.width, 0.05, 1 - x),
    height: clamp(crop.height, 0.05, 1 - y),
  };
};

const normalizeAdjustments = (adjustments: ImageAdjustments): ImageAdjustments => ({
  brightness: clamp(adjustments.brightness, -100, 100),
  contrast: clamp(adjustments.contrast, -100, 100),
  saturation: clamp(adjustments.saturation, -100, 100),
});

const normalizeHistoryGroup = (historyGroup?: string): string | null => historyGroup || null;

const sameTransform = (left: LayerTransform, right: LayerTransform) =>
  left.x === right.x && left.y === right.y && left.scale === right.scale &&
  left.rotation === right.rotation && left.flipX === right.flipX && left.flipY === right.flipY;

const sameCrop = (left: CropRect, right: CropRect) =>
  left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;

const sameAdjustments = (left: ImageAdjustments, right: ImageAdjustments) =>
  left.brightness === right.brightness && left.contrast === right.contrast && left.saturation === right.saturation;

const sameBackgroundRemoval = (
  left: BackgroundRemovalSettings,
  right: BackgroundRemovalSettings,
) => JSON.stringify(left) === JSON.stringify(right);

const sameTraceSettings = (left: TraceSettings, right: TraceSettings) =>
  serializeTraceInput(left) === serializeTraceInput(right);

const sameTextStyle = (layer: TextLayer, style: TextLayerStyle) =>
  layer.fontFamily === style.fontFamily && layer.fontSize === style.fontSize &&
  layer.color === style.color && layer.align === style.align &&
  layer.letterSpacing === style.letterSpacing && layer.outlineWidth === style.outlineWidth &&
  layer.outlineColor === style.outlineColor;

const sameLook = (left: VariationLook, right: VariationLook) =>
  serializeVariationLook(left) === serializeVariationLook(right);

const getActiveLayer = (project: EditorProject, layerId: string): DesignLayer | undefined => {
  const variation = project.variations.find(({ id }) => id === project.activeVariationId);
  return variation?.layers.find(({ id }) => id === layerId);
};

const updateActiveLayer = (
  project: EditorProject,
  layerId: string,
  update: (layer: DesignLayer) => DesignLayer,
): EditorProject | null => {
  if (!getActiveLayer(project, layerId)) return null;
  const next = cloneProject(project);
  const variation = next.variations.find(({ id }) => id === next.activeVariationId);
  if (!variation) return null;
  variation.layers = variation.layers.map((layer) => layer.id === layerId ? update(layer) : layer);
  return next;
};

const updateImageLayerAndStaleLinkedTraces = (
  project: EditorProject,
  layerId: string,
  update: (layer: ImageLayer) => ImageLayer,
): EditorProject | null => {
  const current = getActiveLayer(project, layerId);
  if (!current || !isImageLayer(current)) return null;
  const next = cloneProject(project);
  const variation = getActiveVariation(next);
  variation.layers = variation.layers.map((layer) => {
    if (layer.id === layerId && isImageLayer(layer)) return update(layer);
    if (isTraceLayer(layer) && layer.sourceLayerId === layerId) {
      return { ...layer, sourceFingerprint: '' };
    }
    return layer;
  });
  return next;
};

const withUpdatedAt = (project: EditorProject, previous: EditorProject): EditorProject => {
  const next = cloneProject(project);
  next.updatedAt = Math.max(Date.now(), previous.updatedAt + 1);
  return next;
};

const replaceVariationEditState = (
  project: EditorProject,
  variationId: string,
  state: VariationEditState,
): EditorProject => {
  const next = cloneProject(project);
  const variation = next.variations.find(({ id }) => id === variationId);
  if (!variation) return next;
  variation.layers = structuredClone(state.layers);
  variation.look = structuredClone(state.look);
  variation.selectedLayerId = variation.layers.some(({ id }) => id === variation.selectedLayerId)
    ? variation.selectedLayerId : variation.layers[variation.layers.length - 1].id;
  const productIndex = next.productVariants.findIndex((product) =>
    product.variationId === variationId);
  if (productIndex >= 0) next.productVariants[productIndex] = structuredClone(state.product);
  return next;
};

const recordVariationEdit = (
  history: EditorHistory,
  project: EditorProject,
  historyGroup?: string,
): EditorHistory => {
  const variationId = history.present.activeVariationId;
  const currentHistory = history.variationHistory[variationId] ?? createVariationHistory();
  const group = normalizeHistoryGroup(historyGroup);
  const past = currentHistory.activeHistoryGroup === group && group !== null
    ? cloneEditStates(currentHistory.past)
    : [...cloneEditStates(currentHistory.past), getEditState(history.present, variationId)]
      .slice(-MAX_PAST_STATES);
  return {
    present: cloneProject(project),
    variationHistory: {
      ...history.variationHistory,
      [variationId]: {
        past,
        future: [],
        activeHistoryGroup: group,
      },
    },
  };
};

export const createEditorHistory = (project: EditorProject): EditorHistory => ({
  present: cloneProject(project),
  variationHistory: Object.fromEntries(project.variations.map(({ id }) => [id, createVariationHistory()])),
});

export const getActiveVariation = (project: EditorProject): DesignVariation => {
  const variation = project.variations.find(({ id }) => id === project.activeVariationId);
  if (!variation) throw new Error('Active editor variation not found.');
  return variation;
};

export const getSelectedLayer = (project: EditorProject): DesignLayer => {
  const variation = getActiveVariation(project);
  const layer = variation.layers.find(({ id }) => id === variation.selectedLayerId);
  if (!layer) throw new Error('Selected editor layer not found.');
  return layer;
};

export const getSelectedImageLayer = (project: EditorProject): ImageLayer | null => {
  const layer = getSelectedLayer(project);
  return isImageLayer(layer) ? layer : null;
};

export const getSelectedTextLayer = (project: EditorProject): TextLayer | null => {
  const layer = getSelectedLayer(project);
  return isTextLayer(layer) ? layer : null;
};

export const canUndoActiveVariation = (history: EditorHistory | null): boolean => {
  if (!history) return false;
  return Boolean(history.variationHistory[history.present.activeVariationId]?.past.length);
};

export const canRedoActiveVariation = (history: EditorHistory | null): boolean => {
  if (!history) return false;
  return Boolean(history.variationHistory[history.present.activeVariationId]?.future.length);
};

const undo = (history: EditorHistory): EditorHistory => {
  const variationId = history.present.activeVariationId;
  const currentHistory = history.variationHistory[variationId];
  if (!currentHistory?.past.length) return history;
  const previous = currentHistory.past[currentHistory.past.length - 1];
  const present = withUpdatedAt(
    replaceVariationEditState(history.present, variationId, previous),
    history.present,
  );
  return {
    present,
    variationHistory: {
      ...history.variationHistory,
      [variationId]: {
        past: cloneEditStates(currentHistory.past.slice(0, -1)),
        future: [getEditState(history.present, variationId), ...cloneEditStates(currentHistory.future)],
        activeHistoryGroup: null,
      },
    },
  };
};

const redo = (history: EditorHistory): EditorHistory => {
  const variationId = history.present.activeVariationId;
  const currentHistory = history.variationHistory[variationId];
  if (!currentHistory?.future.length) return history;
  const next = currentHistory.future[0];
  const present = withUpdatedAt(
    replaceVariationEditState(history.present, variationId, next),
    history.present,
  );
  return {
    present,
    variationHistory: {
      ...history.variationHistory,
      [variationId]: {
        past: [
          ...cloneEditStates(currentHistory.past),
          getEditState(history.present, variationId),
        ].slice(-MAX_PAST_STATES),
        future: cloneEditStates(currentHistory.future.slice(1)),
        activeHistoryGroup: null,
      },
    },
  };
};

export const reduceEditorHistory = (history: EditorHistory, command: EditorCommand): EditorHistory => {
  switch (command.type) {
    case 'undo':
      return undo(history);
    case 'redo':
      return redo(history);
    case 'end-history-group': {
      const variationId = history.present.activeVariationId;
      const currentHistory = history.variationHistory[variationId];
      if (!currentHistory?.activeHistoryGroup) return history;
      return {
        ...history,
        variationHistory: {
          ...history.variationHistory,
          [variationId]: { ...currentHistory, activeHistoryGroup: null },
        },
      };
    }
    case 'rename-project': {
      const name = command.name.trim() || 'Untitled design';
      if (name === history.present.name) return history;
      const next = cloneProject(history.present);
      next.name = name;
      return { ...history, present: withUpdatedAt(next, history.present) };
    }
    case 'select-variation': {
      if (!history.present.variations.some(({ id }) => id === command.variationId) ||
        history.present.activeVariationId === command.variationId) return history;
      const outgoingVariationId = history.present.activeVariationId;
      const next = cloneProject(history.present);
      next.activeVariationId = command.variationId;
      return {
        present: withUpdatedAt(next, history.present),
        variationHistory: closeVariationHistoryGroup(history.variationHistory, outgoingVariationId),
      };
    }
    case 'duplicate-variation': {
      const outgoingVariationId = history.present.activeVariationId;
      const next = cloneProject(history.present);
      const duplicate = duplicateVariation(getActiveVariation(history.present), command.name);
      const sourceProduct = findTShirtProduct(history.present.productVariants, outgoingVariationId);
      next.variations = [...next.variations, duplicate];
      next.productVariants = [
        ...next.productVariants,
        duplicateTShirtProduct(sourceProduct, duplicate.id, createEditorId('product')),
      ];
      next.activeVariationId = duplicate.id;
      return {
        present: withUpdatedAt(next, history.present),
        variationHistory: {
          ...closeVariationHistoryGroup(history.variationHistory, outgoingVariationId),
          [duplicate.id]: createVariationHistory(),
        },
      };
    }
    case 'rename-variation': {
      const variation = history.present.variations.find(({ id }) => id === command.variationId);
      if (!variation) return history;
      const name = command.name.trim() || 'Original';
      if (name === variation.name) return history;
      const next = cloneProject(history.present);
      const nextVariation = next.variations.find(({ id }) => id === command.variationId);
      if (!nextVariation) return history;
      nextVariation.name = name;
      return { ...history, present: withUpdatedAt(next, history.present) };
    }
    case 'delete-variation': {
      if (history.present.variations.length <= 1) return history;
      const deletedIndex = history.present.variations.findIndex(({ id }) => id === command.variationId);
      if (deletedIndex < 0) return history;
      const next = cloneProject(history.present);
      next.variations = next.variations.filter(({ id }) => id !== command.variationId);
      next.productVariants = next.productVariants.filter(({ variationId }) =>
        variationId !== command.variationId);
      if (next.activeVariationId === command.variationId) {
        next.activeVariationId = next.variations[Math.min(deletedIndex, next.variations.length - 1)].id;
      }
      const { [command.variationId]: _deletedHistory, ...variationHistory } = history.variationHistory;
      return { present: withUpdatedAt(next, history.present), variationHistory };
    }
    case 'select-layer': {
      const variation = getActiveVariation(history.present);
      if (variation.selectedLayerId === command.layerId || !variation.layers.some(({ id }) => id === command.layerId)) {
        return history;
      }
      const next = cloneProject(history.present);
      getActiveVariation(next).selectedLayerId = command.layerId;
      return { ...history, present: withUpdatedAt(next, history.present) };
    }
    case 'add-image-layer':
    case 'add-text-layer': {
      const layer = command.layer;
      const variation = getActiveVariation(history.present);
      if (variation.layers.some(({ id }) => id === layer.id)) return history;
      const next = cloneProject(history.present);
      const nextVariation = getActiveVariation(next);
      nextVariation.layers.push(structuredClone(layer));
      nextVariation.selectedLayerId = layer.id;
      return recordVariationEdit(history, withUpdatedAt(next, history.present));
    }
    case 'add-trace-layer': {
      const variation = getActiveVariation(history.present);
      const sourceIndex = variation.layers.findIndex((layer) =>
        layer.id === command.sourceLayerId && isImageLayer(layer));
      if (
        sourceIndex < 0 ||
        command.layer.sourceLayerId !== command.sourceLayerId ||
        variation.layers.some(({ id }) => id === command.layer.id)
      ) return history;
      const next = cloneProject(history.present);
      const nextVariation = getActiveVariation(next);
      const nextSource = nextVariation.layers[sourceIndex];
      if (!isImageLayer(nextSource)) return history;
      if (command.layer.sourceFingerprint !== createTraceSourceFingerprint(nextSource)) return history;
      nextSource.visible = false;
      nextVariation.layers.splice(sourceIndex + 1, 0, structuredClone(command.layer));
      nextVariation.selectedLayerId = command.layer.id;
      return recordVariationEdit(history, withUpdatedAt(next, history.present));
    }
    case 'rename-layer': {
      const current = getActiveLayer(history.present, command.layerId);
      if (!current) return history;
      const name = command.name.trim() ||
        (current.type === 'image' ? 'Image' : current.type === 'trace' ? 'Trace' : 'Text');
      if (current.name === name) return history;
      const next = updateActiveLayer(history.present, command.layerId, (layer) => ({ ...layer, name }));
      return next ? recordVariationEdit(history, withUpdatedAt(next, history.present)) : history;
    }
    case 'duplicate-layer': {
      const variation = getActiveVariation(history.present);
      const layerIndex = variation.layers.findIndex(({ id }) => id === command.layerId);
      if (layerIndex < 0) return history;
      const duplicate = {
        ...structuredClone(variation.layers[layerIndex]),
        id: createEditorId('layer'),
        name: `${variation.layers[layerIndex].name} copy`,
      };
      const next = cloneProject(history.present);
      const nextVariation = getActiveVariation(next);
      nextVariation.layers.splice(layerIndex + 1, 0, duplicate);
      nextVariation.selectedLayerId = duplicate.id;
      return recordVariationEdit(history, withUpdatedAt(next, history.present));
    }
    case 'delete-layer': {
      const variation = getActiveVariation(history.present);
      if (variation.layers.length <= 1 || !variation.layers.some(({ id }) => id === command.layerId)) return history;
      const next = cloneProject(history.present);
      const nextVariation = getActiveVariation(next);
      nextVariation.layers = nextVariation.layers.filter(({ id }) => id !== command.layerId);
      if (nextVariation.selectedLayerId === command.layerId) {
        nextVariation.selectedLayerId = nextVariation.layers[nextVariation.layers.length - 1].id;
      }
      return recordVariationEdit(history, withUpdatedAt(next, history.present));
    }
    case 'move-layer': {
      const variation = getActiveVariation(history.present);
      const layerIndex = variation.layers.findIndex(({ id }) => id === command.layerId);
      const targetIndex = command.direction === 'up' ? layerIndex + 1 : layerIndex - 1;
      if (layerIndex < 0 || targetIndex < 0 || targetIndex >= variation.layers.length) return history;
      const next = cloneProject(history.present);
      const nextLayers = getActiveVariation(next).layers;
      [nextLayers[layerIndex], nextLayers[targetIndex]] = [nextLayers[targetIndex], nextLayers[layerIndex]];
      return recordVariationEdit(history, withUpdatedAt(next, history.present));
    }
    case 'set-layer-visibility': {
      const visible = Boolean(command.visible);
      const current = getActiveLayer(history.present, command.layerId);
      if (!current || current.visible === visible) return history;
      const next = updateActiveLayer(history.present, command.layerId, (layer) => ({ ...layer, visible }));
      return next ? recordVariationEdit(history, withUpdatedAt(next, history.present)) : history;
    }
    case 'set-transform': {
      const transform = normalizeTransform(command.transform);
      const current = getActiveLayer(history.present, command.layerId);
      if (!current || sameTransform(current.transform, transform)) return history;
      const next = updateActiveLayer(history.present, command.layerId, (layer) => ({ ...layer, transform }));
      return next ? recordVariationEdit(history, withUpdatedAt(next, history.present), command.historyGroup) : history;
    }
    case 'set-crop': {
      const crop = normalizeCrop(command.crop);
      const current = getActiveLayer(history.present, command.layerId);
      if (!current || !isImageLayer(current) || sameCrop(current.crop, crop)) return history;
      const next = updateImageLayerAndStaleLinkedTraces(
        history.present,
        command.layerId,
        (layer) => ({ ...layer, crop }),
      );
      return next ? recordVariationEdit(history, withUpdatedAt(next, history.present), command.historyGroup) : history;
    }
    case 'set-adjustments': {
      const adjustments = normalizeAdjustments(command.adjustments);
      const current = getActiveLayer(history.present, command.layerId);
      if (!current || !isImageLayer(current) || sameAdjustments(current.adjustments, adjustments)) return history;
      const next = updateImageLayerAndStaleLinkedTraces(
        history.present,
        command.layerId,
        (layer) => ({ ...layer, adjustments }),
      );
      return next ? recordVariationEdit(history, withUpdatedAt(next, history.present), command.historyGroup) : history;
    }
    case 'set-background-removal': {
      const settings = normalizeBackgroundRemoval(command.settings);
      const current = getActiveLayer(history.present, command.layerId);
      if (!current || !isImageLayer(current) ||
        sameBackgroundRemoval(current.backgroundRemoval, settings)) return history;
      const next = updateImageLayerAndStaleLinkedTraces(
        history.present,
        command.layerId,
        (layer) => ({ ...layer, backgroundRemoval: settings }),
      );
      return next
        ? recordVariationEdit(history, withUpdatedAt(next, history.present), command.historyGroup)
        : history;
    }
    case 'publish-background-result': {
      const current = getActiveLayer(history.present, command.layerId);
      if (
        !current ||
        !isImageLayer(current) ||
        !command.preparedAssetId ||
        createImagePrepFingerprint(current) !== command.expectedInputFingerprint
      ) return history;
      const next = updateImageLayerAndStaleLinkedTraces(
        history.present,
        command.layerId,
        (layer) => ({
          ...layer,
          backgroundRemoval: {
            ...layer.backgroundRemoval,
            preparedAssetId: command.preparedAssetId,
            inputFingerprint: command.expectedInputFingerprint,
          },
        }),
      );
      return next
        ? { ...history, present: withUpdatedAt(next, history.present) }
        : history;
    }
    case 'set-trace-settings': {
      const settings = normalizeTraceSettings(command.settings);
      const current = getActiveLayer(history.present, command.layerId);
      if (!current || !isTraceLayer(current) || sameTraceSettings(current.settings, settings)) {
        return history;
      }
      const next = updateActiveLayer(history.present, command.layerId, (layer) =>
        isTraceLayer(layer) ? { ...layer, settings, sourceFingerprint: '' } : layer);
      return next
        ? recordVariationEdit(history, withUpdatedAt(next, history.present), command.historyGroup)
        : history;
    }
    case 'publish-trace-result': {
      const current = getActiveLayer(history.present, command.layerId);
      if (!current || !isTraceLayer(current) || !command.svgAssetId) return history;
      const source = getActiveLayer(history.present, current.sourceLayerId);
      if (!source || !isImageLayer(source)) return history;
      const sourceFingerprint = createTraceSourceFingerprint(source);
      const traceFingerprint = createTraceFingerprint(sourceFingerprint, current.settings);
      if (
        sourceFingerprint !== command.expectedSourceFingerprint ||
        traceFingerprint !== command.expectedTraceFingerprint
      ) return history;
      const settings = normalizeTraceSettings({
        ...current.settings,
        palette: command.palette,
      });
      const next = updateActiveLayer(history.present, command.layerId, (layer) =>
        isTraceLayer(layer)
          ? {
            ...layer,
            svgAssetId: command.svgAssetId,
            sourceFingerprint,
            settings,
          }
          : layer);
      return next
        ? { ...history, present: withUpdatedAt(next, history.present) }
        : history;
    }
    case 'restore-trace-source': {
      const current = getActiveLayer(history.present, command.layerId);
      if (!current || !isTraceLayer(current)) return history;
      const source = getActiveLayer(history.present, current.sourceLayerId);
      if (!source || !isImageLayer(source) || source.visible) return history;
      const next = updateActiveLayer(history.present, source.id, (layer) => ({
        ...layer,
        visible: true,
      }));
      return next ? recordVariationEdit(history, withUpdatedAt(next, history.present)) : history;
    }
    case 'set-opacity': {
      const opacity = clamp(command.opacity, 0, 1);
      const current = getActiveLayer(history.present, command.layerId);
      if (!current || current.opacity === opacity) return history;
      const next = updateActiveLayer(history.present, command.layerId, (layer) => ({ ...layer, opacity }));
      return next ? recordVariationEdit(history, withUpdatedAt(next, history.present), command.historyGroup) : history;
    }
    case 'set-text-content': {
      const text = normalizeTextContent(command.text);
      const current = getActiveLayer(history.present, command.layerId);
      if (!current || !isTextLayer(current) || current.text === text) return history;
      const next = updateActiveLayer(history.present, command.layerId, (layer) =>
        isTextLayer(layer) ? { ...layer, text } : layer);
      return next ? recordVariationEdit(history, withUpdatedAt(next, history.present), command.historyGroup) : history;
    }
    case 'set-text-style': {
      const style = normalizeTextStyle(command.style);
      const current = getActiveLayer(history.present, command.layerId);
      if (!current || !isTextLayer(current) || sameTextStyle(current, style)) return history;
      const next = updateActiveLayer(history.present, command.layerId, (layer) =>
        isTextLayer(layer) ? { ...layer, ...style } : layer);
      return next ? recordVariationEdit(history, withUpdatedAt(next, history.present), command.historyGroup) : history;
    }
    case 'set-look': {
      const look = normalizeVariationLook(command.look);
      const current = getActiveVariation(history.present);
      if (sameLook(current.look, look)) return history;
      const next = cloneProject(history.present);
      getActiveVariation(next).look = look;
      return recordVariationEdit(history, withUpdatedAt(next, history.present), command.historyGroup);
    }
    case 'reroll-look-seed': {
      const current = getActiveVariation(history.present);
      if (!isSeededLook(current.look)) return history;
      const look = normalizeVariationLook(replaceLookSeed(current.look, command.seed));
      if (sameLook(current.look, look)) return history;
      const next = cloneProject(history.present);
      getActiveVariation(next).look = look;
      return recordVariationEdit(history, withUpdatedAt(next, history.present));
    }
    case 'reset-look': {
      const current = getActiveVariation(history.present);
      const look = createDefaultLook('original');
      if (sameLook(current.look, look)) return history;
      const next = cloneProject(history.present);
      getActiveVariation(next).look = look;
      return recordVariationEdit(history, withUpdatedAt(next, history.present));
    }
    case 'set-product-placement': {
      const variationId = history.present.activeVariationId;
      const product = findTShirtProduct(history.present.productVariants, variationId);
      const placement = normalizeProductPlacement(command.placement);
      if (
        product.placement.x === placement.x &&
        product.placement.y === placement.y &&
        product.placement.scale === placement.scale &&
        product.placement.rotation === placement.rotation
      ) {
        return history;
      }
      const next = cloneProject(history.present);
      findTShirtProduct(next.productVariants, variationId).placement = placement;
      return recordVariationEdit(
        history,
        withUpdatedAt(next, history.present),
        command.historyGroup,
      );
    }
    case 'set-product-mockup': {
      const variationId = history.present.activeVariationId;
      const product = findTShirtProduct(history.present.productVariants, variationId);
      const mockupSlug = normalizeTShirtMockupSlug(command.mockupSlug);
      if (product.mockupSlug === mockupSlug) return history;
      const next = cloneProject(history.present);
      findTShirtProduct(next.productVariants, variationId).mockupSlug = mockupSlug;
      return recordVariationEdit(history, withUpdatedAt(next, history.present));
    }
  }
};
