export enum OutputFormat {
  PNG = 'PNG',
  JPG = 'JPG',
  SVG = 'SVG',
  PDF = 'PDF'
}

export enum ShirtColor {
  BLACK = 'BLACK',
  WHITE = 'WHITE',
  NONE = 'NONE'
}

export enum ItemType {
  TSHIRT = 'TSHIRT',
  HOODIE = 'HOODIE',
  HAT = 'HAT',
  MUG = 'MUG',
  TOTE = 'TOTE'
}

export enum EdgeBehavior {
  SOFT = 'SOFT',
  HARD = 'HARD',
}

export enum DetailLevel {
  PRESERVE_GRAIN = 'PRESERVE_GRAIN',
  CLEAN_CRISPER = 'CLEAN_CRISPER',
}

export enum ResizeMode {
  FIT = 'FIT',
  STRETCH = 'STRETCH',
  COVER = 'COVER',
  TILE = 'TILE'
}

export type WorkspaceStage = 'goal' | 'prepare' | 'preview' | 'export';
export type RecipeId =
  | 'dark-garment'
  | 'light-garment'
  | 'clean-logo'
  | 'vintage-distressed'
  | 'mockups-only'
  | 'custom';

export interface ArtworkAnalysis {
  width: number;
  height: number;
  hasTransparency: boolean;
  transparencyCoverage: number;
  edgeBackground: {
    isUniform: boolean;
    color: string;
    tone: 'dark' | 'light' | 'mid';
    confidence: number;
  };
  printQuality: {
    dpi: number;
    status: 'good' | 'low' | 'poor';
    label: string;
  };
  palette: string[];
  dominantTone: 'dark' | 'light' | 'mid';
  contrastRisk: {
    darkGarment: boolean;
    lightGarment: boolean;
  };
  vectorSuitability: 'strong' | 'possible' | 'weak';
  warnings: string[];
}

export interface RecipeDefinition {
  id: RecipeId;
  name: string;
  description: string;
  icon: string;
  outcome: string;
}

export interface RecipeRecommendation {
  recipeId: RecipeId;
  confidence: number;
  reasons: string[];
  alternatives: RecipeId[];
  proposedChanges: string[];
}

export interface UserRecipe {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  source: 'user';
  settings: ProcessingSettings;
}

export interface ProcessingSettings {
  format: OutputFormat;
  shirtColor: ShirtColor;
  itemType: ItemType;
  previewOnBlack: boolean;
  detailLevel: DetailLevel;
  edgeBehavior: EdgeBehavior;
  threshold: number;
  transparencyBoost: number;
  convertToWhite: boolean;
  resizeMode: ResizeMode;
  allowUpscaling: boolean;
  noise: number;
  grain: number;
  sharpness: number;
  preserveTransparency: boolean;

  // Smart Background Removal
  bgRemoval: boolean;
  bgRemovalTolerance: number;
  bgAutoDetect: boolean;
  bgColorOverride: string | null; // hex string e.g. '#FF0000' for manual override

  // Vectorization
  vectorize: boolean;
  vectorizeColors: number; // 2 to 64
  vectorizeBlur: number; // 0 to 10 (Blur radius)
  vectorizeDetail: number; // 0 to 100 (inverse of error threshold)

  // Color Replacement
  colorReplacements: Array<{
    sourceColor: string; // hex
    targetColor: string; // hex
    tolerance: number;   // 0-100
  }>;

  // Edge Feathering
  edgeFeather: number; // 0-20
}

export interface ProcessedResult {
  blob: Blob;
  url: string;
  previewUrl?: string;
  width: number;
  height: number;
}

// Mockup types
export interface MockupDefinition {
  name: string;
  file: string;
  color: string;
}

export interface MockupDownloadOptions {
  format: 'PNG' | 'JPG';
  mockupIndices: number[];
  asZip: boolean;
}

// New Interfaces for Features
export interface BatchJob {
  id: string;
  file: File;
  previewUrl: string;       // original image data URL
  settings: ProcessingSettings;
  status: 'pending' | 'processing' | 'done' | 'error';
  resultUrl: string | null;
  resultBlob: Blob | null;
  dpiInfo: { dpi: number; status: string; label: string } | null;
}

export interface SettingsPreset {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  settings: ProcessingSettings;
}

export interface ExportHistoryEntry {
  id: string;
  filename: string;
  format: string;
  timestamp: number;
  url: string;
  blob: Blob;
}
