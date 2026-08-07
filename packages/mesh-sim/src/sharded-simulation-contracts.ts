import {
  deepFreezePlanning,
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import {
  collectiveProgressiveScaleProfileV1,
  type CollectiveProgressiveScaleTierV1,
} from "./collective-progressive-scale.js";

/** Closed interoperability envelopes, deliberately aligned with sparse overlay scale tiers. */
export const SHARDED_SIMULATION_SCALE_PROFILE_IDS_V1 = Object.freeze([
  "peers-500-interactions-5000",
  "peers-5000-interactions-50000",
  "peers-100000-interactions-1000000",
] as const);
export type ShardedSimulationScaleProfileIdV1 =
  (typeof SHARDED_SIMULATION_SCALE_PROFILE_IDS_V1)[number];

/** Hard protocol limits. Adapters must reject excess input before allocating state. */
export const SHARDED_SIMULATION_LIMITS_V1 = Object.freeze({
  maximumFaults: 4_096,
  maximumTargetsPerFault: 4_096,
  maximumTotalTargetsAcrossSchedule: 16_384,
  maximumMessagesPerBatch: 4_096,
  maximumObservationsPerDelivery: 1_024,
  maximumIdentifierLength: 256,
} as const);

export interface ShardedSimulationScaleProfileV1 {
  readonly schemaVersion: 1;
  readonly profileId: ShardedSimulationScaleProfileIdV1;
  readonly tier: CollectiveProgressiveScaleTierV1;
  readonly logicalPeerCount: 500 | 5_000 | 100_000;
  readonly interactionCeiling: 5_000 | 50_000 | 1_000_000;
  readonly overlayProfileId: "standard-500" | "large-5000" | "frontier-100000";
  readonly profileDigest: PlanningDigestV1;
}

export interface ShardedSimulationEnvironmentSessionV1 {
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly environmentId: string;
  readonly createdAtLogicalTime: number;
  readonly sessionDigest: PlanningDigestV1;
}

export interface ShardedSimulationEpisodeV1 {
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly episodeId: string;
  readonly seed: number;
  readonly startedAtLogicalTime: number;
  readonly episodeDigest: PlanningDigestV1;
}

/** This is an explicit public projection. The bridge must never attach private environment state. */
export interface ShardedSimulationPartialObservationPullV1 {
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly episodeId: string;
  readonly peerIndex: number;
  readonly logicalTime: number;
  readonly cursor: string | null;
  readonly requestId: string;
}

export interface ShardedSimulationPartialObservationDeliveryV1 {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly peerIndex: number;
  readonly logicalTime: number;
  readonly observations: readonly PlanningJson[];
  readonly nextCursor: string | null;
  readonly deliveryDigest: PlanningDigestV1;
}

export interface ShardedSimulationFencedActionRequestV1 {
  readonly schemaVersion: 1;
  readonly actionId: string;
  readonly sessionId: string;
  readonly episodeId: string;
  readonly peerIndex: number;
  readonly logicalTime: number;
  readonly executionEpoch: number;
  readonly fenceToken: string;
  readonly action: PlanningJson;
  readonly actionDigest: PlanningDigestV1;
}

export interface ShardedSimulationEffectReceiptV1 {
  readonly schemaVersion: 1;
  readonly actionId: string;
  readonly accepted: boolean;
  readonly logicalTime: number;
  readonly executionEpoch: number;
  readonly fenceToken: string;
  readonly effectDigest: PlanningDigestV1;
  readonly receiptDigest: PlanningDigestV1;
}

export interface ShardedSimulationDurableAnchorV1 {
  readonly schemaVersion: 1;
  readonly anchorId: string;
  readonly revision: number;
  readonly previousAnchorDigest: PlanningDigestV1 | null;
  readonly anchorDigest: PlanningDigestV1;
}

export interface ShardedSimulationCheckpointV1 {
  readonly schemaVersion: 1;
  readonly checkpointId: string;
  readonly sessionId: string;
  readonly episodeId: string;
  readonly revision: number;
  readonly logicalTime: number;
  /** Opaque evaluator-owned snapshot reference; snapshot contents never cross this contract. */
  readonly snapshotHandle: string;
  readonly snapshotDigest: PlanningDigestV1;
  readonly anchor: ShardedSimulationDurableAnchorV1;
  readonly checkpointDigest: PlanningDigestV1;
}

export interface ShardedSimulationRestoreRequestV1 {
  readonly schemaVersion: 1;
  readonly checkpoint: ShardedSimulationCheckpointV1;
  readonly expectedAnchorDigest: PlanningDigestV1;
}

export interface ShardedSimulationRestoreReceiptV1 {
  readonly schemaVersion: 1;
  readonly checkpointId: string;
  readonly restoredRevision: number;
  readonly restoredLogicalTime: number;
  readonly receiptDigest: PlanningDigestV1;
}

export interface ShardedSimulationShardAssignmentV1 {
  readonly schemaVersion: 1;
  readonly shardId: string;
  readonly shardIndex: number;
  readonly shardCount: number;
  readonly peerStartInclusive: number;
  readonly peerEndExclusive: number;
  readonly interactionStartInclusive: number;
  readonly interactionEndExclusive: number;
  readonly assignmentDigest: PlanningDigestV1;
}

export interface ShardedSimulationCrossShardMessageV1 {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly sourcePeerIndex: number;
  readonly targetPeerIndex: number;
  readonly logicalTime: number;
  readonly payloadDigest: PlanningDigestV1;
}

export interface ShardedSimulationCrossShardMessageBatchV1 {
  readonly schemaVersion: 1;
  readonly batchId: string;
  readonly sessionId: string;
  readonly episodeId: string;
  readonly sourceShardId: string;
  readonly targetShardId: string;
  readonly logicalTime: number;
  readonly messages: readonly ShardedSimulationCrossShardMessageV1[];
  readonly batchDigest: PlanningDigestV1;
}

export interface ShardedSimulationCrossShardMessageAckV1 {
  readonly schemaVersion: 1;
  readonly batchId: string;
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly deliveredEventIds: readonly string[];
  readonly ackDigest: PlanningDigestV1;
}

export type ShardedSimulationFaultKindV1 =
  | "failure"
  | "restart"
  | "partition"
  | "heal"
  | "compromised-actor"
  | "rogue-actor"
  | "misleading-observation"
  | "conflicting-observation";

export interface ShardedSimulationFaultScheduleEntryV1 {
  readonly schemaVersion: 1;
  readonly faultId: string;
  readonly kind: ShardedSimulationFaultKindV1;
  readonly logicalTime: number;
  readonly targetPeerIndexes: readonly number[];
  readonly faultDigest: PlanningDigestV1;
}

export interface ShardedSimulationFaultObservationV1 {
  readonly schemaVersion: 1;
  readonly faultId: string;
  readonly kind: ShardedSimulationFaultKindV1;
  readonly observedAtLogicalTime: number;
  readonly observationDigest: PlanningDigestV1;
}

/** Evaluators aggregate these content-free counters; neither runner nor peers receive a verdict. */
export interface ShardedSimulationMetricSampleV1 {
  readonly schemaVersion: 1;
  readonly interactionCount: number;
  readonly missionSuccessCount: number;
  readonly recoveryToBaselineCount: number;
  readonly roleCoherenceLength: number;
}

export interface ShardedSimulationMetricAggregateV1 extends ShardedSimulationMetricSampleV1 {
  readonly metricDigest: PlanningDigestV1;
}

/** Transport-neutral boundary. HTTP and gRPC adapters can implement this without SDK coupling. */
export interface ShardedSimulationEnvironmentBridgeV1 {
  createSession(input: {
    readonly environmentId: string;
    readonly logicalTime: number;
  }):
    | ShardedSimulationEnvironmentSessionV1
    | Promise<ShardedSimulationEnvironmentSessionV1>;
  startEpisode(input: {
    readonly session: ShardedSimulationEnvironmentSessionV1;
    readonly episodeId: string;
    readonly seed: number;
    readonly logicalTime: number;
  }): ShardedSimulationEpisodeV1 | Promise<ShardedSimulationEpisodeV1>;
  bindShardAssignments(input: {
    readonly session: ShardedSimulationEnvironmentSessionV1;
    readonly episode: ShardedSimulationEpisodeV1;
    readonly profile: ShardedSimulationScaleProfileV1;
    readonly assignments: readonly ShardedSimulationShardAssignmentV1[];
  }): void | Promise<void>;
  pullPartialObservation(
    input: ShardedSimulationPartialObservationPullV1,
  ):
    | ShardedSimulationPartialObservationDeliveryV1
    | Promise<ShardedSimulationPartialObservationDeliveryV1>;
  requestEffect(
    input: ShardedSimulationFencedActionRequestV1,
  ):
    | ShardedSimulationEffectReceiptV1
    | Promise<ShardedSimulationEffectReceiptV1>;
  deliverCrossShardBatch(
    input: ShardedSimulationCrossShardMessageBatchV1,
  ):
    | ShardedSimulationCrossShardMessageAckV1
    | Promise<ShardedSimulationCrossShardMessageAckV1>;
  checkpoint(input: {
    readonly session: ShardedSimulationEnvironmentSessionV1;
    readonly episode: ShardedSimulationEpisodeV1;
    readonly expectedRevision: number;
    readonly logicalTime: number;
  }): ShardedSimulationCheckpointV1 | Promise<ShardedSimulationCheckpointV1>;
  restore(
    input: ShardedSimulationRestoreRequestV1,
  ):
    | ShardedSimulationRestoreReceiptV1
    | Promise<ShardedSimulationRestoreReceiptV1>;
}

/** Evaluator authority is separate from the runner-visible environment bridge. */
export interface ShardedSimulationEvaluatorPortV1 {
  finalizeMetrics(input: {
    readonly session: ShardedSimulationEnvironmentSessionV1;
    readonly episode: ShardedSimulationEpisodeV1;
    readonly interactionCount: number;
  }):
    | ShardedSimulationMetricAggregateV1
    | Promise<ShardedSimulationMetricAggregateV1>;
}

export function shardedSimulationScaleProfileV1(
  profileId: ShardedSimulationScaleProfileIdV1,
): ShardedSimulationScaleProfileV1 {
  const record = profileRecord(profileId);
  const progressive = collectiveProgressiveScaleProfileV1(record.tier);
  const body = {
    schemaVersion: 1 as const,
    profileId,
    tier: record.tier,
    logicalPeerCount: progressive.agentCount,
    interactionCeiling: progressive.maximumInteractions,
    overlayProfileId: record.overlayProfileId,
  };
  return freeze({
    ...body,
    profileDigest: digest("sharded-simulation-scale-profile-v1", body),
  });
}

export const SHARDED_SIMULATION_SCALE_PROFILES_V1 = Object.freeze(
  SHARDED_SIMULATION_SCALE_PROFILE_IDS_V1.map(shardedSimulationScaleProfileV1),
);

export function createShardedSimulationAssignmentsV1(input: {
  readonly profile: ShardedSimulationScaleProfileV1;
  readonly shardCount: number;
}): readonly ShardedSimulationShardAssignmentV1[] {
  positiveInteger(input.shardCount, "shardCount");
  if (input.shardCount > input.profile.logicalPeerCount)
    throw new RangeError("sharded_simulation_shard_count_exceeds_peers");
  const width = String(input.shardCount - 1).length;
  return Object.freeze(
    Array.from({ length: input.shardCount }, (_, shardIndex) => {
      const body = {
        schemaVersion: 1 as const,
        shardId: `shard-${String(shardIndex).padStart(width, "0")}`,
        shardIndex,
        shardCount: input.shardCount,
        peerStartInclusive: partition(
          input.profile.logicalPeerCount,
          shardIndex,
          input.shardCount,
        ),
        peerEndExclusive: partition(
          input.profile.logicalPeerCount,
          shardIndex + 1,
          input.shardCount,
        ),
        interactionStartInclusive: partition(
          input.profile.interactionCeiling,
          shardIndex,
          input.shardCount,
        ),
        interactionEndExclusive: partition(
          input.profile.interactionCeiling,
          shardIndex + 1,
          input.shardCount,
        ),
      };
      return freeze({
        ...body,
        assignmentDigest: digest("sharded-simulation-assignment-v1", body),
      });
    }),
  );
}

export function shardedSimulationAssignmentForPeerV1(
  assignments: readonly ShardedSimulationShardAssignmentV1[],
  peerIndex: number,
): ShardedSimulationShardAssignmentV1 {
  positiveInteger(peerIndex, "peerIndex", true);
  const first = assignments[0];
  if (!first || assignments.length !== first.shardCount)
    throw new TypeError("sharded_simulation_assignments_invalid");
  const totalPeers = assignments[assignments.length - 1]!.peerEndExclusive;
  if (peerIndex >= totalPeers)
    throw new RangeError("sharded_simulation_peer_not_assigned");
  // For ranges floor(N*i/S)..floor(N*(i+1)/S), this locates i in constant time.
  const shardIndex = Math.floor(
    ((peerIndex + 1) * first.shardCount - 1) / totalPeers,
  );
  const assignment = assignments[shardIndex];
  if (
    !assignment ||
    peerIndex < assignment.peerStartInclusive ||
    peerIndex >= assignment.peerEndExclusive
  )
    throw new RangeError("sharded_simulation_peer_not_assigned");
  return assignment;
}

/** Binds an action's intent to its session, episode, ownership fence, and payload. */
export function shardedSimulationFencedActionDigestV1(
  input: Omit<ShardedSimulationFencedActionRequestV1, "actionDigest">,
): PlanningDigestV1 {
  return digest("sharded-simulation-fenced-action-v1", input);
}

/**
 * Produces the one wire representation of a batch. Message order and digest
 * deliberately do not depend on the transport's iteration order.
 */
export function createShardedSimulationCrossShardMessageBatchV1(input: {
  readonly batchId: string;
  readonly sessionId: string;
  readonly episodeId: string;
  readonly sourceShardId: string;
  readonly targetShardId: string;
  readonly logicalTime: number;
  readonly messages: readonly ShardedSimulationCrossShardMessageV1[];
}): ShardedSimulationCrossShardMessageBatchV1 {
  for (const identifier of [
    input.batchId,
    input.sessionId,
    input.episodeId,
    input.sourceShardId,
    input.targetShardId,
  ])
    boundedIdentifier(
      identifier,
      "sharded_simulation_batch_identifier_invalid",
    );
  positiveInteger(input.logicalTime, "logicalTime", true);
  const messages = canonicalShardedSimulationMessagesV1(input.messages);
  const body = {
    schemaVersion: 1 as const,
    batchId: input.batchId,
    sessionId: input.sessionId,
    episodeId: input.episodeId,
    sourceShardId: input.sourceShardId,
    targetShardId: input.targetShardId,
    logicalTime: input.logicalTime,
    messages,
  };
  return freeze({
    ...body,
    batchDigest: digest("sharded-simulation-cross-shard-batch-v1", body),
  });
}

export function canonicalShardedSimulationMessagesV1(
  messages: readonly ShardedSimulationCrossShardMessageV1[],
): readonly ShardedSimulationCrossShardMessageV1[] {
  if (messages.length > SHARDED_SIMULATION_LIMITS_V1.maximumMessagesPerBatch)
    throw new RangeError("sharded_simulation_batch_message_limit_exceeded");
  for (const message of messages) {
    if (
      message.schemaVersion !== 1 ||
      !Number.isSafeInteger(message.sourcePeerIndex) ||
      message.sourcePeerIndex < 0 ||
      !Number.isSafeInteger(message.targetPeerIndex) ||
      message.targetPeerIndex < 0 ||
      !Number.isSafeInteger(message.logicalTime) ||
      message.logicalTime < 0 ||
      !/^sha256:[0-9a-f]{64}$/u.test(message.payloadDigest)
    )
      throw new TypeError("sharded_simulation_message_invalid");
    boundedIdentifier(
      message.eventId,
      "sharded_simulation_message_identifier_invalid",
    );
  }
  const sorted = [...messages].sort((left, right) =>
    left.eventId.localeCompare(right.eventId),
  );
  if (new Set(sorted.map((message) => message.eventId)).size !== sorted.length)
    throw new TypeError("sharded_simulation_message_duplicate");
  return Object.freeze(sorted.map((message) => freeze({ ...message })));
}

export function aggregateShardedSimulationMetricsV1(
  samples: readonly ShardedSimulationMetricSampleV1[],
): ShardedSimulationMetricAggregateV1 {
  const body = samples.reduce<ShardedSimulationMetricSampleV1>(
    (total, sample) => {
      for (const value of [
        sample.interactionCount,
        sample.missionSuccessCount,
        sample.recoveryToBaselineCount,
        sample.roleCoherenceLength,
      ])
        if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000)
          throw new RangeError("sharded_simulation_metric_sample_invalid");
      const next = {
        schemaVersion: 1 as const,
        interactionCount: total.interactionCount + sample.interactionCount,
        missionSuccessCount:
          total.missionSuccessCount + sample.missionSuccessCount,
        recoveryToBaselineCount:
          total.recoveryToBaselineCount + sample.recoveryToBaselineCount,
        roleCoherenceLength:
          total.roleCoherenceLength + sample.roleCoherenceLength,
      };
      if (
        !Number.isSafeInteger(next.interactionCount) ||
        !Number.isSafeInteger(next.missionSuccessCount) ||
        !Number.isSafeInteger(next.recoveryToBaselineCount) ||
        !Number.isSafeInteger(next.roleCoherenceLength)
      )
        throw new RangeError("sharded_simulation_metric_sum_overflow");
      return next;
    },
    {
      schemaVersion: 1,
      interactionCount: 0,
      missionSuccessCount: 0,
      recoveryToBaselineCount: 0,
      roleCoherenceLength: 0,
    },
  );
  return freeze({
    ...body,
    metricDigest: digest("sharded-simulation-metrics-v1", body),
  });
}

export function shardedSimulationDigestV1(
  domain: string,
  value: unknown,
): PlanningDigestV1 {
  return digest(domain, value);
}

function profileRecord(profileId: ShardedSimulationScaleProfileIdV1): {
  readonly tier: CollectiveProgressiveScaleTierV1;
  readonly overlayProfileId: "standard-500" | "large-5000" | "frontier-100000";
} {
  switch (profileId) {
    case "peers-500-interactions-5000":
      return { tier: "baseline", overlayProfileId: "standard-500" };
    case "peers-5000-interactions-50000":
      return { tier: "resilient", overlayProfileId: "large-5000" };
    case "peers-100000-interactions-1000000":
      return { tier: "frontier", overlayProfileId: "frontier-100000" };
  }
}

function partition(total: number, index: number, count: number): number {
  return Math.floor((total * index) / count);
}
function positiveInteger(
  value: number,
  label: string,
  allowZero = false,
): void {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1))
    throw new TypeError(`${label} must be a safe integer`);
}
function boundedIdentifier(value: string, code: string): void {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > SHARDED_SIMULATION_LIMITS_V1.maximumIdentifierLength
  )
    throw new TypeError(code);
}
/** The shared canonical digest registry is closed; preserve this module's domain inside its canonical payload. */
function digest(domain: string, value: unknown): PlanningDigestV1 {
  return digestPlanningJsonV1("environment-state-v1", {
    domain,
    value,
  } as unknown as PlanningJson);
}
function freeze<T>(value: T): T {
  return deepFreezePlanning(value as unknown as PlanningJson) as unknown as T;
}
