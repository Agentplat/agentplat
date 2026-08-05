import {
  validatePlanningFragmentRepositoryRecordV1,
  type PlanningArtifactAvailabilityRequestV1,
  type PlanningFragmentRepositoryRecordV1,
  type PlanningFragmentRepositoryV1,
} from "@agentplat/collective-planning/mesh";
import {
  createCollectiveSyncRecordV1,
  verifyCollectiveSyncRecordV1,
  type CollectiveSyncDomainAdapterV1,
  type CollectiveSyncRecordV1,
} from "@agentplat/collective-sync";

import {
  PLANNING_ARTIFACT_PAYLOAD_TYPE_V1,
  PLANNING_ARTIFACT_SYNC_DOMAIN_V1,
  type CollectiveSyncPlanningArtifactAvailabilityOptionsV1,
  type PlanningArtifactSyncAdapterOptionsV1,
  type PlanningArtifactSyncPayloadV1,
  type ReplicatedPlanningFragmentRepositoryOptionsV1,
  type SignedPlanningArtifactPublicationV1,
} from "./contracts.js";
import {
  createPlanningArtifactPublicationV1,
  planningArtifactDigestV1,
  planningArtifactStreamIdV1,
  verifyPlanningArtifactPublicationV1,
} from "./publication.js";

/** Wrap one producer's durable repository with immutable signed publication. */
export class ReplicatedPlanningFragmentRepositoryV1 implements PlanningFragmentRepositoryV1 {
  constructor(readonly options: ReplicatedPlanningFragmentRepositoryOptionsV1) {
    if (
      !options?.scope ||
      !options.repository ||
      !options.syncRepository ||
      !options.membership ||
      !options.signing ||
      !options.clock
    )
      throw new TypeError("planning_artifact_repository_options_required");
  }

  async put(
    input: PlanningFragmentRepositoryRecordV1,
  ): Promise<PlanningFragmentRepositoryRecordV1> {
    const record = validatePlanningFragmentRepositoryRecordV1(input);
    assertProducerScope(record, this.options.scope);

    // The artifact itself is durable before an offer can reference it.
    const durable = await this.options.repository.put(record);
    const streamId = planningArtifactStreamIdV1(durable.fragmentDigest);
    const existing = await this.options.syncRepository.readRecord({
      syncDomain: PLANNING_ARTIFACT_SYNC_DOMAIN_V1,
      streamId,
      sequence: 1,
    });
    if (existing) {
      const publication = await validatePlanningArtifactSyncRecordV1(existing, {
        scope: scopeWithoutProducer(this.options.scope),
        repository: this.options.repository,
        membership: this.options.membership,
        clock: this.options.clock,
        maximumArtifactBytes: this.options.maximumArtifactBytes,
        crypto: this.options.crypto,
      });
      if (
        !publication ||
        publication.sourcePeerId !== this.options.scope.peerId ||
        publication.sourceInstanceId !== this.options.scope.instanceId ||
        publication.artifactDigest !==
          (await planningArtifactDigestV1(durable, this.options.crypto))
      )
        throw new Error("planning_artifact_publication_conflict");
      return durable;
    }

    const now = this.options.clock.now();
    const membership = await this.options.membership.currentBinding({
      logicalTimeMs: now.logicalTimeMs,
    });
    if (
      !membership ||
      !membership.memberInstances.some(
        (entry) =>
          entry.peerId === this.options.scope.peerId &&
          entry.instanceId === this.options.scope.instanceId,
      )
    )
      throw new Error("planning_artifact_producer_membership_unavailable");
    const publication = await createPlanningArtifactPublicationV1({
      scope: this.options.scope,
      record: durable,
      membership,
      signing: this.options.signing,
      issuedAt: now.wallTime,
      publishedAtLogicalMs: now.logicalTimeMs,
      maximumArtifactBytes: this.options.maximumArtifactBytes,
      crypto: this.options.crypto,
    });
    const syncRecord = await createPlanningArtifactSyncRecordV1(
      publication,
      this.options.crypto,
    );
    await this.options.syncRepository.append({
      syncDomain: PLANNING_ARTIFACT_SYNC_DOMAIN_V1,
      membership,
      records: [syncRecord],
    });
    return durable;
  }

  get(
    contentReference: string,
  ): ReturnType<PlanningFragmentRepositoryV1["get"]> {
    return this.options.repository.get(contentReference);
  }
}

/** Domain validation and idempotent replay used by collective-sync. */
export class PlanningArtifactSyncAdapterV1 implements CollectiveSyncDomainAdapterV1 {
  constructor(readonly options: PlanningArtifactSyncAdapterOptionsV1) {
    if (
      !options?.scope ||
      !options.repository ||
      !options.membership ||
      !options.clock
    )
      throw new TypeError("planning_artifact_adapter_options_required");
  }

  async validate(record: CollectiveSyncRecordV1): Promise<boolean> {
    return (
      (await validatePlanningArtifactSyncRecordV1(record, this.options)) !==
      null
    );
  }

  async replay(records: readonly CollectiveSyncRecordV1[]): Promise<void> {
    const artifacts: PlanningFragmentRepositoryRecordV1[] = [];
    for (const record of records) {
      const publication = await validatePlanningArtifactSyncRecordV1(
        record,
        this.options,
      );
      if (!publication) throw new Error("planning_artifact_replay_invalid");
      artifacts.push(publication.record);
    }
    for (const artifact of artifacts)
      await this.options.repository.put(artifact);
  }
}

/** Fetches only the exact artifact named by an already-authenticated offer. */
export class CollectiveSyncPlanningArtifactAvailabilityV1 {
  constructor(
    readonly options: CollectiveSyncPlanningArtifactAvailabilityOptionsV1,
  ) {
    if (!options?.repository || !options.client)
      throw new TypeError("planning_artifact_availability_options_required");
  }

  async ensureAvailable(
    input: PlanningArtifactAvailabilityRequestV1,
  ): Promise<boolean> {
    if (!input?.contentReference || !input.fragmentDigest) return false;
    const local = await this.options.repository.get(input.contentReference);
    if (local) return planningArtifactRecordMatchesRequestV1(local, input);
    const resolved = await this.options.client.resolveRecord({
      peerId: input.sourcePeerId,
      syncDomain: PLANNING_ARTIFACT_SYNC_DOMAIN_V1,
      streamId: planningArtifactStreamIdV1(input.fragmentDigest),
      sequence: 1,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    if (!resolved) return false;
    const stored = await this.options.repository.get(input.contentReference);
    return stored
      ? planningArtifactRecordMatchesRequestV1(stored, input)
      : false;
  }
}

export async function createPlanningArtifactSyncRecordV1(
  publication: SignedPlanningArtifactPublicationV1,
  crypto?: Crypto,
): Promise<CollectiveSyncRecordV1> {
  return createCollectiveSyncRecordV1({
    tenantId: publication.tenantId,
    meshId: publication.meshId,
    policyDomainId: publication.policyDomainId,
    syncDomain: PLANNING_ARTIFACT_SYNC_DOMAIN_V1,
    streamId: planningArtifactStreamIdV1(publication.record.fragmentDigest),
    sequence: 1,
    predecessorDigest: null,
    payload: Object.freeze<PlanningArtifactSyncPayloadV1>({
      schemaVersion: 1,
      type: PLANNING_ARTIFACT_PAYLOAD_TYPE_V1,
      publication,
    }),
    createdAtLogicalMs: publication.publishedAtLogicalMs,
    ...(crypto ? { crypto } : {}),
  });
}

export async function validatePlanningArtifactSyncRecordV1(
  input: unknown,
  options: PlanningArtifactSyncAdapterOptionsV1,
): Promise<SignedPlanningArtifactPublicationV1 | null> {
  const record = await verifyCollectiveSyncRecordV1(input, options.crypto);
  if (
    !record ||
    record.tenantId !== options.scope.tenantId ||
    record.meshId !== options.scope.meshId ||
    record.policyDomainId !== options.scope.policyDomainId ||
    record.syncDomain !== PLANNING_ARTIFACT_SYNC_DOMAIN_V1 ||
    record.sequence !== 1 ||
    record.predecessorDigest !== null ||
    !isPayload(record.payload)
  )
    return null;
  const publication = await verifyPlanningArtifactPublicationV1({
    publication: record.payload.publication,
    membership: options.membership,
    logicalTimeMs: options.clock.now().logicalTimeMs,
    maximumArtifactBytes: options.maximumArtifactBytes,
    crypto: options.crypto,
  });
  if (
    !publication ||
    publication.tenantId !== record.tenantId ||
    publication.meshId !== record.meshId ||
    publication.policyDomainId !== record.policyDomainId ||
    record.streamId !==
      planningArtifactStreamIdV1(publication.record.fragmentDigest) ||
    record.createdAtLogicalMs !== publication.publishedAtLogicalMs
  )
    return null;
  return publication;
}

function isPayload(value: unknown): value is PlanningArtifactSyncPayloadV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    Object.keys(candidate).sort().join(",") ===
      "publication,schemaVersion,type" &&
    candidate.schemaVersion === 1 &&
    candidate.type === PLANNING_ARTIFACT_PAYLOAD_TYPE_V1
  );
}

export function planningArtifactRecordMatchesRequestV1(
  input: PlanningFragmentRepositoryRecordV1,
  request: PlanningArtifactAvailabilityRequestV1,
): boolean {
  let record: PlanningFragmentRepositoryRecordV1;
  try {
    record = validatePlanningFragmentRepositoryRecordV1(input);
  } catch {
    return false;
  }
  return (
    record.tenantId === request.tenantId &&
    record.meshId === request.meshId &&
    record.policyDomainId === request.policyDomainId &&
    record.objectiveId === request.objectiveId &&
    record.missionIntentId === request.missionIntentId &&
    record.intentRevision === request.intentRevision &&
    record.intentDigest === request.intentDigest &&
    record.proposalDigest === request.proposalDigest &&
    record.fragmentDigest === request.fragmentDigest &&
    record.sourcePlanView.stateDigest === request.planViewDigest &&
    record.contentReference === request.contentReference &&
    record.sourcePlanView.peerId === request.sourcePeerId &&
    record.sourcePlanView.peerInstanceId === request.sourceInstanceId
  );
}

function assertProducerScope(
  record: PlanningFragmentRepositoryRecordV1,
  scope: ReplicatedPlanningFragmentRepositoryOptionsV1["scope"],
): void {
  if (
    record.tenantId !== scope.tenantId ||
    record.meshId !== scope.meshId ||
    record.policyDomainId !== scope.policyDomainId ||
    record.sourcePlanView.peerId !== scope.peerId ||
    record.sourcePlanView.peerInstanceId !== scope.instanceId
  )
    throw new TypeError("planning_artifact_producer_scope_invalid");
}

function scopeWithoutProducer(
  scope: ReplicatedPlanningFragmentRepositoryOptionsV1["scope"],
): PlanningArtifactSyncAdapterOptionsV1["scope"] {
  return {
    tenantId: scope.tenantId,
    meshId: scope.meshId,
    policyDomainId: scope.policyDomainId,
  };
}
