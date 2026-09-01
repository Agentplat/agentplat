import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";
import type { MorphogenesisAgentGenesisEntryV6 } from "./morphogenesis-agent-genesis-lifecycle.js";
import type {
  MorphogenesisAgentGenesisDraftV6,
  MorphogenesisAgentGenesisSandboxReceiptV6,
} from "./morphogenesis-agent-genesis.js";

export type MorphogenesisAgentGenesisProbationSourceV6 =
  "capability" | "trust" | "inference_control";
export interface MorphogenesisAgentGenesisProbationAssessmentV6 {
  readonly schemaVersion: 6;
  readonly source: MorphogenesisAgentGenesisProbationSourceV6;
  readonly draftDigest: PlanningDigestV1;
  readonly sandboxReceiptDigest: PlanningDigestV1;
  readonly disposition: "eligible" | "restricted" | "denied" | "unavailable";
  readonly policyDigest: PlanningDigestV1;
  readonly sourceId: AgentPlatID;
  readonly sourceImplementationDigest: PlanningDigestV1;
  readonly evidenceDigests: readonly PlanningDigestV1[];
  readonly observedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly assessmentDigest: PlanningDigestV1;
}
export interface MorphogenesisAgentGenesisProbationAssessmentPortV6 {
  readonly source: MorphogenesisAgentGenesisProbationSourceV6;
  assess(input: {
    readonly draft: MorphogenesisAgentGenesisDraftV6;
    readonly sandboxReceipt: MorphogenesisAgentGenesisSandboxReceiptV6;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisAgentGenesisProbationAssessmentV6>;
}
export interface MorphogenesisAgentGenesisProbationEligibilityV6 {
  readonly schemaVersion: 6;
  readonly draftDigest: PlanningDigestV1;
  readonly sandboxReceiptDigest: PlanningDigestV1;
  readonly capabilityAssessmentDigest: PlanningDigestV1;
  readonly trustAssessmentDigest: PlanningDigestV1;
  readonly inferenceControlAssessmentDigest: PlanningDigestV1;
  readonly capabilityEvidenceDigests: readonly PlanningDigestV1[];
  readonly disposition: "eligible" | "ineligible";
  readonly reasonCodes: readonly AgentPlatID[];
  readonly evaluatedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly grantsAuthority: false;
  readonly decisionDigest: PlanningDigestV1;
}

export function createMorphogenesisAgentGenesisProbationAssessmentV6(
  input: Omit<
    MorphogenesisAgentGenesisProbationAssessmentV6,
    "schemaVersion" | "assessmentDigest"
  >,
) {
  const body = freeze({
    schemaVersion: 6 as const,
    source: source(input.source),
    draftDigest: sha(input.draftDigest),
    sandboxReceiptDigest: sha(input.sandboxReceiptDigest),
    disposition: disposition(input.disposition),
    policyDigest: sha(input.policyDigest),
    sourceId: id(input.sourceId),
    sourceImplementationDigest: sha(input.sourceImplementationDigest),
    evidenceDigests: shas(input.evidenceDigests),
    observedAtLogicalMs: nonNegative(input.observedAtLogicalMs),
    expiresAtLogicalMs: positive(input.expiresAtLogicalMs),
  });
  if (body.expiresAtLogicalMs <= body.observedAtLogicalMs)
    fail("Agent Genesis probation assessment window is invalid");
  return freeze({
    ...body,
    assessmentDigest: digest(
      "morphogenesis-agent-genesis-probation-assessment-v6",
      body,
    ),
  });
}

export class MorphogenesisAgentGenesisProbationEligibilityGateV6 {
  constructor(
    readonly options: {
      readonly capability: MorphogenesisAgentGenesisProbationAssessmentPortV6;
      readonly trust: MorphogenesisAgentGenesisProbationAssessmentPortV6;
      readonly inferenceControl: MorphogenesisAgentGenesisProbationAssessmentPortV6;
    },
  ) {
    if (
      options.capability.source !== "capability" ||
      options.trust.source !== "trust" ||
      options.inferenceControl.source !== "inference_control"
    )
      fail("Agent Genesis probation sources are invalid");
  }
  async evaluate(input: {
    readonly draft: MorphogenesisAgentGenesisDraftV6;
    readonly sandboxReceipt: MorphogenesisAgentGenesisSandboxReceiptV6;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisAgentGenesisProbationEligibilityV6> {
    const raw = await Promise.all([
      this.options.capability.assess(input),
      this.options.trust.assess(input),
      this.options.inferenceControl.assess(input),
    ]);
    const assessments = raw.map((value, index) =>
      validateAssessment(
        value,
        (["capability", "trust", "inference_control"] as const)[index]!,
        input,
      ),
    );
    const reasonCodes = assessments
      .filter(({ disposition }) => disposition !== "eligible")
      .map(
        ({ source, disposition }) => `${source}_${disposition}` as AgentPlatID,
      )
      .sort();
    const body = freeze({
      schemaVersion: 6 as const,
      draftDigest: input.draft.draftDigest,
      sandboxReceiptDigest: input.sandboxReceipt.receiptDigest,
      capabilityAssessmentDigest: assessments[0]!.assessmentDigest,
      trustAssessmentDigest: assessments[1]!.assessmentDigest,
      inferenceControlAssessmentDigest: assessments[2]!.assessmentDigest,
      capabilityEvidenceDigests: assessments[0]!.evidenceDigests,
      disposition: (reasonCodes.length ? "ineligible" : "eligible") as
        "eligible" | "ineligible",
      reasonCodes: freeze(reasonCodes),
      evaluatedAtLogicalMs: nonNegative(input.logicalTimeMs),
      expiresAtLogicalMs: Math.min(
        ...assessments.map(({ expiresAtLogicalMs }) => expiresAtLogicalMs),
      ),
      grantsAuthority: false as const,
    });
    return freeze({
      ...body,
      decisionDigest: digest(
        "morphogenesis-agent-genesis-probation-eligibility-v6",
        body,
      ),
    });
  }
}

export function validateMorphogenesisAgentGenesisProbationEligibilityV6(
  value: MorphogenesisAgentGenesisProbationEligibilityV6,
  input: {
    readonly draft: MorphogenesisAgentGenesisDraftV6;
    readonly sandboxReceipt: MorphogenesisAgentGenesisSandboxReceiptV6;
    readonly logicalTimeMs: number;
  },
) {
  const { decisionDigest, ...body } = value;
  if (
    value.schemaVersion !== 6 ||
    value.draftDigest !== input.draft.draftDigest ||
    value.sandboxReceiptDigest !== input.sandboxReceipt.receiptDigest ||
    value.grantsAuthority !== false ||
    value.expiresAtLogicalMs <= input.logicalTimeMs ||
    decisionDigest !==
      digest("morphogenesis-agent-genesis-probation-eligibility-v6", body)
  )
    fail("Agent Genesis probation eligibility is invalid");
  return freeze(structuredClone(value));
}

export interface MorphogenesisAgentGenesisActivationHandoffV6 {
  readonly schemaVersion: 6;
  readonly handoffId: AgentPlatID;
  readonly draftDigest: PlanningDigestV1;
  readonly profileDigest: PlanningDigestV1;
  readonly agentDigest: PlanningDigestV1;
  readonly attestationDigest: PlanningDigestV1;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly membershipEpoch: number;
  readonly capabilityKeys: readonly AgentPlatID[];
  readonly roleDefinitionDigest: PlanningDigestV1;
  readonly eligibleForExistingWorkOwner: true;
  readonly workGranted: false;
  readonly actionAuthorityGranted: false;
  readonly createdAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly handoffDigest: PlanningDigestV1;
}

export interface MorphogenesisAgentGenesisLineageV6 {
  readonly schemaVersion: 6;
  readonly lineageId: AgentPlatID;
  readonly needDigest: PlanningDigestV1;
  readonly draftDigest: PlanningDigestV1;
  readonly profileDigest: PlanningDigestV1;
  readonly evolutionDigest: PlanningDigestV1;
  readonly authorityAttenuationDigest: PlanningDigestV1;
  readonly synthesisCertificationDigest: PlanningDigestV1;
  readonly agentLineageDigest: PlanningDigestV1;
  readonly agentDigest: PlanningDigestV1;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly membershipEpoch: number;
  readonly attestationDigest: PlanningDigestV1;
  readonly terminalReceiptDigest: PlanningDigestV1 | null;
  readonly recordedAtLogicalMs: number;
  readonly grantsAuthority: false;
  readonly lineageDigest: PlanningDigestV1;
}

export function createMorphogenesisAgentGenesisLineageV6(input: {
  readonly lineageId: AgentPlatID;
  readonly entry: MorphogenesisAgentGenesisEntryV6;
  readonly logicalTimeMs: number;
}): MorphogenesisAgentGenesisLineageV6 {
  const entry = input.entry;
  const context = entry.draft.profileContext;
  if (
    !entry.lifecycleAgent ||
    !entry.attestation ||
    !context.evolution ||
    !context.attenuation ||
    !context.synthesisCertification
  )
    fail("Agent Genesis lineage material is incomplete");
  const body = freeze({
    schemaVersion: 6 as const,
    lineageId: id(input.lineageId),
    needDigest: entry.draft.needDigest,
    draftDigest: entry.draft.draftDigest,
    profileDigest: entry.draft.profile.profileDigest,
    evolutionDigest: context.evolution.evolutionDigest,
    authorityAttenuationDigest: context.attenuation.attenuationDigest,
    synthesisCertificationDigest:
      context.synthesisCertification.certificationDigest,
    agentLineageDigest: entry.lifecycleAgent.lineageDigest,
    agentDigest: entry.lifecycleAgent.agentDigest,
    membershipConfigurationDigest:
      entry.lifecycleAgent.membershipConfigurationDigest,
    membershipEpoch: positive(entry.lifecycleAgent.membershipEpoch),
    attestationDigest: entry.attestation.attestationDigest,
    terminalReceiptDigest: entry.terminalReceipt?.terminalReceiptDigest ?? null,
    recordedAtLogicalMs: nonNegative(input.logicalTimeMs),
    grantsAuthority: false as const,
  });
  return freeze({
    ...body,
    lineageDigest: digest("morphogenesis-agent-genesis-lineage-v6", body),
  });
}

/** Supplies verified material to the existing Team/Work owners. It deliberately
 * cannot construct Work Contracts, leases, fences or Action Grants. */
export function createMorphogenesisAgentGenesisActivationHandoffV6(input: {
  readonly handoffId: AgentPlatID;
  readonly entry: MorphogenesisAgentGenesisEntryV6;
  readonly logicalTimeMs: number;
  readonly expiresAtLogicalMs: number;
}): MorphogenesisAgentGenesisActivationHandoffV6 {
  const entry = input.entry;
  if (
    entry.status !== "admitted" ||
    !entry.externalAdmissionApplied ||
    !entry.lifecycleAgent ||
    !entry.attestation ||
    entry.terminalReceipt ||
    entry.attestation.validUntilLogicalMs <= input.logicalTimeMs ||
    entry.workGranted !== false ||
    entry.actionAuthorityGranted !== false
  )
    fail("Agent Genesis activation handoff is not eligible");
  const body = freeze({
    schemaVersion: 6 as const,
    handoffId: id(input.handoffId),
    draftDigest: entry.draft.draftDigest,
    profileDigest: entry.draft.profile.profileDigest,
    agentDigest: entry.lifecycleAgent.agentDigest,
    attestationDigest: entry.attestation.attestationDigest,
    membershipConfigurationDigest:
      entry.lifecycleAgent.membershipConfigurationDigest,
    membershipEpoch: positive(entry.lifecycleAgent.membershipEpoch),
    capabilityKeys: ids(entry.lifecycleAgent.capabilityKeys),
    roleDefinitionDigest: entry.lifecycleAgent.roleDefinitionDigest,
    eligibleForExistingWorkOwner: true as const,
    workGranted: false as const,
    actionAuthorityGranted: false as const,
    createdAtLogicalMs: nonNegative(input.logicalTimeMs),
    expiresAtLogicalMs: positive(input.expiresAtLogicalMs),
  });
  if (
    body.expiresAtLogicalMs <= body.createdAtLogicalMs ||
    body.expiresAtLogicalMs > entry.attestation.validUntilLogicalMs
  )
    fail("Agent Genesis activation handoff window is invalid");
  return freeze({
    ...body,
    handoffDigest: digest(
      "morphogenesis-agent-genesis-activation-handoff-v6",
      body,
    ),
  });
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u;
const SHA = /^sha256:[0-9a-f]{64}$/u;
function id(value: unknown): AgentPlatID {
  if (typeof value !== "string" || !ID.test(value))
    fail("Agent Genesis handoff ID is invalid");
  return value as AgentPlatID;
}
function sha(value: unknown): PlanningDigestV1 {
  if (typeof value !== "string" || !SHA.test(value))
    fail("Agent Genesis integration digest is invalid");
  return value as PlanningDigestV1;
}
function positive(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    fail("Agent Genesis handoff integer is invalid");
  return value as number;
}
function nonNegative(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    fail("Agent Genesis handoff time is invalid");
  return value as number;
}
function ids(values: readonly unknown[]) {
  const result = [...new Set(values.map(id))].sort();
  if (!result.length || result.length !== values.length)
    fail("Agent Genesis handoff capabilities are invalid");
  return freeze(result);
}
function shas(values: readonly unknown[]) {
  const result = [...new Set(values.map(sha))].sort();
  if (!result.length || result.length !== values.length)
    fail("Agent Genesis integration evidence is invalid");
  return freeze(result);
}
function source(value: unknown): MorphogenesisAgentGenesisProbationSourceV6 {
  if (
    !new Set(["capability", "trust", "inference_control"]).has(value as string)
  )
    fail("Agent Genesis probation source is invalid");
  return value as MorphogenesisAgentGenesisProbationSourceV6;
}
function disposition(
  value: unknown,
): MorphogenesisAgentGenesisProbationAssessmentV6["disposition"] {
  if (
    !new Set(["eligible", "restricted", "denied", "unavailable"]).has(
      value as string,
    )
  )
    fail("Agent Genesis probation disposition is invalid");
  return value as MorphogenesisAgentGenesisProbationAssessmentV6["disposition"];
}
function validateAssessment(
  value: MorphogenesisAgentGenesisProbationAssessmentV6,
  expected: MorphogenesisAgentGenesisProbationSourceV6,
  input: {
    readonly draft: MorphogenesisAgentGenesisDraftV6;
    readonly sandboxReceipt: MorphogenesisAgentGenesisSandboxReceiptV6;
    readonly logicalTimeMs: number;
  },
) {
  const { schemaVersion: _s, assessmentDigest, ...body } = value;
  const normalized = createMorphogenesisAgentGenesisProbationAssessmentV6(body);
  if (
    normalized.assessmentDigest !== assessmentDigest ||
    normalized.source !== expected ||
    normalized.draftDigest !== input.draft.draftDigest ||
    normalized.sandboxReceiptDigest !== input.sandboxReceipt.receiptDigest ||
    normalized.expiresAtLogicalMs <= input.logicalTimeMs
  )
    fail("Agent Genesis probation assessment is invalid");
  return normalized;
}
function digest(domain: string, value: unknown): PlanningDigestV1 {
  return digestPlanningJsonV1(domain as never, value as PlanningJson);
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>))
      freeze(item);
  }
  return value;
}
function fail(message: string): never {
  throw new TypeError(message);
}
