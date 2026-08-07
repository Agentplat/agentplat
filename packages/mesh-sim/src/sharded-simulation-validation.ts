import type {
  ShardedSimulationCheckpointV1,
  ShardedSimulationCrossShardMessageBatchV1,
  ShardedSimulationFaultScheduleEntryV1,
  ShardedSimulationScaleProfileV1,
  ShardedSimulationShardAssignmentV1,
} from "./sharded-simulation-contracts.js";
import {
  createShardedSimulationCrossShardMessageBatchV1,
  createShardedSimulationAssignmentsV1,
  SHARDED_SIMULATION_LIMITS_V1,
  shardedSimulationDigestV1,
  shardedSimulationScaleProfileV1,
} from "./sharded-simulation-contracts.js";

const DIGEST = /^sha256:[0-9a-f]{64}$/u;

export function validateShardedSimulationScaleProfileV1(
  input: unknown,
): ShardedSimulationScaleProfileV1 {
  const value = record(
    input,
    "sharded simulation scale profile",
  ) as unknown as ShardedSimulationScaleProfileV1;
  const rebuilt = shardedSimulationScaleProfileV1(value.profileId);
  if (!same(value, rebuilt)) fail("sharded_simulation_scale_profile_invalid");
  return rebuilt;
}

export function validateShardedSimulationShardAssignmentsV1(
  input: unknown,
  profile: ShardedSimulationScaleProfileV1,
): readonly ShardedSimulationShardAssignmentV1[] {
  if (!Array.isArray(input) || input.length === 0)
    fail("sharded_simulation_assignments_invalid");
  const assignments = input as readonly ShardedSimulationShardAssignmentV1[];
  const rebuilt = createShardedSimulationAssignmentsV1({
    profile,
    shardCount: assignments.length,
  });
  if (!same(assignments, rebuilt))
    fail("sharded_simulation_assignments_invalid");
  return rebuilt;
}

export function validateShardedSimulationCrossShardMessageBatchV1(
  input: unknown,
  profile?: ShardedSimulationScaleProfileV1 | null,
  assignments?: readonly ShardedSimulationShardAssignmentV1[] | null,
): ShardedSimulationCrossShardMessageBatchV1 {
  const value = record(
    input,
    "cross shard batch",
  ) as unknown as ShardedSimulationCrossShardMessageBatchV1;
  exact(
    value,
    [
      "schemaVersion",
      "batchId",
      "sessionId",
      "episodeId",
      "sourceShardId",
      "targetShardId",
      "logicalTime",
      "messages",
      "batchDigest",
    ],
    "cross shard batch",
  );
  if (
    value.schemaVersion !== 1 ||
    !identifier(value.batchId) ||
    !identifier(value.sessionId) ||
    !identifier(value.episodeId) ||
    !identifier(value.sourceShardId) ||
    !identifier(value.targetShardId)
  )
    fail("sharded_simulation_batch_invalid");
  nonNegative(value.logicalTime, "logicalTime");
  if (
    !Array.isArray(value.messages) ||
    value.messages.length > SHARDED_SIMULATION_LIMITS_V1.maximumMessagesPerBatch
  )
    fail("sharded_simulation_batch_messages_invalid");
  const ids = new Set<string>();
  for (const candidate of value.messages) {
    const message = record(
      candidate,
      "cross shard message",
    ) as unknown as ShardedSimulationCrossShardMessageBatchV1["messages"][number];
    exact(
      message,
      [
        "schemaVersion",
        "eventId",
        "sourcePeerIndex",
        "targetPeerIndex",
        "logicalTime",
        "payloadDigest",
      ],
      "cross shard message",
    );
    if (
      message.schemaVersion !== 1 ||
      !identifier(message.eventId) ||
      ids.has(message.eventId)
    )
      fail("sharded_simulation_message_invalid");
    ids.add(message.eventId);
    nonNegative(message.sourcePeerIndex, "sourcePeerIndex");
    nonNegative(message.targetPeerIndex, "targetPeerIndex");
    nonNegative(message.logicalTime, "message logicalTime");
    digest(message.payloadDigest, "payloadDigest");
    if (message.logicalTime > value.logicalTime)
      fail("sharded_simulation_message_time_invalid");
    if (
      profile &&
      (message.sourcePeerIndex >= profile.logicalPeerCount ||
        message.targetPeerIndex >= profile.logicalPeerCount)
    )
      fail("sharded_simulation_message_peer_invalid");
    if (assignments) {
      const source = assignmentForPeer(assignments, message.sourcePeerIndex);
      const target = assignmentForPeer(assignments, message.targetPeerIndex);
      if (
        !source ||
        !target ||
        source.shardId !== value.sourceShardId ||
        target.shardId !== value.targetShardId
      )
        fail("sharded_simulation_message_assignment_invalid");
    }
  }
  const canonical = createShardedSimulationCrossShardMessageBatchV1({
    batchId: value.batchId,
    sessionId: value.sessionId,
    episodeId: value.episodeId,
    sourceShardId: value.sourceShardId,
    targetShardId: value.targetShardId,
    logicalTime: value.logicalTime,
    messages: value.messages,
  });
  if (canonical.batchDigest !== value.batchDigest)
    fail("sharded_simulation_batch_digest_invalid");
  return canonical;
}

export function validateShardedSimulationFaultScheduleV1(
  input: unknown,
  bounds?: {
    readonly logicalPeerCount: number;
    readonly maximumLogicalTime: number;
  },
): readonly ShardedSimulationFaultScheduleEntryV1[] {
  if (
    !Array.isArray(input) ||
    input.length > SHARDED_SIMULATION_LIMITS_V1.maximumFaults
  )
    fail("sharded_simulation_fault_schedule_invalid");
  const ids = new Set<string>();
  let totalTargets = 0;
  const allowed = new Set([
    "failure",
    "restart",
    "partition",
    "heal",
    "compromised-actor",
    "rogue-actor",
    "misleading-observation",
    "conflicting-observation",
  ]);
  return Object.freeze(
    input
      .map((entry) => {
        const value = record(
          entry,
          "fault schedule entry",
        ) as unknown as ShardedSimulationFaultScheduleEntryV1;
        exact(
          value,
          [
            "schemaVersion",
            "faultId",
            "kind",
            "logicalTime",
            "targetPeerIndexes",
            "faultDigest",
          ],
          "fault schedule entry",
        );
        if (
          value.schemaVersion !== 1 ||
          !identifier(value.faultId) ||
          ids.has(value.faultId) ||
          !allowed.has(value.kind)
        )
          fail("sharded_simulation_fault_invalid");
        ids.add(value.faultId);
        nonNegative(value.logicalTime, "fault logicalTime");
        if (
          !Array.isArray(value.targetPeerIndexes) ||
          value.targetPeerIndexes.length === 0 ||
          value.targetPeerIndexes.length >
            SHARDED_SIMULATION_LIMITS_V1.maximumTargetsPerFault ||
          totalTargets + value.targetPeerIndexes.length >
            SHARDED_SIMULATION_LIMITS_V1.maximumTotalTargetsAcrossSchedule ||
          new Set(value.targetPeerIndexes).size !==
            value.targetPeerIndexes.length ||
          value.targetPeerIndexes.some(
            (peer) =>
              !Number.isSafeInteger(peer) ||
              peer < 0 ||
              (bounds !== undefined && peer >= bounds.logicalPeerCount),
          )
        )
          fail("sharded_simulation_fault_targets_invalid");
        totalTargets += value.targetPeerIndexes.length;
        if (
          bounds !== undefined &&
          (value.logicalTime < 1 ||
            value.logicalTime > bounds.maximumLogicalTime)
        )
          fail("sharded_simulation_fault_time_invalid");
        const { faultDigest: ignored, ...body } = value;
        if (
          shardedSimulationDigestV1("sharded-simulation-fault-v1", body) !==
          value.faultDigest
        )
          fail("sharded_simulation_fault_digest_invalid");
        return value;
      })
      .sort(
        (left, right) =>
          left.logicalTime - right.logicalTime ||
          left.faultId.localeCompare(right.faultId),
      ),
  );
}

export function validateShardedSimulationCheckpointV1(
  input: unknown,
): ShardedSimulationCheckpointV1 {
  const value = record(
    input,
    "checkpoint",
  ) as unknown as ShardedSimulationCheckpointV1;
  exact(
    value,
    [
      "schemaVersion",
      "checkpointId",
      "sessionId",
      "episodeId",
      "revision",
      "logicalTime",
      "snapshotHandle",
      "snapshotDigest",
      "anchor",
      "checkpointDigest",
    ],
    "checkpoint",
  );
  if (
    value.schemaVersion !== 1 ||
    !identifier(value.checkpointId) ||
    !identifier(value.sessionId) ||
    !identifier(value.episodeId)
  )
    fail("sharded_simulation_checkpoint_invalid");
  nonNegative(value.revision, "revision");
  nonNegative(value.logicalTime, "logicalTime");
  if (!identifier(value.snapshotHandle))
    fail("sharded_simulation_snapshot_handle_invalid");
  digest(value.snapshotDigest, "snapshotDigest");
  exact(
    value.anchor,
    [
      "schemaVersion",
      "anchorId",
      "revision",
      "previousAnchorDigest",
      "anchorDigest",
    ],
    "checkpoint anchor",
  );
  if (
    value.anchor.schemaVersion !== 1 ||
    value.anchor.revision !== value.revision ||
    !identifier(value.anchor.anchorId)
  )
    fail("sharded_simulation_anchor_invalid");
  if (value.anchor.previousAnchorDigest !== null)
    digest(value.anchor.previousAnchorDigest, "previousAnchorDigest");
  const { anchorDigest: ignoredAnchor, ...anchorBody } = value.anchor;
  if (
    shardedSimulationDigestV1(
      "sharded-simulation-durable-anchor-v1",
      anchorBody,
    ) !== value.anchor.anchorDigest
  )
    fail("sharded_simulation_anchor_digest_invalid");
  const { checkpointDigest: ignored, ...body } = value;
  if (
    shardedSimulationDigestV1("sharded-simulation-checkpoint-v1", body) !==
    value.checkpointDigest
  )
    fail("sharded_simulation_checkpoint_digest_invalid");
  return value;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    fail(`${label}_invalid`);
  return value as Record<string, unknown>;
}
function exact(value: object, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  if (
    actual.length !== keys.length ||
    actual.some((key, index) => key !== [...keys].sort()[index])
  )
    fail(`${label}_keys_invalid`);
}
function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
function identifier(value: unknown): value is string {
  return (
    nonEmpty(value) &&
    value.length <= SHARDED_SIMULATION_LIMITS_V1.maximumIdentifierLength
  );
}
function assignmentForPeer(
  assignments: readonly ShardedSimulationShardAssignmentV1[],
  peerIndex: number,
): ShardedSimulationShardAssignmentV1 | undefined {
  const first = assignments[0];
  const last = assignments[assignments.length - 1];
  if (
    !first ||
    !last ||
    peerIndex < 0 ||
    peerIndex >= last.peerEndExclusive ||
    first.shardCount !== assignments.length
  )
    return undefined;
  const shardIndex = Math.floor(
    ((peerIndex + 1) * first.shardCount - 1) / last.peerEndExclusive,
  );
  const assignment = assignments[shardIndex];
  return assignment &&
    assignment.peerStartInclusive <= peerIndex &&
    peerIndex < assignment.peerEndExclusive
    ? assignment
    : undefined;
}
function nonNegative(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    fail(`${label}_invalid`);
}
function digest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !DIGEST.test(value))
    fail(`${label}_invalid`);
}
function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
function fail(code: string): never {
  throw new TypeError(code);
}
