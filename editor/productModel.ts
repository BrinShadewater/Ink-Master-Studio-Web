export const TSHIRT_MOCKUP_SLUGS = [
  'black',
  'burgundy',
  'cardinal',
  'charcoal',
  'forest-green',
  'heather',
  'military-green',
  'navy',
  'orange',
  'red',
  'royal-blue',
] as const;

export type TShirtMockupSlug = typeof TSHIRT_MOCKUP_SLUGS[number];

export interface ProductPlacement {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface TShirtProductVariant {
  id: string;
  variationId: string;
  type: 'tshirt';
  mockupSlug: TShirtMockupSlug;
  placement: ProductPlacement;
}

export const PRODUCT_PLACEMENT_BOUNDS = {
  x: { min: 0, max: 1 },
  y: { min: 0, max: 1 },
  scale: { min: 0.1, max: 1.5 },
  rotation: { min: -180, max: 180 },
} as const;

export const DEFAULT_PRODUCT_PLACEMENT: ProductPlacement = {
  x: 0.5,
  y: 0.5,
  scale: 0.72,
  rotation: 0,
};

type RecordValue = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const finiteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

const mockupSlugs = new Set<string>(TSHIRT_MOCKUP_SLUGS);

export const normalizeTShirtMockupSlug = (value: unknown): TShirtMockupSlug =>
  typeof value === 'string' && mockupSlugs.has(value)
    ? value as TShirtMockupSlug
    : 'black';

export const normalizeProductPlacement = (value: unknown): ProductPlacement => {
  const source = isRecord(value) ? value : {};
  return {
    x: finiteNumber(source.x)
      ? clamp(source.x, PRODUCT_PLACEMENT_BOUNDS.x.min, PRODUCT_PLACEMENT_BOUNDS.x.max)
      : DEFAULT_PRODUCT_PLACEMENT.x,
    y: finiteNumber(source.y)
      ? clamp(source.y, PRODUCT_PLACEMENT_BOUNDS.y.min, PRODUCT_PLACEMENT_BOUNDS.y.max)
      : DEFAULT_PRODUCT_PLACEMENT.y,
    scale: finiteNumber(source.scale)
      ? clamp(source.scale, PRODUCT_PLACEMENT_BOUNDS.scale.min, PRODUCT_PLACEMENT_BOUNDS.scale.max)
      : DEFAULT_PRODUCT_PLACEMENT.scale,
    rotation: finiteNumber(source.rotation)
      ? clamp(source.rotation, PRODUCT_PLACEMENT_BOUNDS.rotation.min, PRODUCT_PLACEMENT_BOUNDS.rotation.max)
      : DEFAULT_PRODUCT_PLACEMENT.rotation,
  };
};

export const createDefaultTShirtProduct = (
  variationId: string,
  id: string,
): TShirtProductVariant => ({
  id,
  variationId,
  type: 'tshirt',
  mockupSlug: 'black',
  placement: { ...DEFAULT_PRODUCT_PLACEMENT },
});

export const duplicateTShirtProduct = (
  source: TShirtProductVariant,
  variationId: string,
  id: string,
): TShirtProductVariant => ({
  ...structuredClone(source),
  id,
  variationId,
  placement: normalizeProductPlacement(source.placement),
});

const claimProductId = (
  requestedId: unknown,
  usedIds: Set<string>,
  createId: () => string,
) => {
  let id = nonEmptyString(requestedId) && !usedIds.has(requestedId)
    ? requestedId
    : createId();
  while (!nonEmptyString(id) || usedIds.has(id)) id = createId();
  usedIds.add(id);
  return id;
};

export const normalizeTShirtProductVariants = (
  value: unknown,
  variationIds: readonly string[],
  createId: () => string,
): TShirtProductVariant[] => {
  const knownVariationIds = new Set(variationIds);
  const linkedVariationIds = new Set<string>();
  const usedIds = new Set<string>();
  const products: TShirtProductVariant[] = [];

  for (const candidate of Array.isArray(value) ? value : []) {
    if (
      !isRecord(candidate) ||
      candidate.type !== 'tshirt' ||
      !nonEmptyString(candidate.variationId) ||
      !knownVariationIds.has(candidate.variationId) ||
      linkedVariationIds.has(candidate.variationId)
    ) {
      continue;
    }
    products.push({
      id: claimProductId(candidate.id, usedIds, createId),
      variationId: candidate.variationId,
      type: 'tshirt',
      mockupSlug: normalizeTShirtMockupSlug(candidate.mockupSlug),
      placement: normalizeProductPlacement(candidate.placement),
    });
    linkedVariationIds.add(candidate.variationId);
  }

  for (const variationId of variationIds) {
    if (linkedVariationIds.has(variationId)) continue;
    products.push(createDefaultTShirtProduct(
      variationId,
      claimProductId(null, usedIds, createId),
    ));
  }

  return products;
};

export const findTShirtProduct = (
  products: readonly TShirtProductVariant[],
  variationId: string,
): TShirtProductVariant => {
  const product = products.find((candidate) => candidate.variationId === variationId);
  if (!product) throw new Error('T-shirt product not found for variation.');
  return product;
};
