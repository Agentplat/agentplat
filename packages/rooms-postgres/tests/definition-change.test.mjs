import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { RoomService, AgentDefinitionRegistry } from "@agentplat/rooms";
import {
  createPostgresPool,
  runMigrations,
  PostgresRoomRepository,
  PostgresAgentDefinitionRegistryStore,
  PostgresAgentGovernanceStoreV1,
} from "../dist/index.js";
import { definitionChangeFixture } from "../../../tests/helpers/definition-change-fixture.mjs";
test(
  "reviewed definition changes retain exact approval/evaluation audit in PostgreSQL after reopen",
  { skip: process.env.AGENTPLAT_POSTGRES_TEST !== "1" },
  async () => {
    const schema = "definition_review_" + randomUUID().replaceAll("-", "");
    let pool = createPostgresPool();
    try {
      await runMigrations(pool, { schema, createSchema: true });
      const f = await definitionChangeFixture({
        rooms: new RoomService({
          repository: new PostgresRoomRepository(pool, { schema }),
        }),
        definitions: new AgentDefinitionRegistry(
          new PostgresAgentDefinitionRegistryStore(pool, { schema }),
        ),
        governanceStore: new PostgresAgentGovernanceStoreV1(pool, { schema }),
      });
      const proposal = await f.proposal(...f.revisions, 0, "select");
      await proposal.approve();
      const selected = await f.service.apply("owner", proposal.request);
      const history = await f.governance.history("owner", "a");
      assert.equal(
        history.at(-1).review.approvalId,
        proposal.request.approvalId,
      );
      await pool.end();
      pool = createPostgresPool();
      const store = new PostgresAgentGovernanceStoreV1(pool, { schema });
      assert.deepEqual(await store.history("t", "a", -1, 100), history);
      assert.deepEqual(await store.load("t", "a"), selected);
    } finally {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  },
);
