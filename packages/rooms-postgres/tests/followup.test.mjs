import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createPostgresPool,
  PostgresRoomSituationStoreV1,
  PostgresMemoryProposalStoreV1,
  PostgresMemoryRevisionStoreV1,
  runRoomFollowupMigrations,
  runMemoryRevisionMigrations,
  getRoomFollowupMigrationStatus,
  rollbackRoomFollowupMigrations,
  roomFollowupRollbackConfirmation,
} from "../dist/index.js";
import { roomFollowupScenarios } from "../../../tests/helpers/room-followup-scenarios.mjs";
import { followupFixture } from "../../../tests/helpers/room-followup-scenarios.mjs";
import {
  evidenceFixture,
  scope,
} from "../../../tests/helpers/incremental-evidence-scenarios.mjs";
import {
  PostgresIncrementalEvidenceStoreV1,
  runIncrementalEvidenceMigrations,
} from "../dist/index.js";
const enabled = process.env.AGENTPLAT_POSTGRES_TEST === "1";
test(
  "situations and durable learning contract on PostgreSQL",
  { skip: !enabled },
  async (t) =>
    roomFollowupScenarios(t, async () => {
      const schema = `followup_${randomUUID().replaceAll("-", "")}`,
        pool = createPostgresPool();
      await runRoomFollowupMigrations(pool, { schema, createSchema: true });
      await runMemoryRevisionMigrations(pool, { schema });
      return {
        situations: new PostgresRoomSituationStoreV1(pool, { schema }),
        proposals: new PostgresMemoryProposalStoreV1(pool, { schema }),
        memory: new PostgresMemoryRevisionStoreV1(pool, { schema }),
        dispose: async () => {
          await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
          await pool.end();
        },
      };
    }),
);
test(
  "follow-up migration ledger is independent of the memory ledger",
  { skip: !enabled },
  async () => {
    const schema = `followup_migrate_${randomUUID().replaceAll("-", "")}`,
      pool = createPostgresPool();
    try {
      assert.equal(
        (await runRoomFollowupMigrations(pool, { schema, createSchema: true }))
          .currentVersion,
        1,
      );
      await runMemoryRevisionMigrations(pool, { schema });
      assert.deepEqual(
        (await getRoomFollowupMigrationStatus(pool, { schema }))
          .pendingVersions,
        [],
      );
      await assert.rejects(
        rollbackRoomFollowupMigrations(pool, {
          schema,
          expectedCurrentVersion: 1,
          confirm: "wrong",
          allowDataLoss: true,
        }),
      );
      assert.equal(
        (
          await rollbackRoomFollowupMigrations(pool, {
            schema,
            expectedCurrentVersion: 1,
            confirm: roomFollowupRollbackConfirmation(schema),
            allowDataLoss: true,
          })
        ).currentVersion,
        0,
      );
      assert.ok(
        (
          await pool.query(`SELECT to_regclass($1) AS present`, [
            `${schema}.memory_revision_heads`,
          ])
        ).rows[0].present,
      );
      assert.equal(
        (await runRoomFollowupMigrations(pool, { schema })).currentVersion,
        1,
      );
    } finally {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  },
);
test(
  "a stored analysis, partial situation projection and accepted memory recover on new database pools",
  { skip: !enabled },
  async () => {
    const schema = `followup_reopen_${randomUUID().replaceAll("-", "")}`;
    let pool = createPostgresPool();
    const followup = () =>
      followupFixture({
        situations: new PostgresRoomSituationStoreV1(pool, { schema }),
        proposals: new PostgresMemoryProposalStoreV1(pool, { schema }),
        memory: new PostgresMemoryRevisionStoreV1(pool, { schema }),
      });
    try {
      await runRoomFollowupMigrations(pool, { schema, createSchema: true });
      await runMemoryRevisionMigrations(pool, { schema });
      await runIncrementalEvidenceMigrations(pool, { schema });
      const processing = evidenceFixture(
          new PostgresIncrementalEvidenceStoreV1(pool, { schema }),
        ),
        f = followup();
      await processing.service.receiveBatch(
        processing.collector,
        processing.batch("integrated"),
      );
      const claim = await processing.service.claim(processing.worker, {
        ...scope,
        workerId: "worker-1",
      });
      await processing.service.complete(
        processing.worker,
        claim,
        { summary: "Verified source facts" },
        "analysis:integrated",
      );
      const project =
        (fixture) =>
        async ({ operationId, result, resultReference }) =>
          fixture.situations.apply(
            fixture.agent,
            fixture.apply("integrated", {
              operationId,
              content: fixture.content({ summary: result.summary }),
              cause: {
                kind: "evidence",
                explanation: "Source-backed analysis",
                references: [resultReference],
              },
            }),
          );
      await assert.rejects(
        processing.service.project(
          processing.worker,
          processing.key("integrated"),
          async (input) => {
            await project(f)(input);
            throw Error("Crash before projection acknowledgement");
          },
        ),
      );
      const proposal = f.proposal("approved");
      await f.proposals.propose(f.agent, proposal);
      await f.proposals.accept(f.owner, f.decide(proposal.id));
      await pool.end();
      pool = createPostgresPool();
      const nextProcessing = evidenceFixture(
          new PostgresIncrementalEvidenceStoreV1(pool, { schema }),
        ),
        next = followup();
      assert.equal(
        (
          await nextProcessing.service.pendingProjections(
            nextProcessing.worker,
            scope,
          )
        ).length,
        1,
      );
      await nextProcessing.service.project(
        nextProcessing.worker,
        nextProcessing.key("integrated"),
        project(next),
      );
      assert.equal(
        (await next.situations.history(next.owner, "integrated")).length,
        1,
      );
      assert.equal(
        (await next.proposals.read(next.owner, proposal.id)).status,
        "accepted",
      );
      assert.equal(
        (await next.memory.read(next.owner, proposal.memoryId)).revision,
        1,
      );
      assert.equal(
        await nextProcessing.service.claim(nextProcessing.worker, {
          ...scope,
          workerId: "worker-2",
        }),
        undefined,
      );
    } finally {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  },
);
