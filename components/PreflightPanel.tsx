import React, { createContext, useContext } from 'react';
import { AppliedProductionProfile, PreflightFinding, PrintSpecification } from '../types';
import { getPreflightGate } from '../services/preflight';

interface PreflightPanelProps {
  profile?: AppliedProductionProfile;
  specification: PrintSpecification;
  findings: PreflightFinding[];
  acknowledged: boolean;
  onSpecificationChange: (specification: PrintSpecification) => void;
  onAcknowledge: (acknowledged: boolean) => void;
}

export const AppliedProductionProfileContext = createContext<AppliedProductionProfile | null>(null);

const severityStyle: Record<PreflightFinding['severity'], string> = {
  pass: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  critical: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
};

export const PreflightPanel: React.FC<PreflightPanelProps> = ({
  profile: profileProp,
  specification,
  findings,
  acknowledged,
  onSpecificationChange,
  onAcknowledge,
}) => {
  const contextualProfile = useContext(AppliedProductionProfileContext);
  const profile = profileProp ?? contextualProfile;
  const gate = getPreflightGate(findings, acknowledged);
  const updateNumber = (key: 'widthInches' | 'heightInches' | 'targetDpi', value: string) => {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) onSpecificationChange({ ...specification, [key]: parsed });
  };

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="mb-3">
        <h3 className="text-sm font-bold text-slate-100">Production preflight</h3>
        <p className="mt-1 text-xs text-slate-500">Check the artwork at its actual requested print size.</p>
        {profile && (
          <p className="mt-2 text-[11px] font-semibold text-indigo-300">
            Production profile: {profile.snapshot.name} · revision {profile.profileRevision}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Method
          <select value={specification.method} onChange={(event) => onSpecificationChange({ ...specification, method: event.target.value as PrintSpecification['method'] })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white">
            <option value="DTG">DTG</option>
            <option value="DTF">DTF</option>
          </select>
        </label>
        <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Job/output target DPI
          <input type="number" min="150" max="600" value={specification.targetDpi} onChange={(event) => updateNumber('targetDpi', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white" />
        </label>
        <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Width (in)
          <input type="number" min="0.5" step="0.25" value={specification.widthInches} onChange={(event) => updateNumber('widthInches', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white" />
        </label>
        <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Height (in)
          <input type="number" min="0.5" step="0.25" value={specification.heightInches} onChange={(event) => updateNumber('heightInches', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white" />
        </label>
      </div>

      <div className="mt-3 space-y-2">
        {findings.map((entry) => (
          <div key={entry.id} className={`rounded-lg border px-3 py-2 ${severityStyle[entry.severity]}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-black">{entry.title}</p>
              <span className="text-[9px] font-black uppercase tracking-wide">{entry.severity}</span>
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-300">{entry.message}</p>
            {entry.severity !== 'pass' && <p className="mt-1 text-[10px] leading-relaxed text-slate-400">Fix: {entry.action}</p>}
          </div>
        ))}
      </div>

      {gate.requiresAcknowledgement && gate.criticalCount === 0 && (
        <label className="mt-3 flex cursor-pointer items-start gap-2 text-[11px] text-slate-300">
          <input type="checkbox" checked={acknowledged} onChange={(event) => onAcknowledge(event.target.checked)} className="mt-0.5 accent-indigo-500" />
          I reviewed the warnings and approve this job revision for production export.
        </label>
      )}
      {gate.criticalCount > 0 && <p className="mt-3 text-[11px] font-bold text-rose-300">Critical findings must be corrected before production export.</p>}
    </section>
  );
};
