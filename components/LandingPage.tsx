import { ArrowRight, ChevronDown, Crosshair, Download, Layers3, Shirt, Sparkles } from 'lucide-react';
import { useState } from 'react';

export interface LandingPageProps { onOpenEditor: () => void; }

const particles = Array.from({ length: 170 }, (_, index) => ({
  id: index, size: 1 + (index % 4), left: (index * 47) % 101, top: (index * 29) % 101,
  duration: 7 + (index % 9) * 1.3, delay: -((index * 11) % 20), opacity: 0.18 + (index % 6) * 0.09,
}));

const garments = [
  { id: 'black', label: 'Black', swatch: '#17191d', image: '/landing-tee-black.png', imageClass: 'object-contain brightness-[0.72] contrast-[1.15]' },
  { id: 'heather', label: 'Heather gray', swatch: '#74787a', image: '/landing-tee-heather.png', imageClass: 'object-contain' },
  { id: 'white', label: 'White', swatch: '#f5f6f4', image: '/landing-tee-white.png', imageClass: 'object-contain' },
] as const;

const LandingBackdrop = () => <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
  <div className="absolute inset-0 opacity-[0.14]" style={{ backgroundImage: 'linear-gradient(#2a3d4d 1px, transparent 1px), linear-gradient(90deg, #2a3d4d 1px, transparent 1px)', backgroundSize: '68px 68px' }} />
  <div className="absolute inset-x-0 top-[10%] h-px bg-[#344d5d]/65" />
  <div className="absolute inset-x-0 bottom-[21%] h-px bg-[#344d5d]/55" />
  {particles.map((particle) => <span key={particle.id} className="landing-particle absolute rounded-full bg-[#5a8c90]" style={{ width: particle.size, height: particle.size, left: `${particle.left}%`, top: `${particle.top}%`, opacity: particle.opacity, animationDuration: `${particle.duration}s`, animationDelay: `${particle.delay}s` }} />)}
</div>;

const ProductStage = () => {
  const [selectedId, setSelectedId] = useState<(typeof garments)[number]['id']>('black');
  const selected = garments.find((garment) => garment.id === selectedId) ?? garments[0];
  const copyTone = selectedId === 'white' ? 'text-neutral-950' : 'text-white';
  const printBlend = selectedId === 'white' ? 'mix-blend-multiply' : 'mix-blend-screen';

  return <div className="relative mx-auto w-full max-w-[760px]">
    <div className="relative aspect-[1.08/1] overflow-hidden border border-[#53697f] bg-[#2b3949] shadow-[0_28px_80px_rgba(0,0,0,0.7)]">
      <div className="absolute inset-7 border border-[#496574]/35" />
      <div className="absolute inset-x-0 top-6 flex justify-between px-9 text-[10px] text-[#718c98]"><span>00</span><span>200</span><span>400</span><span>600</span></div>
      <div className="absolute inset-y-0 left-6 flex flex-col justify-between py-12 text-[10px] text-[#718c98]"><span>00</span><span>200</span><span>400</span><span>600</span></div>
      <Crosshair aria-hidden="true" className="absolute left-5 top-10 text-[#4a9ca2]" size={24} />
      <Crosshair aria-hidden="true" className="absolute bottom-10 right-5 text-[#4a9ca2]" size={24} />
      <img src={selected.image} alt={`${selected.label} T-shirt with featured artwork`} className={`absolute inset-x-[5%] top-[2%] h-[105%] w-[90%] object-contain ${selected.imageClass}`} />
      <p className={`absolute inset-x-[25%] top-[31%] text-center text-[10px] font-bold uppercase tracking-[0.14em] ${copyTone}`}>Tie me to the mast</p>
      <img src="/landing-siren-print.jpg" alt="Siren artwork printed on the T-shirt" className={`absolute left-[40%] top-[38%] h-[22%] w-[20%] object-cover ${printBlend} shadow-[0_8px_18px_rgba(0,0,0,0.3)]`} />
      <p className={`absolute inset-x-[19%] top-[64%] text-center text-[9px] font-bold uppercase tracking-[0.1em] ${copyTone}`}>I want to hear the siren's song</p>
      <div className="absolute inset-x-0 bottom-0 border-t border-[#405967] bg-[#172633]/94 px-4 py-3 backdrop-blur md:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#93aab5]">Product</p><p className="mt-1 text-sm font-medium text-white">Classic tee</p></div>
          <div className="flex items-center gap-2" role="group" aria-label="Garment color preview">
            <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#93aab5]">Color</span>
            {garments.map((garment) => <button key={garment.id} type="button" className={`grid h-8 w-8 place-items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#72bfc0] ${selectedId === garment.id ? 'border-[#5ca7a7] ring-1 ring-[#5ca7a7]' : 'border-[#4b6573] hover:border-[#72bfc0]'}`} aria-label={`Show ${garment.label} T-shirt`} title={garment.label} onClick={() => setSelectedId(garment.id)}><span className="h-5 w-5 rounded-full border border-black/20" style={{ backgroundColor: garment.swatch }} /></button>)}
          </div>
          <div className="border-l border-[#4b6573] pl-3 text-right"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#93aab5]">View</p><p className="mt-1 text-sm font-medium text-[#6db7bb]">Front</p></div>
        </div>
      </div>
    </div>
  </div>;
};

const steps = [
  [Layers3, '1. Design', 'Build on a focused, precise canvas.'],
  [Shirt, '2. Preview', 'See it on a real garment.'],
  [Download, '3. Export', 'Download a print-ready PNG.'],
] as const;

export const LandingPage = ({ onOpenEditor }: LandingPageProps) => <main className="min-h-dvh overflow-hidden bg-[#0b121a] text-neutral-100">
  <LandingBackdrop />
  <header className="relative z-10 border-b-4 border-[#355463] bg-[#111b26]/96 px-5 py-4 backdrop-blur md:px-8">
    <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-5">
      <div className="flex min-w-0 items-center gap-3"><img src="/logo/logo.png" alt="InkMaster Studio" className="h-14 w-14 shrink-0 object-contain" /><div className="leading-none"><p className="text-xl font-black uppercase tracking-[0.08em] text-white md:text-2xl">InkMaster</p><p className="mt-1 text-xs font-bold uppercase tracking-[0.46em] text-[#70aeb2]">Studio</p></div></div>
      <nav aria-label="Primary navigation" className="hidden items-center gap-7 text-sm font-medium text-neutral-200 lg:flex"><a href="#features" className="transition hover:text-[#8bc5c8]">Features <ChevronDown aria-hidden="true" className="inline" size={14} /></a><a href="#resources" className="transition hover:text-[#8bc5c8]">Resources <ChevronDown aria-hidden="true" className="inline" size={14} /></a></nav>
      <div className="flex shrink-0 items-center gap-2"><button type="button" className="hidden h-10 border border-[#506575] px-4 text-sm font-medium text-neutral-200 transition hover:border-[#9ac9ce] md:block">Sign in</button><button type="button" className="flex h-10 items-center gap-2 bg-[#315f6c] px-4 text-sm font-semibold text-white transition hover:bg-[#3d7781] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9ac9ce]" onClick={onOpenEditor}>Start designing <ArrowRight aria-hidden="true" size={16} /></button></div>
    </div>
  </header>
  <section className="relative z-10 mx-auto grid max-w-[1440px] items-center gap-10 px-5 py-12 md:px-8 lg:min-h-[690px] lg:grid-cols-[minmax(0,0.92fr)_minmax(580px,1.08fr)] lg:py-8">
    <div className="max-w-xl"><div className="inline-flex items-center gap-2 border border-[#496879] bg-[#121f2a] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#86b8bb]"><Crosshair aria-hidden="true" size={15} /> Canvas-first. Print-ready.</div><h1 className="mt-7 text-5xl font-black uppercase leading-[0.96] text-white md:text-6xl xl:text-7xl">Turn artwork into a <span className="text-[#6aa3a8]">print-ready</span> shirt design.</h1><p className="mt-6 max-w-lg text-base leading-7 text-[#b2c5c8] md:text-lg">Design with precision on an infinite canvas. Fine-tune the artwork, preview it on real garments, and export with confidence.</p><div className="mt-8 flex flex-wrap items-center gap-5"><button type="button" className="flex h-14 items-center gap-2 bg-[#315f6c] px-6 text-base font-bold uppercase tracking-wide text-white transition hover:bg-[#3d7781] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9ac9ce]" onClick={onOpenEditor}><Sparkles aria-hidden="true" size={19} /> Start designing</button></div><div className="mt-11 grid gap-4 border-t border-[#405b6b] pt-6 sm:grid-cols-3">{steps.map(([Icon, title, detail]) => <div key={title}><Icon aria-hidden="true" className="text-[#7bb5b9]" size={25} /><p className="mt-2 text-sm font-bold uppercase text-white">{title}</p><p className="mt-1 text-xs leading-5 text-[#91aaae]">{detail}</p></div>)}</div></div>
    <ProductStage />
  </section>
  <section id="features" className="relative z-10 border-y-4 border-[#355463] bg-[#151f2a]"><div className="mx-auto grid max-w-[1440px] gap-6 px-5 py-8 md:grid-cols-[1.15fr_repeat(3,1fr)] md:px-8"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#82b6ba]">Built for print precision</p><h2 className="mt-3 text-3xl font-black uppercase leading-none text-white">Every detail, dialed in.</h2></div>{[[Crosshair, 'Pixel-perfect control', 'Guides, alignment, and clean placement.'], [Download, 'Print-ready output', 'High-resolution PNGs for production.'], [Sparkles, 'Color you can trust', 'Finishing controls made for apparel.']].map(([Icon, title, detail]) => { const FeatureIcon = Icon as typeof Crosshair; return <div key={title as string} className="flex gap-3 border-l border-[#405b6b] pl-5"><FeatureIcon aria-hidden="true" className="shrink-0 text-[#7bb5b9]" size={25} /><div><h3 className="text-sm font-bold text-white">{title as string}</h3><p className="mt-1 text-sm leading-6 text-[#b8c7cb]">{detail as string}</p></div></div>; })}</div></section>
</main>;
