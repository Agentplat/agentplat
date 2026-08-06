import type { JsonValue } from "@agentplat/core";
import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";

import {
  CAPABILITY_STATE_DIMENSIONS_V1,
  CAPABILITY_STATE_OPERATIONS_V1,
  CAPABILITY_STATE_SCHEMA_VERSION_V1,
  CAPABILITY_STATE_SNAPSHOT_FORMAT_V1,
  type CapabilityStateCandidateDecisionV1,
  type CapabilityStateCandidateV1,
  type CapabilityStateDimensionRequirementsV1,
  type CapabilityStateDimensionV1,
  type CapabilityStateDispositionV1,
  type CapabilityStateFusionDecisionV1,
  type CapabilityStateFusionPortV1,
  type CapabilityStateFusionRequestV1,
  type CapabilityStateFusionRuntimeOptionsV1,
  type CapabilityStateFusionScopeV1,
  type CapabilityStateFusionStateV1,
  type CapabilityStateHeadV1,
  type CapabilityStateOperationV1,
  type CapabilityStatePolicyRecordV1,
  type CapabilityStatePolicyV1,
  type CapabilityStateReductionInputV1,
  type CapabilityStateReductionResultV1,
  type CapabilityStateResolutionPortV1,
  type CapabilityStateSignalSourceV1,
  type CapabilityStateSignalV1,
  type CapabilityStateStoreV1,
} from "./capability-state-contracts.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@-]*$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const MAXIMUM_IDENTIFIER_LENGTH = 256;
const MAXIMUM_CAPABILITY_KEYS = 128;
const MAXIMUM_REASON_CODE_LENGTH = 128;
const operationSet = new Set<string>(CAPABILITY_STATE_OPERATIONS_V1);
const dimensionSet = new Set<string>(CAPABILITY_STATE_DIMENSIONS_V1);
const dispositionSet = new Set<string>([
  "eligible",
  "restricted",
  "ineligible",
  "unavailable",
]);

const policyKeys = [
  "maximumCandidates",
  "maximumCommitAttempts",
  "maximumDecisionTtlMs",
  "maximumReasonCodesPerSignal",
  "maximumStateHeads",
  "parentPolicyDigest",
  "policyId",
  "policyVersion",
  "requiredDimensions",
  "schemaVersion",
];

const policyRecordKeys = ["policy", "policyDigest", "schemaVersion"];
const candidateKeys = [
  "advertisedCapabilityKeys",
  "agentId",
  "candidateDigest",
  "candidateId",
  "instanceId",
  "kind",
  "peerId",
  "requiredCapabilityKeys",
  "schemaVersion",
  "sourceEvidenceDigest",
  "sourceRecordId",
  "sourceRevision",
];
const scopeKeys = [
  "meshId",
  "missionIntentId",
  "objectiveId",
  "policyDomainId",
  "tenantId",
  "workItemId",
  "workItemRevision",
];
const requestKeys = [
  "candidates",
  "logicalTimeMs",
  "operation",
  "requestDigest",
  "requestId",
  "requiredCapabilityKeys",
  "schemaVersion",
  "scope",
];
const signalKeys = [
  "candidateDigest",
  "candidateId",
  "dimension",
  "disposition",
  "expiresAtLogicalMs",
  "observedAtLogicalMs",
  "reasonCodes",
  "schemaVersion",
  "signalDigest",
  "signalId",
  "sourceId",
  "sourceImplementationDigest",
  "sourceRevision",
  "sourceVersion",
];
const headKeys = [
  "candidateId",
  "dimension",
  "expiresAtLogicalMs",
  "headKey",
  "schemaVersion",
  "signalDigest",
  "sourceId",
  "sourceImplementationDigest",
  "sourceRevision",
  "sourceVersion",
];
const stateKeys = [
  "format",
  "fusionId",
  "fusionVersion",
  "heads",
  "implementationId",
  "lastDecisionDigest",
  "logicalTimeHighWaterMs",
  "policyDigest",
  "policyId",
  "policyVersion",
  "revision",
  "schemaVersion",
  "stateDigest",
  "stateKey",
];
const candidateDecisionKeys = [
  "candidateDigest",
  "candidateId",
  "disposition",
  "reasonCodes",
  "schemaVersion",
  "signalDigests",
];
const decisionKeys = [
  "candidates",
  "committedStateRevision",
  "decisionDigest",
  "decisionId",
  "evaluatedAtLogicalMs",
  "expiresAtLogicalMs",
  "fusionId",
  "fusionVersion",
  "implementationId",
  "operation",
  "policyDigest",
  "policyId",
  "policyVersion",
  "priorStateRevision",
  "requestDigest",
  "requestId",
  "schemaVersion",
];

export function createCapabilityStatePolicyV1(
  input: CapabilityStatePolicyV1,
): CapabilityStatePolicyRecordV1 {
  const policy = normalizePolicy(input);
  return freeze({
    schemaVersion: CAPABILITY_STATE_SCHEMA_VERSION_V1,
    policy,
    policyDigest: digest("capability-state-policy", policy),
  });
}

export function validateCapabilityStatePolicyV1(
  input: unknown,
): CapabilityStatePolicyRecordV1 {
  const value = record(
    input,
    policyRecordKeys,
    "capability state policy record",
  );
  if (value.schemaVersion !== CAPABILITY_STATE_SCHEMA_VERSION_V1)
    fail("capability state policy schema is invalid");
  const rebuilt = createCapabilityStatePolicyV1(
    value.policy as unknown as CapabilityStatePolicyV1,
  );
  if (value.policyDigest !== rebuilt.policyDigest)
    fail("capability state policy digest is invalid");
  return rebuilt;
}

export function createCapabilityStateCandidateV1(
  input: Omit<CapabilityStateCandidateV1, "candidateDigest">,
): CapabilityStateCandidateV1 {
  const value = record(
    input,
    candidateKeys.filter((key) => key !== "candidateDigest"),
    "capability state candidate input",
  );
  if (value.schemaVersion !== CAPABILITY_STATE_SCHEMA_VERSION_V1)
    fail("capability state candidate schema is invalid");
  const kind = oneOf(value.kind, ["peer", "local_agent"], "candidate kind");
  const candidateId = identifier(value.candidateId, "candidateId");
  const peerId = identifier(value.peerId, "candidate.peerId");
  const instanceId = identifier(value.instanceId, "candidate.instanceId");
  const agentId = nullableIdentifier(value.agentId, "candidate.agentId");
  if (
    (kind === "peer" && agentId !== null) ||
    (kind === "local_agent" && !agentId)
  )
    fail("candidate kind and agent identity are inconsistent");
  const requiredCapabilityKeys = tokens(
    value.requiredCapabilityKeys,
    "candidate.requiredCapabilityKeys",
    MAXIMUM_CAPABILITY_KEYS,
  );
  const advertisedCapabilityKeys = tokens(
    value.advertisedCapabilityKeys,
    "candidate.advertisedCapabilityKeys",
    MAXIMUM_CAPABILITY_KEYS,
  );
  if (
    requiredCapabilityKeys.some(
      (capabilityKey) => !advertisedCapabilityKeys.includes(capabilityKey),
    )
  )
    fail("candidate does not advertise every required capability");
  const body = {
    schemaVersion: CAPABILITY_STATE_SCHEMA_VERSION_V1,
    candidateId,
    kind,
    peerId,
    instanceId,
    agentId,
    requiredCapabilityKeys,
    advertisedCapabilityKeys,
    sourceEvidenceDigest: planningDigest(
      value.sourceEvidenceDigest,
      "candidate.sourceEvidenceDigest",
    ),
    sourceRecordId: nullableIdentifier(
      value.sourceRecordId,
      "candidate.sourceRecordId",
    ),
    sourceRevision: nonNegative(
      value.sourceRevision,
      "candidate.sourceRevision",
    ),
  } satisfies Omit<CapabilityStateCandidateV1, "candidateDigest">;
  return freeze({
    ...body,
    candidateDigest: digest("capability-state-candidate", body),
  });
}

export function validateCapabilityStateCandidateV1(
  input: unknown,
): CapabilityStateCandidateV1 {
  const value = record(input, candidateKeys, "capability state candidate");
  const { candidateDigest, ...body } = value;
  const rebuilt = createCapabilityStateCandidateV1(
    body as unknown as Omit<CapabilityStateCandidateV1, "candidateDigest">,
  );
  if (candidateDigest !== rebuilt.candidateDigest)
    fail("capability state candidate digest is invalid");
  return rebuilt;
}

export function createCapabilityStateFusionRequestV1(
  input: Omit<CapabilityStateFusionRequestV1, "requestDigest">,
): CapabilityStateFusionRequestV1 {
  const value = record(
    input,
    requestKeys.filter((key) => key !== "requestDigest"),
    "capability state request input",
  );
  if (value.schemaVersion !== CAPABILITY_STATE_SCHEMA_VERSION_V1)
    fail("capability state request schema is invalid");
  const requestOperation = operation(value.operation);
  const scope = normalizeScope(value.scope);
  const logicalTimeMs = nonNegative(
    value.logicalTimeMs,
    "request.logicalTimeMs",
  );
  const requiredCapabilityKeys = tokens(
    value.requiredCapabilityKeys,
    "request.requiredCapabilityKeys",
    MAXIMUM_CAPABILITY_KEYS,
  );
  if (
    !Array.isArray(value.candidates) ||
    value.candidates.length < 1 ||
    value.candidates.length > 256
  )
    fail("capability state request candidates are invalid");
  const candidates = value.candidates.map(validateCapabilityStateCandidateV1);
  assertSortedUnique(
    candidates.map(({ candidateId }) => candidateId),
    "candidate IDs",
  );
  for (const candidate of candidates)
    if (!same(candidate.requiredCapabilityKeys, requiredCapabilityKeys))
      fail("candidate required capabilities do not match the request");
  const body = {
    schemaVersion: CAPABILITY_STATE_SCHEMA_VERSION_V1,
    requestId: identifier(value.requestId, "request.requestId"),
    operation: requestOperation,
    scope,
    logicalTimeMs,
    requiredCapabilityKeys,
    candidates: freeze(candidates),
  } satisfies Omit<CapabilityStateFusionRequestV1, "requestDigest">;
  return freeze({
    ...body,
    requestDigest: digest("capability-state-request", body),
  });
}

export function validateCapabilityStateFusionRequestV1(
  input: unknown,
): CapabilityStateFusionRequestV1 {
  const value = record(input, requestKeys, "capability state request");
  const { requestDigest, ...body } = value;
  const rebuilt = createCapabilityStateFusionRequestV1(
    body as unknown as Omit<CapabilityStateFusionRequestV1, "requestDigest">,
  );
  if (requestDigest !== rebuilt.requestDigest)
    fail("capability state request digest is invalid");
  return rebuilt;
}

export function createCapabilityStateSignalV1(
  input: Omit<CapabilityStateSignalV1, "signalDigest">,
): CapabilityStateSignalV1 {
  const value = record(
    input,
    signalKeys.filter((key) => key !== "signalDigest"),
    "capability state signal input",
  );
  if (value.schemaVersion !== CAPABILITY_STATE_SCHEMA_VERSION_V1)
    fail("capability state signal schema is invalid");
  const observedAtLogicalMs = nonNegative(
    value.observedAtLogicalMs,
    "signal.observedAtLogicalMs",
  );
  const expiresAtLogicalMs = positive(
    value.expiresAtLogicalMs,
    "signal.expiresAtLogicalMs",
  );
  if (expiresAtLogicalMs <= observedAtLogicalMs)
    fail("capability state signal validity window is empty");
  const body = {
    schemaVersion: CAPABILITY_STATE_SCHEMA_VERSION_V1,
    signalId: identifier(value.signalId, "signal.signalId"),
    candidateId: identifier(value.candidateId, "signal.candidateId"),
    candidateDigest: planningDigest(
      value.candidateDigest,
      "signal.candidateDigest",
    ),
    dimension: dimension(value.dimension),
    disposition: disposition(value.disposition),
    sourceId: identifier(value.sourceId, "signal.sourceId"),
    sourceVersion: positive(value.sourceVersion, "signal.sourceVersion"),
    sourceImplementationDigest: planningDigest(
      value.sourceImplementationDigest,
      "signal.sourceImplementationDigest",
    ),
    sourceRevision: nonNegative(value.sourceRevision, "signal.sourceRevision"),
    reasonCodes: reasonCodes(value.reasonCodes, 32),
    observedAtLogicalMs,
    expiresAtLogicalMs,
  } satisfies Omit<CapabilityStateSignalV1, "signalDigest">;
  return freeze({
    ...body,
    signalDigest: digest("capability-state-signal", body),
  });
}

export function validateCapabilityStateSignalV1(
  input: unknown,
): CapabilityStateSignalV1 {
  const value = record(input, signalKeys, "capability state signal");
  const { signalDigest, ...body } = value;
  const rebuilt = createCapabilityStateSignalV1(
    body as unknown as Omit<CapabilityStateSignalV1, "signalDigest">,
  );
  if (signalDigest !== rebuilt.signalDigest)
    fail("capability state signal digest is invalid");
  return rebuilt;
}

export function createCapabilityStateFusionStateV1(input: {
  readonly stateKey: string;
  readonly fusionId: string;
  readonly fusionVersion: number;
  readonly implementationId: string;
  readonly policy: CapabilityStatePolicyRecordV1;
  readonly revision?: number;
  readonly logicalTimeHighWaterMs?: number;
  readonly heads?: readonly CapabilityStateHeadV1[];
  readonly lastDecisionDigest?: PlanningDigestV1 | null;
}): CapabilityStateFusionStateV1 {
  const policy = validateCapabilityStatePolicyV1(input.policy);
  const heads = normalizeHeads(input.heads ?? []);
  if (heads.length > policy.policy.maximumStateHeads)
    fail("capability state head capacity is exceeded");
  const body = {
    format: CAPABILITY_STATE_SNAPSHOT_FORMAT_V1,
    schemaVersion: CAPABILITY_STATE_SCHEMA_VERSION_V1,
    stateKey: identifier(input.stateKey, "state.stateKey"),
    fusionId: identifier(input.fusionId, "state.fusionId"),
    fusionVersion: positive(input.fusionVersion, "state.fusionVersion"),
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
    heads,
    lastDecisionDigest:
      input.lastDecisionDigest === undefined ||
      input.lastDecisionDigest === null
        ? null
        : planningDigest(input.lastDecisionDigest, "state.lastDecisionDigest"),
  } satisfies Omit<CapabilityStateFusionStateV1, "stateDigest">;
  return freeze({
    ...body,
    stateDigest: digest("capability-state-state", body),
  });
}

export function validateCapabilityStateFusionStateV1(
  input: unknown,
  policyValue: CapabilityStatePolicyRecordV1,
): CapabilityStateFusionStateV1 {
  const value = record(input, stateKeys, "capability state fusion state");
  if (
    value.format !== CAPABILITY_STATE_SNAPSHOT_FORMAT_V1 ||
    value.schemaVersion !== CAPABILITY_STATE_SCHEMA_VERSION_V1
  )
    fail("capability state snapshot format is invalid");
  const policy = validateCapabilityStatePolicyV1(policyValue);
  const rebuilt = createCapabilityStateFusionStateV1({
    stateKey: value.stateKey as string,
    fusionId: value.fusionId as string,
    fusionVersion: value.fusionVersion as number,
    implementationId: value.implementationId as string,
    policy,
    revision: value.revision as number,
    logicalTimeHighWaterMs: value.logicalTimeHighWaterMs as number,
    heads: value.heads as unknown as readonly CapabilityStateHeadV1[],
    lastDecisionDigest: value.lastDecisionDigest as PlanningDigestV1 | null,
  });
  if (
    value.policyId !== rebuilt.policyId ||
    value.policyVersion !== rebuilt.policyVersion ||
    value.policyDigest !== rebuilt.policyDigest ||
    value.stateDigest !== rebuilt.stateDigest
  )
    fail("capability state snapshot binding is invalid");
  return rebuilt;
}

export function reduceCapabilityStateFusionV1(
  input: CapabilityStateReductionInputV1,
): CapabilityStateReductionResultV1 {
  const policy = validateCapabilityStatePolicyV1(input.policy);
  const state = validateCapabilityStateFusionStateV1(input.state, policy);
  const request = validateCapabilityStateFusionRequestV1(input.request);
  assertStatePolicyBinding(state, policy);
  if (request.candidates.length > policy.policy.maximumCandidates)
    fail("capability state request exceeds policy candidate limit");

  const requiredDimensions =
    policy.policy.requiredDimensions[request.operation];
  const provided = normalizeSignals(
    input.signals,
    policy.policy.maximumReasonCodesPerSignal,
  );
  const signalsByCandidate = new Map<string, CapabilityStateSignalV1[]>();
  for (const signal of provided) {
    const candidate = request.candidates.find(
      ({ candidateId }) => candidateId === signal.candidateId,
    );
    if (!candidate || candidate.candidateDigest !== signal.candidateDigest)
      fail("capability state signal is outside the request candidate set");
    if (!requiredDimensions.includes(signal.dimension))
      fail(
        "capability state signal dimension is not required by the operation",
      );
    const list = signalsByCandidate.get(signal.candidateId) ?? [];
    if (list.some(({ dimension: current }) => current === signal.dimension))
      fail("capability state candidate dimension is duplicated");
    list.push(signal);
    signalsByCandidate.set(signal.candidateId, list);
  }

  const rollback = request.logicalTimeMs < state.logicalTimeHighWaterMs;
  const headMap = new Map(state.heads.map((head) => [head.headKey, head]));
  const candidateDecisions: CapabilityStateCandidateDecisionV1[] = [];
  for (const candidate of request.candidates) {
    const signals = (signalsByCandidate.get(candidate.candidateId) ?? []).sort(
      signalOrder,
    );
    const reasons = new Set<string>();
    let effective: CapabilityStateDispositionV1 = "eligible";
    const acceptedSignalDigests: PlanningDigestV1[] = [];
    if (rollback) {
      effective = "unavailable";
      reasons.add("logical_time_rollback");
    } else {
      for (const requiredDimension of requiredDimensions) {
        const signal = signals.find(
          ({ dimension: current }) => current === requiredDimension,
        );
        if (!signal) {
          effective = combineDisposition(effective, "unavailable");
          reasons.add(`signal_missing:${requiredDimension}`);
          continue;
        }
        const validity = validateSignalAt(signal, request.logicalTimeMs);
        if (validity) {
          effective = combineDisposition(effective, "unavailable");
          reasons.add(validity);
          continue;
        }
        const key = capabilityStateHeadKeyV1(signal);
        const prior = headMap.get(key);
        if (prior && signal.sourceRevision < prior.sourceRevision) {
          effective = combineDisposition(effective, "unavailable");
          reasons.add(`signal_revision_rollback:${requiredDimension}`);
          continue;
        }
        if (
          prior &&
          signal.sourceRevision === prior.sourceRevision &&
          signal.signalDigest !== prior.signalDigest
        ) {
          effective = combineDisposition(effective, "ineligible");
          reasons.add(`signal_equivocation:${requiredDimension}`);
          continue;
        }
        const nextHead = headFromSignal(signal);
        if (!prior && headMap.size >= policy.policy.maximumStateHeads) {
          effective = combineDisposition(effective, "unavailable");
          reasons.add("state_capacity_exceeded");
          continue;
        }
        headMap.set(key, nextHead);
        effective = combineDisposition(effective, signal.disposition);
        for (const reasonCode of signal.reasonCodes) reasons.add(reasonCode);
        acceptedSignalDigests.push(signal.signalDigest);
      }
    }
    if (effective === "eligible")
      reasons.add("all_required_dimensions_eligible");
    candidateDecisions.push(
      freeze({
        schemaVersion: CAPABILITY_STATE_SCHEMA_VERSION_V1,
        candidateId: candidate.candidateId,
        candidateDigest: candidate.candidateDigest,
        disposition: effective,
        reasonCodes: freeze([...reasons].sort(compare)),
        signalDigests: freeze(acceptedSignalDigests.sort(compare)),
      }),
    );
  }

  const priorStateRevision = state.revision;
  const committedStateRevision = priorStateRevision + 1;
  const evaluatedAtLogicalMs = request.logicalTimeMs;
  const expiresAtLogicalMs = Math.min(
    request.logicalTimeMs + policy.policy.maximumDecisionTtlMs,
    minimumDecisionExpiry(
      request,
      provided,
      requiredDimensions,
      request.logicalTimeMs,
    ),
  );
  const decisionBody = {
    schemaVersion: CAPABILITY_STATE_SCHEMA_VERSION_V1,
    fusionId: state.fusionId,
    fusionVersion: state.fusionVersion,
    implementationId: state.implementationId,
    policyId: policy.policy.policyId,
    policyVersion: policy.policy.policyVersion,
    policyDigest: policy.policyDigest,
    requestId: request.requestId,
    requestDigest: request.requestDigest,
    operation: request.operation,
    evaluatedAtLogicalMs,
    expiresAtLogicalMs,
    priorStateRevision,
    committedStateRevision,
    candidates: freeze(candidateDecisions),
  } satisfies Omit<
    CapabilityStateFusionDecisionV1,
    "decisionId" | "decisionDigest"
  >;
  const decisionDigest = digest("capability-state-decision", decisionBody);
  const decision = freeze({
    ...decisionBody,
    decisionId: `capability-state-decision.${decisionDigest.slice(7)}`,
    decisionDigest,
  });
  const nextState = createCapabilityStateFusionStateV1({
    stateKey: state.stateKey,
    fusionId: state.fusionId,
    fusionVersion: state.fusionVersion,
    implementationId: state.implementationId,
    policy,
    revision: committedStateRevision,
    logicalTimeHighWaterMs: Math.max(
      state.logicalTimeHighWaterMs,
      request.logicalTimeMs,
    ),
    heads: freeze([...headMap.values()].sort(headOrder)),
    lastDecisionDigest: decisionDigest,
  });
  return freeze({ state: nextState, decision });
}

export function validateCapabilityStateFusionDecisionV1(input: {
  readonly decision: unknown;
  readonly request: CapabilityStateFusionRequestV1;
  readonly expected: Pick<
    CapabilityStateFusionPortV1,
    | "fusionId"
    | "fusionVersion"
    | "implementationId"
    | "policyId"
    | "policyVersion"
    | "policyDigest"
  >;
  readonly logicalTimeMs: number;
}): CapabilityStateFusionDecisionV1 {
  const request = validateCapabilityStateFusionRequestV1(input.request);
  const value = record(
    input.decision,
    decisionKeys,
    "capability state decision",
  );
  if (value.schemaVersion !== CAPABILITY_STATE_SCHEMA_VERSION_V1)
    fail("capability state decision schema is invalid");
  if (
    !Array.isArray(value.candidates) ||
    value.candidates.length !== request.candidates.length
  )
    fail("capability state decision candidate coverage is invalid");
  const candidates = value.candidates.map((candidateValue, index) => {
    const candidate = record(
      candidateValue,
      candidateDecisionKeys,
      "capability state candidate decision",
    );
    const requested = request.candidates[index];
    if (
      candidate.schemaVersion !== CAPABILITY_STATE_SCHEMA_VERSION_V1 ||
      candidate.candidateId !== requested?.candidateId ||
      candidate.candidateDigest !== requested.candidateDigest
    )
      fail("capability state decision candidate binding is invalid");
    return freeze({
      schemaVersion: CAPABILITY_STATE_SCHEMA_VERSION_V1,
      candidateId: identifier(candidate.candidateId, "decision.candidateId"),
      candidateDigest: planningDigest(
        candidate.candidateDigest,
        "decision.candidateDigest",
      ),
      disposition: disposition(candidate.disposition),
      reasonCodes: reasonCodes(candidate.reasonCodes, 64),
      signalDigests: digestArray(
        candidate.signalDigests,
        "decision.signalDigests",
      ),
    });
  });
  const expected = input.expected;
  const body = {
    schemaVersion: CAPABILITY_STATE_SCHEMA_VERSION_V1,
    fusionId: identifier(value.fusionId, "decision.fusionId"),
    fusionVersion: positive(value.fusionVersion, "decision.fusionVersion"),
    implementationId: identifier(
      value.implementationId,
      "decision.implementationId",
    ),
    policyId: identifier(value.policyId, "decision.policyId"),
    policyVersion: positive(value.policyVersion, "decision.policyVersion"),
    policyDigest: planningDigest(value.policyDigest, "decision.policyDigest"),
    requestId: identifier(value.requestId, "decision.requestId"),
    requestDigest: planningDigest(
      value.requestDigest,
      "decision.requestDigest",
    ),
    operation: operation(value.operation),
    evaluatedAtLogicalMs: nonNegative(
      value.evaluatedAtLogicalMs,
      "decision.evaluatedAtLogicalMs",
    ),
    expiresAtLogicalMs: positive(
      value.expiresAtLogicalMs,
      "decision.expiresAtLogicalMs",
    ),
    priorStateRevision: nonNegative(
      value.priorStateRevision,
      "decision.priorStateRevision",
    ),
    committedStateRevision: positive(
      value.committedStateRevision,
      "decision.committedStateRevision",
    ),
    candidates: freeze(candidates),
  } satisfies Omit<
    CapabilityStateFusionDecisionV1,
    "decisionId" | "decisionDigest"
  >;
  const decisionDigest = digest("capability-state-decision", body);
  const decisionId = `capability-state-decision.${decisionDigest.slice(7)}`;
  if (
    value.decisionId !== decisionId ||
    value.decisionDigest !== decisionDigest ||
    body.fusionId !== expected.fusionId ||
    body.fusionVersion !== expected.fusionVersion ||
    body.implementationId !== expected.implementationId ||
    body.policyId !== expected.policyId ||
    body.policyVersion !== expected.policyVersion ||
    body.policyDigest !== expected.policyDigest ||
    body.requestId !== request.requestId ||
    body.requestDigest !== request.requestDigest ||
    body.operation !== request.operation ||
    body.evaluatedAtLogicalMs !== request.logicalTimeMs ||
    body.expiresAtLogicalMs <= input.logicalTimeMs ||
    body.committedStateRevision !== body.priorStateRevision + 1
  )
    fail("capability state decision binding is invalid");
  return freeze({ ...body, decisionId, decisionDigest });
}

export class CapabilityStateFusionRuntimeV1 implements CapabilityStateFusionPortV1 {
  readonly fusionId: string;
  readonly fusionVersion: number;
  readonly implementationId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  readonly #stateKey: string;
  readonly #policy: CapabilityStatePolicyRecordV1;
  readonly #resolver: CapabilityStateResolutionPortV1;
  readonly #store: CapabilityStateStoreV1;

  constructor(options: CapabilityStateFusionRuntimeOptionsV1) {
    if (!options || typeof options !== "object")
      fail("capability state runtime options are required");
    this.#stateKey = identifier(options.stateKey, "runtime.stateKey");
    this.fusionId = identifier(options.fusionId, "runtime.fusionId");
    this.fusionVersion = positive(
      options.fusionVersion,
      "runtime.fusionVersion",
    );
    this.implementationId = identifier(
      options.implementationId,
      "runtime.implementationId",
    );
    this.#policy = validateCapabilityStatePolicyV1(options.policy);
    this.policyId = this.#policy.policy.policyId;
    this.policyVersion = this.#policy.policy.policyVersion;
    this.policyDigest = this.#policy.policyDigest;
    if (!options.resolver || typeof options.resolver.resolve !== "function")
      fail("capability state resolver is required");
    if (
      !options.store ||
      typeof options.store.load !== "function" ||
      typeof options.store.save !== "function"
    )
      fail("capability state store is required");
    this.#resolver = options.resolver;
    this.#store = options.store;
  }

  async evaluate(
    requestValue: CapabilityStateFusionRequestV1,
  ): Promise<CapabilityStateFusionDecisionV1> {
    const request = validateCapabilityStateFusionRequestV1(requestValue);
    if (request.candidates.length > this.#policy.policy.maximumCandidates)
      fail("capability state request exceeds policy candidate limit");
    const requiredDimensions =
      this.#policy.policy.requiredDimensions[request.operation];
    const groups = await Promise.all(
      request.candidates.map((candidate) =>
        this.#resolver.resolve({ request, candidate, requiredDimensions }),
      ),
    );
    const signals = groups.flat().map(validateCapabilityStateSignalV1);
    for (
      let attempt = 0;
      attempt < this.#policy.policy.maximumCommitAttempts;
      attempt += 1
    ) {
      const loaded = await this.#store.load(this.#stateKey);
      const state = loaded
        ? validateCapabilityStateFusionStateV1(loaded, this.#policy)
        : createCapabilityStateFusionStateV1({
            stateKey: this.#stateKey,
            fusionId: this.fusionId,
            fusionVersion: this.fusionVersion,
            implementationId: this.implementationId,
            policy: this.#policy,
          });
      if (
        state.fusionId !== this.fusionId ||
        state.fusionVersion !== this.fusionVersion ||
        state.implementationId !== this.implementationId
      )
        fail("capability state runtime binding changed");
      const result = reduceCapabilityStateFusionV1({
        state,
        policy: this.#policy,
        request,
        signals,
      });
      if (
        await this.#store.save({
          state: result.state,
          expectedRevision: loaded ? state.revision : null,
        })
      )
        return result.decision;
    }
    throw new Error("capability_state_commit_conflict");
  }
}

export class InMemoryCapabilityStateStoreV1 implements CapabilityStateStoreV1 {
  readonly #states = new Map<string, CapabilityStateFusionStateV1>();
  readonly #policy: CapabilityStatePolicyRecordV1;

  constructor(policy: CapabilityStatePolicyRecordV1) {
    this.#policy = validateCapabilityStatePolicyV1(policy);
  }

  async load(stateKey: string): Promise<CapabilityStateFusionStateV1 | null> {
    const state = this.#states.get(identifier(stateKey, "stateKey"));
    return state ? clone(state) : null;
  }

  async save(input: {
    readonly state: CapabilityStateFusionStateV1;
    readonly expectedRevision: number | null;
  }): Promise<boolean> {
    const state = validateCapabilityStateFusionStateV1(
      input.state,
      this.#policy,
    );
    const current = this.#states.get(state.stateKey);
    if (
      input.expectedRevision === null
        ? current !== undefined || state.revision !== 1
        : !current ||
          current.revision !== input.expectedRevision ||
          state.revision !== input.expectedRevision + 1
    )
      return false;
    this.#states.set(state.stateKey, clone(state));
    return true;
  }
}

export function createCapabilityStateResolutionPortV1(input: {
  readonly sources: readonly CapabilityStateSignalSourceV1[];
}): CapabilityStateResolutionPortV1 {
  if (!input || !Array.isArray(input.sources))
    fail("capability state sources are required");
  const byDimension = new Map<
    CapabilityStateDimensionV1,
    CapabilityStateSignalSourceV1
  >();
  for (const source of input.sources) {
    if (!source || typeof source.resolve !== "function")
      fail("capability state signal source is invalid");
    const sourceDimension = dimension(source.dimension);
    if (byDimension.has(sourceDimension))
      fail("capability state signal source dimension is duplicated");
    byDimension.set(sourceDimension, source);
  }
  return freeze({
    async resolve({ request, candidate, requiredDimensions }) {
      const resolved = await Promise.all(
        requiredDimensions.map(async (requiredDimension) => {
          const source = byDimension.get(requiredDimension);
          if (!source) return null;
          const signal = await source.resolve({ request, candidate });
          return signal === null
            ? null
            : validateCapabilityStateSignalV1(signal);
        }),
      );
      return freeze(
        resolved
          .filter(
            (signal): signal is CapabilityStateSignalV1 => signal !== null,
          )
          .sort(signalOrder),
      );
    },
  });
}

function normalizePolicy(
  input: CapabilityStatePolicyV1,
): CapabilityStatePolicyV1 {
  const value = record(input, policyKeys, "capability state policy");
  if (value.schemaVersion !== CAPABILITY_STATE_SCHEMA_VERSION_V1)
    fail("capability state policy schema is invalid");
  const requirements = record(
    value.requiredDimensions,
    [...CAPABILITY_STATE_OPERATIONS_V1],
    "capability state dimension requirements",
  );
  const requiredDimensions = Object.fromEntries(
    CAPABILITY_STATE_OPERATIONS_V1.map((currentOperation) => [
      currentOperation,
      dimensions(
        requirements[currentOperation],
        `requiredDimensions.${currentOperation}`,
      ),
    ]),
  ) as unknown as CapabilityStateDimensionRequirementsV1;
  return freeze({
    schemaVersion: CAPABILITY_STATE_SCHEMA_VERSION_V1,
    policyId: identifier(value.policyId, "policy.policyId"),
    policyVersion: positive(value.policyVersion, "policy.policyVersion"),
    parentPolicyDigest:
      value.parentPolicyDigest === null
        ? null
        : planningDigest(value.parentPolicyDigest, "policy.parentPolicyDigest"),
    requiredDimensions,
    maximumCandidates: bounded(
      value.maximumCandidates,
      "policy.maximumCandidates",
      256,
    ),
    maximumReasonCodesPerSignal: bounded(
      value.maximumReasonCodesPerSignal,
      "policy.maximumReasonCodesPerSignal",
      32,
    ),
    maximumStateHeads: bounded(
      value.maximumStateHeads,
      "policy.maximumStateHeads",
      65_536,
    ),
    maximumDecisionTtlMs: bounded(
      value.maximumDecisionTtlMs,
      "policy.maximumDecisionTtlMs",
      86_400_000,
    ),
    maximumCommitAttempts: bounded(
      value.maximumCommitAttempts,
      "policy.maximumCommitAttempts",
      16,
    ),
  });
}

function normalizeScope(input: unknown): CapabilityStateFusionScopeV1 {
  const value = record(input, scopeKeys, "capability state fusion scope");
  const workItemId = nullableIdentifier(value.workItemId, "scope.workItemId");
  const workItemRevision =
    value.workItemRevision === null
      ? null
      : positive(value.workItemRevision, "scope.workItemRevision");
  if ((workItemId === null) !== (workItemRevision === null))
    fail("capability state Work scope is incomplete");
  return freeze({
    tenantId: identifier(value.tenantId, "scope.tenantId"),
    meshId: identifier(value.meshId, "scope.meshId"),
    policyDomainId: identifier(value.policyDomainId, "scope.policyDomainId"),
    missionIntentId: identifier(value.missionIntentId, "scope.missionIntentId"),
    objectiveId: identifier(value.objectiveId, "scope.objectiveId"),
    workItemId,
    workItemRevision,
  });
}

function normalizeSignals(
  input: readonly CapabilityStateSignalV1[],
  maximumReasonCodes: number,
): readonly CapabilityStateSignalV1[] {
  if (
    !Array.isArray(input) ||
    input.length > 256 * CAPABILITY_STATE_DIMENSIONS_V1.length
  )
    fail("capability state signals are invalid");
  const signals = input.map(validateCapabilityStateSignalV1).sort(signalOrder);
  for (const signal of signals)
    if (signal.reasonCodes.length > maximumReasonCodes)
      fail("capability state signal exceeds the policy reason-code limit");
  return freeze(signals);
}

function normalizeHeads(
  input: readonly CapabilityStateHeadV1[],
): readonly CapabilityStateHeadV1[] {
  if (!Array.isArray(input) || input.length > 65_536)
    fail("capability state heads are invalid");
  const heads = input.map((headValue) => {
    const value = record(headValue, headKeys, "capability state head");
    if (value.schemaVersion !== CAPABILITY_STATE_SCHEMA_VERSION_V1)
      fail("capability state head schema is invalid");
    const head = freeze({
      schemaVersion: CAPABILITY_STATE_SCHEMA_VERSION_V1,
      headKey: identifier(value.headKey, "head.headKey"),
      candidateId: identifier(value.candidateId, "head.candidateId"),
      dimension: dimension(value.dimension),
      sourceId: identifier(value.sourceId, "head.sourceId"),
      sourceVersion: positive(value.sourceVersion, "head.sourceVersion"),
      sourceImplementationDigest: planningDigest(
        value.sourceImplementationDigest,
        "head.sourceImplementationDigest",
      ),
      sourceRevision: nonNegative(value.sourceRevision, "head.sourceRevision"),
      signalDigest: planningDigest(value.signalDigest, "head.signalDigest"),
      expiresAtLogicalMs: positive(
        value.expiresAtLogicalMs,
        "head.expiresAtLogicalMs",
      ),
    });
    if (
      head.headKey !==
      capabilityStateHeadKeyV1({
        candidateId: head.candidateId,
        dimension: head.dimension,
        sourceId: head.sourceId,
      })
    )
      fail("capability state head key is invalid");
    return head;
  });
  heads.sort(headOrder);
  assertSortedUnique(
    heads.map(({ headKey }) => headKey),
    "head keys",
  );
  return freeze(heads);
}

function assertStatePolicyBinding(
  state: CapabilityStateFusionStateV1,
  policy: CapabilityStatePolicyRecordV1,
): void {
  if (
    state.policyId !== policy.policy.policyId ||
    state.policyVersion !== policy.policy.policyVersion ||
    state.policyDigest !== policy.policyDigest
  )
    fail("capability state policy binding changed");
}

function validateSignalAt(
  signal: CapabilityStateSignalV1,
  logicalTimeMs: number,
): string | null {
  if (signal.observedAtLogicalMs > logicalTimeMs)
    return `signal_future_dated:${signal.dimension}`;
  if (signal.expiresAtLogicalMs <= logicalTimeMs)
    return `signal_expired:${signal.dimension}`;
  return null;
}

function minimumDecisionExpiry(
  request: CapabilityStateFusionRequestV1,
  signals: readonly CapabilityStateSignalV1[],
  requiredDimensions: readonly CapabilityStateDimensionV1[],
  logicalTimeMs: number,
): number {
  let expiry = Number.MAX_SAFE_INTEGER;
  for (const candidate of request.candidates)
    for (const requiredDimension of requiredDimensions) {
      const signal = signals.find(
        (current) =>
          current.candidateId === candidate.candidateId &&
          current.dimension === requiredDimension,
      );
      if (
        signal &&
        signal.observedAtLogicalMs <= logicalTimeMs &&
        signal.expiresAtLogicalMs > logicalTimeMs
      )
        expiry = Math.min(expiry, signal.expiresAtLogicalMs);
    }
  return expiry;
}

function combineDisposition(
  left: CapabilityStateDispositionV1,
  right: CapabilityStateDispositionV1,
): CapabilityStateDispositionV1 {
  const rank: Record<CapabilityStateDispositionV1, number> = {
    eligible: 0,
    restricted: 1,
    unavailable: 2,
    ineligible: 3,
  };
  return rank[right] > rank[left] ? right : left;
}

function headFromSignal(
  signal: CapabilityStateSignalV1,
): CapabilityStateHeadV1 {
  return freeze({
    schemaVersion: CAPABILITY_STATE_SCHEMA_VERSION_V1,
    headKey: capabilityStateHeadKeyV1(signal),
    candidateId: signal.candidateId,
    dimension: signal.dimension,
    sourceId: signal.sourceId,
    sourceVersion: signal.sourceVersion,
    sourceImplementationDigest: signal.sourceImplementationDigest,
    sourceRevision: signal.sourceRevision,
    signalDigest: signal.signalDigest,
    expiresAtLogicalMs: signal.expiresAtLogicalMs,
  });
}

export function capabilityStateHeadKeyV1(input: {
  readonly candidateId: string;
  readonly dimension: CapabilityStateDimensionV1;
  readonly sourceId: string;
}): string {
  const headDigest = digest("capability-state-head", {
    candidateId: identifier(input.candidateId, "head candidateId"),
    dimension: dimension(input.dimension),
    sourceId: identifier(input.sourceId, "head sourceId"),
  });
  return `capability-state-head.${headDigest.slice(7)}`;
}

function signalOrder(
  left: CapabilityStateSignalV1,
  right: CapabilityStateSignalV1,
): number {
  return (
    compare(left.candidateId, right.candidateId) ||
    compare(left.dimension, right.dimension) ||
    compare(left.sourceId, right.sourceId)
  );
}

function headOrder(
  left: CapabilityStateHeadV1,
  right: CapabilityStateHeadV1,
): number {
  return compare(left.headKey, right.headKey);
}

function record(
  input: unknown,
  expectedKeys: readonly string[],
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
    fail(`${label} must be a plain object`);
  const descriptors = Object.getOwnPropertyDescriptors(input);
  for (const descriptor of Object.values(descriptors))
    if (!("value" in descriptor) || !descriptor.enumerable)
      fail(`${label} contains an accessor or hidden field`);
  const actualKeys = Object.keys(descriptors).sort(compare);
  const expected = [...expectedKeys].sort(compare);
  if (!same(actualKeys, expected)) fail(`${label} has invalid fields`);
  return Object.fromEntries(
    actualKeys.map((key) => [key, descriptors[key]?.value]),
  );
}

function identifier(input: unknown, label: string): string {
  if (
    typeof input !== "string" ||
    input.length < 1 ||
    input.length > MAXIMUM_IDENTIFIER_LENGTH ||
    !IDENTIFIER.test(input)
  )
    fail(`${label} is invalid`);
  return input;
}

function nullableIdentifier(input: unknown, label: string): string | null {
  return input === null ? null : identifier(input, label);
}

function planningDigest(input: unknown, label: string): PlanningDigestV1 {
  if (typeof input !== "string" || !DIGEST.test(input))
    fail(`${label} is invalid`);
  return input as PlanningDigestV1;
}

function positive(input: unknown, label: string): number {
  if (!Number.isSafeInteger(input) || (input as number) < 1)
    fail(`${label} is invalid`);
  return input as number;
}

function nonNegative(input: unknown, label: string): number {
  if (!Number.isSafeInteger(input) || (input as number) < 0)
    fail(`${label} is invalid`);
  return input as number;
}

function bounded(input: unknown, label: string, maximum: number): number {
  const value = positive(input, label);
  if (value > maximum) fail(`${label} exceeds its hard maximum`);
  return value;
}

function operation(input: unknown): CapabilityStateOperationV1 {
  if (typeof input !== "string" || !operationSet.has(input))
    fail("capability state operation is invalid");
  return input as CapabilityStateOperationV1;
}

function dimension(input: unknown): CapabilityStateDimensionV1 {
  if (typeof input !== "string" || !dimensionSet.has(input))
    fail("capability state dimension is invalid");
  return input as CapabilityStateDimensionV1;
}

function disposition(input: unknown): CapabilityStateDispositionV1 {
  if (typeof input !== "string" || !dispositionSet.has(input))
    fail("capability state disposition is invalid");
  return input as CapabilityStateDispositionV1;
}

function oneOf<T extends string>(
  input: unknown,
  values: readonly T[],
  label: string,
): T {
  if (typeof input !== "string" || !values.includes(input as T))
    fail(`${label} is invalid`);
  return input as T;
}

function tokens(
  input: unknown,
  label: string,
  maximum: number,
): readonly string[] {
  if (!Array.isArray(input) || input.length > maximum)
    fail(`${label} is invalid`);
  const values = input.map((value, index) =>
    identifier(value, `${label}[${index}]`),
  );
  assertSortedUnique(values, label);
  return freeze(values);
}

function dimensions(
  input: unknown,
  label: string,
): readonly CapabilityStateDimensionV1[] {
  if (
    !Array.isArray(input) ||
    input.length > CAPABILITY_STATE_DIMENSIONS_V1.length
  )
    fail(`${label} is invalid`);
  const values = input.map(dimension);
  assertSortedUnique(values, label);
  return freeze(values);
}

function reasonCodes(input: unknown, maximum: number): readonly string[] {
  if (!Array.isArray(input) || input.length > maximum)
    fail("reason codes are invalid");
  const values = input.map((value, index) => {
    if (
      typeof value !== "string" ||
      value.length < 1 ||
      value.length > MAXIMUM_REASON_CODE_LENGTH ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)
    )
      fail(`reasonCodes[${index}] is invalid`);
    return value;
  });
  assertSortedUnique(values, "reason codes");
  return freeze(values);
}

function digestArray(
  input: unknown,
  label: string,
): readonly PlanningDigestV1[] {
  if (
    !Array.isArray(input) ||
    input.length > CAPABILITY_STATE_DIMENSIONS_V1.length
  )
    fail(`${label} is invalid`);
  const values = input.map((value, index) =>
    planningDigest(value, `${label}[${index}]`),
  );
  assertSortedUnique(values, label);
  return freeze(values);
}

function assertSortedUnique(values: readonly string[], label: string): void {
  for (let index = 0; index < values.length; index += 1)
    if (
      (index > 0 && compare(values[index - 1]!, values[index]!) >= 0) ||
      values[index] === undefined
    )
      fail(`${label} must be sorted and unique`);
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function same(left: readonly unknown[], right: readonly unknown[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function digest(
  domain: Parameters<typeof digestPlanningJsonV1>[0],
  value: unknown,
): PlanningDigestV1 {
  return digestPlanningJsonV1(domain, value as PlanningJson);
}

function freeze<T>(value: T, seen = new Set<object>()): T {
  if (value && typeof value === "object" && !seen.has(value as object)) {
    seen.add(value as object);
    for (const current of Object.values(value as Record<string, unknown>))
      freeze(current, seen);
    Object.freeze(value);
  }
  return value;
}

function clone<T extends JsonValue | CapabilityStateFusionStateV1>(
  value: T,
): T {
  return freeze(JSON.parse(JSON.stringify(value)) as T);
}

function fail(message: string): never {
  throw new TypeError(message);
}
