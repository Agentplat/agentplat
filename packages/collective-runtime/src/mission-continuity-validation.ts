import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";

import {
  MISSION_CONTINUITY_STATE_FORMAT_V1,
  type MissionContinuityAuthorityV1,
  type MissionContinuityAvailabilityCertificateV1,
  type MissionContinuityCheckpointV1,
  type MissionContinuityOperationV1,
  type MissionContinuitySnapshotV1,
  type MissionContinuityStateV1,
} from "./mission-continuity-contracts.js";
import { validateGovernedMissionStateV1 } from "./mission-lifecycle-validation.js";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u;
const SHA = /^sha256:[0-9a-f]{64}$/u;
const ACTIONS = new Set(["snapshot", "replicate", "checkpoint", "takeover"]);

export function missionContinuityDigestV1(
  domain: string,
  input: unknown,
): PlanningDigestV1 {
  return digestPlanningJsonV1("collective-planning-snapshot", {
    domain,
    input,
  } as PlanningJson);
}

export function missionContinuityOperationInputDigestV1(input: {
  readonly action: MissionContinuityOperationV1["action"];
  readonly operationId: string;
  readonly artifactDigest: PlanningDigestV1;
  readonly scopeDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
}): PlanningDigestV1 {
  return missionContinuityDigestV1("mission-continuity-operation", input);
}

export function createMissionContinuityAuthorityV1(
  input: Omit<MissionContinuityAuthorityV1, "authorityDigest">,
): MissionContinuityAuthorityV1 {
  const value = exact(
    input,
    [
      "authorityEpoch",
      "authorityId",
      "fencingToken",
      "generation",
      "holder",
      "policyDigest",
      "resumeCheckpointDigest",
      "schemaVersion",
      "scopeDigest",
      "validUntilLogicalMs",
    ],
    "continuity authority",
  );
  schema(value.schemaVersion, "continuity authority");
  const holderValue = exact(
    value.holder,
    ["holderId", "instanceId"],
    "continuity holder",
  );
  const body = freeze({
    schemaVersion: 1 as const,
    authorityId: id(value.authorityId, "authority.authorityId"),
    authorityEpoch: positive(value.authorityEpoch, "authority.authorityEpoch"),
    fencingToken: id(value.fencingToken, "authority.fencingToken"),
    scopeDigest: sha(value.scopeDigest, "authority.scopeDigest"),
    policyDigest: sha(value.policyDigest, "authority.policyDigest"),
    generation: positive(value.generation, "authority.generation"),
    holder: freeze({
      holderId: id(holderValue.holderId, "authority.holder.holderId"),
      instanceId: id(holderValue.instanceId, "authority.holder.instanceId"),
    }),
    resumeCheckpointDigest: nullableSha(
      value.resumeCheckpointDigest,
      "authority.resumeCheckpointDigest",
    ),
    validUntilLogicalMs: nonNegative(
      value.validUntilLogicalMs,
      "authority.validUntilLogicalMs",
    ),
  });
  return freeze({
    ...body,
    authorityDigest: missionContinuityDigestV1(
      "mission-continuity-authority",
      body,
    ),
  });
}

export function validateMissionContinuityAuthorityV1(
  input: unknown,
): MissionContinuityAuthorityV1 {
  const value = exact(
    input,
    [
      "authorityDigest",
      "authorityEpoch",
      "authorityId",
      "fencingToken",
      "generation",
      "holder",
      "policyDigest",
      "resumeCheckpointDigest",
      "schemaVersion",
      "scopeDigest",
      "validUntilLogicalMs",
    ],
    "continuity authority",
  );
  const { authorityDigest, ...body } = value;
  const rebuilt = createMissionContinuityAuthorityV1(
    body as Omit<MissionContinuityAuthorityV1, "authorityDigest">,
  );
  if (authorityDigest !== rebuilt.authorityDigest)
    fail("continuity authority digest is invalid");
  return rebuilt;
}

export function createMissionContinuityAvailabilityCertificateV1(
  input: Omit<MissionContinuityAvailabilityCertificateV1, "certificateDigest">,
): MissionContinuityAvailabilityCertificateV1 {
  const value = exact(
    input,
    [
      "authorityDigest",
      "availableReplicaIds",
      "certifiedAtLogicalMs",
      "checkpointDigest",
      "schemaVersion",
      "threshold",
    ],
    "continuity availability certificate",
  );
  schema(value.schemaVersion, "continuity availability certificate");
  if (!Array.isArray(value.availableReplicaIds))
    fail("continuity availability replicas are invalid");
  const replicas = value.availableReplicaIds.map((entry) =>
    id(entry, "availability replica ID"),
  );
  if (
    replicas.length < 1 ||
    replicas.length > 1024 ||
    new Set(replicas).size !== replicas.length
  )
    fail("continuity availability replicas are invalid");
  const threshold = positive(value.threshold, "availability.threshold");
  if (threshold > replicas.length)
    fail("continuity availability threshold is invalid");
  const body = freeze({
    schemaVersion: 1 as const,
    checkpointDigest: sha(
      value.checkpointDigest,
      "availability.checkpointDigest",
    ),
    authorityDigest: sha(value.authorityDigest, "availability.authorityDigest"),
    availableReplicaIds: freeze([...replicas].sort()),
    threshold,
    certifiedAtLogicalMs: nonNegative(
      value.certifiedAtLogicalMs,
      "availability.certifiedAtLogicalMs",
    ),
  });
  return freeze({
    ...body,
    certificateDigest: missionContinuityDigestV1(
      "mission-continuity-availability",
      body,
    ),
  });
}

export function validateMissionContinuityAvailabilityCertificateV1(
  input: unknown,
): MissionContinuityAvailabilityCertificateV1 {
  const value = exact(
    input,
    [
      "authorityDigest",
      "availableReplicaIds",
      "certificateDigest",
      "certifiedAtLogicalMs",
      "checkpointDigest",
      "schemaVersion",
      "threshold",
    ],
    "continuity availability certificate",
  );
  const { certificateDigest, ...body } = value;
  const rebuilt = createMissionContinuityAvailabilityCertificateV1(
    body as Omit<
      MissionContinuityAvailabilityCertificateV1,
      "certificateDigest"
    >,
  );
  if (certificateDigest !== rebuilt.certificateDigest)
    fail("continuity availability certificate digest is invalid");
  return rebuilt;
}

function checkpointDigest(input: {
  readonly checkpointId: string;
  readonly missionStateDigest: PlanningDigestV1;
  readonly missionStateRevision: number;
  readonly missionStateKey: string;
  readonly scopeDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
  readonly authorityDigest: PlanningDigestV1;
  readonly predecessorCheckpointDigest: PlanningDigestV1 | null;
  readonly createdAtLogicalMs: number;
}): PlanningDigestV1 {
  return missionContinuityDigestV1("mission-continuity-checkpoint", input);
}

export function createMissionContinuitySnapshotV1(
  input: Omit<
    MissionContinuitySnapshotV1,
    "checkpointDigest" | "snapshotDigest"
  >,
): MissionContinuitySnapshotV1 {
  const missionState = validateGovernedMissionStateV1(input.missionState);
  const authority = validateMissionContinuityAuthorityV1(input.authority);
  const snapshotId = id(input.snapshotId, "snapshot.snapshotId");
  const checkpointId = id(input.checkpointId, "snapshot.checkpointId");
  const missionStateDigest = sha(
    input.missionStateDigest,
    "snapshot.missionStateDigest",
  );
  if (missionStateDigest !== missionState.stateDigest)
    fail("continuity snapshot state digest binding is invalid");
  const policyDigest = sha(input.policyDigest, "snapshot.policyDigest");
  assertStateAuthorityBindings(missionState, authority, policyDigest);
  const createdAtLogicalMs = nonNegative(
    input.createdAtLogicalMs,
    "snapshot.createdAtLogicalMs",
  );
  if (
    createdAtLogicalMs < missionState.logicalTimeHighWaterMs ||
    createdAtLogicalMs >= authority.validUntilLogicalMs
  )
    fail("continuity snapshot logical time is invalid");
  const predecessorCheckpointDigest = nullableSha(
    input.predecessorCheckpointDigest,
    "snapshot.predecessorCheckpointDigest",
  );
  const candidateDigest = checkpointDigest({
    checkpointId,
    missionStateDigest,
    missionStateRevision: missionState.revision,
    missionStateKey: missionState.stateKey,
    scopeDigest: missionState.scope.scopeDigest,
    policyDigest,
    authorityDigest: authority.authorityDigest,
    predecessorCheckpointDigest,
    createdAtLogicalMs,
  });
  const body = freeze({
    schemaVersion: 1 as const,
    snapshotId,
    checkpointId,
    missionState,
    missionStateDigest,
    predecessorCheckpointDigest,
    policyDigest,
    authority,
    createdAtLogicalMs,
    checkpointDigest: candidateDigest,
  });
  return freeze({
    ...body,
    snapshotDigest: missionContinuityDigestV1(
      "mission-continuity-snapshot",
      body,
    ),
  });
}

export function validateMissionContinuitySnapshotV1(
  input: unknown,
): MissionContinuitySnapshotV1 {
  const value = exact(
    input,
    [
      "authority",
      "checkpointDigest",
      "checkpointId",
      "createdAtLogicalMs",
      "missionState",
      "missionStateDigest",
      "policyDigest",
      "predecessorCheckpointDigest",
      "schemaVersion",
      "snapshotDigest",
      "snapshotId",
    ],
    "continuity snapshot",
  );
  schema(value.schemaVersion, "continuity snapshot");
  const {
    checkpointDigest: suppliedCheckpoint,
    snapshotDigest,
    ...body
  } = value;
  const rebuilt = createMissionContinuitySnapshotV1(
    body as Omit<
      MissionContinuitySnapshotV1,
      "checkpointDigest" | "snapshotDigest"
    >,
  );
  if (
    suppliedCheckpoint !== rebuilt.checkpointDigest ||
    snapshotDigest !== rebuilt.snapshotDigest
  )
    fail("continuity snapshot digest is invalid");
  return rebuilt;
}

export function createMissionContinuityCheckpointV1(
  input: Omit<MissionContinuityCheckpointV1, "checkpointDigest">,
): MissionContinuityCheckpointV1 {
  const authority = validateMissionContinuityAuthorityV1(input.authority);
  const availability = validateMissionContinuityAvailabilityCertificateV1(
    input.availability,
  );
  const body = freeze({
    schemaVersion: 1 as const,
    checkpointId: id(input.checkpointId, "checkpoint.checkpointId"),
    snapshotDigest: sha(input.snapshotDigest, "checkpoint.snapshotDigest"),
    missionStateDigest: sha(
      input.missionStateDigest,
      "checkpoint.missionStateDigest",
    ),
    missionStateRevision: nonNegative(
      input.missionStateRevision,
      "checkpoint.missionStateRevision",
    ),
    missionStateKey: id(input.missionStateKey, "checkpoint.missionStateKey"),
    scopeDigest: sha(input.scopeDigest, "checkpoint.scopeDigest"),
    policyDigest: sha(input.policyDigest, "checkpoint.policyDigest"),
    authority,
    predecessorCheckpointDigest: nullableSha(
      input.predecessorCheckpointDigest,
      "checkpoint.predecessorCheckpointDigest",
    ),
    createdAtLogicalMs: nonNegative(
      input.createdAtLogicalMs,
      "checkpoint.createdAtLogicalMs",
    ),
    availability,
  });
  const candidateDigest = checkpointDigest({
    checkpointId: body.checkpointId,
    missionStateDigest: body.missionStateDigest,
    missionStateRevision: body.missionStateRevision,
    missionStateKey: body.missionStateKey,
    scopeDigest: body.scopeDigest,
    policyDigest: body.policyDigest,
    authorityDigest: authority.authorityDigest,
    predecessorCheckpointDigest: body.predecessorCheckpointDigest,
    createdAtLogicalMs: body.createdAtLogicalMs,
  });
  if (
    availability.checkpointDigest !== candidateDigest ||
    availability.authorityDigest !== authority.authorityDigest
  )
    fail("continuity checkpoint availability binding is invalid");
  if (
    availability.certifiedAtLogicalMs < body.createdAtLogicalMs ||
    availability.certifiedAtLogicalMs >= authority.validUntilLogicalMs
  )
    fail("continuity checkpoint availability time is invalid");
  return freeze({ ...body, checkpointDigest: candidateDigest });
}

export function validateMissionContinuityCheckpointV1(
  input: unknown,
): MissionContinuityCheckpointV1 {
  const value = exact(
    input,
    [
      "authority",
      "availability",
      "checkpointDigest",
      "checkpointId",
      "createdAtLogicalMs",
      "missionStateDigest",
      "missionStateKey",
      "missionStateRevision",
      "policyDigest",
      "predecessorCheckpointDigest",
      "schemaVersion",
      "scopeDigest",
      "snapshotDigest",
    ],
    "continuity checkpoint",
  );
  schema(value.schemaVersion, "continuity checkpoint");
  const { checkpointDigest: supplied, ...body } = value;
  const rebuilt = createMissionContinuityCheckpointV1(
    body as Omit<MissionContinuityCheckpointV1, "checkpointDigest">,
  );
  if (supplied !== rebuilt.checkpointDigest)
    fail("continuity checkpoint digest is invalid");
  return rebuilt;
}

export function createMissionContinuityStateV1(
  input: Omit<
    MissionContinuityStateV1,
    "format" | "schemaVersion" | "stateDigest"
  >,
): MissionContinuityStateV1 {
  const pendingOperation = input.pendingOperation
    ? operation(input.pendingOperation)
    : null;
  if (!Array.isArray(input.outbox)) fail("continuity state outbox is invalid");
  const outbox = input.outbox.map(operation);
  if (outbox.length > 1024) fail("continuity state outbox is too large");
  const identifiers = new Set<string>();
  let prepared = 0;
  for (const item of outbox) {
    if (identifiers.has(item.operationId))
      fail("continuity operation ID is duplicated");
    identifiers.add(item.operationId);
    if (item.status === "prepared") prepared += 1;
  }
  if (
    (pendingOperation === null && prepared !== 0) ||
    (pendingOperation !== null &&
      (prepared !== 1 ||
        !outbox.some(
          (item) =>
            item.operationId === pendingOperation.operationId &&
            item.action === pendingOperation.action &&
            item.inputDigest === pendingOperation.inputDigest &&
            item.status === "prepared",
        )))
  )
    fail("continuity pending operation binding is invalid");
  const revision = nonNegative(input.revision, "continuity state revision");
  const predecessorStateDigest = nullableSha(
    input.predecessorStateDigest,
    "continuity state predecessor digest",
  );
  if ((revision === 0) !== (predecessorStateDigest === null))
    fail("continuity state predecessor binding is invalid");
  const body = freeze({
    format: MISSION_CONTINUITY_STATE_FORMAT_V1,
    schemaVersion: 1 as const,
    stateKey: id(input.stateKey, "continuity state key"),
    missionStateKey: id(input.missionStateKey, "mission state key"),
    scopeDigest: sha(input.scopeDigest, "continuity state scope"),
    policyDigest: sha(input.policyDigest, "continuity state policy"),
    revision,
    logicalTimeHighWaterMs: nonNegative(
      input.logicalTimeHighWaterMs,
      "continuity state logical time",
    ),
    authority: input.authority
      ? validateMissionContinuityAuthorityV1(input.authority)
      : null,
    checkpointHeadDigest: nullableSha(
      input.checkpointHeadDigest,
      "continuity state checkpoint head",
    ),
    restoredMissionStateDigest: nullableSha(
      input.restoredMissionStateDigest,
      "continuity state restored mission state",
    ),
    pendingOperation,
    outbox: freeze(outbox),
    predecessorStateDigest,
  });
  if (body.checkpointHeadDigest !== null && body.authority === null)
    fail("continuity state checkpoint authority is missing");
  return freeze({
    ...body,
    stateDigest: missionContinuityDigestV1("mission-continuity-state", body),
  });
}

export function validateMissionContinuityStateV1(
  input: unknown,
): MissionContinuityStateV1 {
  const value = exact(
    input,
    [
      "authority",
      "checkpointHeadDigest",
      "format",
      "logicalTimeHighWaterMs",
      "missionStateKey",
      "outbox",
      "pendingOperation",
      "policyDigest",
      "predecessorStateDigest",
      "restoredMissionStateDigest",
      "revision",
      "schemaVersion",
      "scopeDigest",
      "stateDigest",
      "stateKey",
    ],
    "continuity state",
  );
  if (
    value.format !== MISSION_CONTINUITY_STATE_FORMAT_V1 ||
    value.schemaVersion !== 1
  )
    fail("continuity state format is invalid");
  const {
    format: _format,
    schemaVersion: _version,
    stateDigest,
    ...body
  } = value;
  const rebuilt = createMissionContinuityStateV1(
    body as Omit<
      MissionContinuityStateV1,
      "format" | "schemaVersion" | "stateDigest"
    >,
  );
  if (stateDigest !== rebuilt.stateDigest)
    fail("continuity state digest is invalid");
  return rebuilt;
}

function operation(input: unknown): MissionContinuityOperationV1 {
  const value = exact(
    input,
    [
      "action",
      "artifactDigest",
      "inputDigest",
      "operationId",
      "preparedAtLogicalMs",
      "status",
    ],
    "continuity operation",
  );
  const action = value.action;
  if (typeof action !== "string" || !ACTIONS.has(action))
    fail("continuity operation action is invalid");
  const status = value.status;
  if (status !== "prepared" && status !== "applied")
    fail("continuity operation status is invalid");
  const artifactDigest = nullableSha(
    value.artifactDigest,
    "continuity operation artifact",
  );
  if (
    (status === "prepared" && artifactDigest !== null) ||
    (status === "applied" && artifactDigest === null)
  )
    fail("continuity operation result binding is invalid");
  return freeze({
    operationId: id(value.operationId, "continuity operation ID"),
    action: action as MissionContinuityOperationV1["action"],
    inputDigest: sha(value.inputDigest, "continuity operation input"),
    preparedAtLogicalMs: nonNegative(
      value.preparedAtLogicalMs,
      "continuity operation logical time",
    ),
    status,
    artifactDigest,
  });
}

function assertStateAuthorityBindings(
  state: ReturnType<typeof validateGovernedMissionStateV1>,
  authority: MissionContinuityAuthorityV1,
  policyDigest: PlanningDigestV1,
): void {
  if (
    state.policyDigest !== policyDigest ||
    authority.policyDigest !== policyDigest ||
    state.scope.scopeDigest !== authority.scopeDigest ||
    state.scope.authorityId !== authority.authorityId ||
    state.scope.authorityEpoch !== authority.authorityEpoch ||
    state.scope.fencingToken !== authority.fencingToken
  )
    fail("continuity mission, policy, and authority binding is invalid");
}

function exact<T extends Record<string, unknown>>(
  input: unknown,
  keys: readonly string[],
  label: string,
): T {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail(`${label} is invalid`);
  const actual = Object.keys(input as object).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    fail(`${label} shape is invalid`);
  return input as T;
}
function schema(value: unknown, label: string): void {
  if (value !== 1) fail(`${label} version is invalid`);
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
function freeze<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}
function fail(message: string): never {
  throw new TypeError(message);
}
