import assert from 'node:assert/strict';
import { test } from 'node:test';
import { indexedDB as fakeIndexedDb } from 'fake-indexeddb';
import { createEditorAsset, createEditorProject, createTextLayer } from '../editor/model';
import {
  deleteEditorAsset, deleteEditorProject, getEditorAsset, getEditorProject,
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

const completeTransaction = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error ?? new Error('Test transaction failed.'));
  transaction.onabort = () => reject(transaction.error ?? new Error('Test transaction aborted.'));
});

const seedRawEditorProject = async (factory: IDBFactory, project: object, asset?: ReturnType<typeof createEditorAsset>) => {
  const database = await openDatabase(factory);
  try {
    const transaction = database.transaction(['editor-projects', 'editor-assets'], 'readwrite');
    transaction.objectStore('editor-projects').put(project);
    if (asset) transaction.objectStore('editor-assets').put(asset);
    await completeTransaction(transaction);
  } finally {
    database.close();
  }
};

const readRawEditorProject = async (factory: IDBFactory, id: string): Promise<unknown> => {
  const database = await openDatabase(factory);
  try {
    const transaction = database.transaction('editor-projects', 'readonly');
    const request = transaction.objectStore('editor-projects').get(id);
    let result: unknown;
    request.onsuccess = () => { result = request.result; };
    await completeTransaction(transaction);
    return result;
  } finally {
    database.close();
  }
};

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

test('preserves exact text content through save normalization and reopen', async () => {
  const projectId = `project_${crypto.randomUUID()}`;
  const asset = createEditorAsset(projectId, new Blob(['source'], { type: 'image/png' }), {
    name: 'source.png', width: 1200, height: 800,
  });
  const project = createEditorProject('Text content', asset);
  const contents = ['', '   ', 'first line\nsecond line', `long line\n${'x'.repeat(600)}`];
  const expected = contents.map((content) => content.slice(0, 500));
  const textLayers = contents.map((content, index) => ({
    ...createTextLayer('placeholder'),
    id: `text_${index}`,
    text: content,
  }));
  project.variations[0].layers.push(...textLayers);

  await saveEditorAsset(asset);
  const saved = await saveEditorProject(project);
  const reopened = await getEditorProject(projectId);
  const savedText = saved.variations[0].layers
    .filter((layer) => layer.type === 'text')
    .map((layer) => layer.text);
  const reopenedText = reopened?.variations[0].layers
    .filter((layer) => layer.type === 'text')
    .map((layer) => layer.text);

  assert.deepEqual(savedText, expected);
  assert.deepEqual(reopenedText, expected);
  await deleteEditorProject(projectId);
});

test('normalizes malformed schema five projects with their stored source asset before saving', async () => {
  const projectId = `project_${crypto.randomUUID()}`;
  const asset = createEditorAsset(projectId, new Blob(['source'], { type: 'image/png' }), {
    name: 'source.png', width: 1200, height: 800,
  });
  await saveEditorAsset(asset);
  const project = createEditorProject('Source', asset);
  const malformed = {
    ...project,
    sourceMetadata: { name: '', mimeType: '', width: 0, height: Number.NaN },
    activeVariationId: 'missing_variation',
    variations: [
      { id: 'discarded_variation', layers: [], selectedLayerId: 'missing' },
      {
        id: 'text_variation', name: '', selectedLayerId: 'missing_layer', layers: [{
          id: 'text_layer', type: 'text', name: '', visible: 1, opacity: 2,
          transform: { x: 9, y: -9, scale: 0, rotation: 500, flipX: 0, flipY: 1 },
          text: '', fontFamily: 'Comic Sans MS', fontSize: -1, color: '', align: 'justify',
          letterSpacing: -100, outlineWidth: -1, outlineColor: '',
        }],
      },
    ],
  };

  const saved = await saveEditorProject(malformed as typeof project);
  assert.deepEqual(saved.sourceMetadata, {
    name: 'source.png', mimeType: 'image/png', width: 1200, height: 800,
  });
  assert.equal(saved.activeVariationId, 'text_variation');
  assert.equal(saved.variations.length, 1);
  assert.equal(saved.variations[0].name, 'Original');
  assert.equal(saved.variations[0].selectedLayerId, 'text_layer');
  assert.deepEqual(await getEditorProject(projectId), saved);
});

test('rejects schema five saves whose source asset is not stored for the project', async () => {
  const projectId = `project_${crypto.randomUUID()}`;
  const asset = createEditorAsset(projectId, new Blob(['source'], { type: 'image/png' }), {
    name: 'source.png', width: 1200, height: 800,
  });
  const project = createEditorProject('Missing source', asset);

  await assert.rejects(saveEditorProject(project), /Project source image not found/);
  assert.equal(await getEditorProject(projectId), null);
});

test('rejects saves declared with a non-current schema before repository normalization', async () => {
  const projectId = `project_${crypto.randomUUID()}`;
  const asset = createEditorAsset(projectId, new Blob(['source'], { type: 'image/png' }), {
    name: 'source.png', width: 1200, height: 800,
  });
  const project = createEditorProject('Unsupported schema', asset);

  await assert.rejects(
    saveEditorProject({ ...project, schemaVersion: 2 } as unknown as typeof project),
    /Unsupported editor project schema/,
  );
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

test('deletes only the requested in-memory editor asset', async () => {
  const projectId = `project_${crypto.randomUUID()}`;
  const source = createEditorAsset(projectId, new Blob(['source']), {
    name: 'source.png', width: 100, height: 100,
  });
  const secondary = createEditorAsset(projectId, new Blob(['secondary']), {
    name: 'secondary.png', width: 80, height: 60,
  });
  const project = createEditorProject('Memory cleanup', source);
  await saveEditorAsset(source);
  await saveEditorAsset(secondary);
  await saveEditorProject(project);

  await deleteEditorAsset(secondary.id);

  assert.equal(await getEditorAsset(secondary.id), null);
  assert.equal((await getEditorAsset(source.id))?.id, source.id);
  assert.equal((await getEditorProject(projectId))?.id, projectId);
  await deleteEditorProject(projectId);
});

test('deletes only the requested IndexedDB editor asset', async () => {
  await withFakeIndexedDb(async () => {
    const projectId = `project_${crypto.randomUUID()}`;
    const source = createEditorAsset(projectId, new Blob(['source']), {
      name: 'source.png', width: 100, height: 100,
    });
    const secondary = createEditorAsset(projectId, new Blob(['secondary']), {
      name: 'secondary.png', width: 80, height: 60,
    });
    const project = createEditorProject('Indexed cleanup', source);
    await saveEditorAsset(source);
    await saveEditorAsset(secondary);
    await saveEditorProject(project);

    await deleteEditorAsset(secondary.id);

    assert.equal(await getEditorAsset(secondary.id), null);
    assert.equal((await getEditorAsset(source.id))?.id, source.id);
    assert.equal((await getEditorProject(projectId))?.id, projectId);
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

test('hydrates stored version one projects with matching project assets', async () => {
  await withFakeIndexedDb(async (factory) => {
    await saveJob(createStudioJob('Initialize editor stores'));
    const asset = createEditorAsset('project_legacy', new Blob(['source'], { type: 'image/webp' }), {
      name: 'legacy-source.webp', width: 1440, height: 960,
    });
    const legacyProject = {
      schemaVersion: 1,
      id: 'project_legacy',
      name: 'Legacy project',
      createdAt: 100,
      updatedAt: 200,
      activeVariationId: 'variation_legacy',
      variations: [{
        id: 'variation_legacy',
        name: 'Original',
        selectedLayerId: 'layer_legacy',
        layers: [{ type: 'image', id: 'layer_legacy', assetId: asset.id }],
      }],
      productVariants: [],
    };
    await seedRawEditorProject(factory, legacyProject, asset);

    const project = await getEditorProject('project_legacy');
    assert.equal(project?.schemaVersion, 5);
    assert.equal(project?.productVariants.length, 1);
    assert.deepEqual(project?.variations[0].look, { id: 'original', strength: 100 });
    assert.equal(project?.sourceAssetId, asset.id);
    assert.deepEqual(project?.sourceMetadata, {
      name: 'legacy-source.webp', mimeType: 'image/webp', width: 1440, height: 960,
    });
    assert.equal(project?.variations[0].layers[0].id, 'layer_legacy');
    assert.deepEqual((await listEditorProjects()).map((entry) => entry.id), ['project_legacy']);

    const repository = await import('../editor/projectRepository') as unknown as {
      getEditorAssetsForProject: (projectId: string) => Promise<ReturnType<typeof createEditorAsset>[]>;
    };
    const assets = await repository.getEditorAssetsForProject('project_legacy');
    assert.equal(assets.length, 1);
    assert.equal(assets[0].id, asset.id);
  });
});

test('migrates stored schema two projects with injected Looks to schema five Original when saved', async () => {
  await withFakeIndexedDb(async (factory) => {
    await saveJob(createStudioJob('Initialize editor stores'));
    const asset = createEditorAsset('project_schema_two', new Blob(['source'], { type: 'image/png' }), {
      name: 'source.png', width: 1200, height: 800,
    });
    const rawSchemaTwo = {
      schemaVersion: 2,
      id: 'project_schema_two',
      name: 'Schema two',
      createdAt: 100,
      updatedAt: 200,
      sourceAssetId: asset.id,
      sourceMetadata: { name: asset.name, mimeType: asset.mimeType, width: asset.width, height: asset.height },
      activeVariationId: 'variation_schema_two',
      variations: [{
        id: 'variation_schema_two',
        name: 'Original',
        selectedLayerId: 'text_schema_two',
        look: { id: 'vintage-ink', strength: 100, warmth: 45, fade: 25, grain: 20, seed: 7 },
        layers: [
          { type: 'image', id: 'layer_schema_two', assetId: asset.id },
          {
            type: 'text', id: 'text_schema_two', name: 'Caption', visible: true, opacity: 1,
            transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, flipX: false, flipY: false },
            text: 'first line\nsecond line', fontFamily: 'Arial', fontSize: 48, color: '#000000',
            align: 'left', letterSpacing: 0, outlineWidth: 0, outlineColor: '#000000',
          },
        ],
      }],
      productVariants: [],
    };
    await seedRawEditorProject(factory, rawSchemaTwo, asset);

    const hydrated = await getEditorProject(rawSchemaTwo.id);
    assert.equal(hydrated?.schemaVersion, 5);
    assert.equal(hydrated?.productVariants.length, 1);
    assert.deepEqual(hydrated?.variations[0].look, { id: 'original', strength: 100 });
    await saveEditorProject(hydrated!);

    const stored = await readRawEditorProject(factory, rawSchemaTwo.id) as typeof rawSchemaTwo & {
      look?: unknown;
      variations: Array<typeof rawSchemaTwo.variations[number] & { look: unknown }>;
    };
    assert.equal(stored.schemaVersion, 5);
    assert.deepEqual(stored.variations[0].look, { id: 'original', strength: 100 });

    const reopened = await getEditorProject(rawSchemaTwo.id);
    assert.deepEqual(reopened?.sourceMetadata, rawSchemaTwo.sourceMetadata);
    assert.equal(reopened?.sourceAssetId, rawSchemaTwo.sourceAssetId);
    assert.deepEqual(reopened?.variations[0].layers.map((layer) => layer.id), ['layer_schema_two', 'text_schema_two']);
    assert.equal(reopened?.variations[0].selectedLayerId, 'text_schema_two');
    const textLayer = reopened?.variations[0].layers.find((layer) => layer.id === 'text_schema_two');
    assert.equal(textLayer?.type, 'text');
    if (textLayer?.type === 'text') assert.equal(textLayer.text, 'first line\nsecond line');
  });
});

test('rejects stored version one projects whose source asset is missing', async () => {
  await withFakeIndexedDb(async (factory) => {
    await saveJob(createStudioJob('Initialize editor stores'));
    await seedRawEditorProject(factory, {
      schemaVersion: 1,
      id: 'project_missing_asset',
      name: 'Missing source',
      createdAt: 100,
      updatedAt: 100,
      activeVariationId: 'variation_missing_asset',
      variations: [{
        id: 'variation_missing_asset',
        name: 'Original',
        selectedLayerId: 'layer_missing_asset',
        layers: [{ type: 'image', id: 'layer_missing_asset', assetId: 'asset_missing' }],
      }],
      productVariants: [],
    });

    await assert.rejects(getEditorProject('project_missing_asset'), /Project source image not found/);
    await assert.rejects(listEditorProjects(), /Project source image not found/);
  });
});
