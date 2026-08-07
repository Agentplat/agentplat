import {
  digestPlanningJsonV1,
  type PlanningDigestDomainV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type {
  MeshJsonValue,
  VerifiedMeshEnvelope,
} from "@agentplat/mesh-protocol";

import type {
  TeamExecutionExchangeIdentityV1,
  TeamExecutionExchangeMessageDraftV1,
  TeamExecutionExchangeMessageV1,
  TeamExecutionExchangePayloadV1,
  TeamExecutionExchangePolicyRecordV1,
  TeamExecutionExchangePolicyV1,
  TeamExecutionExchangeRecipientV1,
  TeamExecutionExchangeStateV1,
} from "./team-execution-exchange-contracts.js";
import {
  TEAM_EXECUTION_EXCHANGE_MESH_EXTENSION_V1,
  TEAM_EXECUTION_EXCHANGE_STATE_FORMAT_V1,
} from "./team-execution-exchange-contracts.js";
import type { TeamExecutionScopeV1 } from "./team-execution-contracts.js";
import {
  validateTeamExecutionArtifactV1,
  validateTeamExecutionRecoverySignalV1,
  validateTeamExecutionScopeV1,
  validateTeamExecutionStepDispatchV1,
  validateTeamExecutionStepResultV1,
} from "./team-execution-validation.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u;
const MESH_MESSAGE_ID = /^[A-Za-z0-9_-]{21}[AQgw]$/u;

export function createTeamExecutionExchangePolicyV1(
  input: TeamExecutionExchangePolicyV1,
): TeamExecutionExchangePolicyRecordV1 {
  const value = exact(
    input,
    [
      "limits",
      "parentPolicyDigest",
      "policyId",
      "policyVersion",
      "schemaVersion",
    ],
    "team execution exchange policy",
  );
  schema(value.schemaVersion, "team execution exchange policy");
  const limits = exact(
    value.limits,
    [
      "maximumCommitAttempts",
      "maximumFutureSkewMs",
      "maximumMessageTtlMs",
      "maximumPendingMessages",
      "maximumRecoveryBatchSize",
      "maximumRetainedInboxMessages",
      "maximumRetainedOutboxMessages",
      "maximumSourceStreams",
    ],
    "team execution exchange limits",
  );
  const policy = freeze({
    schemaVersion: 1 as const,
    policyId: identifier(value.policyId, "policy.policyId"),
    policyVersion: positive(value.policyVersion, "policy.policyVersion"),
    parentPolicyDigest:
      value.parentPolicyDigest === null
        ? null
        : sha(value.parentPolicyDigest, "policy.parentPolicyDigest"),
    limits: freeze({
      maximumRetainedInboxMessages: boundedPositive(
        limits.maximumRetainedInboxMessages,
        "limits.maximumRetainedInboxMessages",
        100_000,
      ),
      maximumPendingMessages: boundedPositive(
        limits.maximumPendingMessages,
        "limits.maximumPendingMessages",
        100_000,
      ),
      maximumRetainedOutboxMessages: boundedPositive(
        limits.maximumRetainedOutboxMessages,
        "limits.maximumRetainedOutboxMessages",
        100_000,
      ),
      maximumSourceStreams: boundedPositive(
        limits.maximumSourceStreams,
        "limits.maximumSourceStreams",
        10_000,
      ),
      maximumMessageTtlMs: boundedPositive(
        limits.maximumMessageTtlMs,
        "limits.maximumMessageTtlMs",
        604_800_000,
      ),
      maximumFutureSkewMs: boundedNonNegative(
        limits.maximumFutureSkewMs,
        "limits.maximumFutureSkewMs",
        3_600_000,
      ),
      maximumRecoveryBatchSize: boundedPositive(
        limits.maximumRecoveryBatchSize,
        "limits.maximumRecoveryBatchSize",
        10_000,
      ),
      maximumCommitAttempts: boundedPositive(
        limits.maximumCommitAttempts,
        "limits.maximumCommitAttempts",
        128,
      ),
    }),
  });
  if (
    policy.limits.maximumRetainedInboxMessages <=
    policy.limits.maximumPendingMessages
  )
    fail("team execution exchange inbox capacity must exceed pending capacity");
  return freeze({
    schemaVersion: 1 as const,
    policy,
    policyDigest: digest("team-execution-exchange-policy", policy),
  });
}

export function validateTeamExecutionExchangePolicyV1(
  input: unknown,
): TeamExecutionExchangePolicyRecordV1 {
  const value = exact(
    input,
    ["policy", "policyDigest", "schemaVersion"],
    "team execution exchange policy record",
  );
  schema(value.schemaVersion, "team execution exchange policy record");
  const result = createTeamExecutionExchangePolicyV1(
    value.policy as TeamExecutionExchangePolicyV1,
  );
  if (value.policyDigest !== result.policyDigest)
    fail("team execution exchange policy digest is invalid");
  return result;
}

export function validateTeamExecutionExchangeIdentityV1(
  input: unknown,
): TeamExecutionExchangeIdentityV1 {
  const value = exact(
    input,
    ["instanceId", "memberBindingDigest", "memberId", "peerId"],
    "team execution exchange identity",
  );
  return freeze({
    peerId: identifier(value.peerId, "identity.peerId"),
    instanceId: identifier(value.instanceId, "identity.instanceId"),
    memberId: identifier(value.memberId, "identity.memberId"),
    memberBindingDigest: sha(
      value.memberBindingDigest,
      "identity.memberBindingDigest",
    ),
  });
}

export function validateTeamExecutionExchangeRecipientV1(
  input: unknown,
): TeamExecutionExchangeRecipientV1 {
  const value = exact(
    input,
    ["memberBindingDigest", "memberId", "peerId"],
    "team execution exchange recipient",
  );
  return freeze({
    peerId: identifier(value.peerId, "recipient.peerId"),
    memberId: identifier(value.memberId, "recipient.memberId"),
    memberBindingDigest: sha(
      value.memberBindingDigest,
      "recipient.memberBindingDigest",
    ),
  });
}

export function validateTeamExecutionExchangePayloadV1(
  input: unknown,
): TeamExecutionExchangePayloadV1 {
  const value = record(input, "team execution exchange payload");
  const kind = token(value.kind, "payload.kind");
  if (kind === "dispatch") {
    exactKeys(
      value,
      ["dispatch", "kind"],
      "team execution exchange dispatch payload",
    );
    return freeze({
      kind,
      dispatch: validateTeamExecutionStepDispatchV1(value.dispatch),
    });
  }
  if (kind === "artifact_available") {
    exactKeys(
      value,
      ["artifact", "kind"],
      "team execution exchange artifact payload",
    );
    return freeze({
      kind,
      artifact: validateTeamExecutionArtifactV1(value.artifact),
    });
  }
  if (kind === "result") {
    exactKeys(
      value,
      ["kind", "result"],
      "team execution exchange result payload",
    );
    return freeze({
      kind,
      result: validateTeamExecutionStepResultV1(value.result),
    });
  }
  if (kind === "recovery") {
    exactKeys(
      value,
      ["kind", "recoverySignal"],
      "team execution exchange recovery payload",
    );
    return freeze({
      kind,
      recoverySignal: validateTeamExecutionRecoverySignalV1(
        value.recoverySignal,
      ),
    });
  }
  fail("team execution exchange payload kind is unsupported");
}

export function createTeamExecutionExchangeMessageV1(input: {
  readonly draft: TeamExecutionExchangeMessageDraftV1;
  readonly streamId: string;
  readonly sequence: number;
  readonly predecessorDigest: PlanningDigestV1 | null;
  readonly scope: TeamExecutionScopeV1;
  readonly policyDigest: PlanningDigestV1;
  readonly sender: TeamExecutionExchangeIdentityV1;
}): TeamExecutionExchangeMessageV1 {
  const draft = exact(
    input.draft,
    [
      "executionEpoch",
      "executionId",
      "logicalTimeMs",
      "membershipConfigurationDigest",
      "membershipEpoch",
      "messageId",
      "payload",
      "recipient",
      "teamEpoch",
      "validUntilLogicalMs",
    ],
    "team execution exchange message draft",
  );
  const payload = validateTeamExecutionExchangePayloadV1(draft.payload);
  const scope = validateTeamExecutionScopeV1(input.scope);
  const recipient = validateTeamExecutionExchangeRecipientV1(draft.recipient);
  const sender = validateTeamExecutionExchangeIdentityV1(input.sender);
  const sequence = positive(input.sequence, "message.sequence");
  const predecessorDigest =
    input.predecessorDigest === null
      ? null
      : sha(input.predecessorDigest, "message.predecessorDigest");
  if ((sequence === 1) !== (predecessorDigest === null))
    fail("team execution exchange predecessor binding is invalid");
  const createdAtLogicalMs = nonNegative(
    draft.logicalTimeMs,
    "message.createdAtLogicalMs",
  );
  const validUntilLogicalMs = positive(
    draft.validUntilLogicalMs,
    "message.validUntilLogicalMs",
  );
  if (validUntilLogicalMs <= createdAtLogicalMs)
    fail("team execution exchange message expiry is invalid");
  const executionId = identifier(draft.executionId, "message.executionId");
  const executionEpoch = positive(
    draft.executionEpoch,
    "message.executionEpoch",
  );
  const teamEpoch = positive(draft.teamEpoch, "message.teamEpoch");
  assertPayloadBinding({
    payload,
    scope,
    recipient,
    executionId,
    executionEpoch,
    teamEpoch,
  });
  const payloadDigest = digest("team-execution-exchange-payload", payload);
  const body = freeze({
    schemaVersion: 1 as const,
    messageId: meshMessageId(draft.messageId, "message.messageId"),
    streamId: identifier(input.streamId, "message.streamId"),
    sequence,
    predecessorDigest,
    scope,
    policyDigest: sha(input.policyDigest, "message.policyDigest"),
    executionId,
    executionEpoch,
    teamEpoch,
    membershipEpoch: positive(draft.membershipEpoch, "message.membershipEpoch"),
    membershipConfigurationDigest: sha(
      draft.membershipConfigurationDigest,
      "message.membershipConfigurationDigest",
    ),
    sender,
    recipient,
    payload,
    payloadDigest,
    createdAtLogicalMs,
    validUntilLogicalMs,
  });
  return freeze({
    ...body,
    messageDigest: digest("team-execution-exchange-message", body),
  });
}

export function validateTeamExecutionExchangeMessageV1(
  input: unknown,
): TeamExecutionExchangeMessageV1 {
  const value = exact(
    input,
    [
      "createdAtLogicalMs",
      "executionEpoch",
      "executionId",
      "membershipConfigurationDigest",
      "membershipEpoch",
      "messageDigest",
      "messageId",
      "payload",
      "payloadDigest",
      "policyDigest",
      "predecessorDigest",
      "recipient",
      "schemaVersion",
      "scope",
      "sender",
      "sequence",
      "streamId",
      "teamEpoch",
      "validUntilLogicalMs",
    ],
    "team execution exchange message",
  );
  schema(value.schemaVersion, "team execution exchange message");
  const result = createTeamExecutionExchangeMessageV1({
    draft: {
      messageId: value.messageId as string,
      recipient: value.recipient as TeamExecutionExchangeRecipientV1,
      executionId: value.executionId as string,
      executionEpoch: value.executionEpoch as number,
      teamEpoch: value.teamEpoch as number,
      membershipEpoch: value.membershipEpoch as number,
      membershipConfigurationDigest:
        value.membershipConfigurationDigest as PlanningDigestV1,
      payload: value.payload as TeamExecutionExchangePayloadV1,
      logicalTimeMs: value.createdAtLogicalMs as number,
      validUntilLogicalMs: value.validUntilLogicalMs as number,
    },
    streamId: value.streamId as string,
    sequence: value.sequence as number,
    predecessorDigest: value.predecessorDigest as PlanningDigestV1 | null,
    scope: value.scope as TeamExecutionScopeV1,
    policyDigest: value.policyDigest as PlanningDigestV1,
    sender: value.sender as TeamExecutionExchangeIdentityV1,
  });
  if (
    value.payloadDigest !== result.payloadDigest ||
    value.messageDigest !== result.messageDigest
  )
    fail("team execution exchange message digest is invalid");
  return result;
}

export function createTeamExecutionExchangeMeshExtensionV1(
  message: TeamExecutionExchangeMessageV1,
): MeshJsonValue {
  return freeze({
    schemaVersion: 1,
    message: validateTeamExecutionExchangeMessageV1(message),
  }) as unknown as MeshJsonValue;
}

/** Extracts the domain record only from a locally authenticated Mesh envelope. */
export function extractTeamExecutionExchangeMessageV1(
  envelope: VerifiedMeshEnvelope,
): TeamExecutionExchangeMessageV1 {
  if (
    !envelope.criticalExtensions?.includes(
      TEAM_EXECUTION_EXCHANGE_MESH_EXTENSION_V1,
    )
  )
    fail("team execution exchange critical extension is missing");
  const extension = exact(
    envelope.extensions?.[TEAM_EXECUTION_EXCHANGE_MESH_EXTENSION_V1],
    ["message", "schemaVersion"],
    "team execution exchange Mesh extension",
  );
  schema(extension.schemaVersion, "team execution exchange Mesh extension");
  const message = validateTeamExecutionExchangeMessageV1(extension.message);
  if (
    envelope.messageId !== message.messageId ||
    envelope.tenantId !== message.scope.tenantId ||
    envelope.meshId !== message.scope.meshId ||
    (envelope.objectiveId !== undefined &&
      envelope.objectiveId !== message.scope.objectiveId) ||
    envelope.sender.peerId !== message.sender.peerId ||
    envelope.sender.instanceId !== message.sender.instanceId ||
    envelope.audience.kind !== "peer" ||
    envelope.audience.peerId !== message.recipient.peerId
  )
    fail("team execution exchange Mesh envelope binding is invalid");
  return message;
}

export function createTeamExecutionExchangeStateV1(
  input: Omit<
    TeamExecutionExchangeStateV1,
    "format" | "schemaVersion" | "stateDigest"
  >,
): TeamExecutionExchangeStateV1 {
  const body = freeze({
    format: TEAM_EXECUTION_EXCHANGE_STATE_FORMAT_V1,
    schemaVersion: 1 as const,
    ...input,
  });
  return freeze({
    ...body,
    stateDigest: digest("team-execution-exchange-state", body),
  });
}

export function validateTeamExecutionExchangeStateV1(
  input: unknown,
): TeamExecutionExchangeStateV1 {
  const value = record(input, "team execution exchange state");
  const expected = [
    "format",
    "implementationId",
    "inbox",
    "localIdentity",
    "logicalTimeHighWaterMs",
    "outboundHeadDigest",
    "outboundSequence",
    "outbox",
    "pending",
    "policyDigest",
    "policyId",
    "policyVersion",
    "predecessorStateDigest",
    "revision",
    "runtimeId",
    "runtimeVersion",
    "schemaVersion",
    "scope",
    "sourceHeads",
    "stateDigest",
    "stateKey",
    "streamId",
  ];
  exactKeys(value, expected, "team execution exchange state");
  if (value.format !== TEAM_EXECUTION_EXCHANGE_STATE_FORMAT_V1)
    fail("team execution exchange state format is invalid");
  schema(value.schemaVersion, "team execution exchange state");
  const sourceHeads = array(value.sourceHeads, "state.sourceHeads").map(
    (entry) => {
      const head = exact(
        entry,
        [
          "messageDigest",
          "senderInstanceId",
          "senderPeerId",
          "sequence",
          "streamId",
        ],
        "source head",
      );
      return freeze({
        streamId: identifier(head.streamId, "sourceHead.streamId"),
        senderPeerId: identifier(head.senderPeerId, "sourceHead.senderPeerId"),
        senderInstanceId: identifier(
          head.senderInstanceId,
          "sourceHead.senderInstanceId",
        ),
        sequence: positive(head.sequence, "sourceHead.sequence"),
        messageDigest: sha(head.messageDigest, "sourceHead.messageDigest"),
      });
    },
  );
  const inbox = array(value.inbox, "state.inbox").map((entry) => {
    const item = exact(
      entry,
      [
        "envelopeMessageId",
        "envelopeSenderKeyId",
        "message",
        "receivedAtLogicalMs",
        "status",
      ],
      "inbox record",
    );
    if (item.status !== "ready" && item.status !== "handled")
      fail("inbox status is invalid");
    return freeze({
      message: validateTeamExecutionExchangeMessageV1(item.message),
      envelopeMessageId: meshMessageId(
        item.envelopeMessageId,
        "inbox.envelopeMessageId",
      ),
      envelopeSenderKeyId: identifier(
        item.envelopeSenderKeyId,
        "inbox.envelopeSenderKeyId",
      ),
      receivedAtLogicalMs: nonNegative(
        item.receivedAtLogicalMs,
        "inbox.receivedAtLogicalMs",
      ),
      status: item.status as "ready" | "handled",
    });
  });
  const pending = array(value.pending, "state.pending").map((entry) => {
    const item = exact(
      entry,
      [
        "envelopeMessageId",
        "envelopeSenderKeyId",
        "message",
        "receivedAtLogicalMs",
      ],
      "pending record",
    );
    return freeze({
      message: validateTeamExecutionExchangeMessageV1(item.message),
      envelopeMessageId: meshMessageId(
        item.envelopeMessageId,
        "pending.envelopeMessageId",
      ),
      envelopeSenderKeyId: identifier(
        item.envelopeSenderKeyId,
        "pending.envelopeSenderKeyId",
      ),
      receivedAtLogicalMs: nonNegative(
        item.receivedAtLogicalMs,
        "pending.receivedAtLogicalMs",
      ),
    });
  });
  const outbox = array(value.outbox, "state.outbox").map((entry) => {
    const item = exact(entry, ["message", "status"], "outbox record");
    if (item.status !== "pending" && item.status !== "sent")
      fail("outbox status is invalid");
    return freeze({
      message: validateTeamExecutionExchangeMessageV1(item.message),
      status: item.status as "pending" | "sent",
    });
  });
  const body = freeze({
    format: TEAM_EXECUTION_EXCHANGE_STATE_FORMAT_V1,
    schemaVersion: 1 as const,
    stateKey: identifier(value.stateKey, "state.stateKey"),
    runtimeId: identifier(value.runtimeId, "state.runtimeId"),
    runtimeVersion: positive(value.runtimeVersion, "state.runtimeVersion"),
    implementationId: identifier(
      value.implementationId,
      "state.implementationId",
    ),
    localIdentity: validateTeamExecutionExchangeIdentityV1(value.localIdentity),
    scope: validateTeamExecutionScopeV1(value.scope),
    policyId: identifier(value.policyId, "state.policyId"),
    policyVersion: positive(value.policyVersion, "state.policyVersion"),
    policyDigest: sha(value.policyDigest, "state.policyDigest"),
    streamId: identifier(value.streamId, "state.streamId"),
    revision: nonNegative(value.revision, "state.revision"),
    logicalTimeHighWaterMs: nonNegative(
      value.logicalTimeHighWaterMs,
      "state.logicalTimeHighWaterMs",
    ),
    outboundSequence: nonNegative(
      value.outboundSequence,
      "state.outboundSequence",
    ),
    outboundHeadDigest:
      value.outboundHeadDigest === null
        ? null
        : sha(value.outboundHeadDigest, "state.outboundHeadDigest"),
    sourceHeads: freeze(sourceHeads),
    inbox: freeze(inbox),
    pending: freeze(pending),
    outbox: freeze(outbox),
    predecessorStateDigest:
      value.predecessorStateDigest === null
        ? null
        : sha(value.predecessorStateDigest, "state.predecessorStateDigest"),
  });
  const state = freeze({
    ...body,
    stateDigest: digest("team-execution-exchange-state", body),
  });
  if (value.stateDigest !== state.stateDigest)
    fail("team execution exchange state digest is invalid");
  return state;
}

function assertPayloadBinding(input: {
  payload: TeamExecutionExchangePayloadV1;
  scope: TeamExecutionScopeV1;
  recipient: TeamExecutionExchangeRecipientV1;
  executionId: string;
  executionEpoch: number;
  teamEpoch: number;
}): void {
  const payload = input.payload;
  const value =
    payload.kind === "dispatch"
      ? payload.dispatch
      : payload.kind === "artifact_available"
        ? payload.artifact
        : payload.kind === "recovery"
          ? payload.recoverySignal
          : null;
  if (
    value &&
    (value.executionId !== input.executionId ||
      value.executionEpoch !== input.executionEpoch ||
      value.teamId !== input.scope.teamId ||
      value.teamEpoch !== input.teamEpoch)
  )
    fail("team execution exchange payload execution binding is invalid");
  if (
    payload.kind === "dispatch" &&
    (payload.dispatch.memberId !== input.recipient.memberId ||
      payload.dispatch.memberBindingDigest !==
        input.recipient.memberBindingDigest)
  )
    fail("team execution exchange dispatch recipient binding is invalid");
}

function digest(
  domain: PlanningDigestDomainV1,
  value: unknown,
): PlanningDigestV1 {
  return digestPlanningJsonV1(domain, value as PlanningJson);
}

function exact(
  input: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  const value = record(input, label);
  exactKeys(value, keys, label);
  return value;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    fail(`${label} fields are invalid`);
}

function record(input: unknown, label: string): Record<string, unknown> {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  )
    fail(`${label} must be a plain object`);
  return input as Record<string, unknown>;
}

function array(input: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(input)) fail(`${label} must be an array`);
  return input;
}

function identifier(input: unknown, label: string): string {
  if (typeof input !== "string" || !IDENTIFIER.test(input))
    fail(`${label} is invalid`);
  return input;
}

function meshMessageId(input: unknown, label: string): string {
  if (typeof input !== "string" || !MESH_MESSAGE_ID.test(input))
    fail(`${label} is invalid`);
  return input;
}

function token(input: unknown, label: string): string {
  if (typeof input !== "string" || !TOKEN.test(input))
    fail(`${label} is invalid`);
  return input;
}

function sha(input: unknown, label: string): PlanningDigestV1 {
  if (typeof input !== "string" || !DIGEST.test(input))
    fail(`${label} is invalid`);
  return input as PlanningDigestV1;
}

function nonNegative(input: unknown, label: string): number {
  if (!Number.isSafeInteger(input) || (input as number) < 0)
    fail(`${label} is invalid`);
  return input as number;
}

function positive(input: unknown, label: string): number {
  if (!Number.isSafeInteger(input) || (input as number) <= 0)
    fail(`${label} is invalid`);
  return input as number;
}

function boundedPositive(
  input: unknown,
  label: string,
  maximum: number,
): number {
  const value = positive(input, label);
  if (value > maximum) fail(`${label} exceeds its bound`);
  return value;
}

function boundedNonNegative(
  input: unknown,
  label: string,
  maximum: number,
): number {
  const value = nonNegative(input, label);
  if (value > maximum) fail(`${label} exceeds its bound`);
  return value;
}

function schema(input: unknown, label: string): void {
  if (input !== 1) fail(`${label} schema version is unsupported`);
}

function freeze<T>(value: T): Readonly<T> {
  if (Array.isArray(value)) {
    for (const item of value) freeze(item);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>))
      freeze(item);
  }
  return Object.freeze(value);
}

function fail(message: string): never {
  throw new TypeError(message);
}
