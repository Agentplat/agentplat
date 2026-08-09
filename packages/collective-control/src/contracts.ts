import type { JsonValue } from "@agentplat/core";

export const COLLECTIVE_CONTROL_SCHEMA_VERSION = 1 as const;

export type CollectiveJson = JsonValue;
export type CollectiveDigestV1 = `sha256:${string}`;

export type CollectiveDigestDomainV1 =
  | "mandate"
  | "mandate-proof"
  | "revocation"
  | "work-contract"
  | "action-permit"
  | "budget-reservation"
  | "decision-record"
  | "evidence-chain"
  | "state"
  | "snapshot"
  | "experiment-registration"
  | "mission"
  | "evaluation-sample"
  | "evaluation-report"
  | "local-rule-policy"
  | "local-rule-definition"
  | "local-rule-program"
  | "local-rule-proposal"
  | "local-rule-state"
  | "local-rule-decision"
  | "room-proposal";

export interface MandateObjectiveSelectorV1 {
  readonly schemaVersion: 1;
  readonly meshId: string;
  readonly objectiveId: string;
  readonly objectiveDocumentId: string;
  readonly minimumObjectiveRevision: number;
  readonly maximumObjectiveRevision: number;
}

export interface MandateWorkSelectorV1 {
  readonly schemaVersion: 1;
  /** Empty means any Work Item under the exact selected Objective. */
  readonly workItemIds: readonly string[];
  readonly permittedRoleKeys: readonly string[];
  readonly maximumWorkItemRevision: number;
}

export interface MandateActionPatternV1 {
  readonly schemaVersion: 1;
  readonly namespace: string;
  readonly toolId: string;
  readonly operation: string;
}

export interface MandateBudgetPolicyV1 {
  readonly schemaVersion: 1;
  readonly totalBudgetUnits: number;
  readonly maximumWorkBudgetUnits: number;
  readonly maximumActionBudgetUnits: number;
  readonly maximumConcurrentWorkReservations: number;
  readonly maximumConcurrentActionReservations: number;
  readonly reservationLifetimeMs: number;
}

export interface MandateRoomProvenanceV1 {
  readonly schemaVersion: 1;
  readonly roomId: string;
  readonly approvalId: string;
  readonly targetType: "room" | "task" | "artifact" | "action";
  readonly targetId: string;
  readonly targetVersion: number | null;
}

export interface MandateEvidencePolicyV1 {
  readonly schemaVersion: 1;
  readonly redactionPolicyId: string;
  readonly retentionClass: string;
  readonly requireDurablePreDispatchEvidence: boolean;
}

export interface DelegationMandateStatementV1 {
  readonly schemaVersion: 1;
  readonly mandateId: string;
  readonly tenantId: string;
  readonly policyDomainId: string;
  readonly issuerId: string;
  readonly revision: number;
  readonly predecessorDigest: CollectiveDigestV1 | null;
  readonly subjectPeerIds: readonly string[];
  readonly objective: MandateObjectiveSelectorV1;
  readonly work: MandateWorkSelectorV1;
  readonly permittedCapabilityKeys: readonly string[];
  readonly permittedActions: readonly MandateActionPatternV1[];
  readonly budget: MandateBudgetPolicyV1;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly roomProvenance: MandateRoomProvenanceV1 | null;
  readonly evidence: MandateEvidencePolicyV1;
}

export type DelegationMandateProofV1 =
  | {
      readonly schemaVersion: 1;
      readonly kind: "issuer_signature";
      readonly issuerId: string;
      readonly keyId: string;
      readonly algorithm: "Ed25519";
      readonly signedDigest: CollectiveDigestV1;
      readonly signature: string;
    }
  | {
      readonly schemaVersion: 1;
      readonly kind: "local_attestation";
      readonly issuerId: string;
      readonly attestorId: string;
      readonly attestationId: string;
      readonly signedDigest: CollectiveDigestV1;
    };

export interface DelegationMandateV1 {
  readonly schemaVersion: 1;
  readonly statement: DelegationMandateStatementV1;
  readonly mandateDigest: CollectiveDigestV1;
  readonly proof: DelegationMandateProofV1;
}

/** Construction-bound verifier result; it installs no authority by itself. */
export interface DelegationProofVerificationV1 {
  readonly schemaVersion: 1;
  readonly verifierId: string;
  readonly verifierVersion: number;
  readonly issuerId: string;
  readonly signedDigest: CollectiveDigestV1;
  readonly verifiedAt: string;
  readonly status: "verified";
}

export interface DelegationRevocationStatementV1 {
  readonly schemaVersion: 1;
  readonly revocationId: string;
  readonly tenantId: string;
  readonly policyDomainId: string;
  readonly issuerId: string;
  readonly mandateId: string;
  readonly mandateDigest: CollectiveDigestV1;
  readonly minimumRevokedRevision: number;
  readonly generation: number;
  readonly effectiveAt: string;
  readonly reasonCode:
    | "operator_revoked"
    | "policy_superseded"
    | "scope_invalidated"
    | "security_response"
    | "issuer_retired";
}

export interface DelegationRevocationV1 {
  readonly schemaVersion: 1;
  readonly statement: DelegationRevocationStatementV1;
  readonly revocationDigest: CollectiveDigestV1;
  readonly proof: DelegationMandateProofV1;
}

export interface WorkContractMandateBindingV1 {
  readonly schemaVersion: 1;
  readonly mandateId: string;
  readonly mandateRevision: number;
  readonly mandateDigest: CollectiveDigestV1;
}

export interface WorkContractObjectiveBindingV1 {
  readonly schemaVersion: 1;
  readonly meshId: string;
  readonly objectiveId: string;
  readonly objectiveDocumentId: string;
  readonly objectiveRevision: number;
  readonly acceptedMessageId: string;
  readonly acceptedPolicyDigest: CollectiveDigestV1;
}

export interface WorkContractAssignmentBindingV1 {
  readonly schemaVersion: 1;
  readonly workItemId: string;
  readonly workItemRevision: number;
  readonly ownerPeerId: string;
  readonly assignedPeerId: string;
  readonly assignedInstanceId: string;
  readonly assignmentAuthorityId: string;
  readonly assignmentEpoch: number;
  readonly authorityGeneration: number;
  readonly fencingToken: string;
  readonly leaseExpiresAtLogicalMs: number;
  readonly workDeadline: string;
}

export type WorkContractStatusV1 =
  | "proposed"
  | "active"
  | "completing"
  | "completed"
  | "revoked"
  | "expired"
  | "released";

export interface WorkContractV1 {
  readonly schemaVersion: 1;
  readonly workContractId: string;
  readonly generation: number;
  readonly tenantId: string;
  readonly policyDomainId: string;
  readonly mandate: WorkContractMandateBindingV1;
  readonly objective: WorkContractObjectiveBindingV1;
  readonly assignment: WorkContractAssignmentBindingV1;
  readonly roleKey: string;
  readonly requiredCapabilityKeys: readonly string[];
  readonly completionCriteria: readonly string[];
  readonly inputReferenceDigest: CollectiveDigestV1 | null;
  readonly reservedBudgetUnits: number;
  readonly maximumActionBudgetUnits: number;
  readonly trustPolicyId: string;
  readonly inferencePolicyId: string;
  readonly createdAtLogicalMs: number;
  readonly updatedAtLogicalMs: number;
  readonly status: WorkContractStatusV1;
  readonly terminalReasonCode: string | null;
  readonly workContractDigest: CollectiveDigestV1;
}

export type BudgetReservationStatusV1 =
  "reserved" | "committed" | "released" | "indeterminate";

export interface BudgetReservationV1 {
  readonly schemaVersion: 1;
  readonly reservationId: string;
  readonly generation: number;
  readonly tenantId: string;
  readonly policyDomainId: string;
  readonly mandateId: string;
  readonly mandateRevision: number;
  readonly mandateDigest: CollectiveDigestV1;
  readonly workContractId: string;
  readonly permitId: string;
  readonly idempotencyKey: string;
  readonly units: number;
  readonly reservedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly status: BudgetReservationStatusV1;
  readonly outcomeId: string | null;
  readonly reservationDigest: CollectiveDigestV1;
}

export type GovernedActionPermitStatusV1 =
  | "issued"
  | "reserved"
  | "dispatching"
  | "dispatched"
  | "failed"
  | "indeterminate"
  | "expired";

export interface GovernedActionPermitV1 {
  readonly schemaVersion: 1;
  readonly permitId: string;
  readonly generation: number;
  readonly gatewayId: string;
  readonly tenantId: string;
  readonly policyDomainId: string;
  readonly mandateId: string;
  readonly mandateRevision: number;
  readonly mandateDigest: CollectiveDigestV1;
  readonly workContractId: string;
  readonly workContractDigest: CollectiveDigestV1;
  readonly actionGrantId: string;
  readonly actionGrantDigest: CollectiveDigestV1;
  readonly actionScopeDigest: CollectiveDigestV1;
  readonly assignmentAuthorityId: string;
  readonly assignedPeerId: string;
  readonly assignedInstanceId: string;
  readonly assignmentEpoch: number;
  readonly authorityGeneration: number;
  readonly fencingToken: string;
  readonly namespace: string;
  readonly toolId: string;
  readonly operation: string;
  readonly actionBindingId: string;
  readonly actionBindingVersion: number;
  readonly handlerDigest: CollectiveDigestV1;
  readonly inputDigest: CollectiveDigestV1;
  readonly assessmentDigest: CollectiveDigestV1;
  readonly trustDecisionDigest: CollectiveDigestV1;
  readonly budgetReservationId: string;
  readonly budgetUnits: number;
  readonly idempotencyKey: string;
  readonly issuedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly status: GovernedActionPermitStatusV1;
  readonly outcomeId: string | null;
  readonly permitDigest: CollectiveDigestV1;
}

export type CollectiveDecisionKindV1 =
  | "mandate.accept"
  | "mandate.revise"
  | "mandate.revoke"
  | "objective.accept"
  | "objective.reject"
  | "work.open"
  | "work.refresh"
  | "work.terminate"
  | "permit.issue"
  | "permit.reserve"
  | "effect.dispatch"
  | "effect.reconcile";

export interface CollectiveDecisionRecordV1 {
  readonly schemaVersion: 1;
  readonly recordId: string;
  readonly tenantId: string;
  readonly policyDomainId: string;
  readonly kind: CollectiveDecisionKindV1;
  readonly accepted: boolean;
  readonly reasonCode: string;
  readonly logicalTimeMs: number;
  readonly mandateId: string | null;
  readonly mandateDigest: CollectiveDigestV1 | null;
  readonly workContractId: string | null;
  readonly workContractDigest: CollectiveDigestV1 | null;
  readonly permitId: string | null;
  readonly permitDigest: CollectiveDigestV1 | null;
  readonly assignmentAuthorityId: string | null;
  readonly assignmentEpoch: number | null;
  readonly fencingToken: string | null;
  readonly budgetDeltaKind:
    "none" | "reserve" | "commit" | "release" | "retain_indeterminate";
  readonly budgetDeltaUnits: number;
  readonly inputDigest: CollectiveDigestV1 | null;
  readonly actionDigest: CollectiveDigestV1 | null;
  readonly assessmentDigest: CollectiveDigestV1 | null;
  readonly trustDecisionDigest: CollectiveDigestV1 | null;
  readonly previousRecordDigest: CollectiveDigestV1 | null;
  readonly recordDigest: CollectiveDigestV1;
}

export interface CollectiveAuthorityLimitsV1 {
  readonly maximumMandates: number;
  readonly maximumMandateRevisions: number;
  readonly maximumRevocations: number;
  readonly maximumWorkContracts: number;
  readonly maximumBudgetReservations: number;
  readonly maximumActionPermits: number;
  readonly maximumDecisionRecords: number;
}
