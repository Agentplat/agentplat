import type { AgentPlatID, Metadata, TenantContext } from "@agentplat/core";
import type {
  PlanningMeshInboundProcessorV1,
  PlanningMeshInboundRuntimeStateV1,
  PlanningFragmentRepositoryV1,
} from "@agentplat/collective-planning/mesh";
import type {
  AdaptiveRoleBindingV1,
  PlanningDigestV1,
} from "@agentplat/collective-planning";
import type {
  DelegationMandateV1,
  WorkContractV1,
} from "@agentplat/collective-control";
import type {
  MeshAuthorityCurrentBindingV1,
  MeshAuthorityCurrentnessDecisionV1,
  MeshAuthorityScopeV1,
} from "@agentplat/mesh/continuity";
import type {
  MeshDurableLocalTransitionRepository,
  MeshDurableOutboxDeliver,
  MeshDurableReceiveResult,
  MeshDurableScope,
  MeshDurableWorkerDiagnostic,
  MeshDurableWorkerRunResult,
} from "@agentplat/mesh/durability";
import type { MeshEnvelopeSigner } from "@agentplat/mesh-crypto";
import type {
  MeshSignatureAlgorithm,
  MeshWireVersion,
  SignedMeshEnvelope,
} from "@agentplat/mesh-protocol";
import type {
  PortableAgentActionProposalV1,
  PortableAgentObservationV1,
  PortableAgentStepRequestV1,
} from "@agentplat/runtime/adapter";

import type {
  CollectivePeerAgentBindingV1,
  CollectivePeerRuntimeOptionsV1,
} from "./peer-contracts.js";
import type { CollectivePeerRuntimeV1 } from "./peer-runtime.js";

export const COLLECTIVE_PEER_NODE_SCHEMA_VERSION = 1 as const;
export const COLLECTIVE_PEER_NODE_SNAPSHOT_FORMAT =
  "application/vnd.agentplat.collective-peer-node.v1+json" as const;
export const COLLECTIVE_PEER_OWNER_CONTINUITY_EXTENSION_V1 =
  "agentplat.collective.owner-continuity.v1" as const;
export const COLLECTIVE_PEER_RECOVERY_ELECTION_EXTENSION_V1 =
  "agentplat.collective.recovery-election.v1" as const;

export interface CollectivePeerNodeScopeV1 extends MeshDurableScope {
  readonly policyDomainId: AgentPlatID;
  readonly missionIntentId: AgentPlatID;
}

export interface CollectivePeerNodeClockReadingV1 {
  readonly wallTime: string;
  readonly logicalTimeMs: number;
}

export interface CollectivePeerNodeClockV1 {
  now(): CollectivePeerNodeClockReadingV1;
}

export interface CollectivePeerNodeAgentRegistrationV1 {
  readonly binding: CollectivePeerAgentBindingV1;
  /** Capabilities this concrete local agent can accept from Mesh offers. */
  readonly capabilityKeys: readonly string[];
  readonly maximumConcurrency?: number;
  readonly metadata?: Metadata;
}

export interface CollectivePeerNodeControlBindingV1 {
  readonly controlId: AgentPlatID;
  readonly controlVersion: number;
  readonly implementationId: AgentPlatID;
}

export interface CollectivePeerNodeSigningV1 {
  readonly signer: MeshEnvelopeSigner;
  readonly privateKey: CryptoKey;
  readonly keyId: AgentPlatID;
  readonly algorithm: MeshSignatureAlgorithm;
  readonly wireVersion: MeshWireVersion;
}

export interface CollectivePeerNodeStoredStateV1 {
  readonly format: typeof COLLECTIVE_PEER_NODE_SNAPSHOT_FORMAT;
  readonly schemaVersion: typeof COLLECTIVE_PEER_NODE_SCHEMA_VERSION;
  readonly scope: CollectivePeerNodeScopeV1;
  readonly outboundSequence: number;
  readonly runtime: PlanningMeshInboundRuntimeStateV1;
  readonly releases: readonly CollectivePeerNodeExecutionReleaseV1[];
}

export interface CollectivePeerNodeSnapshotV1 {
  readonly schemaVersion: typeof COLLECTIVE_PEER_NODE_SCHEMA_VERSION;
  readonly durableRevision: number;
  readonly durableStateDigest: string;
  readonly committedAt: string;
  readonly state: CollectivePeerNodeStoredStateV1;
}

export interface CollectivePeerNodeReceiveInputV1 {
  readonly envelope: SignedMeshEnvelope;
}

export type CollectivePeerNodeReceiveOutcomeV1 = MeshDurableReceiveResult;

export interface CollectivePeerNodePlanInputV1 {
  readonly agentId: AgentPlatID;
  readonly stepId: AgentPlatID;
  readonly logicalTimeMs: number;
  readonly tenant?: TenantContext;
  readonly credentials?: Readonly<Record<string, string>>;
  readonly metadata?: Metadata;
  readonly signal?: AbortSignal;
}

export type CollectivePeerNodePlanOutcomeV1 =
  | {
      readonly status: "abstained" | "refused" | "paused" | "failed";
      readonly reasonCode: string;
      readonly durableRevision: number;
    }
  | {
      readonly status: "recorded" | "pending_recipients" | "offered";
      readonly proposalDigest: string;
      readonly fragmentDigest: string | null;
      readonly workItemId: string | null;
      readonly recipientPeerIds: readonly string[];
      readonly durableRevision: number;
    };

export type CollectivePeerNodeReconcileOutcomeV1 =
  | {
      readonly status: "idle";
      readonly durableRevision: number;
    }
  | {
      readonly status:
        | "timer_fired"
        | "bid_submitted"
        | "award_issued"
        | "assignment_accepted"
        | "work_reoffered"
        | "recovery_proposed"
        | "recovery_voted"
        | "recovery_certified"
        | "recovery_awarded"
        | "lease_renewed";
      readonly recordId: string;
      readonly durableRevision: number;
    };

export interface CollectivePeerNodeRunOutcomeV1 {
  readonly transport: MeshDurableWorkerRunResult;
  readonly reconciliation: CollectivePeerNodeReconcileOutcomeV1;
}

export interface CollectivePeerNodeActionResolutionV1 {
  readonly effectId: AgentPlatID;
  readonly actionId: AgentPlatID;
  readonly actionDigest: string;
  readonly status: "dispatched" | "failed" | "indeterminate";
  readonly outcomeId: AgentPlatID;
  readonly reasonCode: string | null;
}

export interface CollectivePeerNodeActionPortV1 {
  execute(input: {
    /** Stable retry key; return the previously persisted resolution on replay. */
    readonly effectId: AgentPlatID;
    readonly workContract: WorkContractV1;
    readonly roleBinding: AdaptiveRoleBindingV1;
    readonly continuityBinding: MeshAuthorityCurrentBindingV1;
    readonly assignmentConfirmation: CollectivePeerNodeAssignmentConfirmationV1;
    readonly proposal: PortableAgentActionProposalV1;
    readonly logicalTimeMs: number;
  }): Promise<CollectivePeerNodeActionResolutionV1>;
}

/** Aggregate semantic acknowledgement from the owner and recovery quorum. */
export interface CollectivePeerNodeAssignmentConfirmationV1 {
  readonly schemaVersion: 1;
  readonly confirmationId: AgentPlatID;
  readonly ownerPeerId: AgentPlatID;
  readonly acceptanceId: AgentPlatID;
  readonly assignmentAuthorityId: AgentPlatID;
  readonly assignmentEpoch: number;
  readonly fencingToken: AgentPlatID;
  readonly leaseRenewalId: AgentPlatID | null;
  readonly confirmedLeaseExpiresAt: string;
  readonly confirmedWitnessPeerIds: readonly AgentPlatID[];
  readonly confirmedAtLogicalMs: number;
}

export interface CollectivePeerNodeAssignmentConfirmationPortV1 {
  /** Resolve only after owner and threshold witnesses accepted the evidence. */
  confirm(input: {
    readonly workContract: WorkContractV1;
    readonly acceptanceMessageId: AgentPlatID;
    readonly latestLeaseRenewalId: AgentPlatID | null;
    readonly eligibleWitnessPeerIds: readonly AgentPlatID[];
    readonly recoveryWitnessThreshold: number;
    readonly logicalTimeMs: number;
  }): Promise<CollectivePeerNodeAssignmentConfirmationV1 | null>;
}

export interface CollectivePeerNodeRecoveryElectionDecisionV1 {
  readonly schemaVersion: 1;
  readonly electionId: AgentPlatID;
  readonly electionRound: number;
  readonly scopeDigest: PlanningDigestV1;
  readonly selectedProposalId: AgentPlatID;
  readonly selectedAssigneePeerId: AgentPlatID;
  readonly certifiedWitnessPeerIds: readonly AgentPlatID[];
  readonly certifiedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
}

export interface CollectivePeerNodeRecoveryElectionPortV1 {
  /**
   * Returns one threshold-certified selection for the assignment epoch.
   * Implementations may use peer-to-peer consensus, but must never use
   * first-arrival or a process-local quiet window as certification.
   */
  select(input: {
    readonly scopeDigest: PlanningDigestV1;
    readonly objectiveId: AgentPlatID;
    readonly objectiveRevision: number;
    readonly workItemId: AgentPlatID;
    readonly workItemRevision: number;
    readonly priorAssignmentEpoch: number;
    readonly proposedAssignmentEpoch: number;
    readonly proposals: readonly Readonly<{
      readonly takeoverProposalId: AgentPlatID;
      readonly proposedAssigneePeerId: AgentPlatID;
      readonly acceptedAtLogicalMs: number;
    }>[];
    readonly eligibleWitnessPeerIds: readonly AgentPlatID[];
    readonly recoveryWitnessThreshold: number;
    readonly logicalTimeMs: number;
  }): Promise<CollectivePeerNodeRecoveryElectionDecisionV1 | null>;
}

export interface CollectivePeerNodeContinuityPortV1 {
  /** V1 fails closed on cross-peer owner transfer; successor planning creates new Work authority. */
  readonly ownerTransferMode: "stop_and_replan";
  /** Resolve the current authority head before this node emits owner commands. */
  resolveScope(input: {
    readonly scope: MeshAuthorityScopeV1;
    readonly scopeKey: string;
    readonly logicalTimeMs: number;
  }): Promise<MeshAuthorityCurrentBindingV1 | null>;
  resolve(input: {
    readonly workContract: WorkContractV1;
    readonly logicalTimeMs: number;
  }): Promise<MeshAuthorityCurrentBindingV1 | null>;
  check(
    binding: MeshAuthorityCurrentBindingV1,
  ): Promise<MeshAuthorityCurrentnessDecisionV1>;
}

export interface CollectivePeerNodeExecutionReleaseV1 {
  readonly schemaVersion: 1;
  readonly releaseId: AgentPlatID;
  readonly workItemId: AgentPlatID;
  readonly workContractId: AgentPlatID;
  readonly workContractDigest: PlanningDigestV1;
  readonly roleBindingDigest: PlanningDigestV1;
  readonly executionRoleBindingDigest: PlanningDigestV1;
  readonly assignmentAuthorityId: AgentPlatID;
  readonly assignmentEpoch: number;
  readonly assignmentFencingToken: AgentPlatID;
  readonly continuityBinding: MeshAuthorityCurrentBindingV1;
  readonly assignmentConfirmation: CollectivePeerNodeAssignmentConfirmationV1;
  readonly sessionId: AgentPlatID;
  readonly sessionRevision: number;
  readonly stepId: AgentPlatID;
  readonly stepSequence: number;
  readonly stepRecordDigest: string;
  readonly checkpointId: AgentPlatID | null;
  readonly checkpointDigest: string | null;
  readonly actions: readonly CollectivePeerNodeActionResolutionV1[];
  readonly resultId: AgentPlatID;
  readonly resultDigest: string;
  readonly outboxEffectIds: readonly AgentPlatID[];
  readonly committedAtLogicalMs: number;
  readonly releaseDigest: string;
}

export interface CollectivePeerNodeExecuteInputV1 {
  readonly workItemId: AgentPlatID;
  readonly stepId: AgentPlatID;
  readonly logicalTimeMs: number;
  readonly observations: readonly PortableAgentObservationV1[];
  readonly input: import("@agentplat/core").JsonObject | null;
  readonly requestedOutputModalities: PortableAgentStepRequestV1["requestedOutputModalities"];
  readonly tenant?: TenantContext;
  readonly credentials?: Readonly<Record<string, string>>;
  readonly metadata?: Metadata;
  readonly signal?: AbortSignal;
}

export type CollectivePeerNodeExecuteOutcomeV1 =
  | {
      readonly status: "withheld" | "refused" | "paused" | "failed";
      readonly reasonCode: string;
      readonly durableRevision: number;
    }
  | {
      /** Result/checkpoint are committed locally and queued; remote delivery remains asynchronous. */
      readonly status: "committed";
      readonly release: CollectivePeerNodeExecutionReleaseV1;
      readonly durableRevision: number;
    };

export interface CollectivePeerNodeRuntimeConfigV1 {
  readonly scope: CollectivePeerNodeScopeV1;
  readonly initialState: PlanningMeshInboundRuntimeStateV1;
  readonly repository: MeshDurableLocalTransitionRepository;
  readonly inbound: PlanningMeshInboundProcessorV1;
  readonly deliverOutbox: MeshDurableOutboxDeliver;
  readonly fragments: PlanningFragmentRepositoryV1;
  readonly peerRuntime: CollectivePeerRuntimeV1;
  readonly agents: readonly CollectivePeerNodeAgentRegistrationV1[];
  readonly expectedControlBinding: CollectivePeerNodeControlBindingV1;
  readonly authority: {
    readonly mandate: DelegationMandateV1;
    readonly trustPolicyId: AgentPlatID;
    readonly inferencePolicyId: AgentPlatID;
    readonly maximumActionBudgetUnits: number;
  };
  readonly continuity: CollectivePeerNodeContinuityPortV1;
  readonly assignmentConfirmation: CollectivePeerNodeAssignmentConfirmationPortV1;
  readonly recoveryElection: CollectivePeerNodeRecoveryElectionPortV1;
  readonly actions: CollectivePeerNodeActionPortV1;
  readonly signing: CollectivePeerNodeSigningV1;
  readonly clock: CollectivePeerNodeClockV1;
  readonly workerId: AgentPlatID;
  readonly planningRoleValidFromLogicalMs?: number;
  readonly planningRoleValidUntilLogicalMs?: number;
  readonly maximumOfferRecipients?: number;
  readonly maximumCommitAttempts?: number;
  readonly inboxBatchSize?: number;
  readonly outboxBatchSize?: number;
  readonly leaseDurationMs?: number;
  readonly failureRetryAfterMs?: number;
  readonly onDiagnostic?: (diagnostic: MeshDurableWorkerDiagnostic) => void;
}

export interface CollectivePeerNodeRuntimePortV1 {
  restore(): Promise<CollectivePeerNodeSnapshotV1>;
  receive(
    input: CollectivePeerNodeReceiveInputV1,
  ): Promise<CollectivePeerNodeReceiveOutcomeV1>;
  plan(
    input: CollectivePeerNodePlanInputV1,
  ): Promise<CollectivePeerNodePlanOutcomeV1>;
  reconcile(): Promise<CollectivePeerNodeReconcileOutcomeV1>;
  execute(
    input: CollectivePeerNodeExecuteInputV1,
  ): Promise<CollectivePeerNodeExecuteOutcomeV1>;
  runOnce(signal?: AbortSignal): Promise<CollectivePeerNodeRunOutcomeV1>;
  start(input: {
    readonly signal: AbortSignal;
    readonly idleDelayMs?: number;
  }): Promise<void>;
}

/** Compile-time seam used by consumers that construct the lower peer bridge. */
export type CollectivePeerNodeCurrentnessPortV1 =
  CollectivePeerRuntimeOptionsV1["currentness"];
