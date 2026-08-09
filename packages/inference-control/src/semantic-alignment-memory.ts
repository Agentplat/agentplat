import type { JsonValue } from "@agentplat/core";
import {
  SEMANTIC_ALIGNMENT_AGILITY_STATE_FORMAT_V1,
  type SemanticActionAuthorizationAuthorityV1,
  type SemanticActionAuthorizationClaimsV1,
  type SemanticActionAuthorizationV1,
  type SemanticControlMonotonicAnchorV1,
  type SemanticControlPolicyV1,
  type SemanticControlStateStoreV1,
  type SemanticControlStateV1,
} from "./semantic-alignment-contracts.js";
import {
  createSemanticActionAuthorizationClaimsV1,
  digestSemanticControlV1,
  validateSemanticActionAuthorizationClaimsV1,
  validateSemanticActionAuthorizationV1,
  validateSemanticControlDecisionV1,
} from "./semantic-alignment-validation.js";
import { assertDigest, assertIdentifier, assertSafeInteger, deepFreeze } from "./validation.js";

export function createSemanticControlStateV1(input: {
  readonly stateKey: string;
  readonly bindingDigest: string;
  readonly policyDigest: string;
  readonly assessorSetDigest: string;
}): SemanticControlStateV1 {
  assertIdentifier(input.stateKey, "stateKey");
  assertDigest(input.bindingDigest, "bindingDigest");
  assertDigest(input.policyDigest, "policyDigest");
  assertDigest(input.assessorSetDigest, "assessorSetDigest");
  const body = deepFreeze({
    format: SEMANTIC_ALIGNMENT_AGILITY_STATE_FORMAT_V1,
    schemaVersion: 1 as const,
    ...input,
    revision: 0,
    sequenceHighWater: 0,
    logicalTimeHighWaterMs: 0,
    courseActionHistory: [] as readonly string[],
    recentDecisions: [],
    lastDecision: null,
    predecessorStateDigest: null,
  });
  return deepFreeze({
    ...body,
    stateDigest: digestSemanticControlV1("state", body as unknown as JsonValue),
  });
}

export function validateSemanticControlStateV1(
  state: SemanticControlStateV1,
  expected: {
    readonly stateKey: string;
    readonly bindingDigest: string;
    readonly policyDigest: string;
    readonly assessorSetDigest: string;
    readonly policy: SemanticControlPolicyV1;
  },
): SemanticControlStateV1 {
  if (
    state.format !== SEMANTIC_ALIGNMENT_AGILITY_STATE_FORMAT_V1 ||
    state.schemaVersion !== 1 ||
    state.stateKey !== expected.stateKey ||
    state.bindingDigest !== expected.bindingDigest ||
    state.policyDigest !== expected.policyDigest ||
    state.assessorSetDigest !== expected.assessorSetDigest
  ) throw new TypeError("semantic_state_binding_invalid");
  assertSafeInteger(state.revision, "revision");
  assertSafeInteger(state.sequenceHighWater, "sequenceHighWater");
  assertSafeInteger(state.logicalTimeHighWaterMs, "logicalTimeHighWaterMs");
  if (state.courseActionHistory.length > expected.policy.limits.maximumCourseActionHistory)
    throw new TypeError("semantic_state_history_bound_exceeded");
  if (state.recentDecisions.length > expected.policy.limits.maximumRetainedDecisions)
    throw new TypeError("semantic_state_decision_bound_exceeded");
  for (const digest of state.courseActionHistory) assertDigest(digest, "courseActionHistory");
  for (const record of state.recentDecisions) {
    assertDigest(record.requestDigest, "record.requestDigest");
    assertDigest(record.aggregateAssessmentDigest, "record.aggregateAssessmentDigest");
    assertDigest(record.decisionDigest, "record.decisionDigest");
    assertSafeInteger(record.sequence, "record.sequence", 1);
  }
  if (state.predecessorStateDigest !== null)
    assertDigest(state.predecessorStateDigest, "predecessorStateDigest");
  if (state.lastDecision !== null) {
    validateSemanticControlDecisionV1(state.lastDecision);
    if (state.lastDecision.committedStateRevision !== state.revision)
      throw new TypeError("semantic_state_last_decision_revision_invalid");
  } else if (state.revision !== 0)
    throw new TypeError("semantic_state_last_decision_missing");
  const { stateDigest, ...body } = state;
  assertDigest(stateDigest, "stateDigest");
  if (digestSemanticControlV1("state", body as unknown as JsonValue) !== stateDigest)
    throw new TypeError("semantic_state_digest_invalid");
  return deepFreeze(state);
}

export class InMemorySemanticControlStateStoreV1
  implements SemanticControlStateStoreV1, SemanticControlMonotonicAnchorV1
{
  private readonly states = new Map<string, SemanticControlStateV1>();
  private readonly anchors = new Map<
    string,
    {
      readonly revision: number;
      readonly sequenceHighWater: number;
      readonly logicalTimeHighWaterMs: number;
      readonly stateDigest: string;
    }
  >();

  async load(stateKey: string): Promise<SemanticControlStateV1 | null> {
    return this.states.get(stateKey) ?? null;
  }

  async readAnchor(stateKey: string) {
    return this.anchors.get(stateKey) ?? null;
  }

  async save(input: {
    readonly state: SemanticControlStateV1;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: string | null;
  }): Promise<boolean> {
    const prior = this.states.get(input.state.stateKey) ?? null;
    if (
      (prior?.revision ?? null) !== input.expectedRevision ||
      (prior?.stateDigest ?? null) !== input.expectedStateDigest
    ) return false;
    this.states.set(input.state.stateKey, deepFreeze(input.state));
    this.anchors.set(input.state.stateKey, deepFreeze({
      revision: input.state.revision,
      sequenceHighWater: input.state.sequenceHighWater,
      logicalTimeHighWaterMs: input.state.logicalTimeHighWaterMs,
      stateDigest: input.state.stateDigest,
    }));
    return true;
  }
}

/**
 * Process-local authenticated lookup for development and tests. Production
 * deployments should replace it with a durable signed or MAC-authenticated
 * receipt service while preserving identical lookup semantics.
 */
export class InMemorySemanticActionAuthorizationAuthorityV1
  implements SemanticActionAuthorizationAuthorityV1
{
  private readonly records = new Map<string, SemanticActionAuthorizationV1>();

  constructor(
    readonly issuerId: string,
    readonly issuerKeyDigest: string,
  ) {
    assertIdentifier(issuerId, "issuerId");
    assertDigest(issuerKeyDigest, "issuerKeyDigest");
  }

  async issue(
    raw: SemanticActionAuthorizationClaimsV1,
  ): Promise<SemanticActionAuthorizationV1> {
    const claims = validateSemanticActionAuthorizationClaimsV1(raw);
    const existing = this.records.get(claims.authorizationId);
    if (existing) {
      if (existing.claims.claimsDigest !== claims.claimsDigest)
        throw new TypeError("semantic_action_authorization_id_conflict");
      return existing;
    }
    const receiptBody = deepFreeze({
      schemaVersion: 1 as const,
      authorizationId: claims.authorizationId,
      claimsDigest: claims.claimsDigest,
      issuerId: this.issuerId,
      issuerKeyDigest: this.issuerKeyDigest,
    });
    const authorization = validateSemanticActionAuthorizationV1({
      schemaVersion: 1,
      claims,
      issuerId: this.issuerId,
      issuerKeyDigest: this.issuerKeyDigest,
      authorizationDigest: digestSemanticControlV1(
        "action-authorization",
        receiptBody as unknown as JsonValue,
      ),
    }, this);
    this.records.set(claims.authorizationId, authorization);
    return authorization;
  }

  async lookupAndVerify(input: {
    readonly authorizationId: string;
    readonly authorizationDigest?: string;
    readonly expectedClaimsDigest?: string;
    readonly effectConsumerDigest: string;
    readonly sinkId: string;
    readonly sinkKeyDigest: string;
    readonly currentLogicalTimeMs: number;
    readonly currentStateRevision: number;
  }): Promise<SemanticActionAuthorizationV1 | null> {
    assertIdentifier(input.authorizationId, "authorizationId");
    if (input.authorizationDigest !== undefined)
      assertDigest(input.authorizationDigest, "authorizationDigest");
    if (input.expectedClaimsDigest !== undefined)
      assertDigest(input.expectedClaimsDigest, "expectedClaimsDigest");
    assertDigest(input.effectConsumerDigest, "effectConsumerDigest");
    assertIdentifier(input.sinkId, "sinkId");
    assertDigest(input.sinkKeyDigest, "sinkKeyDigest");
    assertSafeInteger(input.currentLogicalTimeMs, "currentLogicalTimeMs");
    assertSafeInteger(input.currentStateRevision, "currentStateRevision");
    const authorization = this.records.get(input.authorizationId);
    if (!authorization) return null;
    const claims = createSemanticActionAuthorizationClaimsV1(
      stripClaimsDigest(authorization.claims),
    );
    const receiptBody = deepFreeze({
      schemaVersion: 1 as const,
      authorizationId: claims.authorizationId,
      claimsDigest: claims.claimsDigest,
      issuerId: authorization.issuerId,
      issuerKeyDigest: authorization.issuerKeyDigest,
    });
    const expectedAuthorizationDigest = digestSemanticControlV1(
      "action-authorization",
      receiptBody as unknown as JsonValue,
    );
    if (
      authorization.authorizationDigest !== expectedAuthorizationDigest ||
      (input.authorizationDigest !== undefined &&
        input.authorizationDigest !== authorization.authorizationDigest) ||
      (input.expectedClaimsDigest !== undefined &&
        input.expectedClaimsDigest !== claims.claimsDigest) ||
      claims.effectConsumerDigest !== input.effectConsumerDigest ||
      claims.sinkId !== input.sinkId ||
      claims.sinkKeyDigest !== input.sinkKeyDigest ||
      input.currentLogicalTimeMs < claims.validFromLogicalTimeMs ||
      input.currentLogicalTimeMs > claims.validUntilLogicalTimeMs ||
      input.currentStateRevision < claims.committedStateRevision
    ) return null;
    return validateSemanticActionAuthorizationV1(authorization, this);
  }
}

function stripClaimsDigest(
  claims: SemanticActionAuthorizationClaimsV1,
): Omit<SemanticActionAuthorizationClaimsV1, "claimsDigest"> {
  const { claimsDigest: _ignored, ...body } = claims;
  return body;
}
