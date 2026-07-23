import type { EditorCommand } from '../../editor/history';
import {
  TSHIRT_MOCKUPS,
  getTShirtMockup,
} from '../../editor/productCatalog';
import type { ProductMockupLoadStatus } from '../../editor/productMockupLoader';
import {
  DEFAULT_PRODUCT_PLACEMENT,
  PRODUCT_PLACEMENT_BOUNDS,
  type TShirtProductVariant,
} from '../../editor/productModel';
import { NumberControl, RangeControl } from './TransformControls';

export interface ProductInspectorProps {
  product: TShirtProductVariant;
  mockupStatus: ProductMockupLoadStatus;
  mockupError: string | null;
  artworkError: string | null;
  dispatch: (command: EditorCommand) => void;
  onRetry: () => void;
  onReturnToDesign: () => void;
}

export const createCenterProductPlacementCommand = (
  product: TShirtProductVariant,
): EditorCommand => ({
  type: 'set-product-placement',
  placement: { ...product.placement, x: 0.5, y: 0.5 },
  historyGroup: 'product-center',
});

export const createResetProductPlacementCommand = (): EditorCommand => ({
  type: 'set-product-placement',
  placement: DEFAULT_PRODUCT_PLACEMENT,
  historyGroup: 'product-reset',
});

const percentageBounds = { min: 0, max: 100, step: 1 } as const;
const scaleBounds = {
  min: PRODUCT_PLACEMENT_BOUNDS.scale.min * 100,
  max: PRODUCT_PLACEMENT_BOUNDS.scale.max * 100,
  step: 1,
} as const;
const rotationBounds = {
  ...PRODUCT_PLACEMENT_BOUNDS.rotation,
  step: 1,
} as const;

const actionClass = 'h-9 border border-neutral-700 px-3 text-xs font-medium text-neutral-200 transition hover:border-neutral-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400';

export const ProductInspector = ({
  product,
  mockupStatus,
  mockupError,
  artworkError,
  dispatch,
  onRetry,
  onReturnToDesign,
}: ProductInspectorProps) => {
  const activeMockup = getTShirtMockup(product.mockupSlug);
  const endHistoryGroup = () => dispatch({ type: 'end-history-group' });
  const updatePlacement = (
    placement: TShirtProductVariant['placement'],
    historyGroup: string,
  ) => dispatch({ type: 'set-product-placement', placement, historyGroup });
  const failure = mockupStatus === 'failed' || Boolean(artworkError);

  return (
    <>
      <div className="sticky top-0 z-10 flex h-12 items-center justify-between border-b border-neutral-800 bg-neutral-900 px-4">
        <h2 className="text-sm font-semibold text-neutral-100">Product</h2>
        <button
          type="button"
          className={actionClass}
          onClick={() => {
            dispatch(createResetProductPlacementCommand());
            endHistoryGroup();
          }}
        >
          Reset
        </button>
      </div>

      <div className="grid gap-5 p-4">
        <section aria-labelledby="product-color-title" className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 id="product-color-title" className="text-xs font-medium text-neutral-300">Shirt color</h3>
            <span className="text-xs text-neutral-400">{activeMockup.name}</span>
          </div>
          <div className="grid grid-cols-6 gap-2">
            {TSHIRT_MOCKUPS.map((mockup) => {
              const selected = mockup.slug === product.mockupSlug;
              return (
                <button
                  key={mockup.slug}
                  type="button"
                  data-product-swatch="true"
                  aria-label={mockup.name}
                  aria-pressed={selected}
                  title={mockup.name}
                  className={`aspect-square w-full border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                    selected ? 'border-emerald-400 ring-1 ring-emerald-400' : 'border-neutral-600'
                  }`}
                  style={{ backgroundColor: mockup.swatch }}
                  onClick={() => dispatch({
                    type: 'set-product-mockup',
                    mockupSlug: mockup.slug,
                  })}
                />
              );
            })}
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <NumberControl
            id="product-position-x"
            label="X position"
            value={Math.round(product.placement.x * 100)}
            bounds={percentageBounds}
            onChange={(value) => updatePlacement(
              { ...product.placement, x: value / 100 },
              'product-position-x',
            )}
            onEnd={endHistoryGroup}
          />
          <NumberControl
            id="product-position-y"
            label="Y position"
            value={Math.round(product.placement.y * 100)}
            bounds={percentageBounds}
            onChange={(value) => updatePlacement(
              { ...product.placement, y: value / 100 },
              'product-position-y',
            )}
            onEnd={endHistoryGroup}
          />
        </div>

        <RangeControl
          id="product-scale"
          label="Scale"
          value={Math.round(product.placement.scale * 100)}
          suffix="%"
          bounds={scaleBounds}
          onChange={(value) => updatePlacement(
            { ...product.placement, scale: value / 100 },
            'product-scale',
          )}
          onEnd={endHistoryGroup}
        />
        <RangeControl
          id="product-rotation"
          label="Rotation"
          value={Math.round(product.placement.rotation)}
          suffix="°"
          bounds={rotationBounds}
          onChange={(value) => updatePlacement(
            { ...product.placement, rotation: value },
            'product-rotation',
          )}
          onEnd={endHistoryGroup}
        />

        <button
          type="button"
          className={actionClass}
          onClick={() => {
            dispatch(createCenterProductPlacementCommand(product));
            endHistoryGroup();
          }}
        >
          Center
        </button>

        {failure ? (
          <div role="alert" className="grid gap-3 border border-red-900 bg-red-950/40 p-3 text-xs text-red-200">
            {mockupStatus === 'failed' && mockupError ? <p>{mockupError}</p> : null}
            {artworkError ? <p>{artworkError}</p> : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={actionClass} onClick={onRetry}>Retry</button>
              <button type="button" className={actionClass} onClick={onReturnToDesign}>
                Return to design
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
};
