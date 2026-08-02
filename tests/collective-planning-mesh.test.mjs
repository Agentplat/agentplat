import assert from "node:assert/strict";
import test from "node:test";

import {
  createMissionIntentV1,
  createMissionObservationV1,
  createPlanFragmentProposalV1,
  createPlanSelectionPolicyV1,
  createPlanningReducerCommandV1,
  createPlanningReducerStateV1,
  digestPlanningJsonV1,
  reducePlanningCommandV1,
} from "@agentplat/collective-planning";
import {
  InMemoryPlanningFragmentRepositoryV1,
  PLANNING_MESH_CAPABILITY_PROFILE_V1,
  PLANNING_WORK_EXTENSION_KEY_V1,
  createPlanningLocalWorkProjectionV1,
  createPlanningAdaptiveRoleV1,
  createPlanningMeshInboundProcessorV1,
  createPlanningWorkCancelCommandV1,
  createPlanningWorkReviseCommandV1,
  createReducerPlanningMeshAdmissionPortV1,
  planningWorkItemIdV1,
  selectPlanningOfferRecipientsV1,
  validatePlanningLocalWorkProjectionV1,
  validatePlanningWorkExtensionV1,
  validatePlanningWorkProjectionV1,
} from "@agentplat/collective-planning/mesh";
import {
  createMeshAllocationInboundRuntimeState,
  createMeshAllocationState,
  createMeshCoordinationInboundState,
  createMeshCoordinationState,
  createMeshDiscoveryState,
  createMeshObjectiveWorkState,
  restoreMeshCoordinationInboundState,
} from "@agentplat/mesh/coordination";

const digest = (domain, label) =>
  digestPlanningJsonV1(domain, { label, schemaVersion: 1 });

function fixture() {
  const selectionPolicy = createPlanSelectionPolicyV1({
    schemaVersion: 1,
    selectionPolicyId: "policy:mesh-test",
    revision: 1,
    scoringDimensions: [
      {
        schemaVersion: 1,
        dimension: "outcome_coverage",
        weight: 1,
        direction: "maximize",
      },
    ],
    hardConstraintKeys: ["budget"],
    acceptanceScoreThreshold: 1,
    challengeScoreThreshold: 0,
    tieBreakOrder: [
      "score",
      "requested_budget_units",
      "work_deadline",
      "proposed_at_logical_ms",
      "proposal_digest",
    ],
  });
  const missionIntent = createMissionIntentV1({
    schemaVersion: 1,
    missionIntentId: "intent:mesh-test",
    revision: 1,
    predecessorDigest: null,
    tenantId: "tenant:mesh-test",
    policyDomainId: "policy-domain:mesh-test",
    objective: {
      schemaVersion: 1,
      meshId: "mesh:mesh-test",
      objectiveId: "objective:mesh-test",
      objectiveDocumentId: "objective-document:mesh-test",
      objectiveRevision: 1,
      acceptedPolicyDigest: digest("mission-intent", "objective-policy"),
    },
    mandateDigest: digest("mission-intent", "mandate"),
    outcomeStatements: ["outcome.done"],
    permittedResourceClasses: ["resource.alpha"],
    permittedCapabilityKeys: ["capability.alpha"],
    planningLimits: {
      schemaVersion: 1,
      maximumCandidateFragments: 8,
      maximumActiveFragments: 4,
      maximumFragmentsPerPeer: 4,
      maximumRevisionsPerSemanticSlot: 8,
      maximumDependencyDepth: 4,
      maximumDependencyFanout: 2,
      maximumCapabilityTerms: 4,
      maximumOutcomeTerms: 4,
      maximumProposalBytes: 16_384,
      maximumSnapshotBytes: 131_072,
      maximumTraceBytes: 131_072,
      maximumTotalPlanningBudgetUnits: 40,
      maximumFragmentBudgetUnits: 20,
      budgetShardPolicy: "equal_mandate_subjects",
      maximumConcurrentProposals: 4,
      maximumActiveRoles: 4,
      proposalLogicalWindowMs: 20,
      observationLogicalWindowMs: 20,
      replanningLogicalWindowMs: 20,
    },
    selectionPolicyDigest: selectionPolicy.policyDigest,
    validFrom: "2026-01-01T00:00:00Z",
    validUntil: "2026-01-02T00:00:00Z",
  });
  let state = createPlanningReducerStateV1({
    schemaVersion: 1,
    peerId: "peer:alpha",
    peerInstanceId: "instance:alpha:1",
    missionIntent,
    selectionPolicy,
    admittedSubjects: [
      {
        schemaVersion: 1,
        peerId: "peer:alpha",
        peerInstanceId: "instance:alpha:1",
      },
      {
        schemaVersion: 1,
        peerId: "peer:beta",
        peerInstanceId: "instance:beta:1",
      },
    ],
    logicalTimeMs: 10,
  });
  const observation = createMissionObservationV1({
    schemaVersion: 1,
    observationId: "observation:mesh-test",
    missionIntentId: missionIntent.missionIntentId,
    intentRevision: 1,
    intentDigest: missionIntent.intentDigest,
    observerPeerId: "peer:alpha",
    observerInstanceId: "instance:alpha:1",
    environmentCursor: "cursor:mesh-test",
    logicalTimeMs: 10,
    visibility: "public",
    observationKind: "availability",
    publicValue: { available: true },
    contentReferenceDigest: null,
  });
  const proposal = createPlanFragmentProposalV1({
    schemaVersion: 1,
    proposalRevision: 1,
    missionIntentId: missionIntent.missionIntentId,
    intentRevision: 1,
    intentDigest: missionIntent.intentDigest,
    proposerPeerId: "peer:alpha",
    proposerInstanceId: "instance:alpha:1",
    semanticSlotKey: "slot.alpha",
    predecessorFragmentDigest: null,
    parentFragmentDigests: [],
    dependencyFragmentDigests: [],
    outcomeStatements: ["outcome.done"],
    roleKey: "role.alpha",
    requiredCapabilityKeys: ["capability.alpha"],
    inputReferenceDigest: digest("plan-fragment", "input"),
    basisObservationDigests: [observation.observationDigest],
    requestedBudgetUnits: 10,
    workDeadline: "2026-01-01T12:00:00Z",
    proposedAtLogicalMs: 10,
  });
  const apply = (input) => {
    const decision = reducePlanningCommandV1(
      state,
      createPlanningReducerCommandV1({
        schemaVersion: 1,
        expectedStateDigest: null,
        ...input,
      }),
    );
    assert.equal(decision.status, "applied", decision.error?.message);
    state = decision.state;
  };
  apply({ kind: "observation.record", observation });
  apply({ kind: "proposal.record", proposal });
  apply({
    kind: "slot.evaluate",
    semanticSlotKey: proposal.semanticSlotKey,
    candidateProposalDigests: [proposal.proposalDigest],
    decidedAtLogicalMs: 10,
  });
  let fragment = state.planView.fragments.find(
    (item) => item.status === "active",
  );
  const workItemId = planningWorkItemIdV1(proposal.proposalDigest);
  apply({
    kind: "fragment.project-to-work",
    fragmentId: fragment.fragmentId,
    previousFragmentDigest: fragment.fragmentDigest,
    workTarget: {
      schemaVersion: 1,
      meshId: missionIntent.objective.meshId,
      objectiveId: missionIntent.objective.objectiveId,
      workItemId,
      workItemRevision: 1,
    },
    transitionedAtLogicalMs: 10,
  });
  fragment = state.planView.fragments.at(-1);
  const projection = createPlanningLocalWorkProjectionV1({
    missionIntent,
    sourcePlanView: state.planView,
    fragment,
  });
  return { missionIntent, observation, proposal, state, fragment, projection };
}

test("planning Mesh extension and repository are strict, bounded and immutable", () => {
  const { projection } = fixture();
  assert.equal(
    PLANNING_WORK_EXTENSION_KEY_V1,
    "agentplat.collective-planning.fragment.v1",
  );
  assert.equal(Object.isFrozen(projection.extension), true);
  assert.throws(
    () =>
      validatePlanningWorkExtensionV1({
        ...projection.extension,
        downgradeAllowed: true,
      }),
    /unknown or missing/u,
  );
  const hostile = { ...projection.extension };
  Object.defineProperty(hostile, "missionIntentId", {
    enumerable: true,
    get() {
      throw new Error("must not execute");
    },
  });
  assert.throws(() => validatePlanningWorkExtensionV1(hostile), /data fields/u);

  const repository = new InMemoryPlanningFragmentRepositoryV1({
    maximumRecords: 1,
  });
  const first = repository.put(projection.repositoryRecord);
  assert.equal(repository.put(structuredClone(first)), first);
  assert.equal(repository.get(first.contentReference), first);
  assert.equal(Object.isFrozen(first), true);
  assert.throws(
    () =>
      repository.put({
        ...structuredClone(first),
        tenantId: "tenant:substitution",
      }),
    /binding is invalid/u,
  );
});

test("recipient selection requires current Card, View, exact planning profile and local support", () => {
  const profile = PLANNING_MESH_CAPABILITY_PROFILE_V1;
  const capability = {
    ownerPeerId: "peer:beta",
    instanceId: "instance:beta:1",
    advertisementId: "advertisement:planning:1",
    capabilityId: "capability:planning:1",
    capabilityRevision: 1,
    ...profile,
    acceptedMessageId: "message:capability:1",
    acceptedAt: 1,
    expiresAt: 100,
    validFrom: "2026-01-01T00:00:00Z",
    validUntil: "2026-01-02T00:00:00Z",
    validityVerifiedAt: "2026-01-01T00:00:00Z",
    status: "active",
  };
  const business = {
    ...capability,
    capabilityId: "capability:business:1",
    capabilityKey: "capability.alpha",
  };
  const discovery = {
    peerViews: {
      "peer:beta": {
        peerId: "peer:beta",
        peerCardId: "card:beta",
        cardRevision: 1,
        observedAt: 1,
        expiresAt: 100,
      },
    },
    peerCards: {
      "peer:beta": {
        peerId: "peer:beta",
        instanceId: "instance:beta:1",
        peerCardId: "card:beta",
        cardRevision: 1,
        protocolVersions: [1],
        transportHints: [],
        capabilityIds: [capability.capabilityId, business.capabilityId],
        validFrom: capability.validFrom,
        validUntil: capability.validUntil,
        validityVerifiedAt: capability.validFrom,
        acceptedMessageId: "message:card",
        acceptedAt: 1,
        expiresAt: 100,
        status: "active",
      },
    },
    capabilities: { planning: capability, business },
  };
  const input = {
    discovery,
    logicalTimeMs: 10,
    verifiedAt: "2026-01-01T01:00:00Z",
    localSupportedCriticalExtensions: [PLANNING_WORK_EXTENSION_KEY_V1],
    requiredCapabilityKeys: ["capability.alpha"],
    maximumRecipients: 1,
  };
  assert.deepEqual(
    selectPlanningOfferRecipientsV1(input).map((item) => item.peerId),
    ["peer:beta"],
  );
  assert.deepEqual(
    selectPlanningOfferRecipientsV1({
      ...input,
      localSupportedCriticalExtensions: [],
    }),
    [],
  );
  const downgraded = structuredClone(discovery);
  downgraded.capabilities.planning.version = "0";
  assert.deepEqual(
    selectPlanningOfferRecipientsV1({ ...input, discovery: downgraded }),
    [],
  );
});

test("reference local admission selects by proposalDigest and creates its own offered fragment", () => {
  const source = fixture();
  const port = createReducerPlanningMeshAdmissionPortV1();
  // Start from the same locally observed evidence, but before proposal/decision.
  let local = createPlanningReducerStateV1({
    schemaVersion: 1,
    peerId: "peer:beta",
    peerInstanceId: "instance:beta:1",
    missionIntent: source.missionIntent,
    selectionPolicy: source.state.selectionPolicy,
    admittedSubjects: source.state.admittedSubjects,
    logicalTimeMs: 10,
  });
  let result = reducePlanningCommandV1(
    local,
    createPlanningReducerCommandV1({
      schemaVersion: 1,
      kind: "observation.record",
      expectedStateDigest: null,
      observation: source.observation,
    }),
  );
  assert.equal(result.status, "applied");
  local = result.state;
  const offer = {
    type: "work.offer",
    offerId: "offer:1",
    objectiveId: source.missionIntent.objective.objectiveId,
    objectiveDocumentId: source.missionIntent.objective.objectiveDocumentId,
    objectiveRevision: 1,
    workItemId: source.projection.workItemId,
    workItemRevision: 1,
    ownerPeerId: source.proposal.proposerPeerId,
    ownerEpoch: 1,
    offerAttempt: 1,
    requiredCapabilityKeys: source.fragment.requiredCapabilityKeys,
    matchingAttributes: {},
    completionCriteria: source.fragment.outcomeStatements,
    budgetReservationUnits: source.fragment.requestedBudgetUnits,
    bidDeadline: "2026-01-01T01:00:00Z",
    workDeadline: source.fragment.workDeadline,
    inputReference: source.projection.repositoryRecord.contentReference,
  };
  validatePlanningWorkProjectionV1({
    intent: source.missionIntent,
    record: source.projection.repositoryRecord,
    extension: source.projection.extension,
    offer,
  });
  assert.throws(
    () =>
      validatePlanningWorkProjectionV1({
        intent: source.missionIntent,
        record: source.projection.repositoryRecord,
        extension: source.projection.extension,
        offer: { ...offer, workItemRevision: 2 },
      }),
    /does not match its evidence/u,
  );
  const admitted = port.evaluate(local, {
    proposal: source.proposal,
    sourceDecision: source.projection.repositoryRecord.decision,
    sourceFragment: source.fragment,
    sourcePlanView: source.state.planView,
    extension: source.projection.extension,
    workOffer: offer,
    workItemId: offer.workItemId,
    workItemRevision: 1,
    receivedAtLogicalMs: 10,
  });
  assert.equal(admitted.accepted, true);
  const localFragment = admitted.state.planView.fragments.at(-1);
  assert.equal(localFragment.proposalDigest, source.fragment.proposalDigest);
  assert.equal(localFragment.status, "offered");
  assert.notEqual(localFragment.fragmentDigest, source.fragment.fragmentDigest);
});

test("non-planning allocation decisions remain unchanged and do not consult planning ports", async () => {
  const source = fixture();
  const candidateMesh = { marker: "candidate" };
  const envelope = { payload: { type: "work.bid" } };
  let repositoryReads = 0;
  let admissions = 0;
  const processor = createPlanningMeshInboundProcessorV1({
    processor: {
      async process() {
        return {
          accepted: true,
          duplicate: false,
          envelope,
          state: candidateMesh,
        };
      },
    },
    repository: {
      get() {
        repositoryReads += 1;
        return null;
      },
      put(value) {
        return value;
      },
    },
    admission: {
      evaluate(state) {
        admissions += 1;
        return { accepted: false, code: "unexpected", state };
      },
    },
  });
  const decision = await processor.process(
    { mesh: { marker: "original" }, planning: source.state },
    {},
  );
  assert.equal(decision.accepted, true);
  assert.equal(decision.state.mesh, candidateMesh);
  assert.equal(decision.state.planning, source.state);
  assert.equal(repositoryReads, 0);
  assert.equal(admissions, 0);
});

test("planning downgrade rejection retains only candidate replay/message-ID state", async () => {
  const source = fixture();
  const identity = {
    tenantId: source.missionIntent.tenantId,
    meshId: source.missionIntent.objective.meshId,
    peerId: "peer:beta",
    instanceId: "instance:beta:1",
    keyId: "key:beta:1",
  };
  const coordination = createMeshCoordinationState({ identity });
  const discovery = createMeshDiscoveryState({ identity });
  const objectives = createMeshObjectiveWorkState({ identity });
  const allocation = createMeshAllocationState({ identity });
  const originalInbound = createMeshCoordinationInboundState({ identity });
  const candidateInbound = restoreMeshCoordinationInboundState({
    ...structuredClone(originalInbound),
    messageIds: { aaaaaaaaaaaaaaaaaaaaaA: 11 },
    lastLogicalTime: 10,
  });
  const originalMesh = createMeshAllocationInboundRuntimeState(
    coordination,
    discovery,
    objectives,
    allocation,
    originalInbound,
  );
  const candidateMesh = createMeshAllocationInboundRuntimeState(
    coordination,
    discovery,
    objectives,
    allocation,
    candidateInbound,
  );
  const envelope = {
    sender: { peerId: "peer:alpha", instanceId: "instance:alpha:1" },
    payload: {
      type: "work.offer",
      inputReference: source.projection.repositoryRecord.contentReference,
    },
  };
  const processor = createPlanningMeshInboundProcessorV1({
    processor: {
      async process() {
        return {
          accepted: true,
          duplicate: false,
          envelope,
          state: candidateMesh,
        };
      },
    },
    repository: {
      get() {
        throw new Error("missing critical extension must reject first");
      },
      put(value) {
        return value;
      },
    },
  });
  const decision = await processor.process(
    { mesh: originalMesh, planning: source.state },
    { receivedAt: 10 },
  );
  assert.equal(decision.accepted, false);
  assert.equal(decision.code, "planning_extension_required");
  assert.equal(decision.state.mesh.coordination, originalMesh.coordination);
  assert.equal(decision.state.mesh.discovery, originalMesh.discovery);
  assert.equal(decision.state.mesh.objectives, originalMesh.objectives);
  assert.equal(decision.state.mesh.allocation, originalMesh.allocation);
  assert.equal(decision.state.mesh.inbound, candidateInbound);
  assert.equal(decision.state.planning, source.state);

  envelope.payload.inputReference = "urn:example:ordinary-work";
  envelope.payload.objectiveId = source.missionIntent.objective.objectiveId;
  const unmarkedPlanningObjective = await processor.process(
    { mesh: originalMesh, planning: source.state },
    { receivedAt: 10 },
  );
  assert.equal(unmarkedPlanningObjective.accepted, false);
  assert.equal(unmarkedPlanningObjective.code, "planning_extension_required");
  assert.equal(unmarkedPlanningObjective.state.mesh.objectives, objectives);
  assert.equal(unmarkedPlanningObjective.state.mesh.allocation, allocation);
  assert.equal(unmarkedPlanningObjective.state.planning, source.state);
});

test("role and Work revision composition require the exact current mapping", () => {
  const source = fixture();
  assert.equal(
    validatePlanningLocalWorkProjectionV1(source.projection).workItemId,
    source.projection.workItemId,
  );
  assert.throws(
    () =>
      validatePlanningLocalWorkProjectionV1({
        ...source.projection,
        work: {
          ...source.projection.work,
          inputReference:
            "urn:agentplat:collective-planning:fragment:substituted",
        },
      }),
    /inconsistent/u,
  );
  assert.throws(
    () =>
      createPlanningAdaptiveRoleV1({
        missionIntent: source.missionIntent,
        planView: source.state.planView,
        fragment: source.fragment,
        repositoryRecord: source.projection.repositoryRecord,
        extension: source.projection.extension,
        roleBindingId: "role-binding:test:1",
        targetStatus: "assigned",
        source: {
          roleKey: source.fragment.roleKey,
          workItem: {
            workItemId: source.projection.workItemId,
            workItemRevision: 2,
            requiredCapabilityKeys: source.fragment.requiredCapabilityKeys,
            completionCriteria: source.fragment.outcomeStatements,
            budgetReservationUnits: source.fragment.requestedBudgetUnits,
            workDeadline: source.fragment.workDeadline,
          },
        },
      }),
    /current mapping/u,
  );
  assert.throws(
    () =>
      createPlanningAdaptiveRoleV1({
        missionIntent: source.missionIntent,
        planView: source.state.planView,
        fragment: source.fragment,
        repositoryRecord: source.projection.repositoryRecord,
        extension: source.projection.extension,
        roleBindingId: "role-binding:test:input-substitution",
        targetStatus: "assigned",
        source: {
          roleKey: source.fragment.roleKey,
          workItem: {
            workItemId: source.projection.workItemId,
            workItemRevision: 1,
            inputReference:
              "urn:agentplat:collective-planning:fragment:substituted",
            requiredCapabilityKeys: source.fragment.requiredCapabilityKeys,
            completionCriteria: source.fragment.outcomeStatements,
            budgetReservationUnits: source.fragment.requestedBudgetUnits,
            workDeadline: source.fragment.workDeadline,
          },
        },
      }),
    /current mapping/u,
  );
  assert.throws(
    () =>
      createPlanningWorkReviseCommandV1({
        projection: source.projection,
        expectedWorkItemRevision: 1,
      }),
    /exact successor/u,
  );
  const cancellation = createPlanningWorkCancelCommandV1({
    missionIntent: source.missionIntent,
    planView: source.state.planView,
    fragment: source.fragment,
  });
  assert.deepEqual(cancellation, {
    fragmentDigest: source.fragment.fragmentDigest,
    command: {
      kind: "work.cancel",
      objectiveId: source.missionIntent.objective.objectiveId,
      workItemId: source.projection.workItemId,
      expectedWorkItemRevision: 1,
    },
  });
});
