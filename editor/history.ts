import {
  duplicateVariation,
  normalizeTransform,
  type CropRect,
  type DesignVariation,
  type EditorProject,
  type ImageAdjustments,
  type ImageLayer,
  type LayerTransform,
} from './model';

export type EditorCommand =
  | { type: 'rename-project'; name: string }
  | { type: 'select-variation'; variationId: string }
  | { type: 'duplicate-variation'; name: string }
  | { type: 'rename-variation'; variationId: string; name: string }
  | { type: 'delete-variation'; variationId: string }
  | { type: 'set-transform'; layerId: string; transform: LayerTransform; historyGroup?: string }
  | { type: 'set-crop'; layerId: string; crop: CropRect; historyGroup?: string }
  | { type: 'set-adjustments'; layerId: string; adjustments: ImageAdjustments; historyGroup?: string }
  | { type: 'set-opacity'; layerId: string; opacity: number; historyGroup?: string }
  | { type: 'end-history-group' }
  | { type: 'undo' }
  | { type: 'redo' };

export interface VariationEditState {
  layers: ImageLayer[];
  selectedLayerId: string;
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

const getEditState = (variation: DesignVariation): VariationEditState => ({
  layers: structuredClone(variation.layers),
  selectedLayerId: variation.selectedLayerId,
});

const createVariationHistory = (): VariationHistory => ({
  past: [],
  future: [],
  activeHistoryGroup: null,
});

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

const getActiveLayer = (project: EditorProject, layerId: string): ImageLayer | undefined => {
  const variation = project.variations.find(({ id }) => id === project.activeVariationId);
  return variation?.layers.find(({ id }) => id === layerId);
};

const updateActiveLayer = (
  project: EditorProject,
  layerId: string,
  update: (layer: ImageLayer) => ImageLayer,
): EditorProject | null => {
  if (!getActiveLayer(project, layerId)) return null;
  const next = cloneProject(project);
  const variation = next.variations.find(({ id }) => id === next.activeVariationId);
  if (!variation) return null;
  variation.layers = variation.layers.map((layer) => layer.id === layerId ? update(layer) : layer);
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
  variation.selectedLayerId = state.selectedLayerId;
  return next;
};

const recordVariationEdit = (
  history: EditorHistory,
  project: EditorProject,
  historyGroup?: string,
): EditorHistory => {
  const variationId = history.present.activeVariationId;
  const currentVariation = getActiveVariation(history.present);
  const currentHistory = history.variationHistory[variationId] ?? createVariationHistory();
  const group = normalizeHistoryGroup(historyGroup);
  const past = currentHistory.activeHistoryGroup === group && group !== null
    ? cloneEditStates(currentHistory.past)
    : [...cloneEditStates(currentHistory.past), getEditState(currentVariation)].slice(-MAX_PAST_STATES);
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

export const getSelectedImageLayer = (project: EditorProject): ImageLayer => {
  const variation = getActiveVariation(project);
  const layer = variation.layers.find(({ id }) => id === variation.selectedLayerId);
  if (!layer) throw new Error('Selected editor image layer not found.');
  return layer;
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
  const variation = getActiveVariation(history.present);
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
        future: [getEditState(variation), ...cloneEditStates(currentHistory.future)],
        activeHistoryGroup: null,
      },
    },
  };
};

const redo = (history: EditorHistory): EditorHistory => {
  const variationId = history.present.activeVariationId;
  const variation = getActiveVariation(history.present);
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
        past: [...cloneEditStates(currentHistory.past), getEditState(variation)].slice(-MAX_PAST_STATES),
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
      const next = cloneProject(history.present);
      next.activeVariationId = command.variationId;
      return { ...history, present: withUpdatedAt(next, history.present) };
    }
    case 'duplicate-variation': {
      const next = cloneProject(history.present);
      const duplicate = duplicateVariation(getActiveVariation(history.present), command.name);
      next.variations = [...next.variations, duplicate];
      next.activeVariationId = duplicate.id;
      return {
        present: withUpdatedAt(next, history.present),
        variationHistory: {
          ...history.variationHistory,
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
      if (next.activeVariationId === command.variationId) {
        next.activeVariationId = next.variations[Math.min(deletedIndex, next.variations.length - 1)].id;
      }
      const { [command.variationId]: _deletedHistory, ...variationHistory } = history.variationHistory;
      return { present: withUpdatedAt(next, history.present), variationHistory };
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
      if (!current || sameCrop(current.crop, crop)) return history;
      const next = updateActiveLayer(history.present, command.layerId, (layer) => ({ ...layer, crop }));
      return next ? recordVariationEdit(history, withUpdatedAt(next, history.present), command.historyGroup) : history;
    }
    case 'set-adjustments': {
      const adjustments = normalizeAdjustments(command.adjustments);
      const current = getActiveLayer(history.present, command.layerId);
      if (!current || sameAdjustments(current.adjustments, adjustments)) return history;
      const next = updateActiveLayer(history.present, command.layerId, (layer) => ({ ...layer, adjustments }));
      return next ? recordVariationEdit(history, withUpdatedAt(next, history.present), command.historyGroup) : history;
    }
    case 'set-opacity': {
      const opacity = clamp(command.opacity, 0, 1);
      const current = getActiveLayer(history.present, command.layerId);
      if (!current || current.opacity === opacity) return history;
      const next = updateActiveLayer(history.present, command.layerId, (layer) => ({ ...layer, opacity }));
      return next ? recordVariationEdit(history, withUpdatedAt(next, history.present), command.historyGroup) : history;
    }
  }
};
