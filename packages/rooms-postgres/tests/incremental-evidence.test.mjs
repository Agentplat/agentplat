import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createPostgresPool,
  PostgresIncrementalEvidenceStoreV1,
  runIncrementalEvidenceMigrations,
  getIncrementalEvidenceMigrationStatus,
  rollbackIncrementalEvidenceMigrations,
  incrementalEvidenceRollbackConfirmation,
} from "../dist/index.js";
import { incrementalEvidenceScenarios } from "../../../tests/helpers/incremental-evidence-scenarios.mjs";
const enabled = process.env.AGENTPLAT_POSTGRES_TEST === "1";
test(
  "indexed incremental evidence contract on PostgreSQL",
  { skip: !enabled },
  async (t) =>
    incrementalEvidenceScenarios(t, async () => {
      const schema = `evidence_${randomUUID().replaceAll("-", "")}`,
        pool = createPostgresPool();
      await runIncrementalEvidenceMigrations(pool, {
        schema,
        createSchema: true,
      });
      return {
        store: new PostgresIncrementalEvidenceStoreV1(pool, { schema }),
        dispose: async () => {
          await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
          await pool.end();
        },
      };
    }),
);
test(
  "evidence adapter migrations are independent, explicit and reversible",
  { skip: !enabled },
  async () => {
    const schema = `evidence_migrate_${randomUUID().replaceAll("-", "")}`,
      pool = createPostgresPool();
    try {
      assert.equal(
        (
          await runIncrementalEvidenceMigrations(pool, {
            schema,
            createSchema: true,
          })
        ).currentVersion,
        1,
      );
      assert.deepEqual(
        (await getIncrementalEvidenceMigrationStatus(pool, { schema }))
          .pendingVersions,
        [],
      );
      await assert.rejects(
        rollbackIncrementalEvidenceMigrations(pool, {
          schema,
          expectedCurrentVersion: 1,
          confirm: "wrong",
          allowDataLoss: true,
        }),
      );
      assert.equal(
        (
          await rollbackIncrementalEvidenceMigrations(pool, {
            schema,
            expectedCurrentVersion: 1,
            confirm: incrementalEvidenceRollbackConfirmation(schema),
            allowDataLoss: true,
          })
        ).currentVersion,
        0,
      );
      assert.equal(
        (await runIncrementalEvidenceMigrations(pool, { schema }))
          .currentVersion,
        1,
      );
    } finally {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  },
);
