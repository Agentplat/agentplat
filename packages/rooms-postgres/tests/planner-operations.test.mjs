import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createPostgresPool,
  PostgresSharedBudgetStoreV1,
  PostgresScheduledFollowupStoreV1,
  runPlannerOperationsMigrations,
  getPlannerOperationsMigrationStatus,
  rollbackPlannerOperationsMigrations,
  plannerOperationsRollbackConfirmation,
  runMigrations,
  getMigrationStatus,
  runRoomFollowupMigrations,
} from "../dist/index.js";
import { plannerOperationsScenarios } from "../../../tests/helpers/planner-operations-scenarios.mjs";
import { plannerBudgetIntegrationScenarios } from "../../../tests/helpers/planner-budget-integration.mjs";
const enabled = process.env.AGENTPLAT_POSTGRES_TEST === "1";
test(
  "Planner shared budget integration on PostgreSQL",
  { skip: !enabled },
  async (t) =>
    plannerBudgetIntegrationScenarios(t, async () => {
      const schema = `planner_budget_${randomUUID().replaceAll("-", "")}`,
        pool = createPostgresPool();
      await runPlannerOperationsMigrations(pool, {
        schema,
        createSchema: true,
      });
      return {
        budget: new PostgresSharedBudgetStoreV1(pool, { schema }),
        followup: new PostgresScheduledFollowupStoreV1(pool, { schema }),
        dispose: async () => {
          await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
          await pool.end();
        },
      };
    }),
);
test(
  "shared periodic budgets, activations and notices on PostgreSQL",
  { skip: !enabled },
  async (t) =>
    plannerOperationsScenarios(t, async () => {
      const schema = `operations_${randomUUID().replaceAll("-", "")}`,
        pool = createPostgresPool();
      await runPlannerOperationsMigrations(pool, {
        schema,
        createSchema: true,
      });
      return {
        budget: new PostgresSharedBudgetStoreV1(pool, { schema }),
        followup: new PostgresScheduledFollowupStoreV1(pool, { schema }),
        dispose: async () => {
          await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
          await pool.end();
        },
      };
    }),
);
test(
  "operations migrations are independent of Rooms and situations, explicit and reversible",
  { skip: !enabled },
  async () => {
    const schema = `operations_migrate_${randomUUID().replaceAll("-", "")}`,
      pool = createPostgresPool();
    try {
      await runMigrations(pool, { schema, createSchema: true });
      await runRoomFollowupMigrations(pool, { schema });
      assert.equal(
        (await runPlannerOperationsMigrations(pool, { schema })).currentVersion,
        1,
      );
      assert.equal(
        (await getMigrationStatus(pool, { schema })).currentVersion,
        20,
      );
      assert.deepEqual(
        (await getPlannerOperationsMigrationStatus(pool, { schema }))
          .pendingVersions,
        [],
      );
      await assert.rejects(
        rollbackPlannerOperationsMigrations(pool, {
          schema,
          expectedCurrentVersion: 1,
          confirm: "wrong",
          allowDataLoss: true,
        }),
      );
      assert.equal(
        (
          await rollbackPlannerOperationsMigrations(pool, {
            schema,
            expectedCurrentVersion: 1,
            confirm: plannerOperationsRollbackConfirmation(schema),
            allowDataLoss: true,
          })
        ).currentVersion,
        0,
      );
      assert.equal(
        (await getMigrationStatus(pool, { schema })).currentVersion,
        20,
      );
      assert.equal(
        (await runPlannerOperationsMigrations(pool, { schema })).currentVersion,
        1,
      );
    } finally {
      await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
      await pool.end();
    }
  },
);
