import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";

import {
  validateAgentInstantiationProfileV2,
  type AgentInstantiationProfileV2,
  type AgentInstantiationProfileV2Context,
} from "./morphogenesis-instantiation.js";
import type { MorphogenesisStrategyReviewRouteV3 } from
  "./morphogenesis-strategy-governance.js";

export const MORPHOGENESIS_AGENT_GENESIS_THREATS_V6 = Object.freeze([
  "data_exfiltration",
  "identity_spoofing",
  "memory_exfiltration",
  "prompt_injection",
  "recursive_spawning",
  "resource_exhaustion",
  "tool_escalation",
] as const);
export type MorphogenesisAgentGenesisThreatV6 =
  (typeof MORPHOGENESIS_AGENT_GENESIS_THREATS_V6)[number];

export interface MorphogenesisAgentGenesisPolicyV6 {
  readonly schemaVersion: 6;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly parentPolicyDigest: PlanningDigestV1 | null;
  readonly morphogenesisPolicyDigest: PlanningDigestV1;
  readonly strategySynthesisPolicyDigest: PlanningDigestV1;
  readonly admittedGeneratorImplementationDigests: readonly PlanningDigestV1[];
  readonly requiredThreats: readonly MorphogenesisAgentGenesisThreatV6[];
  readonly allowedReviewRoutes: readonly MorphogenesisStrategyReviewRouteV3[];
  readonly maximumResourceBudgetUnits: number;
  readonly maximumInteractionBudgetUnits: number;
  readonly maximumActionBudgetUnits: number;
  readonly maximumDraftTtlMs: number;
  readonly maximumProbationInteractions: number;
  readonly maximumSpawnDepth: number;
  readonly policyDigest: PlanningDigestV1;
}

export interface MorphogenesisAgentGenesisNeedV6 {
  readonly schemaVersion: 6;
  readonly needId: AgentPlatID;
  readonly scopeDigest: PlanningDigestV1;
  readonly morphogenesisNeedDigest: PlanningDigestV1;
  readonly strategyCandidateDigest: PlanningDigestV1;
  readonly strategyCertificationDigest: PlanningDigestV1;
  readonly evaluatedBlueprintDigests: readonly PlanningDigestV1[];
  readonly eligibleBlueprintDigests: readonly PlanningDigestV1[];
  readonly localEvidenceDigests: readonly PlanningDigestV1[];
  readonly collectiveEvidenceDigests: readonly PlanningDigestV1[];
  readonly reasonCodes: readonly AgentPlatID[];
  readonly detectedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly genesisRequired: true;
  readonly advisoryOnly: true;
  readonly needDigest: PlanningDigestV1;
}

export interface MorphogenesisAgentGenesisDraftV6 {
  readonly schemaVersion: 6;
  readonly draftId: AgentPlatID;
  readonly needDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
  readonly profile: AgentInstantiationProfileV2;
  readonly profileContext: AgentInstantiationProfileV2Context;
  readonly generatorId: AgentPlatID;
  readonly generatorVersion: number;
  readonly generatorImplementationDigest: PlanningDigestV1;
  readonly modelBindingDigest: PlanningDigestV1;
  readonly provenanceDigests: readonly PlanningDigestV1[];
  readonly maximumSpawnDepth: number;
  readonly proposedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly status: "draft";
  readonly inert: true;
  readonly draftDigest: PlanningDigestV1;
}

export interface MorphogenesisAgentGenesisGeneratorPortV6 {
  readonly generatorId: AgentPlatID;
  readonly generatorVersion: number;
  readonly generatorImplementationDigest: PlanningDigestV1;
  generate(input: { readonly need: MorphogenesisAgentGenesisNeedV6;
    readonly policy: MorphogenesisAgentGenesisPolicyV6;
    readonly logicalTimeMs: number }): Promise<{
      readonly draftId: AgentPlatID;
      readonly profile: AgentInstantiationProfileV2;
      readonly profileContext: AgentInstantiationProfileV2Context;
      readonly modelBindingDigest: PlanningDigestV1;
      readonly provenanceDigests: readonly PlanningDigestV1[];
      readonly maximumSpawnDepth: number;
      readonly proposedAtLogicalMs: number;
      readonly expiresAtLogicalMs: number;
    }>;
}

export function createMorphogenesisAgentGenesisPolicyV6(input:
  Omit<MorphogenesisAgentGenesisPolicyV6, "policyDigest">,
): MorphogenesisAgentGenesisPolicyV6 {
  if (input.schemaVersion !== 6) fail("Agent Genesis policy version is invalid");
  const requiredThreats = enums(input.requiredThreats,
    new Set(MORPHOGENESIS_AGENT_GENESIS_THREATS_V6), "Agent Genesis threats");
  if (requiredThreats.length !== MORPHOGENESIS_AGENT_GENESIS_THREATS_V6.length)
    fail("Agent Genesis must require every adversarial threat");
  const body = freeze({ schemaVersion: 6 as const, policyId: id(input.policyId),
    policyVersion: positive(input.policyVersion),
    parentPolicyDigest: nullableSha(input.parentPolicyDigest),
    morphogenesisPolicyDigest: sha(input.morphogenesisPolicyDigest),
    strategySynthesisPolicyDigest: sha(input.strategySynthesisPolicyDigest),
    admittedGeneratorImplementationDigests:
      shas(input.admittedGeneratorImplementationDigests, 1, 32),
    requiredThreats,
    allowedReviewRoutes: enums(input.allowedReviewRoutes,
      new Set<MorphogenesisStrategyReviewRouteV3>(
        ["authorized_agent", "authorized_person", "collective"]),
      "Agent Genesis review routes"),
    maximumResourceBudgetUnits: positive(input.maximumResourceBudgetUnits),
    maximumInteractionBudgetUnits: positive(input.maximumInteractionBudgetUnits),
    maximumActionBudgetUnits: positive(input.maximumActionBudgetUnits),
    maximumDraftTtlMs: positive(input.maximumDraftTtlMs),
    maximumProbationInteractions: positive(input.maximumProbationInteractions),
    maximumSpawnDepth: nonNegative(input.maximumSpawnDepth) });
  return freeze({ ...body,
    policyDigest: digest("morphogenesis-agent-genesis-policy-v6", body) });
}

export function createMorphogenesisAgentGenesisNeedV6(input:
  Omit<MorphogenesisAgentGenesisNeedV6, "schemaVersion" | "genesisRequired" |
    "advisoryOnly" | "needDigest"> & { readonly policy: MorphogenesisAgentGenesisPolicyV6 },
): MorphogenesisAgentGenesisNeedV6 {
  const policy = validateMorphogenesisAgentGenesisPolicyV6(input.policy);
  const evaluatedBlueprintDigests = shas(input.evaluatedBlueprintDigests, 0, 256);
  const eligibleBlueprintDigests = shas(input.eligibleBlueprintDigests, 0, 256);
  if (eligibleBlueprintDigests.length !== 0)
    fail("Agent Genesis need is not demonstrated while an eligible blueprint exists");
  const body = freeze({ schemaVersion: 6 as const, needId: id(input.needId),
    scopeDigest: sha(input.scopeDigest),
    morphogenesisNeedDigest: sha(input.morphogenesisNeedDigest),
    strategyCandidateDigest: sha(input.strategyCandidateDigest),
    strategyCertificationDigest: sha(input.strategyCertificationDigest),
    evaluatedBlueprintDigests,
    eligibleBlueprintDigests,
    localEvidenceDigests: shas(input.localEvidenceDigests, 1, 128),
    collectiveEvidenceDigests: shas(input.collectiveEvidenceDigests, 1, 128),
    reasonCodes: ids(input.reasonCodes, 1, 32),
    detectedAtLogicalMs: nonNegative(input.detectedAtLogicalMs),
    expiresAtLogicalMs: positive(input.expiresAtLogicalMs),
    genesisRequired: true as const, advisoryOnly: true as const });
  if (body.expiresAtLogicalMs <= body.detectedAtLogicalMs ||
      body.expiresAtLogicalMs - body.detectedAtLogicalMs > policy.maximumDraftTtlMs)
    fail("Agent Genesis need window is invalid");
  return freeze({ ...body,
    needDigest: digest("morphogenesis-agent-genesis-need-v6", body) });
}

export class MorphogenesisAgentGenesisRuntimeV6 {
  readonly #policy: MorphogenesisAgentGenesisPolicyV6;
  constructor(readonly options: { readonly policy: MorphogenesisAgentGenesisPolicyV6;
    readonly generator: MorphogenesisAgentGenesisGeneratorPortV6 }) {
    this.#policy = validateMorphogenesisAgentGenesisPolicyV6(options.policy);
    if (!options?.generator || typeof options.generator.generate !== "function" ||
        !this.#policy.admittedGeneratorImplementationDigests.includes(
          options.generator.generatorImplementationDigest))
      fail("Agent Genesis generator is unavailable or not admitted");
  }
  async generate(input: { readonly need: MorphogenesisAgentGenesisNeedV6;
    readonly logicalTimeMs: number }): Promise<MorphogenesisAgentGenesisDraftV6> {
    const need = validateMorphogenesisAgentGenesisNeedV6(input.need, this.#policy);
    if (need.expiresAtLogicalMs <= input.logicalTimeMs)
      fail("Agent Genesis need is expired");
    const generated = await this.options.generator.generate({ need,
      policy: this.#policy, logicalTimeMs: input.logicalTimeMs });
    const profile = validateAgentInstantiationProfileV2(
      generated.profile, generated.profileContext);
    const context = generated.profileContext;
    if (profile.creationMode !== "synthesized" || !context.evolution ||
        !context.attenuation || !context.synthesisCertification ||
        context.evolution.mode !== "synthesized" ||
        context.synthesisCertification.synthesizerId !== this.options.generator.generatorId ||
        context.synthesisCertification.synthesizerImplementationDigest !==
          this.options.generator.generatorImplementationDigest ||
        profile.resourceBudgetUnits > this.#policy.maximumResourceBudgetUnits ||
        profile.interactionBudgetUnits > this.#policy.maximumInteractionBudgetUnits ||
        profile.maximumActionBudgetUnits > this.#policy.maximumActionBudgetUnits ||
        generated.maximumSpawnDepth > this.#policy.maximumSpawnDepth)
      fail("Agent Genesis synthesized profile or resource attenuation is invalid");
    const body = freeze({ schemaVersion: 6 as const, draftId: id(generated.draftId),
      needDigest: need.needDigest, policyDigest: this.#policy.policyDigest,
      profile, profileContext: freeze(structuredClone(context)),
      generatorId: id(this.options.generator.generatorId),
      generatorVersion: positive(this.options.generator.generatorVersion),
      generatorImplementationDigest: sha(
        this.options.generator.generatorImplementationDigest),
      modelBindingDigest: sha(generated.modelBindingDigest),
      provenanceDigests: shas(generated.provenanceDigests, 1, 256),
      maximumSpawnDepth: nonNegative(generated.maximumSpawnDepth),
      proposedAtLogicalMs: nonNegative(generated.proposedAtLogicalMs),
      expiresAtLogicalMs: positive(generated.expiresAtLogicalMs),
      status: "draft" as const, inert: true as const });
    if (body.proposedAtLogicalMs < input.logicalTimeMs ||
        body.expiresAtLogicalMs <= body.proposedAtLogicalMs ||
        body.expiresAtLogicalMs > need.expiresAtLogicalMs)
      fail("Agent Genesis draft window is invalid");
    return freeze({ ...body,
      draftDigest: digest("morphogenesis-agent-genesis-draft-v6", body) });
  }
}

export function validateMorphogenesisAgentGenesisPolicyV6(value: MorphogenesisAgentGenesisPolicyV6) {
  const { policyDigest, ...body } = value;
  const rebuilt = createMorphogenesisAgentGenesisPolicyV6(body);
  if (rebuilt.policyDigest !== policyDigest) fail("Agent Genesis policy digest is invalid");
  return rebuilt;
}
export function validateMorphogenesisAgentGenesisNeedV6(value: MorphogenesisAgentGenesisNeedV6,
  policy: MorphogenesisAgentGenesisPolicyV6) {
  const { schemaVersion: _s, genesisRequired: _g, advisoryOnly: _a, needDigest, ...body } = value;
  const rebuilt = createMorphogenesisAgentGenesisNeedV6({ ...body, policy });
  if (rebuilt.needDigest !== needDigest || value.genesisRequired !== true ||
      value.advisoryOnly !== true) fail("Agent Genesis need is invalid");
  return rebuilt;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u;
const SHA = /^sha256:[0-9a-f]{64}$/u;
function id(value: unknown): AgentPlatID { if (typeof value !== "string" || !ID.test(value)) fail("Agent Genesis ID is invalid"); return value as AgentPlatID; }
function sha(value: unknown): PlanningDigestV1 { if (typeof value !== "string" || !SHA.test(value)) fail("Agent Genesis digest is invalid"); return value as PlanningDigestV1; }
function nullableSha(value: unknown) { return value === null ? null : sha(value); }
function positive(value: unknown) { if (!Number.isSafeInteger(value) || (value as number) < 1) fail("Agent Genesis positive integer is invalid"); return value as number; }
function nonNegative(value: unknown) { if (!Number.isSafeInteger(value) || (value as number) < 0) fail("Agent Genesis non-negative integer is invalid"); return value as number; }
function ids(values: readonly unknown[], minimum: number, maximum: number) { if (!Array.isArray(values)) fail("Agent Genesis IDs are invalid"); const result = [...new Set(values.map(id))].sort(); if (result.length < minimum || result.length > maximum || result.length !== values.length) fail("Agent Genesis ID set is invalid"); return freeze(result); }
function shas(values: readonly unknown[], minimum: number, maximum: number) { if (!Array.isArray(values)) fail("Agent Genesis digests are invalid"); const result = [...new Set(values.map(sha))].sort(); if (result.length < minimum || result.length > maximum || result.length !== values.length) fail("Agent Genesis digest set is invalid"); return freeze(result); }
function one<T extends string>(value: unknown, allowed: ReadonlySet<T>, label: string): T { if (typeof value !== "string" || !allowed.has(value as T)) fail(`${label} is invalid`); return value as T; }
function enums<T extends string>(values: readonly unknown[], allowed: ReadonlySet<T>, label: string) { if (!Array.isArray(values)) fail(`${label} are invalid`); const result = [...new Set(values.map((value) => one(value, allowed, label)))].sort(); if (!result.length || result.length !== values.length) fail(`${label} are invalid`); return freeze(result); }
function digest(domain: string, value: unknown): PlanningDigestV1 { return digestPlanningJsonV1(domain as never, value as PlanningJson); }
function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const item of Object.values(value as Record<string, unknown>)) freeze(item); } return value; }
function fail(message: string): never { throw new TypeError(message); }
