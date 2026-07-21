import { Trash2, X } from 'lucide-react';
import { useRef } from 'react';
import type { EditorProject } from '../../editor/model';
import { useAccessibleDialog } from '../useAccessibleDialog';

export interface ProjectDrawerProps {
  open: boolean;
  projects: EditorProject[];
  onClose: () => void;
  onOpen: (projectId: string) => void | Promise<void>;
  onDelete: (projectId: string) => void | Promise<void>;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

export const ProjectDrawer = ({ open, projects, onClose, onOpen, onDelete }: ProjectDrawerProps) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useAccessibleDialog({
    open,
    onClose,
    initialFocusRef: closeButtonRef,
  });

  if (!open) return null;

  const newestFirst = [...projects].sort((left, right) => right.updatedAt - left.updatedAt);

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-labelledby="local-projects-title"
      tabIndex={-1}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="ml-auto flex h-full w-full max-w-sm flex-col border-l border-neutral-700 bg-neutral-900 shadow-2xl">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-800 px-4">
          <h2 id="local-projects-title" className="text-sm font-semibold text-neutral-100">Local projects</h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="grid h-10 w-10 place-items-center text-neutral-400 hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            aria-label="Close projects"
            title="Close projects"
            onClick={onClose}
          >
            <X aria-hidden="true" size={19} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {newestFirst.length === 0 ? (
            <p className="px-2 py-4 text-sm text-neutral-500">No local projects.</p>
          ) : (
            <ul className="grid gap-1">
              {newestFirst.map((project) => (
                <li key={project.id} className="grid grid-cols-[minmax(0,1fr)_40px] items-center gap-1 border-b border-neutral-800 py-1">
                  <button
                    type="button"
                    className="min-w-0 px-3 py-2 text-left hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400"
                    onClick={() => void onOpen(project.id)}
                  >
                    <span className="block truncate text-sm font-medium text-neutral-100">{project.name}</span>
                    <span className="mt-1 block text-xs text-neutral-500">Updated {dateFormatter.format(project.updatedAt)}</span>
                  </button>
                  <button
                    type="button"
                    className="grid h-10 w-10 place-items-center text-neutral-500 hover:bg-red-950 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                    aria-label={`Delete ${project.name}`}
                    title={`Delete ${project.name}`}
                    onClick={() => {
                      if (window.confirm(`Delete "${project.name}"?`)) void onDelete(project.id);
                    }}
                  >
                    <Trash2 aria-hidden="true" size={17} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
};
