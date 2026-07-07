import { ExportHistoryEntry, ProofApprovalEvent, ProofApprovalState, ProofApprovalStatus, StudioJob } from '../types';

export interface CloudApprovalCapability {
  status: 'not-configured';
  message: string;
  supportsShareLinks: false;
}

export interface ProofApprovalSummary {
  status: ProofApprovalStatus;
  label: string;
  tone: 'neutral' | 'attention' | 'ready' | 'blocked';
  headline: string;
  nextStep: string;
  sentLabel: string | null;
  responseLabel: string | null;
  eventCount: number;
  approverLabel: string;
}

export interface ProofFreshnessSummary {
  stale: boolean;
  latestProofLabel: string | null;
  message: string;
  comparable: boolean;
  currentJobRevision: number | null;
  latestProofRevision: number | null;
  latestProofQuality: 'print' | 'email' | null;
  latestProofFilename: string | null;
  latestProofExportedAt: number | null;
}

export interface ProofSentEligibilityInput {
  hasProcessedResult: boolean;
  canExport: boolean;
  proofFreshness: ProofFreshnessSummary | null | undefined;
  proofAlreadySent: boolean;
}

export const CLOUD_APPROVAL_MESSAGE = 'Cloud proof sharing is not configured. Export local proofs for now.';

export const createProofApprovalState = (): ProofApprovalState => ({
  status: 'not-requested',
  requestedAt: null,
  respondedAt: null,
  approverName: '',
  approverEmail: '',
  notes: '',
  shareUrl: null,
  cloudSyncStatus: 'local-only',
  events: [],
});

const createProofApprovalEvent = (
  status: ProofApprovalStatus,
  timestamp: number,
  sequence: number,
  actor: string,
  note: string,
): ProofApprovalEvent => ({
  id: `approval_${timestamp}_${sequence}_${status}`,
  timestamp,
  status,
  actor,
  note,
});

const approvalActor = (state: ProofApprovalState): string =>
  state.approverName.trim() || state.approverEmail.trim() || 'Shop operator';

const appendEvent = (
  current: ProofApprovalState,
  status: ProofApprovalStatus,
  timestamp: number,
  note: string,
): ProofApprovalEvent[] => [
  ...current.events,
  createProofApprovalEvent(status, timestamp, current.events.length + 1, approvalActor(current), note),
];

export const getCloudApprovalCapability = (): CloudApprovalCapability => ({
  status: 'not-configured',
  message: CLOUD_APPROVAL_MESSAGE,
  supportsShareLinks: false,
});

export const canMarkCurrentProofSent = ({
  hasProcessedResult,
  canExport,
  proofFreshness,
  proofAlreadySent,
}: ProofSentEligibilityInput): boolean => (
  hasProcessedResult
  && canExport
  && !proofAlreadySent
  && proofFreshness !== null
  && proofFreshness !== undefined
  && proofFreshness.comparable
  && !proofFreshness.stale
);

export const updateProofApprovalState = (
  current: ProofApprovalState,
  patch: Partial<ProofApprovalState>,
): ProofApprovalState => ({
  ...current,
  ...patch,
  shareUrl: null,
  cloudSyncStatus: 'local-only',
});

export const markProofSent = (
  current: ProofApprovalState,
  timestamp = Date.now(),
): ProofApprovalState => ({
  ...current,
  status: 'sent',
  requestedAt: timestamp,
  respondedAt: null,
  shareUrl: null,
  cloudSyncStatus: 'local-only',
  events: appendEvent(current, 'sent', timestamp, 'Proof exported or sent for customer review.'),
});

export const markProofExported = (
  current: ProofApprovalState,
  quality: 'print' | 'email',
  timestamp = Date.now(),
): ProofApprovalState => {
  if (current.status === 'approved') return current;

  const note = quality === 'print'
    ? 'Print-ready proof PDF exported for customer review.'
    : 'Email-friendly proof PDF exported for customer review.';
  const lastEvent = current.events[current.events.length - 1];
  if (current.status === 'sent' && lastEvent?.status === 'sent' && lastEvent.note === note) {
    return current;
  }

  return {
    ...current,
    status: 'sent',
    requestedAt: current.status === 'sent' && current.requestedAt ? current.requestedAt : timestamp,
    respondedAt: null,
    shareUrl: null,
    cloudSyncStatus: 'local-only',
    events: appendEvent(current, 'sent', timestamp, note),
  };
};

export const recordProofResponse = (
  current: ProofApprovalState,
  status: Extract<ProofApprovalStatus, 'approved' | 'changes-requested'>,
  timestamp = Date.now(),
): ProofApprovalState => ({
  ...current,
  status,
  respondedAt: timestamp,
  requestedAt: current.requestedAt ?? timestamp,
  shareUrl: null,
  cloudSyncStatus: 'local-only',
  events: appendEvent(
    current,
    status,
    timestamp,
    status === 'approved'
      ? 'Customer approved this proof for production.'
      : current.notes.trim() || 'Customer requested changes before production.',
  ),
});

export const describeProofApprovalStatus = (state: ProofApprovalState): string => {
  const approver = state.approverName.trim() || state.approverEmail.trim();
  const suffix = approver ? ` by ${approver}` : '';
  if (state.status === 'approved') return `Approved${suffix}`;
  if (state.status === 'changes-requested') return `Changes requested${suffix}`;
  if (state.status === 'sent') return 'Proof sent, awaiting response';
  return 'Not requested';
};

export const buildProofApprovalAuditLine = (job: StudioJob): string => {
  const state = job.proofApproval;
  const requested = state.requestedAt ? ` · sent ${new Date(state.requestedAt).toISOString()}` : '';
  const responded = state.respondedAt ? ` · response ${new Date(state.respondedAt).toISOString()}` : '';
  const channel = state.shareUrl ? ` · ${state.shareUrl}` : ' · local-only';
  return `${describeProofApprovalStatus(state)}${requested}${responded}${channel}`;
};

export const describeProofApprovalNextStep = (state: ProofApprovalState): string => {
  if (state.status === 'approved') return 'Ready for production handoff.';
  if (state.status === 'changes-requested') return 'Revise artwork or placement, then export a new proof.';
  if (state.status === 'sent') return 'Waiting for customer response.';
  return 'Export a proof, send it to the customer, then mark it sent.';
};

const formatProofTimestamp = (timestamp: number | null, prefix: string): string | null =>
  timestamp ? `${prefix} ${new Date(timestamp).toISOString()}` : null;

export const summarizeProofApproval = (state: ProofApprovalState): ProofApprovalSummary => {
  const approver = state.approverName.trim() || state.approverEmail.trim();
  const label = describeProofApprovalStatus(state);
  const nextStep = describeProofApprovalNextStep(state);

  if (state.status === 'approved') {
    return {
      status: state.status,
      label,
      tone: 'ready',
      headline: 'Proof approved for production',
      nextStep,
      sentLabel: formatProofTimestamp(state.requestedAt, 'Sent'),
      responseLabel: formatProofTimestamp(state.respondedAt, 'Approved'),
      eventCount: state.events.length,
      approverLabel: approver || 'Approver not named',
    };
  }

  if (state.status === 'changes-requested') {
    return {
      status: state.status,
      label,
      tone: 'blocked',
      headline: 'Customer requested proof changes',
      nextStep,
      sentLabel: formatProofTimestamp(state.requestedAt, 'Sent'),
      responseLabel: formatProofTimestamp(state.respondedAt, 'Changes requested'),
      eventCount: state.events.length,
      approverLabel: approver || 'Approver not named',
    };
  }

  if (state.status === 'sent') {
    return {
      status: state.status,
      label,
      tone: 'attention',
      headline: 'Proof is waiting on customer response',
      nextStep,
      sentLabel: formatProofTimestamp(state.requestedAt, 'Sent'),
      responseLabel: null,
      eventCount: state.events.length,
      approverLabel: approver || 'Approver not named',
    };
  }

  return {
    status: state.status,
    label,
    tone: 'neutral',
    headline: 'Proof has not been sent',
    nextStep,
    sentLabel: null,
    responseLabel: null,
    eventCount: state.events.length,
    approverLabel: approver || 'Approver not named',
  };
};

export const formatProofApprovalEvent = (event: ProofApprovalEvent): string =>
  `${new Date(event.timestamp).toISOString()} · ${describeProofApprovalStatus({
    ...createProofApprovalState(),
    status: event.status,
    approverName: event.actor,
  })} · ${event.note}`;

const proofQualityLabel = (quality: NonNullable<ExportHistoryEntry['metadata']>['proofQuality']) =>
  quality === 'print' ? 'print-ready proof' : 'email-friendly proof';

type ProofFreshnessExportRecord = {
  filename?: string;
  timestamp?: number;
  metadata?: ExportHistoryEntry['metadata'];
};

export const getLatestProofFreshness = (
  exportHistory: ProofFreshnessExportRecord[],
  currentJobRevision: number | null,
): ProofFreshnessSummary | null => {
  const latestProof = exportHistory.find((entry) => entry.metadata?.kind === 'customer-proof');
  if (!latestProof?.metadata) return null;

  const proofRevision = latestProof.metadata.jobRevision;
  const quality = latestProof.metadata.proofQuality;
  const latestProofLabel = quality
    ? `Latest proof export: ${proofQualityLabel(quality)}`
    : 'Latest proof export recorded.';
  const canCompare = typeof proofRevision === 'number' && typeof currentJobRevision === 'number';

  if (!canCompare) {
    return {
      stale: false,
      latestProofLabel,
      message: 'Ink Master could not compare this proof against the current job revision.',
      comparable: false,
      currentJobRevision,
      latestProofRevision: typeof proofRevision === 'number' ? proofRevision : null,
      latestProofQuality: quality ?? null,
      latestProofFilename: latestProof.filename ?? null,
      latestProofExportedAt: typeof latestProof.timestamp === 'number' ? latestProof.timestamp : null,
    };
  }

  if (proofRevision !== currentJobRevision) {
    return {
      stale: true,
      latestProofLabel,
      message: `Current job revision ${currentJobRevision} has changed since proof revision ${proofRevision}. Export a fresh proof before approval.`,
      comparable: true,
      currentJobRevision,
      latestProofRevision: proofRevision,
      latestProofQuality: quality ?? null,
      latestProofFilename: latestProof.filename ?? null,
      latestProofExportedAt: typeof latestProof.timestamp === 'number' ? latestProof.timestamp : null,
    };
  }

  return {
    stale: false,
    latestProofLabel,
    message: `Latest proof was exported from current job revision ${currentJobRevision}.`,
    comparable: true,
    currentJobRevision,
    latestProofRevision: proofRevision,
    latestProofQuality: quality ?? null,
    latestProofFilename: latestProof.filename ?? null,
    latestProofExportedAt: typeof latestProof.timestamp === 'number' ? latestProof.timestamp : null,
  };
};
