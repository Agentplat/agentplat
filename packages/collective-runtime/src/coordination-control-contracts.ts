import type { AgentPlatID } from "@agentplat/core";
import type { PlanningDigestV1 } from "@agentplat/collective-planning";

/** Provider-neutral, advisory-only coordination control contracts. */
export const COORDINATION_CONTROL_SCHEMA_VERSION_V1 = 1 as const;
export const COORDINATION_CONTROL_STATE_FORMAT_V1 =
  "application/vnd.agentplat.coordination-control-state.v1+json" as const;

export const COORDINATION_CONTROL_ACTIONS_V1 = Object.freeze([
  "continue",
  "pause_dispatch",
  "restrict_participation",
  "request_role_transition",
  "request_work_reassignment",
  "request_team_adaptation",
  "request_replanning",
] as const);

export type CoordinationControlActionV1 =
  (typeof COORDINATION_CONTROL_ACTIONS_V1)[number];

export interface CoordinationControlScopeV1 {
  readonly tenantId: AgentPlatID;
  readonly coordinationId: AgentPlatID;
  readonly missionIntentId: AgentPlatID;
  readonly teamId: AgentPlatID | null;
  readonly workItemId: AgentPlatID | null;
}

/**
 * A content-free projection of local inference-control and collective outcome
 * evidence. Scores use basis points; the original records remain with their
 * owning subsystem.
 */
export interface CoordinationControlEvidenceV1 {
  readonly schemaVersion: 1;
  readonly evidenceId: AgentPlatID;
  readonly scope: CoordinationControlScopeV1;
  readonly sourceId: AgentPlatID;
  readonly sourceVersion: number;
  readonly sourceImplementationDigest: PlanningDigestV1;
  readonly sourceRevision: number;
  readonly sourceRecordDigest: PlanningDigestV1;
  readonly roleAlignmentBps: number;
  readonly roleCoherenceBps: number;
  readonly contextIntegrityBps: number;
  readonly contextUncertaintyBps: number;
  readonly trustBps: number;
  readonly capabilityBps: number;
  readonly executionHealthBps: number;
  readonly teamHealthBps: number;
  readonly outcomeConfidenceBps: number;
  readonly observedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly evidenceDigest: PlanningDigestV1;
}

export interface CoordinationControlSourceBindingV1 {
  readonly sourceId: AgentPlatID;
  readonly sourceVersion: number;
  readonly sourceImplementationDigest: PlanningDigestV1;
}

/** A provider-neutral authenticated registration returned by a source registry. */
export interface CoordinationControlRegisteredSourceV1 {
  readonly sourceId: AgentPlatID;
  readonly sourceVersion: number;
  readonly sourceImplementationDigest: PlanningDigestV1;
}

/**
 * Authentication and source resolution boundary. Implementations verify the
 * caller's credentials or signature and resolve it against this registry before
 * returning a registration. Returning null is an authentication failure.
 */
export interface CoordinationControlEvidenceResolutionPortV1 {
  readonly registryId: AgentPlatID;
  readonly registryVersion: number;
  readonly registryDigest: PlanningDigestV1;
  resolve(input: {
    readonly evidence: CoordinationControlEvidenceV1;
  }): Promise<CoordinationControlRegisteredSourceV1 | null>;
}

export interface CoordinationControlThresholdsV1 {
  readonly minimumRoleAlignmentBps: number;
  readonly minimumRoleCoherenceBps: number;
  readonly minimumContextIntegrityBps: number;
  readonly maximumContextUncertaintyBps: number;
  readonly minimumTrustBps: number;
  readonly minimumCapabilityBps: number;
  readonly minimumExecutionHealthBps: number;
  readonly minimumTeamHealthBps: number;
  readonly minimumOutcomeConfidenceBps: number;
}

export interface CoordinationControlLimitsV1 {
  readonly maximumEvidenceSources: number;
  readonly maximumOutboxRecords: number;
  readonly maximumCommitAttempts: number;
  readonly maximumProposalTtlMs: number;
}

export interface CoordinationControlPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  /** Exact source registry expected by the authentication/resolution port. */
  readonly sourceRegistryDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
  readonly sourceBindings: readonly CoordinationControlSourceBindingV1[];
  readonly minimumEvidenceSources: number;
  readonly freshnessWindowMs: number;
  readonly cooldownMs: number;
  readonly hysteresisBps: number;
  readonly thresholds: CoordinationControlThresholdsV1;
  readonly limits: CoordinationControlLimitsV1;
}

export interface CoordinationControlProposalV1 {
  readonly schemaVersion: 1;
  readonly proposalId: AgentPlatID;
  readonly scope: CoordinationControlScopeV1;
  readonly action: CoordinationControlActionV1;
  readonly reasonCodes: readonly string[];
  readonly evidenceDigests: readonly PlanningDigestV1[];
  readonly evaluatedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly advisoryOnly: true;
  readonly proposalDigest: PlanningDigestV1;
}

export interface CoordinationControlSourceHeadV1 {
  readonly sourceId: AgentPlatID;
  readonly sourceRevision: number;
  readonly sourceRecordDigest: PlanningDigestV1;
  /** Digest of the exact bounded projection accepted at this revision. */
  readonly evidenceDigest: PlanningDigestV1;
}

export interface CoordinationControlOutboxRecordV1 {
  readonly proposal: CoordinationControlProposalV1;
  /** Expiry is an explicit non-delivery outcome, never an acknowledgement. */
  readonly status: "pending" | "delivered" | "expired";
}

export interface CoordinationControlStateV1 {
  readonly format: typeof COORDINATION_CONTROL_STATE_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly stateKey: AgentPlatID;
  readonly coordinationId: AgentPlatID;
  readonly policyDigest: PlanningDigestV1;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly sourceHeads: readonly CoordinationControlSourceHeadV1[];
  readonly lastProposal: CoordinationControlProposalV1 | null;
  readonly lastActionAtLogicalMs: number | null;
  readonly outbox: readonly CoordinationControlOutboxRecordV1[];
  readonly predecessorStateDigest: PlanningDigestV1 | null;
  readonly stateDigest: PlanningDigestV1;
}

/**
 * Production stores atomically compare revision and state digest and maintain a
 * monotonic rollback-resistant head outside the replaceable snapshot.
 */
export interface CoordinationControlStoreV1 {
  load(stateKey: AgentPlatID): Promise<CoordinationControlStateV1 | null>;
  save(input: {
    readonly state: CoordinationControlStateV1;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }): Promise<boolean>;
}

/** Delivery consumes a proposal; it cannot execute work or alter assignments. */
export interface CoordinationControlDispatchPortV1 {
  dispatch(input: {
    readonly proposal: CoordinationControlProposalV1;
  }): Promise<{
    readonly status: "delivered" | "retry";
  }>;
}

export interface CoordinationControlRuntimeOptionsV1 {
  readonly stateKey: AgentPlatID;
  readonly coordinationId: AgentPlatID;
  readonly policy: CoordinationControlPolicyV1;
  readonly evidenceResolution: CoordinationControlEvidenceResolutionPortV1;
  readonly store: CoordinationControlStoreV1;
  readonly dispatch?: CoordinationControlDispatchPortV1;
}

/** Narrow host-facing port; no concrete runtime or authority is exposed. */
export interface CoordinationControlPortV1 {
  evaluate(input: {
    readonly logicalTimeMs: number;
    readonly evidence: readonly CoordinationControlEvidenceV1[];
  }): Promise<CoordinationControlProposalV1>;
  dispatchPending(
    logicalTimeMs: number,
  ): Promise<CoordinationControlProposalV1 | null>;
}
