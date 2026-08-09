import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";

import {
  LOCAL_STRATEGY_OPERATIONS_V1,
  type LocalStrategyOperationV1,
} from "./strategy-adaptation-contracts.js";
import { validatePeerStrategyEvidenceBindingV1 } from "./strategy-evidence-exchange-runtime.js";
import type {
  PeerStrategyEvidenceBindingV1,
  PeerStrategyEvidenceOutcomeV1,
} from "./strategy-evidence-exchange-contracts.js";
import {
  STRATEGY_CONVERGENCE_HANDOFF_FORMAT_V1,
  STRATEGY_CONVERGENCE_SCHEMA_VERSION_V1,
  STRATEGY_CONVERGENCE_STATE_FORMAT_V1,
  type StrategyConvergenceActionV1,
  type StrategyConvergenceConnectivityV1,
  type StrategyConvergenceCycleRequestV1,
  type StrategyConvergenceDecisionV1,
  type StrategyConvergenceHandoffEnvelopeV1,
  type StrategyConvergenceHistoryEntryV1,
  type StrategyConvergenceObservationV1,
  type StrategyConvergencePolicyRecordV1,
  type StrategyConvergencePolicyV1,
  type StrategyConvergencePortV1,
  type StrategyConvergenceRecommendationV1,
  type StrategyConvergenceReductionInputV1,
  type StrategyConvergenceReductionResultV1,
  type StrategyConvergenceRuntimeOptionsV1,
  type StrategyConvergenceScopeStateV1,
  type StrategyConvergenceScopeV1,
  type StrategyConvergenceScoreV1,
  type StrategyConvergenceStateV1,
  type StrategyConvergenceStatusV1,
  type StrategyConvergenceStoreV1,
} from "./strategy-convergence-contracts.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const BPS = 10_000;
const operationSet = new Set<string>(LOCAL_STRATEGY_OPERATIONS_V1);
const connectivitySet = new Set<string>([
  "connected",
  "degraded",
  "partitioned",
  "recovering",
]);
const statusSet = new Set<string>([
  "insufficient_evidence",
  "candidate",
  "stable",
  "divergent",
  "oscillating",
  "partitioned",
  "recovering",
  "unsafe",
]);
const actionSet = new Set<string>(["hold", "adopt", "explore", "isolate"]);
const outcomeSet = new Set<string>([
  "success",
  "failure",
  "unsafe",
  "indeterminate",
]);

const policyKeys = [
  "cooldownDurationMs",
  "diversityPreservationMarginBps",
  "improvementMarginBps",
  "limits",
  "maximumPriorInfluenceBps",
  "maximumTransitionsPerOscillationWindow",
  "minimumCycleIntervalMs",
  "minimumConfidenceBps",
  "minimumDistinctIndependenceGroups",
  "minimumDistinctPeers",
  "minimumStableCycles",
  "oscillationWindowMs",
  "parentPolicyDigest",
  "policyId",
  "policyVersion",
  "recommendationTtlMs",
  "recoveryStableCycles",
  "schemaVersion",
] as const;
const limitKeys = [
  "maximumCommitAttempts",
  "maximumFutureSkewMs",
  "maximumHistoryPerScope",
  "maximumObservationTtlMs",
  "maximumObservationsPerCycle",
  "maximumReasonCodesPerDecision",
  "maximumScopes",
  "maximumSourceIdsPerObservation",
  "maximumStrategiesPerScope",
] as const;
const scopeKeys = [
  "cohortDigest",
  "meshId",
  "missionIntentId",
  "objectiveId",
  "operation",
  "policyDomainId",
  "scopeDigest",
  "tenantId",
] as const;
const observationKeys = [
  "attesterPeerIds",
  "binding",
  "certificateDigest",
  "cohortDigest",
  "confidenceBps",
  "evidencePolicyDigest",
  "independenceGroupIds",
  "membershipConfigurationDigest",
  "membershipEpoch",
  "observationDigest",
  "observationId",
  "observedAtLogicalMs",
  "outcome",
  "schemaVersion",
  "validUntilLogicalMs",
] as const;
const requestKeys = [
  "connectivity",
  "currentStrategy",
  "cycleId",
  "eligibleStrategies",
  "logicalTimeMs",
  "observations",
  "requestDigest",
  "schemaVersion",
  "scope",
] as const;
const scoreKeys = [
  "attesterPeerIds",
  "binding",
  "confidenceBps",
  "credible",
  "independenceGroupIds",
  "observationDigests",
  "outcome",
  "schemaVersion",
  "scoreBps",
  "unsafe",
] as const;
const recommendationKeys = [
  "action",
  "bindingDigest",
  "confidenceBps",
  "evidenceDigests",
  "influenceBps",
  "observedAtLogicalMs",
  "operation",
  "recommendationDigest",
  "schemaVersion",
  "scopeDigest",
  "strategyDigest",
  "strategyId",
  "validUntilLogicalMs",
] as const;
const decisionKeys = [
  "action",
  "committedStateRevision",
  "currentStrategyId",
  "decisionDigest",
  "decisionId",
  "evaluatedAtLogicalMs",
  "priorStateRevision",
  "reasonCodes",
  "recommendation",
  "recommendedStrategyId",
  "requestDigest",
  "schemaVersion",
  "scopeDigest",
  "scores",
  "status",
] as const;
const historyKeys = [
  "action",
  "connectivity",
  "currentStrategyId",
  "evaluatedAtLogicalMs",
  "recommendedStrategyId",
  "requestDigest",
  "schemaVersion",
  "status",
] as const;
const scopeStateKeys = [
  "candidateCycles",
  "candidateStrategy",
  "cooldownUntilLogicalMs",
  "currentStrategy",
  "history",
  "lastDecision",
  "lastStatus",
  "oscillationGuardUntilLogicalMs",
  "recoveryCycles",
  "schemaVersion",
  "scope",
  "stableCycles",
] as const;
const stateKeys = [
  "controllerId",
  "controllerVersion",
  "format",
  "implementationId",
  "lastDecisionDigest",
  "logicalTimeHighWaterMs",
  "policyDigest",
  "policyId",
  "policyVersion",
  "predecessorStateDigest",
  "revision",
  "schemaVersion",
  "scopes",
  "stateDigest",
  "stateKey",
] as const;

export function createStrategyConvergenceScopeV1(
  input: Omit<StrategyConvergenceScopeV1, "scopeDigest">,
): StrategyConvergenceScopeV1 {
  const body = freeze({
    tenantId: identifier(input.tenantId, "scope.tenantId"),
    meshId: identifier(input.meshId, "scope.meshId"),
    policyDomainId: identifier(input.policyDomainId, "scope.policyDomainId"),
    missionIntentId: identifier(input.missionIntentId, "scope.missionIntentId"),
    objectiveId: identifier(input.objectiveId, "scope.objectiveId"),
    cohortDigest: sha(input.cohortDigest, "scope.cohortDigest"),
    operation: operation(input.operation),
  });
  return freeze({
    ...body,
    scopeDigest: digest("strategy-convergence-scope", body),
  });
}

export function validateStrategyConvergenceScopeV1(
  input: unknown,
): StrategyConvergenceScopeV1 {
  const value = exact(input, scopeKeys, "strategy convergence scope");
  const result = createStrategyConvergenceScopeV1({
    tenantId: value.tenantId as string,
    meshId: value.meshId as string,
    policyDomainId: value.policyDomainId as string,
    missionIntentId: value.missionIntentId as string,
    objectiveId: value.objectiveId as string,
    cohortDigest: value.cohortDigest as PlanningDigestV1,
    operation: value.operation as LocalStrategyOperationV1,
  });
  if (value.scopeDigest !== result.scopeDigest)
    fail("strategy convergence scope digest is invalid");
  return result;
}

export function createStrategyConvergencePolicyV1(
  input: StrategyConvergencePolicyV1,
): StrategyConvergencePolicyRecordV1 {
  const policy = normalizePolicy(input);
  return freeze({
    schemaVersion: STRATEGY_CONVERGENCE_SCHEMA_VERSION_V1,
    policy,
    policyDigest: digest("strategy-convergence-policy", policy),
  });
}

export function validateStrategyConvergencePolicyV1(
  input: unknown,
): StrategyConvergencePolicyRecordV1 {
  const value = exact(
    input,
    ["policy", "policyDigest", "schemaVersion"],
    "strategy convergence policy record",
  );
  schema(value.schemaVersion, "strategy convergence policy record");
  const policy = normalizePolicy(value.policy as StrategyConvergencePolicyV1);
  const policyDigest = digest("strategy-convergence-policy", policy);
  if (value.policyDigest !== policyDigest)
    fail("strategy convergence policy digest is invalid");
  return freeze({ schemaVersion: 1, policy, policyDigest });
}

export function createStrategyConvergenceObservationV1(
  input: Omit<
    StrategyConvergenceObservationV1,
    "observationId" | "observationDigest"
  >,
): StrategyConvergenceObservationV1 {
  const body = normalizeObservationBody(input);
  const observationDigest = digest("strategy-convergence-observation", body);
  return freeze({
    ...body,
    observationId: `strategy-convergence-observation.${observationDigest.slice(7)}`,
    observationDigest,
  });
}

export function validateStrategyConvergenceObservationV1(
  input: unknown,
): StrategyConvergenceObservationV1 {
  const value = exact(
    input,
    observationKeys,
    "strategy convergence observation",
  );
  const result = createStrategyConvergenceObservationV1({
    schemaVersion: value.schemaVersion as 1,
    evidencePolicyDigest: value.evidencePolicyDigest as PlanningDigestV1,
    membershipEpoch: value.membershipEpoch as number,
    membershipConfigurationDigest:
      value.membershipConfigurationDigest as PlanningDigestV1,
    cohortDigest: value.cohortDigest as PlanningDigestV1,
    binding: value.binding as PeerStrategyEvidenceBindingV1,
    certificateDigest: value.certificateDigest as PlanningDigestV1,
    attesterPeerIds: value.attesterPeerIds as readonly string[],
    independenceGroupIds: value.independenceGroupIds as readonly string[],
    outcome: value.outcome as PeerStrategyEvidenceOutcomeV1,
    confidenceBps: value.confidenceBps as number,
    observedAtLogicalMs: value.observedAtLogicalMs as number,
    validUntilLogicalMs: value.validUntilLogicalMs as number,
  });
  if (
    value.observationId !== result.observationId ||
    value.observationDigest !== result.observationDigest
  )
    fail("strategy convergence observation binding is invalid");
  return result;
}

export function createStrategyConvergenceCycleRequestV1(
  input: Omit<StrategyConvergenceCycleRequestV1, "requestDigest">,
): StrategyConvergenceCycleRequestV1 {
  const body = normalizeRequestBody(input);
  return freeze({
    ...body,
    requestDigest: digest("strategy-convergence-cycle-request", body),
  });
}

export function validateStrategyConvergenceCycleRequestV1(
  input: unknown,
): StrategyConvergenceCycleRequestV1 {
  const value = exact(input, requestKeys, "strategy convergence cycle request");
  const result = createStrategyConvergenceCycleRequestV1({
    schemaVersion: value.schemaVersion as 1,
    cycleId: value.cycleId as string,
    scope: value.scope as StrategyConvergenceScopeV1,
    currentStrategy: value.currentStrategy as PeerStrategyEvidenceBindingV1,
    eligibleStrategies:
      value.eligibleStrategies as readonly PeerStrategyEvidenceBindingV1[],
    connectivity: value.connectivity as StrategyConvergenceConnectivityV1,
    observations:
      value.observations as readonly StrategyConvergenceObservationV1[],
    logicalTimeMs: value.logicalTimeMs as number,
  });
  if (value.requestDigest !== result.requestDigest)
    fail("strategy convergence cycle request digest is invalid");
  return result;
}

export function createStrategyConvergenceStateV1(input: {
  readonly stateKey: string;
  readonly controllerId: string;
  readonly controllerVersion: number;
  readonly implementationId: string;
  readonly policy: StrategyConvergencePolicyRecordV1;
  readonly revision?: number;
  readonly logicalTimeHighWaterMs?: number;
  readonly scopes?: readonly StrategyConvergenceScopeStateV1[];
  readonly predecessorStateDigest?: PlanningDigestV1 | null;
  readonly lastDecisionDigest?: PlanningDigestV1 | null;
}): StrategyConvergenceStateV1 {
  const policy = validateStrategyConvergencePolicyV1(input.policy);
  const scopes = freeze(
    [...(input.scopes ?? [])]
      .map((scope) => normalizeScopeState(scope, policy))
      .sort((left, right) =>
        compare(left.scope.scopeDigest, right.scope.scopeDigest),
      ),
  );
  if (scopes.length > policy.policy.limits.maximumScopes)
    fail("strategy convergence scope capacity is exceeded");
  unique(
    scopes.map(({ scope }) => scope.scopeDigest),
    "strategy convergence scopes",
  );
  const body = freeze({
    format: STRATEGY_CONVERGENCE_STATE_FORMAT_V1,
    schemaVersion: STRATEGY_CONVERGENCE_SCHEMA_VERSION_V1,
    stateKey: identifier(input.stateKey, "state.stateKey"),
    controllerId: identifier(input.controllerId, "state.controllerId"),
    controllerVersion: positive(
      input.controllerVersion,
      "state.controllerVersion",
    ),
    implementationId: identifier(
      input.implementationId,
      "state.implementationId",
    ),
    policyId: policy.policy.policyId,
    policyVersion: policy.policy.policyVersion,
    policyDigest: policy.policyDigest,
    revision: nonNegative(input.revision ?? 0, "state.revision"),
    logicalTimeHighWaterMs: nonNegative(
      input.logicalTimeHighWaterMs ?? 0,
      "state.logicalTimeHighWaterMs",
    ),
    scopes,
    predecessorStateDigest:
      input.predecessorStateDigest === undefined ||
      input.predecessorStateDigest === null
        ? null
        : sha(input.predecessorStateDigest, "state.predecessorStateDigest"),
    lastDecisionDigest:
      input.lastDecisionDigest === undefined ||
      input.lastDecisionDigest === null
        ? null
        : sha(input.lastDecisionDigest, "state.lastDecisionDigest"),
  });
  return freeze({
    ...body,
    stateDigest: digest("strategy-convergence-state", body),
  });
}

export function validateStrategyConvergenceStateV1(
  input: unknown,
  options: { readonly policy: StrategyConvergencePolicyRecordV1 },
): StrategyConvergenceStateV1 {
  const value = exact(input, stateKeys, "strategy convergence state");
  if (
    value.format !== STRATEGY_CONVERGENCE_STATE_FORMAT_V1 ||
    value.schemaVersion !== STRATEGY_CONVERGENCE_SCHEMA_VERSION_V1
  )
    fail("strategy convergence state format is invalid");
  const state = createStrategyConvergenceStateV1({
    stateKey: value.stateKey as string,
    controllerId: value.controllerId as string,
    controllerVersion: value.controllerVersion as number,
    implementationId: value.implementationId as string,
    policy: options.policy,
    revision: value.revision as number,
    logicalTimeHighWaterMs: value.logicalTimeHighWaterMs as number,
    scopes: value.scopes as readonly StrategyConvergenceScopeStateV1[],
    predecessorStateDigest:
      value.predecessorStateDigest as PlanningDigestV1 | null,
    lastDecisionDigest: value.lastDecisionDigest as PlanningDigestV1 | null,
  });
  if (
    value.policyId !== state.policyId ||
    value.policyVersion !== state.policyVersion ||
    value.policyDigest !== state.policyDigest ||
    value.stateDigest !== state.stateDigest
  )
    fail("strategy convergence state binding is invalid");
  if (
    state.scopes.some((scope) =>
      scope.history.some(
        (entry) => entry.evaluatedAtLogicalMs > state.logicalTimeHighWaterMs,
      ),
    )
  )
    fail("strategy convergence state time is invalid");
  const retainedDecisionDigests = new Set(
    state.scopes.flatMap(({ lastDecision }) =>
      lastDecision ? [lastDecision.decisionDigest] : [],
    ),
  );
  if (
    (state.lastDecisionDigest === null && retainedDecisionDigests.size > 0) ||
    (state.lastDecisionDigest !== null &&
      !retainedDecisionDigests.has(state.lastDecisionDigest))
  )
    fail("strategy convergence last decision binding is invalid");
  return state;
}

export function reduceStrategyConvergenceV1(
  input: StrategyConvergenceReductionInputV1,
): StrategyConvergenceReductionResultV1 {
  const policy = validateStrategyConvergencePolicyV1(input.policy);
  const state = validateStrategyConvergenceStateV1(input.state, { policy });
  const request = validateStrategyConvergenceCycleRequestV1(input.request);
  if (request.logicalTimeMs < state.logicalTimeHighWaterMs)
    fail("strategy convergence logical time rolled back");
  const previous = state.scopes.find(
    ({ scope }) => scope.scopeDigest === request.scope.scopeDigest,
  );
  const replayDecision = previous?.lastDecision ?? null;
  if (replayDecision?.requestDigest === request.requestDigest)
    return freeze({ state, decision: replayDecision });
  if (!previous && state.scopes.length >= policy.policy.limits.maximumScopes)
    fail("strategy convergence scope capacity is exceeded");

  const reasonCodes = new Set<string>();
  const scores = scoreRequest(request, policy, reasonCodes);
  const prior = previous ?? initialScopeState(request);
  const previousEvaluation = prior.history.at(-1)?.evaluatedAtLogicalMs ?? null;
  if (
    previousEvaluation !== null &&
    request.logicalTimeMs - previousEvaluation <
      policy.policy.minimumCycleIntervalMs
  )
    fail("strategy convergence cycle interval is too short");
  const historyForOscillation = [...prior.history, historyProbe(request)];
  const oscillating =
    transitionCount(
      historyForOscillation.filter(
        ({ evaluatedAtLogicalMs }) =>
          evaluatedAtLogicalMs >=
          request.logicalTimeMs - policy.policy.oscillationWindowMs,
      ),
    ) >= policy.policy.maximumTransitionsPerOscillationWindow;
  const guardUntil = oscillating
    ? Math.max(
        prior.oscillationGuardUntilLogicalMs,
        request.logicalTimeMs + policy.policy.cooldownDurationMs,
      )
    : prior.oscillationGuardUntilLogicalMs;

  const currentScore = scores.find(
    ({ binding }) =>
      binding.bindingDigest === request.currentStrategy.bindingDigest,
  );
  const credible = scores.filter((score) => score.credible);
  const top = credible[0] ?? null;
  let status: StrategyConvergenceStatusV1 = "insufficient_evidence";
  let action: StrategyConvergenceActionV1 = "hold";
  let selected: StrategyConvergenceScoreV1 | null = null;
  let candidate = prior.candidateStrategy;
  let candidateCycles = prior.candidateCycles;
  let stableCycles = 0;
  let recoveryCycles =
    request.connectivity === "recovering"
      ? Math.min(
          prior.recoveryCycles + 1,
          policy.policy.limits.maximumHistoryPerScope,
        )
      : 0;
  let cooldownUntil = prior.cooldownUntilLogicalMs;

  if (request.connectivity === "partitioned") {
    status = "partitioned";
    reasonCodes.add("collective_view_partitioned");
    candidate = null;
    candidateCycles = 0;
  } else if (
    oscillating ||
    request.logicalTimeMs < prior.oscillationGuardUntilLogicalMs
  ) {
    status = "oscillating";
    reasonCodes.add("strategy_oscillation_guard_active");
    candidate = null;
    candidateCycles = 0;
  } else if (request.eligibleStrategies.length === 0) {
    status = "unsafe";
    action = "isolate";
    reasonCodes.add("no_locally_eligible_strategy");
    candidate = null;
    candidateCycles = 0;
  } else if (!top) {
    status = scores.some(({ unsafe }) => unsafe)
      ? "unsafe"
      : "insufficient_evidence";
    reasonCodes.add(
      status === "unsafe"
        ? "collective_evidence_unsafe"
        : "insufficient_collective_evidence",
    );
    candidate = null;
    candidateCycles = 0;
  } else {
    const nearTop = credible.filter(
      ({ scoreBps }) =>
        top.scoreBps - scoreBps <= policy.policy.diversityPreservationMarginBps,
    );
    const currentIsNearTop = nearTop.some(
      ({ binding }) =>
        binding.bindingDigest === request.currentStrategy.bindingDigest,
    );
    if (currentIsNearTop) {
      status = request.connectivity === "recovering" ? "recovering" : "stable";
      selected = currentScore ?? top;
      stableCycles = Math.min(
        prior.stableCycles + 1,
        policy.policy.limits.maximumHistoryPerScope,
      );
      candidate = null;
      candidateCycles = 0;
      reasonCodes.add("local_strategy_within_diversity_margin");
    } else if (nearTop.length > 1) {
      status = "divergent";
      reasonCodes.add("credible_strategies_divergent");
      candidate = null;
      candidateCycles = 0;
    } else if (
      top.binding.bindingDigest === request.currentStrategy.bindingDigest
    ) {
      status = request.connectivity === "recovering" ? "recovering" : "stable";
      selected = top;
      stableCycles = Math.min(
        prior.stableCycles + 1,
        policy.policy.limits.maximumHistoryPerScope,
      );
      candidate = null;
      candidateCycles = 0;
      reasonCodes.add("current_strategy_collectively_supported");
    } else if (
      currentScore?.credible &&
      top.scoreBps - currentScore.scoreBps < policy.policy.improvementMarginBps
    ) {
      status = "stable";
      selected = currentScore;
      stableCycles = Math.min(
        prior.stableCycles + 1,
        policy.policy.limits.maximumHistoryPerScope,
      );
      candidate = null;
      candidateCycles = 0;
      reasonCodes.add("improvement_below_switch_margin");
    } else {
      candidateCycles =
        candidate?.bindingDigest === top.binding.bindingDigest
          ? Math.min(
              candidateCycles + 1,
              policy.policy.limits.maximumHistoryPerScope,
            )
          : 1;
      candidate = top.binding;
      const requiredCycles = requiredStableCycles(request.connectivity, policy);
      if (
        request.connectivity === "recovering" &&
        recoveryCycles < policy.policy.recoveryStableCycles
      ) {
        status = "recovering";
        reasonCodes.add("recovery_stability_window_incomplete");
      } else if (candidateCycles < requiredCycles) {
        status = "candidate";
        reasonCodes.add("candidate_stability_window_incomplete");
      } else if (request.logicalTimeMs < prior.cooldownUntilLogicalMs) {
        status = "stable";
        reasonCodes.add("strategy_switch_cooldown_active");
      } else {
        status = "stable";
        action = "adopt";
        selected = top;
        cooldownUntil =
          request.logicalTimeMs + policy.policy.cooldownDurationMs;
        candidate = null;
        candidateCycles = 0;
        reasonCodes.add("sustained_improvement_recommends_adoption");
      }
    }
  }

  if (request.connectivity === "degraded")
    reasonCodes.add("collective_view_degraded");
  const recommendation =
    selected && status === "stable"
      ? createRecommendation(request, selected, action, policy)
      : null;
  const priorStateRevision = state.revision;
  const committedStateRevision = priorStateRevision + 1;
  const decisionBody = freeze({
    schemaVersion: STRATEGY_CONVERGENCE_SCHEMA_VERSION_V1,
    requestDigest: request.requestDigest,
    scopeDigest: request.scope.scopeDigest,
    status,
    action,
    currentStrategyId: request.currentStrategy.strategyId,
    recommendedStrategyId: recommendation?.strategyId ?? null,
    scores,
    recommendation,
    reasonCodes: boundedReasons(reasonCodes, policy),
    evaluatedAtLogicalMs: request.logicalTimeMs,
    priorStateRevision,
    committedStateRevision,
  });
  const decisionDigest = digest("strategy-convergence-decision", decisionBody);
  const decision = freeze({
    ...decisionBody,
    decisionId: `strategy-convergence-decision.${decisionDigest.slice(7)}`,
    decisionDigest,
  });
  const historyEntry: StrategyConvergenceHistoryEntryV1 = freeze({
    schemaVersion: 1 as const,
    requestDigest: request.requestDigest,
    currentStrategyId: request.currentStrategy.strategyId,
    recommendedStrategyId: decision.recommendedStrategyId,
    action,
    status,
    connectivity: request.connectivity,
    evaluatedAtLogicalMs: request.logicalTimeMs,
  });
  const nextScope: StrategyConvergenceScopeStateV1 = freeze({
    schemaVersion: 1,
    scope: request.scope,
    currentStrategy: request.currentStrategy,
    candidateStrategy: candidate,
    candidateCycles,
    stableCycles,
    recoveryCycles,
    cooldownUntilLogicalMs: cooldownUntil,
    oscillationGuardUntilLogicalMs: guardUntil,
    lastStatus: status,
    lastDecision: decision,
    history: freeze(
      [...prior.history, historyEntry].slice(
        -policy.policy.limits.maximumHistoryPerScope,
      ),
    ),
  });
  const nextScopes = [
    ...state.scopes.filter(
      ({ scope }) => scope.scopeDigest !== request.scope.scopeDigest,
    ),
    nextScope,
  ];
  const nextState = createStrategyConvergenceStateV1({
    stateKey: state.stateKey,
    controllerId: state.controllerId,
    controllerVersion: state.controllerVersion,
    implementationId: state.implementationId,
    policy,
    revision: committedStateRevision,
    logicalTimeHighWaterMs: request.logicalTimeMs,
    scopes: nextScopes,
    predecessorStateDigest: state.stateDigest,
    lastDecisionDigest: decision.decisionDigest,
  });
  return freeze({ state: nextState, decision });
}

export class StrategyConvergenceRuntimeV1 implements StrategyConvergencePortV1 {
  readonly controllerId: string;
  readonly controllerVersion: number;
  readonly implementationId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  readonly #stateKey: string;
  readonly #policy: StrategyConvergencePolicyRecordV1;
  readonly #store: StrategyConvergenceStoreV1;

  constructor(options: StrategyConvergenceRuntimeOptionsV1) {
    if (!options || typeof options !== "object")
      fail("strategy convergence runtime options are required");
    this.#stateKey = identifier(options.stateKey, "runtime.stateKey");
    this.controllerId = identifier(
      options.controllerId,
      "runtime.controllerId",
    );
    this.controllerVersion = positive(
      options.controllerVersion,
      "runtime.controllerVersion",
    );
    this.implementationId = identifier(
      options.implementationId,
      "runtime.implementationId",
    );
    this.#policy = validateStrategyConvergencePolicyV1(options.policy);
    this.policyId = this.#policy.policy.policyId;
    this.policyVersion = this.#policy.policy.policyVersion;
    this.policyDigest = this.#policy.policyDigest;
    if (
      !options.store ||
      typeof options.store.load !== "function" ||
      typeof options.store.save !== "function"
    )
      fail("strategy convergence store is required");
    this.#store = options.store;
  }

  async evaluate(
    requestValue: StrategyConvergenceCycleRequestV1,
  ): Promise<StrategyConvergenceDecisionV1> {
    const request = validateStrategyConvergenceCycleRequestV1(requestValue);
    for (
      let attempt = 0;
      attempt < this.#policy.policy.limits.maximumCommitAttempts;
      attempt += 1
    ) {
      const loaded = await this.#store.load(this.#stateKey);
      const state = loaded ? this.#validateState(loaded) : this.#initialState();
      this.#assertBinding(state);
      const result = reduceStrategyConvergenceV1({
        state,
        policy: this.#policy,
        request,
      });
      if (result.state.revision === state.revision) return result.decision;
      if (
        await this.#store.save({
          state: result.state,
          expectedRevision: loaded ? state.revision : null,
        })
      )
        return result.decision;
    }
    throw new Error("strategy_convergence_commit_conflict");
  }

  async resolveRecommendation(input: {
    readonly scopeDigest: PlanningDigestV1;
    readonly operation: LocalStrategyOperationV1;
    readonly logicalTimeMs: number;
  }): Promise<StrategyConvergenceRecommendationV1 | null> {
    const scopeDigest = sha(input.scopeDigest, "recommendation.scopeDigest");
    const requestedOperation = operation(input.operation);
    const logicalTimeMs = nonNegative(
      input.logicalTimeMs,
      "recommendation.logicalTimeMs",
    );
    const state = await this.loadState();
    if (logicalTimeMs < state.logicalTimeHighWaterMs)
      fail("strategy convergence logical time rolled back");
    const scope = state.scopes.find(
      (candidate) => candidate.scope.scopeDigest === scopeDigest,
    );
    const recommendation = scope?.lastDecision?.recommendation ?? null;
    return recommendation &&
      recommendation.operation === requestedOperation &&
      recommendation.validUntilLogicalMs > logicalTimeMs
      ? recommendation
      : null;
  }

  async loadState(): Promise<StrategyConvergenceStateV1> {
    const loaded = await this.#store.load(this.#stateKey);
    const state = loaded ? this.#validateState(loaded) : this.#initialState();
    this.#assertBinding(state);
    return state;
  }

  async exportHandoff(input: {
    readonly targetStateKey: string;
    readonly logicalTimeMs: number;
  }): Promise<StrategyConvergenceHandoffEnvelopeV1> {
    const targetStateKey = identifier(
      input.targetStateKey,
      "handoff.targetStateKey",
    );
    if (targetStateKey === this.#stateKey)
      fail("strategy convergence handoff target must differ from source");
    const logicalTimeMs = nonNegative(
      input.logicalTimeMs,
      "handoff.logicalTimeMs",
    );
    const sourceState = await this.loadState();
    if (logicalTimeMs < sourceState.logicalTimeHighWaterMs)
      fail("strategy convergence handoff logical time rolled back");
    const body = freeze({
      format: STRATEGY_CONVERGENCE_HANDOFF_FORMAT_V1,
      schemaVersion: STRATEGY_CONVERGENCE_SCHEMA_VERSION_V1,
      contentClass: "strategy_convergence_state" as const,
      controllerId: this.controllerId,
      controllerVersion: this.controllerVersion,
      implementationId: this.implementationId,
      policyDigest: this.policyDigest,
      sourceStateKey: sourceState.stateKey,
      sourceStateDigest: sourceState.stateDigest,
      targetStateKey,
      exportedAtLogicalMs: logicalTimeMs,
      sourceState,
    });
    return freeze({
      ...body,
      handoffDigest: digest("strategy-convergence-handoff", body),
    });
  }

  async importHandoff(input: {
    readonly handoff: StrategyConvergenceHandoffEnvelopeV1;
    readonly logicalTimeMs: number;
  }): Promise<StrategyConvergenceStateV1> {
    const handoff = validateStrategyConvergenceHandoffV1(input.handoff, {
      policy: this.#policy,
    });
    const logicalTimeMs = nonNegative(
      input.logicalTimeMs,
      "handoff.logicalTimeMs",
    );
    if (
      handoff.targetStateKey !== this.#stateKey ||
      handoff.controllerId !== this.controllerId ||
      handoff.controllerVersion !== this.controllerVersion ||
      handoff.implementationId !== this.implementationId ||
      logicalTimeMs < handoff.exportedAtLogicalMs ||
      logicalTimeMs < handoff.sourceState.logicalTimeHighWaterMs
    )
      fail("strategy convergence handoff binding is invalid");
    const existing = await this.#store.load(this.#stateKey);
    if (existing) {
      const current = this.#validateState(existing);
      if (current.predecessorStateDigest === handoff.sourceStateDigest)
        return current;
      fail("strategy convergence handoff target conflicts with existing state");
    }
    const source = handoff.sourceState;
    const restored = createStrategyConvergenceStateV1({
      stateKey: this.#stateKey,
      controllerId: this.controllerId,
      controllerVersion: this.controllerVersion,
      implementationId: this.implementationId,
      policy: this.#policy,
      revision: 1,
      logicalTimeHighWaterMs: Math.max(
        logicalTimeMs,
        source.logicalTimeHighWaterMs,
      ),
      scopes: source.scopes,
      predecessorStateDigest: source.stateDigest,
      lastDecisionDigest: source.lastDecisionDigest,
    });
    if (await this.#store.save({ state: restored, expectedRevision: null }))
      return restored;
    const raced = await this.#store.load(this.#stateKey);
    if (raced) {
      const current = this.#validateState(raced);
      if (current.predecessorStateDigest === source.stateDigest) return current;
    }
    fail("strategy convergence handoff target conflicts with existing state");
  }

  #initialState(): StrategyConvergenceStateV1 {
    return createStrategyConvergenceStateV1({
      stateKey: this.#stateKey,
      controllerId: this.controllerId,
      controllerVersion: this.controllerVersion,
      implementationId: this.implementationId,
      policy: this.#policy,
    });
  }

  #validateState(input: unknown): StrategyConvergenceStateV1 {
    return validateStrategyConvergenceStateV1(input, { policy: this.#policy });
  }

  #assertBinding(state: StrategyConvergenceStateV1): void {
    if (
      state.stateKey !== this.#stateKey ||
      state.controllerId !== this.controllerId ||
      state.controllerVersion !== this.controllerVersion ||
      state.implementationId !== this.implementationId ||
      state.policyDigest !== this.policyDigest
    )
      fail("strategy convergence runtime binding changed");
  }
}

export class InMemoryStrategyConvergenceStoreV1 implements StrategyConvergenceStoreV1 {
  readonly #states = new Map<string, StrategyConvergenceStateV1>();

  async load(stateKey: string): Promise<StrategyConvergenceStateV1 | null> {
    const value = this.#states.get(stateKey);
    return value ? clone(value) : null;
  }

  async save(input: {
    readonly state: StrategyConvergenceStateV1;
    readonly expectedRevision: number | null;
  }): Promise<boolean> {
    const current = this.#states.get(input.state.stateKey);
    if (
      (input.expectedRevision === null && current) ||
      (input.expectedRevision !== null &&
        (!current || current.revision !== input.expectedRevision))
    )
      return false;
    this.#states.set(input.state.stateKey, clone(input.state));
    return true;
  }
}

export function validateStrategyConvergenceDecisionV1(
  input: unknown,
): StrategyConvergenceDecisionV1 {
  const value = exact(input, decisionKeys, "strategy convergence decision");
  schema(value.schemaVersion, "strategy convergence decision");
  const body = freeze({
    schemaVersion: 1 as const,
    requestDigest: sha(value.requestDigest, "decision.requestDigest"),
    scopeDigest: sha(value.scopeDigest, "decision.scopeDigest"),
    status: status(value.status),
    action: action(value.action),
    currentStrategyId: identifier(
      value.currentStrategyId,
      "decision.currentStrategyId",
    ),
    recommendedStrategyId:
      value.recommendedStrategyId === null
        ? null
        : identifier(
            value.recommendedStrategyId,
            "decision.recommendedStrategyId",
          ),
    scores: freeze(
      array(value.scores, "decision.scores", 256).map(validateScore),
    ),
    recommendation:
      value.recommendation === null
        ? null
        : validateRecommendation(value.recommendation),
    reasonCodes: reasonArray(value.reasonCodes, "decision.reasonCodes", 256),
    evaluatedAtLogicalMs: nonNegative(
      value.evaluatedAtLogicalMs,
      "decision.evaluatedAtLogicalMs",
    ),
    priorStateRevision: nonNegative(
      value.priorStateRevision,
      "decision.priorStateRevision",
    ),
    committedStateRevision: nonNegative(
      value.committedStateRevision,
      "decision.committedStateRevision",
    ),
  });
  if (body.committedStateRevision !== body.priorStateRevision + 1)
    fail("strategy convergence decision revision is invalid");
  if (
    (body.recommendation === null && body.recommendedStrategyId !== null) ||
    (body.recommendation !== null &&
      body.recommendation.strategyId !== body.recommendedStrategyId)
  )
    fail("strategy convergence decision recommendation is invalid");
  if (
    (body.action === "adopt" && body.recommendation === null) ||
    (body.recommendation !== null &&
      (body.recommendation.action !== body.action ||
        body.recommendation.scopeDigest !== body.scopeDigest ||
        !body.scores.some(
          (score) =>
            score.credible &&
            score.binding.bindingDigest === body.recommendation!.bindingDigest,
        )))
  )
    fail("strategy convergence decision action is invalid");
  const decisionDigest = digest("strategy-convergence-decision", body);
  if (
    value.decisionDigest !== decisionDigest ||
    value.decisionId !==
      `strategy-convergence-decision.${decisionDigest.slice(7)}`
  )
    fail("strategy convergence decision binding is invalid");
  return freeze({
    ...body,
    decisionId: value.decisionId as string,
    decisionDigest,
  });
}

export function validateStrategyConvergenceHandoffV1(
  input: unknown,
  options: { readonly policy: StrategyConvergencePolicyRecordV1 },
): StrategyConvergenceHandoffEnvelopeV1 {
  const value = exact(
    input,
    [
      "contentClass",
      "controllerId",
      "controllerVersion",
      "exportedAtLogicalMs",
      "format",
      "handoffDigest",
      "implementationId",
      "policyDigest",
      "schemaVersion",
      "sourceState",
      "sourceStateDigest",
      "sourceStateKey",
      "targetStateKey",
    ],
    "strategy convergence handoff",
  );
  if (
    value.format !== STRATEGY_CONVERGENCE_HANDOFF_FORMAT_V1 ||
    value.schemaVersion !== 1 ||
    value.contentClass !== "strategy_convergence_state"
  )
    fail("strategy convergence handoff format is invalid");
  const sourceState = validateStrategyConvergenceStateV1(value.sourceState, {
    policy: options.policy,
  });
  const body = freeze({
    format: STRATEGY_CONVERGENCE_HANDOFF_FORMAT_V1,
    schemaVersion: 1 as const,
    contentClass: "strategy_convergence_state" as const,
    controllerId: identifier(value.controllerId, "handoff.controllerId"),
    controllerVersion: positive(
      value.controllerVersion,
      "handoff.controllerVersion",
    ),
    implementationId: identifier(
      value.implementationId,
      "handoff.implementationId",
    ),
    policyDigest: sha(value.policyDigest, "handoff.policyDigest"),
    sourceStateKey: identifier(value.sourceStateKey, "handoff.sourceStateKey"),
    sourceStateDigest: sha(
      value.sourceStateDigest,
      "handoff.sourceStateDigest",
    ),
    targetStateKey: identifier(value.targetStateKey, "handoff.targetStateKey"),
    exportedAtLogicalMs: nonNegative(
      value.exportedAtLogicalMs,
      "handoff.exportedAtLogicalMs",
    ),
    sourceState,
  });
  if (
    body.policyDigest !== options.policy.policyDigest ||
    body.sourceStateKey !== sourceState.stateKey ||
    body.sourceStateDigest !== sourceState.stateDigest ||
    body.controllerId !== sourceState.controllerId ||
    body.controllerVersion !== sourceState.controllerVersion ||
    body.implementationId !== sourceState.implementationId
  )
    fail("strategy convergence handoff state binding is invalid");
  const handoffDigest = digest("strategy-convergence-handoff", body);
  if (value.handoffDigest !== handoffDigest)
    fail("strategy convergence handoff digest is invalid");
  return freeze({ ...body, handoffDigest });
}

function normalizePolicy(
  input: StrategyConvergencePolicyV1,
): StrategyConvergencePolicyV1 {
  const value = exact(input, policyKeys, "strategy convergence policy");
  schema(value.schemaVersion, "strategy convergence policy");
  const limitsValue = exact(
    value.limits,
    limitKeys,
    "strategy convergence limits",
  );
  const limits = freeze({
    maximumScopes: bounded(
      limitsValue.maximumScopes,
      "limits.maximumScopes",
      4096,
    ),
    maximumStrategiesPerScope: bounded(
      limitsValue.maximumStrategiesPerScope,
      "limits.maximumStrategiesPerScope",
      256,
    ),
    maximumObservationsPerCycle: bounded(
      limitsValue.maximumObservationsPerCycle,
      "limits.maximumObservationsPerCycle",
      4096,
    ),
    maximumHistoryPerScope: bounded(
      limitsValue.maximumHistoryPerScope,
      "limits.maximumHistoryPerScope",
      1024,
    ),
    maximumSourceIdsPerObservation: bounded(
      limitsValue.maximumSourceIdsPerObservation,
      "limits.maximumSourceIdsPerObservation",
      4096,
    ),
    maximumReasonCodesPerDecision: bounded(
      limitsValue.maximumReasonCodesPerDecision,
      "limits.maximumReasonCodesPerDecision",
      256,
    ),
    maximumObservationTtlMs: bounded(
      limitsValue.maximumObservationTtlMs,
      "limits.maximumObservationTtlMs",
      30 * 86_400_000,
    ),
    maximumFutureSkewMs: nonNegative(
      limitsValue.maximumFutureSkewMs,
      "limits.maximumFutureSkewMs",
    ),
    maximumCommitAttempts: bounded(
      limitsValue.maximumCommitAttempts,
      "limits.maximumCommitAttempts",
      64,
    ),
  });
  const policy = freeze({
    schemaVersion: 1 as const,
    policyId: identifier(value.policyId, "policy.policyId"),
    policyVersion: positive(value.policyVersion, "policy.policyVersion"),
    parentPolicyDigest:
      value.parentPolicyDigest === null
        ? null
        : sha(value.parentPolicyDigest, "policy.parentPolicyDigest"),
    minimumConfidenceBps: basisPoints(
      value.minimumConfidenceBps,
      "policy.minimumConfidenceBps",
    ),
    minimumDistinctPeers: bounded(
      value.minimumDistinctPeers,
      "policy.minimumDistinctPeers",
      limits.maximumSourceIdsPerObservation,
    ),
    minimumDistinctIndependenceGroups: bounded(
      value.minimumDistinctIndependenceGroups,
      "policy.minimumDistinctIndependenceGroups",
      limits.maximumSourceIdsPerObservation,
    ),
    minimumStableCycles: bounded(
      value.minimumStableCycles,
      "policy.minimumStableCycles",
      limits.maximumHistoryPerScope,
    ),
    recoveryStableCycles: bounded(
      value.recoveryStableCycles,
      "policy.recoveryStableCycles",
      limits.maximumHistoryPerScope,
    ),
    improvementMarginBps: basisPoints(
      value.improvementMarginBps,
      "policy.improvementMarginBps",
    ),
    diversityPreservationMarginBps: basisPoints(
      value.diversityPreservationMarginBps,
      "policy.diversityPreservationMarginBps",
    ),
    minimumCycleIntervalMs: bounded(
      value.minimumCycleIntervalMs,
      "policy.minimumCycleIntervalMs",
      30 * 86_400_000,
    ),
    cooldownDurationMs: bounded(
      value.cooldownDurationMs,
      "policy.cooldownDurationMs",
      30 * 86_400_000,
    ),
    oscillationWindowMs: bounded(
      value.oscillationWindowMs,
      "policy.oscillationWindowMs",
      30 * 86_400_000,
    ),
    maximumTransitionsPerOscillationWindow: bounded(
      value.maximumTransitionsPerOscillationWindow,
      "policy.maximumTransitionsPerOscillationWindow",
      limits.maximumHistoryPerScope,
    ),
    maximumPriorInfluenceBps: basisPoints(
      value.maximumPriorInfluenceBps,
      "policy.maximumPriorInfluenceBps",
    ),
    recommendationTtlMs: bounded(
      value.recommendationTtlMs,
      "policy.recommendationTtlMs",
      limits.maximumObservationTtlMs,
    ),
    limits,
  });
  if (policy.recoveryStableCycles < policy.minimumStableCycles)
    fail("strategy convergence recovery window is too short");
  return policy;
}

function normalizeObservationBody(
  input: Omit<
    StrategyConvergenceObservationV1,
    "observationId" | "observationDigest"
  >,
): Omit<
  StrategyConvergenceObservationV1,
  "observationId" | "observationDigest"
> {
  schema(input.schemaVersion, "strategy convergence observation");
  const body = freeze({
    schemaVersion: 1 as const,
    evidencePolicyDigest: sha(
      input.evidencePolicyDigest,
      "observation.evidencePolicyDigest",
    ),
    membershipEpoch: positive(
      input.membershipEpoch,
      "observation.membershipEpoch",
    ),
    membershipConfigurationDigest: sha(
      input.membershipConfigurationDigest,
      "observation.membershipConfigurationDigest",
    ),
    cohortDigest: sha(input.cohortDigest, "observation.cohortDigest"),
    binding: validatePeerStrategyEvidenceBindingV1(input.binding),
    certificateDigest: sha(
      input.certificateDigest,
      "observation.certificateDigest",
    ),
    attesterPeerIds: identifierArray(
      input.attesterPeerIds,
      "observation.attesterPeerIds",
      4096,
    ),
    independenceGroupIds: identifierArray(
      input.independenceGroupIds,
      "observation.independenceGroupIds",
      4096,
    ),
    outcome: outcome(input.outcome),
    confidenceBps: basisPoints(
      input.confidenceBps,
      "observation.confidenceBps",
    ),
    observedAtLogicalMs: nonNegative(
      input.observedAtLogicalMs,
      "observation.observedAtLogicalMs",
    ),
    validUntilLogicalMs: positive(
      input.validUntilLogicalMs,
      "observation.validUntilLogicalMs",
    ),
  });
  if (body.validUntilLogicalMs <= body.observedAtLogicalMs)
    fail("strategy convergence observation lifetime is invalid");
  return body;
}

function normalizeRequestBody(
  input: Omit<StrategyConvergenceCycleRequestV1, "requestDigest">,
): Omit<StrategyConvergenceCycleRequestV1, "requestDigest"> {
  schema(input.schemaVersion, "strategy convergence cycle request");
  const scope = validateStrategyConvergenceScopeV1(input.scope);
  const currentStrategy = validatePeerStrategyEvidenceBindingV1(
    input.currentStrategy,
  );
  const eligibleStrategies = freeze(
    [...array(input.eligibleStrategies, "request.eligibleStrategies", 256)]
      .map(validatePeerStrategyEvidenceBindingV1)
      .sort(bindingOrder),
  );
  unique(
    eligibleStrategies.map(({ bindingDigest }) => bindingDigest),
    "eligible strategy bindings",
  );
  if (
    currentStrategy.operation !== scope.operation ||
    eligibleStrategies.some(({ operation: value }) => value !== scope.operation)
  )
    fail("strategy convergence operation binding is invalid");
  const observations = freeze(
    [...array(input.observations, "request.observations", 4096)]
      .map(validateStrategyConvergenceObservationV1)
      .sort(observationOrder),
  );
  unique(
    observations.map(({ observationDigest }) => observationDigest),
    "strategy convergence observations",
  );
  return freeze({
    schemaVersion: 1 as const,
    cycleId: identifier(input.cycleId, "request.cycleId"),
    scope,
    currentStrategy,
    eligibleStrategies,
    connectivity: connectivity(input.connectivity),
    observations,
    logicalTimeMs: nonNegative(input.logicalTimeMs, "request.logicalTimeMs"),
  });
}

function scoreRequest(
  request: StrategyConvergenceCycleRequestV1,
  policy: StrategyConvergencePolicyRecordV1,
  reasons: Set<string>,
): readonly StrategyConvergenceScoreV1[] {
  if (
    request.eligibleStrategies.length >
    policy.policy.limits.maximumStrategiesPerScope
  )
    fail("strategy convergence strategy capacity is exceeded");
  if (
    request.observations.length >
    policy.policy.limits.maximumObservationsPerCycle
  )
    fail("strategy convergence observation capacity is exceeded");
  const certificateHeads = new Map<string, StrategyConvergenceObservationV1>();
  for (const observation of request.observations) {
    if (
      observation.attesterPeerIds.length >
        policy.policy.limits.maximumSourceIdsPerObservation ||
      observation.independenceGroupIds.length >
        policy.policy.limits.maximumSourceIdsPerObservation
    )
      fail("strategy convergence observation source capacity is exceeded");
    if (
      observation.cohortDigest !== request.scope.cohortDigest ||
      observation.binding.operation !== request.scope.operation
    ) {
      reasons.add("observation_scope_mismatch");
      continue;
    }
    if (
      observation.observedAtLogicalMs >
        request.logicalTimeMs + policy.policy.limits.maximumFutureSkewMs ||
      observation.validUntilLogicalMs <= request.logicalTimeMs ||
      observation.validUntilLogicalMs - observation.observedAtLogicalMs >
        policy.policy.limits.maximumObservationTtlMs
    ) {
      reasons.add("observation_outside_validity_window");
      continue;
    }
    const prior = certificateHeads.get(observation.certificateDigest);
    if (prior && prior.observationDigest !== observation.observationDigest)
      fail("strategy convergence certificate projection conflicts");
    certificateHeads.set(observation.certificateDigest, observation);
  }
  const admitted = [...certificateHeads.values()];
  const latestEpoch = Math.max(
    0,
    ...admitted.map(({ membershipEpoch }) => membershipEpoch),
  );
  const latest = admitted.filter(
    ({ membershipEpoch }) => membershipEpoch === latestEpoch,
  );
  const configurations = new Set(
    latest.map(
      ({ membershipConfigurationDigest }) => membershipConfigurationDigest,
    ),
  );
  const evidencePolicies = new Set(
    latest.map(({ evidencePolicyDigest }) => evidencePolicyDigest),
  );
  if (configurations.size > 1) reasons.add("membership_configuration_conflict");
  if (evidencePolicies.size > 1) reasons.add("evidence_policy_conflict");
  // Strategies are comparable only inside one exact current membership and
  // evidence-policy view. A fork invalidates the whole cycle, not merely one
  // strategy, so stale or split views cannot be ranked against each other.
  const observations =
    configurations.size > 1 || evidencePolicies.size > 1 ? [] : latest;
  const scores = request.eligibleStrategies.map((binding) => {
    const selected = observations.filter(
      (observation) =>
        observation.binding.bindingDigest === binding.bindingDigest,
    );
    // Intersections prevent replayed or rotating certificates from amplifying
    // source coverage across time. Every counted source must be present in all
    // observations that contribute to the aggregate score.
    const peers = intersection(
      selected.map(({ attesterPeerIds }) => attesterPeerIds),
    );
    const groups = intersection(
      selected.map(({ independenceGroupIds }) => independenceGroupIds),
    );
    const unsafe = selected.some(({ outcome: value }) => value === "unsafe");
    const aggregateOutcome = aggregateOutcomeOf(
      selected.map(({ outcome: value }) => value),
    );
    const confidenceBps = selected.length
      ? lowerMedian(selected.map(({ confidenceBps: value }) => value))
      : 0;
    const scoreBps = aggregateOutcome === "success" ? confidenceBps : 0;
    const credible = Boolean(
      !unsafe &&
      aggregateOutcome === "success" &&
      confidenceBps >= policy.policy.minimumConfidenceBps &&
      peers.length >= policy.policy.minimumDistinctPeers &&
      groups.length >= policy.policy.minimumDistinctIndependenceGroups,
    );
    return freeze({
      schemaVersion: 1 as const,
      binding,
      outcome: aggregateOutcome,
      scoreBps,
      confidenceBps,
      attesterPeerIds: freeze(peers),
      independenceGroupIds: freeze(groups),
      observationDigests: freeze(
        selected
          .map(({ observationDigest }) => observationDigest)
          .sort(compare),
      ),
      credible,
      unsafe,
    });
  });
  return freeze(
    scores.sort(
      (left, right) =>
        Number(right.credible) - Number(left.credible) ||
        right.scoreBps - left.scoreBps ||
        compare(left.binding.strategyId, right.binding.strategyId) ||
        compare(left.binding.bindingDigest, right.binding.bindingDigest),
    ),
  );
}

function createRecommendation(
  request: StrategyConvergenceCycleRequestV1,
  selected: StrategyConvergenceScoreV1,
  actionValue: StrategyConvergenceActionV1,
  policy: StrategyConvergencePolicyRecordV1,
): StrategyConvergenceRecommendationV1 | null {
  if (!selected.credible || (actionValue !== "hold" && actionValue !== "adopt"))
    return null;
  const sourceObservations = request.observations.filter(
    ({ observationDigest }) =>
      selected.observationDigests.includes(observationDigest),
  );
  const validUntilLogicalMs = Math.min(
    request.logicalTimeMs + policy.policy.recommendationTtlMs,
    ...sourceObservations.map(({ validUntilLogicalMs: value }) => value),
  );
  const connectivityFactor = request.connectivity === "degraded" ? 5_000 : BPS;
  const influenceBps = Math.floor(
    (policy.policy.maximumPriorInfluenceBps *
      selected.confidenceBps *
      connectivityFactor) /
      (BPS * BPS),
  );
  const body = freeze({
    schemaVersion: 1 as const,
    scopeDigest: request.scope.scopeDigest,
    operation: request.scope.operation,
    strategyId: selected.binding.strategyId,
    strategyDigest: selected.binding.strategyDigest,
    bindingDigest: selected.binding.bindingDigest,
    action: actionValue as "hold" | "adopt",
    confidenceBps: selected.confidenceBps,
    influenceBps,
    evidenceDigests: selected.observationDigests,
    observedAtLogicalMs: request.logicalTimeMs,
    validUntilLogicalMs,
  });
  return freeze({
    ...body,
    recommendationDigest: digest("strategy-convergence-recommendation", body),
  });
}

function normalizeScopeState(
  input: StrategyConvergenceScopeStateV1,
  policy: StrategyConvergencePolicyRecordV1,
): StrategyConvergenceScopeStateV1 {
  const value = exact(
    input,
    scopeStateKeys,
    "strategy convergence scope state",
  );
  schema(value.schemaVersion, "strategy convergence scope state");
  const scope = validateStrategyConvergenceScopeV1(value.scope);
  const currentStrategy = validatePeerStrategyEvidenceBindingV1(
    value.currentStrategy,
  );
  const candidateStrategy =
    value.candidateStrategy === null
      ? null
      : validatePeerStrategyEvidenceBindingV1(value.candidateStrategy);
  if (
    currentStrategy.operation !== scope.operation ||
    (candidateStrategy && candidateStrategy.operation !== scope.operation)
  )
    fail("strategy convergence scope state operation is invalid");
  const history = freeze(
    array(
      value.history,
      "scopeState.history",
      policy.policy.limits.maximumHistoryPerScope,
    ).map(validateHistory),
  );
  for (let index = 1; index < history.length; index += 1) {
    if (
      history[index]!.evaluatedAtLogicalMs <
      history[index - 1]!.evaluatedAtLogicalMs
    )
      fail("strategy convergence history order is invalid");
  }
  const lastDecision =
    value.lastDecision === null
      ? null
      : validateStrategyConvergenceDecisionV1(value.lastDecision);
  if (
    lastDecision &&
    (lastDecision.scopeDigest !== scope.scopeDigest ||
      lastDecision.requestDigest !== history.at(-1)?.requestDigest ||
      lastDecision.currentStrategyId !== currentStrategy.strategyId ||
      lastDecision.status !== value.lastStatus)
  )
    fail("strategy convergence scope decision is invalid");
  if (
    (candidateStrategy === null && value.candidateCycles !== 0) ||
    (candidateStrategy !== null && value.candidateCycles === 0) ||
    (lastDecision === null && history.length > 0) ||
    (lastDecision !== null && history.length === 0)
  )
    fail("strategy convergence scope state invariant is invalid");
  return freeze({
    schemaVersion: 1,
    scope,
    currentStrategy,
    candidateStrategy,
    candidateCycles: integerRange(
      value.candidateCycles,
      "scopeState.candidateCycles",
      0,
      policy.policy.limits.maximumHistoryPerScope,
    ),
    stableCycles: integerRange(
      value.stableCycles,
      "scopeState.stableCycles",
      0,
      policy.policy.limits.maximumHistoryPerScope,
    ),
    recoveryCycles: integerRange(
      value.recoveryCycles,
      "scopeState.recoveryCycles",
      0,
      policy.policy.limits.maximumHistoryPerScope,
    ),
    cooldownUntilLogicalMs: nonNegative(
      value.cooldownUntilLogicalMs,
      "scopeState.cooldownUntilLogicalMs",
    ),
    oscillationGuardUntilLogicalMs: nonNegative(
      value.oscillationGuardUntilLogicalMs,
      "scopeState.oscillationGuardUntilLogicalMs",
    ),
    lastStatus: status(value.lastStatus),
    lastDecision,
    history,
  });
}

function validateScore(input: unknown): StrategyConvergenceScoreV1 {
  const value = exact(input, scoreKeys, "strategy convergence score");
  schema(value.schemaVersion, "strategy convergence score");
  const score = freeze({
    schemaVersion: 1 as const,
    binding: validatePeerStrategyEvidenceBindingV1(value.binding),
    outcome: outcome(value.outcome),
    scoreBps: basisPoints(value.scoreBps, "score.scoreBps"),
    confidenceBps: basisPoints(value.confidenceBps, "score.confidenceBps"),
    attesterPeerIds: identifierArray(
      value.attesterPeerIds,
      "score.attesterPeerIds",
      4096,
    ),
    independenceGroupIds: identifierArray(
      value.independenceGroupIds,
      "score.independenceGroupIds",
      4096,
    ),
    observationDigests: digestArray(
      value.observationDigests,
      "score.observationDigests",
      4096,
    ),
    credible: boolean(value.credible, "score.credible"),
    unsafe: boolean(value.unsafe, "score.unsafe"),
  });
  if (
    (score.outcome === "unsafe") !== score.unsafe ||
    (score.outcome !== "success" && score.scoreBps !== 0) ||
    (score.outcome === "success" && score.scoreBps !== score.confidenceBps) ||
    (score.credible && (score.outcome !== "success" || score.unsafe))
  )
    fail("strategy convergence score invariant is invalid");
  return score;
}

function validateRecommendation(
  input: unknown,
): StrategyConvergenceRecommendationV1 {
  const value = exact(
    input,
    recommendationKeys,
    "strategy convergence recommendation",
  );
  schema(value.schemaVersion, "strategy convergence recommendation");
  if (value.action !== "hold" && value.action !== "adopt")
    fail("strategy convergence recommendation action is invalid");
  const body = freeze({
    schemaVersion: 1 as const,
    scopeDigest: sha(value.scopeDigest, "recommendation.scopeDigest"),
    operation: operation(value.operation),
    strategyId: identifier(value.strategyId, "recommendation.strategyId"),
    strategyDigest: sha(value.strategyDigest, "recommendation.strategyDigest"),
    bindingDigest: sha(value.bindingDigest, "recommendation.bindingDigest"),
    action: value.action as "hold" | "adopt",
    confidenceBps: basisPoints(
      value.confidenceBps,
      "recommendation.confidenceBps",
    ),
    influenceBps: basisPoints(
      value.influenceBps,
      "recommendation.influenceBps",
    ),
    evidenceDigests: digestArray(
      value.evidenceDigests,
      "recommendation.evidenceDigests",
      4096,
    ),
    observedAtLogicalMs: nonNegative(
      value.observedAtLogicalMs,
      "recommendation.observedAtLogicalMs",
    ),
    validUntilLogicalMs: positive(
      value.validUntilLogicalMs,
      "recommendation.validUntilLogicalMs",
    ),
  });
  if (body.validUntilLogicalMs <= body.observedAtLogicalMs)
    fail("strategy convergence recommendation lifetime is invalid");
  const recommendationDigest = digest(
    "strategy-convergence-recommendation",
    body,
  );
  if (value.recommendationDigest !== recommendationDigest)
    fail("strategy convergence recommendation digest is invalid");
  return freeze({ ...body, recommendationDigest });
}

function validateHistory(input: unknown): StrategyConvergenceHistoryEntryV1 {
  const value = exact(input, historyKeys, "strategy convergence history entry");
  schema(value.schemaVersion, "strategy convergence history entry");
  return freeze({
    schemaVersion: 1,
    requestDigest: sha(value.requestDigest, "history.requestDigest"),
    currentStrategyId: identifier(
      value.currentStrategyId,
      "history.currentStrategyId",
    ),
    recommendedStrategyId:
      value.recommendedStrategyId === null
        ? null
        : identifier(
            value.recommendedStrategyId,
            "history.recommendedStrategyId",
          ),
    action: action(value.action),
    status: status(value.status),
    connectivity: connectivity(value.connectivity),
    evaluatedAtLogicalMs: nonNegative(
      value.evaluatedAtLogicalMs,
      "history.evaluatedAtLogicalMs",
    ),
  });
}

function initialScopeState(
  request: StrategyConvergenceCycleRequestV1,
): StrategyConvergenceScopeStateV1 {
  return freeze({
    schemaVersion: 1,
    scope: request.scope,
    currentStrategy: request.currentStrategy,
    candidateStrategy: null,
    candidateCycles: 0,
    stableCycles: 0,
    recoveryCycles: 0,
    cooldownUntilLogicalMs: 0,
    oscillationGuardUntilLogicalMs: 0,
    lastStatus: "insufficient_evidence",
    lastDecision: null,
    history: freeze([]),
  });
}

function historyProbe(
  request: StrategyConvergenceCycleRequestV1,
): StrategyConvergenceHistoryEntryV1 {
  return freeze({
    schemaVersion: 1,
    requestDigest: request.requestDigest,
    currentStrategyId: request.currentStrategy.strategyId,
    recommendedStrategyId: null,
    action: "hold",
    status: "insufficient_evidence",
    connectivity: request.connectivity,
    evaluatedAtLogicalMs: request.logicalTimeMs,
  });
}

function transitionCount(
  history: readonly StrategyConvergenceHistoryEntryV1[],
): number {
  let transitions = 0;
  for (let index = 1; index < history.length; index += 1) {
    if (
      history[index]!.currentStrategyId !==
      history[index - 1]!.currentStrategyId
    )
      transitions += 1;
  }
  return transitions;
}

function requiredStableCycles(
  connectivityValue: StrategyConvergenceConnectivityV1,
  policy: StrategyConvergencePolicyRecordV1,
): number {
  if (connectivityValue === "recovering")
    return policy.policy.recoveryStableCycles;
  if (connectivityValue === "degraded")
    return policy.policy.minimumStableCycles + 1;
  return policy.policy.minimumStableCycles;
}

function aggregateOutcomeOf(
  values: readonly PeerStrategyEvidenceOutcomeV1[],
): PeerStrategyEvidenceOutcomeV1 {
  if (values.length === 0) return "indeterminate";
  if (values.includes("unsafe")) return "unsafe";
  if (values.includes("failure")) return "failure";
  return values.every((value) => value === "success")
    ? "success"
    : "indeterminate";
}

function lowerMedian(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) / 2)]!;
}

function boundedReasons(
  values: ReadonlySet<string>,
  policy: StrategyConvergencePolicyRecordV1,
): readonly string[] {
  return freeze(
    [...values]
      .sort(compare)
      .slice(0, policy.policy.limits.maximumReasonCodesPerDecision),
  );
}

function bindingOrder(
  left: PeerStrategyEvidenceBindingV1,
  right: PeerStrategyEvidenceBindingV1,
): number {
  return (
    compare(left.operation, right.operation) ||
    compare(left.strategyId, right.strategyId) ||
    compare(left.bindingDigest, right.bindingDigest)
  );
}

function observationOrder(
  left: StrategyConvergenceObservationV1,
  right: StrategyConvergenceObservationV1,
): number {
  return (
    compare(left.binding.bindingDigest, right.binding.bindingDigest) ||
    left.membershipEpoch - right.membershipEpoch ||
    compare(left.certificateDigest, right.certificateDigest)
  );
}

function digest(
  domain: Parameters<typeof digestPlanningJsonV1>[0],
  value: unknown,
): PlanningDigestV1 {
  return digestPlanningJsonV1(domain, value as PlanningJson);
}

function exact(
  input: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    (Object.getPrototypeOf(input) !== Object.prototype &&
      Object.getPrototypeOf(input) !== null) ||
    Object.getOwnPropertySymbols(input).length > 0
  )
    fail(`${label} is invalid`);
  const value = input as Record<string, unknown>;
  const actual = Object.getOwnPropertyNames(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    fail(`${label} shape is invalid`);
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
      fail(`${label} shape is invalid`);
  }
  return value;
}

function array(
  input: unknown,
  label: string,
  maximum: number,
): readonly unknown[] {
  if (!Array.isArray(input)) fail(`${label} is invalid`);
  const lengthDescriptor = Object.getOwnPropertyDescriptor(input, "length");
  const length =
    lengthDescriptor && "value" in lengthDescriptor
      ? lengthDescriptor.value
      : -1;
  if (
    !Number.isSafeInteger(length) ||
    length < 0 ||
    length > maximum ||
    Object.getOwnPropertySymbols(input).length > 0
  )
    fail(`${label} is invalid`);
  const names = Object.getOwnPropertyNames(input);
  if (names.length !== length + 1 || !names.includes("length"))
    fail(`${label} is invalid`);
  const values: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
      fail(`${label} is invalid`);
    values.push(descriptor.value);
  }
  return values;
}

function identifier(input: unknown, label: string): string {
  if (typeof input !== "string" || !IDENTIFIER.test(input))
    fail(`${label} is invalid`);
  return input;
}

function sha(input: unknown, label: string): PlanningDigestV1 {
  if (typeof input !== "string" || !DIGEST.test(input))
    fail(`${label} is invalid`);
  return input as PlanningDigestV1;
}

function operation(input: unknown): LocalStrategyOperationV1 {
  if (typeof input !== "string" || !operationSet.has(input))
    fail("strategy convergence operation is invalid");
  return input as LocalStrategyOperationV1;
}

function connectivity(input: unknown): StrategyConvergenceConnectivityV1 {
  if (typeof input !== "string" || !connectivitySet.has(input))
    fail("strategy convergence connectivity is invalid");
  return input as StrategyConvergenceConnectivityV1;
}

function status(input: unknown): StrategyConvergenceStatusV1 {
  if (typeof input !== "string" || !statusSet.has(input))
    fail("strategy convergence status is invalid");
  return input as StrategyConvergenceStatusV1;
}

function action(input: unknown): StrategyConvergenceActionV1 {
  if (typeof input !== "string" || !actionSet.has(input))
    fail("strategy convergence action is invalid");
  return input as StrategyConvergenceActionV1;
}

function outcome(input: unknown): PeerStrategyEvidenceOutcomeV1 {
  if (typeof input !== "string" || !outcomeSet.has(input))
    fail("strategy convergence outcome is invalid");
  return input as PeerStrategyEvidenceOutcomeV1;
}

function schema(input: unknown, label: string): void {
  if (input !== STRATEGY_CONVERGENCE_SCHEMA_VERSION_V1)
    fail(`${label} schema is invalid`);
}

function positive(input: unknown, label: string): number {
  return integerRange(input, label, 1, Number.MAX_SAFE_INTEGER);
}

function nonNegative(input: unknown, label: string): number {
  return integerRange(input, label, 0, Number.MAX_SAFE_INTEGER);
}

function bounded(input: unknown, label: string, maximum: number): number {
  return integerRange(input, label, 1, maximum);
}

function basisPoints(input: unknown, label: string): number {
  return integerRange(input, label, 0, BPS);
}

function integerRange(
  input: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(input) ||
    (input as number) < minimum ||
    (input as number) > maximum
  )
    fail(`${label} is invalid`);
  return input as number;
}

function boolean(input: unknown, label: string): boolean {
  if (typeof input !== "boolean") fail(`${label} is invalid`);
  return input;
}

function identifierArray(
  input: unknown,
  label: string,
  maximum: number,
): readonly string[] {
  const values = array(input, label, maximum).map((value, index) =>
    identifier(value, `${label}[${index}]`),
  );
  const result = sortedUnique(values);
  if (result.length !== values.length) fail(`${label} contains duplicates`);
  return freeze(result);
}

function digestArray(
  input: unknown,
  label: string,
  maximum: number,
): readonly PlanningDigestV1[] {
  const values = array(input, label, maximum).map((value, index) =>
    sha(value, `${label}[${index}]`),
  );
  const result = sortedUnique(values) as PlanningDigestV1[];
  if (result.length !== values.length) fail(`${label} contains duplicates`);
  return freeze(result);
}

function reasonArray(
  input: unknown,
  label: string,
  maximum: number,
): readonly string[] {
  const values = array(input, label, maximum).map((value, index) =>
    identifier(value, `${label}[${index}]`),
  );
  return freeze(values);
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compare);
}

function intersection(values: readonly (readonly string[])[]): string[] {
  if (values.length === 0) return [];
  const rest = values.slice(1).map((items) => new Set(items));
  return sortedUnique(
    values[0]!.filter((item) => rest.every((set) => set.has(item))),
  );
}

function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length)
    fail(`${label} contain duplicates`);
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function freeze<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}

function fail(message: string): never {
  throw new TypeError(message);
}
