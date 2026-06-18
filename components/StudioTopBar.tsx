import React from 'react';

interface StudioTopBarProps {
  canUndo: boolean;
  canRedo: boolean;
  onNewFile: () => void;
  onBatch: () => void;
  onUndo: () => void;
  onRedo: () => void;
  versions: React.ReactNode;
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
  canUndo,
  canRedo,
  onNewFile,
  onBatch,
  onUndo,
  onRedo,
  versions,
}) => (
  <header className="flex h-14 flex-none items-center justify-between border-b border-slate-800 bg-slate-950/95 px-3 backdrop-blur lg:px-5">
    <button
      type="button"
      onClick={onNewFile}
      className="flex min-w-0 items-center gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
    >
      <img src="/logo/logo.png" alt="" className="h-8 w-8 object-contain" />
      <span className="hidden text-sm font-black tracking-tight text-slate-100 sm:inline">
        InkMaster <span className="text-indigo-400">Studio</span>
      </span>
    </button>

    <div className="flex items-center gap-1.5">
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
      {versions}
    </div>
  </header>
);
