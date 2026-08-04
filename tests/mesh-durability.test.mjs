import assert from "node:assert/strict";
import test from "node:test";
import { signMeshEnvelope } from "@agentplat/mesh-crypto";
import {
  MESH_DURABILITY_SCHEMA_VERSION,
  MESH_DURABLE_GENESIS_DIGEST,
  computeMeshDurableValueDigest,
  createMeshDurableJournalEntry,
  createMeshDurableSnapshotCodecRegistry,
  createMeshDurableWorker,
  normalizeMeshDurableScope,
  verifyMeshDurableJournal,
} from "@agentplat/mesh/durability";
import {
  MESH_PROTOCOL,
  MESH_SIGNATURE_ALGORITHM,
  MESH_WIRE_VERSION,
} from "@agentplat/mesh-protocol";

const scope = normalizeMeshDurableScope({
  tenantId: "tenant-a",
  meshId: "mesh-a",
  peerId: "peer-b",
  instanceId: "instance-b",
});

async function ping({
  messageId,
  senderPeerId,
  senderInstanceId,
  audiencePeerId,
  privateKey,
  keyId,
}) {
  return signMeshEnvelope({
    envelope: {
      protocol: MESH_PROTOCOL,
      wireVersion: MESH_WIRE_VERSION,
      messageId,
      tenantId: scope.tenantId,
      meshId: scope.meshId,
      type: "peer.ping",
      sender: { peerId: senderPeerId, instanceId: senderInstanceId },
      audience: { kind: "peer", peerId: audiencePeerId },
      sequence: 1,
      sentAt: "2026-08-01T00:00:00Z",
      expiresAt: "2026-08-01T00:00:30Z",
      payload: { type: "peer.ping" },
      proof: { algorithm: MESH_SIGNATURE_ALGORITHM, keyId },
    },
    privateKey,
  });
}

async function records() {
  const sender = await crypto.subtle.generateKey(
    MESH_SIGNATURE_ALGORITHM,
    true,
    ["sign", "verify"],
  );
  const receiver = await crypto.subtle.generateKey(
    MESH_SIGNATURE_ALGORITHM,
    true,
    ["sign", "verify"],
  );
  const inboundEnvelope = await ping({
    messageId: "IIIIIIIIIIIIIIIIIIIIIA",
    senderPeerId: "peer-a",
    senderInstanceId: "instance-a",
    audiencePeerId: "peer-b",
    keyId: "key-a",
    privateKey: sender.privateKey,
  });
  const outboundEnvelope = await ping({
    messageId: "OOOOOOOOOOOOOOOOOOOOOA",
    senderPeerId: "peer-b",
    senderInstanceId: "instance-b",
    audiencePeerId: "peer-a",
    keyId: "key-b",
    privateKey: receiver.privateKey,
  });
  const inbox = Object.freeze({
    schemaVersion: MESH_DURABILITY_SCHEMA_VERSION,
    scope,
    messageId: inboundEnvelope.messageId,
    envelope: inboundEnvelope,
    envelopeDigest: await computeMeshDurableValueDigest(inboundEnvelope),
    status: "processing",
    attempts: 1,
    receivedAt: "2026-08-01T00:00:00.000Z",
    availableAt: "2026-08-01T00:00:00.000Z",
    claim: Object.freeze({
      workerId: "worker-a",
      leaseToken: "claim-a",
      generation: 1,
      expiresAt: "2026-08-01T00:01:00.000Z",
    }),
  });
  return {
    inbox,
    outboundEnvelope,
    outboundPrivateKey: receiver.privateKey,
  };
}

test("snapshot codecs use exact formats, verify digests and migrate deterministically", async () => {
  const format = "application/vnd.example.peer-state+json";
  const registry = createMeshDurableSnapshotCodecRegistry([
    {
      descriptor: { format, schemaVersion: 2 },
      readableSchemaVersions: [1, 2],
      encode(value) {
        return { count: value.count, label: value.label };
      },
      decode(state, schemaVersion) {
        assert.equal(typeof state.count, "number");
        return {
          count: state.count,
          label: schemaVersion === 1 ? "current" : state.label,
        };
      },
      migrate(state, fromSchemaVersion) {
        assert.equal(fromSchemaVersion, 1);
        return { count: state.count, label: "current" };
      },
    },
  ]);
  assert.deepEqual(registry.formats, [format]);

  const encoded = await registry.encode(format, {
    count: 2,
    label: "current",
  });
  assert.equal(encoded.descriptor.schemaVersion, 2);
  assert.equal(Object.isFrozen(encoded.state), true);

  const legacyState = { count: 1 };
  const legacy = Object.freeze({
    schemaVersion: 2,
    scope,
    revision: 1,
    state: legacyState,
    stateDigest: await computeMeshDurableValueDigest(legacyState),
    snapshotFormat: format,
    snapshotSchemaVersion: 1,
    committedAt: "2026-08-01T00:00:00.000Z",
  });
  assert.deepEqual(await registry.decode(legacy), {
    count: 1,
    label: "current",
  });
  const migrated = await registry.migrate(legacy);
  assert.deepEqual(migrated.state, { count: 1, label: "current" });
  assert.equal(migrated.descriptor.schemaVersion, 2);

  await assert.rejects(
    () => registry.decode({ ...legacy, stateDigest: encoded.stateDigest }),
    /digest does not match/u,
  );
  await assert.rejects(
    () =>
      registry.decode({
        ...legacy,
        snapshotFormat: "application/vnd.example.other+json",
      }),
    /format is unsupported/u,
  );
  await assert.rejects(
    () =>
      registry.decode({
        ...legacy,
        snapshotFormat: undefined,
        snapshotSchemaVersion: undefined,
      }),
    /explicit backfill/u,
  );
});

test("snapshot codec registry rejects nondeterministic migrations", async () => {
  let invocation = 0;
  const format = "application/vnd.example.nondeterministic+json";
  const registry = createMeshDurableSnapshotCodecRegistry([
    {
      descriptor: { format, schemaVersion: 2 },
      readableSchemaVersions: [1, 2],
      encode(value) {
        return value;
      },
      decode(state) {
        return state;
      },
      migrate(state) {
        invocation += 1;
        return { ...state, invocation };
      },
    },
  ]);
  const state = { count: 1 };
  const stateDigest = await computeMeshDurableValueDigest(state);
  await assert.rejects(
    () =>
      registry.migrate({
        schemaVersion: 2,
        scope,
        revision: 1,
        state,
        stateDigest,
        snapshotFormat: format,
        snapshotSchemaVersion: 1,
        committedAt: "2026-08-01T00:00:00.000Z",
      }),
    /nondeterministic/u,
  );
});

test("snapshot codec registration and decoded state are construction-bound", async () => {
  const format = "application/vnd.example.bound-state+json";
  let observedFrozenState = false;
  const codec = {
    descriptor: { format, schemaVersion: 1 },
    encode(value) {
      return { value: value.value };
    },
    decode(state) {
      observedFrozenState = Object.isFrozen(state);
      return { value: state.value };
    },
  };
  const registry = createMeshDurableSnapshotCodecRegistry([codec]);
  codec.encode = () => ({ value: "mutated" });
  codec.decode = () => ({ value: "mutated" });
  const encoded = await registry.encode(format, { value: "original" });
  assert.deepEqual(encoded.state, { value: "original" });
  const state = { value: "original" };
  assert.deepEqual(
    await registry.decode({
      schemaVersion: 2,
      scope,
      revision: 1,
      state,
      stateDigest: await computeMeshDurableValueDigest(state),
      snapshotFormat: format,
      snapshotSchemaVersion: 1,
      committedAt: "2026-08-01T00:00:00.000Z",
    }),
    { value: "original" },
  );
  assert.equal(observedFrozenState, true);
  assert.equal(Object.isFrozen(state), false);
});

test("durable value and journal digests are deterministic and tamper evident", async () => {
  assert.equal(
    await computeMeshDurableValueDigest({ b: 2, a: 1 }),
    await computeMeshDurableValueDigest({ a: 1, b: 2 }),
  );
  const first = await createMeshDurableJournalEntry({
    scope,
    sequence: 1,
    previousDigest: MESH_DURABLE_GENESIS_DIGEST,
    transitionId: "transition-1",
    inboxMessageId: "_AAAAAAAAAAAAAAAAAAAAA",
    snapshotRevision: 1,
    snapshotDigest: await computeMeshDurableValueDigest({ revision: 1 }),
    draft: { entryId: "entry-1", kind: "transition.applied" },
    occurredAt: "2026-08-01T00:00:01.000Z",
  });
  const second = await createMeshDurableJournalEntry({
    scope,
    sequence: 2,
    previousDigest: first.digest,
    transitionId: "transition-2",
    snapshotRevision: 1,
    snapshotDigest: first.snapshotDigest,
    draft: { entryId: "entry-2", kind: "outbox.delivered" },
    occurredAt: "2026-08-01T00:00:02.000Z",
  });
  assert.equal(
    await verifyMeshDurableJournal({ entries: [first, second] }),
    true,
  );
  assert.equal(
    await verifyMeshDurableJournal({
      entries: [first],
      expectedHeadDigest: second.digest,
      expectedHeadSequence: second.sequence,
    }),
    false,
  );
  assert.equal(
    await verifyMeshDurableJournal({
      entries: [first, { ...second, journalVersion: 2 }],
    }),
    false,
  );
  await assert.rejects(
    () =>
      verifyMeshDurableJournal({
        entries: [first, second],
        expectedHeadDigest: second.digest,
      }),
    /anchor is incomplete/u,
  );
  assert.equal(first.inboxMessageId, "_AAAAAAAAAAAAAAAAAAAAA");
  assert.equal(
    await verifyMeshDurableJournal({
      entries: [first, { ...second, kind: "outbox.rejected" }],
    }),
    false,
  );
});

test("durable worker normalizes one inbox transition and never starts implicitly", async () => {
  const { inbox, outboundEnvelope, outboundPrivateKey } = await records();
  const dependentEnvelope = await ping({
    messageId: "OOOOOOOOOOOOOOOOOOOOOQ",
    senderPeerId: "peer-b",
    senderInstanceId: "instance-b",
    audiencePeerId: "peer-a",
    keyId: "key-b",
    privateKey: outboundPrivateKey,
  });
  let claims = 0;
  let committed;
  let abandoned = 0;
  const repository = {
    async receive() {
      throw new Error("unused");
    },
    async loadSnapshot() {
      return undefined;
    },
    async claimInbox() {
      claims += 1;
      return claims === 1 ? [inbox] : [];
    },
    async commitInboxTransition(input) {
      committed = input;
      return { committed: true, journal: [], outbox: [] };
    },
    async abandonInbox() {
      abandoned += 1;
      return true;
    },
    async claimOutbox() {
      return [];
    },
    async settleOutbox() {
      return true;
    },
    async inspectJournal() {
      return [];
    },
  };
  let processed = 0;
  const worker = createMeshDurableWorker({
    repository,
    scope,
    workerId: "worker-a",
    processInbox: async () => {
      processed += 1;
      return {
        outcome: "applied",
        nextState: { revision: 1 },
        journal: [{ entryId: "entry-1", kind: "transition.applied" }],
        outbox: [
          { effectId: "effect-1", envelope: outboundEnvelope },
          {
            effectId: "effect-2",
            dependsOnEffectId: "effect-1",
            envelope: dependentEnvelope,
          },
        ],
      };
    },
    deliverOutbox: async () => ({ disposition: "delivered" }),
  });
  assert.equal(processed, 0);
  assert.deepEqual(await worker.runInboxBatch(), {
    claimed: 1,
    completed: 1,
    conflicted: 0,
    failed: 0,
  });
  assert.equal(processed, 1);
  assert.equal(committed.expectedSnapshotRevision, 0);
  assert.equal(
    committed.outbox[0].envelope.messageId,
    outboundEnvelope.messageId,
  );
  assert.equal(committed.outbox[1].dependsOnEffectId, "effect-1");
  assert.equal(abandoned, 0);
});

test("durable worker abandons invalid processor output under the exact claim", async () => {
  const { inbox } = await records();
  let abandoned;
  const repository = {
    async receive() {
      throw new Error("unused");
    },
    async loadSnapshot() {
      return undefined;
    },
    async claimInbox() {
      return [inbox];
    },
    async commitInboxTransition() {
      throw new Error("must not commit");
    },
    async abandonInbox(input) {
      abandoned = input;
      return true;
    },
    async claimOutbox() {
      return [];
    },
    async settleOutbox() {
      return true;
    },
    async inspectJournal() {
      return [];
    },
  };
  const worker = createMeshDurableWorker({
    repository,
    scope,
    workerId: "worker-a",
    processInbox: async () => ({
      outcome: "applied",
      nextState: { revision: 1 },
      outbox: [{ effectId: "effect-1", envelope: inbox.envelope }],
    }),
    deliverOutbox: async () => ({ disposition: "delivered" }),
  });
  assert.deepEqual(await worker.runInboxBatch(), {
    claimed: 1,
    completed: 0,
    conflicted: 0,
    failed: 1,
  });
  assert.equal(abandoned.inbox, inbox);
  assert.equal(abandoned.reasonCode, "processor_failure");
});

test("durable worker stops taking work after abort and leaves a claimed row recoverable", async () => {
  const { inbox } = await records();
  const controller = new AbortController();
  let claims = 0;
  let processed = 0;
  let committed = 0;
  const repository = {
    async receive() {
      throw new Error("unused");
    },
    async loadSnapshot() {
      return undefined;
    },
    async claimInbox() {
      claims += 1;
      controller.abort("graceful_shutdown");
      return [inbox];
    },
    async commitInboxTransition() {
      committed += 1;
      return { committed: true, journal: [], outbox: [] };
    },
    async abandonInbox() {
      throw new Error("a graceful stop must leave the lease to expire");
    },
    async claimOutbox() {
      throw new Error("no new outbox claim after abort");
    },
    async settleOutbox() {
      throw new Error("unused");
    },
    async inspectJournal() {
      return [];
    },
  };
  const worker = createMeshDurableWorker({
    repository,
    scope,
    workerId: "worker-a",
    processInbox: async () => {
      processed += 1;
      return { outcome: "applied", nextState: { revision: 1 } };
    },
    deliverOutbox: async () => ({ disposition: "delivered" }),
  });

  await worker.start({ signal: controller.signal, idleDelayMs: 1 });
  assert.equal(claims, 1);
  assert.equal(processed, 0);
  assert.equal(committed, 0);
});
