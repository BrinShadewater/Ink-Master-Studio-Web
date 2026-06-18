import React, { useEffect, useState } from 'react';
import { ProcessingSettings } from '../types';
import { Checkpoint } from './CheckpointBar';

const STORAGE_KEY = 'inkmaster_checkpoints';
const MAX_VERSIONS = 5;

const loadVersions = (): Checkpoint[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

interface VersionsPopoverProps {
  currentSettings: ProcessingSettings;
  currentThumbnail: string | null;
  onRestore: (checkpoint: Checkpoint) => void;
}

export const VersionsPopover: React.FC<VersionsPopoverProps> = ({
  currentSettings,
  currentThumbnail,
  onRestore,
}) => {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<Checkpoint[]>(loadVersions);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(versions));
    } catch {
      // Versions remain available for this session when browser storage is unavailable.
    }
  }, [versions]);

  const saveVersion = () => {
    const next: Checkpoint = {
      id: `version_${Date.now()}`,
      name: `Version ${versions.length + 1}`,
      timestamp: Date.now(),
      settings: { ...currentSettings },
      thumbnail: currentThumbnail,
      imageUrl: currentThumbnail,
    };
    setVersions((current) => [...current, next].slice(-MAX_VERSIONS));
    setOpen(true);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 text-xs font-semibold text-slate-300 hover:border-slate-700 hover:bg-slate-800 hover:text-white"
        aria-expanded={open}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
        <span className="hidden sm:inline">Versions</span>
        {versions.length > 0 && <span className="rounded bg-slate-800 px-1.5 text-[10px] text-indigo-300">{versions.length}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-72 rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-100">Versions</p>
              <p className="text-[10px] text-slate-500">Saved treatment settings</p>
            </div>
            <button type="button" onClick={saveVersion} className="rounded-md bg-indigo-600 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-indigo-500">
              Save current
            </button>
          </div>
          <div className="space-y-2">
            {versions.length === 0 && <p className="rounded-lg bg-slate-950/60 p-3 text-xs text-slate-500">No saved versions yet.</p>}
            {[...versions].reverse().map((version) => (
              <div key={version.id} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-2">
                <div className="h-10 w-10 overflow-hidden rounded-md bg-slate-800">
                  {version.thumbnail && <img src={version.thumbnail} alt="" className="h-full w-full object-contain" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-200">{version.name}</p>
                  <p className="text-[10px] text-slate-500">{new Date(version.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <button
                  type="button"
                  onClick={() => { onRestore(version); setOpen(false); }}
                  className="rounded-md border border-slate-700 px-2 py-1 text-[10px] font-bold text-slate-300 hover:border-indigo-500 hover:text-white"
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
