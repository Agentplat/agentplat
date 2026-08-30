import {
  validateGovernedRoleCertificationV2,
  validateGovernedRoleDefinitionV2,
  type GovernedRoleCertificationV2,
  type GovernedRoleDefinitionV2,
} from "@agentplat/inference-control/governed-role-evolution";
import {
  digestPlanningJsonV1,
  type PlanningDigestDomainV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";

export type AgentInstantiationModeV1 = "catalog";

export interface AgentInstantiationProfileV1 {
  readonly schemaVersion: 1;
  readonly profileId: AgentPlatID;
  readonly profileVersion: number;
  readonly predecessorProfileDigest: PlanningDigestV1 | null;
  readonly creationMode: AgentInstantiationModeV1;
  readonly tenantId: AgentPlatID;
  readonly missionId: AgentPlatID;
  readonly roomId: AgentPlatID | null;
  readonly objectiveId: AgentPlatID;
  readonly workItemId: AgentPlatID | null;
  readonly workItemRevision: number | null;
  readonly roleDefinitionDigest: PlanningDigestV1;
  readonly roleCertificationDigest: PlanningDigestV1;
  readonly capabilityKeys: readonly string[];
  readonly toolNames: readonly string[];
  readonly actionClasses: readonly string[];
  readonly adapterId: AgentPlatID;
  readonly adapterVersion: string;
  readonly instructionArtifactId: AgentPlatID;
  readonly instructionArtifactDigest: PlanningDigestV1;
  readonly toolSetArtifactId: AgentPlatID;
  readonly toolSetArtifactDigest: PlanningDigestV1;
  readonly memoryScopeId: AgentPlatID;
  readonly memoryScopeDigest: PlanningDigestV1;
  readonly inputContractDigest: PlanningDigestV1;
  readonly outputContractDigest: PlanningDigestV1;
  readonly modelConstraintsDigest: PlanningDigestV1;
  readonly authorityCeilingDigest: PlanningDigestV1;
  readonly localRuleProgramDigest: PlanningDigestV1;
  readonly resourceBudgetUnits: number;
  readonly interactionBudgetUnits: number;
  readonly maximumActionBudgetUnits: number;
  readonly requiredAssessorIds: readonly AgentPlatID[];
  readonly requiredAttestationDigests: readonly PlanningDigestV1[];
  readonly authorId: AgentPlatID;
  readonly provenanceDigest: PlanningDigestV1;
  readonly validFromLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly profileDigest: PlanningDigestV1;
}

export interface AgentInstantiationProfileCertificationV1 {
  readonly schemaVersion: 1;
  readonly certificationId: AgentPlatID;
  readonly profileDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
  readonly roleCertificationDigest: PlanningDigestV1;
  readonly certifierId: AgentPlatID;
  readonly certifierVersion: number;
  readonly certifierImplementationDigest: PlanningDigestV1;
  readonly evidenceDigests: readonly PlanningDigestV1[];
  readonly certifiedAtLogicalMs: number;
  readonly validUntilLogicalMs: number;
  readonly certificationDigest: PlanningDigestV1;
}

export interface AgentInstantiationProfileCertificationPortV1 {
  verify(input: {
    readonly profile: AgentInstantiationProfileV1;
    readonly certification: AgentInstantiationProfileCertificationV1;
    readonly role: GovernedRoleDefinitionV2;
    readonly roleCertification: GovernedRoleCertificationV2;
    readonly logicalTimeMs: number;
  }): Promise<boolean>;
}

export type AgentInstantiationEvolutionModeV1 = "derived" | "synthesized";

/**
 * Content-free provenance for a derived or independently synthesized profile.
 * It is advisory composition evidence and grants no identity or authority.
 */
export interface AgentInstantiationProfileEvolutionV1 {
  readonly schemaVersion: 1;
  readonly evolutionId: AgentPlatID;
  readonly mode: AgentInstantiationEvolutionModeV1;
  readonly materialProfileDigest: PlanningDigestV1;
  readonly parentProfileDigests: readonly PlanningDigestV1[];
  readonly parentAgentLineageDigests: readonly PlanningDigestV1[];
  readonly inheritedCapabilityKeys: readonly string[];
  readonly removedCapabilityKeys: readonly string[];
  readonly addedCapabilityKeys: readonly string[];
  readonly addedCapabilityAttestationDigests: readonly PlanningDigestV1[];
  readonly evolutionPolicyDigest: PlanningDigestV1;
  readonly evolutionImplementationDigest: PlanningDigestV1;
  readonly evidenceDigests: readonly PlanningDigestV1[];
  readonly proposedAtLogicalMs: number;
  readonly evolutionDigest: PlanningDigestV1;
}

/** Explicit proof boundary that a child authority ceiling did not widen. */
export interface AgentInstantiationAuthorityAttenuationV1 {
  readonly schemaVersion: 1;
  readonly attenuationId: AgentPlatID;
  readonly evolutionDigest: PlanningDigestV1;
  readonly parentAuthorityCeilingDigests: readonly PlanningDigestV1[];
  readonly childAuthorityCeilingDigest: PlanningDigestV1;
  readonly retainedToolNames: readonly string[];
  readonly removedToolNames: readonly string[];
  readonly retainedActionClasses: readonly string[];
  readonly removedActionClasses: readonly string[];
  readonly policyDigest: PlanningDigestV1;
  readonly issuerId: AgentPlatID;
  readonly issuerImplementationDigest: PlanningDigestV1;
  readonly evidenceDigests: readonly PlanningDigestV1[];
  readonly issuedAtLogicalMs: number;
  readonly validUntilLogicalMs: number;
  readonly attenuationDigest: PlanningDigestV1;
}

/** Independent certification required before model-assisted synthesis is usable. */
export interface AgentInstantiationSynthesisCertificationV1 {
  readonly schemaVersion: 1;
  readonly certificationId: AgentPlatID;
  readonly evolutionDigest: PlanningDigestV1;
  readonly materialProfileDigest: PlanningDigestV1;
  readonly synthesizerId: AgentPlatID;
  readonly synthesizerVersion: number;
  readonly synthesizerImplementationDigest: PlanningDigestV1;
  readonly independentCertifierId: AgentPlatID;
  readonly independentCertifierImplementationDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
  readonly evidenceDigests: readonly PlanningDigestV1[];
  readonly certifiedAtLogicalMs: number;
  readonly validUntilLogicalMs: number;
  readonly certificationDigest: PlanningDigestV1;
}

export interface AgentInstantiationAuthorityAttenuationPortV1 {
  verify(input: {
    readonly evolution: AgentInstantiationProfileEvolutionV1;
    readonly attenuation: AgentInstantiationAuthorityAttenuationV1;
    readonly logicalTimeMs: number;
  }): Promise<boolean>;
}

export interface AgentInstantiationSynthesisCertificationPortV1 {
  verify(input: {
    readonly evolution: AgentInstantiationProfileEvolutionV1;
    readonly certification: AgentInstantiationSynthesisCertificationV1;
    readonly logicalTimeMs: number;
  }): Promise<boolean>;
}

export interface MorphogenesisLineageLinkV1 {
  readonly schemaVersion: 1;
  readonly linkId: AgentPlatID;
  readonly proposalDigest: PlanningDigestV1;
  readonly profileDigest: PlanningDigestV1;
  readonly profileCertificationDigest: PlanningDigestV1;
  readonly agentId: AgentPlatID;
  readonly agentLineageDigest: PlanningDigestV1;
  readonly factoryReceiptDigest: PlanningDigestV1;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly membershipEpoch: number;
  readonly createdAtLogicalMs: number;
  readonly retirementReceiptDigest: PlanningDigestV1 | null;
  readonly linkDigest: PlanningDigestV1;
}

export function createMorphogenesisLineageLinkV1(
  input: Omit<MorphogenesisLineageLinkV1, "schemaVersion" | "linkDigest">,
): MorphogenesisLineageLinkV1 {
  const body = freeze({
    schemaVersion: 1 as const,
    linkId: id(input.linkId, "Morphogenesis lineage link ID"),
    proposalDigest: sha(input.proposalDigest, "lineage proposal digest"),
    profileDigest: sha(input.profileDigest, "lineage profile digest"),
    profileCertificationDigest: sha(
      input.profileCertificationDigest,
      "lineage profile certification digest",
    ),
    agentId: id(input.agentId, "lineage agent ID"),
    agentLineageDigest: sha(
      input.agentLineageDigest,
      "agent lineage digest",
    ),
    factoryReceiptDigest: sha(
      input.factoryReceiptDigest,
      "factory receipt digest",
    ),
    membershipConfigurationDigest: sha(
      input.membershipConfigurationDigest,
      "lineage membership digest",
    ),
    membershipEpoch: positive(input.membershipEpoch, "lineage membership epoch"),
    createdAtLogicalMs: nonNegative(
      input.createdAtLogicalMs,
      "lineage creation time",
    ),
    retirementReceiptDigest: nullableSha(
      input.retirementReceiptDigest,
      "lineage retirement receipt digest",
    ),
  });
  return freeze({
    ...body,
    linkDigest: digest("morphogenesis-lineage-link", body),
  });
}

export function validateMorphogenesisLineageLinkV1(
  input: unknown,
): MorphogenesisLineageLinkV1 {
  const value = exact(
    input,
    [
      "agentId",
      "agentLineageDigest",
      "createdAtLogicalMs",
      "factoryReceiptDigest",
      "linkDigest",
      "linkId",
      "membershipConfigurationDigest",
      "membershipEpoch",
      "profileCertificationDigest",
      "profileDigest",
      "proposalDigest",
      "retirementReceiptDigest",
      "schemaVersion",
    ],
    "Morphogenesis lineage link",
  );
  if (value.schemaVersion !== 1)
    fail("Morphogenesis lineage link schema is invalid");
  const { schemaVersion: _schema, linkDigest, ...body } = value;
  const result = createMorphogenesisLineageLinkV1(
    body as Omit<MorphogenesisLineageLinkV1, "schemaVersion" | "linkDigest">,
  );
  if (linkDigest !== result.linkDigest)
    fail("Morphogenesis lineage link digest is invalid");
  return result;
}

export function createAgentInstantiationProfileV1(input: {
  readonly profileId: AgentPlatID;
  readonly profileVersion: number;
  readonly predecessorProfileDigest: PlanningDigestV1 | null;
  readonly tenantId: AgentPlatID;
  readonly roomId: AgentPlatID | null;
  readonly objectiveId: AgentPlatID;
  readonly workItemId: AgentPlatID | null;
  readonly workItemRevision: number | null;
  readonly role: GovernedRoleDefinitionV2;
  readonly roleCertification: GovernedRoleCertificationV2;
  readonly adapterId: AgentPlatID;
  readonly adapterVersion: string;
  readonly instructionArtifactId: AgentPlatID;
  readonly instructionArtifactDigest: PlanningDigestV1;
  readonly toolSetArtifactId: AgentPlatID;
  readonly toolSetArtifactDigest: PlanningDigestV1;
  readonly memoryScopeId: AgentPlatID;
  readonly memoryScopeDigest: PlanningDigestV1;
  readonly inputContractDigest: PlanningDigestV1;
  readonly outputContractDigest: PlanningDigestV1;
  readonly modelConstraintsDigest: PlanningDigestV1;
  readonly resourceBudgetUnits: number;
  readonly interactionBudgetUnits: number;
  readonly maximumActionBudgetUnits: number;
  readonly requiredAssessorIds: readonly AgentPlatID[];
  readonly requiredAttestationDigests: readonly PlanningDigestV1[];
  readonly authorId: AgentPlatID;
  readonly provenanceDigest: PlanningDigestV1;
  readonly validFromLogicalMs: number;
  readonly expiresAtLogicalMs: number;
}): AgentInstantiationProfileV1 {
  const role = validateGovernedRoleDefinitionV2(input.role);
  const roleCertification = validateGovernedRoleCertificationV2(
    input.roleCertification,
  );
  if (roleCertification.definitionDigest !== role.definitionDigest)
    fail("instantiation role certification does not bind the role definition");
  if ((input.workItemId === null) !== (input.workItemRevision === null))
    fail("instantiation profile Work scope is incomplete");
  const resourceBudgetUnits = positive(
    input.resourceBudgetUnits,
    "profile resource budget",
  );
  const body = freeze({
    schemaVersion: 1 as const,
    profileId: id(input.profileId, "instantiation profile ID"),
    profileVersion: positive(input.profileVersion, "profile version"),
    predecessorProfileDigest: nullableSha(
      input.predecessorProfileDigest,
      "predecessor profile digest",
    ),
    creationMode: "catalog" as const,
    tenantId: id(input.tenantId, "profile tenant ID"),
    missionId: id(role.missionId, "profile mission ID"),
    roomId: nullableId(input.roomId, "profile Room ID"),
    objectiveId: id(input.objectiveId, "profile Objective ID"),
    workItemId: nullableId(input.workItemId, "profile Work Item ID"),
    workItemRevision:
      input.workItemRevision === null
        ? null
        : positive(input.workItemRevision, "profile Work revision"),
    roleDefinitionDigest: sha(
      role.definitionDigest,
      "profile role definition digest",
    ),
    roleCertificationDigest: sha(
      roleCertification.certificationDigest,
      "profile role certification digest",
    ),
    capabilityKeys: identifiers(
      role.capabilityKeys,
      "profile capability keys",
      1,
      256,
    ),
    toolNames: identifiers(role.toolNames, "profile tool names", 0, 256),
    actionClasses: identifiers(
      role.actionClasses,
      "profile action classes",
      0,
      256,
    ),
    adapterId: id(input.adapterId, "profile adapter ID"),
    adapterVersion: token(input.adapterVersion, "profile adapter version"),
    instructionArtifactId: id(
      input.instructionArtifactId,
      "instruction artifact ID",
    ),
    instructionArtifactDigest: sha(
      input.instructionArtifactDigest,
      "instruction artifact digest",
    ),
    toolSetArtifactId: id(input.toolSetArtifactId, "tool-set artifact ID"),
    toolSetArtifactDigest: sha(
      input.toolSetArtifactDigest,
      "tool-set artifact digest",
    ),
    memoryScopeId: id(input.memoryScopeId, "memory scope ID"),
    memoryScopeDigest: sha(input.memoryScopeDigest, "memory scope digest"),
    inputContractDigest: sha(
      input.inputContractDigest,
      "input contract digest",
    ),
    outputContractDigest: sha(
      input.outputContractDigest,
      "output contract digest",
    ),
    modelConstraintsDigest: sha(
      input.modelConstraintsDigest,
      "model constraints digest",
    ),
    authorityCeilingDigest: sha(
      role.authorityDigest,
      "profile authority ceiling digest",
    ),
    localRuleProgramDigest: sha(
      role.localRuleProgramDigest,
      "profile local rule program digest",
    ),
    resourceBudgetUnits,
    interactionBudgetUnits: positive(
      input.interactionBudgetUnits,
      "profile interaction budget",
    ),
    maximumActionBudgetUnits: positive(
      input.maximumActionBudgetUnits,
      "profile action budget",
    ),
    requiredAssessorIds: identifiers(
      input.requiredAssessorIds,
      "required assessor IDs",
      1,
      64,
    ),
    requiredAttestationDigests: digests(
      input.requiredAttestationDigests,
      "required attestation digests",
      1,
      64,
    ),
    authorId: id(input.authorId, "profile author ID"),
    provenanceDigest: sha(input.provenanceDigest, "profile provenance digest"),
    validFromLogicalMs: nonNegative(
      input.validFromLogicalMs,
      "profile valid-from time",
    ),
    expiresAtLogicalMs: positive(input.expiresAtLogicalMs, "profile expiry"),
  });
  if (
    body.resourceBudgetUnits > role.resourceCeilingUnits ||
    body.maximumActionBudgetUnits > body.resourceBudgetUnits ||
    body.expiresAtLogicalMs <= body.validFromLogicalMs ||
    body.expiresAtLogicalMs > roleCertification.validUntilLogicalMs
  )
    fail("instantiation profile resource or validity binding is invalid");
  return freeze({
    ...body,
    profileDigest: digest("agent-instantiation-profile", body),
  });
}

export function validateAgentInstantiationProfileV1(
  input: unknown,
  context: {
    readonly role: GovernedRoleDefinitionV2;
    readonly roleCertification: GovernedRoleCertificationV2;
  },
): AgentInstantiationProfileV1 {
  const value = exact(
    input,
    [
      "actionClasses",
      "adapterId",
      "adapterVersion",
      "authorId",
      "authorityCeilingDigest",
      "capabilityKeys",
      "creationMode",
      "expiresAtLogicalMs",
      "inputContractDigest",
      "instructionArtifactDigest",
      "instructionArtifactId",
      "interactionBudgetUnits",
      "localRuleProgramDigest",
      "maximumActionBudgetUnits",
      "memoryScopeDigest",
      "memoryScopeId",
      "missionId",
      "modelConstraintsDigest",
      "objectiveId",
      "outputContractDigest",
      "predecessorProfileDigest",
      "profileDigest",
      "profileId",
      "profileVersion",
      "provenanceDigest",
      "requiredAssessorIds",
      "requiredAttestationDigests",
      "resourceBudgetUnits",
      "roleCertificationDigest",
      "roleDefinitionDigest",
      "roomId",
      "schemaVersion",
      "tenantId",
      "toolNames",
      "toolSetArtifactDigest",
      "toolSetArtifactId",
      "validFromLogicalMs",
      "workItemId",
      "workItemRevision",
    ],
    "agent instantiation profile",
  );
  if (value.schemaVersion !== 1 || value.creationMode !== "catalog")
    fail("agent instantiation profile schema or mode is invalid");
  const { profileDigest: _digest, ...body } = value;
  const result = createAgentInstantiationProfileV1({
    profileId: body.profileId as AgentPlatID,
    profileVersion: body.profileVersion as number,
    predecessorProfileDigest:
      body.predecessorProfileDigest as PlanningDigestV1 | null,
    tenantId: body.tenantId as AgentPlatID,
    roomId: body.roomId as AgentPlatID | null,
    objectiveId: body.objectiveId as AgentPlatID,
    workItemId: body.workItemId as AgentPlatID | null,
    workItemRevision: body.workItemRevision as number | null,
    role: context.role,
    roleCertification: context.roleCertification,
    adapterId: body.adapterId as AgentPlatID,
    adapterVersion: body.adapterVersion as string,
    instructionArtifactId: body.instructionArtifactId as AgentPlatID,
    instructionArtifactDigest:
      body.instructionArtifactDigest as PlanningDigestV1,
    toolSetArtifactId: body.toolSetArtifactId as AgentPlatID,
    toolSetArtifactDigest: body.toolSetArtifactDigest as PlanningDigestV1,
    memoryScopeId: body.memoryScopeId as AgentPlatID,
    memoryScopeDigest: body.memoryScopeDigest as PlanningDigestV1,
    inputContractDigest: body.inputContractDigest as PlanningDigestV1,
    outputContractDigest: body.outputContractDigest as PlanningDigestV1,
    modelConstraintsDigest: body.modelConstraintsDigest as PlanningDigestV1,
    resourceBudgetUnits: body.resourceBudgetUnits as number,
    interactionBudgetUnits: body.interactionBudgetUnits as number,
    maximumActionBudgetUnits: body.maximumActionBudgetUnits as number,
    requiredAssessorIds: body.requiredAssessorIds as readonly AgentPlatID[],
    requiredAttestationDigests:
      body.requiredAttestationDigests as readonly PlanningDigestV1[],
    authorId: body.authorId as AgentPlatID,
    provenanceDigest: body.provenanceDigest as PlanningDigestV1,
    validFromLogicalMs: body.validFromLogicalMs as number,
    expiresAtLogicalMs: body.expiresAtLogicalMs as number,
  });
  if (
    body.missionId !== result.missionId ||
    body.roleDefinitionDigest !== result.roleDefinitionDigest ||
    body.roleCertificationDigest !== result.roleCertificationDigest ||
    body.authorityCeilingDigest !== result.authorityCeilingDigest ||
    body.localRuleProgramDigest !== result.localRuleProgramDigest ||
    JSON.stringify(body.capabilityKeys) !== JSON.stringify(result.capabilityKeys) ||
    JSON.stringify(body.toolNames) !== JSON.stringify(result.toolNames) ||
    JSON.stringify(body.actionClasses) !== JSON.stringify(result.actionClasses) ||
    value.profileDigest !== result.profileDigest
  )
    fail("agent instantiation profile binding or digest is invalid");
  return result;
}

export function createAgentInstantiationProfileCertificationV1(
  input: Omit<
    AgentInstantiationProfileCertificationV1,
    "schemaVersion" | "certificationDigest"
  >,
): AgentInstantiationProfileCertificationV1 {
  const body = freeze({
    schemaVersion: 1 as const,
    certificationId: id(input.certificationId, "profile certification ID"),
    profileDigest: sha(input.profileDigest, "certified profile digest"),
    policyDigest: sha(input.policyDigest, "profile certification policy digest"),
    roleCertificationDigest: sha(
      input.roleCertificationDigest,
      "profile role certification digest",
    ),
    certifierId: id(input.certifierId, "profile certifier ID"),
    certifierVersion: positive(input.certifierVersion, "profile certifier version"),
    certifierImplementationDigest: sha(
      input.certifierImplementationDigest,
      "profile certifier implementation digest",
    ),
    evidenceDigests: digests(
      input.evidenceDigests,
      "profile certification evidence digests",
      1,
      128,
    ),
    certifiedAtLogicalMs: nonNegative(
      input.certifiedAtLogicalMs,
      "profile certification time",
    ),
    validUntilLogicalMs: positive(
      input.validUntilLogicalMs,
      "profile certification expiry",
    ),
  });
  if (body.validUntilLogicalMs <= body.certifiedAtLogicalMs)
    fail("profile certification validity window is invalid");
  return freeze({
    ...body,
    certificationDigest: digest("agent-instantiation-certification", body),
  });
}

export function validateAgentInstantiationProfileCertificationV1(
  input: unknown,
): AgentInstantiationProfileCertificationV1 {
  const value = exact(
    input,
    [
      "certificationDigest",
      "certificationId",
      "certifiedAtLogicalMs",
      "certifierId",
      "certifierImplementationDigest",
      "certifierVersion",
      "evidenceDigests",
      "policyDigest",
      "profileDigest",
      "roleCertificationDigest",
      "schemaVersion",
      "validUntilLogicalMs",
    ],
    "agent instantiation profile certification",
  );
  if (value.schemaVersion !== 1)
    fail("profile certification schema is invalid");
  const { certificationDigest: _digest, schemaVersion: _schema, ...body } = value;
  const result = createAgentInstantiationProfileCertificationV1(
    body as Omit<
      AgentInstantiationProfileCertificationV1,
      "schemaVersion" | "certificationDigest"
    >,
  );
  if (value.certificationDigest !== result.certificationDigest)
    fail("profile certification digest is invalid");
  return result;
}

export function createAgentInstantiationProfileEvolutionV1(
  input: Omit<
    AgentInstantiationProfileEvolutionV1,
    "schemaVersion" | "evolutionDigest"
  >,
): AgentInstantiationProfileEvolutionV1 {
  const parentProfileDigests = digests(
    input.parentProfileDigests,
    "parent profile digests",
    input.mode === "derived" ? 1 : 0,
    8,
  );
  if (input.mode === "derived" && parentProfileDigests.length !== 1)
    fail("derived profile evolution requires exactly one parent profile");
  if (!new Set(["derived", "synthesized"]).has(input.mode))
    fail("profile evolution mode is invalid");
  const inheritedCapabilityKeys = identifiers(
    input.inheritedCapabilityKeys,
    "inherited capability keys",
    0,
    256,
  );
  const removedCapabilityKeys = identifiers(
    input.removedCapabilityKeys,
    "removed capability keys",
    0,
    256,
  );
  const addedCapabilityKeys = identifiers(
    input.addedCapabilityKeys,
    "added capability keys",
    0,
    256,
  );
  const capabilityKeys = [
    ...inheritedCapabilityKeys,
    ...removedCapabilityKeys,
    ...addedCapabilityKeys,
  ];
  if (new Set(capabilityKeys).size !== capabilityKeys.length)
    fail("profile evolution capability partitions overlap");
  const addedCapabilityAttestationDigests = digests(
    input.addedCapabilityAttestationDigests,
    "added capability attestation digests",
    addedCapabilityKeys.length === 0 ? 0 : 1,
    256,
  );
  const body = freeze({
    schemaVersion: 1 as const,
    evolutionId: id(input.evolutionId, "profile evolution ID"),
    mode: input.mode,
    materialProfileDigest: sha(
      input.materialProfileDigest,
      "material profile digest",
    ),
    parentProfileDigests,
    parentAgentLineageDigests: digests(
      input.parentAgentLineageDigests,
      "parent agent lineage digests",
      0,
      8,
    ),
    inheritedCapabilityKeys,
    removedCapabilityKeys,
    addedCapabilityKeys,
    addedCapabilityAttestationDigests,
    evolutionPolicyDigest: sha(
      input.evolutionPolicyDigest,
      "profile evolution policy digest",
    ),
    evolutionImplementationDigest: sha(
      input.evolutionImplementationDigest,
      "profile evolution implementation digest",
    ),
    evidenceDigests: digests(
      input.evidenceDigests,
      "profile evolution evidence digests",
      1,
      256,
    ),
    proposedAtLogicalMs: nonNegative(
      input.proposedAtLogicalMs,
      "profile evolution proposal time",
    ),
  });
  return freeze({
    ...body,
    evolutionDigest: digest("agent-instantiation-profile-evolution", body),
  });
}

export function validateAgentInstantiationProfileEvolutionV1(
  input: unknown,
): AgentInstantiationProfileEvolutionV1 {
  const value = exact(
    input,
    [
      "addedCapabilityAttestationDigests",
      "addedCapabilityKeys",
      "evidenceDigests",
      "evolutionDigest",
      "evolutionId",
      "evolutionImplementationDigest",
      "evolutionPolicyDigest",
      "inheritedCapabilityKeys",
      "materialProfileDigest",
      "mode",
      "parentAgentLineageDigests",
      "parentProfileDigests",
      "proposedAtLogicalMs",
      "removedCapabilityKeys",
      "schemaVersion",
    ],
    "agent instantiation profile evolution",
  );
  if (value.schemaVersion !== 1)
    fail("profile evolution schema is invalid");
  const { schemaVersion: _schema, evolutionDigest, ...body } = value;
  const result = createAgentInstantiationProfileEvolutionV1(
    body as Omit<
      AgentInstantiationProfileEvolutionV1,
      "schemaVersion" | "evolutionDigest"
    >,
  );
  if (evolutionDigest !== result.evolutionDigest)
    fail("profile evolution digest is invalid");
  return result;
}

export function createAgentInstantiationAuthorityAttenuationV1(
  input: Omit<
    AgentInstantiationAuthorityAttenuationV1,
    "schemaVersion" | "attenuationDigest"
  >,
): AgentInstantiationAuthorityAttenuationV1 {
  const retainedToolNames = identifiers(
    input.retainedToolNames,
    "retained tool names",
    0,
    256,
  );
  const removedToolNames = identifiers(
    input.removedToolNames,
    "removed tool names",
    0,
    256,
  );
  const retainedActionClasses = identifiers(
    input.retainedActionClasses,
    "retained action classes",
    0,
    256,
  );
  const removedActionClasses = identifiers(
    input.removedActionClasses,
    "removed action classes",
    0,
    256,
  );
  if (
    new Set([...retainedToolNames, ...removedToolNames]).size !==
      retainedToolNames.length + removedToolNames.length ||
    new Set([...retainedActionClasses, ...removedActionClasses]).size !==
      retainedActionClasses.length + removedActionClasses.length
  )
    fail("authority attenuation retained and removed sets overlap");
  const body = freeze({
    schemaVersion: 1 as const,
    attenuationId: id(input.attenuationId, "authority attenuation ID"),
    evolutionDigest: sha(input.evolutionDigest, "profile evolution digest"),
    parentAuthorityCeilingDigests: digests(
      input.parentAuthorityCeilingDigests,
      "parent authority ceiling digests",
      0,
      8,
    ),
    childAuthorityCeilingDigest: sha(
      input.childAuthorityCeilingDigest,
      "child authority ceiling digest",
    ),
    retainedToolNames,
    removedToolNames,
    retainedActionClasses,
    removedActionClasses,
    policyDigest: sha(input.policyDigest, "attenuation policy digest"),
    issuerId: id(input.issuerId, "attenuation issuer ID"),
    issuerImplementationDigest: sha(
      input.issuerImplementationDigest,
      "attenuation issuer implementation digest",
    ),
    evidenceDigests: digests(
      input.evidenceDigests,
      "attenuation evidence digests",
      1,
      128,
    ),
    issuedAtLogicalMs: nonNegative(
      input.issuedAtLogicalMs,
      "attenuation issue time",
    ),
    validUntilLogicalMs: positive(
      input.validUntilLogicalMs,
      "attenuation validity",
    ),
  });
  if (body.validUntilLogicalMs <= body.issuedAtLogicalMs)
    fail("authority attenuation validity window is invalid");
  return freeze({
    ...body,
    attenuationDigest: digest("agent-instantiation-authority-attenuation", body),
  });
}

export function validateAgentInstantiationAuthorityAttenuationV1(
  input: unknown,
): AgentInstantiationAuthorityAttenuationV1 {
  const value = exact(
    input,
    [
      "attenuationDigest",
      "attenuationId",
      "childAuthorityCeilingDigest",
      "evidenceDigests",
      "evolutionDigest",
      "issuedAtLogicalMs",
      "issuerId",
      "issuerImplementationDigest",
      "parentAuthorityCeilingDigests",
      "policyDigest",
      "removedActionClasses",
      "removedToolNames",
      "retainedActionClasses",
      "retainedToolNames",
      "schemaVersion",
      "validUntilLogicalMs",
    ],
    "agent instantiation authority attenuation",
  );
  if (value.schemaVersion !== 1)
    fail("authority attenuation schema is invalid");
  const { schemaVersion: _schema, attenuationDigest, ...body } = value;
  const result = createAgentInstantiationAuthorityAttenuationV1(
    body as Omit<
      AgentInstantiationAuthorityAttenuationV1,
      "schemaVersion" | "attenuationDigest"
    >,
  );
  if (attenuationDigest !== result.attenuationDigest)
    fail("authority attenuation digest is invalid");
  return result;
}

export function createAgentInstantiationSynthesisCertificationV1(
  input: Omit<
    AgentInstantiationSynthesisCertificationV1,
    "schemaVersion" | "certificationDigest"
  >,
): AgentInstantiationSynthesisCertificationV1 {
  const body = freeze({
    schemaVersion: 1 as const,
    certificationId: id(input.certificationId, "synthesis certification ID"),
    evolutionDigest: sha(input.evolutionDigest, "profile evolution digest"),
    materialProfileDigest: sha(
      input.materialProfileDigest,
      "material profile digest",
    ),
    synthesizerId: id(input.synthesizerId, "profile synthesizer ID"),
    synthesizerVersion: positive(
      input.synthesizerVersion,
      "profile synthesizer version",
    ),
    synthesizerImplementationDigest: sha(
      input.synthesizerImplementationDigest,
      "profile synthesizer implementation digest",
    ),
    independentCertifierId: id(
      input.independentCertifierId,
      "independent synthesis certifier ID",
    ),
    independentCertifierImplementationDigest: sha(
      input.independentCertifierImplementationDigest,
      "independent synthesis certifier implementation digest",
    ),
    policyDigest: sha(input.policyDigest, "synthesis policy digest"),
    evidenceDigests: digests(
      input.evidenceDigests,
      "synthesis evidence digests",
      1,
      256,
    ),
    certifiedAtLogicalMs: nonNegative(
      input.certifiedAtLogicalMs,
      "synthesis certification time",
    ),
    validUntilLogicalMs: positive(
      input.validUntilLogicalMs,
      "synthesis certification validity",
    ),
  });
  if (
    body.synthesizerId === body.independentCertifierId ||
    body.validUntilLogicalMs <= body.certifiedAtLogicalMs
  )
    fail("synthesis certification independence or validity is invalid");
  return freeze({
    ...body,
    certificationDigest: digest("agent-instantiation-synthesis-certification", body),
  });
}

export function validateAgentInstantiationSynthesisCertificationV1(
  input: unknown,
): AgentInstantiationSynthesisCertificationV1 {
  const value = exact(
    input,
    [
      "certificationDigest",
      "certificationId",
      "certifiedAtLogicalMs",
      "evidenceDigests",
      "evolutionDigest",
      "independentCertifierId",
      "independentCertifierImplementationDigest",
      "materialProfileDigest",
      "policyDigest",
      "schemaVersion",
      "synthesizerId",
      "synthesizerImplementationDigest",
      "synthesizerVersion",
      "validUntilLogicalMs",
    ],
    "agent instantiation synthesis certification",
  );
  if (value.schemaVersion !== 1)
    fail("synthesis certification schema is invalid");
  const { schemaVersion: _schema, certificationDigest, ...body } = value;
  const result = createAgentInstantiationSynthesisCertificationV1(
    body as Omit<
      AgentInstantiationSynthesisCertificationV1,
      "schemaVersion" | "certificationDigest"
    >,
  );
  if (certificationDigest !== result.certificationDigest)
    fail("synthesis certification digest is invalid");
  return result;
}

function exact(input: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail(`${label} must be an object`);
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) fail(`${label} must be a plain object`);
  if (Object.getOwnPropertySymbols(input).length > 0) fail(`${label} fields are invalid`);
  const actual = Object.keys(input as object).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} fields are invalid`);
  return input as Record<string, unknown>;
}

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/+-= ]{0,511}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
function id(value: unknown, label: string): AgentPlatID { if (typeof value !== "string" || !IDENTIFIER.test(value)) fail(`${label} is invalid`); return value as AgentPlatID; }
function nullableId(value: unknown, label: string): AgentPlatID | null { return value === null ? null : id(value, label); }
function token(value: unknown, label: string): string { if (typeof value !== "string" || !TOKEN.test(value)) fail(`${label} is invalid`); return value; }
function sha(value: unknown, label: string): PlanningDigestV1 { if (typeof value !== "string" || !DIGEST.test(value)) fail(`${label} is invalid`); return value as PlanningDigestV1; }
function nullableSha(value: unknown, label: string): PlanningDigestV1 | null { return value === null ? null : sha(value, label); }
function positive(value: unknown, label: string): number { return integer(value, label, 1); }
function nonNegative(value: unknown, label: string): number { return integer(value, label, 0); }
function integer(value: unknown, label: string, minimum: number): number { if (!Number.isSafeInteger(value) || (value as number) < minimum) fail(`${label} is invalid`); return value as number; }
function identifiers(value: readonly unknown[], label: string, minimum: number, maximum: number): readonly AgentPlatID[] { if (!Array.isArray(value) || value.length < minimum || value.length > maximum) fail(`${label} count is invalid`); const result = value.map((item) => id(item, label)).sort(); if (new Set(result).size !== result.length) fail(`${label} contain a duplicate`); return freeze(result); }
function digests(value: readonly unknown[], label: string, minimum: number, maximum: number): readonly PlanningDigestV1[] { if (!Array.isArray(value) || value.length < minimum || value.length > maximum) fail(`${label} count is invalid`); const result = value.map((item) => sha(item, label)).sort(); if (new Set(result).size !== result.length) fail(`${label} contain a duplicate`); return freeze(result); }
function digest(domain: PlanningDigestDomainV1, value: unknown): PlanningDigestV1 { return digestPlanningJsonV1(domain, value as PlanningJson); }
function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const key of Object.getOwnPropertyNames(value)) freeze((value as Record<string, unknown>)[key]); } return value; }
function fail(message: string): never { throw new TypeError(message); }
