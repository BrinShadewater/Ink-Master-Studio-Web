import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createEditorHistory,
  getSelectedImageLayer,
  reduceEditorHistory,
  type EditorCommand,
  type EditorHistory,
} from './history';
import {
  createEditorAsset,
  createEditorId,
  createEditorProject,
  type EditorAsset,
  type EditorProject,
} from './model';
import {
  deleteEditorProject,
  getEditorAsset,
  getEditorProject,
  listEditorProjects,
  saveEditorAsset,
  saveEditorProject,
} from './projectRepository';

const SUPPORTED_RASTER_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_RASTER_IMPORT_SIZE = 50 * 1024 * 1024;
const IMPORT_CLEANUP_ATTEMPTS = 3;

export type SaveStatus = 'saved' | 'saving' | 'error';

export interface EditorWorkspace {
  history: EditorHistory | null;
  projects: EditorProject[];
  sourceAsset: EditorAsset | null;
  sourceUrl: string | null;
  saveStatus: SaveStatus;
  error: string | null;
  dispatch: (command: EditorCommand) => void;
  importFile: (file: File) => Promise<void>;
  openProject: (projectId: string) => Promise<boolean>;
  deleteProject: (projectId: string) => Promise<void>;
  refreshProjects: () => Promise<void>;
}

export const validateRasterImport = (file: File): string | null => {
  if (!SUPPORTED_RASTER_TYPES.includes(file.type)) return 'Choose a PNG, JPEG, or WebP image.';
  if (file.size > MAX_RASTER_IMPORT_SIZE) return 'Choose an image no larger than 50 MB.';
  return null;
};

export const readRasterDimensions = async (file: File) => {
  const bitmap = await createImageBitmap(file);
  const dimensions = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  if (dimensions.width < 1 || dimensions.height < 1) throw new Error('The image has invalid dimensions.');
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

export interface OpenProjectDependencies {
  getProject: (projectId: string) => Promise<EditorProject | null>;
  getAsset: (assetId: string) => Promise<EditorAsset | null>;
  activate: (project: EditorProject, asset: EditorAsset) => void;
  reportError: (message: string) => void;
}

export const openEditorProjectIfCurrent = async (
  authority: WorkspaceOperationAuthority,
  operation: number,
  projectId: string,
  dependencies: OpenProjectDependencies,
): Promise<boolean> => {
  try {
    const project = await dependencies.getProject(projectId);
    if (!project) throw new Error('Project not found.');
    const sourceAssetId = getSelectedImageLayer(project).assetId;
    const asset = await dependencies.getAsset(sourceAssetId);
    if (!asset) throw new Error('Project source image not found.');

    return applyNavigationIfCurrent(authority, operation, () => dependencies.activate(project, asset));
  } catch (error) {
    if (authority.owns(operation)) dependencies.reportError(getErrorMessage(error));
    return false;
  }
};

export interface ObjectUrlApi {
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
}

export class SourceUrlOwner {
  private url: string | null = null;

  constructor(private readonly api: ObjectUrlApi) {}

  replace(blob: Blob | null) {
    const nextUrl = blob ? this.api.createObjectURL(blob) : null;
    if (this.url) this.api.revokeObjectURL(this.url);
    this.url = nextUrl;
    return this.url;
  }

  dispose() {
    if (!this.url) return;
    this.api.revokeObjectURL(this.url);
    this.url = null;
  }
}

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

export const getAutosaveRetryGeneration = (
  currentGeneration: number,
  activeProjectId: string | null,
  targetProjectId: string,
) => activeProjectId === targetProjectId ? currentGeneration + 1 : currentGeneration;

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

export const useEditorWorkspace = (): EditorWorkspace => {
  const [history, setHistory] = useState<EditorHistory | null>(null);
  const [projects, setProjects] = useState<EditorProject[]>([]);
  const [sourceAsset, setSourceAsset] = useState<EditorAsset | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [error, setError] = useState<string | null>(null);
  const [saveRetryGeneration, setSaveRetryGeneration] = useState(0);
  const authorityRef = useRef(new WorkspaceOperationAuthority());
  const persistenceRef = useRef(new WorkspacePersistenceController());
  const sourceUrlOwnerRef = useRef<SourceUrlOwner | null>(null);
  const activeProjectIdRef = useRef<string | null>(null);
  const latestRevisionRef = useRef<string | null>(null);
  const refreshGenerationRef = useRef(0);
  const mountedRef = useRef(true);

  if (!sourceUrlOwnerRef.current) sourceUrlOwnerRef.current = new SourceUrlOwner(URL);

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
    };
  }, []);

  useEffect(() => {
    const nextUrl = sourceUrlOwnerRef.current!.replace(sourceAsset?.blob ?? null);
    setSourceUrl((current) => current === nextUrl ? current : nextUrl);
  }, [sourceAsset]);

  useEffect(() => () => {
    sourceUrlOwnerRef.current?.dispose();
  }, []);

  const replaceWorkspace = useCallback((project: EditorProject, asset: EditorAsset) => {
    activeProjectIdRef.current = project.id;
    latestRevisionRef.current = `${project.id}:${project.updatedAt}`;
    setHistory(createEditorHistory(project));
    setSourceAsset(asset);
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
      if (mountedRef.current && authorityRef.current.owns(operation)) setError(message);
      else if (cleanupFailure) throw cleanupFailure;
      return;
    }

    const applied = await applyImportedProjectIfCurrent(
      authorityRef.current,
      operation,
      () => replaceWorkspace(project, asset),
      () => cleanupImportedProject(projectId, new Error('Import was superseded.'), deleteEditorProject),
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
      getAsset: getEditorAsset,
      activate: replaceWorkspace,
      reportError: (message) => {
        if (mountedRef.current) setError(message);
      },
    });
  }, [replaceWorkspace]);

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

    const clearsCurrentProject = authorityRef.current.owns(operation) && activeProjectIdRef.current === targetProjectId;
    if (mountedRef.current && clearsCurrentProject) {
      activeProjectIdRef.current = null;
      latestRevisionRef.current = null;
      setHistory(null);
      setSourceAsset(null);
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
    sourceAsset,
    sourceUrl,
    saveStatus,
    error,
    dispatch,
    importFile,
    openProject,
    deleteProject,
    refreshProjects,
  };
};
