import type { JsonValue } from "@agentplat/core";
import {
  canonicalizePlanningJsonV1,
  type PlanningDigestV1,
} from "@agentplat/collective-planning";

export const COLLECTIVE_INVARIANT_STATE_FORMAT_V1 =
  "application/vnd.agentplat.collective-invariant-state.v1+json" as const;

export type CollectiveInvariantKindV1 =
  | "effect_authority"
  | "finality_uniqueness"
  | "budget_conservation"
  | "lineage_attenuation"
  | "monotonic_coordinates";

export interface EffectAuthorityClaimV1 {
  readonly kind: "effect_authority";
  readonly effectId: string;
  readonly actionDigest: PlanningDigestV1;
  readonly authorizationDigest: PlanningDigestV1 | null;
  readonly finalityDigest: PlanningDigestV1 | null;
  readonly semanticDecisionDigest: PlanningDigestV1 | null;
  readonly semanticDisposition:
    "continue" | "shorten_horizon" | "replan" | "safe_stop" | null;
  /** Digest of the exact effect, scope, epoch and three authority inputs. */
  readonly effectBindingDigest: PlanningDigestV1;
}

export interface FinalityUniquenessClaimV1 {
  readonly kind: "finality_uniqueness";
  readonly coordinateId: string;
  readonly decisionDigest: PlanningDigestV1;
  readonly certificateDigest: PlanningDigestV1;
}

export interface BudgetConservationClaimV1 {
  readonly kind: "budget_conservation";
  readonly budgetId: string;
  readonly previousOperationDigest: PlanningDigestV1 | null;
  readonly maximumUnits: number;
  readonly expectedRemainingUnits: number;
  readonly debitUnits: number;
  readonly creditUnits: number;
  readonly nextRemainingUnits: number;
  readonly operationDigest: PlanningDigestV1;
}

export interface LineageAttenuationClaimV1 {
  readonly kind: "lineage_attenuation";
  readonly parentId: string;
  readonly childId: string;
  readonly parentAuthorityDigests: readonly PlanningDigestV1[];
  readonly childAuthorityDigests: readonly PlanningDigestV1[];
  readonly parentBudgetUnits: number;
  readonly childBudgetUnits: number;
  readonly parentLineageDigest: PlanningDigestV1;
  readonly childLineageDigest: PlanningDigestV1;
}

export interface MonotonicCoordinatesClaimV1 {
  readonly kind: "monotonic_coordinates";
  readonly coordinateId: string;
  readonly previousEpoch: number | null;
  readonly previousFence: number | null;
  readonly previousCheckpoint: number | null;
  readonly nextEpoch: number;
  readonly nextFence: number;
  readonly nextCheckpoint: number;
  readonly transitionDigest: PlanningDigestV1;
}

export type CollectiveInvariantClaimV1 =
  | EffectAuthorityClaimV1
  | FinalityUniquenessClaimV1
  | BudgetConservationClaimV1
  | LineageAttenuationClaimV1
  | MonotonicCoordinatesClaimV1;

/** Content-free evidence presented to the local invariant guard. */
export interface CollectiveInvariantObservationV1 {
  readonly schemaVersion: 1;
  readonly observationId: string;
  readonly scopeId: string;
  readonly membershipEpoch: number;
  readonly claim: CollectiveInvariantClaimV1;
  readonly evidenceDigests: readonly PlanningDigestV1[];
  readonly observedAtLogicalMs: number;
  readonly validUntilLogicalMs: number;
  readonly observationDigest: PlanningDigestV1;
}

export interface CollectiveInvariantReceiptV1 {
  readonly schemaVersion: 1;
  readonly receiptId: string;
  readonly observationId: string;
  readonly observationDigest: PlanningDigestV1;
  readonly scopeId: string;
  readonly membershipEpoch: number;
  readonly invariant: CollectiveInvariantKindV1;
  readonly disposition: "allow" | "deny";
  readonly reasonCodes: readonly string[];
  readonly evidenceDigests: readonly PlanningDigestV1[];
  readonly evaluatedAtLogicalMs: number;
  readonly stateRevision: number;
  readonly receiptDigest: PlanningDigestV1;
}

export interface CollectiveInvariantFinalityHeadV1 {
  readonly coordinateId: string;
  readonly membershipEpoch: number;
  readonly decisionDigest: PlanningDigestV1;
  readonly certificateDigest: PlanningDigestV1;
}

export interface CollectiveInvariantEffectHeadV1 {
  readonly effectId: string;
  readonly admittedAtMembershipEpoch: number;
  readonly actionDigest: PlanningDigestV1;
  readonly effectBindingDigest: PlanningDigestV1;
  readonly observationDigest: PlanningDigestV1;
  readonly receiptDigest: PlanningDigestV1 | null;
}

export interface CollectiveInvariantBudgetHeadV1 {
  readonly budgetId: string;
  readonly maximumUnits: number;
  readonly remainingUnits: number;
  readonly operationDigest: PlanningDigestV1;
}

export interface CollectiveInvariantCoordinateHeadV1 {
  readonly coordinateId: string;
  readonly epoch: number;
  readonly fence: number;
  readonly checkpoint: number;
  readonly transitionDigest: PlanningDigestV1;
}

export interface CollectiveInvariantLineageHeadV1 {
  readonly childId: string;
  readonly parentId: string;
  readonly parentLineageDigest: PlanningDigestV1;
  readonly childLineageDigest: PlanningDigestV1;
  readonly authorityDigests: readonly PlanningDigestV1[];
  readonly budgetUnits: number;
}

export interface CollectiveInvariantStateV1 {
  readonly format: typeof COLLECTIVE_INVARIANT_STATE_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly stateKey: string;
  readonly scopeId: string;
  readonly policyDigest: PlanningDigestV1;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly effectHeads: readonly CollectiveInvariantEffectHeadV1[];
  readonly finalityHeads: readonly CollectiveInvariantFinalityHeadV1[];
  readonly budgetHeads: readonly CollectiveInvariantBudgetHeadV1[];
  readonly coordinateHeads: readonly CollectiveInvariantCoordinateHeadV1[];
  readonly lineageHeads: readonly CollectiveInvariantLineageHeadV1[];
  readonly budgetOperationDigests: readonly PlanningDigestV1[];
  readonly receipts: readonly CollectiveInvariantReceiptV1[];
  readonly predecessorStateDigest: PlanningDigestV1 | null;
  readonly stateDigest: PlanningDigestV1;
}

export interface CollectiveInvariantAnchorV1 {
  readonly revision: number;
  readonly stateDigest: PlanningDigestV1;
  readonly logicalTimeHighWaterMs: number;
}

export interface CollectiveInvariantSnapshotV1 {
  readonly state: CollectiveInvariantStateV1;
  readonly anchor: CollectiveInvariantAnchorV1;
}

/**
 * The production implementation must commit the replaceable snapshot and its
 * independently protected monotonic witness atomically.
 */
export interface CollectiveInvariantStoreV1 {
  loadState(stateKey: string): Promise<CollectiveInvariantStateV1 | null>;
  loadAnchor(anchorKey: string): Promise<CollectiveInvariantAnchorV1 | null>;
  commit(input: {
    readonly state: CollectiveInvariantStateV1;
    readonly anchorKey: string;
    readonly anchor: CollectiveInvariantAnchorV1;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }): Promise<boolean>;
}

export interface CollectiveInvariantDigestPortV1 {
  digest(canonicalMaterial: string): Promise<PlanningDigestV1>;
}

/**
 * Application-owned authentication boundary. It must resolve the opaque
 * evidence digests and verify issuer, scope, membership epoch and freshness.
 */
export interface CollectiveInvariantEvidenceVerificationPortV1 {
  verify(input: {
    readonly observation: CollectiveInvariantObservationV1;
    readonly logicalTimeMs: number;
  }): Promise<
    | {
        readonly verified: true;
        /** Explicit attestation of the entire composite observation. */
        readonly verifiedObservationDigest: PlanningDigestV1;
        /** Exact claim-specific certificate, operation or transition binding. */
        readonly verifiedClaimBindingDigest: PlanningDigestV1;
      }
    | { readonly verified: false; readonly reasonCode: string }
  >;
}

export interface CollectiveInvariantPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  readonly maximumObservationAgeMs: number;
  readonly maximumFutureSkewMs: number;
  readonly maximumReceipts: number;
  readonly maximumHeadsPerKind: number;
  readonly maximumCommitAttempts: number;
  /** Locally installed genesis authorities; remote observations cannot add roots. */
  readonly lineageRoots: readonly {
    readonly rootId: string;
    readonly lineageDigest: PlanningDigestV1;
    readonly authorityDigests: readonly PlanningDigestV1[];
    readonly budgetUnits: number;
  }[];
  readonly admissibleSemanticDispositions: readonly (
    "continue" | "shorten_horizon"
  )[];
}

export interface CollectiveInvariantEffectSinkV1<T> {
  /** Must deduplicate by `effectId` and bind the effect to `receiptDigest`. */
  commit(input: {
    readonly effectId: string;
    readonly actionDigest: PlanningDigestV1;
    readonly receiptDigest: PlanningDigestV1;
  }): Promise<T>;
}

export class CollectiveInvariantViolationError extends Error {
  override readonly name = "CollectiveInvariantViolationError";
}

export class WebCryptoCollectiveInvariantDigestPortV1 implements CollectiveInvariantDigestPortV1 {
  readonly #crypto: Crypto;

  constructor(crypto: Crypto = globalThis.crypto) {
    if (!crypto?.subtle) throw new TypeError("WebCrypto is required");
    this.#crypto = crypto;
  }

  async digest(material: string): Promise<PlanningDigestV1> {
    const bytes = await this.#crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(material),
    );
    return `sha256:${Array.from(new Uint8Array(bytes), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("")}`;
  }
}

/** In-memory reference only; its anchor is not independently protected. */
export class InMemoryCollectiveInvariantStoreV1 implements CollectiveInvariantStoreV1 {
  readonly #states = new Map<string, CollectiveInvariantStateV1>();
  readonly #anchors = new Map<string, CollectiveInvariantAnchorV1>();

  async loadState(
    stateKey: string,
  ): Promise<CollectiveInvariantStateV1 | null> {
    const state = this.#states.get(stateKey);
    return state ? structuredClone(state) : null;
  }

  async loadAnchor(
    anchorKey: string,
  ): Promise<CollectiveInvariantAnchorV1 | null> {
    const anchor = this.#anchors.get(anchorKey);
    return anchor ? structuredClone(anchor) : null;
  }

  async commit(input: {
    readonly state: CollectiveInvariantStateV1;
    readonly anchorKey: string;
    readonly anchor: CollectiveInvariantAnchorV1;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }): Promise<boolean> {
    const current = this.#states.get(input.state.stateKey) ?? null;
    const anchor = this.#anchors.get(input.anchorKey) ?? null;
    if (
      (current?.revision ?? null) !== input.expectedRevision ||
      (current?.stateDigest ?? null) !== input.expectedStateDigest ||
      (anchor?.revision ?? null) !== input.expectedRevision ||
      (anchor?.stateDigest ?? null) !== input.expectedStateDigest
    )
      return false;
    if (
      input.anchor.revision !== input.state.revision ||
      input.anchor.stateDigest !== input.state.stateDigest ||
      input.anchor.logicalTimeHighWaterMs !==
        input.state.logicalTimeHighWaterMs ||
      (current !== null &&
        (input.state.revision !== current.revision + 1 ||
          input.state.predecessorStateDigest !== current.stateDigest ||
          input.state.logicalTimeHighWaterMs < current.logicalTimeHighWaterMs))
    )
      throw new CollectiveInvariantViolationError(
        "invariant store transition is invalid",
      );
    this.#states.set(input.state.stateKey, structuredClone(input.state));
    this.#anchors.set(input.anchorKey, structuredClone(input.anchor));
    return true;
  }
}

export async function createCollectiveInvariantObservationV1(
  input: Omit<CollectiveInvariantObservationV1, "observationDigest">,
  digests: CollectiveInvariantDigestPortV1 = new WebCryptoCollectiveInvariantDigestPortV1(),
): Promise<CollectiveInvariantObservationV1> {
  validateObservationBody(input);
  const observationDigest = await domainDigest(digests, "observation", input);
  return deepFreeze({ ...input, observationDigest });
}

export async function createCollectiveInvariantPolicyV1(
  input: Omit<CollectiveInvariantPolicyV1, "policyDigest">,
  digests: CollectiveInvariantDigestPortV1 = new WebCryptoCollectiveInvariantDigestPortV1(),
): Promise<CollectiveInvariantPolicyV1> {
  const policy = {
    ...input,
    policyDigest: await domainDigest(digests, "policy", input),
  } satisfies CollectiveInvariantPolicyV1;
  validatePolicy(policy);
  return deepFreeze(structuredClone(policy));
}

export async function collectiveEffectAuthorityBindingDigestV1(
  input: {
    readonly scopeId: string;
    readonly membershipEpoch: number;
    readonly effectId: string;
    readonly actionDigest: PlanningDigestV1;
    readonly authorizationDigest: PlanningDigestV1;
    readonly finalityDigest: PlanningDigestV1;
    readonly semanticDecisionDigest: PlanningDigestV1;
    readonly semanticDisposition: "continue" | "shorten_horizon";
  },
  digests: CollectiveInvariantDigestPortV1 = new WebCryptoCollectiveInvariantDigestPortV1(),
): Promise<PlanningDigestV1> {
  identifier(input?.scopeId, "effect scopeId");
  positiveInteger(input?.membershipEpoch, "effect membershipEpoch");
  identifier(input?.effectId, "effectId");
  digest(input?.actionDigest, "actionDigest");
  digest(input?.authorizationDigest, "authorizationDigest");
  digest(input?.finalityDigest, "finalityDigest");
  digest(input?.semanticDecisionDigest, "semanticDecisionDigest");
  return domainDigest(digests, "effect-binding", input);
}

/**
 * Stateful pre-effect guard for cross-capability safety invariants. Evidence is
 * content-free; a digest proves byte identity, not truth or authorization.
 */
export class CollectiveInvariantRuntimeV1 {
  readonly #stateKey: string;
  readonly #anchorKey: string;
  readonly #scopeId: string;
  readonly #policy: CollectiveInvariantPolicyV1;
  readonly #store: CollectiveInvariantStoreV1;
  readonly #digests: CollectiveInvariantDigestPortV1;
  readonly #verification: CollectiveInvariantEvidenceVerificationPortV1;

  static async create(input: {
    readonly stateKey: string;
    readonly anchorKey: string;
    readonly scopeId: string;
    readonly policy: CollectiveInvariantPolicyV1;
    readonly store: CollectiveInvariantStoreV1;
    readonly verification: CollectiveInvariantEvidenceVerificationPortV1;
    readonly digests?: CollectiveInvariantDigestPortV1;
  }): Promise<CollectiveInvariantRuntimeV1> {
    const digests =
      input?.digests ?? new WebCryptoCollectiveInvariantDigestPortV1();
    validatePolicy(input?.policy);
    const { policyDigest, ...policyBody } = input.policy;
    const expectedPolicyDigest = await domainDigest(
      digests,
      "policy",
      policyBody,
    );
    if (policyDigest !== expectedPolicyDigest)
      throw new CollectiveInvariantViolationError(
        "invariant policy digest mismatch",
      );
    return new CollectiveInvariantRuntimeV1(input, digests);
  }

  private constructor(
    input: {
      readonly stateKey: string;
      readonly anchorKey: string;
      readonly scopeId: string;
      readonly policy: CollectiveInvariantPolicyV1;
      readonly store: CollectiveInvariantStoreV1;
      readonly verification: CollectiveInvariantEvidenceVerificationPortV1;
      readonly digests?: CollectiveInvariantDigestPortV1;
    },
    digests: CollectiveInvariantDigestPortV1,
  ) {
    identifier(input?.stateKey, "stateKey");
    identifier(input?.anchorKey, "anchorKey");
    identifier(input?.scopeId, "scopeId");
    validatePolicy(input?.policy);
    if (!input?.store) throw new TypeError("invariant store is required");
    if (!input?.verification || typeof input.verification.verify !== "function")
      throw new TypeError("invariant evidence verification is required");
    this.#stateKey = input.stateKey;
    this.#anchorKey = input.anchorKey;
    this.#scopeId = input.scopeId;
    this.#policy = deepFreeze(structuredClone(input.policy));
    this.#store = input.store;
    this.#verification = input.verification;
    this.#digests = digests;
  }

  async evaluate(input: {
    readonly observation: CollectiveInvariantObservationV1;
    readonly logicalTimeMs: number;
  }): Promise<CollectiveInvariantReceiptV1> {
    const observation = await this.#validateObservation(input?.observation);
    safeInteger(input?.logicalTimeMs, "logicalTimeMs");
    const forcedReasons: string[] = [];
    if (observation.scopeId !== this.#scopeId)
      forcedReasons.push("scope_mismatch");
    if (
      input.logicalTimeMs <
      observation.observedAtLogicalMs - this.#policy.maximumFutureSkewMs
    )
      forcedReasons.push("observation_from_future");
    if (
      input.logicalTimeMs >= observation.validUntilLogicalMs ||
      input.logicalTimeMs - observation.observedAtLogicalMs >
        this.#policy.maximumObservationAgeMs
    )
      forcedReasons.push("observation_expired");
    try {
      const verification = await this.#verification.verify({
        observation,
        logicalTimeMs: input.logicalTimeMs,
      });
      if (!verification.verified) {
        identifier(verification.reasonCode, "verification reasonCode");
        forcedReasons.push(verification.reasonCode);
      } else if (
        verification.verifiedObservationDigest !==
          observation.observationDigest ||
        verification.verifiedClaimBindingDigest !==
          claimBindingDigest(observation.claim)
      ) {
        forcedReasons.push("evidence_verification_binding_mismatch");
      }
    } catch {
      forcedReasons.push("evidence_verification_unavailable");
    }
    return this.#commitDecision(
      observation,
      input.logicalTimeMs,
      forcedReasons.length > 0 ? forcedReasons : null,
    );
  }

  async guardEffect<T>(input: {
    readonly observation: CollectiveInvariantObservationV1 & {
      readonly claim: EffectAuthorityClaimV1;
    };
    readonly logicalTimeMs: number;
    readonly sink: CollectiveInvariantEffectSinkV1<T>;
  }): Promise<{
    readonly receipt: CollectiveInvariantReceiptV1;
    readonly effect: T | null;
  }> {
    if (!input?.sink || typeof input.sink.commit !== "function")
      throw new TypeError("effect sink is required");
    const receipt = await this.evaluate({
      observation: input.observation,
      logicalTimeMs: input.logicalTimeMs,
    });
    if (receipt.disposition === "deny") return { receipt, effect: null };
    const effect = await input.sink.commit({
      effectId: input.observation.claim.effectId,
      actionDigest: input.observation.claim.actionDigest,
      receiptDigest: receipt.receiptDigest,
    });
    return { receipt, effect };
  }

  async snapshot(): Promise<CollectiveInvariantSnapshotV1 | null> {
    const snapshot = await this.#loadSnapshot();
    if (!snapshot) return null;
    return deepFreeze(structuredClone(snapshot));
  }

  async #validateObservation(
    observation: CollectiveInvariantObservationV1,
  ): Promise<CollectiveInvariantObservationV1> {
    validateObservationBody(observation);
    digest(observation?.observationDigest, "observationDigest");
    const expected = await domainDigest(this.#digests, "observation", {
      schemaVersion: observation.schemaVersion,
      observationId: observation.observationId,
      scopeId: observation.scopeId,
      membershipEpoch: observation.membershipEpoch,
      claim: observation.claim,
      evidenceDigests: observation.evidenceDigests,
      observedAtLogicalMs: observation.observedAtLogicalMs,
      validUntilLogicalMs: observation.validUntilLogicalMs,
    });
    if (expected !== observation.observationDigest)
      throw new CollectiveInvariantViolationError(
        "observation digest mismatch",
      );
    return deepFreeze(structuredClone(observation));
  }

  async #commitDecision(
    observation: CollectiveInvariantObservationV1,
    logicalTimeMs: number,
    forcedReasons: readonly string[] | null,
  ): Promise<CollectiveInvariantReceiptV1> {
    for (
      let attempt = 0;
      attempt < this.#policy.maximumCommitAttempts;
      attempt += 1
    ) {
      const prior = await this.#loadSnapshot();
      const base = prior?.state ?? (await this.#initialState());
      const replayRestrictions = [
        ...(forcedReasons ?? []),
        ...(logicalTimeMs < base.logicalTimeHighWaterMs
          ? ["logical_time_rollback"]
          : []),
      ];
      const replay = prior?.state.receipts.find(
        (receipt) => receipt.observationId === observation.observationId,
      );
      if (replay) {
        if (replay.observationDigest !== observation.observationDigest)
          throw new CollectiveInvariantViolationError(
            "observation identifier was reused with different content",
          );
        if (replayRestrictions.length > 0)
          throw new CollectiveInvariantViolationError(
            "observation replay is no longer admissible",
          );
        return deepFreeze(structuredClone(replay));
      }
      const effectClaim =
        observation.claim.kind === "effect_authority"
          ? observation.claim
          : null;
      if (effectClaim) {
        const existingEffect = base.effectHeads.find(
          (head) => head.effectId === effectClaim.effectId,
        );
        if (
          replayRestrictions.length === 0 &&
          existingEffect &&
          existingEffect.actionDigest === effectClaim.actionDigest &&
          existingEffect.effectBindingDigest === effectClaim.effectBindingDigest
        ) {
          const original = base.receipts.find(
            (receipt) => receipt.receiptDigest === existingEffect.receiptDigest,
          );
          if (!original)
            throw new CollectiveInvariantViolationError(
              "effect authorization receipt is unavailable",
            );
          return deepFreeze(structuredClone(original));
        }
      }
      if (base.receipts.length >= this.#policy.maximumReceipts)
        throw new CollectiveInvariantViolationError(
          "invariant receipt capacity exhausted",
        );
      const reasons = [...replayRestrictions];
      const mutation =
        reasons.length > 0
          ? { reasons, state: base }
          : await this.#evaluateClaim(base, observation);
      const stateRevision = base.revision + 1;
      const receipt = await this.#createReceipt(
        observation,
        mutation.reasons,
        logicalTimeMs,
        stateRevision,
      );
      const mutationState =
        receipt.disposition === "allow" && effectClaim
          ? {
              ...mutation.state,
              effectHeads: mutation.state.effectHeads.map((head) =>
                head.effectId === effectClaim.effectId &&
                head.effectBindingDigest === effectClaim.effectBindingDigest
                  ? { ...head, receiptDigest: receipt.receiptDigest }
                  : head,
              ),
            }
          : mutation.state;
      const next = await this.#nextState(
        base,
        mutationState,
        receipt,
        logicalTimeMs,
      );
      const snapshot = {
        state: next,
        anchor: {
          revision: next.revision,
          stateDigest: next.stateDigest,
          logicalTimeHighWaterMs: next.logicalTimeHighWaterMs,
        },
      } satisfies CollectiveInvariantSnapshotV1;
      if (
        await this.#store.commit({
          state: snapshot.state,
          anchorKey: this.#anchorKey,
          anchor: snapshot.anchor,
          expectedRevision: prior?.state.revision ?? null,
          expectedStateDigest: prior?.state.stateDigest ?? null,
        })
      )
        return receipt;
    }
    throw new CollectiveInvariantViolationError(
      "invariant state CAS exhausted",
    );
  }

  async #evaluateClaim(
    state: CollectiveInvariantStateV1,
    observation: CollectiveInvariantObservationV1,
  ): Promise<{
    readonly reasons: readonly string[];
    readonly state: CollectiveInvariantStateV1;
  }> {
    const claim = observation.claim;
    const missingEvidence = observation.evidenceDigests.length === 0;
    if (missingEvidence) return { reasons: ["evidence_missing"], state };
    switch (claim.kind) {
      case "effect_authority": {
        const reasons: string[] = [];
        if (!claim.authorizationDigest) reasons.push("authorization_missing");
        if (!claim.finalityDigest) reasons.push("finality_missing");
        if (!claim.semanticDecisionDigest)
          reasons.push("semantic_decision_missing");
        if (
          !claim.semanticDisposition ||
          !this.#policy.admissibleSemanticDispositions.includes(
            claim.semanticDisposition as "continue" | "shorten_horizon",
          )
        )
          reasons.push("semantic_decision_not_admissible");
        if (
          [
            claim.authorizationDigest,
            claim.finalityDigest,
            claim.semanticDecisionDigest,
          ].some(
            (value) =>
              value !== null && !observation.evidenceDigests.includes(value),
          )
        )
          reasons.push("evidence_binding_missing");
        if (!observation.evidenceDigests.includes(claim.effectBindingDigest))
          reasons.push("effect_binding_evidence_missing");
        if (
          claim.authorizationDigest &&
          claim.finalityDigest &&
          claim.semanticDecisionDigest &&
          (claim.semanticDisposition === "continue" ||
            claim.semanticDisposition === "shorten_horizon")
        ) {
          const expectedBinding =
            await collectiveEffectAuthorityBindingDigestV1(
              {
                scopeId: observation.scopeId,
                membershipEpoch: observation.membershipEpoch,
                effectId: claim.effectId,
                actionDigest: claim.actionDigest,
                authorizationDigest: claim.authorizationDigest,
                finalityDigest: claim.finalityDigest,
                semanticDecisionDigest: claim.semanticDecisionDigest,
                semanticDisposition: claim.semanticDisposition,
              },
              this.#digests,
            );
          if (expectedBinding !== claim.effectBindingDigest)
            reasons.push("effect_binding_mismatch");
        }
        const existing = state.effectHeads.find(
          (head) => head.effectId === claim.effectId,
        );
        if (
          existing &&
          (existing.actionDigest !== claim.actionDigest ||
            existing.effectBindingDigest !== claim.effectBindingDigest)
        )
          reasons.push("effect_identifier_equivocation");
        if (reasons.length > 0 || existing) return { reasons, state };
        if (state.effectHeads.length >= this.#policy.maximumHeadsPerKind)
          return { reasons: ["effect_capacity_exhausted"], state };
        return {
          reasons: [],
          state: {
            ...state,
            effectHeads: [
              ...state.effectHeads,
              {
                effectId: claim.effectId,
                admittedAtMembershipEpoch: observation.membershipEpoch,
                actionDigest: claim.actionDigest,
                effectBindingDigest: claim.effectBindingDigest,
                observationDigest: observation.observationDigest,
                receiptDigest: null,
              },
            ],
          },
        };
      }
      case "finality_uniqueness": {
        if (
          !observation.evidenceDigests.includes(claim.decisionDigest) ||
          !observation.evidenceDigests.includes(claim.certificateDigest)
        )
          return { reasons: ["evidence_binding_missing"], state };
        const existing = state.finalityHeads.find(
          (head) =>
            head.coordinateId === claim.coordinateId &&
            head.membershipEpoch === observation.membershipEpoch,
        );
        if (existing && existing.decisionDigest !== claim.decisionDigest)
          return { reasons: ["conflicting_finality"], state };
        if (existing && existing.certificateDigest !== claim.certificateDigest)
          return { reasons: ["finality_certificate_equivocation"], state };
        if (existing) return { reasons: [], state };
        if (state.finalityHeads.length >= this.#policy.maximumHeadsPerKind)
          return { reasons: ["finality_capacity_exhausted"], state };
        return {
          reasons: [],
          state: {
            ...state,
            finalityHeads: [
              ...state.finalityHeads,
              {
                coordinateId: claim.coordinateId,
                membershipEpoch: observation.membershipEpoch,
                decisionDigest: claim.decisionDigest,
                certificateDigest: claim.certificateDigest,
              },
            ],
          },
        };
      }
      case "budget_conservation": {
        if (!observation.evidenceDigests.includes(claim.operationDigest))
          return { reasons: ["evidence_binding_missing"], state };
        if (state.budgetOperationDigests.includes(claim.operationDigest))
          return { reasons: ["budget_operation_replay"], state };
        const existing = state.budgetHeads.find(
          (head) => head.budgetId === claim.budgetId,
        );
        const expected = existing?.remainingUnits ?? claim.maximumUnits;
        const computed = expected - claim.debitUnits + claim.creditUnits;
        const reasons: string[] = [];
        if (existing && existing.maximumUnits !== claim.maximumUnits)
          reasons.push("budget_limit_changed");
        if (
          claim.previousOperationDigest !== (existing?.operationDigest ?? null)
        )
          reasons.push("budget_predecessor_mismatch");
        if (claim.expectedRemainingUnits !== expected)
          reasons.push("budget_head_mismatch");
        if (computed !== claim.nextRemainingUnits)
          reasons.push("budget_not_conserved");
        if (computed < 0 || computed > claim.maximumUnits)
          reasons.push("budget_bounds_exceeded");
        if (reasons.length > 0) return { reasons, state };
        if (
          !existing &&
          state.budgetHeads.length >= this.#policy.maximumHeadsPerKind
        )
          return { reasons: ["budget_capacity_exhausted"], state };
        if (
          state.budgetOperationDigests.length >=
          this.#policy.maximumHeadsPerKind
        )
          return { reasons: ["budget_operation_capacity_exhausted"], state };
        return {
          reasons: [],
          state: {
            ...state,
            budgetHeads: [
              ...state.budgetHeads.filter(
                (head) => head.budgetId !== claim.budgetId,
              ),
              {
                budgetId: claim.budgetId,
                maximumUnits: claim.maximumUnits,
                remainingUnits: claim.nextRemainingUnits,
                operationDigest: claim.operationDigest,
              },
            ],
            budgetOperationDigests: [
              ...state.budgetOperationDigests,
              claim.operationDigest,
            ],
          },
        };
      }
      case "lineage_attenuation": {
        const parent = new Set(claim.parentAuthorityDigests);
        const reasons: string[] = [];
        if (claim.childAuthorityDigests.some((value) => !parent.has(value)))
          reasons.push("lineage_authority_amplified");
        if (claim.childBudgetUnits > claim.parentBudgetUnits)
          reasons.push("lineage_budget_amplified");
        if (claim.parentId === claim.childId)
          reasons.push("lineage_self_parent");
        if (claim.parentLineageDigest === claim.childLineageDigest)
          reasons.push("lineage_digest_not_advanced");
        if (
          !observation.evidenceDigests.includes(claim.parentLineageDigest) ||
          !observation.evidenceDigests.includes(claim.childLineageDigest)
        )
          reasons.push("evidence_binding_missing");
        const registeredParent = state.lineageHeads.find(
          (head) => head.childId === claim.parentId,
        );
        const configuredRoot = this.#policy.lineageRoots.find(
          (root) => root.rootId === claim.parentId,
        );
        if (!registeredParent && !configuredRoot)
          reasons.push("lineage_parent_untrusted");
        if (
          registeredParent &&
          (registeredParent.childLineageDigest !== claim.parentLineageDigest ||
            registeredParent.budgetUnits !== claim.parentBudgetUnits ||
            !sameStrings(
              registeredParent.authorityDigests,
              claim.parentAuthorityDigests,
            ))
        )
          reasons.push("lineage_parent_head_mismatch");
        if (
          configuredRoot &&
          (configuredRoot.lineageDigest !== claim.parentLineageDigest ||
            configuredRoot.budgetUnits !== claim.parentBudgetUnits ||
            !sameStrings(
              configuredRoot.authorityDigests,
              claim.parentAuthorityDigests,
            ))
        )
          reasons.push("lineage_root_binding_mismatch");
        const existingChild = state.lineageHeads.find(
          (head) => head.childId === claim.childId,
        );
        if (existingChild) {
          if (
            existingChild.parentId !== claim.parentId ||
            existingChild.parentLineageDigest !== claim.parentLineageDigest ||
            existingChild.childLineageDigest !== claim.childLineageDigest ||
            existingChild.budgetUnits !== claim.childBudgetUnits ||
            !sameStrings(
              existingChild.authorityDigests,
              claim.childAuthorityDigests,
            )
          )
            reasons.push("lineage_child_equivocation");
          return { reasons, state };
        }
        if (reasons.length > 0) return { reasons, state };
        if (state.lineageHeads.length >= this.#policy.maximumHeadsPerKind)
          return { reasons: ["lineage_capacity_exhausted"], state };
        return {
          reasons: [],
          state: {
            ...state,
            lineageHeads: [
              ...state.lineageHeads,
              {
                childId: claim.childId,
                parentId: claim.parentId,
                parentLineageDigest: claim.parentLineageDigest,
                childLineageDigest: claim.childLineageDigest,
                authorityDigests: claim.childAuthorityDigests,
                budgetUnits: claim.childBudgetUnits,
              },
            ],
          },
        };
      }
      case "monotonic_coordinates": {
        if (!observation.evidenceDigests.includes(claim.transitionDigest))
          return { reasons: ["evidence_binding_missing"], state };
        const existing = state.coordinateHeads.find(
          (head) => head.coordinateId === claim.coordinateId,
        );
        const reasons: string[] = [];
        if (existing) {
          if (
            claim.previousEpoch !== existing.epoch ||
            claim.previousFence !== existing.fence ||
            claim.previousCheckpoint !== existing.checkpoint
          )
            reasons.push("coordinate_head_mismatch");
        } else if (
          claim.previousEpoch !== null ||
          claim.previousFence !== null ||
          claim.previousCheckpoint !== null
        )
          reasons.push("coordinate_predecessor_missing");
        const previousEpoch = existing?.epoch ?? 0;
        const previousFence = existing?.fence ?? 0;
        const previousCheckpoint = existing?.checkpoint ?? 0;
        if (
          claim.nextEpoch < previousEpoch ||
          claim.nextFence < previousFence ||
          claim.nextCheckpoint < previousCheckpoint
        )
          reasons.push("coordinate_rollback");
        if (
          existing &&
          claim.nextEpoch === previousEpoch &&
          claim.nextFence === previousFence &&
          claim.nextCheckpoint === previousCheckpoint &&
          claim.transitionDigest !== existing.transitionDigest
        )
          reasons.push("coordinate_equivocation");
        if (reasons.length > 0) return { reasons, state };
        if (
          !existing &&
          state.coordinateHeads.length >= this.#policy.maximumHeadsPerKind
        )
          return { reasons: ["coordinate_capacity_exhausted"], state };
        return {
          reasons: [],
          state: {
            ...state,
            coordinateHeads: [
              ...state.coordinateHeads.filter(
                (head) => head.coordinateId !== claim.coordinateId,
              ),
              {
                coordinateId: claim.coordinateId,
                epoch: claim.nextEpoch,
                fence: claim.nextFence,
                checkpoint: claim.nextCheckpoint,
                transitionDigest: claim.transitionDigest,
              },
            ],
          },
        };
      }
    }
  }

  async #initialState(): Promise<CollectiveInvariantStateV1> {
    const body = {
      format: COLLECTIVE_INVARIANT_STATE_FORMAT_V1,
      schemaVersion: 1 as const,
      stateKey: this.#stateKey,
      scopeId: this.#scopeId,
      policyDigest: this.#policy.policyDigest,
      revision: 0,
      logicalTimeHighWaterMs: 0,
      effectHeads: [],
      finalityHeads: [],
      budgetHeads: [],
      coordinateHeads: [],
      lineageHeads: [],
      budgetOperationDigests: [],
      receipts: [],
      predecessorStateDigest: null,
    };
    return {
      ...body,
      stateDigest: await domainDigest(this.#digests, "state", body),
    };
  }

  async #createReceipt(
    observation: CollectiveInvariantObservationV1,
    reasons: readonly string[],
    logicalTimeMs: number,
    stateRevision: number,
  ): Promise<CollectiveInvariantReceiptV1> {
    const body = {
      schemaVersion: 1 as const,
      receiptId: `${this.#stateKey}.invariant.${stateRevision}`,
      observationId: observation.observationId,
      observationDigest: observation.observationDigest,
      scopeId: observation.scopeId,
      membershipEpoch: observation.membershipEpoch,
      invariant: observation.claim.kind,
      disposition:
        reasons.length === 0 ? ("allow" as const) : ("deny" as const),
      reasonCodes: [...new Set(reasons)].sort(compareAscii),
      evidenceDigests: observation.evidenceDigests,
      evaluatedAtLogicalMs: logicalTimeMs,
      stateRevision,
    };
    return deepFreeze({
      ...body,
      receiptDigest: await domainDigest(this.#digests, "receipt", body),
    });
  }

  async #nextState(
    base: CollectiveInvariantStateV1,
    mutated: CollectiveInvariantStateV1,
    receipt: CollectiveInvariantReceiptV1,
    logicalTimeMs: number,
  ): Promise<CollectiveInvariantStateV1> {
    const receipts = [...mutated.receipts, receipt];
    const body = {
      format: COLLECTIVE_INVARIANT_STATE_FORMAT_V1,
      schemaVersion: 1 as const,
      stateKey: this.#stateKey,
      scopeId: this.#scopeId,
      policyDigest: this.#policy.policyDigest,
      revision: receipt.stateRevision,
      logicalTimeHighWaterMs: Math.max(
        base.logicalTimeHighWaterMs,
        logicalTimeMs,
      ),
      effectHeads: mutated.effectHeads,
      finalityHeads: mutated.finalityHeads,
      budgetHeads: mutated.budgetHeads,
      coordinateHeads: mutated.coordinateHeads,
      lineageHeads: mutated.lineageHeads,
      budgetOperationDigests: mutated.budgetOperationDigests,
      receipts,
      predecessorStateDigest: base.stateDigest,
    };
    return deepFreeze({
      ...body,
      stateDigest: await domainDigest(this.#digests, "state", body),
    });
  }

  async #loadSnapshot(): Promise<CollectiveInvariantSnapshotV1 | null> {
    const [state, anchor] = await Promise.all([
      this.#store.loadState(this.#stateKey),
      this.#store.loadAnchor(this.#anchorKey),
    ]);
    if ((state === null) !== (anchor === null))
      throw new CollectiveInvariantViolationError(
        "invariant state and monotonic anchor availability diverged",
      );
    if (!state || !anchor) return null;
    const snapshot = { state, anchor } satisfies CollectiveInvariantSnapshotV1;
    await this.#validateSnapshot(snapshot);
    return snapshot;
  }

  async #validateSnapshot(
    snapshot: CollectiveInvariantSnapshotV1,
  ): Promise<void> {
    const { state, anchor } = snapshot;
    const { stateDigest, ...body } = state;
    const expectedStateDigest = await domainDigest(
      this.#digests,
      "state",
      body,
    );
    if (
      state.format !== COLLECTIVE_INVARIANT_STATE_FORMAT_V1 ||
      state.schemaVersion !== 1 ||
      state.stateKey !== this.#stateKey ||
      state.scopeId !== this.#scopeId ||
      state.policyDigest !== this.#policy.policyDigest ||
      anchor.revision !== state.revision ||
      anchor.stateDigest !== state.stateDigest ||
      anchor.logicalTimeHighWaterMs !== state.logicalTimeHighWaterMs ||
      expectedStateDigest !== stateDigest
    )
      throw new CollectiveInvariantViolationError(
        "invariant snapshot and monotonic anchor diverged",
      );
  }
}

function validatePolicy(policy: CollectiveInvariantPolicyV1 | undefined): void {
  if (!policy || policy.schemaVersion !== 1)
    throw new TypeError("invariant policy is invalid");
  identifier(policy.policyId, "policyId");
  positiveInteger(policy.policyVersion, "policyVersion");
  digest(policy.policyDigest, "policyDigest");
  positiveInteger(policy.maximumObservationAgeMs, "maximumObservationAgeMs");
  safeInteger(policy.maximumFutureSkewMs, "maximumFutureSkewMs");
  positiveInteger(policy.maximumReceipts, "maximumReceipts");
  positiveInteger(policy.maximumHeadsPerKind, "maximumHeadsPerKind");
  positiveInteger(policy.maximumCommitAttempts, "maximumCommitAttempts");
  if (
    !Array.isArray(policy.lineageRoots) ||
    policy.lineageRoots.length > policy.maximumHeadsPerKind
  )
    throw new TypeError("lineage roots are invalid");
  const rootIds = policy.lineageRoots.map((root) => {
    identifier(root.rootId, "lineage rootId");
    digest(root.lineageDigest, "lineage root digest");
    digestArray(root.authorityDigests, "lineage root authorityDigests");
    safeInteger(root.budgetUnits, "lineage root budgetUnits");
    return root.rootId;
  });
  if (
    new Set(rootIds).size !== rootIds.length ||
    rootIds.some(
      (value, index) => value !== [...rootIds].sort(compareAscii)[index],
    )
  )
    throw new TypeError("lineage roots must be unique and ASCII ordered");
  if (
    !Array.isArray(policy.admissibleSemanticDispositions) ||
    policy.admissibleSemanticDispositions.length === 0 ||
    policy.admissibleSemanticDispositions.some(
      (value) => value !== "continue" && value !== "shorten_horizon",
    ) ||
    new Set(policy.admissibleSemanticDispositions).size !==
      policy.admissibleSemanticDispositions.length ||
    policy.admissibleSemanticDispositions.some(
      (value, index) =>
        value !==
        [...policy.admissibleSemanticDispositions].sort(compareAscii)[index],
    )
  )
    throw new TypeError(
      "admissible semantic dispositions must be unique and ASCII ordered",
    );
}

function validateObservationBody(
  observation:
    | Omit<CollectiveInvariantObservationV1, "observationDigest">
    | CollectiveInvariantObservationV1,
): void {
  if (!observation || observation.schemaVersion !== 1)
    throw new TypeError("invariant observation is invalid");
  identifier(observation.observationId, "observationId");
  identifier(observation.scopeId, "scopeId");
  positiveInteger(observation.membershipEpoch, "membershipEpoch");
  safeInteger(observation.observedAtLogicalMs, "observedAtLogicalMs");
  positiveInteger(observation.validUntilLogicalMs, "validUntilLogicalMs");
  if (observation.validUntilLogicalMs <= observation.observedAtLogicalMs)
    throw new TypeError("observation validity window is invalid");
  if (
    !Array.isArray(observation.evidenceDigests) ||
    observation.evidenceDigests.length > 128
  )
    throw new TypeError("observation evidence is invalid");
  observation.evidenceDigests.forEach((value) =>
    digest(value, "evidenceDigest"),
  );
  validateClaim(observation.claim);
}

function validateClaim(claim: CollectiveInvariantClaimV1): void {
  if (!claim || typeof claim !== "object")
    throw new TypeError("claim is invalid");
  switch (claim.kind) {
    case "effect_authority":
      identifier(claim.effectId, "effectId");
      digest(claim.actionDigest, "actionDigest");
      nullableDigest(claim.authorizationDigest, "authorizationDigest");
      nullableDigest(claim.finalityDigest, "finalityDigest");
      nullableDigest(claim.semanticDecisionDigest, "semanticDecisionDigest");
      digest(claim.effectBindingDigest, "effectBindingDigest");
      if (
        claim.semanticDisposition !== null &&
        !["continue", "shorten_horizon", "replan", "safe_stop"].includes(
          claim.semanticDisposition,
        )
      )
        throw new TypeError("semantic disposition is invalid");
      return;
    case "finality_uniqueness":
      identifier(claim.coordinateId, "coordinateId");
      digest(claim.decisionDigest, "decisionDigest");
      digest(claim.certificateDigest, "certificateDigest");
      return;
    case "budget_conservation":
      identifier(claim.budgetId, "budgetId");
      nullableDigest(claim.previousOperationDigest, "previousOperationDigest");
      safeInteger(claim.maximumUnits, "maximumUnits");
      safeInteger(claim.expectedRemainingUnits, "expectedRemainingUnits");
      safeInteger(claim.debitUnits, "debitUnits");
      safeInteger(claim.creditUnits, "creditUnits");
      safeInteger(claim.nextRemainingUnits, "nextRemainingUnits");
      digest(claim.operationDigest, "operationDigest");
      return;
    case "lineage_attenuation":
      identifier(claim.parentId, "parentId");
      identifier(claim.childId, "childId");
      digestArray(claim.parentAuthorityDigests, "parentAuthorityDigests");
      digestArray(claim.childAuthorityDigests, "childAuthorityDigests");
      safeInteger(claim.parentBudgetUnits, "parentBudgetUnits");
      safeInteger(claim.childBudgetUnits, "childBudgetUnits");
      digest(claim.parentLineageDigest, "parentLineageDigest");
      digest(claim.childLineageDigest, "childLineageDigest");
      return;
    case "monotonic_coordinates":
      identifier(claim.coordinateId, "coordinateId");
      nullableInteger(claim.previousEpoch, "previousEpoch");
      nullableInteger(claim.previousFence, "previousFence");
      nullableInteger(claim.previousCheckpoint, "previousCheckpoint");
      safeInteger(claim.nextEpoch, "nextEpoch");
      safeInteger(claim.nextFence, "nextFence");
      safeInteger(claim.nextCheckpoint, "nextCheckpoint");
      digest(claim.transitionDigest, "transitionDigest");
      return;
  }
}

function claimBindingDigest(
  claim: CollectiveInvariantClaimV1,
): PlanningDigestV1 {
  switch (claim.kind) {
    case "effect_authority":
      return claim.effectBindingDigest;
    case "finality_uniqueness":
      return claim.certificateDigest;
    case "budget_conservation":
      return claim.operationDigest;
    case "lineage_attenuation":
      return claim.childLineageDigest;
    case "monotonic_coordinates":
      return claim.transitionDigest;
  }
}

async function domainDigest(
  port: CollectiveInvariantDigestPortV1,
  domain: "effect-binding" | "observation" | "policy" | "receipt" | "state",
  value: unknown,
): Promise<PlanningDigestV1> {
  return port.digest(
    `agentplat.collective-runtime/collective-invariant-${domain}/v1\0${canonicalizePlanningJsonV1(
      value as JsonValue,
    )}`,
  );
}

function digest(
  value: unknown,
  label: string,
): asserts value is PlanningDigestV1 {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError(`${label} is invalid`);
}

function nullableDigest(value: unknown, label: string): void {
  if (value !== null) digest(value, label);
}

function digestArray(value: readonly PlanningDigestV1[], label: string): void {
  if (!Array.isArray(value) || value.length > 128)
    throw new TypeError(`${label} is invalid`);
  const canonical = [...value].sort(compareAscii);
  if (canonical.some((entry, index) => entry !== value[index]))
    throw new TypeError(`${label} must use ASCII order`);
  value.forEach((entry) => digest(entry, label));
  if (new Set(value).size !== value.length)
    throw new TypeError(`${label} contains duplicates`);
}

function identifier(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 256 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value)
  )
    throw new TypeError(`${label} is invalid`);
}

function safeInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new TypeError(`${label} is invalid`);
}

function positiveInteger(
  value: unknown,
  label: string,
): asserts value is number {
  safeInteger(value, label);
  if (value < 1) throw new TypeError(`${label} must be positive`);
}

function nullableInteger(value: unknown, label: string): void {
  if (value !== null) safeInteger(value, label);
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (value && typeof value === "object" && !seen.has(value as object)) {
    seen.add(value as object);
    for (const entry of Object.values(value as Record<string, unknown>))
      deepFreeze(entry, seen);
    Object.freeze(value);
  }
  return value;
}
