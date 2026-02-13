import React from 'react';
import { ExportHistoryEntry, OutputFormat } from '../types';

interface ExportHistoryProps {
  entries: ExportHistoryEntry[];
}

export const ExportHistory: React.FC<ExportHistoryProps> = ({ entries }) => {
  const downloadAgain = (entry: ExportHistoryEntry) => {
    const a = document.createElement('a');
    a.href = entry.url;
    a.download = entry.filename;
    a.click();
  };

  const getTimeString = (ts: number) => {
      const diff = Date.now() - ts;
      if (diff < 60000) return 'Just now';
      if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
      return `${Math.floor(diff/3600000)}h ago`;
  };

  const getFormatColor = (fmt: string) => {
      switch(fmt) {
          case 'PNG': return 'bg-purple-900/40 text-purple-400 border-purple-500/30';
          case 'JPG': return 'bg-blue-900/40 text-blue-400 border-blue-500/30';
          case 'SVG': return 'bg-emerald-900/40 text-emerald-400 border-emerald-500/30';
          case 'PDF': return 'bg-red-900/40 text-red-400 border-red-500/30';
          default: return 'bg-slate-800 text-slate-400';
      }
  };

  return (
    <div className="mt-8 pt-6 border-t border-slate-800">
      <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex justify-between">
          <span>Export History</span>
          <span className="bg-slate-800 text-slate-500 px-1.5 rounded text-[10px]">{entries.length}</span>
      </h2>
      
      {entries.length === 0 ? (
          <p className="text-xs text-slate-600 italic">No exports yet this session</p>
      ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {entries.map(entry => (
                  <div key={entry.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-800/30 border border-slate-800">
                      <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${getFormatColor(entry.format)}`}>
                              {entry.format}
                          </span>
                          <div className="min-w-0">
                              <p className="text-xs text-slate-300 truncate max-w-[120px]" title={entry.filename}>{entry.filename}</p>
                              <p className="text-[9px] text-slate-600">{getTimeString(entry.timestamp)}</p>
                          </div>
                      </div>
                      <button 
                        onClick={() => downloadAgain(entry)}
                        className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-slate-800 rounded transition-all"
                        title="Download again"
                      >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                      </button>
                  </div>
              ))}
          </div>
      )}
    </div>
  );
};