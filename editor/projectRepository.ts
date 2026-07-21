import {
  EDITOR_PROJECT_SCHEMA_VERSION,
  EditorAsset,
  EditorProject,
  migrateEditorProject,
} from './model';
import {
  EDITOR_ASSET_STORE,
  EDITOR_PROJECT_STORE,
  hasIndexedDb,
  openInkMasterDatabase,
} from '../services/inkmasterDatabase';

const memoryProjects = new Map<string, EditorProject>();
const memoryAssets = new Map<string, EditorAsset>();

const runRequest = async <T>(
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const database = await openInkMasterDatabase();
  return new Promise((resolve, reject) => {
    let settled = false;
    let result: T;
    const resolveOnce = () => {
      if (settled) return;
      settled = true;
      database.close();
      resolve(result);
    };
    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      database.close();
      reject(error);
    };
    let transaction: IDBTransaction;
    try {
      transaction = database.transaction(storeName, mode);
    } catch (error) {
      rejectOnce(error instanceof Error ? error : new Error('Editor storage transaction failed.'));
      return;
    }
    transaction.oncomplete = resolveOnce;
    transaction.onerror = () => rejectOnce(transaction.error ?? new Error('Editor storage transaction failed.'));
    transaction.onabort = () => rejectOnce(transaction.error ?? new Error('Editor storage transaction aborted.'));
    try {
      const request = operation(transaction.objectStore(storeName));
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => rejectOnce(request.error ?? new Error('Editor storage request failed.'));
    } catch (error) {
      rejectOnce(error instanceof Error ? error : new Error('Editor storage request failed.'));
    }
  });
};

const cloneProject = (project: EditorProject) => structuredClone(project);

const cloneAsset = (asset: EditorAsset): EditorAsset => ({ ...asset, blob: asset.blob });

const duplicateAssetError = () => new Error('Source asset id already exists.');

export const saveEditorProject = async (project: EditorProject): Promise<EditorProject> => {
  if (project.schemaVersion !== EDITOR_PROJECT_SCHEMA_VERSION) {
    throw new Error('Unsupported editor project schema.');
  }
  const normalized = migrateEditorProject(project, await getEditorAssetsForProject(project.id));
  if (!hasIndexedDb()) {
    memoryProjects.set(normalized.id, cloneProject(normalized));
    return cloneProject(normalized);
  }
  await runRequest(EDITOR_PROJECT_STORE, 'readwrite', (store) => store.put(normalized));
  return normalized;
};

export const getEditorProject = async (id: string): Promise<EditorProject | null> => {
  if (!hasIndexedDb()) {
    const project = memoryProjects.get(id);
    return project ? migrateEditorProject(cloneProject(project), await getEditorAssetsForProject(id)) : null;
  }
  const result = await runRequest<EditorProject | undefined>(EDITOR_PROJECT_STORE, 'readonly', (store) => store.get(id));
  return result ? migrateEditorProject(result, await getEditorAssetsForProject(id)) : null;
};

export const listEditorProjects = async (): Promise<EditorProject[]> => {
  const projects = hasIndexedDb()
    ? await runRequest<EditorProject[]>(EDITOR_PROJECT_STORE, 'readonly', (store) => store.getAll())
    : [...memoryProjects.values()].map(cloneProject);
  const hydrated = await Promise.all(projects.map(async (project) =>
    migrateEditorProject(project, await getEditorAssetsForProject(project.id))));
  return hydrated.sort((a, b) => b.updatedAt - a.updatedAt);
};

export const saveEditorAsset = async (asset: EditorAsset): Promise<EditorAsset> => {
  if (!hasIndexedDb()) {
    if (memoryAssets.has(asset.id)) throw duplicateAssetError();
    memoryAssets.set(asset.id, cloneAsset(asset));
    return cloneAsset(asset);
  }
  try {
    await runRequest(EDITOR_ASSET_STORE, 'readwrite', (store) => store.add(asset));
  } catch (error) {
    if (error instanceof DOMException && error.name === 'ConstraintError') throw duplicateAssetError();
    throw error;
  }
  return asset;
};

export const getEditorAsset = async (id: string): Promise<EditorAsset | null> => {
  if (!hasIndexedDb()) {
    const asset = memoryAssets.get(id);
    return asset ? cloneAsset(asset) : null;
  }
  return await runRequest<EditorAsset | undefined>(EDITOR_ASSET_STORE, 'readonly', (store) => store.get(id)) ?? null;
};

export const getEditorAssetsForProject = async (projectId: string): Promise<EditorAsset[]> => {
  if (!hasIndexedDb()) {
    return [...memoryAssets.values()]
      .filter((asset) => asset.projectId === projectId)
      .map(cloneAsset);
  }
  const assets = await runRequest<EditorAsset[]>(EDITOR_ASSET_STORE, 'readonly', (store) =>
    store.index('projectId').getAll(projectId));
  return assets.map(cloneAsset);
};

export const deleteEditorProject = async (id: string): Promise<void> => {
  if (!hasIndexedDb()) {
    memoryProjects.delete(id);
    for (const [assetId, asset] of memoryAssets) {
      if (asset.projectId === id) memoryAssets.delete(assetId);
    }
    return;
  }

  const database = await openInkMasterDatabase();
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const resolveOnce = () => {
      if (settled) return;
      settled = true;
      database.close();
      resolve();
    };
    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      database.close();
      reject(error);
    };
    let transaction: IDBTransaction;
    try {
      transaction = database.transaction([EDITOR_PROJECT_STORE, EDITOR_ASSET_STORE], 'readwrite');
    } catch (error) {
      rejectOnce(error instanceof Error ? error : new Error('Editor storage transaction failed.'));
      return;
    }
    transaction.oncomplete = resolveOnce;
    transaction.onerror = () => rejectOnce(transaction.error ?? new Error('Editor storage transaction failed.'));
    transaction.onabort = () => rejectOnce(transaction.error ?? new Error('Editor storage transaction aborted.'));
    try {
      const projects = transaction.objectStore(EDITOR_PROJECT_STORE);
      const assets = transaction.objectStore(EDITOR_ASSET_STORE);
      const assetIds = assets.index('projectId').getAllKeys(id);
      const rejectRequest = (request: IDBRequest<unknown>) => {
        request.onerror = () => rejectOnce(request.error ?? new Error('Editor storage request failed.'));
      };

      rejectRequest(assetIds);
      assetIds.onsuccess = () => {
        for (const assetId of assetIds.result) {
          rejectRequest(assets.delete(assetId));
        }
        rejectRequest(projects.delete(id));
      };
    } catch (error) {
      rejectOnce(error instanceof Error ? error : new Error('Editor storage request failed.'));
    }
  });
};
