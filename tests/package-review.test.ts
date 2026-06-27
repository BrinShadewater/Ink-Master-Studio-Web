import assert from 'node:assert/strict';
import test from 'node:test';

import { createStudioJob } from '../services/jobModel';
import { buildProductionPackageReview } from '../services/packageReview';
import { PreflightFinding } from '../types';

const warning: PreflightFinding = {
  id: 'background',
  severity: 'warning',
  title: 'Solid edge background may print',
  message: 'A solid background was detected.',
  action: 'Confirm or remove the background.',
};

const critical: PreflightFinding = {
  id: 'resolution',
  severity: 'critical',
  title: 'Resolution is below production minimum',
  message: 'The requested print is too large.',
  action: 'Reduce print size.',
};

test('previews the final package filename and included production files', () => {
  const job = createStudioJob('River / Street');
  job.metadata.customerName = 'Alex & Co.';
  job.revision = 4;
  job.packageOptions.includeUnderbase = true;
  job.packageOptions.selectedMockupIndices = [0, 2];

  const review = buildProductionPackageReview(job, [], false, true, 'current');

  assert.equal(review.packageFilename, 'river-street_alex-co_tshirt_full-front_v4_production.zip');
  assert.equal(review.canExport, true);
  assert.equal(review.gateStatus, 'ready');
  assert.equal(review.exportAction.label, 'Download production package');
  assert.equal(review.exportAction.disabledReason, null);
  assert.equal(review.handoffReadiness.status, 'attention');
  assert.match(review.handoffReadiness.summary, /operator review/);
  assert.equal(
    review.handoffReadiness.checks.find((entry) => entry.id === 'proof')?.status,
    'attention',
  );
  assert.deepEqual(
    review.items.map((entry) => [entry.id, entry.status, entry.filename]),
    [
      ['print-master', 'ready', 'print-master.png'],
      ['production-pdf', 'ready', 'production-spec.pdf'],
      ['mockups', 'ready', 'mockups/*.png'],
      ['underbase', 'ready', 'white-underbase.png'],
      ['summary', 'ready', 'production-summary.txt'],
      ['manifest', 'ready', 'job-manifest.json'],
    ],
  );
  assert.match(
    review.items.find((entry) => entry.id === 'mockups')?.note ?? '',
    /Red, Heather/,
  );
  assert.match(
    review.items.find((entry) => entry.id === 'production-pdf')?.note ?? '',
    /T-shirt front/,
  );
});

test('blocks package export until artwork has been processed', () => {
  const job = createStudioJob('Unprocessed package');

  const review = buildProductionPackageReview(job, [], false, false, 'current');

  assert.equal(review.canExport, false);
  assert.equal(review.gateStatus, 'blocked');
  assert.equal(review.exportAction.label, 'Production package not ready');
  assert.match(review.exportAction.disabledReason ?? '', /Process the artwork/);
  assert.match(review.exportAction.nextStep, /Artwork processed/);
  assert.equal(review.handoffReadiness.status, 'blocked');
  assert.match(review.blockingReasons.join(' '), /Process the artwork/);
  assert.equal(review.items.find((entry) => entry.id === 'print-master')?.status, 'missing');
});

test('reflects per-job package content toggles in the review', () => {
  const job = createStudioJob('Minimal package');
  job.packageOptions.includePrintMaster = false;
  job.packageOptions.includeProductionPdf = false;
  job.packageOptions.includeMockups = false;
  job.packageOptions.includeUnderbase = false;
  job.packageOptions.includeSummary = true;
  job.packageOptions.includeManifest = true;

  const review = buildProductionPackageReview(job, [], false, true, 'current');

  assert.deepEqual(
    review.items.map((entry) => [entry.id, entry.status]),
    [
      ['print-master', 'excluded'],
      ['production-pdf', 'excluded'],
      ['mockups', 'excluded'],
      ['underbase', 'excluded'],
      ['summary', 'ready'],
      ['manifest', 'ready'],
    ],
  );
  assert.equal(review.handoffReadiness.checks.find((entry) => entry.id === 'package-assets')?.status, 'ready');
});

test('requires warning acknowledgement before package export', () => {
  const job = createStudioJob('Warning package');

  const review = buildProductionPackageReview(job, [warning], false, true, 'current');
  const acknowledged = buildProductionPackageReview(job, [warning], true, true, 'current');

  assert.equal(review.canExport, false);
  assert.equal(review.gateStatus, 'warning-acknowledgement-required');
  assert.match(review.exportAction.disabledReason ?? '', /require acknowledgement/);
  assert.match(review.exportAction.nextStep, /Preflight gate/);
  assert.equal(review.handoffReadiness.checks.find((entry) => entry.id === 'preflight')?.status, 'attention');
  assert.match(review.warnings.join(' '), /require acknowledgement/);
  assert.equal(acknowledged.canExport, true);
});

test('blocks package export for critical preflight findings', () => {
  const job = createStudioJob('Critical package');

  const review = buildProductionPackageReview(job, [critical], true, true, 'current');

  assert.equal(review.canExport, false);
  assert.equal(review.gateStatus, 'blocked');
  assert.match(review.exportAction.disabledReason ?? '', /critical preflight/);
  assert.equal(review.handoffReadiness.status, 'blocked');
  assert.match(review.blockingReasons.join(' '), /critical preflight/);
});

test('blocks handoff when proof changes are requested', () => {
  const job = createStudioJob('Proof changes package');
  job.proofApproval = {
    ...job.proofApproval,
    status: 'changes-requested',
    notes: 'Move artwork down.',
  };

  const review = buildProductionPackageReview(job, [], false, true, 'current');

  assert.equal(review.canExport, false);
  assert.equal(review.gateStatus, 'blocked');
  assert.match(review.exportAction.disabledReason ?? '', /proof changes/);
  assert.match(review.exportAction.nextStep, /Customer proof/);
  assert.equal(review.handoffReadiness.status, 'blocked');
  assert.equal(review.handoffReadiness.checks.find((entry) => entry.id === 'proof')?.status, 'blocked');
  assert.match(review.blockingReasons.join(' '), /requested proof changes/);
});

test('marks handoff ready when proof is approved and checks pass', () => {
  const job = createStudioJob('Approved package');
  job.proofApproval = {
    ...job.proofApproval,
    status: 'approved',
    respondedAt: Date.UTC(2026, 0, 2, 4, 5, 6),
    approverName: 'Taylor',
  };

  const review = buildProductionPackageReview(job, [], false, true, 'current');

  assert.equal(review.canExport, true);
  assert.equal(review.exportAction.disabledReason, null);
  assert.equal(review.exportAction.nextStep, 'Ready to download the production package.');
  assert.equal(review.handoffReadiness.status, 'ready');
  assert.equal(review.handoffReadiness.checks.find((entry) => entry.id === 'proof')?.status, 'ready');
});

test('surfaces profile snapshot provenance when source profile changed', () => {
  const job = createStudioJob('Profile package');

  const review = buildProductionPackageReview(job, [], false, true, 'update-available');

  assert.equal(review.profile.name, 'Standard DTG');
  assert.equal(review.profile.revision, 1);
  assert.equal(review.profile.status, 'update-available');
  assert.equal(review.handoffReadiness.checks.find((entry) => entry.id === 'profile')?.status, 'attention');
  assert.match(review.warnings.join(' '), /newer revision/);
});
