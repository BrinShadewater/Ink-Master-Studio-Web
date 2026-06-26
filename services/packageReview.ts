import { getPreflightGate } from './preflight';
import { resolveFilenamePattern } from './naming';
import { PreflightFinding, StudioJob } from '../types';
import { ProfileUpdateStatus } from './productionProfiles';

export type PackageReviewItemStatus = 'ready' | 'missing' | 'excluded';
export type PackageReviewGateStatus = 'ready' | 'warning-acknowledgement-required' | 'blocked';

export interface PackageReviewItem {
  id: 'print-master' | 'production-pdf' | 'mockups' | 'underbase' | 'summary' | 'manifest';
  label: string;
  filename: string;
  status: PackageReviewItemStatus;
  note: string;
}

export interface ProductionPackageReview {
  packageFilename: string;
  baseFilename: string;
  gateStatus: PackageReviewGateStatus;
  canExport: boolean;
  statusText: string;
  blockingReasons: string[];
  warnings: string[];
  items: PackageReviewItem[];
  profile: {
    name: string;
    revision: number;
    status: ProfileUpdateStatus;
  };
}

const placementNameForJob = (job: StudioJob) =>
  job.placements[job.activePlacementKey]?.presetId || 'custom';

const item = (
  id: PackageReviewItem['id'],
  label: string,
  filename: string,
  status: PackageReviewItemStatus,
  note: string,
): PackageReviewItem => ({ id, label, filename, status, note });

export const buildProductionPackageReview = (
  job: StudioJob,
  findings: PreflightFinding[],
  preflightAcknowledged: boolean,
  hasProcessedResult: boolean,
  profileStatus: ProfileUpdateStatus,
): ProductionPackageReview => {
  const options = job.packageOptions;
  const placementName = placementNameForJob(job);
  const baseFilename = resolveFilenamePattern(options.namingPattern, job, placementName);
  const gate = getPreflightGate(findings, preflightAcknowledged);
  const blockingReasons: string[] = [];
  const warnings: string[] = [];

  if (!hasProcessedResult) {
    blockingReasons.push('Process the artwork before building the production package.');
  }
  if (gate.criticalCount > 0) {
    blockingReasons.push(`${gate.criticalCount} critical preflight issue${gate.criticalCount === 1 ? '' : 's'} must be resolved.`);
  }
  if (gate.requiresAcknowledgement && !preflightAcknowledged) {
    warnings.push(`${gate.warningCount} preflight warning${gate.warningCount === 1 ? '' : 's'} require acknowledgement before export.`);
  }
  if (profileStatus === 'update-available') {
    warnings.push('A newer revision of this production profile is available; this package uses the job snapshot.');
  } else if (profileStatus === 'archived') {
    warnings.push('The production profile applied to this job is archived; this package uses the job snapshot.');
  } else if (profileStatus === 'missing') {
    warnings.push('The original production profile is missing locally; this package uses the job snapshot.');
  }
  if (options.includeMockups && options.selectedMockupIndices.length === 0) {
    warnings.push('Mockups are enabled, but no mockup colors are selected.');
  }

  const gateStatus: PackageReviewGateStatus = blockingReasons.length > 0
    ? 'blocked'
    : warnings.some((entry) => entry.includes('require acknowledgement'))
      ? 'warning-acknowledgement-required'
      : 'ready';
  const canExport = gate.canExport && hasProcessedResult && blockingReasons.length === 0;

  return {
    packageFilename: `${baseFilename}_production.zip`,
    baseFilename,
    gateStatus,
    canExport,
    statusText: canExport
      ? 'Ready to build production package.'
      : gateStatus === 'warning-acknowledgement-required'
        ? 'Acknowledge warnings before export.'
        : 'Production package is blocked.',
    blockingReasons,
    warnings,
    profile: {
      name: job.productionProfile.snapshot.name,
      revision: job.productionProfile.profileRevision,
      status: profileStatus,
    },
    items: [
      item(
        'print-master',
        'Print master',
        `print-master.${job.settings.format.toLowerCase()}`,
        options.includePrintMaster ? hasProcessedResult ? 'ready' : 'missing' : 'excluded',
        options.includePrintMaster ? 'Final processed artwork for production.' : 'Disabled in package options.',
      ),
      item(
        'production-pdf',
        'Production PDF/spec sheet',
        'production-spec.pdf',
        options.includeProductionPdf ? hasProcessedResult ? 'ready' : 'missing' : 'excluded',
        options.includeProductionPdf ? 'Printable job specification PDF.' : 'Disabled in package options.',
      ),
      item(
        'mockups',
        'Selected mockups',
        'mockups/*.png',
        options.includeMockups
          ? options.selectedMockupIndices.length > 0 && hasProcessedResult ? 'ready' : 'missing'
          : 'excluded',
        options.includeMockups
          ? `${options.selectedMockupIndices.length} mockup color${options.selectedMockupIndices.length === 1 ? '' : 's'} selected.`
          : 'Disabled in package options.',
      ),
      item(
        'underbase',
        'White underbase',
        'white-underbase.png',
        options.includeUnderbase ? hasProcessedResult ? 'ready' : 'missing' : 'excluded',
        options.includeUnderbase ? 'Optional dark-garment underbase layer.' : 'Not requested for this package.',
      ),
      item(
        'summary',
        'Palette and processing summary',
        'production-summary.txt',
        options.includeSummary ? 'ready' : 'excluded',
        options.includeSummary ? 'Human-readable operator summary.' : 'Disabled in package options.',
      ),
      item(
        'manifest',
        'Job manifest',
        'job-manifest.json',
        options.includeManifest ? 'ready' : 'excluded',
        options.includeManifest ? 'Machine-readable job metadata and preflight results.' : 'Disabled in package options.',
      ),
    ],
  };
};
