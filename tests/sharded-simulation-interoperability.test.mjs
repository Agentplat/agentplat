import assert from "node:assert/strict";
import test from "node:test";

const simulation =
  await import("../packages/mesh-sim/dist/sharded-simulation.js");

test("logical runs are invariant across shard counts without global peer materialization", async () => {
  const profile = simulation.shardedSimulationScaleProfileV1(
    "peers-500-interactions-5000",
  );
  const one = await simulation.runShardedSimulationLogicalPeersV1({
    schemaVersion: 1,
    profile,
    shardCount: 1,
    interactionCount: 31,
    seed: 71,
  });
  const many = await simulation.runShardedSimulationLogicalPeersV1({
    schemaVersion: 1,
    profile,
    shardCount: 7,
    interactionCount: 31,
    seed: 71,
  });
  assert.equal(one.traceDigest, many.traceDigest);
  assert.equal(one.interactionCount, many.interactionCount);
  assert.equal("metricSample" in one, false);
});

test("cross-shard batches are sorted, idempotent, and transport-order independent", () => {
  const bridge = new simulation.InMemoryShardedSimulationBridgeV1();
  const session = bridge.createSession({
    environmentId: "test",
    logicalTime: 0,
  });
  const episode = bridge.startEpisode({
    session,
    episodeId: "episode",
    seed: 7,
    logicalTime: 0,
  });
  const profile = simulation.shardedSimulationScaleProfileV1(
    "peers-500-interactions-5000",
  );
  const assignments = simulation.createShardedSimulationAssignmentsV1({
    profile,
    shardCount: 2,
  });
  bridge.bindShardAssignments({ session, episode, profile, assignments });
  const payload = simulation.shardedSimulationDigestV1("test-payload-v1", {
    value: 1,
  });
  const messages = ["b", "a"].map((suffix) => ({
    schemaVersion: 1,
    eventId: `event-${suffix}`,
    sourcePeerIndex: 1,
    targetPeerIndex: 499,
    logicalTime: 1,
    payloadDigest: payload,
  }));
  const body = {
    batchId: "batch-1",
    sessionId: session.sessionId,
    episodeId: "episode",
    sourceShardId: assignments[0].shardId,
    targetShardId: assignments[1].shardId,
    logicalTime: 1,
    messages,
  };
  const batch =
    simulation.createShardedSimulationCrossShardMessageBatchV1(body);
  const first = bridge.deliverCrossShardBatch(batch);
  const repeated = bridge.deliverCrossShardBatch(batch);
  const rebatched = bridge.deliverCrossShardBatch(
    simulation.createShardedSimulationCrossShardMessageBatchV1({
      ...body,
      batchId: "batch-2",
    }),
  );
  assert.deepEqual(
    batch.messages.map((message) => message.eventId),
    ["event-a", "event-b"],
  );
  assert.deepEqual(first.deliveredEventIds, ["event-a", "event-b"]);
  assert.equal(repeated.duplicate, true);
  assert.deepEqual(repeated.deliveredEventIds, first.deliveredEventIds);
  assert.equal(rebatched.accepted, true);
  assert.equal(rebatched.duplicate, false);
  assert.deepEqual(rebatched.deliveredEventIds, first.deliveredEventIds);
});

test("faults are observed at driver boundaries, interaction ceilings fail closed, and runner output has no hidden state", async () => {
  const profile = simulation.shardedSimulationScaleProfileV1(
    "peers-500-interactions-5000",
  );
  const faultBody = {
    schemaVersion: 1,
    faultId: "fault-1",
    kind: "partition",
    logicalTime: 2,
    targetPeerIndexes: [1, 2],
  };
  const fault = {
    ...faultBody,
    faultDigest: simulation.shardedSimulationDigestV1(
      "sharded-simulation-fault-v1",
      faultBody,
    ),
  };
  const result = await simulation.runShardedSimulationLogicalPeersV1({
    schemaVersion: 1,
    profile,
    shardCount: 2,
    interactionCount: 3,
    seed: 8,
    faults: [fault],
  });
  assert.equal(result.faultObservations.length, 1);
  assert.equal(result.faultObservations[0].kind, "partition");
  assert.equal("hiddenState" in result, false);
  await assert.rejects(
    () =>
      simulation.runShardedSimulationLogicalPeersV1({
        schemaVersion: 1,
        profile,
        shardCount: 1,
        interactionCount: 5_001,
        seed: 8,
      }),
    /interaction_ceiling/u,
  );
});

test("durable anchor protects CAS checkpoints and permits an anchored restore", () => {
  const bridge = new simulation.InMemoryShardedSimulationBridgeV1();
  const session = bridge.createSession({
    environmentId: "test",
    logicalTime: 0,
  });
  const episode = bridge.startEpisode({
    session,
    episodeId: "episode",
    seed: 9,
    logicalTime: 0,
  });
  const profile = simulation.shardedSimulationScaleProfileV1(
    "peers-500-interactions-5000",
  );
  const assignments = simulation.createShardedSimulationAssignmentsV1({
    profile,
    shardCount: 1,
  });
  bridge.bindShardAssignments({ session, episode, profile, assignments });
  const checkpoint = bridge.checkpoint({
    session,
    episode,
    expectedRevision: 0,
    logicalTime: 2,
  });
  assert.throws(
    () =>
      bridge.restore({
        schemaVersion: 1,
        checkpoint: null,
        expectedAnchorDigest: "invalid",
      }),
    /restore_request_invalid/u,
  );
  assert.throws(
    () =>
      bridge.restore({
        schemaVersion: 1,
        checkpoint,
        expectedAnchorDigest: checkpoint.anchor.anchorDigest,
        unexpected: true,
      }),
    /restore_request_keys_invalid/u,
  );
  assert.throws(
    () =>
      bridge.restore({
        schemaVersion: 2,
        checkpoint,
        expectedAnchorDigest: checkpoint.anchor.anchorDigest,
      }),
    /restore_request_invalid/u,
  );
  const restored = bridge.restore({
    schemaVersion: 1,
    checkpoint,
    expectedAnchorDigest: checkpoint.anchor.anchorDigest,
  });
  assert.equal(restored.restoredRevision, 1);
  assert.throws(
    () =>
      bridge.checkpoint({
        session,
        episode,
        expectedRevision: 0,
        logicalTime: 3,
      }),
    /cas_conflict/u,
  );
});

test("rejects forged profiles and applies failure at the driver boundary", async () => {
  const profile = simulation.shardedSimulationScaleProfileV1(
    "peers-500-interactions-5000",
  );
  await assert.rejects(
    () =>
      simulation.runShardedSimulationLogicalPeersV1({
        schemaVersion: 1,
        profile: { ...profile, interactionCeiling: 1 },
        shardCount: 1,
        interactionCount: 1,
        seed: 1,
      }),
    /profile_invalid/u,
  );
  const peer = 9;
  const body = {
    schemaVersion: 1,
    faultId: "failure",
    kind: "failure",
    logicalTime: 1,
    targetPeerIndexes: [peer],
  };
  const fault = {
    ...body,
    faultDigest: simulation.shardedSimulationDigestV1(
      "sharded-simulation-fault-v1",
      body,
    ),
  };
  const result = await simulation.runShardedSimulationLogicalPeersV1({
    schemaVersion: 1,
    profile,
    shardCount: 2,
    interactionCount: 1,
    seed: peer,
    faults: [fault],
  });
  assert.equal(
    result.traceDigest ===
      simulation.shardedSimulationDigestV1(
        "sharded-simulation-logical-trace-v1",
        [],
      ),
    false,
  );
  assert.equal(result.processedInteractions, 1);
});

test("detects batch and event equivocation and uses evaluator-owned metrics", () => {
  const bridge = new simulation.InMemoryShardedSimulationBridgeV1();
  const session = bridge.createSession({
    environmentId: "test",
    logicalTime: 0,
  });
  const episode = bridge.startEpisode({
    session,
    episodeId: "metrics",
    seed: 1,
    logicalTime: 0,
  });
  const profile = simulation.shardedSimulationScaleProfileV1(
      "peers-500-interactions-5000",
    ),
    assignments = simulation.createShardedSimulationAssignmentsV1({
      profile,
      shardCount: 2,
    });
  bridge.bindShardAssignments({ session, episode, profile, assignments });
  const payload = simulation.shardedSimulationDigestV1("payload", { a: 1 });
  const message = {
    schemaVersion: 1,
    eventId: "event",
    sourcePeerIndex: 0,
    targetPeerIndex: 499,
    logicalTime: 1,
    payloadDigest: payload,
  };
  const body = {
    schemaVersion: 1,
    batchId: "batch",
    sessionId: session.sessionId,
    episodeId: episode.episodeId,
    sourceShardId: assignments[0].shardId,
    targetShardId: assignments[1].shardId,
    logicalTime: 1,
    messages: [message],
  };
  const batch =
    simulation.createShardedSimulationCrossShardMessageBatchV1(body);
  bridge.deliverCrossShardBatch(batch);
  const conflictingBody = {
    ...body,
    logicalTime: 2,
    messages: [{ ...message, logicalTime: 2 }],
  };
  assert.throws(
    () =>
      bridge.deliverCrossShardBatch(
        simulation.createShardedSimulationCrossShardMessageBatchV1(
          conflictingBody,
        ),
      ),
    /equivocation/u,
  );
  const changedMessage = {
    ...message,
    payloadDigest: simulation.shardedSimulationDigestV1("payload", { a: 2 }),
  };
  const changedBody = {
    ...body,
    batchId: "batch-2",
    messages: [changedMessage],
  };
  assert.throws(
    () =>
      bridge.deliverCrossShardBatch(
        simulation.createShardedSimulationCrossShardMessageBatchV1(changedBody),
      ),
    /event_equivocation/u,
  );
  assert.equal(
    bridge.finalizeMetrics({ session, episode, interactionCount: 2 })
      .interactionCount,
    2,
  );
});

test("bound bridge rejects episode, assignment, and action equivocation", () => {
  const bridge = new simulation.InMemoryShardedSimulationBridgeV1();
  const session = bridge.createSession({
    environmentId: "test",
    logicalTime: 0,
  });
  const episode = bridge.startEpisode({
    session,
    episodeId: "episode",
    seed: 1,
    logicalTime: 0,
  });
  assert.throws(
    () =>
      bridge.startEpisode({
        session,
        episodeId: "episode",
        seed: 2,
        logicalTime: 0,
      }),
    /episode_equivocation/u,
  );
  const profile = simulation.shardedSimulationScaleProfileV1(
    "peers-500-interactions-5000",
  );
  const assignments = simulation.createShardedSimulationAssignmentsV1({
    profile,
    shardCount: 2,
  });
  bridge.bindShardAssignments({ session, episode, profile, assignments });
  assert.throws(
    () =>
      bridge.bindShardAssignments({
        session,
        episode,
        profile,
        assignments: simulation.createShardedSimulationAssignmentsV1({
          profile,
          shardCount: 3,
        }),
      }),
    /assignments_equivocation/u,
  );
  const actionBody = {
    schemaVersion: 1,
    actionId: "action",
    sessionId: session.sessionId,
    episodeId: episode.episodeId,
    peerIndex: 0,
    logicalTime: 1,
    executionEpoch: 1,
    fenceToken: `fence:${session.sessionId}:${episode.episodeId}:0:1`,
    action: { type: "one" },
  };
  const action = {
    ...actionBody,
    actionDigest: simulation.shardedSimulationFencedActionDigestV1(actionBody),
  };
  bridge.requestEffect(action);
  const changed = { ...actionBody, action: { type: "two" } };
  assert.throws(
    () =>
      bridge.requestEffect({
        ...changed,
        actionDigest: simulation.shardedSimulationFencedActionDigestV1(changed),
      }),
    /action_equivocation/u,
  );
});

test("runner rejects incomplete accepted acknowledgements and skips failed targets", async () => {
  const profile = simulation.shardedSimulationScaleProfileV1(
    "peers-500-interactions-5000",
  );
  const base = new simulation.InMemoryShardedSimulationBridgeV1();
  const incompleteAckBridge = {
    ...Object.fromEntries(
      [
        "createSession",
        "startEpisode",
        "bindShardAssignments",
        "pullPartialObservation",
        "requestEffect",
      ].map((name) => [name, base[name].bind(base)]),
    ),
    deliverCrossShardBatch(batch) {
      const body = {
        schemaVersion: 1,
        batchId: batch.batchId,
        batchDigest: batch.batchDigest,
        accepted: true,
        duplicate: false,
        deliveredEventIds: [],
      };
      return {
        ...body,
        ackDigest: simulation.shardedSimulationDigestV1(
          "sharded-simulation-cross-shard-ack-v1",
          body,
        ),
      };
    },
    checkpoint: base.checkpoint.bind(base),
    restore: base.restore.bind(base),
  };
  await assert.rejects(
    () =>
      simulation.runShardedSimulationLogicalPeersV1({
        schemaVersion: 1,
        profile,
        shardCount: 2,
        interactionCount: 1,
        seed: 249,
        bridge: incompleteAckBridge,
      }),
    /ack_invalid/u,
  );
  let delivered = 0;
  const target = 250;
  const faultBody = {
    schemaVersion: 1,
    faultId: "target-failed",
    kind: "failure",
    logicalTime: 1,
    targetPeerIndexes: [target],
  };
  const result = await simulation.runShardedSimulationLogicalPeersV1({
    schemaVersion: 1,
    profile,
    shardCount: 2,
    interactionCount: 1,
    seed: 249,
    faults: [
      {
        ...faultBody,
        faultDigest: simulation.shardedSimulationDigestV1(
          "sharded-simulation-fault-v1",
          faultBody,
        ),
      },
    ],
    bridge: {
      ...Object.fromEntries(
        [
          "createSession",
          "startEpisode",
          "bindShardAssignments",
          "pullPartialObservation",
          "requestEffect",
        ].map((name) => [name, base[name].bind(base)]),
      ),
      deliverCrossShardBatch(batch) {
        delivered += 1;
        return base.deliverCrossShardBatch(batch);
      },
      checkpoint: base.checkpoint.bind(base),
      restore: base.restore.bind(base),
    },
  });
  assert.equal(result.processedInteractions, 1);
  assert.equal(delivered, 0);
});

test("misleading and conflicting observations select different bridge actions", async () => {
  const profile = simulation.shardedSimulationScaleProfileV1(
    "peers-500-interactions-5000",
  );
  const runWithFault = async (kind) => {
    const implementation = new simulation.InMemoryShardedSimulationBridgeV1();
    const actionTypes = [];
    const faultBody = {
      schemaVersion: 1,
      faultId: `fault-${kind}`,
      kind,
      logicalTime: 1,
      targetPeerIndexes: [0],
    };
    await simulation.runShardedSimulationLogicalPeersV1({
      schemaVersion: 1,
      profile,
      shardCount: 1,
      interactionCount: 1,
      seed: 0,
      faults: [
        {
          ...faultBody,
          faultDigest: simulation.shardedSimulationDigestV1(
            "sharded-simulation-fault-v1",
            faultBody,
          ),
        },
      ],
      bridge: {
        createSession: implementation.createSession.bind(implementation),
        startEpisode: implementation.startEpisode.bind(implementation),
        bindShardAssignments:
          implementation.bindShardAssignments.bind(implementation),
        pullPartialObservation:
          implementation.pullPartialObservation.bind(implementation),
        requestEffect(request) {
          actionTypes.push(request.action.type);
          return implementation.requestEffect(request);
        },
        deliverCrossShardBatch:
          implementation.deliverCrossShardBatch.bind(implementation),
        checkpoint: implementation.checkpoint.bind(implementation),
        restore: implementation.restore.bind(implementation),
      },
    });
    return actionTypes;
  };
  assert.deepEqual(await runWithFault("misleading-observation"), [
    "misleading-observation-mitigated-interaction",
  ]);
  assert.deepEqual(await runWithFault("conflicting-observation"), [
    "conflicting-observation-resolution",
  ]);
});

test("exported limits reject oversized identifiers and schedules", () => {
  const limits = simulation.SHARDED_SIMULATION_LIMITS_V1;
  const payload = simulation.shardedSimulationDigestV1("payload", {});
  assert.throws(
    () =>
      simulation.createShardedSimulationCrossShardMessageBatchV1({
        batchId: "x".repeat(limits.maximumIdentifierLength + 1),
        sessionId: "session",
        episodeId: "episode",
        sourceShardId: "shard-0",
        targetShardId: "shard-1",
        logicalTime: 1,
        messages: [
          {
            schemaVersion: 1,
            eventId: "event",
            sourcePeerIndex: 0,
            targetPeerIndex: 1,
            logicalTime: 1,
            payloadDigest: payload,
          },
        ],
      }),
    /batch_identifier_invalid/u,
  );
  assert.throws(
    () =>
      simulation.validateShardedSimulationFaultScheduleV1(
        Array.from({ length: limits.maximumFaults + 1 }),
      ),
    /fault_schedule_invalid/u,
  );
  const maximumTargetsPerFault = Array.from(
    { length: limits.maximumTargetsPerFault },
    (_, index) => index,
  );
  const fullFaultCount =
    limits.maximumTotalTargetsAcrossSchedule / limits.maximumTargetsPerFault;
  const fullFaults = Array.from({ length: fullFaultCount }, (_, index) => {
    const body = {
      schemaVersion: 1,
      faultId: `full-targets-${index}`,
      kind: "failure",
      logicalTime: index + 1,
      targetPeerIndexes: maximumTargetsPerFault,
    };
    return {
      ...body,
      faultDigest: simulation.shardedSimulationDigestV1(
        "sharded-simulation-fault-v1",
        body,
      ),
    };
  });
  const secondBody = {
    schemaVersion: 1,
    faultId: "one-more-target",
    kind: "failure",
    logicalTime: 2,
    targetPeerIndexes: [0],
  };
  assert.throws(
    () =>
      simulation.validateShardedSimulationFaultScheduleV1([
        ...fullFaults,
        {
          ...secondBody,
          faultDigest: simulation.shardedSimulationDigestV1(
            "sharded-simulation-fault-v1",
            secondBody,
          ),
        },
      ]),
    /fault_targets_invalid/u,
  );
});
