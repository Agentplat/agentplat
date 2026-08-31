import assert from "node:assert/strict";
import test from "node:test";
import { digestPlanningJsonV1 } from "@agentplat/collective-planning";
import {
  MORPHOGENESIS_AGENT_GENESIS_THREATS_V6,
  MorphogenesisAgentGenesisRuntimeV6,
  createAgentInstantiationAuthorityAttenuationV1,
  createAgentInstantiationProfileEvolutionV1,
  createAgentInstantiationProfileV2,
  createAgentInstantiationSynthesisCertificationV1,
  createMorphogenesisAgentGenesisNeedV6,
  createMorphogenesisAgentGenesisPolicyV6,
} from "@agentplat/collective-runtime/morphogenesis";

const sha = (value) => digestPlanningJsonV1("morphogenesis-strategy-context-v3", { value });

function synthesizedProfile() {
  const materialBody = Object.freeze({ schemaVersion: 1, profileId: "profile:genesis:material",
    profileVersion: 1, predecessorProfileDigest: null, creationMode: "catalog",
    tenantId: "tenant:test", missionId: "mission:test", roomId: "room:test",
    objectiveId: "objective:test", workItemId: null, workItemRevision: null,
    roleDefinitionDigest: sha("role"), roleCertificationDigest: sha("role-certification"),
    capabilityKeys: ["incident_analysis"], toolNames: ["logs.read"],
    actionClasses: ["read"], adapterId: "adapter:sandbox", adapterVersion: "1",
    instructionArtifactId: "artifact:instructions", instructionArtifactDigest: sha("instructions"),
    toolSetArtifactId: "artifact:tools", toolSetArtifactDigest: sha("tools"),
    memoryScopeId: "memory:probation", memoryScopeDigest: sha("memory"),
    inputContractDigest: sha("input"), outputContractDigest: sha("output"),
    modelConstraintsDigest: sha("model"), authorityCeilingDigest: sha("authority"),
    localRuleProgramDigest: sha("rules"), resourceBudgetUnits: 10,
    interactionBudgetUnits: 20, maximumActionBudgetUnits: 2,
    requiredAssessorIds: ["assessor:capability"],
    requiredAttestationDigests: [sha("attestation")], authorId: "agent:generator",
    provenanceDigest: sha("provenance"), validFromLogicalMs: 10,
    expiresAtLogicalMs: 100 });
  const materialProfile = Object.freeze({ ...materialBody,
    profileDigest: digestPlanningJsonV1("agent-instantiation-profile", materialBody) });
  const generatorImplementationDigest = sha("generator:v6");
  const evolution = createAgentInstantiationProfileEvolutionV1({
    evolutionId: "evolution:genesis", mode: "synthesized",
    materialProfileDigest: materialProfile.profileDigest, parentProfileDigests: [],
    parentAgentLineageDigests: [], inheritedCapabilityKeys: [], removedCapabilityKeys: [],
    addedCapabilityKeys: ["incident_analysis"],
    addedCapabilityAttestationDigests: [sha("capability-attestation")],
    evolutionPolicyDigest: sha("genesis-evolution-policy"),
    evolutionImplementationDigest: generatorImplementationDigest,
    evidenceDigests: [sha("evolution-evidence")], proposedAtLogicalMs: 15 });
  const attenuation = createAgentInstantiationAuthorityAttenuationV1({
    attenuationId: "attenuation:genesis", evolutionDigest: evolution.evolutionDigest,
    parentAuthorityCeilingDigests: [], childAuthorityCeilingDigest: sha("authority"),
    retainedToolNames: ["logs.read"], removedToolNames: [],
    retainedActionClasses: ["read"], removedActionClasses: [],
    policyDigest: sha("attenuation-policy"), issuerId: "agent:attenuator",
    issuerImplementationDigest: sha("attenuator"), evidenceDigests: [sha("attenuation")],
    issuedAtLogicalMs: 16, validUntilLogicalMs: 90 });
  const synthesisCertification = createAgentInstantiationSynthesisCertificationV1({
    certificationId: "certification:genesis", evolutionDigest: evolution.evolutionDigest,
    materialProfileDigest: materialProfile.profileDigest,
    synthesizerId: "agent:generator", synthesizerVersion: 1,
    synthesizerImplementationDigest: generatorImplementationDigest,
    independentCertifierId: "agent:certifier",
    independentCertifierImplementationDigest: sha("certifier"),
    policyDigest: evolution.evolutionPolicyDigest,
    evidenceDigests: [sha("certification")], certifiedAtLogicalMs: 17,
    validUntilLogicalMs: 80 });
  const profileContext = { materialProfile, parentProfiles: [], evolution, attenuation,
    synthesisCertification, logicalTimeMs: 20 };
  const profile = createAgentInstantiationProfileV2({
    creationMode: "synthesized", context: profileContext });
  return { profile, profileContext, generatorImplementationDigest };
}

function fixture(maximumResourceBudgetUnits = 20) {
  const synthesized = synthesizedProfile();
  const policy = createMorphogenesisAgentGenesisPolicyV6({ schemaVersion: 6,
    policyId: "policy:agent-genesis", policyVersion: 1, parentPolicyDigest: null,
    morphogenesisPolicyDigest: sha("morphogenesis-policy"),
    strategySynthesisPolicyDigest: sha("strategy-synthesis-policy"),
    admittedGeneratorImplementationDigests: [synthesized.generatorImplementationDigest],
    requiredThreats: MORPHOGENESIS_AGENT_GENESIS_THREATS_V6,
    allowedReviewRoutes: ["authorized_agent", "authorized_person", "collective"],
    maximumResourceBudgetUnits, maximumInteractionBudgetUnits: 30,
    maximumActionBudgetUnits: 3, maximumDraftTtlMs: 100,
    maximumProbationInteractions: 10, maximumSpawnDepth: 0 });
  const need = createMorphogenesisAgentGenesisNeedV6({ needId: "need:agent-genesis",
    scopeDigest: sha("scope"), morphogenesisNeedDigest: sha("morphogenesis-need"),
    strategyCandidateDigest: sha("strategy-candidate"),
    strategyCertificationDigest: sha("strategy-certification"),
    evaluatedBlueprintDigests: [sha("catalog-blueprint")], eligibleBlueprintDigests: [],
    localEvidenceDigests: [sha("local-evidence")],
    collectiveEvidenceDigests: [sha("collective-evidence")],
    reasonCodes: ["blueprint_gap"], detectedAtLogicalMs: 10,
    expiresAtLogicalMs: 100, policy });
  const generator = { generatorId: "agent:generator", generatorVersion: 1,
    generatorImplementationDigest: synthesized.generatorImplementationDigest,
    async generate() { return { draftId: "draft:agent-genesis",
      profile: synthesized.profile, profileContext: synthesized.profileContext,
      modelBindingDigest: sha("model-binding"), provenanceDigests: [sha("generation")],
      maximumSpawnDepth: 0, proposedAtLogicalMs: 20, expiresAtLogicalMs: 70 }; } };
  return { ...synthesized, policy, need, generator };
}

test("V6 creates only an inert V2 synthesized-profile draft", async () => {
  const value = fixture();
  const draft = await new MorphogenesisAgentGenesisRuntimeV6({
    policy: value.policy, generator: value.generator,
  }).generate({ need: value.need, logicalTimeMs: 20 });
  assert.equal(draft.profile.creationMode, "synthesized");
  assert.equal(draft.status, "draft");
  assert.equal(draft.inert, true);
  assert.equal("code" in draft, false);
  assert.equal("credentials" in draft, false);
  assert.notEqual(draft.profileContext.synthesisCertification.synthesizerId,
    draft.profileContext.synthesisCertification.independentCertifierId);
});

test("V6 rejects eligible catalog blueprints, foreign generators and budget widening", async () => {
  const value = fixture();
  assert.throws(() => createMorphogenesisAgentGenesisNeedV6({
    ...value.need, eligibleBlueprintDigests: [sha("catalog-blueprint")], policy: value.policy,
  }), /eligible blueprint/);
  assert.throws(() => new MorphogenesisAgentGenesisRuntimeV6({ policy: value.policy,
    generator: { ...value.generator, generatorImplementationDigest: sha("foreign") } }),
  /not admitted/);
  const constrained = fixture(5);
  await assert.rejects(new MorphogenesisAgentGenesisRuntimeV6({
    policy: constrained.policy, generator: constrained.generator,
  }).generate({ need: constrained.need, logicalTimeMs: 20 }), /resource attenuation/);
});
