import { PrintifyProductPreset, ServiceSpec } from '../specs/printify';

export interface PngMetadata {
  width: number;
  height: number;
  colorType: number;
  colorLabel: 'RGB' | 'RGBA' | 'Grayscale' | 'Indexed' | 'Unknown';
  hasAlpha: boolean;
  pixelsPerMeter: [number, number] | null;
  dpi: [number, number] | null;
  byteLength: number;
}

export interface PrintFileValidationItem {
  id: 'dimensions' | 'dpi' | 'file-size' | 'color' | 'background';
  label: string;
  detail: string;
  state: 'pass' | 'warn' | 'fail';
}

export interface PrintFileReceipt {
  filename: string;
  productId: string;
  productLabel: string;
  downloadedAt: number;
  metadata: PngMetadata;
  items: PrintFileValidationItem[];
  readyForUpload: boolean;
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const colorLabelFor = (colorType: number): PngMetadata['colorLabel'] => {
  if (colorType === 2) return 'RGB';
  if (colorType === 6) return 'RGBA';
  if (colorType === 0 || colorType === 4) return 'Grayscale';
  if (colorType === 3) return 'Indexed';
  return 'Unknown';
};

const hasAlphaFor = (colorType: number) => colorType === 4 || colorType === 6;

const readAscii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.slice(start, start + length));

const readUint32 = (bytes: Uint8Array, offset: number) =>
  ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;

const formatBytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(bytes > 10 * 1024 * 1024 ? 0 : 1)} MB`;

export const parsePngMetadata = (bytes: Uint8Array): PngMetadata => {
  const validSignature = PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
  if (!validSignature) throw new Error('The downloaded file is not a PNG.');

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  let pixelsPerMeter: [number, number] | null = null;

  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = readAscii(bytes, offset + 4, 4);
    const dataStart = offset + 8;
    if (dataStart + length > bytes.length) break;

    if (type === 'IHDR') {
      width = readUint32(bytes, dataStart);
      height = readUint32(bytes, dataStart + 4);
      colorType = bytes[dataStart + 9];
    }

    if (type === 'pHYs' && length >= 9 && bytes[dataStart + 8] === 1) {
      pixelsPerMeter = [
        readUint32(bytes, dataStart),
        readUint32(bytes, dataStart + 4),
      ];
    }

    offset += length + 12;
    if (type === 'IEND') break;
  }

  if (!width || !height || colorType < 0) throw new Error('The PNG metadata could not be read.');

  return {
    width,
    height,
    colorType,
    colorLabel: colorLabelFor(colorType),
    hasAlpha: hasAlphaFor(colorType),
    pixelsPerMeter,
    dpi: pixelsPerMeter
      ? [Math.round(pixelsPerMeter[0] * 0.0254), Math.round(pixelsPerMeter[1] * 0.0254)]
      : null,
    byteLength: bytes.byteLength,
  };
};

export const validatePrintFile = async (
  blob: Blob,
  filename: string,
  product: PrintifyProductPreset,
  service: ServiceSpec,
): Promise<PrintFileReceipt> => {
  const metadata = parsePngMetadata(new Uint8Array(await blob.arrayBuffer()));
  const expectedWidth = product.px[0];
  const expectedHeight = product.px[1];
  const expectedDpi = product.dpi;
  const maxBytes = service.maxBytes.png;
  const colorState = metadata.colorLabel === 'RGB' || metadata.colorLabel === 'RGBA' ? 'pass' : 'fail';
  const dimensionsMatch = metadata.width === expectedWidth && metadata.height === expectedHeight;
  const dpiMatch = metadata.dpi?.[0] === expectedDpi && metadata.dpi?.[1] === expectedDpi;
  const underLimit = metadata.byteLength <= maxBytes;

  const items: PrintFileValidationItem[] = [
    {
      id: 'dimensions',
      label: dimensionsMatch ? 'Product size matches' : 'Product size changed',
      detail: `${metadata.width} x ${metadata.height}px downloaded; ${expectedWidth} x ${expectedHeight}px expected for ${product.shortLabel}.`,
      state: dimensionsMatch ? 'pass' : 'fail',
    },
    {
      id: 'dpi',
      label: dpiMatch ? `${expectedDpi} DPI metadata set` : 'DPI metadata needs attention',
      detail: metadata.dpi
        ? `${metadata.dpi[0]} x ${metadata.dpi[1]} DPI was written into the PNG.`
        : 'No DPI metadata was found in the PNG.',
      state: dpiMatch ? 'pass' : 'warn',
    },
    {
      id: 'file-size',
      label: underLimit ? 'Under Printify file limit' : 'Over Printify file limit',
      detail: `${formatBytes(metadata.byteLength)} downloaded; Printify PNG limit is ${formatBytes(maxBytes)}.`,
      state: underLimit ? 'pass' : 'fail',
    },
    {
      id: 'color',
      label: colorState === 'pass' ? 'RGB color file' : 'Color mode needs attention',
      detail: `${metadata.colorLabel} PNG color type. Printify accepts RGB/RGBA PNG uploads.`,
      state: colorState,
    },
    {
      id: 'background',
      label: metadata.hasAlpha ? 'Transparency present' : 'Solid background file',
      detail: metadata.hasAlpha
        ? 'Transparent pixels are available for products that need the design edge to disappear.'
        : 'No alpha channel is present, so the uploaded rectangle will print as part of the design.',
      state: 'pass',
    },
  ];

  return {
    filename,
    productId: product.id,
    productLabel: product.label,
    downloadedAt: Date.now(),
    metadata,
    items,
    readyForUpload: items.every((item) => item.state !== 'fail'),
  };
};
