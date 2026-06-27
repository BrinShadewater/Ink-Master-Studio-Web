import { ProofApprovalState, ProofApprovalStatus, StudioJob } from '../types';

export interface CloudApprovalCapability {
  status: 'not-configured';
  message: string;
  supportsShareLinks: false;
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
});

export const getCloudApprovalCapability = (): CloudApprovalCapability => ({
  status: 'not-configured',
  message: CLOUD_APPROVAL_MESSAGE,
  supportsShareLinks: false,
});

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
});

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
