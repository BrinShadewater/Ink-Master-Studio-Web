import { ItemType } from '../types';

export interface ProductionMockup {
  slug: string;
  name: string;
  file: string;
  color: string;
  itemTypes: ItemType[];
}

export const PRODUCTION_MOCKUPS: readonly ProductionMockup[] = [
  { slug: 'red', name: 'Red', file: '/mockups/mockup-red.png', color: '#C0392B', itemTypes: [ItemType.TSHIRT] },
  { slug: 'charcoal', name: 'Charcoal', file: '/mockups/mockup-charcoal.png', color: '#3D3D3D', itemTypes: [ItemType.TSHIRT] },
  { slug: 'heather', name: 'Heather', file: '/mockups/mockup-heather.png', color: '#8E9A9A', itemTypes: [ItemType.TSHIRT] },
  { slug: 'military-green', name: 'Military Green', file: '/mockups/mockup-miltarygreen.png', color: '#4A5240', itemTypes: [ItemType.TSHIRT] },
  { slug: 'forest-green', name: 'Forest Green', file: '/mockups/mockup-forestgreen.png', color: '#2D5A27', itemTypes: [ItemType.TSHIRT] },
  { slug: 'cardinal', name: 'Cardinal', file: '/mockups/mockup-cardinal.png', color: '#8B1A1A', itemTypes: [ItemType.TSHIRT] },
  { slug: 'black', name: 'Black', file: '/mockups/mockup-black.png', color: '#1A1A1A', itemTypes: [ItemType.TSHIRT] },
  { slug: 'burgundy', name: 'Burgundy', file: '/mockups/mockup-burgundy.png', color: '#6B2737', itemTypes: [ItemType.TSHIRT] },
  { slug: 'navy', name: 'Navy', file: '/mockups/mockup-navy.png', color: '#1B2A4A', itemTypes: [ItemType.TSHIRT] },
  { slug: 'orange', name: 'Orange', file: '/mockups/mockup-orange.png', color: '#D4620A', itemTypes: [ItemType.TSHIRT] },
  { slug: 'royal-blue', name: 'Royal Blue', file: '/mockups/mockup-royalblue.png', color: '#2255A4', itemTypes: [ItemType.TSHIRT] },
  { slug: 'hoodie-black', name: 'Black hoodie', file: '/mockups/mockup-hoodie-black.svg', color: '#171717', itemTypes: [ItemType.HOODIE] },
  { slug: 'hoodie-heather', name: 'Heather hoodie', file: '/mockups/mockup-hoodie-heather.svg', color: '#8E9A9A', itemTypes: [ItemType.HOODIE] },
  { slug: 'hat-black', name: 'Black hat', file: '/mockups/mockup-hat-black.svg', color: '#111827', itemTypes: [ItemType.HAT] },
  { slug: 'hat-navy', name: 'Navy hat', file: '/mockups/mockup-hat-navy.svg', color: '#1B2A4A', itemTypes: [ItemType.HAT] },
  { slug: 'mug-white', name: 'White mug', file: '/mockups/mockup-mug-white.svg', color: '#F8FAFC', itemTypes: [ItemType.MUG] },
  { slug: 'mug-black', name: 'Black mug', file: '/mockups/mockup-mug-black.svg', color: '#111827', itemTypes: [ItemType.MUG] },
  { slug: 'tote-natural', name: 'Natural tote', file: '/mockups/mockup-tote-natural.svg', color: '#D8C3A5', itemTypes: [ItemType.TOTE] },
  { slug: 'tote-black', name: 'Black tote', file: '/mockups/mockup-tote-black.svg', color: '#171717', itemTypes: [ItemType.TOTE] },
];

export interface ProductionMockupEntry {
  index: number;
  mockup: ProductionMockup;
}

export const normalizeMockupSelection = (
  indices: Iterable<number> | null | undefined,
  maxExclusive = Number.POSITIVE_INFINITY,
): number[] => {
  if (!indices) return [];

  const max = Number.isFinite(maxExclusive) ? maxExclusive : Number.POSITIVE_INFINITY;

  return Array.from(new Set(indices))
    .filter((index) => (
      Number.isInteger(index)
      && index >= 0
      && index < max
    ))
    .sort((a, b) => a - b);
};

export const getProductionMockupEntries = (
  itemType?: ItemType | null,
): ProductionMockupEntry[] => PRODUCTION_MOCKUPS
  .map((mockup, index) => ({ index, mockup }))
  .filter((entry) => !itemType || entry.mockup.itemTypes.includes(itemType));

export const getDefaultMockupSelectionForItemType = (
  itemType?: ItemType | null,
): number[] => {
  if (!itemType || itemType === ItemType.TSHIRT) return [1, 2, 6];
  return getProductionMockupEntries(itemType).map((entry) => entry.index).slice(0, 2);
};

export const normalizeMockupSelectionForItemType = (
  indices: Iterable<number> | null | undefined,
  itemType?: ItemType | null,
): number[] => {
  const validIndices = new Set(getProductionMockupEntries(itemType).map((entry) => entry.index));
  return normalizeMockupSelection(indices, PRODUCTION_MOCKUPS.length)
    .filter((index) => validIndices.has(index));
};

export const resolveMockupSelectionForItemType = (
  indices: Iterable<number> | null | undefined,
  itemType?: ItemType | null,
): number[] => {
  const requested = indices ? Array.from(indices) : [];
  const normalized = normalizeMockupSelectionForItemType(indices, itemType);
  return normalized.length > 0 || requested.length === 0
    ? normalized
    : getDefaultMockupSelectionForItemType(itemType);
};

export const getSelectedProductionMockups = (
  indices: Iterable<number> | null | undefined,
  itemType?: ItemType | null,
): ProductionMockup[] => resolveMockupSelectionForItemType(indices, itemType)
  .map((index) => PRODUCTION_MOCKUPS[index]);

export const getProductionMockupBySlug = (slug: string): ProductionMockup | undefined =>
  PRODUCTION_MOCKUPS.find((mockup) => mockup.slug === slug);

export const resolveProductionMockupLabel = (filename: string): string => {
  const normalized = filename.split(/[\\/]/).pop() ?? filename;
  const slug = normalized.toLowerCase().replace(/\.(png|jpe?g|webp)$/i, '').replace(/-mockup$/, '');
  const mockup = getProductionMockupBySlug(slug);
  if (mockup) return mockup.name;

  return normalized
    .replace(/\.(png|jpe?g|webp)$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export const describeSelectedMockups = (
  indices: Iterable<number> | null | undefined,
  itemType?: ItemType | null,
): string => {
  const selected = getSelectedProductionMockups(indices, itemType);
  if (selected.length === 0) return 'No mockup colors selected';
  return selected.map((mockup) => mockup.name).join(', ');
};
