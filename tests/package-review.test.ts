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
  assert.match(review.blockingReasons.join(' '), /Process the artwork/);
  assert.equal(review.items.find((entry) => entry.id === 'print-master')?.status, 'missing');
});

test('requires warning acknowledgement before package export', () => {
  const job = createStudioJob('Warning package');

  const review = buildProductionPackageReview(job, [warning], false, true, 'current');
  const acknowledged = buildProductionPackageReview(job, [warning], true, true, 'current');

  assert.equal(review.canExport, false);
  assert.equal(review.gateStatus, 'warning-acknowledgement-required');
  assert.match(review.warnings.join(' '), /require acknowledgement/);
  assert.equal(acknowledged.canExport, true);
});

test('blocks package export for critical preflight findings', () => {
  const job = createStudioJob('Critical package');

  const review = buildProductionPackageReview(job, [critical], true, true, 'current');

  assert.equal(review.canExport, false);
  assert.equal(review.gateStatus, 'blocked');
  assert.match(review.blockingReasons.join(' '), /critical preflight/);
});

test('surfaces profile snapshot provenance when source profile changed', () => {
  const job = createStudioJob('Profile package');

  const review = buildProductionPackageReview(job, [], false, true, 'update-available');

  assert.equal(review.profile.name, 'Standard DTG');
  assert.equal(review.profile.revision, 1);
  assert.equal(review.profile.status, 'update-available');
  assert.match(review.warnings.join(' '), /newer revision/);
});
