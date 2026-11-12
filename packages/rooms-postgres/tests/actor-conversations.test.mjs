import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createPostgresPool,
  PostgresRoomConversationStore,
  runRoomConversationMigrations,
  getRoomConversationMigrationStatus,
} from "../dist/index.js";
import { conversationScenarios } from "../../../tests/helpers/actor-conversation-scenarios.mjs";

test("actor conversation store rejects unsafe schema without I/O", () => {
  assert.throws(() => new PostgresRoomConversationStore({}, "bad-schema"));
});
test(
  "actor conversation PostgreSQL migration, shared conformance, restart and ledger",
  { skip: process.env.AGENTPLAT_POSTGRES_TEST !== "1" },
  async () => {
    const schema = "actor_" + randomUUID().replaceAll("-", "");
    let pool = createPostgresPool();
    try {
      assert.equal(
        (
          await runRoomConversationMigrations(pool, {
            schema,
            createSchema: true,
          })
        ).currentVersion,
        1,
      );
      assert.equal(
        (await runRoomConversationMigrations(pool, { schema })).currentVersion,
        1,
      );
      const { conversation } = await conversationScenarios(
        new PostgresRoomConversationStore(pool, schema),
      );
      await pool.end();
      pool = createPostgresPool();
      assert.deepEqual(
        await new PostgresRoomConversationStore(pool, schema).load(
          "tenant",
          "room",
          conversation.id,
        ),
        conversation,
      );
      assert.equal(
        (await getRoomConversationMigrationStatus(pool, { schema }))
          .currentVersion,
        1,
      );
      assert.equal(
        await new PostgresRoomConversationStore(pool, schema).load(
          "other",
          "room",
          conversation.id,
        ),
        undefined,
      );
    } finally {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  },
);
