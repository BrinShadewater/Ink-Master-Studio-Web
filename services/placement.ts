import {
  GarmentSize,
  ItemType,
  PlacementLocation,
  PlacementMeasurement,
  PlacementPreset,
  PreflightFinding,
  PrintableArea,
  ProductionProfile,
} from '../types';
import { printableAreaKey } from './productionProfiles';

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

const placementNumbers = (
  placement: Pick<
    PlacementMeasurement,
    'widthInches' | 'heightInches' | 'offsetXInches' | 'offsetYInches'
  >,
) => [
  placement.widthInches,
  placement.heightInches,
  placement.offsetXInches,
  placement.offsetYInches,
];

const assertFiniteNumbers = (values: number[]) => {
  if (!values.every(Number.isFinite)) {
    throw new Error('Placement conversion requires finite numeric values.');
  }
};

export const getPrintableArea = (
  itemType: ItemType,
  location: PlacementLocation,
  profile: ProductionProfile,
): PrintableArea | undefined => {
  const area = profile.printableAreas[printableAreaKey(itemType, location)];
  return area ? { ...area } : undefined;
};

export const validatePlacement = (
  placement: PlacementMeasurement,
  profile: ProductionProfile,
): { valid: boolean; errors: string[] } => {
  const area = getPrintableArea(placement.itemType, placement.location, profile);
  if (!area) {
    return {
      valid: false,
      errors: ['The selected profile does not support this product and placement.'],
    };
  }

  const errors: string[] = [];
  if (!Number.isFinite(placement.widthInches) || placement.widthInches <= 0 || placement.widthInches > area.widthInches) {
    errors.push(`Print width must be between 0 and ${area.widthInches} inches.`);
  }
  if (!Number.isFinite(placement.heightInches) || placement.heightInches <= 0 || placement.heightInches > area.heightInches) {
    errors.push(`Print height must be between 0 and ${area.heightInches} inches.`);
  }
  if (
    !Number.isFinite(placement.offsetXInches)
    || !Number.isFinite(placement.widthInches)
    || Math.abs(placement.offsetXInches) + placement.widthInches / 2 > area.widthInches / 2
  ) {
    errors.push('Horizontal offset places artwork outside the printable width.');
  }
  if (
    !Number.isFinite(placement.offsetYInches)
    || !Number.isFinite(placement.heightInches)
    || placement.offsetYInches < 0
    || placement.offsetYInches + placement.heightInches > area.heightInches
  ) {
    errors.push('Vertical offset places artwork outside the printable height.');
  }
  return { valid: errors.length === 0, errors };
};

const fitPlacementToArea = (
  placement: PlacementMeasurement,
  area: PrintableArea,
): PlacementMeasurement => {
  const defaultWidth = Math.min(DEFAULT_PLACEMENT.widthInches, area.widthInches);
  const defaultHeight = Math.min(DEFAULT_PLACEMENT.heightInches, area.heightInches);
  const widthInches = Number.isFinite(placement.widthInches) && placement.widthInches > 0
    ? Math.min(placement.widthInches, area.widthInches)
    : defaultWidth;
  const heightInches = Number.isFinite(placement.heightInches) && placement.heightInches > 0
    ? Math.min(placement.heightInches, area.heightInches)
    : defaultHeight;
  const maximumOffsetX = Math.max(0, (area.widthInches - widthInches) / 2);
  const offsetXInches = Number.isFinite(placement.offsetXInches)
    ? Math.max(-maximumOffsetX, Math.min(placement.offsetXInches, maximumOffsetX))
    : 0;
  const maximumOffsetY = Math.max(0, area.heightInches - heightInches);
  const offsetYInches = Number.isFinite(placement.offsetYInches)
    ? Math.max(0, Math.min(placement.offsetYInches, maximumOffsetY))
    : 0;

  return {
    ...placement,
    widthInches,
    heightInches,
    offsetXInches,
    offsetYInches,
  };
};

export const storePlacementVariant = (
  placements: Record<string, PlacementMeasurement>,
  placement: PlacementMeasurement,
) => {
  const activePlacementKey = placementVariantKey(
    placement.itemType,
    placement.location,
    placement.garmentSize,
  );
  return {
    activePlacementKey,
    placements: {
      ...placements,
      [activePlacementKey]: { ...placement },
    },
  };
};

export const ensurePlacementForProduct = (
  placements: Record<string, PlacementMeasurement>,
  activePlacementKey: string,
  itemType: ItemType,
  profile: ProductionProfile,
) => {
  const current = placements[activePlacementKey] ?? DEFAULT_PLACEMENT;
  const location = getPrintableArea(itemType, current.location, profile)
    ? current.location
    : 'front';
  const nextKey = placementVariantKey(itemType, location, current.garmentSize);
  const existing = placements[nextKey];
  if (existing?.itemType === itemType) {
    return {
      activePlacementKey: nextKey,
      placement: { ...existing },
      placements: { ...placements },
    };
  }

  const area = getPrintableArea(itemType, location, profile);
  const placement = area
    ? fitPlacementToArea({
        ...current,
        presetId: 'custom',
        itemType,
        location,
      }, area)
    : {
        ...current,
        presetId: 'custom',
        itemType,
        location,
      };
  const stored = storePlacementVariant(placements, placement);
  return { ...stored, placement };
};

export const applyPlacementPreset = (
  preset: PlacementPreset,
  current: PlacementMeasurement,
  profile: ProductionProfile,
): PlacementMeasurement => {
  const {
    id: _id,
    name: _name,
    description: _description,
    itemType: _itemType,
    ...measurement
  } = preset;
  const location = getPrintableArea(current.itemType, measurement.location, profile)
    ? measurement.location
    : 'front';
  const placement = {
    ...measurement,
    itemType: current.itemType,
    location,
  };
  const area = getPrintableArea(placement.itemType, placement.location, profile);
  return area ? fitPlacementToArea(placement, area) : placement;
};

const requirePrintableArea = (
  itemType: ItemType,
  location: PlacementLocation,
  profile: ProductionProfile,
) => {
  const area = getPrintableArea(itemType, location, profile);
  if (!area) {
    throw new Error('Unsupported product and placement for the applied profile.');
  }
  return area;
};

export const placementToMockupPercent = (
  placement: PlacementMeasurement,
  profile: ProductionProfile,
) => {
  assertFiniteNumbers(placementNumbers(placement));
  const area = requirePrintableArea(placement.itemType, placement.location, profile);
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
  profile: ProductionProfile,
): PlacementMeasurement => {
  assertFiniteNumbers([
    percent.x,
    percent.y,
    percent.width,
    percent.height,
    ...placementNumbers(base),
  ]);
  const area = requirePrintableArea(base.itemType, base.location, profile);
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

export const createPlacementPreflightFinding = (
  placement: PlacementMeasurement,
  profile: ProductionProfile,
): PreflightFinding | null => {
  const validation = validatePlacement(placement, profile);
  if (validation.valid) return null;

  const area = getPrintableArea(placement.itemType, placement.location, profile);
  const context = area
    ? `${profile.name} maximum for ${placement.itemType} ${placement.location} is ${area.widthInches} × ${area.heightInches} in.`
    : `${profile.name} does not define a printable area for ${placement.itemType} ${placement.location}.`;

  return {
    id: 'placement-area',
    severity: 'critical',
    title: 'Placement exceeds printable area',
    message: `${validation.errors.join(' ')} ${context}`,
    action: 'Reduce dimensions/offset or choose a compatible production profile.',
  };
};

export const combinePreflightFindings = (
  findings: PreflightFinding[],
  placementFinding: PreflightFinding | null,
): PreflightFinding[] => {
  const placementId = placementFinding?.id;
  const combined = findings.filter((finding) => finding.id !== placementId);
  return placementFinding ? [...combined, placementFinding] : [...combined];
};
