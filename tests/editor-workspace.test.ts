import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AssetUrlRegistry,
  ADDITIONAL_IMAGE_IMPORT_ERROR,
  ADDITIONAL_IMAGE_IMPORT_CLEANUP_ERROR,
  IMPORT_CLEANUP_ERROR,
  WorkspaceOperationAuthority,
  WorkspacePersistenceController,
  applyImportedProjectIfCurrent,
  applyNavigationIfCurrent,
  cleanupImportedProject,
  completeImportedProjectIfCurrent,
  getAssetsByIdForProject,
  getAutosaveRetryGeneration,
  importAdditionalImageLayer,
  openEditorProjectIfCurrent,
  queueWorkspaceRevision,
  reconcileDeletedWorkspaceAssetIfCurrent,
  readRasterDimensions,
  runAutosaveAttempt,
  shouldClearWorkspaceAfterDelete,
  validateRasterDimensions,
  validateRasterImport,
} from '../editor/useEditorWorkspace';
import { createEditorAsset, createEditorProject, type EditorProject } from '../editor/model';
import { createEditorHistory, reduceEditorHistory } from '../editor/history';
import {
  deleteEditorAsset,
  deleteEditorProject,
  getEditorAsset,
  getEditorAssetsForProject,
  getEditorProject,
  saveEditorAsset,
  saveEditorProject,
} from '../editor/projectRepository';

const deferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
};

const flushMicrotasks = () => new Promise<void>((resolve) => queueMicrotask(resolve));

test('accepts supported local raster files through 50 MB', () => {
  assert.equal(validateRasterImport(new File(['x'], 'still.png', { type: 'image/png' })), null);
});

test('rejects unsupported and oversized imports with stable messages', () => {
  assert.equal(
    validateRasterImport(new File(['x'], 'art.svg', { type: 'image/svg+xml' })),
    'Choose a PNG, JPEG, or WebP image.',
  );
  const oversized = new File([new Uint8Array(50 * 1024 * 1024 + 1)], 'huge.webp', { type: 'image/webp' });
  assert.equal(validateRasterImport(oversized), 'Choose an image no larger than 50 MB.');
});

test('rejects unsafe decoded dimensions with a stable pure validator', () => {
  assert.equal(validateRasterDimensions({ width: 16_384, height: 6_000 }), null);
  assert.equal(
    validateRasterDimensions({ width: 16_385, height: 100 }),
    'Choose an image no larger than 16,384 pixels per side or 100 megapixels.',
  );
  assert.equal(
    validateRasterDimensions({ width: 12_000, height: 12_000 }),
    'Choose an image no larger than 16,384 pixels per side or 100 megapixels.',
  );
});

test('closes a decoded bitmap before rejecting unsafe dimensions', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
  let closed = false;
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    value: async () => ({ width: 20_000, height: 100, close: () => { closed = true; } }),
  });
  try {
    await assert.rejects(
      readRasterDimensions(new File(['x'], 'wide.png', { type: 'image/png' })),
      /16,384 pixels per side or 100 megapixels/,
    );
    assert.equal(closed, true);
  } finally {
    if (original) Object.defineProperty(globalThis, 'createImageBitmap', original);
    else delete (globalThis as { createImageBitmap?: typeof createImageBitmap }).createImageBitmap;
  }
});

const createOpenFixture = (projectId: string) => {
  const asset = createEditorAsset(
    projectId,
    new Blob(['image'], { type: 'image/png' }),
    { name: `${projectId}.png`, width: 100, height: 100 },
  );
  return { asset, project: createEditorProject(projectId, asset) };
};

test('a successful project open returns true only after activating the requested project', async () => {
  const authority = new WorkspaceOperationAuthority();
  const fixture = createOpenFixture('project-a');
  let activeProjectId: string | null = null;
  const errors: string[] = [];

  const opened = await openEditorProjectIfCurrent(authority, authority.begin(), 'project-a', {
    getProject: async (projectId) => projectId === fixture.project.id ? fixture.project : null,
    getAssetsForProject: async () => [fixture.asset],
    activate: (project, assetsById) => {
      activeProjectId = project.id;
      assert.equal(assetsById[fixture.asset.id]?.id, fixture.asset.id);
    },
    reportError: (message) => { errors.push(message); },
  });

  assert.equal(opened, true);
  assert.equal(activeProjectId, 'project-a');
  assert.deepEqual(errors, []);
});

test('a failed project open returns false and reports the current error', async () => {
  const authority = new WorkspaceOperationAuthority();
  const errors: string[] = [];

  const opened = await openEditorProjectIfCurrent(authority, authority.begin(), 'missing', {
    getProject: async () => null,
    getAssetsForProject: async () => { throw new Error('Asset lookup should not run.'); },
    activate: () => { throw new Error('Activation should not run.'); },
    reportError: (message) => { errors.push(message); },
  });

  assert.equal(opened, false);
  assert.deepEqual(errors, ['Project not found.']);
});

test('a stale project open returns false without replacing or reporting over the newer operation', async () => {
  const authority = new WorkspaceOperationAuthority();
  const fixture = createOpenFixture('project-a');
  const projectLoad = deferred<typeof fixture.project | null>();
  let activeProjectId = 'initial';
  const errors: string[] = [];
  const staleOperation = authority.begin();
  const firstOpen = openEditorProjectIfCurrent(authority, staleOperation, 'project-a', {
    getProject: async () => projectLoad.promise,
    getAssetsForProject: async () => [fixture.asset],
    activate: (project) => { activeProjectId = project.id; },
    reportError: (message) => { errors.push(message); },
  });

  const currentOperation = authority.begin();
  assert.equal(applyNavigationIfCurrent(authority, currentOperation, () => { activeProjectId = 'project-b'; }), true);
  projectLoad.resolve(fixture.project);

  assert.equal(await firstOpen, false);
  assert.equal(activeProjectId, 'project-b');
  assert.deepEqual(errors, []);
});

test('project hydration indexes every asset and rejects an unresolved image layer', () => {
  const fixture = createOpenFixture('project-hydration');
  const secondary = createEditorAsset(fixture.project.id, new Blob(['secondary']), {
    name: 'secondary.png', width: 80, height: 60,
  });
  const sourceLayer = fixture.project.variations[0].layers[0];
  assert.equal(sourceLayer.type, 'image');
  fixture.project.variations[0].layers.push({
    ...sourceLayer,
    id: 'layer-secondary',
    assetId: secondary.id,
    name: secondary.name,
  });

  assert.deepEqual(Object.keys(getAssetsByIdForProject(fixture.project, [fixture.asset, secondary])).sort(),
    [fixture.asset.id, secondary.id].sort());
  assert.throws(
    () => getAssetsByIdForProject(fixture.project, [fixture.asset]),
    /Project image layer asset not found/,
  );
});

test('secondary import rejects an unsupported file before decoding or persistence', async () => {
  const events: string[] = [];
  const errors: string[] = [];
  const imported = await importAdditionalImageLayer(new File(['x'], 'vector.svg', { type: 'image/svg+xml' }), {
    getActiveProjectId: () => 'project-a',
    isProjectActive: () => true,
    readDimensions: async () => { events.push('decode'); return { width: 10, height: 10 }; },
    saveAsset: async () => { events.push('save'); },
    deleteAsset: async () => { events.push('delete'); },
    dispatchLayer: () => { events.push('dispatch'); },
    reportError: (message) => { errors.push(message); },
  });

  assert.equal(imported, false);
  assert.deepEqual(events, []);
  assert.deepEqual(errors, ['Choose a PNG, JPEG, or WebP image.']);
});

test('secondary import rejects an oversized file before decoding or persistence', async () => {
  const events: string[] = [];
  const errors: string[] = [];
  const file = new File([new Uint8Array(50 * 1024 * 1024 + 1)], 'huge.png', { type: 'image/png' });
  const imported = await importAdditionalImageLayer(file, {
    getActiveProjectId: () => 'project-a',
    isProjectActive: () => true,
    readDimensions: async () => { events.push('decode'); return { width: 10, height: 10 }; },
    saveAsset: async () => { events.push('save'); },
    deleteAsset: async () => { events.push('delete'); },
    dispatchLayer: () => { events.push('dispatch'); },
    reportError: (message) => { errors.push(message); },
  });

  assert.equal(imported, false);
  assert.deepEqual(events, []);
  assert.deepEqual(errors, ['Choose an image no larger than 50 MB.']);
});

test('secondary import validates decoded dimensions before persistence', async () => {
  const events: string[] = [];
  const errors: string[] = [];
  const imported = await importAdditionalImageLayer(new File(['x'], 'wide.png', { type: 'image/png' }), {
    getActiveProjectId: () => 'project-a',
    isProjectActive: () => true,
    readDimensions: async () => ({ width: 20_000, height: 10 }),
    saveAsset: async () => { events.push('save'); },
    deleteAsset: async () => { events.push('delete'); },
    dispatchLayer: () => { events.push('dispatch'); },
    reportError: (message) => { errors.push(message); },
  });

  assert.equal(imported, false);
  assert.deepEqual(events, []);
  assert.deepEqual(errors, ['Choose an image no larger than 16,384 pixels per side or 100 megapixels.']);
});

test('secondary import persists before appending a layer without changing source identity', async () => {
  const fixture = createOpenFixture('project-layer-import');
  let activeProjectId = fixture.project.id;
  let currentProject: EditorProject = fixture.project;
  const originalSource = {
    sourceAssetId: currentProject.sourceAssetId,
    sourceMetadata: structuredClone(currentProject.sourceMetadata),
  };
  const events: string[] = [];
  const errors: string[] = [];

  const imported = await importAdditionalImageLayer(new File(['secondary'], 'secondary.png', { type: 'image/png' }), {
    getActiveProjectId: () => activeProjectId,
    isProjectActive: (projectId) => activeProjectId === projectId,
    readDimensions: async () => ({ width: 80, height: 60 }),
    saveAsset: async (asset) => { events.push(`save:${asset.id}`); },
    deleteAsset: async (assetId) => { events.push(`delete:${assetId}`); },
    dispatchLayer: (asset, layer) => {
      events.push(`dispatch:${asset.id}`);
      currentProject = reduceEditorHistory(createEditorHistory(currentProject), {
        type: 'add-image-layer', layer,
      }).present;
      activeProjectId = currentProject.id;
    },
    reportError: (message) => { errors.push(message); },
  });

  assert.equal(imported, true);
  assert.equal(events.length, 2);
  assert.match(events[0], /^save:asset_/);
  assert.equal(events[1], events[0].replace('save:', 'dispatch:'));
  assert.equal(currentProject.id, fixture.project.id);
  assert.equal(currentProject.variations[0].layers.at(-1)?.name, 'secondary.png');
  assert.deepEqual({
    sourceAssetId: currentProject.sourceAssetId,
    sourceMetadata: currentProject.sourceMetadata,
  }, originalSource);
  assert.deepEqual(errors, []);
});

test('a stale persisted secondary import deletes its orphan and never replaces the active project', async () => {
  const saveGate = deferred<void>();
  let activeProjectId = 'project-a';
  let persistedAssetId: string | null = null;
  const deletedAssets: string[] = [];
  const dispatchedProjects: string[] = [];
  const errors: string[] = [];
  const importing = importAdditionalImageLayer(new File(['secondary'], 'secondary.png', { type: 'image/png' }), {
    getActiveProjectId: () => activeProjectId,
    isProjectActive: (projectId) => activeProjectId === projectId,
    readDimensions: async () => ({ width: 80, height: 60 }),
    saveAsset: async (asset) => { persistedAssetId = asset.id; await saveGate.promise; },
    deleteAsset: async (assetId) => { deletedAssets.push(assetId); },
    dispatchLayer: (asset) => { dispatchedProjects.push(asset.projectId); },
    reportError: (message) => { errors.push(message); },
  });
  await flushMicrotasks();
  activeProjectId = 'project-b';
  saveGate.resolve();

  assert.equal(await importing, false);
  assert.deepEqual(deletedAssets, [persistedAssetId]);
  assert.deepEqual(dispatchedProjects, []);
  assert.equal(activeProjectId, 'project-b');
  assert.deepEqual(errors, [ADDITIONAL_IMAGE_IMPORT_ERROR]);
});

test('a same-project reopen drops an observed stale import from repository state and URL ownership', async () => {
  const fixture = createOpenFixture(`project_same_reopen_${crypto.randomUUID()}`);
  const sibling = createEditorAsset(fixture.project.id, new Blob(['sibling']), {
    name: 'sibling.png', width: 40, height: 30,
  });
  await saveEditorAsset(fixture.asset);
  await saveEditorAsset(sibling);
  await saveEditorProject(fixture.project);

  const authority = new WorkspaceOperationAuthority();
  const importOperation = authority.begin();
  const saveObserved = deferred<void>();
  const saveGate = deferred<void>();
  const revoked: string[] = [];
  let nextUrl = 0;
  const registry = new AssetUrlRegistry({
    createObjectURL: () => `blob:${++nextUrl}`,
    revokeObjectURL: (url) => { revoked.push(url); },
  });
  let currentProject = fixture.project;
  let activeProjectId = fixture.project.id;
  let assetsByIdRef = getAssetsByIdForProject(currentProject, [fixture.asset, sibling]);
  let reactAssetsById = assetsByIdRef;
  let reactAssetUrlsById = registry.sync(Object.values(assetsByIdRef));
  let importedAssetId = '';

  const importing = importAdditionalImageLayer(new File(['secondary'], 'secondary.png', { type: 'image/png' }), {
    getActiveProjectId: () => activeProjectId,
    isProjectActive: (projectId) => authority.owns(importOperation) && activeProjectId === projectId,
    readDimensions: async () => ({ width: 80, height: 60 }),
    saveAsset: async (asset) => {
      importedAssetId = asset.id;
      await saveEditorAsset(asset);
      saveObserved.resolve();
      await saveGate.promise;
    },
    deleteAsset: deleteEditorAsset,
    isAssetReferenced: (asset) => currentProject.sourceAssetId === asset.id ||
      currentProject.variations.some((variation) => variation.layers.some((layer) =>
        layer.type === 'image' && layer.assetId === asset.id)),
    onAssetDeleted: (asset) => {
      const reconciled = reconcileDeletedWorkspaceAssetIfCurrent(
        authority,
        authority.current(),
        activeProjectId,
        currentProject,
        assetsByIdRef,
        asset.id,
        registry,
      );
      if (!reconciled) return;
      assetsByIdRef = reconciled.assetsById;
      reactAssetsById = reconciled.assetsById;
      reactAssetUrlsById = reconciled.assetUrlsById;
    },
    dispatchLayer: () => { throw new Error('Stale import must not dispatch.'); },
    reportError: () => undefined,
  });

  await saveObserved.promise;
  const reopenOperation = authority.begin();
  const reopened = await openEditorProjectIfCurrent(authority, reopenOperation, fixture.project.id, {
    getProject: getEditorProject,
    getAssetsForProject: getEditorAssetsForProject,
    activate: (project, nextAssetsById) => {
      currentProject = project;
      activeProjectId = project.id;
      assetsByIdRef = nextAssetsById;
      reactAssetsById = nextAssetsById;
      reactAssetUrlsById = registry.sync(Object.values(nextAssetsById));
    },
    reportError: (message) => { throw new Error(message); },
  });
  assert.equal(reopened, true);
  assert.ok(assetsByIdRef[importedAssetId]);
  assert.ok(reactAssetUrlsById[importedAssetId]);
  saveGate.resolve();

  assert.equal(await importing, false);
  assert.equal(await getEditorAsset(importedAssetId), null);
  assert.equal(assetsByIdRef[importedAssetId], undefined);
  assert.equal(reactAssetsById[importedAssetId], undefined);
  assert.equal(reactAssetUrlsById[importedAssetId], undefined);
  assert.ok(assetsByIdRef[fixture.asset.id]);
  assert.ok(assetsByIdRef[sibling.id]);
  assert.deepEqual(revoked, ['blob:3']);

  registry.dispose();
  await deleteEditorProject(fixture.project.id);
});

test('a failed secondary layer dispatch deletes the persisted orphan and reports one stable error', async () => {
  const events: string[] = [];
  const errors: string[] = [];
  const imported = await importAdditionalImageLayer(new File(['secondary'], 'secondary.png', { type: 'image/png' }), {
    getActiveProjectId: () => 'project-a',
    isProjectActive: () => true,
    readDimensions: async () => ({ width: 80, height: 60 }),
    saveAsset: async (asset) => { events.push(`save:${asset.id}`); },
    deleteAsset: async (assetId) => { events.push(`delete:${assetId}`); },
    dispatchLayer: () => { throw new Error('Dispatch failed.'); },
    reportError: (message) => { errors.push(message); },
  });

  assert.equal(imported, false);
  assert.equal(events.length, 2);
  assert.equal(events[1], events[0].replace('save:', 'delete:'));
  assert.deepEqual(errors, [ADDITIONAL_IMAGE_IMPORT_ERROR]);
});

test('secondary import retries transient orphan cleanup before reporting the stable import error', async () => {
  let cleanupAttempts = 0;
  const deletedAssets: string[] = [];
  const errors: string[] = [];
  const imported = await importAdditionalImageLayer(new File(['secondary'], 'secondary.png', { type: 'image/png' }), {
    getActiveProjectId: () => 'project-a',
    isProjectActive: () => true,
    readDimensions: async () => ({ width: 80, height: 60 }),
    saveAsset: async () => undefined,
    deleteAsset: async (assetId) => {
      cleanupAttempts += 1;
      if (cleanupAttempts < 3) throw new Error('Cleanup temporarily unavailable.');
      deletedAssets.push(assetId);
    },
    onAssetDeleted: (asset) => { assert.deepEqual(deletedAssets, [asset.id]); },
    dispatchLayer: () => { throw new Error('Dispatch failed.'); },
    reportError: (message) => { errors.push(message); },
  });

  assert.equal(imported, false);
  assert.equal(cleanupAttempts, 3);
  assert.equal(deletedAssets.length, 1);
  assert.deepEqual(errors, [ADDITIONAL_IMAGE_IMPORT_ERROR]);
});

test('secondary import reports explicit cleanup failure after bounded orphan deletion attempts', async () => {
  let cleanupAttempts = 0;
  let reconciled = false;
  const errors: string[] = [];
  const imported = await importAdditionalImageLayer(new File(['secondary'], 'secondary.png', { type: 'image/png' }), {
    getActiveProjectId: () => 'project-a',
    isProjectActive: () => true,
    readDimensions: async () => ({ width: 80, height: 60 }),
    saveAsset: async () => undefined,
    deleteAsset: async () => {
      cleanupAttempts += 1;
      throw new Error('Cleanup unavailable.');
    },
    onAssetDeleted: () => { reconciled = true; },
    dispatchLayer: () => { throw new Error('Dispatch failed.'); },
    reportError: (message) => { errors.push(message); },
  });

  assert.equal(imported, false);
  assert.equal(cleanupAttempts, 3);
  assert.equal(reconciled, false);
  assert.deepEqual(errors, [ADDITIONAL_IMAGE_IMPORT_CLEANUP_ERROR]);
});

test('secondary cleanup retains an imported asset referenced by the current project', async () => {
  let referencedAssetId = '';
  const deletedAssets: string[] = [];
  const errors: string[] = [];
  const imported = await importAdditionalImageLayer(new File(['secondary'], 'secondary.png', { type: 'image/png' }), {
    getActiveProjectId: () => 'project-a',
    isProjectActive: () => true,
    readDimensions: async () => ({ width: 80, height: 60 }),
    saveAsset: async (asset) => { referencedAssetId = asset.id; },
    deleteAsset: async (assetId) => { deletedAssets.push(assetId); },
    isAssetReferenced: (asset) => asset.id === referencedAssetId,
    onAssetDeleted: () => { throw new Error('Referenced asset must not be pruned.'); },
    dispatchLayer: () => { throw new Error('Dispatch failed.'); },
    reportError: (message) => { errors.push(message); },
  });

  assert.equal(imported, false);
  assert.deepEqual(deletedAssets, []);
  assert.deepEqual(errors, [ADDITIONAL_IMAGE_IMPORT_ERROR]);
});

test('a stale import cleans its persisted project instead of replacing a newer open', async () => {
  const authority = new WorkspaceOperationAuthority();
  const persisted = deferred<void>();
  const importOperation = authority.begin();
  const cleanedProjects: string[] = [];
  let activeProject = 'initial';

  const imported = (async () => {
    await persisted.promise;
    return await applyImportedProjectIfCurrent(
      authority,
      importOperation,
      () => { activeProject = 'imported'; },
      async () => { cleanedProjects.push('imported'); },
    );
  })();

  const openOperation = authority.begin();
  assert.equal(applyNavigationIfCurrent(authority, openOperation, () => { activeProject = 'project-b'; }), true);
  persisted.resolve();

  assert.equal(await imported, false);
  assert.equal(activeProject, 'project-b');
  assert.deepEqual(cleanedProjects, ['imported']);
});

test('contains superseded import cleanup rejection, refreshes, and reports a stable error', async () => {
  const authority = new WorkspaceOperationAuthority();
  const importOperation = authority.begin();
  authority.begin();
  const events: string[] = [];

  const applied = await completeImportedProjectIfCurrent(
    authority,
    importOperation,
    () => { events.push('apply'); },
    async () => { throw new Error('IndexedDB cleanup detail.'); },
    async () => { events.push('refresh'); },
    (message) => { events.push(`error:${message}`); },
  );

  assert.equal(applied, false);
  assert.deepEqual(events, ['refresh', `error:${IMPORT_CLEANUP_ERROR}`]);
});

test('a delayed delete of A cannot clear a newer open of B', async () => {
  const authority = new WorkspaceOperationAuthority();
  const persistence = new WorkspacePersistenceController();
  const saveGate = deferred<void>();
  let activeProject = 'project-a';

  const save = persistence.enqueueSave('project-a', async () => { await saveGate.promise; });
  await flushMicrotasks();
  const deleteOperation = authority.begin();
  const deleteLease = persistence.beginDelete('project-a');
  const deletion = persistence.enqueueDelete(deleteLease, async () => {
    if (authority.owns(deleteOperation) && activeProject === 'project-a') activeProject = 'none';
  });

  const openOperation = authority.begin();
  assert.equal(applyNavigationIfCurrent(authority, openOperation, () => { activeProject = 'project-b'; }), true);
  saveGate.resolve();
  await save;
  await deletion;

  assert.equal(activeProject, 'project-b');
});

test('a completed delete clears its still-active project after a newer open fails', () => {
  assert.equal(shouldClearWorkspaceAfterDelete('project-a', 'project-a'), true);
  assert.equal(shouldClearWorkspaceAfterDelete('project-b', 'project-a'), false);
});

test('deleting a project excludes pending and later autosaves from recreating it', async () => {
  const persistence = new WorkspacePersistenceController();
  const saveGate = deferred<void>();
  const storedProjects = new Set<string>();
  const firstSave = persistence.enqueueSave('project-a', async () => {
    await saveGate.promise;
    storedProjects.add('project-a');
  });
  await flushMicrotasks();
  const deleteLease = persistence.beginDelete('project-a');
  const deletion = persistence.enqueueDelete(deleteLease, async () => { storedProjects.delete('project-a'); });
  const laterSave = persistence.enqueueSave('project-a', async () => { storedProjects.add('project-a'); });

  saveGate.resolve();
  await firstSave;
  await deletion;
  await laterSave;

  assert.equal(storedProjects.has('project-a'), false);
});

test('asset URL registry reuses immutable assets and revokes removed URLs exactly once', () => {
  const created: string[] = [];
  const revoked: string[] = [];
  let nextUrl = 0;
  const registry = new AssetUrlRegistry({
    createObjectURL: () => {
      const url = `blob:${++nextUrl}`;
      created.push(url);
      return url;
    },
    revokeObjectURL: (url) => { revoked.push(url); },
  });
  const projectId = `project_${crypto.randomUUID()}`;
  const source = createEditorAsset(projectId, new Blob(['source']), { name: 'source.png', width: 10, height: 10 });
  const secondary = createEditorAsset(projectId, new Blob(['secondary']), { name: 'secondary.png', width: 5, height: 5 });

  assert.deepEqual(registry.sync([source, secondary]), {
    [source.id]: 'blob:1',
    [secondary.id]: 'blob:2',
  });
  assert.deepEqual(registry.sync([{ ...source }, { ...secondary }]), {
    [source.id]: 'blob:1',
    [secondary.id]: 'blob:2',
  });
  assert.deepEqual(registry.sync([secondary]), { [secondary.id]: 'blob:2' });
  registry.dispose();
  registry.dispose();

  assert.deepEqual(created, ['blob:1', 'blob:2']);
  assert.deepEqual(revoked, ['blob:1', 'blob:2']);
});

test('autosave failure reports the hook-facing error transition and keeps the queue usable', async () => {
  const persistence = new WorkspacePersistenceController();
  assert.deepEqual(
    await runAutosaveAttempt(persistence, 'project-a', async () => { throw new Error('Disk unavailable.'); }),
    { status: 'error', error: 'Disk unavailable.' },
  );
  assert.deepEqual(
    await runAutosaveAttempt(persistence, 'project-a', async () => undefined),
    { status: 'saved', error: null },
  );
});

test('queues the latest in-memory project revision for an explicit retry', async () => {
  const persistence = new WorkspacePersistenceController();
  const fixture = createOpenFixture('project-retry');
  const latest = structuredClone(fixture.project);
  latest.name = 'Latest in memory';
  latest.updatedAt += 2;
  let savedRevision: { name: string; updatedAt: number } | null = null;
  let refreshes = 0;

  const result = await queueWorkspaceRevision(persistence, latest, {
    saveProject: async (project) => {
      savedRevision = { name: project.name, updatedAt: project.updatedAt };
    },
    refreshProjects: async () => { refreshes += 1; },
  });

  assert.deepEqual(result, { status: 'saved', error: null });
  assert.deepEqual(savedRevision, { name: 'Latest in memory', updatedAt: latest.updatedAt });
  assert.equal(refreshes, 1);
});

test('a failed delete superseded by opening B releases A for a later save', async () => {
  const authority = new WorkspaceOperationAuthority();
  const persistence = new WorkspacePersistenceController();
  let activeProject = 'project-a';
  const deleteOperation = authority.begin();
  const deleteLease = persistence.beginDelete('project-a');
  const deletion = persistence.enqueueDelete(deleteLease, async () => { throw new Error('Delete failed.'); });

  const openOperation = authority.begin();
  applyNavigationIfCurrent(authority, openOperation, () => { activeProject = 'project-b'; });
  await assert.rejects(deletion, /Delete failed/);

  assert.equal(authority.owns(deleteOperation), false);
  assert.equal(activeProject, 'project-b');
  assert.equal(persistence.isBlocked('project-a'), false);
  assert.deepEqual(
    await runAutosaveAttempt(persistence, 'project-a', async () => undefined),
    { status: 'saved', error: null },
  );
});

test('a failed delete of active edited A releases and retries its stranded revision', async () => {
  const persistence = new WorkspacePersistenceController();
  const editedRevision = 2;
  let persistedRevision = 1;
  const deleteLease = persistence.beginDelete('project-a');

  assert.deepEqual(
    await runAutosaveAttempt(persistence, 'project-a', async () => { persistedRevision = editedRevision; }),
    { status: 'blocked', error: null },
  );
  await assert.rejects(
    persistence.enqueueDelete(deleteLease, async () => { throw new Error('Delete failed.'); }),
    /Delete failed/,
  );

  const retryGeneration = getAutosaveRetryGeneration(0, 'project-a', 'project-a');
  assert.equal(retryGeneration, 1);
  assert.deepEqual(
    await runAutosaveAttempt(persistence, 'project-a', async () => { persistedRevision = editedRevision; }),
    { status: 'saved', error: null },
  );
  assert.equal(persistedRevision, editedRevision);
  assert.equal(getAutosaveRetryGeneration(retryGeneration, 'project-b', 'project-a'), retryGeneration);
});

test('overlapping delete leases do not prematurely allow project saves', async () => {
  const persistence = new WorkspacePersistenceController();
  const firstLease = persistence.beginDelete('project-a');
  const secondLease = persistence.beginDelete('project-a');
  const secondGate = deferred<void>();
  const firstDeletion = persistence.enqueueDelete(firstLease, async () => { throw new Error('First delete failed.'); });
  const secondDeletion = persistence.enqueueDelete(secondLease, async () => { await secondGate.promise; });

  await assert.rejects(firstDeletion, /First delete failed/);
  assert.equal(persistence.isBlocked('project-a'), true);
  secondGate.reject(new Error('Second delete failed.'));
  await assert.rejects(secondDeletion, /Second delete failed/);
  assert.equal(persistence.isBlocked('project-a'), false);
});

test('cleanup failure after a project save failure is surfaced after bounded retries', async () => {
  let attempts = 0;
  await assert.rejects(
    cleanupImportedProject('project-a', new Error('Project save failed.'), async () => {
      attempts += 1;
      throw new Error('Cleanup unavailable.');
    }, 2),
    (error: Error) => error.message === 'Import failed: Project save failed. Cleanup failed: Cleanup unavailable.',
  );
  assert.equal(attempts, 2);
});
