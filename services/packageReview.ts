import { getPreflightGate } from './preflight';
import { resolveFilenamePattern } from './naming';
import { describeSelectedMockups, resolveMockupSelectionForItemType } from './mockups';
import { formatPlacementSummary } from './handoffDetails';
import { PreflightFinding, StudioJob, WorkspaceStage } from '../types';
import { ProfileUpdateStatus } from './productionProfiles';
import { getLatestProofFreshness } from './proofApproval';

export type PackageReviewItemStatus = 'ready' | 'missing' | 'excluded';
export type PackageReviewGateStatus = 'ready' | 'warning-acknowledgement-required' | 'blocked';
export type HandoffReadinessStatus = 'ready' | 'attention' | 'blocked';
export type OperatorNextActionId =
  | 'process-artwork'
  | 'resolve-critical-preflight'
  | 'acknowledge-preflight'
  | 'select-mockups'
  | 'export-proof'
  | 're-export-proof'
  | 'wait-for-approval'
  | 'record-approval'
  | 'download-package';
export type OperatorNextActionPriority = 'ready' | 'review' | 'blocked';

export interface HandoffReadinessCheck {
  id: 'artwork' | 'preflight' | 'package-assets' | 'manifest-integrity' | 'profile' | 'template' | 'proof';
  label: string;
  status: HandoffReadinessStatus;
  note: string;
}

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
  exportAction: {
    label: string;
    disabledReason: string | null;
    nextStep: string;
  };
  nextAction: {
    id: OperatorNextActionId;
    label: string;
    priority: OperatorNextActionPriority;
    target: string;
    instruction: string;
  };
  blockingReasons: string[];
  warnings: string[];
  items: PackageReviewItem[];
  handoffReadiness: {
    status: HandoffReadinessStatus;
    summary: string;
    checks: HandoffReadinessCheck[];
  };
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

const readinessCheck = (
  id: HandoffReadinessCheck['id'],
  label: string,
  status: HandoffReadinessStatus,
  note: string,
): HandoffReadinessCheck => ({ id, label, status, note });

const firstActionableCheck = (checks: HandoffReadinessCheck[]) =>
  checks.find((check) => check.status === 'blocked') ?? checks.find((check) => check.status === 'attention') ?? null;

const nextAction = (
  id: OperatorNextActionId,
  label: string,
  priority: OperatorNextActionPriority,
  target: string,
  instruction: string,
): ProductionPackageReview['nextAction'] => ({ id, label, priority, target, instruction });

export const getPackageReviewActionStage = (
  actionId: OperatorNextActionId,
): WorkspaceStage => {
  switch (actionId) {
    case 'process-artwork':
    case 'resolve-critical-preflight':
    case 'acknowledge-preflight':
      return 'prepare';
    case 'select-mockups':
    case 'export-proof':
    case 're-export-proof':
    case 'wait-for-approval':
    case 'record-approval':
    case 'download-package':
      return 'export';
    default:
      return 'export';
  }
};

const exportActionLabelFor = (action: ProductionPackageReview['nextAction']) => {
  switch (action.id) {
    case 'download-package':
      return 'Download production package';
    case 'export-proof':
      return 'Export proof before package';
    case 're-export-proof':
      return 'Re-export proof before package';
    case 'wait-for-approval':
      return 'Waiting for proof approval';
    case 'record-approval':
      return 'Record proof approval first';
    case 'acknowledge-preflight':
      return 'Acknowledge warnings first';
    case 'resolve-critical-preflight':
      return 'Resolve preflight blockers';
    case 'process-artwork':
      return 'Process artwork first';
    case 'select-mockups':
      return 'Select mockups first';
    default:
      return 'Production package not ready';
  }
};

export const buildProductionPackageReview = (
  job: StudioJob,
  findings: PreflightFinding[],
  preflightAcknowledged: boolean,
  hasProcessedResult: boolean,
  profileStatus: ProfileUpdateStatus,
): ProductionPackageReview => {
  const options = job.packageOptions;
  const selectedMockupIndices = resolveMockupSelectionForItemType(options.selectedMockupIndices, job.settings.itemType);
  const selectedMockupDescription = describeSelectedMockups(selectedMockupIndices, job.settings.itemType);
  const placement = job.placements[job.activePlacementKey];
  const placementSummary = placement ? formatPlacementSummary(placement) : 'No placement selected';
  const placementName = placementNameForJob(job);
  const baseFilename = resolveFilenamePattern(options.namingPattern, job, placementName);
  const gate = getPreflightGate(findings, preflightAcknowledged);
  const proofStatus = job.proofApproval.status;
  const proofFreshness = getLatestProofFreshness(job.exports, job.revision);
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
  if (options.includeMockups && selectedMockupIndices.length === 0) {
    warnings.push('Mockups are enabled, but no mockup colors are selected.');
  }
  if (proofStatus === 'changes-requested') {
    blockingReasons.push('Customer requested proof changes before production handoff.');
  } else if (proofStatus === 'approved' && proofFreshness?.stale) {
    blockingReasons.push('Approved customer proof no longer matches the current job revision.');
  } else if (proofStatus === 'sent') {
    blockingReasons.push(proofFreshness?.stale
      ? 'Customer proof is stale because the job changed after the latest proof export.'
      : 'Customer proof is sent and awaiting approval.');
  } else if (proofStatus === 'not-requested') {
    blockingReasons.push('Customer proof must be exported, sent, and approved before production handoff.');
  }

  const gateStatus: PackageReviewGateStatus = blockingReasons.length > 0
    ? 'blocked'
    : warnings.some((entry) => entry.includes('require acknowledgement'))
      ? 'warning-acknowledgement-required'
      : 'ready';
  const canExport = gate.canExport && hasProcessedResult && blockingReasons.length === 0;
  const handoffChecks: HandoffReadinessCheck[] = [
    readinessCheck(
      'artwork',
      'Artwork processed',
      hasProcessedResult ? 'ready' : 'blocked',
      hasProcessedResult ? 'Processed artwork is available for export.' : 'Process the artwork before production handoff.',
    ),
    readinessCheck(
      'preflight',
      'Preflight gate',
      gate.criticalCount > 0
        ? 'blocked'
        : gate.requiresAcknowledgement && !preflightAcknowledged
          ? 'attention'
          : 'ready',
      gate.criticalCount > 0
        ? `${gate.criticalCount} critical issue${gate.criticalCount === 1 ? '' : 's'} must be resolved.`
        : gate.requiresAcknowledgement && !preflightAcknowledged
          ? `${gate.warningCount} warning${gate.warningCount === 1 ? '' : 's'} need acknowledgement.`
          : 'No blocking preflight issues.',
    ),
    readinessCheck(
      'package-assets',
      'Package assets',
      options.includeMockups && selectedMockupIndices.length === 0 ? 'attention' : 'ready',
      options.includeMockups && selectedMockupIndices.length === 0
        ? 'Mockups are enabled but no colors are selected.'
        : 'Requested package assets are configured.',
    ),
    readinessCheck(
      'manifest-integrity',
      'Manifest integrity',
      'ready',
      options.includeManifest
        ? 'ZIP contents are verified against the job manifest before download.'
        : 'Manifest file is disabled; ZIP contents are still checked against selected package assets.',
    ),
    readinessCheck(
      'profile',
      'Production profile',
      profileStatus === 'current' ? 'ready' : 'attention',
      profileStatus === 'current'
        ? `${job.productionProfile.snapshot.name} revision ${job.productionProfile.profileRevision} is current.`
        : `Profile source is ${profileStatus.replace('-', ' ')}; using the job snapshot.`,
    ),
    readinessCheck(
      'template',
      'Operator template',
      'ready',
      job.appliedTemplate ? `Template ${job.appliedTemplate.name} is recorded on this job.` : 'No operator template applied.',
    ),
    readinessCheck(
      'proof',
      'Customer proof',
      proofStatus === 'changes-requested'
        ? 'blocked'
        : proofStatus === 'approved' && proofFreshness?.stale
          ? 'blocked'
        : proofStatus === 'approved'
          ? 'ready'
          : 'blocked',
      proofStatus === 'approved'
        ? proofFreshness?.stale
          ? 'Approved proof is stale. Export a fresh proof and record approval again.'
          : 'Customer proof is approved.'
        : proofStatus === 'changes-requested'
          ? 'Customer requested changes before production.'
          : proofStatus === 'sent'
            ? proofFreshness?.stale
              ? 'Latest sent proof is stale because the job changed after export.'
              : 'Proof is sent and awaiting customer approval before package export.'
            : 'Proof must be exported, sent, and approved before package export.',
    ),
  ];
  const handoffStatus: HandoffReadinessStatus = handoffChecks.some((check) => check.status === 'blocked')
    ? 'blocked'
    : handoffChecks.some((check) => check.status === 'attention')
      ? 'attention'
      : 'ready';
  const nextCheck = firstActionableCheck(handoffChecks);
  const operatorNextAction = (() => {
    if (!hasProcessedResult) {
      return nextAction(
        'process-artwork',
        'Process artwork',
        'blocked',
        'Prepare',
        'Run the artwork treatment before building proofs or production files.',
      );
    }
    if (gate.criticalCount > 0) {
      return nextAction(
        'resolve-critical-preflight',
        'Resolve preflight blockers',
        'blocked',
        'Preflight',
        `${gate.criticalCount} critical preflight issue${gate.criticalCount === 1 ? '' : 's'} must be fixed before export.`,
      );
    }
    if (proofStatus === 'changes-requested') {
      return nextAction(
        're-export-proof',
        'Revise and re-export proof',
        'blocked',
        'Customer proof',
        'Customer requested changes. Update the job, export a fresh proof, and send it again.',
      );
    }
    if (proofStatus === 'approved' && proofFreshness?.stale) {
      return nextAction(
        're-export-proof',
        'Re-export proof',
        'blocked',
        'Customer proof',
        'The approved proof is stale. Export a fresh proof and record approval again before handoff.',
      );
    }
    if (gate.requiresAcknowledgement && !preflightAcknowledged) {
      return nextAction(
        'acknowledge-preflight',
        'Acknowledge warnings',
        'review',
        'Preflight',
        `${gate.warningCount} preflight warning${gate.warningCount === 1 ? '' : 's'} need operator acknowledgement.`,
      );
    }
    if (options.includeMockups && selectedMockupIndices.length === 0) {
      return nextAction(
        'select-mockups',
        'Select mockups',
        'review',
        'Package contents',
        'Choose at least one mockup color or turn mockups off for this package.',
      );
    }
    if (proofStatus === 'not-requested') {
      return nextAction(
        'export-proof',
        'Export proof',
        'review',
        'Customer proof',
        'Export a customer proof and send it for approval before final handoff.',
      );
    }
    if (proofStatus === 'sent') {
      return nextAction(
        proofFreshness?.stale ? 're-export-proof' : 'wait-for-approval',
        proofFreshness?.stale ? 'Re-export proof' : 'Wait for approval',
        'review',
        'Customer proof',
        proofFreshness?.stale
          ? 'The sent proof is stale. Export a fresh proof before recording approval.'
          : 'The proof has been sent. Record approval or requested changes when the customer responds.',
      );
    }
    if (proofStatus === 'approved') {
      return nextAction(
        'download-package',
        'Download package',
        'ready',
        'Production package',
        'Proof, handoff checks, and manifest-verified contents are ready. Download the production package.',
      );
    }
    return nextAction(
      'record-approval',
      'Review proof status',
      'review',
      'Customer proof',
      'Review the proof state before production handoff.',
    );
  })();
  const disabledReason = !canExport
    ? blockingReasons[0] ?? warnings[0] ?? nextCheck?.note ?? 'Resolve handoff readiness items before export.'
    : null;
  const exportActionLabel = canExport ? 'Download production package' : exportActionLabelFor(operatorNextAction);

  return {
    packageFilename: `${baseFilename}_production.zip`,
    baseFilename,
    gateStatus,
    canExport,
    statusText: canExport
      ? 'Ready to build manifest-verified production package.'
      : gateStatus === 'warning-acknowledgement-required'
        ? 'Acknowledge warnings before export.'
        : 'Production package is blocked.',
    exportAction: {
      label: exportActionLabel,
      disabledReason,
      nextStep: nextCheck
        ? `${nextCheck.label}: ${nextCheck.note}`
        : 'Ready to download the production package.',
    },
    nextAction: operatorNextAction,
    blockingReasons,
    warnings,
    handoffReadiness: {
      status: handoffStatus,
      summary: handoffStatus === 'ready'
        ? 'Production handoff is ready.'
        : handoffStatus === 'attention'
          ? 'Production handoff is possible after operator review.'
          : 'Production handoff is blocked.',
      checks: handoffChecks,
    },
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
        options.includeProductionPdf ? `Printable job specification PDF with ${placementSummary}.` : 'Disabled in package options.',
      ),
      item(
        'mockups',
        'Selected mockups',
        'mockups/*.png',
        options.includeMockups
          ? selectedMockupIndices.length > 0 && hasProcessedResult ? 'ready' : 'missing'
          : 'excluded',
        options.includeMockups
          ? `${selectedMockupIndices.length} mockup color${selectedMockupIndices.length === 1 ? '' : 's'} selected: ${selectedMockupDescription}.`
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
