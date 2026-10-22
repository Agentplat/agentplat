import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  runMigrations,
  getMigrationStatus,
  PostgresMemoryRevisionStoreV1,
  createPostgresPool,
  runMemoryRevisionMigrations,
  getMemoryRevisionMigrationStatus,
  rollbackMemoryRevisionMigrations,
  memoryRevisionRollbackConfirmation,
} from "../dist/index.js";
import {
  memoryRevisionScenarios,
  memoryRevisionRaceScenarios,
} from "../../../tests/helpers/memory-revision-scenarios.mjs";
test("memory revision adapter construction performs no I/O", () => {
  new PostgresMemoryRevisionStoreV1(
    {
      query() {
        throw Error("I/O");
      },
    },
    { schema: "safe" },
  );
  assert.throws(
    () => new PostgresMemoryRevisionStoreV1({}, { schema: "invalid-schema" }),
  );
});
test(
  "PostgreSQL memory revisions: shared conformance, restart, migration ledger and rollback",
  { skip: process.env.AGENTPLAT_POSTGRES_TEST !== "1" },
  async () => {
    const schema = "memory_" + randomUUID().replaceAll("-", "");
    let pool = createPostgresPool();
    try {
      assert.equal(
        (
          await runMemoryRevisionMigrations(pool, {
            schema,
            createSchema: true,
          })
        ).currentVersion,
        1,
      );
      const roomMigrationVersion = (await runMigrations(pool, { schema }))
        .currentVersion;
      const record = await memoryRevisionScenarios(
        new PostgresMemoryRevisionStoreV1(pool, { schema }),
      );
      await memoryRevisionRaceScenarios(
        new PostgresMemoryRevisionStoreV1(pool, { schema }),
      );
      await pool.end();
      pool = createPostgresPool();
      assert.deepEqual(
        await new PostgresMemoryRevisionStoreV1(pool, { schema }).head(
          "t",
          "preference",
        ),
        record,
      );
      assert.equal(
        (await getMemoryRevisionMigrationStatus(pool, { schema }))
          .currentVersion,
        1,
      );
      await assert.rejects(
        rollbackMemoryRevisionMigrations(pool, {
          schema,
          expectedCurrentVersion: 1,
          confirm: "wrong",
          allowDataLoss: true,
        }),
      );
      await assert.rejects(
        rollbackMemoryRevisionMigrations(pool, {
          schema,
          expectedCurrentVersion: 1,
          confirm: memoryRevisionRollbackConfirmation(schema),
        }),
      );
      assert.equal(
        (
          await rollbackMemoryRevisionMigrations(pool, {
            schema,
            expectedCurrentVersion: 1,
            confirm: memoryRevisionRollbackConfirmation(schema),
            allowDataLoss: true,
          })
        ).currentVersion,
        0,
      );
      assert.equal(
        (await runMemoryRevisionMigrations(pool, { schema })).currentVersion,
        1,
      );
      assert.equal(
        (await getMigrationStatus(pool, { schema })).currentVersion,
        roomMigrationVersion,
      );
    } finally {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  },
);
