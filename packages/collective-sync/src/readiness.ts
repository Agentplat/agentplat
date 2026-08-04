import type {
  CollectiveSyncClockV1,
  CollectiveSyncMembershipV1,
  CollectiveSyncReadinessDecisionV1,
  CollectiveSyncRepositoryV1,
  CollectiveSyncScopeV1,
} from "./contracts.js";
import type { CollectiveSyncClientV1 } from "./client.js";
import { verifyCollectiveSyncEnvelopeV1 } from "./crypto.js";
import { verifyCollectiveCatchUpCertificateDigestV1 } from "./records.js";

export interface CollectiveSyncReadinessGateOptionsV1 {
  readonly scope: CollectiveSyncScopeV1;
  readonly repository: CollectiveSyncRepositoryV1;
  readonly membership: CollectiveSyncMembershipV1;
  readonly clock: CollectiveSyncClockV1;
}

/** Revalidates durable readiness against live membership and the live local frontier. */
export class CollectiveSyncReadinessGateV1 {
  constructor(readonly options: CollectiveSyncReadinessGateOptionsV1) {
    if (
      !options?.scope ||
      !options.repository ||
      !options.membership ||
      !options.clock
    )
      throw new TypeError("collective sync readiness options are required");
  }

  async check(input: {
    readonly syncDomain: string;
    readonly logicalTimeMs?: number;
  }): Promise<CollectiveSyncReadinessDecisionV1> {
    const logicalTimeMs =
      input.logicalTimeMs ?? this.options.clock.now().logicalTimeMs;
    const binding = await this.options.membership.currentBinding({
      logicalTimeMs,
    });
    if (!binding) return decision(false, "sync_membership_unavailable");
    const certificate = await this.options.repository.latestCertificate(
      input.syncDomain,
    );
    const valid = await verifyCollectiveCatchUpCertificateDigestV1(certificate);
    if (!valid) return decision(false, "sync_certificate_missing_or_invalid");
    if (
      valid.tenantId !== this.options.scope.tenantId ||
      valid.meshId !== this.options.scope.meshId ||
      valid.policyDomainId !== this.options.scope.policyDomainId ||
      valid.syncDomain !== input.syncDomain ||
      valid.targetPeerId !== this.options.scope.peerId ||
      valid.targetInstanceId !== this.options.scope.instanceId ||
      valid.membershipEpoch !== binding.epoch ||
      valid.membershipConfigurationDigest !== binding.configurationDigest ||
      valid.frontier.tenantId !== valid.tenantId ||
      valid.frontier.meshId !== valid.meshId ||
      valid.frontier.policyDomainId !== valid.policyDomainId ||
      valid.frontier.syncDomain !== valid.syncDomain ||
      valid.frontier.membershipEpoch !== valid.membershipEpoch ||
      valid.frontier.membershipConfigurationDigest !==
        valid.membershipConfigurationDigest
    )
      return decision(
        false,
        "sync_certificate_scope_or_membership_stale",
        valid.certificateId,
        valid.frontier.frontierDigest,
      );
    const majority = Math.floor(binding.memberPeerIds.length / 2) + 1;
    if (valid.threshold < majority)
      return decision(
        false,
        "sync_certificate_threshold_insufficient",
        valid.certificateId,
        valid.frontier.frontierDigest,
      );
    const local = await this.options.repository.frontier({
      syncDomain: input.syncDomain,
      membership: binding,
    });
    if (local.frontierDigest !== valid.frontier.frontierDigest)
      return decision(
        false,
        "sync_local_frontier_changed",
        valid.certificateId,
        local.frontierDigest,
      );
    const attesters = new Set<string>();
    const verifiedAt = this.options.clock.now().wallTime;
    for (const attestation of valid.attestations) {
      const envelope = await verifyCollectiveSyncEnvelopeV1({
        envelope: attestation,
        resolver: this.options.membership,
        verifiedAt,
      });
      if (
        !envelope ||
        envelope.payload.type !== "sync.attestation" ||
        envelope.tenantId !== valid.tenantId ||
        envelope.meshId !== valid.meshId ||
        envelope.policyDomainId !== valid.policyDomainId ||
        envelope.audiencePeerId !== valid.targetPeerId ||
        envelope.audienceInstanceId !== valid.targetInstanceId ||
        envelope.payload.syncDomain !== valid.syncDomain ||
        envelope.payload.frontierDigest !== valid.frontier.frontierDigest ||
        envelope.payload.targetPeerId !== valid.targetPeerId ||
        envelope.payload.targetInstanceId !== valid.targetInstanceId ||
        envelope.payload.attesterPeerId !== envelope.senderPeerId ||
        envelope.payload.membershipEpoch !== binding.epoch ||
        envelope.payload.membershipConfigurationDigest !==
          binding.configurationDigest ||
        !binding.memberInstances.some(
          (entry) =>
            entry.peerId === envelope.senderPeerId &&
            entry.instanceId === envelope.senderInstanceId,
        )
      )
        continue;
      attesters.add(envelope.senderPeerId);
    }
    return attesters.size >= valid.threshold
      ? decision(
          true,
          "sync_ready",
          valid.certificateId,
          valid.frontier.frontierDigest,
        )
      : decision(
          false,
          "sync_attestations_invalid_or_stale",
          valid.certificateId,
          valid.frontier.frontierDigest,
        );
  }
}

export interface CollectiveSyncOperationalGateOptionsV1<TState> {
  readonly gate: CollectiveSyncReadinessGateV1;
  readonly client: CollectiveSyncClientV1;
  /** Map a runtime or quorum operation to one explicitly bounded domain. */
  readonly syncDomain: (input: {
    readonly operation: string;
    readonly scope?: unknown;
    readonly scopeDigest?: string;
    readonly missingPredecessor?: string;
  }) => string;
  /** Read the domain state after the normal adapter replay completed. */
  readonly readState: () => Promise<TState>;
}

/** Structural adapter for both Collective Peer Node and quorum readiness ports. */
export class CollectiveSyncOperationalGateV1<TState = unknown> {
  constructor(
    readonly options: CollectiveSyncOperationalGateOptionsV1<TState>,
  ) {
    if (
      !options?.gate ||
      !options.client ||
      typeof options.syncDomain !== "function" ||
      typeof options.readState !== "function"
    )
      throw new TypeError(
        "collective sync operational gate options are required",
      );
  }

  async readiness(input: {
    readonly scope: unknown;
    readonly operation: string;
    readonly logicalTimeMs: number;
  }): Promise<CollectiveSyncReadinessDecisionV1> {
    return this.options.gate.check({
      syncDomain: this.options.syncDomain({
        operation: input.operation,
        scope: input.scope,
      }),
      logicalTimeMs: input.logicalTimeMs,
    });
  }

  async check(input: {
    readonly operation: string;
    readonly scopeDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<CollectiveSyncReadinessDecisionV1> {
    return this.options.gate.check({
      syncDomain: this.options.syncDomain({
        operation: input.operation,
        scopeDigest: input.scopeDigest,
      }),
      logicalTimeMs: input.logicalTimeMs,
    });
  }

  async recoverPredecessor(input: {
    readonly scope: unknown;
    readonly state: TState;
    readonly envelope: unknown;
    readonly missingPredecessor: string;
    readonly logicalTimeMs: number;
  }): Promise<TState | null> {
    const syncDomain = this.options.syncDomain({
      operation: "predecessor_recovery",
      scope: input.scope,
      missingPredecessor: input.missingPredecessor,
    });
    try {
      await this.options.client.catchUp({ syncDomain });
      return await this.options.readState();
    } catch {
      return null;
    }
  }
}

function decision(
  ready: boolean,
  reasonCode: string,
  certificateId: string | null = null,
  frontierDigest: string | null = null,
): CollectiveSyncReadinessDecisionV1 {
  return Object.freeze({ ready, reasonCode, certificateId, frontierDigest });
}
