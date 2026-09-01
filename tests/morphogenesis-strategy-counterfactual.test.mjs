import assert from "node:assert/strict";
import test from "node:test";

import { digestPlanningJsonV1 } from "@agentplat/collective-planning";
import {
  InMemoryLocalStrategyAdaptationStoreV1,
  LocalStrategyAdaptationRuntimeV1,
  createLocalStrategyAdaptationPolicyV1,
  createLocalStrategyCatalogV1,
  createLocalStrategyDefinitionV1,
  createLocalStrategySafetyResolutionPortV1,
  createLocalStrategySafetySignalSourceV1,
  createLocalStrategySafetySignalV1,
} from "@agentplat/collective-runtime/strategy-adaptation";
import {
  DeterministicMorphogenesisStrategyCounterfactualPortV3,
  MorphogenesisStrategyCounterfactualRuntimeV3,
  InMemoryMorphogenesisStrategyCounterfactualStoreV3,
  createMorphogenesisOperatorOutcomeReceiptV2,
  createMorphogenesisStrategyCatalogV3,
  createMorphogenesisStrategyContextV3,
  createMorphogenesisStrategyCounterfactualEstimateV3,
  createMorphogenesisStrategyCounterfactualPolicyV3,
  createMorphogenesisStrategyCounterfactualScenarioV3,
  createMorphogenesisStrategyDefinitionV3,
  createMorphogenesisStrategyExecutionBindingV3,
  createMorphogenesisStrategyOutcomeMeasurementV3,
  createMorphogenesisStrategySelectionRequestV3,
  createMorphogenesisStrategySelectionV3,
} from "@agentplat/collective-runtime/morphogenesis";

const sha = (value) => digestPlanningJsonV1("morphogenesis-strategy-context-v3", { value });
const operations = ["award_selection", "bid_submission", "offer_routing", "plan_decomposition", "recovery_selection"];
const dimensions = ["authority", "capability_state", "context_integrity", "role", "trust"];
const metricNames = ["mission_progress", "latency_efficiency", "resource_efficiency", "recovery_quality", "safety"];
const metricValues = (value, safety = value) => metricNames.map((metric) => ({
  schemaVersion: 1,
  metric,
  valueMicros: metric === "safety" ? safety : value,
}));

async function fixture() {
  const definition = (strategyId) => createLocalStrategyDefinitionV1({
    schemaVersion: 1, strategyId, strategyVersion: 1,
    implementationDigest: sha(`implementation:${strategyId}`), operations,
  });
  const adaptive = definition("strategy:adaptive");
  const baseline = definition("strategy:baseline");
  const localCatalog = createLocalStrategyCatalogV1({
    schemaVersion: 1, catalogId: "catalog:local", catalogVersion: 1,
    parentCatalogDigest: null, strategies: [baseline, adaptive],
    baselines: Object.fromEntries(operations.map((operation) => [operation, baseline.strategyId])),
  });
  const morphogenesisPolicyDigest = sha("morphogenesis-policy");
  const catalog = createMorphogenesisStrategyCatalogV3({
    catalogId: "catalog:morphogenesis", catalogVersion: 1, parentCatalogDigest: null,
    localCatalog,
    strategies: [baseline, adaptive].map((strategy) => createMorphogenesisStrategyDefinitionV3({
      strategy, morphogenesisPolicyDigest, blueprintCatalogDigest: sha("blueprints"),
      proposalGeneratorDigest: sha(`generator:${strategy.strategyId}`),
      supportedOperators: ["replace_agent"],
    })),
  });
  const adaptationPolicy = createLocalStrategyAdaptationPolicyV1({
    schemaVersion: 1, policyId: "policy:adaptation", policyVersion: 1,
    parentPolicyDigest: null,
    requiredSafetyDimensions: Object.fromEntries(operations.map((operation) => [operation, dimensions])),
    feedbackMetrics: metricNames.map((metric) => ({ schemaVersion: 1, metric, weight: 1, direction: "maximize" })),
    feedbackSources: [{ schemaVersion: 1, sourceId: "feedback", sourceVersion: 1,
      sourceImplementationDigest: sha("feedback") }],
    minimumFeedbackSources: 1, minimumFeedbackConfidenceBps: 8_000,
    learningRateBps: 1_000, explorationRateBps: 10_000,
    baselineProbabilityFloorBps: 1_000, initialWeightMicros: 1_000_000,
    minimumWeightMicros: 100_000, maximumWeightMicros: 10_000_000,
    unsafePenaltyBps: 8_000, quarantineDurationMs: 100,
    limits: { maximumStrategies: 4, maximumPendingDecisions: 8,
      maximumSafetyHeads: 64, maximumFeedbackHeads: 16,
      maximumReasonCodesPerSignal: 8, maximumDecisionTtlMs: 50,
      maximumSafetySignalTtlMs: 100, maximumFeedbackDelayMs: 100,
      maximumCommitAttempts: 4 },
  });
  const entropy = { entropyId: "entropy:test", entropyVersion: 1,
    entropyImplementationDigest: sha("entropy"),
    async draw() { return { drawBps: 0, evidenceDigest: sha("draw") }; } };
  const safety = createLocalStrategySafetyResolutionPortV1({
    sources: dimensions.map((dimension) => createLocalStrategySafetySignalSourceV1({
      dimension,
      async resolve({ request, strategy }) {
        return createLocalStrategySafetySignalV1({
          schemaVersion: 1, signalId: `signal:${dimension}:${strategy.strategyId}`,
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
  const learner = new LocalStrategyAdaptationRuntimeV1({
    stateKey: "state:counterfactual", controllerId: "controller:test",
    controllerVersion: 1, implementationId: "implementation:test",
    policy: adaptationPolicy, catalog: localCatalog, safety, entropy,
    store: new InMemoryLocalStrategyAdaptationStoreV1({
      policy: adaptationPolicy, catalog: localCatalog, entropy,
    }),
  });
  const context = createMorphogenesisStrategyContextV3({
    scopeDigest: sha("scope"), morphologyEpoch: 2,
    currentSnapshotDigest: sha("snapshot"), needDigest: sha("need"),
    targetDigest: sha("target"), morphogenesisPolicyDigest,
    riskDigest: sha("risk"), costEnvelopeDigest: sha("cost"),
    deadlineDigest: sha("deadline"),
  });
  const request = createMorphogenesisStrategySelectionRequestV3({
    requestId: "request:counterfactual",
    scope: { tenantId: "tenant", meshId: "mesh", policyDomainId: "policy",
      missionIntentId: "mission", objectiveId: "objective",
      workItemId: null, workItemRevision: null },
    context, catalog, logicalTimeMs: 10,
  });
  const decision = await learner.select(request);
  assert.equal(decision.selectedStrategyId, adaptive.strategyId);
  const selection = createMorphogenesisStrategySelectionV3({
    selectionId: "selection:counterfactual", context, catalog, request, decision,
  });
  const planDigest = sha("plan");
  const executionBinding = createMorphogenesisStrategyExecutionBindingV3({
    bindingId: "binding:counterfactual", selection,
    proposalDigest: sha("proposal"), planDigest,
    generatorReceiptDigest: sha("generator-receipt"), boundAtLogicalMs: 12,
  });
  return { baseline, adaptive, catalog, context, selection, executionBinding, planDigest };
}

test("deterministic counterfactual analysis detects regression and remains advisory", async () => {
  const value = await fixture();
  const policy = createMorphogenesisStrategyCounterfactualPolicyV3({
    schemaVersion: 3, policyId: "policy:counterfactual", policyVersion: 1,
    maximumCandidates: 4, minimumConfidenceBps: 8_000,
    minimumImprovementMicros: 100_000, regressionMarginMicros: 100_000,
    safetyFloorMicros: 500_000, maximumScenarioTtlMs: 100,
  });
  const simulator = { id: "simulator:deterministic", version: 1,
    implementation: sha("simulator") };
  const scenario = createMorphogenesisStrategyCounterfactualScenarioV3({
    scenarioId: "scenario:counterfactual", context: value.context,
    catalog: value.catalog,
    candidateStrategyIds: [value.adaptive.strategyId, value.baseline.strategyId],
    simulatorId: simulator.id, simulatorVersion: simulator.version,
    simulatorImplementationDigest: simulator.implementation,
    environmentDigest: sha("environment"), seedDigest: sha("seed"),
    interactionBudget: 20, proposedAtLogicalMs: 20, expiresAtLogicalMs: 80,
    policy,
  });
  const definition = (strategyId) => value.catalog.strategies.find(({ strategy }) =>
    strategy.strategyId === strategyId);
  const estimate = (strategyId, metricValue) => createMorphogenesisStrategyCounterfactualEstimateV3({
    scenarioDigest: scenario.scenarioDigest, strategyId,
    definitionDigest: definition(strategyId).definitionDigest,
    simulatorImplementationDigest: simulator.implementation,
    seedDigest: scenario.seedDigest, disposition: "success",
    metrics: metricValues(metricValue, 900_000), confidenceBps: 9_000,
    evidenceDigests: [sha(`estimate:${strategyId}`)], interactionUnits: 5,
    estimatedAtLogicalMs: 25,
  });
  const port = new DeterministicMorphogenesisStrategyCounterfactualPortV3({
    simulatorId: simulator.id, simulatorVersion: simulator.version,
    simulatorImplementationDigest: simulator.implementation,
    estimates: [estimate(value.adaptive.strategyId, 400_000),
      estimate(value.baseline.strategyId, 900_000)],
  });
  const runtime = new MorphogenesisStrategyCounterfactualRuntimeV3({
    policy, catalog: value.catalog, simulator: port,
    store: new InMemoryMorphogenesisStrategyCounterfactualStoreV3(),
  });
  const outcome = createMorphogenesisOperatorOutcomeReceiptV2({
    receiptId: "outcome:counterfactual", operatorExecutionStateDigest: sha("execution"),
    planDigest: value.planDigest, proposalDigest: value.executionBinding.proposalDigest,
    decisionDigest: sha("decision"), authorizationDigest: sha("authorization"),
    authorityFenceDigest: sha("fence"), stepReceiptRoot: sha("steps"),
    disposition: "success", outcomeEvidenceDigests: [sha("outcome-evidence")],
    resultingSnapshotDigest: sha("result"), resultingMorphologyEpoch: 3,
    evaluatedAtLogicalMs: 30,
  });
  const measurement = createMorphogenesisStrategyOutcomeMeasurementV3({
    measurementId: "measurement:counterfactual", selection: value.selection,
    executionBinding: value.executionBinding, outcome,
    metrics: metricValues(200_000, 900_000), confidenceBps: 9_000,
    sourceId: "source:actual", sourceVersion: 1,
    sourceImplementationDigest: sha("actual-source"), sourceRevision: 1,
    provenanceDigest: sha("actual-provenance"), evidenceDigests: [sha("actual-evidence")],
    observedAtLogicalMs: 32, expiresAtLogicalMs: 70,
  });
  const report = await runtime.evaluate({
    reportId: "report:counterfactual", scenario,
    actual: { selection: value.selection, outcome, measurement },
    logicalTimeMs: 35,
  });
  assert.equal(report.classification, "regression");
  assert.equal(report.recommendedAction, "degrade");
  assert.equal(report.recommendedStrategyId, value.baseline.strategyId);
  assert.equal(report.advisoryOnly, true);
  assert.equal("authorizationDigest" in report, false);
  const replay = await runtime.evaluate({
    reportId: "report:counterfactual", scenario,
    actual: { selection: value.selection, outcome, measurement },
    logicalTimeMs: 35,
  });
  assert.equal(replay.reportDigest, report.reportDigest);
});

test("unsafe observed outcomes classify damage and counterfactual estimates cannot become feedback", async () => {
  const value = await fixture();
  const policy = createMorphogenesisStrategyCounterfactualPolicyV3({
    schemaVersion: 3, policyId: "policy:damage", policyVersion: 1,
    maximumCandidates: 2, minimumConfidenceBps: 8_000,
    minimumImprovementMicros: 1, regressionMarginMicros: 1,
    safetyFloorMicros: 500_000, maximumScenarioTtlMs: 100,
  });
  const simulatorImplementationDigest = sha("simulator:damage");
  const scenario = createMorphogenesisStrategyCounterfactualScenarioV3({
    scenarioId: "scenario:damage", context: value.context, catalog: value.catalog,
    candidateStrategyIds: [value.baseline.strategyId], simulatorId: "simulator:damage",
    simulatorVersion: 1, simulatorImplementationDigest,
    environmentDigest: sha("environment"), seedDigest: sha("seed:damage"),
    interactionBudget: 10, proposedAtLogicalMs: 20, expiresAtLogicalMs: 80, policy,
  });
  const baselineDefinition = value.catalog.strategies.find(({ strategy }) =>
    strategy.strategyId === value.baseline.strategyId);
  const estimate = createMorphogenesisStrategyCounterfactualEstimateV3({
    scenarioDigest: scenario.scenarioDigest, strategyId: value.baseline.strategyId,
    definitionDigest: baselineDefinition.definitionDigest,
    simulatorImplementationDigest, seedDigest: scenario.seedDigest,
    disposition: "success", metrics: metricValues(800_000), confidenceBps: 9_000,
    evidenceDigests: [sha("estimate")], interactionUnits: 1, estimatedAtLogicalMs: 25,
  });
  const runtime = new MorphogenesisStrategyCounterfactualRuntimeV3({
    policy, catalog: value.catalog,
    simulator: new DeterministicMorphogenesisStrategyCounterfactualPortV3({
      simulatorId: scenario.simulatorId, simulatorVersion: 1,
      simulatorImplementationDigest, estimates: [estimate],
    }),
    store: new InMemoryMorphogenesisStrategyCounterfactualStoreV3(),
  });
  const outcome = createMorphogenesisOperatorOutcomeReceiptV2({
    receiptId: "outcome:damage", operatorExecutionStateDigest: sha("execution"),
    planDigest: value.planDigest, proposalDigest: value.executionBinding.proposalDigest,
    decisionDigest: sha("decision"), authorizationDigest: sha("authorization"),
    authorityFenceDigest: sha("fence"), stepReceiptRoot: sha("steps"),
    disposition: "successor_recovery_required",
    outcomeEvidenceDigests: [sha("unsafe")], resultingSnapshotDigest: sha("result"),
    resultingMorphologyEpoch: 3, evaluatedAtLogicalMs: 30,
  });
  const measurement = createMorphogenesisStrategyOutcomeMeasurementV3({
    measurementId: "measurement:damage", selection: value.selection,
    executionBinding: value.executionBinding, outcome,
    metrics: metricValues(100_000, 0), confidenceBps: 9_000,
    sourceId: "source:actual", sourceVersion: 1,
    sourceImplementationDigest: sha("source"), sourceRevision: 1,
    provenanceDigest: sha("provenance"), evidenceDigests: [sha("evidence")],
    observedAtLogicalMs: 32, expiresAtLogicalMs: 70,
  });
  const report = await runtime.evaluate({
    reportId: "report:damage", scenario,
    actual: { selection: value.selection, outcome, measurement }, logicalTimeMs: 35,
  });
  assert.equal(report.classification, "damage");
  assert.equal(report.recommendedAction, "rollback");
  assert.equal("localFeedback" in report.estimates[0], false);
});
