import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import {
  PostgresPlanningFragmentRepositoryV1,
  PostgresPlanningArtifactReplicationEvidenceRepositoryV1,
  getMigrationStatus,
  runMigrations,
} from "../dist/index.js";
import {
  createPlanningArtifactReplicationCertificateV1,
  createSignedPlanningArtifactReplicationEnvelopeV1,
  planningArtifactDigestV1,
  selectPlanningArtifactReplicasV1,
} from "@agentplat/planning-artifacts";
import { MESH_SIGNATURE_ALGORITHM } from "@agentplat/mesh-protocol";
import { planningArtifactFixture } from "../../../examples/planning-artifacts-multiprocess/fixture.mjs";

const integration = process.env.AGENTPLAT_POSTGRES_TEST === "1";

test("repository construction and migration import perform no I/O", async () => {
  const pool = new Pool({
    connectionString: "postgresql://invalid.invalid/unused",
  });
  assert.doesNotThrow(
    () =>
      new PostgresPlanningFragmentRepositoryV1(
        pool,
        options("artifact_import_test"),
      ),
  );
  await pool.end();
});

test(
  "PostgreSQL preserves immutable artifacts across repository restart",
  { skip: !integration },
  async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const schema = `planning_artifacts_${randomUUID().replaceAll("-", "")}`;
    try {
      assert.equal(
        (await runMigrations(pool, { schema, createSchema: true }))
          .currentVersion,
        2,
      );
      assert.deepEqual(
        (await getMigrationStatus(pool, { schema })).pendingVersions,
        [],
      );
      const { projection } = planningArtifactFixture();
      const first = new PostgresPlanningFragmentRepositoryV1(
        pool,
        options(schema),
      );
      const stored = await first.put(projection.repositoryRecord);
      assert.equal(
        stored.fragmentDigest,
        projection.repositoryRecord.fragmentDigest,
      );
      assert.equal(
        (await first.put(structuredClone(projection.repositoryRecord)))
          .fragmentDigest,
        projection.repositoryRecord.fragmentDigest,
      );

      const restarted = new PostgresPlanningFragmentRepositoryV1(
        pool,
        options(schema),
      );
      assert.deepEqual(
        await restarted.get(projection.repositoryRecord.contentReference),
        projection.repositoryRecord,
      );
      const isolated = new PostgresPlanningFragmentRepositoryV1(pool, {
        ...options(schema),
        peerId: "peer:beta",
        instanceId: "instance:beta:1",
      });
      assert.equal(
        await isolated.get(projection.repositoryRecord.contentReference),
        null,
      );
      await assert.rejects(
        new PostgresPlanningFragmentRepositoryV1(pool, {
          ...options(schema),
          maximumArtifactBytes: 1_024,
        }).put(projection.repositoryRecord),
        /planning_artifact_exceeds_byte_limit/,
      );
    } finally {
      await pool
        .query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
        .catch(() => undefined);
      await pool.end();
    }
  },
);

test(
  "PostgreSQL preserves immutable replication evidence across restart",
  { skip: !integration },
  async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const schema = `planning_replication_${randomUUID().replaceAll("-", "")}`;
    try {
      assert.equal(
        (await runMigrations(pool, { schema, createSchema: true }))
          .currentVersion,
        2,
      );
      const evidence = await replicationEvidence();
      const first = new PostgresPlanningArtifactReplicationEvidenceRepositoryV1(
        pool,
        options(schema),
      );
      assert.deepEqual(
        await first.putReceipt(evidence.receipt),
        evidence.receipt,
      );
      assert.deepEqual(
        await first.putCertificate(evidence.certificate),
        evidence.certificate,
      );
      assert.deepEqual(
        await first.putCertificateAck(evidence.acknowledgement),
        evidence.acknowledgement,
      );
      const restarted =
        new PostgresPlanningArtifactReplicationEvidenceRepositoryV1(
          pool,
          options(schema),
        );
      assert.deepEqual(
        await restarted.getReceipt(evidence.receipt.payload.requestMessageId),
        evidence.receipt,
      );
      assert.deepEqual(
        await restarted.getCertificate({
          fragmentDigest: evidence.certificate.fragmentDigest,
          membershipConfigurationDigest:
            evidence.certificate.membershipConfigurationDigest,
        }),
        evidence.certificate,
      );
      assert.deepEqual(
        await restarted.getCertificateAck(
          evidence.acknowledgement.payload.requestMessageId,
        ),
        evidence.acknowledgement,
      );
      const isolated =
        new PostgresPlanningArtifactReplicationEvidenceRepositoryV1(pool, {
          ...options(schema),
          peerId: "peer:beta",
          instanceId: "instance:beta:1",
        });
      assert.equal(
        await isolated.getCertificate({
          fragmentDigest: evidence.certificate.fragmentDigest,
          membershipConfigurationDigest:
            evidence.certificate.membershipConfigurationDigest,
        }),
        null,
      );
      const conflict = structuredClone(evidence.receipt);
      conflict.payload.storedAtLogicalMs += 1;
      await assert.rejects(
        restarted.putReceipt(conflict),
        /planning_artifact_replica_receipt_conflict/,
      );
    } finally {
      await pool
        .query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
        .catch(() => undefined);
      await pool.end();
    }
  },
);

function options(schema) {
  return {
    schema,
    tenantId: "tenant:artifact-test",
    meshId: "mesh:artifact-test",
    peerId: "peer:alpha",
    instanceId: "instance:alpha:1",
    policyDomainId: "policy-domain:artifact-test",
  };
}

async function replicationEvidence() {
  const { projection } = planningArtifactFixture();
  const keys = new Map(
    await Promise.all(
      ["peer:alpha", "peer:beta"].map(async (peerId) => [
        peerId,
        await crypto.subtle.generateKey(MESH_SIGNATURE_ALGORITHM, true, [
          "sign",
          "verify",
        ]),
      ]),
    ),
  );
  const binding = Object.freeze({
    epoch: 1,
    configurationDigest: `sha256:${"a".repeat(64)}`,
    memberPeerIds: Object.freeze(["peer:alpha", "peer:beta"]),
    memberInstances: Object.freeze([
      { peerId: "peer:alpha", instanceId: "instance:alpha:1" },
      { peerId: "peer:beta", instanceId: "instance:beta:1" },
    ]),
  });
  const membership = {
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
  const policy = Object.freeze({
    schemaVersion: 1,
    replicaCount: 1,
    writeThreshold: 1,
    receiptLifetimeMs: 10_000,
  });
  const selectedReplicas = await selectPlanningArtifactReplicasV1({
    membership: binding,
    sourcePeerId: "peer:alpha",
    sourceInstanceId: "instance:alpha:1",
    fragmentDigest: projection.repositoryRecord.fragmentDigest,
    policy,
  });
  const artifactDigest = await planningArtifactDigestV1(
    projection.repositoryRecord,
  );
  const publicationDigest = `sha256:${"b".repeat(64)}`;
  const receipt = await createSignedPlanningArtifactReplicationEnvelopeV1({
    tenantId: "tenant:artifact-test",
    meshId: "mesh:artifact-test",
    policyDomainId: "policy-domain:artifact-test",
    senderPeerId: "peer:beta",
    senderInstanceId: "instance:beta:1",
    audiencePeerId: "peer:alpha",
    audienceInstanceId: "instance:alpha:1",
    membership: binding,
    issuedAt: "2030-01-01T00:00:00.000Z",
    expiresAtLogicalMs: 10_100,
    payload: {
      type: "artifact.replica.stored",
      requestMessageId: "artifact.replication.request.alpha.beta",
      publicationDigest,
      contentReference: projection.repositoryRecord.contentReference,
      fragmentDigest: projection.repositoryRecord.fragmentDigest,
      artifactDigest,
      storedAtLogicalMs: 100,
    },
    signing: {
      privateKey: keys.get("peer:beta").privateKey,
      keyId: "key.peer:beta",
      algorithm: MESH_SIGNATURE_ALGORITHM,
    },
  });
  const certificate = await createPlanningArtifactReplicationCertificateV1({
    tenantId: "tenant:artifact-test",
    meshId: "mesh:artifact-test",
    policyDomainId: "policy-domain:artifact-test",
    sourcePeerId: "peer:alpha",
    sourceInstanceId: "instance:alpha:1",
    membership: binding,
    publicationDigest,
    contentReference: projection.repositoryRecord.contentReference,
    fragmentDigest: projection.repositoryRecord.fragmentDigest,
    artifactDigest,
    policy,
    selectedReplicas,
    receipts: [receipt],
    certifiedAtLogicalMs: 100,
    expiresAtLogicalMs: 10_100,
    membershipResolver: membership,
  });
  const acknowledgement =
    await createSignedPlanningArtifactReplicationEnvelopeV1({
      tenantId: "tenant:artifact-test",
      meshId: "mesh:artifact-test",
      policyDomainId: "policy-domain:artifact-test",
      senderPeerId: "peer:beta",
      senderInstanceId: "instance:beta:1",
      audiencePeerId: "peer:alpha",
      audienceInstanceId: "instance:alpha:1",
      membership: binding,
      issuedAt: "2030-01-01T00:00:00.000Z",
      expiresAtLogicalMs: 10_100,
      payload: {
        type: "artifact.certificate.stored",
        requestMessageId: "artifact.replication.certificate.alpha.beta",
        certificateId: certificate.certificateId,
        artifactDigest,
        storedAtLogicalMs: 100,
      },
      signing: {
        privateKey: keys.get("peer:beta").privateKey,
        keyId: "key.peer:beta",
        algorithm: MESH_SIGNATURE_ALGORITHM,
      },
    });
  return { receipt, certificate, acknowledgement };
}
