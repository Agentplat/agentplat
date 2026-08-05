import {
  validateExecutionCheckpointArtifactV1,
  validateExecutionCheckpointCertificateV1,
  type ExecutionCheckpointArtifactRepositoryV1,
  type ExecutionCheckpointArtifactV1,
  type ExecutionCheckpointEvidenceRepositoryV1,
  type ExecutionCheckpointReplicationCertificateV1,
  type ExecutionCheckpointResponsePayloadV1,
  type SignedExecutionCheckpointEnvelopeV1,
} from "@agentplat/collective-runtime/checkpoints";
import { canonicalizeMeshJsonBytes } from "@agentplat/mesh-protocol";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool } from "pg";

export interface PostgresExecutionCheckpointRepositoryOptionsV1 {
  readonly schema?: string;
  readonly tenantId: string;
  readonly meshId: string;
  readonly peerId: string;
  readonly instanceId: string;
  readonly policyDomainId: string;
  readonly maximumArtifactBytes?: number;
  readonly maximumEvidenceBytes?: number;
}

interface JsonRow {
  readonly value: unknown;
}

/** Immutable, instance-scoped checkpoint artifacts and availability evidence. */
export class PostgresExecutionCheckpointRepositoryV1
  implements
    ExecutionCheckpointArtifactRepositoryV1,
    ExecutionCheckpointEvidenceRepositoryV1
{
  readonly #prefix: string;
  readonly #scope: readonly [string, string, string, string, string];
  readonly #maximumArtifactBytes: number;
  readonly #maximumEvidenceBytes: number;

  constructor(
    readonly pool: Pool,
    readonly options: PostgresExecutionCheckpointRepositoryOptionsV1,
  ) {
    if (
      !pool ||
      !options?.tenantId ||
      !options.meshId ||
      !options.peerId ||
      !options.instanceId ||
      !options.policyDomainId
    )
      throw new TypeError("PostgreSQL execution checkpoint scope is required");
    this.#maximumArtifactBytes = limit(
      options.maximumArtifactBytes,
      16 * 1_024 * 1_024,
    );
    this.#maximumEvidenceBytes = limit(
      options.maximumEvidenceBytes,
      4 * 1_024 * 1_024,
    );
    this.#prefix = `${quotePostgresIdentifier(normalizePostgresIdentifier(options.schema ?? defaultPostgresSchema, "schema"))}.`;
    this.#scope = Object.freeze([
      options.tenantId,
      options.meshId,
      options.peerId,
      options.instanceId,
      options.policyDomainId,
    ]);
  }

  async put(
    input: ExecutionCheckpointArtifactV1,
  ): Promise<ExecutionCheckpointArtifactV1> {
    const artifact = await validateExecutionCheckpointArtifactV1(
      input,
      this.#maximumArtifactBytes,
    );
    if (!artifact || !this.#scopeMatches(artifact.manifest))
      throw new TypeError("execution_checkpoint_artifact_invalid");
    bounded(artifact, this.#maximumArtifactBytes);
    const result = await this.pool.query(
      `INSERT INTO ${this.#prefix}execution_checkpoint_artifacts
        (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id,
         checkpoint_id, artifact_digest, content_reference, artifact)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
       ON CONFLICT DO NOTHING`,
      [
        ...this.#scope,
        artifact.manifest.checkpointId,
        artifact.artifactDigest,
        artifact.manifest.contentReference,
        JSON.stringify(artifact),
      ],
    );
    if ((result.rowCount ?? 0) === 1) return artifact;
    const existing = await this.get(artifact.manifest.checkpointId);
    if (!existing || !same(existing, artifact))
      throw new Error("execution_checkpoint_artifact_conflict");
    return existing;
  }

  async get(
    checkpointId: string,
  ): Promise<ExecutionCheckpointArtifactV1 | null> {
    const result = await this.pool.query<JsonRow>(
      `SELECT artifact AS value FROM ${this.#prefix}execution_checkpoint_artifacts
       WHERE tenant_id=$1 AND mesh_id=$2 AND peer_id=$3 AND instance_id=$4
         AND policy_domain_id=$5 AND checkpoint_id=$6`,
      [...this.#scope, identifier(checkpointId)],
    );
    if (!result.rows[0]) return null;
    const artifact = await validateExecutionCheckpointArtifactV1(
      result.rows[0].value,
      this.#maximumArtifactBytes,
    );
    if (!artifact || !this.#scopeMatches(artifact.manifest))
      throw new TypeError("execution_checkpoint_artifact_invalid");
    return artifact;
  }

  async putReceipt(input: Receipt): Promise<Receipt> {
    const receipt = this.#receipt(input);
    const result = await this.pool.query(
      `INSERT INTO ${this.#prefix}execution_checkpoint_receipts
        (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id,
         request_message_id, checkpoint_id, artifact_digest, receipt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
       ON CONFLICT DO NOTHING`,
      [
        ...this.#scope,
        receipt.payload.requestMessageId,
        receipt.payload.checkpointId,
        receipt.payload.artifactDigest,
        JSON.stringify(receipt),
      ],
    );
    if ((result.rowCount ?? 0) === 1) return receipt;
    const existing = await this.getReceipt(receipt.payload.requestMessageId);
    if (!existing || !same(existing, receipt))
      throw new Error("execution_checkpoint_receipt_conflict");
    return existing;
  }

  async getReceipt(messageId: string): Promise<Receipt | null> {
    const result = await this.pool.query<JsonRow>(
      `SELECT receipt AS value FROM ${this.#prefix}execution_checkpoint_receipts
       WHERE tenant_id=$1 AND mesh_id=$2 AND peer_id=$3 AND instance_id=$4
         AND policy_domain_id=$5 AND request_message_id=$6`,
      [...this.#scope, identifier(messageId)],
    );
    return result.rows[0] ? this.#receipt(result.rows[0].value) : null;
  }

  async putCertificate(
    input: ExecutionCheckpointReplicationCertificateV1,
  ): Promise<ExecutionCheckpointReplicationCertificateV1> {
    const certificate = await this.#certificate(input);
    const result = await this.pool.query(
      `INSERT INTO ${this.#prefix}execution_checkpoint_certificates
        (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id,
         checkpoint_id, certificate_id, certificate_digest, artifact_digest, certificate)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
       ON CONFLICT DO NOTHING`,
      [
        ...this.#scope,
        certificate.checkpointId,
        certificate.certificateId,
        certificate.certificateDigest,
        certificate.artifactDigest,
        JSON.stringify(certificate),
      ],
    );
    if ((result.rowCount ?? 0) === 1) return certificate;
    const existing = await this.getCertificate(certificate.checkpointId);
    if (!existing || !same(existing, certificate))
      throw new Error("execution_checkpoint_certificate_conflict");
    return existing;
  }

  async getCertificate(
    checkpointId: string,
  ): Promise<ExecutionCheckpointReplicationCertificateV1 | null> {
    const result = await this.pool.query<JsonRow>(
      `SELECT certificate AS value FROM ${this.#prefix}execution_checkpoint_certificates
       WHERE tenant_id=$1 AND mesh_id=$2 AND peer_id=$3 AND instance_id=$4
         AND policy_domain_id=$5 AND checkpoint_id=$6`,
      [...this.#scope, identifier(checkpointId)],
    );
    return result.rows[0] ? this.#certificate(result.rows[0].value) : null;
  }

  async putCertificateAck(input: Ack): Promise<Ack> {
    const acknowledgement = this.#ack(input);
    const result = await this.pool.query(
      `INSERT INTO ${this.#prefix}execution_checkpoint_certificate_acks
        (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id,
         request_message_id, checkpoint_id, certificate_id, acknowledgement)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
       ON CONFLICT DO NOTHING`,
      [
        ...this.#scope,
        acknowledgement.payload.requestMessageId,
        acknowledgement.payload.checkpointId,
        acknowledgement.payload.certificateId,
        JSON.stringify(acknowledgement),
      ],
    );
    if ((result.rowCount ?? 0) === 1) return acknowledgement;
    const existing = await this.getCertificateAck(
      acknowledgement.payload.requestMessageId,
    );
    if (!existing || !same(existing, acknowledgement))
      throw new Error("execution_checkpoint_ack_conflict");
    return existing;
  }

  async getCertificateAck(messageId: string): Promise<Ack | null> {
    const result = await this.pool.query<JsonRow>(
      `SELECT acknowledgement AS value FROM ${this.#prefix}execution_checkpoint_certificate_acks
       WHERE tenant_id=$1 AND mesh_id=$2 AND peer_id=$3 AND instance_id=$4
         AND policy_domain_id=$5 AND request_message_id=$6`,
      [...this.#scope, identifier(messageId)],
    );
    return result.rows[0] ? this.#ack(result.rows[0].value) : null;
  }

  #receipt(input: unknown): Receipt {
    if (
      !envelope(input) ||
      input.payload.type !== "checkpoint.artifact.stored" ||
      !this.#scopeMatches(input)
    )
      throw new TypeError("execution_checkpoint_receipt_invalid");
    bounded(input, this.#maximumEvidenceBytes);
    return input as Receipt;
  }
  async #certificate(
    input: unknown,
  ): Promise<ExecutionCheckpointReplicationCertificateV1> {
    const certificate = await validateExecutionCheckpointCertificateV1(input);
    if (!certificate || !this.#scopeMatches(certificate))
      throw new TypeError("execution_checkpoint_certificate_invalid");
    bounded(certificate, this.#maximumEvidenceBytes);
    return certificate;
  }
  #ack(input: unknown): Ack {
    if (
      !envelope(input) ||
      input.payload.type !== "checkpoint.certificate.stored" ||
      !this.#scopeMatches(input)
    )
      throw new TypeError("execution_checkpoint_ack_invalid");
    bounded(input, this.#maximumEvidenceBytes);
    return input as Ack;
  }
  #scopeMatches(input: {
    readonly tenantId: string;
    readonly meshId: string;
    readonly policyDomainId: string;
  }): boolean {
    return (
      input.tenantId === this.options.tenantId &&
      input.meshId === this.options.meshId &&
      input.policyDomainId === this.options.policyDomainId
    );
  }
}

type Receipt = SignedExecutionCheckpointEnvelopeV1<
  Extract<
    ExecutionCheckpointResponsePayloadV1,
    { readonly type: "checkpoint.artifact.stored" }
  >
>;
type Ack = SignedExecutionCheckpointEnvelopeV1<
  Extract<
    ExecutionCheckpointResponsePayloadV1,
    { readonly type: "checkpoint.certificate.stored" }
  >
>;
function envelope(
  value: unknown,
): value is SignedExecutionCheckpointEnvelopeV1<ExecutionCheckpointResponsePayloadV1> {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "payload" in value &&
    value.payload &&
    typeof value.payload === "object" &&
    "type" in value.payload,
  );
}
function bounded(value: unknown, maximum: number): void {
  const result = canonicalizeMeshJsonBytes(value);
  if (!result.ok || result.value.byteLength > maximum)
    throw new RangeError("execution_checkpoint_postgres_value_too_large");
}
function limit(value: number | undefined, fallback: number): number {
  const result = value ?? fallback;
  if (
    !Number.isSafeInteger(result) ||
    result < 1_024 ||
    result > 32 * 1_024 * 1_024
  )
    throw new RangeError("execution_checkpoint_postgres_limit_invalid");
  return result;
}
function identifier(value: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 256)
    throw new TypeError("execution_checkpoint_identifier_invalid");
  return value;
}
function same(left: unknown, right: unknown): boolean {
  const leftBytes = canonicalizeMeshJsonBytes(left);
  const rightBytes = canonicalizeMeshJsonBytes(right);
  if (!leftBytes.ok || !rightBytes.ok) return false;
  if (leftBytes.value.byteLength !== rightBytes.value.byteLength) return false;
  return leftBytes.value.every(
    (value, index) => value === rightBytes.value[index],
  );
}
