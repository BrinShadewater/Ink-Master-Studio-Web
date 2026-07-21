import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SourceUrlOwner,
  WorkspaceOperationAuthority,
  WorkspacePersistenceController,
  applyImportedProjectIfCurrent,
  applyNavigationIfCurrent,
  cleanupImportedProject,
  validateRasterImport,
} from '../editor/useEditorWorkspace';

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

test('a stale open cannot replace a newer open', async () => {
  const authority = new WorkspaceOperationAuthority();
  const firstOpen = deferred<string>();
  const secondOpen = deferred<string>();
  let activeProject = 'initial';

  const loadProject = async (operation: number, result: Promise<string>) => {
    const projectId = await result;
    return applyNavigationIfCurrent(authority, operation, () => { activeProject = projectId; });
  };

  const first = loadProject(authority.begin(), firstOpen.promise);
  const second = loadProject(authority.begin(), secondOpen.promise);
  secondOpen.resolve('project-b');
  assert.equal(await second, true);
  firstOpen.resolve('project-a');
  assert.equal(await first, false);
  assert.equal(activeProject, 'project-b');
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
  const deletion = persistence.enqueueDelete('project-a', async () => {
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
  const deletion = persistence.enqueueDelete('project-a', async () => { storedProjects.delete('project-a'); });
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

test('autosave failure leaves the caller-owned in-memory project unchanged', async () => {
  const persistence = new WorkspacePersistenceController();
  const inMemoryProject = { id: 'project-a', name: 'Unsaved edit', updatedAt: 2 };

  await assert.rejects(
    persistence.enqueueSave(inMemoryProject.id, async () => { throw new Error('Disk unavailable.'); }),
    /Disk unavailable/,
  );
  assert.deepEqual(inMemoryProject, { id: 'project-a', name: 'Unsaved edit', updatedAt: 2 });
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
