import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";

import {
  GOVERNED_MISSION_CONTROL_ACTIONS_V1,
  type GovernedMissionControlActionV1,
  type GovernedMissionControlProposalV1,
  type GovernedMissionScopeV1,
} from "./mission-lifecycle-contracts.js";
import {
  governedMissionControlProposalDigestV1,
  validateGovernedMissionControlProposalV1,
  validateGovernedMissionScopeV1,
} from "./mission-lifecycle-validation.js";
import {
  ATTESTED_MISSION_CONTROL_STATE_FORMAT_V1,
  type AttestedMissionControlDecisionRecordV1,
  type AttestedMissionControlDecisionV1,
  type AttestedMissionControlPolicyV1,
  type AttestedMissionControlStateV1,
} from "./attested-mission-control-contracts.js";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const SHA = /^sha256:[0-9a-f]{64}$/u;
const ACTIONS = new Set<string>(GOVERNED_MISSION_CONTROL_ACTIONS_V1);

export function attestedMissionControlDigestV1(
  domain: string,
  input: unknown,
): PlanningDigestV1 {
  return digestPlanningJsonV1("proposal-identity", {
    domain,
    input,
  } as PlanningJson);
}

export function attestedMissionFenceDigestV1(
  scope: GovernedMissionScopeV1,
): PlanningDigestV1 {
  const value = validateGovernedMissionScopeV1(scope);
  return attestedMissionControlDigestV1("mission-control-fence", {
    authorityId: value.authorityId,
    authorityEpoch: value.authorityEpoch,
    fencingToken: value.fencingToken,
    scopeDigest: value.scopeDigest,
  });
}

export function createAttestedMissionControlPolicyV1(
  input: Omit<AttestedMissionControlPolicyV1, "policyDigest">,
): AttestedMissionControlPolicyV1 {
  const value = exact(
    input,
    [
      "discontinuityAction",
      "initialSequence",
      "maximumCommitAttempts",
      "maximumRetainedDecisions",
      "maximumSequenceGap",
      "maximumWindowMs",
      "policyId",
      "policyVersion",
      "requiredHealthySteps",
      "schemaVersion",
      "sourceEpoch",
      "sourceId",
    ],
    "attested mission control policy",
  );
  if (value.schemaVersion !== 1) fail("control policy version is invalid");
  const body = freeze({
    schemaVersion: 1 as const,
    policyId: id(value.policyId, "control policy ID"),
    policyVersion: bounded(
      value.policyVersion,
      1,
      1_000_000,
      "control policy version",
    ),
    sourceId: id(value.sourceId, "control source ID"),
    sourceEpoch: bounded(
      value.sourceEpoch,
      1,
      Number.MAX_SAFE_INTEGER,
      "control source epoch",
    ),
    initialSequence: bounded(
      value.initialSequence,
      0,
      Number.MAX_SAFE_INTEGER - 1,
      "initial control sequence",
    ),
    requiredHealthySteps: bounded(
      value.requiredHealthySteps,
      1,
      10_000,
      "required healthy steps",
    ),
    maximumWindowMs: bounded(
      value.maximumWindowMs,
      1,
      86_400_000,
      "maximum control window",
    ),
    maximumSequenceGap: bounded(
      value.maximumSequenceGap,
      1,
      10_000,
      "maximum control sequence gap",
    ),
    maximumRetainedDecisions: bounded(
      value.maximumRetainedDecisions,
      1,
      256,
      "maximum retained decisions",
    ),
    maximumCommitAttempts: bounded(
      value.maximumCommitAttempts,
      1,
      64,
      "maximum commit attempts",
    ),
    discontinuityAction: discontinuity(value.discontinuityAction),
  });
  return freeze({
    ...body,
    policyDigest: attestedMissionControlDigestV1(
      "attested-mission-control-policy",
      body,
    ),
  });
}

export function validateAttestedMissionControlPolicyV1(
  input: unknown,
): AttestedMissionControlPolicyV1 {
  const value = exact(
    input,
    [
      "discontinuityAction",
      "initialSequence",
      "maximumCommitAttempts",
      "maximumRetainedDecisions",
      "maximumSequenceGap",
      "maximumWindowMs",
      "policyDigest",
      "policyId",
      "policyVersion",
      "requiredHealthySteps",
      "schemaVersion",
      "sourceEpoch",
      "sourceId",
    ],
    "attested mission control policy",
  );
  const { policyDigest, ...body } = value;
  const rebuilt = createAttestedMissionControlPolicyV1(
    body as Omit<AttestedMissionControlPolicyV1, "policyDigest">,
  );
  if (policyDigest !== rebuilt.policyDigest)
    fail("control policy digest is invalid");
  return rebuilt;
}

export function createAttestedMissionControlDecisionV1(
  input: Omit<AttestedMissionControlDecisionV1, "decisionDigest">,
): AttestedMissionControlDecisionV1 {
  const value = exact(
    input,
    [
      "action",
      "authorityEpoch",
      "evaluatedAtLogicalMs",
      "executionObservationDigest",
      "expiresAtLogicalMs",
      "fenceDigest",
      "proposalId",
      "schemaVersion",
      "scopeDigest",
      "sequence",
      "sourceEpoch",
      "sourceId",
      "windowId",
      "windowOpenedAtLogicalMs",
    ],
    "attested mission control decision",
  );
  if (value.schemaVersion !== 1) fail("control decision version is invalid");
  const opened = bounded(
    value.windowOpenedAtLogicalMs,
    0,
    Number.MAX_SAFE_INTEGER,
    "control window opening time",
  );
  const evaluated = bounded(
    value.evaluatedAtLogicalMs,
    0,
    Number.MAX_SAFE_INTEGER,
    "control evaluation time",
  );
  const expires = bounded(
    value.expiresAtLogicalMs,
    1,
    Number.MAX_SAFE_INTEGER,
    "control expiry time",
  );
  if (evaluated < opened || expires <= evaluated)
    fail("control decision window is invalid");
  const body = freeze({
    schemaVersion: 1 as const,
    proposalId: id(value.proposalId, "control proposal ID"),
    scopeDigest: sha(value.scopeDigest, "control scope digest"),
    authorityEpoch: bounded(
      value.authorityEpoch,
      1,
      Number.MAX_SAFE_INTEGER,
      "control authority epoch",
    ),
    fenceDigest: sha(value.fenceDigest, "control fence digest"),
    executionObservationDigest: sha(
      value.executionObservationDigest,
      "control observation digest",
    ),
    sourceId: id(value.sourceId, "control source ID"),
    sourceEpoch: bounded(
      value.sourceEpoch,
      1,
      Number.MAX_SAFE_INTEGER,
      "control source epoch",
    ),
    sequence: bounded(
      value.sequence,
      0,
      Number.MAX_SAFE_INTEGER,
      "control sequence",
    ),
    windowId: id(value.windowId, "control window ID"),
    windowOpenedAtLogicalMs: opened,
    evaluatedAtLogicalMs: evaluated,
    expiresAtLogicalMs: expires,
    action: action(value.action),
  });
  return freeze({
    ...body,
    decisionDigest: attestedMissionControlDigestV1(
      "attested-mission-control-decision",
      body,
    ),
  });
}

export function validateAttestedMissionControlDecisionV1(
  input: unknown,
): AttestedMissionControlDecisionV1 {
  const value = exact(
    input,
    [
      "action",
      "authorityEpoch",
      "decisionDigest",
      "evaluatedAtLogicalMs",
      "executionObservationDigest",
      "expiresAtLogicalMs",
      "fenceDigest",
      "proposalId",
      "schemaVersion",
      "scopeDigest",
      "sequence",
      "sourceEpoch",
      "sourceId",
      "windowId",
      "windowOpenedAtLogicalMs",
    ],
    "attested mission control decision",
  );
  const { decisionDigest, ...body } = value;
  const rebuilt = createAttestedMissionControlDecisionV1(
    body as Omit<AttestedMissionControlDecisionV1, "decisionDigest">,
  );
  if (decisionDigest !== rebuilt.decisionDigest)
    fail("control decision digest is invalid");
  return rebuilt;
}

export function createAttestedMissionControlProposalV1(input: {
  readonly proposalId: string;
  readonly scopeDigest: PlanningDigestV1;
  readonly authorityEpoch: number;
  readonly action: GovernedMissionControlActionV1;
  readonly evaluatedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
}): GovernedMissionControlProposalV1 {
  const body = freeze({
    proposalId: id(input.proposalId, "control proposal ID"),
    scopeDigest: sha(input.scopeDigest, "control proposal scope digest"),
    authorityEpoch: bounded(
      input.authorityEpoch,
      1,
      Number.MAX_SAFE_INTEGER,
      "control proposal epoch",
    ),
    action: action(input.action),
    evaluatedAtLogicalMs: bounded(
      input.evaluatedAtLogicalMs,
      0,
      Number.MAX_SAFE_INTEGER,
      "control proposal evaluation time",
    ),
    expiresAtLogicalMs: bounded(
      input.expiresAtLogicalMs,
      1,
      Number.MAX_SAFE_INTEGER,
      "control proposal expiry",
    ),
    advisoryOnly: true as const,
  });
  if (body.expiresAtLogicalMs <= body.evaluatedAtLogicalMs)
    fail("control proposal expiry is invalid");
  return freeze({
    ...body,
    proposalDigest: governedMissionControlProposalDigestV1(body),
  });
}

export function attestedMissionControlStateDigestV1(
  input: Omit<AttestedMissionControlStateV1, "stateDigest">,
): PlanningDigestV1 {
  return attestedMissionControlDigestV1(
    "attested-mission-control-state",
    input,
  );
}

export function createAttestedMissionControlStateV1(
  input: Omit<AttestedMissionControlStateV1, "stateDigest">,
): AttestedMissionControlStateV1 {
  const body = validateStateBody(input);
  return freeze({
    ...body,
    stateDigest: attestedMissionControlStateDigestV1(body),
  });
}

export function validateAttestedMissionControlStateV1(
  input: unknown,
): AttestedMissionControlStateV1 {
  const value = exact(input, STATE_KEYS, "attested mission control state");
  const { stateDigest, ...body } = value;
  const rebuilt = createAttestedMissionControlStateV1(
    body as Omit<AttestedMissionControlStateV1, "stateDigest">,
  );
  if (stateDigest !== rebuilt.stateDigest)
    fail("attested mission control state digest is invalid");
  return rebuilt;
}

const STATE_KEYS = [
  "activeWindowExpiresAtLogicalMs",
  "activeWindowId",
  "authorityEpoch",
  "consecutiveHealthySteps",
  "discontinuityCount",
  "fenceDigest",
  "format",
  "lastDecisionDigest",
  "lastExecutionObservationDigest",
  "lastProposal",
  "logicalTimeHighWaterMs",
  "missionId",
  "policyDigest",
  "predecessorStateDigest",
  "recentDecisions",
  "revision",
  "schemaVersion",
  "scopeDigest",
  "sequenceHighWater",
  "sourceEpoch",
  "sourceId",
  "stateDigest",
  "stateKey",
  "tenantId",
] as const;

function validateStateBody(
  input: unknown,
): Omit<AttestedMissionControlStateV1, "stateDigest"> {
  const value = exact(
    input,
    STATE_KEYS.filter((key) => key !== "stateDigest"),
    "attested mission control state body",
  );
  if (
    value.format !== ATTESTED_MISSION_CONTROL_STATE_FORMAT_V1 ||
    value.schemaVersion !== 1
  )
    fail("attested mission control state format is invalid");
  if (
    !Array.isArray(value.recentDecisions) ||
    value.recentDecisions.length > 256
  )
    fail("attested mission control decision history is invalid");
  const recent = value.recentDecisions.map(validateRecord);
  const sequenceHighWater = nullableInteger(
    value.sequenceHighWater,
    "control sequence high water",
  );
  const activeWindowId = nullableId(
    value.activeWindowId,
    "active control window ID",
  );
  const activeWindowExpiresAtLogicalMs = nullableInteger(
    value.activeWindowExpiresAtLogicalMs,
    "active control window expiry",
  );
  if ((activeWindowId === null) !== (activeWindowExpiresAtLogicalMs === null))
    fail("active control window is incomplete");
  const lastProposal =
    value.lastProposal === null
      ? null
      : validateGovernedMissionControlProposalV1(value.lastProposal);
  return freeze({
    format: ATTESTED_MISSION_CONTROL_STATE_FORMAT_V1,
    schemaVersion: 1 as const,
    stateKey: id(value.stateKey, "control state key"),
    tenantId: id(value.tenantId, "control tenant ID"),
    missionId: id(value.missionId, "control mission ID"),
    scopeDigest: sha(value.scopeDigest, "control state scope digest"),
    authorityEpoch: bounded(
      value.authorityEpoch,
      1,
      Number.MAX_SAFE_INTEGER,
      "control state authority epoch",
    ),
    fenceDigest: sha(value.fenceDigest, "control state fence digest"),
    policyDigest: sha(value.policyDigest, "control state policy digest"),
    sourceId: id(value.sourceId, "control state source ID"),
    sourceEpoch: bounded(
      value.sourceEpoch,
      1,
      Number.MAX_SAFE_INTEGER,
      "control state source epoch",
    ),
    revision: bounded(
      value.revision,
      0,
      Number.MAX_SAFE_INTEGER,
      "control state revision",
    ),
    logicalTimeHighWaterMs: bounded(
      value.logicalTimeHighWaterMs,
      0,
      Number.MAX_SAFE_INTEGER,
      "control state logical time",
    ),
    sequenceHighWater,
    activeWindowId,
    activeWindowExpiresAtLogicalMs,
    consecutiveHealthySteps: bounded(
      value.consecutiveHealthySteps,
      0,
      10_000,
      "consecutive healthy steps",
    ),
    discontinuityCount: bounded(
      value.discontinuityCount,
      0,
      Number.MAX_SAFE_INTEGER,
      "control discontinuity count",
    ),
    lastExecutionObservationDigest: nullableSha(
      value.lastExecutionObservationDigest,
      "last control observation digest",
    ),
    lastDecisionDigest: nullableSha(
      value.lastDecisionDigest,
      "last control decision digest",
    ),
    lastProposal,
    recentDecisions: freeze(recent),
    predecessorStateDigest: nullableSha(
      value.predecessorStateDigest,
      "control predecessor state digest",
    ),
  });
}

function validateRecord(
  input: unknown,
): AttestedMissionControlDecisionRecordV1 {
  const value = exact(
    input,
    ["action", "decisionDigest", "sequence", "windowId"],
    "control decision record",
  );
  return freeze({
    sequence: bounded(
      value.sequence,
      0,
      Number.MAX_SAFE_INTEGER,
      "record sequence",
    ),
    windowId: id(value.windowId, "record window ID"),
    action: action(value.action),
    decisionDigest: sha(value.decisionDigest, "record decision digest"),
  });
}

function exact<const K extends string>(
  input: unknown,
  keys: readonly K[],
  label: string,
): Record<K, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail(`${label} is invalid`);
  const value = input as Record<string, unknown>;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    fail(`${label} fields are invalid`);
  return value as Record<K, unknown>;
}

function id(value: unknown, label: string): string {
  if (typeof value !== "string" || !ID.test(value)) fail(`${label} is invalid`);
  return value;
}
function nullableId(value: unknown, label: string): string | null {
  return value === null ? null : id(value, label);
}
function sha(value: unknown, label: string): PlanningDigestV1 {
  if (typeof value !== "string" || !SHA.test(value))
    fail(`${label} is invalid`);
  return value as PlanningDigestV1;
}
function nullableSha(value: unknown, label: string): PlanningDigestV1 | null {
  return value === null ? null : sha(value, label);
}
function bounded(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  )
    fail(`${label} is invalid`);
  return value as number;
}
function nullableInteger(value: unknown, label: string): number | null {
  return value === null
    ? null
    : bounded(value, 0, Number.MAX_SAFE_INTEGER, label);
}
function action(value: unknown): GovernedMissionControlActionV1 {
  if (typeof value !== "string" || !ACTIONS.has(value))
    fail("control action is invalid");
  return value as GovernedMissionControlActionV1;
}
function discontinuity(
  value: unknown,
): "pause_dispatch" | "request_replanning" {
  if (value !== "pause_dispatch" && value !== "request_replanning")
    fail("control discontinuity action is invalid");
  return value;
}
function freeze<T>(value: T): Readonly<T> {
  if (Array.isArray(value))
    return Object.freeze(
      value.map((entry) => freeze(entry)),
    ) as unknown as Readonly<T>;
  if (value && typeof value === "object") {
    for (const entry of Object.values(value as Record<string, unknown>))
      freeze(entry);
    Object.freeze(value);
  }
  return value;
}
function fail(message: string): never {
  throw new TypeError(message);
}
