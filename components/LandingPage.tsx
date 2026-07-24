import { ArrowRight, Layers3, ScanLine, Shirt, Sparkles } from 'lucide-react';

export interface LandingPageProps {
  onOpenEditor: () => void;
}

const Brand = () => (
  <div className="flex items-center gap-2.5">
    <img src="/logo/logo.png" alt="" className="h-9 w-9 object-contain" />
    <span className="text-sm font-semibold text-neutral-100">InkMaster Studio</span>
  </div>
);

const particles = Array.from({ length: 72 }, (_, index) => ({
  id: index,
  size: 2 + (index % 5),
  left: (index * 37) % 100,
  bottom: (index * 19) % 110 - 10,
  duration: 11 + (index % 7) * 2,
  delay: -((index * 5) % 18),
  opacity: 0.32 + (index % 5) * 0.1,
}));

const LandingBackdrop = () => (
  <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
    <div
      className="absolute inset-0 opacity-[0.07]"
      style={{
        backgroundImage: 'linear-gradient(#2b8991 1px, transparent 1px), linear-gradient(90deg, #2b8991 1px, transparent 1px)',
        backgroundSize: '56px 56px',
      }}
    />
    {particles.map((particle) => (
      <span
        key={particle.id}
        className="landing-particle absolute rounded-full bg-[#54c9cb]"
        style={{
          width: particle.size,
          height: particle.size,
          left: `${particle.left}%`,
          bottom: `${particle.bottom}%`,
          opacity: particle.opacity,
          animationDuration: `${particle.duration}s`,
          animationDelay: `${particle.delay}s`,
        }}
      />
    ))}
  </div>
);

export const LandingPage = ({ onOpenEditor }: LandingPageProps) => (
  <main className="min-h-dvh bg-neutral-950 text-neutral-100">
    <LandingBackdrop />
    <header className="relative z-10 border-b border-neutral-800 bg-neutral-950/95 px-5 py-3 md:px-8">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <Brand />
        <button
          type="button"
          className="flex h-9 items-center gap-2 rounded-md bg-[#197780] px-3 text-xs font-semibold text-white transition hover:bg-[#238b93] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#54c9cb]"
          onClick={onOpenEditor}
        >
          Open editor <ArrowRight aria-hidden="true" size={15} />
        </button>
      </div>
    </header>

    <section className="relative z-10 mx-auto grid min-h-[calc(100dvh-128px)] max-w-7xl items-center gap-10 px-5 py-10 md:grid-cols-[minmax(0,0.9fr)_minmax(430px,1.1fr)] md:px-8 md:py-14">
      <div className="max-w-xl">
        <div className="flex items-center gap-4 text-sm font-medium text-[#66d2d2]">
          <img src="/logo/logo.png" alt="" className="h-24 w-24 object-contain drop-shadow-2xl md:h-32 md:w-32" />
          Canvas-first merch studio
        </div>
        <h1 className="mt-7 text-4xl font-semibold leading-[1.04] text-neutral-50 md:text-6xl">Turn artwork into a print-ready shirt design.</h1>
        <p className="mt-6 max-w-lg text-base leading-7 text-neutral-300 md:text-lg">
          Clean up the source, shape the finish, place it on a garment, and export a production-sized PNG from one focused canvas.
        </p>
        <button
          type="button"
          className="mt-8 flex h-11 items-center gap-2 rounded-md bg-[#197780] px-4 text-sm font-semibold text-white transition hover:bg-[#238b93] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#54c9cb]"
          onClick={onOpenEditor}
        >
          Start designing <ArrowRight aria-hidden="true" size={17} />
        </button>
        <div className="mt-10 grid gap-4 border-t border-neutral-800 pt-6 sm:grid-cols-3">
          {[
            [Layers3, 'Build', 'Artwork stays editable.'],
            [Sparkles, 'Finish', 'Control color and distress.'],
            [Shirt, 'Preview', 'Place it before export.'],
          ].map(([Icon, title, description]) => {
            const WorkflowIcon = Icon as typeof Layers3;
            return (
              <div key={title as string}>
                <WorkflowIcon aria-hidden="true" size={18} className="text-[#66d2d2]" />
                <p className="mt-2 text-sm font-semibold text-neutral-100">{title as string}</p>
                <p className="mt-1 text-xs leading-5 text-neutral-400">{description as string}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-2xl">
        <div className="relative aspect-[4/5] overflow-hidden border border-[#54c9cb]/25 bg-[#102b34] shadow-2xl">
          <img src="/mockups/mockup-black.png" alt="Black T-shirt mockup" className="h-full w-full object-cover mix-blend-multiply" />
          <div className="pointer-events-none absolute left-1/2 top-[50%] grid h-[25%] w-[34%] -translate-x-1/2 -translate-y-1/2 place-items-center border border-[#66d2d2]/30 bg-[#173f48]/65 text-center text-sm font-semibold leading-tight text-[#d9ffff] shadow-[0_0_40px_rgba(38,169,177,0.2)]">
            INK<br />READY
          </div>
          <div className="absolute inset-x-3 bottom-3 flex items-center justify-between border border-neutral-700 bg-neutral-950/90 px-3 py-2 text-xs text-neutral-300 backdrop-blur">
            <span className="flex items-center gap-2"><ScanLine aria-hidden="true" size={15} className="text-[#66d2d2]" /> Product preview</span>
            <span className="text-[#66d2d2]">Black tee</span>
          </div>
        </div>
      </div>
    </section>

    <section className="relative z-10 border-t border-neutral-800 bg-neutral-900/70">
      <div className="mx-auto grid max-w-7xl gap-px md:grid-cols-3">
        {[
          [Layers3, 'Canvas control', 'Position, crop, and shape the source without losing it.'],
          [Sparkles, 'Creator finish', 'Use cleanup, color, trace, and distress when the design needs it.'],
          [Shirt, 'Product preview', 'Check scale and placement against the garment before export.'],
        ].map(([Icon, title, description]) => {
          const FeatureIcon = Icon as typeof Layers3;
          return (
            <div key={title as string} className="flex items-start gap-3 border-b border-neutral-800 px-5 py-6 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 md:px-8">
              <FeatureIcon aria-hidden="true" size={19} className="mt-0.5 text-[#66d2d2]" />
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
