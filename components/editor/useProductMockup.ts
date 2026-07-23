import { useCallback, useEffect, useRef, useState } from 'react';
import type { TShirtMockup } from '../../editor/productCatalog';
import {
  createIdleProductMockupLoadState,
  createProductMockupLoadController,
  type ProductImageLoader,
  type ProductMockupLoadController,
  type ProductMockupLoadState,
} from '../../editor/productMockupLoader';

const createBrowserProductImageLoader = (): ProductImageLoader => {
  const image = new Image();
  let loadHandler: (() => void) | null = null;
  let errorHandler: (() => void) | null = null;
  image.onload = () => loadHandler?.();
  image.onerror = () => errorHandler?.();
  return {
    get src() {
      return image.src;
    },
    set src(value: string) {
      image.src = value;
    },
    get onload() {
      return loadHandler;
    },
    set onload(value: (() => void) | null) {
      loadHandler = value;
    },
    get onerror() {
      return errorHandler;
    },
    set onerror(value: (() => void) | null) {
      errorHandler = value;
    },
  };
};

export interface ProductMockupHookState extends ProductMockupLoadState {
  retry: () => void;
}

export const useProductMockup = (
  mockup: TShirtMockup | null,
): ProductMockupHookState => {
  const [state, setState] = useState<ProductMockupLoadState>(
    createIdleProductMockupLoadState,
  );
  const controllerRef = useRef<ProductMockupLoadController | null>(null);

  useEffect(() => {
    const controller = createProductMockupLoadController(
      createBrowserProductImageLoader,
      setState,
    );
    controllerRef.current = controller;
    controller.sync(mockup);
    return () => {
      controllerRef.current = null;
      controller.dispose();
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.sync(mockup);
  }, [mockup]);

  const retry = useCallback(() => {
    controllerRef.current?.retry();
  }, []);

  return { ...state, retry };
};
