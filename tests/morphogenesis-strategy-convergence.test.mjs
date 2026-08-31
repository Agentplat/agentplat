import assert from "node:assert/strict";
import test from "node:test";

import { digestPlanningJsonV1 } from "@agentplat/collective-planning";
import {
  createLocalStrategyCatalogV1,
  createLocalStrategyDefinitionV1,
} from "@agentplat/collective-runtime/strategy-adaptation";
import {
  InMemoryStrategyConvergenceStoreV1,
  StrategyConvergenceRuntimeV1,
  createStrategyConvergencePolicyV1,
} from "@agentplat/collective-runtime/strategy-convergence";
import {
  createPeerStrategyEvidenceBindingV1,
  createPeerStrategyEvidenceCohortV1,
} from "@agentplat/collective-runtime/strategy-evidence-exchange";
import {
  InMemoryMorphogenesisStrategyGovernanceStoreV3,
  MorphogenesisStrategyConvergenceV4,
  MorphogenesisStrategyGovernanceRuntimeV3,
  createMorphogenesisStrategyCatalogV3,
  createMorphogenesisStrategyContextV3,
  createMorphogenesisStrategyDefinitionV3,
  createMorphogenesisStrategyEvidenceBindingV4,
  createMorphogenesisStrategyGovernanceInputFromConvergenceV4,
  createMorphogenesisStrategyGovernancePolicyV3,
  createMorphogenesisStrategyIntelligencePolicyV4,
  createMorphogenesisStrategyReviewV3,
  morphogenesisStrategyFeedbackSchemaDigestV4,
} from "@agentplat/collective-runtime/morphogenesis";

const sha = (value) => digestPlanningJsonV1("morphogenesis-strategy-context-v3", { value });
const operations = ["award_selection", "bid_submission", "offer_routing", "plan_decomposition", "recovery_selection"];

async function fixture() {
  const definition = (strategyId) => createLocalStrategyDefinitionV1({
    schemaVersion: 1, strategyId, strategyVersion: 1,
    implementationDigest: sha(`implementation:${strategyId}`), operations,
  });
  const baseline = definition("strategy:baseline");
  const adaptive = definition("strategy:adaptive");
  const localCatalog = createLocalStrategyCatalogV1({
    schemaVersion: 1, catalogId: "catalog:local", catalogVersion: 1,
    parentCatalogDigest: null, strategies: [baseline, adaptive],
    baselines: Object.fromEntries(operations.map((operation) => [operation, baseline.strategyId])),
  });
  const morphogenesisPolicyDigest = sha("morphogenesis-policy");
  const catalog = createMorphogenesisStrategyCatalogV3({
    catalogId: "catalog:morphogenesis", catalogVersion: 1,
    parentCatalogDigest: null, localCatalog,
    strategies: [baseline, adaptive].map((strategy) => createMorphogenesisStrategyDefinitionV3({
      strategy, morphogenesisPolicyDigest, blueprintCatalogDigest: sha("blueprints"),
      proposalGeneratorDigest: sha(`generator:${strategy.strategyId}`),
      supportedOperators: ["replace_agent"],
    })),
  });
  const governancePolicy = createMorphogenesisStrategyGovernancePolicyV3({
    schemaVersion: 3, policyId: "policy:governance", policyVersion: 1,
    parentPolicyDigest: null, allowedActions: ["promote", "degrade", "retire", "rollback"],
    allowedReviewRoutes: ["authorized_agent"], requireIndependentReviewer: true,
    minimumConfidenceBps: 8_000, cooldownMs: 0, transitionWindowMs: 100,
    maximumTransitionsPerWindow: 4, maximumPendingRecommendations: 4,
    maximumReviewHistory: 8, maximumTransitionHistory: 8, maximumCommitAttempts: 4,
  });
  const governance = new MorphogenesisStrategyGovernanceRuntimeV3({
    stateKey: "state:governance", policy: governancePolicy, catalog,
    reviews: { async review({ recommendation, logicalTimeMs }) {
      return createMorphogenesisStrategyReviewV3({
        reviewId: "review:initialize", recommendationId: recommendation.recommendationId,
        recommendationDigest: recommendation.recommendationDigest,
        route: "authorized_agent", actorType: "agent", actorId: "agent:reviewer",
        actorMandateDigest: sha("mandate"), independenceGroupId: "group:reviewer",
        disposition: "rejected", proofDigest: sha("proof"),
        reviewedAtLogicalMs: logicalTimeMs, expiresAtLogicalMs: logicalTimeMs + 10,
      });
    } },
    store: new InMemoryMorphogenesisStrategyGovernanceStoreV3(),
  });
  const initialization = await governance.recommend({
    recommendationId: "recommendation:initialize", action: "promote",
    targetStrategyId: adaptive.strategyId, replacementStrategyId: null,
    adaptationStateDigest: sha("adaptation"), adaptationStateRevision: 1,
    evidenceDigests: [sha("evidence")], counterfactualDigest: null,
    riskDigest: sha("risk"), costDigest: sha("cost"), confidenceBps: 9_000,
    proposerId: "agent:analyst", proposerImplementationDigest: sha("analyst"),
    reviewRoute: "authorized_agent", reasonCodes: ["initialization_probe"],
    proposedAtLogicalMs: 1, expiresAtLogicalMs: 9,
  });
  const governanceState = await governance.reviewAndApply({
    recommendation: initialization, logicalTimeMs: 2,
  });
  const context = createMorphogenesisStrategyContextV3({
    scopeDigest: sha("scope"), morphologyEpoch: 1,
    currentSnapshotDigest: sha("snapshot"), needDigest: sha("need"),
    targetDigest: sha("target"), morphogenesisPolicyDigest,
    riskDigest: sha("risk"), costEnvelopeDigest: sha("cost"), deadlineDigest: sha("deadline"),
  });
  const intelligencePolicy = createMorphogenesisStrategyIntelligencePolicyV4({
    schemaVersion: 4, policyId: "policy:intelligence", policyVersion: 1,
    tenantId: "tenant", meshId: "mesh", policyDomainId: "policy-domain",
    catalogDigest: catalog.catalogDigest, morphogenesisPolicyDigest,
    admittedContextClassDigests: [sha("context-class")], maximumAttestationTtlMs: 100,
  });
  return { baseline, adaptive, catalog, governancePolicy, governanceState,
    context, intelligencePolicy };
}

function certificate(value, strategy, confidenceBps, label) {
  const cohort = createPeerStrategyEvidenceCohortV1({
    tenantId: "tenant", meshId: "mesh", policyDomainId: "policy-domain",
    missionIntentId: "mission", objectiveId: "objective",
    contextClassDigest: sha("context-class"),
  });
  const v4 = createMorphogenesisStrategyEvidenceBindingV4({
    catalog: value.catalog, strategyId: strategy.strategyId,
    contextClassDigest: sha("context-class"),
  });
  const binding = createPeerStrategyEvidenceBindingV1({
    operation: "plan_decomposition", strategyId: v4.strategyId,
    strategyDigest: v4.strategyDigest,
    implementationDigest: v4.proposalGeneratorDigest,
    feedbackSchemaDigest: morphogenesisStrategyFeedbackSchemaDigestV4(),
  });
  const peers = ["peer:a", "peer:b", "peer:c"];
  const body = {
    schemaVersion: 1, policyDigest: sha("evidence-policy"), membershipEpoch: 1,
    membershipConfigurationDigest: sha("membership"), cohortDigest: cohort.cohortDigest,
    binding, attestationDigests: peers.map((peer) => sha(`${label}:${peer}`)).sort(),
    attesterPeerIds: peers, independenceGroupIds: ["group:a", "group:b", "group:c"],
    outcome: "success",
    metrics: ["latency_efficiency", "mission_progress", "recovery_quality",
      "resource_efficiency", "safety"].map((metric) => ({ schemaVersion: 1,
      metric, valueMicros: confidenceBps * 100 })),
    confidenceBps, certifiedAtLogicalMs: 5, expiresAtLogicalMs: 100,
  };
  const certificateDigest = digestPlanningJsonV1("peer-strategy-evidence-certificate", body);
  return { ...body,
    certificateId: `strategy-evidence-certificate.${certificateDigest.slice(7)}`,
    certificateDigest };
}

function convergence(policyOverrides = {}) {
  const policy = createStrategyConvergencePolicyV1({
    schemaVersion: 1, policyId: "policy:convergence", policyVersion: 1,
    parentPolicyDigest: null, minimumConfidenceBps: 6_000,
    minimumDistinctPeers: 3, minimumDistinctIndependenceGroups: 3,
    minimumStableCycles: 2, recoveryStableCycles: 3,
    improvementMarginBps: 500, diversityPreservationMarginBps: 0,
    minimumCycleIntervalMs: 10, cooldownDurationMs: 20,
    oscillationWindowMs: 100, maximumTransitionsPerOscillationWindow: 2,
    maximumPriorInfluenceBps: 2_000, recommendationTtlMs: 50,
    limits: { maximumScopes: 4, maximumStrategiesPerScope: 4,
      maximumObservationsPerCycle: 8, maximumHistoryPerScope: 16,
      maximumSourceIdsPerObservation: 8, maximumReasonCodesPerDecision: 8,
      maximumObservationTtlMs: 100, maximumFutureSkewMs: 5,
      maximumCommitAttempts: 4 },
    ...policyOverrides,
  });
  return new StrategyConvergenceRuntimeV1({
    stateKey: "state:convergence", controllerId: "convergence",
    controllerVersion: 1, implementationId: "convergence:v1", policy,
    store: new InMemoryStrategyConvergenceStoreV1(),
  });
}

test("V4 reaches stable adoption only after sustained compatible evidence", async () => {
  const value = await fixture();
  const adapter = new MorphogenesisStrategyConvergenceV4({
    intelligencePolicy: value.intelligencePolicy,
    catalog: value.catalog,
    convergence: convergence(),
  });
  const certificates = [certificate(value, value.baseline, 7_000, "baseline"),
    certificate(value, value.adaptive, 9_000, "adaptive")];
  const cycle = (cycleId, logicalTimeMs, connectivity = "connected") =>
    adapter.evaluate({ cycleId, context: value.context,
      contextClassDigest: sha("context-class"), governanceState: value.governanceState,
      governancePolicy: value.governancePolicy, governanceStateKey: "state:governance",
      missionIntentId: "mission", objectiveId: "objective", connectivity,
      certificates, logicalTimeMs });
  const first = await cycle("cycle:1", 10);
  assert.equal(first.convergenceDecision.action, "hold");
  const second = await cycle("cycle:2", 20);
  assert.equal(second.convergenceDecision.action, "adopt");
  assert.equal(second.convergenceDecision.recommendedStrategyId, value.adaptive.strategyId);
  assert.equal(second.advisoryOnly, true);
  const governanceInput = createMorphogenesisStrategyGovernanceInputFromConvergenceV4({
    decision: second, governanceState: value.governanceState,
    recommendationId: "recommendation:convergence", adaptationStateDigest: sha("adaptation"),
    adaptationStateRevision: 2, riskDigest: sha("risk"), costDigest: sha("cost"),
    proposerId: "agent:convergence", proposerImplementationDigest: sha("convergence"),
    reviewRoute: "collective", proposedAtLogicalMs: 21, expiresAtLogicalMs: 40,
  });
  assert.equal(governanceInput.action, "promote");
  assert.equal(governanceInput.targetStrategyId, value.adaptive.strategyId);
  assert.equal("reviewDigest" in governanceInput, false);
});

test("V4 fails safe for partitions and preserves local diversity near the leader", async () => {
  const value = await fixture();
  const partitioned = new MorphogenesisStrategyConvergenceV4({
    intelligencePolicy: value.intelligencePolicy,
    catalog: value.catalog,
    convergence: convergence(),
  });
  const certificates = [certificate(value, value.adaptive, 9_000, "adaptive")];
  const result = await partitioned.evaluate({
    cycleId: "cycle:partition", context: value.context,
    contextClassDigest: sha("context-class"), governanceState: value.governanceState,
    governancePolicy: value.governancePolicy, governanceStateKey: "state:governance",
    missionIntentId: "mission", objectiveId: "objective", connectivity: "partitioned",
    certificates, logicalTimeMs: 10,
  });
  assert.equal(result.convergenceDecision.status, "partitioned");
  assert.equal(result.convergenceDecision.action, "hold");

  const diverse = new MorphogenesisStrategyConvergenceV4({
    intelligencePolicy: value.intelligencePolicy,
    catalog: value.catalog,
    convergence: convergence({ diversityPreservationMarginBps: 3_000,
      minimumStableCycles: 1 }),
  });
  const close = [certificate(value, value.baseline, 8_500, "baseline-close"),
    certificate(value, value.adaptive, 9_000, "adaptive-close")];
  const held = await diverse.evaluate({
    cycleId: "cycle:diverse", context: value.context,
    contextClassDigest: sha("context-class"), governanceState: value.governanceState,
    governancePolicy: value.governancePolicy, governanceStateKey: "state:governance",
    missionIntentId: "mission", objectiveId: "objective", connectivity: "connected",
    certificates: close, logicalTimeMs: 10,
  });
  assert.equal(held.convergenceDecision.action, "hold");
});
