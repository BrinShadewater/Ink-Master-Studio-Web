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
  | { type: 'set-transform'; layerId: string; transform: LayerTransform; historyGroup?: string }
  | { type: 'set-crop'; layerId: string; crop: CropRect; historyGroup?: string }
  | { type: 'set-adjustments'; layerId: string; adjustments: ImageAdjustments; historyGroup?: string }
  | { type: 'set-opacity'; layerId: string; opacity: number; historyGroup?: string }
  | { type: 'end-history-group' }
  | { type: 'undo' }
  | { type: 'redo' };

export interface EditorHistory {
  past: EditorProject[];
  present: EditorProject;
  future: EditorProject[];
  activeHistoryGroup: string | null;
}

const MAX_PAST_STATES = 100;

const cloneProject = (project: EditorProject): EditorProject => structuredClone(project);

const cloneProjects = (projects: EditorProject[]): EditorProject[] => projects.map(cloneProject);

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

const recordEdit = (
  history: EditorHistory,
  project: EditorProject,
  historyGroup?: string,
): EditorHistory => {
  const group = normalizeHistoryGroup(historyGroup);
  const past = history.activeHistoryGroup === group && group !== null
    ? cloneProjects(history.past)
    : [...cloneProjects(history.past), cloneProject(history.present)].slice(-MAX_PAST_STATES);
  return {
    past,
    present: cloneProject(project),
    future: [],
    activeHistoryGroup: group,
  };
};

export const createEditorHistory = (project: EditorProject): EditorHistory => ({
  past: [], present: cloneProject(project), future: [], activeHistoryGroup: null,
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

const undo = (history: EditorHistory): EditorHistory => {
  if (history.past.length === 0) return { ...history, activeHistoryGroup: null };
  const previous = history.past[history.past.length - 1];
  return {
    past: cloneProjects(history.past.slice(0, -1)),
    present: cloneProject(previous),
    future: [cloneProject(history.present), ...cloneProjects(history.future)],
    activeHistoryGroup: null,
  };
};

const redo = (history: EditorHistory): EditorHistory => {
  if (history.future.length === 0) return { ...history, activeHistoryGroup: null };
  const next = history.future[0];
  return {
    past: [...cloneProjects(history.past), cloneProject(history.present)].slice(-MAX_PAST_STATES),
    present: cloneProject(next),
    future: cloneProjects(history.future.slice(1)),
    activeHistoryGroup: null,
  };
};

export const reduceEditorHistory = (history: EditorHistory, command: EditorCommand): EditorHistory => {
  switch (command.type) {
    case 'undo':
      return undo(history);
    case 'redo':
      return redo(history);
    case 'end-history-group':
      return { ...history, activeHistoryGroup: null };
    case 'rename-project': {
      const name = command.name.trim() || 'Untitled design';
      if (name === history.present.name) return history;
      const next = cloneProject(history.present);
      next.name = name;
      return recordEdit(history, withUpdatedAt(next, history.present));
    }
    case 'select-variation': {
      if (!history.present.variations.some(({ id }) => id === command.variationId) ||
        history.present.activeVariationId === command.variationId) return history;
      const next = cloneProject(history.present);
      next.activeVariationId = command.variationId;
      return recordEdit(history, withUpdatedAt(next, history.present));
    }
    case 'duplicate-variation': {
      const next = cloneProject(history.present);
      const duplicate = duplicateVariation(getActiveVariation(history.present), command.name);
      next.variations = [...next.variations, duplicate];
      next.activeVariationId = duplicate.id;
      return recordEdit(history, withUpdatedAt(next, history.present));
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
      return recordEdit(history, withUpdatedAt(next, history.present));
    }
    case 'set-transform': {
      const transform = normalizeTransform(command.transform);
      const current = getActiveLayer(history.present, command.layerId);
      if (!current || sameTransform(current.transform, transform)) return history;
      const next = updateActiveLayer(history.present, command.layerId, (layer) => ({ ...layer, transform }));
      return next ? recordEdit(history, withUpdatedAt(next, history.present), command.historyGroup) : history;
    }
    case 'set-crop': {
      const crop = normalizeCrop(command.crop);
      const current = getActiveLayer(history.present, command.layerId);
      if (!current || sameCrop(current.crop, crop)) return history;
      const next = updateActiveLayer(history.present, command.layerId, (layer) => ({ ...layer, crop }));
      return next ? recordEdit(history, withUpdatedAt(next, history.present), command.historyGroup) : history;
    }
    case 'set-adjustments': {
      const adjustments = normalizeAdjustments(command.adjustments);
      const current = getActiveLayer(history.present, command.layerId);
      if (!current || sameAdjustments(current.adjustments, adjustments)) return history;
      const next = updateActiveLayer(history.present, command.layerId, (layer) => ({ ...layer, adjustments }));
      return next ? recordEdit(history, withUpdatedAt(next, history.present), command.historyGroup) : history;
    }
    case 'set-opacity': {
      const opacity = clamp(command.opacity, 0, 1);
      const current = getActiveLayer(history.present, command.layerId);
      if (!current || current.opacity === opacity) return history;
      const next = updateActiveLayer(history.present, command.layerId, (layer) => ({ ...layer, opacity }));
      return next ? recordEdit(history, withUpdatedAt(next, history.present), command.historyGroup) : history;
    }
  }
};
