import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createStaticMeshKeyResolver } from "@agentplat/mesh-crypto";
import { MESH_SIGNATURE_ALGORITHM } from "@agentplat/mesh-protocol";
import {
  CollectiveAgreementClientV1,
  CollectiveAgreementPeerV1,
  InMemoryCollectiveAgreementTransportV1,
  createCollectiveAgreementMembershipV1,
  createCollectiveAgreementValueV1,
} from "@agentplat/collective-quorum/agreement";
import { Pool } from "pg";
import {
  PostgresCollectiveAgreementRepositoryV1,
  runMigrations,
} from "../dist/agreement.js";

const integration = process.env.AGENTPLAT_POSTGRES_TEST === "1";
const wallTime = "2030-01-01T00:00:00.000Z";

test("agreement repository construction performs no I/O", async () => {
  const pool = new Pool({
    connectionString: "postgresql://invalid.invalid/unused",
  });
  assert.doesNotThrow(
    () =>
      new PostgresCollectiveAgreementRepositoryV1(pool, {
        schema: "agreement_import_test",
        tenantId: "tenant.1",
        meshId: "mesh.1",
        peerId: "p0",
      }),
  );
  await pool.end();
});

test(
  "PostgreSQL preserves locks and commits across validator restart",
  { skip: !integration },
  async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const schema = `agreement_${randomUUID().replaceAll("-", "")}`;
    try {
      assert.equal(
        (await runMigrations(pool, { schema, createSchema: true }))
          .currentVersion,
        3,
      );
      const fixture = await createFixture(pool, schema);
      const value = await createCollectiveAgreementValueV1({
        kind: "application",
        valueId: "value.postgres.1",
        payload: { decision: "durable" },
      });
      const commit = await fixture.client.decide({
        membership: fixture.membership,
        policyDomainId: "policy.1",
        slotId: "slot.postgres",
        height: 1,
        round: 0,
        value,
        logicalTimeMs: 100,
      });
      assert.ok(commit);
      const restarted = new PostgresCollectiveAgreementRepositoryV1(pool, {
        schema,
        tenantId: "tenant.1",
        meshId: "mesh.1",
        peerId: "p0",
      });
      const state = await restarted.readState({
        policyDomainId: "policy.1",
        slotId: "slot.postgres",
        height: 1,
      });
      assert.equal(state.lockedRound, 0);
      assert.equal(state.lockedValueDigest, value.valueDigest);
      assert.equal(
        (
          await restarted.getCommit({
            policyDomainId: "policy.1",
            slotId: "slot.postgres",
            height: 1,
          })
        ).certificateDigest,
        commit.certificateDigest,
      );
    } finally {
      await pool
        .query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
        .catch(() => undefined);
      await pool.end();
    }
  },
);

async function createFixture(pool, schema) {
  const peerIds = ["p0", "p1", "p2", "p3"];
  const keys = Object.create(null);
  const records = [];
  for (const peerId of peerIds) {
    const pair = await crypto.subtle.generateKey(
      MESH_SIGNATURE_ALGORITHM,
      true,
      ["sign", "verify"],
    );
    keys[peerId] = pair;
    records.push({
      tenantId: "tenant.1",
      meshId: "mesh.1",
      peerId,
      keyId: `key.${peerId}`,
      algorithm: MESH_SIGNATURE_ALGORITHM,
      publicKey: pair.publicKey,
      validFrom: "2029-01-01T00:00:00.000Z",
      validUntil: "2031-01-01T00:00:00.000Z",
      status: "active",
    });
  }
  const membership = await createCollectiveAgreementMembershipV1({
    epoch: 1,
    faultThreshold: 1,
    validators: peerIds.map((peerId) => ({
      peerId,
      instanceId: `instance.${peerId}`,
      keyId: `key.${peerId}`,
    })),
  });
  const membershipPort = {
    current: async () => membership,
    resolve: async (input) =>
      input.epoch === membership.epoch &&
      input.configurationDigest === membership.configurationDigest
        ? membership
        : null,
  };
  const resolver = createStaticMeshKeyResolver(records);
  const transport = new InMemoryCollectiveAgreementTransportV1();
  const repositories = Object.create(null);
  const clock = { now: () => ({ wallTime, logicalTimeMs: 100 }) };
  for (const peerId of peerIds) {
    repositories[peerId] = new PostgresCollectiveAgreementRepositoryV1(pool, {
      schema,
      tenantId: "tenant.1",
      meshId: "mesh.1",
      peerId,
    });
    transport.register(
      peerId,
      new CollectiveAgreementPeerV1({
        scope: scope(peerId),
        signing: signing(keys[peerId], peerId),
        resolver,
        membership: membershipPort,
        repository: repositories[peerId],
        semantics: {
          evaluate: async () => ({ accepted: true, reasonCode: "accepted" }),
        },
        clock,
      }),
    );
  }
  return {
    membership,
    client: new CollectiveAgreementClientV1({
      scope: scope("p0"),
      signing: signing(keys.p0, "p0"),
      resolver,
      membership: membershipPort,
      repository: repositories.p0,
      transport,
      clock,
    }),
  };
}

function scope(peerId) {
  return {
    tenantId: "tenant.1",
    meshId: "mesh.1",
    peerId,
    instanceId: `instance.${peerId}`,
  };
}

function signing(pair, peerId) {
  return {
    privateKey: pair.privateKey,
    keyId: `key.${peerId}`,
    algorithm: MESH_SIGNATURE_ALGORITHM,
  };
}
