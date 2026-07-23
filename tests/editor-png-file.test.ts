import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';
import {
  createTShirtExportReceipt,
  parsePngFile,
  validateTShirtPng,
  writePngResolution,
} from '../editor/pngFile';
import type {
  TShirtExportPreset,
  TShirtExportRenderMetadata,
} from '../editor/tshirtExportModel';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const MAX_PNG_BYTES = 100 * 1024 * 1024;

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const uint32 = (value: number): number[] => [
  (value >>> 24) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 8) & 0xff,
  value & 0xff,
];

const chunk = (type: string, data: number[] = []): number[] => {
  const typeBytes = [...type].map((character) => character.charCodeAt(0));
  const payload = new Uint8Array([...typeBytes, ...data]);
  return [...uint32(data.length), ...payload, ...uint32(crc32(payload))];
};

const adler32 = (bytes: Uint8Array): number => {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
};

const zlibRgbaData = (width: number, height: number): Uint8Array => {
  const scanlines = new Uint8Array(height * (1 + width * 4));
  for (let row = 0; row < height; row += 1) scanlines[row * (1 + width * 4)] = 0;
  const checksum = adler32(scanlines);
  const length = scanlines.length;
  return new Uint8Array([
    0x78,
    0x01,
    0x01,
    length & 0xff,
    (length >>> 8) & 0xff,
    (~length) & 0xff,
    ((~length) >>> 8) & 0xff,
    ...scanlines,
    ...uint32(checksum),
  ]);
};

const fixtureRgbaPng = ({
  width,
  height,
  resolutions = [],
  bitDepth = 8,
  colorType = 6,
  compressionMethod = 0,
  filterMethod = 0,
  interlaceMethod = 0,
  includeIhdr = true,
  includeIend = true,
  idatChunks,
  resolutionUnit = 1,
}: {
  width: number;
  height: number;
  resolutions?: number[];
  bitDepth?: number;
  colorType?: number;
  compressionMethod?: number;
  filterMethod?: number;
  interlaceMethod?: number;
  includeIhdr?: boolean;
  includeIend?: boolean;
  idatChunks?: Uint8Array[];
  resolutionUnit?: number;
}): Uint8Array => {
  const bytes = [...PNG_SIGNATURE];
  if (includeIhdr) {
    bytes.push(...chunk('IHDR', [
      ...uint32(width),
      ...uint32(height),
      bitDepth,
      colorType,
      compressionMethod,
      filterMethod,
      interlaceMethod,
    ]));
  }
  for (const resolution of resolutions) {
    bytes.push(...chunk('pHYs', [...uint32(resolution), ...uint32(resolution), resolutionUnit]));
  }
  for (const idat of idatChunks ?? [zlibRgbaData(width, height)]) {
    bytes.push(...chunk('IDAT', [...idat]));
  }
  if (includeIend) bytes.push(...chunk('IEND'));
  return new Uint8Array(bytes);
};

const pngFromChunks = (chunks: number[][]): Uint8Array => new Uint8Array([
  ...PNG_SIGNATURE,
  ...chunks.flat(),
]);

const includesBytes = (bytes: Uint8Array, sequence: number[]): boolean => {
  for (let start = 0; start <= bytes.length - sequence.length; start += 1) {
    if (sequence.every((byte, index) => bytes[start + index] === byte)) return true;
  }
  return false;
};

const preset: TShirtExportPreset = {
  id: 'standard-tee',
  name: 'Standard Tee',
  width: 2,
  height: 3,
  dpi: 300,
  pixelsPerMeter: 11811,
  physicalWidthInches: 10,
  physicalHeightInches: 12,
  classification: 'production',
};

const renderMetadata: TShirtExportRenderMetadata = {
  alpha: {
    transparentPixels: 1,
    translucentPixels: 0,
    opaquePixels: 5,
  },
  largestRasterScale: 1,
  largestRasterLayerName: null,
  pixelDigest: 'pixel-digest',
};

test('writes one authoritative pHYs chunk and parses actual file facts', () => {
  const source = fixtureRgbaPng({ width: 2, height: 3 });
  const written = writePngResolution(source, 11811);
  const parsed = parsePngFile(written);
  assert.deepEqual({
    width: parsed.width,
    height: parsed.height,
    bitDepth: parsed.bitDepth,
    colorType: parsed.colorType,
    pixelsPerMeterX: parsed.pixelsPerMeterX,
    pixelsPerMeterY: parsed.pixelsPerMeterY,
    resolutionUnit: parsed.resolutionUnit,
    resolutionChunkCount: parsed.resolutionChunkCount,
    hasIend: parsed.hasIend,
  }, {
    width: 2,
    height: 3,
    bitDepth: 8,
    colorType: 6,
    pixelsPerMeterX: 11811,
    pixelsPerMeterY: 11811,
    resolutionUnit: 1,
    resolutionChunkCount: 1,
    hasIend: true,
  });
  assert.notEqual(written, source);
  assert.deepEqual(source, fixtureRgbaPng({ width: 2, height: 3 }));
});

test('uses valid zlib-compressed RGBA scanlines in PNG fixtures', () => {
  const data = zlibRgbaData(2, 3);
  assert.equal(inflateSync(data).byteLength, 3 * (1 + 2 * 4));
});

test('replaces duplicate pHYs chunks instead of retaining ambiguity', () => {
  const duplicated = fixtureRgbaPng({
    width: 2,
    height: 3,
    resolutions: [5906, 9999],
  });
  const parsed = parsePngFile(writePngResolution(duplicated, 11811));
  assert.equal(parsed.resolutionChunkCount, 1);
  assert.equal(parsed.pixelsPerMeterX, 11811);
});

test('rejects malformed, incomplete, and ambiguous PNG structures', () => {
  const valid = fixtureRgbaPng({ width: 2, height: 3 });
  const badSignature = valid.slice();
  badSignature[0] = 0;
  const truncatedLength = new Uint8Array([...PNG_SIGNATURE, ...uint32(100), 73, 72, 68, 82]);
  const missingIhdr = fixtureRgbaPng({ width: 2, height: 3, includeIhdr: false });
  const duplicateIhdr = new Uint8Array([
    ...PNG_SIGNATURE,
    ...chunk('IHDR', [...uint32(2), ...uint32(3), 8, 6, 0, 0, 0]),
    ...chunk('IHDR', [...uint32(2), ...uint32(3), 8, 6, 0, 0, 0]),
    ...chunk('IEND'),
  ]);
  const missingIend = fixtureRgbaPng({ width: 2, height: 3, includeIend: false });
  const trailingBytes = new Uint8Array([...valid, 0]);
  const badCrc = valid.slice();
  badCrc[badCrc.length - 5] ^= 0xff;

  assert.throws(() => parsePngFile(new Uint8Array()));
  assert.throws(() => parsePngFile(badSignature));
  assert.throws(() => parsePngFile(truncatedLength));
  assert.throws(() => parsePngFile(missingIhdr));
  assert.throws(() => parsePngFile(duplicateIhdr));
  assert.throws(() => parsePngFile(missingIend));
  assert.throws(() => parsePngFile(trailingBytes));
  assert.throws(() => parsePngFile(badCrc));
});

test('rejects unsupported PNG image formats', () => {
  assert.throws(() => parsePngFile(fixtureRgbaPng({ width: 2, height: 3, bitDepth: 16 })));
  assert.throws(() => parsePngFile(fixtureRgbaPng({ width: 2, height: 3, colorType: 2 })));
});

test('rejects unsupported IHDR compression, filter, and interlace methods', () => {
  assert.throws(() => parsePngFile(fixtureRgbaPng({ width: 2, height: 3, compressionMethod: 1 })), /compression/i);
  assert.throws(() => parsePngFile(fixtureRgbaPng({ width: 2, height: 3, filterMethod: 1 })), /filter/i);
  assert.throws(() => parsePngFile(fixtureRgbaPng({ width: 2, height: 3, interlaceMethod: 2 })), /interlace/i);
  assert.doesNotThrow(() => parsePngFile(fixtureRgbaPng({ width: 2, height: 3, interlaceMethod: 1 })));
});

test('requires non-empty contiguous IDAT chunks after IHDR', () => {
  const idat = zlibRgbaData(2, 3);
  const noIdat = fixtureRgbaPng({ width: 2, height: 3, idatChunks: [] });
  const emptyIdat = fixtureRgbaPng({ width: 2, height: 3, idatChunks: [new Uint8Array()] });
  const idatBeforeIhdr = new Uint8Array([
    ...PNG_SIGNATURE,
    ...chunk('IDAT', [...idat]),
    ...chunk('IHDR', [...uint32(2), ...uint32(3), 8, 6, 0, 0, 0]),
    ...chunk('IEND'),
  ]);
  const splitIdat = new Uint8Array([
    ...PNG_SIGNATURE,
    ...chunk('IHDR', [...uint32(2), ...uint32(3), 8, 6, 0, 0, 0]),
    ...chunk('IDAT', [...idat]),
    ...chunk('tEXt', [107, 101, 121, 0, 118, 97, 108, 117, 101]),
    ...chunk('IDAT', [...idat]),
    ...chunk('IEND'),
  ]);

  assert.throws(() => parsePngFile(noIdat), /IDAT/i);
  assert.throws(() => parsePngFile(emptyIdat), /IDAT/i);
  assert.throws(() => parsePngFile(idatBeforeIhdr), /IHDR/i);
  assert.throws(() => parsePngFile(splitIdat), /IDAT/i);
});

test('rejects unknown critical chunks and enforces PLTE ordering', () => {
  const ihdr = chunk('IHDR', [...uint32(2), ...uint32(3), 8, 6, 0, 0, 0]);
  const idat = chunk('IDAT', [...zlibRgbaData(2, 3)]);
  const iend = chunk('IEND');
  const plte = chunk('PLTE', [0, 0, 0]);
  const ancillary = chunk('tEXt', [107, 101, 121, 0, 118, 97, 108, 117, 101]);
  const unknownCritical = pngFromChunks([ihdr, chunk('ABCD'), idat, iend]);
  const validPlte = pngFromChunks([ihdr, plte, idat, iend]);
  const duplicatePlte = pngFromChunks([ihdr, plte, plte, idat, iend]);
  const latePlte = pngFromChunks([ihdr, idat, plte, iend]);
  const ancillarySource = pngFromChunks([ihdr, ancillary, idat, iend]);

  assert.throws(() => parsePngFile(unknownCritical), /critical/i);
  assert.throws(() => writePngResolution(unknownCritical, 11811), /critical/i);
  assert.doesNotThrow(() => parsePngFile(validPlte));
  assert.throws(() => parsePngFile(duplicatePlte), /PLTE/i);
  assert.throws(() => parsePngFile(latePlte), /PLTE/i);
  assert.doesNotThrow(() => parsePngFile(ancillarySource));
  assert.equal(includesBytes(writePngResolution(ancillarySource, 11811), ancillary), true);
});

test('rejects files larger than 100 MiB before parsing them', () => {
  assert.throws(() => parsePngFile(new Uint8Array(MAX_PNG_BYTES + 1)));
});

test('returns validation blockers for file and render facts that cannot print', () => {
  const parsed = parsePngFile(writePngResolution(fixtureRgbaPng({ width: 1, height: 3 }), 5906));
  const validation = validateTShirtPng(parsed, preset, {
    ...renderMetadata,
    alpha: { transparentPixels: 0, translucentPixels: 0, opaquePixels: 6 },
  }, 'fingerprint');

  assert.equal(validation.valid, false);
  assert.deepEqual(validation.warnings, []);
  assert.equal(validation.blockers.length, 4);
  assert.match(validation.blockers.join('\n'), /dimensions/i);
  assert.match(validation.blockers.join('\n'), /resolution/i);
  assert.match(validation.blockers.join('\n'), /transparent/i);
});

test('blocks non-meter pHYs metadata', () => {
  const parsed = parsePngFile(fixtureRgbaPng({
    width: 2,
    height: 3,
    resolutions: [11811],
    resolutionUnit: 0,
  }));
  const validation = validateTShirtPng(parsed, preset, renderMetadata, 'fingerprint');

  assert.equal(validation.valid, false);
  assert.match(validation.blockers.join('\n'), /meters/i);
});

test('separates print warnings from blockers and records receipt facts', () => {
  const parsed = parsePngFile(writePngResolution(fixtureRgbaPng({ width: 2, height: 3 }), 11811));
  const metadata = {
    ...renderMetadata,
    largestRasterScale: 3,
    largestRasterLayerName: 'Source artwork',
  };
  const validation = validateTShirtPng(parsed, preset, metadata, 'fingerprint');
  const receipt = createTShirtExportReceipt(parsed, preset, metadata, 'fingerprint');

  assert.deepEqual(validation, {
    valid: true,
    blockers: [],
    warnings: [
      'Largest raster layer is scaled above 2x.',
      'Largest raster layer effective source DPI is below the preset DPI.',
    ],
  });
  assert.deepEqual(receipt, {
    fingerprint: 'fingerprint',
    readiness: 'ready-to-print',
    presetId: 'standard-tee',
    width: 2,
    height: 3,
    dpiX: 300,
    dpiY: 300,
    physicalWidthInches: 10,
    physicalHeightInches: 12,
    bitDepth: 8,
    colorType: 6,
    transparencyPresent: true,
    byteSize: parsed.byteSize,
    largestRasterScale: 3,
    largestRasterLayerName: 'Source artwork',
    warnings: validation.warnings,
  });
});

test('classifies a valid Draft Proof receipt as proof-ready even without warnings', () => {
  const proofPreset: TShirtExportPreset = {
    ...preset,
    id: 'draft-proof',
    dpi: 150,
    pixelsPerMeter: 5906,
    classification: 'proof',
  };
  const parsed = parsePngFile(writePngResolution(fixtureRgbaPng({ width: 2, height: 3 }), 5906));
  const validation = validateTShirtPng(parsed, proofPreset, renderMetadata, 'proof-fingerprint');
  const receipt = createTShirtExportReceipt(parsed, proofPreset, renderMetadata, 'proof-fingerprint');

  assert.equal(validation.valid, true);
  assert.deepEqual(validation.warnings, []);
  assert.equal(receipt.readiness, 'proof-ready');
});

test('recomputes validation so forged-valid data cannot produce a receipt', () => {
  const parsed = parsePngFile(writePngResolution(fixtureRgbaPng({ width: 2, height: 3 }), 11811));
  const forgedValid = { valid: true, blockers: [], warnings: [] };
  const invalidDimensions = { ...parsed, width: 1 };
  const noTransparency = {
    ...renderMetadata,
    alpha: { transparentPixels: 0, translucentPixels: 0, opaquePixels: 6 },
  };

  assert.throws(
    () => Reflect.apply(
      createTShirtExportReceipt,
      undefined,
      [invalidDimensions, preset, renderMetadata, 'fingerprint', forgedValid],
    ),
    /invalid PNG/i,
  );
  assert.throws(
    () => Reflect.apply(
      createTShirtExportReceipt,
      undefined,
      [parsed, preset, noTransparency, 'fingerprint', forgedValid],
    ),
    /invalid PNG/i,
  );
});

test('warns at 80 MiB and blocks at 100 MiB using parsed byte size', () => {
  const parsed = parsePngFile(writePngResolution(fixtureRgbaPng({ width: 2, height: 3 }), 11811));
  const atWarningThreshold = { ...parsed, byteSize: 80 * 1024 * 1024 };
  const atBlockerThreshold = { ...parsed, byteSize: MAX_PNG_BYTES + 1 };

  assert.match(validateTShirtPng(atWarningThreshold, preset, renderMetadata, 'fingerprint').warnings.join('\n'), /80 MiB/);
  assert.match(validateTShirtPng(atBlockerThreshold, preset, renderMetadata, 'fingerprint').blockers.join('\n'), /100 MiB/);
});
