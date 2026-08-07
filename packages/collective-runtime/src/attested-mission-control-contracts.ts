import type { AgentPlatID } from "@agentplat/core";
import type { PlanningDigestV1 } from "@agentplat/collective-planning";

import type {
  GovernedMissionControlActionV1,
  GovernedMissionControlPortV1,
  GovernedMissionControlProposalV1,
  GovernedMissionScopeV1,
} from "./mission-lifecycle-contracts.js";

export const ATTESTED_MISSION_CONTROL_SCHEMA_VERSION_V1 = 1 as const;
export const ATTESTED_MISSION_CONTROL_STATE_FORMAT_V1 =
  "application/vnd.agentplat.attested-mission-control-state.v1+json" as const;

/**
 * Content-free policy for converting a verified control source into a
 * conservative mission-control advisory.
 */
export interface AttestedMissionControlPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  readonly sourceId: AgentPlatID;
  readonly sourceEpoch: number;
  readonly initialSequence: number;
  /** Number of contiguous healthy decisions required before `continue`. */
  readonly requiredHealthySteps: number;
  readonly maximumWindowMs: number;
  /** Largest verified forward jump that may establish a new high-water mark. */
  readonly maximumSequenceGap: number;
  readonly maximumRetainedDecisions: number;
  readonly maximumCommitAttempts: number;
  readonly discontinuityAction: "pause_dispatch" | "request_replanning";
}

/**
 * Signed or otherwise externally authenticated source decision. It contains
 * only identifiers, sequence coordinates and digests; raw observations are
 * never accepted by this adapter.
 */
export interface AttestedMissionControlDecisionV1 {
  readonly schemaVersion: 1;
  readonly proposalId: AgentPlatID;
  readonly scopeDigest: PlanningDigestV1;
  readonly authorityEpoch: number;
  readonly fenceDigest: PlanningDigestV1;
  readonly executionObservationDigest: PlanningDigestV1;
  readonly sourceId: AgentPlatID;
  readonly sourceEpoch: number;
  readonly sequence: number;
  readonly windowId: AgentPlatID;
  readonly windowOpenedAtLogicalMs: number;
  readonly evaluatedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly action: GovernedMissionControlActionV1;
  readonly decisionDigest: PlanningDigestV1;
}

/** Trust boundary implemented by an application-specific source adapter. */
export interface AttestedMissionControlSourceVerificationPortV1 {
  propose(input: {
    readonly scope: GovernedMissionScopeV1;
    readonly logicalTimeMs: number;
    readonly executionObservationDigest: PlanningDigestV1;
  }): Promise<AttestedMissionControlDecisionV1>;
  verify(input: {
    readonly decision: AttestedMissionControlDecisionV1;
    readonly policy: AttestedMissionControlPolicyV1;
  }): Promise<boolean>;
}

export interface AttestedMissionControlDecisionRecordV1 {
  readonly sequence: number;
  readonly windowId: AgentPlatID;
  readonly action: GovernedMissionControlActionV1;
  readonly decisionDigest: PlanningDigestV1;
}

export interface AttestedMissionControlStateV1 {
  readonly format: typeof ATTESTED_MISSION_CONTROL_STATE_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly stateKey: AgentPlatID;
  readonly tenantId: AgentPlatID;
  readonly missionId: AgentPlatID;
  readonly scopeDigest: PlanningDigestV1;
  readonly authorityEpoch: number;
  readonly fenceDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
  readonly sourceId: AgentPlatID;
  readonly sourceEpoch: number;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly sequenceHighWater: number | null;
  readonly activeWindowId: AgentPlatID | null;
  readonly activeWindowExpiresAtLogicalMs: number | null;
  readonly consecutiveHealthySteps: number;
  readonly discontinuityCount: number;
  readonly lastExecutionObservationDigest: PlanningDigestV1 | null;
  readonly lastDecisionDigest: PlanningDigestV1 | null;
  readonly lastProposal: GovernedMissionControlProposalV1 | null;
  readonly recentDecisions: readonly AttestedMissionControlDecisionRecordV1[];
  readonly predecessorStateDigest: PlanningDigestV1 | null;
  readonly stateDigest: PlanningDigestV1;
}

export interface AttestedMissionControlStoreV1 {
  load(stateKey: AgentPlatID): Promise<AttestedMissionControlStateV1 | null>;
  save(input: {
    readonly state: AttestedMissionControlStateV1;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }): Promise<boolean>;
}

export interface AttestedMissionControlAnchorV1 {
  readonly stateRevision: number;
  readonly stateDigest: PlanningDigestV1;
  readonly logicalTimeHighWaterMs: number;
}

/** Independent monotonic witness used to detect restored or rolled-back state. */
export interface AttestedMissionControlMonotonicAnchorPortV1 {
  load(anchorKey: AgentPlatID): Promise<AttestedMissionControlAnchorV1 | null>;
  save(input: {
    readonly anchorKey: AgentPlatID;
    readonly anchor: AttestedMissionControlAnchorV1;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }): Promise<boolean>;
}

export interface AttestedMissionControlRuntimeOptionsV1 {
  readonly stateKey: AgentPlatID;
  readonly anchorKey: AgentPlatID;
  readonly policy: AttestedMissionControlPolicyV1;
  readonly source: AttestedMissionControlSourceVerificationPortV1;
  readonly store: AttestedMissionControlStoreV1;
  readonly monotonicAnchor: AttestedMissionControlMonotonicAnchorPortV1;
}

/** The adapter is directly substitutable for the lifecycle control port. */
export type AttestedMissionControlPortV1 = GovernedMissionControlPortV1;
