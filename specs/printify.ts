import { ItemType, OutputFormat, PrintSpecification } from '../types';

export interface ServiceSpec {
  service: 'printify';
  formats: Array<'png' | 'jpeg' | 'svg'>;
  colorMode: 'sRGB';
  maxBytes: { png: number; jpeg: number; svg: number };
  products: PrintifyProductPreset[];
}

export interface PrintifyProductPreset {
  id: string;
  label: string;
  shortLabel: string;
  itemType: ItemType;
  px: [number, number];
  dpi: number;
  note: string;
  icon: string;
}

export const printify: ServiceSpec = {
  service: 'printify',
  formats: ['png', 'jpeg', 'svg'],
  colorMode: 'sRGB',
  maxBytes: { png: 100e6, jpeg: 100e6, svg: 20e6 },
  products: [
    {
      id: 'tee-front-full',
      label: 'T-shirt (full front)',
      shortLabel: 'T-shirt',
      itemType: ItemType.TSHIRT,
      px: [4500, 5400],
      dpi: 300,
      note: 'Full-front apparel artboard',
      icon: 'T',
    },
    {
      id: 'hoodie-front',
      label: 'Hoodie (front)',
      shortLabel: 'Hoodie',
      itemType: ItemType.HOODIE,
      px: [4500, 5400],
      dpi: 300,
      note: 'Front print area starter',
      icon: 'H',
    },
    {
      id: 'mug-wrap',
      label: 'Mug (wrap)',
      shortLabel: 'Mug',
      itemType: ItemType.MUG,
      px: [2700, 1125],
      dpi: 300,
      note: 'Common 9 x 3.75in wrap',
      icon: 'M',
    },
    {
      id: 'poster-12x18',
      label: 'Poster (12 x 18)',
      shortLabel: 'Poster',
      itemType: ItemType.TSHIRT,
      px: [3600, 5400],
      dpi: 300,
      note: 'Poster-style raster target',
      icon: 'P',
    },
    {
      id: 'large-format',
      label: 'Large format',
      shortLabel: 'Large',
      itemType: ItemType.TSHIRT,
      px: [4500, 6000],
      dpi: 150,
      note: 'For blankets, tapestries, and oversized prints',
      icon: 'L',
    },
  ],
};

export const printifyProductToSpecification = (product: PrintifyProductPreset): PrintSpecification => ({
  method: 'DTG',
  widthInches: product.px[0] / product.dpi,
  heightInches: product.px[1] / product.dpi,
  targetDpi: product.dpi,
});

export const DEFAULT_PRINTIFY_PRODUCT_ID = 'tee-front-full';
