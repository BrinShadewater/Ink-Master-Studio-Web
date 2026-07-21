import { migrateStudioJob } from './jobModel';
import { StudioJob } from '../types';
import { hasIndexedDb, JOB_STORE, openInkMasterDatabase } from './inkmasterDatabase';

const memoryJobs = new Map<string, StudioJob>();

const runRequest = async <T>(
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
      transaction = database.transaction(JOB_STORE, mode);
    } catch (error) {
      rejectOnce(error instanceof Error ? error : new Error('Job storage transaction failed.'));
      return;
    }
    transaction.oncomplete = resolveOnce;
    transaction.onerror = () => rejectOnce(transaction.error ?? new Error('Job storage transaction failed.'));
    transaction.onabort = () => rejectOnce(transaction.error ?? new Error('Job storage transaction aborted.'));
    try {
      const request = operation(transaction.objectStore(JOB_STORE));
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => rejectOnce(request.error ?? new Error('Job storage request failed.'));
    } catch (error) {
      rejectOnce(error instanceof Error ? error : new Error('Job storage request failed.'));
    }
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
