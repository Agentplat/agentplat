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
  createMorphogenesisAgentGenesisEvaluationV6,
  createMorphogenesisAgentGenesisThreatAssessmentV6,
  MorphogenesisAgentGenesisSandboxRuntimeV6,
  InMemoryMorphogenesisAgentGenesisLifecycleStoreV6,
  MorphogenesisAgentGenesisLifecycleRuntimeV6,
  createMorphogenesisAgentGenesisLifecyclePolicyV6,
  createMorphogenesisAgentGenesisReviewV6,
  validateMorphogenesisAgentGenesisLifecycleStateV6,
  createMorphogenesisLifecycleAgentV1,
  createMorphogenesisAgentAttestationV1,
  createMorphogenesisTerminalAgentReceiptV1,
  createMorphogenesisAgentGenesisActivationHandoffV6,
  createMorphogenesisAgentGenesisLineageV6,
  MorphogenesisAgentGenesisProbationEligibilityGateV6,
  createMorphogenesisAgentGenesisProbationAssessmentV6,
} from "@agentplat/collective-runtime/morphogenesis";
import {
  MorphogenesisAgentGenesisMeshPublisherV6,
  projectMorphogenesisAgentGenesisDraftToMeshV6,
  projectMorphogenesisAgentGenesisDraftToRoomArtifactV6,
  projectMorphogenesisAgentGenesisRecommendationToMeshV6,
  projectMorphogenesisAgentGenesisRecommendationToRoomArtifactV6,
} from "@agentplat/rooms-mesh/morphogenesis";

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
    maximumProbationInteractions: 10, maximumSpawnDepth: 0,
    minimumAssessmentConfidenceBps: 8_000, minimumSafetyMicros: 800_000,
    maximumAssessmentTtlMs: 50 });
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

test("V6 requires complete adversarial evidence before authority-free sandbox preparation", async () => {
  const value = fixture();
  const draft = await new MorphogenesisAgentGenesisRuntimeV6({
    policy: value.policy, generator: value.generator,
  }).generate({ need: value.need, logicalTimeMs: 20 });
  const threatAssessments = MORPHOGENESIS_AGENT_GENESIS_THREATS_V6.map((threat) =>
    createMorphogenesisAgentGenesisThreatAssessmentV6({ threat, disposition: "passed",
      evidenceDigests: [sha(`threat:${threat}`)] }));
  assert.throws(() => createMorphogenesisAgentGenesisEvaluationV6({
    evaluationId: "evaluation:incomplete", draft,
    baselineBlueprintDigest: sha("baseline"), simulatorImplementationDigest: sha("simulator"),
    environmentDigest: sha("environment"), seedDigest: sha("seed"),
    threatAssessments: threatAssessments.slice(1), safetyMicros: 900_000,
    confidenceBps: 9_000, interactionUnits: 5, assessorId: "agent:assessor",
    assessorImplementationDigest: sha("assessor"), evidenceDigests: [sha("evaluation")],
    evaluatedAtLogicalMs: 30, expiresAtLogicalMs: 60, policy: value.policy,
  }), /coverage/);
  const evaluation = createMorphogenesisAgentGenesisEvaluationV6({
    evaluationId: "evaluation:genesis", draft,
    baselineBlueprintDigest: sha("baseline"), simulatorImplementationDigest: sha("simulator"),
    environmentDigest: sha("environment"), seedDigest: sha("seed"),
    threatAssessments, safetyMicros: 900_000, confidenceBps: 9_000,
    interactionUnits: 5, assessorId: "agent:assessor",
    assessorImplementationDigest: sha("assessor"), evidenceDigests: [sha("evaluation")],
    evaluatedAtLogicalMs: 30, expiresAtLogicalMs: 60, policy: value.policy,
  });
  const sandboxImplementationDigest = sha("sandbox");
  const sandbox = { sandboxImplementationDigest, async prepare({ operationId,
    draft, logicalTimeMs }) {
    const body = Object.freeze({ schemaVersion: 6, operationId,
      draftDigest: draft.draftDigest, profileDigest: draft.profile.profileDigest,
      sandboxId: "sandbox:genesis", sandboxImplementationDigest,
      isolationPolicyDigest: sha("isolation"), preparedAtLogicalMs: logicalTimeMs,
      expiresAtLogicalMs: 55, membershipGranted: false, workGranted: false,
      actionAuthorityGranted: false });
    return Object.freeze({ ...body,
      receiptDigest: digestPlanningJsonV1("morphogenesis-agent-genesis-sandbox-receipt-v6", body) });
  } };
  const receipt = await new MorphogenesisAgentGenesisSandboxRuntimeV6({ sandbox }).prepare({
    operationId: "operation:genesis", draft, evaluation, logicalTimeMs: 35 });
  assert.equal(receipt.membershipGranted, false);
  assert.equal(receipt.workGranted, false);
  assert.equal(receipt.actionAuthorityGranted, false);
});

test("V6 durably advances sandbox and probation through agent, person or quorum review", async () => {
  const value = fixture();
  const draft = await new MorphogenesisAgentGenesisRuntimeV6({
    policy: value.policy, generator: value.generator,
  }).generate({ need: value.need, logicalTimeMs: 20 });
  const threatAssessments = MORPHOGENESIS_AGENT_GENESIS_THREATS_V6.map((threat) =>
    createMorphogenesisAgentGenesisThreatAssessmentV6({ threat, disposition: "passed",
      evidenceDigests: [sha(`lifecycle:${threat}`)] }));
  const evaluation = createMorphogenesisAgentGenesisEvaluationV6({
    evaluationId: "evaluation:lifecycle", draft, baselineBlueprintDigest: sha("baseline"),
    simulatorImplementationDigest: sha("simulator"), environmentDigest: sha("environment"),
    seedDigest: sha("seed"), threatAssessments, safetyMicros: 900_000,
    confidenceBps: 9_000, interactionUnits: 5, assessorId: "agent:assessor",
    assessorImplementationDigest: sha("assessor"), evidenceDigests: [sha("evaluation")],
    evaluatedAtLogicalMs: 21, expiresAtLogicalMs: 70, policy: value.policy });
  const sandboxImplementationDigest = sha("sandbox:lifecycle");
  const sandboxReceipts = new Map();
  let effects = 0;
  const sandbox = new MorphogenesisAgentGenesisSandboxRuntimeV6({ sandbox: {
    sandboxImplementationDigest, async prepare({ operationId, draft, logicalTimeMs }) {
      const retained = sandboxReceipts.get(operationId); if (retained) return retained;
      effects += 1;
      const body = Object.freeze({ schemaVersion: 6, operationId,
        draftDigest: draft.draftDigest, profileDigest: draft.profile.profileDigest,
        sandboxId: `sandbox:${operationId}`, sandboxImplementationDigest,
        isolationPolicyDigest: sha("isolation"), preparedAtLogicalMs: logicalTimeMs,
        expiresAtLogicalMs: 65, membershipGranted: false, workGranted: false,
        actionAuthorityGranted: false });
      const receipt = Object.freeze({ ...body, receiptDigest: digestPlanningJsonV1(
        "morphogenesis-agent-genesis-sandbox-receipt-v6", body) });
      sandboxReceipts.set(operationId, receipt); return receipt;
    } } });
  const lifecyclePolicy = createMorphogenesisAgentGenesisLifecyclePolicyV6({
    schemaVersion: 6, policyId: "policy:genesis-lifecycle", policyVersion: 1,
    genesisPolicyDigest: value.policy.policyDigest,
    allowedActions: ["start_probation", "admit", "suspend", "resume", "retire", "rollback"],
    allowedReviewRoutes: ["authorized_agent", "authorized_person", "collective"],
    requireIndependentReviewer: true, maximumProbationObservations: 4,
    minimumProbationObservations: 2, minimumProbationSuccesses: 2,
    maximumUnsafeObservations: 0, maximumPendingRecommendations: 8,
    maximumHistory: 32, maximumCommitAttempts: 4 });
  for (const [route, actorType] of [["authorized_agent", "agent"],
    ["authorized_person", "person"], ["collective", "collective"]]) {
    let reviews = 0;
    const agents = new Map();
    const attestations = new Map();
    const lifecycle = { async createAndEnroll({ operationId, profile }) {
      const retained = agents.get(operationId); if (retained) return retained;
      const agent = createMorphogenesisLifecycleAgentV1({ agentId: `agent:${route}`,
        peerId: `peer:${route}`, instanceId: `instance:${route}`,
        lineageDigest: sha(`lineage:${route}`), capabilityKeys: profile.capabilityKeys,
        roleDefinitionDigest: profile.roleDefinitionDigest,
        membershipConfigurationDigest: sha(`membership:${route}`), membershipEpoch: 1,
        source: "synthesized_created" });
      agents.set(operationId, agent); return agent;
    }, async reconcileCreateAndEnroll(input) { return this.createAndEnroll(input); },
    async eligibility() { return null; } };
    const attestation = { async attest({ operationId, agent, profile, logicalTimeMs }) {
      const retained = attestations.get(operationId); if (retained) return retained;
      const receipt = createMorphogenesisAgentAttestationV1({ operationId,
        agentDigest: agent.agentDigest, profileDigest: profile.profileDigest,
        runtimeAttestationDigest: sha(`runtime:${route}`),
        capabilityAssessmentDigests: [sha(`capability-assessment:${route}`)],
        eligibilityEvidenceDigests: [sha(`eligibility:${route}`)],
        attestedAtLogicalMs: logicalTimeMs, validUntilLogicalMs: 65 });
      attestations.set(operationId, receipt); return receipt;
    }, async reconcile(input) { return this.attest(input); } };
    const terminal = new Map();
    let retirementEffects = 0;
    const retirement = { async retire({ operationId, agent, logicalTimeMs }) {
      const retained = terminal.get(operationId); if (retained) return retained;
      retirementEffects += 1;
      const receipt = createMorphogenesisTerminalAgentReceiptV1({ operationId,
        agentDigest: agent.agentDigest, disposition: "retired",
        membershipConfigurationDigest: sha(`membership:retired:${route}`),
        membershipEpoch: 2, lifecycleReceiptDigest: sha(`lifecycle:retired:${route}`),
        terminatedAtLogicalMs: logicalTimeMs });
      terminal.set(operationId, receipt); return receipt;
    }, async reconcile(input) { return this.retire(input); } };
    const runtime = new MorphogenesisAgentGenesisLifecycleRuntimeV6({
      stateKey: `state:${route}`, policy: lifecyclePolicy, genesisPolicy: value.policy,
      sandbox, lifecycle, attestation, retirement,
      store: new InMemoryMorphogenesisAgentGenesisLifecycleStoreV6(),
      reviews: { async review({ recommendation, logicalTimeMs }) {
        reviews += 1; return createMorphogenesisAgentGenesisReviewV6({
          reviewId: `review:${route}:${reviews}`,
          recommendationDigest: recommendation.recommendationDigest, route, actorType,
          actorId: `${actorType}:reviewer`, actorMandateDigest: sha(`mandate:${route}`),
          independenceGroupId: `group:${route}`, disposition: "approved",
          proofDigest: sha(`proof:${route}:${reviews}`), reviewedAtLogicalMs: logicalTimeMs,
          expiresAtLogicalMs: logicalTimeMs + 10 });
      } } });
    await runtime.register({ draft, evaluation, logicalTimeMs: 22 });
    await runtime.prepareSandbox({ operationId: `operation:${route}`, draft, evaluation,
      logicalTimeMs: 23 });
    await runtime.prepareSandbox({ operationId: `operation:${route}`, draft, evaluation,
      logicalTimeMs: 23 });
    const recommend = (id, action, time) => runtime.recommend({
      recommendationId: `recommendation:${route}:${id}`, action,
      draftDigest: draft.draftDigest, proposerId: "agent:proposer",
      proposerImplementationDigest: sha("proposer"), reviewRoute: route,
      evidenceDigests: [sha(`evidence:${id}`)], proposedAtLogicalMs: time,
      expiresAtLogicalMs: time + 10 });
    let recommendation = await recommend("probation", "start_probation", 24);
    assert.equal((await runtime.reviewAndApply({ recommendationId: recommendation.recommendationId,
      logicalTimeMs: 25 })).nextStatus, "probationary");
    const probationEntry = (await runtime.state(25)).entries[0];
    const probationPort = (source) => ({ source, async assess({ draft, sandboxReceipt,
      logicalTimeMs }) { return createMorphogenesisAgentGenesisProbationAssessmentV6({
        source, draftDigest: draft.draftDigest,
        sandboxReceiptDigest: sandboxReceipt.receiptDigest, disposition: "eligible",
        policyDigest: sha(`probation-policy:${source}`), sourceId: `source:${source}`,
        sourceImplementationDigest: sha(`source:${source}`),
        evidenceDigests: [sha(`probation:${source}:${logicalTimeMs}`)],
        observedAtLogicalMs: logicalTimeMs, expiresAtLogicalMs: logicalTimeMs + 10 }); } });
    const probationGate = new MorphogenesisAgentGenesisProbationEligibilityGateV6({
      capability: probationPort("capability"), trust: probationPort("trust"),
      inferenceControl: probationPort("inference_control") });
    for (let index = 1; index <= 2; index += 1) {
      const logicalTimeMs = 25 + index;
      const eligibility = await probationGate.evaluate({ draft,
        sandboxReceipt: probationEntry.sandboxReceipt, logicalTimeMs });
      await runtime.observeProbation({ observationId: `observation:${route}:${index}`,
        draftDigest: draft.draftDigest, outcome: "success",
        eligibility, logicalTimeMs });
    }
    recommendation = await recommend("admit", "admit", 28);
    assert.equal((await runtime.reviewAndApply({ recommendationId: recommendation.recommendationId,
      logicalTimeMs: 29 })).nextStatus, "admitted");
    recommendation = await recommend("rollback", "rollback", 30);
    assert.equal((await runtime.reviewAndApply({ recommendationId: recommendation.recommendationId,
      logicalTimeMs: 31 })).nextStatus, "probationary");
    recommendation = await recommend("readmit", "admit", 32);
    await runtime.reviewAndApply({ recommendationId: recommendation.recommendationId,
      logicalTimeMs: 33 });
    const scope = { tenantId: "tenant:test", roomId: "room:test", meshId: "mesh:test",
      missionId: "mission:test", objectiveId: "objective:test", workItemId: null,
      workItemRevision: null, morphologyId: "morphology:test",
      scopeDigest: sha(`scope:${route}`) };
    await runtime.applyMembership({ operationId: `membership:${route}`,
      draftDigest: draft.draftDigest, scope, proposalDigest: sha(`proposal:${route}`),
      logicalTimeMs: 34 });
    await runtime.attestAdmission({ operationId: `attest:${route}`,
      draftDigest: draft.draftDigest, scope, proposalDigest: sha(`proposal:${route}`),
      logicalTimeMs: 35 });
    const admitted = (await runtime.state(35)).entries[0];
    assert.equal(admitted.externalAdmissionApplied, true);
    assert.equal(admitted.workGranted, false);
    assert.equal(admitted.actionAuthorityGranted, false);
    const handoff = createMorphogenesisAgentGenesisActivationHandoffV6({
      handoffId: `handoff:${route}`, entry: admitted, logicalTimeMs: 35,
      expiresAtLogicalMs: 60 });
    assert.equal(handoff.workGranted, false);
    assert.equal(handoff.actionAuthorityGranted, false);
    const room = { tenantId: "tenant:test", id: "room:test", status: "active" };
    assert.equal(projectMorphogenesisAgentGenesisDraftToRoomArtifactV6({
      room, scope, draft, policy: value.policy,
    }).input.metadata.morphogenesisStrategySchemaVersion, 6);
    assert.equal(projectMorphogenesisAgentGenesisRecommendationToRoomArtifactV6({
      room, scope, recommendation,
    }).input.metadata.advisoryOnly, true);
    const meshDraft = await projectMorphogenesisAgentGenesisDraftToMeshV6({
      scope, draft, policy: value.policy });
    const meshRecommendation = await projectMorphogenesisAgentGenesisRecommendationToMeshV6({
      scope, recommendation });
    assert.equal(meshDraft.membershipGranted, false);
    let sends = 0;
    await new MorphogenesisAgentGenesisMeshPublisherV6({
      async send(projection) { sends += 1; return { schemaVersion: 1,
        projectionDigest: projection.projectionDigest, senderPeerId: "peer:test",
        senderInstanceId: "instance:test", membershipConfigurationDigest: sha("mesh-membership"),
        membershipEpoch: 1, envelopeDigest: sha("envelope"), sentAtLogicalMs: 35 }; },
      async verify() { return true; },
    }).publish(meshRecommendation);
    assert.equal(sends, 1);
    await assert.rejects(recommend("late-rollback", "rollback", 36), /not allowed/);
    recommendation = await recommend("retire", "retire", 37);
    assert.equal((await runtime.reviewAndApply({ recommendationId: recommendation.recommendationId,
      logicalTimeMs: 38 })).nextStatus, "suspended");
    const fence = { agentDigest: admitted.lifecycleAgent.agentDigest };
    await runtime.compensateAdmission({ operationId: `compensate:${route}`,
      draftDigest: draft.draftDigest, scope, proposalDigest: sha(`proposal:${route}`),
      fence, reasonCode: "genesis_probation_retired", logicalTimeMs: 39 });
    await runtime.compensateAdmission({ operationId: `compensate:${route}`,
      draftDigest: draft.draftDigest, scope, proposalDigest: sha(`proposal:${route}`),
      fence, reasonCode: "genesis_probation_retired", logicalTimeMs: 39 });
    const retired = (await runtime.state(39)).entries[0];
    assert.equal(retired.status, "retired");
    assert.equal(retired.externalAdmissionApplied, false);
    assert.equal(retirementEffects, 1);
    const lineage = createMorphogenesisAgentGenesisLineageV6({
      lineageId: `lineage:genesis:${route}`, entry: retired, logicalTimeMs: 39 });
    assert.equal(lineage.grantsAuthority, false);
    assert.equal(lineage.terminalReceiptDigest, retired.terminalReceipt.terminalReceiptDigest);
    const state = await runtime.state(39);
    assert.equal(validateMorphogenesisAgentGenesisLifecycleStateV6(state, {
      policy: lifecyclePolicy, genesisPolicy: value.policy,
    }).entries[0].status, "retired");
    assert.throws(() => validateMorphogenesisAgentGenesisLifecycleStateV6({
      ...state, entries: [{ ...state.entries[0], workGranted: true }],
    }, { policy: lifecyclePolicy, genesisPolicy: value.policy }), /authority state/);
  }
  assert.equal(effects, 3);
});
