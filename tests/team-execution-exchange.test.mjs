import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { digestPlanningJsonV1 } from "@agentplat/collective-planning";
import {
  DEFAULT_MESH_CRYPTO_POLICY,
  createStaticMeshKeyResolver,
  createWebCryptoMeshEnvelopeSigner,
  verifyMeshEnvelope,
} from "@agentplat/mesh-crypto";
import {
  MESH_PROTOCOL,
  MESH_SIGNATURE_ALGORITHM,
  MESH_WIRE_VERSION,
} from "@agentplat/mesh-protocol";
import {
  InMemoryTeamExecutionExchangeStoreV1,
  TEAM_EXECUTION_EXCHANGE_MESH_EXTENSION_V1,
  TeamExecutionExchangeRuntimeV1,
  attachTeamExecutionExchangeMeshExtensionV1,
  createTeamExecutionCoordinatorExchangeHandlerV1,
  createTeamExecutionExchangeMessageV1,
  createTeamExecutionMemberExchangeHandlerV1,
  createTeamExecutionExchangePolicyV1,
  extractTeamExecutionExchangeMessageV1,
} from "@agentplat/collective-runtime/team-execution-exchange";
import {
  createTeamExecutionArtifactV1,
  createTeamExecutionControlEvidenceV1,
  createTeamExecutionStepDispatchV1,
  createTeamExecutionStepResultV1,
} from "@agentplat/collective-runtime/team-execution";

const digest = (label) => digestPlanningJsonV1("team-candidate", { label });
const meshMessageId = (label) =>
  createHash("sha256")
    .update(label)
    .digest()
    .subarray(0, 16)
    .toString("base64url");
const scopeBody = {
  tenantId: "tenant",
  meshId: "mesh",
  policyDomainId: "policy-domain",
  missionIntentId: "mission",
  objectiveId: "objective",
  rootWorkItemId: "work.root",
  rootWorkItemRevision: 1,
  teamId: "team",
};
const scope = Object.freeze({
  ...scopeBody,
  scopeDigest: digestPlanningJsonV1("team-execution-scope", scopeBody),
});
const recipient = Object.freeze({
  peerId: "peer.member",
  memberId: "member",
  memberBindingDigest: digest("member-binding"),
});
const sender = Object.freeze({
  peerId: "peer.coordinator",
  instanceId: "instance.coordinator",
  memberId: "coordinator",
  memberBindingDigest: digest("coordinator-binding"),
});
const receiver = Object.freeze({
  ...recipient,
  instanceId: "instance.member",
});
const dispatch = createTeamExecutionStepDispatchV1({
  commandDigest: digest("command"),
  executionId: "execution",
  executionEpoch: 1,
  teamId: scope.teamId,
  teamEpoch: 1,
  jointWorkContractDigest: digest("joint-contract"),
  positionId: "position",
  positionDigest: digest("position"),
  positionStepSequence: 1,
  memberId: recipient.memberId,
  memberBindingDigest: recipient.memberBindingDigest,
  workItemId: "work.member",
  workItemRevision: 1,
  dependencyArtifactDigests: [],
  inputReferenceDigest: digest("input"),
  preparedAtLogicalMs: 10,
  validUntilLogicalMs: 200,
});
const alternateDispatch = createTeamExecutionStepDispatchV1({
  ...dispatch,
  commandDigest: digest("alternate-command"),
});
const policy = createTeamExecutionExchangePolicyV1({
  schemaVersion: 1,
  policyId: "exchange-policy",
  policyVersion: 1,
  parentPolicyDigest: null,
  limits: {
    maximumRetainedInboxMessages: 16,
    maximumPendingMessages: 8,
    maximumRetainedOutboxMessages: 16,
    maximumSourceStreams: 4,
    maximumMessageTtlMs: 500,
    maximumFutureSkewMs: 5,
    maximumRecoveryBatchSize: 4,
    maximumCommitAttempts: 4,
  },
});

function membership(authorized = true) {
  return {
    async evaluate({ message, logicalTimeMs }) {
      return Object.freeze({
        authorized,
        reasonCode: authorized ? "current_member" : "member_revoked",
        peerId: message.sender.peerId,
        instanceId: message.sender.instanceId,
        memberId: message.sender.memberId,
        memberBindingDigest: message.sender.memberBindingDigest,
        membershipEpoch: message.membershipEpoch,
        membershipConfigurationDigest: message.membershipConfigurationDigest,
        validUntilLogicalMs: logicalTimeMs + 100,
        decisionDigest: digest(`membership.${message.messageId}`),
      });
    },
  };
}

function runtime({
  stateKey,
  localIdentity,
  membershipPort = membership(),
  handled = [],
  published = [],
  recovery,
}) {
  return new TeamExecutionExchangeRuntimeV1({
    stateKey,
    runtimeId: "team-exchange",
    runtimeVersion: 1,
    implementationId: "team-exchange.default",
    localIdentity,
    scope,
    streamId: `stream.${localIdentity.peerId}`,
    policy,
    store: new InMemoryTeamExecutionExchangeStoreV1(),
    membership: membershipPort,
    handler: {
      async handle({ message }) {
        handled.push(message.messageId);
      },
    },
    outbound: {
      async publish(input) {
        published.push(input);
      },
    },
    ...(recovery ? { recovery } : {}),
  });
}

function draft(messageId, logicalTimeMs = 20) {
  return {
    messageId: meshMessageId(messageId),
    recipient,
    executionId: dispatch.executionId,
    executionEpoch: dispatch.executionEpoch,
    teamEpoch: dispatch.teamEpoch,
    membershipEpoch: 1,
    membershipConfigurationDigest: digest("membership-config"),
    payload: Object.freeze({ kind: "dispatch", dispatch }),
    logicalTimeMs,
    validUntilLogicalMs: logicalTimeMs + 100,
  };
}

function verifiedEnvelope(message) {
  const attached = attachTeamExecutionExchangeMeshExtensionV1({ message });
  return Object.freeze({
    protocol: "agentplat.mesh",
    wireVersion: 1,
    messageId: message.messageId,
    tenantId: scope.tenantId,
    meshId: scope.meshId,
    type: "peer.ping",
    sender: Object.freeze({
      peerId: message.sender.peerId,
      instanceId: message.sender.instanceId,
    }),
    audience: Object.freeze({ kind: "peer", peerId: recipient.peerId }),
    sequence: message.sequence,
    sentAt: "2030-01-01T00:00:00.000Z",
    expiresAt: "2030-01-01T00:01:00.000Z",
    extensions: attached.extensions,
    criticalExtensions: attached.criticalExtensions,
    payloadHash: digest("mesh-payload"),
    payload: Object.freeze({ type: "peer.ping" }),
    proof: Object.freeze({
      algorithm: "Ed25519",
      keyId: "key",
      value: "proof",
    }),
  });
}

async function messages() {
  const outbound = runtime({
    stateKey: "sender-state",
    localIdentity: sender,
    published: [],
  });
  const first = await outbound.enqueue(draft("exchange.1", 20));
  const second = await outbound.enqueue(draft("exchange.2", 21));
  return { outbound, first, second };
}

test("builds a signed critical-extension boundary and durable causal outbox", async () => {
  const published = [];
  const exchange = runtime({
    stateKey: "outbound-state",
    localIdentity: sender,
    published,
  });
  const first = await exchange.enqueue(draft("outbound.1", 20));
  const replay = await exchange.enqueue(draft("outbound.1", 20));
  const second = await exchange.enqueue(draft("outbound.2", 21));

  assert.equal(replay.messageDigest, first.messageDigest);
  assert.equal(second.sequence, 2);
  assert.equal(second.predecessorDigest, first.messageDigest);
  assert.deepEqual(await exchange.flushOutbox(), {
    attempted: 2,
    completed: 2,
    failed: 0,
  });
  assert.equal(published.length, 2);
  assert.equal(
    published[0].extensionKey,
    TEAM_EXECUTION_EXCHANGE_MESH_EXTENSION_V1,
  );
  assert.equal(
    extractTeamExecutionExchangeMessageV1(verifiedEnvelope(first))
      .messageDigest,
    first.messageDigest,
  );
});

test("the critical extension is covered by the ordinary Mesh signature", async () => {
  const { first } = await messages();
  const attached = attachTeamExecutionExchangeMeshExtensionV1({
    message: first,
  });
  const keys = await crypto.subtle.generateKey(MESH_SIGNATURE_ALGORITHM, true, [
    "sign",
    "verify",
  ]);
  const signer = createWebCryptoMeshEnvelopeSigner();
  const signed = await signer.sign({
    envelope: {
      protocol: MESH_PROTOCOL,
      wireVersion: MESH_WIRE_VERSION,
      messageId: first.messageId,
      tenantId: scope.tenantId,
      meshId: scope.meshId,
      type: "peer.ping",
      sender: { peerId: sender.peerId, instanceId: sender.instanceId },
      audience: { kind: "peer", peerId: recipient.peerId },
      sequence: first.sequence,
      sentAt: "2030-01-01T00:00:00.000Z",
      expiresAt: "2030-01-01T00:00:20.000Z",
      extensions: attached.extensions,
      criticalExtensions: attached.criticalExtensions,
      payload: { type: "peer.ping" },
      proof: { algorithm: MESH_SIGNATURE_ALGORITHM, keyId: "key.sender" },
    },
    privateKey: keys.privateKey,
  });
  const resolver = createStaticMeshKeyResolver([
    {
      tenantId: scope.tenantId,
      meshId: scope.meshId,
      peerId: sender.peerId,
      keyId: "key.sender",
      algorithm: MESH_SIGNATURE_ALGORITHM,
      publicKey: keys.publicKey,
      validFrom: "2029-01-01T00:00:00.000Z",
      validUntil: "2031-01-01T00:00:00.000Z",
      status: "active",
    },
  ]);
  const verified = await verifyMeshEnvelope({
    envelope: signed,
    resolver,
    policy: DEFAULT_MESH_CRYPTO_POLICY,
    verifiedAt: "2030-01-01T00:00:01.000Z",
  });
  assert.equal(verified.verified, true);
  assert.equal(
    extractTeamExecutionExchangeMessageV1(verified.envelope).messageDigest,
    first.messageDigest,
  );

  const tampered = structuredClone(signed);
  tampered.extensions[
    TEAM_EXECUTION_EXCHANGE_MESH_EXTENSION_V1
  ].message.messageId = meshMessageId("tampered");
  const rejected = await verifyMeshEnvelope({
    envelope: tampered,
    resolver,
    policy: DEFAULT_MESH_CRYPTO_POLICY,
    verifiedAt: "2030-01-01T00:00:01.000Z",
  });
  assert.equal(rejected.verified, false);
  assert.equal(rejected.code, "signature_invalid");
});

test("holds out-of-order delivery, drains it causally and deduplicates replay", async () => {
  const { first, second } = await messages();
  const handled = [];
  const exchange = runtime({
    stateKey: "receiver-state",
    localIdentity: receiver,
    handled,
    published: [],
  });

  assert.deepEqual(
    await exchange.admit({
      envelope: verifiedEnvelope(second),
      logicalTimeMs: 30,
    }),
    {
      status: "pending",
      messageDigest: second.messageDigest,
      missingSequence: 1,
    },
  );
  assert.equal((await exchange.loadState()).pending.length, 1);
  assert.equal(
    (
      await exchange.admit({
        envelope: verifiedEnvelope(first),
        logicalTimeMs: 31,
      })
    ).status,
    "accepted",
  );
  assert.deepEqual(await exchange.processInbox(), {
    attempted: 2,
    completed: 2,
    failed: 0,
  });
  assert.deepEqual(handled, [
    meshMessageId("exchange.1"),
    meshMessageId("exchange.2"),
  ]);
  assert.equal(
    (
      await exchange.admit({
        envelope: verifiedEnvelope(second),
        logicalTimeMs: 32,
      })
    ).status,
    "duplicate",
  );
});

test("fails closed on membership rejection and envelope rebinding", async () => {
  const { first } = await messages();
  const denied = runtime({
    stateKey: "denied-state",
    localIdentity: receiver,
    membershipPort: membership(false),
    published: [],
  });
  assert.deepEqual(
    await denied.admit({
      envelope: verifiedEnvelope(first),
      logicalTimeMs: 30,
    }),
    {
      status: "rejected",
      reasonCode: "membership_not_authorized",
    },
  );

  const rebound = { ...verifiedEnvelope(first), messageId: "different" };
  const outcome = await denied.admit({ envelope: rebound, logicalTimeMs: 30 });
  assert.equal(outcome.status, "rejected");
  assert.match(outcome.reasonCode, /envelope_binding/u);
});

test("enforces local logical expiry and future-skew bounds", async () => {
  const { first } = await messages();
  const expired = runtime({
    stateKey: "expired-state",
    localIdentity: receiver,
    published: [],
  });
  assert.deepEqual(
    await expired.admit({
      envelope: verifiedEnvelope(first),
      logicalTimeMs: first.validUntilLogicalMs,
    }),
    { status: "rejected", reasonCode: "message_expired" },
  );
  assert.deepEqual(
    await expired.admit({
      envelope: verifiedEnvelope(first),
      logicalTimeMs: first.createdAtLogicalMs - 6,
    }),
    { status: "rejected", reasonCode: "message_from_future" },
  );
});

test("rejects id and pending-sequence equivocation", async () => {
  const senderA = runtime({
    stateKey: "equivocation-sender-a",
    localIdentity: sender,
    published: [],
  });
  await senderA.enqueue(draft("equivocation.1", 20));
  await assert.rejects(
    senderA.enqueue({
      ...draft("equivocation.1", 20),
      payload: Object.freeze({ kind: "dispatch", dispatch: alternateDispatch }),
    }),
    /message id conflicts/u,
  );
  const second = await senderA.enqueue(draft("equivocation.2", 21));

  const senderB = runtime({
    stateKey: "equivocation-sender-b",
    localIdentity: sender,
    published: [],
  });
  await senderB.enqueue(draft("equivocation.1", 20));
  const fork = await senderB.enqueue({
    ...draft("equivocation.fork", 21),
    payload: Object.freeze({ kind: "dispatch", dispatch: alternateDispatch }),
  });
  assert.equal(fork.sequence, second.sequence);
  assert.equal(fork.predecessorDigest, second.predecessorDigest);
  assert.notEqual(fork.messageDigest, second.messageDigest);

  const receiverRuntime = runtime({
    stateKey: "equivocation-receiver",
    localIdentity: receiver,
    published: [],
  });
  assert.equal(
    (
      await receiverRuntime.admit({
        envelope: verifiedEnvelope(second),
        logicalTimeMs: 30,
      })
    ).status,
    "pending",
  );
  assert.deepEqual(
    await receiverRuntime.admit({
      envelope: verifiedEnvelope(fork),
      logicalTimeMs: 31,
    }),
    { status: "rejected", reasonCode: "pending_sequence_conflict" },
  );
});

test("heals a partition by fetching only authenticated missing predecessors", async () => {
  const { first, second } = await messages();
  const handled = [];
  const requests = [];
  const exchange = runtime({
    stateKey: "healing-state",
    localIdentity: receiver,
    handled,
    published: [],
    recovery: {
      async fetch(input) {
        requests.push(input);
        return [verifiedEnvelope(first)];
      },
    },
  });
  await exchange.admit({
    envelope: verifiedEnvelope(second),
    logicalTimeMs: 30,
  });
  assert.deepEqual(await exchange.recoverPending({ logicalTimeMs: 31 }), {
    attempted: 1,
    completed: 1,
    failed: 0,
  });
  assert.deepEqual(requests[0], {
    streamId: first.streamId,
    senderPeerId: first.sender.peerId,
    senderInstanceId: first.sender.instanceId,
    fromSequence: 1,
    toSequence: 1,
    limit: 1,
  });
  await exchange.processInbox();
  assert.deepEqual(handled, [
    meshMessageId("exchange.1"),
    meshMessageId("exchange.2"),
  ]);
  assert.equal((await exchange.loadState()).pending.length, 0);
});

test("member and coordinator bridges preserve artifact-before-result settlement", async () => {
  const { first } = await messages();
  const artifact = createTeamExecutionArtifactV1({
    dispatch,
    draft: {
      schemaVersion: 1,
      artifactId: "artifact.result",
      artifactKind: "position-result",
      mediaType: "application/json",
      byteLength: 32,
      contentReference: "memory://artifact.result",
      contentDigest: digest("artifact-content"),
    },
    producedAtLogicalMs: 22,
  });
  const control = createTeamExecutionControlEvidenceV1({
    schemaVersion: 1,
    controlId: "control",
    controlVersion: 1,
    implementationId: "control.default",
    disposition: "allow",
    reasonCode: "controls_allowed",
    sourceEvidenceDigest: digest("control-source"),
    evaluatedAtLogicalMs: 22,
  });
  const result = createTeamExecutionStepResultV1({
    dispatch,
    executorId: "executor",
    executorVersion: 1,
    executorImplementationId: "executor.default",
    status: "completed",
    artifacts: [artifact],
    peerMessageDigests: [],
    control,
    sourceStepRecordDigest: digest("step-record"),
    reasonCode: "position_completed",
    completedAtLogicalMs: 22,
  });
  const responseOrder = [];
  const memberHandler = createTeamExecutionMemberExchangeHandlerV1({
    executor: {
      executorId: "executor",
      executorVersion: 1,
      implementationId: "executor.default",
      async execute() {
        return result;
      },
    },
    artifacts: {
      async publish(value) {
        responseOrder.push(`published:${value.artifactId}`);
      },
      async ensureAvailable() {
        return true;
      },
    },
    async resolveDependencyArtifact() {
      return null;
    },
    async respond({ payload }) {
      responseOrder.push(payload.kind);
    },
    async onRecovery() {},
  });
  await memberHandler.handle({ messageId: first.messageId, message: first });
  assert.deepEqual(responseOrder, [
    "published:artifact.result",
    "artifact_available",
    "result",
  ]);

  const coordinatorRecipient = {
    peerId: sender.peerId,
    memberId: sender.memberId,
    memberBindingDigest: sender.memberBindingDigest,
  };
  const artifactMessage = createTeamExecutionExchangeMessageV1({
    draft: {
      messageId: meshMessageId("response.artifact"),
      recipient: coordinatorRecipient,
      executionId: dispatch.executionId,
      executionEpoch: dispatch.executionEpoch,
      teamEpoch: dispatch.teamEpoch,
      membershipEpoch: 1,
      membershipConfigurationDigest: digest("membership-config"),
      payload: { kind: "artifact_available", artifact },
      logicalTimeMs: 23,
      validUntilLogicalMs: 123,
    },
    streamId: "stream.member",
    sequence: 1,
    predecessorDigest: null,
    scope,
    policyDigest: policy.policyDigest,
    sender: receiver,
  });
  const resultMessage = createTeamExecutionExchangeMessageV1({
    draft: {
      messageId: meshMessageId("response.result"),
      recipient: coordinatorRecipient,
      executionId: dispatch.executionId,
      executionEpoch: dispatch.executionEpoch,
      teamEpoch: dispatch.teamEpoch,
      membershipEpoch: 1,
      membershipConfigurationDigest: digest("membership-config"),
      payload: { kind: "result", result },
      logicalTimeMs: 24,
      validUntilLogicalMs: 124,
    },
    streamId: "stream.member",
    sequence: 2,
    predecessorDigest: artifactMessage.messageDigest,
    scope,
    policyDigest: policy.policyDigest,
    sender: receiver,
  });
  const coordinatorOrder = [];
  const coordinatorHandler = createTeamExecutionCoordinatorExchangeHandlerV1({
    execution: {
      async settleStep(value) {
        coordinatorOrder.push(`settled:${value.resultId}`);
      },
    },
    artifacts: {
      async ensureAvailable(value) {
        coordinatorOrder.push(`available:${value.artifactId}`);
        return true;
      },
    },
    async onRecovery() {},
  });
  await coordinatorHandler.handle({
    messageId: artifactMessage.messageId,
    message: artifactMessage,
  });
  await coordinatorHandler.handle({
    messageId: resultMessage.messageId,
    message: resultMessage,
  });
  assert.deepEqual(coordinatorOrder, [
    "available:artifact.result",
    "available:artifact.result",
    `settled:${result.resultId}`,
  ]);
});
