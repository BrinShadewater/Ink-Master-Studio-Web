import React from 'react';
import { ProofBranding } from '../types';

interface CustomerProofBuilderProps {
  branding: ProofBranding;
  printFilename: string;
  emailFilename: string;
  mockupCount: number;
  canExport: boolean;
  hasProcessedResult: boolean;
  onChange: (branding: ProofBranding) => void;
  onDownloadProof: (quality: 'print' | 'email') => void;
}

const updateField = <K extends keyof ProofBranding>(
  branding: ProofBranding,
  key: K,
  value: ProofBranding[K],
): ProofBranding => ({ ...branding, [key]: value });

export const CustomerProofBuilder: React.FC<CustomerProofBuilderProps> = ({
  branding,
  printFilename,
  emailFilename,
  mockupCount,
  canExport,
  hasProcessedResult,
  onChange,
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

    <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Proof contents</p>
      <p className="mt-1 text-xs text-slate-300">
        {mockupCount} selected mockup{mockupCount === 1 ? '' : 's'} · print-ready PDF · compressed email PDF
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
