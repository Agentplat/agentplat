import assert from "node:assert/strict";
import test from "node:test";

import {
  createAdaptiveRoleBindingV1,
  createMissionIntentV1,
  createMissionObservationV1,
  createPlanFragmentDecisionV1,
  createPlanFragmentV1,
  createPlanSelectionPolicyV1,
  createPlanningReducerCommandV1,
  createPlanningReducerStateV1,
  digestPlanningJsonV1,
  reducePlanningCommandV1,
} from "@agentplat/collective-planning";
import {
  workContractDigestV1,
  validateWorkContractV1,
} from "@agentplat/collective-control";
import { CollectivePeerRuntimeV1 } from "@agentplat/collective-runtime/peer";
import {
  PortableAgentAdapterRegistryV1,
  PortableAgentSessionRuntimeV1,
} from "@agentplat/runtime/adapter";

const planningDigest = (domain, label) =>
  digestPlanningJsonV1(domain, { schemaVersion: 1, label });

function planningFixture() {
  const policy = createPlanSelectionPolicyV1({
    schemaVersion: 1,
    selectionPolicyId: "policy:peer-runtime",
    revision: 1,
    scoringDimensions: [
      {
        schemaVersion: 1,
        dimension: "outcome_coverage",
        weight: 1,
        direction: "maximize",
      },
    ],
    hardConstraintKeys: ["authority"],
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
  const intent = createMissionIntentV1({
    schemaVersion: 1,
    missionIntentId: "intent:peer-runtime",
    revision: 1,
    predecessorDigest: null,
    tenantId: "tenant:a",
    policyDomainId: "policy-domain:a",
    objective: {
      schemaVersion: 1,
      meshId: "mesh:a",
      objectiveId: "objective:a",
      objectiveDocumentId: "objective-document:a",
      objectiveRevision: 1,
      acceptedPolicyDigest: planningDigest(
        "mission-intent",
        "objective-policy",
      ),
    },
    mandateDigest: planningDigest("mission-intent", "mandate"),
    outcomeStatements: ["Inspect the local sector"],
    permittedResourceClasses: ["sensor"],
    permittedCapabilityKeys: ["capability.observe"],
    planningLimits: {
      schemaVersion: 1,
      maximumCandidateFragments: 8,
      maximumActiveFragments: 4,
      maximumFragmentsPerPeer: 4,
      maximumRevisionsPerSemanticSlot: 4,
      maximumDependencyDepth: 4,
      maximumDependencyFanout: 4,
      maximumCapabilityTerms: 4,
      maximumOutcomeTerms: 4,
      maximumProposalBytes: 16_384,
      maximumSnapshotBytes: 131_072,
      maximumTraceBytes: 131_072,
      maximumTotalPlanningBudgetUnits: 100,
      maximumFragmentBudgetUnits: 50,
      budgetShardPolicy: "equal_mandate_subjects",
      maximumConcurrentProposals: 4,
      maximumActiveRoles: 4,
      proposalLogicalWindowMs: 100,
      observationLogicalWindowMs: 100,
      replanningLogicalWindowMs: 100,
    },
    selectionPolicyDigest: policy.policyDigest,
    validFrom: "2026-08-01T00:00:00.000Z",
    validUntil: "2026-08-02T00:00:00.000Z",
  });
  const observation = createMissionObservationV1({
    schemaVersion: 1,
    observationId: "observation:peer-runtime",
    missionIntentId: intent.missionIntentId,
    intentRevision: intent.revision,
    intentDigest: intent.intentDigest,
    observerPeerId: "peer:a",
    observerInstanceId: "instance:a:1",
    environmentCursor: "cursor:1",
    logicalTimeMs: 10,
    visibility: "resource",
    observationKind: "sensor.available",
    publicValue: { sector: "north", sensorAvailable: true },
    contentReferenceDigest: null,
  });
  let state = createPlanningReducerStateV1({
    schemaVersion: 1,
    peerId: "peer:a",
    peerInstanceId: "instance:a:1",
    missionIntent: intent,
    selectionPolicy: policy,
    admittedSubjects: [
      {
        schemaVersion: 1,
        peerId: "peer:a",
        peerInstanceId: "instance:a:1",
      },
    ],
    logicalTimeMs: 10,
  });
  const recorded = reducePlanningCommandV1(
    state,
    createPlanningReducerCommandV1({
      schemaVersion: 1,
      kind: "observation.record",
      expectedStateDigest: state.stateDigest,
      observation,
    }),
  );
  assert.equal(recorded.status, "applied");
  state = recorded.state;
  return {
    intent,
    observation,
    view: state.planView,
    inputReferenceDigest: planningDigest(
      "plan-fragment-proposal",
      "north-input",
    ),
  };
}

function portableRuntime(currentness) {
  const registry = new PortableAgentAdapterRegistryV1().register({
    manifest: {
      schemaVersion: 1,
      adapterId: "portable-peer-agent",
      adapterVersion: "1.0.0",
      implementationId: "portable-peer-agent-build-1",
      agentKinds: ["language_model"],
      inputModalities: ["structured"],
      outputModalities: ["structured", "text"],
      interactionModes: ["invoke"],
      controlPoints: ["post_output", "pre_step"],
      supportsCancellation: true,
      supportsCheckpoint: false,
      supportsRestore: false,
      maximumObservationBytes: 1_000_000,
      maximumOutputBytes: 1_000_000,
      maximumActionBytes: 1_000_000,
      maximumStepsPerSession: 100,
    },
    adapter: {
      async step(input) {
        if (input.role.roleKey === "collective.planner") {
          const observationDigest =
            input.request.observations[0].provenance.missionObservationDigest;
          return completed(input, {
            schemaVersion: 1,
            disposition: "propose",
            proposalRevision: 1,
            semanticSlotKey: "slot.north",
            predecessorFragmentDigest: null,
            parentFragmentDigests: [],
            dependencyFragmentDigests: [],
            outcomeStatements: ["Inspect the local sector"],
            roleKey: "observer",
            requiredCapabilityKeys: ["capability.observe"],
            inputReferenceDigest:
              input.request.input.allowedInputReferenceDigests[0],
            basisObservationDigests: [observationDigest],
            requestedBudgetUnits: 10,
            workDeadline: "2026-08-01T12:00:00.000Z",
          });
        }
        return completed(input, "Local inspection complete.", "text");
      },
    },
  });
  const sessions = new PortableAgentSessionRuntimeV1({
    registry,
    control: {
      controlId: "peer-control",
      controlVersion: 1,
      implementationId: "peer-control-build-1",
      evaluate: () => ({ disposition: "allow", reasonCode: "allowed" }),
    },
    clock: sequentialClock(),
  });
  return {
    sessions,
    peer: new CollectivePeerRuntimeV1({ sessions, currentness }),
  };
}

function currentness(check = () => ({ current: true, reasonCode: "current" })) {
  return {
    currentnessId: "mesh-currentness",
    currentnessVersion: 1,
    implementationId: "mesh-currentness-build-1",
    check,
  };
}

function agent(sessionId, outputModalities = ["structured"]) {
  return {
    sessionId,
    peerId: "peer:a",
    peerInstanceId: "instance:a:1",
    agentId: "agent:local-planner-worker",
    adapterId: "portable-peer-agent",
    adapterVersion: "1.0.0",
    requirements: {
      agentKinds: ["language_model"],
      inputModalities: ["structured"],
      outputModalities,
      interactionMode: "invoke",
      controlPoints: ["post_output", "pre_step"],
      requireCancellation: true,
    },
  };
}

test("peer-local model output becomes a bounded planning proposal, not authority", async () => {
  const fixture = planningFixture();
  const { peer } = portableRuntime(currentness());

  const outcome = await peer.plan({
    tenant: { tenantId: "tenant:a" },
    agent: agent("planning-session"),
    missionIntent: fixture.intent,
    planView: fixture.view,
    observations: [fixture.observation],
    allowedInputReferenceDigests: [fixture.inputReferenceDigest],
    stepId: "planning-step-1",
    logicalTimeMs: 10,
    roleValidFromLogicalMs: 0,
    roleValidUntilLogicalMs: 1_000,
    metadata: {
      allowedInputReferenceDigest: fixture.inputReferenceDigest,
    },
  });

  assert.equal(outcome.status, "proposed");
  assert.equal(outcome.proposal.proposerPeerId, "peer:a");
  assert.equal(outcome.proposal.intentDigest, fixture.intent.intentDigest);
  assert.deepEqual(outcome.proposal.basisObservationDigests, [
    fixture.observation.observationDigest,
  ]);
  assert.equal("assignmentAuthorityId" in outcome.proposal, false);
});

test("current Work Contract and adaptive role release a controlled portable result", async () => {
  const fixture = planningFixture();
  const { peer: planningPeer } = portableRuntime(currentness());
  const planned = await planningPeer.plan({
    tenant: { tenantId: "tenant:a" },
    agent: agent("planning-session-release"),
    missionIntent: fixture.intent,
    planView: fixture.view,
    observations: [fixture.observation],
    allowedInputReferenceDigests: [fixture.inputReferenceDigest],
    stepId: "planning-step-release",
    logicalTimeMs: 10,
    roleValidFromLogicalMs: 0,
    roleValidUntilLogicalMs: 1_000,
    metadata: { allowedInputReferenceDigest: fixture.inputReferenceDigest },
  });
  const assignment = assignmentFixture(fixture, planned.proposal);
  const { peer } = portableRuntime(currentness());

  const outcome = await peer.execute({
    tenant: { tenantId: "tenant:a" },
    agent: agent("execution-session-release", ["text"]),
    assignment,
    stepId: "execution-step-release",
    logicalTimeMs: 20,
    observations: [],
    input: { sector: "north" },
    requestedOutputModalities: ["text"],
  });

  assert.equal(outcome.status, "released");
  assert.equal(
    outcome.step.result.outputs[0].content,
    "Local inspection complete.",
  );
  assert.equal(outcome.step.result.actionProposals.length, 0);
});

test("result is withheld and its session closed when authority expires during the step", async () => {
  const fixture = planningFixture();
  const { peer: planningPeer } = portableRuntime(currentness());
  const planned = await planningPeer.plan({
    tenant: { tenantId: "tenant:a" },
    agent: agent("planning-session-stale"),
    missionIntent: fixture.intent,
    planView: fixture.view,
    observations: [fixture.observation],
    allowedInputReferenceDigests: [fixture.inputReferenceDigest],
    stepId: "planning-step-stale",
    logicalTimeMs: 10,
    roleValidFromLogicalMs: 0,
    roleValidUntilLogicalMs: 1_000,
    metadata: { allowedInputReferenceDigest: fixture.inputReferenceDigest },
  });
  const assignment = assignmentFixture(fixture, planned.proposal);
  let checks = 0;
  const { peer, sessions } = portableRuntime(
    currentness(() =>
      ++checks === 1
        ? { current: true, reasonCode: "current" }
        : { current: false, reasonCode: "lease_superseded" },
    ),
  );

  const outcome = await peer.execute({
    tenant: { tenantId: "tenant:a" },
    agent: agent("execution-session-stale", ["text"]),
    assignment,
    stepId: "execution-step-stale",
    logicalTimeMs: 20,
    observations: [],
    input: { sector: "north" },
    requestedOutputModalities: ["text"],
  });

  assert.deepEqual(outcome, {
    status: "withheld",
    workContract: assignment.workContract,
    session: null,
    step: null,
    reasonCode: "lease_superseded",
  });
  assert.equal(
    (await sessions.getSession("execution-session-stale")).status,
    "closed",
  );
});

function assignmentFixture(fixture, proposal) {
  const decision = createPlanFragmentDecisionV1({
    schemaVersion: 1,
    decisionId: "decision:peer-runtime",
    missionIntentId: fixture.intent.missionIntentId,
    intentRevision: fixture.intent.revision,
    intentDigest: fixture.intent.intentDigest,
    proposalId: proposal.proposalId,
    proposalDigest: proposal.proposalDigest,
    selectionPolicyDigest: fixture.intent.selectionPolicyDigest,
    status: "accepted",
    reasonCodes: ["policy.accepted"],
    inputCandidateDigests: [proposal.proposalDigest],
    selectedSemanticSlotHeadDigest: proposal.proposalDigest,
    localPlanViewRevision: Math.max(1, fixture.view.revision),
    decidedAtLogicalMs: 11,
    resultingStateDigest: planningDigest("plan-view", "accepted-result"),
  });
  const active = createPlanFragmentV1({
    schemaVersion: 1,
    fragmentRevision: 1,
    previousStateDigest: null,
    proposalId: proposal.proposalId,
    proposalRevision: proposal.proposalRevision,
    proposalDigest: proposal.proposalDigest,
    decisionDigest: decision.decisionDigest,
    missionIntentId: proposal.missionIntentId,
    intentRevision: proposal.intentRevision,
    intentDigest: proposal.intentDigest,
    proposerPeerId: proposal.proposerPeerId,
    proposerInstanceId: proposal.proposerInstanceId,
    semanticSlotKey: proposal.semanticSlotKey,
    predecessorFragmentDigest: proposal.predecessorFragmentDigest,
    parentFragmentDigests: proposal.parentFragmentDigests,
    dependencyFragmentDigests: proposal.dependencyFragmentDigests,
    outcomeStatements: proposal.outcomeStatements,
    roleKey: proposal.roleKey,
    requiredCapabilityKeys: proposal.requiredCapabilityKeys,
    inputReferenceDigest: proposal.inputReferenceDigest,
    basisObservationDigests: proposal.basisObservationDigests,
    requestedBudgetUnits: proposal.requestedBudgetUnits,
    workDeadline: proposal.workDeadline,
    proposedAtLogicalMs: proposal.proposedAtLogicalMs,
    acceptancePolicyDigest: fixture.intent.selectionPolicyDigest,
    acceptedAtLogicalMs: 12,
    localPlanViewRevision: Math.max(1, fixture.view.revision),
    status: "active",
  });
  const assigned = createPlanFragmentV1({
    ...withoutDigest(active),
    fragmentRevision: 2,
    previousStateDigest: active.fragmentDigest,
    status: "assigned",
  });
  const workBody = {
    schemaVersion: 1,
    workContractId: "work-contract:peer-runtime",
    generation: 1,
    tenantId: fixture.intent.tenantId,
    policyDomainId: fixture.intent.policyDomainId,
    mandate: {
      schemaVersion: 1,
      mandateId: "mandate:peer-runtime",
      mandateRevision: 1,
      mandateDigest: fixture.intent.mandateDigest,
    },
    objective: {
      schemaVersion: 1,
      meshId: fixture.intent.objective.meshId,
      objectiveId: fixture.intent.objective.objectiveId,
      objectiveDocumentId: fixture.intent.objective.objectiveDocumentId,
      objectiveRevision: fixture.intent.objective.objectiveRevision,
      acceptedMessageId: "objective-message:1",
      acceptedPolicyDigest: fixture.intent.objective.acceptedPolicyDigest,
    },
    assignment: {
      schemaVersion: 1,
      workItemId: "work-item:peer-runtime",
      workItemRevision: 1,
      ownerPeerId: "peer:owner",
      assignedPeerId: "peer:a",
      assignedInstanceId: "instance:a:1",
      assignmentAuthorityId: "assignment-authority:1",
      assignmentEpoch: 1,
      authorityGeneration: 1,
      fencingToken: "fencing-token:1",
      leaseExpiresAtLogicalMs: 1_000,
      workDeadline: proposal.workDeadline,
    },
    roleKey: proposal.roleKey,
    requiredCapabilityKeys: proposal.requiredCapabilityKeys,
    completionCriteria: proposal.outcomeStatements,
    inputReferenceDigest: proposal.inputReferenceDigest,
    reservedBudgetUnits: 10,
    maximumActionBudgetUnits: 5,
    trustPolicyId: "trust-policy:1",
    inferencePolicyId: "inference-policy:1",
    createdAtLogicalMs: 12,
    updatedAtLogicalMs: 12,
    status: "active",
    terminalReasonCode: null,
  };
  const workContract = validateWorkContractV1({
    ...workBody,
    workContractDigest: workContractDigestV1(workBody),
  });
  const roleBinding = createAdaptiveRoleBindingV1({
    schemaVersion: 1,
    roleBindingId: "adaptive-role:peer-runtime",
    missionIntentId: fixture.intent.missionIntentId,
    intentRevision: fixture.intent.revision,
    intentDigest: fixture.intent.intentDigest,
    planViewDigest: fixture.view.stateDigest,
    fragmentDigest: assigned.fragmentDigest,
    roleKey: proposal.roleKey,
    workContractId: workContract.workContractId,
    workContractDigest: workContract.workContractDigest,
    assignedPeerId: workContract.assignment.assignedPeerId,
    assignedInstanceId: workContract.assignment.assignedInstanceId,
    assignmentAuthorityId: workContract.assignment.assignmentAuthorityId,
    assignmentEpoch: workContract.assignment.assignmentEpoch,
    authorityGeneration: workContract.assignment.authorityGeneration,
    fencingToken: workContract.assignment.fencingToken,
    leaseExpiresAtLogicalMs: workContract.assignment.leaseExpiresAtLogicalMs,
    status: "current",
    terminalReasonCode: null,
  });
  return { workContract, targetFragment: assigned, roleBinding };
}

function withoutDigest(fragment) {
  const { fragmentDigest: _digest, ...body } = fragment;
  return body;
}

function completed(input, content, modality = "structured") {
  return {
    schemaVersion: 1,
    sessionId: input.sessionId,
    stepId: input.request.stepId,
    stepSequence: input.stepSequence,
    status: "completed",
    outputs: [
      {
        schemaVersion: 1,
        outputId: `${input.request.stepId}:output`,
        modality,
        content,
        contentReference: null,
        metadata: {},
      },
    ],
    actionProposals: [],
    checkpoint: null,
    reasonCode: null,
    metadata: {},
  };
}

function sequentialClock() {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++));
}
