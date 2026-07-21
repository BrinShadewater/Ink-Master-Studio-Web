import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  ImagePlus,
  Trash2,
  Type,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  useEffect,
  useReducer,
  useRef,
  type KeyboardEvent,
  type Ref,
  type RefObject,
} from 'react';
import type { EditorCommand } from '../../editor/history';
import type { DesignLayer, DesignVariation } from '../../editor/model';
import { useAccessibleDialog } from '../useAccessibleDialog';

export interface LayerPanelProps {
  variation: DesignVariation | null;
  onAddImage: () => void;
  onAddText: () => void;
  onSelectLayer: (layer: DesignLayer) => void;
  dispatch: (command: EditorCommand) => void;
  className?: string;
  titleId?: string;
  onClose?: () => void;
  closeButtonRef?: Ref<HTMLButtonElement>;
}

export interface LayerNameDraftState {
  layerId: string;
  externalName: string;
  draft: string;
}

export type LayerNameDraftAction =
  | { type: 'input'; value: string }
  | { type: 'restore' }
  | { type: 'sync'; layerId: string; layerName: string };

export const createLayerNameDraftState = (
  layerId: string,
  layerName: string,
): LayerNameDraftState => ({ layerId, externalName: layerName, draft: layerName });

export const layerNameDraftReducer = (
  state: LayerNameDraftState,
  action: LayerNameDraftAction,
): LayerNameDraftState => {
  if (action.type === 'input') return { ...state, draft: action.value };
  if (action.type === 'restore') return { ...state, draft: state.externalName };
  if (state.layerId === action.layerId && state.externalName === action.layerName) return state;
  return createLayerNameDraftState(action.layerId, action.layerName);
};

export const normalizeLayerNameDraft = (draft: string, type: DesignLayer['type']) =>
  draft.trim() || (type === 'image' ? 'Image' : 'Text');

interface LayerNameEscapeEvent {
  preventDefault: () => void;
  stopPropagation: () => void;
  currentTarget: { blur: () => void };
}

export const restoreLayerNameDraft = (
  event: LayerNameEscapeEvent,
  restore: () => void,
) => {
  event.preventDefault();
  event.stopPropagation();
  restore();
  event.currentTarget.blur();
};

interface IconButtonProps {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
}

const iconButtonClass = 'grid h-8 w-8 shrink-0 place-items-center text-neutral-400 transition hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent';

const IconButton = ({
  label,
  icon: Icon,
  onClick,
  disabled = false,
  buttonRef,
}: IconButtonProps) => (
  <button
    ref={buttonRef}
    type="button"
    className={iconButtonClass}
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={onClick}
  >
    <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
  </button>
);

interface LayerNameInputProps {
  layer: DesignLayer;
  onCommit: (name: string) => void;
  onFocus: () => void;
}

const LayerNameInput = ({ layer, onCommit, onFocus }: LayerNameInputProps) => {
  const [state, updateState] = useReducer(
    layerNameDraftReducer,
    createLayerNameDraftState(layer.id, layer.name),
  );
  const restoreOnBlurRef = useRef(false);

  useEffect(() => {
    updateState({ type: 'sync', layerId: layer.id, layerName: layer.name });
  }, [layer.id, layer.name]);

  const commit = () => {
    if (restoreOnBlurRef.current) {
      restoreOnBlurRef.current = false;
      return;
    }
    const name = normalizeLayerNameDraft(state.draft, layer.type);
    updateState({ type: 'input', value: name });
    if (name !== state.externalName) onCommit(name);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      restoreOnBlurRef.current = true;
      restoreLayerNameDraft(event, () => updateState({ type: 'restore' }));
    }
  };

  return (
    <input
      className="h-8 min-w-0 bg-transparent px-1 text-sm text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400"
      aria-label={`Layer name: ${layer.name}`}
      value={state.draft}
      maxLength={120}
      onChange={(event) => updateState({ type: 'input', value: event.currentTarget.value })}
      onFocus={onFocus}
      onBlur={commit}
      onKeyDown={handleKeyDown}
    />
  );
};

export const LayerPanel = ({
  variation,
  onAddImage,
  onAddText,
  onSelectLayer,
  dispatch,
  className = '',
  titleId,
  onClose,
  closeButtonRef,
}: LayerPanelProps) => {
  const layers = variation?.layers ?? [];
  const selectedLayerId = variation?.selectedLayerId ?? null;

  return (
    <section className={`flex min-h-0 flex-col bg-neutral-900 ${className}`} aria-label="Layers panel">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-neutral-800 px-3">
        <h2 id={titleId} className="text-sm font-semibold text-neutral-100">Layers</h2>
        <div className="flex items-center gap-1">
          <IconButton label="Add image" icon={ImagePlus} onClick={onAddImage} disabled={!variation} />
          <IconButton label="Add text" icon={Type} onClick={onAddText} disabled={!variation} />
          {onClose ? (
            <IconButton label="Close layers" icon={X} onClick={onClose} buttonRef={closeButtonRef} />
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {!variation ? (
          <p className="px-2 py-3 text-xs leading-5 text-neutral-500">Import artwork to create layers.</p>
        ) : (
          <ul className="grid gap-1">
            {[...layers].reverse().map((layer) => {
              const storedIndex = layers.findIndex(({ id }) => id === layer.id);
              const selected = layer.id === selectedLayerId;
              const TypeIcon = layer.type === 'image' ? ImagePlus : Type;
              return (
                <li
                  key={layer.id}
                  data-layer-id={layer.id}
                  className={`border ${selected ? 'border-emerald-500 bg-neutral-800' : 'border-transparent hover:border-neutral-700'}`}
                >
                  <div className="grid grid-cols-[32px_minmax(0,1fr)_32px] items-center">
                    <button
                      type="button"
                      className={iconButtonClass}
                      value={layer.id}
                      aria-label={`Select layer ${layer.name}`}
                      aria-pressed={selected}
                      title={`Select ${layer.name}`}
                      onClick={() => onSelectLayer(layer)}
                    >
                      <TypeIcon aria-hidden="true" size={16} strokeWidth={1.8} />
                    </button>
                    <LayerNameInput
                      layer={layer}
                      onFocus={() => onSelectLayer(layer)}
                      onCommit={(name) => dispatch({ type: 'rename-layer', layerId: layer.id, name })}
                    />
                    <IconButton
                      label={layer.visible ? 'Hide layer' : 'Show layer'}
                      icon={layer.visible ? Eye : EyeOff}
                      onClick={() => dispatch({
                        type: 'set-layer-visibility', layerId: layer.id, visible: !layer.visible,
                      })}
                    />
                  </div>

                  {selected ? (
                    <div className="flex h-9 items-center justify-end gap-1 border-t border-neutral-700 px-1" aria-label="Selected layer actions">
                      <IconButton
                        label="Move layer up"
                        icon={ArrowUp}
                        disabled={storedIndex === layers.length - 1}
                        onClick={() => dispatch({ type: 'move-layer', layerId: layer.id, direction: 'up' })}
                      />
                      <IconButton
                        label="Move layer down"
                        icon={ArrowDown}
                        disabled={storedIndex === 0}
                        onClick={() => dispatch({ type: 'move-layer', layerId: layer.id, direction: 'down' })}
                      />
                      <IconButton
                        label="Duplicate layer"
                        icon={Copy}
                        onClick={() => dispatch({ type: 'duplicate-layer', layerId: layer.id })}
                      />
                      <IconButton
                        label="Delete layer"
                        icon={Trash2}
                        disabled={layers.length <= 1}
                        onClick={() => dispatch({ type: 'delete-layer', layerId: layer.id })}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};

export interface LayerDrawerProps extends Omit<LayerPanelProps, 'className' | 'titleId'> {
  open: boolean;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}

export const LayerDrawer = ({
  open,
  onClose,
  returnFocusRef,
  ...panelProps
}: LayerDrawerProps) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useAccessibleDialog({
    open,
    onClose,
    initialFocusRef: closeButtonRef,
    returnFocusRef,
  });

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex bg-black/70 md:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-layers-title"
      tabIndex={-1}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="ml-auto flex h-full w-full max-w-sm flex-col border-l border-neutral-700 bg-neutral-900 shadow-2xl">
        <LayerPanel
          {...panelProps}
          titleId="mobile-layers-title"
          className="h-full"
          onClose={onClose}
          closeButtonRef={closeButtonRef}
        />
      </section>
    </div>
  );
};
