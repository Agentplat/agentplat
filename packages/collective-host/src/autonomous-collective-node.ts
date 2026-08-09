import {
  createMissionDecompositionRequestV1,
  validateMissionIntentV1,
  type MissionDecompositionGraphV1,
  type MissionDecompositionMergeV1,
  type MissionIntentV1,
  type MissionTaskNodeV1,
  type PlanningDigestV1,
} from "@agentplat/collective-planning";
import { collectiveQuorumDigestV1 } from "@agentplat/collective-quorum/crypto";
import type { SparseFinalityCertificateV2 } from "@agentplat/collective-quorum/sparse-agreement";
import {
  createStrategicBidCommitmentV1,
  createStrategicBidRevealV1,
  strategicSealedBidDigestV1,
  type StrategicAllocationAwardV1,
  type StrategicAllocationPlanV1,
  type StrategicBidCommitmentV1,
  type StrategicCapabilityAttestationV1,
  type StrategicPeerProjectionV1,
} from "@agentplat/collective-runtime/strategic-allocation";
import type {
  CognitiveAgentAdapterContextV2,
  CognitiveOperationRequestV2,
} from "@agentplat/runtime/cognitive-adapter";

import {
  type AssuranceCoupledExecutionReceiptV1,
  assuranceCognitiveContextBindingDigestV1,
  AssuranceCoupledExecutionRuntimeV1,
  isAssuranceCoupledExecutionRuntimeV1,
} from "./assurance-coupled-execution.js";
import {
  type AutonomousAdaptationDecisionV1,
  type AutonomousMissionSignalV1,
  AutonomousAdaptationRuntimeV1,
  createAutonomousMissionSignalV1,
  isAutonomousAdaptationRuntimeV1,
} from "./autonomous-adaptation-runtime.js";
import {
  type DistributedCollectiveMessageV1,
  type DistributedCollectiveReceiveResultV1,
  DistributedCollectiveProtocolRuntimeV1,
  isDistributedCollectiveProtocolRuntimeV1,
} from "./distributed-collective-protocol.js";
import {
  type DistributedPlanningCycleV1,
  DistributedPlanningRuntimeV1,
  isDistributedPlanningRuntimeV1,
} from "./distributed-planning-runtime.js";
import type { MeshSparseUpdateV2 } from "@agentplat/mesh/overlay";
import {
  createCollectiveHostTelemetryOutboxEntryV1,
  CollectiveHostTelemetryOutboxCapacityErrorV1,
  compareCollectiveHostTelemetryOutboxEntriesV1,
  drainCollectiveHostTelemetryOutboxV1,
  isCollectiveHostDurableTelemetryPortV1,
  validateCollectiveHostTelemetryOutboxBatchV1,
  validateCollectiveHostTelemetryOutboxEntryV1,
  type CollectiveHostTelemetryDeliveryModeV1,
  type CollectiveHostTelemetryEventV1,
  type CollectiveHostTelemetryOutboxEntryV1,
  type CollectiveHostTelemetryOutboxStoreV1,
  type CollectiveHostTelemetryPortV1,
} from "./collective-telemetry.js";

export interface AutonomousCollectiveNodePolicyV1 {
  readonly schemaVersion: 1;
  readonly graphProposalWindowMs: number;
  readonly bidCommitmentWindowMs: number;
  readonly bidRevealWindowMs: number;
  readonly messageLifetimeMs: number;
  readonly fanout?: number;
  readonly maximumLocalBids: number;
  readonly maximumAdmittedEvidenceMessages: number;
  /** Logical lease used to fence concurrent process-level advance calls. */
  readonly advanceLeaseDurationMs?: number;
  /** Completed award sagas retained for audit; unresolved sagas are never evicted. */
  readonly maximumRetainedCompletedAwardOperations?: number;
}

/**
 * Locally derived bid terms. Implementations inspect only the local capability
 * inventory and messages already admitted by the protocol; callers never pass
 * a collective-wide candidate list or precomputed ranking into a mission tick.
 */
export interface AutonomousCollectiveLocalBidV1 {
  readonly taskId: string;
  readonly independenceGroupId: string;
  readonly declaredUtilityMicros: number;
  readonly declaredCostUnits: number;
  readonly declaredResourceUnits: number;
  readonly requestedBudgetUnits: number;
  readonly collateralUnits: number;
  readonly availabilityUntilLogicalMs: number;
  readonly nonceDigest: PlanningDigestV1;
  readonly attestation: StrategicCapabilityAttestationV1;
  readonly peerProjection: StrategicPeerProjectionV1;
}

export interface AutonomousCollectiveLocalPlanningPortV1 {
  availableRoleKeys(input: {
    readonly intent: MissionIntentV1;
    readonly admittedMessages: readonly DistributedCollectiveMessageV1[];
    readonly logicalTimeMs: number;
  }): Promise<readonly string[]>;
  proposeBids(input: {
    readonly intent: MissionIntentV1;
    readonly cycle: DistributedPlanningCycleV1;
    readonly graph: MissionDecompositionGraphV1;
    readonly admittedMessages: readonly DistributedCollectiveMessageV1[];
    readonly localPeerId: string;
    readonly localInstanceId: string;
    readonly scopeDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<readonly AutonomousCollectiveLocalBidV1[]>;
}

export interface AutonomousCollectivePlanningFinalityPortV1 {
  certify(input: {
    readonly cycle: DistributedPlanningCycleV1;
    readonly graph: MissionDecompositionGraphV1;
    readonly plan: StrategicAllocationPlanV1;
    readonly decisionDigest: string;
    readonly admittedMessageDigests: readonly string[];
    readonly logicalTimeMs: number;
    readonly commandBindingDigest: string;
  }): Promise<SparseFinalityCertificateV2 | null>;
  verify(input: {
    readonly certificate: SparseFinalityCertificateV2;
    readonly decisionDigest: string;
    readonly graphDigest: string;
    readonly allocationPlanDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<boolean>;
  reconcileCertification(input: {
    readonly cycle: DistributedPlanningCycleV1;
    readonly graph: MissionDecompositionGraphV1;
    readonly plan: StrategicAllocationPlanV1;
    readonly decisionDigest: string;
    readonly admittedMessageDigests: readonly string[];
    readonly logicalTimeMs: number;
    readonly commandBindingDigest: string;
  }): Promise<SparseFinalityCertificateV2 | null>;
}

export interface AutonomousCollectiveTaskMaterializerPortV1 {
  prepare(input: {
    /** Stable content coordinate allocated before materialization side effects. */
    readonly materializationId: string;
    /** Stable downstream assurance coordinate for this award. */
    readonly executionId: string;
    readonly intent: MissionIntentV1;
    readonly cycle: DistributedPlanningCycleV1;
    readonly graph: MissionDecompositionGraphV1;
    readonly plan: StrategicAllocationPlanV1;
    readonly award: StrategicAllocationAwardV1;
    readonly task: MissionTaskNodeV1;
    readonly planningFinality: SparseFinalityCertificateV2;
    /** Exact canonical message digests committed by planning finality. */
    readonly admittedMessageDigests: readonly string[];
    /** Durable mission-local coordinate; it never resets on replan. */
    readonly semanticSequence: number;
    readonly logicalTimeMs: number;
  }): Promise<{
    readonly semanticSequence: number;
    readonly cognitiveRequest: CognitiveOperationRequestV2;
    readonly cognitiveContext: CognitiveAgentAdapterContextV2;
  }>;
}

export interface AutonomousCollectiveCognitiveContextBindingV1 {
  readonly schemaVersion: 1;
  /** Secret/PII-free authorization projection; credentials, signals and actor email are excluded. */
  readonly tenant: {
    readonly tenantId: string;
    readonly organizationId: string | null;
    readonly workspaceId: string | null;
    readonly actor: {
      readonly actorId: string | null;
      readonly actorType: "human" | "machine" | "system";
      readonly roles: readonly string[];
    } | null;
  };
}

export function createAutonomousCollectiveCognitiveContextBindingV1(
  tenant: CognitiveAgentAdapterContextV2["tenant"],
): AutonomousCollectiveCognitiveContextBindingV1 {
  if (!tenant || typeof tenant !== "object")
    throw new TypeError("autonomous cognitive tenant context is required");
  identifier(tenant.tenantId, "cognitiveContext.tenant.tenantId");
  if (tenant.organizationId !== undefined)
    identifier(tenant.organizationId, "cognitiveContext.tenant.organizationId");
  if (tenant.workspaceId !== undefined)
    identifier(tenant.workspaceId, "cognitiveContext.tenant.workspaceId");
  const actor = tenant.actor;
  if (actor !== undefined && (!actor || typeof actor !== "object"))
    throw new TypeError("autonomous cognitive tenant actor is invalid");
  if (
    actor !== undefined &&
    !["human", "machine", "system"].includes(actor.actorType)
  )
    throw new TypeError("autonomous cognitive tenant actor type is invalid");
  if (actor?.actorId !== undefined)
    identifier(actor.actorId, "cognitiveContext.tenant.actor.actorId");
  if (actor?.roles !== undefined && !Array.isArray(actor.roles))
    throw new TypeError("autonomous cognitive tenant actor roles are invalid");
  const roles = [...new Set(actor?.roles ?? [])].sort();
  roles.forEach((role) =>
    identifier(role, "cognitiveContext.tenant.actor.roles"),
  );
  return immutable({
    schemaVersion: 1 as const,
    tenant: {
      tenantId: tenant.tenantId,
      organizationId: tenant.organizationId ?? null,
      workspaceId: tenant.workspaceId ?? null,
      actor:
        actor === undefined
          ? null
          : {
              actorId: actor.actorId ?? null,
              actorType: actor.actorType,
              roles,
            },
    },
  });
}

export interface AutonomousCollectiveTaskContextRehydratorPortV1 {
  rehydrate(input: {
    readonly cognitiveRequest: CognitiveOperationRequestV2;
    readonly contextBinding: AutonomousCollectiveCognitiveContextBindingV1;
  }): Promise<CognitiveAgentAdapterContextV2>;
}

export type AutonomousCollectiveAwardOperationPhaseV1 =
  | "reserved"
  | "materialized"
  | "assurance_started"
  | "assurance_completed"
  | "settle_enqueued"
  | "settled"
  | "signal_enqueued"
  | "signal_published"
  | "completed";

export interface AutonomousCollectiveAwardOperationV1 {
  readonly schemaVersion: 1;
  readonly awardDigest: PlanningDigestV1;
  readonly executionId: string;
  readonly materializationId: string;
  readonly semanticSequence: number;
  /** Stable across retries, even when the process restarts at a later scheduler time. */
  readonly canonicalLogicalTimeMs: number;
  readonly phase: AutonomousCollectiveAwardOperationPhaseV1;
  readonly cognitiveRequest: CognitiveOperationRequestV2 | null;
  readonly cognitiveContextBinding: AutonomousCollectiveCognitiveContextBindingV1 | null;
  readonly receipt: AssuranceCoupledExecutionReceiptV1 | null;
  readonly signal: AutonomousMissionSignalV1 | null;
}

export interface AutonomousCollectiveAdvanceReservationV1 {
  readonly schemaVersion: 1;
  readonly runtimeId: string;
  readonly advanceId: string;
  readonly expectedRevision: number;
  readonly canonicalLogicalTimeMs: number;
  readonly holderId: string;
  readonly leaseUntilLogicalMs: number;
  readonly fence: number;
}

export interface AutonomousCollectiveMissionIntentPayloadV1 {
  readonly schemaVersion: 1;
  readonly payloadKind: "mission_intent";
  readonly intent: MissionIntentV1;
}

export type AutonomousCollectiveNodeStatusV1 =
  | "idle"
  | "accepted"
  | "collecting_graphs"
  | "collecting_bid_commitments"
  | "collecting_bid_reveals"
  | "executing"
  | "completed"
  | "blocked";

export interface AutonomousCollectiveCommittedBidV1 {
  readonly bid: AutonomousCollectiveLocalBidV1;
  readonly commitment: StrategicBidCommitmentV1;
}

export interface AutonomousCollectiveNodeStateV1 {
  readonly schemaVersion: 1;
  readonly runtimeId: string;
  readonly status: AutonomousCollectiveNodeStatusV1;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly intent: MissionIntentV1 | null;
  readonly cycle: DistributedPlanningCycleV1 | null;
  readonly localGraph: MissionDecompositionGraphV1 | null;
  readonly graph: MissionDecompositionGraphV1 | null;
  readonly graphMerge: MissionDecompositionMergeV1 | null;
  readonly localBids: readonly AutonomousCollectiveCommittedBidV1[];
  readonly plan: StrategicAllocationPlanV1 | null;
  readonly planningDecisionDigest: string | null;
  readonly planningEvidenceMessageDigests: readonly string[];
  readonly planningFinality: SparseFinalityCertificateV2 | null;
  readonly executionReceipts: readonly AssuranceCoupledExecutionReceiptV1[];
  readonly semanticSequenceHighWater: number;
  readonly awardOperations?: readonly AutonomousCollectiveAwardOperationV1[];
  /** Protocol command bindings awaiting (or replaying) idempotent compaction ACK. */
  readonly commandAcknowledgementDigests?: readonly string[];
  readonly adaptationDecision: AutonomousAdaptationDecisionV1 | null;
  /** A completed state means the local control cycle terminated, not that every remote award succeeded. */
  readonly cycleOutcome: "satisfied" | "partial" | "failed" | null;
  readonly blockingReason: string | null;
  readonly nextWakeAtLogicalMs: number | null;
  readonly previousStateDigest: string | null;
  readonly stateDigest: string;
}

export interface AutonomousCollectiveNodeStoreV1 {
  load(runtimeId: string): Promise<AutonomousCollectiveNodeStateV1 | null>;
  save(
    state: AutonomousCollectiveNodeStateV1,
    expectedRevision: number | null,
  ): Promise<boolean>;
  /** Atomically commits the node revision and its causal telemetry facts. */
  saveWithTelemetry?(
    state: AutonomousCollectiveNodeStateV1,
    expectedRevision: number | null,
    telemetry: readonly CollectiveHostTelemetryOutboxEntryV1[],
  ): Promise<boolean>;
  loadPendingTelemetry?(
    limit?: number,
  ): Promise<readonly CollectiveHostTelemetryOutboxEntryV1[]>;
  markTelemetryRecorded?(deliveryDigest: string): Promise<boolean>;
  acknowledgeTelemetry?(deliveryDigest: string): Promise<boolean>;
  reserveAdvance(input: {
    readonly runtimeId: string;
    readonly expectedRevision: number;
    readonly requestedLogicalTimeMs: number;
    readonly holderId: string;
    readonly leaseDurationMs: number;
  }): Promise<AutonomousCollectiveAdvanceReservationV1 | null>;
  assertAdvanceFence(
    reservation: AutonomousCollectiveAdvanceReservationV1,
    logicalTimeMs: number,
  ): Promise<boolean>;
  saveAdvance(
    state: AutonomousCollectiveNodeStateV1,
    expectedRevision: number,
    reservation: AutonomousCollectiveAdvanceReservationV1,
    telemetry?: readonly CollectiveHostTelemetryOutboxEntryV1[],
  ): Promise<boolean>;
  releaseAdvance(
    reservation: AutonomousCollectiveAdvanceReservationV1,
  ): Promise<boolean>;
  /** Persists intent, fences takeover during invocation, and replays the recorded result. */
  runAdvanceCommand<T>(input: {
    readonly reservation: AutonomousCollectiveAdvanceReservationV1;
    readonly commandId: string;
    readonly commandDigest: string;
    readonly commandBinding: unknown;
    readonly effect: () => Promise<T>;
  } & (
    | { readonly recovery: "repeatable" }
    | {
        readonly recovery: "reconcile";
        /** Lookup path used when a prior dispatcher died with a pending command. */
        readonly reconcile: () => Promise<{ readonly found: true; readonly value: T } | { readonly found: false }>;
      }
  )): Promise<T>;
  loadAdvanceCommandBinding(
    reservation: AutonomousCollectiveAdvanceReservationV1,
    commandId: string,
  ): Promise<unknown | null>;
}

export class InMemoryAutonomousCollectiveNodeStoreV1 implements AutonomousCollectiveNodeStoreV1 {
  readonly #states = new Map<string, AutonomousCollectiveNodeStateV1>();
  readonly #telemetry = new Map<string, CollectiveHostTelemetryOutboxEntryV1>();
  readonly #advances = new Map<string, AutonomousCollectiveAdvanceReservationV1>();
  readonly #advanceCommands = new Map<string, { commandDigest: string; commandBinding: unknown; completed: boolean; result?: unknown }>();
  readonly #runningAdvanceCommands = new Set<string>();

  constructor(readonly maximumPendingTelemetry = 4_096) {
    integer(maximumPendingTelemetry, "maximumPendingTelemetry", 1, 100_000);
  }

  async load(
    runtimeId: string,
  ): Promise<AutonomousCollectiveNodeStateV1 | null> {
    const state = this.#states.get(runtimeId);
    return state ? immutable(state) : null;
  }

  async save(
    state: AutonomousCollectiveNodeStateV1,
    expectedRevision: number | null,
  ): Promise<boolean> {
    const current = this.#states.get(state.runtimeId);
    if (
      (expectedRevision === null &&
        (current !== undefined || state.revision !== 0)) ||
      (expectedRevision !== null &&
        (!current ||
          current.revision !== expectedRevision ||
          state.revision !== expectedRevision + 1))
    )
      return false;
    this.#states.set(state.runtimeId, immutable(state));
    return true;
  }

  async saveWithTelemetry(
    state: AutonomousCollectiveNodeStateV1,
    expectedRevision: number | null,
    telemetry: readonly CollectiveHostTelemetryOutboxEntryV1[],
  ): Promise<boolean> {
    const validated =
      await validateCollectiveHostTelemetryOutboxBatchV1(telemetry);
    if (
      validated.length !== 1 ||
      validated[0]!.sourceKind !== "autonomous_node" ||
      validated[0]!.sourceId !== state.runtimeId ||
      validated[0]!.sourceSequence !== state.revision ||
      validated[0]!.ordinal !== 0 ||
      validated[0]!.event.operationDigest !== state.stateDigest
    )
      throw new TypeError("node telemetry/state binding is invalid");
    const current = this.#states.get(state.runtimeId);
    if (
      (expectedRevision === null &&
        (current !== undefined || state.revision !== 0)) ||
      (expectedRevision !== null &&
        (!current ||
          current.revision !== expectedRevision ||
          state.revision !== expectedRevision + 1))
    )
      return false;
    const fresh = validated.filter(
      (entry) => !this.#telemetry.has(entry.deliveryDigest),
    );
    if (this.#telemetry.size + fresh.length > this.maximumPendingTelemetry)
      throw new CollectiveHostTelemetryOutboxCapacityErrorV1(
        this.maximumPendingTelemetry,
      );
    this.#states.set(state.runtimeId, immutable(state));
    for (const entry of fresh)
      this.#telemetry.set(entry.deliveryDigest, immutable(entry));
    return true;
  }

  async loadPendingTelemetry(
    limit = 128,
  ): Promise<readonly CollectiveHostTelemetryOutboxEntryV1[]> {
    const pending = [...this.#telemetry.values()]
      .sort(compareCollectiveHostTelemetryOutboxEntriesV1)
      .slice(0, limit);
    return Promise.all(
      pending.map((entry) =>
        validateCollectiveHostTelemetryOutboxEntryV1(entry),
      ),
    );
  }

  async acknowledgeTelemetry(deliveryDigest: string): Promise<boolean> {
    const current = this.#telemetry.get(deliveryDigest);
    if (!current || current.deliveryState !== "recorded") return false;
    await validateCollectiveHostTelemetryOutboxEntryV1(current);
    return this.#telemetry.delete(deliveryDigest);
  }

  async markTelemetryRecorded(deliveryDigest: string): Promise<boolean> {
    const current = this.#telemetry.get(deliveryDigest);
    if (!current) return false;
    await validateCollectiveHostTelemetryOutboxEntryV1(current);
    if (current.deliveryState === "recorded") return true;
    const recorded = immutable({
      ...current,
      deliveryState: "recorded" as const,
    });
    await validateCollectiveHostTelemetryOutboxEntryV1(recorded);
    this.#telemetry.set(deliveryDigest, recorded);
    return true;
  }

  async reserveAdvance(input: {
    readonly runtimeId: string;
    readonly expectedRevision: number;
    readonly requestedLogicalTimeMs: number;
    readonly holderId: string;
    readonly leaseDurationMs: number;
  }): Promise<AutonomousCollectiveAdvanceReservationV1 | null> {
    const state = this.#states.get(input.runtimeId);
    if (!state || state.revision !== input.expectedRevision) return null;
    const current = this.#advances.get(input.runtimeId);
    if (
      current &&
      (input.requestedLogicalTimeMs <= current.leaseUntilLogicalMs ||
        this.#runningAdvanceCommands.has(current.advanceId))
    )
      return null;
    const sameRevision = current?.expectedRevision === input.expectedRevision;
    const reservation = immutable({
      schemaVersion: 1 as const,
      runtimeId: input.runtimeId,
      advanceId: sameRevision
        ? current!.advanceId
        : `advance:${input.runtimeId}:${input.expectedRevision}`,
      expectedRevision: input.expectedRevision,
      canonicalLogicalTimeMs: sameRevision
        ? current!.canonicalLogicalTimeMs
        : input.requestedLogicalTimeMs,
      holderId: input.holderId,
      leaseUntilLogicalMs: safeAdd(
        input.requestedLogicalTimeMs,
        input.leaseDurationMs,
      ),
      fence: (current?.fence ?? 0) + 1,
    });
    this.#advances.set(input.runtimeId, reservation);
    return reservation;
  }

  async assertAdvanceFence(
    reservation: AutonomousCollectiveAdvanceReservationV1,
    logicalTimeMs: number,
  ): Promise<boolean> {
    const current = this.#advances.get(reservation.runtimeId);
    return Boolean(
      current &&
        sameAdvanceReservation(current, reservation) &&
        logicalTimeMs <= current.leaseUntilLogicalMs,
    );
  }

  async saveAdvance(
    state: AutonomousCollectiveNodeStateV1,
    expectedRevision: number,
    reservation: AutonomousCollectiveAdvanceReservationV1,
    telemetry: readonly CollectiveHostTelemetryOutboxEntryV1[] = [],
  ): Promise<boolean> {
    const validated = telemetry.length > 0
      ? await validateCollectiveHostTelemetryOutboxBatchV1(telemetry)
      : [];
    const currentReservation = this.#advances.get(reservation.runtimeId);
    const currentState = this.#states.get(state.runtimeId);
    if (
      !currentReservation ||
      !sameAdvanceReservation(currentReservation, reservation) ||
      reservation.canonicalLogicalTimeMs > currentReservation.leaseUntilLogicalMs ||
      !currentState ||
      currentState.revision !== expectedRevision ||
      state.revision !== expectedRevision + 1
    )
      return false;
    if (validated.length > 0) {
      if (
        validated.length !== 1 ||
        validated[0]!.sourceKind !== "autonomous_node" ||
        validated[0]!.sourceId !== state.runtimeId ||
        validated[0]!.sourceSequence !== state.revision ||
        validated[0]!.ordinal !== 0 ||
        validated[0]!.event.operationDigest !== state.stateDigest
      )
        throw new TypeError("node telemetry/state binding is invalid");
      const fresh = validated.filter(
        (entry) => !this.#telemetry.has(entry.deliveryDigest),
      );
      if (this.#telemetry.size + fresh.length > this.maximumPendingTelemetry)
        throw new CollectiveHostTelemetryOutboxCapacityErrorV1(
          this.maximumPendingTelemetry,
        );
      for (const entry of fresh)
        this.#telemetry.set(entry.deliveryDigest, immutable(entry));
    }
    this.#states.set(state.runtimeId, immutable(state));
    for (const [coordinate, command] of this.#advanceCommands)
      if (coordinate.startsWith(`${state.runtimeId}\u0000`) && command.completed)
        this.#advanceCommands.delete(coordinate);
    return true;
  }

  async releaseAdvance(
    reservation: AutonomousCollectiveAdvanceReservationV1,
  ): Promise<boolean> {
    const current = this.#advances.get(reservation.runtimeId);
    if (!current || !sameAdvanceReservation(current, reservation)) return false;
    return this.#advances.delete(reservation.runtimeId);
  }

  async runAdvanceCommand<T>(input: {
    readonly reservation: AutonomousCollectiveAdvanceReservationV1;
    readonly commandId: string;
    readonly commandDigest: string;
    readonly commandBinding: unknown;
    readonly effect: () => Promise<T>;
  } & (
    | { readonly recovery: "repeatable" }
    | {
        readonly recovery: "reconcile";
        readonly reconcile: () => Promise<{ readonly found: true; readonly value: T } | { readonly found: false }>;
      }
  )): Promise<T> {
    validateAutonomousCollectiveCommandBindingV1(input.commandBinding);
    const coordinate = `${input.reservation.runtimeId}\u0000${input.commandId}`;
    const existing = this.#advanceCommands.get(coordinate);
    if (existing && existing.commandDigest !== input.commandDigest)
      throw new TypeError("autonomous advance command digest mismatch");
    const current = this.#advances.get(input.reservation.runtimeId);
    if (!current || !sameAdvanceReservation(current, input.reservation))
      throw new Error("autonomous collective node advance fence is stale");
    if (!existing)
      this.#advanceCommands.set(coordinate, {
        commandDigest: input.commandDigest,
        commandBinding: immutable(input.commandBinding),
        completed: false,
      });
    this.#runningAdvanceCommands.add(input.reservation.advanceId);
    try {
      if (existing?.completed) {
        if (input.recovery === "repeatable")
          return immutable(existing.result as T);
        const authoritative = await input.reconcile();
        if (!authoritative.found)
          throw new Error("completed autonomous command has no authoritative receipt");
        return authoritative.value;
      }
      const reconciled = existing && input.recovery === "reconcile"
        ? await input.reconcile()
        : { found: false as const };
      const result = reconciled.found ? reconciled.value : await input.effect();
      const after = this.#advances.get(input.reservation.runtimeId);
      if (!after || !sameAdvanceReservation(after, input.reservation))
        throw new Error("autonomous collective node advance fence became stale");
      this.#advanceCommands.set(coordinate, {
        commandDigest: input.commandDigest,
        commandBinding: immutable(input.commandBinding),
        completed: true,
        result: immutable(result),
      });
      return result;
    } finally {
      this.#runningAdvanceCommands.delete(input.reservation.advanceId);
    }
  }

  async loadAdvanceCommandBinding(
    reservation: AutonomousCollectiveAdvanceReservationV1,
    commandId: string,
  ): Promise<unknown | null> {
    const current = this.#advances.get(reservation.runtimeId);
    if (!current || !sameAdvanceReservation(current, reservation))
      throw new Error("autonomous collective node advance fence is stale");
    const command = this.#advanceCommands.get(
      `${reservation.runtimeId}\u0000${commandId}`,
    );
    return command ? immutable(command.commandBinding) : null;
  }
}

const autonomousCollectiveExecutionAuthorityAdaptersV1 = new WeakSet<object>();
const autonomousCollectiveAdaptationAuthorityAdaptersV1 = new WeakSet<object>();

/**
 * Explicit nominal boundary for embeddings that provide an execution
 * authority without constructing the reference assurance runtime. Plain
 * structural objects are deliberately not accepted by the node.
 */
export class AutonomousCollectiveExecutionAuthorityAdapterV1 {
  readonly options: Readonly<{ readonly localPeerId: string }>;
  declare readonly execute: AssuranceCoupledExecutionRuntimeV1["execute"];
  declare readonly lookupReceipt: AssuranceCoupledExecutionRuntimeV1["lookupReceipt"];

  constructor(input: {
    readonly localPeerId: string;
    readonly execute: AssuranceCoupledExecutionRuntimeV1["execute"];
    readonly lookupReceipt: AssuranceCoupledExecutionRuntimeV1["lookupReceipt"];
  }) {
    identifier(input.localPeerId, "execution.localPeerId");
    this.options = Object.freeze({ localPeerId: input.localPeerId });
    Object.defineProperties(this, {
      execute: immutableMethod(
        captureMethod(input, "execute", "execution.execute"),
      ),
      lookupReceipt: immutableMethod(
        captureMethod(input, "lookupReceipt", "execution.lookupReceipt"),
      ),
    });
    autonomousCollectiveExecutionAuthorityAdaptersV1.add(this);
  }
}

/** Explicit nominal boundary for a non-reference adaptation authority. */
export class AutonomousCollectiveAdaptationAuthorityAdapterV1 {
  readonly options: Readonly<{
    readonly protocol: DistributedCollectiveProtocolRuntimeV1;
    readonly missionId: string;
  }>;
  declare readonly initialize: AutonomousAdaptationRuntimeV1["initialize"];
  declare readonly load: AutonomousAdaptationRuntimeV1["load"];
  declare readonly publishSignal: AutonomousAdaptationRuntimeV1["publishSignal"];
  declare readonly runCycle: AutonomousAdaptationRuntimeV1["runCycle"];

  constructor(input: {
    readonly protocol: DistributedCollectiveProtocolRuntimeV1;
    readonly missionId: string;
    readonly initialize: AutonomousAdaptationRuntimeV1["initialize"];
    readonly load: AutonomousAdaptationRuntimeV1["load"];
    readonly publishSignal: AutonomousAdaptationRuntimeV1["publishSignal"];
    readonly runCycle: AutonomousAdaptationRuntimeV1["runCycle"];
  }) {
    if (!isDistributedCollectiveProtocolRuntimeV1(input.protocol))
      throw new TypeError(
        "adaptation adapter requires a genuine collective protocol runtime",
      );
    identifier(input.missionId, "adaptation.missionId");
    this.options = Object.freeze({
      protocol: input.protocol,
      missionId: input.missionId,
    });
    Object.defineProperties(this, {
      initialize: immutableMethod(
        captureMethod(input, "initialize", "adaptation.initialize"),
      ),
      load: immutableMethod(captureMethod(input, "load", "adaptation.load")),
      publishSignal: immutableMethod(
        captureMethod(input, "publishSignal", "adaptation.publishSignal"),
      ),
      runCycle: immutableMethod(
        captureMethod(input, "runCycle", "adaptation.runCycle"),
      ),
    });
    autonomousCollectiveAdaptationAuthorityAdaptersV1.add(this);
  }
}

export function isAutonomousCollectiveExecutionAuthorityV1(
  value: unknown,
): value is
  | AssuranceCoupledExecutionRuntimeV1
  | AutonomousCollectiveExecutionAuthorityAdapterV1 {
  return (
    isAssuranceCoupledExecutionRuntimeV1(value) ||
    (typeof value === "object" &&
      value !== null &&
      autonomousCollectiveExecutionAuthorityAdaptersV1.has(value))
  );
}

export function isAutonomousCollectiveAdaptationAuthorityV1(
  value: unknown,
): value is
  | AutonomousAdaptationRuntimeV1
  | AutonomousCollectiveAdaptationAuthorityAdapterV1 {
  return (
    isAutonomousAdaptationRuntimeV1(value) ||
    (typeof value === "object" &&
      value !== null &&
      autonomousCollectiveAdaptationAuthorityAdaptersV1.has(value))
  );
}

interface AutonomousCollectiveNodeRuntimeInvokersV1 {
  readonly initialize: (
    logicalTimeMs?: number,
  ) => Promise<AutonomousCollectiveNodeStateV1>;
  readonly loadOptional: () => Promise<AutonomousCollectiveNodeStateV1 | null>;
  readonly load: () => Promise<AutonomousCollectiveNodeStateV1>;
  readonly submitMission: (input: {
    readonly intent: MissionIntentV1;
    readonly logicalTimeMs: number;
  }) => Promise<AutonomousCollectiveNodeStateV1>;
  readonly receive: (
    update: MeshSparseUpdateV2,
    logicalTimeMs: number,
  ) => Promise<DistributedCollectiveReceiveResultV1>;
  readonly advance: (input: {
    readonly logicalTimeMs: number;
  }) => Promise<AutonomousCollectiveNodeStateV1>;
}

interface AutonomousCollectiveNodeCapturedPortsV1 {
  readonly protocolInitialize: DistributedCollectiveProtocolRuntimeV1["initialize"];
  readonly protocolLoad: DistributedCollectiveProtocolRuntimeV1["load"];
  readonly protocolReceive: DistributedCollectiveProtocolRuntimeV1["receive"];
  readonly protocolPublish: DistributedCollectiveProtocolRuntimeV1["publish"];
  readonly protocolReconcilePublish: DistributedCollectiveProtocolRuntimeV1["reconcilePublish"];
  readonly protocolAcknowledgePublishCommand: DistributedCollectiveProtocolRuntimeV1["acknowledgePublishCommand"];
  readonly protocolMessages: DistributedCollectiveProtocolRuntimeV1["messages"];
  readonly proposeDecomposition: DistributedPlanningRuntimeV1["proposeDecomposition"];
  readonly reconcileProposeDecomposition: DistributedPlanningRuntimeV1["reconcileProposeDecomposition"];
  readonly reconcileDecompositions: DistributedPlanningRuntimeV1["reconcileDecompositions"];
  readonly reconcileDecompositionMerge: DistributedPlanningRuntimeV1["reconcileDecompositionMerge"];
  readonly commitBid: DistributedPlanningRuntimeV1["commitBid"];
  readonly reconcileBidCommitment: DistributedPlanningRuntimeV1["reconcileBidCommitment"];
  readonly revealBid: DistributedPlanningRuntimeV1["revealBid"];
  readonly reconcileBidReveal: DistributedPlanningRuntimeV1["reconcileBidReveal"];
  readonly decideAllocation: DistributedPlanningRuntimeV1["decideAllocation"];
  readonly reconcileAllocationDecision: DistributedPlanningRuntimeV1["reconcileAllocationDecision"];
  readonly settleAward: DistributedPlanningRuntimeV1["settleAward"];
  readonly reconcileAwardSettlement: DistributedPlanningRuntimeV1["reconcileAwardSettlement"];
  readonly execute: AssuranceCoupledExecutionRuntimeV1["execute"];
  readonly lookupExecutionReceipt: AssuranceCoupledExecutionRuntimeV1["lookupReceipt"];
  readonly adaptationInitialize: AutonomousAdaptationRuntimeV1["initialize"];
  readonly adaptationLoad: AutonomousAdaptationRuntimeV1["load"];
  readonly publishSignal: AutonomousAdaptationRuntimeV1["publishSignal"];
  readonly runAdaptationCycle: AutonomousAdaptationRuntimeV1["runCycle"];
  readonly availableRoleKeys: AutonomousCollectiveLocalPlanningPortV1["availableRoleKeys"];
  readonly proposeBids: AutonomousCollectiveLocalPlanningPortV1["proposeBids"];
  readonly certifyPlanning: AutonomousCollectivePlanningFinalityPortV1["certify"];
  readonly reconcilePlanningCertification: AutonomousCollectivePlanningFinalityPortV1["reconcileCertification"];
  readonly verifyPlanning: AutonomousCollectivePlanningFinalityPortV1["verify"];
  readonly prepareTask: AutonomousCollectiveTaskMaterializerPortV1["prepare"];
  readonly rehydrateTaskContext?: AutonomousCollectiveTaskContextRehydratorPortV1["rehydrate"];
  readonly loadState: AutonomousCollectiveNodeStoreV1["load"];
  readonly saveState: AutonomousCollectiveNodeStoreV1["save"];
  readonly saveStateWithTelemetry?: NonNullable<
    AutonomousCollectiveNodeStoreV1["saveWithTelemetry"]
  >;
  readonly reserveAdvance: AutonomousCollectiveNodeStoreV1["reserveAdvance"];
  readonly assertAdvanceFence: AutonomousCollectiveNodeStoreV1["assertAdvanceFence"];
  readonly saveAdvance: AutonomousCollectiveNodeStoreV1["saveAdvance"];
  readonly releaseAdvance: AutonomousCollectiveNodeStoreV1["releaseAdvance"];
  readonly runAdvanceCommand: AutonomousCollectiveNodeStoreV1["runAdvanceCommand"];
  readonly loadAdvanceCommandBinding: AutonomousCollectiveNodeStoreV1["loadAdvanceCommandBinding"];
}

const autonomousCollectiveNodeRuntimeInvokersV1 = new WeakMap<
  object,
  AutonomousCollectiveNodeRuntimeInvokersV1
>();

/**
 * Reference peer-local mission composition. A caller submits one governed
 * mission intent; subsequent ticks derive decomposition candidates, bids,
 * allocation inputs, execution material and adaptation evidence from local
 * state plus authenticated messages admitted by the sparse protocol.
 *
 * Logical-time ticks are scheduler events, not human decisions. The runtime
 * publishes `nextWakeAtLogicalMs` so an embedding daemon can continue the
 * mission without continuous operator input.
 */
export class AutonomousCollectiveNodeRuntimeV1 {
  readonly #runtimeId: string;
  readonly #crypto: Crypto;
  readonly #protocolScope: Readonly<{
    localPeerId: string;
    localInstanceId: string;
    scopeDigest: string;
    localKeyId: string;
    membershipConfigurationDigest: string;
  }>;
  readonly #adaptationMissionId: string;
  readonly #maximumDecompositionBudgetUnits: number;
  readonly #policy: AutonomousCollectiveNodePolicyV1;
  readonly #advanceHolderId: string;
  readonly #ports: AutonomousCollectiveNodeCapturedPortsV1;
  readonly #telemetry: CollectiveHostTelemetryPortV1 | undefined;
  readonly #telemetryRecord:
    CollectiveHostTelemetryPortV1["record"] | undefined;
  readonly #telemetryDeliveryMode:
    CollectiveHostTelemetryDeliveryModeV1 | undefined;
  readonly #telemetryStore: CollectiveHostTelemetryOutboxStoreV1 | undefined;
  #telemetryDrain: Promise<unknown> = Promise.resolve();
  readonly #advanceCommandAcknowledgements = new Map<string, Set<string>>();
  readonly #acknowledgedCommandDigests = new Set<string>();
  declare readonly initialize: AutonomousCollectiveNodeRuntimeInvokersV1["initialize"];
  declare readonly loadOptional: AutonomousCollectiveNodeRuntimeInvokersV1["loadOptional"];
  declare readonly load: AutonomousCollectiveNodeRuntimeInvokersV1["load"];
  declare readonly submitMission: AutonomousCollectiveNodeRuntimeInvokersV1["submitMission"];
  declare readonly receive: AutonomousCollectiveNodeRuntimeInvokersV1["receive"];
  declare readonly advance: AutonomousCollectiveNodeRuntimeInvokersV1["advance"];

  constructor(
    readonly options: {
      readonly runtimeId: string;
      readonly protocol: DistributedCollectiveProtocolRuntimeV1;
      readonly planning: DistributedPlanningRuntimeV1;
      readonly execution:
        | AssuranceCoupledExecutionRuntimeV1
        | AutonomousCollectiveExecutionAuthorityAdapterV1;
      readonly adaptation:
        | AutonomousAdaptationRuntimeV1
        | AutonomousCollectiveAdaptationAuthorityAdapterV1;
      readonly localPlanning: AutonomousCollectiveLocalPlanningPortV1;
      readonly planningFinality: AutonomousCollectivePlanningFinalityPortV1;
      readonly taskMaterializer: AutonomousCollectiveTaskMaterializerPortV1;
      readonly taskContextRehydrator?: AutonomousCollectiveTaskContextRehydratorPortV1;
      readonly policy: AutonomousCollectiveNodePolicyV1;
      /** Emits committed state transitions, never a control input. */
      readonly telemetry?: CollectiveHostTelemetryPortV1;
      readonly telemetryDeliveryMode?: CollectiveHostTelemetryDeliveryModeV1;
      readonly maximumPendingTelemetry?: number;
      readonly store?: AutonomousCollectiveNodeStoreV1;
      readonly crypto?: Crypto;
    },
  ) {
    const runtimeId = options.runtimeId;
    const protocol = options.protocol;
    const planning = options.planning;
    const execution = options.execution;
    const adaptation = options.adaptation;
    const localPlanning = options.localPlanning;
    const planningFinality = options.planningFinality;
    const taskMaterializer = options.taskMaterializer;
    const taskContextRehydrator = options.taskContextRehydrator;
    const policy = options.policy;
    const telemetry = options.telemetry;
    const telemetryDeliveryMode = options.telemetryDeliveryMode;
    const maximumPendingTelemetry = options.maximumPendingTelemetry;
    const configuredStore = options.store;
    const configuredCrypto = options.crypto;
    identifier(runtimeId, "runtimeId");
    if (!isDistributedCollectiveProtocolRuntimeV1(protocol))
      throw new TypeError("concrete distributed collective protocol is required");
    if (!isDistributedPlanningRuntimeV1(planning))
      throw new TypeError("concrete distributed collective planning is required");
    if (!isAutonomousCollectiveExecutionAuthorityV1(execution))
      throw new TypeError("nominal autonomous execution authority is required");
    if (!isAutonomousCollectiveAdaptationAuthorityV1(adaptation))
      throw new TypeError("nominal autonomous adaptation authority is required");
    if (
      !execution ||
      !adaptation ||
      !localPlanning ||
      !planningFinality ||
      !taskMaterializer
    )
      throw new TypeError("autonomous collective node ports are required");
    const protocolOptions = protocol.options;
    const planningOptions = planning.options;
    const executionOptions = execution.options;
    const adaptationOptions = adaptation.options;
    const localPeerId = protocolOptions.localPeerId;
    const localInstanceId = protocolOptions.localInstanceId;
    const scopeDigest = protocolOptions.scopeDigest;
    const localKeyId = protocolOptions.authenticity.localKeyId;
    const membershipConfigurationDigest =
      protocolOptions.membershipConfigurationDigest;
    if (
      planningOptions.protocol !== protocol ||
      adaptationOptions.protocol !== protocol
    )
      throw new TypeError(
        "autonomous collective node components must share one protocol runtime",
      );
    if (executionOptions.localPeerId !== localPeerId)
      throw new TypeError(
        "autonomous collective node execution peer differs from protocol peer",
      );
    this.#runtimeId = runtimeId;
    this.#crypto = captureDigestCrypto(configuredCrypto);
    this.#policy = validatePolicy(policy);
    this.#advanceHolderId = `holder:${runtimeId}:${randomHolderStem()}`;
    this.#protocolScope = Object.freeze({
      localPeerId,
      localInstanceId,
      scopeDigest,
      localKeyId,
      membershipConfigurationDigest,
    });
    this.#adaptationMissionId = adaptationOptions.missionId;
    this.#maximumDecompositionBudgetUnits =
      planningOptions.decompositionPolicy.maximumBudgetUnits;
    integer(
      maximumPendingTelemetry ?? 4_096,
      "maximumPendingTelemetry",
      1,
      100_000,
    );
    const store =
      configuredStore ??
      new InMemoryAutonomousCollectiveNodeStoreV1(
        maximumPendingTelemetry ?? 4_096,
      );
    const saveStateWithTelemetry = captureOptionalMethod<
      NonNullable<AutonomousCollectiveNodeStoreV1["saveWithTelemetry"]>
    >(store, "saveWithTelemetry", "store.saveWithTelemetry");
    const loadPendingTelemetry = captureOptionalMethod<
      CollectiveHostTelemetryOutboxStoreV1["loadPendingTelemetry"]
    >(store, "loadPendingTelemetry", "store.loadPendingTelemetry");
    const markTelemetryRecorded = captureOptionalMethod<
      CollectiveHostTelemetryOutboxStoreV1["markTelemetryRecorded"]
    >(store, "markTelemetryRecorded", "store.markTelemetryRecorded");
    const acknowledgeTelemetry = captureOptionalMethod<
      CollectiveHostTelemetryOutboxStoreV1["acknowledgeTelemetry"]
    >(store, "acknowledgeTelemetry", "store.acknowledgeTelemetry");
    const reserveAdvance = captureMethod<AutonomousCollectiveNodeStoreV1["reserveAdvance"]>(
      store,
      "reserveAdvance",
      "store.reserveAdvance",
    );
    const assertAdvanceFence = captureMethod<AutonomousCollectiveNodeStoreV1["assertAdvanceFence"]>(
      store,
      "assertAdvanceFence",
      "store.assertAdvanceFence",
    );
    const saveAdvance = captureMethod<AutonomousCollectiveNodeStoreV1["saveAdvance"]>(
      store,
      "saveAdvance",
      "store.saveAdvance",
    );
    const releaseAdvance = captureMethod<AutonomousCollectiveNodeStoreV1["releaseAdvance"]>(
      store,
      "releaseAdvance",
      "store.releaseAdvance",
    );
    const runAdvanceCommand = captureMethod<AutonomousCollectiveNodeStoreV1["runAdvanceCommand"]>(
      store,
      "runAdvanceCommand",
      "store.runAdvanceCommand",
    );
    const loadAdvanceCommandBinding = captureMethod<
      AutonomousCollectiveNodeStoreV1["loadAdvanceCommandBinding"]
    >(store, "loadAdvanceCommandBinding", "store.loadAdvanceCommandBinding");
    const rehydrateTaskContext = taskContextRehydrator
      ? captureMethod<AutonomousCollectiveTaskContextRehydratorPortV1["rehydrate"]>(
          taskContextRehydrator,
          "rehydrate",
          "taskContextRehydrator.rehydrate",
        )
      : undefined;
    this.#ports = Object.freeze({
      protocolInitialize: captureMethod<
        DistributedCollectiveProtocolRuntimeV1["initialize"]
      >(protocol, "initialize", "protocol.initialize"),
      protocolLoad: captureMethod<
        DistributedCollectiveProtocolRuntimeV1["load"]
      >(protocol, "load", "protocol.load"),
      protocolReceive: captureMethod<
        DistributedCollectiveProtocolRuntimeV1["receive"]
      >(protocol, "receive", "protocol.receive"),
      protocolPublish: captureMethod<
        DistributedCollectiveProtocolRuntimeV1["publish"]
      >(protocol, "publish", "protocol.publish"),
      protocolReconcilePublish: captureMethod<
        DistributedCollectiveProtocolRuntimeV1["reconcilePublish"]
      >(protocol, "reconcilePublish", "protocol.reconcilePublish"),
      protocolAcknowledgePublishCommand: captureMethod<
        DistributedCollectiveProtocolRuntimeV1["acknowledgePublishCommand"]
      >(protocol, "acknowledgePublishCommand", "protocol.acknowledgePublishCommand"),
      protocolMessages: captureMethod<
        DistributedCollectiveProtocolRuntimeV1["messages"]
      >(protocol, "messages", "protocol.messages"),
      proposeDecomposition: captureMethod<
        DistributedPlanningRuntimeV1["proposeDecomposition"]
      >(planning, "proposeDecomposition", "planning.proposeDecomposition"),
      reconcileProposeDecomposition: captureMethod<
        DistributedPlanningRuntimeV1["reconcileProposeDecomposition"]
      >(planning, "reconcileProposeDecomposition", "planning.reconcileProposeDecomposition"),
      reconcileDecompositions: captureMethod<
        DistributedPlanningRuntimeV1["reconcileDecompositions"]
      >(
        planning,
        "reconcileDecompositions",
        "planning.reconcileDecompositions",
      ),
      reconcileDecompositionMerge: captureMethod<
        DistributedPlanningRuntimeV1["reconcileDecompositionMerge"]
      >(planning, "reconcileDecompositionMerge", "planning.reconcileDecompositionMerge"),
      commitBid: captureMethod<DistributedPlanningRuntimeV1["commitBid"]>(
        planning,
        "commitBid",
        "planning.commitBid",
      ),
      reconcileBidCommitment: captureMethod<
        DistributedPlanningRuntimeV1["reconcileBidCommitment"]
      >(planning, "reconcileBidCommitment", "planning.reconcileBidCommitment"),
      revealBid: captureMethod<DistributedPlanningRuntimeV1["revealBid"]>(
        planning,
        "revealBid",
        "planning.revealBid",
      ),
      reconcileBidReveal: captureMethod<
        DistributedPlanningRuntimeV1["reconcileBidReveal"]
      >(planning, "reconcileBidReveal", "planning.reconcileBidReveal"),
      decideAllocation: captureMethod<
        DistributedPlanningRuntimeV1["decideAllocation"]
      >(planning, "decideAllocation", "planning.decideAllocation"),
      reconcileAllocationDecision: captureMethod<
        DistributedPlanningRuntimeV1["reconcileAllocationDecision"]
      >(planning, "reconcileAllocationDecision", "planning.reconcileAllocationDecision"),
      settleAward: captureMethod<DistributedPlanningRuntimeV1["settleAward"]>(
        planning,
        "settleAward",
        "planning.settleAward",
      ),
      reconcileAwardSettlement: captureMethod<
        DistributedPlanningRuntimeV1["reconcileAwardSettlement"]
      >(planning, "reconcileAwardSettlement", "planning.reconcileAwardSettlement"),
      execute: captureMethod<AssuranceCoupledExecutionRuntimeV1["execute"]>(
        execution,
        "execute",
        "execution.execute",
      ),
      lookupExecutionReceipt: captureMethod<
        AssuranceCoupledExecutionRuntimeV1["lookupReceipt"]
      >(execution, "lookupReceipt", "execution.lookupReceipt"),
      adaptationInitialize: captureMethod<
        AutonomousAdaptationRuntimeV1["initialize"]
      >(adaptation, "initialize", "adaptation.initialize"),
      adaptationLoad: captureMethod<AutonomousAdaptationRuntimeV1["load"]>(
        adaptation,
        "load",
        "adaptation.load",
      ),
      publishSignal: captureMethod<
        AutonomousAdaptationRuntimeV1["publishSignal"]
      >(adaptation, "publishSignal", "adaptation.publishSignal"),
      runAdaptationCycle: captureMethod<
        AutonomousAdaptationRuntimeV1["runCycle"]
      >(adaptation, "runCycle", "adaptation.runCycle"),
      availableRoleKeys: captureMethod<
        AutonomousCollectiveLocalPlanningPortV1["availableRoleKeys"]
      >(localPlanning, "availableRoleKeys", "localPlanning.availableRoleKeys"),
      proposeBids: captureMethod<
        AutonomousCollectiveLocalPlanningPortV1["proposeBids"]
      >(localPlanning, "proposeBids", "localPlanning.proposeBids"),
      certifyPlanning: captureMethod<
        AutonomousCollectivePlanningFinalityPortV1["certify"]
      >(planningFinality, "certify", "planningFinality.certify"),
      reconcilePlanningCertification: captureMethod<
        AutonomousCollectivePlanningFinalityPortV1["reconcileCertification"]
      >(
        planningFinality,
        "reconcileCertification",
        "planningFinality.reconcileCertification",
      ),
      verifyPlanning: captureMethod<
        AutonomousCollectivePlanningFinalityPortV1["verify"]
      >(planningFinality, "verify", "planningFinality.verify"),
      prepareTask: captureMethod<
        AutonomousCollectiveTaskMaterializerPortV1["prepare"]
      >(taskMaterializer, "prepare", "taskMaterializer.prepare"),
      ...(rehydrateTaskContext ? { rehydrateTaskContext } : {}),
      loadState: captureMethod<AutonomousCollectiveNodeStoreV1["load"]>(
        store,
        "load",
        "store.load",
      ),
      saveState: captureMethod<AutonomousCollectiveNodeStoreV1["save"]>(
        store,
        "save",
        "store.save",
      ),
      ...(saveStateWithTelemetry ? { saveStateWithTelemetry } : {}),
      reserveAdvance,
      assertAdvanceFence,
      saveAdvance,
      releaseAdvance,
      runAdvanceCommand,
      loadAdvanceCommandBinding,
    });
    this.#telemetry = telemetry;
    this.#telemetryRecord = telemetry
      ? captureMethod<CollectiveHostTelemetryPortV1["record"]>(
          telemetry,
          "record",
          "telemetry.record",
        )
      : undefined;
    this.#telemetryDeliveryMode = telemetryDeliveryMode;
    if (telemetryDeliveryMode === "durable_outbox") {
      if (
        !isCollectiveHostDurableTelemetryPortV1(telemetry) ||
        !this.#ports.saveStateWithTelemetry ||
        !loadPendingTelemetry ||
        !markTelemetryRecorded ||
        !acknowledgeTelemetry
      )
        throw new TypeError(
          "durable autonomous node telemetry outbox capabilities are required",
        );
      this.#telemetryStore = Object.freeze({
        loadPendingTelemetry,
        markTelemetryRecorded,
        acknowledgeTelemetry,
      });
    } else {
      this.#telemetryStore = undefined;
    }
    Object.defineProperty(this, "options", {
      value: Object.freeze({
        runtimeId,
        protocol,
        planning,
        execution,
        adaptation,
        localPlanning,
        planningFinality,
        taskMaterializer,
        taskContextRehydrator,
        policy: this.#policy,
        telemetry,
        telemetryDeliveryMode,
        maximumPendingTelemetry,
        store,
        crypto: configuredCrypto,
      }),
      writable: false,
      configurable: false,
      enumerable: true,
    });
    const invokers: AutonomousCollectiveNodeRuntimeInvokersV1 = Object.freeze({
      initialize: (logicalTimeMs = 0) => this.#initialize(logicalTimeMs),
      loadOptional: () => this.#loadOptional(),
      load: () => this.#load(),
      submitMission: (
        input: Parameters<
          AutonomousCollectiveNodeRuntimeInvokersV1["submitMission"]
        >[0],
      ) => this.#submitMission(input),
      receive: (update: MeshSparseUpdateV2, logicalTimeMs: number) =>
        this.#receive(update, logicalTimeMs),
      advance: (
        input: Parameters<
          AutonomousCollectiveNodeRuntimeInvokersV1["advance"]
        >[0],
      ) => this.#advance(input),
    });
    autonomousCollectiveNodeRuntimeInvokersV1.set(this, invokers);
    Object.defineProperties(this, {
      initialize: immutableMethod(invokers.initialize),
      loadOptional: immutableMethod(invokers.loadOptional),
      load: immutableMethod(invokers.load),
      submitMission: immutableMethod(invokers.submitMission),
      receive: immutableMethod(invokers.receive),
      advance: immutableMethod(invokers.advance),
    });
  }

  async #initialize(
    logicalTimeMs = 0,
  ): Promise<AutonomousCollectiveNodeStateV1> {
    integer(logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    try {
      await this.#ports.protocolInitialize(logicalTimeMs);
    } catch (initializationError) {
      try {
        await this.#ports.protocolLoad();
      } catch {
        throw initializationError;
      }
    }
    try {
      await this.#ports.adaptationInitialize(logicalTimeMs);
    } catch (initializationError) {
      try {
        await this.#ports.adaptationLoad();
      } catch {
        throw initializationError;
      }
    }
    const state = await this.#state({
      schemaVersion: 1,
      runtimeId: this.#runtimeId,
      status: "idle",
      revision: 0,
      logicalTimeHighWaterMs: logicalTimeMs,
      intent: null,
      cycle: null,
      localGraph: null,
      graph: null,
      graphMerge: null,
      localBids: [],
      plan: null,
      planningDecisionDigest: null,
      planningEvidenceMessageDigests: [],
      planningFinality: null,
      executionReceipts: [],
      semanticSequenceHighWater: 0,
      awardOperations: [],
      commandAcknowledgementDigests: [],
      adaptationDecision: null,
      cycleOutcome: null,
      blockingReason: null,
      nextWakeAtLogicalMs: null,
      previousStateDigest: null,
    });
    if (!(await this.#ports.saveState(state, null))) {
      const existing = await this.#ports.loadState(this.#runtimeId);
      if (!existing)
        throw new Error("autonomous collective node initialization conflict");
      return this.#validateLoadedState(existing);
    }
    return state;
  }

  /** Returns null only for absence; invalid persisted state still fails closed. */
  async #loadOptional(): Promise<AutonomousCollectiveNodeStateV1 | null> {
    await this.#drainTelemetry();
    const state = await this.#ports.loadState(this.#runtimeId);
    if (!state) return null;
    const validated = await this.#validateLoadedState(state);
    for (const commandDigest of validated.commandAcknowledgementDigests ?? []) {
      await this.#ports.protocolAcknowledgePublishCommand(commandDigest);
      this.#acknowledgedCommandDigests.add(commandDigest);
    }
    return validated;
  }

  async #load(): Promise<AutonomousCollectiveNodeStateV1> {
    const state = await this.#loadOptional();
    if (!state)
      throw new Error("autonomous collective node is not initialized");
    return state;
  }

  async #validateLoadedState(
    state: AutonomousCollectiveNodeStateV1,
  ): Promise<AutonomousCollectiveNodeStateV1> {
    if (state.runtimeId !== this.#runtimeId || state.schemaVersion !== 1)
      throw new TypeError(
        "autonomous collective node state binding is invalid",
      );
    integer(state.revision, "state.revision", 0, Number.MAX_SAFE_INTEGER);
    integer(
      state.logicalTimeHighWaterMs,
      "state.logicalTimeHighWaterMs",
      0,
      Number.MAX_SAFE_INTEGER,
    );
    integer(
      state.semanticSequenceHighWater,
      "state.semanticSequenceHighWater",
      0,
      Number.MAX_SAFE_INTEGER,
    );
    digest(state.stateDigest, "state.stateDigest");
    if (state.previousStateDigest !== null)
      digest(state.previousStateDigest, "state.previousStateDigest");
    if (
      (state.planningDecisionDigest === null) !==
      (state.planningFinality === null)
    )
      throw new TypeError(
        "autonomous collective planning decision/finality binding is incomplete",
      );
    if (state.planningDecisionDigest !== null) {
      digest(state.planningDecisionDigest, "state.planningDecisionDigest");
      if (
        state.planningFinality!.proposalDigest !== state.planningDecisionDigest
      )
        throw new TypeError(
          "autonomous collective planning finality changed its decision",
        );
    }
    const planningEvidence = [
      ...new Set(state.planningEvidenceMessageDigests),
    ].sort();
    if (
      planningEvidence.length !== state.planningEvidenceMessageDigests.length ||
      planningEvidence.some(
        (item, index) => item !== state.planningEvidenceMessageDigests[index],
      )
    )
      throw new TypeError(
        "autonomous collective planning evidence is not canonical",
      );
    planningEvidence.forEach((item) =>
      digest(item, "state.planningEvidenceMessageDigest"),
    );
    if (state.planningDecisionDigest === null && planningEvidence.length !== 0)
      throw new TypeError(
        "planning evidence exists without a planning decision",
      );
    const commandAcknowledgements = [
      ...new Set(state.commandAcknowledgementDigests ?? []),
    ].sort();
    if (
      commandAcknowledgements.length !==
        (state.commandAcknowledgementDigests ?? []).length ||
      commandAcknowledgements.some(
        (item, index) => item !== state.commandAcknowledgementDigests![index],
      )
    )
      throw new TypeError("autonomous command acknowledgements are not canonical");
    commandAcknowledgements.forEach((item) =>
      digest(item, "state.commandAcknowledgementDigest"),
    );
    const operations = state.awardOperations ?? [];
    const seenAwards = new Set<string>();
    let priorSequence = 0;
    for (const operation of operations) {
      digest(operation.awardDigest, "awardOperation.awardDigest");
      integer(operation.semanticSequence, "awardOperation.semanticSequence", 1, Number.MAX_SAFE_INTEGER);
      integer(operation.canonicalLogicalTimeMs, "awardOperation.canonicalLogicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
      if (
        operation.schemaVersion !== 1 ||
        seenAwards.has(operation.awardDigest) ||
        operation.semanticSequence <= priorSequence ||
        operation.semanticSequence > state.semanticSequenceHighWater ||
        operation.executionId !== `execution:${operation.awardDigest.slice(7, 47)}` ||
        operation.materializationId !== `materialization:${operation.awardDigest.slice(7, 47)}`
      )
        throw new TypeError("autonomous award operation binding is invalid");
      seenAwards.add(operation.awardDigest);
      priorSequence = operation.semanticSequence;
      const materialized = operation.phase !== "reserved";
      if (
        materialized !== Boolean(operation.cognitiveRequest) ||
        materialized !== Boolean(operation.cognitiveContextBinding)
      )
        throw new TypeError("autonomous award materialization is incomplete");
      if (operation.cognitiveRequest) {
        if (
          operation.cognitiveRequest.logicalTimeMs !== operation.canonicalLogicalTimeMs ||
          operation.cognitiveRequest.controlPlaneDigest !== state.planningFinality?.certificateDigest ||
          operation.cognitiveRequest.tenantId !== operation.cognitiveContextBinding!.tenant.tenantId
        )
          throw new TypeError("autonomous award cognitive binding changed");
      }
      const hasReceipt = awardPhaseAtLeast(operation.phase, "assurance_completed");
      if (hasReceipt !== Boolean(operation.receipt))
        throw new TypeError("autonomous award assurance receipt is incomplete");
      if (
        operation.receipt &&
        (operation.receipt.executionId !== operation.executionId ||
          operation.receipt.awardDigest !== operation.awardDigest ||
          operation.receipt.logicalTimeMs !== operation.canonicalLogicalTimeMs)
      )
        throw new TypeError("autonomous award assurance receipt changed binding");
      const hasSignal = awardPhaseAtLeast(operation.phase, "signal_enqueued");
      if (hasSignal !== Boolean(operation.signal))
        throw new TypeError("autonomous award signal is incomplete");
      if (
        operation.signal &&
        (operation.signal.signalId !== `signal:${operation.awardDigest.slice(7, 47)}` ||
          operation.signal.observedAtLogicalMs !== operation.canonicalLogicalTimeMs ||
          !operation.receipt ||
          !operation.signal.evidenceDigests.includes(operation.receipt.receiptDigest))
      )
        throw new TypeError("autonomous award signal changed binding");
    }
    const { stateDigest, ...body } = state;
    const expectedDigest = await collectiveQuorumDigestV1(
      {
        domain: "autonomous-collective-node-state-v1",
        body,
      },
      this.#crypto,
    );
    if (stateDigest !== expectedDigest)
      throw new TypeError("autonomous collective node state digest is invalid");
    return immutable(state);
  }

  /** Accepts only the high-level governed mission plus logical admission time. */
  async #submitMission(input: {
    readonly intent: MissionIntentV1;
    readonly logicalTimeMs: number;
  }): Promise<AutonomousCollectiveNodeStateV1> {
    const intent = validateMissionIntentV1(input.intent);
    integer(input.logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    const current = await this.#load();
    if (current.status !== "idle")
      throw new Error(
        "autonomous collective node already owns a mission cycle",
      );
    if (this.#adaptationMissionId !== intent.missionIntentId)
      throw new TypeError(
        "autonomous adaptation mission differs from submitted intent",
      );
    if (input.logicalTimeMs < current.logicalTimeHighWaterMs)
      throw new Error("autonomous collective node logical time rollback");
    const stem = intent.intentDigest.slice(7, 47);
    const graphClose = safeAdd(
      input.logicalTimeMs,
      this.#policy.graphProposalWindowMs,
    );
    const commitmentClose = safeAdd(
      graphClose,
      this.#policy.bidCommitmentWindowMs,
    );
    const revealClose = safeAdd(
      commitmentClose,
      this.#policy.bidRevealWindowMs,
    );
    const cycle: DistributedPlanningCycleV1 = {
      schemaVersion: 1,
      cycleId: `mission:${stem}`,
      missionIntentId: intent.missionIntentId,
      intentRevision: intent.revision,
      intentDigest: intent.intentDigest,
      allocationId: `allocation:${stem}`,
      graphProposalCloseAtLogicalMs: graphClose,
      bidCommitmentCloseAtLogicalMs: commitmentClose,
      bidRevealCloseAtLogicalMs: revealClose,
    };
    const accepted = await this.#commit(
      current,
      {
        status: "accepted",
        intent,
        cycle,
        nextWakeAtLogicalMs: input.logicalTimeMs,
      },
      input.logicalTimeMs,
    );
    return this.#advance({ logicalTimeMs: accepted.logicalTimeHighWaterMs });
  }

  /** Admits one sparse-plane update; no mission-global view is accepted here. */
  #receive(
    update: MeshSparseUpdateV2,
    logicalTimeMs: number,
  ): Promise<DistributedCollectiveReceiveResultV1> {
    return this.#ports.protocolReceive(update, logicalTimeMs);
  }

  /** Advances all work that is legal at the supplied local logical time. */
  async #advance(input: {
    readonly logicalTimeMs: number;
  }): Promise<AutonomousCollectiveNodeStateV1> {
    integer(input.logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    const state = await this.#load();
    if (input.logicalTimeMs < state.logicalTimeHighWaterMs)
      throw new Error("autonomous collective node logical time rollback");
    if (state.status === "idle" || state.status === "completed" || state.status === "blocked")
      return state;
    const reservation = await this.#ports.reserveAdvance({
      runtimeId: this.#runtimeId,
      expectedRevision: state.revision,
      requestedLogicalTimeMs: input.logicalTimeMs,
      holderId: this.#advanceHolderId,
      leaseDurationMs: this.#policy.advanceLeaseDurationMs ?? 30_000,
    });
    if (!reservation) return this.#load();
    const logicalTimeMs = reservation.canonicalLogicalTimeMs;
    let result: AutonomousCollectiveNodeStateV1;
    switch (state.status) {
      case "accepted":
        result = await this.#publishIntentAndGraph(state, logicalTimeMs, reservation);
        break;
      case "collecting_graphs":
        if (logicalTimeMs < state.cycle!.graphProposalCloseAtLogicalMs)
          result = state;
        else if (logicalTimeMs >= state.cycle!.bidCommitmentCloseAtLogicalMs)
          result = await this.#block(state, "graph_reconciliation_window_missed", logicalTimeMs, reservation);
        else
          result = await this.#reconcileAndCommitBids(state, logicalTimeMs, reservation);
        break;
      case "collecting_bid_commitments":
        if (logicalTimeMs < state.cycle!.bidCommitmentCloseAtLogicalMs)
          result = state;
        else if (logicalTimeMs >= state.cycle!.bidRevealCloseAtLogicalMs)
          result = await this.#block(state, "bid_reveal_window_missed", logicalTimeMs, reservation);
        else
          result = await this.#revealBids(state, logicalTimeMs, reservation);
        break;
      case "collecting_bid_reveals":
        result = logicalTimeMs < state.cycle!.bidRevealCloseAtLogicalMs
          ? state
          : await this.#allocateAndExecute(state, logicalTimeMs, reservation);
        break;
      case "executing":
        result = await this.#executeLocalAwards(state, logicalTimeMs, reservation);
        break;
      default:
        result = state;
    }
    if (!(await this.#ports.releaseAdvance(reservation)))
      throw new Error("autonomous collective node advance fence became stale");
    return result;
  }

  async #publishIntentAndGraph(
    state: AutonomousCollectiveNodeStateV1,
    logicalTimeMs: number,
    reservation: AutonomousCollectiveAdvanceReservationV1,
  ): Promise<AutonomousCollectiveNodeStateV1> {
    const intent = state.intent!;
    const cycle = state.cycle!;
    if (logicalTimeMs >= cycle.graphProposalCloseAtLogicalMs)
      return this.#block(state, "graph_proposal_window_missed", logicalTimeMs, reservation);
    const admitted = await this.#messages(cycle.cycleId, logicalTimeMs);
    const hasLocalIntent = admitted.some(
      (message) =>
        message.kind === "context.claim" &&
        message.issuerPeerId === this.#protocolScope.localPeerId &&
        isMissionIntentPayload(message.payload, intent.intentDigest),
    );
    if (!hasLocalIntent) {
      await this.#runAdvanceCommand(
        reservation,
        "publish:intent",
        { cycleId: cycle.cycleId, intentDigest: intent.intentDigest },
        (commandBindingDigest) => this.#ports.protocolPublish({
        cycleId: cycle.cycleId,
        streamId: `intent:${intent.intentDigest.slice(7, 47)}`,
        kind: "context.claim",
        payload: immutable({
          schemaVersion: 1,
          payloadKind: "mission_intent",
          intent,
        } satisfies AutonomousCollectiveMissionIntentPayloadV1),
        logicalTimeMs,
        lifetime: this.#policy.messageLifetimeMs,
        ...(this.#policy.fanout === undefined
          ? {}
          : { fanout: this.#policy.fanout }),
        commandBindingDigest,
        }),
        {
          kind: "reconcile",
          acknowledgeProtocolCommand: true,
          reconcile: async (commandBindingDigest) => {
            const message = await this.#ports.protocolReconcilePublish({
              cycleId: cycle.cycleId,
              streamId: `intent:${intent.intentDigest.slice(7, 47)}`,
              kind: "context.claim",
              payload: immutable({
                schemaVersion: 1,
                payloadKind: "mission_intent",
                intent,
              } satisfies AutonomousCollectiveMissionIntentPayloadV1),
              logicalTimeMs,
              lifetime: this.#policy.messageLifetimeMs,
              ...(this.#policy.fanout === undefined
                ? {}
                : { fanout: this.#policy.fanout }),
              commandBindingDigest,
            });
            return message
              ? { found: true as const, value: message }
              : { found: false as const };
          },
        },
      );
    }
    const currentContext = await this.#messages(cycle.cycleId, logicalTimeMs);
    const admittedMessageDigests = await this.#durableEvidenceSnapshot(
      reservation,
      "planning:decomposition",
      { cycleId: cycle.cycleId, intentDigest: intent.intentDigest },
      currentContext.map((message) => message.messageDigest).sort(),
    );
    await this.#assertMessageSnapshot(
      cycle.cycleId,
      logicalTimeMs,
      admittedMessageDigests,
    );
    const admittedSet = new Set(admittedMessageDigests);
    const context = currentContext.filter((message) =>
      admittedSet.has(message.messageDigest),
    );
    const availableRoleKeys = canonicalStrings(
      await this.#runAdvanceCommand(
        reservation,
        "local:available-roles",
        {
          intentDigest: intent.intentDigest,
          admittedMessageDigests: context.map((message) => message.messageDigest).sort(),
        },
        () => this.#ports.availableRoleKeys({
          intent,
          admittedMessages: context,
          logicalTimeMs,
        }),
        { kind: "repeatable" },
      ),
      "availableRoleKeys",
    );
    if (availableRoleKeys.length === 0)
      return this.#block(state, "local_role_catalog_empty", logicalTimeMs, reservation);
    const observationDigests = [
      ...new Set(
        context
          .filter((message) => message.kind === "context.claim")
          .map((message) => message.payloadDigest as PlanningDigestV1),
      ),
    ].sort();
    const request = createMissionDecompositionRequestV1({
      schemaVersion: 1,
      requestId: `request:${intent.intentDigest.slice(7, 47)}`,
      missionIntentId: intent.missionIntentId,
      intentRevision: intent.revision,
      intentDigest: intent.intentDigest,
      proposerPeerId: this.#protocolScope.localPeerId,
      proposerInstanceId: this.#protocolScope.localInstanceId,
      outcomeStatements: intent.outcomeStatements,
      permittedCapabilityKeys: intent.permittedCapabilityKeys,
      availableRoleKeys,
      observationDigests,
      totalBudgetUnits: Math.min(
        intent.planningLimits.maximumTotalPlanningBudgetUnits,
        this.#maximumDecompositionBudgetUnits,
      ),
      priorGraphDigest: null,
      logicalTimeMs,
    });
    const localGraph = await this.#runAdvanceCommand(
      reservation,
      "planning:decomposition",
      {
        cycleId: cycle.cycleId,
        intentDigest: intent.intentDigest,
        request,
        admittedMessageDigests,
      },
      async (commandBindingDigest) => {
        await this.#assertMessageSnapshot(
          cycle.cycleId,
          logicalTimeMs,
          admittedMessageDigests,
        );
        return this.#ports.proposeDecomposition({
          cycle,
          request,
          publication: this.#publication(logicalTimeMs),
          commandBindingDigest,
        });
      },
      {
        kind: "reconcile",
        acknowledgeProtocolCommand: true,
        reconcile: async (commandBindingDigest) => {
          const graph = await this.#ports.reconcileProposeDecomposition({
            cycle,
            request,
            publication: this.#publication(logicalTimeMs),
            commandBindingDigest,
          });
          return graph
            ? { found: true as const, value: graph }
            : { found: false as const };
        },
      },
    );
    return this.#commit(
      state,
      {
        status: "collecting_graphs",
        localGraph,
        nextWakeAtLogicalMs: cycle.graphProposalCloseAtLogicalMs,
      },
      logicalTimeMs,
      reservation,
    );
  }

  async #reconcileAndCommitBids(
    state: AutonomousCollectiveNodeStateV1,
    logicalTimeMs: number,
    reservation: AutonomousCollectiveAdvanceReservationV1,
  ): Promise<AutonomousCollectiveNodeStateV1> {
    const admitted = await this.#messages(state.cycle!.cycleId, logicalTimeMs);
    const currentAdmittedMessageDigests = admitted
      .map((message) => message.messageDigest)
      .sort();
    const admittedMessageDigests = await this.#durableEvidenceSnapshot(
      reservation,
      "planning:reconcile",
      { cycleId: state.cycle!.cycleId },
      currentAdmittedMessageDigests,
    );
    const mergeResult = await this.#runAdvanceCommand(
      reservation,
      "planning:reconcile",
      { cycleId: state.cycle!.cycleId, admittedMessageDigests },
      async (commandBindingDigest) => {
        await this.#assertMessageSnapshot(
          state.cycle!.cycleId,
          logicalTimeMs,
          admittedMessageDigests,
        );
        return this.#ports.reconcileDecompositions({
          cycle: state.cycle!,
          priorGraph: null,
          publication: this.#publication(logicalTimeMs),
          commandBindingDigest,
          admittedMessageDigests,
        });
      },
      {
        kind: "reconcile",
        acknowledgeProtocolCommand: true,
        reconcile: async (commandBindingDigest) => {
          const reconciled = await this.#ports.reconcileDecompositionMerge({
            cycle: state.cycle!,
            priorGraph: null,
            publication: this.#publication(logicalTimeMs),
            commandBindingDigest,
            admittedMessageDigests,
          });
          return reconciled
            ? { found: true as const, value: reconciled }
            : { found: false as const };
        },
      },
    );
    if (!mergeResult)
      throw new Error("distributed graph merge command returned no result");
    const { graph, merge } = mergeResult;
    const admittedSet = new Set(admittedMessageDigests);
    const admittedSnapshot = admitted.filter((message) =>
      admittedSet.has(message.messageDigest),
    );
    const proposed = await this.#runAdvanceCommand(
      reservation,
      "local:propose-bids",
      {
        graphDigest: graph.graphDigest,
        admittedMessageDigests,
      },
      async () => {
        await this.#assertMessageSnapshot(
          state.cycle!.cycleId,
          logicalTimeMs,
          admittedMessageDigests,
        );
        return this.#ports.proposeBids({
          intent: state.intent!,
          cycle: state.cycle!,
          graph,
          admittedMessages: admittedSnapshot,
          localPeerId: this.#protocolScope.localPeerId,
          localInstanceId: this.#protocolScope.localInstanceId,
          scopeDigest: this.#protocolScope.scopeDigest,
          logicalTimeMs,
        });
      },
      { kind: "repeatable" },
    );
    if (proposed.length > this.#policy.maximumLocalBids)
      throw new RangeError("autonomous collective local bid capacity exceeded");
    const taskIds = new Set(graph.tasks.map((task) => task.taskId));
    const seenTasks = new Set<string>();
    const localBids: AutonomousCollectiveCommittedBidV1[] = [];
    for (const [index, bid] of proposed.entries()) {
      validateLocalBid(
        bid,
        taskIds,
        seenTasks,
        state.cycle!,
        this.#protocolScope,
        logicalTimeMs,
      );
      seenTasks.add(bid.taskId);
      const sealedBidDigest = strategicSealedBidDigestV1({
        allocationId: state.cycle!.allocationId,
        taskId: bid.taskId,
        peerId: this.#protocolScope.localPeerId,
        peerInstanceId: this.#protocolScope.localInstanceId,
        independenceGroupId: bid.independenceGroupId,
        declaredUtilityMicros: bid.declaredUtilityMicros,
        declaredCostUnits: bid.declaredCostUnits,
        declaredResourceUnits: bid.declaredResourceUnits,
        requestedBudgetUnits: bid.requestedBudgetUnits,
        collateralUnits: bid.collateralUnits,
        availabilityUntilLogicalMs: bid.availabilityUntilLogicalMs,
        capabilityAttestationDigest: bid.attestation.attestationDigest,
        nonceDigest: bid.nonceDigest,
      });
      const commitment = createStrategicBidCommitmentV1({
        commitmentId: `bid:${state.cycle!.intentDigest.slice(7, 39)}:${index}`,
        allocationId: state.cycle!.allocationId,
        taskId: bid.taskId,
        peerId: this.#protocolScope.localPeerId,
        peerInstanceId: this.#protocolScope.localInstanceId,
        independenceGroupId: bid.independenceGroupId,
        sealedBidDigest,
        committedAtLogicalMs: logicalTimeMs,
      });
      await this.#runAdvanceCommand(
        reservation,
        `bid:commit:${index}`,
        commitment,
        (commandBindingDigest) => this.#ports.commitBid({
        cycle: state.cycle!,
        graphDigest: graph.graphDigest,
        commitment,
        publication: this.#publication(logicalTimeMs),
        commandBindingDigest,
        }),
        {
          kind: "reconcile",
          acknowledgeProtocolCommand: true,
          reconcile: async (commandBindingDigest) =>
            (await this.#ports.reconcileBidCommitment({
              cycle: state.cycle!,
              graphDigest: graph.graphDigest,
              commitment,
              publication: this.#publication(logicalTimeMs),
              commandBindingDigest,
            }))
              ? { found: true as const, value: undefined }
              : { found: false as const },
        },
      );
      localBids.push(immutable({ bid, commitment }));
    }
    return this.#commit(
      state,
      {
        status: "collecting_bid_commitments",
        graph,
        graphMerge: merge,
        localBids,
        nextWakeAtLogicalMs: state.cycle!.bidCommitmentCloseAtLogicalMs,
      },
      logicalTimeMs,
      reservation,
    );
  }

  async #revealBids(
    state: AutonomousCollectiveNodeStateV1,
    logicalTimeMs: number,
    reservation: AutonomousCollectiveAdvanceReservationV1,
  ): Promise<AutonomousCollectiveNodeStateV1> {
    for (const [index, local] of state.localBids.entries()) {
      const bid = local.bid;
      const reveal = createStrategicBidRevealV1({
        revealId: `reveal:${state.cycle!.intentDigest.slice(7, 36)}:${index}`,
        commitmentId: local.commitment.commitmentId,
        allocationId: state.cycle!.allocationId,
        taskId: bid.taskId,
        peerId: this.#protocolScope.localPeerId,
        peerInstanceId: this.#protocolScope.localInstanceId,
        independenceGroupId: bid.independenceGroupId,
        declaredUtilityMicros: bid.declaredUtilityMicros,
        declaredCostUnits: bid.declaredCostUnits,
        declaredResourceUnits: bid.declaredResourceUnits,
        requestedBudgetUnits: bid.requestedBudgetUnits,
        collateralUnits: bid.collateralUnits,
        availabilityUntilLogicalMs: bid.availabilityUntilLogicalMs,
        capabilityAttestationDigest: bid.attestation.attestationDigest,
        nonceDigest: bid.nonceDigest,
        revealedAtLogicalMs: logicalTimeMs,
      });
      await this.#runAdvanceCommand(
        reservation,
        `bid:reveal:${index}`,
        reveal,
        (commandBindingDigest) => this.#ports.revealBid({
        cycle: state.cycle!,
        graphDigest: state.graph!.graphDigest,
        reveal,
        attestation: bid.attestation,
        peerProjection: bid.peerProjection,
        publication: this.#publication(logicalTimeMs),
        commandBindingDigest,
        }),
        {
          kind: "reconcile",
          acknowledgeProtocolCommand: true,
          reconcile: async (commandBindingDigest) =>
            (await this.#ports.reconcileBidReveal({
              cycle: state.cycle!,
              graphDigest: state.graph!.graphDigest,
              reveal,
              attestation: bid.attestation,
              peerProjection: bid.peerProjection,
              publication: this.#publication(logicalTimeMs),
              commandBindingDigest,
            }))
              ? { found: true as const, value: undefined }
              : { found: false as const },
        },
      );
    }
    return this.#commit(
      state,
      {
        status: "collecting_bid_reveals",
        nextWakeAtLogicalMs: state.cycle!.bidRevealCloseAtLogicalMs,
      },
      logicalTimeMs,
      reservation,
    );
  }

  async #allocateAndExecute(
    state: AutonomousCollectiveNodeStateV1,
    logicalTimeMs: number,
    reservation: AutonomousCollectiveAdvanceReservationV1,
  ): Promise<AutonomousCollectiveNodeStateV1> {
    const admitted = await this.#messages(state.cycle!.cycleId, logicalTimeMs);
    const currentAdmittedMessageDigests = admitted
      .map((message) => message.messageDigest)
      .sort();
    const admittedMessageDigests = await this.#durableEvidenceSnapshot(
      reservation,
      "planning:allocate",
      {
        cycleId: state.cycle!.cycleId,
        graphDigest: state.graph!.graphDigest,
      },
      currentAdmittedMessageDigests,
    );
    const plan = await this.#runAdvanceCommand(
      reservation,
      "planning:allocate",
      {
        cycleId: state.cycle!.cycleId,
        graphDigest: state.graph!.graphDigest,
        admittedMessageDigests,
      },
      async (commandBindingDigest) => {
        await this.#assertMessageSnapshot(
          state.cycle!.cycleId,
          logicalTimeMs,
          admittedMessageDigests,
        );
        return this.#ports.decideAllocation({
          cycle: state.cycle!,
          graph: state.graph!,
          publication: this.#publication(logicalTimeMs),
          commandBindingDigest,
          admittedMessageDigests,
        });
      },
      {
        kind: "reconcile",
        acknowledgeProtocolCommand: true,
        reconcile: async (commandBindingDigest) => {
          const reconciled = await this.#ports.reconcileAllocationDecision({
            cycle: state.cycle!,
            graph: state.graph!,
            publication: this.#publication(logicalTimeMs),
            commandBindingDigest,
            admittedMessageDigests,
          });
          return reconciled
            ? { found: true as const, value: reconciled }
            : { found: false as const };
        },
      },
    );
    if (!plan)
      throw new Error("distributed allocation command returned no result");
    const decisionDigest = await collectiveQuorumDigestV1(
      {
        domain: "autonomous-collective-planning-decision-v1",
        body: {
          cycle: state.cycle,
          graphDigest: state.graph!.graphDigest,
          allocationPlanDigest: plan.planDigest,
          admittedMessageDigests,
          logicalTimeMs,
        },
      },
      this.#crypto,
    );
    const certificate = await this.#runAdvanceCommand(
      reservation,
      "planning:certify",
      { decisionDigest, admittedMessageDigests },
      (commandBindingDigest) => this.#ports.certifyPlanning({
      cycle: state.cycle!,
      graph: state.graph!,
      plan,
      decisionDigest,
      admittedMessageDigests,
      logicalTimeMs,
      commandBindingDigest,
      }),
      {
        kind: "reconcile",
        reconcile: async (commandBindingDigest) => {
          const reconciled = await this.#ports.reconcilePlanningCertification({
            cycle: state.cycle!,
            graph: state.graph!,
            plan,
            decisionDigest,
            admittedMessageDigests,
            logicalTimeMs,
            commandBindingDigest,
          });
          return reconciled
            ? { found: true as const, value: reconciled }
            : { found: false as const };
        },
      },
    );
    if (
      !certificate ||
      certificate.proposalDigest !== decisionDigest ||
      !(await this.#ports.verifyPlanning({
        certificate,
        decisionDigest,
        graphDigest: state.graph!.graphDigest,
        allocationPlanDigest: plan.planDigest,
        logicalTimeMs,
      }))
    )
      return this.#block(
        await this.#commit(state, { plan }, logicalTimeMs, reservation),
        "planning_finality_unavailable",
        logicalTimeMs,
        reservation,
      );
    const executing = await this.#commit(
      state,
      {
        status: "executing",
        plan,
        planningDecisionDigest: decisionDigest,
        planningEvidenceMessageDigests: admittedMessageDigests,
        planningFinality: certificate,
        nextWakeAtLogicalMs: logicalTimeMs,
      },
      logicalTimeMs,
      reservation,
    );
    return this.#executeLocalAwards(executing, logicalTimeMs, reservation);
  }

  async #executeLocalAwards(
    state: AutonomousCollectiveNodeStateV1,
    logicalTimeMs: number,
    reservation: AutonomousCollectiveAdvanceReservationV1,
  ): Promise<AutonomousCollectiveNodeStateV1> {
    const localPeerId = this.#protocolScope.localPeerId;
    const localInstanceId = this.#protocolScope.localInstanceId;
    const localAwards = state.plan!.awards.filter(
      (award) =>
        award.peerId === localPeerId &&
        award.peerInstanceId === localInstanceId,
    );
    let current = state;
    for (const award of localAwards) {
      const task = state.graph!.tasks.find(
        (candidate) => candidate.taskDigest === award.taskDigest,
      );
      if (!task)
        throw new Error("autonomous collective award task is unavailable");
      let operation = (current.awardOperations ?? []).find(
        (candidate) => candidate.awardDigest === award.awardDigest,
      );
      if (!operation) {
        const semanticSequence = safeAdd(current.semanticSequenceHighWater, 1);
        operation = immutable({
          schemaVersion: 1 as const,
          awardDigest: award.awardDigest,
          executionId: `execution:${award.awardDigest.slice(7, 47)}`,
          materializationId: `materialization:${award.awardDigest.slice(7, 47)}`,
          semanticSequence,
          canonicalLogicalTimeMs: logicalTimeMs,
          phase: "reserved" as const,
          cognitiveRequest: null,
          cognitiveContextBinding: null,
          receipt: null,
          signal: null,
        });
        current = await this.#commit(
          current,
          {
            semanticSequenceHighWater: semanticSequence,
            awardOperations: this.#replaceAwardOperation(current, operation),
          },
          logicalTimeMs,
          reservation,
        );
      }
      if (operation.phase === "completed") continue;
      if (operation.phase === "reserved") {
        await this.#assertAdvanceFence(reservation);
        const prepared = await this.#ports.prepareTask(
          this.#materializationInput(current, award, task, operation),
        );
        this.#validateMaterialization(prepared, current, operation);
        operation = immutable({
          ...operation,
          phase: "materialized" as const,
          cognitiveRequest: prepared.cognitiveRequest,
          cognitiveContextBinding:
            createAutonomousCollectiveCognitiveContextBindingV1(
              prepared.cognitiveContext.tenant,
            ),
        });
        current = await this.#commit(current, {
          awardOperations: this.#replaceAwardOperation(current, operation),
        }, logicalTimeMs, reservation);
      }
      if (operation.phase === "materialized") {
        operation = immutable({ ...operation, phase: "assurance_started" as const });
        current = await this.#commit(current, {
          awardOperations: this.#replaceAwardOperation(current, operation),
        }, logicalTimeMs, reservation);
      }
      if (operation.phase === "assurance_started") {
        const assuranceOperation = operation;
        const cognitiveContext = await this.#rehydrateContext(
          current,
          award,
          task,
          assuranceOperation,
          reservation,
        );
        const executionInput: Parameters<AssuranceCoupledExecutionRuntimeV1["execute"]>[0] = {
          executionId: assuranceOperation.executionId,
          graphDigest: current.graph!.graphDigest,
          allocationPlan: current.plan!,
          planningCycle: current.cycle!,
          planningEvidenceMessageDigests: current.planningEvidenceMessageDigests,
          awardDigest: award.awardDigest,
          task,
          planningDecisionDigest: current.planningDecisionDigest!,
          planningFinality: current.planningFinality!,
          semanticSequence: assuranceOperation.semanticSequence,
          cognitiveRequest: assuranceOperation.cognitiveRequest!,
          cognitiveContext,
          cognitiveContextBindingDigest:
            await assuranceCognitiveContextBindingDigestV1(
              {
                cognitiveRequest: assuranceOperation.cognitiveRequest!,
                cognitiveContext,
              },
              this.#crypto,
            ),
          telemetryCorrelation: {
            missionId: current.intent!.missionIntentId,
            cycleId: current.cycle!.cycleId,
            decisionId: current.planningFinality!.certificateId,
            effectId: assuranceOperation.executionId,
          },
          logicalTimeMs: assuranceOperation.canonicalLogicalTimeMs,
        };
        const receipt = await this.#runAdvanceCommand(
          reservation,
          `assurance:${assuranceOperation.executionId}`,
          {
            executionId: assuranceOperation.executionId,
            awardDigest: award.awardDigest,
            cognitiveRequest: assuranceOperation.cognitiveRequest,
            semanticSequence: assuranceOperation.semanticSequence,
          },
          () => this.#ports.execute(executionInput),
          {
            kind: "reconcile",
            reconcile: async () => {
              const reconciled = await this.#ports.lookupExecutionReceipt(
                executionInput,
              );
              return reconciled
                ? { found: true as const, value: reconciled }
                : { found: false as const };
            },
          },
        );
        if (!receipt)
          throw new Error("assurance command returned no receipt");
        digest(receipt.receiptDigest, "executionReceiptDigest");
        operation = immutable({
          ...operation,
          phase: "assurance_completed" as const,
          receipt,
        });
        const receipts = [
          ...current.executionReceipts.filter(
            (candidate) => candidate.awardDigest !== award.awardDigest,
          ),
          receipt,
        ];
        current = await this.#commit(current, {
          executionReceipts: receipts,
          awardOperations: this.#replaceAwardOperation(current, operation),
        }, logicalTimeMs, reservation);
      }
      if (operation.phase === "assurance_completed") {
        operation = immutable({ ...operation, phase: "settle_enqueued" as const });
        current = await this.#commit(current, {
          awardOperations: this.#replaceAwardOperation(current, operation),
        }, logicalTimeMs, reservation);
      }
      if (operation.phase === "settle_enqueued") {
        const settleOperation = operation;
        await this.#runAdvanceCommand(
          reservation,
          `settle:${award.awardDigest.slice(7, 47)}`,
          {
            awardDigest: award.awardDigest,
            receiptDigest: settleOperation.receipt!.receiptDigest,
          },
          (commandBindingDigest) => this.#ports.settleAward({
          cycle: current.cycle!,
          plan: current.plan!,
          awardDigest: award.awardDigest,
          outcome: executionOutcome(settleOperation.receipt!),
          outcomeEvidenceDigest: settleOperation.receipt!.receiptDigest as PlanningDigestV1,
          publication: this.#publication(settleOperation.canonicalLogicalTimeMs),
          commandBindingDigest,
          }),
          {
            kind: "reconcile",
            acknowledgeProtocolCommand: true,
            reconcile: async (commandBindingDigest) => {
              const reconciled = await this.#ports.reconcileAwardSettlement({
                cycle: current.cycle!,
                plan: current.plan!,
                awardDigest: award.awardDigest,
                outcome: executionOutcome(settleOperation.receipt!),
                outcomeEvidenceDigest:
                  settleOperation.receipt!.receiptDigest as PlanningDigestV1,
                publication: this.#publication(
                  settleOperation.canonicalLogicalTimeMs,
                ),
                commandBindingDigest,
              });
              return reconciled
                ? { found: true as const, value: undefined }
                : { found: false as const };
            },
          },
        );
        operation = immutable({ ...operation, phase: "settled" as const });
        current = await this.#commit(current, {
          awardOperations: this.#replaceAwardOperation(current, operation),
        }, logicalTimeMs, reservation);
      }
      if (operation.phase === "settled") {
        const signal = await this.#awardSignal(award, operation);
        operation = immutable({ ...operation, phase: "signal_enqueued" as const, signal });
        current = await this.#commit(current, {
          awardOperations: this.#replaceAwardOperation(current, operation),
        }, logicalTimeMs, reservation);
      }
      if (operation.phase === "signal_enqueued") {
        const signalOperation = operation;
        await this.#runAdvanceCommand(
          reservation,
          `signal:${award.awardDigest.slice(7, 47)}`,
          signalOperation.signal,
          (commandBindingDigest) => this.#ports.publishSignal({
          signal: signalOperation.signal!,
          lifetime: this.#policy.messageLifetimeMs,
          ...(this.#policy.fanout === undefined ? {} : { fanout: this.#policy.fanout }),
          commandBindingDigest,
          }),
          {
            kind: "reconcile",
            acknowledgeProtocolCommand: true,
            reconcile: async (commandBindingDigest) => {
              const message = await this.#ports.protocolReconcilePublish({
                cycleId: `adaptation:${signalOperation.signal!.missionId}`,
                streamId: `mission-signal:${signalOperation.signal!.sourcePeerId}`,
                kind: "mission.signal",
                payload: signalOperation.signal,
                logicalTimeMs: signalOperation.signal!.observedAtLogicalMs,
                lifetime: this.#policy.messageLifetimeMs,
                ...(this.#policy.fanout === undefined
                  ? {}
                  : { fanout: this.#policy.fanout }),
                commandBindingDigest,
              });
              return message
                ? { found: true as const, value: undefined }
                : { found: false as const };
            },
          },
        );
        operation = immutable({ ...operation, phase: "signal_published" as const });
        current = await this.#commit(current, {
          awardOperations: this.#replaceAwardOperation(current, operation),
        }, logicalTimeMs, reservation);
      }
      if (operation.phase === "signal_published") {
        operation = immutable({ ...operation, phase: "completed" as const });
        current = await this.#commit(current, {
          awardOperations: this.#retainedAwardOperations(
            this.#replaceAwardOperation(current, operation),
          ),
        }, logicalTimeMs, reservation);
      }
    }
    const adaptationCycleId = `adapt:${current.cycle!.intentDigest.slice(7, 47)}`;
    const adaptationDecision = await this.#runAdvanceCommand(
      reservation,
      "adaptation:cycle",
      { cycleId: adaptationCycleId, logicalTimeMs },
      () => this.#ports.runAdaptationCycle({
        cycleId: adaptationCycleId,
        logicalTimeMs,
      }),
      {
        kind: "reconcile",
        reconcile: async () => {
          const adaptation = await this.#ports.adaptationLoad();
          const matches = adaptation.decisions.filter(
            (decision) => decision.cycleId === adaptationCycleId,
          );
          if (matches.length > 1)
            throw new Error("autonomous adaptation reconciliation is ambiguous");
          return matches[0]
            ? { found: true as const, value: matches[0] }
            : { found: false as const };
        },
      },
    );
    const failed = current.executionReceipts.filter(
      (receipt) => receipt.status !== "completed",
    ).length;
    const cycleOutcome =
      failed > 0
        ? failed === current.executionReceipts.length && current.executionReceipts.length > 0
          ? "failed"
          : "partial"
        : current.plan!.unallocatedTaskIds.length > 0
          ? "partial"
          : "satisfied";
    return this.#commit(
      current,
      {
        status: "completed",
        adaptationDecision,
        cycleOutcome,
        blockingReason: null,
        nextWakeAtLogicalMs: null,
      },
      logicalTimeMs,
      reservation,
    );
  }

  #materializationInput(
    state: AutonomousCollectiveNodeStateV1,
    award: StrategicAllocationAwardV1,
    task: MissionTaskNodeV1,
    operation: AutonomousCollectiveAwardOperationV1,
  ): Parameters<AutonomousCollectiveTaskMaterializerPortV1["prepare"]>[0] {
    return {
      materializationId: operation.materializationId,
      executionId: operation.executionId,
      intent: state.intent!,
      cycle: state.cycle!,
      graph: state.graph!,
      plan: state.plan!,
      award,
      task,
      planningFinality: state.planningFinality!,
      admittedMessageDigests: state.planningEvidenceMessageDigests,
      semanticSequence: operation.semanticSequence,
      logicalTimeMs: operation.canonicalLogicalTimeMs,
    };
  }

  #validateMaterialization(
    prepared: Awaited<ReturnType<AutonomousCollectiveTaskMaterializerPortV1["prepare"]>>,
    state: AutonomousCollectiveNodeStateV1,
    operation: AutonomousCollectiveAwardOperationV1,
  ): void {
    integer(prepared.semanticSequence, "semanticSequence", 1, Number.MAX_SAFE_INTEGER);
    if (
      prepared.semanticSequence !== operation.semanticSequence ||
      prepared.cognitiveRequest.logicalTimeMs !== operation.canonicalLogicalTimeMs ||
      prepared.cognitiveRequest.controlPlaneDigest !==
        state.planningFinality!.certificateDigest
    )
      throw new TypeError(
        "autonomous task materialization is not bound to its durable reservation",
      );
  }

  async #rehydrateContext(
    state: AutonomousCollectiveNodeStateV1,
    award: StrategicAllocationAwardV1,
    task: MissionTaskNodeV1,
    operation: AutonomousCollectiveAwardOperationV1,
    reservation: AutonomousCollectiveAdvanceReservationV1,
  ): Promise<CognitiveAgentAdapterContextV2> {
    if (!operation.cognitiveRequest || !operation.cognitiveContextBinding)
      throw new TypeError("durable materialization is incomplete");
    await this.#assertAdvanceFence(reservation);
    const replay = this.#ports.rehydrateTaskContext
      ? null
      : await this.#ports.prepareTask(
          this.#materializationInput(state, award, task, operation),
        );
    const context = this.#ports.rehydrateTaskContext
      ? await this.#ports.rehydrateTaskContext({
          cognitiveRequest: operation.cognitiveRequest,
          contextBinding: operation.cognitiveContextBinding,
        })
      : replay!.cognitiveContext;
    const rehydratedBinding = context?.tenant
      ? createAutonomousCollectiveCognitiveContextBindingV1(context.tenant)
      : null;
    if (
      !context?.signal ||
      !(await this.#canonicalEqual(
        "autonomous-cognitive-context-tenant-v1",
        rehydratedBinding,
        operation.cognitiveContextBinding,
      ))
    )
      throw new TypeError("rehydrated cognitive context changed its durable binding");
    if (!this.#ports.rehydrateTaskContext) {
      this.#validateMaterialization(replay!, state, operation);
      if (
        !(await this.#canonicalEqual(
          "autonomous-cognitive-request-replay-v1",
          replay!.cognitiveRequest,
          operation.cognitiveRequest,
        ))
      )
        throw new TypeError("cognitive materialization replay mismatch");
      return replay!.cognitiveContext;
    }
    return context;
  }

  async #canonicalEqual(
    domain: string,
    left: unknown,
    right: unknown,
  ): Promise<boolean> {
    const [leftDigest, rightDigest] = await Promise.all([
      collectiveQuorumDigestV1(
        { domain, body: left } as Parameters<typeof collectiveQuorumDigestV1>[0],
        this.#crypto,
      ),
      collectiveQuorumDigestV1(
        { domain, body: right } as Parameters<typeof collectiveQuorumDigestV1>[0],
        this.#crypto,
      ),
    ]);
    return leftDigest === rightDigest;
  }

  async #awardSignal(
    award: StrategicAllocationAwardV1,
    operation: AutonomousCollectiveAwardOperationV1,
  ): Promise<AutonomousMissionSignalV1> {
    const receipt = operation.receipt!;
    return createAutonomousMissionSignalV1(
      {
        signalId: `signal:${award.awardDigest.slice(7, 47)}`,
        missionId: this.#adaptationMissionId,
        sourcePeerId: this.#protocolScope.localPeerId,
        sourceInstanceId: this.#protocolScope.localInstanceId,
        sourceKeyId: this.#protocolScope.localKeyId,
        membershipConfigurationDigest:
          this.#protocolScope.membershipConfigurationDigest,
        sourceIndependenceGroupId: award.independenceGroupId,
        kind: semanticSignalKind(receipt),
        severityBasisPoints: semanticSignalSeverity(receipt),
        confidenceBasisPoints: 9_000,
        subjectDigest: award.taskDigest,
        evidenceDigests: [
          receipt.receiptDigest,
          ...(receipt.anytimeSemanticGuaranteeDigest
            ? [receipt.anytimeSemanticGuaranteeDigest]
            : []),
          ...(receipt.semanticHorizonDecisionDigest
            ? [receipt.semanticHorizonDecisionDigest]
            : []),
        ].sort(),
        observedAtLogicalMs: operation.canonicalLogicalTimeMs,
      },
      this.#crypto,
    );
  }

  #replaceAwardOperation(
    state: AutonomousCollectiveNodeStateV1,
    operation: AutonomousCollectiveAwardOperationV1,
  ): readonly AutonomousCollectiveAwardOperationV1[] {
    return [
      ...(state.awardOperations ?? []).filter(
        (candidate) => candidate.awardDigest !== operation.awardDigest,
      ),
      operation,
    ].sort((left, right) => left.semanticSequence - right.semanticSequence);
  }

  #retainedAwardOperations(
    operations: readonly AutonomousCollectiveAwardOperationV1[],
  ): readonly AutonomousCollectiveAwardOperationV1[] {
    const unresolved = operations.filter((item) => item.phase !== "completed");
    const completed = operations
      .filter((item) => item.phase === "completed")
      .slice(-(this.#policy.maximumRetainedCompletedAwardOperations ?? 128));
    return [...unresolved, ...completed].sort(
      (left, right) => left.semanticSequence - right.semanticSequence,
    );
  }

  async #assertAdvanceFence(
    reservation: AutonomousCollectiveAdvanceReservationV1,
  ): Promise<void> {
    if (
      !(await this.#ports.assertAdvanceFence(
        reservation,
        reservation.canonicalLogicalTimeMs,
      ))
    )
      throw new Error("autonomous collective node advance fence is stale");
  }

  async #runAdvanceCommand<T>(
    reservation: AutonomousCollectiveAdvanceReservationV1,
    commandId: string,
    binding: unknown,
    effect: (commandDigest: string) => Promise<T>,
    recovery:
      | { readonly kind: "repeatable" }
      | {
          readonly kind: "reconcile";
          readonly acknowledgeProtocolCommand?: boolean;
          readonly reconcile: (commandDigest: string) => Promise<
            { readonly found: true; readonly value: T } | { readonly found: false }
          >;
        },
  ): Promise<T> {
    identifier(commandId, "advanceCommandId");
    validateAutonomousCollectiveCommandBindingV1(binding);
    const commandDigest = await collectiveQuorumDigestV1(
      {
        domain: "autonomous-collective-node-command-v1",
        body: {
          runtimeId: this.#runtimeId,
          commandId,
          binding,
        },
      } as Parameters<typeof collectiveQuorumDigestV1>[0],
      this.#crypto,
    );
    const result = await this.#ports.runAdvanceCommand({
      reservation,
      commandId,
      commandDigest,
      commandBinding: binding,
      effect: () => effect(commandDigest),
      ...(recovery.kind === "reconcile"
        ? {
            recovery: "reconcile" as const,
            reconcile: () => recovery.reconcile(commandDigest),
          }
        : { recovery: "repeatable" as const }),
    });
    if (
      recovery.kind === "reconcile" &&
      recovery.acknowledgeProtocolCommand === true
    ) {
      const pending = this.#advanceCommandAcknowledgements.get(
        reservation.advanceId,
      ) ?? new Set<string>();
      pending.add(commandDigest);
      this.#advanceCommandAcknowledgements.set(reservation.advanceId, pending);
    }
    return result;
  }

  async #durableEvidenceSnapshot(
    reservation: AutonomousCollectiveAdvanceReservationV1,
    commandId: string,
    base: Readonly<Record<string, unknown>>,
    currentDigests: readonly string[],
  ): Promise<readonly string[]> {
    const durable = await this.#ports.loadAdvanceCommandBinding(
      reservation,
      commandId,
    );
    if (durable === null) return [...currentDigests];
    if (!durable || typeof durable !== "object" || Array.isArray(durable))
      throw new TypeError("durable autonomous command binding is invalid");
    const record = durable as Record<string, unknown>;
    for (const [key, value] of Object.entries(base))
      if (JSON.stringify(record[key]) !== JSON.stringify(value))
        throw new TypeError("durable autonomous command base binding mismatch");
    return canonicalDigestSnapshot(record.admittedMessageDigests);
  }

  async #messages(
    cycleId: string,
    logicalTimeMs: number,
  ): Promise<readonly DistributedCollectiveMessageV1[]> {
    const messages = await this.#ports.protocolMessages({
      cycleId,
      throughLogicalTimeMs: logicalTimeMs,
    });
    if (messages.length > this.#policy.maximumAdmittedEvidenceMessages)
      throw new RangeError(
        "autonomous collective admitted evidence capacity exceeded",
      );
    return messages;
  }

  async #assertMessageSnapshot(
    cycleId: string,
    logicalTimeMs: number,
    expectedDigests: readonly string[],
  ): Promise<void> {
    const current = (await this.#messages(cycleId, logicalTimeMs))
      .map((message) => message.messageDigest)
      .sort();
    const currentSet = new Set(current);
    if (expectedDigests.some((digestValue) => !currentSet.has(digestValue)))
      throw new Error("autonomous command evidence snapshot is unavailable");
  }

  #publication(logicalTimeMs: number) {
    return {
      logicalTimeMs,
      lifetime: this.#policy.messageLifetimeMs,
      ...(this.#policy.fanout === undefined
        ? {}
        : { fanout: this.#policy.fanout }),
    };
  }

  #block(
    state: AutonomousCollectiveNodeStateV1,
    reason: string,
    logicalTimeMs: number,
    reservation?: AutonomousCollectiveAdvanceReservationV1,
  ) {
    return this.#commit(
      state,
      {
        status: "blocked",
        blockingReason: reason,
        nextWakeAtLogicalMs: null,
        cycleOutcome: "failed",
      },
      logicalTimeMs,
      reservation,
    );
  }

  async #commit(
    current: AutonomousCollectiveNodeStateV1,
    patch: Partial<
      Omit<
        AutonomousCollectiveNodeStateV1,
        | "schemaVersion"
        | "runtimeId"
        | "revision"
        | "logicalTimeHighWaterMs"
        | "previousStateDigest"
        | "stateDigest"
      >
    >,
    logicalTimeMs: number,
    reservation?: AutonomousCollectiveAdvanceReservationV1,
  ): Promise<AutonomousCollectiveNodeStateV1> {
    if (logicalTimeMs < current.logicalTimeHighWaterMs)
      throw new Error("autonomous collective node logical time rollback");
    const newlyPending = reservation
      ? [...(this.#advanceCommandAcknowledgements.get(reservation.advanceId) ?? [])]
      : [];
    const commandAcknowledgementDigests = [
      ...new Set([
        ...(current.commandAcknowledgementDigests ?? []).filter(
          (item) => !this.#acknowledgedCommandDigests.has(item),
        ),
        ...newlyPending,
      ]),
    ].sort();
    const next = await this.#state({
      ...current,
      ...patch,
      commandAcknowledgementDigests,
      revision: current.revision + 1,
      logicalTimeHighWaterMs: logicalTimeMs,
      previousStateDigest: current.stateDigest,
    });
    if (this.#telemetryDeliveryMode === "durable_outbox") {
      const entry = await createCollectiveHostTelemetryOutboxEntryV1({
        sourceKind: "autonomous_node",
        sourceId: this.#runtimeId,
        sourceSequence: next.revision,
        ordinal: 0,
        event: this.#transitionTelemetryEvent(current, next),
        crypto: this.#crypto,
      });
      const saved = reservation
        ? await this.#ports.saveAdvance(next, current.revision, reservation, [entry])
        : await this.#ports.saveStateWithTelemetry!(next, current.revision, [entry]);
      if (!saved)
        throw new Error("autonomous collective node revision conflict");
      await this.#drainTelemetry();
    } else {
      const saved = reservation
        ? await this.#ports.saveAdvance(next, current.revision, reservation)
        : await this.#ports.saveState(next, current.revision);
      if (!saved)
        throw new Error("autonomous collective node revision conflict");
      await this.#emitTransitionTelemetry(current, next);
    }
    for (const commandDigest of commandAcknowledgementDigests) {
      await this.#ports.protocolAcknowledgePublishCommand(commandDigest);
      this.#acknowledgedCommandDigests.add(commandDigest);
    }
    if (reservation)
      this.#advanceCommandAcknowledgements.delete(reservation.advanceId);
    return next;
  }

  async #emitTransitionTelemetry(
    previous: AutonomousCollectiveNodeStateV1,
    next: AutonomousCollectiveNodeStateV1,
  ): Promise<void> {
    if (!this.#telemetryRecord) return;
    try {
      await this.#telemetryRecord(
        this.#transitionTelemetryEvent(previous, next),
      );
    } catch (error) {
      if (this.#telemetryDeliveryMode === "require_delivery")
        throw new Error("collective host telemetry delivery failed", {
          cause: error,
        });
    }
  }

  #transitionTelemetryEvent(
    previous: AutonomousCollectiveNodeStateV1,
    next: AutonomousCollectiveNodeStateV1,
  ): CollectiveHostTelemetryEventV1 {
    const outcome =
      next.status === "completed"
        ? next.cycleOutcome === "satisfied"
          ? "completed"
          : next.cycleOutcome === "partial"
            ? "deferred"
            : "failed"
        : next.status === "blocked"
          ? "rejected"
          : next.status === "accepted"
            ? "accepted"
            : "started";
    return {
      category:
        next.status === "executing" || next.status === "completed"
          ? "execution"
          : next.status === "blocked"
            ? "control"
            : "planning",
      operation: "node.transition",
      outcome,
      logicalTimeMs: next.logicalTimeHighWaterMs,
      operationDigest: next.stateDigest,
      evidenceDigests: [next.stateDigest, previous.stateDigest],
      ...(next.intent && next.cycle
        ? {
            correlation: {
              missionId: next.intent.missionIntentId,
              cycleId: next.cycle.cycleId,
              ...(next.adaptationDecision
                ? { decisionId: next.adaptationDecision.cycleId }
                : {}),
            },
          }
        : {}),
    };
  }

  async #drainTelemetry(): Promise<void> {
    if (this.#telemetryDeliveryMode !== "durable_outbox") return;
    const drain = this.#telemetryDrain.then(() =>
      drainCollectiveHostTelemetryOutboxV1({
        store: this.#telemetryStore!,
        telemetry: this.#telemetry!,
      }),
    );
    this.#telemetryDrain = drain.catch(() => undefined);
    await drain;
  }

  async #state(
    input: Omit<AutonomousCollectiveNodeStateV1, "stateDigest">,
  ): Promise<AutonomousCollectiveNodeStateV1> {
    const { stateDigest: _stale, ...body } =
      input as AutonomousCollectiveNodeStateV1;
    return immutable({
      ...body,
      stateDigest: await collectiveQuorumDigestV1(
        {
          domain: "autonomous-collective-node-state-v1",
          body,
        },
        this.#crypto,
      ),
    });
  }
}

/** Nominal check for the module-owned autonomous node control surface. */
export function isAutonomousCollectiveNodeRuntimeV1(
  value: unknown,
): value is AutonomousCollectiveNodeRuntimeV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    autonomousCollectiveNodeRuntimeInvokersV1.has(value)
  );
}

function validatePolicy(
  input: AutonomousCollectiveNodePolicyV1,
): AutonomousCollectiveNodePolicyV1 {
  if (!input || input.schemaVersion !== 1)
    throw new TypeError("autonomous collective node policy schema is invalid");
  integer(
    input.graphProposalWindowMs,
    "graphProposalWindowMs",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  integer(
    input.bidCommitmentWindowMs,
    "bidCommitmentWindowMs",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  integer(
    input.bidRevealWindowMs,
    "bidRevealWindowMs",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  integer(
    input.messageLifetimeMs,
    "messageLifetimeMs",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  integer(input.maximumLocalBids, "maximumLocalBids", 0, 100_000);
  integer(
    input.maximumAdmittedEvidenceMessages,
    "maximumAdmittedEvidenceMessages",
    16,
    1_000_000,
  );
  if (input.fanout !== undefined) integer(input.fanout, "fanout", 1, 1_000_000);
  if (input.advanceLeaseDurationMs !== undefined)
    integer(
      input.advanceLeaseDurationMs,
      "advanceLeaseDurationMs",
      1,
      Number.MAX_SAFE_INTEGER,
    );
  if (input.maximumRetainedCompletedAwardOperations !== undefined)
    integer(
      input.maximumRetainedCompletedAwardOperations,
      "maximumRetainedCompletedAwardOperations",
      1,
      100_000,
    );
  return immutable(input);
}

function validateLocalBid(
  bid: AutonomousCollectiveLocalBidV1,
  taskIds: ReadonlySet<string>,
  seenTasks: ReadonlySet<string>,
  cycle: DistributedPlanningCycleV1,
  protocolScope: Readonly<{
    localPeerId: string;
    scopeDigest: string;
  }>,
  logicalTimeMs: number,
): void {
  if (!bid || !taskIds.has(bid.taskId) || seenTasks.has(bid.taskId))
    throw new TypeError("autonomous collective local bid task is invalid");
  identifier(bid.independenceGroupId, "independenceGroupId");
  integer(
    bid.declaredUtilityMicros,
    "declaredUtilityMicros",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  integer(
    bid.declaredCostUnits,
    "declaredCostUnits",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  integer(
    bid.declaredResourceUnits,
    "declaredResourceUnits",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  integer(
    bid.requestedBudgetUnits,
    "requestedBudgetUnits",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  integer(bid.collateralUnits, "collateralUnits", 0, Number.MAX_SAFE_INTEGER);
  integer(
    bid.availabilityUntilLogicalMs,
    "availabilityUntilLogicalMs",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  if (bid.availabilityUntilLogicalMs <= cycle.bidRevealCloseAtLogicalMs)
    throw new TypeError(
      "autonomous collective local bid expires before allocation",
    );
  digest(bid.nonceDigest, "nonceDigest");
  if (
    bid.attestation.peerId !== protocolScope.localPeerId ||
    bid.peerProjection.peerId !== protocolScope.localPeerId ||
    bid.peerProjection.scopeDigest !== protocolScope.scopeDigest ||
    bid.attestation.validFromLogicalMs > logicalTimeMs ||
    bid.attestation.validUntilLogicalMs <= cycle.bidRevealCloseAtLogicalMs
  )
    throw new TypeError(
      "autonomous collective local bid evidence is not locally bound",
    );
}

function executionOutcome(receipt: AssuranceCoupledExecutionReceiptV1) {
  if (receipt.status === "completed") return "satisfied" as const;
  if (
    receipt.status === "computation_refused" ||
    receipt.status === "effect_failed"
  )
    return "failed" as const;
  return "indeterminate" as const;
}

const awardOperationPhasesV1: readonly AutonomousCollectiveAwardOperationPhaseV1[] = [
  "reserved",
  "materialized",
  "assurance_started",
  "assurance_completed",
  "settle_enqueued",
  "settled",
  "signal_enqueued",
  "signal_published",
  "completed",
];

function awardPhaseAtLeast(
  phase: AutonomousCollectiveAwardOperationPhaseV1,
  minimum: AutonomousCollectiveAwardOperationPhaseV1,
): boolean {
  const phaseIndex = awardOperationPhasesV1.indexOf(phase);
  const minimumIndex = awardOperationPhasesV1.indexOf(minimum);
  if (phaseIndex < 0) throw new TypeError("award operation phase is invalid");
  return phaseIndex >= minimumIndex;
}

function semanticSignalKind(receipt: AssuranceCoupledExecutionReceiptV1) {
  switch (receipt.semanticHorizonDecision?.directive) {
    case "safe_stop":
      return "safety_intervention" as const;
    case "replan":
    case "shorten_horizon":
      return "semantic_drift" as const;
    default:
      return receipt.status === "completed"
        ? ("objective_progress" as const)
        : ("execution_failure" as const);
  }
}

function semanticSignalSeverity(
  receipt: AssuranceCoupledExecutionReceiptV1,
): number {
  switch (receipt.semanticHorizonDecision?.directive) {
    case "safe_stop":
      return 10_000;
    case "replan":
      return 9_000;
    case "shorten_horizon":
      return 7_000;
    default:
      return receipt.status === "completed" ? 5_000 : 9_000;
  }
}

function isMissionIntentPayload(value: unknown, intentDigest: string): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Partial<AutonomousCollectiveMissionIntentPayloadV1>;
  return (
    payload.schemaVersion === 1 &&
    payload.payloadKind === "mission_intent" &&
    payload.intent?.intentDigest === intentDigest
  );
}

function canonicalStrings(
  values: readonly string[],
  label: string,
): readonly string[] {
  if (
    !Array.isArray(values) ||
    values.some(
      (value) =>
        typeof value !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u.test(value),
    )
  )
    throw new TypeError(`${label} is invalid`);
  return [...new Set(values)].sort();
}

function canonicalDigestSnapshot(value: unknown): readonly string[] {
  if (!Array.isArray(value))
    throw new TypeError("admitted message digest snapshot is invalid");
  const canonical = [...new Set(value as unknown[])].sort();
  if (
    canonical.length !== value.length ||
    canonical.some((item, index) => item !== value[index])
  )
    throw new TypeError("admitted message digest snapshot is not canonical");
  canonical.forEach((item) => digest(item, "admittedMessageDigest"));
  return canonical as readonly string[];
}

export function validateAutonomousCollectiveCommandBindingV1(value: unknown): void {
  let nodes = 0;
  const visit = (item: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > 10_000 || depth > 32)
      throw new RangeError("autonomous command binding capacity exceeded");
    if (
      item === null ||
      typeof item === "string" ||
      typeof item === "boolean" ||
      (typeof item === "number" && Number.isFinite(item))
    )
      return;
    if (Array.isArray(item)) {
      item.forEach((child) => visit(child, depth + 1));
      return;
    }
    if (typeof item !== "object")
      throw new TypeError("autonomous command binding is not JSON");
    const entries = Object.entries(item as Record<string, unknown>);
    if (entries.length > 1_000)
      throw new RangeError("autonomous command binding key capacity exceeded");
    entries.forEach(([, child]) => visit(child, depth + 1));
  };
  visit(value, 0);
  const encoded = JSON.stringify(value);
  if (encoded === undefined || encoded.length > 1_048_576)
    throw new RangeError("autonomous command binding byte capacity exceeded");
}

function identifier(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u.test(value)
  )
    throw new TypeError(`${label} is invalid`);
}

function digest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError(`${label} is invalid`);
}

function integer(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  )
    throw new RangeError(`${label} is invalid`);
  return value as number;
}

function safeAdd(left: number, right: number): number {
  const value = left + right;
  return integer(value, "logicalTimeDeadline", 1, Number.MAX_SAFE_INTEGER);
}

function sameAdvanceReservation(
  left: AutonomousCollectiveAdvanceReservationV1,
  right: AutonomousCollectiveAdvanceReservationV1,
): boolean {
  return (
    left.runtimeId === right.runtimeId &&
    left.advanceId === right.advanceId &&
    left.holderId === right.holderId &&
    left.fence === right.fence &&
    left.canonicalLogicalTimeMs === right.canonicalLogicalTimeMs &&
    left.leaseUntilLogicalMs === right.leaseUntilLogicalMs
  );
}

let autonomousNodeHolderSequence = 0;
function randomHolderStem(): string {
  const randomUUID = (globalThis.crypto as Crypto & { randomUUID?: () => string })
    ?.randomUUID;
  if (typeof randomUUID === "function") return randomUUID.call(globalThis.crypto);
  autonomousNodeHolderSequence += 1;
  return `${Date.now()}:${autonomousNodeHolderSequence}`;
}

function immutableMethod<T extends (...args: never[]) => unknown>(
  value: T,
): PropertyDescriptor {
  return {
    value,
    writable: false,
    configurable: false,
    enumerable: false,
  };
}

function captureDigestCrypto(configuredCrypto: Crypto | undefined): Crypto {
  const source = configuredCrypto ?? globalThis.crypto;
  const subtle = source?.subtle;
  const digestMethod = subtle?.digest;
  if (!source || !subtle || typeof digestMethod !== "function")
    throw new TypeError("autonomous node digest crypto is required");
  return Object.freeze({
    subtle: Object.freeze({ digest: digestMethod.bind(subtle) }),
  }) as unknown as Crypto;
}

function captureMethod<T extends (...args: never[]) => unknown>(
  target: unknown,
  methodName: string,
  label: string,
): T {
  if (
    (typeof target !== "object" && typeof target !== "function") ||
    target === null
  )
    throw new TypeError(`${label} is required`);
  const method = Reflect.get(target, methodName) as unknown;
  if (typeof method !== "function") throw new TypeError(`${label} is required`);
  return method.bind(target) as T;
}

function captureOptionalMethod<T extends (...args: never[]) => unknown>(
  target: unknown,
  methodName: string,
  label: string,
): T | undefined {
  if (
    (typeof target !== "object" && typeof target !== "function") ||
    target === null
  )
    throw new TypeError(`${label} owner is required`);
  const method = Reflect.get(target, methodName) as unknown;
  if (method === undefined) return undefined;
  if (typeof method !== "function") throw new TypeError(`${label} is invalid`);
  return method.bind(target) as T;
}

function immutable<T>(value: T): T {
  const clone = structuredClone(value);
  const visit = (item: unknown): void => {
    if (!item || typeof item !== "object" || Object.isFrozen(item)) return;
    for (const child of Object.values(item as Record<string, unknown>))
      visit(child);
    Object.freeze(item);
  };
  visit(clone);
  return clone;
}
