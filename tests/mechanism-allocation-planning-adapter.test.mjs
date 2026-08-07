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
import { createTeamFormationScopeV1 } from "@agentplat/collective-runtime/team-formation";
import { createMechanismDecompositionFromPlanningStateV1 } from "../packages/collective-runtime/dist/mechanism-allocation.js";

const digest = (label) =>
  digestPlanningJsonV1("planning-reducer-event", { label });

test("accepted peer-local planning heads become bounded mechanism slots", () => {
  const selectionPolicy = createPlanSelectionPolicyV1({
    schemaVersion: 1,
    selectionPolicyId: "planning.policy",
    revision: 1,
    scoringDimensions: [
      {
        schemaVersion: 1,
        dimension: "outcome_coverage",
        weight: 1,
        direction: "maximize",
      },
    ],
    hardConstraintKeys: ["budget", "dependencies"],
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
    missionIntentId: "intent.mechanism",
    revision: 1,
    predecessorDigest: null,
    tenantId: "tenant",
    policyDomainId: "domain",
    objective: {
      schemaVersion: 1,
      meshId: "mesh",
      objectiveId: "objective",
      objectiveDocumentId: "objective.document",
      objectiveRevision: 1,
      acceptedPolicyDigest: digest("objective.policy"),
    },
    mandateDigest: digest("mandate"),
    outcomeStatements: ["outcome.done"],
    permittedResourceClasses: ["resource.compute"],
    permittedCapabilityKeys: ["build"],
    planningLimits: {
      schemaVersion: 1,
      maximumCandidateFragments: 4,
      maximumActiveFragments: 4,
      maximumFragmentsPerPeer: 4,
      maximumRevisionsPerSemanticSlot: 2,
      maximumDependencyDepth: 4,
      maximumDependencyFanout: 4,
      maximumCapabilityTerms: 4,
      maximumOutcomeTerms: 4,
      maximumProposalBytes: 16_384,
      maximumSnapshotBytes: 131_072,
      maximumTraceBytes: 131_072,
      maximumTotalPlanningBudgetUnits: 20,
      maximumFragmentBudgetUnits: 20,
      budgetShardPolicy: "equal_mandate_subjects",
      maximumConcurrentProposals: 4,
      maximumActiveRoles: 4,
      proposalLogicalWindowMs: 100,
      observationLogicalWindowMs: 100,
      replanningLogicalWindowMs: 100,
    },
    selectionPolicyDigest: selectionPolicy.policyDigest,
    validFrom: "2026-01-01T00:00:00Z",
    validUntil: "2027-01-01T00:00:00Z",
  });
  let planning = createPlanningReducerStateV1({
    schemaVersion: 1,
    peerId: "peer.proposer",
    peerInstanceId: "instance.proposer",
    missionIntent,
    selectionPolicy,
    admittedSubjects: [
      {
        schemaVersion: 1,
        peerId: "peer.proposer",
        peerInstanceId: "instance.proposer",
      },
    ],
    logicalTimeMs: 10,
  });
  const observation = createMissionObservationV1({
    schemaVersion: 1,
    observationId: "observation.mechanism",
    missionIntentId: missionIntent.missionIntentId,
    intentRevision: 1,
    intentDigest: missionIntent.intentDigest,
    observerPeerId: "peer.proposer",
    observerInstanceId: "instance.proposer",
    environmentCursor: "cursor.mechanism",
    logicalTimeMs: 10,
    visibility: "public",
    observationKind: "work_available",
    publicValue: { available: true },
    contentReferenceDigest: null,
  });
  const fragmentProposal = createPlanFragmentProposalV1({
    schemaVersion: 1,
    proposalRevision: 1,
    missionIntentId: missionIntent.missionIntentId,
    intentRevision: 1,
    intentDigest: missionIntent.intentDigest,
    proposerPeerId: "peer.proposer",
    proposerInstanceId: "instance.proposer",
    semanticSlotKey: "slot.build",
    predecessorFragmentDigest: null,
    parentFragmentDigests: [],
    dependencyFragmentDigests: [],
    outcomeStatements: ["outcome.done"],
    roleKey: "build",
    requiredCapabilityKeys: ["build"],
    inputReferenceDigest: digest("input"),
    basisObservationDigests: [observation.observationDigest],
    requestedBudgetUnits: 10,
    workDeadline: "2026-01-02T00:00:00Z",
    proposedAtLogicalMs: 10,
  });
  const apply = (command) => {
    const result = reducePlanningCommandV1(planning, command);
    assert.equal(result.status, "applied", result.error?.message);
    planning = result.state;
  };
  apply(
    createPlanningReducerCommandV1({
      schemaVersion: 1,
      expectedStateDigest: null,
      kind: "observation.record",
      observation,
    }),
  );
  apply(
    createPlanningReducerCommandV1({
      schemaVersion: 1,
      expectedStateDigest: null,
      kind: "proposal.record",
      proposal: fragmentProposal,
    }),
  );
  apply(
    createPlanningReducerCommandV1({
      schemaVersion: 1,
      expectedStateDigest: null,
      kind: "slot.evaluate",
      semanticSlotKey: "slot.build",
      candidateProposalDigests: [fragmentProposal.proposalDigest],
      decidedAtLogicalMs: 10,
    }),
  );

  const decomposition = createMechanismDecompositionFromPlanningStateV1({
    proposalId: "mechanism.from.planning",
    planningState: planning,
    teamFormationScope: createTeamFormationScopeV1({
      tenantId: "tenant",
      meshId: "mesh",
      policyDomainId: "domain",
      missionIntentId: missionIntent.missionIntentId,
      objectiveId: "objective",
      rootWorkItemId: "root",
      rootWorkItemRevision: 1,
    }),
    missionEpoch: 1,
    causalEpoch: 1,
    proposerIndependenceGroupId: "group.proposer",
    proposerInstanceId: "instance.proposer",
    eligiblePeers: [
      {
        peerId: "peer.builder",
        independenceGroupId: "group.builder",
        capabilityKeys: ["build"],
      },
    ],
    parentProposalDigest: null,
    observedAtLogicalMs: 10,
    validUntilLogicalMs: 100,
  });

  assert.equal(decomposition.slots.length, 1);
  assert.equal(decomposition.slots[0].semanticRoleKey, "build");
  assert.deepEqual(decomposition.slots[0].eligiblePeerIds, ["peer.builder"]);
});
