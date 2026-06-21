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
  StudioJob,
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

export const isProductionProfileImportFileSizeAllowed = (
  sizeBytes: number,
): boolean => sizeBytes <= 5 * 1024 * 1024;

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

const editableProfileContent = (profile: ProductionProfile) => ({
  name: profile.name,
  description: profile.description,
  printerName: profile.printerName,
  method: profile.method,
  thresholds: profile.thresholds,
  printableAreas: profile.printableAreas,
  defaults: profile.defaults,
});

export const productionProfilesHaveSameEditableContent = (
  left: ProductionProfile,
  right: ProductionProfile,
): boolean => stableSerialize(editableProfileContent(left))
  === stableSerialize(editableProfileContent(right));

export const normalizeProfileUnderbase = (
  profile: ProductionProfile,
  includeUnderbase: boolean,
): ProductionProfile => ({
  ...structuredClone(profile),
  defaults: {
    ...structuredClone(profile.defaults),
    includeUnderbase,
    packageOptions: {
      ...structuredClone(profile.defaults.packageOptions),
      includeUnderbase,
    },
  },
});

export type ProfileUpdateStatus =
  | 'current'
  | 'update-available'
  | 'archived'
  | 'missing';

export interface ProfileUpdateState {
  status: ProfileUpdateStatus;
  source: ProductionProfile | null;
}

export const getProfileUpdateState = (
  job: StudioJob,
  profiles: ProductionProfile[],
): ProfileUpdateState => {
  const source = profiles.find(
    (profile) => profile.id === job.productionProfile.profileId,
  ) ?? null;
  if (!source) return { status: 'missing', source: null };
  if (source.archivedAt !== null) return { status: 'archived', source };
  return {
    status: source.revision > job.productionProfile.profileRevision
      ? 'update-available'
      : 'current',
    source,
  };
};

export interface ProfileChangeGroup {
  id: 'printer-method' | 'thresholds' | 'printable-areas' | 'defaults';
  label: string;
  changes: string[];
}

export type SelectedMockupIndicesParseResult =
  | { success: true; value: number[] }
  | { success: false; error: string };

export const parseSelectedMockupIndices = (
  draft: string,
): SelectedMockupIndicesParseResult => {
  const trimmed = draft.trim();
  if (trimmed === '') return { success: true, value: [] };
  const tokens = draft.split(',');
  if (tokens.some((token) => token.trim() === '')) {
    return { success: false, error: 'Finish the index after the comma.' };
  }
  const values = tokens.map((token) => Number(token.trim()));
  if (values.some((value) => !Number.isInteger(value) || value < 0)) {
    return {
      success: false,
      error: 'Mockup indices must be nonnegative integers.',
    };
  }
  return { success: true, value: values };
};

const readableValue = (value: string | number | boolean): string => {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
};

const describeChange = (
  label: string,
  before: string | number | boolean,
  after: string | number | boolean,
): string | null => (
  Object.is(before, after)
    ? null
    : `${label}: ${readableValue(before)} → ${readableValue(after)}`
);

const readablePrintableAreaKey = (key: string): string => {
  const [product, location] = key.split(':');
  const products: Record<string, string> = {
    TSHIRT: 'T-shirt',
    HOODIE: 'Hoodie',
    HAT: 'Hat',
    MUG: 'Mug',
    TOTE: 'Tote',
  };
  const locations: Record<string, string> = {
    front: 'Front',
    back: 'Back',
    'left-chest': 'Left chest',
    sleeve: 'Sleeve',
  };
  return `${products[product] ?? product} / ${locations[location] ?? location}`;
};

export const describeProfileChanges = (
  appliedSnapshot: ProductionProfile,
  source: ProductionProfile,
): ProfileChangeGroup[] => {
  const groups: ProfileChangeGroup[] = [];
  const printerChanges = [
    describeChange('Name', appliedSnapshot.name, source.name),
    describeChange('Description', appliedSnapshot.description, source.description),
    describeChange('Printer', appliedSnapshot.printerName, source.printerName),
    describeChange('Method', appliedSnapshot.method, source.method),
  ].filter((change): change is string => change !== null);
  if (printerChanges.length > 0) {
    groups.push({
      id: 'printer-method',
      label: 'Printer and method',
      changes: printerChanges,
    });
  }

  const thresholdFields = [
    ['targetDpi', 'Target DPI'],
    ['warningDpi', 'Warning DPI'],
    ['criticalDpi', 'Critical DPI'],
    ['significantUpscaleRatio', 'Significant upscale ratio'],
    ['extremeUpscaleRatio', 'Extreme upscale ratio'],
  ] as const;
  const thresholdChanges = thresholdFields
    .map(([field, label]) => describeChange(
      label,
      appliedSnapshot.thresholds[field],
      source.thresholds[field],
    ))
    .filter((change): change is string => change !== null);
  if (thresholdChanges.length > 0) {
    groups.push({
      id: 'thresholds',
      label: 'Thresholds',
      changes: thresholdChanges,
    });
  }

  const printableAreaFields = [
    ['widthInches', 'width inches'],
    ['heightInches', 'height inches'],
    ['xPercent', 'x percent'],
    ['yPercent', 'y percent'],
    ['widthPercent', 'width percent'],
    ['heightPercent', 'height percent'],
  ] as const;
  const changedAreaKeys = Array.from(new Set([
    ...Object.keys(appliedSnapshot.printableAreas),
    ...Object.keys(source.printableAreas),
  ]))
    .sort((left, right) => left.localeCompare(right))
    .filter((key) => stableSerialize(appliedSnapshot.printableAreas[key])
      !== stableSerialize(source.printableAreas[key]));
  if (changedAreaKeys.length > 0) {
    const areaChanges = changedAreaKeys.flatMap((key) => {
      const before = appliedSnapshot.printableAreas[key];
      const after = source.printableAreas[key];
      if (!before) return [`${key} — area added`];
      if (!after) return [`${key} — area removed`];
      return printableAreaFields
        .map(([field, label]) => describeChange(
          `${readablePrintableAreaKey(key)} — ${label}`,
          before[field],
          after[field],
        ))
        .filter((change): change is string => change !== null);
    });
    groups.push({
      id: 'printable-areas',
      label: 'Printable areas',
      changes: [
        `${changedAreaKeys.length} printable area${changedAreaKeys.length === 1 ? '' : 's'} changed: ${changedAreaKeys.join(', ')}`,
        ...areaChanges,
      ],
    });
  }

  const appliedPackage = appliedSnapshot.defaults.packageOptions;
  const sourcePackage = source.defaults.packageOptions;
  const defaultChanges = [
    describeChange('Format', appliedSnapshot.defaults.format, source.defaults.format),
    describeChange(
      'Preserve transparency',
      appliedSnapshot.defaults.preserveTransparency,
      source.defaults.preserveTransparency,
    ),
    describeChange(
      'Include underbase',
      appliedSnapshot.defaults.includeUnderbase,
      source.defaults.includeUnderbase,
    ),
    describeChange(
      'Naming pattern',
      appliedPackage.namingPattern,
      sourcePackage.namingPattern,
    ),
    describeChange(
      'Include print master',
      appliedPackage.includePrintMaster,
      sourcePackage.includePrintMaster,
    ),
    describeChange(
      'Include production PDF',
      appliedPackage.includeProductionPdf,
      sourcePackage.includeProductionPdf,
    ),
    describeChange(
      'Include mockups',
      appliedPackage.includeMockups,
      sourcePackage.includeMockups,
    ),
    describeChange(
      'Selected mockup indices',
      appliedPackage.selectedMockupIndices.join(', '),
      sourcePackage.selectedMockupIndices.join(', '),
    ),
    describeChange(
      'Package underbase',
      appliedPackage.includeUnderbase,
      sourcePackage.includeUnderbase,
    ),
    describeChange(
      'Include summary',
      appliedPackage.includeSummary,
      sourcePackage.includeSummary,
    ),
    describeChange(
      'Include manifest',
      appliedPackage.includeManifest,
      sourcePackage.includeManifest,
    ),
  ].filter((change): change is string => change !== null);
  if (defaultChanges.length > 0) {
    groups.push({
      id: 'defaults',
      label: 'Output and package defaults',
      changes: defaultChanges,
    });
  }

  return groups;
};

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
      if (
        typeof defaults.includeUnderbase === 'boolean'
        && typeof packageOptions.includeUnderbase === 'boolean'
        && defaults.includeUnderbase !== packageOptions.includeUnderbase
      ) {
        const message = 'Underbase defaults must match.';
        addError('defaults.includeUnderbase', message);
        addError('defaults.packageOptions.includeUnderbase', message);
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
  } else if (parsed.profiles.length > 500) {
    errors.push({
      field: 'profiles',
      message: 'Portable profile files may contain at most 500 profiles.',
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
        const conflict = duplicateProductionProfile(incoming);
        conflict.name = `${incoming.name} (conflict)`;
        merged.push(conflict);
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
