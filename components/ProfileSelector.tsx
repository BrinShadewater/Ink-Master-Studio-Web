import React from 'react';
import { AppliedProductionProfile, ProductionProfile } from '../types';
import { ProfileUpdateState } from '../services/productionProfiles';

interface ProfileSelectorProps {
  applied: AppliedProductionProfile;
  profiles: ProductionProfile[];
  updateState: ProfileUpdateState;
  onAssign: (profileId: string) => void;
  onApplyUpdate: () => void;
  onManage: () => void;
}

export const ProfileSelector: React.FC<ProfileSelectorProps> = ({
  applied,
  profiles,
  updateState,
  onAssign,
  onApplyUpdate,
  onManage,
}) => {
  const activeProfiles = profiles.filter((profile) => profile.archivedAt === null);
  const activeApplied = activeProfiles.some((profile) => profile.id === applied.profileId);
  const warning = updateState.status === 'archived'
    ? 'Source profile is archived. This job keeps its applied snapshot.'
    : updateState.status === 'missing'
      ? 'Source profile is missing. This job keeps its applied snapshot.'
      : null;

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <div className="hidden min-w-0 md:block" title={`${applied.snapshot.name} revision ${applied.profileRevision}`}>
        <p className="max-w-36 truncate text-[10px] font-black uppercase tracking-wide text-slate-500">Production profile</p>
        <p className="max-w-36 truncate text-xs font-bold text-slate-200">{applied.snapshot.name} · r{applied.profileRevision}</p>
      </div>
      <label className="sr-only" htmlFor="production-profile-selector">Assign production profile</label>
      <select
        id="production-profile-selector"
        aria-label={`Assign production profile. Current: ${applied.snapshot.name}, revision ${applied.profileRevision}`}
        title={`Assign production profile. Current: ${applied.snapshot.name}, revision ${applied.profileRevision}`}
        value={activeApplied ? applied.profileId : ''}
        onChange={(event) => {
          if (event.target.value && event.target.value !== applied.profileId) {
            onAssign(event.target.value);
          }
        }}
        className="h-9 min-w-0 max-w-32 rounded-lg border border-slate-800 bg-slate-900 px-2 text-xs font-semibold text-slate-200 outline-none focus:border-indigo-500 sm:max-w-44"
      >
        {!activeApplied && <option value="">Choose active profile</option>}
        {activeProfiles.map((profile) => (
          <option key={profile.id} value={profile.id}>{profile.name} · r{profile.revision}</option>
        ))}
      </select>
      {updateState.status === 'update-available' && (
        <button type="button" onClick={onApplyUpdate} title="Review available profile revision" className="h-9 rounded-lg border border-amber-500/50 bg-amber-500/10 px-2.5 text-xs font-black text-amber-200 hover:border-amber-400">
          <span className="hidden md:inline">Review update</span>
          <span className="md:hidden" aria-hidden="true">Update</span>
        </button>
      )}
      {warning && (
        <span role="status" title={warning} aria-label={warning} className="inline-flex h-9 items-center rounded-lg border border-amber-700/50 bg-amber-950/40 px-2 text-amber-300">
          <span aria-hidden="true">!</span>
          <span className="sr-only">{warning}</span>
        </span>
      )}
      <button type="button" onClick={onManage} aria-label="Manage production profiles" title="Manage production profiles" className="inline-flex h-9 items-center rounded-lg border border-slate-800 bg-slate-900 px-2.5 text-xs font-bold text-slate-300 hover:border-slate-600 hover:text-white">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /><circle cx="9" cy="7" r="2" fill="currentColor" /><circle cx="15" cy="12" r="2" fill="currentColor" /><circle cx="11" cy="17" r="2" fill="currentColor" /></svg>
        <span className="ml-2 hidden md:inline">Profiles</span>
      </button>
    </div>
  );
};
