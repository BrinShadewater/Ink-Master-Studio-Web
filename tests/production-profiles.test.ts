import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createProductionProfile,
  describeProfileChanges,
  duplicateProductionProfile,
  exportProductionProfiles,
  getProfileUpdateState,
  importProductionProfiles,
  isProductionProfileImportFileSizeAllowed,
  normalizeProfileUnderbase,
  parseSelectedMockupIndices,
  printableAreaKey,
  productionProfilesHaveSameEditableContent,
  reviseProductionProfile,
  snapshotProductionProfile,
  validateProductionProfile,
} from '../services/productionProfiles';
import { createStudioJob } from '../services/jobModel';
import {
  addProfileToStore,
  archiveProfile,
  getDefaultProfile,
  loadProfileStore,
  migrateProfileStore,
  proposeImportedProfileStore,
  replaceProfileInStore,
  saveProfileStore,
  setDefaultProfile,
} from '../services/profileStorage';
import { ItemType, OutputFormat } from '../types';

const profileFixture = (
  id: string,
  name: string,
  updatedAt: number,
  revision = 1,
) => {
  const profile = createProductionProfile(name);
  return {
    ...profile,
    id,
    revision,
    createdAt: Math.min(profile.createdAt, updatedAt),
    updatedAt,
  };
};

test('creates the standard DTG production profile', () => {
  const profile = createProductionProfile('Standard DTG');
  const tshirtFront = profile.printableAreas[printableAreaKey(ItemType.TSHIRT, 'front')];

  assert.equal(profile.schemaVersion, 1);
  assert.equal(profile.revision, 1);
  assert.equal(profile.method, 'DTG');
  assert.deepEqual(profile.thresholds, {
    targetDpi: 300,
    warningDpi: 200,
    criticalDpi: 150,
    significantUpscaleRatio: 1.5,
    extremeUpscaleRatio: 3,
  });
  assert.deepEqual(tshirtFront, {
    widthInches: 15,
    heightInches: 18,
    xPercent: 25,
    yPercent: 14,
    widthPercent: 50,
    heightPercent: 62,
  });
  assert.equal(profile.defaults.format, OutputFormat.PNG);
});

test('reports invalid threshold ordering and printable dimensions', () => {
  const profile = createProductionProfile();
  profile.thresholds.warningDpi = 100;
  profile.thresholds.criticalDpi = 150;
  profile.printableAreas[printableAreaKey(ItemType.TSHIRT, 'front')].widthInches = 0;

  const result = validateProductionProfile(profile);
  const fields = result.errors.map((error) => error.field);

  assert.equal(result.valid, false);
  assert.ok(fields.includes('thresholds.criticalDpi'));
  assert.ok(fields.some((field) => field.endsWith('.widthInches')));
});

test('returns field errors instead of throwing for malformed persisted data', () => {
  const malformedProfiles: unknown[] = [
    {},
    { thresholds: null, printableAreas: null },
    {
      thresholds: {},
      printableAreas: {
        'TSHIRT:front': null,
      },
    },
  ];

  for (const malformed of malformedProfiles) {
    let result: ReturnType<typeof validateProductionProfile> | undefined;
    assert.doesNotThrow(() => {
      result = validateProductionProfile(malformed);
    });
    assert.equal(result?.valid, false);
    assert.ok(result?.errors.length);
  }

  const missing = validateProductionProfile({});
  const missingFields = missing.errors.map((error) => error.field);
  assert.ok(missingFields.includes('thresholds'));
  assert.ok(missingFields.includes('printableAreas'));

  const malformedArea = validateProductionProfile({
    thresholds: {
      targetDpi: 300,
      warningDpi: 200,
      criticalDpi: 150,
      significantUpscaleRatio: 1.5,
      extremeUpscaleRatio: 3,
    },
    printableAreas: {
      'TSHIRT:front': null,
    },
  });
  assert.ok(malformedArea.errors.some((error) => error.field === 'printableAreas.TSHIRT:front'));
});

test('rejects non-finite threshold and printable area values', () => {
  const profile = createProductionProfile();
  profile.thresholds.targetDpi = Number.NaN;
  profile.thresholds.extremeUpscaleRatio = Number.POSITIVE_INFINITY;
  profile.printableAreas[printableAreaKey(ItemType.TSHIRT, 'front')].widthInches = Number.NEGATIVE_INFINITY;
  profile.printableAreas[printableAreaKey(ItemType.HOODIE, 'back')].xPercent = Number.NaN;

  const fields = validateProductionProfile(profile).errors.map((error) => error.field);

  assert.ok(fields.includes('thresholds.targetDpi'));
  assert.ok(fields.includes('thresholds.extremeUpscaleRatio'));
  assert.ok(fields.includes('printableAreas.TSHIRT:front.widthInches'));
  assert.ok(fields.includes('printableAreas.HOODIE:back.xPercent'));
});

test('rejects missing or invalid production profile metadata', () => {
  const invalid = {
    ...createProductionProfile(),
    schemaVersion: 2,
    id: '',
    revision: 0,
    name: '',
    description: null,
    printerName: 42,
    method: 'SCREEN_PRINT',
    createdAt: Number.NaN,
    updatedAt: -1,
    archivedAt: Number.POSITIVE_INFINITY,
    printableAreas: {},
  };

  const result = validateProductionProfile(invalid);
  const fields = result.errors.map((error) => error.field);

  assert.equal(result.valid, false);
  assert.ok(fields.includes('schemaVersion'));
  assert.ok(fields.includes('id'));
  assert.ok(fields.includes('revision'));
  assert.ok(fields.includes('name'));
  assert.ok(fields.includes('description'));
  assert.ok(fields.includes('printerName'));
  assert.ok(fields.includes('method'));
  assert.ok(fields.includes('createdAt'));
  assert.ok(fields.includes('updatedAt'));
  assert.ok(fields.includes('archivedAt'));
  assert.ok(fields.includes('printableAreas'));
});

test('rejects unsupported and missing printable area keys', () => {
  const source = createProductionProfile();
  const validArea = structuredClone(
    source.printableAreas[printableAreaKey(ItemType.TSHIRT, 'front')],
  );
  const unsupported = {
    ...source,
    printableAreas: {
      nonsense: validArea,
    },
  };

  const unsupportedFields = validateProductionProfile(unsupported).errors.map(
    (error) => error.field,
  );
  assert.ok(unsupportedFields.includes('printableAreas.nonsense'));

  const missing = createProductionProfile();
  const missingKey = printableAreaKey(ItemType.HAT, 'sleeve');
  delete missing.printableAreas[missingKey];

  const missingFields = validateProductionProfile(missing).errors.map(
    (error) => error.field,
  );
  assert.ok(missingFields.includes(`printableAreas.${missingKey}`));
});

test('rejects malformed production defaults and package options', () => {
  const invalid = {
    ...createProductionProfile(),
    defaults: {
      format: 'TIFF',
      preserveTransparency: 'yes',
      includeUnderbase: null,
      packageOptions: {
        namingPattern: 42,
        includePrintMaster: 'yes',
        includeProductionPdf: null,
        includeMockups: 1,
        selectedMockupIndices: [0, -1, 1.5, Number.NaN],
        includeUnderbase: 'no',
        includeSummary: undefined,
        includeManifest: {},
      },
    },
  };

  const result = validateProductionProfile(invalid);
  const fields = result.errors.map((error) => error.field);

  assert.equal(result.valid, false);
  assert.ok(fields.includes('defaults.format'));
  assert.ok(fields.includes('defaults.preserveTransparency'));
  assert.ok(fields.includes('defaults.includeUnderbase'));
  assert.ok(fields.includes('defaults.packageOptions.namingPattern'));
  assert.ok(fields.includes('defaults.packageOptions.includePrintMaster'));
  assert.ok(fields.includes('defaults.packageOptions.includeProductionPdf'));
  assert.ok(fields.includes('defaults.packageOptions.includeMockups'));
  assert.ok(fields.includes('defaults.packageOptions.selectedMockupIndices'));
  assert.ok(fields.includes('defaults.packageOptions.includeUnderbase'));
  assert.ok(fields.includes('defaults.packageOptions.includeSummary'));
  assert.ok(fields.includes('defaults.packageOptions.includeManifest'));
});

test('rejects missing defaults and package option containers without throwing', () => {
  const missingDefaults = {
    ...createProductionProfile(),
    defaults: null,
  };
  const missingPackageOptions = {
    ...createProductionProfile(),
    defaults: {
      format: OutputFormat.PNG,
      preserveTransparency: true,
      includeUnderbase: false,
      packageOptions: null,
    },
  };

  assert.doesNotThrow(() => validateProductionProfile(missingDefaults));
  assert.doesNotThrow(() => validateProductionProfile(missingPackageOptions));
  assert.ok(
    validateProductionProfile(missingDefaults).errors.some(
      (error) => error.field === 'defaults',
    ),
  );
  assert.ok(
    validateProductionProfile(missingPackageOptions).errors.some(
      (error) => error.field === 'defaults.packageOptions',
    ),
  );
});

test('wraps an immutable production profile snapshot with its applied revision', () => {
  const profile = createProductionProfile('Applied profile');
  const applied = snapshotProductionProfile(profile);
  const frontKey = printableAreaKey(ItemType.TSHIRT, 'front');

  assert.equal(applied.profileId, profile.id);
  assert.equal(applied.profileRevision, profile.revision);
  assert.deepEqual(applied.snapshot, profile);

  applied.snapshot.thresholds.targetDpi = 72;
  applied.snapshot.printableAreas[frontKey].widthInches = 2;
  applied.snapshot.defaults.packageOptions.selectedMockupIndices.push(99);

  assert.equal(profile.thresholds.targetDpi, 300);
  assert.equal(profile.printableAreas[frontKey].widthInches, 15);
  assert.deepEqual(profile.defaults.packageOptions.selectedMockupIndices, [1, 2, 6]);
});

test('duplicates and revises profiles without mutating the source', () => {
  const source = createProductionProfile('Epson F2270');
  const sourceSnapshot = structuredClone(source);
  const frontKey = printableAreaKey(ItemType.TSHIRT, 'front');

  const duplicate = duplicateProductionProfile(source);
  const revision = reviseProductionProfile(source, {
    description: 'Updated daily production profile',
  });

  assert.notEqual(duplicate.id, source.id);
  assert.equal(duplicate.name, 'Epson F2270 copy');
  assert.equal(duplicate.revision, 1);
  assert.equal(revision.id, source.id);
  assert.equal(revision.revision, 2);
  assert.equal(revision.description, 'Updated daily production profile');

  duplicate.thresholds.targetDpi = 72;
  duplicate.printableAreas[frontKey].heightInches = 2;
  duplicate.defaults.packageOptions.selectedMockupIndices.push(98);
  revision.thresholds.warningDpi = 50;
  revision.printableAreas[frontKey].widthPercent = 5;
  revision.defaults.packageOptions.selectedMockupIndices.push(97);

  assert.deepEqual(source, sourceSnapshot);
});

test('reports current, update-available, archived, and missing profile sources immutably', () => {
  const applied = profileFixture('applied-profile', 'Applied', 100, 3);
  const job = createStudioJob('Profile update states', applied);
  const current = { ...structuredClone(applied), updatedAt: 101 };
  const older = { ...structuredClone(applied), revision: 2, updatedAt: 99 };
  const newer = { ...structuredClone(applied), revision: 4, updatedAt: 102 };
  const archived = {
    ...structuredClone(newer),
    archivedAt: 103,
  };
  const snapshots = [job, current, older, newer, archived].map((value) =>
    structuredClone(value));

  assert.deepEqual(getProfileUpdateState(job, [current]), {
    status: 'current',
    source: current,
  });
  assert.deepEqual(getProfileUpdateState(job, [older]), {
    status: 'current',
    source: older,
  });
  assert.deepEqual(getProfileUpdateState(job, [newer]), {
    status: 'update-available',
    source: newer,
  });
  assert.deepEqual(getProfileUpdateState(job, [archived]), {
    status: 'archived',
    source: archived,
  });
  assert.deepEqual(getProfileUpdateState(job, []), {
    status: 'missing',
    source: null,
  });
  assert.deepEqual(
    [job, current, older, newer, archived],
    snapshots,
  );
});

test('describes profile changes in deterministic human-readable groups', () => {
  const applied = profileFixture('change-profile', 'Old DTG', 100, 2);
  applied.description = 'Original description';
  applied.printerName = 'Epson';
  const source = structuredClone(applied);
  source.revision = 3;
  source.name = 'Updated DTF';
  source.description = 'Updated description';
  source.printerName = 'Brother';
  source.method = 'DTF';
  source.thresholds.targetDpi = 360;
  source.thresholds.warningDpi = 240;
  source.printableAreas[printableAreaKey(ItemType.TSHIRT, 'front')].widthInches = 14;
  source.printableAreas[printableAreaKey(ItemType.HOODIE, 'back')].heightPercent = 48;
  source.defaults.format = OutputFormat.PDF;
  source.defaults.preserveTransparency = false;
  source.defaults.packageOptions.namingPattern = '{job}_updated';
  source.defaults.packageOptions.selectedMockupIndices = [6, 2];
  const appliedSnapshot = structuredClone(applied);
  const sourceSnapshot = structuredClone(source);

  assert.deepEqual(describeProfileChanges(applied, source), [
    {
      id: 'printer-method',
      label: 'Printer and method',
      changes: [
        'Name: Old DTG → Updated DTF',
        'Description: Original description → Updated description',
        'Printer: Epson → Brother',
        'Method: DTG → DTF',
      ],
    },
    {
      id: 'thresholds',
      label: 'Thresholds',
      changes: [
        'Target DPI: 300 → 360',
        'Warning DPI: 200 → 240',
      ],
    },
    {
      id: 'printable-areas',
      label: 'Printable areas',
      changes: [
        '2 printable areas changed: HOODIE:back, TSHIRT:front',
        'Hoodie / Back — height percent: 52 → 48',
        'T-shirt / Front — width inches: 15 → 14',
      ],
    },
    {
      id: 'defaults',
      label: 'Output and package defaults',
      changes: [
        'Format: PNG → PDF',
        'Preserve transparency: Yes → No',
        'Naming pattern: {job}_{customer}_{garment}_{placement}_v{version} → {job}_updated',
        'Selected mockup indices: 1, 2, 6 → 6, 2',
      ],
    },
  ]);
  assert.deepEqual(applied, appliedSnapshot);
  assert.deepEqual(source, sourceSnapshot);
});

test('parses complete selected mockup index drafts without coercion', () => {
  assert.deepEqual(parseSelectedMockupIndices('1, 2'), {
    success: true,
    value: [1, 2],
  });
  assert.deepEqual(parseSelectedMockupIndices(''), {
    success: true,
    value: [],
  });
});

test('rejects incomplete and invalid selected mockup index drafts', () => {
  for (const [draft, expected] of [
    ['1,', 'Finish the index after the comma.'],
    ['-1', 'Mockup indices must be nonnegative integers.'],
    ['1.5', 'Mockup indices must be nonnegative integers.'],
    ['one', 'Mockup indices must be nonnegative integers.'],
  ] as const) {
    assert.deepEqual(parseSelectedMockupIndices(draft), {
      success: false,
      error: expected,
    });
  }
});

test('compares only editable production profile content deeply', () => {
  const original = profileFixture('editable-equality', 'Editable equality', 100, 2);
  const metadataOnly = {
    ...structuredClone(original),
    revision: 9,
    createdAt: 1,
    updatedAt: 999,
  };
  const nestedChange = structuredClone(metadataOnly);
  nestedChange.defaults.packageOptions.includeSummary = false;

  assert.equal(
    productionProfilesHaveSameEditableContent(original, metadataOnly),
    true,
  );
  assert.equal(
    productionProfilesHaveSameEditableContent(original, nestedChange),
    false,
  );
});

test('normalizes both underbase defaults together without mutation', () => {
  const profile = createProductionProfile('Underbase');
  const snapshot = structuredClone(profile);
  const normalized = normalizeProfileUnderbase(profile, true);

  assert.equal(normalized.defaults.includeUnderbase, true);
  assert.equal(normalized.defaults.packageOptions.includeUnderbase, true);
  assert.deepEqual(profile, snapshot);
});

test('rejects profiles whose underbase defaults disagree on both fields', () => {
  const profile = createProductionProfile('Mismatched underbase');
  profile.defaults.includeUnderbase = true;
  profile.defaults.packageOptions.includeUnderbase = false;

  const fields = validateProductionProfile(profile).errors.map((error) => error.field);

  assert.ok(fields.includes('defaults.includeUnderbase'));
  assert.ok(fields.includes('defaults.packageOptions.includeUnderbase'));
});

test('migrates empty storage to exactly one valid default Standard DTG profile', () => {
  const store = migrateProfileStore(null);

  assert.equal(store.schemaVersion, 1);
  assert.equal(store.profiles.length, 1);
  assert.equal(store.profiles[0].name, 'Standard DTG');
  assert.equal(store.profiles[0].method, 'DTG');
  assert.equal(store.defaultProfileId, store.profiles[0].id);
  assert.equal(validateProductionProfile(store.profiles[0]).valid, true);
});

test('repairs malformed JSON and structurally invalid stores deterministically', () => {
  const malformed = migrateProfileStore('{not-json');
  const invalid = migrateProfileStore(JSON.stringify({
    schemaVersion: 2,
    defaultProfileId: 42,
    profiles: {},
  }));

  for (const store of [malformed, invalid]) {
    assert.equal(store.schemaVersion, 1);
    assert.equal(store.profiles.length, 1);
    assert.equal(store.profiles[0].name, 'Standard DTG');
    assert.equal(store.defaultProfileId, store.profiles[0].id);
  }
});

test('repairs invalid defaults using the latest active valid profile with an id tie-break', () => {
  const older = profileFixture('older', 'Older', 100);
  const tiedZ = profileFixture('z-profile', 'Z profile', 200);
  const tiedA = profileFixture('a-profile', 'A profile', 200);
  const archived = {
    ...profileFixture('archived', 'Archived', 300),
    archivedAt: 301,
  };

  for (const defaultProfileId of ['missing', archived.id]) {
    const migrated = migrateProfileStore(JSON.stringify({
      schemaVersion: 1,
      defaultProfileId,
      profiles: [older, tiedZ, archived, tiedA],
    }));

    assert.equal(migrated.defaultProfileId, tiedA.id);
    assert.deepEqual(
      migrated.profiles.map((profile) => profile.id),
      [older.id, tiedZ.id, archived.id, tiedA.id],
    );
  }
});

test('preserves archived profiles and appends Standard DTG when no active profile remains', () => {
  const archived = {
    ...profileFixture('archived', 'Archived', 300),
    archivedAt: 301,
  };
  const migrated = migrateProfileStore(JSON.stringify({
    schemaVersion: 1,
    defaultProfileId: archived.id,
    profiles: [archived],
  }));

  assert.equal(migrated.profiles.length, 2);
  assert.deepEqual(migrated.profiles[0], archived);
  assert.equal(migrated.profiles[1].name, 'Standard DTG');
  assert.equal(migrated.defaultProfileId, migrated.profiles[1].id);
});

test('migrates legacy stored underbase disagreement without losing profile identity', () => {
  const legacy = profileFixture('legacy-underbase-store', 'Legacy store', 300, 7);
  legacy.defaults.includeUnderbase = true;
  legacy.defaults.packageOptions.includeUnderbase = false;
  const snapshot = structuredClone(legacy);

  const migrated = migrateProfileStore(JSON.stringify({
    schemaVersion: 1,
    defaultProfileId: legacy.id,
    profiles: [legacy],
  }));

  assert.equal(migrated.profiles.length, 1);
  assert.equal(migrated.profiles[0].id, legacy.id);
  assert.equal(migrated.profiles[0].revision, 7);
  assert.equal(migrated.profiles[0].defaults.includeUnderbase, true);
  assert.equal(migrated.profiles[0].defaults.packageOptions.includeUnderbase, true);
  assert.deepEqual(legacy, snapshot);
});

test('loads and saves migrated profile stores only through available localStorage', () => {
  const originalLocalStorage = globalThis.localStorage;
  const values = new Map<string, string>();
  const fakeStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  } as Storage;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: fakeStorage,
  });

  try {
    const initial = loadProfileStore();
    saveProfileStore(initial);
    const saved = values.get('inkmaster_production_profiles_v1');
    assert.ok(saved);
    assert.deepEqual(loadProfileStore(), initial);
    assert.deepEqual(getDefaultProfile(initial), initial.profiles[0]);
  } finally {
    if (originalLocalStorage === undefined) {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    } else {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: originalLocalStorage,
      });
    }
  }
});

test('repairs profile storage when localStorage access or reads throw', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage access blocked');
      },
    });
    const blockedAccess = loadProfileStore();
    assert.equal(blockedAccess.profiles.length, 1);
    assert.equal(blockedAccess.profiles[0].name, 'Standard DTG');
    assert.equal(blockedAccess.defaultProfileId, blockedAccess.profiles[0].id);
    assert.equal(validateProductionProfile(blockedAccess.profiles[0]).valid, true);

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem() {
          throw new Error('storage read blocked');
        },
      },
    });
    const blockedRead = loadProfileStore();
    assert.equal(blockedRead.profiles.length, 1);
    assert.equal(blockedRead.profiles[0].name, 'Standard DTG');
    assert.equal(blockedRead.defaultProfileId, blockedRead.profiles[0].id);
    assert.equal(validateProductionProfile(blockedRead.profiles[0]).valid, true);
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'localStorage', originalDescriptor);
    } else {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    }
  }
});

test('lets profile storage save failures propagate', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      setItem() {
        throw new Error('storage write blocked');
      },
    },
  });

  try {
    assert.throws(
      () => saveProfileStore(migrateProfileStore(null)),
      /storage write blocked/,
    );
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'localStorage', originalDescriptor);
    } else {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    }
  }
});

test('returns an isolated clone of the active default profile', () => {
  const profile = profileFixture('default-clone', 'Default clone', 100);
  const store = {
    schemaVersion: 1 as const,
    defaultProfileId: profile.id,
    profiles: [profile],
  };
  const returned = getDefaultProfile(store);
  const frontKey = printableAreaKey(ItemType.TSHIRT, 'front');

  returned.thresholds.targetDpi = 72;
  returned.printableAreas[frontKey].widthInches = 1;
  returned.defaults.packageOptions.selectedMockupIndices.push(99);

  assert.equal(profile.thresholds.targetDpi, 300);
  assert.equal(profile.printableAreas[frontKey].widthInches, 15);
  assert.deepEqual(profile.defaults.packageOptions.selectedMockupIndices, [1, 2, 6]);
});

test('archives non-default profiles immutably while keeping the default', () => {
  const defaultProfile = profileFixture('default', 'Default', 100);
  const other = profileFixture('other', 'Other', 101);
  const store = {
    schemaVersion: 1 as const,
    defaultProfileId: defaultProfile.id,
    profiles: [defaultProfile, other],
  };
  const snapshot = structuredClone(store);
  const archived = archiveProfile(store, other.id);

  assert.equal(archived.defaultProfileId, defaultProfile.id);
  assert.equal(archived.profiles[1].archivedAt, archived.profiles[1].updatedAt);
  assert.ok((archived.profiles[1].archivedAt ?? 0) >= other.updatedAt);
  assert.deepEqual(store, snapshot);
  assert.notEqual(archived.profiles[0], store.profiles[0]);
});

test('adds and replaces current profile records immutably', () => {
  const original = profileFixture('original', 'Original', 100, 2);
  const added = profileFixture('added', 'Added', 101);
  const revised = { ...structuredClone(original), name: 'Revised', revision: 3 };
  const store = {
    schemaVersion: 1 as const,
    defaultProfileId: original.id,
    profiles: [original],
  };
  const snapshot = structuredClone(store);

  const withAdded = addProfileToStore(store, added);
  const withRevision = replaceProfileInStore(withAdded, revised);

  assert.deepEqual(store, snapshot);
  assert.deepEqual(withAdded.profiles.map((profile) => profile.id), [
    original.id,
    added.id,
  ]);
  assert.equal(withRevision.profiles.length, 2);
  assert.equal(withRevision.profiles[0].name, 'Revised');
  assert.equal(withRevision.profiles[0].revision, 3);
  assert.notEqual(withRevision.profiles[0], revised);
  assert.throws(() => addProfileToStore(store, original), /already exists/i);
  assert.throws(
    () => replaceProfileInStore(store, added),
    /was not found/i,
  );
});

test('sets only active profiles as the immutable default', () => {
  const active = profileFixture('active-default', 'Active', 100);
  const other = profileFixture('other-default', 'Other', 101);
  const archived = {
    ...profileFixture('archived-default', 'Archived', 102),
    archivedAt: 103,
  };
  const store = {
    schemaVersion: 1 as const,
    defaultProfileId: active.id,
    profiles: [active, other, archived],
  };
  const snapshot = structuredClone(store);

  const updated = setDefaultProfile(store, other.id);

  assert.equal(updated.defaultProfileId, other.id);
  assert.deepEqual(store, snapshot);
  assert.notEqual(updated.profiles[0], store.profiles[0]);
  assert.throws(() => setDefaultProfile(store, 'missing'), /was not found/i);
  assert.throws(() => setDefaultProfile(store, archived.id), /must be active/i);
});

test('proposes a deterministic replacement when import archives the current default', () => {
  const currentDefault = profileFixture('current-default', 'Current', 100);
  const newestZ = profileFixture('z-newest', 'Newest Z', 200);
  const newestA = profileFixture('a-newest', 'Newest A', 200);
  const store = {
    schemaVersion: 1 as const,
    defaultProfileId: currentDefault.id,
    profiles: [currentDefault, newestZ, newestA],
  };
  const imported = [
    { ...structuredClone(currentDefault), revision: 2, updatedAt: 201, archivedAt: 201 },
    newestZ,
    newestA,
  ];

  const proposal = proposeImportedProfileStore(store, imported);

  assert.equal(proposal.status, 'replacement-required');
  if (proposal.status === 'replacement-required') {
    assert.equal(proposal.replacement.id, newestA.id);
    assert.equal(proposal.store.defaultProfileId, currentDefault.id);
  }
});

test('keeps a valid imported default and rejects import with no active replacement', () => {
  const currentDefault = profileFixture('kept-default', 'Kept', 100);
  const store = {
    schemaVersion: 1 as const,
    defaultProfileId: currentDefault.id,
    profiles: [currentDefault],
  };
  const ready = proposeImportedProfileStore(store, [currentDefault]);
  const blocked = proposeImportedProfileStore(store, [{
    ...structuredClone(currentDefault),
    revision: 2,
    updatedAt: 101,
    archivedAt: 101,
  }]);

  assert.equal(ready.status, 'ready');
  assert.deepEqual(blocked, {
    status: 'error',
    message: 'Imported profiles contain no active replacement for the current default.',
  });
});

test('ignores a replacement when archiving a non-default profile', () => {
  const defaultProfile = profileFixture('default', 'Default', 100);
  const archivedTarget = profileFixture('target', 'Target', 101);
  const suppliedReplacement = profileFixture('replacement', 'Replacement', 102);
  const store = {
    schemaVersion: 1 as const,
    defaultProfileId: defaultProfile.id,
    profiles: [defaultProfile, archivedTarget, suppliedReplacement],
  };

  const archived = archiveProfile(
    store,
    archivedTarget.id,
    suppliedReplacement.id,
  );

  assert.equal(archived.defaultProfileId, defaultProfile.id);
  assert.notEqual(archived.profiles[1].archivedAt, null);
});

test('requires and applies an active replacement when archiving the default', () => {
  const defaultProfile = profileFixture('default', 'Default', 100);
  const replacement = profileFixture('replacement', 'Replacement', 101);
  const store = {
    schemaVersion: 1 as const,
    defaultProfileId: defaultProfile.id,
    profiles: [defaultProfile, replacement],
  };

  assert.throws(() => archiveProfile(store, defaultProfile.id), /replacement/i);

  const archived = archiveProfile(store, defaultProfile.id, replacement.id);
  assert.equal(archived.defaultProfileId, replacement.id);
  assert.equal(archived.profiles[0].archivedAt, archived.profiles[0].updatedAt);
});

test('rejects invalid archive requests', () => {
  const active = profileFixture('active', 'Active', 100);
  const other = profileFixture('other', 'Other', 101);
  const archived = {
    ...profileFixture('archived', 'Archived', 102),
    archivedAt: 103,
  };
  const store = {
    schemaVersion: 1 as const,
    defaultProfileId: active.id,
    profiles: [active, other, archived],
  };

  assert.throws(() => archiveProfile(store, 'missing'));
  assert.throws(() => archiveProfile(store, archived.id));
  assert.throws(() => archiveProfile(store, active.id, 'missing'));
  assert.throws(() => archiveProfile(store, active.id, archived.id));
  assert.throws(() => archiveProfile(store, active.id, active.id));
  assert.throws(() => archiveProfile(store, other.id, 'missing'));
  assert.throws(() => archiveProfile(store, other.id, archived.id));
  assert.throws(() => archiveProfile(store, other.id, other.id));
});

test('exports a complete portable envelope and round-trips unknown profile IDs', () => {
  const profiles = [
    profileFixture('portable-a', 'Portable A', 100),
    profileFixture('portable-b', 'Portable B', 101),
  ];
  const exported = exportProductionProfiles(profiles);
  const envelope = JSON.parse(exported);

  assert.equal(envelope.format, 'inkmaster-production-profiles');
  assert.equal(envelope.schemaVersion, 1);
  assert.equal(Number.isNaN(Date.parse(envelope.exportedAt)), false);
  assert.deepEqual(envelope.profiles, profiles);
  assert.match(exported, /\n  "format"/);

  envelope.profiles[0].thresholds.targetDpi = 72;
  assert.equal(profiles[0].thresholds.targetDpi, 300);

  const imported = importProductionProfiles(exported, []);
  assert.deepEqual(imported.errors, []);
  assert.deepEqual(imported.skippedIds, []);
  assert.deepEqual(imported.profiles, profiles);
  assert.notEqual(imported.profiles[0], profiles[0]);
  assert.notEqual(imported.profiles[0].thresholds, profiles[0].thresholds);
});

test('imports and normalizes legacy underbase disagreement before validation', () => {
  const legacy = profileFixture('legacy-underbase-import', 'Legacy import', 400, 8);
  legacy.defaults.includeUnderbase = false;
  legacy.defaults.packageOptions.includeUnderbase = true;
  const snapshot = structuredClone(legacy);

  const imported = importProductionProfiles(
    exportProductionProfiles([legacy]),
    [],
  );

  assert.deepEqual(imported.errors, []);
  assert.equal(imported.profiles.length, 1);
  assert.equal(imported.profiles[0].id, legacy.id);
  assert.equal(imported.profiles[0].revision, 8);
  assert.equal(imported.profiles[0].defaults.includeUnderbase, false);
  assert.equal(imported.profiles[0].defaults.packageOptions.includeUnderbase, false);
  assert.deepEqual(legacy, snapshot);
});

test('rejects malformed imported package underbase without normalizing it', () => {
  const local = profileFixture('malformed-underbase-local', 'Local profile', 399);
  const incoming = profileFixture('malformed-underbase-import', 'Malformed import', 400, 8);
  incoming.defaults.includeUnderbase = true;
  const portableIncoming = structuredClone(incoming) as unknown as {
    defaults: { packageOptions: { includeUnderbase: unknown } };
  };
  portableIncoming.defaults.packageOptions.includeUnderbase = 'yes';
  const localSnapshot = structuredClone([local]);

  const imported = importProductionProfiles(JSON.stringify({
    format: 'inkmaster-production-profiles',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    profiles: [portableIncoming],
  }), [local]);

  assert.ok(imported.errors.some(
    (error) => error.field === 'profiles.0.defaults.packageOptions.includeUnderbase',
  ));
  assert.deepEqual(imported.profiles, localSnapshot);
  assert.deepEqual(imported.skippedIds, []);
});

test('rejects invalid envelopes and invalid profiles atomically with all errors', () => {
  const locals = [profileFixture('local', 'Local', 100)];
  const localSnapshot = structuredClone(locals);
  const invalidEnvelope = importProductionProfiles(JSON.stringify({
    format: 'wrong',
    schemaVersion: 2,
    profiles: {},
  }), locals);

  assert.deepEqual(
    invalidEnvelope.errors.map((error) => error.field),
    ['format', 'schemaVersion', 'exportedAt', 'profiles'],
  );
  assert.deepEqual(invalidEnvelope.profiles, localSnapshot);

  const invalidProfiles = [
    { ...profileFixture('bad-one', 'Bad one', 101), name: '' },
    { ...profileFixture('bad-two', 'Bad two', 102), revision: 0 },
  ];
  const invalidIncoming = importProductionProfiles(JSON.stringify({
    format: 'inkmaster-production-profiles',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    profiles: invalidProfiles,
  }), locals);

  assert.ok(invalidIncoming.errors.some((error) => error.field === 'profiles.0.name'));
  assert.ok(invalidIncoming.errors.some((error) => error.field === 'profiles.1.revision'));
  assert.deepEqual(invalidIncoming.profiles, localSnapshot);
  assert.deepEqual(invalidIncoming.skippedIds, []);
  assert.deepEqual(locals, localSnapshot);
});

test('rejects portable envelopes over 500 profiles atomically', () => {
  const local = profileFixture('bounded-local', 'Local', 100);
  const incoming = Array.from({ length: 501 }, (_, index) =>
    profileFixture(`bounded-${index}`, `Bounded ${index}`, 101 + index));
  const result = importProductionProfiles(
    exportProductionProfiles(incoming),
    [local],
  );

  assert.deepEqual(result.profiles, [local]);
  assert.deepEqual(result.skippedIds, []);
  assert.deepEqual(result.errors, [{
    field: 'profiles',
    message: 'Portable profile files may contain at most 500 profiles.',
  }]);
});

test('allows profile imports through 5 MB and rejects larger files', () => {
  assert.equal(isProductionProfileImportFileSizeAllowed(5 * 1024 * 1024), true);
  assert.equal(isProductionProfileImportFileSizeAllowed(5 * 1024 * 1024 + 1), false);
});

test('rejects missing, non-string, and invalid exported timestamps atomically', () => {
  const local = profileFixture('local-timestamp', 'Local timestamp', 100);
  const incoming = profileFixture('incoming-timestamp', 'Incoming timestamp', 101);
  const localSnapshot = structuredClone([local]);
  const cases: Array<[string, unknown, boolean]> = [
    ['missing', undefined, true],
    ['non-string', 123, false],
    ['invalid ISO', 'not-an-iso-timestamp', false],
  ];

  for (const [label, exportedAt, omitExportedAt] of cases) {
    const envelope: Record<string, unknown> = {
      format: 'inkmaster-production-profiles',
      schemaVersion: 1,
      exportedAt,
      profiles: [incoming],
    };
    if (omitExportedAt) {
      delete envelope.exportedAt;
    }

    const result = importProductionProfiles(JSON.stringify(envelope), [local]);

    assert.ok(
      result.errors.some((error) => error.field === 'exportedAt'),
      `${label} timestamp should report exportedAt`,
    );
    assert.deepEqual(result.profiles, localSnapshot);
    assert.equal(result.profiles.length, 1);
    assert.deepEqual(result.skippedIds, []);
    assert.notEqual(result.profiles[0], local);
    assert.notEqual(result.profiles[0].thresholds, local.thresholds);
  }
});

test('skips byte-equivalent profiles at the same revision', () => {
  const local = profileFixture('same', 'Same', 100, 3);
  const result = importProductionProfiles(exportProductionProfiles([local]), [local]);

  assert.deepEqual(result.profiles, [local]);
  assert.deepEqual(result.skippedIds, [local.id]);
  assert.notEqual(result.profiles[0], local);
});

test('imports divergent same-ID same-revision profiles as independent conflict copies', () => {
  const local = profileFixture('conflict', 'Local name', 100, 3);
  const incoming = {
    ...structuredClone(local),
    name: 'Incoming name',
  };
  const result = importProductionProfiles(exportProductionProfiles([incoming]), [local]);
  const copy = result.profiles[1];

  assert.equal(result.profiles.length, 2);
  assert.notEqual(copy.id, incoming.id);
  assert.equal(copy.revision, 1);
  assert.equal(copy.name, 'Incoming name (conflict)');
  assert.deepEqual(result.skippedIds, []);
});

test('normalizes archived same-revision conflicts into active fresh duplicates', () => {
  const local = profileFixture('archived-conflict', 'Local', 100, 3);
  const incoming = {
    ...structuredClone(local),
    name: 'Archived incoming',
    createdAt: 1,
    updatedAt: 2,
    archivedAt: 3,
  };
  const beforeImport = Date.now();
  const result = importProductionProfiles(exportProductionProfiles([incoming]), [local]);
  const copy = result.profiles[1];

  assert.notEqual(copy.id, incoming.id);
  assert.equal(copy.revision, 1);
  assert.equal(copy.name, 'Archived incoming (conflict)');
  assert.equal(copy.archivedAt, null);
  assert.ok(copy.createdAt >= beforeImport);
  assert.ok(copy.updatedAt >= beforeImport);
  assert.equal(copy.createdAt, copy.updatedAt);
});

test('replaces newer revisions only when confirmed and skips declined or older revisions', () => {
  const local = profileFixture('versioned', 'Local', 100, 3);
  const newer = {
    ...structuredClone(local),
    revision: 4,
    name: 'Newer',
    updatedAt: 101,
  };
  const older = {
    ...structuredClone(local),
    revision: 2,
    name: 'Older',
    updatedAt: 99,
  };
  let confirmedIncomingId = '';
  let confirmedLocalId = '';

  const accepted = importProductionProfiles(
    exportProductionProfiles([newer]),
    [local],
    (incoming, existing) => {
      confirmedIncomingId = incoming.id;
      confirmedLocalId = existing.id;
      return true;
    },
  );
  const declined = importProductionProfiles(
    exportProductionProfiles([newer]),
    [local],
  );
  const stale = importProductionProfiles(
    exportProductionProfiles([older]),
    [local],
    () => true,
  );

  assert.equal(confirmedIncomingId, newer.id);
  assert.equal(confirmedLocalId, local.id);
  assert.deepEqual(accepted.profiles, [newer]);
  assert.deepEqual(accepted.skippedIds, []);
  assert.deepEqual(declined.profiles, [local]);
  assert.deepEqual(declined.skippedIds, [local.id]);
  assert.deepEqual(stale.profiles, [local]);
  assert.deepEqual(stale.skippedIds, [local.id]);
});

test('never mutates or shares caller profile arrays and nested data', () => {
  const local = profileFixture('local', 'Local', 100);
  const incoming = profileFixture('incoming', 'Incoming', 101);
  const locals = [local];
  const incomingProfiles = [incoming];
  const localSnapshot = structuredClone(locals);
  const incomingSnapshot = structuredClone(incomingProfiles);
  const portableJson = exportProductionProfiles(incomingProfiles);
  const result = importProductionProfiles(portableJson, locals);

  result.profiles[0].thresholds.targetDpi = 72;
  result.profiles[0].printableAreas[printableAreaKey(ItemType.TSHIRT, 'front')].widthInches = 1;
  result.profiles[1].defaults.packageOptions.selectedMockupIndices.push(99);

  assert.deepEqual(locals, localSnapshot);
  assert.deepEqual(incomingProfiles, incomingSnapshot);
});
