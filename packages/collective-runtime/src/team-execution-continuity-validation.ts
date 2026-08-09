import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";

import type {
  TeamExecutionContinuityAvailabilityCertificateV1,
  TeamExecutionContinuityCheckpointV1,
  TeamExecutionContinuityHolderV1,
  TeamExecutionContinuityStateV1,
  TeamExecutionWorkOwnerAuthorityV1,
} from "./team-execution-continuity-contracts.js";
import { TEAM_EXECUTION_CONTINUITY_STATE_FORMAT_V1 } from "./team-execution-continuity-contracts.js";
import { validateTeamExecutionScopeV1 } from "./team-execution-validation.js";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u;
const SHA = /^sha256:[0-9a-f]{64}$/u;

export function createTeamExecutionWorkOwnerAuthorityV1(
  input: TeamExecutionWorkOwnerAuthorityV1,
): TeamExecutionWorkOwnerAuthorityV1 {
  const value = exact(
    input,
    [
      "fencingToken",
      "generation",
      "headDigest",
      "holder",
      "membershipConfigurationDigest",
      "membershipEpoch",
      "meshId",
      "objectiveId",
      "resumeCheckpointDigest",
      "rootWorkItemId",
      "schemaVersion",
      "tenantId",
      "validUntilLogicalMs",
    ],
    "work owner authority",
  );
  schema(value.schemaVersion, "work owner authority");
  return freeze({
    schemaVersion: 1,
    tenantId: id(value.tenantId, "authority.tenantId"),
    meshId: id(value.meshId, "authority.meshId"),
    objectiveId: id(value.objectiveId, "authority.objectiveId"),
    rootWorkItemId: id(value.rootWorkItemId, "authority.rootWorkItemId"),
    generation: positive(value.generation, "authority.generation"),
    holder: holder(value.holder),
    headDigest: sha(value.headDigest, "authority.headDigest"),
    fencingToken: id(value.fencingToken, "authority.fencingToken"),
    membershipEpoch: positive(
      value.membershipEpoch,
      "authority.membershipEpoch",
    ),
    membershipConfigurationDigest: sha(
      value.membershipConfigurationDigest,
      "authority.membershipConfigurationDigest",
    ),
    resumeCheckpointDigest: nullableSha(
      value.resumeCheckpointDigest,
      "authority.resumeCheckpointDigest",
    ),
    validUntilLogicalMs: nonNegative(
      value.validUntilLogicalMs,
      "authority.validUntilLogicalMs",
    ),
  });
}

export function validateTeamExecutionWorkOwnerAuthorityV1(
  input: unknown,
): TeamExecutionWorkOwnerAuthorityV1 {
  return createTeamExecutionWorkOwnerAuthorityV1(
    input as TeamExecutionWorkOwnerAuthorityV1,
  );
}

export function createTeamExecutionContinuityAvailabilityCertificateV1(
  input: TeamExecutionContinuityAvailabilityCertificateV1,
): TeamExecutionContinuityAvailabilityCertificateV1 {
  const value = exact(
    input,
    [
      "availableReplicaIds",
      "certificateDigest",
      "certifiedAtLogicalMs",
      "checkpointDigest",
      "schemaVersion",
      "threshold",
    ],
    "continuity availability certificate",
  );
  schema(value.schemaVersion, "continuity availability certificate");
  const replicas = array(
    value.availableReplicaIds,
    "certificate.availableReplicaIds",
  ).map((entry) => id(entry, "certificate.availableReplicaId"));
  if (new Set(replicas).size !== replicas.length || replicas.length < 1)
    fail("certificate replicas are invalid");
  const threshold = positive(value.threshold, "certificate.threshold");
  if (threshold > replicas.length) fail("certificate threshold is invalid");
  const body = freeze({
    schemaVersion: 1 as const,
    checkpointDigest: sha(
      value.checkpointDigest,
      "certificate.checkpointDigest",
    ),
    availableReplicaIds: freeze([...replicas].sort()),
    threshold,
    certifiedAtLogicalMs: nonNegative(
      value.certifiedAtLogicalMs,
      "certificate.certifiedAtLogicalMs",
    ),
  });
  const certificateDigest = digest(
    "team-execution-continuity-availability",
    body,
  );
  if (value.certificateDigest !== certificateDigest)
    fail("certificate digest is invalid");
  return freeze({ ...body, certificateDigest });
}

export function validateTeamExecutionContinuityAvailabilityCertificateV1(
  input: unknown,
): TeamExecutionContinuityAvailabilityCertificateV1 {
  return createTeamExecutionContinuityAvailabilityCertificateV1(
    input as TeamExecutionContinuityAvailabilityCertificateV1,
  );
}

export function createTeamExecutionContinuityCheckpointV1(
  input: Omit<TeamExecutionContinuityCheckpointV1, "checkpointDigest">,
): TeamExecutionContinuityCheckpointV1 {
  const value = exact(
    input,
    [
      "authority",
      "availability",
      "checkpointId",
      "createdAtLogicalMs",
      "executionStateDigest",
      "handoff",
      "membershipConfigurationDigest",
      "membershipEpoch",
      "predecessorCheckpointDigest",
      "schemaVersion",
      "scope",
    ],
    "team execution continuity checkpoint",
  );
  schema(value.schemaVersion, "team execution continuity checkpoint");
  const scope = validateTeamExecutionScopeV1(value.scope);
  const authority = validateTeamExecutionWorkOwnerAuthorityV1(value.authority);
  assertAuthorityScope(authority, scope);
  const handoff = handoffEnvelope(value.handoff);
  if (
    handoff.sourceState.execution?.scope.scopeDigest !== scope.scopeDigest ||
    handoff.sourceState.stateDigest !== handoff.sourceStateDigest
  )
    fail("checkpoint handoff scope is invalid");
  const core = freeze({
    schemaVersion: 1 as const,
    checkpointId: id(value.checkpointId, "checkpoint.checkpointId"),
    scope,
    authority,
    membershipEpoch: positive(
      value.membershipEpoch,
      "checkpoint.membershipEpoch",
    ),
    membershipConfigurationDigest: sha(
      value.membershipConfigurationDigest,
      "checkpoint.membershipConfigurationDigest",
    ),
    predecessorCheckpointDigest: nullableSha(
      value.predecessorCheckpointDigest,
      "checkpoint.predecessorCheckpointDigest",
    ),
    executionStateDigest: sha(
      value.executionStateDigest,
      "checkpoint.executionStateDigest",
    ),
    handoff,
    createdAtLogicalMs: nonNegative(
      value.createdAtLogicalMs,
      "checkpoint.createdAtLogicalMs",
    ),
  });
  if (
    core.membershipEpoch !== authority.membershipEpoch ||
    core.membershipConfigurationDigest !==
      authority.membershipConfigurationDigest
  )
    fail("checkpoint membership binding is invalid");
  if (core.createdAtLogicalMs >= authority.validUntilLogicalMs)
    fail("checkpoint authority is expired");
  if (core.executionStateDigest !== handoff.sourceStateDigest)
    fail("checkpoint state binding is invalid");
  const checkpointDigest = digest("team-execution-continuity-checkpoint", core);
  const availability = validateTeamExecutionContinuityAvailabilityCertificateV1(
    value.availability,
  );
  if (availability.certifiedAtLogicalMs !== core.createdAtLogicalMs)
    fail("checkpoint availability time binding is invalid");
  const body = freeze({ ...core, availability });
  if (body.availability.checkpointDigest !== checkpointDigest)
    fail("checkpoint availability binding is invalid");
  return freeze({ ...body, checkpointDigest });
}

export function validateTeamExecutionContinuityCheckpointV1(
  input: unknown,
): TeamExecutionContinuityCheckpointV1 {
  const value = exact(
    input,
    [
      "authority",
      "availability",
      "checkpointDigest",
      "checkpointId",
      "createdAtLogicalMs",
      "executionStateDigest",
      "handoff",
      "membershipConfigurationDigest",
      "membershipEpoch",
      "predecessorCheckpointDigest",
      "schemaVersion",
      "scope",
    ],
    "team execution continuity checkpoint",
  );
  const { checkpointDigest, ...body } = value;
  const rebuilt = createTeamExecutionContinuityCheckpointV1(
    body as Omit<TeamExecutionContinuityCheckpointV1, "checkpointDigest">,
  );
  if (checkpointDigest !== rebuilt.checkpointDigest)
    fail("checkpoint digest is invalid");
  return rebuilt;
}

export function createTeamExecutionContinuityStateV1(
  input: Omit<
    TeamExecutionContinuityStateV1,
    "format" | "schemaVersion" | "stateDigest"
  >,
): TeamExecutionContinuityStateV1 {
  const scope = validateTeamExecutionScopeV1(input.scope);
  const body = freeze({
    format: TEAM_EXECUTION_CONTINUITY_STATE_FORMAT_V1,
    schemaVersion: 1 as const,
    stateKey: id(input.stateKey, "state.stateKey"),
    scope,
    revision: nonNegative(input.revision, "state.revision"),
    logicalTimeHighWaterMs: nonNegative(
      input.logicalTimeHighWaterMs,
      "state.logicalTimeHighWaterMs",
    ),
    authority:
      input.authority === null
        ? null
        : validateTeamExecutionWorkOwnerAuthorityV1(input.authority),
    checkpointHeadDigest: nullableSha(
      input.checkpointHeadDigest,
      "state.checkpointHeadDigest",
    ),
    predecessorStateDigest: nullableSha(
      input.predecessorStateDigest,
      "state.predecessorStateDigest",
    ),
  });
  if (body.authority) assertAuthorityScope(body.authority, scope);
  return freeze({
    ...body,
    stateDigest: digest("team-execution-continuity-state", body),
  });
}

export function validateTeamExecutionContinuityStateV1(
  input: unknown,
): TeamExecutionContinuityStateV1 {
  const value = exact(
    input,
    [
      "authority",
      "checkpointHeadDigest",
      "format",
      "logicalTimeHighWaterMs",
      "predecessorStateDigest",
      "revision",
      "schemaVersion",
      "scope",
      "stateDigest",
      "stateKey",
    ],
    "team execution continuity state",
  );
  if (
    value.format !== TEAM_EXECUTION_CONTINUITY_STATE_FORMAT_V1 ||
    value.schemaVersion !== 1
  )
    fail("continuity state format is invalid");
  const rebuilt = createTeamExecutionContinuityStateV1(
    value as Omit<
      TeamExecutionContinuityStateV1,
      "format" | "schemaVersion" | "stateDigest"
    >,
  );
  if (value.stateDigest !== rebuilt.stateDigest)
    fail("continuity state digest is invalid");
  return rebuilt;
}

export function assertTeamExecutionContinuityAuthorityScopeV1(
  authority: TeamExecutionWorkOwnerAuthorityV1,
  scope: {
    readonly tenantId: string;
    readonly meshId: string;
    readonly objectiveId: string;
    readonly rootWorkItemId: string;
  },
): void {
  assertAuthorityScope(authority, scope);
}

function assertAuthorityScope(
  authority: TeamExecutionWorkOwnerAuthorityV1,
  scope: {
    readonly tenantId: string;
    readonly meshId: string;
    readonly objectiveId: string;
    readonly rootWorkItemId: string;
  },
): void {
  if (
    authority.tenantId !== scope.tenantId ||
    authority.meshId !== scope.meshId ||
    authority.objectiveId !== scope.objectiveId ||
    authority.rootWorkItemId !== scope.rootWorkItemId
  )
    fail("work owner authority scope is invalid");
}
function holder(input: unknown): TeamExecutionContinuityHolderV1 {
  const value = exact(
    input,
    ["instanceId", "keyId", "peerId", "schemaVersion"],
    "authority holder",
  );
  schema(value.schemaVersion, "authority holder");
  return freeze({
    schemaVersion: 1,
    peerId: id(value.peerId, "holder.peerId"),
    instanceId: id(value.instanceId, "holder.instanceId"),
    keyId: id(value.keyId, "holder.keyId"),
  });
}
function handoffEnvelope(
  input: unknown,
): import("./team-execution-contracts.js").TeamExecutionHandoffEnvelopeV1 {
  const value = exact(
    input,
    [
      "contentClass",
      "exportedAtLogicalMs",
      "format",
      "handoffDigest",
      "implementationId",
      "policyDigest",
      "runtimeId",
      "runtimeVersion",
      "schemaVersion",
      "sourceState",
      "sourceStateDigest",
      "sourceStateKey",
      "targetStateKey",
    ],
    "checkpoint handoff",
  );
  if (
    value.format !==
      "application/vnd.agentplat.team-execution-handoff.v1+json" ||
    value.schemaVersion !== 1 ||
    value.contentClass !== "team_execution_state"
  )
    fail("checkpoint handoff is invalid");
  const sourceState = value.sourceState;
  if (
    !sourceState ||
    typeof sourceState !== "object" ||
    Array.isArray(sourceState) ||
    (sourceState as { stateDigest?: unknown }).stateDigest !==
      value.sourceStateDigest
  )
    fail("checkpoint handoff source state is invalid");
  const body = freeze({
    format: value.format,
    schemaVersion: 1 as const,
    contentClass: "team_execution_state" as const,
    runtimeId: id(value.runtimeId, "handoff.runtimeId"),
    runtimeVersion: positive(value.runtimeVersion, "handoff.runtimeVersion"),
    implementationId: id(value.implementationId, "handoff.implementationId"),
    policyDigest: sha(value.policyDigest, "handoff.policyDigest"),
    sourceStateKey: id(value.sourceStateKey, "handoff.sourceStateKey"),
    sourceStateDigest: sha(
      value.sourceStateDigest,
      "handoff.sourceStateDigest",
    ),
    targetStateKey: id(value.targetStateKey, "handoff.targetStateKey"),
    exportedAtLogicalMs: nonNegative(
      value.exportedAtLogicalMs,
      "handoff.exportedAtLogicalMs",
    ),
    sourceState,
  });
  if (
    body.sourceStateKey === body.targetStateKey ||
    value.handoffDigest !== digest("team-execution-handoff", body)
  )
    fail("checkpoint handoff digest is invalid");
  return freeze({
    ...body,
    handoffDigest: value.handoffDigest as PlanningDigestV1,
  }) as import("./team-execution-contracts.js").TeamExecutionHandoffEnvelopeV1;
}
function digest(domain: string, value: unknown): PlanningDigestV1 {
  return digestPlanningJsonV1(domain as never, value as PlanningJson);
}
function exact(
  input: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).sort().join("\u0000") !== [...keys].sort().join("\u0000")
  )
    fail(`${label} is invalid`);
  return input as Record<string, unknown>;
}
function id(value: unknown, label: string): string {
  if (typeof value !== "string" || !ID.test(value)) fail(`${label} is invalid`);
  return value;
}
function sha(value: unknown, label: string): PlanningDigestV1 {
  if (typeof value !== "string" || !SHA.test(value))
    fail(`${label} is invalid`);
  return value as PlanningDigestV1;
}
function nullableSha(value: unknown, label: string): PlanningDigestV1 | null {
  return value === null ? null : sha(value, label);
}
function positive(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    fail(`${label} is invalid`);
  return value as number;
}
function nonNegative(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    fail(`${label} is invalid`);
  return value as number;
}
function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) fail(`${label} is invalid`);
  return value;
}
function schema(value: unknown, label: string): void {
  if (value !== 1) fail(`${label} schemaVersion is invalid`);
}
function freeze<T>(value: T): T {
  return Object.freeze(value);
}
function fail(message: string): never {
  throw new TypeError(message);
}
