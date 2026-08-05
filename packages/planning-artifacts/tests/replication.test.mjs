import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryPlanningFragmentRepositoryV1 } from "@agentplat/collective-planning/mesh";
import {
  CollectiveSyncClientV1,
  CollectiveSyncPeerV1,
  InMemoryCollectiveSyncRepositoryV1,
  InMemoryCollectiveSyncTransportV1,
} from "@agentplat/collective-sync";
import { MESH_SIGNATURE_ALGORITHM } from "@agentplat/mesh-protocol";
import {
  CertifiedPlanningArtifactAvailabilityV2,
  CertifiedReplicatedPlanningFragmentRepositoryV2,
  InMemoryPlanningArtifactReplicationEvidenceRepositoryV1,
  InMemoryPlanningArtifactReplicationTransportV1,
  PLANNING_ARTIFACT_CERTIFICATE_SYNC_DOMAIN_V1,
  PLANNING_ARTIFACT_SYNC_DOMAIN_V1,
  PlanningArtifactAvailabilitySyncAdapterV2,
  PlanningArtifactReplicationHttpTransportV1,
  PlanningArtifactReplicationPeerV1,
  handlePlanningArtifactReplicationHttpRequestV1,
  planningArtifactCertificateStreamIdV1,
  selectPlanningArtifactReplicasV1,
  verifyPlanningArtifactReplicationCertificateV1,
} from "../dist/index.js";
import { planningArtifactFixture } from "../../../examples/planning-artifacts-multiprocess/fixture.mjs";

const wallTime = "2030-01-01T00:00:00.000Z";
const peerIds = Object.freeze([
  "peer:alpha",
  "peer:beta",
  "peer:delta",
  "peer:epsilon",
  "peer:gamma",
]);
const binding = Object.freeze({
  epoch: 1,
  configurationDigest: `sha256:${"a".repeat(64)}`,
  memberPeerIds: peerIds,
  memberInstances: Object.freeze(
    peerIds.map((peerId) => ({ peerId, instanceId: instanceId(peerId) })),
  ),
});
const policy = Object.freeze({
  schemaVersion: 1,
  replicaCount: 2,
  writeThreshold: 2,
  receiptLifetimeMs: 10_000,
});

test("a certified artifact survives permanent producer loss", async () => {
  const harness = await createHarness();
  const { projection } = planningArtifactFixture();
  const selected = await selectPlanningArtifactReplicasV1({
    membership: binding,
    sourcePeerId: "peer:alpha",
    sourceInstanceId: instanceId("peer:alpha"),
    fragmentDigest: projection.repositoryRecord.fragmentDigest,
    policy,
  });
  const receiverId = peerIds.find(
    (peerId) =>
      peerId !== "peer:alpha" &&
      !selected.some((replica) => replica.peerId === peerId),
  );
  assert.ok(receiverId);

  await harness.producer.put(projection.repositoryRecord);
  const certificate = await harness.states
    .get("peer:alpha")
    .evidence.getCertificate({
      fragmentDigest: projection.repositoryRecord.fragmentDigest,
      membershipConfigurationDigest: binding.configurationDigest,
    });
  assert.ok(certificate);
  assert.equal(certificate.receipts.length, 2);
  for (const replica of selected) {
    assert.equal(
      (
        await harness.states
          .get(replica.peerId)
          .artifacts.get(projection.repositoryRecord.contentReference)
      )?.fragmentDigest,
      projection.repositoryRecord.fragmentDigest,
    );
    assert.ok(
      await harness.states.get(replica.peerId).evidence.getCertificate({
        fragmentDigest: projection.repositoryRecord.fragmentDigest,
        membershipConfigurationDigest: binding.configurationDigest,
      }),
    );
  }

  const syncTransport = new InMemoryCollectiveSyncTransportV1();
  for (const replica of selected) {
    const state = harness.states.get(replica.peerId);
    syncTransport.register(
      replica.peerId,
      new CollectiveSyncPeerV1({
        scope: scope(replica.peerId),
        signing: signing(replica.peerId, harness.keys),
        membership: harness.membership,
        repository: state.sync,
        clock: harness.clock,
      }),
    );
  }
  // The producer is deliberately not registered: it is permanently gone.
  const receiver = harness.states.get(receiverId);
  const adapter = new PlanningArtifactAvailabilitySyncAdapterV2({
    scope: scopeWithoutPeer(),
    repository: receiver.artifacts,
    evidenceRepository: receiver.evidence,
    membership: harness.membership,
    clock: harness.clock,
    replicationPolicy: policy,
  });
  const client = new CollectiveSyncClientV1({
    scope: scope(receiverId),
    signing: signing(receiverId, harness.keys),
    membership: harness.membership,
    repository: receiver.sync,
    adapter,
    transport: syncTransport,
    clock: harness.clock,
  });
  const availability = new CertifiedPlanningArtifactAvailabilityV2({
    scope: scope(receiverId),
    repository: receiver.artifacts,
    evidenceRepository: receiver.evidence,
    client,
    membership: harness.membership,
    clock: harness.clock,
    replicationPolicy: policy,
  });
  assert.equal(
    await availability.ensureAvailable({
      tenantId: projection.repositoryRecord.tenantId,
      meshId: projection.repositoryRecord.meshId,
      policyDomainId: projection.repositoryRecord.policyDomainId,
      objectiveId: projection.repositoryRecord.objectiveId,
      missionIntentId: projection.extension.missionIntentId,
      intentRevision: projection.extension.intentRevision,
      intentDigest: projection.extension.intentDigest,
      proposalDigest: projection.extension.proposalDigest,
      fragmentDigest: projection.extension.fragmentDigest,
      planViewDigest: projection.extension.planViewDigest,
      contentReference: projection.repositoryRecord.contentReference,
      sourcePeerId: "peer:alpha",
      sourceInstanceId: instanceId("peer:alpha"),
      receivedAtLogicalMs: 100,
    }),
    true,
  );
  assert.deepEqual(
    await receiver.artifacts.get(projection.repositoryRecord.contentReference),
    projection.repositoryRecord,
  );
  assert.equal(
    await receiver.sync.latestCertificate(
      PLANNING_ARTIFACT_CERTIFICATE_SYNC_DOMAIN_V1,
    ),
    undefined,
  );
  assert.equal(
    await receiver.sync.latestCertificate(PLANNING_ARTIFACT_SYNC_DOMAIN_V1),
    undefined,
  );
});

test("the producer fails closed below the configured write threshold", async () => {
  const harness = await createHarness({ registerReplicaLimit: 1 });
  const { projection } = planningArtifactFixture();
  await assert.rejects(
    harness.producer.put(projection.repositoryRecord),
    /planning_artifact_replication_threshold_unavailable/,
  );
});

test("the producer fails closed below the certificate custody threshold", async () => {
  const harness = await createHarness({ dropOneCertificateStore: true });
  const { projection } = planningArtifactFixture();
  await assert.rejects(
    harness.producer.put(projection.repositoryRecord),
    /planning_artifact_certificate_threshold_unavailable/,
  );
  assert.ok(
    await harness.states.get("peer:alpha").evidence.getCertificate({
      fragmentDigest: projection.repositoryRecord.fragmentDigest,
      membershipConfigurationDigest: binding.configurationDigest,
    }),
  );
});

test("replica selection is independent of membership enumeration order", async () => {
  const { projection } = planningArtifactFixture();
  const input = {
    sourcePeerId: "peer:alpha",
    sourceInstanceId: instanceId("peer:alpha"),
    fragmentDigest: projection.repositoryRecord.fragmentDigest,
    policy,
  };
  const forward = await selectPlanningArtifactReplicasV1({
    ...input,
    membership: binding,
  });
  const reversed = await selectPlanningArtifactReplicasV1({
    ...input,
    membership: {
      ...binding,
      memberPeerIds: [...binding.memberPeerIds].reverse(),
      memberInstances: [...binding.memberInstances].reverse(),
    },
  });
  assert.deepEqual(reversed, forward);
});

test("certificate verification rejects expiration and stale membership", async () => {
  const harness = await createHarness();
  const { projection } = planningArtifactFixture();
  await harness.producer.put(projection.repositoryRecord);
  const certificate = await harness.states
    .get("peer:alpha")
    .evidence.getCertificate({
      fragmentDigest: projection.repositoryRecord.fragmentDigest,
      membershipConfigurationDigest: binding.configurationDigest,
    });
  assert.ok(certificate);
  assert.equal(
    await verifyPlanningArtifactReplicationCertificateV1({
      certificate,
      membership: harness.membership,
      logicalTimeMs: certificate.expiresAtLogicalMs + 1,
      requireCurrentMembership: true,
      expectedPolicy: policy,
    }),
    null,
  );
  const nextBinding = {
    ...binding,
    epoch: 2,
    configurationDigest: `sha256:${"c".repeat(64)}`,
  };
  assert.equal(
    await verifyPlanningArtifactReplicationCertificateV1({
      certificate,
      membership: {
        ...harness.membership,
        currentBinding: async () => nextBinding,
      },
      logicalTimeMs: 100,
      requireCurrentMembership: true,
      expectedPolicy: policy,
    }),
    null,
  );
});

test("evidence writes are idempotent and conflicting certificates fail closed", async () => {
  const harness = await createHarness();
  const { projection } = planningArtifactFixture();
  await harness.producer.put(projection.repositoryRecord);
  const certificate = await harness.states
    .get("peer:alpha")
    .evidence.getCertificate({
      fragmentDigest: projection.repositoryRecord.fragmentDigest,
      membershipConfigurationDigest: binding.configurationDigest,
    });
  assert.ok(certificate);
  const evidence =
    new InMemoryPlanningArtifactReplicationEvidenceRepositoryV1();
  assert.deepEqual(await evidence.putCertificate(certificate), certificate);
  assert.deepEqual(
    await evidence.putCertificate(structuredClone(certificate)),
    certificate,
  );
  const conflict = structuredClone(certificate);
  conflict.expiresAtLogicalMs -= 1;
  await assert.rejects(
    evidence.putCertificate(conflict),
    /planning_artifact_replication_certificate_conflict/,
  );
});

test("certificate sync is scope isolated", async () => {
  const harness = await createHarness();
  const { projection } = planningArtifactFixture();
  await harness.producer.put(projection.repositoryRecord);
  const selected = await selectPlanningArtifactReplicasV1({
    membership: binding,
    sourcePeerId: "peer:alpha",
    sourceInstanceId: instanceId("peer:alpha"),
    fragmentDigest: projection.repositoryRecord.fragmentDigest,
    policy,
  });
  const record = await harness.states.get(selected[0].peerId).sync.readRecord({
    syncDomain: PLANNING_ARTIFACT_CERTIFICATE_SYNC_DOMAIN_V1,
    streamId: planningArtifactCertificateStreamIdV1(
      projection.repositoryRecord.fragmentDigest,
    ),
    sequence: 1,
  });
  assert.ok(record);
  const foreign = new PlanningArtifactAvailabilitySyncAdapterV2({
    scope: {
      ...scopeWithoutPeer(),
      tenantId: "tenant:foreign",
    },
    repository: harness.states.get("peer:epsilon").artifacts,
    evidenceRepository: harness.states.get("peer:epsilon").evidence,
    membership: harness.membership,
    clock: harness.clock,
    replicationPolicy: policy,
  });
  assert.equal(await foreign.validate(record), false);
});

test("the bounded HTTP transport completes certified replication", async () => {
  assert.throws(
    () =>
      new PlanningArtifactReplicationHttpTransportV1({
        endpoints: { "peer:beta": "file:///tmp/replica" },
      }),
    /planning_artifact_replication_endpoint_invalid/,
  );
  assert.throws(
    () =>
      new PlanningArtifactReplicationHttpTransportV1({
        endpoints: { "peer:beta": "https://beta.test" },
        path: "https://redirect.test/replicate",
      }),
    /planning_artifact_replication_path_invalid/,
  );
  const oversized = await handlePlanningArtifactReplicationHttpRequestV1(
    { handle: () => assert.fail("oversized request reached the peer") },
    new Request("http://beta.test/agentplat/planning-artifacts/v1/replicate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "1048577",
      },
      body: "{}",
    }),
  );
  assert.equal(oversized.status, 413);
  const harness = await createHarness({ transportKind: "http" });
  const { projection } = planningArtifactFixture();
  await harness.producer.put(projection.repositoryRecord);
  assert.ok(
    await harness.states.get("peer:alpha").evidence.getCertificate({
      fragmentDigest: projection.repositoryRecord.fragmentDigest,
      membershipConfigurationDigest: binding.configurationDigest,
    }),
  );
});

test("tampered replica evidence cannot certify availability", async () => {
  const harness = await createHarness();
  const { projection } = planningArtifactFixture();
  await harness.producer.put(projection.repositoryRecord);
  const certificate = await harness.states
    .get("peer:alpha")
    .evidence.getCertificate({
      fragmentDigest: projection.repositoryRecord.fragmentDigest,
      membershipConfigurationDigest: binding.configurationDigest,
    });
  assert.ok(certificate);
  const tampered = structuredClone(certificate);
  tampered.receipts[0].payload.artifactDigest = `sha256:${"f".repeat(64)}`;
  assert.equal(
    await verifyPlanningArtifactReplicationCertificateV1({
      certificate: tampered,
      membership: harness.membership,
      logicalTimeMs: 100,
      requireCurrentMembership: true,
      expectedPolicy: policy,
    }),
    null,
  );
});

async function createHarness(options = {}) {
  const keys = await keyPairs();
  const membership = membershipFor(keys);
  const clock = { now: () => ({ wallTime, logicalTimeMs: 100 }) };
  const states = new Map(
    peerIds.map((peerId) => [
      peerId,
      {
        artifacts: new InMemoryPlanningFragmentRepositoryV1(),
        evidence: new InMemoryPlanningArtifactReplicationEvidenceRepositoryV1(),
        sync: new InMemoryCollectiveSyncRepositoryV1(scope(peerId)),
      },
    ]),
  );
  const { projection } = planningArtifactFixture();
  const selected = await selectPlanningArtifactReplicasV1({
    membership: binding,
    sourcePeerId: "peer:alpha",
    sourceInstanceId: instanceId("peer:alpha"),
    fragmentDigest: projection.repositoryRecord.fragmentDigest,
    policy,
  });
  const replicaPeers = new Map();
  for (const replica of selected.slice(0, options.registerReplicaLimit ?? 2)) {
    const state = states.get(replica.peerId);
    replicaPeers.set(
      replica.peerId,
      new PlanningArtifactReplicationPeerV1({
        scope: scope(replica.peerId),
        repository: state.artifacts,
        evidenceRepository: state.evidence,
        syncRepository: state.sync,
        membership,
        signing: signing(replica.peerId, keys),
        clock,
        policy,
      }),
    );
  }
  const directTransport =
    options.transportKind === "http"
      ? httpTransport(replicaPeers)
      : inMemoryTransport(replicaPeers);
  const transport = options.dropOneCertificateStore
    ? {
        exchange: (input) =>
          input.request.payload.type === "artifact.certificate.store" &&
          input.peerId === selected[0].peerId
            ? null
            : directTransport.exchange(input),
      }
    : directTransport;
  const source = states.get("peer:alpha");
  const producer = new CertifiedReplicatedPlanningFragmentRepositoryV2({
    scope: scope("peer:alpha"),
    repository: source.artifacts,
    evidenceRepository: source.evidence,
    syncRepository: source.sync,
    membership,
    signing: signing("peer:alpha", keys),
    clock,
    replicationTransport: transport,
    replicationPolicy: policy,
  });
  return { keys, membership, clock, states, transport, producer };
}

function inMemoryTransport(peers) {
  const transport = new InMemoryPlanningArtifactReplicationTransportV1();
  for (const [peerId, peer] of peers) transport.register(peerId, peer);
  return transport;
}

function httpTransport(peers) {
  const endpoints = Object.fromEntries(
    [...peers].map(([peerId]) => [
      peerId,
      `http://${peerId.slice("peer:".length)}.test`,
    ]),
  );
  return new PlanningArtifactReplicationHttpTransportV1({
    endpoints,
    fetch: async (input, init) => {
      assert.equal(init.redirect, "error");
      const request = new Request(input, init);
      const peerId = `peer:${new URL(request.url).hostname.split(".")[0]}`;
      const peer = peers.get(peerId);
      return peer
        ? handlePlanningArtifactReplicationHttpRequestV1(peer, request)
        : new Response(null, { status: 404 });
    },
  });
}

function scopeWithoutPeer() {
  return {
    tenantId: "tenant:artifact-test",
    meshId: "mesh:artifact-test",
    policyDomainId: "policy-domain:artifact-test",
  };
}

function scope(peerId) {
  return {
    ...scopeWithoutPeer(),
    peerId,
    instanceId: instanceId(peerId),
  };
}

function instanceId(peerId) {
  return `instance:${peerId.slice("peer:".length)}:1`;
}

async function keyPairs() {
  return new Map(
    await Promise.all(
      peerIds.map(async (peerId) => [
        peerId,
        await crypto.subtle.generateKey(MESH_SIGNATURE_ALGORITHM, true, [
          "sign",
          "verify",
        ]),
      ]),
    ),
  );
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
        tenantId !== "tenant:artifact-test" ||
        meshId !== "mesh:artifact-test" ||
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
