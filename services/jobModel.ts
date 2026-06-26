import {
  DEFAULT_PRINT_SPECIFICATION,
  DEFAULT_PROOF_BRANDING,
  DEFAULT_SETTINGS,
} from '../constants';
import {
  DEFAULT_PLACEMENT,
  placementVariantKey,
  synchronizeJobProductionState,
} from './placement';
import {
  createProductionProfile,
  normalizeProductionProfileRecord,
  snapshotProductionProfile,
  validateProductionProfile,
} from './productionProfiles';
import {
  AppliedProductionProfile,
  ProductionPackageOptions,
  ProductionProfile,
  StudioJob,
} from '../types';

const now = () => Date.now();
const createId = (prefix: string) =>
  `${prefix}_${typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${now()}_${Math.random().toString(36).slice(2, 10)}`}`;

const BUILTIN_STANDARD_DTG_PROFILE: ProductionProfile = {
  ...createProductionProfile('Standard DTG'),
  id: 'profile_standard_dtg_builtin',
  revision: 1,
  createdAt: 0,
  updatedAt: 0,
  archivedAt: null,
};

const packageOptionsFromProfile = (
  profile: ProductionProfile,
): ProductionPackageOptions => ({
  ...structuredClone(profile.defaults.packageOptions),
  includeUnderbase: profile.defaults.includeUnderbase,
});

const migrateAppliedProductionProfile = (
  value: unknown,
  fallback: AppliedProductionProfile,
): AppliedProductionProfile => {
  if (!isRecord(value)) return fallback;
  const snapshot = normalizeProductionProfileRecord(value.snapshot);
  if (
    typeof value.profileId !== 'string'
    || value.profileId.trim().length === 0
    || typeof value.profileRevision !== 'number'
    || !Number.isInteger(value.profileRevision)
    || value.profileRevision < 1
  ) {
    return fallback;
  }

  try {
    if (
      !validateProductionProfile(snapshot).valid
      || !isRecord(snapshot)
      || value.profileId !== snapshot.id
      || value.profileRevision !== snapshot.revision
    ) {
      return fallback;
    }
    return snapshotProductionProfile(snapshot as unknown as ProductionProfile);
  } catch {
    return fallback;
  }
};

export const createStudioJob = (
  name = 'Untitled job',
  profile = createProductionProfile('Standard DTG'),
): StudioJob => {
  const timestamp = now();
  const productionProfile = snapshotProductionProfile(profile);
  const activePlacementKey = placementVariantKey(
    DEFAULT_PLACEMENT.itemType,
    DEFAULT_PLACEMENT.location,
    DEFAULT_PLACEMENT.garmentSize,
  );
  return {
    schemaVersion: 1,
    id: createId('job'),
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
    revision: 1,
    productionProfile,
    metadata: {
      name,
      customerName: '',
      orderNumber: '',
      notes: '',
      tags: [],
    },
    sourceArtwork: null,
    settings: {
      ...DEFAULT_SETTINGS,
      format: profile.defaults.format,
      preserveTransparency: profile.defaults.preserveTransparency,
      colorReplacements: [],
    },
    selectedRecipeId: null,
    analysis: null,
    printSpecification: {
      ...DEFAULT_PRINT_SPECIFICATION,
      method: profile.method,
      targetDpi: profile.thresholds.targetDpi,
    },
    placements: { [activePlacementKey]: { ...DEFAULT_PLACEMENT } },
    activePlacementKey,
    preflightFindings: [],
    acknowledgedPreflightRevision: null,
    proofBranding: { ...DEFAULT_PROOF_BRANDING },
    packageOptions: packageOptionsFromProfile(profile),
    versions: [],
    exports: [],
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const migrateStudioJob = (value: unknown): StudioJob => {
  const source = isRecord(value) ? value : {};
  const metadata = isRecord(source.metadata) ? source.metadata : {};
  const settings = isRecord(source.settings) ? source.settings : {};
  const printSpecification = isRecord(source.printSpecification) ? source.printSpecification : {};
  const proofBranding = isRecord(source.proofBranding) ? source.proofBranding : {};
  const packageOptions = isRecord(source.packageOptions) ? source.packageOptions : {};
  const base = createStudioJob(
    typeof metadata.name === 'string' && metadata.name.trim() ? metadata.name : 'Untitled job',
  );
  const productionProfile = migrateAppliedProductionProfile(
    source.productionProfile,
    snapshotProductionProfile(BUILTIN_STANDARD_DTG_PROFILE),
  );
  const placements = isRecord(source.placements)
    ? source.placements as StudioJob['placements']
    : base.placements;
  const requestedActiveKey = typeof source.activePlacementKey === 'string'
    ? source.activePlacementKey
    : base.activePlacementKey;
  const activePlacementKey = placements[requestedActiveKey]
    ? requestedActiveKey
    : Object.keys(placements)[0] ?? base.activePlacementKey;

  return {
    ...base,
    id: typeof source.id === 'string' ? source.id : base.id,
    createdAt: typeof source.createdAt === 'number' ? source.createdAt : base.createdAt,
    updatedAt: typeof source.updatedAt === 'number' ? source.updatedAt : base.updatedAt,
    archivedAt: typeof source.archivedAt === 'number' ? source.archivedAt : null,
    revision: typeof source.revision === 'number' ? source.revision : 1,
    productionProfile,
    metadata: {
      ...base.metadata,
      ...metadata,
      tags: Array.isArray(metadata.tags) ? metadata.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    },
    sourceArtwork: isRecord(source.sourceArtwork) && source.sourceArtwork.blob instanceof Blob
      ? source.sourceArtwork as unknown as StudioJob['sourceArtwork']
      : null,
    settings: {
      ...base.settings,
      ...settings,
      colorReplacements: Array.isArray(settings.colorReplacements)
        ? settings.colorReplacements as StudioJob['settings']['colorReplacements']
        : [],
    },
    selectedRecipeId: typeof source.selectedRecipeId === 'string'
      ? source.selectedRecipeId as StudioJob['selectedRecipeId']
      : null,
    analysis: isRecord(source.analysis) ? source.analysis as unknown as StudioJob['analysis'] : null,
    printSpecification: { ...base.printSpecification, ...printSpecification },
    placements,
    activePlacementKey,
    preflightFindings: Array.isArray(source.preflightFindings)
      ? source.preflightFindings as StudioJob['preflightFindings']
      : [],
    acknowledgedPreflightRevision: typeof source.acknowledgedPreflightRevision === 'number'
      ? source.acknowledgedPreflightRevision
      : null,
    proofBranding: { ...base.proofBranding, ...proofBranding },
    packageOptions: {
      ...base.packageOptions,
      ...packageOptions,
      selectedMockupIndices: Array.isArray(packageOptions.selectedMockupIndices)
        ? packageOptions.selectedMockupIndices.filter((index): index is number => Number.isInteger(index))
        : base.packageOptions.selectedMockupIndices,
    },
    versions: Array.isArray(source.versions) ? source.versions as StudioJob['versions'] : [],
    exports: Array.isArray(source.exports)
      ? source.exports.filter((entry) => isRecord(entry) && entry.blob instanceof Blob) as unknown as StudioJob['exports']
      : [],
  };
};

export const touchStudioJob = (job: StudioJob): StudioJob => ({
  ...job,
  updatedAt: Math.max(now(), job.updatedAt + 1),
  revision: job.revision + 1,
  acknowledgedPreflightRevision: null,
});

export const applyProductionProfileToJob = (
  job: StudioJob,
  profile: ProductionProfile,
): StudioJob => {
  const clonedJob = structuredClone(job);
  return touchStudioJob({
    ...clonedJob,
    productionProfile: snapshotProductionProfile(profile),
    printSpecification: {
      ...clonedJob.printSpecification,
      method: profile.method,
      targetDpi: profile.thresholds.targetDpi,
    },
    settings: {
      ...clonedJob.settings,
      format: profile.defaults.format,
      preserveTransparency: profile.defaults.preserveTransparency,
    },
    packageOptions: packageOptionsFromProfile(profile),
  });
};

export const applyProductionProfileTransitionToJob = (
  job: StudioJob,
  profile: ProductionProfile,
): StudioJob => {
  const applied = applyProductionProfileToJob(job, profile);
  return synchronizeJobProductionState(
    applied,
    applied.settings,
    profile,
  ).job;
};

export const duplicateStudioJob = (job: StudioJob): StudioJob => {
  const duplicate = migrateStudioJob(job);
  const timestamp = now();
  return {
    ...duplicate,
    id: createId('job'),
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
    revision: 1,
    metadata: {
      ...duplicate.metadata,
      name: `${duplicate.metadata.name} copy`,
    },
    versions: [],
    exports: [],
    acknowledgedPreflightRevision: null,
  };
};
