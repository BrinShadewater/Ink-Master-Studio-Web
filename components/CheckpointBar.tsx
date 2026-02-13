import React, { useState, useEffect, useRef } from 'react';
import { ProcessingSettings } from '../types';

export interface Checkpoint {
  id: string;
  name: string;
  timestamp: number;
  settings: ProcessingSettings;
  thumbnail: string | null;
  imageUrl: string | null;
}

interface CheckpointBarProps {
  currentSettings: ProcessingSettings;
  currentThumbnail: string | null;
  onRestore: (checkpoint: Checkpoint) => void;
}

const STORAGE_KEY = 'inkmaster_checkpoints';
const MAX_CHECKPOINTS = 5;

const loadFromStorage = (): Checkpoint[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveToStorage = (checkpoints: Checkpoint[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(checkpoints));
  } catch {
    console.warn('Could not save checkpoints to localStorage');
  }
};

const generateThumbnail = async (imageUrl: string): Promise<string | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const size = 120;
        const aspect = img.naturalWidth / img.naturalHeight;
        canvas.width = aspect >= 1 ? size : size * aspect;
        canvas.height = aspect >= 1 ? size / aspect : size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png', 0.7));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
};

export const CheckpointBar: React.FC<CheckpointBarProps> = ({
  currentSettings,
  currentThumbnail,
  onRestore,
}) => {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>(loadFromStorage);
  const [isSaving, setIsSaving] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [showNameModal, setShowNameModal] = useState(false);
  const [previewCheckpoint, setPreviewCheckpoint] = useState<Checkpoint | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveToStorage(checkpoints);
  }, [checkpoints]);

  useEffect(() => {
    if (showNameModal) {
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [showNameModal]);

  const handleSaveClick = () => {
    setNameInput(`Checkpoint ${checkpoints.length + 1}`);
    setShowNameModal(true);
  };

  const handleConfirmSave = async () => {
    if (!nameInput.trim()) return;
    setIsSaving(true);
    setShowNameModal(false);

    const thumbnail = currentThumbnail
      ? await generateThumbnail(currentThumbnail)
      : null;

    const newCheckpoint: Checkpoint = {
      id: `cp_${Date.now()}`,
      name: nameInput.trim(),
      timestamp: Date.now(),
      settings: { ...currentSettings },
      thumbnail,
      imageUrl: currentThumbnail,
    };

    setCheckpoints((prev) => {
      const updated = [...prev, newCheckpoint];
      return updated.length > MAX_CHECKPOINTS
        ? updated.slice(updated.length - MAX_CHECKPOINTS)
        : updated;
    });

    setIsSaving(false);

    setTimeout(() => {
      scrollRef.current?.scrollTo({ left: scrollRef.current.scrollWidth, behavior: 'smooth' });
    }, 100);
  };

  const handleDelete = (id: string) => {
    setCheckpoints((prev) => prev.filter((c) => c.id !== id));
    setDeleteConfirmId(null);
    if (previewCheckpoint?.id === id) setPreviewCheckpoint(null);
  };

  const handleRestoreConfirm = () => {
    if (!previewCheckpoint) return;
    onRestore(previewCheckpoint);
    setPreviewCheckpoint(null);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <>
      <div className="w-full bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl mt-4">
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-center gap-2">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Snapshots</h3>
            <button
                onClick={handleSaveClick}
                disabled={isSaving || !currentThumbnail}
                title={!currentThumbnail ? 'Process an image first' : 'Save checkpoint'}
                className={`flex-shrink-0 flex flex-col items-center justify-center w-20 h-20 rounded-xl border-2 border-dashed transition-all ${
                isSaving || !currentThumbnail
                    ? 'bg-slate-800/50 border-slate-700 text-slate-600 cursor-not-allowed'
                    : 'bg-slate-800 border-indigo-500/50 text-indigo-400 hover:bg-indigo-600 hover:text-white hover:border-indigo-500 active:scale-95'
                }`}
            >
                {isSaving ? (
                <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin mb-1" />
                ) : (
                <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                )}
                <span className="text-[10px] font-bold">NEW</span>
            </button>
          </div>

          <div className="w-px h-20 bg-slate-800 flex-shrink-0" />

          <div
            ref={scrollRef}
            className="flex-1 flex items-center gap-4 overflow-x-auto pb-2 pt-1"
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#334155 #0f172a' }}
          >
            {checkpoints.length === 0 ? (
              <div className="flex items-center gap-2 text-slate-600 text-sm italic select-none h-20 pl-2">
                <svg className="w-5 h-5 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                </svg>
                Save your settings to create a checkpoint
              </div>
            ) : (
              checkpoints.map((cp, idx) => (
                <div
                  key={cp.id}
                  className="flex-shrink-0 group relative cursor-pointer"
                  onClick={() => setPreviewCheckpoint(cp)}
                >
                  <div className="flex flex-col items-center gap-2 p-2 rounded-xl border border-slate-700 bg-slate-800 hover:border-indigo-500/60 transition-all w-28 hover:-translate-y-1 shadow-md">
                    <div className="w-24 h-24 rounded-lg overflow-hidden bg-slate-700 flex items-center justify-center border border-slate-600 relative bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/nYDCgBDAm9BGDWAAjyQc6wcXOQAQLA2PpAPbnAAAAABJRU5ErkJggg==')]">
                      {cp.thumbnail ? (
                        <img src={cp.thumbnail} alt={cp.name} className="w-full h-full object-contain" />
                      ) : (
                        <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01" />
                        </svg>
                      )}
                      <div className="absolute top-1 left-1 w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center shadow-md">
                        <span className="text-[10px] font-bold text-white">{idx + 1}</span>
                      </div>
                    </div>
                    <div className="w-full px-1">
                        <p className="text-[11px] font-semibold text-slate-300 text-center leading-tight truncate w-full" title={cp.name}>
                        {cp.name}
                        </p>
                        <p className="text-[9px] text-slate-500 text-center mt-0.5">
                        {formatDate(cp.timestamp)}
                        </p>
                    </div>
                    
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(cp.id); }}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-slate-700 border border-slate-600 rounded-full items-center justify-center hidden group-hover:flex hover:bg-red-600 hover:border-red-500 transition-all shadow-lg z-10"
                      title="Delete checkpoint"
                    >
                      <svg className="w-3 h-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          
           <div className="flex-shrink-0 text-[10px] text-slate-600 font-mono flex flex-col items-center gap-1">
            <span className="text-lg font-bold text-slate-500">{checkpoints.length}</span>
            <span className="uppercase tracking-widest text-[9px]">of {MAX_CHECKPOINTS}</span>
          </div>

        </div>
      </div>

      {/* Name Input Modal */}
      {showNameModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-sm font-bold text-slate-100 mb-1 flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              </svg>
              Save Checkpoint
            </h3>
            <p className="text-xs text-slate-500 mb-4">Give this snapshot a name so you can find it later.</p>
            <input
              ref={nameInputRef}
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmSave();
                if (e.key === 'Escape') setShowNameModal(false);
              }}
              placeholder="e.g. Sharp edges, no grain"
              maxLength={30}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 mb-4"
            />
            {checkpoints.length >= MAX_CHECKPOINTS && (
              <p className="text-[10px] text-amber-400 bg-amber-900/20 border border-amber-500/30 rounded px-2 py-1.5 mb-3">
                ⚠️ Max checkpoints reached. The oldest one will be removed.
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowNameModal(false)}
                className="flex-1 py-2.5 rounded-lg text-xs font-bold bg-slate-800 text-slate-400 hover:text-white border border-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSave}
                disabled={!nameInput.trim()}
                className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${
                  nameInput.trim()
                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500 active:scale-95'
                    : 'bg-slate-800 text-slate-600 border border-slate-700 cursor-not-allowed'
                }`}
              >
                Save Checkpoint
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview / Restore Modal */}
      {previewCheckpoint && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewCheckpoint(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-100">{previewCheckpoint.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {formatDate(previewCheckpoint.timestamp)} at {formatTime(previewCheckpoint.timestamp)}
                </p>
              </div>
              <button onClick={() => setPreviewCheckpoint(null)} className="text-slate-500 hover:text-white transition-colors p-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="w-full h-48 bg-slate-800 rounded-xl overflow-hidden flex items-center justify-center mb-4 border border-slate-700 bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/nYDCgBDAm9BGDWAAjyQc6wcXOQAQLA2PpAPbnAAAAABJRU5ErkJggg==')]">
              {previewCheckpoint.thumbnail ? (
                <img src={previewCheckpoint.thumbnail} alt={previewCheckpoint.name} className="max-w-full max-h-full object-contain drop-shadow-xl" />
              ) : (
                <p className="text-slate-600 text-xs">No preview available</p>
              )}
            </div>

            <div className="bg-slate-800 rounded-lg p-3 mb-4 border border-slate-700">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Settings Snapshot</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {[
                  ['Mode', previewCheckpoint.settings.shirtColor],
                  ['Format', previewCheckpoint.settings.format],
                  ['Threshold', previewCheckpoint.settings.threshold],
                  ['Edge', previewCheckpoint.settings.edgeBehavior],
                  ['Noise', `${previewCheckpoint.settings.noise}%`],
                  ['Grain', `${previewCheckpoint.settings.grain}%`],
                  ['BG Removal', previewCheckpoint.settings.bgRemoval ? 'On' : 'Off'],
                  ['Transparency', previewCheckpoint.settings.preserveTransparency ? 'On' : 'Off'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-[10px] text-slate-500">{label}</span>
                    <span className="text-[10px] text-slate-300 font-mono">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => { setPreviewCheckpoint(null); setDeleteConfirmId(previewCheckpoint.id); }}
                className="py-2.5 px-4 rounded-lg text-xs font-bold bg-slate-800 text-red-400 hover:bg-red-900/30 border border-slate-700 hover:border-red-500/50 transition-colors"
              >
                Delete
              </button>
              <button
                onClick={() => setPreviewCheckpoint(null)}
                className="flex-1 py-2.5 rounded-lg text-xs font-bold bg-slate-800 text-slate-400 hover:text-white border border-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRestoreConfirm}
                className="flex-1 py-2.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500 active:scale-95 transition-all flex items-center justify-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirmId && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setDeleteConfirmId(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-xs shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-slate-100 mb-2">Delete Checkpoint?</h3>
            <p className="text-xs text-slate-500 mb-5">
              "{checkpoints.find(c => c.id === deleteConfirmId)?.name}" will be permanently removed.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-2.5 rounded-lg text-xs font-bold bg-slate-800 text-slate-400 hover:text-white border border-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="flex-1 py-2.5 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-500 text-white border border-red-500 active:scale-95 transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};