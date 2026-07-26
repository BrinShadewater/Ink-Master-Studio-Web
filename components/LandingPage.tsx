import { ArrowRight, FileCheck2, Layers3, LockKeyhole, Ruler, Shirt } from 'lucide-react';
import { useEffect, useState } from 'react';

export interface LandingPageProps { onOpenEditor: () => void; }

const garments = [
  { id: 'black', label: 'Black', swatch: '#17191d', image: '/landing-tee-black.webp', imageClass: 'object-contain brightness-[0.72] contrast-[1.15]' },
  { id: 'heather', label: 'Heather gray', swatch: '#74787a', image: '/landing-tee-heather.webp', imageClass: 'object-contain' },
  { id: 'white', label: 'White', swatch: '#c9cfce', image: '/landing-tee-white.webp', imageClass: 'object-contain' },
] as const;

const LandingBackdrop = () => <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
  <div className="landing-grid absolute inset-0 opacity-[0.14]" />
</div>;

const ProductStage = () => {
  const [selectedId, setSelectedId] = useState<(typeof garments)[number]['id']>('black');
  const selected = garments.find((garment) => garment.id === selectedId) ?? garments[0];
  const copyTone = selectedId === 'white' ? 'text-neutral-950' : 'text-white';
  const printBlend = selectedId === 'white' ? 'mix-blend-multiply' : 'mix-blend-screen';

  // Warm the unselected garment images so swatch switching stays instant, but
  // only once the browser is idle. Doing this on mount put roughly 1.7MB of
  // images the visitor may never view in direct competition with first paint.
  useEffect(() => {
    const warm = () => {
      garments.forEach(({ image }) => {
        if (image === selected.image) return;
        const mockup = new Image();
        mockup.src = image;
      });
    };
    const idle = window.requestIdleCallback;
    if (typeof idle === 'function') {
      const handle = idle(warm, { timeout: 3000 });
      return () => window.cancelIdleCallback?.(handle);
    }
    const handle = window.setTimeout(warm, 1500);
    return () => window.clearTimeout(handle);
    // Mount-only on purpose: this warms the alternatives once. The selected
    // garment is already being fetched by the rendered image element.
  }, []);

  return <figure className="relative mx-auto w-full max-w-[760px]" aria-label="Interactive garment preview">
    <div className="relative aspect-[1.08/1] overflow-hidden border border-[#53697f] bg-studio-board shadow-[0_28px_80px_rgba(0,0,0,0.7)]" style={{ backgroundImage: 'linear-gradient(#48616e45 1px, transparent 1px), linear-gradient(90deg, #48616e45 1px, transparent 1px)', backgroundSize: '34px 34px' }}>
      <div className="absolute inset-7 border border-[#496574]/35" />
      <div className="absolute inset-x-0 top-6 flex justify-between px-9 text-xs text-studio-measure"><span>00</span><span>200</span><span>400</span><span>600</span></div>
      <div className="absolute inset-y-0 left-6 flex flex-col justify-between py-12 text-xs text-studio-measure"><span>00</span><span>200</span><span>400</span><span>600</span></div>
      <img src={selected.image} alt="" aria-hidden="true" decoding="async" fetchPriority="high" className={`absolute inset-x-[5%] inset-y-0 h-full w-[90%] object-contain ${selected.imageClass}`} />
      <div className="absolute inset-x-0 top-[37%] flex h-[31%] flex-col items-center gap-1">
        <p className={`text-center text-[10px] font-bold uppercase tracking-[0.14em] ${copyTone}`}>Tie me to the mast</p>
        <img src="/landing-siren-print.webp" alt="" aria-hidden="true" decoding="async" fetchPriority="high" className={`h-[72%] w-[20%] object-cover ${printBlend} shadow-[0_8px_18px_rgba(0,0,0,0.3)]`} />
        <p className={`text-center text-[10px] font-bold uppercase tracking-[0.1em] ${copyTone}`}>I want to hear the siren's song</p>
      </div>
      <div className="absolute inset-x-0 bottom-0 border-t border-[#405967] bg-[#172633]/94 px-4 py-3 md:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-studio-measure">Product</p><p className="mt-1 text-sm font-medium text-white">Classic tee</p></div>
          <div className="flex items-center gap-2" role="group" aria-label="Garment color preview">
            <span className="mr-1 text-xs font-semibold uppercase tracking-[0.14em] text-studio-measure">Color</span>
            {garments.map((garment) => <button key={garment.id} type="button" className={`grid h-11 w-11 place-items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#72bfc0] ${selectedId === garment.id ? 'border-[#5ca7a7] ring-1 ring-[#5ca7a7]' : 'border-[#4b6573] hover:border-[#72bfc0]'}`} aria-label={`Show ${garment.label} T-shirt`} aria-pressed={selectedId === garment.id} title={garment.label} onClick={() => setSelectedId(garment.id)}><span className="h-5 w-5 rounded-full border border-black/20" style={{ backgroundColor: garment.swatch }} /></button>)}
          </div>
          <div className="border-l border-[#4b6573] pl-3 text-right"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-studio-measure">View</p><p className="mt-1 text-sm font-medium text-[#6db7bb]">Front</p></div>
        </div>
      </div>
    </div>
    <figcaption className="sr-only">{selected.label} classic T-shirt preview with siren artwork on the front.</figcaption>
  </figure>;
};

const steps = [
  [Layers3, '1. Design', 'Build on a focused, precise canvas.'],
  [Shirt, '2. Preview', 'See it on a real garment.'],
  [FileCheck2, '3. Export', 'Check and download a production PNG.'],
] as const;

export const LandingPage = ({ onOpenEditor }: LandingPageProps) => <main className="min-h-dvh overflow-hidden bg-studio-canvas text-neutral-100">
  <LandingBackdrop />
  <header className="relative z-10 border-b border-studio-border bg-[#101d27]/98 px-5 py-4 shadow-[0_8px_24px_rgba(0,0,0,0.28)] md:px-8">
    <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-5">
      <div className="flex min-w-0 items-center gap-3"><img src="/logo/logo-mark.webp" alt="InkMaster Studio" className="h-14 w-14 shrink-0 object-contain" /><div className="hidden leading-none sm:block"><p className="text-xl font-black uppercase tracking-[0.08em] text-white md:text-2xl">InkMaster</p><p className="mt-1 text-xs font-bold uppercase tracking-[0.46em] text-[#70aeb2]">Studio</p></div></div>
      <button type="button" className="flex h-11 shrink-0 items-center gap-2 bg-studio-action px-4 text-sm font-semibold text-white transition hover:bg-studio-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-studio-focus" onClick={onOpenEditor}>Start designing <ArrowRight aria-hidden="true" size={16} /></button>
    </div>
  </header>
  <section className="relative z-10 mx-auto grid max-w-[1440px] items-center gap-10 px-5 py-12 md:px-8 lg:min-h-[690px] lg:grid-cols-[minmax(0,0.92fr)_minmax(580px,1.08fr)] lg:py-8">
    <div className="max-w-xl"><div className="inline-flex items-center gap-2 border border-[#496879] bg-[#121f2a] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#86b8bb]">Local-first. Printify-ready.</div><h1 className="mt-7 text-5xl font-black uppercase leading-[0.96] text-white md:text-6xl xl:text-7xl">Turn artwork into a <span className="text-[#6aa3a8]">print-ready</span> shirt design.</h1><p className="mt-6 max-w-lg text-base leading-7 text-[#b2c5c8] md:text-lg">Prepare artwork on a precise local canvas, preview it on real garments, and export a Printify Full Front PNG with fixed dimensions and DPI metadata.</p><div className="mt-8 flex flex-wrap items-center gap-5"><button type="button" className="flex h-14 items-center gap-2 bg-studio-action px-6 text-base font-bold uppercase tracking-wide text-white transition hover:bg-studio-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-studio-focus" onClick={onOpenEditor}>Start designing <ArrowRight aria-hidden="true" size={19} /></button><p className="flex items-center gap-2 text-sm text-[#b2c5c8]"><LockKeyhole aria-hidden="true" className="shrink-0 text-[#7bb5b9]" size={17} />Core editing and saved projects stay in your browser.</p></div><div className="mt-11 grid gap-4 border-t border-[#405b6b] pt-6 sm:grid-cols-3">{steps.map(([Icon, title, detail]) => <div key={title}><Icon aria-hidden="true" className="text-[#7bb5b9]" size={25} /><p className="mt-2 text-sm font-bold uppercase text-white">{title}</p><p className="mt-1 text-xs leading-5 text-[#91aaae]">{detail}</p></div>)}</div></div>
    <ProductStage />
  </section>
  <section id="features" className="relative z-10 border-t border-studio-border bg-[#14232d] shadow-[0_-10px_28px_rgba(0,0,0,0.2)]"><div className="mx-auto grid max-w-[1440px] gap-6 px-5 py-8 md:grid-cols-[1.15fr_repeat(3,1fr)] md:px-8"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#9cc5c7]">Built for print precision</p><h2 className="mt-3 text-3xl font-black uppercase leading-none text-white">Every export, checked.</h2></div>{[[LockKeyhole, 'Local-first workflow', 'Core edits and projects remain in your browser.'], [Ruler, 'Printify Full Front', '4500 x 5400 px with 300 DPI metadata.'], [FileCheck2, 'Readiness checks', 'Resolution, transparency, and file-size guidance.']].map(([Icon, title, detail]) => { const FeatureIcon = Icon as typeof LockKeyhole; return <div key={title as string} className="flex gap-3 border-l border-[#3a5664] pl-5"><FeatureIcon aria-hidden="true" className="shrink-0 text-[#90bec1]" size={25} /><div><h3 className="text-sm font-bold text-white">{title as string}</h3><p className="mt-1 text-sm leading-6 text-[#c1ced2]">{detail as string}</p></div></div>; })}</div></section>
</main>;
