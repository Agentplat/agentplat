import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";
import {
  validateMorphogenesisOrganizationalEvolutionPlanV7,
  type MorphogenesisOrganizationalEvolutionPlanV7,
} from "./morphogenesis-organizational-evolution-plan.js";
import type { MorphogenesisStrategyReviewRouteV3 } from "./morphogenesis-strategy-governance.js";
export type MorphogenesisOrganizationalGovernanceActionV7 =
  "start_canary" | "stabilize" | "isolate" | "rollback";
export interface MorphogenesisOrganizationalGovernancePolicyV7 {
  readonly schemaVersion: 7;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly allowedActions: readonly MorphogenesisOrganizationalGovernanceActionV7[];
  readonly allowedReviewRoutes: readonly MorphogenesisStrategyReviewRouteV3[];
  readonly requireIndependentReviewer: boolean;
  readonly maximumCanaryObservations: number;
  readonly minimumCanaryObservations: number;
  readonly minimumStableObservations: number;
  readonly maximumUnsafeObservations: number;
  readonly maximumPendingRecommendations: number;
  readonly maximumHistory: number;
  readonly maximumCommitAttempts: number;
  readonly policyDigest: PlanningDigestV1;
}
export interface MorphogenesisOrganizationalCanaryReceiptV7 {
  readonly schemaVersion: 7;
  readonly observationId: AgentPlatID;
  readonly planDigest: PlanningDigestV1;
  readonly outcome: "stable" | "regression" | "unsafe" | "indeterminate";
  readonly topologyEpoch: number;
  readonly capabilityEvidenceDigest: PlanningDigestV1;
  readonly continuityEvidenceDigest: PlanningDigestV1;
  readonly diversityEvidenceDigest: PlanningDigestV1;
  readonly authorityEvidenceDigest: PlanningDigestV1;
  readonly observedAtLogicalMs: number;
  readonly receiptDigest: PlanningDigestV1;
}
export interface MorphogenesisOrganizationalRecommendationV7 {
  readonly schemaVersion: 7;
  readonly recommendationId: AgentPlatID;
  readonly action: MorphogenesisOrganizationalGovernanceActionV7;
  readonly planDigest: PlanningDigestV1;
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
export interface MorphogenesisOrganizationalReviewV7 {
  readonly schemaVersion: 7;
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
export interface MorphogenesisOrganizationalGovernanceStateV7 {
  readonly schemaVersion: 7;
  readonly stateKey: AgentPlatID;
  readonly policyDigest: PlanningDigestV1;
  readonly plan: MorphogenesisOrganizationalEvolutionPlanV7;
  readonly status:
    "proposed" | "canary" | "stable" | "isolated" | "rolled_back";
  readonly canaryReceipts: readonly MorphogenesisOrganizationalCanaryReceiptV7[];
  readonly pendingRecommendations: readonly MorphogenesisOrganizationalRecommendationV7[];
  readonly reviews: readonly MorphogenesisOrganizationalReviewV7[];
  readonly authorizationDigest: PlanningDigestV1 | null;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly predecessorStateDigest: PlanningDigestV1 | null;
  readonly stateDigest: PlanningDigestV1;
}
export interface MorphogenesisOrganizationalReviewPortV7 {
  review(input: {
    readonly recommendation: MorphogenesisOrganizationalRecommendationV7;
    readonly policy: MorphogenesisOrganizationalGovernancePolicyV7;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisOrganizationalReviewV7 | null>;
}
export interface MorphogenesisOrganizationalGovernanceStoreV7 {
  load(
    k: AgentPlatID,
  ): Promise<MorphogenesisOrganizationalGovernanceStateV7 | null>;
  save(i: {
    readonly state: MorphogenesisOrganizationalGovernanceStateV7;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }): Promise<boolean>;
}
export function createMorphogenesisOrganizationalGovernancePolicyV7(
  i: Omit<MorphogenesisOrganizationalGovernancePolicyV7, "policyDigest">,
) {
  const b = freeze({
    schemaVersion: 7 as const,
    policyId: id(i.policyId),
    policyVersion: pos(i.policyVersion),
    allowedActions: enums(i.allowedActions, ACTIONS),
    allowedReviewRoutes: enums(i.allowedReviewRoutes, ROUTES),
    requireIndependentReviewer: Boolean(i.requireIndependentReviewer),
    maximumCanaryObservations: pos(i.maximumCanaryObservations),
    minimumCanaryObservations: pos(i.minimumCanaryObservations),
    minimumStableObservations: pos(i.minimumStableObservations),
    maximumUnsafeObservations: nonneg(i.maximumUnsafeObservations),
    maximumPendingRecommendations: pos(i.maximumPendingRecommendations),
    maximumHistory: pos(i.maximumHistory),
    maximumCommitAttempts: pos(i.maximumCommitAttempts),
  });
  if (
    b.minimumCanaryObservations > b.maximumCanaryObservations ||
    b.minimumStableObservations > b.minimumCanaryObservations
  )
    fail("organizational canary policy inconsistent");
  return freeze({
    ...b,
    policyDigest: digest(
      "morphogenesis-organizational-governance-policy-v7",
      b,
    ),
  });
}
export function createMorphogenesisOrganizationalReviewV7(
  i: Omit<
    MorphogenesisOrganizationalReviewV7,
    "schemaVersion" | "reviewDigest"
  >,
) {
  const t =
    i.route === "authorized_agent"
      ? "agent"
      : i.route === "authorized_person"
        ? "person"
        : "collective";
  if (i.actorType !== t) fail("organizational reviewer type invalid");
  const b = freeze({
    schemaVersion: 7 as const,
    reviewId: id(i.reviewId),
    recommendationDigest: sha(i.recommendationDigest),
    route: one(i.route, ROUTES),
    actorType: i.actorType,
    actorId: id(i.actorId),
    actorMandateDigest: sha(i.actorMandateDigest),
    independenceGroupId: id(i.independenceGroupId),
    disposition: one(i.disposition, new Set(["approved", "rejected"] as const)),
    proofDigest: sha(i.proofDigest),
    reviewedAtLogicalMs: nonneg(i.reviewedAtLogicalMs),
    expiresAtLogicalMs: pos(i.expiresAtLogicalMs),
  });
  return freeze({
    ...b,
    reviewDigest: digest("morphogenesis-organizational-review-v7", b),
  });
}
export class InMemoryMorphogenesisOrganizationalGovernanceStoreV7 implements MorphogenesisOrganizationalGovernanceStoreV7 {
  #m = new Map<string, MorphogenesisOrganizationalGovernanceStateV7>();
  async load(k: AgentPlatID) {
    return this.#m.get(k) ?? null;
  }
  async save(i: {
    readonly state: MorphogenesisOrganizationalGovernanceStateV7;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }) {
    const c = this.#m.get(i.state.stateKey);
    if (
      (c?.revision ?? null) !== i.expectedRevision ||
      (c?.stateDigest ?? null) !== i.expectedStateDigest
    )
      return false;
    this.#m.set(i.state.stateKey, freeze(structuredClone(i.state)));
    return true;
  }
}
export class MorphogenesisOrganizationalGovernanceRuntimeV7 {
  constructor(
    readonly options: {
      readonly stateKey: AgentPlatID;
      readonly policy: MorphogenesisOrganizationalGovernancePolicyV7;
      readonly plan: MorphogenesisOrganizationalEvolutionPlanV7;
      readonly reviews: MorphogenesisOrganizationalReviewPortV7;
      readonly store: MorphogenesisOrganizationalGovernanceStoreV7;
    },
  ) {}
  async recommend(
    i: Omit<
      MorphogenesisOrganizationalRecommendationV7,
      | "schemaVersion"
      | "planDigest"
      | "stateDigest"
      | "stateRevision"
      | "advisoryOnly"
      | "recommendationDigest"
    >,
  ) {
    let out: MorphogenesisOrganizationalRecommendationV7 | null = null;
    await this.commit(i.proposedAtLogicalMs, (s) => {
      assertAction(s, i.action, this.options.policy);
      const r = rec(i, s);
      out = r;
      return next(s, i.proposedAtLogicalMs, {
        pendingRecommendations: [...s.pendingRecommendations, r],
      });
    });
    return out!;
  }
  async reviewAndApply(i: {
    readonly recommendationId: AgentPlatID;
    readonly logicalTimeMs: number;
  }) {
    let auth: PlanningDigestV1 | null = null;
    await this.commit(i.logicalTimeMs, async (s) => {
      const r = s.pendingRecommendations.find(
        (x) => x.recommendationId === i.recommendationId,
      );
      if (!r || r.expiresAtLogicalMs <= i.logicalTimeMs)
        fail("organizational recommendation unavailable");
      const raw = await this.options.reviews.review({
        recommendation: r,
        policy: this.options.policy,
        logicalTimeMs: i.logicalTimeMs,
      });
      if (!raw) fail("organizational review unavailable");
      const v = createMorphogenesisOrganizationalReviewV7(raw);
      if (
        v.recommendationDigest !== r.recommendationDigest ||
        v.route !== r.reviewRoute ||
        (this.options.policy.requireIndependentReviewer &&
          v.actorId === r.proposerId)
      )
        fail("organizational review invalid");
      const status =
        v.disposition === "rejected"
          ? s.status
          : r.action === "start_canary"
            ? "canary"
            : r.action === "stabilize"
              ? "stable"
              : r.action === "isolate"
                ? "isolated"
                : "rolled_back";
      auth =
        v.disposition === "approved" && r.action === "start_canary"
          ? digest("morphogenesis-organizational-authorization-v7", {
              planDigest: s.plan.planDigest,
              reviewDigest: v.reviewDigest,
              stateDigest: s.stateDigest,
            })
          : s.authorizationDigest;
      return next(s, i.logicalTimeMs, {
        status,
        authorizationDigest: auth,
        pendingRecommendations: s.pendingRecommendations.filter((x) => x !== r),
        reviews: [...s.reviews, v].slice(-this.options.policy.maximumHistory),
      });
    });
    return auth;
  }
  async observe(i: {
    readonly observationId: AgentPlatID;
    readonly outcome: MorphogenesisOrganizationalCanaryReceiptV7["outcome"];
    readonly capabilityEvidenceDigest: PlanningDigestV1;
    readonly continuityEvidenceDigest: PlanningDigestV1;
    readonly diversityEvidenceDigest: PlanningDigestV1;
    readonly authorityEvidenceDigest: PlanningDigestV1;
    readonly logicalTimeMs: number;
  }) {
    return this.commit(i.logicalTimeMs, (s) => {
      if (
        s.status !== "canary" ||
        s.canaryReceipts.length >= this.options.policy.maximumCanaryObservations
      )
        fail("organizational canary observation unavailable");
      const r = canary(i, s.plan);
      const old = s.canaryReceipts.find(
        (x) => x.observationId === r.observationId,
      );
      if (old) {
        if (old.receiptDigest !== r.receiptDigest)
          fail("organizational canary replay diverged");
        return s;
      }
      return next(s, i.logicalTimeMs, {
        canaryReceipts: [...s.canaryReceipts, r],
      });
    });
  }
  async state(t: number) {
    return this.load(t);
  }
  async load(t: number) {
    return (
      (await this.options.store.load(this.options.stateKey)) ??
      state({
        stateKey: id(this.options.stateKey),
        policyDigest: this.options.policy.policyDigest,
        plan: validateMorphogenesisOrganizationalEvolutionPlanV7(
          this.options.plan,
        ),
        status: "proposed",
        canaryReceipts: [],
        pendingRecommendations: [],
        reviews: [],
        authorizationDigest: null,
        revision: 0,
        logicalTimeHighWaterMs: t,
        predecessorStateDigest: null,
      })
    );
  }
  async commit(
    t: number,
    f: (
      s: MorphogenesisOrganizationalGovernanceStateV7,
    ) =>
      | MorphogenesisOrganizationalGovernanceStateV7
      | Promise<MorphogenesisOrganizationalGovernanceStateV7>,
  ) {
    for (let n = 0; n < this.options.policy.maximumCommitAttempts; n++) {
      const old = await this.options.store.load(this.options.stateKey);
      const s = old ?? (await this.load(t));
      const q = await f(s);
      if (
        await this.options.store.save({
          state: q,
          expectedRevision: old?.revision ?? null,
          expectedStateDigest: old?.stateDigest ?? null,
        })
      )
        return q;
    }
    fail("organizational governance CAS exhausted");
  }
}
function assertAction(
  s: MorphogenesisOrganizationalGovernanceStateV7,
  a: MorphogenesisOrganizationalGovernanceActionV7,
  p: MorphogenesisOrganizationalGovernancePolicyV7,
) {
  const stable = s.canaryReceipts.filter((x) => x.outcome === "stable").length,
    unsafe = s.canaryReceipts.filter((x) => x.outcome === "unsafe").length;
  const ok =
    a === "start_canary"
      ? s.status === "proposed"
      : a === "stabilize"
        ? s.status === "canary" &&
          s.canaryReceipts.length >= p.minimumCanaryObservations &&
          stable >= p.minimumStableObservations &&
          unsafe <= p.maximumUnsafeObservations
        : a === "isolate"
          ? s.status === "canary"
          : s.status === "canary" || s.status === "isolated";
  if (!ok || !p.allowedActions.includes(a))
    fail("organizational governance action unavailable");
}
function canary(
  i: {
    readonly observationId: AgentPlatID;
    readonly outcome: MorphogenesisOrganizationalCanaryReceiptV7["outcome"];
    readonly capabilityEvidenceDigest: PlanningDigestV1;
    readonly continuityEvidenceDigest: PlanningDigestV1;
    readonly diversityEvidenceDigest: PlanningDigestV1;
    readonly authorityEvidenceDigest: PlanningDigestV1;
    readonly logicalTimeMs: number;
  },
  p: MorphogenesisOrganizationalEvolutionPlanV7,
) {
  const b = freeze({
    schemaVersion: 7 as const,
    observationId: id(i.observationId),
    planDigest: p.planDigest,
    outcome: i.outcome,
    topologyEpoch: p.successorEpoch,
    capabilityEvidenceDigest: sha(i.capabilityEvidenceDigest),
    continuityEvidenceDigest: sha(i.continuityEvidenceDigest),
    diversityEvidenceDigest: sha(i.diversityEvidenceDigest),
    authorityEvidenceDigest: sha(i.authorityEvidenceDigest),
    observedAtLogicalMs: nonneg(i.logicalTimeMs),
  });
  return freeze({
    ...b,
    receiptDigest: digest("morphogenesis-organizational-canary-receipt-v7", b),
  });
}
function rec(
  i: Omit<
    MorphogenesisOrganizationalRecommendationV7,
    | "schemaVersion"
    | "planDigest"
    | "stateDigest"
    | "stateRevision"
    | "advisoryOnly"
    | "recommendationDigest"
  >,
  s: MorphogenesisOrganizationalGovernanceStateV7,
) {
  const b = freeze({
    schemaVersion: 7 as const,
    recommendationId: id(i.recommendationId),
    action: i.action,
    planDigest: s.plan.planDigest,
    stateDigest: s.stateDigest,
    stateRevision: s.revision,
    proposerId: id(i.proposerId),
    proposerImplementationDigest: sha(i.proposerImplementationDigest),
    reviewRoute: i.reviewRoute,
    evidenceDigests: shas(i.evidenceDigests),
    proposedAtLogicalMs: nonneg(i.proposedAtLogicalMs),
    expiresAtLogicalMs: pos(i.expiresAtLogicalMs),
    advisoryOnly: true as const,
  });
  return freeze({
    ...b,
    recommendationDigest: digest(
      "morphogenesis-organizational-recommendation-v7",
      b,
    ),
  });
}
function state(
  i: Omit<
    MorphogenesisOrganizationalGovernanceStateV7,
    "schemaVersion" | "stateDigest"
  >,
) {
  const b = freeze({ schemaVersion: 7 as const, ...i });
  return freeze({
    ...b,
    stateDigest: digest("morphogenesis-organizational-governance-state-v7", b),
  });
}
function next(
  s: MorphogenesisOrganizationalGovernanceStateV7,
  t: number,
  c: Partial<MorphogenesisOrganizationalGovernanceStateV7>,
) {
  return state({
    ...s,
    ...c,
    revision: s.revision + 1,
    logicalTimeHighWaterMs: t,
    predecessorStateDigest: s.stateDigest,
  });
}
const ACTIONS = new Set<MorphogenesisOrganizationalGovernanceActionV7>([
    "start_canary",
    "stabilize",
    "isolate",
    "rollback",
  ]),
  ROUTES = new Set<MorphogenesisStrategyReviewRouteV3>([
    "authorized_agent",
    "authorized_person",
    "collective",
  ]),
  ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u,
  SHA = /^sha256:[0-9a-f]{64}$/u;
function id(v: unknown) {
  if (typeof v !== "string" || !ID.test(v))
    fail("organizational governance ID invalid");
  return v as AgentPlatID;
}
function sha(v: unknown) {
  if (typeof v !== "string" || !SHA.test(v))
    fail("organizational governance digest invalid");
  return v as PlanningDigestV1;
}
function pos(v: unknown) {
  if (!Number.isSafeInteger(v) || (v as number) < 1)
    fail("organizational governance integer invalid");
  return v as number;
}
function nonneg(v: unknown) {
  if (!Number.isSafeInteger(v) || (v as number) < 0)
    fail("organizational governance integer invalid");
  return v as number;
}
function one<T extends string>(v: unknown, s: ReadonlySet<T>) {
  if (typeof v !== "string" || !s.has(v as T))
    fail("organizational governance enum invalid");
  return v as T;
}
function enums<T extends string>(v: readonly unknown[], s: ReadonlySet<T>) {
  const r = [...new Set(v.map((x) => one(x, s)))].sort();
  if (!r.length || r.length !== v.length)
    fail("organizational governance set invalid");
  return freeze(r);
}
function shas(v: readonly unknown[]) {
  const r = [...new Set(v.map(sha))].sort();
  if (!r.length || r.length !== v.length)
    fail("organizational governance evidence invalid");
  return freeze(r);
}
function digest(d: string, v: unknown) {
  return digestPlanningJsonV1(d as never, v as PlanningJson);
}
function freeze<T>(v: T): T {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const x of Object.values(v as Record<string, unknown>)) freeze(x);
  }
  return v;
}
function fail(m: string): never {
  throw new TypeError(m);
}
