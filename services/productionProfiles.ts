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

const cloneProfile = (profile: ProductionProfile): ProductionProfile =>
  structuredClone(profile);

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

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

const REQUIRED_PRINTABLE_AREA_KEYS = Object.values(ItemType).flatMap((itemType) =>
  LOCATIONS.map((location) => printableAreaKey(itemType, location)));

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

  if (profile.schemaVersion !== 1) {
    addError('schemaVersion', 'Schema version must be 1.');
  }
  if (typeof profile.id !== 'string' || profile.id.trim().length === 0) {
    addError('id', 'Profile ID must be a non-empty string.');
  }
  if (
    typeof profile.revision !== 'number'
    || !Number.isInteger(profile.revision)
    || profile.revision < 1
  ) {
    addError('revision', 'Profile revision must be an integer of at least 1.');
  }
  if (typeof profile.name !== 'string' || profile.name.trim().length === 0) {
    addError('name', 'Profile name must be a non-empty string.');
  }
  if (typeof profile.description !== 'string') {
    addError('description', 'Profile description must be a string.');
  }
  if (typeof profile.printerName !== 'string') {
    addError('printerName', 'Printer name must be a string.');
  }
  if (profile.method !== 'DTG' && profile.method !== 'DTF') {
    addError('method', 'Production method must be DTG or DTF.');
  }
  if (!isFiniteNumber(profile.createdAt) || profile.createdAt < 0) {
    addError('createdAt', 'Created timestamp must be a nonnegative finite number.');
  }
  if (!isFiniteNumber(profile.updatedAt) || profile.updatedAt < 0) {
    addError('updatedAt', 'Updated timestamp must be a nonnegative finite number.');
  }
  if (
    profile.archivedAt !== null
    && (!isFiniteNumber(profile.archivedAt) || profile.archivedAt < 0)
  ) {
    addError(
      'archivedAt',
      'Archived timestamp must be null or a nonnegative finite number.',
    );
  }

  const defaults = profile.defaults;
  if (!isRecord(defaults)) {
    addError('defaults', 'Production defaults must be an object.');
  } else {
    if (!Object.values(OutputFormat).includes(defaults.format as OutputFormat)) {
      addError('defaults.format', 'Default format must be a supported output format.');
    }
    if (typeof defaults.preserveTransparency !== 'boolean') {
      addError(
        'defaults.preserveTransparency',
        'Preserve transparency must be a boolean.',
      );
    }
    if (typeof defaults.includeUnderbase !== 'boolean') {
      addError('defaults.includeUnderbase', 'Include underbase must be a boolean.');
    }

    const packageOptions = defaults.packageOptions;
    if (!isRecord(packageOptions)) {
      addError(
        'defaults.packageOptions',
        'Production package options must be an object.',
      );
    } else {
      if (typeof packageOptions.namingPattern !== 'string') {
        addError(
          'defaults.packageOptions.namingPattern',
          'Naming pattern must be a string.',
        );
      }

      const booleanOptionFields = [
        'includePrintMaster',
        'includeProductionPdf',
        'includeMockups',
        'includeUnderbase',
        'includeSummary',
        'includeManifest',
      ] as const;
      for (const field of booleanOptionFields) {
        if (typeof packageOptions[field] !== 'boolean') {
          addError(
            `defaults.packageOptions.${field}`,
            `${field} must be a boolean.`,
          );
        }
      }

      const selectedMockupIndices = packageOptions.selectedMockupIndices;
      if (
        !Array.isArray(selectedMockupIndices)
        || !selectedMockupIndices.every(
          (value) =>
            typeof value === 'number'
            && Number.isFinite(value)
            && Number.isInteger(value)
            && value >= 0,
        )
      ) {
        addError(
          'defaults.packageOptions.selectedMockupIndices',
          'Selected mockup indices must be nonnegative finite integers.',
        );
      }
    }
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
    const areaEntries = Object.entries(printableAreas);
    if (areaEntries.length === 0) {
      addError('printableAreas', 'At least one printable area is required.');
    }
    const requiredKeys = new Set(REQUIRED_PRINTABLE_AREA_KEYS);
    for (const key of Object.keys(printableAreas)) {
      if (!requiredKeys.has(key)) {
        addError(`printableAreas.${key}`, 'Printable area key is not supported.');
      }
    }
    for (const key of REQUIRED_PRINTABLE_AREA_KEYS) {
      if (!(key in printableAreas)) {
        addError(`printableAreas.${key}`, 'Required printable area is missing.');
      }
    }
    for (const [key, area] of areaEntries) {
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

export const exportProductionProfiles = (
  profiles: ProductionProfile[],
): string => JSON.stringify({
  format: 'inkmaster-production-profiles',
  schemaVersion: 1,
  exportedAt: new Date().toISOString(),
  profiles: profiles.map(cloneProfile),
}, null, 2);

export const importProductionProfiles = (
  portableJson: string,
  localProfiles: ProductionProfile[],
  confirmUpdate: (
    incoming: ProductionProfile,
    local: ProductionProfile,
  ) => boolean = () => false,
): {
  profiles: ProductionProfile[];
  errors: ProfileValidationError[];
  skippedIds: string[];
} => {
  const unchangedLocals = localProfiles.map(cloneProfile);
  let parsed: unknown;

  try {
    parsed = JSON.parse(portableJson);
  } catch {
    return {
      profiles: unchangedLocals,
      errors: [{ field: 'format', message: 'Portable profile JSON is malformed.' }],
      skippedIds: [],
    };
  }

  const errors: ProfileValidationError[] = [];
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

  if (!isRecord(parsed) || parsed.format !== 'inkmaster-production-profiles') {
    errors.push({
      field: 'format',
      message: 'Portable profile format must be inkmaster-production-profiles.',
    });
  }
  if (!isRecord(parsed) || parsed.schemaVersion !== 1) {
    errors.push({
      field: 'schemaVersion',
      message: 'Portable profile schema version must be 1.',
    });
  }
  const exportedAt = isRecord(parsed) ? parsed.exportedAt : undefined;
  const exportedDate = typeof exportedAt === 'string'
    ? new Date(exportedAt)
    : null;
  if (
    exportedDate === null
    || Number.isNaN(exportedDate.getTime())
    || exportedDate.toISOString() !== exportedAt
  ) {
    errors.push({
      field: 'exportedAt',
      message: 'Portable profile export timestamp must be a canonical ISO date.',
    });
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.profiles)) {
    errors.push({
      field: 'profiles',
      message: 'Portable profile envelope must contain a profiles array.',
    });
  }

  if (errors.length > 0) {
    return { profiles: unchangedLocals, errors, skippedIds: [] };
  }

  const incomingProfiles = (parsed as { profiles: unknown[] }).profiles;
  for (const [index, profile] of incomingProfiles.entries()) {
    const validation = validateProductionProfile(profile);
    errors.push(...validation.errors.map((error) => ({
      field: `profiles.${index}.${error.field}`,
      message: error.message,
    })));
  }

  if (errors.length > 0) {
    return { profiles: unchangedLocals, errors, skippedIds: [] };
  }

  const merged = unchangedLocals.map(cloneProfile);
  const skippedIds: string[] = [];
  for (const source of incomingProfiles) {
    const incoming = cloneProfile(source as ProductionProfile);
    const localIndex = merged.findIndex((profile) => profile.id === incoming.id);
    if (localIndex === -1) {
      merged.push(cloneProfile(incoming));
      continue;
    }

    const local = merged[localIndex];
    if (incoming.revision === local.revision) {
      if (stableSerialize(incoming) === stableSerialize(local)) {
        skippedIds.push(incoming.id);
      } else {
        merged.push({
          ...cloneProfile(incoming),
          id: createId('profile'),
          revision: 1,
          name: `${incoming.name} (conflict)`,
        });
      }
      continue;
    }

    if (incoming.revision < local.revision) {
      skippedIds.push(incoming.id);
      continue;
    }

    if (confirmUpdate(cloneProfile(incoming), cloneProfile(local))) {
      merged[localIndex] = cloneProfile(incoming);
    } else {
      skippedIds.push(incoming.id);
    }
  }

  return {
    profiles: merged.map(cloneProfile),
    errors: [],
    skippedIds,
  };
};
