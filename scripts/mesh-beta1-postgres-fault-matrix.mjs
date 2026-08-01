import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import { createWebCryptoMeshEnvelopeSigner } from "@agentplat/mesh-crypto";
import {
  computeMeshDurableValueDigest,
  verifyMeshDurableJournal,
} from "@agentplat/mesh/durability";
import {
  PostgresMeshDurableRepository,
  backfillLegacySnapshots,
  createPostgresPool,
  getCompatibilityStatus,
  getMigrationStatus,
  getRollbackReadiness,
  rollbackConfirmation,
  rollbackMigrations,
  runMigrations,
} from "@agentplat/mesh-postgres";
import {
  MESH_PREVIOUS_WIRE_VERSION,
  MESH_PROTOCOL,
  MESH_SIGNATURE_ALGORITHM,
  MESH_WIRE_VERSION,
} from "@agentplat/mesh-protocol";

const argumentsByName = parseArguments(process.argv.slice(2));
const output = argumentsByName.get("--output");
const candidateCommit = argumentsByName.get("--candidate-commit") ?? null;
const schema = `mesh_fault_matrix_${randomBytes(8).toString("hex")}`;
const legacySchema = `mesh_fault_legacy_${randomBytes(8).toString("hex")}`;
const pools = [createPostgresPool({ max: 4 }), createPostgresPool({ max: 4 })];
const closedPools = new Set();
const scope = Object.freeze({
  tenantId: "tenant-fault-matrix",
  meshId: "mesh-fault-matrix",
  peerId: "peer-b",
  instanceId: "peer-b-instance",
});
const remoteScope = Object.freeze({
  ...scope,
  peerId: "peer-a",
  instanceId: "peer-a-instance",
});
const cells = [];

try {
  const concurrent = await Promise.all(
    pools.map((pool) => runMigrations(pool, { schema, createSchema: true })),
  );
  assert.deepEqual(
    concurrent.map(({ currentVersion }) => currentVersion),
    [2, 2],
  );
  cells.push(cell("migration_contention", "passed"));

  const migrationCrashWindows = await verifyMigrationCrashWindows(pools[1]);
  for (let index = 0; index < migrationCrashWindows; index += 1) {
    cells.push(
      cell(
        `migration_statement_crash_${String(index + 1).padStart(2, "0")}`,
        "passed",
      ),
    );
  }

  const keys = await crypto.subtle.generateKey(MESH_SIGNATURE_ALGORITHM, true, [
    "sign",
    "verify",
  ]);
  const inbound = await signedPing({
    id: "AAAAAAAAAAAAAAAAAAAAAQ",
    sequence: 1,
    senderPeerId: "peer-a",
    senderInstanceId: remoteScope.instanceId,
    audiencePeerId: scope.peerId,
    privateKey: keys.privateKey,
  });
  const outbound = await signedPing({
    id: "BBBBBBBBBBBBBBBBBBBBBA",
    sequence: 2,
    senderPeerId: scope.peerId,
    senderInstanceId: scope.instanceId,
    audiencePeerId: remoteScope.peerId,
    privateKey: keys.privateKey,
  });

  const transitionCrashWindows = await verifyTransitionCrashWindows(
    pools[1],
    keys.privateKey,
  );
  for (const window of transitionCrashWindows) {
    cells.push(cell(`transaction_crash_${window}`, "passed"));
  }

  const migrationOne = (
    await readFile(
      new URL(
        "../packages/mesh-postgres/migrations/001_mesh_durability.up.sql",
        import.meta.url,
      ),
      "utf8",
    )
  ).replaceAll("__AGENTPLAT_SCHEMA__", `"${legacySchema}"`);
  await pools[1].query(`CREATE SCHEMA "${legacySchema}"`);
  await pools[1].query(migrationOne);
  const legacyState = { schemaVersion: 1, count: 1 };
  const legacyEnvelope = await signedPing({
    id: "CCCCCCCCCCCCCCCCCCCCCA",
    sequence: 3,
    wireVersion: MESH_PREVIOUS_WIRE_VERSION,
    senderPeerId: "peer-a",
    senderInstanceId: remoteScope.instanceId,
    audiencePeerId: scope.peerId,
    privateKey: keys.privateKey,
  });
  await pools[1].query(
    `INSERT INTO "${legacySchema}".mesh_peer_snapshots
       (tenant_id, mesh_id, peer_id, instance_id, revision, state, state_digest)
     VALUES ($1, $2, $3, $4, 1, $5::jsonb, $6)`,
    [
      scope.tenantId,
      scope.meshId,
      scope.peerId,
      scope.instanceId,
      JSON.stringify(legacyState),
      await computeMeshDurableValueDigest(legacyState),
    ],
  );
  await pools[1].query(
    `INSERT INTO "${legacySchema}".mesh_inbox
       (tenant_id, mesh_id, peer_id, instance_id, message_id, envelope, envelope_digest)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [
      scope.tenantId,
      scope.meshId,
      scope.peerId,
      scope.instanceId,
      legacyEnvelope.messageId,
      JSON.stringify(legacyEnvelope),
      await computeMeshDurableValueDigest(legacyEnvelope),
    ],
  );
  const preMigrationRepository = new PostgresMeshDurableRepository(pools[1], {
    schema: legacySchema,
  });
  const preMigrationSnapshot = await preMigrationRepository.loadSnapshot(scope);
  assert.equal(preMigrationSnapshot.schemaVersion, 1);
  assert.equal(preMigrationSnapshot.snapshotFormat, undefined);
  assert.equal(preMigrationSnapshot.snapshotSchemaVersion, undefined);
  assert.equal(
    (await runMigrations(pools[1], { schema: legacySchema })).currentVersion,
    2,
  );
  assert.deepEqual(
    await getCompatibilityStatus(pools[1], { schema: legacySchema }),
    {
      legacyInboxRows: 1,
      legacyOutboxRows: 0,
      legacySnapshotRows: 1,
      betaRowsMissingCanonicalBytes: 0,
    },
  );
  const adoptedSnapshot = await preMigrationRepository.loadSnapshot(scope);
  assert.equal(adoptedSnapshot.schemaVersion, 1);
  assert.equal(
    adoptedSnapshot.snapshotFormat,
    "application/json; profile=legacy-opaque",
  );
  assert.equal(adoptedSnapshot.snapshotSchemaVersion, 0);
  const backfill = await backfillLegacySnapshots(pools[1], {
    schema: legacySchema,
    batchSize: 1,
    target: {
      format: "application/vnd.agentplat.fault-state+json",
      schemaVersion: 2,
    },
    migrate({ state }) {
      return { ...state, schemaVersion: 2 };
    },
  });
  assert.deepEqual(backfill, {
    selected: 1,
    migrated: 1,
    remainingLegacyRows: 0,
    complete: true,
  });
  const legacyRepository = new PostgresMeshDurableRepository(pools[1], {
    schema: legacySchema,
  });
  const [legacyClaim] = await legacyRepository.claimInbox({
    scope,
    workerId: "legacy-reader",
    limit: 1,
    leaseDurationMs: 30_000,
  });
  assert.equal(legacyClaim.envelope.wireVersion, MESH_PREVIOUS_WIRE_VERSION);
  assert.equal(legacyClaim.envelopeWireVersion, undefined);
  assert.equal(legacyClaim.schemaVersion, 1);
  assert.equal(
    await legacyRepository.abandonInbox({
      inbox: legacyClaim,
      retryAfterMs: 1,
      reasonCode: "compatibility_probe",
    }),
    true,
  );
  assert.deepEqual(
    await getRollbackReadiness(pools[1], { schema: legacySchema }),
    {
      incompatibleInboxRows: 0,
      incompatibleOutboxRows: 0,
      incompatibleSnapshotRows: 1,
      incompatibleJournalRows: 0,
      incompatibleRows: 1,
      readyForAlphaReader: false,
    },
  );
  cells.push(cell("alpha5_schema_adoption_and_typed_backfill", "passed"));

  const firstRepository = new PostgresMeshDurableRepository(pools[0], {
    schema,
  });
  const firstReceipt = await firstRepository.receive({
    scope,
    envelope: inbound,
  });
  assert.equal(firstReceipt.accepted, true);
  assert.equal(firstReceipt.duplicate, false);
  assert.equal(typeof firstReceipt.receivedAt, "string");
  assert.match(firstReceipt.envelopeDigest, /^sha256:/u);
  await pools[0].end();
  closedPools.add(pools[0]);
  cells.push(cell("database_connection_restart_after_receipt", "passed"));

  const activePool = pools[1];
  const repository = new PostgresMeshDurableRepository(activePool, { schema });
  const [stale] = await repository.claimInbox({
    scope,
    workerId: "fault-stale",
    limit: 1,
    leaseDurationMs: 30_000,
  });
  assert.ok(stale);
  await activePool.query(
    `UPDATE "${schema}".mesh_inbox
        SET claim_expires_at = transaction_timestamp() - interval '1 second'
      WHERE message_id = $1`,
    [inbound.messageId],
  );
  const recoveredPool = createPostgresPool({ max: 4 });
  pools.push(recoveredPool);
  const recoveredRepository = new PostgresMeshDurableRepository(recoveredPool, {
    schema,
  });
  const [current] = await recoveredRepository.claimInbox({
    scope,
    workerId: "fault-current",
    limit: 1,
    leaseDurationMs: 30_000,
  });
  assert.ok(current);
  assert.equal(current.claim.generation, stale.claim.generation + 1);
  assert.deepEqual(
    await repository.commitInboxTransition({
      inbox: stale,
      expectedSnapshotRevision: 0,
      transitionId: "fault-stale-transition",
      outcome: "applied",
      nextState: { applied: "stale" },
      journal: [],
      outbox: [],
    }),
    { committed: false, code: "claim_lost" },
  );
  cells.push(cell("stale_inbox_claim_fenced", "passed"));

  const committed = await recoveredRepository.commitInboxTransition({
    inbox: current,
    expectedSnapshotRevision: 0,
    transitionId: "fault-current-transition",
    outcome: "applied",
    nextState: { applied: "current" },
    journal: [{ entryId: "fault-journal", kind: "inbox.applied" }],
    outbox: [{ effectId: "fault-outbox", envelope: outbound }],
  });
  assert.equal(committed.committed, true);
  assert.equal(committed.snapshot.revision, 1);
  assert.equal(committed.journal.length, 1);
  assert.equal(committed.outbox.length, 1);
  cells.push(cell("atomic_snapshot_journal_outbox", "passed"));

  const [ambiguous] = await recoveredRepository.claimOutbox({
    scope,
    workerId: "fault-outbox-stale",
    limit: 1,
    leaseDurationMs: 30_000,
  });
  assert.ok(ambiguous);
  const remoteFirst = await repository.receive({
    scope: remoteScope,
    envelope: ambiguous.envelope,
  });
  assert.equal(remoteFirst.accepted, true);
  assert.equal(remoteFirst.duplicate, false);
  await activePool.query(
    `UPDATE "${schema}".mesh_outbox
        SET claim_expires_at = transaction_timestamp() - interval '1 second'
      WHERE effect_id = $1`,
    [ambiguous.effectId],
  );
  const [retried] = await repository.claimOutbox({
    scope,
    workerId: "fault-outbox-current",
    limit: 1,
    leaseDurationMs: 30_000,
  });
  assert.ok(retried);
  assert.equal(retried.envelopeBytes, ambiguous.envelopeBytes);
  assert.deepEqual(retried.envelope, ambiguous.envelope);
  const remoteDuplicate = await repository.receive({
    scope: remoteScope,
    envelope: retried.envelope,
  });
  assert.equal(remoteDuplicate.accepted, true);
  assert.equal(remoteDuplicate.duplicate, true);
  assert.equal(
    await recoveredRepository.settleOutbox({
      outbox: ambiguous,
      settlement: { disposition: "delivered" },
    }),
    false,
  );
  assert.equal(
    await repository.settleOutbox({
      outbox: retried,
      settlement: { disposition: "delivered" },
    }),
    true,
  );
  cells.push(cell("outbox_remote_commit_exact_retry", "passed"));
  cells.push(cell("stale_outbox_claim_fenced", "passed"));

  const journal = await repository.inspectJournal({ scope, limit: 16 });
  assert.equal(await verifyMeshDurableJournal({ entries: journal }), true);
  cells.push(cell("journal_chain_after_recovery", "passed"));

  assert.deepEqual(await getCompatibilityStatus(activePool, { schema }), {
    legacyInboxRows: 0,
    legacyOutboxRows: 0,
    legacySnapshotRows: 0,
    betaRowsMissingCanonicalBytes: 0,
  });
  assert.equal(
    (await getMigrationStatus(activePool, { schema })).currentVersion,
    2,
  );
  const readiness = await getRollbackReadiness(activePool, { schema });
  assert.equal(readiness.readyForAlphaReader, false);
  await assert.rejects(
    () =>
      rollbackMigrations(activePool, {
        schema,
        expectedCurrentVersion: 2,
        confirm: rollbackConfirmation(schema),
        allowDataLoss: true,
        verifiedBackup: true,
      }),
    /drained v1 rows or an explicit loss decision/u,
  );
  cells.push(cell("rollback_refuses_beta_only_rows", "passed"));

  const report = Object.freeze({
    schemaVersion: 1,
    releaseVersion: "0.3.0-beta.1",
    candidateCommit,
    status: "passed",
    database: Object.freeze({
      engine: "postgresql",
      version: String(
        (await activePool.query("SHOW server_version")).rows[0].server_version,
      ),
    }),
    cells: Object.freeze(cells),
    summary: Object.freeze({
      total: cells.length,
      passed: cells.length,
      failed: 0,
      migrationCrashWindows,
      transitionCrashWindows: transitionCrashWindows.length,
      staleFenceMutations: 0,
      lostAcceptedWork: 0,
      duplicateProtectedEffects: 0,
    }),
    cleanup: "verified-by-finally",
  });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (output === undefined) process.stdout.write(serialized);
  else await writeFile(output, serialized, { encoding: "utf8", mode: 0o644 });
} finally {
  const cleanupPool = pools.find((pool) => !closedPools.has(pool));
  if (cleanupPool && /^mesh_fault_matrix_[a-f0-9]{16}$/u.test(schema)) {
    await cleanupPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  }
  if (cleanupPool && /^mesh_fault_legacy_[a-f0-9]{16}$/u.test(legacySchema)) {
    await cleanupPool.query(`DROP SCHEMA IF EXISTS "${legacySchema}" CASCADE`);
  }
  await Promise.all(
    pools.map(async (pool) => {
      if (!closedPools.has(pool)) {
        await pool.end();
        closedPools.add(pool);
      }
    }),
  );
}

async function verifyMigrationCrashWindows(pool) {
  const windowSchema = `mesh_fault_migration_${randomBytes(8).toString("hex")}`;
  const migrationOne = (
    await readFile(
      new URL(
        "../packages/mesh-postgres/migrations/001_mesh_durability.up.sql",
        import.meta.url,
      ),
      "utf8",
    )
  ).replaceAll("__AGENTPLAT_SCHEMA__", `"${windowSchema}"`);
  const migrationTwo = (
    await readFile(
      new URL(
        "../packages/mesh-postgres/migrations/002_mesh_compatibility_metadata.up.sql",
        import.meta.url,
      ),
      "utf8",
    )
  ).replaceAll("__AGENTPLAT_SCHEMA__", `"${windowSchema}"`);
  const statements = migrationTwo
    .split(/;\s*(?:\n|$)/u)
    .map((statement) => statement.trim())
    .filter(Boolean);
  assert.ok(statements.length > 0);
  const state = { migrationWindow: true };
  const stateDigest = await computeMeshDurableValueDigest(state);
  try {
    await pool.query(`CREATE SCHEMA "${windowSchema}"`);
    await pool.query(migrationOne);
    await pool.query(
      `INSERT INTO "${windowSchema}".mesh_peer_snapshots
         (tenant_id, mesh_id, peer_id, instance_id, revision, state, state_digest)
       VALUES ($1, $2, $3, $4, 1, $5::jsonb, $6)`,
      [
        scope.tenantId,
        scope.meshId,
        scope.peerId,
        scope.instanceId,
        JSON.stringify(state),
        stateDigest,
      ],
    );
    for (
      let failureAfter = 0;
      failureAfter < statements.length;
      failureAfter += 1
    ) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (let index = 0; index <= failureAfter; index += 1) {
          await client.query(statements[index]);
        }
        throw new Error("injected migration interruption");
      } catch (error) {
        await client.query("ROLLBACK");
        assert.match(String(error), /injected migration interruption/u);
      } finally {
        client.release();
      }
      const metadata = await pool.query(
        `SELECT count(*)::integer AS count
           FROM information_schema.columns
          WHERE table_schema = $1
            AND column_name IN (
              'wrapper_schema_version', 'snapshot_format',
              'snapshot_schema_version', 'envelope_format',
              'envelope_wire_version', 'envelope_bytes', 'journal_version'
            )`,
        [windowSchema],
      );
      assert.equal(metadata.rows[0].count, 0);
      const retained = await pool.query(
        `SELECT state, state_digest
           FROM "${windowSchema}".mesh_peer_snapshots
          WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
            AND instance_id = $4`,
        [scope.tenantId, scope.meshId, scope.peerId, scope.instanceId],
      );
      assert.equal(retained.rows.length, 1);
      assert.deepEqual(retained.rows[0].state, state);
      assert.equal(retained.rows[0].state_digest, stateDigest);
    }
    return statements.length;
  } finally {
    if (/^mesh_fault_migration_[a-f0-9]{16}$/u.test(windowSchema)) {
      await pool.query(`DROP SCHEMA IF EXISTS "${windowSchema}" CASCADE`);
    }
  }
}

async function verifyTransitionCrashWindows(pool, privateKey) {
  const windowSchema = `mesh_fault_transition_${randomBytes(8).toString("hex")}`;
  const boundaries = Object.freeze([
    ["snapshot", "INSERT INTO public.mesh_peer_snapshots"],
    ["journal", "INSERT INTO public.mesh_journal"],
    ["outbox", "INSERT INTO public.mesh_outbox"],
    ["inbox_settlement", "UPDATE public.mesh_inbox SET status"],
  ]);
  try {
    await runMigrations(pool, { schema: windowSchema, createSchema: true });
    const repository = new PostgresMeshDurableRepository(pool, {
      schema: windowSchema,
    });
    for (let index = 0; index < boundaries.length; index += 1) {
      const [name, statementPrefix] = boundaries[index];
      const windowScope = Object.freeze({
        ...scope,
        peerId: `peer-window-${index + 1}`,
        instanceId: `peer-window-${index + 1}-instance`,
      });
      const inbound = await signedPing({
        id: deterministicMessageId(`transition-inbound-${index}`),
        sequence: index * 2 + 10,
        senderPeerId: "peer-remote",
        senderInstanceId: "peer-remote-instance",
        audiencePeerId: windowScope.peerId,
        privateKey,
      });
      const outbound = await signedPing({
        id: deterministicMessageId(`transition-outbound-${index}`),
        sequence: index * 2 + 11,
        senderPeerId: windowScope.peerId,
        senderInstanceId: windowScope.instanceId,
        audiencePeerId: "peer-remote",
        privateKey,
      });
      assert.equal(
        (await repository.receive({ scope: windowScope, envelope: inbound }))
          .accepted,
        true,
      );
      const [claimed] = await repository.claimInbox({
        scope: windowScope,
        workerId: `worker-window-${index + 1}`,
        limit: 1,
        leaseDurationMs: 30_000,
      });
      assert.ok(claimed);
      const injected = faultInjectingPool(pool, statementPrefix);
      const faultingRepository = new PostgresMeshDurableRepository(
        injected.pool,
        {
          schema: windowSchema,
        },
      );
      await assert.rejects(
        () =>
          faultingRepository.commitInboxTransition({
            inbox: claimed,
            expectedSnapshotRevision: 0,
            transitionId: `transition-window-${index + 1}`,
            outcome: "applied",
            nextState: { applied: true, window: name },
            journal: [
              {
                entryId: `journal-window-${index + 1}`,
                kind: "inbox.applied",
              },
            ],
            outbox: [
              { effectId: `effect-window-${index + 1}`, envelope: outbound },
            ],
          }),
        /injected transaction interruption/u,
      );
      assert.equal(injected.wasTriggered(), true);
      assert.equal(await repository.loadSnapshot(windowScope), undefined);
      assert.deepEqual(
        await repository.inspectJournal({ scope: windowScope, limit: 8 }),
        [],
      );
      assert.deepEqual(
        await repository.claimOutbox({
          scope: windowScope,
          workerId: `outbox-window-${index + 1}`,
          limit: 1,
          leaseDurationMs: 1_000,
        }),
        [],
      );
      const inboxState = await pool.query(
        `SELECT status, settled_at
           FROM "${windowSchema}".mesh_inbox
          WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
            AND instance_id = $4 AND message_id = $5`,
        [
          windowScope.tenantId,
          windowScope.meshId,
          windowScope.peerId,
          windowScope.instanceId,
          inbound.messageId,
        ],
      );
      assert.deepEqual(inboxState.rows, [
        { status: "processing", settled_at: null },
      ]);
      assert.equal(
        await repository.abandonInbox({
          inbox: claimed,
          retryAfterMs: 1,
          reasonCode: "fault_window_complete",
        }),
        true,
      );
    }
    return boundaries.map(([name]) => name);
  } finally {
    if (/^mesh_fault_transition_[a-f0-9]{16}$/u.test(windowSchema)) {
      await pool.query(`DROP SCHEMA IF EXISTS "${windowSchema}" CASCADE`);
    }
  }
}

function faultInjectingPool(pool, statementPrefix) {
  let triggered = false;
  return Object.freeze({
    pool: {
      query: pool.query.bind(pool),
      async connect() {
        const client = await pool.connect();
        return {
          async query(text, values) {
            const normalized =
              typeof text === "string"
                ? text
                    .replace(/"[A-Za-z_][A-Za-z0-9_]*"\./gu, "public.")
                    .replace(/\s+/gu, " ")
                    .trim()
                : "";
            if (!triggered && normalized.startsWith(statementPrefix)) {
              triggered = true;
              throw new Error("injected transaction interruption");
            }
            return client.query(text, values);
          },
          release: client.release.bind(client),
        };
      },
    },
    wasTriggered: () => triggered,
  });
}

function deterministicMessageId(label) {
  return createHash("sha256")
    .update(label)
    .digest()
    .subarray(0, 16)
    .toString("base64url");
}

async function signedPing({
  id,
  sequence,
  senderPeerId,
  senderInstanceId,
  audiencePeerId,
  privateKey,
  wireVersion = MESH_WIRE_VERSION,
}) {
  return createWebCryptoMeshEnvelopeSigner({
    signingPolicy: { allowedWireVersions: [wireVersion] },
  }).sign({
    envelope: {
      protocol: MESH_PROTOCOL,
      wireVersion,
      messageId: id,
      tenantId: scope.tenantId,
      meshId: scope.meshId,
      type: "peer.ping",
      sender: { peerId: senderPeerId, instanceId: senderInstanceId },
      audience: { kind: "peer", peerId: audiencePeerId },
      sequence,
      sentAt: "2026-08-01T00:00:00Z",
      expiresAt: "2026-08-01T00:00:30Z",
      payload: { type: "peer.ping" },
      proof: { algorithm: MESH_SIGNATURE_ALGORITHM, keyId: "fault-key" },
    },
    privateKey,
  });
}

function cell(id, outcome) {
  return Object.freeze({ id, outcome });
}

function parseArguments(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const name = values[index];
    if (name !== "--candidate-commit" && name !== "--output") {
      throw new TypeError(`Unsupported argument: ${name}`);
    }
    const value = values[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new TypeError(`${name} requires a value`);
    }
    result.set(name, value);
    index += 1;
  }
  return result;
}
