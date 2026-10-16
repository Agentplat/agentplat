import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createAgentRoomPlanner,
  RoomService,
  AgentRoomPlannerBridge,
  HumanContributionCoordinator,
  InMemoryHumanContributionStore,
} from "@agentplat/rooms";
import {
  createPostgresPool,
  runMigrations,
  PostgresRoomRepository,
  PostgresRoomPlannerStore,
  PostgresRoomPlannerCallResults,
  PostgresAgentRoomPlanStore,
} from "../dist/index.js";
test(
  "Postgres Planner CAS, history, result receipts and restart isolation",
  { skip: process.env.AGENTPLAT_POSTGRES_TEST !== "1" },
  async () => {
    const schema = `planner_${randomUUID().replaceAll("-", "")}`,
      pool = createPostgresPool();
    try {
      await runMigrations(pool, { schema, createSchema: true });
      const rooms = new RoomService({
        repository: new PostgresRoomRepository(pool, { schema }),
      });
      const room = await rooms.createRoom("t", {
          title: "Planner",
          goal: "Verify",
        }),
        scope = { tenantId: "t", roomId: room.id };
      const message = {
        id: "nonce",
        idempotent: true,
        role: "human",
        content: "Research once",
        metadata: { b: 2, a: 1 },
      };
      const sent = await Promise.all([
        rooms.sendMessage("t", room.id, message),
        rooms.sendMessage("t", room.id, message),
      ]);
      assert.deepEqual(sent[0], sent[1]);
      const reopenedRooms = new RoomService({
        repository: new PostgresRoomRepository(pool, { schema }),
      });
      assert.deepEqual(
        await reopenedRooms.sendMessage("t", room.id, {
          ...message,
          metadata: { a: 1, b: 2 },
        }),
        sent[0],
      );
      await assert.rejects(
        reopenedRooms.sendMessage("t", room.id, {
          ...message,
          content: "Changed",
        }),
        (e) => e.code === "CONFLICT",
      );
      assert.equal(
        (await reopenedRooms.listEvents("t", room.id)).filter(
          (e) => e.type === "message_created",
        ).length,
        1,
      );
      const store = new PostgresRoomPlannerStore(pool, { schema });
      const planner = createAgentRoomPlanner({
        store,
        reservationMicros: { reason: 10, task: 10, review: 10, direct: 10 },
        authorize: async () => {},
        reasoner: {
          propose: async () => {
            throw Error();
          },
        },
        resolveEvent: async (_, id) => ({
          id,
          kind: "message",
          actorId: "owner",
          content: "Research with evidence",
        }),
        context: async () => ({}),
        route: async () => [],
        execute: async () => {
          throw Error();
        },
        verify: async () => {
          throw Error();
        },
        deliver: async () => {},
      });
      await planner.configure(scope, {
        mode: "observe",
        budgetLimitMicros: 100,
      });
      const current = await store.load(scope);
      const attempts = await Promise.all([
        store.compareAndSet(0, {
          ...current,
          revision: 1,
          budgetLimitMicros: 120,
        }),
        store.compareAndSet(0, {
          ...current,
          revision: 1,
          budgetLimitMicros: 150,
        }),
      ]);
      assert.equal(attempts.filter(Boolean).length, 1);
      assert.equal(
        (await pool.query(`SELECT * FROM "${schema}".room_planner_history`))
          .rowCount,
        2,
      );
      const receipts = new PostgresRoomPlannerCallResults(pool, { schema });
      await receipts.put(scope, "op", { usage: { costMicros: 1 } });
      await receipts.put(scope, "op", { usage: { costMicros: 1 } });
      await assert.rejects(
        receipts.put(scope, "op", { usage: { costMicros: 2 } }),
      );
      assert.deepEqual(
        await new PostgresRoomPlannerCallResults(pool, { schema }).get(
          scope,
          "op",
        ),
        { usage: { costMicros: 1 } },
      );
      assert.equal(
        await store.load({ ...scope, tenantId: "other" }),
        undefined,
      );
      await planner.acceptEvent(scope, "event");
      await planner.acceptEvent(scope, "event");
      assert.equal((await planner.get(scope)).events.length, 1);
      const agent = await rooms.addParticipant("t", room.id, {
        type: "agent",
        displayName: "Researcher",
        role: "researcher",
        runtime: { platform: "mock" },
      });
      const bridge = new AgentRoomPlannerBridge(
        new PostgresAgentRoomPlanStore(pool, { schema }),
        rooms,
        new HumanContributionCoordinator(
          rooms,
          new InMemoryHumanContributionStore(),
        ),
        {
          propose: async () => {
            throw Error("unused");
          },
        },
      );
      const input = {
        ...scope,
        planId: "p1",
        taskIdentityPrefix: "goal",
        objective: "Research",
        steps: [
          {
            stepId: "draft",
            kind: "agent_task",
            participantId: agent.id,
            instruction: "Research",
            expectedOutput: "Report",
            expectedArtifactKind: "report",
            actionLevel: "read",
          },
        ],
      };
      const plan = await bridge.create(input);
      await bridge.create({
        ...input,
        steps: input.steps.map((step) =>
          Object.fromEntries(Object.entries(step).reverse()),
        ),
      });
      await bridge.materialize({
        ...scope,
        planId: "p1",
        expectedRevision: plan.revision,
      });
      await assert.rejects(
        bridge.create({ ...input, objective: "A different objective" }),
        /already exists/,
      );
      assert.equal((await rooms.getRoomState("t", room.id)).tasks.length, 1);
    } finally {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  },
);
