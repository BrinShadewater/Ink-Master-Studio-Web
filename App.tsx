import React, { useState, useEffect } from 'react';
import { Dropzone } from './components/Dropzone';
import { Controls } from './components/Controls';
import { Preview } from './components/Preview';
import { CheckpointBar, Checkpoint } from './components/CheckpointBar';
import { BatchProcessor } from './components/BatchProcessor';
import { Header } from './components/Header';
import { ProcessingSettings, ProcessedResult, ShirtColor, ExportHistoryEntry } from './types';
import { DEFAULT_SETTINGS, TARGET_WIDTH, TARGET_HEIGHT } from './constants';
import { processImage, fileToBase64, generatePalette, getPrintDPI, generateUnderbase } from './services/imageProcessing';
import { editImageWithGemini } from './services/geminiService';

interface AppState {
    image: string | null;
    settings: ProcessingSettings;
    hasUsedAi: boolean;
}

const App: React.FC = () => {
  const [history, setHistory] = useState<AppState[]>([{ image: null, settings: DEFAULT_SETTINGS, hasUsedAi: false }]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [appState, setAppState] = useState<AppState>({ image: null, settings: DEFAULT_SETTINGS, hasUsedAi: false });

  // Feature 1: DPI State
  const [dpiInfo, setDpiInfo] = useState<{ dpi: number; status: 'good' | 'low' | 'poor'; label: string } | null>(null);
  
  // Feature 2: Batch Mode
  const [showBatch, setShowBatch] = useState(false);

  // Feature 10: Export History
  const [exportHistory, setExportHistory] = useState<ExportHistoryEntry[]>([]);
  
  // Feature 5: Eyedropper
  const [isEyedropperMode, setIsEyedropperMode] = useState(false);

  useEffect(() => {
      const currentState = history[historyIndex];
      if (currentState) {
          setAppState(currentState);
      }
  }, [historyIndex, history]);

  const originalImage = appState.image;
  const settings = appState.settings;
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const [processedResult, setProcessedResult] = useState<ProcessedResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [palette, setPalette] = useState<string[]>([]);

  useEffect(() => {
      if (originalImage) {
          generatePalette(originalImage).then(setPalette).catch(console.error);
      } else {
          setPalette([]);
      }
  }, [originalImage]);

  useEffect(() => {
    if (!originalImage) return;
    const timer = setTimeout(() => {
      runProcessing(originalImage, settings);
    }, 300);
    return () => clearTimeout(timer);
  }, [settings, originalImage]);

  const runProcessing = async (src: string, currentSettings: ProcessingSettings) => {
    setIsProcessing(true);
    setError(null);
    try {
      const result = await processImage(src, currentSettings);
      setProcessedResult(result);
    } catch (err) {
      console.error(err);
      setError('Failed to process image. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const addToHistory = (newState: AppState) => {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newState);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
  };

  const addToExportHistory = (entry: Omit<ExportHistoryEntry, 'id'>) => {
    setExportHistory(prev => [{
      ...entry,
      id: `export_${Date.now()}`
    }, ...prev].slice(0, 20)); // keep last 20
  };

  const handleSettingsChange = (newSettings: ProcessingSettings, commit: boolean) => {
      const newState = { ...appState, settings: newSettings };
      setAppState(newState);
      if (commit) {
          addToHistory(newState);
      }
  };

  const handleUndo = () => {
      if (canUndo) setHistoryIndex(historyIndex - 1);
  };

  const handleRedo = () => {
      if (canRedo) setHistoryIndex(historyIndex + 1);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            handleUndo();
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
            e.preventDefault();
            handleRedo();
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, history, canUndo, canRedo]);

  const handleFileAccepted = async (file: File) => {
    try {
        const base64 = await fileToBase64(file);
        const dataUrl = `data:${file.type};base64,${base64}`;
        
        // Calculate DPI
        const img = new Image();
        img.onload = () => {
            const info = getPrintDPI(img.naturalWidth, img.naturalHeight);
            setDpiInfo(info);
        };
        img.src = dataUrl;

        const newState = { image: dataUrl, settings: settings, hasUsedAi: false };
        addToHistory(newState);
        setAppState(newState);
        setError(null);
    } catch (e) {
        setError('Could not read file.');
    }
  };

  const handleAiRemoveBackground = async () => {
    if (!originalImage) return;
    setIsAiProcessing(true);
    setError(null);
    try {
        const [meta, base64] = originalImage.split(',');
        const mimeType = meta.match(/:(.*?);/)?.[1] || 'image/png';
        const resultBase64 = await editImageWithGemini(
            base64,
            "Remove the background. Isolate the main subject on a transparent background.",
            mimeType
        );
        if (resultBase64) {
            const newImage = `data:image/png;base64,${resultBase64}`;
            const newSettings = { ...settings, shirtColor: ShirtColor.NONE };
            const newState = { image: newImage, settings: newSettings, hasUsedAi: true };
            addToHistory(newState);
            setAppState(newState);
        } else {
            setError("AI could not process the image. Please try again.");
        }
    } catch (e) {
        console.error(e);
        setError("AI Service error. Ensure API Key is valid.");
    } finally {
        setIsAiProcessing(false);
    }
  };

  const handleRestoreCheckpoint = (checkpoint: Checkpoint) => {
    const newState: AppState = {
      image: appState.image,
      settings: { ...checkpoint.settings },
      hasUsedAi: appState.hasUsedAi
    };
    addToHistory(newState);
    setAppState(newState);
  };

  const handleReset = () => {
      const newState = { image: null, settings: DEFAULT_SETTINGS, hasUsedAi: false };
      addToHistory(newState);
      setAppState(newState);
      setProcessedResult(null);
      setDpiInfo(null);
  };

  // Feature 3: Underbase
  const handleGenerateUnderbase = async (format: 'PNG' | 'SVG' | 'JPG') => {
    if (!processedResult) return;
    try {
      const result = await generateUnderbase(processedResult.url, format);
      const a = document.createElement('a');
      a.href = result.url;
      a.download = `underbase_${settings.itemType.toLowerCase()}.${format.toLowerCase()}`;
      a.click();
      URL.revokeObjectURL(result.url);
      
      addToExportHistory({
          filename: `underbase_${settings.itemType.toLowerCase()}.${format.toLowerCase()}`,
          format: format,
          timestamp: Date.now(),
          url: result.url,
          blob: result.blob
      });
    } catch (err) {
      console.error('Underbase generation failed:', err);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500 selection:text-white pt-14">
      <Header />
      <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!originalImage ? (
          <div className="max-w-2xl mx-auto mt-12">
            <div className="flex flex-col items-center justify-center gap-4 mb-10">
              <img 
                src="public/logo/logo.png" 
                alt="InkMaster Logo" 
                className="w-24 h-24 object-contain drop-shadow-2xl"
              />
              <div className="flex items-center gap-3">
                <h2 className="text-4xl font-extrabold text-center text-slate-100">
                    InkMaster <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400">Studio</span>
                </h2>
                <span className="px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-xs font-bold text-indigo-400 tracking-widest">
                    BETA
                </span>
              </div>
            </div>
            <Dropzone onFileAccepted={handleFileAccepted} />
            
            <div className="mt-8 flex justify-center">
                 <button
                    onClick={() => setShowBatch(true)}
                    className="flex items-center gap-2 text-slate-400 hover:text-white border border-slate-700 hover:border-indigo-500 rounded-lg px-6 py-3 transition-all"
                 >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                    Or open Batch Processor
                 </button>
            </div>

            <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-center text-slate-400">
              <div className="p-6 bg-slate-900/50 rounded-xl border border-slate-800 hover:border-indigo-500/30 transition-colors">
                <div className="text-3xl mb-3">🎨</div>
                <h3 className="font-bold text-slate-200 mb-2">Any Format</h3>
                <p className="text-sm leading-relaxed">JPG, PNG, SVG. Auto-scaled to 4200×5100px Print Master.</p>
              </div>
              <div className="p-6 bg-slate-900/50 rounded-xl border border-slate-800 hover:border-indigo-500/30 transition-colors">
                <div className="text-3xl mb-3">🥊</div>
                <h3 className="font-bold text-slate-200 mb-2">Knockout Black</h3>
                <p className="text-sm leading-relaxed">Professional luminance-based removal that keeps the grunge.</p>
              </div>
              <div className="p-6 bg-slate-900/50 rounded-xl border border-slate-800 hover:border-indigo-500/30 transition-colors">
                <div className="text-3xl mb-3">👕</div>
                <h3 className="font-bold text-slate-200 mb-2">DTG Ready</h3>
                <p className="text-sm leading-relaxed">Soft edges and texture preservation optimized for garment printing.</p>
              </div>
              <div className="p-6 bg-slate-900/50 rounded-xl border border-slate-800 hover:border-indigo-500/30 transition-colors">
                <div className="text-3xl mb-3">📐</div>
                <h3 className="font-bold text-slate-200 mb-2">Logo & Assets</h3>
                <p className="text-sm leading-relaxed">Autoscaling and image upscaling.</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col lg:flex-row gap-8">
              <div className="w-full lg:w-1/3 xl:w-1/4 flex flex-col gap-4">
                
                <div className="flex gap-2">
                    <button
                    onClick={handleReset}
                    className="flex-1 py-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700 transition-all text-sm font-semibold flex items-center justify-center gap-2"
                    >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    New File
                    </button>
                    <button
                        onClick={() => setShowBatch(true)}
                        className="flex-1 py-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700 transition-all text-sm font-semibold flex items-center justify-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                        Batch
                    </button>
                </div>

                <Controls
                  settings={settings}
                  onSettingsChange={handleSettingsChange}
                  onAiRemoveBackground={handleAiRemoveBackground}
                  isProcessing={isProcessing}
                  isAiProcessing={isAiProcessing}
                  palette={palette}
                  hasUsedAi={appState.hasUsedAi}
                  onGenerateUnderbase={handleGenerateUnderbase}
                  hasProcessedResult={!!processedResult}
                  exportHistory={exportHistory}
                  isEyedropperMode={isEyedropperMode}
                  onToggleEyedropper={() => setIsEyedropperMode(!isEyedropperMode)}
                />
              </div>
              <div className="w-full lg:w-2/3 xl:w-3/4">
                {error && (
                  <div className="bg-red-900/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-xl mb-6 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {error}
                  </div>
                )}
                <div className="bg-slate-900 rounded-t-xl p-3 flex justify-between items-center px-6 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                        Print Master Preview
                    </h3>
                    {/* Feature 1: DPI Badge */}
                    {dpiInfo && (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        dpiInfo.status === 'good'
                            ? 'bg-emerald-900/40 text-emerald-400 border-emerald-500/30'
                            : dpiInfo.status === 'low'
                            ? 'bg-amber-900/40 text-amber-400 border-amber-500/30'
                            : 'bg-red-900/40 text-red-400 border-red-500/30'
                        }`}>
                        {dpiInfo.dpi} DPI · {dpiInfo.label}
                        </span>
                    )}
                  </div>
                  <div className="flex gap-3 text-xs text-slate-500 font-mono">
                    <span className="bg-slate-800 px-2 py-1 rounded">{settings.format}</span>
                    <span className="bg-slate-800 px-2 py-1 rounded">{TARGET_WIDTH}×{TARGET_HEIGHT}</span>
                  </div>
                </div>
                <Preview
                  originalImage={originalImage}
                  processedResult={processedResult}
                  settings={settings}
                  isProcessing={isProcessing}
                  onExported={(blob, name) => addToExportHistory({
                      filename: name,
                      format: settings.format,
                      timestamp: Date.now(),
                      url: URL.createObjectURL(blob),
                      blob: blob
                  })}
                  isEyedropperMode={isEyedropperMode}
                  onEyedropperPick={(color) => {
                      // Add as a new color replacement automatically
                      setIsEyedropperMode(false);
                      const newRep = { sourceColor: color, targetColor: '#FFFFFF', tolerance: 10 };
                      const currentReps = settings.colorReplacements || [];
                      handleSettingsChange({ ...settings, colorReplacements: [...currentReps, newRep] }, true);
                  }}
                  dpiInfo={dpiInfo}
                />

                {/* Undo / Redo Controls restored */}
                <div className="flex justify-center gap-12 mt-8">
                  <button
                      onClick={handleUndo}
                      disabled={!canUndo}
                      className="flex flex-col items-center gap-3 group disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      title="Undo (Ctrl+Z)"
                  >
                      <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center group-hover:bg-slate-800 group-hover:border-indigo-500 transition-all shadow-xl group-active:scale-95">
                        <svg className="w-8 h-8 text-slate-400 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                      </div>
                      <span className="text-xs font-bold text-slate-500 group-hover:text-indigo-400 uppercase tracking-widest transition-colors">Undo</span>
                  </button>

                  <button
                      onClick={handleRedo}
                      disabled={!canRedo}
                      className="flex flex-col items-center gap-3 group disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      title="Redo (Ctrl+Y)"
                  >
                      <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center group-hover:bg-slate-800 group-hover:border-indigo-500 transition-all shadow-xl group-active:scale-95">
                        <svg className="w-8 h-8 text-slate-400 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>
                      </div>
                      <span className="text-xs font-bold text-slate-500 group-hover:text-indigo-400 uppercase tracking-widest transition-colors">Redo</span>
                  </button>
                </div>
               
              </div>
            </div>
            <CheckpointBar
              currentSettings={settings}
              currentThumbnail={processedResult?.previewUrl || processedResult?.url || null}
              onRestore={handleRestoreCheckpoint}
            />
          </div>
        )}

        {/* Batch Processor Modal */}
        {showBatch && (
            <BatchProcessor 
                onClose={() => setShowBatch(false)} 
                defaultSettings={settings} 
            />
        )}
      </main>
      <footer className="border-t border-slate-900 bg-slate-950 py-8 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-slate-600 text-sm">
          <p>InkMaster AI © 2024. Optimized for Direct-to-Garment (DTG) printing.</p>
        </div>
      </footer>
    </div>
  );
};

export default App;