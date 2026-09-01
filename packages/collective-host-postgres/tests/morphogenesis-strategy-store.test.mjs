import assert from "node:assert/strict";
import test from "node:test";

import { digestPlanningJsonV1 } from "@agentplat/collective-planning";
import {
  LocalStrategyAdaptationRuntimeV1,
  createLocalStrategyAdaptationPolicyV1,
  createLocalStrategyCatalogV1,
  createLocalStrategyDefinitionV1,
  createLocalStrategySafetyResolutionPortV1,
  createLocalStrategySafetySignalSourceV1,
  createLocalStrategySafetySignalV1,
  createLocalStrategySelectionRequestV1,
} from "@agentplat/collective-runtime/strategy-adaptation";
import {
  MorphogenesisStrategyGovernanceRuntimeV3,
  createMorphogenesisStrategyCatalogV3,
  createMorphogenesisStrategyDefinitionV3,
  createMorphogenesisStrategyGovernancePolicyV3,
  createMorphogenesisStrategyReviewV3,
  createMorphogenesisStrategyCounterfactualEstimateV3,
  createMorphogenesisStrategyCounterfactualReportV3,
  MorphogenesisSynthesisGovernanceRuntimeV5,
  createMorphogenesisStrategySynthesisPolicyV5,
  createMorphogenesisSynthesisGovernancePolicyV5,
  MORPHOGENESIS_SYNTHESIS_THREATS_V5,
  createMorphogenesisSynthesisThreatAssessmentV5,
  MORPHOGENESIS_AGENT_GENESIS_THREATS_V6,
  MorphogenesisAgentGenesisLifecycleRuntimeV6,
  MorphogenesisAgentGenesisSandboxRuntimeV6,
  createMorphogenesisAgentGenesisPolicyV6,
  createMorphogenesisAgentGenesisLifecyclePolicyV6,
  MorphogenesisIntegrationVerticalRuntimeV1,
  MORPHOGENESIS_VERTICAL_STAGES_V1,
} from "@agentplat/collective-runtime/morphogenesis";
import {
  createPeerStrategyEvidenceExchangePolicyV1,
  createPeerStrategyEvidenceStateV1,
} from "@agentplat/collective-runtime/strategy-evidence-exchange";
import {
  createStrategyConvergencePolicyV1,
  createStrategyConvergenceStateV1,
} from "@agentplat/collective-runtime/strategy-convergence";
import {
  PostgresLocalStrategyAdaptationStoreV1,
  PostgresMorphogenesisStrategyGovernanceStoreV3,
  PostgresMorphogenesisStrategyCounterfactualStoreV3,
  PostgresPeerStrategyEvidenceStoreV1,
  PostgresStrategyConvergenceStoreV1,
  PostgresMorphogenesisSynthesisGovernanceStoreV5,
  PostgresMorphogenesisSynthesisSimulationStoreV5,
  PostgresMorphogenesisAgentGenesisLifecycleStoreV6,
  PostgresMorphogenesisVerticalStoreV1,
} from "../dist/morphogenesis-strategy.js";

const sha = (value) => digestPlanningJsonV1("morphogenesis-strategy-context-v3", { value });
const operations = ["award_selection", "bid_submission", "offer_routing", "plan_decomposition", "recovery_selection"];
const dimensions = ["authority", "capability_state", "context_integrity", "role", "trust"];

class FakePool {
  rows = new Map();
  async query(sql, params) {
    const counterfactual = sql.includes("morphogenesis-strategy-counterfactual");
    const simulation = sql.includes("morphogenesis-synthesis-simulation-report");
    const immutable = counterfactual || simulation;
    const kind = counterfactual ? "morphogenesis-strategy-counterfactual"
      : simulation ? "morphogenesis-synthesis-simulation-report" : params[1];
    const stateKey = immutable ? params[1] : params[2];
    const key = `${params[0]}:${kind}:${stateKey}`;
    if (sql.includes("SELECT")) {
      const row = this.rows.get(key);
      return { rowCount: row ? 1 : 0, rows: row ? [structuredClone(row)] : [] };
    }
    if (sql.includes("INSERT")) {
      if (this.rows.has(key)) return { rowCount: 0, rows: [] };
      this.rows.set(key, {
        revision: immutable ? 0 : params[3],
        logical_time_high_water_ms: immutable ? params[2] : params[4],
        state_digest: immutable ? params[3] : params[5],
        state: JSON.parse(immutable ? params[4] : params[6]),
      });
      return { rowCount: 1, rows: [] };
    }
    if (sql.includes("UPDATE")) {
      const current = this.rows.get(key);
      if (!current || Number(current.revision) !== params[3] ||
          current.state_digest !== params[4] ||
          Number(current.logical_time_high_water_ms) > params[6])
        return { rowCount: 0, rows: [] };
      this.rows.set(key, {
        revision: params[5], logical_time_high_water_ms: params[6],
        state_digest: params[7], state: JSON.parse(params[8]),
      });
      return { rowCount: 1, rows: [] };
    }
    throw new Error(`unexpected SQL: ${sql}`);
  }
}

class Witness {
  heads = new Map();
  async verify(input) {
    const value = this.heads.get(`${input.scopeId}:${input.stateKind}:${input.stateKey}`);
    return value?.revision === input.revision && value?.digest === input.digest;
  }
  async record(input) {
    const key = `${input.scopeId}:${input.stateKind}:${input.stateKey}`;
    const current = this.heads.get(key);
    if (input.previousRevision === null ? Boolean(current) :
      !current || current.revision !== input.previousRevision || current.digest !== input.previousDigest)
      return false;
    this.heads.set(key, { revision: input.nextRevision, digest: input.nextDigest });
    return true;
  }
}

function fixture() {
  const strategy = createLocalStrategyDefinitionV1({
    schemaVersion: 1, strategyId: "strategy:baseline", strategyVersion: 1,
    implementationDigest: sha("implementation"), operations,
  });
  const adaptive = createLocalStrategyDefinitionV1({
    schemaVersion: 1, strategyId: "strategy:adaptive", strategyVersion: 1,
    implementationDigest: sha("implementation:adaptive"), operations,
  });
  const localCatalog = createLocalStrategyCatalogV1({
    schemaVersion: 1, catalogId: "catalog:local", catalogVersion: 1,
    parentCatalogDigest: null, strategies: [strategy, adaptive],
    baselines: Object.fromEntries(operations.map((operation) => [operation, strategy.strategyId])),
  });
  const feedbackSource = {
    schemaVersion: 1, sourceId: "feedback:source", sourceVersion: 1,
    sourceImplementationDigest: sha("feedback-source"),
  };
  const adaptationPolicy = createLocalStrategyAdaptationPolicyV1({
    schemaVersion: 1, policyId: "policy:adaptation", policyVersion: 1,
    parentPolicyDigest: null,
    requiredSafetyDimensions: Object.fromEntries(operations.map((operation) => [operation, dimensions])),
    feedbackMetrics: ["mission_progress", "latency_efficiency", "resource_efficiency", "recovery_quality", "safety"]
      .map((metric) => ({ schemaVersion: 1, metric, weight: 1, direction: "maximize" })),
    feedbackSources: [feedbackSource], minimumFeedbackSources: 1,
    minimumFeedbackConfidenceBps: 8_000, learningRateBps: 1_000,
    explorationRateBps: 0, baselineProbabilityFloorBps: 10_000,
    initialWeightMicros: 1_000_000, minimumWeightMicros: 100_000,
    maximumWeightMicros: 10_000_000, unsafePenaltyBps: 8_000,
    quarantineDurationMs: 100,
    limits: { maximumStrategies: 4, maximumPendingDecisions: 8,
      maximumSafetyHeads: 64, maximumFeedbackHeads: 16,
      maximumReasonCodesPerSignal: 8, maximumDecisionTtlMs: 50,
      maximumSafetySignalTtlMs: 100, maximumFeedbackDelayMs: 100,
      maximumCommitAttempts: 4 },
  });
  const entropy = {
    entropyId: "entropy:test", entropyVersion: 1,
    entropyImplementationDigest: sha("entropy"),
    async draw() { return { drawBps: 0, evidenceDigest: sha("draw") }; },
  };
  const morphogenesisCatalog = createMorphogenesisStrategyCatalogV3({
    catalogId: "catalog:morphogenesis", catalogVersion: 1,
    parentCatalogDigest: null, localCatalog,
    strategies: [strategy, adaptive].map((item) => createMorphogenesisStrategyDefinitionV3({
      strategy: item, morphogenesisPolicyDigest: sha("morph-policy"),
      blueprintCatalogDigest: sha("blueprints"), proposalGeneratorDigest: sha(`generator:${item.strategyId}`),
      supportedOperators: ["replace_agent"],
    })),
  });
  const governancePolicy = createMorphogenesisStrategyGovernancePolicyV3({
    schemaVersion: 3, policyId: "policy:governance", policyVersion: 1,
    parentPolicyDigest: null, allowedActions: ["promote", "degrade", "retire", "rollback"],
    allowedReviewRoutes: ["authorized_agent"], requireIndependentReviewer: true,
    minimumConfidenceBps: 8_000, cooldownMs: 0, transitionWindowMs: 100,
    maximumTransitionsPerWindow: 4, maximumPendingRecommendations: 4,
    maximumReviewHistory: 8, maximumTransitionHistory: 8, maximumCommitAttempts: 4,
  });
  return { strategy, adaptive, localCatalog, adaptationPolicy, entropy, morphogenesisCatalog, governancePolicy };
}

test("PostgreSQL strategy adaptation and governance survive reconstruction and witness rollback", async () => {
  const value = fixture();
  const pool = new FakePool();
  const witness = new Witness();
  const options = { scopeId: "tenant:strategy", rollbackWitness: witness };
  const adaptationStore = new PostgresLocalStrategyAdaptationStoreV1({
    pool, options, policy: value.adaptationPolicy,
    catalog: value.localCatalog, entropy: value.entropy,
  });
  const safety = createLocalStrategySafetyResolutionPortV1({
    sources: dimensions.map((dimension) => createLocalStrategySafetySignalSourceV1({
      dimension,
      async resolve({ request, strategy }) {
        return createLocalStrategySafetySignalV1({
          schemaVersion: 1, signalId: `signal:${dimension}`,
          requestId: request.requestId, requestDigest: request.requestDigest,
          strategyId: strategy.strategyId, strategyDigest: strategy.strategyDigest,
          dimension, disposition: "eligible", sourceId: `source:${dimension}`,
          sourceVersion: 1, sourceImplementationDigest: sha(`source:${dimension}`),
          sourceRevision: 1, reasonCodes: [`${dimension}_eligible`],
          observedAtLogicalMs: 10, expiresAtLogicalMs: 50,
        });
      },
    })),
  });
  const adaptation = new LocalStrategyAdaptationRuntimeV1({
    stateKey: "state:adaptation", controllerId: "controller:test",
    controllerVersion: 1, implementationId: "implementation:test",
    policy: value.adaptationPolicy, catalog: value.localCatalog,
    safety, entropy: value.entropy, store: adaptationStore,
  });
  await adaptation.select(createLocalStrategySelectionRequestV1({
    schemaVersion: 1, requestId: "request:strategy", operation: "plan_decomposition",
    scope: { tenantId: "tenant", meshId: "mesh", policyDomainId: "policy",
      missionIntentId: "mission", objectiveId: "objective",
      workItemId: null, workItemRevision: null },
    logicalTimeMs: 10, contextDigest: sha("context"),
    availableStrategyIds: [value.strategy.strategyId],
  }));
  const reopenedAdaptation = new PostgresLocalStrategyAdaptationStoreV1({
    pool, options, policy: value.adaptationPolicy,
    catalog: value.localCatalog, entropy: value.entropy,
  });
  const adaptationState = await reopenedAdaptation.load("state:adaptation");
  assert.equal(adaptationState.revision >= 1, true);

  const governanceStateKey = "state:governance";
  const governanceStore = new PostgresMorphogenesisStrategyGovernanceStoreV3({
    pool, options, stateKey: governanceStateKey,
    policy: value.governancePolicy, catalog: value.morphogenesisCatalog,
  });
  const governance = new MorphogenesisStrategyGovernanceRuntimeV3({
    stateKey: governanceStateKey, policy: value.governancePolicy,
    catalog: value.morphogenesisCatalog,
    reviews: { async review({ recommendation, logicalTimeMs }) {
      return createMorphogenesisStrategyReviewV3({
        reviewId: "review:test", recommendationDigest: recommendation.recommendationDigest,
        recommendationId: recommendation.recommendationId,
        route: "authorized_agent", actorType: "agent", actorId: "agent:reviewer",
        actorMandateDigest: sha("mandate"), independenceGroupId: "independence:reviewer",
        disposition: "approved", proofDigest: sha("proof"),
        reviewedAtLogicalMs: logicalTimeMs, expiresAtLogicalMs: logicalTimeMs + 10,
      });
    } },
    store: governanceStore,
  });
  const recommendation = await governance.recommend({
    recommendationId: "recommendation:test", action: "promote",
    targetStrategyId: value.adaptive.strategyId, replacementStrategyId: null,
    adaptationStateDigest: adaptationState.stateDigest,
    adaptationStateRevision: adaptationState.revision, evidenceDigests: [sha("evidence")],
    counterfactualDigest: null, riskDigest: sha("risk"), costDigest: sha("cost"),
    confidenceBps: 9_000, proposerId: "agent:analyst",
    proposerImplementationDigest: sha("analyst"), reviewRoute: "authorized_agent",
    reasonCodes: ["promote_supported"], proposedAtLogicalMs: 20, expiresAtLogicalMs: 40,
  });
  const governed = await governance.reviewAndApply({ recommendation, logicalTimeMs: 25 });
  const reopenedGovernance = new PostgresMorphogenesisStrategyGovernanceStoreV3({
    pool, options, stateKey: governanceStateKey,
    policy: value.governancePolicy, catalog: value.morphogenesisCatalog,
  });
  assert.equal((await reopenedGovernance.load(governanceStateKey)).stateDigest, governed.stateDigest);
  witness.heads.clear();
  await assert.rejects(reopenedAdaptation.load("state:adaptation"), /witness diverged/);
  await assert.rejects(reopenedGovernance.load(governanceStateKey), /witness diverged/);
});

test("PostgreSQL counterfactual reports are immutable and witness guarded", async () => {
  const pool = new FakePool();
  const witness = new Witness();
  const options = { scopeId: "tenant:counterfactual", rollbackWitness: witness };
  const estimate = createMorphogenesisStrategyCounterfactualEstimateV3({
    scenarioDigest: sha("scenario"), strategyId: "strategy:baseline",
    definitionDigest: sha("definition"), simulatorImplementationDigest: sha("simulator"),
    seedDigest: sha("seed"), disposition: "success",
    metrics: ["mission_progress", "latency_efficiency", "resource_efficiency",
      "recovery_quality", "safety"].map((metric) => ({ schemaVersion: 1, metric, valueMicros: 800_000 })),
    confidenceBps: 9_000, evidenceDigests: [sha("estimate-evidence")],
    interactionUnits: 1, estimatedAtLogicalMs: 20,
  });
  const report = createMorphogenesisStrategyCounterfactualReportV3({
    reportId: "report:postgres", scenarioDigest: estimate.scenarioDigest,
    actualSelectionDigest: null, actualOutcomeReceiptDigest: null,
    actualMeasurementDigest: null, estimates: [estimate],
    classification: "inconclusive", recommendedAction: "explore",
    recommendedStrategyId: estimate.strategyId,
    evidenceDigests: [estimate.estimateDigest], evaluatedAtLogicalMs: 25,
  });
  const store = new PostgresMorphogenesisStrategyCounterfactualStoreV3(pool, options);
  assert.equal(await store.save(report), true);
  assert.equal(await store.save(report), true);
  assert.equal((await store.load(report.reportId)).reportDigest, report.reportDigest);
  witness.heads.clear();
  await assert.rejects(store.load(report.reportId), /witness diverged/);
});

test("PostgreSQL V4 Exchange and Convergence heads preserve CAS and rollback witnesses", async () => {
  const pool = new FakePool();
  const witness = new Witness();
  const options = { scopeId: "tenant:intelligence-v4", rollbackWitness: witness };
  const evidencePolicy = createPeerStrategyEvidenceExchangePolicyV1({
    schemaVersion: 1, policyId: "policy:evidence", policyVersion: 1,
    parentPolicyDigest: null, feedbackSchemaDigest: sha("feedback-schema"),
    minimumDistinctPeers: 3, minimumDistinctIndependenceGroups: 3,
    minimumConfidenceBps: 8_000, maximumPriorInfluenceBps: 2_000,
    limits: { maximumAttestations: 16, maximumAttestationsPerPeer: 4,
      maximumSourceHeads: 16, maximumCertificates: 8,
      maximumFeedbackSignalDigests: 16, maximumAttestationTtlMs: 100,
      maximumFutureSkewMs: 5, maximumReasonCodesPerDecision: 8,
      maximumCommitAttempts: 4, maximumGossipFanout: 4, maximumGossipHops: 3 },
  });
  const evidenceStore = new PostgresPeerStrategyEvidenceStoreV1({
    pool, options, policy: evidencePolicy,
  });
  const evidenceInitial = createPeerStrategyEvidenceStateV1({
    stateKey: "state:evidence", exchangerId: "exchange", exchangerVersion: 1,
    implementationId: "exchange:v1", policy: evidencePolicy,
  });
  assert.equal(await evidenceStore.save({ state: evidenceInitial, expectedRevision: null }), true);
  const evidenceNext = createPeerStrategyEvidenceStateV1({
    stateKey: evidenceInitial.stateKey, exchangerId: evidenceInitial.exchangerId,
    exchangerVersion: evidenceInitial.exchangerVersion,
    implementationId: evidenceInitial.implementationId, policy: evidencePolicy,
    revision: 1, logicalTimeHighWaterMs: 10,
    predecessorStateDigest: evidenceInitial.stateDigest,
  });
  assert.equal(await evidenceStore.save({ state: evidenceNext, expectedRevision: 0 }), true);
  assert.equal((await new PostgresPeerStrategyEvidenceStoreV1({
    pool, options, policy: evidencePolicy,
  }).load(evidenceInitial.stateKey)).stateDigest, evidenceNext.stateDigest);

  const convergencePolicy = createStrategyConvergencePolicyV1({
    schemaVersion: 1, policyId: "policy:convergence", policyVersion: 1,
    parentPolicyDigest: null, minimumConfidenceBps: 8_000,
    minimumDistinctPeers: 3, minimumDistinctIndependenceGroups: 3,
    minimumStableCycles: 2, recoveryStableCycles: 3,
    improvementMarginBps: 500, diversityPreservationMarginBps: 400,
    minimumCycleIntervalMs: 10, cooldownDurationMs: 20,
    oscillationWindowMs: 100, maximumTransitionsPerOscillationWindow: 2,
    maximumPriorInfluenceBps: 2_000, recommendationTtlMs: 50,
    limits: { maximumScopes: 4, maximumStrategiesPerScope: 4,
      maximumObservationsPerCycle: 8, maximumHistoryPerScope: 16,
      maximumSourceIdsPerObservation: 8, maximumReasonCodesPerDecision: 8,
      maximumObservationTtlMs: 100, maximumFutureSkewMs: 5,
      maximumCommitAttempts: 4 },
  });
  const convergenceStore = new PostgresStrategyConvergenceStoreV1({
    pool, options, policy: convergencePolicy,
  });
  const convergenceInitial = createStrategyConvergenceStateV1({
    stateKey: "state:convergence", controllerId: "convergence",
    controllerVersion: 1, implementationId: "convergence:v1",
    policy: convergencePolicy,
  });
  assert.equal(await convergenceStore.save({ state: convergenceInitial, expectedRevision: null }), true);
  const convergenceNext = createStrategyConvergenceStateV1({
    stateKey: convergenceInitial.stateKey,
    controllerId: convergenceInitial.controllerId,
    controllerVersion: convergenceInitial.controllerVersion,
    implementationId: convergenceInitial.implementationId,
    policy: convergencePolicy, revision: 1, logicalTimeHighWaterMs: 10,
    predecessorStateDigest: convergenceInitial.stateDigest,
  });
  assert.equal(await convergenceStore.save({ state: convergenceNext, expectedRevision: 0 }), true);
  assert.equal((await new PostgresStrategyConvergenceStoreV1({
    pool, options, policy: convergencePolicy,
  }).load(convergenceInitial.stateKey)).stateDigest, convergenceNext.stateDigest);
  witness.heads.clear();
  await assert.rejects(evidenceStore.load(evidenceInitial.stateKey), /witness diverged/);
  await assert.rejects(convergenceStore.load(convergenceInitial.stateKey), /witness diverged/);
});

test("PostgreSQL V5 synthesis governance state survives reconstruction and witness rollback", async () => {
  const pool = new FakePool();
  const witness = new Witness();
  const options = { scopeId: "tenant:synthesis-v5", rollbackWitness: witness };
  const synthesisPolicy = createMorphogenesisStrategySynthesisPolicyV5({
    schemaVersion: 5, policyId: "policy:synthesis", policyVersion: 1,
    parentPolicyDigest: null, catalogDigest: sha("catalog"),
    governancePolicyDigest: sha("governance-v3"),
    admittedSynthesizerImplementationDigests: [sha("synthesizer")],
    requiredThreats: MORPHOGENESIS_SYNTHESIS_THREATS_V5,
    allowedReviewRoutes: ["authorized_agent", "authorized_person", "collective"],
    minimumGapEvidence: 2, minimumEvaluationConfidenceBps: 8_000,
    minimumSafetyMicros: 800_000, maximumCandidateTtlMs: 100,
    maximumEvaluationTtlMs: 50, maximumTokenBudget: 10_000,
    maximumToolCalls: 8, maximumSpawnDepth: 0, maximumCandidatesPerGap: 4,
  });
  const policy = createMorphogenesisSynthesisGovernancePolicyV5({
    schemaVersion: 5, policyId: "policy:synthesis-governance", policyVersion: 1,
    synthesisPolicyDigest: synthesisPolicy.policyDigest,
    allowedActions: ["admit_experimental", "certify", "degrade", "retire", "rollback"],
    allowedReviewRoutes: ["authorized_agent", "authorized_person", "collective"],
    requireIndependentReviewer: true, maximumCanarySelections: 4,
    minimumCanaryOutcomes: 2, minimumCanarySuccesses: 2,
    maximumCanaryUnsafeOutcomes: 0, maximumPendingRecommendations: 8,
    maximumHistory: 16, maximumCommitAttempts: 4,
  });
  const store = new PostgresMorphogenesisSynthesisGovernanceStoreV5({
    pool, options, policy, synthesisPolicy,
  });
  const runtime = new MorphogenesisSynthesisGovernanceRuntimeV5({
    stateKey: "state:synthesis-v5", policy, synthesisPolicy, store,
    reviews: { async review() { return null; } },
  });
  const initial = await runtime.state(10);
  assert.equal(await store.save({ state: initial, expectedRevision: null,
    expectedStateDigest: null }), true);
  assert.equal((await new PostgresMorphogenesisSynthesisGovernanceStoreV5({
    pool, options, policy, synthesisPolicy,
  }).load(initial.stateKey)).stateDigest, initial.stateDigest);
  witness.heads.clear();
  await assert.rejects(store.load(initial.stateKey), /witness diverged/);
});

test("PostgreSQL V5 simulation reports are immutable and witness guarded", async () => {
  const pool = new FakePool();
  const witness = new Witness();
  const options = { scopeId: "tenant:synthesis-simulation", rollbackWitness: witness };
  const body = Object.freeze({ schemaVersion: 5, reportId: "report:synthesis-v5",
    scenarioDigest: sha("scenario"), candidateDigest: sha("candidate"),
    baselineStrategyId: "strategy:baseline",
    simulatorImplementationDigest: sha("simulator"), seedDigest: sha("seed"),
    threatAssessments: MORPHOGENESIS_SYNTHESIS_THREATS_V5.map((threat) =>
      createMorphogenesisSynthesisThreatAssessmentV5({ threat, disposition: "passed",
        evidenceDigests: [sha(`threat:${threat}`)] })),
    safetyMicros: 900_000, confidenceBps: 9_000,
    evidenceDigests: [sha("simulation-evidence")], interactionUnits: 80,
    evaluatedAtLogicalMs: 30, advisoryOnly: true });
  const report = Object.freeze({ ...body,
    reportDigest: digestPlanningJsonV1("morphogenesis-synthesis-simulation-report-v5", body) });
  const store = new PostgresMorphogenesisSynthesisSimulationStoreV5(pool, options);
  assert.equal(await store.save(report), true);
  assert.equal((await new PostgresMorphogenesisSynthesisSimulationStoreV5(pool, options)
    .load(report.reportId)).reportDigest, report.reportDigest);
  assert.equal(await store.save(report), true);
  witness.heads.clear();
  await assert.rejects(store.load(report.reportId), /witness diverged/);
});

test("PostgreSQL V6 Agent Genesis lifecycle is digest and witness guarded", async () => {
  const pool = new FakePool(); const witness = new Witness();
  const options = { scopeId: "tenant:agent-genesis-v6", rollbackWitness: witness };
  const genesisPolicy = createMorphogenesisAgentGenesisPolicyV6({ schemaVersion: 6,
    policyId: "policy:agent-genesis", policyVersion: 1, parentPolicyDigest: null,
    morphogenesisPolicyDigest: sha("morphogenesis-policy"),
    strategySynthesisPolicyDigest: sha("strategy-synthesis"),
    admittedGeneratorImplementationDigests: [sha("generator")],
    requiredThreats: MORPHOGENESIS_AGENT_GENESIS_THREATS_V6,
    allowedReviewRoutes: ["authorized_agent", "authorized_person", "collective"],
    maximumResourceBudgetUnits: 20, maximumInteractionBudgetUnits: 30,
    maximumActionBudgetUnits: 3, maximumDraftTtlMs: 100,
    maximumProbationInteractions: 10, maximumSpawnDepth: 0,
    minimumAssessmentConfidenceBps: 8_000, minimumSafetyMicros: 800_000,
    maximumAssessmentTtlMs: 50 });
  const policy = createMorphogenesisAgentGenesisLifecyclePolicyV6({ schemaVersion: 6,
    policyId: "policy:agent-genesis-lifecycle", policyVersion: 1,
    genesisPolicyDigest: genesisPolicy.policyDigest,
    allowedActions: ["start_probation", "admit", "suspend", "resume", "retire", "rollback"],
    allowedReviewRoutes: ["authorized_agent", "authorized_person", "collective"],
    requireIndependentReviewer: true, maximumProbationObservations: 4,
    minimumProbationObservations: 2, minimumProbationSuccesses: 2,
    maximumUnsafeObservations: 0, maximumPendingRecommendations: 8,
    maximumHistory: 16, maximumCommitAttempts: 4 });
  const store = new PostgresMorphogenesisAgentGenesisLifecycleStoreV6({
    pool, options, policy, genesisPolicy });
  const runtime = new MorphogenesisAgentGenesisLifecycleRuntimeV6({
    stateKey: "state:agent-genesis", policy, genesisPolicy, store,
    sandbox: new MorphogenesisAgentGenesisSandboxRuntimeV6({ sandbox: {
      sandboxImplementationDigest: sha("sandbox"), async prepare() { throw new Error("unused"); } } }),
    reviews: { async review() { return null; } } });
  const initial = await runtime.state(10);
  assert.equal(await store.save({ state: initial, expectedRevision: null,
    expectedStateDigest: null }), true);
  assert.equal((await new PostgresMorphogenesisAgentGenesisLifecycleStoreV6({
    pool, options, policy, genesisPolicy }).load(initial.stateKey)).stateDigest,
  initial.stateDigest);
  witness.heads.clear();
  await assert.rejects(store.load(initial.stateKey), /witness diverged/);
});
test("PostgreSQL V1-V8 vertical rejects corruption and witness rollback", async () => {
  const pool = new FakePool(), witness = new Witness();
  const options = { scopeId: "tenant:vertical", rollbackWitness: witness };
  const store = new PostgresMorphogenesisVerticalStoreV1({ pool, options });
  const unused = Object.fromEntries(MORPHOGENESIS_VERTICAL_STAGES_V1.map((stage) =>
    [stage, { async execute() { throw new Error("unused"); },
      async reconcile() { throw new Error("unused"); },
      async compensate() { throw new Error("unused"); } }]));
  const runtime = new MorphogenesisIntegrationVerticalRuntimeV1({
    store, ports: unused, maximumCommitAttempts: 4 });
  const initial = await runtime.initialize({ stateKey: "vertical:postgres",
    rootInputDigest: sha("root"), logicalTimeMs: 10 });
  assert.equal((await new PostgresMorphogenesisVerticalStoreV1({ pool, options })
    .load(initial.stateKey)).stateDigest, initial.stateDigest);
  const row = [...pool.rows.values()].find(({ state }) => state.stateKey === initial.stateKey);
  row.state = { ...row.state, hiddenGrant: sha("hidden") };
  await assert.rejects(store.load(initial.stateKey), /state invalid|digest invalid/);
  row.state = structuredClone(initial);
  witness.heads.clear();
  await assert.rejects(store.load(initial.stateKey), /witness diverged/);
});
