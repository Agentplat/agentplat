import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveConvergenceMetricsV1,
  createCollectiveClosedLoopReferenceRuntimeV1,
  createCollectiveClosedLoopReferenceScenarioV1,
  runAdaptiveCollectiveClosedLoopV1,
} from "@agentplat/mesh-sim";

const state = (character) => `sha256:${character.repeat(64)}`;
const event = (id, peer, digest, time = 1, extra = {}) => ({
  eventId: id,
  logicalTimeMs: time,
  peerId: peer,
  kind: "peer.decision.accepted",
  status: "accepted",
  reasonCode: null,
  accountingKind: "decision",
  accountingUnits: 1,
  stateDigestAfter: digest,
  traceChainDigest: state("a"),
  previousTraceChainDigest: null,
  faultBinding: null,
  ...extra,
});

test("agreement counts distinct peers and preserves missing final-round participants", () => {
  const metric = deriveConvergenceMetricsV1(
    [
      event("a1", "a", state("a")),
      event("b1", "b", state("b")),
      event("a2", "a", state("a"), 2),
      event("a3", "a", state("a"), 2),
      event("rejected", "c", state("a"), 2, { status: "rejected" }),
    ],
    "nominal",
  );
  assert.equal(metric.healthyParticipantCount, 2);
  assert.equal(metric.agreeingParticipantCount, 1);
  assert.equal(metric.agreementEventId, "a3");
  assert.equal(metric.interactionsToAgreement, 4);
});

test("recovery boundary belongs to the latest disruption and empty evidence stays empty", () => {
  const fault = (id, family, time) =>
    event(id, null, null, time, {
      kind: "fault.observed",
      faultBinding: { faultFamily: family },
    });
  const metric = deriveConvergenceMetricsV1(
    [
      fault("partition1", "network.partition", 1),
      fault("heal1", "network.heal", 2),
      event("old", "old-peer", state("a"), 3),
      fault("partition2", "network.partition", 4),
      fault("heal2", "network.heal", 5),
      event("a", "a", state("a"), 6),
      event("b", "b", state("b"), 6),
    ],
    "benign",
  );
  assert.equal(metric.healOrQuiescenceEventId, "heal2");
  assert.equal(metric.healthyParticipantCount, 2);
  assert.equal(metric.agreeingParticipantCount, 1);
  const empty = deriveConvergenceMetricsV1([], "nominal");
  assert.equal(empty.healthyParticipantCount, 0);
  assert.equal(empty.agreementEventId, null);
  assert.equal(empty.interactionsToAgreement, null);
});

test("diagnostic horizon is opt-in, bounded before effects, and retains actual local states", async () => {
  const create = async () =>
    createCollectiveClosedLoopReferenceScenarioV1({
      runner: "adaptive_collective",
      peerCount: 4,
      runtime: await createCollectiveClosedLoopReferenceRuntimeV1(4),
    });
  const ordinary = await runAdaptiveCollectiveClosedLoopV1(await create());
  assert.equal(
    ordinary.trace.events.filter((e) => e.kind === "role.decision.observed")
      .length,
    0,
  );
  const result = await runAdaptiveCollectiveClosedLoopV1({
    ...(await create()),
    roleObservationHorizon: 12,
  });
  const observed = result.trace.events.filter(
    (e) => e.kind === "role.decision.observed",
  );
  const initial = result.trace.events.filter(
    (e) => e.kind === "peer.decision.accepted",
  );
  assert.equal(observed.length + initial.length, 12);
  const actualStates = new Map(
    initial.map((e) => [e.peerId, e.stateDigestAfter]),
  );
  for (const observation of observed)
    assert.equal(
      observation.stateDigestAfter,
      actualStates.get(observation.peerId),
    );
  assert.equal(
    result.trace.events.filter((e) => e.kind === "environment.effect.committed")
      .length,
    1,
  );
  const invalid = await create();
  let prepared = false;
  await assert.rejects(
    runAdaptiveCollectiveClosedLoopV1({
      ...invalid,
      roleObservationHorizon: 1,
      prepareAction: (...args) => {
        prepared = true;
        return invalid.prepareAction(...args);
      },
    }),
    /role_horizon_invalid/,
  );
  assert.equal(prepared, false);
});
