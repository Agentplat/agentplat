import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";

import {
  COORDINATION_CONTROL_ACTIONS_V1,
  COORDINATION_CONTROL_SCHEMA_VERSION_V1,
  type CoordinationControlEvidenceV1,
  type CoordinationControlPolicyV1,
  type CoordinationControlProposalV1,
  type CoordinationControlScopeV1,
  type CoordinationControlStateV1,
} from "./coordination-control-contracts.js";

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]*$/u;
const BPS = 10_000;

export function createCoordinationControlEvidenceV1(
  input: Omit<CoordinationControlEvidenceV1, "evidenceDigest">,
): CoordinationControlEvidenceV1 {
  assertEvidence(input);
  const body = {
    ...input,
    schemaVersion: COORDINATION_CONTROL_SCHEMA_VERSION_V1,
  } as CoordinationControlEvidenceV1;
  return Object.freeze({
    ...body,
    evidenceDigest: digestPlanningJsonV1(
      "mission-observation",
      body as unknown as PlanningJson,
    ),
  });
}

export function validateCoordinationControlEvidenceV1(
  input: unknown,
): CoordinationControlEvidenceV1 {
  assertObject(input, "coordination control evidence");
  const value = input as unknown as CoordinationControlEvidenceV1;
  assertEvidence(value);
  const { evidenceDigest, ...body } = value;
  if (
    evidenceDigest !==
    digestPlanningJsonV1("mission-observation", body as unknown as PlanningJson)
  )
    fail("coordination control evidence digest is invalid");
  return Object.freeze({ ...value, scope: Object.freeze({ ...value.scope }) });
}

export function createCoordinationControlPolicyV1(
  input: Omit<CoordinationControlPolicyV1, "policyDigest">,
): CoordinationControlPolicyV1 {
  assertPolicy(input);
  const body = {
    ...input,
    schemaVersion: COORDINATION_CONTROL_SCHEMA_VERSION_V1,
  } as CoordinationControlPolicyV1;
  return Object.freeze({
    ...body,
    policyDigest: digestPlanningJsonV1(
      "plan-selection-policy",
      body as unknown as PlanningJson,
    ),
  });
}

export function validateCoordinationControlPolicyV1(
  input: unknown,
): CoordinationControlPolicyV1 {
  assertObject(input, "coordination control policy");
  const value = input as unknown as CoordinationControlPolicyV1;
  assertPolicy(value);
  const { policyDigest, ...body } = value;
  if (
    policyDigest !==
    digestPlanningJsonV1(
      "plan-selection-policy",
      body as unknown as PlanningJson,
    )
  )
    fail("coordination control policy digest is invalid");
  return Object.freeze({
    ...value,
    sourceBindings: Object.freeze(
      value.sourceBindings.map((item) => Object.freeze({ ...item })),
    ),
    thresholds: Object.freeze({ ...value.thresholds }),
    limits: Object.freeze({ ...value.limits }),
  });
}

export function createCoordinationControlProposalV1(
  input: Omit<CoordinationControlProposalV1, "proposalDigest">,
): CoordinationControlProposalV1 {
  assertProposal(input);
  const body = {
    ...input,
    schemaVersion: COORDINATION_CONTROL_SCHEMA_VERSION_V1,
    advisoryOnly: true,
  } as CoordinationControlProposalV1;
  return Object.freeze({
    ...body,
    proposalDigest: digestPlanningJsonV1(
      "proposal-identity",
      body as unknown as PlanningJson,
    ),
  });
}

export function validateCoordinationControlProposalV1(
  input: unknown,
): CoordinationControlProposalV1 {
  assertObject(input, "coordination control proposal");
  const value = input as unknown as CoordinationControlProposalV1;
  assertProposal(value);
  const { proposalDigest, ...body } = value;
  if (
    proposalDigest !==
    digestPlanningJsonV1("proposal-identity", body as unknown as PlanningJson)
  )
    fail("coordination control proposal digest is invalid");
  return Object.freeze({
    ...value,
    scope: Object.freeze({ ...value.scope }),
    reasonCodes: Object.freeze([...value.reasonCodes]),
    evidenceDigests: Object.freeze([...value.evidenceDigests]),
  });
}

export function coordinationControlStateDigestV1(
  state: Omit<CoordinationControlStateV1, "stateDigest">,
): PlanningDigestV1 {
  return digestPlanningJsonV1(
    "collective-planning-snapshot",
    state as unknown as PlanningJson,
  );
}

/** Validates the entire durable envelope before a runtime can act on it. */
export function validateCoordinationControlStateV1(
  input: unknown,
): CoordinationControlStateV1 {
  assertObject(input, "coordination control state");
  const value = input as unknown as CoordinationControlStateV1;
  if (
    value.format !==
    "application/vnd.agentplat.coordination-control-state.v1+json"
  )
    fail("coordination control state format is invalid");
  schema(value.schemaVersion);
  id(value.stateKey, "state key");
  id(value.coordinationId, "state coordination ID");
  sha(value.policyDigest, "state policy digest");
  nonnegative(value.revision, "state revision");
  nonnegative(value.logicalTimeHighWaterMs, "state logical time");
  if (value.predecessorStateDigest === null) {
    if (value.revision !== 0)
      fail("non-initial state requires predecessor digest");
  } else {
    if (value.revision < 1)
      fail("initial state cannot have predecessor digest");
    sha(value.predecessorStateDigest, "state predecessor digest");
  }
  if (!Array.isArray(value.sourceHeads)) fail("state source heads are invalid");
  const sourceIds = new Set<string>();
  for (const head of value.sourceHeads) {
    assertObject(head, "state source head");
    id(head.sourceId, "state source head ID");
    nonnegative(head.sourceRevision, "state source head revision");
    sha(head.sourceRecordDigest, "state source head digest");
    sha(head.evidenceDigest, "state source head evidence digest");
    const sourceId = head.sourceId as string;
    if (sourceIds.has(sourceId)) fail("state source heads must be unique");
    sourceIds.add(sourceId);
  }
  if (value.lastProposal !== null) {
    const proposal = validateCoordinationControlProposalV1(value.lastProposal);
    if (proposal.scope.coordinationId !== value.coordinationId)
      fail("state proposal coordination binding is invalid");
    if (proposal.evaluatedAtLogicalMs > value.logicalTimeHighWaterMs)
      fail("state proposal time exceeds logical time");
  }
  if ((value.lastProposal === null) !== (value.lastActionAtLogicalMs === null))
    fail("state proposal and action time must be paired");
  if (value.lastActionAtLogicalMs !== null) {
    nonnegative(value.lastActionAtLogicalMs, "state action time");
    if (value.lastActionAtLogicalMs > value.logicalTimeHighWaterMs)
      fail("state action time exceeds logical time");
  }
  if (!Array.isArray(value.outbox)) fail("state outbox is invalid");
  const proposalIds = new Set<string>();
  for (const entry of value.outbox) {
    assertObject(entry, "state outbox record");
    const proposal = validateCoordinationControlProposalV1(entry.proposal);
    if (proposal.scope.coordinationId !== value.coordinationId)
      fail("outbox proposal coordination binding is invalid");
    if (proposal.evaluatedAtLogicalMs > value.logicalTimeHighWaterMs)
      fail("outbox proposal time exceeds logical time");
    if (
      entry.status !== "pending" &&
      entry.status !== "delivered" &&
      entry.status !== "expired"
    )
      fail("outbox status is invalid");
    if (proposalIds.has(proposal.proposalId))
      fail("outbox proposals must be unique");
    proposalIds.add(proposal.proposalId);
  }
  const { stateDigest, ...body } = value;
  if (!stateDigest || stateDigest !== coordinationControlStateDigestV1(body))
    fail("coordination control state digest is invalid");
  return Object.freeze({
    ...value,
    sourceHeads: Object.freeze(
      value.sourceHeads.map((head) => Object.freeze({ ...head })),
    ),
    outbox: Object.freeze(
      value.outbox.map((entry) =>
        Object.freeze({
          proposal: validateCoordinationControlProposalV1(entry.proposal),
          status: entry.status,
        }),
      ),
    ),
  });
}

function assertEvidence(
  value:
    | Omit<CoordinationControlEvidenceV1, "evidenceDigest">
    | CoordinationControlEvidenceV1,
): void {
  schema(value.schemaVersion);
  id(value.evidenceId, "evidence ID");
  scope(value.scope);
  id(value.sourceId, "source ID");
  positive(value.sourceVersion, "source version");
  sha(value.sourceImplementationDigest, "source implementation digest");
  nonnegative(value.sourceRevision, "source revision");
  sha(value.sourceRecordDigest, "source record digest");
  for (const key of [
    "roleAlignmentBps",
    "roleCoherenceBps",
    "contextIntegrityBps",
    "contextUncertaintyBps",
    "trustBps",
    "capabilityBps",
    "executionHealthBps",
    "teamHealthBps",
    "outcomeConfidenceBps",
  ] as const)
    bps(value[key], key);
  nonnegative(value.observedAtLogicalMs, "observed time");
  if (
    !Number.isSafeInteger(value.expiresAtLogicalMs) ||
    value.expiresAtLogicalMs <= value.observedAtLogicalMs
  )
    fail("evidence expiry must be after observation");
}
function assertPolicy(
  value:
    | Omit<CoordinationControlPolicyV1, "policyDigest">
    | CoordinationControlPolicyV1,
): void {
  schema(value.schemaVersion);
  id(value.policyId, "policy ID");
  positive(value.policyVersion, "policy version");
  sha(value.sourceRegistryDigest, "source registry digest");
  if (
    !Array.isArray(value.sourceBindings) ||
    value.sourceBindings.length < 1 ||
    value.sourceBindings.length > value.limits.maximumEvidenceSources
  )
    fail("policy source bindings are invalid");
  const seen = new Set<string>();
  for (const binding of value.sourceBindings) {
    id(binding.sourceId, "source binding ID");
    positive(binding.sourceVersion, "source binding version");
    sha(binding.sourceImplementationDigest, "source binding digest");
    if (seen.has(binding.sourceId))
      fail("policy source bindings must be unique");
    seen.add(binding.sourceId);
  }
  positive(value.minimumEvidenceSources, "minimum evidence sources");
  if (value.minimumEvidenceSources > value.sourceBindings.length)
    fail("minimum evidence sources exceed bindings");
  nonnegative(value.freshnessWindowMs, "freshness window");
  nonnegative(value.cooldownMs, "cooldown");
  bps(value.hysteresisBps, "hysteresis");
  for (const item of Object.values(value.thresholds)) bps(item, "threshold");
  positive(value.limits.maximumEvidenceSources, "maximum evidence sources");
  positive(value.limits.maximumOutboxRecords, "maximum outbox records");
  positive(value.limits.maximumCommitAttempts, "maximum commit attempts");
  positive(value.limits.maximumProposalTtlMs, "maximum proposal ttl");
}
function assertProposal(
  value:
    | Omit<CoordinationControlProposalV1, "proposalDigest">
    | CoordinationControlProposalV1,
): void {
  schema(value.schemaVersion);
  id(value.proposalId, "proposal ID");
  scope(value.scope);
  if (
    !(COORDINATION_CONTROL_ACTIONS_V1 as readonly string[]).includes(
      value.action,
    )
  )
    fail("proposal action is invalid");
  if (value.advisoryOnly !== true) fail("proposal must be advisory only");
  if (
    !Array.isArray(value.reasonCodes) ||
    value.reasonCodes.length < 1 ||
    value.reasonCodes.some((reason) => !ID.test(reason))
  )
    fail("proposal reason codes are invalid");
  if (!Array.isArray(value.evidenceDigests))
    fail("proposal evidence digests are invalid");
  value.evidenceDigests.forEach((digest) =>
    sha(digest, "proposal evidence digest"),
  );
  nonnegative(value.evaluatedAtLogicalMs, "proposal evaluated time");
  if (
    !Number.isSafeInteger(value.expiresAtLogicalMs) ||
    value.expiresAtLogicalMs <= value.evaluatedAtLogicalMs
  )
    fail("proposal expiry must be after evaluation");
}
function scope(value: CoordinationControlScopeV1): void {
  assertObject(value, "scope");
  id(value.tenantId, "tenant ID");
  id(value.coordinationId, "coordination ID");
  id(value.missionIntentId, "mission intent ID");
  if (value.teamId !== null) id(value.teamId, "team ID");
  if (value.workItemId !== null) id(value.workItemId, "work item ID");
}
function schema(value: unknown): void {
  if (value !== 1) fail("unsupported schema version");
}
function id(value: unknown, label: string): void {
  if (typeof value !== "string" || !ID.test(value)) fail(`${label} is invalid`);
}
function sha(value: unknown, label: string): asserts value is PlanningDigestV1 {
  if (typeof value !== "string" || !DIGEST.test(value))
    fail(`${label} is invalid`);
}
function bps(value: unknown, label: string): void {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0 ||
    (value as number) > BPS
  )
    fail(`${label} must be a basis-point value`);
}
function positive(value: unknown, label: string): void {
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    fail(`${label} must be positive`);
}
function nonnegative(value: unknown, label: string): void {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    fail(`${label} must be non-negative`);
}
function assertObject(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${label} must be an object`);
}
function fail(message: string): never {
  throw new TypeError(message);
}
