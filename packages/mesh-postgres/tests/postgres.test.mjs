import assert from "node:assert/strict";
import test from "node:test";
import { signMeshEnvelope } from "@agentplat/mesh-crypto";
import {
  MESH_DURABILITY_SCHEMA_VERSION,
  MESH_DURABLE_ENVELOPE_FORMAT,
  MESH_DURABLE_JOURNAL_VERSION,
  verifyMeshDurableJournal,
} from "@agentplat/mesh/durability";
import {
  MESH_PROTOCOL,
  MESH_SIGNATURE_ALGORITHM,
  MESH_WIRE_VERSION,
} from "@agentplat/mesh-protocol";
import {
  PostgresMeshDurableRepository,
  createPostgresPool,
  getCompatibilityStatus,
  getMigrationStatus,
  rollbackConfirmation,
  rollbackMigrations,
  runMigrations,
} from "../dist/index.js";

const enabled = process.env.AGENTPLAT_POSTGRES_TEST === "1";
const schema =
  process.env.AGENTPLAT_POSTGRES_TEST_SCHEMA ?? "agentplat_mesh_test";
const scope = {
  tenantId: "tenant-a",
  meshId: "mesh-a",
  peerId: "peer-b",
  instanceId: "instance-b",
};

async function signedPing({
  messageId,
  senderPeerId,
  senderInstanceId,
  audiencePeerId,
  keyId,
  privateKey,
  sequence = 1,
}) {
  return signMeshEnvelope({
    envelope: {
      protocol: MESH_PROTOCOL,
      wireVersion: MESH_WIRE_VERSION,
      messageId,
      tenantId: "tenant-a",
      meshId: "mesh-a",
      type: "peer.ping",
      sender: { peerId: senderPeerId, instanceId: senderInstanceId },
      audience: { kind: "peer", peerId: audiencePeerId },
      sequence,
      sentAt: "2026-08-01T00:00:00Z",
      expiresAt: "2026-08-01T00:00:30Z",
      payload: { type: "peer.ping" },
      proof: { algorithm: MESH_SIGNATURE_ALGORITHM, keyId },
    },
    privateKey,
  });
}

test(
  "commits inbox, snapshot, journal and outbox atomically with fenced claims",
  {
    skip: enabled
      ? false
      : "set AGENTPLAT_POSTGRES_TEST=1 for PostgreSQL integration tests",
  },
  async () => {
    const pool = createPostgresPool({ options: "-c search_path=pg_catalog" });
    const senderKeys = await crypto.subtle.generateKey(
      MESH_SIGNATURE_ALGORITHM,
      true,
      ["sign", "verify"],
    );
    const receiverKeys = await crypto.subtle.generateKey(
      MESH_SIGNATURE_ALGORITHM,
      true,
      ["sign", "verify"],
    );
    const inbound = await signedPing({
      messageId: "IIIIIIIIIIIIIIIIIIIIIA",
      senderPeerId: "peer-a",
      senderInstanceId: "instance-a",
      audiencePeerId: "peer-b",
      keyId: "key-a",
      privateKey: senderKeys.privateKey,
    });
    const outbound = await signedPing({
      messageId: "OOOOOOOOOOOOOOOOOOOOOA",
      senderPeerId: "peer-b",
      senderInstanceId: "instance-b",
      audiencePeerId: "peer-a",
      keyId: "key-b",
      privateKey: receiverKeys.privateKey,
    });

    try {
      await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      const migrated = await runMigrations(pool, {
        schema,
        createSchema: true,
      });
      assert.equal(migrated.currentVersion, 2);
      assert.deepEqual(await getCompatibilityStatus(pool, { schema }), {
        legacyInboxRows: 0,
        legacyOutboxRows: 0,
        legacySnapshotRows: 0,
        betaRowsMissingCanonicalBytes: 0,
      });
      const repository = new PostgresMeshDurableRepository(pool, {
        schema,
        maximumPendingInboxRowsPerScope: 8,
      });

      const concurrentScope = {
        ...scope,
        peerId: "peer-c",
        instanceId: "instance-c",
      };
      const concurrentEnvelopes = await Promise.all([
        signedPing({
          messageId: "CCCCCCCCCCCCCCCCCCCCCA",
          senderPeerId: "peer-a",
          senderInstanceId: "instance-a",
          audiencePeerId: "peer-c",
          keyId: "key-a",
          privateKey: senderKeys.privateKey,
          sequence: 1,
        }),
        signedPing({
          messageId: "DDDDDDDDDDDDDDDDDDDDDA",
          senderPeerId: "peer-a",
          senderInstanceId: "instance-a",
          audiencePeerId: "peer-c",
          keyId: "key-a",
          privateKey: senderKeys.privateKey,
          sequence: 2,
        }),
      ]);
      for (const envelope of concurrentEnvelopes) {
        assert.equal(
          (await repository.receive({ scope: concurrentScope, envelope }))
            .accepted,
          true,
        );
      }
      const concurrentClaims = await repository.claimInbox({
        scope: concurrentScope,
        workerId: "worker-concurrent",
        limit: 2,
        leaseDurationMs: 30_000,
      });
      const concurrentResults = await Promise.all(
        concurrentClaims.map((claimed, index) =>
          repository.commitInboxTransition({
            inbox: claimed,
            expectedSnapshotRevision: 0,
            transitionId: `concurrent-${index + 1}`,
            outcome: "applied",
            nextState: { winner: index + 1 },
            journal: [],
            outbox: [],
          }),
        ),
      );
      assert.equal(
        concurrentResults.filter((result) => result.committed).length,
        1,
      );
      assert.deepEqual(
        concurrentResults
          .filter((result) => !result.committed)
          .map((result) => result.code),
        ["revision_conflict"],
      );
      assert.equal(
        (await repository.loadSnapshot(concurrentScope)).revision,
        1,
      );

      const first = await repository.receive({ scope, envelope: inbound });
      const duplicate = await repository.receive({ scope, envelope: inbound });
      assert.equal(first.accepted, true);
      assert.equal(duplicate.accepted, true);
      assert.equal(duplicate.duplicate, true);

      const conflicting = await signedPing({
        messageId: inbound.messageId,
        senderPeerId: "peer-a",
        senderInstanceId: "instance-a",
        audiencePeerId: "peer-b",
        keyId: "key-a",
        privateKey: senderKeys.privateKey,
        sequence: 2,
      });
      assert.deepEqual(
        await repository.receive({ scope, envelope: conflicting }),
        { accepted: false, code: "message_conflict" },
      );

      const restartedPool = createPostgresPool({
        options: "-c search_path=pg_catalog",
      });
      const restartedRepository = new PostgresMeshDurableRepository(
        restartedPool,
        { schema, maximumPendingInboxRowsPerScope: 8 },
      );
      const [stale] = await restartedRepository.claimInbox({
        scope,
        workerId: "worker-stale",
        limit: 1,
        leaseDurationMs: 30_000,
      });
      await restartedPool.end();
      await pool.query(
        `UPDATE ${schema}.mesh_inbox
            SET claim_expires_at = transaction_timestamp() - interval '1 second'
          WHERE message_id = $1`,
        [inbound.messageId],
      );
      const [current] = await repository.claimInbox({
        scope,
        workerId: "worker-current",
        limit: 1,
        leaseDurationMs: 30_000,
      });
      assert.equal(current.schemaVersion, MESH_DURABILITY_SCHEMA_VERSION);
      assert.equal(current.envelopeFormat, MESH_DURABLE_ENVELOPE_FORMAT);
      assert.equal(current.envelopeWireVersion, MESH_WIRE_VERSION);
      assert.equal(typeof current.envelopeBytes, "string");
      assert.equal(current.claim.generation, stale.claim.generation + 1);
      assert.deepEqual(
        await repository.commitInboxTransition({
          inbox: stale,
          expectedSnapshotRevision: 0,
          transitionId: "transition-stale",
          outcome: "applied",
          nextState: { applied: false },
          journal: [],
          outbox: [],
        }),
        { committed: false, code: "claim_lost" },
      );

      const committed = await repository.commitInboxTransition({
        inbox: current,
        expectedSnapshotRevision: 0,
        transitionId: "transition-1",
        outcome: "applied",
        nextState: { applied: true, sequence: 1 },
        journal: [{ entryId: "journal-1", kind: "inbox.applied" }],
        outbox: [{ effectId: "effect-1", envelope: outbound }],
      });
      assert.equal(committed.committed, true);
      assert.equal(committed.snapshot.revision, 1);
      assert.equal(committed.snapshot.snapshotFormat, "application/json");
      assert.equal(committed.snapshot.snapshotSchemaVersion, 0);
      assert.equal(committed.outbox.length, 1);
      assert.equal(typeof committed.outbox[0].envelopeBytes, "string");
      assert.equal(
        committed.journal[0].journalVersion,
        MESH_DURABLE_JOURNAL_VERSION,
      );
      assert.equal(
        await verifyMeshDurableJournal({ entries: committed.journal }),
        true,
      );
      assert.deepEqual((await repository.loadSnapshot(scope)).state, {
        applied: true,
        sequence: 1,
      });

      const secondInbound = await signedPing({
        messageId: "SSSSSSSSSSSSSSSSSSSSSA",
        senderPeerId: "peer-a",
        senderInstanceId: "instance-a",
        audiencePeerId: "peer-b",
        keyId: "key-a",
        privateKey: senderKeys.privateKey,
        sequence: 3,
      });
      assert.equal(
        (await repository.receive({ scope, envelope: secondInbound })).accepted,
        true,
      );
      const [conflictingClaim] = await repository.claimInbox({
        scope,
        workerId: "worker-conflict",
        limit: 1,
        leaseDurationMs: 30_000,
      });
      assert.deepEqual(
        await repository.commitInboxTransition({
          inbox: conflictingClaim,
          expectedSnapshotRevision: 1,
          transitionId: "transition-conflict",
          outcome: "applied",
          nextState: { applied: true, sequence: 2 },
          journal: [{ entryId: "journal-conflict", kind: "inbox.applied" }],
          outbox: [{ effectId: "effect-1", envelope: outbound }],
        }),
        { committed: false, code: "outbox_conflict" },
      );
      assert.equal((await repository.loadSnapshot(scope)).revision, 1);
      assert.equal(
        (await repository.inspectJournal({ scope, limit: 10 })).length,
        1,
      );
      assert.equal(
        await repository.abandonInbox({
          inbox: conflictingClaim,
          retryAfterMs: 1_000,
          reasonCode: "outbox_conflict",
        }),
        true,
      );

      const remoteScope = {
        tenantId: "tenant-a",
        meshId: "mesh-a",
        peerId: "peer-a",
        instanceId: "instance-a",
      };
      const [ambiguousDelivery] = await repository.claimOutbox({
        scope,
        workerId: "worker-delivery-stale",
        limit: 1,
        leaseDurationMs: 30_000,
      });
      const remoteFirst = await repository.receive({
        scope: remoteScope,
        envelope: ambiguousDelivery.envelope,
      });
      assert.equal(remoteFirst.accepted, true);
      assert.equal(remoteFirst.duplicate, false);
      await pool.query(
        `UPDATE ${schema}.mesh_outbox
            SET claim_expires_at = transaction_timestamp() - interval '1 second'
          WHERE effect_id = $1`,
        [ambiguousDelivery.effectId],
      );
      const [retriedDelivery] = await repository.claimOutbox({
        scope,
        workerId: "worker-delivery-current",
        limit: 1,
        leaseDurationMs: 30_000,
      });
      assert.deepEqual(retriedDelivery.envelope, ambiguousDelivery.envelope);
      assert.equal(
        retriedDelivery.envelopeBytes,
        ambiguousDelivery.envelopeBytes,
      );
      const remoteDuplicate = await repository.receive({
        scope: remoteScope,
        envelope: retriedDelivery.envelope,
      });
      assert.equal(remoteDuplicate.accepted, true);
      assert.equal(remoteDuplicate.duplicate, true);
      assert.equal(
        await repository.settleOutbox({
          outbox: ambiguousDelivery,
          settlement: { disposition: "delivered" },
        }),
        false,
      );
      assert.equal(
        await repository.settleOutbox({
          outbox: retriedDelivery,
          settlement: { disposition: "delivered" },
        }),
        true,
      );
      assert.deepEqual(
        await repository.claimOutbox({
          scope,
          workerId: "worker-delivery-final",
          limit: 1,
          leaseDurationMs: 30_000,
        }),
        [],
      );

      const journal = await repository.inspectJournal({ scope, limit: 10 });
      assert.equal(await verifyMeshDurableJournal({ entries: journal }), true);
      await pool.query(
        `ALTER TABLE ${schema}.mesh_journal
           DROP CONSTRAINT mesh_journal_compatibility_metadata_check`,
      );
      try {
        await pool.query(
          `UPDATE ${schema}.mesh_journal SET journal_version = 2
            WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
              AND instance_id = $4`,
          [scope.tenantId, scope.meshId, scope.peerId, scope.instanceId],
        );
        await assert.rejects(
          () => repository.inspectJournal({ scope, limit: 10 }),
          /journal version is invalid/u,
        );
      } finally {
        await pool.query(
          `UPDATE ${schema}.mesh_journal SET journal_version = 1
            WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
              AND instance_id = $4`,
          [scope.tenantId, scope.meshId, scope.peerId, scope.instanceId],
        );
        await pool.query(
          `ALTER TABLE ${schema}.mesh_journal
             ADD CONSTRAINT mesh_journal_compatibility_metadata_check CHECK (
               wrapper_schema_version IN (1, 2) AND journal_version = 1
             )`,
        );
      }
      repository.close();
      assert.equal((await pool.query("SELECT 1 AS ok")).rows[0].ok, 1);

      const status = await getMigrationStatus(pool, { schema });
      assert.equal(status.currentVersion, 2);
      const rolledBack = await rollbackMigrations(pool, {
        schema,
        expectedCurrentVersion: 2,
        confirm: rollbackConfirmation(schema),
        allowDataLoss: true,
        verifiedBackup: true,
        allowIncompatibleRows: true,
      });
      assert.equal(rolledBack.currentVersion, 1);
    } finally {
      await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await pool.end();
    }
  },
);
