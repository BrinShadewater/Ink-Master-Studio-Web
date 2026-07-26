import { useRef, useState, type PointerEvent } from 'react';
import type { DecodedImageEntry } from '../../editor/decodedImages';
import type { LookRenderCoordinator } from '../../editor/lookRenderCoordinator';
import type { DesignVariation, EditorAsset } from '../../editor/model';
import { VariationPreviewCanvas } from './VariationPreviewCanvas';

export interface CanvasBeforeAfterProps {
  before: DesignVariation;
  after: DesignVariation;
  assetsById: Record<string, EditorAsset>;
  imagesById: Record<string, DecodedImageEntry>;
  coordinator: LookRenderCoordinator;
  label: string;
}

export const CanvasBeforeAfter = ({
  before,
  after,
  assetsById,
  imagesById,
  coordinator,
  label,
}: CanvasBeforeAfterProps) => {
  const [position, setPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const afterWidth = Math.max(1, 100 - position);
  const updatePositionFromPointer = (clientX: number) => {
    const bounds = previewRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setPosition(Math.max(0, Math.min(100, ((clientX - bounds.left) / bounds.width) * 100)));
  };
  const startDrag = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
    updatePositionFromPointer(event.clientX);
  };
  const stopDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDragging(false);
  };

  return (
    <section className="relative h-full min-h-0 overflow-hidden bg-[#101820]" aria-label={label}>
      <div className="absolute inset-0 p-4 md:p-8">
        <div ref={previewRef} className="relative h-full overflow-hidden border border-[#355061] bg-[#aeb9b7] shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
          <VariationPreviewCanvas
            surfaceId={`comparison-before:${before.id}`}
            variation={before}
            assetsById={assetsById}
            imagesById={imagesById}
            coordinator={coordinator}
            maxPixelDimension={1600}
            background="#aeb9b7"
            ariaLabel="Before artwork"
          />
          <div className="absolute inset-y-0 right-0 overflow-hidden" style={{ width: `${afterWidth}%` }}>
            <div className="absolute inset-y-0 right-0" style={{ width: `${10000 / afterWidth}%` }}>
              <VariationPreviewCanvas
                surfaceId={`comparison-after:${after.id}`}
                variation={after}
                assetsById={assetsById}
                imagesById={imagesById}
                coordinator={coordinator}
                maxPixelDimension={1600}
                background="#aeb9b7"
                ariaLabel="After artwork"
              />
            </div>
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-px bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.75)]" style={{ left: `${position}%` }} />
          <button
            type="button"
            aria-label="Drag before and after divider"
            aria-pressed={isDragging}
            className={`absolute top-1/2 z-10 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-col-resize place-items-center rounded-full border border-emerald-300 bg-[#101820]/95 text-emerald-200 shadow-[0_0_18px_rgba(52,211,153,0.4)] touch-none transition hover:bg-[#172832] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ${isDragging ? 'scale-110 bg-[#172832]' : ''}`}
            style={{ left: `${position}%` }}
            onPointerDown={startDrag}
            onPointerMove={(event) => {
              if (isDragging) updatePositionFromPointer(event.clientX);
            }}
            onPointerUp={stopDrag}
            onPointerCancel={stopDrag}
          >
            <span aria-hidden="true" className="text-base leading-none">&#8596;</span>
          </button>
          <span className="absolute left-3 top-3 bg-[#101820]/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">Before</span>
          <span className="absolute right-3 top-3 bg-[#101820]/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">After</span>
        </div>
      </div>
      <div className="absolute inset-x-4 bottom-6 z-10 flex items-center gap-3 border border-[#355061] bg-[#101820]/90 px-3 py-2 backdrop-blur md:inset-x-8">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-300">Before / after</span>
        <input
          aria-label="Before and after position"
          type="range"
          min="0"
          max="100"
          value={position}
          onChange={(event) => setPosition(event.currentTarget.valueAsNumber)}
          className="min-w-0 flex-1 accent-emerald-500"
        />
      </div>
    </section>
  );
};
