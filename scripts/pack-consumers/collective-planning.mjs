import assert from "node:assert/strict";

import {
  COLLECTIVE_PLANNING_SCHEMA_VERSION,
  canonicalizePlanningJsonV1,
  createPlanSelectionPolicyV1,
  createMissionIntentV1,
  createMissionObservationV1,
  createPlanningReducerCommandV1,
  createPlanningReducerEventV1,
  createPlanningReducerSnapshotV1,
  createPlanningReducerStateV1,
  digestPlanningJsonV1,
  planningReducerEventDigestV1,
  reducePlanningCommandV1,
  replayPlanningCommandsV1,
  restorePlanningReducerSnapshotV1,
  validatePlanningReducerCommandV1,
  validatePlanningReducerEventV1,
  validatePlanningReducerSnapshotV1,
  validatePlanningReducerStateV1,
  validateMissionObservationV1,
} from "@agentplat/collective-planning";

assert.equal(COLLECTIVE_PLANNING_SCHEMA_VERSION, 1);
assert.equal(
  canonicalizePlanningJsonV1({ z: 2, a: [true, null, -0] }),
  '{"a":[true,null,0],"z":2}',
);

const intentDigest = digestPlanningJsonV1("mission-intent", {
  missionIntentId: "mission:registry-consumer",
  schemaVersion: 1,
});
const observation = createMissionObservationV1({
  schemaVersion: 1,
  observationId: "observation:registry-consumer",
  missionIntentId: "mission:registry-consumer",
  intentRevision: 1,
  intentDigest,
  observerPeerId: "peer:registry-consumer",
  observerInstanceId: "instance:registry-consumer",
  environmentCursor: "cursor:1",
  logicalTimeMs: 1,
  visibility: "public",
  observationKind: "registry_smoke",
  publicValue: { available: true },
  contentReferenceDigest: null,
});

const policy = createPlanSelectionPolicyV1({
  schemaVersion: 1,
  selectionPolicyId: "policy:registry-consumer",
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
  missionIntentId: "intent:registry-consumer",
  revision: 1,
  predecessorDigest: null,
  tenantId: "tenant:registry-consumer",
  policyDomainId: "policy-domain:registry-consumer",
  objective: {
    schemaVersion: 1,
    meshId: "mesh:registry-consumer",
    objectiveId: "objective:registry-consumer",
    objectiveDocumentId: "objective-document:registry-consumer",
    objectiveRevision: 1,
    acceptedPolicyDigest: intentDigest,
  },
  mandateDigest: intentDigest,
  outcomeStatements: ["outcome.done"],
  permittedResourceClasses: ["resource.alpha"],
  permittedCapabilityKeys: ["capability.alpha"],
  planningLimits: {
    schemaVersion: 1,
    maximumCandidateFragments: 4,
    maximumActiveFragments: 2,
    maximumFragmentsPerPeer: 2,
    maximumRevisionsPerSemanticSlot: 2,
    maximumDependencyDepth: 2,
    maximumDependencyFanout: 2,
    maximumCapabilityTerms: 2,
    maximumOutcomeTerms: 2,
    maximumProposalBytes: 16_384,
    maximumSnapshotBytes: 65_536,
    maximumTraceBytes: 65_536,
    maximumTotalPlanningBudgetUnits: 20,
    maximumFragmentBudgetUnits: 10,
    budgetShardPolicy: "equal_mandate_subjects",
    maximumConcurrentProposals: 2,
    maximumActiveRoles: 2,
    proposalLogicalWindowMs: 20,
    observationLogicalWindowMs: 20,
    replanningLogicalWindowMs: 20,
  },
  selectionPolicyDigest: policy.policyDigest,
  validFrom: "2026-01-01T00:00:00Z",
  validUntil: "2026-01-02T00:00:00Z",
});
const state = createPlanningReducerStateV1({
  schemaVersion: 1,
  peerId: "peer:registry-consumer",
  peerInstanceId: "instance:registry-consumer",
  missionIntent,
  selectionPolicy: policy,
  admittedSubjects: [
    {
      schemaVersion: 1,
      peerId: "peer:registry-consumer",
      peerInstanceId: "instance:registry-consumer",
    },
  ],
  logicalTimeMs: 1,
});
const reducerCommand = createPlanningReducerCommandV1({
  schemaVersion: 1,
  kind: "logical-time.advance",
  expectedStateDigest: null,
  logicalTimeMs: 2,
});
assert.deepEqual(
  validatePlanningReducerCommandV1(reducerCommand),
  reducerCommand,
);
const reduced = reducePlanningCommandV1(state, reducerCommand);
assert.equal(reduced.status, "applied");
assert.deepEqual(validatePlanningReducerStateV1(reduced.state), reduced.state);
assert.equal(reduced.events.length, 1);
const reducerEvent = reduced.events[0];
assert.deepEqual(validatePlanningReducerEventV1(reducerEvent), reducerEvent);
const reducerEventInput = {
  schemaVersion: reducerEvent.schemaVersion,
  kind: reducerEvent.kind,
  commandId: reducerEvent.commandId,
  commandDigest: reducerEvent.commandDigest,
  previousStateDigest: reducerEvent.previousStateDigest,
  resultingStateDigest: reducerEvent.resultingStateDigest,
  subjectId: reducerEvent.subjectId,
  subjectDigest: reducerEvent.subjectDigest,
};
assert.equal(
  planningReducerEventDigestV1({
    ...reducerEventInput,
    eventId: reducerEvent.eventId,
  }),
  reducerEvent.eventDigest,
);
assert.deepEqual(createPlanningReducerEventV1(reducerEventInput), reducerEvent);
const reducerSnapshot = createPlanningReducerSnapshotV1(reduced.state);
assert.deepEqual(
  validatePlanningReducerSnapshotV1(reducerSnapshot),
  reducerSnapshot,
);
assert.equal(
  restorePlanningReducerSnapshotV1(reduced.state, reducerSnapshot).stateDigest,
  reduced.state.stateDigest,
);
assert.equal(
  replayPlanningCommandsV1(state, [reducerCommand]).stateDigest,
  reduced.state.stateDigest,
);

assert.deepEqual(validateMissionObservationV1(observation), observation);
assert.equal(Object.isFrozen(observation), true);
assert.match(observation.observationDigest, /^sha256:[0-9a-f]{64}$/u);

process.stdout.write(
  `${JSON.stringify({ status: "passed", observationDigest: observation.observationDigest, stateDigest: reduced.state.stateDigest })}\n`,
);
