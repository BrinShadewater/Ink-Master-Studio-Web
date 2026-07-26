import { useRef, useState } from 'react';
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
  const stageRef = useRef<HTMLDivElement>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const afterWidth = Math.max(1, 100 - position);
  const clampPosition = (value: number) => Math.max(0, Math.min(100, value));
  const updatePositionFromClientX = (clientX: number) => {
    const bounds = stageRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width === 0) return;
    setPosition(clampPosition(((clientX - bounds.left) / bounds.width) * 100));
  };

  return (
    <section className="relative h-full min-h-0 overflow-hidden bg-[#101820]" aria-label={label}>
      <div className="absolute inset-0 p-4 md:p-8">
        <div ref={stageRef} className="relative h-full overflow-hidden border border-[#355061] bg-[#aeb9b7] shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
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
          <div
            role="slider"
            tabIndex={0}
            aria-label="Before and after divider"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(position)}
            className="group absolute top-1/2 z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 touch-none cursor-ew-resize items-center justify-center rounded-full border border-emerald-300 bg-[#101820] text-emerald-300 shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#101820]"
            style={{ left: `${position}%` }}
            onKeyDown={(event) => {
              const direction = event.key === 'ArrowLeft' || event.key === 'ArrowDown'
                ? -1
                : event.key === 'ArrowRight' || event.key === 'ArrowUp'
                  ? 1
                  : 0;
              if (direction === 0) return;
              event.preventDefault();
              setPosition((current) => clampPosition(current + direction * (event.shiftKey ? 10 : 1)));
            }}
            onPointerDown={(event) => {
              activePointerIdRef.current = event.pointerId;
              event.currentTarget.setPointerCapture(event.pointerId);
              updatePositionFromClientX(event.clientX);
            }}
            onPointerMove={(event) => {
              if (activePointerIdRef.current === event.pointerId) {
                updatePositionFromClientX(event.clientX);
              }
            }}
            onPointerUp={(event) => {
              if (activePointerIdRef.current !== event.pointerId) return;
              activePointerIdRef.current = null;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onPointerCancel={() => {
              activePointerIdRef.current = null;
            }}
            onLostPointerCapture={() => {
              activePointerIdRef.current = null;
            }}
          >
            <span aria-hidden="true" className="h-5 w-1 rounded-full bg-current" />
            <span className="pointer-events-none absolute left-1/2 top-full mt-2 w-max -translate-x-1/2 bg-[#101820]/95 px-2 py-1 text-[10px] text-white opacity-0 shadow group-focus-visible:opacity-100">
              Arrow keys move. Shift moves farther.
            </span>
          </div>
          <span className="absolute left-3 top-3 bg-[#101820]/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">Original</span>
          <span className="absolute right-3 top-3 bg-[#101820]/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">Applied finishes</span>
        </div>
      </div>
      <div className="absolute inset-x-4 bottom-6 z-10 flex items-center gap-3 border border-[#355061] bg-[#101820]/90 px-3 py-2 backdrop-blur md:inset-x-8">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-300">Original / finishes</span>
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
