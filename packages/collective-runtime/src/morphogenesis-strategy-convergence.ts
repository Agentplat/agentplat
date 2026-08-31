import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";

import {
  createStrategyConvergenceCycleFromEvidenceV1,
} from "./strategy-convergence-adapters.js";
import {
  createStrategyConvergenceScopeV1,
} from "./strategy-convergence-runtime.js";
import type {
  StrategyConvergenceConnectivityV1,
  StrategyConvergenceDecisionV1,
  StrategyConvergencePortV1,
} from "./strategy-convergence-contracts.js";
import type { PeerStrategyEvidenceCertificateV1 } from "./strategy-evidence-exchange-contracts.js";
import {
  createPeerStrategyEvidenceBindingV1,
  createPeerStrategyEvidenceCohortV1,
  validatePeerStrategyEvidenceCertificateV1,
} from "./strategy-evidence-exchange-runtime.js";
import {
  validateMorphogenesisStrategyCatalogV3,
  validateMorphogenesisStrategyContextV3,
  type MorphogenesisStrategyCatalogV3,
  type MorphogenesisStrategyContextV3,
} from "./morphogenesis-strategy-adaptation.js";
import {
  validateMorphogenesisStrategyGovernanceStateV3,
  type MorphogenesisStrategyGovernancePolicyV3,
  type MorphogenesisStrategyGovernanceStateV3,
  type MorphogenesisStrategyGovernanceActionV3,
  type MorphogenesisStrategyReviewRouteV3,
} from "./morphogenesis-strategy-governance.js";
import {
  createMorphogenesisStrategyEvidenceBindingV4,
  validateMorphogenesisStrategyIntelligencePolicyV4,
  type MorphogenesisStrategyIntelligencePolicyV4,
} from "./morphogenesis-strategy-intelligence.js";

export interface MorphogenesisStrategyConvergenceDecisionV4 {
  readonly schemaVersion: 4;
  readonly catalogDigest: PlanningDigestV1;
  readonly governanceStateDigest: PlanningDigestV1;
  readonly contextDigest: PlanningDigestV1;
  readonly contextClassDigest: PlanningDigestV1;
  readonly connectivity: StrategyConvergenceConnectivityV1;
  readonly convergenceDecision: StrategyConvergenceDecisionV1;
  readonly advisoryOnly: true;
  readonly decisionDigest: PlanningDigestV1;
}

export class MorphogenesisStrategyConvergenceV4 {
  readonly #catalog: MorphogenesisStrategyCatalogV3;
  readonly #intelligencePolicy: MorphogenesisStrategyIntelligencePolicyV4;
  constructor(readonly options: {
    readonly intelligencePolicy: MorphogenesisStrategyIntelligencePolicyV4;
    readonly catalog: MorphogenesisStrategyCatalogV3;
    readonly convergence: StrategyConvergencePortV1;
  }) {
    this.#catalog = validateMorphogenesisStrategyCatalogV3(options.catalog);
    this.#intelligencePolicy = validateMorphogenesisStrategyIntelligencePolicyV4(
      options.intelligencePolicy,
    );
    if (!options?.convergence || typeof options.convergence.evaluate !== "function")
      fail("Morphogenesis strategy convergence runtime is required");
  }

  async evaluate(input: {
    readonly cycleId: AgentPlatID;
    readonly context: MorphogenesisStrategyContextV3;
    readonly contextClassDigest: PlanningDigestV1;
    readonly governanceState: MorphogenesisStrategyGovernanceStateV3;
    readonly governancePolicy: MorphogenesisStrategyGovernancePolicyV3;
    readonly governanceStateKey: AgentPlatID;
    readonly missionIntentId: AgentPlatID;
    readonly objectiveId: AgentPlatID;
    readonly connectivity: StrategyConvergenceConnectivityV1;
    readonly certificates: readonly PeerStrategyEvidenceCertificateV1[];
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisStrategyConvergenceDecisionV4> {
    const context = validateMorphogenesisStrategyContextV3(input.context);
    const state = validateMorphogenesisStrategyGovernanceStateV3(input.governanceState, {
      policy: input.governancePolicy,
      catalog: this.#catalog,
      stateKey: input.governanceStateKey,
    });
    const contextClassDigest = sha(input.contextClassDigest);
    const policy = this.#intelligencePolicy;
    if (policy.catalogDigest !== this.#catalog.catalogDigest ||
        policy.morphogenesisPolicyDigest !== context.morphogenesisPolicyDigest ||
        !policy.admittedContextClassDigests.includes(contextClassDigest))
      fail("Morphogenesis convergence context is incompatible");
    const cohort = createPeerStrategyEvidenceCohortV1({
      tenantId: policy.tenantId,
      meshId: policy.meshId,
      policyDomainId: policy.policyDomainId,
      missionIntentId: input.missionIntentId,
      objectiveId: input.objectiveId,
      contextClassDigest,
    });
    const eligibleDefinitions = state.entries
      .filter(({ status }) => status !== "retired" && status !== "degraded")
      .map(({ strategyId }) => this.#catalog.strategies.find(({ strategy }) =>
        strategy.strategyId === strategyId)!)
      .filter(Boolean);
    const bindings = eligibleDefinitions.map((definition) => {
      const v4 = createMorphogenesisStrategyEvidenceBindingV4({
        catalog: this.#catalog,
        strategyId: definition.strategy.strategyId,
        contextClassDigest,
      });
      return createPeerStrategyEvidenceBindingV1({
        operation: "plan_decomposition",
        strategyId: v4.strategyId,
        strategyDigest: v4.strategyDigest,
        implementationDigest: v4.proposalGeneratorDigest,
        feedbackSchemaDigest: v4.feedbackSchemaDigest,
      });
    });
    const currentStrategy = bindings.find(({ strategyId }) =>
      strategyId === state.activeStrategyId);
    if (!currentStrategy || !bindings.some(({ strategyId }) =>
      strategyId === state.baselineStrategyId))
      fail("Morphogenesis convergence current or baseline strategy is unavailable");
    const certificates = input.certificates.map((certificate) =>
      validatePeerStrategyEvidenceCertificateV1(certificate));
    for (const certificate of certificates)
      if (certificate.cohortDigest !== cohort.cohortDigest ||
          !bindings.some(({ bindingDigest }) =>
            bindingDigest === certificate.binding.bindingDigest))
        fail("Morphogenesis convergence certificate is incompatible");
    const scope = createStrategyConvergenceScopeV1({
      tenantId: policy.tenantId, meshId: policy.meshId,
      policyDomainId: policy.policyDomainId,
      missionIntentId: input.missionIntentId, objectiveId: input.objectiveId,
      cohortDigest: cohort.cohortDigest, operation: "plan_decomposition",
    });
    const request = createStrategyConvergenceCycleFromEvidenceV1({
      cycleId: input.cycleId,
      scope,
      currentStrategy,
      eligibleStrategies: bindings,
      connectivity: input.connectivity,
      certificates,
      logicalTimeMs: input.logicalTimeMs,
    });
    const convergenceDecision = await this.options.convergence.evaluate(request);
    const body = freeze({
      schemaVersion: 4 as const,
      catalogDigest: this.#catalog.catalogDigest,
      governanceStateDigest: state.stateDigest,
      contextDigest: context.contextDigest,
      contextClassDigest,
      connectivity: input.connectivity,
      convergenceDecision,
      advisoryOnly: true as const,
    });
    return freeze({ ...body,
      decisionDigest: digest("morphogenesis-strategy-convergence-decision-v4", body) });
  }
}

export function createMorphogenesisStrategyGovernanceInputFromConvergenceV4(input: {
  readonly decision: MorphogenesisStrategyConvergenceDecisionV4;
  readonly governanceState: MorphogenesisStrategyGovernanceStateV3;
  readonly recommendationId: AgentPlatID;
  readonly adaptationStateDigest: PlanningDigestV1;
  readonly adaptationStateRevision: number;
  readonly riskDigest: PlanningDigestV1;
  readonly costDigest: PlanningDigestV1;
  readonly proposerId: AgentPlatID;
  readonly proposerImplementationDigest: PlanningDigestV1;
  readonly reviewRoute: MorphogenesisStrategyReviewRouteV3;
  readonly proposedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
}): null | {
  readonly recommendationId: AgentPlatID;
  readonly action: MorphogenesisStrategyGovernanceActionV3;
  readonly targetStrategyId: AgentPlatID;
  readonly replacementStrategyId: AgentPlatID | null;
  readonly adaptationStateDigest: PlanningDigestV1;
  readonly adaptationStateRevision: number;
  readonly evidenceDigests: readonly PlanningDigestV1[];
  readonly counterfactualDigest: null;
  readonly riskDigest: PlanningDigestV1;
  readonly costDigest: PlanningDigestV1;
  readonly confidenceBps: number;
  readonly proposerId: AgentPlatID;
  readonly proposerImplementationDigest: PlanningDigestV1;
  readonly reviewRoute: MorphogenesisStrategyReviewRouteV3;
  readonly reasonCodes: readonly string[];
  readonly proposedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
} {
  const decision = input.decision.convergenceDecision;
  if (decision.action === "hold" || decision.action === "explore") return null;
  const isolate = decision.action === "isolate";
  const targetStrategyId = isolate
    ? input.governanceState.activeStrategyId
    : decision.recommendedStrategyId;
  if (!targetStrategyId) return null;
  const action: MorphogenesisStrategyGovernanceActionV3 = isolate
    ? "rollback" : "promote";
  return freeze({
    recommendationId: input.recommendationId,
    action,
    targetStrategyId,
    replacementStrategyId: isolate ? input.governanceState.baselineStrategyId : null,
    adaptationStateDigest: sha(input.adaptationStateDigest),
    adaptationStateRevision: nonNegative(input.adaptationStateRevision),
    evidenceDigests: freeze([input.decision.decisionDigest,
      decision.decisionDigest, ...decision.scores.flatMap(({ observationDigests }) => observationDigests)].sort()),
    counterfactualDigest: null,
    riskDigest: sha(input.riskDigest), costDigest: sha(input.costDigest),
    confidenceBps: decision.recommendation?.confidenceBps ?? 10_000,
    proposerId: id(input.proposerId),
    proposerImplementationDigest: sha(input.proposerImplementationDigest),
    reviewRoute: input.reviewRoute,
    reasonCodes: freeze([`convergence_${decision.status}`, `convergence_${decision.action}`].sort()),
    proposedAtLogicalMs: nonNegative(input.proposedAtLogicalMs),
    expiresAtLogicalMs: positive(input.expiresAtLogicalMs),
  });
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u; const SHA = /^sha256:[0-9a-f]{64}$/u;
function id(value: unknown): AgentPlatID { if (typeof value !== "string" || !ID.test(value)) fail("Morphogenesis convergence ID is invalid"); return value as AgentPlatID; } function sha(value: unknown): PlanningDigestV1 { if (typeof value !== "string" || !SHA.test(value)) fail("Morphogenesis convergence digest is invalid"); return value as PlanningDigestV1; } function positive(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 1) fail("Morphogenesis convergence positive integer is invalid"); return value as number; } function nonNegative(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 0) fail("Morphogenesis convergence non-negative integer is invalid"); return value as number; } function digest(domain: string, value: unknown): PlanningDigestV1 { return digestPlanningJsonV1(domain as never, value as PlanningJson); } function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const item of Object.values(value as Record<string, unknown>)) freeze(item); } return value; } function fail(message: string): never { throw new TypeError(message); }
