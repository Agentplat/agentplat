import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";

import {
  createMorphogenesisStrategyCatalogV3,
  createMorphogenesisStrategySelectionRequestV3,
  type MorphogenesisStrategyCatalogV3,
} from "./morphogenesis-strategy-adaptation.js";
import type { LocalStrategyScopeV1 } from "./strategy-adaptation-contracts.js";

export type MorphogenesisStrategyGovernanceActionV3 =
  "promote" | "degrade" | "retire" | "rollback";
export type MorphogenesisStrategyReviewRouteV3 =
  "authorized_agent" | "authorized_person" | "collective";
export type MorphogenesisStrategyLifecycleStatusV3 =
  "baseline" | "candidate" | "promoted" | "degraded" | "retired";

export interface MorphogenesisStrategyGovernancePolicyV3 {
  readonly schemaVersion: 3;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly parentPolicyDigest: PlanningDigestV1 | null;
  readonly allowedActions: readonly MorphogenesisStrategyGovernanceActionV3[];
  readonly allowedReviewRoutes: readonly MorphogenesisStrategyReviewRouteV3[];
  readonly requireIndependentReviewer: boolean;
  readonly minimumConfidenceBps: number;
  readonly cooldownMs: number;
  readonly transitionWindowMs: number;
  readonly maximumTransitionsPerWindow: number;
  readonly maximumPendingRecommendations: number;
  readonly maximumReviewHistory: number;
  readonly maximumTransitionHistory: number;
  readonly maximumCommitAttempts: number;
  readonly policyDigest: PlanningDigestV1;
}

export interface MorphogenesisStrategyRecommendationV3 {
  readonly schemaVersion: 3;
  readonly recommendationId: AgentPlatID;
  readonly action: MorphogenesisStrategyGovernanceActionV3;
  readonly targetStrategyId: AgentPlatID;
  readonly replacementStrategyId: AgentPlatID | null;
  readonly catalogDigest: PlanningDigestV1;
  readonly governanceStateDigest: PlanningDigestV1;
  readonly governanceStateRevision: number;
  readonly adaptationStateDigest: PlanningDigestV1;
  readonly adaptationStateRevision: number;
  readonly evidenceDigests: readonly PlanningDigestV1[];
  readonly counterfactualDigest: PlanningDigestV1 | null;
  readonly riskDigest: PlanningDigestV1;
  readonly costDigest: PlanningDigestV1;
  readonly confidenceBps: number;
  readonly proposerId: AgentPlatID;
  readonly proposerImplementationDigest: PlanningDigestV1;
  readonly reviewRoute: MorphogenesisStrategyReviewRouteV3;
  readonly reasonCodes: readonly string[];
  readonly proposedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly advisoryOnly: true;
  readonly recommendationDigest: PlanningDigestV1;
}

export interface MorphogenesisStrategyReviewV3 {
  readonly schemaVersion: 3;
  readonly reviewId: AgentPlatID;
  readonly recommendationId: AgentPlatID;
  readonly recommendationDigest: PlanningDigestV1;
  readonly route: MorphogenesisStrategyReviewRouteV3;
  readonly actorType: "agent" | "person" | "collective";
  readonly actorId: AgentPlatID;
  readonly actorMandateDigest: PlanningDigestV1;
  readonly independenceGroupId: AgentPlatID;
  readonly disposition: "approved" | "rejected";
  readonly proofDigest: PlanningDigestV1;
  readonly reviewedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly reviewDigest: PlanningDigestV1;
}

export interface MorphogenesisStrategyGovernanceEntryV3 {
  readonly schemaVersion: 3;
  readonly strategyId: AgentPlatID;
  readonly definitionDigest: PlanningDigestV1;
  readonly status: MorphogenesisStrategyLifecycleStatusV3;
  readonly statusRevision: number;
  readonly lastTransitionDigest: PlanningDigestV1 | null;
}

export interface MorphogenesisStrategyGovernanceTransitionV3 {
  readonly schemaVersion: 3;
  readonly recommendationId: AgentPlatID;
  readonly recommendationDigest: PlanningDigestV1;
  readonly reviewDigest: PlanningDigestV1;
  readonly action: MorphogenesisStrategyGovernanceActionV3;
  readonly targetStrategyId: AgentPlatID;
  readonly replacementStrategyId: AgentPlatID | null;
  readonly priorActiveStrategyId: AgentPlatID;
  readonly nextActiveStrategyId: AgentPlatID;
  readonly appliedAtLogicalMs: number;
  readonly transitionDigest: PlanningDigestV1;
}

export interface MorphogenesisStrategyGovernanceStateV3 {
  readonly schemaVersion: 3;
  readonly stateKey: AgentPlatID;
  readonly policyDigest: PlanningDigestV1;
  readonly catalogDigest: PlanningDigestV1;
  readonly baselineStrategyId: AgentPlatID;
  readonly activeStrategyId: AgentPlatID;
  readonly entries: readonly MorphogenesisStrategyGovernanceEntryV3[];
  readonly pendingRecommendations: readonly MorphogenesisStrategyRecommendationV3[];
  readonly reviews: readonly MorphogenesisStrategyReviewV3[];
  readonly transitions: readonly MorphogenesisStrategyGovernanceTransitionV3[];
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly predecessorStateDigest: PlanningDigestV1 | null;
  readonly stateDigest: PlanningDigestV1;
}

export interface MorphogenesisStrategyReviewPortV3 {
  review(input: {
    readonly recommendation: MorphogenesisStrategyRecommendationV3;
    readonly policy: MorphogenesisStrategyGovernancePolicyV3;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisStrategyReviewV3 | null>;
}

export interface MorphogenesisStrategyGovernanceStoreV3 {
  load(stateKey: AgentPlatID): Promise<MorphogenesisStrategyGovernanceStateV3 | null>;
  save(input: {
    readonly state: MorphogenesisStrategyGovernanceStateV3;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }): Promise<boolean>;
}

export function createMorphogenesisStrategyGovernancePolicyV3(
  input: Omit<MorphogenesisStrategyGovernancePolicyV3, "policyDigest">,
): MorphogenesisStrategyGovernancePolicyV3 {
  if (input.schemaVersion !== 3) fail("Morphogenesis strategy governance policy version is invalid");
  const body = freeze({
    schemaVersion: 3 as const,
    policyId: id(input.policyId),
    policyVersion: positive(input.policyVersion),
    parentPolicyDigest: nullableSha(input.parentPolicyDigest),
    allowedActions: enums(input.allowedActions, ACTIONS, "strategy governance actions"),
    allowedReviewRoutes: enums(input.allowedReviewRoutes, ROUTES, "strategy review routes"),
    requireIndependentReviewer: boolean(input.requireIndependentReviewer),
    minimumConfidenceBps: bps(input.minimumConfidenceBps),
    cooldownMs: nonNegative(input.cooldownMs),
    transitionWindowMs: positive(input.transitionWindowMs),
    maximumTransitionsPerWindow: positive(input.maximumTransitionsPerWindow),
    maximumPendingRecommendations: positive(input.maximumPendingRecommendations),
    maximumReviewHistory: positive(input.maximumReviewHistory),
    maximumTransitionHistory: positive(input.maximumTransitionHistory),
    maximumCommitAttempts: positive(input.maximumCommitAttempts),
  });
  return freeze({ ...body, policyDigest: digest("morphogenesis-strategy-governance-policy-v3", body) });
}

export function createMorphogenesisStrategyReviewV3(
  input: Omit<MorphogenesisStrategyReviewV3, "schemaVersion" | "reviewDigest">,
): MorphogenesisStrategyReviewV3 {
  const expectedActor = input.route === "authorized_agent" ? "agent"
    : input.route === "authorized_person" ? "person" : "collective";
  if (input.actorType !== expectedActor) fail("Morphogenesis strategy reviewer type is invalid");
  const body = freeze({
    schemaVersion: 3 as const,
    reviewId: id(input.reviewId),
    recommendationId: id(input.recommendationId),
    recommendationDigest: sha(input.recommendationDigest),
    route: one<MorphogenesisStrategyReviewRouteV3>(input.route, ROUTES, "strategy review route"),
    actorType: input.actorType,
    actorId: id(input.actorId),
    actorMandateDigest: sha(input.actorMandateDigest),
    independenceGroupId: id(input.independenceGroupId),
    disposition: one<"approved" | "rejected">(input.disposition, new Set(["approved", "rejected"]), "review disposition"),
    proofDigest: sha(input.proofDigest),
    reviewedAtLogicalMs: nonNegative(input.reviewedAtLogicalMs),
    expiresAtLogicalMs: positive(input.expiresAtLogicalMs),
  });
  if (body.expiresAtLogicalMs <= body.reviewedAtLogicalMs) fail("Morphogenesis strategy review window is invalid");
  return freeze({ ...body, reviewDigest: digest("morphogenesis-strategy-review-v3", body) });
}

export class MorphogenesisStrategyGovernanceRuntimeV3 {
  readonly #policy: MorphogenesisStrategyGovernancePolicyV3;
  readonly #catalog: MorphogenesisStrategyCatalogV3;
  constructor(readonly options: {
    readonly stateKey: AgentPlatID;
    readonly policy: MorphogenesisStrategyGovernancePolicyV3;
    readonly catalog: MorphogenesisStrategyCatalogV3;
    readonly reviews: MorphogenesisStrategyReviewPortV3;
    readonly store: MorphogenesisStrategyGovernanceStoreV3;
  }) {
    if (!options?.reviews || !options?.store) fail("Morphogenesis strategy governance options are required");
    id(options.stateKey);
    this.#policy = validatePolicy(options.policy);
    this.#catalog = validateCatalog(options.catalog);
  }

  async recommend(input: Omit<MorphogenesisStrategyRecommendationV3,
    "schemaVersion" | "catalogDigest" | "governanceStateDigest" |
    "governanceStateRevision" | "advisoryOnly" | "recommendationDigest">) {
    for (let attempt = 0; attempt < this.#policy.maximumCommitAttempts; attempt += 1) {
      const current = await this.#loadOrInitialize(input.proposedAtLogicalMs);
      const retained = current.pendingRecommendations.find(
        ({ recommendationId }) => recommendationId === input.recommendationId,
      );
      if (retained) {
        const replay = createRecommendation({
          ...input,
          catalogDigest: retained.catalogDigest,
          governanceStateDigest: retained.governanceStateDigest,
          governanceStateRevision: retained.governanceStateRevision,
        });
        if (replay.recommendationDigest !== retained.recommendationDigest)
          fail("Morphogenesis strategy recommendation identity was reused with different content");
        return retained;
      }
      if (current.reviews.some(({ recommendationId }) =>
          recommendationId === input.recommendationId) ||
          current.transitions.some(({ recommendationId }) =>
            recommendationId === input.recommendationId))
        fail("Morphogenesis strategy recommendation identity is already terminal");
      this.#assertRecommendationAllowed(current, input);
      const recommendation = createRecommendation({
        ...input,
        catalogDigest: this.#catalog.catalogDigest,
        governanceStateDigest: current.stateDigest,
        governanceStateRevision: current.revision,
      });
      const next = createState({
        ...withoutStateDigest(current),
        pendingRecommendations: [...current.pendingRecommendations, recommendation],
        revision: current.revision + 1,
        logicalTimeHighWaterMs: Math.max(current.logicalTimeHighWaterMs, input.proposedAtLogicalMs),
        predecessorStateDigest: current.stateDigest,
      });
      if (await this.options.store.save({ state: next, expectedRevision: current.revision, expectedStateDigest: current.stateDigest }))
        return recommendation;
    }
    fail("Morphogenesis strategy recommendation commit attempts exhausted");
  }

  async reviewAndApply(input: {
    readonly recommendation: MorphogenesisStrategyRecommendationV3;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisStrategyGovernanceStateV3> {
    let review: MorphogenesisStrategyReviewV3 | null = null;
    for (let attempt = 0; attempt < this.#policy.maximumCommitAttempts; attempt += 1) {
      const current = await this.required();
      const recommendation = current.pendingRecommendations.find(
        ({ recommendationDigest }) => recommendationDigest === input.recommendation.recommendationDigest,
      );
      if (!recommendation) {
        const replay = current.transitions.find(({ recommendationDigest }) =>
          recommendationDigest === input.recommendation.recommendationDigest);
        if (replay || current.reviews.some(({ recommendationDigest }) =>
          recommendationDigest === input.recommendation.recommendationDigest)) return current;
        fail("Morphogenesis strategy recommendation is not pending");
      }
      if (recommendation.expiresAtLogicalMs <= input.logicalTimeMs ||
          recommendation.governanceStateDigest !== input.recommendation.governanceStateDigest ||
          current.revision !== recommendation.governanceStateRevision + 1 ||
          current.predecessorStateDigest !== recommendation.governanceStateDigest)
        fail("Morphogenesis strategy recommendation is stale or substituted");
      review ??= await this.options.reviews.review({
        recommendation,
        policy: this.#policy,
        logicalTimeMs: input.logicalTimeMs,
      });
      if (!review) fail("Morphogenesis strategy review is unavailable");
      const verified = validateReview(review);
      this.#assertReview(recommendation, verified, input.logicalTimeMs);
      const transition = verified.disposition === "approved"
        ? this.#transition(current, recommendation, verified, input.logicalTimeMs)
        : null;
      if (current.reviews.length >= this.#policy.maximumReviewHistory ||
          (transition !== null &&
            current.transitions.length >= this.#policy.maximumTransitionHistory))
        fail("Morphogenesis strategy governance terminal history capacity is exhausted");
      const entries = transition ? applyTransitionEntries(current, transition) : current.entries;
      const next = createState({
        ...withoutStateDigest(current),
        activeStrategyId: transition?.nextActiveStrategyId ?? current.activeStrategyId,
        entries,
        pendingRecommendations: current.pendingRecommendations.filter(
          ({ recommendationDigest }) => recommendationDigest !== recommendation.recommendationDigest,
        ),
        reviews: freeze([...current.reviews, verified]),
        transitions: transition
          ? freeze([...current.transitions, transition])
          : current.transitions,
        revision: current.revision + 1,
        logicalTimeHighWaterMs: Math.max(current.logicalTimeHighWaterMs, input.logicalTimeMs),
        predecessorStateDigest: current.stateDigest,
      });
      if (await this.options.store.save({ state: next, expectedRevision: current.revision, expectedStateDigest: current.stateDigest }))
        return next;
    }
    fail("Morphogenesis strategy governance commit attempts exhausted");
  }

  async required() {
    const state = await this.options.store.load(this.options.stateKey);
    if (!state) fail("Morphogenesis strategy governance state is unavailable");
    return validateState(state, this.#policy, this.#catalog, this.options.stateKey);
  }

  async #loadOrInitialize(logicalTimeMs: number) {
    const found = await this.options.store.load(this.options.stateKey);
    if (found) return validateState(found, this.#policy, this.#catalog, this.options.stateKey);
    const initial = createState({
      stateKey: this.options.stateKey,
      policyDigest: this.#policy.policyDigest,
      catalogDigest: this.#catalog.catalogDigest,
      baselineStrategyId: this.#catalog.baselineStrategyId,
      activeStrategyId: this.#catalog.baselineStrategyId,
      entries: this.#catalog.strategies.map(({ strategy, definitionDigest }) => freeze({
        schemaVersion: 3 as const,
        strategyId: strategy.strategyId,
        definitionDigest,
        status: strategy.strategyId === this.#catalog.baselineStrategyId ? "baseline" as const : "candidate" as const,
        statusRevision: 0,
        lastTransitionDigest: null,
      })),
      pendingRecommendations: [],
      reviews: [],
      transitions: [],
      revision: 0,
      logicalTimeHighWaterMs: nonNegative(logicalTimeMs),
      predecessorStateDigest: null,
    });
    if (await this.options.store.save({ state: initial, expectedRevision: null, expectedStateDigest: null })) return initial;
    const raced = await this.options.store.load(this.options.stateKey);
    if (!raced) fail("Morphogenesis strategy governance initialization conflicts");
    return validateState(raced, this.#policy, this.#catalog, this.options.stateKey);
  }

  #assertRecommendationAllowed(current: MorphogenesisStrategyGovernanceStateV3, input: {
    readonly recommendationId: AgentPlatID;
    readonly action: MorphogenesisStrategyGovernanceActionV3;
    readonly targetStrategyId: AgentPlatID;
    readonly replacementStrategyId: AgentPlatID | null;
    readonly confidenceBps: number;
    readonly proposedAtLogicalMs: number;
    readonly expiresAtLogicalMs: number;
  }) {
    if (!this.#policy.allowedActions.includes(input.action) ||
        !this.#policy.allowedReviewRoutes.includes((input as { reviewRoute?: MorphogenesisStrategyReviewRouteV3 }).reviewRoute!))
      fail("Morphogenesis strategy governance action or route is not allowed");
    if (input.confidenceBps < this.#policy.minimumConfidenceBps)
      fail("Morphogenesis strategy recommendation confidence is insufficient");
    if (current.pendingRecommendations.length >= this.#policy.maximumPendingRecommendations)
      fail("Morphogenesis strategy pending recommendation capacity is exhausted");
    if (input.proposedAtLogicalMs < current.logicalTimeHighWaterMs)
      fail("Morphogenesis strategy governance logical time rollback");
    const recent = current.transitions.filter(({ appliedAtLogicalMs }) =>
      appliedAtLogicalMs > input.proposedAtLogicalMs - this.#policy.transitionWindowMs);
    if (recent.length >= this.#policy.maximumTransitionsPerWindow)
      fail("Morphogenesis strategy oscillation guard is active");
    const last = current.transitions.at(-1);
    if (last && input.proposedAtLogicalMs < last.appliedAtLogicalMs + this.#policy.cooldownMs)
      fail("Morphogenesis strategy governance cooldown is active");
    const target = current.entries.find(({ strategyId }) => strategyId === input.targetStrategyId);
    if (!target || target.status === "retired") fail("Morphogenesis strategy target is unavailable");
    if (input.action === "retire" && input.targetStrategyId === current.baselineStrategyId)
      fail("Morphogenesis strategy baseline cannot be retired");
    if (input.action === "rollback") {
      if (input.targetStrategyId !== current.activeStrategyId || !input.replacementStrategyId)
        fail("Morphogenesis strategy rollback binding is invalid");
      const replacement = current.entries.find(({ strategyId }) => strategyId === input.replacementStrategyId);
      if (!replacement || replacement.status === "retired") fail("Morphogenesis rollback replacement is unavailable");
    } else if (input.replacementStrategyId !== null) {
      fail("Morphogenesis strategy replacement is allowed only for rollback");
    }
  }

  #assertReview(recommendation: MorphogenesisStrategyRecommendationV3, review: MorphogenesisStrategyReviewV3, logicalTimeMs: number) {
    if (review.recommendationId !== recommendation.recommendationId ||
        review.recommendationDigest !== recommendation.recommendationDigest ||
        review.route !== recommendation.reviewRoute ||
        review.reviewedAtLogicalMs > logicalTimeMs || review.expiresAtLogicalMs <= logicalTimeMs ||
        (this.#policy.requireIndependentReviewer && review.actorId === recommendation.proposerId))
      fail("Morphogenesis strategy review is stale, conflicting or not independent");
  }

  #transition(current: MorphogenesisStrategyGovernanceStateV3, recommendation: MorphogenesisStrategyRecommendationV3, review: MorphogenesisStrategyReviewV3, logicalTimeMs: number) {
    const nextActiveStrategyId = recommendation.action === "promote"
      ? recommendation.targetStrategyId
      : recommendation.action === "rollback"
        ? recommendation.replacementStrategyId!
        : current.activeStrategyId === recommendation.targetStrategyId
          ? current.baselineStrategyId
          : current.activeStrategyId;
    const body = freeze({
      schemaVersion: 3 as const,
      recommendationId: recommendation.recommendationId,
      recommendationDigest: recommendation.recommendationDigest,
      reviewDigest: review.reviewDigest,
      action: recommendation.action,
      targetStrategyId: recommendation.targetStrategyId,
      replacementStrategyId: recommendation.replacementStrategyId,
      priorActiveStrategyId: current.activeStrategyId,
      nextActiveStrategyId,
      appliedAtLogicalMs: nonNegative(logicalTimeMs),
    });
    return freeze({ ...body, transitionDigest: digest("morphogenesis-strategy-transition-v3", body) });
  }
}

export class InMemoryMorphogenesisStrategyGovernanceStoreV3
  implements MorphogenesisStrategyGovernanceStoreV3
{
  readonly #states = new Map<string, MorphogenesisStrategyGovernanceStateV3>();
  async load(stateKey: AgentPlatID) { const value = this.#states.get(stateKey); return value ? clone(value) : null; }
  async save(input: Parameters<MorphogenesisStrategyGovernanceStoreV3["save"]>[0]) {
    const current = this.#states.get(input.state.stateKey);
    if (input.expectedRevision === null) {
      if (current || input.expectedStateDigest !== null || input.state.revision !== 0) return false;
    } else if (!current || current.revision !== input.expectedRevision ||
        current.stateDigest !== input.expectedStateDigest ||
        input.state.revision !== current.revision + 1 ||
        input.state.predecessorStateDigest !== current.stateDigest) return false;
    this.#states.set(input.state.stateKey, clone(input.state));
    return true;
  }
}

export function createGovernedMorphogenesisStrategySelectionRequestV3(input: {
  readonly requestId: AgentPlatID;
  readonly scope: LocalStrategyScopeV1;
  readonly context: Parameters<typeof createMorphogenesisStrategySelectionRequestV3>[0]["context"];
  readonly catalog: MorphogenesisStrategyCatalogV3;
  readonly governanceState: MorphogenesisStrategyGovernanceStateV3;
  readonly governancePolicy: MorphogenesisStrategyGovernancePolicyV3;
  readonly stateKey: AgentPlatID;
  readonly logicalTimeMs: number;
}) {
  const state = validateMorphogenesisStrategyGovernanceStateV3(
    input.governanceState,
    { policy: input.governancePolicy, catalog: input.catalog, stateKey: input.stateKey },
  );
  const availableStrategyIds = state.entries
    .filter(({ status }) => status !== "retired" && status !== "degraded")
    .map(({ strategyId }) => strategyId);
  if (!availableStrategyIds.includes(state.baselineStrategyId))
    fail("Morphogenesis governed strategy baseline is unavailable");
  return createMorphogenesisStrategySelectionRequestV3({
    requestId: input.requestId,
    scope: input.scope,
    context: input.context,
    catalog: input.catalog,
    logicalTimeMs: input.logicalTimeMs,
    availableStrategyIds,
  });
}

function createRecommendation(input: Omit<MorphogenesisStrategyRecommendationV3, "schemaVersion" | "advisoryOnly" | "recommendationDigest">) {
  const body = freeze({
    schemaVersion: 3 as const,
    recommendationId: id(input.recommendationId), action: one<MorphogenesisStrategyGovernanceActionV3>(input.action, ACTIONS, "strategy action"),
    targetStrategyId: id(input.targetStrategyId), replacementStrategyId: input.replacementStrategyId === null ? null : id(input.replacementStrategyId),
    catalogDigest: sha(input.catalogDigest), governanceStateDigest: sha(input.governanceStateDigest),
    governanceStateRevision: nonNegative(input.governanceStateRevision), adaptationStateDigest: sha(input.adaptationStateDigest),
    adaptationStateRevision: nonNegative(input.adaptationStateRevision), evidenceDigests: shas(input.evidenceDigests),
    counterfactualDigest: nullableSha(input.counterfactualDigest), riskDigest: sha(input.riskDigest), costDigest: sha(input.costDigest),
    confidenceBps: bps(input.confidenceBps), proposerId: id(input.proposerId),
    proposerImplementationDigest: sha(input.proposerImplementationDigest), reviewRoute: one<MorphogenesisStrategyReviewRouteV3>(input.reviewRoute, ROUTES, "review route"),
    reasonCodes: reasonCodes(input.reasonCodes), proposedAtLogicalMs: nonNegative(input.proposedAtLogicalMs),
    expiresAtLogicalMs: positive(input.expiresAtLogicalMs), advisoryOnly: true as const,
  });
  if (body.expiresAtLogicalMs <= body.proposedAtLogicalMs) fail("Morphogenesis strategy recommendation window is invalid");
  return freeze({ ...body, recommendationDigest: digest("morphogenesis-strategy-recommendation-v3", body) });
}
function createState(input: Omit<MorphogenesisStrategyGovernanceStateV3, "schemaVersion" | "stateDigest">) { const body = freeze({ schemaVersion: 3 as const, ...input }); return freeze({ ...body, stateDigest: digest("morphogenesis-strategy-governance-state-v3", body) }); }
function withoutStateDigest(state: MorphogenesisStrategyGovernanceStateV3) { const { schemaVersion: _schema, stateDigest: _digest, ...body } = state; return body; }
function validatePolicy(value: MorphogenesisStrategyGovernancePolicyV3) { const { policyDigest, ...body } = value; const rebuilt = createMorphogenesisStrategyGovernancePolicyV3(body); if (policyDigest !== rebuilt.policyDigest) fail("Morphogenesis strategy governance policy digest is invalid"); return rebuilt; }
function validateCatalog(value: MorphogenesisStrategyCatalogV3) { const rebuilt = createMorphogenesisStrategyCatalogV3(value); if (rebuilt.catalogDigest !== value.catalogDigest) fail("Morphogenesis strategy catalog digest is invalid"); return rebuilt; }
function validateReview(value: MorphogenesisStrategyReviewV3) { const { schemaVersion: _schema, reviewDigest, ...body } = value; const rebuilt = createMorphogenesisStrategyReviewV3(body); if (value.schemaVersion !== 3 || reviewDigest !== rebuilt.reviewDigest) fail("Morphogenesis strategy review digest is invalid"); return rebuilt; }
export function validateMorphogenesisStrategyReviewV3(value: MorphogenesisStrategyReviewV3) { return validateReview(value); }
export function validateMorphogenesisStrategyGovernanceStateV3(
  value: MorphogenesisStrategyGovernanceStateV3,
  context: {
    readonly policy: MorphogenesisStrategyGovernancePolicyV3;
    readonly catalog: MorphogenesisStrategyCatalogV3;
    readonly stateKey: AgentPlatID;
  },
) {
  const policy = validatePolicy(context.policy);
  const catalog = validateCatalog(context.catalog);
  if (!value || value.schemaVersion !== 3 || value.stateKey !== context.stateKey ||
      value.policyDigest !== policy.policyDigest || value.catalogDigest !== catalog.catalogDigest ||
      value.baselineStrategyId !== catalog.baselineStrategyId ||
      !Number.isSafeInteger(value.revision) || value.revision < 0 ||
      !Number.isSafeInteger(value.logicalTimeHighWaterMs) || value.logicalTimeHighWaterMs < 0 ||
      (value.predecessorStateDigest === null) !== (value.revision === 0))
    fail("Morphogenesis strategy governance state binding is invalid");
  if (value.predecessorStateDigest !== null) sha(value.predecessorStateDigest);
  const { stateDigest, ...body } = value;
  if (stateDigest !== digest("morphogenesis-strategy-governance-state-v3", body))
    fail("Morphogenesis strategy governance state digest is invalid");
  if (!Array.isArray(value.entries) || value.entries.length !== catalog.strategies.length)
    fail("Morphogenesis strategy governance entries are invalid");
  const catalogById = new Map(catalog.strategies.map((item) => [item.strategy.strategyId, item]));
  for (const entry of value.entries) {
    const definition = catalogById.get(entry.strategyId);
    if (entry.schemaVersion !== 3 || !definition ||
        entry.definitionDigest !== definition.definitionDigest ||
        !new Set(["baseline", "candidate", "promoted", "degraded", "retired"]).has(entry.status) ||
        !Number.isSafeInteger(entry.statusRevision) || entry.statusRevision < 0)
      fail("Morphogenesis strategy governance entry is invalid");
    if (entry.lastTransitionDigest !== null) sha(entry.lastTransitionDigest);
  }
  const baseline = value.entries.find(({ strategyId }) => strategyId === value.baselineStrategyId);
  const active = value.entries.find(({ strategyId }) => strategyId === value.activeStrategyId);
  if (!baseline || baseline.status !== "baseline" || !active || active.status === "retired")
    fail("Morphogenesis strategy governance active or baseline entry is invalid");
  if (!Array.isArray(value.pendingRecommendations) ||
      value.pendingRecommendations.length > policy.maximumPendingRecommendations ||
      new Set(value.pendingRecommendations.map(({ recommendationId }) => recommendationId)).size !== value.pendingRecommendations.length)
    fail("Morphogenesis pending strategy recommendations are invalid");
  for (const recommendation of value.pendingRecommendations) {
    const valid = validateRecommendation(recommendation);
    if (valid.catalogDigest !== catalog.catalogDigest || !catalogById.has(valid.targetStrategyId) ||
        valid.proposedAtLogicalMs > value.logicalTimeHighWaterMs)
      fail("Morphogenesis pending strategy recommendation binding is invalid");
  }
  if (!Array.isArray(value.reviews) || value.reviews.length > policy.maximumReviewHistory ||
      new Set(value.reviews.map(({ reviewId }) => reviewId)).size !== value.reviews.length)
    fail("Morphogenesis strategy review history is invalid");
  value.reviews.forEach(validateReview);
  if (!Array.isArray(value.transitions) || value.transitions.length > policy.maximumTransitionHistory ||
      new Set(value.transitions.map(({ recommendationDigest }) => recommendationDigest)).size !== value.transitions.length)
    fail("Morphogenesis strategy transition history is invalid");
  value.transitions.forEach((transition) => {
    validateTransition(transition);
    if (!catalogById.has(transition.targetStrategyId) ||
        !catalogById.has(transition.priorActiveStrategyId) ||
        !catalogById.has(transition.nextActiveStrategyId) ||
        transition.appliedAtLogicalMs > value.logicalTimeHighWaterMs)
      fail("Morphogenesis strategy transition binding is invalid");
  });
  return clone(value);
}
function validateState(value: MorphogenesisStrategyGovernanceStateV3, policy: MorphogenesisStrategyGovernancePolicyV3, catalog: MorphogenesisStrategyCatalogV3, stateKey: AgentPlatID) {
  return validateMorphogenesisStrategyGovernanceStateV3(value, { policy, catalog, stateKey });
}
function validateRecommendation(value: MorphogenesisStrategyRecommendationV3) { const { schemaVersion: _schema, advisoryOnly: _advisory, recommendationDigest, ...body } = value; const rebuilt = createRecommendation(body); if (value.schemaVersion !== 3 || value.advisoryOnly !== true || recommendationDigest !== rebuilt.recommendationDigest) fail("Morphogenesis strategy recommendation digest is invalid"); return rebuilt; }
export function validateMorphogenesisStrategyRecommendationV3(value: MorphogenesisStrategyRecommendationV3) { return validateRecommendation(value); }
function validateTransition(value: MorphogenesisStrategyGovernanceTransitionV3) { if (!value || value.schemaVersion !== 3) fail("Morphogenesis strategy transition is invalid"); const { transitionDigest, ...body } = value; if (transitionDigest !== digest("morphogenesis-strategy-transition-v3", body)) fail("Morphogenesis strategy transition digest is invalid"); return value; }
export function validateMorphogenesisStrategyGovernanceTransitionV3(value: MorphogenesisStrategyGovernanceTransitionV3) { return validateTransition(value); }
function applyTransitionEntries(state: MorphogenesisStrategyGovernanceStateV3, transition: MorphogenesisStrategyGovernanceTransitionV3) { return state.entries.map((entry) => { let status = entry.status; if (entry.strategyId === transition.targetStrategyId) status = transition.action === "promote" ? "promoted" : transition.action === "retire" ? "retired" : "degraded"; if (transition.action === "rollback" && entry.strategyId === transition.replacementStrategyId) status = entry.strategyId === state.baselineStrategyId ? "baseline" : "promoted"; if (transition.action === "promote" && entry.strategyId === state.activeStrategyId && entry.strategyId !== transition.targetStrategyId && entry.status !== "baseline") status = "degraded"; return status === entry.status ? entry : freeze({ ...entry, status, statusRevision: entry.statusRevision + 1, lastTransitionDigest: transition.transitionDigest }); }); }
const ACTIONS = new Set(["promote", "degrade", "retire", "rollback"]); const ROUTES = new Set(["authorized_agent", "authorized_person", "collective"]); const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u; const SHA = /^sha256:[0-9a-f]{64}$/u;
function id(value: unknown): AgentPlatID { if (typeof value !== "string" || !ID.test(value)) fail("Morphogenesis strategy governance ID is invalid"); return value as AgentPlatID; } function sha(value: unknown): PlanningDigestV1 { if (typeof value !== "string" || !SHA.test(value)) fail("Morphogenesis strategy governance digest is invalid"); return value as PlanningDigestV1; } function nullableSha(value: unknown): PlanningDigestV1 | null { return value === null ? null : sha(value); } function positive(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 1) fail("Morphogenesis strategy governance positive integer is invalid"); return value as number; } function nonNegative(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 0) fail("Morphogenesis strategy governance non-negative integer is invalid"); return value as number; } function bps(value: unknown): number { const result = nonNegative(value); if (result > 10_000) fail("Morphogenesis strategy governance basis points are invalid"); return result; } function boolean(value: unknown): boolean { if (typeof value !== "boolean") fail("Morphogenesis strategy governance boolean is invalid"); return value; } function one<T extends string>(value: unknown, set: ReadonlySet<string>, label: string): T { if (typeof value !== "string" || !set.has(value)) fail(`${label} is invalid`); return value as T; } function enums<T extends string>(values: readonly T[], set: ReadonlySet<string>, label: string): readonly T[] { const result = [...new Set(values)].sort(); if (!Array.isArray(values) || result.length < 1 || result.length !== values.length || result.some((item) => !set.has(item))) fail(`${label} are invalid`); return freeze(result); } function shas(values: readonly unknown[]): readonly PlanningDigestV1[] { const result = [...new Set(values.map(sha))].sort(); if (result.length < 1 || result.length > 256) fail("Morphogenesis strategy governance evidence is invalid"); return freeze(result); } function reasonCodes(values: readonly string[]) { const result = [...new Set(values)].sort(); if (!Array.isArray(values) || result.length < 1 || result.length > 32 || result.length !== values.length || result.some((item) => !/^[a-z][a-z0-9_]{0,63}$/u.test(item))) fail("Morphogenesis strategy reason codes are invalid"); return freeze(result); } function trim<T>(values: readonly T[], maximum: number): readonly T[] { return freeze(values.slice(Math.max(0, values.length - maximum))); } function digest(domain: string, value: unknown): PlanningDigestV1 { return digestPlanningJsonV1(domain as never, value as PlanningJson); } function clone<T>(value: T): T { return freeze(structuredClone(value)); } function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const item of Object.values(value as Record<string, unknown>)) freeze(item); } return value; } function fail(message: string): never { throw new TypeError(message); }
