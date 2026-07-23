import {
  normalizeTShirtMockupSlug,
  type TShirtMockupSlug,
} from './productModel';

export interface ProductPrintableRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TShirtMockup {
  slug: TShirtMockupSlug;
  name: string;
  file: string;
  swatch: string;
  printableRegion: ProductPrintableRegion;
}

export const DEFAULT_TSHIRT_PRINTABLE_REGION: ProductPrintableRegion = {
  x: 0.34,
  y: 0.255,
  width: 0.32,
  height: 0.44,
};

const catalogRows = [
  ['black', 'Black', '/mockups/mockup-black.png', '#1A1A1A'],
  ['burgundy', 'Burgundy', '/mockups/mockup-burgundy.png', '#6B2737'],
  ['cardinal', 'Cardinal', '/mockups/mockup-cardinal.png', '#8B1A1A'],
  ['charcoal', 'Charcoal', '/mockups/mockup-charcoal.png', '#3D3D3D'],
  ['forest-green', 'Forest green', '/mockups/mockup-forestgreen.png', '#2D5A27'],
  ['heather', 'Heather', '/mockups/mockup-heather.png', '#8E9A9A'],
  ['military-green', 'Military green', '/mockups/mockup-miltarygreen.png', '#4A5240'],
  ['navy', 'Navy', '/mockups/mockup-navy.png', '#1B2A4A'],
  ['orange', 'Orange', '/mockups/mockup-orange.png', '#D4620A'],
  ['red', 'Red', '/mockups/mockup-red.png', '#C0392B'],
  ['royal-blue', 'Royal blue', '/mockups/mockup-royalblue.png', '#2255A4'],
] as const satisfies readonly [
  TShirtMockupSlug,
  string,
  string,
  string,
][];

export const TSHIRT_MOCKUPS: readonly TShirtMockup[] = catalogRows.map(
  ([slug, name, file, swatch]) => Object.freeze({
    slug,
    name,
    file,
    swatch,
    printableRegion: Object.freeze({ ...DEFAULT_TSHIRT_PRINTABLE_REGION }),
  }),
);

export const getTShirtMockup = (slug: unknown): TShirtMockup => {
  const normalized = normalizeTShirtMockupSlug(slug);
  const mockup = TSHIRT_MOCKUPS.find((candidate) => candidate.slug === normalized);
  if (!mockup) throw new Error('T-shirt mockup not found.');
  return mockup;
};
