import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";
import type { MorphogenesisStrategyReviewRouteV3 } from "./morphogenesis-strategy-governance.js";
import {
  createMorphogenesisAgentAttestationV1,
  createMorphogenesisLifecycleAgentV1,
  type MorphogenesisAgentAttestationPortV1,
  type MorphogenesisAgentAttestationV1,
  type MorphogenesisAgentLifecyclePortV1,
  type MorphogenesisLifecycleAgentV1,
} from "./morphogenesis-execution.js";
import type { MorphogenesisScopeV1 } from "./morphogenesis-contracts.js";
import {
  createMorphogenesisTerminalAgentReceiptV1,
  type MorphogenesisAgentRetirementPortV1,
  type MorphogenesisAuthorityFenceReceiptV1,
  type MorphogenesisTerminalAgentReceiptV1,
} from "./morphogenesis-retirement.js";
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
import {
  validateMorphogenesisAgentGenesisProbationEligibilityV6,
  type MorphogenesisAgentGenesisProbationEligibilityV6,
} from "./morphogenesis-agent-genesis-integrations.js";

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
  readonly pendingMembershipOperationId: AgentPlatID | null;
  readonly lifecycleAgent: MorphogenesisLifecycleAgentV1 | null;
  readonly pendingAttestationOperationId: AgentPlatID | null;
  readonly attestation: MorphogenesisAgentAttestationV1 | null;
  readonly pendingCompensationOperationId: AgentPlatID | null;
  readonly terminalReceipt: MorphogenesisTerminalAgentReceiptV1 | null;
  readonly externalAdmissionApplied: boolean;
  readonly workGranted: false;
  readonly actionAuthorityGranted: false;
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
  review(input: {
    readonly recommendation: MorphogenesisAgentGenesisRecommendationV6;
    readonly policy: MorphogenesisAgentGenesisLifecyclePolicyV6;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisAgentGenesisReviewV6 | null>;
}
export interface MorphogenesisAgentGenesisLifecycleStoreV6 {
  load(
    stateKey: AgentPlatID,
  ): Promise<MorphogenesisAgentGenesisLifecycleStateV6 | null>;
  save(input: {
    readonly state: MorphogenesisAgentGenesisLifecycleStateV6;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }): Promise<boolean>;
}

export function createMorphogenesisAgentGenesisLifecyclePolicyV6(
  input: Omit<MorphogenesisAgentGenesisLifecyclePolicyV6, "policyDigest">,
): MorphogenesisAgentGenesisLifecyclePolicyV6 {
  if (input.schemaVersion !== 6)
    fail("Agent Genesis lifecycle policy version is invalid");
  const body = freeze({
    schemaVersion: 6 as const,
    policyId: id(input.policyId),
    policyVersion: positive(input.policyVersion),
    genesisPolicyDigest: sha(input.genesisPolicyDigest),
    allowedActions: enums(
      input.allowedActions,
      ACTIONS,
      "Agent Genesis actions",
    ),
    allowedReviewRoutes: enums(
      input.allowedReviewRoutes,
      ROUTES,
      "Agent Genesis review routes",
    ),
    requireIndependentReviewer: bool(input.requireIndependentReviewer),
    maximumProbationObservations: positive(input.maximumProbationObservations),
    minimumProbationObservations: positive(input.minimumProbationObservations),
    minimumProbationSuccesses: positive(input.minimumProbationSuccesses),
    maximumUnsafeObservations: nonNegative(input.maximumUnsafeObservations),
    maximumPendingRecommendations: positive(
      input.maximumPendingRecommendations,
    ),
    maximumHistory: positive(input.maximumHistory),
    maximumCommitAttempts: positive(input.maximumCommitAttempts),
  });
  if (
    body.minimumProbationObservations > body.maximumProbationObservations ||
    body.minimumProbationSuccesses > body.minimumProbationObservations
  )
    fail("Agent Genesis probation policy is inconsistent");
  return freeze({
    ...body,
    policyDigest: digest(
      "morphogenesis-agent-genesis-lifecycle-policy-v6",
      body,
    ),
  });
}

export function createMorphogenesisAgentGenesisReviewV6(
  input: Omit<
    MorphogenesisAgentGenesisReviewV6,
    "schemaVersion" | "reviewDigest"
  >,
) {
  const expected =
    input.route === "authorized_agent"
      ? "agent"
      : input.route === "authorized_person"
        ? "person"
        : "collective";
  if (input.actorType !== expected)
    fail("Agent Genesis reviewer type is invalid");
  const body = freeze({
    schemaVersion: 6 as const,
    reviewId: id(input.reviewId),
    recommendationDigest: sha(input.recommendationDigest),
    route: one(input.route, ROUTES, "Agent Genesis review route"),
    actorType: input.actorType,
    actorId: id(input.actorId),
    actorMandateDigest: sha(input.actorMandateDigest),
    independenceGroupId: id(input.independenceGroupId),
    disposition: one(
      input.disposition,
      new Set<"approved" | "rejected">(["approved", "rejected"]),
      "Agent Genesis review disposition",
    ),
    proofDigest: sha(input.proofDigest),
    reviewedAtLogicalMs: nonNegative(input.reviewedAtLogicalMs),
    expiresAtLogicalMs: positive(input.expiresAtLogicalMs),
  });
  if (body.expiresAtLogicalMs <= body.reviewedAtLogicalMs)
    fail("Agent Genesis review window is invalid");
  return freeze({
    ...body,
    reviewDigest: digest("morphogenesis-agent-genesis-review-v6", body),
  });
}

export class InMemoryMorphogenesisAgentGenesisLifecycleStoreV6 implements MorphogenesisAgentGenesisLifecycleStoreV6 {
  readonly #states = new Map<
    string,
    MorphogenesisAgentGenesisLifecycleStateV6
  >();
  async load(stateKey: AgentPlatID) {
    return this.#states.get(stateKey) ?? null;
  }
  async save(input: {
    readonly state: MorphogenesisAgentGenesisLifecycleStateV6;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }) {
    const current = this.#states.get(input.state.stateKey);
    if (
      (current?.revision ?? null) !== input.expectedRevision ||
      (current?.stateDigest ?? null) !== input.expectedStateDigest
    )
      return false;
    this.#states.set(
      input.state.stateKey,
      freeze(structuredClone(input.state)),
    );
    return true;
  }
}

export class MorphogenesisAgentGenesisLifecycleRuntimeV6 {
  readonly #policy: MorphogenesisAgentGenesisLifecyclePolicyV6;
  readonly #genesisPolicy: MorphogenesisAgentGenesisPolicyV6;
  constructor(
    readonly options: {
      readonly stateKey: AgentPlatID;
      readonly policy: MorphogenesisAgentGenesisLifecyclePolicyV6;
      readonly genesisPolicy: MorphogenesisAgentGenesisPolicyV6;
      readonly sandbox: MorphogenesisAgentGenesisSandboxRuntimeV6;
      readonly reviews: MorphogenesisAgentGenesisReviewPortV6;
      readonly store: MorphogenesisAgentGenesisLifecycleStoreV6;
      readonly lifecycle?: MorphogenesisAgentLifecyclePortV1;
      readonly attestation?: MorphogenesisAgentAttestationPortV1;
      readonly retirement?: MorphogenesisAgentRetirementPortV1;
    },
  ) {
    id(options.stateKey);
    this.#policy = validatePolicy(options.policy);
    this.#genesisPolicy = validateMorphogenesisAgentGenesisPolicyV6(
      options.genesisPolicy,
    );
    if (
      this.#policy.genesisPolicyDigest !== this.#genesisPolicy.policyDigest ||
      !options.sandbox ||
      !options.reviews ||
      !options.store
    )
      fail("Agent Genesis lifecycle bindings are invalid");
  }
  async register(input: {
    readonly draft: MorphogenesisAgentGenesisDraftV6;
    readonly evaluation: MorphogenesisAgentGenesisEvaluationV6;
    readonly logicalTimeMs: number;
  }) {
    const draft = validateMorphogenesisAgentGenesisDraftV6(
      input.draft,
      this.#genesisPolicy,
    );
    const evaluation = validateMorphogenesisAgentGenesisEvaluationV6(
      input.evaluation,
      draft,
      this.#genesisPolicy,
    );
    if (
      evaluation.disposition !== "eligible" ||
      evaluation.expiresAtLogicalMs <= input.logicalTimeMs
    )
      fail("Agent Genesis registration is not eligible");
    return this.#commit(input.logicalTimeMs, (state) => {
      if (
        state.entries.some(
          ({ draft: value }) => value.draftDigest === draft.draftDigest,
        )
      )
        return state;
      return next(state, input.logicalTimeMs, {
        entries: [
          ...state.entries,
          freeze({
            schemaVersion: 6 as const,
            draft,
            evaluationDigest: evaluation.evaluationDigest,
            evaluationExpiresAtLogicalMs: evaluation.expiresAtLogicalMs,
            status: "draft" as const,
            statusRevision: 1,
            pendingSandboxOperationId: null,
            sandboxReceipt: null,
            probationReceipts: freeze([]),
            pendingMembershipOperationId: null,
            lifecycleAgent: null,
            pendingAttestationOperationId: null,
            attestation: null,
            pendingCompensationOperationId: null,
            terminalReceipt: null,
            externalAdmissionApplied: false,
            workGranted: false as const,
            actionAuthorityGranted: false as const,
            lastTransitionDigest: null,
          }),
        ],
      });
    });
  }
  async prepareSandbox(input: {
    readonly operationId: AgentPlatID;
    readonly draft: MorphogenesisAgentGenesisDraftV6;
    readonly evaluation: MorphogenesisAgentGenesisEvaluationV6;
    readonly logicalTimeMs: number;
  }) {
    id(input.operationId);
    await this.#commit(input.logicalTimeMs, (state) => {
      const entry = entryFor(state, input.draft.draftDigest);
      if (entry.sandboxReceipt) return state;
      if (
        entry.status !== "draft" ||
        (entry.pendingSandboxOperationId &&
          entry.pendingSandboxOperationId !== input.operationId)
      )
        fail("Agent Genesis sandbox operation conflicts");
      return replaceEntry(
        state,
        entry,
        { pendingSandboxOperationId: input.operationId },
        input.logicalTimeMs,
      );
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
      return replaceEntry(
        state,
        entry,
        {
          pendingSandboxOperationId: null,
          sandboxReceipt: receipt,
          status: "sandboxed",
          statusRevision: entry.statusRevision + 1,
        },
        input.logicalTimeMs,
      );
    });
    return receipt;
  }
  async observeProbation(input: {
    readonly observationId: AgentPlatID;
    readonly draftDigest: PlanningDigestV1;
    readonly outcome: MorphogenesisAgentGenesisProbationReceiptV6["outcome"];
    readonly eligibility: MorphogenesisAgentGenesisProbationEligibilityV6;
    readonly logicalTimeMs: number;
  }) {
    return this.#commit(input.logicalTimeMs, (state) => {
      const entry = entryFor(state, input.draftDigest);
      if (
        entry.status !== "probationary" ||
        !entry.sandboxReceipt ||
        entry.probationReceipts.length >=
          this.#policy.maximumProbationObservations
      )
        fail("Agent Genesis probation observation is not allowed");
      const eligibility =
        validateMorphogenesisAgentGenesisProbationEligibilityV6(
          input.eligibility,
          {
            draft: entry.draft,
            sandboxReceipt: entry.sandboxReceipt,
            logicalTimeMs: input.logicalTimeMs,
          },
        );
      if (eligibility.disposition !== "eligible")
        fail("Agent Genesis probation eligibility is restrictive");
      const receipt = probationReceipt(input, eligibility);
      const retained = entry.probationReceipts.find(
        ({ observationId }) => observationId === receipt.observationId,
      );
      if (retained) {
        if (retained.receiptDigest !== receipt.receiptDigest)
          fail("Agent Genesis probation replay diverged");
        return state;
      }
      return replaceEntry(
        state,
        entry,
        { probationReceipts: [...entry.probationReceipts, receipt] },
        input.logicalTimeMs,
      );
    });
  }
  async recommend(
    input: Omit<
      MorphogenesisAgentGenesisRecommendationV6,
      | "schemaVersion"
      | "stateDigest"
      | "stateRevision"
      | "advisoryOnly"
      | "recommendationDigest"
    >,
  ) {
    let result: MorphogenesisAgentGenesisRecommendationV6 | null = null;
    await this.#commit(input.proposedAtLogicalMs, (state) => {
      const entry = entryFor(state, input.draftDigest);
      assertAction(entry, input.action, this.#policy);
      if (
        !this.#policy.allowedActions.includes(input.action) ||
        !this.#policy.allowedReviewRoutes.includes(input.reviewRoute) ||
        entry.evaluationExpiresAtLogicalMs <= input.proposedAtLogicalMs ||
        input.expiresAtLogicalMs <= input.proposedAtLogicalMs
      )
        fail("Agent Genesis recommendation is not allowed");
      const recommendation = recommendationRecord(input, state);
      const retained = state.pendingRecommendations.find(
        ({ recommendationId }) => recommendationId === input.recommendationId,
      );
      if (retained) {
        if (
          retained.recommendationDigest !== recommendation.recommendationDigest
        )
          fail("Agent Genesis recommendation replay diverged");
        result = retained;
        return state;
      }
      if (
        state.pendingRecommendations.length >=
        this.#policy.maximumPendingRecommendations
      )
        fail("Agent Genesis recommendation capacity is exhausted");
      result = recommendation;
      return next(state, input.proposedAtLogicalMs, {
        pendingRecommendations: [
          ...state.pendingRecommendations,
          recommendation,
        ],
      });
    });
    return result!;
  }
  async reviewAndApply(input: {
    readonly recommendationId: AgentPlatID;
    readonly logicalTimeMs: number;
  }) {
    let output: MorphogenesisAgentGenesisTransitionV6 | null = null;
    await this.#commit(input.logicalTimeMs, async (state) => {
      const recommendation = state.pendingRecommendations.find(
        ({ recommendationId }) => recommendationId === input.recommendationId,
      );
      if (
        !recommendation ||
        recommendation.expiresAtLogicalMs <= input.logicalTimeMs
      )
        fail("Agent Genesis recommendation is unavailable");
      const raw = await this.options.reviews.review({
        recommendation,
        policy: this.#policy,
        logicalTimeMs: input.logicalTimeMs,
      });
      if (!raw) fail("Agent Genesis review is unavailable");
      const review = createMorphogenesisAgentGenesisReviewV6(raw);
      if (
        review.recommendationDigest !== recommendation.recommendationDigest ||
        review.route !== recommendation.reviewRoute ||
        review.expiresAtLogicalMs <= input.logicalTimeMs ||
        (this.#policy.requireIndependentReviewer &&
          review.actorId === recommendation.proposerId)
      )
        fail("Agent Genesis review binding or independence is invalid");
      const entry = entryFor(state, recommendation.draftDigest);
      const nextStatus =
        review.disposition === "approved"
          ? recommendation.action === "retire" && entry.externalAdmissionApplied
            ? "suspended"
            : statusFor(recommendation.action)
          : entry.status;
      const transition = transitionRecord(
        recommendation,
        review,
        entry.status,
        nextStatus,
        input.logicalTimeMs,
      );
      output = transition;
      const updated = replaceEntry(
        state,
        entry,
        {
          status: nextStatus,
          statusRevision:
            entry.statusRevision + (nextStatus === entry.status ? 0 : 1),
          lastTransitionDigest: transition.transitionDigest,
        },
        input.logicalTimeMs,
        {
          pendingRecommendations: state.pendingRecommendations.filter(
            ({ recommendationId }) =>
              recommendationId !== input.recommendationId,
          ),
          reviews: append(state.reviews, review, this.#policy.maximumHistory),
          transitions: append(
            state.transitions,
            transition,
            this.#policy.maximumHistory,
          ),
        },
      );
      return updated;
    });
    return output!;
  }
  async applyMembership(input: {
    readonly operationId: AgentPlatID;
    readonly draftDigest: PlanningDigestV1;
    readonly scope: MorphogenesisScopeV1;
    readonly proposalDigest: PlanningDigestV1;
    readonly logicalTimeMs: number;
    readonly signal?: AbortSignal;
  }) {
    if (!this.options.lifecycle)
      fail("Agent Genesis Membership lifecycle is unavailable");
    id(input.operationId);
    const before = await this.#load(input.logicalTimeMs);
    const prior = entryFor(before, input.draftDigest);
    const reconcile = prior.pendingMembershipOperationId === input.operationId;
    await this.#commit(input.logicalTimeMs, (state) => {
      const entry = entryFor(state, input.draftDigest);
      if (entry.lifecycleAgent) return state;
      if (
        entry.status !== "admitted" ||
        (entry.pendingMembershipOperationId &&
          entry.pendingMembershipOperationId !== input.operationId)
      )
        fail("Agent Genesis Membership application is not allowed");
      return replaceEntry(
        state,
        entry,
        { pendingMembershipOperationId: input.operationId },
        input.logicalTimeMs,
      );
    });
    const entry = entryFor(
      await this.#load(input.logicalTimeMs),
      input.draftDigest,
    );
    if (entry.lifecycleAgent) return entry.lifecycleAgent;
    const request = {
      operationId: input.operationId,
      scope: input.scope,
      proposalDigest: input.proposalDigest,
      profile: entry.draft.profile,
      logicalTimeMs: input.logicalTimeMs,
      ...(input.signal ? { signal: input.signal } : {}),
    };
    const agent = await (reconcile
      ? this.options.lifecycle.reconcileCreateAndEnroll(request)
      : this.options.lifecycle.createAndEnroll(request));
    if (
      agent.source !== "synthesized_created" ||
      agent.roleDefinitionDigest !== entry.draft.profile.roleDefinitionDigest ||
      JSON.stringify(agent.capabilityKeys) !==
        JSON.stringify(entry.draft.profile.capabilityKeys)
    )
      fail("Agent Genesis lifecycle substituted the synthesized profile");
    await this.#commit(input.logicalTimeMs, (state) => {
      const current = entryFor(state, input.draftDigest);
      if (current.lifecycleAgent) {
        if (current.lifecycleAgent.agentDigest !== agent.agentDigest)
          fail("Agent Genesis Membership replay diverged");
        return state;
      }
      if (current.pendingMembershipOperationId !== input.operationId)
        fail("Agent Genesis Membership operation was not durable");
      return replaceEntry(
        state,
        current,
        {
          pendingMembershipOperationId: null,
          lifecycleAgent: freeze(structuredClone(agent)),
        },
        input.logicalTimeMs,
      );
    });
    return agent;
  }
  async attestAdmission(input: {
    readonly operationId: AgentPlatID;
    readonly draftDigest: PlanningDigestV1;
    readonly scope: MorphogenesisScopeV1;
    readonly proposalDigest: PlanningDigestV1;
    readonly logicalTimeMs: number;
    readonly signal?: AbortSignal;
  }) {
    if (!this.options.attestation)
      fail("Agent Genesis attestation is unavailable");
    const before = await this.#load(input.logicalTimeMs);
    const prior = entryFor(before, input.draftDigest);
    const reconcile = prior.pendingAttestationOperationId === input.operationId;
    await this.#commit(input.logicalTimeMs, (state) => {
      const entry = entryFor(state, input.draftDigest);
      if (entry.attestation) return state;
      if (
        entry.status !== "admitted" ||
        !entry.lifecycleAgent ||
        (entry.pendingAttestationOperationId &&
          entry.pendingAttestationOperationId !== input.operationId)
      )
        fail("Agent Genesis attestation is not allowed");
      return replaceEntry(
        state,
        entry,
        { pendingAttestationOperationId: input.operationId },
        input.logicalTimeMs,
      );
    });
    const entry = entryFor(
      await this.#load(input.logicalTimeMs),
      input.draftDigest,
    );
    if (entry.attestation) return entry.attestation;
    const request = {
      operationId: input.operationId,
      scope: input.scope,
      proposalDigest: input.proposalDigest,
      agent: entry.lifecycleAgent!,
      profile: entry.draft.profile,
      logicalTimeMs: input.logicalTimeMs,
      ...(input.signal ? { signal: input.signal } : {}),
    };
    const receipt = await (reconcile
      ? this.options.attestation.reconcile(request)
      : this.options.attestation.attest(request));
    if (
      receipt.agentDigest !== entry.lifecycleAgent!.agentDigest ||
      receipt.profileDigest !== entry.draft.profile.profileDigest ||
      receipt.validUntilLogicalMs <= input.logicalTimeMs
    )
      fail("Agent Genesis attestation binding is invalid");
    await this.#commit(input.logicalTimeMs, (state) => {
      const current = entryFor(state, input.draftDigest);
      if (current.attestation) {
        if (current.attestation.attestationDigest !== receipt.attestationDigest)
          fail("Agent Genesis attestation replay diverged");
        return state;
      }
      return replaceEntry(
        state,
        current,
        {
          pendingAttestationOperationId: null,
          attestation: freeze(structuredClone(receipt)),
          externalAdmissionApplied: true,
        },
        input.logicalTimeMs,
      );
    });
    return receipt;
  }
  async compensateAdmission(input: {
    readonly operationId: AgentPlatID;
    readonly draftDigest: PlanningDigestV1;
    readonly scope: MorphogenesisScopeV1;
    readonly proposalDigest: PlanningDigestV1;
    readonly fence: MorphogenesisAuthorityFenceReceiptV1;
    readonly reasonCode: string;
    readonly logicalTimeMs: number;
  }) {
    if (!this.options.retirement)
      fail("Agent Genesis retirement is unavailable");
    const before = await this.#load(input.logicalTimeMs);
    const prior = entryFor(before, input.draftDigest);
    const reconcile =
      prior.pendingCompensationOperationId === input.operationId;
    await this.#commit(input.logicalTimeMs, (state) => {
      const entry = entryFor(state, input.draftDigest);
      if (entry.terminalReceipt) return state;
      const reviewedRetirement = state.transitions.some(
        (transition) =>
          transition.draftDigest === input.draftDigest &&
          transition.action === "retire" &&
          transition.nextStatus === "suspended",
      );
      if (
        !reviewedRetirement ||
        entry.status !== "suspended" ||
        !entry.lifecycleAgent ||
        !entry.externalAdmissionApplied ||
        entry.workGranted ||
        entry.actionAuthorityGranted ||
        (entry.pendingCompensationOperationId &&
          entry.pendingCompensationOperationId !== input.operationId)
      )
        fail("Agent Genesis compensation is not allowed");
      return replaceEntry(
        state,
        entry,
        { pendingCompensationOperationId: input.operationId },
        input.logicalTimeMs,
      );
    });
    const entry = entryFor(
      await this.#load(input.logicalTimeMs),
      input.draftDigest,
    );
    if (entry.terminalReceipt) return entry.terminalReceipt;
    const request = {
      operationId: input.operationId,
      scope: input.scope,
      proposalDigest: input.proposalDigest,
      agent: entry.lifecycleAgent!,
      fence: input.fence,
      reasonCode: input.reasonCode,
      logicalTimeMs: input.logicalTimeMs,
    };
    const receipt = await (reconcile
      ? this.options.retirement.reconcile(request)
      : this.options.retirement.retire(request));
    if (
      receipt.agentDigest !== entry.lifecycleAgent!.agentDigest ||
      receipt.disposition !== "retired"
    )
      fail("Agent Genesis compensation receipt is invalid");
    await this.#commit(input.logicalTimeMs, (state) => {
      const current = entryFor(state, input.draftDigest);
      if (current.terminalReceipt) {
        if (
          current.terminalReceipt.terminalReceiptDigest !==
          receipt.terminalReceiptDigest
        )
          fail("Agent Genesis compensation replay diverged");
        return state;
      }
      if (current.pendingCompensationOperationId !== input.operationId)
        fail("Agent Genesis compensation was not durable");
      return replaceEntry(
        state,
        current,
        {
          pendingCompensationOperationId: null,
          terminalReceipt: freeze(structuredClone(receipt)),
          externalAdmissionApplied: false,
          status: "retired",
          statusRevision: current.statusRevision + 1,
        },
        input.logicalTimeMs,
      );
    });
    return receipt;
  }
  async state(logicalTimeMs: number) {
    return this.#load(logicalTimeMs);
  }
  async #load(logicalTimeMs: number) {
    return (
      (await this.options.store.load(this.options.stateKey)) ??
      initial(this.options.stateKey, this.#policy, logicalTimeMs)
    );
  }
  async #commit(
    logicalTimeMs: number,
    mutate: (
      state: MorphogenesisAgentGenesisLifecycleStateV6,
    ) =>
      | MorphogenesisAgentGenesisLifecycleStateV6
      | Promise<MorphogenesisAgentGenesisLifecycleStateV6>,
  ) {
    for (
      let attempt = 0;
      attempt < this.#policy.maximumCommitAttempts;
      attempt += 1
    ) {
      const retained = await this.options.store.load(this.options.stateKey);
      const current =
        retained ?? initial(this.options.stateKey, this.#policy, logicalTimeMs);
      if (logicalTimeMs < current.logicalTimeHighWaterMs)
        fail("Agent Genesis time rolled back");
      const proposed = await mutate(current);
      if (proposed === current) return current;
      if (
        await this.options.store.save({
          state: proposed,
          expectedRevision: retained?.revision ?? null,
          expectedStateDigest: retained?.stateDigest ?? null,
        })
      )
        return proposed;
    }
    fail("Agent Genesis lifecycle CAS retries exhausted");
  }
}

export function validateMorphogenesisAgentGenesisLifecyclePolicyV6(
  value: MorphogenesisAgentGenesisLifecyclePolicyV6,
) {
  return validatePolicy(value);
}
export function validateMorphogenesisAgentGenesisRecommendationV6(
  value: MorphogenesisAgentGenesisRecommendationV6,
) {
  const normalized = recommendationRecord(
    {
      recommendationId: value.recommendationId,
      action: value.action,
      draftDigest: value.draftDigest,
      proposerId: value.proposerId,
      proposerImplementationDigest: value.proposerImplementationDigest,
      reviewRoute: value.reviewRoute,
      evidenceDigests: value.evidenceDigests,
      proposedAtLogicalMs: value.proposedAtLogicalMs,
      expiresAtLogicalMs: value.expiresAtLogicalMs,
    },
    {
      stateDigest: value.stateDigest,
      revision: value.stateRevision,
    } as MorphogenesisAgentGenesisLifecycleStateV6,
  );
  if (
    normalized.recommendationDigest !== value.recommendationDigest ||
    value.advisoryOnly !== true
  )
    fail("Agent Genesis recommendation is invalid");
  return normalized;
}

export function validateMorphogenesisAgentGenesisLifecycleStateV6(
  value: MorphogenesisAgentGenesisLifecycleStateV6,
  input: {
    readonly policy: MorphogenesisAgentGenesisLifecyclePolicyV6;
    readonly genesisPolicy: MorphogenesisAgentGenesisPolicyV6;
  },
) {
  const policy = validatePolicy(input.policy);
  const genesisPolicy = validateMorphogenesisAgentGenesisPolicyV6(
    input.genesisPolicy,
  );
  if (
    policy.genesisPolicyDigest !== genesisPolicy.policyDigest ||
    value.schemaVersion !== 6 ||
    value.policyDigest !== policy.policyDigest
  )
    fail("Agent Genesis lifecycle state policy is invalid");
  const entries = value.entries.map((entry) =>
    validateEntry(entry, genesisPolicy),
  );
  if (
    new Set(entries.map(({ draft }) => draft.draftDigest)).size !==
    entries.length
  )
    fail("Agent Genesis lifecycle entries are duplicated");
  const pendingRecommendations = value.pendingRecommendations.map(
    (recommendation) => {
      const normalized = recommendationRecord(
        {
          recommendationId: recommendation.recommendationId,
          action: recommendation.action,
          draftDigest: recommendation.draftDigest,
          proposerId: recommendation.proposerId,
          proposerImplementationDigest:
            recommendation.proposerImplementationDigest,
          reviewRoute: recommendation.reviewRoute,
          evidenceDigests: recommendation.evidenceDigests,
          proposedAtLogicalMs: recommendation.proposedAtLogicalMs,
          expiresAtLogicalMs: recommendation.expiresAtLogicalMs,
        },
        {
          stateDigest: recommendation.stateDigest,
          revision: recommendation.stateRevision,
        } as MorphogenesisAgentGenesisLifecycleStateV6,
      );
      if (
        normalized.recommendationDigest !==
          recommendation.recommendationDigest ||
        recommendation.advisoryOnly !== true
      )
        fail("Agent Genesis recommendation state is invalid");
      return normalized;
    },
  );
  const reviews = value.reviews.map((review) => {
    const { schemaVersion: _s, reviewDigest, ...body } = review;
    const normalized = createMorphogenesisAgentGenesisReviewV6(body);
    if (normalized.reviewDigest !== reviewDigest)
      fail("Agent Genesis review state is invalid");
    return normalized;
  });
  const transitions = value.transitions.map((transition) => {
    const { transitionDigest, ...body } = transition;
    if (
      transition.schemaVersion !== 6 ||
      transitionDigest !==
        digest("morphogenesis-agent-genesis-transition-v6", body)
    )
      fail("Agent Genesis transition state is invalid");
    one(transition.action, ACTIONS, "Agent Genesis action");
    one(transition.priorStatus, STATUSES, "Agent Genesis prior status");
    one(transition.nextStatus, STATUSES, "Agent Genesis next status");
    return freeze(structuredClone(transition));
  });
  const rebuilt = stateRecord({
    stateKey: id(value.stateKey),
    policyDigest: value.policyDigest,
    entries,
    pendingRecommendations,
    reviews,
    transitions,
    revision: nonNegative(value.revision),
    logicalTimeHighWaterMs: nonNegative(value.logicalTimeHighWaterMs),
    predecessorStateDigest:
      value.predecessorStateDigest === null
        ? null
        : sha(value.predecessorStateDigest),
  });
  if (rebuilt.stateDigest !== value.stateDigest)
    fail("Agent Genesis lifecycle state digest is invalid");
  return rebuilt;
}

function validateEntry(
  value: MorphogenesisAgentGenesisEntryV6,
  policy: MorphogenesisAgentGenesisPolicyV6,
) {
  const draft = validateMorphogenesisAgentGenesisDraftV6(value.draft, policy);
  const sandboxReceipt =
    value.sandboxReceipt === null
      ? null
      : (() => {
          const { receiptDigest, ...body } = value.sandboxReceipt!;
          if (
            receiptDigest !==
              digest("morphogenesis-agent-genesis-sandbox-receipt-v6", body) ||
            value.sandboxReceipt!.draftDigest !== draft.draftDigest ||
            value.sandboxReceipt!.profileDigest !==
              draft.profile.profileDigest ||
            value.sandboxReceipt!.membershipGranted !== false ||
            value.sandboxReceipt!.workGranted !== false ||
            value.sandboxReceipt!.actionAuthorityGranted !== false
          )
            fail("Agent Genesis sandbox state is invalid");
          return freeze(structuredClone(value.sandboxReceipt!));
        })();
  const probationReceipts = value.probationReceipts.map((receipt) => {
    const { receiptDigest, ...body } = receipt;
    if (
      receiptDigest !==
        digest("morphogenesis-agent-genesis-probation-receipt-v6", body) ||
      receipt.draftDigest !== draft.draftDigest ||
      receipt.sandboxReceiptDigest !== sandboxReceipt?.receiptDigest
    )
      fail("Agent Genesis probation state is invalid");
    return freeze(structuredClone(receipt));
  });
  if (
    new Set(probationReceipts.map(({ observationId }) => observationId))
      .size !== probationReceipts.length
  )
    fail("Agent Genesis probation observations are duplicated");
  const lifecycleAgent =
    value.lifecycleAgent === null
      ? null
      : (() => {
          const {
            schemaVersion: _s,
            agentDigest,
            ...body
          } = value.lifecycleAgent!;
          const normalized = createMorphogenesisLifecycleAgentV1(body);
          if (
            normalized.agentDigest !== agentDigest ||
            normalized.source !== "synthesized_created"
          )
            fail("Agent Genesis lifecycle agent state is invalid");
          return normalized;
        })();
  const attestation =
    value.attestation === null
      ? null
      : (() => {
          const {
            schemaVersion: _s,
            attestationDigest,
            ...body
          } = value.attestation!;
          const normalized = createMorphogenesisAgentAttestationV1(body);
          if (
            normalized.attestationDigest !== attestationDigest ||
            normalized.agentDigest !== lifecycleAgent?.agentDigest ||
            normalized.profileDigest !== draft.profile.profileDigest
          )
            fail("Agent Genesis attestation state is invalid");
          return normalized;
        })();
  const terminalReceipt =
    value.terminalReceipt === null
      ? null
      : (() => {
          const {
            schemaVersion: _s,
            terminalReceiptDigest,
            ...body
          } = value.terminalReceipt!;
          const normalized = createMorphogenesisTerminalAgentReceiptV1(body);
          if (
            normalized.terminalReceiptDigest !== terminalReceiptDigest ||
            normalized.agentDigest !== lifecycleAgent?.agentDigest
          )
            fail("Agent Genesis terminal state is invalid");
          return normalized;
        })();
  const status = one(value.status, STATUSES, "Agent Genesis status");
  if (
    (value.externalAdmissionApplied &&
      (!lifecycleAgent || !attestation || terminalReceipt)) ||
    (status === "retired" && value.externalAdmissionApplied) ||
    value.workGranted !== false ||
    value.actionAuthorityGranted !== false
  )
    fail("Agent Genesis external authority state is invalid");
  return freeze({
    ...value,
    schemaVersion: 6 as const,
    draft,
    evaluationDigest: sha(value.evaluationDigest),
    evaluationExpiresAtLogicalMs: positive(value.evaluationExpiresAtLogicalMs),
    status,
    statusRevision: positive(value.statusRevision),
    sandboxReceipt,
    probationReceipts: freeze(probationReceipts),
    lifecycleAgent,
    attestation,
    terminalReceipt,
    pendingSandboxOperationId:
      value.pendingSandboxOperationId === null
        ? null
        : id(value.pendingSandboxOperationId),
    pendingMembershipOperationId:
      value.pendingMembershipOperationId === null
        ? null
        : id(value.pendingMembershipOperationId),
    pendingAttestationOperationId:
      value.pendingAttestationOperationId === null
        ? null
        : id(value.pendingAttestationOperationId),
    pendingCompensationOperationId:
      value.pendingCompensationOperationId === null
        ? null
        : id(value.pendingCompensationOperationId),
    lastTransitionDigest:
      value.lastTransitionDigest === null
        ? null
        : sha(value.lastTransitionDigest),
  });
}

function initial(
  stateKey: AgentPlatID,
  policy: MorphogenesisAgentGenesisLifecyclePolicyV6,
  logicalTimeMs: number,
) {
  return stateRecord({
    stateKey,
    policyDigest: policy.policyDigest,
    entries: [],
    pendingRecommendations: [],
    reviews: [],
    transitions: [],
    revision: 0,
    logicalTimeHighWaterMs: logicalTimeMs,
    predecessorStateDigest: null,
  });
}
function stateRecord(
  input: Omit<
    MorphogenesisAgentGenesisLifecycleStateV6,
    "schemaVersion" | "stateDigest"
  >,
) {
  const body = freeze({ schemaVersion: 6 as const, ...input });
  return freeze({
    ...body,
    stateDigest: digest("morphogenesis-agent-genesis-lifecycle-state-v6", body),
  });
}
function next(
  state: MorphogenesisAgentGenesisLifecycleStateV6,
  logicalTimeMs: number,
  changes: Partial<
    Pick<
      MorphogenesisAgentGenesisLifecycleStateV6,
      "entries" | "pendingRecommendations" | "reviews" | "transitions"
    >
  >,
) {
  return stateRecord({
    stateKey: state.stateKey,
    policyDigest: state.policyDigest,
    entries: changes.entries ?? state.entries,
    pendingRecommendations:
      changes.pendingRecommendations ?? state.pendingRecommendations,
    reviews: changes.reviews ?? state.reviews,
    transitions: changes.transitions ?? state.transitions,
    revision: state.revision + 1,
    logicalTimeHighWaterMs: logicalTimeMs,
    predecessorStateDigest: state.stateDigest,
  });
}
function replaceEntry(
  state: MorphogenesisAgentGenesisLifecycleStateV6,
  entry: MorphogenesisAgentGenesisEntryV6,
  changes: Partial<MorphogenesisAgentGenesisEntryV6>,
  logicalTimeMs: number,
  stateChanges: Partial<
    Pick<
      MorphogenesisAgentGenesisLifecycleStateV6,
      "pendingRecommendations" | "reviews" | "transitions"
    >
  > = {},
) {
  return next(state, logicalTimeMs, {
    ...stateChanges,
    entries: state.entries.map((value) =>
      value.draft.draftDigest === entry.draft.draftDigest
        ? freeze({ ...value, ...changes })
        : value,
    ),
  });
}
function entryFor(
  state: MorphogenesisAgentGenesisLifecycleStateV6,
  draftDigest: PlanningDigestV1,
) {
  const entry = state.entries.find(
    ({ draft }) => draft.draftDigest === draftDigest,
  );
  if (!entry) fail("Agent Genesis draft is not registered");
  return entry;
}
function probationReceipt(
  input: {
    readonly observationId: AgentPlatID;
    readonly draftDigest: PlanningDigestV1;
    readonly outcome: MorphogenesisAgentGenesisProbationReceiptV6["outcome"];
    readonly eligibility: MorphogenesisAgentGenesisProbationEligibilityV6;
    readonly logicalTimeMs: number;
  },
  eligibility: MorphogenesisAgentGenesisProbationEligibilityV6,
) {
  const body = freeze({
    schemaVersion: 6 as const,
    observationId: id(input.observationId),
    draftDigest: sha(input.draftDigest),
    sandboxReceiptDigest: eligibility.sandboxReceiptDigest,
    outcome: one(input.outcome, OUTCOMES, "Agent Genesis probation outcome"),
    capabilityEvidenceDigests: eligibility.capabilityEvidenceDigests,
    trustDecisionDigest: eligibility.trustAssessmentDigest,
    inferenceControlDecisionDigest:
      eligibility.inferenceControlAssessmentDigest,
    observedAtLogicalMs: nonNegative(input.logicalTimeMs),
  });
  return freeze({
    ...body,
    receiptDigest: digest(
      "morphogenesis-agent-genesis-probation-receipt-v6",
      body,
    ),
  });
}
function recommendationRecord(
  input: Omit<
    MorphogenesisAgentGenesisRecommendationV6,
    | "schemaVersion"
    | "stateDigest"
    | "stateRevision"
    | "advisoryOnly"
    | "recommendationDigest"
  >,
  state: MorphogenesisAgentGenesisLifecycleStateV6,
) {
  const body = freeze({
    schemaVersion: 6 as const,
    recommendationId: id(input.recommendationId),
    action: one(input.action, ACTIONS, "Agent Genesis action"),
    draftDigest: sha(input.draftDigest),
    stateDigest: state.stateDigest,
    stateRevision: state.revision,
    proposerId: id(input.proposerId),
    proposerImplementationDigest: sha(input.proposerImplementationDigest),
    reviewRoute: one(input.reviewRoute, ROUTES, "Agent Genesis review route"),
    evidenceDigests: shas(input.evidenceDigests, 1, 128),
    proposedAtLogicalMs: nonNegative(input.proposedAtLogicalMs),
    expiresAtLogicalMs: positive(input.expiresAtLogicalMs),
    advisoryOnly: true as const,
  });
  return freeze({
    ...body,
    recommendationDigest: digest(
      "morphogenesis-agent-genesis-recommendation-v6",
      body,
    ),
  });
}
function transitionRecord(
  recommendation: MorphogenesisAgentGenesisRecommendationV6,
  review: MorphogenesisAgentGenesisReviewV6,
  priorStatus: MorphogenesisAgentGenesisStatusV6,
  nextStatus: MorphogenesisAgentGenesisStatusV6,
  appliedAtLogicalMs: number,
) {
  const body = freeze({
    schemaVersion: 6 as const,
    recommendationDigest: recommendation.recommendationDigest,
    reviewDigest: review.reviewDigest,
    draftDigest: recommendation.draftDigest,
    action: recommendation.action,
    priorStatus,
    nextStatus,
    appliedAtLogicalMs,
  });
  return freeze({
    ...body,
    transitionDigest: digest("morphogenesis-agent-genesis-transition-v6", body),
  });
}
function assertAction(
  entry: MorphogenesisAgentGenesisEntryV6,
  action: MorphogenesisAgentGenesisActionV6,
  policy: MorphogenesisAgentGenesisLifecyclePolicyV6,
) {
  const success = entry.probationReceipts.filter(
    ({ outcome }) => outcome === "success",
  ).length;
  const unsafe = entry.probationReceipts.filter(
    ({ outcome }) => outcome === "unsafe",
  ).length;
  const allowed =
    action === "start_probation"
      ? entry.status === "sandboxed"
      : action === "admit"
        ? entry.status === "probationary" &&
          entry.probationReceipts.length >=
            policy.minimumProbationObservations &&
          success >= policy.minimumProbationSuccesses &&
          unsafe <= policy.maximumUnsafeObservations
        : action === "suspend"
          ? ["probationary", "admitted"].includes(entry.status)
          : action === "resume"
            ? entry.status === "suspended"
            : action === "retire"
              ? entry.status !== "retired"
              : entry.status === "admitted" && !entry.externalAdmissionApplied;
  if (!allowed) fail("Agent Genesis lifecycle transition is not allowed");
}
function statusFor(
  action: MorphogenesisAgentGenesisActionV6,
): MorphogenesisAgentGenesisStatusV6 {
  return action === "start_probation" ||
    action === "resume" ||
    action === "rollback"
    ? "probationary"
    : action === "admit"
      ? "admitted"
      : action === "suspend"
        ? "suspended"
        : "retired";
}
function append<T>(items: readonly T[], item: T, maximum: number) {
  return freeze([...items, item].slice(-maximum));
}
function validatePolicy(value: MorphogenesisAgentGenesisLifecyclePolicyV6) {
  const { policyDigest, ...body } = value;
  const rebuilt = createMorphogenesisAgentGenesisLifecyclePolicyV6(body);
  if (rebuilt.policyDigest !== policyDigest)
    fail("Agent Genesis lifecycle policy is invalid");
  return rebuilt;
}
const ACTIONS = new Set<MorphogenesisAgentGenesisActionV6>([
  "start_probation",
  "admit",
  "suspend",
  "resume",
  "retire",
  "rollback",
]);
const ROUTES = new Set<MorphogenesisStrategyReviewRouteV3>([
  "authorized_agent",
  "authorized_person",
  "collective",
]);
const OUTCOMES = new Set<
  MorphogenesisAgentGenesisProbationReceiptV6["outcome"]
>(["success", "failure", "unsafe", "indeterminate"]);
const STATUSES = new Set<MorphogenesisAgentGenesisStatusV6>([
  "draft",
  "sandboxed",
  "probationary",
  "admitted",
  "suspended",
  "retired",
]);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u;
const SHA = /^sha256:[0-9a-f]{64}$/u;
function id(value: unknown): AgentPlatID {
  if (typeof value !== "string" || !ID.test(value))
    fail("Agent Genesis lifecycle ID is invalid");
  return value as AgentPlatID;
}
function sha(value: unknown): PlanningDigestV1 {
  if (typeof value !== "string" || !SHA.test(value))
    fail("Agent Genesis lifecycle digest is invalid");
  return value as PlanningDigestV1;
}
function positive(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    fail("Agent Genesis lifecycle positive integer is invalid");
  return value as number;
}
function nonNegative(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    fail("Agent Genesis lifecycle non-negative integer is invalid");
  return value as number;
}
function bool(value: unknown) {
  if (typeof value !== "boolean")
    fail("Agent Genesis lifecycle boolean is invalid");
  return value;
}
function one<T extends string>(
  value: unknown,
  values: ReadonlySet<T>,
  label: string,
): T {
  if (typeof value !== "string" || !values.has(value as T))
    fail(`${label} is invalid`);
  return value as T;
}
function enums<T extends string>(
  values: readonly unknown[],
  allowed: ReadonlySet<T>,
  label: string,
) {
  if (!Array.isArray(values)) fail(`${label} are invalid`);
  const result = [
    ...new Set(values.map((value) => one(value, allowed, label))),
  ].sort();
  if (!result.length || result.length !== values.length)
    fail(`${label} are invalid`);
  return freeze(result);
}
function shas(values: readonly unknown[], minimum: number, maximum: number) {
  const result = [...new Set(values.map(sha))].sort();
  if (
    result.length < minimum ||
    result.length > maximum ||
    result.length !== values.length
  )
    fail("Agent Genesis lifecycle digests are invalid");
  return freeze(result);
}
function digest(domain: string, value: unknown): PlanningDigestV1 {
  return digestPlanningJsonV1(domain as never, value as PlanningJson);
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>))
      freeze(item);
  }
  return value;
}
function fail(message: string): never {
  throw new TypeError(message);
}
