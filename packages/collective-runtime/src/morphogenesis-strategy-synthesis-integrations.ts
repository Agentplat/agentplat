import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";

import type {
  MorphogenesisStrategySynthesisCandidateV5,
  MorphogenesisStrategySynthesisCertificationV5,
  MorphogenesisStrategySynthesisEvaluationV5,
} from "./morphogenesis-strategy-synthesis.js";

export type MorphogenesisSynthesisRestrictionSourceV5 =
  "blueprint_registry" | "trust" | "inference_control";
export type MorphogenesisSynthesisRestrictionDispositionV5 =
  "eligible" | "restricted" | "denied" | "unavailable";

export interface MorphogenesisSynthesisRestrictionAssessmentV5 {
  readonly schemaVersion: 5;
  readonly source: MorphogenesisSynthesisRestrictionSourceV5;
  readonly candidateDigest: PlanningDigestV1;
  readonly evaluationDigest: PlanningDigestV1;
  readonly certificationDigest: PlanningDigestV1;
  readonly disposition: MorphogenesisSynthesisRestrictionDispositionV5;
  readonly policyDigest: PlanningDigestV1;
  readonly sourceId: AgentPlatID;
  readonly sourceVersion: number;
  readonly sourceImplementationDigest: PlanningDigestV1;
  readonly evidenceDigests: readonly PlanningDigestV1[];
  readonly observedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly assessmentDigest: PlanningDigestV1;
}

export interface MorphogenesisSynthesisRestrictionPortV5 {
  readonly source: MorphogenesisSynthesisRestrictionSourceV5;
  assess(input: {
    readonly candidate: MorphogenesisStrategySynthesisCandidateV5;
    readonly evaluation: MorphogenesisStrategySynthesisEvaluationV5;
    readonly certification: MorphogenesisStrategySynthesisCertificationV5;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisSynthesisRestrictionAssessmentV5>;
}

export interface MorphogenesisSynthesisEligibilityDecisionV5 {
  readonly schemaVersion: 5;
  readonly candidateDigest: PlanningDigestV1;
  readonly evaluationDigest: PlanningDigestV1;
  readonly certificationDigest: PlanningDigestV1;
  readonly trustAssessmentDigest: PlanningDigestV1;
  readonly inferenceControlAssessmentDigest: PlanningDigestV1;
  readonly blueprintRegistryAssessmentDigest: PlanningDigestV1;
  readonly disposition: "eligible" | "ineligible";
  readonly reasonCodes: readonly string[];
  readonly evaluatedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly grantsAuthority: false;
  readonly decisionDigest: PlanningDigestV1;
}

export function createMorphogenesisSynthesisRestrictionAssessmentV5(input:
  Omit<MorphogenesisSynthesisRestrictionAssessmentV5, "schemaVersion" | "assessmentDigest">,
): MorphogenesisSynthesisRestrictionAssessmentV5 {
  const body = freeze({ schemaVersion: 5 as const,
    source: one(input.source, SOURCES, "synthesis restriction source"),
    candidateDigest: sha(input.candidateDigest), evaluationDigest: sha(input.evaluationDigest),
    certificationDigest: sha(input.certificationDigest),
    disposition: one(input.disposition, DISPOSITIONS, "synthesis restriction disposition"),
    policyDigest: sha(input.policyDigest), sourceId: id(input.sourceId),
    sourceVersion: positive(input.sourceVersion),
    sourceImplementationDigest: sha(input.sourceImplementationDigest),
    evidenceDigests: shas(input.evidenceDigests, 1, 64),
    observedAtLogicalMs: nonNegative(input.observedAtLogicalMs),
    expiresAtLogicalMs: positive(input.expiresAtLogicalMs) });
  if (body.expiresAtLogicalMs <= body.observedAtLogicalMs)
    fail("synthesis restriction assessment window is invalid");
  return freeze({ ...body,
    assessmentDigest: digest("morphogenesis-synthesis-restriction-assessment-v5", body) });
}

export class MorphogenesisSynthesisEligibilityGateV5 {
  constructor(readonly options: {
    readonly trust: MorphogenesisSynthesisRestrictionPortV5;
    readonly inferenceControl: MorphogenesisSynthesisRestrictionPortV5;
    readonly blueprints: MorphogenesisSynthesisRestrictionPortV5;
  }) {
    if (options?.trust?.source !== "trust" ||
        options?.inferenceControl?.source !== "inference_control" ||
        options?.blueprints?.source !== "blueprint_registry")
      fail("synthesis eligibility sources are invalid");
  }
  async evaluate(input: {
    readonly candidate: MorphogenesisStrategySynthesisCandidateV5;
    readonly evaluation: MorphogenesisStrategySynthesisEvaluationV5;
    readonly certification: MorphogenesisStrategySynthesisCertificationV5;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisSynthesisEligibilityDecisionV5> {
    const [trust, inference, blueprints] = await Promise.all([
      this.options.trust.assess(input), this.options.inferenceControl.assess(input),
      this.options.blueprints.assess(input),
    ]);
    const assessments = [
      validateAssessment(trust, "trust", input),
      validateAssessment(inference, "inference_control", input),
      validateAssessment(blueprints, "blueprint_registry", input),
    ] as const;
    const reasonCodes = assessments.filter(({ disposition }) => disposition !== "eligible")
      .map(({ source, disposition }) => `${source}_${disposition}`).sort();
    const disposition = reasonCodes.length === 0 ? "eligible" : "ineligible";
    const body = freeze({ schemaVersion: 5 as const,
      candidateDigest: input.candidate.candidateDigest,
      evaluationDigest: input.evaluation.evaluationDigest,
      certificationDigest: input.certification.certificationDigest,
      trustAssessmentDigest: assessments[0].assessmentDigest,
      inferenceControlAssessmentDigest: assessments[1].assessmentDigest,
      blueprintRegistryAssessmentDigest: assessments[2].assessmentDigest,
      disposition: disposition as "eligible" | "ineligible", reasonCodes: freeze(reasonCodes),
      evaluatedAtLogicalMs: nonNegative(input.logicalTimeMs),
      expiresAtLogicalMs: Math.min(...assessments.map(({ expiresAtLogicalMs }) =>
        expiresAtLogicalMs)), grantsAuthority: false as const });
    return freeze({ ...body,
      decisionDigest: digest("morphogenesis-synthesis-eligibility-decision-v5", body) });
  }
}

export function validateMorphogenesisSynthesisEligibilityDecisionV5(
  value: MorphogenesisSynthesisEligibilityDecisionV5,
  input: { readonly candidate: MorphogenesisStrategySynthesisCandidateV5;
    readonly evaluation: MorphogenesisStrategySynthesisEvaluationV5;
    readonly certification: MorphogenesisStrategySynthesisCertificationV5;
    readonly logicalTimeMs: number }) {
  const { decisionDigest, ...body } = value;
  if (value.schemaVersion !== 5 || value.candidateDigest !== input.candidate.candidateDigest ||
      value.evaluationDigest !== input.evaluation.evaluationDigest ||
      value.certificationDigest !== input.certification.certificationDigest ||
      value.grantsAuthority !== false || value.expiresAtLogicalMs <= input.logicalTimeMs ||
      decisionDigest !== digest("morphogenesis-synthesis-eligibility-decision-v5", body))
    fail("synthesis eligibility decision is invalid");
  return freeze(structuredClone(value));
}

function validateAssessment(value: MorphogenesisSynthesisRestrictionAssessmentV5,
  source: MorphogenesisSynthesisRestrictionSourceV5,
  input: { readonly candidate: MorphogenesisStrategySynthesisCandidateV5;
    readonly evaluation: MorphogenesisStrategySynthesisEvaluationV5;
    readonly certification: MorphogenesisStrategySynthesisCertificationV5;
    readonly logicalTimeMs: number }) {
  const { assessmentDigest, schemaVersion: _s, ...body } = value;
  const rebuilt = createMorphogenesisSynthesisRestrictionAssessmentV5(body);
  if (value.schemaVersion !== 5 || rebuilt.assessmentDigest !== assessmentDigest ||
      rebuilt.source !== source || rebuilt.candidateDigest !== input.candidate.candidateDigest ||
      rebuilt.evaluationDigest !== input.evaluation.evaluationDigest ||
      rebuilt.certificationDigest !== input.certification.certificationDigest ||
      rebuilt.expiresAtLogicalMs <= input.logicalTimeMs)
    fail("synthesis restriction assessment is invalid");
  return rebuilt;
}

const SOURCES = new Set<MorphogenesisSynthesisRestrictionSourceV5>(
  ["blueprint_registry", "trust", "inference_control"]);
const DISPOSITIONS = new Set<MorphogenesisSynthesisRestrictionDispositionV5>(
  ["eligible", "restricted", "denied", "unavailable"]);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u;
const SHA = /^sha256:[0-9a-f]{64}$/u;
function id(value: unknown): AgentPlatID { if (typeof value !== "string" || !ID.test(value)) fail("synthesis integration ID is invalid"); return value as AgentPlatID; }
function sha(value: unknown): PlanningDigestV1 { if (typeof value !== "string" || !SHA.test(value)) fail("synthesis integration digest is invalid"); return value as PlanningDigestV1; }
function positive(value: unknown) { if (!Number.isSafeInteger(value) || (value as number) < 1) fail("synthesis integration positive integer is invalid"); return value as number; }
function nonNegative(value: unknown) { if (!Number.isSafeInteger(value) || (value as number) < 0) fail("synthesis integration time is invalid"); return value as number; }
function one<T extends string>(value: unknown, allowed: ReadonlySet<T>, label: string): T { if (typeof value !== "string" || !allowed.has(value as T)) fail(`${label} is invalid`); return value as T; }
function shas(values: readonly unknown[], minimum: number, maximum: number) { if (!Array.isArray(values)) fail("synthesis integration digests are invalid"); const result = [...new Set(values.map(sha))].sort(); if (result.length < minimum || result.length > maximum || result.length !== values.length) fail("synthesis integration digest set is invalid"); return freeze(result); }
function digest(domain: string, value: unknown): PlanningDigestV1 { return digestPlanningJsonV1(domain as never, value as PlanningJson); }
function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const item of Object.values(value as Record<string, unknown>)) freeze(item); } return value; }
function fail(message: string): never { throw new TypeError(message); }
