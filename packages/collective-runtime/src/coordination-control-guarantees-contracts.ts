import type { AgentPlatID } from "@agentplat/core";
import type { PlanningDigestV1 } from "@agentplat/collective-planning";

import type {
  CoordinationControlActionV1,
  CoordinationControlScopeV1,
} from "./coordination-control-contracts.js";

/** Contract for a bounded control guarantee and the planning target it admits. */
export const COORDINATION_CONTROL_GUARANTEE_SCHEMA_VERSION_V1 = 1 as const;
export const COORDINATION_CONTROL_GUARANTEE_STATE_FORMAT_V1 =
  "application/vnd.agentplat.coordination-control-guarantee-state.v1+json" as const;

export type CoordinationControlGuaranteeDispositionV1 = "allow" | "deny";
export type CoordinationControlGuaranteeStatusV1 =
  | "admitted"
  | "replan_required"
  | "blocked";

/**
 * A verified, content-free declaration from a local control plane. All
 * horizons are upper bounds, and all scores use basis points.
 */
export interface CoordinationControlGuaranteeV1 {
  readonly schemaVersion: 1;
  readonly guaranteeId: AgentPlatID;
  readonly scope: CoordinationControlScopeV1;
  readonly controlId: AgentPlatID;
  readonly controlVersion: number;
  readonly implementationId: AgentPlatID;
  readonly sourceRevision: number;
  readonly sourceRecordDigest: PlanningDigestV1;
  readonly coherenceHorizonMs: number;
  readonly alignmentBps: number;
  readonly coherenceBps: number;
  readonly agilityBps: number;
  readonly confidenceBps: number;
  readonly riskBps: number;
  readonly uncertaintyBps: number;
  readonly contextAssumptionDigests: readonly PlanningDigestV1[];
  readonly threatAssumptionDigests: readonly PlanningDigestV1[];
  readonly supportedCheckpointDigests: readonly PlanningDigestV1[];
  readonly supportedActions: readonly CoordinationControlActionV1[];
  readonly observedAtLogicalMs: number;
  readonly validUntilLogicalMs: number;
  readonly guaranteeDigest: PlanningDigestV1;
}

/** A planning-side target that must be satisfied before dispatch proceeds. */
export interface CoordinationControlTargetV1 {
  readonly schemaVersion: 1;
  readonly targetId: AgentPlatID;
  readonly scope: CoordinationControlScopeV1;
  readonly planningId: AgentPlatID;
  readonly planningRevision: number;
  readonly planningRecordDigest: PlanningDigestV1;
  readonly plannedHorizonMs: number;
  readonly minimumAlignmentBps: number;
  readonly minimumCoherenceBps: number;
  readonly minimumAgilityBps: number;
  readonly minimumConfidenceBps: number;
  readonly maximumRiskBps: number;
  readonly maximumUncertaintyBps: number;
  readonly requiredContextAssumptionDigests: readonly PlanningDigestV1[];
  readonly requiredThreatAssumptionDigests: readonly PlanningDigestV1[];
  readonly requiredCheckpointDigests: readonly PlanningDigestV1[];
  readonly requiredActions: readonly CoordinationControlActionV1[];
  readonly issuedAtLogicalMs: number;
  readonly validUntilLogicalMs: number;
  readonly targetDigest: PlanningDigestV1;
}

/** A durable, actionable result. `deny` is a dispatch gate, not advice. */
export interface CoordinationControlGuaranteeProposalV1 {
  readonly schemaVersion: 1;
  readonly proposalId: AgentPlatID;
  readonly scope: CoordinationControlScopeV1;
  readonly status: CoordinationControlGuaranteeStatusV1;
  readonly disposition: CoordinationControlGuaranteeDispositionV1;
  readonly action: "continue" | "pause_dispatch" | "request_replanning";
  readonly effectivePlanningWindowMs: number;
  readonly guaranteeDigest: PlanningDigestV1 | null;
  readonly targetDigest: PlanningDigestV1 | null;
  readonly reasonCodes: readonly string[];
  readonly evaluatedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly proposalDigest: PlanningDigestV1;
}

export interface CoordinationControlGuaranteeHeadV1 {
  readonly sourceId: AgentPlatID;
  readonly sourceRevision: number;
  readonly sourceRecordDigest: PlanningDigestV1;
  readonly recordDigest: PlanningDigestV1;
}

export interface CoordinationControlGuaranteeOutboxRecordV1 {
  readonly proposal: CoordinationControlGuaranteeProposalV1;
  readonly status: "pending" | "delivered" | "expired";
  /** Present exactly when an authenticated downstream delivery completed. */
  readonly receipt: CoordinationControlGuaranteeExecutionReceiptV1 | null;
}

export interface CoordinationControlGuaranteeExecutionControlBindingV1 {
  readonly controlId: AgentPlatID;
  readonly controlVersion: number;
  readonly implementationId: AgentPlatID;
}

/**
 * Content-addressed delivery receipt retained by the trusted dispatch sink.
 * Its digest identifies bytes; authenticity is established by the configured
 * receipt lookup port below.
 */
export interface CoordinationControlGuaranteeExecutionReceiptV1 {
  readonly schemaVersion: 1;
  readonly receiptId: AgentPlatID;
  readonly proposalId: AgentPlatID;
  readonly proposalDigest: PlanningDigestV1;
  readonly scope: CoordinationControlScopeV1;
  readonly controlBinding: CoordinationControlGuaranteeExecutionControlBindingV1;
  readonly deliveredAtLogicalMs: number;
  readonly receiptDigest: PlanningDigestV1;
}

export interface AuthenticatedCoordinationControlGuaranteeReceiptV1 {
  readonly proposal: CoordinationControlGuaranteeProposalV1;
  readonly receipt: CoordinationControlGuaranteeExecutionReceiptV1;
}

/**
 * Application-owned authentication boundary. A non-null result means the
 * exact proposal and delivery receipt were loaded from authoritative storage
 * and the receipt's issuer/authentication was verified for this consumer.
 */
export interface CoordinationControlGuaranteeReceiptLookupPortV1 {
  resolve(input: {
    readonly proposalDigest: PlanningDigestV1;
    readonly controlBinding: CoordinationControlGuaranteeExecutionControlBindingV1;
    readonly logicalTimeMs: number;
  }): Promise<AuthenticatedCoordinationControlGuaranteeReceiptV1 | null>;
}

export interface CoordinationControlGuaranteeTeamExecutionAdapterPortV1 {
  evidence(input: {
    readonly proposalDigest: PlanningDigestV1;
    readonly logicalTimeMs: number;
  }): Promise<import("./team-execution-contracts.js").TeamExecutionControlEvidenceV1 | null>;
}

export interface CoordinationControlGuaranteeStateV1 {
  readonly format: typeof COORDINATION_CONTROL_GUARANTEE_STATE_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly stateKey: AgentPlatID;
  readonly scope: CoordinationControlScopeV1;
  readonly policyDigest: PlanningDigestV1;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly guaranteeHead: CoordinationControlGuaranteeHeadV1 | null;
  readonly targetHead: CoordinationControlGuaranteeHeadV1 | null;
  readonly latestGuarantee: CoordinationControlGuaranteeV1 | null;
  readonly latestTarget: CoordinationControlTargetV1 | null;
  readonly lastProposal: CoordinationControlGuaranteeProposalV1 | null;
  readonly outbox: readonly CoordinationControlGuaranteeOutboxRecordV1[];
  readonly predecessorStateDigest: PlanningDigestV1 | null;
  readonly stateDigest: PlanningDigestV1;
}

export interface CoordinationControlGuaranteeAnchorV1 {
  readonly stateRevision: number;
  readonly stateDigest: PlanningDigestV1;
  readonly logicalTimeHighWaterMs: number;
}

export interface CoordinationControlGuaranteeStoreV1 {
  load(stateKey: AgentPlatID): Promise<CoordinationControlGuaranteeStateV1 | null>;
  save(input: {
    readonly state: CoordinationControlGuaranteeStateV1;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }): Promise<boolean>;
}

/** Independent monotonic witness for the replaceable state snapshot. */
export interface CoordinationControlGuaranteeAnchorPortV1 {
  load(anchorKey: AgentPlatID): Promise<CoordinationControlGuaranteeAnchorV1 | null>;
  save(input: {
    readonly anchorKey: AgentPlatID;
    readonly anchor: CoordinationControlGuaranteeAnchorV1;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }): Promise<boolean>;
}

/** Application-owned authentication boundary for locally published guarantees. */
export interface CoordinationControlGuaranteeVerificationPortV1 {
  verifyGuarantee(input: {
    readonly guarantee: CoordinationControlGuaranteeV1;
  }): Promise<boolean>;
  verifyTarget(input: {
    readonly target: CoordinationControlTargetV1;
  }): Promise<boolean>;
}

export interface CoordinationControlGuaranteeDispatchPortV1 {
  /**
   * Delivery is at-least-once. Implementations must durably deduplicate by
   * `proposal.proposalId` and return the original receipt on replay.
   */
  dispatch(input: {
    readonly proposal: CoordinationControlGuaranteeProposalV1;
  }): Promise<
    | { readonly status: "retry" }
    | {
        readonly status: "delivered";
        readonly receipt: CoordinationControlGuaranteeExecutionReceiptV1;
      }
  >;
}

export interface CoordinationControlGuaranteePolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  readonly maximumGuaranteeAgeMs: number;
  readonly maximumTargetAgeMs: number;
  readonly maximumProposalTtlMs: number;
  readonly maximumOutboxRecords: number;
  readonly maximumCommitAttempts: number;
}

export interface CoordinationControlGuaranteeRuntimeOptionsV1 {
  readonly stateKey: AgentPlatID;
  readonly anchorKey: AgentPlatID;
  readonly scope: CoordinationControlScopeV1;
  readonly policy: CoordinationControlGuaranteePolicyV1;
  readonly verification: CoordinationControlGuaranteeVerificationPortV1;
  readonly store: CoordinationControlGuaranteeStoreV1;
  readonly monotonicAnchor: CoordinationControlGuaranteeAnchorPortV1;
  readonly dispatch?: CoordinationControlGuaranteeDispatchPortV1;
}

export interface CoordinationControlGuaranteePortV1 {
  publishGuarantee(input: {
    readonly logicalTimeMs: number;
    readonly guarantee: CoordinationControlGuaranteeV1;
  }): Promise<CoordinationControlGuaranteeProposalV1>;
  publishTarget(input: {
    readonly logicalTimeMs: number;
    readonly target: CoordinationControlTargetV1;
  }): Promise<CoordinationControlGuaranteeProposalV1>;
  negotiate(input: {
    readonly logicalTimeMs: number;
  }): Promise<CoordinationControlGuaranteeProposalV1>;
  dispatchPending(logicalTimeMs: number): Promise<CoordinationControlGuaranteeProposalV1 | null>;
}
