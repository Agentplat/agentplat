import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createCollectiveSyncRecordV1 } from "@agentplat/collective-sync";
import { Pool } from "pg";
import {
  PostgresCollectiveSyncRepositoryV1,
  getMigrationStatus,
  runMigrations,
} from "../dist/index.js";
import { PostgresExecutionCheckpointRepositoryV1 } from "../dist/checkpoints.js";

const integration = process.env.AGENTPLAT_POSTGRES_TEST === "1";
const binding = {
  epoch: 1,
  configurationDigest: `sha256:${"a".repeat(64)}`,
  memberPeerIds: ["peer.1", "peer.2", "peer.3"],
  memberInstances: [
    { peerId: "peer.1", instanceId: "instance.1" },
    { peerId: "peer.2", instanceId: "instance.2" },
    { peerId: "peer.3", instanceId: "instance.3" },
  ],
};

test("repository construction and migration import perform no I/O", async () => {
  const pool = new Pool({
    connectionString: "postgresql://invalid.invalid/unused",
  });
  assert.doesNotThrow(
    () =>
      new PostgresCollectiveSyncRepositoryV1(pool, options("sync_import_test")),
  );
  assert.doesNotThrow(
    () =>
      new PostgresExecutionCheckpointRepositoryV1(
        pool,
        options("sync_import_test"),
      ),
  );
  await pool.end();
});

test(
  "PostgreSQL resumes causal heads and session cursors after restart",
  { skip: !integration },
  async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const schema = `collective_sync_${randomUUID().replaceAll("-", "")}`;
    try {
      assert.equal(
        (await runMigrations(pool, { schema, createSchema: true }))
          .currentVersion,
        2,
      );
      assert.equal(
        (await getMigrationStatus(pool, { schema })).pendingVersions.length,
        0,
      );
      const firstRepository = new PostgresCollectiveSyncRepositoryV1(
        pool,
        options(schema),
      );
      const first = await syncRecord(1, null, "one");
      const second = await syncRecord(2, first.recordDigest, "two");
      const [left, right] = await Promise.all([
        firstRepository.append({
          syncDomain: "mission.1",
          membership: binding,
          records: [first],
        }),
        firstRepository.append({
          syncDomain: "mission.1",
          membership: binding,
          records: [first],
        }),
      ]);
      assert.equal(
        left.acceptedRecordDigests.length + right.acceptedRecordDigests.length,
        1,
      );
      await firstRepository.append({
        syncDomain: "mission.1",
        membership: binding,
        records: [second],
      });
      const session = {
        schemaVersion: 1,
        sessionId: "sync.session.1",
        syncDomain: "mission.1",
        membershipEpoch: 1,
        membershipConfigurationDigest: binding.configurationDigest,
        targetFrontier: null,
        sourcePeerIds: [],
        cursors: [
          { streamId: "stream.1", sequence: 1, headDigest: first.recordDigest },
        ],
        importedRecordDigests: [first.recordDigest],
        status: "transferring",
        certificateId: null,
        failureCode: null,
        updatedAtLogicalMs: 10,
      };
      await firstRepository.saveSession(session);
      await firstRepository.saveSession(session);
      await assert.rejects(
        firstRepository.saveSession({ ...session, status: "certifying" }),
        /sync_session_conflict_or_time_regression/,
      );
      await firstRepository.saveSession({
        ...session,
        status: "certifying",
        updatedAtLogicalMs: 11,
      });

      const restarted = new PostgresCollectiveSyncRepositoryV1(
        pool,
        options(schema),
      );
      assert.equal(
        (
          await restarted.frontier({
            syncDomain: "mission.1",
            membership: binding,
          })
        ).entries[0].sequence,
        2,
      );
      assert.equal(
        (await restarted.loadSession("sync.session.1")).cursors[0].sequence,
        1,
      );
      const chunk = await restarted.readAfter({
        syncDomain: "mission.1",
        membership: binding,
        cursors: [
          { streamId: "stream.1", sequence: 1, headDigest: first.recordDigest },
        ],
        maximumRecords: 10,
        maximumBytes: 100_000,
      });
      assert.deepEqual(
        chunk.records.map(({ recordDigest }) => recordDigest),
        [second.recordDigest],
      );
      const fork = await syncRecord(2, first.recordDigest, "fork");
      await assert.rejects(
        restarted.append({
          syncDomain: "mission.1",
          membership: binding,
          records: [fork],
        }),
        /sync_stream_fork/,
      );
      assert.equal(
        (
          await restarted.frontier({
            syncDomain: "mission.1",
            membership: binding,
          })
        ).entries[0].headDigest,
        second.recordDigest,
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
    tenantId: "tenant.1",
    meshId: "mesh.1",
    peerId: "peer.1",
    instanceId: "instance.1",
    policyDomainId: "policy.1",
  };
}

function syncRecord(sequence, predecessorDigest, value) {
  return createCollectiveSyncRecordV1({
    tenantId: "tenant.1",
    meshId: "mesh.1",
    policyDomainId: "policy.1",
    syncDomain: "mission.1",
    streamId: "stream.1",
    sequence,
    predecessorDigest,
    payload: { value },
    createdAtLogicalMs: sequence,
  });
}
