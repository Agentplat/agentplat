import {
  compareCollectiveQuorumBallotsV1,
  sameCollectiveQuorumRecoveryValueV1,
  validateSignedCollectiveQuorumEnvelopeV1,
} from "@agentplat/collective-quorum";
import type {
  CollectiveQuorumAcceptedRecoveryValueV1,
  CollectiveQuorumAssignmentAttestationPayloadV1,
  CollectiveQuorumBallotV1,
  CollectiveQuorumCertificateV1,
  CollectiveQuorumRecoveryAcceptedPayloadV1,
  CollectiveQuorumRecoveryPromisePayloadV1,
  CollectiveQuorumRecoveryValueV1,
  CollectiveQuorumRepositoryV1,
  SignedCollectiveQuorumEnvelopeV1,
} from "@agentplat/collective-quorum";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool, PoolClient } from "pg";

export interface PostgresCollectiveQuorumRepositoryOptionsV1 {
  readonly schema?: string;
  readonly tenantId: string;
  readonly meshId: string;
  readonly peerId: string;
  readonly policyDomainId: string;
}

interface RecoveryRow {
  readonly promised_counter: string | number | null;
  readonly promised_proposer_peer_id: string | null;
  readonly accepted_counter: string | number | null;
  readonly accepted_proposer_peer_id: string | null;
  readonly accepted_value: unknown | null;
}

/** PostgreSQL acceptor state scoped to one independently running peer. */
export class PostgresCollectiveQuorumRepositoryV1 implements CollectiveQuorumRepositoryV1 {
  readonly #prefix: string;
  readonly #scope: readonly [string, string, string, string];

  constructor(
    readonly pool: Pool,
    readonly options: PostgresCollectiveQuorumRepositoryOptionsV1,
  ) {
    if (
      !pool ||
      !options?.tenantId ||
      !options.meshId ||
      !options.peerId ||
      !options.policyDomainId
    )
      throw new TypeError("PostgreSQL quorum repository scope is required");
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
      options.policyDomainId,
    ]);
  }

  nextBallot(input: {
    readonly scopeDigest: string;
    readonly proposerPeerId: string;
  }): Promise<CollectiveQuorumBallotV1> {
    return this.#transaction(async (client) => {
      const acceptor = await this.#lockAcceptor(client, input.scopeDigest);
      await client.query(
        `INSERT INTO ${this.#prefix}collective_quorum_ballot_counters
          (tenant_id, mesh_id, peer_id, policy_domain_id, scope_digest, proposer_peer_id, counter)
         VALUES ($1, $2, $3, $4, $5, $6, 0)
         ON CONFLICT DO NOTHING`,
        [...this.#scope, input.scopeDigest, input.proposerPeerId],
      );
      const counterResult = await client.query<{ counter: string | number }>(
        `SELECT counter
           FROM ${this.#prefix}collective_quorum_ballot_counters
          WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
            AND policy_domain_id = $4 AND scope_digest = $5
            AND proposer_peer_id = $6
          FOR UPDATE`,
        [...this.#scope, input.scopeDigest, input.proposerPeerId],
      );
      const prior = safeInteger(counterResult.rows[0]?.counter ?? 0);
      const counter =
        Math.max(
          prior,
          acceptor.promisedBallot?.counter ?? 0,
          acceptor.accepted?.ballot.counter ?? 0,
        ) + 1;
      await client.query(
        `UPDATE ${this.#prefix}collective_quorum_ballot_counters
            SET counter = $7
          WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
            AND policy_domain_id = $4 AND scope_digest = $5
            AND proposer_peer_id = $6`,
        [...this.#scope, input.scopeDigest, input.proposerPeerId, counter],
      );
      return Object.freeze({ counter, proposerPeerId: input.proposerPeerId });
    });
  }

  attestAssignment(input: {
    readonly assignmentSlotDigest: string;
    readonly valueDigest: string;
    readonly requestMessageId: string;
    readonly create: () => Promise<
      SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumAssignmentAttestationPayloadV1>
    >;
  }): Promise<SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumAssignmentAttestationPayloadV1> | null> {
    return this.#transaction(async (client) => {
      const duplicate =
        await this.#loadResponse<CollectiveQuorumAssignmentAttestationPayloadV1>(
          client,
          input.requestMessageId,
          "assignment.confirm.attestation",
        );
      if (duplicate) return duplicate;
      await client.query(
        `INSERT INTO ${this.#prefix}collective_quorum_assignment_slots
          (tenant_id, mesh_id, peer_id, policy_domain_id, assignment_slot_digest, value_digest)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [...this.#scope, input.assignmentSlotDigest, input.valueDigest],
      );
      const slot = await client.query<{ value_digest: string }>(
        `SELECT value_digest
           FROM ${this.#prefix}collective_quorum_assignment_slots
          WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
            AND policy_domain_id = $4 AND assignment_slot_digest = $5
          FOR UPDATE`,
        [...this.#scope, input.assignmentSlotDigest],
      );
      if (slot.rows[0]?.value_digest !== input.valueDigest) return null;
      const afterLock =
        await this.#loadResponse<CollectiveQuorumAssignmentAttestationPayloadV1>(
          client,
          input.requestMessageId,
          "assignment.confirm.attestation",
        );
      if (afterLock) return afterLock;
      const response = await input.create();
      await this.#insertResponse(client, input.requestMessageId, response);
      return response;
    });
  }

  promiseRecovery(input: {
    readonly scopeDigest: string;
    readonly ballot: CollectiveQuorumBallotV1;
    readonly requestMessageId: string;
    readonly create: (
      accepted: CollectiveQuorumAcceptedRecoveryValueV1 | null,
    ) => Promise<
      SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumRecoveryPromisePayloadV1>
    >;
  }): Promise<SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumRecoveryPromisePayloadV1> | null> {
    return this.#transaction(async (client) => {
      const duplicate =
        await this.#loadResponse<CollectiveQuorumRecoveryPromisePayloadV1>(
          client,
          input.requestMessageId,
          "recovery.promise",
        );
      if (duplicate) return duplicate;
      const state = await this.#lockAcceptor(client, input.scopeDigest);
      if (
        state.promisedBallot &&
        compareCollectiveQuorumBallotsV1(input.ballot, state.promisedBallot) < 0
      )
        return null;
      const afterLock =
        await this.#loadResponse<CollectiveQuorumRecoveryPromisePayloadV1>(
          client,
          input.requestMessageId,
          "recovery.promise",
        );
      if (afterLock) return afterLock;
      const response = await input.create(state.accepted);
      await client.query(
        `UPDATE ${this.#prefix}collective_quorum_recovery_acceptors
            SET promised_counter = $6, promised_proposer_peer_id = $7,
                updated_at = transaction_timestamp()
          WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
            AND policy_domain_id = $4 AND scope_digest = $5`,
        [
          ...this.#scope,
          input.scopeDigest,
          input.ballot.counter,
          input.ballot.proposerPeerId,
        ],
      );
      await this.#insertResponse(client, input.requestMessageId, response);
      return response;
    });
  }

  acceptRecovery(input: {
    readonly scopeDigest: string;
    readonly ballot: CollectiveQuorumBallotV1;
    readonly value: CollectiveQuorumRecoveryValueV1;
    readonly requestMessageId: string;
    readonly create: () => Promise<
      SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumRecoveryAcceptedPayloadV1>
    >;
  }): Promise<SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumRecoveryAcceptedPayloadV1> | null> {
    return this.#transaction(async (client) => {
      const duplicate =
        await this.#loadResponse<CollectiveQuorumRecoveryAcceptedPayloadV1>(
          client,
          input.requestMessageId,
          "recovery.accepted",
        );
      if (duplicate) return duplicate;
      const state = await this.#lockAcceptor(client, input.scopeDigest);
      if (
        state.promisedBallot &&
        compareCollectiveQuorumBallotsV1(input.ballot, state.promisedBallot) < 0
      )
        return null;
      if (
        state.accepted &&
        compareCollectiveQuorumBallotsV1(
          input.ballot,
          state.accepted.ballot,
        ) === 0 &&
        !sameCollectiveQuorumRecoveryValueV1(input.value, state.accepted.value)
      )
        return null;
      const afterLock =
        await this.#loadResponse<CollectiveQuorumRecoveryAcceptedPayloadV1>(
          client,
          input.requestMessageId,
          "recovery.accepted",
        );
      if (afterLock) return afterLock;
      const response = await input.create();
      await client.query(
        `UPDATE ${this.#prefix}collective_quorum_recovery_acceptors
            SET promised_counter = $6, promised_proposer_peer_id = $7,
                accepted_counter = $6, accepted_proposer_peer_id = $7,
                accepted_value = $8::jsonb, updated_at = transaction_timestamp()
          WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
            AND policy_domain_id = $4 AND scope_digest = $5`,
        [
          ...this.#scope,
          input.scopeDigest,
          input.ballot.counter,
          input.ballot.proposerPeerId,
          JSON.stringify(input.value),
        ],
      );
      await this.#insertResponse(client, input.requestMessageId, response);
      return response;
    });
  }

  async saveCertificate(
    certificate: CollectiveQuorumCertificateV1,
  ): Promise<void> {
    const result = await this.pool.query(
      `INSERT INTO ${this.#prefix}collective_quorum_certificates
        (tenant_id, mesh_id, peer_id, policy_domain_id, certificate_id,
         certificate_kind, scope_digest, certificate_digest, certificate)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       ON CONFLICT DO NOTHING`,
      [
        ...this.#scope,
        certificate.certificateId,
        certificate.kind,
        certificate.scopeDigest,
        certificate.certificateDigest,
        JSON.stringify(certificate),
      ],
    );
    if ((result.rowCount ?? 0) > 0) return;
    const existing = await this.pool.query<{ certificate_digest: string }>(
      `SELECT certificate_digest
         FROM ${this.#prefix}collective_quorum_certificates
        WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
          AND policy_domain_id = $4 AND certificate_id = $5`,
      [...this.#scope, certificate.certificateId],
    );
    if (existing.rows[0]?.certificate_digest !== certificate.certificateDigest)
      throw new Error("certificate_conflict");
  }

  async getCertificate(
    certificateId: string,
  ): Promise<CollectiveQuorumCertificateV1 | undefined> {
    const result = await this.pool.query<{ certificate: unknown }>(
      `SELECT certificate
         FROM ${this.#prefix}collective_quorum_certificates
        WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
          AND policy_domain_id = $4 AND certificate_id = $5`,
      [...this.#scope, certificateId],
    );
    return isCertificate(result.rows[0]?.certificate)
      ? result.rows[0]!.certificate
      : undefined;
  }

  async #lockAcceptor(
    client: PoolClient,
    scopeDigest: string,
  ): Promise<{
    readonly promisedBallot: CollectiveQuorumBallotV1 | null;
    readonly accepted: CollectiveQuorumAcceptedRecoveryValueV1 | null;
  }> {
    await client.query(
      `INSERT INTO ${this.#prefix}collective_quorum_recovery_acceptors
        (tenant_id, mesh_id, peer_id, policy_domain_id, scope_digest)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [...this.#scope, scopeDigest],
    );
    const result = await client.query<RecoveryRow>(
      `SELECT promised_counter, promised_proposer_peer_id,
              accepted_counter, accepted_proposer_peer_id, accepted_value
         FROM ${this.#prefix}collective_quorum_recovery_acceptors
        WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
          AND policy_domain_id = $4 AND scope_digest = $5
        FOR UPDATE`,
      [...this.#scope, scopeDigest],
    );
    const row = result.rows[0];
    if (!row) throw new Error("quorum_acceptor_missing");
    const promisedBallot = ballot(
      row.promised_counter,
      row.promised_proposer_peer_id,
    );
    const acceptedBallot = ballot(
      row.accepted_counter,
      row.accepted_proposer_peer_id,
    );
    const acceptedValue = recoveryValue(row.accepted_value);
    if ((acceptedBallot === null) !== (acceptedValue === null))
      throw new Error("quorum_acceptor_corrupt");
    return Object.freeze({
      promisedBallot,
      accepted:
        acceptedBallot && acceptedValue
          ? Object.freeze({ ballot: acceptedBallot, value: acceptedValue })
          : null,
    });
  }

  async #loadResponse<
    TPayload extends
      | CollectiveQuorumAssignmentAttestationPayloadV1
      | CollectiveQuorumRecoveryPromisePayloadV1
      | CollectiveQuorumRecoveryAcceptedPayloadV1,
  >(
    client: PoolClient,
    requestMessageId: string,
    expectedType: TPayload["type"],
  ): Promise<SignedCollectiveQuorumEnvelopeV1<TPayload> | null> {
    const result = await client.query<{
      response: unknown;
      response_type: string;
    }>(
      `SELECT response, response_type
         FROM ${this.#prefix}collective_quorum_responses
        WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
          AND policy_domain_id = $4 AND request_message_id = $5`,
      [...this.#scope, requestMessageId],
    );
    if (!result.rows[0]) return null;
    const response = validateSignedCollectiveQuorumEnvelopeV1<TPayload>(
      result.rows[0].response,
    );
    if (
      !response ||
      response.payload.type !== expectedType ||
      result.rows[0].response_type !== expectedType
    )
      throw new Error("quorum_response_corrupt");
    return response;
  }

  async #insertResponse(
    client: PoolClient,
    requestMessageId: string,
    response: SignedCollectiveQuorumEnvelopeV1<
      | CollectiveQuorumAssignmentAttestationPayloadV1
      | CollectiveQuorumRecoveryPromisePayloadV1
      | CollectiveQuorumRecoveryAcceptedPayloadV1
    >,
  ): Promise<void> {
    await client.query(
      `INSERT INTO ${this.#prefix}collective_quorum_responses
        (tenant_id, mesh_id, peer_id, policy_domain_id, request_message_id,
         response_type, response_message_id, response)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        ...this.#scope,
        requestMessageId,
        response.payload.type,
        response.messageId,
        JSON.stringify(response),
      ],
    );
  }

  async #transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
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

function ballot(
  counter: string | number | null,
  proposerPeerId: string | null,
): CollectiveQuorumBallotV1 | null {
  if (counter === null && proposerPeerId === null) return null;
  if (counter === null || !proposerPeerId)
    throw new Error("quorum_acceptor_corrupt");
  return Object.freeze({
    counter: safeInteger(counter),
    proposerPeerId,
  });
}

function recoveryValue(value: unknown): CollectiveQuorumRecoveryValueV1 | null {
  if (value === null) return null;
  if (
    typeof value !== "object" ||
    value === null ||
    Object.keys(value).sort().join("\u0000") !==
      "selectedAssigneePeerId\u0000selectedProposalId"
  )
    throw new Error("quorum_acceptor_corrupt");
  const record = value as Record<string, unknown>;
  if (
    typeof record.selectedProposalId !== "string" ||
    typeof record.selectedAssigneePeerId !== "string"
  )
    throw new Error("quorum_acceptor_corrupt");
  return Object.freeze({
    selectedProposalId: record.selectedProposalId,
    selectedAssigneePeerId: record.selectedAssigneePeerId,
  });
}

function safeInteger(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0)
    throw new Error("quorum_counter_out_of_range");
  return parsed;
}

function isCertificate(value: unknown): value is CollectiveQuorumCertificateV1 {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === 1 &&
    (record.kind === "assignment_confirmation" ||
      record.kind === "recovery_election") &&
    typeof record.certificateId === "string" &&
    typeof record.scopeDigest === "string" &&
    typeof record.certificateDigest === "string"
  );
}
