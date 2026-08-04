import { compareMeshTimestamps } from "@agentplat/mesh-protocol";
import type {
  CollectiveQuorumAssignmentAttestationPayloadV1,
  CollectiveQuorumAssignmentRequestPayloadV1,
  CollectiveQuorumPeerHandleResultV1,
  CollectiveQuorumPeerOptionsV1,
  CollectiveQuorumRecoveryAcceptPayloadV1,
  CollectiveQuorumRecoveryAcceptedPayloadV1,
  CollectiveQuorumRecoveryPreparePayloadV1,
  CollectiveQuorumRecoveryPromisePayloadV1,
  CollectiveQuorumRequestPayloadV1,
  CollectiveQuorumResponsePayloadV1,
  SignedCollectiveQuorumEnvelopeV1,
  UnsignedCollectiveQuorumEnvelopeV1,
} from "./contracts.js";
import {
  COLLECTIVE_QUORUM_PROTOCOL_V1,
  COLLECTIVE_QUORUM_SCHEMA_VERSION_V1,
} from "./contracts.js";
import {
  collectiveQuorumDigestV1,
  collectiveQuorumMessageIdV1,
  signCollectiveQuorumEnvelopeV1,
  verifyCollectiveQuorumEnvelopeV1,
} from "./crypto.js";

const DEFAULT_MAXIMUM_ENVELOPE_TTL_MS = 30_000;

/** Durable acceptor endpoint run independently by every participating peer. */
export class CollectiveQuorumPeerV1 {
  readonly #maximumEnvelopeTtlMs: number;

  constructor(readonly options: CollectiveQuorumPeerOptionsV1) {
    assertOptions(options);
    this.#maximumEnvelopeTtlMs =
      options.maximumEnvelopeTtlMs ?? DEFAULT_MAXIMUM_ENVELOPE_TTL_MS;
  }

  async handle(
    candidate: unknown,
  ): Promise<CollectiveQuorumPeerHandleResultV1> {
    const now = this.options.clock.now();
    const request =
      await verifyCollectiveQuorumEnvelopeV1<CollectiveQuorumRequestPayloadV1>({
        envelope: candidate,
        resolver: this.options.resolver,
        verifiedAt: now.wallTime,
        crypto: this.options.crypto,
      });
    if (!request) return { accepted: false, code: "invalid_envelope" };
    if (
      request.tenantId !== this.options.scope.tenantId ||
      request.meshId !== this.options.scope.meshId ||
      request.audiencePeerId !== this.options.scope.peerId
    )
      return { accepted: false, code: "wrong_audience" };
    const expiry = compareMeshTimestamps(now.wallTime, request.expiresAt);
    const maximumExpiry = new Date(
      Date.parse(request.issuedAt) + this.#maximumEnvelopeTtlMs,
    ).toISOString();
    const boundedTtl = compareMeshTimestamps(request.expiresAt, maximumExpiry);
    if (
      !expiry.ok ||
      expiry.value >= 0 ||
      !boundedTtl.ok ||
      boundedTtl.value > 0
    )
      return { accepted: false, code: "expired" };
    if (!(await this.#hasValidMembershipBinding(request)))
      return { accepted: false, code: "invalid_quorum" };
    if (!(await this.#isReady(request, now.logicalTimeMs)))
      return { accepted: false, code: "not_ready" };

    switch (request.payload.type) {
      case "assignment.confirm.request":
        return this.#assignment(
          request as SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumAssignmentRequestPayloadV1>,
          now.wallTime,
          now.logicalTimeMs,
        );
      case "recovery.prepare":
        return this.#prepare(
          request as SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumRecoveryPreparePayloadV1>,
          now.wallTime,
          now.logicalTimeMs,
        );
      case "recovery.accept":
        return this.#accept(
          request as SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumRecoveryAcceptPayloadV1>,
          now.wallTime,
          now.logicalTimeMs,
        );
    }
  }

  async #assignment(
    request: SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumAssignmentRequestPayloadV1>,
    wallTime: string,
    logicalTimeMs: number,
  ): Promise<CollectiveQuorumPeerHandleResultV1> {
    const payload = request.payload;
    const localPeerId = this.options.scope.peerId;
    if (
      this.options.scope.policyDomainId !== payload.policyDomainId ||
      (localPeerId !== payload.ownerPeerId &&
        !payload.eligibleWitnessPeerIds.includes(localPeerId))
    )
      return { accepted: false, code: "semantic_evidence_unavailable" };
    const evidence = await this.options.evidence.confirmAssignment({
      request: payload,
      localPeerId,
      logicalTimeMs,
    });
    const expectedRole =
      localPeerId === payload.ownerPeerId ? "owner" : "witness";
    if (!evidence || evidence.attesterRole !== expectedRole)
      return { accepted: false, code: "semantic_evidence_unavailable" };
    const value = {
      scopeDigest: payload.scopeDigest,
      assignmentSlotDigest: payload.assignmentSlotDigest,
      ownerPeerId: payload.ownerPeerId,
      acceptanceId: evidence.acceptanceId,
      assignmentAuthorityId: payload.assignmentAuthorityId,
      assignmentEpoch: payload.assignmentEpoch,
      fencingToken: payload.fencingToken,
      leaseRenewalId: payload.latestLeaseRenewalId,
      confirmedLeaseExpiresAt: evidence.confirmedLeaseExpiresAt,
    } as const;
    const valueDigest = await collectiveQuorumDigestV1(
      value,
      this.options.crypto,
    );
    const response = await this.options.repository.attestAssignment({
      assignmentSlotDigest: payload.assignmentSlotDigest,
      valueDigest,
      requestMessageId: request.messageId,
      create: async () => {
        const responsePayload: CollectiveQuorumAssignmentAttestationPayloadV1 =
          {
            type: "assignment.confirm.attestation",
            requestMessageId: request.messageId,
            scopeDigest: payload.scopeDigest,
            assignmentSlotDigest: payload.assignmentSlotDigest,
            attesterRole: evidence.attesterRole,
            attesterPeerId: localPeerId,
            ownerPeerId: payload.ownerPeerId,
            acceptanceId: evidence.acceptanceId,
            assignmentAuthorityId: payload.assignmentAuthorityId,
            assignmentEpoch: payload.assignmentEpoch,
            fencingToken: payload.fencingToken,
            leaseRenewalId: payload.latestLeaseRenewalId,
            confirmedLeaseExpiresAt: evidence.confirmedLeaseExpiresAt,
            confirmedAtLogicalMs: payload.requestedAtLogicalMs,
            ...membershipBindingFields(payload),
          };
        return this.#signResponse(
          responsePayload,
          request.senderPeerId,
          wallTime,
          boundedExpiry(
            wallTime,
            request.expiresAt,
            this.#maximumEnvelopeTtlMs,
          ),
        );
      },
    });
    return response
      ? { accepted: true, code: "accepted", response }
      : { accepted: false, code: "semantic_evidence_unavailable" };
  }

  async #prepare(
    request: SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumRecoveryPreparePayloadV1>,
    wallTime: string,
    logicalTimeMs: number,
  ): Promise<CollectiveQuorumPeerHandleResultV1> {
    const payload = request.payload;
    if (
      !payload.eligibleWitnessPeerIds.includes(this.options.scope.peerId) ||
      payload.requestedAtLogicalMs >= payload.objectiveExpiresAtLogicalMs
    )
      return { accepted: false, code: "semantic_evidence_unavailable" };
    const proposalsDigest = await collectiveQuorumDigestV1(
      payload.proposals,
      this.options.crypto,
    );
    if (proposalsDigest !== payload.proposalsDigest)
      return { accepted: false, code: "invalid_envelope" };
    const response = await this.options.repository.promiseRecovery({
      scopeDigest: payload.scopeDigest,
      ballot: payload.ballot,
      requestMessageId: request.messageId,
      create: async (accepted) => {
        const responsePayload: CollectiveQuorumRecoveryPromisePayloadV1 = {
          type: "recovery.promise",
          requestMessageId: request.messageId,
          scopeDigest: payload.scopeDigest,
          ballot: payload.ballot,
          witnessPeerId: this.options.scope.peerId,
          accepted,
          promisedAtLogicalMs: Math.max(
            payload.requestedAtLogicalMs,
            logicalTimeMs,
          ),
          ...membershipBindingFields(payload),
        };
        return this.#signResponse(
          responsePayload,
          request.senderPeerId,
          wallTime,
          boundedExpiry(
            wallTime,
            request.expiresAt,
            this.#maximumEnvelopeTtlMs,
          ),
        );
      },
    });
    return response
      ? { accepted: true, code: "accepted", response }
      : { accepted: false, code: "ballot_rejected" };
  }

  async #accept(
    request: SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumRecoveryAcceptPayloadV1>,
    wallTime: string,
    logicalTimeMs: number,
  ): Promise<CollectiveQuorumPeerHandleResultV1> {
    const payload = request.payload;
    if (
      !payload.eligibleWitnessPeerIds.includes(this.options.scope.peerId) ||
      payload.promiseMessageIds.length < payload.recoveryWitnessThreshold ||
      payload.requestedAtLogicalMs >= payload.expiresAtLogicalMs ||
      payload.expiresAtLogicalMs > payload.objectiveExpiresAtLogicalMs
    )
      return { accepted: false, code: "invalid_quorum" };
    const proposalsDigest = await collectiveQuorumDigestV1(
      payload.proposals,
      this.options.crypto,
    );
    if (proposalsDigest !== payload.proposalsDigest)
      return { accepted: false, code: "invalid_envelope" };
    const semanticallyAccepted =
      await this.options.evidence.acceptsRecoveryValue({
        request: payload,
        selected: payload.selected,
        localPeerId: this.options.scope.peerId,
        logicalTimeMs,
      });
    if (!semanticallyAccepted)
      return { accepted: false, code: "semantic_evidence_unavailable" };
    const response = await this.options.repository.acceptRecovery({
      scopeDigest: payload.scopeDigest,
      ballot: payload.ballot,
      value: payload.selected,
      requestMessageId: request.messageId,
      create: async () => {
        const responsePayload: CollectiveQuorumRecoveryAcceptedPayloadV1 = {
          type: "recovery.accepted",
          requestMessageId: request.messageId,
          scopeDigest: payload.scopeDigest,
          ballot: payload.ballot,
          selected: payload.selected,
          witnessPeerId: this.options.scope.peerId,
          acceptedAtLogicalMs: payload.requestedAtLogicalMs,
          expiresAtLogicalMs: payload.expiresAtLogicalMs,
          ...membershipBindingFields(payload),
        };
        return this.#signResponse(
          responsePayload,
          request.senderPeerId,
          wallTime,
          boundedExpiry(
            wallTime,
            request.expiresAt,
            this.#maximumEnvelopeTtlMs,
          ),
        );
      },
    });
    return response
      ? { accepted: true, code: "accepted", response }
      : { accepted: false, code: "ballot_rejected" };
  }

  async #signResponse<TPayload extends CollectiveQuorumResponsePayloadV1>(
    payload: TPayload,
    audiencePeerId: string,
    issuedAt: string,
    expiresAt: string,
  ): Promise<SignedCollectiveQuorumEnvelopeV1<TPayload>> {
    const scope = this.options.scope;
    const messageId = await collectiveQuorumMessageIdV1(
      payload.type.replaceAll(".", "-"),
      { payload, audiencePeerId, senderPeerId: scope.peerId, issuedAt },
      this.options.crypto,
    );
    const envelope: UnsignedCollectiveQuorumEnvelopeV1<TPayload> = {
      protocol: COLLECTIVE_QUORUM_PROTOCOL_V1,
      schemaVersion: COLLECTIVE_QUORUM_SCHEMA_VERSION_V1,
      messageId,
      tenantId: scope.tenantId,
      meshId: scope.meshId,
      senderPeerId: scope.peerId,
      senderInstanceId: scope.instanceId,
      audiencePeerId,
      issuedAt,
      expiresAt,
      payload,
      proof: {
        algorithm: this.options.signing.algorithm,
        keyId: this.options.signing.keyId,
      },
    };
    return signCollectiveQuorumEnvelopeV1({
      envelope,
      privateKey: this.options.signing.privateKey,
      crypto: this.options.crypto,
    });
  }

  async #hasValidMembershipBinding(
    request: SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumRequestPayloadV1>,
  ): Promise<boolean> {
    const payload = request.payload;
    const hasEpoch = payload.membershipEpoch !== undefined;
    const hasDigest = payload.membershipConfigurationDigest !== undefined;
    if (!this.options.membership) return !hasEpoch && !hasDigest;
    if (!hasEpoch || !hasDigest) return false;
    const binding = await this.options.membership.resolveBinding({
      epoch: payload.membershipEpoch!,
      configurationDigest: payload.membershipConfigurationDigest!,
      logicalTimeMs: payload.requestedAtLogicalMs,
    });
    if (!binding) return false;
    const senderInstance = binding.memberInstances.find(
      ({ peerId }) => peerId === request.senderPeerId,
    );
    const localInstance = binding.memberInstances.find(
      ({ peerId }) => peerId === this.options.scope.peerId,
    );
    if (
      senderInstance?.instanceId !== request.senderInstanceId ||
      localInstance?.instanceId !== this.options.scope.instanceId
    )
      return false;
    const required = new Set<string>([
      request.senderPeerId,
      this.options.scope.peerId,
    ]);
    if (payload.type === "assignment.confirm.request") {
      required.add(payload.ownerPeerId);
      required.add(payload.assignedPeerId);
      for (const peerId of payload.eligibleWitnessPeerIds) required.add(peerId);
    } else {
      required.add(payload.ballot.proposerPeerId);
      for (const peerId of payload.eligibleWitnessPeerIds) required.add(peerId);
      for (const proposal of payload.proposals)
        required.add(proposal.proposedAssigneePeerId);
    }
    const members = new Set(binding.memberPeerIds);
    return [...required].every((peerId) => members.has(peerId));
  }

  async #isReady(
    request: SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumRequestPayloadV1>,
    logicalTimeMs: number,
  ): Promise<boolean> {
    if (!this.options.readiness) return true;
    const operation =
      request.payload.type === "assignment.confirm.request"
        ? "assignment_attestation"
        : request.payload.type === "recovery.prepare"
          ? "recovery_promise"
          : "recovery_acceptance";
    try {
      const decision = await this.options.readiness.check({
        operation,
        policyDomainId: this.options.scope.policyDomainId,
        scopeDigest: request.payload.scopeDigest,
        ...(request.payload.membershipEpoch === undefined
          ? {}
          : { membershipEpoch: request.payload.membershipEpoch }),
        ...(request.payload.membershipConfigurationDigest === undefined
          ? {}
          : {
              membershipConfigurationDigest:
                request.payload.membershipConfigurationDigest,
            }),
        logicalTimeMs,
      });
      return decision?.ready === true;
    } catch {
      return false;
    }
  }
}

function membershipBindingFields(payload: {
  readonly membershipEpoch?: number;
  readonly membershipConfigurationDigest?: string;
}):
  | Record<string, never>
  | {
      readonly membershipEpoch: number;
      readonly membershipConfigurationDigest: string;
    } {
  return payload.membershipEpoch !== undefined &&
    payload.membershipConfigurationDigest !== undefined
    ? {
        membershipEpoch: payload.membershipEpoch,
        membershipConfigurationDigest: payload.membershipConfigurationDigest,
      }
    : {};
}

function assertOptions(options: CollectiveQuorumPeerOptionsV1): void {
  if (
    !options?.scope?.tenantId ||
    !options.scope.meshId ||
    !options.scope.peerId ||
    !options.scope.instanceId ||
    !options.scope.policyDomainId ||
    !options.signing?.privateKey ||
    !options.signing.keyId ||
    !options.resolver ||
    !options.repository ||
    !options.evidence ||
    (options.readiness !== undefined &&
      typeof options.readiness.check !== "function") ||
    !options.clock
  )
    throw new TypeError("Collective quorum peer options are required");
  const ttl = options.maximumEnvelopeTtlMs ?? DEFAULT_MAXIMUM_ENVELOPE_TTL_MS;
  if (!Number.isSafeInteger(ttl) || ttl < 1 || ttl > 300_000)
    throw new RangeError("maximumEnvelopeTtlMs is out of range");
}

function boundedExpiry(
  issuedAt: string,
  requestExpiresAt: string,
  maximumTtlMs: number,
): string {
  const local = new Date(Date.parse(issuedAt) + maximumTtlMs).toISOString();
  const order = compareMeshTimestamps(local, requestExpiresAt);
  return order.ok && order.value < 0 ? local : requestExpiresAt;
}
