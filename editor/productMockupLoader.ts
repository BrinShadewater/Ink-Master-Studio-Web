import type { TShirtMockup } from './productCatalog';

export type ProductMockupLoadStatus = 'idle' | 'pending' | 'ready' | 'failed';

export interface ProductMockupLoadState {
  requestedMockup: TShirtMockup | null;
  displayedMockup: TShirtMockup | null;
  status: ProductMockupLoadStatus;
  error: string | null;
}

export interface ProductImageLoader {
  src: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
}

export interface ProductMockupLoadController {
  sync: (mockup: TShirtMockup | null) => void;
  retry: () => void;
  dispose: () => void;
}

export const createIdleProductMockupLoadState = (): ProductMockupLoadState => ({
  requestedMockup: null,
  displayedMockup: null,
  status: 'idle',
  error: null,
});

const sameMockup = (
  left: TShirtMockup | null,
  right: TShirtMockup | null,
) => left?.slug === right?.slug && left?.file === right?.file;

export const createProductMockupLoadController = (
  createImage: () => ProductImageLoader,
  publish: (state: ProductMockupLoadState) => void,
): ProductMockupLoadController => {
  let state = createIdleProductMockupLoadState();
  let activeImage: ProductImageLoader | null = null;
  let generation = 0;
  let disposed = false;

  const clearActiveImage = () => {
    if (!activeImage) return;
    activeImage.onload = null;
    activeImage.onerror = null;
    activeImage = null;
  };

  const publishState = (next: ProductMockupLoadState) => {
    if (disposed) return;
    state = next;
    publish({ ...next });
  };

  const fail = (
    requestedMockup: TShirtMockup,
    displayedMockup: TShirtMockup | null,
  ) => {
    publishState({
      requestedMockup,
      displayedMockup,
      status: 'failed',
      error: `${requestedMockup.name} shirt preview is unavailable.`,
    });
  };

  const start = (mockup: TShirtMockup) => {
    generation += 1;
    const authority = generation;
    clearActiveImage();
    const displayedMockup = state.displayedMockup;
    publishState({
      requestedMockup: mockup,
      displayedMockup,
      status: 'pending',
      error: null,
    });

    let image: ProductImageLoader;
    try {
      image = createImage();
    } catch {
      fail(mockup, displayedMockup);
      return;
    }
    activeImage = image;
    image.onload = () => {
      if (disposed || authority !== generation) return;
      clearActiveImage();
      publishState({
        requestedMockup: mockup,
        displayedMockup: mockup,
        status: 'ready',
        error: null,
      });
    };
    image.onerror = () => {
      if (disposed || authority !== generation) return;
      clearActiveImage();
      fail(mockup, displayedMockup);
    };
    try {
      image.src = mockup.file;
    } catch {
      if (authority !== generation) return;
      clearActiveImage();
      fail(mockup, displayedMockup);
    }
  };

  return {
    sync: (mockup) => {
      if (disposed) return;
      if (!mockup) {
        generation += 1;
        clearActiveImage();
        publishState(createIdleProductMockupLoadState());
        return;
      }
      if (sameMockup(state.requestedMockup, mockup)) return;
      start(mockup);
    },
    retry: () => {
      if (disposed || !state.requestedMockup) return;
      start(state.requestedMockup);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      generation += 1;
      clearActiveImage();
    },
  };
};
