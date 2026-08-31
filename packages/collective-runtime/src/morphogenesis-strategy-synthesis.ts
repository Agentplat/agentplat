import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";

import type { MorphogenesisStrategyReviewRouteV3 } from "./morphogenesis-strategy-governance.js";

export const MORPHOGENESIS_SYNTHESIS_THREATS_V5 = Object.freeze([
  "collusion",
  "memory_leakage",
  "prompt_injection",
  "recursive_spawn",
  "resource_exhaustion",
  "tool_escalation",
] as const);

export type MorphogenesisSynthesisThreatV5 =
  (typeof MORPHOGENESIS_SYNTHESIS_THREATS_V5)[number];
export type MorphogenesisSynthesisLifecycleStatusV5 =
  "draft" | "experimental" | "certified" | "degraded" | "retired";

export interface MorphogenesisStrategySynthesisPolicyV5 {
  readonly schemaVersion: 5;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly parentPolicyDigest: PlanningDigestV1 | null;
  readonly catalogDigest: PlanningDigestV1;
  readonly governancePolicyDigest: PlanningDigestV1;
  readonly admittedSynthesizerImplementationDigests: readonly PlanningDigestV1[];
  readonly requiredThreats: readonly MorphogenesisSynthesisThreatV5[];
  readonly allowedReviewRoutes: readonly MorphogenesisStrategyReviewRouteV3[];
  readonly minimumGapEvidence: number;
  readonly minimumEvaluationConfidenceBps: number;
  readonly minimumSafetyMicros: number;
  readonly maximumCandidateTtlMs: number;
  readonly maximumEvaluationTtlMs: number;
  readonly maximumTokenBudget: number;
  readonly maximumToolCalls: number;
  readonly maximumSpawnDepth: number;
  readonly maximumCandidatesPerGap: number;
  readonly policyDigest: PlanningDigestV1;
}

export interface MorphogenesisStrategyGapV5 {
  readonly schemaVersion: 5;
  readonly gapId: AgentPlatID;
  readonly catalogDigest: PlanningDigestV1;
  readonly governanceStateDigest: PlanningDigestV1;
  readonly contextDigest: PlanningDigestV1;
  readonly baselineStrategyId: AgentPlatID;
  readonly evidenceDigests: readonly PlanningDigestV1[];
  readonly reasonCodes: readonly string[];
  readonly detectedById: AgentPlatID;
  readonly detectorImplementationDigest: PlanningDigestV1;
  readonly detectedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly synthesisRequired: true;
  readonly advisoryOnly: true;
  readonly gapDigest: PlanningDigestV1;
}

/** Declarative references only. No prompt, source, bytecode, credentials,
 * hidden reasoning or unrestricted output can enter this record. */
export interface MorphogenesisSynthesizedStrategyManifestV5 {
  readonly schemaVersion: 5;
  readonly strategyId: AgentPlatID;
  readonly strategyVersion: number;
  readonly strategyImplementationDigest: PlanningDigestV1;
  readonly proposalGeneratorDigest: PlanningDigestV1;
  readonly blueprintCatalogDigest: PlanningDigestV1;
  readonly materialProfileDigest: PlanningDigestV1;
  readonly profileEvolutionDigest: PlanningDigestV1;
  readonly authorityAttenuationDigest: PlanningDigestV1;
  readonly toolSetDigest: PlanningDigestV1;
  readonly memoryScopeDigest: PlanningDigestV1;
  readonly inputContractDigest: PlanningDigestV1;
  readonly outputContractDigest: PlanningDigestV1;
  readonly supportedOperators: readonly AgentPlatID[];
  readonly tokenBudget: number;
  readonly toolCallBudget: number;
  readonly maximumSpawnDepth: number;
  readonly manifestDigest: PlanningDigestV1;
}

export interface MorphogenesisStrategySynthesisCandidateV5 {
  readonly schemaVersion: 5;
  readonly candidateId: AgentPlatID;
  readonly gapDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
  readonly catalogDigest: PlanningDigestV1;
  readonly manifest: MorphogenesisSynthesizedStrategyManifestV5;
  readonly synthesizerId: AgentPlatID;
  readonly synthesizerVersion: number;
  readonly synthesizerImplementationDigest: PlanningDigestV1;
  readonly provenanceDigests: readonly PlanningDigestV1[];
  readonly proposedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly status: "draft";
  readonly inert: true;
  readonly candidateDigest: PlanningDigestV1;
}

export interface MorphogenesisSynthesisThreatAssessmentV5 {
  readonly schemaVersion: 5;
  readonly threat: MorphogenesisSynthesisThreatV5;
  readonly disposition: "passed" | "failed" | "indeterminate";
  readonly evidenceDigests: readonly PlanningDigestV1[];
  readonly assessmentDigest: PlanningDigestV1;
}

export interface MorphogenesisStrategySynthesisEvaluationV5 {
  readonly schemaVersion: 5;
  readonly evaluationId: AgentPlatID;
  readonly candidateDigest: PlanningDigestV1;
  readonly baselineStrategyId: AgentPlatID;
  readonly counterfactualReportDigest: PlanningDigestV1;
  readonly assessorId: AgentPlatID;
  readonly assessorImplementationDigest: PlanningDigestV1;
  readonly threatAssessments: readonly MorphogenesisSynthesisThreatAssessmentV5[];
  readonly safetyMicros: number;
  readonly confidenceBps: number;
  readonly disposition: "eligible" | "unsafe" | "inconclusive";
  readonly evidenceDigests: readonly PlanningDigestV1[];
  readonly evaluatedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly advisoryOnly: true;
  readonly evaluationDigest: PlanningDigestV1;
}

export interface MorphogenesisStrategySynthesisCertificationV5 {
  readonly schemaVersion: 5;
  readonly certificationId: AgentPlatID;
  readonly candidateDigest: PlanningDigestV1;
  readonly evaluationDigest: PlanningDigestV1;
  readonly synthesizerId: AgentPlatID;
  readonly certifierId: AgentPlatID;
  readonly certifierImplementationDigest: PlanningDigestV1;
  readonly disposition: "certified" | "rejected";
  readonly evidenceDigests: readonly PlanningDigestV1[];
  readonly certifiedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly grantsAuthority: false;
  readonly certificationDigest: PlanningDigestV1;
}

export interface MorphogenesisStrategySynthesizerPortV5 {
  readonly synthesizerId: AgentPlatID;
  readonly synthesizerVersion: number;
  readonly synthesizerImplementationDigest: PlanningDigestV1;
  synthesize(input: {
    readonly gap: MorphogenesisStrategyGapV5;
    readonly policy: MorphogenesisStrategySynthesisPolicyV5;
    readonly logicalTimeMs: number;
  }): Promise<Omit<MorphogenesisStrategySynthesisCandidateV5,
    "schemaVersion" | "gapDigest" | "policyDigest" | "catalogDigest" |
    "synthesizerId" | "synthesizerVersion" | "synthesizerImplementationDigest" |
    "status" | "inert" | "candidateDigest">>;
}

export function createMorphogenesisStrategySynthesisPolicyV5(
  input: Omit<MorphogenesisStrategySynthesisPolicyV5, "policyDigest">,
): MorphogenesisStrategySynthesisPolicyV5 {
  if (input.schemaVersion !== 5) fail("Morphogenesis synthesis policy version is invalid");
  const requiredThreats = enums(input.requiredThreats,
    new Set(MORPHOGENESIS_SYNTHESIS_THREATS_V5), "required synthesis threats");
  if (requiredThreats.length !== MORPHOGENESIS_SYNTHESIS_THREATS_V5.length)
    fail("Morphogenesis synthesis policy must require every adversarial threat");
  const body = freeze({
    schemaVersion: 5 as const,
    policyId: id(input.policyId), policyVersion: positive(input.policyVersion),
    parentPolicyDigest: nullableSha(input.parentPolicyDigest),
    catalogDigest: sha(input.catalogDigest),
    governancePolicyDigest: sha(input.governancePolicyDigest),
    admittedSynthesizerImplementationDigests:
      shas(input.admittedSynthesizerImplementationDigests, 1, 32),
    requiredThreats,
    allowedReviewRoutes: enums(input.allowedReviewRoutes,
      new Set<MorphogenesisStrategyReviewRouteV3>(
        ["authorized_agent", "authorized_person", "collective"]),
      "synthesis review routes"),
    minimumGapEvidence: bounded(input.minimumGapEvidence, 1, 256),
    minimumEvaluationConfidenceBps: bps(input.minimumEvaluationConfidenceBps),
    minimumSafetyMicros: micros(input.minimumSafetyMicros),
    maximumCandidateTtlMs: positive(input.maximumCandidateTtlMs),
    maximumEvaluationTtlMs: positive(input.maximumEvaluationTtlMs),
    maximumTokenBudget: positive(input.maximumTokenBudget),
    maximumToolCalls: nonNegative(input.maximumToolCalls),
    maximumSpawnDepth: nonNegative(input.maximumSpawnDepth),
    maximumCandidatesPerGap: bounded(input.maximumCandidatesPerGap, 1, 64),
  });
  return freeze({ ...body,
    policyDigest: digest("morphogenesis-strategy-synthesis-policy-v5", body) });
}

export function createMorphogenesisStrategyGapV5(input:
  Omit<MorphogenesisStrategyGapV5, "schemaVersion" | "synthesisRequired" |
    "advisoryOnly" | "gapDigest"> & { readonly policy: MorphogenesisStrategySynthesisPolicyV5 },
): MorphogenesisStrategyGapV5 {
  const policy = validateMorphogenesisStrategySynthesisPolicyV5(input.policy);
  const evidenceDigests = shas(input.evidenceDigests, policy.minimumGapEvidence, 256);
  const body = freeze({
    schemaVersion: 5 as const, gapId: id(input.gapId),
    catalogDigest: sha(input.catalogDigest),
    governanceStateDigest: sha(input.governanceStateDigest),
    contextDigest: sha(input.contextDigest), baselineStrategyId: id(input.baselineStrategyId),
    evidenceDigests, reasonCodes: ids(input.reasonCodes, 1, 32),
    detectedById: id(input.detectedById),
    detectorImplementationDigest: sha(input.detectorImplementationDigest),
    detectedAtLogicalMs: nonNegative(input.detectedAtLogicalMs),
    expiresAtLogicalMs: positive(input.expiresAtLogicalMs),
    synthesisRequired: true as const, advisoryOnly: true as const,
  });
  if (body.catalogDigest !== policy.catalogDigest ||
      body.expiresAtLogicalMs <= body.detectedAtLogicalMs ||
      body.expiresAtLogicalMs - body.detectedAtLogicalMs > policy.maximumCandidateTtlMs)
    fail("Morphogenesis synthesis gap binding or window is invalid");
  return freeze({ ...body, gapDigest: digest("morphogenesis-strategy-gap-v5", body) });
}

export function createMorphogenesisSynthesizedStrategyManifestV5(input:
  Omit<MorphogenesisSynthesizedStrategyManifestV5, "schemaVersion" | "manifestDigest">,
): MorphogenesisSynthesizedStrategyManifestV5 {
  const body = freeze({
    schemaVersion: 5 as const, strategyId: id(input.strategyId),
    strategyVersion: positive(input.strategyVersion),
    strategyImplementationDigest: sha(input.strategyImplementationDigest),
    proposalGeneratorDigest: sha(input.proposalGeneratorDigest),
    blueprintCatalogDigest: sha(input.blueprintCatalogDigest),
    materialProfileDigest: sha(input.materialProfileDigest),
    profileEvolutionDigest: sha(input.profileEvolutionDigest),
    authorityAttenuationDigest: sha(input.authorityAttenuationDigest),
    toolSetDigest: sha(input.toolSetDigest), memoryScopeDigest: sha(input.memoryScopeDigest),
    inputContractDigest: sha(input.inputContractDigest),
    outputContractDigest: sha(input.outputContractDigest),
    supportedOperators: ids(input.supportedOperators, 1, 32),
    tokenBudget: positive(input.tokenBudget), toolCallBudget: nonNegative(input.toolCallBudget),
    maximumSpawnDepth: nonNegative(input.maximumSpawnDepth),
  });
  return freeze({ ...body,
    manifestDigest: digest("morphogenesis-synthesized-strategy-manifest-v5", body) });
}

export class MorphogenesisStrategySynthesisRuntimeV5 {
  readonly #policy: MorphogenesisStrategySynthesisPolicyV5;
  constructor(readonly options: {
    readonly policy: MorphogenesisStrategySynthesisPolicyV5;
    readonly synthesizer: MorphogenesisStrategySynthesizerPortV5;
  }) {
    this.#policy = validateMorphogenesisStrategySynthesisPolicyV5(options.policy);
    if (!options?.synthesizer || typeof options.synthesizer.synthesize !== "function")
      fail("Morphogenesis synthesizer is required");
    if (!this.#policy.admittedSynthesizerImplementationDigests.includes(
      options.synthesizer.synthesizerImplementationDigest))
      fail("Morphogenesis synthesizer implementation is not admitted");
  }
  async synthesize(input: { readonly gap: MorphogenesisStrategyGapV5;
    readonly logicalTimeMs: number }): Promise<MorphogenesisStrategySynthesisCandidateV5> {
    const gap = validateMorphogenesisStrategyGapV5(input.gap, this.#policy);
    if (gap.expiresAtLogicalMs <= input.logicalTimeMs)
      fail("Morphogenesis synthesis gap is expired");
    const draft = await this.options.synthesizer.synthesize({
      gap, policy: this.#policy, logicalTimeMs: input.logicalTimeMs,
    });
    return createCandidate(draft, gap, this.#policy, this.options.synthesizer);
  }
}

export function createMorphogenesisSynthesisThreatAssessmentV5(input:
  Omit<MorphogenesisSynthesisThreatAssessmentV5, "schemaVersion" | "assessmentDigest">,
): MorphogenesisSynthesisThreatAssessmentV5 {
  const body = freeze({ schemaVersion: 5 as const,
    threat: one(input.threat, new Set(MORPHOGENESIS_SYNTHESIS_THREATS_V5), "synthesis threat"),
    disposition: one(input.disposition,
      new Set<MorphogenesisSynthesisThreatAssessmentV5["disposition"]>(
        ["passed", "failed", "indeterminate"]),
      "threat disposition"), evidenceDigests: shas(input.evidenceDigests, 1, 64) });
  return freeze({ ...body,
    assessmentDigest: digest("morphogenesis-synthesis-threat-assessment-v5", body) });
}

export function createMorphogenesisStrategySynthesisEvaluationV5(input:
  Omit<MorphogenesisStrategySynthesisEvaluationV5, "schemaVersion" | "disposition" |
    "advisoryOnly" | "evaluationDigest"> & {
      readonly policy: MorphogenesisStrategySynthesisPolicyV5;
      readonly candidate: MorphogenesisStrategySynthesisCandidateV5;
    },
): MorphogenesisStrategySynthesisEvaluationV5 {
  const policy = validateMorphogenesisStrategySynthesisPolicyV5(input.policy);
  const candidate = validateMorphogenesisStrategySynthesisCandidateV5(input.candidate, policy);
  const assessments = input.threatAssessments.map(createMorphogenesisSynthesisThreatAssessmentV5);
  const threats = assessments.map(({ threat }) => threat).sort();
  if (!same(threats, [...policy.requiredThreats].sort()))
    fail("Morphogenesis synthesis threat coverage is incomplete");
  const unsafe = assessments.some(({ disposition }) => disposition === "failed") ||
    input.safetyMicros < policy.minimumSafetyMicros;
  const inconclusive = assessments.some(({ disposition }) => disposition === "indeterminate") ||
    input.confidenceBps < policy.minimumEvaluationConfidenceBps;
  const body = freeze({ schemaVersion: 5 as const, evaluationId: id(input.evaluationId),
    candidateDigest: candidate.candidateDigest, baselineStrategyId: id(input.baselineStrategyId),
    counterfactualReportDigest: sha(input.counterfactualReportDigest),
    assessorId: id(input.assessorId),
    assessorImplementationDigest: sha(input.assessorImplementationDigest),
    threatAssessments: freeze([...assessments].sort((a, b) => a.threat.localeCompare(b.threat))),
    safetyMicros: micros(input.safetyMicros), confidenceBps: bps(input.confidenceBps),
    disposition: (unsafe ? "unsafe" : inconclusive ? "inconclusive" : "eligible") as
      MorphogenesisStrategySynthesisEvaluationV5["disposition"],
    evidenceDigests: shas(input.evidenceDigests, 1, 256),
    evaluatedAtLogicalMs: nonNegative(input.evaluatedAtLogicalMs),
    expiresAtLogicalMs: positive(input.expiresAtLogicalMs), advisoryOnly: true as const });
  if (body.expiresAtLogicalMs <= body.evaluatedAtLogicalMs ||
      body.expiresAtLogicalMs - body.evaluatedAtLogicalMs > policy.maximumEvaluationTtlMs)
    fail("Morphogenesis synthesis evaluation window is invalid");
  return freeze({ ...body,
    evaluationDigest: digest("morphogenesis-strategy-synthesis-evaluation-v5", body) });
}

export function createMorphogenesisStrategySynthesisCertificationV5(input:
  Omit<MorphogenesisStrategySynthesisCertificationV5, "schemaVersion" |
    "grantsAuthority" | "certificationDigest"> & {
      readonly candidate: MorphogenesisStrategySynthesisCandidateV5;
      readonly evaluation: MorphogenesisStrategySynthesisEvaluationV5;
    },
): MorphogenesisStrategySynthesisCertificationV5 {
  const candidate = input.candidate;
  const evaluation = input.evaluation;
  if (candidate.candidateDigest !== evaluation.candidateDigest ||
      input.synthesizerId !== candidate.synthesizerId ||
      input.certifierId === input.synthesizerId ||
      (input.disposition === "certified" && evaluation.disposition !== "eligible"))
    fail("Morphogenesis synthesis certification independence or evidence is invalid");
  const body = freeze({ schemaVersion: 5 as const,
    certificationId: id(input.certificationId), candidateDigest: candidate.candidateDigest,
    evaluationDigest: evaluation.evaluationDigest, synthesizerId: id(input.synthesizerId),
    certifierId: id(input.certifierId),
    certifierImplementationDigest: sha(input.certifierImplementationDigest),
    disposition: one(input.disposition,
      new Set<MorphogenesisStrategySynthesisCertificationV5["disposition"]>(
        ["certified", "rejected"]),
      "synthesis certification disposition"),
    evidenceDigests: shas(input.evidenceDigests, 1, 256),
    certifiedAtLogicalMs: nonNegative(input.certifiedAtLogicalMs),
    expiresAtLogicalMs: positive(input.expiresAtLogicalMs), grantsAuthority: false as const });
  if (body.expiresAtLogicalMs <= body.certifiedAtLogicalMs ||
      body.expiresAtLogicalMs > evaluation.expiresAtLogicalMs)
    fail("Morphogenesis synthesis certification window is invalid");
  return freeze({ ...body,
    certificationDigest: digest("morphogenesis-strategy-synthesis-certification-v5", body) });
}

export function validateMorphogenesisStrategySynthesisPolicyV5(value: MorphogenesisStrategySynthesisPolicyV5) {
  const { policyDigest, ...body } = exact(value, POLICY_KEYS, "Morphogenesis synthesis policy") as unknown as MorphogenesisStrategySynthesisPolicyV5;
  const rebuilt = createMorphogenesisStrategySynthesisPolicyV5(body);
  if (policyDigest !== rebuilt.policyDigest) fail("Morphogenesis synthesis policy digest is invalid");
  return rebuilt;
}
export function validateMorphogenesisStrategyGapV5(value: MorphogenesisStrategyGapV5,
  policy: MorphogenesisStrategySynthesisPolicyV5) {
  const { gapDigest, schemaVersion: _s, synthesisRequired: _r, advisoryOnly: _a, ...body } =
    exact(value, GAP_KEYS, "Morphogenesis synthesis gap") as unknown as MorphogenesisStrategyGapV5;
  const rebuilt = createMorphogenesisStrategyGapV5({ ...body, policy });
  if (gapDigest !== rebuilt.gapDigest) fail("Morphogenesis synthesis gap digest is invalid");
  return rebuilt;
}
export function validateMorphogenesisStrategySynthesisCandidateV5(
  value: MorphogenesisStrategySynthesisCandidateV5,
  policy: MorphogenesisStrategySynthesisPolicyV5) {
  const record = exact(value, CANDIDATE_KEYS, "Morphogenesis synthesis candidate") as
    unknown as MorphogenesisStrategySynthesisCandidateV5;
  const manifest = validateManifest(record.manifest);
  const { candidateDigest, schemaVersion: _s, status: _st, inert: _i, ...body } = record;
  const rebuilt = candidateBody(body, manifest);
  if (record.schemaVersion !== 5 || record.status !== "draft" || record.inert !== true ||
      record.policyDigest !== policy.policyDigest || record.catalogDigest !== policy.catalogDigest ||
      candidateDigest !== digest("morphogenesis-strategy-synthesis-candidate-v5", rebuilt))
    fail("Morphogenesis synthesis candidate is invalid");
  assertManifestBudget(manifest, policy);
  return freeze(structuredClone(record));
}
export function validateMorphogenesisStrategySynthesisEvaluationV5(
  value: MorphogenesisStrategySynthesisEvaluationV5,
  candidate: MorphogenesisStrategySynthesisCandidateV5,
  policy: MorphogenesisStrategySynthesisPolicyV5) {
  const record = exact(value, EVALUATION_KEYS, "Morphogenesis synthesis evaluation") as
    unknown as MorphogenesisStrategySynthesisEvaluationV5;
  const { schemaVersion: _s, disposition: _d, advisoryOnly: _a, evaluationDigest, ...body } = record;
  const rebuilt = createMorphogenesisStrategySynthesisEvaluationV5({
    ...body, candidate, policy,
  });
  if (evaluationDigest !== rebuilt.evaluationDigest || record.disposition !== rebuilt.disposition ||
      record.advisoryOnly !== true)
    fail("Morphogenesis synthesis evaluation is invalid");
  return rebuilt;
}
export function validateMorphogenesisStrategySynthesisCertificationV5(
  value: MorphogenesisStrategySynthesisCertificationV5,
  candidate: MorphogenesisStrategySynthesisCandidateV5,
  evaluation: MorphogenesisStrategySynthesisEvaluationV5) {
  const record = exact(value, CERTIFICATION_KEYS,
    "Morphogenesis synthesis certification") as unknown as
    MorphogenesisStrategySynthesisCertificationV5;
  const { schemaVersion: _s, grantsAuthority: _g, certificationDigest, ...body } = record;
  const rebuilt = createMorphogenesisStrategySynthesisCertificationV5({
    ...body, candidate, evaluation,
  });
  if (certificationDigest !== rebuilt.certificationDigest || record.grantsAuthority !== false)
    fail("Morphogenesis synthesis certification is invalid");
  return rebuilt;
}

function createCandidate(draft: Awaited<ReturnType<MorphogenesisStrategySynthesizerPortV5["synthesize"]>>,
  gap: MorphogenesisStrategyGapV5, policy: MorphogenesisStrategySynthesisPolicyV5,
  synthesizer: MorphogenesisStrategySynthesizerPortV5) {
  const manifest = validateManifest(draft.manifest);
  assertManifestBudget(manifest, policy);
  const body = candidateBody({ ...draft, gapDigest: gap.gapDigest,
    policyDigest: policy.policyDigest, catalogDigest: gap.catalogDigest,
    synthesizerId: synthesizer.synthesizerId,
    synthesizerVersion: synthesizer.synthesizerVersion,
    synthesizerImplementationDigest: synthesizer.synthesizerImplementationDigest }, manifest);
  if (body.expiresAtLogicalMs <= body.proposedAtLogicalMs ||
      body.expiresAtLogicalMs > gap.expiresAtLogicalMs)
    fail("Morphogenesis synthesis candidate window is invalid");
  return freeze({ ...body,
    candidateDigest: digest("morphogenesis-strategy-synthesis-candidate-v5", body) });
}
function candidateBody(input: Omit<MorphogenesisStrategySynthesisCandidateV5,
  "schemaVersion" | "status" | "inert" | "candidateDigest">,
  manifest: MorphogenesisSynthesizedStrategyManifestV5) {
  return freeze({ schemaVersion: 5 as const, candidateId: id(input.candidateId),
    gapDigest: sha(input.gapDigest), policyDigest: sha(input.policyDigest),
    catalogDigest: sha(input.catalogDigest), manifest,
    synthesizerId: id(input.synthesizerId), synthesizerVersion: positive(input.synthesizerVersion),
    synthesizerImplementationDigest: sha(input.synthesizerImplementationDigest),
    provenanceDigests: shas(input.provenanceDigests, 1, 256),
    proposedAtLogicalMs: nonNegative(input.proposedAtLogicalMs),
    expiresAtLogicalMs: positive(input.expiresAtLogicalMs), status: "draft" as const,
    inert: true as const });
}
function validateManifest(value: MorphogenesisSynthesizedStrategyManifestV5) {
  const record = exact(value, MANIFEST_KEYS, "Morphogenesis synthesized strategy manifest") as
    unknown as MorphogenesisSynthesizedStrategyManifestV5;
  const { schemaVersion: _s, manifestDigest, ...body } = record;
  const rebuilt = createMorphogenesisSynthesizedStrategyManifestV5(body);
  if (manifestDigest !== rebuilt.manifestDigest) fail("Morphogenesis synthesis manifest digest is invalid");
  return rebuilt;
}
function assertManifestBudget(value: MorphogenesisSynthesizedStrategyManifestV5,
  policy: MorphogenesisStrategySynthesisPolicyV5) {
  if (value.tokenBudget > policy.maximumTokenBudget ||
      value.toolCallBudget > policy.maximumToolCalls ||
      value.maximumSpawnDepth > policy.maximumSpawnDepth)
    fail("Morphogenesis synthesized strategy exceeds its resource ceiling");
}

const POLICY_KEYS = ["admittedSynthesizerImplementationDigests", "allowedReviewRoutes",
  "catalogDigest", "governancePolicyDigest", "maximumCandidateTtlMs",
  "maximumCandidatesPerGap", "maximumEvaluationTtlMs", "maximumSpawnDepth",
  "maximumTokenBudget", "maximumToolCalls", "minimumEvaluationConfidenceBps",
  "minimumGapEvidence", "minimumSafetyMicros", "parentPolicyDigest", "policyDigest",
  "policyId", "policyVersion", "requiredThreats", "schemaVersion"] as const;
const GAP_KEYS = ["advisoryOnly", "baselineStrategyId", "catalogDigest", "contextDigest",
  "detectedAtLogicalMs", "detectedById", "detectorImplementationDigest", "evidenceDigests",
  "expiresAtLogicalMs", "gapDigest", "gapId", "governanceStateDigest", "reasonCodes",
  "schemaVersion", "synthesisRequired"] as const;
const MANIFEST_KEYS = ["authorityAttenuationDigest", "blueprintCatalogDigest",
  "inputContractDigest", "manifestDigest", "materialProfileDigest", "maximumSpawnDepth",
  "memoryScopeDigest", "outputContractDigest", "profileEvolutionDigest",
  "proposalGeneratorDigest", "schemaVersion", "strategyId", "strategyImplementationDigest",
  "strategyVersion", "supportedOperators", "tokenBudget", "toolCallBudget", "toolSetDigest"] as const;
const CANDIDATE_KEYS = ["candidateDigest", "candidateId", "catalogDigest", "expiresAtLogicalMs",
  "gapDigest", "inert", "manifest", "policyDigest", "proposedAtLogicalMs",
  "provenanceDigests", "schemaVersion", "status", "synthesizerId",
  "synthesizerImplementationDigest", "synthesizerVersion"] as const;
const EVALUATION_KEYS = ["advisoryOnly", "assessorId", "assessorImplementationDigest",
  "baselineStrategyId", "candidateDigest", "confidenceBps", "counterfactualReportDigest",
  "disposition", "evaluatedAtLogicalMs", "evaluationDigest", "evaluationId", "evidenceDigests",
  "expiresAtLogicalMs", "safetyMicros", "schemaVersion", "threatAssessments"] as const;
const CERTIFICATION_KEYS = ["candidateDigest", "certificationDigest", "certificationId",
  "certifiedAtLogicalMs", "certifierId", "certifierImplementationDigest", "disposition",
  "evaluationDigest", "evidenceDigests", "expiresAtLogicalMs", "grantsAuthority",
  "schemaVersion", "synthesizerId"] as const;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u;
const SHA = /^sha256:[0-9a-f]{64}$/u;
function exact(value: unknown, keys: readonly string[], label: string) { if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || !same(Object.keys(value).sort(), [...keys].sort())) fail(`${label} shape is invalid`); return value as Record<string, unknown>; }
function id(value: unknown): AgentPlatID { if (typeof value !== "string" || !ID.test(value)) fail("Morphogenesis synthesis ID is invalid"); return value as AgentPlatID; }
function sha(value: unknown): PlanningDigestV1 { if (typeof value !== "string" || !SHA.test(value)) fail("Morphogenesis synthesis digest is invalid"); return value as PlanningDigestV1; }
function nullableSha(value: unknown) { return value === null ? null : sha(value); }
function positive(value: unknown) { if (!Number.isSafeInteger(value) || (value as number) < 1) fail("Morphogenesis synthesis positive integer is invalid"); return value as number; }
function nonNegative(value: unknown) { if (!Number.isSafeInteger(value) || (value as number) < 0) fail("Morphogenesis synthesis non-negative integer is invalid"); return value as number; }
function bounded(value: unknown, minimum: number, maximum: number) { const result = nonNegative(value); if (result < minimum || result > maximum) fail("Morphogenesis synthesis bounded integer is invalid"); return result; }
function bps(value: unknown) { return bounded(value, 0, 10_000); }
function micros(value: unknown) { return bounded(value, 0, 1_000_000); }
function ids(values: readonly unknown[], minimum: number, maximum: number) { if (!Array.isArray(values)) fail("Morphogenesis synthesis IDs are invalid"); const result = [...new Set(values.map(id))].sort(); if (result.length < minimum || result.length > maximum || result.length !== values.length) fail("Morphogenesis synthesis ID set is invalid"); return freeze(result); }
function shas(values: readonly unknown[], minimum: number, maximum: number) { if (!Array.isArray(values)) fail("Morphogenesis synthesis digests are invalid"); const result = [...new Set(values.map(sha))].sort(); if (result.length < minimum || result.length > maximum || result.length !== values.length) fail("Morphogenesis synthesis digest set is invalid"); return freeze(result); }
function one<T extends string>(value: unknown, allowed: ReadonlySet<T>, label: string): T { if (typeof value !== "string" || !allowed.has(value as T)) fail(`${label} is invalid`); return value as T; }
function enums<T extends string>(values: readonly unknown[], allowed: ReadonlySet<T>, label: string) { if (!Array.isArray(values)) fail(`${label} are invalid`); const result = [...new Set(values.map((value) => one(value, allowed, label)))].sort(); if (result.length < 1 || result.length !== values.length) fail(`${label} are invalid`); return freeze(result); }
function same(left: readonly unknown[], right: readonly unknown[]) { return left.length === right.length && left.every((value, index) => value === right[index]); }
function digest(domain: string, value: unknown): PlanningDigestV1 { return digestPlanningJsonV1(domain as never, value as PlanningJson); }
function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const item of Object.values(value as Record<string, unknown>)) freeze(item); } return value; }
function fail(message: string): never { throw new TypeError(message); }
