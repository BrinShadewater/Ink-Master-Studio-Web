import React, { useMemo, useState } from 'react';
import { ExportHistoryEntry } from '../types';

interface ExportHistoryProps {
  entries: ExportHistoryEntry[];
  currentJobRevision?: number | null;
  canRegenerateProductionPackage?: boolean;
  onRegenerateProductionPackage?: (entry: ExportHistoryEntry) => void;
}

const getTimeString = (ts: number) => {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
};

const getAbsoluteTimeString = (ts: number) => (
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ts))
);

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

const getReadinessTextColor = (status: NonNullable<ExportHistoryEntry['metadata']>['readinessStatus']) => {
  switch (status) {
    case 'ready': return 'text-emerald-300';
    case 'attention': return 'text-amber-300';
    case 'blocked': return 'text-rose-300';
    default: return 'text-slate-400';
  }
};

const getDetailLines = (entry: ExportHistoryEntry) => {
  const metadata = entry.metadata;
  if (!metadata) return [];

  return [
    metadata.readinessSummary,
    metadata.preflightSummary ? `Preflight: ${metadata.preflightSummary}` : null,
    metadata.proofQuality ? `Proof export: ${metadata.proofQuality === 'print' ? 'print-ready PDF' : 'email-friendly PDF'}` : null,
    metadata.placementSummary,
    metadata.proofApprovalStatus ? `Proof: ${metadata.proofApprovalStatus.replace(/-/g, ' ')}` : null,
    metadata.manifestVerified ? 'Manifest-verified package contents' : null,
    metadata.packageContents && metadata.packageContents.length > 0
      ? `Includes: ${metadata.packageContents.slice(0, 3).join(', ')}${metadata.packageContents.length > 3 ? ` +${metadata.packageContents.length - 3}` : ''}`
      : null,
  ].filter((line): line is string => Boolean(line));
};

export const ExportHistory: React.FC<ExportHistoryProps> = ({
  entries,
  currentJobRevision = null,
  canRegenerateProductionPackage = false,
  onRegenerateProductionPackage,
}) => {
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === expandedEntryId) ?? null,
    [entries, expandedEntryId],
  );

  const downloadAgain = (entry: ExportHistoryEntry) => {
    const a = document.createElement('a');
    a.href = entry.url;
    a.download = entry.filename;
    a.click();
  };

  const toggleDetails = (entry: ExportHistoryEntry) => {
    setExpandedEntryId((current) => current === entry.id ? null : entry.id);
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
            const isExpanded = selectedEntry?.id === entry.id;
            const isProductionPackage = entry.metadata?.kind === 'production-package';
            const hasRevisionChanged = typeof entry.metadata?.jobRevision === 'number'
              && typeof currentJobRevision === 'number'
              && entry.metadata.jobRevision !== currentJobRevision;

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
                        {entry.metadata?.manifestVerified && (
                          <span className="rounded border border-emerald-500/30 bg-emerald-950/30 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-300">
                            Manifest verified
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
                <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-800 pt-2">
                  <span className="text-[10px] text-slate-600">{getAbsoluteTimeString(entry.timestamp)}</span>
                  <button
                    type="button"
                    onClick={() => toggleDetails(entry)}
                    className="rounded border border-slate-700 px-2 py-1 text-[10px] font-bold text-slate-400 transition-colors hover:border-indigo-500 hover:text-indigo-300"
                    aria-expanded={isExpanded}
                  >
                    {isExpanded ? 'Hide details' : 'Details'}
                  </button>
                </div>
                {detailLines.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-slate-800 pt-2">
                    {detailLines.slice(0, 4).map((line) => (
                      <p key={line} className="text-[10px] leading-snug text-slate-500">{line}</p>
                    ))}
                  </div>
                )}
                {isExpanded && (
                  <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/50 p-2">
                    <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Saved export record</p>
                    <dl className="mt-2 space-y-1 text-[10px] leading-snug">
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-600">Created</dt>
                        <dd className="text-right text-slate-400">{getAbsoluteTimeString(entry.timestamp)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-600">Type</dt>
                        <dd className="text-right text-slate-400">{getKindLabel(entry)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-600">File</dt>
                        <dd className="max-w-[150px] truncate text-right text-slate-400" title={entry.filename}>{entry.filename}</dd>
                      </div>
                      {entry.metadata?.readinessStatus && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-slate-600">Readiness</dt>
                          <dd className={`text-right font-bold uppercase ${getReadinessTextColor(entry.metadata.readinessStatus)}`}>{entry.metadata.readinessStatus}</dd>
                        </div>
                      )}
                      {entry.metadata?.preflightSummary && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-slate-600">Preflight</dt>
                          <dd className="text-right text-slate-400">{entry.metadata.preflightSummary}</dd>
                        </div>
                      )}
                      {entry.metadata?.manifestVerified && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-slate-600">Manifest</dt>
                          <dd className="text-right font-bold text-emerald-300">Verified against ZIP contents</dd>
                        </div>
                      )}
                      {entry.metadata?.proofApprovalStatus && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-slate-600">Proof</dt>
                          <dd className="text-right capitalize text-slate-400">{entry.metadata.proofApprovalStatus.replace(/-/g, ' ')}</dd>
                        </div>
                      )}
                      {entry.metadata?.proofQuality && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-slate-600">Proof export</dt>
                          <dd className="text-right text-slate-400">{entry.metadata.proofQuality === 'print' ? 'Print-ready PDF' : 'Email-friendly PDF'}</dd>
                        </div>
                      )}
                    </dl>
                    {entry.metadata?.packageContents && entry.metadata.packageContents.length > 0 && (
                      <div className="mt-2 border-t border-slate-800 pt-2">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600">Package contents</p>
                        <ul className="mt-1 space-y-0.5">
                          {entry.metadata.packageContents.map((item) => (
                            <li key={item} className="flex gap-1.5 text-[10px] text-slate-400">
                              <span className="text-emerald-400">✓</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {isProductionPackage && onRegenerateProductionPackage && (
                      <div className="mt-2 border-t border-slate-800 pt-2">
                        {hasRevisionChanged && (
                          <p className="mb-1 text-[10px] leading-snug text-amber-300">Current job changed since this package. Regenerate uses the latest settings.</p>
                        )}
                        <button
                          type="button"
                          disabled={!canRegenerateProductionPackage}
                          onClick={() => onRegenerateProductionPackage(entry)}
                          className="w-full rounded border border-emerald-500/30 px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-emerald-300 transition-colors hover:bg-emerald-950/30 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
                        >
                          Regenerate package
                        </button>
                      </div>
                    )}
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
