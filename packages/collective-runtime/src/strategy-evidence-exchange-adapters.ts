import { canonicalizeMeshJsonBytes } from "@agentplat/mesh-protocol";
import {
  digestPlanningJsonV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import {
  PEER_STRATEGY_EVIDENCE_SYNC_DOMAIN_V1,
  type PeerStrategyEvidenceAdvisoryPriorV1,
  type PeerStrategyEvidenceBindingV1,
  type PeerStrategyEvidenceCohortV1,
  type PeerStrategyEvidenceCollectiveSyncAdapterPortV1,
  type PeerStrategyEvidenceExchangePortV1,
  type PeerStrategyEvidenceEligibilityPortV1,
  type PeerStrategyEvidenceMembershipResolutionPortV1,
  type PeerStrategyEvidenceSyncRecordV1,
  type PeerStrategyEvidenceTrustProjectionPortV1,
  type SignedPeerStrategyOutcomeAttestationV1,
} from "./strategy-evidence-exchange-contracts.js";
import type {
  LocalStrategyCollectivePriorSourceV1,
  LocalStrategyDefinitionV1,
  LocalStrategySelectionRequestV1,
} from "./strategy-adaptation-contracts.js";
import {
  validateSignedPeerStrategyOutcomeAttestationV1,
  verifySignedPeerStrategyOutcomeAttestationV1,
} from "./strategy-evidence-exchange-runtime.js";
import { createLocalStrategyCollectivePriorV1 } from "./strategy-adaptation-runtime.js";

const PAYLOAD_TYPE = "peer_strategy_outcome_attestation" as const;
const PAYLOAD_KEYS = ["attestation", "schemaVersion", "type"] as const;
const RECORD_KEYS = [
  "createdAtLogicalMs",
  "meshId",
  "payload",
  "payloadDigest",
  "policyDomainId",
  "predecessorDigest",
  "recordDigest",
  "schemaVersion",
  "sequence",
  "streamId",
  "syncDomain",
  "tenantId",
] as const;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u;
const MAXIMUM_SYNC_RECORD_BYTES = 1_048_576;

export interface PeerStrategyEvidenceCollectiveSyncScopeV1 {
  readonly tenantId: string;
  readonly meshId: string;
  readonly policyDomainId: string;
}

export interface PeerStrategyEvidenceCollectiveSyncAdapterOptionsV1 {
  readonly scope: PeerStrategyEvidenceCollectiveSyncScopeV1;
  readonly crypto?: Crypto;
}

export interface PeerStrategyEvidenceCollectiveSyncDomainAdapterOptionsV1 {
  readonly adapter: PeerStrategyEvidenceCollectiveSyncAdapterPortV1;
  readonly exchange: PeerStrategyEvidenceExchangePortV1;
  readonly clock: {
    now(): { readonly wallTime: string; readonly logicalTimeMs: number };
  };
}

export interface PeerStrategyEvidenceCollectiveSyncDomainAdapterV1 {
  validate(record: PeerStrategyEvidenceSyncRecordV1): Promise<boolean>;
  replay(records: readonly PeerStrategyEvidenceSyncRecordV1[]): Promise<void>;
}

/**
 * Reference admission gate that verifies epoch-bound membership, the issuer's
 * Ed25519 signature and a local Trust projection before returning eligibility.
 */
export function createPeerStrategyEvidenceEligibilityPortV1(input: {
  readonly membership: PeerStrategyEvidenceMembershipResolutionPortV1;
  readonly trust: PeerStrategyEvidenceTrustProjectionPortV1;
  readonly crypto?: Crypto;
}): PeerStrategyEvidenceEligibilityPortV1 {
  if (
    !input?.membership ||
    typeof input.membership.resolve !== "function" ||
    !input.trust ||
    typeof input.trust.evaluate !== "function"
  )
    throw new TypeError("peer_strategy_evidence_eligibility_ports_required");
  return Object.freeze({
    async evaluate(value: {
      readonly attestation: SignedPeerStrategyOutcomeAttestationV1;
      readonly logicalTimeMs: number;
    }) {
      const attestation = validateSignedPeerStrategyOutcomeAttestationV1(
        value.attestation,
      );
      const membership = await input.membership.resolve({
        tenantId: attestation.cohort.tenantId,
        meshId: attestation.cohort.meshId,
        peerId: attestation.issuerPeerId,
        instanceId: attestation.issuerInstanceId,
        membershipEpoch: attestation.membershipEpoch,
        membershipConfigurationDigest:
          attestation.membershipConfigurationDigest,
        keyId: attestation.proof.keyId,
        logicalTimeMs: value.logicalTimeMs,
      });
      const verified = membership
        ? await verifySignedPeerStrategyOutcomeAttestationV1({
            attestation,
            publicKey: membership.publicKey,
            ...(input.crypto ? { crypto: input.crypto } : {}),
          })
        : null;
      const trust = verified
        ? await input.trust.evaluate({
            attestation,
            logicalTimeMs: value.logicalTimeMs,
          })
        : null;
      const disposition =
        membership &&
        membership.expiresAtLogicalMs > value.logicalTimeMs &&
        verified &&
        trust &&
        trust.expiresAtLogicalMs > value.logicalTimeMs
          ? trust.disposition
          : "ineligible";
      const expiresAtLogicalMs = Math.max(
        value.logicalTimeMs + 1,
        Math.min(
          membership?.expiresAtLogicalMs ?? value.logicalTimeMs + 1,
          trust?.expiresAtLogicalMs ?? value.logicalTimeMs + 1,
          attestation.expiresAtLogicalMs,
        ),
      );
      const decisionBody = {
        schemaVersion: 1 as const,
        attestationDigest: attestation.attestationDigest,
        membershipDecisionDigest: membership?.decisionDigest ?? null,
        trustDecisionDigest: trust?.decisionDigest ?? null,
        disposition,
        evaluatedAtLogicalMs: value.logicalTimeMs,
        expiresAtLogicalMs,
      };
      return Object.freeze({
        schemaVersion: 1 as const,
        attestationDigest: attestation.attestationDigest,
        disposition,
        decisionDigest: digestPlanningJsonV1(
          "peer-strategy-evidence-eligibility",
          decisionBody as unknown as PlanningJson,
        ),
        expiresAtLogicalMs,
      });
    },
  });
}

/**
 * Maps immutable signed outcome attestations into one authenticated causal
 * collective-sync stream. The record mirrors (rather than replaces) the
 * issuer's stream, sequence and predecessor binding.
 */
export function createPeerStrategyEvidenceCollectiveSyncAdapterV1(
  options: PeerStrategyEvidenceCollectiveSyncAdapterOptionsV1,
): PeerStrategyEvidenceCollectiveSyncAdapterPortV1 {
  if (!options?.scope || !scope(options.scope))
    throw new TypeError("peer_strategy_evidence_sync_scope_invalid");

  return Object.freeze({
    syncDomain: PEER_STRATEGY_EVIDENCE_SYNC_DOMAIN_V1,
    async toRecord(input: {
      readonly attestation: SignedPeerStrategyOutcomeAttestationV1;
      readonly predecessorRecordDigest: `sha256:${string}` | null;
    }) {
      const attestation = await validate(input?.attestation);
      if (!attestation) throw new TypeError("peer_strategy_evidence_attestation_invalid");
      if (
        (attestation.issuerSequence === 1 &&
          input.predecessorRecordDigest !== null) ||
        (attestation.issuerSequence > 1 &&
          (typeof input.predecessorRecordDigest !== "string" ||
            !DIGEST.test(input.predecessorRecordDigest)))
      )
        throw new TypeError(
          "peer_strategy_evidence_sync_predecessor_invalid",
        );
      assertScope(attestation, options.scope);
      const body = {
        schemaVersion: 1 as const,
        tenantId: options.scope.tenantId,
        meshId: options.scope.meshId,
        policyDomainId: options.scope.policyDomainId,
        syncDomain: PEER_STRATEGY_EVIDENCE_SYNC_DOMAIN_V1,
        streamId: attestation.issuerStreamId,
        sequence: attestation.issuerSequence,
        predecessorDigest: input.predecessorRecordDigest,
        payload: Object.freeze({
          schemaVersion: 1 as const,
          type: PAYLOAD_TYPE,
          attestation,
        }),
        createdAtLogicalMs: attestation.observedAtLogicalMs,
      };
      const payloadDigest = await syncDigest(body.payload, options.crypto);
      const recordBody = Object.freeze({ ...body, payloadDigest });
      return Object.freeze({
        ...recordBody,
        recordDigest: await syncDigest(
          {
            domain: "agentplat.collective-sync.record.v1",
            record: recordBody,
          },
          options.crypto,
        ),
      });
    },
    async fromRecord(input: {
      readonly record: PeerStrategyEvidenceSyncRecordV1;
    }) {
      const record = await verifyRecord(input?.record, options.crypto);
      if (!record || !recordMatchesScope(record, options.scope)) return null;
      const payload = payloadOf(record.payload);
      if (!payload) return null;
      const attestation = await validate(payload.attestation);
      if (!attestation || !recordMatchesAttestation(record, attestation)) return null;
      return attestation;
    },
  });
}

/**
 * Optional collective-sync domain adapter. Validation is side-effect free;
 * replay is the sole path that admits evidence into the local exchange state.
 */
export function createPeerStrategyEvidenceCollectiveSyncDomainAdapterV1(
  options: PeerStrategyEvidenceCollectiveSyncDomainAdapterOptionsV1,
): PeerStrategyEvidenceCollectiveSyncDomainAdapterV1 {
  if (!options?.adapter || !options.exchange || !options.clock)
    throw new TypeError("peer_strategy_evidence_sync_domain_options_required");
  return Object.freeze({
    async validate(record: PeerStrategyEvidenceSyncRecordV1) {
      return (await options.adapter.fromRecord({ record })) !== null;
    },
    async replay(records: readonly PeerStrategyEvidenceSyncRecordV1[]) {
      if (!Array.isArray(records))
        throw new TypeError("peer_strategy_evidence_sync_records_invalid");
      for (const record of records) {
        const attestation = await options.adapter.fromRecord({ record });
        if (!attestation)
          throw new Error("peer_strategy_evidence_sync_record_invalid");
        const decision = await options.exchange.admit({
          attestation,
          logicalTimeMs: options.clock.now().logicalTimeMs,
        });
        // Out-of-order records are retained by the exchange and converge when
        // their predecessor is replayed later.
        if (decision.status === "rejected")
          throw new Error(`peer_strategy_evidence_sync_replay_${decision.status}`);
      }
    },
  });
}

/**
 * A narrow validation boundary for callers that consume the exchange prior
 * directly. It neither selects a strategy nor mutates local adaptation state.
 */
export function createPeerStrategyEvidenceAdvisoryPriorGuardV1(input: {
  readonly maximumInfluenceBps: number;
}): {
  toLocalPrior(input: {
    readonly prior: PeerStrategyEvidenceAdvisoryPriorV1;
    readonly logicalTimeMs: number;
  }): PeerStrategyEvidenceAdvisoryPriorV1 | null;
} {
  if (!Number.isSafeInteger(input?.maximumInfluenceBps) || input.maximumInfluenceBps < 0 || input.maximumInfluenceBps > 10_000)
    throw new TypeError("peer_strategy_evidence_prior_influence_invalid");
  return Object.freeze({
    toLocalPrior(value) {
      if (!value?.prior || !Number.isSafeInteger(value.logicalTimeMs) || value.logicalTimeMs < 0)
        return null;
      const prior = value.prior;
      if (
        prior.schemaVersion !== 1 ||
        !DIGEST.test(prior.priorDigest) ||
        !DIGEST.test(prior.certificateDigest) ||
        !DIGEST.test(prior.strategyDigest) ||
        !Number.isSafeInteger(prior.influenceBps) ||
        prior.influenceBps < 0 ||
        prior.influenceBps > input.maximumInfluenceBps ||
        !Number.isSafeInteger(prior.validUntilLogicalMs) ||
        prior.validUntilLogicalMs <= value.logicalTimeMs
      )
        return null;
      return Object.freeze({
        ...prior,
        metrics: Object.freeze(prior.metrics.map((metric) => Object.freeze({ ...metric }))),
      });
    },
  });
}

export interface PeerStrategyEvidenceAdvisoryPriorSourceOptionsV1 {
  readonly sourceId: string;
  readonly sourceVersion: number;
  readonly sourceImplementationDigest: `sha256:${string}`;
  readonly maximumInfluenceBps: number;
  readonly exchange: PeerStrategyEvidenceExchangePortV1;
  readonly cohort: (
    request: LocalStrategySelectionRequestV1,
  ) => Promise<PeerStrategyEvidenceCohortV1> | PeerStrategyEvidenceCohortV1;
  readonly binding: (input: {
    readonly request: LocalStrategySelectionRequestV1;
    readonly strategy: LocalStrategyDefinitionV1;
  }) =>
    | Promise<PeerStrategyEvidenceBindingV1>
    | PeerStrategyEvidenceBindingV1;
}

/**
 * Resolves locally certified exchange evidence into request-bound advisory
 * priors. The local adaptation runtime independently clamps their influence.
 */
export function createPeerStrategyEvidenceAdvisoryPriorSourceV1(
  input: PeerStrategyEvidenceAdvisoryPriorSourceOptionsV1,
): LocalStrategyCollectivePriorSourceV1 {
  if (
    !input?.exchange ||
    typeof input.exchange.resolvePriors !== "function" ||
    typeof input.cohort !== "function" ||
    typeof input.binding !== "function" ||
    typeof input.sourceId !== "string" ||
    !Number.isSafeInteger(input.sourceVersion) ||
    input.sourceVersion < 1 ||
    !DIGEST.test(input.sourceImplementationDigest) ||
    !Number.isSafeInteger(input.maximumInfluenceBps) ||
    input.maximumInfluenceBps < 0 ||
    input.maximumInfluenceBps > 10_000
  )
    throw new TypeError("peer_strategy_evidence_prior_source_invalid");
  return Object.freeze({
    sourceId: input.sourceId,
    sourceVersion: input.sourceVersion,
    sourceImplementationDigest: input.sourceImplementationDigest,
    async resolve(value: {
      readonly request: LocalStrategySelectionRequestV1;
      readonly strategies: readonly LocalStrategyDefinitionV1[];
    }) {
      const cohort = await input.cohort(value.request);
      const resolved = await Promise.all(
        value.strategies.map(async (strategy) => {
          const binding = await input.binding({
            request: value.request,
            strategy,
          });
          if (
            binding.operation !== value.request.operation ||
            binding.strategyId !== strategy.strategyId ||
            binding.strategyDigest !== strategy.strategyDigest
          )
            throw new TypeError(
              "peer_strategy_evidence_prior_binding_mismatch",
            );
          const priors = await input.exchange.resolvePriors({
            cohort,
            binding,
            logicalTimeMs: value.request.logicalTimeMs,
          });
          return priors
            .filter(
              (prior) =>
                prior.strategyId === strategy.strategyId &&
                prior.strategyDigest === strategy.strategyDigest &&
                prior.validUntilLogicalMs > value.request.logicalTimeMs,
            )
            .map((prior) =>
              createLocalStrategyCollectivePriorV1({
                schemaVersion: 1,
                requestId: value.request.requestId,
                requestDigest: value.request.requestDigest,
                operation: value.request.operation,
                strategyId: strategy.strategyId,
                strategyDigest: strategy.strategyDigest,
                sourceId: input.sourceId,
                sourceVersion: input.sourceVersion,
                sourceImplementationDigest:
                  input.sourceImplementationDigest,
                certificateDigest: prior.certificateDigest,
                outcome: prior.outcome,
                scoreMicros: priorScoreMicros(prior),
                confidenceBps: prior.confidenceBps,
                requestedInfluenceBps: Math.min(
                  prior.influenceBps,
                  input.maximumInfluenceBps,
                ),
                observedAtLogicalMs: prior.observedAtLogicalMs,
                expiresAtLogicalMs: prior.validUntilLogicalMs,
              }),
            );
        }),
      );
      return Object.freeze(
        resolved.flat().sort((left, right) =>
          left.strategyId.localeCompare(right.strategyId),
        ),
      );
    },
  });
}

function priorScoreMicros(prior: PeerStrategyEvidenceAdvisoryPriorV1): number {
  if (prior.outcome !== "success") return 0;
  const total = prior.metrics.reduce(
    (sum, metric) => sum + metric.valueMicros,
    0,
  );
  return Math.floor(total / Math.max(1, prior.metrics.length));
}

async function validate(
  candidate: unknown,
): Promise<SignedPeerStrategyOutcomeAttestationV1 | null> {
  try {
    return await validateSignedPeerStrategyOutcomeAttestationV1(candidate);
  } catch {
    return null;
  }
}

function scope(value: PeerStrategyEvidenceCollectiveSyncScopeV1): boolean {
  return [value.tenantId, value.meshId, value.policyDomainId].every(
    (item) => typeof item === "string" && item.length > 0 && item.length <= 256,
  );
}

function assertScope(
  attestation: SignedPeerStrategyOutcomeAttestationV1,
  expected: PeerStrategyEvidenceCollectiveSyncScopeV1,
): void {
  if (
    attestation.cohort.tenantId !== expected.tenantId ||
    attestation.cohort.meshId !== expected.meshId ||
    attestation.cohort.policyDomainId !== expected.policyDomainId
  )
    throw new TypeError("peer_strategy_evidence_sync_scope_mismatch");
}

function recordMatchesScope(
  record: PeerStrategyEvidenceSyncRecordV1,
  expected: PeerStrategyEvidenceCollectiveSyncScopeV1,
): boolean {
  return (
    record.tenantId === expected.tenantId &&
    record.meshId === expected.meshId &&
    record.policyDomainId === expected.policyDomainId &&
    record.syncDomain === PEER_STRATEGY_EVIDENCE_SYNC_DOMAIN_V1
  );
}

function recordMatchesAttestation(
  record: PeerStrategyEvidenceSyncRecordV1,
  attestation: SignedPeerStrategyOutcomeAttestationV1,
): boolean {
  return (
    record.streamId === attestation.issuerStreamId &&
    record.sequence === attestation.issuerSequence &&
    record.createdAtLogicalMs === attestation.observedAtLogicalMs
  );
}

async function verifyRecord(
  value: unknown,
  crypto?: Crypto,
): Promise<PeerStrategyEvidenceSyncRecordV1 | null> {
  try {
    if (!plainRecord(value) || !exactKeys(value, RECORD_KEYS)) return null;
    const record = value as unknown as PeerStrategyEvidenceSyncRecordV1;
    if (
      record.schemaVersion !== 1 ||
      !scope(record) ||
      record.syncDomain !== PEER_STRATEGY_EVIDENCE_SYNC_DOMAIN_V1 ||
      !IDENTIFIER.test(record.streamId) ||
      !Number.isSafeInteger(record.sequence) ||
      record.sequence < 1 ||
      !DIGEST.test(record.payloadDigest) ||
      !DIGEST.test(record.recordDigest) ||
      !Number.isSafeInteger(record.createdAtLogicalMs) ||
      record.createdAtLogicalMs < 0 ||
      !(
        (record.sequence === 1 && record.predecessorDigest === null) ||
        (record.sequence > 1 &&
          typeof record.predecessorDigest === "string" &&
          DIGEST.test(record.predecessorDigest))
      )
    )
      return null;
    const canonical = canonicalizeMeshJsonBytes(record);
    if (!canonical.ok || canonical.value.byteLength > MAXIMUM_SYNC_RECORD_BYTES)
      return null;
    const expectedPayload = await syncDigest(record.payload, crypto);
    const { recordDigest, ...body } = record;
    const expectedRecord = await syncDigest(
      { domain: "agentplat.collective-sync.record.v1", record: body },
      crypto,
    );
    return expectedPayload === record.payloadDigest && expectedRecord === record.recordDigest
      ? Object.freeze(record)
      : null;
  } catch {
    return null;
  }
}

async function syncDigest(value: unknown, injected?: Crypto): Promise<`sha256:${string}`> {
  const canonical = canonicalizeMeshJsonBytes(value);
  if (!canonical.ok)
    throw new TypeError("peer_strategy_evidence_sync_record_invalid");
  const crypto = injected ?? globalThis.crypto;
  if (!crypto?.subtle)
    throw new TypeError("peer_strategy_evidence_sync_crypto_unavailable");
  const hashed = new Uint8Array(
    await crypto.subtle.digest("SHA-256", Uint8Array.from(canonical.value).buffer),
  );
  return `sha256:${Array.from(hashed, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function payloadOf(value: unknown): {
  readonly schemaVersion: 1;
  readonly type: typeof PAYLOAD_TYPE;
  readonly attestation: unknown;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).sort().join(",") !== PAYLOAD_KEYS.join(",")) return null;
  return candidate.schemaVersion === 1 && candidate.type === PAYLOAD_TYPE
    ? (candidate as unknown as {
        readonly schemaVersion: 1;
        readonly type: typeof PAYLOAD_TYPE;
        readonly attestation: unknown;
      })
    : null;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null) &&
    Object.getOwnPropertySymbols(value).length === 0
  );
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}
