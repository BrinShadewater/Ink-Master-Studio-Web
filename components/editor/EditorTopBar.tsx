import {
  CopyPlus,
  FolderOpen,
  Redo2,
  RefreshCw,
  Trash2,
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
  canDeleteVariation: boolean;
  onProjectNameChange: (name: string) => void;
  onVariationChange: (id: string) => void;
  onVariationNameChange: (name: string) => void;
  onDuplicateVariation: () => void;
  onDeleteVariation: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onRetrySave: () => void;
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

export interface VariationNameDraftState {
  variationId: string;
  externalName: string;
  draft: string;
}

export type VariationNameDraftAction =
  | { type: 'input'; value: string }
  | { type: 'restore' }
  | { type: 'sync'; variationId: string; variationName: string };

export const createVariationNameDraftState = (
  variationId: string,
  variationName: string,
): VariationNameDraftState => ({ variationId, externalName: variationName, draft: variationName });

export const variationNameDraftReducer = (
  state: VariationNameDraftState,
  action: VariationNameDraftAction,
): VariationNameDraftState => {
  if (action.type === 'input') return { ...state, draft: action.value };
  if (action.type === 'restore') return { ...state, draft: state.externalName };
  if (state.variationId === action.variationId && state.externalName === action.variationName) return state;
  return createVariationNameDraftState(action.variationId, action.variationName);
};

export const normalizeVariationNameDraft = (draft: string) => draft.trim() || 'Original';

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
  canDeleteVariation,
  onProjectNameChange,
  onVariationChange,
  onVariationNameChange,
  onDuplicateVariation,
  onDeleteVariation,
  onUndo,
  onRedo,
  onRetrySave,
  onImport,
  onOpenProjects,
}: EditorTopBarProps) => {
  const [projectNameState, updateProjectNameState] = useReducer(
    projectNameDraftReducer,
    createProjectNameDraftState(projectId, projectName),
  );
  const activeVariationName = variations.find(({ id }) => id === activeVariationId)?.name ?? 'Original';
  const [variationNameState, updateVariationNameState] = useReducer(
    variationNameDraftReducer,
    createVariationNameDraftState(activeVariationId, activeVariationName),
  );

  useEffect(() => {
    updateProjectNameState({ type: 'sync', projectId, projectName });
  }, [projectId, projectName]);

  useEffect(() => {
    updateVariationNameState({
      type: 'sync',
      variationId: activeVariationId,
      variationName: activeVariationName,
    });
  }, [activeVariationId, activeVariationName]);

  const commitProjectName = () => {
    const committedName = normalizeProjectNameDraft(projectNameState.draft);
    updateProjectNameState({ type: 'input', value: committedName });
    if (committedName !== projectNameState.externalName) onProjectNameChange(committedName);
  };

  const commitVariationName = () => {
    const committedName = normalizeVariationNameDraft(variationNameState.draft);
    updateVariationNameState({ type: 'input', value: committedName });
    if (committedName !== variationNameState.externalName) onVariationNameChange(committedName);
  };

  return (
    <header className="grid h-24 min-w-0 grid-cols-[minmax(0,1fr)_auto] grid-rows-2 gap-x-1 border-b border-neutral-800 bg-neutral-950 px-2 md:flex md:h-14 md:items-center md:gap-2 md:px-3">
      <div className="col-start-1 row-start-1 min-w-0 self-center md:w-48 md:flex-none">
        <label className="sr-only" htmlFor="editor-project-name">Project name</label>
        <input
          id="editor-project-name"
          className="h-7 w-full min-w-0 border-0 bg-transparent px-1 text-sm font-semibold text-neutral-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
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
        <div className="flex h-4 items-center gap-1 px-1 text-[10px] leading-none md:text-[11px]">
          <span
            className={saveStatus === 'error' ? 'text-red-400' : 'text-neutral-500'}
            role="status"
            aria-live="polite"
          >
            {saveStatusText[saveStatus]}
          </span>
          {saveStatus === 'error' ? (
            <button
              type="button"
              className="-my-1 grid h-6 w-6 place-items-center text-red-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              aria-label="Retry save"
              title="Retry save"
              onClick={onRetrySave}
            >
              <RefreshCw aria-hidden="true" size={12} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="col-span-2 row-start-2 flex min-w-0 items-center gap-1 border-t border-neutral-900 md:min-w-0 md:flex-1 md:border-t-0">
        <label className="sr-only" htmlFor="editor-variation">Variation</label>
        <select
          id="editor-variation"
          className="h-10 w-24 shrink-0 border border-neutral-700 bg-neutral-900 px-1 text-xs text-neutral-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 md:w-32 md:px-2"
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
        <label className="sr-only" htmlFor="editor-variation-name">Variation name</label>
        <input
          id="editor-variation-name"
          className="h-10 min-w-0 flex-1 border border-neutral-700 bg-neutral-900 px-2 text-xs text-neutral-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          value={variationNameState.draft}
          aria-label="Variation name"
          disabled={variations.length === 0}
          spellCheck={false}
          onChange={(event) => updateVariationNameState({ type: 'input', value: event.currentTarget.value })}
          onBlur={commitVariationName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              updateVariationNameState({ type: 'restore' });
            }
          }}
        />
        <IconButton
          label="Duplicate variation"
          icon={CopyPlus}
          disabled={variations.length === 0}
          onClick={onDuplicateVariation}
        />
        <IconButton
          label="Delete variation"
          icon={Trash2}
          disabled={!canDeleteVariation}
          onClick={onDeleteVariation}
        />
      </div>

      <div className="col-start-2 row-start-1 flex items-center gap-0 self-center md:gap-1" aria-label="Project commands">
        <IconButton label="Undo" icon={Undo2} disabled={!canUndo} onClick={onUndo} />
        <IconButton label="Redo" icon={Redo2} disabled={!canRedo} onClick={onRedo} />
        <IconButton label="Import artwork" icon={Upload} onClick={onImport} />
        <IconButton label="Open local projects" icon={FolderOpen} onClick={onOpenProjects} />
      </div>
    </header>
  );
};
