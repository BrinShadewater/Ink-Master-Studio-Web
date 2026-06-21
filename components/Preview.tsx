import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ProcessedResult, ProcessingSettings, WorkspaceStage } from '../types';
import { compositeMockup, generatePrintPDF } from '../services/imageProcessing';

interface PercentPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PreviewProps {
  originalImage: string | null;
  processedResult: ProcessedResult | null;
  settings: ProcessingSettings;
  isProcessing: boolean;
  onExported: (blob: Blob, filename: string) => void;
  // New props
  isEyedropperMode: boolean;
  onEyedropperPick: (color: string) => void;
  dpiInfo: { dpi: number; status: string; label: string } | null;
  embedded?: boolean;
  workspaceStage?: WorkspaceStage;
  exportRequestToken?: number;
  productionPlacement?: PercentPlacement;
  onProductionPlacementChange?: (placement: PercentPlacement) => void;
}

const MOCKUPS = [
  { name: 'Red', file: '/mockups/mockup-red.png', color: '#C0392B' },
  { name: 'Charcoal', file: '/mockups/mockup-charcoal.png', color: '#3D3D3D' },
  { name: 'Heather', file: '/mockups/mockup-heather.png', color: '#8E9A9A' },
  { name: 'Military Green', file: '/mockups/mockup-miltarygreen.png', color: '#4A5240' },
  { name: 'Forest Green', file: '/mockups/mockup-forestgreen.png', color: '#2D5A27' },
  { name: 'Cardinal', file: '/mockups/mockup-cardinal.png', color: '#8B1A1A' },
  { name: 'Black', file: '/mockups/mockup-black.png', color: '#1A1A1A' },
  { name: 'Burgundy', file: '/mockups/mockup-burgundy.png', color: '#6B2737' },
  { name: 'Navy', file: '/mockups/mockup-navy.png', color: '#1B2A4A' },
  { name: 'Orange', file: '/mockups/mockup-orange.png', color: '#D4620A' },
  { name: 'Royal Blue', file: '/mockups/mockup-royalblue.png', color: '#2255A4' },
];

// Feature 4: Print Presets
const PRINT_PRESETS = [
    { label: 'Full Front', x: 20, y: 15, width: 60, height: 60 },
    { label: 'Left Chest', x: 28, y: 22, width: 22, height: 22 },
    { label: 'Center Chest', x: 30, y: 25, width: 40, height: 35 },
    { label: 'Full Back', x: 20, y: 15, width: 60, height: 60 },
    { label: 'Sleeve', x: 5, y: 30, width: 18, height: 25 },
];

const DEFAULT_PLACEMENT = { x: 32, y: 22, width: 36, height: 38 };
const SNAP_THRESHOLD = 1.0; // Percent

interface DragState {
  dragging: boolean;
  resizing: boolean;
  startX: number;
  startY: number;
  startPlacement: typeof DEFAULT_PLACEMENT;
}

export const Preview: React.FC<PreviewProps> = ({
  originalImage,
  processedResult,
  settings,
  isProcessing,
  onExported,
  isEyedropperMode,
  onEyedropperPick,
  dpiInfo,
  embedded = false,
  workspaceStage = 'prepare',
  exportRequestToken = 0,
  productionPlacement,
  onProductionPlacementChange,
}) => {
  const [viewMode, setViewMode] = useState<'ARTBOARD' | 'MOCKUP'>('ARTBOARD');
  const [bgMode, setBgMode] = useState<'CHECKER' | 'BLACK' | 'WHITE'>('CHECKER');
  const [selectedMockupIndices, setSelectedMockupIndices] = useState<Set<number>>(new Set([6]));
  const [previewMockupIndex, setPreviewMockupIndex] = useState(6);
  const [placement, setPlacement] = useState(DEFAULT_PLACEMENT);
  const [designSource, setDesignSource] = useState<'processed' | 'original'>('processed');
  const [mockupFormat, setMockupFormat] = useState<'PNG' | 'JPG'>('PNG');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Guide states
  const [snapX, setSnapX] = useState(false);
  const [snapY, setSnapY] = useState(false);

  // New States for Features
  const [softProofColor, setSoftProofColor] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareMockupIndex, setCompareMockupIndex] = useState(0);
  const [beforeAfterMode, setBeforeAfterMode] = useState(false);
  const [sliderPosition, setSliderPosition] = useState(50); // percent
  const sliderDragging = useRef(false);
  const beforeAfterRef = useRef<HTMLDivElement>(null);
  const softProofCanvasRef = useRef<HTMLCanvasElement>(null);

  // Zoom / Pan
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const lastPanPos = useRef({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<DragState>({
    dragging: false,
    resizing: false,
    startX: 0,
    startY: 0,
    startPlacement: DEFAULT_PLACEMENT,
  });

  const getDesignUrl = useCallback(() => {
    if (designSource === 'original' && originalImage) return originalImage;
    return processedResult?.previewUrl || processedResult?.url || null;
  }, [designSource, originalImage, processedResult]);

  const toPercent = (px: number, dimension: number) => (px / dimension) * 100;

  useEffect(() => {
    if (productionPlacement) setPlacement(productionPlacement);
  }, [
    productionPlacement?.x,
    productionPlacement?.y,
    productionPlacement?.width,
    productionPlacement?.height,
  ]);

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent, mode: 'move' | 'resize') => {
    e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragState.current = {
      dragging: mode === 'move',
      resizing: mode === 'resize',
      startX: clientX,
      startY: clientY,
      startPlacement: { ...placement },
    };
  };

  const handleMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    // Pan Logic
    if (isPanning.current) {
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const dx = clientX - lastPanPos.current.x;
        const dy = clientY - lastPanPos.current.y;
        setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        lastPanPos.current = { x: clientX, y: clientY };
        return;
    }

    const { dragging, resizing, startX, startY, startPlacement } = dragState.current;
    if (!dragging && !resizing) return;
    if (!containerRef.current) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const rect = containerRef.current.getBoundingClientRect();
    const dx = toPercent(clientX - startX, rect.width);
    const dy = toPercent(clientY - startY, rect.height);

    if (dragging) {
      let newX = Math.max(0, Math.min(100 - startPlacement.width, startPlacement.x + dx));
      let newY = Math.max(0, Math.min(100 - startPlacement.height, startPlacement.y + dy));

      // Snap Logic (Center)
      const centerX = newX + startPlacement.width / 2;
      const centerY = newY + startPlacement.height / 2;

      let snappedX = false;
      let snappedY = false;

      // Snap X (Horizontal Center)
      if (Math.abs(centerX - 50) < SNAP_THRESHOLD) {
        newX = 50 - startPlacement.width / 2;
        snappedX = true;
      }

      // Snap Y (Vertical Center)
      if (Math.abs(centerY - 50) < SNAP_THRESHOLD) {
        newY = 50 - startPlacement.height / 2;
        snappedY = true;
      }
      
      setSnapX(snappedX);
      setSnapY(snappedY);

      setPlacement((p) => ({
        ...p,
        x: newX,
        y: newY,
      }));
    } else if (resizing) {
      setPlacement((p) => ({
        ...p,
        width: Math.max(5, Math.min(100 - startPlacement.x, startPlacement.width + dx)),
        height: Math.max(5, Math.min(100 - startPlacement.y, startPlacement.height + dy)),
      }));
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    if (dragState.current.dragging || dragState.current.resizing) {
      onProductionPlacementChange?.(placement);
    }
    dragState.current.dragging = false;
    dragState.current.resizing = false;
    isPanning.current = false;
    setSnapX(false);
    setSnapY(false);
  }, [onProductionPlacementChange, placement]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleMouseMove, { passive: false });
    window.addEventListener('touchend', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Soft Proof Logic
  useEffect(() => {
    if (!softProofColor || !processedResult || !softProofCanvasRef.current) return;
    const canvas = softProofCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      // Fill with fabric color
      ctx.fillStyle = softProofColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Draw design with multiply blend
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(img, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
    };
    img.src = processedResult.url;
  }, [softProofColor, processedResult]);

  const toggleMockup = (idx: number) => {
    setSelectedMockupIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
    setPreviewMockupIndex(idx);
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    onExported(blob, filename);
  };

  const handleMockupDownload = async () => {
    const designUrl = getDesignUrl();
    if (!designUrl || selectedMockupIndices.size === 0) return;
    setIsDownloading(true);
    setDownloadProgress(0);

    const indices = Array.from(selectedMockupIndices).filter(
      (idx): idx is number =>
        typeof idx === 'number' && Number.isInteger(idx) && idx >= 0 && idx < MOCKUPS.length
    );
    if (indices.length === 0) return;

    try {
      if (indices.length === 1) {
        const mockup = MOCKUPS[indices[0]];
        const result = await compositeMockup(mockup.file, designUrl, placement, mockupFormat);
        downloadBlob(result.blob, `mockup-${mockup.name.toLowerCase().replace(/ /g, '-')}.${mockupFormat.toLowerCase()}`);
        setDownloadProgress(100);
      } else {
        try {
          // @ts-ignore
          const JSZip = (await import('jszip')).default;
          const zip = new JSZip();

          for (let i = 0; i < indices.length; i++) {
            const mockup = MOCKUPS[indices[i]];
            const result = await compositeMockup(mockup.file, designUrl, placement, mockupFormat);
            const arrayBuffer = await result.blob.arrayBuffer();
            zip.file(`mockup-${mockup.name.toLowerCase().replace(/ /g, '-')}.${mockupFormat.toLowerCase()}`, arrayBuffer);
            setDownloadProgress(Math.round(((i + 1) / indices.length) * 80));
          }

          const zipBlob = await zip.generateAsync({ type: 'blob' });
          setDownloadProgress(100);
          downloadBlob(zipBlob, `inkmaster-mockups.zip`);
        } catch {
          // JSZip not available — fall back to sequential downloads
          for (let i = 0; i < indices.length; i++) {
            const mockup = MOCKUPS[indices[i]];
            const result = await compositeMockup(mockup.file, designUrl, placement, mockupFormat);
            downloadBlob(result.blob, `mockup-${mockup.name.toLowerCase().replace(/ /g, '-')}.${mockupFormat.toLowerCase()}`);
            setDownloadProgress(Math.round(((i + 1) / indices.length) * 100));
            await new Promise((r) => setTimeout(r, 200));
          }
        }
      }
    } catch (err) {
      console.error('Mockup download failed:', err);
      alert('Failed to generate mockup. Ensure mockup images are present in /mockups/ folder.');
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  useEffect(() => {
    if (exportRequestToken > 0) {
      void handleMockupDownload();
    }
  }, [exportRequestToken]);

  const handleDownloadSingle = async (idx: number) => {
    const designUrl = getDesignUrl();
    if (!designUrl) return;
    const mockup = MOCKUPS[idx];
    try {
      const result = await compositeMockup(mockup.file, designUrl, placement, mockupFormat);
      downloadBlob(result.blob, `mockup-${mockup.name.toLowerCase().replace(/ /g, '-')}.${mockupFormat.toLowerCase()}`);
    } catch (err) {
      console.error('Download failed:', err);
      alert(`Failed to download ${mockup.name} mockup. Check if image exists.`);
    }
  };

  const handleEyedropperClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!isEyedropperMode || !processedResult) return;
    // Get click position relative to image
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    // Sample color at that position using a temp canvas
    const canvas = document.createElement('canvas');
    const img = e.currentTarget;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const px = Math.floor(x * img.naturalWidth);
    const py = Math.floor(y * img.naturalHeight);
    const pixel = ctx.getImageData(px, py, 1, 1).data;
    const hex = '#' + [pixel[0], pixel[1], pixel[2]]
      .map(v => v.toString(16).padStart(2, '0'))
      .join('').toUpperCase();
    onEyedropperPick?.(hex);
  };

  const handlePDFExport = async () => {
    if (!processedResult) return;
    try {
      const result = await generatePrintPDF(processedResult.url, settings.itemType);
      const a = document.createElement('a');
      a.href = result.url;
      a.download = `inkmaster_printready_${settings.itemType.toLowerCase()}.pdf`;
      a.click();
      onExported(result.blob, `inkmaster_printready_${settings.itemType.toLowerCase()}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
    }
  };

  const getBgClass = () => {
    switch (bgMode) {
      case 'BLACK': return 'bg-black';
      case 'WHITE': return 'bg-white';
      default: return 'bg-[url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/nYDCgBDAm9BGDWAAjyQc6wcXOQAQLA2PpAPbnAAAAABJRU5ErkJggg==")]';
    }
  };

  if (isProcessing && !processedResult) {
    return (
      <div className="w-full h-[600px] bg-slate-900 rounded-b-xl border border-t-0 border-slate-800 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 text-sm animate-pulse">Processing Master File...</p>
        </div>
      </div>
    );
  }

  if (!processedResult) {
    return (
      <div className="w-full h-[600px] bg-slate-900 rounded-b-xl border border-t-0 border-slate-800 flex items-center justify-center">
        <div className="text-center text-slate-600">
          <svg className="w-12 h-12 mx-auto mb-2 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p>Preview will appear here</p>
        </div>
      </div>
    );
  }

  const designUrl = getDesignUrl();

  if (embedded) {
    const showMockup = workspaceStage === 'preview' && viewMode === 'MOCKUP';
    return (
      <div className="flex h-full min-h-0 w-full flex-col">
        <div className="flex flex-none flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/80 px-3 py-2 lg:px-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,.7)]" />
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">
              {workspaceStage === 'preview' ? (showMockup ? 'Garment preview' : 'Artwork preview') : workspaceStage === 'export' ? 'Export proof' : 'Live artwork'}
            </span>
            {dpiInfo && (
              <span className={`rounded-md border px-2 py-1 text-[9px] font-bold ${dpiInfo.status === 'good' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : dpiInfo.status === 'low' ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-300'}`}>
                {dpiInfo.dpi} DPI
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {workspaceStage === 'preview' && (
              <div className="mr-1 flex rounded-lg border border-slate-700 bg-slate-950/60 p-1">
                <button type="button" onClick={() => setViewMode('ARTBOARD')} className={`rounded-md px-3 py-1.5 text-[10px] font-bold ${viewMode === 'ARTBOARD' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>Artwork</button>
                <button type="button" onClick={() => setViewMode('MOCKUP')} className={`rounded-md px-3 py-1.5 text-[10px] font-bold ${viewMode === 'MOCKUP' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>Garment</button>
              </div>
            )}
            {!showMockup && (
              <>
                <button type="button" onClick={() => setBeforeAfterMode((value) => !value)} className={`rounded-md border px-2.5 py-1.5 text-[10px] font-bold ${beforeAfterMode ? 'border-indigo-400 bg-indigo-500/15 text-indigo-200' : 'border-slate-700 text-slate-400 hover:text-white'}`}>Before / After</button>
                {(['CHECKER', 'BLACK', 'WHITE'] as const).map((mode) => (
                  <button
                    type="button"
                    key={mode}
                    aria-label={`${mode.toLowerCase()} preview background`}
                    onClick={() => setBgMode(mode)}
                    className={`h-7 w-7 rounded-md border ${bgMode === mode ? 'border-indigo-400 ring-1 ring-indigo-400/40' : 'border-slate-700'}`}
                    style={{ background: mode === 'BLACK' ? '#050505' : mode === 'WHITE' ? '#fff' : 'linear-gradient(45deg,#475569 25%,transparent 25%),linear-gradient(-45deg,#475569 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#475569 75%),linear-gradient(-45deg,transparent 75%,#475569 75%)', backgroundSize: mode === 'CHECKER' ? '10px 10px' : undefined }}
                  />
                ))}
              </>
            )}
          </div>
        </div>

        <div className={`relative min-h-0 flex-1 overflow-hidden ${showMockup ? 'bg-slate-950' : getBgClass()}`}>
          {showMockup ? (
            <>
              <img src={MOCKUPS[previewMockupIndex].file} alt={`${MOCKUPS[previewMockupIndex].name} shirt mockup`} className="absolute inset-0 h-full w-full object-contain" />
              {designUrl && (
                <div className="absolute" style={{ left: `${placement.x}%`, top: `${placement.y}%`, width: `${placement.width}%`, height: `${placement.height}%` }}>
                  <img src={designUrl} alt="Artwork placed on shirt" className="h-full w-full object-contain drop-shadow-lg" />
                </div>
              )}
              <div className="absolute bottom-4 left-1/2 flex max-w-[95%] -translate-x-1/2 flex-wrap justify-center gap-1 rounded-xl border border-slate-700 bg-slate-950/85 p-2 backdrop-blur sm:gap-1.5">
                {MOCKUPS.map((mockup, index) => (
                  <button
                    type="button"
                    key={mockup.name}
                    onClick={() => { setPreviewMockupIndex(index); setSelectedMockupIndices(new Set([index])); }}
                    aria-label={`Preview ${mockup.name} shirt`}
                    className={`h-5 w-5 rounded-full border-2 transition hover:scale-110 sm:h-6 sm:w-6 ${previewMockupIndex === index ? 'border-white ring-2 ring-indigo-400/40' : 'border-slate-600'}`}
                    style={{ backgroundColor: mockup.color }}
                  />
                ))}
              </div>
            </>
          ) : beforeAfterMode ? (
            <div
              ref={beforeAfterRef}
              className="relative h-full w-full select-none"
              onMouseMove={(event) => {
                if (!sliderDragging.current || !beforeAfterRef.current) return;
                const rect = beforeAfterRef.current.getBoundingClientRect();
                setSliderPosition(Math.max(5, Math.min(95, ((event.clientX - rect.left) / rect.width) * 100)));
              }}
              onMouseUp={() => { sliderDragging.current = false; }}
              onMouseLeave={() => { sliderDragging.current = false; }}
            >
              <img src={originalImage || ''} alt="Original artwork" className="absolute inset-0 h-full w-full object-contain p-5" style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }} />
              <img src={processedResult.url} alt="Processed artwork" className="absolute inset-0 h-full w-full object-contain p-5" style={{ clipPath: `inset(0 0 0 ${sliderPosition}%)` }} />
              <button
                type="button"
                aria-label="Move before and after divider"
                className="absolute bottom-0 top-0 z-10 w-1 -translate-x-1/2 cursor-ew-resize bg-white shadow-lg"
                style={{ left: `${sliderPosition}%` }}
                onMouseDown={() => { sliderDragging.current = true; }}
              >
                <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-slate-900 shadow-xl">↔</span>
              </button>
              <span className="absolute left-3 top-3 rounded-md bg-black/60 px-2 py-1 text-[9px] font-bold text-white">BEFORE</span>
              <span className="absolute right-3 top-3 rounded-md bg-indigo-600/80 px-2 py-1 text-[9px] font-bold text-white">AFTER</span>
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center overflow-hidden p-4 lg:p-7">
              <img
                src={processedResult.previewUrl || processedResult.url}
                alt="Processed artwork preview"
                onClick={handleEyedropperClick}
                className="max-h-full max-w-full object-contain drop-shadow-2xl"
                style={{
                  transform: `scale(${zoom}) translate(${panOffset.x}px, ${panOffset.y}px)`,
                  transformOrigin: 'center',
                  cursor: isEyedropperMode ? 'crosshair' : 'default',
                }}
              />
            </div>
          )}
          {!showMockup && (
            <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950/80 p-1 backdrop-blur">
              <button type="button" onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))} className="h-7 w-7 rounded text-xs text-slate-300 hover:bg-slate-800">−</button>
              <button type="button" onClick={() => { setZoom(1); setPanOffset({ x: 0, y: 0 }); }} className="rounded px-2 py-1 text-[9px] font-bold text-slate-400 hover:bg-slate-800 hover:text-white">{Math.round(zoom * 100)}%</button>
              <button type="button" onClick={() => setZoom((value) => Math.min(5, value + 0.25))} className="h-7 w-7 rounded text-xs text-slate-300 hover:bg-slate-800">+</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-4">
      {/* View Mode Tabs */}
      <div className="flex bg-slate-900 rounded-lg p-1.5 self-start border border-slate-800">
        <button
          onClick={() => setViewMode('ARTBOARD')}
          className={`px-6 py-3 text-sm font-bold rounded-md transition-all ${viewMode === 'ARTBOARD' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
        >
          Artboard
        </button>
        <button
          onClick={() => setViewMode('MOCKUP')}
          className={`px-6 py-3 text-sm font-bold rounded-md transition-all ${viewMode === 'MOCKUP' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
        >
          Mockup
        </button>
      </div>

      {/* ARTBOARD VIEW */}
      {viewMode === 'ARTBOARD' && (
        <>
          <div 
             className={`relative w-full h-[600px] rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center transition-colors duration-500 group ${getBgClass()}`}
             onWheel={(e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? 0.9 : 1.1;
                setZoom(prev => Math.max(0.5, Math.min(5, prev * delta)));
             }}
             onMouseDown={(e) => {
                if (e.button === 1 || e.altKey) { 
                  e.preventDefault();
                  isPanning.current = true;
                  lastPanPos.current = { x: e.clientX, y: e.clientY };
                }
             }}
          >
            <div className="absolute top-4 right-4 flex bg-slate-900/90 backdrop-blur rounded-lg p-1 border border-slate-700 shadow-xl z-20 opacity-0 group-hover:opacity-100 transition-opacity">
               {/* Before/After Toggle */}
               <button
                    onClick={() => setBeforeAfterMode(!beforeAfterMode)}
                    className={`px-3 py-1.5 text-[10px] font-bold rounded border mr-2 transition-all ${
                    beforeAfterMode
                        ? 'bg-indigo-600 text-white border-indigo-500'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                >
                    ◐ Before/After
                </button>
               {/* Soft Proof Toggle */}
               <div className="flex items-center gap-1 border-r border-slate-700 pr-2 mr-2">
                 {['#1A1A1A', '#FFFFFF', '#374151', '#1E3A8A', '#064E3B', '#991B1B'].map(c => (
                     <button 
                        key={c}
                        onClick={() => setSoftProofColor(softProofColor === c ? null : c)}
                        className={`w-4 h-4 rounded-full border ${softProofColor === c ? 'border-white ring-1 ring-white' : 'border-slate-600'}`}
                        style={{ backgroundColor: c }}
                        title="Soft Proof"
                     />
                 ))}
               </div>

              <button onClick={() => setBgMode('CHECKER')} className={`p-2 rounded ${bgMode === 'CHECKER' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`} title="Transparent Grid">
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M0 0h8v8H0V0zm8 8h8v8H8V8z" opacity="0.5" /><path d="M8 0h8v8H8V0zM0 8h8v8H0V8z" opacity="0.2" /></svg>
              </button>
              <button onClick={() => setBgMode('BLACK')} className={`p-2 rounded ${bgMode === 'BLACK' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`} title="Black Background">
                <div className="w-4 h-4 bg-black border border-slate-600 rounded-sm"></div>
              </button>
              <button onClick={() => setBgMode('WHITE')} className={`p-2 rounded ${bgMode === 'WHITE' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`} title="White Background">
                <div className="w-4 h-4 bg-white rounded-sm"></div>
              </button>
            </div>

            {beforeAfterMode ? (
                // Before/After Slider
                <div
                    ref={beforeAfterRef}
                    className="relative w-full h-full select-none"
                    onMouseMove={(e) => {
                    if (!sliderDragging.current || !beforeAfterRef.current) return;
                    const rect = beforeAfterRef.current.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / rect.width) * 100;
                    setSliderPosition(Math.max(5, Math.min(95, x)));
                    }}
                    onMouseUp={() => { sliderDragging.current = false; }}
                    onMouseLeave={() => { sliderDragging.current = false; }}
                >
                    {/* Original image — clipped to left of slider */}
                    <img
                        src={originalImage || ''}
                        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                        style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
                        draggable={false}
                    />
                    {/* Processed image — clipped to right of slider */}
                    <img
                        src={processedResult.url}
                        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                        style={{ clipPath: `inset(0 0 0 ${sliderPosition}%)` }}
                        draggable={false}
                    />
                    {/* Slider handle */}
                    <div
                        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg cursor-ew-resize z-10"
                        style={{ left: `${sliderPosition}%` }}
                        onMouseDown={() => { sliderDragging.current = true; }}
                    >
                        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 bg-white rounded-full shadow-xl flex items-center justify-center">
                            <svg className="w-4 h-4 text-slate-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l-3 3 3 3M16 9l3 3-3 3" />
                            </svg>
                        </div>
                    </div>
                    {/* Labels */}
                    <div className="absolute top-3 left-3 bg-black/60 text-white text-[10px] px-2 py-1 rounded font-bold">BEFORE</div>
                    <div className="absolute top-3 right-3 bg-indigo-600/80 text-white text-[10px] px-2 py-1 rounded font-bold">AFTER</div>
                </div>
            ) : (
                <>
                    {/* Soft Proof or Standard Image */}
                    {softProofColor ? (
                        <canvas ref={softProofCanvasRef} className="max-w-full max-h-full object-contain" 
                            style={{
                                transform: `scale(${zoom}) translate(${panOffset.x}px, ${panOffset.y}px)`,
                                transformOrigin: 'center center',
                                transition: isPanning.current ? 'none' : 'transform 0.1s ease',
                                cursor: isPanning.current ? 'grabbing' : isEyedropperMode ? 'crosshair' : 'default'
                            }}
                        />
                    ) : (
                        <img
                        src={processedResult.previewUrl || processedResult.url}
                        alt="Processed Preview"
                        className="max-w-full max-h-full object-contain shadow-2xl"
                        style={{ 
                            filter: bgMode === 'WHITE' ? 'drop-shadow(0 10px 15px rgba(0,0,0,0.1))' : 'none',
                            transform: `scale(${zoom}) translate(${panOffset.x}px, ${panOffset.y}px)`,
                            transformOrigin: 'center center',
                            transition: isPanning.current ? 'none' : 'transform 0.1s ease',
                            cursor: isPanning.current ? 'grabbing' : isEyedropperMode ? 'crosshair' : 'default'
                        }}
                        onClick={handleEyedropperClick}
                        />
                    )}
                    {/* Soft Proof Overlay Label */}
                    {softProofColor && (
                        <div className="absolute top-4 left-4 bg-slate-900/90 text-xs text-amber-400 px-2 py-1 rounded border border-amber-500/30">
                            Soft Proof · {softProofColor}
                        </div>
                    )}
                </>
            )}

            {/* Zoom Controls */}
            <div className="absolute bottom-4 left-4 flex items-center gap-2 z-20">
                <button
                onClick={() => { setZoom(1); setPanOffset({ x: 0, y: 0 }); }}
                className="bg-slate-950/80 text-slate-400 hover:text-white text-[10px] px-2 py-1.5 rounded-lg border border-slate-700"
                >
                ↺ Reset
                </button>
                <span className="bg-slate-950/80 text-slate-400 text-[10px] px-2 py-1.5 rounded-lg border border-slate-700 font-mono">
                {Math.round(zoom * 100)}%
                </span>
            </div>

            <div className="absolute bottom-4 right-4 bg-slate-950/80 backdrop-blur-md text-slate-300 text-[10px] px-3 py-1.5 rounded-full border border-slate-700 font-mono flex items-center gap-2 z-20">
              <div className={`w-2 h-2 rounded-full ${bgMode === 'WHITE' ? 'bg-white' : 'bg-black'} border border-slate-500`}></div>
              {processedResult.width} × {processedResult.height} px @ 300 DPI
            </div>
          </div>

          <div className="flex justify-end gap-3">
             {/* PDF Export Button */}
             <button
                onClick={handlePDFExport}
                className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 px-6 rounded-xl border border-slate-700 flex items-center gap-2 transition-all active:scale-95"
             >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Export PDF
            </button>
            <a
              href={processedResult.url}
              onClick={() => onExported(processedResult.blob, `inkmaster_export_${settings.itemType.toLowerCase()}.${settings.format.toLowerCase()}`)}
              download={`inkmaster_export_${settings.itemType.toLowerCase()}.${settings.format.toLowerCase()}`}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-8 rounded-xl shadow-lg shadow-indigo-900/20 flex items-center gap-2 transition-transform active:scale-95 border border-indigo-500"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Download Print File
            </a>
          </div>
        </>
      )}

      {/* MOCKUP VIEW */}
      {viewMode === 'MOCKUP' && (
        <div className="flex flex-col gap-6">
           <div className="flex justify-between items-center bg-slate-900 p-2 rounded-lg border border-slate-800">
                {/* Print Presets */}
                <div className="flex gap-2 flex-wrap">
                    {PRINT_PRESETS.map((preset) => (
                    <button
                        key={preset.label}
                        onClick={() => setPlacement({
                        x: preset.x,
                        y: preset.y,
                        width: preset.width,
                        height: preset.height
                        })}
                        className="px-3 py-1.5 text-[10px] font-bold rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:border-indigo-500/50 hover:text-indigo-300 transition-all"
                    >
                        {preset.label}
                    </button>
                    ))}
                </div>
                {/* Compare Toggle */}
                <button
                    onClick={() => setCompareMode(!compareMode)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                    compareMode
                        ? 'bg-indigo-600 text-white border-indigo-500'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                    }`}
                >
                    ⊞ Compare
                </button>
           </div>
          
           {compareMode ? (
                // Compare View
                <div className="grid grid-cols-2 gap-2 w-full h-[600px]">
                    {[previewMockupIndex, compareMockupIndex].map((idx, panelIdx) => (
                    <div key={panelIdx} className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
                        <img 
                            src={MOCKUPS[idx].file} 
                            className="absolute inset-0 w-full h-full object-contain"
                            onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                console.error(`Failed to load mockup: ${target.src}`);
                                target.src = 'data:image/svg+xml,%3Csvg xmlns=\"http://www.w3.org/2000/svg\" width=\"100\" height=\"100\" viewBox=\"0 0 100 100\"%3E%3Crect fill=\"%23334155\" width=\"100\" height=\"100\"/%3E%3Ctext x=\"50\" y=\"50\" font-size=\"12\" fill=\"%23cbd5e1\" text-anchor=\"middle\" dominant-baseline=\"middle\"%3EMockup Not Found%3C/text%3E%3C/svg%3E';
                            }}
                        />
                        {designUrl && (
                        <div
                            className="absolute"
                            style={{
                            left: `${placement.x}%`,
                            top: `${placement.y}%`,
                            width: `${placement.width}%`,
                            height: `${placement.height}%`,
                            }}
                        >
                            <img src={designUrl} className="w-full h-full object-contain" style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))' }} />
                        </div>
                        )}
                        {/* Color selector for this panel */}
                        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1 z-10">
                        {MOCKUPS.map((m, mIdx) => (
                            <button
                            key={m.name}
                            onClick={() => panelIdx === 0
                                ? setPreviewMockupIndex(mIdx)
                                : setCompareMockupIndex(mIdx)
                            }
                            className={`w-5 h-5 rounded-full border transition-all ${
                                idx === mIdx ? 'border-white scale-110' : 'border-slate-600'
                            }`}
                            style={{ backgroundColor: m.color }}
                            />
                        ))}
                        </div>
                        <div className="absolute top-2 left-2 bg-slate-950/80 text-xs text-slate-300 px-2 py-1 rounded-full border border-slate-700">
                        {MOCKUPS[idx].name}
                        </div>
                    </div>
                    ))}
                </div>
           ) : (
             // Standard View
             <div
                ref={containerRef}
                className="relative w-full h-[600px] rounded-xl overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center select-none"
            >
                {/* Alignment Grid */}
                <div 
                className="absolute inset-0 pointer-events-none opacity-20" 
                style={{ 
                    backgroundImage: `
                    linear-gradient(to right, #4f46e5 1px, transparent 1px),
                    linear-gradient(to bottom, #4f46e5 1px, transparent 1px)
                    `,
                    backgroundSize: '20% 20%'
                }}
                ></div>
                <div className="absolute inset-0 pointer-events-none opacity-10 border-t border-b border-indigo-500/50" style={{ top: '50%', bottom: '50%' }}></div>
                <div className="absolute inset-0 pointer-events-none opacity-10 border-l border-r border-indigo-500/50" style={{ left: '50%', right: '50%' }}></div>

                <img
                src={MOCKUPS[previewMockupIndex].file}
                alt={MOCKUPS[previewMockupIndex].name}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                draggable={false}
                onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    console.error(`Failed to load mockup: ${target.src}`);
                    // Replace with placeholder instead of dimming
                    target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"%3E%3Crect fill="%23334155" width="100" height="100"/%3E%3Ctext x="50" y="50" font-size="12" fill="%23cbd5e1" text-anchor="middle" dominant-baseline="middle"%3EMockup Not Found%3C/text%3E%3C/svg%3E';
                }}
                />

                {designUrl && (
                <div
                    className="absolute cursor-move group/design"
                    style={{
                    left: `${placement.x}%`,
                    top: `${placement.y}%`,
                    width: `${placement.width}%`,
                    height: `${placement.height}%`,
                    }}
                    onMouseDown={(e) => handleDragStart(e, 'move')}
                    onTouchStart={(e) => handleDragStart(e, 'move')}
                >
                    <img
                    src={designUrl}
                    alt="Design"
                    className="w-full h-full object-contain pointer-events-none"
                    style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))' }}
                    draggable={false}
                    />
                    <div className="absolute inset-0 border-2 border-dashed border-indigo-400/0 group-hover/design:border-indigo-400/70 rounded transition-all pointer-events-none"></div>
                    
                    {/* Center Cross inside element when dragging/hovering */}
                    <div className="absolute top-1/2 left-1/2 w-4 h-4 -mt-2 -ml-2 text-indigo-400 opacity-0 group-hover/design:opacity-100 transition-opacity pointer-events-none">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 5v14M5 12h14" />
                        </svg>
                    </div>

                    <div
                    className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize opacity-0 group-hover/design:opacity-100 transition-opacity z-10"
                    onMouseDown={(e) => { e.stopPropagation(); handleDragStart(e, 'resize'); }}
                    onTouchStart={(e) => { e.stopPropagation(); handleDragStart(e, 'resize'); }}
                    >
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-indigo-400 drop-shadow">
                        <path d="M11 9H13V11H11V9ZM13 11H15V13H13V11ZM9 11H11V13H9V11ZM11 13H13V15H11V13ZM7 13H9V15H7V13ZM13 7H15V9H13V7Z" />
                    </svg>
                    </div>
                    <div className="absolute top-1 left-1 bg-slate-900/80 text-indigo-300 text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover/design:opacity-100 transition-opacity pointer-events-none font-mono">
                    drag to move · corner to resize
                    </div>
                </div>
                )}

                {/* Smart Guides */}
                {snapX && (
                <div className="absolute top-0 bottom-0 w-px bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)] z-30" style={{ left: '50%' }}></div>
                )}
                {snapY && (
                <div className="absolute left-0 right-0 h-px bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)] z-30" style={{ top: '50%' }}></div>
                )}
                {/* Center Crosshair (appears when both aligned) */}
                {snapX && snapY && (
                    <div className="absolute top-1/2 left-1/2 w-8 h-8 -mt-4 -ml-4 border-2 border-rose-500 rounded-full z-40 shadow-[0_0_15px_rgba(244,63,94,0.5)]"></div>
                )}

                <div className="absolute bottom-4 left-4 bg-slate-950/80 backdrop-blur-md text-slate-300 text-xs px-3 py-1.5 rounded-full border border-slate-700 font-medium z-10">
                {MOCKUPS[previewMockupIndex].name}
                </div>

                <button
                onClick={() => setPlacement(DEFAULT_PLACEMENT)}
                className="absolute top-4 left-4 bg-slate-900/90 backdrop-blur text-slate-400 hover:text-white text-[10px] px-2 py-1.5 rounded-lg border border-slate-700 transition-colors z-10"
                >
                ↺ Reset
                </button>
            </div>
           )}

          {/* Mockup Generator Controls */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 flex flex-col gap-5">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <span className="text-indigo-400">👕</span> Mockup Generator
            </h3>

            {/* Color grid */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs text-slate-500">Select Colors to Download</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedMockupIndices(new Set(MOCKUPS.map((_, i) => i)))}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    Select All
                  </button>
                  <span className="text-slate-700">·</span>
                  <button
                    onClick={() => setSelectedMockupIndices(new Set())}
                    className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-11 gap-2">
                {MOCKUPS.map((m, idx) => (
                  <div key={m.name} className="flex flex-col items-center gap-1">
                    <button
                      onClick={() => toggleMockup(idx)}
                      className={`relative w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${
                        selectedMockupIndices.has(idx)
                          ? 'border-indigo-400 scale-110 shadow-lg shadow-indigo-900/40'
                          : 'border-slate-600 hover:border-slate-400'
                      } ${previewMockupIndex === idx ? 'ring-2 ring-white/30' : ''}`}
                      style={{ backgroundColor: m.color }}
                      title={m.name}
                    >
                      {selectedMockupIndices.has(idx) && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <svg className="w-3 h-3 text-white drop-shadow" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </button>
                    <span className="text-[8px] text-slate-500 text-center leading-tight max-w-[36px] truncate" title={m.name}>
                      {m.name}
                    </span>
                    <button
                      onClick={() => handleDownloadSingle(idx)}
                      className="text-[8px] text-slate-600 hover:text-indigo-400 transition-colors"
                      title={`Download ${m.name}`}
                    >
                      ↓
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Design source + format */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-500 block mb-2">Design Layer</label>
                <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
                  <button
                    onClick={() => setDesignSource('processed')}
                    className={`flex-1 py-1.5 text-[10px] font-bold rounded transition-all ${designSource === 'processed' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                  >
                    Processed
                  </button>
                  <button
                    onClick={() => setDesignSource('original')}
                    className={`flex-1 py-1.5 text-[10px] font-bold rounded transition-all ${designSource === 'original' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                  >
                    Original
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-2">Export Format</label>
                <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
                  <button
                    onClick={() => setMockupFormat('PNG')}
                    className={`flex-1 py-1.5 text-[10px] font-bold rounded transition-all ${mockupFormat === 'PNG' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                  >
                    PNG
                  </button>
                  <button
                    onClick={() => setMockupFormat('JPG')}
                    className={`flex-1 py-1.5 text-[10px] font-bold rounded transition-all ${mockupFormat === 'JPG' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                  >
                    JPG
                  </button>
                </div>
              </div>
            </div>

            {/* Download button */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={handleMockupDownload}
                disabled={isDownloading || selectedMockupIndices.size === 0}
                className={`flex-1 py-3 px-6 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                  isDownloading || selectedMockupIndices.size === 0
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/20 border border-indigo-500 active:scale-95'
                }`}
              >
                {isDownloading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin"></div>
                    {downloadProgress > 0 ? `${downloadProgress}%` : 'Compositing...'}
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    {selectedMockupIndices.size === 0
                      ? 'Select Colors First'
                      : selectedMockupIndices.size === 1
                      ? 'Download Mockup'
                      : `Download ${selectedMockupIndices.size} Mockups`}
                  </>
                )}
              </button>

              {isDownloading && downloadProgress > 0 && (
                <div className="flex-1 flex items-center">
                  <div className="w-full bg-slate-800 rounded-full h-2 border border-slate-700">
                    <div
                      className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${downloadProgress}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>

            {selectedMockupIndices.size > 1 && !isDownloading && (
              <p className="text-[10px] text-slate-500 text-center -mt-2">
                Multiple files will download as a ZIP (if JSZip is available) or individually
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
