import {
  DEFAULT_PACKAGE_OPTIONS,
  DEFAULT_PRODUCTION_THRESHOLDS,
} from '../constants';
import {
  AppliedProductionProfile,
  ItemType,
  OutputFormat,
  PlacementLocation,
  PrintableArea,
  ProductionProfile,
  ProfileValidationError,
} from '../types';

const createId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const LOCATIONS: PlacementLocation[] = ['front', 'back', 'left-chest', 'sleeve'];

const BASE_PRINTABLE_AREAS: Record<ItemType, PrintableArea> = {
  [ItemType.TSHIRT]: { widthInches: 15, heightInches: 18, xPercent: 25, yPercent: 14, widthPercent: 50, heightPercent: 62 },
  [ItemType.HOODIE]: { widthInches: 14, heightInches: 15, xPercent: 27, yPercent: 18, widthPercent: 46, heightPercent: 52 },
  [ItemType.HAT]: { widthInches: 5, heightInches: 2.25, xPercent: 31, yPercent: 34, widthPercent: 38, heightPercent: 22 },
  [ItemType.MUG]: { widthInches: 8.5, heightInches: 3.5, xPercent: 18, yPercent: 30, widthPercent: 64, heightPercent: 40 },
  [ItemType.TOTE]: { widthInches: 12, heightInches: 14, xPercent: 24, yPercent: 20, widthPercent: 52, heightPercent: 58 },
};

export const printableAreaKey = (
  itemType: ItemType,
  location: PlacementLocation,
) => `${itemType}:${location}`;

export const createDefaultPrintableAreas = (): Record<string, PrintableArea> => {
  const printableAreas: Record<string, PrintableArea> = {};
  for (const itemType of Object.values(ItemType)) {
    for (const location of LOCATIONS) {
      printableAreas[printableAreaKey(itemType, location)] = {
        ...BASE_PRINTABLE_AREAS[itemType],
      };
    }
  }
  return printableAreas;
};

export const createProductionProfile = (
  name = 'Standard DTG',
): ProductionProfile => {
  const timestamp = Date.now();
  return {
    schemaVersion: 1,
    id: createId('profile'),
    revision: 1,
    name,
    description: '',
    printerName: '',
    method: 'DTG',
    thresholds: { ...DEFAULT_PRODUCTION_THRESHOLDS },
    printableAreas: createDefaultPrintableAreas(),
    defaults: {
      format: OutputFormat.PNG,
      preserveTransparency: true,
      includeUnderbase: false,
      packageOptions: structuredClone(DEFAULT_PACKAGE_OPTIONS),
    },
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
  };
};

export const snapshotProductionProfile = (
  profile: ProductionProfile,
): AppliedProductionProfile => ({
  profileId: profile.id,
  profileRevision: profile.revision,
  snapshot: structuredClone(profile),
});

export const duplicateProductionProfile = (
  profile: ProductionProfile,
): ProductionProfile => {
  const timestamp = Date.now();
  return {
    ...snapshotProductionProfile(profile).snapshot,
    id: createId('profile'),
    revision: 1,
    name: `${profile.name} copy`,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
  };
};

type ProductionProfilePatch = Partial<Omit<
  ProductionProfile,
  'schemaVersion' | 'id' | 'revision' | 'createdAt' | 'updatedAt'
>>;

export const reviseProductionProfile = (
  profile: ProductionProfile,
  patch: ProductionProfilePatch,
): ProductionProfile => ({
  ...snapshotProductionProfile(profile).snapshot,
  ...structuredClone(patch),
  schemaVersion: profile.schemaVersion,
  id: profile.id,
  revision: profile.revision + 1,
  createdAt: profile.createdAt,
  updatedAt: Date.now(),
});

export const validateProductionProfile = (
  profile: unknown,
): { valid: boolean; errors: ProfileValidationError[] } => {
  const errors: ProfileValidationError[] = [];
  const addError = (field: string, message: string) => {
    errors.push({ field, message });
  };
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

  if (!isRecord(profile)) {
    addError('profile', 'Production profile must be an object.');
    return { valid: false, errors };
  }

  const thresholds = profile.thresholds;
  if (!isRecord(thresholds)) {
    addError('thresholds', 'Production thresholds must be an object.');
  } else {
    const {
      targetDpi,
      warningDpi,
      criticalDpi,
      significantUpscaleRatio,
      extremeUpscaleRatio,
    } = thresholds;

    if (!isFiniteNumber(targetDpi) || targetDpi <= 0) {
      addError('thresholds.targetDpi', 'Target DPI must be greater than 0.');
    }
    if (
      !isFiniteNumber(warningDpi)
      || warningDpi <= 0
      || (isFiniteNumber(targetDpi) && warningDpi > targetDpi)
    ) {
      addError(
        'thresholds.warningDpi',
        'Warning DPI must be greater than 0 and no greater than target DPI.',
      );
    }
    if (
      !isFiniteNumber(criticalDpi)
      || criticalDpi <= 0
      || (isFiniteNumber(warningDpi) && criticalDpi >= warningDpi)
    ) {
      addError(
        'thresholds.criticalDpi',
        'Critical DPI must be greater than 0 and less than warning DPI.',
      );
    }
    if (
      !isFiniteNumber(significantUpscaleRatio)
      || significantUpscaleRatio <= 0
      || (
        isFiniteNumber(extremeUpscaleRatio)
        && significantUpscaleRatio >= extremeUpscaleRatio
      )
    ) {
      addError(
        'thresholds.significantUpscaleRatio',
        'Significant upscale ratio must be greater than 0 and less than the extreme ratio.',
      );
    }
    if (!isFiniteNumber(extremeUpscaleRatio) || extremeUpscaleRatio <= 0) {
      addError(
        'thresholds.extremeUpscaleRatio',
        'Extreme upscale ratio must be greater than 0.',
      );
    }
  }

  const printableAreas = profile.printableAreas;
  if (!isRecord(printableAreas)) {
    addError('printableAreas', 'Printable areas must be an object.');
  } else {
    for (const [key, area] of Object.entries(printableAreas)) {
      if (!isRecord(area)) {
        addError(`printableAreas.${key}`, 'Printable area must be an object.');
        continue;
      }

      const {
        widthInches,
        heightInches,
        xPercent,
        yPercent,
        widthPercent,
        heightPercent,
      } = area;

      if (!isFiniteNumber(widthInches) || widthInches <= 0) {
        addError(
          `printableAreas.${key}.widthInches`,
          'Printable width must be greater than 0.',
        );
      }
      if (!isFiniteNumber(heightInches) || heightInches <= 0) {
        addError(
          `printableAreas.${key}.heightInches`,
          'Printable height must be greater than 0.',
        );
      }
      if (!isFiniteNumber(xPercent) || xPercent < 0 || xPercent > 100) {
        addError(
          `printableAreas.${key}.xPercent`,
          'Preview x position must be between 0 and 100.',
        );
      }
      if (!isFiniteNumber(yPercent) || yPercent < 0 || yPercent > 100) {
        addError(
          `printableAreas.${key}.yPercent`,
          'Preview y position must be between 0 and 100.',
        );
      }
      if (
        !isFiniteNumber(widthPercent)
        || widthPercent <= 0
        || (isFiniteNumber(xPercent) && xPercent + widthPercent > 100)
      ) {
        addError(
          `printableAreas.${key}.widthPercent`,
          'Preview width must be positive and remain within 100%.',
        );
      }
      if (
        !isFiniteNumber(heightPercent)
        || heightPercent <= 0
        || (isFiniteNumber(yPercent) && yPercent + heightPercent > 100)
      ) {
        addError(
          `printableAreas.${key}.heightPercent`,
          'Preview height must be positive and remain within 100%.',
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
};
