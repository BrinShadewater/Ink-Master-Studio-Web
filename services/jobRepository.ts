import { migrateStudioJob } from './jobModel';
import { StudioJob } from '../types';

const DB_NAME = 'inkmaster-studio';
const STORE_NAME = 'jobs';
const DB_VERSION = 1;
const memoryJobs = new Map<string, StudioJob>();

const hasIndexedDb = () => typeof indexedDB !== 'undefined';

const openDatabase = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('updatedAt', 'updatedAt');
      store.createIndex('archivedAt', 'archivedAt');
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('Could not open job storage.'));
});

const runRequest = async <T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Job storage request failed.'));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => reject(transaction.error ?? new Error('Job storage transaction failed.'));
  });
};

export const saveJob = async (job: StudioJob): Promise<StudioJob> => {
  const normalized = migrateStudioJob(job);
  if (!hasIndexedDb()) {
    memoryJobs.set(normalized.id, normalized);
    return normalized;
  }
  await runRequest('readwrite', (store) => store.put(normalized));
  return normalized;
};

export const getJob = async (id: string): Promise<StudioJob | null> => {
  if (!hasIndexedDb()) return memoryJobs.get(id) ?? null;
  const result = await runRequest<StudioJob | undefined>('readonly', (store) => store.get(id));
  return result ? migrateStudioJob(result) : null;
};

export const listJobs = async (includeArchived = false): Promise<StudioJob[]> => {
  const jobs = hasIndexedDb()
    ? await runRequest<StudioJob[]>('readonly', (store) => store.getAll())
    : [...memoryJobs.values()];
  return jobs
    .map(migrateStudioJob)
    .filter((job) => includeArchived || job.archivedAt === null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
};

export const archiveJob = async (id: string): Promise<StudioJob> => {
  const job = await getJob(id);
  if (!job) throw new Error('Job not found.');
  const archived = {
    ...job,
    archivedAt: Date.now(),
    updatedAt: Date.now(),
  };
  return saveJob(archived);
};

export const deleteJob = async (id: string): Promise<void> => {
  if (!hasIndexedDb()) {
    memoryJobs.delete(id);
    return;
  }
  await runRequest('readwrite', (store) => store.delete(id));
};
