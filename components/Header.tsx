import React from 'react';

interface HeaderProps {}

export const Header: React.FC<HeaderProps> = () => {
  const handleLogoClick = () => {
    window.location.href = '/';
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800 flex items-center justify-between px-4 sm:px-6 lg:px-8">
      <button
        onClick={handleLogoClick}
        className="flex items-center gap-3 hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 group"
        title="Back to home"
        aria-label="Back to InkMaster Studio home"
      >
        <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0">
          <img
            src="/logo/logo.png"
            alt=""
            className="w-full h-full object-contain"
          />
        </div>
        <div className="flex items-baseline gap-0.5">
          <span className="text-sm font-extrabold text-slate-100 tracking-tight">
            InkMaster
          </span>
          <span className="text-sm font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400 tracking-tight ml-1">
            Studio
          </span>
          <span className="hidden sm:block text-[9px] font-bold text-slate-500 uppercase tracking-widest ml-2 mb-0.5">
            Print prep
          </span>
        </div>
      </button>

      <div className="flex-1" />

      <div className="hidden text-[10px] font-semibold uppercase tracking-widest text-slate-500 sm:block">Local-first Printify prep</div>
    </header>
  );
};
