import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { AgentDefinitionRegistry } from "@agentplat/rooms";
import {
  createPostgresPool,
  PostgresAgentGovernanceStoreV1,
  PostgresAgentExecutionStoreV1,
  PostgresPurposeMissionStoreV1,
  PostgresAgentInceptionStoreV1,
  PostgresAttentionSignalStoreV1,
  PostgresAgentRoomPlanStore,
  PostgresRoomRepository,
  PostgresAgentDefinitionRegistryStore,
  runMigrations,
  rollbackMigrations,
  rollbackConfirmation,
} from "../dist/index.js";
import { purposeMissionScenarios } from "../../../tests/helpers/purpose-mission-scenarios.mjs";
test(
  "PostgreSQL purpose missions preserve decisions, outcomes and work revocation across reopen",
  { skip: process.env.AGENTPLAT_POSTGRES_TEST !== "1" },
  async () => {
    const schema = `purpose_${randomUUID().replaceAll("-", "")}`;
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
      assert.equal(
        (
          await rollbackMigrations(pool, {
            schema,
            expectedCurrentVersion: 17,
            confirm: rollbackConfirmation(schema, 17),
            allowDataLoss: true,
          })
        ).currentVersion,
        16,
      );
      assert.equal((await runMigrations(pool, { schema })).currentVersion, 18);
      const setup = () => ({
        governance: new PostgresAgentGovernanceStoreV1(pool, { schema }),
        execution: new PostgresAgentExecutionStoreV1(pool, { schema }),
        missions: new PostgresPurposeMissionStoreV1(pool, { schema }),
        inceptions: new PostgresAgentInceptionStoreV1(pool, { schema }),
        signals: new PostgresAttentionSignalStoreV1(pool, { schema }),
        plans: new PostgresAgentRoomPlanStore(pool, { schema }),
        repository: new PostgresRoomRepository(pool, { schema }),
        definitions: new AgentDefinitionRegistry(
          new PostgresAgentDefinitionRegistryStore(pool, { schema }),
        ),
      });
      const result = await purposeMissionScenarios(setup());
      await pool.end();
      pool = createPostgresPool({ options: "-c search_path=pg_catalog" });
      const reopened = setup();
      assert.deepEqual(
        await reopened.missions.load("t", "agent", "mission"),
        result.completed,
      );
      assert.deepEqual(
        await reopened.missions.load("t", "agent", "recovery"),
        result.recovery,
      );
      const history = await reopened.missions.history(
        "t",
        "agent",
        "mission",
        -1,
        100,
      );
      assert.equal(history[0].status, "awaiting_evaluation");
      assert.equal(history.at(-1).status, "completed");
      await assert.rejects(
        pool.query(
          `UPDATE "${schema}".purpose_mission_history SET state=state`,
        ),
        /immutable/,
      );
      assert.equal(
        await reopened.execution.effect("t", "agent", "fenced-effect"),
        undefined,
      );
      await rollbackMigrations(pool, {
        schema,
        expectedCurrentVersion: 18,
        confirm: rollbackConfirmation(schema, 18),
        allowDataLoss: true,
      });
      await assert.rejects(
        rollbackMigrations(pool, {
          schema,
          expectedCurrentVersion: 17,
          confirm: rollbackConfirmation(schema, 17),
          allowDataLoss: true,
        }),
        /purpose activation history/,
      );
    } finally {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  },
);
