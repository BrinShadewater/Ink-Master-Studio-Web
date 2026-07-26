import { getTShirtMockup } from './productCatalog';
import type { TShirtProductVariant } from './productModel';
import { getTShirtExportPreset, resolveTShirtExportGeometry, type TShirtExportPresetId } from './tshirtExportModel';

const loadLocalImage = (source: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Could not load proof image.'));
  image.src = source;
});

const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob> => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (blob) resolve(blob);
    else reject(new Error('Could not create proof mockup.'));
  }, 'image/png');
});

export const createProductProofMockup = async (
  product: TShirtProductVariant,
  printFileUrl: string,
  presetId: TShirtExportPresetId,
): Promise<{ blob: Blob; url: string }> => {
  const mockup = getTShirtMockup(product.mockupSlug);
  const [garment, printFile] = await Promise.all([
    loadLocalImage(mockup.file),
    loadLocalImage(printFileUrl),
  ]);
  const sourceWidth = garment.naturalWidth || garment.width;
  const sourceHeight = garment.naturalHeight || garment.height;
  const scale = Math.min(1, 1800 / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create proof mockup.');
  context.fillStyle = '#27313d';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = 'multiply';
  context.drawImage(garment, 0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = 'source-over';
  const region = mockup.printableRegion;
  const regionX = region.x * canvas.width;
  const regionY = region.y * canvas.height;
  const regionWidth = region.width * canvas.width;
  const regionHeight = region.height * canvas.height;
  const baseEdge = Math.min(regionWidth, regionHeight);
  const exportGeometry = resolveTShirtExportGeometry(
    getTShirtExportPreset(presetId),
    product.placement,
  );
  const sourceEdge = exportGeometry.renderedSide;
  const targetEdge = baseEdge * product.placement.scale;
  context.drawImage(
    printFile,
    exportGeometry.center.x - sourceEdge / 2,
    exportGeometry.center.y - sourceEdge / 2,
    sourceEdge,
    sourceEdge,
    regionX + product.placement.x * regionWidth - targetEdge / 2,
    regionY + product.placement.y * regionHeight - targetEdge / 2,
    targetEdge,
    targetEdge,
  );
  const blob = await canvasToBlob(canvas);
  return { blob, url: URL.createObjectURL(blob) };
};
