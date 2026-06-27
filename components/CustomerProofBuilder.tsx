import React from 'react';
import { ProofApprovalState, ProofBranding } from '../types';
import { CloudApprovalCapability, describeProofApprovalStatus, updateProofApprovalState } from '../services/proofApproval';

interface CustomerProofBuilderProps {
  branding: ProofBranding;
  approval: ProofApprovalState;
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

export const CustomerProofBuilder: React.FC<CustomerProofBuilderProps> = ({
  branding,
  approval,
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
}) => (
  <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
    <div className="mb-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-400">Customer proof builder</p>
      <h3 className="mt-1 text-sm font-bold text-slate-100">Brand the approval proof before sending it.</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        The proof includes customer/job details, placement, profile revision, selected mockups, notes, and approval fields.
      </p>
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
          <p className="mt-1 text-xs font-semibold text-slate-200">{describeProofApprovalStatus(approval)}</p>
        </div>
        <span className="rounded-full border border-slate-700 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
          {approval.cloudSyncStatus}
        </span>
      </div>
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
        <button type="button" onClick={onMarkProofSent} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:border-indigo-500">
          Mark proof sent
        </button>
        <button type="button" disabled={!cloudCapability.supportsShareLinks} className="rounded-lg border border-slate-800 px-3 py-2 text-xs font-bold text-slate-500 opacity-70">
          Share approval link
        </button>
        <button type="button" onClick={() => onRecordProofResponse('approved')} className="rounded-lg border border-emerald-500/40 px-3 py-2 text-xs font-bold text-emerald-200 hover:border-emerald-400">
          Record approval
        </button>
        <button type="button" onClick={() => onRecordProofResponse('changes-requested')} className="rounded-lg border border-amber-500/40 px-3 py-2 text-xs font-bold text-amber-200 hover:border-amber-400">
          Request changes
        </button>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">{cloudCapability.message}</p>
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
