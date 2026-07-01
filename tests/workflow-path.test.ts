import assert from 'node:assert/strict';
import test from 'node:test';

import { buildProductionPackageReview } from '../services/packageReview';
import { buildProductionWorkflowPath } from '../services/workflowPath';
import { createStudioJob } from '../services/jobModel';
import { PreflightFinding, StoredJobExport } from '../types';

const warning: PreflightFinding = {
  id: 'background',
  severity: 'warning',
  title: 'Solid edge background may print',
  message: 'A solid background was detected.',
  action: 'Confirm or remove the background.',
};

const criticalPlacement: PreflightFinding = {
  id: 'placement-area',
  severity: 'critical',
  title: 'Placement exceeds printable area',
  message: 'The placement is outside the printable area.',
  action: 'Reduce dimensions or choose another placement.',
};

const proofExport = (jobRevision: number): StoredJobExport => ({
  id: `proof-${jobRevision}`,
  filename: `proof-v${jobRevision}.pdf`,
  format: 'PDF',
  timestamp: Date.UTC(2026, 0, 2, 3, 4, 5),
  blob: new Blob([`proof-${jobRevision}`]),
  metadata: {
    kind: 'customer-proof',
    proofQuality: 'email',
    jobRevision,
  },
});

test('workflow path starts at job processing when artwork is unprocessed', () => {
  const path = buildProductionWorkflowPath({
    hasArtwork: true,
    hasProcessedResult: false,
    preflightFindings: [],
    preflightAcknowledged: false,
    proofApprovalStatus: 'not-requested',
    proofFreshness: null,
    packageReview: null,
  });

  assert.deepEqual(path.map((step) => [step.id, step.status]), [
    ['job', 'current'],
    ['preflight', 'pending'],
    ['placement', 'pending'],
    ['proof', 'pending'],
    ['package', 'pending'],
  ]);
});

test('workflow path highlights preflight and placement blockers', () => {
  const path = buildProductionWorkflowPath({
    hasArtwork: true,
    hasProcessedResult: true,
    preflightFindings: [warning, criticalPlacement],
    preflightAcknowledged: false,
    proofApprovalStatus: 'not-requested',
    proofFreshness: null,
    packageReview: null,
  });

  assert.equal(path.find((step) => step.id === 'preflight')?.status, 'blocked');
  assert.equal(path.find((step) => step.id === 'placement')?.status, 'blocked');
  assert.match(path.find((step) => step.id === 'placement')?.note ?? '', /outside the printable area/);
});

test('workflow path moves to proof review before package handoff', () => {
  const job = createStudioJob('Proof needed');
  const packageReview = buildProductionPackageReview(job, [], false, true, 'current');

  const path = buildProductionWorkflowPath({
    hasArtwork: true,
    hasProcessedResult: true,
    preflightFindings: [],
    preflightAcknowledged: false,
    proofApprovalStatus: 'not-requested',
    proofFreshness: null,
    packageReview,
  });

  assert.deepEqual(path.map((step) => [step.id, step.status]), [
    ['job', 'done'],
    ['preflight', 'done'],
    ['placement', 'done'],
    ['proof', 'current'],
    ['package', 'review'],
  ]);
});

test('workflow path marks stale approved proof as blocked', () => {
  const job = createStudioJob('Stale proof');
  job.revision = 4;
  job.exports = [proofExport(3)];
  job.proofApproval = {
    ...job.proofApproval,
    status: 'approved',
    approverName: 'Taylor',
  };
  const packageReview = buildProductionPackageReview(job, [], false, true, 'current');

  const path = buildProductionWorkflowPath({
    hasArtwork: true,
    hasProcessedResult: true,
    preflightFindings: [],
    preflightAcknowledged: false,
    proofApprovalStatus: 'approved',
    proofFreshness: {
      stale: true,
      latestProofLabel: 'Latest proof export: email-friendly proof',
      message: 'Current job revision 4 has changed since proof revision 3. Export a fresh proof before approval.',
      comparable: true,
      currentJobRevision: 4,
      latestProofRevision: 3,
      latestProofQuality: 'email',
      latestProofFilename: 'proof-v3.pdf',
      latestProofExportedAt: Date.UTC(2026, 0, 2, 3, 4, 5),
    },
    packageReview,
  });

  assert.equal(path.find((step) => step.id === 'proof')?.status, 'blocked');
  assert.equal(path.find((step) => step.id === 'package')?.status, 'blocked');
});

test('workflow path points to package when proof is approved and ready', () => {
  const job = createStudioJob('Ready package');
  job.proofApproval = {
    ...job.proofApproval,
    status: 'approved',
    approverName: 'Taylor',
  };
  const packageReview = buildProductionPackageReview(job, [], false, true, 'current');

  const path = buildProductionWorkflowPath({
    hasArtwork: true,
    hasProcessedResult: true,
    preflightFindings: [],
    preflightAcknowledged: false,
    proofApprovalStatus: 'approved',
    proofFreshness: null,
    packageReview,
  });

  assert.deepEqual(path.map((step) => [step.id, step.status]), [
    ['job', 'done'],
    ['preflight', 'done'],
    ['placement', 'done'],
    ['proof', 'done'],
    ['package', 'current'],
  ]);
});
