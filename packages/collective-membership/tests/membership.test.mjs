import assert from "node:assert/strict";
import test from "node:test";
import {
  CollectiveMembershipHostV1,
  InMemoryCollectiveMembershipRegistryV1,
  InMemoryCollectiveMembershipRepositoryV1,
  InMemoryCollectiveMembershipTransportV1,
  collectiveMembershipJoinStatementDigestV1,
  collectiveMembershipRotationStatementDigestV1,
  createCollectiveMembershipConfigurationV1,
  createCollectiveMembershipKeyProofV1,
  createCollectiveMembershipTransitionProposalV1,
  exportCollectiveMembershipPublicKeyV1,
  verifyCollectiveMembershipCertificateV1,
} from "../dist/index.js";
import { MESH_SIGNATURE_ALGORITHM } from "../../mesh-protocol/dist/index.js";

const initialWallTime = "2030-01-01T00:00:00.000Z";
const finalKeyExpiry = "2031-01-01T00:00:00.000Z";

test("joint quorums certify join, overlapping rotation, and leave", async () => {
  const fixture = await createFixture();
  const initial = fixture.initial;
  const joining = fixture.members.get("peer.5");
  assert.ok(joining);

  const joined = await createCollectiveMembershipConfigurationV1({
    ...configurationSeed(initial, {
      epoch: 2,
      effectiveAt: "2030-01-01T00:01:00.000Z",
      effectiveAtLogicalMs: 200,
    }),
    members: [...initial.members, joining],
  });
  const joinStatement = await collectiveMembershipJoinStatementDigestV1(
    initial,
    joined,
    joining.peerId,
    joining.activeKeyId,
  );
  const join = await createCollectiveMembershipTransitionProposalV1({
    current: initial,
    next: joined,
    change: {
      kind: "join",
      peerId: joining.peerId,
      activeKeyProof: await createCollectiveMembershipKeyProofV1({
        statementDigest: joinStatement,
        keyId: joining.activeKeyId,
        privateKey: fixture.keys.get(joining.peerId).privateKey,
      }),
    },
    proposedAtLogicalMs: 100,
    expiresAtLogicalMs: 190,
  });

  fixture.transport.unregister("peer.2");
  fixture.transport.unregister("peer.3");
  assert.equal(await fixture.hosts.get("peer.1").client.transition(join), null);
  fixture.transport.register("peer.2", fixture.hosts.get("peer.2").peer);
  fixture.transport.register("peer.3", fixture.hosts.get("peer.3").peer);

  const joinCertificate = await fixture.hosts
    .get("peer.1")
    .client.transition(join);
  assert.ok(joinCertificate);
  assert.equal(joinCertificate.previousQuorumPeerIds.length >= 3, true);
  assert.equal(joinCertificate.nextQuorumPeerIds.length >= 3, true);
  assert.ok(
    await verifyCollectiveMembershipCertificateV1({
      current: initial,
      certificate: joinCertificate,
    }),
  );
  assertCurrentEpoch(fixture, 2);

  fixture.setClock("2030-01-01T00:01:20.000Z", 220);
  const overlapUntil = "2030-01-01T00:10:00.000Z";
  const rotatingPeerId = "peer.2";
  const rotating = joined.members.find(
    ({ peerId }) => peerId === rotatingPeerId,
  );
  assert.ok(rotating);
  const newPair = await crypto.subtle.generateKey(
    MESH_SIGNATURE_ALGORITHM,
    true,
    ["sign", "verify"],
  );
  const newKey = await keyDefinition(
    "key.peer.2.v2",
    newPair.publicKey,
    "2030-01-01T00:02:00.000Z",
    finalKeyExpiry,
  );
  const rotatedMember = {
    ...rotating,
    activeKeyId: newKey.keyId,
    keys: [
      ...rotating.keys.map((key) =>
        key.keyId === rotating.activeKeyId
          ? { ...key, validUntil: overlapUntil }
          : key,
      ),
      newKey,
    ],
  };
  const rotated = await createCollectiveMembershipConfigurationV1({
    ...configurationSeed(joined, {
      epoch: 3,
      effectiveAt: "2030-01-01T00:02:00.000Z",
      effectiveAtLogicalMs: 300,
    }),
    members: joined.members.map((member) =>
      member.peerId === rotatingPeerId ? rotatedMember : member,
    ),
  });
  const rotationStatement = await collectiveMembershipRotationStatementDigestV1(
    joined,
    rotated,
    {
      peerId: rotatingPeerId,
      retiringKeyId: rotating.activeKeyId,
      activeKeyId: newKey.keyId,
      overlapUntil,
    },
  );
  const rotation = await createCollectiveMembershipTransitionProposalV1({
    current: joined,
    next: rotated,
    change: {
      kind: "rotate_key",
      peerId: rotatingPeerId,
      retiringKeyId: rotating.activeKeyId,
      activeKeyId: newKey.keyId,
      overlapUntil,
      retiringKeyProof: await createCollectiveMembershipKeyProofV1({
        statementDigest: rotationStatement,
        keyId: rotating.activeKeyId,
        privateKey: fixture.keys.get(rotatingPeerId).privateKey,
      }),
      activeKeyProof: await createCollectiveMembershipKeyProofV1({
        statementDigest: rotationStatement,
        keyId: newKey.keyId,
        privateKey: newPair.privateKey,
      }),
    },
    proposedAtLogicalMs: 220,
    expiresAtLogicalMs: 290,
  });
  assert.ok(await fixture.hosts.get("peer.1").client.transition(rotation));
  assertCurrentEpoch(fixture, 3);

  const registry = fixture.registries.get(rotatingPeerId);
  assert.equal(
    registry.resolve({
      tenantId: "tenant.1",
      meshId: "mesh.1",
      peerId: rotatingPeerId,
      keyId: rotating.activeKeyId,
      algorithm: MESH_SIGNATURE_ALGORITHM,
    }).validUntil,
    overlapUntil,
  );
  assert.ok(
    registry.resolve({
      tenantId: "tenant.1",
      meshId: "mesh.1",
      peerId: rotatingPeerId,
      keyId: newKey.keyId,
      algorithm: MESH_SIGNATURE_ALGORITHM,
    }),
  );
  assert.equal(
    (await registry.currentBinding({ logicalTimeMs: 150 })).epoch,
    1,
  );
  assert.equal(
    (await registry.currentBinding({ logicalTimeMs: 250 })).epoch,
    2,
  );
  assert.equal(
    (await registry.currentBinding({ logicalTimeMs: 350 })).epoch,
    3,
  );

  fixture.setClock("2030-01-01T00:03:20.000Z", 320);
  const left = await createCollectiveMembershipConfigurationV1({
    ...configurationSeed(rotated, {
      epoch: 4,
      effectiveAt: "2030-01-01T00:04:00.000Z",
      effectiveAtLogicalMs: 400,
    }),
    members: rotated.members.filter(({ peerId }) => peerId !== joining.peerId),
  });
  const leave = await createCollectiveMembershipTransitionProposalV1({
    current: rotated,
    next: left,
    change: { kind: "leave", peerId: joining.peerId },
    proposedAtLogicalMs: 320,
    expiresAtLogicalMs: 390,
  });
  assert.ok(await fixture.hosts.get("peer.1").client.transition(leave));
  assertCurrentEpoch(fixture, 4);
  assert.equal(
    fixture.registries
      .get("peer.1")
      .current()
      .members.some(({ peerId }) => peerId === joining.peerId),
    false,
  );
});

test("a peer records at most one proposal per source epoch", async () => {
  const repository = new InMemoryCollectiveMembershipRepositoryV1();
  const fixture = await createFixture();
  await repository.initialize(fixture.initial);
  const first = await repository.voteTransition({
    fromEpoch: 1,
    proposalDigest: `sha256:${"1".repeat(64)}`,
    requestMessageId: "request.1",
    create: async () => ({ marker: "first" }),
  });
  assert.deepEqual(first, { marker: "first" });
  let invoked = false;
  const conflicting = await repository.voteTransition({
    fromEpoch: 1,
    proposalDigest: `sha256:${"2".repeat(64)}`,
    requestMessageId: "request.2",
    create: async () => {
      invoked = true;
      return { marker: "second" };
    },
  });
  assert.equal(conflicting, null);
  assert.equal(invoked, false);
});

async function createFixture() {
  const peerIds = ["peer.1", "peer.2", "peer.3", "peer.4", "peer.5"];
  const keys = new Map();
  const members = new Map();
  for (const peerId of peerIds) {
    const pair = await crypto.subtle.generateKey(
      MESH_SIGNATURE_ALGORITHM,
      true,
      ["sign", "verify"],
    );
    keys.set(peerId, pair);
    const key = await keyDefinition(
      `key.${peerId}`,
      pair.publicKey,
      "2029-01-01T00:00:00.000Z",
      finalKeyExpiry,
    );
    members.set(peerId, {
      peerId,
      instanceId: `instance.${peerId}`,
      activeKeyId: key.keyId,
      keys: [key],
    });
  }
  const initial = await createCollectiveMembershipConfigurationV1({
    tenantId: "tenant.1",
    meshId: "mesh.1",
    policyDomainId: "policy.1",
    epoch: 1,
    previousConfigurationDigest: null,
    effectiveAt: "2029-01-01T00:00:00.000Z",
    effectiveAtLogicalMs: 0,
    members: peerIds.slice(0, 4).map((peerId) => members.get(peerId)),
  });
  let reading = { wallTime: initialWallTime, logicalTimeMs: 100 };
  const clock = { now: () => reading };
  const transport = new InMemoryCollectiveMembershipTransportV1();
  const hosts = new Map();
  const registries = new Map();
  for (const peerId of peerIds) {
    const repository = new InMemoryCollectiveMembershipRepositoryV1();
    await repository.initialize(initial);
    const registry = await InMemoryCollectiveMembershipRegistryV1.create({
      configurations: [initial],
    });
    registries.set(peerId, registry);
    const common = {
      scope: {
        tenantId: "tenant.1",
        meshId: "mesh.1",
        peerId,
        instanceId: `instance.${peerId}`,
        policyDomainId: "policy.1",
      },
      signing: {
        privateKey: keys.get(peerId).privateKey,
        keyId: `key.${peerId}`,
        algorithm: MESH_SIGNATURE_ALGORITHM,
      },
      registry,
      repository,
      clock,
    };
    const host = new CollectiveMembershipHostV1({
      client: { ...common, transport },
      peer: common,
    });
    hosts.set(peerId, host);
    transport.register(peerId, host.peer);
  }
  return {
    initial,
    keys,
    members,
    hosts,
    registries,
    transport,
    setClock(wallTime, logicalTimeMs) {
      reading = { wallTime, logicalTimeMs };
    },
  };
}

async function keyDefinition(keyId, publicKey, validFrom, validUntil) {
  return {
    keyId,
    algorithm: MESH_SIGNATURE_ALGORITHM,
    publicKey: await exportCollectiveMembershipPublicKeyV1(publicKey),
    validFrom,
    validUntil,
  };
}

function configurationSeed(current, next) {
  return {
    tenantId: current.tenantId,
    meshId: current.meshId,
    policyDomainId: current.policyDomainId,
    epoch: next.epoch,
    previousConfigurationDigest: current.configurationDigest,
    effectiveAt: next.effectiveAt,
    effectiveAtLogicalMs: next.effectiveAtLogicalMs,
  };
}

function assertCurrentEpoch(fixture, epoch) {
  for (const registry of fixture.registries.values())
    assert.equal(registry.current().epoch, epoch);
}
