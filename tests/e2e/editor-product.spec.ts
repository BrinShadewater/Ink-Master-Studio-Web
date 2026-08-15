import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  uploadFixture,
  duplicateVariation,
  uploadTransparentFixture,
  readPersistedPhase2BProject,
  readPersistedPhase3AWorkspace,
  renameActiveVariation,
} from './support/editor-helpers';

test('Product canvas supports keyboard placement and resize', async ({ page }) => {
  const projectName = 'product-keyboard';
  await page.goto('/editor');
  await uploadFixture(page, 1000, 1000, `${projectName}.png`);
  await page.getByRole('button', { name: 'Product', exact: true }).click();

  const placement = page.getByRole('button', { name: 'Product artwork placement', exact: true });
  const resize = page.getByRole('button', { name: 'Resize product artwork', exact: true });
  await placement.focus();
  await expect(page.getByText('Arrow keys move. Shift moves farther. Focus Resize to change size.')).toBeVisible();
  await placement.press('ArrowRight');
  await placement.press('Shift+ArrowDown');
  await resize.focus();
  await resize.press('ArrowRight');

  await expect.poll(async () => {
    const workspace = await readPersistedPhase3AWorkspace(page, projectName);
    return workspace?.productVariants[0].placement;
  }).toEqual({ x: 0.51, y: 0.55, scale: 0.73, rotation: 0 });

  await page.reload();
  await page.getByRole('button', { name: 'Open local projects', exact: true }).click();
  await page.getByRole('dialog').getByRole('button').filter({ hasText: projectName }).click();
  await page.getByRole('button', { name: 'Product', exact: true }).click();
  await expect.poll(async () => {
    const workspace = await readPersistedPhase3AWorkspace(page, projectName);
    return workspace?.productVariants[0].placement;
  }).toEqual({ x: 0.51, y: 0.55, scale: 0.73, rotation: 0 });
});

test('Product Basic leads with readiness and White persists', async ({ page }) => {
  const projectName = 'product-white';
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/editor');
  await uploadFixture(page, 1800, 1800, `${projectName}.png`);
  await page.getByRole('button', { name: 'Product', exact: true }).click();

  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  const readiness = inspector.getByRole('heading', { name: /Ready at this size|Check sharpness at this size|Artwork needs more resolution/ });
  const shirtColor = inspector.getByRole('heading', { name: 'Shirt color', exact: true });
  await expect(readiness).toBeVisible();
  await expect(shirtColor).toBeVisible();
  const readinessBox = await readiness.boundingBox();
  const colorBox = await shirtColor.boundingBox();
  expect(readinessBox!.y).toBeLessThan(colorBox!.y);
  await expect(inspector.getByLabel('Artwork for Black')).toHaveCount(0);
  await expect(inspector.getByLabel('Mockup color mode')).toHaveCount(0);
  await expect(inspector.getByLabel('X position', { exact: true })).toHaveCount(0);

  await inspector.getByRole('button', { name: 'White', exact: true }).click();
  await expect(page.getByRole('img', { name: 'White T-shirt', exact: true })).toBeVisible();
  await expect.poll(async () => {
    const workspace = await readPersistedPhase3AWorkspace(page, projectName);
    return workspace?.productVariants[0].mockupSlug;
  }).toBe('white');

  await page.reload();
  await page.getByRole('button', { name: 'Open local projects', exact: true }).click();
  await page.getByRole('dialog').getByRole('button').filter({ hasText: projectName }).click();
  await page.getByRole('button', { name: 'Product', exact: true }).click();
  await expect(page.getByRole('img', { name: 'White T-shirt', exact: true })).toBeVisible();

  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  await expect(inspector.getByRole('heading', { name: 'Artwork checks', exact: true })).toBeVisible();
  await expect(inspector.getByRole('combobox', { name: 'Artwork for White' })).toBeVisible();
  await expect(inspector.getByLabel('Mockup color mode')).toBeVisible();
  await expect(inspector.getByLabel('X position', { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('img', { name: 'White T-shirt', exact: true })).toBeVisible();
  await expect(readiness).toBeVisible();
});

test('Product placement presets stay simple in Basic and persist after reload', async ({ page }) => {
  const projectName = 'product-presets';
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/editor');
  await uploadTransparentFixture(page, 4000, 4000, `${projectName}.png`);
  await page.getByRole('button', { name: 'Product', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Standard front', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Left chest', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Oversized front', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Left chest', exact: true }).click();
  await expect.poll(async () => {
    const workspace = await readPersistedPhase3AWorkspace(page, projectName);
    return workspace?.productVariants[0].placement;
  }).toEqual({ x: 0.28, y: 0.27, scale: 0.32, rotation: 0 });

  await page.reload();
  await page.getByRole('button', { name: 'Open local projects', exact: true }).click();
  await page.getByRole('dialog').getByRole('button').filter({ hasText: projectName }).click();
  await page.getByRole('button', { name: 'Product', exact: true }).click();
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Oversized front', exact: true })).toBeVisible();
  await expect(page.getByLabel('X position', { exact: true })).toHaveValue('28');
  await expect(page.getByLabel('Y position', { exact: true })).toHaveValue('27');
  await expect(page.getByLabel('Scale', { exact: true })).toHaveValue('32');
  await page.getByRole('radio', { name: 'DTF transfer', exact: true }).check();
  await expect.poll(async () => {
    const workspace = await readPersistedPhase3AWorkspace(page, projectName);
    return workspace?.productVariants[0].printMethod;
  }).toBe('dtf');

  await page.reload();
  await page.getByRole('button', { name: 'Open local projects', exact: true }).click();
  await page.getByRole('dialog').getByRole('button').filter({ hasText: projectName }).click();
  await page.getByRole('button', { name: 'Product', exact: true }).click();
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'DTF transfer', exact: true })).toBeChecked();
});

test('Product export uses the garment-assigned variation for PNG and proof', async ({ page }) => {
  test.setTimeout(300_000);
  const projectName = 'assigned-product-proof';
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');
  await uploadTransparentFixture(page, 4000, 4000, `${projectName}.png`);

  await duplicateVariation(page);
  await renameActiveVariation(page, 'White proof artwork');
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  await page.getByRole('button', { name: 'Looks', exact: true }).click();
  await page.getByRole('button', { name: 'Duotone', exact: true }).click();
  await page.getByLabel('Variation', { exact: true }).selectOption({ label: 'Original' });
  await page.getByRole('button', { name: 'Product', exact: true }).click();
  await page.getByRole('button', { name: 'White', exact: true }).click();
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  await page.getByRole('combobox', { name: 'Artwork for White', exact: true }).selectOption({ label: 'White proof artwork' });

  await expect.poll(async () => {
    const project = await readPersistedPhase2BProject(page, projectName);
    const original = project?.variations.find(({ name }) => name === 'Original');
    const assigned = project?.variations.find(({ name }) => name === 'White proof artwork');
    const product = project?.productVariants.find(({ variationId }) => variationId === original?.id);
    return {
      assignmentMatches: Boolean(assigned?.id) && product?.colorVariationIds.white === assigned?.id,
      looks: assigned?.looks.map(({ id }) => id),
    };
  }).toEqual({
    assignmentMatches: true,
    looks: ['duotone'],
  });

  await page.getByRole('button', { name: 'Create print-ready PNG', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Print-ready PNG', exact: true });
  const summary = dialog.getByRole('heading', { name: 'Production summary', exact: true }).locator('..');
  await expect(summary).toContainText('White proof artwork');
  await expect(summary).not.toContainText('Original');
  await dialog.getByRole('radio', { name: /Draft Proof/ }).check();
  await dialog.getByRole('button', { name: 'Create PNG', exact: true }).click();
  await expect(dialog.getByText('Proof ready', { exact: true })).toBeVisible({ timeout: 150_000 });

  const pngDownloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download PNG', exact: true }).click();
  const pngDownload = await pngDownloadPromise;
  const pngPath = await pngDownload.path();
  if (!pngPath) throw new Error('The assigned artwork PNG download is unavailable.');
  expect([...readFileSync(pngPath).subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

  await dialog.getByRole('button', { name: 'Create mockup proof', exact: true }).click();
  await expect(dialog.getByRole('img', { name: 'White mockup proof', exact: true })).toBeVisible();
  const proofDownloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download mockup proof', exact: true }).click();
  const proofDownload = await proofDownloadPromise;
  const proofPath = await proofDownload.path();
  if (!proofPath) throw new Error('The assigned artwork proof download is unavailable.');
  expect([...readFileSync(proofPath).subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  await dialog.getByRole('button', { name: 'Close export', exact: true }).click();

  await page.reload();
  await page.getByRole('button', { name: 'Open local projects', exact: true }).click();
  await page.getByRole('dialog').getByRole('button').filter({ hasText: projectName }).click();
  await page.getByRole('button', { name: 'Product', exact: true }).click();
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  const assignedArtwork = page.getByRole('combobox', { name: 'Artwork for White', exact: true });
  await expect(assignedArtwork).toHaveValue(/.+/);
  await expect(assignedArtwork.locator('option:checked')).toHaveText('White proof artwork');
  await expect.poll(async () => {
    const project = await readPersistedPhase2BProject(page, projectName);
    return project?.variations.find(({ name }) => name === 'White proof artwork')?.looks.map(({ id }) => id);
  }).toEqual(['duotone']);
});
