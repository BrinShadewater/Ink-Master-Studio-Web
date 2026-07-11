import {
  ProcessingSettings,
  OutputFormat,
  ShirtColor,
  EdgeBehavior,
  DetailLevel,
  ResizeMode,
  ItemType,
  PrintSpecification,
  ProductionPackageOptions,
  ProductionThresholds,
  ProofBranding,
} from './types';

export const TARGET_WIDTH = 4500;
export const TARGET_HEIGHT = 5400;
export const MAX_FILE_SIZE_MB = 100;
export const MAX_SVG_SIZE_MB = 20;

export const DEFAULT_SETTINGS: ProcessingSettings = {
  format: OutputFormat.PNG,
  shirtColor: ShirtColor.NONE,
  itemType: ItemType.TSHIRT,
  previewOnBlack: true,
  detailLevel: DetailLevel.PRESERVE_GRAIN,
  edgeBehavior: EdgeBehavior.SOFT,
  threshold: 10,
  transparencyBoost: 1.0,
  convertToWhite: false,
  resizeMode: ResizeMode.FIT,
  allowUpscaling: true,
  noise: 0,
  grain: 0,
  sharpness: 0,
  preserveTransparency: true,
  targetWidth: TARGET_WIDTH,
  targetHeight: TARGET_HEIGHT,
  targetDpi: 300,
  designScalePercent: 100,
  designOffsetXPercent: 0,
  designOffsetYPercent: 0,
  designRotationDegrees: 0,
  canvasBackground: 'transparent',
  
  // Smart Background Removal Defaults
  bgRemoval: false,
  bgRemovalTolerance: 30,
  bgAutoDetect: true,
  bgColorOverride: null,

  // Vectorization Defaults
  vectorize: false,
  vectorizeColors: 16,
  vectorizeBlur: 0,
  vectorizeDetail: 50,

  // Feature Defaults
  colorReplacements: [],
  edgeFeather: 0,
};

export const GEMINI_MODEL = 'gemini-2.5-flash-image';

export const DEFAULT_PRINT_SPECIFICATION: PrintSpecification = {
  method: 'DTG',
  widthInches: 12,
  heightInches: 14,
  targetDpi: 300,
};

export const DEFAULT_PROOF_BRANDING: ProofBranding = {
  shopName: 'InkMaster Studio',
  contactLine: '',
  accentColor: '#6366F1',
  footerNote: 'Customer approval confirms artwork, placement, garment color, and spelling.',
};

export const DEFAULT_PACKAGE_OPTIONS: ProductionPackageOptions = {
  namingPattern: '{job}_{customer}_{garment}_{placement}_v{version}',
  includePrintMaster: true,
  includeProductionPdf: true,
  includeMockups: true,
  selectedMockupIndices: [1, 2, 6],
  includeUnderbase: false,
  includeSummary: true,
  includeManifest: true,
};

export const DEFAULT_PRODUCTION_THRESHOLDS: ProductionThresholds = {
  targetDpi: 300,
  warningDpi: 200,
  criticalDpi: 150,
  significantUpscaleRatio: 1.5,
  extremeUpscaleRatio: 3,
};
