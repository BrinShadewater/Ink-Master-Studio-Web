import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArtworkAnalysis, OutputFormat, ProcessedResult, ProcessingSettings, ResizeMode, ShirtColor } from '../types';
import { MAX_FILE_SIZE_MB, MAX_SVG_SIZE_MB } from '../constants';
import { PrintifyProductPreset, printify } from '../specs/printify';
import { ProcessingProgress } from '../services/imageProcessingWorkerClient';
import { assessUpscaleQuality } from '../services/upscaleQuality';
import { compositeMockup } from '../services/imageProcessing';
import { getSimpleMockupForItemType } from '../services/mockups';
import { calculateDesignPlacement } from '../services/designPlacement';
import { PrintFileReceipt, PrintFileValidationItem } from '../services/printFileValidation';

interface SimpleCreatorFlowProps {
  originalImage: string;
  sourceName: string;
  analysis: ArtworkAnalysis | null;
  processedResult: ProcessedResult | null;
  simpleExportResult: ProcessedResult | null;
  simpleExportError: string | null;
  lastDownloadReceipt: PrintFileReceipt | null;
  isProcessing: boolean;
  processingProgress: ProcessingProgress | null;
  selectedProduct: PrintifyProductPreset;
  products: PrintifyProductPreset[];
  onProductChange: (product: PrintifyProductPreset) => void;
  settings: ProcessingSettings;
  onSettingsChange: (settings: ProcessingSettings, commit: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDownload: () => void | Promise<void>;
  onCancelProcessing: () => void;
  onAdvancedMode: () => void;
}

const formatBytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(bytes > 10 * 1024 * 1024 ? 0 : 1)} MB`;
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const SAVED_CREATOR_SETUP_KEY = 'inkmaster_creator_setup_v1';

const creatorSetupKeys = [
  'resizeMode',
  'designScalePercent',
  'designOffsetXPercent',
  'designOffsetYPercent',
  'designRotationDegrees',
  'cropLeftPercent',
  'cropTopPercent',
  'cropRightPercent',
  'cropBottomPercent',
  'adjustmentBrightness',
  'adjustmentContrast',
  'adjustmentSaturation',
  'adjustmentOpacity',
  'sharpness',
  'preserveTransparency',
  'canvasBackground',
] as const;

type CreatorSetupKey = typeof creatorSetupKeys[number];
type CreatorSetup = Partial<Pick<ProcessingSettings, CreatorSetupKey>>;

const pickCreatorSetup = (settings: ProcessingSettings): CreatorSetup =>
  creatorSetupKeys.reduce<CreatorSetup>((setup, key) => ({
    ...setup,
    [key]: settings[key],
  }), {});

export const SimpleCreatorFlow: React.FC<SimpleCreatorFlowProps> = ({
  originalImage,
  sourceName,
  analysis,
  processedResult,
  simpleExportResult,
  simpleExportError,
  lastDownloadReceipt,
  isProcessing,
  processingProgress,
  selectedProduct,
  products,
  onProductChange,
  settings,
  onSettingsChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onDownload,
  onCancelProcessing,
  onAdvancedMode,
}) => {
  const [backgroundChoice, setBackgroundChoice] = useState<'keep' | null>(null);
  const [mockupUrl, setMockupUrl] = useState<string | null>(null);
  const [isMockupLoading, setIsMockupLoading] = useState(false);
  const [mockupError, setMockupError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'edit' | 'print'>('edit');
  const [savedSetupAvailable, setSavedSetupAvailable] = useState(false);
  const mockupRunRef = useRef(0);
  const previewCanvasRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<null | {
    mode: 'move' | 'resize' | 'rotate';
    pointerId: number;
    startX: number;
    startY: number;
    startScale: number;
    startOffsetX: number;
    startOffsetY: number;
    rotationDelta?: number;
    lastPatch?: Partial<ProcessingSettings>;
  }>(null);
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
  const designPlacement = useMemo(() => calculateDesignPlacement({
    sourceWidth: sourceWidth || targetWidth,
    sourceHeight: sourceHeight || targetHeight,
    targetWidth,
    targetHeight,
    resizeMode: settings.resizeMode,
    allowUpscaling: settings.allowUpscaling,
    edit: settings,
  }), [sourceWidth, sourceHeight, targetWidth, targetHeight, settings]);
  const showingPrintPreview = previewMode === 'print' && Boolean(processedResult) && !mockupUrl;
  const previewImageUrl = mockupUrl
    || (showingPrintPreview ? processedResult?.previewUrl || processedResult?.url || originalImage : originalImage);
  const previewBackgroundClass = !settings.preserveTransparency && settings.canvasBackground === 'white'
    ? 'bg-white'
    : !settings.preserveTransparency && settings.canvasBackground === 'black'
      ? 'bg-black'
      : 'bg-[linear-gradient(45deg,#0f172a_25%,transparent_25%),linear-gradient(-45deg,#0f172a_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#0f172a_75%),linear-gradient(-45deg,transparent_75%,#0f172a_75%)] bg-[length:18px_18px] bg-[position:0_0,0_9px,9px_-9px,-9px_0]';
  const artworkStyle = mockupUrl
    ? undefined
    : showingPrintPreview
      ? { inset: 0 }
    : {
        width: `${(designPlacement.drawWidth / targetWidth) * 100}%`,
        height: `${(designPlacement.drawHeight / targetHeight) * 100}%`,
        left: `${(designPlacement.centerX / targetWidth) * 100}%`,
        top: `${(designPlacement.centerY / targetHeight) * 100}%`,
        transform: `translate(-50%, -50%) rotate(${settings.designRotationDegrees ?? 0}deg)`,
      };
  const artworkFilter = showingPrintPreview || mockupUrl
    ? undefined
    : {
        filter: `brightness(${settings.adjustmentBrightness ?? 100}%) contrast(${settings.adjustmentContrast ?? 100}%) saturate(${settings.adjustmentSaturation ?? 100}%)`,
        opacity: (settings.adjustmentOpacity ?? 100) / 100,
      };
  const cropInsetStyle = {
    left: `${settings.cropLeftPercent ?? 0}%`,
    top: `${settings.cropTopPercent ?? 0}%`,
    right: `${settings.cropRightPercent ?? 0}%`,
    bottom: `${settings.cropBottomPercent ?? 0}%`,
  };
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
  const resetCrop = () => onSettingsChange({
    ...settings,
    cropLeftPercent: 0,
    cropTopPercent: 0,
    cropRightPercent: 0,
    cropBottomPercent: 0,
  }, true);
  const trimEdges = () => onSettingsChange({
    ...settings,
    cropLeftPercent: 5,
    cropTopPercent: 5,
    cropRightPercent: 5,
    cropBottomPercent: 5,
  }, true);
  const resetAdjustments = () => onSettingsChange({
    ...settings,
    adjustmentBrightness: 100,
    adjustmentContrast: 100,
    adjustmentSaturation: 100,
    sharpness: 0,
    adjustmentOpacity: 100,
  }, true);
  const applyCreatorPreset = (preset: 'transparent-logo' | 'photo-tee' | 'bold-merch' | 'poster-art') => {
    const presetSettings: Record<typeof preset, Partial<ProcessingSettings>> = {
      'transparent-logo': {
        resizeMode: ResizeMode.FIT,
        designScalePercent: 92,
        designOffsetXPercent: 0,
        designOffsetYPercent: 0,
        designRotationDegrees: 0,
        cropLeftPercent: 3,
        cropTopPercent: 3,
        cropRightPercent: 3,
        cropBottomPercent: 3,
        adjustmentBrightness: 105,
        adjustmentContrast: 115,
        adjustmentSaturation: 110,
        sharpness: 18,
        adjustmentOpacity: 100,
        preserveTransparency: true,
        canvasBackground: 'transparent',
      },
      'photo-tee': {
        resizeMode: ResizeMode.COVER,
        designScalePercent: 105,
        designOffsetXPercent: 0,
        designOffsetYPercent: 2,
        designRotationDegrees: 0,
        cropLeftPercent: 0,
        cropTopPercent: 0,
        cropRightPercent: 0,
        cropBottomPercent: 0,
        adjustmentBrightness: 105,
        adjustmentContrast: 108,
        adjustmentSaturation: 105,
        sharpness: 8,
        adjustmentOpacity: 100,
      },
      'bold-merch': {
        resizeMode: ResizeMode.FIT,
        designScalePercent: 112,
        designOffsetXPercent: 0,
        designOffsetYPercent: 0,
        designRotationDegrees: 0,
        cropLeftPercent: 4,
        cropTopPercent: 4,
        cropRightPercent: 4,
        cropBottomPercent: 4,
        adjustmentBrightness: 110,
        adjustmentContrast: 125,
        adjustmentSaturation: 120,
        sharpness: 24,
        adjustmentOpacity: 100,
        preserveTransparency: true,
        canvasBackground: 'transparent',
      },
      'poster-art': {
        resizeMode: ResizeMode.COVER,
        designScalePercent: 100,
        designOffsetXPercent: 0,
        designOffsetYPercent: 0,
        designRotationDegrees: 0,
        cropLeftPercent: 0,
        cropTopPercent: 0,
        cropRightPercent: 0,
        cropBottomPercent: 0,
        adjustmentBrightness: 100,
        adjustmentContrast: 112,
        adjustmentSaturation: 110,
        sharpness: 10,
        adjustmentOpacity: 100,
        preserveTransparency: false,
        canvasBackground: 'white',
      },
    };
    onSettingsChange({ ...settings, ...presetSettings[preset], format: OutputFormat.PNG, shirtColor: ShirtColor.NONE }, true);
  };
  const saveCreatorSetup = () => {
    localStorage.setItem(SAVED_CREATOR_SETUP_KEY, JSON.stringify(pickCreatorSetup(settings)));
    setSavedSetupAvailable(true);
  };
  const applySavedCreatorSetup = () => {
    const raw = localStorage.getItem(SAVED_CREATOR_SETUP_KEY);
    if (!raw) return;
    try {
      const setup = JSON.parse(raw) as CreatorSetup;
      onSettingsChange({ ...settings, ...setup, format: OutputFormat.PNG, shirtColor: ShirtColor.NONE }, true);
    } catch {
      localStorage.removeItem(SAVED_CREATOR_SETUP_KEY);
      setSavedSetupAvailable(false);
    }
  };
  const applyPlacementPreset = (preset: 'fit' | 'fill' | 'center' | 'top-chest' | 'full-front') => {
    const next: ProcessingSettings = {
      ...settings,
      resizeMode: preset === 'fill' || preset === 'full-front' ? ResizeMode.COVER : ResizeMode.FIT,
      designOffsetXPercent: 0,
      designOffsetYPercent: preset === 'top-chest' ? -18 : 0,
      designRotationDegrees: preset === 'center' ? 0 : settings.designRotationDegrees,
      designScalePercent: preset === 'top-chest'
        ? 58
        : preset === 'full-front'
          ? 112
          : preset === 'center'
            ? settings.designScalePercent ?? 100
            : 100,
    };
    onSettingsChange(next, true);
  };
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
  const commitInteraction = () => {
    const interaction = interactionRef.current;
    interactionRef.current = null;
    onSettingsChange({ ...settings, ...(interaction?.lastPatch ?? {}) }, true);
  };
  const updatePlacementDuringInteraction = (next: Partial<ProcessingSettings>) => {
    if (interactionRef.current) interactionRef.current.lastPatch = next;
    onSettingsChange({ ...settings, ...next }, false);
  };
  const getInteractionPatch = (clientX: number, clientY: number): Partial<ProcessingSettings> | null => {
    const interaction = interactionRef.current;
    const rect = previewCanvasRef.current?.getBoundingClientRect();
    if (!interaction || !rect) return null;

    if (interaction.mode === 'move') {
      const nextX = clamp(interaction.startOffsetX + ((clientX - interaction.startX) / rect.width) * 100, -50, 50);
      const nextY = clamp(interaction.startOffsetY + ((clientY - interaction.startY) / rect.height) * 100, -50, 50);
      return {
        designOffsetXPercent: Math.round(nextX),
        designOffsetYPercent: Math.round(nextY),
      };
    }

    if (interaction.mode === 'resize') {
      const delta = ((clientX - interaction.startX) / rect.width + (clientY - interaction.startY) / rect.height) * 120;
      return {
        designScalePercent: Math.round(clamp(interaction.startScale + delta, 10, 300)),
      };
    }

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const angle = (Math.atan2(clientY - centerY, clientX - centerX) * 180) / Math.PI;
    return {
      designRotationDegrees: Math.round(clamp(angle + (interaction.rotationDelta ?? 0), -180, 180)),
    };
  };
  const handleArtworkPointerDown = (event: React.PointerEvent<HTMLDivElement>, mode: 'move' | 'resize' | 'rotate') => {
    if (mockupUrl || showingPrintPreview) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = previewCanvasRef.current?.getBoundingClientRect();
    const centerX = rect ? rect.left + rect.width / 2 : event.clientX;
    const centerY = rect ? rect.top + rect.height / 2 : event.clientY;
    const currentRotation = settings.designRotationDegrees ?? 0;
    interactionRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScale: settings.designScalePercent ?? 100,
      startOffsetX: settings.designOffsetXPercent ?? 0,
      startOffsetY: settings.designOffsetYPercent ?? 0,
      rotationDelta: mode === 'rotate'
        ? currentRotation - ((Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) / Math.PI)
        : undefined,
    };

    const handleDocumentMove = (pointerEvent: PointerEvent) => {
      if (interactionRef.current?.pointerId !== pointerEvent.pointerId) return;
      const patch = getInteractionPatch(pointerEvent.clientX, pointerEvent.clientY);
      if (patch) updatePlacementDuringInteraction(patch);
    };
    const handleDocumentUp = (pointerEvent: PointerEvent) => {
      if (interactionRef.current?.pointerId !== pointerEvent.pointerId) return;
      document.removeEventListener('pointermove', handleDocumentMove);
      document.removeEventListener('pointerup', handleDocumentUp);
      document.removeEventListener('pointercancel', handleDocumentUp);
      const patch = getInteractionPatch(pointerEvent.clientX, pointerEvent.clientY);
      if (patch) {
        interactionRef.current.lastPatch = patch;
        onSettingsChange({ ...settings, ...patch }, true);
      } else {
        commitInteraction();
      }
      interactionRef.current = null;
    };
    document.addEventListener('pointermove', handleDocumentMove);
    document.addEventListener('pointerup', handleDocumentUp);
    document.addEventListener('pointercancel', handleDocumentUp);
  };
  const handleArtworkPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (interactionRef.current?.pointerId !== event.pointerId) return;
    const patch = getInteractionPatch(event.clientX, event.clientY);
    if (patch) updatePlacementDuringInteraction(patch);
  };

  useEffect(() => {
    setBackgroundChoice(null);
  }, [originalImage]);

  useEffect(() => {
    setSavedSetupAvailable(localStorage.getItem(SAVED_CREATOR_SETUP_KEY) !== null);
  }, []);

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
  const downloadReceipt = lastDownloadReceipt?.productId === selectedProduct.id ? lastDownloadReceipt : null;
  const receiptItem = (id: PrintFileValidationItem['id']) => downloadReceipt?.items.find((item) => item.id === id);
  const receiptDimensions = receiptItem('dimensions');
  const receiptDpi = receiptItem('dpi');
  const receiptFileSize = receiptItem('file-size');
  const receiptColor = receiptItem('color');
  const receiptBackground = receiptItem('background');
  const stateFromReceipt = (state: 'pass' | 'warn' | 'fail' | undefined) =>
    state === 'fail' ? 'stop' : state === 'warn' ? 'caution' : 'ready';

  const checks = [
    {
      label: receiptDimensions?.label ?? `Sized to ${targetWidth} x ${targetHeight}px`,
      detail: receiptDimensions?.detail ?? sizingDetail,
      state: receiptDimensions
        ? stateFromReceipt(receiptDimensions.state)
        : upscaleQuality.level === 'caution' || upscaleQuality.level === 'extreme'
          ? 'caution'
          : 'ready',
    },
    {
      label: receiptDpi?.label ?? `${selectedProduct.dpi} DPI PNG`,
      detail: receiptDpi?.detail ?? (selectedProduct.dpi >= 300
        ? 'Standard Printify raster resolution.'
        : 'Large-format preset uses a lower DPI target.'),
      state: stateFromReceipt(receiptDpi?.state),
    },
    {
      label: receiptColor?.label ?? 'sRGB color',
      detail: receiptColor?.detail ?? 'PNG export stays RGB for Printify upload.',
      state: stateFromReceipt(receiptColor?.state),
    },
    {
      label: receiptBackground?.label ?? (hasTransparency ? 'Transparent background kept' : 'Background kept as uploaded'),
      detail: receiptBackground?.detail ?? (hasTransparency
        ? 'Alpha is preserved in the print file.'
        : backgroundChoice === 'keep'
          ? 'You chose to keep the uploaded background.'
          : 'Choose whether to keep it or open Advanced cleanup.'),
      state: stateFromReceipt(receiptBackground?.state),
    },
    {
      label: receiptFileSize?.label ?? `Under ${MAX_FILE_SIZE_MB} MB PNG limit`,
      detail: receiptFileSize?.detail ?? (simpleExportError
        ?? (simpleExportResult
          ? `${formatBytes(finalFileBytes)} generated. SVG limit is ${MAX_SVG_SIZE_MB} MB.`
          : 'Final file size is checked during download.')),
      state: simpleExportError ? 'stop' : stateFromReceipt(receiptFileSize?.state),
    },
  ];
  const cropSummary = [
    settings.cropLeftPercent ?? 0,
    settings.cropTopPercent ?? 0,
    settings.cropRightPercent ?? 0,
    settings.cropBottomPercent ?? 0,
  ].some((value) => value > 0)
    ? `Cropped ${settings.cropLeftPercent ?? 0}/${settings.cropTopPercent ?? 0}/${settings.cropRightPercent ?? 0}/${settings.cropBottomPercent ?? 0}% from left/top/right/bottom.`
    : 'No crop applied.';
  const adjustmentSummary = [
    settings.adjustmentBrightness ?? 100,
    settings.adjustmentContrast ?? 100,
    settings.adjustmentSaturation ?? 100,
    settings.sharpness,
    settings.adjustmentOpacity ?? 100,
  ].some((value, index) => value !== [100, 100, 100, 0, 100][index])
    ? `Image adjusted: brightness ${settings.adjustmentBrightness ?? 100}%, contrast ${settings.adjustmentContrast ?? 100}%, saturation ${settings.adjustmentSaturation ?? 100}%, sharpness ${settings.sharpness}, opacity ${settings.adjustmentOpacity ?? 100}%.`
    : 'No image adjustments applied.';
  const backgroundSummary = settings.preserveTransparency
    ? 'Transparent background.'
    : `${settings.canvasBackground === 'black' ? 'Black' : 'White'} background.`;
  const exportSummary = [
    `${targetWidth} x ${targetHeight}px at ${selectedProduct.dpi} DPI.`,
    backgroundSummary,
    cropSummary,
    adjustmentSummary,
    sizingDetail,
  ];

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-slate-950 px-3 py-3 text-slate-200 sm:px-4 sm:py-5 lg:px-6">
      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[minmax(0,1.1fr)_420px] lg:gap-5">
        <section className="min-h-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-3 py-3 sm:px-4">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">Printify file</p>
              <h1 className="truncate text-lg font-black text-white">{sourceName}</h1>
            </div>
            <div className="flex flex-none flex-wrap items-center gap-2">
              <button type="button" onClick={onUndo} disabled={!canUndo} className="min-h-10 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600">
                Undo
              </button>
              <button type="button" onClick={onRedo} disabled={!canRedo} className="min-h-10 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600">
                Redo
              </button>
              <button type="button" onClick={onAdvancedMode} className="min-h-10 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:border-slate-500 hover:text-white">
                Advanced
              </button>
            </div>
          </div>
          <div className="grid gap-4 p-3 sm:p-4 xl:grid-cols-[minmax(0,1fr)_260px]">
            <div className="relative flex min-h-[360px] items-center justify-center overflow-hidden rounded-lg bg-slate-950/80 p-3 sm:min-h-[420px] sm:p-4">
              <div className="absolute left-3 top-3 z-10 grid grid-cols-2 overflow-hidden rounded-lg border border-slate-700 bg-slate-950/90 text-[11px] font-black">
                <button
                  type="button"
                  onClick={() => setPreviewMode('edit')}
                  className={`px-3 py-2 ${previewMode === 'edit' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  Original
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode('print')}
                  disabled={!processedResult}
                  className={`px-3 py-2 ${previewMode === 'print' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white disabled:text-slate-600'}`}
                >
                  Print file
                </button>
              </div>
              <div
                ref={previewCanvasRef}
                aria-label="Interactive print placement preview"
                className={`relative max-h-[62dvh] w-full max-w-[520px] overflow-hidden rounded-md border border-slate-700/80 shadow-2xl sm:max-h-[68dvh] ${previewBackgroundClass}`}
                style={{ aspectRatio: `${targetWidth} / ${targetHeight}` }}
                onPointerMove={handleArtworkPointerMove}
              >
                {!mockupUrl && !showingPrintPreview && (
                  <>
                    <div className="pointer-events-none absolute inset-[6%] rounded border border-emerald-300/35" />
                    <div className="pointer-events-none absolute left-1/2 top-0 h-full w-px bg-emerald-300/25" />
                    <div className="pointer-events-none absolute left-0 top-1/2 h-px w-full bg-emerald-300/25" />
                    <div className="pointer-events-none absolute rounded border-2 border-dashed border-amber-300/60 bg-amber-300/5" style={cropInsetStyle} />
                    <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-slate-950/80 px-2 py-1 text-[10px] font-black text-emerald-200">
                      SAFE AREA
                    </div>
                  </>
                )}
                <div
                  role="slider"
                  aria-label="Drag artwork position"
                  aria-valuetext={`X ${settings.designOffsetXPercent ?? 0} percent, Y ${settings.designOffsetYPercent ?? 0} percent`}
                  tabIndex={0}
                  onPointerDown={(event) => handleArtworkPointerDown(event, 'move')}
                  className={mockupUrl
                    ? 'absolute inset-0 cursor-default'
                    : showingPrintPreview
                      ? 'absolute cursor-default'
                    : 'absolute cursor-move touch-none outline-none focus-visible:ring-2 focus-visible:ring-indigo-300'}
                  style={mockupUrl ? undefined : artworkStyle}
                >
                  <img
                    src={previewImageUrl}
                    alt={mockupUrl ? `${selectedProduct.label} mockup preview` : 'Selected artwork preview'}
                    draggable={false}
                    style={artworkFilter}
                    className={mockupUrl || showingPrintPreview ? 'h-full w-full object-contain' : 'h-full w-full select-none object-contain'}
                  />
                  {!mockupUrl && !showingPrintPreview && (
                    <>
                      <span className="pointer-events-none absolute inset-0 border-2 border-indigo-300/80" />
                    </>
                  )}
                </div>
                {!mockupUrl && !showingPrintPreview && (
                  <>
                    <button
                      type="button"
                      aria-label="Resize artwork"
                      onPointerDown={(event) => handleArtworkPointerDown(event, 'resize')}
                      onPointerMove={handleArtworkPointerMove}
                      className="absolute bottom-3 right-3 h-10 w-10 cursor-nwse-resize rounded-full border-2 border-slate-950 bg-indigo-300 shadow sm:h-8 sm:w-8"
                    />
                    <button
                      type="button"
                      aria-label="Turn artwork handle"
                      onPointerDown={(event) => handleArtworkPointerDown(event, 'rotate')}
                      onPointerMove={handleArtworkPointerMove}
                      className="absolute left-1/2 top-3 h-10 w-10 -translate-x-1/2 cursor-grab rounded-full border-2 border-slate-950 bg-emerald-300 shadow sm:h-8 sm:w-8"
                    />
                  </>
                )}
              </div>
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
              <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                <h2 className="text-sm font-black text-white">Creator presets</h2>
                <div className="mt-3 grid gap-2">
                  {[
                    { id: 'transparent-logo' as const, label: 'Sticker logo' },
                    { id: 'photo-tee' as const, label: 'Photo tee' },
                    { id: 'bold-merch' as const, label: 'Bold merch' },
                    { id: 'poster-art' as const, label: 'Poster art' },
                  ].map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyCreatorPreset(preset.id)}
                      className="min-h-10 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-left text-xs font-black text-slate-300 hover:border-slate-600 hover:text-white"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
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
                    onClick={() => applyPlacementPreset('fit')}
                    className={`rounded-lg border px-3 py-2 text-xs font-black ${settings.resizeMode === ResizeMode.FIT ? 'border-indigo-400 bg-indigo-500/15 text-white' : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-600 hover:text-white'}`}
                  >
                    Fit entire design
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPlacementPreset('fill')}
                    className={`rounded-lg border px-3 py-2 text-xs font-black ${settings.resizeMode === ResizeMode.COVER ? 'border-indigo-400 bg-indigo-500/15 text-white' : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-600 hover:text-white'}`}
                  >
                    Fill print area
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
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <button
                    type="button"
                    onClick={() => applyPlacementPreset('center')}
                    className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs font-bold text-slate-300 hover:border-slate-600 hover:text-white"
                  >
                    Center
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPlacementPreset('top-chest')}
                    className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs font-bold text-slate-300 hover:border-slate-600 hover:text-white"
                  >
                    Top chest
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPlacementPreset('full-front')}
                    className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs font-bold text-slate-300 hover:border-slate-600 hover:text-white"
                  >
                    Full front
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSetting('designOffsetYPercent', 25)}
                    className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs font-bold text-slate-300 hover:border-slate-600 hover:text-white"
                  >
                    Lower
                  </button>
                </div>
                <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-black text-white">Crop</h2>
                    <div className="flex gap-2">
                      <button type="button" onClick={trimEdges} className="rounded-md border border-slate-700 px-2 py-1 text-[11px] font-bold text-slate-300 hover:border-slate-500 hover:text-white">
                        Trim edges
                      </button>
                      <button type="button" onClick={resetCrop} className="rounded-md border border-slate-700 px-2 py-1 text-[11px] font-bold text-slate-300 hover:border-slate-500 hover:text-white">
                        Reset crop
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-4">
                    {[
                      ['Crop left', 'cropLeftPercent'],
                      ['Crop top', 'cropTopPercent'],
                      ['Crop right', 'cropRightPercent'],
                      ['Crop bottom', 'cropBottomPercent'],
                    ].map(([label, key]) => (
                      <label key={key} className="block">
                        <span className="text-[11px] font-black text-slate-300">{label}</span>
                        <input
                          aria-label={label}
                          type="number"
                          min={0}
                          max={45}
                          step={1}
                          value={Number(settings[key as keyof ProcessingSettings] ?? 0)}
                          onChange={(event) => updateSetting(key as keyof ProcessingSettings, Number(event.target.value) as never, false)}
                          onBlur={(event) => updateSetting(key as keyof ProcessingSettings, Number(event.currentTarget.value) as never)}
                          className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm font-bold text-white outline-none focus:border-indigo-400"
                        />
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-black text-white">Image</h2>
                    <button type="button" onClick={resetAdjustments} className="rounded-md border border-slate-700 px-2 py-1 text-[11px] font-bold text-slate-300 hover:border-slate-500 hover:text-white">
                      Reset image
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-5">
                    {[
                      ['Brightness', 'adjustmentBrightness', 0, 200],
                      ['Contrast', 'adjustmentContrast', 0, 200],
                      ['Saturation', 'adjustmentSaturation', 0, 200],
                      ['Sharpness', 'sharpness', 0, 100],
                      ['Opacity', 'adjustmentOpacity', 0, 100],
                    ].map(([label, key, minimum, maximum]) => (
                      <label key={key} className="block">
                        <span className="text-[11px] font-black text-slate-300">{label}</span>
                        <input
                          aria-label={String(label)}
                          type="number"
                          min={Number(minimum)}
                          max={Number(maximum)}
                          step={1}
                          value={Number(settings[key as keyof ProcessingSettings] ?? (key === 'sharpness' ? 0 : 100))}
                          onChange={(event) => updateSetting(key as keyof ProcessingSettings, Number(event.target.value) as never, false)}
                          onBlur={(event) => updateSetting(key as keyof ProcessingSettings, Number(event.currentTarget.value) as never)}
                          className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm font-bold text-white outline-none focus:border-indigo-400"
                        />
                      </label>
                    ))}
                  </div>
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
                <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <h2 className="text-sm font-black text-white">Reusable setup</h2>
                  <div className="mt-3 grid gap-2">
                    <button
                      type="button"
                      onClick={saveCreatorSetup}
                      className="min-h-10 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-left text-xs font-black text-slate-300 hover:border-slate-600 hover:text-white"
                    >
                      Save this setup
                    </button>
                    <button
                      type="button"
                      onClick={applySavedCreatorSetup}
                      disabled={!savedSetupAvailable}
                      className="min-h-10 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-left text-xs font-black text-slate-300 hover:border-slate-600 hover:text-white disabled:cursor-not-allowed disabled:text-slate-600"
                    >
                      Apply saved setup
                    </button>
                  </div>
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

          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <p className="text-xs font-black text-white">Export summary</p>
            <div className="mt-2 space-y-1">
              {exportSummary.map((item) => (
                <p key={item} className="text-[11px] leading-relaxed text-slate-400">{item}</p>
              ))}
            </div>
          </div>

          {downloadReceipt && (
            <div className={`mt-4 rounded-lg border p-3 ${downloadReceipt.readyForUpload ? 'border-emerald-500/30 bg-emerald-950/20' : 'border-amber-500/30 bg-amber-950/20'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black text-white">Downloaded file</p>
                  <p className="mt-1 break-all text-[11px] leading-relaxed text-slate-400">{downloadReceipt.filename}</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-[10px] font-black ${downloadReceipt.readyForUpload ? 'bg-emerald-400 text-slate-950' : 'bg-amber-300 text-slate-950'}`}>
                  {downloadReceipt.readyForUpload ? 'READY' : 'CHECK'}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-md bg-slate-950/60 p-2">
                  <p className="font-black text-slate-300">Size</p>
                  <p className="mt-1 text-slate-500">{downloadReceipt.metadata.width} x {downloadReceipt.metadata.height} px</p>
                </div>
                <div className="rounded-md bg-slate-950/60 p-2">
                  <p className="font-black text-slate-300">DPI</p>
                  <p className="mt-1 text-slate-500">{downloadReceipt.metadata.dpi ? `${downloadReceipt.metadata.dpi[0]} x ${downloadReceipt.metadata.dpi[1]}` : 'Missing'}</p>
                </div>
                <div className="rounded-md bg-slate-950/60 p-2">
                  <p className="font-black text-slate-300">File</p>
                  <p className="mt-1 text-slate-500">{formatBytes(downloadReceipt.metadata.byteLength)}</p>
                </div>
                <div className="rounded-md bg-slate-950/60 p-2">
                  <p className="font-black text-slate-300">Color</p>
                  <p className="mt-1 text-slate-500">{downloadReceipt.metadata.colorLabel}</p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <p className="text-xs font-black text-white">Printify upload checklist</p>
            <div className="mt-2 space-y-2">
              {[
                downloadReceipt ? 'Upload the downloaded PNG, not the browser preview.' : 'Download the print file to validate the final PNG.',
                `${selectedProduct.shortLabel} preset targets ${selectedProduct.validation.product} with ${selectedProduct.validation.provider}.`,
                'If Printify shows a provider-specific warning, try the same product with Printify Choice or choose the closest matching preset here.',
              ].map((item) => (
                <div key={item} className="flex gap-2 text-[11px] leading-relaxed text-slate-400">
                  <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-emerald-400" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

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
