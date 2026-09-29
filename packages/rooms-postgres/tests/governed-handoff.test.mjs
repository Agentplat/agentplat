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
  PostgresRoomHandoffStore,
  PostgresRoomRepository,
  runMigrations,
} from "../dist/index.js";
import { governedHandoffScenarios } from "../../../tests/helpers/governed-handoff-scenarios.mjs";
test(
  "PostgreSQL native Handoff and descendant effects retain parent budget and work provenance",
  { skip: process.env.AGENTPLAT_POSTGRES_TEST !== "1" },
  async () => {
    const schema = `delegation_${randomUUID().replaceAll("-", "")}`,
      pool = createPostgresPool({ options: "-c search_path=pg_catalog" });
    try {
      await runMigrations(pool, { schema, createSchema: true });
      await governedHandoffScenarios({
        governance: new PostgresAgentGovernanceStoreV1(pool, { schema }),
        execution: new PostgresAgentExecutionStoreV1(pool, { schema }),
        continuity: new PostgresAgentContinuityStoreV1(pool, { schema }),
        handoffs: new PostgresRoomHandoffStore(pool, { schema }),
        repository: new PostgresRoomRepository(pool, { schema }),
        definitions: new AgentDefinitionRegistry(
          new PostgresAgentDefinitionRegistryStore(pool, { schema }),
        ),
      });
    } finally {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  },
);
