import React, { useState, useEffect } from 'react';
import { ProcessingSettings, SettingsPreset, ShirtColor, EdgeBehavior, DetailLevel, OutputFormat, ResizeMode, ItemType } from '../types';

interface PresetsPanelProps {
  currentSettings: ProcessingSettings;
  onApplyPreset: (settings: ProcessingSettings) => void;
}

const STORAGE_KEY = 'inkmaster_presets';

const DEFAULT_PRESETS: SettingsPreset[] = [
  {
    id: 'default_1',
    name: 'Dark Garment Standard',
    description: 'Black removal, soft edges, transparency preserved',
    createdAt: Date.now(),
    settings: {
        // @ts-ignore
        ...{ format: OutputFormat.PNG, shirtColor: ShirtColor.BLACK, itemType: ItemType.TSHIRT, previewOnBlack: true, detailLevel: DetailLevel.PRESERVE_GRAIN, edgeBehavior: EdgeBehavior.SOFT, threshold: 30, transparencyBoost: 1.0, convertToWhite: false, resizeMode: ResizeMode.FIT, allowUpscaling: true, noise: 0, grain: 0, sharpness: 0, preserveTransparency: true, bgRemoval: false, bgRemovalTolerance: 30, bgAutoDetect: true, bgColorOverride: null, vectorize: false, vectorizeColors: 16, vectorizeBlur: 0, vectorizeDetail: 50, colorReplacements: [], edgeFeather: 0 }
    }
  },
  {
    id: 'default_2',
    name: 'White Garment Standard',
    description: 'White removal, soft edges',
    createdAt: Date.now(),
    settings: {
        // @ts-ignore
        ...{ format: OutputFormat.PNG, shirtColor: ShirtColor.WHITE, itemType: ItemType.TSHIRT, previewOnBlack: true, detailLevel: DetailLevel.PRESERVE_GRAIN, edgeBehavior: EdgeBehavior.SOFT, threshold: 25, transparencyBoost: 1.0, convertToWhite: false, resizeMode: ResizeMode.FIT, allowUpscaling: true, noise: 0, grain: 0, sharpness: 0, preserveTransparency: true, bgRemoval: false, bgRemovalTolerance: 30, bgAutoDetect: true, bgColorOverride: null, vectorize: false, vectorizeColors: 16, vectorizeBlur: 0, vectorizeDetail: 50, colorReplacements: [], edgeFeather: 0 }
    }
  },
  {
    id: 'default_3',
    name: 'Vintage Distressed',
    description: 'Black removal with heavy grain and noise',
    createdAt: Date.now(),
    settings: {
         // @ts-ignore
         ...{ format: OutputFormat.PNG, shirtColor: ShirtColor.BLACK, itemType: ItemType.TSHIRT, previewOnBlack: true, detailLevel: DetailLevel.PRESERVE_GRAIN, edgeBehavior: EdgeBehavior.SOFT, threshold: 40, transparencyBoost: 1.0, convertToWhite: false, resizeMode: ResizeMode.FIT, allowUpscaling: true, noise: 20, grain: 40, sharpness: 0, preserveTransparency: true, bgRemoval: false, bgRemovalTolerance: 30, bgAutoDetect: true, bgColorOverride: null, vectorize: false, vectorizeColors: 16, vectorizeBlur: 0, vectorizeDetail: 50, colorReplacements: [], edgeFeather: 0 }
    }
  },
  {
    id: 'default_4',
    name: 'Clean Vector',
    description: 'No knockout, hard edges, clean lines',
    createdAt: Date.now(),
    settings: {
         // @ts-ignore
         ...{ format: OutputFormat.PNG, shirtColor: ShirtColor.NONE, itemType: ItemType.TSHIRT, previewOnBlack: true, detailLevel: DetailLevel.CLEAN_CRISPER, edgeBehavior: EdgeBehavior.HARD, threshold: 10, transparencyBoost: 1.0, convertToWhite: false, resizeMode: ResizeMode.FIT, allowUpscaling: true, noise: 0, grain: 0, sharpness: 0, preserveTransparency: true, bgRemoval: false, bgRemovalTolerance: 30, bgAutoDetect: true, bgColorOverride: null, vectorize: false, vectorizeColors: 16, vectorizeBlur: 0, vectorizeDetail: 50, colorReplacements: [], edgeFeather: 0 }
    }
  }
];

export const PresetsPanel: React.FC<PresetsPanelProps> = ({ currentSettings, onApplyPreset }) => {
  const [presets, setPresets] = useState<SettingsPreset[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [descInput, setDescInput] = useState('');

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      setPresets(JSON.parse(raw));
    } else {
      setPresets(DEFAULT_PRESETS);
    }
  }, []);

  const savePreset = () => {
    const newPreset: SettingsPreset = {
      id: `preset_${Date.now()}`,
      name: nameInput,
      description: descInput,
      createdAt: Date.now(),
      settings: currentSettings
    };
    const updated = [newPreset, ...presets];
    setPresets(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setShowSaveModal(false);
    setNameInput('');
    setDescInput('');
  };

  const deletePreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = presets.filter(p => p.id !== id);
    setPresets(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  return (
    <div className="border-b border-slate-800 pb-4 mb-4">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 hover:text-white"
      >
        <span>Presets</span>
        <span>{isOpen ? '−' : '+'}</span>
      </button>

      {isOpen && (
        <div className="space-y-3">
          <button 
            onClick={() => setShowSaveModal(true)}
            className="w-full py-2 flex items-center justify-center gap-2 bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
            Save Current Settings
          </button>

          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {presets.map(preset => (
              <div key={preset.id} className="group flex items-center justify-between p-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 transition-all">
                <div className="flex-1 min-w-0 mr-2">
                  <div className="font-bold text-xs text-slate-200 truncate">{preset.name}</div>
                  <div className="text-[10px] text-slate-500 truncate">{preset.description}</div>
                </div>
                <div className="flex items-center gap-1">
                   <button 
                     onClick={() => onApplyPreset(preset.settings)}
                     className="px-2 py-1 text-[10px] font-bold bg-indigo-600 text-white rounded hover:bg-indigo-500 transition-colors"
                   >
                     Apply
                   </button>
                   <button 
                     onClick={(e) => deletePreset(preset.id, e)}
                     className="w-5 h-5 flex items-center justify-center text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                   >
                     ×
                   </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showSaveModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-sm shadow-2xl">
                <h3 className="font-bold text-slate-100 mb-4">Save Preset</h3>
                <div className="space-y-3 mb-4">
                    <div>
                        <label className="text-xs text-slate-400 block mb-1">Name</label>
                        <input 
                            type="text" 
                            maxLength={30}
                            value={nameInput}
                            onChange={e => setNameInput(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-sm text-white focus:border-indigo-500 outline-none"
                            placeholder="My Awesome Preset"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-400 block mb-1">Description</label>
                        <input 
                            type="text" 
                            maxLength={80}
                            value={descInput}
                            onChange={e => setDescInput(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-sm text-white focus:border-indigo-500 outline-none"
                            placeholder="What does this do?"
                        />
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setShowSaveModal(false)} className="flex-1 py-2 bg-slate-800 rounded text-xs font-bold text-slate-400 hover:text-white">Cancel</button>
                    <button onClick={savePreset} disabled={!nameInput} className="flex-1 py-2 bg-indigo-600 rounded text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50">Save</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};