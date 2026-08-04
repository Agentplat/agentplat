import {
  validateCollectiveMembershipCertificateShapeV1,
  validateCollectiveMembershipConfigurationV1,
  validateSignedCollectiveMembershipEnvelopeV1,
} from "@agentplat/collective-membership";
import type {
  CollectiveMembershipCertificateV1,
  CollectiveMembershipConfigurationV1,
  CollectiveMembershipRepositoryV1,
  CollectiveMembershipVotePayloadV1,
  SignedCollectiveMembershipEnvelopeV1,
} from "@agentplat/collective-membership";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool, PoolClient } from "pg";

export interface PostgresCollectiveMembershipRepositoryOptionsV1 {
  readonly schema?: string;
  readonly tenantId: string;
  readonly meshId: string;
  readonly peerId: string;
  readonly policyDomainId: string;
}

interface HeadRow {
  readonly current_epoch: string | number;
  readonly current_configuration_digest: string;
}

/** PostgreSQL state for one independently hosted membership voter. */
export class PostgresCollectiveMembershipRepositoryV1 implements CollectiveMembershipRepositoryV1 {
  readonly #prefix: string;
  readonly #scope: readonly [string, string, string, string];

  constructor(
    readonly pool: Pool,
    readonly options: PostgresCollectiveMembershipRepositoryOptionsV1,
  ) {
    if (
      !pool ||
      !options?.tenantId ||
      !options.meshId ||
      !options.peerId ||
      !options.policyDomainId
    )
      throw new TypeError("PostgreSQL membership repository scope is required");
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

  initialize(
    configuration: CollectiveMembershipConfigurationV1,
  ): Promise<void> {
    const valid = validateCollectiveMembershipConfigurationV1(configuration);
    if (!valid || valid.epoch !== 1)
      return Promise.reject(new TypeError("invalid_initial_configuration"));
    return this.#transaction(async (client) => {
      await client.query(
        `INSERT INTO ${this.#prefix}collective_membership_heads
          (tenant_id, mesh_id, peer_id, policy_domain_id, current_epoch,
           current_configuration_digest)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [...this.#scope, valid.epoch, valid.configurationDigest],
      );
      const head = await this.#lockHead(client);
      if (
        head.currentEpoch !== valid.epoch ||
        head.currentConfigurationDigest !== valid.configurationDigest
      )
        throw new Error("membership_initialization_conflict");
      await this.#insertConfiguration(client, valid);
    });
  }

  async configurations(): Promise<
    readonly CollectiveMembershipConfigurationV1[]
  > {
    const result = await this.pool.query<{ configuration: unknown }>(
      `SELECT configuration
         FROM ${this.#prefix}collective_membership_configurations
        WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
          AND policy_domain_id = $4
        ORDER BY epoch`,
      [...this.#scope],
    );
    return Object.freeze(
      result.rows.map(({ configuration }) => {
        const valid =
          validateCollectiveMembershipConfigurationV1(configuration);
        if (!valid) throw new Error("membership_configuration_corrupt");
        return valid;
      }),
    );
  }

  voteTransition(input: {
    readonly fromEpoch: number;
    readonly proposalDigest: string;
    readonly requestMessageId: string;
    readonly create: () => Promise<
      SignedCollectiveMembershipEnvelopeV1<CollectiveMembershipVotePayloadV1>
    >;
  }): Promise<SignedCollectiveMembershipEnvelopeV1<CollectiveMembershipVotePayloadV1> | null> {
    return this.#transaction(async (client) => {
      const duplicate = await this.#loadResponse(
        client,
        input.requestMessageId,
      );
      if (duplicate) return duplicate;
      await client.query(
        `INSERT INTO ${this.#prefix}collective_membership_vote_slots
          (tenant_id, mesh_id, peer_id, policy_domain_id, from_epoch,
           proposal_digest)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [...this.#scope, input.fromEpoch, input.proposalDigest],
      );
      const slot = await client.query<{ proposal_digest: string }>(
        `SELECT proposal_digest
           FROM ${this.#prefix}collective_membership_vote_slots
          WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
            AND policy_domain_id = $4 AND from_epoch = $5
          FOR UPDATE`,
        [...this.#scope, input.fromEpoch],
      );
      if (slot.rows[0]?.proposal_digest !== input.proposalDigest) return null;
      const afterLock = await this.#loadResponse(
        client,
        input.requestMessageId,
      );
      if (afterLock) return afterLock;
      const response = await input.create();
      const valid =
        validateSignedCollectiveMembershipEnvelopeV1<CollectiveMembershipVotePayloadV1>(
          response,
        );
      if (!valid || valid.payload.type !== "membership.transition.vote")
        throw new TypeError("invalid_membership_vote_response");
      await client.query(
        `INSERT INTO ${this.#prefix}collective_membership_responses
          (tenant_id, mesh_id, peer_id, policy_domain_id, request_message_id,
           response_message_id, response)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          ...this.#scope,
          input.requestMessageId,
          valid.messageId,
          JSON.stringify(valid),
        ],
      );
      return valid;
    });
  }

  commitTransition(input: {
    readonly expectedEpoch: number;
    readonly certificate: CollectiveMembershipCertificateV1;
  }): Promise<boolean> {
    const certificate = validateCollectiveMembershipCertificateShapeV1(
      input.certificate,
    );
    if (!certificate) return Promise.resolve(false);
    return this.#transaction(async (client) => {
      const head = await this.#lockHead(client);
      const next = certificate.proposal.nextConfiguration;
      if (
        head.currentEpoch === next.epoch &&
        head.currentConfigurationDigest === next.configurationDigest
      ) {
        await this.#saveCertificate(client, certificate);
        return true;
      }
      if (
        head.currentEpoch !== input.expectedEpoch ||
        next.epoch !== head.currentEpoch + 1 ||
        next.previousConfigurationDigest !== head.currentConfigurationDigest
      )
        return false;
      await this.#insertConfiguration(client, next);
      await this.#saveCertificate(client, certificate);
      await client.query(
        `UPDATE ${this.#prefix}collective_membership_heads
            SET current_epoch = $5, current_configuration_digest = $6,
                updated_at = transaction_timestamp()
          WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
            AND policy_domain_id = $4`,
        [...this.#scope, next.epoch, next.configurationDigest],
      );
      return true;
    });
  }

  saveCertificate(
    certificate: CollectiveMembershipCertificateV1,
  ): Promise<void> {
    const valid = validateCollectiveMembershipCertificateShapeV1(certificate);
    if (!valid)
      return Promise.reject(new TypeError("invalid_membership_certificate"));
    return this.#transaction((client) => this.#saveCertificate(client, valid));
  }

  async getCertificate(
    certificateId: string,
  ): Promise<CollectiveMembershipCertificateV1 | undefined> {
    const result = await this.pool.query<{ certificate: unknown }>(
      `SELECT certificate
         FROM ${this.#prefix}collective_membership_certificates
        WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
          AND policy_domain_id = $4 AND certificate_id = $5`,
      [...this.#scope, certificateId],
    );
    const valid = validateCollectiveMembershipCertificateShapeV1(
      result.rows[0]?.certificate,
    );
    return valid ?? undefined;
  }

  async #lockHead(client: PoolClient): Promise<{
    readonly currentEpoch: number;
    readonly currentConfigurationDigest: string;
  }> {
    const result = await client.query<HeadRow>(
      `SELECT current_epoch, current_configuration_digest
         FROM ${this.#prefix}collective_membership_heads
        WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
          AND policy_domain_id = $4
        FOR UPDATE`,
      [...this.#scope],
    );
    const row = result.rows[0];
    if (!row) throw new Error("membership_not_initialized");
    return Object.freeze({
      currentEpoch: positiveInteger(row.current_epoch),
      currentConfigurationDigest: row.current_configuration_digest,
    });
  }

  async #insertConfiguration(
    client: PoolClient,
    configuration: CollectiveMembershipConfigurationV1,
  ): Promise<void> {
    const result = await client.query(
      `INSERT INTO ${this.#prefix}collective_membership_configurations
        (tenant_id, mesh_id, peer_id, policy_domain_id, epoch,
         configuration_digest, previous_configuration_digest, configuration)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT DO NOTHING`,
      [
        ...this.#scope,
        configuration.epoch,
        configuration.configurationDigest,
        configuration.previousConfigurationDigest,
        JSON.stringify(configuration),
      ],
    );
    if ((result.rowCount ?? 0) > 0) return;
    const existing = await client.query<{ configuration_digest: string }>(
      `SELECT configuration_digest
         FROM ${this.#prefix}collective_membership_configurations
        WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
          AND policy_domain_id = $4 AND epoch = $5`,
      [...this.#scope, configuration.epoch],
    );
    if (
      existing.rows[0]?.configuration_digest !==
      configuration.configurationDigest
    )
      throw new Error("membership_configuration_conflict");
  }

  async #saveCertificate(
    client: PoolClient,
    certificate: CollectiveMembershipCertificateV1,
  ): Promise<void> {
    const result = await client.query(
      `INSERT INTO ${this.#prefix}collective_membership_certificates
        (tenant_id, mesh_id, peer_id, policy_domain_id, certificate_id,
         certificate_digest, from_epoch, to_epoch, certificate)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       ON CONFLICT DO NOTHING`,
      [
        ...this.#scope,
        certificate.certificateId,
        certificate.certificateDigest,
        certificate.proposal.fromEpoch,
        certificate.proposal.toEpoch,
        JSON.stringify(certificate),
      ],
    );
    if ((result.rowCount ?? 0) > 0) return;
    const existing = await client.query<{ certificate_digest: string }>(
      `SELECT certificate_digest
         FROM ${this.#prefix}collective_membership_certificates
        WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
          AND policy_domain_id = $4 AND certificate_id = $5`,
      [...this.#scope, certificate.certificateId],
    );
    if (existing.rows[0]?.certificate_digest !== certificate.certificateDigest)
      throw new Error("membership_certificate_conflict");
  }

  async #loadResponse(
    client: PoolClient,
    requestMessageId: string,
  ): Promise<SignedCollectiveMembershipEnvelopeV1<CollectiveMembershipVotePayloadV1> | null> {
    const result = await client.query<{ response: unknown }>(
      `SELECT response
         FROM ${this.#prefix}collective_membership_responses
        WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
          AND policy_domain_id = $4 AND request_message_id = $5`,
      [...this.#scope, requestMessageId],
    );
    if (!result.rows[0]) return null;
    const valid =
      validateSignedCollectiveMembershipEnvelopeV1<CollectiveMembershipVotePayloadV1>(
        result.rows[0].response,
      );
    if (!valid || valid.payload.type !== "membership.transition.vote")
      throw new Error("membership_response_corrupt");
    return valid;
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

function positiveInteger(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1)
    throw new Error("membership_epoch_out_of_range");
  return parsed;
}
