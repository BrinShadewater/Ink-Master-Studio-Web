import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SourceUrlOwner,
  WorkspaceOperationAuthority,
  WorkspacePersistenceController,
  applyImportedProjectIfCurrent,
  applyNavigationIfCurrent,
  cleanupImportedProject,
  getAutosaveRetryGeneration,
  openEditorProjectIfCurrent,
  runAutosaveAttempt,
  validateRasterImport,
} from '../editor/useEditorWorkspace';
import { createEditorAsset, createEditorProject } from '../editor/model';

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
    getAsset: async (assetId) => assetId === fixture.asset.id ? fixture.asset : null,
    activate: (project) => { activeProjectId = project.id; },
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
    getAsset: async () => { throw new Error('Asset lookup should not run.'); },
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
    getAsset: async () => fixture.asset,
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

test('source URL ownership revokes each owned URL once on replacement and unmount', () => {
  const events: string[] = [];
  let nextUrl = 0;
  const owner = new SourceUrlOwner({
    createObjectURL: () => `blob:${++nextUrl}`,
    revokeObjectURL: (url) => { events.push(`revoke:${url}`); },
  });

  assert.equal(owner.replace(new Blob(['first'])), 'blob:1');
  assert.equal(owner.replace(new Blob(['second'])), 'blob:2');
  owner.dispose();
  owner.dispose();

  assert.deepEqual(events, ['revoke:blob:1', 'revoke:blob:2']);
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
