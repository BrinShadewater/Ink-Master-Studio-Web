import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';

import {
  applyProductionProfileToJob,
  applyProductionProfileTransitionToJob,
  createStudioJob,
  duplicateStudioJob,
  migrateStudioJob,
  touchStudioJob,
} from '../services/jobModel';
import { archiveJob, getJob, listJobs, saveJob } from '../services/jobRepository';
import { exportPortableJob, importPortableJob } from '../services/portableJob';
import { createProductionProfile, snapshotProductionProfile } from '../services/productionProfiles';
import { OutputFormat, StudioJob } from '../types';

const customProfile = () => {
  const profile = createProductionProfile('Custom DTF');
  profile.id = 'profile-custom-dtf';
  profile.revision = 4;
  profile.method = 'DTF';
  profile.thresholds.targetDpi = 360;
  profile.defaults.format = OutputFormat.PDF;
  profile.defaults.preserveTransparency = false;
  profile.defaults.includeUnderbase = true;
  profile.defaults.packageOptions.namingPattern = '{order}_{placement}_custom';
  profile.defaults.packageOptions.selectedMockupIndices = [0, 4];
  profile.defaults.packageOptions.includeMockups = true;
  profile.defaults.packageOptions.includeUnderbase = true;
  return profile;
};

test('creates a versioned job with production defaults', () => {
  const job = createStudioJob('River Street Tees');

  assert.equal(job.schemaVersion, 1);
  assert.equal(job.metadata.name, 'River Street Tees');
  assert.equal(job.printSpecification.method, 'DTG');
  assert.equal(job.printSpecification.widthInches, 12);
  assert.ok(job.activePlacementKey);
  assert.ok(job.placements[job.activePlacementKey]);
  assert.equal(job.proofApproval.status, 'not-requested');
  assert.equal(job.proofApproval.cloudSyncStatus, 'local-only');
  assert.equal(job.proofApproval.shareUrl, null);
});

test('creates a job from an immutable applied production profile snapshot', () => {
  const profile = customProfile();
  const job = createStudioJob('Custom order', profile);

  assert.equal(job.productionProfile.profileId, profile.id);
  assert.equal(job.productionProfile.profileRevision, profile.revision);
  assert.deepEqual(job.productionProfile.snapshot, profile);
  assert.notEqual(job.productionProfile.snapshot, profile);
  assert.notEqual(job.productionProfile.snapshot.thresholds, profile.thresholds);
  assert.notEqual(
    job.productionProfile.snapshot.defaults.packageOptions,
    profile.defaults.packageOptions,
  );
  assert.equal(job.printSpecification.method, 'DTF');
  assert.equal(job.printSpecification.targetDpi, 360);
  assert.equal(job.settings.format, OutputFormat.PDF);
  assert.equal(job.settings.preserveTransparency, false);
  assert.equal(job.packageOptions.namingPattern, '{order}_{placement}_custom');
  assert.deepEqual(job.packageOptions.selectedMockupIndices, [0, 4]);
  assert.equal(job.packageOptions.includeUnderbase, true);
  assert.notEqual(job.packageOptions, profile.defaults.packageOptions);
  assert.notEqual(
    job.packageOptions.selectedMockupIndices,
    profile.defaults.packageOptions.selectedMockupIndices,
  );
  assert.equal(job.acknowledgedPreflightRevision, null);

  job.productionProfile.snapshot.thresholds.targetDpi = 72;
  job.packageOptions.selectedMockupIndices.push(99);

  assert.equal(profile.thresholds.targetDpi, 360);
  assert.deepEqual(profile.defaults.packageOptions.selectedMockupIndices, [0, 4]);
});

test('migrates partial legacy job data into the current schema', () => {
  const migrated = migrateStudioJob({
    id: 'legacy',
    metadata: { name: 'Legacy order' },
    settings: { threshold: 42, format: OutputFormat.JPG },
    printSpecification: { method: 'DTF', targetDpi: 240 },
    packageOptions: { namingPattern: 'legacy-{job}', includeUnderbase: true },
    proofApproval: {
      status: 'approved',
      requestedAt: 1_700_000_000_000,
      respondedAt: 1_700_000_100_000,
      approverName: 'Taylor',
      approverEmail: 'taylor@example.com',
      notes: 'Approved by email.',
      shareUrl: 'https://example.com/proof',
      cloudSyncStatus: 'ready',
      events: [{
        id: 'approval-1',
        timestamp: 1_700_000_100_000,
        status: 'approved',
        actor: 'Taylor',
        note: 'Approved by email.',
      }],
    },
  });

  assert.equal(migrated.id, 'legacy');
  assert.equal(migrated.metadata.name, 'Legacy order');
  assert.equal(migrated.settings.threshold, 42);
  assert.equal(migrated.settings.format, OutputFormat.JPG);
  assert.equal(migrated.printSpecification.method, 'DTF');
  assert.equal(migrated.printSpecification.targetDpi, 240);
  assert.equal(migrated.packageOptions.namingPattern, 'legacy-{job}');
  assert.equal(migrated.packageOptions.includeUnderbase, true);
  assert.equal(migrated.proofApproval.status, 'approved');
  assert.equal(migrated.proofApproval.approverName, 'Taylor');
  assert.equal(migrated.proofApproval.cloudSyncStatus, 'ready');
  assert.deepEqual(migrated.proofApproval.events, [{
    id: 'approval-1',
    timestamp: 1_700_000_100_000,
    status: 'approved',
    actor: 'Taylor',
    note: 'Approved by email.',
  }]);
  assert.equal(migrated.schemaVersion, 1);
  assert.equal(migrated.productionProfile.snapshot.name, 'Standard DTG');
  assert.equal(migrated.productionProfile.snapshot.method, 'DTG');
  assert.equal(
    migrated.productionProfile.profileId,
    migrated.productionProfile.snapshot.id,
  );
  assert.equal(
    migrated.productionProfile.profileRevision,
    migrated.productionProfile.snapshot.revision,
  );
  assert.equal(migrated.appliedTemplate, null);
});

test('drops malformed proof approval state during migration', () => {
  const migrated = migrateStudioJob({
    metadata: { name: 'Bad approval' },
    proofApproval: {
      status: 'posted',
      requestedAt: 'yesterday',
      respondedAt: false,
      approverName: 123,
      cloudSyncStatus: 'public',
      events: [{
        id: 'bad',
        timestamp: 'today',
        status: 'approved',
        actor: 'Taylor',
        note: 'Nope',
      }],
    },
  });

  assert.equal(migrated.proofApproval.status, 'not-requested');
  assert.equal(migrated.proofApproval.requestedAt, null);
  assert.equal(migrated.proofApproval.respondedAt, null);
  assert.equal(migrated.proofApproval.approverName, '');
  assert.equal(migrated.proofApproval.cloudSyncStatus, 'local-only');
  assert.deepEqual(migrated.proofApproval.events, []);
});

test('migrates valid applied template provenance and drops malformed records', () => {
  const valid = migrateStudioJob({
    ...createStudioJob('Template provenance'),
    appliedTemplate: {
      id: 'template_daily',
      name: 'Daily DTG',
      appliedAt: 1_700_000_000_000,
    },
  });
  const malformed = migrateStudioJob({
    ...createStudioJob('Malformed template provenance'),
    appliedTemplate: {
      id: '',
      name: 'Daily DTG',
      appliedAt: 'yesterday',
    },
  });

  assert.deepEqual(valid.appliedTemplate, {
    id: 'template_daily',
    name: 'Daily DTG',
    appliedAt: 1_700_000_000_000,
  });
  assert.equal(malformed.appliedTemplate, null);
});

test('migrates identical legacy jobs with deterministic isolated production profiles', () => {
  const legacy = {
    id: 'deterministic-legacy',
    createdAt: 100,
    updatedAt: 200,
    metadata: { name: 'Deterministic legacy' },
  };

  const first = migrateStudioJob(legacy);
  const second = migrateStudioJob(legacy);

  assert.deepEqual(first.productionProfile, second.productionProfile);
  assert.equal(first.productionProfile.profileId, 'profile_standard_dtg_builtin');
  assert.equal(first.productionProfile.profileRevision, 1);
  assert.equal(first.productionProfile.snapshot.createdAt, 0);
  assert.equal(first.productionProfile.snapshot.updatedAt, 0);
  assert.notEqual(first.productionProfile, second.productionProfile);
  assert.notEqual(first.productionProfile.snapshot, second.productionProfile.snapshot);
  assert.notEqual(
    first.productionProfile.snapshot.printableAreas,
    second.productionProfile.snapshot.printableAreas,
  );
  assert.notEqual(
    first.productionProfile.snapshot.defaults.packageOptions,
    second.productionProfile.snapshot.defaults.packageOptions,
  );
});

test('preserves only coherent stored production profile wrappers and deep clones them', () => {
  const profile = customProfile();
  const applied = snapshotProductionProfile(profile);
  const migrated = migrateStudioJob({
    ...createStudioJob('Stored profile'),
    productionProfile: applied,
  });

  assert.deepEqual(migrated.productionProfile, applied);
  assert.notEqual(migrated.productionProfile, applied);
  assert.notEqual(migrated.productionProfile.snapshot, applied.snapshot);
  assert.notEqual(
    migrated.productionProfile.snapshot.printableAreas,
    applied.snapshot.printableAreas,
  );
  assert.notEqual(
    migrated.productionProfile.snapshot.defaults.packageOptions.selectedMockupIndices,
    applied.snapshot.defaults.packageOptions.selectedMockupIndices,
  );
});

test('migrates legacy applied profile underbase disagreement without fallback', () => {
  const profile = customProfile();
  profile.id = 'legacy-applied-underbase';
  profile.revision = 6;
  profile.defaults.includeUnderbase = true;
  profile.defaults.packageOptions.includeUnderbase = false;
  const applied = snapshotProductionProfile(profile);
  const snapshot = structuredClone(applied);

  const migrated = migrateStudioJob({
    ...createStudioJob('Legacy applied underbase'),
    productionProfile: applied,
  });

  assert.equal(migrated.productionProfile.profileId, profile.id);
  assert.equal(migrated.productionProfile.profileRevision, 6);
  assert.equal(migrated.productionProfile.snapshot.defaults.includeUnderbase, true);
  assert.equal(
    migrated.productionProfile.snapshot.defaults.packageOptions.includeUnderbase,
    true,
  );
  assert.deepEqual(applied, snapshot);
});

test('falls back safely when a stored production profile wrapper is incoherent or malformed', () => {
  const profile = customProfile();
  const incoherent = snapshotProductionProfile(profile);
  incoherent.profileRevision += 1;

  for (const productionProfile of [
    incoherent,
    {
      profileId: profile.id,
      profileRevision: profile.revision,
      snapshot: {
        ...profile,
        defaults: null,
        thresholds: null,
      },
    },
    {
      profileId: '',
      profileRevision: 0,
      snapshot: null,
    },
  ]) {
    let migrated: StudioJob | undefined;
    assert.doesNotThrow(() => {
      migrated = migrateStudioJob({
        ...createStudioJob('Malformed profile'),
        productionProfile,
      });
    });
    assert.equal(migrated?.productionProfile.snapshot.name, 'Standard DTG');
    assert.equal(migrated?.productionProfile.snapshot.method, 'DTG');
  }
});

test('touches jobs with a strictly advancing updated timestamp', () => {
  const source = createStudioJob('Future timestamp');
  source.updatedAt = Date.now() + 10_000;
  source.revision = 12;
  source.acknowledgedPreflightRevision = 12;

  const touched = touchStudioJob(source);

  assert.equal(touched.revision, 13);
  assert.equal(touched.acknowledgedPreflightRevision, null);
  assert.ok(touched.updatedAt > source.updatedAt);
});

test('applies a production profile as one immutable job revision while preserving unrelated data', () => {
  const sourceProfile = createProductionProfile('Source profile');
  const nextProfile = customProfile();
  const source = createStudioJob('Profile switch', sourceProfile);
  source.updatedAt = 1;
  source.revision = 8;
  source.acknowledgedPreflightRevision = 8;
  source.metadata.customerName = 'North Shore Prints';
  source.sourceArtwork = {
    name: 'logo.png',
    type: 'image/png',
    lastModified: 12,
    blob: new Blob(['png']),
  };
  source.printSpecification.widthInches = 11;
  source.settings.threshold = 47;
  source.packageOptions.includeSummary = false;
  const sourceBefore = structuredClone(source);
  const profileBefore = structuredClone(nextProfile);

  const applied = applyProductionProfileToJob(source, nextProfile);

  assert.equal(applied.revision, 9);
  assert.ok(applied.updatedAt > source.updatedAt);
  assert.equal(applied.acknowledgedPreflightRevision, null);
  assert.equal(applied.metadata.customerName, 'North Shore Prints');
  assert.equal(applied.sourceArtwork?.name, 'logo.png');
  assert.equal(applied.printSpecification.widthInches, 11);
  assert.equal(applied.settings.threshold, 47);
  assert.equal(applied.printSpecification.method, 'DTF');
  assert.equal(applied.printSpecification.targetDpi, 360);
  assert.equal(applied.settings.format, OutputFormat.PDF);
  assert.equal(applied.settings.preserveTransparency, false);
  assert.equal(applied.packageOptions.namingPattern, '{order}_{placement}_custom');
  assert.deepEqual(applied.packageOptions.selectedMockupIndices, [0, 4]);
  assert.equal(applied.packageOptions.includeUnderbase, true);
  assert.deepEqual(source, sourceBefore);
  assert.deepEqual(nextProfile, profileBefore);
  assert.notEqual(applied.productionProfile.snapshot, nextProfile);
  assert.notEqual(applied.packageOptions, nextProfile.defaults.packageOptions);
  assert.notEqual(
    applied.packageOptions.selectedMockupIndices,
    nextProfile.defaults.packageOptions.selectedMockupIndices,
  );
});

test('applies the complete profile transition once and resets acknowledgement', () => {
  const source = createStudioJob('Complete profile transition');
  source.revision = 7;
  source.acknowledgedPreflightRevision = 7;

  const applied = applyProductionProfileTransitionToJob(source, customProfile());

  assert.equal(applied.revision, 8);
  assert.equal(applied.acknowledgedPreflightRevision, null);
  assert.equal(applied.productionProfile.profileRevision, 4);
  assert.equal(applied.settings.format, OutputFormat.PDF);
  assert.equal(applied.printSpecification.method, 'DTF');
  assert.equal(
    applied.placements[applied.activePlacementKey].itemType,
    applied.settings.itemType,
  );
});

test('isolates all nested job state when applying a production profile', async () => {
  const source = createStudioJob('Nested profile switch');
  source.metadata.tags = ['priority'];
  source.placements[source.activePlacementKey].offsetXInches = 1;
  source.proofBranding.shopName = 'Original shop';
  source.preflightFindings = [{
    id: 'finding-1',
    severity: 'warning',
    title: 'Check artwork',
    message: 'Review transparency.',
    action: 'Inspect the source file.',
  }];
  source.versions = [{
    id: 'version-1',
    name: 'Initial',
    timestamp: 10,
    settings: {
      ...structuredClone(source.settings),
      colorReplacements: [{
        sourceColor: '#000000',
        targetColor: '#FFFFFF',
        tolerance: 15,
      }],
    },
  }];
  source.packageOptions.selectedMockupIndices = [1, 3];
  source.sourceArtwork = {
    name: 'nested-artwork.png',
    type: 'image/png',
    lastModified: 20,
    blob: new Blob(['original-artwork'], { type: 'image/png' }),
  };
  const sourceBefore = structuredClone(source);

  const applied = applyProductionProfileToJob(source, customProfile());

  applied.metadata.tags.push('changed');
  applied.placements[applied.activePlacementKey].offsetXInches = 9;
  applied.proofBranding.shopName = 'Changed shop';
  applied.preflightFindings[0].title = 'Changed finding';
  applied.versions[0].name = 'Changed version';
  applied.versions[0].settings.colorReplacements[0].targetColor = '#FF0000';
  applied.packageOptions.selectedMockupIndices.push(99);

  assert.deepEqual(source, sourceBefore);
  assert.notEqual(applied.metadata, source.metadata);
  assert.notEqual(applied.metadata.tags, source.metadata.tags);
  assert.notEqual(applied.placements, source.placements);
  assert.notEqual(
    applied.placements[applied.activePlacementKey],
    source.placements[source.activePlacementKey],
  );
  assert.notEqual(applied.proofBranding, source.proofBranding);
  assert.notEqual(applied.preflightFindings, source.preflightFindings);
  assert.notEqual(applied.versions, source.versions);
  assert.notEqual(applied.versions[0].settings, source.versions[0].settings);
  assert.notEqual(applied.packageOptions, source.packageOptions);
  assert.notEqual(applied.sourceArtwork, source.sourceArtwork);
  assert.ok(applied.sourceArtwork?.blob instanceof Blob);
  assert.equal(applied.sourceArtwork?.blob.type, 'image/png');
  assert.equal(await applied.sourceArtwork?.blob.text(), 'original-artwork');
  assert.equal(await source.sourceArtwork.blob.text(), 'original-artwork');
});

test('duplicates jobs without sharing identity or export history', () => {
  const source = createStudioJob('Original', customProfile());
  source.exports = [{
    id: 'export-1',
    filename: 'original.png',
    format: 'PNG',
    timestamp: 1,
    blob: new Blob(['png']),
  }];
  source.proofApproval = {
    ...source.proofApproval,
    status: 'approved',
    requestedAt: 1_700_000_000_000,
    respondedAt: 1_700_000_100_000,
    approverName: 'Taylor',
  };

  const duplicate = duplicateStudioJob(source);

  assert.notEqual(duplicate.id, source.id);
  assert.equal(duplicate.metadata.name, 'Original copy');
  assert.deepEqual(duplicate.exports, []);
  assert.equal(duplicate.proofApproval.status, 'not-requested');
  assert.equal(duplicate.proofApproval.requestedAt, null);
  assert.equal(duplicate.sourceArtwork, source.sourceArtwork);
  assert.deepEqual(duplicate.productionProfile, source.productionProfile);
  assert.notEqual(duplicate.productionProfile, source.productionProfile);
  assert.notEqual(duplicate.productionProfile.snapshot, source.productionProfile.snapshot);
  assert.notEqual(
    duplicate.productionProfile.snapshot.defaults.packageOptions.selectedMockupIndices,
    source.productionProfile.snapshot.defaults.packageOptions.selectedMockupIndices,
  );

  duplicate.productionProfile.snapshot.defaults.packageOptions.selectedMockupIndices.push(99);
  assert.deepEqual(
    source.productionProfile.snapshot.defaults.packageOptions.selectedMockupIndices,
    [0, 4],
  );
});

test('round-trips source artwork through a portable job archive', async () => {
  const source = createStudioJob('Portable');
  source.sourceArtwork = {
    name: 'artwork.svg',
    type: 'image/svg+xml',
    lastModified: 123,
    blob: new Blob(['<svg/>'], { type: 'image/svg+xml' }),
  };

  const archive = await exportPortableJob(source);
  const imported = await importPortableJob(archive);

  assert.equal(imported.metadata.name, 'Portable');
  assert.equal(imported.sourceArtwork?.name, 'artwork.svg');
  assert.equal(await imported.sourceArtwork?.blob.text(), '<svg/>');
});

test('round-trips a custom production profile snapshot through a portable job archive', async () => {
  const source = createStudioJob('Portable custom', customProfile());

  const archive = await exportPortableJob(source);
  const imported = await importPortableJob(archive);

  assert.deepEqual(imported.productionProfile, source.productionProfile);
  assert.notEqual(imported.productionProfile, source.productionProfile);
  assert.notEqual(imported.productionProfile.snapshot, source.productionProfile.snapshot);
  assert.notEqual(
    imported.productionProfile.snapshot.defaults.packageOptions.selectedMockupIndices,
    source.productionProfile.snapshot.defaults.packageOptions.selectedMockupIndices,
  );

  imported.productionProfile.snapshot.defaults.packageOptions.selectedMockupIndices.push(99);
  assert.deepEqual(
    source.productionProfile.snapshot.defaults.packageOptions.selectedMockupIndices,
    [0, 4],
  );
});

test('round-trips proof approval state through a portable job archive', async () => {
  const source = createStudioJob('Portable approval');
  source.proofApproval = {
    ...source.proofApproval,
    status: 'changes-requested',
    requestedAt: 1_700_000_000_000,
    respondedAt: 1_700_000_100_000,
    approverName: 'Taylor',
    approverEmail: 'taylor@example.com',
    notes: 'Move the design down half an inch.',
  };

  const archive = await exportPortableJob(source);
  const imported = await importPortableJob(archive);

  assert.deepEqual(imported.proofApproval, source.proofApproval);
  assert.notEqual(imported.proofApproval, source.proofApproval);
});

test('round-trips production export metadata through a portable job archive', async () => {
  const source = createStudioJob('Portable export metadata');
  source.exports = [{
    id: 'export-package',
    filename: 'portable-production.zip',
    format: 'ZIP',
    timestamp: 1_700_000_000_000,
    blob: new Blob(['zip']),
    metadata: {
      kind: 'production-package',
      readinessStatus: 'ready',
      readinessSummary: 'Production handoff is ready.',
      packageContents: ['Print master', 'Job manifest'],
      manifestVerified: true,
      preflightSummary: '4 pass · 0 warning · 0 critical',
      proofApprovalStatus: 'approved',
      proofQuality: 'print',
      placementSummary: 'full-front placement · T-shirt front',
      jobRevision: source.revision,
    },
  }];

  const archive = await exportPortableJob(source);
  const imported = await importPortableJob(archive);

  assert.deepEqual(imported.exports[0].metadata, source.exports[0].metadata);
  assert.equal(await imported.exports[0].blob.text(), 'zip');
});

test('migrates package manifest verification metadata only when boolean', () => {
  const verified = migrateStudioJob({
    ...createStudioJob('Verified export metadata'),
    exports: [{
      id: 'export-verified',
      filename: 'verified.zip',
      format: 'ZIP',
      timestamp: 1,
      blob: new Blob(['verified']),
      metadata: {
        kind: 'production-package',
        manifestVerified: true,
      },
    }],
  });
  const malformed = migrateStudioJob({
    ...createStudioJob('Malformed manifest flag'),
    exports: [{
      id: 'export-bad-manifest',
      filename: 'bad.zip',
      format: 'ZIP',
      timestamp: 1,
      blob: new Blob(['bad']),
      metadata: {
        kind: 'production-package',
        manifestVerified: 'yes',
      },
    }],
  });

  assert.equal(verified.exports[0].metadata?.manifestVerified, true);
  assert.equal(malformed.exports[0].metadata?.manifestVerified, undefined);
});

test('round-trips blocked production package attempt metadata', async () => {
  const source = createStudioJob('Blocked package metadata');
  source.exports = [{
    id: 'blocked-package',
    filename: 'blocked-production-package.txt',
    format: 'TXT',
    timestamp: 1_700_000_000_001,
    blob: new Blob(['blocked']),
    metadata: {
      kind: 'production-package-blocked',
      readinessStatus: 'blocked',
      readinessSummary: 'Production package export was blocked.',
      blockedReason: 'Customer proof must be approved before production handoff.',
      preflightSummary: '3 pass · 0 warning · 0 critical',
      proofApprovalStatus: 'not-requested',
      placementSummary: 'full-front placement · T-shirt front',
      jobRevision: source.revision,
    },
  }];

  const archive = await exportPortableJob(source);
  const imported = await importPortableJob(archive);

  assert.deepEqual(imported.exports[0].metadata, source.exports[0].metadata);
  assert.equal(await imported.exports[0].blob.text(), 'blocked');
});

test('drops malformed export metadata during migration', () => {
  const migrated = migrateStudioJob({
    ...createStudioJob('Malformed export metadata'),
    exports: [{
      id: 'export-bad',
      filename: 'bad.zip',
      format: 'ZIP',
      timestamp: 1,
      blob: new Blob(['bad']),
      metadata: {
        kind: 'public-link',
        readinessStatus: 'published',
        packageContents: ['Manifest'],
      },
    }],
  });

  assert.equal(migrated.exports[0].metadata, undefined);
});

test('migrates a malformed portable production profile to Standard DTG', async () => {
  const source = createStudioJob('Portable malformed', customProfile());
  const archive = await exportPortableJob(source);
  const zip = await JSZip.loadAsync(await archive.arrayBuffer());
  const manifestFile = zip.file('manifest.json');
  assert.ok(manifestFile);
  const manifest = JSON.parse(await manifestFile.async('string')) as {
    job: Record<string, unknown>;
  };
  manifest.job.productionProfile = {
    profileId: source.productionProfile.profileId,
    profileRevision: source.productionProfile.profileRevision,
    snapshot: {
      ...source.productionProfile.snapshot,
      thresholds: null,
    },
  };
  zip.file('manifest.json', JSON.stringify(manifest));
  const malformedArchive = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/x-inkmaster-job',
  });

  const imported = await importPortableJob(malformedArchive);

  assert.equal(imported.metadata.name, 'Portable malformed');
  assert.equal(imported.productionProfile.snapshot.name, 'Standard DTG');
  assert.equal(imported.productionProfile.snapshot.method, 'DTG');
});

test('rejects malformed portable job archives', async () => {
  await assert.rejects(
    () => importPortableJob(new Blob(['not a zip'])),
    /Invalid Ink Master job file/,
  );
});

test('archives jobs without removing them from local storage', async () => {
  const job = createStudioJob(`Archive ${Date.now()}`);
  await saveJob(job);

  const archived = await archiveJob(job.id);

  assert.ok(archived.archivedAt);
  assert.equal((await getJob(job.id))?.archivedAt, archived.archivedAt);
  assert.equal((await listJobs()).some((candidate) => candidate.id === job.id), false);
  assert.equal((await listJobs(true)).some((candidate) => candidate.id === job.id), true);
});
