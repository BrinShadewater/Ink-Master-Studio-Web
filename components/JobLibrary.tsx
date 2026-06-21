import React, { useRef } from 'react';
import { StudioJob } from '../types';

interface JobLibraryProps {
  jobs: StudioJob[];
  currentJobId: string | null;
  onClose: () => void;
  onOpen: (job: StudioJob) => void;
  onDuplicate: (job: StudioJob) => void;
  onArchive: (job: StudioJob) => void;
  onExport: (job: StudioJob) => void;
  onImport: (file: File) => void;
}

const formatUpdatedAt = (timestamp: number) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(timestamp);

export const JobLibrary: React.FC<JobLibraryProps> = ({
  jobs,
  currentJobId,
  onClose,
  onOpen,
  onDuplicate,
  onArchive,
  onExport,
  onImport,
}) => {
  const importInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="job-library-title">
      <div className="flex max-h-[min(760px,92dvh)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl shadow-black/60">
        <header className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 id="job-library-title" className="text-lg font-black text-white">Production jobs</h2>
            <p className="mt-1 text-xs text-slate-400">Reopen, transfer, duplicate, or archive local work.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-800 px-3 py-2 text-xs font-bold text-slate-300 hover:border-slate-600 hover:text-white">Close</button>
        </header>

        <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-3">
          <button type="button" onClick={() => importInputRef.current?.click()} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500">Import .inkmaster-job</button>
          <input
            ref={importInputRef}
            type="file"
            accept=".inkmaster-job,application/x-inkmaster-job,application/zip"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImport(file);
              event.target.value = '';
            }}
          />
          <span className="text-xs text-slate-500">{jobs.length} active {jobs.length === 1 ? 'job' : 'jobs'} on this workstation</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {jobs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 px-6 py-14 text-center">
              <p className="text-sm font-bold text-slate-300">No saved jobs yet</p>
              <p className="mt-2 text-xs text-slate-500">Upload artwork to create one, or import a portable job.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => {
                const isCurrent = job.id === currentJobId;
                return (
                  <article key={job.id} className={`rounded-xl border p-4 ${isCurrent ? 'border-indigo-500/60 bg-indigo-500/10' : 'border-slate-800 bg-slate-900/60'}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <button type="button" onClick={() => onOpen(job)} className="min-w-0 flex-1 text-left">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-sm font-black text-white">{job.metadata.name}</h3>
                          {isCurrent && <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-300">Open</span>}
                        </div>
                        <p className="mt-1 text-xs text-slate-400">
                          {job.metadata.customerName || 'No customer'} · {job.sourceArtwork?.name || 'No artwork'}
                        </p>
                        <p className="mt-2 text-[11px] text-slate-600">Updated {formatUpdatedAt(job.updatedAt)}</p>
                      </button>
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" onClick={() => onOpen(job)} className="rounded-md bg-slate-800 px-2.5 py-1.5 text-[11px] font-bold text-slate-200 hover:bg-slate-700">Open</button>
                        <button type="button" onClick={() => onDuplicate(job)} className="rounded-md border border-slate-700 px-2.5 py-1.5 text-[11px] font-bold text-slate-300 hover:border-slate-500">Duplicate</button>
                        <button type="button" onClick={() => onExport(job)} className="rounded-md border border-slate-700 px-2.5 py-1.5 text-[11px] font-bold text-slate-300 hover:border-slate-500">Transfer</button>
                        <button type="button" onClick={() => onArchive(job)} className="rounded-md border border-rose-900/60 px-2.5 py-1.5 text-[11px] font-bold text-rose-300 hover:border-rose-600">Archive</button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
