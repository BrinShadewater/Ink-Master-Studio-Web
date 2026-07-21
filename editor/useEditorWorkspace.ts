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

export const useEditorWorkspace = (): EditorWorkspace => {
  const [history, setHistory] = useState<EditorHistory | null>(null);
  const [projects, setProjects] = useState<EditorProject[]>([]);
  const [sourceAsset, setSourceAsset] = useState<EditorAsset | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [error, setError] = useState<string | null>(null);
  const saveChainRef = useRef(Promise.resolve());
  const latestRevisionRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const refreshProjects = useCallback(async () => {
    const nextProjects = await listEditorProjects();
    if (mountedRef.current) setProjects(nextProjects);
  }, []);

  useEffect(() => {
    void refreshProjects().catch((nextError: unknown) => {
      if (mountedRef.current) setError(getErrorMessage(nextError));
    });
  }, [refreshProjects]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!sourceAsset) {
      setSourceUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(sourceAsset.blob);
    setSourceUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [sourceAsset]);

  const dispatch = useCallback((command: EditorCommand) => {
    setHistory((current) => current ? reduceEditorHistory(current, command) : current);
  }, []);

  const importFile = useCallback(async (file: File) => {
    const validationError = validateRasterImport(file);
    if (validationError) {
      setError(validationError);
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
      if (assetSaved) {
        try {
          await deleteEditorProject(projectId);
        } catch {
          // Retain the original import error if cleanup cannot remove the orphaned asset.
        }
      }
      if (mountedRef.current) setError(getErrorMessage(nextError));
      return;
    }

    latestRevisionRef.current = `${project.id}:${project.updatedAt}`;
    setHistory(createEditorHistory(project));
    setSourceAsset(asset);
    setSaveStatus('saved');
    setError(null);
    try {
      await refreshProjects();
    } catch (nextError) {
      if (mountedRef.current) setError(getErrorMessage(nextError));
    }
  }, [refreshProjects]);

  const openProject = useCallback(async (projectId: string) => {
    try {
      const project = await getEditorProject(projectId);
      if (!project) throw new Error('Project not found.');
      const sourceAssetId = getSelectedImageLayer(project).assetId;
      const asset = await getEditorAsset(sourceAssetId);
      if (!asset) throw new Error('Project source image not found.');

      latestRevisionRef.current = `${project.id}:${project.updatedAt}`;
      setHistory(createEditorHistory(project));
      setSourceAsset(asset);
      setSaveStatus('saved');
      setError(null);
    } catch (nextError) {
      if (mountedRef.current) setError(getErrorMessage(nextError));
    }
  }, []);

  const deleteProject = useCallback(async (projectId: string) => {
    const deletingCurrentProject = history?.present.id === projectId;
    try {
      if (deletingCurrentProject) {
        latestRevisionRef.current = null;
      }
      const deletion = saveChainRef.current.then(() => deleteEditorProject(projectId));
      saveChainRef.current = deletion.catch(() => undefined);
      await deletion;
      if (deletingCurrentProject) {
        setHistory(null);
        setSourceAsset(null);
        setSaveStatus('saved');
      }
      setError(null);
      await refreshProjects();
    } catch (nextError) {
      if (deletingCurrentProject) latestRevisionRef.current = history ? `${history.present.id}:${history.present.updatedAt}` : null;
      if (mountedRef.current) setError(getErrorMessage(nextError));
    }
  }, [history, refreshProjects]);

  const historyRevision = history ? `${history.present.id}:${history.present.updatedAt}` : null;

  useEffect(() => {
    latestRevisionRef.current = historyRevision;
    if (!history || !historyRevision) return;

    const project = history.present;
    const timeout = window.setTimeout(() => {
      if (!mountedRef.current || latestRevisionRef.current !== historyRevision) return;
      setSaveStatus('saving');
      setError(null);
      saveChainRef.current = saveChainRef.current.then(async () => {
        if (latestRevisionRef.current !== historyRevision) return;
        await saveEditorProject(project);
        const nextProjects = await listEditorProjects();
        if (mountedRef.current) setProjects(nextProjects);
        if (mountedRef.current && latestRevisionRef.current === historyRevision) setSaveStatus('saved');
      }).catch((nextError: unknown) => {
        if (mountedRef.current && latestRevisionRef.current === historyRevision) {
          setSaveStatus('error');
          setError(getErrorMessage(nextError));
        }
      });
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [history, historyRevision]);

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
