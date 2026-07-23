import { ChevronDown, Pencil, X } from 'lucide-react';
import type { DecodedImageEntry } from '../../editor/decodedImages';
import {
  COMPARE_MAX_SELECTION,
  COMPARE_MIN_SELECTION,
  COMPARE_MAX_ZOOM,
  COMPARE_MIN_ZOOM,
  normalizeCompareZoom,
  toggleCompareVariation,
  type CompareBackground,
} from '../../editor/compareState';
import type { LookRenderCoordinator } from '../../editor/lookRenderCoordinator';
import type { DesignVariation, EditorAsset } from '../../editor/model';
import {
  VariationPreviewCanvas,
  type PreviewBackground,
} from './VariationPreviewCanvas';

export interface CompareBoardProps {
  variations: DesignVariation[];
  selectedVariationIds: string[];
  background: CompareBackground;
  zoom: number;
  assetsById: Record<string, EditorAsset>;
  imagesById: Record<string, DecodedImageEntry>;
  coordinator: LookRenderCoordinator;
  onSelectionChange: (ids: string[]) => void;
  onBackgroundChange: (background: CompareBackground) => void;
  onZoomChange: (zoom: number) => void;
  onEditVariation: (variationId: string) => void;
  onClose: () => void;
}

const BACKGROUNDS: Array<{
  id: CompareBackground;
  label: string;
  color: PreviewBackground;
}> = [
  { id: 'neutral', label: 'Neutral', color: '#1f1f1f' },
  { id: 'light', label: 'Light', color: '#f5f5f3' },
  { id: 'dark', label: 'Dark', color: '#161616' },
];

const controlButtonClass = 'h-8 px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400';

export const CompareBoard = ({
  variations,
  selectedVariationIds,
  background,
  zoom,
  assetsById,
  imagesById,
  coordinator,
  onSelectionChange,
  onBackgroundChange,
  onZoomChange,
  onEditVariation,
  onClose,
}: CompareBoardProps) => {
  const variationIds = variations.map(({ id }) => id);
  const selectedSet = new Set(selectedVariationIds);
  const selectedVariations = variations
    .filter(({ id }) => selectedSet.has(id))
    .slice(0, COMPARE_MAX_SELECTION);
  const normalizedZoom = normalizeCompareZoom(zoom);
  const previewBackground = BACKGROUNDS.find(({ id }) => id === background)?.color ?? '#1f1f1f';
  const disableSelected = selectedVariations.length <= COMPARE_MIN_SELECTION;
  const disableUnselected = selectedVariations.length >= COMPARE_MAX_SELECTION;

  return (
    <section
      aria-label="Compare Board"
      className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-neutral-950"
    >
      <header className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-neutral-800 bg-neutral-900 px-4 py-2 md:flex md:min-h-14 md:flex-nowrap md:gap-3 md:px-5">
        <div className="col-start-1 row-start-1 min-w-0 md:mr-auto">
          <h1 className="text-sm font-semibold text-white">Compare</h1>
          <p className="text-xs text-neutral-400">{selectedVariations.length} variations</p>
        </div>

        <details className="group relative col-start-1 row-start-2 justify-self-start">
          <summary className={`${controlButtonClass} flex cursor-pointer list-none items-center gap-2 border border-neutral-700 bg-neutral-950 text-neutral-200 hover:border-neutral-500 hover:text-white`}>
            Variations
            <ChevronDown aria-hidden="true" size={14} className="transition group-open:rotate-180" />
          </summary>
          <fieldset
            aria-label="Compare variations"
            className="absolute left-0 top-10 z-30 grid w-56 gap-1 border border-neutral-700 bg-neutral-900 p-2 shadow-xl md:left-auto md:right-0"
          >
            <legend className="sr-only">Compare variations</legend>
            {variations.map((variation) => {
              const checked = selectedSet.has(variation.id);
              const disabled = checked ? disableSelected : disableUnselected;
              return (
                <label
                  key={variation.id}
                  className="flex min-h-9 items-center gap-2 px-2 text-sm text-neutral-200 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-45 hover:bg-neutral-800"
                >
                  <input
                    type="checkbox"
                    value={variation.id}
                    checked={checked}
                    disabled={disabled}
                    onChange={(event) => onSelectionChange(toggleCompareVariation(
                      selectedVariationIds,
                      variation.id,
                      event.currentTarget.checked,
                      variationIds,
                    ))}
                    className="h-4 w-4 accent-emerald-500"
                  />
                  <span className="min-w-0 truncate">{variation.name}</span>
                </label>
              );
            })}
          </fieldset>
        </details>

        <div
          className="col-start-2 row-start-2 flex justify-self-end border border-neutral-700 bg-neutral-950"
          role="group"
          aria-label="Artwork background"
        >
          {BACKGROUNDS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={`${controlButtonClass} ${background === id ? 'bg-neutral-100 text-neutral-950' : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'}`}
              aria-label={`${label} background`}
              aria-pressed={background === id}
              onClick={() => onBackgroundChange(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="col-span-2 row-start-3 flex w-full min-w-0 items-center gap-2 text-xs text-neutral-300 md:w-auto md:min-w-36">
          <span>Zoom</span>
          <input
            type="range"
            aria-label="Compare zoom"
            min={COMPARE_MIN_ZOOM}
            max={COMPARE_MAX_ZOOM}
            step={1}
            value={normalizedZoom}
            onChange={(event) => onZoomChange(normalizeCompareZoom(event.currentTarget.valueAsNumber))}
            className="min-w-0 flex-1 accent-emerald-500"
          />
          <output className="w-9 text-right tabular-nums">{normalizedZoom}%</output>
        </label>

        <button
          type="button"
          className="col-start-2 row-start-1 grid h-8 w-8 shrink-0 place-items-center justify-self-end text-neutral-400 transition hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          aria-label="Close Compare"
          title="Close Compare"
          onClick={onClose}
        >
          <X aria-hidden="true" size={18} />
        </button>
      </header>

      <div
        data-compare-preview-strip="true"
        className={`grid min-h-0 min-w-0 grid-flow-col auto-cols-[calc(100vw-32px)] gap-4 overflow-x-auto overscroll-x-contain px-4 pb-4 pt-3 snap-x snap-mandatory md:grid-flow-row md:auto-cols-auto md:grid-cols-2 ${selectedVariations.length > 2 ? 'md:grid-rows-2' : 'md:grid-rows-1'} md:overflow-hidden md:px-5 md:pb-5 md:pt-4`}
      >
        {selectedVariations.map((variation) => (
          <article
            key={variation.id}
            data-compare-preview="true"
            className="grid h-full min-h-0 min-w-0 snap-center grid-rows-[36px_minmax(0,1fr)] overflow-hidden"
          >
            <div className="flex min-w-0 items-center justify-between gap-3 px-1">
              <h2 className="truncate text-xs font-semibold text-neutral-200">{variation.name}</h2>
              <button
                type="button"
                className="flex h-8 shrink-0 items-center gap-1.5 px-2 text-xs font-medium text-neutral-300 transition hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                aria-label={`Edit ${variation.name}`}
                onClick={() => onEditVariation(variation.id)}
              >
                <Pencil aria-hidden="true" size={14} />
                Edit
              </button>
            </div>
            <div className="min-h-0 overflow-hidden" style={{ background: previewBackground }}>
              <VariationPreviewCanvas
                surfaceId={`compare-preview:${variation.id}`}
                variation={variation}
                assetsById={assetsById}
                imagesById={imagesById}
                coordinator={coordinator}
                maxPixelDimension={800}
                background={previewBackground}
                zoom={normalizedZoom / 100}
                ariaLabel={`${variation.name} preview on ${background} background`}
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
