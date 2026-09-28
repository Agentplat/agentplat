import assert from "node:assert/strict";
import test from "node:test";
import {
  AutonomyControllerV1,
  InMemoryAutonomyStoreV1,
  createAutonomyEvidenceWindowV1,
  createAutonomyPolicyV1,
  digestAutonomyJsonV1,
} from "@agentplat/autonomy";
import {
  createGovernanceAutonomySupervisionV1,
  agentAutonomySegmentKeyV1,
  combineGovernanceSupervisionV1,
} from "../dist/index.js";
const at = "2026-08-28T12:00:00.000Z";
const binding = {
  tenantId: "tenant-a",
  agentId: "agent",
  governanceId: "gov",
  revision: 2,
  authorityEpoch: 1,
  configurationDigest: "sha256:" + "a".repeat(64),
  definitionRevisionId: "def:1",
  profileDigest: "sha256:" + "b".repeat(64),
};
test("governance autonomy promotes exact evidence scopes and resets on model, child or lineage change", async () => {
  const { policy, controller } = await fixture();
  let sequence = 1,
    wrongScope = false,
    stale = false;
  const adapter = createGovernanceAutonomySupervisionV1({
    policy,
    controller,
    evidence: async (input) => {
      const { schemaVersion, evidenceDigest, segmentDigest, ...body } =
        evidence(sequence, stale ? { coverageStatus: "stale" } : {});
      return createAutonomyEvidenceWindowV1({
        ...body,
        segmentKey: wrongScope ? "another-segment" : input.segmentKey,
        actionType: input.actionType,
      });
    },
  });
  const assess = async (b = binding) =>
    adapter.assess({
      supervisionId: adapter.supervisionId,
      policyAgentId: "agent",
      binding: b,
      effect: {
        toolId: "writer",
        operation: "create",
        actionDigest: digestAutonomyJsonV1("test-action", String(sequence)),
      },
      logicalTime: `2026-08-28T12:00:${String(sequence).padStart(2, "0")}.000Z`,
    });
  assert.equal((await assess()).allowed, false);
  sequence++;
  assert.equal((await assess()).allowed, false);
  sequence++;
  assert.equal((await assess()).allowed, true);
  for (const b of [
    { ...binding, definitionRevisionId: "def:2" },
    { ...binding, agentId: "new-child" },
    { ...binding, continuity: [{ continuityId: "different" }] },
  ]) {
    assert.notEqual(
      agentAutonomySegmentKeyV1(b, "agent", "writer:create"),
      agentAutonomySegmentKeyV1(binding, "agent", "writer:create"),
    );
    assert.equal((await assess(b)).allowed, false);
  }
  sequence++;
  stale = true;
  assert.equal((await assess()).allowed, false);
  stale = false;
  wrongScope = true;
  await assert.rejects(assess(), /evidence_scope/);
  const combined = combineGovernanceSupervisionV1([adapter, adapter]);
  assert.equal(combined.supports(adapter.supervisionId), false);
  await assert.rejects(
    combined.assess({ supervisionId: adapter.supervisionId }),
    /ambiguous/,
  );
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
