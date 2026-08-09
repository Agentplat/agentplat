import type { PlanningDigestV1 } from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";

import type { TeamFormationScopeV1 } from "./team-formation-contracts.js";

/** V1 is an advisory coordination mechanism; it never creates execution authority. */
export const MECHANISM_ALLOCATION_SCHEMA_VERSION_V1 = 1 as const;
export const MECHANISM_ALLOCATION_STATE_FORMAT_V1 =
  "application/vnd.agentplat.mechanism-allocation-state.v1+json" as const;

export interface MechanismAllocationLimitsV1 {
  readonly maximumSlots: number;
  readonly maximumDecompositionProposals: number;
  readonly maximumBidsPerSlot: number;
  readonly maximumCommitments: number;
  readonly maximumReveals: number;
  readonly maximumAdmissions: number;
  readonly maximumRounds: number;
  readonly maximumCommitAttempts: number;
  readonly maximumRoundDurationLogicalMs: number;
}

/**
 * Incentive claim: with authenticated identities, binding hash commitments,
 * deterministic shared inputs and no side channels, a bidder cannot revise a
 * revealed bid after observing another reveal. This is not a collusion-proof
 * or strategy-proof mechanism.
 */
export interface MechanismAllocationPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly parentPolicyDigest: PlanningDigestV1 | null;
  readonly maximumTotalDeclaredCostUnits: number;
  readonly maximumTotalDeclaredBudgetUnits: number;
  readonly maximumResourceUnitsPerPeer: number;
  readonly maximumSlotsPerPeer: number;
  readonly maximumSlotsPerIndependenceGroup: number;
  readonly requireDistinctIndependenceGroups: boolean;
  readonly limits: MechanismAllocationLimitsV1;
}

export interface MechanismAllocationPolicyRecordV1 {
  readonly schemaVersion: 1;
  readonly policy: MechanismAllocationPolicyV1;
  readonly policyDigest: PlanningDigestV1;
}

/** Content-free mission reference, preserving the existing team scope binding. */
export interface MechanismMissionScopeV1 {
  readonly schemaVersion: 1;
  readonly missionId: AgentPlatID;
  readonly missionEpoch: number;
  readonly teamFormationScope: TeamFormationScopeV1;
  readonly planningDigest: PlanningDigestV1;
  readonly scopeDigest: PlanningDigestV1;
}

/** A semantic slot has only stable labels and constraints, never task content. */
export interface MechanismSemanticWorkSlotV1 {
  readonly schemaVersion: 1;
  readonly slotId: AgentPlatID;
  readonly semanticRoleKey: string;
  readonly requiredCapabilityKeys: readonly string[];
  readonly dependsOnSlotIds: readonly AgentPlatID[];
  readonly eligiblePeerIds: readonly AgentPlatID[];
  readonly eligibleIndependenceGroupIds: readonly AgentPlatID[];
  readonly requiredIndependenceGroupId: AgentPlatID | null;
  readonly budgetCeilingUnits: number;
  readonly slotDigest: PlanningDigestV1;
}

/** Bounded, peer-local decomposition proposal; it is not an instruction to execute. */
export interface MechanismMissionDecompositionProposalV1 {
  readonly schemaVersion: 1;
  readonly proposalId: AgentPlatID;
  readonly proposerPeerId: AgentPlatID;
  readonly proposerInstanceId: AgentPlatID;
  readonly proposerIndependenceGroupId: AgentPlatID;
  readonly scope: MechanismMissionScopeV1;
  readonly parentProposalDigest: PlanningDigestV1 | null;
  readonly causalEpoch: number;
  readonly observedAtLogicalMs: number;
  readonly validUntilLogicalMs: number;
  readonly slots: readonly MechanismSemanticWorkSlotV1[];
  readonly proposalDigest: PlanningDigestV1;
}

export interface MechanismAuctionRoundV1 {
  readonly schemaVersion: 1;
  readonly auctionId: AgentPlatID;
  readonly proposalDigest: PlanningDigestV1;
  readonly round: number;
  readonly causalEpoch: number;
  readonly openedAtLogicalMs: number;
  readonly commitDeadlineLogicalMs: number;
  readonly revealDeadlineLogicalMs: number;
  readonly roundDigest: PlanningDigestV1;
}

/** Sealed envelope. It intentionally carries no utility, resource, or slot value. */
export interface MechanismBidCommitmentV1 {
  readonly schemaVersion: 1;
  readonly commitmentId: AgentPlatID;
  readonly auctionDigest: PlanningDigestV1;
  readonly round: number;
  readonly bidderPeerId: AgentPlatID;
  readonly bidderInstanceId: AgentPlatID;
  readonly bidderIndependenceGroupId: AgentPlatID;
  /** Slot-bound seal prevents selectively revealing a precommitted alternative. */
  readonly slotId: AgentPlatID;
  readonly commitmentHash: PlanningDigestV1;
  readonly committedAtLogicalMs: number;
  readonly commitmentDigest: PlanningDigestV1;
}

/** A declared non-monetary utility/cost vector, revealed only after commitment. */
export interface MechanismBidRevealV1 {
  readonly schemaVersion: 1;
  readonly revealId: AgentPlatID;
  readonly commitmentId: AgentPlatID;
  readonly auctionDigest: PlanningDigestV1;
  readonly round: number;
  readonly bidderPeerId: AgentPlatID;
  readonly bidderInstanceId: AgentPlatID;
  readonly bidderIndependenceGroupId: AgentPlatID;
  readonly slotId: AgentPlatID;
  readonly declaredUtilityMicros: number;
  readonly declaredCostUnits: number;
  readonly declaredResourceUnits: number;
  readonly declaredBudgetUnits: number;
  readonly availabilityUntilLogicalMs: number;
  readonly nonceDigest: PlanningDigestV1;
  readonly revealedAtLogicalMs: number;
  readonly revealDigest: PlanningDigestV1;
}

export interface MechanismAllocationSelectionV1 {
  readonly schemaVersion: 1;
  readonly slotId: AgentPlatID;
  readonly revealId: AgentPlatID;
  readonly revealDigest: PlanningDigestV1;
  readonly bidderPeerId: AgentPlatID;
  readonly bidderInstanceId: AgentPlatID;
  readonly bidderIndependenceGroupId: AgentPlatID;
  readonly declaredUtilityMicros: number;
  readonly declaredCostUnits: number;
  readonly declaredResourceUnits: number;
  readonly declaredBudgetUnits: number;
  readonly selectionDigest: PlanningDigestV1;
}

export interface MechanismAllocationPlanV1 {
  readonly schemaVersion: 1;
  readonly planId: AgentPlatID;
  readonly auctionDigest: PlanningDigestV1;
  readonly proposalDigest: PlanningDigestV1;
  readonly round: number;
  readonly causalEpoch: number;
  readonly advisoryOnly: true;
  readonly selections: readonly MechanismAllocationSelectionV1[];
  readonly unallocatedSlotIds: readonly AgentPlatID[];
  readonly totalDeclaredCostUnits: number;
  readonly decidedAtLogicalMs: number;
  readonly planDigest: PlanningDigestV1;
}

export interface MechanismAllocationWithdrawalV1 {
  readonly schemaVersion: 1;
  readonly withdrawalId: AgentPlatID;
  readonly auctionDigest: PlanningDigestV1;
  readonly round: number;
  readonly peerId: AgentPlatID;
  readonly peerInstanceId: AgentPlatID;
  readonly peerIndependenceGroupId: AgentPlatID;
  readonly affectedSlotIds: readonly AgentPlatID[];
  readonly reasonCode: string;
  readonly observedAtLogicalMs: number;
  readonly withdrawalDigest: PlanningDigestV1;
}

export interface MechanismAllocationEquivocationV1 {
  readonly schemaVersion: 1;
  readonly peerId: AgentPlatID;
  readonly round: number;
  readonly kind: "commitment" | "reveal";
  readonly firstDigest: PlanningDigestV1;
  readonly conflictingDigest: PlanningDigestV1;
  readonly detectedAtLogicalMs: number;
}

/** Authenticated, membership-bound admission evidence; never execution authority. */
export interface MechanismAllocationAdmissionV1 {
  readonly schemaVersion: 1;
  readonly admissionId: AgentPlatID;
  readonly eventKind: MechanismAllocationEventV1["kind"];
  readonly eventDigest: PlanningDigestV1;
  readonly actorPeerId: AgentPlatID;
  readonly actorInstanceId: AgentPlatID;
  readonly actorIndependenceGroupId: AgentPlatID;
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly capabilityStateDigest: PlanningDigestV1;
  readonly authorizedCapabilityKeys: readonly string[];
  readonly authenticatedAtLogicalMs: number;
  readonly validUntilLogicalMs: number;
  readonly evidenceDigest: PlanningDigestV1;
  readonly admissionDigest: PlanningDigestV1;
}

export interface MechanismAllocationAdmittedEventV1 {
  readonly event: MechanismAllocationEventV1;
  readonly admission: MechanismAllocationAdmissionV1;
}

/** Provider-neutral authentication/membership/capability verifier. */
export interface MechanismAllocationAdmissionPortV1 {
  readonly admissionId: AgentPlatID;
  readonly admissionVersion: number;
  readonly implementationId: AgentPlatID;
  verify(input: {
    readonly event: MechanismAllocationEventV1;
    readonly admission: MechanismAllocationAdmissionV1;
    readonly requiredCapabilityKeys: readonly string[];
    readonly policyDigest: PlanningDigestV1;
  }): Promise<boolean>;
}

export interface MechanismAllocationStateV1 {
  readonly format: typeof MECHANISM_ALLOCATION_STATE_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly stateKey: AgentPlatID;
  readonly allocationId: AgentPlatID;
  readonly allocationVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policyDigest: PlanningDigestV1;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly proposal: MechanismMissionDecompositionProposalV1 | null;
  readonly auction: MechanismAuctionRoundV1 | null;
  readonly commitments: readonly MechanismBidCommitmentV1[];
  readonly reveals: readonly MechanismBidRevealV1[];
  readonly plan: MechanismAllocationPlanV1 | null;
  readonly withdrawals: readonly MechanismAllocationWithdrawalV1[];
  readonly equivocations: readonly MechanismAllocationEquivocationV1[];
  readonly admissions: readonly MechanismAllocationAdmissionV1[];
  /** Exact admitted events retained so authentication can be re-verified on restore. */
  readonly admittedEvents: readonly MechanismAllocationEventV1[];
  readonly predecessorStateDigest: PlanningDigestV1 | null;
  readonly stateDigest: PlanningDigestV1;
}

export type MechanismAllocationEventV1 =
  | {
      readonly kind: "proposal";
      readonly proposal: MechanismMissionDecompositionProposalV1;
    }
  | {
      readonly kind: "commitment";
      readonly commitment: MechanismBidCommitmentV1;
    }
  | { readonly kind: "reveal"; readonly reveal: MechanismBidRevealV1 }
  | {
      readonly kind: "clear";
      readonly logicalTimeMs: number;
      readonly clearingPeerId: AgentPlatID;
      readonly clearingInstanceId: AgentPlatID;
      readonly clearingIndependenceGroupId: AgentPlatID;
    }
  | {
      readonly kind: "withdrawal";
      readonly withdrawal: MechanismAllocationWithdrawalV1;
    };

/**
 * Production stores atomically compare revision and state digest and maintain a
 * monotonic rollback-resistant head outside the replaceable snapshot.
 */
export interface MechanismAllocationStoreV1 {
  load(stateKey: AgentPlatID): Promise<MechanismAllocationStateV1 | null>;
  save(input: {
    readonly state: MechanismAllocationStateV1;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }): Promise<boolean>;
}

export interface MechanismAllocationRuntimeOptionsV1 {
  readonly stateKey: AgentPlatID;
  readonly allocationId: AgentPlatID;
  readonly allocationVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policy: MechanismAllocationPolicyRecordV1;
  readonly store: MechanismAllocationStoreV1;
  readonly admission: MechanismAllocationAdmissionPortV1;
}

export interface MechanismAllocationPortV1 {
  readonly allocationId: AgentPlatID;
  readonly allocationVersion: number;
  readonly implementationId: AgentPlatID;
  readonly policyDigest: PlanningDigestV1;
  submit(
    input: MechanismAllocationAdmittedEventV1,
  ): Promise<MechanismAllocationStateV1>;
  loadState(): Promise<MechanismAllocationStateV1>;
}
