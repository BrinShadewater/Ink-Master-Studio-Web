export const EDITOR_PROJECT_SCHEMA_VERSION = 2 as const;

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

export interface SourceMetadata {
  name: string;
  mimeType: string;
  width: number;
  height: number;
}

export interface TextLayer {
  id: string;
  type: 'text';
  name: string;
  visible: boolean;
  opacity: number;
  transform: LayerTransform;
  text: string;
  fontFamily: 'Arial' | 'Georgia' | 'Impact' | 'Trebuchet MS';
  fontSize: number;
  color: string;
  align: 'left' | 'center' | 'right';
  letterSpacing: number;
  outlineWidth: number;
  outlineColor: string;
}

export type DesignLayer = ImageLayer | TextLayer;

export interface DesignVariation {
  id: string;
  name: string;
  layers: DesignLayer[];
  selectedLayerId: string;
}

export interface EditorProject {
  schemaVersion: typeof EDITOR_PROJECT_SCHEMA_VERSION;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  sourceAssetId: string;
  sourceMetadata: SourceMetadata;
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

export const isImageLayer = (layer: DesignLayer): layer is ImageLayer => layer.type === 'image';

export const isTextLayer = (layer: DesignLayer): layer is TextLayer => layer.type === 'text';

export const createTextLayer = (text = 'Text'): TextLayer => ({
  id: createEditorId('layer'),
  type: 'text',
  name: 'Text',
  visible: true,
  opacity: 1,
  transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, flipX: false, flipY: false },
  text: text.trim() || 'Text',
  fontFamily: 'Arial',
  fontSize: 48,
  color: '#000000',
  align: 'left',
  letterSpacing: 0,
  outlineWidth: 0,
  outlineColor: '#000000',
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
    schemaVersion: EDITOR_PROJECT_SCHEMA_VERSION, id: asset.projectId, name: name.trim() || 'Untitled design',
    createdAt: timestamp, updatedAt: timestamp, activeVariationId: variation.id,
    sourceAssetId: asset.id,
    sourceMetadata: { name: asset.name, mimeType: asset.mimeType, width: asset.width, height: asset.height },
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

const normalizeImageLayer = (value: unknown): ImageLayer | null => {
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

const textFontFamilies = ['Arial', 'Georgia', 'Impact', 'Trebuchet MS'] as const;
const textAlignments = ['left', 'center', 'right'] as const;

const normalizeTextLayer = (value: unknown): TextLayer | null => {
  if (!isRecord(value) || value.type !== 'text' || !nonEmptyString(value.id)) return null;
  return {
    id: value.id,
    type: 'text',
    name: nonEmptyString(value.name) ? value.name : 'Text',
    visible: value.visible === undefined ? true : Boolean(value.visible),
    opacity: clamp(finiteNumber(value.opacity) ? value.opacity : 1, 0, 1),
    transform: normalizeTransformRecord(value.transform),
    text: nonEmptyString(value.text) ? value.text : 'Text',
    fontFamily: textFontFamilies.includes(value.fontFamily as TextLayer['fontFamily'])
      ? value.fontFamily as TextLayer['fontFamily'] : 'Arial',
    fontSize: clamp(finiteNumber(value.fontSize) ? value.fontSize : 48, 8, 400),
    color: nonEmptyString(value.color) ? value.color : '#000000',
    align: textAlignments.includes(value.align as TextLayer['align'])
      ? value.align as TextLayer['align'] : 'left',
    letterSpacing: clamp(finiteNumber(value.letterSpacing) ? value.letterSpacing : 0, -20, 100),
    outlineWidth: clamp(finiteNumber(value.outlineWidth) ? value.outlineWidth : 0, 0, 50),
    outlineColor: nonEmptyString(value.outlineColor) ? value.outlineColor : '#000000',
  };
};

const normalizeLayer = (value: unknown): DesignLayer | null =>
  normalizeImageLayer(value) ?? normalizeTextLayer(value);

const normalizeVariation = (
  value: unknown,
  normalizeLayerValue: (layer: unknown) => DesignLayer | null = normalizeLayer,
): DesignVariation | null => {
  if (!isRecord(value) || !nonEmptyString(value.id) || !Array.isArray(value.layers)) return null;
  const layers = value.layers.map(normalizeLayerValue).filter((layer): layer is DesignLayer => layer !== null);
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

const findAsset = (assets: EditorAsset[], assetId: string): EditorAsset | undefined =>
  assets.find((asset) => asset.id === assetId);

const sourceMetadataFromAsset = (asset: EditorAsset): SourceMetadata => ({
  name: asset.name,
  mimeType: asset.mimeType,
  width: asset.width,
  height: asset.height,
});

const normalizeSourceMetadata = (value: unknown, asset: EditorAsset): SourceMetadata => {
  const source = isRecord(value) ? value : {};
  return {
    name: nonEmptyString(source.name) ? source.name : asset.name,
    mimeType: nonEmptyString(source.mimeType) ? source.mimeType : asset.mimeType,
    width: finiteNumber(source.width) && source.width > 0 ? source.width : asset.width,
    height: finiteNumber(source.height) && source.height > 0 ? source.height : asset.height,
  };
};

const migrateProjectFields = (
  value: RecordValue,
  sourceAssetId: string,
  sourceMetadata: SourceMetadata,
  normalizeLayerValue: (layer: unknown) => DesignLayer | null = normalizeLayer,
): EditorProject => {
  if (!nonEmptyString(value.id)) throw new Error('Project does not contain a valid id.');
  if (!Array.isArray(value.variations)) throw new Error('Project does not contain a valid variation.');
  const variations = value.variations
    .map((variation) => normalizeVariation(variation, normalizeLayerValue))
    .filter((variation): variation is DesignVariation => variation !== null);
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
    sourceAssetId,
    sourceMetadata,
    activeVariationId,
    variations,
    productVariants: [],
  };
};

export const migrateEditorProject = (value: unknown, assets: EditorAsset[]): EditorProject => {
  if (!isRecord(value) || (value.schemaVersion !== 1 && value.schemaVersion !== EDITOR_PROJECT_SCHEMA_VERSION)) {
    throw new Error('Unsupported editor project schema.');
  }
  if (value.schemaVersion === 1) {
    const variations = Array.isArray(value.variations)
      ? value.variations.map((variation) => normalizeVariation(variation, normalizeImageLayer)) : [];
    const firstImageLayer = variations.find((variation): variation is DesignVariation => variation !== null)
      ?.layers.find(isImageLayer);
    const sourceAsset = firstImageLayer && findAsset(assets, firstImageLayer.assetId);
    if (!sourceAsset) throw new Error('Project source image not found.');
    return migrateProjectFields(value, sourceAsset.id, sourceMetadataFromAsset(sourceAsset), normalizeImageLayer);
  }

  if (!nonEmptyString(value.sourceAssetId)) throw new Error('Project source image not found.');
  const sourceAsset = findAsset(assets, value.sourceAssetId);
  if (!sourceAsset) throw new Error('Project source image not found.');
  return migrateProjectFields(value, sourceAsset.id, normalizeSourceMetadata(value.sourceMetadata, sourceAsset));
};
