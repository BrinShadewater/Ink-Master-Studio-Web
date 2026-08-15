import { expect, type Locator, type Page, test } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const artifactPath = (name: string) => path.join(process.cwd(), 'test-results', 'task-7', name);
export const phase2aArtifactPath = (name: string) => path.join(process.cwd(), 'test-results', 'phase-2a', name);
export const phase2bArtifactPath = (name: string) => path.join(process.cwd(), 'test-results', 'phase-2b', name);
export const phase2cArtifactPath = (name: string) => {
  const directory = path.join(process.cwd(), 'test-results', 'phase-2c');
  mkdirSync(directory, { recursive: true });
  return path.join(directory, name);
};
export const phase3aArtifactPath = (name: string) => {
  const directory = path.join(process.cwd(), 'test-results', 'phase-3a');
  mkdirSync(directory, { recursive: true });
  return path.join(directory, name);
};
export const phase3bArtifactPath = (name: string) => {
  const directory = path.join(process.cwd(), 'test-results', 'phase-3b');
  mkdirSync(directory, { recursive: true });
  return path.join(directory, name);
};

export type LookRecipeSnapshot = Record<string, string | number>;

export interface PersistedPhase2BProjectSnapshot {
  schemaVersion: number;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  sourceAssetId: string;
  sourceMetadata: { name: string; mimeType: string; width: number; height: number };
  activeVariationId: string;
  variations: Array<{
    id: string;
    name: string;
    layers: Array<Record<string, unknown>>;
    selectedLayerId: string;
    look: LookRecipeSnapshot;
    looks: LookRecipeSnapshot[];
  }>;
  productVariants: TShirtProductSnapshot[];
}

export interface TShirtProductSnapshot {
  id: string;
  variationId: string;
  type: 'tshirt';
  mockupSlug:
    | 'black'
    | 'burgundy'
    | 'cardinal'
    | 'charcoal'
    | 'forest-green'
    | 'heather'
    | 'military-green'
    | 'navy'
    | 'orange'
    | 'red'
    | 'royal-blue'
    | 'white';
  printMethod: 'dtg' | 'dtf' | 'vinyl';
  colorVariationIds: Record<string, string>;
  placement: {
    x: number;
    y: number;
    scale: number;
    rotation: number;
  };
}

export interface PersistedPhase3AWorkspaceSnapshot {
  schemaVersion: number;
  activeVariationId: string;
  variations: Array<{
    id: string;
    name: string;
    layers: Array<Record<string, unknown>>;
  }>;
  productVariants: TShirtProductSnapshot[];
  sourceDigest: string;
}

export interface LookWorkerHarnessSnapshot {
  created: number;
  terminated: number;
  active: number;
  held: number;
  delayedImages: number;
  requests: Array<{
    requestId: number;
    renderKey: string;
    maxDimension: number;
    look: LookRecipeSnapshot;
    looks: LookRecipeSnapshot[];
  }>;
}

export interface LookWorkerRule {
  action: 'fail' | 'hold';
  lookId: string;
  minimumDimension: number;
  maximumDimension?: number;
}

export const installLookWorkerHarness = async (page: Page) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const counterStorageKey = 'task-5-look-worker-counters';
    const storedCounters = JSON.parse(sessionStorage.getItem(counterStorageKey) ?? 'null') as {
      created?: number;
      terminated?: number;
      active?: number;
    } | null;
    const counters = {
      created: storedCounters?.created ?? 0,
      terminated: storedCounters?.terminated ?? 0,
      active: storedCounters?.active ?? 0,
    };
    const requests: LookWorkerHarnessSnapshot['requests'] = [];
    const rules: LookWorkerRule[] = [];
    const held: Array<{
      owner: LookWorkerProxy;
      message: Record<string, unknown>;
      transfer: Transferable[];
    }> = [];
    const delayedImages: Array<{ image: HTMLImageElement; source: string }> = [];
    let delayNextImage = false;

    const persistCounters = () => {
      sessionStorage.setItem(counterStorageKey, JSON.stringify(counters));
    };

    class LookWorkerProxy extends EventTarget {
      private readonly nativeWorker: Worker;
      private terminated = false;

      constructor(scriptURL: string | URL, options?: WorkerOptions) {
        super();
        this.nativeWorker = new NativeWorker(scriptURL, options);
        counters.created += 1;
        counters.active += 1;
        persistCounters();
        this.nativeWorker.addEventListener('message', (event) => {
          this.dispatchEvent(new MessageEvent('message', { data: event.data }));
        });
        this.nativeWorker.addEventListener('error', () => this.dispatchEvent(new Event('error')));
        this.nativeWorker.addEventListener('messageerror', () => this.dispatchEvent(new Event('messageerror')));
      }

      postMessage(message: unknown, transfer: Transferable[] = []): void {
        if (!message || typeof message !== 'object') {
          this.nativeWorker.postMessage(message, transfer);
          return;
        }
        const record = message as Record<string, unknown>;
        const looks = record.looks;
        if (!Array.isArray(looks) || typeof record.renderKey !== 'string') {
          this.nativeWorker.postMessage(message, transfer);
          return;
        }
        const recipes = JSON.parse(JSON.stringify(looks)) as LookRecipeSnapshot[];
        const recipe = recipes[recipes.length - 1] ?? { id: 'original', strength: 100 };
        const maxDimension = Math.max(Number(record.width) || 0, Number(record.height) || 0);
        requests.push({
          requestId: Number(record.requestId),
          renderKey: record.renderKey,
          maxDimension,
          look: recipe,
          looks: recipes,
        });
        const ruleIndex = rules.findIndex((rule) => (
          rule.lookId === recipe.id &&
          maxDimension >= rule.minimumDimension &&
          (rule.maximumDimension === undefined || maxDimension <= rule.maximumDimension)
        ));
        if (ruleIndex < 0) {
          this.nativeWorker.postMessage(message, transfer);
          return;
        }

        const [rule] = rules.splice(ruleIndex, 1);
        if (rule.action === 'hold') {
          held.push({ owner: this, message: record, transfer });
          return;
        }
        queueMicrotask(() => this.fail(record));
      }

      fail(message: Record<string, unknown>): void {
        this.dispatchEvent(new MessageEvent('message', {
          data: {
            requestId: message.requestId,
            renderKey: message.renderKey,
            message: 'Look preview failed.',
          },
        }));
      }

      release(message: Record<string, unknown>, transfer: Transferable[]): void {
        this.nativeWorker.postMessage(message, transfer);
      }

      terminate(): void {
        if (this.terminated) return;
        this.terminated = true;
        for (let index = held.length - 1; index >= 0; index -= 1) {
          if (held[index].owner === this) held.splice(index, 1);
        }
        counters.terminated += 1;
        counters.active -= 1;
        persistCounters();
        this.nativeWorker.terminate();
      }
    }

    Object.defineProperty(window, 'Worker', {
      configurable: true,
      writable: true,
      value: LookWorkerProxy,
    });

    const sourceDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (!sourceDescriptor?.get || !sourceDescriptor.set) {
      throw new Error('HTML image source descriptor is unavailable.');
    }
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      configurable: sourceDescriptor.configurable,
      enumerable: sourceDescriptor.enumerable,
      get: sourceDescriptor.get,
      set(source: string) {
        if (delayNextImage) {
          delayNextImage = false;
          delayedImages.push({ image: this, source: String(source) });
          return;
        }
        sourceDescriptor.set!.call(this, source);
      },
    });

    const harness = {
      enqueue(rule: LookWorkerRule) {
        rules.push(rule);
      },
      failHeld() {
        const pending = held.shift();
        if (pending) pending.owner.fail(pending.message);
      },
      releaseHeld() {
        const pending = held.shift();
        if (pending) pending.owner.release(pending.message, pending.transfer);
      },
      delayNextImage() {
        delayNextImage = true;
      },
      releaseDelayedImage() {
        const pending = delayedImages.shift();
        if (pending) sourceDescriptor.set!.call(pending.image, pending.source);
      },
      snapshot(): LookWorkerHarnessSnapshot {
        return {
          ...counters,
          held: held.length,
          delayedImages: delayedImages.length,
          requests: structuredClone(requests),
        };
      },
    };
    Object.defineProperty(window, '__task5LookWorkerHarness', {
      configurable: true,
      value: harness,
    });
  });
};

export const getLookWorkerHarness = (page: Page) => page.evaluate(() => (
  (window as typeof window & {
    __task5LookWorkerHarness: { snapshot(): LookWorkerHarnessSnapshot };
  }).__task5LookWorkerHarness.snapshot()
));

export const enqueueLookWorkerRule = (page: Page, rule: LookWorkerRule) => page.evaluate((nextRule) => {
  (window as typeof window & {
    __task5LookWorkerHarness: { enqueue(value: LookWorkerRule): void };
  }).__task5LookWorkerHarness.enqueue(nextRule);
}, rule);

export const invokeLookWorkerHarness = (
  page: Page,
  command: 'delayNextImage' | 'failHeld' | 'releaseDelayedImage' | 'releaseHeld',
) => page.evaluate((nextCommand) => {
  const harness = (window as typeof window & {
    __task5LookWorkerHarness: Record<typeof nextCommand, () => void>;
  }).__task5LookWorkerHarness;
  harness[nextCommand]();
}, command);

export const installDeterministicLookSeeds = async (page: Page, initialSeed: number) => {
  await page.addInitScript(({ firstSeed }) => {
    const nativeGetRandomValues = crypto.getRandomValues.bind(crypto);
    let nextSeed = firstSeed >>> 0;
    Object.defineProperty(crypto, 'getRandomValues', {
      configurable: true,
      value: <T extends ArrayBufferView | null>(array: T): T => {
        if (array instanceof Uint32Array && array.length === 1) {
          array[0] = nextSeed;
          nextSeed = (nextSeed + 1) >>> 0;
          return array;
        }
        return nativeGetRandomValues(array);
      },
    });
  }, { firstSeed: initialSeed });
};

export const createPngFixture = async (page: Page, width: number, height: number): Promise<Buffer> => {
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

export const uploadFixture = async (page: Page, width: number, height: number, name: string) => {
  const buffer = await createPngFixture(page, width, height);
  await page.locator('input[type="file"][aria-label="Import artwork file"]').setInputFiles({
    name,
    mimeType: 'image/png',
    buffer,
  });
};

/**
 * Variation controls live inside a <details> disclosure labelled "Manage variation".
 * While it is closed its children are not rendered, so they are absent from the
 * accessibility tree entirely and no role-based locator can reach them.
 *
 * The <summary> itself does not expose as role=button, so it is clicked by label.
 * Idempotent: safe to call when the disclosure is already open.
 */
export const openVariationMenu = async (page: Page) => {
  const duplicate = page.getByRole('button', { name: 'Duplicate variation', exact: true });
  if (await duplicate.isVisible().catch(() => false)) return;
  await page.locator('summary[aria-label="Manage variation"]').click();
  await duplicate.waitFor();
};

/**
 * The disclosure stays open until it is toggled again, and its popup is positioned over
 * the canvas area — where it covers the Compare Board header. So anything that opens it
 * must close it again, or a later click lands on this popup instead.
 */
export const closeVariationMenu = async (page: Page) => {
  // Close by toggling the native <details> rather than clicking the summary: a click
  // moves focus, and several tests assert focus immediately after an action that closes
  // this menu. The element is uncontrolled, so setting `open` is what the click does.
  await page.locator('summary[aria-label="Manage variation"]')
    .evaluate((el) => {
      const details = el.parentElement as HTMLDetailsElement | null;
      if (details?.open) details.open = false;
    })
    .catch(() => undefined);
};

export const duplicateVariation = async (page: Page) => {
  await openVariationMenu(page);
  await page.getByRole('button', { name: 'Duplicate variation', exact: true }).click();
  await closeVariationMenu(page);
};

export const deleteVariation = async (page: Page) => {
  await openVariationMenu(page);
  await page.getByRole('button', { name: 'Delete variation', exact: true }).click();
  await closeVariationMenu(page);
};

export const renameVariation = async (page: Page, name: string) => {
  await openVariationMenu(page);
  const input = page.getByLabel('Variation name');
  await input.fill(name);
  await input.press('Enter');
  await closeVariationMenu(page);
};

export const layerDrawer = (page: Page) =>
  page.locator('[role="dialog"][aria-labelledby="mobile-layers-title"]');

/**
 * Layer controls — `Add text`, `Add image`, and every `Select layer …` button — live in
 * the Layers drawer. There is no persistent layers panel, so the drawer has to be open
 * before any of them exist. Idempotent.
 */
export const openLayers = async (page: Page) => {
  if (await layerDrawer(page).count()) return;
  const button = page.getByRole('button', { name: 'Layers', exact: true });
  // On desktop the Layers button is hidden in Advanced (`md:hidden`), so the drawer is
  // only reachable from Basic. Drop back automatically rather than making every caller
  // sequence it; callers that need Advanced afterwards switch back themselves.
  if (!(await button.isVisible().catch(() => false))) {
    await page.getByRole('radio', { name: 'Basic', exact: true }).click();
    await button.waitFor();
  }
  await button.click();
  await layerDrawer(page).waitFor();
};

export const closeLayers = async (page: Page) => {
  if (!(await layerDrawer(page).count())) return;
  await page.getByRole('button', { name: 'Close layers', exact: true }).click();
  await layerDrawer(page).waitFor({ state: 'detached' });
};

/**
 * The Layers button is rendered on desktop in Basic mode only — Advanced hides it with
 * `md:hidden` — so a text layer has to be added before switching to Advanced.
 *
 * Adding one closes the drawer on its own: `addTextLayerFromPanel` calls
 * `closeMobileDrawer`. `closeLayers` is a no-op in that case and only matters if that
 * behaviour changes.
 */
export const addTextLayer = async (page: Page) => {
  await openLayers(page);
  await page.getByRole('button', { name: 'Add text', exact: true }).click();
  await closeLayers(page);
};

export const createTransparentPngFixture = async (
  page: Page,
  width: number,
  height: number,
): Promise<Buffer> => {
  const bytes = await page.evaluate(async ({ fixtureWidth, fixtureHeight }) => {
    const canvas = document.createElement('canvas');
    canvas.width = fixtureWidth;
    canvas.height = fixtureHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable.');

    context.clearRect(0, 0, fixtureWidth, fixtureHeight);
    const gradient = context.createLinearGradient(0, 0, fixtureWidth, fixtureHeight);
    gradient.addColorStop(0, '#0891b2');
    gradient.addColorStop(0.5, '#facc15');
    gradient.addColorStop(1, '#e11d48');
    context.fillStyle = gradient;
    context.beginPath();
    context.roundRect(
      fixtureWidth * 0.12,
      fixtureHeight * 0.14,
      fixtureWidth * 0.76,
      fixtureHeight * 0.7,
      Math.min(fixtureWidth, fixtureHeight) * 0.08,
    );
    context.fill();
    context.globalCompositeOperation = 'destination-out';
    context.beginPath();
    context.arc(
      fixtureWidth * 0.5,
      fixtureHeight * 0.49,
      Math.min(fixtureWidth, fixtureHeight) * 0.16,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.globalCompositeOperation = 'source-over';
    context.fillStyle = 'rgba(255,255,255,0.82)';
    context.fillRect(
      fixtureWidth * 0.22,
      fixtureHeight * 0.68,
      fixtureWidth * 0.56,
      fixtureHeight * 0.08,
    );

    const pixels = context.getImageData(0, 0, fixtureWidth, fixtureHeight).data;
    if (pixels[3] !== 0) throw new Error('Transparent fixture corner must remain transparent.');
    const paintedOffset = (
      Math.floor(fixtureHeight * 0.2) * fixtureWidth + Math.floor(fixtureWidth * 0.2)
    ) * 4;
    if (pixels[paintedOffset + 3] === 0) throw new Error('Transparent fixture must contain painted pixels.');

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error('Transparent PNG fixture failed.')),
        'image/png',
      );
    });
    return [...new Uint8Array(await blob.arrayBuffer())];
  }, { fixtureWidth: width, fixtureHeight: height });
  return Buffer.from(bytes);
};

export const uploadTransparentFixture = async (
  page: Page,
  width: number,
  height: number,
  name: string,
) => {
  const buffer = await createTransparentPngFixture(page, width, height);
  await page.locator('input[type="file"][aria-label="Import artwork file"]').setInputFiles({
    name,
    mimeType: 'image/png',
    buffer,
  });
};

export const uploadPickedColorsFixture = async (page: Page, name: string) => {
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 400;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable.');
    context.fillStyle = '#0000ff';
    context.fillRect(0, 0, 600, 400);
    context.fillStyle = '#ff0000';
    context.fillRect(120, 100, 120, 200);
    context.fillStyle = '#00ff00';
    context.fillRect(360, 100, 120, 200);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error('Picked color fixture failed.')),
      'image/png',
    ));
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  await page.locator('input[type="file"][aria-label="Import artwork file"]').setInputFiles({
    name,
    mimeType: 'image/png',
    buffer: Buffer.from(bytes),
  });
};

export const createPhase2CFixture = async (page: Page, size: number): Promise<Buffer> => {
  const bytes = await page.evaluate(async (fixtureSize) => {
    const canvas = document.createElement('canvas');
    canvas.width = fixtureSize;
    canvas.height = fixtureSize;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable.');

    context.fillStyle = '#e8dfd0';
    context.fillRect(0, 0, fixtureSize, fixtureSize);
    for (let x = 0; x < fixtureSize; x += 16) {
      context.fillStyle = x % 32 === 0 ? '#e5dccd' : '#ebe2d3';
      context.fillRect(x, 0, 16, 5);
    }

    context.fillStyle = '#164e63';
    context.fillRect(
      Math.round(fixtureSize * 0.2),
      Math.round(fixtureSize * 0.17),
      Math.round(fixtureSize * 0.6),
      Math.round(fixtureSize * 0.66),
    );
    context.fillRect(
      Math.round(fixtureSize * 0.16),
      Math.round(fixtureSize * 0.44),
      Math.round(fixtureSize * 0.68),
      Math.round(fixtureSize * 0.18),
    );
    context.fillStyle = '#e11d48';
    context.fillRect(
      Math.round(fixtureSize * 0.32),
      Math.round(fixtureSize * 0.29),
      Math.round(fixtureSize * 0.36),
      Math.round(fixtureSize * 0.42),
    );

    context.fillStyle = '#e8dfd0';
    context.fillRect(
      Math.round(fixtureSize * 0.47),
      Math.round(fixtureSize * 0.43),
      Math.round(fixtureSize * 0.06),
      Math.round(fixtureSize * 0.06),
    );

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error('Phase 2C fixture failed.')),
        'image/png',
      );
    });
    return [...new Uint8Array(await blob.arrayBuffer())];
  }, size);
  return Buffer.from(bytes);
};

export const uploadPhase2CFixture = async (page: Page, size: number, name: string) => {
  const buffer = await createPhase2CFixture(page, size);
  await page.locator('input[type="file"][aria-label="Import artwork file"]').setInputFiles({
    name,
    mimeType: 'image/png',
    buffer,
  });
};

export const uploadLayerFixture = async (page: Page, width: number, height: number, name: string) => {
  const buffer = await createPngFixture(page, width, height);
  await page.locator('input[type="file"][aria-label="Add layer image file"]').setInputFiles({
    name,
    mimeType: 'image/png',
    buffer,
  });
};

export const dropFixture = async (page: Page, width: number, height: number, name: string) => {
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

export const expectCanvasPainted = async (canvas: Locator) => {
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

export const expectCanvasNonblank = async (canvas: Locator) => {
  await expect.poll(async () => canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    const context = target.getContext('2d');
    if (!context || target.width === 0 || target.height === 0) return 0;
    const pixels = context.getImageData(0, 0, target.width, target.height).data;
    const colors = new Set<string>();
    const step = Math.max(4, Math.floor((target.width * target.height) / 400));
    for (let pixel = 0; pixel < pixels.length; pixel += step * 4) {
      colors.add(`${pixels[pixel]}:${pixels[pixel + 1]}:${pixels[pixel + 2]}:${pixels[pixel + 3]}`);
      if (colors.size >= 2) break;
    }
    return colors.size;
  })).toBeGreaterThanOrEqual(2);
};

export const readPersistedEditorState = async (page: Page, projectName: string) => page.evaluate((name) => (
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

export const readPersistedLook = async (page: Page, projectName: string) => page.evaluate((name) => (
  new Promise<LookRecipeSnapshot | null>((resolve, reject) => {
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
        const look = variation?.looks?.[variation.looks.length - 1];
        resolve(look ? structuredClone(look) as LookRecipeSnapshot : null);
      };
    };
  })
), projectName);

export const readPersistedPhase2BProject = async (
  page: Page,
  projectName: string,
) => page.evaluate((name) => (
  new Promise<PersistedPhase2BProjectSnapshot | null>((resolve, reject) => {
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
        database.close();
        if (!project) {
          resolve(null);
          return;
        }
        const snapshot = structuredClone(project);
        snapshot.variations = snapshot.variations.map((variation: {
          looks: LookRecipeSnapshot[];
        }) => ({
          ...variation,
          look: variation.looks[variation.looks.length - 1] ?? { id: 'original', strength: 100 },
        }));
        resolve(snapshot as PersistedPhase2BProjectSnapshot);
      };
    };
  })
), projectName);

export interface PersistedProjectByteSnapshot {
  updatedAt: number;
  bytes: number[];
  variations: Array<{ name: string; lookId: string }>;
}

export const readPersistedProjectBytes = async (
  page: Page,
  projectName: string,
) => page.evaluate((name) => (
  new Promise<PersistedProjectByteSnapshot | null>((resolve, reject) => {
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
        database.close();
        resolve(project ? {
          updatedAt: project.updatedAt,
          bytes: [...new TextEncoder().encode(JSON.stringify(project))],
          variations: project.variations.map((variation: { name: string; looks: Array<{ id: string }> }) => ({
            name: variation.name,
            lookId: variation.looks[variation.looks.length - 1]?.id ?? 'original',
          })),
        } : null);
      };
    };
  })
), projectName);

export interface PersistedComposition {
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

export interface PersistedAssetSnapshot {
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

export interface PersistedWorkspaceSnapshot {
  projectId: string;
  composition: PersistedComposition;
  assets: PersistedAssetSnapshot[];
}

export interface PersistedPhase2CWorkspaceSnapshot {
  projectId: string;
  sourceAssetId: string;
  variation: {
    id: string;
    name: string;
    selectedLayerId: string;
    layers: Array<Record<string, any>>;
  };
  assets: Array<{
    id: string;
    role: 'prepared-image' | 'cleanup-corrections' | 'trace-svg' | null;
    mimeType: string;
    width: number;
    height: number;
    blobDigest: string;
    text: string | null;
    preparedSamples: {
      cornerAlpha: number;
      enclosedAlpha: number;
      foregroundAlpha: number;
    } | null;
  }>;
}

export const readPersistedComposition = async (page: Page, projectName: string) => page.evaluate((name) => (
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

export const readPersistedWorkspace = async (page: Page, projectName: string) => page.evaluate(async (name) => {
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

export const readPersistedPhase2CWorkspace = async (
  page: Page,
  projectName: string,
) => page.evaluate(async (name) => {
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
    .map(async (asset) => {
      const bytes = new Uint8Array(await asset.blob.arrayBuffer());
      const digestBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      let preparedSamples = null;
      if (asset.role === 'prepared-image') {
        const bitmap = await createImageBitmap(asset.blob);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Could not inspect prepared pixels.');
        context.drawImage(bitmap, 0, 0);
        const alphaAt = (x: number, y: number) =>
          context.getImageData(
            Math.max(0, Math.min(bitmap.width - 1, Math.round(x))),
            Math.max(0, Math.min(bitmap.height - 1, Math.round(y))),
            1,
            1,
          ).data[3];
        preparedSamples = {
          cornerAlpha: alphaAt(1, 1),
          enclosedAlpha: alphaAt(bitmap.width * 0.5, bitmap.height * 0.46),
          foregroundAlpha: alphaAt(bitmap.width * 0.5, bitmap.height * 0.65),
        };
        bitmap.close();
      }
      return {
        id: asset.id,
        role: asset.role ?? null,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
        blobDigest: [...digestBytes].map(
          (byte) => byte.toString(16).padStart(2, '0'),
        ).join(''),
        text: asset.role === 'cleanup-corrections' || asset.role === 'trace-svg'
          ? new TextDecoder().decode(bytes)
          : null,
        preparedSamples,
      };
    }));

  return {
    projectId: project.id,
    sourceAssetId: project.sourceAssetId,
    variation: structuredClone(variation),
    assets,
  } satisfies PersistedPhase2CWorkspaceSnapshot;
}, projectName);

export const readPreparedAlphaSamples = async (
  page: Page,
  projectName: string,
  points: Array<{ x: number; y: number }>,
) => page.evaluate(async ({ name, samples }) => {
  const records = await new Promise<{ projects: any[]; assets: any[] }>((resolve, reject) => {
    const request = indexedDB.open('inkmaster-studio');
    request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB.'));
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(['editor-projects', 'editor-assets']);
      const projects = transaction.objectStore('editor-projects').getAll();
      const assets = transaction.objectStore('editor-assets').getAll();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not read editor workspace.'));
      transaction.oncomplete = () => {
        database.close();
        resolve({ projects: projects.result, assets: assets.result });
      };
    };
  });
  const project = records.projects.find((candidate) => candidate.name === name);
  const variation = project?.variations.find(
    (candidate: { id: string }) => candidate.id === project.activeVariationId,
  );
  const image = variation?.layers.find((candidate: { type: string }) => candidate.type === 'image');
  const asset = records.assets.find(
    (candidate) => candidate.id === image?.backgroundRemoval?.preparedAssetId,
  );
  if (!asset?.blob) return null;
  const bitmap = await createImageBitmap(asset.blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Could not inspect prepared artwork.');
  context.drawImage(bitmap, 0, 0);
  const result = samples.map((point) => context.getImageData(
    Math.round(point.x * (bitmap.width - 1)),
    Math.round(point.y * (bitmap.height - 1)),
    1,
    1,
  ).data[3]);
  bitmap.close();
  return result;
}, { name: projectName, samples: points });

export const readPersistedPhase3AWorkspace = async (
  page: Page,
  projectName: string,
) => page.evaluate(async (name) => {
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
  const source = records.assets.find((candidate) => candidate.id === project?.sourceAssetId);
  if (!project || !source?.blob) return null;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await source.blob.arrayBuffer()));
  return {
    schemaVersion: project.schemaVersion,
    activeVariationId: project.activeVariationId,
    variations: project.variations.map((variation: {
      id: string;
      name: string;
      layers: Array<Record<string, unknown>>;
    }) => ({
      id: variation.id,
      name: variation.name,
      layers: structuredClone(variation.layers),
    })),
    productVariants: structuredClone(project.productVariants),
    sourceDigest: [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
  } satisfies PersistedPhase3AWorkspaceSnapshot;
}, projectName);

export const expectPersistedImageAssets = (
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

/**
 * Reads canvas pixels once the surface has stopped changing.
 *
 * Requires three consecutive identical samples with a gap between them: a Look render
 * arriving mid-capture can otherwise leave two adjacent reads equal while the surface is
 * still settling, which produces a reference frame nothing else ever matches.
 */
export const readSettledCanvasPixels = async (canvas: Locator) => {
  let settled = '';
  await expect.poll(async () => {
    const first = await readCanvasPixels(canvas);
    await canvas.page().waitForTimeout(120);
    const second = await readCanvasPixels(canvas);
    if (first !== second) return false;
    await canvas.page().waitForTimeout(120);
    if (second !== await readCanvasPixels(canvas)) return false;
    settled = second;
    return true;
  }, { timeout: 15000 }).toBe(true);
  return settled;
};

export const readCanvasPixels = (canvas: Locator) => canvas.evaluate((element) => {
  const target = element as HTMLCanvasElement;
  return target.toDataURL('image/png');
});

export const setLookRange = async (page: Page, label: string, value: number) => {
  const range = page.getByLabel(`${label} range`, { exact: true });
  await range.fill(String(value));
  await range.blur();
  await expect(range).toHaveValue(String(value));
};

export const setEditorRange = async (page: Page, label: string, value: number) => {
  const range = page.getByLabel(label, { exact: true });
  await expect(range).toBeEnabled();
  await range.fill(String(value));
  await range.blur();
  await expect(range).toHaveValue(String(value));
  await expect(range).toBeEnabled();
};

export const sourcePointOnCanvas = async (
  canvas: Locator,
  sourceX: number,
  sourceY: number,
) => {
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Canvas bounds are unavailable.');
  const edge = Math.min(bounds.width, bounds.height);
  const designLeft = bounds.x + (bounds.width - edge) / 2;
  const designTop = bounds.y + (bounds.height - edge) / 2;
  const fittedEdge = edge * 0.904;
  return {
    x: designLeft + edge * 0.048 + fittedEdge * sourceX,
    y: designTop + edge * 0.048 + fittedEdge * sourceY,
  };
};

export const canonicalDragValue = (
  origin: number,
  delta: number,
  canvas: { width: number; height: number },
) => Number((origin + delta / Math.min(canvas.width, canvas.height)).toFixed(6));

export const expectedCanonicalDragValue = (
  origin: number,
  delta: number,
  canvas: { width: number; height: number },
) => String(Number(canonicalDragValue(origin, delta, canvas).toFixed(2)));

export const setLookColor = async (page: Page, label: string, value: string) => {
  const input = page.getByLabel(label, { exact: true });
  await input.fill(value);
  await input.blur();
  await expect(input).toHaveValue(value);
};

export const renameActiveVariation = async (page: Page, name: string) => {
  await openVariationMenu(page);
  const input = page.getByLabel('Variation name');
  await input.fill(name);
  await input.press('Enter');
  await expect(input).toHaveValue(name);
  // Leave the disclosure closed: its popup overlays the canvas and swallows later clicks.
  await closeVariationMenu(page);
};

export const selectVariationAndReadCanvas = async (page: Page, name: string, expectedPng?: string) => {
  const canvas = page.getByLabel('Design canvas');
  const previousPng = await readCanvasPixels(canvas);
  await page.getByLabel('Variation', { exact: true }).selectOption({ label: name });
  await openVariationMenu(page);
  await expect(page.getByLabel('Variation name')).toHaveValue(name);
  if (expectedPng) {
    // Compare settled frames: the canvas repaints while the variation restores, so raw
    // samples can miss the stable result entirely.
    let settled = '';
    // 15s, matching readSettledCanvasPixels: restoring a variation re-runs the look
    // pipeline, which exceeds expect.poll's 5s default when the machine is loaded.
    await expect.poll(async () => {
      const first = await readCanvasPixels(canvas);
      if (first !== await readCanvasPixels(canvas)) return null;
      settled = first;
      return first;
    }, { timeout: 15000 }).toBe(expectedPng);
    await expectCanvasPainted(canvas);
    // Return the frame the poll actually matched, NOT a fresh read. Re-reading here
    // samples the canvas again, and a repaint between the poll passing and that read
    // returns a frame the poll never validated — which made the caller's
    // `'Distressed Press final' === 'Distressed Press'` assertion intermittently fail.
    return settled;
  } else {
    // "Different from the previous variation" alone can match a partially rendered
    // frame, which then reads as a duplicate of some other variation. Wait for the
    // canvas to settle: two consecutive identical reads that also differ from before.
    let settled: string | null = null;
    await expect.poll(async () => {
      const first = await readCanvasPixels(canvas);
      if (first === previousPng) return false;
      const second = await readCanvasPixels(canvas);
      if (first !== second) return false;
      settled = second;
      return true;
    }).toBe(true);
    await expectCanvasPainted(canvas);
    return settled!;
  }
};

export const verifyOrderedLookStackFlow = async (
  page: Page,
  viewport: { width: number; height: number },
  projectName: string,
) => {
  test.setTimeout(180_000);
  await page.setViewportSize(viewport);
  await page.goto('/editor');
  await uploadTransparentFixture(page, 4000, 4000, `${projectName}.png`);
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  await page.getByRole('button', { name: 'Looks', exact: true }).click();
  await page.getByRole('button', { name: 'Duotone', exact: true }).click();
  await page.getByRole('button', { name: 'Distressed Print', exact: true }).click();
  await setLookRange(page, 'Duotone strength', 64);
  await setLookRange(page, 'Distressed Print strength', 52);
  await page.getByRole('button', { name: 'Move Distressed Print earlier', exact: true }).click();

  const readLooks = async () => (await readPersistedPhase2BProject(page, projectName))
    ?.variations[0].looks.map(({ id, strength }) => ({ id, strength }));
  await expect.poll(readLooks).toEqual([
    { id: 'distressed-print', strength: 52 },
    { id: 'duotone', strength: 64 },
  ]);
  await page.keyboard.press('Control+z');
  await expect.poll(readLooks).toEqual([
    { id: 'duotone', strength: 64 },
    { id: 'distressed-print', strength: 52 },
  ]);
  await page.keyboard.press('Control+y');
  await expect.poll(readLooks).toEqual([
    { id: 'distressed-print', strength: 52 },
    { id: 'duotone', strength: 64 },
  ]);

  await page.reload();
  await page.getByRole('button', { name: 'Open local projects', exact: true }).click();
  await page.getByRole('dialog').getByRole('button').filter({ hasText: projectName }).click();
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  await page.getByRole('button', { name: 'Looks', exact: true }).click();
  await expect(page.getByLabel('Distressed Print strength range', { exact: true })).toHaveValue('52');
  await expect(page.getByLabel('Duotone strength range', { exact: true })).toHaveValue('64');
  await expect.poll(readLooks).toEqual([
    { id: 'distressed-print', strength: 52 },
    { id: 'duotone', strength: 64 },
  ]);

  await duplicateVariation(page);
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  const compare = page.getByRole('region', { name: 'Compare Board', exact: true });
  await expect(compare.locator('canvas[data-look-preview="true"]')).toHaveCount(2);
  await compare.getByRole('button', { name: 'Close Compare', exact: true }).click();

  await page.getByRole('button', { name: 'Product', exact: true }).click();
  await expectCanvasPainted(page.getByLabel('Product artwork', { exact: true }));
  await page.getByRole('button', { name: 'Create print-ready PNG', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Print-ready PNG', exact: true });
  await dialog.getByRole('radio', { name: /Draft Proof/ }).check();
  await dialog.getByRole('button', { name: 'Create PNG', exact: true }).click();
  await expect(dialog.getByText('Proof ready', { exact: true })).toBeVisible({ timeout: 150_000 });
  await dialog.getByRole('button', { name: 'Close export', exact: true }).click();
};
