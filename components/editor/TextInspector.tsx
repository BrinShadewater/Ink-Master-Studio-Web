import { AlignCenter, AlignLeft, AlignRight, type LucideIcon } from 'lucide-react';
import { useEffect, useReducer, useRef, type KeyboardEvent } from 'react';
import type { EditorCommand } from '../../editor/history';
import {
  TEXT_FONT_FAMILIES,
  type TextLayer,
  type TextLayerStyle,
} from '../../editor/model';
import {
  RangeControl,
  TransformControls,
} from './TransformControls';

const textControlBounds = {
  fontSize: { min: 8, max: 400, step: 1 },
  letterSpacing: { min: -2, max: 40, step: 0.1 },
  outlineWidth: { min: 0, max: 20, step: 0.5 },
} as const;

const alignments: Array<{ value: TextLayer['align']; label: string; icon: LucideIcon }> = [
  { value: 'left', label: 'Align left', icon: AlignLeft },
  { value: 'center', label: 'Align center', icon: AlignCenter },
  { value: 'right', label: 'Align right', icon: AlignRight },
];

export interface FontSizeDraftState {
  layerId: string;
  externalValue: number;
  draft: string;
}

export type FontSizeDraftAction =
  | { type: 'input'; value: string }
  | { type: 'restore' }
  | { type: 'sync'; layerId: string; fontSize: number };

export const createFontSizeDraftState = (
  layerId: string,
  fontSize: number,
): FontSizeDraftState => ({ layerId, externalValue: fontSize, draft: String(fontSize) });

export const fontSizeDraftReducer = (
  state: FontSizeDraftState,
  action: FontSizeDraftAction,
): FontSizeDraftState => {
  if (action.type === 'input') return { ...state, draft: action.value };
  if (action.type === 'restore') return { ...state, draft: String(state.externalValue) };
  if (state.layerId === action.layerId && state.externalValue === action.fontSize) return state;
  return createFontSizeDraftState(action.layerId, action.fontSize);
};

export const normalizeFontSizeDraft = (draft: string, fallback: number): number => {
  const trimmed = draft.trim();
  if (!trimmed) return fallback;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(textControlBounds.fontSize.min, Math.min(textControlBounds.fontSize.max, parsed));
};

export interface TextInspectorProps {
  layer: TextLayer;
  dispatch: (command: EditorCommand) => void;
}

interface FontSizeControlProps {
  layer: TextLayer;
  onCommit: (fontSize: number) => void;
  onEnd: () => void;
}

const FontSizeControl = ({ layer, onCommit, onEnd }: FontSizeControlProps) => {
  const [state, updateState] = useReducer(
    fontSizeDraftReducer,
    createFontSizeDraftState(layer.id, layer.fontSize),
  );
  const restoreOnBlurRef = useRef(false);

  useEffect(() => {
    updateState({ type: 'sync', layerId: layer.id, fontSize: layer.fontSize });
  }, [layer.id, layer.fontSize]);

  const commit = () => {
    if (restoreOnBlurRef.current) {
      restoreOnBlurRef.current = false;
      onEnd();
      return;
    }
    const fontSize = normalizeFontSizeDraft(state.draft, state.externalValue);
    updateState({ type: 'input', value: String(fontSize) });
    if (fontSize !== state.externalValue) onCommit(fontSize);
    onEnd();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      restoreOnBlurRef.current = true;
      updateState({ type: 'restore' });
      event.currentTarget.blur();
    }
  };

  return (
    <div className="grid gap-2">
      <label className="text-xs font-medium text-neutral-300" htmlFor="editor-font-size">Size</label>
      <input
        id="editor-font-size"
        className="h-9 w-full border border-neutral-700 bg-neutral-950 px-2 text-sm tabular-nums text-neutral-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        type="number"
        min={textControlBounds.fontSize.min}
        max={textControlBounds.fontSize.max}
        step={textControlBounds.fontSize.step}
        value={state.draft}
        onChange={(event) => updateState({ type: 'input', value: event.currentTarget.value })}
        onBlur={commit}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
};

export const TextInspector = ({ layer, dispatch }: TextInspectorProps) => {
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const endHistoryGroup = () => dispatch({ type: 'end-history-group' });
  const style: TextLayerStyle = {
    fontFamily: layer.fontFamily,
    fontSize: layer.fontSize,
    color: layer.color,
    align: layer.align,
    letterSpacing: layer.letterSpacing,
    outlineWidth: layer.outlineWidth,
    outlineColor: layer.outlineColor,
  };
  const updateStyle = (next: Partial<TextLayerStyle>, historyGroup?: string) => dispatch({
    type: 'set-text-style',
    layerId: layer.id,
    style: { ...style, ...next },
    historyGroup,
  });

  useEffect(() => () => {
    dispatchRef.current({ type: 'end-history-group' });
  }, [layer.id]);

  return (
    <div className="grid min-w-0 gap-5 p-4">
      <div className="grid min-w-0 gap-2">
        <label className="text-xs font-medium text-neutral-300" htmlFor="editor-text-content">Content</label>
        <textarea
          id="editor-text-content"
          className="min-h-20 w-full min-w-0 resize-y border border-neutral-700 bg-neutral-950 px-2 py-2 text-sm leading-5 text-neutral-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          rows={3}
          maxLength={500}
          value={layer.text}
          onChange={(event) => dispatch({
            type: 'set-text-content',
            layerId: layer.id,
            text: event.currentTarget.value,
            historyGroup: 'inspector-text-content',
          })}
          onBlur={endHistoryGroup}
        />
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-3">
        <div className="grid min-w-0 gap-2">
          <label className="text-xs font-medium text-neutral-300" htmlFor="editor-font-family">Font</label>
          <select
            id="editor-font-family"
            className="h-9 w-full min-w-0 border border-neutral-700 bg-neutral-950 px-2 text-sm text-neutral-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            value={layer.fontFamily}
            onChange={(event) => updateStyle({ fontFamily: event.currentTarget.value as TextLayer['fontFamily'] })}
          >
            {TEXT_FONT_FAMILIES.map((font) => <option key={font} value={font}>{font}</option>)}
          </select>
        </div>
        <FontSizeControl
          layer={layer}
          onCommit={(fontSize) => updateStyle({ fontSize }, 'inspector-font-size')}
          onEnd={endHistoryGroup}
        />
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-3">
        <label className="grid min-w-0 gap-2 text-xs font-medium text-neutral-300" htmlFor="editor-fill-color">
          Fill color
          <input
            id="editor-fill-color"
            className="h-9 w-full min-w-0 cursor-pointer border border-neutral-700 bg-neutral-950 p-1"
            type="color"
            value={layer.color}
            onChange={(event) => updateStyle({ color: event.currentTarget.value }, 'inspector-fill-color')}
            onPointerUp={endHistoryGroup}
            onKeyUp={endHistoryGroup}
            onBlur={endHistoryGroup}
          />
        </label>
        <label className="grid min-w-0 gap-2 text-xs font-medium text-neutral-300" htmlFor="editor-outline-color">
          Outline color
          <input
            id="editor-outline-color"
            className="h-9 w-full min-w-0 cursor-pointer border border-neutral-700 bg-neutral-950 p-1"
            type="color"
            value={layer.outlineColor}
            onChange={(event) => updateStyle({ outlineColor: event.currentTarget.value }, 'inspector-outline-color')}
            onPointerUp={endHistoryGroup}
            onKeyUp={endHistoryGroup}
            onBlur={endHistoryGroup}
          />
        </label>
      </div>

      <fieldset className="grid min-w-0 gap-2">
        <legend className="text-xs font-medium text-neutral-300">Alignment</legend>
        <div className="grid h-9 grid-cols-3 border border-neutral-700" role="group" aria-label="Text alignment">
          {alignments.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              className={`grid min-w-0 place-items-center border-r border-neutral-700 last:border-r-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400 ${
                layer.align === value ? 'bg-emerald-500 text-neutral-950' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
              }`}
              aria-label={label}
              aria-pressed={layer.align === value}
              title={label}
              onClick={() => updateStyle({ align: value })}
            >
              <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
            </button>
          ))}
        </div>
      </fieldset>

      <RangeControl
        id="editor-letter-spacing"
        label="Letter spacing"
        value={layer.letterSpacing}
        bounds={textControlBounds.letterSpacing}
        onChange={(value) => updateStyle({ letterSpacing: value }, 'inspector-letter-spacing')}
        onEnd={endHistoryGroup}
      />
      <RangeControl
        id="editor-outline-width"
        label="Outline width"
        value={layer.outlineWidth}
        bounds={textControlBounds.outlineWidth}
        onChange={(value) => updateStyle({ outlineWidth: value }, 'inspector-outline-width')}
        onEnd={endHistoryGroup}
      />

      <div className="h-px bg-neutral-800" aria-hidden="true" />
      <TransformControls layer={layer} dispatch={dispatch} />
    </div>
  );
};
