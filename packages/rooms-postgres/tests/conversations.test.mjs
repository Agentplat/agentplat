import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  PostgresRoomRepository,
  createPostgresPool,
  runMigrations,
  getMigrationStatus,
  rollbackMigrations,
  rollbackConfirmation,
} from "../dist/index.js";
import {
  createConversationFixture,
  roomConversationScenarios,
} from "../../../tests/helpers/room-conversation-scenarios.mjs";
import {
  createAgentRoomPlanner,
  resolveRoomConversation,
} from "@agentplat/rooms";
import { PostgresRoomPlannerStore } from "../dist/index.js";

const enabled = process.env.AGENTPLAT_POSTGRES_TEST === "1";
test(
  "Room conversation consumer contract on PostgreSQL and reopened pools",
  { skip: !enabled },
  async (t) => {
    await roomConversationScenarios(t, async () => {
      const schema = `conversations_${randomUUID().replaceAll("-", "")}`;
      const pool = createPostgresPool();
      await runMigrations(pool, { schema, createSchema: true });
      const reopened = [];
      const fixture = await createConversationFixture(
        new PostgresRoomRepository(pool, { schema }),
      );
      return {
        ...fixture,
        async reopen() {
          const next = createPostgresPool();
          reopened.push(next);
          return new PostgresRoomRepository(next, { schema });
        },
        async dispose() {
          await Promise.all(reopened.map((p) => p.end()));
          await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
          await pool.end();
        },
      };
    });
  },
);

test(
  "conversation migration preserves historical data and rolls back/reapplies explicitly",
  { skip: !enabled },
  async () => {
    const schema = `conversation_upgrade_${randomUUID().replaceAll("-", "")}`,
      pool = createPostgresPool();
    try {
      await runMigrations(pool, { schema, createSchema: true });
      assert.equal(
        (await getMigrationStatus(pool, { schema })).currentVersion,
        20,
      );
      await rollbackMigrations(pool, {
        schema,
        expectedCurrentVersion: 20,
        confirm: rollbackConfirmation(schema, 20),
        allowDataLoss: true,
      });
      await pool.query(
        `INSERT INTO "${schema}".rooms(tenant_id,id,title,goal,status,created_at,updated_at) VALUES ('t','r','Legacy','Keep history','active',now(),now())`,
      );
      await pool.query(
        `INSERT INTO "${schema}".messages(tenant_id,id,room_id,role,content,created_at) VALUES ('t','legacy','r','human','Keep this message',now())`,
      );
      await runMigrations(pool, { schema });
      const repository = new PostgresRoomRepository(pool, { schema });
      assert.equal(
        (await repository.getMessage("t", "r", "legacy")).content,
        "Keep this message",
      );
      assert.equal(
        (await repository.getMessage("t", "r", "legacy")).threadId,
        undefined,
      );
    } finally {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  },
);

test(
  "threaded Planner receipts survive worker reconstruction without another model call",
  { skip: !enabled },
  async () => {
    const schema = `conversation_planner_${randomUUID().replaceAll("-", "")}`,
      pool = createPostgresPool();
    try {
      await runMigrations(pool, { schema, createSchema: true });
      const repository = new PostgresRoomRepository(pool, { schema });
      await createConversationFixture(repository);
      let calls = 0;
      const scope = { tenantId: "owner", roomId: "personal" };
      const options = {
        store: new PostgresRoomPlannerStore(pool, { schema }),
        reservationMicros: { reason: 10, task: 10, direct: 10, review: 10 },
        authorize: async () => {},
        resolveEvent: async () => ({
          id: "input",
          kind: "message",
          actorId: "human",
          messageId: "root",
          threadId: "root",
          content: "Prioritize this",
        }),
        resolveConversation: (scope, ref) =>
          resolveRoomConversation(
            repository,
            scope.tenantId,
            scope.roomId,
            ref,
          ),
        context: async () => ({}),
        route: async () => [],
        reasoner: {
          propose: async () => {
            calls++;
            return {
              proposal: { kind: "respond", content: "Known priority" },
              usage: { costMicros: 1, inputTokens: 1, outputTokens: 1 },
            };
          },
        },
        execute: async () => {
          throw Error("No specialist needed");
        },
        verify: async () => {
          throw Error("No task to verify");
        },
        deliver: async () => {},
      };
      const planner = createAgentRoomPlanner(options);
      await planner.configure(scope, {
        mode: "execute",
        budgetLimitMicros: 100,
      });
      await planner.acceptEvent(scope, "input");
      await Promise.all([
        planner.runOnce(scope),
        createAgentRoomPlanner(options).runOnce(scope),
      ]);
      const nextPool = createPostgresPool();
      try {
        const recovered = createAgentRoomPlanner({
          ...options,
          store: new PostgresRoomPlannerStore(nextPool, { schema }),
        });
        await recovered.runOnce(scope);
        const state = await recovered.get(scope);
        assert.equal(calls, 1);
        assert.equal(state.operations[0].threadId, "root");
        assert.equal(state.notifications[0].replyToMessageId, "root");
        assert.equal(state.notifications[0].delivered, true);
      } finally {
        await nextPool.end();
      }
    } finally {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  },
);
