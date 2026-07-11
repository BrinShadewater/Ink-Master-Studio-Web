import React, { useEffect, useRef, useState } from 'react';
import { ArtworkAnalysis, OutputFormat, ProcessedResult, ProcessingSettings, ResizeMode, ShirtColor } from '../types';
import { MAX_FILE_SIZE_MB, MAX_SVG_SIZE_MB } from '../constants';
import { PrintifyProductPreset, printify } from '../specs/printify';
import { ProcessingProgress } from '../services/imageProcessingWorkerClient';
import { assessUpscaleQuality } from '../services/upscaleQuality';
import { compositeMockup } from '../services/imageProcessing';
import { getSimpleMockupForItemType } from '../services/mockups';

interface SimpleCreatorFlowProps {
  originalImage: string;
  sourceName: string;
  analysis: ArtworkAnalysis | null;
  processedResult: ProcessedResult | null;
  simpleExportResult: ProcessedResult | null;
  simpleExportError: string | null;
  isProcessing: boolean;
  processingProgress: ProcessingProgress | null;
  selectedProduct: PrintifyProductPreset;
  products: PrintifyProductPreset[];
  onProductChange: (product: PrintifyProductPreset) => void;
  settings: ProcessingSettings;
  onSettingsChange: (settings: ProcessingSettings, commit: boolean) => void;
  onDownload: () => void | Promise<void>;
  onCancelProcessing: () => void;
  onAdvancedMode: () => void;
}

const formatBytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(bytes > 10 * 1024 * 1024 ? 0 : 1)} MB`;

export const SimpleCreatorFlow: React.FC<SimpleCreatorFlowProps> = ({
  originalImage,
  sourceName,
  analysis,
  processedResult,
  simpleExportResult,
  simpleExportError,
  isProcessing,
  processingProgress,
  selectedProduct,
  products,
  onProductChange,
  settings,
  onSettingsChange,
  onDownload,
  onCancelProcessing,
  onAdvancedMode,
}) => {
  const [backgroundChoice, setBackgroundChoice] = useState<'keep' | null>(null);
  const [mockupUrl, setMockupUrl] = useState<string | null>(null);
  const [isMockupLoading, setIsMockupLoading] = useState(false);
  const [mockupError, setMockupError] = useState<string | null>(null);
  const mockupRunRef = useRef(0);
  const targetWidth = selectedProduct.px[0];
  const targetHeight = selectedProduct.px[1];
  const sourceWidth = analysis?.width ?? 0;
  const sourceHeight = analysis?.height ?? 0;
  const upscaleQuality = assessUpscaleQuality(sourceWidth, sourceHeight, targetWidth, targetHeight);
  const finalFileBytes = simpleExportResult?.blob.size ?? 0;
  const hasTransparency = analysis?.hasTransparency ?? true;
  const previewMockup = ['tee-front-full', 'hoodie-front', 'mug-wrap'].includes(selectedProduct.id)
    ? getSimpleMockupForItemType(selectedProduct.itemType)
    : undefined;
  const updateSetting = <K extends keyof ProcessingSettings>(
    key: K,
    value: ProcessingSettings[K],
    commit = true,
  ) => onSettingsChange({ ...settings, [key]: value }, commit);
  const resetPlacement = () => onSettingsChange({
    ...settings,
    resizeMode: ResizeMode.FIT,
    designScalePercent: 100,
    designOffsetXPercent: 0,
    designOffsetYPercent: 0,
    designRotationDegrees: 0,
  }, true);
  const setBackground = (mode: 'transparent' | 'white' | 'black') => {
    if (mode === 'transparent') {
      onSettingsChange({
        ...settings,
        format: OutputFormat.PNG,
        preserveTransparency: true,
        shirtColor: ShirtColor.NONE,
        canvasBackground: 'transparent',
      }, true);
      return;
    }

    onSettingsChange({
      ...settings,
      format: OutputFormat.PNG,
      preserveTransparency: false,
      shirtColor: ShirtColor.NONE,
      canvasBackground: mode,
    }, true);
  };

  useEffect(() => {
    setBackgroundChoice(null);
  }, [originalImage]);

  useEffect(() => {
    mockupRunRef.current += 1;
    setMockupUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setIsMockupLoading(false);
    setMockupError(null);
  }, [originalImage, processedResult, selectedProduct.id]);

  useEffect(() => () => {
    mockupRunRef.current += 1;
    if (mockupUrl) URL.revokeObjectURL(mockupUrl);
  }, [mockupUrl]);

  const handleMockupPreview = async () => {
    if (!processedResult || !previewMockup || isMockupLoading) return;
    const runId = mockupRunRef.current + 1;
    mockupRunRef.current = runId;
    setIsMockupLoading(true);
    setMockupError(null);

    try {
      const placement = selectedProduct.id === 'mug-wrap'
        ? { x: 15, y: 25, width: 70, height: 50 }
        : { x: 32, y: 22, width: 36, height: 38 };
      const result = await compositeMockup(
        previewMockup.file,
        processedResult.previewUrl || processedResult.url,
        placement,
        'PNG',
      );
      if (runId !== mockupRunRef.current) {
        URL.revokeObjectURL(result.url);
        return;
      }
      setMockupUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return result.url;
      });
    } catch (error) {
      if (runId !== mockupRunRef.current) return;
      setMockupError(error instanceof Error ? error.message : 'Mockup preview could not be created.');
    } finally {
      if (runId === mockupRunRef.current) setIsMockupLoading(false);
    }
  };

  const sizingDetail = simpleExportResult?.upscale.method === 'local-progressive'
    ? `Enhanced locally ${simpleExportResult.upscale.ratio}x from ${simpleExportResult.upscale.sourceSize[0]} x ${simpleExportResult.upscale.sourceSize[1]}px. Fine detail was smoothed, not recreated.`
    : upscaleQuality.detail;

  const checks = [
    {
      label: `Sized to ${targetWidth} x ${targetHeight}px`,
      detail: sizingDetail,
      state: upscaleQuality.level === 'caution' || upscaleQuality.level === 'extreme'
          ? 'caution'
          : 'ready',
    },
    {
      label: `${selectedProduct.dpi} DPI PNG`,
      detail: selectedProduct.dpi >= 300
        ? 'Standard Printify raster resolution.'
        : 'Large-format preset uses a lower DPI target.',
      state: 'ready',
    },
    {
      label: 'sRGB color',
      detail: 'PNG export stays RGB for Printify upload.',
      state: 'ready',
    },
    {
      label: hasTransparency ? 'Transparent background kept' : 'Background kept as uploaded',
      detail: hasTransparency
        ? 'Alpha is preserved in the print file.'
        : backgroundChoice === 'keep'
          ? 'You chose to keep the uploaded background.'
          : 'Choose whether to keep it or open Advanced cleanup.',
      state: 'ready',
    },
    {
      label: `Under ${MAX_FILE_SIZE_MB} MB PNG limit`,
      detail: simpleExportError
        ?? (simpleExportResult
          ? `${formatBytes(finalFileBytes)} generated. SVG limit is ${MAX_SVG_SIZE_MB} MB.`
          : 'Final file size is checked during download.'),
      state: simpleExportError ? 'stop' : 'ready',
    },
  ];

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-slate-950 px-4 py-5 text-slate-200 lg:px-6">
      <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[minmax(0,1.1fr)_420px]">
        <section className="min-h-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70">
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">Printify file</p>
              <h1 className="truncate text-lg font-black text-white">{sourceName}</h1>
            </div>
            <button type="button" onClick={onAdvancedMode} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:border-slate-500 hover:text-white">
              Advanced
            </button>
          </div>
          <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_260px]">
            <div className="relative flex min-h-[420px] items-center justify-center overflow-hidden rounded-lg bg-slate-950/80 p-4">
              <img
                src={mockupUrl || processedResult?.previewUrl || processedResult?.url || originalImage}
                alt={mockupUrl ? `${selectedProduct.label} mockup preview` : 'Selected artwork preview'}
                className="max-h-[68dvh] max-w-full object-contain"
              />
              {mockupUrl && (
                <button
                  type="button"
                  onClick={() => setMockupUrl((current) => {
                    if (current) URL.revokeObjectURL(current);
                    return null;
                  })}
                  className="absolute right-3 top-3 rounded-lg border border-slate-700 bg-slate-950/90 px-3 py-2 text-xs font-bold text-slate-200 hover:border-slate-500 hover:text-white"
                >
                  Show artwork
                </button>
              )}
              {isProcessing && (
                <div className="absolute inset-4 flex items-center justify-center rounded-lg bg-slate-950/75 backdrop-blur-sm">
                  <div className="w-full max-w-xs text-center">
                    <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
                    <p className="mt-3 text-xs font-bold text-slate-300">{processingProgress?.stage ?? 'Building print file'}</p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                      <div className="h-full rounded-full bg-indigo-500 transition-[width] duration-200" style={{ width: `${processingProgress?.percent ?? 0}%` }} />
                    </div>
                    <p className="mt-2 text-[11px] font-bold text-slate-500">{processingProgress?.percent ?? 0}%</p>
                    <button type="button" onClick={onCancelProcessing} className="mt-4 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:border-slate-500 hover:text-white">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-3">
              <h2 className="text-sm font-black text-white">Pick product</h2>
              <div className="grid grid-cols-2 gap-2">
                {products.map((product) => {
                  const active = product.id === selectedProduct.id;
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => onProductChange(product)}
                      className={`min-h-28 rounded-lg border p-3 text-left transition ${active ? 'border-indigo-400 bg-indigo-500/15' : 'border-slate-800 bg-slate-950/60 hover:border-slate-600'}`}
                    >
                      <span className={`flex h-8 w-8 items-center justify-center rounded-md text-sm font-black ${active ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-300'}`}>{product.icon}</span>
                      <span className="mt-3 block text-xs font-black text-white">{product.shortLabel}</span>
                      <span className="mt-1 block text-[11px] leading-snug text-slate-500">{product.px[0]} x {product.px[1]}px</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="border-t border-slate-800 px-4 py-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-black text-white">Position and size</h2>
                  <button type="button" onClick={resetPlacement} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:border-slate-500 hover:text-white">
                    Reset
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => updateSetting('resizeMode', ResizeMode.FIT)}
                    className={`rounded-lg border px-3 py-2 text-xs font-black ${settings.resizeMode === ResizeMode.FIT ? 'border-indigo-400 bg-indigo-500/15 text-white' : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-600 hover:text-white'}`}
                  >
                    Fit
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSetting('resizeMode', ResizeMode.COVER)}
                    className={`rounded-lg border px-3 py-2 text-xs font-black ${settings.resizeMode === ResizeMode.COVER ? 'border-indigo-400 bg-indigo-500/15 text-white' : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-600 hover:text-white'}`}
                  >
                    Fill
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                    <span className="flex items-center justify-between gap-2 text-[11px] font-black text-slate-300">
                      Scale
                      <span className="font-mono text-slate-500">{settings.designScalePercent ?? 100}%</span>
                    </span>
                    <input
                      aria-label="Scale"
                      type="number"
                      min={10}
                      max={300}
                      step={1}
                      value={settings.designScalePercent ?? 100}
                      onChange={(event) => updateSetting('designScalePercent', Number(event.target.value), false)}
                      onBlur={(event) => updateSetting('designScalePercent', Number(event.currentTarget.value))}
                      className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm font-bold text-white outline-none focus:border-indigo-400"
                    />
                  </label>
                  <label className="block rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                    <span className="flex items-center justify-between gap-2 text-[11px] font-black text-slate-300">
                      Rotate
                      <span className="font-mono text-slate-500">{settings.designRotationDegrees ?? 0}°</span>
                    </span>
                    <input
                      aria-label="Rotate"
                      type="number"
                      min={-180}
                      max={180}
                      step={1}
                      value={settings.designRotationDegrees ?? 0}
                      onChange={(event) => updateSetting('designRotationDegrees', Number(event.target.value), false)}
                      onBlur={(event) => updateSetting('designRotationDegrees', Number(event.currentTarget.value))}
                      className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm font-bold text-white outline-none focus:border-indigo-400"
                    />
                  </label>
                  <label className="block rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                    <span className="flex items-center justify-between gap-2 text-[11px] font-black text-slate-300">
                      Horizontal position
                      <span className="font-mono text-slate-500">{settings.designOffsetXPercent ?? 0}%</span>
                    </span>
                    <input
                      aria-label="Horizontal position"
                      type="number"
                      min={-50}
                      max={50}
                      step={1}
                      value={settings.designOffsetXPercent ?? 0}
                      onChange={(event) => updateSetting('designOffsetXPercent', Number(event.target.value), false)}
                      onBlur={(event) => updateSetting('designOffsetXPercent', Number(event.currentTarget.value))}
                      className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm font-bold text-white outline-none focus:border-indigo-400"
                    />
                  </label>
                  <label className="block rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                    <span className="flex items-center justify-between gap-2 text-[11px] font-black text-slate-300">
                      Vertical position
                      <span className="font-mono text-slate-500">{settings.designOffsetYPercent ?? 0}%</span>
                    </span>
                    <input
                      aria-label="Vertical position"
                      type="number"
                      min={-50}
                      max={50}
                      step={1}
                      value={settings.designOffsetYPercent ?? 0}
                      onChange={(event) => updateSetting('designOffsetYPercent', Number(event.target.value), false)}
                      onBlur={(event) => updateSetting('designOffsetYPercent', Number(event.currentTarget.value))}
                      className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm font-bold text-white outline-none focus:border-indigo-400"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ['Top', 0],
                    ['Center', null],
                    ['Bottom', 25],
                  ].map(([label, value]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        if (value === null) {
                          onSettingsChange({ ...settings, designOffsetXPercent: 0, designOffsetYPercent: 0 }, true);
                        } else {
                          updateSetting('designOffsetYPercent', Number(value));
                        }
                      }}
                      className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs font-bold text-slate-300 hover:border-slate-600 hover:text-white"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <h2 className="text-sm font-black text-white">Background</h2>
                <div className="mt-3 grid gap-2">
                  {[
                    { id: 'transparent' as const, label: 'Transparent', active: settings.preserveTransparency },
                    { id: 'white' as const, label: 'White', active: !settings.preserveTransparency && settings.canvasBackground === 'white' },
                    { id: 'black' as const, label: 'Black', active: !settings.preserveTransparency && settings.canvasBackground === 'black' },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setBackground(option.id)}
                      className={`rounded-lg border px-3 py-2 text-left text-xs font-black ${option.active ? 'border-indigo-400 bg-indigo-500/15 text-white' : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-600 hover:text-white'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Checks</p>
          <h2 className="mt-1 text-xl font-black text-white">
            Ready for {selectedProduct.label}
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">{selectedProduct.note}. Product Creator requirements can vary by provider, so this preset targets the common safe upload shape.</p>

          {!hasTransparency && (
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-xs font-black text-amber-100">Background detected</p>
              <p className="mt-1 text-[11px] leading-relaxed text-amber-100/80">
                Keep it if the artwork should print as a rectangle, or open cleanup if the product needs transparent edges.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row lg:flex-col">
                <button
                  type="button"
                  onClick={() => setBackgroundChoice('keep')}
                  className={`rounded-lg px-3 py-2 text-xs font-black transition ${backgroundChoice === 'keep' ? 'bg-amber-300 text-slate-950' : 'border border-amber-500/40 text-amber-100 hover:border-amber-300'}`}
                >
                  Keep as uploaded
                </button>
                <button
                  type="button"
                  onClick={onAdvancedMode}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200 hover:border-slate-500 hover:text-white"
                >
                  Open cleanup
                </button>
              </div>
            </div>
          )}

          <div className="mt-4 space-y-2">
            {checks.map((check) => (
              <div key={check.label} className={`rounded-lg border p-3 ${check.state === 'stop' ? 'border-rose-500/40 bg-rose-950/30' : check.state === 'caution' ? 'border-amber-500/30 bg-amber-950/20' : 'border-slate-800 bg-slate-950/50'}`}>
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-black ${check.state === 'stop' ? 'bg-rose-500 text-white' : check.state === 'caution' ? 'bg-amber-400 text-slate-950' : 'bg-emerald-500 text-slate-950'}`}>
                    {check.state === 'stop' || check.state === 'caution' ? '!' : '✓'}
                  </span>
                  <div>
                    <p className="text-xs font-black text-white">{check.label}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{check.detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void onDownload()}
            disabled={!processedResult || isProcessing}
            className="mt-5 w-full rounded-lg bg-emerald-500 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            Download print file
          </button>
          {previewMockup && (
            <button
              type="button"
              onClick={() => void handleMockupPreview()}
              disabled={!processedResult || isProcessing || isMockupLoading}
              className="mt-2 w-full rounded-lg border border-slate-700 px-4 py-3 text-sm font-black text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
            >
              {isMockupLoading ? 'Building mockup preview...' : mockupUrl ? 'Refresh mockup preview' : 'Preview on product'}
            </button>
          )}
          {mockupError && (
            <p className="mt-2 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">
              Mockup preview failed. {mockupError} Try again; your print file is unaffected.
            </p>
          )}
          <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-500">
            PNG/JPEG cap: {MAX_FILE_SIZE_MB} MB. SVG cap: {MAX_SVG_SIZE_MB} MB. Download is not gated by mockups.
          </p>
        </aside>
      </div>
    </main>
  );
};
