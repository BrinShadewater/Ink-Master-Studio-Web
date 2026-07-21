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
  openProject: (projectId: string) => Promise<void>;
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

export class WorkspacePersistenceController {
  private chain: Promise<void> = Promise.resolve();
  private excludedProjectIds = new Set<string>();

  exclude(projectId: string) {
    this.excludedProjectIds.add(projectId);
  }

  allow(projectId: string) {
    this.excludedProjectIds.delete(projectId);
  }

  isExcluded(projectId: string) {
    return this.excludedProjectIds.has(projectId);
  }

  enqueueSave(projectId: string, save: () => Promise<void>) {
    const task = this.chain.then(async () => {
      if (this.isExcluded(projectId)) return;
      await save();
    });
    this.chain = task.catch(() => undefined);
    return task;
  }

  enqueueDelete(projectId: string, remove: () => Promise<void>) {
    this.exclude(projectId);
    const task = this.chain.then(remove);
    this.chain = task.catch(() => undefined);
    return task;
  }
}

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
    try {
      const project = await getEditorProject(projectId);
      if (!project) throw new Error('Project not found.');
      const sourceAssetId = getSelectedImageLayer(project).assetId;
      const asset = await getEditorAsset(sourceAssetId);
      if (!asset) throw new Error('Project source image not found.');

      applyNavigationIfCurrent(authorityRef.current, operation, () => replaceWorkspace(project, asset));
    } catch (nextError) {
      if (mountedRef.current && authorityRef.current.owns(operation)) setError(getErrorMessage(nextError));
    }
  }, [replaceWorkspace]);

  const deleteProject = useCallback(async (projectId: string) => {
    const targetProjectId = projectId;
    const operation = authorityRef.current.begin();
    const persistence = persistenceRef.current;
    const deletion = persistence.enqueueDelete(targetProjectId, () => deleteEditorProject(targetProjectId));
    try {
      await deletion;
    } catch (nextError) {
      if (authorityRef.current.owns(operation)) persistence.allow(targetProjectId);
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
    if (!history || !historyRevision || persistenceRef.current.isExcluded(history.present.id)) return;
    latestRevisionRef.current = historyRevision;
    const project = history.present;
    const timeout = window.setTimeout(() => {
      if (!mountedRef.current || latestRevisionRef.current !== historyRevision ||
        persistenceRef.current.isExcluded(project.id)) return;
      setSaveStatus('saving');
      setError(null);
      void persistenceRef.current.enqueueSave(project.id, async () => {
        await saveEditorProject(project);
        await refreshProjects();
      }).then(() => {
        if (mountedRef.current && latestRevisionRef.current === historyRevision &&
          !persistenceRef.current.isExcluded(project.id)) setSaveStatus('saved');
      }).catch((nextError: unknown) => {
        if (mountedRef.current && latestRevisionRef.current === historyRevision &&
          !persistenceRef.current.isExcluded(project.id)) {
          setSaveStatus('error');
          setError(getErrorMessage(nextError));
        }
      });
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [history, historyRevision, refreshProjects]);

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
