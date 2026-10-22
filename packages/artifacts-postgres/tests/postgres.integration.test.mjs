import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  ArtifactService,
  ArtifactError,
  drainArtifactOutbox,
} from "@agentplat/artifacts";
import {
  PostgresArtifactStore,
  getMigrationStatus,
  runMigrations,
} from "../dist/index.js";

const integration = process.env.AGENTPLAT_POSTGRES_TEST === "1";

test(
  "PostgreSQL artifact history, CAS, tenant isolation and event outbox survive restart",
  { skip: !integration },
  async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const schema = `artifact_it_${randomUUID().replaceAll("-", "")}`;
    try {
      assert.equal(
        (await runMigrations(pool, { schema, createSchema: true }))
          .currentVersion,
        2,
      );
      assert.deepEqual(
        (await getMigrationStatus(pool, { schema })).pendingVersions,
        [],
      );
      const store = new PostgresArtifactStore(pool, schema);
      const delivered = [];
      let failFirstDelivery = true;
      const publisher = {
        publish: async (event) => {
          if (failFirstDelivery) {
            failFirstDelivery = false;
            throw new Error("transient_event_failure");
          }
          delivered.push(event);
        },
      };
      const service = new ArtifactService({
        store,
        events: publisher,
        maximumContentBytes: 4096,
      });
      const first = await service.create(
        {
          tenantId: "tenant-a",
          actor: { actorId: "agent-a", actorType: "machine" },
        },
        {
          name: "settings.json",
          format: "json",
          content: '{"enabled":true}',
          roomId: "room-a",
          runId: "run-a",
        },
      );
      assert.equal(first.mimeType, "application/json; charset=utf-8");
      await assert.rejects(
        service.read(
          {
            tenantId: "tenant-b",
            actor: { actorId: "agent-a", actorType: "machine" },
          },
          first.id,
        ),
        (error) => error instanceof ArtifactError && error.code === "not_found",
      );
      assert.equal(
        (
          await service.read(
            {
              tenantId: "tenant-a",
              actor: { actorId: "agent-a", actorType: "machine" },
            },
            first.id,
          )
        ).revision.content,
        '{"enabled":true}',
      );
      assert.equal(await drainArtifactOutbox(store, publisher), 1);
      assert.equal(delivered[0].type, "artifact.created");

      const updateContext = {
        tenantId: "tenant-a",
        actor: { actorId: "agent-a", actorType: "machine" },
      };
      const outcomes = await Promise.allSettled([
        service.update(updateContext, {
          artifactId: first.id,
          expectedRevision: 1,
          content: '{"enabled":false}',
        }),
        service.update(updateContext, {
          artifactId: first.id,
          expectedRevision: 1,
          content: '{"enabled":"stale"}',
        }),
      ]);
      assert.equal(
        outcomes.filter((item) => item.status === "fulfilled").length,
        1,
      );
      assert.equal(
        outcomes.filter(
          (item) =>
            item.status === "rejected" && item.reason.code === "conflict",
        ).length,
        1,
      );

      const restarted = new PostgresArtifactStore(pool, schema);
      const head = await restarted.get("tenant-a", first.id);
      assert.equal(head.artifact.revision, 2);
      assert.equal(
        (await restarted.get("tenant-a", first.id, 1)).revision.content,
        '{"enabled":true}',
      );
      assert.deepEqual(
        (await restarted.listRevisions("tenant-a", first.id)).map(
          (revision) => revision.revision,
        ),
        [1, 2],
      );
      assert.equal(
        delivered.filter((event) => event.type === "artifact.updated").length,
        1,
      );
    } finally {
      await pool
        .query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
        .catch(() => undefined);
      await pool.end();
    }
  },
);
