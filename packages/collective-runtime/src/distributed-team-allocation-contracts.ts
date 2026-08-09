import type { AgentPlatID } from "@agentplat/core";
import type { PlanningDigestV1 } from "@agentplat/collective-planning";
import type { CollectiveDecisionPortV1, CollectiveDecisionScopeV1, CollectiveDecisionV1 } from "./collective-decision-contracts.js";
import type { MechanismAllocationAdmittedEventV1, MechanismAllocationEventV1, MechanismAllocationPlanV1, MechanismAllocationPortV1, MechanismAllocationStateV1, MechanismMissionDecompositionProposalV1 } from "./mechanism-allocation-contracts.js";
import type { JointWorkContractV1, TeamCandidateV1, TeamFormationDecisionV1, TeamFormationRequestInvalidationV1, TeamFormationRequestV1, TeamFormationScopeV1, TeamFormationStateV1, TeamPositionV1, TeamRecordV1 } from "./team-formation-contracts.js";
import type { WorkContractV1 } from "@agentplat/collective-control/mesh";

export const DISTRIBUTED_TEAM_ALLOCATION_STATE_FORMAT_V2 = "application/vnd.agentplat.distributed-team-allocation-state.v2+json" as const;
export type DistributedTeamAllocationPhaseV2 = "proposal_pending" | "awaiting_allocation" | "decision_pending" | "formation_pending" | "activation_pending" | "reallocation_pending" | "active" | "blocked";

/** Planning projection supplied by a distributed planner; it contains no allocation authority. */
export interface DistributedTeamAllocationPlanningV2 {
  readonly planningId: AgentPlatID;
  readonly planningRevision: number;
  readonly planningDigest: PlanningDigestV1;
  readonly scope: TeamFormationScopeV1;
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly positions: readonly TeamPositionV1[];
  readonly validUntilLogicalMs: number;
}

/** Coordinates a certified team-roster decision with the allocation plan. */
export interface DistributedTeamAllocationDecisionBindingV2 {
  readonly scope: CollectiveDecisionScopeV1;
  readonly epoch: number;
  readonly membershipDigest: PlanningDigestV1;
  readonly membershipMemberIds: readonly AgentPlatID[];
  readonly proposerId: AgentPlatID;
}

/** Authenticated mechanism event factory. This coordinator never fabricates admissions. */
export interface DistributedTeamAllocationEventPortV2 {
  admit(input: { readonly event: MechanismAllocationEventV1; readonly allocationState: MechanismAllocationStateV1 }): Promise<MechanismAllocationAdmittedEventV1>;
  clear(input: { readonly allocationState: MechanismAllocationStateV1; readonly logicalTimeMs: number }): Promise<MechanismAllocationAdmittedEventV1>;
  withdrawal(input: { readonly allocationState: MechanismAllocationStateV1; readonly plan: MechanismAllocationPlanV1; readonly reasonCode: string; readonly logicalTimeMs: number }): Promise<MechanismAllocationAdmittedEventV1>;
}

export interface DistributedTeamAllocationCandidatePortV2 {
  resolve(input: { readonly selection: MechanismAllocationPlanV1["selections"][number]; readonly position: TeamPositionV1; readonly allocationPlan: MechanismAllocationPlanV1; readonly logicalTimeMs: number }): Promise<TeamCandidateV1>;
}

/** Formation is deliberately coordination-only; authority crosses activation below. */
export interface DistributedTeamAllocationFormationPortV2 {
  form(request: TeamFormationRequestV1): Promise<TeamFormationDecisionV1>;
  /** Durable request tombstone committed before saga authorization is cleared. */
  invalidate(input: {
    readonly formationRequestDigest: PlanningDigestV1;
    readonly formationAuthorizationDigest: PlanningDigestV1;
    readonly reasonCode: string;
    readonly logicalTimeMs: number;
    readonly requestValidUntilLogicalMs: number;
  }): Promise<TeamFormationRequestInvalidationV1>;
  /** CAS-fenced cancellation; never cancels a concurrently replaced proposal. */
  cancel(input: {
    readonly reasonCode: string;
    readonly logicalTimeMs: number;
    readonly expectedProposalDigest: PlanningDigestV1;
  }): Promise<TeamRecordV1>;
  /** Strongly consistent; current Team proposal is the reconciliation source. */
  loadState(): Promise<TeamFormationStateV1>;
}

export interface DistributedTeamAllocationWorkContractPortV2 {
  resolve(input: { readonly allocationPlan: MechanismAllocationPlanV1; readonly logicalTimeMs: number }): Promise<readonly WorkContractV1[]>;
}

/** Exact allocation coordinates that an effect boundary must consume atomically. */
export interface DistributedTeamAllocationFenceV2 {
  readonly allocationStateDigest: PlanningDigestV1;
  readonly auctionDigest: PlanningDigestV1;
  readonly allocationRound: number;
  readonly allocationPlanDigest: PlanningDigestV1;
}

export interface DistributedTeamAllocationActivationContextV2 {
  readonly fence: DistributedTeamAllocationFenceV2;
  readonly formationAuthorizationDigest: PlanningDigestV1;
  readonly formationRequestDigest: PlanningDigestV1;
  readonly proposalDigest: PlanningDigestV1;
}

/**
 * Fenced, idempotent activation boundary. Production implementations atomically
 * reject a non-current allocation fence before committing Team authority.
 */
export interface DistributedTeamAllocationActivationPortV2 {
  /** Strongly consistent lookup; stale/expired fences remain queryable for cleanup. */
  reconcile(input: DistributedTeamAllocationActivationContextV2 & {
    readonly logicalTimeMs: number;
  }): Promise<JointWorkContractV1 | null>;
  activate(input: DistributedTeamAllocationActivationContextV2 & {
    readonly workContracts: readonly WorkContractV1[];
    readonly logicalTimeMs: number;
  }): Promise<JointWorkContractV1>;
  /**
   * Idempotent for one cancellationId, including when no activation exists.
   * The supplied fence identifies the effect and must not prevent cancellation
   * merely because that fence has since become stale. Implementations cancel
   * only the exact proposalDigest + jointWorkContractDigest pair.
   */
  cancel(input: DistributedTeamAllocationActivationContextV2 & {
    readonly cancellationId: AgentPlatID;
    readonly jointWorkContractDigest: PlanningDigestV1;
    readonly reasonCode: string;
    readonly logicalTimeMs: number;
  }): Promise<void>;
}

export interface DistributedTeamAllocationStateV2 {
  readonly format: typeof DISTRIBUTED_TEAM_ALLOCATION_STATE_FORMAT_V2;
  readonly schemaVersion: 2;
  readonly stateKey: AgentPlatID;
  readonly planningDigest: PlanningDigestV1;
  readonly proposalDigest: PlanningDigestV1;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly phase: DistributedTeamAllocationPhaseV2;
  readonly allocationStateDigest: PlanningDigestV1 | null;
  readonly allocationAuctionDigest: PlanningDigestV1 | null;
  readonly allocationRound: number | null;
  readonly allocationPlanDigest: PlanningDigestV1 | null;
  /** Exact certified roster decision retained for authenticated crash replay. */
  readonly decision: CollectiveDecisionV1 | null;
  readonly decisionDigest: PlanningDigestV1 | null;
  /** Durable idempotency identity prepared before invoking Team Formation. */
  readonly formationRequestId: AgentPlatID | null;
  /** Stable request timestamp; retries use current time only for freshness checks. */
  readonly formationRequestLogicalTimeMs: number | null;
  /** Exact canonical command retained before `formation.form` for crash replay. */
  readonly formationRequest: TeamFormationRequestV1 | null;
  readonly formationRequestDigest: PlanningDigestV1 | null;
  /** Digest binding the certified decision, exact allocation fence and formation command. */
  readonly formationAuthorizationDigest: PlanningDigestV1 | null;
  readonly formationProposalDigest: PlanningDigestV1 | null;
  readonly jointWorkContractDigest: PlanningDigestV1 | null;
  readonly reallocationCount: number;
  readonly lastReasonCode: string | null;
  readonly predecessorStateDigest: PlanningDigestV1 | null;
  readonly stateDigest: PlanningDigestV1;
}

export interface DistributedTeamAllocationStoreV2 {
  load(stateKey: AgentPlatID): Promise<DistributedTeamAllocationStateV2 | null>;
  save(input: { readonly state: DistributedTeamAllocationStateV2; readonly expectedRevision: number | null; readonly expectedStateDigest: PlanningDigestV1 | null }): Promise<boolean>;
}

export interface DistributedTeamAllocationRuntimeOptionsV2 {
  readonly stateKey: AgentPlatID;
  readonly planning: DistributedTeamAllocationPlanningV2;
  readonly proposal: MechanismMissionDecompositionProposalV1;
  readonly decisionBinding: DistributedTeamAllocationDecisionBindingV2;
  readonly allocation: MechanismAllocationPortV1;
  readonly decision: CollectiveDecisionPortV1;
  readonly formation: DistributedTeamAllocationFormationPortV2;
  readonly events: DistributedTeamAllocationEventPortV2;
  readonly candidates: DistributedTeamAllocationCandidatePortV2;
  readonly workContracts: DistributedTeamAllocationWorkContractPortV2;
  readonly activation: DistributedTeamAllocationActivationPortV2;
  readonly store: DistributedTeamAllocationStoreV2;
  readonly maximumCommitAttempts: number;
}

export interface DistributedTeamAllocationPortV2 {
  advance(input: { readonly logicalTimeMs: number }): Promise<DistributedTeamAllocationStateV2>;
  loadState(): Promise<DistributedTeamAllocationStateV2>;
}
