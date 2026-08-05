import {
  validatePlanningArtifactReplicationCertificateShapeV1,
  validateSignedPlanningArtifactReplicationEnvelopeV1,
  type PlanningArtifactCertificateStoredPayloadV1,
  type PlanningArtifactReplicaStoredPayloadV1,
  type PlanningArtifactReplicationCertificateV1,
  type PlanningArtifactReplicationEvidenceRepositoryV1,
  type SignedPlanningArtifactReplicationEnvelopeV1,
} from "@agentplat/planning-artifacts";
import { canonicalizeMeshJsonBytes } from "@agentplat/mesh-protocol";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool } from "pg";

export interface PostgresPlanningArtifactReplicationEvidenceOptionsV1 {
  readonly schema?: string;
  readonly tenantId: string;
  readonly meshId: string;
  readonly peerId: string;
  readonly instanceId: string;
  readonly policyDomainId: string;
  readonly maximumEvidenceBytes?: number;
}

interface JsonRow {
  readonly value: unknown;
}

/** Immutable instance-scoped receipt, certificate and acknowledgement custody. */
export class PostgresPlanningArtifactReplicationEvidenceRepositoryV1 implements PlanningArtifactReplicationEvidenceRepositoryV1 {
  readonly #prefix: string;
  readonly #scope: readonly [string, string, string, string, string];
  readonly #maximumEvidenceBytes: number;

  constructor(
    readonly pool: Pool,
    readonly options: PostgresPlanningArtifactReplicationEvidenceOptionsV1,
  ) {
    if (
      !pool ||
      !options?.tenantId ||
      !options.meshId ||
      !options.peerId ||
      !options.instanceId ||
      !options.policyDomainId
    )
      throw new TypeError(
        "PostgreSQL planning artifact replication scope is required",
      );
    const maximum = options.maximumEvidenceBytes ?? 1_048_576;
    if (
      !Number.isSafeInteger(maximum) ||
      maximum < 1_024 ||
      maximum > 1_048_576
    )
      throw new RangeError(
        "PostgreSQL planning artifact replication byte limit is invalid",
      );
    this.#maximumEvidenceBytes = maximum;
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
      options.instanceId,
      options.policyDomainId,
    ]);
  }

  async putReceipt(
    input: SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactReplicaStoredPayloadV1>,
  ): Promise<
    SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactReplicaStoredPayloadV1>
  > {
    const receipt = this.#receipt(input);
    const result = await this.pool.query(
      `INSERT INTO ${this.#prefix}planning_artifact_replica_receipts
        (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id,
         request_message_id, fragment_digest, artifact_digest,
         membership_configuration_digest, receipt)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
       ON CONFLICT DO NOTHING`,
      [
        ...this.#scope,
        receipt.payload.requestMessageId,
        receipt.payload.fragmentDigest,
        receipt.payload.artifactDigest,
        receipt.membershipConfigurationDigest,
        JSON.stringify(receipt),
      ],
    );
    if ((result.rowCount ?? 0) === 1) return receipt;
    const existing = await this.getReceipt(receipt.payload.requestMessageId);
    if (!existing || !sameJson(existing, receipt))
      throw new Error("planning_artifact_replica_receipt_conflict");
    return existing;
  }

  async getReceipt(
    requestMessageId: string,
  ): Promise<SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactReplicaStoredPayloadV1> | null> {
    const result = await this.pool.query<JsonRow>(
      `SELECT receipt AS value
         FROM ${this.#prefix}planning_artifact_replica_receipts
        WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
          AND instance_id = $4 AND policy_domain_id = $5
          AND request_message_id = $6`,
      [...this.#scope, identifier(requestMessageId)],
    );
    return result.rows[0] ? this.#receipt(result.rows[0].value) : null;
  }

  async putCertificate(
    input: PlanningArtifactReplicationCertificateV1,
  ): Promise<PlanningArtifactReplicationCertificateV1> {
    const certificate = this.#certificate(input);
    const result = await this.pool.query(
      `INSERT INTO ${this.#prefix}planning_artifact_replication_certificates
        (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id,
         certificate_id, fragment_digest, artifact_digest,
         membership_configuration_digest, certificate)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
       ON CONFLICT DO NOTHING`,
      [
        ...this.#scope,
        certificate.certificateId,
        certificate.fragmentDigest,
        certificate.artifactDigest,
        certificate.membershipConfigurationDigest,
        JSON.stringify(certificate),
      ],
    );
    if ((result.rowCount ?? 0) === 1) return certificate;
    const existing = await this.getCertificate({
      fragmentDigest: certificate.fragmentDigest,
      membershipConfigurationDigest: certificate.membershipConfigurationDigest,
    });
    if (!existing || !sameJson(existing, certificate))
      throw new Error("planning_artifact_replication_certificate_conflict");
    return existing;
  }

  async getCertificate(input: {
    readonly fragmentDigest: string;
    readonly membershipConfigurationDigest: string;
  }): Promise<PlanningArtifactReplicationCertificateV1 | null> {
    const result = await this.pool.query<JsonRow>(
      `SELECT certificate AS value
         FROM ${this.#prefix}planning_artifact_replication_certificates
        WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
          AND instance_id = $4 AND policy_domain_id = $5
          AND fragment_digest = $6 AND membership_configuration_digest = $7`,
      [
        ...this.#scope,
        digest(input.fragmentDigest),
        digest(input.membershipConfigurationDigest),
      ],
    );
    return result.rows[0] ? this.#certificate(result.rows[0].value) : null;
  }

  async putCertificateAck(
    input: SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactCertificateStoredPayloadV1>,
  ): Promise<
    SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactCertificateStoredPayloadV1>
  > {
    const acknowledgement = this.#ack(input);
    const result = await this.pool.query(
      `INSERT INTO ${this.#prefix}planning_artifact_certificate_acks
        (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id,
         request_message_id, certificate_id, artifact_digest, acknowledgement)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       ON CONFLICT DO NOTHING`,
      [
        ...this.#scope,
        acknowledgement.payload.requestMessageId,
        acknowledgement.payload.certificateId,
        acknowledgement.payload.artifactDigest,
        JSON.stringify(acknowledgement),
      ],
    );
    if ((result.rowCount ?? 0) === 1) return acknowledgement;
    const existing = await this.getCertificateAck(
      acknowledgement.payload.requestMessageId,
    );
    if (!existing || !sameJson(existing, acknowledgement))
      throw new Error("planning_artifact_certificate_ack_conflict");
    return existing;
  }

  async getCertificateAck(
    requestMessageId: string,
  ): Promise<SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactCertificateStoredPayloadV1> | null> {
    const result = await this.pool.query<JsonRow>(
      `SELECT acknowledgement AS value
         FROM ${this.#prefix}planning_artifact_certificate_acks
        WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
          AND instance_id = $4 AND policy_domain_id = $5
          AND request_message_id = $6`,
      [...this.#scope, identifier(requestMessageId)],
    );
    return result.rows[0] ? this.#ack(result.rows[0].value) : null;
  }

  #receipt(
    input: unknown,
  ): SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactReplicaStoredPayloadV1> {
    const receipt =
      validateSignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactReplicaStoredPayloadV1>(
        input,
      );
    if (
      !receipt ||
      receipt.payload.type !== "artifact.replica.stored" ||
      !this.#scopeMatches(receipt)
    )
      throw new TypeError("planning_artifact_replica_receipt_invalid");
    this.#bounded(receipt);
    return receipt;
  }

  #certificate(input: unknown): PlanningArtifactReplicationCertificateV1 {
    const certificate =
      validatePlanningArtifactReplicationCertificateShapeV1(input);
    if (
      !certificate ||
      certificate.tenantId !== this.options.tenantId ||
      certificate.meshId !== this.options.meshId ||
      certificate.policyDomainId !== this.options.policyDomainId
    )
      throw new TypeError("planning_artifact_replication_certificate_invalid");
    this.#bounded(certificate);
    return certificate;
  }

  #ack(
    input: unknown,
  ): SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactCertificateStoredPayloadV1> {
    const acknowledgement =
      validateSignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactCertificateStoredPayloadV1>(
        input,
      );
    if (
      !acknowledgement ||
      acknowledgement.payload.type !== "artifact.certificate.stored" ||
      !this.#scopeMatches(acknowledgement)
    )
      throw new TypeError("planning_artifact_certificate_ack_invalid");
    this.#bounded(acknowledgement);
    return acknowledgement;
  }

  #scopeMatches(input: {
    readonly tenantId: string;
    readonly meshId: string;
    readonly policyDomainId: string;
    readonly senderPeerId: string;
    readonly senderInstanceId: string;
    readonly audiencePeerId: string;
    readonly audienceInstanceId: string;
  }): boolean {
    return (
      input.tenantId === this.options.tenantId &&
      input.meshId === this.options.meshId &&
      input.policyDomainId === this.options.policyDomainId &&
      ((input.senderPeerId === this.options.peerId &&
        input.senderInstanceId === this.options.instanceId) ||
        (input.audiencePeerId === this.options.peerId &&
          input.audienceInstanceId === this.options.instanceId))
    );
  }

  #bounded(input: unknown): void {
    const canonical = canonicalizeMeshJsonBytes(input);
    if (
      !canonical.ok ||
      canonical.value.byteLength > this.#maximumEvidenceBytes
    )
      throw new RangeError(
        "planning_artifact_replication_evidence_exceeds_byte_limit",
      );
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  const a = canonicalizeMeshJsonBytes(left);
  const b = canonicalizeMeshJsonBytes(right);
  if (!a.ok || !b.ok || a.value.byteLength !== b.value.byteLength) return false;
  return a.value.every((byte, index) => byte === b.value[index]);
}

function identifier(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u.test(value))
    throw new TypeError("planning_artifact_replication_identifier_invalid");
  return value;
}

function digest(value: string): string {
  if (!/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError("planning_artifact_replication_digest_invalid");
  return value;
}
