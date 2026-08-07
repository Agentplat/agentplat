import type {
  PlanningDigestV1,
  PlanningJson,
} from "@agentplat/collective-planning";
import {
  aggregateShardedSimulationMetricsV1,
  createShardedSimulationAssignmentsV1,
  createShardedSimulationCrossShardMessageBatchV1,
  SHARDED_SIMULATION_LIMITS_V1,
  shardedSimulationAssignmentForPeerV1,
  shardedSimulationDigestV1,
  shardedSimulationFencedActionDigestV1,
  type ShardedSimulationCheckpointV1,
  type ShardedSimulationCrossShardMessageAckV1,
  type ShardedSimulationCrossShardMessageBatchV1,
  type ShardedSimulationDurableAnchorV1,
  type ShardedSimulationEffectReceiptV1,
  type ShardedSimulationEnvironmentBridgeV1,
  type ShardedSimulationEnvironmentSessionV1,
  type ShardedSimulationEpisodeV1,
  type ShardedSimulationEvaluatorPortV1,
  type ShardedSimulationFencedActionRequestV1,
  type ShardedSimulationFaultObservationV1,
  type ShardedSimulationFaultScheduleEntryV1,
  type ShardedSimulationMetricAggregateV1,
  type ShardedSimulationPartialObservationDeliveryV1,
  type ShardedSimulationRestoreReceiptV1,
  type ShardedSimulationRestoreRequestV1,
  type ShardedSimulationScaleProfileV1,
  type ShardedSimulationShardAssignmentV1,
} from "./sharded-simulation-contracts.js";
import {
  validateShardedSimulationCheckpointV1,
  validateShardedSimulationCrossShardMessageBatchV1,
  validateShardedSimulationFaultScheduleV1,
  validateShardedSimulationScaleProfileV1,
} from "./sharded-simulation-validation.js";

interface LocalSnapshot {
  readonly logicalTime: number;
  readonly effects: readonly [string, ShardedSimulationEffectReceiptV1][];
  readonly actionFingerprints: readonly [string, PlanningDigestV1][];
  readonly events: readonly [string, PlanningDigestV1][];
  readonly batches: readonly [
    string,
    PlanningDigestV1,
    ShardedSimulationCrossShardMessageAckV1,
  ][];
}
interface LocalEpisodeState {
  revision: number;
  logicalTime: number;
  anchorDigest: PlanningDigestV1 | null;
  profile: ShardedSimulationScaleProfileV1 | null;
  assignments: readonly ShardedSimulationShardAssignmentV1[] | null;
  readonly effects: Map<string, ShardedSimulationEffectReceiptV1>;
  readonly actionFingerprints: Map<string, PlanningDigestV1>;
  readonly events: Map<string, PlanningDigestV1>;
  readonly batches: Map<
    string,
    {
      readonly digest: PlanningDigestV1;
      readonly ack: ShardedSimulationCrossShardMessageAckV1;
    }
  >;
  readonly snapshots: Map<string, LocalSnapshot>;
}

/** Local composition only. Snapshots stay private to this instance and are never serialized to a runner. */
export class InMemoryShardedSimulationBridgeV1
  implements
    ShardedSimulationEnvironmentBridgeV1,
    ShardedSimulationEvaluatorPortV1
{
  readonly #sessions = new Map<string, ShardedSimulationEnvironmentSessionV1>();
  readonly #episodes = new Map<string, ShardedSimulationEpisodeV1>();
  readonly #states = new Map<string, LocalEpisodeState>();
  #sessionSequence = 0;

  createSession(input: {
    readonly environmentId: string;
    readonly logicalTime: number;
  }): ShardedSimulationEnvironmentSessionV1 {
    nonEmpty(input.environmentId, "environmentId");
    nonNegative(input.logicalTime, "logicalTime");
    const body = {
      schemaVersion: 1 as const,
      sessionId: `local-session-${this.#sessionSequence++}`,
      environmentId: input.environmentId,
      createdAtLogicalTime: input.logicalTime,
    };
    const session = freeze({
      ...body,
      sessionDigest: digest("sharded-simulation-session-v1", body),
    });
    this.#sessions.set(session.sessionId, session);
    return session;
  }
  startEpisode(input: {
    readonly session: ShardedSimulationEnvironmentSessionV1;
    readonly episodeId: string;
    readonly seed: number;
    readonly logicalTime: number;
  }): ShardedSimulationEpisodeV1 {
    validateSession(input.session);
    this.#session(input.session);
    nonEmpty(input.episodeId, "episodeId");
    nonNegative(input.seed, "seed");
    nonNegative(input.logicalTime, "logicalTime");
    const key = episodeKey(input.session.sessionId, input.episodeId);
    const existing = this.#episodes.get(key);
    if (existing) {
      if (
        existing.seed !== input.seed ||
        existing.startedAtLogicalTime !== input.logicalTime
      )
        throw new Error("sharded_simulation_episode_equivocation");
      return existing;
    }
    const body = {
      schemaVersion: 1 as const,
      sessionId: input.session.sessionId,
      episodeId: input.episodeId,
      seed: input.seed,
      startedAtLogicalTime: input.logicalTime,
    };
    const episode = freeze({
      ...body,
      episodeDigest: digest("sharded-simulation-episode-v1", body),
    });
    this.#episodes.set(key, episode);
    this.#states.set(key, {
      revision: 0,
      logicalTime: input.logicalTime,
      anchorDigest: null,
      profile: null,
      assignments: null,
      effects: new Map(),
      actionFingerprints: new Map(),
      events: new Map(),
      batches: new Map(),
      snapshots: new Map(),
    });
    return episode;
  }
  bindShardAssignments(input: {
    readonly session: ShardedSimulationEnvironmentSessionV1;
    readonly episode: ShardedSimulationEpisodeV1;
    readonly profile: ShardedSimulationScaleProfileV1;
    readonly assignments: readonly ShardedSimulationShardAssignmentV1[];
  }): void {
    validateSession(input.session);
    this.#session(input.session);
    validateEpisode(input.episode, input.session);
    this.#episode(input.session, input.episode);
    const profile = validateShardedSimulationScaleProfileV1(input.profile);
    const expected = createShardedSimulationAssignmentsV1({
      profile,
      shardCount: input.assignments.length,
    });
    if (!same(input.assignments, expected))
      throw new TypeError("sharded_simulation_assignments_invalid");
    const state = this.#state(input.session.sessionId, input.episode.episodeId);
    if (
      state.profile !== null &&
      (!same(state.profile, profile) || !same(state.assignments, expected))
    )
      throw new Error("sharded_simulation_assignments_equivocation");
    state.profile = profile;
    state.assignments = expected;
  }
  pullPartialObservation(
    input: Parameters<
      ShardedSimulationEnvironmentBridgeV1["pullPartialObservation"]
    >[0],
  ): ShardedSimulationPartialObservationDeliveryV1 {
    validatePull(input);
    const state = this.#boundState(input.sessionId, input.episodeId);
    this.#assignedPeer(state, input.peerIndex);
    state.logicalTime = Math.max(state.logicalTime, input.logicalTime);
    const body = {
      schemaVersion: 1 as const,
      requestId: input.requestId,
      peerIndex: input.peerIndex,
      logicalTime: input.logicalTime,
      observations: [] as readonly PlanningJson[],
      nextCursor: null,
    };
    return freeze({
      ...body,
      deliveryDigest: digest(
        "sharded-simulation-observation-delivery-v1",
        body,
      ),
    });
  }
  requestEffect(
    input: Parameters<ShardedSimulationEnvironmentBridgeV1["requestEffect"]>[0],
  ): ShardedSimulationEffectReceiptV1 {
    validateAction(input);
    const state = this.#boundState(input.sessionId, input.episodeId);
    this.#assignedPeer(state, input.peerIndex);
    const fingerprint = digest("sharded-simulation-action-request-v1", input);
    const previous = state.effects.get(input.actionId);
    if (previous) {
      if (state.actionFingerprints.get(input.actionId) !== fingerprint)
        throw new Error("sharded_simulation_action_equivocation");
      return previous;
    }
    const accepted =
      input.fenceToken ===
      fence(
        input.sessionId,
        input.episodeId,
        input.peerIndex,
        input.executionEpoch,
      );
    const effectDigest = digest("sharded-simulation-effect-v1", {
      actionDigest: input.actionDigest,
      accepted,
      executionEpoch: input.executionEpoch,
      fenceToken: input.fenceToken,
    });
    const body = {
      schemaVersion: 1 as const,
      actionId: input.actionId,
      accepted,
      logicalTime: input.logicalTime,
      executionEpoch: input.executionEpoch,
      fenceToken: input.fenceToken,
      effectDigest,
    };
    const receipt = freeze({
      ...body,
      receiptDigest: digest("sharded-simulation-effect-receipt-v1", body),
    });
    state.effects.set(input.actionId, receipt);
    state.actionFingerprints.set(input.actionId, fingerprint);
    state.logicalTime = Math.max(state.logicalTime, input.logicalTime);
    return receipt;
  }
  deliverCrossShardBatch(
    input: ShardedSimulationCrossShardMessageBatchV1,
  ): ShardedSimulationCrossShardMessageAckV1 {
    const state = this.#boundState(input.sessionId, input.episodeId);
    const batch = validateShardedSimulationCrossShardMessageBatchV1(
      input,
      state.profile,
      state.assignments,
    );
    if (batch.logicalTime < state.logicalTime)
      throw new Error("sharded_simulation_batch_time_regressed");
    const prior = state.batches.get(batch.batchId);
    if (prior) {
      if (prior.digest !== batch.batchDigest)
        throw new Error("sharded_simulation_batch_equivocation");
      const { ackDigest: ignored, ...priorBody } = prior.ack;
      const body = { ...priorBody, duplicate: true };
      return freeze({
        ...body,
        ackDigest: digest("sharded-simulation-cross-shard-ack-v1", body),
      });
    }
    const delivered: string[] = [];
    for (const message of [...batch.messages].sort((a, b) =>
      a.eventId.localeCompare(b.eventId),
    )) {
      const fingerprint = digest(
        "sharded-simulation-cross-shard-event-v1",
        message,
      );
      const earlier = state.events.get(message.eventId);
      if (earlier && earlier !== fingerprint)
        throw new Error("sharded_simulation_event_equivocation");
      if (!earlier) state.events.set(message.eventId, fingerprint);
      // ACKs describe the accepted closure of this batch. An identical event
      // rebatched under a new batch ID is acknowledged even though its effect
      // was already applied.
      delivered.push(message.eventId);
    }
    const body = {
      schemaVersion: 1 as const,
      batchId: batch.batchId,
      accepted: true,
      duplicate: false,
      deliveredEventIds: Object.freeze(delivered),
    };
    const ack = freeze({
      ...body,
      ackDigest: digest("sharded-simulation-cross-shard-ack-v1", body),
    });
    state.batches.set(batch.batchId, { digest: batch.batchDigest, ack });
    state.logicalTime = batch.logicalTime;
    return ack;
  }
  checkpoint(input: {
    readonly session: ShardedSimulationEnvironmentSessionV1;
    readonly episode: ShardedSimulationEpisodeV1;
    readonly expectedRevision: number;
    readonly logicalTime: number;
  }): ShardedSimulationCheckpointV1 {
    validateSession(input.session);
    this.#session(input.session);
    validateEpisode(input.episode, input.session);
    this.#episode(input.session, input.episode);
    const state = this.#boundState(
      input.session.sessionId,
      input.episode.episodeId,
    );
    if (state.revision !== input.expectedRevision)
      throw new Error("sharded_simulation_checkpoint_cas_conflict");
    if (input.logicalTime < state.logicalTime)
      throw new Error("sharded_simulation_checkpoint_time_regressed");
    const revision = state.revision + 1;
    const snapshot = copySnapshot(state);
    const snapshotDigest = digest(
      "sharded-simulation-opaque-snapshot-v1",
      snapshot,
    );
    const anchorBody = {
      schemaVersion: 1 as const,
      anchorId: `${input.session.sessionId}:${input.episode.episodeId}:anchor:${revision}`,
      revision,
      previousAnchorDigest: state.anchorDigest,
    };
    const anchor = freeze({
      ...anchorBody,
      anchorDigest: digest("sharded-simulation-durable-anchor-v1", anchorBody),
    }) as ShardedSimulationDurableAnchorV1;
    const body = {
      schemaVersion: 1 as const,
      checkpointId: `${input.session.sessionId}:${input.episode.episodeId}:checkpoint:${revision}`,
      sessionId: input.session.sessionId,
      episodeId: input.episode.episodeId,
      revision,
      logicalTime: input.logicalTime,
      snapshotHandle: `local-snapshot:${revision}`,
      snapshotDigest,
      anchor,
    };
    const checkpoint = freeze({
      ...body,
      checkpointDigest: digest("sharded-simulation-checkpoint-v1", body),
    });
    state.snapshots.set(checkpoint.checkpointId, snapshot);
    state.revision = revision;
    state.logicalTime = input.logicalTime;
    state.anchorDigest = anchor.anchorDigest;
    return checkpoint;
  }
  restore(
    input: ShardedSimulationRestoreRequestV1,
  ): ShardedSimulationRestoreReceiptV1 {
    const request = validateRestoreRequest(input);
    const checkpoint = validateShardedSimulationCheckpointV1(
      request.checkpoint,
    );
    const state = this.#state(checkpoint.sessionId, checkpoint.episodeId);
    const snapshot = state.snapshots.get(checkpoint.checkpointId);
    if (
      !snapshot ||
      request.expectedAnchorDigest !== checkpoint.anchor.anchorDigest ||
      state.anchorDigest !== checkpoint.anchor.anchorDigest
    )
      throw new Error("sharded_simulation_restore_anchor_rejected");
    if (
      digest("sharded-simulation-opaque-snapshot-v1", snapshot) !==
      checkpoint.snapshotDigest
    )
      throw new Error("sharded_simulation_snapshot_digest_invalid");
    const currentLogicalTime = state.logicalTime;
    restoreSnapshot(state, snapshot);
    state.revision = checkpoint.revision;
    state.logicalTime = currentLogicalTime;
    const body = {
      schemaVersion: 1 as const,
      checkpointId: checkpoint.checkpointId,
      restoredRevision: state.revision,
      restoredLogicalTime: state.logicalTime,
    };
    return freeze({
      ...body,
      receiptDigest: digest("sharded-simulation-restore-receipt-v1", body),
    });
  }
  finalizeMetrics(input: {
    readonly session: ShardedSimulationEnvironmentSessionV1;
    readonly episode: ShardedSimulationEpisodeV1;
    readonly interactionCount: number;
  }): ShardedSimulationMetricAggregateV1 {
    validateSession(input.session);
    this.#session(input.session);
    validateEpisode(input.episode, input.session);
    this.#episode(input.session, input.episode);
    nonNegative(input.interactionCount, "interactionCount");
    const state = this.#boundState(
      input.session.sessionId,
      input.episode.episodeId,
    );
    const accepted = [...state.effects.values()].filter(
      (receipt) => receipt.accepted,
    ).length;
    return aggregateShardedSimulationMetricsV1([
      {
        schemaVersion: 1,
        interactionCount: input.interactionCount,
        missionSuccessCount: accepted,
        recoveryToBaselineCount: 0,
        roleCoherenceLength: accepted,
      },
    ]);
  }
  #session(session: ShardedSimulationEnvironmentSessionV1): void {
    if (
      this.#sessions.get(session.sessionId)?.sessionDigest !==
      session.sessionDigest
    )
      throw new Error("sharded_simulation_session_unknown");
  }
  #episode(
    session: ShardedSimulationEnvironmentSessionV1,
    episode: ShardedSimulationEpisodeV1,
  ): void {
    if (
      episode.sessionId !== session.sessionId ||
      this.#episodes.get(episodeKey(session.sessionId, episode.episodeId))
        ?.episodeDigest !== episode.episodeDigest
    )
      throw new Error("sharded_simulation_episode_unknown");
  }
  #state(sessionId: string, episodeId: string): LocalEpisodeState {
    const state = this.#states.get(episodeKey(sessionId, episodeId));
    if (!state) throw new Error("sharded_simulation_episode_unknown");
    return state;
  }
  #boundState(sessionId: string, episodeId: string): LocalEpisodeState {
    const state = this.#state(sessionId, episodeId);
    if (state.profile === null || state.assignments === null)
      throw new Error("sharded_simulation_assignments_unbound");
    return state;
  }
  #assignedPeer(state: LocalEpisodeState, peerIndex: number): void {
    if (
      !state.assignments ||
      !state.profile ||
      peerIndex >= state.profile.logicalPeerCount
    )
      throw new Error("sharded_simulation_peer_not_assigned");
    shardedSimulationAssignmentForPeerV1(state.assignments, peerIndex);
  }
}

export interface ShardedSimulationLogicalRunInputV1 {
  readonly schemaVersion: 1;
  readonly profile: ShardedSimulationScaleProfileV1;
  readonly shardCount: number;
  readonly interactionCount: number;
  readonly seed: number;
  readonly bridge?: ShardedSimulationEnvironmentBridgeV1;
  readonly faults?: readonly ShardedSimulationFaultScheduleEntryV1[];
}
export interface ShardedSimulationLogicalRunResultV1 {
  readonly schemaVersion: 1;
  readonly traceDigest: PlanningDigestV1;
  readonly interactionCount: number;
  readonly faultObservations: readonly ShardedSimulationFaultObservationV1[];
  readonly processedInteractions: number;
}

/** Streams logical interactions; only an evaluator port may derive success or coherence metrics. */
export async function runShardedSimulationLogicalPeersV1(
  input: ShardedSimulationLogicalRunInputV1,
): Promise<ShardedSimulationLogicalRunResultV1> {
  if (input.schemaVersion !== 1)
    throw new TypeError("sharded_simulation_runner_schema_invalid");
  const profile = validateShardedSimulationScaleProfileV1(input.profile);
  if (
    !Number.isSafeInteger(input.interactionCount) ||
    input.interactionCount < 0 ||
    input.interactionCount > profile.interactionCeiling
  )
    throw new RangeError("sharded_simulation_interaction_ceiling_exceeded");
  const assignments = createShardedSimulationAssignmentsV1({
    profile,
    shardCount: input.shardCount,
  });
  const faults = validateShardedSimulationFaultScheduleV1(input.faults ?? [], {
    logicalPeerCount: profile.logicalPeerCount,
    maximumLogicalTime: input.interactionCount,
  });
  const bridge = input.bridge ?? new InMemoryShardedSimulationBridgeV1();
  const sessionRequest = {
    environmentId: "logical-peer-runner",
    logicalTime: 0,
  };
  const session = validateSession(
    await bridge.createSession(sessionRequest),
    sessionRequest,
  );
  const episodeRequest = {
    session,
    episodeId: `episode-${input.seed}`,
    seed: input.seed,
    logicalTime: 0,
  };
  const episode = validateEpisode(
    await bridge.startEpisode(episodeRequest),
    session,
    episodeRequest,
  );
  await bridge.bindShardAssignments({ session, episode, profile, assignments });
  const faultsByTime = new Map<
    number,
    readonly ShardedSimulationFaultScheduleEntryV1[]
  >();
  for (const fault of faults)
    faultsByTime.set(fault.logicalTime, [
      ...(faultsByTime.get(fault.logicalTime) ?? []),
      fault,
    ]);
  const failed = new Set<number>(),
    partitioned = new Set<number>(),
    compromised = new Set<number>(),
    rogue = new Set<number>(),
    misleadingObservations = new Set<number>(),
    conflictingObservations = new Set<number>(),
    observed = new Set<string>(),
    faultObservations: ShardedSimulationFaultObservationV1[] = [];
  let traceDigest = digest("sharded-simulation-logical-trace-v1", []);
  for (
    let interaction = 0;
    interaction < input.interactionCount;
    interaction += 1
  ) {
    const logicalTime = interaction + 1;
    for (const fault of faultsByTime.get(logicalTime) ?? []) {
      applyFault(
        fault,
        failed,
        partitioned,
        compromised,
        rogue,
        misleadingObservations,
        conflictingObservations,
      );
      observed.add(fault.faultId);
      const body = {
        schemaVersion: 1 as const,
        faultId: fault.faultId,
        kind: fault.kind,
        observedAtLogicalTime: logicalTime,
      };
      faultObservations.push(
        freeze({
          ...body,
          observationDigest: digest(
            "sharded-simulation-fault-observation-v1",
            body,
          ),
        }),
      );
    }
    const peerIndex = (interaction + input.seed) % profile.logicalPeerCount,
      targetPeerIndex = (peerIndex + 1) % profile.logicalPeerCount;
    if (failed.has(peerIndex)) {
      traceDigest = digest("sharded-simulation-logical-trace-v1", {
        previous: traceDigest,
        event: {
          interaction,
          peerIndex,
          logicalTime,
          disposition: "failure-suppressed",
        },
      });
      continue;
    }
    const source = shardedSimulationAssignmentForPeerV1(assignments, peerIndex),
      target = shardedSimulationAssignmentForPeerV1(
        assignments,
        targetPeerIndex,
      );
    const pull = {
      schemaVersion: 1 as const,
      sessionId: session.sessionId,
      episodeId: episode.episodeId,
      peerIndex,
      logicalTime,
      cursor: null,
      requestId: `observation:${interaction}`,
    };
    const delivery = validateDelivery(
      await bridge.pullPartialObservation(pull),
      pull,
    );
    const observationMode = conflictingObservations.has(peerIndex)
      ? "conflicting"
      : misleadingObservations.has(peerIndex)
        ? "misleading"
        : "normal";
    const alteredObservations =
      observationMode === "normal"
        ? delivery.observations
        : Object.freeze([
            ...delivery.observations,
            observationMode === "misleading"
              ? { driverObservation: "misleading", interaction }
              : { driverObservation: "conflict-a", interaction },
            ...(observationMode === "conflicting"
              ? [{ driverObservation: "conflict-b", interaction }]
              : []),
          ]);
    let receiptDigest: PlanningDigestV1 | null = null;
    if (!rogue.has(peerIndex)) {
      const action = {
        type: compromised.has(peerIndex)
          ? "compromised-logical-interaction"
          : observationMode === "conflicting"
            ? "conflicting-observation-resolution"
            : observationMode === "misleading"
              ? "misleading-observation-mitigated-interaction"
              : "logical-interaction",
        interaction,
        observationMode,
      };
      const actionBody = {
        schemaVersion: 1 as const,
        actionId: `action:${interaction}`,
        sessionId: session.sessionId,
        episodeId: episode.episodeId,
        peerIndex,
        logicalTime,
        executionEpoch: 1,
        fenceToken: fence(session.sessionId, episode.episodeId, peerIndex, 1),
        action,
      };
      const request = {
        ...actionBody,
        actionDigest: shardedSimulationFencedActionDigestV1(actionBody),
      };
      const receipt = validateReceipt(
        await bridge.requestEffect(request),
        request,
      );
      receiptDigest = receipt.receiptDigest;
      if (
        receipt.accepted &&
        source.shardId !== target.shardId &&
        !failed.has(targetPeerIndex) &&
        !partitioned.has(peerIndex) &&
        !partitioned.has(targetPeerIndex)
      ) {
        const message = {
          schemaVersion: 1 as const,
          eventId: `event:${interaction}`,
          sourcePeerIndex: peerIndex,
          targetPeerIndex,
          logicalTime,
          payloadDigest: request.actionDigest,
        };
        const batch = createShardedSimulationCrossShardMessageBatchV1({
          batchId: `batch:${interaction}`,
          sessionId: session.sessionId,
          episodeId: episode.episodeId,
          sourceShardId: source.shardId,
          targetShardId: target.shardId,
          logicalTime,
          messages: [message],
        });
        validateAck(
          await bridge.deliverCrossShardBatch(batch),
          batch.batchId,
          batch.messages.map((entry) => entry.eventId),
        );
      }
    }
    traceDigest = digest("sharded-simulation-logical-trace-v1", {
      previous: traceDigest,
      event: {
        interaction,
        peerIndex,
        targetPeerIndex,
        logicalTime,
        observationDigest: delivery.deliveryDigest,
        observationCount: alteredObservations.length,
        receiptDigest,
        disposition: rogue.has(peerIndex)
          ? "rogue-rejected"
          : compromised.has(peerIndex)
            ? "compromised-altered"
            : observationMode === "conflicting"
              ? "conflicting-observation-resolved"
              : observationMode === "misleading"
                ? "misleading-observation-mitigated"
                : "executed",
      },
    });
  }
  if (observed.size !== faults.length)
    throw new Error("sharded_simulation_fault_unobserved");
  return freeze({
    schemaVersion: 1 as const,
    traceDigest,
    interactionCount: input.interactionCount,
    faultObservations: Object.freeze(faultObservations),
    processedInteractions: input.interactionCount,
  });
}

function applyFault(
  fault: ShardedSimulationFaultScheduleEntryV1,
  failed: Set<number>,
  partitioned: Set<number>,
  compromised: Set<number>,
  rogue: Set<number>,
  misleadingObservations: Set<number>,
  conflictingObservations: Set<number>,
): void {
  const target = fault.targetPeerIndexes;
  const set =
    fault.kind === "failure"
      ? failed
      : fault.kind === "partition"
        ? partitioned
        : fault.kind === "compromised-actor"
          ? compromised
          : fault.kind === "rogue-actor"
            ? rogue
            : fault.kind === "misleading-observation"
              ? misleadingObservations
              : conflictingObservations;
  if (fault.kind === "restart") target.forEach((peer) => failed.delete(peer));
  else if (fault.kind === "heal")
    target.forEach((peer) => partitioned.delete(peer));
  else target.forEach((peer) => set.add(peer));
}
function copySnapshot(state: LocalEpisodeState): LocalSnapshot {
  return {
    logicalTime: state.logicalTime,
    effects: [...state.effects],
    actionFingerprints: [...state.actionFingerprints],
    events: [...state.events],
    batches: [...state.batches].map(([id, value]) => [
      id,
      value.digest,
      value.ack,
    ]),
  };
}
function restoreSnapshot(
  state: LocalEpisodeState,
  snapshot: LocalSnapshot,
): void {
  state.effects.clear();
  snapshot.effects.forEach(([id, value]) => state.effects.set(id, value));
  state.actionFingerprints.clear();
  snapshot.actionFingerprints.forEach(([id, value]) =>
    state.actionFingerprints.set(id, value),
  );
  state.events.clear();
  snapshot.events.forEach(([id, value]) => state.events.set(id, value));
  state.batches.clear();
  snapshot.batches.forEach(([id, digestValue, ack]) =>
    state.batches.set(id, { digest: digestValue, ack }),
  );
}
function validateRestoreRequest(
  value: unknown,
): ShardedSimulationRestoreRequestV1 {
  const request = exact(
    value,
    ["schemaVersion", "checkpoint", "expectedAnchorDigest"],
    "restore_request",
  );
  if (request.schemaVersion !== 1 || !digestValue(request.expectedAnchorDigest))
    throw new TypeError("sharded_simulation_restore_request_invalid");
  return request as unknown as ShardedSimulationRestoreRequestV1;
}
function validateSession(
  value: unknown,
  request?: { readonly environmentId: string; readonly logicalTime: number },
): ShardedSimulationEnvironmentSessionV1 {
  const v = exact(
    value,
    [
      "schemaVersion",
      "sessionId",
      "environmentId",
      "createdAtLogicalTime",
      "sessionDigest",
    ],
    "session",
  );
  if (
    v.schemaVersion !== 1 ||
    !str(v.sessionId) ||
    !str(v.environmentId) ||
    !integer(v.createdAtLogicalTime) ||
    !digestValue(v.sessionDigest) ||
    (request !== undefined &&
      (v.environmentId !== request.environmentId ||
        v.createdAtLogicalTime !== request.logicalTime))
  )
    throw new TypeError("sharded_simulation_session_invalid");
  const { sessionDigest: ignored, ...body } = v;
  if (digest("sharded-simulation-session-v1", body) !== v.sessionDigest)
    throw new TypeError("sharded_simulation_session_digest_invalid");
  return v as unknown as ShardedSimulationEnvironmentSessionV1;
}
function validateEpisode(
  value: unknown,
  session: ShardedSimulationEnvironmentSessionV1,
  request?: {
    readonly episodeId: string;
    readonly seed: number;
    readonly logicalTime: number;
  },
): ShardedSimulationEpisodeV1 {
  const v = exact(
    value,
    [
      "schemaVersion",
      "sessionId",
      "episodeId",
      "seed",
      "startedAtLogicalTime",
      "episodeDigest",
    ],
    "episode",
  );
  if (
    v.schemaVersion !== 1 ||
    v.sessionId !== session.sessionId ||
    !str(v.episodeId) ||
    !integer(v.seed) ||
    !integer(v.startedAtLogicalTime) ||
    !digestValue(v.episodeDigest) ||
    (request !== undefined &&
      (v.episodeId !== request.episodeId ||
        v.seed !== request.seed ||
        v.startedAtLogicalTime !== request.logicalTime))
  )
    throw new TypeError("sharded_simulation_episode_invalid");
  const { episodeDigest: ignored, ...body } = v;
  if (digest("sharded-simulation-episode-v1", body) !== v.episodeDigest)
    throw new TypeError("sharded_simulation_episode_digest_invalid");
  return v as unknown as ShardedSimulationEpisodeV1;
}
function validatePull(value: unknown): void {
  const v = exact(
    value,
    [
      "schemaVersion",
      "sessionId",
      "episodeId",
      "peerIndex",
      "logicalTime",
      "cursor",
      "requestId",
    ],
    "pull",
  );
  if (
    v.schemaVersion !== 1 ||
    !str(v.sessionId) ||
    !str(v.episodeId) ||
    !integer(v.peerIndex) ||
    !integer(v.logicalTime) ||
    !(v.cursor === null || str(v.cursor)) ||
    !str(v.requestId)
  )
    throw new TypeError("sharded_simulation_pull_invalid");
}
function validateAction(value: unknown): void {
  const v = exact(
    value,
    [
      "schemaVersion",
      "actionId",
      "sessionId",
      "episodeId",
      "peerIndex",
      "logicalTime",
      "executionEpoch",
      "fenceToken",
      "action",
      "actionDigest",
    ],
    "action",
  );
  if (
    v.schemaVersion !== 1 ||
    !str(v.actionId) ||
    !str(v.sessionId) ||
    !str(v.episodeId) ||
    !integer(v.peerIndex) ||
    !integer(v.logicalTime) ||
    !integer(v.executionEpoch) ||
    !str(v.fenceToken) ||
    !digestValue(v.actionDigest)
  )
    throw new TypeError("sharded_simulation_action_invalid");
  const { actionDigest, ...body } = v;
  if (
    shardedSimulationFencedActionDigestV1(
      body as unknown as Omit<
        ShardedSimulationFencedActionRequestV1,
        "actionDigest"
      >,
    ) !== actionDigest
  )
    throw new TypeError("sharded_simulation_action_digest_invalid");
}
function validateDelivery(
  value: unknown,
  pull: {
    readonly requestId: string;
    readonly peerIndex: number;
    readonly logicalTime: number;
  },
): ShardedSimulationPartialObservationDeliveryV1 {
  const v = exact(
    value,
    [
      "schemaVersion",
      "requestId",
      "peerIndex",
      "logicalTime",
      "observations",
      "nextCursor",
      "deliveryDigest",
    ],
    "delivery",
  );
  if (
    v.schemaVersion !== 1 ||
    v.requestId !== pull.requestId ||
    v.peerIndex !== pull.peerIndex ||
    v.logicalTime !== pull.logicalTime ||
    !Array.isArray(v.observations) ||
    v.observations.length >
      SHARDED_SIMULATION_LIMITS_V1.maximumObservationsPerDelivery ||
    !(v.nextCursor === null || str(v.nextCursor)) ||
    !digestValue(v.deliveryDigest)
  )
    throw new TypeError("sharded_simulation_delivery_invalid");
  const { deliveryDigest: ignored, ...body } = v;
  if (
    digest("sharded-simulation-observation-delivery-v1", body) !==
    v.deliveryDigest
  )
    throw new TypeError("sharded_simulation_delivery_digest_invalid");
  return v as unknown as ShardedSimulationPartialObservationDeliveryV1;
}
function validateReceipt(
  value: unknown,
  request: {
    readonly actionId: string;
    readonly logicalTime: number;
    readonly executionEpoch: number;
    readonly fenceToken: string;
  },
): ShardedSimulationEffectReceiptV1 {
  const v = exact(
    value,
    [
      "schemaVersion",
      "actionId",
      "accepted",
      "logicalTime",
      "executionEpoch",
      "fenceToken",
      "effectDigest",
      "receiptDigest",
    ],
    "effect receipt",
  );
  if (
    v.schemaVersion !== 1 ||
    v.actionId !== request.actionId ||
    typeof v.accepted !== "boolean" ||
    v.logicalTime !== request.logicalTime ||
    v.executionEpoch !== request.executionEpoch ||
    v.fenceToken !== request.fenceToken ||
    !digestValue(v.effectDigest) ||
    !digestValue(v.receiptDigest)
  )
    throw new TypeError("sharded_simulation_receipt_invalid");
  const { receiptDigest: ignored, ...body } = v;
  if (digest("sharded-simulation-effect-receipt-v1", body) !== v.receiptDigest)
    throw new TypeError("sharded_simulation_receipt_digest_invalid");
  return v as unknown as ShardedSimulationEffectReceiptV1;
}
function validateAck(
  value: unknown,
  batchId: string,
  expectedDeliveredEventIds: readonly string[],
): void {
  const v = exact(
    value,
    [
      "schemaVersion",
      "batchId",
      "accepted",
      "duplicate",
      "deliveredEventIds",
      "ackDigest",
    ],
    "batch ack",
  );
  if (
    v.schemaVersion !== 1 ||
    v.batchId !== batchId ||
    v.accepted !== true ||
    typeof v.duplicate !== "boolean" ||
    !Array.isArray(v.deliveredEventIds) ||
    !v.deliveredEventIds.every(str) ||
    v.deliveredEventIds.length !== expectedDeliveredEventIds.length ||
    v.deliveredEventIds.some(
      (eventId, index) => eventId !== expectedDeliveredEventIds[index],
    ) ||
    !digestValue(v.ackDigest)
  )
    throw new TypeError("sharded_simulation_ack_invalid");
  const { ackDigest: ignored, ...body } = v;
  if (digest("sharded-simulation-cross-shard-ack-v1", body) !== v.ackDigest)
    throw new TypeError("sharded_simulation_ack_digest_invalid");
}
function exact(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`sharded_simulation_${label}_invalid`);
  const v = value as Record<string, unknown>,
    actual = Object.keys(v).sort(),
    expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, i) => key !== expected[i])
  )
    throw new TypeError(`sharded_simulation_${label}_keys_invalid`);
  return v;
}
function str(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= SHARDED_SIMULATION_LIMITS_V1.maximumIdentifierLength
  );
}
function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function digestValue(value: unknown): value is PlanningDigestV1 {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value);
}
function episodeKey(sessionId: string, episodeId: string): string {
  return `${sessionId}\u0000${episodeId}`;
}
function fence(
  sessionId: string,
  episodeId: string,
  peerIndex: number,
  epoch: number,
): string {
  return `fence:${sessionId}:${episodeId}:${peerIndex}:${epoch}`;
}
function digest(domain: string, value: unknown): PlanningDigestV1 {
  return shardedSimulationDigestV1(domain, value);
}
function freeze<T>(value: T): T {
  return Object.freeze(value);
}
function nonEmpty(value: unknown, label: string): asserts value is string {
  if (!str(value)) throw new TypeError(`${label}_invalid`);
}
function nonNegative(value: unknown, label: string): asserts value is number {
  if (!integer(value)) throw new TypeError(`${label}_invalid`);
}
function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
