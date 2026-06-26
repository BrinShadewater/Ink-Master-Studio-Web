import React, { useState } from 'react';
import { ShopTemplate, StudioJob } from '../types';
import { describeTemplate, describeTemplateChanges } from '../services/templateStorage';

interface TemplatesPopoverProps {
  templates: ShopTemplate[];
  currentJob: StudioJob | null;
  onApply: (template: ShopTemplate) => void;
  onSave: (name: string, description: string) => void;
  onDelete: (template: ShopTemplate) => void;
  onExport: () => void;
  onImport: (file: File) => void;
}

export const TemplatesPopover: React.FC<TemplatesPopoverProps> = ({
  templates,
  currentJob,
  onApply,
  onSave,
  onDelete,
  onExport,
  onImport,
}) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  return (
    <div className="relative">
      <button type="button" aria-label="Templates" onClick={() => setOpen((value) => !value)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 text-xs font-semibold text-slate-300 hover:border-slate-700 hover:bg-slate-800 hover:text-white">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 5h16v5H4zM4 14h7v5H4zM15 14h5v5h-5z" /></svg>
        <span className="hidden md:inline">Templates</span>
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 rounded-xl border border-slate-700 bg-slate-950 p-3 shadow-2xl shadow-black/60">
          <div className="flex gap-2">
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="New template name" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white outline-none focus:border-indigo-500" />
            <button type="button" disabled={!name.trim()} onClick={() => { onSave(name, 'Shop production template'); setName(''); }} className="rounded-lg bg-indigo-600 px-3 text-xs font-bold text-white disabled:opacity-30">Save</button>
          </div>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {templates.map((template) => (
              <div key={template.id} className="rounded-lg border border-slate-800 bg-slate-900/70 p-2">
                <div className="flex items-start gap-2">
                  <button type="button" onClick={() => { onApply(template); setOpen(false); }} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-xs font-bold text-white">{template.name}</span>
                    <TemplateSummary template={template} />
                  </button>
                  <button type="button" aria-label={`Delete ${template.name}`} onClick={() => onDelete(template)} className="px-2 text-xs text-rose-400">×</button>
                </div>
                {currentJob && (
                  <TemplateChangeSummary template={template} currentJob={currentJob} />
                )}
              </div>
            ))}
            {templates.length === 0 && <p className="py-5 text-center text-xs text-slate-500">No shop templates saved.</p>}
          </div>
          <div className="mt-3 flex gap-2 border-t border-slate-800 pt-3">
            <button type="button" disabled={!templates.length} onClick={onExport} className="flex-1 rounded-lg border border-slate-700 py-2 text-[11px] font-bold text-slate-300 disabled:opacity-30">Export JSON</button>
            <label className="flex-1 cursor-pointer rounded-lg border border-slate-700 py-2 text-center text-[11px] font-bold text-slate-300">
              Import JSON
              <input type="file" accept=".json,application/json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.target.value = ''; }} />
            </label>
          </div>
        </div>
      )}
    </div>
  );
};

const TemplateSummary: React.FC<{ template: ShopTemplate }> = ({ template }) => {
  const summary = describeTemplate(template);
  return (
    <span className="mt-1 block space-y-0.5 text-[10px] text-slate-500">
      <span className="block truncate">{summary.product} · {summary.placement}</span>
      <span className="block truncate">{summary.recipe} · {summary.printSize} · {summary.output}</span>
      <span className="block truncate">Mockups: {summary.mockups}</span>
      <span className="block truncate">Package: {summary.packageContents}</span>
      <span className="block truncate">Naming: {summary.namingPattern}</span>
    </span>
  );
};

const TemplateChangeSummary: React.FC<{ template: ShopTemplate; currentJob: StudioJob }> = ({ template, currentJob }) => {
  const changes = describeTemplateChanges(currentJob, template);
  return (
    <p className={`mt-2 rounded border px-2 py-1 text-[10px] font-semibold ${changes.length ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>
      {changes.length ? `Will update: ${changes.join(', ')}` : 'Matches current job settings'}
    </p>
  );
};
