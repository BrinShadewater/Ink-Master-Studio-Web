import assert from 'node:assert/strict';
import test from 'node:test';

import { createStudioJob } from '../services/jobModel';
import {
  buildProofApprovalAuditLine,
  createProofApprovalState,
  describeProofApprovalNextStep,
  formatProofApprovalEvent,
  getCloudApprovalCapability,
  getLatestProofFreshness,
  markProofExported,
  markProofSent,
  recordProofResponse,
  summarizeProofApproval,
  updateProofApprovalState,
} from '../services/proofApproval';
import { ExportHistoryEntry } from '../types';

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

test('marks proof export activity without duplicate consecutive export events', () => {
  const exported = markProofExported(createProofApprovalState(), 'email', 1_700_000_000_000);
  const duplicate = markProofExported(exported, 'email', 1_700_000_100_000);
  const printExport = markProofExported(duplicate, 'print', 1_700_000_200_000);

  assert.equal(exported.status, 'sent');
  assert.equal(exported.requestedAt, 1_700_000_000_000);
  assert.equal(exported.respondedAt, null);
  assert.equal(exported.events.length, 1);
  assert.match(exported.events[0].note, /Email-friendly/);
  assert.equal(duplicate.events.length, 1);
  assert.equal(printExport.events.length, 2);
  assert.match(printExport.events[1].note, /Print-ready/);
});

test('proof export reopens changes-requested proofs but preserves approved proofs', () => {
  const changes = recordProofResponse(
    markProofSent(createProofApprovalState(), 1_700_000_000_000),
    'changes-requested',
    1_700_000_100_000,
  );
  const revised = markProofExported(changes, 'email', 1_700_000_200_000);
  const approved = recordProofResponse(markProofSent(createProofApprovalState()), 'approved', 1_700_000_300_000);
  const stillApproved = markProofExported(approved, 'print', 1_700_000_400_000);

  assert.equal(revised.status, 'sent');
  assert.equal(revised.requestedAt, 1_700_000_200_000);
  assert.equal(revised.respondedAt, null);
  assert.equal(stillApproved.status, 'approved');
  assert.equal(stillApproved.events.length, approved.events.length);
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

test('summarizes proof approval state for operator review', () => {
  const notRequested = summarizeProofApproval(createProofApprovalState());
  assert.equal(notRequested.tone, 'neutral');
  assert.equal(notRequested.headline, 'Proof has not been sent');
  assert.equal(notRequested.sentLabel, null);

  const sent = summarizeProofApproval(
    updateProofApprovalState(
      markProofSent(createProofApprovalState(), Date.UTC(2026, 0, 2, 3, 4, 5)),
      { approverEmail: 'buyer@example.com' },
    ),
  );
  assert.equal(sent.tone, 'attention');
  assert.match(sent.sentLabel ?? '', /2026-01-02T03:04:05\.000Z/);
  assert.equal(sent.approverLabel, 'buyer@example.com');

  const approved = summarizeProofApproval(
    recordProofResponse(
      updateProofApprovalState(markProofSent(createProofApprovalState()), { approverName: 'Taylor' }),
      'approved',
      Date.UTC(2026, 0, 2, 4, 5, 6),
    ),
  );
  assert.equal(approved.tone, 'ready');
  assert.equal(approved.headline, 'Proof approved for production');
  assert.match(approved.responseLabel ?? '', /Approved 2026-01-02T04:05:06\.000Z/);
});

test('compares latest proof export against the current job revision', () => {
  const latestProof: ExportHistoryEntry = {
    id: 'proof-2',
    filename: 'job-proof-email.pdf',
    format: 'PDF',
    timestamp: 2,
    blob: new Blob(['proof-2']),
    url: 'blob:proof-2',
    metadata: {
      kind: 'customer-proof',
      proofQuality: 'email',
      jobRevision: 4,
    },
  };
  const olderProof: ExportHistoryEntry = {
    ...latestProof,
    id: 'proof-1',
    filename: 'job-proof-print.pdf',
    timestamp: 1,
    url: 'blob:proof-1',
    metadata: {
      kind: 'customer-proof',
      proofQuality: 'print',
      jobRevision: 3,
    },
  };

  const current = getLatestProofFreshness([latestProof, olderProof], 4);
  assert.equal(current?.stale, false);
  assert.match(current?.message ?? '', /current job revision 4/i);
  assert.match(current?.latestProofLabel ?? '', /email-friendly/);

  const stale = getLatestProofFreshness([latestProof, olderProof], 5);
  assert.equal(stale?.stale, true);
  assert.match(stale?.message ?? '', /proof revision 4/i);

  const legacy = getLatestProofFreshness([{ ...latestProof, metadata: { kind: 'customer-proof' } }], 5);
  assert.equal(legacy?.stale, false);
  assert.match(legacy?.message ?? '', /could not compare/i);

  assert.equal(getLatestProofFreshness([], 5), null);
});
