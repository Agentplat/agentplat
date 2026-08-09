import type { PlanningDigestV1 } from "@agentplat/collective-planning";

import type {
  LocalStrategyCollectivePriorSourceV1,
  LocalStrategyDefinitionV1,
  LocalStrategySelectionRequestV1,
} from "./strategy-adaptation-contracts.js";
import { createLocalStrategyCollectivePriorV1 } from "./strategy-adaptation-runtime.js";
import type {
  PeerStrategyEvidenceBindingV1,
  PeerStrategyEvidenceCertificateV1,
} from "./strategy-evidence-exchange-contracts.js";
import { validatePeerStrategyEvidenceCertificateV1 } from "./strategy-evidence-exchange-runtime.js";
import type {
  StrategyConvergenceConnectivityV1,
  StrategyConvergenceCycleRequestV1,
  StrategyConvergencePortV1,
  StrategyConvergenceScopeV1,
} from "./strategy-convergence-contracts.js";
import {
  createStrategyConvergenceCycleRequestV1,
  createStrategyConvergenceObservationV1,
  validateStrategyConvergenceScopeV1,
} from "./strategy-convergence-runtime.js";

const DIGEST = /^sha256:[0-9a-f]{64}$/u;

/** Convert one locally validated evidence certificate into a content-free view. */
export function createStrategyConvergenceObservationFromCertificateV1(input: {
  readonly certificate: PeerStrategyEvidenceCertificateV1;
}) {
  const certificate = validatePeerStrategyEvidenceCertificateV1(
    input?.certificate,
  );
  return createStrategyConvergenceObservationV1({
    schemaVersion: 1,
    evidencePolicyDigest: certificate.policyDigest,
    membershipEpoch: certificate.membershipEpoch,
    membershipConfigurationDigest: certificate.membershipConfigurationDigest,
    cohortDigest: certificate.cohortDigest,
    binding: certificate.binding,
    certificateDigest: certificate.certificateDigest,
    attesterPeerIds: certificate.attesterPeerIds,
    independenceGroupIds: certificate.independenceGroupIds,
    outcome: certificate.outcome,
    confidenceBps: certificate.confidenceBps,
    observedAtLogicalMs: certificate.certifiedAtLogicalMs,
    validUntilLogicalMs: certificate.expiresAtLogicalMs,
  });
}

/** Build a deterministic convergence cycle directly from evidence certificates. */
export function createStrategyConvergenceCycleFromEvidenceV1(input: {
  readonly cycleId: string;
  readonly scope: StrategyConvergenceScopeV1;
  readonly currentStrategy: PeerStrategyEvidenceBindingV1;
  readonly eligibleStrategies: readonly PeerStrategyEvidenceBindingV1[];
  readonly connectivity: StrategyConvergenceConnectivityV1;
  readonly certificates: readonly PeerStrategyEvidenceCertificateV1[];
  readonly logicalTimeMs: number;
}): StrategyConvergenceCycleRequestV1 {
  if (!Array.isArray(input?.certificates))
    throw new TypeError("strategy_convergence_certificates_invalid");
  return createStrategyConvergenceCycleRequestV1({
    schemaVersion: 1,
    cycleId: input.cycleId,
    scope: validateStrategyConvergenceScopeV1(input.scope),
    currentStrategy: input.currentStrategy,
    eligibleStrategies: input.eligibleStrategies,
    connectivity: input.connectivity,
    observations: input.certificates.map((certificate) =>
      createStrategyConvergenceObservationFromCertificateV1({ certificate }),
    ),
    logicalTimeMs: input.logicalTimeMs,
  });
}

export interface StrategyConvergencePriorSourceOptionsV1 {
  readonly sourceId: string;
  readonly sourceVersion: number;
  readonly sourceImplementationDigest: PlanningDigestV1;
  readonly maximumInfluenceBps: number;
  readonly convergence: StrategyConvergencePortV1;
  readonly scope: (
    request: LocalStrategySelectionRequestV1,
  ) => Promise<StrategyConvergenceScopeV1> | StrategyConvergenceScopeV1;
}

/**
 * Exposes only a fresh stable recommendation as a request-bound advisory prior.
 * Local adaptation reapplies its own confidence, influence and baseline bounds.
 */
export function createStrategyConvergencePriorSourceV1(
  input: StrategyConvergencePriorSourceOptionsV1,
): LocalStrategyCollectivePriorSourceV1 {
  if (
    !input?.convergence ||
    typeof input.convergence.resolveRecommendation !== "function" ||
    typeof input.scope !== "function" ||
    typeof input.sourceId !== "string" ||
    input.sourceId.length === 0 ||
    !Number.isSafeInteger(input.sourceVersion) ||
    input.sourceVersion < 1 ||
    !DIGEST.test(input.sourceImplementationDigest) ||
    !Number.isSafeInteger(input.maximumInfluenceBps) ||
    input.maximumInfluenceBps < 0 ||
    input.maximumInfluenceBps > 10_000
  )
    throw new TypeError("strategy_convergence_prior_source_invalid");
  return Object.freeze({
    sourceId: input.sourceId,
    sourceVersion: input.sourceVersion,
    sourceImplementationDigest: input.sourceImplementationDigest,
    async resolve(value: {
      readonly request: LocalStrategySelectionRequestV1;
      readonly strategies: readonly LocalStrategyDefinitionV1[];
    }) {
      const scope = validateStrategyConvergenceScopeV1(
        await input.scope(value.request),
      );
      if (scope.operation !== value.request.operation)
        throw new TypeError("strategy_convergence_prior_scope_mismatch");
      const recommendation = await input.convergence.resolveRecommendation({
        scopeDigest: scope.scopeDigest,
        operation: value.request.operation,
        logicalTimeMs: value.request.logicalTimeMs,
      });
      if (!recommendation) return Object.freeze([]);
      const strategy = value.strategies.find(
        (candidate) =>
          candidate.strategyId === recommendation.strategyId &&
          candidate.strategyDigest === recommendation.strategyDigest &&
          candidate.operations.includes(value.request.operation),
      );
      if (!strategy) return Object.freeze([]);
      return Object.freeze([
        createLocalStrategyCollectivePriorV1({
          schemaVersion: 1,
          requestId: value.request.requestId,
          requestDigest: value.request.requestDigest,
          operation: value.request.operation,
          strategyId: strategy.strategyId,
          strategyDigest: strategy.strategyDigest,
          sourceId: input.sourceId,
          sourceVersion: input.sourceVersion,
          sourceImplementationDigest: input.sourceImplementationDigest,
          certificateDigest: recommendation.recommendationDigest,
          outcome: "success",
          scoreMicros: recommendation.confidenceBps * 100,
          confidenceBps: recommendation.confidenceBps,
          requestedInfluenceBps: Math.min(
            recommendation.influenceBps,
            input.maximumInfluenceBps,
          ),
          observedAtLogicalMs: recommendation.observedAtLogicalMs,
          expiresAtLogicalMs: recommendation.validUntilLogicalMs,
        }),
      ]);
    },
  });
}
