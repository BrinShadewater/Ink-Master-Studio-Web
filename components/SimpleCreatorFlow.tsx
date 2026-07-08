import React, { useEffect, useState } from 'react';
import { ArtworkAnalysis, ProcessedResult } from '../types';
import { MAX_FILE_SIZE_MB, MAX_SVG_SIZE_MB } from '../constants';
import { PrintifyProductPreset, printify } from '../specs/printify';
import { ProcessingProgress } from '../services/imageProcessingWorkerClient';

interface SimpleCreatorFlowProps {
  originalImage: string;
  sourceName: string;
  analysis: ArtworkAnalysis | null;
  processedResult: ProcessedResult | null;
  isProcessing: boolean;
  processingProgress: ProcessingProgress | null;
  selectedProduct: PrintifyProductPreset;
  products: PrintifyProductPreset[];
  onProductChange: (product: PrintifyProductPreset) => void;
  onDownload: () => void;
  onCancelProcessing: () => void;
  onAdvancedMode: () => void;
}

const formatBytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(bytes > 10 * 1024 * 1024 ? 0 : 1)} MB`;

export const SimpleCreatorFlow: React.FC<SimpleCreatorFlowProps> = ({
  originalImage,
  sourceName,
  analysis,
  processedResult,
  isProcessing,
  processingProgress,
  selectedProduct,
  products,
  onProductChange,
  onDownload,
  onCancelProcessing,
  onAdvancedMode,
}) => {
  const [backgroundChoice, setBackgroundChoice] = useState<'keep' | null>(null);
  const targetWidth = selectedProduct.px[0];
  const targetHeight = selectedProduct.px[1];
  const sourceWidth = analysis?.width ?? 0;
  const sourceHeight = analysis?.height ?? 0;
  const upscaleRatio = sourceWidth && sourceHeight
    ? Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight)
    : 1;
  const needsUpscale = upscaleRatio > 1.05;
  const fileBytes = processedResult?.blob.size ?? 0;
  const underCap = !processedResult || fileBytes <= printify.maxBytes.png;
  const hasTransparency = analysis?.hasTransparency ?? true;

  useEffect(() => {
    setBackgroundChoice(null);
  }, [originalImage]);

  const checks = [
    {
      label: `Sized to ${targetWidth} x ${targetHeight}px`,
      detail: needsUpscale
        ? `Upscaled from ${sourceWidth} x ${sourceHeight}px. Good for this selected size.`
        : 'Source size fits this product target.',
      state: 'ready',
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
      detail: processedResult ? `${formatBytes(fileBytes)} generated. SVG limit is ${MAX_SVG_SIZE_MB} MB.` : 'File size will appear after processing.',
      state: underCap ? 'ready' : 'stop',
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
                src={processedResult?.previewUrl || processedResult?.url || originalImage}
                alt="Selected artwork preview"
                className="max-h-[68dvh] max-w-full object-contain"
              />
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
        </section>

        <aside className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Checks</p>
          <h2 className="mt-1 text-xl font-black text-white">Ready for {selectedProduct.label}</h2>
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
              <div key={check.label} className={`rounded-lg border p-3 ${check.state === 'stop' ? 'border-rose-500/40 bg-rose-950/30' : 'border-slate-800 bg-slate-950/50'}`}>
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-black ${check.state === 'stop' ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-slate-950'}`}>
                    {check.state === 'stop' ? '!' : '✓'}
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
            onClick={onDownload}
            disabled={!processedResult || isProcessing || !underCap}
            className="mt-5 w-full rounded-lg bg-emerald-500 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            Download print file
          </button>
          <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-500">
            PNG/JPEG cap: {MAX_FILE_SIZE_MB} MB. SVG cap: {MAX_SVG_SIZE_MB} MB. Download is not gated by mockups.
          </p>
        </aside>
      </div>
    </main>
  );
};
