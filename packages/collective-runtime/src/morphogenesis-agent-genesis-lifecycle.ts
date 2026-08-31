import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";
import type { MorphogenesisStrategyReviewRouteV3 } from
  "./morphogenesis-strategy-governance.js";
import {
  MorphogenesisAgentGenesisSandboxRuntimeV6,
  validateMorphogenesisAgentGenesisDraftV6,
  validateMorphogenesisAgentGenesisEvaluationV6,
  validateMorphogenesisAgentGenesisPolicyV6,
  type MorphogenesisAgentGenesisDraftV6,
  type MorphogenesisAgentGenesisEvaluationV6,
  type MorphogenesisAgentGenesisPolicyV6,
  type MorphogenesisAgentGenesisSandboxReceiptV6,
} from "./morphogenesis-agent-genesis.js";

export type MorphogenesisAgentGenesisStatusV6 =
  "draft" | "sandboxed" | "probationary" | "admitted" | "suspended" | "retired";
export type MorphogenesisAgentGenesisActionV6 =
  "start_probation" | "admit" | "suspend" | "resume" | "retire" | "rollback";

export interface MorphogenesisAgentGenesisLifecyclePolicyV6 {
  readonly schemaVersion: 6;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly genesisPolicyDigest: PlanningDigestV1;
  readonly allowedActions: readonly MorphogenesisAgentGenesisActionV6[];
  readonly allowedReviewRoutes: readonly MorphogenesisStrategyReviewRouteV3[];
  readonly requireIndependentReviewer: boolean;
  readonly maximumProbationObservations: number;
  readonly minimumProbationObservations: number;
  readonly minimumProbationSuccesses: number;
  readonly maximumUnsafeObservations: number;
  readonly maximumPendingRecommendations: number;
  readonly maximumHistory: number;
  readonly maximumCommitAttempts: number;
  readonly policyDigest: PlanningDigestV1;
}

export interface MorphogenesisAgentGenesisProbationReceiptV6 {
  readonly schemaVersion: 6;
  readonly observationId: AgentPlatID;
  readonly draftDigest: PlanningDigestV1;
  readonly sandboxReceiptDigest: PlanningDigestV1;
  readonly outcome: "success" | "failure" | "unsafe" | "indeterminate";
  readonly capabilityEvidenceDigests: readonly PlanningDigestV1[];
  readonly trustDecisionDigest: PlanningDigestV1;
  readonly inferenceControlDecisionDigest: PlanningDigestV1;
  readonly observedAtLogicalMs: number;
  readonly receiptDigest: PlanningDigestV1;
}

export interface MorphogenesisAgentGenesisRecommendationV6 {
  readonly schemaVersion: 6;
  readonly recommendationId: AgentPlatID;
  readonly action: MorphogenesisAgentGenesisActionV6;
  readonly draftDigest: PlanningDigestV1;
  readonly stateDigest: PlanningDigestV1;
  readonly stateRevision: number;
  readonly proposerId: AgentPlatID;
  readonly proposerImplementationDigest: PlanningDigestV1;
  readonly reviewRoute: MorphogenesisStrategyReviewRouteV3;
  readonly evidenceDigests: readonly PlanningDigestV1[];
  readonly proposedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly advisoryOnly: true;
  readonly recommendationDigest: PlanningDigestV1;
}

export interface MorphogenesisAgentGenesisReviewV6 {
  readonly schemaVersion: 6;
  readonly reviewId: AgentPlatID;
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

export interface MorphogenesisAgentGenesisEntryV6 {
  readonly schemaVersion: 6;
  readonly draft: MorphogenesisAgentGenesisDraftV6;
  readonly evaluationDigest: PlanningDigestV1;
  readonly evaluationExpiresAtLogicalMs: number;
  readonly status: MorphogenesisAgentGenesisStatusV6;
  readonly statusRevision: number;
  readonly pendingSandboxOperationId: AgentPlatID | null;
  readonly sandboxReceipt: MorphogenesisAgentGenesisSandboxReceiptV6 | null;
  readonly probationReceipts: readonly MorphogenesisAgentGenesisProbationReceiptV6[];
  readonly externalAdmissionApplied: false;
  readonly lastTransitionDigest: PlanningDigestV1 | null;
}

export interface MorphogenesisAgentGenesisTransitionV6 {
  readonly schemaVersion: 6;
  readonly recommendationDigest: PlanningDigestV1;
  readonly reviewDigest: PlanningDigestV1;
  readonly draftDigest: PlanningDigestV1;
  readonly action: MorphogenesisAgentGenesisActionV6;
  readonly priorStatus: MorphogenesisAgentGenesisStatusV6;
  readonly nextStatus: MorphogenesisAgentGenesisStatusV6;
  readonly appliedAtLogicalMs: number;
  readonly transitionDigest: PlanningDigestV1;
}

export interface MorphogenesisAgentGenesisLifecycleStateV6 {
  readonly schemaVersion: 6;
  readonly stateKey: AgentPlatID;
  readonly policyDigest: PlanningDigestV1;
  readonly entries: readonly MorphogenesisAgentGenesisEntryV6[];
  readonly pendingRecommendations: readonly MorphogenesisAgentGenesisRecommendationV6[];
  readonly reviews: readonly MorphogenesisAgentGenesisReviewV6[];
  readonly transitions: readonly MorphogenesisAgentGenesisTransitionV6[];
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly predecessorStateDigest: PlanningDigestV1 | null;
  readonly stateDigest: PlanningDigestV1;
}

export interface MorphogenesisAgentGenesisReviewPortV6 {
  review(input: { readonly recommendation: MorphogenesisAgentGenesisRecommendationV6;
    readonly policy: MorphogenesisAgentGenesisLifecyclePolicyV6;
    readonly logicalTimeMs: number }): Promise<MorphogenesisAgentGenesisReviewV6 | null>;
}
export interface MorphogenesisAgentGenesisLifecycleStoreV6 {
  load(stateKey: AgentPlatID): Promise<MorphogenesisAgentGenesisLifecycleStateV6 | null>;
  save(input: { readonly state: MorphogenesisAgentGenesisLifecycleStateV6;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null }): Promise<boolean>;
}

export function createMorphogenesisAgentGenesisLifecyclePolicyV6(input:
  Omit<MorphogenesisAgentGenesisLifecyclePolicyV6, "policyDigest">,
): MorphogenesisAgentGenesisLifecyclePolicyV6 {
  if (input.schemaVersion !== 6) fail("Agent Genesis lifecycle policy version is invalid");
  const body = freeze({ schemaVersion: 6 as const, policyId: id(input.policyId),
    policyVersion: positive(input.policyVersion), genesisPolicyDigest: sha(input.genesisPolicyDigest),
    allowedActions: enums(input.allowedActions, ACTIONS, "Agent Genesis actions"),
    allowedReviewRoutes: enums(input.allowedReviewRoutes, ROUTES, "Agent Genesis review routes"),
    requireIndependentReviewer: bool(input.requireIndependentReviewer),
    maximumProbationObservations: positive(input.maximumProbationObservations),
    minimumProbationObservations: positive(input.minimumProbationObservations),
    minimumProbationSuccesses: positive(input.minimumProbationSuccesses),
    maximumUnsafeObservations: nonNegative(input.maximumUnsafeObservations),
    maximumPendingRecommendations: positive(input.maximumPendingRecommendations),
    maximumHistory: positive(input.maximumHistory),
    maximumCommitAttempts: positive(input.maximumCommitAttempts) });
  if (body.minimumProbationObservations > body.maximumProbationObservations ||
      body.minimumProbationSuccesses > body.minimumProbationObservations)
    fail("Agent Genesis probation policy is inconsistent");
  return freeze({ ...body,
    policyDigest: digest("morphogenesis-agent-genesis-lifecycle-policy-v6", body) });
}

export function createMorphogenesisAgentGenesisReviewV6(input:
  Omit<MorphogenesisAgentGenesisReviewV6, "schemaVersion" | "reviewDigest">) {
  const expected = input.route === "authorized_agent" ? "agent"
    : input.route === "authorized_person" ? "person" : "collective";
  if (input.actorType !== expected) fail("Agent Genesis reviewer type is invalid");
  const body = freeze({ schemaVersion: 6 as const, reviewId: id(input.reviewId),
    recommendationDigest: sha(input.recommendationDigest),
    route: one(input.route, ROUTES, "Agent Genesis review route"), actorType: input.actorType,
    actorId: id(input.actorId), actorMandateDigest: sha(input.actorMandateDigest),
    independenceGroupId: id(input.independenceGroupId),
    disposition: one(input.disposition, new Set<"approved" | "rejected">(
      ["approved", "rejected"]), "Agent Genesis review disposition"),
    proofDigest: sha(input.proofDigest), reviewedAtLogicalMs: nonNegative(input.reviewedAtLogicalMs),
    expiresAtLogicalMs: positive(input.expiresAtLogicalMs) });
  if (body.expiresAtLogicalMs <= body.reviewedAtLogicalMs)
    fail("Agent Genesis review window is invalid");
  return freeze({ ...body, reviewDigest: digest("morphogenesis-agent-genesis-review-v6", body) });
}

export class InMemoryMorphogenesisAgentGenesisLifecycleStoreV6
  implements MorphogenesisAgentGenesisLifecycleStoreV6 {
  readonly #states = new Map<string, MorphogenesisAgentGenesisLifecycleStateV6>();
  async load(stateKey: AgentPlatID) { return this.#states.get(stateKey) ?? null; }
  async save(input: { readonly state: MorphogenesisAgentGenesisLifecycleStateV6;
    readonly expectedRevision: number | null; readonly expectedStateDigest: PlanningDigestV1 | null }) {
    const current = this.#states.get(input.state.stateKey);
    if ((current?.revision ?? null) !== input.expectedRevision ||
        (current?.stateDigest ?? null) !== input.expectedStateDigest) return false;
    this.#states.set(input.state.stateKey, freeze(structuredClone(input.state))); return true;
  }
}

export class MorphogenesisAgentGenesisLifecycleRuntimeV6 {
  readonly #policy: MorphogenesisAgentGenesisLifecyclePolicyV6;
  readonly #genesisPolicy: MorphogenesisAgentGenesisPolicyV6;
  constructor(readonly options: { readonly stateKey: AgentPlatID;
    readonly policy: MorphogenesisAgentGenesisLifecyclePolicyV6;
    readonly genesisPolicy: MorphogenesisAgentGenesisPolicyV6;
    readonly sandbox: MorphogenesisAgentGenesisSandboxRuntimeV6;
    readonly reviews: MorphogenesisAgentGenesisReviewPortV6;
    readonly store: MorphogenesisAgentGenesisLifecycleStoreV6 }) {
    id(options.stateKey); this.#policy = validatePolicy(options.policy);
    this.#genesisPolicy = validateMorphogenesisAgentGenesisPolicyV6(options.genesisPolicy);
    if (this.#policy.genesisPolicyDigest !== this.#genesisPolicy.policyDigest ||
        !options.sandbox || !options.reviews || !options.store)
      fail("Agent Genesis lifecycle bindings are invalid");
  }
  async register(input: { readonly draft: MorphogenesisAgentGenesisDraftV6;
    readonly evaluation: MorphogenesisAgentGenesisEvaluationV6;
    readonly logicalTimeMs: number }) {
    const draft = validateMorphogenesisAgentGenesisDraftV6(input.draft, this.#genesisPolicy);
    const evaluation = validateMorphogenesisAgentGenesisEvaluationV6(
      input.evaluation, draft, this.#genesisPolicy);
    if (evaluation.disposition !== "eligible" || evaluation.expiresAtLogicalMs <= input.logicalTimeMs)
      fail("Agent Genesis registration is not eligible");
    return this.#commit(input.logicalTimeMs, (state) => {
      if (state.entries.some(({ draft: value }) => value.draftDigest === draft.draftDigest))
        return state;
      return next(state, input.logicalTimeMs, { entries: [...state.entries,
        freeze({ schemaVersion: 6 as const, draft, evaluationDigest: evaluation.evaluationDigest,
          evaluationExpiresAtLogicalMs: evaluation.expiresAtLogicalMs, status: "draft" as const,
          statusRevision: 1, pendingSandboxOperationId: null, sandboxReceipt: null,
          probationReceipts: freeze([]), externalAdmissionApplied: false as const,
          lastTransitionDigest: null })] });
    });
  }
  async prepareSandbox(input: { readonly operationId: AgentPlatID;
    readonly draft: MorphogenesisAgentGenesisDraftV6;
    readonly evaluation: MorphogenesisAgentGenesisEvaluationV6;
    readonly logicalTimeMs: number }) {
    id(input.operationId);
    await this.#commit(input.logicalTimeMs, (state) => {
      const entry = entryFor(state, input.draft.draftDigest);
      if (entry.sandboxReceipt) return state;
      if (entry.status !== "draft" || (entry.pendingSandboxOperationId &&
          entry.pendingSandboxOperationId !== input.operationId))
        fail("Agent Genesis sandbox operation conflicts");
      return replaceEntry(state, entry, { pendingSandboxOperationId: input.operationId },
        input.logicalTimeMs);
    });
    const receipt = await this.options.sandbox.prepare(input);
    await this.#commit(input.logicalTimeMs, (state) => {
      const entry = entryFor(state, input.draft.draftDigest);
      if (entry.sandboxReceipt) {
        if (entry.sandboxReceipt.receiptDigest !== receipt.receiptDigest)
          fail("Agent Genesis sandbox replay diverged");
        return state;
      }
      if (entry.pendingSandboxOperationId !== input.operationId)
        fail("Agent Genesis sandbox preparation was not durable");
      return replaceEntry(state, entry, { pendingSandboxOperationId: null,
        sandboxReceipt: receipt, status: "sandboxed", statusRevision: entry.statusRevision + 1 },
      input.logicalTimeMs);
    });
    return receipt;
  }
  async observeProbation(input: { readonly observationId: AgentPlatID;
    readonly draftDigest: PlanningDigestV1;
    readonly outcome: MorphogenesisAgentGenesisProbationReceiptV6["outcome"];
    readonly capabilityEvidenceDigests: readonly PlanningDigestV1[];
    readonly trustDecisionDigest: PlanningDigestV1;
    readonly inferenceControlDecisionDigest: PlanningDigestV1;
    readonly logicalTimeMs: number }) {
    return this.#commit(input.logicalTimeMs, (state) => {
      const entry = entryFor(state, input.draftDigest);
      if (entry.status !== "probationary" || !entry.sandboxReceipt ||
          entry.probationReceipts.length >= this.#policy.maximumProbationObservations)
        fail("Agent Genesis probation observation is not allowed");
      const receipt = probationReceipt(input, entry.sandboxReceipt.receiptDigest);
      const retained = entry.probationReceipts.find(({ observationId }) =>
        observationId === receipt.observationId);
      if (retained) {
        if (retained.receiptDigest !== receipt.receiptDigest)
          fail("Agent Genesis probation replay diverged");
        return state;
      }
      return replaceEntry(state, entry,
        { probationReceipts: [...entry.probationReceipts, receipt] }, input.logicalTimeMs);
    });
  }
  async recommend(input: Omit<MorphogenesisAgentGenesisRecommendationV6,
    "schemaVersion" | "stateDigest" | "stateRevision" | "advisoryOnly" |
    "recommendationDigest">) {
    let result: MorphogenesisAgentGenesisRecommendationV6 | null = null;
    await this.#commit(input.proposedAtLogicalMs, (state) => {
      const entry = entryFor(state, input.draftDigest);
      assertAction(entry, input.action, this.#policy);
      if (!this.#policy.allowedActions.includes(input.action) ||
          !this.#policy.allowedReviewRoutes.includes(input.reviewRoute) ||
          entry.evaluationExpiresAtLogicalMs <= input.proposedAtLogicalMs ||
          input.expiresAtLogicalMs <= input.proposedAtLogicalMs)
        fail("Agent Genesis recommendation is not allowed");
      const recommendation = recommendationRecord(input, state);
      const retained = state.pendingRecommendations.find(({ recommendationId }) =>
        recommendationId === input.recommendationId);
      if (retained) {
        if (retained.recommendationDigest !== recommendation.recommendationDigest)
          fail("Agent Genesis recommendation replay diverged");
        result = retained; return state;
      }
      if (state.pendingRecommendations.length >= this.#policy.maximumPendingRecommendations)
        fail("Agent Genesis recommendation capacity is exhausted");
      result = recommendation;
      return next(state, input.proposedAtLogicalMs,
        { pendingRecommendations: [...state.pendingRecommendations, recommendation] });
    }); return result!;
  }
  async reviewAndApply(input: { readonly recommendationId: AgentPlatID;
    readonly logicalTimeMs: number }) {
    let output: MorphogenesisAgentGenesisTransitionV6 | null = null;
    await this.#commit(input.logicalTimeMs, async (state) => {
      const recommendation = state.pendingRecommendations.find(({ recommendationId }) =>
        recommendationId === input.recommendationId);
      if (!recommendation || recommendation.expiresAtLogicalMs <= input.logicalTimeMs)
        fail("Agent Genesis recommendation is unavailable");
      const raw = await this.options.reviews.review({ recommendation,
        policy: this.#policy, logicalTimeMs: input.logicalTimeMs });
      if (!raw) fail("Agent Genesis review is unavailable");
      const review = createMorphogenesisAgentGenesisReviewV6(raw);
      if (review.recommendationDigest !== recommendation.recommendationDigest ||
          review.route !== recommendation.reviewRoute ||
          review.expiresAtLogicalMs <= input.logicalTimeMs ||
          (this.#policy.requireIndependentReviewer && review.actorId === recommendation.proposerId))
        fail("Agent Genesis review binding or independence is invalid");
      const entry = entryFor(state, recommendation.draftDigest);
      const nextStatus = review.disposition === "approved" ? statusFor(recommendation.action)
        : entry.status;
      const transition = transitionRecord(recommendation, review, entry.status,
        nextStatus, input.logicalTimeMs); output = transition;
      const updated = replaceEntry(state, entry, { status: nextStatus,
        statusRevision: entry.statusRevision + (nextStatus === entry.status ? 0 : 1),
        lastTransitionDigest: transition.transitionDigest }, input.logicalTimeMs,
      { pendingRecommendations: state.pendingRecommendations.filter(({ recommendationId }) =>
          recommendationId !== input.recommendationId),
        reviews: append(state.reviews, review, this.#policy.maximumHistory),
        transitions: append(state.transitions, transition, this.#policy.maximumHistory) });
      return updated;
    }); return output!;
  }
  async state(logicalTimeMs: number) { return this.#load(logicalTimeMs); }
  async #load(logicalTimeMs: number) { return await this.options.store.load(this.options.stateKey) ??
    initial(this.options.stateKey, this.#policy, logicalTimeMs); }
  async #commit(logicalTimeMs: number, mutate: (state: MorphogenesisAgentGenesisLifecycleStateV6) =>
    MorphogenesisAgentGenesisLifecycleStateV6 |
    Promise<MorphogenesisAgentGenesisLifecycleStateV6>) {
    for (let attempt = 0; attempt < this.#policy.maximumCommitAttempts; attempt += 1) {
      const retained = await this.options.store.load(this.options.stateKey);
      const current = retained ?? initial(this.options.stateKey, this.#policy, logicalTimeMs);
      if (logicalTimeMs < current.logicalTimeHighWaterMs) fail("Agent Genesis time rolled back");
      const proposed = await mutate(current); if (proposed === current) return current;
      if (await this.options.store.save({ state: proposed,
        expectedRevision: retained?.revision ?? null,
        expectedStateDigest: retained?.stateDigest ?? null })) return proposed;
    } fail("Agent Genesis lifecycle CAS retries exhausted");
  }
}

function initial(stateKey: AgentPlatID, policy: MorphogenesisAgentGenesisLifecyclePolicyV6,
  logicalTimeMs: number) { return stateRecord({ stateKey, policyDigest: policy.policyDigest,
    entries: [], pendingRecommendations: [], reviews: [], transitions: [], revision: 0,
    logicalTimeHighWaterMs: logicalTimeMs, predecessorStateDigest: null }); }
function stateRecord(input: Omit<MorphogenesisAgentGenesisLifecycleStateV6,
  "schemaVersion" | "stateDigest">) { const body = freeze({ schemaVersion: 6 as const, ...input });
  return freeze({ ...body, stateDigest: digest("morphogenesis-agent-genesis-lifecycle-state-v6", body) }); }
function next(state: MorphogenesisAgentGenesisLifecycleStateV6, logicalTimeMs: number,
  changes: Partial<Pick<MorphogenesisAgentGenesisLifecycleStateV6, "entries" |
    "pendingRecommendations" | "reviews" | "transitions">>) {
  return stateRecord({ stateKey: state.stateKey, policyDigest: state.policyDigest,
    entries: changes.entries ?? state.entries,
    pendingRecommendations: changes.pendingRecommendations ?? state.pendingRecommendations,
    reviews: changes.reviews ?? state.reviews, transitions: changes.transitions ?? state.transitions,
    revision: state.revision + 1, logicalTimeHighWaterMs: logicalTimeMs,
    predecessorStateDigest: state.stateDigest }); }
function replaceEntry(state: MorphogenesisAgentGenesisLifecycleStateV6,
  entry: MorphogenesisAgentGenesisEntryV6, changes: Partial<MorphogenesisAgentGenesisEntryV6>,
  logicalTimeMs: number, stateChanges: Partial<Pick<MorphogenesisAgentGenesisLifecycleStateV6,
    "pendingRecommendations" | "reviews" | "transitions">> = {}) {
  return next(state, logicalTimeMs, { ...stateChanges,
    entries: state.entries.map((value) => value.draft.draftDigest === entry.draft.draftDigest
      ? freeze({ ...value, ...changes }) : value) }); }
function entryFor(state: MorphogenesisAgentGenesisLifecycleStateV6, draftDigest: PlanningDigestV1) {
  const entry = state.entries.find(({ draft }) => draft.draftDigest === draftDigest);
  if (!entry) fail("Agent Genesis draft is not registered"); return entry; }
function probationReceipt(input: { readonly observationId: AgentPlatID;
  readonly draftDigest: PlanningDigestV1;
  readonly outcome: MorphogenesisAgentGenesisProbationReceiptV6["outcome"];
  readonly capabilityEvidenceDigests: readonly PlanningDigestV1[];
  readonly trustDecisionDigest: PlanningDigestV1;
  readonly inferenceControlDecisionDigest: PlanningDigestV1;
  readonly logicalTimeMs: number }, sandboxReceiptDigest: PlanningDigestV1) {
  const body = freeze({ schemaVersion: 6 as const, observationId: id(input.observationId),
    draftDigest: sha(input.draftDigest), sandboxReceiptDigest,
    outcome: one(input.outcome, OUTCOMES, "Agent Genesis probation outcome"),
    capabilityEvidenceDigests: shas(input.capabilityEvidenceDigests, 1, 64),
    trustDecisionDigest: sha(input.trustDecisionDigest),
    inferenceControlDecisionDigest: sha(input.inferenceControlDecisionDigest),
    observedAtLogicalMs: nonNegative(input.logicalTimeMs) });
  return freeze({ ...body,
    receiptDigest: digest("morphogenesis-agent-genesis-probation-receipt-v6", body) }); }
function recommendationRecord(input: Omit<MorphogenesisAgentGenesisRecommendationV6,
  "schemaVersion" | "stateDigest" | "stateRevision" | "advisoryOnly" |
  "recommendationDigest">, state: MorphogenesisAgentGenesisLifecycleStateV6) {
  const body = freeze({ schemaVersion: 6 as const, recommendationId: id(input.recommendationId),
    action: one(input.action, ACTIONS, "Agent Genesis action"),
    draftDigest: sha(input.draftDigest), stateDigest: state.stateDigest, stateRevision: state.revision,
    proposerId: id(input.proposerId),
    proposerImplementationDigest: sha(input.proposerImplementationDigest),
    reviewRoute: one(input.reviewRoute, ROUTES, "Agent Genesis review route"),
    evidenceDigests: shas(input.evidenceDigests, 1, 128),
    proposedAtLogicalMs: nonNegative(input.proposedAtLogicalMs),
    expiresAtLogicalMs: positive(input.expiresAtLogicalMs), advisoryOnly: true as const });
  return freeze({ ...body,
    recommendationDigest: digest("morphogenesis-agent-genesis-recommendation-v6", body) }); }
function transitionRecord(recommendation: MorphogenesisAgentGenesisRecommendationV6,
  review: MorphogenesisAgentGenesisReviewV6, priorStatus: MorphogenesisAgentGenesisStatusV6,
  nextStatus: MorphogenesisAgentGenesisStatusV6, appliedAtLogicalMs: number) {
  const body = freeze({ schemaVersion: 6 as const,
    recommendationDigest: recommendation.recommendationDigest, reviewDigest: review.reviewDigest,
    draftDigest: recommendation.draftDigest, action: recommendation.action, priorStatus, nextStatus,
    appliedAtLogicalMs }); return freeze({ ...body,
      transitionDigest: digest("morphogenesis-agent-genesis-transition-v6", body) }); }
function assertAction(entry: MorphogenesisAgentGenesisEntryV6,
  action: MorphogenesisAgentGenesisActionV6,
  policy: MorphogenesisAgentGenesisLifecyclePolicyV6) {
  const success = entry.probationReceipts.filter(({ outcome }) => outcome === "success").length;
  const unsafe = entry.probationReceipts.filter(({ outcome }) => outcome === "unsafe").length;
  const allowed = action === "start_probation" ? entry.status === "sandboxed"
    : action === "admit" ? entry.status === "probationary" &&
      entry.probationReceipts.length >= policy.minimumProbationObservations &&
      success >= policy.minimumProbationSuccesses && unsafe <= policy.maximumUnsafeObservations
    : action === "suspend" ? ["probationary", "admitted"].includes(entry.status)
    : action === "resume" ? entry.status === "suspended"
    : action === "retire" ? entry.status !== "retired"
    : entry.status === "admitted";
  if (!allowed) fail("Agent Genesis lifecycle transition is not allowed"); }
function statusFor(action: MorphogenesisAgentGenesisActionV6): MorphogenesisAgentGenesisStatusV6 {
  return action === "start_probation" || action === "resume" || action === "rollback"
    ? "probationary" : action === "admit" ? "admitted"
      : action === "suspend" ? "suspended" : "retired"; }
function append<T>(items: readonly T[], item: T, maximum: number) {
  return freeze([...items, item].slice(-maximum)); }
function validatePolicy(value: MorphogenesisAgentGenesisLifecyclePolicyV6) {
  const { policyDigest, ...body } = value;
  const rebuilt = createMorphogenesisAgentGenesisLifecyclePolicyV6(body);
  if (rebuilt.policyDigest !== policyDigest) fail("Agent Genesis lifecycle policy is invalid");
  return rebuilt; }
const ACTIONS = new Set<MorphogenesisAgentGenesisActionV6>(
  ["start_probation", "admit", "suspend", "resume", "retire", "rollback"]);
const ROUTES = new Set<MorphogenesisStrategyReviewRouteV3>(
  ["authorized_agent", "authorized_person", "collective"]);
const OUTCOMES = new Set<MorphogenesisAgentGenesisProbationReceiptV6["outcome"]>(
  ["success", "failure", "unsafe", "indeterminate"]);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u;
const SHA = /^sha256:[0-9a-f]{64}$/u;
function id(value: unknown): AgentPlatID { if (typeof value !== "string" || !ID.test(value)) fail("Agent Genesis lifecycle ID is invalid"); return value as AgentPlatID; }
function sha(value: unknown): PlanningDigestV1 { if (typeof value !== "string" || !SHA.test(value)) fail("Agent Genesis lifecycle digest is invalid"); return value as PlanningDigestV1; }
function positive(value: unknown) { if (!Number.isSafeInteger(value) || (value as number) < 1) fail("Agent Genesis lifecycle positive integer is invalid"); return value as number; }
function nonNegative(value: unknown) { if (!Number.isSafeInteger(value) || (value as number) < 0) fail("Agent Genesis lifecycle non-negative integer is invalid"); return value as number; }
function bool(value: unknown) { if (typeof value !== "boolean") fail("Agent Genesis lifecycle boolean is invalid"); return value; }
function one<T extends string>(value: unknown, values: ReadonlySet<T>, label: string): T { if (typeof value !== "string" || !values.has(value as T)) fail(`${label} is invalid`); return value as T; }
function enums<T extends string>(values: readonly unknown[], allowed: ReadonlySet<T>, label: string) { if (!Array.isArray(values)) fail(`${label} are invalid`); const result = [...new Set(values.map((value) => one(value, allowed, label)))].sort(); if (!result.length || result.length !== values.length) fail(`${label} are invalid`); return freeze(result); }
function shas(values: readonly unknown[], minimum: number, maximum: number) { const result = [...new Set(values.map(sha))].sort(); if (result.length < minimum || result.length > maximum || result.length !== values.length) fail("Agent Genesis lifecycle digests are invalid"); return freeze(result); }
function digest(domain: string, value: unknown): PlanningDigestV1 { return digestPlanningJsonV1(domain as never, value as PlanningJson); }
function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const item of Object.values(value as Record<string, unknown>)) freeze(item); } return value; }
function fail(message: string): never { throw new TypeError(message); }
