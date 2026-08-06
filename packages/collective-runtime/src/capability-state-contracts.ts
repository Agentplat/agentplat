import type { AgentPlatID } from "@agentplat/core";
import type { PlanningDigestV1 } from "@agentplat/collective-planning";

export const CAPABILITY_STATE_SCHEMA_VERSION_V1 = 1 as const;
export const CAPABILITY_STATE_SNAPSHOT_FORMAT_V1 =
  "application/vnd.agentplat.capability-state-fusion.v1+json" as const;

export const CAPABILITY_STATE_OPERATIONS_V1 = Object.freeze([
  "offer_recipient",
  "bid",
  "award",
  "assignment_acceptance",
  "recovery",
] as const);

export type CapabilityStateOperationV1 =
  (typeof CAPABILITY_STATE_OPERATIONS_V1)[number];

export const CAPABILITY_STATE_DIMENSIONS_V1 = Object.freeze([
  "trust",
  "role",
  "capacity",
  "reachability",
  "recovery",
] as const);

export type CapabilityStateDimensionV1 =
  (typeof CAPABILITY_STATE_DIMENSIONS_V1)[number];

export type CapabilityStateDispositionV1 =
  "eligible" | "restricted" | "ineligible" | "unavailable";

export type CapabilityStateCandidateKindV1 = "peer" | "local_agent";

export interface CapabilityStateDimensionRequirementsV1 {
  readonly offer_recipient: readonly CapabilityStateDimensionV1[];
  readonly bid: readonly CapabilityStateDimensionV1[];
  readonly award: readonly CapabilityStateDimensionV1[];
  readonly assignment_acceptance: readonly CapabilityStateDimensionV1[];
  readonly recovery: readonly CapabilityStateDimensionV1[];
}

export interface CapabilityStatePolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly parentPolicyDigest: PlanningDigestV1 | null;
  readonly requiredDimensions: CapabilityStateDimensionRequirementsV1;
  readonly maximumCandidates: number;
  readonly maximumReasonCodesPerSignal: number;
  readonly maximumStateHeads: number;
  readonly maximumDecisionTtlMs: number;
  readonly maximumCommitAttempts: number;
}

export interface CapabilityStatePolicyRecordV1 {
  readonly schemaVersion: 1;
  readonly policy: CapabilityStatePolicyV1;
  readonly policyDigest: PlanningDigestV1;
}

/** Content-free candidate admitted by an existing discovery or local registry boundary. */
export interface CapabilityStateCandidateV1 {
  readonly schemaVersion: 1;
  readonly candidateId: AgentPlatID;
  readonly kind: CapabilityStateCandidateKindV1;
  readonly peerId: AgentPlatID;
  readonly instanceId: AgentPlatID;
  readonly agentId: AgentPlatID | null;
  readonly requiredCapabilityKeys: readonly string[];
  readonly advertisedCapabilityKeys: readonly string[];
  readonly sourceEvidenceDigest: PlanningDigestV1;
  readonly sourceRecordId: AgentPlatID | null;
  readonly sourceRevision: number;
  readonly candidateDigest: PlanningDigestV1;
}

export interface CapabilityStateFusionScopeV1 {
  readonly tenantId: AgentPlatID;
  readonly meshId: AgentPlatID;
  readonly policyDomainId: AgentPlatID;
  readonly missionIntentId: AgentPlatID;
  readonly objectiveId: AgentPlatID;
  readonly workItemId: AgentPlatID | null;
  readonly workItemRevision: number | null;
}

export interface CapabilityStateFusionRequestV1 {
  readonly schemaVersion: 1;
  readonly requestId: AgentPlatID;
  readonly operation: CapabilityStateOperationV1;
  readonly scope: CapabilityStateFusionScopeV1;
  readonly logicalTimeMs: number;
  readonly requiredCapabilityKeys: readonly string[];
  readonly candidates: readonly CapabilityStateCandidateV1[];
  readonly requestDigest: PlanningDigestV1;
}

/** One content-free, source-bound observation for one candidate dimension. */
export interface CapabilityStateSignalV1 {
  readonly schemaVersion: 1;
  readonly signalId: AgentPlatID;
  readonly candidateId: AgentPlatID;
  readonly candidateDigest: PlanningDigestV1;
  readonly dimension: CapabilityStateDimensionV1;
  readonly disposition: CapabilityStateDispositionV1;
  readonly sourceId: AgentPlatID;
  readonly sourceVersion: number;
  readonly sourceImplementationDigest: PlanningDigestV1;
  readonly sourceRevision: number;
  readonly reasonCodes: readonly string[];
  readonly observedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly signalDigest: PlanningDigestV1;
}

export interface CapabilityStateHeadV1 {
  readonly schemaVersion: 1;
  readonly headKey: string;
  readonly candidateId: AgentPlatID;
  readonly dimension: CapabilityStateDimensionV1;
  readonly sourceId: AgentPlatID;
  readonly sourceVersion: number;
  readonly sourceImplementationDigest: PlanningDigestV1;
  readonly sourceRevision: number;
  readonly signalDigest: PlanningDigestV1;
  readonly expiresAtLogicalMs: number;
}

export interface CapabilityStateFusionStateV1 {
  readonly format: typeof CAPABILITY_STATE_SNAPSHOT_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly stateKey: AgentPlatID;
  readonly fusionId: AgentPlatID;
  readonly fusionVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly heads: readonly CapabilityStateHeadV1[];
  readonly lastDecisionDigest: PlanningDigestV1 | null;
  readonly stateDigest: PlanningDigestV1;
}

export interface CapabilityStateCandidateDecisionV1 {
  readonly schemaVersion: 1;
  readonly candidateId: AgentPlatID;
  readonly candidateDigest: PlanningDigestV1;
  readonly disposition: CapabilityStateDispositionV1;
  readonly reasonCodes: readonly string[];
  readonly signalDigests: readonly PlanningDigestV1[];
}

export interface CapabilityStateFusionDecisionV1 {
  readonly schemaVersion: 1;
  readonly decisionId: AgentPlatID;
  readonly fusionId: AgentPlatID;
  readonly fusionVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  readonly requestId: AgentPlatID;
  readonly requestDigest: PlanningDigestV1;
  readonly operation: CapabilityStateOperationV1;
  readonly evaluatedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly priorStateRevision: number;
  readonly committedStateRevision: number;
  readonly candidates: readonly CapabilityStateCandidateDecisionV1[];
  readonly decisionDigest: PlanningDigestV1;
}

export interface CapabilityStateResolutionPortV1 {
  resolve(input: {
    readonly request: CapabilityStateFusionRequestV1;
    readonly candidate: CapabilityStateCandidateV1;
    readonly requiredDimensions: readonly CapabilityStateDimensionV1[];
  }): Promise<readonly CapabilityStateSignalV1[]>;
}

/** Atomic revision-checked state boundary. */
export interface CapabilityStateStoreV1 {
  load(stateKey: AgentPlatID): Promise<CapabilityStateFusionStateV1 | null>;
  save(input: {
    readonly state: CapabilityStateFusionStateV1;
    readonly expectedRevision: number | null;
  }): Promise<boolean>;
}

export interface CapabilityStateFusionRuntimeOptionsV1 {
  readonly stateKey: AgentPlatID;
  readonly fusionId: AgentPlatID;
  readonly fusionVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policy: CapabilityStatePolicyRecordV1;
  readonly resolver: CapabilityStateResolutionPortV1;
  readonly store: CapabilityStateStoreV1;
}

/** Construction-bound port consumed by productive peer nodes. */
export interface CapabilityStateFusionPortV1 {
  readonly fusionId: AgentPlatID;
  readonly fusionVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  evaluate(
    request: CapabilityStateFusionRequestV1,
  ): Promise<CapabilityStateFusionDecisionV1>;
}

export interface CapabilityStateSignalSourceV1 {
  readonly dimension: CapabilityStateDimensionV1;
  resolve(input: {
    readonly request: CapabilityStateFusionRequestV1;
    readonly candidate: CapabilityStateCandidateV1;
  }): Promise<CapabilityStateSignalV1 | null>;
}

export interface CapabilityStateReductionInputV1 {
  readonly state: CapabilityStateFusionStateV1;
  readonly policy: CapabilityStatePolicyRecordV1;
  readonly request: CapabilityStateFusionRequestV1;
  readonly signals: readonly CapabilityStateSignalV1[];
}

export interface CapabilityStateReductionResultV1 {
  readonly state: CapabilityStateFusionStateV1;
  readonly decision: CapabilityStateFusionDecisionV1;
}
