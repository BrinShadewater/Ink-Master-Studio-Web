import {
  CopyPlus,
  Download,
  FolderOpen,
  Redo2,
  RefreshCw,
  Trash2,
  Undo2,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useReducer, type RefObject } from 'react';
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
  onExport: () => void;
  exportButtonRef?: RefObject<HTMLButtonElement | null>;
  mode?: 'easy' | 'advanced';
  onModeChange?: (mode: 'easy' | 'advanced') => void;
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
  buttonRef?: RefObject<HTMLButtonElement | null>;
}

const iconButtonClass = 'grid h-11 w-11 shrink-0 place-items-center rounded-md border border-transparent text-neutral-300 transition hover:border-neutral-700 hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-transparent disabled:hover:bg-transparent';

const IconButton = ({ label, icon: Icon, onClick, disabled = false, buttonRef }: IconButtonProps) => (
  <button
    ref={buttonRef}
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
  error: 'Save failed',
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
  onExport,
  exportButtonRef,
  mode = 'easy',
  onModeChange = () => undefined,
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

  if (!projectId && mode === 'easy') {
    return (
      <header className="flex h-14 min-w-0 items-center justify-between gap-2 border-b border-neutral-800 bg-neutral-950 px-2 shadow-[0_1px_0_rgba(255,255,255,0.03)] md:px-3">
        <a href="/" aria-label="InkMaster Studio home" className="flex h-11 shrink-0 items-center gap-1.5 rounded-md px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
          <img src="/logo/logo-mark.webp" alt="" className="h-10 w-10 object-contain" />
          <span className="hidden leading-[0.85] text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-200 sm:grid">
            <span>Ink</span>
            <span>Master</span>
          </span>
        </a>
        <div className="flex min-w-0 items-center gap-1" aria-label="Project commands">
          <div className="flex rounded-md border border-neutral-700 bg-neutral-900 p-0.5" role="radiogroup" aria-label="Editor mode">
            <button type="button" role="radio" aria-checked="true" className="h-11 min-w-11 rounded bg-emerald-500 px-2 text-[10px] font-semibold text-neutral-950 shadow-sm" onClick={() => onModeChange('easy')}>Basic</button>
            <button type="button" role="radio" aria-checked="false" className="h-11 min-w-11 rounded px-2 text-[10px] font-semibold text-neutral-400 hover:text-white" onClick={() => onModeChange('advanced')}>Advanced</button>
          </div>
          <IconButton label="Import artwork" icon={Upload} onClick={onImport} />
          <IconButton label="Open local projects" icon={FolderOpen} onClick={onOpenProjects} />
        </div>
      </header>
    );
  }

  return (
    <header className="grid h-28 min-w-0 grid-cols-[minmax(0,1fr)_auto] grid-rows-2 gap-x-1 border-b border-neutral-800 bg-neutral-950 px-2 shadow-[0_1px_0_rgba(255,255,255,0.03)] md:flex md:h-14 md:items-center md:gap-2 md:px-3">
      <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-2 self-center md:w-64 md:flex-none">
        <a href="/" aria-label="InkMaster Studio home" className="flex h-11 shrink-0 items-center gap-1.5 rounded-md px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
          <img src="/logo/logo-mark.webp" alt="" className="h-10 w-10 object-contain" />
          <span className="hidden leading-[0.85] text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-200 lg:grid">
            <span>Ink</span>
            <span>Master</span>
          </span>
        </a>
        <div className="min-w-0 flex-1">
          <label className="sr-only" htmlFor="editor-project-name">Project name</label>
          <div className="flex items-center justify-between gap-2 px-1">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-neutral-500">Project name</p>
            {projectId ? (
              <span
                className={`truncate text-[10px] leading-none ${saveStatus === 'error' ? 'text-red-400' : 'text-neutral-400'}`}
                role="status"
                aria-live="polite"
              >
                {saveStatusText[saveStatus]}
              </span>
            ) : null}
          </div>
          <input
            id="editor-project-name"
            className="h-11 w-full min-w-0 border-0 bg-transparent px-1 text-sm font-semibold text-neutral-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 md:h-7"
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
        </div>
      </div>

      <div className="col-span-2 row-start-2 flex min-w-0 items-center gap-1 border-t border-neutral-900 md:min-w-0 md:flex-1 md:border-t-0">
        <label className="sr-only" htmlFor="editor-variation">Variation</label>
        <span className="hidden text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-500 md:inline">Variation</span>
        <select
          id="editor-variation"
          className="h-11 w-24 shrink-0 rounded-md border border-neutral-700 bg-neutral-900 px-2 text-xs text-neutral-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 md:w-32"
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
        <span className="hidden text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-500 md:inline">Variation name</span>
        <input
          id="editor-variation-name"
          className="h-11 min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-2 text-xs text-neutral-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 md:w-48 md:flex-none"
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
        <div className="flex rounded-md border border-neutral-700 bg-neutral-900 p-0.5" role="radiogroup" aria-label="Editor mode">
          <button type="button" role="radio" aria-checked={mode === 'easy'} className={`h-11 min-w-11 rounded px-2 text-[10px] font-semibold ${mode === 'easy' ? 'bg-emerald-500 text-neutral-950 shadow-sm' : 'text-neutral-400 hover:text-white'}`} onClick={() => onModeChange('easy')}>Basic</button>
          <button type="button" role="radio" aria-checked={mode === 'advanced'} className={`h-11 min-w-11 rounded px-2 text-[10px] font-semibold ${mode === 'advanced' ? 'bg-emerald-500 text-neutral-950 shadow-sm' : 'text-neutral-400 hover:text-white'}`} onClick={() => onModeChange('advanced')}>Advanced</button>
        </div>
        <div className="hidden md:contents"><IconButton label="Undo" icon={Undo2} disabled={!canUndo} onClick={onUndo} />
        <IconButton label="Redo" icon={Redo2} disabled={!canRedo} onClick={onRedo} /></div>
        {saveStatus === 'error' ? <IconButton label="Retry save" icon={RefreshCw} onClick={onRetrySave} /> : null}
        <IconButton label="Import artwork" icon={Upload} onClick={onImport} />
        <IconButton label="Export" icon={Download} disabled={!projectId} onClick={onExport} buttonRef={exportButtonRef} />
        <IconButton label="Open local projects" icon={FolderOpen} onClick={onOpenProjects} />
      </div>
    </header>
  );
};
