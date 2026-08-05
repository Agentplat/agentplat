import {
  createCollectiveAgreementEquivocationProofV1,
  validateCollectiveAgreementCommitCertificateShapeV1,
  validateSignedCollectiveAgreementEnvelopeV1,
} from "@agentplat/collective-quorum/agreement";
import type {
  CollectiveAgreementCommitCertificateV1,
  CollectiveAgreementEquivocationProofV1,
  CollectiveAgreementLocalStateV1,
  CollectiveAgreementRepositoryV1,
  CollectiveAgreementVotePayloadV1,
  CollectiveAgreementVoteRecordResultV1,
  SignedCollectiveAgreementEnvelopeV1,
} from "@agentplat/collective-quorum/agreement";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool, PoolClient } from "pg";

export interface PostgresCollectiveAgreementRepositoryOptionsV1 {
  readonly schema?: string;
  readonly tenantId: string;
  readonly meshId: string;
  readonly peerId: string;
  readonly crypto?: Crypto;
}

interface StateRow {
  readonly highest_round: string | number;
  readonly locked_round: string | number | null;
  readonly locked_value_digest: string | null;
}

interface VoteRow {
  readonly proposal_id: string;
  readonly value_digest: string | null;
  readonly vote: unknown;
}

interface CommitRow {
  readonly certificate_digest: string;
  readonly certificate: unknown;
}

/** Transactional validator state; one instance must be scoped to one peer. */
export class PostgresCollectiveAgreementRepositoryV1 implements CollectiveAgreementRepositoryV1 {
  readonly #prefix: string;
  readonly #scope: readonly [string, string, string];

  constructor(
    readonly pool: Pool,
    readonly options: PostgresCollectiveAgreementRepositoryOptionsV1,
  ) {
    if (!pool || !options?.tenantId || !options.meshId || !options.peerId)
      throw new TypeError("PostgreSQL agreement repository scope is required");
    this.#prefix = `${quotePostgresIdentifier(
      normalizePostgresIdentifier(
        options.schema ?? defaultPostgresSchema,
        "schema",
      ),
    )}.`;
    this.#scope = Object.freeze([
      options.tenantId,
      options.meshId,
      options.peerId,
    ]);
  }

  async readState(input: {
    readonly policyDomainId: string;
    readonly slotId: string;
    readonly height: number;
  }): Promise<CollectiveAgreementLocalStateV1 | null> {
    const result = await this.pool.query<StateRow>(
      `SELECT highest_round, locked_round, locked_value_digest
         FROM ${this.#prefix}collective_agreement_states
        WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
          AND policy_domain_id = $4 AND slot_id = $5 AND height = $6`,
      [...this.#scope, input.policyDomainId, input.slotId, input.height],
    );
    const row = result.rows[0];
    return row
      ? Object.freeze({
          ...input,
          highestRound: safe(row.highest_round),
          lockedRound:
            row.locked_round === null ? null : safe(row.locked_round),
          lockedValueDigest: row.locked_value_digest,
        })
      : null;
  }

  recordLocalVote(
    input: Parameters<CollectiveAgreementRepositoryV1["recordLocalVote"]>[0],
  ): Promise<CollectiveAgreementVoteRecordResultV1> {
    return this.#transaction(async (client) => {
      const coordinate = input.coordinate;
      await client.query(
        `INSERT INTO ${this.#prefix}collective_agreement_states
          (tenant_id, mesh_id, peer_id, policy_domain_id, slot_id, height, highest_round)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
        [
          ...this.#scope,
          coordinate.policyDomainId,
          coordinate.slotId,
          coordinate.height,
          coordinate.round,
        ],
      );
      const stateResult = await client.query<StateRow>(
        `SELECT highest_round, locked_round, locked_value_digest
           FROM ${this.#prefix}collective_agreement_states
          WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
            AND policy_domain_id = $4 AND slot_id = $5 AND height = $6
          FOR UPDATE`,
        [
          ...this.#scope,
          coordinate.policyDomainId,
          coordinate.slotId,
          coordinate.height,
        ],
      );
      const state = stateResult.rows[0]!;
      const prior = await this.#localVote(client, input);
      if (prior) {
        const vote = await decodeVote(prior.vote, this.options.crypto);
        if (!vote) throw new Error("stored_agreement_vote_invalid");
        return prior.proposal_id === input.proposalId &&
          prior.value_digest === input.valueDigest
          ? { status: "duplicate" as const, vote }
          : { status: "conflict" as const, vote };
      }
      if (coordinate.round < safe(state.highest_round))
        return { status: "stale_round" as const };
      await client.query(
        `UPDATE ${this.#prefix}collective_agreement_states
            SET highest_round = $7, updated_at = transaction_timestamp()
          WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
            AND policy_domain_id = $4 AND slot_id = $5 AND height = $6`,
        [
          ...this.#scope,
          coordinate.policyDomainId,
          coordinate.slotId,
          coordinate.height,
          coordinate.round,
        ],
      );
      const lockedRound =
        state.locked_round === null ? null : safe(state.locked_round);
      if (
        input.phase === "prevote" &&
        input.valueDigest !== null &&
        lockedRound !== null &&
        state.locked_value_digest !== input.valueDigest &&
        (input.justifiedRound === null || input.justifiedRound < lockedRound)
      )
        return { status: "locked" as const };
      if (
        input.phase === "precommit" &&
        (input.valueDigest === null ||
          input.justifiedRound !== coordinate.round)
      )
        return { status: "locked" as const };
      const vote = await input.create();
      if (
        vote.payload.phase !== input.phase ||
        vote.payload.proposalId !== input.proposalId ||
        vote.payload.valueDigest !== input.valueDigest
      )
        throw new TypeError("created vote does not match repository intent");
      await client.query(
        `INSERT INTO ${this.#prefix}collective_agreement_local_votes
          (tenant_id, mesh_id, peer_id, policy_domain_id, slot_id, height, round,
           phase, proposal_id, value_digest, vote)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
        [
          ...this.#scope,
          coordinate.policyDomainId,
          coordinate.slotId,
          coordinate.height,
          coordinate.round,
          input.phase,
          input.proposalId,
          input.valueDigest,
          JSON.stringify(vote),
        ],
      );
      await client.query(
        `UPDATE ${this.#prefix}collective_agreement_states
            SET highest_round = GREATEST(highest_round, $7),
                locked_round = CASE WHEN $8 = 'precommit' THEN $7 ELSE locked_round END,
                locked_value_digest = CASE WHEN $8 = 'precommit' THEN $9 ELSE locked_value_digest END,
                updated_at = transaction_timestamp()
          WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
            AND policy_domain_id = $4 AND slot_id = $5 AND height = $6`,
        [
          ...this.#scope,
          coordinate.policyDomainId,
          coordinate.slotId,
          coordinate.height,
          coordinate.round,
          input.phase,
          input.valueDigest,
        ],
      );
      return { status: "signed" as const, vote };
    });
  }

  observeVote(
    vote: SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementVotePayloadV1>,
  ): Promise<CollectiveAgreementEquivocationProofV1 | null> {
    return this.#transaction(async (client) => {
      const coordinate = vote.payload.coordinate;
      await client.query(
        `INSERT INTO ${this.#prefix}collective_agreement_observed_votes
          (tenant_id, mesh_id, peer_id, policy_domain_id, slot_id, height, round,
           phase, voter_peer_id, proposal_id, value_digest, vote)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
         ON CONFLICT DO NOTHING`,
        [
          ...this.#scope,
          coordinate.policyDomainId,
          coordinate.slotId,
          coordinate.height,
          coordinate.round,
          vote.payload.phase,
          vote.senderPeerId,
          vote.payload.proposalId,
          vote.payload.valueDigest,
          JSON.stringify(vote),
        ],
      );
      const result = await client.query<VoteRow>(
        `SELECT proposal_id, value_digest, vote
           FROM ${this.#prefix}collective_agreement_observed_votes
          WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
            AND policy_domain_id = $4 AND slot_id = $5 AND height = $6
            AND round = $7 AND phase = $8 AND voter_peer_id = $9
          FOR UPDATE`,
        [
          ...this.#scope,
          coordinate.policyDomainId,
          coordinate.slotId,
          coordinate.height,
          coordinate.round,
          vote.payload.phase,
          vote.senderPeerId,
        ],
      );
      const prior = result.rows[0]!;
      if (
        prior.proposal_id === vote.payload.proposalId &&
        prior.value_digest === vote.payload.valueDigest
      )
        return null;
      const first = await decodeVote(prior.vote, this.options.crypto);
      if (!first) throw new Error("stored_observed_vote_invalid");
      return createCollectiveAgreementEquivocationProofV1({
        first,
        second: vote,
        crypto: this.options.crypto,
      });
    });
  }

  saveCommit(
    certificate: CollectiveAgreementCommitCertificateV1,
  ): Promise<"stored" | "duplicate" | "conflict" | "chain_gap"> {
    return this.#transaction(async (client) => {
      const coordinate = certificate.coordinate;
      const existing = await client.query<CommitRow>(
        `SELECT certificate_digest, certificate
           FROM ${this.#prefix}collective_agreement_commits
          WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
            AND policy_domain_id = $4 AND slot_id = $5 AND height = $6
          FOR UPDATE`,
        [
          ...this.#scope,
          coordinate.policyDomainId,
          coordinate.slotId,
          coordinate.height,
        ],
      );
      if (existing.rows[0])
        return existing.rows[0].certificate_digest ===
          certificate.certificateDigest
          ? "duplicate"
          : "conflict";
      if (coordinate.height === 1) {
        if (certificate.value.previousCommitDigest !== null) return "chain_gap";
      } else {
        const prior = await client.query<{ certificate_digest: string }>(
          `SELECT certificate_digest
             FROM ${this.#prefix}collective_agreement_commits
            WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
              AND policy_domain_id = $4 AND slot_id = $5 AND height = $6
            FOR UPDATE`,
          [
            ...this.#scope,
            coordinate.policyDomainId,
            coordinate.slotId,
            coordinate.height - 1,
          ],
        );
        if (
          prior.rows[0]?.certificate_digest !==
          certificate.value.previousCommitDigest
        )
          return "chain_gap";
      }
      await client.query(
        `INSERT INTO ${this.#prefix}collective_agreement_commits
          (tenant_id, mesh_id, peer_id, policy_domain_id, slot_id, height,
           certificate_id, certificate_digest, previous_commit_digest, certificate)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
        [
          ...this.#scope,
          coordinate.policyDomainId,
          coordinate.slotId,
          coordinate.height,
          certificate.certificateId,
          certificate.certificateDigest,
          certificate.value.previousCommitDigest,
          JSON.stringify(certificate),
        ],
      );
      return "stored";
    });
  }

  async getCommit(input: {
    readonly policyDomainId: string;
    readonly slotId: string;
    readonly height: number;
  }): Promise<CollectiveAgreementCommitCertificateV1 | undefined> {
    const result = await this.pool.query<CommitRow>(
      `SELECT certificate_digest, certificate
         FROM ${this.#prefix}collective_agreement_commits
        WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
          AND policy_domain_id = $4 AND slot_id = $5 AND height = $6`,
      [...this.#scope, input.policyDomainId, input.slotId, input.height],
    );
    if (!result.rows[0]) return undefined;
    const commit = await decodeCommit(
      result.rows[0].certificate,
      this.options.crypto,
    );
    if (!commit) throw new Error("stored_agreement_commit_invalid");
    return commit;
  }

  async listCommits(input: {
    readonly policyDomainId: string;
    readonly slotId: string;
    readonly fromHeightExclusive: number;
    readonly maximumCount: number;
  }): Promise<readonly CollectiveAgreementCommitCertificateV1[]> {
    if (
      !Number.isSafeInteger(input.maximumCount) ||
      input.maximumCount < 1 ||
      input.maximumCount > 1024
    )
      throw new RangeError("maximumCount is out of range");
    const result = await this.pool.query<CommitRow>(
      `SELECT certificate_digest, certificate
         FROM ${this.#prefix}collective_agreement_commits
        WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
          AND policy_domain_id = $4 AND slot_id = $5 AND height > $6
        ORDER BY height ASC
        LIMIT $7`,
      [
        ...this.#scope,
        input.policyDomainId,
        input.slotId,
        input.fromHeightExclusive,
        input.maximumCount,
      ],
    );
    const commits = await Promise.all(
      result.rows.map((row) =>
        decodeCommit(row.certificate, this.options.crypto),
      ),
    );
    if (commits.some((commit) => !commit))
      throw new Error("stored_agreement_commit_invalid");
    return Object.freeze(commits as CollectiveAgreementCommitCertificateV1[]);
  }

  async #localVote(
    client: PoolClient,
    input: Parameters<CollectiveAgreementRepositoryV1["recordLocalVote"]>[0],
  ): Promise<VoteRow | undefined> {
    const coordinate = input.coordinate;
    const result = await client.query<VoteRow>(
      `SELECT proposal_id, value_digest, vote
         FROM ${this.#prefix}collective_agreement_local_votes
        WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
          AND policy_domain_id = $4 AND slot_id = $5 AND height = $6
          AND round = $7 AND phase = $8`,
      [
        ...this.#scope,
        coordinate.policyDomainId,
        coordinate.slotId,
        coordinate.height,
        coordinate.round,
        input.phase,
      ],
    );
    return result.rows[0];
  }

  async #transaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const value = await operation(client);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original failure.
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

async function decodeVote(
  value: unknown,
  crypto?: Crypto,
): Promise<SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementVotePayloadV1> | null> {
  const vote =
    await validateSignedCollectiveAgreementEnvelopeV1<CollectiveAgreementVotePayloadV1>(
      value,
      crypto,
    );
  return vote?.payload.type === "agreement.vote" ? vote : null;
}

function decodeCommit(
  value: unknown,
  crypto?: Crypto,
): Promise<CollectiveAgreementCommitCertificateV1 | null> {
  return validateCollectiveAgreementCommitCertificateShapeV1(value, crypto);
}

function safe(value: string | number): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || parsed < 0)
    throw new Error("stored_integer_invalid");
  return parsed;
}
