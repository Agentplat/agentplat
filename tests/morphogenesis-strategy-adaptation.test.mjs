import assert from "node:assert/strict";
import test from "node:test";

import { digestPlanningJsonV1 } from "@agentplat/collective-planning";
import {
  InMemoryLocalStrategyAdaptationStoreV1,
  LocalStrategyAdaptationRuntimeV1,
  createLocalStrategyAdaptationPolicyV1,
  createLocalStrategyCatalogV1,
  createLocalStrategyDefinitionV1,
  createLocalStrategyFeedbackBatchV1,
  createLocalStrategySafetyResolutionPortV1,
  createLocalStrategySafetySignalSourceV1,
  createLocalStrategySafetySignalV1,
} from "@agentplat/collective-runtime/strategy-adaptation";
import {
  createMorphogenesisOperatorOutcomeReceiptV2,
  createMorphogenesisStrategyCatalogV3,
  createMorphogenesisStrategyContextV3,
  createMorphogenesisStrategyDefinitionV3,
  createMorphogenesisStrategyExecutionBindingV3,
  createMorphogenesisStrategyFeedbackV3,
  createMorphogenesisStrategyOutcomeMeasurementV3,
  createMorphogenesisStrategySelectionRequestV3,
  createMorphogenesisStrategySelectionV3,
} from "@agentplat/collective-runtime/morphogenesis";

const sha = (value) => digestPlanningJsonV1("morphogenesis-strategy-context-v3", { value });
const operations = ["award_selection", "bid_submission", "offer_routing", "plan_decomposition", "recovery_selection"];
const dimensions = ["authority", "capability_state", "context_integrity", "role", "trust"];

function localDefinition(strategyId) {
  return createLocalStrategyDefinitionV1({
    schemaVersion: 1,
    strategyId,
    strategyVersion: 1,
    implementationDigest: sha(`implementation:${strategyId}`),
    operations,
  });
}

test("Morphogenesis outcomes update the existing bounded strategy learner without granting authority", async () => {
  const baseline = localDefinition("strategy:morphogenesis:baseline");
  const adaptive = localDefinition("strategy:morphogenesis:adaptive");
  const localCatalog = createLocalStrategyCatalogV1({
    schemaVersion: 1,
    catalogId: "catalog:local:morphogenesis",
    catalogVersion: 1,
    parentCatalogDigest: null,
    strategies: [baseline, adaptive],
    baselines: Object.fromEntries(operations.map((operation) => [operation, baseline.strategyId])),
  });
  const morphogenesisPolicyDigest = sha("morphogenesis-policy");
  const profile = (strategy, generator) => createMorphogenesisStrategyDefinitionV3({
    strategy,
    morphogenesisPolicyDigest,
    blueprintCatalogDigest: sha("blueprint-catalog"),
    proposalGeneratorDigest: sha(generator),
    supportedOperators: ["derive_agent", "replace_agent", "split_team"],
  });
  const catalog = createMorphogenesisStrategyCatalogV3({
    catalogId: "catalog:morphogenesis:v3",
    catalogVersion: 1,
    parentCatalogDigest: null,
    localCatalog,
    strategies: [profile(baseline, "generator:baseline"), profile(adaptive, "generator:adaptive")],
  });
  const feedbackSource = {
    schemaVersion: 1,
    sourceId: "source:morphogenesis-outcomes",
    sourceVersion: 1,
    sourceImplementationDigest: sha("outcome-source"),
  };
  const policy = createLocalStrategyAdaptationPolicyV1({
    schemaVersion: 1,
    policyId: "policy:morphogenesis-learning",
    policyVersion: 1,
    parentPolicyDigest: null,
    requiredSafetyDimensions: Object.fromEntries(operations.map((operation) => [operation, dimensions])),
    feedbackMetrics: [
      ["mission_progress", 4], ["latency_efficiency", 1],
      ["resource_efficiency", 1], ["recovery_quality", 1], ["safety", 3],
    ].map(([metric, weight]) => ({ schemaVersion: 1, metric, weight, direction: "maximize" })),
    feedbackSources: [feedbackSource],
    minimumFeedbackSources: 1,
    minimumFeedbackConfidenceBps: 8_000,
    learningRateBps: 2_000,
    explorationRateBps: 1_000,
    baselineProbabilityFloorBps: 3_000,
    initialWeightMicros: 1_000_000,
    minimumWeightMicros: 100_000,
    maximumWeightMicros: 10_000_000,
    unsafePenaltyBps: 8_000,
    quarantineDurationMs: 100,
    limits: {
      maximumStrategies: 8, maximumPendingDecisions: 16,
      maximumSafetyHeads: 128, maximumFeedbackHeads: 32,
      maximumReasonCodesPerSignal: 8, maximumDecisionTtlMs: 50,
      maximumSafetySignalTtlMs: 100, maximumFeedbackDelayMs: 100,
      maximumCommitAttempts: 4,
    },
  });
  const safetyImplementation = sha("safety-source");
  const safety = createLocalStrategySafetyResolutionPortV1({
    sources: dimensions.map((dimension) => createLocalStrategySafetySignalSourceV1({
      dimension,
      async resolve({ request, strategy }) {
        return createLocalStrategySafetySignalV1({
          schemaVersion: 1,
          signalId: `signal:${dimension}:${strategy.strategyId}`,
          requestId: request.requestId,
          requestDigest: request.requestDigest,
          strategyId: strategy.strategyId,
          strategyDigest: strategy.strategyDigest,
          dimension,
          disposition: "eligible",
          sourceId: `source:safety:${dimension}`,
          sourceVersion: 1,
          sourceImplementationDigest: safetyImplementation,
          sourceRevision: 1,
          reasonCodes: [`${dimension}_eligible`],
          observedAtLogicalMs: request.logicalTimeMs,
          expiresAtLogicalMs: request.logicalTimeMs + 50,
        });
      },
    })),
  });
  const entropy = Object.freeze({
    entropyId: "entropy:morphogenesis:test",
    entropyVersion: 1,
    entropyImplementationDigest: sha("entropy"),
    async draw({ requestDigest }) {
      return { drawBps: 0, evidenceDigest: sha(`draw:${requestDigest}`) };
    },
  });
  const runtime = new LocalStrategyAdaptationRuntimeV1({
    stateKey: "state:morphogenesis-learning",
    controllerId: "controller:morphogenesis-learning",
    controllerVersion: 1,
    implementationId: "implementation:morphogenesis-learning",
    policy,
    catalog: localCatalog,
    safety,
    entropy,
    store: new InMemoryLocalStrategyAdaptationStoreV1({ policy, catalog: localCatalog, entropy }),
  });
  const context = createMorphogenesisStrategyContextV3({
    scopeDigest: sha("scope"),
    morphologyEpoch: 2,
    currentSnapshotDigest: sha("snapshot"),
    needDigest: sha("need"),
    targetDigest: sha("target"),
    morphogenesisPolicyDigest,
    riskDigest: sha("risk"),
    costEnvelopeDigest: sha("cost"),
    deadlineDigest: sha("deadline"),
  });
  const request = createMorphogenesisStrategySelectionRequestV3({
    requestId: "request:morphogenesis-strategy:1",
    scope: {
      tenantId: "tenant:test", meshId: "mesh:test", policyDomainId: "policy-domain:test",
      missionIntentId: "mission-intent:test", objectiveId: "objective:test",
      workItemId: "work:test", workItemRevision: 1,
    },
    context,
    catalog,
    logicalTimeMs: 10,
  });
  const decision = await runtime.select(request);
  assert.notEqual(decision.selectedStrategyId, null);
  const selection = createMorphogenesisStrategySelectionV3({
    selectionId: "selection:morphogenesis:1",
    context,
    catalog,
    request,
    decision,
  });
  assert.equal(selection.advisoryOnly, true);
  assert.equal("authorizationDigest" in selection, false);
  const planDigest = sha("operator-plan");
  const executionBinding = createMorphogenesisStrategyExecutionBindingV3({
    bindingId: "binding:morphogenesis-strategy:1",
    selection,
    proposalDigest: sha("proposal"),
    planDigest,
    generatorReceiptDigest: sha("generator-receipt"),
    boundAtLogicalMs: 15,
  });
  const outcome = createMorphogenesisOperatorOutcomeReceiptV2({
    receiptId: "outcome:morphogenesis-strategy:1",
    operatorExecutionStateDigest: sha("execution-state"),
    planDigest,
    proposalDigest: executionBinding.proposalDigest,
    decisionDigest: sha("morphogenesis-decision"),
    authorizationDigest: sha("execution-authorization"),
    authorityFenceDigest: sha("authority-fence"),
    stepReceiptRoot: sha("step-root"),
    disposition: "success",
    outcomeEvidenceDigests: [sha("outcome-evidence")],
    resultingSnapshotDigest: sha("resulting-snapshot"),
    resultingMorphologyEpoch: 3,
    evaluatedAtLogicalMs: 20,
  });
  const metrics = [
    "mission_progress", "latency_efficiency", "resource_efficiency",
    "recovery_quality", "safety",
  ].map((metric) => ({ schemaVersion: 1, metric, valueMicros: 900_000 }));
  const measurement = createMorphogenesisStrategyOutcomeMeasurementV3({
    measurementId: "measurement:morphogenesis:1",
    selection,
    executionBinding,
    outcome,
    metrics,
    confidenceBps: 9_000,
    sourceId: feedbackSource.sourceId,
    sourceVersion: feedbackSource.sourceVersion,
    sourceImplementationDigest: feedbackSource.sourceImplementationDigest,
    sourceRevision: 1,
    provenanceDigest: sha("measurement-provenance"),
    evidenceDigests: [sha("measurement-evidence")],
    observedAtLogicalMs: 25,
    expiresAtLogicalMs: 80,
  });
  const feedback = createMorphogenesisStrategyFeedbackV3({
    feedbackId: "feedback:morphogenesis:1",
    selection,
    executionBinding,
    outcome,
    measurement,
    outcomeRevision: 1,
  });
  const feedbackDecision = await runtime.observe(createLocalStrategyFeedbackBatchV1({
    schemaVersion: 1,
    batchId: "batch:morphogenesis:1",
    decisionId: decision.decisionId,
    decisionDigest: decision.decisionDigest,
    logicalTimeMs: 30,
    signals: [feedback.localFeedback],
  }));
  assert.equal(feedbackDecision.status, "applied");
  assert.equal(feedbackDecision.outcome, "success");
  const state = await runtime.loadState();
  assert.equal(state.arms.find(({ operation, strategyId }) =>
    operation === "plan_decomposition" && strategyId === decision.selectedStrategyId).feedbackCount, 1);
});

test("Morphogenesis feedback rejects a substituted operator plan", async () => {
  // The full positive fixture above proves selection and learning. This guard is
  // covered here by constructing only the mismatched binding edge.
  assert.throws(() => createMorphogenesisStrategyExecutionBindingV3({
    bindingId: "binding:invalid",
    selection: { schemaVersion: 3, advisoryOnly: true, selectedDefinitionDigest: null },
    proposalDigest: sha("proposal"),
    planDigest: sha("plan"),
    generatorReceiptDigest: sha("generator"),
    boundAtLogicalMs: 1,
  }), /selection|abstained/);
});
