import React from 'react';
import { AppliedProductionProfile, ProductionProfile } from '../types';
import { describeProfileChanges } from '../services/productionProfiles';

interface ProfileUpdateReviewProps {
  applied: AppliedProductionProfile;
  source: ProductionProfile;
  onApply: () => void;
  onCancel: () => void;
}

export const ProfileUpdateReview: React.FC<ProfileUpdateReviewProps> = ({
  applied,
  source,
  onApply,
  onCancel,
}) => {
  const groups = describeProfileChanges(applied.snapshot, source);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="profile-update-title">
      <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl shadow-black/60">
        <header className="border-b border-slate-800 px-5 py-4">
          <h2 id="profile-update-title" className="text-lg font-black text-white">Review profile revision</h2>
          <p className="mt-1 text-xs text-slate-400">
            {applied.snapshot.name} r{applied.profileRevision} → {source.name} r{source.revision}
          </p>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {groups.length === 0 ? (
            <p className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-sm text-slate-300">No profile fields changed.</p>
          ) : groups.map((group) => (
            <section key={group.id} aria-labelledby={`profile-update-${group.id}`}>
              <h3 id={`profile-update-${group.id}`} className="text-xs font-black uppercase tracking-wide text-slate-400">{group.label}</h3>
              <ul className="mt-2 space-y-1 rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-sm text-slate-200">
                {group.changes.map((change) => <li key={change}>{change}</li>)}
              </ul>
            </section>
          ))}
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100">
            Applying this revision will recalculate preflight and placement constraints and reset the current preflight acknowledgement.
          </p>
        </div>
        <footer className="flex flex-col-reverse gap-2 border-t border-slate-800 px-5 py-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-bold text-slate-300 hover:border-slate-500">Cancel</button>
          <button type="button" onClick={onApply} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-500">Apply profile revision</button>
        </footer>
      </div>
    </div>
  );
};
