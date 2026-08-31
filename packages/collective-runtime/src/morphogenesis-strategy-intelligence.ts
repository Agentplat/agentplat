import {
  createPeerStrategyEvidenceAdvisoryPriorSourceV1,
  createPeerStrategyEvidenceCollectiveSyncAdapterV1,
} from "./strategy-evidence-exchange-adapters.js";
import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";

import {
  createPeerStrategyEvidenceBindingV1,
  createPeerStrategyEvidenceCohortV1,
  createSignedPeerStrategyOutcomeAttestationV1,
  validateSignedPeerStrategyOutcomeAttestationV1,
} from "./strategy-evidence-exchange-runtime.js";
import type {
  PeerStrategyEvidenceAdmissionDecisionV1,
  PeerStrategyEvidenceCertificateDecisionV1,
  PeerStrategyEvidenceExchangePortV1,
  PeerStrategyEvidenceBindingV1,
  PeerStrategyEvidenceCohortV1,
  PeerStrategyEvidenceSyncRecordV1,
  SignedPeerStrategyOutcomeAttestationV1,
} from "./strategy-evidence-exchange-contracts.js";
import {
  validateMorphogenesisStrategyCatalogV3,
  validateMorphogenesisStrategyContextV3,
  validateMorphogenesisStrategyOutcomeMeasurementV3,
  validateMorphogenesisStrategySelectionV3,
  type MorphogenesisStrategyCatalogV3,
  type MorphogenesisStrategyContextV3,
  type MorphogenesisStrategyExecutionBindingV3,
  type MorphogenesisStrategyFeedbackV3,
  type MorphogenesisStrategyOutcomeMeasurementV3,
  type MorphogenesisStrategySelectionV3,
} from "./morphogenesis-strategy-adaptation.js";
import type { LocalStrategyCollectivePriorSourceV1 } from "./strategy-adaptation-contracts.js";
import {
  validateMorphogenesisOperatorOutcomeReceiptV2,
  type MorphogenesisOperatorOutcomeReceiptV2,
} from "./morphogenesis-operator-cycle.js";

export interface MorphogenesisStrategyEvidenceBindingV4 {
  readonly schemaVersion: 4;
  readonly catalogDigest: PlanningDigestV1;
  readonly strategyId: AgentPlatID;
  readonly strategyDigest: PlanningDigestV1;
  readonly definitionDigest: PlanningDigestV1;
  readonly morphogenesisPolicyDigest: PlanningDigestV1;
  readonly blueprintCatalogDigest: PlanningDigestV1;
  readonly proposalGeneratorDigest: PlanningDigestV1;
  readonly contextClassDigest: PlanningDigestV1;
  readonly feedbackSchemaDigest: PlanningDigestV1;
  readonly bindingDigest: PlanningDigestV1;
}

export interface MorphogenesisStrategyOutcomeAttestationV4 {
  readonly schemaVersion: 4;
  readonly binding: MorphogenesisStrategyEvidenceBindingV4;
  readonly contextDigest: PlanningDigestV1;
  readonly selectionDigest: PlanningDigestV1;
  readonly executionBindingDigest: PlanningDigestV1;
  readonly outcomeReceiptDigest: PlanningDigestV1;
  readonly measurementDigest: PlanningDigestV1;
  readonly feedbackDigest: PlanningDigestV1;
  readonly signedAttestation: SignedPeerStrategyOutcomeAttestationV1;
  readonly attestationDigest: PlanningDigestV1;
}

export interface MorphogenesisStrategyIntelligencePolicyV4 {
  readonly schemaVersion: 4;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly tenantId: AgentPlatID;
  readonly meshId: AgentPlatID;
  readonly policyDomainId: AgentPlatID;
  readonly catalogDigest: PlanningDigestV1;
  readonly morphogenesisPolicyDigest: PlanningDigestV1;
  readonly admittedContextClassDigests: readonly PlanningDigestV1[];
  readonly maximumAttestationTtlMs: number;
  readonly policyDigest: PlanningDigestV1;
}

/** Content-free Agent Mesh projection. The signed V1 envelope carries every
 * V4 lineage digest while reusing the existing authenticated sync domain. */
export interface MorphogenesisStrategyCollectiveSyncAdapterV4 {
  toRecord(input: {
    readonly attestation: MorphogenesisStrategyOutcomeAttestationV4;
    readonly predecessorRecordDigest: PlanningDigestV1 | null;
  }): Promise<PeerStrategyEvidenceSyncRecordV1>;
  fromRecord(input: {
    readonly record: PeerStrategyEvidenceSyncRecordV1;
  }): Promise<SignedPeerStrategyOutcomeAttestationV1 | null>;
}

export function createMorphogenesisStrategyCollectiveSyncAdapterV4(input: {
  readonly policy: MorphogenesisStrategyIntelligencePolicyV4;
  readonly crypto?: Crypto;
}): MorphogenesisStrategyCollectiveSyncAdapterV4 {
  const policy = validatePolicy(input.policy);
  const adapter = createPeerStrategyEvidenceCollectiveSyncAdapterV1({
    scope: { tenantId: policy.tenantId, meshId: policy.meshId,
      policyDomainId: policy.policyDomainId },
    ...(input.crypto ? { crypto: input.crypto } : {}),
  });
  return freeze({
    async toRecord(value: {
      readonly attestation: MorphogenesisStrategyOutcomeAttestationV4;
      readonly predecessorRecordDigest: PlanningDigestV1 | null;
    }) {
      const attestation = validateMorphogenesisStrategyOutcomeAttestationV4(
        value.attestation,
      );
      return adapter.toRecord({ attestation: attestation.signedAttestation,
        predecessorRecordDigest: value.predecessorRecordDigest });
    },
    fromRecord: adapter.fromRecord.bind(adapter),
  });
}

export function morphogenesisStrategyFeedbackSchemaDigestV4(): PlanningDigestV1 {
  return digest("morphogenesis-strategy-feedback-schema-v4", {
    schemaVersion: 4,
    operation: "plan_decomposition",
    metrics: ["latency_efficiency", "mission_progress", "recovery_quality",
      "resource_efficiency", "safety"],
    outcome: ["failure", "indeterminate", "success", "unsafe"],
  });
}

export function createMorphogenesisStrategyEvidenceBindingV4(input: {
  readonly catalog: MorphogenesisStrategyCatalogV3;
  readonly strategyId: AgentPlatID;
  readonly contextClassDigest: PlanningDigestV1;
}): MorphogenesisStrategyEvidenceBindingV4 {
  const catalog = validateMorphogenesisStrategyCatalogV3(input.catalog);
  const definition = catalog.strategies.find(({ strategy }) =>
    strategy.strategyId === input.strategyId);
  if (!definition) fail("Morphogenesis intelligence strategy is unavailable");
  const body = freeze({
    schemaVersion: 4 as const,
    catalogDigest: catalog.catalogDigest,
    strategyId: definition.strategy.strategyId,
    strategyDigest: definition.strategy.strategyDigest,
    definitionDigest: definition.definitionDigest,
    morphogenesisPolicyDigest: definition.morphogenesisPolicyDigest,
    blueprintCatalogDigest: definition.blueprintCatalogDigest,
    proposalGeneratorDigest: definition.proposalGeneratorDigest,
    contextClassDigest: sha(input.contextClassDigest),
    feedbackSchemaDigest: morphogenesisStrategyFeedbackSchemaDigestV4(),
  });
  return freeze({ ...body, bindingDigest: digest("morphogenesis-strategy-evidence-binding-v4", body) });
}

export function createMorphogenesisStrategyIntelligencePolicyV4(
  input: Omit<MorphogenesisStrategyIntelligencePolicyV4, "policyDigest">,
): MorphogenesisStrategyIntelligencePolicyV4 {
  if (input.schemaVersion !== 4) fail("Morphogenesis intelligence policy version is invalid");
  const body = freeze({
    schemaVersion: 4 as const,
    policyId: id(input.policyId), policyVersion: positive(input.policyVersion),
    tenantId: id(input.tenantId), meshId: id(input.meshId),
    policyDomainId: id(input.policyDomainId), catalogDigest: sha(input.catalogDigest),
    morphogenesisPolicyDigest: sha(input.morphogenesisPolicyDigest),
    admittedContextClassDigests: shas(input.admittedContextClassDigests, 1, 256),
    maximumAttestationTtlMs: positive(input.maximumAttestationTtlMs),
  });
  return freeze({ ...body, policyDigest: digest("morphogenesis-strategy-intelligence-policy-v4", body) });
}

export async function createSignedMorphogenesisStrategyOutcomeAttestationV4(input: {
  readonly catalog: MorphogenesisStrategyCatalogV3;
  readonly context: MorphogenesisStrategyContextV3;
  readonly contextClassDigest: PlanningDigestV1;
  readonly selection: MorphogenesisStrategySelectionV3;
  readonly executionBinding: MorphogenesisStrategyExecutionBindingV3;
  readonly outcome: MorphogenesisOperatorOutcomeReceiptV2;
  readonly measurement: MorphogenesisStrategyOutcomeMeasurementV3;
  readonly feedback: MorphogenesisStrategyFeedbackV3;
  readonly localPolicyDigest: PlanningDigestV1;
  readonly feedbackBatchDigest: PlanningDigestV1;
  readonly feedbackDecisionDigest: PlanningDigestV1;
  readonly tenantId: AgentPlatID;
  readonly meshId: AgentPlatID;
  readonly policyDomainId: AgentPlatID;
  readonly missionIntentId: AgentPlatID;
  readonly objectiveId: AgentPlatID;
  readonly issuerPeerId: AgentPlatID;
  readonly issuerInstanceId: AgentPlatID;
  readonly issuerStreamId: AgentPlatID;
  readonly issuerSequence: number;
  readonly predecessorAttestationDigest: PlanningDigestV1 | null;
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly observedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly signing: { readonly keyId: AgentPlatID; readonly privateKey: CryptoKey };
  readonly crypto?: Crypto;
}): Promise<MorphogenesisStrategyOutcomeAttestationV4> {
  const catalog = validateMorphogenesisStrategyCatalogV3(input.catalog);
  const context = validateMorphogenesisStrategyContextV3(input.context);
  const selection = validateMorphogenesisStrategySelectionV3(input.selection);
  const outcome = validateMorphogenesisOperatorOutcomeReceiptV2(input.outcome);
  const measurement = validateMorphogenesisStrategyOutcomeMeasurementV3(input.measurement);
  const strategyId = selection.decision.selectedStrategyId;
  if (!strategyId || !selection.decision.selectedStrategyDigest ||
      selection.context.contextDigest !== context.contextDigest ||
      selection.catalogDigest !== catalog.catalogDigest ||
      input.executionBinding.selectionDigest !== selection.selectionDigest ||
      input.executionBinding.planDigest !== outcome.planDigest ||
      measurement.selectionDigest !== selection.selectionDigest ||
      measurement.executionBindingDigest !== input.executionBinding.bindingDigest ||
      measurement.operatorOutcomeReceiptDigest !== outcome.receiptDigest ||
      input.feedback.selectionDigest !== selection.selectionDigest ||
      input.feedback.measurementDigest !== measurement.measurementDigest ||
      input.feedback.outcomeReceiptDigest !== outcome.receiptDigest)
    fail("Morphogenesis intelligence outcome lineage is invalid");
  const binding = createMorphogenesisStrategyEvidenceBindingV4({
    catalog,
    strategyId,
    contextClassDigest: input.contextClassDigest,
  });
  const cohort = createPeerStrategyEvidenceCohortV1({
    tenantId: input.tenantId, meshId: input.meshId,
    policyDomainId: input.policyDomainId, missionIntentId: input.missionIntentId,
    objectiveId: input.objectiveId, contextClassDigest: binding.contextClassDigest,
  });
  const peerBinding = createPeerStrategyEvidenceBindingV1({
    operation: "plan_decomposition",
    strategyId: binding.strategyId,
    strategyDigest: binding.strategyDigest,
    implementationDigest: binding.proposalGeneratorDigest,
    feedbackSchemaDigest: binding.feedbackSchemaDigest,
  });
  const signedAttestation = await createSignedPeerStrategyOutcomeAttestationV1({
    schemaVersion: 1,
    issuerPeerId: input.issuerPeerId, issuerInstanceId: input.issuerInstanceId,
    issuerStreamId: input.issuerStreamId, issuerSequence: positive(input.issuerSequence),
    predecessorAttestationDigest: nullableSha(input.predecessorAttestationDigest),
    membershipEpoch: positive(input.membershipEpoch),
    membershipConfigurationDigest: sha(input.membershipConfigurationDigest),
    cohort,
    binding: peerBinding,
    catalogDigest: catalog.catalogDigest,
    localPolicyDigest: sha(input.localPolicyDigest),
    selectionDecisionDigest: selection.decision.decisionDigest,
    feedbackBatchDigest: sha(input.feedbackBatchDigest),
    feedbackDecisionDigest: sha(input.feedbackDecisionDigest),
    feedbackSignalDigests: shas([
      binding.bindingDigest,
      context.contextDigest,
      selection.selectionDigest,
      input.executionBinding.bindingDigest,
      outcome.receiptDigest,
      measurement.measurementDigest,
      input.feedback.feedbackDigest,
      input.feedback.localFeedback.feedbackDigest,
    ], 8, 64),
    outcome: input.feedback.localFeedback.outcome,
    metrics: measurement.metrics,
    confidenceBps: measurement.confidenceBps,
    observedAtLogicalMs: nonNegative(input.observedAtLogicalMs),
    expiresAtLogicalMs: positive(input.expiresAtLogicalMs),
    signing: input.signing,
    ...(input.crypto ? { crypto: input.crypto } : {}),
  });
  const body = freeze({
    schemaVersion: 4 as const,
    binding,
    contextDigest: context.contextDigest,
    selectionDigest: selection.selectionDigest,
    executionBindingDigest: input.executionBinding.bindingDigest,
    outcomeReceiptDigest: outcome.receiptDigest,
    measurementDigest: measurement.measurementDigest,
    feedbackDigest: input.feedback.feedbackDigest,
    signedAttestation,
  });
  return freeze({ ...body,
    attestationDigest: digest("morphogenesis-strategy-outcome-attestation-v4", body) });
}

export function validateMorphogenesisStrategyOutcomeAttestationV4(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail("Morphogenesis intelligence attestation is invalid");
  const value = input as MorphogenesisStrategyOutcomeAttestationV4;
  const binding = validateEvidenceBinding(value.binding);
  const signedAttestation = validateSignedPeerStrategyOutcomeAttestationV1(value.signedAttestation);
  const { attestationDigest, ...body } = value;
  if (value.schemaVersion !== 4 ||
      attestationDigest !== digest("morphogenesis-strategy-outcome-attestation-v4", body) ||
      signedAttestation.catalogDigest !== binding.catalogDigest ||
      signedAttestation.binding.strategyId !== binding.strategyId ||
      signedAttestation.binding.strategyDigest !== binding.strategyDigest ||
      signedAttestation.binding.implementationDigest !== binding.proposalGeneratorDigest ||
      signedAttestation.binding.feedbackSchemaDigest !== binding.feedbackSchemaDigest ||
      !signedAttestation.feedbackSignalDigests.includes(binding.bindingDigest) ||
      !signedAttestation.feedbackSignalDigests.includes(value.contextDigest) ||
      !signedAttestation.feedbackSignalDigests.includes(value.selectionDigest) ||
      !signedAttestation.feedbackSignalDigests.includes(value.executionBindingDigest) ||
      !signedAttestation.feedbackSignalDigests.includes(value.outcomeReceiptDigest) ||
      !signedAttestation.feedbackSignalDigests.includes(value.measurementDigest) ||
      !signedAttestation.feedbackSignalDigests.includes(value.feedbackDigest))
    fail("Morphogenesis intelligence attestation binding is invalid");
  return freeze(structuredClone(value));
}

function validateEvidenceBinding(value: MorphogenesisStrategyEvidenceBindingV4) {
  if (!value || value.schemaVersion !== 4) fail("Morphogenesis intelligence binding is invalid");
  const { bindingDigest, ...body } = value;
  if (bindingDigest !== digest("morphogenesis-strategy-evidence-binding-v4", body))
    fail("Morphogenesis intelligence binding digest is invalid");
  return value;
}

export class MorphogenesisStrategyEvidenceExchangeV4 {
  readonly #policy: MorphogenesisStrategyIntelligencePolicyV4;
  readonly #catalog: MorphogenesisStrategyCatalogV3;
  constructor(readonly options: {
    readonly policy: MorphogenesisStrategyIntelligencePolicyV4;
    readonly catalog: MorphogenesisStrategyCatalogV3;
    readonly exchange: PeerStrategyEvidenceExchangePortV1;
  }) {
    this.#policy = validatePolicy(options.policy);
    this.#catalog = validateMorphogenesisStrategyCatalogV3(options.catalog);
    if (!options?.exchange) fail("Morphogenesis strategy evidence exchange is required");
  }
  async admit(input: {
    readonly attestation: MorphogenesisStrategyOutcomeAttestationV4;
    readonly logicalTimeMs: number;
  }): Promise<PeerStrategyEvidenceAdmissionDecisionV1> {
    const value = validateMorphogenesisStrategyOutcomeAttestationV4(input.attestation);
    this.#compatible(value);
    return this.options.exchange.admit({
      attestation: value.signedAttestation,
      logicalTimeMs: input.logicalTimeMs,
    });
  }
  async certify(input: {
    readonly attestation: MorphogenesisStrategyOutcomeAttestationV4;
    readonly logicalTimeMs: number;
  }): Promise<PeerStrategyEvidenceCertificateDecisionV1> {
    const value = validateMorphogenesisStrategyOutcomeAttestationV4(input.attestation);
    this.#compatible(value);
    return this.options.exchange.certify({
      cohort: value.signedAttestation.cohort,
      binding: value.signedAttestation.binding,
      logicalTimeMs: input.logicalTimeMs,
    });
  }
  async admitFromMesh(input: {
    readonly attestation: SignedPeerStrategyOutcomeAttestationV1;
    readonly logicalTimeMs: number;
  }): Promise<PeerStrategyEvidenceAdmissionDecisionV1> {
    const signed = validateSignedPeerStrategyOutcomeAttestationV1(input.attestation);
    const binding = createMorphogenesisStrategyEvidenceBindingV4({
      catalog: this.#catalog,
      strategyId: signed.binding.strategyId,
      contextClassDigest: signed.cohort.contextClassDigest,
    });
    if (signed.catalogDigest !== binding.catalogDigest ||
        signed.binding.strategyDigest !== binding.strategyDigest ||
        signed.binding.implementationDigest !== binding.proposalGeneratorDigest ||
        signed.binding.feedbackSchemaDigest !== binding.feedbackSchemaDigest ||
        !signed.feedbackSignalDigests.includes(binding.bindingDigest) ||
        binding.morphogenesisPolicyDigest !== this.#policy.morphogenesisPolicyDigest ||
        signed.cohort.tenantId !== this.#policy.tenantId ||
        signed.cohort.meshId !== this.#policy.meshId ||
        signed.cohort.policyDomainId !== this.#policy.policyDomainId ||
        !this.#policy.admittedContextClassDigests.includes(binding.contextClassDigest) ||
        signed.expiresAtLogicalMs - signed.observedAtLogicalMs >
          this.#policy.maximumAttestationTtlMs)
      fail("Morphogenesis strategy Mesh evidence is outside the compatible local cohort");
    return this.options.exchange.admit({ attestation: signed,
      logicalTimeMs: input.logicalTimeMs });
  }
  #compatible(value: MorphogenesisStrategyOutcomeAttestationV4) {
    const signed = value.signedAttestation;
    const definition = this.#catalog.strategies.find(({ strategy }) =>
      strategy.strategyId === value.binding.strategyId);
    if (this.#policy.catalogDigest !== this.#catalog.catalogDigest ||
        value.binding.catalogDigest !== this.#catalog.catalogDigest ||
        value.binding.morphogenesisPolicyDigest !== this.#policy.morphogenesisPolicyDigest ||
        !definition || definition.definitionDigest !== value.binding.definitionDigest ||
        signed.cohort.tenantId !== this.#policy.tenantId ||
        signed.cohort.meshId !== this.#policy.meshId ||
        signed.cohort.policyDomainId !== this.#policy.policyDomainId ||
        !this.#policy.admittedContextClassDigests.includes(value.binding.contextClassDigest) ||
        signed.expiresAtLogicalMs - signed.observedAtLogicalMs >
          this.#policy.maximumAttestationTtlMs)
      fail("Morphogenesis strategy evidence is outside the compatible local cohort");
  }
}

export function createMorphogenesisStrategyCollectivePriorSourceV4(input: {
  readonly intelligence: MorphogenesisStrategyEvidenceExchangeV4;
  readonly sourceId: AgentPlatID;
  readonly sourceVersion: number;
  readonly sourceImplementationDigest: PlanningDigestV1;
  readonly maximumInfluenceBps: number;
  readonly resolveContextClassDigest: (
    contextDigest: PlanningDigestV1,
  ) => Promise<PlanningDigestV1 | null>;
}): LocalStrategyCollectivePriorSourceV1 {
  const catalog = input.intelligence.options.catalog;
  return createPeerStrategyEvidenceAdvisoryPriorSourceV1({
    sourceId: input.sourceId,
    sourceVersion: input.sourceVersion,
    sourceImplementationDigest: input.sourceImplementationDigest,
    maximumInfluenceBps: input.maximumInfluenceBps,
    exchange: input.intelligence.options.exchange,
    async cohort(request) {
      const contextClassDigest = await input.resolveContextClassDigest(request.contextDigest);
      if (!contextClassDigest) fail("Morphogenesis collective prior context class is unavailable");
      const policy = input.intelligence.options.policy;
      return createPeerStrategyEvidenceCohortV1({
        tenantId: request.scope.tenantId,
        meshId: request.scope.meshId,
        policyDomainId: request.scope.policyDomainId,
        missionIntentId: request.scope.missionIntentId,
        objectiveId: request.scope.objectiveId,
        contextClassDigest,
      });
    },
    async binding({ strategy, request }) {
      const contextClassDigest = await input.resolveContextClassDigest(request.contextDigest);
      if (!contextClassDigest) fail("Morphogenesis collective prior context class is unavailable");
      const v4 = createMorphogenesisStrategyEvidenceBindingV4({
        catalog,
        strategyId: strategy.strategyId,
        contextClassDigest,
      });
      return createPeerStrategyEvidenceBindingV1({
        operation: "plan_decomposition",
        strategyId: v4.strategyId,
        strategyDigest: v4.strategyDigest,
        implementationDigest: v4.proposalGeneratorDigest,
        feedbackSchemaDigest: v4.feedbackSchemaDigest,
      });
    },
  });
}

function validatePolicy(value: MorphogenesisStrategyIntelligencePolicyV4) { const { policyDigest, ...body } = value; const rebuilt = createMorphogenesisStrategyIntelligencePolicyV4(body); if (policyDigest !== rebuilt.policyDigest) fail("Morphogenesis intelligence policy digest is invalid"); return rebuilt; }
export function validateMorphogenesisStrategyIntelligencePolicyV4(value: MorphogenesisStrategyIntelligencePolicyV4) { return validatePolicy(value); }
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u; const SHA = /^sha256:[0-9a-f]{64}$/u;
function id(value: unknown): AgentPlatID { if (typeof value !== "string" || !ID.test(value)) fail("Morphogenesis intelligence ID is invalid"); return value as AgentPlatID; } function sha(value: unknown): PlanningDigestV1 { if (typeof value !== "string" || !SHA.test(value)) fail("Morphogenesis intelligence digest is invalid"); return value as PlanningDigestV1; } function nullableSha(value: unknown): PlanningDigestV1 | null { return value === null ? null : sha(value); } function positive(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 1) fail("Morphogenesis intelligence positive integer is invalid"); return value as number; } function nonNegative(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 0) fail("Morphogenesis intelligence time is invalid"); return value as number; } function shas(values: readonly unknown[], minimum: number, maximum: number) { const result = [...new Set(values.map(sha))].sort(); if (result.length < minimum || result.length > maximum || result.length !== values.length) fail("Morphogenesis intelligence digest set is invalid"); return freeze(result); } function digest(domain: string, value: unknown): PlanningDigestV1 { return digestPlanningJsonV1(domain as never, value as PlanningJson); } function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const item of Object.values(value as Record<string, unknown>)) freeze(item); } return value; } function fail(message: string): never { throw new TypeError(message); }
