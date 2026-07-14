import { expect, Page, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const createPngFixture = async (page: Page, width: number, height: number): Promise<Buffer> => {
  const bytes = await page.evaluate(async ({ fixtureWidth, fixtureHeight }) => {
    const canvas = document.createElement('canvas');
    canvas.width = fixtureWidth;
    canvas.height = fixtureHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable.');
    const gradient = context.createLinearGradient(0, 0, fixtureWidth, fixtureHeight);
    gradient.addColorStop(0, '#17345f');
    gradient.addColorStop(1, '#f2b84b');
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
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error('PNG fixture failed.')), 'image/png');
    });
    return [...new Uint8Array(await blob.arrayBuffer())];
  }, { fixtureWidth: width, fixtureHeight: height });
  return Buffer.from(bytes);
};

const readPng = (buffer: Buffer) => {
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  let pixelsPerMeter: [number, number] | null = null;

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    if (type === 'IHDR') {
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      colorType = buffer[dataStart + 9];
    }
    if (type === 'pHYs') {
      pixelsPerMeter = [
        buffer.readUInt32BE(dataStart),
        buffer.readUInt32BE(dataStart + 4),
      ];
    }
    offset += length + 12;
    if (type === 'IEND') break;
  }

  return { width, height, colorType, pixelsPerMeter };
};

const uploadFixture = async (page: Page, width: number, height: number, name: string) => {
  const buffer = await createPngFixture(page, width, height);
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: 'image/png',
    buffer,
  });
};

test('defers full export until download', async ({ page }) => {
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), 'Worker interception is local-only.');
  const purposes: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (text.startsWith('worker-purpose:')) purposes.push(text.replace('worker-purpose:', ''));
  });
  await page.route(/imageProcessing\.worker/, (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `
      self.onmessage = async (event) => {
        const { id, settings } = event.data;
        console.log('worker-purpose:' + (settings.purpose || 'unset'));
        const width = settings.purpose === 'preview' ? 1333 : 4500;
        const height = settings.purpose === 'preview' ? 1600 : 5400;
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext('2d');
        context.fillStyle = '#123456';
        context.fillRect(0, 0, width, height);
        const blob = await canvas.convertToBlob({ type: 'image/png' });
        self.postMessage({ id, type: 'progress', progress: { percent: 100, stage: 'Done' } });
        self.postMessage({
          id,
          type: 'complete',
          blob,
          width,
          height,
          upscale: {
            method: settings.purpose === 'preview' ? 'none' : 'local-progressive',
            ratio: settings.purpose === 'preview' ? 1 : 1.8,
            sourceSize: [2500, 3000],
            targetSize: [4500, 5400],
          },
        });
      };
    `,
  }));
  await page.goto('/');

  await uploadFixture(page, 2500, 3000, 'deferred-art.png');
  await expect(page.getByRole('button', { name: 'Download print file' })).toBeEnabled();
  expect(purposes).toEqual(['preview']);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download print file' }).click();
  await downloadPromise;
  expect(purposes).toEqual(['preview', 'export']);
});

test('allows extreme enlargement after showing a strong warning', async ({ page }) => {
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), 'Worker interception is local-only.');
  await page.route(/imageProcessing\.worker/, (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `
      self.onmessage = async (event) => {
        const { id, settings } = event.data;
        const width = settings.purpose === 'preview' ? 1333 : 4500;
        const height = settings.purpose === 'preview' ? 1600 : 5400;
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext('2d');
        context.fillStyle = '#345678';
        context.fillRect(0, 0, width, height);
        const blob = await canvas.convertToBlob({ type: 'image/png' });
        self.postMessage({
          id,
          type: 'complete',
          blob,
          width,
          height,
          upscale: {
            method: settings.purpose === 'preview' ? 'none' : 'local-progressive',
            ratio: settings.purpose === 'preview' ? 1 : 5,
            sourceSize: [900, 1080],
            targetSize: [4500, 5400],
          },
        });
      };
    `,
  }));

  await page.goto('/');
  await uploadFixture(page, 900, 1080, 'tiny-art.png');
  await expect(page.getByText('This image needs 5x enlargement. Download is allowed, but fine detail may look soft or artificial.').first()).toBeVisible();
  const downloadButton = page.getByRole('button', { name: 'Download print file' });
  await expect(downloadButton).toBeEnabled();

  const downloadPromise = page.waitForEvent('download');
  await downloadButton.click();
  await downloadPromise;
});

test('offers creator placement controls before download', async ({ page }) => {
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), 'Worker interception is local-only.');
  const exportSettings: Array<Record<string, unknown>> = [];
  page.on('console', (message) => {
    const text = message.text();
    if (text.startsWith('export-settings:')) {
      exportSettings.push(JSON.parse(text.replace('export-settings:', '')));
    }
  });
  await page.route(/imageProcessing\.worker/, (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `
      self.onmessage = async (event) => {
        const { id, settings } = event.data;
        if (settings.purpose === 'export') console.log('export-settings:' + JSON.stringify(settings));
        const width = settings.purpose === 'preview' ? 1333 : 4500;
        const height = settings.purpose === 'preview' ? 1600 : 5400;
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext('2d');
        context.fillStyle = '#223344';
        context.fillRect(0, 0, width, height);
        const blob = await canvas.convertToBlob({ type: 'image/png' });
        self.postMessage({
          id,
          type: 'complete',
          blob,
          width,
          height,
          upscale: {
            method: 'none',
            ratio: 1,
            sourceSize: [2500, 3000],
            targetSize: [4500, 5400],
          },
        });
      };
    `,
  }));

  await page.goto('/');
  await uploadFixture(page, 2500, 3000, 'placement-art.png');
  await page.getByRole('button', { name: 'Keep as uploaded' }).click();
  await expect(page.getByText('Position and size')).toBeVisible();

  await page.getByRole('button', { name: 'Fill print area' }).click();
  await page.getByLabel('Scale').fill('125');
  await page.getByLabel('Horizontal position').fill('10');
  await page.getByLabel('Vertical position').fill('-8');
  await page.getByLabel('Rotate').fill('12');
  await page.getByRole('button', { name: 'Black' }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download print file' }).click();
  await downloadPromise;

  expect(exportSettings.at(-1)).toMatchObject({
    resizeMode: 'COVER',
    designScalePercent: 125,
    designOffsetXPercent: 10,
    designOffsetYPercent: -8,
    designRotationDegrees: 12,
    preserveTransparency: false,
    shirtColor: 'NONE',
    canvasBackground: 'black',
  });
});

test('supports visual print placement editing and quick presets', async ({ page }) => {
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), 'Worker interception is local-only.');
  await page.route(/imageProcessing\.worker/, (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `
      self.onmessage = async (event) => {
        const { id, settings } = event.data;
        const width = settings.purpose === 'preview' ? 1333 : 4500;
        const height = settings.purpose === 'preview' ? 1600 : 5400;
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext('2d');
        context.fillStyle = '#28384f';
        context.fillRect(0, 0, width, height);
        const blob = await canvas.convertToBlob({ type: 'image/png' });
        self.postMessage({
          id,
          type: 'complete',
          blob,
          width,
          height,
          upscale: {
            method: 'none',
            ratio: 1,
            sourceSize: [2500, 3000],
            targetSize: [4500, 5400],
          },
        });
      };
    `,
  }));

  await page.goto('/');
  await uploadFixture(page, 2500, 3000, 'visual-placement-art.png');
  await page.getByRole('button', { name: 'Keep as uploaded' }).click();
  await expect(page.getByLabel('Interactive print placement preview')).toBeVisible();
  await expect(page.getByText('SAFE AREA')).toBeVisible();

  const resizeHandle = page.getByLabel('Resize artwork');
  const resizeBox = await resizeHandle.boundingBox();
  if (!resizeBox) throw new Error('Resize handle was not measurable.');
  await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(resizeBox.x + resizeBox.width / 2 + 90, resizeBox.y + resizeBox.height / 2 + 90);
  await page.mouse.up();
  expect(Number(await page.getByLabel('Scale').inputValue())).toBeGreaterThan(100);

  const rotateHandle = page.getByLabel('Turn artwork handle');
  const rotateBox = await rotateHandle.boundingBox();
  const previewBox = await page.getByLabel('Interactive print placement preview').boundingBox();
  if (!rotateBox || !previewBox) throw new Error('Rotate controls were not measurable.');
  await page.mouse.move(rotateBox.x + rotateBox.width / 2, rotateBox.y + rotateBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(previewBox.x + previewBox.width - 10, previewBox.y + previewBox.height / 2);
  await page.mouse.up();
  expect(Math.abs(Number(await page.getByLabel('Rotate').inputValue()))).toBeGreaterThan(10);

  const artwork = page.getByLabel('Drag artwork position');
  const artworkBox = await artwork.boundingBox();
  if (!artworkBox) throw new Error('Artwork preview was not measurable.');
  await page.mouse.move(artworkBox.x + artworkBox.width / 2, artworkBox.y + artworkBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(artworkBox.x + artworkBox.width / 2 + 80, artworkBox.y + artworkBox.height / 2 + 50);
  await page.mouse.up();
  expect(Number(await page.getByLabel('Horizontal position').inputValue())).toBeGreaterThan(0);
  expect(Number(await page.getByLabel('Vertical position').inputValue())).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Full front' }).click();
  await expect(page.getByLabel('Scale')).toHaveValue('112');
  await page.getByRole('button', { name: 'Top chest' }).click();
  await expect(page.getByLabel('Scale')).toHaveValue('58');
  await expect(page.getByLabel('Vertical position')).toHaveValue('-18');
  await page.getByRole('button', { name: 'Center' }).click();
  await expect(page.getByLabel('Horizontal position')).toHaveValue('0');
  await expect(page.getByLabel('Vertical position')).toHaveValue('0');
  await expect(page.getByLabel('Rotate')).toHaveValue('0');
});

test('supports crop adjustments undo redo and before-after preview', async ({ page }) => {
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), 'Worker interception is local-only.');
  const exportSettings: Array<Record<string, unknown>> = [];
  page.on('console', (message) => {
    const text = message.text();
    if (text.startsWith('export-settings:')) exportSettings.push(JSON.parse(text.replace('export-settings:', '')));
  });
  await page.route(/imageProcessing\.worker/, (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `
      self.onmessage = async (event) => {
        const { id, settings } = event.data;
        if (settings.purpose === 'export') console.log('export-settings:' + JSON.stringify(settings));
        const width = settings.purpose === 'preview' ? 1333 : 4500;
        const height = settings.purpose === 'preview' ? 1600 : 5400;
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext('2d');
        context.fillStyle = '#46566f';
        context.fillRect(0, 0, width, height);
        const blob = await canvas.convertToBlob({ type: 'image/png' });
        self.postMessage({
          id,
          type: 'complete',
          blob,
          width,
          height,
          upscale: {
            method: 'none',
            ratio: 1,
            sourceSize: [2500, 3000],
            targetSize: [4500, 5400],
          },
        });
      };
    `,
  }));

  await page.goto('/');
  await uploadFixture(page, 2500, 3000, 'crop-adjust-art.png');
  await page.getByRole('button', { name: 'Keep as uploaded' }).click();

  await page.getByRole('button', { name: 'Trim edges' }).click();
  await expect(page.getByLabel('Crop left')).toHaveValue('5');
  await expect(page.getByLabel('Crop top')).toHaveValue('5');
  await page.getByRole('button', { name: 'Reset crop' }).click();
  await expect(page.getByLabel('Crop left')).toHaveValue('0');

  await page.getByLabel('Crop left').fill('7');
  await page.getByLabel('Crop top').fill('8');
  await page.getByLabel('Crop right').fill('9');
  await page.getByLabel('Crop bottom').fill('10');
  await page.getByLabel('Brightness').fill('125');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByLabel('Brightness')).toHaveValue('100');
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.getByLabel('Brightness')).toHaveValue('125');
  await page.getByLabel('Contrast').fill('115');
  await page.getByLabel('Saturation').fill('85');
  await page.getByLabel('Sharpness').fill('30');
  await page.getByLabel('Opacity').fill('80');

  await page.getByRole('button', { name: 'Print file', exact: true }).click();
  await expect(page.getByLabel('Interactive print placement preview')).toBeVisible();
  await page.getByRole('button', { name: 'Original' }).click();
  await expect(page.getByText('SAFE AREA')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download print file' }).click();
  await downloadPromise;

  expect(exportSettings.at(-1)).toMatchObject({
    cropLeftPercent: 7,
    cropTopPercent: 8,
    cropRightPercent: 9,
    cropBottomPercent: 10,
    adjustmentBrightness: 125,
    adjustmentContrast: 115,
    adjustmentSaturation: 85,
    sharpness: 30,
    adjustmentOpacity: 80,
  });
});

test('applies creator presets saved setups and shows export summary', async ({ page }) => {
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), 'Worker interception is local-only.');
  await page.route(/imageProcessing\.worker/, (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `
      self.onmessage = async (event) => {
        const { id, settings } = event.data;
        const width = settings.purpose === 'preview' ? 1333 : 4500;
        const height = settings.purpose === 'preview' ? 1600 : 5400;
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext('2d');
        context.fillStyle = '#536174';
        context.fillRect(0, 0, width, height);
        const blob = await canvas.convertToBlob({ type: 'image/png' });
        self.postMessage({
          id,
          type: 'complete',
          blob,
          width,
          height,
          upscale: { method: 'none', ratio: 1, sourceSize: [2500, 3000], targetSize: [4500, 5400] },
        });
      };
    `,
  }));

  await page.goto('/');
  await uploadFixture(page, 2500, 3000, 'preset-art.png');
  await page.getByRole('button', { name: 'Keep as uploaded' }).click();

  await page.getByRole('button', { name: 'Bold merch' }).click();
  await expect(page.getByLabel('Scale')).toHaveValue('112');
  await expect(page.getByLabel('Contrast')).toHaveValue('125');
  await expect(page.getByText('Export summary')).toBeVisible();
  await expect(page.getByText('Transparent background.')).toBeVisible();
  await expect(page.getByText(/Image adjusted: brightness 110%, contrast 125%/)).toBeVisible();

  await page.getByRole('button', { name: 'Save this setup' }).click();
  await page.getByRole('button', { name: 'Photo tee' }).click();
  await expect(page.getByLabel('Scale')).toHaveValue('105');
  await page.getByRole('button', { name: 'Apply saved setup' }).click();
  await expect(page.getByLabel('Scale')).toHaveValue('112');
  await expect(page.getByLabel('Contrast')).toHaveValue('125');
});

test('keeps the creator editor usable on mobile', async ({ page }) => {
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), 'Worker interception is local-only.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/imageProcessing\.worker/, (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `
      self.onmessage = async (event) => {
        const { id, settings } = event.data;
        const width = settings.purpose === 'preview' ? 1333 : 4500;
        const height = settings.purpose === 'preview' ? 1600 : 5400;
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext('2d');
        context.fillStyle = '#384960';
        context.fillRect(0, 0, width, height);
        const blob = await canvas.convertToBlob({ type: 'image/png' });
        self.postMessage({
          id,
          type: 'complete',
          blob,
          width,
          height,
          upscale: { method: 'none', ratio: 1, sourceSize: [2500, 3000], targetSize: [4500, 5400] },
        });
      };
    `,
  }));

  await page.goto('/');
  await uploadFixture(page, 2500, 3000, 'mobile-art.png');
  await page.getByRole('button', { name: 'Keep as uploaded' }).click();
  await expect(page.getByLabel('Interactive print placement preview')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sticker logo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download print file' })).toBeVisible();

  const resizeBox = await page.getByLabel('Resize artwork').boundingBox();
  const rotateBox = await page.getByLabel('Turn artwork handle').boundingBox();
  if (!resizeBox || !rotateBox) throw new Error('Mobile editor handles were not measurable.');
  expect(resizeBox.width).toBeGreaterThanOrEqual(38);
  expect(resizeBox.height).toBeGreaterThanOrEqual(38);
  expect(rotateBox.width).toBeGreaterThanOrEqual(38);
  expect(rotateBox.height).toBeGreaterThanOrEqual(38);

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);
});

test('creates a Printify-ready tee PNG in under 60 seconds', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });

  await page.goto('/');
  const startedAt = Date.now();
  await uploadFixture(page, 2500, 3000, 'acceptance-art.png');

  await expect(page.getByText('Upscaled 1.8x from 2500 x 3000px. Good for this selected size.').first()).toBeVisible();
  await expect(page.getByText('Background detected')).toBeVisible();
  await page.getByRole('button', { name: 'Keep as uploaded' }).click();

  const downloadButton = page.getByRole('button', { name: 'Download print file' });
  try {
    await expect(downloadButton).toBeEnabled({ timeout: 60_000 });
  } catch {
    throw new Error(`Print-file processing did not complete. Browser errors: ${browserErrors.join(' | ') || 'none'}`);
  }
  expect(Date.now() - startedAt).toBeLessThan(60_000);

  await page.getByRole('button', { name: 'Preview on product' }).click();
  await expect(page.getByAltText('T-shirt (full front) mockup preview')).toBeVisible({ timeout: 30_000 });
  await expect(downloadButton).toBeEnabled();

  const downloadPromise = page.waitForEvent('download');
  await downloadButton.click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const output = Buffer.concat(chunks);
  const png = readPng(output);
  if (process.env.INKMASTER_E2E_EXPORT_PATH) {
    await writeFile(process.env.INKMASTER_E2E_EXPORT_PATH, output);
  }

  expect(download.suggestedFilename()).toMatch(/acceptance-art_tee-front-full\.png$/);
  expect(output.byteLength).toBeLessThan(100_000_000);
  expect(png).toEqual({
    width: 4500,
    height: 5400,
    colorType: 6,
    pixelsPerMeter: [11811, 11811],
  });
  await expect(page.getByText('Downloaded file')).toBeVisible();
  await expect(page.getByText('acceptance-art_tee-front-full.png')).toBeVisible();
  await expect(page.getByText('4500 x 5400 px')).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test('validates an edited tee export against the downloaded PNG bytes', async ({ page }) => {
  await page.goto('/');
  await uploadFixture(page, 2500, 3000, 'edited-tee.png');
  await page.getByRole('button', { name: 'Keep as uploaded' }).click();

  await page.getByRole('button', { name: 'Bold merch' }).click();
  await page.getByLabel('Scale').fill('125');
  await page.getByLabel('Rotate').fill('12');
  await page.getByLabel('Horizontal position').fill('8');
  await page.getByLabel('Vertical position').fill('-6');
  await page.getByLabel('Crop left').fill('4');
  await page.getByLabel('Crop right').fill('4');
  await page.getByLabel('Contrast').fill('125');
  await page.getByLabel('Saturation').fill('115');
  await page.getByRole('button', { name: 'Center' }).click();

  const downloadButton = page.getByRole('button', { name: 'Download print file' });
  await expect(downloadButton).toBeEnabled({ timeout: 60_000 });

  const downloadPromise = page.waitForEvent('download');
  await downloadButton.click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const output = Buffer.concat(chunks);
  const png = readPng(output);

  expect(download.suggestedFilename()).toMatch(/edited-tee_tee-front-full\.png$/);
  expect(output.byteLength).toBeLessThan(100_000_000);
  expect(png.width).toBe(4500);
  expect(png.height).toBe(5400);
  expect([2, 6]).toContain(png.colorType);
  expect(png.pixelsPerMeter).toEqual([11811, 11811]);
  await expect(page.getByText('Downloaded file')).toBeVisible();
  await expect(page.getByText('READY', { exact: true })).toBeVisible();
  await expect(page.getByText('RGB color file')).toBeVisible();
});

const expectedPixelsPerMeter = (dpi: number): [number, number] => {
  const value = Math.round(dpi / 0.0254);
  return [value, value];
};

const presetCases = [
  { button: 'T-shirt', source: [2500, 3000], output: [4500, 5400], dpi: 300, filename: /matrix-t-shirt_tee-front-full\.png$/ },
  { button: 'Hoodie', source: [1800, 1200], output: [3531, 2352], dpi: 300, filename: /matrix-hoodie_hoodie-front\.png$/ },
  { button: 'Mug', source: [1200, 560], output: [2475, 1155], dpi: 300, filename: /matrix-mug_mug-wrap\.png$/ },
  { button: 'Poster', source: [1600, 2400], output: [3600, 5400], dpi: 300, filename: /matrix-poster_poster-12x18\.png$/ },
  { button: 'Blanket', source: [2500, 3000], output: [7825, 9325], dpi: 150, filename: /matrix-blanket_large-format\.png$/ },
] as const;

for (const preset of presetCases) {
  test(`Printify preset export matrix: ${preset.button}`, async ({ page }) => {
    test.setTimeout(180_000);
    const startedAt = Date.now();

    await page.goto('/');
    await uploadFixture(
      page,
      preset.source[0],
      preset.source[1],
      `matrix-${preset.button.toLowerCase()}.png`,
    );
    await page.getByRole('button', { name: new RegExp(`^${preset.button[0]} ${preset.button} `) }).click();
    await page.getByRole('button', { name: 'Keep as uploaded' }).click();

    const downloadButton = page.getByRole('button', { name: 'Download print file' });
    await expect(downloadButton).toBeEnabled({ timeout: 60_000 });

    const downloadPromise = page.waitForEvent('download');
    await downloadButton.click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const output = Buffer.concat(chunks);
    const png = readPng(output);
    const elapsed = Date.now() - startedAt;
    test.info().annotations.push({ type: 'elapsed-ms', description: `${elapsed}` });

    expect(download.suggestedFilename()).toMatch(preset.filename);
    expect(output.byteLength).toBeLessThan(100_000_000);
    expect(png.width).toBe(preset.output[0]);
    expect(png.height).toBe(preset.output[1]);
    expect([2, 6]).toContain(png.colorType);
    expect(png.pixelsPerMeter).toEqual(expectedPixelsPerMeter(preset.dpi));
    if (preset.button === 'T-shirt') expect(elapsed).toBeLessThan(60_000);
  });
}

test('keeps processing cancellable while the worker is busy', async ({ page }) => {
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), 'Worker interception is local-only.');
  await page.route(/imageProcessing\.worker/, (route) => route.fulfill({
    contentType: 'application/javascript',
    body: 'self.onmessage = () => {};',
  }));
  await page.goto('/');
  await uploadFixture(page, 2500, 3000, 'cancel-art.png');

  const cancelButton = page.getByRole('button', { name: 'Cancel' });
  await expect(cancelButton).toBeVisible();
  await cancelButton.click();
  await expect(page.getByText('Preview build was cancelled.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New file' })).toBeEnabled();
});

test('shows a retry when the worker stalls', async ({ page }) => {
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), 'Worker timeout simulation is local-only.');
  await page.clock.install();
  await page.route(/imageProcessing\.worker/, (route) => route.fulfill({
    contentType: 'application/javascript',
    body: 'self.onmessage = () => {};',
  }));
  await page.goto('/');
  await uploadFixture(page, 800, 900, 'stalled-art.png');
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();

  await page.clock.fastForward(120_001);
  await expect(page.getByText('Image processing stalled. Try again or use a smaller source file.')).toBeVisible();
  const retryButton = page.getByRole('button', { name: 'Retry processing' });
  await expect(retryButton).toBeVisible();
  await retryButton.click();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
});
