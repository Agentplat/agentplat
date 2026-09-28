import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { AgentDefinitionRegistry } from "@agentplat/rooms";
import {
  createPostgresPool,
  PostgresAgentDefinitionRegistryStore,
  PostgresAgentGovernanceStoreV1,
  PostgresAttentionSignalStoreV1,
  runMigrations,
  rollbackMigrations,
  rollbackConfirmation,
} from "../dist/index.js";
import { attentionSignalScenarios } from "../../../tests/helpers/attention-signal-scenarios.mjs";

test(
  "PostgreSQL attention signals persist bounded stream/outbox state, fences and immutable catalog",
  { skip: process.env.AGENTPLAT_POSTGRES_TEST !== "1" },
  async () => {
    const schema = `attention_${randomUUID().replaceAll("-", "")}`;
    let pool = createPostgresPool({ options: "-c search_path=pg_catalog" });
    try {
      assert.equal(
        (await runMigrations(pool, { schema, createSchema: true }))
          .currentVersion,
        18,
      );
      const result = await attentionSignalScenarios({
        store: new PostgresAttentionSignalStoreV1(pool, { schema }),
        governance: new PostgresAgentGovernanceStoreV1(pool, { schema }),
        definitions: new AgentDefinitionRegistry(
          new PostgresAgentDefinitionRegistryStore(pool, { schema }),
        ),
      });
      await pool.end();
      pool = createPostgresPool({ options: "-c search_path=pg_catalog" });
      const reopened = new PostgresAttentionSignalStoreV1(pool, { schema });
      assert.deepEqual(
        await reopened.load("t", "agent", result.signal.recordId),
        result.state,
      );
      assert.deepEqual(
        await reopened.catalog("t", "agent", result.reference.recordId),
        result.reference,
      );
      await assert.rejects(
        pool.query(
          `UPDATE "${schema}".attention_signal_catalog SET record=record`,
        ),
        /immutable/,
      );
      await assert.rejects(
        pool.query(`DELETE FROM "${schema}".attention_signal_catalog`),
        /immutable/,
      );
      const gov = await new PostgresAgentGovernanceStoreV1(pool, {
        schema,
      }).load("t", "agent");
      const binding = {
        governanceId: gov.governanceId,
        revision: gov.revision,
        authorityEpoch: gov.authorityEpoch,
        configurationDigest: gov.configurationDigest,
        definitionRevisionId: gov.configuration.definitionRevisionId,
      };
      // Competing writers cannot both advance the bounded queue/budget state.
      const next = { ...result.state, revision: result.state.revision + 1 };
      const raced = await Promise.all([
        reopened.commit(next, result.state.revision, binding),
        new PostgresAttentionSignalStoreV1(pool, { schema }).commit(
          next,
          result.state.revision,
          binding,
        ),
      ]);
      assert.deepEqual(raced.sort(), [false, true]);
      assert.equal(
        (await reopened.load("t", "agent", result.signal.recordId)).revision,
        next.revision,
      );
      await rollbackMigrations(pool, {
        schema,
        expectedCurrentVersion: 18,
        confirm: rollbackConfirmation(schema, 18),
        allowDataLoss: true,
      });
      await rollbackMigrations(pool, {
        schema,
        expectedCurrentVersion: 17,
        confirm: rollbackConfirmation(schema, 17),
        allowDataLoss: true,
      });
      await rollbackMigrations(pool, {
        schema,
        expectedCurrentVersion: 16,
        confirm: rollbackConfirmation(schema, 16),
        allowDataLoss: true,
      });
      await assert.rejects(
        rollbackMigrations(pool, {
          schema,
          expectedCurrentVersion: 15,
          confirm: "wrong",
          allowDataLoss: true,
        }),
      );
      assert.equal(
        (
          await rollbackMigrations(pool, {
            schema,
            expectedCurrentVersion: 15,
            confirm: rollbackConfirmation(schema, 15),
            allowDataLoss: true,
          })
        ).currentVersion,
        14,
      );
      assert.equal((await runMigrations(pool, { schema })).currentVersion, 18);
    } finally {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  },
);
