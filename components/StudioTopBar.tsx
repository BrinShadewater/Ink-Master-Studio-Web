import React from 'react';

interface StudioTopBarProps {
  jobName: string;
  saveStatus: 'saved' | 'saving' | 'error';
  canUndo: boolean;
  canRedo: boolean;
  onNewFile: () => void;
  onJobNameChange: (name: string) => void;
  onOpenJobs: () => void;
  onBatch: () => void;
  onUndo: () => void;
  onRedo: () => void;
  versions: React.ReactNode;
  templates: React.ReactNode;
  productionProfile: React.ReactNode;
}

const IconButton: React.FC<{
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ label, disabled, onClick, children }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={onClick}
    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 text-xs font-semibold text-slate-300 transition hover:border-slate-700 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
  >
    {children}
  </button>
);

export const StudioTopBar: React.FC<StudioTopBarProps> = ({
  jobName,
  saveStatus,
  canUndo,
  canRedo,
  onNewFile,
  onJobNameChange,
  onOpenJobs,
  onBatch,
  onUndo,
  onRedo,
  versions,
  templates,
  productionProfile,
}) => (
  <header className="relative z-40 flex min-h-14 flex-none flex-wrap items-center justify-between gap-y-2 border-b border-slate-800 bg-slate-950/95 px-3 py-2 backdrop-blur sm:h-14 sm:flex-nowrap sm:py-0 lg:px-5">
    <div className="flex min-w-0 items-center gap-2">
      <img src="/logo/logo.png" alt="" className="h-8 w-8 object-contain" />
      <div className="hidden min-w-0 sm:block">
        <input
          aria-label="Job name"
          value={jobName}
          onChange={(event) => onJobNameChange(event.target.value)}
          className="w-40 truncate border-0 bg-transparent p-0 text-sm font-black tracking-tight text-slate-100 outline-none focus:text-white lg:w-56"
        />
        <p className={`text-[10px] font-semibold ${saveStatus === 'error' ? 'text-rose-400' : 'text-slate-500'}`}>
          {saveStatus === 'saving' ? 'Saving locally…' : saveStatus === 'error' ? 'Local save failed' : 'Saved locally'}
        </p>
      </div>
    </div>

    <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
      <IconButton label="Open production jobs" onClick={onOpenJobs}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h6l2 2h8v9H4z" /><path d="M4 7V5h6l2 2" /></svg>
        <span className="hidden md:inline">Jobs</span>
      </IconButton>
      <IconButton label="New file" onClick={onNewFile}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
        <span className="hidden md:inline">New file</span>
      </IconButton>
      <IconButton label="Batch processing" onClick={onBatch}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        <span className="hidden md:inline">Batch</span>
      </IconButton>
      <span className="mx-1 h-6 w-px bg-slate-800" />
      <IconButton label="Undo" disabled={!canUndo} onClick={onUndo}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 7 4 12l5 5M5 12h9a6 6 0 0 1 6 6" /></svg>
      </IconButton>
      <IconButton label="Redo" disabled={!canRedo} onClick={onRedo}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 7 5 5-5 5M19 12h-9a6 6 0 0 0-6 6" /></svg>
      </IconButton>
      {productionProfile}
      {templates}
      {versions}
    </div>
    <div className="basis-full border-t border-slate-900 pt-1 sm:hidden">
      <input
        aria-label="Job name"
        value={jobName}
        onChange={(event) => onJobNameChange(event.target.value)}
        className="w-full truncate border-0 bg-transparent p-0 text-xs font-black tracking-tight text-slate-100 outline-none focus:text-white"
      />
      <p className={`text-[10px] font-semibold ${saveStatus === 'error' ? 'text-rose-400' : 'text-slate-500'}`}>
        {saveStatus === 'saving' ? 'Saving locally…' : saveStatus === 'error' ? 'Local save failed' : 'Saved locally'}
      </p>
    </div>
  </header>
);
