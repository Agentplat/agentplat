import test from "node:test";
import { randomUUID } from "node:crypto";
import { createPostgresPool } from "../../postgres/dist/index.js";
import { PostgresArtifactStore, runMigrations } from "../dist/index.js";
import { artifactRoomAccessScenarios } from "../../../tests/helpers/artifact-room-access-scenarios.mjs";
test(
  "PostgreSQL Room-shared artifacts enforce policy, revisions and concurrent CAS",
  { skip: process.env.AGENTPLAT_POSTGRES_TEST !== "1" },
  async () => {
    const schema = "artifact_actor_" + randomUUID().replaceAll("-", "");
    const pool = createPostgresPool();
    try {
      await runMigrations(pool, { schema, createSchema: true });
      await artifactRoomAccessScenarios(
        new PostgresArtifactStore(pool, schema),
      );
    } finally {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  },
);
