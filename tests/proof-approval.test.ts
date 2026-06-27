import assert from 'node:assert/strict';
import test from 'node:test';

import { createStudioJob } from '../services/jobModel';
import {
  buildProofApprovalAuditLine,
  createProofApprovalState,
  describeProofApprovalNextStep,
  formatProofApprovalEvent,
  getCloudApprovalCapability,
  markProofSent,
  recordProofResponse,
  updateProofApprovalState,
} from '../services/proofApproval';

test('creates local-only proof approval state by default', () => {
  const approval = createProofApprovalState();

  assert.equal(approval.status, 'not-requested');
  assert.equal(approval.requestedAt, null);
  assert.equal(approval.respondedAt, null);
  assert.equal(approval.shareUrl, null);
  assert.equal(approval.cloudSyncStatus, 'local-only');
  assert.deepEqual(approval.events, []);
});

test('marks a proof as sent without creating a share URL', () => {
  const approval = markProofSent(createProofApprovalState(), 1_700_000_000_000);

  assert.equal(approval.status, 'sent');
  assert.equal(approval.requestedAt, 1_700_000_000_000);
  assert.equal(approval.respondedAt, null);
  assert.equal(approval.shareUrl, null);
  assert.equal(approval.cloudSyncStatus, 'local-only');
  assert.equal(approval.events.length, 1);
  assert.equal(approval.events[0].status, 'sent');
  assert.match(approval.events[0].note, /sent/i);
});

test('records approved and changes-requested responses locally', () => {
  const sent = updateProofApprovalState(
    markProofSent(createProofApprovalState(), 1_700_000_000_000),
    { approverName: 'Taylor' },
  );
  const approved = recordProofResponse(sent, 'approved', 1_700_000_100_000);
  const changes = recordProofResponse(sent, 'changes-requested', 1_700_000_200_000);
  const approvedEvent = approved.events[approved.events.length - 1];
  const changesEvent = changes.events[changes.events.length - 1];

  assert.equal(approved.status, 'approved');
  assert.equal(approved.respondedAt, 1_700_000_100_000);
  assert.equal(approvedEvent.status, 'approved');
  assert.equal(approvedEvent.actor, 'Taylor');
  assert.equal(changes.status, 'changes-requested');
  assert.equal(changes.respondedAt, 1_700_000_200_000);
  assert.equal(changesEvent.status, 'changes-requested');
});

test('reports that cloud proof sharing is intentionally not configured', () => {
  const capability = getCloudApprovalCapability();

  assert.equal(capability.status, 'not-configured');
  assert.equal(capability.supportsShareLinks, false);
  assert.match(capability.message, /not configured/i);
});

test('builds an approval audit line for package and proof handoff', () => {
  const job = createStudioJob('Audit line');
  job.proofApproval = recordProofResponse(
    updateProofApprovalState(
      markProofSent(job.proofApproval, Date.UTC(2026, 0, 2, 3, 4, 5)),
      { approverName: 'Taylor' },
    ),
    'approved',
    Date.UTC(2026, 0, 2, 4, 5, 6),
  );

  const audit = buildProofApprovalAuditLine(job);

  assert.match(audit, /Approved by Taylor/);
  assert.match(audit, /2026-01-02T03:04:05\.000Z/);
  assert.match(audit, /local-only/);
});

test('describes approval next steps and formats timeline events', () => {
  const sent = markProofSent(createProofApprovalState(), Date.UTC(2026, 0, 2, 3, 4, 5));
  const event = sent.events[0];

  assert.equal(describeProofApprovalNextStep(sent), 'Waiting for customer response.');
  assert.match(formatProofApprovalEvent(event), /2026-01-02T03:04:05\.000Z/);
  assert.match(formatProofApprovalEvent(event), /Proof exported or sent/);
  assert.equal(
    describeProofApprovalNextStep(recordProofResponse(sent, 'changes-requested', Date.UTC(2026, 0, 2, 4, 5, 6))),
    'Revise artwork or placement, then export a new proof.',
  );
});
