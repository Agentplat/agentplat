import type { PlanningDigestV1 } from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";
import type {
  MeshJsonValue,
  VerifiedMeshEnvelope,
} from "@agentplat/mesh-protocol";

import type {
  TeamExecutionArtifactV1,
  TeamExecutionRecoverySignalV1,
  TeamExecutionScopeV1,
  TeamExecutionStepDispatchV1,
  TeamExecutionStepResultV1,
} from "./team-execution-contracts.js";

export const TEAM_EXECUTION_EXCHANGE_SCHEMA_VERSION_V1 = 1 as const;
export const TEAM_EXECUTION_EXCHANGE_STATE_FORMAT_V1 =
  "application/vnd.agentplat.team-execution-exchange-state.v1+json" as const;
export const TEAM_EXECUTION_EXCHANGE_MESH_EXTENSION_V1 =
  "agentplat.team-execution-exchange.v1" as const;

export type TeamExecutionExchangeMessageKindV1 =
  "dispatch" | "artifact_available" | "result" | "recovery";

export interface TeamExecutionExchangeIdentityV1 {
  readonly peerId: AgentPlatID;
  readonly instanceId: AgentPlatID;
  readonly memberId: AgentPlatID;
  readonly memberBindingDigest: PlanningDigestV1;
}

export interface TeamExecutionExchangeRecipientV1 {
  readonly peerId: AgentPlatID;
  readonly memberId: AgentPlatID;
  readonly memberBindingDigest: PlanningDigestV1;
}

export type TeamExecutionExchangePayloadV1 =
  | {
      readonly kind: "dispatch";
      readonly dispatch: TeamExecutionStepDispatchV1;
    }
  | {
      readonly kind: "artifact_available";
      readonly artifact: TeamExecutionArtifactV1;
    }
  | {
      readonly kind: "result";
      readonly result: TeamExecutionStepResultV1;
    }
  | {
      readonly kind: "recovery";
      readonly recoverySignal: TeamExecutionRecoverySignalV1;
    };

/** Signed indirectly as one critical field of a Mesh signing document. */
export interface TeamExecutionExchangeMessageV1 {
  readonly schemaVersion: 1;
  readonly messageId: AgentPlatID;
  readonly streamId: AgentPlatID;
  readonly sequence: number;
  readonly predecessorDigest: PlanningDigestV1 | null;
  readonly scope: TeamExecutionScopeV1;
  readonly policyDigest: PlanningDigestV1;
  readonly executionId: AgentPlatID;
  readonly executionEpoch: number;
  readonly teamEpoch: number;
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly sender: TeamExecutionExchangeIdentityV1;
  readonly recipient: TeamExecutionExchangeRecipientV1;
  readonly payload: TeamExecutionExchangePayloadV1;
  readonly payloadDigest: PlanningDigestV1;
  readonly createdAtLogicalMs: number;
  readonly validUntilLogicalMs: number;
  readonly messageDigest: PlanningDigestV1;
}

export interface TeamExecutionExchangeMessageDraftV1 {
  readonly messageId: AgentPlatID;
  readonly recipient: TeamExecutionExchangeRecipientV1;
  readonly executionId: AgentPlatID;
  readonly executionEpoch: number;
  readonly teamEpoch: number;
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly payload: TeamExecutionExchangePayloadV1;
  readonly logicalTimeMs: number;
  readonly validUntilLogicalMs: number;
}

export interface TeamExecutionExchangeLimitsV1 {
  readonly maximumRetainedInboxMessages: number;
  readonly maximumPendingMessages: number;
  readonly maximumRetainedOutboxMessages: number;
  readonly maximumSourceStreams: number;
  readonly maximumMessageTtlMs: number;
  readonly maximumFutureSkewMs: number;
  readonly maximumRecoveryBatchSize: number;
  readonly maximumCommitAttempts: number;
}

/** Immutable local bounds; remote messages cannot widen them. */
export interface TeamExecutionExchangePolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly parentPolicyDigest: PlanningDigestV1 | null;
  readonly limits: TeamExecutionExchangeLimitsV1;
}

export interface TeamExecutionExchangePolicyRecordV1 {
  readonly schemaVersion: 1;
  readonly policy: TeamExecutionExchangePolicyV1;
  readonly policyDigest: PlanningDigestV1;
}

export interface TeamExecutionExchangeSourceHeadV1 {
  readonly streamId: AgentPlatID;
  readonly senderPeerId: AgentPlatID;
  readonly senderInstanceId: AgentPlatID;
  readonly sequence: number;
  readonly messageDigest: PlanningDigestV1;
}

export type TeamExecutionExchangeInboxStatusV1 = "ready" | "handled";

export interface TeamExecutionExchangeInboxRecordV1 {
  readonly message: TeamExecutionExchangeMessageV1;
  readonly envelopeMessageId: AgentPlatID;
  readonly envelopeSenderKeyId: AgentPlatID;
  readonly receivedAtLogicalMs: number;
  readonly status: TeamExecutionExchangeInboxStatusV1;
}

export interface TeamExecutionExchangePendingRecordV1 {
  readonly message: TeamExecutionExchangeMessageV1;
  readonly envelopeMessageId: AgentPlatID;
  readonly envelopeSenderKeyId: AgentPlatID;
  readonly receivedAtLogicalMs: number;
}

export type TeamExecutionExchangeOutboxStatusV1 = "pending" | "sent";

export interface TeamExecutionExchangeOutboxRecordV1 {
  readonly message: TeamExecutionExchangeMessageV1;
  readonly status: TeamExecutionExchangeOutboxStatusV1;
}

export interface TeamExecutionExchangeStateV1 {
  readonly format: typeof TEAM_EXECUTION_EXCHANGE_STATE_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly stateKey: AgentPlatID;
  readonly runtimeId: AgentPlatID;
  readonly runtimeVersion: number;
  readonly implementationId: AgentPlatID;
  readonly localIdentity: TeamExecutionExchangeIdentityV1;
  readonly scope: TeamExecutionScopeV1;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  readonly streamId: AgentPlatID;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly outboundSequence: number;
  readonly outboundHeadDigest: PlanningDigestV1 | null;
  readonly sourceHeads: readonly TeamExecutionExchangeSourceHeadV1[];
  readonly inbox: readonly TeamExecutionExchangeInboxRecordV1[];
  readonly pending: readonly TeamExecutionExchangePendingRecordV1[];
  readonly outbox: readonly TeamExecutionExchangeOutboxRecordV1[];
  readonly predecessorStateDigest: PlanningDigestV1 | null;
  readonly stateDigest: PlanningDigestV1;
}

export interface TeamExecutionExchangeStoreV1 {
  load(stateKey: AgentPlatID): Promise<TeamExecutionExchangeStateV1 | null>;
  save(input: {
    readonly state: TeamExecutionExchangeStateV1;
    readonly expectedRevision: number | null;
  }): Promise<boolean>;
}

export interface TeamExecutionExchangeMembershipDecisionV1 {
  readonly authorized: boolean;
  readonly reasonCode: string;
  readonly peerId: AgentPlatID;
  readonly instanceId: AgentPlatID;
  readonly memberId: AgentPlatID;
  readonly memberBindingDigest: PlanningDigestV1;
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly validUntilLogicalMs: number;
  readonly decisionDigest: PlanningDigestV1;
}

export interface TeamExecutionExchangeMembershipPortV1 {
  evaluate(input: {
    readonly message: TeamExecutionExchangeMessageV1;
    readonly envelope: VerifiedMeshEnvelope;
    readonly logicalTimeMs: number;
  }): Promise<TeamExecutionExchangeMembershipDecisionV1>;
}

/** The implementation must use messageId as a durable idempotency key. */
export interface TeamExecutionExchangeHandlerV1 {
  handle(input: {
    readonly messageId: AgentPlatID;
    readonly message: TeamExecutionExchangeMessageV1;
  }): Promise<void>;
}

/** Signs and durably enqueues the extension at the existing Mesh boundary. */
export interface TeamExecutionExchangeOutboundPortV1 {
  publish(input: {
    readonly message: TeamExecutionExchangeMessageV1;
    readonly extensionKey: typeof TEAM_EXECUTION_EXCHANGE_MESH_EXTENSION_V1;
    readonly extension: MeshJsonValue;
  }): Promise<void>;
}

/** Returns only envelopes already authenticated by the ordinary Mesh boundary. */
export interface TeamExecutionExchangeRecoveryPortV1 {
  fetch(input: {
    readonly streamId: AgentPlatID;
    readonly senderPeerId: AgentPlatID;
    readonly senderInstanceId: AgentPlatID;
    readonly fromSequence: number;
    readonly toSequence: number;
    readonly limit: number;
  }): Promise<readonly VerifiedMeshEnvelope[]>;
}

export interface TeamExecutionExchangeRuntimeOptionsV1 {
  readonly stateKey: AgentPlatID;
  readonly runtimeId: AgentPlatID;
  readonly runtimeVersion: number;
  readonly implementationId: AgentPlatID;
  readonly localIdentity: TeamExecutionExchangeIdentityV1;
  readonly scope: TeamExecutionScopeV1;
  readonly streamId: AgentPlatID;
  readonly policy: TeamExecutionExchangePolicyRecordV1;
  readonly store: TeamExecutionExchangeStoreV1;
  readonly membership: TeamExecutionExchangeMembershipPortV1;
  readonly handler: TeamExecutionExchangeHandlerV1;
  readonly outbound: TeamExecutionExchangeOutboundPortV1;
  readonly recovery?: TeamExecutionExchangeRecoveryPortV1;
}

export type TeamExecutionExchangeAdmissionOutcomeV1 =
  | { readonly status: "accepted"; readonly messageDigest: PlanningDigestV1 }
  | { readonly status: "duplicate"; readonly messageDigest: PlanningDigestV1 }
  | {
      readonly status: "pending";
      readonly messageDigest: PlanningDigestV1;
      readonly missingSequence: number;
    }
  | { readonly status: "rejected"; readonly reasonCode: string };

export interface TeamExecutionExchangeBatchOutcomeV1 {
  readonly attempted: number;
  readonly completed: number;
  readonly failed: number;
}

export interface TeamExecutionExchangeRuntimePortV1 {
  enqueue(
    draft: TeamExecutionExchangeMessageDraftV1,
  ): Promise<TeamExecutionExchangeMessageV1>;
  admit(input: {
    readonly envelope: VerifiedMeshEnvelope;
    readonly logicalTimeMs: number;
  }): Promise<TeamExecutionExchangeAdmissionOutcomeV1>;
  processInbox(): Promise<TeamExecutionExchangeBatchOutcomeV1>;
  flushOutbox(): Promise<TeamExecutionExchangeBatchOutcomeV1>;
  recoverPending(input: {
    readonly logicalTimeMs: number;
  }): Promise<TeamExecutionExchangeBatchOutcomeV1>;
  loadState(): Promise<TeamExecutionExchangeStateV1>;
}
