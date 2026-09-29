import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { RoomService, AgentDefinitionRegistry } from "@agentplat/rooms";
import {
  createPostgresPool,
  runMigrations,
  rollbackMigrations,
  rollbackConfirmation,
  getMigrationStatus,
  PostgresRoomRepository,
  PostgresAgentDefinitionRegistryStore,
} from "../dist/index.js";
test(
  "upgrade 012 to 018 preserves legacy Room data, revision digests and instruction execution",
  { skip: process.env.AGENTPLAT_POSTGRES_TEST !== "1" },
  async () => {
    const schema = `upgrade_${randomUUID().replaceAll("-", "")}`,
      pool = createPostgresPool({ options: "-c search_path=pg_catalog" });
    try {
      await runMigrations(pool, { schema, createSchema: true });
      for (let version = 18; version > 12; version--)
        await rollbackMigrations(pool, {
          schema,
          expectedCurrentVersion: version,
          confirm: rollbackConfirmation(schema, version),
          allowDataLoss: true,
        });
      assert.equal(
        (await getMigrationStatus(pool, { schema })).currentVersion,
        12,
      );
      const registry = new AgentDefinitionRegistry(
        new PostgresAgentDefinitionRegistryStore(pool, { schema }),
      );
      await registry.createAgent({
        tenantId: "legacy",
        agentId: "agent",
        name: "Legacy agent",
      });
      const definition = await registry.createRevision({
        tenantId: "legacy",
        agentId: "agent",
        version: "1.0.0",
        instructions: "Complete assigned work",
        runtimeProfile: { platform: "legacy" },
      });
      await registry.publishRevision(
        "legacy",
        definition.definition.revisionId,
        0,
      );
      const rooms = new RoomService({
        repository: new PostgresRoomRepository(pool, { schema }),
        runtime: {
          registerProvider() {},
          async *stream() {},
          async run() {
            return { status: "completed", output: "legacy work completed" };
          },
        },
      });
      const room = await rooms.createRoom("legacy", {
        id: "old-room",
        title: "Existing room",
        goal: "Keep traditional work operational",
      });
      const participant = await rooms.addParticipant("legacy", room.id, {
        id: "agent",
        type: "agent",
        displayName: "Legacy agent",
        role: "worker",
        permissions: ["task.run"],
        runtime: { platform: "legacy" },
      });
      await rooms.sendMessage("legacy", room.id, {
        id: "old-message",
        role: "human",
        content: "Existing input",
      });
      const create = (id) =>
        rooms.createTask("legacy", room.id, {
          id,
          stepId: id,
          assignedParticipantId: participant.id,
          instruction: "Traditional task",
          expectedOutput: "Done",
          expectedArtifactKind: "result",
        });
      await create("before-upgrade");
      await rooms.runTask("legacy", room.id, "before-upgrade");
      const before = await rooms.getRoomState("legacy", room.id),
        revision = await registry.getRevision(
          "legacy",
          definition.definition.revisionId,
        );
      assert.equal(revision.definition.interaction, undefined);
      assert.equal((await runMigrations(pool, { schema })).currentVersion, 18);
      assert.equal((await runMigrations(pool, { schema })).currentVersion, 18);
      assert.deepEqual(await rooms.getRoomState("legacy", room.id), before);
      assert.deepEqual(
        await registry.getRevision("legacy", definition.definition.revisionId),
        revision,
      );
      assert.equal(
        (
          await registry.resolvePublishedRevision(
            "legacy",
            definition.definition.revisionId,
          )
        ).digest,
        revision.definition.digest,
      );
      await create("after-upgrade");
      await rooms.runTask("legacy", room.id, "after-upgrade");
      assert.equal(
        (await rooms.getRoomState("legacy", room.id)).tasks.find(
          (t) => t.id === "after-upgrade",
        ).status,
        "completed",
      );
      const rows = await pool.query(
        `SELECT count(*)::int AS count FROM "${schema}".agent_governance_heads`,
      );
      assert.equal(
        rows.rows[0].count,
        0,
        "Legacy agents are not silently enrolled",
      );
    } finally {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  },
);
