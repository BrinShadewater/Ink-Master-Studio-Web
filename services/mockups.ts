export interface ProductionMockup {
  slug: string;
  name: string;
  file: string;
  color: string;
}

export const PRODUCTION_MOCKUPS: readonly ProductionMockup[] = [
  { slug: 'red', name: 'Red', file: '/mockups/mockup-red.png', color: '#C0392B' },
  { slug: 'charcoal', name: 'Charcoal', file: '/mockups/mockup-charcoal.png', color: '#3D3D3D' },
  { slug: 'heather', name: 'Heather', file: '/mockups/mockup-heather.png', color: '#8E9A9A' },
  { slug: 'military-green', name: 'Military Green', file: '/mockups/mockup-miltarygreen.png', color: '#4A5240' },
  { slug: 'forest-green', name: 'Forest Green', file: '/mockups/mockup-forestgreen.png', color: '#2D5A27' },
  { slug: 'cardinal', name: 'Cardinal', file: '/mockups/mockup-cardinal.png', color: '#8B1A1A' },
  { slug: 'black', name: 'Black', file: '/mockups/mockup-black.png', color: '#1A1A1A' },
  { slug: 'burgundy', name: 'Burgundy', file: '/mockups/mockup-burgundy.png', color: '#6B2737' },
  { slug: 'navy', name: 'Navy', file: '/mockups/mockup-navy.png', color: '#1B2A4A' },
  { slug: 'orange', name: 'Orange', file: '/mockups/mockup-orange.png', color: '#D4620A' },
  { slug: 'royal-blue', name: 'Royal Blue', file: '/mockups/mockup-royalblue.png', color: '#2255A4' },
];

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

export const getSelectedProductionMockups = (
  indices: Iterable<number> | null | undefined,
): ProductionMockup[] => normalizeMockupSelection(indices, PRODUCTION_MOCKUPS.length)
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
): string => {
  const selected = getSelectedProductionMockups(indices);
  if (selected.length === 0) return 'No mockup colors selected';
  return selected.map((mockup) => mockup.name).join(', ');
};
