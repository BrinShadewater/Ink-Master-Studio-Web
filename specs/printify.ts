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
  validation: {
    product: string;
    provider: string;
    observedPrintArea: [number, number];
    checkedAt: string;
    productCreatorUrl: string;
  };
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
      note: 'Safe full-front export validated on Gildan 5000',
      icon: 'T',
      validation: {
        product: 'Gildan 5000',
        provider: 'Printify Choice',
        observedPrintArea: [3951, 4919],
        checkedAt: '2026-07-08',
        productCreatorUrl: 'https://printify.com/app/editor/6/99/dtg',
      },
    },
    {
      id: 'hoodie-front',
      label: 'Hoodie (front)',
      shortLabel: 'Hoodie',
      itemType: ItemType.HOODIE,
      px: [3531, 2352],
      dpi: 300,
      note: 'Front print area validated on Gildan 18500',
      icon: 'H',
      validation: {
        product: 'Gildan 18500',
        provider: 'Printify Choice',
        observedPrintArea: [3531, 2352],
        checkedAt: '2026-07-08',
        productCreatorUrl: 'https://printify.com/app/editor/77/99/dtg',
      },
    },
    {
      id: 'mug-wrap',
      label: 'Mug (wrap)',
      shortLabel: 'Mug',
      itemType: ItemType.MUG,
      px: [2475, 1155],
      dpi: 300,
      note: '11oz wrap validated on the Accent Coffee Mug',
      icon: 'M',
      validation: {
        product: 'Accent Coffee Mug (11oz)',
        provider: 'Printify Choice',
        observedPrintArea: [2475, 1155],
        checkedAt: '2026-07-08',
        productCreatorUrl: 'https://printify.com/app/editor/635/99/dye-sublimation',
      },
    },
    {
      id: 'poster-12x18',
      label: 'Poster (12 x 18)',
      shortLabel: 'Poster',
      itemType: ItemType.TSHIRT,
      px: [3600, 5400],
      dpi: 300,
      note: '12 x 18in target based on the validated 300 DPI poster area',
      icon: 'P',
      validation: {
        product: 'Matte Vertical Poster (12 x 18)',
        provider: 'Printify Choice',
        observedPrintArea: [2400, 3000],
        checkedAt: '2026-07-08',
        productCreatorUrl: 'https://printify.com/app/editor/282/99/digital-printing',
      },
    },
    {
      id: 'large-format',
      label: 'Blanket (50 x 60)',
      shortLabel: 'Blanket',
      itemType: ItemType.TSHIRT,
      px: [7825, 9325],
      dpi: 150,
      note: '50 x 60in area validated on the Velveteen Plush Blanket',
      icon: 'B',
      validation: {
        product: 'Velveteen Plush Blanket (50 x 60)',
        provider: 'Printify Choice',
        observedPrintArea: [7825, 9325],
        checkedAt: '2026-07-08',
        productCreatorUrl: 'https://printify.com/app/editor/522/99/dye-sublimation',
      },
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
