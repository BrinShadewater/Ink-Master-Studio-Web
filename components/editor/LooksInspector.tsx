import { Dices, RefreshCw, RotateCcw } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import type { DecodedImageEntry } from '../../editor/decodedImages';
import type { EditorCommand } from '../../editor/history';
import {
  LOOK_IDS,
  createDefaultLook,
  createLookSeed,
  isSeededLook,
  type LookId,
  type VariationLook,
} from '../../editor/lookModel';
import type { LookRenderCoordinator } from '../../editor/lookRenderCoordinator';
import type { DesignVariation, EditorAsset } from '../../editor/model';
import { VariationPreviewCanvas } from './VariationPreviewCanvas';

export const lookControlBounds = {
  strength: { min: 0, max: 100, step: 1 },
  contrastClean: { min: 0, max: 40, step: 1 },
  saturationClean: { min: -20, max: 40, step: 1 },
  clarity: { min: 0, max: 30, step: 1 },
  contrastHigh: { min: 0, max: 100, step: 1 },
  blackPoint: { min: 0, max: 40, step: 1 },
  saturationHigh: { min: -100, max: 50, step: 1 },
  contrastMonochrome: { min: -50, max: 100, step: 1 },
  brightness: { min: -50, max: 50, step: 1 },
  balance: { min: -50, max: 50, step: 1 },
  levels: { min: 2, max: 8, step: 1 },
  contrastPosterized: { min: 0, max: 100, step: 1 },
  cellSize: { min: 4, max: 32, step: 1 },
  angle: { min: 0, max: 180, step: 1 },
  warmth: { min: 0, max: 100, step: 1 },
  fade: { min: 0, max: 100, step: 1 },
  grain: { min: 0, max: 100, step: 1 },
  wear: { min: 0, max: 100, step: 1 },
  textureScale: { min: 1, max: 12, step: 1 },
  edgeBreakup: { min: 0, max: 100, step: 1 },
} as const;

const lookLabels: Record<LookId, string> = {
  original: 'Original',
  'clean-photo': 'Clean Photo',
  'high-contrast': 'High Contrast',
  monochrome: 'Monochrome',
  duotone: 'Duotone',
  posterized: 'Posterized',
  'graphic-halftone': 'Graphic Halftone',
  'vintage-ink': 'Vintage Ink',
  'distressed-print': 'Distressed Print',
};

const lookDescriptions: Record<LookId, string> = {
  original: 'Keep the artwork unchanged.',
  'clean-photo': 'Crisper color and edge clarity.',
  'high-contrast': 'Stronger darks and highlights.',
  monochrome: 'Single-color print treatment.',
  duotone: 'Two-color ink conversion.',
  posterized: 'Reduced tonal color blocks.',
  'graphic-halftone': 'Dot-screen graphic texture.',
  'vintage-ink': 'Faded, warm ink with grain.',
  'distressed-print': 'Worn print texture and broken edges.',
};

type CandidateRecipes = Record<LookId, VariationLook>;
type ControlBounds = { min: number; max: number; step: number };

export const createLookCandidateRecipes = (
  activeLook: VariationLook,
  nextSeed: () => number = createLookSeed,
): CandidateRecipes => {
  const recipes = {} as CandidateRecipes;
  for (const id of LOOK_IDS) {
    if (id === activeLook.id) {
      recipes[id] = activeLook;
    } else if (id === 'vintage-ink' || id === 'distressed-print') {
      recipes[id] = createDefaultLook(id, nextSeed());
    } else {
      recipes[id] = createDefaultLook(id);
    }
  }
  return recipes;
};

export interface LooksInspectorProps {
  key?: string;
  variation: DesignVariation;
  assetsById: Record<string, EditorAsset>;
  imagesById: Record<string, DecodedImageEntry>;
  coordinator: LookRenderCoordinator;
  dispatch: (command: EditorCommand) => void;
  error: string | null;
  onRetry: () => void;
}

interface NumericLookControlProps {
  key?: string;
  id: string;
  label: string;
  value: number;
  bounds: ControlBounds;
  disabled?: boolean;
  onChange: (value: number) => void;
  onEnd: () => void;
}

const NumericLookControl = ({
  id,
  label,
  value,
  bounds,
  disabled = false,
  onChange,
  onEnd,
}: NumericLookControlProps) => {
  const finishPointer = (_event: PointerEvent<HTMLInputElement>) => onEnd();
  const finishKey = (_event: KeyboardEvent<HTMLInputElement>) => onEnd();
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-xs font-medium text-neutral-300" htmlFor={`${id}-number`}>{label}</label>
        <input
          id={`${id}-number`}
          type="number"
          min={bounds.min}
          max={bounds.max}
          step={bounds.step}
          value={value}
          disabled={disabled}
          className="h-8 w-20 border border-neutral-700 bg-neutral-950 px-2 text-right text-xs tabular-nums text-neutral-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-40"
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          onKeyUp={finishKey}
          onBlur={onEnd}
        />
      </div>
      <input
        id={id}
        type="range"
        min={bounds.min}
        max={bounds.max}
        step={bounds.step}
        value={value}
        disabled={disabled}
        aria-label={`${label} range`}
        className="h-5 w-full accent-emerald-500 disabled:opacity-40"
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        onPointerUp={finishPointer}
        onKeyUp={finishKey}
        onBlur={onEnd}
      />
    </div>
  );
};

interface ColorLookControlProps {
  id: string;
  label: string;
  value: string;
  onInput: (value: string) => void;
  onCommit: (value: string) => void;
}

const ColorLookControl = ({ id, label, value, onInput, onCommit }: ColorLookControlProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return undefined;
    // React treats color onChange as live input; the native event marks the picker commit.
    let active = true;
    const commitNativeChange = () => {
      const committedValue = input.value;
      queueMicrotask(() => {
        if (active) commitRef.current(committedValue);
      });
    };
    input.addEventListener('change', commitNativeChange);
    return () => {
      active = false;
      input.removeEventListener('change', commitNativeChange);
    };
  }, []);

  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-xs font-medium text-neutral-300" htmlFor={id}>{label}</label>
      <input
        ref={inputRef}
        id={id}
        type="color"
        value={value}
        className="h-9 w-12 border border-neutral-700 bg-neutral-950 p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        onInput={(event) => onInput(event.currentTarget.value)}
        onChange={() => undefined}
        onBlur={(event) => onCommit(event.currentTarget.value)}
      />
    </div>
  );
};

const commandButtonClass = 'flex h-9 items-center justify-center gap-2 border border-neutral-700 px-3 text-xs font-medium text-neutral-300 transition hover:border-neutral-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400';

export const LooksInspector = ({
  variation,
  assetsById,
  imagesById,
  coordinator,
  dispatch,
  error,
  onRetry,
}: LooksInspectorProps) => {
  const candidatesRef = useRef<CandidateRecipes | null>(null);
  if (!candidatesRef.current) {
    candidatesRef.current = createLookCandidateRecipes(variation.look);
  }
  const [thumbnailFailures, setThumbnailFailures] = useState<Record<string, string>>({});
  const [retryGeneration, setRetryGeneration] = useState(0);
  const previousLookIdRef = useRef(variation.look.id);
  const endHistoryGroup = () => dispatch({ type: 'end-history-group' });

  useEffect(() => {
    if (previousLookIdRef.current === variation.look.id) return;
    previousLookIdRef.current = variation.look.id;
    dispatch({ type: 'end-history-group' });
  }, [dispatch, variation.look.id]);

  useEffect(() => () => dispatch({ type: 'end-history-group' }), [dispatch]);

  const setLook = (look: VariationLook, historyGroup?: string) => {
    dispatch({ type: 'set-look', look, historyGroup });
  };
  const updateLook = (patch: Partial<VariationLook>, historyGroup: string) => {
    setLook({ ...variation.look, ...patch } as VariationLook, historyGroup);
  };
  const updateDistress = (wear: number) => {
    if (variation.look.id === 'distressed-print') {
      updateLook({ wear }, 'look-distress');
      return;
    }
    setLook({
      ...createDefaultLook('distressed-print', createLookSeed()),
      wear,
    }, 'look-distress');
  };
  const numericControl = (
    id: string,
    label: string,
    parameter: string,
    value: number,
    bounds: ControlBounds,
  ) => (
    <NumericLookControl
      key={id}
      id={`editor-look-${id}`}
      label={label}
      value={value}
      bounds={bounds}
      onChange={(nextValue) => updateLook(
        { [parameter]: nextValue } as Partial<VariationLook>,
        `look-${variation.look.id}-${id}`,
      )}
      onEnd={endHistoryGroup}
    />
  );

  const advancedControls = (() => {
    const look = variation.look;
    switch (look.id) {
      case 'original':
        return <p className="text-xs leading-5 text-neutral-500">Original has no additional controls.</p>;
      case 'clean-photo':
        return <>
          {numericControl('contrast', 'Contrast', 'contrast', look.contrast, lookControlBounds.contrastClean)}
          {numericControl('saturation', 'Saturation', 'saturation', look.saturation, lookControlBounds.saturationClean)}
          {numericControl('clarity', 'Clarity', 'clarity', look.clarity, lookControlBounds.clarity)}
        </>;
      case 'high-contrast':
        return <>
          {numericControl('contrast', 'Contrast', 'contrast', look.contrast, lookControlBounds.contrastHigh)}
          {numericControl('black-point', 'Black point', 'blackPoint', look.blackPoint, lookControlBounds.blackPoint)}
          {numericControl('saturation', 'Saturation', 'saturation', look.saturation, lookControlBounds.saturationHigh)}
        </>;
      case 'monochrome':
        return <>
          {numericControl('contrast', 'Contrast', 'contrast', look.contrast, lookControlBounds.contrastMonochrome)}
          {numericControl('brightness', 'Brightness', 'brightness', look.brightness, lookControlBounds.brightness)}
        </>;
      case 'duotone':
        return <>
          <ColorLookControl
            id="editor-look-shadow-color"
            label="Shadow color"
            value={look.shadowColor}
            onInput={(shadowColor) => updateLook({ shadowColor }, 'look-duotone-shadow-color')}
            onCommit={(shadowColor) => {
              updateLook({ shadowColor }, 'look-duotone-shadow-color');
              endHistoryGroup();
            }}
          />
          <ColorLookControl
            id="editor-look-highlight-color"
            label="Highlight color"
            value={look.highlightColor}
            onInput={(highlightColor) => updateLook({ highlightColor }, 'look-duotone-highlight-color')}
            onCommit={(highlightColor) => {
              updateLook({ highlightColor }, 'look-duotone-highlight-color');
              endHistoryGroup();
            }}
          />
          {numericControl('balance', 'Balance', 'balance', look.balance, lookControlBounds.balance)}
        </>;
      case 'posterized':
        return <>
          {numericControl('levels', 'Levels', 'levels', look.levels, lookControlBounds.levels)}
          {numericControl('contrast', 'Contrast', 'contrast', look.contrast, lookControlBounds.contrastPosterized)}
        </>;
      case 'graphic-halftone':
        return <>
          {numericControl('cell-size', 'Cell size', 'cellSize', look.cellSize, lookControlBounds.cellSize)}
          {numericControl('angle', 'Angle', 'angle', look.angle, lookControlBounds.angle)}
          <ColorLookControl
            id="editor-look-foreground-color"
            label="Foreground color"
            value={look.foregroundColor}
            onInput={(foregroundColor) => updateLook({ foregroundColor }, 'look-graphic-halftone-foreground-color')}
            onCommit={(foregroundColor) => {
              updateLook({ foregroundColor }, 'look-graphic-halftone-foreground-color');
              endHistoryGroup();
            }}
          />
          <fieldset>
            <legend className="mb-2 text-xs font-medium text-neutral-300">Background</legend>
            <div className="grid grid-cols-2 border border-neutral-700">
              {(['transparent', 'solid'] as const).map((backgroundMode) => (
                <button
                  key={backgroundMode}
                  type="button"
                  className={`h-9 px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400 ${look.background === backgroundMode ? 'bg-emerald-500 text-neutral-950' : 'bg-neutral-950 text-neutral-300 hover:bg-neutral-800'}`}
                  aria-label={`${backgroundMode === 'transparent' ? 'Transparent' : 'Solid'} background`}
                  aria-pressed={look.background === backgroundMode}
                  onClick={() => {
                    endHistoryGroup();
                    setLook({ ...look, background: backgroundMode });
                  }}
                >
                  {backgroundMode === 'transparent' ? 'Transparent' : 'Solid'}
                </button>
              ))}
            </div>
          </fieldset>
          <ColorLookControl
            id="editor-look-background-color"
            label="Background color"
            value={look.backgroundColor}
            onInput={(backgroundColor) => updateLook({ backgroundColor }, 'look-graphic-halftone-background-color')}
            onCommit={(backgroundColor) => {
              updateLook({ backgroundColor }, 'look-graphic-halftone-background-color');
              endHistoryGroup();
            }}
          />
        </>;
      case 'vintage-ink':
        return <>
          {numericControl('warmth', 'Warmth', 'warmth', look.warmth, lookControlBounds.warmth)}
          {numericControl('fade', 'Fade', 'fade', look.fade, lookControlBounds.fade)}
          {numericControl('grain', 'Grain', 'grain', look.grain, lookControlBounds.grain)}
        </>;
      case 'distressed-print':
        return <>
          {numericControl('wear', 'Wear', 'wear', look.wear, lookControlBounds.wear)}
          {numericControl('texture-scale', 'Texture scale', 'textureScale', look.textureScale, lookControlBounds.textureScale)}
          {numericControl('edge-breakup', 'Edge breakup', 'edgeBreakup', look.edgeBreakup, lookControlBounds.edgeBreakup)}
        </>;
    }
  })();
  const previewError = error ?? Object.values(thumbnailFailures)[0] ?? null;

  return (
    <>
      <div className="sticky top-0 z-10 flex h-12 items-center justify-between border-b border-neutral-800 bg-neutral-900 px-4">
        <h2 className="text-sm font-semibold text-neutral-100">Creator finish</h2>
        <button
          type="button"
          className={commandButtonClass}
          aria-label="Reset Look"
          onClick={() => {
            endHistoryGroup();
            dispatch({ type: 'reset-look' });
          }}
        >
          <RotateCcw aria-hidden="true" size={15} />
          Reset Look
        </button>
      </div>

      <div className="grid gap-5 p-4">
        <div className="grid gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-xs font-semibold text-neutral-200">Creator presets</h3>
            <p className="text-[11px] text-neutral-500">Choose a print direction</p>
          </div>
        <div className="grid grid-cols-2 gap-2" aria-label="Look previews">
          {LOOK_IDS.map((lookId) => {
            const selected = variation.look.id === lookId;
            const recipe = selected ? variation.look : candidatesRef.current![lookId];
            const previewVariation = { ...variation, look: recipe };
            return (
              <button
                key={lookId}
                type="button"
                data-look-thumbnail="true"
                data-look-id={lookId}
                aria-label={lookLabels[lookId]}
                aria-pressed={selected}
                className={`grid min-w-0 gap-1 border p-1 text-left text-[10px] leading-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${selected ? 'border-emerald-400 bg-neutral-800 text-white' : 'border-neutral-700 bg-neutral-950 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200'}`}
                onClick={() => {
                  endHistoryGroup();
                  setLook(recipe);
                }}
              >
                <span className="block aspect-[4/3] min-h-0 w-full overflow-hidden bg-[#f5f5f3]">
                  <VariationPreviewCanvas
                    surfaceId={`look-thumbnail:${variation.id}:${lookId}`}
                    variation={previewVariation}
                    assetsById={assetsById}
                    imagesById={imagesById}
                    coordinator={coordinator}
                    maxPixelDimension={240}
                    background="#f5f5f3"
                    ariaLabel={`${lookLabels[lookId]} preview`}
                    retryGeneration={retryGeneration}
                    onFailureChange={(message) => {
                      setThumbnailFailures((current) => {
                        if (message) return current[lookId] === message ? current : { ...current, [lookId]: message };
                        if (!current[lookId]) return current;
                        const next = { ...current };
                        delete next[lookId];
                        return next;
                      });
                    }}
                  />
                </span>
                <span className="grid min-h-11 gap-0.5 px-0.5">
                  <span className="font-medium text-neutral-200">{lookLabels[lookId]}</span>
                  <span className="leading-3 text-neutral-500">{lookDescriptions[lookId]}</span>
                </span>
              </button>
            );
          })}
        </div>
        </div>

        <NumericLookControl
          id="editor-look-distress"
          label="Distress"
          value={variation.look.id === 'distressed-print' ? variation.look.wear : 0}
          bounds={lookControlBounds.wear}
          onChange={updateDistress}
          onEnd={endHistoryGroup}
        />

        <NumericLookControl
          id="editor-look-strength"
          label="Preset strength"
          value={variation.look.strength}
          bounds={lookControlBounds.strength}
          disabled={variation.look.id === 'original'}
          onChange={(strength) => updateLook({ strength }, 'look-strength')}
          onEnd={endHistoryGroup}
        />

        <details className="border-t border-neutral-800 pt-3">
          <summary className="cursor-pointer text-xs font-semibold text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">More</summary>
          <div className="mt-4 grid gap-4">{advancedControls}</div>
        </details>

        {isSeededLook(variation.look) ? (
          <button
            type="button"
            className={commandButtonClass}
            aria-label="Reroll texture"
            onClick={() => {
              endHistoryGroup();
              dispatch({ type: 'reroll-look-seed', seed: createLookSeed() });
            }}
          >
            <Dices aria-hidden="true" size={15} />
            Reroll texture
          </button>
        ) : null}

        {previewError ? (
          <div className="grid gap-2 border border-red-900 bg-red-950 p-3 text-xs text-red-200" aria-live="polite">
            <p>{previewError}</p>
            <button
              type="button"
              className={commandButtonClass}
              aria-label="Retry Look preview"
              onClick={() => {
                onRetry();
                setRetryGeneration((current) => current + 1);
              }}
            >
              <RefreshCw aria-hidden="true" size={15} />
              Retry
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
};
