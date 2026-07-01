import { PreflightFinding, ProofApprovalStatus } from '../types';
import { ProductionPackageReview } from './packageReview';
import { getPreflightGate } from './preflight';
import { ProofFreshnessSummary } from './proofApproval';

export type ProductionWorkflowStepId = 'job' | 'preflight' | 'placement' | 'proof' | 'package';
export type ProductionWorkflowStepStatus = 'done' | 'current' | 'review' | 'blocked' | 'pending';

export interface ProductionWorkflowStep {
  id: ProductionWorkflowStepId;
  label: string;
  status: ProductionWorkflowStepStatus;
  note: string;
}

export interface ProductionWorkflowPathInput {
  hasArtwork: boolean;
  hasProcessedResult: boolean;
  preflightFindings: PreflightFinding[];
  preflightAcknowledged: boolean;
  proofApprovalStatus: ProofApprovalStatus;
  proofFreshness: ProofFreshnessSummary | null;
  packageReview: ProductionPackageReview | null;
}

const workflowStep = (
  id: ProductionWorkflowStepId,
  label: string,
  status: ProductionWorkflowStepStatus,
  note: string,
): ProductionWorkflowStep => ({ id, label, status, note });

export const buildProductionWorkflowPath = ({
  hasArtwork,
  hasProcessedResult,
  preflightFindings,
  preflightAcknowledged,
  proofApprovalStatus,
  proofFreshness,
  packageReview,
}: ProductionWorkflowPathInput): ProductionWorkflowStep[] => {
  const gate = getPreflightGate(preflightFindings, preflightAcknowledged);
  const placementFinding = preflightFindings.find((finding) => finding.id === 'placement-area');
  const placementBlocked = placementFinding?.severity === 'critical';

  const jobStatus: ProductionWorkflowStepStatus = hasProcessedResult
    ? 'done'
    : hasArtwork
      ? 'current'
      : 'pending';
  const preflightStatus: ProductionWorkflowStepStatus = !hasProcessedResult
    ? 'pending'
    : gate.criticalCount > 0
      ? 'blocked'
      : gate.requiresAcknowledgement && !preflightAcknowledged
        ? 'review'
        : 'done';
  const placementStatus: ProductionWorkflowStepStatus = !hasProcessedResult
    ? 'pending'
    : placementBlocked
      ? 'blocked'
      : 'done';
  const proofStatus: ProductionWorkflowStepStatus = !hasProcessedResult || preflightStatus === 'blocked'
    ? 'pending'
    : proofApprovalStatus === 'changes-requested'
      ? 'blocked'
      : proofApprovalStatus === 'approved' && proofFreshness?.stale
        ? 'blocked'
        : proofApprovalStatus === 'approved'
          ? 'done'
          : proofApprovalStatus === 'sent'
            ? 'review'
            : 'current';
  const packageStatus: ProductionWorkflowStepStatus = !packageReview
    ? 'pending'
    : !packageReview.canExport
      ? packageReview.gateStatus === 'blocked' ? 'blocked' : 'review'
      : packageReview.handoffReadiness.status === 'ready'
        ? 'current'
        : 'review';

  return [
    workflowStep(
      'job',
      'Job',
      jobStatus,
      hasProcessedResult
        ? 'Artwork is processed and ready for production checks.'
        : hasArtwork
          ? 'Run the artwork treatment to create production output.'
          : 'Start by adding artwork to the job.',
    ),
    workflowStep(
      'preflight',
      'Preflight',
      preflightStatus,
      gate.criticalCount > 0
        ? `${gate.criticalCount} critical issue${gate.criticalCount === 1 ? '' : 's'} must be fixed.`
        : gate.requiresAcknowledgement && !preflightAcknowledged
          ? `${gate.warningCount} warning${gate.warningCount === 1 ? '' : 's'} need acknowledgement.`
          : hasProcessedResult
            ? 'Print dimensions and artwork checks are clear.'
            : 'Preflight runs after artwork is processed.',
    ),
    workflowStep(
      'placement',
      'Placement',
      placementStatus,
      placementBlocked
        ? placementFinding.message
        : hasProcessedResult
          ? 'Placement fits the calibrated printable area.'
          : 'Confirm placement after production output exists.',
    ),
    workflowStep(
      'proof',
      'Proof',
      proofStatus,
      proofApprovalStatus === 'approved'
        ? proofFreshness?.stale
          ? 'Approved proof is stale; export a fresh proof.'
          : 'Customer proof is approved.'
        : proofApprovalStatus === 'changes-requested'
          ? 'Customer requested changes before handoff.'
          : proofApprovalStatus === 'sent'
            ? proofFreshness?.stale
              ? 'Sent proof is stale; export a fresh proof.'
              : 'Proof is sent; wait for customer response.'
            : hasProcessedResult
              ? 'Export a customer proof for approval.'
              : 'Proof export comes after processing and preflight.',
    ),
    workflowStep(
      'package',
      'Package',
      packageStatus,
      packageReview
        ? packageReview.nextAction.instruction
        : 'Production package is prepared after proof and handoff checks.',
    ),
  ];
};
