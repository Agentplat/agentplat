import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";

import type { MorphogenesisStrategyReviewRouteV3 } from "./morphogenesis-strategy-governance.js";
import {
  validateMorphogenesisStrategySynthesisCandidateV5,
  validateMorphogenesisStrategySynthesisPolicyV5,
  type MorphogenesisStrategySynthesisCandidateV5,
  type MorphogenesisStrategySynthesisCertificationV5,
  type MorphogenesisStrategySynthesisEvaluationV5,
  type MorphogenesisStrategySynthesisPolicyV5,
} from "./morphogenesis-strategy-synthesis.js";

export type MorphogenesisSynthesisGovernanceActionV5 =
  "admit_experimental" | "certify" | "degrade" | "retire" | "rollback";

export interface MorphogenesisSynthesisGovernancePolicyV5 {
  readonly schemaVersion: 5;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly synthesisPolicyDigest: PlanningDigestV1;
  readonly allowedActions: readonly MorphogenesisSynthesisGovernanceActionV5[];
  readonly allowedReviewRoutes: readonly MorphogenesisStrategyReviewRouteV3[];
  readonly requireIndependentReviewer: boolean;
  readonly maximumCanarySelections: number;
  readonly minimumCanaryOutcomes: number;
  readonly minimumCanarySuccesses: number;
  readonly maximumCanaryUnsafeOutcomes: number;
  readonly maximumPendingRecommendations: number;
  readonly maximumHistory: number;
  readonly maximumCommitAttempts: number;
  readonly policyDigest: PlanningDigestV1;
}

export interface MorphogenesisSynthesisAdmissionRecommendationV5 {
  readonly schemaVersion: 5;
  readonly recommendationId: AgentPlatID;
  readonly action: MorphogenesisSynthesisGovernanceActionV5;
  readonly candidateDigest: PlanningDigestV1;
  readonly evaluationDigest: PlanningDigestV1;
  readonly certificationDigest: PlanningDigestV1;
  readonly stateDigest: PlanningDigestV1;
  readonly stateRevision: number;
  readonly proposerId: AgentPlatID;
  readonly proposerImplementationDigest: PlanningDigestV1;
  readonly reviewRoute: MorphogenesisStrategyReviewRouteV3;
  readonly evidenceDigests: readonly PlanningDigestV1[];
  readonly riskDigest: PlanningDigestV1;
  readonly costDigest: PlanningDigestV1;
  readonly proposedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly advisoryOnly: true;
  readonly recommendationDigest: PlanningDigestV1;
}

export interface MorphogenesisSynthesisAdmissionReviewV5 {
  readonly schemaVersion: 5;
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

export interface MorphogenesisSynthesisCanaryCountersV5 {
  readonly selections: number;
  readonly successes: number;
  readonly failures: number;
  readonly unsafe: number;
  readonly indeterminate: number;
}

export interface MorphogenesisSynthesisCanaryReceiptV5 {
  readonly schemaVersion: 5;
  readonly observationId: AgentPlatID;
  readonly candidateDigest: PlanningDigestV1;
  readonly outcome: "success" | "failure" | "unsafe" | "indeterminate";
  readonly outcomeEvidenceDigest: PlanningDigestV1;
  readonly observedAtLogicalMs: number;
  readonly receiptDigest: PlanningDigestV1;
}

export interface MorphogenesisSynthesisCatalogEntryV5 {
  readonly schemaVersion: 5;
  readonly candidate: MorphogenesisStrategySynthesisCandidateV5;
  readonly evaluationDigest: PlanningDigestV1;
  readonly certificationDigest: PlanningDigestV1;
  readonly status: "draft" | "experimental" | "certified" | "degraded" | "retired";
  readonly statusRevision: number;
  readonly canary: MorphogenesisSynthesisCanaryCountersV5;
  readonly canaryReceipts: readonly MorphogenesisSynthesisCanaryReceiptV5[];
  readonly lastTransitionDigest: PlanningDigestV1 | null;
}

export interface MorphogenesisSynthesisGovernanceTransitionV5 {
  readonly schemaVersion: 5;
  readonly recommendationDigest: PlanningDigestV1;
  readonly reviewDigest: PlanningDigestV1;
  readonly candidateDigest: PlanningDigestV1;
  readonly action: MorphogenesisSynthesisGovernanceActionV5;
  readonly priorStatus: MorphogenesisSynthesisCatalogEntryV5["status"];
  readonly nextStatus: MorphogenesisSynthesisCatalogEntryV5["status"];
  readonly appliedAtLogicalMs: number;
  readonly transitionDigest: PlanningDigestV1;
}

export interface MorphogenesisSynthesisGovernanceStateV5 {
  readonly schemaVersion: 5;
  readonly stateKey: AgentPlatID;
  readonly policyDigest: PlanningDigestV1;
  readonly entries: readonly MorphogenesisSynthesisCatalogEntryV5[];
  readonly pendingRecommendations: readonly MorphogenesisSynthesisAdmissionRecommendationV5[];
  readonly reviews: readonly MorphogenesisSynthesisAdmissionReviewV5[];
  readonly transitions: readonly MorphogenesisSynthesisGovernanceTransitionV5[];
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly predecessorStateDigest: PlanningDigestV1 | null;
  readonly stateDigest: PlanningDigestV1;
}

export interface MorphogenesisSynthesisReviewPortV5 {
  review(input: { readonly recommendation: MorphogenesisSynthesisAdmissionRecommendationV5;
    readonly policy: MorphogenesisSynthesisGovernancePolicyV5;
    readonly logicalTimeMs: number }): Promise<MorphogenesisSynthesisAdmissionReviewV5 | null>;
}
export interface MorphogenesisSynthesisGovernanceStoreV5 {
  load(stateKey: AgentPlatID): Promise<MorphogenesisSynthesisGovernanceStateV5 | null>;
  save(input: { readonly state: MorphogenesisSynthesisGovernanceStateV5;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null }): Promise<boolean>;
}

export function createMorphogenesisSynthesisGovernancePolicyV5(input:
  Omit<MorphogenesisSynthesisGovernancePolicyV5, "policyDigest">,
): MorphogenesisSynthesisGovernancePolicyV5 {
  if (input.schemaVersion !== 5) fail("synthesis governance policy version is invalid");
  const body = freeze({ schemaVersion: 5 as const, policyId: id(input.policyId),
    policyVersion: positive(input.policyVersion),
    synthesisPolicyDigest: sha(input.synthesisPolicyDigest),
    allowedActions: enums(input.allowedActions, ACTIONS, "synthesis governance actions"),
    allowedReviewRoutes: enums(input.allowedReviewRoutes, ROUTES, "synthesis review routes"),
    requireIndependentReviewer: bool(input.requireIndependentReviewer),
    maximumCanarySelections: positive(input.maximumCanarySelections),
    minimumCanaryOutcomes: positive(input.minimumCanaryOutcomes),
    minimumCanarySuccesses: positive(input.minimumCanarySuccesses),
    maximumCanaryUnsafeOutcomes: nonNegative(input.maximumCanaryUnsafeOutcomes),
    maximumPendingRecommendations: positive(input.maximumPendingRecommendations),
    maximumHistory: positive(input.maximumHistory),
    maximumCommitAttempts: positive(input.maximumCommitAttempts) });
  if (body.minimumCanaryOutcomes > body.maximumCanarySelections ||
      body.minimumCanarySuccesses > body.minimumCanaryOutcomes)
    fail("synthesis canary policy is inconsistent");
  return freeze({ ...body,
    policyDigest: digest("morphogenesis-synthesis-governance-policy-v5", body) });
}

export function createMorphogenesisSynthesisAdmissionReviewV5(input:
  Omit<MorphogenesisSynthesisAdmissionReviewV5, "schemaVersion" | "reviewDigest">,
): MorphogenesisSynthesisAdmissionReviewV5 {
  const actorType = input.route === "authorized_agent" ? "agent"
    : input.route === "authorized_person" ? "person" : "collective";
  if (input.actorType !== actorType) fail("synthesis reviewer type is invalid");
  const body = freeze({ schemaVersion: 5 as const, reviewId: id(input.reviewId),
    recommendationDigest: sha(input.recommendationDigest),
    route: one(input.route, ROUTES, "synthesis review route"), actorType: input.actorType,
    actorId: id(input.actorId), actorMandateDigest: sha(input.actorMandateDigest),
    independenceGroupId: id(input.independenceGroupId),
    disposition: one(input.disposition, new Set<"approved" | "rejected">(
      ["approved", "rejected"]), "synthesis review disposition"),
    proofDigest: sha(input.proofDigest), reviewedAtLogicalMs: nonNegative(input.reviewedAtLogicalMs),
    expiresAtLogicalMs: positive(input.expiresAtLogicalMs) });
  if (body.expiresAtLogicalMs <= body.reviewedAtLogicalMs)
    fail("synthesis review window is invalid");
  return freeze({ ...body, reviewDigest: digest("morphogenesis-synthesis-review-v5", body) });
}

export class InMemoryMorphogenesisSynthesisGovernanceStoreV5
  implements MorphogenesisSynthesisGovernanceStoreV5 {
  readonly #states = new Map<string, MorphogenesisSynthesisGovernanceStateV5>();
  async load(stateKey: AgentPlatID) { return this.#states.get(stateKey) ?? null; }
  async save(input: { readonly state: MorphogenesisSynthesisGovernanceStateV5;
    readonly expectedRevision: number | null; readonly expectedStateDigest: PlanningDigestV1 | null }) {
    const current = this.#states.get(input.state.stateKey);
    if ((current?.revision ?? null) !== input.expectedRevision ||
        (current?.stateDigest ?? null) !== input.expectedStateDigest) return false;
    this.#states.set(input.state.stateKey, freeze(structuredClone(input.state)));
    return true;
  }
}

export class MorphogenesisSynthesisGovernanceRuntimeV5 {
  readonly #policy: MorphogenesisSynthesisGovernancePolicyV5;
  readonly #synthesisPolicy: MorphogenesisStrategySynthesisPolicyV5;
  constructor(readonly options: { readonly stateKey: AgentPlatID;
    readonly policy: MorphogenesisSynthesisGovernancePolicyV5;
    readonly synthesisPolicy: MorphogenesisStrategySynthesisPolicyV5;
    readonly reviews: MorphogenesisSynthesisReviewPortV5;
    readonly store: MorphogenesisSynthesisGovernanceStoreV5 }) {
    id(options.stateKey);
    this.#policy = validateGovernancePolicy(options.policy);
    this.#synthesisPolicy = validateMorphogenesisStrategySynthesisPolicyV5(options.synthesisPolicy);
    if (this.#policy.synthesisPolicyDigest !== this.#synthesisPolicy.policyDigest ||
        !options.reviews || !options.store) fail("synthesis governance bindings are invalid");
  }

  async register(input: { readonly candidate: MorphogenesisStrategySynthesisCandidateV5;
    readonly evaluation: MorphogenesisStrategySynthesisEvaluationV5;
    readonly certification: MorphogenesisStrategySynthesisCertificationV5;
    readonly logicalTimeMs: number }) {
    const candidate = validateMorphogenesisStrategySynthesisCandidateV5(
      input.candidate, this.#synthesisPolicy);
    if (input.evaluation.candidateDigest !== candidate.candidateDigest ||
        input.certification.candidateDigest !== candidate.candidateDigest ||
        input.certification.evaluationDigest !== input.evaluation.evaluationDigest ||
        input.certification.disposition !== "certified" ||
        input.certification.expiresAtLogicalMs <= input.logicalTimeMs)
      fail("synthesis registration evidence is invalid");
    return this.#commit(input.logicalTimeMs, (state) => {
      const existing = state.entries.find(({ candidate: value }) =>
        value.candidateDigest === candidate.candidateDigest);
      if (existing) return state;
      return nextState(state, input.logicalTimeMs, {
        entries: [...state.entries, freeze({ schemaVersion: 5 as const, candidate,
          evaluationDigest: input.evaluation.evaluationDigest,
          certificationDigest: input.certification.certificationDigest, status: "draft" as const,
          statusRevision: 1, canary: emptyCanary(), canaryReceipts: freeze([]),
          lastTransitionDigest: null })],
      });
    });
  }

  async recommend(input: Omit<MorphogenesisSynthesisAdmissionRecommendationV5,
    "schemaVersion" | "stateDigest" | "stateRevision" | "advisoryOnly" |
    "recommendationDigest">) {
    let result: MorphogenesisSynthesisAdmissionRecommendationV5 | null = null;
    await this.#commit(input.proposedAtLogicalMs, (state) => {
      const entry = entryFor(state, input.candidateDigest);
      if (!this.#policy.allowedActions.includes(input.action) ||
          !this.#policy.allowedReviewRoutes.includes(input.reviewRoute) ||
          input.evaluationDigest !== entry.evaluationDigest ||
          input.certificationDigest !== entry.certificationDigest ||
          input.expiresAtLogicalMs <= input.proposedAtLogicalMs)
        fail("synthesis recommendation is not allowed");
      assertAction(entry, input.action, this.#policy);
      const retained = state.pendingRecommendations.find(({ recommendationId }) =>
        recommendationId === input.recommendationId);
      const recommendation = createRecommendation(input, state);
      if (retained) {
        if (retained.recommendationDigest !== recommendation.recommendationDigest)
          fail("synthesis recommendation replay diverged");
        result = retained; return state;
      }
      if (state.pendingRecommendations.length >= this.#policy.maximumPendingRecommendations)
        fail("synthesis recommendation capacity is exhausted");
      result = recommendation;
      return nextState(state, input.proposedAtLogicalMs,
        { pendingRecommendations: [...state.pendingRecommendations, recommendation] });
    });
    return result!;
  }

  async reviewAndApply(input: { readonly recommendationId: AgentPlatID;
    readonly logicalTimeMs: number }) {
    let transition: MorphogenesisSynthesisGovernanceTransitionV5 | null = null;
    await this.#commit(input.logicalTimeMs, async (state) => {
      const recommendation = state.pendingRecommendations.find(({ recommendationId }) =>
        recommendationId === input.recommendationId);
      if (!recommendation || recommendation.expiresAtLogicalMs <= input.logicalTimeMs)
        fail("synthesis recommendation is unavailable");
      const review = await this.options.reviews.review({ recommendation,
        policy: this.#policy, logicalTimeMs: input.logicalTimeMs });
      if (!review) fail("synthesis review is unavailable");
      const normalized = createMorphogenesisSynthesisAdmissionReviewV5(review);
      if (normalized.recommendationDigest !== recommendation.recommendationDigest ||
          normalized.route !== recommendation.reviewRoute ||
          normalized.expiresAtLogicalMs <= input.logicalTimeMs ||
          (this.#policy.requireIndependentReviewer &&
            normalized.actorId === recommendation.proposerId))
        fail("synthesis review binding or independence is invalid");
      const entry = entryFor(state, recommendation.candidateDigest);
      const nextStatus = normalized.disposition === "rejected" ? entry.status
        : statusFor(recommendation.action);
      transition = createTransition(recommendation, normalized, entry.status,
        nextStatus, input.logicalTimeMs);
      const entries = state.entries.map((item) => item.candidate.candidateDigest ===
        entry.candidate.candidateDigest ? freeze({ ...item, status: nextStatus,
          statusRevision: item.statusRevision + (nextStatus === item.status ? 0 : 1),
          lastTransitionDigest: transition!.transitionDigest }) : item);
      return nextState(state, input.logicalTimeMs, { entries,
        pendingRecommendations: state.pendingRecommendations.filter(({ recommendationId }) =>
          recommendationId !== input.recommendationId),
        reviews: boundedAppend(state.reviews, normalized, this.#policy.maximumHistory),
        transitions: boundedAppend(state.transitions, transition!, this.#policy.maximumHistory) });
    });
    return transition!;
  }

  async observeCanary(input: { readonly observationId: AgentPlatID;
    readonly candidateDigest: PlanningDigestV1;
    readonly outcome: "success" | "failure" | "unsafe" | "indeterminate";
    readonly outcomeEvidenceDigest: PlanningDigestV1; readonly logicalTimeMs: number }) {
    return this.#commit(input.logicalTimeMs, (state) => {
      const entry = entryFor(state, input.candidateDigest);
      const receipt = createCanaryReceipt(input);
      const retained = entry.canaryReceipts.find(({ observationId }) =>
        observationId === receipt.observationId);
      if (retained) {
        if (retained.receiptDigest !== receipt.receiptDigest)
          fail("synthesis canary observation replay diverged");
        return state;
      }
      if (entry.status !== "experimental" ||
          entry.canary.selections >= this.#policy.maximumCanarySelections)
        fail("synthesis canary observation is not allowed");
      const field = input.outcome === "success" ? "successes" : input.outcome === "failure"
        ? "failures" : input.outcome;
      const canary = freeze({ ...entry.canary, selections: entry.canary.selections + 1,
        [field]: entry.canary[field] + 1 });
      const entries = state.entries.map((item) => item.candidate.candidateDigest ===
        entry.candidate.candidateDigest ? freeze({ ...item, canary,
          canaryReceipts: freeze([...item.canaryReceipts, receipt]) }) : item);
      return nextState(state, input.logicalTimeMs, { entries });
    });
  }

  async state(logicalTimeMs: number) { return this.#load(logicalTimeMs); }
  async #load(logicalTimeMs: number) {
    const retained = await this.options.store.load(this.options.stateKey);
    return retained ?? initialState(this.options.stateKey, this.#policy, logicalTimeMs);
  }
  async #commit(logicalTimeMs: number,
    mutate: (state: MorphogenesisSynthesisGovernanceStateV5) =>
      MorphogenesisSynthesisGovernanceStateV5 | Promise<MorphogenesisSynthesisGovernanceStateV5>) {
    for (let attempt = 0; attempt < this.#policy.maximumCommitAttempts; attempt += 1) {
      const retained = await this.options.store.load(this.options.stateKey);
      const current = retained ?? initialState(this.options.stateKey, this.#policy, logicalTimeMs);
      if (logicalTimeMs < current.logicalTimeHighWaterMs) fail("synthesis governance time rolled back");
      const proposed = await mutate(current);
      if (proposed === current) return current;
      if (await this.options.store.save({ state: proposed,
        expectedRevision: retained?.revision ?? null,
        expectedStateDigest: retained?.stateDigest ?? null })) return proposed;
    }
    fail("synthesis governance CAS retries exhausted");
  }
}

function initialState(stateKey: AgentPlatID, policy: MorphogenesisSynthesisGovernancePolicyV5,
  logicalTimeMs: number): MorphogenesisSynthesisGovernanceStateV5 {
  return stateBody({ stateKey, policyDigest: policy.policyDigest, entries: [],
    pendingRecommendations: [], reviews: [], transitions: [], revision: 0,
    logicalTimeHighWaterMs: logicalTimeMs, predecessorStateDigest: null });
}
function nextState(state: MorphogenesisSynthesisGovernanceStateV5, logicalTimeMs: number,
  changes: Partial<Pick<MorphogenesisSynthesisGovernanceStateV5, "entries" |
    "pendingRecommendations" | "reviews" | "transitions">>) {
  return stateBody({ stateKey: state.stateKey, policyDigest: state.policyDigest,
    entries: changes.entries ?? state.entries,
    pendingRecommendations: changes.pendingRecommendations ?? state.pendingRecommendations,
    reviews: changes.reviews ?? state.reviews, transitions: changes.transitions ?? state.transitions,
    revision: state.revision + 1, logicalTimeHighWaterMs: logicalTimeMs,
    predecessorStateDigest: state.stateDigest });
}
function stateBody(input: Omit<MorphogenesisSynthesisGovernanceStateV5,
  "schemaVersion" | "stateDigest">): MorphogenesisSynthesisGovernanceStateV5 {
  const body = freeze({ schemaVersion: 5 as const, ...input });
  return freeze({ ...body, stateDigest: digest("morphogenesis-synthesis-governance-state-v5", body) });
}
function createRecommendation(input: Omit<MorphogenesisSynthesisAdmissionRecommendationV5,
  "schemaVersion" | "stateDigest" | "stateRevision" | "advisoryOnly" |
  "recommendationDigest">, state: MorphogenesisSynthesisGovernanceStateV5) {
  const body = freeze({ schemaVersion: 5 as const, recommendationId: id(input.recommendationId),
    action: one(input.action, ACTIONS, "synthesis action"),
    candidateDigest: sha(input.candidateDigest), evaluationDigest: sha(input.evaluationDigest),
    certificationDigest: sha(input.certificationDigest), stateDigest: state.stateDigest,
    stateRevision: state.revision, proposerId: id(input.proposerId),
    proposerImplementationDigest: sha(input.proposerImplementationDigest),
    reviewRoute: one(input.reviewRoute, ROUTES, "synthesis review route"),
    evidenceDigests: shas(input.evidenceDigests, 1, 256), riskDigest: sha(input.riskDigest),
    costDigest: sha(input.costDigest), proposedAtLogicalMs: nonNegative(input.proposedAtLogicalMs),
    expiresAtLogicalMs: positive(input.expiresAtLogicalMs), advisoryOnly: true as const });
  return freeze({ ...body,
    recommendationDigest: digest("morphogenesis-synthesis-recommendation-v5", body) });
}
function createTransition(recommendation: MorphogenesisSynthesisAdmissionRecommendationV5,
  review: MorphogenesisSynthesisAdmissionReviewV5,
  priorStatus: MorphogenesisSynthesisCatalogEntryV5["status"],
  nextStatus: MorphogenesisSynthesisCatalogEntryV5["status"], appliedAtLogicalMs: number) {
  const body = freeze({ schemaVersion: 5 as const,
    recommendationDigest: recommendation.recommendationDigest, reviewDigest: review.reviewDigest,
    candidateDigest: recommendation.candidateDigest, action: recommendation.action,
    priorStatus, nextStatus, appliedAtLogicalMs });
  return freeze({ ...body,
    transitionDigest: digest("morphogenesis-synthesis-governance-transition-v5", body) });
}
function createCanaryReceipt(input: { readonly observationId: AgentPlatID;
  readonly candidateDigest: PlanningDigestV1;
  readonly outcome: "success" | "failure" | "unsafe" | "indeterminate";
  readonly outcomeEvidenceDigest: PlanningDigestV1; readonly logicalTimeMs: number }) {
  const body = freeze({ schemaVersion: 5 as const, observationId: id(input.observationId),
    candidateDigest: sha(input.candidateDigest),
    outcome: one(input.outcome, new Set<"success" | "failure" | "unsafe" | "indeterminate">(
      ["success", "failure", "unsafe", "indeterminate"]), "synthesis canary outcome"),
    outcomeEvidenceDigest: sha(input.outcomeEvidenceDigest),
    observedAtLogicalMs: nonNegative(input.logicalTimeMs) });
  return freeze({ ...body,
    receiptDigest: digest("morphogenesis-synthesis-canary-receipt-v5", body) });
}
function assertAction(entry: MorphogenesisSynthesisCatalogEntryV5,
  action: MorphogenesisSynthesisGovernanceActionV5,
  policy: MorphogenesisSynthesisGovernancePolicyV5) {
  const allowed = action === "admit_experimental" ? entry.status === "draft"
    : action === "certify" ? entry.status === "experimental" &&
      entry.canary.selections >= policy.minimumCanaryOutcomes &&
      entry.canary.successes >= policy.minimumCanarySuccesses &&
      entry.canary.unsafe <= policy.maximumCanaryUnsafeOutcomes
    : action === "degrade" ? ["experimental", "certified"].includes(entry.status)
    : action === "retire" ? entry.status !== "retired"
    : entry.status === "degraded";
  if (!allowed) fail("synthesis lifecycle transition is not allowed");
}
function statusFor(action: MorphogenesisSynthesisGovernanceActionV5):
  MorphogenesisSynthesisCatalogEntryV5["status"] {
  return action === "admit_experimental" || action === "rollback" ? "experimental"
    : action === "certify" ? "certified" : action === "degrade" ? "degraded" : "retired";
}
function entryFor(state: MorphogenesisSynthesisGovernanceStateV5, digestValue: PlanningDigestV1) {
  const entry = state.entries.find(({ candidate }) => candidate.candidateDigest === digestValue);
  if (!entry) fail("synthesis candidate is not registered"); return entry;
}
function emptyCanary(): MorphogenesisSynthesisCanaryCountersV5 { return freeze({ selections: 0,
  successes: 0, failures: 0, unsafe: 0, indeterminate: 0 }); }
function boundedAppend<T>(values: readonly T[], value: T, maximum: number) {
  return freeze([...values, value].slice(-maximum));
}
function validateGovernancePolicy(value: MorphogenesisSynthesisGovernancePolicyV5) {
  const { policyDigest, ...body } = value;
  const rebuilt = createMorphogenesisSynthesisGovernancePolicyV5(body);
  if (policyDigest !== rebuilt.policyDigest) fail("synthesis governance policy digest is invalid");
  return rebuilt;
}
const ACTIONS = new Set<MorphogenesisSynthesisGovernanceActionV5>(
  ["admit_experimental", "certify", "degrade", "retire", "rollback"]);
const ROUTES = new Set<MorphogenesisStrategyReviewRouteV3>(
  ["authorized_agent", "authorized_person", "collective"]);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u;
const SHA = /^sha256:[0-9a-f]{64}$/u;
function id(value: unknown): AgentPlatID { if (typeof value !== "string" || !ID.test(value)) fail("synthesis governance ID is invalid"); return value as AgentPlatID; }
function sha(value: unknown): PlanningDigestV1 { if (typeof value !== "string" || !SHA.test(value)) fail("synthesis governance digest is invalid"); return value as PlanningDigestV1; }
function positive(value: unknown) { if (!Number.isSafeInteger(value) || (value as number) < 1) fail("synthesis governance positive integer is invalid"); return value as number; }
function nonNegative(value: unknown) { if (!Number.isSafeInteger(value) || (value as number) < 0) fail("synthesis governance non-negative integer is invalid"); return value as number; }
function bool(value: unknown) { if (typeof value !== "boolean") fail("synthesis governance boolean is invalid"); return value; }
function one<T extends string>(value: unknown, allowed: ReadonlySet<T>, label: string): T { if (typeof value !== "string" || !allowed.has(value as T)) fail(`${label} is invalid`); return value as T; }
function enums<T extends string>(values: readonly unknown[], allowed: ReadonlySet<T>, label: string) { if (!Array.isArray(values)) fail(`${label} are invalid`); const result = [...new Set(values.map((value) => one(value, allowed, label)))].sort(); if (!result.length || result.length !== values.length) fail(`${label} are invalid`); return freeze(result); }
function shas(values: readonly unknown[], minimum: number, maximum: number) { if (!Array.isArray(values)) fail("synthesis governance digests are invalid"); const result = [...new Set(values.map(sha))].sort(); if (result.length < minimum || result.length > maximum || result.length !== values.length) fail("synthesis governance digest set is invalid"); return freeze(result); }
function digest(domain: string, value: unknown): PlanningDigestV1 { return digestPlanningJsonV1(domain as never, value as PlanningJson); }
function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const item of Object.values(value as Record<string, unknown>)) freeze(item); } return value; }
function fail(message: string): never { throw new TypeError(message); }
