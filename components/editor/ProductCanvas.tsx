import { MoveDiagonal2 } from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from 'react';
import type { DecodedImageEntry } from '../../editor/decodedImages';
import type { Point, Rect, Size } from '../../editor/geometry';
import type { LookRenderCoordinator } from '../../editor/lookRenderCoordinator';
import type {
  DesignVariation,
  EditorAsset,
} from '../../editor/model';
import {
  getTShirtMockup,
  type TShirtMockup,
} from '../../editor/productCatalog';
import {
  containProductMockup,
  moveProductPlacement,
  resizeProductPlacementFromPoint,
  resolveProductArtworkGeometry,
  resolveProductRegionRect,
} from '../../editor/productGeometry';
import type {
  ProductPlacement,
  TShirtProductVariant,
} from '../../editor/productModel';
import type {
  ProductMockupLoadStatus,
} from '../../editor/productMockupLoader';
import { VariationPreviewCanvas } from './VariationPreviewCanvas';

export type ProductPointerMode = 'move' | 'resize';

export interface ProductCanvasPointerState {
  pointerId: number;
  mode: ProductPointerMode;
  startPoint: Point;
  startPlacement: ProductPlacement;
  regionRect: Rect;
}

export const createProductCanvasPointerState = (
  pointerId: number,
  mode: ProductPointerMode,
  startPoint: Point,
  startPlacement: ProductPlacement,
  regionRect: Rect,
): ProductCanvasPointerState => ({
  pointerId,
  mode,
  startPoint: { ...startPoint },
  startPlacement: { ...startPlacement },
  regionRect: { ...regionRect },
});

export const resolveProductCanvasPointerPlacement = (
  state: ProductCanvasPointerState,
  point: Point,
): ProductPlacement => state.mode === 'move'
  ? moveProductPlacement(state.startPlacement, {
      x: point.x - state.startPoint.x,
      y: point.y - state.startPoint.y,
    }, state.regionRect)
  : resizeProductPlacementFromPoint(
      state.startPlacement,
      point,
      state.regionRect,
    );

export interface ProductCanvasProps {
  projectId: string;
  variation: DesignVariation;
  product: TShirtProductVariant;
  displayedMockup: TShirtMockup | null;
  mockupStatus: ProductMockupLoadStatus;
  mockupError: string | null;
  assetsById: Record<string, EditorAsset>;
  imagesById: Record<string, DecodedImageEntry>;
  coordinator: LookRenderCoordinator;
  artworkRetryGeneration: number;
  onArtworkFailureChange: (message: string | null) => void;
  onPlacementChange: (
    placement: ProductPlacement,
    historyGroup: 'product-placement-drag' | 'product-placement-resize',
  ) => void;
  onPlacementEnd: () => void;
  onRetry: () => void;
  onReturnToDesign: () => void;
}

const emptySize: Size = { width: 0, height: 0 };

const handlePosition = (
  center: Point,
  baseEdge: number,
  placement: ProductPlacement,
): Point => {
  const offset = baseEdge * placement.scale / 2;
  const radians = placement.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: center.x + offset * cosine - offset * sine,
    y: center.y + offset * sine + offset * cosine,
  };
};

export const ProductCanvas = ({
  projectId,
  variation,
  product,
  displayedMockup,
  mockupStatus,
  mockupError,
  assetsById,
  imagesById,
  coordinator,
  artworkRetryGeneration,
  onArtworkFailureChange,
  onPlacementChange,
  onPlacementEnd,
  onRetry,
  onReturnToDesign,
}: ProductCanvasProps) => {
  const stageRef = useRef<HTMLElement>(null);
  const pointerRef = useRef<ProductCanvasPointerState | null>(null);
  const placementEndRef = useRef(onPlacementEnd);
  const [viewport, setViewport] = useState<Size>(emptySize);
  placementEndRef.current = onPlacementEnd;
  const requestedMockup = getTShirtMockup(product.mockupSlug);
  const mockupRect = useMemo(
    () => containProductMockup(viewport),
    [viewport],
  );
  const placementMockup = displayedMockup ?? requestedMockup;
  const regionRect = useMemo(
    () => resolveProductRegionRect(mockupRect, placementMockup.printableRegion),
    [mockupRect, placementMockup],
  );
  const artwork = useMemo(
    () => resolveProductArtworkGeometry(regionRect, product.placement),
    [product.placement, regionRect],
  );
  const baseEdge = Math.min(regionRect.width, regionRect.height);
  const resizeHandle = handlePosition(artwork.center, baseEdge, product.placement);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const resize = (width: number, height: number) => {
      setViewport((current) => (
        current.width === width && current.height === height
          ? current
          : { width, height }
      ));
    };
    const observer = new ResizeObserver(([entry]) => {
      resize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(stage);
    resize(stage.clientWidth, stage.clientHeight);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    if (!pointerRef.current) return;
    pointerRef.current = null;
    placementEndRef.current();
  }, []);

  const getPoint = (event: PointerEvent<HTMLElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
  };

  const beginPointer = (
    event: PointerEvent<HTMLElement>,
    mode: ProductPointerMode,
  ) => {
    if (event.button !== 0 || regionRect.width <= 0 || regionRect.height <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    const stage = stageRef.current;
    if (!stage) return;
    const bounds = stage.getBoundingClientRect();
    const point = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
    pointerRef.current = createProductCanvasPointerState(
      event.pointerId,
      mode,
      point,
      product.placement,
      regionRect,
    );
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const movePointer = (event: PointerEvent<HTMLElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    event.preventDefault();
    onPlacementChange(
      resolveProductCanvasPointerPlacement(pointer, getPoint(event)),
      pointer.mode === 'move'
        ? 'product-placement-drag'
        : 'product-placement-resize',
    );
  };

  const finishPointer = (event: PointerEvent<HTMLElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    pointerRef.current = null;
    const target = event.target;
    if (target instanceof Element && target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
    onPlacementEnd();
  };

  const initialFailure = mockupStatus === 'failed' && !displayedMockup;
  const initialPending = mockupStatus === 'pending' && !displayedMockup;

  return (
    <section
      ref={stageRef}
      aria-label="T-shirt product preview"
      className="relative h-full min-h-0 overflow-hidden bg-[#0b1b22]"
      onPointerMove={movePointer}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      onLostPointerCapture={finishPointer}
    >
      {displayedMockup ? (
        <img
          alt={`${displayedMockup.name} T-shirt`}
          src={displayedMockup.file}
          draggable={false}
          className="pointer-events-none absolute z-0 select-none"
          style={{
            left: mockupRect.x,
            top: mockupRect.y,
            width: mockupRect.width,
            height: mockupRect.height,
            mixBlendMode: 'multiply',
          }}
        />
      ) : null}

      {displayedMockup ? (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-[5] border border-dashed border-teal-300/35"
            style={{
              left: regionRect.x,
              top: regionRect.y,
              width: regionRect.width,
              height: regionRect.height,
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-[5] w-px bg-teal-300/50"
            style={{
              left: regionRect.x + regionRect.width / 2,
              top: regionRect.y,
              height: regionRect.height,
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-[5] h-px bg-teal-300/50"
            style={{
              left: regionRect.x,
              top: regionRect.y + regionRect.height / 2,
              width: regionRect.width,
            }}
          />
          <div
            data-product-artwork="true"
            className="absolute z-10 cursor-move touch-none ring-1 ring-emerald-500/80"
            data-product-print="garment-blended"
            style={{
              left: artwork.center.x,
              top: artwork.center.y,
              width: baseEdge,
              height: baseEdge,
              transform: `translate(-50%, -50%) rotate(${product.placement.rotation}deg) scale(${product.placement.scale})`,
              transformOrigin: 'center',
              mixBlendMode: 'normal',
              filter: 'saturate(1.02) contrast(1.02) drop-shadow(0 1px 1px rgb(0 0 0 / 0.18))',
            }}
            onPointerDown={(event) => beginPointer(event, 'move')}
          >
            <VariationPreviewCanvas
              surfaceId={`editor-product-preview:${projectId}:${variation.id}`}
              variation={variation}
              assetsById={assetsById}
              imagesById={imagesById}
              coordinator={coordinator}
              maxPixelDimension={800}
              background="transparent"
              ariaLabel="Product artwork"
              onFailureChange={onArtworkFailureChange}
              retryGeneration={artworkRetryGeneration}
            />
          </div>
          <button
            type="button"
            aria-label="Resize product artwork"
            title="Resize product artwork"
            className="absolute z-20 grid h-7 w-7 touch-none place-items-center border border-neutral-950 bg-emerald-400 text-neutral-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950"
            style={{
              left: resizeHandle.x,
              top: resizeHandle.y,
              transform: 'translate(-50%, -50%)',
            }}
            onPointerDown={(event) => beginPointer(event, 'resize')}
          >
            <MoveDiagonal2 aria-hidden="true" size={15} />
          </button>
        </>
      ) : null}

      {initialPending ? (
        <div
          role="status"
          className="absolute inset-0 z-30 grid place-items-center text-sm font-medium text-neutral-700"
        >
          Loading {requestedMockup.name} shirt...
        </div>
      ) : null}

      {initialFailure ? (
        <div
          role="alert"
          className="absolute inset-0 z-30 grid place-items-center px-6"
        >
          <div className="grid max-w-xs gap-3 border border-neutral-400 bg-white p-4 text-center text-sm text-neutral-800 shadow-sm">
            <p>{mockupError}</p>
            <div className="flex justify-center gap-2">
              <button
                type="button"
                className="h-9 border border-neutral-900 bg-neutral-900 px-3 font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                onClick={onRetry}
              >
                Retry
              </button>
              <button
                type="button"
                className="h-9 border border-neutral-400 px-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                onClick={onReturnToDesign}
              >
                Return to design
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {mockupStatus === 'failed' && displayedMockup ? (
        <div
          role="status"
          className="absolute inset-x-3 bottom-3 z-30 flex min-h-10 items-center justify-between gap-3 border border-red-300 bg-white px-3 text-xs text-red-800 shadow-sm"
        >
          <span>{mockupError}</span>
          <button
            type="button"
            className="h-7 border border-red-300 px-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            onClick={onRetry}
          >
            Retry
          </button>
        </div>
      ) : null}
    </section>
  );
};
