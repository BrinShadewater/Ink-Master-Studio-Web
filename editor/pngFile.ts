import type {
  TShirtExportPreset,
  TShirtExportPresetId,
  TShirtExportRenderMetadata,
} from './tshirtExportModel';

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_PNG_BYTES = 100 * 1024 * 1024;
const MAX_CHUNK_BYTES = MAX_PNG_BYTES - 12;
const UINT32_MAX = 0xffffffff;
const INCHES_PER_METER = 39.37007874015748;
const ALLOWED_CRITICAL_CHUNKS = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND']);

export interface ParsedPngFile {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  pixelsPerMeterX: number | null;
  pixelsPerMeterY: number | null;
  resolutionUnit: number | null;
  resolutionChunkCount: number;
  hasIend: boolean;
  byteSize: number;
}

export interface TShirtPngValidation {
  valid: boolean;
  blockers: string[];
  warnings: string[];
}

export interface TShirtExportReceipt {
  fingerprint: string;
  readiness: 'ready-to-print' | 'proof-ready';
  presetId: TShirtExportPresetId;
  width: number;
  height: number;
  dpiX: number;
  dpiY: number;
  physicalWidthInches: number;
  physicalHeightInches: number;
  bitDepth: 8;
  colorType: 6;
  transparencyPresent: true;
  byteSize: number;
  largestRasterScale: number;
  largestRasterLayerName: string | null;
  warnings: string[];
}

interface PngChunk {
  type: string;
  start: number;
  end: number;
  dataStart: number;
  dataEnd: number;
}

interface ParsedPngStructure {
  parsed: ParsedPngFile;
  chunks: PngChunk[];
}

const chunkType = (bytes: Uint8Array, offset: number): string => String.fromCharCode(
  bytes[offset],
  bytes[offset + 1],
  bytes[offset + 2],
  bytes[offset + 3],
);

const crc32 = (bytes: Uint8Array, start = 0, end = bytes.length): number => {
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) {
    crc ^= bytes[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const assertSignature = (bytes: Uint8Array): void => {
  if (bytes.length < PNG_SIGNATURE.length) throw new Error('PNG signature is truncated.');
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) throw new Error('PNG signature is invalid.');
  }
};

const readPngStructure = (bytes: Uint8Array): ParsedPngStructure => {
  if (bytes.length > MAX_PNG_BYTES) throw new Error('PNG exceeds the 100 MiB limit.');
  assertSignature(bytes);

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: PngChunk[] = [];
  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let pixelsPerMeterX: number | null = null;
  let pixelsPerMeterY: number | null = null;
  let resolutionUnit: number | null = null;
  let resolutionChunkCount = 0;
  let hasIend = false;
  let hasNonEmptyIdat = false;
  let idatSequenceEnded = false;
  let idatSequenceStarted = false;
  let hasPlte = false;

  while (offset < bytes.length) {
    if (bytes.length - offset < 12) throw new Error('PNG chunk is truncated.');
    const length = view.getUint32(offset, false);
    if (length > MAX_CHUNK_BYTES || length > bytes.length - offset - 12) {
      throw new Error('PNG chunk length is unsafe or truncated.');
    }

    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcOffset = dataEnd;
    const end = crcOffset + 4;
    const type = chunkType(bytes, offset + 4);
    const expectedCrc = view.getUint32(crcOffset, false);
    const actualCrc = crc32(bytes, offset + 4, dataEnd);
    if (actualCrc !== expectedCrc) throw new Error(`PNG ${type} chunk CRC is invalid.`);

    if (chunks.length === 0 && type !== 'IHDR') throw new Error('PNG IHDR must be the first chunk.');
    const firstTypeByte = bytes[offset + 4];
    if (
      firstTypeByte >= 65
      && firstTypeByte <= 90
      && !ALLOWED_CRITICAL_CHUNKS.has(type)
    ) {
      throw new Error(`PNG contains unsupported critical chunk ${type}.`);
    }
    if (type === 'IHDR') {
      if (chunks.length !== 0) throw new Error('PNG contains a duplicate IHDR chunk.');
      if (length !== 13) throw new Error('PNG IHDR chunk length is invalid.');
      width = view.getUint32(dataStart, false);
      height = view.getUint32(dataStart + 4, false);
      bitDepth = bytes[dataStart + 8];
      colorType = bytes[dataStart + 9];
      const compressionMethod = bytes[dataStart + 10];
      const filterMethod = bytes[dataStart + 11];
      const interlaceMethod = bytes[dataStart + 12];
      if (width === 0 || height === 0) throw new Error('PNG dimensions must be positive.');
      if (bitDepth !== 8) throw new Error('PNG bit depth must be 8.');
      if (colorType !== 6) throw new Error('PNG color type must be RGBA.');
      if (compressionMethod !== 0) throw new Error('PNG IHDR compression method is unsupported.');
      if (filterMethod !== 0) throw new Error('PNG IHDR filter method is unsupported.');
      if (interlaceMethod !== 0 && interlaceMethod !== 1) {
        throw new Error('PNG IHDR interlace method is unsupported.');
      }
    }

    if (type === 'PLTE') {
      if (hasPlte) throw new Error('PNG must not contain more than one PLTE chunk.');
      if (idatSequenceStarted) throw new Error('PNG PLTE chunk must appear before IDAT.');
      hasPlte = true;
    }

    if (type === 'IDAT') {
      if (idatSequenceEnded) throw new Error('PNG IDAT chunks must be contiguous.');
      if (length === 0) throw new Error('PNG IDAT chunks must not be empty.');
      hasNonEmptyIdat = true;
      idatSequenceStarted = true;
    } else if (hasNonEmptyIdat) {
      idatSequenceEnded = true;
    }

    if (type === 'pHYs') {
      if (length !== 9) throw new Error('PNG pHYs chunk length is invalid.');
      resolutionChunkCount += 1;
      pixelsPerMeterX = view.getUint32(dataStart, false);
      pixelsPerMeterY = view.getUint32(dataStart + 4, false);
      resolutionUnit = bytes[dataStart + 8];
    }

    const chunk = { type, start: offset, end, dataStart, dataEnd };
    chunks.push(chunk);
    offset = end;

    if (type === 'IEND') {
      if (length !== 0) throw new Error('PNG IEND chunk length is invalid.');
      hasIend = true;
      if (offset !== bytes.length) throw new Error('PNG contains bytes after IEND.');
      break;
    }
  }

  if (chunks.length === 0 || chunks[0].type !== 'IHDR') throw new Error('PNG is missing IHDR.');
  if (!hasIend) throw new Error('PNG is missing IEND.');
  if (!hasNonEmptyIdat) throw new Error('PNG must contain at least one non-empty IDAT chunk.');

  return {
    parsed: {
      width,
      height,
      bitDepth,
      colorType,
      pixelsPerMeterX,
      pixelsPerMeterY,
      resolutionUnit,
      resolutionChunkCount,
      hasIend,
      byteSize: bytes.length,
    },
    chunks,
  };
};

export const parsePngFile = (bytes: Uint8Array): ParsedPngFile => readPngStructure(bytes).parsed;

const makePhysChunk = (pixelsPerMeter: number): Uint8Array => {
  if (!Number.isInteger(pixelsPerMeter) || pixelsPerMeter < 0 || pixelsPerMeter > UINT32_MAX) {
    throw new Error('Pixels per meter must be a uint32 integer.');
  }
  const data = new Uint8Array(9);
  const view = new DataView(data.buffer);
  view.setUint32(0, pixelsPerMeter, false);
  view.setUint32(4, pixelsPerMeter, false);
  data[8] = 1;

  const type = new Uint8Array([112, 72, 89, 115]);
  const output = new Uint8Array(12 + data.length);
  const outputView = new DataView(output.buffer);
  outputView.setUint32(0, data.length, false);
  output.set(type, 4);
  output.set(data, 8);
  outputView.setUint32(17, crc32(output, 4, 17), false);
  return output;
};

export const writePngResolution = (bytes: Uint8Array, pixelsPerMeter: number): Uint8Array => {
  const { chunks } = readPngStructure(bytes);
  const phys = makePhysChunk(pixelsPerMeter);
  const parts: Uint8Array[] = [bytes.slice(0, PNG_SIGNATURE.length)];

  for (const chunk of chunks) {
    if (chunk.type === 'pHYs') continue;
    parts.push(bytes.slice(chunk.start, chunk.end));
    if (chunk.type === 'IHDR') parts.push(phys);
  }

  const byteSize = parts.reduce((total, part) => total + part.length, 0);
  if (byteSize > MAX_PNG_BYTES) throw new Error('Written PNG exceeds the 100 MiB limit.');
  const output = new Uint8Array(byteSize);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
};

export const validateTShirtPng = (
  parsed: ParsedPngFile,
  preset: TShirtExportPreset,
  renderMetadata: TShirtExportRenderMetadata,
  fingerprint: string,
): TShirtPngValidation => {
  void fingerprint;
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (parsed.width !== preset.width || parsed.height !== preset.height) {
    blockers.push('PNG dimensions do not match the selected preset.');
  }
  if (parsed.bitDepth !== 8) blockers.push('PNG bit depth must be 8.');
  if (parsed.colorType !== 6) blockers.push('PNG color type must be RGBA.');
  if (parsed.resolutionChunkCount !== 1) blockers.push('PNG must contain exactly one pHYs chunk.');
  if (parsed.resolutionChunkCount === 1 && parsed.resolutionUnit !== 1) {
    blockers.push('PNG resolution unit must be meters.');
  }
  if (parsed.resolutionChunkCount === 1 && parsed.pixelsPerMeterX !== preset.pixelsPerMeter) {
    blockers.push('PNG horizontal resolution does not match the selected preset.');
  }
  if (parsed.resolutionChunkCount === 1 && parsed.pixelsPerMeterY !== preset.pixelsPerMeter) {
    blockers.push('PNG vertical resolution does not match the selected preset.');
  }
  if (renderMetadata.alpha.transparentPixels + renderMetadata.alpha.translucentPixels <= 0) {
    blockers.push('PNG must contain at least one transparent or translucent pixel.');
  }
  if (parsed.byteSize === 0) blockers.push('PNG must not be empty.');
  if (parsed.byteSize > MAX_PNG_BYTES) blockers.push('PNG exceeds the 100 MiB limit.');

  if (renderMetadata.largestRasterScale > 2) {
    warnings.push('Largest raster layer is scaled above 2x.');
  }
  if (
    renderMetadata.largestRasterScale > 0
    && preset.dpi / renderMetadata.largestRasterScale < preset.dpi
  ) {
    warnings.push('Largest raster layer effective source DPI is below the preset DPI.');
  }
  if (parsed.byteSize >= 80 * 1024 * 1024) warnings.push('PNG file size is at or above 80 MiB.');

  return { valid: blockers.length === 0, blockers, warnings };
};

export const createTShirtExportReceipt = (
  parsed: ParsedPngFile,
  preset: TShirtExportPreset,
  renderMetadata: TShirtExportRenderMetadata,
  fingerprint: string,
): TShirtExportReceipt => {
  const validation = validateTShirtPng(parsed, preset, renderMetadata, fingerprint);
  if (!validation.valid) throw new Error('Cannot create T-shirt export receipt for invalid PNG.');
  return {
    fingerprint,
    readiness: preset.classification === 'proof' ? 'proof-ready' : 'ready-to-print',
    presetId: preset.id,
    width: parsed.width,
    height: parsed.height,
    dpiX: Math.round(parsed.pixelsPerMeterX === null ? 0 : parsed.pixelsPerMeterX / INCHES_PER_METER),
    dpiY: Math.round(parsed.pixelsPerMeterY === null ? 0 : parsed.pixelsPerMeterY / INCHES_PER_METER),
    physicalWidthInches: preset.physicalWidthInches,
    physicalHeightInches: preset.physicalHeightInches,
    bitDepth: 8,
    colorType: 6,
    transparencyPresent: true,
    byteSize: parsed.byteSize,
    largestRasterScale: renderMetadata.largestRasterScale,
    largestRasterLayerName: renderMetadata.largestRasterLayerName,
    warnings: [...validation.warnings],
  };
};
