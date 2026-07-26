import { Upload } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useDecodedEditorImages } from '../../editor/decodedImages';
import {
  createCompareSelection,
  normalizeCompareZoom,
  reconcileCompareSelection,
  type CompareBackground,
} from '../../editor/compareState';
import {
  canRedoActiveVariation,
  canUndoActiveVariation,
  getActiveVariation,
  getSelectedLayer,
} from '../../editor/history';
import type { EditorCommand } from '../../editor/history';
import {
  LookRenderCoordinator,
  createBrowserLookWorker,
} from '../../editor/lookRenderCoordinator';
import {
  BackgroundRemovalCoordinator,
  createBrowserBackgroundRemovalWorker,
} from '../../editor/backgroundRemovalCoordinator';
import {
  TraceCoordinator,
  createBrowserTraceWorker,
} from '../../editor/traceCoordinator';
import { createDefaultLook } from '../../editor/lookModel';
import {
  createTextLayer,
  type DesignLayer,
  type EditorTool,
  type ImageLayer,
  type TextLayer,
} from '../../editor/model';
import { getTShirtMockup } from '../../editor/productCatalog';
import { findTShirtProduct, type ProductPreviewMode } from '../../editor/productModel';
import { useEditorWorkspace } from '../../editor/useEditorWorkspace';
import { EditorCanvas } from './EditorCanvas';
import { CompareBoard } from './CompareBoard';
import { EditorInspector } from './EditorInspector';
import { LayerDrawer, LayerPanel } from './LayerPanel';
import { EditorToolbar } from './EditorToolbar';
import { EditorTopBar } from './EditorTopBar';
import { ProjectDrawer } from './ProjectDrawer';
import type { BackgroundBrushMode } from './BackgroundRemovalInspector';
import { useBackgroundRemovalWorkflow } from './useBackgroundRemovalWorkflow';
import { useTraceWorkflow } from './useTraceWorkflow';
import { useResolutionWorkflow } from './useResolutionWorkflow';
import { ExportMenu } from './ExportMenu';
import { ProductCanvas } from './ProductCanvas';
import { useProductMockup } from './useProductMockup';
import { ProductExportDialog } from './ProductExportDialog';
import { CanvasBeforeAfter } from './CanvasBeforeAfter';

const isTextControl = (target: EventTarget | null) =>
  target instanceof HTMLElement && Boolean(target.closest('input, select, textarea'));

export const openProjectFromDrawer = async (
  projectId: string,
  openProject: (projectId: string) => Promise<boolean>,
  closeDrawer: () => void,
) => {
  const opened = await openProject(projectId);
  if (opened) closeDrawer();
  return opened;
};

export const selectLayerFromPanel = (
  layer: DesignLayer,
  dispatch: (command: EditorCommand) => void,
) => {
  dispatch({ type: 'select-layer', layerId: layer.id });
};

export const addTextLayerFromPanel = (
  dispatch: (command: EditorCommand) => void,
  closeMobileDrawer: () => void,
): TextLayer => {
  const layer = createTextLayer('Text');
  dispatch({ type: 'add-text-layer', layer });
  dispatch({ type: 'select-layer', layerId: layer.id });
  closeMobileDrawer();
  return layer;
};

export const normalizeToolForSelectedLayer = (
  tool: EditorTool,
  layer: Pick<DesignLayer, 'type'> | null,
): EditorTool => (
  layer?.type !== 'image' &&
  (tool === 'crop' || tool === 'adjust' || tool === 'remove-background')
) || (
  layer?.type !== 'image' &&
  layer?.type !== 'trace' &&
  tool === 'trace'
)
  ? 'select'
  : tool;

export interface VariationPreviewScope {
  projectId: string;
  variationIds: string[];
}

export const getVariationPreviewEvictions = (
  previous: VariationPreviewScope | null,
  current: VariationPreviewScope | null,
): string[] => {
  if (!previous) return [];
  if (!current || current.projectId !== previous.projectId) return [...previous.variationIds];
  const currentIds = new Set(current.variationIds);
  return previous.variationIds.filter((variationId) => !currentIds.has(variationId));
};

export const EditorApp = () => {
  const workspace = useEditorWorkspace();
  const imagesById = useDecodedEditorImages(workspace.assetUrlsById);
  const [tool, setTool] = useState<EditorTool>('select');
  const [editorMode, setEditorMode] = useState<'easy' | 'advanced'>('easy');
  const [mobileInspectorExpanded, setMobileInspectorExpanded] = useState(true);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [lookCoordinator, setLookCoordinator] = useState<LookRenderCoordinator | null>(null);
  const [backgroundCoordinator, setBackgroundCoordinator] =
    useState<BackgroundRemovalCoordinator | null>(null);
  const [traceCoordinator, setTraceCoordinator] = useState<TraceCoordinator | null>(null);
  const [backgroundBrushMode, setBackgroundBrushMode] =
    useState<BackgroundBrushMode>('idle');
  const [backgroundBrushSize, setBackgroundBrushSize] = useState(32);
  const [lookError, setLookError] = useState<string | null>(null);
  const [lookRetryGeneration, setLookRetryGeneration] = useState(0);
  const [productArtworkError, setProductArtworkError] = useState<string | null>(null);
  const [productArtworkRetryGeneration, setProductArtworkRetryGeneration] = useState(0);
  const [productPreviewMode, setProductPreviewMode] = useState<ProductPreviewMode>('rgb');
  const [compareOpen, setCompareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [productExportOpen, setProductExportOpen] = useState(false);
  const [compareVariationIds, setCompareVariationIds] = useState<string[]>([]);
  const [compareBackground, setCompareBackground] = useState<CompareBackground>('neutral');
  const [compareZoom, setCompareZoom] = useState(100);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const layerFileInputRef = useRef<HTMLInputElement>(null);
  const layersButtonRef = useRef<HTMLButtonElement>(null);
  const compareButtonRef = useRef<HTMLButtonElement>(null);
  const activeToolButtonRef = useRef<HTMLButtonElement>(null);
  const pendingCompareExitFocusRef = useRef<'compare' | 'tool' | null>(null);
  const desktopLayersPanelRef = useRef<HTMLElement>(null);
  const layerDrawerReturnFocusRef = useRef<HTMLElement>(null);
  const previousPreviewScopeRef = useRef<VariationPreviewScope | null>(null);
  const project = workspace.history?.present ?? null;
  const variation = project ? getActiveVariation(project) : null;
  const selectedLayer = project ? getSelectedLayer(project) : null;
  const selectedLayerId = selectedLayer?.id ?? null;
  const selectedLayerType = selectedLayer?.type ?? null;
  const selectedImageLayer = selectedLayer?.type === 'image' ? selectedLayer : null;
  const selectedTraceLayer = selectedLayer?.type === 'trace' ? selectedLayer : null;
  const traceSourceLayer = selectedImageLayer ?? (
    selectedTraceLayer
      ? variation?.layers.find((candidate): candidate is ImageLayer =>
        candidate.id === selectedTraceLayer.sourceLayerId && candidate.type === 'image') ?? null
      : null
  );
  const projectVariationIds = project?.variations.map(({ id }) => id) ?? [];
  const projectVariationIdKey = projectVariationIds.join('\u0000');
  const product = project && variation
    ? findTShirtProduct(project.productVariants, variation.id)
    : null;
  const requestedProductMockup = product
    ? getTShirtMockup(product.mockupSlug)
    : null;
  const productArtworkVariation = product && project && variation
    ? project.variations.find((candidate) =>
      candidate.id === product.colorVariationIds[product.mockupSlug],
    ) ?? variation
    : variation;
  const productArtworkImageLayer = productArtworkVariation?.layers.find(
    (layer): layer is ImageLayer => layer.type === 'image',
  ) ?? null;
  const productArtworkUrl = productArtworkImageLayer
    ? workspace.assetUrlsById[productArtworkImageLayer.assetId] ?? null
    : null;
  const productMockup = useProductMockup(requestedProductMockup);

  useEffect(() => {
    if (editorMode !== 'easy') return;
    if (compareOpen) setCompareOpen(false);
  }, [compareOpen, editorMode]);

  useEffect(() => {
    const coordinator = new LookRenderCoordinator(createBrowserLookWorker);
    const nextBackgroundCoordinator = new BackgroundRemovalCoordinator(
      createBrowserBackgroundRemovalWorker,
    );
    const nextTraceCoordinator = new TraceCoordinator(createBrowserTraceWorker);
    const disposeOnPageHide = (event: PageTransitionEvent) => {
      if (!event.persisted) {
        coordinator.dispose();
        nextBackgroundCoordinator.dispose();
        nextTraceCoordinator.dispose();
      }
    };
    window.addEventListener('pagehide', disposeOnPageHide);
    setLookCoordinator(coordinator);
    setBackgroundCoordinator(nextBackgroundCoordinator);
    setTraceCoordinator(nextTraceCoordinator);
    return () => {
      window.removeEventListener('pagehide', disposeOnPageHide);
      coordinator.dispose();
      nextBackgroundCoordinator.dispose();
      nextTraceCoordinator.dispose();
    };
  }, []);

  const backgroundRemoval = useBackgroundRemovalWorkflow({
    project,
    variationId: variation?.id ?? null,
    layer: selectedImageLayer,
    assetsById: workspace.assetsById,
    sourceImage: selectedImageLayer
      ? imagesById[selectedImageLayer.assetId] ?? null
      : null,
    coordinator: backgroundCoordinator,
    dispatch: workspace.dispatch,
    commitGeneratedAsset: workspace.commitGeneratedAsset,
  });

  const traceWorkflow = useTraceWorkflow({
    project,
    variationId: variation?.id ?? null,
    sourceLayer: traceSourceLayer,
    traceLayer: selectedTraceLayer,
    assetsById: workspace.assetsById,
    imagesById,
    coordinator: traceCoordinator,
    dispatch: workspace.dispatch,
    commitGeneratedAsset: workspace.commitGeneratedAsset,
  });

  const resolutionWorkflow = useResolutionWorkflow({
    project,
    layer: selectedImageLayer,
    sourceImage: selectedImageLayer ? imagesById[selectedImageLayer.assetId] ?? null : null,
    sourceSize: selectedImageLayer ? workspace.assetsById[selectedImageLayer.assetId] ?? null : null,
    dispatch: workspace.dispatch,
    commitGeneratedAsset: workspace.commitGeneratedAsset,
  });
  const comparisonBeforeVariation = (() => {
    if (!variation) return null;
    if (tool === 'looks') return { ...variation, looks: [] };
    if (
      tool !== 'enhance' ||
      !selectedImageLayer ||
      !resolutionWorkflow.beforeAssetId ||
      !workspace.assetsById[resolutionWorkflow.beforeAssetId]
    ) return null;
    return {
      ...variation,
      layers: variation.layers.map((layer) => (
        layer.id === selectedImageLayer.id && layer.type === 'image'
          ? { ...layer, assetId: resolutionWorkflow.beforeAssetId }
          : layer
      )),
    };
  })();

  useEffect(() => {
    if (!lookCoordinator) return;
    const currentScope: VariationPreviewScope | null = project ? {
      projectId: project.id,
      variationIds: project.variations.map(({ id }) => id),
    } : null;
    for (const variationId of getVariationPreviewEvictions(
      previousPreviewScopeRef.current,
      currentScope,
    )) {
      lookCoordinator.evictVariation(variationId);
    }
    previousPreviewScopeRef.current = currentScope;
  }, [lookCoordinator, project]);

  const openLayers = () => {
    layerDrawerReturnFocusRef.current = layersButtonRef.current;
    setLayersOpen(true);
  };

  const closeLayers = () => {
    layerDrawerReturnFocusRef.current = layersButtonRef.current;
    setLayersOpen(false);
  };

  const closeCompare = ({
    focus = 'compare',
    selectTool = false,
  }: {
    focus?: 'compare' | 'tool' | null;
    selectTool?: boolean;
  } = {}) => {
    pendingCompareExitFocusRef.current = focus;
    setCompareOpen(false);
    if (selectTool) setTool('select');
  };

  const toggleCompare = () => {
    if (compareOpen) {
      closeCompare({ focus: null });
      return;
    }
    if (!project || projectVariationIds.length < 2) return;
    if (tool === 'product') setTool('select');
    const selection = reconcileCompareSelection(
      compareVariationIds,
      projectVariationIds,
      project.activeVariationId,
    );
    setCompareVariationIds(
      selection.length >= 2
        ? selection
        : createCompareSelection(projectVariationIds, project.activeVariationId),
    );
    setLayersOpen(false);
    setCompareOpen(true);
  };

  useEffect(() => {
    if (!compareOpen) return;
    const nextSelection = reconcileCompareSelection(
      compareVariationIds,
      projectVariationIds,
      project?.activeVariationId ?? '',
    );
    if (nextSelection.length < 2) {
      closeCompare({ focus: 'tool' });
      return;
    }
    if (
      nextSelection.length !== compareVariationIds.length ||
      nextSelection.some((id, index) => id !== compareVariationIds[index])
    ) {
      setCompareVariationIds(nextSelection);
    }
  }, [compareOpen, project?.id, project?.activeVariationId, projectVariationIdKey]);

  useEffect(() => {
    if (compareOpen) return;
    const focusTarget = pendingCompareExitFocusRef.current;
    if (!focusTarget) return;
    const control = focusTarget === 'tool'
      ? activeToolButtonRef.current
      : compareButtonRef.current;
    if (!control || control.disabled) return;
    pendingCompareExitFocusRef.current = null;
    control.focus();
  }, [compareOpen, projectVariationIdKey, selectedLayerType, tool]);

  useEffect(() => {
    setTool((current) => normalizeToolForSelectedLayer(
      current,
      selectedLayerType ? { type: selectedLayerType } : null,
    ));
  }, [selectedLayerId, selectedLayerType]);

  useEffect(() => {
    if (tool !== 'remove-background') setBackgroundBrushMode('idle');
  }, [tool]);

  useEffect(() => {
    if (tool !== 'product') return;
    setCompareOpen(false);
    setBackgroundBrushMode('idle');
  }, [tool]);

  useEffect(() => {
    setProductArtworkError(null);
  }, [project?.id, variation?.id]);

  useEffect(() => {
    if (!layersOpen) return undefined;
    const desktopQuery = window.matchMedia('(min-width: 768px)');
    const closeAtDesktopBreakpoint = () => {
      if (!desktopQuery.matches) return;
      layerDrawerReturnFocusRef.current = desktopLayersPanelRef.current;
      setLayersOpen(false);
    };
    closeAtDesktopBreakpoint();
    desktopQuery.addEventListener('change', closeAtDesktopBreakpoint);
    return () => desktopQuery.removeEventListener('change', closeAtDesktopBreakpoint);
  }, [layersOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || isTextControl(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && event.shiftKey) {
        event.preventDefault();
        workspace.dispatch({ type: 'redo' });
      } else if (key === 'z') {
        event.preventDefault();
        workspace.dispatch({ type: 'undo' });
      } else if (key === 'y') {
        event.preventDefault();
        workspace.dispatch({ type: 'redo' });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [workspace.dispatch]);

  const importDroppedFile = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDropActive(false);
    const file = event.dataTransfer.files[0];
    if (file) void workspace.importFile(file);
  };
  const focusedEmptyState = !project && editorMode === 'easy';

  if (!lookCoordinator) {
    return <main className="h-dvh bg-neutral-950" aria-label="Loading editor" />;
  }

  return (
    <main className={`relative grid h-dvh min-w-0 overflow-hidden bg-neutral-950 text-neutral-100 ${
      focusedEmptyState
        ? 'grid-rows-[56px_minmax(0,1fr)]'
        : 'grid-rows-[112px_minmax(0,1fr)] xl:grid-rows-[56px_minmax(0,1fr)]'
    }`}>
      <h1 className="sr-only">InkMaster Studio editor</h1>
      <EditorTopBar
        projectId={project?.id ?? null}
        projectName={project?.name ?? 'Untitled design'}
        activeVariationId={project?.activeVariationId ?? ''}
        variations={project?.variations.map(({ id, name }) => ({ id, name })) ?? []}
        saveStatus={workspace.saveStatus}
        canUndo={canUndoActiveVariation(workspace.history)}
        canRedo={canRedoActiveVariation(workspace.history)}
        canDeleteVariation={Boolean(project && project.variations.length > 1)}
        onProjectNameChange={(name) => workspace.dispatch({ type: 'rename-project', name })}
        onVariationChange={(variationId) => workspace.dispatch({ type: 'select-variation', variationId })}
        onVariationNameChange={(name) => {
          if (variation) workspace.dispatch({ type: 'rename-variation', variationId: variation.id, name });
        }}
        onDuplicateVariation={() => workspace.dispatch({ type: 'duplicate-variation', name: `${variation?.name ?? 'Variation'} copy` })}
        onDeleteVariation={() => {
          if (variation && project && project.variations.length > 1 &&
            window.confirm(`Delete variation "${variation.name}"?`)) {
            workspace.dispatch({ type: 'delete-variation', variationId: variation.id });
          }
        }}
        onUndo={() => workspace.dispatch({ type: 'undo' })}
        onRedo={() => workspace.dispatch({ type: 'redo' })}
        onRetrySave={() => { void workspace.retrySave(); }}
        onImport={() => fileInputRef.current?.click()}
        onOpenProjects={() => setProjectsOpen(true)}
        onExport={() => setExportOpen(true)}
        exportButtonRef={exportButtonRef}
        mode={editorMode}
        onModeChange={setEditorMode}
      />

      <section className={focusedEmptyState
        ? 'grid min-h-0'
        : compareOpen
          ? 'grid min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)_64px] md:grid-cols-[88px_minmax(0,1fr)] md:grid-rows-1'
          : mobileInspectorExpanded
            ? 'grid min-h-0 grid-cols-1 grid-rows-[minmax(160px,1fr)_240px_64px] md:grid-cols-[88px_minmax(0,1fr)_304px] md:grid-rows-1'
            : 'grid min-h-0 grid-cols-1 grid-rows-[minmax(160px,1fr)_56px_64px] md:grid-cols-[88px_minmax(0,1fr)_304px] md:grid-rows-1'}>
        {!focusedEmptyState ? <EditorToolbar
          tool={tool}
          layerType={selectedLayerType}
          hasImageLayer={Boolean(variation?.layers.some((layer) => layer.type === 'image'))}
          hasProject={Boolean(project)}
          onToolChange={(nextTool) => {
            if (nextTool === 'product') {
              setCompareOpen(false);
            }
            const requiresImage = nextTool === 'crop' || nextTool === 'adjust' ||
              nextTool === 'remove-background' || nextTool === 'enhance' || nextTool === 'trace';
            if (requiresImage && selectedLayerType !== 'image' && selectedLayerType !== 'trace') {
              const imageLayer = variation?.layers.find((layer) => layer.type === 'image');
              if (imageLayer) workspace.dispatch({ type: 'select-layer', layerId: imageLayer.id });
            }
            setTool(nextTool);
          }}
          onOpenLayers={openLayers}
          layersButtonRef={layersButtonRef}
          variationCount={projectVariationIds.length}
          compareOpen={compareOpen}
          onToggleCompare={toggleCompare}
          compareButtonRef={compareButtonRef}
          activeToolButtonRef={activeToolButtonRef}
          mode={editorMode}
        /> : null}
        {compareOpen && project ? (
          <CompareBoard
            variations={project.variations}
            selectedVariationIds={compareVariationIds}
            background={compareBackground}
            zoom={compareZoom}
            assetsById={workspace.assetsById}
            imagesById={imagesById}
            coordinator={lookCoordinator}
            onSelectionChange={setCompareVariationIds}
            onBackgroundChange={setCompareBackground}
            onZoomChange={(value) => setCompareZoom(normalizeCompareZoom(value))}
            onEditVariation={(variationId) => {
              workspace.dispatch({ type: 'select-variation', variationId });
              closeCompare({ selectTool: true });
            }}
            onClose={() => closeCompare()}
          />
        ) : (
          <>
            <div
              className={`relative order-1 min-h-0 overflow-hidden md:order-none ${
                tool !== 'product' && dropActive ? 'ring-2 ring-inset ring-emerald-400' : ''
              }`}
              {...(tool === 'product' ? {} : {
                onDragEnter: (event: DragEvent<HTMLDivElement>) => {
                  event.preventDefault();
                  setDropActive(true);
                },
                onDragOver: (event: DragEvent<HTMLDivElement>) => event.preventDefault(),
                onDragLeave: (event: DragEvent<HTMLDivElement>) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false);
                },
                onDrop: importDroppedFile,
              })}
            >
              {tool === 'product' && project && productArtworkVariation && product ? (
                <ProductCanvas
                  projectId={project.id}
                  variation={productArtworkVariation}
                  product={product}
                  previewMode={productPreviewMode}
                  displayedMockup={productMockup.displayedMockup}
                  mockupStatus={productMockup.status}
                  mockupError={productMockup.error}
                  assetsById={workspace.assetsById}
                  imagesById={imagesById}
                  coordinator={lookCoordinator}
                  artworkRetryGeneration={productArtworkRetryGeneration}
                  onArtworkFailureChange={setProductArtworkError}
                  onPlacementChange={(placement, historyGroup) => {
                    workspace.dispatch({ type: 'set-product-placement', placement, historyGroup });
                  }}
                  onPlacementEnd={() => workspace.dispatch({ type: 'end-history-group' })}
                  onRetry={productMockup.retry}
                  onReturnToDesign={() => setTool('select')}
                />
              ) : comparisonBeforeVariation && variation ? (
                <CanvasBeforeAfter
                  before={comparisonBeforeVariation}
                  after={variation}
                  assetsById={workspace.assetsById}
                  imagesById={imagesById}
                  coordinator={lookCoordinator}
                  label={tool === 'enhance' ? 'Resolution enhancement comparison' : 'Finish comparison'}
                />
              ) : (
                <EditorCanvas
                  variation={variation}
                  assetsById={workspace.assetsById}
                  imagesById={imagesById}
                  coordinator={lookCoordinator}
                  lookRetryGeneration={lookRetryGeneration}
                  onLookFailureChange={setLookError}
                  tool={tool}
                  onSelectLayer={(layerId) => workspace.dispatch({ type: 'select-layer', layerId })}
                  onTransformChange={(layerId, transform, historyGroup) => {
                    workspace.dispatch({ type: 'set-transform', layerId, transform, historyGroup });
                  }}
                  onTransformEnd={() => workspace.dispatch({ type: 'end-history-group' })}
                  onCropChange={(layerId, crop, historyGroup) => {
                    workspace.dispatch({ type: 'set-crop', layerId, crop, historyGroup });
                  }}
                  backgroundMode={backgroundBrushMode}
                  backgroundBrushSize={backgroundBrushSize}
                  onPickBackground={backgroundRemoval.pickColor}
                  onCommitBackgroundStroke={backgroundRemoval.commitStroke}
                  onBackgroundModeChange={setBackgroundBrushMode}
                />
              )}
              {!project ? (
                <div className="absolute inset-0 grid place-items-center overflow-y-auto p-4">
                  <div className="w-full max-w-lg text-center">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">
                      {editorMode === 'easy' ? 'Basic workflow' : 'Editor workflow'}
                    </p>
                    <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">Start with your artwork</h2>
                    <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-neutral-400">
                      Import a PNG, JPEG, or WebP file. Your artwork stays in this browser while you prepare it.
                    </p>
                    <button
                      type="button"
                      className="mx-auto mt-6 flex min-h-12 items-center justify-center gap-2 rounded-md bg-emerald-400 px-6 text-sm font-bold text-neutral-950 transition hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload aria-hidden="true" size={18} />
                      Import artwork
                    </button>
                    <ol className="mt-8 grid grid-cols-3 gap-2 border-t border-neutral-800 pt-5 text-left" aria-label="Design workflow">
                      {['Import', 'Prepare', 'Preview and export'].map((step, index) => (
                        <li key={step} className="min-w-0">
                          <span className="block text-xs font-semibold text-emerald-300">{index + 1}</span>
                          <span className="mt-1 block text-xs font-medium text-neutral-300">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              ) : null}
            </div>
            {!focusedEmptyState ? <div className={`order-2 min-h-0 md:order-none md:h-auto ${
              mobileInspectorExpanded ? 'h-60' : 'h-14'
            } ${
              tool === 'product'
                ? ''
                : 'md:grid md:grid-rows-[minmax(180px,320px)_minmax(0,1fr)]'
            }`}>
              {tool !== 'product' ? (
                <LayerPanel
                  className="hidden border-b border-neutral-800 md:flex md:border-l"
                  panelRef={desktopLayersPanelRef}
                  focusable
                  variation={variation}
                  onAddImage={() => layerFileInputRef.current?.click()}
                  onAddText={() => {
                    addTextLayerFromPanel(workspace.dispatch, closeLayers);
                  }}
                  onSelectLayer={(layer) => selectLayerFromPanel(layer, workspace.dispatch)}
                  dispatch={workspace.dispatch}
                />
              ) : null}
              <EditorInspector
                project={project}
                variation={variation}
                layer={selectedLayer}
                tool={tool}
                assetsById={workspace.assetsById}
                imagesById={imagesById}
                coordinator={lookCoordinator}
                lookError={lookError}
                onRetryLook={() => setLookRetryGeneration((current) => current + 1)}
                backgroundRemoval={backgroundRemoval}
                backgroundBrushMode={backgroundBrushMode}
                backgroundBrushSize={backgroundBrushSize}
                onBackgroundBrushModeChange={setBackgroundBrushMode}
                onBackgroundBrushSizeChange={setBackgroundBrushSize}
                onBackgroundDone={() => setBackgroundBrushMode('idle')}
                traceWorkflow={traceWorkflow}
                resolutionWorkflow={resolutionWorkflow}
                product={product}
                productMockupStatus={productMockup.status}
                productMockupError={productMockup.error}
                productArtworkError={productArtworkError}
                productPreviewMode={productPreviewMode}
                onProductPreviewModeChange={setProductPreviewMode}
                productArtworkVariation={productArtworkVariation}
                productArtworkUrl={productArtworkUrl}
                onEnhanceProductArtwork={() => {
                  if (productArtworkVariation && productArtworkVariation.id !== variation?.id) {
                    workspace.dispatch({ type: 'select-variation', variationId: productArtworkVariation.id });
                  }
                  setTool('enhance');
                }}
                onRemoveProductArtworkBackground={() => {
                  if (!productArtworkVariation || !productArtworkImageLayer) return;
                  if (productArtworkVariation.id !== variation?.id) {
                    workspace.dispatch({ type: 'select-variation', variationId: productArtworkVariation.id });
                  }
                  workspace.dispatch({ type: 'select-layer', layerId: productArtworkImageLayer.id });
                  setTool('remove-background');
                }}
                onProductExport={() => setProductExportOpen(true)}
                onRetryProduct={() => {
                  productMockup.retry();
                  setProductArtworkRetryGeneration((current) => current + 1);
                }}
                onReturnToDesign={() => setTool('select')}
                mode={editorMode}
                mobileExpanded={mobileInspectorExpanded}
                onMobileExpandedChange={setMobileInspectorExpanded}
                dispatch={workspace.dispatch}
              />
            </div> : null}
          </>
        )}
      </section>

      <input
        ref={fileInputRef}
        hidden
        type="file"
        aria-label="Import artwork file"
        accept=".png,.jpg,.jpeg,.webp"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void workspace.importFile(file);
          event.currentTarget.value = '';
        }}
      />

      <input
        ref={layerFileInputRef}
        hidden
        type="file"
        aria-label="Add layer image file"
        accept=".png,.jpg,.jpeg,.webp"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void workspace.importLayerFile(file);
          event.currentTarget.value = '';
        }}
      />

      <div
        className={`pointer-events-none absolute left-1/2 top-28 z-30 w-[min(360px,calc(100%-24px))] -translate-x-1/2 border px-3 py-2 text-center text-xs shadow-lg md:top-16 ${workspace.error ? 'border-red-800 bg-red-950 text-red-200' : 'sr-only'}`}
        aria-live="polite"
        role="status"
      >
        {workspace.error}
      </div>

      <ProjectDrawer
        open={projectsOpen}
        projects={workspace.projects}
        onClose={() => setProjectsOpen(false)}
        onOpen={(projectId) => openProjectFromDrawer(
          projectId,
          workspace.openProject,
          () => setProjectsOpen(false),
        )}
        onDelete={workspace.deleteProject}
      />

      <LayerDrawer
        open={layersOpen}
        returnFocusRef={layerDrawerReturnFocusRef}
        variation={variation}
        onClose={closeLayers}
        onAddImage={() => layerFileInputRef.current?.click()}
        onAddText={() => {
          addTextLayerFromPanel(workspace.dispatch, closeLayers);
        }}
        onSelectLayer={(layer) => selectLayerFromPanel(layer, workspace.dispatch)}
        dispatch={workspace.dispatch}
      />

      <ExportMenu open={exportOpen} projectName={project?.name ?? 'Untitled design'} variation={variation} assetsById={workspace.assetsById} returnFocusRef={exportButtonRef} onClose={() => setExportOpen(false)} />
      {project && variation && product ? (
        <ProductExportDialog open={productExportOpen} projectName={project.name} variation={variation} product={product} assetsById={workspace.assetsById} returnFocusRef={exportButtonRef} onClose={() => setProductExportOpen(false)} />
      ) : null}
    </main>
  );
};
