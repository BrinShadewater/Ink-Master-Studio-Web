import React, { useState, lazy, Suspense } from 'react';
import { ProcessingSettings, OutputFormat, ShirtColor, EdgeBehavior, DetailLevel, ResizeMode, ItemType } from '../types';
import { PresetsPanel } from './PresetsPanel';
import { ExportHistoryEntry } from '../types';

// Lazy load export history
const ExportHistory = lazy(() => import('./ExportHistory').then(module => ({ default: module.ExportHistory })));

interface ControlsProps {
  settings: ProcessingSettings;
  onSettingsChange: (newSettings: ProcessingSettings, shouldCommit: boolean) => void;
  onAiRemoveBackground: () => void;
  isAiProcessing: boolean;
  isProcessing: boolean;
  palette: string[];
  hasUsedAi: boolean;
  // New props
  onGenerateUnderbase: (format: 'PNG' | 'SVG' | 'JPG') => void;
  hasProcessedResult: boolean;
  exportHistory: ExportHistoryEntry[];
  isEyedropperMode: boolean;
  onToggleEyedropper: () => void;
}

export const Controls: React.FC<ControlsProps> = ({
  settings,
  onSettingsChange,
  onAiRemoveBackground,
  isAiProcessing,
  isProcessing,
  palette,
  hasUsedAi,
  onGenerateUnderbase,
  hasProcessedResult,
  exportHistory,
  isEyedropperMode,
  onToggleEyedropper,
}) => {
  const [copiedColor, setCopiedColor] = useState<string | null>(null);

  const handleChange = <K extends keyof ProcessingSettings>(
    key: K,
    value: ProcessingSettings[K],
    commit: boolean = true
  ) => {
    onSettingsChange({ ...settings, [key]: value }, commit);
  };

  const copyToClipboard = (color: string) => {
    navigator.clipboard.writeText(color);
    setCopiedColor(color);
    setTimeout(() => setCopiedColor(null), 1500);
  };
  
  // Color Replacement Helpers
  const addColorReplacement = (source: string) => {
      const newRep = { sourceColor: source, targetColor: '#FFFFFF', tolerance: 10 };
      handleChange('colorReplacements', [...(settings.colorReplacements || []), newRep], true);
  };
  const updateColorReplacement = (index: number, updates: any) => {
      const newReps = [...(settings.colorReplacements || [])];
      newReps[index] = { ...newReps[index], ...updates };
      handleChange('colorReplacements', newReps, false); // don't commit on drag
  };
  const removeColorReplacement = (index: number) => {
      const newReps = [...(settings.colorReplacements || [])];
      newReps.splice(index, 1);
      handleChange('colorReplacements', newReps, true);
  };

  const items = [
    { id: ItemType.TSHIRT, label: 'Tee', icon: '👕', enabled: true },
    { id: ItemType.HOODIE, label: 'Hoodie', icon: '🧥', enabled: false },
    { id: ItemType.HAT, label: 'Hat', icon: '🧢', enabled: false },
    { id: ItemType.MUG, label: 'Mug', icon: '☕', enabled: false },
    { id: ItemType.TOTE, label: 'Tote', icon: '👜', enabled: false },
  ];

  return (
    <div className="w-full bg-slate-900 p-6 rounded-xl border border-slate-800 flex flex-col gap-8 h-fit shadow-2xl">
      
      {/* Feature 9: Presets */}
      <PresetsPanel currentSettings={settings} onApplyPreset={(s) => onSettingsChange(s, true)} />

      {/* Item Selector */}
      <div>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Product Type</h2>
        <div className="grid grid-cols-5 gap-2">
          {items.map((item) => (
            <div key={item.id} className="relative group">
              <button
                onClick={() => item.enabled && handleChange('itemType', item.id, true)}
                disabled={!item.enabled}
                className={`w-full flex flex-col items-center justify-center p-2 rounded-lg transition-all ${
                  !item.enabled 
                    ? 'opacity-40 cursor-not-allowed bg-slate-800 text-slate-500' 
                    : settings.itemType === item.id
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 scale-105'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                }`}
                title={item.label}
              >
                <span className="text-xl mb-1">{item.icon}</span>
              </button>
              {!item.enabled && (
                <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-slate-800 text-[9px] text-slate-300 px-2 py-1 rounded border border-slate-700 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                  Coming Soon
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Feature 5: Color Replacement */}
      <div>
         <div className="flex justify-between items-center mb-3">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Color Replacement</h2>
            <button 
                onClick={onToggleEyedropper}
                className={`p-1.5 rounded transition-colors ${isEyedropperMode ? 'bg-indigo-600 text-white animate-pulse' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                title="Pick color from image"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4c0-1.473 1.333-6.14 2.302-8.819A1.988 1.988 0 017 8.16l9-4.043a2 2 0 012.593.743l1.192 2.122c.605 1.075.253 2.454-.775 3.032l-8.854 5.378A2 2 0 017 21z" /></svg>
            </button>
         </div>
         <div className="space-y-2">
             {settings.colorReplacements && settings.colorReplacements.map((rep, idx) => (
                 <div key={idx} className="bg-slate-800/50 p-2 rounded border border-slate-700 flex flex-col gap-2">
                     <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded border border-slate-600" style={{backgroundColor: rep.sourceColor}} title="Source Color"></div>
                        <span className="text-slate-500 text-xs">→</span>
                        <input type="color" value={rep.targetColor} onChange={(e) => updateColorReplacement(idx, {targetColor: e.target.value})} className="w-6 h-6 rounded border border-slate-600 bg-transparent cursor-pointer p-0" />
                        <button onClick={() => removeColorReplacement(idx)} className="ml-auto text-slate-500 hover:text-red-400">×</button>
                     </div>
                     <div className="flex items-center gap-2">
                         <span className="text-[9px] text-slate-500 w-6">Tol</span>
                         <input type="range" min="0" max="100" value={rep.tolerance} onChange={(e) => updateColorReplacement(idx, {tolerance: parseInt(e.target.value)})} onMouseUp={() => handleChange('colorReplacements', settings.colorReplacements, true)} className="flex-1 h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-indigo-500" />
                     </div>
                 </div>
             ))}
             {(!settings.colorReplacements || settings.colorReplacements.length === 0) && (
                 <p className="text-[10px] text-slate-600 italic">No active replacements. Use the eyedropper or add from palette.</p>
             )}
         </div>
         {/* Palette for quick add */}
         {palette.length > 0 && (
             <div className="mt-3 pt-2 border-t border-slate-800/50">
                 <p className="text-[9px] text-slate-500 mb-2">Add from palette:</p>
                 <div className="flex gap-1">
                     {palette.map((c, i) => (
                         <button key={i} onClick={() => addColorReplacement(c)} className="w-5 h-5 rounded-full border border-slate-600 hover:scale-110 transition-transform" style={{backgroundColor: c}}></button>
                     ))}
                 </div>
             </div>
         )}
      </div>

      {/* Background Removal Section */}
      <div>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Background Removal</h2>
        <div className="flex flex-col gap-3">
          
          {/* Flood Fill BG */}
          <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700/50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold text-indigo-300 uppercase tracking-widest flex items-center gap-2">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                Flood Fill BG
              </h2>
              <button
                onClick={() => handleChange('bgRemoval', !settings.bgRemoval, true)}
                className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 relative ${settings.bgRemoval ? 'bg-indigo-500' : 'bg-slate-600'}`}
              >
                <div className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-200 ${settings.bgRemoval ? 'translate-x-4' : 'translate-x-0'}`}></div>
              </button>
            </div>

            {settings.bgRemoval && (
              <div className="space-y-4 pt-2 border-t border-slate-700/50">
                {/* Auto-detect toggle */}
                <div className="flex items-center justify-between bg-slate-800 p-2 rounded border border-slate-700">
                  <label className="text-xs text-slate-300">Auto-Detect Color</label>
                  <button
                    onClick={() => {
                      handleChange('bgAutoDetect', !settings.bgAutoDetect, true);
                      if (!settings.bgAutoDetect) {
                        handleChange('bgColorOverride', null, true);
                      }
                    }}
                    className={`w-7 h-4 rounded-full p-0.5 transition-colors duration-200 relative ${settings.bgAutoDetect ? 'bg-indigo-500' : 'bg-slate-600'}`}
                  >
                    <div className={`bg-white w-3 h-3 rounded-full shadow-sm transform transition-transform duration-200 ${settings.bgAutoDetect ? 'translate-x-3' : 'translate-x-0'}`}></div>
                  </button>
                </div>

                {/* Manual color override */}
                {!settings.bgAutoDetect && (
                  <div className="bg-slate-800 p-3 rounded border border-slate-700">
                    <label className="text-xs text-slate-400 block mb-2">Manual Background Color</label>
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <input
                          type="color"
                          value={settings.bgColorOverride ?? '#000000'}
                          onChange={(e) => handleChange('bgColorOverride', e.target.value, false)}
                          onBlur={(e) => handleChange('bgColorOverride', e.target.value, true)}
                          className="w-10 h-10 rounded-lg border border-slate-600 cursor-pointer bg-transparent p-0.5"
                          title="Pick background color to remove"
                        />
                      </div>
                      <input
                        type="text"
                        value={settings.bgColorOverride ?? '#000000'}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                            handleChange('bgColorOverride', val, false);
                          }
                        }}
                        onBlur={(e) => {
                          const val = e.target.value;
                          if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                            handleChange('bgColorOverride', val, true);
                          }
                        }}
                        placeholder="#000000"
                        className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-200 font-mono uppercase"
                        maxLength={7}
                      />
                      <button
                        onClick={() => handleChange('bgColorOverride', '#000000', true)}
                        className="w-6 h-6 rounded-full bg-black border border-slate-500 hover:scale-110 transition-transform"
                        title="Black"
                      />
                      <button
                        onClick={() => handleChange('bgColorOverride', '#FFFFFF', true)}
                        className="w-6 h-6 rounded-full bg-white border border-slate-500 hover:scale-110 transition-transform"
                        title="White"
                      />
                    </div>
                  </div>
                )}

                {/* Tolerance slider */}
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-xs text-slate-500">Color Tolerance</label>
                    <span className="text-xs text-indigo-400 font-mono">{settings.bgRemovalTolerance}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={settings.bgRemovalTolerance}
                    onChange={(e) => handleChange('bgRemovalTolerance', Number(e.target.value), false)}
                    onMouseUp={() => handleChange('bgRemovalTolerance', settings.bgRemovalTolerance, true)}
                    onTouchEnd={() => handleChange('bgRemovalTolerance', settings.bgRemovalTolerance, true)}
                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* AI Tools */}
          <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700/50 grayscale opacity-60">
             <div className="flex justify-between items-center mb-3">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  AI Tools
                </h2>
                <span className="text-[9px] bg-slate-800 text-slate-500 px-2 py-0.5 rounded border border-slate-700">Disabled</span>
            </div>
            <button
              onClick={onAiRemoveBackground}
              disabled={true}
              className="w-full py-3 px-4 rounded-xl font-bold text-sm shadow-none flex items-center justify-center gap-2 transition-all bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
            >
               ✨ Remove Background
            </button>
          </div>

          {/* Feature 3: White Underbase */}
          <div>
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
              White Underbase
            </h2>
            <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700/50 space-y-3">
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Generates a white silhouette layer for DTG dark garment printing.
              </p>
              <div className="grid grid-cols-3 gap-1">
                {(['PNG', 'SVG', 'JPG'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => onGenerateUnderbase(fmt)}
                    disabled={!hasProcessedResult}
                    className="py-2 text-xs font-bold rounded-lg bg-slate-700 text-slate-300 hover:bg-white hover:text-slate-900 border border-slate-600 hover:border-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>

       {/* Vectorization Section */}
       <div>
         <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Vectorization</h2>
         <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700/50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                Trace to SVG
              </h2>
              <button
                onClick={() => handleChange('vectorize', !settings.vectorize, true)}
                className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 relative ${settings.vectorize ? 'bg-emerald-500' : 'bg-slate-600'}`}
              >
                <div className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-200 ${settings.vectorize ? 'translate-x-4' : 'translate-x-0'}`}></div>
              </button>
            </div>
            
            {settings.vectorize && (
              <div className="space-y-4 pt-2 border-t border-slate-700/50">
                 <div>
                    <div className="flex justify-between mb-2">
                      <label className="text-xs text-slate-500">Color Count</label>
                      <span className="text-xs text-emerald-400 font-mono">{settings.vectorizeColors}</span>
                    </div>
                    <input
                      type="range"
                      min="2"
                      max="32"
                      step="1"
                      value={settings.vectorizeColors}
                      onChange={(e) => handleChange('vectorizeColors', Number(e.target.value), false)}
                      onMouseUp={() => handleChange('vectorizeColors', settings.vectorizeColors, true)}
                      onTouchEnd={() => handleChange('vectorizeColors', settings.vectorizeColors, true)}
                      className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                 </div>
                 <div>
                    <div className="flex justify-between mb-2">
                      <label className="text-xs text-slate-500">Smoothness (Blur)</label>
                      <span className="text-xs text-emerald-400 font-mono">{settings.vectorizeBlur}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="5"
                      step="1"
                      value={settings.vectorizeBlur}
                      onChange={(e) => handleChange('vectorizeBlur', Number(e.target.value), false)}
                      onMouseUp={() => handleChange('vectorizeBlur', settings.vectorizeBlur, true)}
                      onTouchEnd={() => handleChange('vectorizeBlur', settings.vectorizeBlur, true)}
                      className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                 </div>
                 <div>
                    <div className="flex justify-between mb-2">
                      <label className="text-xs text-slate-500">Detail Accuracy</label>
                      <span className="text-xs text-emerald-400 font-mono">{settings.vectorizeDetail}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      step="10"
                      value={settings.vectorizeDetail}
                      onChange={(e) => handleChange('vectorizeDetail', Number(e.target.value), false)}
                      onMouseUp={() => handleChange('vectorizeDetail', settings.vectorizeDetail, true)}
                      onTouchEnd={() => handleChange('vectorizeDetail', settings.vectorizeDetail, true)}
                      className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                 </div>
              </div>
            )}
         </div>
       </div>

      {/* Format */}
      <div>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Export Format</h2>
        <div className="flex flex-col gap-3">
          <div className="flex bg-slate-800 rounded-lg p-1 gap-1 border border-slate-700">
            {Object.values(OutputFormat).map((fmt) => (
              <button
                key={fmt}
                onClick={() => handleChange('format', fmt, true)}
                className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${
                  settings.format === fmt
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
                disabled={settings.vectorize && fmt !== OutputFormat.SVG}
              >
                {fmt}
              </button>
            ))}
          </div>

          {settings.vectorize && settings.format !== OutputFormat.SVG && (
             <div className="text-[10px] text-emerald-400 bg-emerald-900/20 p-2 rounded border border-emerald-500/30">
                Vectorization enabled: Format forced to SVG.
             </div>
          )}

          {settings.format !== OutputFormat.JPG && !settings.vectorize && settings.format !== OutputFormat.PDF && (
            <div className="flex items-center justify-between bg-slate-800 p-3 rounded-lg border border-slate-700">
              <label
                className="text-xs font-medium text-slate-300 cursor-pointer select-none"
                onClick={() => handleChange('preserveTransparency', !settings.preserveTransparency, true)}
              >
                Preserve Transparency
              </label>
              <button
                onClick={() => handleChange('preserveTransparency', !settings.preserveTransparency, true)}
                className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 relative ${settings.preserveTransparency ? 'bg-indigo-500' : 'bg-slate-600'}`}
              >
                <div className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-200 ${settings.preserveTransparency ? 'translate-x-4' : 'translate-x-0'}`}></div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Resize */}
      <div>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Layout</h2>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-4 gap-1 bg-slate-800 rounded-lg p-1 border border-slate-700">
            {Object.values(ResizeMode).map((mode) => (
              <button
                key={mode}
                onClick={() => handleChange('resizeMode', mode, true)}
                className={`py-2 text-[10px] font-bold rounded-md transition-all uppercase ${
                  settings.resizeMode === mode
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {settings.resizeMode === ResizeMode.FIT && (
            <div className="flex items-center justify-between bg-slate-800 p-3 rounded-lg border border-slate-700">
              <label
                className="text-xs font-medium text-slate-300 cursor-pointer select-none"
                onClick={() => handleChange('allowUpscaling', !settings.allowUpscaling, true)}
              >
                Upscale Small Images
              </label>
              <button
                onClick={() => handleChange('allowUpscaling', !settings.allowUpscaling, true)}
                className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 relative ${settings.allowUpscaling ? 'bg-indigo-500' : 'bg-slate-600'}`}
              >
                <div className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-200 ${settings.allowUpscaling ? 'translate-x-4' : 'translate-x-0'}`}></div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Prep Settings */}
      <div>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Processing Mode</h2>
        <div className="mb-4 space-y-2">
          <button
            onClick={() => handleChange('shirtColor', ShirtColor.NONE, true)}
            className={`w-full py-3 px-3 rounded-lg border text-xs font-semibold flex items-center justify-between gap-2 transition-all ${
              settings.shirtColor === ShirtColor.NONE
                ? 'border-indigo-500 bg-slate-800 text-white shadow-sm ring-1 ring-indigo-500/50'
                : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:bg-slate-800'
            }`}
          >
            <span className="flex items-center gap-2">🚫 Keep Original (No Knockout)</span>
            {settings.shirtColor === ShirtColor.NONE && <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>}
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleChange('shirtColor', ShirtColor.BLACK, true)}
              className={`py-3 px-3 rounded-lg border text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-all ${
                settings.shirtColor === ShirtColor.BLACK
                  ? 'border-indigo-500 bg-slate-800 text-white shadow-sm ring-1 ring-indigo-500/50'
                  : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <span className="flex items-center gap-2">
                <div className="w-3 h-3 bg-black border border-slate-600 rounded-full"></div> Remove Black
              </span>
              <span className="text-[9px] opacity-60 font-normal">For Dark Garments</span>
            </button>
            <button
              onClick={() => handleChange('shirtColor', ShirtColor.WHITE, true)}
              className={`py-3 px-3 rounded-lg border text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-all ${
                settings.shirtColor === ShirtColor.WHITE
                  ? 'border-indigo-500 bg-slate-100 text-slate-900 shadow-sm ring-1 ring-indigo-500/50'
                  : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <span className="flex items-center gap-2">
                <div className="w-3 h-3 bg-white rounded-full"></div> Remove White
              </span>
              <span className="text-[9px] opacity-60 font-normal">For Light Garments</span>
            </button>
          </div>
        </div>

        {settings.shirtColor === ShirtColor.BLACK && (
          <div className="space-y-5">
            <div className="flex items-center justify-between bg-slate-800 p-3 rounded-lg border border-slate-700">
              <label
                className="text-xs font-medium text-slate-300 cursor-pointer select-none"
                onClick={() => handleChange('convertToWhite', !settings.convertToWhite, true)}
              >
                Convert to White Ink
              </label>
              <button
                onClick={() => handleChange('convertToWhite', !settings.convertToWhite, true)}
                className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 relative ${settings.convertToWhite ? 'bg-indigo-500' : 'bg-slate-600'}`}
              >
                <div className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-200 ${settings.convertToWhite ? 'translate-x-4' : 'translate-x-0'}`}></div>
              </button>
            </div>
          </div>
        )}

        {settings.shirtColor !== ShirtColor.NONE && (
          <div className="mt-5">
            <div className="flex justify-between mb-2">
              <label className="text-xs text-slate-500">
                {settings.shirtColor === ShirtColor.BLACK ? 'Black Sensitivity' : 'White Sensitivity'}
              </label>
              <span className="text-xs text-indigo-400 font-mono">{settings.threshold}</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={settings.threshold}
              onChange={(e) => handleChange('threshold', Number(e.target.value), false)}
              onMouseUp={() => handleChange('threshold', settings.threshold, true)}
              onTouchEnd={() => handleChange('threshold', settings.threshold, true)}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>
        )}
      </div>

      {/* Texture Controls */}
      <div>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Texture & Finish</h2>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs text-slate-500">Sharpness</label>
              <span className="text-xs text-indigo-400 font-mono">{settings.sharpness}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={settings.sharpness}
              onChange={(e) => handleChange('sharpness', Number(e.target.value), false)}
              onMouseUp={() => handleChange('sharpness', settings.sharpness, true)}
              onTouchEnd={() => handleChange('sharpness', settings.sharpness, true)}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs text-slate-500">Noise (Fine)</label>
              <span className="text-xs text-indigo-400 font-mono">{settings.noise}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={settings.noise}
              onChange={(e) => handleChange('noise', Number(e.target.value), false)}
              onMouseUp={() => handleChange('noise', settings.noise, true)}
              onTouchEnd={() => handleChange('noise', settings.noise, true)}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs text-slate-500">Grain (Distress)</label>
              <span className="text-xs text-indigo-400 font-mono">{settings.grain}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={settings.grain}
              onChange={(e) => handleChange('grain', Number(e.target.value), false)}
              onMouseUp={() => handleChange('grain', settings.grain, true)}
              onTouchEnd={() => handleChange('grain', settings.grain, true)}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>

          {/* Feature 7: Edge Feathering */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs text-slate-500">Edge Feather</label>
              <span className="text-xs text-indigo-400 font-mono">{settings.edgeFeather}px</span>
            </div>
            <input
              type="range"
              min="0"
              max="20"
              value={settings.edgeFeather}
              onChange={(e) => handleChange('edgeFeather', Number(e.target.value), false)}
              onMouseUp={() => handleChange('edgeFeather', settings.edgeFeather, true)}
              onTouchEnd={() => handleChange('edgeFeather', settings.edgeFeather, true)}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>

          {settings.shirtColor !== ShirtColor.NONE && (
            <div className="pt-2">
              <label className="block text-xs text-slate-500 mb-2">Edge Behavior</label>
              <div className="flex bg-slate-800 rounded-lg p-1 gap-1 border border-slate-700">
                <button
                  onClick={() => handleChange('edgeBehavior', EdgeBehavior.SOFT, true)}
                  className={`flex-1 py-1.5 px-2 text-xs font-bold rounded transition-all ${
                    settings.edgeBehavior === EdgeBehavior.SOFT
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Soft (DTG)
                </button>
                <button
                  onClick={() => handleChange('edgeBehavior', EdgeBehavior.HARD, true)}
                  className={`flex-1 py-1.5 px-2 text-xs font-bold rounded transition-all ${
                    settings.edgeBehavior === EdgeBehavior.HARD
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Hard
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Feature 10: Export History */}
      <Suspense fallback={<div className="h-20" />}>
        <ExportHistory entries={exportHistory} />
      </Suspense>
    </div>
  );
};