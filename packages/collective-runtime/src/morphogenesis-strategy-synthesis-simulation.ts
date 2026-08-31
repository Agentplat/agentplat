import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";

import {
  createMorphogenesisStrategySynthesisEvaluationV5,
  createMorphogenesisSynthesisThreatAssessmentV5,
  validateMorphogenesisStrategySynthesisCandidateV5,
  validateMorphogenesisStrategySynthesisPolicyV5,
  type MorphogenesisStrategySynthesisCandidateV5,
  type MorphogenesisStrategySynthesisEvaluationV5,
  type MorphogenesisStrategySynthesisPolicyV5,
  type MorphogenesisSynthesisThreatAssessmentV5,
} from "./morphogenesis-strategy-synthesis.js";

export interface MorphogenesisSynthesisSimulationScenarioV5 {
  readonly schemaVersion: 5;
  readonly scenarioId: AgentPlatID;
  readonly candidateDigest: PlanningDigestV1;
  readonly baselineStrategyId: AgentPlatID;
  readonly baselineDefinitionDigest: PlanningDigestV1;
  readonly simulatorId: AgentPlatID;
  readonly simulatorVersion: number;
  readonly simulatorImplementationDigest: PlanningDigestV1;
  readonly environmentDigest: PlanningDigestV1;
  readonly seedDigest: PlanningDigestV1;
  readonly interactionBudget: number;
  readonly proposedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly scenarioDigest: PlanningDigestV1;
}

export interface MorphogenesisSynthesisSimulationResultV5 {
  readonly scenarioDigest: PlanningDigestV1;
  readonly candidateDigest: PlanningDigestV1;
  readonly simulatorImplementationDigest: PlanningDigestV1;
  readonly seedDigest: PlanningDigestV1;
  readonly threatAssessments: readonly MorphogenesisSynthesisThreatAssessmentV5[];
  readonly safetyMicros: number;
  readonly confidenceBps: number;
  readonly evidenceDigests: readonly PlanningDigestV1[];
  readonly interactionUnits: number;
  readonly completedAtLogicalMs: number;
}

export interface MorphogenesisSynthesisSimulationPortV5 {
  readonly simulatorId: AgentPlatID;
  readonly simulatorVersion: number;
  readonly simulatorImplementationDigest: PlanningDigestV1;
  evaluate(input: { readonly scenario: MorphogenesisSynthesisSimulationScenarioV5;
    readonly candidate: MorphogenesisStrategySynthesisCandidateV5 }):
    Promise<MorphogenesisSynthesisSimulationResultV5>;
}

export interface MorphogenesisSynthesisSimulationReportV5 {
  readonly schemaVersion: 5;
  readonly reportId: AgentPlatID;
  readonly scenarioDigest: PlanningDigestV1;
  readonly candidateDigest: PlanningDigestV1;
  readonly baselineStrategyId: AgentPlatID;
  readonly simulatorImplementationDigest: PlanningDigestV1;
  readonly seedDigest: PlanningDigestV1;
  readonly threatAssessments: readonly MorphogenesisSynthesisThreatAssessmentV5[];
  readonly safetyMicros: number;
  readonly confidenceBps: number;
  readonly evidenceDigests: readonly PlanningDigestV1[];
  readonly interactionUnits: number;
  readonly evaluatedAtLogicalMs: number;
  readonly advisoryOnly: true;
  readonly reportDigest: PlanningDigestV1;
}

export interface MorphogenesisSynthesisSimulationStoreV5 {
  load(reportId: AgentPlatID): Promise<MorphogenesisSynthesisSimulationReportV5 | null>;
  save(report: MorphogenesisSynthesisSimulationReportV5): Promise<boolean>;
}

export function createMorphogenesisSynthesisSimulationScenarioV5(input:
  Omit<MorphogenesisSynthesisSimulationScenarioV5, "schemaVersion" | "candidateDigest" |
    "scenarioDigest"> & { readonly candidate: MorphogenesisStrategySynthesisCandidateV5;
      readonly policy: MorphogenesisStrategySynthesisPolicyV5 }) {
  const candidate = validateMorphogenesisStrategySynthesisCandidateV5(input.candidate, input.policy);
  const body = freeze({ schemaVersion: 5 as const, scenarioId: id(input.scenarioId),
    candidateDigest: candidate.candidateDigest, baselineStrategyId: id(input.baselineStrategyId),
    baselineDefinitionDigest: sha(input.baselineDefinitionDigest),
    simulatorId: id(input.simulatorId), simulatorVersion: positive(input.simulatorVersion),
    simulatorImplementationDigest: sha(input.simulatorImplementationDigest),
    environmentDigest: sha(input.environmentDigest), seedDigest: sha(input.seedDigest),
    interactionBudget: positive(input.interactionBudget),
    proposedAtLogicalMs: nonNegative(input.proposedAtLogicalMs),
    expiresAtLogicalMs: positive(input.expiresAtLogicalMs) });
  if (body.expiresAtLogicalMs <= body.proposedAtLogicalMs ||
      body.expiresAtLogicalMs > candidate.expiresAtLogicalMs)
    fail("synthesis simulation window is invalid");
  return freeze({ ...body,
    scenarioDigest: digest("morphogenesis-synthesis-simulation-scenario-v5", body) });
}

export class InMemoryMorphogenesisSynthesisSimulationStoreV5
  implements MorphogenesisSynthesisSimulationStoreV5 {
  readonly #reports = new Map<string, MorphogenesisSynthesisSimulationReportV5>();
  async load(reportId: AgentPlatID) { return this.#reports.get(reportId) ?? null; }
  async save(report: MorphogenesisSynthesisSimulationReportV5) {
    const current = this.#reports.get(report.reportId);
    if (current) return current.reportDigest === report.reportDigest;
    this.#reports.set(report.reportId, freeze(structuredClone(report))); return true;
  }
}

export class MorphogenesisSynthesisSimulationRuntimeV5 {
  readonly #policy: MorphogenesisStrategySynthesisPolicyV5;
  constructor(readonly options: { readonly policy: MorphogenesisStrategySynthesisPolicyV5;
    readonly simulator: MorphogenesisSynthesisSimulationPortV5;
    readonly store: MorphogenesisSynthesisSimulationStoreV5 }) {
    this.#policy = validateMorphogenesisStrategySynthesisPolicyV5(options.policy);
    if (!options?.simulator || !options?.store) fail("synthesis simulation ports are required");
  }
  async evaluate(input: { readonly reportId: AgentPlatID;
    readonly evaluationId: AgentPlatID;
    readonly scenario: MorphogenesisSynthesisSimulationScenarioV5;
    readonly candidate: MorphogenesisStrategySynthesisCandidateV5;
    readonly assessorId: AgentPlatID;
    readonly assessorImplementationDigest: PlanningDigestV1;
    readonly expiresAtLogicalMs: number;
    readonly logicalTimeMs: number }): Promise<{ readonly report: MorphogenesisSynthesisSimulationReportV5;
      readonly evaluation: MorphogenesisStrategySynthesisEvaluationV5 }> {
    const candidate = validateMorphogenesisStrategySynthesisCandidateV5(input.candidate, this.#policy);
    const scenario = validateScenario(input.scenario, candidate, this.#policy);
    const retained = await this.options.store.load(input.reportId);
    if (retained) {
      const report = validateMorphogenesisSynthesisSimulationReportV5(retained);
      if (report.scenarioDigest !== scenario.scenarioDigest)
        fail("synthesis simulation report replay diverged");
      return { report, evaluation: evaluationFrom(report, input, candidate, this.#policy) };
    }
    if (scenario.expiresAtLogicalMs <= input.logicalTimeMs ||
        this.options.simulator.simulatorId !== scenario.simulatorId ||
        this.options.simulator.simulatorVersion !== scenario.simulatorVersion ||
        this.options.simulator.simulatorImplementationDigest !==
          scenario.simulatorImplementationDigest)
      fail("synthesis simulator binding or time is invalid");
    const result = await this.options.simulator.evaluate({ scenario, candidate });
    const report = createReport(input.reportId, scenario, result);
    if (report.interactionUnits > scenario.interactionBudget)
      fail("synthesis simulation exceeded its interaction budget");
    if (!(await this.options.store.save(report)))
      fail("synthesis simulation report identity conflict");
    return { report, evaluation: evaluationFrom(report, input, candidate, this.#policy) };
  }
}

export function validateMorphogenesisSynthesisSimulationReportV5(
  value: MorphogenesisSynthesisSimulationReportV5) {
  const { reportDigest, ...body } = value;
  if (value.schemaVersion !== 5 || value.advisoryOnly !== true ||
      reportDigest !== digest("morphogenesis-synthesis-simulation-report-v5", body))
    fail("synthesis simulation report is invalid");
  return freeze(structuredClone(value));
}

function createReport(reportId: AgentPlatID, scenario: MorphogenesisSynthesisSimulationScenarioV5,
  result: MorphogenesisSynthesisSimulationResultV5) {
  if (result.scenarioDigest !== scenario.scenarioDigest ||
      result.candidateDigest !== scenario.candidateDigest ||
      result.simulatorImplementationDigest !== scenario.simulatorImplementationDigest ||
      result.seedDigest !== scenario.seedDigest)
    fail("synthesis simulation result binding is invalid");
  const body = freeze({ schemaVersion: 5 as const, reportId: id(reportId),
    scenarioDigest: scenario.scenarioDigest, candidateDigest: scenario.candidateDigest,
    baselineStrategyId: scenario.baselineStrategyId,
    simulatorImplementationDigest: scenario.simulatorImplementationDigest,
    seedDigest: scenario.seedDigest,
    threatAssessments: freeze(result.threatAssessments.map(
      createMorphogenesisSynthesisThreatAssessmentV5).sort((a, b) =>
      a.threat.localeCompare(b.threat))),
    safetyMicros: micros(result.safetyMicros), confidenceBps: bps(result.confidenceBps),
    evidenceDigests: shas(result.evidenceDigests, 1, 256),
    interactionUnits: nonNegative(result.interactionUnits),
    evaluatedAtLogicalMs: nonNegative(result.completedAtLogicalMs), advisoryOnly: true as const });
  return freeze({ ...body,
    reportDigest: digest("morphogenesis-synthesis-simulation-report-v5", body) });
}
function evaluationFrom(report: MorphogenesisSynthesisSimulationReportV5,
  input: { readonly evaluationId: AgentPlatID; readonly assessorId: AgentPlatID;
    readonly assessorImplementationDigest: PlanningDigestV1;
    readonly expiresAtLogicalMs: number },
  candidate: MorphogenesisStrategySynthesisCandidateV5,
  policy: MorphogenesisStrategySynthesisPolicyV5) {
  return createMorphogenesisStrategySynthesisEvaluationV5({
    evaluationId: input.evaluationId, candidate,
    candidateDigest: candidate.candidateDigest,
    baselineStrategyId: report.baselineStrategyId,
    counterfactualReportDigest: report.reportDigest, assessorId: input.assessorId,
    assessorImplementationDigest: input.assessorImplementationDigest,
    threatAssessments: report.threatAssessments, safetyMicros: report.safetyMicros,
    confidenceBps: report.confidenceBps, evidenceDigests: [report.reportDigest,
      ...report.evidenceDigests], evaluatedAtLogicalMs: report.evaluatedAtLogicalMs,
    expiresAtLogicalMs: input.expiresAtLogicalMs, policy,
  });
}
function validateScenario(value: MorphogenesisSynthesisSimulationScenarioV5,
  candidate: MorphogenesisStrategySynthesisCandidateV5,
  policy: MorphogenesisStrategySynthesisPolicyV5) {
  const { schemaVersion: _s, scenarioDigest, candidateDigest: _c, ...body } = value;
  const rebuilt = createMorphogenesisSynthesisSimulationScenarioV5({
    ...body, candidate, policy });
  if (scenarioDigest !== rebuilt.scenarioDigest) fail("synthesis simulation scenario is invalid");
  return rebuilt;
}
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u;
const SHA = /^sha256:[0-9a-f]{64}$/u;
function id(value: unknown): AgentPlatID { if (typeof value !== "string" || !ID.test(value)) fail("synthesis simulation ID is invalid"); return value as AgentPlatID; }
function sha(value: unknown): PlanningDigestV1 { if (typeof value !== "string" || !SHA.test(value)) fail("synthesis simulation digest is invalid"); return value as PlanningDigestV1; }
function positive(value: unknown) { if (!Number.isSafeInteger(value) || (value as number) < 1) fail("synthesis simulation positive integer is invalid"); return value as number; }
function nonNegative(value: unknown) { if (!Number.isSafeInteger(value) || (value as number) < 0) fail("synthesis simulation non-negative integer is invalid"); return value as number; }
function bps(value: unknown) { const result = nonNegative(value); if (result > 10_000) fail("synthesis simulation confidence is invalid"); return result; }
function micros(value: unknown) { const result = nonNegative(value); if (result > 1_000_000) fail("synthesis simulation metric is invalid"); return result; }
function shas(values: readonly unknown[], minimum: number, maximum: number) { const result = [...new Set(values.map(sha))].sort(); if (result.length < minimum || result.length > maximum || result.length !== values.length) fail("synthesis simulation digests are invalid"); return freeze(result); }
function digest(domain: string, value: unknown): PlanningDigestV1 { return digestPlanningJsonV1(domain as never, value as PlanningJson); }
function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const item of Object.values(value as Record<string, unknown>)) freeze(item); } return value; }
function fail(message: string): never { throw new TypeError(message); }
