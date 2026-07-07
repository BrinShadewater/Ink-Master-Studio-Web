import JSZip from 'jszip';
import { resolveFilenamePattern } from './naming';
import { formatPlacementSummary, formatPrintSizeSummary } from './handoffDetails';
import { getSelectedProductionMockups } from './mockups';
import { AppliedTemplateStatus, StudioJob } from '../types';
import { buildProofApprovalAuditLine, getLatestProofFreshness, ProofFreshnessSummary } from './proofApproval';

export interface PackageAsset {
  filename: string;
  blob: Blob;
}

export interface ProductionPackageInput {
  job: StudioJob;
  printMaster?: PackageAsset | null;
  productionPdf?: PackageAsset | null;
  mockups?: PackageAsset[];
  underbase?: PackageAsset | null;
  palette: string[];
  appliedTemplateStatus?: AppliedTemplateStatus;
}

interface PackageManifestAsset {
  role: 'print-master' | 'production-pdf' | 'mockup' | 'underbase' | 'summary' | 'manifest';
  filename: string;
  status: 'included' | 'missing' | 'disabled';
  label?: string;
}

interface PackageAssemblyValidation {
  ok: boolean;
  errors: string[];
}

const packageAsset = (
  role: PackageManifestAsset['role'],
  filename: string,
  status: PackageManifestAsset['status'],
  label?: string,
): PackageManifestAsset => ({ role, filename, status, ...(label ? { label } : {}) });

const zipFileNames = (zip: JSZip) =>
  Object.keys(zip.files).filter((filename) => !zip.files[filename].dir).sort();

const validatePackageAssembly = (
  packageAssets: PackageManifestAsset[],
  files: string[],
): PackageAssemblyValidation => {
  const declaredIncludedFiles = new Set(
    packageAssets
      .filter((asset) => asset.status === 'included')
      .map((asset) => asset.filename),
  );
  const fileSet = new Set(files);
  const errors: string[] = [];

  for (const filename of declaredIncludedFiles) {
    if (!fileSet.has(filename)) {
      errors.push(`Manifest includes ${filename}, but the ZIP does not contain it.`);
    }
  }

  for (const filename of files) {
    if (!declaredIncludedFiles.has(filename)) {
      errors.push(`ZIP contains ${filename}, but the manifest does not declare it as included.`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
};

const assertValidPackageAssembly = (packageAssets: PackageManifestAsset[], zip: JSZip) => {
  const validation = validatePackageAssembly(packageAssets, zipFileNames(zip));
  if (!validation.ok) {
    throw new Error(`Production package manifest mismatch: ${validation.errors.join(' ')}`);
  }
};

export const getProductionPackageErrorMessage = (error: unknown) => {
  if (!(error instanceof Error)) {
    return 'The production package could not be generated.';
  }
  if (error.message === 'Production package requires approved customer proof.') {
    return 'Production package requires approved customer proof.';
  }
  if (error.message === 'Production package requires a current approved customer proof.') {
    return 'Production package requires a current approved customer proof.';
  }
  if (error.message.startsWith('Production package manifest mismatch:')) {
    const detail = error.message.replace('Production package manifest mismatch:', '').trim();
    return `Package contents did not match the job manifest. ${detail}`;
  }
  return 'The production package could not be generated.';
};

const createPackageAssetManifest = (input: ProductionPackageInput): PackageManifestAsset[] => {
  const { job } = input;
  const options = job.packageOptions;
  const assets: PackageManifestAsset[] = [
    packageAsset(
      'print-master',
      input.printMaster?.filename ?? 'print-master',
      options.includePrintMaster ? input.printMaster ? 'included' : 'missing' : 'disabled',
    ),
    packageAsset(
      'production-pdf',
      input.productionPdf?.filename ?? 'production-spec.pdf',
      options.includeProductionPdf ? input.productionPdf ? 'included' : 'missing' : 'disabled',
    ),
  ];

  if (options.includeMockups) {
    const mockups = input.mockups ?? [];
    const selected = getSelectedProductionMockups(options.selectedMockupIndices, job.settings.itemType);
    for (const mockup of selected) {
      const expectedFilename = `${mockup.slug}-mockup.png`;
      const includedAsset = mockups.find((asset) => asset.filename === expectedFilename);
      assets.push(packageAsset(
        'mockup',
        `mockups/${includedAsset?.filename ?? expectedFilename}`,
        includedAsset ? 'included' : 'missing',
        mockup.name,
      ));
    }
    if (selected.length === 0) {
      assets.push(packageAsset('mockup', 'mockups/', 'missing', 'No mockup colors selected'));
    }
  } else {
    assets.push(packageAsset('mockup', 'mockups/', 'disabled'));
  }

  assets.push(
    packageAsset(
      'underbase',
      input.underbase?.filename ?? 'white-underbase.png',
      options.includeUnderbase ? input.underbase ? 'included' : 'missing' : 'disabled',
    ),
    packageAsset(
      'summary',
      'production-summary.txt',
      options.includeSummary ? 'included' : 'disabled',
    ),
    packageAsset(
      'manifest',
      'job-manifest.json',
      options.includeManifest ? 'included' : 'disabled',
    ),
  );

  return assets;
};

const appliedTemplateManifest = (job: StudioJob, status?: AppliedTemplateStatus) => {
  if (!job.appliedTemplate) return null;
  return {
    ...job.appliedTemplate,
    status: status?.status ?? 'unknown',
    changes: status?.changes ?? [],
  };
};

const appliedTemplateSummary = (job: StudioJob, status?: AppliedTemplateStatus) => {
  if (!job.appliedTemplate) return 'None';
  const applied = `${job.appliedTemplate.name} · applied ${new Date(job.appliedTemplate.appliedAt).toISOString()}`;
  if (!status) return applied;
  if (status.status === 'matches') return `${applied} · matches saved template`;
  if (status.status === 'missing') return `${applied} · template missing from library`;
  if (status.status === 'drifted') return `${applied} · changed after apply: ${status.changes.join(', ')}`;
  return applied;
};

const proofFreshnessStatus = (freshness: ProofFreshnessSummary | null): 'matches-current-job' | 'stale' | 'not-comparable' | 'not-exported' => {
  if (!freshness) return 'not-exported';
  if (!freshness.comparable) return 'not-comparable';
  return freshness.stale ? 'stale' : 'matches-current-job';
};

const proofAuditManifest = (job: StudioJob, freshness: ProofFreshnessSummary | null) => ({
  approvalStatus: job.proofApproval.status,
  approvalAudit: buildProofApprovalAuditLine(job),
  approvalEventCount: job.proofApproval.events.length,
  currentJobRevision: job.revision,
  latestProofRevision: freshness?.latestProofRevision ?? null,
  latestProofQuality: freshness?.latestProofQuality ?? null,
  latestProofFilename: freshness?.latestProofFilename ?? null,
  latestProofExportedAt: freshness?.latestProofExportedAt ? new Date(freshness.latestProofExportedAt).toISOString() : null,
  freshnessStatus: proofFreshnessStatus(freshness),
  matchesCurrentJob: freshness?.comparable ? !freshness.stale : null,
  message: freshness?.message ?? 'No customer proof export recorded for this job.',
});

const proofAuditSummary = (audit: ReturnType<typeof proofAuditManifest>) => {
  const latest = audit.latestProofFilename
    ? `${audit.latestProofFilename}${audit.latestProofQuality ? ` (${audit.latestProofQuality})` : ''}`
    : 'None';
  const revision = audit.latestProofRevision === null
    ? `current job revision ${audit.currentJobRevision}; proof revision unknown`
    : `current job revision ${audit.currentJobRevision}; proof revision ${audit.latestProofRevision}`;
  return [
    `Proof freshness: ${audit.freshnessStatus}`,
    `Latest proof export: ${latest}`,
    `Proof revision check: ${revision}`,
    `Proof freshness note: ${audit.message}`,
  ];
};

const assertProductionPackageHandoffReady = (job: StudioJob) => {
  if (job.proofApproval.status !== 'approved') {
    throw new Error('Production package requires approved customer proof.');
  }
  const proofFreshness = getLatestProofFreshness(job.exports, job.revision);
  if (proofFreshness?.stale) {
    throw new Error('Production package requires a current approved customer proof.');
  }
};

export const createJobManifest = (
  job: StudioJob,
  palette: string[],
  packageAssets: PackageManifestAsset[] = [],
  appliedTemplateStatus?: AppliedTemplateStatus,
) => {
  const placement = job.placements[job.activePlacementKey];
  const selectedMockups = getSelectedProductionMockups(job.packageOptions.selectedMockupIndices, job.settings.itemType);
  const proofFreshness = getLatestProofFreshness(job.exports, job.revision);
  return {
    format: 'inkmaster-production-package',
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    job: {
      id: job.id,
      name: job.metadata.name,
      customerName: job.metadata.customerName,
      orderNumber: job.metadata.orderNumber,
      notes: job.metadata.notes,
      revision: job.revision,
    },
    recipeId: job.selectedRecipeId,
    itemType: job.settings.itemType,
    outputFormat: job.settings.format,
    productionProfile: {
      id: job.productionProfile.profileId,
      revision: job.productionProfile.profileRevision,
      name: job.productionProfile.snapshot.name,
      printerName: job.productionProfile.snapshot.printerName,
      method: job.productionProfile.snapshot.method,
    },
    appliedTemplate: appliedTemplateManifest(job, appliedTemplateStatus),
    printSpecification: job.printSpecification,
    placement,
    placementSummary: placement ? formatPlacementSummary(placement) : 'No placement selected',
    packageOptions: {
      ...job.packageOptions,
      selectedMockups: selectedMockups.map((mockup) => ({
        slug: mockup.slug,
        name: mockup.name,
        filename: `${mockup.slug}-mockup.png`,
      })),
    },
    packageAssets,
    palette,
    preflightFindings: job.preflightFindings,
    proofApproval: job.proofApproval,
    proofAudit: proofAuditManifest(job, proofFreshness),
  };
};

const summaryText = (
  job: StudioJob,
  palette: string[],
  packageAssets: PackageManifestAsset[],
  appliedTemplateStatus?: AppliedTemplateStatus,
) => {
  const placement = job.placements[job.activePlacementKey];
  const proofAudit = proofAuditManifest(job, getLatestProofFreshness(job.exports, job.revision));
  const includedAssets = packageAssets
    .filter((asset) => asset.status === 'included')
    .map((asset) => asset.label ? `${asset.filename} (${asset.label})` : asset.filename);
  const missingAssets = packageAssets
    .filter((asset) => asset.status === 'missing')
    .map((asset) => asset.label ? `${asset.filename} (${asset.label})` : asset.filename);
  return [
    `Job: ${job.metadata.name}`,
    `Customer: ${job.metadata.customerName || 'Not supplied'}`,
    `Order: ${job.metadata.orderNumber || 'Not supplied'}`,
    `Profile: ${job.productionProfile.snapshot.name} · revision ${job.productionProfile.profileRevision} · ${job.productionProfile.snapshot.printerName ? `Printer: ${job.productionProfile.snapshot.printerName} · ` : ''}Method: ${job.productionProfile.snapshot.method}`,
    `Template: ${appliedTemplateSummary(job, appliedTemplateStatus)}`,
    `Method: ${job.printSpecification.method}`,
    `Print size: ${formatPrintSizeSummary(job.printSpecification.widthInches, job.printSpecification.heightInches)}`,
    `Placement: ${placement ? formatPlacementSummary(placement) : 'No placement selected'}`,
    `Proof approval: ${buildProofApprovalAuditLine(job)}`,
    `Proof approval events: ${job.proofApproval.events.length}`,
    ...proofAuditSummary(proofAudit),
    `Format: ${job.settings.format}`,
    `Palette: ${palette.join(', ') || 'Not analyzed'}`,
    `Recipe: ${job.selectedRecipeId ?? 'custom'}`,
    `Included files: ${includedAssets.join(', ') || 'None'}`,
    `Missing requested files: ${missingAssets.join(', ') || 'None'}`,
    '',
    `Notes: ${job.metadata.notes || 'None'}`,
  ].join('\n');
};

export const buildProductionPackage = async (
  input: ProductionPackageInput,
): Promise<{ blob: Blob; filename: string }> => {
  const { job } = input;
  assertProductionPackageHandoffReady(job);
  const zip = new JSZip();
  const options = job.packageOptions;
  const packageAssets = createPackageAssetManifest(input);

  if (options.includePrintMaster && input.printMaster) {
    zip.file(input.printMaster.filename, await input.printMaster.blob.arrayBuffer());
  }
  if (options.includeProductionPdf && input.productionPdf) {
    zip.file(input.productionPdf.filename, await input.productionPdf.blob.arrayBuffer());
  }
  if (options.includeMockups) {
    const includedMockupFilenames = new Set(
      packageAssets
        .filter((asset) => asset.role === 'mockup' && asset.status === 'included')
        .map((asset) => asset.filename.replace(/^mockups\//, '')),
    );
    for (const mockup of input.mockups ?? []) {
      if (includedMockupFilenames.has(mockup.filename)) {
        zip.file(`mockups/${mockup.filename}`, await mockup.blob.arrayBuffer());
      }
    }
  }
  if (options.includeUnderbase && input.underbase) {
    zip.file(input.underbase.filename, await input.underbase.blob.arrayBuffer());
  }
  if (options.includeSummary) {
    zip.file('production-summary.txt', summaryText(job, input.palette, packageAssets, input.appliedTemplateStatus));
  }
  if (options.includeManifest) {
    zip.file('job-manifest.json', JSON.stringify(createJobManifest(job, input.palette, packageAssets, input.appliedTemplateStatus), null, 2));
  }

  assertValidPackageAssembly(packageAssets, zip);

  const placementName = job.placements[job.activePlacementKey]?.presetId ?? 'custom';
  const baseName = resolveFilenamePattern(options.namingPattern, job, placementName);
  return {
    blob: await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' }),
    filename: `${baseName}_production.zip`,
  };
};
