import { ProcessingSettings, OutputFormat, ShirtColor, EdgeBehavior, DetailLevel, ResizeMode, ItemType } from './types';

export const TARGET_WIDTH = 4200;
export const TARGET_HEIGHT = 5100;
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