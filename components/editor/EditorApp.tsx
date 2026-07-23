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
  createTextLayer,
  type DesignLayer,
  type EditorTool,
  type TextLayer,
} from '../../editor/model';
import { useEditorWorkspace } from '../../editor/useEditorWorkspace';
import { EditorCanvas } from './EditorCanvas';
import { CompareBoard } from './CompareBoard';
import { EditorInspector } from './EditorInspector';
import { LayerDrawer, LayerPanel } from './LayerPanel';
import { EditorToolbar } from './EditorToolbar';
import { EditorTopBar } from './EditorTopBar';
import { ProjectDrawer } from './ProjectDrawer';

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
): EditorTool => layer?.type === 'text' && (tool === 'crop' || tool === 'adjust') ? 'select' : tool;

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
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [lookCoordinator, setLookCoordinator] = useState<LookRenderCoordinator | null>(null);
  const [lookError, setLookError] = useState<string | null>(null);
  const [lookRetryGeneration, setLookRetryGeneration] = useState(0);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareVariationIds, setCompareVariationIds] = useState<string[]>([]);
  const [compareBackground, setCompareBackground] = useState<CompareBackground>('neutral');
  const [compareZoom, setCompareZoom] = useState(100);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  const projectVariationIds = project?.variations.map(({ id }) => id) ?? [];
  const projectVariationIdKey = projectVariationIds.join('\u0000');

  useEffect(() => {
    const coordinator = new LookRenderCoordinator(createBrowserLookWorker);
    const disposeOnPageHide = (event: PageTransitionEvent) => {
      if (!event.persisted) coordinator.dispose();
    };
    window.addEventListener('pagehide', disposeOnPageHide);
    setLookCoordinator(coordinator);
    return () => {
      window.removeEventListener('pagehide', disposeOnPageHide);
      coordinator.dispose();
    };
  }, []);

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

  if (!lookCoordinator) {
    return <main className="h-dvh bg-neutral-950" aria-label="Loading editor" />;
  }

  return (
    <main className="relative grid h-dvh min-w-0 grid-rows-[96px_minmax(0,1fr)] overflow-hidden bg-neutral-950 text-neutral-100 md:grid-rows-[56px_minmax(0,1fr)]">
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
      />

      <section className={compareOpen
        ? 'grid min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)_64px] md:grid-cols-[52px_minmax(0,1fr)] md:grid-rows-1'
        : 'grid min-h-0 grid-cols-1 grid-rows-[minmax(160px,1fr)_240px_64px] md:grid-cols-[52px_minmax(0,1fr)_280px] md:grid-rows-1'}>
        <EditorToolbar
          tool={tool}
          layerType={selectedLayerType}
          onToolChange={setTool}
          onOpenLayers={openLayers}
          layersButtonRef={layersButtonRef}
          variationCount={projectVariationIds.length}
          compareOpen={compareOpen}
          onToggleCompare={toggleCompare}
          compareButtonRef={compareButtonRef}
          activeToolButtonRef={activeToolButtonRef}
        />
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
              className={`relative order-1 min-h-0 overflow-hidden md:order-none ${dropActive ? 'ring-2 ring-inset ring-emerald-400' : ''}`}
              onDragEnter={(event) => {
                event.preventDefault();
                setDropActive(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false);
              }}
              onDrop={importDroppedFile}
            >
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
              />
              {!project ? (
                <button
                  type="button"
                  className="absolute left-1/2 top-1/2 flex min-h-24 w-[min(240px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-2 border border-dashed border-neutral-600 bg-neutral-900 px-5 text-sm font-medium text-neutral-200 transition hover:border-emerald-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload aria-hidden="true" size={20} />
                  Import artwork
                </button>
              ) : null}
            </div>
            <div className="order-2 h-60 min-h-0 md:order-none md:grid md:h-auto md:grid-rows-[minmax(180px,320px)_minmax(0,1fr)]">
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
                dispatch={workspace.dispatch}
              />
            </div>
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
    </main>
  );
};
