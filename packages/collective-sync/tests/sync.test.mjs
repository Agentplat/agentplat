import assert from "node:assert/strict";
import test from "node:test";
import {
  COLLECTIVE_SYNC_MAX_CANONICAL_BYTES_V1,
  COLLECTIVE_SYNC_PROTOCOL_V1,
  COLLECTIVE_SYNC_SCHEMA_VERSION_V1,
  CollectiveSyncClientV1,
  CollectiveSyncHttpTransportV1,
  CollectiveSyncPeerV1,
  CollectiveSyncReadinessGateV1,
  InMemoryCollectiveSyncRepositoryV1,
  InMemoryCollectiveSyncTransportV1,
  collectiveSyncMessageIdV1,
  createCollectiveSyncFrontierV1,
  createCollectiveSyncRecordV1,
  handleCollectiveSyncHttpRequestV1,
  signCollectiveSyncEnvelopeV1,
} from "../dist/index.js";
import { MESH_SIGNATURE_ALGORITHM } from "../../mesh-protocol/dist/index.js";

const wallTime = "2030-01-01T00:00:00.000Z";
const binding = Object.freeze({
  epoch: 1,
  configurationDigest: `sha256:${"a".repeat(64)}`,
  memberPeerIds: Object.freeze(["peer.1", "peer.2", "peer.3"]),
  memberInstances: Object.freeze([
    { peerId: "peer.1", instanceId: "instance.1" },
    { peerId: "peer.2", instanceId: "instance.2" },
    { peerId: "peer.3", instanceId: "instance.3" },
  ]),
});

test("records are append-only, gap-free, and fork rejecting", async () => {
  const repository = new InMemoryCollectiveSyncRepositoryV1(scope("peer.1"));
  const first = await record(1, null, { kind: "accepted", value: 1 });
  const second = await record(2, first.recordDigest, {
    kind: "accepted",
    value: 2,
  });
  const result = await repository.append({
    syncDomain: "mission.1",
    membership: binding,
    records: [first, second],
  });
  assert.deepEqual(result.acceptedRecordDigests, [
    first.recordDigest,
    second.recordDigest,
  ]);
  assert.equal(result.frontier.entries[0].sequence, 2);
  assert.equal(
    (
      await repository.readRecord({
        syncDomain: "mission.1",
        streamId: first.streamId,
        sequence: 2,
      })
    )?.recordDigest,
    second.recordDigest,
  );
  const duplicate = await repository.append({
    syncDomain: "mission.1",
    membership: binding,
    records: [second],
  });
  assert.deepEqual(duplicate.duplicateRecordDigests, [second.recordDigest]);
  const fork = await record(2, first.recordDigest, {
    kind: "accepted",
    value: 99,
  });
  await assert.rejects(
    repository.append({
      syncDomain: "mission.1",
      membership: binding,
      records: [fork],
    }),
    /sync_stream_fork/,
  );
  const chunk = await repository.readAfter({
    syncDomain: "mission.1",
    membership: binding,
    cursors: [],
    maximumRecords: 1,
    maximumBytes: 100_000,
  });
  assert.equal(chunk.records.length, 1);
  assert.equal(chunk.hasMore, true);
  assert.equal(chunk.nextCursors[0].sequence, 1);

  const session = {
    schemaVersion: 1,
    sessionId: "sync.session.same-time",
    syncDomain: "mission.1",
    membershipEpoch: binding.epoch,
    membershipConfigurationDigest: binding.configurationDigest,
    targetFrontier: result.frontier,
    sourcePeerIds: ["peer.2", "peer.3"],
    cursors: result.frontier.entries,
    importedRecordDigests: [first.recordDigest, second.recordDigest],
    status: "transferring",
    certificateId: null,
    failureCode: null,
    updatedAtLogicalMs: 10,
  };
  await repository.saveSession(session);
  await repository.saveSession(session);
  await assert.rejects(
    repository.saveSession({ ...session, status: "certifying" }),
    /sync_session_same_time_conflict/,
  );
  await repository.saveSession({
    ...session,
    status: "certifying",
    updatedAtLogicalMs: 11,
  });
});

test("signed envelopes with an excessive lifetime are rejected", async () => {
  const keys = new Map();
  for (const peerId of binding.memberPeerIds) {
    keys.set(
      peerId,
      await crypto.subtle.generateKey(MESH_SIGNATURE_ALGORITHM, true, [
        "sign",
        "verify",
      ]),
    );
  }
  const membership = membershipFor(keys);
  const local = new InMemoryCollectiveSyncRepositoryV1(scope("peer.1"));
  const frontier = await createCollectiveSyncFrontierV1({
    ...scope("peer.1"),
    syncDomain: "mission.1",
    membership: binding,
    entries: [],
  });
  const payload = {
    type: "sync.frontier.request",
    sessionId: "sync.session.overlong",
    syncDomain: "mission.1",
    membershipEpoch: binding.epoch,
    membershipConfigurationDigest: binding.configurationDigest,
    localFrontier: frontier,
    requestedAtLogicalMs: 100,
  };
  const request = await signCollectiveSyncEnvelopeV1({
    envelope: {
      protocol: COLLECTIVE_SYNC_PROTOCOL_V1,
      schemaVersion: COLLECTIVE_SYNC_SCHEMA_VERSION_V1,
      messageId: await collectiveSyncMessageIdV1("request", payload),
      tenantId: "tenant.1",
      meshId: "mesh.1",
      policyDomainId: "policy.1",
      senderPeerId: "peer.1",
      senderInstanceId: "instance.1",
      audiencePeerId: "peer.2",
      audienceInstanceId: "instance.2",
      issuedAt: wallTime,
      expiresAt: new Date(Date.parse(wallTime) + 60_000).toISOString(),
      payload,
      proof: {
        algorithm: MESH_SIGNATURE_ALGORITHM,
        keyId: "key.peer.1",
      },
    },
    privateKey: keys.get("peer.1").privateKey,
  });
  const peer = new CollectiveSyncPeerV1({
    scope: scope("peer.2"),
    signing: signing("peer.2", keys),
    membership,
    repository: local,
    clock: { now: () => ({ wallTime, logicalTimeMs: 100 }) },
    maximumEnvelopeTtlMs: 30_000,
  });
  assert.equal(await peer.handle(request), null);
});

test("HTTP request and response streams are capped without Content-Length", async () => {
  let invoked = false;
  const request = new Request(
    "http://127.0.0.1/agentplat/collective-sync/v1/exchange",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: oversizedBody(),
      duplex: "half",
    },
  );
  const response = await handleCollectiveSyncHttpRequestV1(
    {
      handle: async () => {
        invoked = true;
        return null;
      },
    },
    request,
  );
  assert.equal(response.status, 413);
  assert.equal(invoked, false);

  const transport = new CollectiveSyncHttpTransportV1({
    endpoints: { "peer.2": "http://127.0.0.1" },
    fetch: async () => new Response(oversizedBody(), { status: 200 }),
  });
  await assert.rejects(
    transport.exchange({ peerId: "peer.2", request: {} }),
    /collective_sync_response_too_large/,
  );
});

test("a joining peer catches up from matching member frontiers and becomes ready", async () => {
  const keys = new Map();
  for (const peerId of binding.memberPeerIds) {
    keys.set(
      peerId,
      await crypto.subtle.generateKey(MESH_SIGNATURE_ALGORITHM, true, [
        "sign",
        "verify",
      ]),
    );
  }
  const membership = membershipFor(keys);
  const transport = new InMemoryCollectiveSyncTransportV1();
  const repositories = new Map();
  const clock = { now: () => ({ wallTime, logicalTimeMs: 100 }) };
  const first = await record(1, null, {
    type: "objective.accepted",
    objectiveId: "objective.1",
  });
  const second = await record(2, first.recordDigest, {
    type: "work.accepted",
    workItemId: "work.1",
  });

  for (const peerId of ["peer.2", "peer.3"]) {
    const repository = new InMemoryCollectiveSyncRepositoryV1(scope(peerId));
    repositories.set(peerId, repository);
    await repository.append({
      syncDomain: "mission.1",
      membership: binding,
      records: [first, second],
    });
    transport.register(
      peerId,
      new CollectiveSyncPeerV1({
        scope: scope(peerId),
        signing: signing(peerId, keys),
        membership,
        repository,
        clock,
      }),
    );
  }

  const targetRepository = new InMemoryCollectiveSyncRepositoryV1(
    scope("peer.1"),
  );
  const replayed = [];
  const client = new CollectiveSyncClientV1({
    scope: scope("peer.1"),
    signing: signing("peer.1", keys),
    membership,
    repository: targetRepository,
    adapter: {
      validate: async (candidate) =>
        candidate.payload?.type?.endsWith(".accepted") === true,
      replay: async (records) =>
        replayed.push(...records.map(({ recordDigest }) => recordDigest)),
    },
    transport,
    clock,
    maximumRecordsPerChunk: 1,
  });
  const certificate = await client.catchUp({ syncDomain: "mission.1" });
  assert.equal(certificate.attestations.length, 2);
  assert.deepEqual(replayed, [first.recordDigest, second.recordDigest]);
  const sessionCertificate =
    await targetRepository.latestCertificate("mission.1");
  assert.equal(sessionCertificate?.certificateId, certificate.certificateId);
  const gate = new CollectiveSyncReadinessGateV1({
    scope: scope("peer.1"),
    repository: targetRepository,
    membership,
    clock,
  });
  assert.deepEqual(await gate.check({ syncDomain: "mission.1" }), {
    ready: true,
    reasonCode: "sync_ready",
    certificateId: certificate.certificateId,
    frontierDigest: certificate.frontier.frontierDigest,
  });

  const third = await record(3, second.recordDigest, {
    type: "result.accepted",
    resultId: "result.1",
  });
  await targetRepository.append({
    syncDomain: "mission.1",
    membership: binding,
    records: [third],
  });
  assert.equal(
    (await gate.check({ syncDomain: "mission.1" })).reasonCode,
    "sync_local_frontier_changed",
  );
});

test("an authenticated peer resolves one exact record without readiness certification", async () => {
  const keys = new Map();
  for (const peerId of binding.memberPeerIds) {
    keys.set(
      peerId,
      await crypto.subtle.generateKey(MESH_SIGNATURE_ALGORITHM, true, [
        "sign",
        "verify",
      ]),
    );
  }
  const membership = membershipFor(keys);
  const transport = new InMemoryCollectiveSyncTransportV1();
  const clock = { now: () => ({ wallTime, logicalTimeMs: 100 }) };
  const source = new InMemoryCollectiveSyncRepositoryV1(scope("peer.2"));
  const exact = await record(1, null, {
    type: "planning.artifact.publication",
    value: "exact",
  });
  await source.append({
    syncDomain: "mission.1",
    membership: binding,
    records: [exact],
  });
  transport.register(
    "peer.2",
    new CollectiveSyncPeerV1({
      scope: scope("peer.2"),
      signing: signing("peer.2", keys),
      membership,
      repository: source,
      clock,
    }),
  );

  const target = new InMemoryCollectiveSyncRepositoryV1(scope("peer.1"));
  const replayed = [];
  const client = new CollectiveSyncClientV1({
    scope: scope("peer.1"),
    signing: signing("peer.1", keys),
    membership,
    repository: target,
    adapter: {
      validate: async (candidate) =>
        candidate.recordDigest === exact.recordDigest,
      replay: async (records) => replayed.push(...records),
    },
    transport,
    clock,
  });
  assert.equal(
    (
      await client.resolveRecord({
        peerId: "peer.2",
        syncDomain: exact.syncDomain,
        streamId: exact.streamId,
        sequence: exact.sequence,
      })
    )?.recordDigest,
    exact.recordDigest,
  );
  assert.equal(replayed.length, 1);
  assert.equal(
    (
      await target.readRecord({
        syncDomain: exact.syncDomain,
        streamId: exact.streamId,
        sequence: 1,
      })
    )?.recordDigest,
    exact.recordDigest,
  );
  assert.equal(await target.latestCertificate(exact.syncDomain), undefined);
  assert.equal(
    await client.resolveRecord({
      peerId: "peer.2",
      syncDomain: exact.syncDomain,
      streamId: "stream.missing",
      sequence: 1,
    }),
    null,
  );
});

async function record(sequence, predecessorDigest, payload) {
  return createCollectiveSyncRecordV1({
    tenantId: "tenant.1",
    meshId: "mesh.1",
    policyDomainId: "policy.1",
    syncDomain: "mission.1",
    streamId: "stream.objective.1",
    sequence,
    predecessorDigest,
    payload,
    createdAtLogicalMs: sequence,
  });
}

function scope(peerId) {
  return {
    tenantId: "tenant.1",
    meshId: "mesh.1",
    policyDomainId: "policy.1",
    peerId,
    instanceId: `instance.${peerId.split(".")[1]}`,
  };
}

function signing(peerId, keys) {
  return {
    privateKey: keys.get(peerId).privateKey,
    keyId: `key.${peerId}`,
    algorithm: MESH_SIGNATURE_ALGORITHM,
  };
}

function membershipFor(keys) {
  return {
    currentBinding: async () => binding,
    resolveBinding: async ({ epoch, configurationDigest }) =>
      epoch === binding.epoch &&
      configurationDigest === binding.configurationDigest
        ? binding
        : null,
    resolve: ({ tenantId, meshId, peerId, keyId, algorithm }) => {
      const pair = keys.get(peerId);
      if (
        !pair ||
        tenantId !== "tenant.1" ||
        meshId !== "mesh.1" ||
        keyId !== `key.${peerId}` ||
        algorithm !== MESH_SIGNATURE_ALGORITHM
      )
        return undefined;
      return {
        tenantId,
        meshId,
        peerId,
        keyId,
        algorithm,
        publicKey: pair.publicKey,
        validFrom: "2029-01-01T00:00:00.000Z",
        validUntil: "2031-01-01T00:00:00.000Z",
        status: "active",
      };
    },
  };
}

function oversizedBody() {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(
        new Uint8Array(COLLECTIVE_SYNC_MAX_CANONICAL_BYTES_V1 + 1),
      );
      controller.close();
    },
  });
}
