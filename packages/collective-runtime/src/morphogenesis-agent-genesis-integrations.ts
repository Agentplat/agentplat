import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";
import type { MorphogenesisAgentGenesisEntryV6 } from
  "./morphogenesis-agent-genesis-lifecycle.js";

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
  if (!entry.lifecycleAgent || !entry.attestation || !context.evolution ||
      !context.attenuation || !context.synthesisCertification)
    fail("Agent Genesis lineage material is incomplete");
  const body = freeze({ schemaVersion: 6 as const, lineageId: id(input.lineageId),
    needDigest: entry.draft.needDigest, draftDigest: entry.draft.draftDigest,
    profileDigest: entry.draft.profile.profileDigest,
    evolutionDigest: context.evolution.evolutionDigest,
    authorityAttenuationDigest: context.attenuation.attenuationDigest,
    synthesisCertificationDigest: context.synthesisCertification.certificationDigest,
    agentLineageDigest: entry.lifecycleAgent.lineageDigest,
    agentDigest: entry.lifecycleAgent.agentDigest,
    membershipConfigurationDigest: entry.lifecycleAgent.membershipConfigurationDigest,
    membershipEpoch: positive(entry.lifecycleAgent.membershipEpoch),
    attestationDigest: entry.attestation.attestationDigest,
    terminalReceiptDigest: entry.terminalReceipt?.terminalReceiptDigest ?? null,
    recordedAtLogicalMs: nonNegative(input.logicalTimeMs), grantsAuthority: false as const });
  return freeze({ ...body,
    lineageDigest: digest("morphogenesis-agent-genesis-lineage-v6", body) });
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
  if (entry.status !== "admitted" || !entry.externalAdmissionApplied ||
      !entry.lifecycleAgent || !entry.attestation || entry.terminalReceipt ||
      entry.attestation.validUntilLogicalMs <= input.logicalTimeMs ||
      entry.workGranted !== false || entry.actionAuthorityGranted !== false)
    fail("Agent Genesis activation handoff is not eligible");
  const body = freeze({ schemaVersion: 6 as const, handoffId: id(input.handoffId),
    draftDigest: entry.draft.draftDigest, profileDigest: entry.draft.profile.profileDigest,
    agentDigest: entry.lifecycleAgent.agentDigest,
    attestationDigest: entry.attestation.attestationDigest,
    membershipConfigurationDigest: entry.lifecycleAgent.membershipConfigurationDigest,
    membershipEpoch: positive(entry.lifecycleAgent.membershipEpoch),
    capabilityKeys: ids(entry.lifecycleAgent.capabilityKeys),
    roleDefinitionDigest: entry.lifecycleAgent.roleDefinitionDigest,
    eligibleForExistingWorkOwner: true as const, workGranted: false as const,
    actionAuthorityGranted: false as const,
    createdAtLogicalMs: nonNegative(input.logicalTimeMs),
    expiresAtLogicalMs: positive(input.expiresAtLogicalMs) });
  if (body.expiresAtLogicalMs <= body.createdAtLogicalMs ||
      body.expiresAtLogicalMs > entry.attestation.validUntilLogicalMs)
    fail("Agent Genesis activation handoff window is invalid");
  return freeze({ ...body,
    handoffDigest: digest("morphogenesis-agent-genesis-activation-handoff-v6", body) });
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u;
function id(value: unknown): AgentPlatID { if (typeof value !== "string" || !ID.test(value)) fail("Agent Genesis handoff ID is invalid"); return value as AgentPlatID; }
function positive(value: unknown) { if (!Number.isSafeInteger(value) || (value as number) < 1) fail("Agent Genesis handoff integer is invalid"); return value as number; }
function nonNegative(value: unknown) { if (!Number.isSafeInteger(value) || (value as number) < 0) fail("Agent Genesis handoff time is invalid"); return value as number; }
function ids(values: readonly unknown[]) { const result = [...new Set(values.map(id))].sort(); if (!result.length || result.length !== values.length) fail("Agent Genesis handoff capabilities are invalid"); return freeze(result); }
function digest(domain: string, value: unknown): PlanningDigestV1 { return digestPlanningJsonV1(domain as never, value as PlanningJson); }
function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const item of Object.values(value as Record<string, unknown>)) freeze(item); } return value; }
function fail(message: string): never { throw new TypeError(message); }
