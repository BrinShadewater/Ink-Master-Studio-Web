import React, { useState } from 'react';
import { ShopTemplate, StudioJob } from '../types';
import { describeTemplate, describeTemplateChanges } from '../services/templateStorage';

interface TemplatesPopoverProps {
  templates: ShopTemplate[];
  currentJob: StudioJob | null;
  onApply: (template: ShopTemplate) => void;
  onSave: (name: string, description: string) => void;
  onDelete: (template: ShopTemplate) => void;
  onDuplicate: (template: ShopTemplate) => void;
  onRename: (template: ShopTemplate, name: string) => void;
  onUpdateAppliedTemplate?: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  importMessage?: string | null;
}

export const TemplatesPopover: React.FC<TemplatesPopoverProps> = ({
  templates,
  currentJob,
  onApply,
  onSave,
  onDelete,
  onDuplicate,
  onRename,
  onUpdateAppliedTemplate,
  onExport,
  onImport,
  importMessage = null,
}) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [pendingApplyId, setPendingApplyId] = useState<string | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  return (
    <div className="relative">
      <button type="button" aria-label="Templates" onClick={() => { setPendingApplyId(null); setEditingTemplateId(null); setOpen((value) => !value); }} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 text-xs font-semibold text-slate-300 hover:border-slate-700 hover:bg-slate-800 hover:text-white">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 5h16v5H4zM4 14h7v5H4zM15 14h5v5h-5z" /></svg>
        <span className="hidden md:inline">Templates</span>
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-[min(calc(100vw-2rem),22rem)] rounded-xl border border-slate-700 bg-slate-950 p-3 shadow-2xl shadow-black/60">
          <div className="mb-3 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Shop template library</p>
            <p className="mt-1 text-xs font-semibold text-slate-300">
              {templates.length} saved · local presets for recipe, placement, package, proof branding, and naming.
            </p>
          </div>
          <div className="flex gap-2">
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="New template name" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white outline-none focus:border-indigo-500" />
            <button type="button" disabled={!name.trim()} onClick={() => { onSave(name, 'Shop production template'); setName(''); }} className="rounded-lg bg-indigo-600 px-3 text-xs font-bold text-white disabled:opacity-30">Save</button>
          </div>
          {importMessage && (
            <p className="mt-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-[10px] font-semibold text-indigo-200">
              {importMessage}
            </p>
          )}
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {templates.map((template) => {
              const changes = currentJob ? describeTemplateChanges(currentJob, template) : [];
              const requiresConfirmation = changes.length > 0;
              const isPendingApply = pendingApplyId === template.id;
              const isEditing = editingTemplateId === template.id;
              const isApplied = currentJob?.appliedTemplate?.id === template.id;

              return (
                <div key={template.id} className={`rounded-lg border p-2 ${isApplied ? 'border-indigo-500/40 bg-indigo-500/10' : 'border-slate-800 bg-slate-900/70'}`}>
                  <div className="flex items-start gap-2">
                    {isEditing ? (
                      <div className="min-w-0 flex-1">
                        <div className="flex gap-1">
                          <input
                            value={editingName}
                            onChange={(event) => setEditingName(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                onRename(template, editingName);
                                setEditingTemplateId(null);
                              }
                              if (event.key === 'Escape') setEditingTemplateId(null);
                            }}
                            className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-bold text-white outline-none focus:border-indigo-500"
                            autoFocus
                          />
                        </div>
                        <TemplateSummary template={template} />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          if (requiresConfirmation && !isPendingApply) {
                            setPendingApplyId(template.id);
                            return;
                          }
                          onApply(template);
                          setPendingApplyId(null);
                          setOpen(false);
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="flex items-center gap-2 truncate text-xs font-bold text-white">
                          <span className="min-w-0 truncate">{template.name}</span>
                          {isApplied && (
                            <span className="flex-none rounded-full border border-indigo-400/40 bg-indigo-500/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-indigo-200">
                              Applied
                            </span>
                          )}
                        </span>
                        <TemplateSummary template={template} />
                      </button>
                    )}
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <button type="button" onClick={() => { setPendingApplyId(null); setEditingTemplateId(template.id); setEditingName(template.name); }} className="text-[10px] font-semibold text-slate-400 hover:text-white">Rename</button>
                      <button type="button" onClick={() => { setPendingApplyId(null); setEditingTemplateId(null); onDuplicate(template); }} className="text-[10px] font-semibold text-slate-400 hover:text-white">Duplicate</button>
                      <button type="button" aria-label={`Delete ${template.name}`} onClick={() => { setPendingApplyId(null); setEditingTemplateId(null); onDelete(template); }} className="px-1 text-xs text-rose-400">×</button>
                    </div>
                  </div>
                  {isEditing && (
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => { onRename(template, editingName); setEditingTemplateId(null); }} disabled={!editingName.trim()} className="flex-1 rounded-md bg-indigo-600 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-30">
                        Save name
                      </button>
                      <button type="button" onClick={() => setEditingTemplateId(null)} className="flex-1 rounded-md border border-slate-700 px-2 py-1 text-[10px] font-bold text-slate-300">
                        Cancel
                      </button>
                    </div>
                  )}
                  {currentJob && (
                    <TemplateChangeSummary changes={changes} isPendingApply={isPendingApply} isApplied={isApplied} />
                  )}
                  {isApplied && changes.length > 0 && onUpdateAppliedTemplate && (
                    <button
                      type="button"
                      onClick={() => {
                        setPendingApplyId(null);
                        setEditingTemplateId(null);
                        onUpdateAppliedTemplate();
                      }}
                      className="mt-2 w-full rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[10px] font-bold text-amber-100 hover:bg-amber-500/20"
                    >
                      Update saved template from this job
                    </button>
                  )}
                  {isPendingApply && (
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => { onApply(template); setPendingApplyId(null); setOpen(false); }} className="flex-1 rounded-md bg-amber-500 px-2 py-1 text-[10px] font-bold text-slate-950">
                        {isApplied ? 'Reapply template' : 'Apply updates'}
                      </button>
                      <button type="button" onClick={() => setPendingApplyId(null)} className="flex-1 rounded-md border border-slate-700 px-2 py-1 text-[10px] font-bold text-slate-300">
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {templates.length === 0 && <p className="py-5 text-center text-xs text-slate-500">No shop templates saved.</p>}
          </div>
          <div className="mt-3 flex gap-2 border-t border-slate-800 pt-3">
            <button type="button" disabled={!templates.length} onClick={onExport} className="flex-1 rounded-lg border border-slate-700 py-2 text-[11px] font-bold text-slate-300 disabled:opacity-30">Export JSON</button>
            <label className="flex-1 cursor-pointer rounded-lg border border-slate-700 py-2 text-center text-[11px] font-bold text-slate-300">
              Import JSON
              <input type="file" accept=".json,application/json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.target.value = ''; }} />
            </label>
          </div>
          <p className="mt-2 text-[10px] font-semibold text-slate-500">
            Template JSON files are portable between workstations and do not include customer jobs or artwork.
          </p>
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

const TemplateChangeSummary: React.FC<{ changes: string[]; isPendingApply: boolean; isApplied: boolean }> = ({ changes, isPendingApply, isApplied }) => {
  const message = changes.length
    ? `${isPendingApply ? 'Confirm apply:' : isApplied ? 'Current job drift:' : 'Will update:'} ${changes.join(', ')}`
    : isApplied
      ? 'Applied template matches current job settings'
      : 'Matches current job settings';

  return (
    <p className={`mt-2 rounded border px-2 py-1 text-[10px] font-semibold ${changes.length ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>
      {message}
    </p>
  );
};
