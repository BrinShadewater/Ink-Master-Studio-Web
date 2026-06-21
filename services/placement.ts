import {
  GarmentSize,
  ItemType,
  PlacementLocation,
  PlacementMeasurement,
  PlacementPreset,
} from '../types';

interface PrintableArea {
  widthInches: number;
  heightInches: number;
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
}

const PRINTABLE_AREAS: Record<ItemType, PrintableArea> = {
  [ItemType.TSHIRT]: { widthInches: 15, heightInches: 18, xPercent: 25, yPercent: 14, widthPercent: 50, heightPercent: 62 },
  [ItemType.HOODIE]: { widthInches: 14, heightInches: 15, xPercent: 27, yPercent: 18, widthPercent: 46, heightPercent: 52 },
  [ItemType.HAT]: { widthInches: 5, heightInches: 2.25, xPercent: 31, yPercent: 34, widthPercent: 38, heightPercent: 22 },
  [ItemType.MUG]: { widthInches: 8.5, heightInches: 3.5, xPercent: 18, yPercent: 30, widthPercent: 64, heightPercent: 40 },
  [ItemType.TOTE]: { widthInches: 12, heightInches: 14, xPercent: 24, yPercent: 20, widthPercent: 52, heightPercent: 58 },
};

export const DEFAULT_PLACEMENT: PlacementMeasurement = {
  presetId: 'full-front',
  itemType: ItemType.TSHIRT,
  location: 'front',
  garmentSize: 'L',
  widthInches: 12,
  heightInches: 14,
  offsetXInches: 0,
  offsetYInches: 2,
};

const preset = (
  id: string,
  name: string,
  description: string,
  location: PlacementLocation,
  widthInches: number,
  heightInches: number,
  offsetXInches: number,
  offsetYInches: number,
  garmentSize: GarmentSize = 'L',
): PlacementPreset => ({
  ...DEFAULT_PLACEMENT,
  id,
  presetId: id,
  name,
  description,
  location,
  widthInches,
  heightInches,
  offsetXInches,
  offsetYInches,
  garmentSize,
});

export const PLACEMENT_PRESETS: PlacementPreset[] = [
  preset('full-front', 'Full front', 'Standard adult full-front print.', 'front', 12, 14, 0, 2),
  preset('center-chest', 'Center chest', 'Compact centered chest placement.', 'front', 9, 8, 0, 2.5),
  preset('left-chest', 'Left chest', 'Small logo over the wearer’s left chest.', 'left-chest', 4, 4, -3.75, 2.25),
  preset('full-back', 'Full back', 'Standard full-size back placement.', 'back', 12, 14, 0, 2),
  preset('sleeve', 'Sleeve', 'Small upper-sleeve mark.', 'sleeve', 3.5, 4, 0, 1),
  preset('youth', 'Youth front', 'Reduced youth garment placement.', 'front', 9, 11, 0, 1.5, 'YOUTH'),
  preset('oversized', 'Oversized front', 'Large fashion print within the adult printable area.', 'front', 14, 17, 0, 0.5),
];

export const placementVariantKey = (
  itemType: ItemType,
  location: PlacementLocation,
  garmentSize: GarmentSize,
) => `${itemType}:${location}:${garmentSize}`;

export const validatePlacement = (placement: PlacementMeasurement) => {
  const area = PRINTABLE_AREAS[placement.itemType];
  const errors: string[] = [];
  if (placement.widthInches <= 0 || placement.widthInches > area.widthInches) {
    errors.push(`Print width must be between 0 and ${area.widthInches} inches.`);
  }
  if (placement.heightInches <= 0 || placement.heightInches > area.heightInches) {
    errors.push(`Print height must be between 0 and ${area.heightInches} inches.`);
  }
  if (Math.abs(placement.offsetXInches) + placement.widthInches / 2 > area.widthInches / 2) {
    errors.push('Horizontal offset places artwork outside the printable width.');
  }
  if (placement.offsetYInches < 0 || placement.offsetYInches + placement.heightInches > area.heightInches) {
    errors.push('Vertical offset places artwork outside the printable height.');
  }
  return { valid: errors.length === 0, errors };
};

export const placementToMockupPercent = (placement: PlacementMeasurement) => {
  const area = PRINTABLE_AREAS[placement.itemType];
  const width = (placement.widthInches / area.widthInches) * area.widthPercent;
  const height = (placement.heightInches / area.heightInches) * area.heightPercent;
  const centerX = area.xPercent + area.widthPercent / 2
    + (placement.offsetXInches / area.widthInches) * area.widthPercent;
  const y = area.yPercent + (placement.offsetYInches / area.heightInches) * area.heightPercent;
  return {
    x: centerX - width / 2,
    y,
    width,
    height,
  };
};

export const mockupPercentToPlacement = (
  percent: { x: number; y: number; width: number; height: number },
  base: PlacementMeasurement,
): PlacementMeasurement => {
  const area = PRINTABLE_AREAS[base.itemType];
  const widthInches = (percent.width / area.widthPercent) * area.widthInches;
  const heightInches = (percent.height / area.heightPercent) * area.heightInches;
  const centerPercent = percent.x + percent.width / 2;
  const areaCenter = area.xPercent + area.widthPercent / 2;
  return {
    ...base,
    presetId: 'custom',
    widthInches: Number(widthInches.toFixed(2)),
    heightInches: Number(heightInches.toFixed(2)),
    offsetXInches: Number((((centerPercent - areaCenter) / area.widthPercent) * area.widthInches).toFixed(2)),
    offsetYInches: Number((((percent.y - area.yPercent) / area.heightPercent) * area.heightInches).toFixed(2)),
  };
};

export const getPrintableArea = (itemType: ItemType) => ({ ...PRINTABLE_AREAS[itemType] });
