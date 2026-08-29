import assert from "node:assert/strict";
import test from "node:test";

import {
  AutonomyControllerV1,
  InMemoryAutonomyStoreV1,
  createAutonomyEvidenceWindowV1,
  createAutonomyPolicyV1,
  digestAutonomyJsonV1,
} from "../dist/index.js";

const at = "2026-08-28T12:00:00.000Z";

test("new segments start supervised and promotion advances one level per window", async () => {
  const { store, controller, policy } = await fixture();
  const insufficient = evidence(0, {
    coverageStatus: "insufficient",
    eligibleTaskRuns: 0,
    concludedOutcomes: 0,
    positive: 0,
    unresolvedTaskRuns: 0,
  });
  assert.equal(
    (await controller.evaluate(evaluation(insufficient, "action:a"))).level,
    "propose_only",
  );

  const levels = [];
  for (let sequence = 1; sequence <= 3; sequence += 1) {
    const decision = await controller.evaluate(
      evaluation(evidence(sequence), `action:${sequence}`),
    );
    levels.push(decision.level);
  }
  assert.deepEqual(levels, ["approve_all", "approve_sample", "autonomous"]);
  assert.equal(
    (
      await store.loadState({
        tenantId: policy.tenantId,
        policyDomainId: policy.policyDomainId,
        policyId: policy.policyId,
        segmentDigest: evidence(3).segmentDigest,
        actionType: "effect.apply",
      })
    ).level,
    "autonomous",
  );
});

test("ordinary degradation is immediate and a configured critical reason drops to blocked", async () => {
  const { controller } = await fixture();
  for (let sequence = 1; sequence <= 3; sequence += 1)
    await controller.evaluate(
      evaluation(evidence(sequence), `promote:${sequence}`),
    );
  const degraded = await controller.evaluate(
    evaluation(
      evidence(4, {
        positive: 0,
        negative: 2,
        reasonCounts: { ordinary_error: 2 },
      }),
      "action:degrade",
    ),
  );
  assert.equal(degraded.level, "approve_sample");
  const critical = await controller.evaluate(
    evaluation(
      evidence(5, {
        positive: 1,
        negative: 1,
        reasonCounts: { wrong_target: 1 },
      }),
      "action:critical",
    ),
  );
  assert.equal(critical.level, "blocked");
  assert.equal(critical.disposition, "deny");
});

test("stale coverage cannot promote and applies the configured fail-closed floor", async () => {
  const { controller } = await fixture();
  await controller.evaluate(evaluation(evidence(1), "action:promote"));
  const stale = await controller.evaluate(
    evaluation(
      evidence(2, {
        coverageStatus: "stale",
        eligibleTaskRuns: 2,
        concludedOutcomes: 0,
        positive: 0,
        unresolvedTaskRuns: 2,
      }),
      "action:stale",
    ),
  );
  assert.equal(stale.level, "blocked");
  assert.equal(stale.disposition, "deny");
});

test("sampling is deterministic across retries that do not change the level epoch", async () => {
  const { controller } = await fixture({ sampleApprovalBasisPoints: 5_000 });
  await controller.evaluate(evaluation(evidence(1), "promote:1"));
  await controller.evaluate(evaluation(evidence(2), "promote:2"));
  const window = evidence(2);
  const first = await controller.evaluate(evaluation(window, "same-action"));
  const second = await controller.evaluate(evaluation(window, "same-action"));
  assert.equal(first.level, "approve_sample");
  assert.equal(second.level, "approve_sample");
  assert.equal(first.sampledForApproval, second.sampledForApproval);
  assert.equal(first.disposition, second.disposition);
});

test("evidence sequence conflict and rollback fail closed", async () => {
  const { controller } = await fixture();
  await controller.evaluate(evaluation(evidence(2), "action:2"));
  await assert.rejects(
    controller.evaluate(evaluation(evidence(1), "action:rollback")),
    /sequence_rollback/u,
  );
  await assert.rejects(
    controller.evaluate(
      evaluation(evidence(2, { sourceRevision: 99 }), "action:conflict"),
    ),
    /sequence_conflict/u,
  );
});

test("an unavailable store denies instead of widening to approve_all", async () => {
  const controller = new AutonomyControllerV1({
    async getPolicy() {
      throw new Error("unavailable");
    },
  });
  const decision = await controller.evaluate(
    evaluation(evidence(1), "action:unavailable"),
  );
  assert.equal(decision.level, null);
  assert.equal(decision.disposition, "deny");
  assert.equal(decision.reasonCode, "autonomy_store_unavailable");
});

async function fixture(overrides = {}) {
  const store = new InMemoryAutonomyStoreV1();
  const policy = createAutonomyPolicyV1({
    tenantId: "tenant-a",
    policyDomainId: "policy-domain-a",
    policyId: "policy-a",
    policyVersion: 1,
    segmentNamespace: "risk-band",
    initialLevel: "propose_only",
    maximumLevel: "autonomous",
    minimumConcludedOutcomes: 2,
    minimumPositiveBasisPoints: 8_000,
    maximumNegativeBasisPoints: 2_000,
    maximumCorrectedBasisPoints: 2_000,
    maximumUnresolvedBasisPoints: 0,
    consecutiveHealthyWindows: 1,
    promotionCooldownMs: 0,
    sampleApprovalBasisPoints: 10_000,
    criticalReasonCodes: ["wrong_target"],
    criticalDegradationLevel: "blocked",
    coverageFailureLevel: "blocked",
    maximumDecisionHistory: 16,
    ...overrides,
  });
  await store.registerPolicy(policy);
  return { store, policy, controller: new AutonomyControllerV1(store) };
}

function evidence(sequence, overrides = {}) {
  const positive = overrides.positive ?? 2;
  const negative = overrides.negative ?? 0;
  const corrected = overrides.corrected ?? 0;
  const concludedOutcomes =
    overrides.concludedOutcomes ?? positive + negative + corrected;
  const eligibleTaskRuns = overrides.eligibleTaskRuns ?? concludedOutcomes;
  const unresolvedTaskRuns =
    overrides.unresolvedTaskRuns ?? eligibleTaskRuns - concludedOutcomes;
  return createAutonomyEvidenceWindowV1({
    tenantId: "tenant-a",
    policyDomainId: "policy-domain-a",
    segmentNamespace: "risk-band",
    segmentKey: "segment-a",
    actionType: "effect.apply",
    sourceId: "workflow-outcomes",
    sourceRevision: overrides.sourceRevision ?? sequence,
    windowSequence: sequence,
    observedFrom: at,
    observedThrough: `2026-08-28T12:00:${String(sequence).padStart(2, "0")}.000Z`,
    coverageStatus: overrides.coverageStatus ?? "healthy",
    eligibleTaskRuns,
    concludedOutcomes,
    positive,
    negative,
    corrected,
    inconclusive: overrides.inconclusive ?? 0,
    unresolvedTaskRuns,
    reasonCounts: overrides.reasonCounts ?? {},
    cursor:
      concludedOutcomes > 0
        ? {
            recordedAt: `2026-08-28T12:00:${String(sequence).padStart(2, "0")}.000Z`,
            outcomeId: `outcome:${sequence}`,
          }
        : null,
    evidenceReferenceIds: [],
  });
}

function evaluation(window, action) {
  return {
    tenantId: "tenant-a",
    policyDomainId: "policy-domain-a",
    policyId: "policy-a",
    policyVersion: 1,
    segmentNamespace: "risk-band",
    segmentKey: "segment-a",
    actionType: "effect.apply",
    actionProposalDigest: digestAutonomyJsonV1("test-action", action),
    evidence: window,
    logicalTime: window.observedThrough,
  };
}
