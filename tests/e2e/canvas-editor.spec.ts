import { expect, type Locator, type Page, test } from '@playwright/test';
import path from 'node:path';

const artifactPath = (name: string) => path.join(process.cwd(), 'test-results', 'task-7', name);
const phase2aArtifactPath = (name: string) => path.join(process.cwd(), 'test-results', 'phase-2a', name);

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
  await page.locator('input[type="file"][aria-label="Import artwork file"]').setInputFiles({
    name,
    mimeType: 'image/png',
    buffer,
  });
};

const uploadLayerFixture = async (page: Page, width: number, height: number, name: string) => {
  const buffer = await createPngFixture(page, width, height);
  await page.locator('input[type="file"][aria-label="Add layer image file"]').setInputFiles({
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

interface PersistedComposition {
  selectedLayerId: string;
  layers: Array<{
    id: string;
    type: 'image' | 'text';
    name: string;
    visible: boolean;
    opacity: number;
    transform: { x: number; y: number; scale: number; rotation: number; flipX: boolean; flipY: boolean };
    assetId?: string;
    crop?: { x: number; y: number; width: number; height: number };
    adjustments?: { brightness: number; contrast: number; saturation: number };
    text?: string;
    fontFamily?: string;
    fontSize?: number;
    color?: string;
    align?: string;
    letterSpacing?: number;
    outlineWidth?: number;
    outlineColor?: string;
  }>;
}

interface PersistedAssetSnapshot {
  id: string;
  projectId: string;
  name: string;
  mimeType: string;
  width: number;
  height: number;
  blobIsBlob: boolean;
  blobType: string;
  blobSize: number;
  blobDigest: string;
  decodedWidth: number;
  decodedHeight: number;
}

interface PersistedWorkspaceSnapshot {
  projectId: string;
  composition: PersistedComposition;
  assets: PersistedAssetSnapshot[];
}

const readPersistedComposition = async (page: Page, projectName: string) => page.evaluate((name) => (
  new Promise<PersistedComposition | null>((resolve, reject) => {
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
        database.close();
        resolve(variation ? {
          selectedLayerId: variation.selectedLayerId,
          layers: variation.layers.map((layer: PersistedComposition['layers'][number]) => ({
            id: layer.id,
            type: layer.type,
            name: layer.name,
            visible: layer.visible,
            opacity: layer.opacity,
            transform: layer.transform,
            ...(layer.type === 'image' ? {
              assetId: layer.assetId,
              crop: layer.crop,
              adjustments: layer.adjustments,
            } : {}),
            ...(layer.type === 'text' ? {
              text: layer.text,
              fontFamily: layer.fontFamily,
              fontSize: layer.fontSize,
              color: layer.color,
              align: layer.align,
              letterSpacing: layer.letterSpacing,
              outlineWidth: layer.outlineWidth,
              outlineColor: layer.outlineColor,
            } : {}),
          })),
        } : null);
      };
    };
  })
), projectName);

const readPersistedWorkspace = async (page: Page, projectName: string) => page.evaluate(async (name) => {
  const records = await new Promise<{ projects: any[]; assets: any[] }>((resolve, reject) => {
    const openRequest = indexedDB.open('inkmaster-studio');
    openRequest.onerror = () => reject(openRequest.error ?? new Error('Could not open IndexedDB.'));
    openRequest.onsuccess = () => {
      const database = openRequest.result;
      const transaction = database.transaction(['editor-projects', 'editor-assets']);
      const projectsRequest = transaction.objectStore('editor-projects').getAll();
      const assetsRequest = transaction.objectStore('editor-assets').getAll();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not read editor workspace.'));
      transaction.oncomplete = () => {
        database.close();
        resolve({ projects: projectsRequest.result, assets: assetsRequest.result });
      };
    };
  });
  const project = records.projects.find((candidate) => candidate.name === name);
  const variation = project?.variations.find(
    (candidate: { id: string }) => candidate.id === project.activeVariationId,
  );
  if (!project || !variation) return null;

  const assets = await Promise.all(records.assets
    .filter((asset) => asset.projectId === project.id)
    .map(async (asset): Promise<PersistedAssetSnapshot> => {
      const blobIsBlob = asset.blob instanceof Blob;
      const digestBytes = blobIsBlob
        ? new Uint8Array(await crypto.subtle.digest('SHA-256', await asset.blob.arrayBuffer()))
        : new Uint8Array();
      const bitmap = blobIsBlob ? await createImageBitmap(asset.blob) : null;
      const snapshot = {
        id: asset.id,
        projectId: asset.projectId,
        name: asset.name,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
        blobIsBlob,
        blobType: blobIsBlob ? asset.blob.type : '',
        blobSize: blobIsBlob ? asset.blob.size : 0,
        blobDigest: [...digestBytes].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
        decodedWidth: bitmap?.width ?? 0,
        decodedHeight: bitmap?.height ?? 0,
      };
      bitmap?.close();
      return snapshot;
    }));

  return {
    projectId: project.id,
    composition: {
      selectedLayerId: variation.selectedLayerId,
      layers: variation.layers.map((layer: PersistedComposition['layers'][number]) => ({
        id: layer.id,
        type: layer.type,
        name: layer.name,
        visible: layer.visible,
        opacity: layer.opacity,
        transform: layer.transform,
        ...(layer.type === 'image' ? {
          assetId: layer.assetId,
          crop: layer.crop,
          adjustments: layer.adjustments,
        } : {}),
        ...(layer.type === 'text' ? {
          text: layer.text,
          fontFamily: layer.fontFamily,
          fontSize: layer.fontSize,
          color: layer.color,
          align: layer.align,
          letterSpacing: layer.letterSpacing,
          outlineWidth: layer.outlineWidth,
          outlineColor: layer.outlineColor,
        } : {}),
      })),
    },
    assets,
  } satisfies PersistedWorkspaceSnapshot;
}, projectName);

const expectPersistedImageAssets = (
  snapshot: PersistedWorkspaceSnapshot,
  expected: Record<string, { width: number; height: number }>,
) => {
  const imageLayers = snapshot.composition.layers.filter((layer) => layer.type === 'image');
  expect(imageLayers.map(({ name }) => name).sort()).toEqual(Object.keys(expected).sort());
  expect(snapshot.assets).toHaveLength(imageLayers.length);
  for (const layer of imageLayers) {
    const asset = snapshot.assets.find(({ id }) => id === layer.assetId);
    expect(asset, `persisted asset for ${layer.name}`).toBeDefined();
    expect(asset).toMatchObject({
      projectId: snapshot.projectId,
      name: layer.name,
      mimeType: 'image/png',
      width: expected[layer.name].width,
      height: expected[layer.name].height,
      blobIsBlob: true,
      blobType: 'image/png',
      decodedWidth: expected[layer.name].width,
      decodedHeight: expected[layer.name].height,
    });
    expect(asset!.blobSize).toBeGreaterThan(0);
    expect(asset!.blobDigest).toMatch(/^[0-9a-f]{64}$/);
  }
};

const readCanvasPixels = (canvas: Locator) => canvas.evaluate((element) => {
  const target = element as HTMLCanvasElement;
  return target.toDataURL('image/png');
});

test('composes ordered image and text layers with persistence on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const canvas = page.getByLabel('Design canvas');

  await uploadFixture(page, 1200, 800, 'phase-2a-base.png');
  await uploadLayerFixture(page, 640, 960, 'phase-2a-overlay.png');
  await expect(page.getByRole('button', { name: 'Select layer phase-2a-overlay.png' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Add text', exact: true }).click();

  await page.getByLabel('Layer name: Text').fill('Phase 2A headline');
  await page.getByLabel('Layer name: Text').press('Enter');
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
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error('Canvas bounds are unavailable.');
  const center = { x: canvasBox.x + canvasBox.width / 2, y: canvasBox.y + canvasBox.height / 2 };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + canvasBox.width * 0.1, center.y - canvasBox.height * 0.08);
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-selected-layer-id', duplicateLayerId!);
  await expect(page.getByLabel('X position', { exact: true })).toHaveValue('0.6');
  await expect(page.getByLabel('Y position', { exact: true })).toHaveValue('0.42');

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByLabel('X position', { exact: true })).toHaveValue('0.5');
  await expect(page.getByLabel('Y position', { exact: true })).toHaveValue('0.5');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByLabel('X position', { exact: true })).toHaveValue('0.6');
  await expect(page.getByLabel('Y position', { exact: true })).toHaveValue('0.42');

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
    transform: { x: 0.6, y: 0.42 },
  });
  await expectCanvasPainted(canvas);
  const canvasBeforeReload = await readCanvasPixels(canvas);
  await page.waitForTimeout(500);
  await expect(page.getByRole('status').filter({ hasText: 'Saved locally' })).toBeVisible();
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
  await expect(duplicateButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Content', { exact: true })).toHaveValue('INK\nIN ORDER');
  await expect(page.getByLabel('Font', { exact: true })).toHaveValue('Georgia');
  await expect(page.getByLabel('Size', { exact: true })).toHaveValue('88');
  await expect(page.getByLabel('X position', { exact: true })).toHaveValue('0.6');
  await expect(page.getByLabel('Y position', { exact: true })).toHaveValue('0.42');
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
  await reopenedOverlayRow.getByRole('button', { name: 'Show layer' }).click();
  await expect.poll(() => readCanvasPixels(canvas)).not.toBe(canvasBeforeReload);
  const canvasWithOverlay = await readCanvasPixels(canvas);
  expect(canvasWithOverlay).not.toBe(canvasBeforeReload);
  await reopenedOverlayRow.getByRole('button', { name: 'Hide layer' }).click();
  await expect.poll(() => readCanvasPixels(canvas)).toBe(canvasBeforeReload);
});

test('manages layers on mobile without covering the canvas', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await uploadFixture(page, 900, 1200, 'phase-2a-mobile.png');
  const canvas = page.getByLabel('Design canvas');
  await expectCanvasPainted(canvas);
  await page.waitForTimeout(500);
  await expect(page.getByRole('status').filter({ hasText: 'Saved locally' })).toBeVisible();
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
  await expect(page.getByRole('status').filter({ hasText: 'Saved locally' })).toBeVisible();
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
    expect(region.left).toBeGreaterThanOrEqual(0);
    expect(region.top).toBeGreaterThanOrEqual(0);
    expect(region.right).toBeLessThanOrEqual(390);
    expect(region.bottom).toBeLessThanOrEqual(844);
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
    await expect(page.getByLabel('Project name')).toHaveValue(path.parse(fixture.name).name);
    await expect(page.getByRole('button', { name: `Select layer ${fixture.name}` }))
      .toHaveAttribute('aria-pressed', 'true');
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

test('releases the mobile layer focus trap when resizing to desktop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await page.getByRole('button', { name: 'Layers' }).click();
  await expect(page.locator('[role="dialog"][aria-labelledby="mobile-layers-title"]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Close layers' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('[role="dialog"][aria-labelledby="mobile-layers-title"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Layers' })).toBeFocused();

  await page.getByRole('button', { name: 'Layers' }).click();
  await expect(page.getByRole('button', { name: 'Close layers' })).toBeFocused();

  await page.setViewportSize({ width: 1200, height: 844 });

  const drawer = page.locator('[role="dialog"][aria-labelledby="mobile-layers-title"]');
  const desktopLayers = page.getByRole('region', { name: 'Layers panel' });
  await expect(drawer).toHaveCount(0);
  await expect(desktopLayers).toBeVisible();
  await expect(desktopLayers).toBeFocused();

  await page.keyboard.press('Tab');
  const focusState = await page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return null;
    const bounds = active.getBoundingClientRect();
    const style = window.getComputedStyle(active);
    return {
      tagName: active.tagName,
      ariaLabel: active.getAttribute('aria-label'),
      sequentiallyHidden: active.hidden || active.classList.contains('sr-only') || active.tabIndex < 0,
      visible: bounds.width > 0 && bounds.height > 0 &&
        style.display !== 'none' && style.visibility !== 'hidden',
    };
  });
  expect(focusState?.tagName).not.toBe('BODY');
  expect(focusState?.sequentiallyHidden).toBe(false);
  expect(focusState?.visible).toBe(true);
});

test('keeps dedicated file inputs hidden while preserving labeled imports', async ({ page }) => {
  await page.goto('/');

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

test('edits text layers and gates image tools across selection fallback paths', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 844 });
  await page.goto('/');
  await uploadFixture(page, 640, 480, 'tool-paths.png');

  const select = page.getByRole('button', { name: 'Select', exact: true });
  const crop = page.getByRole('button', { name: 'Crop', exact: true });
  const adjust = page.getByRole('button', { name: 'Adjust', exact: true });
  await page.getByRole('button', { name: 'Add text', exact: true }).click();
  await expect(select).toHaveAttribute('aria-pressed', 'true');
  await expect(crop).toBeDisabled();
  await expect(adjust).toBeDisabled();
  await expect(crop).toHaveAccessibleDescription('Crop and Adjust are available only for image layers.');
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
  await fontSize.fill('96');
  await page.getByRole('button', { name: 'Select layer tool-paths.png' }).evaluate((button) => {
    (button as HTMLButtonElement).click();
  });
  await page.getByRole('button', { name: 'Select layer Text' }).evaluate((button) => {
    (button as HTMLButtonElement).click();
  });
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

  await page.getByRole('button', { name: 'Duplicate layer' }).click();
  await expect(select).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Select layer tool-paths.png' }).click();
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
  await page.getByRole('button', { name: 'Delete layer' }).click();
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
      inspectorScrolls: inspector.scrollHeight > inspector.clientHeight,
      canvasBottom: canvasBounds.bottom,
      inspectorTop: inspectorBounds.top,
      inspectorBottom: inspectorBounds.bottom,
      toolbarTop: toolbarBounds.top,
    };
  });
  expect(mobileLayout.pageOverflows).toBe(false);
  expect(mobileLayout.inspectorOverflows).toBe(false);
  expect(mobileLayout.inspectorScrolls).toBe(true);
  expect(mobileLayout.canvasBottom).toBeLessThanOrEqual(mobileLayout.inspectorTop + 1);
  expect(mobileLayout.inspectorBottom).toBeLessThanOrEqual(mobileLayout.toolbarTop + 1);
  await page.getByLabel('X position', { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByLabel('X position', { exact: true })).toBeVisible();
});

test('separates text content sessions when selection unmounts the focused inspector', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 844 });
  await page.goto('/');
  await uploadFixture(page, 640, 480, 'content-sessions.png');
  await page.getByRole('button', { name: 'Add text', exact: true }).click();

  const selectImageWithoutFocus = async () => {
    await page.getByRole('button', { name: 'Select layer content-sessions.png' }).evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
  };
  const selectTextWithoutFocus = async () => {
    await page.getByRole('button', { name: 'Select layer Text' }).evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
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
  await page.goto('/');
  await uploadFixture(page, 640, 480, 'color-groups.png');
  await page.getByRole('button', { name: 'Add text', exact: true }).click();

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
