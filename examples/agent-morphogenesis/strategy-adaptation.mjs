import { createHash } from "node:crypto";

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
  InMemoryMorphogenesisStrategyGovernanceStoreV3,
  MorphogenesisStrategyGovernanceRuntimeV3,
  createMorphogenesisOperatorOutcomeReceiptV2,
  createMorphogenesisStrategyCatalogV3,
  createMorphogenesisStrategyContextV3,
  createMorphogenesisStrategyDefinitionV3,
  createMorphogenesisStrategyExecutionBindingV3,
  createMorphogenesisStrategyFeedbackV3,
  createMorphogenesisStrategyGovernancePolicyV3,
  createMorphogenesisStrategyOutcomeMeasurementV3,
  createMorphogenesisStrategyReviewV3,
  createMorphogenesisStrategySelectionRequestV3,
  createMorphogenesisStrategySelectionV3,
} from "@agentplat/collective-runtime/morphogenesis";

const digest = (value) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;
const operations = ["award_selection", "bid_submission", "offer_routing", "plan_decomposition", "recovery_selection"];
const dimensions = ["authority", "capability_state", "context_integrity", "role", "trust"];
const strategy = (strategyId) => createLocalStrategyDefinitionV1({
  schemaVersion: 1,
  strategyId,
  strategyVersion: 1,
  implementationDigest: digest(`implementation:${strategyId}`),
  operations,
});
const adaptive = strategy("strategy:morphogenesis:adaptive");
const baseline = strategy("strategy:morphogenesis:baseline");
const localCatalog = createLocalStrategyCatalogV1({
  schemaVersion: 1,
  catalogId: "catalog:local:morphogenesis-example",
  catalogVersion: 1,
  parentCatalogDigest: null,
  strategies: [baseline, adaptive],
  baselines: Object.fromEntries(operations.map((operation) => [operation, baseline.strategyId])),
});
const morphogenesisPolicyDigest = digest("morphogenesis-policy");
const catalog = createMorphogenesisStrategyCatalogV3({
  catalogId: "catalog:morphogenesis:v3:example",
  catalogVersion: 1,
  parentCatalogDigest: null,
  localCatalog,
  strategies: [baseline, adaptive].map((item) =>
    createMorphogenesisStrategyDefinitionV3({
      strategy: item,
      morphogenesisPolicyDigest,
      blueprintCatalogDigest: digest("blueprint-catalog"),
      proposalGeneratorDigest: digest(`generator:${item.strategyId}`),
      supportedOperators: ["derive_agent", "replace_agent", "split_team"],
    })),
});
const feedbackSource = {
  schemaVersion: 1,
  sourceId: "source:morphogenesis-example",
  sourceVersion: 1,
  sourceImplementationDigest: digest("outcome-source"),
};
const policy = createLocalStrategyAdaptationPolicyV1({
  schemaVersion: 1,
  policyId: "policy:morphogenesis-strategy-example",
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
  explorationRateBps: 10_000,
  baselineProbabilityFloorBps: 1_000,
  initialWeightMicros: 1_000_000,
  minimumWeightMicros: 100_000,
  maximumWeightMicros: 10_000_000,
  unsafePenaltyBps: 8_000,
  quarantineDurationMs: 100,
  limits: {
    maximumStrategies: 8, maximumPendingDecisions: 16,
    maximumSafetyHeads: 128, maximumFeedbackHeads: 16,
    maximumReasonCodesPerSignal: 8, maximumDecisionTtlMs: 50,
    maximumSafetySignalTtlMs: 100, maximumFeedbackDelayMs: 100,
    maximumCommitAttempts: 4,
  },
});
const safety = createLocalStrategySafetyResolutionPortV1({
  sources: dimensions.map((dimension) => createLocalStrategySafetySignalSourceV1({
    dimension,
    async resolve({ request, strategy: item }) {
      return createLocalStrategySafetySignalV1({
        schemaVersion: 1,
        signalId: `signal:${dimension}:${item.strategyId}`,
        requestId: request.requestId,
        requestDigest: request.requestDigest,
        strategyId: item.strategyId,
        strategyDigest: item.strategyDigest,
        dimension,
        disposition: "eligible",
        sourceId: `source:${dimension}`,
        sourceVersion: 1,
        sourceImplementationDigest: digest(`source:${dimension}`),
        sourceRevision: 1,
        reasonCodes: [`${dimension}_eligible`],
        observedAtLogicalMs: 10,
        expiresAtLogicalMs: 50,
      });
    },
  })),
});
const entropy = Object.freeze({
  entropyId: "entropy:morphogenesis-example",
  entropyVersion: 1,
  entropyImplementationDigest: digest("entropy"),
  async draw() { return { drawBps: 0, evidenceDigest: digest("draw") }; },
});
const learner = new LocalStrategyAdaptationRuntimeV1({
  stateKey: "state:morphogenesis-strategy-example",
  controllerId: "controller:morphogenesis-example",
  controllerVersion: 1,
  implementationId: "implementation:morphogenesis-example",
  policy,
  catalog: localCatalog,
  safety,
  entropy,
  store: new InMemoryLocalStrategyAdaptationStoreV1({
    policy, catalog: localCatalog, entropy,
  }),
});
const context = createMorphogenesisStrategyContextV3({
  scopeDigest: digest("scope"),
  morphologyEpoch: 1,
  currentSnapshotDigest: digest("snapshot"),
  needDigest: digest("need"),
  targetDigest: digest("target"),
  morphogenesisPolicyDigest,
  riskDigest: digest("risk"),
  costEnvelopeDigest: digest("cost"),
  deadlineDigest: digest("deadline"),
});
const request = createMorphogenesisStrategySelectionRequestV3({
  requestId: "request:morphogenesis-strategy-example",
  scope: {
    tenantId: "tenant:example", meshId: "mesh:example",
    policyDomainId: "policy-domain:example",
    missionIntentId: "mission-intent:example", objectiveId: "objective:example",
    workItemId: null, workItemRevision: null,
  },
  context,
  catalog,
  logicalTimeMs: 10,
});
const decision = await learner.select(request);
const selection = createMorphogenesisStrategySelectionV3({
  selectionId: "selection:morphogenesis-strategy-example",
  context,
  catalog,
  request,
  decision,
});
const planDigest = digest("operator-plan");
const executionBinding = createMorphogenesisStrategyExecutionBindingV3({
  bindingId: "binding:morphogenesis-strategy-example",
  selection,
  proposalDigest: digest("proposal"),
  planDigest,
  generatorReceiptDigest: digest("generator-receipt"),
  boundAtLogicalMs: 15,
});
const outcome = createMorphogenesisOperatorOutcomeReceiptV2({
  receiptId: "outcome:morphogenesis-strategy-example",
  operatorExecutionStateDigest: digest("execution-state"),
  planDigest,
  proposalDigest: executionBinding.proposalDigest,
  decisionDigest: digest("decision"),
  authorizationDigest: digest("authorization"),
  authorityFenceDigest: digest("authority-fence"),
  stepReceiptRoot: digest("step-receipts"),
  disposition: "success",
  outcomeEvidenceDigests: [digest("outcome-evidence")],
  resultingSnapshotDigest: digest("resulting-snapshot"),
  resultingMorphologyEpoch: 2,
  evaluatedAtLogicalMs: 20,
});
const measurement = createMorphogenesisStrategyOutcomeMeasurementV3({
  measurementId: "measurement:morphogenesis-strategy-example",
  selection,
  executionBinding,
  outcome,
  metrics: ["mission_progress", "latency_efficiency", "resource_efficiency",
    "recovery_quality", "safety"].map((metric) => ({
      schemaVersion: 1, metric, valueMicros: 900_000,
    })),
  confidenceBps: 9_000,
  sourceId: feedbackSource.sourceId,
  sourceVersion: feedbackSource.sourceVersion,
  sourceImplementationDigest: feedbackSource.sourceImplementationDigest,
  sourceRevision: 1,
  provenanceDigest: digest("measurement-provenance"),
  evidenceDigests: [digest("measurement-evidence")],
  observedAtLogicalMs: 25,
  expiresAtLogicalMs: 80,
});
const feedback = createMorphogenesisStrategyFeedbackV3({
  feedbackId: "feedback:morphogenesis-strategy-example",
  selection,
  outcome,
  measurement,
  outcomeRevision: 1,
});
const observed = await learner.observe(createLocalStrategyFeedbackBatchV1({
  schemaVersion: 1,
  batchId: "batch:morphogenesis-strategy-example",
  decisionId: decision.decisionId,
  decisionDigest: decision.decisionDigest,
  logicalTimeMs: 30,
  signals: [feedback.localFeedback],
}));
const governancePolicy = createMorphogenesisStrategyGovernancePolicyV3({
  schemaVersion: 3,
  policyId: "policy:morphogenesis-strategy-governance-example",
  policyVersion: 1,
  parentPolicyDigest: null,
  allowedActions: ["promote", "degrade", "retire", "rollback"],
  allowedReviewRoutes: ["authorized_agent", "authorized_person", "collective"],
  requireIndependentReviewer: true,
  minimumConfidenceBps: 8_000,
  cooldownMs: 5,
  transitionWindowMs: 100,
  maximumTransitionsPerWindow: 4,
  maximumPendingRecommendations: 4,
  maximumReviewHistory: 8,
  maximumTransitionHistory: 8,
  maximumCommitAttempts: 4,
});
const governance = new MorphogenesisStrategyGovernanceRuntimeV3({
  stateKey: "state:morphogenesis-strategy-governance-example",
  policy: governancePolicy,
  catalog,
  reviews: {
    async review({ recommendation, logicalTimeMs }) {
      return createMorphogenesisStrategyReviewV3({
        reviewId: "review:morphogenesis-strategy-example",
        recommendationId: recommendation.recommendationId,
        recommendationDigest: recommendation.recommendationDigest,
        route: "authorized_agent",
        actorType: "agent",
        actorId: "agent:independent-reviewer",
        actorMandateDigest: digest("reviewer-mandate"),
        independenceGroupId: "independence:reviewer",
        disposition: "approved",
        proofDigest: digest("review-proof"),
        reviewedAtLogicalMs: logicalTimeMs,
        expiresAtLogicalMs: logicalTimeMs + 10,
      });
    },
  },
  store: new InMemoryMorphogenesisStrategyGovernanceStoreV3(),
});
const recommendation = await governance.recommend({
  recommendationId: "recommendation:morphogenesis-strategy-example",
  action: "promote",
  targetStrategyId: decision.selectedStrategyId,
  replacementStrategyId: null,
  adaptationStateDigest: (await learner.loadState()).stateDigest,
  adaptationStateRevision: (await learner.loadState()).revision,
  evidenceDigests: [feedback.feedbackDigest],
  counterfactualDigest: null,
  riskDigest: context.riskDigest,
  costDigest: context.costEnvelopeDigest,
  confidenceBps: 9_000,
  proposerId: "agent:strategy-analyst",
  proposerImplementationDigest: digest("strategy-analyst"),
  reviewRoute: "authorized_agent",
  reasonCodes: ["observed_success"],
  proposedAtLogicalMs: 40,
  expiresAtLogicalMs: 60,
});
const governed = await governance.reviewAndApply({ recommendation, logicalTimeMs: 45 });

console.log(JSON.stringify({
  exampleOnly: true,
  selectedStrategyId: decision.selectedStrategyId,
  selectionMode: decision.mode,
  feedbackStatus: observed.status,
  activeStrategyId: governed.activeStrategyId,
  governanceAction: governed.transitions.at(-1).action,
  authorityGrantedBySelection: false,
  operationalImprovementClaimed: false,
}, null, 2));
