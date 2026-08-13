import { expect, test } from '@playwright/test';

/**
 * The gap this closes.
 *
 * `editor/tshirtExportRenderer.ts` rasterises the sanitised trace document into the
 * exported PNG. Every other test for that path runs in Node and compares strings and
 * objects — none of them rasterise, because neither `Path2D` nor `createImageBitmap`
 * exists there. So the step where a trace becomes pixels in a print-ready file had no
 * coverage at all, in a repo where the export is treated as a print contract.
 *
 * This runs the real renderer in a real browser and asserts on pixels. It earned its
 * keep immediately: it caught that the renderer used to serialise the trace back to SVG
 * and decode it with `createImageBitmap`, which Chromium cannot do for `image/svg+xml`
 * blobs at all — every trace export failed in Chrome and Edge.
 *
 * The two control cases exist so this cannot quietly become theatre. They prove the
 * pixel assertion discriminates on colour rather than merely on "something was drawn",
 * and that unsafe markup is still refused on this path.
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

test.describe('@trace-raster a trace layer reaches the exported canvas', () => {
  test('a sanitised trace reaches the exported canvas as visible pixels', async ({ page }) => {
    await page.goto('/');

    const evidence = await renderTraceExport(page, TRACE_SVG);

    expect(evidence.error, 'renderTShirtExport must not throw').toBeNull();
    expect(evidence.width, 'preset width').toBeGreaterThan(0);
    expect(evidence.height, 'preset height').toBeGreaterThan(0);

    // The trace is a solid #ff0000 rectangle. If the trace ever stops reaching the
    // canvas, this count goes to zero while every Node test still passes.
    expect(evidence.redPixels, 'trace pixels present in the exported canvas')
      .toBeGreaterThan(0);
    expect(evidence.opaquePixels, 'exported canvas is not empty').toBeGreaterThan(0);
  });

  test('control: the pixel count tracks the trace colour, not merely any paint', async ({ page }) => {
    await page.goto('/');

    // The same document filled green. Something is still drawn, so the canvas is not
    // empty — but no red may appear. If this reported red pixels, the assertion above
    // would be measuring incidental paint rather than the trace itself.
    const evidence = await renderTraceExport(
      page,
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">' +
      '<path fill="#00ff00" d="M0 0L400 0L400 200L0 200Z"/></svg>',
    );

    expect(evidence.error, 'a green trace still renders').toBeNull();
    expect(evidence.opaquePixels, 'green trace paints the canvas').toBeGreaterThan(0);
    expect(evidence.redPixels, 'no red paint from a green trace').toBe(0);
  });

  test('control: unsafe trace markup is refused rather than drawn', async ({ page }) => {
    await page.goto('/');

    // The sanitiser allowlists only path and g elements. A script element must be
    // rejected before anything reaches the canvas, on this path as much as in Node.
    const evidence = await renderTraceExport(
      page,
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">' +
      '<script>alert(1)</script><path fill="#ff0000" d="M0 0L400 0L400 200L0 200Z"/></svg>',
    );

    expect(evidence.error, 'unsafe markup must fail the render').not.toBeNull();
    expect(evidence.redPixels, 'unsafe markup paints nothing').toBe(0);
  });
});
