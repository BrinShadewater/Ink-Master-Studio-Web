export const EDITOR_PROJECT_SCHEMA_VERSION = 1 as const;

export type EditorTool = 'select' | 'crop' | 'adjust';

export interface LayerTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
}

export interface CropRect { x: number; y: number; width: number; height: number }
export interface ImageAdjustments { brightness: number; contrast: number; saturation: number }

export interface ImageLayer {
  id: string;
  type: 'image';
  name: string;
  assetId: string;
  visible: boolean;
  opacity: number;
  transform: LayerTransform;
  crop: CropRect;
  adjustments: ImageAdjustments;
}

export interface DesignVariation {
  id: string;
  name: string;
  layers: ImageLayer[];
  selectedLayerId: string;
}

export interface EditorProject {
  schemaVersion: typeof EDITOR_PROJECT_SCHEMA_VERSION;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  activeVariationId: string;
  variations: DesignVariation[];
  productVariants: [];
}

export interface EditorAsset {
  id: string;
  projectId: string;
  name: string;
  mimeType: string;
  width: number;
  height: number;
  createdAt: number;
  blob: Blob;
}

export const createEditorId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));

export const normalizeTransform = (value: LayerTransform): LayerTransform => ({
  x: clamp(value.x, -2, 3),
  y: clamp(value.y, -2, 3),
  scale: clamp(value.scale, 0.05, 20),
  rotation: clamp(value.rotation, -180, 180),
  flipX: Boolean(value.flipX),
  flipY: Boolean(value.flipY),
});

export const createEditorAsset = (
  projectId: string,
  blob: Blob,
  metadata: { name: string; width: number; height: number },
): EditorAsset => ({
  id: createEditorId('asset'), projectId, name: metadata.name, mimeType: blob.type,
  width: metadata.width, height: metadata.height, createdAt: Date.now(), blob,
});

export const createEditorProject = (name: string, asset: EditorAsset): EditorProject => {
  const timestamp = Date.now();
  const layer: ImageLayer = {
    id: createEditorId('layer'), type: 'image', name: asset.name, assetId: asset.id, visible: true, opacity: 1,
    transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, flipX: false, flipY: false },
    crop: { x: 0, y: 0, width: 1, height: 1 },
    adjustments: { brightness: 0, contrast: 0, saturation: 0 },
  };
  const variation: DesignVariation = { id: createEditorId('variation'), name: 'Original', layers: [layer], selectedLayerId: layer.id };
  return {
    schemaVersion: 1, id: asset.projectId, name: name.trim() || 'Untitled design',
    createdAt: timestamp, updatedAt: timestamp, activeVariationId: variation.id,
    variations: [variation], productVariants: [],
  };
};

export const duplicateVariation = (source: DesignVariation, name: string): DesignVariation => {
  const duplicate = structuredClone(source);
  duplicate.id = createEditorId('variation');
  duplicate.name = name.trim() || `${source.name} copy`;
  duplicate.layers = duplicate.layers.map((layer) => ({ ...layer, id: createEditorId('layer') }));
  duplicate.selectedLayerId = duplicate.layers[0].id;
  return duplicate;
};

type RecordValue = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const finiteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const normalizeTransformRecord = (value: unknown): LayerTransform => {
  const source = isRecord(value) ? value : {};
  return normalizeTransform({
    x: finiteNumber(source.x) ? source.x : 0.5,
    y: finiteNumber(source.y) ? source.y : 0.5,
    scale: finiteNumber(source.scale) ? source.scale : 1,
    rotation: finiteNumber(source.rotation) ? source.rotation : 0,
    flipX: Boolean(source.flipX),
    flipY: Boolean(source.flipY),
  });
};

const normalizeCrop = (value: unknown): CropRect => {
  const source = isRecord(value) ? value : {};
  const x = clamp(finiteNumber(source.x) ? source.x : 0, 0, 0.95);
  const y = clamp(finiteNumber(source.y) ? source.y : 0, 0, 0.95);
  return {
    x,
    y,
    width: clamp(finiteNumber(source.width) ? source.width : 1, 0.05, 1 - x),
    height: clamp(finiteNumber(source.height) ? source.height : 1, 0.05, 1 - y),
  };
};

const normalizeAdjustments = (value: unknown): ImageAdjustments => {
  const source = isRecord(value) ? value : {};
  return {
    brightness: clamp(finiteNumber(source.brightness) ? source.brightness : 0, -100, 100),
    contrast: clamp(finiteNumber(source.contrast) ? source.contrast : 0, -100, 100),
    saturation: clamp(finiteNumber(source.saturation) ? source.saturation : 0, -100, 100),
  };
};

const normalizeLayer = (value: unknown): ImageLayer | null => {
  if (!isRecord(value) || value.type !== 'image' || !nonEmptyString(value.id) || !nonEmptyString(value.assetId)) return null;
  return {
    id: value.id,
    type: 'image',
    name: nonEmptyString(value.name) ? value.name : 'Image',
    assetId: value.assetId,
    visible: value.visible === undefined ? true : Boolean(value.visible),
    opacity: clamp(finiteNumber(value.opacity) ? value.opacity : 1, 0, 1),
    transform: normalizeTransformRecord(value.transform),
    crop: normalizeCrop(value.crop),
    adjustments: normalizeAdjustments(value.adjustments),
  };
};

const normalizeVariation = (value: unknown): DesignVariation | null => {
  if (!isRecord(value) || !nonEmptyString(value.id) || !Array.isArray(value.layers)) return null;
  const layers = value.layers.map(normalizeLayer).filter((layer): layer is ImageLayer => layer !== null);
  if (layers.length === 0) return null;
  const selectedLayerId = nonEmptyString(value.selectedLayerId) && layers.some((layer) => layer.id === value.selectedLayerId)
    ? value.selectedLayerId : layers[0].id;
  return {
    id: value.id,
    name: nonEmptyString(value.name) ? value.name : 'Original',
    layers,
    selectedLayerId,
  };
};

export const migrateEditorProject = (value: unknown): EditorProject => {
  if (!isRecord(value) || value.schemaVersion !== EDITOR_PROJECT_SCHEMA_VERSION) {
    throw new Error('Unsupported editor project schema.');
  }
  if (!nonEmptyString(value.id)) throw new Error('Project does not contain a valid id.');
  if (!Array.isArray(value.variations)) throw new Error('Project does not contain a valid variation.');
  const variations = value.variations.map(normalizeVariation).filter((variation): variation is DesignVariation => variation !== null);
  if (variations.length === 0) throw new Error('Project does not contain a valid variation.');
  if (!finiteNumber(value.createdAt)) throw new Error('Project does not contain a valid createdAt.');
  const activeVariationId = nonEmptyString(value.activeVariationId) && variations.some((variation) => variation.id === value.activeVariationId)
    ? value.activeVariationId : variations[0].id;
  return {
    schemaVersion: EDITOR_PROJECT_SCHEMA_VERSION,
    id: value.id,
    name: nonEmptyString(value.name) ? value.name : 'Untitled design',
    createdAt: value.createdAt,
    updatedAt: finiteNumber(value.updatedAt) ? value.updatedAt : value.createdAt,
    activeVariationId,
    variations,
    productVariants: [],
  };
};
