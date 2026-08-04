import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryPlanningFragmentRepositoryV1 } from "@agentplat/collective-planning/mesh";
import {
  CollectiveSyncClientV1,
  CollectiveSyncPeerV1,
  InMemoryCollectiveSyncRepositoryV1,
  InMemoryCollectiveSyncTransportV1,
  createCollectiveSyncRecordV1,
} from "@agentplat/collective-sync";
import { MESH_SIGNATURE_ALGORITHM } from "@agentplat/mesh-protocol";
import {
  CollectiveSyncPlanningArtifactAvailabilityV1,
  PLANNING_ARTIFACT_SYNC_DOMAIN_V1,
  PlanningArtifactSyncAdapterV1,
  ReplicatedPlanningFragmentRepositoryV1,
  planningArtifactStreamIdV1,
} from "../dist/index.js";
import { planningArtifactFixture } from "../../../examples/planning-artifacts-multiprocess/fixture.mjs";

const wallTime = "2030-01-01T00:00:00.000Z";
const binding = Object.freeze({
  epoch: 1,
  configurationDigest: `sha256:${"a".repeat(64)}`,
  memberPeerIds: Object.freeze(["peer:alpha", "peer:beta"]),
  memberInstances: Object.freeze([
    { peerId: "peer:alpha", instanceId: "instance:alpha:1" },
    { peerId: "peer:beta", instanceId: "instance:beta:1" },
  ]),
});

test("a producer publishes only after durable storage and a receiver resolves the exact artifact", async () => {
  const keys = await keyPairs();
  const membership = membershipFor(keys);
  const clock = { now: () => ({ wallTime, logicalTimeMs: 100 }) };
  const sourceArtifacts = new InMemoryPlanningFragmentRepositoryV1();
  const sourceSync = new InMemoryCollectiveSyncRepositoryV1(
    scope("peer:alpha"),
  );
  const replicated = new ReplicatedPlanningFragmentRepositoryV1({
    scope: scope("peer:alpha"),
    repository: sourceArtifacts,
    syncRepository: sourceSync,
    membership,
    signing: signing("peer:alpha", keys),
    clock,
  });
  const { projection } = planningArtifactFixture();
  await replicated.put(projection.repositoryRecord);
  await replicated.put(structuredClone(projection.repositoryRecord));
  const streamId = planningArtifactStreamIdV1(
    projection.repositoryRecord.fragmentDigest,
  );
  const publication = await sourceSync.readRecord({
    syncDomain: PLANNING_ARTIFACT_SYNC_DOMAIN_V1,
    streamId,
    sequence: 1,
  });
  assert.ok(publication);
  assert.equal(
    sourceArtifacts.get(projection.repositoryRecord.contentReference)
      ?.fragmentDigest,
    projection.repositoryRecord.fragmentDigest,
  );

  const targetArtifacts = new InMemoryPlanningFragmentRepositoryV1();
  const targetSync = new InMemoryCollectiveSyncRepositoryV1(scope("peer:beta"));
  const adapter = new PlanningArtifactSyncAdapterV1({
    scope: {
      tenantId: scope("peer:beta").tenantId,
      meshId: scope("peer:beta").meshId,
      policyDomainId: scope("peer:beta").policyDomainId,
    },
    repository: targetArtifacts,
    membership,
    clock,
  });
  const transport = new InMemoryCollectiveSyncTransportV1();
  transport.register(
    "peer:alpha",
    new CollectiveSyncPeerV1({
      scope: scope("peer:alpha"),
      signing: signing("peer:alpha", keys),
      membership,
      repository: sourceSync,
      clock,
    }),
  );
  const client = new CollectiveSyncClientV1({
    scope: scope("peer:beta"),
    signing: signing("peer:beta", keys),
    membership,
    repository: targetSync,
    adapter,
    transport,
    clock,
  });
  const availability = new CollectiveSyncPlanningArtifactAvailabilityV1({
    repository: targetArtifacts,
    client,
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
      sourceInstanceId: "instance:alpha:1",
      receivedAtLogicalMs: 100,
    }),
    true,
  );
  assert.equal(
    targetArtifacts.get(projection.repositoryRecord.contentReference)
      ?.fragmentDigest,
    projection.repositoryRecord.fragmentDigest,
  );
  assert.equal(
    await targetSync.latestCertificate(PLANNING_ARTIFACT_SYNC_DOMAIN_V1),
    undefined,
  );
});

test("embedded producer proof rejects tampering after the outer record is rehashed", async () => {
  const keys = await keyPairs();
  const membership = membershipFor(keys);
  const clock = { now: () => ({ wallTime, logicalTimeMs: 100 }) };
  const sourceArtifacts = new InMemoryPlanningFragmentRepositoryV1();
  const sourceSync = new InMemoryCollectiveSyncRepositoryV1(
    scope("peer:alpha"),
  );
  const { projection } = planningArtifactFixture();
  await new ReplicatedPlanningFragmentRepositoryV1({
    scope: scope("peer:alpha"),
    repository: sourceArtifacts,
    syncRepository: sourceSync,
    membership,
    signing: signing("peer:alpha", keys),
    clock,
  }).put(projection.repositoryRecord);
  const record = await sourceSync.readRecord({
    syncDomain: PLANNING_ARTIFACT_SYNC_DOMAIN_V1,
    streamId: planningArtifactStreamIdV1(
      projection.repositoryRecord.fragmentDigest,
    ),
    sequence: 1,
  });
  const adapter = new PlanningArtifactSyncAdapterV1({
    scope: {
      tenantId: projection.repositoryRecord.tenantId,
      meshId: projection.repositoryRecord.meshId,
      policyDomainId: projection.repositoryRecord.policyDomainId,
    },
    repository: new InMemoryPlanningFragmentRepositoryV1(),
    membership,
    clock,
  });
  assert.equal(await adapter.validate(record), true);
  assert.equal(
    await new PlanningArtifactSyncAdapterV1({
      ...adapter.options,
      clock: { now: () => ({ wallTime, logicalTimeMs: 99 }) },
    }).validate(record),
    false,
  );
  const changedPublication = {
    ...structuredClone(record.payload.publication),
    issuedAt: "2030-01-01T00:00:01.000Z",
  };
  const rehashed = await createCollectiveSyncRecordV1({
    tenantId: record.tenantId,
    meshId: record.meshId,
    policyDomainId: record.policyDomainId,
    syncDomain: record.syncDomain,
    streamId: record.streamId,
    sequence: record.sequence,
    predecessorDigest: record.predecessorDigest,
    payload: { ...record.payload, publication: changedPublication },
    createdAtLogicalMs: record.createdAtLogicalMs,
  });
  assert.equal(await adapter.validate(rehashed), false);
});

function scope(peerId) {
  return {
    tenantId: "tenant:artifact-test",
    meshId: "mesh:artifact-test",
    policyDomainId: "policy-domain:artifact-test",
    peerId,
    instanceId:
      peerId === "peer:alpha" ? "instance:alpha:1" : "instance:beta:1",
  };
}

async function keyPairs() {
  return new Map(
    await Promise.all(
      binding.memberPeerIds.map(async (peerId) => [
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
