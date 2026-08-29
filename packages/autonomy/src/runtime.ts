import type { JsonObject, JsonValue } from "@agentplat/core";

import {
  AutonomyValidationErrorV1,
  canonicalizeAutonomyJsonV1,
  deepFreezeAutonomyV1,
  digestAutonomyJsonV1,
  type AutonomyDigestV1,
} from "./canonical.js";
import type {
  AutonomyDecisionDispositionV1,
  AutonomyDecisionHistoryV1,
  AutonomyDecisionV1,
  AutonomyEvaluationInputV1,
  AutonomyEvidenceCursorV1,
  AutonomyEvidenceWindowInputV1,
  AutonomyEvidenceWindowV1,
  AutonomyLevelV1,
  AutonomyPolicyInputV1,
  AutonomyPolicyV1,
  AutonomyStateV1,
  AutonomyStoreV1,
} from "./contracts.js";

const levels = Object.freeze<readonly AutonomyLevelV1[]>([
  "blocked",
  "propose_only",
  "approve_all",
  "approve_sample",
  "autonomous",
]);

export function createAutonomyPolicyV1(
  input: AutonomyPolicyInputV1,
): AutonomyPolicyV1 {
  validatePolicyInput(input);
  const body = { schemaVersion: 1 as const, ...input };
  return freeze({
    ...clone(body),
    policyDigest: digestAutonomyJsonV1("policy", json(body)),
  });
}

export function validateAutonomyPolicyV1(
  input: AutonomyPolicyV1,
): AutonomyPolicyV1 {
  exactKeys(
    input,
    ["schemaVersion", ...policyInputKeys(input), "policyDigest"],
    "policy",
  );
  if (input.schemaVersion !== 1) fail("autonomy_policy_schema_invalid");
  const { schemaVersion: _schemaVersion, policyDigest, ...body } = input;
  validatePolicyInput(body);
  digest(policyDigest, "policyDigest");
  if (
    policyDigest !==
    digestAutonomyJsonV1("policy", json({ schemaVersion: 1, ...body }))
  )
    fail("autonomy_policy_digest_mismatch");
  return freeze(clone(input));
}

export function createAutonomyEvidenceWindowV1(
  input: AutonomyEvidenceWindowInputV1,
): AutonomyEvidenceWindowV1 {
  validateEvidenceInput(input);
  const segmentDigest = digestAutonomyJsonV1(
    "segment",
    json({
      tenantId: input.tenantId,
      policyDomainId: input.policyDomainId,
      segmentNamespace: input.segmentNamespace,
      segmentKey: input.segmentKey,
    }),
  );
  const body = { schemaVersion: 1 as const, ...input, segmentDigest };
  return freeze({
    ...clone(body),
    evidenceDigest: digestAutonomyJsonV1("evidence-window", json(body)),
  });
}

export function validateAutonomyEvidenceWindowV1(
  input: AutonomyEvidenceWindowV1,
): AutonomyEvidenceWindowV1 {
  exactKeys(
    input,
    ["schemaVersion", ...evidenceInputKeys, "segmentDigest", "evidenceDigest"],
    "evidence_window",
  );
  if (input.schemaVersion !== 1) fail("autonomy_evidence_schema_invalid");
  const {
    schemaVersion: _schemaVersion,
    segmentDigest,
    evidenceDigest,
    ...body
  } = input;
  validateEvidenceInput(body);
  digest(segmentDigest, "segmentDigest");
  digest(evidenceDigest, "evidenceDigest");
  const expectedSegment = digestAutonomyJsonV1(
    "segment",
    json({
      tenantId: input.tenantId,
      policyDomainId: input.policyDomainId,
      segmentNamespace: input.segmentNamespace,
      segmentKey: input.segmentKey,
    }),
  );
  if (segmentDigest !== expectedSegment)
    fail("autonomy_segment_digest_mismatch");
  if (
    evidenceDigest !==
    digestAutonomyJsonV1(
      "evidence-window",
      json({ schemaVersion: 1, ...body, segmentDigest }),
    )
  )
    fail("autonomy_evidence_digest_mismatch");
  return freeze(clone(input));
}

export function createAutonomyStateV1(input: {
  readonly policy: AutonomyPolicyV1;
  readonly evidence: AutonomyEvidenceWindowV1;
  readonly logicalTime: string;
}): AutonomyStateV1 {
  const policy = validateAutonomyPolicyV1(input.policy);
  const evidence = validateAutonomyEvidenceWindowV1(input.evidence);
  assertPolicyEvidence(policy, evidence);
  timestamp(input.logicalTime, "logicalTime");
  const body: Omit<AutonomyStateV1, "stateDigest"> = {
    schemaVersion: 1,
    tenantId: evidence.tenantId,
    policyDomainId: evidence.policyDomainId,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    policyDigest: policy.policyDigest,
    segmentNamespace: evidence.segmentNamespace,
    segmentKey: evidence.segmentKey,
    segmentDigest: evidence.segmentDigest,
    actionType: evidence.actionType,
    revision: 0,
    level: policy.initialLevel,
    levelEpoch: 0,
    consecutiveHealthyWindows: 0,
    cooldownUntil: null,
    lastEvidenceSequence: null,
    lastEvidenceDigest: null,
    lastEvidenceCursor: null,
    latestCoverageStatus: "insufficient",
    lastCriticalReasonCode: null,
    decisionHistory: [],
    createdAt: input.logicalTime,
    updatedAt: input.logicalTime,
  };
  return freezeState(body);
}

export function validateAutonomyStateV1(
  input: AutonomyStateV1,
): AutonomyStateV1 {
  exactKeys(
    input,
    [
      "schemaVersion",
      "tenantId",
      "policyDomainId",
      "policyId",
      "policyVersion",
      "policyDigest",
      "segmentNamespace",
      "segmentKey",
      "segmentDigest",
      "actionType",
      "revision",
      "level",
      "levelEpoch",
      "consecutiveHealthyWindows",
      "cooldownUntil",
      "lastEvidenceSequence",
      "lastEvidenceDigest",
      "lastEvidenceCursor",
      "latestCoverageStatus",
      "lastCriticalReasonCode",
      "decisionHistory",
      "createdAt",
      "updatedAt",
      "stateDigest",
    ],
    "state",
  );
  if (input.schemaVersion !== 1) fail("autonomy_state_schema_invalid");
  required(input.tenantId, "tenantId");
  required(input.policyDomainId, "policyDomainId");
  required(input.policyId, "policyId");
  positive(input.policyVersion, "policyVersion");
  digest(input.policyDigest, "policyDigest");
  required(input.segmentNamespace, "segmentNamespace");
  required(input.segmentKey, "segmentKey");
  digest(input.segmentDigest, "segmentDigest");
  required(input.actionType, "actionType");
  nonNegative(input.revision, "revision");
  level(input.level, "level");
  nonNegative(input.levelEpoch, "levelEpoch");
  nonNegative(input.consecutiveHealthyWindows, "consecutiveHealthyWindows");
  if (input.cooldownUntil) timestamp(input.cooldownUntil, "cooldownUntil");
  if (input.lastEvidenceSequence !== null)
    nonNegative(input.lastEvidenceSequence, "lastEvidenceSequence");
  if (input.lastEvidenceDigest !== null)
    digest(input.lastEvidenceDigest, "lastEvidenceDigest");
  if (input.lastEvidenceCursor) validateCursor(input.lastEvidenceCursor);
  if (
    !["healthy", "insufficient", "stale", "unavailable"].includes(
      input.latestCoverageStatus,
    )
  )
    fail("autonomy_coverage_status_invalid");
  if (input.lastCriticalReasonCode)
    required(input.lastCriticalReasonCode, "lastCriticalReasonCode");
  if (
    !Array.isArray(input.decisionHistory) ||
    input.decisionHistory.length > 256
  )
    fail("autonomy_decision_history_invalid");
  for (const decision of input.decisionHistory) validateHistory(decision);
  timestamp(input.createdAt, "createdAt");
  timestamp(input.updatedAt, "updatedAt");
  digest(input.stateDigest, "stateDigest");
  const { stateDigest, ...body } = input;
  if (stateDigest !== digestAutonomyJsonV1("state", json(body)))
    fail("autonomy_state_digest_mismatch");
  return freeze(clone(input));
}

export function validateAutonomyDecisionV1(
  input: AutonomyDecisionV1,
): AutonomyDecisionV1 {
  exactKeys(
    input,
    [
      "schemaVersion",
      "decisionId",
      "tenantId",
      "policyDomainId",
      "policyId",
      "policyVersion",
      "policyDigest",
      "segmentDigest",
      "actionType",
      "actionProposalDigest",
      "stateRevision",
      "level",
      "disposition",
      "sampledForApproval",
      "reasonCode",
      "evidenceDigest",
      "decidedAt",
      "decisionDigest",
    ],
    "decision",
  );
  if (input.schemaVersion !== 1) fail("autonomy_decision_schema_invalid");
  required(input.decisionId, "decisionId");
  required(input.tenantId, "tenantId");
  required(input.policyDomainId, "policyDomainId");
  required(input.policyId, "policyId");
  positive(input.policyVersion, "policyVersion");
  digest(input.policyDigest, "policyDigest");
  digest(input.segmentDigest, "segmentDigest");
  required(input.actionType, "actionType");
  digest(input.actionProposalDigest, "actionProposalDigest");
  if (input.stateRevision !== null)
    nonNegative(input.stateRevision, "stateRevision");
  if (input.level !== null) level(input.level, "level");
  disposition(input.disposition);
  if (typeof input.sampledForApproval !== "boolean")
    fail("autonomy_sample_flag_invalid");
  required(input.reasonCode, "reasonCode");
  if (input.evidenceDigest !== null)
    digest(input.evidenceDigest, "evidenceDigest");
  timestamp(input.decidedAt, "decidedAt");
  digest(input.decisionDigest, "decisionDigest");
  if (
    (input.level === null && input.disposition !== "deny") ||
    (input.level === "blocked" && input.disposition !== "deny") ||
    (input.level === "propose_only" && input.disposition !== "proposal_only") ||
    (input.level === "approve_all" &&
      input.disposition !== "require_approval") ||
    (input.level === "autonomous" && input.disposition !== "eligible") ||
    (input.level !== "approve_sample" && input.sampledForApproval)
  )
    fail("autonomy_decision_level_disposition_mismatch");
  const { decisionDigest, ...body } = input;
  if (decisionDigest !== digestAutonomyJsonV1("decision", json(body)))
    fail("autonomy_decision_digest_mismatch");
  return freeze(clone(input));
}

export class InMemoryAutonomyStoreV1 implements AutonomyStoreV1 {
  readonly #policies = new Map<string, AutonomyPolicyV1>();
  readonly #states = new Map<string, AutonomyStateV1>();
  readonly #decisions = new Map<string, AutonomyDecisionV1>();

  async registerPolicy(
    policyInput: AutonomyPolicyV1,
  ): Promise<"created" | "replayed"> {
    const policy = validateAutonomyPolicyV1(policyInput);
    const key = policyKey(policy);
    const current = this.#policies.get(key);
    if (current) {
      if (current.policyDigest !== policy.policyDigest)
        fail("autonomy_policy_identity_conflict");
      return "replayed";
    }
    this.#policies.set(key, policy);
    return "created";
  }

  async getPolicy(
    tenantId: string,
    policyDomainId: string,
    policyId: string,
    policyVersion: number,
  ): Promise<AutonomyPolicyV1 | undefined> {
    const value = this.#policies.get(
      policyKey({ tenantId, policyDomainId, policyId, policyVersion }),
    );
    return value ? clone(value) : undefined;
  }

  async initializeState(stateInput: AutonomyStateV1): Promise<boolean> {
    const state = validateAutonomyStateV1(stateInput);
    const key = stateKey(state);
    if (this.#states.has(key)) return false;
    this.#states.set(key, state);
    return true;
  }

  async loadState(input: {
    readonly tenantId: string;
    readonly policyDomainId: string;
    readonly policyId: string;
    readonly segmentDigest: AutonomyDigestV1;
    readonly actionType: string;
  }): Promise<AutonomyStateV1 | undefined> {
    const value = this.#states.get(stateKey(input));
    return value ? clone(value) : undefined;
  }

  async compareAndSet(input: {
    readonly expectedRevision: number;
    readonly expectedStateDigest: AutonomyDigestV1;
    readonly state: AutonomyStateV1;
    readonly decision: AutonomyDecisionV1;
  }): Promise<boolean> {
    const state = validateAutonomyStateV1(input.state);
    const decision = validateAutonomyDecisionV1(input.decision);
    const key = stateKey(state);
    const current = this.#states.get(key);
    if (
      !current ||
      current.revision !== input.expectedRevision ||
      current.stateDigest !== input.expectedStateDigest ||
      state.revision !== input.expectedRevision + 1 ||
      decision.stateRevision !== state.revision ||
      decision.segmentDigest !== state.segmentDigest ||
      decision.policyDigest !== state.policyDigest
    )
      return false;
    const prior = this.#decisions.get(decision.decisionId);
    if (prior && prior.decisionDigest !== decision.decisionDigest)
      fail("autonomy_decision_identity_conflict");
    this.#states.set(key, state);
    this.#decisions.set(decision.decisionId, decision);
    return true;
  }

  async listDecisions(input: {
    readonly tenantId: string;
    readonly policyDomainId: string;
    readonly segmentDigest?: AutonomyDigestV1;
  }): Promise<AutonomyDecisionV1[]> {
    return [...this.#decisions.values()]
      .filter(
        (decision) =>
          decision.tenantId === input.tenantId &&
          decision.policyDomainId === input.policyDomainId &&
          (!input.segmentDigest ||
            decision.segmentDigest === input.segmentDigest),
      )
      .sort((left, right) =>
        left.decidedAt === right.decidedAt
          ? left.decisionId.localeCompare(right.decisionId)
          : left.decidedAt.localeCompare(right.decidedAt),
      )
      .map(clone);
  }
}

export class AutonomyControllerV1 {
  constructor(readonly store: AutonomyStoreV1) {}

  async evaluate(
    input: AutonomyEvaluationInputV1,
  ): Promise<AutonomyDecisionV1> {
    validateEvaluationInput(input);
    const evidence = validateAutonomyEvidenceWindowV1(input.evidence);
    assertEvaluationEvidence(input, evidence);
    let policy: AutonomyPolicyV1 | undefined;
    try {
      policy = await this.store.getPolicy(
        input.tenantId,
        input.policyDomainId,
        input.policyId,
        input.policyVersion,
      );
    } catch {
      return unavailableDecision(input, evidence, "autonomy_store_unavailable");
    }
    if (!policy)
      return unavailableDecision(
        input,
        evidence,
        "autonomy_policy_unavailable",
      );
    policy = validateAutonomyPolicyV1(policy);
    assertPolicyEvidence(policy, evidence);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      let current: AutonomyStateV1 | undefined;
      try {
        current = await this.store.loadState({
          tenantId: input.tenantId,
          policyDomainId: input.policyDomainId,
          policyId: input.policyId,
          segmentDigest: evidence.segmentDigest,
          actionType: input.actionType,
        });
        if (!current) {
          const initial = createAutonomyStateV1({
            policy,
            evidence,
            logicalTime: input.logicalTime,
          });
          if (!(await this.store.initializeState(initial))) continue;
          current = initial;
        }
      } catch (error) {
        if (error instanceof AutonomyValidationErrorV1) throw error;
        return unavailableDecision(
          input,
          evidence,
          "autonomy_store_unavailable",
        );
      }
      const state = validateAutonomyStateV1(current);
      assertStateBinding(state, policy, evidence, input);
      const evolved = evolveState(state, policy, evidence, input.logicalTime);
      const nextRevision = state.revision + 1;
      const decision = decisionFor(
        input,
        policy,
        evidence,
        evolved,
        nextRevision,
      );
      const history = historyFromDecision(decision);
      const body: Omit<AutonomyStateV1, "stateDigest"> = {
        ...evolved,
        revision: nextRevision,
        decisionHistory: [...evolved.decisionHistory, history].slice(
          -policy.maximumDecisionHistory,
        ),
        updatedAt: input.logicalTime,
      };
      const next = freezeState(body);
      try {
        if (
          await this.store.compareAndSet({
            expectedRevision: state.revision,
            expectedStateDigest: state.stateDigest,
            state: next,
            decision,
          })
        )
          return decision;
      } catch (error) {
        if (error instanceof AutonomyValidationErrorV1) throw error;
        return unavailableDecision(
          input,
          evidence,
          "autonomy_store_unavailable",
        );
      }
    }
    return unavailableDecision(
      input,
      evidence,
      "autonomy_contention_exhausted",
    );
  }
}

function evolveState(
  stateInput: AutonomyStateV1,
  policy: AutonomyPolicyV1,
  evidence: AutonomyEvidenceWindowV1,
  logicalTime: string,
): Omit<AutonomyStateV1, "stateDigest"> {
  const { stateDigest: _stateDigest, ...state } = stateInput;
  if (
    state.lastEvidenceSequence !== null &&
    evidence.windowSequence < state.lastEvidenceSequence
  )
    fail("autonomy_evidence_sequence_rollback");
  if (
    state.lastEvidenceSequence === evidence.windowSequence &&
    state.lastEvidenceDigest !== evidence.evidenceDigest
  )
    fail("autonomy_evidence_sequence_conflict");
  if (Date.parse(logicalTime) < Date.parse(state.updatedAt))
    fail("autonomy_logical_time_rollback");
  if (state.lastEvidenceSequence === evidence.windowSequence) return state;

  let nextLevel = state.level;
  let healthyWindows = 0;
  let cooldownUntil = state.cooldownUntil;
  let criticalReason: string | null = state.lastCriticalReasonCode;
  const critical = policy.criticalReasonCodes.find(
    (reason) => (evidence.reasonCounts[reason] ?? 0) > 0,
  );
  if (critical) {
    nextLevel = narrower(nextLevel, policy.criticalDegradationLevel);
    criticalReason = critical;
  } else if (
    ["stale", "unavailable"].includes(evidence.coverageStatus) &&
    policy.coverageFailureLevel
  ) {
    nextLevel = narrower(nextLevel, policy.coverageFailureLevel);
  } else if (evidence.coverageStatus === "healthy") {
    const denominator = evidence.concludedOutcomes;
    const positive = ratio(evidence.positive, denominator);
    const negative = ratio(evidence.negative, denominator);
    const corrected = ratio(evidence.corrected, denominator);
    const unresolved = ratio(
      evidence.unresolvedTaskRuns,
      evidence.eligibleTaskRuns,
    );
    const unhealthy =
      negative > policy.maximumNegativeBasisPoints ||
      corrected > policy.maximumCorrectedBasisPoints ||
      unresolved > policy.maximumUnresolvedBasisPoints;
    const promotable =
      denominator >= policy.minimumConcludedOutcomes &&
      positive >= policy.minimumPositiveBasisPoints &&
      !unhealthy;
    if (unhealthy) {
      nextLevel = levels[Math.max(0, levelIndex(nextLevel) - 1)]!;
    } else if (promotable) {
      healthyWindows = state.consecutiveHealthyWindows + 1;
      const cooldownComplete =
        !cooldownUntil || Date.parse(logicalTime) >= Date.parse(cooldownUntil);
      if (
        healthyWindows >= policy.consecutiveHealthyWindows &&
        cooldownComplete &&
        levelIndex(nextLevel) < levelIndex(policy.maximumLevel)
      ) {
        nextLevel = levels[levelIndex(nextLevel) + 1]!;
        healthyWindows = 0;
        cooldownUntil = new Date(
          Date.parse(logicalTime) + policy.promotionCooldownMs,
        ).toISOString();
      }
    }
  }
  const levelChanged = nextLevel !== state.level;
  return {
    ...state,
    level: nextLevel,
    levelEpoch: levelChanged ? state.levelEpoch + 1 : state.levelEpoch,
    consecutiveHealthyWindows: healthyWindows,
    cooldownUntil,
    lastEvidenceSequence: evidence.windowSequence,
    lastEvidenceDigest: evidence.evidenceDigest,
    lastEvidenceCursor: evidence.cursor,
    latestCoverageStatus: evidence.coverageStatus,
    lastCriticalReasonCode: criticalReason,
  };
}

function decisionFor(
  input: AutonomyEvaluationInputV1,
  policy: AutonomyPolicyV1,
  evidence: AutonomyEvidenceWindowV1,
  state: Omit<AutonomyStateV1, "stateDigest">,
  stateRevision: number,
): AutonomyDecisionV1 {
  let dispositionValue: AutonomyDecisionDispositionV1;
  let sampledForApproval = false;
  let reasonCode: string;
  if (state.level === "blocked") {
    dispositionValue = "deny";
    reasonCode = "autonomy_blocked";
  } else if (state.level === "propose_only") {
    dispositionValue = "proposal_only";
    reasonCode = "autonomy_proposal_only";
  } else if (state.level === "approve_all") {
    dispositionValue = "require_approval";
    reasonCode = "autonomy_approval_required";
  } else if (state.level === "approve_sample") {
    sampledForApproval = sampled(
      input.actionProposalDigest,
      policy.policyDigest,
      evidence.segmentDigest,
      state.levelEpoch,
      policy.sampleApprovalBasisPoints,
    );
    dispositionValue = sampledForApproval ? "require_approval" : "eligible";
    reasonCode = sampledForApproval
      ? "autonomy_sampled_approval_required"
      : "autonomy_sample_not_selected";
  } else {
    dispositionValue = "eligible";
    reasonCode = "autonomy_eligible";
  }
  const decisionId = `autonomy:${digestAutonomyJsonV1(
    "decision-id",
    json({
      actionProposalDigest: input.actionProposalDigest,
      policyDigest: policy.policyDigest,
      segmentDigest: evidence.segmentDigest,
      stateRevision,
    }),
  ).slice("sha256:".length)}`;
  const body = {
    schemaVersion: 1 as const,
    decisionId,
    tenantId: input.tenantId,
    policyDomainId: input.policyDomainId,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    policyDigest: policy.policyDigest,
    segmentDigest: evidence.segmentDigest,
    actionType: input.actionType,
    actionProposalDigest: input.actionProposalDigest,
    stateRevision,
    level: state.level,
    disposition: dispositionValue,
    sampledForApproval,
    reasonCode,
    evidenceDigest: evidence.evidenceDigest,
    decidedAt: input.logicalTime,
  };
  return freeze({
    ...body,
    decisionDigest: digestAutonomyJsonV1("decision", json(body)),
  });
}

function unavailableDecision(
  input: AutonomyEvaluationInputV1,
  evidence: AutonomyEvidenceWindowV1,
  reasonCode: string,
): AutonomyDecisionV1 {
  const unresolvedPolicyDigest = digestAutonomyJsonV1(
    "unresolved-policy",
    json({
      tenantId: input.tenantId,
      policyDomainId: input.policyDomainId,
      policyId: input.policyId,
      policyVersion: input.policyVersion,
    }),
  );
  const body = {
    schemaVersion: 1 as const,
    decisionId: `autonomy-unavailable:${input.actionProposalDigest.slice("sha256:".length)}`,
    tenantId: input.tenantId,
    policyDomainId: input.policyDomainId,
    policyId: input.policyId,
    policyVersion: input.policyVersion,
    policyDigest: unresolvedPolicyDigest,
    segmentDigest: evidence.segmentDigest,
    actionType: input.actionType,
    actionProposalDigest: input.actionProposalDigest,
    stateRevision: null,
    level: null,
    disposition: "deny" as const,
    sampledForApproval: false,
    reasonCode,
    evidenceDigest: evidence.evidenceDigest,
    decidedAt: input.logicalTime,
  };
  return freeze({
    ...body,
    decisionDigest: digestAutonomyJsonV1("decision", json(body)),
  });
}

function historyFromDecision(
  decision: AutonomyDecisionV1,
): AutonomyDecisionHistoryV1 {
  return freeze({
    decisionId: decision.decisionId,
    actionProposalDigest: decision.actionProposalDigest,
    disposition: decision.disposition,
    level: decision.level!,
    reasonCode: decision.reasonCode,
    evidenceDigest: decision.evidenceDigest!,
    decidedAt: decision.decidedAt,
    decisionDigest: decision.decisionDigest,
  });
}

function freezeState(
  body: Omit<AutonomyStateV1, "stateDigest">,
): AutonomyStateV1 {
  return freeze({
    ...clone(body),
    stateDigest: digestAutonomyJsonV1("state", json(body)),
  });
}

function validatePolicyInput(input: AutonomyPolicyInputV1): void {
  exactKeys(input, policyInputKeys(input), "policy_input");
  required(input.tenantId, "tenantId");
  required(input.policyDomainId, "policyDomainId");
  required(input.policyId, "policyId");
  positive(input.policyVersion, "policyVersion");
  required(input.segmentNamespace, "segmentNamespace");
  if (!["blocked", "propose_only"].includes(input.initialLevel))
    fail("autonomy_initial_level_invalid");
  level(input.maximumLevel, "maximumLevel");
  if (levelIndex(input.maximumLevel) < levelIndex(input.initialLevel))
    fail("autonomy_maximum_level_narrows_initial");
  nonNegative(input.minimumConcludedOutcomes, "minimumConcludedOutcomes");
  basis(input.minimumPositiveBasisPoints, "minimumPositiveBasisPoints");
  basis(input.maximumNegativeBasisPoints, "maximumNegativeBasisPoints");
  basis(input.maximumCorrectedBasisPoints, "maximumCorrectedBasisPoints");
  basis(input.maximumUnresolvedBasisPoints, "maximumUnresolvedBasisPoints");
  positive(input.consecutiveHealthyWindows, "consecutiveHealthyWindows");
  duration(input.promotionCooldownMs, "promotionCooldownMs", true);
  basis(input.sampleApprovalBasisPoints, "sampleApprovalBasisPoints");
  if (
    !Array.isArray(input.criticalReasonCodes) ||
    input.criticalReasonCodes.length > 64 ||
    new Set(input.criticalReasonCodes).size !== input.criticalReasonCodes.length
  )
    fail("autonomy_critical_reason_codes_invalid");
  for (const reason of input.criticalReasonCodes)
    required(reason, "criticalReasonCode");
  if (
    [...input.criticalReasonCodes]
      .sort()
      .some((reason, index) => reason !== input.criticalReasonCodes[index])
  )
    fail("autonomy_critical_reason_codes_unsorted");
  level(input.criticalDegradationLevel, "criticalDegradationLevel");
  if (
    levelIndex(input.criticalDegradationLevel) > levelIndex(input.initialLevel)
  )
    fail("autonomy_critical_level_can_widen_initial");
  if (input.coverageFailureLevel) {
    level(input.coverageFailureLevel, "coverageFailureLevel");
    if (levelIndex(input.coverageFailureLevel) > levelIndex(input.initialLevel))
      fail("autonomy_coverage_level_can_widen_initial");
  }
  positive(input.maximumDecisionHistory, "maximumDecisionHistory");
  if (input.maximumDecisionHistory > 256)
    fail("autonomy_decision_history_limit_invalid");
}

function validateEvidenceInput(input: AutonomyEvidenceWindowInputV1): void {
  exactKeys(input, evidenceInputKeys, "evidence_input");
  required(input.tenantId, "tenantId");
  required(input.policyDomainId, "policyDomainId");
  required(input.segmentNamespace, "segmentNamespace");
  required(input.segmentKey, "segmentKey");
  required(input.actionType, "actionType");
  required(input.sourceId, "sourceId");
  nonNegative(input.sourceRevision, "sourceRevision");
  nonNegative(input.windowSequence, "windowSequence");
  timestamp(input.observedFrom, "observedFrom");
  timestamp(input.observedThrough, "observedThrough");
  if (input.observedFrom > input.observedThrough)
    fail("autonomy_evidence_window_time_invalid");
  if (
    !["healthy", "insufficient", "stale", "unavailable"].includes(
      input.coverageStatus,
    )
  )
    fail("autonomy_coverage_status_invalid");
  for (const [label, value] of Object.entries({
    eligibleTaskRuns: input.eligibleTaskRuns,
    concludedOutcomes: input.concludedOutcomes,
    positive: input.positive,
    negative: input.negative,
    corrected: input.corrected,
    inconclusive: input.inconclusive,
    unresolvedTaskRuns: input.unresolvedTaskRuns,
  }))
    nonNegative(value, label);
  if (
    input.concludedOutcomes !==
      input.positive + input.negative + input.corrected ||
    input.eligibleTaskRuns !==
      input.concludedOutcomes + input.unresolvedTaskRuns ||
    input.inconclusive > input.unresolvedTaskRuns
  )
    fail("autonomy_evidence_counts_inconsistent");
  if (!plainObject(input.reasonCounts)) fail("autonomy_reason_counts_invalid");
  let reasonTotal = 0;
  for (const [reason, count] of Object.entries(input.reasonCounts)) {
    required(reason, "reasonCode");
    nonNegative(count, "reasonCount");
    reasonTotal = checkedAdd(
      reasonTotal,
      count,
      "autonomy_reason_count_overflow",
    );
  }
  if (reasonTotal > input.concludedOutcomes)
    fail("autonomy_reason_counts_exceed_outcomes");
  if (input.cursor) validateCursor(input.cursor);
  if (
    !Array.isArray(input.evidenceReferenceIds) ||
    input.evidenceReferenceIds.length > 64 ||
    new Set(input.evidenceReferenceIds).size !==
      input.evidenceReferenceIds.length
  )
    fail("autonomy_evidence_references_invalid");
  for (const reference of input.evidenceReferenceIds)
    required(reference, "evidenceReferenceId");
}

function validateEvaluationInput(input: AutonomyEvaluationInputV1): void {
  required(input.tenantId, "tenantId");
  required(input.policyDomainId, "policyDomainId");
  required(input.policyId, "policyId");
  positive(input.policyVersion, "policyVersion");
  required(input.segmentNamespace, "segmentNamespace");
  required(input.segmentKey, "segmentKey");
  required(input.actionType, "actionType");
  digest(input.actionProposalDigest, "actionProposalDigest");
  timestamp(input.logicalTime, "logicalTime");
  if (input.metadata) json(input.metadata);
}

function assertPolicyEvidence(
  policy: AutonomyPolicyV1,
  evidence: AutonomyEvidenceWindowV1,
): void {
  if (
    policy.tenantId !== evidence.tenantId ||
    policy.policyDomainId !== evidence.policyDomainId ||
    policy.segmentNamespace !== evidence.segmentNamespace
  )
    fail("autonomy_policy_evidence_binding_mismatch");
}

function assertEvaluationEvidence(
  input: AutonomyEvaluationInputV1,
  evidence: AutonomyEvidenceWindowV1,
): void {
  if (
    input.tenantId !== evidence.tenantId ||
    input.policyDomainId !== evidence.policyDomainId ||
    input.segmentNamespace !== evidence.segmentNamespace ||
    input.segmentKey !== evidence.segmentKey ||
    input.actionType !== evidence.actionType
  )
    fail("autonomy_evaluation_evidence_binding_mismatch");
}

function assertStateBinding(
  state: AutonomyStateV1,
  policy: AutonomyPolicyV1,
  evidence: AutonomyEvidenceWindowV1,
  input: AutonomyEvaluationInputV1,
): void {
  if (
    state.tenantId !== input.tenantId ||
    state.policyDomainId !== input.policyDomainId ||
    state.policyId !== policy.policyId ||
    state.policyVersion !== policy.policyVersion ||
    state.policyDigest !== policy.policyDigest ||
    state.segmentDigest !== evidence.segmentDigest ||
    state.actionType !== input.actionType
  )
    fail("autonomy_state_binding_mismatch");
}

function sampled(
  action: AutonomyDigestV1,
  policy: AutonomyDigestV1,
  segment: AutonomyDigestV1,
  levelEpoch: number,
  basisPoints: number,
): boolean {
  if (basisPoints === 0) return false;
  if (basisPoints === 10_000) return true;
  const digestValue = digestAutonomyJsonV1(
    "sample",
    json({ action, policy, segment, levelEpoch }),
  );
  return (
    Number(BigInt(`0x${digestValue.slice(7, 23)}`) % 10_000n) < basisPoints
  );
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.ceil((numerator * 10_000) / denominator);
}

function narrower(
  left: AutonomyLevelV1,
  right: AutonomyLevelV1,
): AutonomyLevelV1 {
  return levels[Math.min(levelIndex(left), levelIndex(right))]!;
}

function levelIndex(value: AutonomyLevelV1): number {
  return levels.indexOf(value);
}

function level(
  value: unknown,
  label: string,
): asserts value is AutonomyLevelV1 {
  if (typeof value !== "string" || !levels.includes(value as AutonomyLevelV1))
    fail(`autonomy_${label}_invalid`);
}

function disposition(
  value: unknown,
): asserts value is AutonomyDecisionDispositionV1 {
  if (
    typeof value !== "string" ||
    !["deny", "proposal_only", "require_approval", "eligible"].includes(value)
  )
    fail("autonomy_disposition_invalid");
}

function validateCursor(cursor: AutonomyEvidenceCursorV1): void {
  exactKeys(cursor, ["recordedAt", "outcomeId"], "evidence_cursor");
  timestamp(cursor.recordedAt, "cursor.recordedAt");
  required(cursor.outcomeId, "cursor.outcomeId");
}

function validateHistory(input: AutonomyDecisionHistoryV1): void {
  exactKeys(
    input,
    [
      "decisionId",
      "actionProposalDigest",
      "disposition",
      "level",
      "reasonCode",
      "evidenceDigest",
      "decidedAt",
      "decisionDigest",
    ],
    "decision_history",
  );
  required(input.decisionId, "history.decisionId");
  digest(input.actionProposalDigest, "history.actionProposalDigest");
  disposition(input.disposition);
  level(input.level, "history.level");
  required(input.reasonCode, "history.reasonCode");
  digest(input.evidenceDigest, "history.evidenceDigest");
  timestamp(input.decidedAt, "history.decidedAt");
  digest(input.decisionDigest, "history.decisionDigest");
}

function policyKey(input: {
  tenantId: string;
  policyDomainId: string;
  policyId: string;
  policyVersion: number;
}): string {
  return `${input.tenantId}\0${input.policyDomainId}\0${input.policyId}\0${input.policyVersion}`;
}

function stateKey(input: {
  tenantId: string;
  policyDomainId: string;
  policyId: string;
  segmentDigest: AutonomyDigestV1;
  actionType: string;
}): string {
  return `${input.tenantId}\0${input.policyDomainId}\0${input.policyId}\0${input.segmentDigest}\0${input.actionType}`;
}

function policyInputKeys(input: { coverageFailureLevel?: unknown }): string[] {
  return [
    "tenantId",
    "policyDomainId",
    "policyId",
    "policyVersion",
    "segmentNamespace",
    "initialLevel",
    "maximumLevel",
    "minimumConcludedOutcomes",
    "minimumPositiveBasisPoints",
    "maximumNegativeBasisPoints",
    "maximumCorrectedBasisPoints",
    "maximumUnresolvedBasisPoints",
    "consecutiveHealthyWindows",
    "promotionCooldownMs",
    "sampleApprovalBasisPoints",
    "criticalReasonCodes",
    "criticalDegradationLevel",
    ...(input.coverageFailureLevel !== undefined
      ? ["coverageFailureLevel"]
      : []),
    "maximumDecisionHistory",
  ];
}

const evidenceInputKeys = [
  "tenantId",
  "policyDomainId",
  "segmentNamespace",
  "segmentKey",
  "actionType",
  "sourceId",
  "sourceRevision",
  "windowSequence",
  "observedFrom",
  "observedThrough",
  "coverageStatus",
  "eligibleTaskRuns",
  "concludedOutcomes",
  "positive",
  "negative",
  "corrected",
  "inconclusive",
  "unresolvedTaskRuns",
  "reasonCounts",
  "cursor",
  "evidenceReferenceIds",
];

function exactKeys(value: object, expected: string[], label: string): void {
  if (!plainObject(value)) fail(`autonomy_${label}_invalid`);
  const actual = Object.getOwnPropertyNames(value).sort();
  const keys = [...expected].sort();
  if (
    actual.length !== keys.length ||
    actual.some((key, index) => key !== keys[index])
  )
    fail(`autonomy_${label}_shape_invalid`);
}

function plainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (
    (prototype === Object.prototype || prototype === null) &&
    Object.getOwnPropertySymbols(value).length === 0
  );
}

function json(value: unknown): JsonValue {
  canonicalizeAutonomyJsonV1(value as JsonValue);
  return value as JsonValue;
}

function required(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 256 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    fail(`autonomy_${label}_invalid`);
}

function digest(
  value: unknown,
  label: string,
): asserts value is AutonomyDigestV1 {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    fail(`autonomy_${label}_invalid`);
}

function positive(value: unknown, label: string): void {
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    fail(`autonomy_${label}_invalid`);
}

function nonNegative(value: unknown, label: string): void {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    fail(`autonomy_${label}_invalid`);
}

function basis(value: unknown, label: string): void {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0 ||
    (value as number) > 10_000
  )
    fail(`autonomy_${label}_invalid`);
}

function duration(value: unknown, label: string, allowZero = false): void {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < (allowZero ? 0 : 1) ||
    (value as number) > 10 * 366 * 24 * 60 * 60 * 1_000
  )
    fail(`autonomy_${label}_invalid`);
}

function timestamp(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    fail(`autonomy_${label}_invalid`);
}

function checkedAdd(left: number, right: number, message: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) fail(message);
  return result;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function freeze<T>(value: T): T {
  return deepFreezeAutonomyV1(clone(value));
}

function fail(message: string): never {
  throw new AutonomyValidationErrorV1(message);
}
