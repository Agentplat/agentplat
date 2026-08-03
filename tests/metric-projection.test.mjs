import assert from "node:assert/strict";
import test from "node:test";

import {
  createNormativeMetricProjectionV1,
  normativeMetricProjectionDigestV1,
  normativeProjectedEventIdsDigestV1,
  validateNormativeMetricProjectionV1,
} from "../packages/collective-planning/dist/evaluation.js";

const digest = (character) => `sha256:${character.repeat(64)}`;
const eventIds = [
  "event:first",
  "event:fault-scheduled",
  "event:fault-injected",
  "event:fault-observed",
  "event:disruption",
  "event:replan",
  "event:assignment-change",
  "event:recovery",
  "event:heal",
  "event:agreement",
  "event:decision-first",
  "event:decision-last",
  "event:terminal",
];

function fixture(overrides = {}) {
  const { projectedEventIdsDigest, ...projectionOverrides } = overrides;
  // Construct once with a temporary digest, then use the exported digest helper
  // indirectly through a minimal seed projection is intentionally impossible.
  // The event-id digest is deterministic and exposed by validation, so tests use
  // the canonical value captured from the public planning digest primitive.
  return {
    schemaVersion: 1,
    projectionOwner: "evaluator",
    evaluatorDigest: digest("1"),
    executionId: "execution:normative:test",
    runKey: "run:normative:test",
    attempt: "first",
    registrationDigest: digest("2"),
    cellId: "campaign:test:scale:500:stratum:benign:seed:0",
    seed: 0,
    runner: "adaptive_collective",
    executionStatus: "completed",
    validity: "valid",
    missionOutcome: "success",
    reasonCode: null,
    interactionTotal: 900,
    interactionCeiling: 5_000,
    eventBinding: {
      schemaVersion: 1,
      boundaryEvidenceDigest: digest("3"),
      traceDigest: digest("4"),
      traceRoot: digest("5"),
      monitorVerdictDigest: digest("6"),
      firstEventId: "event:first",
      lastEventId: "event:terminal",
      terminalEventId: "event:terminal",
      eventCount: 100,
      projectedEventIds: eventIds,
      projectedEventIdsDigest,
    },
    safety: {
      schemaVersion: 1,
      authorizationViolations: 0,
      planAuthorityViolations: 0,
      staleFenceViolations: 0,
      duplicateEffectViolations: 0,
      hiddenStateViolations: 0,
      globalMembershipViolations: 0,
      directAssignmentViolations: 0,
      directContractViolations: 0,
      syntheticLedgerViolations: 0,
      constantMetricViolations: 0,
      canaryLeakViolations: 0,
      evaluationIntegrityViolations: 0,
    },
    faults: {
      schemaVersion: 1,
      registeredFamilies: ["peer.crash"],
      events: [
        {
          schemaVersion: 1,
          family: "peer.crash",
          scheduleEventId: "event:fault-scheduled",
          injectionEventId: "event:fault-injected",
          observationEventId: "event:fault-observed",
        },
      ],
    },
    recovery: {
      schemaVersion: 1,
      disruptionEventId: "event:disruption",
      replanEventId: "event:replan",
      assignmentChangeEventId: "event:assignment-change",
      recoveryEventId: "event:recovery",
      interactionsToReplan: 12,
      interactionsToRecovery: 30,
    },
    convergence: {
      schemaVersion: 1,
      healOrQuiescenceEventId: "event:heal",
      agreementEventId: "event:agreement",
      healthyParticipantCount: 495,
      agreeingParticipantCount: 480,
      interactionsToAgreement: 40,
    },
    roleCoherence: {
      schemaVersion: 1,
      firstDecisionEventId: "event:decision-first",
      lastDecisionEventId: "event:decision-last",
      firstUnsafeEventId: null,
      decisionCount: 1_000,
      coherentDecisionCount: 1_000,
      usefulDecisionCount: 800,
      unsafeExecutableCount: 0,
    },
    ...projectionOverrides,
  };
}

test("binds evaluator-owned safety, fault, recovery, convergence and role metrics to trace events", async () => {
  const idsDigest = normativeProjectedEventIdsDigestV1(eventIds);
  const projection = createNormativeMetricProjectionV1(
    fixture({ projectedEventIdsDigest: idsDigest }),
  );
  assert.equal(
    validateNormativeMetricProjectionV1(projection).projectionDigest,
    projection.projectionDigest,
  );
  const { projectionDigest: _projectionDigest, ...projectionBody } = projection;
  assert.equal(
    normativeMetricProjectionDigestV1(projectionBody),
    projection.projectionDigest,
  );
  assert.equal(Object.isFrozen(projection.faults.events), true);

  assert.throws(
    () =>
      createNormativeMetricProjectionV1({
        ...fixture({ projectedEventIdsDigest: idsDigest }),
        recovery: {
          ...fixture({ projectedEventIdsDigest: idsDigest }).recovery,
          recoveryEventId: "event:not-bound",
        },
      }),
    /outside projected event binding/u,
  );
  assert.throws(
    () =>
      createNormativeMetricProjectionV1({
        ...fixture({ projectedEventIdsDigest: idsDigest }),
        interactionTotal: 5_001,
      }),
    /interactionTotal/u,
  );
  assert.throws(
    () =>
      createNormativeMetricProjectionV1({
        ...fixture({ projectedEventIdsDigest: idsDigest }),
        faults: {
          schemaVersion: 1,
          registeredFamilies: ["network.heal", "peer.crash"],
          events: fixture({ projectedEventIdsDigest: idsDigest }).faults.events,
        },
      }),
    /one-to-one/u,
  );
  assert.throws(
    () =>
      createNormativeMetricProjectionV1({
        ...fixture({ projectedEventIdsDigest: idsDigest }),
        faults: {
          schemaVersion: 1,
          registeredFamilies: ["peer.crash", "network.heal"],
          events: [
            fixture({ projectedEventIdsDigest: idsDigest }).faults.events[0],
            {
              ...fixture({ projectedEventIdsDigest: idsDigest }).faults
                .events[0],
              family: "network.heal",
            },
          ],
        },
      }),
    /canonical order/u,
  );
  assert.throws(
    () =>
      createNormativeMetricProjectionV1({
        ...fixture({ projectedEventIdsDigest: idsDigest }),
        attempt: "retry",
      }),
    /attempt/u,
  );
});

test("keeps infrastructure validity separate from terminal mission failure", async () => {
  const idsDigest = normativeProjectedEventIdsDigestV1(eventIds);
  const terminalFailure = createNormativeMetricProjectionV1({
    ...fixture({ projectedEventIdsDigest: idsDigest }),
    missionOutcome: "terminal_failure",
  });
  assert.equal(terminalFailure.validity, "valid");

  assert.throws(
    () =>
      createNormativeMetricProjectionV1({
        ...fixture({ projectedEventIdsDigest: idsDigest }),
        executionStatus: "infrastructure_invalid",
        validity: "valid",
        missionOutcome: "success",
      }),
    /non-completed execution/u,
  );
  assert.throws(
    () =>
      validateNormativeMetricProjectionV1({ ...terminalFailure, extra: true }),
    /invalid shape/u,
  );
});
