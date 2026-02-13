import React from 'react';

interface HeaderProps {
  // No props needed for simple header
}

export const Header: React.FC<HeaderProps> = () => {
  const handleLogoClick = () => {
    window.location.href = '/';
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800 flex items-center justify-between px-4 sm:px-6 lg:px-8">
      {/* Left: Logo + App Name — clicking navigates home */}
      <button
        onClick={handleLogoClick}
        className="flex items-center gap-3 hover:opacity-80 transition-opacity focus:outline-none group"
        title="Back to home"
      >
        <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0">
          <img
            src="public/logo/logo.png"
            alt="InkMaster AI"
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
          <span className="hidden sm:block text-[9px] font-bold text-slate-600 uppercase tracking-widest ml-2 mb-0.5">
            BETA
          </span>
        </div>
      </button>

      {/* Center spacer */}
      <div className="flex-1" />

      {/* Right side spacer or additional links if needed later */}
      <div className="w-8"></div>
    </header>
  );
};