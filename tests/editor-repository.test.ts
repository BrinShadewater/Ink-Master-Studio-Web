import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEditorAsset, createEditorProject } from '../editor/model';
import {
  deleteEditorProject, getEditorAsset, getEditorProject,
  listEditorProjects, saveEditorAsset, saveEditorProject,
} from '../editor/projectRepository';

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
