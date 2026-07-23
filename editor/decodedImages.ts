import { useEffect, useMemo, useRef, useState } from 'react';

interface DecodeEntry {
  active: boolean;
  image: HTMLImageElement;
  loaded: boolean;
  url: string;
}

export interface DecodedImageEntry {
  url: string;
  image: CanvasImageSource;
}

export interface DecodedImageController {
  sync: (assetUrlsById: Record<string, string>) => void;
  dispose: () => void;
}

export const createDecodedImageController = (
  createImage: () => HTMLImageElement,
  publish: (imagesById: Record<string, DecodedImageEntry>) => void,
): DecodedImageController => {
  const entriesByUrl = new Map<string, DecodeEntry>();
  let currentUrlsById: Record<string, string> = {};
  let disposed = false;

  const publishCurrent = () => {
    if (disposed) return;
    const imagesById: Record<string, DecodedImageEntry> = {};
    for (const [assetId, url] of Object.entries(currentUrlsById)) {
      const entry = entriesByUrl.get(url);
      if (entry?.active && entry.loaded) imagesById[assetId] = { url, image: entry.image };
    }
    publish(imagesById);
  };

  const deactivate = (entry: DecodeEntry) => {
    entry.active = false;
    entry.image.onload = null;
    entry.image.onerror = null;
  };

  return {
    sync(nextUrlsById) {
      // A cleanup/setup lifecycle replay may reuse this controller instance.
      disposed = false;
      currentUrlsById = { ...nextUrlsById };
      const activeUrls = new Set(Object.values(currentUrlsById));
      for (const [url, entry] of entriesByUrl) {
        if (activeUrls.has(url)) continue;
        deactivate(entry);
        entriesByUrl.delete(url);
      }

      for (const url of activeUrls) {
        if (entriesByUrl.has(url)) continue;
        const image = createImage();
        const entry: DecodeEntry = { active: true, image, loaded: false, url };
        entriesByUrl.set(url, entry);
        image.onload = () => {
          if (disposed || !entry.active || entriesByUrl.get(url) !== entry) return;
          entry.loaded = true;
          publishCurrent();
        };
        image.onerror = () => {
          if (disposed || !entry.active || entriesByUrl.get(url) !== entry) return;
          entry.loaded = false;
          publishCurrent();
        };
        image.src = url;
      }
      publishCurrent();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of entriesByUrl.values()) deactivate(entry);
      entriesByUrl.clear();
      currentUrlsById = {};
    },
  };
};

export const getCurrentDecodedImageEntries = (
  decodedImagesById: Record<string, DecodedImageEntry>,
  assetUrlsById: Record<string, string>,
): Record<string, DecodedImageEntry> => {
  const imagesById: Record<string, DecodedImageEntry> = {};
  for (const [assetId, url] of Object.entries(assetUrlsById)) {
    const decoded = decodedImagesById[assetId];
    if (decoded?.url === url) imagesById[assetId] = decoded;
  }
  return imagesById;
};

export const getCurrentDecodedImages = (
  decodedImagesById: Record<string, DecodedImageEntry>,
  assetUrlsById: Record<string, string>,
): Record<string, CanvasImageSource> => {
  const imagesById: Record<string, CanvasImageSource> = {};
  for (const [assetId, entry] of Object.entries(
    getCurrentDecodedImageEntries(decodedImagesById, assetUrlsById),
  )) {
    imagesById[assetId] = entry.image;
  }
  return imagesById;
};

export const getDecodedImageSources = (
  decodedImagesById: Record<string, DecodedImageEntry>,
): Record<string, CanvasImageSource> => {
  const imagesById: Record<string, CanvasImageSource> = {};
  for (const [assetId, entry] of Object.entries(decodedImagesById)) {
    imagesById[assetId] = entry.image;
  }
  return imagesById;
};

export const useDecodedEditorImages = (
  assetUrlsById: Record<string, string>,
): Record<string, DecodedImageEntry> => {
  const [decodedImagesById, setDecodedImagesById] = useState<Record<string, DecodedImageEntry>>({});
  const decoderRef = useRef<DecodedImageController | null>(null);
  if (!decoderRef.current) {
    decoderRef.current = createDecodedImageController(() => new Image(), setDecodedImagesById);
  }
  const decoder = decoderRef.current;

  useEffect(() => {
    decoder.sync(assetUrlsById);
  }, [assetUrlsById, decoder]);

  useEffect(() => () => decoder.dispose(), [decoder]);

  return useMemo(
    () => getCurrentDecodedImageEntries(decodedImagesById, assetUrlsById),
    [assetUrlsById, decodedImagesById],
  );
};
