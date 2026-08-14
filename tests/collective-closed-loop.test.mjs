import assert from "node:assert/strict";
import test from "node:test";

import {
  createCollectiveClosedLoopReferenceRuntimeV1,
  createCollectiveClosedLoopReferenceScenarioV1,
  replayAdaptiveCollectiveClosedLoopV1,
  replayCentralizedPlannerClosedLoopV1,
  runAdaptiveCollectiveClosedLoopV1,
  runCentralizedPlannerClosedLoopV1,
} from "@agentplat/mesh-sim";

const PEER_COUNT = 50;
// The reference mesh intentionally executes planning only for the owner and
// its 32 direct neighbors; the remaining registered peers are scale-model
// participants and do not emit local planning decisions in this scenario.
const ACTIVE_PLANNING_PEER_COUNT = 33;

function committedEffects(result) {
  return result.trace.events.filter(
    (event) => event.kind === "environment.effect.committed",
  );
}

function centralizedDirectives(result) {
  return result.trace.events.filter(
    (event) => event.kind === "runner.directive.delivered",
  );
}

function eventsOfKind(result, kind) {
  return result.trace.events.filter((event) => event.kind === kind);
}

function faultOrRecoveryEvents(result) {
  return result.trace.events.filter(
    (event) => /fault|recovery|takeover|renew/u.test(event.kind),
  );
}

function artifact(result, kind) {
  const value = result.run.publicArtifacts.find((item) => item.kind === kind);
  assert.ok(value, `missing public artifact ${kind}`);
  return value;
}

test("50-peer nominal adaptive and centralized closed loops commit the same public outcome", async () => {
  const runtime = await createCollectiveClosedLoopReferenceRuntimeV1(PEER_COUNT);
  const adaptiveInput = await createCollectiveClosedLoopReferenceScenarioV1({
    runner: "adaptive_collective",
    peerCount: PEER_COUNT,
    runtime,
  });
  const centralizedInput = await createCollectiveClosedLoopReferenceScenarioV1({
    runner: "centralized_planner",
    peerCount: PEER_COUNT,
    runtime,
  });

  const [adaptive, centralized] = await Promise.all([
    runAdaptiveCollectiveClosedLoopV1(adaptiveInput),
    runCentralizedPlannerClosedLoopV1(centralizedInput),
  ]);

  for (const result of [adaptive, centralized]) {
    assert.equal(result.run.stopReason, "plan_completed");
    assert.equal(result.action.receipt?.status, "committed");
    assert.ok(
      Date.parse(result.action.authorizedAt) >
        Date.parse(result.preEffect.checkpoint.envelope.sentAt),
    );
    assert.equal(result.finalized.result.recordType, "result");
    assert.equal(committedEffects(result).length, 1);
    assert.equal(result.trace.ledger.limitExceeded, false);
    assert.ok(result.trace.ledger.total <= 5_000);
    assert.equal(faultOrRecoveryEvents(result).length, 0);
  }

  assert.equal(centralizedDirectives(adaptive).length, 0);
  assert.equal(
    centralizedDirectives(centralized).length,
    ACTIVE_PLANNING_PEER_COUNT,
  );
  assert.equal(
    eventsOfKind(adaptive, "peer.decision.accepted").length,
    ACTIVE_PLANNING_PEER_COUNT,
  );
  assert.equal(eventsOfKind(centralized, "peer.decision.accepted").length, 0);
  assert.equal(eventsOfKind(adaptive, "planning.decision").length, 0);
  assert.equal(eventsOfKind(centralized, "planning.decision").length, 1);
  const adaptiveParticipation = artifact(
    adaptive,
    "closed-loop-mesh-participation",
  );
  const centralizedParticipation = artifact(
    centralized,
    "closed-loop-mesh-participation",
  );
  for (const participation of [adaptiveParticipation, centralizedParticipation]) {
    assert.equal(
      participation.discoveredPeerIds.length,
      ACTIVE_PLANNING_PEER_COUNT - 1,
    );
    assert.equal(
      new Set(participation.discoveredPeerIds).size,
      ACTIVE_PLANNING_PEER_COUNT - 1,
    );
    assert.equal(
      participation.offerRecipientPeerIds.length,
      ACTIVE_PLANNING_PEER_COUNT - 1,
    );
    assert.deepEqual(
      participation.bidderPeerIds,
      participation.offerRecipientPeerIds,
    );
  }
  assert.deepEqual(adaptiveParticipation, centralizedParticipation);
  assert.equal(
    adaptive.action.receipt?.outputDigest,
    centralized.action.receipt?.outputDigest,
  );
  // Permits and receipts are runner-bound evidence. Compare the published
  // mission outcome rather than treating those distinct control records as a
  // different outcome.
  assert.deepEqual(
    artifact(adaptive, "closed-loop-outcome-observations"),
    artifact(centralized, "closed-loop-outcome-observations"),
  );
  assert.equal(adaptive.finalized.result.recordType, "result");
  assert.equal(centralized.finalized.result.recordType, "result");

  assert.ok(adaptive.action.effectAttempt);
  assert.ok(adaptive.action.receipt);
  await assert.rejects(
    () =>
      adaptive.preEffect.finalizeAfterCommittedEffect({
        effectAttempt: adaptive.action.effectAttempt,
        effectReceipt: structuredClone(adaptive.action.receipt),
        resultDigest: adaptive.action.receipt.outputDigest,
        resultSummary: "forged receipt replay",
      }),
    /closed_loop_effect_receipt_untrusted/,
  );
  await assert.rejects(
    () =>
      adaptive.preEffect.finalizeAfterCommittedEffect({
        effectAttempt: adaptive.action.effectAttempt,
        effectReceipt: adaptive.action.receipt,
        resultDigest: adaptive.run.runDigest,
        resultSummary: "mismatched result digest",
      }),
    /closed_loop_effect_not_committed/,
  );
});

test("both 50-peer runners replay exactly with the same construction-bound runtime", async () => {
  const runtime = await createCollectiveClosedLoopReferenceRuntimeV1(PEER_COUNT);
  const makeAdaptive = () =>
    createCollectiveClosedLoopReferenceScenarioV1({
      runner: "adaptive_collective",
      peerCount: PEER_COUNT,
      runtime,
    });
  const makeCentralized = () =>
    createCollectiveClosedLoopReferenceScenarioV1({
      runner: "centralized_planner",
      peerCount: PEER_COUNT,
      runtime,
    });

  const adaptive = await replayAdaptiveCollectiveClosedLoopV1({
    schemaVersion: 1,
    createInput: makeAdaptive,
  });
  const centralized = await replayCentralizedPlannerClosedLoopV1({
    schemaVersion: 1,
    createInput: makeCentralized,
  });

  for (const replay of [adaptive, centralized]) {
    assert.equal(replay.matched, true);
    assert.equal(replay.first.run.runDigest, replay.replay.run.runDigest);
    assert.equal(replay.first.trace.traceDigest, replay.replay.trace.traceDigest);
    assert.equal(
      replay.first.evidence.evidenceDigest,
      replay.replay.evidence.evidenceDigest,
    );
  }
});

test("top-level direct assignment is rejected before effects and leaves zero commits", async () => {
  const input = await createCollectiveClosedLoopReferenceScenarioV1({
    runner: "adaptive_collective",
    peerCount: 3,
  });
  await assert.rejects(
    () => runAdaptiveCollectiveClosedLoopV1({ ...input, directAssignment: "peer:010" }),
    /closed_loop_execution_input|invalid shape/,
  );
  const evidence = input.evaluator.finalize();
  assert.equal(
    evidence.trace.events.filter((event) => event.kind === "environment.effect.committed").length,
    0,
  );
});

test("action wall time is runner-owned and cannot be injected by preparation", async () => {
  const input = await createCollectiveClosedLoopReferenceScenarioV1({
    runner: "adaptive_collective",
    peerCount: 3,
  });
  const originalPrepareAction = input.prepareAction;
  await assert.rejects(
    () =>
      runAdaptiveCollectiveClosedLoopV1({
        ...input,
        async prepareAction(context) {
          return {
            ...(await originalPrepareAction(context)),
            wallTime: "2026-08-01T00:00:00.000Z",
          };
        },
      }),
    /closed-loop prepared action has an invalid shape/,
  );
  const evidence = input.evaluator.finalize();
  assert.equal(committedEffects({ trace: evidence.trace }).length, 0);
});
