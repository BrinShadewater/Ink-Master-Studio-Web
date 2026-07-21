export const INKMASTER_DATABASE_NAME = 'inkmaster-studio';
export const INKMASTER_DATABASE_VERSION = 2;
export const JOB_STORE = 'jobs';
export const EDITOR_PROJECT_STORE = 'editor-projects';
export const EDITOR_ASSET_STORE = 'editor-assets';

const ensureStore = (
  database: IDBDatabase,
  transaction: IDBTransaction,
  name: string,
  indexes: string[],
) => {
  const store = database.objectStoreNames.contains(name)
    ? transaction.objectStore(name)
    : database.createObjectStore(name, { keyPath: 'id' });
  for (const index of indexes) {
    if (!store.indexNames.contains(index)) store.createIndex(index, index);
  }
};

export const hasIndexedDb = () => typeof indexedDB !== 'undefined';

export const openInkMasterDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(INKMASTER_DATABASE_NAME, INKMASTER_DATABASE_VERSION);
  let settled = false;
  const rejectOnce = (error: Error) => {
    if (settled) return;
    settled = true;
    reject(error);
  };
  request.onupgradeneeded = () => {
    const transaction = request.transaction;
    if (!transaction) throw new Error('Could not upgrade local storage.');
    const database = request.result;
    ensureStore(database, transaction, JOB_STORE, ['updatedAt', 'archivedAt']);
    ensureStore(database, transaction, EDITOR_PROJECT_STORE, ['updatedAt']);
    ensureStore(database, transaction, EDITOR_ASSET_STORE, ['projectId']);
  };
  request.onsuccess = () => {
    if (settled) {
      request.result.close();
      return;
    }
    settled = true;
    resolve(request.result);
  };
  request.onerror = () => rejectOnce(request.error ?? new Error('Could not open local storage.'));
  request.onblocked = () => rejectOnce(new Error('Local storage upgrade is blocked.'));
});
