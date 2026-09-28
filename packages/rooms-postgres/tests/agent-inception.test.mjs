import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { AgentDefinitionRegistry, RoomService } from "@agentplat/rooms";
import {
  createPostgresPool,
  PostgresAgentDefinitionRegistryStore,
  PostgresAgentGovernanceStoreV1,
  PostgresAgentInceptionStoreV1,
  PostgresRoomRepository,
  runMigrations,
  rollbackMigrations,
  rollbackConfirmation,
} from "../dist/index.js";
import { inceptionScenarios } from "../../../tests/helpers/agent-inception-scenarios.mjs";

test(
  "PostgreSQL inceptions preserve source and assessment history across reopen, races and rollback",
  { skip: process.env.AGENTPLAT_POSTGRES_TEST !== "1" },
  async () => {
    const schema = `inception_${randomUUID().replaceAll("-", "")}`;
    let pool = createPostgresPool({ options: "-c search_path=pg_catalog" });
    try {
      assert.equal(
        (await runMigrations(pool, { schema, createSchema: true }))
          .currentVersion,
        18,
      );
      const result = await inceptionScenarios({
        governance: new PostgresAgentGovernanceStoreV1(pool, { schema }),
        store: new PostgresAgentInceptionStoreV1(pool, { schema }),
        definitions: new AgentDefinitionRegistry(
          new PostgresAgentDefinitionRegistryStore(pool, { schema }),
        ),
        rooms: new RoomService({
          repository: new PostgresRoomRepository(pool, { schema }),
        }),
      });
      await pool.end();
      pool = createPostgresPool({ options: "-c search_path=pg_catalog" });
      const reopened = new PostgresAgentInceptionStoreV1(pool, { schema });
      assert.deepEqual(await reopened.get("t", "agent", "idea"), result.intake);
      assert.deepEqual(
        await reopened.history("t", "agent", "idea", -1, 100),
        result.history,
      );
      for (const table of ["agent_inceptions", "agent_inception_assessments"]) {
        await assert.rejects(
          pool.query(`UPDATE "${schema}".${table} SET record=record`),
          /immutable/,
        );
        await assert.rejects(
          pool.query(`DELETE FROM "${schema}".${table}`),
          /immutable/,
        );
      }
      const latest = await reopened.latest("t", "agent", "idea");
      assert.equal(
        await reopened.append({
          ...latest,
          revision: latest.revision + 1,
          previousAssessmentDigest: latest.assessmentDigest,
        }),
        false,
      );
      assert.deepEqual(await reopened.latest("t", "agent", "idea"), latest);
      assert.equal(
        (
          await pool.query(
            `SELECT revision FROM "${schema}".agent_inception_heads`,
          )
        ).rows[0].revision,
        String(latest.revision),
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
      await assert.rejects(
        rollbackMigrations(pool, {
          schema,
          expectedCurrentVersion: 14,
          confirm: "wrong",
          allowDataLoss: true,
        }),
      );
      assert.equal(
        (
          await rollbackMigrations(pool, {
            schema,
            expectedCurrentVersion: 14,
            confirm: rollbackConfirmation(schema, 14),
            allowDataLoss: true,
          })
        ).currentVersion,
        13,
      );
      assert.equal((await runMigrations(pool, { schema })).currentVersion, 18);
    } finally {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  },
);
