import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import {
  PostgresPlanningFragmentRepositoryV1,
  getMigrationStatus,
  runMigrations,
} from "../dist/index.js";
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
        1,
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
