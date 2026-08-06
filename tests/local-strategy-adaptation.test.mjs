import assert from "node:assert/strict";
import test from "node:test";

import { digestPlanningJsonV1 } from "@agentplat/collective-planning";
import {
  InMemoryLocalStrategyAdaptationStoreV1,
  LocalStrategyAdaptationRuntimeV1,
  LocalStrategyDispatcherV1,
  createDeterministicLocalStrategyEntropyV1,
  createLocalStrategyAdaptationPolicyV1,
  createLocalStrategyAuthoritySafetySignalV1,
  createLocalStrategyCapabilitySafetySignalV1,
  createLocalStrategyCatalogV1,
  createLocalStrategyContextIntegritySafetySignalV1,
  createLocalStrategyCollectivePriorV1,
  createLocalStrategyDefinitionV1,
  createLocalStrategyFeedbackBatchV1,
  createLocalStrategyFeedbackSignalV1,
  createLocalStrategyRoleSafetySignalV1,
  createLocalStrategySafetyResolutionPortV1,
  createLocalStrategySafetySignalSourceV1,
  createLocalStrategySafetySignalV1,
  createLocalStrategySelectionRequestV1,
  createLocalStrategyTrustSafetySignalV1,
  validateLocalStrategyAdaptationStateV1,
  validateLocalStrategySelectionDecisionV1,
} from "@agentplat/collective-runtime/strategy-adaptation";

const operations = [
  "award_selection",
  "bid_submission",
  "offer_routing",
  "plan_decomposition",
  "recovery_selection",
];
const dimensions = [
  "authority",
  "capability_state",
  "context_integrity",
  "role",
  "trust",
];
const feedbackImplementation = digestPlanningJsonV1(
  "local-strategy-feedback-head",
  { implementation: "test-feedback" },
);
const safetyImplementation = digestPlanningJsonV1(
  "local-strategy-safety-head",
  { implementation: "test-safety" },
);
const entropyImplementation = digestPlanningJsonV1(
  "local-strategy-entropy-draw",
  { implementation: "test-entropy" },
);

function definition(strategyId) {
  return createLocalStrategyDefinitionV1({
    schemaVersion: 1,
    strategyId,
    strategyVersion: 1,
    implementationDigest: digestPlanningJsonV1("local-strategy-definition", {
      strategyId,
    }),
    operations,
  });
}

const adaptive = definition("strategy.adaptive");
const baseline = definition("strategy.baseline");
const catalog = createLocalStrategyCatalogV1({
  schemaVersion: 1,
  catalogId: "strategy-catalog",
  catalogVersion: 1,
  parentCatalogDigest: null,
  strategies: [baseline, adaptive],
  baselines: {
    plan_decomposition: baseline.strategyId,
    offer_routing: baseline.strategyId,
    bid_submission: baseline.strategyId,
    award_selection: baseline.strategyId,
    recovery_selection: baseline.strategyId,
  },
});

const requiredSafetyDimensions = Object.fromEntries(
  operations.map((operation) => [operation, dimensions]),
);
const policy = createLocalStrategyAdaptationPolicyV1({
  schemaVersion: 1,
  policyId: "strategy-policy",
  policyVersion: 1,
  parentPolicyDigest: null,
  requiredSafetyDimensions,
  feedbackMetrics: [
    {
      schemaVersion: 1,
      metric: "mission_progress",
      weight: 4,
      direction: "maximize",
    },
    {
      schemaVersion: 1,
      metric: "latency_efficiency",
      weight: 1,
      direction: "maximize",
    },
    {
      schemaVersion: 1,
      metric: "resource_efficiency",
      weight: 1,
      direction: "maximize",
    },
    {
      schemaVersion: 1,
      metric: "recovery_quality",
      weight: 1,
      direction: "maximize",
    },
    {
      schemaVersion: 1,
      metric: "safety",
      weight: 3,
      direction: "maximize",
    },
  ],
  feedbackSources: ["feedback.a", "feedback.b", "feedback.c"].map(
    (sourceId) => ({
      schemaVersion: 1,
      sourceId,
      sourceVersion: 1,
      sourceImplementationDigest: feedbackImplementation,
    }),
  ),
  minimumFeedbackSources: 3,
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
    maximumStrategies: 8,
    maximumPendingDecisions: 16,
    maximumSafetyHeads: 128,
    maximumFeedbackHeads: 16,
    maximumReasonCodesPerSignal: 8,
    maximumDecisionTtlMs: 50,
    maximumSafetySignalTtlMs: 100,
    maximumFeedbackDelayMs: 100,
    maximumCommitAttempts: 4,
  },
});

function request({
  id = "request.1",
  operation = "offer_routing",
  logicalTimeMs = 10,
} = {}) {
  return createLocalStrategySelectionRequestV1({
    schemaVersion: 1,
    requestId: id,
    operation,
    scope: {
      tenantId: "tenant",
      meshId: "mesh",
      policyDomainId: "policy-domain",
      missionIntentId: "mission-intent",
      objectiveId: "objective",
      workItemId: "work",
      workItemRevision: 1,
    },
    logicalTimeMs,
    contextDigest: digestPlanningJsonV1("local-strategy-selection-request", {
      id,
      context: true,
    }),
    availableStrategyIds: [adaptive.strategyId, baseline.strategyId],
  });
}

function safetyResolver({ overrides = new Map() } = {}) {
  return createLocalStrategySafetyResolutionPortV1({
    sources: dimensions.map((dimension) =>
      createLocalStrategySafetySignalSourceV1({
        dimension,
        async resolve({ request: currentRequest, strategy }) {
          const disposition =
            overrides.get(`${strategy.strategyId}:${dimension}`) ?? "eligible";
          return createLocalStrategySafetySignalV1({
            schemaVersion: 1,
            signalId: `signal.${dimension}.${strategy.strategyId}.${currentRequest.logicalTimeMs}`,
            requestId: currentRequest.requestId,
            requestDigest: currentRequest.requestDigest,
            strategyId: strategy.strategyId,
            strategyDigest: strategy.strategyDigest,
            dimension,
            disposition,
            sourceId: `safety.${dimension}`,
            sourceVersion: 1,
            sourceImplementationDigest: safetyImplementation,
            sourceRevision: currentRequest.logicalTimeMs,
            reasonCodes: [`${dimension}_${disposition}`],
            observedAtLogicalMs: currentRequest.logicalTimeMs,
            expiresAtLogicalMs: currentRequest.logicalTimeMs + 50,
          });
        },
      }),
    ),
  });
}

function fixedEntropy(drawBps) {
  return Object.freeze({
    entropyId: "entropy.fixed",
    entropyVersion: 1,
    entropyImplementationDigest: entropyImplementation,
    async draw({ requestDigest }) {
      return Object.freeze({
        drawBps,
        evidenceDigest: digestPlanningJsonV1("local-strategy-entropy-draw", {
          drawBps,
          requestDigest,
        }),
      });
    },
  });
}

function runtime({
  stateKey = "strategy-state",
  entropy = fixedEntropy(2_500),
  safety = safetyResolver(),
  store = new InMemoryLocalStrategyAdaptationStoreV1({
    policy,
    catalog,
    entropy,
  }),
  collectivePrior,
} = {}) {
  return new LocalStrategyAdaptationRuntimeV1({
    stateKey,
    controllerId: "strategy-controller",
    controllerVersion: 1,
    implementationId: "strategy-controller-implementation",
    policy,
    catalog,
    safety,
    entropy,
    store,
    ...(collectivePrior ? { collectivePrior } : {}),
  });
}

function feedbackSignal({
  decision,
  sourceId,
  sourceRevision = 1,
  outcome = "success",
  valueMicros = 900_000,
  safetyMicros = 1_000_000,
  outcomeId = "outcome.1",
  logicalTimeMs = 11,
}) {
  const pendingContext = digestPlanningJsonV1(
    "local-strategy-selection-request",
    { id: decision.requestId, context: true },
  );
  return createLocalStrategyFeedbackSignalV1({
    schemaVersion: 1,
    feedbackId: `${sourceId}.${sourceRevision}.${valueMicros}.${outcome}`,
    decisionId: decision.decisionId,
    decisionDigest: decision.decisionDigest,
    requestId: decision.requestId,
    requestDigest: decision.requestDigest,
    operation: decision.operation,
    strategyId: decision.selectedStrategyId,
    strategyDigest: decision.selectedStrategyDigest,
    contextDigest: pendingContext,
    outcomeId,
    outcomeRevision: 1,
    outcome,
    metrics: [
      { schemaVersion: 1, metric: "mission_progress", valueMicros },
      { schemaVersion: 1, metric: "latency_efficiency", valueMicros },
      { schemaVersion: 1, metric: "resource_efficiency", valueMicros },
      { schemaVersion: 1, metric: "recovery_quality", valueMicros },
      { schemaVersion: 1, metric: "safety", valueMicros: safetyMicros },
    ],
    confidenceBps: 9_000,
    sourceId,
    sourceVersion: 1,
    sourceImplementationDigest: feedbackImplementation,
    sourceRevision,
    provenanceDigest: digestPlanningJsonV1("local-strategy-feedback-signal", {
      sourceId,
      outcomeId,
    }),
    observedAtLogicalMs: logicalTimeMs,
    expiresAtLogicalMs: logicalTimeMs + 50,
  });
}

function batch(decision, signals, logicalTimeMs = 11, batchId = "batch.1") {
  return createLocalStrategyFeedbackBatchV1({
    schemaVersion: 1,
    batchId,
    decisionId: decision.decisionId,
    decisionDigest: decision.decisionDigest,
    logicalTimeMs,
    signals,
  });
}

test("selects from an exact bounded distribution and preserves a baseline floor", async () => {
  const controller = runtime();
  const decision = await controller.select(request());
  assert.equal(decision.selectedStrategyId, adaptive.strategyId);
  assert.equal(
    decision.probabilities.reduce(
      (sum, probability) => sum + probability.probabilityBps,
      0,
    ),
    10_000,
  );
  assert.ok(
    decision.probabilities.find(
      ({ strategyId }) => strategyId === baseline.strategyId,
    ).probabilityBps >= policy.policy.baselineProbabilityFloorBps,
  );
  assert.equal(
    validateLocalStrategySelectionDecisionV1(decision).decisionDigest,
    decision.decisionDigest,
  );
  assert.throws(
    () =>
      validateLocalStrategySelectionDecisionV1({
        ...decision,
        selectedStrategyId: "strategy.injected",
      }),
    /absent from the probability distribution|digest is invalid/,
  );
});

test("applies a bounded collective prior without overriding the baseline floor", async () => {
  const currentRequest = request();
  const priorImplementationDigest = digestPlanningJsonV1(
    "local-strategy-collective-prior",
    { implementation: "collective-evidence-source" },
  );
  const prior = createLocalStrategyCollectivePriorV1({
    schemaVersion: 1,
    requestId: currentRequest.requestId,
    requestDigest: currentRequest.requestDigest,
    operation: currentRequest.operation,
    strategyId: adaptive.strategyId,
    strategyDigest: adaptive.strategyDigest,
    sourceId: "collective-evidence",
    sourceVersion: 1,
    sourceImplementationDigest: priorImplementationDigest,
    certificateDigest: digestPlanningJsonV1(
      "peer-strategy-evidence-certificate",
      { certificate: "adaptive" },
    ),
    outcome: "success",
    scoreMicros: 1_000_000,
    confidenceBps: 10_000,
    requestedInfluenceBps: 4_000,
    observedAtLogicalMs: 9,
    expiresAtLogicalMs: 50,
  });
  const controller = runtime({
    entropy: fixedEntropy(5_500),
    collectivePrior: {
      configuration: {
        sourceId: "collective-evidence",
        sourceVersion: 1,
        sourceImplementationDigest: priorImplementationDigest,
        minimumConfidenceBps: 8_000,
        maximumInfluenceBps: 2_000,
        maximumPriorTtlMs: 100,
      },
      source: {
        sourceId: "collective-evidence",
        sourceVersion: 1,
        sourceImplementationDigest: priorImplementationDigest,
        async resolve() {
          return [prior];
        },
      },
    },
  });
  const decision = await controller.select(currentRequest);
  const adaptiveProbability = decision.probabilities.find(
    ({ strategyId }) => strategyId === adaptive.strategyId,
  );
  const baselineProbability = decision.probabilities.find(
    ({ strategyId }) => strategyId === baseline.strategyId,
  );
  assert.equal(decision.selectedStrategyId, adaptive.strategyId);
  assert.equal(adaptiveProbability.probabilityBps, 6_000);
  assert.equal(baselineProbability.probabilityBps, 4_000);
  assert.deepEqual(adaptiveProbability.priorDigests, [prior.priorDigest]);
  assert.ok(decision.reasonCodes.includes("collective_prior_applied"));
});

test("abstains when a required safety dimension cannot admit the baseline", async () => {
  const safety = createLocalStrategySafetyResolutionPortV1({
    sources: dimensions
      .filter((dimension) => dimension !== "trust")
      .map((dimension) =>
        createLocalStrategySafetySignalSourceV1({
          dimension,
          async resolve({ request: currentRequest, strategy }) {
            return createLocalStrategySafetySignalV1({
              schemaVersion: 1,
              signalId: `signal.${dimension}.${strategy.strategyId}`,
              requestId: currentRequest.requestId,
              requestDigest: currentRequest.requestDigest,
              strategyId: strategy.strategyId,
              strategyDigest: strategy.strategyDigest,
              dimension,
              disposition: "eligible",
              sourceId: `safety.${dimension}`,
              sourceVersion: 1,
              sourceImplementationDigest: safetyImplementation,
              sourceRevision: 1,
              reasonCodes: [`${dimension}_eligible`],
              observedAtLogicalMs: 10,
              expiresAtLogicalMs: 60,
            });
          },
        }),
      ),
  });
  const decision = await runtime({ safety }).select(
    request({ id: "request.missing-safety" }),
  );
  assert.equal(decision.mode, "abstain");
  assert.equal(decision.selectedStrategyId, null);
  assert.ok(decision.reasonCodes.includes("safe_baseline_unavailable"));
});

test("replays deterministic entropy exactly from the same seed and state", async () => {
  const entropy = createDeterministicLocalStrategyEntropyV1({
    entropyId: "entropy.replay",
    entropyVersion: 1,
    entropyImplementationDigest: entropyImplementation,
    seedDigest: digestPlanningJsonV1("local-strategy-entropy-draw", {
      seed: "replay",
    }),
  });
  const left = runtime({ stateKey: "state.replay", entropy });
  const right = runtime({ stateKey: "state.replay", entropy });
  const currentRequest = request({ id: "request.replay" });
  const [leftDecision, rightDecision] = await Promise.all([
    left.select(currentRequest),
    right.select(currentRequest),
  ]);
  assert.equal(leftDecision.decisionDigest, rightDecision.decisionDigest);
  assert.equal(
    leftDecision.entropyEvidenceDigest,
    rightDecision.entropyEvidenceDigest,
  );
});

test("learns only from a causal independent-source median", async () => {
  const controller = runtime();
  const decision = await controller.select(request());
  const signals = [
    feedbackSignal({ decision, sourceId: "feedback.a", valueMicros: 950_000 }),
    feedbackSignal({ decision, sourceId: "feedback.b", valueMicros: 900_000 }),
    feedbackSignal({ decision, sourceId: "feedback.c", valueMicros: 0 }),
  ];
  const observed = await controller.observe(batch(decision, signals));
  assert.equal(observed.status, "applied");
  assert.equal(observed.rewardMicros, 930_000);
  const state = await controller.loadState();
  const arm = state.arms.find(
    ({ operation, strategyId }) =>
      operation === "offer_routing" && strategyId === adaptive.strategyId,
  );
  assert.ok(arm.weightMicros > policy.policy.initialWeightMicros);
  assert.equal(arm.feedbackCount, 1);
  const replay = await controller.observe(batch(decision, signals));
  assert.equal(replay.status, "idempotent");
});

test("keeps insufficient feedback pending and rejects causal substitution", async () => {
  const controller = runtime();
  const decision = await controller.select(request());
  const one = feedbackSignal({ decision, sourceId: "feedback.a" });
  const pending = await controller.observe(batch(decision, [one]));
  assert.equal(pending.status, "pending_sources");
  const bad = {
    ...one,
    requestDigest: digestPlanningJsonV1("local-strategy-selection-request", {
      bad: true,
    }),
  };
  assert.throws(
    () => batch(decision, [bad], 12, "batch.bad"),
    /feedback signal digest is invalid/,
  );
});

test("equivocating feedback quarantines the selected strategy", async () => {
  const controller = runtime();
  const decision = await controller.select(request());
  const first = feedbackSignal({ decision, sourceId: "feedback.a" });
  await controller.observe(batch(decision, [first]));
  const conflict = feedbackSignal({
    decision,
    sourceId: "feedback.a",
    valueMicros: 100_000,
  });
  const rejected = await controller.observe(
    batch(
      decision,
      [
        conflict,
        feedbackSignal({ decision, sourceId: "feedback.b" }),
        feedbackSignal({ decision, sourceId: "feedback.c" }),
      ],
      12,
      "batch.conflict",
    ),
  );
  assert.equal(rejected.status, "rejected");
  assert.ok(rejected.reasonCodes.includes("feedback_equivocation:feedback.a"));
  const state = await controller.loadState();
  const arm = state.arms.find(
    ({ operation, strategyId }) =>
      operation === "offer_routing" && strategyId === adaptive.strategyId,
  );
  assert.ok(arm.quarantinedUntilLogicalMs > 12);
});

test("unsafe feedback rolls back to baseline and unsafe baseline pauses", async () => {
  const adaptiveController = runtime();
  const adaptiveDecision = await adaptiveController.select(request());
  const unsafeSignals = ["feedback.a", "feedback.b", "feedback.c"].map(
    (sourceId) =>
      feedbackSignal({
        decision: adaptiveDecision,
        sourceId,
        outcome: "unsafe",
        valueMicros: 0,
        safetyMicros: 0,
      }),
  );
  const unsafe = await adaptiveController.observe(
    batch(adaptiveDecision, unsafeSignals),
  );
  assert.ok(unsafe.reasonCodes.includes("operation_rolled_back_to_baseline"));
  const baselineDecision = await adaptiveController.select(
    request({ id: "request.after-unsafe", logicalTimeMs: 20 }),
  );
  assert.equal(baselineDecision.selectedStrategyId, baseline.strategyId);

  const baselineController = runtime({ entropy: fixedEntropy(7_500) });
  const selectedBaseline = await baselineController.select(
    request({ id: "request.baseline" }),
  );
  assert.equal(selectedBaseline.selectedStrategyId, baseline.strategyId);
  const baselineUnsafe = ["feedback.a", "feedback.b", "feedback.c"].map(
    (sourceId) =>
      feedbackSignal({
        decision: selectedBaseline,
        sourceId,
        outcome: "unsafe",
        valueMicros: 0,
        safetyMicros: 0,
      }),
  );
  await baselineController.observe(batch(selectedBaseline, baselineUnsafe));
  const abstained = await baselineController.select(
    request({ id: "request.paused", logicalTimeMs: 20 }),
  );
  assert.equal(abstained.mode, "abstain");
  assert.ok(abstained.reasonCodes.includes("operation_paused"));
});

test("exports and imports one predecessor-bound handoff", async () => {
  const source = runtime({ stateKey: "state.source" });
  await source.select(request({ id: "request.handoff" }));
  const handoff = await source.exportHandoff({
    targetStateKey: "state.target",
    logicalTimeMs: 12,
  });
  const entropy = fixedEntropy(2_500);
  const targetStore = new InMemoryLocalStrategyAdaptationStoreV1({
    policy,
    catalog,
    entropy,
  });
  const target = runtime({
    stateKey: "state.target",
    entropy,
    store: targetStore,
  });
  const restored = await target.importHandoff({ handoff, logicalTimeMs: 12 });
  assert.equal(restored.predecessorStateDigest, handoff.sourceStateDigest);
  assert.equal(restored.entropyCounter, handoff.sourceState.entropyCounter);
  assert.equal(
    validateLocalStrategyAdaptationStateV1(restored, {
      policy,
      catalog,
      entropy,
    }).stateDigest,
    restored.stateDigest,
  );
  assert.equal(
    (await target.importHandoff({ handoff, logicalTimeMs: 13 })).stateDigest,
    restored.stateDigest,
  );
});

test("control adapters never widen negative upstream decisions", () => {
  const currentRequest = request();
  const common = {
    request: currentRequest,
    strategy: adaptive,
    binding: {
      signalId: "adapter.signal",
      sourceId: "adapter.source",
      sourceVersion: 1,
      sourceImplementationDigest: safetyImplementation,
      sourceRevision: 1,
      observedAtLogicalMs: 10,
      expiresAtLogicalMs: 20,
    },
  };
  assert.equal(
    createLocalStrategyTrustSafetySignalV1({
      ...common,
      trustDisposition: "quarantined",
    }).disposition,
    "ineligible",
  );
  assert.equal(
    createLocalStrategyRoleSafetySignalV1({
      ...common,
      disposition: "allow",
      stateStatus: "active",
      degraded: true,
    }).disposition,
    "restricted",
  );
  assert.equal(
    createLocalStrategyCapabilitySafetySignalV1({
      ...common,
      capabilityDisposition: "unavailable",
    }).disposition,
    "unavailable",
  );
  assert.equal(
    createLocalStrategyContextIntegritySafetySignalV1({
      ...common,
      disposition: "abstain",
      stateStatus: "paused",
      degraded: true,
    }).disposition,
    "unavailable",
  );
  assert.equal(
    createLocalStrategyAuthoritySafetySignalV1({
      ...common,
      current: true,
      authorized: false,
    }).disposition,
    "ineligible",
  );
});

test("dispatches all five explicit coordination seams without inferring authority", async () => {
  const controller = runtime();
  const calls = [];
  const implementations = [adaptive, baseline].map((current) => ({
    definition: current,
    async execute({ operation }) {
      calls.push(`${current.strategyId}:${operation}`);
      return { operation };
    },
  }));
  const dispatcher = new LocalStrategyDispatcherV1({
    adaptation: controller,
    catalog,
    implementations,
  });
  const methods = [
    ["dispatchAwardSelection", "award_selection"],
    ["dispatchBidSubmission", "bid_submission"],
    ["dispatchOfferRouting", "offer_routing"],
    ["dispatchPlanDecomposition", "plan_decomposition"],
    ["dispatchRecoverySelection", "recovery_selection"],
  ];
  for (const [index, [method, operation]] of methods.entries()) {
    const currentRequest = request({
      id: `request.dispatch.${index}`,
      operation,
      logicalTimeMs: 20 + index,
    });
    const result = await dispatcher[method](currentRequest, {
      candidateIds: [],
    });
    assert.equal(result.status, "executed");
    assert.deepEqual(result.result, { operation });
  }
  assert.equal(calls.length, 5);
});

test("bounds retained pending state and abstains before untracked learning", async () => {
  const controller = runtime();
  for (let index = 0; index < 16; index += 1) {
    const decision = await controller.select(
      request({
        id: `request.pending.${index}`,
        logicalTimeMs: 10 + index,
      }),
    );
    assert.notEqual(decision.selectedStrategyId, null);
  }
  const bounded = await controller.select(
    request({ id: "request.pending.full", logicalTimeMs: 26 }),
  );
  assert.equal(bounded.mode, "abstain");
  assert.ok(bounded.reasonCodes.includes("pending_decision_capacity_exceeded"));
  assert.equal((await controller.loadState()).pendingDecisions.length, 16);
});
