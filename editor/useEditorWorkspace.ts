import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createEditorHistory,
  reduceEditorHistory,
  type EditorCommand,
  type EditorHistory,
} from './history';
import {
  createEditorAsset,
  createEditorId,
  createEditorProject,
  isImageLayer,
  type EditorAsset,
  type EditorProject,
  type ImageLayer,
} from './model';
import {
  deleteEditorAsset,
  deleteEditorProject,
  getEditorAssetsForProject,
  getEditorProject,
  listEditorProjects,
  saveEditorAsset,
  saveEditorProject,
} from './projectRepository';

const SUPPORTED_RASTER_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_RASTER_IMPORT_SIZE = 50 * 1024 * 1024;
const MAX_RASTER_DIMENSION = 16_384;
const MAX_RASTER_PIXELS = 100_000_000;
const IMPORT_CLEANUP_ATTEMPTS = 3;
const RASTER_DIMENSION_ERROR = 'Choose an image no larger than 16,384 pixels per side or 100 megapixels.';

export const IMPORT_CLEANUP_ERROR = 'Could not clean up the superseded import. Check Local projects.';
export const ADDITIONAL_IMAGE_IMPORT_ERROR = 'Could not add the image to this project.';
export const ADDITIONAL_IMAGE_IMPORT_CLEANUP_ERROR =
  'Could not clean up the failed image import. Reopen the project and try again.';

export type SaveStatus = 'saved' | 'saving' | 'error';

export interface EditorWorkspace {
  history: EditorHistory | null;
  projects: EditorProject[];
  assetsById: Record<string, EditorAsset>;
  assetUrlsById: Record<string, string>;
  saveStatus: SaveStatus;
  error: string | null;
  dispatch: (command: EditorCommand) => void;
  importFile: (file: File) => Promise<void>;
  importLayerFile: (file: File) => Promise<void>;
  openProject: (projectId: string) => Promise<boolean>;
  deleteProject: (projectId: string) => Promise<void>;
  refreshProjects: () => Promise<void>;
  retrySave: () => Promise<void>;
}

export const validateRasterImport = (file: File): string | null => {
  if (!SUPPORTED_RASTER_TYPES.includes(file.type)) return 'Choose a PNG, JPEG, or WebP image.';
  if (file.size > MAX_RASTER_IMPORT_SIZE) return 'Choose an image no larger than 50 MB.';
  return null;
};

export const validateRasterDimensions = ({ width, height }: { width: number; height: number }): string | null => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return 'The image has invalid dimensions.';
  }
  if (width > MAX_RASTER_DIMENSION || height > MAX_RASTER_DIMENSION || width * height > MAX_RASTER_PIXELS) {
    return RASTER_DIMENSION_ERROR;
  }
  return null;
};

export const readRasterDimensions = async (file: File) => {
  const bitmap = await createImageBitmap(file);
  let dimensions: { width: number; height: number };
  try {
    dimensions = { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
  const validationError = validateRasterDimensions(dimensions);
  if (validationError) throw new Error(validationError);
  return dimensions;
};

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Local editor storage failed.';

const projectNameFromFile = (file: File) => file.name.replace(/\.[^/.]+$/, '');

export class WorkspaceOperationAuthority {
  private generation = 0;

  begin() {
    this.generation += 1;
    return this.generation;
  }

  owns(operation: number) {
    return operation === this.generation;
  }

  current() {
    return this.generation;
  }
}

export const applyNavigationIfCurrent = (
  authority: WorkspaceOperationAuthority,
  operation: number,
  apply: () => void,
) => {
  if (!authority.owns(operation)) return false;
  apply();
  return true;
};

export const applyImportedProjectIfCurrent = async (
  authority: WorkspaceOperationAuthority,
  operation: number,
  apply: () => void,
  cleanUpStaleImport: () => Promise<void>,
) => {
  if (applyNavigationIfCurrent(authority, operation, apply)) return true;
  await cleanUpStaleImport();
  return false;
};

export const completeImportedProjectIfCurrent = async (
  authority: WorkspaceOperationAuthority,
  operation: number,
  apply: () => void,
  cleanUpStaleImport: () => Promise<void>,
  refreshProjects: () => Promise<void>,
  reportError: (message: string) => void,
) => {
  try {
    return await applyImportedProjectIfCurrent(authority, operation, apply, cleanUpStaleImport);
  } catch {
    try {
      await refreshProjects();
    } catch {
      // The stable cleanup error remains more actionable than a secondary list refresh failure.
    }
    reportError(IMPORT_CLEANUP_ERROR);
    return false;
  }
};

export interface OpenProjectDependencies {
  getProject: (projectId: string) => Promise<EditorProject | null>;
  getAssetsForProject: (projectId: string) => Promise<EditorAsset[]>;
  activate: (project: EditorProject, assetsById: Record<string, EditorAsset>) => void;
  reportError: (message: string) => void;
}

export const getAssetsByIdForProject = (
  project: EditorProject,
  assets: Iterable<EditorAsset>,
): Record<string, EditorAsset> => {
  const assetsById: Record<string, EditorAsset> = {};
  for (const asset of assets) {
    if (asset.projectId === project.id) assetsById[asset.id] = asset;
  }
  if (!assetsById[project.sourceAssetId]) throw new Error('Project source image not found.');
  for (const variation of project.variations) {
    for (const layer of variation.layers) {
      if (isImageLayer(layer) && !assetsById[layer.assetId]) {
        throw new Error('Project image layer asset not found.');
      }
    }
  }
  return assetsById;
};

export const openEditorProjectIfCurrent = async (
  authority: WorkspaceOperationAuthority,
  operation: number,
  projectId: string,
  dependencies: OpenProjectDependencies,
): Promise<boolean> => {
  try {
    const project = await dependencies.getProject(projectId);
    if (!project) throw new Error('Project not found.');
    const assets = await dependencies.getAssetsForProject(project.id);
    const assetsById = getAssetsByIdForProject(project, assets);

    return applyNavigationIfCurrent(authority, operation, () => dependencies.activate(project, assetsById));
  } catch (error) {
    if (authority.owns(operation)) dependencies.reportError(getErrorMessage(error));
    return false;
  }
};

export interface ObjectUrlApi {
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
}

export class AssetUrlRegistry {
  private urlsByAssetId = new Map<string, string>();

  constructor(private readonly api: ObjectUrlApi) {}

  sync(assets: Iterable<EditorAsset>): Record<string, string> {
    const nextAssets = new Map<string, EditorAsset>();
    for (const asset of assets) nextAssets.set(asset.id, asset);

    for (const [assetId, url] of this.urlsByAssetId) {
      if (nextAssets.has(assetId)) continue;
      this.api.revokeObjectURL(url);
      this.urlsByAssetId.delete(assetId);
    }
    for (const [assetId, asset] of nextAssets) {
      if (!this.urlsByAssetId.has(assetId)) {
        this.urlsByAssetId.set(assetId, this.api.createObjectURL(asset.blob));
      }
    }
    return Object.fromEntries(
      [...nextAssets.keys()].map((assetId) => [assetId, this.urlsByAssetId.get(assetId)!]),
    );
  }

  dispose() {
    for (const url of this.urlsByAssetId.values()) this.api.revokeObjectURL(url);
    this.urlsByAssetId.clear();
  }
}

export const projectReferencesEditorAsset = (project: EditorProject, assetId: string) =>
  project.sourceAssetId === assetId || project.variations.some((variation) =>
    variation.layers.some((layer) => isImageLayer(layer) && layer.assetId === assetId));

export interface WorkspaceAssetReconciliation {
  assetsById: Record<string, EditorAsset>;
  assetUrlsById: Record<string, string>;
}

export const reconcileDeletedWorkspaceAssetIfCurrent = (
  authority: WorkspaceOperationAuthority,
  operation: number,
  activeProjectId: string | null,
  project: EditorProject,
  assetsById: Record<string, EditorAsset>,
  assetId: string,
  registry: AssetUrlRegistry,
): WorkspaceAssetReconciliation | null => {
  if (!authority.owns(operation) || activeProjectId !== project.id ||
    projectReferencesEditorAsset(project, assetId)) return null;
  const nextAssetsById = { ...assetsById };
  delete nextAssetsById[assetId];
  return {
    assetsById: nextAssetsById,
    assetUrlsById: registry.sync(Object.values(nextAssetsById)),
  };
};

export interface DeleteLease {
  projectId: string;
  id: number;
}

export type AutosaveAttempt =
  | { status: 'saved' | 'blocked'; error: null }
  | { status: 'error'; error: string };

export class WorkspacePersistenceController {
  private chain: Promise<void> = Promise.resolve();
  private nextLeaseId = 0;
  private deleteLeases = new Map<string, Set<number>>();
  private deletedProjectIds = new Set<string>();

  beginDelete(projectId: string): DeleteLease {
    const id = this.nextLeaseId + 1;
    this.nextLeaseId = id;
    const leases = this.deleteLeases.get(projectId) ?? new Set<number>();
    leases.add(id);
    this.deleteLeases.set(projectId, leases);
    return { projectId, id };
  }

  private releaseDelete(lease: DeleteLease) {
    const leases = this.deleteLeases.get(lease.projectId);
    if (!leases) return;
    leases.delete(lease.id);
    if (leases.size === 0) this.deleteLeases.delete(lease.projectId);
  }

  isBlocked(projectId: string) {
    return this.deletedProjectIds.has(projectId) || Boolean(this.deleteLeases.get(projectId)?.size);
  }

  enqueueSave(projectId: string, save: () => Promise<void>) {
    const task = this.chain.then(async () => {
      if (this.isBlocked(projectId)) return 'blocked' as const;
      await save();
      return 'saved' as const;
    });
    this.chain = task.then(() => undefined, () => undefined);
    return task;
  }

  enqueueDelete(lease: DeleteLease, remove: () => Promise<void>) {
    const removal = this.chain.then(remove);
    const task = removal.then(
      () => {
        this.deletedProjectIds.add(lease.projectId);
        this.releaseDelete(lease);
      },
      (error: unknown) => {
        this.releaseDelete(lease);
        throw error;
      },
    );
    this.chain = task.then(() => undefined, () => undefined);
    return task;
  }
}

export const runAutosaveAttempt = async (
  persistence: WorkspacePersistenceController,
  projectId: string,
  save: () => Promise<void>,
): Promise<AutosaveAttempt> => {
  try {
    return { status: await persistence.enqueueSave(projectId, save), error: null };
  } catch (error) {
    return { status: 'error', error: getErrorMessage(error) };
  }
};

export interface WorkspaceRevisionDependencies {
  saveProject: (project: EditorProject) => Promise<void>;
  refreshProjects: () => Promise<void>;
}

export const queueWorkspaceRevision = (
  persistence: WorkspacePersistenceController,
  project: EditorProject,
  dependencies: WorkspaceRevisionDependencies,
) => runAutosaveAttempt(persistence, project.id, async () => {
  await dependencies.saveProject(project);
  await dependencies.refreshProjects();
});

export const getAutosaveRetryGeneration = (
  currentGeneration: number,
  activeProjectId: string | null,
  targetProjectId: string,
) => activeProjectId === targetProjectId ? currentGeneration + 1 : currentGeneration;

export const shouldClearWorkspaceAfterDelete = (
  activeProjectId: string | null,
  deletedProjectId: string,
) => activeProjectId === deletedProjectId;

export const cleanupImportedProject = async (
  projectId: string,
  importError: unknown,
  removeProject: (projectId: string) => Promise<void>,
  attempts = IMPORT_CLEANUP_ATTEMPTS,
) => {
  let cleanupError: unknown;
  const maximumAttempts = Math.max(1, Math.floor(attempts));
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    try {
      await removeProject(projectId);
      return;
    } catch (nextError) {
      cleanupError = nextError;
    }
  }
  throw new Error(`Import failed: ${getErrorMessage(importError)} Cleanup failed: ${getErrorMessage(cleanupError)}`);
};

const createImportedImageLayer = (asset: EditorAsset): ImageLayer => ({
  id: createEditorId('layer'),
  type: 'image',
  name: asset.name,
  assetId: asset.id,
  visible: true,
  opacity: 1,
  transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, flipX: false, flipY: false },
  crop: { x: 0, y: 0, width: 1, height: 1 },
  adjustments: { brightness: 0, contrast: 0, saturation: 0 },
});

export interface AdditionalImageImportDependencies {
  getActiveProjectId: () => string | null;
  isProjectActive: (projectId: string) => boolean;
  readDimensions: (file: File) => Promise<{ width: number; height: number }>;
  saveAsset: (asset: EditorAsset) => Promise<unknown>;
  deleteAsset: (assetId: string) => Promise<void>;
  isAssetReferenced?: (asset: EditorAsset) => boolean;
  onAssetDeleted?: (asset: EditorAsset) => void;
  dispatchLayer: (asset: EditorAsset, layer: ImageLayer) => void;
  reportError: (message: string) => void;
}

const cleanupImportedAsset = async (
  assetId: string,
  deleteAsset: (assetId: string) => Promise<void>,
  attempts = IMPORT_CLEANUP_ATTEMPTS,
) => {
  let cleanupError: unknown;
  const maximumAttempts = Math.max(1, Math.floor(attempts));
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    try {
      await deleteAsset(assetId);
      return;
    } catch (nextError) {
      cleanupError = nextError;
    }
  }
  throw cleanupError;
};

export const importAdditionalImageLayer = async (
  file: File,
  dependencies: AdditionalImageImportDependencies,
): Promise<boolean> => {
  const validationError = validateRasterImport(file);
  if (validationError) {
    dependencies.reportError(validationError);
    return false;
  }
  const projectId = dependencies.getActiveProjectId();
  if (!projectId) {
    dependencies.reportError(ADDITIONAL_IMAGE_IMPORT_ERROR);
    return false;
  }

  let persistedAsset: EditorAsset | null = null;
  try {
    const dimensions = await dependencies.readDimensions(file);
    const dimensionError = validateRasterDimensions(dimensions);
    if (dimensionError) {
      dependencies.reportError(dimensionError);
      return false;
    }
    const asset = createEditorAsset(projectId, file, { name: file.name, ...dimensions });
    await dependencies.saveAsset(asset);
    persistedAsset = asset;
    if (!dependencies.isProjectActive(projectId)) throw new Error('The active project changed.');
    dependencies.dispatchLayer(asset, createImportedImageLayer(asset));
    return true;
  } catch {
    if (persistedAsset && !dependencies.isAssetReferenced?.(persistedAsset)) {
      try {
        await cleanupImportedAsset(persistedAsset.id, dependencies.deleteAsset);
      } catch {
        dependencies.reportError(ADDITIONAL_IMAGE_IMPORT_CLEANUP_ERROR);
        return false;
      }
      if (dependencies.isAssetReferenced?.(persistedAsset)) {
        try {
          await dependencies.saveAsset(persistedAsset);
        } catch {
          dependencies.reportError(ADDITIONAL_IMAGE_IMPORT_CLEANUP_ERROR);
          return false;
        }
      } else {
        try {
          dependencies.onAssetDeleted?.(persistedAsset);
        } catch {
          dependencies.reportError(ADDITIONAL_IMAGE_IMPORT_CLEANUP_ERROR);
          return false;
        }
      }
    }
    dependencies.reportError(ADDITIONAL_IMAGE_IMPORT_ERROR);
    return false;
  }
};

export const useEditorWorkspace = (): EditorWorkspace => {
  const [history, setHistory] = useState<EditorHistory | null>(null);
  const [projects, setProjects] = useState<EditorProject[]>([]);
  const [assetsById, setAssetsById] = useState<Record<string, EditorAsset>>({});
  const [assetUrlsById, setAssetUrlsById] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [error, setError] = useState<string | null>(null);
  const [saveRetryGeneration, setSaveRetryGeneration] = useState(0);
  const authorityRef = useRef(new WorkspaceOperationAuthority());
  const persistenceRef = useRef(new WorkspacePersistenceController());
  const assetUrlRegistryRef = useRef<AssetUrlRegistry | null>(null);
  const assetsByIdRef = useRef<Record<string, EditorAsset>>({});
  const activeProjectIdRef = useRef<string | null>(null);
  const latestRevisionRef = useRef<string | null>(null);
  const historyRef = useRef<EditorHistory | null>(null);
  const refreshGenerationRef = useRef(0);
  const mountedRef = useRef(true);

  historyRef.current = history;

  if (!assetUrlRegistryRef.current) assetUrlRegistryRef.current = new AssetUrlRegistry(URL);

  const refreshProjects = useCallback(async () => {
    const refreshGeneration = refreshGenerationRef.current + 1;
    refreshGenerationRef.current = refreshGeneration;
    const nextProjects = await listEditorProjects();
    if (mountedRef.current && refreshGenerationRef.current === refreshGeneration) setProjects(nextProjects);
  }, []);

  useEffect(() => {
    const operation = authorityRef.current.begin();
    void refreshProjects().catch((nextError: unknown) => {
      if (mountedRef.current && authorityRef.current.owns(operation)) setError(getErrorMessage(nextError));
    });
  }, [refreshProjects]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      authorityRef.current.begin();
      assetUrlRegistryRef.current?.dispose();
    };
  }, []);

  const replaceWorkspace = useCallback((
    project: EditorProject,
    nextAssetsById: Record<string, EditorAsset>,
  ) => {
    const nextAssetUrlsById = assetUrlRegistryRef.current!.sync(Object.values(nextAssetsById));
    activeProjectIdRef.current = project.id;
    latestRevisionRef.current = `${project.id}:${project.updatedAt}`;
    const nextHistory = createEditorHistory(project);
    historyRef.current = nextHistory;
    assetsByIdRef.current = nextAssetsById;
    setHistory(nextHistory);
    setAssetsById(nextAssetsById);
    setAssetUrlsById(nextAssetUrlsById);
    setSaveStatus('saved');
    setError(null);
  }, []);

  const dispatch = useCallback((command: EditorCommand) => {
    setHistory((current) => {
      const next = current ? reduceEditorHistory(current, command) : current;
      if (next) {
        activeProjectIdRef.current = next.present.id;
        latestRevisionRef.current = `${next.present.id}:${next.present.updatedAt}`;
      }
      historyRef.current = next;
      return next;
    });
  }, []);

  const importFile = useCallback(async (file: File) => {
    const operation = authorityRef.current.begin();
    const validationError = validateRasterImport(file);
    if (validationError) {
      if (mountedRef.current && authorityRef.current.owns(operation)) setError(validationError);
      return;
    }

    const projectId = createEditorId('project');
    let assetSaved = false;
    let asset: EditorAsset;
    let project: EditorProject;
    try {
      const dimensions = await readRasterDimensions(file);
      asset = createEditorAsset(projectId, file, { name: file.name, ...dimensions });
      project = createEditorProject(projectNameFromFile(file), asset);
      await saveEditorAsset(asset);
      assetSaved = true;
      await saveEditorProject(project);
    } catch (nextError) {
      let message = getErrorMessage(nextError);
      let cleanupFailure: Error | null = null;
      if (assetSaved) {
        try {
          await cleanupImportedProject(projectId, nextError, deleteEditorProject);
        } catch (cleanupError) {
          cleanupFailure = cleanupError instanceof Error ? cleanupError : new Error(getErrorMessage(cleanupError));
          message = cleanupFailure.message;
        }
      }
      if (cleanupFailure) {
        try {
          await refreshProjects();
        } catch {
          // Keep the cleanup failure stable even when project-list refresh also fails.
        }
        if (mountedRef.current) setError(IMPORT_CLEANUP_ERROR);
      } else if (mountedRef.current && authorityRef.current.owns(operation)) {
        setError(message);
      }
      return;
    }

    const applied = await completeImportedProjectIfCurrent(
      authorityRef.current,
      operation,
      () => replaceWorkspace(project, getAssetsByIdForProject(project, [asset])),
      () => cleanupImportedProject(projectId, new Error('Import was superseded.'), deleteEditorProject),
      refreshProjects,
      (message) => {
        if (mountedRef.current) setError(message);
      },
    );
    if (!applied) return;
    try {
      await refreshProjects();
    } catch (nextError) {
      if (mountedRef.current && authorityRef.current.owns(operation)) setError(getErrorMessage(nextError));
    }
  }, [refreshProjects, replaceWorkspace]);

  const openProject = useCallback(async (projectId: string) => {
    const operation = authorityRef.current.begin();
    return openEditorProjectIfCurrent(authorityRef.current, operation, projectId, {
      getProject: getEditorProject,
      getAssetsForProject: getEditorAssetsForProject,
      activate: replaceWorkspace,
      reportError: (message) => {
        if (mountedRef.current) setError(message);
      },
    });
  }, [replaceWorkspace]);

  const importLayerFile = useCallback(async (file: File) => {
    const operation = authorityRef.current.current();
    await importAdditionalImageLayer(file, {
      getActiveProjectId: () => activeProjectIdRef.current,
      isProjectActive: (projectId) => mountedRef.current &&
        authorityRef.current.owns(operation) &&
        activeProjectIdRef.current === projectId &&
        !persistenceRef.current.isBlocked(projectId),
      readDimensions: readRasterDimensions,
      saveAsset: saveEditorAsset,
      deleteAsset: deleteEditorAsset,
      isAssetReferenced: (asset) => {
        const currentProject = historyRef.current?.present;
        return Boolean(currentProject && currentProject.id === asset.projectId &&
          projectReferencesEditorAsset(currentProject, asset.id));
      },
      onAssetDeleted: (asset) => {
        if (!mountedRef.current || activeProjectIdRef.current !== asset.projectId) return;
        const reconciliationOperation = authorityRef.current.current();
        const currentProject = historyRef.current?.present;
        if (!currentProject) return;
        const reconciled = reconcileDeletedWorkspaceAssetIfCurrent(
          authorityRef.current,
          reconciliationOperation,
          activeProjectIdRef.current,
          currentProject,
          assetsByIdRef.current,
          asset.id,
          assetUrlRegistryRef.current!,
        );
        if (!reconciled) return;
        assetsByIdRef.current = reconciled.assetsById;
        setAssetsById(reconciled.assetsById);
        setAssetUrlsById(reconciled.assetUrlsById);
      },
      dispatchLayer: (asset, layer) => {
        const current = historyRef.current;
        if (!current || current.present.id !== asset.projectId ||
          !authorityRef.current.owns(operation) || persistenceRef.current.isBlocked(asset.projectId)) {
          throw new Error('The active project changed.');
        }
        const next = reduceEditorHistory(current, { type: 'add-image-layer', layer });
        if (next === current) throw new Error('The image layer was not added.');
        const nextAssetsById = { ...assetsByIdRef.current, [asset.id]: asset };
        const nextAssetUrlsById = assetUrlRegistryRef.current!.sync(Object.values(nextAssetsById));
        assetsByIdRef.current = nextAssetsById;
        historyRef.current = next;
        activeProjectIdRef.current = next.present.id;
        latestRevisionRef.current = `${next.present.id}:${next.present.updatedAt}`;
        setAssetsById(nextAssetsById);
        setAssetUrlsById(nextAssetUrlsById);
        setHistory(next);
        setError(null);
      },
      reportError: (message) => {
        if (mountedRef.current) setError(message);
      },
    });
  }, []);

  const deleteProject = useCallback(async (projectId: string) => {
    const targetProjectId = projectId;
    const operation = authorityRef.current.begin();
    const persistence = persistenceRef.current;
    const deleteLease = persistence.beginDelete(targetProjectId);
    const deletion = persistence.enqueueDelete(deleteLease, () => deleteEditorProject(targetProjectId));
    try {
      await deletion;
    } catch (nextError) {
      if (mountedRef.current && activeProjectIdRef.current === targetProjectId) {
        setSaveRetryGeneration((current) => getAutosaveRetryGeneration(current, activeProjectIdRef.current, targetProjectId));
      }
      if (mountedRef.current && authorityRef.current.owns(operation)) setError(getErrorMessage(nextError));
      return;
    }

    const clearsCurrentProject = shouldClearWorkspaceAfterDelete(activeProjectIdRef.current, targetProjectId);
    if (mountedRef.current && clearsCurrentProject) {
      activeProjectIdRef.current = null;
      latestRevisionRef.current = null;
      historyRef.current = null;
      assetsByIdRef.current = {};
      const nextAssetUrlsById = assetUrlRegistryRef.current!.sync([]);
      setHistory(null);
      setAssetsById({});
      setAssetUrlsById(nextAssetUrlsById);
      setSaveStatus('saved');
      setError(null);
    }
    try {
      await refreshProjects();
    } catch (nextError) {
      if (mountedRef.current && authorityRef.current.owns(operation)) setError(getErrorMessage(nextError));
    }
  }, [refreshProjects]);

  const historyRevision = history ? `${history.present.id}:${history.present.updatedAt}` : null;

  const retrySave = useCallback(async () => {
    const currentHistory = historyRef.current;
    if (!currentHistory) return;
    const project = structuredClone(currentHistory.present);
    const revision = `${project.id}:${project.updatedAt}`;
    if (persistenceRef.current.isBlocked(project.id)) return;
    latestRevisionRef.current = revision;
    if (mountedRef.current) {
      setSaveStatus('saving');
      setError(null);
    }
    const result = await queueWorkspaceRevision(persistenceRef.current, project, {
      saveProject: async (nextProject) => { await saveEditorProject(nextProject); },
      refreshProjects,
    });
    if (!mountedRef.current || latestRevisionRef.current !== revision ||
      persistenceRef.current.isBlocked(project.id)) return;
    if (result.status === 'saved') setSaveStatus('saved');
    if (result.status === 'error') {
      setSaveStatus('error');
      setError(result.error);
    }
  }, [refreshProjects]);

  useEffect(() => {
    if (!history || !historyRevision || persistenceRef.current.isBlocked(history.present.id)) return;
    latestRevisionRef.current = historyRevision;
    const project = history.present;
    const timeout = window.setTimeout(() => {
      if (!mountedRef.current || latestRevisionRef.current !== historyRevision ||
        persistenceRef.current.isBlocked(project.id)) return;
      setSaveStatus('saving');
      setError(null);
      void runAutosaveAttempt(persistenceRef.current, project.id, async () => {
        await saveEditorProject(project);
        await refreshProjects();
      }).then((result) => {
        if (mountedRef.current && latestRevisionRef.current === historyRevision &&
          !persistenceRef.current.isBlocked(project.id) && result.status === 'saved') setSaveStatus('saved');
        if (mountedRef.current && latestRevisionRef.current === historyRevision &&
          !persistenceRef.current.isBlocked(project.id) && result.status === 'error') {
          setSaveStatus('error');
          setError(result.error);
        }
      });
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [history, historyRevision, refreshProjects, saveRetryGeneration]);

  return {
    history,
    projects,
    assetsById,
    assetUrlsById,
    saveStatus,
    error,
    dispatch,
    importFile,
    importLayerFile,
    openProject,
    deleteProject,
    refreshProjects,
    retrySave,
  };
};
