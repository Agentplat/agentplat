import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";
import {
  teamTopologyDigestV1,
  type TeamTopologyNodeV1,
} from "./team-topology-transformation.js";
import type { MorphogenesisOperatorV1 } from "./morphogenesis-contracts.js";

export interface MorphogenesisOrganizationalEvolutionPolicyV7 {
  readonly schemaVersion: 7;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly morphogenesisPolicyDigest: PlanningDigestV1;
  readonly minimumPersistentCycles: number;
  readonly maximumCandidates: number;
  readonly maximumTeams: number;
  readonly maximumMembers: number;
  readonly maximumChangedMembers: number;
  readonly minimumProviderDiversity: number;
  readonly minimumModelDiversity: number;
  readonly maximumAuthorityConcentrationBps: number;
  readonly maximumCandidateTtlMs: number;
  readonly policyDigest: PlanningDigestV1;
}
export interface MorphogenesisOrganizationalPatternV7 {
  readonly schemaVersion: 7;
  readonly patternId: AgentPlatID;
  readonly currentTopologyDigest: PlanningDigestV1;
  readonly currentTopologyEpoch: number;
  readonly strategyEvidenceDigests: readonly PlanningDigestV1[];
  readonly collectiveEvidenceDigests: readonly PlanningDigestV1[];
  readonly synthesisEvidenceDigests: readonly PlanningDigestV1[];
  readonly genesisEvidenceDigests: readonly PlanningDigestV1[];
  readonly consecutiveCycles: number;
  readonly reasonCodes: readonly AgentPlatID[];
  readonly observedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly evolutionRequired: true;
  readonly advisoryOnly: true;
  readonly patternDigest: PlanningDigestV1;
}
export interface MorphogenesisOrganizationalCandidateV7 {
  readonly schemaVersion: 7;
  readonly candidateId: AgentPlatID;
  readonly patternDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
  readonly targetTopology: readonly TeamTopologyNodeV1[];
  readonly targetTopologyDigest: PlanningDigestV1;
  readonly operators: readonly MorphogenesisOperatorV1[];
  readonly changedMemberIds: readonly AgentPlatID[];
  readonly providerDiversity: number;
  readonly modelDiversity: number;
  readonly authorityConcentrationBps: number;
  readonly costDigest: PlanningDigestV1;
  readonly riskDigest: PlanningDigestV1;
  readonly continuityPlanDigest: PlanningDigestV1;
  readonly rollbackPlanDigest: PlanningDigestV1;
  readonly proposedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly inert: true;
  readonly candidateDigest: PlanningDigestV1;
}

export function createMorphogenesisOrganizationalEvolutionPolicyV7(
  input: Omit<MorphogenesisOrganizationalEvolutionPolicyV7, "policyDigest">,
) {
  if (input.schemaVersion !== 7)
    fail("organizational evolution policy version is invalid");
  const body = freeze({
    ...input,
    policyId: id(input.policyId),
    policyVersion: pos(input.policyVersion),
    morphogenesisPolicyDigest: sha(input.morphogenesisPolicyDigest),
    minimumPersistentCycles: pos(input.minimumPersistentCycles),
    maximumCandidates: bound(input.maximumCandidates, 1, 64),
    maximumTeams: pos(input.maximumTeams),
    maximumMembers: pos(input.maximumMembers),
    maximumChangedMembers: pos(input.maximumChangedMembers),
    minimumProviderDiversity: pos(input.minimumProviderDiversity),
    minimumModelDiversity: pos(input.minimumModelDiversity),
    maximumAuthorityConcentrationBps: bps(
      input.maximumAuthorityConcentrationBps,
    ),
    maximumCandidateTtlMs: pos(input.maximumCandidateTtlMs),
  });
  return freeze({
    ...body,
    policyDigest: digest(
      "morphogenesis-organizational-evolution-policy-v7",
      body,
    ),
  });
}
export function createMorphogenesisOrganizationalPatternV7(
  input: Omit<
    MorphogenesisOrganizationalPatternV7,
    "schemaVersion" | "evolutionRequired" | "advisoryOnly" | "patternDigest"
  > & { readonly policy: MorphogenesisOrganizationalEvolutionPolicyV7 },
) {
  const p = input.policy;
  if (input.consecutiveCycles < p.minimumPersistentCycles)
    fail("organizational pattern is not persistent");
  const body = freeze({
    schemaVersion: 7 as const,
    patternId: id(input.patternId),
    currentTopologyDigest: sha(input.currentTopologyDigest),
    currentTopologyEpoch: pos(input.currentTopologyEpoch),
    strategyEvidenceDigests: shas(input.strategyEvidenceDigests),
    collectiveEvidenceDigests: shas(input.collectiveEvidenceDigests),
    synthesisEvidenceDigests: shas(input.synthesisEvidenceDigests),
    genesisEvidenceDigests: shas(input.genesisEvidenceDigests),
    consecutiveCycles: pos(input.consecutiveCycles),
    reasonCodes: ids(input.reasonCodes),
    observedAtLogicalMs: nonneg(input.observedAtLogicalMs),
    expiresAtLogicalMs: pos(input.expiresAtLogicalMs),
    evolutionRequired: true as const,
    advisoryOnly: true as const,
  });
  if (
    body.expiresAtLogicalMs <= body.observedAtLogicalMs ||
    body.expiresAtLogicalMs - body.observedAtLogicalMs > p.maximumCandidateTtlMs
  )
    fail("organizational pattern window is invalid");
  return freeze({
    ...body,
    patternDigest: digest("morphogenesis-organizational-pattern-v7", body),
  });
}
export function createMorphogenesisOrganizationalCandidateV7(
  input: Omit<
    MorphogenesisOrganizationalCandidateV7,
    | "schemaVersion"
    | "policyDigest"
    | "targetTopologyDigest"
    | "inert"
    | "candidateDigest"
  > & { readonly policy: MorphogenesisOrganizationalEvolutionPolicyV7 },
) {
  const p = input.policy;
  const topology = freeze(
    input.targetTopology.map((x) => freeze(structuredClone(x))),
  );
  const members = new Set(topology.flatMap((x) => x.memberIds));
  if (
    topology.length > p.maximumTeams ||
    members.size > p.maximumMembers ||
    input.changedMemberIds.length > p.maximumChangedMembers ||
    input.providerDiversity < p.minimumProviderDiversity ||
    input.modelDiversity < p.minimumModelDiversity ||
    input.authorityConcentrationBps > p.maximumAuthorityConcentrationBps
  )
    fail(
      "organizational candidate exceeds diversity, population or churn policy",
    );
  const body = freeze({
    schemaVersion: 7 as const,
    candidateId: id(input.candidateId),
    patternDigest: sha(input.patternDigest),
    policyDigest: p.policyDigest,
    targetTopology: topology,
    targetTopologyDigest: teamTopologyDigestV1(topology),
    operators: operatorSet(input.operators),
    changedMemberIds: ids(input.changedMemberIds),
    providerDiversity: pos(input.providerDiversity),
    modelDiversity: pos(input.modelDiversity),
    authorityConcentrationBps: bps(input.authorityConcentrationBps),
    costDigest: sha(input.costDigest),
    riskDigest: sha(input.riskDigest),
    continuityPlanDigest: sha(input.continuityPlanDigest),
    rollbackPlanDigest: sha(input.rollbackPlanDigest),
    proposedAtLogicalMs: nonneg(input.proposedAtLogicalMs),
    expiresAtLogicalMs: pos(input.expiresAtLogicalMs),
    inert: true as const,
  });
  if (
    !body.operators.length ||
    body.expiresAtLogicalMs <= body.proposedAtLogicalMs
  )
    fail("organizational candidate is invalid");
  return freeze({
    ...body,
    candidateDigest: digest("morphogenesis-organizational-candidate-v7", body),
  });
}
function operatorSet(v: readonly unknown[]) {
  const r = [
    ...new Set(
      v.map((x) => {
        if (typeof x !== "string" || !OPS.has(x))
          fail("organizational operator invalid");
        return x as MorphogenesisOperatorV1;
      }),
    ),
  ].sort();
  if (!r.length || r.length !== v.length)
    fail("organizational operators invalid");
  return freeze(r);
}
const OPS = new Set([
    "recruit_existing",
    "instantiate_agent",
    "derive_agent",
    "realign_role",
    "reassign_work",
    "replace_agent",
    "split_team",
    "merge_teams",
    "federate_teams",
    "detach_agent",
    "suspend_agent",
    "resume_agent",
    "retire_agent",
  ]),
  ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u,
  SHA = /^sha256:[0-9a-f]{64}$/u;
function id(v: unknown) {
  if (typeof v !== "string" || !ID.test(v)) fail("organizational ID invalid");
  return v as AgentPlatID;
}
function sha(v: unknown) {
  if (typeof v !== "string" || !SHA.test(v))
    fail("organizational digest invalid");
  return v as PlanningDigestV1;
}
function pos(v: unknown) {
  if (!Number.isSafeInteger(v) || (v as number) < 1)
    fail("organizational integer invalid");
  return v as number;
}
function nonneg(v: unknown) {
  if (!Number.isSafeInteger(v) || (v as number) < 0)
    fail("organizational integer invalid");
  return v as number;
}
function bound(v: unknown, a: number, b: number) {
  const n = pos(v);
  if (n < a || n > b) fail("organizational bound invalid");
  return n;
}
function bps(v: unknown) {
  return bound(v, 1, 10000);
}
function ids(v: readonly unknown[]) {
  const r = [...new Set(v.map(id))].sort();
  if (!r.length || r.length !== v.length) fail("organizational IDs invalid");
  return freeze(r);
}
function shas(v: readonly unknown[]) {
  const r = [...new Set(v.map(sha))].sort();
  if (!r.length || r.length !== v.length)
    fail("organizational evidence invalid");
  return freeze(r);
}
function digest(d: string, v: unknown) {
  return digestPlanningJsonV1(d as never, v as PlanningJson);
}
function freeze<T>(v: T): T {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const x of Object.values(v as Record<string, unknown>)) freeze(x);
  }
  return v;
}
function fail(m: string): never {
  throw new TypeError(m);
}
