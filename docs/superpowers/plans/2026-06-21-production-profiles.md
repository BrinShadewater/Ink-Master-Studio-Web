# Ink Master Production Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add portable, revisioned DTG/DTF production profiles that provide job defaults and deterministic rules for preflight, placement, and exports without silently changing historical jobs.

**Architecture:** Add a focused profile domain module and versioned localStorage repository, then store a complete applied profile snapshot inside each `StudioJob`. Refactor preflight and placement helpers to accept profile rules explicitly, while `App.tsx` owns profile assignment and explicit revision updates. Keep profile management UI isolated in a modal and a compact top-bar selector.

**Tech Stack:** React 19, TypeScript, Vite, localStorage, IndexedDB job records, Node test runner with `tsx`, existing Tailwind/PostCSS build.

---

## File structure

- `types.ts`: profile, printable-area, threshold, snapshot, validation, and job-reference types.
- `constants.ts`: built-in Standard DTG profile inputs.
- `services/productionProfiles.ts`: profile creation, cloning, revisioning, validation, import/export, conflict resolution, default repair, and job snapshot application.
- `services/profileStorage.ts`: versioned localStorage persistence and archive/default operations.
- `services/preflight.ts`: consume an applied profile snapshot for DPI and upscaling thresholds.
- `services/placement.ts`: consume profile printable areas for validation and preview conversion.
- `services/jobModel.ts`: assign/migrate applied profile snapshots.
- `components/ProfileSelector.tsx`: compact job-header profile state and assignment control.
- `components/ProfileManager.tsx`: create, edit, duplicate, archive, default, import, and export UI.
- `components/ProfileEditor.tsx`: focused validated form for one profile revision.
- `App.tsx`: load profiles, assign snapshots, review updates, and route profile rules to preflight/placement/export.
- `tests/production-profiles.test.ts`: domain, validation, revision, import/export, and conflict behavior.
- `tests/jobs.test.ts`: default assignment, migration, switching, snapshots, and portable-job preservation.
- `tests/preflight.test.ts`: profile-driven severity thresholds.
- `tests/placement.test.ts`: profile-driven printable areas and conversion.

### Task 1: Define the production-profile domain

**Files:**
- Modify: `types.ts`
- Modify: `constants.ts`
- Create: `services/productionProfiles.ts`
- Create: `tests/production-profiles.test.ts`

- [ ] **Step 1: Write failing domain tests**

Create `tests/production-profiles.test.ts` with:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createProductionProfile,
  duplicateProductionProfile,
  reviseProductionProfile,
  validateProductionProfile,
} from '../services/productionProfiles';
import { ItemType } from '../types';

test('creates the built-in Standard DTG production profile', () => {
  const profile = createProductionProfile('Standard DTG');
  assert.equal(profile.schemaVersion, 1);
  assert.equal(profile.revision, 1);
  assert.equal(profile.method, 'DTG');
  assert.equal(profile.thresholds.targetDpi, 300);
  assert.equal(profile.thresholds.warningDpi, 200);
  assert.equal(profile.thresholds.criticalDpi, 150);
  assert.ok(profile.printableAreas[`${ItemType.TSHIRT}:front`]);
});

test('rejects inconsistent thresholds and invalid printable areas', () => {
  const profile = createProductionProfile('Broken');
  profile.thresholds.warningDpi = 100;
  profile.thresholds.criticalDpi = 150;
  profile.printableAreas[`${ItemType.TSHIRT}:front`].widthInches = 0;
  const result = validateProductionProfile(profile);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.field === 'thresholds.criticalDpi'));
  assert.ok(result.errors.some((error) => error.field.includes('widthInches')));
});

test('duplicates identity and revisions profiles immutably', () => {
  const source = createProductionProfile('Epson F2270');
  const duplicate = duplicateProductionProfile(source);
  const revised = reviseProductionProfile(source, { description: 'Dark garments' });
  assert.notEqual(duplicate.id, source.id);
  assert.equal(duplicate.name, 'Epson F2270 copy');
  assert.equal(duplicate.revision, 1);
  assert.equal(revised.id, source.id);
  assert.equal(revised.revision, 2);
  assert.equal(source.description, '');
});
```

- [ ] **Step 2: Verify the tests fail for missing profile exports**

Run:

```shell
npx tsx --test tests/production-profiles.test.ts
```

Expected: FAIL because `services/productionProfiles.ts` and the profile types do not exist.

- [ ] **Step 3: Add exact profile types**

Add to `types.ts`:

```ts
export interface PrintableArea {
  widthInches: number;
  heightInches: number;
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
}

export interface ProductionThresholds {
  targetDpi: number;
  warningDpi: number;
  criticalDpi: number;
  significantUpscaleRatio: number;
  extremeUpscaleRatio: number;
}

export interface ProductionProfileDefaults {
  format: OutputFormat;
  preserveTransparency: boolean;
  includeUnderbase: boolean;
  packageOptions: ProductionPackageOptions;
}

export interface ProductionProfile {
  schemaVersion: 1;
  id: string;
  revision: number;
  name: string;
  description: string;
  printerName: string;
  method: ProductionMethod;
  thresholds: ProductionThresholds;
  printableAreas: Record<string, PrintableArea>;
  defaults: ProductionProfileDefaults;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
}

export interface AppliedProductionProfile {
  profileId: string;
  profileRevision: number;
  snapshot: ProductionProfile;
}

export interface ProfileValidationError {
  field: string;
  message: string;
}
```

- [ ] **Step 4: Add built-in values and domain helpers**

In `constants.ts`, export:

```ts
export const DEFAULT_PRODUCTION_THRESHOLDS = {
  targetDpi: 300,
  warningDpi: 200,
  criticalDpi: 150,
  significantUpscaleRatio: 1.5,
  extremeUpscaleRatio: 3,
};
```

Create `services/productionProfiles.ts` implementing:

```ts
const createId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export const printableAreaKey = (itemType: ItemType, location: PlacementLocation) =>
  `${itemType}:${location}`;

const BASE_PRINTABLE_AREAS: Record<ItemType, PrintableArea> = {
  [ItemType.TSHIRT]: { widthInches: 15, heightInches: 18, xPercent: 25, yPercent: 14, widthPercent: 50, heightPercent: 62 },
  [ItemType.HOODIE]: { widthInches: 14, heightInches: 15, xPercent: 27, yPercent: 18, widthPercent: 46, heightPercent: 52 },
  [ItemType.HAT]: { widthInches: 5, heightInches: 2.25, xPercent: 31, yPercent: 34, widthPercent: 38, heightPercent: 22 },
  [ItemType.MUG]: { widthInches: 8.5, heightInches: 3.5, xPercent: 18, yPercent: 30, widthPercent: 64, heightPercent: 40 },
  [ItemType.TOTE]: { widthInches: 12, heightInches: 14, xPercent: 24, yPercent: 20, widthPercent: 52, heightPercent: 58 },
};

const LOCATIONS: PlacementLocation[] = ['front', 'back', 'left-chest', 'sleeve'];

export const createDefaultPrintableAreas = (): Record<string, PrintableArea> =>
  Object.fromEntries(
    Object.values(ItemType).flatMap((itemType) =>
      LOCATIONS.map((location) => [
        printableAreaKey(itemType, location),
        { ...BASE_PRINTABLE_AREAS[itemType] },
      ]),
    ),
  );

export const createProductionProfile = (name = 'Standard DTG'): ProductionProfile => ({
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
  createdAt: Date.now(),
  updatedAt: Date.now(),
  archivedAt: null,
});

export const snapshotProductionProfile = (profile: ProductionProfile): AppliedProductionProfile => ({
  profileId: profile.id,
  profileRevision: profile.revision,
  snapshot: structuredClone(profile),
});

export const duplicateProductionProfile = (profile: ProductionProfile) => ({
  ...structuredClone(profile),
  id: createId('profile'),
  revision: 1,
  name: `${profile.name} copy`,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  archivedAt: null,
});

export const reviseProductionProfile = (
  profile: ProductionProfile,
  patch: Partial<Omit<ProductionProfile, 'id' | 'schemaVersion' | 'revision' | 'createdAt'>>,
) => ({
  ...structuredClone(profile),
  ...patch,
  thresholds: patch.thresholds ? { ...patch.thresholds } : { ...profile.thresholds },
  printableAreas: patch.printableAreas ? structuredClone(patch.printableAreas) : structuredClone(profile.printableAreas),
  defaults: patch.defaults ? structuredClone(patch.defaults) : structuredClone(profile.defaults),
  revision: profile.revision + 1,
  updatedAt: Date.now(),
});

export const validateProductionProfile = (profile: ProductionProfile) => {
  const errors: ProfileValidationError[] = [];
  const add = (field: string, message: string) => errors.push({ field, message });
  const { targetDpi, warningDpi, criticalDpi, significantUpscaleRatio, extremeUpscaleRatio } = profile.thresholds;

  if (targetDpi <= 0) add('thresholds.targetDpi', 'Target DPI must be positive.');
  if (warningDpi <= 0 || warningDpi > targetDpi) {
    add('thresholds.warningDpi', 'Warning DPI must be positive and no higher than target DPI.');
  }
  if (criticalDpi <= 0 || criticalDpi >= warningDpi) {
    add('thresholds.criticalDpi', 'Critical DPI must be positive and lower than warning DPI.');
  }
  if (significantUpscaleRatio <= 0 || significantUpscaleRatio >= extremeUpscaleRatio) {
    add('thresholds.significantUpscaleRatio', 'Significant upscaling must be positive and lower than extreme upscaling.');
  }
  if (extremeUpscaleRatio <= 0) add('thresholds.extremeUpscaleRatio', 'Extreme upscaling must be positive.');

  Object.entries(profile.printableAreas).forEach(([key, area]) => {
    if (area.widthInches <= 0) add(`printableAreas.${key}.widthInches`, 'Width must be positive.');
    if (area.heightInches <= 0) add(`printableAreas.${key}.heightInches`, 'Height must be positive.');
    if (area.xPercent < 0 || area.yPercent < 0 || area.widthPercent <= 0 || area.heightPercent <= 0
      || area.xPercent + area.widthPercent > 100 || area.yPercent + area.heightPercent > 100) {
      add(`printableAreas.${key}.preview`, 'Preview rectangle must fit within 0–100%.');
    }
  });

  return { valid: errors.length === 0, errors };
};
```

- [ ] **Step 5: Run domain tests and typecheck**

Run:

```shell
npx tsx --test tests/production-profiles.test.ts
npx tsc --noEmit
```

Expected: all profile tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit**

```shell
git add types.ts constants.ts services/productionProfiles.ts tests/production-profiles.test.ts
git commit -m "feat: add production profile domain"
```

### Task 2: Add versioned profile storage and portable JSON

**Files:**
- Create: `services/profileStorage.ts`
- Modify: `services/productionProfiles.ts`
- Modify: `tests/production-profiles.test.ts`

- [ ] **Step 1: Write failing persistence and import tests**

Append tests covering:

```ts
test('repairs an empty profile store with a default profile', () => {
  const store = migrateProfileStore(null);
  assert.equal(store.profiles.length, 1);
  assert.equal(store.defaultProfileId, store.profiles[0].id);
});

test('archives the default only when a replacement is supplied', () => {
  const first = createProductionProfile('First');
  const second = createProductionProfile('Second');
  const store = { schemaVersion: 1 as const, profiles: [first, second], defaultProfileId: first.id };
  assert.throws(() => archiveProfile(store, first.id), /replacement/i);
  const result = archiveProfile(store, first.id, second.id);
  assert.equal(result.defaultProfileId, second.id);
  assert.ok(result.profiles.find((profile) => profile.id === first.id)?.archivedAt);
});

test('round-trips portable profiles and copies same-revision conflicts', () => {
  const local = createProductionProfile('Local');
  const divergent = structuredClone(local);
  divergent.name = 'Divergent';
  const portable = exportProductionProfiles([divergent]);
  const result = importProductionProfiles(portable, [local]);
  assert.equal(result.errors.length, 0);
  assert.equal(result.profiles.length, 2);
  assert.notEqual(result.profiles[1].id, local.id);
});
```

- [ ] **Step 2: Verify RED**

Run `npx tsx --test tests/production-profiles.test.ts`.

Expected: FAIL for missing store/import functions.

- [ ] **Step 3: Implement the store shape and repository**

Add:

```ts
export interface ProductionProfileStore {
  schemaVersion: 1;
  defaultProfileId: string;
  profiles: ProductionProfile[];
}
```

Create `services/profileStorage.ts` with:

```ts
const STORAGE_KEY = 'inkmaster_production_profiles_v1';

export const loadProfileStore = (): ProductionProfileStore =>
  migrateProfileStore(typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY));

export const saveProfileStore = (store: ProductionProfileStore) => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }
};

export const getDefaultProfile = (store: ProductionProfileStore) => {
  const profile = store.profiles.find((entry) =>
    entry.id === store.defaultProfileId && entry.archivedAt === null);
  if (!profile) throw new Error('The profile store has no active default profile.');
  return profile;
};

export const archiveProfile = (
  store: ProductionProfileStore,
  profileId: string,
  replacementDefaultId?: string,
): ProductionProfileStore => {
  if (store.defaultProfileId === profileId && !replacementDefaultId) {
    throw new Error('Choose a replacement default profile before archiving.');
  }
  return {
    ...store,
    defaultProfileId: store.defaultProfileId === profileId ? replacementDefaultId! : store.defaultProfileId,
    profiles: store.profiles.map((profile) =>
      profile.id === profileId ? { ...profile, archivedAt: Date.now(), updatedAt: Date.now() } : profile),
  };
};
```

Implement atomic `migrateProfileStore`, `exportProductionProfiles`, and `importProductionProfiles`. The importer must validate every incoming profile before returning writes and return `{ profiles, errors, skippedIds }`.

Use these exact rules:

```ts
export const migrateProfileStore = (raw: string | null): ProductionProfileStore => {
  let parsed: Partial<ProductionProfileStore> | null = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  const active = (parsed?.profiles ?? []).filter((profile) => validateProductionProfile(profile).valid);
  if (active.length === 0) {
    const standard = createProductionProfile();
    return { schemaVersion: 1, defaultProfileId: standard.id, profiles: [standard] };
  }
  const requestedDefault = active.find((profile) =>
    profile.id === parsed?.defaultProfileId && profile.archivedAt === null);
  const fallback = [...active]
    .filter((profile) => profile.archivedAt === null)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? createProductionProfile();
  return {
    schemaVersion: 1,
    defaultProfileId: requestedDefault?.id ?? fallback.id,
    profiles: active.some((profile) => profile.id === fallback.id) ? active : [...active, fallback],
  };
};

export const exportProductionProfiles = (profiles: ProductionProfile[]) => JSON.stringify({
  format: 'inkmaster-production-profiles',
  schemaVersion: 1,
  exportedAt: new Date().toISOString(),
  profiles,
}, null, 2);
```

Give `importProductionProfiles` this signature:

```ts
export const importProductionProfiles = (
  portableJson: string,
  localProfiles: ProductionProfile[],
  confirmUpdate: (incoming: ProductionProfile, local: ProductionProfile) => boolean = () => false,
): {
  profiles: ProductionProfile[];
  errors: ProfileValidationError[];
  skippedIds: string[];
} => {
```

It must first parse and validate the envelope (`format === 'inkmaster-production-profiles'`, `schemaVersion === 1`, and `profiles` is an array) and every profile into a temporary array. If any validation error exists, return the unchanged local array plus all field-level errors. Otherwise merge each incoming profile as follows: accept unknown IDs; skip byte-equivalent matching ID/revision records; replace only when the incoming revision is newer and `confirmUpdate(incoming, local)` returns true; for divergent same-revision records call `duplicateProductionProfile`, rename it `${incoming.name} (conflict)`, and append it. Return `{ profiles: merged, errors: [], skippedIds }` without writing storage; the caller saves only after the entire result succeeds.

- [ ] **Step 4: Verify GREEN**

Run:

```shell
npx tsx --test tests/production-profiles.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```shell
git add types.ts services/productionProfiles.ts services/profileStorage.ts tests/production-profiles.test.ts
git commit -m "feat: persist and transfer production profiles"
```

### Task 3: Attach profile snapshots to jobs

**Files:**
- Modify: `types.ts`
- Modify: `services/jobModel.ts`
- Modify: `services/portableJob.ts`
- Modify: `tests/jobs.test.ts`

- [ ] **Step 1: Write failing job snapshot tests**

Add tests:

```ts
test('assigns the default production profile snapshot to new jobs', () => {
  const profile = createProductionProfile('Default');
  const job = createStudioJob('Profiled', profile);
  assert.equal(job.productionProfile.profileId, profile.id);
  assert.equal(job.productionProfile.profileRevision, 1);
  assert.notEqual(job.productionProfile.snapshot, profile);
});

test('migrates legacy jobs to Standard DTG snapshot', () => {
  const job = migrateStudioJob({ id: 'legacy', metadata: { name: 'Legacy' } });
  assert.equal(job.productionProfile.snapshot.name, 'Standard DTG');
});

test('switching profiles snapshots defaults and resets acknowledgement', () => {
  const first = createProductionProfile('First');
  const second = createProductionProfile('Second');
  const job = createStudioJob('Switch', first);
  job.acknowledgedPreflightRevision = job.revision;
  const switched = applyProductionProfileToJob(job, second);
  assert.equal(switched.productionProfile.profileId, second.id);
  assert.equal(switched.acknowledgedPreflightRevision, null);
  assert.equal(switched.settings.format, second.defaults.format);
});
```

- [ ] **Step 2: Verify RED**

Run `npx tsx --test tests/jobs.test.ts`.

Expected: compile failure because `StudioJob.productionProfile` and profile-aware job functions are missing.

- [ ] **Step 3: Extend the job schema**

Add `productionProfile: AppliedProductionProfile` to `StudioJob`. Change:

```ts
export const createStudioJob = (
  name = 'Untitled job',
  profile = createProductionProfile('Standard DTG'),
): StudioJob => {
```

Initialize `settings`, `printSpecification`, `packageOptions`, and `productionProfile` from the snapshot. Add:

```ts
export const applyProductionProfileToJob = (
  job: StudioJob,
  profile: ProductionProfile,
): StudioJob => {
  const snapshot = snapshotProductionProfile(profile);
  return touchStudioJob({
    ...job,
    productionProfile: snapshot,
    printSpecification: {
      ...job.printSpecification,
      method: profile.method,
      targetDpi: profile.thresholds.targetDpi,
    },
    settings: {
      ...job.settings,
      format: profile.defaults.format,
      preserveTransparency: profile.defaults.preserveTransparency,
    },
    packageOptions: {
      ...structuredClone(profile.defaults.packageOptions),
      includeUnderbase: profile.defaults.includeUnderbase,
    },
    acknowledgedPreflightRevision: null,
  });
};
```

Migration must preserve a valid stored snapshot or create the built-in Standard DTG snapshot. Portable job serialization needs no separate profile file because the snapshot is ordinary job JSON.

- [ ] **Step 4: Verify snapshot and portable-job behavior**

Run:

```shell
npx tsx --test tests/jobs.test.ts
npx tsc --noEmit
```

Expected: PASS, including the existing portable archive round trip.

- [ ] **Step 5: Commit**

```shell
git add types.ts services/jobModel.ts services/portableJob.ts tests/jobs.test.ts
git commit -m "feat: snapshot production profiles in jobs"
```

### Task 4: Make preflight profile-driven

**Files:**
- Modify: `services/preflight.ts`
- Modify: `tests/preflight.test.ts`
- Modify: `components/PreflightPanel.tsx`

- [ ] **Step 1: Write failing threshold tests**

Add:

```ts
test('uses applied profile DPI thresholds', () => {
  const profile = createProductionProfile('Lenient DTF');
  profile.thresholds = {
    targetDpi: 200,
    warningDpi: 150,
    criticalDpi: 100,
    significantUpscaleRatio: 2,
    extremeUpscaleRatio: 4,
  };
  const findings = evaluatePreflight(
    { ...analysis, width: 1680, height: 1680 },
    specification,
    DEFAULT_SETTINGS,
    profile,
  );
  assert.equal(findings.find((entry) => entry.id === 'resolution')?.severity, 'warning');
});
```

- [ ] **Step 2: Verify RED**

Run `npx tsx --test tests/preflight.test.ts`.

Expected: FAIL because `evaluatePreflight` accepts only three arguments and uses hard-coded limits.

- [ ] **Step 3: Inject profile rules**

Change the signature:

```ts
export const evaluatePreflight = (
  analysis: ArtworkAnalysis,
  specification: PrintSpecification,
  settings: ProcessingSettings,
  profile: ProductionProfile,
): PreflightFinding[] => {
```

Replace hard-coded `150`, `1.5`, and `3` with `profile.thresholds`. Resolution is critical below `criticalDpi`, warning below `warningDpi`, and pass at or above `warningDpi`; the pass text still reports `targetDpi` when the source is below the ideal target. Upscaling is warning above `significantUpscaleRatio` and critical above `extremeUpscaleRatio`. Keep background, halo, detail, and format checks deterministic.

Update `PreflightPanel` to show the applied profile name and revision as read-only context; keep actual job print dimensions editable.

- [ ] **Step 4: Update every caller and verify**

Update `App.tsx` and `components/BatchProcessor.tsx` to pass the applied snapshot. Batch uses the current default profile snapshot.

Run:

```shell
npx tsx --test tests/preflight.test.ts tests/batch.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```shell
git add services/preflight.ts tests/preflight.test.ts components/PreflightPanel.tsx App.tsx components/BatchProcessor.tsx
git commit -m "feat: drive preflight from production profiles"
```

### Task 5: Make placement profile-driven

**Files:**
- Modify: `services/placement.ts`
- Modify: `tests/placement.test.ts`
- Modify: `components/PlacementPanel.tsx`
- Modify: `App.tsx`

- [ ] **Step 1: Write failing placement tests**

Add:

```ts
test('uses profile printable areas for validation and conversion', () => {
  const profile = createProductionProfile('Small platen');
  profile.printableAreas[printableAreaKey(ItemType.TSHIRT, 'front')] = {
    widthInches: 10,
    heightInches: 12,
    xPercent: 30,
    yPercent: 18,
    widthPercent: 40,
    heightPercent: 52,
  };
  assert.equal(validatePlacement({ ...DEFAULT_PLACEMENT, widthInches: 12 }, profile).valid, false);
  const percent = placementToMockupPercent({ ...DEFAULT_PLACEMENT, widthInches: 8 }, profile);
  assert.ok(percent.width < 40);
});
```

- [ ] **Step 2: Verify RED**

Run `npx tsx --test tests/placement.test.ts`.

Expected: FAIL because placement functions use module-level areas.

- [ ] **Step 3: Inject profile printable areas**

Change helpers to:

```ts
export const getPrintableArea = (
  itemType: ItemType,
  location: PlacementLocation,
  profile: ProductionProfile,
) => profile.printableAreas[printableAreaKey(itemType, location)];

export const validatePlacement = (
  placement: PlacementMeasurement,
  profile: ProductionProfile,
) => {
  const area = getPrintableArea(placement.itemType, placement.location, profile);
  const errors: string[] = [];
  if (!area) return { valid: false, errors: ['The selected profile does not support this product and placement.'] };
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

export const placementToMockupPercent = (
  placement: PlacementMeasurement,
  profile: ProductionProfile,
) => {
  const area = getPrintableArea(placement.itemType, placement.location, profile);
  if (!area) throw new Error('Unsupported product and placement for the applied profile.');
  const width = (placement.widthInches / area.widthInches) * area.widthPercent;
  const height = (placement.heightInches / area.heightInches) * area.heightPercent;
  const centerX = area.xPercent + area.widthPercent / 2
    + (placement.offsetXInches / area.widthInches) * area.widthPercent;
  const y = area.yPercent + (placement.offsetYInches / area.heightInches) * area.heightPercent;
  return { x: centerX - width / 2, y, width, height };
};

export const mockupPercentToPlacement = (
  percent: { x: number; y: number; width: number; height: number },
  base: PlacementMeasurement,
  profile: ProductionProfile,
) => {
  const area = getPrintableArea(base.itemType, base.location, profile);
  if (!area) throw new Error('Unsupported product and placement for the applied profile.');
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
```

Add an explicit critical `placement-area` finding in `App.tsx` when the current measurement exceeds the applied profile area.

- [ ] **Step 4: Update UI and verify**

Pass the profile snapshot to `PlacementPanel`, show the active printable maximum, and update all conversion calls in `App.tsx`.

Run:

```shell
npx tsx --test tests/placement.test.ts tests/preflight.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```shell
git add services/placement.ts tests/placement.test.ts components/PlacementPanel.tsx App.tsx
git commit -m "feat: calibrate placement by production profile"
```

### Task 6: Build profile manager and editor UI

**Files:**
- Create: `components/ProfileEditor.tsx`
- Create: `components/ProfileManager.tsx`
- Create: `components/ProfileSelector.tsx`
- Modify: `components/StudioTopBar.tsx`
- Modify: `App.tsx`

- [ ] **Step 1: Add pure UI-state tests to the domain**

Add tests for `getProfileUpdateState(job, profiles)`:

```ts
test('detects newer, archived, and missing profile sources', () => {
  const profile = createProductionProfile('Source');
  const job = createStudioJob('Job', profile);
  assert.equal(getProfileUpdateState(job, [reviseProductionProfile(profile, { name: 'Source v2' })]).status, 'update-available');
  assert.equal(getProfileUpdateState(job, [{ ...profile, archivedAt: Date.now() }]).status, 'archived');
  assert.equal(getProfileUpdateState(job, []).status, 'missing');
});
```

- [ ] **Step 2: Verify RED and implement state helper**

Run the profile tests, then implement:

```ts
export type ProfileUpdateStatus = 'current' | 'update-available' | 'archived' | 'missing';

export const getProfileUpdateState = (
  job: StudioJob,
  profiles: ProductionProfile[],
) => {
  const source = profiles.find((profile) => profile.id === job.productionProfile.profileId);
  if (!source) return { status: 'missing' as const, source: null };
  if (source.archivedAt) return { status: 'archived' as const, source };
  if (source.revision > job.productionProfile.profileRevision) {
    return { status: 'update-available' as const, source };
  }
  return { status: 'current' as const, source };
};
```

- [ ] **Step 3: Implement `ProfileEditor`**

Build a controlled form receiving:

```ts
interface ProfileEditorProps {
  profile: ProductionProfile;
  validationErrors: ProfileValidationError[];
  onChange: (profile: ProductionProfile) => void;
  onSave: () => void;
  onCancel: () => void;
}
```

Render the five approved sections with these field bindings:

1. Printer and method: `name`, `description`, `printerName`, `method`.
2. Thresholds: all five `thresholds.*` numeric properties.
3. Printable areas: one row per `printableAreas` key with product/location labels and all six numeric area properties.
4. Treatment defaults: `defaults.preserveTransparency`, `defaults.includeUnderbase`.
5. Output defaults: `defaults.format` and every existing `defaults.packageOptions` field, including `selectedMockupIndices` and `namingPattern`.

For each input, map matching `validationErrors.field` values to inline text and `aria-describedby`. Disable Save whenever `validationErrors.length > 0`.

- [ ] **Step 4: Implement `ProfileManager`**

Support create, duplicate, edit, set default, archive with replacement selection, show archived, export one/all, and JSON import. Keep edits in component-local draft state until Save. Saving an edit must call `reviseProductionProfile`; never mutate or replace the revision already embedded in jobs. Import must show all returned field errors before offering Save.

- [ ] **Step 5: Implement `ProfileSelector`**

Render applied profile name/revision and states:

```ts
interface ProfileSelectorProps {
  applied: AppliedProductionProfile;
  profiles: ProductionProfile[];
  updateState: ReturnType<typeof getProfileUpdateState>;
  onAssign: (profileId: string) => void;
  onApplyUpdate: () => void;
  onManage: () => void;
}
```

Use a compact responsive button in `StudioTopBar`; text hides below `md`, matching Templates and Versions.

- [ ] **Step 6: Integrate storage and job assignment in `App.tsx`**

On mount:

```ts
const [profileStore, setProfileStore] = useState(() => loadProfileStore());
```

When uploading a new file, call `createStudioJob(name, getDefaultProfile(profileStore))`. Save profile-store changes in a `try/catch`; on failure retain the unsaved editor draft and show `Profiles could not be saved locally. Export a backup or free browser storage, then retry.` Profile assignment uses `applyProductionProfileToJob`.

For an available revision update, first show a review dialog listing changed thresholds, printable areas, method, and output defaults. Only its `Apply profile revision` action calls `applyProductionProfileToJob`; Cancel leaves the job and acknowledgement untouched. After applying, recalculate preflight and placement from the new snapshot and show any new critical finding before export controls.

- [ ] **Step 7: Verify UI compilation**

Run:

```shell
npx tsc --noEmit
npm test
```

Expected: build and all tests PASS.

- [ ] **Step 8: Commit**

```shell
git add components/ProfileEditor.tsx components/ProfileManager.tsx components/ProfileSelector.tsx components/StudioTopBar.tsx App.tsx services/productionProfiles.ts tests/production-profiles.test.ts
git commit -m "feat: manage and assign production profiles"
```

### Task 7: Integrate profiles with exports, templates, and documentation

**Files:**
- Modify: `services/productionPackage.ts`
- Modify: `services/proofBuilder.ts`
- Modify: `services/templateStorage.ts`
- Modify: `tests/exports.test.ts`
- Modify: `tests/templates.test.ts`
- Modify: `README.md`
- Modify: `docs/MAINTENANCE.md`

- [ ] **Step 1: Write failing manifest and template tests**

Add assertions:

```ts
assert.equal(manifest.productionProfile.name, 'Standard DTG');
assert.equal(manifest.productionProfile.revision, 1);
```

Add a template test confirming profile snapshots are not included in `ShopTemplate`; templates continue to store operational defaults, while job profile assignment remains independent.

- [ ] **Step 2: Verify RED**

Run:

```shell
npx tsx --test tests/exports.test.ts tests/templates.test.ts
```

Expected: manifest assertion FAIL.

- [ ] **Step 3: Add profile provenance to outputs**

In `createJobManifest`, add:

```ts
productionProfile: {
  id: job.productionProfile.profileId,
  revision: job.productionProfile.profileRevision,
  name: job.productionProfile.snapshot.name,
  printerName: job.productionProfile.snapshot.printerName,
  method: job.productionProfile.snapshot.method,
},
```

Add profile name/revision to production summaries and proof descriptors. Do not duplicate complete profile snapshots into production-package metadata.

- [ ] **Step 4: Update documentation**

Document:

- Multiple named production profiles.
- Default assignment and explicit job overrides.
- Revision snapshots and update review.
- JSON backup/import.
- Local storage key and profile recovery rules.

- [ ] **Step 5: Verify**

Run:

```shell
npx tsx --test tests/exports.test.ts tests/templates.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```shell
git add services/productionPackage.ts services/proofBuilder.ts services/templateStorage.ts tests/exports.test.ts tests/templates.test.ts README.md docs/MAINTENANCE.md
git commit -m "feat: include profile provenance in handoff"
```

### Task 8: Full QA and release preparation

**Files:**
- Modify only files required by defects discovered during QA.

- [ ] **Step 1: Run full automated verification**

```shell
npm test
npx tsc --noEmit
npm audit --audit-level=high
git diff --check
```

Expected: `npm test` completes its production build and all tests, TypeScript exits 0, audit reports zero high vulnerabilities, and diff check is clean.

- [ ] **Step 2: Run desktop workflow at 1440×900**

Using Browser:

1. Create `Epson F2270 DTG`.
2. Edit DPI thresholds and T-shirt front printable area.
3. Set it as default.
4. Upload safe sample artwork.
5. Confirm automatic assignment and snapshot revision.
6. Switch to another profile and verify preflight/placement changes.
7. Edit the source profile and verify `Profile update available`.
8. Apply the update explicitly and verify acknowledgement resets.
9. Generate a production package and confirm profile provenance.

Expected: no console errors, hidden actions, clipped controls, or silent job changes.

- [ ] **Step 3: Run persistence and transfer workflow**

1. Export all profiles as JSON.
2. Archive a non-default profile.
3. Reopen a historical job and confirm its snapshot remains usable.
4. Import the JSON into cleared profile storage.
5. Confirm equivalent profile names, revisions, defaults, thresholds, and printable areas.

- [ ] **Step 4: Run mobile workflow at 390×844**

Verify selector, manager, editor, inline validation, sticky actions, profile switching, and update review without horizontal overflow.

- [ ] **Step 5: Final scoped review**

```shell
git status --short --branch
git diff --stat main...HEAD
git log --oneline main..HEAD
```

Confirm no temporary screenshots, downloaded JSON, browser artifacts, secrets, or unrelated files are tracked.

- [ ] **Step 6: Final commit for QA fixes**

If QA required changes:

```shell
git add -u
git commit -m "fix: polish production profile workflow"
```

If no changes were needed, do not create an empty commit.
