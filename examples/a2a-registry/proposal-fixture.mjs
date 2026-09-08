import {
  createMorphogenesisBudgetEnvelopeV1,
  createMorphogenesisCatalogLifecycleProcessDefinitionV1,
  createMorphogenesisNeedV1,
  createMorphogenesisOperationV1,
  createMorphogenesisPolicyV1,
  createMorphogenesisProposalV1,
  createMorphogenesisScopeV1,
  createMorphologyComponentReferenceV1,
  createMorphologySnapshotV1,
  createMorphologySourceHeadV1,
  createTargetMorphologyPositionV1,
  createTargetMorphologyV1,
} from "../../packages/collective-runtime/dist/morphogenesis.js";
const sha = (character) => `sha256:${character.repeat(64)}`;
export function proposalFixture(selectionDigest) {
  const policy = createMorphogenesisPolicyV1({
    schemaVersion: 1,
    policyId: "policy:morphogenesis:test",
    policyVersion: 1,
    parentPolicyDigest: null,
    requiredSourceClasses: ["work", "team", "mission", "membership"],
    allowedOperators: [
      "retire_agent",
      "instantiate_agent",
      "recruit_existing",
      "detach_agent",
    ],
    allowedDecisionRoutes: ["authorized_person", "authorized_agent"],
    requireIndependentDecider: true,
    allowAgentCreation: true,
    maximumPopulation: 16,
    maximumNewAgentsPerProposal: 2,
    maximumResourceUnitsPerProposal: 1_000,
    minimumNeedSeverityBps: 5_000,
    limits: {
      maximumSourceHeads: 16,
      maximumComponents: 128,
      maximumPositions: 16,
      maximumAgentDispositions: 32,
      maximumOperations: 32,
      maximumDependenciesPerOperation: 8,
      maximumEvidenceDigests: 16,
      maximumInvariantDigests: 16,
      maximumProposalTtlMs: 500,
      maximumNeedTtlMs: 1_000,
      maximumSourceFreshnessMs: 200,
      maximumCommitAttempts: 4,
      maximumTransformationsPerWindow: 4,
      transformationWindowMs: 10_000,
      cooldownMs: 500,
      hysteresisBps: 500,
    },
  });
  const scope = createMorphogenesisScopeV1({
    tenantId: "tenant",
    morphologyId: "morphology:test",
    policyDomainId: "policy-domain:test",
    missionId: "mission:test",
    missionIntentId: "mission-intent:test",
    objectiveId: "objective:test",
    meshId: "mesh:test",
    roomId: "room:test",
    workItemId: "work:test",
    workItemRevision: 1,
  });
  const sourceHeads = ["mission", "membership", "team", "work"].map(
    (sourceClass, index) =>
      createMorphologySourceHeadV1({
        sourceHeadId: `source-head:${sourceClass}`,
        sourceClass,
        sourceId: `source:${sourceClass}`,
        sourceVersion: 1,
        sourceImplementationDigest: sha(String(index + 1)),
        sourceRevision: 3,
        sourceRecordDigest: sha(String(index + 5)),
        scopeDigest: scope.scopeDigest,
        authenticationEvidenceDigest: sha((index + 9).toString(16)),
        required: true,
        observedAtLogicalMs: 100,
        expiresAtLogicalMs: 500,
      }),
  );
  const components = sourceHeads.map((head, index) =>
    createMorphologyComponentReferenceV1({
      componentKind:
        head.sourceClass === "mission"
          ? "artifact"
          : head.sourceClass === "membership"
            ? "membership"
            : head.sourceClass === "team"
              ? "team"
              : "work_contract",
      componentId: `component:${head.sourceClass}`,
      sourceHeadDigest: head.sourceHeadDigest,
      recordDigest: sha("def0"[index]),
      revision: 3,
      epoch: index + 1,
    }),
  );
  const snapshot = createMorphologySnapshotV1({
    snapshotId: "snapshot:test:1",
    scope,
    morphologyEpoch: 1,
    previousMorphologyDigest: null,
    policy,
    implementationDigest: sha("a"),
    sourceHeads: [...sourceHeads].reverse(),
    components: [...components].reverse(),
    population: {
      activeAgents: 2,
      dormantAgents: 0,
      activeTeams: 1,
      concurrentlyProvisioningAgents: 0,
    },
    resources: {
      configuredResourceUnits: 100,
      reservedResourceUnits: 20,
      consumedInteractionUnits: 10,
    },
    observedAtLogicalMs: 200,
    logicalTimeHighWaterMs: 200,
  });
  const need = createMorphogenesisNeedV1(
    {
      needId: "need:test:1",
      scopeDigest: scope.scopeDigest,
      currentSnapshotDigest: snapshot.snapshotDigest,
      reasonCode: "missing_capability",
      severityBps: 7_500,
      boundedViewDigest: sha("0"),
      candidateSearchLimit: 32,
      evidenceDigests: [sourceHeads[3].sourceHeadDigest, selectionDigest],
      detectedAtLogicalMs: 210,
      expiresAtLogicalMs: 600,
    },
    policy,
  );
  const position = createTargetMorphologyPositionV1({
    positionId: "position:database-forensics",
    roleKey: "research",
    requiredCapabilityKeys: ["research"],
    dependsOnPositionIds: [],
    fillMode: "recruit_existing",
    currentAgentId: null,
    instantiationProfileDigest: null,
    resourceBudgetUnits: 10,
    maximumActionBudgetUnits: 5,
  });
  const target = createTargetMorphologyV1(
    {
      targetId: "target:test:1",
      scopeDigest: scope.scopeDigest,
      currentSnapshotDigest: snapshot.snapshotDigest,
      expectedCurrentEpoch: 1,
      positions: [position],
      agentDispositions: [],
      invariantDigests: [sha("c")],
      estimatedActiveAgents: 3,
      estimatedNewAgents: 0,
      estimatedResourceUnits: 10,
    },
    policy,
  );
  const operation = createMorphogenesisOperationV1(
    {
      operationId: "operation:instantiate:1",
      operator: "recruit_existing",
      effectClass: "protected_external",
      dependsOnOperationIds: [],
      targetReferenceDigest: position.positionDigest,
      compensation: "release_budget",
    },
    policy,
  );
  const budget = createMorphogenesisBudgetEnvelopeV1({
    maximumActiveAgents: 3,
    maximumNewAgents: 1,
    maximumConcurrentProvisioning: 1,
    maximumResourceUnits: 10,
    maximumInteractionUnits: 100,
    maximumActionUnits: 10,
    maximumInputTokens: 100,
    maximumOutputTokens: 100,
    maximumTotalTokens: 200,
    maximumDurationMs: 1_000,
    maximumCosts: [{ currency: "USD", micros: 1_000_000 }],
  });
  const proposalInput = {
    proposalId: "proposal:test:1",
    scopeDigest: scope.scopeDigest,
    currentSnapshotDigest: snapshot.snapshotDigest,
    expectedCurrentEpoch: 1,
    needDigest: need.needDigest,
    targetDigest: target.targetDigest,
    operations: [operation],
    processDefinitionDigest:
      createMorphogenesisCatalogLifecycleProcessDefinitionV1().definitionDigest,
    budget,
    decisionRoute: "authorized_agent",
    proposerId: "agent:planner",
    proposerVersion: 1,
    proposerImplementationDigest: sha("e"),
    proposedAtLogicalMs: 220,
    expiresAtLogicalMs: 500,
  };
  const proposal = createMorphogenesisProposalV1(proposalInput, {
    policy,
    snapshot,
    need,
    target,
  });
  return { input: proposalInput, context: { policy, snapshot, need, target } };
}
