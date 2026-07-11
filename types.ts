import type { UpscaleResultMetadata } from './services/upscaleEngine';

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

export type CanvasBackground = 'transparent' | 'white' | 'black';

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
export type ProductionMethod = 'DTG' | 'DTF';
export type PreflightSeverity = 'pass' | 'warning' | 'critical';
export type PlacementLocation = 'front' | 'back' | 'left-chest' | 'sleeve';
export type GarmentSize = 'YOUTH' | 'S' | 'M' | 'L' | 'XL' | '2XL' | '3XL';
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

export interface JobMetadata {
  name: string;
  customerName: string;
  orderNumber: string;
  notes: string;
  tags: string[];
}

export interface SourceArtwork {
  name: string;
  type: string;
  lastModified: number;
  blob: Blob;
}

export interface PrintSpecification {
  method: ProductionMethod;
  widthInches: number;
  heightInches: number;
  targetDpi: number;
}

export interface PlacementMeasurement {
  presetId: string;
  itemType: ItemType;
  location: PlacementLocation;
  garmentSize: GarmentSize;
  widthInches: number;
  heightInches: number;
  offsetXInches: number;
  offsetYInches: number;
}

export interface PlacementPreset extends PlacementMeasurement {
  id: string;
  name: string;
  description: string;
}

export interface PreflightFinding {
  id: string;
  severity: PreflightSeverity;
  title: string;
  message: string;
  action: string;
}

export interface ProofBranding {
  shopName: string;
  contactLine: string;
  accentColor: string;
  footerNote: string;
}

export type ProofApprovalStatus = 'not-requested' | 'sent' | 'approved' | 'changes-requested';

export interface ProofApprovalEvent {
  id: string;
  timestamp: number;
  status: ProofApprovalStatus;
  actor: string;
  note: string;
}

export interface ProofApprovalState {
  status: ProofApprovalStatus;
  requestedAt: number | null;
  respondedAt: number | null;
  approverName: string;
  approverEmail: string;
  notes: string;
  shareUrl: string | null;
  cloudSyncStatus: 'local-only' | 'not-configured' | 'ready';
  events: ProofApprovalEvent[];
}

export interface ProductionPackageOptions {
  namingPattern: string;
  includePrintMaster: boolean;
  includeProductionPdf: boolean;
  includeMockups: boolean;
  selectedMockupIndices: number[];
  includeUnderbase: boolean;
  includeSummary: boolean;
  includeManifest: boolean;
}

export interface PrintableArea {
  widthInches: number;
  heightInches: number;
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
}

export interface ProductionThresholds {
  targetDpi: number;
  warningDpi: number;
  criticalDpi: number;
  significantUpscaleRatio: number;
  extremeUpscaleRatio: number;
}

export interface ProductionProfileDefaults {
  format: OutputFormat;
  preserveTransparency: boolean;
  includeUnderbase: boolean;
  packageOptions: ProductionPackageOptions;
}

export interface ProductionProfile {
  schemaVersion: 1;
  id: string;
  revision: number;
  name: string;
  description: string;
  printerName: string;
  method: ProductionMethod;
  thresholds: ProductionThresholds;
  printableAreas: Record<string, PrintableArea>;
  defaults: ProductionProfileDefaults;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
}

export interface ProductionProfileStore {
  schemaVersion: 1;
  defaultProfileId: string;
  profiles: ProductionProfile[];
}

export interface AppliedProductionProfile {
  profileId: string;
  profileRevision: number;
  snapshot: ProductionProfile;
}

export interface AppliedShopTemplate {
  id: string;
  name: string;
  appliedAt: number;
}

export interface AppliedTemplateStatus {
  appliedTemplate: AppliedShopTemplate | null;
  status: 'none' | 'matches' | 'drifted' | 'missing';
  changes: string[];
}

export interface ProfileValidationError {
  field: string;
  message: string;
}

export interface StoredJobExport {
  id: string;
  filename: string;
  format: string;
  timestamp: number;
  blob: Blob;
  metadata?: {
    kind: 'production-package' | 'production-package-blocked' | 'customer-proof' | 'print-master' | 'production-pdf' | 'mockup-set' | 'underbase';
    readinessStatus?: 'ready' | 'attention' | 'blocked';
    readinessSummary?: string;
    blockedReason?: string;
    packageContents?: string[];
    manifestVerified?: boolean;
    preflightSummary?: string;
    proofApprovalStatus?: ProofApprovalStatus;
    proofQuality?: 'print' | 'email';
    placementSummary?: string;
    jobRevision?: number;
  };
}

export interface StudioJob {
  schemaVersion: 1;
  id: string;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
  revision: number;
  productionProfile: AppliedProductionProfile;
  metadata: JobMetadata;
  sourceArtwork: SourceArtwork | null;
  settings: ProcessingSettings;
  selectedRecipeId: RecipeId | null;
  analysis: ArtworkAnalysis | null;
  printSpecification: PrintSpecification;
  placements: Record<string, PlacementMeasurement>;
  activePlacementKey: string;
  preflightFindings: PreflightFinding[];
  acknowledgedPreflightRevision: number | null;
  proofBranding: ProofBranding;
  proofApproval: ProofApprovalState;
  packageOptions: ProductionPackageOptions;
  appliedTemplate: AppliedShopTemplate | null;
  versions: Array<{
    id: string;
    name: string;
    timestamp: number;
    settings: ProcessingSettings;
  }>;
  exports: StoredJobExport[];
}

export interface ShopTemplate {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  recipeId: RecipeId | null;
  itemType: ItemType;
  settings: ProcessingSettings;
  printSpecification: PrintSpecification;
  placement: PlacementMeasurement;
  packageOptions: ProductionPackageOptions;
  proofBranding: ProofBranding;
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
  targetWidth?: number;
  targetHeight?: number;
  targetDpi?: number;
  purpose?: 'preview' | 'export';
  designScalePercent?: number;
  designOffsetXPercent?: number;
  designOffsetYPercent?: number;
  designRotationDegrees?: number;
  canvasBackground?: CanvasBackground;

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
  upscale: UpscaleResultMetadata;
}

export type AiCleanupAvailability = 'checking' | 'available' | 'unavailable' | 'error';

export interface AiCleanupStatus {
  availability: AiCleanupAvailability;
  message: string;
  maxImageBytes: number | null;
  dailyLimitPerOperator: number | null;
  supportedActions: string[];
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
  metadata?: StoredJobExport['metadata'];
}
