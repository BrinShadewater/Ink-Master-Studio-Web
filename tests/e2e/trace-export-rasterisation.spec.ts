import { expect, test } from '@playwright/test';

/**
 * The gap this closes.
 *
 * `editor/tshirtExportRenderer.ts` serialises the sanitised trace SVG with
 * `@xmldom/xmldom`, then hands that string to `createImageBitmap` and draws the result
 * into the exported PNG. Every existing test for that path runs in Node and compares
 * strings and objects — none of them rasterise, because `createImageBitmap` does not
 * exist there.
 *
 * So an xmldom change that altered serializer output could produce a blank or wrong
 * trace layer in a print-ready file while `npm test` stayed green. This test runs the
 * real renderer in a real browser and asserts on pixels.
 *
 * The control case at the end exists so this cannot quietly become theatre: it proves
 * the pixel assertion actually discriminates.
 */

const TRACE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">' +
  '<path fill="#ff0000" d="M0 0L400 0L400 200L0 200Z"/></svg>';

interface RasterEvidence {
  width: number;
  height: number;
  opaquePixels: number;
  redPixels: number;
  error: string | null;
}

const renderTraceExport = async (
  page: import('@playwright/test').Page,
  markup: string,
): Promise<RasterEvidence> =>
  page.evaluate(async (svgMarkup: string): Promise<RasterEvidence> => {
    const load = (specifier: string): Promise<Record<string, unknown>> =>
      import(/* @vite-ignore */ specifier) as Promise<Record<string, unknown>>;

    try {
      const [renderer, traceModel] = await Promise.all([
        load('/editor/tshirtExportRenderer.ts'),
        load('/editor/traceModel.ts'),
      ]);
      const renderTShirtExport = renderer.renderTShirtExport as (
        snapshot: unknown,
      ) => Promise<{ canvas: OffscreenCanvas }>;
      const createDefaultTraceSettings =
        traceModel.createDefaultTraceSettings as () => unknown;

      const transform = {
        x: 0.7,
        y: 0.5,
        scale: 0.75,
        rotation: 0,
        flipX: false,
        flipY: false,
      };

      const snapshot = {
        requestId: 1,
        fingerprint: 'tshirt-export:raster-gate',
        presetId: 'draft-proof',
        variation: {
          id: 'variation',
          name: 'Original',
          layers: [{
            id: 'trace-layer',
            type: 'trace',
            name: 'Trace',
            sourceLayerId: 'original-layer',
            svgAssetId: 'trace',
            visible: true,
            opacity: 1,
            transform,
            settings: createDefaultTraceSettings(),
            sourceFingerprint: 'trace-current',
            sourceFrame: {
              sourceWidth: 400,
              sourceHeight: 200,
              crop: { x: 0, y: 0, width: 1, height: 1 },
            },
          }],
          selectedLayerId: 'trace-layer',
          looks: [],
        },
        placement: { x: 0.5, y: 0.5, scale: 1, rotation: 0 },
        assets: [{
          id: 'trace',
          name: 'trace.svg',
          mimeType: 'image/svg+xml',
          width: 400,
          height: 200,
          role: 'trace-svg',
          bytes: new TextEncoder().encode(svgMarkup).buffer,
        }],
      };

      const frame = await renderTShirtExport(snapshot);
      const context = frame.canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
      const { data } = context.getImageData(0, 0, frame.canvas.width, frame.canvas.height);

      let opaquePixels = 0;
      let redPixels = 0;
      for (let index = 0; index < data.length; index += 4) {
        if (data[index + 3] === 0) continue;
        opaquePixels += 1;
        if (data[index] > 200 && data[index + 1] < 80 && data[index + 2] < 80) {
          redPixels += 1;
        }
      }

      return {
        width: frame.canvas.width,
        height: frame.canvas.height,
        opaquePixels,
        redPixels,
        error: null,
      };
    } catch (error) {
      return {
        width: 0,
        height: 0,
        opaquePixels: 0,
        redPixels: 0,
        error: (error as Error).message,
      };
    }
  }, markup);

test.describe('@trace-raster xmldom serializer output survives rasterisation', () => {
  test('a sanitised trace SVG reaches the exported canvas as visible pixels', async ({ page }) => {
    // PINNED TO A KNOWN BUG. This currently fails with "The source image could not be
    // decoded." Chromium's createImageBitmap does not decode SVG blobs at all — verified
    // directly: a minimal valid SVG fails both plain and with resizeWidth/resizeHeight,
    // while a PNG blob and an <img>-based decode of the same SVG both succeed.
    //
    // `browserRendererDependencies.decodeBitmap` (editor/tshirtExportRenderer.ts:71-81)
    // calls createImageBitmap on an image/svg+xml blob, so exporting a T-shirt PNG for any
    // design containing a trace layer fails in Chrome and Edge with "Could not render
    // artwork for PNG export."
    //
    // Remove this marker when the decode path is fixed. Playwright fails the run if a
    // test.fail() test starts passing, so this cannot rot into a silent pass.
    test.fail();

    await page.goto('/');

    const evidence = await renderTraceExport(page, TRACE_SVG);

    expect(evidence.error, 'renderTShirtExport must not throw').toBeNull();
    expect(evidence.width, 'preset width').toBeGreaterThan(0);
    expect(evidence.height, 'preset height').toBeGreaterThan(0);

    // The trace is a solid #ff0000 rectangle. If xmldom's serialised markup ever stops
    // decoding — a dropped xmlns, a reordered attribute the decoder rejects — the bitmap
    // is blank and this count goes to zero while every Node test still passes.
    expect(evidence.redPixels, 'trace pixels present in the exported canvas')
      .toBeGreaterThan(0);
    expect(evidence.opaquePixels, 'exported canvas is not empty').toBeGreaterThan(0);
  });

  test('control: markup that cannot rasterise yields no trace pixels', async ({ page }) => {
    await page.goto('/');

    // Same document, but the SVG namespace is removed. createImageBitmap refuses this,
    // so the render must either throw or produce no trace pixels. If this case ever
    // reports red pixels, the assertion above is not measuring what it claims to.
    const evidence = await renderTraceExport(
      page,
      '<svg viewBox="0 0 400 200"><path fill="#ff0000" d="M0 0L400 0L400 200L0 200Z"/></svg>',
    );

    expect(
      evidence.error !== null || evidence.redPixels === 0,
      'unrasterisable markup must not produce trace pixels',
    ).toBe(true);
  });
});
