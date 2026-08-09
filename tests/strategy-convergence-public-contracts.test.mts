import {
  InMemoryStrategyConvergenceStoreV1,
  STRATEGY_CONVERGENCE_HANDOFF_FORMAT_V1,
  STRATEGY_CONVERGENCE_SCHEMA_VERSION_V1,
  STRATEGY_CONVERGENCE_STATE_FORMAT_V1,
  StrategyConvergenceRuntimeV1,
  createStrategyConvergenceCycleFromEvidenceV1,
  createStrategyConvergenceCycleRequestV1,
  createStrategyConvergenceObservationFromCertificateV1,
  createStrategyConvergenceObservationV1,
  createStrategyConvergencePolicyV1,
  createStrategyConvergencePriorSourceV1,
  createStrategyConvergenceScopeV1,
  createStrategyConvergenceStateV1,
  reduceStrategyConvergenceV1,
  validateStrategyConvergenceCycleRequestV1,
  validateStrategyConvergenceDecisionV1,
  validateStrategyConvergenceHandoffV1,
  validateStrategyConvergenceObservationV1,
  validateStrategyConvergencePolicyV1,
  validateStrategyConvergenceScopeV1,
  validateStrategyConvergenceStateV1,
  type StrategyConvergenceCycleRequestV1,
  type StrategyConvergenceDecisionV1,
  type StrategyConvergenceHandoffEnvelopeV1,
  type StrategyConvergenceObservationV1,
  type StrategyConvergencePolicyRecordV1,
  type StrategyConvergencePortV1,
  type StrategyConvergenceRecommendationV1,
  type StrategyConvergenceRuntimeOptionsV1,
  type StrategyConvergenceStateV1,
} from "@agentplat/collective-runtime/strategy-convergence";
import type { LocalStrategyCollectivePriorSourceV1 } from "@agentplat/collective-runtime/strategy-adaptation";

void InMemoryStrategyConvergenceStoreV1;
void STRATEGY_CONVERGENCE_HANDOFF_FORMAT_V1;
void STRATEGY_CONVERGENCE_SCHEMA_VERSION_V1;
void STRATEGY_CONVERGENCE_STATE_FORMAT_V1;
void StrategyConvergenceRuntimeV1;
void createStrategyConvergenceCycleFromEvidenceV1;
void createStrategyConvergenceCycleRequestV1;
void createStrategyConvergenceObservationFromCertificateV1;
void createStrategyConvergenceObservationV1;
void createStrategyConvergencePolicyV1;
void createStrategyConvergencePriorSourceV1;
void createStrategyConvergenceScopeV1;
void createStrategyConvergenceStateV1;
void reduceStrategyConvergenceV1;
void validateStrategyConvergenceCycleRequestV1;
void validateStrategyConvergenceDecisionV1;
void validateStrategyConvergenceHandoffV1;
void validateStrategyConvergenceObservationV1;
void validateStrategyConvergencePolicyV1;
void validateStrategyConvergenceScopeV1;
void validateStrategyConvergenceStateV1;

declare const controller: StrategyConvergencePortV1;
declare const policy: StrategyConvergencePolicyRecordV1;
declare const options: StrategyConvergenceRuntimeOptionsV1;
declare const request: StrategyConvergenceCycleRequestV1;
declare const observation: StrategyConvergenceObservationV1;
declare const recommendation: StrategyConvergenceRecommendationV1;
declare const state: StrategyConvergenceStateV1;
declare const handoff: StrategyConvergenceHandoffEnvelopeV1;

const decision: Promise<StrategyConvergenceDecisionV1> =
  controller.evaluate(request);
const loaded: Promise<StrategyConvergenceStateV1> = controller.loadState();
const resolved: Promise<StrategyConvergenceRecommendationV1 | null> =
  controller.resolveRecommendation({
    scopeDigest: recommendation.scopeDigest,
    operation: recommendation.operation,
    logicalTimeMs: recommendation.observedAtLogicalMs,
  });
const priorSource: LocalStrategyCollectivePriorSourceV1 =
  createStrategyConvergencePriorSourceV1({
    sourceId: "source",
    sourceVersion: 1,
    sourceImplementationDigest: recommendation.recommendationDigest,
    maximumInfluenceBps: 1_000,
    convergence: controller,
    scope: async () => state.scopes[0]!.scope,
  });

void policy;
void options;
void observation;
void state;
void handoff;
void decision;
void loaded;
void resolved;
void priorSource;
