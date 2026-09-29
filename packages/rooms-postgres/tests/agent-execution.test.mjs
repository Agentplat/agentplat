import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { AgentDefinitionRegistry } from "@agentplat/rooms";
import {
  createPostgresPool,
  PostgresAgentDefinitionRegistryStore,
  PostgresAgentGovernanceStoreV1,
  PostgresAgentExecutionStoreV1,
  runMigrations,
  rollbackMigrations,
  rollbackConfirmation,
} from "../dist/index.js";
import { executionScenarios } from "../../../tests/helpers/agent-execution-scenarios.mjs";

test(
  "PostgreSQL governed effect admission preserves budgets through races, reopen and ownership changes",
  { skip: process.env.AGENTPLAT_POSTGRES_TEST !== "1" },
  async () => {
    const schema = `execution_${randomUUID().replaceAll("-", "")}`;
    let pool = createPostgresPool({ options: "-c search_path=pg_catalog" });
    try {
      assert.equal(
        (await runMigrations(pool, { schema, createSchema: true }))
          .currentVersion,
        18,
      );
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
      assert.equal(
        (
          await rollbackMigrations(pool, {
            schema,
            expectedCurrentVersion: 16,
            confirm: rollbackConfirmation(schema, 16),
            allowDataLoss: true,
          })
        ).currentVersion,
        15,
      );
      assert.equal((await runMigrations(pool, { schema })).currentVersion, 18);
      const result = await executionScenarios({
        store: new PostgresAgentExecutionStoreV1(pool, { schema }),
        governance: new PostgresAgentGovernanceStoreV1(pool, { schema }),
        definitions: new AgentDefinitionRegistry(
          new PostgresAgentDefinitionRegistryStore(pool, { schema }),
        ),
      });
      await pool.end();
      pool = createPostgresPool({ options: "-c search_path=pg_catalog" });
      const store = new PostgresAgentExecutionStoreV1(pool, { schema });
      assert.deepEqual(
        await store.taskBinding("t", "room", "pending-task"),
        result.taskBinding,
      );
      await assert.rejects(
        pool.query(
          `UPDATE "${schema}".agent_governed_task_bindings SET record=record`,
        ),
        /immutable/,
      );
      assert.deepEqual(
        await store.effect("t", "agent", "remaining"),
        result.unknown,
      );
      const totals = (
        await pool.query(
          `SELECT totals FROM "${schema}".agent_execution_budgets`,
        )
      ).rows[0].totals;
      assert.equal(totals.spend.used, 10);
      await assert.rejects(
        pool.query(
          `UPDATE "${schema}".agent_execution_limits SET record=record`,
        ),
        /immutable/,
      );
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
      await assert.rejects(
        rollbackMigrations(pool, {
          schema,
          expectedCurrentVersion: 16,
          confirm: rollbackConfirmation(schema, 16),
          allowDataLoss: true,
        }),
        /activation history/,
      );
      assert.equal(
        (await store.effect("t", "agent", "remaining")).status,
        "admitted",
      );
    } finally {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  },
);
