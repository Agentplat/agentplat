import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { AgentDefinitionRegistry } from "@agentplat/rooms";
import {
  createPostgresPool,
  PostgresAgentDefinitionRegistryStore,
  PostgresAgentGovernanceStoreV1,
  PostgresAgentExecutionStoreV1,
  PostgresAgentContinuityStoreV1,
  runMigrations,
  rollbackMigrations,
  rollbackConfirmation,
} from "../dist/index.js";
import { continuityScenarios } from "../../../tests/helpers/agent-continuity-scenarios.mjs";
test(
  "PostgreSQL continuity preserves ancestral budgets, consent and model lineage through reopen",
  { skip: process.env.AGENTPLAT_POSTGRES_TEST !== "1" },
  async () => {
    const schema = `continuity_${randomUUID().replaceAll("-", "")}`;
    let pool = createPostgresPool({ options: "-c search_path=pg_catalog" });
    try {
      assert.equal(
        (await runMigrations(pool, { schema, createSchema: true }))
          .currentVersion,
        18,
      );
      assert.equal(
        (
          await rollbackMigrations(pool, {
            schema,
            expectedCurrentVersion: 18,
            confirm: rollbackConfirmation(schema, 18),
            allowDataLoss: true,
          })
        ).currentVersion,
        17,
      );
      await runMigrations(pool, { schema });
      const result = await continuityScenarios({
        governance: new PostgresAgentGovernanceStoreV1(pool, { schema }),
        execution: new PostgresAgentExecutionStoreV1(pool, { schema }),
        continuity: new PostgresAgentContinuityStoreV1(pool, { schema }),
        definitions: new AgentDefinitionRegistry(
          new PostgresAgentDefinitionRegistryStore(pool, { schema }),
        ),
      });
      await pool.end();
      pool = createPostgresPool({ options: "-c search_path=pg_catalog" });
      const store = new PostgresAgentContinuityStoreV1(pool, { schema });
      assert.equal((await store.load("t", "origin:child-a")).status, "revoked");
      assert.equal(
        (await store.operation("t", "origin:child-a", "accept")).status,
        "accepted",
      );
      assert.equal(
        (
          await new PostgresAgentExecutionStoreV1(pool, { schema }).effect(
            "t",
            result.winner.binding.agentId,
            result.winner.effect.effectId,
          )
        ).status,
        "not_applied",
      );
      await assert.rejects(
        pool.query(
          `UPDATE "${schema}".agent_continuity_operations SET record=record`,
        ),
        /immutable/,
      );
      await assert.rejects(
        rollbackMigrations(pool, {
          schema,
          expectedCurrentVersion: 18,
          confirm: rollbackConfirmation(schema, 18),
          allowDataLoss: true,
        }),
        /origin|continuity/i,
      );
    } finally {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  },
);
