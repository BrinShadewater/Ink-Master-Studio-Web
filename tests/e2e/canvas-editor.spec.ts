import { expect, type Locator, type Page, test } from '@playwright/test';
import path from 'node:path';

const artifactPath = (name: string) => path.join(process.cwd(), 'test-results', 'task-7', name);
const phase2aArtifactPath = (name: string) => path.join(process.cwd(), 'test-results', 'phase-2a', name);
const phase2bArtifactPath = (name: string) => path.join(process.cwd(), 'test-results', 'phase-2b', name);

type LookRecipeSnapshot = Record<string, string | number>;

interface PersistedPhase2BProjectSnapshot {
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
  }>;
  productVariants: unknown[];
}

interface LookWorkerHarnessSnapshot {
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
  }>;
}

interface LookWorkerRule {
  action: 'fail' | 'hold';
  lookId: string;
  minimumDimension: number;
  maximumDimension?: number;
}

const installLookWorkerHarness = async (page: Page) => {
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
        const look = record.look;
        if (!look || typeof look !== 'object' || typeof record.renderKey !== 'string') {
          this.nativeWorker.postMessage(message, transfer);
          return;
        }
        const recipe = JSON.parse(JSON.stringify(look)) as LookRecipeSnapshot;
        const maxDimension = Math.max(Number(record.width) || 0, Number(record.height) || 0);
        requests.push({
          requestId: Number(record.requestId),
          renderKey: record.renderKey,
          maxDimension,
          look: recipe,
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

const getLookWorkerHarness = (page: Page) => page.evaluate(() => (
  (window as typeof window & {
    __task5LookWorkerHarness: { snapshot(): LookWorkerHarnessSnapshot };
  }).__task5LookWorkerHarness.snapshot()
));

const enqueueLookWorkerRule = (page: Page, rule: LookWorkerRule) => page.evaluate((nextRule) => {
  (window as typeof window & {
    __task5LookWorkerHarness: { enqueue(value: LookWorkerRule): void };
  }).__task5LookWorkerHarness.enqueue(nextRule);
}, rule);

const invokeLookWorkerHarness = (
  page: Page,
  command: 'delayNextImage' | 'failHeld' | 'releaseDelayedImage' | 'releaseHeld',
) => page.evaluate((nextCommand) => {
  const harness = (window as typeof window & {
    __task5LookWorkerHarness: Record<typeof nextCommand, () => void>;
  }).__task5LookWorkerHarness;
  harness[nextCommand]();
}, command);

const installDeterministicLookSeeds = async (page: Page, initialSeed: number) => {
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

const createTransparentPngFixture = async (
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

const uploadTransparentFixture = async (
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

const readPersistedLook = async (page: Page, projectName: string) => page.evaluate((name) => (
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
        resolve(variation?.look ? structuredClone(variation.look) as LookRecipeSnapshot : null);
      };
    };
  })
), projectName);

const readPersistedPhase2BProject = async (
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
        resolve(project ? structuredClone(project) as PersistedPhase2BProjectSnapshot : null);
      };
    };
  })
), projectName);

interface PersistedProjectByteSnapshot {
  updatedAt: number;
  bytes: number[];
  variations: Array<{ name: string; lookId: string }>;
}

const readPersistedProjectBytes = async (
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
          variations: project.variations.map((variation: { name: string; look: { id: string } }) => ({
            name: variation.name,
            lookId: variation.look.id,
          })),
        } : null);
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

const setLookRange = async (page: Page, label: string, value: number) => {
  const range = page.getByLabel(`${label} range`, { exact: true });
  await range.fill(String(value));
  await range.blur();
  await expect(range).toHaveValue(String(value));
};

const setLookColor = async (page: Page, label: string, value: string) => {
  const input = page.getByLabel(label, { exact: true });
  await input.fill(value);
  await input.blur();
  await expect(input).toHaveValue(value);
};

const renameActiveVariation = async (page: Page, name: string) => {
  const input = page.getByLabel('Variation name');
  await input.fill(name);
  await input.press('Enter');
  await expect(input).toHaveValue(name);
};

const selectVariationAndReadCanvas = async (page: Page, name: string) => {
  const canvas = page.getByLabel('Design canvas');
  const previousPng = await readCanvasPixels(canvas);
  await page.getByLabel('Variation', { exact: true }).selectOption({ label: name });
  await expect(page.getByLabel('Variation name')).toHaveValue(name);
  await expect.poll(() => readCanvasPixels(canvas)).not.toBe(previousPng);
  await expectCanvasPainted(canvas);
  return readCanvasPixels(canvas);
};

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

test('@task5-review applies the exact seeded thumbnail recipe that was previewed', async ({ page }) => {
  await installLookWorkerHarness(page);
  await page.setViewportSize({ width: 1200, height: 844 });
  await page.goto('/');
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
  await page.goto('/');
  await uploadFixture(page, 960, 720, 'look-control-history.png');
  await page.getByRole('button', { name: 'Looks', exact: true }).click();
  await page.getByRole('button', { name: 'Duotone', exact: true }).click();
  await page.getByText('More', { exact: true }).click();

  await page.getByLabel('Strength range', { exact: true }).fill('64');
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
  await expect(page.getByLabel('Strength range', { exact: true })).toHaveValue('64');
  await undo.click();
  await expect(page.getByLabel('Strength range', { exact: true })).toHaveValue('100');

  const highlightColor = page.getByLabel('Highlight color', { exact: true });
  await highlightColor.evaluate((input) => {
    const colorInput = input as HTMLInputElement;
    colorInput.value = '#123456';
    colorInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
  });
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('button', { name: 'Looks', exact: true }).click();
  await page.getByText('More', { exact: true }).click();
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
  await page.goto('/');
  await uploadFixture(page, 960, 720, 'look-failure-authority.png');
  const canvas = page.getByLabel('Design canvas');
  await expectCanvasPainted(canvas);
  const originalCanvas = await readCanvasPixels(canvas);
  await page.getByRole('button', { name: 'Looks', exact: true }).click();
  await page.getByRole('button', { name: 'Monochrome', exact: true }).click();
  await expect.poll(() => readCanvasPixels(canvas)).not.toBe(originalCanvas);
  const lastReadyCanvas = await readCanvasPixels(canvas);

  await enqueueLookWorkerRule(page, { action: 'hold', lookId: 'monochrome', minimumDimension: 241 });
  await page.getByLabel('Strength range', { exact: true }).fill('80');
  await expect.poll(async () => (await getLookWorkerHarness(page)).held).toBe(1);
  await expect.poll(() => readCanvasPixels(canvas)).toBe(lastReadyCanvas);
  await invokeLookWorkerHarness(page, 'failHeld');
  await expect(page.getByText('Look preview failed.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry Look preview' })).toBeVisible();
  await expect.poll(() => readCanvasPixels(canvas)).toBe(lastReadyCanvas);

  const recipeBeforeRetry = await readPersistedLook(page, 'look-failure-authority');
  await page.getByRole('button', { name: 'Retry Look preview' }).click();
  await expect(page.getByText('Look preview failed.', { exact: true })).toHaveCount(0);
  await expect.poll(() => readCanvasPixels(canvas)).not.toBe(lastReadyCanvas);
  await expect.poll(() => readPersistedLook(page, 'look-failure-authority')).toEqual(recipeBeforeRetry);

  await enqueueLookWorkerRule(page, { action: 'fail', lookId: 'monochrome', minimumDimension: 241 });
  await page.getByLabel('Strength range', { exact: true }).fill('70');
  await expect(page.getByText('Look preview failed.', { exact: true })).toBeVisible();

  await enqueueLookWorkerRule(page, { action: 'hold', lookId: 'monochrome', minimumDimension: 241 });
  await page.getByLabel('Strength range', { exact: true }).fill('60');
  await expect(page.getByText('Look preview failed.', { exact: true })).toHaveCount(0);
  await expect.poll(async () => (await getLookWorkerHarness(page)).held).toBe(1);
  await page.getByLabel('Strength range', { exact: true }).fill('50');
  await expect.poll(async () => {
    const requests = (await getLookWorkerHarness(page)).requests;
    return requests.some(({ look, maxDimension }) => look.strength === 50 && maxDimension > 240);
  }).toBe(true);
  await invokeLookWorkerHarness(page, 'failHeld');
  await page.waitForTimeout(100);
  await expect(page.getByText('Look preview failed.', { exact: true })).toHaveCount(0);

  await enqueueLookWorkerRule(page, { action: 'fail', lookId: 'monochrome', minimumDimension: 241 });
  await page.getByLabel('Strength range', { exact: true }).fill('40');
  await expect(page.getByText('Look preview failed.', { exact: true })).toBeVisible();
  await invokeLookWorkerHarness(page, 'delayNextImage');
  await uploadFixture(page, 800, 1000, 'look-composition-unavailable.png');
  await expect(page.getByLabel('Project name')).toHaveValue('look-composition-unavailable');
  await expect.poll(async () => (await getLookWorkerHarness(page)).delayedImages).toBe(1);
  await expect(page.getByText('Look preview failed.', { exact: true })).toHaveCount(0);
  await invokeLookWorkerHarness(page, 'releaseDelayedImage');
  await expectCanvasPainted(canvas);
});

test('@task5-review disposes the browser worker and pending surfaces on navigation', async ({ page }) => {
  await installLookWorkerHarness(page);
  await page.setViewportSize({ width: 1200, height: 844 });
  await page.goto('/');
  await uploadFixture(page, 960, 720, 'look-worker-cleanup.png');
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
  await page.getByRole('button', { name: 'Monochrome', exact: true }).click();
  await enqueueLookWorkerRule(page, { action: 'hold', lookId: 'monochrome', minimumDimension: 241 });
  await page.getByLabel('Strength range', { exact: true }).fill('75');
  await expect.poll(async () => (await getLookWorkerHarness(page)).held).toBe(1);
  await expect.poll(async () => (await getLookWorkerHarness(page)).active).toBe(1);

  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible();
  const afterNavigation = await getLookWorkerHarness(page);
  expect(afterNavigation.active).toBe(0);
  expect(afterNavigation.terminated).toBe(afterNavigation.created);
  expect(afterNavigation.held).toBe(0);
});

test('@task5-review preserves direct canvas drag geometry with a processed Look', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('/');
  await uploadFixture(page, 1600, 900, 'look-active-drag.png');
  const canvas = page.getByLabel('Design canvas');
  await expectCanvasPainted(canvas);
  const originalCanvas = await readCanvasPixels(canvas);
  await page.getByRole('button', { name: 'Looks', exact: true }).click();
  await page.getByRole('button', { name: 'High Contrast', exact: true }).click();
  await expect.poll(() => readCanvasPixels(canvas)).not.toBe(originalCanvas);
  await page.getByRole('button', { name: 'Select', exact: true }).click();

  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounds are unavailable.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4);
  await page.mouse.up();
  await expect(page.getByLabel('X position')).toHaveValue('0.6');
  await expect(page.getByLabel('Y position')).toHaveValue('0.4');
});

test('compares Looks across variations', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 844 });
  await page.goto('/');
  await uploadFixture(page, 960, 720, 'compare-looks.png');
  await expectCanvasPainted(page.getByLabel('Design canvas'));

  const variationName = page.getByLabel('Variation name');
  await variationName.fill('Contrast');
  await variationName.press('Enter');
  await page.getByRole('button', { name: 'Looks', exact: true }).click();
  await page.getByRole('button', { name: 'High Contrast', exact: true }).click();

  await page.getByRole('button', { name: 'Duplicate variation' }).click();
  await variationName.fill('Mono');
  await variationName.press('Enter');
  await page.getByRole('button', { name: 'Monochrome', exact: true }).click();

  await page.getByRole('button', { name: 'Duplicate variation' }).click();
  await variationName.fill('Duotone');
  await variationName.press('Enter');
  await page.getByRole('button', { name: 'Duotone', exact: true }).click();

  await expect.poll(async () => (await readPersistedProjectBytes(page, 'compare-looks'))?.variations)
    .toEqual([
      { name: 'Contrast', lookId: 'high-contrast' },
      { name: 'Mono', lookId: 'monochrome' },
      { name: 'Duotone', lookId: 'duotone' },
    ]);
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
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
  await board.getByText('Variations', { exact: true }).click();
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
  await expect(page.getByLabel('Variation name')).toHaveValue('Mono');
  await expectCanvasPainted(page.getByLabel('Design canvas'));
  await expect(selectCommand).toHaveAttribute('aria-pressed', 'true');
  await expect(looksCommand).toHaveAttribute('aria-pressed', 'false');
  await expect(compareCommand).toBeFocused();
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
  await page.goto('/');
  await uploadFixture(page, 960, 720, 'compare-auto-exit.png');
  await expectCanvasPainted(page.getByLabel('Design canvas'));

  await page.getByRole('button', { name: 'Add text', exact: true }).click();
  await page.getByRole('button', { name: 'Duplicate variation', exact: true }).click();
  await page.getByRole('button', { name: 'Select layer compare-auto-exit.png' }).click();

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
  await page.getByRole('button', { name: 'Delete variation', exact: true }).click();

  await expect(board).toHaveCount(0);
  await expect(compareCommand).toBeDisabled();
  await expect(selectCommand).toBeEnabled();
  await expect(selectCommand).toHaveAttribute('aria-pressed', 'true');
  await expect(selectCommand).toBeFocused();
});

test('@phase2b-acceptance persists exact desktop Looks, pixels, and seeded undo', async ({ page }) => {
  test.setTimeout(120_000);
  const projectName = 'phase-2b-desktop';
  const initialSeed = 0x10203040;
  const distressedSeed = (initialSeed + 5) >>> 0;
  await installDeterministicLookSeeds(page, initialSeed);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const canvas = page.getByLabel('Design canvas');
  await uploadTransparentFixture(page, 1200, 900, `${projectName}.png`);
  await expectCanvasPainted(canvas);
  await page.getByRole('button', { name: 'Add text', exact: true }).click();
  await page.getByLabel('Content', { exact: true }).fill('INK / THREE WAYS');
  await page.getByLabel('Content', { exact: true }).blur();
  await page.getByLabel('Font', { exact: true }).selectOption('Impact');
  await page.getByLabel('Size', { exact: true }).fill('78');
  await page.getByLabel('Size', { exact: true }).press('Enter');
  await setLookColor(page, 'Fill color', '#f8fafc');

  await renameActiveVariation(page, 'Duotone Poster');
  await page.getByRole('button', { name: 'Looks', exact: true }).click();
  await page.getByRole('button', { name: 'Duotone', exact: true }).click();
  await setLookRange(page, 'Strength', 79);
  await page.getByText('More', { exact: true }).click();
  await setLookColor(page, 'Shadow color', '#172554');
  await setLookColor(page, 'Highlight color', '#fde047');
  const duotoneBeforeBalance = await readCanvasPixels(canvas);
  await setLookRange(page, 'Balance', -17);
  await expect.poll(() => readCanvasPixels(canvas)).not.toBe(duotoneBeforeBalance);

  await page.getByRole('button', { name: 'Duplicate variation' }).click();
  await renameActiveVariation(page, 'Halftone Screen');
  await page.getByRole('button', { name: 'Graphic Halftone', exact: true }).click();
  await setLookRange(page, 'Strength', 84);
  await page.getByText('More', { exact: true }).click();
  await setLookRange(page, 'Cell size', 14);
  await setLookRange(page, 'Angle', 32);
  await setLookColor(page, 'Foreground color', '#172554');
  await page.getByRole('button', { name: 'Solid background', exact: true }).click();
  const halftoneBeforeBackground = await readCanvasPixels(canvas);
  await setLookColor(page, 'Background color', '#fef3c7');
  await expect.poll(() => readCanvasPixels(canvas)).not.toBe(halftoneBeforeBackground);

  await page.getByRole('button', { name: 'Duplicate variation' }).click();
  await renameActiveVariation(page, 'Distressed Press');
  await page.getByRole('button', { name: 'Distressed Print', exact: true }).click();
  await setLookRange(page, 'Strength', 92);
  await page.getByText('More', { exact: true }).click();
  await setLookRange(page, 'Wear', 57);
  await setLookRange(page, 'Texture scale', 8);
  const distressedBeforeEdgeBreakup = await readCanvasPixels(canvas);
  await setLookRange(page, 'Edge breakup', 43);
  await expect.poll(() => readCanvasPixels(canvas)).not.toBe(distressedBeforeEdgeBreakup);

  await page.getByRole('button', { name: 'Select', exact: true }).click();
  const desktopPngs: Record<string, string> = {
    'Distressed Press': await readCanvasPixels(canvas),
    'Duotone Poster': await selectVariationAndReadCanvas(page, 'Duotone Poster'),
    'Halftone Screen': await selectVariationAndReadCanvas(page, 'Halftone Screen'),
    'Distressed Press final': await selectVariationAndReadCanvas(page, 'Distressed Press'),
  };
  expect(desktopPngs['Distressed Press final']).toBe(desktopPngs['Distressed Press']);
  expect(new Set([
    desktopPngs['Duotone Poster'],
    desktopPngs['Halftone Screen'],
    desktopPngs['Distressed Press'],
  ]).size).toBe(3);

  await expect(page.getByRole('status').filter({ hasText: 'Saved locally' })).toBeVisible();
  await expect.poll(async () => (await readPersistedPhase2BProject(page, projectName))?.variations.map(
    ({ name, look }) => ({ name, look }),
  )).toEqual([
    {
      name: 'Duotone Poster',
      look: {
        id: 'duotone', strength: 79, shadowColor: '#172554', highlightColor: '#fde047', balance: -17,
      },
    },
    {
      name: 'Halftone Screen',
      look: {
        id: 'graphic-halftone', strength: 84, cellSize: 14, angle: 32,
        foregroundColor: '#172554', background: 'solid', backgroundColor: '#fef3c7',
      },
    },
    {
      name: 'Distressed Press',
      look: {
        id: 'distressed-print', strength: 92, wear: 57, textureScale: 8,
        edgeBreakup: 43, seed: distressedSeed,
      },
    },
  ]);
  const projectBeforeReload = await readPersistedPhase2BProject(page, projectName);
  const projectBytesBeforeReload = await readPersistedProjectBytes(page, projectName);
  expect(projectBeforeReload).toMatchObject({
    schemaVersion: 3,
    name: projectName,
    sourceMetadata: { name: `${projectName}.png`, mimeType: 'image/png', width: 1200, height: 900 },
    productVariants: [],
  });
  expect(projectBeforeReload?.variations.every(({ layers }) => (
    layers.length === 2 && layers.some(({ type }) => type === 'image') && layers.some(({ type }) => type === 'text')
  ))).toBe(true);

  await page.reload();
  await page.getByRole('button', { name: 'Open local projects' }).click();
  await page.getByRole('dialog').getByRole('button').filter({ hasText: projectName }).click();
  await expect(page.getByLabel('Project name')).toHaveValue(projectName);
  await expect.poll(() => readPersistedPhase2BProject(page, projectName)).toEqual(projectBeforeReload);
  await expect.poll(() => readPersistedProjectBytes(page, projectName)).toEqual(projectBytesBeforeReload);
  await expect.poll(() => readCanvasPixels(canvas)).toBe(desktopPngs['Distressed Press']);

  expect(await selectVariationAndReadCanvas(page, 'Duotone Poster')).toBe(desktopPngs['Duotone Poster']);
  expect(await selectVariationAndReadCanvas(page, 'Halftone Screen')).toBe(desktopPngs['Halftone Screen']);
  expect(await selectVariationAndReadCanvas(page, 'Distressed Press')).toBe(desktopPngs['Distressed Press']);

  await page.getByRole('button', { name: 'Looks', exact: true }).click();
  const recipeBeforeReroll = (await readPersistedPhase2BProject(page, projectName))?.variations
    .find(({ name }) => name === 'Distressed Press')?.look;
  expect(recipeBeforeReroll).toEqual({
    id: 'distressed-print', strength: 92, wear: 57, textureScale: 8,
    edgeBreakup: 43, seed: distressedSeed,
  });
  const pngBeforeReroll = await readCanvasPixels(canvas);
  await page.getByRole('button', { name: 'Reroll texture', exact: true }).click();
  await expect.poll(() => readCanvasPixels(canvas)).not.toBe(pngBeforeReroll);
  await expect.poll(async () => (await readPersistedPhase2BProject(page, projectName))?.variations
    .find(({ name }) => name === 'Distressed Press')?.look.seed).not.toBe(distressedSeed);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => readCanvasPixels(canvas)).toBe(pngBeforeReroll);
  await expect.poll(async () => (await readPersistedPhase2BProject(page, projectName))?.variations
    .find(({ name }) => name === 'Distressed Press')?.look).toEqual(recipeBeforeReroll);

  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  const board = page.getByRole('region', { name: 'Compare Board' });
  await expect(board).toBeVisible();
  await board.getByText('Variations', { exact: true }).click();
  await board.getByRole('checkbox', { name: 'Duotone Poster', exact: true }).check();
  await board.getByText('Variations', { exact: true }).click();
  const previews = board.locator('canvas[data-look-preview="true"]');
  await expect(previews).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) await expectCanvasPainted(previews.nth(index));
  const previewPngs = await previews.evaluateAll((canvases) => (
    canvases.map((preview) => (preview as HTMLCanvasElement).toDataURL('image/png'))
  ));
  expect(new Set(previewPngs).size).toBe(3);
  const previewBounds = await previews.evaluateAll((canvases) => canvases.map((preview) => {
    const bounds = preview.getBoundingClientRect();
    return { width: Math.round(bounds.width), height: Math.round(bounds.height) };
  }));
  expect(new Set(previewBounds.map(({ width }) => width)).size).toBe(1);
  expect(new Set(previewBounds.map(({ height }) => height)).size).toBe(1);
  await page.screenshot({
    path: phase2bArtifactPath('desktop-looks-compare-1440x900.png'),
    animations: 'disabled',
  });
});

test('@phase2b-acceptance keeps mobile Looks and Compare bounded and persistent', async ({ page }) => {
  test.setTimeout(120_000);
  const projectName = 'phase-2b-mobile';
  const initialSeed = 0x22000000;
  const rerolledSeed = (initialSeed + 2) >>> 0;
  await installDeterministicLookSeeds(page, initialSeed);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await uploadTransparentFixture(page, 720, 960, `${projectName}.png`);
  const canvas = page.getByLabel('Design canvas');
  await expectCanvasPainted(canvas);
  await renameActiveVariation(page, 'Vintage Study');

  await page.getByRole('button', { name: 'Looks', exact: true }).click();
  await page.getByRole('button', { name: 'Vintage Ink', exact: true }).click();
  await setLookRange(page, 'Strength', 73);
  await page.getByText('More', { exact: true }).click();
  const beforeGrain = await readCanvasPixels(canvas);
  await setLookRange(page, 'Grain', 61);
  await expect.poll(() => readCanvasPixels(canvas)).not.toBe(beforeGrain);
  const beforeReroll = await readCanvasPixels(canvas);
  await page.getByRole('button', { name: 'Reroll texture', exact: true }).click();
  await expect.poll(() => readCanvasPixels(canvas)).not.toBe(beforeReroll);

  const expectedVintageLook = {
    id: 'vintage-ink', strength: 73, warmth: 45, fade: 25, grain: 61, seed: rerolledSeed,
  };
  await expect.poll(async () => (await readPersistedPhase2BProject(page, projectName))?.variations[0].look)
    .toEqual(expectedVintageLook);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('button', { name: 'Looks', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Vintage Ink', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Strength range', { exact: true })).toHaveValue('73');
  await page.getByText('More', { exact: true }).click();
  await expect(page.getByLabel('Grain range', { exact: true })).toHaveValue('61');

  const editorLayout = await page.evaluate(() => {
    const bounds = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
        width: rect.width, height: rect.height,
      };
    };
    const designCanvas = document.querySelector('canvas[aria-label="Design canvas"]');
    const inspector = document.querySelector('aside[aria-label="Inspector"]');
    const toolbar = document.querySelector('nav[aria-label="Editor tools"]');
    if (!designCanvas || !inspector || !toolbar) throw new Error('Expected the complete mobile editor layout.');
    return {
      viewport: { width: innerWidth, height: innerHeight },
      documentOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      canvas: bounds(designCanvas),
      inspector: bounds(inspector),
      toolbar: bounds(toolbar),
    };
  });
  const assertContained = (
    rect: { top: number; bottom: number; left: number; right: number; width: number; height: number },
    viewport: { width: number; height: number },
    name: string,
  ) => {
    expect(rect.width, `${name} width`).toBeGreaterThan(0);
    expect(rect.height, `${name} height`).toBeGreaterThan(0);
    expect(rect.left, `${name} left edge`).toBeGreaterThanOrEqual(0);
    expect(rect.top, `${name} top edge`).toBeGreaterThanOrEqual(0);
    expect(rect.right, `${name} right edge`).toBeLessThanOrEqual(viewport.width);
    expect(rect.bottom, `${name} bottom edge`).toBeLessThanOrEqual(viewport.height);
  };
  expect(editorLayout.documentOverflows).toBe(false);
  assertContained(editorLayout.canvas, editorLayout.viewport, 'canvas');
  assertContained(editorLayout.inspector, editorLayout.viewport, 'inspector');
  assertContained(editorLayout.toolbar, editorLayout.viewport, 'toolbar');
  expect(editorLayout.canvas.bottom).toBeLessThanOrEqual(editorLayout.inspector.top + 1);
  expect(editorLayout.inspector.bottom).toBeLessThanOrEqual(editorLayout.toolbar.top + 1);

  await page.getByRole('button', { name: 'Duplicate variation' }).click();
  await renameActiveVariation(page, 'Dark Alternate');
  await page.getByRole('button', { name: 'High Contrast', exact: true }).click();
  await expect.poll(async () => (await readPersistedPhase2BProject(page, projectName))?.variations.map(
    ({ name, look }) => ({ name, look }),
  )).toEqual([
    { name: 'Vintage Study', look: expectedVintageLook },
    { name: 'Dark Alternate', look: { id: 'high-contrast', strength: 100, contrast: 55, blackPoint: 12, saturation: 5 } },
  ]);
  await expect(page.getByRole('status').filter({ hasText: 'Saved locally' })).toBeVisible();
  const projectBeforeCompare = await readPersistedPhase2BProject(page, projectName);
  const projectBytesBeforeCompare = await readPersistedProjectBytes(page, projectName);

  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  const board = page.getByRole('region', { name: 'Compare Board' });
  await expect(board).toBeVisible();
  await board.getByRole('button', { name: 'Dark background', exact: true }).click();
  await board.getByLabel('Compare zoom').fill('125');
  await expect(board.getByText('125%', { exact: true })).toBeVisible();
  const previews = board.locator('canvas[data-look-preview="true"]');
  await expect(previews).toHaveCount(2);
  for (let index = 0; index < 2; index += 1) {
    await expectCanvasPainted(previews.nth(index));
    await expect(previews.nth(index)).toHaveAccessibleName(/dark background/);
  }

  const compareLayout = await page.evaluate(() => {
    const bounds = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
        width: rect.width, height: rect.height,
      };
    };
    const compareBoard = document.querySelector('[aria-label="Compare Board"]');
    const header = compareBoard?.querySelector('header');
    const strip = document.querySelector('[data-compare-preview-strip="true"]');
    const toolbar = document.querySelector('nav[aria-label="Editor tools"]');
    const tiles = [...document.querySelectorAll('[data-compare-preview="true"]')];
    if (!compareBoard || !header || !(strip instanceof HTMLElement) || !toolbar || tiles.length !== 2) {
      throw new Error('Expected the complete mobile Compare layout.');
    }
    const controls = [
      { name: 'title', element: header.children[0] },
      { name: 'variations', element: header.querySelector('details > summary') },
      { name: 'background', element: header.querySelector('[aria-label="Artwork background"]') },
      { name: 'zoom', element: header.querySelector('input[aria-label="Compare zoom"]')?.closest('label') ?? null },
      { name: 'close', element: header.querySelector('button[aria-label="Close Compare"]') },
    ].filter((entry): entry is { name: string; element: Element } => Boolean(entry.element))
      .map(({ name, element }) => ({ name, ...bounds(element) }));
    const overlaps: string[] = [];
    for (let left = 0; left < controls.length; left += 1) {
      for (let right = left + 1; right < controls.length; right += 1) {
        const horizontal = Math.min(controls[left].right, controls[right].right) - Math.max(controls[left].left, controls[right].left);
        const vertical = Math.min(controls[left].bottom, controls[right].bottom) - Math.max(controls[left].top, controls[right].top);
        if (horizontal > 1 && vertical > 1) overlaps.push(`${controls[left].name}:${controls[right].name}`);
      }
    }
    return {
      viewport: { width: innerWidth, height: innerHeight },
      documentOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      board: bounds(compareBoard),
      header: bounds(header),
      strip: bounds(strip),
      toolbar: bounds(toolbar),
      controls,
      overlaps,
      tileSizes: tiles.map((tile) => bounds(tile)).map(({ width, height }) => ({ width, height })),
      stripScrollable: strip.scrollWidth > strip.clientWidth + 1,
      inspectorCount: document.querySelectorAll('aside[aria-label="Inspector"]').length,
      layerPanelCount: document.querySelectorAll('[aria-label="Layers panel"]').length,
    };
  });
  expect(compareLayout.documentOverflows).toBe(false);
  assertContained(compareLayout.board, compareLayout.viewport, 'Compare Board');
  assertContained(compareLayout.header, compareLayout.viewport, 'Compare header');
  assertContained(compareLayout.strip, compareLayout.viewport, 'preview strip');
  assertContained(compareLayout.toolbar, compareLayout.viewport, 'Compare toolbar');
  for (const control of compareLayout.controls) assertContained(control, compareLayout.viewport, control.name);
  expect(compareLayout.overlaps).toEqual([]);
  expect(compareLayout.header.bottom).toBeLessThanOrEqual(compareLayout.strip.top + 1);
  expect(compareLayout.strip.bottom).toBeLessThanOrEqual(compareLayout.toolbar.top + 1);
  expect(compareLayout.board.bottom).toBeLessThanOrEqual(compareLayout.toolbar.top + 1);
  expect(compareLayout.stripScrollable).toBe(true);
  expect(compareLayout.inspectorCount).toBe(0);
  expect(compareLayout.layerPanelCount).toBe(0);
  expect(new Set(compareLayout.tileSizes.map(({ width }) => Math.round(width))).size).toBe(1);
  expect(new Set(compareLayout.tileSizes.map(({ height }) => Math.round(height))).size).toBe(1);
  for (const size of compareLayout.tileSizes) {
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
  }

  const strip = board.locator('[data-compare-preview-strip="true"]');
  const toolbarBeforeScroll = compareLayout.toolbar;
  await strip.evaluate((element) => element.scrollTo({ left: element.scrollWidth, behavior: 'instant' }));
  await expect.poll(() => strip.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  const afterScroll = await page.evaluate(() => {
    const bounds = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
        width: rect.width, height: rect.height,
      };
    };
    const strip = document.querySelector('[data-compare-preview-strip="true"]');
    const toolbar = document.querySelector('nav[aria-label="Editor tools"]');
    const tiles = document.querySelectorAll('[data-compare-preview="true"]');
    if (!strip || !toolbar || tiles.length !== 2) throw new Error('Mobile Compare strip is unavailable.');
    return { strip: bounds(strip), toolbar: bounds(toolbar), secondTile: bounds(tiles[1]) };
  });
  expect(afterScroll.secondTile.left).toBeGreaterThanOrEqual(afterScroll.strip.left - 1);
  expect(afterScroll.secondTile.right).toBeLessThanOrEqual(afterScroll.strip.right + 1);
  expect(afterScroll.toolbar).toEqual(toolbarBeforeScroll);
  await expect.poll(() => readPersistedPhase2BProject(page, projectName)).toEqual(projectBeforeCompare);
  await expect.poll(() => readPersistedProjectBytes(page, projectName)).toEqual(projectBytesBeforeCompare);

  await page.screenshot({
    path: phase2bArtifactPath('mobile-looks-compare-390x844.png'),
    animations: 'disabled',
  });
  await board.getByRole('button', { name: 'Edit Dark Alternate', exact: true }).click();
  await expect(board).toHaveCount(0);
  await expect(page.getByLabel('Variation name')).toHaveValue('Dark Alternate');
  await expectCanvasPainted(page.getByLabel('Design canvas'));
  await expect.poll(() => readPersistedPhase2BProject(page, projectName)).toEqual(projectBeforeCompare);
});

test('@phase2b-acceptance rejects stale worker failure and retries the current recipe', async ({ page }) => {
  test.setTimeout(120_000);
  const projectName = 'phase-2b-worker-authority';
  await installLookWorkerHarness(page);
  await page.setViewportSize({ width: 1200, height: 844 });
  await page.goto('/');
  await uploadTransparentFixture(page, 960, 720, `${projectName}.png`);
  const canvas = page.getByLabel('Design canvas');
  await expectCanvasPainted(canvas);
  const originalPng = await readCanvasPixels(canvas);
  await page.getByRole('button', { name: 'Looks', exact: true }).click();
  await page.getByRole('button', { name: 'Monochrome', exact: true }).click();
  await expect.poll(() => readCanvasPixels(canvas)).not.toBe(originalPng);
  const firstReadyPng = await readCanvasPixels(canvas);

  await enqueueLookWorkerRule(page, { action: 'hold', lookId: 'monochrome', minimumDimension: 241 });
  await setLookRange(page, 'Strength', 82);
  await expect.poll(async () => (await getLookWorkerHarness(page)).held).toBe(1);
  await setLookRange(page, 'Strength', 63);
  await expect.poll(async () => (await getLookWorkerHarness(page)).requests.some(
    ({ look, maxDimension }) => look.id === 'monochrome' && look.strength === 63 && maxDimension > 240,
  )).toBe(true);
  await expect.poll(() => readCanvasPixels(canvas)).not.toBe(firstReadyPng);
  const newerReadyPng = await readCanvasPixels(canvas);
  await invokeLookWorkerHarness(page, 'failHeld');
  await page.waitForTimeout(100);
  await expect(page.getByText('Look preview failed.', { exact: true })).toHaveCount(0);
  await expect.poll(() => readCanvasPixels(canvas)).toBe(newerReadyPng);

  await enqueueLookWorkerRule(page, { action: 'fail', lookId: 'monochrome', minimumDimension: 241 });
  await setLookRange(page, 'Strength', 47);
  await expect(page.getByText('Look preview failed.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry Look preview', exact: true })).toBeVisible();
  await expect.poll(() => readCanvasPixels(canvas)).toBe(newerReadyPng);
  const expectedRecipe = { id: 'monochrome', strength: 47, contrast: 20, brightness: 0 };
  await expect.poll(() => readPersistedLook(page, projectName)).toEqual(expectedRecipe);
  await expect(page.getByRole('status').filter({ hasText: 'Saved locally' })).toBeVisible();
  const projectBeforeRetry = await readPersistedPhase2BProject(page, projectName);
  const projectBytesBeforeRetry = await readPersistedProjectBytes(page, projectName);

  await page.getByRole('button', { name: 'Retry Look preview', exact: true }).click();
  await expect(page.getByText('Look preview failed.', { exact: true })).toHaveCount(0);
  await expect.poll(() => readCanvasPixels(canvas)).not.toBe(newerReadyPng);
  await expect.poll(() => readPersistedLook(page, projectName)).toEqual(expectedRecipe);
  await expect.poll(() => readPersistedPhase2BProject(page, projectName)).toEqual(projectBeforeRetry);
  await expect.poll(() => readPersistedProjectBytes(page, projectName)).toEqual(projectBytesBeforeRetry);
});
