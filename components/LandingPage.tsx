import { ArrowRight, Layers3, ScanLine, Shirt, Sparkles } from 'lucide-react';

export interface LandingPageProps {
  onOpenEditor: () => void;
}

const particles = Array.from({ length: 128 }, (_, index) => ({
  id: index,
  size: 1 + (index % 4),
  left: (index * 47) % 101,
  top: (index * 29) % 101,
  duration: 7 + (index % 9) * 1.3,
  delay: -((index * 11) % 20),
  opacity: 0.2 + (index % 6) * 0.09,
}));

const LandingBackdrop = () => (
  <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
    <div
      className="absolute inset-0 opacity-[0.15]"
      style={{
        backgroundImage: 'linear-gradient(#19545d 1px, transparent 1px), linear-gradient(90deg, #19545d 1px, transparent 1px)',
        backgroundSize: '64px 64px',
      }}
    />
    <div className="absolute inset-x-0 top-[18%] h-px bg-[#1b7a85]/70" />
    <div className="absolute inset-x-0 bottom-[15%] h-px bg-[#1b7a85]/40" />
    {particles.map((particle) => (
      <span
        key={particle.id}
        className="landing-particle absolute rounded-full bg-[#42d8d5]"
        style={{
          width: particle.size,
          height: particle.size,
          left: `${particle.left}%`,
          top: `${particle.top}%`,
          opacity: particle.opacity,
          animationDuration: `${particle.duration}s`,
          animationDelay: `${particle.delay}s`,
        }}
      />
    ))}
  </div>
);

const workflow = [
  [Layers3, 'Build', 'Keep every source editable.'],
  [Sparkles, 'Finish', 'Shape color, texture, and cleanup.'],
  [Shirt, 'Preview', 'Place it before production.'],
] as const;

export const LandingPage = ({ onOpenEditor }: LandingPageProps) => (
  <main className="min-h-dvh overflow-hidden bg-[#06171c] text-neutral-100">
    <LandingBackdrop />

    <header className="relative z-10 border-b border-[#1b5861]/60 bg-[#06171c]/90 px-5 py-3 backdrop-blur md:px-8">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <img src="/logo/logo.png" alt="InkMaster Studio" className="h-10 w-10 shrink-0 object-contain" />
          <span className="truncate text-sm font-semibold tracking-wide text-neutral-100">InkMaster Studio</span>
        </div>
        <button type="button" className="flex h-9 shrink-0 items-center gap-2 border border-[#329ba2] bg-[#0c5662] px-3 text-xs font-semibold text-white transition hover:bg-[#117080] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#55dedb]" onClick={onOpenEditor}>
          Open editor <ArrowRight aria-hidden="true" size={15} />
        </button>
      </div>
    </header>

    <section className="relative z-10 mx-auto grid min-h-[calc(100dvh-61px)] max-w-7xl items-center gap-8 px-5 py-10 md:grid-cols-[minmax(0,0.86fr)_minmax(430px,1.14fr)] md:px-8 md:py-14">
      <div className="relative z-10 max-w-xl py-4">
        <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#63e6df]">
          <ScanLine aria-hidden="true" size={16} /> Canvas-first merch studio
        </div>
        <img src="/logo/logo.png" alt="" className="mt-7 h-24 w-24 object-contain drop-shadow-[0_0_24px_rgba(51,209,208,0.4)] md:h-32 md:w-32" />
        <h1 className="mt-5 text-4xl font-semibold leading-[1.03] tracking-normal text-white md:text-6xl">Turn artwork into a print-ready shirt design.</h1>
        <p className="mt-6 max-w-lg text-base leading-7 text-[#b6d0d2] md:text-lg">Clean up the source, create the finish, place it on a garment, and export a production-sized PNG from one focused canvas.</p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <button type="button" className="flex h-11 items-center gap-2 bg-[#19a2a7] px-4 text-sm font-semibold text-[#031518] transition hover:bg-[#43c9c8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#79f1ec]" onClick={onOpenEditor}>
            Start designing <ArrowRight aria-hidden="true" size={17} />
          </button>
          <span className="text-xs text-[#86adb1]">Made for merch creators, not generic image editing.</span>
        </div>
        <div className="mt-10 hidden gap-5 border-t border-[#1d5961]/75 pt-6 md:grid md:grid-cols-3">
          {workflow.map(([Icon, title, description]) => (
            <div key={title}>
              <Icon aria-hidden="true" size={18} className="text-[#63e6df]" />
              <p className="mt-2 text-sm font-semibold text-neutral-100">{title}</p>
              <p className="mt-1 text-xs leading-5 text-[#8db0b4]">{description}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-[640px] self-end md:self-center">
        <div className="pointer-events-none absolute -inset-x-10 bottom-0 h-px bg-[#3fd4d0]/80" />
        <img src="/landing-hero-shirt-v2.png" alt="Black T-shirt with a turquoise abstract screenprint" className="relative block aspect-[4/5] w-full object-cover object-center shadow-[0_28px_70px_rgba(0,0,0,0.5)]" />
        <div className="absolute bottom-4 left-4 flex items-center gap-2 border border-[#2e7d85] bg-[#06171c]/90 px-3 py-2 text-xs text-[#cbf7f4] backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-[#54e2da]" /> Production preview
        </div>
        <div className="absolute right-4 top-4 border border-[#2e7d85] bg-[#06171c]/90 px-3 py-2 text-right text-xs backdrop-blur">
          <p className="font-semibold text-[#d8fffc]">Black tee</p>
          <p className="mt-0.5 text-[#83b4b7]">Print-ready canvas</p>
        </div>
      </div>
    </section>

    <section className="relative z-10 border-t border-[#1d5961]/75 bg-[#071d23]/85">
      <div className="mx-auto grid max-w-7xl gap-px md:grid-cols-3">
        {[
          [Layers3, 'Canvas control', 'Position, crop, and shape the source without losing the original.'],
          [Sparkles, 'Creator finish', 'Use background cleanup, color, trace, and distress only when the design needs it.'],
          [Shirt, 'Product preview', 'Check scale and placement against a garment before exporting.'],
        ].map(([Icon, title, description]) => {
          const FeatureIcon = Icon as typeof Layers3;
          return <div key={title as string} className="flex items-start gap-3 border-b border-[#1d5961]/65 px-5 py-6 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 md:px-8"><FeatureIcon aria-hidden="true" size={19} className="mt-0.5 text-[#63e6df]" /><div><h2 className="text-sm font-semibold text-neutral-100">{title as string}</h2><p className="mt-1 text-sm leading-6 text-[#8db0b4]">{description as string}</p></div></div>;
        })}
      </div>
    </section>
  </main>
);
