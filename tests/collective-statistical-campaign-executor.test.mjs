import assert from "node:assert/strict";
import test from "node:test";

import {
  COLLECTIVE_EVALUATION_DIAGNOSTIC_CAMPAIGN_PROFILE_V1,
  claimCollectiveEvaluationCellV1,
  collectiveEvaluationCampaignProfileCellsV1,
  createCollectiveEvaluationCampaignExecutionV1,
  createCollectiveEvaluationCampaignRegistrationV1,
  startCollectiveEvaluationRunV1,
} from "../packages/collective-planning/dist/evaluation.js";
import {
  createMemoryCollectiveStatisticalCampaignExecutionStoreV1,
  createCollectiveStatisticalCampaignExecutionArtifactsV1,
  digestCollectiveStatisticalCampaignArtifactV1,
  reconstructCollectiveStatisticalCampaignExecutionV1,
  runCollectiveStatisticalCampaignShardV1,
} from "../packages/mesh-sim/dist/index.js";

const digest = (kind, value) =>
  digestCollectiveStatisticalCampaignArtifactV1(kind, value);

function registrationFixture() {
  const campaignId = "campaign:executor-diagnostic";
  const commitments = {
    sourceDigest: digest("source-lock", { schemaVersion: 1, source: "a" }),
    packageDigest: digest("package-lock", { schemaVersion: 1, package: "a" }),
    fixtureManifestDigest: digest("fixture", {
      schemaVersion: 1,
      fixture: "a",
    }),
    policyDigest: digest("policy", { schemaVersion: 1, policy: "a" }),
    environmentDigest: digest("environment", {
      schemaVersion: 1,
      environment: "a",
    }),
    observationPolicyDigest: digest("observation-policy", {
      schemaVersion: 1,
      observation: "a",
    }),
    monitorDigest: digest("monitor", { schemaVersion: 1, monitor: "a" }),
    hiddenCanaryDigest: digest("hidden-canary", {
      schemaVersion: 1,
      canary: "a",
    }),
  };
  return createCollectiveEvaluationCampaignRegistrationV1({
    schemaVersion: 1,
    campaignId,
    profile: COLLECTIVE_EVALUATION_DIAGNOSTIC_CAMPAIGN_PROFILE_V1,
    ...commitments,
    runners: ["adaptive_collective", "centralized_planner"],
    maximumInteractions: 1_600,
    cells: collectiveEvaluationCampaignProfileCellsV1(
      COLLECTIVE_EVALUATION_DIAGNOSTIC_CAMPAIGN_PROFILE_V1,
      campaignId,
    ).map((cell) => ({
      schemaVersion: 1,
      ...cell,
      maximumInteractions: cell.peerCount === 50 ? 1_000 : 1_600,
      scaleConfigurationDigest: digest("registration", {
        kind: "scale",
        cellId: cell.cellId,
      }),
      adaptiveDefinitionDigest: digest("registration", {
        kind: "adaptive",
        cellId: cell.cellId,
      }),
      centralizedDefinitionDigest: digest("registration", {
        kind: "centralized",
        cellId: cell.cellId,
      }),
      faultPlanDigest: digest("registration", {
        kind: "fault",
        cellId: cell.cellId,
      }),
      faultMatrixBindingDigest: digest("registration", {
        kind: "matrix",
        cellId: cell.cellId,
      }),
    })),
  });
}

const output = (runner, status = "passed", marker = "candidate") => ({
  schemaVersion: 1,
  status,
  reasonCode: status === "failed" ? "runner_failed" : null,
  outcome: { committed: status === "passed", marker, runner },
  traceRecords: [{ sequence: 1, runner }],
  ledgerRecords: [{ interactions: 1, runner }],
  observations: [{ status, runner }],
});

function shardInput(registration, store, index, execute, now = () => 100) {
  return {
    schemaVersion: 1,
    registration,
    executionId: "execution:diagnostic-v1",
    workerId: `worker:shard-${index}`,
    shard: { schemaVersion: 1, index, count: 2 },
    leaseDurationMs: 60_000,
    maximumCells: 8,
    store,
    now,
    execute,
  };
}

test("runs disjoint shards and resumes every immutable slot without re-execution", async () => {
  const registration = registrationFixture();
  const store = createMemoryCollectiveStatisticalCampaignExecutionStoreV1(
    () => 100,
  );
  const calls = [];
  const execute = async (context) => {
    calls.push(context.runKey);
    return output(context.runner);
  };
  const first = await runCollectiveStatisticalCampaignShardV1(
    shardInput(registration, store, 0, execute),
  );
  assert.equal(first.selectedCellCount, 8);
  assert.equal(first.executedSlotCount, 32);
  assert.equal(first.resumedSlotCount, 0);

  const resumed = await runCollectiveStatisticalCampaignShardV1(
    shardInput(registration, store, 0, execute),
  );
  assert.equal(resumed.executedSlotCount, 0);
  assert.equal(resumed.resumedSlotCount, 32);

  const second = await runCollectiveStatisticalCampaignShardV1(
    shardInput(registration, store, 1, execute),
  );
  assert.equal(second.executedSlotCount, 32);
  assert.equal(calls.length, 64);
  assert.equal(new Set(calls).size, 64);

  const reconstructed = reconstructCollectiveStatisticalCampaignExecutionV1({
    schemaVersion: 1,
    registration,
    executionId: "execution:diagnostic-v1",
    executions: [...resumed.executions, ...second.executions],
  });
  assert.equal(reconstructed.status, "completed");
  assert.equal(reconstructed.cells.length, 16);
  assert.ok(reconstructed.cells.every((cell) => cell.runs.length === 4));

  const completeExecutions = [...resumed.executions, ...second.executions];
  assert.throws(
    () =>
      reconstructCollectiveStatisticalCampaignExecutionV1({
        schemaVersion: 1,
        registration,
        executionId: "execution:diagnostic-v1",
        executions: [
          completeExecutions[0],
          completeExecutions[0],
          ...completeExecutions.slice(2),
        ],
      }),
    /reconstruction_duplicate_slot/u,
  );
  assert.throws(
    () =>
      reconstructCollectiveStatisticalCampaignExecutionV1({
        schemaVersion: 1,
        registration,
        executionId: "execution:diagnostic-v1",
        executions: [
          { ...completeExecutions[0], executionId: "execution:foreign" },
          ...completeExecutions.slice(1),
        ],
      }),
    /stored_execution_scope_invalid/u,
  );
  assert.throws(
    () =>
      reconstructCollectiveStatisticalCampaignExecutionV1({
        schemaVersion: 1,
        registration,
        executionId: "execution:diagnostic-v1",
        executions: [
          { ...completeExecutions[0], runKey: "run:foreign" },
          ...completeExecutions.slice(1),
        ],
      }),
    /stored_execution_scope_invalid/u,
  );
});

test("parallel shards retry a forced shared-state CAS conflict without duplicate slots", async () => {
  const registration = registrationFixture();
  const memory = createMemoryCollectiveStatisticalCampaignExecutionStoreV1();
  const initial = createCollectiveEvaluationCampaignExecutionV1({
    schemaVersion: 1,
    executionId: "execution:diagnostic-v1",
    registration,
  });
  assert.equal(
    await memory.compareAndSwapExecutionStateV1({
      executionId: initial.executionId,
      expectedExecutionDigest: null,
      state: initial,
    }),
    "committed",
  );
  let arrivals = 0;
  let releaseBarrier;
  const barrier = new Promise((resolve) => {
    releaseBarrier = resolve;
  });
  const store = {
    schemaVersion: 1,
    readExecutionStateV1: memory.readExecutionStateV1,
    readExecutionsV1: memory.readExecutionsV1,
    commitExecutionV1: memory.commitExecutionV1,
    async compareAndSwapExecutionStateV1(input) {
      if (
        input.expectedExecutionDigest === initial.executionDigest &&
        arrivals < 2
      ) {
        arrivals += 1;
        if (arrivals === 2) releaseBarrier();
        await barrier;
      }
      return memory.compareAndSwapExecutionStateV1(input);
    },
  };
  const calls = [];
  const execute = async (context) => {
    calls.push(context.runKey);
    return output(context.runner);
  };
  const [left, right] = await Promise.all([
    runCollectiveStatisticalCampaignShardV1(
      shardInput(registration, store, 0, execute),
    ),
    runCollectiveStatisticalCampaignShardV1(
      shardInput(registration, store, 1, execute),
    ),
  ]);
  assert.equal(arrivals, 2);
  assert.equal(left.executions.length + right.executions.length, 64);
  assert.equal(calls.length, 64);
  assert.equal(new Set(calls).size, 64);
  assert.equal(
    new Set(
      [...left.executions, ...right.executions].map((value) => value.runKey),
    ).size,
    64,
  );
});

test("concurrent duplicate worker shards never execute a run twice", async () => {
  const registration = registrationFixture();
  const memory = createMemoryCollectiveStatisticalCampaignExecutionStoreV1();
  const initial = createCollectiveEvaluationCampaignExecutionV1({
    schemaVersion: 1,
    executionId: "execution:diagnostic-v1",
    registration,
  });
  await memory.compareAndSwapExecutionStateV1({
    executionId: initial.executionId,
    expectedExecutionDigest: null,
    state: initial,
  });
  let arrivals = 0;
  let releaseBarrier;
  const barrier = new Promise((resolve) => {
    releaseBarrier = resolve;
  });
  const store = {
    schemaVersion: 1,
    readExecutionStateV1: memory.readExecutionStateV1,
    readExecutionsV1: memory.readExecutionsV1,
    commitExecutionV1: memory.commitExecutionV1,
    async compareAndSwapExecutionStateV1(input) {
      if (
        input.expectedExecutionDigest === initial.executionDigest &&
        arrivals < 2
      ) {
        arrivals += 1;
        if (arrivals === 2) releaseBarrier();
        await barrier;
      }
      return memory.compareAndSwapExecutionStateV1(input);
    },
  };
  const calls = [];
  const execute = async (context) => {
    calls.push(context.runKey);
    return output(context.runner);
  };
  const results = await Promise.allSettled([
    runCollectiveStatisticalCampaignShardV1(
      shardInput(registration, store, 0, execute),
    ),
    runCollectiveStatisticalCampaignShardV1(
      shardInput(registration, store, 0, execute),
    ),
  ]);
  assert.equal(arrivals, 2);
  assert.ok(results.some((result) => result.status === "fulfilled"));
  for (const result of results) {
    if (result.status === "rejected") assert.ok(result.reason instanceof Error);
  }
  assert.equal(calls.length, 32);
  assert.equal(new Set(calls).size, 32);
});

test("a forced CAS conflict rechecks now before retrying start and settlement", async () => {
  const registration = registrationFixture();
  const memory = createMemoryCollectiveStatisticalCampaignExecutionStoreV1();
  const targetCell = registration.cells[0];
  const otherCell = registration.cells[1];
  let currentTime = 1;
  let nowReadsAfterConflict = 0;
  let conflictInjected = false;
  let stopAfterSettlementRetry = false;
  const now = () => {
    if (conflictInjected) nowReadsAfterConflict += 1;
    return currentTime;
  };
  const store = {
    schemaVersion: 1,
    readExecutionStateV1: memory.readExecutionStateV1,
    readExecutionsV1: memory.readExecutionsV1,
    commitExecutionV1: memory.commitExecutionV1,
    async compareAndSwapExecutionStateV1(input) {
      const targetSlot = input.state.cells.find(
        (cell) => cell.cellId === targetCell.cellId,
      ).runs[0];
      if (!conflictInjected && targetSlot.status === "succeeded") {
        currentTime = 2_000;
        const current = await memory.readExecutionStateV1({
          executionId: input.executionId,
          registrationDigest: registration.registrationDigest,
        });
        const competing = claimCollectiveEvaluationCellV1(current, {
          executionId: input.executionId,
          expectedRevision: current.revision,
          cellId: otherCell.cellId,
          nowMs: currentTime,
          lease: {
            workerId: "worker:interference",
            leaseToken: "lease:interference",
            expiresAtMs: 3_000,
          },
        });
        assert.equal(
          await memory.compareAndSwapExecutionStateV1({
            executionId: input.executionId,
            expectedExecutionDigest: current.executionDigest,
            state: competing,
          }),
          "committed",
        );
        conflictInjected = true;
        stopAfterSettlementRetry = true;
        return "conflict";
      }
      if (stopAfterSettlementRetry && targetSlot.status === "succeeded") {
        throw new Error("stop-after-settlement-retry");
      }
      return memory.compareAndSwapExecutionStateV1(input);
    },
  };
  let calls = 0;
  await assert.rejects(
    () =>
      runCollectiveStatisticalCampaignShardV1({
        ...shardInput(
          registration,
          store,
          0,
          async (context) => {
            calls += 1;
            return output(context.runner);
          },
          now,
        ),
        shard: { schemaVersion: 1, index: 0, count: 16 },
        leaseDurationMs: 1_000,
        maximumCells: 1,
      }),
    /stop-after-settlement-retry/u,
  );
  assert.equal(calls, 1);
  assert.equal(conflictInjected, true);
  assert.ok(nowReadsAfterConflict > 0);
});

test("retains a failed slot while executing the other three slots in its cell", async () => {
  const registration = registrationFixture();
  const store = createMemoryCollectiveStatisticalCampaignExecutionStoreV1(
    () => 100,
  );
  let calls = 0;
  const result = await runCollectiveStatisticalCampaignShardV1({
    ...shardInput(registration, store, 0, async (context) => {
      calls += 1;
      const failed =
        context.cell.cellId === registration.cells[0].cellId &&
        context.runner === "adaptive_collective";
      return output(context.runner, failed ? "failed" : "passed");
    }),
    shard: { schemaVersion: 1, index: 0, count: 16 },
    maximumCells: 1,
  });
  assert.equal(calls, 4);
  assert.equal(result.executions.length, 4);
  assert.equal(result.failedSlotCount, 2);
  assert.equal(result.state.cells[0].status, "failed");
  assert.ok(
    result.state.cells[0].runs.every(
      (slot) => slot.status === "succeeded" || slot.status === "failed",
    ),
  );
});

test("legacy store reconciles a commit written immediately before lease expiry without re-execution", async () => {
  const registration = registrationFixture();
  const memory = createMemoryCollectiveStatisticalCampaignExecutionStoreV1();
  const store = {
    schemaVersion: 1,
    readExecutionStateV1: memory.readExecutionStateV1,
    compareAndSwapExecutionStateV1: memory.compareAndSwapExecutionStateV1,
    readExecutionsV1: memory.readExecutionsV1,
    commitExecutionV1: memory.commitExecutionV1,
  };
  let currentTime = 0;
  let calls = 0;
  const reconciled = await runCollectiveStatisticalCampaignShardV1({
    ...shardInput(
      registration,
      store,
      0,
      async (context) => {
        calls += 1;
        currentTime = 2_000;
        return output(context.runner);
      },
      () => currentTime,
    ),
    shard: { schemaVersion: 1, index: 0, count: 16 },
    leaseDurationMs: 1_000,
    maximumCells: 1,
  });
  assert.equal(reconciled.executedSlotCount, 4);
  assert.equal(reconciled.resumedSlotCount, 0);
  assert.equal(calls, 4);
  currentTime = 3_000;
  const resumed = await runCollectiveStatisticalCampaignShardV1({
    ...shardInput(
      registration,
      store,
      0,
      async () => {
        calls += 1;
        throw new Error("a committed slot must not execute again");
      },
      () => currentTime,
    ),
    shard: { schemaVersion: 1, index: 0, count: 16 },
    leaseDurationMs: 1_000,
    maximumCells: 1,
  });
  assert.equal(resumed.executedSlotCount, 0);
  assert.equal(resumed.resumedSlotCount, 4);
  assert.equal(calls, 4);
});

test("reads the canonical durable artifact after a duplicate commit", async () => {
  const registration = registrationFixture();
  const memory = createMemoryCollectiveStatisticalCampaignExecutionStoreV1();
  let injected = false;
  const store = {
    schemaVersion: 1,
    readExecutionStateV1: memory.readExecutionStateV1,
    compareAndSwapExecutionStateV1: memory.compareAndSwapExecutionStateV1,
    readExecutionsV1: memory.readExecutionsV1,
    async commitExecutionV1(input) {
      if (!injected) {
        injected = true;
        const cell = registration.cells.find(
          (candidate) => candidate.cellId === input.execution.cellId,
        );
        assert.ok(cell);
        const canonical =
          createCollectiveStatisticalCampaignExecutionArtifactsV1({
            schemaVersion: 1,
            executionId: input.execution.executionId,
            runKey: input.runKey,
            registrationDigest: registration.registrationDigest,
            cell,
            runner: input.execution.runner,
            attempt: input.execution.attempt,
            output: output(input.execution.runner, "failed", "canonical"),
          });
        assert.equal(
          await memory.commitExecutionV1({
            runKey: input.runKey,
            execution: canonical,
          }),
          "committed",
        );
        return "duplicate";
      }
      return memory.commitExecutionV1(input);
    },
  };
  let calls = 0;
  const result = await runCollectiveStatisticalCampaignShardV1({
    ...shardInput(registration, store, 0, async (context) => {
      calls += 1;
      return output(context.runner, "passed", "candidate");
    }),
    shard: { schemaVersion: 1, index: 0, count: 16 },
    maximumCells: 1,
  });
  assert.equal(calls, 4);
  assert.equal(result.executedSlotCount, 3);
  assert.equal(result.resumedSlotCount, 1);
  assert.equal(result.failedSlotCount, 1);
  assert.equal(result.executions[0].sample.status, "failed");
});

test("fenced memory commits reject superseded and exact-expiry workers before duplicate detection", async () => {
  const registration = registrationFixture();
  const executionId = "execution:fenced-memory";
  let currentTime = 0;
  const store = createMemoryCollectiveStatisticalCampaignExecutionStoreV1(
    () => currentTime,
  );
  const initial = createCollectiveEvaluationCampaignExecutionV1({
    schemaVersion: 1,
    executionId,
    registration,
  });
  assert.equal(
    await store.compareAndSwapExecutionStateV1({
      executionId,
      expectedExecutionDigest: null,
      state: initial,
    }),
    "committed",
  );
  const cell = registration.cells[0];
  const claimedByA = claimCollectiveEvaluationCellV1(initial, {
    executionId,
    expectedRevision: initial.revision,
    cellId: cell.cellId,
    nowMs: 0,
    lease: {
      workerId: "worker:a",
      leaseToken: "lease:a",
      expiresAtMs: 1_000,
    },
  });
  assert.equal(
    await store.compareAndSwapExecutionStateV1({
      executionId,
      expectedExecutionDigest: initial.executionDigest,
      state: claimedByA,
    }),
    "committed",
  );
  const fenceA = claimedByA.cells[0].lease;
  assert.ok(fenceA);

  currentTime = 1_000;
  const claimedByB = claimCollectiveEvaluationCellV1(claimedByA, {
    executionId,
    expectedRevision: claimedByA.revision,
    cellId: cell.cellId,
    nowMs: currentTime,
    lease: {
      workerId: "worker:b",
      leaseToken: "lease:b",
      expiresAtMs: 2_000,
    },
  });
  const fenceB = claimedByB.cells[0].lease;
  assert.ok(fenceB);
  const runningByB = startCollectiveEvaluationRunV1(claimedByB, {
    executionId,
    expectedRevision: claimedByB.revision,
    cellId: cell.cellId,
    runner: "adaptive_collective",
    attempt: "first",
    nowMs: currentTime,
    fence: fenceB,
  });
  assert.equal(
    await store.compareAndSwapExecutionStateV1({
      executionId,
      expectedExecutionDigest: claimedByA.executionDigest,
      state: runningByB,
    }),
    "committed",
  );
  const runKey = runningByB.cells[0].runs.find(
    (slot) => slot.runner === "adaptive_collective" && slot.attempt === "first",
  ).runKey;
  const execution = createCollectiveStatisticalCampaignExecutionArtifactsV1({
    schemaVersion: 1,
    executionId,
    runKey,
    registrationDigest: registration.registrationDigest,
    cell,
    runner: "adaptive_collective",
    attempt: "first",
    output: output("adaptive_collective"),
  });
  const commit = (fence) =>
    store.commitExecutionWithFenceV1({
      executionId,
      registrationDigest: registration.registrationDigest,
      cellId: cell.cellId,
      runKey,
      fence,
      execution,
    });

  const legacySeeded =
    createMemoryCollectiveStatisticalCampaignExecutionStoreV1(
      () => currentTime,
    );
  assert.equal(
    await legacySeeded.compareAndSwapExecutionStateV1({
      executionId,
      expectedExecutionDigest: null,
      state: runningByB,
    }),
    "committed",
  );
  assert.equal(
    await legacySeeded.commitExecutionV1({ runKey, execution }),
    "committed",
  );
  await assert.rejects(
    legacySeeded.readExecutionWithFenceV1({
      executionId,
      registrationDigest: registration.registrationDigest,
      cellId: cell.cellId,
      runKey,
      fence: fenceB,
    }),
    /commit_provenance_invalid/u,
  );

  currentTime = 1_500;
  assert.equal(await commit(fenceA), "stale_fence");
  assert.deepEqual(await store.readExecutionsV1([runKey]), [
    { runKey, execution: null },
  ]);
  for (const fence of [
    { ...fenceB, workerId: "worker:wrong" },
    { ...fenceB, leaseToken: "lease:wrong" },
    { ...fenceB, generation: fenceB.generation + 1 },
  ])
    assert.equal(await commit(fence), "stale_fence");
  assert.equal(await commit(fenceB), "committed");
  // The stale check is deliberately before identical-byte idempotency.
  assert.equal(await commit(fenceA), "stale_fence");
  assert.deepEqual(await store.readExecutionsV1([runKey]), [
    { runKey, execution },
  ]);
  currentTime = fenceB.expiresAtMs;
  assert.equal(await commit(fenceB), "stale_fence");
});

test("executor never falls back to the legacy commit after a fenced rejection", async () => {
  const registration = registrationFixture();
  const memory = createMemoryCollectiveStatisticalCampaignExecutionStoreV1(
    () => 100,
  );
  let fencedCalls = 0;
  let legacyCalls = 0;
  const store = {
    schemaVersion: 1,
    readExecutionStateV1: memory.readExecutionStateV1,
    compareAndSwapExecutionStateV1: memory.compareAndSwapExecutionStateV1,
    readExecutionsV1: memory.readExecutionsV1,
    async commitExecutionV1(input) {
      legacyCalls += 1;
      return memory.commitExecutionV1(input);
    },
    async commitExecutionWithFenceV1() {
      fencedCalls += 1;
      return "stale_fence";
    },
  };
  await assert.rejects(
    runCollectiveStatisticalCampaignShardV1({
      ...shardInput(registration, store, 0, (context) =>
        output(context.runner),
      ),
      shard: { schemaVersion: 1, index: 0, count: 16 },
      maximumCells: 1,
    }),
    /execution_commit_stale_fence/u,
  );
  assert.equal(fencedCalls, 1);
  assert.equal(legacyCalls, 0);
});
