import React from 'react';
import { ExportHistoryEntry } from '../types';

interface ExportHistoryProps {
  entries: ExportHistoryEntry[];
}

const getTimeString = (ts: number) => {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
};

const getFormatColor = (fmt: string) => {
  switch (fmt) {
    case 'PNG': return 'bg-purple-900/40 text-purple-400 border-purple-500/30';
    case 'JPG': return 'bg-blue-900/40 text-blue-400 border-blue-500/30';
    case 'SVG': return 'bg-emerald-900/40 text-emerald-400 border-emerald-500/30';
    case 'PDF': return 'bg-red-900/40 text-red-400 border-red-500/30';
    case 'ZIP': return 'bg-amber-900/40 text-amber-300 border-amber-500/30';
    default: return 'bg-slate-800 text-slate-400 border-slate-700';
  }
};

const getKindLabel = (entry: ExportHistoryEntry) => {
  switch (entry.metadata?.kind) {
    case 'production-package': return 'Production package';
    case 'customer-proof': return 'Customer proof';
    case 'print-master': return 'Print master';
    case 'production-pdf': return 'Production PDF';
    case 'mockup-set': return 'Mockup set';
    case 'underbase': return 'White underbase';
    default: return 'Export';
  }
};

const getReadinessColor = (status: NonNullable<ExportHistoryEntry['metadata']>['readinessStatus']) => {
  switch (status) {
    case 'ready': return 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300';
    case 'attention': return 'border-amber-500/40 bg-amber-950/30 text-amber-300';
    case 'blocked': return 'border-rose-500/40 bg-rose-950/30 text-rose-300';
    default: return 'border-slate-700 bg-slate-900/70 text-slate-400';
  }
};

const getDetailLines = (entry: ExportHistoryEntry) => {
  const metadata = entry.metadata;
  if (!metadata) return [];

  return [
    metadata.readinessSummary,
    metadata.preflightSummary ? `Preflight: ${metadata.preflightSummary}` : null,
    metadata.placementSummary,
    metadata.proofApprovalStatus ? `Proof: ${metadata.proofApprovalStatus.replace(/-/g, ' ')}` : null,
    metadata.packageContents && metadata.packageContents.length > 0
      ? `Includes: ${metadata.packageContents.slice(0, 3).join(', ')}${metadata.packageContents.length > 3 ? ` +${metadata.packageContents.length - 3}` : ''}`
      : null,
  ].filter((line): line is string => Boolean(line));
};

export const ExportHistory: React.FC<ExportHistoryProps> = ({ entries }) => {
  const downloadAgain = (entry: ExportHistoryEntry) => {
    const a = document.createElement('a');
    a.href = entry.url;
    a.download = entry.filename;
    a.click();
  };

  return (
    <div className="mt-8 border-t border-slate-800 pt-6">
      <h2 className="mb-3 flex justify-between text-xs font-bold uppercase tracking-widest text-slate-400">
        <span>Export History</span>
        <span className="rounded bg-slate-800 px-1.5 text-[10px] text-slate-500">{entries.length}</span>
      </h2>

      {entries.length === 0 ? (
        <p className="text-xs italic text-slate-600">No exports yet this session</p>
      ) : (
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {entries.map((entry) => {
            const detailLines = getDetailLines(entry);

            return (
              <div key={entry.id} className="rounded-lg border border-slate-800 bg-slate-800/30 p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${getFormatColor(entry.format)}`}>
                      {entry.format}
                    </span>
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{getKindLabel(entry)}</p>
                        {entry.metadata?.readinessStatus && (
                          <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${getReadinessColor(entry.metadata.readinessStatus)}`}>
                            {entry.metadata.readinessStatus}
                          </span>
                        )}
                      </div>
                      <p className="max-w-[150px] truncate text-xs text-slate-300" title={entry.filename}>{entry.filename}</p>
                      <p className="text-[9px] text-slate-600">{getTimeString(entry.timestamp)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => downloadAgain(entry)}
                    className="rounded p-1.5 text-slate-500 transition-all hover:bg-slate-800 hover:text-indigo-400"
                    title="Download again"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  </button>
                </div>
                {detailLines.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-slate-800 pt-2">
                    {detailLines.slice(0, 4).map((line) => (
                      <p key={line} className="text-[10px] leading-snug text-slate-500">{line}</p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
