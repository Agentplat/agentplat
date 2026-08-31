import assert from "node:assert/strict";
import test from "node:test";

import { digestPlanningJsonV1 } from "@agentplat/collective-planning";
import {
  LocalStrategyAdaptationRuntimeV1,
  createLocalStrategyAdaptationPolicyV1,
  createLocalStrategyCatalogV1,
  createLocalStrategyDefinitionV1,
  createLocalStrategySafetyResolutionPortV1,
  createLocalStrategySafetySignalSourceV1,
  createLocalStrategySafetySignalV1,
  createLocalStrategySelectionRequestV1,
} from "@agentplat/collective-runtime/strategy-adaptation";
import {
  MorphogenesisStrategyGovernanceRuntimeV3,
  createMorphogenesisStrategyCatalogV3,
  createMorphogenesisStrategyDefinitionV3,
  createMorphogenesisStrategyGovernancePolicyV3,
  createMorphogenesisStrategyReviewV3,
  createMorphogenesisStrategyCounterfactualEstimateV3,
  createMorphogenesisStrategyCounterfactualReportV3,
} from "@agentplat/collective-runtime/morphogenesis";
import {
  PostgresLocalStrategyAdaptationStoreV1,
  PostgresMorphogenesisStrategyGovernanceStoreV3,
  PostgresMorphogenesisStrategyCounterfactualStoreV3,
} from "../dist/morphogenesis-strategy.js";

const sha = (value) => digestPlanningJsonV1("morphogenesis-strategy-context-v3", { value });
const operations = ["award_selection", "bid_submission", "offer_routing", "plan_decomposition", "recovery_selection"];
const dimensions = ["authority", "capability_state", "context_integrity", "role", "trust"];

class FakePool {
  rows = new Map();
  async query(sql, params) {
    const counterfactual = sql.includes("morphogenesis-strategy-counterfactual");
    const kind = counterfactual ? "morphogenesis-strategy-counterfactual" : params[1];
    const stateKey = counterfactual ? params[1] : params[2];
    const key = `${params[0]}:${kind}:${stateKey}`;
    if (sql.includes("SELECT")) {
      const row = this.rows.get(key);
      return { rowCount: row ? 1 : 0, rows: row ? [structuredClone(row)] : [] };
    }
    if (sql.includes("INSERT")) {
      if (this.rows.has(key)) return { rowCount: 0, rows: [] };
      this.rows.set(key, {
        revision: counterfactual ? 0 : params[3],
        logical_time_high_water_ms: counterfactual ? params[2] : params[4],
        state_digest: counterfactual ? params[3] : params[5],
        state: JSON.parse(counterfactual ? params[4] : params[6]),
      });
      return { rowCount: 1, rows: [] };
    }
    if (sql.includes("UPDATE")) {
      const current = this.rows.get(key);
      if (!current || Number(current.revision) !== params[3] ||
          current.state_digest !== params[4] ||
          Number(current.logical_time_high_water_ms) > params[6])
        return { rowCount: 0, rows: [] };
      this.rows.set(key, {
        revision: params[5], logical_time_high_water_ms: params[6],
        state_digest: params[7], state: JSON.parse(params[8]),
      });
      return { rowCount: 1, rows: [] };
    }
    throw new Error(`unexpected SQL: ${sql}`);
  }
}

class Witness {
  heads = new Map();
  async verify(input) {
    const value = this.heads.get(`${input.scopeId}:${input.stateKind}:${input.stateKey}`);
    return value?.revision === input.revision && value?.digest === input.digest;
  }
  async record(input) {
    const key = `${input.scopeId}:${input.stateKind}:${input.stateKey}`;
    const current = this.heads.get(key);
    if (input.previousRevision === null ? Boolean(current) :
      !current || current.revision !== input.previousRevision || current.digest !== input.previousDigest)
      return false;
    this.heads.set(key, { revision: input.nextRevision, digest: input.nextDigest });
    return true;
  }
}

function fixture() {
  const strategy = createLocalStrategyDefinitionV1({
    schemaVersion: 1, strategyId: "strategy:baseline", strategyVersion: 1,
    implementationDigest: sha("implementation"), operations,
  });
  const adaptive = createLocalStrategyDefinitionV1({
    schemaVersion: 1, strategyId: "strategy:adaptive", strategyVersion: 1,
    implementationDigest: sha("implementation:adaptive"), operations,
  });
  const localCatalog = createLocalStrategyCatalogV1({
    schemaVersion: 1, catalogId: "catalog:local", catalogVersion: 1,
    parentCatalogDigest: null, strategies: [strategy, adaptive],
    baselines: Object.fromEntries(operations.map((operation) => [operation, strategy.strategyId])),
  });
  const feedbackSource = {
    schemaVersion: 1, sourceId: "feedback:source", sourceVersion: 1,
    sourceImplementationDigest: sha("feedback-source"),
  };
  const adaptationPolicy = createLocalStrategyAdaptationPolicyV1({
    schemaVersion: 1, policyId: "policy:adaptation", policyVersion: 1,
    parentPolicyDigest: null,
    requiredSafetyDimensions: Object.fromEntries(operations.map((operation) => [operation, dimensions])),
    feedbackMetrics: ["mission_progress", "latency_efficiency", "resource_efficiency", "recovery_quality", "safety"]
      .map((metric) => ({ schemaVersion: 1, metric, weight: 1, direction: "maximize" })),
    feedbackSources: [feedbackSource], minimumFeedbackSources: 1,
    minimumFeedbackConfidenceBps: 8_000, learningRateBps: 1_000,
    explorationRateBps: 0, baselineProbabilityFloorBps: 10_000,
    initialWeightMicros: 1_000_000, minimumWeightMicros: 100_000,
    maximumWeightMicros: 10_000_000, unsafePenaltyBps: 8_000,
    quarantineDurationMs: 100,
    limits: { maximumStrategies: 4, maximumPendingDecisions: 8,
      maximumSafetyHeads: 64, maximumFeedbackHeads: 16,
      maximumReasonCodesPerSignal: 8, maximumDecisionTtlMs: 50,
      maximumSafetySignalTtlMs: 100, maximumFeedbackDelayMs: 100,
      maximumCommitAttempts: 4 },
  });
  const entropy = {
    entropyId: "entropy:test", entropyVersion: 1,
    entropyImplementationDigest: sha("entropy"),
    async draw() { return { drawBps: 0, evidenceDigest: sha("draw") }; },
  };
  const morphogenesisCatalog = createMorphogenesisStrategyCatalogV3({
    catalogId: "catalog:morphogenesis", catalogVersion: 1,
    parentCatalogDigest: null, localCatalog,
    strategies: [strategy, adaptive].map((item) => createMorphogenesisStrategyDefinitionV3({
      strategy: item, morphogenesisPolicyDigest: sha("morph-policy"),
      blueprintCatalogDigest: sha("blueprints"), proposalGeneratorDigest: sha(`generator:${item.strategyId}`),
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
  return { strategy, adaptive, localCatalog, adaptationPolicy, entropy, morphogenesisCatalog, governancePolicy };
}

test("PostgreSQL strategy adaptation and governance survive reconstruction and witness rollback", async () => {
  const value = fixture();
  const pool = new FakePool();
  const witness = new Witness();
  const options = { scopeId: "tenant:strategy", rollbackWitness: witness };
  const adaptationStore = new PostgresLocalStrategyAdaptationStoreV1({
    pool, options, policy: value.adaptationPolicy,
    catalog: value.localCatalog, entropy: value.entropy,
  });
  const safety = createLocalStrategySafetyResolutionPortV1({
    sources: dimensions.map((dimension) => createLocalStrategySafetySignalSourceV1({
      dimension,
      async resolve({ request, strategy }) {
        return createLocalStrategySafetySignalV1({
          schemaVersion: 1, signalId: `signal:${dimension}`,
          requestId: request.requestId, requestDigest: request.requestDigest,
          strategyId: strategy.strategyId, strategyDigest: strategy.strategyDigest,
          dimension, disposition: "eligible", sourceId: `source:${dimension}`,
          sourceVersion: 1, sourceImplementationDigest: sha(`source:${dimension}`),
          sourceRevision: 1, reasonCodes: [`${dimension}_eligible`],
          observedAtLogicalMs: 10, expiresAtLogicalMs: 50,
        });
      },
    })),
  });
  const adaptation = new LocalStrategyAdaptationRuntimeV1({
    stateKey: "state:adaptation", controllerId: "controller:test",
    controllerVersion: 1, implementationId: "implementation:test",
    policy: value.adaptationPolicy, catalog: value.localCatalog,
    safety, entropy: value.entropy, store: adaptationStore,
  });
  await adaptation.select(createLocalStrategySelectionRequestV1({
    schemaVersion: 1, requestId: "request:strategy", operation: "plan_decomposition",
    scope: { tenantId: "tenant", meshId: "mesh", policyDomainId: "policy",
      missionIntentId: "mission", objectiveId: "objective",
      workItemId: null, workItemRevision: null },
    logicalTimeMs: 10, contextDigest: sha("context"),
    availableStrategyIds: [value.strategy.strategyId],
  }));
  const reopenedAdaptation = new PostgresLocalStrategyAdaptationStoreV1({
    pool, options, policy: value.adaptationPolicy,
    catalog: value.localCatalog, entropy: value.entropy,
  });
  const adaptationState = await reopenedAdaptation.load("state:adaptation");
  assert.equal(adaptationState.revision >= 1, true);

  const governanceStateKey = "state:governance";
  const governanceStore = new PostgresMorphogenesisStrategyGovernanceStoreV3({
    pool, options, stateKey: governanceStateKey,
    policy: value.governancePolicy, catalog: value.morphogenesisCatalog,
  });
  const governance = new MorphogenesisStrategyGovernanceRuntimeV3({
    stateKey: governanceStateKey, policy: value.governancePolicy,
    catalog: value.morphogenesisCatalog,
    reviews: { async review({ recommendation, logicalTimeMs }) {
      return createMorphogenesisStrategyReviewV3({
        reviewId: "review:test", recommendationDigest: recommendation.recommendationDigest,
        route: "authorized_agent", actorType: "agent", actorId: "agent:reviewer",
        actorMandateDigest: sha("mandate"), independenceGroupId: "independence:reviewer",
        disposition: "approved", proofDigest: sha("proof"),
        reviewedAtLogicalMs: logicalTimeMs, expiresAtLogicalMs: logicalTimeMs + 10,
      });
    } },
    store: governanceStore,
  });
  const recommendation = await governance.recommend({
    recommendationId: "recommendation:test", action: "promote",
    targetStrategyId: value.adaptive.strategyId, replacementStrategyId: null,
    adaptationStateDigest: adaptationState.stateDigest,
    adaptationStateRevision: adaptationState.revision, evidenceDigests: [sha("evidence")],
    counterfactualDigest: null, riskDigest: sha("risk"), costDigest: sha("cost"),
    confidenceBps: 9_000, proposerId: "agent:analyst",
    proposerImplementationDigest: sha("analyst"), reviewRoute: "authorized_agent",
    reasonCodes: ["promote_supported"], proposedAtLogicalMs: 20, expiresAtLogicalMs: 40,
  });
  const governed = await governance.reviewAndApply({ recommendation, logicalTimeMs: 25 });
  const reopenedGovernance = new PostgresMorphogenesisStrategyGovernanceStoreV3({
    pool, options, stateKey: governanceStateKey,
    policy: value.governancePolicy, catalog: value.morphogenesisCatalog,
  });
  assert.equal((await reopenedGovernance.load(governanceStateKey)).stateDigest, governed.stateDigest);
  witness.heads.clear();
  await assert.rejects(reopenedAdaptation.load("state:adaptation"), /witness diverged/);
  await assert.rejects(reopenedGovernance.load(governanceStateKey), /witness diverged/);
});

test("PostgreSQL counterfactual reports are immutable and witness guarded", async () => {
  const pool = new FakePool();
  const witness = new Witness();
  const options = { scopeId: "tenant:counterfactual", rollbackWitness: witness };
  const estimate = createMorphogenesisStrategyCounterfactualEstimateV3({
    scenarioDigest: sha("scenario"), strategyId: "strategy:baseline",
    definitionDigest: sha("definition"), simulatorImplementationDigest: sha("simulator"),
    seedDigest: sha("seed"), disposition: "success",
    metrics: ["mission_progress", "latency_efficiency", "resource_efficiency",
      "recovery_quality", "safety"].map((metric) => ({ schemaVersion: 1, metric, valueMicros: 800_000 })),
    confidenceBps: 9_000, evidenceDigests: [sha("estimate-evidence")],
    interactionUnits: 1, estimatedAtLogicalMs: 20,
  });
  const report = createMorphogenesisStrategyCounterfactualReportV3({
    reportId: "report:postgres", scenarioDigest: estimate.scenarioDigest,
    actualSelectionDigest: null, actualOutcomeReceiptDigest: null,
    actualMeasurementDigest: null, estimates: [estimate],
    classification: "inconclusive", recommendedAction: "explore",
    recommendedStrategyId: estimate.strategyId,
    evidenceDigests: [estimate.estimateDigest], evaluatedAtLogicalMs: 25,
  });
  const store = new PostgresMorphogenesisStrategyCounterfactualStoreV3(pool, options);
  assert.equal(await store.save(report), true);
  assert.equal(await store.save(report), true);
  assert.equal((await store.load(report.reportId)).reportDigest, report.reportDigest);
  witness.heads.clear();
  await assert.rejects(store.load(report.reportId), /witness diverged/);
});
