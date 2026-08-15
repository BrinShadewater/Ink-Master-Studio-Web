import { expect, test } from '@playwright/test';
import {
  artifactPath,
  phase2aArtifactPath,
  createPngFixture,
  uploadFixture,
  openVariationMenu,
  duplicateVariation,
  deleteVariation,
  renameVariation,
  openLayers,
  closeLayers,
  addTextLayer,
  uploadTransparentFixture,
  uploadLayerFixture,
  dropFixture,
  expectCanvasPainted,
  readPersistedEditorState,
  readPersistedComposition,
  readPersistedWorkspace,
  readPersistedPhase3AWorkspace,
  expectPersistedImageAssets,
  readCanvasPixels,
  canonicalDragValue,
  expectedCanonicalDragValue,
} from './support/editor-helpers';

test('schema 7 preserves legacy Look Product state and picks', async ({ page }) => {
  const projectName = 'schema-7-legacy-preservation';
  await page.goto('/editor');
  await uploadTransparentFixture(page, 320, 240, `${projectName}.png`);
  await expect.poll(() => readPersistedPhase3AWorkspace(page, projectName)).not.toBeNull();

  await page.evaluate(async (name) => {
    await new Promise<void>((resolve, reject) => {
      const openRequest = indexedDB.open('inkmaster-studio');
      openRequest.onerror = () => reject(openRequest.error ?? new Error('Could not open IndexedDB.'));
      openRequest.onsuccess = () => {
        const database = openRequest.result;
        const transaction = database.transaction('editor-projects', 'readwrite');
        const store = transaction.objectStore('editor-projects');
        const request = store.getAll();
        request.onerror = () => reject(request.error ?? new Error('Could not read editor projects.'));
        request.onsuccess = () => {
          const project = request.result.find((candidate) => candidate.name === name);
          if (!project) {
            reject(new Error('Seed project not found.'));
            return;
          }
          project.schemaVersion = 6;
          const variation = project.variations[0];
          delete variation.looks;
          variation.look = {
            id: 'duotone', strength: 65, shadowColor: '#112233', highlightColor: '#ddeeff', balance: 12,
          };
          variation.layers[0].backgroundRemoval = {
            ...variation.layers[0].backgroundRemoval,
            mode: 'picked',
            picks: [
              { color: '#112233', point: { x: 0.2, y: 0.3 } },
              { color: '#ddeeff', point: { x: 0.7, y: 0.8 } },
            ],
          };
          project.productVariants[0].mockupSlug = 'white';
          project.productVariants[0].placement = { x: 0.37, y: 0.61, scale: 0.82, rotation: 9 };
          store.put(project);
        };
        transaction.onerror = () => reject(transaction.error ?? new Error('Could not seed schema 6 project.'));
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
      };
    });
  }, projectName);

  await page.reload();
  await page.getByRole('button', { name: 'Open local projects', exact: true }).click();
  await page.getByRole('dialog').getByRole('button').filter({ hasText: projectName }).click();
  const projectNameInput = page.getByLabel('Project name', { exact: true });
  await expect(projectNameInput).toHaveValue(projectName);
  await projectNameInput.fill(`${projectName} temp`);
  await projectNameInput.press('Enter');
  await projectNameInput.fill(projectName);
  await projectNameInput.press('Enter');
  await expect.poll(async () => page.evaluate(async (name) => {
    return new Promise<any>((resolve, reject) => {
      const openRequest = indexedDB.open('inkmaster-studio');
      openRequest.onerror = () => reject(openRequest.error ?? new Error('Could not open IndexedDB.'));
      openRequest.onsuccess = () => {
        const database = openRequest.result;
        const request = database.transaction('editor-projects').objectStore('editor-projects').getAll();
        request.onerror = () => reject(request.error ?? new Error('Could not read editor projects.'));
        request.onsuccess = () => {
          const project = request.result.find((candidate) => candidate.name === name);
          database.close();
          resolve(project ? {
            schemaVersion: project.schemaVersion,
            looks: project.variations[0].looks,
            product: project.productVariants[0],
            picks: project.variations[0].layers[0].backgroundRemoval.picks,
          } : null);
        };
      };
    });
  }, projectName)).toEqual({
    schemaVersion: 7,
    looks: [{
      id: 'duotone', strength: 65, shadowColor: '#112233', highlightColor: '#ddeeff', balance: 12,
    }],
    product: expect.objectContaining({
      mockupSlug: 'white', placement: { x: 0.37, y: 0.61, scale: 0.82, rotation: 9 },
    }),
    picks: [
      { color: '#112233', point: { x: 0.2, y: 0.3 } },
      { color: '#ddeeff', point: { x: 0.7, y: 0.8 } },
    ],
  });
});

test('composes ordered image and text layers with persistence on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');
  const canvas = page.getByLabel('Design canvas');

  await uploadFixture(page, 1200, 800, 'phase-2a-base.png');
  await uploadLayerFixture(page, 640, 960, 'phase-2a-overlay.png');
  await openLayers(page);
  await expect(page.getByRole('button', { name: 'Select layer phase-2a-overlay.png' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Add text', exact: true }).click();

  // Adding a text layer closes the drawer (addTextLayerFromPanel calls closeMobileDrawer).
  await openLayers(page);
  await page.getByLabel('Layer name: Text').fill('Phase 2A headline');
  await page.getByLabel('Layer name: Text').press('Enter');
  // The drawer is modal — leave it open and it swallows every later inspector click.
  await closeLayers(page);
  await page.getByLabel('Content', { exact: true }).fill('INK\nIN ORDER');
  await page.getByLabel('Content', { exact: true }).blur();
  await page.getByLabel('Font', { exact: true }).selectOption('Georgia');
  await page.getByLabel('Size', { exact: true }).fill('88');
  await page.getByLabel('Size', { exact: true }).press('Enter');
  await page.getByLabel('Fill color', { exact: true }).fill('#111827');
  await page.getByLabel('Fill color', { exact: true }).blur();
  await page.getByRole('button', { name: 'Align center', exact: true }).click();
  await page.getByLabel('Letter spacing', { exact: true }).fill('3');
  await page.getByLabel('Letter spacing', { exact: true }).blur();
  await page.getByLabel('Outline width', { exact: true }).fill('3');
  await page.getByLabel('Outline width', { exact: true }).blur();
  await page.getByLabel('Outline color', { exact: true }).fill('#f8fafc');
  await page.getByLabel('Outline color', { exact: true }).blur();

  // Everything from here to the canvas drag below is drawer work.
  await openLayers(page);
  await page.getByRole('button', { name: 'Move layer down' }).click();
  const overlayRow = page.locator('li').filter({
    has: page.getByRole('button', { name: 'Select layer phase-2a-overlay.png' }),
  });
  await overlayRow.getByRole('button', { name: 'Select layer phase-2a-overlay.png' }).click();
  await overlayRow.getByRole('button', { name: 'Hide layer' }).click();
  await expect(overlayRow.getByRole('button', { name: 'Show layer' })).toBeVisible();
  await page.getByRole('button', { name: 'Select layer Phase 2A headline' }).click();
  await page.getByRole('button', { name: 'Duplicate layer' }).click();
  const duplicateButton = page.getByRole('button', { name: 'Select layer Phase 2A headline copy' });
  await expect(duplicateButton).toHaveAttribute('aria-pressed', 'true');
  const duplicateLayerId = await duplicateButton.getAttribute('value');
  expect(duplicateLayerId).toBeTruthy();
  const sourceTextRow = page.locator('li').filter({
    has: page.getByRole('button', { name: 'Select layer Phase 2A headline', exact: true }),
  });
  await sourceTextRow.getByRole('button', { name: 'Hide layer' }).click();
  await expect(sourceTextRow.getByRole('button', { name: 'Show layer' })).toBeVisible();

  const baseButton = page.getByRole('button', { name: 'Select layer phase-2a-base.png' });
  const baseLayerId = await baseButton.getAttribute('value');
  expect(baseLayerId).toBeTruthy();
  await baseButton.click();
  await expect(canvas).toHaveAttribute('data-selected-layer-id', baseLayerId!);
  await closeLayers(page);
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error('Canvas bounds are unavailable.');
  const center = { x: canvasBox.x + canvasBox.width / 2, y: canvasBox.y + canvasBox.height / 2 };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + canvasBox.width * 0.1, center.y - canvasBox.height * 0.08);
  await page.mouse.up();
  const expectedStoredX = canonicalDragValue(0.5, canvasBox.width * 0.1, canvasBox);
  const expectedStoredY = canonicalDragValue(0.5, -canvasBox.height * 0.08, canvasBox);
  const expectedDragX = expectedCanonicalDragValue(0.5, canvasBox.width * 0.1, canvasBox);
  const expectedDragY = expectedCanonicalDragValue(0.5, -canvasBox.height * 0.08, canvasBox);
  await expect(canvas).toHaveAttribute('data-selected-layer-id', duplicateLayerId!);
  await expect(page.getByLabel('X position', { exact: true })).toHaveValue(expectedDragX);
  await expect(page.getByLabel('Y position', { exact: true })).toHaveValue(expectedDragY);

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByLabel('X position', { exact: true })).toHaveValue('0.5');
  await expect(page.getByLabel('Y position', { exact: true })).toHaveValue('0.5');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByLabel('X position', { exact: true })).toHaveValue(expectedDragX);
  await expect(page.getByLabel('Y position', { exact: true })).toHaveValue(expectedDragY);

  const expectedLayerNames = [
    'phase-2a-base.png',
    'Phase 2A headline',
    'Phase 2A headline copy',
    'phase-2a-overlay.png',
  ];
  await expect.poll(async () => (await readPersistedComposition(page, 'phase-2a-base'))?.layers.map(({ name }) => name))
    .toEqual(expectedLayerNames);
  const beforeReload = await readPersistedComposition(page, 'phase-2a-base');
  expect(beforeReload).not.toBeNull();
  expect(beforeReload?.layers[1].visible).toBe(false);
  expect(beforeReload?.layers[3].visible).toBe(false);
  expect(beforeReload?.layers[2]).toMatchObject({
    id: duplicateLayerId,
    type: 'text',
    text: 'INK\nIN ORDER',
    fontFamily: 'Georgia',
    fontSize: 88,
    color: '#111827',
    align: 'center',
    letterSpacing: 3,
    outlineWidth: 3,
    outlineColor: '#f8fafc',
    transform: { x: expectedStoredX, y: expectedStoredY },
  });
  await expectCanvasPainted(canvas);
  const canvasBeforeReload = await readCanvasPixels(canvas);
  await page.waitForTimeout(500);
  await expect(page.getByLabel('Project name')).toBeVisible();
  const workspaceBeforeReload = await readPersistedWorkspace(page, 'phase-2a-base');
  expect(workspaceBeforeReload).not.toBeNull();
  expectPersistedImageAssets(workspaceBeforeReload!, {
    'phase-2a-base.png': { width: 1200, height: 800 },
    'phase-2a-overlay.png': { width: 640, height: 960 },
  });
  await page.screenshot({
    path: phase2aArtifactPath('desktop-layers-1440x900.png'),
    animations: 'disabled',
  });

  await page.reload();
  await page.getByRole('button', { name: 'Open local projects' }).click();
  await page.getByRole('dialog').getByRole('button').filter({ hasText: 'phase-2a-base' }).click();
  await expect.poll(() => readPersistedComposition(page, 'phase-2a-base')).toEqual(beforeReload);
  await expect(canvas).toHaveAttribute('data-selected-layer-id', duplicateLayerId!);
  // The reload closed the drawer, so reopen it to inspect the layer list.
  await openLayers(page);
  await expect(duplicateButton).toHaveAttribute('aria-pressed', 'true');
  await closeLayers(page);
  await expect(page.getByLabel('Content', { exact: true })).toHaveValue('INK\nIN ORDER');
  await expect(page.getByLabel('Font', { exact: true })).toHaveValue('Georgia');
  await expect(page.getByLabel('Size', { exact: true })).toHaveValue('88');
  await expect(page.getByLabel('X position', { exact: true })).toHaveValue(expectedDragX);
  await expect(page.getByLabel('Y position', { exact: true })).toHaveValue(expectedDragY);
  await expectCanvasPainted(canvas);
  await expect.poll(() => readCanvasPixels(canvas)).toBe(canvasBeforeReload);
  const workspaceAfterReopen = await readPersistedWorkspace(page, 'phase-2a-base');
  expect(workspaceAfterReopen).toEqual(workspaceBeforeReload);
  expectPersistedImageAssets(workspaceAfterReopen!, {
    'phase-2a-base.png': { width: 1200, height: 800 },
    'phase-2a-overlay.png': { width: 640, height: 960 },
  });

  const reopenedOverlayRow = page.locator('li').filter({
    has: page.getByRole('button', { name: 'Select layer phase-2a-overlay.png' }),
  });
  await openLayers(page);
  await reopenedOverlayRow.getByRole('button', { name: 'Show layer' }).click();
  await expect.poll(() => readCanvasPixels(canvas)).not.toBe(canvasBeforeReload);
  const canvasWithOverlay = await readCanvasPixels(canvas);
  expect(canvasWithOverlay).not.toBe(canvasBeforeReload);
  await reopenedOverlayRow.getByRole('button', { name: 'Hide layer' }).click();
  await expect.poll(() => readCanvasPixels(canvas)).toBe(canvasBeforeReload);
  await closeLayers(page);
});

test('manages layers on mobile without covering the canvas', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/editor');
  await uploadFixture(page, 900, 1200, 'phase-2a-mobile.png');
  const canvas = page.getByLabel('Design canvas');
  await expectCanvasPainted(canvas);
  await page.waitForTimeout(500);
  await expect(page.getByLabel('Project name')).toBeVisible();
  const canvasBeforeText = await readCanvasPixels(canvas);

  await page.getByRole('button', { name: 'Layers' }).click();
  let drawer = page.locator('[role="dialog"][aria-labelledby="mobile-layers-title"]');
  await expect(drawer).toBeVisible();
  await drawer.getByRole('button', { name: 'Add text', exact: true }).click();
  await expect(drawer).toHaveCount(0);

  await page.getByRole('button', { name: 'Layers' }).click();
  drawer = page.locator('[role="dialog"][aria-labelledby="mobile-layers-title"]');
  const mobileLayerNames = drawer.locator('input[aria-label^="Layer name:"]');
  const readMobileLayerNames = () => mobileLayerNames.evaluateAll((inputs) =>
    inputs.map((input) => (input as HTMLInputElement).value));
  await expect.poll(readMobileLayerNames).toEqual(['Text', 'phase-2a-mobile.png']);
  await drawer.getByRole('button', { name: 'Move layer down' }).click();
  await expect.poll(readMobileLayerNames).toEqual(['phase-2a-mobile.png', 'Text']);
  await drawer.getByRole('button', { name: 'Move layer up' }).click();
  await expect.poll(readMobileLayerNames).toEqual(['Text', 'phase-2a-mobile.png']);
  await drawer.getByRole('button', { name: 'Close layers' }).click();
  await expect(drawer).toHaveCount(0);

  await page.getByLabel('Content', { exact: true }).fill('MOBILE LAYERS');
  await page.getByLabel('Content', { exact: true }).blur();
  await page.getByLabel('Font', { exact: true }).selectOption('Impact');
  await page.getByLabel('Size', { exact: true }).fill('64');
  await page.getByLabel('Size', { exact: true }).press('Enter');
  await page.getByLabel('Fill color', { exact: true }).fill('#111827');
  await page.getByLabel('Fill color', { exact: true }).blur();
  await page.getByRole('button', { name: 'Align center', exact: true }).click();
  await page.getByLabel('Outline width', { exact: true }).fill('2');
  await page.getByLabel('Outline width', { exact: true }).blur();
  await page.getByLabel('Outline color', { exact: true }).fill('#f8fafc');
  await page.getByLabel('Outline color', { exact: true }).blur();
  await expectCanvasPainted(canvas);
  await expect(page.getByLabel('Content', { exact: true })).toHaveValue('MOBILE LAYERS');
  await expect(page.getByLabel('Font', { exact: true })).toHaveValue('Impact');
  await expect(page.getByLabel('Size', { exact: true })).toHaveValue('64');
  await expect(page.getByLabel('Fill color', { exact: true })).toHaveValue('#111827');
  await expect(page.getByLabel('Outline color', { exact: true })).toHaveValue('#f8fafc');
  await expect(page.getByRole('button', { name: 'Align center', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Letter spacing', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('Outline width', { exact: true })).toHaveValue('2');
  await expect(page.getByLabel('Opacity', { exact: true })).toHaveValue('100');
  await expect(page.getByLabel('X position', { exact: true })).toHaveValue('0.5');
  await expect(page.getByLabel('Y position', { exact: true })).toHaveValue('0.5');
  await expect.poll(() => readCanvasPixels(canvas)).not.toBe(canvasBeforeText);
  const canvasWithText = await readCanvasPixels(canvas);
  expect(canvasWithText).not.toBe(canvasBeforeText);

  await page.waitForTimeout(500);
  await expect(page.getByLabel('Project name')).toBeVisible();
  const mobileWorkspace = await readPersistedWorkspace(page, 'phase-2a-mobile');
  expect(mobileWorkspace).not.toBeNull();
  expect(mobileWorkspace?.composition.layers.map(({ type, name }) => ({ type, name }))).toEqual([
    { type: 'image', name: 'phase-2a-mobile.png' },
    { type: 'text', name: 'Text' },
  ]);
  const persistedMobileText = mobileWorkspace?.composition.layers[1];
  expect(persistedMobileText).toMatchObject({
    type: 'text',
    name: 'Text',
    visible: true,
    opacity: 1,
    text: 'MOBILE LAYERS',
    fontFamily: 'Impact',
    fontSize: 64,
    color: '#111827',
    align: 'center',
    letterSpacing: 0,
    outlineWidth: 2,
    outlineColor: '#f8fafc',
    transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, flipX: false, flipY: false },
  });
  expect(mobileWorkspace?.composition.selectedLayerId).toBe(persistedMobileText?.id);

  const layout = await page.evaluate(() => {
    const bounds = (selector: string) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) throw new Error(`Missing ${selector}`);
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      };
    };
    return {
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: document.documentElement.clientHeight,
      scrollWidth: document.documentElement.scrollWidth,
      canvas: bounds('canvas[aria-label="Design canvas"]'),
      inspector: bounds('aside[aria-label="Inspector"]'),
      toolbar: bounds('nav[aria-label="Editor tools"]'),
      drawerCount: document.querySelectorAll('[role="dialog"][aria-labelledby="mobile-layers-title"]').length,
    };
  });
  expect(layout.viewportWidth).toBe(390);
  expect(layout.viewportHeight).toBe(844);
  expect(layout.scrollWidth).toBe(390);
  expect(layout.drawerCount).toBe(0);
  for (const region of [layout.canvas, layout.inspector, layout.toolbar]) {
    expect(region.width).toBeGreaterThan(0);
    expect(region.height).toBeGreaterThan(0);
    expect(region.left).toBeGreaterThanOrEqual(-1);
    expect(region.top).toBeGreaterThanOrEqual(-1);
    expect(region.right).toBeLessThanOrEqual(391);
    expect(region.bottom).toBeLessThanOrEqual(845);
    expect(region.right).toBeGreaterThan(region.left);
    expect(region.bottom).toBeGreaterThan(region.top);
  }
  expect(layout.canvas.height).toBeGreaterThanOrEqual(160);
  expect(layout.canvas.bottom).toBeLessThanOrEqual(layout.inspector.top + 1);
  expect(layout.inspector.bottom).toBeLessThanOrEqual(layout.toolbar.top + 1);
  expect(layout.canvas.bottom).toBeLessThanOrEqual(layout.toolbar.top + 1);

  await page.getByLabel('Content', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: phase2aArtifactPath('mobile-layers-390x844.png'),
    animations: 'disabled',
  });
});

test('imports, edits, duplicates, autosaves, reloads, and reopens a local project', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');
  const canvas = page.getByLabel('Design canvas');
  await expect(canvas).toBeVisible();

  await uploadFixture(page, 1600, 900, 'film-still.png');
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  await expect(page.getByLabel('Project name')).toHaveValue('film-still');
  await expectCanvasPainted(canvas);

  await page.getByRole('button', { name: 'Adjust' }).click();
  await page.getByLabel('Contrast').fill('25');
  await duplicateVariation(page);
  await renameVariation(page, 'Print B');
  await expect(page.getByLabel('Variation').locator('option:checked')).toHaveText('Print B');
  await expect.poll(() => readPersistedEditorState(page, 'film-still')).toEqual({
    variation: 'Print B',
    variationNames: ['Original', 'Print B'],
    contrast: 25,
    x: 0.5,
  });
  await expect(page.getByLabel('Project name')).toBeVisible();

  const desktopLayout = await page.evaluate(() => {
    const canvasBounds = document.querySelector('canvas[aria-label="Design canvas"]')?.getBoundingClientRect();
    const inspectorBounds = document.querySelector('aside[aria-label="Inspector"]')?.getBoundingClientRect();
    if (!canvasBounds || !inspectorBounds) throw new Error('Desktop editor regions are unavailable.');
    return {
      canvasWidth: canvasBounds.width,
      canvasRight: canvasBounds.right,
      inspectorWidth: inspectorBounds.width,
      inspectorLeft: inspectorBounds.left,
    };
  });
  expect(desktopLayout.canvasWidth).toBeGreaterThan(900);
  expect(desktopLayout.inspectorWidth).toBe(304);
  expect(desktopLayout.canvasRight).toBeLessThanOrEqual(desktopLayout.inspectorLeft + 1);

  await page.screenshot({
    path: artifactPath('desktop-1440x900.png'),
    animations: 'disabled',
  });

  await page.reload();
  const openProjects = page.getByRole('button', { name: 'Open local projects' });
  await openProjects.click();
  await expect(page.getByRole('button', { name: 'Close projects' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(openProjects).toBeFocused();

  await openProjects.click();
  await page.getByRole('dialog').getByRole('button').filter({ hasText: 'film-still' }).click();
  // Editor mode is component state, not persisted, so a reload drops back to Basic.
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  await expect(page.getByLabel('Variation').locator('option:checked')).toHaveText('Print B');
  await page.getByRole('button', { name: 'Adjust' }).click();
  await expect(page.getByLabel('Contrast')).toHaveValue('25');
  await expectCanvasPainted(canvas);

  const projectName = page.getByLabel('Project name');
  await projectName.focus();
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  await page.keyboard.press('Escape');

  await page.getByLabel('Contrast').fill('40');
  await page.getByRole('button', { name: 'Adjust' }).click();
  await page.keyboard.press('Control+z');
  await expect(page.getByLabel('Contrast')).toHaveValue('25');
  await page.keyboard.press('Control+y');
  await expect(page.getByLabel('Contrast')).toHaveValue('40');
  await page.keyboard.press('Control+z');
  await expect(page.getByLabel('Contrast')).toHaveValue('25');
  await expect.poll(async () => (await readPersistedEditorState(page, 'film-still'))?.contrast).toBe(25);
  await page.reload();
  await page.getByRole('button', { name: 'Open local projects' }).click();
  await page.getByRole('dialog').getByRole('button').filter({ hasText: 'film-still' }).click();
  // Editor mode is component state, not persisted, so a reload drops back to Basic.
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  await page.getByRole('button', { name: 'Adjust' }).click();
  await expect(page.getByLabel('Contrast')).toHaveValue('25');
});

test('keeps undo and redo independent while alternating between variations', async ({ page }) => {
  await page.goto('/editor');
  await uploadFixture(page, 1200, 800, 'history-scope.png');
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  await page.getByLabel('X position').fill('0.7');
  await page.getByLabel('X position').blur();
  await duplicateVariation(page);
  await page.getByLabel('X position').fill('0.9');
  await page.getByLabel('X position').blur();

  await page.getByLabel('Variation', { exact: true }).selectOption({ label: 'Original' });
  await page.getByLabel('Y position').fill('0.2');
  await page.getByLabel('Y position').blur();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByLabel('Variation').locator('option:checked')).toHaveText('Original');
  await expect(page.getByLabel('Y position')).toHaveValue('0.5');

  await page.getByLabel('Variation', { exact: true }).selectOption({ label: 'Original copy' });
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByLabel('Variation').locator('option:checked')).toHaveText('Original copy');
  await expect(page.getByLabel('X position')).toHaveValue('0.7');
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.getByLabel('X position')).toHaveValue('0.9');

  await page.getByLabel('Variation', { exact: true }).selectOption({ label: 'Original' });
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.getByLabel('Variation').locator('option:checked')).toHaveText('Original');
  await expect(page.getByLabel('Y position')).toHaveValue('0.2');
});

test('renames and deletes variations with deterministic persisted fallback', async ({ page }) => {
  await page.goto('/editor');
  await uploadFixture(page, 800, 800, 'variation-management.png');
  await openVariationMenu(page);
  await expect(page.getByRole('button', { name: 'Delete variation' })).toBeDisabled();
  await duplicateVariation(page);
  await renameVariation(page, 'Back print');
  await duplicateVariation(page);
  await expect(page.getByLabel('Variation').locator('option:checked')).toHaveText('Back print copy');

  page.once('dialog', (dialog) => dialog.accept());
  await deleteVariation(page);
  await expect(page.getByLabel('Variation').locator('option:checked')).toHaveText('Back print');
  page.once('dialog', (dialog) => dialog.accept());
  await deleteVariation(page);
  await expect(page.getByLabel('Variation').locator('option:checked')).toHaveText('Original');
  await openVariationMenu(page);
  await expect(page.getByRole('button', { name: 'Delete variation' })).toBeDisabled();
  await expect.poll(async () => (await readPersistedEditorState(page, 'variation-management'))?.variationNames)
    .toEqual(['Original']);

  await page.reload();
  await page.getByRole('button', { name: 'Open local projects' }).click();
  await page.getByRole('dialog').getByRole('button').filter({ hasText: 'variation-management' }).click();
  await expect(page.getByLabel('Variation').locator('option')).toHaveCount(1);
  await expect(page.getByLabel('Variation').locator('option:checked')).toHaveText('Original');
});

test('keeps dedicated file inputs hidden while preserving labeled imports', async ({ page }) => {
  await page.goto('/editor');

  const primaryInput = page.locator('input[type="file"][aria-label="Import artwork file"]');
  const layerInput = page.locator('input[type="file"][aria-label="Add layer image file"]');
  await expect(primaryInput).toHaveCount(1);
  await expect(layerInput).toHaveCount(1);
  await expect(primaryInput).toBeHidden();
  await expect(layerInput).toBeHidden();
  await expect(primaryInput).toHaveAttribute('hidden', '');
  await expect(layerInput).toHaveAttribute('hidden', '');

  const buffer = await createPngFixture(page, 320, 240);
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByLabel('Project commands').getByRole('button', { name: 'Import artwork' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: 'hidden-input.png', mimeType: 'image/png', buffer });
  await expect(page.getByLabel('Project name')).toHaveValue('hidden-input');
  await expectCanvasPainted(page.getByLabel('Design canvas'));
});

test('edits text layers and keeps image tools reachable across selection fallback paths', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 844 });
  await page.goto('/editor');
  await uploadFixture(page, 640, 480, 'tool-paths.png');

  const select = page.getByRole('button', { name: 'Select', exact: true });
  const crop = page.getByRole('button', { name: 'Crop', exact: true });
  await addTextLayer(page);
  await expect(select).toHaveAttribute('aria-pressed', 'true');
  await expect(crop).toBeEnabled();
  // Adjust is a specialist: in Basic it lives behind More rather than on the toolbar,
  // and this test is about tools staying *reachable*, so check it where it now lives.
  // Basic is required here anyway — the Layers drawer below is Basic-only on desktop.
  await page.getByRole('button', { name: 'More tools', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Adjust' })).toBeEnabled();
  await page.getByRole('button', { name: 'More tools', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Text', exact: true })).toBeVisible();

  await page.getByLabel('Content', { exact: true }).fill('First line\nSecond line');
  await page.getByLabel('Font', { exact: true }).selectOption('Georgia');
  const fontSize = page.getByLabel('Size', { exact: true });
  await fontSize.click();
  await fontSize.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await fontSize.pressSequentially('72');
  await expect(fontSize).toHaveValue('72');
  await fontSize.press('Enter');
  await expect(fontSize).toHaveValue('72');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(fontSize).toHaveValue('48');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(fontSize).toHaveValue('72');
  await fontSize.fill('');
  await fontSize.blur();
  await expect(fontSize).toHaveValue('72');
  await fontSize.fill('96');
  await fontSize.press('Escape');
  await expect(fontSize).toHaveValue('72');
  // No uncommitted edit is left pending here on purpose. Reaching the layer list means
  // opening a focus-trapping drawer, which blurs the field and commits it — so the
  // round-trip below checks that selection restores the persisted value, which is the
  // fallback path this test is named for.
  await openLayers(page);
  await page.getByRole('button', { name: 'Select layer tool-paths.png' }).evaluate((button) => {
    (button as HTMLButtonElement).click();
  });
  await page.getByRole('button', { name: 'Select layer Text' }).evaluate((button) => {
    (button as HTMLButtonElement).click();
  });
  await closeLayers(page);
  await expect(page.getByLabel('Size', { exact: true })).toHaveValue('72');
  await page.getByLabel('Fill color', { exact: true }).fill('#336699');
  await page.getByRole('button', { name: 'Align center', exact: true }).click();
  await page.getByLabel('Letter spacing', { exact: true }).fill('4');
  await page.getByLabel('Outline width', { exact: true }).fill('2');
  await page.getByLabel('Outline color', { exact: true }).fill('#ffffff');
  await page.getByLabel('Opacity', { exact: true }).fill('75');
  await page.getByLabel('X position', { exact: true }).fill('0.6');
  await page.getByLabel('X position', { exact: true }).blur();

  await expect(page.getByLabel('Content', { exact: true })).toHaveValue('First line\nSecond line');
  await expect(page.getByLabel('Font', { exact: true })).toHaveValue('Georgia');
  await expect(page.getByLabel('Size', { exact: true })).toHaveValue('72');
  await expect(page.getByRole('button', { name: 'Align center', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('X position', { exact: true })).toHaveValue('0.6');

  await openLayers(page);
  await page.getByRole('button', { name: 'Duplicate layer' }).click();
  await expect(select).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Select layer tool-paths.png' }).click();
  await closeLayers(page);
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  await select.click();
  await expect(select).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('X position', { exact: true }).fill('0.7');
  await page.getByLabel('X position', { exact: true }).blur();
  await page.getByLabel('Opacity', { exact: true }).fill('40');
  await page.getByLabel('Opacity', { exact: true }).blur();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByLabel('X position', { exact: true })).toHaveValue('0.5');
  await expect(page.getByLabel('Opacity', { exact: true })).toHaveValue('100');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByLabel('X position', { exact: true })).toHaveValue('0.7');
  await expect(page.getByLabel('Opacity', { exact: true })).toHaveValue('40');
  await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeEnabled();
  await page.getByLabel('Horizontal', { exact: true }).check();
  await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeDisabled();
  await crop.click();
  await expect(crop).toHaveAttribute('aria-pressed', 'true');
  // Deleting is a drawer action, and the drawer is Basic-only at this width.
  await page.getByRole('radio', { name: 'Basic', exact: true }).click();
  await openLayers(page);
  await page.getByRole('button', { name: 'Delete layer' }).click();
  await closeLayers(page);
  await expect(select).toHaveAttribute('aria-pressed', 'true');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileLayout = await page.evaluate(() => {
    const inspector = document.querySelector('aside[aria-label="Inspector"]');
    const canvas = document.querySelector('canvas[aria-label="Design canvas"]');
    const toolbar = document.querySelector('nav[aria-label="Editor tools"]');
    if (!(inspector instanceof HTMLElement) || !(canvas instanceof HTMLElement) || !(toolbar instanceof HTMLElement)) {
      throw new Error('Expected the mobile editor regions.');
    }
    const inspectorBounds = inspector.getBoundingClientRect();
    const canvasBounds = canvas.getBoundingClientRect();
    const toolbarBounds = toolbar.getBoundingClientRect();
    return {
      pageOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      inspectorOverflows: inspector.scrollWidth > inspector.clientWidth + 1,
      canvasBottom: canvasBounds.bottom,
      inspectorTop: inspectorBounds.top,
      inspectorBottom: inspectorBounds.bottom,
      toolbarTop: toolbarBounds.top,
    };
  });
  expect(mobileLayout.pageOverflows).toBe(false);
  expect(mobileLayout.inspectorOverflows).toBe(false);
  expect(mobileLayout.canvasBottom).toBeLessThanOrEqual(mobileLayout.inspectorTop + 1);
  expect(mobileLayout.inspectorBottom).toBeLessThanOrEqual(mobileLayout.toolbarTop + 1);
  await page.getByLabel('X position', { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByLabel('X position', { exact: true })).toBeVisible();
});

test('separates text content sessions when selection unmounts the focused inspector', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 844 });
  await page.goto('/editor');
  await uploadFixture(page, 640, 480, 'content-sessions.png');
  await addTextLayer(page);

  // Both select via evaluate() to avoid moving focus, which is the point of this test.
  // The drawer still has to be opened to reach the buttons, and closed again so it does
  // not sit over the inspector.
  const selectImageWithoutFocus = async () => {
    await openLayers(page);
    await page.getByRole('button', { name: 'Select layer content-sessions.png' }).evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
    await closeLayers(page);
  };
  const selectTextWithoutFocus = async () => {
    await openLayers(page);
    await page.getByRole('button', { name: 'Select layer Text' }).evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
    await closeLayers(page);
  };

  await page.getByLabel('Content', { exact: true }).fill('First session');
  await selectImageWithoutFocus();
  await selectTextWithoutFocus();
  await expect(page.getByLabel('Content', { exact: true })).toHaveValue('First session');

  await page.getByLabel('Content', { exact: true }).fill('Second session');
  await selectImageWithoutFocus();
  await selectTextWithoutFocus();

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByLabel('Content', { exact: true })).toHaveValue('First session');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByLabel('Content', { exact: true })).toHaveValue('Text');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByLabel('Content', { exact: true })).toHaveValue('First session');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByLabel('Content', { exact: true })).toHaveValue('Second session');
});

test('groups text color control changes separately from discrete alignment', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 844 });
  await page.goto('/editor');
  await uploadFixture(page, 640, 480, 'color-groups.png');
  await addTextLayer(page);

  const fillColor = page.getByLabel('Fill color', { exact: true });
  await fillColor.fill('#112233');
  await fillColor.fill('#445566');
  await fillColor.fill('#778899');
  await fillColor.blur();
  await page.getByRole('button', { name: 'Align center', exact: true }).click();

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Align left', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(fillColor).toHaveValue('#778899');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(fillColor).toHaveValue('#000000');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(fillColor).toHaveValue('#778899');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Align center', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('does not expose the retired workflow surface and preserves static routes', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('InkMaster Studio | Canvas-First Merch Editor');
  await expect(page.getByRole('button', { name: 'Start designing' }).first()).toBeVisible();
  await expect(page.getByText(/Advanced mode|Production package|Customer proof|AI cleanup/i)).toHaveCount(0);

  await page.goto('/editor');
  await expect(page.getByRole('button', { name: 'Import artwork' }).last()).toBeVisible();

  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible();
  await expect(page).toHaveTitle('Privacy | InkMaster Studio');
});

test('imports by drop, revokes object URLs, and deletes the local project', async ({ page }) => {
  await page.addInitScript(() => {
    const events = { created: [] as string[], revoked: [] as string[] };
    const createObjectURL = URL.createObjectURL.bind(URL);
    const revokeObjectURL = URL.revokeObjectURL.bind(URL);
    Object.defineProperty(window, '__task7ObjectUrlEvents', { value: events });
    URL.createObjectURL = (blob: Blob) => {
      const url = createObjectURL(blob);
      events.created.push(url);
      return url;
    };
    URL.revokeObjectURL = (url: string) => {
      events.revoked.push(url);
      revokeObjectURL(url);
    };
  });

  await page.goto('/editor');
  await dropFixture(page, 800, 600, 'drop-art.png');
  await expect(page.getByLabel('Project name')).toHaveValue('drop-art');
  await expectCanvasPainted(page.getByLabel('Design canvas'));

  await uploadFixture(page, 640, 640, 'replacement.png');
  await expect(page.getByLabel('Project name')).toHaveValue('replacement');
  await expect.poll(() => page.evaluate(() => {
    const events = (window as unknown as { __task7ObjectUrlEvents: { created: string[]; revoked: string[] } }).__task7ObjectUrlEvents;
    return events.revoked.filter((url) => events.created.includes(url)).length;
  })).toBeGreaterThanOrEqual(1);
  await expect(page.getByLabel('Project name')).toBeVisible();

  await page.getByRole('button', { name: 'Open local projects' }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete replacement' }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete drop-art' }).click();
  await expect(page.getByText('No local projects.')).toBeVisible();
  await page.getByRole('button', { name: 'Close projects' }).click();
  await expect(page.getByRole('button', { name: 'Import artwork' }).last()).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const events = (window as unknown as { __task7ObjectUrlEvents: { created: string[]; revoked: string[] } }).__task7ObjectUrlEvents;
    return events.created.every((url) => events.revoked.includes(url));
  })).toBe(true);
});
