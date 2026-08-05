import { canonicalizeMeshJsonBytes } from "@agentplat/mesh-protocol";

import {
  createExecutionCheckpointArtifactV1,
  createExecutionCheckpointCertificateV1,
  createExecutionCheckpointEnvelopeV1,
  createExecutionCheckpointPublicationV1,
  executionCheckpointDigestV1,
  validateExecutionCheckpointArtifactV1,
  validateExecutionCheckpointCertificateV1,
  validateExecutionCheckpointPolicyV1,
  verifyExecutionCheckpointEnvelopeV1,
  verifyExecutionCheckpointPublicationV1,
} from "./checkpoint-codec.js";
import type {
  CertifiedExecutionCheckpointAvailabilityOptionsV1,
  ExecutionCheckpointArtifactRepositoryV1,
  ExecutionCheckpointArtifactV1,
  ExecutionCheckpointAvailabilityPortV1,
  ExecutionCheckpointEvidenceRepositoryV1,
  ExecutionCheckpointMembershipBindingV1,
  ExecutionCheckpointPeerOptionsV1,
  ExecutionCheckpointReplicaV1,
  ExecutionCheckpointReplicationCertificateV1,
  ExecutionCheckpointRequestPayloadV1,
  ExecutionCheckpointResolveInputV1,
  ExecutionCheckpointResponsePayloadV1,
  ExecutionCheckpointTransportV1,
  SignedExecutionCheckpointEnvelopeV1,
} from "./checkpoint-contracts.js";

const MAX_IN_MEMORY_RECORDS = 10_000;

export class InMemoryExecutionCheckpointArtifactRepositoryV1 implements ExecutionCheckpointArtifactRepositoryV1 {
  readonly #artifacts = new Map<string, ExecutionCheckpointArtifactV1>();

  constructor(readonly maximumRecords = MAX_IN_MEMORY_RECORDS) {
    if (!Number.isSafeInteger(maximumRecords) || maximumRecords < 1)
      throw new TypeError("execution_checkpoint_repository_limit_invalid");
  }

  async put(
    input: ExecutionCheckpointArtifactV1,
  ): Promise<ExecutionCheckpointArtifactV1> {
    const artifact = await validateExecutionCheckpointArtifactV1(input);
    if (!artifact) throw new TypeError("execution_checkpoint_artifact_invalid");
    const existing = this.#artifacts.get(artifact.manifest.checkpointId);
    if (existing) {
      if (!same(existing, artifact))
        throw new Error("execution_checkpoint_artifact_conflict");
      return existing;
    }
    if (this.#artifacts.size >= this.maximumRecords)
      throw new RangeError("execution_checkpoint_repository_capacity");
    this.#artifacts.set(artifact.manifest.checkpointId, artifact);
    return artifact;
  }

  async get(
    checkpointId: string,
  ): Promise<ExecutionCheckpointArtifactV1 | null> {
    required(checkpointId);
    return this.#artifacts.get(checkpointId) ?? null;
  }
}

export class InMemoryExecutionCheckpointEvidenceRepositoryV1 implements ExecutionCheckpointEvidenceRepositoryV1 {
  readonly #receipts = new Map<
    string,
    SignedExecutionCheckpointEnvelopeV1<
      Extract<
        ExecutionCheckpointResponsePayloadV1,
        { readonly type: "checkpoint.artifact.stored" }
      >
    >
  >();
  readonly #certificates = new Map<
    string,
    ExecutionCheckpointReplicationCertificateV1
  >();
  readonly #acks = new Map<
    string,
    SignedExecutionCheckpointEnvelopeV1<
      Extract<
        ExecutionCheckpointResponsePayloadV1,
        { readonly type: "checkpoint.certificate.stored" }
      >
    >
  >();

  constructor(readonly maximumRecords = MAX_IN_MEMORY_RECORDS) {
    if (!Number.isSafeInteger(maximumRecords) || maximumRecords < 1)
      throw new TypeError("execution_checkpoint_evidence_limit_invalid");
  }

  async putReceipt(
    input: SignedExecutionCheckpointEnvelopeV1<
      Extract<
        ExecutionCheckpointResponsePayloadV1,
        { readonly type: "checkpoint.artifact.stored" }
      >
    >,
  ) {
    return immutablePut(
      this.#receipts,
      input.payload.requestMessageId,
      input,
      this.maximumRecords,
      "execution_checkpoint_receipt_conflict",
    );
  }
  async getReceipt(messageId: string) {
    return this.#receipts.get(required(messageId)) ?? null;
  }
  async putCertificate(input: ExecutionCheckpointReplicationCertificateV1) {
    const certificate = await validateExecutionCheckpointCertificateV1(input);
    if (!certificate)
      throw new TypeError("execution_checkpoint_certificate_invalid");
    return immutablePut(
      this.#certificates,
      certificate.checkpointId,
      certificate,
      this.maximumRecords,
      "execution_checkpoint_certificate_conflict",
    );
  }
  async getCertificate(checkpointId: string) {
    return this.#certificates.get(required(checkpointId)) ?? null;
  }
  async putCertificateAck(
    input: SignedExecutionCheckpointEnvelopeV1<
      Extract<
        ExecutionCheckpointResponsePayloadV1,
        { readonly type: "checkpoint.certificate.stored" }
      >
    >,
  ) {
    return immutablePut(
      this.#acks,
      input.payload.requestMessageId,
      input,
      this.maximumRecords,
      "execution_checkpoint_ack_conflict",
    );
  }
  async getCertificateAck(messageId: string) {
    return this.#acks.get(required(messageId)) ?? null;
  }
}

export async function selectExecutionCheckpointReplicasV1(input: {
  readonly membership: ExecutionCheckpointMembershipBindingV1;
  readonly checkpointId: string;
  readonly sourcePeerId: string;
  readonly replicaCount: number;
  readonly crypto?: Crypto;
}): Promise<readonly ExecutionCheckpointReplicaV1[]> {
  required(input.checkpointId);
  const candidates = input.membership.memberInstances.filter(
    ({ peerId }) => peerId !== input.sourcePeerId,
  );
  if (candidates.length < input.replicaCount)
    throw new RangeError("execution_checkpoint_insufficient_replicas");
  const scored = await Promise.all(
    candidates.map(async (replica) => ({
      ...replica,
      score: await executionCheckpointDigestV1(
        {
          domain: "agentplat.execution-checkpoint.replica-selection.v1",
          checkpointId: input.checkpointId,
          membershipConfigurationDigest: input.membership.configurationDigest,
          peerId: replica.peerId,
          instanceId: replica.instanceId,
        },
        input.crypto,
      ),
    })),
  );
  return Object.freeze(
    scored
      .sort((left, right) =>
        left.score < right.score
          ? -1
          : left.score > right.score
            ? 1
            : left.peerId < right.peerId
              ? -1
              : 1,
      )
      .slice(0, input.replicaCount)
      .map(({ peerId, instanceId }) => Object.freeze({ peerId, instanceId })),
  );
}

export class ExecutionCheckpointReplicationPeerV1 {
  readonly #policy;

  constructor(readonly options: ExecutionCheckpointPeerOptionsV1) {
    if (
      !options?.scope ||
      !options.artifacts ||
      !options.evidence ||
      !options.membership ||
      !options.signing ||
      !options.clock
    )
      throw new TypeError("execution_checkpoint_peer_options_required");
    this.#policy = validateExecutionCheckpointPolicyV1(options.policy);
  }

  async handle(
    input: unknown,
  ): Promise<SignedExecutionCheckpointEnvelopeV1<ExecutionCheckpointResponsePayloadV1> | null> {
    const now = this.options.clock.now();
    const request =
      await verifyExecutionCheckpointEnvelopeV1<ExecutionCheckpointRequestPayloadV1>(
        {
          envelope: input,
          membership: this.options.membership,
          logicalTimeMs: now.logicalTimeMs,
          requireCurrentMembership: true,
          crypto: this.options.crypto,
        },
      );
    if (
      !request ||
      !matchesScope(request, this.options.scope) ||
      request.audiencePeerId !== this.options.scope.peerId ||
      request.audienceInstanceId !== this.options.scope.instanceId
    )
      return null;
    const membership = await this.options.membership.currentBinding({
      logicalTimeMs: now.logicalTimeMs,
    });
    if (
      !membership ||
      membership.epoch !== request.membershipEpoch ||
      membership.configurationDigest !== request.membershipConfigurationDigest
    )
      return null;
    switch (request.payload.type) {
      case "checkpoint.artifact.store":
        return this.#storeArtifact(request, membership, now);
      case "checkpoint.certificate.store":
        return this.#storeCertificate(request, membership, now);
      case "checkpoint.certificate.get":
        return this.#findCertificate(request, membership, now);
      case "checkpoint.artifact.get":
        return this.#findArtifact(request, membership, now);
    }
  }

  async #storeArtifact(
    request: SignedExecutionCheckpointEnvelopeV1<ExecutionCheckpointRequestPayloadV1>,
    membership: ExecutionCheckpointMembershipBindingV1,
    now: ReturnType<ExecutionCheckpointPeerOptionsV1["clock"]["now"]>,
  ) {
    if (request.payload.type !== "checkpoint.artifact.store") return null;
    const publication = await verifyExecutionCheckpointPublicationV1({
      publication: request.payload.publication,
      membership: this.options.membership,
      logicalTimeMs: now.logicalTimeMs,
      maximumArtifactBytes: this.#policy.maximumArtifactBytes,
      crypto: this.options.crypto,
    });
    if (
      !publication ||
      publication.artifact.manifest.sourcePeerId !== request.senderPeerId ||
      publication.artifact.manifest.sourceInstanceId !==
        request.senderInstanceId ||
      !matchesScope(publication.artifact.manifest, this.options.scope)
    )
      return null;
    const existing = await this.options.evidence.getReceipt(request.messageId);
    if (existing) return existing;
    const artifact = await this.options.artifacts.put(publication.artifact);
    const response = await this.#respond(request, membership, now, {
      type: "checkpoint.artifact.stored",
      requestMessageId: request.messageId,
      checkpointId: artifact.manifest.checkpointId,
      artifactDigest: artifact.artifactDigest,
      storedAtLogicalMs: now.logicalTimeMs,
    });
    return this.options.evidence.putReceipt(
      response as SignedExecutionCheckpointEnvelopeV1<
        Extract<
          ExecutionCheckpointResponsePayloadV1,
          { readonly type: "checkpoint.artifact.stored" }
        >
      >,
    );
  }

  async #storeCertificate(
    request: SignedExecutionCheckpointEnvelopeV1<ExecutionCheckpointRequestPayloadV1>,
    membership: ExecutionCheckpointMembershipBindingV1,
    now: ReturnType<ExecutionCheckpointPeerOptionsV1["clock"]["now"]>,
  ) {
    if (request.payload.type !== "checkpoint.certificate.store") return null;
    const certificate = await verifyCertificate({
      certificate: request.payload.certificate,
      options: this.options,
      policy: this.#policy,
      logicalTimeMs: now.logicalTimeMs,
      requireCurrent: true,
    });
    if (!certificate)
      throw new Error("execution_checkpoint_certificate_invalid");
    if (
      certificate.sourcePeerId !== request.senderPeerId ||
      certificate.sourceInstanceId !== request.senderInstanceId
    )
      throw new Error("execution_checkpoint_certificate_source_mismatch");
    const localReceipt = certificate.receipts.find(
      (receipt) =>
        receipt.senderPeerId === this.options.scope.peerId &&
        receipt.senderInstanceId === this.options.scope.instanceId,
    );
    if (!localReceipt)
      throw new Error("execution_checkpoint_certificate_local_receipt_missing");
    const storedReceipt = await this.options.evidence.getReceipt(
      localReceipt.payload.requestMessageId,
    );
    if (!storedReceipt)
      throw new Error(
        "execution_checkpoint_certificate_local_receipt_not_stored",
      );
    if (!same(storedReceipt, localReceipt))
      throw new Error(
        "execution_checkpoint_certificate_local_receipt_mismatch",
      );
    const artifact = await this.options.artifacts.get(certificate.checkpointId);
    if (!artifact || artifact.artifactDigest !== certificate.artifactDigest)
      throw new Error("execution_checkpoint_certificate_artifact_missing");
    await this.options.evidence.putCertificate(certificate);
    const existing = await this.options.evidence.getCertificateAck(
      request.messageId,
    );
    if (existing) return existing;
    const response = await this.#respond(request, membership, now, {
      type: "checkpoint.certificate.stored",
      requestMessageId: request.messageId,
      checkpointId: certificate.checkpointId,
      certificateId: certificate.certificateId,
      storedAtLogicalMs: now.logicalTimeMs,
    });
    return this.options.evidence.putCertificateAck(
      response as SignedExecutionCheckpointEnvelopeV1<
        Extract<
          ExecutionCheckpointResponsePayloadV1,
          { readonly type: "checkpoint.certificate.stored" }
        >
      >,
    );
  }

  async #findCertificate(
    request: SignedExecutionCheckpointEnvelopeV1<ExecutionCheckpointRequestPayloadV1>,
    membership: ExecutionCheckpointMembershipBindingV1,
    now: ReturnType<ExecutionCheckpointPeerOptionsV1["clock"]["now"]>,
  ) {
    if (request.payload.type !== "checkpoint.certificate.get") return null;
    const candidate = await this.options.evidence.getCertificate(
      request.payload.checkpointId,
    );
    const certificate =
      candidate &&
      (await verifyCertificate({
        certificate: candidate,
        options: this.options,
        policy: this.#policy,
        logicalTimeMs: now.logicalTimeMs,
        requireCurrent: true,
      }))
        ? candidate
        : null;
    return this.#respond(request, membership, now, {
      type: "checkpoint.certificate.found",
      requestMessageId: request.messageId,
      checkpointId: request.payload.checkpointId,
      certificate,
    });
  }

  async #findArtifact(
    request: SignedExecutionCheckpointEnvelopeV1<ExecutionCheckpointRequestPayloadV1>,
    membership: ExecutionCheckpointMembershipBindingV1,
    now: ReturnType<ExecutionCheckpointPeerOptionsV1["clock"]["now"]>,
  ) {
    if (request.payload.type !== "checkpoint.artifact.get") return null;
    const candidate = await this.options.artifacts.get(
      request.payload.checkpointId,
    );
    const artifact =
      candidate &&
      candidate.artifactDigest === request.payload.artifactDigest &&
      (await validateExecutionCheckpointArtifactV1(
        candidate,
        this.#policy.maximumArtifactBytes,
        this.options.crypto,
      ))
        ? candidate
        : null;
    return this.#respond(request, membership, now, {
      type: "checkpoint.artifact.found",
      requestMessageId: request.messageId,
      checkpointId: request.payload.checkpointId,
      artifact,
    });
  }

  async #respond(
    request: SignedExecutionCheckpointEnvelopeV1<ExecutionCheckpointRequestPayloadV1>,
    membership: ExecutionCheckpointMembershipBindingV1,
    now: ReturnType<ExecutionCheckpointPeerOptionsV1["clock"]["now"]>,
    payload: ExecutionCheckpointResponsePayloadV1,
  ) {
    return createExecutionCheckpointEnvelopeV1({
      messageId: `checkpoint.response.${(await executionCheckpointDigestV1({ requestMessageId: request.messageId, payload }, this.options.crypto)).slice(7, 39)}`,
      tenantId: request.tenantId,
      meshId: request.meshId,
      policyDomainId: request.policyDomainId,
      senderPeerId: this.options.scope.peerId,
      senderInstanceId: this.options.scope.instanceId,
      audiencePeerId: request.senderPeerId,
      audienceInstanceId: request.senderInstanceId,
      membershipEpoch: membership.epoch,
      membershipConfigurationDigest: membership.configurationDigest,
      issuedAt: now.wallTime,
      expiresAtLogicalMs: request.expiresAtLogicalMs,
      payload,
      signing: this.options.signing,
      crypto: this.options.crypto,
    });
  }
}

export class CertifiedExecutionCheckpointAvailabilityV1 implements ExecutionCheckpointAvailabilityPortV1 {
  readonly #policy;

  constructor(
    readonly options: CertifiedExecutionCheckpointAvailabilityOptionsV1,
  ) {
    if (!options?.transport)
      throw new TypeError("execution_checkpoint_transport_required");
    this.#policy = validateExecutionCheckpointPolicyV1(options.policy);
  }

  async publish(
    input: Parameters<ExecutionCheckpointAvailabilityPortV1["publish"]>[0],
  ): Promise<ExecutionCheckpointReplicationCertificateV1> {
    const now = this.options.clock.now();
    const membership = await this.options.membership.currentBinding({
      logicalTimeMs: now.logicalTimeMs,
    });
    if (
      !membership ||
      !bound(
        membership,
        this.options.scope.peerId,
        this.options.scope.instanceId,
      )
    )
      throw new Error("execution_checkpoint_current_membership_unavailable");
    const artifact = await createExecutionCheckpointArtifactV1({
      scope: this.options.scope,
      membership,
      transfer: input.transfer,
      objectiveId: input.objectiveId,
      workItemId: input.workItemId,
      workItemRevision: input.workItemRevision,
      assignmentEpoch: input.assignmentEpoch,
      assignmentAuthorityId: input.assignmentAuthorityId,
      fencingToken: input.fencingToken,
      workContractDigest: input.workContractDigest,
      roleBindingDigest: input.roleBindingDigest,
      publishedAtLogicalMs: now.logicalTimeMs,
      expiresAtLogicalMs: now.logicalTimeMs + this.#policy.evidenceLifetimeMs,
      maximumArtifactBytes: this.#policy.maximumArtifactBytes,
      crypto: this.options.crypto,
    });
    const prior = await this.options.evidence.getCertificate(
      artifact.manifest.checkpointId,
    );
    if (prior) {
      const verified = await verifyCertificate({
        certificate: prior,
        options: this.options,
        policy: this.#policy,
        logicalTimeMs: now.logicalTimeMs,
        requireCurrent: true,
      });
      if (verified && verified.artifactDigest === artifact.artifactDigest)
        return verified;
      throw new Error("execution_checkpoint_certificate_conflict");
    }
    await this.options.artifacts.put(artifact);
    const publication = await createExecutionCheckpointPublicationV1({
      artifact,
      signing: this.options.signing,
      maximumArtifactBytes: this.#policy.maximumArtifactBytes,
      crypto: this.options.crypto,
    });
    const replicas = await selectExecutionCheckpointReplicasV1({
      membership,
      checkpointId: artifact.manifest.checkpointId,
      sourcePeerId: this.options.scope.peerId,
      replicaCount: this.#policy.replicaCount,
      crypto: this.options.crypto,
    });
    const receipts: ExecutionCheckpointReplicationCertificateV1["receipts"][number][] =
      [];
    for (const replica of replicas) {
      try {
        const response = await this.#exchange(
          replica,
          membership,
          now,
          { type: "checkpoint.artifact.store", publication },
          input.signal,
        );
        if (
          response?.payload.type === "checkpoint.artifact.stored" &&
          response.payload.checkpointId === artifact.manifest.checkpointId &&
          response.payload.artifactDigest === artifact.artifactDigest
        ) {
          receipts.push(
            response as ExecutionCheckpointReplicationCertificateV1["receipts"][number],
          );
          await this.options.evidence.putReceipt(
            response as ExecutionCheckpointReplicationCertificateV1["receipts"][number],
          );
        }
      } catch {
        /* other replicas may satisfy the threshold */
      }
    }
    if (receipts.length < this.#policy.writeThreshold)
      throw new Error("execution_checkpoint_write_threshold_unavailable");
    const certificate = await createExecutionCheckpointCertificateV1({
      artifact,
      policy: this.#policy,
      selectedReplicas: replicas,
      receipts,
      certifiedAtLogicalMs: now.logicalTimeMs,
      expiresAtLogicalMs: artifact.manifest.expiresAtLogicalMs,
      crypto: this.options.crypto,
    });
    let custody = 0;
    for (const receipt of receipts) {
      const replica = replicas.find(
        (entry) =>
          entry.peerId === receipt.senderPeerId &&
          entry.instanceId === receipt.senderInstanceId,
      );
      if (!replica) continue;
      try {
        const response = await this.#exchange(
          replica,
          membership,
          now,
          { type: "checkpoint.certificate.store", certificate },
          input.signal,
        );
        if (
          response?.payload.type === "checkpoint.certificate.stored" &&
          response.payload.certificateId === certificate.certificateId
        ) {
          custody += 1;
          await this.options.evidence.putCertificateAck(
            response as SignedExecutionCheckpointEnvelopeV1<
              Extract<
                ExecutionCheckpointResponsePayloadV1,
                { readonly type: "checkpoint.certificate.stored" }
              >
            >,
          );
        }
      } catch {
        /* continue until the custody threshold is known */
      }
    }
    if (custody < this.#policy.certificateCustodyThreshold)
      throw new Error("execution_checkpoint_certificate_custody_unavailable");
    return this.options.evidence.putCertificate(certificate);
  }

  async resolve(
    input: ExecutionCheckpointResolveInputV1,
  ): Promise<ExecutionCheckpointArtifactV1 | null> {
    if (!matchesScope(input, this.options.scope)) return null;
    const now = this.options.clock.now();
    const membership = await this.options.membership.currentBinding({
      logicalTimeMs: now.logicalTimeMs,
    });
    if (!membership || membership.memberInstances.length > 64) return null;
    let certificate = await this.options.evidence.getCertificate(
      input.checkpointId,
    );
    certificate = certificate
      ? await verifyCertificate({
          certificate,
          options: this.options,
          policy: this.#policy,
          logicalTimeMs: now.logicalTimeMs,
          requireCurrent: true,
        })
      : null;
    const peers = [...membership.memberInstances].sort((left, right) =>
      left.peerId < right.peerId
        ? -1
        : left.peerId > right.peerId
          ? 1
          : left.instanceId < right.instanceId
            ? -1
            : 1,
    );
    if (!certificate) {
      for (const replica of peers) {
        if (
          replica.peerId === this.options.scope.peerId &&
          replica.instanceId === this.options.scope.instanceId
        )
          continue;
        try {
          const response = await this.#exchange(
            replica,
            membership,
            now,
            {
              type: "checkpoint.certificate.get",
              checkpointId: input.checkpointId,
            },
            input.signal,
          );
          if (
            response?.payload.type !== "checkpoint.certificate.found" ||
            !response.payload.certificate
          )
            continue;
          const verified = await verifyCertificate({
            certificate: response.payload.certificate,
            options: this.options,
            policy: this.#policy,
            logicalTimeMs: now.logicalTimeMs,
            requireCurrent: true,
          });
          if (verified) {
            certificate = verified;
            break;
          }
        } catch {
          /* try another current member */
        }
      }
    }
    if (!certificate || !certificateMatchesResolve(certificate, input))
      return null;
    const local = await this.options.artifacts.get(input.checkpointId);
    if (
      local &&
      (await artifactMatches(
        local,
        certificate,
        input,
        this.#policy.maximumArtifactBytes,
        this.options.crypto,
      ))
    )
      return local;
    for (const receipt of certificate.receipts) {
      const replica = {
        peerId: receipt.senderPeerId,
        instanceId: receipt.senderInstanceId,
      };
      try {
        const response = await this.#exchange(
          replica,
          membership,
          now,
          {
            type: "checkpoint.artifact.get",
            checkpointId: input.checkpointId,
            artifactDigest: certificate.artifactDigest,
          },
          input.signal,
        );
        if (
          response?.payload.type !== "checkpoint.artifact.found" ||
          !response.payload.artifact
        )
          continue;
        if (
          await artifactMatches(
            response.payload.artifact,
            certificate,
            input,
            this.#policy.maximumArtifactBytes,
            this.options.crypto,
          )
        ) {
          const artifact = await this.options.artifacts.put(
            response.payload.artifact,
          );
          await this.options.evidence.putCertificate(certificate);
          return artifact;
        }
      } catch {
        /* try another receipt signer */
      }
    }
    return null;
  }

  async #exchange(
    replica: ExecutionCheckpointReplicaV1,
    membership: ExecutionCheckpointMembershipBindingV1,
    now: ReturnType<
      CertifiedExecutionCheckpointAvailabilityOptionsV1["clock"]["now"]
    >,
    payload: ExecutionCheckpointRequestPayloadV1,
    signal?: AbortSignal,
  ) {
    const messageId = `checkpoint.request.${(await executionCheckpointDigestV1({ senderPeerId: this.options.scope.peerId, replica, payload }, this.options.crypto)).slice(7, 39)}`;
    const request = await createExecutionCheckpointEnvelopeV1({
      messageId,
      tenantId: this.options.scope.tenantId,
      meshId: this.options.scope.meshId,
      policyDomainId: this.options.scope.policyDomainId,
      senderPeerId: this.options.scope.peerId,
      senderInstanceId: this.options.scope.instanceId,
      audiencePeerId: replica.peerId,
      audienceInstanceId: replica.instanceId,
      membershipEpoch: membership.epoch,
      membershipConfigurationDigest: membership.configurationDigest,
      issuedAt: now.wallTime,
      expiresAtLogicalMs:
        now.logicalTimeMs + Math.min(this.#policy.evidenceLifetimeMs, 60_000),
      payload,
      signing: this.options.signing,
      crypto: this.options.crypto,
    });
    const response = await this.options.transport.exchange({
      peerId: replica.peerId,
      request,
      ...(signal ? { signal } : {}),
    });
    const verified =
      await verifyExecutionCheckpointEnvelopeV1<ExecutionCheckpointResponsePayloadV1>(
        {
          envelope: response,
          membership: this.options.membership,
          logicalTimeMs: now.logicalTimeMs,
          requireCurrentMembership: true,
          crypto: this.options.crypto,
        },
      );
    return verified &&
      verified.audiencePeerId === this.options.scope.peerId &&
      verified.audienceInstanceId === this.options.scope.instanceId &&
      verified.senderPeerId === replica.peerId &&
      verified.senderInstanceId === replica.instanceId
      ? verified
      : null;
  }
}

export class InMemoryExecutionCheckpointTransportV1 implements ExecutionCheckpointTransportV1 {
  readonly #peers = new Map<string, ExecutionCheckpointReplicationPeerV1>();
  register(peerId: string, peer: ExecutionCheckpointReplicationPeerV1): void {
    this.#peers.set(required(peerId), peer);
  }
  unregister(peerId: string): void {
    this.#peers.delete(required(peerId));
  }
  async exchange(
    input: Parameters<ExecutionCheckpointTransportV1["exchange"]>[0],
  ) {
    if (input.signal?.aborted) throw input.signal.reason;
    return (await this.#peers.get(input.peerId)?.handle(input.request)) ?? null;
  }
}

async function verifyCertificate(input: {
  readonly certificate: unknown;
  readonly options: ExecutionCheckpointPeerOptionsV1;
  readonly policy: ReturnType<typeof validateExecutionCheckpointPolicyV1>;
  readonly logicalTimeMs: number;
  readonly requireCurrent: boolean;
}): Promise<ExecutionCheckpointReplicationCertificateV1 | null> {
  const certificate = await validateExecutionCheckpointCertificateV1(
    input.certificate,
    input.options.crypto,
  );
  if (
    !certificate ||
    !same(certificate.policy, input.policy) ||
    certificate.expiresAtLogicalMs <= input.logicalTimeMs ||
    !matchesScope(certificate, input.options.scope)
  )
    return null;
  const binding = input.requireCurrent
    ? await input.options.membership.currentBinding({
        logicalTimeMs: input.logicalTimeMs,
      })
    : await input.options.membership.resolveBinding({
        epoch: certificate.membershipEpoch,
        configurationDigest: certificate.membershipConfigurationDigest,
        logicalTimeMs: input.logicalTimeMs,
      });
  if (
    !binding ||
    binding.epoch !== certificate.membershipEpoch ||
    binding.configurationDigest !== certificate.membershipConfigurationDigest
  )
    return null;
  for (const receipt of certificate.receipts) {
    const verified = await verifyExecutionCheckpointEnvelopeV1({
      envelope: receipt,
      membership: input.options.membership,
      logicalTimeMs: input.logicalTimeMs,
      requireCurrentMembership: input.requireCurrent,
      crypto: input.options.crypto,
    });
    if (!verified || verified.payload.type !== "checkpoint.artifact.stored")
      return null;
  }
  return certificate;
}

function certificateMatchesResolve(
  certificate: ExecutionCheckpointReplicationCertificateV1,
  input: ExecutionCheckpointResolveInputV1,
): boolean {
  return (
    certificate.checkpointId === input.checkpointId &&
    certificate.tenantId === input.tenantId &&
    certificate.meshId === input.meshId &&
    certificate.policyDomainId === input.policyDomainId
  );
}

async function artifactMatches(
  artifact: ExecutionCheckpointArtifactV1,
  certificate: ExecutionCheckpointReplicationCertificateV1,
  input: ExecutionCheckpointResolveInputV1,
  maximumBytes: number,
  crypto?: Crypto,
): Promise<boolean> {
  const valid = await validateExecutionCheckpointArtifactV1(
    artifact,
    maximumBytes,
    crypto,
  );
  return Boolean(
    valid &&
    valid.artifactDigest === certificate.artifactDigest &&
    valid.manifest.checkpointId === input.checkpointId &&
    valid.manifest.objectiveId === input.objectiveId &&
    valid.manifest.workItemId === input.workItemId &&
    valid.manifest.workItemRevision === input.workItemRevision &&
    valid.manifest.assignmentEpoch === input.previousAssignmentEpoch,
  );
}

function matchesScope(
  value: {
    readonly tenantId: string;
    readonly meshId: string;
    readonly policyDomainId: string;
  },
  scope: {
    readonly tenantId: string;
    readonly meshId: string;
    readonly policyDomainId: string;
  },
): boolean {
  return (
    value.tenantId === scope.tenantId &&
    value.meshId === scope.meshId &&
    value.policyDomainId === scope.policyDomainId
  );
}
function bound(
  binding: ExecutionCheckpointMembershipBindingV1,
  peerId: string,
  instanceId: string,
): boolean {
  return binding.memberInstances.some(
    (entry) => entry.peerId === peerId && entry.instanceId === instanceId,
  );
}
function required(value: string): string {
  if (typeof value !== "string" || value.length === 0)
    throw new TypeError("execution_checkpoint_identifier_required");
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
async function immutablePut<T>(
  map: Map<string, T>,
  key: string,
  value: T,
  maximum: number,
  conflict: string,
): Promise<T> {
  const existing = map.get(key);
  if (existing) {
    if (!same(existing, value)) throw new Error(conflict);
    return existing;
  }
  if (map.size >= maximum)
    throw new RangeError("execution_checkpoint_evidence_capacity");
  map.set(key, value);
  return value;
}
