import {
  ProductionProfile,
  ProductionProfileStore,
} from '../types';
import {
  createProductionProfile,
  normalizeProductionProfileRecord,
  validateProductionProfile,
} from './productionProfiles';

const PROFILE_STORAGE_KEY = 'inkmaster_production_profiles_v1';

const cloneProfile = (profile: ProductionProfile): ProductionProfile =>
  structuredClone(profile);

const createDefaultStore = (
  archivedProfiles: ProductionProfile[] = [],
): ProductionProfileStore => {
  const defaultProfile = createProductionProfile('Standard DTG');
  return {
    schemaVersion: 1,
    defaultProfileId: defaultProfile.id,
    profiles: [
      ...archivedProfiles.map(cloneProfile),
      defaultProfile,
    ],
  };
};

const selectLatestActiveProfile = (
  profiles: ProductionProfile[],
): ProductionProfile | undefined =>
  profiles
    .filter((profile) => profile.archivedAt === null)
    .sort((left, right) =>
      right.updatedAt - left.updatedAt || left.id.localeCompare(right.id))[0];

export type ImportedProfileStoreProposal =
  | { status: 'ready'; store: ProductionProfileStore }
  | {
      status: 'replacement-required';
      store: ProductionProfileStore;
      replacement: ProductionProfile;
    }
  | { status: 'error'; message: string };

export const proposeImportedProfileStore = (
  currentStore: ProductionProfileStore,
  importedProfiles: ProductionProfile[],
): ImportedProfileStoreProposal => {
  const profiles = importedProfiles.map(cloneProfile);
  const proposedStore: ProductionProfileStore = {
    schemaVersion: 1,
    defaultProfileId: currentStore.defaultProfileId,
    profiles,
  };
  const currentDefault = profiles.find(
    (profile) =>
      profile.id === currentStore.defaultProfileId
      && profile.archivedAt === null,
  );
  if (currentDefault) return { status: 'ready', store: proposedStore };
  const replacement = selectLatestActiveProfile(profiles);
  if (!replacement) {
    return {
      status: 'error',
      message: 'Imported profiles contain no active replacement for the current default.',
    };
  }
  return {
    status: 'replacement-required',
    store: proposedStore,
    replacement: cloneProfile(replacement),
  };
};

export const migrateProfileStore = (
  raw: string | null,
): ProductionProfileStore => {
  try {
    if (raw === null) {
      return createDefaultStore();
    }

    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object'
      || parsed === null
      || Array.isArray(parsed)
      || (parsed as { schemaVersion?: unknown }).schemaVersion !== 1
      || !Array.isArray((parsed as { profiles?: unknown }).profiles)
    ) {
      return createDefaultStore();
    }

    const source = parsed as {
      defaultProfileId?: unknown;
      profiles: unknown[];
    };
    const validProfiles = source.profiles
      .map(normalizeProductionProfileRecord)
      .filter((profile): profile is ProductionProfile =>
        validateProductionProfile(profile).valid)
      .map(cloneProfile);
    const requestedDefault = typeof source.defaultProfileId === 'string'
      ? validProfiles.find((profile) =>
          profile.id === source.defaultProfileId && profile.archivedAt === null)
      : undefined;
    const selectedDefault = requestedDefault
      ?? selectLatestActiveProfile(validProfiles);

    if (!selectedDefault) {
      return createDefaultStore(
        validProfiles.filter((profile) => profile.archivedAt !== null),
      );
    }

    return {
      schemaVersion: 1,
      defaultProfileId: selectedDefault.id,
      profiles: validProfiles.map(cloneProfile),
    };
  } catch {
    return createDefaultStore();
  }
};

export const loadProfileStore = (): ProductionProfileStore => {
  try {
    const raw = typeof localStorage === 'undefined'
      ? null
      : localStorage.getItem(PROFILE_STORAGE_KEY);
    return migrateProfileStore(raw);
  } catch {
    return migrateProfileStore(null);
  }
};

export const saveProfileStore = (store: ProductionProfileStore): void => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(store));
  }
};

export const getDefaultProfile = (
  store: ProductionProfileStore,
): ProductionProfile => {
  const profile = store.profiles.find((candidate) =>
    candidate.id === store.defaultProfileId && candidate.archivedAt === null);
  if (!profile) {
    throw new Error('Production profile store has no active default profile.');
  }
  return cloneProfile(profile);
};

const cloneStore = (
  store: ProductionProfileStore,
): ProductionProfileStore => ({
  schemaVersion: 1,
  defaultProfileId: store.defaultProfileId,
  profiles: store.profiles.map(cloneProfile),
});

export const addProfileToStore = (
  store: ProductionProfileStore,
  profile: ProductionProfile,
): ProductionProfileStore => {
  if (store.profiles.some((candidate) => candidate.id === profile.id)) {
    throw new Error(`Production profile "${profile.id}" already exists.`);
  }
  const cloned = cloneStore(store);
  return {
    ...cloned,
    profiles: [...cloned.profiles, cloneProfile(profile)],
  };
};

export const replaceProfileInStore = (
  store: ProductionProfileStore,
  profile: ProductionProfile,
): ProductionProfileStore => {
  if (!store.profiles.some((candidate) => candidate.id === profile.id)) {
    throw new Error(`Production profile "${profile.id}" was not found.`);
  }
  const cloned = cloneStore(store);
  return {
    ...cloned,
    profiles: cloned.profiles.map((candidate) =>
      candidate.id === profile.id ? cloneProfile(profile) : candidate),
  };
};

export const setDefaultProfile = (
  store: ProductionProfileStore,
  profileId: string,
): ProductionProfileStore => {
  const profile = store.profiles.find((candidate) => candidate.id === profileId);
  if (!profile) {
    throw new Error(`Production profile "${profileId}" was not found.`);
  }
  if (profile.archivedAt !== null) {
    throw new Error('Default production profile must be active.');
  }
  return {
    ...cloneStore(store),
    defaultProfileId: profileId,
  };
};

export const archiveProfile = (
  store: ProductionProfileStore,
  profileId: string,
  replacementDefaultId?: string,
): ProductionProfileStore => {
  const profile = store.profiles.find((candidate) => candidate.id === profileId);
  if (!profile) {
    throw new Error(`Production profile "${profileId}" was not found.`);
  }
  if (profile.archivedAt !== null) {
    throw new Error(`Production profile "${profileId}" is already archived.`);
  }

  const isDefault = store.defaultProfileId === profileId;
  let replacement: ProductionProfile | undefined;
  if (isDefault && !replacementDefaultId) {
    throw new Error('Archiving the default profile requires a replacement.');
  }
  if (replacementDefaultId) {
    if (replacementDefaultId === profileId) {
      throw new Error('Replacement profile must differ from the archived profile.');
    }
    replacement = store.profiles.find(
      (candidate) => candidate.id === replacementDefaultId,
    );
    if (!replacement) {
      throw new Error(`Replacement profile "${replacementDefaultId}" was not found.`);
    }
    if (replacement.archivedAt !== null) {
      throw new Error('Replacement profile must be active.');
    }
  }

  const timestamp = Math.max(Date.now(), profile.updatedAt);
  return {
    schemaVersion: 1,
    defaultProfileId: isDefault && replacement
      ? replacement.id
      : store.defaultProfileId,
    profiles: store.profiles.map((candidate) => {
      const cloned = cloneProfile(candidate);
      return candidate.id === profileId
        ? {
            ...cloned,
            updatedAt: timestamp,
            archivedAt: timestamp,
          }
        : cloned;
    }),
  };
};
