import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { AgentDefinitionRegistry } from "@agentplat/rooms";
import {
  createPostgresPool,
  PostgresAgentDefinitionRegistryStore,
  PostgresAgentGovernanceStoreV1,
  runMigrations,
  getMigrationStatus,
  rollbackMigrations,
  rollbackConfirmation,
} from "../dist/index.js";
import { governanceScenarios } from "../../../tests/helpers/agent-governance-scenarios.mjs";

test(
  "PostgreSQL governance transactions, immutable history, reopen and migration rollback",
  { skip: process.env.AGENTPLAT_POSTGRES_TEST !== "1" },
  async () => {
    const schema = `gov_${randomUUID().replaceAll("-", "")}`;
    let pool = createPostgresPool({ options: "-c search_path=pg_catalog" });
    try {
      assert.equal(
        (await runMigrations(pool, { schema, createSchema: true }))
          .currentVersion,
        18,
      );
      const store = new PostgresAgentGovernanceStoreV1(pool, { schema });
      const definitions = new AgentDefinitionRegistry(
        new PostgresAgentDefinitionRegistryStore(pool, { schema }),
      );
      const expected = await governanceScenarios(store, definitions);
      await pool.end();
      pool = createPostgresPool({ options: "-c search_path=pg_catalog" });
      const reopened = new PostgresAgentGovernanceStoreV1(pool, { schema });
      assert.deepEqual(await reopened.load("tenant-a", "agent"), expected);
      assert.equal(
        (await reopened.history("tenant-a", "agent", -1, 100)).length,
        8,
      );
      await assert.rejects(
        pool.query(
          `UPDATE "${schema}".agent_governance_operations SET operation=operation WHERE tenant_id='tenant-a'`,
        ),
        /immutable/,
      );
      await assert.rejects(
        pool.query(
          `DELETE FROM "${schema}".agent_governance_operations WHERE tenant_id='tenant-a'`,
        ),
        /immutable/,
      );
      // Deliberately reuse an operation identity with a new head: journal conflict must roll back the head update.
      const existing = await reopened.operation("tenant-a", "agent", "accept");
      assert.equal(
        await reopened.commit({
          ...existing,
          expectedRevision: 7,
          result: { ...expected, revision: 8, authorityEpoch: 8 },
        }),
        false,
      );
      assert.deepEqual(await reopened.load("tenant-a", "agent"), expected);
      await rollbackMigrations(pool, {
        schema,
        expectedCurrentVersion: 18,
        confirm: rollbackConfirmation(schema, 18),
        allowDataLoss: true,
      });
      await rollbackMigrations(pool, {
        schema,
        expectedCurrentVersion: 17,
        confirm: rollbackConfirmation(schema, 17),
        allowDataLoss: true,
      });
      await rollbackMigrations(pool, {
        schema,
        expectedCurrentVersion: 16,
        confirm: rollbackConfirmation(schema, 16),
        allowDataLoss: true,
      });
      await rollbackMigrations(pool, {
        schema,
        expectedCurrentVersion: 15,
        confirm: rollbackConfirmation(schema, 15),
        allowDataLoss: true,
      });
      await rollbackMigrations(pool, {
        schema,
        expectedCurrentVersion: 14,
        confirm: rollbackConfirmation(schema, 14),
        allowDataLoss: true,
      });
      await assert.rejects(
        rollbackMigrations(pool, {
          schema,
          expectedCurrentVersion: 13,
          confirm: "wrong",
          allowDataLoss: true,
        }),
      );
      assert.equal(
        (await getMigrationStatus(pool, { schema })).currentVersion,
        13,
      );
      assert.equal(
        (
          await rollbackMigrations(pool, {
            schema,
            expectedCurrentVersion: 13,
            confirm: rollbackConfirmation(schema, 13),
            allowDataLoss: true,
          })
        ).currentVersion,
        12,
      );
      assert.equal((await runMigrations(pool, { schema })).currentVersion, 18);
    } finally {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  },
);
