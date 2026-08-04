import {
  MESH_DURABILITY_SCHEMA_VERSION,
  MESH_DURABLE_ENVELOPE_FORMAT,
  MESH_DURABLE_GENESIS_DIGEST,
  MESH_DURABLE_JOURNAL_VERSION,
  MESH_DURABLE_LEGACY_OPAQUE_SNAPSHOT_FORMAT,
  MESH_DURABLE_OPAQUE_SNAPSHOT_FORMAT,
  MESH_PREVIOUS_DURABILITY_SCHEMA_VERSION,
  computeMeshDurableValueDigest,
  createMeshDurableJournalEntry,
  normalizeMeshDurableScope,
} from "@agentplat/mesh/durability";
import type {
  MeshDurableAbandonInput,
  MeshDurableClaim,
  MeshDurableClaimOptions,
  MeshDurableCommitInboxInput,
  MeshDurableCommitLocalInput,
  MeshDurableCommitResult,
  MeshDurableInboxRecord,
  MeshDurableJournalEntry,
  MeshDurableJournalQuery,
  MeshDurableOutboxRecord,
  MeshDurableOutboundDraft,
  MeshDurablePeerSnapshot,
  MeshDurableReceiveResult,
  MeshDurableLocalTransitionRepository,
  MeshDurableScope,
  MeshDurableSettleOutboxInput,
  MeshDurableSnapshotDescriptor,
} from "@agentplat/mesh/durability";
import {
  canonicalizeMeshJsonBytes,
  parseSignedMeshEnvelope,
  validateSignedMeshEnvelope,
} from "@agentplat/mesh-protocol";
import type {
  MeshJsonValue,
  SignedMeshEnvelope,
} from "@agentplat/mesh-protocol";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import { Buffer } from "node:buffer";
import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

type Row = QueryResultRow & Record<string, unknown>;

interface Database {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<R>>;
}

function scopedDatabase(database: Pool | PoolClient, schema: string): Database {
  const prefix = `${quotePostgresIdentifier(schema)}.`;
  return {
    query<R extends QueryResultRow = QueryResultRow>(
      text: string,
      values?: unknown[],
    ) {
      return database.query<R>(text.replaceAll("public.", prefix), values);
    },
  };
}

export interface PostgresMeshDurableRepositoryOptions {
  readonly schema?: string;
  readonly maximumPendingInboxRowsPerScope?: number;
}

/**
 * PostgreSQL implementation of the Mesh durable repository.
 *
 * The pool is caller-owned and is never closed by this adapter.
 */
export class PostgresMeshDurableRepository implements MeshDurableLocalTransitionRepository {
  readonly #schema: string;
  readonly #maximumPendingInboxRowsPerScope: number;

  constructor(
    readonly pool: Pool,
    options: PostgresMeshDurableRepositoryOptions = {},
  ) {
    if (!pool || typeof pool.connect !== "function") {
      throw new TypeError("A PostgreSQL pool is required");
    }
    this.#schema = normalizePostgresIdentifier(
      options.schema ?? defaultPostgresSchema,
      "schema",
    );
    this.#maximumPendingInboxRowsPerScope = positiveInteger(
      options.maximumPendingInboxRowsPerScope ?? 100_000,
      "maximumPendingInboxRowsPerScope",
      1_000_000,
    );
  }

  async receive(input: {
    readonly scope: MeshDurableScope;
    readonly envelope: SignedMeshEnvelope;
  }): Promise<MeshDurableReceiveResult> {
    const scope = normalizeMeshDurableScope(input.scope);
    const envelope = validateInboundEnvelope(input.envelope, scope);
    const envelopeDigest = await digestEnvelope(envelope);
    const envelopeBytes = canonicalEnvelopeBytes(envelope);
    return this.#transaction(async (database) => {
      await database.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [scopeKey(scope)],
      );
      const existing = await database.query<Row>(
        `SELECT envelope_digest, received_at
           FROM public.mesh_inbox
          WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
            AND instance_id = $4 AND message_id = $5`,
        [...scopeValues(scope), envelope.messageId],
      );
      if (existing.rowCount === 1) {
        if (String(existing.rows[0]!.envelope_digest) !== envelopeDigest) {
          return Object.freeze({
            accepted: false,
            code: "message_conflict",
          });
        }
        return Object.freeze({
          accepted: true,
          duplicate: true,
          receivedAt: iso(existing.rows[0]!.received_at),
          envelopeDigest,
        });
      }
      const capacity = await database.query<Row>(
        `SELECT count(*)::bigint AS count
           FROM public.mesh_inbox
          WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
            AND instance_id = $4 AND status IN ('pending', 'processing')`,
        scopeValues(scope),
      );
      if (
        Number(capacity.rows[0]!.count) >= this.#maximumPendingInboxRowsPerScope
      ) {
        return Object.freeze({
          accepted: false,
          code: "capacity_exceeded",
        });
      }
      const inserted = await database.query<Row>(
        `INSERT INTO public.mesh_inbox
           (tenant_id, mesh_id, peer_id, instance_id, message_id,
            envelope, envelope_digest, wrapper_schema_version,
            envelope_format, envelope_wire_version, envelope_bytes)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11)
         RETURNING received_at`,
        [
          ...scopeValues(scope),
          envelope.messageId,
          JSON.stringify(envelope),
          envelopeDigest,
          MESH_DURABILITY_SCHEMA_VERSION,
          MESH_DURABLE_ENVELOPE_FORMAT,
          envelope.wireVersion,
          Buffer.from(envelopeBytes),
        ],
      );
      return Object.freeze({
        accepted: true,
        duplicate: false,
        receivedAt: iso(inserted.rows[0]!.received_at),
        envelopeDigest,
      });
    });
  }

  async loadSnapshot(
    inputScope: MeshDurableScope,
  ): Promise<MeshDurablePeerSnapshot | undefined> {
    const scope = normalizeMeshDurableScope(inputScope);
    const result = await scopedDatabase(this.pool, this.#schema).query<Row>(
      `SELECT * FROM public.mesh_peer_snapshots
        WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
          AND instance_id = $4`,
      scopeValues(scope),
    );
    return result.rowCount === 0
      ? undefined
      : await mapSnapshot(result.rows[0]!, scope);
  }

  async claimInbox(
    input: MeshDurableClaimOptions,
  ): Promise<readonly MeshDurableInboxRecord[]> {
    const options = normalizeClaimOptions(input);
    return this.#transaction(async (database) => {
      const selected = await database.query<Row>(
        `SELECT message_id
           FROM public.mesh_inbox
          WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
            AND instance_id = $4
            AND (
              (status = 'pending' AND available_at <= transaction_timestamp())
              OR
              (status = 'processing' AND claim_expires_at <= transaction_timestamp())
            )
          ORDER BY received_at, message_id
          FOR UPDATE SKIP LOCKED
          LIMIT $5`,
        [...scopeValues(options.scope), options.limit],
      );
      const claimed: MeshDurableInboxRecord[] = [];
      for (const selectedRow of selected.rows) {
        const token = globalThis.crypto.randomUUID();
        const updated = await database.query<Row>(
          `UPDATE public.mesh_inbox
              SET status = 'processing',
                  attempts = attempts + 1,
                  claim_worker_id = $6,
                  claim_token = $7,
                  claim_generation = claim_generation + 1,
                  claim_expires_at = transaction_timestamp()
                    + ($8::bigint * interval '1 millisecond'),
                  settled_at = NULL,
                  reason_code = NULL
            WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
              AND instance_id = $4 AND message_id = $5
          RETURNING *`,
          [
            ...scopeValues(options.scope),
            String(selectedRow.message_id),
            options.workerId,
            token,
            options.leaseDurationMs,
          ],
        );
        claimed.push(await mapInbox(updated.rows[0]!, options.scope));
      }
      return Object.freeze(claimed);
    });
  }

  async commitInboxTransition(
    input: MeshDurableCommitInboxInput,
  ): Promise<MeshDurableCommitResult> {
    const scope = normalizeMeshDurableScope(input.inbox.scope);
    assertCommitInput(input, scope);
    return this.#transaction(async (database) => {
      // A snapshot row does not exist at revision zero, so a row lock alone
      // cannot serialize the first compare-and-swap transition.
      await database.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [scopeKey(scope)],
      );
      const inboxResult = await database.query<Row>(
        `SELECT *, claim_expires_at > transaction_timestamp() AS claim_live
           FROM public.mesh_inbox
          WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
            AND instance_id = $4 AND message_id = $5
          FOR UPDATE`,
        [...scopeValues(scope), input.inbox.messageId],
      );
      if (
        inboxResult.rowCount !== 1 ||
        !claimMatches(inboxResult.rows[0]!, input.inbox.claim, "processing")
      ) {
        return commitConflict("claim_lost");
      }

      const transition = await database.query<Row>(
        `SELECT 1 FROM public.mesh_journal
          WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
            AND instance_id = $4 AND transition_id = $5
          LIMIT 1`,
        [...scopeValues(scope), input.transitionId],
      );
      if (transition.rowCount !== 0) {
        return commitConflict("transition_conflict");
      }

      const currentResult = await database.query<Row>(
        `SELECT * FROM public.mesh_peer_snapshots
          WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
            AND instance_id = $4
          FOR UPDATE`,
        scopeValues(scope),
      );
      const current =
        currentResult.rowCount === 0
          ? undefined
          : await mapSnapshot(currentResult.rows[0]!, scope);
      if ((current?.revision ?? 0) !== input.expectedSnapshotRevision) {
        return commitConflict("revision_conflict");
      }

      const timestamp = iso(
        (
          await database.query<Row>(
            "SELECT transaction_timestamp() AS occurred_at",
          )
        ).rows[0]!.occurred_at,
      );
      let snapshot = current;
      if (input.outcome === "applied") {
        const state = cloneStrictJson(input.nextState as MeshJsonValue);
        const stateDigest = await computeMeshDurableValueDigest(state);
        const descriptor = normalizeSnapshotDescriptor(
          input.nextStateDescriptor,
        );
        const revision = input.expectedSnapshotRevision + 1;
        const snapshotResult = await database.query<Row>(
          `INSERT INTO public.mesh_peer_snapshots
             (tenant_id, mesh_id, peer_id, instance_id, revision, state,
              state_digest, wrapper_schema_version, snapshot_format,
              snapshot_schema_version, committed_at)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10,
                   transaction_timestamp())
           ON CONFLICT (tenant_id, mesh_id, peer_id, instance_id)
           DO UPDATE SET revision = EXCLUDED.revision,
                         state = EXCLUDED.state,
                         state_digest = EXCLUDED.state_digest,
                         wrapper_schema_version = EXCLUDED.wrapper_schema_version,
                         snapshot_format = EXCLUDED.snapshot_format,
                         snapshot_schema_version = EXCLUDED.snapshot_schema_version,
                         committed_at = EXCLUDED.committed_at
           RETURNING *`,
          [
            ...scopeValues(scope),
            revision,
            JSON.stringify(state),
            stateDigest,
            MESH_DURABILITY_SCHEMA_VERSION,
            descriptor.format,
            descriptor.schemaVersion,
          ],
        );
        snapshot = await mapSnapshot(snapshotResult.rows[0]!, scope);
      }
      const snapshotRevision = snapshot?.revision ?? 0;
      const snapshotDigest =
        snapshot?.stateDigest ?? (await computeMeshDurableValueDigest(null));

      for (const outbound of input.outbox) {
        const conflict = await database.query<Row>(
          `SELECT 1 FROM public.mesh_outbox
            WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
              AND instance_id = $4
              AND (effect_id = $5 OR message_id = $6)
            LIMIT 1`,
          [
            ...scopeValues(scope),
            outbound.effectId,
            outbound.envelope.messageId,
          ],
        );
        if (conflict.rowCount !== 0) {
          throw new CommitConflictError("outbox_conflict");
        }
      }
      await assertPersistedOutboxDependencies(database, scope, input.outbox);

      const lastJournal = await database.query<Row>(
        `SELECT sequence, digest FROM public.mesh_journal
          WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
            AND instance_id = $4
          ORDER BY sequence DESC
          LIMIT 1`,
        scopeValues(scope),
      );
      let sequence =
        lastJournal.rowCount === 0
          ? 0
          : safeInteger(lastJournal.rows[0]!.sequence, "journal sequence");
      let previousDigest =
        lastJournal.rowCount === 0
          ? MESH_DURABLE_GENESIS_DIGEST
          : String(lastJournal.rows[0]!.digest);
      const drafts =
        input.journal.length === 0
          ? [
              {
                entryId: input.transitionId,
                kind:
                  input.outcome === "applied"
                    ? "transition.applied"
                    : "transition.rejected",
                ...(input.reasonCode === undefined
                  ? {}
                  : { reasonCode: input.reasonCode }),
              },
            ]
          : input.journal;
      const journal: MeshDurableJournalEntry[] = [];
      for (const draft of drafts) {
        sequence += 1;
        const entry = await createMeshDurableJournalEntry({
          scope,
          sequence,
          previousDigest,
          transitionId: input.transitionId,
          inboxMessageId: input.inbox.messageId,
          snapshotRevision,
          snapshotDigest,
          draft,
          occurredAt: timestamp,
        });
        await database.query(
          `INSERT INTO public.mesh_journal
             (tenant_id, mesh_id, peer_id, instance_id, sequence, entry_id,
              previous_digest, digest, transition_id, inbox_message_id,
              snapshot_revision, snapshot_digest, kind, reason_code,
              occurred_at, wrapper_schema_version, journal_version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                   $13, $14, $15::timestamptz, $16, $17)`,
          [
            ...scopeValues(scope),
            entry.sequence,
            entry.entryId,
            entry.previousDigest,
            entry.digest,
            entry.transitionId,
            entry.inboxMessageId ?? null,
            entry.snapshotRevision,
            entry.snapshotDigest,
            entry.kind,
            entry.reasonCode ?? null,
            entry.occurredAt,
            MESH_DURABILITY_SCHEMA_VERSION,
            MESH_DURABLE_JOURNAL_VERSION,
          ],
        );
        journal.push(entry);
        previousDigest = entry.digest;
      }

      const outbox: MeshDurableOutboxRecord[] = [];
      for (const outbound of input.outbox) {
        const targetPeerId =
          outbound.targetPeerId ??
          (outbound.envelope.audience.kind === "peer"
            ? outbound.envelope.audience.peerId
            : undefined);
        const envelope = validateOutboundEnvelope(
          outbound.envelope,
          scope,
          targetPeerId,
        );
        const envelopeDigest = await digestEnvelope(envelope);
        const envelopeBytes = canonicalEnvelopeBytes(envelope);
        const inserted = await database.query<Row>(
          `INSERT INTO public.mesh_outbox
             (tenant_id, mesh_id, peer_id, instance_id, effect_id, message_id,
              target_peer_id, depends_on_effect_id, envelope, envelope_digest,
              wrapper_schema_version, envelope_format,
              envelope_wire_version, envelope_bytes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11,
                   $12, $13, $14)
           RETURNING *`,
          [
            ...scopeValues(scope),
            outbound.effectId,
            envelope.messageId,
            targetPeerId ?? null,
            outbound.dependsOnEffectId ?? null,
            JSON.stringify(envelope),
            envelopeDigest,
            MESH_DURABILITY_SCHEMA_VERSION,
            MESH_DURABLE_ENVELOPE_FORMAT,
            envelope.wireVersion,
            Buffer.from(envelopeBytes),
          ],
        );
        outbox.push(await mapOutbox(inserted.rows[0]!, scope));
      }

      await database.query(
        `UPDATE public.mesh_inbox
            SET status = $6,
                settled_at = transaction_timestamp(),
                reason_code = $7,
                claim_worker_id = NULL,
                claim_token = NULL,
                claim_expires_at = NULL
          WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
            AND instance_id = $4 AND message_id = $5`,
        [
          ...scopeValues(scope),
          input.inbox.messageId,
          input.outcome,
          input.reasonCode ?? null,
        ],
      );
      return Object.freeze({
        committed: true,
        ...(snapshot === undefined ? {} : { snapshot }),
        journal: Object.freeze(journal),
        outbox: Object.freeze(outbox),
      });
    }).catch((error: unknown) => {
      if (error instanceof CommitConflictError) {
        return commitConflict(error.code);
      }
      throw error;
    });
  }

  async commitLocalTransition(
    input: MeshDurableCommitLocalInput,
  ): Promise<MeshDurableCommitResult> {
    const scope = normalizeMeshDurableScope(input.scope);
    assertLocalCommitInput(input, scope);
    return this.#transaction(async (database) => {
      // The advisory lock also serializes the revision-zero insert with inbox
      // transitions for the same concrete peer incarnation.
      await database.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [scopeKey(scope)],
      );
      const transition = await database.query<Row>(
        `SELECT 1 FROM public.mesh_journal
          WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
            AND instance_id = $4 AND transition_id = $5
          LIMIT 1`,
        [...scopeValues(scope), input.transitionId],
      );
      if (transition.rowCount !== 0) {
        return commitConflict("transition_conflict");
      }

      const currentResult = await database.query<Row>(
        `SELECT * FROM public.mesh_peer_snapshots
          WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
            AND instance_id = $4
          FOR UPDATE`,
        scopeValues(scope),
      );
      const current =
        currentResult.rowCount === 0
          ? undefined
          : await mapSnapshot(currentResult.rows[0]!, scope);
      if ((current?.revision ?? 0) !== input.expectedSnapshotRevision) {
        return commitConflict("revision_conflict");
      }

      for (const outbound of input.outbox) {
        const conflict = await database.query<Row>(
          `SELECT 1 FROM public.mesh_outbox
            WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
              AND instance_id = $4
              AND (effect_id = $5 OR message_id = $6)
            LIMIT 1`,
          [
            ...scopeValues(scope),
            outbound.effectId,
            outbound.envelope.messageId,
          ],
        );
        if (conflict.rowCount !== 0) {
          throw new CommitConflictError("outbox_conflict");
        }
      }
      await assertPersistedOutboxDependencies(database, scope, input.outbox);

      const state = cloneStrictJson(input.nextState);
      const stateDigest = await computeMeshDurableValueDigest(state);
      const descriptor = normalizeSnapshotDescriptor(input.nextStateDescriptor);
      const revision = input.expectedSnapshotRevision + 1;
      const snapshotResult = await database.query<Row>(
        `INSERT INTO public.mesh_peer_snapshots
           (tenant_id, mesh_id, peer_id, instance_id, revision, state,
            state_digest, wrapper_schema_version, snapshot_format,
            snapshot_schema_version, committed_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10,
                 transaction_timestamp())
         ON CONFLICT (tenant_id, mesh_id, peer_id, instance_id)
         DO UPDATE SET revision = EXCLUDED.revision,
                       state = EXCLUDED.state,
                       state_digest = EXCLUDED.state_digest,
                       wrapper_schema_version = EXCLUDED.wrapper_schema_version,
                       snapshot_format = EXCLUDED.snapshot_format,
                       snapshot_schema_version = EXCLUDED.snapshot_schema_version,
                       committed_at = EXCLUDED.committed_at
         RETURNING *`,
        [
          ...scopeValues(scope),
          revision,
          JSON.stringify(state),
          stateDigest,
          MESH_DURABILITY_SCHEMA_VERSION,
          descriptor.format,
          descriptor.schemaVersion,
        ],
      );
      const snapshot = await mapSnapshot(snapshotResult.rows[0]!, scope);

      const timestamp = iso(
        (
          await database.query<Row>(
            "SELECT transaction_timestamp() AS occurred_at",
          )
        ).rows[0]!.occurred_at,
      );
      const lastJournal = await database.query<Row>(
        `SELECT sequence, digest FROM public.mesh_journal
          WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
            AND instance_id = $4
          ORDER BY sequence DESC
          LIMIT 1`,
        scopeValues(scope),
      );
      let sequence =
        lastJournal.rowCount === 0
          ? 0
          : safeInteger(lastJournal.rows[0]!.sequence, "journal sequence");
      let previousDigest =
        lastJournal.rowCount === 0
          ? MESH_DURABLE_GENESIS_DIGEST
          : String(lastJournal.rows[0]!.digest);
      const drafts =
        input.journal.length === 0
          ? [
              {
                entryId: input.transitionId,
                kind: "transition.applied",
              },
            ]
          : input.journal;
      const journal: MeshDurableJournalEntry[] = [];
      for (const draft of drafts) {
        sequence += 1;
        const entry = await createMeshDurableJournalEntry({
          scope,
          sequence,
          previousDigest,
          transitionId: input.transitionId,
          snapshotRevision: snapshot.revision,
          snapshotDigest: snapshot.stateDigest,
          draft,
          occurredAt: timestamp,
        });
        await database.query(
          `INSERT INTO public.mesh_journal
             (tenant_id, mesh_id, peer_id, instance_id, sequence, entry_id,
              previous_digest, digest, transition_id, inbox_message_id,
              snapshot_revision, snapshot_digest, kind, reason_code,
              occurred_at, wrapper_schema_version, journal_version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, $10, $11,
                   $12, $13, $14::timestamptz, $15, $16)`,
          [
            ...scopeValues(scope),
            entry.sequence,
            entry.entryId,
            entry.previousDigest,
            entry.digest,
            entry.transitionId,
            entry.snapshotRevision,
            entry.snapshotDigest,
            entry.kind,
            entry.reasonCode ?? null,
            entry.occurredAt,
            MESH_DURABILITY_SCHEMA_VERSION,
            MESH_DURABLE_JOURNAL_VERSION,
          ],
        );
        journal.push(entry);
        previousDigest = entry.digest;
      }

      const outbox: MeshDurableOutboxRecord[] = [];
      for (const outbound of input.outbox) {
        const targetPeerId =
          outbound.targetPeerId ??
          (outbound.envelope.audience.kind === "peer"
            ? outbound.envelope.audience.peerId
            : undefined);
        const envelope = validateOutboundEnvelope(
          outbound.envelope,
          scope,
          targetPeerId,
        );
        const envelopeDigest = await digestEnvelope(envelope);
        const envelopeBytes = canonicalEnvelopeBytes(envelope);
        const inserted = await database.query<Row>(
          `INSERT INTO public.mesh_outbox
             (tenant_id, mesh_id, peer_id, instance_id, effect_id, message_id,
              target_peer_id, depends_on_effect_id, envelope, envelope_digest,
              wrapper_schema_version, envelope_format,
              envelope_wire_version, envelope_bytes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11,
                   $12, $13, $14)
           RETURNING *`,
          [
            ...scopeValues(scope),
            outbound.effectId,
            envelope.messageId,
            targetPeerId ?? null,
            outbound.dependsOnEffectId ?? null,
            JSON.stringify(envelope),
            envelopeDigest,
            MESH_DURABILITY_SCHEMA_VERSION,
            MESH_DURABLE_ENVELOPE_FORMAT,
            envelope.wireVersion,
            Buffer.from(envelopeBytes),
          ],
        );
        outbox.push(await mapOutbox(inserted.rows[0]!, scope));
      }
      return Object.freeze({
        committed: true,
        snapshot,
        journal: Object.freeze(journal),
        outbox: Object.freeze(outbox),
      });
    }).catch((error: unknown) => {
      if (error instanceof CommitConflictError) {
        return commitConflict(error.code);
      }
      throw error;
    });
  }

  async abandonInbox(input: MeshDurableAbandonInput): Promise<boolean> {
    const scope = normalizeMeshDurableScope(input.inbox.scope);
    const claim = input.inbox.claim;
    if (!claim) return false;
    const retryAfterMs = positiveInteger(
      input.retryAfterMs,
      "retryAfterMs",
      3_600_000,
    );
    if (input.reasonCode !== undefined) {
      boundedReason(input.reasonCode, "reasonCode");
    }
    const result = await scopedDatabase(this.pool, this.#schema).query(
      `UPDATE public.mesh_inbox
          SET status = 'pending',
              available_at = transaction_timestamp()
                + ($9::bigint * interval '1 millisecond'),
              reason_code = $10,
              claim_worker_id = NULL,
              claim_token = NULL,
              claim_expires_at = NULL
        WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
          AND instance_id = $4 AND message_id = $5
          AND status = 'processing' AND claim_worker_id = $6
          AND claim_token = $7 AND claim_generation = $8`,
      [
        ...scopeValues(scope),
        input.inbox.messageId,
        claim.workerId,
        claim.leaseToken,
        claim.generation,
        retryAfterMs,
        input.reasonCode ?? null,
      ],
    );
    return result.rowCount === 1;
  }

  async claimOutbox(
    input: MeshDurableClaimOptions,
  ): Promise<readonly MeshDurableOutboxRecord[]> {
    const options = normalizeClaimOptions(input);
    return this.#transaction(async (database) => {
      const selected = await database.query<Row>(
        `SELECT candidate.effect_id
           FROM public.mesh_outbox AS candidate
          WHERE candidate.tenant_id = $1 AND candidate.mesh_id = $2
            AND candidate.peer_id = $3 AND candidate.instance_id = $4
            AND (
              (candidate.status = 'pending'
                AND candidate.available_at <= transaction_timestamp())
              OR (candidate.status = 'delivering'
                AND candidate.claim_expires_at <= transaction_timestamp())
            )
            AND (
              candidate.depends_on_effect_id IS NULL
              OR EXISTS (
                SELECT 1
                  FROM public.mesh_outbox AS predecessor
                 WHERE predecessor.tenant_id = candidate.tenant_id
                   AND predecessor.mesh_id = candidate.mesh_id
                   AND predecessor.peer_id = candidate.peer_id
                   AND predecessor.instance_id = candidate.instance_id
                   AND predecessor.effect_id = candidate.depends_on_effect_id
                   AND predecessor.status = 'delivered'
              )
            )
          ORDER BY candidate.created_at, candidate.effect_id
          FOR UPDATE SKIP LOCKED
          LIMIT $5`,
        [...scopeValues(options.scope), options.limit],
      );
      const claimed: MeshDurableOutboxRecord[] = [];
      for (const selectedRow of selected.rows) {
        const token = globalThis.crypto.randomUUID();
        const updated = await database.query<Row>(
          `UPDATE public.mesh_outbox
              SET status = 'delivering',
                  attempts = attempts + 1,
                  claim_worker_id = $6,
                  claim_token = $7,
                  claim_generation = claim_generation + 1,
                  claim_expires_at = transaction_timestamp()
                    + ($8::bigint * interval '1 millisecond'),
                  settled_at = NULL,
                  reason_code = NULL
            WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
              AND instance_id = $4 AND effect_id = $5
          RETURNING *`,
          [
            ...scopeValues(options.scope),
            String(selectedRow.effect_id),
            options.workerId,
            token,
            options.leaseDurationMs,
          ],
        );
        claimed.push(await mapOutbox(updated.rows[0]!, options.scope));
      }
      return Object.freeze(claimed);
    });
  }

  async settleOutbox(input: MeshDurableSettleOutboxInput): Promise<boolean> {
    const scope = normalizeMeshDurableScope(input.outbox.scope);
    const claim = input.outbox.claim;
    if (!claim) return false;
    if (
      !input.settlement ||
      (input.settlement.disposition !== "retryable" &&
        input.settlement.disposition !== "delivered" &&
        input.settlement.disposition !== "permanent_rejection")
    ) {
      throw new TypeError("Mesh PostgreSQL outbox settlement is invalid");
    }
    if (input.settlement.reasonCode !== undefined) {
      boundedReason(input.settlement.reasonCode, "reasonCode");
    }
    const retry = input.settlement.disposition === "retryable";
    const retryAfterMs = retry
      ? positiveInteger(
          input.settlement.retryAfterMs,
          "retryAfterMs",
          3_600_000,
        )
      : 0;
    const status = retry
      ? "pending"
      : input.settlement.disposition === "delivered"
        ? "delivered"
        : "rejected";
    return this.#transaction(async (database) => {
      const result = await database.query(
        `UPDATE public.mesh_outbox
            SET status = $9,
                available_at = CASE WHEN $9 = 'pending'
                  THEN transaction_timestamp()
                    + ($10::bigint * interval '1 millisecond')
                  ELSE available_at END,
                settled_at = CASE WHEN $9 = 'pending'
                  THEN NULL ELSE transaction_timestamp() END,
                reason_code = $11,
                claim_worker_id = NULL,
                claim_token = NULL,
                claim_expires_at = NULL
          WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
            AND instance_id = $4 AND effect_id = $5
            AND status = 'delivering' AND claim_worker_id = $6
            AND claim_token = $7 AND claim_generation = $8
            AND claim_expires_at > transaction_timestamp()`,
        [
          ...scopeValues(scope),
          input.outbox.effectId,
          claim.workerId,
          claim.leaseToken,
          claim.generation,
          status,
          retryAfterMs,
          input.settlement.reasonCode ?? null,
        ],
      );
      if (
        result.rowCount === 1 &&
        input.settlement.disposition === "permanent_rejection"
      ) {
        await database.query(
          `WITH RECURSIVE blocked(effect_id) AS (
             SELECT effect_id
               FROM public.mesh_outbox
              WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
                AND instance_id = $4 AND depends_on_effect_id = $5
             UNION
             SELECT child.effect_id
               FROM public.mesh_outbox AS child
               JOIN blocked AS predecessor
                 ON child.depends_on_effect_id = predecessor.effect_id
              WHERE child.tenant_id = $1 AND child.mesh_id = $2
                AND child.peer_id = $3 AND child.instance_id = $4
           )
           UPDATE public.mesh_outbox
              SET status = 'rejected',
                  settled_at = transaction_timestamp(),
                  reason_code = 'dependency_rejected',
                  claim_worker_id = NULL,
                  claim_token = NULL,
                  claim_expires_at = NULL
            WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
              AND instance_id = $4 AND effect_id IN (SELECT effect_id FROM blocked)
              AND status IN ('pending', 'delivering')`,
          [...scopeValues(scope), input.outbox.effectId],
        );
      }
      return result.rowCount === 1;
    });
  }

  async inspectJournal(
    input: MeshDurableJournalQuery,
  ): Promise<readonly MeshDurableJournalEntry[]> {
    const scope = normalizeMeshDurableScope(input.scope);
    const afterSequence = nonNegativeInteger(
      input.afterSequence ?? 0,
      "afterSequence",
    );
    const limit = positiveInteger(input.limit, "limit", 10_000);
    const result = await scopedDatabase(this.pool, this.#schema).query<Row>(
      `SELECT * FROM public.mesh_journal
        WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
          AND instance_id = $4 AND sequence > $5
        ORDER BY sequence
        LIMIT $6`,
      [...scopeValues(scope), afterSequence, limit],
    );
    const entries = await Promise.all(
      result.rows.map((row) => mapJournal(row, scope)),
    );
    return Object.freeze(entries);
  }

  close(): void {
    // The pool is caller-owned.
  }

  async #transaction<T>(work: (database: Database) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const database = scopedDatabase(client, this.#schema);
    try {
      await client.query("BEGIN");
      const result = await work(database);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

class CommitConflictError extends Error {
  constructor(
    readonly code: Extract<
      MeshDurableCommitResult,
      { committed: false }
    >["code"],
  ) {
    super(code);
  }
}

function commitConflict(
  code: Extract<MeshDurableCommitResult, { committed: false }>["code"],
): MeshDurableCommitResult {
  return Object.freeze({ committed: false, code });
}

function validateInboundEnvelope(
  input: SignedMeshEnvelope,
  scope: MeshDurableScope,
): SignedMeshEnvelope {
  const result = validateSignedMeshEnvelope(input);
  if (
    !result.ok ||
    result.value.tenantId !== scope.tenantId ||
    result.value.meshId !== scope.meshId ||
    (result.value.audience.kind === "peer" &&
      result.value.audience.peerId !== scope.peerId)
  ) {
    throw new TypeError("Mesh durable inbound envelope scope is invalid");
  }
  return result.value;
}

function validateOutboundEnvelope(
  input: SignedMeshEnvelope,
  scope: MeshDurableScope,
  targetPeerId: string | undefined,
): SignedMeshEnvelope {
  const result = validateSignedMeshEnvelope(input);
  if (
    !result.ok ||
    result.value.tenantId !== scope.tenantId ||
    result.value.meshId !== scope.meshId ||
    result.value.sender.peerId !== scope.peerId ||
    result.value.sender.instanceId !== scope.instanceId ||
    (result.value.audience.kind === "peer" &&
      result.value.audience.peerId !== targetPeerId) ||
    (result.value.audience.kind === "mesh" && !targetPeerId)
  ) {
    throw new TypeError("Mesh durable outbound envelope scope is invalid");
  }
  return result.value;
}

async function digestEnvelope(envelope: SignedMeshEnvelope): Promise<string> {
  return computeMeshDurableValueDigest(envelope as unknown as MeshJsonValue);
}

function canonicalEnvelopeBytes(envelope: SignedMeshEnvelope): Uint8Array {
  const canonical = canonicalizeMeshJsonBytes(envelope);
  if (!canonical.ok) {
    throw new TypeError("Mesh envelope cannot be encoded canonically");
  }
  return canonical.value;
}

function normalizeSnapshotDescriptor(
  input: MeshDurableSnapshotDescriptor | undefined,
): MeshDurableSnapshotDescriptor {
  const descriptor =
    input ??
    Object.freeze({
      format: MESH_DURABLE_OPAQUE_SNAPSHOT_FORMAT,
      schemaVersion: 0,
    });
  const keys =
    descriptor && typeof descriptor === "object"
      ? Object.keys(descriptor).sort()
      : [];
  if (
    !descriptor ||
    typeof descriptor !== "object" ||
    keys.length !== 2 ||
    keys[0] !== "format" ||
    keys[1] !== "schemaVersion" ||
    typeof descriptor.format !== "string" ||
    descriptor.format.length < 3 ||
    new TextEncoder().encode(descriptor.format).byteLength > 256 ||
    /[\u0000-\u001f\u007f]/u.test(descriptor.format) ||
    descriptor.format === MESH_DURABLE_LEGACY_OPAQUE_SNAPSHOT_FORMAT ||
    !Number.isSafeInteger(descriptor.schemaVersion) ||
    descriptor.schemaVersion < 0 ||
    descriptor.schemaVersion > 65_535
  ) {
    throw new TypeError("Mesh snapshot descriptor is invalid");
  }
  return Object.freeze({ ...descriptor });
}

function durabilitySchemaVersion(value: unknown): 1 | 2 {
  const version = Number(value ?? MESH_PREVIOUS_DURABILITY_SCHEMA_VERSION);
  if (
    version !== MESH_PREVIOUS_DURABILITY_SCHEMA_VERSION &&
    version !== MESH_DURABILITY_SCHEMA_VERSION
  ) {
    throw new TypeError("Persisted Mesh wrapper schema version is invalid");
  }
  return version;
}

function assertEnvelopeMetadata(
  row: Row,
  schemaVersion: 1 | 2,
  envelope: SignedMeshEnvelope,
  canonicalBytes: Uint8Array,
): void {
  if (schemaVersion === MESH_PREVIOUS_DURABILITY_SCHEMA_VERSION) return;
  if (
    row.envelope_format !== MESH_DURABLE_ENVELOPE_FORMAT ||
    safeInteger(row.envelope_wire_version, "envelope wire version") !==
      envelope.wireVersion ||
    row.envelope_bytes == null ||
    !bytesEqual(canonicalBytes, row.envelope_bytes)
  ) {
    throw new TypeError("Persisted Mesh envelope metadata is invalid");
  }
}

function bytesEqual(expected: Uint8Array, actual: unknown): boolean {
  if (
    !(actual instanceof Uint8Array) ||
    actual.byteLength !== expected.length
  ) {
    return false;
  }
  return expected.every((value, index) => actual[index] === value);
}

async function restoreEnvelope(
  input: unknown,
  persistedBytes?: unknown,
): Promise<{
  readonly envelope: SignedMeshEnvelope;
  readonly bytes: Uint8Array;
}> {
  const canonical = canonicalizeMeshJsonBytes(input);
  if (!canonical.ok) {
    throw new TypeError("Persisted Mesh envelope is invalid");
  }
  const parsed = parseSignedMeshEnvelope(canonical.value);
  if (!parsed.ok) throw new TypeError("Persisted Mesh envelope is invalid");
  if (
    persistedBytes !== undefined &&
    persistedBytes !== null &&
    !bytesEqual(canonical.value, persistedBytes)
  ) {
    throw new TypeError("Persisted Mesh envelope bytes are not canonical");
  }
  return Object.freeze({ envelope: parsed.value, bytes: canonical.value });
}

async function mapInbox(
  row: Row,
  scope: MeshDurableScope,
): Promise<MeshDurableInboxRecord> {
  const restored = await restoreEnvelope(row.envelope, row.envelope_bytes);
  const envelope = restored.envelope;
  const envelopeDigest = await digestEnvelope(envelope);
  if (
    envelope.messageId !== String(row.message_id) ||
    envelopeDigest !== String(row.envelope_digest)
  ) {
    throw new TypeError("Persisted Mesh inbox integrity check failed");
  }
  const status = String(row.status) as MeshDurableInboxRecord["status"];
  const claim = mapClaim(row, status === "processing");
  const schemaVersion = durabilitySchemaVersion(row.wrapper_schema_version);
  assertEnvelopeMetadata(row, schemaVersion, envelope, restored.bytes);
  return Object.freeze({
    schemaVersion,
    scope,
    messageId: envelope.messageId,
    envelope,
    envelopeDigest,
    ...(schemaVersion === MESH_DURABILITY_SCHEMA_VERSION
      ? {
          envelopeFormat: String(row.envelope_format),
          envelopeWireVersion: safeInteger(
            row.envelope_wire_version,
            "inbox envelope wire version",
          ),
          envelopeBytes: Buffer.from(restored.bytes).toString("base64url"),
        }
      : {}),
    status,
    attempts: safeInteger(row.attempts, "inbox attempts"),
    receivedAt: iso(row.received_at),
    availableAt: iso(row.available_at),
    ...(claim ? { claim } : {}),
    ...(row.settled_at == null ? {} : { settledAt: iso(row.settled_at) }),
    ...(row.reason_code == null ? {} : { reasonCode: String(row.reason_code) }),
  });
}

async function mapOutbox(
  row: Row,
  scope: MeshDurableScope,
): Promise<MeshDurableOutboxRecord> {
  const restored = await restoreEnvelope(row.envelope, row.envelope_bytes);
  const envelope = restored.envelope;
  const envelopeDigest = await digestEnvelope(envelope);
  if (
    envelope.messageId !== String(row.message_id) ||
    envelopeDigest !== String(row.envelope_digest)
  ) {
    throw new TypeError("Persisted Mesh outbox integrity check failed");
  }
  const status = String(row.status) as MeshDurableOutboxRecord["status"];
  const claim = mapClaim(row, status === "delivering");
  const schemaVersion = durabilitySchemaVersion(row.wrapper_schema_version);
  assertEnvelopeMetadata(row, schemaVersion, envelope, restored.bytes);
  const effectId = String(row.effect_id);
  const dependsOnEffectId =
    row.depends_on_effect_id == null
      ? undefined
      : String(row.depends_on_effect_id);
  if (
    !validIdentifier(effectId) ||
    (dependsOnEffectId !== undefined &&
      (!validIdentifier(dependsOnEffectId) || dependsOnEffectId === effectId))
  )
    throw new TypeError("Persisted Mesh outbox dependency is invalid");
  return Object.freeze({
    schemaVersion,
    scope,
    effectId,
    messageId: envelope.messageId,
    envelope,
    envelopeDigest,
    ...(schemaVersion === MESH_DURABILITY_SCHEMA_VERSION
      ? {
          envelopeFormat: String(row.envelope_format),
          envelopeWireVersion: safeInteger(
            row.envelope_wire_version,
            "outbox envelope wire version",
          ),
          envelopeBytes: Buffer.from(restored.bytes).toString("base64url"),
        }
      : {}),
    ...(row.target_peer_id == null
      ? {}
      : { targetPeerId: String(row.target_peer_id) }),
    ...(dependsOnEffectId === undefined ? {} : { dependsOnEffectId }),
    status,
    attempts: safeInteger(row.attempts, "outbox attempts"),
    availableAt: iso(row.available_at),
    createdAt: iso(row.created_at),
    ...(claim ? { claim } : {}),
    ...(row.settled_at == null ? {} : { settledAt: iso(row.settled_at) }),
    ...(row.reason_code == null ? {} : { reasonCode: String(row.reason_code) }),
  });
}

async function mapSnapshot(
  row: Row,
  scope: MeshDurableScope,
): Promise<MeshDurablePeerSnapshot> {
  const state = cloneStrictJson(row.state as MeshJsonValue);
  const stateDigest = await computeMeshDurableValueDigest(state);
  if (stateDigest !== String(row.state_digest)) {
    throw new TypeError("Persisted Mesh snapshot integrity check failed");
  }
  const schemaVersion = durabilitySchemaVersion(row.wrapper_schema_version);
  const hasSnapshotFormat = row.snapshot_format !== undefined;
  const hasSnapshotSchemaVersion = row.snapshot_schema_version !== undefined;
  if (hasSnapshotFormat !== hasSnapshotSchemaVersion) {
    throw new TypeError("Persisted Mesh snapshot descriptor is incomplete");
  }
  const descriptor = hasSnapshotFormat
    ? persistedSnapshotDescriptor(
        row.snapshot_format,
        row.snapshot_schema_version,
        schemaVersion,
      )
    : undefined;
  if (
    schemaVersion === MESH_DURABILITY_SCHEMA_VERSION &&
    descriptor === undefined
  ) {
    throw new TypeError("Persisted Mesh snapshot descriptor is missing");
  }
  return Object.freeze({
    schemaVersion,
    scope,
    revision: positiveInteger(
      safeInteger(row.revision, "snapshot revision"),
      "snapshot revision",
      Number.MAX_SAFE_INTEGER,
    ),
    state,
    stateDigest,
    ...(descriptor === undefined
      ? {}
      : {
          snapshotFormat: descriptor.format,
          snapshotSchemaVersion: descriptor.schemaVersion,
        }),
    committedAt: iso(row.committed_at),
  });
}

async function mapJournal(
  row: Row,
  scope: MeshDurableScope,
): Promise<MeshDurableJournalEntry> {
  const schemaVersion = durabilitySchemaVersion(row.wrapper_schema_version);
  if (
    schemaVersion === MESH_DURABILITY_SCHEMA_VERSION &&
    safeInteger(row.journal_version, "journal chain version") !==
      MESH_DURABLE_JOURNAL_VERSION
  ) {
    throw new TypeError("Persisted Mesh journal version is invalid");
  }
  const entry = await createMeshDurableJournalEntry({
    scope,
    sequence: safeInteger(row.sequence, "journal sequence"),
    previousDigest: String(row.previous_digest),
    transitionId: String(row.transition_id),
    ...(row.inbox_message_id == null
      ? {}
      : { inboxMessageId: String(row.inbox_message_id) }),
    snapshotRevision: safeInteger(row.snapshot_revision, "snapshot revision"),
    snapshotDigest: String(row.snapshot_digest),
    draft: {
      entryId: String(row.entry_id),
      kind: String(row.kind),
      ...(row.reason_code == null
        ? {}
        : { reasonCode: String(row.reason_code) }),
    },
    occurredAt: iso(row.occurred_at),
    schemaVersion,
  });
  if (entry.digest !== String(row.digest)) {
    throw new TypeError("Persisted Mesh journal integrity check failed");
  }
  return entry;
}

function persistedSnapshotDescriptor(
  formatValue: unknown,
  schemaVersionValue: unknown,
  wrapperSchemaVersion: 1 | 2,
): MeshDurableSnapshotDescriptor {
  const format = String(formatValue);
  const schemaVersion = safeInteger(
    schemaVersionValue,
    "snapshot content schema version",
  );
  if (
    format.length < 3 ||
    new TextEncoder().encode(format).byteLength > 256 ||
    /[\u0000-\u001f\u007f]/u.test(format) ||
    schemaVersion < 0 ||
    schemaVersion > 65_535 ||
    (wrapperSchemaVersion === MESH_DURABILITY_SCHEMA_VERSION &&
      format === MESH_DURABLE_LEGACY_OPAQUE_SNAPSHOT_FORMAT) ||
    (wrapperSchemaVersion === MESH_PREVIOUS_DURABILITY_SCHEMA_VERSION &&
      format !== MESH_DURABLE_LEGACY_OPAQUE_SNAPSHOT_FORMAT)
  ) {
    throw new TypeError("Persisted Mesh snapshot descriptor is invalid");
  }
  return Object.freeze({ format, schemaVersion });
}

function mapClaim(row: Row, required: boolean): MeshDurableClaim | undefined {
  if (!required) return undefined;
  if (
    row.claim_worker_id == null ||
    row.claim_token == null ||
    row.claim_expires_at == null
  ) {
    throw new TypeError("Persisted Mesh claim is incomplete");
  }
  return Object.freeze({
    workerId: String(row.claim_worker_id),
    leaseToken: String(row.claim_token),
    generation: positiveInteger(
      safeInteger(row.claim_generation, "claim generation"),
      "claim generation",
      Number.MAX_SAFE_INTEGER,
    ),
    expiresAt: iso(row.claim_expires_at),
  });
}

function claimMatches(
  row: Row,
  claim: MeshDurableClaim | undefined,
  expectedStatus: string,
): boolean {
  return (
    claim !== undefined &&
    row.status === expectedStatus &&
    row.claim_live === true &&
    row.claim_worker_id === claim.workerId &&
    row.claim_token === claim.leaseToken &&
    safeInteger(row.claim_generation, "claim generation") === claim.generation
  );
}

function assertCommitInput(
  input: MeshDurableCommitInboxInput,
  scope: MeshDurableScope,
): void {
  if (
    input.inbox.status !== "processing" ||
    !input.inbox.claim ||
    !scopeEquals(scope, input.inbox.scope) ||
    !Number.isSafeInteger(input.expectedSnapshotRevision) ||
    input.expectedSnapshotRevision < 0 ||
    !validIdentifier(input.transitionId) ||
    !Array.isArray(input.journal) ||
    input.journal.length > 64 ||
    !Array.isArray(input.outbox) ||
    input.outbox.length > 256 ||
    (input.outcome === "applied" && input.nextState === undefined) ||
    (input.outcome === "rejected" &&
      (input.nextState !== undefined ||
        input.nextStateDescriptor !== undefined ||
        input.outbox.length !== 0 ||
        input.reasonCode === undefined)) ||
    (input.outcome === "applied" && input.reasonCode !== undefined) ||
    (input.outcome !== "applied" && input.outcome !== "rejected")
  ) {
    throw new TypeError("Mesh durable commit input is invalid");
  }
  if (input.outcome === "applied") {
    normalizeSnapshotDescriptor(input.nextStateDescriptor);
  }
  if (input.reasonCode !== undefined) {
    boundedReason(input.reasonCode, "reasonCode");
  }
  for (const draft of input.journal) {
    if (
      !draft ||
      !validIdentifier(draft.entryId) ||
      !validReason(draft.kind) ||
      (draft.reasonCode !== undefined && !validReason(draft.reasonCode))
    ) {
      throw new TypeError("Mesh durable journal draft is invalid");
    }
  }
  for (const outbound of input.outbox) {
    if (
      !outbound ||
      !validIdentifier(outbound.effectId) ||
      (outbound.dependsOnEffectId !== undefined &&
        !validIdentifier(outbound.dependsOnEffectId)) ||
      (outbound.targetPeerId !== undefined &&
        !validIdentifier(outbound.targetPeerId))
    ) {
      throw new TypeError("Mesh durable outbound draft is invalid");
    }
    validateOutboundEnvelope(
      outbound.envelope,
      scope,
      outbound.targetPeerId ??
        (outbound.envelope?.audience?.kind === "peer"
          ? outbound.envelope.audience.peerId
          : undefined),
    );
  }
  assertOutboxDependencies(input.outbox);
}

function assertLocalCommitInput(
  input: MeshDurableCommitLocalInput,
  scope: MeshDurableScope,
): void {
  if (
    !scopeEquals(scope, input.scope) ||
    !Number.isSafeInteger(input.expectedSnapshotRevision) ||
    input.expectedSnapshotRevision < 0 ||
    !validIdentifier(input.transitionId) ||
    !Array.isArray(input.journal) ||
    input.journal.length > 64 ||
    !Array.isArray(input.outbox) ||
    input.outbox.length > 256 ||
    input.nextState === undefined
  ) {
    throw new TypeError("Mesh durable local commit input is invalid");
  }
  normalizeSnapshotDescriptor(input.nextStateDescriptor);
  cloneStrictJson(input.nextState);
  for (const draft of input.journal) {
    if (
      !draft ||
      !validIdentifier(draft.entryId) ||
      !validReason(draft.kind) ||
      (draft.reasonCode !== undefined && !validReason(draft.reasonCode))
    ) {
      throw new TypeError("Mesh durable journal draft is invalid");
    }
  }
  for (const outbound of input.outbox) {
    if (
      !outbound ||
      !validIdentifier(outbound.effectId) ||
      (outbound.dependsOnEffectId !== undefined &&
        !validIdentifier(outbound.dependsOnEffectId)) ||
      (outbound.targetPeerId !== undefined &&
        !validIdentifier(outbound.targetPeerId))
    ) {
      throw new TypeError("Mesh durable outbound draft is invalid");
    }
    validateOutboundEnvelope(
      outbound.envelope,
      scope,
      outbound.targetPeerId ??
        (outbound.envelope?.audience?.kind === "peer"
          ? outbound.envelope.audience.peerId
          : undefined),
    );
  }
  assertOutboxDependencies(input.outbox);
}

function assertOutboxDependencies(
  outbox: readonly MeshDurableOutboundDraft[],
): void {
  const batch = new Set(outbox.map(({ effectId }) => effectId));
  const seen = new Set<string>();
  for (const outbound of outbox) {
    if (
      seen.has(outbound.effectId) ||
      (outbound.dependsOnEffectId !== undefined &&
        batch.has(outbound.dependsOnEffectId) &&
        !seen.has(outbound.dependsOnEffectId))
    )
      throw new TypeError("Mesh durable outbox dependency order is invalid");
    seen.add(outbound.effectId);
  }
}

async function assertPersistedOutboxDependencies(
  database: Database,
  scope: MeshDurableScope,
  outbox: readonly MeshDurableOutboundDraft[],
): Promise<void> {
  const batch = new Set(outbox.map(({ effectId }) => effectId));
  const external = [
    ...new Set(
      outbox
        .map(({ dependsOnEffectId }) => dependsOnEffectId)
        .filter(
          (effectId): effectId is string =>
            effectId !== undefined && !batch.has(effectId),
        ),
    ),
  ];
  if (external.length === 0) return;
  const retained = await database.query<Row>(
    `SELECT effect_id, status FROM public.mesh_outbox
      WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
        AND instance_id = $4 AND effect_id = ANY($5::text[])`,
    [...scopeValues(scope), external],
  );
  const retainedStatus = new Map(
    retained.rows.map(({ effect_id, status }) => [
      String(effect_id),
      String(status),
    ]),
  );
  if (external.some((effectId) => !retainedStatus.has(effectId)))
    throw new TypeError("Mesh durable outbox dependency does not exist");
  if (external.some((effectId) => retainedStatus.get(effectId) === "rejected"))
    throw new TypeError("Mesh durable outbox dependency was rejected");
}

function normalizeClaimOptions(input: MeshDurableClaimOptions): {
  readonly scope: MeshDurableScope;
  readonly workerId: string;
  readonly limit: number;
  readonly leaseDurationMs: number;
} {
  if (!input || typeof input !== "object") {
    throw new TypeError("Mesh durable claim options are required");
  }
  if (
    typeof input.workerId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@-]*$/u.test(input.workerId) ||
    input.workerId.length > 256
  ) {
    throw new TypeError("Mesh durable workerId is invalid");
  }
  return Object.freeze({
    scope: normalizeMeshDurableScope(input.scope),
    workerId: input.workerId,
    limit: positiveInteger(input.limit, "limit", 256),
    leaseDurationMs: positiveInteger(
      input.leaseDurationMs,
      "leaseDurationMs",
      3_600_000,
    ),
  });
}

function cloneStrictJson(value: MeshJsonValue): MeshJsonValue {
  const canonical = canonicalizeMeshJsonBytes(value);
  if (!canonical.ok) {
    throw new TypeError("Mesh durable snapshot must be bounded strict JSON");
  }
  const parsed = JSON.parse(
    new TextDecoder().decode(canonical.value),
  ) as MeshJsonValue;
  return deepFreezeJson(parsed);
}

function deepFreezeJson(value: MeshJsonValue): MeshJsonValue {
  if (Array.isArray(value)) {
    for (const item of value) deepFreezeJson(item);
    return Object.freeze(value);
  }
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) deepFreezeJson(item);
    return Object.freeze(value);
  }
  return value;
}

function scopeValues(scope: MeshDurableScope): string[] {
  return [scope.tenantId, scope.meshId, scope.peerId, scope.instanceId];
}

function scopeKey(scope: MeshDurableScope): string {
  return JSON.stringify(scopeValues(scope));
}

function scopeEquals(left: MeshDurableScope, right: MeshDurableScope): boolean {
  return (
    left.tenantId === right.tenantId &&
    left.meshId === right.meshId &&
    left.peerId === right.peerId &&
    left.instanceId === right.instanceId
  );
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new TypeError("Persisted Mesh timestamp is invalid");
  }
  return parsed.toISOString();
}

function safeInteger(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new RangeError(`Persisted Mesh ${label} is invalid`);
  }
  return number;
}

function positiveInteger(
  value: number,
  label: string,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`Mesh PostgreSQL ${label} is outside its range`);
  }
  return value;
}

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Mesh PostgreSQL ${label} is outside its range`);
  }
  return value;
}

function validIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    new TextEncoder().encode(value).byteLength <= 256 &&
    /^[A-Za-z0-9][A-Za-z0-9._:@-]*$/u.test(value)
  );
}

function validReason(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[a-z0-9][a-z0-9._:-]*$/u.test(value)
  );
}

function boundedReason(value: unknown, label: string): string {
  if (!validReason(value)) {
    throw new TypeError(`Mesh PostgreSQL ${label} is invalid`);
  }
  return value;
}
