import { expect, type Locator, type Page, test } from '@playwright/test';
import path from 'node:path';

const artifactPath = (name: string) => path.join(process.cwd(), 'test-results', 'task-7', name);

const createPngFixture = async (page: Page, width: number, height: number): Promise<Buffer> => {
  const bytes = await page.evaluate(async ({ fixtureWidth, fixtureHeight }) => {
    const canvas = document.createElement('canvas');
    canvas.width = fixtureWidth;
    canvas.height = fixtureHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable.');

    const gradient = context.createLinearGradient(0, 0, fixtureWidth, fixtureHeight);
    gradient.addColorStop(0, '#0f766e');
    gradient.addColorStop(0.55, '#f59e0b');
    gradient.addColorStop(1, '#dc2626');
    context.fillStyle = gradient;
    context.fillRect(0, 0, fixtureWidth, fixtureHeight);
    context.fillStyle = '#f8fafc';
    context.fillRect(
      Math.round(fixtureWidth * 0.2),
      Math.round(fixtureHeight * 0.2),
      Math.round(fixtureWidth * 0.6),
      Math.round(fixtureHeight * 0.6),
    );

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error('PNG fixture failed.')),
        'image/png',
      );
    });
    return [...new Uint8Array(await blob.arrayBuffer())];
  }, { fixtureWidth: width, fixtureHeight: height });
  return Buffer.from(bytes);
};

const uploadFixture = async (page: Page, width: number, height: number, name: string) => {
  const buffer = await createPngFixture(page, width, height);
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: 'image/png',
    buffer,
  });
};

const dropFixture = async (page: Page, width: number, height: number, name: string) => {
  const base64 = (await createPngFixture(page, width, height)).toString('base64');
  await page.getByLabel('Design canvas').evaluate((canvas, fixture) => {
    const bytes = Uint8Array.from(atob(fixture.base64), (character) => character.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], fixture.name, { type: 'image/png' }));
    const target = canvas.parentElement;
    if (!target) throw new Error('Canvas drop target is unavailable.');
    target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: transfer }));
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: transfer }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
  }, { base64, name });
};

const expectCanvasPainted = async (canvas: Locator) => {
  await expect.poll(async () => canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    const context = target.getContext('2d');
    if (!context || target.width === 0 || target.height === 0) return 0;
    const pixels = context.getImageData(0, 0, target.width, target.height).data;
    const colors = new Set<string>();
    const step = Math.max(4, Math.floor((target.width * target.height) / 400));
    for (let pixel = 0; pixel < pixels.length; pixel += step * 4) {
      colors.add(`${pixels[pixel]}:${pixels[pixel + 1]}:${pixels[pixel + 2]}:${pixels[pixel + 3]}`);
      if (colors.size >= 4) break;
    }
    return colors.size;
  })).toBeGreaterThanOrEqual(4);
};

const readPersistedEditorState = async (page: Page, projectName: string) => page.evaluate((name) => (
  new Promise<{ variation: string; variationNames: string[]; contrast: number; x: number } | null>((resolve, reject) => {
    const openRequest = indexedDB.open('inkmaster-studio');
    openRequest.onerror = () => reject(openRequest.error ?? new Error('Could not open IndexedDB.'));
    openRequest.onsuccess = () => {
      const database = openRequest.result;
      const request = database.transaction('editor-projects').objectStore('editor-projects').getAll();
      request.onerror = () => {
        database.close();
        reject(request.error ?? new Error('Could not read editor projects.'));
      };
      request.onsuccess = () => {
        const project = request.result.find((candidate) => candidate.name === name);
        const variation = project?.variations.find(
          (candidate: { id: string }) => candidate.id === project.activeVariationId,
        );
        const layer = variation?.layers.find(
          (candidate: { id: string }) => candidate.id === variation.selectedLayerId,
        );
        database.close();
        resolve(variation && layer
          ? {
              variation: variation.name,
              variationNames: project.variations.map((candidate: { name: string }) => candidate.name),
              contrast: layer.adjustments.contrast,
              x: layer.transform.x,
            }
          : null);
      };
    };
  })
), projectName);

test('imports, edits, duplicates, autosaves, reloads, and reopens a local project', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const canvas = page.getByLabel('Design canvas');
  await expect(canvas).toBeVisible();

  await uploadFixture(page, 1600, 900, 'film-still.png');
  await expect(page.getByLabel('Project name')).toHaveValue('film-still');
  await expectCanvasPainted(canvas);

  await page.getByRole('button', { name: 'Adjust' }).click();
  await page.getByLabel('Contrast').fill('25');
  await page.getByRole('button', { name: 'Duplicate variation' }).click();
  await page.getByLabel('Variation name').fill('Print B');
  await page.getByLabel('Variation name').press('Enter');
  await expect(page.getByLabel('Variation').locator('option:checked')).toHaveText('Print B');
  await expect.poll(() => readPersistedEditorState(page, 'film-still')).toEqual({
    variation: 'Print B',
    variationNames: ['Original', 'Print B'],
    contrast: 25,
    x: 0.5,
  });
  await expect(page.getByText('Saved locally')).toBeVisible();

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
  expect(desktopLayout.inspectorWidth).toBe(280);
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
  await page.getByRole('button', { name: 'Adjust' }).click();
  await expect(page.getByLabel('Contrast')).toHaveValue('25');
});

test('keeps undo and redo independent while alternating between variations', async ({ page }) => {
  await page.goto('/');
  await uploadFixture(page, 1200, 800, 'history-scope.png');
  await page.getByLabel('X position').fill('0.7');
  await page.getByLabel('X position').blur();
  await page.getByRole('button', { name: 'Duplicate variation' }).click();
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
  await page.goto('/');
  await uploadFixture(page, 800, 800, 'variation-management.png');
  await expect(page.getByRole('button', { name: 'Delete variation' })).toBeDisabled();
  await page.getByRole('button', { name: 'Duplicate variation' }).click();
  await page.getByLabel('Variation name').fill('Back print');
  await page.getByLabel('Variation name').press('Enter');
  await page.getByRole('button', { name: 'Duplicate variation' }).click();
  await expect(page.getByLabel('Variation').locator('option:checked')).toHaveText('Back print copy');

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete variation' }).click();
  await expect(page.getByLabel('Variation').locator('option:checked')).toHaveText('Back print');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete variation' }).click();
  await expect(page.getByLabel('Variation').locator('option:checked')).toHaveText('Original');
  await expect(page.getByRole('button', { name: 'Delete variation' })).toBeDisabled();
  await expect.poll(async () => (await readPersistedEditorState(page, 'variation-management'))?.variationNames)
    .toEqual(['Original']);

  await page.reload();
  await page.getByRole('button', { name: 'Open local projects' }).click();
  await page.getByRole('dialog').getByRole('button').filter({ hasText: 'variation-management' }).click();
  await expect(page.getByLabel('Variation').locator('option')).toHaveCount(1);
  await expect(page.getByLabel('Variation').locator('option:checked')).toHaveText('Original');
});

test('normalizes direct drag against landscape and portrait viewport dimensions', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('/');

  for (const fixture of [
    { width: 1600, height: 900, name: 'drag-landscape.png' },
    { width: 900, height: 1600, name: 'drag-portrait.png' },
  ]) {
    await uploadFixture(page, fixture.width, fixture.height, fixture.name);
    const canvas = page.getByLabel('Design canvas');
    await expectCanvasPainted(canvas);
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas bounds are unavailable.');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4);
    await page.mouse.up();
    await expect(page.getByLabel('X position')).toHaveValue('0.6');
    await expect(page.getByLabel('Y position')).toHaveValue('0.4');
  }
});

test('keeps the editor usable at 390 by 844 and captures the mobile layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await uploadFixture(page, 900, 1200, 'mobile.png');

  const select = page.getByRole('button', { name: 'Select' });
  const crop = page.getByRole('button', { name: 'Crop' });
  const adjust = page.getByRole('button', { name: 'Adjust' });
  await expect(select).toBeVisible();
  await expect(crop).toBeVisible();
  await expect(adjust).toBeVisible();
  await expect(page.getByLabel('Variation name')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Duplicate variation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete variation' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Saved locally' })).toBeVisible();
  await expectCanvasPainted(page.getByLabel('Design canvas'));

  const layout = await page.evaluate(() => {
    const bounds = (selector: string) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) throw new Error(`Missing ${selector}`);
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height };
    };
    return {
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      canvas: bounds('canvas[aria-label="Design canvas"]'),
      inspector: bounds('aside[aria-label="Inspector"]'),
      toolbar: bounds('nav[aria-label="Editor tools"]'),
    };
  });
  expect(layout.overflow).toBe(false);
  expect(layout.canvas.height).toBeGreaterThan(160);
  expect(layout.canvas.bottom).toBeLessThanOrEqual(layout.inspector.top + 1);
  expect(layout.inspector.bottom).toBeLessThanOrEqual(layout.toolbar.top + 1);

  const toolBoxes = await Promise.all([select, crop, adjust].map((button) => button.boundingBox()));
  for (const box of toolBoxes) {
    expect(box?.width).toBe(40);
    expect(box?.height).toBe(40);
  }
  expect(new Set(toolBoxes.map((box) => box?.y)).size).toBe(1);

  await page.screenshot({
    path: artifactPath('mobile-390x844.png'),
    animations: 'disabled',
  });
});

test('keeps save failure status and retry accessible on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await uploadFixture(page, 900, 1200, 'retry-save.png');
  await expect.poll(async () => (await readPersistedEditorState(page, 'retry-save'))?.x).toBe(0.5);
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put;
    let failNextProjectSave = true;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (this.name === 'editor-projects' && failNextProjectSave) {
        failNextProjectSave = false;
        throw new Error('Simulated local save failure.');
      }
      return key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key);
    };
  });

  await page.getByLabel('X position').fill('0.65');
  await page.getByLabel('X position').blur();
  await expect(page.getByRole('status').filter({ hasText: 'Local save failed' })).toBeVisible();
  const retry = page.getByRole('button', { name: 'Retry save' });
  await expect(retry).toBeVisible();
  const retryBounds = await retry.boundingBox();
  expect(retryBounds?.width).toBeGreaterThanOrEqual(24);
  expect(retryBounds?.height).toBeGreaterThanOrEqual(24);
  await page.screenshot({
    path: artifactPath('mobile-save-failure-390x844.png'),
    animations: 'disabled',
  });
  await retry.click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved locally' })).toBeVisible();
  await expect.poll(async () => (await readPersistedEditorState(page, 'retry-save'))?.x).toBe(0.65);
});

test('does not expose the retired workflow surface and preserves static routes', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('InkMaster Studio | Canvas-First Merch Editor');
  await expect(page.getByRole('button', { name: 'Import artwork' }).last()).toBeVisible();
  await expect(page.getByText(/Advanced mode|Production package|Customer proof|AI cleanup/i)).toHaveCount(0);

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

  await page.goto('/');
  await dropFixture(page, 800, 600, 'drop-art.png');
  await expect(page.getByLabel('Project name')).toHaveValue('drop-art');
  await expectCanvasPainted(page.getByLabel('Design canvas'));

  await uploadFixture(page, 640, 640, 'replacement.png');
  await expect(page.getByLabel('Project name')).toHaveValue('replacement');
  await expect.poll(() => page.evaluate(() => {
    const events = (window as unknown as { __task7ObjectUrlEvents: { created: string[]; revoked: string[] } }).__task7ObjectUrlEvents;
    return events.revoked.filter((url) => events.created.includes(url)).length;
  })).toBeGreaterThanOrEqual(1);
  await expect(page.getByText('Saved locally')).toBeVisible();

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
