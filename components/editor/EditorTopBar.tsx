import {
  CopyPlus,
  FolderOpen,
  Redo2,
  Undo2,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useReducer } from 'react';
import type { SaveStatus } from '../../editor/useEditorWorkspace';

export interface EditorTopBarProps {
  projectId: string | null;
  projectName: string;
  activeVariationId: string;
  variations: Array<{ id: string; name: string }>;
  saveStatus: SaveStatus;
  canUndo: boolean;
  canRedo: boolean;
  onProjectNameChange: (name: string) => void;
  onVariationChange: (id: string) => void;
  onDuplicateVariation: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onImport: () => void;
  onOpenProjects: () => void;
}

export interface ProjectNameDraftState {
  projectId: string | null;
  externalName: string;
  draft: string;
}

export type ProjectNameDraftAction =
  | { type: 'input'; value: string }
  | { type: 'restore' }
  | { type: 'sync'; projectId: string | null; projectName: string };

export const createProjectNameDraftState = (
  projectId: string | null,
  projectName: string,
): ProjectNameDraftState => ({ projectId, externalName: projectName, draft: projectName });

export const projectNameDraftReducer = (
  state: ProjectNameDraftState,
  action: ProjectNameDraftAction,
): ProjectNameDraftState => {
  if (action.type === 'input') return { ...state, draft: action.value };
  if (action.type === 'restore') return { ...state, draft: state.externalName };
  if (state.projectId === action.projectId && state.externalName === action.projectName) return state;
  return createProjectNameDraftState(action.projectId, action.projectName);
};

export const normalizeProjectNameDraft = (draft: string) => draft.trim() || 'Untitled design';

interface IconButtonProps {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
}

const iconButtonClass = 'grid h-10 w-10 shrink-0 place-items-center border border-transparent text-neutral-300 transition hover:border-neutral-700 hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-transparent disabled:hover:bg-transparent';

const IconButton = ({ label, icon: Icon, onClick, disabled = false }: IconButtonProps) => (
  <button
    type="button"
    className={iconButtonClass}
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={onClick}
  >
    <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
  </button>
);

const saveStatusText: Record<SaveStatus, string> = {
  saved: 'Saved locally',
  saving: 'Saving locally',
  error: 'Local save failed',
};

export const EditorTopBar = ({
  projectId,
  projectName,
  activeVariationId,
  variations,
  saveStatus,
  canUndo,
  canRedo,
  onProjectNameChange,
  onVariationChange,
  onDuplicateVariation,
  onUndo,
  onRedo,
  onImport,
  onOpenProjects,
}: EditorTopBarProps) => {
  const [projectNameState, updateProjectNameState] = useReducer(
    projectNameDraftReducer,
    createProjectNameDraftState(projectId, projectName),
  );

  useEffect(() => {
    updateProjectNameState({ type: 'sync', projectId, projectName });
  }, [projectId, projectName]);

  const commitProjectName = () => {
    const committedName = normalizeProjectNameDraft(projectNameState.draft);
    updateProjectNameState({ type: 'input', value: committedName });
    if (committedName !== projectNameState.externalName) onProjectNameChange(committedName);
  };

  return (
    <header className="flex h-14 min-w-0 items-center gap-1 border-b border-neutral-800 bg-neutral-950 px-2 md:gap-2 md:px-3">
    <div className="min-w-[64px] flex-1 md:max-w-64">
      <label className="sr-only" htmlFor="editor-project-name">Project name</label>
      <input
        id="editor-project-name"
        className="h-8 w-full min-w-0 border-0 bg-transparent px-1 text-sm font-semibold text-neutral-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        value={projectNameState.draft}
        aria-label="Project name"
        spellCheck={false}
        onChange={(event) => updateProjectNameState({ type: 'input', value: event.currentTarget.value })}
        onBlur={commitProjectName}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            updateProjectNameState({ type: 'restore' });
          }
        }}
      />
      <span
        className={`hidden px-1 text-[11px] leading-none md:block ${saveStatus === 'error' ? 'text-red-400' : 'text-neutral-500'}`}
        role="status"
      >
        {saveStatusText[saveStatus]}
      </span>
    </div>

    <div className="flex min-w-0 items-center gap-1 md:gap-2">
      <label className="sr-only" htmlFor="editor-variation">Variation</label>
      <select
        id="editor-variation"
        className="h-10 w-[68px] min-w-0 border border-neutral-700 bg-neutral-900 px-1 text-xs text-neutral-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 md:w-36 md:px-2"
        value={activeVariationId}
        disabled={variations.length === 0}
        aria-label="Variation"
        onChange={(event) => onVariationChange(event.currentTarget.value)}
      >
        {variations.length === 0 ? <option value="">Original</option> : null}
        {variations.map((variation) => (
          <option key={variation.id} value={variation.id}>{variation.name}</option>
        ))}
      </select>
      <IconButton
        label="Duplicate variation"
        icon={CopyPlus}
        disabled={variations.length === 0}
        onClick={onDuplicateVariation}
      />
    </div>

    <div className="flex items-center gap-1" aria-label="Project commands">
      <IconButton label="Undo" icon={Undo2} disabled={!canUndo} onClick={onUndo} />
      <IconButton label="Redo" icon={Redo2} disabled={!canRedo} onClick={onRedo} />
      <IconButton label="Import artwork" icon={Upload} onClick={onImport} />
      <IconButton label="Open projects" icon={FolderOpen} onClick={onOpenProjects} />
    </div>
  </header>
  );
};
