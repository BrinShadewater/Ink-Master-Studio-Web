import { ArrowRight, Layers3, SlidersHorizontal, Shirt } from 'lucide-react';

export interface LandingPageProps {
  onOpenEditor: () => void;
}

const Brand = () => (
  <div className="flex items-center gap-2.5">
    <img src="/logo/logo.png" alt="" className="h-9 w-9 object-contain" />
    <span className="text-sm font-semibold text-neutral-100">InkMaster Studio</span>
  </div>
);

export const LandingPage = ({ onOpenEditor }: LandingPageProps) => (
  <main className="min-h-dvh bg-neutral-950 text-neutral-100">
    <header className="border-b border-neutral-800 bg-neutral-950/95 px-5 py-3 md:px-8">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <Brand />
        <button
          type="button"
          className="flex h-9 items-center gap-2 rounded-md bg-emerald-500 px-3 text-xs font-semibold text-neutral-950 transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          onClick={onOpenEditor}
        >
          Open editor <ArrowRight aria-hidden="true" size={15} />
        </button>
      </div>
    </header>

    <section className="mx-auto grid min-h-[calc(100dvh-128px)] max-w-7xl items-center gap-10 px-5 py-10 md:grid-cols-[minmax(0,0.9fr)_minmax(360px,0.75fr)] md:px-8 md:py-14">
      <div className="max-w-xl">
        <h1 className="text-4xl font-semibold leading-tight text-neutral-50 md:text-6xl">InkMaster Studio</h1>
        <p className="mt-5 max-w-lg text-base leading-7 text-neutral-300 md:text-lg">
          A focused workspace for turning artwork into print-ready apparel designs, without losing control of the original.
        </p>
        <button
          type="button"
          className="mt-8 flex h-11 items-center gap-2 rounded-md bg-emerald-500 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          onClick={onOpenEditor}
        >
          Start a design <ArrowRight aria-hidden="true" size={17} />
        </button>
      </div>

      <div className="relative aspect-[4/5] overflow-hidden rounded-lg border border-neutral-700 bg-neutral-100 shadow-2xl">
        <img src="/mockups/mockup-black.png" alt="Black T-shirt mockup" className="h-full w-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 border-t border-neutral-300 bg-neutral-50 px-4 py-3 text-xs font-medium text-neutral-700">
          Build, place, and export from one canvas.
        </div>
      </div>
    </section>

    <section className="border-t border-neutral-800 bg-neutral-900/70">
      <div className="mx-auto grid max-w-7xl gap-px md:grid-cols-3">
        {[
          [Layers3, 'Canvas-first', 'Keep the design surface central.'],
          [SlidersHorizontal, 'Creator finish', 'Tune print character when you need it.'],
          [Shirt, 'Product preview', 'Place artwork on the garment before export.'],
        ].map(([Icon, title, description]) => {
          const FeatureIcon = Icon as typeof Layers3;
          return (
            <div key={title as string} className="flex items-start gap-3 border-b border-neutral-800 px-5 py-6 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 md:px-8">
              <FeatureIcon aria-hidden="true" size={19} className="mt-0.5 text-emerald-400" />
              <div>
                <h2 className="text-sm font-semibold text-neutral-100">{title as string}</h2>
                <p className="mt-1 text-sm leading-6 text-neutral-400">{description as string}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  </main>
);
