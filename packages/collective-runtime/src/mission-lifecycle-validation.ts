import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import {
  GOVERNED_MISSION_ACTIONS_V1,
  GOVERNED_MISSION_CONTROL_ACTIONS_V1,
  GOVERNED_MISSION_LIFECYCLE_SCHEMA_VERSION_V1,
  GOVERNED_MISSION_LIFECYCLE_STATE_FORMAT_V1,
  type GovernedMissionAuthorizationV1,
  type GovernedMissionControlProposalV1,
  type GovernedMissionPolicyV1,
  type GovernedMissionRequestV1,
  type GovernedMissionScopeV1,
  type GovernedMissionStateV1,
} from "./mission-lifecycle-contracts.js";

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]*$/u;
const phases = new Set([
  "planning",
  "allocation",
  "formation",
  "execution",
  "control",
  "reconfiguration",
  "paused",
  "completed",
  "failed",
]);
function sha(value: unknown, label: string): asserts value is PlanningDigestV1 {
  if (typeof value !== "string" || !DIGEST.test(value))
    throw new TypeError(`${label} must be a sha256 digest`);
}
function id(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !ID.test(value))
    throw new TypeError(`${label} is invalid`);
}
function integer(
  value: unknown,
  label: string,
  minimum = 0,
): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum)
    throw new TypeError(`${label} is invalid`);
}
function object(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${label} is invalid`);
}

export function governedMissionScopeDigestV1(
  scope: Omit<GovernedMissionScopeV1, "scopeDigest">,
): PlanningDigestV1 {
  return digestPlanningJsonV1(
    "mission-intent",
    scope as unknown as PlanningJson,
  );
}
export function governedMissionRequestDigestV1(
  request: Omit<GovernedMissionRequestV1, "requestDigest">,
): PlanningDigestV1 {
  return digestPlanningJsonV1(
    "proposal-identity",
    request as unknown as PlanningJson,
  );
}
export function governedMissionStateDigestV1(
  state: Omit<GovernedMissionStateV1, "stateDigest">,
): PlanningDigestV1 {
  return digestPlanningJsonV1(
    "collective-planning-snapshot",
    state as unknown as PlanningJson,
  );
}
export function governedMissionIntentDigestV1(input: {
  readonly action: string;
  readonly requestId: string;
  readonly planInputDigest: PlanningDigestV1;
  readonly scopeDigest: PlanningDigestV1;
  readonly authorityEpoch: number;
  readonly operationId: string;
  readonly controlProposalDigest: PlanningDigestV1 | null;
}): PlanningDigestV1 {
  return digestPlanningJsonV1(
    "proposal-identity",
    input as unknown as PlanningJson,
  );
}
export function governedMissionControlProposalDigestV1(
  input: Omit<GovernedMissionControlProposalV1, "proposalDigest">,
): PlanningDigestV1 {
  return digestPlanningJsonV1(
    "proposal-identity",
    input as unknown as PlanningJson,
  );
}
export function governedMissionAuthorizationDigestV1(
  input: Omit<GovernedMissionAuthorizationV1, "authorizationDigest">,
): PlanningDigestV1 {
  return digestPlanningJsonV1(
    "proposal-identity",
    input as unknown as PlanningJson,
  );
}
export function validateGovernedMissionScopeV1(
  input: unknown,
): GovernedMissionScopeV1 {
  object(input, "mission scope");
  const value = input as unknown as GovernedMissionScopeV1;
  for (const key of [
    "tenantId",
    "missionId",
    "missionIntentId",
    "objectiveId",
    "workItemId",
    "authorityId",
    "fencingToken",
  ] as const)
    id(value[key], `mission scope ${key}`);
  integer(value.workItemRevision, "mission work item revision", 1);
  integer(value.authorityEpoch, "mission authority epoch", 1);
  sha(value.scopeDigest, "mission scope digest");
  const { scopeDigest, ...body } = value;
  if (scopeDigest !== governedMissionScopeDigestV1(body))
    throw new TypeError("mission scope digest is invalid");
  return Object.freeze({ ...value });
}
export function validateGovernedMissionPolicyV1(
  input: unknown,
): GovernedMissionPolicyV1 {
  object(input, "mission policy");
  const value = input as unknown as GovernedMissionPolicyV1;
  if (value.schemaVersion !== GOVERNED_MISSION_LIFECYCLE_SCHEMA_VERSION_V1)
    throw new TypeError("mission policy version is invalid");
  id(value.policyId, "mission policy ID");
  integer(value.policyVersion, "mission policy version", 1);
  sha(value.policyDigest, "mission policy digest");
  id(value.requestId, "mission policy request ID");
  sha(value.planInputDigest, "mission policy plan input digest");
  object(value.budget, "mission budget");
  for (const key of [
    "maximumActionUnits",
    "maximumReconfigurations",
    "maximumCommitAttempts",
    "maximumTransitionsPerInvocation",
  ] as const)
    integer(value.budget[key], `mission budget ${key}`, 1);
  return Object.freeze({
    ...value,
    budget: Object.freeze({ ...value.budget }),
  });
}
export function validateGovernedMissionRequestV1(
  input: unknown,
): GovernedMissionRequestV1 {
  object(input, "mission request");
  const value = input as unknown as GovernedMissionRequestV1;
  if (value.schemaVersion !== 1)
    throw new TypeError("mission request version is invalid");
  id(value.requestId, "mission request ID");
  const scope = validateGovernedMissionScopeV1(value.scope);
  sha(value.policyDigest, "mission request policy digest");
  sha(value.planInputDigest, "mission request plan input digest");
  integer(value.logicalTimeMs, "mission request logical time");
  sha(value.requestDigest, "mission request digest");
  const { requestDigest, ...body } = value;
  if (requestDigest !== governedMissionRequestDigestV1(body))
    throw new TypeError("mission request digest is invalid");
  return Object.freeze({ ...value, scope });
}
export function validateGovernedMissionControlProposalV1(
  input: unknown,
): GovernedMissionControlProposalV1 {
  object(input, "mission control proposal");
  const value = input as unknown as GovernedMissionControlProposalV1;
  id(value.proposalId, "mission control proposal ID");
  sha(value.scopeDigest, "mission control scope digest");
  integer(value.authorityEpoch, "mission control epoch", 1);
  if (!GOVERNED_MISSION_CONTROL_ACTIONS_V1.includes(value.action))
    throw new TypeError("mission control action is invalid");
  integer(value.evaluatedAtLogicalMs, "mission control time");
  integer(value.expiresAtLogicalMs, "mission control expiry");
  if (value.expiresAtLogicalMs <= value.evaluatedAtLogicalMs)
    throw new TypeError("mission control proposal is expired");
  sha(value.proposalDigest, "mission control proposal digest");
  const { proposalDigest, ...body } = value;
  if (proposalDigest !== governedMissionControlProposalDigestV1(body))
    throw new TypeError("mission control proposal digest is invalid");
  if (value.advisoryOnly !== true)
    throw new TypeError("mission control proposal must be advisory");
  return Object.freeze({ ...value });
}
export function validateGovernedMissionAuthorizationV1(
  input: unknown,
): GovernedMissionAuthorizationV1 {
  object(input, "mission authorization");
  const value = input as unknown as GovernedMissionAuthorizationV1;
  id(value.authorizationId, "mission authorization ID");
  if (!GOVERNED_MISSION_ACTIONS_V1.includes(value.action))
    throw new TypeError("mission authorization action is invalid");
  id(value.operationId, "mission authorization operation ID");
  sha(value.intentDigest, "mission authorization intent");
  sha(value.scopeDigest, "mission authorization scope");
  integer(value.authorityEpoch, "mission authorization epoch", 1);
  id(value.fencingToken, "mission authorization fencing token");
  integer(value.issuedAtLogicalMs, "mission authorization issue time");
  integer(value.expiresAtLogicalMs, "mission authorization expiry");
  if (value.expiresAtLogicalMs <= value.issuedAtLogicalMs)
    throw new TypeError("mission authorization is expired");
  sha(value.authorizationDigest, "mission authorization digest");
  const { authorizationDigest, ...body } = value;
  if (authorizationDigest !== governedMissionAuthorizationDigestV1(body))
    throw new TypeError("mission authorization digest is invalid");
  return Object.freeze({ ...value });
}
export function validateGovernedMissionStateV1(
  input: unknown,
): GovernedMissionStateV1 {
  object(input, "mission lifecycle state");
  const value = input as unknown as GovernedMissionStateV1;
  if (
    value.format !== GOVERNED_MISSION_LIFECYCLE_STATE_FORMAT_V1 ||
    value.schemaVersion !== 1
  )
    throw new TypeError("mission lifecycle state format is invalid");
  id(value.stateKey, "mission state key");
  const scope = validateGovernedMissionScopeV1(value.scope);
  sha(value.policyDigest, "mission state policy digest");
  id(value.requestId, "mission state request ID");
  sha(value.planInputDigest, "mission state plan input digest");
  integer(value.revision, "mission state revision");
  integer(value.logicalTimeHighWaterMs, "mission state logical time");
  if (!phases.has(value.phase))
    throw new TypeError("mission state phase is invalid");
  integer(value.actionUnitsConsumed, "mission action units");
  integer(value.reconfigurationCount, "mission reconfiguration count");
  if (value.reconfigurationCount > value.actionUnitsConsumed)
    throw new TypeError("mission reconfiguration count exceeds actions");
  for (const key of [
    "planDecisionDigest",
    "allocationDigest",
    "teamDigest",
    "executionObservationDigest",
  ] as const) {
    const item = value[key];
    if (item !== null) sha(item, `mission ${key}`);
  }
  if (value.controlProposal !== null) {
    const proposal = validateGovernedMissionControlProposalV1(
      value.controlProposal,
    );
    if (
      proposal.scopeDigest !== scope.scopeDigest ||
      proposal.authorityEpoch !== scope.authorityEpoch
    )
      throw new TypeError(
        "mission control proposal state scope or epoch is invalid",
      );
  }
  if (value.pendingOperation !== null) {
    const item = value.pendingOperation;
    id(item.operationId, "mission operation ID");
    if (!GOVERNED_MISSION_ACTIONS_V1.includes(item.action))
      throw new TypeError("mission operation action is invalid");
    sha(item.intentDigest, "mission operation intent");
    validateOperationIntent(value, item, "mission operation");
    integer(item.preparedAtLogicalMs, "mission operation time");
    if (
      item.status !== "prepared" ||
      item.resultDigest !== null ||
      item.authorizationDigest !== null
    )
      throw new TypeError("mission pending operation is invalid");
  }
  if (!Array.isArray(value.outbox))
    throw new TypeError("mission outbox is invalid");
  const ids = new Set<string>();
  let prepared = 0;
  let pendingMatched = false;
  for (const raw of value.outbox) {
    object(raw, "mission outbox item");
    const item = raw as unknown as GovernedMissionStateV1["outbox"][number];
    id(item.operationId, "mission outbox operation ID");
    if (ids.has(item.operationId))
      throw new TypeError("mission outbox operation is duplicated");
    ids.add(item.operationId);
    if (!GOVERNED_MISSION_ACTIONS_V1.includes(item.action))
      throw new TypeError("mission outbox action is invalid");
    sha(item.intentDigest, "mission outbox intent");
    validateOperationIntent(value, item, "mission outbox");
    if (item.status === "prepared") {
      prepared += 1;
      if (item.authorizationDigest !== null || item.resultDigest !== null)
        throw new TypeError("prepared mission outbox record is invalid");
      if (
        value.pendingOperation?.operationId === item.operationId &&
        value.pendingOperation.action === item.action &&
        value.pendingOperation.intentDigest === item.intentDigest &&
        value.pendingOperation.controlProposalDigest ===
          item.controlProposalDigest
      )
        pendingMatched = true;
    } else if (item.status === "applied") {
      if (item.authorizationDigest === null || item.resultDigest === null)
        throw new TypeError(
          "applied mission outbox record lacks retained evidence",
        );
      sha(item.authorizationDigest, "mission outbox authorization");
      sha(item.resultDigest, "mission outbox result");
    } else throw new TypeError("mission outbox status is invalid");
  }
  if (
    (value.pendingOperation === null && prepared !== 0) ||
    (value.pendingOperation !== null && (prepared !== 1 || !pendingMatched))
  )
    throw new TypeError("mission pending/outbox consistency is invalid");
  assertPhaseArtifacts(value);
  if (
    value.predecessorStateDigest === null
      ? value.revision !== 0
      : value.revision < 1
  )
    throw new TypeError("mission predecessor binding is invalid");
  if (value.predecessorStateDigest !== null)
    sha(value.predecessorStateDigest, "mission predecessor digest");
  sha(value.stateDigest, "mission state digest");
  const { stateDigest, ...body } = value;
  if (stateDigest !== governedMissionStateDigestV1(body))
    throw new TypeError("mission state digest is invalid");
  return Object.freeze({
    ...value,
    scope,
    outbox: Object.freeze(
      value.outbox.map((entry) => Object.freeze({ ...entry })),
    ),
  });
}

function validateOperationIntent(
  state: GovernedMissionStateV1,
  item: GovernedMissionStateV1["outbox"][number],
  label: string,
): void {
  const reconfiguration = item.action.startsWith("enact_");
  if (reconfiguration) {
    sha(item.controlProposalDigest, `${label} control proposal digest`);
  } else if (item.controlProposalDigest !== null) {
    throw new TypeError(`${label} unexpectedly binds a control proposal`);
  }
  if (
    state.pendingOperation?.operationId === item.operationId &&
    reconfiguration &&
    item.controlProposalDigest !== state.controlProposal?.proposalDigest
  )
    throw new TypeError(`${label} control proposal binding is invalid`);
  const expected = governedMissionIntentDigestV1({
    action: item.action,
    requestId: state.requestId,
    planInputDigest: state.planInputDigest,
    scopeDigest: state.scope.scopeDigest,
    authorityEpoch: state.scope.authorityEpoch,
    operationId: item.operationId,
    controlProposalDigest: item.controlProposalDigest,
  });
  if (item.intentDigest !== expected)
    throw new TypeError(`${label} intent binding is invalid`);
}

function assertPhaseArtifacts(value: GovernedMissionStateV1): void {
  const hasPlan = value.planDecisionDigest !== null;
  const hasAllocation = value.allocationDigest !== null;
  const hasTeam = value.teamDigest !== null;
  const hasObservation = value.executionObservationDigest !== null;
  const hasProposal = value.controlProposal !== null;
  if (
    value.phase === "planning" &&
    (hasPlan || hasAllocation || hasTeam || hasObservation || hasProposal)
  )
    throw new TypeError("planning phase retains downstream artifacts");
  if (
    value.phase === "allocation" &&
    (!hasPlan || hasAllocation || hasTeam || hasObservation || hasProposal)
  )
    throw new TypeError("allocation phase artifacts are incoherent");
  if (
    value.phase === "formation" &&
    (!hasPlan || !hasAllocation || hasTeam || hasObservation || hasProposal)
  )
    throw new TypeError("formation phase artifacts are incoherent");
  if (
    value.phase === "execution" &&
    (!hasPlan || !hasAllocation || !hasTeam || hasObservation || hasProposal)
  )
    throw new TypeError("execution phase artifacts are incoherent");
  if (
    value.phase === "control" &&
    (!hasPlan || !hasAllocation || !hasTeam || !hasObservation || hasProposal)
  )
    throw new TypeError("control phase artifacts are incoherent");
  if (
    value.phase === "reconfiguration" &&
    (!hasPlan ||
      !hasAllocation ||
      !hasTeam ||
      !hasObservation ||
      !hasProposal ||
      value.pendingOperation === null)
  )
    throw new TypeError("reconfiguration phase artifacts are incoherent");
  if (
    value.phase === "paused" &&
    (!hasPlan ||
      !hasAllocation ||
      !hasTeam ||
      !hasObservation ||
      !hasProposal ||
      value.controlProposal.action !== "pause_dispatch" ||
      value.pendingOperation !== null)
  )
    throw new TypeError("paused phase artifacts are incoherent");
  if (
    value.phase === "completed" &&
    (!hasPlan ||
      !hasAllocation ||
      !hasTeam ||
      !hasObservation ||
      !hasProposal ||
      value.controlProposal.action !== "continue")
  )
    throw new TypeError("completed phase artifacts are incoherent");
}
