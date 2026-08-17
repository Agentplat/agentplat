import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  COLLECTIVE_QUORUM_PROTOCOL_V1,
  signCollectiveQuorumEnvelopeV1,
} from "@agentplat/collective-quorum";
import { MESH_SIGNATURE_ALGORITHM } from "@agentplat/mesh-protocol";
import { Pool } from "pg";
import {
  PostgresCollectiveQuorumRepositoryV1,
  getMigrationStatus,
  runMigrations,
} from "../dist/index.js";

const integration = process.env.AGENTPLAT_POSTGRES_TEST === "1";
const scopeDigest = `sha256:${"4".repeat(64)}`;

test("repository construction and migration import perform no I/O", async () => {
  const pool = new Pool({
    connectionString: "postgresql://invalid.invalid/unused",
  });
  assert.doesNotThrow(
    () =>
      new PostgresCollectiveQuorumRepositoryV1(pool, {
        schema: "quorum_import_test",
        tenantId: "tenant.1",
        meshId: "mesh.1",
        peerId: "witness.1",
        policyDomainId: "policy.1",
      }),
  );
  await pool.end();
});

test(
  "PostgreSQL preserves promises and accepted values across repository restart",
  { skip: !integration },
  async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const schema = `quorum_${randomUUID().replaceAll("-", "")}`;
    const options = {
      schema,
      tenantId: "tenant.1",
      meshId: "mesh.1",
      peerId: "witness.1",
      policyDomainId: "policy.1",
    };
    const keys = await crypto.subtle.generateKey(
      MESH_SIGNATURE_ALGORITHM,
      true,
      ["sign", "verify"],
    );
    try {
      assert.equal(
        (await runMigrations(pool, { schema, createSchema: true }))
          .currentVersion,
        3,
      );
      assert.equal(
        (await getMigrationStatus(pool, { schema })).pendingVersions.length,
        0,
      );
      const first = new PostgresCollectiveQuorumRepositoryV1(pool, options);
      const ballot = await first.nextBallot({
        scopeDigest,
        proposerPeerId: "candidate.1",
      });
      const promised = await first.promiseRecovery({
        scopeDigest,
        ballot,
        requestMessageId: "request.prepare.1",
        create: (accepted) =>
          signedResponse(keys.privateKey, {
            type: "recovery.promise",
            requestMessageId: "request.prepare.1",
            scopeDigest,
            ballot,
            witnessPeerId: "witness.1",
            accepted,
            promisedAtLogicalMs: 100,
          }),
      });
      assert.ok(promised);

      const restarted = new PostgresCollectiveQuorumRepositoryV1(pool, options);
      const value = {
        selectedProposalId: "proposal.1",
        selectedAssigneePeerId: "candidate.1",
      };
      const accepted = await restarted.acceptRecovery({
        scopeDigest,
        ballot,
        value,
        requestMessageId: "request.accept.1",
        create: () =>
          signedResponse(keys.privateKey, {
            type: "recovery.accepted",
            requestMessageId: "request.accept.1",
            scopeDigest,
            ballot,
            selected: value,
            witnessPeerId: "witness.1",
            acceptedAtLogicalMs: 100,
            expiresAtLogicalMs: 500,
          }),
      });
      assert.ok(accepted);
      let conflictingCreateCalled = false;
      const conflict = await restarted.acceptRecovery({
        scopeDigest,
        ballot,
        value: {
          selectedProposalId: "proposal.2",
          selectedAssigneePeerId: "candidate.2",
        },
        requestMessageId: "request.accept.conflict",
        create: async () => {
          conflictingCreateCalled = true;
          return accepted;
        },
      });
      assert.equal(conflict, null);
      assert.equal(conflictingCreateCalled, false);

      const higher = await restarted.nextBallot({
        scopeDigest,
        proposerPeerId: "candidate.1",
      });
      assert.ok(higher.counter > ballot.counter);
      const replay = await restarted.promiseRecovery({
        scopeDigest,
        ballot,
        requestMessageId: "request.prepare.1",
        create: async () => {
          throw new Error("duplicate callback must not run");
        },
      });
      assert.equal(replay?.messageId, promised.messageId);

      let concurrentCreateCount = 0;
      const concurrentRequestMessageId = "request.prepare.concurrent";
      const concurrentInput = {
        scopeDigest,
        ballot: higher,
        requestMessageId: concurrentRequestMessageId,
        create: async (priorAccepted) => {
          concurrentCreateCount += 1;
          await new Promise((resolve) => setTimeout(resolve, 25));
          return signedResponse(keys.privateKey, {
            type: "recovery.promise",
            requestMessageId: concurrentRequestMessageId,
            scopeDigest,
            ballot: higher,
            witnessPeerId: "witness.1",
            accepted: priorAccepted,
            promisedAtLogicalMs: 200,
          });
        },
      };
      const [concurrentLeft, concurrentRight] = await Promise.all([
        first.promiseRecovery(concurrentInput),
        restarted.promiseRecovery(concurrentInput),
      ]);
      assert.equal(concurrentCreateCount, 1);
      assert.equal(concurrentLeft?.messageId, concurrentRight?.messageId);
    } finally {
      await pool
        .query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
        .catch(() => undefined);
      await pool.end();
    }
  },
);

async function signedResponse(privateKey, payload) {
  return signCollectiveQuorumEnvelopeV1({
    envelope: {
      protocol: COLLECTIVE_QUORUM_PROTOCOL_V1,
      schemaVersion: 1,
      messageId: `response.${payload.requestMessageId}`,
      tenantId: "tenant.1",
      meshId: "mesh.1",
      senderPeerId: "witness.1",
      senderInstanceId: "instance.witness.1",
      audiencePeerId: "candidate.1",
      issuedAt: "2030-01-01T00:00:00.000Z",
      expiresAt: "2030-01-01T00:01:00.000Z",
      payload,
      proof: {
        algorithm: MESH_SIGNATURE_ALGORITHM,
        keyId: "key.witness.1",
      },
    },
    privateKey,
  });
}
