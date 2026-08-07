import assert from "node:assert/strict";
import test from "node:test";

import { digestPlanningJsonV1 } from "@agentplat/collective-planning";
import {
  createLocalStrategyDefinitionV1,
  createLocalStrategySelectionRequestV1,
} from "@agentplat/collective-runtime/strategy-adaptation";
import {
  InMemoryStrategyConvergenceStoreV1,
  StrategyConvergenceRuntimeV1,
  createStrategyConvergenceCycleFromEvidenceV1,
  createStrategyConvergenceCycleRequestV1,
  createStrategyConvergenceObservationFromCertificateV1,
  createStrategyConvergenceObservationV1,
  createStrategyConvergencePolicyV1,
  createStrategyConvergencePriorSourceV1,
  createStrategyConvergenceScopeV1,
  validateStrategyConvergenceCycleRequestV1,
  validateStrategyConvergenceObservationV1,
  validateStrategyConvergenceStateV1,
} from "@agentplat/collective-runtime/strategy-convergence";
import { createPeerStrategyEvidenceBindingV1 } from "@agentplat/collective-runtime/strategy-evidence-exchange";

const digest = (label) =>
  digestPlanningJsonV1("local-strategy-definition", { label });
const feedbackSchemaDigest = digest("feedback-schema");
const metrics = [
  "latency_efficiency",
  "mission_progress",
  "recovery_quality",
  "resource_efficiency",
  "safety",
].map((metric) => ({ schemaVersion: 1, metric, valueMicros: 800_000 }));

function definition(strategyId) {
  return createLocalStrategyDefinitionV1({
    schemaVersion: 1,
    strategyId,
    strategyVersion: 1,
    implementationDigest: digest(`implementation-${strategyId}`),
    operations: ["offer_routing"],
  });
}

const definitionA = definition("strategy.a");
const definitionB = definition("strategy.b");
const definitionC = definition("strategy.c");

function binding(strategy) {
  return createPeerStrategyEvidenceBindingV1({
    operation: "offer_routing",
    strategyId: strategy.strategyId,
    strategyDigest: strategy.strategyDigest,
    implementationDigest: strategy.implementationDigest,
    feedbackSchemaDigest,
  });
}

const bindingA = binding(definitionA);
const bindingB = binding(definitionB);
const bindingC = binding(definitionC);
const scope = createStrategyConvergenceScopeV1({
  tenantId: "tenant",
  meshId: "mesh",
  policyDomainId: "policy-domain",
  missionIntentId: "mission",
  objectiveId: "objective",
  cohortDigest: digest("cohort"),
  operation: "offer_routing",
});

function policy(overrides = {}) {
  return createStrategyConvergencePolicyV1({
    schemaVersion: 1,
    policyId: "convergence-policy",
    policyVersion: 1,
    parentPolicyDigest: null,
    minimumConfidenceBps: 6_000,
    minimumDistinctPeers: 3,
    minimumDistinctIndependenceGroups: 3,
    minimumStableCycles: 3,
    recoveryStableCycles: 4,
    improvementMarginBps: 500,
    diversityPreservationMarginBps: 400,
    minimumCycleIntervalMs: 10,
    cooldownDurationMs: 50,
    oscillationWindowMs: 100,
    maximumTransitionsPerOscillationWindow: 2,
    maximumPriorInfluenceBps: 3_000,
    recommendationTtlMs: 50,
    limits: {
      maximumScopes: 8,
      maximumStrategiesPerScope: 8,
      maximumObservationsPerCycle: 32,
      maximumHistoryPerScope: 16,
      maximumSourceIdsPerObservation: 16,
      maximumReasonCodesPerDecision: 8,
      maximumObservationTtlMs: 1_000,
      maximumFutureSkewMs: 5,
      maximumCommitAttempts: 4,
    },
    ...overrides,
  });
}

function observation(
  strategyBinding,
  {
    label = strategyBinding.strategyId,
    outcome = "success",
    confidenceBps = 8_000,
    peers = ["peer-a", "peer-b", "peer-c"],
    groups = ["group-a", "group-b", "group-c"],
    membershipEpoch = 1,
    membershipConfigurationDigest = digest("membership-1"),
    evidencePolicyDigest = digest("evidence-policy"),
    observedAtLogicalMs = 1,
    validUntilLogicalMs = 500,
  } = {},
) {
  return createStrategyConvergenceObservationV1({
    schemaVersion: 1,
    evidencePolicyDigest,
    membershipEpoch,
    membershipConfigurationDigest,
    cohortDigest: scope.cohortDigest,
    binding: strategyBinding,
    certificateDigest: digest(`certificate-${label}`),
    attesterPeerIds: peers,
    independenceGroupIds: groups,
    outcome,
    confidenceBps,
    observedAtLogicalMs,
    validUntilLogicalMs,
  });
}

function cycle({
  cycleId,
  currentStrategy = bindingA,
  eligibleStrategies = [bindingA, bindingB],
  observations = [observation(bindingB)],
  connectivity = "connected",
  logicalTimeMs,
}) {
  return createStrategyConvergenceCycleRequestV1({
    schemaVersion: 1,
    cycleId,
    scope,
    currentStrategy,
    eligibleStrategies,
    connectivity,
    observations,
    logicalTimeMs,
  });
}

function runtime({
  stateKey = "convergence-state",
  policyRecord = policy(),
} = {}) {
  const store = new InMemoryStrategyConvergenceStoreV1();
  return {
    store,
    controller: new StrategyConvergenceRuntimeV1({
      stateKey,
      controllerId: "strategy-convergence",
      controllerVersion: 1,
      implementationId: "strategy-convergence.default",
      policy: policyRecord,
      store,
    }),
  };
}

function certificate(
  strategyBinding,
  {
    label = strategyBinding.strategyId,
    outcome = "success",
    confidenceBps = 8_000,
    observedAtLogicalMs = 1,
    expiresAtLogicalMs = 500,
  } = {},
) {
  const peers = ["peer-a", "peer-b", "peer-c"];
  const groups = ["group-a", "group-b", "group-c"];
  const body = {
    schemaVersion: 1,
    policyDigest: digest("evidence-policy"),
    membershipEpoch: 1,
    membershipConfigurationDigest: digest("membership-1"),
    cohortDigest: scope.cohortDigest,
    binding: strategyBinding,
    attestationDigests: peers
      .map((peer) => digest(`attestation-${label}-${peer}`))
      .sort(),
    attesterPeerIds: peers,
    independenceGroupIds: groups,
    outcome,
    metrics,
    confidenceBps,
    certifiedAtLogicalMs: observedAtLogicalMs,
    expiresAtLogicalMs,
  };
  const certificateDigest = digestPlanningJsonV1(
    "peer-strategy-evidence-certificate",
    body,
  );
  return {
    ...body,
    certificateId: `strategy-evidence-certificate.${certificateDigest.slice(7)}`,
    certificateDigest,
  };
}

test("creates canonical contracts and rejects digest tampering", () => {
  assert.equal(scope.operation, "offer_routing");
  assert.equal(policy().policy.minimumStableCycles, 3);
  const value = observation(bindingA);
  assert.throws(
    () =>
      validateStrategyConvergenceCycleRequestV1({
        ...cycle({ cycleId: "tamper", logicalTimeMs: 10 }),
        requestDigest: digest("wrong"),
      }),
    /digest/u,
  );
  assert.throws(
    () =>
      validateStrategyConvergenceObservationV1({
        ...value,
        observationDigest: digest("tampered"),
      }),
    /binding/u,
  );
});

test("strict validation rejects accessors without invoking them", () => {
  let invoked = false;
  const hostileObservations = [];
  Object.defineProperty(hostileObservations, "0", {
    enumerable: true,
    get() {
      invoked = true;
      return observation(bindingB);
    },
  });
  assert.throws(
    () =>
      createStrategyConvergenceCycleRequestV1({
        schemaVersion: 1,
        cycleId: "hostile-array",
        scope,
        currentStrategy: bindingA,
        eligibleStrategies: [bindingA, bindingB],
        connectivity: "connected",
        observations: hostileObservations,
        logicalTimeMs: 10,
      }),
    /observations is invalid/u,
  );
  const hostileRequest = {
    ...cycle({ cycleId: "hostile-record", logicalTimeMs: 10 }),
  };
  Object.defineProperty(hostileRequest, "connectivity", {
    enumerable: true,
    get() {
      invoked = true;
      return "connected";
    },
  });
  assert.throws(
    () => validateStrategyConvergenceCycleRequestV1(hostileRequest),
    /shape is invalid/u,
  );
  assert.equal(invoked, false);
});

test("requires sustained evidence before recommending adoption", async () => {
  const { controller } = runtime();
  const first = await controller.evaluate(
    cycle({ cycleId: "cycle-1", logicalTimeMs: 10 }),
  );
  const second = await controller.evaluate(
    cycle({ cycleId: "cycle-2", logicalTimeMs: 20 }),
  );
  const thirdRequest = cycle({ cycleId: "cycle-3", logicalTimeMs: 30 });
  const third = await controller.evaluate(thirdRequest);

  assert.equal(first.status, "candidate");
  assert.equal(second.status, "candidate");
  assert.equal(third.action, "adopt");
  assert.equal(third.recommendedStrategyId, bindingB.strategyId);
  assert.ok(third.recommendation.influenceBps <= 3_000);

  const replay = await controller.evaluate(thirdRequest);
  assert.equal(replay.decisionDigest, third.decisionDigest);
  assert.equal((await controller.loadState()).revision, 3);
});

test("preserves local diversity when the current strategy is near the leader", async () => {
  const { controller } = runtime();
  const decision = await controller.evaluate(
    cycle({
      cycleId: "diversity",
      logicalTimeMs: 10,
      observations: [
        observation(bindingA, { label: "a-7800", confidenceBps: 7_800 }),
        observation(bindingB, { label: "b-8000", confidenceBps: 8_000 }),
      ],
    }),
  );
  assert.equal(decision.action, "hold");
  assert.equal(decision.status, "stable");
  assert.equal(decision.recommendedStrategyId, bindingA.strategyId);
  assert.ok(
    decision.reasonCodes.includes("local_strategy_within_diversity_margin"),
  );
});

test("holds through partitions and applies a longer recovery window", async () => {
  const { controller } = runtime();
  const partitioned = await controller.evaluate(
    cycle({
      cycleId: "partition",
      connectivity: "partitioned",
      logicalTimeMs: 10,
    }),
  );
  assert.equal(partitioned.status, "partitioned");
  assert.equal(partitioned.recommendation, null);

  for (let index = 1; index <= 3; index += 1) {
    const recovering = await controller.evaluate(
      cycle({
        cycleId: `recovery-${index}`,
        connectivity: "recovering",
        logicalTimeMs: 10 + index * 10,
      }),
    );
    assert.equal(recovering.action, "hold");
    assert.equal(recovering.recommendation, null);
  }
  const recovered = await controller.evaluate(
    cycle({
      cycleId: "recovery-4",
      connectivity: "recovering",
      logicalTimeMs: 50,
    }),
  );
  assert.equal(recovered.action, "adopt");
  assert.equal(recovered.recommendedStrategyId, bindingB.strategyId);
});

test("detects actual local strategy oscillation and activates a guard", async () => {
  const { controller } = runtime({
    policyRecord: policy({ diversityPreservationMarginBps: 10_000 }),
  });
  const shared = [
    observation(bindingA, { label: "osc-a" }),
    observation(bindingB, { label: "osc-b" }),
  ];
  await controller.evaluate(
    cycle({
      cycleId: "osc-1",
      currentStrategy: bindingA,
      observations: shared,
      logicalTimeMs: 10,
    }),
  );
  await controller.evaluate(
    cycle({
      cycleId: "osc-2",
      currentStrategy: bindingB,
      observations: shared,
      logicalTimeMs: 20,
    }),
  );
  const guarded = await controller.evaluate(
    cycle({
      cycleId: "osc-3",
      currentStrategy: bindingA,
      observations: shared,
      logicalTimeMs: 30,
    }),
  );
  assert.equal(guarded.status, "oscillating");
  assert.equal(guarded.recommendation, null);
  assert.ok(guarded.reasonCodes.includes("strategy_oscillation_guard_active"));
});

test("fails closed on conflicting membership configurations at the same epoch", async () => {
  const { controller } = runtime();
  const decision = await controller.evaluate(
    cycle({
      cycleId: "membership-conflict",
      logicalTimeMs: 10,
      observations: [
        observation(bindingB, {
          label: "config-a",
          membershipEpoch: 2,
          membershipConfigurationDigest: digest("config-a"),
        }),
        observation(bindingB, {
          label: "config-b",
          membershipEpoch: 2,
          membershipConfigurationDigest: digest("config-b"),
        }),
      ],
    }),
  );
  assert.equal(decision.status, "insufficient_evidence");
  assert.equal(decision.recommendation, null);
  assert.ok(decision.reasonCodes.includes("membership_configuration_conflict"));
});

test("compares strategies only inside the newest shared membership view", async () => {
  const { controller } = runtime();
  const decision = await controller.evaluate(
    cycle({
      cycleId: "newest-membership-view",
      logicalTimeMs: 10,
      observations: [
        observation(bindingA, {
          label: "old-a",
          membershipEpoch: 1,
          confidenceBps: 9_000,
        }),
        observation(bindingB, {
          label: "current-b",
          membershipEpoch: 2,
          membershipConfigurationDigest: digest("membership-2"),
          confidenceBps: 8_000,
        }),
      ],
    }),
  );
  assert.equal(decision.status, "candidate");
  assert.equal(
    decision.scores.find(
      (score) => score.binding.strategyId === bindingA.strategyId,
    ).credible,
    false,
  );
  assert.equal(
    decision.scores.find(
      (score) => score.binding.strategyId === bindingB.strategyId,
    ).credible,
    true,
  );
});

test("does not amplify source coverage across rotating certificate sets", async () => {
  const { controller } = runtime();
  const decision = await controller.evaluate(
    cycle({
      cycleId: "rotating-sources",
      logicalTimeMs: 10,
      observations: [
        observation(bindingB, {
          label: "sources-abc",
          peers: ["peer-a", "peer-b", "peer-c"],
          groups: ["group-a", "group-b", "group-c"],
        }),
        observation(bindingB, {
          label: "sources-bcd",
          peers: ["peer-b", "peer-c", "peer-d"],
          groups: ["group-b", "group-c", "group-d"],
        }),
      ],
    }),
  );
  assert.equal(decision.status, "insufficient_evidence");
  assert.equal(decision.scores[0].attesterPeerIds.length, 2);
});

test("rejects evidence-policy conflicts and artificially fast cycles", async () => {
  const { controller } = runtime();
  const conflicted = await controller.evaluate(
    cycle({
      cycleId: "policy-conflict",
      logicalTimeMs: 10,
      observations: [
        observation(bindingB, {
          label: "policy-a",
          evidencePolicyDigest: digest("policy-a"),
        }),
        observation(bindingB, {
          label: "policy-b",
          evidencePolicyDigest: digest("policy-b"),
        }),
      ],
    }),
  );
  assert.equal(conflicted.status, "insufficient_evidence");
  assert.ok(conflicted.reasonCodes.includes("evidence_policy_conflict"));
  await assert.rejects(
    controller.evaluate(cycle({ cycleId: "too-fast", logicalTimeMs: 15 })),
    /interval is too short/u,
  );
});

test("imports certificate projections and creates evidence-backed cycles", () => {
  const evidenceCertificate = certificate(bindingB);
  const projected = createStrategyConvergenceObservationFromCertificateV1({
    certificate: evidenceCertificate,
  });
  assert.equal(
    projected.certificateDigest,
    evidenceCertificate.certificateDigest,
  );
  assert.equal(projected.binding.bindingDigest, bindingB.bindingDigest);
  const request = createStrategyConvergenceCycleFromEvidenceV1({
    cycleId: "evidence-cycle",
    scope,
    currentStrategy: bindingA,
    eligibleStrategies: [bindingA, bindingB],
    connectivity: "connected",
    certificates: [evidenceCertificate],
    logicalTimeMs: 10,
  });
  assert.equal(request.observations.length, 1);
});

test("exports recommendations as bounded local adaptation priors", async () => {
  const { controller } = runtime();
  for (let index = 1; index <= 3; index += 1) {
    await controller.evaluate(
      cycle({
        cycleId: `prior-${index}`,
        logicalTimeMs: index * 10,
      }),
    );
  }
  const source = createStrategyConvergencePriorSourceV1({
    sourceId: "strategy-convergence-prior",
    sourceVersion: 1,
    sourceImplementationDigest: digest("convergence-prior-source"),
    maximumInfluenceBps: 2_000,
    convergence: controller,
    scope: () => scope,
  });
  const request = createLocalStrategySelectionRequestV1({
    schemaVersion: 1,
    requestId: "local-request",
    operation: "offer_routing",
    scope: {
      tenantId: "tenant",
      meshId: "mesh",
      policyDomainId: "policy-domain",
      missionIntentId: "mission",
      objectiveId: "objective",
      workItemId: null,
      workItemRevision: null,
    },
    logicalTimeMs: 31,
    contextDigest: digest("local-context"),
    availableStrategyIds: [definitionA.strategyId, definitionB.strategyId],
  });
  const priors = await source.resolve({
    request,
    strategies: [definitionA, definitionB],
  });
  assert.equal(priors.length, 1);
  assert.equal(priors[0].strategyId, definitionB.strategyId);
  assert.ok(priors[0].requestedInfluenceBps <= 2_000);
  assert.equal(priors[0].outcome, "success");
});

test("handoff preserves stability state and rejects stale logical time", async () => {
  const policyRecord = policy();
  const source = runtime({ stateKey: "source", policyRecord }).controller;
  await source.evaluate(cycle({ cycleId: "handoff-1", logicalTimeMs: 10 }));
  const handoff = await source.exportHandoff({
    targetStateKey: "target",
    logicalTimeMs: 20,
  });
  const target = runtime({ stateKey: "target", policyRecord }).controller;
  const restored = await target.importHandoff({ handoff, logicalTimeMs: 20 });
  assert.equal(restored.predecessorStateDigest, handoff.sourceStateDigest);
  assert.equal(restored.scopes[0].candidateCycles, 1);
  assert.equal(
    validateStrategyConvergenceStateV1(restored, { policy: policyRecord })
      .stateDigest,
    restored.stateDigest,
  );
  await assert.rejects(
    target.evaluate(cycle({ cycleId: "stale", logicalTimeMs: 19 })),
    /rolled back/u,
  );
});

test("reports divergent credible leaders without remote control", async () => {
  const { controller } = runtime();
  const decision = await controller.evaluate(
    cycle({
      cycleId: "divergent",
      currentStrategy: bindingC,
      eligibleStrategies: [bindingA, bindingB, bindingC],
      logicalTimeMs: 10,
      observations: [
        observation(bindingA, { label: "div-a", confidenceBps: 8_000 }),
        observation(bindingB, { label: "div-b", confidenceBps: 7_800 }),
      ],
    }),
  );
  assert.equal(decision.status, "divergent");
  assert.equal(decision.action, "hold");
  assert.equal(decision.recommendation, null);
});

test("unsafe, expired and future observations never produce a prior", async () => {
  const unsafeController = runtime().controller;
  const unsafe = await unsafeController.evaluate(
    cycle({
      cycleId: "unsafe",
      logicalTimeMs: 10,
      observations: [
        observation(bindingB, { label: "unsafe", outcome: "unsafe" }),
      ],
    }),
  );
  assert.equal(unsafe.status, "unsafe");
  assert.equal(unsafe.recommendation, null);

  const temporalController = runtime().controller;
  const temporal = await temporalController.evaluate(
    cycle({
      cycleId: "temporal",
      logicalTimeMs: 20,
      observations: [
        observation(bindingB, {
          label: "expired",
          observedAtLogicalMs: 1,
          validUntilLogicalMs: 10,
        }),
        observation(bindingB, {
          label: "future",
          observedAtLogicalMs: 30,
          validUntilLogicalMs: 100,
        }),
      ],
    }),
  );
  assert.equal(temporal.status, "insufficient_evidence");
  assert.equal(temporal.recommendation, null);
  assert.ok(
    temporal.reasonCodes.includes("observation_outside_validity_window"),
  );
});

test("runtime retries a bounded compare-and-swap conflict", async () => {
  const policyRecord = policy();
  const durable = new InMemoryStrategyConvergenceStoreV1();
  let conflict = true;
  const store = {
    load: (stateKey) => durable.load(stateKey),
    async save(input) {
      if (conflict) {
        conflict = false;
        return false;
      }
      return durable.save(input);
    },
  };
  const controller = new StrategyConvergenceRuntimeV1({
    stateKey: "cas-retry",
    controllerId: "strategy-convergence",
    controllerVersion: 1,
    implementationId: "strategy-convergence.default",
    policy: policyRecord,
    store,
  });
  const decision = await controller.evaluate(
    cycle({ cycleId: "cas", logicalTimeMs: 10 }),
  );
  assert.equal(decision.status, "candidate");
  assert.equal((await controller.loadState()).revision, 1);
});
