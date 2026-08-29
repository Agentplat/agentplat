import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { RoomService } from "@agentplat/rooms";
import {
  PostgresAgentRoomOperationalEventStore,
  PostgresRoomRepository,
  createPostgresPool,
  runMigrations,
} from "../dist/index.js";

const enabled = process.env.AGENTPLAT_POSTGRES_TEST === "1";

test(
  "approval expiry and its full operational payload survive restart",
  { skip: !enabled },
  async () => {
    const schema = `room_expiry_${randomUUID().replaceAll("-", "")}`;
    const pool = createPostgresPool({ options: "-c search_path=pg_catalog" });
    let now = new Date("2026-08-28T12:00:00.000Z");
    try {
      assert.equal(
        (await runMigrations(pool, { schema, createSchema: true }))
          .currentVersion,
        12,
      );
      const repository = new PostgresRoomRepository(pool, { schema });
      const service = new RoomService({ repository, clock: () => now });
      const room = await service.createRoom("tenant-a", {
        id: "room-a",
        title: "Expiry",
        goal: "Verify expiry",
      });
      const approval = await service.requestApproval("tenant-a", room.id, {
        id: "approval-a",
        targetType: "room",
        targetId: room.id,
        expiresAt: "2026-08-28T12:01:00.000Z",
      });
      now = new Date("2026-08-28T12:01:00.000Z");
      const expired = await service.expireApproval("tenant-a", approval.id, {
        expiredBy: "expiry-worker",
        expectedExpiresAt: approval.expiresAt,
      });
      assert.equal(expired.status, "expired");

      const restarted = new PostgresRoomRepository(pool, { schema });
      assert.deepEqual(
        await restarted.getApproval("tenant-a", approval.id),
        expired,
      );
      const events = await new PostgresAgentRoomOperationalEventStore(pool, {
        schema,
      }).listAfter({
        tenantId: "tenant-a",
        roomId: room.id,
        afterSequence: 0,
        limit: 100,
      });
      const event = events.find(
        (candidate) => candidate.eventType === "approval_expired",
      );
      assert.equal(event.payload.approvalId, approval.id);
      assert.equal(event.payload.expiresAt, approval.expiresAt);
      assert.equal(event.payload.operation, "insert");
    } finally {
      await pool
        .query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
        .catch(() => undefined);
      await pool.end();
    }
  },
);
