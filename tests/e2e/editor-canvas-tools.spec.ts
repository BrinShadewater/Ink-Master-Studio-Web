import { expect, test } from '@playwright/test';
import path from 'node:path';
import {
  artifactPath,
  installLookWorkerHarness,
  getLookWorkerHarness,
  enqueueLookWorkerRule,
  invokeLookWorkerHarness,
  uploadFixture,
  openVariationMenu,
  closeVariationMenu,
  duplicateVariation,
  deleteVariation,
  renameVariation,
  openLayers,
  closeLayers,
  addTextLayer,
  uploadPickedColorsFixture,
  uploadPhase2CFixture,
  expectCanvasPainted,
  readPersistedEditorState,
  readPersistedLook,
  readPersistedProjectBytes,
  readPersistedComposition,
  readPersistedPhase2CWorkspace,
  readPreparedAlphaSamples,
  readCanvasPixels,
  sourcePointOnCanvas,
  expectedCanonicalDragValue,
} from './support/editor-helpers';

test('normalizes direct drag against landscape and portrait viewport dimensions', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('/editor');

  for (const fixture of [
    { width: 1600, height: 900, name: 'drag-landscape.png' },
    { width: 900, height: 1600, name: 'drag-portrait.png' },
  ]) {
    await uploadFixture(page, fixture.width, fixture.height, fixture.name);
    // Layers are reachable in Basic only on desktop, so check the layer before switching.
    // Mode persists across loop iterations, so return to Basic first.
    await page.getByRole('radio', { name: 'Basic', exact: true }).click();
    await openLayers(page);
    await expect(page.getByRole('button', { name: `Select layer ${fixture.name}` }))
      .toHaveAttribute('aria-pressed', 'true');
    await closeLayers(page);
    await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
    await expect(page.getByLabel('Project name')).toHaveValue(path.parse(fixture.name).name);
    const canvas = page.getByLabel('Design canvas');
    await expectCanvasPainted(canvas);
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas bounds are unavailable.');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4);
    await page.mouse.up();
    await expect(page.getByLabel('X position')).toHaveValue(
      expectedCanonicalDragValue(0.5, box.width * 0.1, box),
    );
    await expect(page.getByLabel('Y position')).toHaveValue(
      expectedCanonicalDragValue(0.5, -box.height * 0.1, box),
    );
  }
});

test('moves selected artwork and crop bounds with the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('/editor');
  await uploadFixture(page, 1200, 900, 'keyboard-canvas.png');

  const canvas = page.getByLabel('Design canvas');
  await expectCanvasPainted(canvas);
  await canvas.focus();
  await expect(page.getByText('Arrow keys move. Shift moves farther.', { exact: true })).toBeVisible();
  await expect.poll(async () => canvas.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe('none');
  await canvas.press('ArrowRight');
  await expect.poll(async () => (await readPersistedEditorState(page, 'keyboard-canvas'))?.x)
    .toBeGreaterThan(0.5);
  const preciseX = (await readPersistedEditorState(page, 'keyboard-canvas'))?.x ?? 0.5;

  await canvas.press('Shift+ArrowRight');
  await expect.poll(async () => (await readPersistedEditorState(page, 'keyboard-canvas'))?.x)
    .toBeGreaterThan(preciseX);

  await page.getByRole('button', { name: 'Crop', exact: true }).click();
  const cropFrame = page.getByRole('group', {
    name: 'Crop frame. Drag inside or use the Arrow keys to reposition. Hold Shift for a larger step.',
    exact: true,
  });
  const topLeft = page.getByRole('button', {
    name: 'Resize crop from top left. Use the Arrow keys. Hold Shift for a larger step.',
    exact: true,
  });
  await topLeft.focus();
  await topLeft.press('ArrowRight');
  await expect.poll(async () => {
    const composition = await readPersistedComposition(page, 'keyboard-canvas');
    return composition?.layers[0]?.crop;
  }).toEqual({ x: 0.01, y: 0, width: 0.99, height: 1 });

  await cropFrame.focus();
  await expect(cropFrame.getByText('Arrow keys move. Shift moves farther.', { exact: true })).toBeVisible();
  await expect.poll(async () => cropFrame.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe('none');
  await cropFrame.press('ArrowLeft');
  await expect.poll(async () => {
    const composition = await readPersistedComposition(page, 'keyboard-canvas');
    return composition?.layers[0]?.crop;
  }).toEqual({ x: 0, y: 0, width: 0.99, height: 1 });
});

test('crop ratios resize the window without stretching artwork', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('/editor');
  await uploadFixture(page, 1200, 800, 'crop-ratio.png');

  await expect.poll(async () => (await readPersistedComposition(page, 'crop-ratio'))?.layers.length)
    .toBe(1);
  const before = await readPersistedComposition(page, 'crop-ratio');
  const beforeTransform = before?.layers[0]?.transform;
  await page.getByRole('button', { name: 'Crop', exact: true }).click();
  await page.getByRole('button', { name: '1:1', exact: true }).click();

  const cropFrame = page.getByRole('group', {
    name: 'Crop frame. Drag inside or use the Arrow keys to reposition. Hold Shift for a larger step.',
    exact: true,
  });
  const frameBox = await cropFrame.boundingBox();
  if (!frameBox) throw new Error('Crop frame bounds are unavailable.');
  expect(Math.abs(frameBox.width / frameBox.height - 1)).toBeLessThan(0.02);

  await expect.poll(async () => {
    const persisted = await readPersistedComposition(page, 'crop-ratio');
    const persistedCrop = persisted?.layers[0]?.crop;
    return persistedCrop
      ? Math.abs((persistedCrop.width * 1200) / (persistedCrop.height * 800) - 1)
      : Number.POSITIVE_INFINITY;
  }).toBeLessThan(0.000001);
  const after = await readPersistedComposition(page, 'crop-ratio');
  const crop = after?.layers[0]?.crop;
  if (!crop) throw new Error('Persisted crop is unavailable.');
  expect(after?.layers[0]?.transform).toEqual(beforeTransform);

  await page.getByRole('button', { name: 'Reset crop', exact: true }).click();
  await expect.poll(async () => (await readPersistedComposition(page, 'crop-ratio'))?.layers[0]?.crop)
    .toEqual({ x: 0, y: 0, width: 1, height: 1 });
});

test('keeps the editor usable at 390 by 844 and captures the mobile layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/editor');
  await uploadFixture(page, 900, 1200, 'mobile.png');

  const workflowContext = page.locator('aside[aria-label="Inspector"] > div[aria-live="polite"]');
  await expect(workflowContext.getByText('Step 2 of 3 · Prepare', { exact: true })).toBeVisible();
  await expect(workflowContext).toContainText('Crop if framing needs work');

  const select = page.getByRole('button', { name: 'Select' });
  const crop = page.getByRole('button', { name: 'Crop' });
  const product = page.getByRole('button', { name: 'Product' });
  const layers = page.getByRole('button', { name: 'Layers' });
  const more = page.getByRole('button', { name: 'More tools' });
  await expect(select).toBeVisible();
  await expect(crop).toBeVisible();
  await expect(product).toBeVisible();
  await expect(layers).toBeVisible();
  await expect(more).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adjust' })).toHaveCount(0);
  await openVariationMenu(page);
  await expect(page.getByLabel('Variation name')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Duplicate variation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete variation' })).toBeVisible();
  await expect(page.getByLabel('Project name')).toBeVisible();
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

  const toolBoxes = await Promise.all([select, crop, product, layers, more].map((button) => button.boundingBox()));
  for (const box of toolBoxes) {
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  expect(new Set(toolBoxes.map((box) => box?.y)).size).toBe(1);

  await page.getByRole('button', { name: 'Collapse' }).click();
  const expandInspector = page.getByRole('button', { name: 'Expand' });
  await expect(expandInspector).toHaveAttribute('aria-expanded', 'false');
  const collapsedLayout = await page.evaluate(() => {
    const canvas = document.querySelector('canvas[aria-label="Design canvas"]');
    const inspector = document.querySelector('aside[aria-label="Inspector"]');
    const toolbar = document.querySelector('nav[aria-label="Editor tools"]');
    if (!(canvas instanceof HTMLElement) || !(inspector instanceof HTMLElement) || !(toolbar instanceof HTMLElement)) {
      throw new Error('Missing mobile editor region');
    }
    const canvasBounds = canvas.getBoundingClientRect();
    const inspectorBounds = inspector.getBoundingClientRect();
    const toolbarBounds = toolbar.getBoundingClientRect();
    return {
      canvasHeight: canvasBounds.height,
      inspectorHeight: inspectorBounds.height,
      inspectorBottom: inspectorBounds.bottom,
      toolbarTop: toolbarBounds.top,
    };
  });
  expect(collapsedLayout.canvasHeight).toBeGreaterThan(layout.canvas.height);
  expect(collapsedLayout.inspectorHeight).toBe(56);
  expect(collapsedLayout.inspectorBottom).toBeLessThanOrEqual(collapsedLayout.toolbarTop + 1);

  await page.screenshot({
    path: artifactPath('mobile-390x844.png'),
    animations: 'disabled',
  });
});

test('Basic keeps Product visible and specialists behind More', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/editor');
  await uploadFixture(page, 900, 1200, 'basic-workflow.png');

  const toolbar = page.getByRole('navigation', { name: 'Editor tools' });
  const primaryCommands = toolbar.getByRole('button');
  // Matches `basicTools` in EditorToolbar, which is a deliberate curated list, plus the
  // Layers and More affordances. The point of this test is the two properties asserted
  // below — Product reachable without scrolling, specialists behind More — not this
  // exact roster, so update the roster with the list and keep the properties.
  const basicRoster = [
    'Select', 'Remove background', 'Crop', 'Enhance resolution', 'Looks', 'Product',
    'Layers', 'More tools',
  ];
  await expect(primaryCommands).toHaveCount(basicRoster.length);
  for (const [index, name] of basicRoster.entries()) {
    await expect(primaryCommands.nth(index)).toHaveAccessibleName(name);
  }

  // Specialists are not promoted into the Basic toolbar.
  await expect(toolbar.getByRole('button', { name: 'Adjust', exact: true })).toHaveCount(0);
  await expect(toolbar.getByRole('button', { name: 'Trace', exact: true })).toHaveCount(0);

  const productBounds = await primaryCommands.nth(basicRoster.indexOf('Product')).boundingBox();
  const toolbarBounds = await toolbar.boundingBox();
  expect(productBounds).not.toBeNull();
  expect(toolbarBounds).not.toBeNull();
  expect(productBounds!.x).toBeGreaterThanOrEqual(toolbarBounds!.x);
  expect(productBounds!.x + productBounds!.width).toBeLessThanOrEqual(
    toolbarBounds!.x + toolbarBounds!.width,
  );
  await expect(toolbar).toHaveJSProperty('scrollLeft', 0);

  // ...they live behind More, and are reachable from there.
  await toolbar.getByRole('button', { name: 'More tools' }).click();
  await expect(page.getByRole('menuitem', { name: 'Adjust' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Trace' })).toBeVisible();
  await toolbar.getByRole('button', { name: 'More tools' }).click();

  await expect(toolbar.getByRole('button', { name: 'Remove background' })).toBeEnabled();
  await toolbar.getByRole('button', { name: 'Product' }).click();
  await expect(toolbar.getByRole('button', { name: 'Crop' })).toBeEnabled();
  await expect(toolbar.getByRole('button', { name: 'Layers' })).toBeEnabled();

  await duplicateVariation(page);
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  await toolbar.getByRole('button', { name: 'Compare' }).click();
  await expect(page.getByRole('region', { name: 'Compare Board' })).toBeVisible();

  await page.getByRole('radio', { name: 'Basic', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Compare Board' })).toHaveCount(0);
  await expect(toolbar.getByRole('button', { name: 'Crop' })).toBeEnabled();
  await toolbar.getByRole('button', { name: 'Crop' }).click();
  await expect(toolbar.getByRole('button', { name: 'Crop' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#editor-product-mode-disabled-reason')).toHaveCount(0);
});

test('top bar groups stay readable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/editor');
  await uploadFixture(page, 900, 1200, 'top-bar-groups.png');
  await expect(page.getByLabel('Project name')).toHaveValue('top-bar-groups');

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    const layout = await page.evaluate(() => {
      const header = document.querySelector('header');
      const groups = [...document.querySelectorAll<HTMLElement>('[data-topbar-group]')];
      if (!(header instanceof HTMLElement) || groups.length !== 3) {
        throw new Error('Top bar groups are unavailable.');
      }
      const bounds = (element: Element) => {
        const rect = element.getBoundingClientRect();
        return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
      };
      return {
        header: bounds(header),
        groups: groups.map((group) => ({ name: group.dataset.topbarGroup, ...bounds(group) })),
      };
    });

    for (const group of layout.groups) {
      expect(group.left, `${viewport.width} ${group.name} left`).toBeGreaterThanOrEqual(layout.header.left - 1);
      expect(group.right, `${viewport.width} ${group.name} right`).toBeLessThanOrEqual(layout.header.right + 1);
      expect(group.top, `${viewport.width} ${group.name} top`).toBeGreaterThanOrEqual(layout.header.top - 1);
      expect(group.bottom, `${viewport.width} ${group.name} bottom`).toBeLessThanOrEqual(layout.header.bottom + 1);
    }
    for (let first = 0; first < layout.groups.length; first += 1) {
      for (let second = first + 1; second < layout.groups.length; second += 1) {
        const a = layout.groups[first];
        const b = layout.groups[second];
        const overlapWidth = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const overlapHeight = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        expect(overlapWidth * overlapHeight, `${viewport.width} ${a.name} overlaps ${b.name}`).toBeLessThanOrEqual(1);
      }
    }
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByRole('button', { name: 'Export' }).getByText('Export', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open local projects' }).getByText('Projects', { exact: true })).toBeVisible();
});

test('Before and after divider stays synchronized across pointer and keyboard controls', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 844 });
  await page.goto('/editor');
  await uploadFixture(page, 1200, 900, 'compare-divider.png');
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  await page.getByRole('button', { name: 'Looks', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Finish comparison', exact: true })).toBeVisible();

  const divider = page.getByRole('slider', { name: 'Before and after divider', exact: true });
  const range = page.getByLabel('Before and after position', { exact: true });
  await expect(divider).toHaveAttribute('aria-valuenow', '50');
  await divider.focus();
  await divider.press('ArrowRight');
  await expect(range).toHaveValue('51');
  await divider.press('Shift+ArrowLeft');
  await expect(range).toHaveValue('41');

  const bounds = await divider.boundingBox();
  if (!bounds) throw new Error('Before and after divider bounds are unavailable.');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 120, bounds.y + bounds.height / 2);
  await page.mouse.up();
  await expect.poll(async () => Number(await range.inputValue())).toBeGreaterThan(41);

  const stage = divider.locator('..');
  for (const endpoint of ['0', '100']) {
    await range.fill(endpoint);
    const stageBounds = await stage.boundingBox();
    const endpointBounds = await divider.boundingBox();
    if (!stageBounds || !endpointBounds) throw new Error('Comparison endpoint bounds are unavailable.');
    expect(endpointBounds.x).toBeGreaterThanOrEqual(stageBounds.x);
    expect(endpointBounds.x + endpointBounds.width).toBeLessThanOrEqual(
      stageBounds.x + stageBounds.width,
    );
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileBounds = await divider.boundingBox();
  const mobileRangeBounds = await range.boundingBox();
  if (!mobileBounds || !mobileRangeBounds) throw new Error('Mobile comparison controls are unavailable.');
  expect(mobileBounds.width).toBeGreaterThanOrEqual(44);
  expect(mobileBounds.height).toBeGreaterThanOrEqual(44);
  expect(mobileRangeBounds.x + mobileRangeBounds.width).toBeLessThanOrEqual(390);
});

test('releases the mobile layer focus trap when resizing to desktop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/editor');
  await uploadFixture(page, 640, 480, 'focus-trap.png');

  await page.getByRole('button', { name: 'Layers' }).click();
  await expect(page.locator('[role="dialog"][aria-labelledby="mobile-layers-title"]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Close layers' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('[role="dialog"][aria-labelledby="mobile-layers-title"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Layers' })).toBeFocused();

  await page.getByRole('button', { name: 'Layers' }).click();
  await expect(page.getByRole('button', { name: 'Close layers' })).toBeFocused();

  await page.setViewportSize({ width: 1200, height: 844 });

  // The layers UI is a single modal drawer at every width now — there is no separate
  // desktop panel for the trap to hand off to. What must still hold is the property this
  // test is named for: the trap survives the resize intact and stays releasable, rather
  // than stranding focus.
  const drawer = page.locator('[role="dialog"][aria-labelledby="mobile-layers-title"]');
  await expect(drawer).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Close layers' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Layers' })).toBeFocused();

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

test('keeps save failure status and retry accessible on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/editor');
  await uploadFixture(page, 900, 1200, 'retry-save.png');
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  await expect.poll(async () => (await readPersistedEditorState(page, 'retry-save'))?.x).toBe(0.5);
  // The editor top bar surfaces save problems only — the persistent "Saved locally"
  // indicator lives on StudioTopBar, a different surface. The poll above is what proves
  // the write landed; this asserts the failure state is absent.
  await expect(page.getByRole('status').filter({ hasText: 'Save failed' })).toHaveCount(0);

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
  await expect(page.getByRole('status').filter({ hasText: 'Save failed' })).toBeVisible();
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
  await expect(page.getByLabel('Project name')).toBeVisible();
  await expect.poll(async () => (await readPersistedEditorState(page, 'retry-save'))?.x).toBe(0.65);
});

test('@task5-review applies the exact seeded thumbnail recipe that was previewed', async ({ page }) => {
  await installLookWorkerHarness(page);
  await page.setViewportSize({ width: 1200, height: 844 });
  await page.goto('/editor');
  await uploadFixture(page, 960, 720, 'look-seed-apply.png');
  await expectCanvasPainted(page.getByLabel('Design canvas'));
  await page.getByRole('button', { name: 'Looks', exact: true }).click();

  await expect.poll(async () => {
    const snapshot = await getLookWorkerHarness(page);
    return snapshot.requests.find(({ look, maxDimension }) => (
      look.id === 'vintage-ink' && maxDimension <= 240
    ))?.look ?? null;
  }).not.toBeNull();
  const candidateLook = (await getLookWorkerHarness(page)).requests.find(({ look, maxDimension }) => (
    look.id === 'vintage-ink' && maxDimension <= 240
  ))?.look;
  expect(candidateLook).toBeDefined();

  await page.getByRole('button', { name: 'Vintage Ink', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Vintage Ink', exact: true }))
    .toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => readPersistedLook(page, 'look-seed-apply')).toEqual(candidateLook);
  await expect.poll(async () => {
    const snapshot = await getLookWorkerHarness(page);
    return [...snapshot.requests].reverse().find(({ look, maxDimension }) => (
      look.id === 'vintage-ink' && maxDimension > 240
    ))?.look ?? null;
  }).toEqual(candidateLook);
});

test('@task5-review commits complete Look controls and separates native color history', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 844 });
  await page.goto('/editor');
  await uploadFixture(page, 960, 720, 'look-control-history.png');
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  await page.getByRole('button', { name: 'Looks', exact: true }).click();
  const duotone = page.getByRole('button', { name: 'Duotone', exact: true });
  await duotone.evaluate((button) => (button as HTMLButtonElement).click());
  await expect(duotone).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Duotone strength range', { exact: true }).fill('64');
  await expect.poll(() => readPersistedLook(page, 'look-control-history')).toEqual({
    id: 'duotone',
    strength: 64,
    shadowColor: '#111827',
    highlightColor: '#f59e0b',
    balance: 0,
  });
  await page.getByLabel('Balance range', { exact: true }).fill('-18');
  await expect.poll(() => readPersistedLook(page, 'look-control-history')).toEqual({
    id: 'duotone',
    strength: 64,
    shadowColor: '#111827',
    highlightColor: '#f59e0b',
    balance: -18,
  });

  const shadowColor = page.getByLabel('Shadow color', { exact: true });
  await shadowColor.fill('#223344');
  await expect.poll(() => readPersistedLook(page, 'look-control-history')).toMatchObject({
    id: 'duotone', strength: 64, balance: -18, shadowColor: '#223344',
  });
  await shadowColor.fill('#556677');
  await expect.poll(() => readPersistedLook(page, 'look-control-history')).toMatchObject({
    id: 'duotone', strength: 64, balance: -18, shadowColor: '#556677',
  });

  const undo = page.getByRole('button', { name: 'Undo', exact: true });
  await undo.click();
  await expect(shadowColor).toHaveValue('#223344');
  await undo.click();
  await expect(shadowColor).toHaveValue('#111827');
  await undo.click();
  await expect(page.getByLabel('Balance range', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('Duotone strength range', { exact: true })).toHaveValue('64');
  await undo.click();
  await expect(page.getByLabel('Duotone strength range', { exact: true })).toHaveValue('100');

  const highlightColor = page.getByLabel('Highlight color', { exact: true });
  await highlightColor.evaluate((input) => {
    const colorInput = input as HTMLInputElement;
    colorInput.value = '#123456';
    colorInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
  });
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('button', { name: 'Looks', exact: true }).click();
  await page.getByLabel('Highlight color', { exact: true }).fill('#abcdef');
  await undo.click();
  await expect(page.getByLabel('Highlight color', { exact: true })).toHaveValue('#123456');

  const balance = page.getByLabel('Balance range', { exact: true });
  await balance.fill('9');
  await expect(balance).toHaveValue('9');
  await page.getByRole('button', { name: 'Monochrome', exact: true }).click();
  await undo.click();
  await expect(page.getByLabel('Balance range', { exact: true })).toHaveValue('9');
  await undo.click();
  await expect(page.getByLabel('Balance range', { exact: true })).toHaveValue('0');
});

test('@task5-review keeps preview failure authority keyed through pending, Retry, and stale work', async ({ page }) => {
  await installLookWorkerHarness(page);
  await page.setViewportSize({ width: 1200, height: 844 });
  await page.goto('/editor');
  await uploadFixture(page, 960, 720, 'look-failure-authority.png');
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  const canvas = page.getByLabel('Design canvas');
  await expectCanvasPainted(canvas);
  const originalCanvas = await readCanvasPixels(canvas);
  await page.getByRole('button', { name: 'Looks', exact: true }).click();
  const monochrome = page.getByRole('button', { name: 'Monochrome', exact: true });
  await monochrome.evaluate((button) => (button as HTMLButtonElement).click());
  await expect(monochrome).toHaveAttribute('aria-pressed', 'true');
  const afterCanvas = page.getByLabel('After artwork', { exact: true });
  await expect.poll(() => readCanvasPixels(afterCanvas)).not.toBe(originalCanvas);
  const lastReadyCanvas = await readCanvasPixels(afterCanvas);

  await enqueueLookWorkerRule(page, { action: 'hold', lookId: 'monochrome', minimumDimension: 241 });
  await page.getByLabel('Monochrome strength range', { exact: true }).fill('80');
  await expect.poll(async () => (await getLookWorkerHarness(page)).held).toBe(1);
  await expect.poll(() => readCanvasPixels(afterCanvas)).toBe(lastReadyCanvas);
  await invokeLookWorkerHarness(page, 'failHeld');
  await expect(page.getByText('Look preview failed.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry Look preview' })).toBeVisible();
  await expect.poll(() => readCanvasPixels(afterCanvas)).toBe(lastReadyCanvas);

  const recipeBeforeRetry = await readPersistedLook(page, 'look-failure-authority');
  await page.getByRole('button', { name: 'Retry Look preview' }).click();
  await expect(page.getByText('Look preview failed.', { exact: true })).toHaveCount(0);
  await expect.poll(() => readCanvasPixels(afterCanvas)).not.toBe(lastReadyCanvas);
  await expect.poll(() => readPersistedLook(page, 'look-failure-authority')).toEqual(recipeBeforeRetry);

  await enqueueLookWorkerRule(page, { action: 'fail', lookId: 'monochrome', minimumDimension: 241 });
  await page.getByLabel('Monochrome strength range', { exact: true }).fill('70');
  await expect(page.getByText('Look preview failed.', { exact: true })).toBeVisible();

  await enqueueLookWorkerRule(page, { action: 'hold', lookId: 'monochrome', minimumDimension: 241 });
  await page.getByLabel('Monochrome strength range', { exact: true }).fill('60');
  await expect(page.getByText('Look preview failed.', { exact: true })).toHaveCount(0);
  await expect.poll(async () => (await getLookWorkerHarness(page)).held).toBe(1);
  await page.getByLabel('Monochrome strength range', { exact: true }).fill('50');
  await expect.poll(async () => {
    const requests = (await getLookWorkerHarness(page)).requests;
    return requests.some(({ look, maxDimension }) => look.strength === 50 && maxDimension > 240);
  }).toBe(true);
  await invokeLookWorkerHarness(page, 'failHeld');
  await page.waitForTimeout(100);
  await expect(page.getByText('Look preview failed.', { exact: true })).toHaveCount(0);

  await enqueueLookWorkerRule(page, { action: 'fail', lookId: 'monochrome', minimumDimension: 241 });
  await page.getByLabel('Monochrome strength range', { exact: true }).fill('40');
  await expect(page.getByText('Look preview failed.', { exact: true })).toBeVisible();
  await invokeLookWorkerHarness(page, 'delayNextImage');
  await uploadFixture(page, 800, 1000, 'look-composition-unavailable.png');
  await expect(page.getByLabel('Project name')).toHaveValue('look-composition-unavailable');
  await expect.poll(async () => (await getLookWorkerHarness(page)).delayedImages).toBe(1);
  await expect(page.getByText('Look preview failed.', { exact: true })).toHaveCount(0);
  await invokeLookWorkerHarness(page, 'releaseDelayedImage');
  await expectCanvasPainted(afterCanvas);
});

test('@task5-review disposes the browser worker and pending surfaces on navigation', async ({ page }) => {
  await installLookWorkerHarness(page);
  await page.setViewportSize({ width: 1200, height: 844 });
  await page.goto('/editor');
  await uploadFixture(page, 960, 720, 'look-worker-cleanup.png');
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  await enqueueLookWorkerRule(page, {
    action: 'hold',
    lookId: 'monochrome',
    minimumDimension: 0,
    maximumDimension: 240,
  });
  await page.getByRole('button', { name: 'Looks', exact: true }).click();
  await expect.poll(async () => (await getLookWorkerHarness(page)).held).toBe(1);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await invokeLookWorkerHarness(page, 'failHeld');
  await page.getByRole('button', { name: 'Looks', exact: true }).click();
  await expect(page.getByText('Look preview failed.', { exact: true })).toHaveCount(0);
  const monochrome = page.getByRole('button', { name: 'Monochrome', exact: true });
  await monochrome.evaluate((button) => (button as HTMLButtonElement).click());
  await expect(monochrome).toHaveAttribute('aria-pressed', 'true');
  await enqueueLookWorkerRule(page, { action: 'hold', lookId: 'monochrome', minimumDimension: 241 });
  await page.getByLabel('Monochrome strength range', { exact: true }).fill('75');
  await expect.poll(async () => (await getLookWorkerHarness(page)).held).toBe(1);
  await expect.poll(async () => {
    const snapshot = await getLookWorkerHarness(page);
    return snapshot.active >= 3 &&
      snapshot.active === snapshot.created - snapshot.terminated;
  }).toBe(true);

  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible();
  const afterNavigation = await getLookWorkerHarness(page);
  expect(afterNavigation.active).toBe(0);
  expect(afterNavigation.terminated).toBe(afterNavigation.created);
  expect(afterNavigation.held).toBe(0);
});

test('@task5-review preserves direct canvas drag geometry with a processed Look', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('/editor');
  await uploadFixture(page, 1600, 900, 'look-active-drag.png');
  const canvas = page.getByLabel('Design canvas');
  await expectCanvasPainted(canvas);
  const originalCanvas = await readCanvasPixels(canvas);
  await page.getByRole('button', { name: 'Looks', exact: true }).click();
  await page.getByRole('button', { name: 'High Contrast', exact: true }).click();
  // Looks replaces the design canvas with the before/after compare view, so wait for the
  // processed result on its "after" surface before returning to Select.
  await expect.poll(
    () => readCanvasPixels(page.getByLabel('After artwork', { exact: true })),
  ).not.toBe(originalCanvas);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  // The placement readouts asserted below are numeric placement, which is Advanced-only.
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();

  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounds are unavailable.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4);
  await page.mouse.up();
  await expect(page.getByLabel('X position')).toHaveValue(
    expectedCanonicalDragValue(0.5, box.width * 0.1, box),
  );
  await expect(page.getByLabel('Y position')).toHaveValue(
    expectedCanonicalDragValue(0.5, -box.height * 0.1, box),
  );
});

test('compares Looks across variations', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 844 });
  await page.goto('/editor');
  await uploadFixture(page, 960, 720, 'compare-looks.png');
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  await expectCanvasPainted(page.getByLabel('Design canvas'));

  await renameVariation(page, 'Contrast');
  await page.getByRole('button', { name: 'Looks', exact: true }).click();
  await page.getByRole('button', { name: 'High Contrast', exact: true }).click();

  await duplicateVariation(page);
  await renameVariation(page, 'Mono');
  await page.getByRole('button', { name: 'Monochrome', exact: true }).click();

  await duplicateVariation(page);
  await renameVariation(page, 'Duotone');
  await page.getByRole('button', { name: 'Duotone', exact: true }).click();

  await expect.poll(async () => (await readPersistedProjectBytes(page, 'compare-looks'))?.variations)
    .toEqual([
      { name: 'Contrast', lookId: 'high-contrast' },
      { name: 'Mono', lookId: 'monochrome' },
      { name: 'Duotone', lookId: 'duotone' },
    ]);
  await expect(page.getByLabel('Project name')).toBeVisible();
  const beforeCompare = await readPersistedProjectBytes(page, 'compare-looks');
  expect(beforeCompare).not.toBeNull();

  const looksCommand = page.getByRole('button', { name: 'Looks', exact: true });
  const selectCommand = page.getByRole('button', { name: 'Select', exact: true });
  const compareCommand = page.getByRole('button', { name: 'Compare', exact: true });
  const board = page.getByRole('region', { name: 'Compare Board' });
  await expect(looksCommand).toHaveAttribute('aria-pressed', 'true');
  await expect(compareCommand).toBeEnabled();
  await compareCommand.click();
  await expect(board).toBeVisible();
  await board.getByRole('button', { name: 'Close Compare', exact: true }).click();
  await expect(board).toHaveCount(0);
  await expect(looksCommand).toHaveAttribute('aria-pressed', 'true');
  await expect(compareCommand).toBeFocused();

  await compareCommand.click();
  await expect(board).toBeVisible();
  await compareCommand.click();
  await expect(board).toHaveCount(0);
  await expect(looksCommand).toHaveAttribute('aria-pressed', 'true');
  await expect(compareCommand).toBeFocused();

  await compareCommand.click();
  await expect(board).toBeVisible();
  // The board reflows while its Look previews render, so the disclosure never settles
  // if it is clicked the moment the region becomes visible.
  await expect(board.locator('canvas[data-look-preview="true"]')).toHaveCount(2);
  await board.locator('summary').filter({ hasText: 'Variations' }).click();
  await board.getByRole('checkbox', { name: 'Contrast', exact: true }).check();

  let previews = board.locator('canvas[data-look-preview="true"]');
  await expect(previews).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) {
    await expectCanvasPainted(previews.nth(index));
  }
  const desktopSizes = await previews.evaluateAll((canvases) => canvases.map((canvas) => {
    const rect = canvas.getBoundingClientRect();
    return { width: Math.round(rect.width), height: Math.round(rect.height) };
  }));
  expect(new Set(desktopSizes.map(({ width }) => width)).size).toBe(1);
  expect(new Set(desktopSizes.map(({ height }) => height)).size).toBe(1);
  expect(desktopSizes[0].width).toBeGreaterThan(0);
  expect(desktopSizes[0].height).toBeGreaterThan(0);

  await board.getByRole('button', { name: 'Dark background' }).click();
  await expect(board.getByRole('button', { name: 'Dark background' })).toHaveAttribute('aria-pressed', 'true');
  await expect(previews.first()).toHaveAccessibleName(/dark background/);
  await board.getByRole('button', { name: 'Light background' }).click();
  await expect(board.getByRole('button', { name: 'Light background' })).toHaveAttribute('aria-pressed', 'true');
  await expect(previews.first()).toHaveAccessibleName(/light background/);
  await board.getByLabel('Compare zoom').fill('130');
  await expect(board.getByText('130%', { exact: true })).toBeVisible();

  const afterViewChanges = await readPersistedProjectBytes(page, 'compare-looks');
  expect(afterViewChanges?.updatedAt).toBe(beforeCompare?.updatedAt);
  expect(afterViewChanges?.bytes).toEqual(beforeCompare?.bytes);

  await board.getByRole('button', { name: 'Edit Mono', exact: true }).click();
  await expect(board).toHaveCount(0);
  await expectCanvasPainted(page.getByLabel('Design canvas'));
  await expect(selectCommand).toHaveAttribute('aria-pressed', 'true');
  await expect(looksCommand).toHaveAttribute('aria-pressed', 'false');
  // Assert focus before touching the variation disclosure: opening it moves focus.
  await expect(compareCommand).toBeFocused();
  await openVariationMenu(page);
  await expect(page.getByLabel('Variation name')).toHaveValue('Mono');
  await closeVariationMenu(page);
  await expect.poll(async () => (await readPersistedProjectBytes(page, 'compare-looks'))?.updatedAt)
    .not.toBe(beforeCompare?.updatedAt);
  const afterEdit = await readPersistedProjectBytes(page, 'compare-looks');
  expect(afterEdit).not.toBeNull();

  await compareCommand.click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(board).toBeVisible();
  previews = board.locator('canvas[data-look-preview="true"]');
  await expect(previews).toHaveCount(3);

  for (const label of ['Select', 'Crop', 'Adjust', 'Looks', 'Layers']) {
    const command = page.getByRole('button', { name: label, exact: true });
    await expect(command).toBeDisabled();
    await expect(command).toHaveAccessibleDescription('Editing tools are unavailable while Compare is open.');
  }

  const mobileLayout = await page.evaluate(() => {
    const bounds = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
      };
    };
    const compareBoard = document.querySelector('[aria-label="Compare Board"]');
    const boardHeader = compareBoard?.querySelector('header');
    const strip = document.querySelector('[data-compare-preview-strip="true"]');
    const toolbar = document.querySelector('nav[aria-label="Editor tools"]');
    const tiles = [...document.querySelectorAll('[data-compare-preview="true"]')];
    if (!compareBoard || !boardHeader || !(strip instanceof HTMLElement) || !toolbar || tiles.length !== 3) {
      throw new Error('Expected the complete mobile Compare layout.');
    }
    const headerControls = [
      { name: 'title', element: boardHeader.children[0] },
      { name: 'variations', element: boardHeader.querySelector('details > summary') },
      { name: 'background', element: boardHeader.querySelector('[aria-label="Artwork background"]') },
      {
        name: 'zoom',
        element: boardHeader.querySelector('input[aria-label="Compare zoom"]')?.closest('label') ?? null,
      },
      { name: 'close', element: boardHeader.querySelector('button[aria-label="Close Compare"]') },
    ].filter((entry): entry is { name: string; element: Element } => Boolean(entry.element))
      .map(({ name, element }) => ({ name, ...bounds(element) }));
    const headerControlOverlaps: Array<[number, number]> = [];
    for (let leftIndex = 0; leftIndex < headerControls.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < headerControls.length; rightIndex += 1) {
        const left = headerControls[leftIndex];
        const right = headerControls[rightIndex];
        const overlapWidth = Math.min(left.right, right.right) - Math.max(left.left, right.left);
        const overlapHeight = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
        if (overlapWidth > 1 && overlapHeight > 1) headerControlOverlaps.push([leftIndex, rightIndex]);
      }
    }
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      documentOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      board: bounds(compareBoard),
      header: bounds(boardHeader),
      strip: bounds(strip),
      toolbar: bounds(toolbar),
      tileWidths: tiles.map((tile) => bounds(tile).width),
      headerControls,
      headerControlOverlaps,
      stripScrollable: strip.scrollWidth > strip.clientWidth + 1,
      inspectorCount: document.querySelectorAll('aside[aria-label="Inspector"]').length,
      layerPanelCount: document.querySelectorAll('[aria-label="Layers panel"]').length,
    };
  });
  expect(mobileLayout.documentOverflows).toBe(false);
  expect(mobileLayout.board.left).toBeGreaterThanOrEqual(0);
  expect(mobileLayout.board.right).toBeLessThanOrEqual(mobileLayout.viewport.width);
  expect(mobileLayout.board.top).toBeGreaterThanOrEqual(0);
  expect(mobileLayout.board.bottom).toBeLessThanOrEqual(mobileLayout.toolbar.top + 1);
  expect(mobileLayout.header.bottom).toBeLessThanOrEqual(mobileLayout.strip.top + 1);
  for (const control of mobileLayout.headerControls) {
    expect(control.left, `${control.name} left edge`).toBeGreaterThanOrEqual(0);
    expect(control.right, `${control.name} right edge`).toBeLessThanOrEqual(mobileLayout.viewport.width);
    expect(control.top, `${control.name} top edge`).toBeGreaterThanOrEqual(mobileLayout.header.top);
    expect(control.bottom, `${control.name} bottom edge`).toBeLessThanOrEqual(mobileLayout.header.bottom);
  }
  expect(mobileLayout.headerControlOverlaps).toEqual([]);
  expect(mobileLayout.strip.bottom).toBeLessThanOrEqual(mobileLayout.toolbar.top + 1);
  expect(mobileLayout.stripScrollable).toBe(true);
  expect(mobileLayout.inspectorCount).toBe(0);
  expect(mobileLayout.layerPanelCount).toBe(0);
  expect(new Set(mobileLayout.tileWidths.map(Math.round)).size).toBe(1);
  expect(Math.round(mobileLayout.tileWidths[0])).toBe(358);

  const strip = board.locator('[data-compare-preview-strip="true"]');
  await strip.evaluate((element) => element.scrollTo({ left: element.clientWidth, behavior: 'instant' }));
  await expect.poll(() => strip.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);

  const afterMobileView = await readPersistedProjectBytes(page, 'compare-looks');
  expect(afterMobileView?.updatedAt).toBe(afterEdit?.updatedAt);
  expect(afterMobileView?.bytes).toEqual(afterEdit?.bytes);
});

test('auto-exits Compare to a normalized enabled tool', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 844 });
  await page.goto('/editor');
  await uploadFixture(page, 960, 720, 'compare-auto-exit.png');
  await expectCanvasPainted(page.getByLabel('Design canvas'));

  // Add text first: the Layers button it needs is Basic-mode only on desktop.
  await addTextLayer(page);
  await duplicateVariation(page);
  // Select the image layer while still in Basic: the drawer is unreachable on desktop
  // once Advanced hides the Layers button. Selection order is preserved -- duplicate
  // first, then select -- so the tool state matches what the assertions below expect.
  await openLayers(page);
  await page.getByRole('button', { name: 'Select layer compare-auto-exit.png' }).click();
  await closeLayers(page);
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();

  const cropCommand = page.getByRole('button', { name: 'Crop', exact: true });
  const selectCommand = page.getByRole('button', { name: 'Select', exact: true });
  const compareCommand = page.getByRole('button', { name: 'Compare', exact: true });
  const board = page.getByRole('region', { name: 'Compare Board' });
  await cropCommand.click();
  await expect(cropCommand).toHaveAttribute('aria-pressed', 'true');

  await compareCommand.click();
  await expect(board).toBeVisible();
  await expect(selectCommand).toBeDisabled();
  await expect(cropCommand).toBeDisabled();

  page.once('dialog', (dialog) => dialog.accept());
  await deleteVariation(page);

  await expect(board).toHaveCount(0);
  await expect(compareCommand).toBeDisabled();
  await expect(selectCommand).toBeEnabled();
  await expect(selectCommand).toHaveAttribute('aria-pressed', 'true');
  await expect(selectCommand).toBeFocused();
});

test('crop preserves completed background removal', async ({ page }) => {
  const projectName = 'crop-preserves-cleanup';
  await page.setViewportSize({ width: 1200, height: 844 });
  await page.goto('/editor');
  await uploadPhase2CFixture(page, 320, `${projectName}.png`);
  const canvas = page.getByLabel('Design canvas');
  await expectCanvasPainted(canvas);

  await page.getByRole('button', { name: 'Remove background', exact: true }).click();
  await page.getByLabel('Enable background removal', { exact: true }).check();
  await expect.poll(async () => {
    const workspace = await readPersistedPhase2CWorkspace(page, projectName);
    const image = workspace?.variation.layers.find(({ type }) => type === 'image');
    return image?.backgroundRemoval?.preparedAssetId ?? null;
  }).not.toBeNull();

  const before = await readPersistedPhase2CWorkspace(page, projectName);
  if (!before) throw new Error('Prepared cleanup workspace is unavailable.');
  const sourceAsset = before.assets.find(({ id }) => id === before.sourceAssetId);
  const image = before.variation.layers.find(({ type }) => type === 'image');
  const preparedId = image?.backgroundRemoval?.preparedAssetId;
  const preparedAsset = before.assets.find(({ id }) => id === preparedId);
  if (!sourceAsset || !preparedAsset || !preparedId) throw new Error('Prepared cleanup asset is unavailable.');
  expect(preparedAsset.width / preparedAsset.height).toBe(sourceAsset.width / sourceAsset.height);
  const preparedDigest = preparedAsset.blobDigest;
  const visibleBeforeCrop = await readCanvasPixels(canvas);

  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('button', { name: 'Crop', exact: true }).click();
  await page.getByRole('button', { name: '4:5', exact: true }).click();
  const cropFrame = page.getByRole('group', {
    name: 'Crop frame. Drag inside or use the Arrow keys to reposition. Hold Shift for a larger step.',
    exact: true,
  });
  await cropFrame.focus();
  await cropFrame.press('ArrowRight');
  await expect.poll(() => readCanvasPixels(canvas)).not.toBe(visibleBeforeCrop);
  await expect.poll(async () => {
    const workspace = await readPersistedPhase2CWorkspace(page, projectName);
    const currentImage = workspace?.variation.layers.find(({ type }) => type === 'image');
    return currentImage?.crop?.x ?? 0;
  }).toBeGreaterThan(0);
  await page.waitForTimeout(700);

  const after = await readPersistedPhase2CWorkspace(page, projectName);
  const afterImage = after?.variation.layers.find(({ type }) => type === 'image');
  const afterPrepared = after?.assets.find(({ id }) => id === preparedId);
  expect(afterImage?.backgroundRemoval?.preparedAssetId).toBe(preparedId);
  expect(afterPrepared?.blobDigest).toBe(preparedDigest);
});

test('picked background colors accumulate and persist', async ({ page }) => {
  const projectName = 'cumulative-picked-colors';
  const samples = [
    { x: 0.3, y: 0.5 },
    { x: 0.7, y: 0.5 },
    { x: 0.05, y: 0.5 },
  ];
  await page.setViewportSize({ width: 1200, height: 844 });
  await page.goto('/editor');
  await uploadPickedColorsFixture(page, `${projectName}.png`);
  const canvas = page.getByLabel('Design canvas');
  await expectCanvasPainted(canvas);

  await page.getByRole('button', { name: 'Remove background', exact: true }).click();
  await page.getByRole('button', { name: 'Pick color', exact: true }).click();
  const red = await sourcePointOnCanvas(canvas, samples[0].x, samples[0].y);
  await page.mouse.click(red.x, red.y);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Pick color', exact: true }).click();
  const green = await sourcePointOnCanvas(canvas, samples[1].x, samples[1].y);
  await page.mouse.click(green.x, green.y);
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  await expect.poll(async () => {
    const workspace = await readPersistedPhase2CWorkspace(page, projectName);
    const image = workspace?.variation.layers.find(({ type }) => type === 'image');
    return image?.backgroundRemoval?.picks?.map(({ color }: { color: string }) => color);
  }).toEqual(['#ff0000', '#00ff00']);
  await expect.poll(() => readPreparedAlphaSamples(page, projectName, samples))
    .toEqual([0, 0, 255]);

  await page.reload();
  await page.getByRole('button', { name: 'Open local projects', exact: true }).click();
  await page.getByRole('dialog').getByRole('button').filter({ hasText: projectName }).click();
  await page.getByRole('button', { name: 'Remove background', exact: true }).click();
  await expect(page.getByRole('button', { name: /Remove picked color/ })).toHaveCount(2);
  await expect.poll(() => readPreparedAlphaSamples(page, projectName, samples))
    .toEqual([0, 0, 255]);

  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('button', { name: 'Crop', exact: true }).click();
  await page.getByRole('button', { name: '16:9', exact: true }).click();
  await expect.poll(async () => {
    const workspace = await readPersistedPhase2CWorkspace(page, projectName);
    const image = workspace?.variation.layers.find(({ type }) => type === 'image');
    return image?.crop;
  }).not.toEqual({ x: 0, y: 0, width: 1, height: 1 });
  await expect.poll(() => readPreparedAlphaSamples(page, projectName, samples))
    .toEqual([0, 0, 255]);
});
