import React, { lazy, Suspense, useEffect, useState } from 'react';
import { AnimatedBackground } from './components/AnimatedBackground';
import { Dropzone } from './components/Dropzone';
import { Header } from './components/Header';
import { Preview } from './components/Preview';
import { StudioTopBar } from './components/StudioTopBar';
import { VersionsPopover } from './components/VersionsPopover';
import { WorkflowInspector } from './components/WorkflowInspector';
import { Checkpoint } from './components/CheckpointBar';
import {
  ArtworkAnalysis,
  ExportHistoryEntry,
  ProcessingSettings,
  ProcessedResult,
  RecipeId,
  RecipeRecommendation,
  ShirtColor,
  WorkspaceStage,
} from './types';
import { DEFAULT_SETTINGS } from './constants';
import {
  fileToBase64,
  generatePalette,
  generatePrintPDF,
  generateUnderbase,
  processImage,
} from './services/imageProcessing';
import { analyzeArtwork } from './services/artworkAnalysis';
import { recommendRecipe, resolveRecipeSettings } from './services/recipes';

const BatchProcessor = lazy(() => import('./components/BatchProcessor').then((module) => ({ default: module.BatchProcessor })));

interface AppState {
  image: string | null;
  settings: ProcessingSettings;
  hasUsedAi: boolean;
}

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
};

const App: React.FC = () => {
  const [history, setHistory] = useState<AppState[]>([{ image: null, settings: DEFAULT_SETTINGS, hasUsedAi: false }]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [appState, setAppState] = useState<AppState>(history[0]);
  const [processedResult, setProcessedResult] = useState<ProcessedResult | null>(null);
  const [analysis, setAnalysis] = useState<ArtworkAnalysis | null>(null);
  const [recommendation, setRecommendation] = useState<RecipeRecommendation | null>(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState<RecipeId | null>(null);
  const [stage, setStage] = useState<WorkspaceStage>('goal');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [palette, setPalette] = useState<string[]>([]);
  const [showBatch, setShowBatch] = useState(false);
  const [exportHistory, setExportHistory] = useState<ExportHistoryEntry[]>([]);
  const [isEyedropperMode, setIsEyedropperMode] = useState(false);
  const [lowResolutionAcknowledged, setLowResolutionAcknowledged] = useState(false);
  const [mockupExportToken, setMockupExportToken] = useState(0);

  const originalImage = appState.image;
  const settings = appState.settings;
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;
  const dpiInfo = analysis?.printQuality ?? null;

  useEffect(() => {
    const state = history[historyIndex];
    if (state) setAppState(state);
  }, [history, historyIndex]);

  useEffect(() => {
    if (!originalImage) {
      setPalette([]);
      return;
    }
    void generatePalette(originalImage).then(setPalette).catch(() => setPalette([]));
  }, [originalImage]);

  useEffect(() => {
    if (!originalImage) return;
    const timer = window.setTimeout(async () => {
      setIsProcessing(true);
      setError(null);
      try {
        setProcessedResult(await processImage(originalImage, settings));
      } catch (processingError) {
        console.error(processingError);
        setError('Ink Master could not process this artwork. Try a different treatment or file.');
      } finally {
        setIsProcessing(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [originalImage, settings]);

  const addToHistory = (state: AppState) => {
    setHistory((current) => {
      const next = [...current.slice(0, historyIndex + 1), state];
      setHistoryIndex(next.length - 1);
      return next;
    });
    setAppState(state);
  };

  const addToExportHistory = (entry: Omit<ExportHistoryEntry, 'id'>) => {
    setExportHistory((current) => [{ ...entry, id: `export_${Date.now()}` }, ...current].slice(0, 20));
  };

  const handleSettingsChange = (nextSettings: ProcessingSettings, commit: boolean) => {
    const next = { ...appState, settings: nextSettings };
    setAppState(next);
    if (commit) addToHistory(next);
  };

  const handleFileAccepted = async (file: File) => {
    setError(null);
    setIsAnalyzing(true);
    setLowResolutionAcknowledged(false);
    try {
      const base64 = await fileToBase64(file);
      const dataUrl = `data:${file.type};base64,${base64}`;
      const next = { image: dataUrl, settings: DEFAULT_SETTINGS, hasUsedAi: false };
      addToHistory(next);
      setProcessedResult(null);
      setSelectedRecipeId(null);
      setStage('goal');
      try {
        const nextAnalysis = await analyzeArtwork(dataUrl);
        setAnalysis(nextAnalysis);
        setRecommendation(recommendRecipe(nextAnalysis));
      } catch (analysisError) {
        console.warn('Artwork analysis failed:', analysisError);
        setAnalysis(null);
        setRecommendation({
          recipeId: 'custom',
          confidence: 0.5,
          reasons: ['Ink Master could not confidently classify this artwork.', 'Custom starts neutral and keeps the source intact.'],
          alternatives: ['mockups-only'],
          proposedChanges: ['Start with neutral settings', 'Choose each treatment manually'],
        });
      }
    } catch {
      setError('Could not read this file. Try a JPG, PNG, or SVG under 100MB.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApplyRecipe = (recipeId: RecipeId, savedSettings?: ProcessingSettings) => {
    const nextSettings = savedSettings ?? resolveRecipeSettings(recipeId, analysis, settings);
    setSelectedRecipeId(recipeId);
    handleSettingsChange(nextSettings, true);
    setStage('prepare');
  };

  const handleReset = () => {
    const next = { image: null, settings: DEFAULT_SETTINGS, hasUsedAi: false };
    addToHistory(next);
    setProcessedResult(null);
    setAnalysis(null);
    setRecommendation(null);
    setSelectedRecipeId(null);
    setStage('goal');
    setLowResolutionAcknowledged(false);
  };

  const handleRestoreVersion = (checkpoint: Checkpoint) => {
    addToHistory({
      image: originalImage,
      settings: { ...checkpoint.settings },
      hasUsedAi: appState.hasUsedAi,
    });
  };

  const handleGenerateUnderbase = async (format: 'PNG' | 'SVG' | 'JPG') => {
    if (!processedResult) return;
    try {
      const result = await generateUnderbase(processedResult.url, format);
      const filename = `underbase_${settings.itemType.toLowerCase()}.${format.toLowerCase()}`;
      downloadBlob(result.blob, filename);
      addToExportHistory({ filename, format, timestamp: Date.now(), url: URL.createObjectURL(result.blob), blob: result.blob });
    } catch {
      setError('The white underbase could not be generated.');
    }
  };

  const handleDownloadPrintFile = () => {
    if (!processedResult) return;
    const filename = `inkmaster_${selectedRecipeId ?? 'custom'}_${settings.itemType.toLowerCase()}.${settings.format.toLowerCase()}`;
    downloadBlob(processedResult.blob, filename);
    addToExportHistory({ filename, format: settings.format, timestamp: Date.now(), url: URL.createObjectURL(processedResult.blob), blob: processedResult.blob });
  };

  const handleDownloadPdf = async () => {
    if (!processedResult) return;
    try {
      const result = await generatePrintPDF(processedResult.url, settings.itemType);
      const filename = `inkmaster_production_${settings.itemType.toLowerCase()}.pdf`;
      downloadBlob(result.blob, filename);
      addToExportHistory({ filename, format: 'PDF', timestamp: Date.now(), url: URL.createObjectURL(result.blob), blob: result.blob });
    } catch {
      setError('The production PDF could not be generated.');
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey && canRedo) setHistoryIndex((index) => index + 1);
        else if (canUndo) setHistoryIndex((index) => index - 1);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y' && canRedo) {
        event.preventDefault();
        setHistoryIndex((index) => index + 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canRedo, canUndo]);

  if (!originalImage) {
    return (
      <div className="relative flex min-h-screen flex-col bg-slate-950 pt-14 text-slate-200">
        <AnimatedBackground />
        <Header />
        <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-4 py-10">
          <div className="mb-7 flex flex-col items-center">
            <img src="/logo/logo.png" alt="InkMaster Studio" className="h-24 w-24 object-contain drop-shadow-2xl" />
            <h1 className="mt-3 text-center text-4xl font-black text-slate-100">InkMaster <span className="text-indigo-400">Studio</span></h1>
            <p className="mt-3 max-w-xl text-center text-sm leading-relaxed text-slate-400">Turn artwork into a print-ready file and convincing apparel mockups without learning a wall of technical controls.</p>
          </div>
          <div className="w-full max-w-2xl">
            <Dropzone onFileAccepted={handleFileAccepted} />
            {error && <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-center text-xs text-rose-300">{error}</p>}
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3 text-xs text-slate-500">
            <span>Local artwork analysis</span><span className="text-slate-700">•</span><span>Guided print recipes</span><span className="text-slate-700">•</span><span>Production files + mockups</span>
          </div>
          <button type="button" onClick={() => setShowBatch(true)} className="mt-7 rounded-lg border border-slate-700 bg-slate-900/60 px-5 py-2.5 text-xs font-bold text-slate-300 hover:border-indigo-500 hover:text-white">Open batch processing</button>
        </main>
        {showBatch && (
          <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/70" />}>
            <BatchProcessor onClose={() => setShowBatch(false)} defaultSettings={settings} />
          </Suspense>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-950 text-slate-200">
      <StudioTopBar
        canUndo={canUndo}
        canRedo={canRedo}
        onNewFile={handleReset}
        onBatch={() => setShowBatch(true)}
        onUndo={() => canUndo && setHistoryIndex((index) => index - 1)}
        onRedo={() => canRedo && setHistoryIndex((index) => index + 1)}
        versions={<VersionsPopover currentSettings={settings} currentThumbnail={processedResult?.previewUrl || processedResult?.url || null} onRestore={handleRestoreVersion} />}
      />

      <main className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(315px,44dvh)] lg:grid-cols-[370px_minmax(0,1fr)] lg:grid-rows-1">
        <div className="order-2 min-h-0 lg:order-1">
          <WorkflowInspector
            stage={stage}
            selectedRecipeId={selectedRecipeId}
            analysis={analysis}
            recommendation={recommendation}
            settings={settings}
            palette={palette}
            exportHistory={exportHistory}
            hasProcessedResult={Boolean(processedResult)}
            lowResolutionAcknowledged={lowResolutionAcknowledged}
            isEyedropperMode={isEyedropperMode}
            onStageChange={setStage}
            onApplyRecipe={handleApplyRecipe}
            onSettingsChange={handleSettingsChange}
            onToggleEyedropper={() => setIsEyedropperMode((value) => !value)}
            onGenerateUnderbase={handleGenerateUnderbase}
            onDownloadPrintFile={handleDownloadPrintFile}
            onDownloadPdf={handleDownloadPdf}
            onDownloadMockups={() => setMockupExportToken((token) => token + 1)}
            onAcknowledgeLowResolution={setLowResolutionAcknowledged}
          />
        </div>

        <section className="relative order-1 min-h-0 overflow-hidden bg-slate-900/40 p-2 lg:order-2 lg:p-4">
          <div className="relative h-full min-h-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-2xl shadow-black/30">
            {(isAnalyzing || (isProcessing && !processedResult)) && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
                <div className="text-center">
                  <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
                  <p className="mt-3 text-xs font-bold text-slate-300">{isAnalyzing ? 'Reading the artwork…' : 'Building the print preview…'}</p>
                </div>
              </div>
            )}
            {error && (
              <div className="absolute left-3 right-3 top-3 z-40 rounded-lg border border-rose-500/30 bg-rose-950/90 px-4 py-3 text-xs text-rose-200 shadow-xl">{error}</div>
            )}
            {processedResult ? (
              <Preview
                originalImage={originalImage}
                processedResult={processedResult}
                settings={settings}
                isProcessing={isProcessing}
                onExported={(blob, filename) => addToExportHistory({ filename, format: settings.format, timestamp: Date.now(), url: URL.createObjectURL(blob), blob })}
                isEyedropperMode={isEyedropperMode}
                onEyedropperPick={(color) => {
                  setIsEyedropperMode(false);
                  handleSettingsChange({ ...settings, colorReplacements: [...settings.colorReplacements, { sourceColor: color, targetColor: '#FFFFFF', tolerance: 10 }] }, true);
                }}
                dpiInfo={dpiInfo}
                embedded
                workspaceStage={stage}
                exportRequestToken={mockupExportToken}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-center text-slate-600">
                <div><div className="text-4xl">◫</div><p className="mt-2 text-xs">Preview will appear here</p></div>
              </div>
            )}
          </div>
        </section>
      </main>

      {showBatch && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/70" />}>
          <BatchProcessor onClose={() => setShowBatch(false)} defaultSettings={settings} />
        </Suspense>
      )}
    </div>
  );
};

export default App;
