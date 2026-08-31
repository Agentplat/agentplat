import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";

import { digestPlanningJsonV1 } from "@agentplat/collective-planning";
import {
  InMemoryLocalStrategyAdaptationStoreV1,
  LocalStrategyAdaptationRuntimeV1,
  createLocalStrategyAdaptationPolicyV1,
  createLocalStrategyCatalogV1,
  createLocalStrategyDefinitionV1,
  createLocalStrategySafetyResolutionPortV1,
  createLocalStrategySafetySignalSourceV1,
  createLocalStrategySafetySignalV1,
  createLocalStrategyFeedbackBatchV1,
} from "@agentplat/collective-runtime/strategy-adaptation";
import { verifySignedPeerStrategyOutcomeAttestationV1 } from "@agentplat/collective-runtime/strategy-evidence-exchange";
import {
  MorphogenesisStrategyEvidenceExchangeV4,
  createMorphogenesisOperatorOutcomeReceiptV2,
  createMorphogenesisStrategyCatalogV3,
  createMorphogenesisStrategyContextV3,
  createMorphogenesisStrategyDefinitionV3,
  createMorphogenesisStrategyExecutionBindingV3,
  createMorphogenesisStrategyFeedbackV3,
  createMorphogenesisStrategyIntelligencePolicyV4,
  createMorphogenesisStrategyOutcomeMeasurementV3,
  createMorphogenesisStrategySelectionRequestV3,
  createMorphogenesisStrategySelectionV3,
  createSignedMorphogenesisStrategyOutcomeAttestationV4,
  validateMorphogenesisStrategyOutcomeAttestationV4,
} from "@agentplat/collective-runtime/morphogenesis";

const sha = (value) => digestPlanningJsonV1("morphogenesis-strategy-context-v3", { value });
const operations = ["award_selection", "bid_submission", "offer_routing", "plan_decomposition", "recovery_selection"];
const dimensions = ["authority", "capability_state", "context_integrity", "role", "trust"];

async function fixture() {
  const strategy = createLocalStrategyDefinitionV1({
    schemaVersion: 1, strategyId: "strategy:morphogenesis:shared",
    strategyVersion: 1, implementationDigest: sha("strategy"), operations,
  });
  const localCatalog = createLocalStrategyCatalogV1({
    schemaVersion: 1, catalogId: "catalog:local", catalogVersion: 1,
    parentCatalogDigest: null, strategies: [strategy],
    baselines: Object.fromEntries(operations.map((operation) => [operation, strategy.strategyId])),
  });
  const morphogenesisPolicyDigest = sha("morphogenesis-policy");
  const catalog = createMorphogenesisStrategyCatalogV3({
    catalogId: "catalog:morphogenesis", catalogVersion: 1,
    parentCatalogDigest: null, localCatalog,
    strategies: [createMorphogenesisStrategyDefinitionV3({
      strategy, morphogenesisPolicyDigest,
      blueprintCatalogDigest: sha("blueprints"),
      proposalGeneratorDigest: sha("generator"),
      supportedOperators: ["replace_agent"],
    })],
  });
  const feedbackSource = { schemaVersion: 1, sourceId: "feedback:source",
    sourceVersion: 1, sourceImplementationDigest: sha("feedback-source") };
  const adaptationPolicy = createLocalStrategyAdaptationPolicyV1({
    schemaVersion: 1, policyId: "policy:adaptation", policyVersion: 1,
    parentPolicyDigest: null,
    requiredSafetyDimensions: Object.fromEntries(operations.map((operation) => [operation, dimensions])),
    feedbackMetrics: ["mission_progress", "latency_efficiency", "resource_efficiency",
      "recovery_quality", "safety"].map((metric) => ({ schemaVersion: 1, metric,
      weight: 1, direction: "maximize" })),
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
  const entropy = { entropyId: "entropy:test", entropyVersion: 1,
    entropyImplementationDigest: sha("entropy"),
    async draw() { return { drawBps: 0, evidenceDigest: sha("draw") }; } };
  const safety = createLocalStrategySafetyResolutionPortV1({
    sources: dimensions.map((dimension) => createLocalStrategySafetySignalSourceV1({
      dimension,
      async resolve({ request, strategy: item }) {
        return createLocalStrategySafetySignalV1({
          schemaVersion: 1, signalId: `signal:${dimension}`,
          requestId: request.requestId, requestDigest: request.requestDigest,
          strategyId: item.strategyId, strategyDigest: item.strategyDigest,
          dimension, disposition: "eligible", sourceId: `source:${dimension}`,
          sourceVersion: 1, sourceImplementationDigest: sha(`source:${dimension}`),
          sourceRevision: 1, reasonCodes: [`${dimension}_eligible`],
          observedAtLogicalMs: 10, expiresAtLogicalMs: 50,
        });
      },
    })),
  });
  const learner = new LocalStrategyAdaptationRuntimeV1({
    stateKey: "state:local", controllerId: "controller:test", controllerVersion: 1,
    implementationId: "implementation:test", policy: adaptationPolicy,
    catalog: localCatalog, safety, entropy,
    store: new InMemoryLocalStrategyAdaptationStoreV1({
      policy: adaptationPolicy, catalog: localCatalog, entropy,
    }),
  });
  const context = createMorphogenesisStrategyContextV3({
    scopeDigest: sha("scope"), morphologyEpoch: 1,
    currentSnapshotDigest: sha("snapshot"), needDigest: sha("need"),
    targetDigest: sha("target"), morphogenesisPolicyDigest,
    riskDigest: sha("risk"), costEnvelopeDigest: sha("cost"), deadlineDigest: sha("deadline"),
  });
  const request = createMorphogenesisStrategySelectionRequestV3({
    requestId: "request:intelligence",
    scope: { tenantId: "tenant:test", meshId: "mesh:test",
      policyDomainId: "policy-domain:test", missionIntentId: "mission-intent:test",
      objectiveId: "objective:test", workItemId: null, workItemRevision: null },
    context, catalog, logicalTimeMs: 10,
  });
  const decision = await learner.select(request);
  const selection = createMorphogenesisStrategySelectionV3({
    selectionId: "selection:intelligence", context, catalog, request, decision,
  });
  const planDigest = sha("plan");
  const executionBinding = createMorphogenesisStrategyExecutionBindingV3({
    bindingId: "binding:intelligence", selection,
    proposalDigest: sha("proposal"), planDigest,
    generatorReceiptDigest: sha("generator-receipt"), boundAtLogicalMs: 12,
  });
  const outcome = createMorphogenesisOperatorOutcomeReceiptV2({
    receiptId: "outcome:intelligence", operatorExecutionStateDigest: sha("execution"),
    planDigest, proposalDigest: executionBinding.proposalDigest,
    decisionDigest: sha("decision"), authorizationDigest: sha("authorization"),
    authorityFenceDigest: sha("fence"), stepReceiptRoot: sha("steps"),
    disposition: "success", outcomeEvidenceDigests: [sha("outcome-evidence")],
    resultingSnapshotDigest: sha("result"), resultingMorphologyEpoch: 2,
    evaluatedAtLogicalMs: 20,
  });
  const measurement = createMorphogenesisStrategyOutcomeMeasurementV3({
    measurementId: "measurement:intelligence", selection, executionBinding, outcome,
    metrics: ["mission_progress", "latency_efficiency", "resource_efficiency",
      "recovery_quality", "safety"].map((metric) => ({ schemaVersion: 1,
      metric, valueMicros: 900_000 })), confidenceBps: 9_000,
    sourceId: feedbackSource.sourceId, sourceVersion: 1,
    sourceImplementationDigest: feedbackSource.sourceImplementationDigest,
    sourceRevision: 1, provenanceDigest: sha("provenance"),
    evidenceDigests: [sha("measurement-evidence")],
    observedAtLogicalMs: 22, expiresAtLogicalMs: 60,
  });
  const feedback = createMorphogenesisStrategyFeedbackV3({
    feedbackId: "feedback:intelligence", selection, outcome, measurement,
    outcomeRevision: 1,
  });
  const batch = createLocalStrategyFeedbackBatchV1({
    schemaVersion: 1, batchId: "batch:intelligence",
    decisionId: decision.decisionId, decisionDigest: decision.decisionDigest,
    logicalTimeMs: 25, signals: [feedback.localFeedback],
  });
  const feedbackDecision = await learner.observe(batch);
  return { strategy, catalog, context, selection, executionBinding, outcome,
    measurement, feedback, batch, feedbackDecision, adaptationPolicy };
}

test("V4 signs Morphogenesis lineage and delegates compatible evidence to the existing Exchange", async () => {
  const value = await fixture();
  const keys = await webcrypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  const contextClassDigest = sha("context-class");
  const attestation = await createSignedMorphogenesisStrategyOutcomeAttestationV4({
    catalog: value.catalog, context: value.context, contextClassDigest,
    selection: value.selection, executionBinding: value.executionBinding,
    outcome: value.outcome, measurement: value.measurement, feedback: value.feedback,
    localPolicyDigest: value.adaptationPolicy.policyDigest,
    feedbackBatchDigest: value.batch.batchDigest,
    feedbackDecisionDigest: value.feedbackDecision.feedbackDecisionDigest,
    tenantId: "tenant:test", meshId: "mesh:test", policyDomainId: "policy-domain:test",
    missionIntentId: "mission-intent:test", objectiveId: "objective:test",
    issuerPeerId: "peer:issuer", issuerInstanceId: "instance:issuer",
    issuerStreamId: "stream:issuer", issuerSequence: 1,
    predecessorAttestationDigest: null, membershipEpoch: 1,
    membershipConfigurationDigest: sha("membership"),
    observedAtLogicalMs: 30, expiresAtLogicalMs: 80,
    signing: { keyId: "key:issuer", privateKey: keys.privateKey },
    crypto: webcrypto,
  });
  assert.equal((await verifySignedPeerStrategyOutcomeAttestationV1({
    attestation: attestation.signedAttestation,
    publicKey: keys.publicKey,
    crypto: webcrypto,
  }))?.attestationDigest, attestation.signedAttestation.attestationDigest);
  let admissions = 0;
  const exchange = {
    exchangerId: "exchange:test", exchangerVersion: 1,
    implementationId: "exchange:test", policyId: "policy:exchange",
    policyVersion: 1, policyDigest: sha("exchange-policy"),
    async admit({ attestation: inner }) {
      admissions += 1;
      return { schemaVersion: 1, attestationId: inner.attestationId,
        attestationDigest: inner.attestationDigest, status: "admitted",
        eligibilityDecisionDigest: sha("eligibility"), reasonCodes: [],
        priorStateRevision: 0, committedStateRevision: 1,
        admissionDecisionDigest: sha("admission") };
    },
    async certify() { return { status: "insufficient_evidence" }; },
  };
  const policy = createMorphogenesisStrategyIntelligencePolicyV4({
    schemaVersion: 4, policyId: "policy:intelligence", policyVersion: 1,
    tenantId: "tenant:test", meshId: "mesh:test",
    policyDomainId: "policy-domain:test", catalogDigest: value.catalog.catalogDigest,
    morphogenesisPolicyDigest: value.context.morphogenesisPolicyDigest,
    admittedContextClassDigests: [contextClassDigest], maximumAttestationTtlMs: 100,
  });
  const adapter = new MorphogenesisStrategyEvidenceExchangeV4({
    policy, catalog: value.catalog, exchange,
  });
  assert.equal((await adapter.admit({ attestation, logicalTimeMs: 35 })).status, "admitted");
  assert.equal(admissions, 1);
  assert.equal(validateMorphogenesisStrategyOutcomeAttestationV4(attestation).attestationDigest,
    attestation.attestationDigest);
  assert.throws(() => validateMorphogenesisStrategyOutcomeAttestationV4({
    ...attestation,
    binding: { ...attestation.binding, blueprintCatalogDigest: sha("substituted") },
  }), /binding|attestation/);
});

test("V4 rejects an incompatible context class before Exchange admission", async () => {
  const value = await fixture();
  const keys = await webcrypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  const attestation = await createSignedMorphogenesisStrategyOutcomeAttestationV4({
    catalog: value.catalog, context: value.context, contextClassDigest: sha("foreign-context"),
    selection: value.selection, executionBinding: value.executionBinding,
    outcome: value.outcome, measurement: value.measurement, feedback: value.feedback,
    localPolicyDigest: value.adaptationPolicy.policyDigest,
    feedbackBatchDigest: value.batch.batchDigest,
    feedbackDecisionDigest: value.feedbackDecision.feedbackDecisionDigest,
    tenantId: "tenant:test", meshId: "mesh:test", policyDomainId: "policy-domain:test",
    missionIntentId: "mission-intent:test", objectiveId: "objective:test",
    issuerPeerId: "peer:issuer", issuerInstanceId: "instance:issuer",
    issuerStreamId: "stream:issuer", issuerSequence: 1,
    predecessorAttestationDigest: null, membershipEpoch: 1,
    membershipConfigurationDigest: sha("membership"), observedAtLogicalMs: 30,
    expiresAtLogicalMs: 80, signing: { keyId: "key:issuer", privateKey: keys.privateKey },
    crypto: webcrypto,
  });
  let admissions = 0;
  const adapter = new MorphogenesisStrategyEvidenceExchangeV4({
    policy: createMorphogenesisStrategyIntelligencePolicyV4({
      schemaVersion: 4, policyId: "policy:intelligence", policyVersion: 1,
      tenantId: "tenant:test", meshId: "mesh:test",
      policyDomainId: "policy-domain:test", catalogDigest: value.catalog.catalogDigest,
      morphogenesisPolicyDigest: value.context.morphogenesisPolicyDigest,
      admittedContextClassDigests: [sha("local-context")], maximumAttestationTtlMs: 100,
    }),
    catalog: value.catalog,
    exchange: { async admit() { admissions += 1; }, async certify() {} },
  });
  await assert.rejects(adapter.admit({ attestation, logicalTimeMs: 35 }),
    /compatible local cohort/);
  assert.equal(admissions, 0);
});
