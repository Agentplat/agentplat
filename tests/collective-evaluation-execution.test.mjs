import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { digestPlanningJsonV1 } from "../packages/collective-planning/dist/canonical.js";

import {
  COLLECTIVE_EVALUATION_PREFLIGHT_CAMPAIGN_PROFILE_V1,
  claimCollectiveEvaluationCellV1,
  collectiveEvaluationCampaignProfileCellsV1,
  createCollectiveEvaluationCampaignExecutionV1,
  createCollectiveEvaluationCampaignRegistrationV1,
  finalizeCollectiveEvaluationCampaignExecutionV1,
  materializeCollectiveEvaluationCampaignManifestV1,
  reconcileCollectiveEvaluationRunV1,
  releaseCollectiveEvaluationCellV1,
  settleCollectiveEvaluationRunV1,
  startCollectiveEvaluationRunV1,
  validateCollectiveEvaluationCampaignExecutionV1,
} from "../packages/collective-planning/dist/evaluation.js";

const digest = (label) =>
  `sha256:${createHash("sha256").update(label).digest("hex")}`;

function registration() {
  const campaignId = "campaign:execution";
  return createCollectiveEvaluationCampaignRegistrationV1({
    schemaVersion: 1,
    campaignId,
    profile: COLLECTIVE_EVALUATION_PREFLIGHT_CAMPAIGN_PROFILE_V1,
    sourceDigest: digest("source"),
    packageDigest: digest("package"),
    fixtureManifestDigest: digest("fixture"),
    policyDigest: digest("policy"),
    environmentDigest: digest("environment"),
    observationPolicyDigest: digest("observation"),
    monitorDigest: digest("monitor"),
    hiddenCanaryDigest: digest("canary"),
    runners: ["adaptive_collective", "centralized_planner"],
    maximumInteractions: 1_000,
    cells: collectiveEvaluationCampaignProfileCellsV1(
      COLLECTIVE_EVALUATION_PREFLIGHT_CAMPAIGN_PROFILE_V1,
      campaignId,
    ).map((cell) => ({
      schemaVersion: 1,
      ...cell,
      maximumInteractions: 1_000,
      scaleConfigurationDigest: digest(`scale:${cell.cellId}`),
      adaptiveDefinitionDigest: digest(`adaptive:${cell.cellId}`),
      centralizedDefinitionDigest: digest(`centralized:${cell.cellId}`),
      faultPlanDigest: digest(`fault:${cell.cellId}`),
      faultMatrixBindingDigest: digest(`matrix:${cell.cellId}`),
    })),
  });
}

const lease = (token, expiresAtMs = 10_000) => ({
  workerId: "worker:one",
  leaseToken: token,
  expiresAtMs,
});
const fence = (leaseValue, generation = 1) => ({ ...leaseValue, generation });
const result = (cellId, runner, attempt) => ({
  resultDigest: digest(`result:${cellId}:${runner}:${attempt}`),
  traceDigest: digest(`trace:${cellId}:${runner}:${attempt}`),
  ledgerDigest: digest(`ledger:${cellId}:${runner}:${attempt}`),
  evidenceDigest: digest(`evidence:${cellId}:${runner}:${attempt}`),
  fairnessDigest: digest(`fairness:${cellId}`),
});
const reorderedResult = (value) => ({
  fairnessDigest: value.fairnessDigest,
  evidenceDigest: value.evidenceDigest,
  ledgerDigest: value.ledgerDigest,
  traceDigest: value.traceDigest,
  resultDigest: value.resultDigest,
});

function redigestExecutionState(state, change) {
  const { executionDigest: _ignored, ...body } = change(state);
  return {
    ...body,
    executionDigest: digestPlanningJsonV1(
      "evaluation-campaign-artifact-v1",
      body,
    ),
  };
}

test("execution retains the exact four slots, fences workers, and materializes only after completion", () => {
  const registered = registration();
  let state = createCollectiveEvaluationCampaignExecutionV1({
    schemaVersion: 1,
    executionId: "execution:one",
    registration: registered,
  });
  assert.equal(state.cells.length, 8);
  assert.ok(state.cells.every((cell) => cell.runs.length === 4));
  assert.equal(
    new Set(state.cells.flatMap((cell) => cell.runs.map((slot) => slot.runKey)))
      .size,
    32,
  );

  for (const registeredCell of registered.cells) {
    const activeLease = lease(`lease:${registeredCell.cellId}`);
    state = claimCollectiveEvaluationCellV1(state, {
      executionId: state.executionId,
      expectedRevision: state.revision,
      cellId: registeredCell.cellId,
      nowMs: 1,
      lease: activeLease,
    });
    for (const [slotIndex, slot] of state.cells
      .find((cell) => cell.cellId === registeredCell.cellId)
      .runs.entries()) {
      state = startCollectiveEvaluationRunV1(state, {
        executionId: state.executionId,
        expectedRevision: state.revision,
        cellId: registeredCell.cellId,
        runner: slot.runner,
        attempt: slot.attempt,
        nowMs: 2,
        fence: fence(activeLease),
      });
      const command = {
        executionId: state.executionId,
        expectedRevision: state.revision,
        cellId: registeredCell.cellId,
        runner: slot.runner,
        attempt: slot.attempt,
        nowMs: 3,
        fence: fence(activeLease),
        result: result(registeredCell.cellId, slot.runner, slot.attempt),
        reasonCode: null,
      };
      const settled = settleCollectiveEvaluationRunV1(state, command);
      assert.equal(settled.status, "committed");
      state = settled.state;
      if (slotIndex === 0) {
        assert.equal(
          settleCollectiveEvaluationRunV1(state, command).status,
          "duplicate",
        );
      }
    }
  }
  const manifest = materializeCollectiveEvaluationCampaignManifestV1(
    registered,
    state,
  );
  assert.ok(manifest.entries.every((entry) => entry.status === "success"));
  state = finalizeCollectiveEvaluationCampaignExecutionV1(
    state,
    registered,
    state.revision,
  );
  assert.equal(state.status, "completed");
  assert.equal(state.manifest?.manifestDigest, manifest.manifestDigest);
});

test("expired non-running leases are reclaimed with a new generation and stale fences fail", () => {
  const registered = registration();
  let state = createCollectiveEvaluationCampaignExecutionV1({
    schemaVersion: 1,
    executionId: "execution:reclaim",
    registration: registered,
  });
  const cellId = state.cells[0].cellId;
  const oldLease = lease("lease:old", 10);
  state = claimCollectiveEvaluationCellV1(state, {
    executionId: state.executionId,
    expectedRevision: state.revision,
    cellId,
    nowMs: 1,
    lease: oldLease,
  });
  const nextLease = lease("lease:new", 30);
  state = claimCollectiveEvaluationCellV1(state, {
    executionId: state.executionId,
    expectedRevision: state.revision,
    cellId,
    nowMs: 11,
    lease: nextLease,
  });
  assert.equal(state.cells[0].lease?.generation, 2);
  assert.throws(
    () =>
      startCollectiveEvaluationRunV1(state, {
        executionId: state.executionId,
        expectedRevision: state.revision,
        cellId,
        runner: "adaptive_collective",
        attempt: "first",
        nowMs: 12,
        fence: fence(oldLease),
      }),
    /stale/,
  );
  state = startCollectiveEvaluationRunV1(state, {
    executionId: state.executionId,
    expectedRevision: state.revision,
    cellId,
    runner: "adaptive_collective",
    attempt: "first",
    nowMs: 12,
    fence: fence(nextLease, 2),
  });
  assert.throws(
    () =>
      claimCollectiveEvaluationCellV1(state, {
        executionId: state.executionId,
        expectedRevision: state.revision,
        cellId,
        nowMs: 31,
        lease: lease("lease:third", 40),
      }),
    /requires reconciliation/,
  );
});

test("a failed slot does not discard the other three scheduled samples", () => {
  const registered = registration();
  let state = createCollectiveEvaluationCampaignExecutionV1({
    schemaVersion: 1,
    executionId: "execution:failure",
    registration: registered,
  });
  const cellId = state.cells[0].cellId;
  const activeLease = lease("lease:failure");
  state = claimCollectiveEvaluationCellV1(state, {
    executionId: state.executionId,
    expectedRevision: state.revision,
    cellId,
    nowMs: 1,
    lease: activeLease,
  });
  for (const [index, slot] of state.cells[0].runs.entries()) {
    state = startCollectiveEvaluationRunV1(state, {
      executionId: state.executionId,
      expectedRevision: state.revision,
      cellId,
      runner: slot.runner,
      attempt: slot.attempt,
      nowMs: 2,
      fence: fence(activeLease),
    });
    const settled = settleCollectiveEvaluationRunV1(state, {
      executionId: state.executionId,
      expectedRevision: state.revision,
      cellId,
      runner: slot.runner,
      attempt: slot.attempt,
      nowMs: 3,
      fence: fence(activeLease),
      result: index === 0 ? null : result(cellId, slot.runner, slot.attempt),
      reasonCode: index === 0 ? "runner_unavailable" : null,
    });
    state = settled.state;
  }
  assert.equal(state.cells[0].status, "failed");
  assert.deepEqual(
    state.cells[0].runs.map((slot) => slot.status),
    ["failed", "succeeded", "succeeded", "succeeded"],
  );
});

test("release refuses a running slot and a later claim cannot revive its fence", () => {
  const registered = registration();
  let state = createCollectiveEvaluationCampaignExecutionV1({
    schemaVersion: 1,
    executionId: "execution:release",
    registration: registered,
  });
  const cellId = state.cells[0].cellId;
  const activeLease = lease("lease:released", 100);
  state = claimCollectiveEvaluationCellV1(state, {
    executionId: state.executionId,
    expectedRevision: state.revision,
    cellId,
    nowMs: 1,
    lease: activeLease,
  });
  state = startCollectiveEvaluationRunV1(state, {
    executionId: state.executionId,
    expectedRevision: state.revision,
    cellId,
    runner: "adaptive_collective",
    attempt: "first",
    nowMs: 2,
    fence: fence(activeLease),
  });
  assert.throws(
    () =>
      releaseCollectiveEvaluationCellV1(state, {
        executionId: state.executionId,
        expectedRevision: state.revision,
        cellId,
        nowMs: 3,
        fence: fence(activeLease),
      }),
    /requires settlement or reconciliation/,
  );

  let released = createCollectiveEvaluationCampaignExecutionV1({
    schemaVersion: 1,
    executionId: "execution:released-fence",
    registration: registered,
  });
  const releasedCellId = released.cells[0].cellId;
  released = claimCollectiveEvaluationCellV1(released, {
    executionId: released.executionId,
    expectedRevision: released.revision,
    cellId: releasedCellId,
    nowMs: 1,
    lease: activeLease,
  });
  released = releaseCollectiveEvaluationCellV1(released, {
    executionId: released.executionId,
    expectedRevision: released.revision,
    cellId: releasedCellId,
    nowMs: 2,
    fence: fence(activeLease),
  });
  released = claimCollectiveEvaluationCellV1(released, {
    executionId: released.executionId,
    expectedRevision: released.revision,
    cellId: releasedCellId,
    nowMs: 3,
    // Reusing input values must still advance the durable generation.
    lease: activeLease,
  });
  assert.equal(released.cells[0].lease?.generation, 2);
  assert.throws(
    () =>
      startCollectiveEvaluationRunV1(released, {
        executionId: released.executionId,
        expectedRevision: released.revision,
        cellId: releasedCellId,
        runner: "adaptive_collective",
        attempt: "first",
        nowMs: 4,
        fence: fence(activeLease),
      }),
    /stale/,
  );
});

test("terminal settlement duplicates require their original revision and fence", () => {
  const registered = registration();
  let state = createCollectiveEvaluationCampaignExecutionV1({
    schemaVersion: 1,
    executionId: "execution:settlement-fence",
    registration: registered,
  });
  const cellId = state.cells[0].cellId;
  const activeLease = lease("lease:settlement");
  state = claimCollectiveEvaluationCellV1(state, {
    executionId: state.executionId,
    expectedRevision: state.revision,
    cellId,
    nowMs: 1,
    lease: activeLease,
  });
  state = startCollectiveEvaluationRunV1(state, {
    executionId: state.executionId,
    expectedRevision: state.revision,
    cellId,
    runner: "adaptive_collective",
    attempt: "first",
    nowMs: 2,
    fence: fence(activeLease),
  });
  const command = {
    executionId: state.executionId,
    expectedRevision: state.revision,
    cellId,
    runner: "adaptive_collective",
    attempt: "first",
    nowMs: 3,
    fence: fence(activeLease),
    result: result(cellId, "adaptive_collective", "first"),
    reasonCode: null,
  };
  state = settleCollectiveEvaluationRunV1(state, command).state;
  assert.equal(
    settleCollectiveEvaluationRunV1(state, command).status,
    "duplicate",
  );
  assert.equal(
    settleCollectiveEvaluationRunV1(state, {
      ...command,
      result: reorderedResult(command.result),
    }).status,
    "duplicate",
  );
  assert.throws(
    () =>
      settleCollectiveEvaluationRunV1(state, {
        ...command,
        expectedRevision: state.revision,
      }),
    /terminal settlement revision is stale/,
  );
  assert.throws(
    () =>
      settleCollectiveEvaluationRunV1(state, {
        ...command,
        fence: fence(lease("lease:other")),
      }),
    /terminal settlement fence is stale/,
  );
});

test("reconciliation settles an expired running slot without redispatch and is idempotent", () => {
  const registered = registration();
  let state = createCollectiveEvaluationCampaignExecutionV1({
    schemaVersion: 1,
    executionId: "execution:reconcile",
    registration: registered,
  });
  const cellId = state.cells[0].cellId;
  const activeLease = lease("lease:reconcile", 10);
  state = claimCollectiveEvaluationCellV1(state, {
    executionId: state.executionId,
    expectedRevision: state.revision,
    cellId,
    nowMs: 1,
    lease: activeLease,
  });
  state = startCollectiveEvaluationRunV1(state, {
    executionId: state.executionId,
    expectedRevision: state.revision,
    cellId,
    runner: "adaptive_collective",
    attempt: "first",
    nowMs: 2,
    fence: fence(activeLease),
  });
  const before = state;
  const command = {
    executionId: state.executionId,
    expectedRevision: state.revision,
    cellId,
    runner: "adaptive_collective",
    attempt: "first",
    runKey: state.cells[0].runs[0].runKey,
    nowMs: 10,
    result: result(cellId, "adaptive_collective", "first"),
    reasonCode: null,
  };
  const reconciled = reconcileCollectiveEvaluationRunV1(state, command);
  assert.equal(reconciled.status, "committed");
  state = reconciled.state;
  assert.ok(Object.isFrozen(before));
  assert.equal(before.cells[0].runs[0].status, "running");
  assert.equal(state.cells[0].runs[0].status, "succeeded");
  assert.equal(state.cells[0].runs[0].dispatchAttempts, 1);
  const duplicate = reconcileCollectiveEvaluationRunV1(state, command);
  assert.equal(duplicate.status, "duplicate");
  assert.equal(duplicate.state, state);
  assert.equal(
    reconcileCollectiveEvaluationRunV1(state, {
      ...command,
      result: reorderedResult(command.result),
    }).status,
    "duplicate",
  );
});

test("public execution validation rejects redigested inconsistent states", () => {
  const registered = registration();
  const state = createCollectiveEvaluationCampaignExecutionV1({
    schemaVersion: 1,
    executionId: "execution:corrupt",
    registration: registered,
  });
  assert.throws(() =>
    validateCollectiveEvaluationCampaignExecutionV1(
      redigestExecutionState(state, (current) => ({
        ...current,
        status: "completed",
      })),
    ),
  );
  assert.throws(() =>
    validateCollectiveEvaluationCampaignExecutionV1(
      redigestExecutionState(state, (current) => ({
        ...current,
        cells: [
          { ...current.cells[0], status: "leased", lease: null },
          ...current.cells.slice(1),
        ],
      })),
    ),
  );
  assert.throws(() =>
    validateCollectiveEvaluationCampaignExecutionV1(
      redigestExecutionState(state, (current) => ({
        ...current,
        cells: [
          {
            ...current.cells[0],
            runs: [
              {
                ...current.cells[0].runs[0],
                status: "succeeded",
                result: null,
              },
              ...current.cells[0].runs.slice(1),
            ],
          },
          ...current.cells.slice(1),
        ],
      })),
    ),
  );
});
