import assert from 'node:assert/strict';
import { test } from 'node:test';
import { indexedDB as fakeIndexedDb } from 'fake-indexeddb';
import { createEditorAsset, createEditorProject } from '../editor/model';
import {
  deleteEditorProject, getEditorAsset, getEditorProject,
  listEditorProjects, saveEditorAsset, saveEditorProject,
} from '../editor/projectRepository';
import { createStudioJob } from '../services/jobModel';
import { getJob, saveJob } from '../services/jobRepository';

const DATABASE_NAME = 'inkmaster-studio';

const deleteDatabase = (factory: IDBFactory) => new Promise<void>((resolve, reject) => {
  const request = factory.deleteDatabase(DATABASE_NAME);
  request.onsuccess = () => resolve();
  request.onerror = () => reject(request.error ?? new Error('Could not delete test database.'));
  request.onblocked = () => reject(new Error('Test database remained open.'));
});

const openDatabase = (factory: IDBFactory) => new Promise<IDBDatabase>((resolve, reject) => {
  const request = factory.open(DATABASE_NAME);
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('Could not open test database.'));
});

const createLegacyDatabase = (factory: IDBFactory, job: ReturnType<typeof createStudioJob>) => new Promise<void>((resolve, reject) => {
  const request = factory.open(DATABASE_NAME, 1);
  request.onupgradeneeded = () => {
    const jobs = request.result.createObjectStore('jobs', { keyPath: 'id' });
    jobs.createIndex('updatedAt', 'updatedAt');
    jobs.createIndex('archivedAt', 'archivedAt');
    jobs.put(job);
  };
  request.onsuccess = () => {
    request.result.close();
    resolve();
  };
  request.onerror = () => reject(request.error ?? new Error('Could not create legacy test database.'));
});

const withFakeIndexedDb = async (operation: (factory: IDBFactory) => Promise<void>) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    writable: true,
    value: fakeIndexedDb,
  });
  await deleteDatabase(fakeIndexedDb);
  try {
    await operation(fakeIndexedDb);
  } finally {
    await deleteDatabase(fakeIndexedDb);
    if (original) Object.defineProperty(globalThis, 'indexedDB', original);
    else delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  }
};

test('round-trips project JSON and source blob as separate records', async () => {
  const projectId = `project_${crypto.randomUUID()}`;
  const asset = createEditorAsset(projectId, new Blob(['source'], { type: 'image/png' }), {
    name: 'source.png', width: 1200, height: 800,
  });
  const project = createEditorProject('Local design', asset);
  await saveEditorAsset(asset);
  await saveEditorProject(project);
  assert.equal((await getEditorProject(project.id))?.name, 'Local design');
  assert.equal((await getEditorAsset(asset.id))?.blob.size, 6);
  assert.ok((await listEditorProjects()).some((entry) => entry.id === project.id));
  await deleteEditorProject(project.id);
  assert.equal(await getEditorProject(project.id), null);
  assert.equal(await getEditorAsset(asset.id), null);
});

test('rejects duplicate source asset ids without replacing memory records', async () => {
  const projectId = `project_${crypto.randomUUID()}`;
  const asset = createEditorAsset(projectId, new Blob(['original']), {
    name: 'original.png', width: 10, height: 10,
  });
  await saveEditorAsset(asset);

  await assert.rejects(
    saveEditorAsset({ ...asset, name: 'replacement.png', blob: new Blob(['replacement']) }),
    /Source asset id already exists/,
  );
  assert.equal((await getEditorAsset(asset.id))?.name, 'original.png');
  assert.equal((await getEditorAsset(asset.id))?.blob.size, 8);
});

test('rejects duplicate source asset ids without replacing IndexedDB records', async () => {
  await withFakeIndexedDb(async () => {
    const projectId = `project_${crypto.randomUUID()}`;
    const asset = createEditorAsset(projectId, new Blob(['original']), {
      name: 'original.png', width: 10, height: 10,
    });
    await saveEditorAsset(asset);

    await assert.rejects(
      saveEditorAsset({ ...asset, name: 'replacement.png', blob: new Blob(['replacement']) }),
      /Source asset id already exists/,
    );
    assert.equal((await getEditorAsset(asset.id))?.name, 'original.png');
    assert.equal((await getEditorAsset(asset.id))?.blob.size, 8);
  });
});

test('creates the complete version two schema when the legacy repository opens first', async () => {
  await withFakeIndexedDb(async (factory) => {
    const job = createStudioJob('Legacy first');
    await saveJob(job);

    const database = await openDatabase(factory);
    try {
      assert.equal(database.version, 2);
      assert.deepEqual([...database.objectStoreNames].sort(), ['editor-assets', 'editor-projects', 'jobs']);
      const transaction = database.transaction(['jobs', 'editor-projects', 'editor-assets']);
      assert.equal(transaction.objectStore('jobs').indexNames.contains('updatedAt'), true);
      assert.equal(transaction.objectStore('jobs').indexNames.contains('archivedAt'), true);
      assert.equal(transaction.objectStore('editor-projects').indexNames.contains('updatedAt'), true);
      assert.equal(transaction.objectStore('editor-assets').indexNames.contains('projectId'), true);
    } finally {
      database.close();
    }

    const asset = createEditorAsset(job.id, new Blob(['source']), {
      name: 'source.png', width: 1200, height: 800,
    });
    await saveEditorAsset(asset);
    await saveEditorProject(createEditorProject('Editor project', asset));
    assert.equal((await getJob(job.id))?.metadata.name, 'Legacy first');
  });
});

test('cascades project assets through IndexedDB', async () => {
  await withFakeIndexedDb(async () => {
    const projectId = `project_${crypto.randomUUID()}`;
    const asset = createEditorAsset(projectId, new Blob(['source']), {
      name: 'source.png', width: 1200, height: 800,
    });
    const secondAsset = createEditorAsset(projectId, new Blob(['second']), {
      name: 'second.png', width: 800, height: 600,
    });
    const otherAsset = createEditorAsset(`project_${crypto.randomUUID()}`, new Blob(['other']), {
      name: 'other.png', width: 400, height: 400,
    });
    await saveEditorAsset(asset);
    await saveEditorAsset(secondAsset);
    await saveEditorAsset(otherAsset);
    await saveEditorProject(createEditorProject('Indexed project', asset));

    await deleteEditorProject(projectId);

    assert.equal(await getEditorProject(projectId), null);
    assert.equal(await getEditorAsset(asset.id), null);
    assert.equal(await getEditorAsset(secondAsset.id), null);
    assert.equal((await getEditorAsset(otherAsset.id))?.blob.size, 5);
  });
});

test('upgrades legacy jobs without changing their data', async () => {
  await withFakeIndexedDb(async (factory) => {
    const job = createStudioJob('Preserved legacy job');
    await createLegacyDatabase(factory, job);

    const asset = createEditorAsset(job.id, new Blob(['source']), {
      name: 'source.png', width: 1200, height: 800,
    });
    await saveEditorAsset(asset);

    assert.deepEqual(await getJob(job.id), job);
    const database = await openDatabase(factory);
    try {
      assert.equal(database.version, 2);
      assert.equal(database.objectStoreNames.contains('editor-projects'), true);
      assert.equal(database.objectStoreNames.contains('editor-assets'), true);
    } finally {
      database.close();
    }
  });
});
