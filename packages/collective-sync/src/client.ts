import { MESH_SIGNATURE_ALGORITHM } from "@agentplat/mesh-protocol";
import type { CollectiveQuorumMembershipBindingV1 } from "@agentplat/collective-quorum";
import type {
  CollectiveCatchUpCertificateV1,
  CollectiveSyncAttestationPayloadV1,
  CollectiveSyncClockV1,
  CollectiveSyncDomainAdapterV1,
  CollectiveSyncFrontierV1,
  CollectiveSyncMembershipV1,
  CollectiveSyncPayloadV1,
  CollectiveSyncRepositoryV1,
  CollectiveSyncRequestPayloadV1,
  CollectiveSyncResponsePayloadV1,
  CollectiveSyncScopeV1,
  CollectiveSyncSessionV1,
  CollectiveSyncSigningV1,
  CollectiveSyncTransportV1,
  SignedCollectiveSyncEnvelopeV1,
  UnsignedCollectiveSyncEnvelopeV1,
} from "./contracts.js";
import {
  COLLECTIVE_SYNC_MAX_CANONICAL_BYTES_V1,
  COLLECTIVE_SYNC_MAX_RECORDS_PER_CHUNK_V1,
  COLLECTIVE_SYNC_PROTOCOL_V1,
  COLLECTIVE_SYNC_SCHEMA_VERSION_V1,
} from "./contracts.js";
import {
  collectiveSyncMessageIdV1,
  signCollectiveSyncEnvelopeV1,
  verifyCollectiveSyncEnvelopeV1,
} from "./crypto.js";
import {
  collectiveSyncChunkDigestV1,
  compareCollectiveSyncFrontiersV1,
  createCollectiveCatchUpCertificateV1,
  verifyCollectiveSyncFrontierV1,
  verifyCollectiveSyncRecordV1,
} from "./records.js";

export interface CollectiveSyncClientOptionsV1 {
  readonly scope: CollectiveSyncScopeV1;
  readonly signing: CollectiveSyncSigningV1;
  readonly membership: CollectiveSyncMembershipV1;
  readonly repository: CollectiveSyncRepositoryV1;
  readonly adapter: CollectiveSyncDomainAdapterV1;
  readonly transport: CollectiveSyncTransportV1;
  readonly clock: CollectiveSyncClockV1;
  readonly requestTtlMs?: number;
  /** Largest signed response lifetime accepted from another member. */
  readonly maximumEnvelopeTtlMs?: number;
  readonly threshold?: number;
  readonly maximumRecordsPerChunk?: number;
  readonly maximumBytesPerChunk?: number;
}

export interface CollectiveSyncCatchUpInputV1 {
  readonly syncDomain: string;
  readonly sessionId?: string;
  readonly sourcePeerIds?: readonly string[];
  readonly signal?: AbortSignal;
}

/** Resumable threshold-corroborated selective catch-up orchestrator. */
export class CollectiveSyncClientV1 {
  readonly #ttl: number;
  readonly #maximumEnvelopeTtl: number;
  readonly #maxRecords: number;
  readonly #maxBytes: number;
  constructor(readonly options: CollectiveSyncClientOptionsV1) {
    if (
      !options?.scope ||
      !options.signing ||
      !options.membership ||
      !options.repository ||
      !options.adapter ||
      !options.transport ||
      !options.clock
    )
      throw new TypeError("collective sync client options are required");
    if (options.signing.algorithm !== MESH_SIGNATURE_ALGORITHM)
      throw new TypeError("collective sync requires Ed25519");
    this.#ttl = bounded(
      options.requestTtlMs ?? 30_000,
      1_000,
      300_000,
      "requestTtlMs",
    );
    this.#maximumEnvelopeTtl = bounded(
      options.maximumEnvelopeTtlMs ?? 30_000,
      1_000,
      300_000,
      "maximumEnvelopeTtlMs",
    );
    this.#maxRecords = bounded(
      options.maximumRecordsPerChunk ?? 128,
      1,
      COLLECTIVE_SYNC_MAX_RECORDS_PER_CHUNK_V1,
      "maximumRecordsPerChunk",
    );
    this.#maxBytes = bounded(
      options.maximumBytesPerChunk ?? 524_288,
      1_024,
      COLLECTIVE_SYNC_MAX_CANONICAL_BYTES_V1,
      "maximumBytesPerChunk",
    );
  }

  async catchUp(
    input: CollectiveSyncCatchUpInputV1,
  ): Promise<CollectiveCatchUpCertificateV1> {
    if (!input?.syncDomain) throw new TypeError("syncDomain is required");
    const initial = this.options.clock.now();
    const binding = await this.options.membership.currentBinding({
      logicalTimeMs: initial.logicalTimeMs,
    });
    if (
      !binding ||
      !boundInstance(
        binding,
        this.options.scope.peerId,
        this.options.scope.instanceId,
      )
    )
      throw new Error("sync_local_membership_unavailable");
    const threshold = this.#threshold(binding);
    const available = new Set(
      binding.memberPeerIds.filter(
        (peerId) => peerId !== this.options.scope.peerId,
      ),
    );
    const sourcePeerIds = Object.freeze(
      [...new Set(input.sourcePeerIds ?? [...available])]
        .filter((peerId) => available.has(peerId))
        .sort(),
    );
    if (sourcePeerIds.length < threshold)
      throw new Error("sync_sources_below_threshold");
    const sessionId =
      input.sessionId ??
      (await collectiveSyncMessageIdV1("session", {
        tenantId: this.options.scope.tenantId,
        meshId: this.options.scope.meshId,
        peerId: this.options.scope.peerId,
        instanceId: this.options.scope.instanceId,
        syncDomain: input.syncDomain,
        membershipEpoch: binding.epoch,
        membershipConfigurationDigest: binding.configurationDigest,
      }));
    const restored = await this.options.repository.loadSession(sessionId);
    if (
      restored &&
      (restored.membershipEpoch !== binding.epoch ||
        restored.membershipConfigurationDigest !==
          binding.configurationDigest ||
        restored.syncDomain !== input.syncDomain)
    )
      throw new Error("sync_session_membership_conflict");
    let session: CollectiveSyncSessionV1 =
      restored ??
      Object.freeze({
        schemaVersion: 1,
        sessionId,
        syncDomain: input.syncDomain,
        membershipEpoch: binding.epoch,
        membershipConfigurationDigest: binding.configurationDigest,
        targetFrontier: null,
        sourcePeerIds: Object.freeze([]),
        cursors: Object.freeze([]),
        importedRecordDigests: Object.freeze([]),
        status: "discovering",
        certificateId: null,
        failureCode: null,
        updatedAtLogicalMs: initial.logicalTimeMs,
      });
    await this.options.repository.saveSession(session);
    try {
      const local = await this.options.repository.frontier({
        syncDomain: input.syncDomain,
        membership: binding,
      });
      const responses = await Promise.all(
        sourcePeerIds.map(async (peerId) => {
          try {
            const request = await this.#request(peerId, binding, {
              type: "sync.frontier.request",
              sessionId,
              syncDomain: input.syncDomain,
              membershipEpoch: binding.epoch,
              membershipConfigurationDigest: binding.configurationDigest,
              localFrontier: local,
              requestedAtLogicalMs: this.options.clock.now().logicalTimeMs,
            });
            const response = await this.options.transport.exchange({
              peerId,
              request,
              ...(input.signal ? { signal: input.signal } : {}),
            });
            const valid = await this.#response(
              response,
              request,
              peerId,
              binding,
            );
            if (!valid || valid.payload.type !== "sync.frontier.response")
              return null;
            const frontier = await verifyCollectiveSyncFrontierV1(
              valid.payload.frontier,
            );
            return frontier && frontier.syncDomain === input.syncDomain
              ? { peerId, frontier }
              : null;
          } catch {
            return null;
          }
        }),
      );
      const selected = selectFrontier(
        responses.filter(
          (entry): entry is NonNullable<typeof entry> => entry !== null,
        ),
        threshold,
      );
      if (!selected) throw new Error("sync_frontier_threshold_unavailable");
      const relation = compareCollectiveSyncFrontiersV1(
        local,
        selected.frontier,
      );
      if (relation === "ahead" || relation === "diverged")
        throw new Error("sync_frontier_diverged");
      session = this.#session(session, {
        targetFrontier: selected.frontier,
        sourcePeerIds: selected.peerIds,
        cursors:
          relation === "equal" ? selected.frontier.entries : local.entries,
        status: relation === "equal" ? "certifying" : "transferring",
      });
      await this.options.repository.saveSession(session);

      let sourceIndex = 0;
      while (session.status === "transferring") {
        input.signal?.throwIfAborted();
        await this.#assertMembership(binding);
        const sourcePeerId =
          selected.peerIds[sourceIndex % selected.peerIds.length]!;
        sourceIndex += 1;
        const request = await this.#request(sourcePeerId, binding, {
          type: "sync.chunk.request",
          sessionId,
          syncDomain: input.syncDomain,
          membershipEpoch: binding.epoch,
          membershipConfigurationDigest: binding.configurationDigest,
          targetFrontierDigest: selected.frontier.frontierDigest,
          cursors: session.cursors,
          maximumRecords: this.#maxRecords,
          maximumBytes: this.#maxBytes,
          requestedAtLogicalMs: this.options.clock.now().logicalTimeMs,
        });
        const raw = await this.options.transport.exchange({
          peerId: sourcePeerId,
          request,
          ...(input.signal ? { signal: input.signal } : {}),
        });
        const response = await this.#response(
          raw,
          request,
          sourcePeerId,
          binding,
        );
        if (!response || response.payload.type !== "sync.chunk")
          throw new Error("sync_chunk_unavailable");
        const payload = response.payload;
        if (
          payload.sourceFrontier.frontierDigest !==
          selected.frontier.frontierDigest
        )
          throw new Error("sync_chunk_frontier_mismatch");
        const expectedChunk = await collectiveSyncChunkDigestV1({
          sessionId,
          sourceFrontierDigest: payload.sourceFrontier.frontierDigest,
          records: payload.records,
          nextCursors: payload.nextCursors,
          hasMore: payload.hasMore,
        });
        if (expectedChunk !== payload.chunkDigest)
          throw new Error("sync_chunk_digest_mismatch");
        if (payload.hasMore && payload.records.length === 0)
          throw new Error("sync_chunk_no_progress");
        const records = [];
        for (const candidate of payload.records) {
          const record = await verifyCollectiveSyncRecordV1(candidate);
          if (!record || !(await this.options.adapter.validate(record)))
            throw new Error("sync_domain_validation_rejected");
          records.push(record);
        }
        const appended = await this.options.repository.append({
          syncDomain: input.syncDomain,
          membership: binding,
          records,
        });
        await this.options.adapter.replay(records);
        const imported = Object.freeze([
          ...new Set([
            ...session.importedRecordDigests,
            ...appended.acceptedRecordDigests,
          ]),
        ]);
        session = this.#session(session, {
          cursors: payload.nextCursors,
          importedRecordDigests: imported,
          status: payload.hasMore ? "transferring" : "certifying",
        });
        await this.options.repository.saveSession(session);
        await this.#sendReceipt(
          sourcePeerId,
          binding,
          session,
          payload.chunkDigest,
          payload.sourceFrontier.frontierDigest,
          appended.acceptedRecordDigests,
          appended.frontier.frontierDigest,
          input.signal,
        );
      }

      const reached = await this.options.repository.frontier({
        syncDomain: input.syncDomain,
        membership: binding,
      });
      if (reached.frontierDigest !== selected.frontier.frontierDigest)
        throw new Error("sync_target_frontier_not_reached");
      const attestations = await Promise.all(
        selected.peerIds.map(async (peerId) => {
          try {
            const request = await this.#request(peerId, binding, {
              type: "sync.attestation.request",
              sessionId,
              syncDomain: input.syncDomain,
              targetPeerId: this.options.scope.peerId,
              targetInstanceId: this.options.scope.instanceId,
              membershipEpoch: binding.epoch,
              membershipConfigurationDigest: binding.configurationDigest,
              frontier: reached,
              requestedAtLogicalMs: this.options.clock.now().logicalTimeMs,
            });
            const raw = await this.options.transport.exchange({
              peerId,
              request,
              ...(input.signal ? { signal: input.signal } : {}),
            });
            const response = await this.#response(
              raw,
              request,
              peerId,
              binding,
            );
            return response?.payload.type === "sync.attestation" &&
              response.payload.frontierDigest === reached.frontierDigest &&
              response.payload.attesterPeerId === peerId
              ? (response as SignedCollectiveSyncEnvelopeV1<CollectiveSyncAttestationPayloadV1>)
              : null;
          } catch {
            return null;
          }
        }),
      );
      const validAttestations = attestations.filter(
        (
          entry,
        ): entry is SignedCollectiveSyncEnvelopeV1<CollectiveSyncAttestationPayloadV1> =>
          entry !== null,
      );
      if (
        new Set(validAttestations.map((entry) => entry.senderPeerId)).size <
        threshold
      )
        throw new Error("sync_attestation_threshold_unavailable");
      const certifiedAtLogicalMs = this.options.clock.now().logicalTimeMs;
      const certificate = await createCollectiveCatchUpCertificateV1({
        tenantId: this.options.scope.tenantId,
        meshId: this.options.scope.meshId,
        policyDomainId: this.options.scope.policyDomainId,
        syncDomain: input.syncDomain,
        targetPeerId: this.options.scope.peerId,
        targetInstanceId: this.options.scope.instanceId,
        membership: binding,
        frontier: reached,
        threshold,
        attestations: validAttestations,
        certifiedAtLogicalMs,
      });
      await this.options.repository.saveCertificate(certificate);
      session = this.#session(session, {
        status: "ready",
        certificateId: certificate.certificateId,
      });
      await this.options.repository.saveSession(session);
      return certificate;
    } catch (error) {
      const failureCode = safeFailureCode(error);
      await this.options.repository.saveSession(
        this.#session(session, {
          status: "failed",
          failureCode,
        }),
      );
      throw error;
    }
  }

  async #sendReceipt(
    peerId: string,
    binding: CollectiveQuorumMembershipBindingV1,
    session: CollectiveSyncSessionV1,
    chunkDigest: string,
    sourceFrontierDigest: string,
    importedRecordDigests: readonly string[],
    localFrontierDigest: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const request = await this.#request(peerId, binding, {
      type: "sync.receipt",
      sessionId: session.sessionId,
      syncDomain: session.syncDomain,
      membershipEpoch: binding.epoch,
      membershipConfigurationDigest: binding.configurationDigest,
      sourceFrontierDigest,
      chunkDigest,
      importedRecordDigests,
      localFrontierDigest,
      receivedAtLogicalMs: this.options.clock.now().logicalTimeMs,
    });
    const raw = await this.options.transport.exchange({
      peerId,
      request,
      ...(signal ? { signal } : {}),
    });
    const response = await this.#response(raw, request, peerId, binding);
    if (
      !response ||
      response.payload.type !== "sync.receipt.ack" ||
      response.payload.chunkDigest !== chunkDigest
    )
      throw new Error("sync_receipt_not_acknowledged");
  }

  async #request<TPayload extends CollectiveSyncRequestPayloadV1>(
    peerId: string,
    binding: CollectiveQuorumMembershipBindingV1,
    payload: TPayload,
  ): Promise<SignedCollectiveSyncEnvelopeV1<TPayload>> {
    const instance = binding.memberInstances.find(
      (entry) => entry.peerId === peerId,
    )?.instanceId;
    if (!instance) throw new Error("sync_target_instance_unavailable");
    const now = this.options.clock.now();
    const messageId = await collectiveSyncMessageIdV1("request", {
      senderPeerId: this.options.scope.peerId,
      senderInstanceId: this.options.scope.instanceId,
      audiencePeerId: peerId,
      audienceInstanceId: instance,
      payload,
    });
    const envelope: UnsignedCollectiveSyncEnvelopeV1<TPayload> = {
      protocol: COLLECTIVE_SYNC_PROTOCOL_V1,
      schemaVersion: COLLECTIVE_SYNC_SCHEMA_VERSION_V1,
      messageId,
      tenantId: this.options.scope.tenantId,
      meshId: this.options.scope.meshId,
      policyDomainId: this.options.scope.policyDomainId,
      senderPeerId: this.options.scope.peerId,
      senderInstanceId: this.options.scope.instanceId,
      audiencePeerId: peerId,
      audienceInstanceId: instance,
      issuedAt: now.wallTime,
      expiresAt: new Date(Date.parse(now.wallTime) + this.#ttl).toISOString(),
      payload,
      proof: {
        algorithm: this.options.signing.algorithm,
        keyId: this.options.signing.keyId,
      },
    };
    return signCollectiveSyncEnvelopeV1({
      envelope,
      privateKey: this.options.signing.privateKey,
    });
  }

  async #response(
    raw: unknown,
    request: SignedCollectiveSyncEnvelopeV1,
    peerId: string,
    binding: CollectiveQuorumMembershipBindingV1,
  ): Promise<SignedCollectiveSyncEnvelopeV1<CollectiveSyncResponsePayloadV1> | null> {
    const now = this.options.clock.now();
    const response =
      await verifyCollectiveSyncEnvelopeV1<CollectiveSyncResponsePayloadV1>({
        envelope: raw,
        resolver: this.options.membership,
        verifiedAt: now.wallTime,
      });
    const instance = binding.memberInstances.find(
      (entry) => entry.peerId === peerId,
    )?.instanceId;
    if (
      !response ||
      !instance ||
      response.tenantId !== this.options.scope.tenantId ||
      response.meshId !== this.options.scope.meshId ||
      response.policyDomainId !== this.options.scope.policyDomainId ||
      response.senderPeerId !== peerId ||
      response.senderInstanceId !== instance ||
      response.audiencePeerId !== this.options.scope.peerId ||
      response.audienceInstanceId !== this.options.scope.instanceId ||
      response.payload.membershipEpoch !== binding.epoch ||
      response.payload.membershipConfigurationDigest !==
        binding.configurationDigest ||
      !("requestMessageId" in response.payload) ||
      response.payload.requestMessageId !== request.messageId ||
      !validEnvelopeTime(
        response.issuedAt,
        response.expiresAt,
        now.wallTime,
        this.#maximumEnvelopeTtl,
      )
    )
      return null;
    return response;
  }

  #threshold(binding: CollectiveQuorumMembershipBindingV1): number {
    const majority = Math.floor(binding.memberPeerIds.length / 2) + 1;
    return bounded(
      this.options.threshold ?? majority,
      majority,
      binding.memberPeerIds.length,
      "threshold",
    );
  }
  async #assertMembership(
    binding: CollectiveQuorumMembershipBindingV1,
  ): Promise<void> {
    const current = await this.options.membership.currentBinding({
      logicalTimeMs: this.options.clock.now().logicalTimeMs,
    });
    if (
      !current ||
      current.epoch !== binding.epoch ||
      current.configurationDigest !== binding.configurationDigest
    )
      throw new Error("sync_membership_changed");
  }
  #session(
    session: CollectiveSyncSessionV1,
    change: Partial<CollectiveSyncSessionV1>,
  ): CollectiveSyncSessionV1 {
    if (session.updatedAtLogicalMs >= Number.MAX_SAFE_INTEGER)
      throw new Error("sync_session_logical_time_exhausted");
    const observedLogicalTimeMs =
      change.updatedAtLogicalMs ?? this.options.clock.now().logicalTimeMs;
    return Object.freeze({
      ...session,
      ...change,
      schemaVersion: 1,
      failureCode:
        change.status === "failed"
          ? (change.failureCode ?? "sync_failed")
          : null,
      updatedAtLogicalMs: Math.max(
        observedLogicalTimeMs,
        session.updatedAtLogicalMs + 1,
      ),
    });
  }
}

function selectFrontier(
  responses: readonly {
    readonly peerId: string;
    readonly frontier: CollectiveSyncFrontierV1;
  }[],
  threshold: number,
): {
  readonly frontier: CollectiveSyncFrontierV1;
  readonly peerIds: readonly string[];
} | null {
  const groups = new Map<
    string,
    { frontier: CollectiveSyncFrontierV1; peerIds: string[] }
  >();
  for (const response of responses) {
    const group = groups.get(response.frontier.frontierDigest) ?? {
      frontier: response.frontier,
      peerIds: [],
    };
    group.peerIds.push(response.peerId);
    groups.set(response.frontier.frontierDigest, group);
  }
  const eligible = [...groups.values()].filter(
    ({ peerIds }) => new Set(peerIds).size >= threshold,
  );
  eligible.sort((left, right) => {
    const leftHighWater = left.frontier.entries.reduce(
      (sum, entry) => sum + entry.sequence,
      0,
    );
    const rightHighWater = right.frontier.entries.reduce(
      (sum, entry) => sum + entry.sequence,
      0,
    );
    return (
      rightHighWater - leftHighWater ||
      left.frontier.frontierDigest.localeCompare(right.frontier.frontierDigest)
    );
  });
  const selected = eligible[0];
  return selected
    ? Object.freeze({
        frontier: selected.frontier,
        peerIds: Object.freeze([...new Set(selected.peerIds)].sort()),
      })
    : null;
}
function boundInstance(
  binding: CollectiveQuorumMembershipBindingV1,
  peerId: string,
  instanceId: string,
): boolean {
  return binding.memberInstances.some(
    (entry) => entry.peerId === peerId && entry.instanceId === instanceId,
  );
}
function bounded(
  value: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new TypeError(`${name} is out of range`);
  return value;
}
function safeFailureCode(error: unknown): string {
  const raw = error instanceof Error ? error.message : "sync_failed";
  return /^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u.test(raw)
    ? raw
    : "sync_failed";
}

function validEnvelopeTime(
  issuedAt: string,
  expiresAt: string,
  now: string,
  maximumTtlMs: number,
): boolean {
  const issued = Date.parse(issuedAt);
  const expires = Date.parse(expiresAt);
  const current = Date.parse(now);
  return (
    Number.isFinite(issued) &&
    Number.isFinite(expires) &&
    Number.isFinite(current) &&
    current < expires &&
    expires - issued <= maximumTtlMs
  );
}
