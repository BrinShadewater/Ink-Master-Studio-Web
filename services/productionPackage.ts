import JSZip from 'jszip';
import { resolveFilenamePattern } from './naming';
import { StudioJob } from '../types';

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
}

export const createJobManifest = (job: StudioJob, palette: string[]) => {
  const placement = job.placements[job.activePlacementKey];
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
    printSpecification: job.printSpecification,
    placement,
    palette,
    preflightFindings: job.preflightFindings,
  };
};

const summaryText = (job: StudioJob, palette: string[]) => {
  const placement = job.placements[job.activePlacementKey];
  return [
    `Job: ${job.metadata.name}`,
    `Customer: ${job.metadata.customerName || 'Not supplied'}`,
    `Order: ${job.metadata.orderNumber || 'Not supplied'}`,
    `Method: ${job.printSpecification.method}`,
    `Print size: ${job.printSpecification.widthInches} × ${job.printSpecification.heightInches} in`,
    `Placement: ${placement?.presetId ?? 'custom'} · ${placement?.widthInches ?? 0} × ${placement?.heightInches ?? 0} in`,
    `Format: ${job.settings.format}`,
    `Palette: ${palette.join(', ') || 'Not analyzed'}`,
    `Recipe: ${job.selectedRecipeId ?? 'custom'}`,
    '',
    `Notes: ${job.metadata.notes || 'None'}`,
  ].join('\n');
};

export const buildProductionPackage = async (
  input: ProductionPackageInput,
): Promise<{ blob: Blob; filename: string }> => {
  const { job } = input;
  const zip = new JSZip();
  const options = job.packageOptions;

  if (options.includePrintMaster && input.printMaster) {
    zip.file(input.printMaster.filename, await input.printMaster.blob.arrayBuffer());
  }
  if (options.includeProductionPdf && input.productionPdf) {
    zip.file(input.productionPdf.filename, await input.productionPdf.blob.arrayBuffer());
  }
  if (options.includeMockups) {
    for (const mockup of input.mockups ?? []) {
      zip.file(`mockups/${mockup.filename}`, await mockup.blob.arrayBuffer());
    }
  }
  if (options.includeUnderbase && input.underbase) {
    zip.file(input.underbase.filename, await input.underbase.blob.arrayBuffer());
  }
  if (options.includeSummary) {
    zip.file('production-summary.txt', summaryText(job, input.palette));
  }
  if (options.includeManifest) {
    zip.file('job-manifest.json', JSON.stringify(createJobManifest(job, input.palette), null, 2));
  }

  const placementName = job.placements[job.activePlacementKey]?.presetId ?? 'custom';
  const baseName = resolveFilenamePattern(options.namingPattern, job, placementName);
  return {
    blob: await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' }),
    filename: `${baseName}_production.zip`,
  };
};
