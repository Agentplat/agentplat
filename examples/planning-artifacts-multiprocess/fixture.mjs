import assert from "node:assert/strict";
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
  createPlanningLocalWorkProjectionV1,
  planningWorkItemIdV1,
} from "@agentplat/collective-planning/mesh";

const digest = (domain, label) =>
  digestPlanningJsonV1(domain, { label, schemaVersion: 1 });

export function planningArtifactFixture() {
  const selectionPolicy = createPlanSelectionPolicyV1({
    schemaVersion: 1,
    selectionPolicyId: "policy:artifact-test",
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
    missionIntentId: "intent:artifact-test",
    revision: 1,
    predecessorDigest: null,
    tenantId: "tenant:artifact-test",
    policyDomainId: "policy-domain:artifact-test",
    objective: {
      schemaVersion: 1,
      meshId: "mesh:artifact-test",
      objectiveId: "objective:artifact-test",
      objectiveDocumentId: "objective-document:artifact-test",
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
    validFrom: "2029-01-01T00:00:00.000Z",
    validUntil: "2031-01-01T00:00:00.000Z",
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
    observationId: "observation:artifact-test",
    missionIntentId: missionIntent.missionIntentId,
    intentRevision: 1,
    intentDigest: missionIntent.intentDigest,
    observerPeerId: "peer:alpha",
    observerInstanceId: "instance:alpha:1",
    environmentCursor: "cursor:artifact-test",
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
    workDeadline: "2030-01-01T12:00:00.000Z",
    proposedAtLogicalMs: 10,
  });
  const apply = (command) => {
    const decision = reducePlanningCommandV1(
      state,
      createPlanningReducerCommandV1({
        schemaVersion: 1,
        expectedStateDigest: null,
        ...command,
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
  const active = state.planView.fragments.find(
    ({ status }) => status === "active",
  );
  assert.ok(active);
  apply({
    kind: "fragment.project-to-work",
    fragmentId: active.fragmentId,
    previousFragmentDigest: active.fragmentDigest,
    workTarget: {
      schemaVersion: 1,
      meshId: missionIntent.objective.meshId,
      objectiveId: missionIntent.objective.objectiveId,
      workItemId: planningWorkItemIdV1(proposal.proposalDigest),
      workItemRevision: 1,
    },
    transitionedAtLogicalMs: 10,
  });
  const fragment = state.planView.fragments.at(-1);
  assert.ok(fragment);
  const projection = createPlanningLocalWorkProjectionV1({
    missionIntent,
    sourcePlanView: state.planView,
    fragment,
  });
  return { missionIntent, state, projection };
}
