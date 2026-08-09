import assert from "node:assert/strict";

import {
  InMemoryStrategyConvergenceStoreV1,
  STRATEGY_CONVERGENCE_SCHEMA_VERSION_V1,
  StrategyConvergenceRuntimeV1,
  createStrategyConvergencePolicyV1,
  createStrategyConvergenceScopeV1,
} from "@agentplat/collective-runtime/strategy-convergence";

const digest = (character) => `sha256:${character.repeat(64)}`;
const scope = createStrategyConvergenceScopeV1({
  tenantId: "tenant",
  meshId: "mesh",
  policyDomainId: "policy-domain",
  missionIntentId: "mission",
  objectiveId: "objective",
  cohortDigest: digest("a"),
  operation: "offer_routing",
});
const policy = createStrategyConvergencePolicyV1({
  schemaVersion: 1,
  policyId: "convergence-policy",
  policyVersion: 1,
  parentPolicyDigest: null,
  minimumConfidenceBps: 7_000,
  minimumDistinctPeers: 3,
  minimumDistinctIndependenceGroups: 3,
  minimumStableCycles: 3,
  recoveryStableCycles: 5,
  improvementMarginBps: 500,
  diversityPreservationMarginBps: 500,
  minimumCycleIntervalMs: 1_000,
  cooldownDurationMs: 10_000,
  oscillationWindowMs: 60_000,
  maximumTransitionsPerOscillationWindow: 3,
  maximumPriorInfluenceBps: 2_000,
  recommendationTtlMs: 5_000,
  limits: {
    maximumScopes: 4,
    maximumStrategiesPerScope: 8,
    maximumObservationsPerCycle: 16,
    maximumHistoryPerScope: 16,
    maximumSourceIdsPerObservation: 16,
    maximumReasonCodesPerDecision: 8,
    maximumObservationTtlMs: 60_000,
    maximumFutureSkewMs: 1_000,
    maximumCommitAttempts: 4,
  },
});
const runtime = new StrategyConvergenceRuntimeV1({
  stateKey: "convergence-state",
  controllerId: "convergence",
  controllerVersion: 1,
  implementationId: "convergence.default",
  policy,
  store: new InMemoryStrategyConvergenceStoreV1(),
});

assert.equal(STRATEGY_CONVERGENCE_SCHEMA_VERSION_V1, 1);
assert.match(scope.scopeDigest, /^sha256:[0-9a-f]{64}$/u);
assert.match(policy.policyDigest, /^sha256:[0-9a-f]{64}$/u);
assert.equal((await runtime.loadState()).revision, 0);
