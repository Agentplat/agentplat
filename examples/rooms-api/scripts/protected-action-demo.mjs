import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { RoomService } from "@agentplat/rooms";
import {
  createPostgresPool,
  PostgresRoomRepository,
  runMigrations,
} from "@agentplat/rooms-postgres";
import { DefaultAgentRuntime } from "@agentplat/runtime";

const pool = createPostgresPool();
const schema = `proposal_effect_${randomUUID().replaceAll("-", "")}`;
const tenantId = schema;
try {
  await runMigrations(pool);
  // Example-owned effect sink, separate from AgentPlat domain migrations.
  await pool.query(`CREATE SCHEMA ${schema}`);
  await pool.query(
    `CREATE TABLE ${schema}.effects (operation_id text PRIMARY KEY, payload text NOT NULL)`,
  );
  const runtime = new DefaultAgentRuntime();
  let calls = 0;
  let failAfterCommit = true;
  runtime.registerProvider("protected", {
    supportedCheckpoints: ["pre_action"],
    async run(_agent, input, context) {
      calls++;
      const operationId = input.input[0].task.id;
      await context.checkpoint({
        checkpoint: "pre_action",
        payload: { operationId },
      });
      await pool.query(
        `INSERT INTO ${schema}.effects VALUES ($1, $2) ON CONFLICT (operation_id) DO NOTHING`,
        [operationId, "Approved local proposal receipt"],
      );
      if (failAfterCommit) {
        failAfterCommit = false;
        throw new Error("Simulated response loss after local effect commit");
      }
      return { status: "completed", output: "Local effect recorded" };
    },
  });
  let incompatibleCalls = 0;
  runtime.registerProvider("incompatible", {
    async run() {
      incompatibleCalls++;
      return { status: "completed", output: "Unexpected" };
    },
  });
  const rooms = new RoomService({
    repository: new PostgresRoomRepository(pool),
    runtime,
    requireProtectedActionCheckpoints: true,
  });
  const room = await rooms.createRoom(tenantId, {
    title: "Protected proposal action",
    goal: "Demonstrate explicit action controls",
  });
  const human = await rooms.addParticipant(tenantId, room.id, {
    type: "human",
    displayName: "Reviewer",
    role: "owner",
    permissions: ["approve"],
  });
  async function task(platform, approvalRequired = false) {
    const agent = await rooms.addParticipant(tenantId, room.id, {
      type: "agent",
      displayName: platform,
      role: "writer",
      permissions: ["task.run.external_write"],
      runtime: { platform },
    });
    return rooms.createTask(tenantId, room.id, {
      stepId: randomUUID(),
      assignedParticipantId: agent.id,
      instruction: "Record a local proposal receipt",
      expectedOutput: "Receipt",
      expectedArtifactKind: "receipt",
      actionLevel: "external_write",
      approvalRequired,
    });
  }
  const allowed = await task("protected", true);
  await assert.rejects(
    rooms.runTask(tenantId, room.id, allowed.id),
    /requires a granted approval/,
  );
  assert.equal(calls, 0);
  const approval = await rooms.requestApproval(tenantId, room.id, {
    targetType: "task",
    targetId: allowed.id,
    action: "task.run.external_write",
    requestedBy: human.id,
  });
  await rooms.resolveApproval(tenantId, approval.id, "approved", {
    decidedBy: human.id,
  });
  await assert.rejects(
    rooms.runTask(tenantId, room.id, allowed.id),
    /Simulated response loss/,
  );
  await rooms.runTask(tenantId, room.id, allowed.id);
  const denied = await task("protected");
  await assert.rejects(
    rooms.runTask(tenantId, room.id, denied.id, {
      onCheckpoint: async ({ checkpoint }) =>
        checkpoint === "pre_action"
          ? { allowed: false, reason: "Reviewer denied this action" }
          : { allowed: true },
    }),
    /Reviewer denied/,
  );
  const incompatible = await task("incompatible");
  await assert.rejects(
    rooms.runTask(tenantId, room.id, incompatible.id),
    /checkpoint-capable/,
  );
  assert.equal(incompatibleCalls, 0);
  const effects = await pool.query(`SELECT * FROM ${schema}.effects`);
  assert.deepEqual(effects.rows, [
    { operation_id: allowed.id, payload: "Approved local proposal receipt" },
  ]);
  console.log(
    JSON.stringify({
      tenantId,
      roomId: room.id,
      checks: [
        "approval-required",
        "approved",
        "retry-after-commit",
        "checkpoint-denied",
        "incompatible-provider",
      ],
      localEffects: effects.rowCount,
    }),
  );
} finally {
  await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await pool.end();
}
