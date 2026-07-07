import React from 'react';
import { ProofApprovalState, ProofBranding } from '../types';
import {
  CloudApprovalCapability,
  canMarkCurrentProofSent,
  describeProofApprovalNextStep,
  describeProofApprovalStatus,
  formatProofApprovalEvent,
  ProofFreshnessSummary,
  summarizeProofApproval,
  updateProofApprovalState,
} from '../services/proofApproval';

interface CustomerProofBuilderProps {
  branding: ProofBranding;
  approval: ProofApprovalState;
  proofFreshness?: ProofFreshnessSummary | null;
  cloudCapability: CloudApprovalCapability;
  printFilename: string;
  emailFilename: string;
  mockupCount: number;
  mockupSummary: string;
  canExport: boolean;
  hasProcessedResult: boolean;
  onChange: (branding: ProofBranding) => void;
  onApprovalChange: (approval: ProofApprovalState) => void;
  onMarkProofSent: () => void;
  onRecordProofResponse: (status: 'approved' | 'changes-requested') => void;
  onDownloadProof: (quality: 'print' | 'email') => void;
}

const updateField = <K extends keyof ProofBranding>(
  branding: ProofBranding,
  key: K,
  value: ProofBranding[K],
): ProofBranding => ({ ...branding, [key]: value });

const recentEvents = (approval: ProofApprovalState) =>
  approval.events.slice(-3).reverse();

const toneClasses = {
  neutral: 'border-slate-700 bg-slate-900/70 text-slate-300',
  attention: 'border-amber-500/40 bg-amber-950/30 text-amber-200',
  ready: 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200',
  blocked: 'border-rose-500/40 bg-rose-950/30 text-rose-200',
};

const workflowStepClasses = {
  ready: 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200',
  current: 'border-indigo-500/40 bg-indigo-950/30 text-indigo-200',
  blocked: 'border-slate-700 bg-slate-950/50 text-slate-500',
};

export const CustomerProofBuilder: React.FC<CustomerProofBuilderProps> = ({
  branding,
  approval,
  proofFreshness,
  cloudCapability,
  printFilename,
  emailFilename,
  mockupCount,
  mockupSummary,
  canExport,
  hasProcessedResult,
  onChange,
  onApprovalChange,
  onMarkProofSent,
  onRecordProofResponse,
  onDownloadProof,
}) => {
  const summary = summarizeProofApproval(approval);
  const approvalBlockedByStaleProof = proofFreshness?.stale === true;
  const proofExportReady = hasProcessedResult && canExport;
  const proofSent = approval.requestedAt !== null || approval.status === 'sent' || approval.status === 'approved' || approval.status === 'changes-requested';
  const canMarkProofSent = canMarkCurrentProofSent({
    hasProcessedResult,
    canExport,
    proofFreshness,
    proofAlreadySent: proofSent,
  });
  const canRecordResponse = proofSent && !approvalBlockedByStaleProof;
  const markSentTitle = canMarkProofSent
    ? undefined
    : proofSent
      ? 'Proof sent is already recorded for this job.'
      : !proofExportReady
        ? 'Export-ready artwork is required before marking a proof as sent.'
        : !proofFreshness
          ? 'Export a customer proof before marking it sent.'
          : proofFreshness.stale
            ? 'Export a fresh proof before marking it sent.'
            : !proofFreshness.comparable
              ? 'Ink Master could not verify this proof against the current job revision.'
              : undefined;
  const responseTitle = approvalBlockedByStaleProof
    ? 'Export a fresh proof before recording customer approval.'
    : proofSent
      ? undefined
      : 'Mark the proof sent before recording the customer response.';

  return (
  <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
    <div className="mb-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-400">Customer proof builder</p>
      <h3 className="mt-1 text-sm font-bold text-slate-100">Brand the approval proof before sending it.</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        The proof includes customer/job details, placement, profile revision, selected mockups, notes, and approval fields.
      </p>
    </div>

    <div className="mb-3 grid gap-2 sm:grid-cols-3">
      <div className={`rounded-lg border px-3 py-2 ${proofExportReady ? workflowStepClasses.ready : workflowStepClasses.current}`}>
        <p className="text-[9px] font-black uppercase tracking-widest">1 · Export proof</p>
        <p className="mt-1 text-[10px] leading-relaxed opacity-80">
          {proofExportReady ? 'Print and email proof files are ready.' : 'Process artwork and clear preflight first.'}
        </p>
      </div>
      <div className={`rounded-lg border px-3 py-2 ${proofSent ? workflowStepClasses.ready : proofExportReady ? workflowStepClasses.current : workflowStepClasses.blocked}`}>
        <p className="text-[9px] font-black uppercase tracking-widest">2 · Mark sent</p>
        <p className="mt-1 text-[10px] leading-relaxed opacity-80">
          {proofSent ? 'A sent proof is recorded locally.' : 'Record when the proof leaves the shop.'}
        </p>
      </div>
      <div className={`rounded-lg border px-3 py-2 ${summary.status === 'approved' ? workflowStepClasses.ready : canRecordResponse ? workflowStepClasses.current : workflowStepClasses.blocked}`}>
        <p className="text-[9px] font-black uppercase tracking-widest">3 · Customer response</p>
        <p className="mt-1 text-[10px] leading-relaxed opacity-80">
          {summary.status === 'approved' ? 'Approved for package handoff.' : canRecordResponse ? 'Record approval or requested changes.' : 'Wait for a current sent proof.'}
        </p>
      </div>
    </div>

    <div className="space-y-2">
      <input
        value={branding.shopName}
        onChange={(event) => onChange(updateField(branding, 'shopName', event.target.value))}
        placeholder="Shop name"
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
      />
      <input
        value={branding.contactLine}
        onChange={(event) => onChange(updateField(branding, 'contactLine', event.target.value))}
        placeholder="Contact line, e.g. proofs@shop.com · 555-0123"
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
      />
      <div className="grid grid-cols-[minmax(0,1fr)_4rem] gap-2">
        <input
          value={branding.footerNote}
          onChange={(event) => onChange(updateField(branding, 'footerNote', event.target.value))}
          placeholder="Approval footer note"
          className="min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
        />
        <input
          type="color"
          aria-label="Proof accent color"
          value={branding.accentColor}
          onChange={(event) => onChange(updateField(branding, 'accentColor', event.target.value))}
          className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 p-1"
        />
      </div>
    </div>

    <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Local approval tracking</p>
          <p className="mt-1 text-xs font-semibold text-slate-200">{summary.headline}</p>
          <p className="mt-1 text-[10px] leading-relaxed text-indigo-200">{summary.nextStep}</p>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-wider ${toneClasses[summary.tone]}`}>
          {summary.status.replace(/-/g, ' ')}
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Proof status</p>
          <p className="mt-1 text-[11px] font-semibold text-slate-300">{summary.label}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Approver</p>
          <p className="mt-1 truncate text-[11px] font-semibold text-slate-300" title={summary.approverLabel}>{summary.approverLabel}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Audit entries</p>
          <p className="mt-1 text-[11px] font-semibold text-slate-300">{summary.eventCount}</p>
        </div>
      </div>
      {(summary.sentLabel || summary.responseLabel) && (
        <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
          {summary.sentLabel && <p className="text-[10px] leading-relaxed text-slate-500">{summary.sentLabel}</p>}
          {summary.responseLabel && <p className="text-[10px] leading-relaxed text-slate-500">{summary.responseLabel}</p>}
        </div>
      )}
      {proofFreshness && (
        <div className={`mt-2 rounded-lg border px-3 py-2 ${proofFreshness.stale ? 'border-amber-500/40 bg-amber-950/25' : 'border-emerald-500/30 bg-emerald-950/20'}`}>
          <p className={`text-[10px] font-bold uppercase tracking-widest ${proofFreshness.stale ? 'text-amber-300' : 'text-emerald-300'}`}>
            {proofFreshness.stale ? 'Proof needs re-export' : 'Proof matches current job'}
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-400">{proofFreshness.message}</p>
          {proofFreshness.latestProofLabel && (
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{proofFreshness.latestProofLabel}</p>
          )}
        </div>
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input
          value={approval.approverName}
          onChange={(event) => onApprovalChange(updateProofApprovalState(approval, { approverName: event.target.value }))}
          placeholder="Approver name"
          className="min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
        />
        <input
          value={approval.approverEmail}
          onChange={(event) => onApprovalChange(updateProofApprovalState(approval, { approverEmail: event.target.value }))}
          placeholder="Approver email"
          className="min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
        />
      </div>
      <textarea
        value={approval.notes}
        onChange={(event) => onApprovalChange(updateProofApprovalState(approval, { notes: event.target.value }))}
        placeholder="Approval notes or requested changes"
        rows={2}
        className="mt-2 w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!canMarkProofSent}
          title={markSentTitle}
          onClick={onMarkProofSent}
          className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:border-indigo-500 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
        >
          {proofSent ? 'Proof sent recorded' : proofFreshness?.stale ? 'Re-export proof first' : proofFreshness ? 'Mark proof sent' : 'Export proof first'}
        </button>
        <button
          type="button"
          disabled={!cloudCapability.supportsShareLinks}
          title={cloudCapability.message}
          aria-label={`Share approval link unavailable: ${cloudCapability.message}`}
          className="rounded-lg border border-slate-800 px-3 py-2 text-xs font-bold text-slate-500 opacity-70"
        >
          Share link not configured
        </button>
        <button
          type="button"
          disabled={!canRecordResponse}
          title={responseTitle}
          onClick={() => onRecordProofResponse('approved')}
          className="rounded-lg border border-emerald-500/40 px-3 py-2 text-xs font-bold text-emerald-200 hover:border-emerald-400 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
        >
          {approvalBlockedByStaleProof ? 'Re-export proof first' : proofSent ? 'Record approval' : 'Mark sent first'}
        </button>
        <button
          type="button"
          disabled={!canRecordResponse}
          title={responseTitle}
          onClick={() => onRecordProofResponse('changes-requested')}
          className="rounded-lg border border-amber-500/40 px-3 py-2 text-xs font-bold text-amber-200 hover:border-amber-400 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
        >
          Request changes
        </button>
      </div>
      {!proofSent && (
        <p className="mt-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-[10px] font-semibold leading-relaxed text-indigo-200">
          Export the proof, send it to the customer, then mark it sent before recording approval or change requests.
        </p>
      )}
      {approvalBlockedByStaleProof && (
        <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[10px] font-semibold leading-relaxed text-amber-200">
          Approval is locked because the job changed after the latest proof export. Export a fresh customer proof before recording approval.
        </p>
      )}
      <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Approval timeline</p>
        {recentEvents(approval).length > 0 ? (
          <ul className="mt-2 space-y-1">
            {recentEvents(approval).map((event) => (
              <li key={event.id} className="text-[10px] leading-relaxed text-slate-400">
                {formatProofApprovalEvent(event)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            No approval activity yet. Export a proof and mark it sent when it leaves the shop.
          </p>
        )}
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">{cloudCapability.message}</p>
      <p className="mt-1 text-[10px] leading-relaxed text-slate-600">Sync mode: {approval.cloudSyncStatus}</p>
    </div>

    <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Proof contents</p>
      <p className="mt-1 text-xs text-slate-300">
        {mockupCount} selected mockup{mockupCount === 1 ? '' : 's'} · {mockupSummary} · print-ready PDF · compressed email PDF
      </p>
      {!hasProcessedResult && <p className="mt-1 text-[10px] font-semibold text-amber-300">Process artwork before proof export.</p>}
      {hasProcessedResult && !canExport && <p className="mt-1 text-[10px] font-semibold text-amber-300">Resolve or acknowledge preflight findings before proof export.</p>}
    </div>

    <div className="mt-3 grid grid-cols-2 gap-2">
      <button
        type="button"
        disabled={!hasProcessedResult || !canExport}
        onClick={() => onDownloadProof('print')}
        className="rounded-lg border border-slate-700 px-3 py-2.5 text-left text-xs font-bold text-slate-300 hover:border-indigo-500 disabled:opacity-30"
      >
        Print proof
        <span className="mt-1 block truncate font-mono text-[9px] font-normal text-slate-500">{printFilename}</span>
      </button>
      <button
        type="button"
        disabled={!hasProcessedResult || !canExport}
        onClick={() => onDownloadProof('email')}
        className="rounded-lg border border-slate-700 px-3 py-2.5 text-left text-xs font-bold text-slate-300 hover:border-indigo-500 disabled:opacity-30"
      >
        Email proof
        <span className="mt-1 block truncate font-mono text-[9px] font-normal text-slate-500">{emailFilename}</span>
      </button>
    </div>
  </section>
  );
};
