import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMissionObservationV1,
  createPlanFragmentProposalV1,
  createPlanningReducerCommandV1,
  createPlanningReducerStateV1,
  digestPlanningJsonV1,
  reducePlanningCommandV1,
} from '@agentplat/collective-planning';
import {
  createCollectiveClosedLoopReferenceScenarioV1,
  runCollectiveClosedLoopCausalReplanningV1,
} from '@agentplat/mesh-sim';

async function causalFixture({
  observationKind = 'capability-withdrawn',
  publicValue = { capabilityKey: 'capability.execute', status: 'withdrawn' },
} = {}) {
  const input = await createCollectiveClosedLoopReferenceScenarioV1({
    runner: 'adaptive_collective',
    peerCount: 3,
  });
  const owner = input.definition.peers[0];
  let state = createPlanningReducerStateV1({
    schemaVersion: 1,
    peerId: owner.peerId,
    peerInstanceId: owner.peerInstanceId,
    missionIntent: input.definition.missionIntent,
    selectionPolicy: input.definition.selectionPolicy,
    admittedSubjects: input.definition.peers.map((peer) => ({
      schemaVersion: 1,
      peerId: peer.peerId,
      peerInstanceId: peer.peerInstanceId,
    })),
    logicalTimeMs: 0,
  });
  const initialObservation = createMissionObservationV1({
    schemaVersion: 1,
    observationId: 'observation:closed-loop:initial',
    missionIntentId: input.definition.missionIntent.missionIntentId,
    intentRevision: input.definition.missionIntent.revision,
    intentDigest: input.definition.missionIntent.intentDigest,
    observerPeerId: owner.peerId,
    observerInstanceId: owner.peerInstanceId,
    environmentCursor: 'cursor:closed-loop:0',
    logicalTimeMs: 0,
    visibility: 'public',
    observationKind: 'initial-state',
    publicValue: { status: 'ready' },
    contentReferenceDigest: null,
  });
  const initialProposal = createPlanFragmentProposalV1({
    schemaVersion: 1,
    proposalRevision: 1,
    missionIntentId: input.definition.missionIntent.missionIntentId,
    intentRevision: input.definition.missionIntent.revision,
    intentDigest: input.definition.missionIntent.intentDigest,
    proposerPeerId: owner.peerId,
    proposerInstanceId: owner.peerInstanceId,
    semanticSlotKey: 'slot:closed-loop-causal-replanning',
    predecessorFragmentDigest: null,
    parentFragmentDigests: [],
    dependencyFragmentDigests: [],
    outcomeStatements: [...input.definition.missionIntent.outcomeStatements],
    roleKey: 'role:executor',
    requiredCapabilityKeys: ['capability.execute'],
    inputReferenceDigest: digestPlanningJsonV1('environment-state-v1', {
      domain: 'closed-loop-causal-replanning',
      revision: 1,
    }),
    basisObservationDigests: [initialObservation.observationDigest],
    requestedBudgetUnits: 1,
    workDeadline: input.definition.missionIntent.validUntil,
    proposedAtLogicalMs: 0,
  });
  for (const command of [
    createPlanningReducerCommandV1({
      schemaVersion: 1,
      kind: 'observation.record',
      expectedStateDigest: state.stateDigest,
      observation: initialObservation,
    }),
    // Expected-state CAS is filled immediately before each application below.
    initialProposal,
  ]) {
    const nextCommand =
      'kind' in command && command.kind === 'observation.record'
        ? command
        : createPlanningReducerCommandV1({
            schemaVersion: 1,
            kind: 'proposal.record',
            expectedStateDigest: state.stateDigest,
            proposal: command,
          });
    const result = reducePlanningCommandV1(state, nextCommand);
    assert.equal(result.status, 'applied', result.error?.message);
    state = result.state;
  }
  const evaluated = reducePlanningCommandV1(
    state,
    createPlanningReducerCommandV1({
      schemaVersion: 1,
      kind: 'slot.evaluate',
      expectedStateDigest: state.stateDigest,
      semanticSlotKey: initialProposal.semanticSlotKey,
      candidateProposalDigests: [initialProposal.proposalDigest],
      decidedAtLogicalMs: 0,
    })
  );
  assert.equal(evaluated.status, 'applied', evaluated.error?.message);
  state = evaluated.state;
  const priorHead = state.planView.selectedHeads[0];
  const priorFragment = state.planView.fragments.find(
    (fragment) => fragment.fragmentDigest === priorHead.fragmentDigest
  );
  assert.ok(priorFragment);
  const logicalTimeMs = 1;
  const triggerObservation = createMissionObservationV1({
    schemaVersion: 1,
    observationId: 'observation:closed-loop:capability-withdrawn',
    missionIntentId: input.definition.missionIntent.missionIntentId,
    intentRevision: input.definition.missionIntent.revision,
    intentDigest: input.definition.missionIntent.intentDigest,
    observerPeerId: owner.peerId,
    observerInstanceId: owner.peerInstanceId,
    environmentCursor: 'cursor:closed-loop:1',
    logicalTimeMs,
    visibility: 'failure',
    observationKind,
    publicValue,
    contentReferenceDigest: null,
  });
  return {
    input,
    owner,
    state,
    priorFragment,
    triggerObservation,
    logicalTimeMs,
  };
}

function successorFor(fixture, basisObservationDigests, overrides = {}) {
  const { input, owner, priorFragment, triggerObservation, logicalTimeMs } =
    fixture;
  return createPlanFragmentProposalV1({
    schemaVersion: 1,
    proposalRevision: 2,
    missionIntentId: input.definition.missionIntent.missionIntentId,
    intentRevision: input.definition.missionIntent.revision,
    intentDigest: input.definition.missionIntent.intentDigest,
    proposerPeerId: owner.peerId,
    proposerInstanceId: owner.peerInstanceId,
    semanticSlotKey: priorFragment.semanticSlotKey,
    predecessorFragmentDigest: priorFragment.fragmentDigest,
    parentFragmentDigests: [],
    dependencyFragmentDigests: overrides.dependencyFragmentDigests ?? [],
    outcomeStatements: [...priorFragment.outcomeStatements],
    roleKey: overrides.roleKey ?? priorFragment.roleKey,
    requiredCapabilityKeys: [...priorFragment.requiredCapabilityKeys],
    inputReferenceDigest: digestPlanningJsonV1('environment-state-v1', {
      domain: 'closed-loop-causal-replanning',
      cause: triggerObservation.observationDigest,
    }),
    basisObservationDigests,
    requestedBudgetUnits: priorFragment.requestedBudgetUnits,
    workDeadline: priorFragment.workDeadline,
    proposedAtLogicalMs: logicalTimeMs,
  });
}

test('an observed failure causally supersedes an active fragment', async () => {
  const fixture = await causalFixture();
  const successorProposal = successorFor(fixture, [
    fixture.triggerObservation.observationDigest,
  ]);
  const result = runCollectiveClosedLoopCausalReplanningV1({
    schemaVersion: 1,
    planningStates: { [fixture.owner.peerId]: fixture.state },
    triggerObservation: fixture.triggerObservation,
    successorProposal,
    decidedAtLogicalMs: fixture.logicalTimeMs,
  });

  assert.equal(result.priorHeadDigest, fixture.priorFragment.fragmentDigest);
  assert.notEqual(result.successorHeadDigest, result.priorHeadDigest);
  assert.equal(
    result.triggerObservationDigest,
    fixture.triggerObservation.observationDigest
  );
  assert.deepEqual(result.replannedPeerIds, [fixture.owner.peerId]);
  const state = result.planningStates[fixture.owner.peerId];
  assert.equal(
    state.planView.selectedHeads[0].fragmentDigest,
    result.successorHeadDigest
  );
  assert.ok(
    state.planView.fragments.some(
      (fragment) =>
        fragment.previousStateDigest === result.priorHeadDigest &&
        fragment.status === 'superseded'
    )
  );
  assert.ok(
    state.planView.workMappings.some(
      (mapping) => mapping.workItemId === result.successorWorkItemId
    )
  );
});

test('a successor that does not cite the trigger is rejected before mutation', async () => {
  const fixture = await causalFixture();
  const uncited = successorFor(fixture, [
    fixture.priorFragment.basisObservationDigests[0],
  ]);
  assert.throws(
    () =>
      runCollectiveClosedLoopCausalReplanningV1({
        schemaVersion: 1,
        planningStates: { [fixture.owner.peerId]: fixture.state },
        triggerObservation: fixture.triggerObservation,
        successorProposal: uncited,
        decidedAtLogicalMs: fixture.logicalTimeMs,
      }),
    /closed_loop_replanning_cause_missing/
  );
  assert.equal(
    fixture.state.planView.selectedHeads[0].fragmentDigest,
    fixture.priorFragment.fragmentDigest
  );
});

test('a benign dependency failure produces a bounded alternate graph and role', async () => {
  const fixture = await causalFixture({
    observationKind: 'dependency-failed',
    publicValue: {
      stratum: 'benign',
      dependencyKey: 'dependency:primary',
      status: 'failed',
    },
  });
  const successorProposal = successorFor(
    fixture,
    [fixture.triggerObservation.observationDigest],
    { roleKey: 'role:recovery-executor' }
  );
  const result = runCollectiveClosedLoopCausalReplanningV1({
    schemaVersion: 1,
    planningStates: { [fixture.owner.peerId]: fixture.state },
    triggerObservation: fixture.triggerObservation,
    successorProposal,
    decidedAtLogicalMs: fixture.logicalTimeMs,
  });
  const state = result.planningStates[fixture.owner.peerId];
  const successor = state.planView.fragments.find(
    (fragment) => fragment.fragmentDigest === result.successorHeadDigest
  );
  assert.ok(successor);
  assert.equal(successor.roleKey, 'role:recovery-executor');
  assert.equal(
    successor.predecessorFragmentDigest,
    fixture.priorFragment.fragmentDigest
  );
  assert.notEqual(result.successorWorkItemId, undefined);
  assert.ok(
    state.planView.workMappings.some(
      (mapping) =>
        mapping.fragmentDigest === result.successorHeadDigest &&
        mapping.workItemId === result.successorWorkItemId
    )
  );
});

test('planning state record keys must equal their retained peer identity', async () => {
  const fixture = await causalFixture();
  const successorProposal = successorFor(fixture, [
    fixture.triggerObservation.observationDigest,
  ]);
  assert.throws(
    () =>
      runCollectiveClosedLoopCausalReplanningV1({
        schemaVersion: 1,
        planningStates: { 'peer:aliased': fixture.state },
        triggerObservation: fixture.triggerObservation,
        successorProposal,
        decidedAtLogicalMs: fixture.logicalTimeMs,
      }),
    /closed_loop_replanning_state_identity_invalid/
  );
  assert.equal(
    fixture.state.planView.selectedHeads[0].fragmentDigest,
    fixture.priorFragment.fragmentDigest
  );
});
