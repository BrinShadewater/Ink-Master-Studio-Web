import { EditorAsset, EditorProject, migrateEditorProject } from './model';

const DB_NAME = 'inkmaster-studio';
const DB_VERSION = 2;
const PROJECT_STORE = 'editor-projects';
const ASSET_STORE = 'editor-assets';
const memoryProjects = new Map<string, EditorProject>();
const memoryAssets = new Map<string, EditorAsset>();

const hasIndexedDb = () => typeof indexedDB !== 'undefined';

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(PROJECT_STORE)) {
      const projects = database.createObjectStore(PROJECT_STORE, { keyPath: 'id' });
      projects.createIndex('updatedAt', 'updatedAt');
    }
    if (!database.objectStoreNames.contains(ASSET_STORE)) {
      const assets = database.createObjectStore(ASSET_STORE, { keyPath: 'id' });
      assets.createIndex('projectId', 'projectId');
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('Could not open editor storage.'));
});

const runRequest = async <T>(
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = operation(transaction.objectStore(storeName));
    let result: T;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error ?? new Error('Editor storage request failed.'));
    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onerror = () => reject(transaction.error ?? new Error('Editor storage transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Editor storage transaction aborted.'));
  });
};

const cloneProject = (project: EditorProject) => structuredClone(project);

const cloneAsset = (asset: EditorAsset): EditorAsset => ({ ...asset, blob: asset.blob });

export const saveEditorProject = async (project: EditorProject): Promise<EditorProject> => {
  const normalized = migrateEditorProject(project);
  if (!hasIndexedDb()) {
    memoryProjects.set(normalized.id, cloneProject(normalized));
    return cloneProject(normalized);
  }
  await runRequest(PROJECT_STORE, 'readwrite', (store) => store.put(normalized));
  return normalized;
};

export const getEditorProject = async (id: string): Promise<EditorProject | null> => {
  if (!hasIndexedDb()) {
    const project = memoryProjects.get(id);
    return project ? cloneProject(project) : null;
  }
  const result = await runRequest<EditorProject | undefined>(PROJECT_STORE, 'readonly', (store) => store.get(id));
  return result ? migrateEditorProject(result) : null;
};

export const listEditorProjects = async (): Promise<EditorProject[]> => {
  const projects = hasIndexedDb()
    ? await runRequest<EditorProject[]>(PROJECT_STORE, 'readonly', (store) => store.getAll())
    : [...memoryProjects.values()].map(cloneProject);
  return projects.map(migrateEditorProject).sort((a, b) => b.updatedAt - a.updatedAt);
};

export const saveEditorAsset = async (asset: EditorAsset): Promise<EditorAsset> => {
  if (!hasIndexedDb()) {
    memoryAssets.set(asset.id, cloneAsset(asset));
    return cloneAsset(asset);
  }
  await runRequest(ASSET_STORE, 'readwrite', (store) => store.put(asset));
  return asset;
};

export const getEditorAsset = async (id: string): Promise<EditorAsset | null> => {
  if (!hasIndexedDb()) {
    const asset = memoryAssets.get(id);
    return asset ? cloneAsset(asset) : null;
  }
  return await runRequest<EditorAsset | undefined>(ASSET_STORE, 'readonly', (store) => store.get(id)) ?? null;
};

export const deleteEditorProject = async (id: string): Promise<void> => {
  if (!hasIndexedDb()) {
    memoryProjects.delete(id);
    for (const [assetId, asset] of memoryAssets) {
      if (asset.projectId === id) memoryAssets.delete(assetId);
    }
    return;
  }

  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([PROJECT_STORE, ASSET_STORE], 'readwrite');
    const projects = transaction.objectStore(PROJECT_STORE);
    const assets = transaction.objectStore(ASSET_STORE);
    const assetIds = assets.index('projectId').getAllKeys(id);
    let requestError: Error | null = null;

    const rejectRequest = (request: IDBRequest<unknown>) => {
      request.onerror = () => {
        requestError = request.error ?? new Error('Editor storage request failed.');
        reject(requestError);
      };
    };

    rejectRequest(assetIds);
    assetIds.onsuccess = () => {
      for (const assetId of assetIds.result) {
        rejectRequest(assets.delete(assetId));
      }
      rejectRequest(projects.delete(id));
    };
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error ?? requestError ?? new Error('Editor storage transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? requestError ?? new Error('Editor storage transaction aborted.'));
  });
};
