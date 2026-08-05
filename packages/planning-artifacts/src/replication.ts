import type {
  PlanningArtifactAvailabilityRequestV1,
  PlanningFragmentRepositoryRecordV1,
  PlanningFragmentRepositoryV1,
} from "@agentplat/collective-planning/mesh";
import {
  createCollectiveSyncRecordV1,
  verifyCollectiveSyncRecordV1,
  type CollectiveSyncDomainAdapterV1,
  type CollectiveSyncRecordV1,
} from "@agentplat/collective-sync";
import type { CollectiveQuorumMembershipBindingV1 } from "@agentplat/collective-quorum";
import { canonicalizeMeshJsonBytes } from "@agentplat/mesh-protocol";

import {
  PLANNING_ARTIFACT_CERTIFICATE_PAYLOAD_TYPE_V1,
  PLANNING_ARTIFACT_CERTIFICATE_SYNC_DOMAIN_V1,
  type CertifiedPlanningArtifactAvailabilityOptionsV2,
  type CertifiedReplicatedPlanningFragmentRepositoryOptionsV2,
  type InMemoryPlanningArtifactReplicationEvidenceOptionsV1,
  type PlanningArtifactAvailabilitySyncAdapterOptionsV2,
  type PlanningArtifactCertificateStoredPayloadV1,
  type PlanningArtifactCertificateSyncPayloadV1,
  type PlanningArtifactReplicaStoredPayloadV1,
  type PlanningArtifactReplicationCertificateV1,
  type PlanningArtifactReplicationEvidenceRepositoryV1,
  type PlanningArtifactReplicationPeerOptionsV1,
  type PlanningArtifactReplicationRequestPayloadV1,
  type PlanningArtifactReplicationResponsePayloadV1,
  type SignedPlanningArtifactReplicationEnvelopeV1,
} from "./replication-contracts.js";
import {
  createPlanningArtifactReplicationCertificateV1,
  createSignedPlanningArtifactReplicationEnvelopeV1,
  planningArtifactCertificateStreamIdV1,
  planningArtifactPublicationDigestV1,
  publicationMatchesDigestV1,
  selectPlanningArtifactReplicasV1,
  validatePlanningArtifactReplicationCertificateShapeV1,
  validatePlanningArtifactReplicationPolicyV1,
  validateSignedPlanningArtifactReplicationEnvelopeV1,
  verifyPlanningArtifactReplicationCertificateV1,
  verifyPlanningArtifactReplicationEnvelopeV1,
} from "./replication-codec.js";
import {
  createPlanningArtifactSyncRecordV1,
  planningArtifactRecordMatchesRequestV1,
  PlanningArtifactSyncAdapterV1,
  ReplicatedPlanningFragmentRepositoryV1,
  validatePlanningArtifactSyncRecordV1,
} from "./sync.js";
import {
  PLANNING_ARTIFACT_SYNC_DOMAIN_V1,
  type SignedPlanningArtifactPublicationV1,
} from "./contracts.js";
import {
  planningArtifactDigestV1,
  planningArtifactStreamIdV1,
  verifyPlanningArtifactPublicationV1,
} from "./publication.js";

const DEFAULT_MAXIMUM_RECEIPTS = 65_536;
const DEFAULT_MAXIMUM_CERTIFICATES = 16_384;
const DEFAULT_MAXIMUM_ACKNOWLEDGEMENTS = 65_536;

/** Bounded immutable evidence store for embedded peers and tests. */
export class InMemoryPlanningArtifactReplicationEvidenceRepositoryV1 implements PlanningArtifactReplicationEvidenceRepositoryV1 {
  readonly #maximumReceipts: number;
  readonly #maximumCertificates: number;
  readonly #maximumAcknowledgements: number;
  readonly #receipts = new Map<
    string,
    SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactReplicaStoredPayloadV1>
  >();
  readonly #certificates = new Map<
    string,
    PlanningArtifactReplicationCertificateV1
  >();
  readonly #acks = new Map<
    string,
    SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactCertificateStoredPayloadV1>
  >();

  constructor(
    options: InMemoryPlanningArtifactReplicationEvidenceOptionsV1 = {},
  ) {
    exactOptions(options, [
      "maximumAcknowledgements",
      "maximumCertificates",
      "maximumReceipts",
    ]);
    this.#maximumReceipts = boundedMaximum(
      options.maximumReceipts,
      DEFAULT_MAXIMUM_RECEIPTS,
    );
    this.#maximumCertificates = boundedMaximum(
      options.maximumCertificates,
      DEFAULT_MAXIMUM_CERTIFICATES,
    );
    this.#maximumAcknowledgements = boundedMaximum(
      options.maximumAcknowledgements,
      DEFAULT_MAXIMUM_ACKNOWLEDGEMENTS,
    );
  }

  async putReceipt(
    input: SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactReplicaStoredPayloadV1>,
  ): Promise<
    SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactReplicaStoredPayloadV1>
  > {
    const receipt =
      validateSignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactReplicaStoredPayloadV1>(
        input,
      );
    if (!receipt || receipt.payload.type !== "artifact.replica.stored")
      throw new TypeError("planning_artifact_replica_receipt_invalid");
    return immutablePut(
      this.#receipts,
      receipt.payload.requestMessageId,
      receipt,
      this.#maximumReceipts,
      "planning_artifact_replica_receipt_conflict",
    );
  }

  async getReceipt(
    requestMessageId: string,
  ): Promise<SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactReplicaStoredPayloadV1> | null> {
    return this.#receipts.get(identifier(requestMessageId)) ?? null;
  }

  async putCertificate(
    input: PlanningArtifactReplicationCertificateV1,
  ): Promise<PlanningArtifactReplicationCertificateV1> {
    const certificate =
      validatePlanningArtifactReplicationCertificateShapeV1(input);
    if (!certificate)
      throw new TypeError("planning_artifact_replication_certificate_invalid");
    return immutablePut(
      this.#certificates,
      certificateKey(certificate),
      certificate,
      this.#maximumCertificates,
      "planning_artifact_replication_certificate_conflict",
    );
  }

  async getCertificate(input: {
    readonly fragmentDigest: string;
    readonly membershipConfigurationDigest: string;
  }): Promise<PlanningArtifactReplicationCertificateV1 | null> {
    digest(input.fragmentDigest);
    digest(input.membershipConfigurationDigest);
    return (
      this.#certificates.get(
        `${input.fragmentDigest}\u0000${input.membershipConfigurationDigest}`,
      ) ?? null
    );
  }

  async putCertificateAck(
    input: SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactCertificateStoredPayloadV1>,
  ): Promise<
    SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactCertificateStoredPayloadV1>
  > {
    const acknowledgement =
      validateSignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactCertificateStoredPayloadV1>(
        input,
      );
    if (
      !acknowledgement ||
      acknowledgement.payload.type !== "artifact.certificate.stored"
    )
      throw new TypeError("planning_artifact_certificate_ack_invalid");
    return immutablePut(
      this.#acks,
      acknowledgement.payload.requestMessageId,
      acknowledgement,
      this.#maximumAcknowledgements,
      "planning_artifact_certificate_ack_conflict",
    );
  }

  async getCertificateAck(
    requestMessageId: string,
  ): Promise<SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactCertificateStoredPayloadV1> | null> {
    return this.#acks.get(identifier(requestMessageId)) ?? null;
  }
}

/** Receiver for producer-driven artifact and certificate replication. */
export class PlanningArtifactReplicationPeerV1 {
  readonly #policy;

  constructor(readonly options: PlanningArtifactReplicationPeerOptionsV1) {
    if (
      !options?.scope ||
      !options.repository ||
      !options.evidenceRepository ||
      !options.syncRepository ||
      !options.membership ||
      !options.signing ||
      !options.clock
    )
      throw new TypeError(
        "planning_artifact_replication_peer_options_required",
      );
    this.#policy = validatePlanningArtifactReplicationPolicyV1(options.policy);
  }

  async handle(
    input: unknown,
  ): Promise<SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactReplicationResponsePayloadV1> | null> {
    const now = this.options.clock.now();
    const envelope =
      await verifyPlanningArtifactReplicationEnvelopeV1<PlanningArtifactReplicationRequestPayloadV1>(
        {
          envelope: input,
          membership: this.options.membership,
          logicalTimeMs: now.logicalTimeMs,
          requireCurrentMembership: true,
          crypto: this.options.crypto,
        },
      );
    if (
      !envelope ||
      envelope.tenantId !== this.options.scope.tenantId ||
      envelope.meshId !== this.options.scope.meshId ||
      envelope.policyDomainId !== this.options.scope.policyDomainId ||
      envelope.audiencePeerId !== this.options.scope.peerId ||
      envelope.audienceInstanceId !== this.options.scope.instanceId
    )
      return null;
    const binding = await currentExactBinding(
      this.options.membership,
      envelope.membershipEpoch,
      envelope.membershipConfigurationDigest,
      now.logicalTimeMs,
    );
    if (!binding) return null;
    if (
      envelope.payload.requestedAtLogicalMs > now.logicalTimeMs ||
      envelope.expiresAtLogicalMs - envelope.payload.requestedAtLogicalMs >
        this.#policy.receiptLifetimeMs
    )
      return null;
    if (envelope.payload.type === "artifact.replica.store")
      return this.#storeArtifact(envelope, binding, now);
    if (envelope.payload.type === "artifact.certificate.store")
      return this.#storeCertificate(envelope, binding, now);
    return null;
  }

  async #storeArtifact(
    request: SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactReplicationRequestPayloadV1>,
    membership: CollectiveQuorumMembershipBindingV1,
    now: ReturnType<PlanningArtifactReplicationPeerOptionsV1["clock"]["now"]>,
  ): Promise<SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactReplicaStoredPayloadV1> | null> {
    if (request.payload.type !== "artifact.replica.store") return null;
    const publication = await verifyPlanningArtifactPublicationV1({
      publication: request.payload.publication,
      membership: this.options.membership,
      logicalTimeMs: now.logicalTimeMs,
      maximumArtifactBytes: this.options.maximumArtifactBytes,
      crypto: this.options.crypto,
    });
    if (
      !publication ||
      publication.sourcePeerId !== request.senderPeerId ||
      publication.sourceInstanceId !== request.senderInstanceId ||
      publication.tenantId !== request.tenantId ||
      publication.meshId !== request.meshId ||
      publication.policyDomainId !== request.policyDomainId ||
      publication.membershipEpoch !== request.membershipEpoch ||
      publication.membershipConfigurationDigest !==
        request.membershipConfigurationDigest ||
      !(await publicationMatchesDigestV1({
        publication,
        publicationDigest: request.payload.publicationDigest,
        crypto: this.options.crypto,
      }))
    )
      return null;
    const durable = await this.options.repository.put(publication.record);
    if (durable.contentReference !== publication.contentReference)
      throw new Error("planning_artifact_replica_storage_mismatch");
    await this.options.syncRepository.append({
      syncDomain: PLANNING_ARTIFACT_SYNC_DOMAIN_V1,
      membership,
      records: [
        await createPlanningArtifactSyncRecordV1(
          publication,
          this.options.crypto,
        ),
      ],
    });
    const existing = await this.options.evidenceRepository.getReceipt(
      request.messageId,
    );
    if (existing) return existing;
    const receipt = await createSignedPlanningArtifactReplicationEnvelopeV1({
      tenantId: request.tenantId,
      meshId: request.meshId,
      policyDomainId: request.policyDomainId,
      senderPeerId: this.options.scope.peerId,
      senderInstanceId: this.options.scope.instanceId,
      audiencePeerId: request.senderPeerId,
      audienceInstanceId: request.senderInstanceId,
      membership,
      issuedAt: now.wallTime,
      expiresAtLogicalMs: request.expiresAtLogicalMs,
      payload: {
        type: "artifact.replica.stored",
        requestMessageId: request.messageId,
        publicationDigest: request.payload.publicationDigest,
        contentReference: publication.contentReference,
        fragmentDigest: publication.record.fragmentDigest,
        artifactDigest: publication.artifactDigest,
        storedAtLogicalMs: now.logicalTimeMs,
      },
      signing: this.options.signing,
      crypto: this.options.crypto,
    });
    return this.options.evidenceRepository.putReceipt(receipt);
  }

  async #storeCertificate(
    request: SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactReplicationRequestPayloadV1>,
    membership: CollectiveQuorumMembershipBindingV1,
    now: ReturnType<PlanningArtifactReplicationPeerOptionsV1["clock"]["now"]>,
  ): Promise<SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactCertificateStoredPayloadV1> | null> {
    if (request.payload.type !== "artifact.certificate.store") return null;
    const certificate = await verifyPlanningArtifactReplicationCertificateV1({
      certificate: request.payload.certificate,
      membership: this.options.membership,
      logicalTimeMs: now.logicalTimeMs,
      requireCurrentMembership: true,
      expectedPolicy: this.#policy,
      crypto: this.options.crypto,
    });
    if (
      !certificate ||
      certificate.sourcePeerId !== request.senderPeerId ||
      certificate.sourceInstanceId !== request.senderInstanceId ||
      certificate.tenantId !== request.tenantId ||
      certificate.meshId !== request.meshId ||
      certificate.policyDomainId !== request.policyDomainId
    )
      return null;
    const localReceipt = certificate.receipts.find(
      (receipt) =>
        receipt.senderPeerId === this.options.scope.peerId &&
        receipt.senderInstanceId === this.options.scope.instanceId,
    );
    if (!localReceipt) return null;
    const retainedReceipt = await this.options.evidenceRepository.getReceipt(
      localReceipt.payload.requestMessageId,
    );
    if (!retainedReceipt || !sameJson(retainedReceipt, localReceipt))
      return null;
    const artifact = await this.options.repository.get(
      certificate.contentReference,
    );
    if (
      !artifact ||
      artifact.fragmentDigest !== certificate.fragmentDigest ||
      (await planningArtifactDigestV1(artifact, this.options.crypto)) !==
        certificate.artifactDigest
    )
      return null;
    const artifactSyncRecord = await this.options.syncRepository.readRecord({
      syncDomain: PLANNING_ARTIFACT_SYNC_DOMAIN_V1,
      streamId: planningArtifactStreamIdV1(certificate.fragmentDigest),
      sequence: 1,
    });
    const publication = artifactSyncRecord
      ? await validatePlanningArtifactSyncRecordV1(artifactSyncRecord, {
          scope: {
            tenantId: this.options.scope.tenantId,
            meshId: this.options.scope.meshId,
            policyDomainId: this.options.scope.policyDomainId,
          },
          repository: this.options.repository,
          membership: this.options.membership,
          clock: this.options.clock,
          maximumArtifactBytes: this.options.maximumArtifactBytes,
          crypto: this.options.crypto,
        })
      : null;
    if (
      !publication ||
      (await planningArtifactPublicationDigestV1(
        publication,
        this.options.crypto,
      )) !== certificate.publicationDigest
    )
      return null;
    await this.options.evidenceRepository.putCertificate(certificate);
    await this.options.syncRepository.append({
      syncDomain: PLANNING_ARTIFACT_CERTIFICATE_SYNC_DOMAIN_V1,
      membership,
      records: [
        await createPlanningArtifactCertificateSyncRecordV1(
          certificate,
          this.options.crypto,
        ),
      ],
    });
    const existing = await this.options.evidenceRepository.getCertificateAck(
      request.messageId,
    );
    if (existing) return existing;
    const acknowledgement =
      await createSignedPlanningArtifactReplicationEnvelopeV1({
        tenantId: request.tenantId,
        meshId: request.meshId,
        policyDomainId: request.policyDomainId,
        senderPeerId: this.options.scope.peerId,
        senderInstanceId: this.options.scope.instanceId,
        audiencePeerId: request.senderPeerId,
        audienceInstanceId: request.senderInstanceId,
        membership,
        issuedAt: now.wallTime,
        expiresAtLogicalMs: request.expiresAtLogicalMs,
        payload: {
          type: "artifact.certificate.stored",
          requestMessageId: request.messageId,
          certificateId: certificate.certificateId,
          artifactDigest: certificate.artifactDigest,
          storedAtLogicalMs: now.logicalTimeMs,
        },
        signing: this.options.signing,
        crypto: this.options.crypto,
      });
    return this.options.evidenceRepository.putCertificateAck(acknowledgement);
  }
}

/** Producer repository that returns only after threshold-certified replication. */
export class CertifiedReplicatedPlanningFragmentRepositoryV2 implements PlanningFragmentRepositoryV1 {
  readonly #local: ReplicatedPlanningFragmentRepositoryV1;
  readonly #policy;

  constructor(
    readonly options: CertifiedReplicatedPlanningFragmentRepositoryOptionsV2,
  ) {
    if (
      !options?.evidenceRepository ||
      !options.replicationTransport ||
      !options.replicationPolicy
    )
      throw new TypeError(
        "planning_artifact_certified_repository_options_required",
      );
    this.#policy = validatePlanningArtifactReplicationPolicyV1(
      options.replicationPolicy,
    );
    this.#local = new ReplicatedPlanningFragmentRepositoryV1(options);
  }

  async put(
    input: PlanningFragmentRepositoryRecordV1,
  ): Promise<PlanningFragmentRepositoryRecordV1> {
    const durable = await this.#local.put(input);
    const syncRecord = await this.options.syncRepository.readRecord({
      syncDomain: PLANNING_ARTIFACT_SYNC_DOMAIN_V1,
      streamId: planningArtifactStreamIdV1(durable.fragmentDigest),
      sequence: 1,
    });
    const publication = syncRecord
      ? await validatePlanningArtifactSyncRecordV1(syncRecord, {
          scope: {
            tenantId: this.options.scope.tenantId,
            meshId: this.options.scope.meshId,
            policyDomainId: this.options.scope.policyDomainId,
          },
          repository: this.options.repository,
          membership: this.options.membership,
          clock: this.options.clock,
          maximumArtifactBytes: this.options.maximumArtifactBytes,
          crypto: this.options.crypto,
        })
      : null;
    if (!publication)
      throw new Error("planning_artifact_publication_unavailable");
    await replicatePublication({
      options: this.options,
      policy: this.#policy,
      publication,
    });
    return durable;
  }

  get(
    contentReference: string,
  ): ReturnType<PlanningFragmentRepositoryV1["get"]> {
    return this.options.repository.get(contentReference);
  }
}

/** Domain adapter that accepts both immutable artifacts and their certificates. */
export class PlanningArtifactAvailabilitySyncAdapterV2 implements CollectiveSyncDomainAdapterV1 {
  readonly #artifacts: PlanningArtifactSyncAdapterV1;
  readonly #policy;

  constructor(
    readonly options: PlanningArtifactAvailabilitySyncAdapterOptionsV2,
  ) {
    if (!options?.evidenceRepository || !options.replicationPolicy)
      throw new TypeError(
        "planning_artifact_availability_adapter_options_required",
      );
    this.#policy = validatePlanningArtifactReplicationPolicyV1(
      options.replicationPolicy,
    );
    this.#artifacts = new PlanningArtifactSyncAdapterV1(options);
  }

  async validate(record: CollectiveSyncRecordV1): Promise<boolean> {
    if (record.syncDomain === PLANNING_ARTIFACT_SYNC_DOMAIN_V1)
      return this.#artifacts.validate(record);
    return Boolean(
      await validatePlanningArtifactCertificateSyncRecordV1(record, {
        ...this.options,
        replicationPolicy: this.#policy,
      }),
    );
  }

  async replay(records: readonly CollectiveSyncRecordV1[]): Promise<void> {
    const artifacts = records.filter(
      (record) => record.syncDomain === PLANNING_ARTIFACT_SYNC_DOMAIN_V1,
    );
    const certificates = records.filter(
      (record) =>
        record.syncDomain === PLANNING_ARTIFACT_CERTIFICATE_SYNC_DOMAIN_V1,
    );
    if (artifacts.length + certificates.length !== records.length)
      throw new Error("planning_artifact_availability_replay_domain_invalid");
    const verifiedCertificates: PlanningArtifactReplicationCertificateV1[] = [];
    for (const record of certificates) {
      const certificate = await validatePlanningArtifactCertificateSyncRecordV1(
        record,
        {
          ...this.options,
          replicationPolicy: this.#policy,
        },
      );
      if (!certificate)
        throw new Error("planning_artifact_certificate_replay_invalid");
      verifiedCertificates.push(certificate);
    }
    if (artifacts.length > 0) await this.#artifacts.replay(artifacts);
    for (const certificate of verifiedCertificates) {
      await this.options.evidenceRepository.putCertificate(certificate);
    }
  }
}

/** Source-first exact retrieval with certified replica fallback. */
export class CertifiedPlanningArtifactAvailabilityV2 {
  readonly #policy;

  constructor(
    readonly options: CertifiedPlanningArtifactAvailabilityOptionsV2,
  ) {
    if (
      !options?.scope ||
      !options.repository ||
      !options.evidenceRepository ||
      !options.client ||
      !options.membership ||
      !options.clock
    )
      throw new TypeError(
        "planning_artifact_certified_availability_options_required",
      );
    this.#policy = validatePlanningArtifactReplicationPolicyV1(
      options.replicationPolicy,
    );
  }

  async ensureAvailable(
    input: PlanningArtifactAvailabilityRequestV1,
  ): Promise<boolean> {
    if (
      !input?.contentReference ||
      !input.fragmentDigest ||
      input.tenantId !== this.options.scope.tenantId ||
      input.meshId !== this.options.scope.meshId ||
      input.policyDomainId !== this.options.scope.policyDomainId
    )
      return false;
    const local = await this.options.repository.get(input.contentReference);
    if (local) return planningArtifactRecordMatchesRequestV1(local, input);
    try {
      await this.options.client.resolveRecord({
        peerId: input.sourcePeerId,
        syncDomain: PLANNING_ARTIFACT_SYNC_DOMAIN_V1,
        streamId: planningArtifactStreamIdV1(input.fragmentDigest),
        sequence: 1,
        ...(input.signal ? { signal: input.signal } : {}),
      });
      const direct = await this.options.repository.get(input.contentReference);
      if (direct) return planningArtifactRecordMatchesRequestV1(direct, input);
    } catch {
      // The certified path below is the only fallback.
    }
    const now = this.options.clock.now();
    const membership = await this.options.membership.currentBinding({
      logicalTimeMs: now.logicalTimeMs,
    });
    if (
      !membership ||
      !boundInstance(membership, input.sourcePeerId, input.sourceInstanceId)
    )
      return false;
    const replicas = await selectPlanningArtifactReplicasV1({
      membership,
      sourcePeerId: input.sourcePeerId,
      sourceInstanceId: input.sourceInstanceId,
      fragmentDigest: input.fragmentDigest,
      policy: this.#policy,
      crypto: this.options.crypto,
    });
    let certificate = await this.options.evidenceRepository.getCertificate({
      fragmentDigest: input.fragmentDigest,
      membershipConfigurationDigest: membership.configurationDigest,
    });
    if (!certificate) {
      for (const replica of replicas) {
        try {
          await this.options.client.resolveRecord({
            peerId: replica.peerId,
            syncDomain: PLANNING_ARTIFACT_CERTIFICATE_SYNC_DOMAIN_V1,
            streamId: planningArtifactCertificateStreamIdV1(
              input.fragmentDigest,
            ),
            sequence: 1,
            ...(input.signal ? { signal: input.signal } : {}),
          });
        } catch {
          continue;
        }
        certificate = await this.options.evidenceRepository.getCertificate({
          fragmentDigest: input.fragmentDigest,
          membershipConfigurationDigest: membership.configurationDigest,
        });
        if (certificate) break;
      }
    }
    const verified = certificate
      ? await verifyPlanningArtifactReplicationCertificateV1({
          certificate,
          membership: this.options.membership,
          logicalTimeMs: now.logicalTimeMs,
          requireCurrentMembership: true,
          expectedPolicy: this.#policy,
          crypto: this.options.crypto,
        })
      : null;
    if (!verified) return false;
    const certifiedReplicas = [...verified.receipts]
      .map((receipt) => ({
        peerId: receipt.senderPeerId,
        instanceId: receipt.senderInstanceId,
      }))
      .sort(
        (left, right) =>
          compareCodeUnits(left.peerId, right.peerId) ||
          compareCodeUnits(left.instanceId, right.instanceId),
      );
    for (const replica of certifiedReplicas) {
      try {
        await this.options.client.resolveRecord({
          peerId: replica.peerId,
          syncDomain: PLANNING_ARTIFACT_SYNC_DOMAIN_V1,
          streamId: planningArtifactStreamIdV1(input.fragmentDigest),
          sequence: 1,
          ...(input.signal ? { signal: input.signal } : {}),
        });
      } catch {
        continue;
      }
      const stored = await this.options.repository.get(input.contentReference);
      if (stored) return planningArtifactRecordMatchesRequestV1(stored, input);
    }
    return false;
  }
}

export async function createPlanningArtifactCertificateSyncRecordV1(
  certificate: PlanningArtifactReplicationCertificateV1,
  crypto?: Crypto,
): Promise<CollectiveSyncRecordV1> {
  const valid =
    validatePlanningArtifactReplicationCertificateShapeV1(certificate);
  if (!valid)
    throw new TypeError("planning_artifact_replication_certificate_invalid");
  return createCollectiveSyncRecordV1({
    tenantId: valid.tenantId,
    meshId: valid.meshId,
    policyDomainId: valid.policyDomainId,
    syncDomain: PLANNING_ARTIFACT_CERTIFICATE_SYNC_DOMAIN_V1,
    streamId: planningArtifactCertificateStreamIdV1(valid.fragmentDigest),
    sequence: 1,
    predecessorDigest: null,
    payload: Object.freeze<PlanningArtifactCertificateSyncPayloadV1>({
      schemaVersion: 1,
      type: PLANNING_ARTIFACT_CERTIFICATE_PAYLOAD_TYPE_V1,
      certificate: valid,
    }),
    createdAtLogicalMs: valid.certifiedAtLogicalMs,
    ...(crypto ? { crypto } : {}),
  });
}

export async function validatePlanningArtifactCertificateSyncRecordV1(
  input: unknown,
  options: PlanningArtifactAvailabilitySyncAdapterOptionsV2,
): Promise<PlanningArtifactReplicationCertificateV1 | null> {
  const record = await verifyCollectiveSyncRecordV1(input, options.crypto);
  if (
    !record ||
    record.tenantId !== options.scope.tenantId ||
    record.meshId !== options.scope.meshId ||
    record.policyDomainId !== options.scope.policyDomainId ||
    record.syncDomain !== PLANNING_ARTIFACT_CERTIFICATE_SYNC_DOMAIN_V1 ||
    record.sequence !== 1 ||
    record.predecessorDigest !== null ||
    !certificatePayload(record.payload)
  )
    return null;
  const certificate = await verifyPlanningArtifactReplicationCertificateV1({
    certificate: record.payload.certificate,
    membership: options.membership,
    logicalTimeMs: options.clock.now().logicalTimeMs,
    requireCurrentMembership: true,
    expectedPolicy: options.replicationPolicy,
    crypto: options.crypto,
  });
  if (
    !certificate ||
    record.streamId !==
      planningArtifactCertificateStreamIdV1(certificate.fragmentDigest) ||
    record.createdAtLogicalMs !== certificate.certifiedAtLogicalMs
  )
    return null;
  return certificate;
}

async function replicatePublication(input: {
  readonly options: CertifiedReplicatedPlanningFragmentRepositoryOptionsV2;
  readonly policy: ReturnType<
    typeof validatePlanningArtifactReplicationPolicyV1
  >;
  readonly publication: SignedPlanningArtifactPublicationV1;
}): Promise<PlanningArtifactReplicationCertificateV1> {
  const now = input.options.clock.now();
  const membership = await input.options.membership.currentBinding({
    logicalTimeMs: now.logicalTimeMs,
  });
  if (
    !membership ||
    !boundInstance(
      membership,
      input.options.scope.peerId,
      input.options.scope.instanceId,
    ) ||
    membership.epoch !== input.publication.membershipEpoch ||
    membership.configurationDigest !==
      input.publication.membershipConfigurationDigest
  )
    throw new Error("planning_artifact_replication_membership_unavailable");
  const publicationDigest = await planningArtifactPublicationDigestV1(
    input.publication,
    input.options.crypto,
  );
  const existing = await input.options.evidenceRepository.getCertificate({
    fragmentDigest: input.publication.record.fragmentDigest,
    membershipConfigurationDigest: membership.configurationDigest,
  });
  let certificate = existing
    ? await verifyPlanningArtifactReplicationCertificateV1({
        certificate: existing,
        membership: input.options.membership,
        logicalTimeMs: now.logicalTimeMs,
        requireCurrentMembership: true,
        expectedPolicy: input.policy,
        crypto: input.options.crypto,
      })
    : null;
  if (existing && !certificate)
    throw new Error("planning_artifact_replication_certificate_stale");
  if (!certificate) {
    const selectedReplicas = await selectPlanningArtifactReplicasV1({
      membership,
      sourcePeerId: input.publication.sourcePeerId,
      sourceInstanceId: input.publication.sourceInstanceId,
      fragmentDigest: input.publication.record.fragmentDigest,
      policy: input.policy,
      crypto: input.options.crypto,
    });
    const expiresAtLogicalMs = addLogical(
      now.logicalTimeMs,
      input.policy.receiptLifetimeMs,
    );
    const receipts = (
      await Promise.all(
        selectedReplicas.map(async (replica) => {
          try {
            const request =
              await createSignedPlanningArtifactReplicationEnvelopeV1({
                tenantId: input.options.scope.tenantId,
                meshId: input.options.scope.meshId,
                policyDomainId: input.options.scope.policyDomainId,
                senderPeerId: input.options.scope.peerId,
                senderInstanceId: input.options.scope.instanceId,
                audiencePeerId: replica.peerId,
                audienceInstanceId: replica.instanceId,
                membership,
                issuedAt: now.wallTime,
                expiresAtLogicalMs,
                payload: {
                  type: "artifact.replica.store",
                  publicationDigest,
                  publication: input.publication,
                  requestedAtLogicalMs: now.logicalTimeMs,
                },
                signing: input.options.signing,
                crypto: input.options.crypto,
              });
            const response = await input.options.replicationTransport.exchange({
              peerId: replica.peerId,
              request,
            });
            const receipt =
              await verifyPlanningArtifactReplicationEnvelopeV1<PlanningArtifactReplicaStoredPayloadV1>(
                {
                  envelope: response,
                  membership: input.options.membership,
                  logicalTimeMs: input.options.clock.now().logicalTimeMs,
                  requireCurrentMembership: true,
                  crypto: input.options.crypto,
                },
              );
            if (
              !receipt ||
              receipt.payload.type !== "artifact.replica.stored" ||
              receipt.senderPeerId !== replica.peerId ||
              receipt.senderInstanceId !== replica.instanceId ||
              receipt.audiencePeerId !== input.options.scope.peerId ||
              receipt.audienceInstanceId !== input.options.scope.instanceId ||
              receipt.payload.requestMessageId !== request.messageId ||
              receipt.payload.publicationDigest !== publicationDigest ||
              receipt.payload.contentReference !==
                input.publication.contentReference ||
              receipt.payload.fragmentDigest !==
                input.publication.record.fragmentDigest ||
              receipt.payload.artifactDigest !==
                input.publication.artifactDigest
            )
              return null;
            return input.options.evidenceRepository.putReceipt(receipt);
          } catch {
            return null;
          }
        }),
      )
    ).filter(
      (
        receipt,
      ): receipt is SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactReplicaStoredPayloadV1> =>
        receipt !== null,
    );
    if (receipts.length < input.policy.writeThreshold)
      throw new Error("planning_artifact_replication_threshold_unavailable");
    const certifiedAt = input.options.clock.now().logicalTimeMs;
    certificate = await createPlanningArtifactReplicationCertificateV1({
      tenantId: input.options.scope.tenantId,
      meshId: input.options.scope.meshId,
      policyDomainId: input.options.scope.policyDomainId,
      sourcePeerId: input.options.scope.peerId,
      sourceInstanceId: input.options.scope.instanceId,
      membership,
      publicationDigest,
      contentReference: input.publication.contentReference,
      fragmentDigest: input.publication.record.fragmentDigest,
      artifactDigest: input.publication.artifactDigest,
      policy: input.policy,
      selectedReplicas,
      receipts,
      certifiedAtLogicalMs: certifiedAt,
      expiresAtLogicalMs: Math.min(
        ...receipts.map((receipt) => receipt.expiresAtLogicalMs),
      ),
      membershipResolver: input.options.membership,
      crypto: input.options.crypto,
    });
    await input.options.evidenceRepository.putCertificate(certificate);
  }
  await input.options.syncRepository.append({
    syncDomain: PLANNING_ARTIFACT_CERTIFICATE_SYNC_DOMAIN_V1,
    membership,
    records: [
      await createPlanningArtifactCertificateSyncRecordV1(
        certificate,
        input.options.crypto,
      ),
    ],
  });
  const acknowledgements = (
    await Promise.all(
      certificate.receipts.map(async (receipt) => {
        try {
          const request =
            await createSignedPlanningArtifactReplicationEnvelopeV1({
              tenantId: input.options.scope.tenantId,
              meshId: input.options.scope.meshId,
              policyDomainId: input.options.scope.policyDomainId,
              senderPeerId: input.options.scope.peerId,
              senderInstanceId: input.options.scope.instanceId,
              audiencePeerId: receipt.senderPeerId,
              audienceInstanceId: receipt.senderInstanceId,
              membership,
              issuedAt: input.options.clock.now().wallTime,
              expiresAtLogicalMs: certificate.expiresAtLogicalMs,
              payload: {
                type: "artifact.certificate.store",
                certificate,
                requestedAtLogicalMs: input.options.clock.now().logicalTimeMs,
              },
              signing: input.options.signing,
              crypto: input.options.crypto,
            });
          const response = await input.options.replicationTransport.exchange({
            peerId: receipt.senderPeerId,
            request,
          });
          const acknowledgement =
            await verifyPlanningArtifactReplicationEnvelopeV1<PlanningArtifactCertificateStoredPayloadV1>(
              {
                envelope: response,
                membership: input.options.membership,
                logicalTimeMs: input.options.clock.now().logicalTimeMs,
                requireCurrentMembership: true,
                crypto: input.options.crypto,
              },
            );
          if (
            !acknowledgement ||
            acknowledgement.payload.type !== "artifact.certificate.stored" ||
            acknowledgement.senderPeerId !== receipt.senderPeerId ||
            acknowledgement.senderInstanceId !== receipt.senderInstanceId ||
            acknowledgement.audiencePeerId !== input.options.scope.peerId ||
            acknowledgement.audienceInstanceId !==
              input.options.scope.instanceId ||
            acknowledgement.payload.requestMessageId !== request.messageId ||
            acknowledgement.payload.certificateId !==
              certificate.certificateId ||
            acknowledgement.payload.artifactDigest !==
              certificate.artifactDigest
          )
            return null;
          return input.options.evidenceRepository.putCertificateAck(
            acknowledgement,
          );
        } catch {
          return null;
        }
      }),
    )
  ).filter((acknowledgement) => acknowledgement !== null);
  if (acknowledgements.length < input.policy.writeThreshold)
    throw new Error("planning_artifact_certificate_threshold_unavailable");
  return certificate;
}

function certificatePayload(
  value: unknown,
): value is PlanningArtifactCertificateSyncPayloadV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    Object.keys(candidate).sort().join(",") ===
      "certificate,schemaVersion,type" &&
    candidate.schemaVersion === 1 &&
    candidate.type === PLANNING_ARTIFACT_CERTIFICATE_PAYLOAD_TYPE_V1
  );
}

async function currentExactBinding(
  membership: PlanningArtifactReplicationPeerOptionsV1["membership"],
  epoch: number,
  configurationDigest: string,
  logicalTimeMs: number,
): Promise<CollectiveQuorumMembershipBindingV1 | null> {
  const binding = await membership.currentBinding({ logicalTimeMs });
  return binding?.epoch === epoch &&
    binding.configurationDigest === configurationDigest
    ? binding
    : null;
}

function boundInstance(
  membership: CollectiveQuorumMembershipBindingV1,
  peerId: string,
  instanceId: string,
): boolean {
  return membership.memberInstances.some(
    (entry) => entry.peerId === peerId && entry.instanceId === instanceId,
  );
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function certificateKey(
  certificate: PlanningArtifactReplicationCertificateV1,
): string {
  return `${certificate.fragmentDigest}\u0000${certificate.membershipConfigurationDigest}`;
}

function immutablePut<T>(
  target: Map<string, T>,
  key: string,
  value: T,
  maximum: number,
  conflictCode: string,
): T {
  const existing = target.get(key);
  if (existing) {
    if (!sameJson(existing, value)) throw new Error(conflictCode);
    return existing;
  }
  if (target.size >= maximum)
    throw new Error("planning_artifact_replication_evidence_capacity_exceeded");
  target.set(key, value);
  return value;
}

function sameJson(left: unknown, right: unknown): boolean {
  const a = canonicalizeMeshJsonBytes(left);
  const b = canonicalizeMeshJsonBytes(right);
  if (!a.ok || !b.ok || a.value.byteLength !== b.value.byteLength) return false;
  return a.value.every((byte, index) => byte === b.value[index]);
}

function exactOptions(value: object, keys: readonly string[]): void {
  const actual = Object.keys(value);
  if (actual.some((key) => !keys.includes(key)))
    throw new TypeError(
      "planning_artifact_replication_evidence_options_invalid",
    );
}

function boundedMaximum(value: number | undefined, fallback: number): number {
  const maximum = value ?? fallback;
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 1_000_000)
    throw new RangeError(
      "planning_artifact_replication_evidence_limit_invalid",
    );
  return maximum;
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

function addLogical(left: number, right: number): number {
  const value = left + right;
  if (!Number.isSafeInteger(value) || value <= left)
    throw new RangeError("planning_artifact_replication_expiry_invalid");
  return value;
}
