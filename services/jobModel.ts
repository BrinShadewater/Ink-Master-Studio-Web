import {
  DEFAULT_PACKAGE_OPTIONS,
  DEFAULT_PRINT_SPECIFICATION,
  DEFAULT_PROOF_BRANDING,
  DEFAULT_SETTINGS,
} from '../constants';
import { DEFAULT_PLACEMENT, placementVariantKey } from './placement';
import { StudioJob } from '../types';

const now = () => Date.now();
const createId = (prefix: string) =>
  `${prefix}_${typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${now()}_${Math.random().toString(36).slice(2, 10)}`}`;

export const createStudioJob = (name = 'Untitled job'): StudioJob => {
  const timestamp = now();
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
    metadata: {
      name,
      customerName: '',
      orderNumber: '',
      notes: '',
      tags: [],
    },
    sourceArtwork: null,
    settings: { ...DEFAULT_SETTINGS, colorReplacements: [] },
    selectedRecipeId: null,
    analysis: null,
    printSpecification: { ...DEFAULT_PRINT_SPECIFICATION },
    placements: { [activePlacementKey]: { ...DEFAULT_PLACEMENT } },
    activePlacementKey,
    preflightFindings: [],
    acknowledgedPreflightRevision: null,
    proofBranding: { ...DEFAULT_PROOF_BRANDING },
    packageOptions: {
      ...DEFAULT_PACKAGE_OPTIONS,
      selectedMockupIndices: [...DEFAULT_PACKAGE_OPTIONS.selectedMockupIndices],
    },
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
  updatedAt: now(),
  revision: job.revision + 1,
  acknowledgedPreflightRevision: null,
});

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
