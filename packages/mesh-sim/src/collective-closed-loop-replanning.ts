import {
  createPlanningReducerCommandV1,
  deepFreezePlanning,
  reducePlanningCommandV1,
  validateMissionObservationV1,
  validatePlanFragmentProposalV1,
  type MissionObservationV1,
  type PlanFragmentProposalV1,
  type PlanningDigestV1,
  type PlanningReducerEventV1,
  type PlanningReducerStateV1,
} from '@agentplat/collective-planning';
import { planningWorkItemIdV1 } from '@agentplat/collective-planning/mesh';

/**
 * One causally justified successor of the currently selected semantic slot.
 * The caller supplies the policy decision; this boundary proves that every
 * participating reducer first retained the triggering observation and that
 * the accepted successor cites that exact observation and prior head.
 */
export interface CollectiveClosedLoopCausalReplanningInputV1 {
  readonly schemaVersion: 1;
  readonly planningStates: Readonly<Record<string, PlanningReducerStateV1>>;
  readonly triggerObservation: MissionObservationV1;
  readonly successorProposal: PlanFragmentProposalV1;
  readonly decidedAtLogicalMs: number;
}

export interface CollectiveClosedLoopCausalReplanningResultV1 {
  readonly schemaVersion: 1;
  readonly triggerObservationDigest: PlanningDigestV1;
  readonly priorHeadDigest: PlanningDigestV1;
  readonly successorProposalDigest: PlanningDigestV1;
  readonly successorHeadDigest: PlanningDigestV1;
  readonly successorWorkItemId: string;
  readonly replannedPeerIds: readonly string[];
  readonly planningStates: Readonly<Record<string, PlanningReducerStateV1>>;
  readonly events: readonly PlanningReducerEventV1[];
}

export function runCollectiveClosedLoopCausalReplanningV1(
  input: CollectiveClosedLoopCausalReplanningInputV1
): CollectiveClosedLoopCausalReplanningResultV1 {
  exact(input, [
    'schemaVersion',
    'planningStates',
    'triggerObservation',
    'successorProposal',
    'decidedAtLogicalMs',
  ]);
  if (input.schemaVersion !== 1)
    throw new TypeError('closed_loop_replanning_schema_invalid');
  if (
    !Number.isSafeInteger(input.decidedAtLogicalMs) ||
    input.decidedAtLogicalMs < 0
  )
    throw new TypeError('closed_loop_replanning_logical_time_invalid');
  const observation = validateMissionObservationV1(input.triggerObservation);
  const proposal = validatePlanFragmentProposalV1(input.successorProposal);
  const entries = planningStateEntries(input.planningStates);
  if (entries.length === 0)
    throw new TypeError('closed_loop_replanning_states_empty');
  if (
    proposal.proposedAtLogicalMs !== input.decidedAtLogicalMs ||
    proposal.proposedAtLogicalMs < observation.logicalTimeMs ||
    !proposal.basisObservationDigests.includes(observation.observationDigest)
  )
    throw new TypeError('closed_loop_replanning_cause_missing');

  const proposerEntry = entries.find(
    ([, state]) =>
      state.peerId === proposal.proposerPeerId &&
      state.peerInstanceId === proposal.proposerInstanceId
  );
  const priorHeadDigest = proposerEntry?.[1].planView.selectedHeads.find(
    (head) => head.semanticSlotKey === proposal.semanticSlotKey
  )?.fragmentDigest;
  const replanningEntries = entries.filter(([, state]) =>
    state.planView.selectedHeads.some(
      (head) => head.semanticSlotKey === proposal.semanticSlotKey
    )
  );
  if (
    priorHeadDigest === undefined ||
    replanningEntries.length === 0 ||
    replanningEntries.some(
      ([, state]) =>
        state.planView.selectedHeads.find(
          (head) => head.semanticSlotKey === proposal.semanticSlotKey
        )?.fragmentDigest !== priorHeadDigest
    ) ||
    proposal.predecessorFragmentDigest !== priorHeadDigest
  )
    throw new TypeError('closed_loop_replanning_predecessor_invalid');

  const nextStates: Record<string, PlanningReducerStateV1> =
    Object.fromEntries(entries);
  const events: PlanningReducerEventV1[] = [];
  let successorHeadDigest: PlanningDigestV1 | null = null;
  const successorWorkItemId = planningWorkItemIdV1(proposal.proposalDigest);

  for (const [peerId, initial] of replanningEntries) {
    let state = initial;
    if (state.planView.logicalTimeHighWaterMs < input.decidedAtLogicalMs)
      state = apply(
        state,
        createPlanningReducerCommandV1({
          schemaVersion: 1,
          kind: 'logical-time.advance',
          expectedStateDigest: state.stateDigest,
          logicalTimeMs: input.decidedAtLogicalMs,
        }),
        events
      );
    state = apply(
      state,
      createPlanningReducerCommandV1({
        schemaVersion: 1,
        kind: 'observation.record',
        expectedStateDigest: state.stateDigest,
        observation,
      }),
      events
    );
    state = apply(
      state,
      createPlanningReducerCommandV1({
        schemaVersion: 1,
        kind: 'proposal.record',
        expectedStateDigest: state.stateDigest,
        proposal,
      }),
      events
    );
    state = apply(
      state,
      createPlanningReducerCommandV1({
        schemaVersion: 1,
        kind: 'slot.evaluate',
        expectedStateDigest: state.stateDigest,
        semanticSlotKey: proposal.semanticSlotKey,
        candidateProposalDigests: [proposal.proposalDigest],
        decidedAtLogicalMs: input.decidedAtLogicalMs,
      }),
      events
    );
    const head = state.planView.selectedHeads.find(
      (candidate) => candidate.semanticSlotKey === proposal.semanticSlotKey
    );
    if (
      head === undefined ||
      head.fragmentDigest === priorHeadDigest ||
      !state.planView.fragments.some(
        (fragment) =>
          fragment.fragmentDigest === head.fragmentDigest &&
          fragment.proposalDigest === proposal.proposalDigest &&
          fragment.status === 'active'
      )
    )
      throw new Error('closed_loop_replanning_successor_not_selected');
    state = apply(
      state,
      createPlanningReducerCommandV1({
        schemaVersion: 1,
        kind: 'fragment.project-to-work',
        expectedStateDigest: state.stateDigest,
        fragmentId: state.planView.fragments.find(
          (fragment) => fragment.fragmentDigest === head.fragmentDigest
        )!.fragmentId,
        previousFragmentDigest: head.fragmentDigest,
        workTarget: {
          schemaVersion: 1,
          meshId: state.missionIntent.objective.meshId,
          objectiveId: state.missionIntent.objective.objectiveId,
          workItemId: successorWorkItemId,
          workItemRevision: 1,
        },
        transitionedAtLogicalMs: input.decidedAtLogicalMs,
      }),
      events
    );
    const projectedHead = state.planView.selectedHeads.find(
      (candidate) => candidate.semanticSlotKey === proposal.semanticSlotKey
    );
    if (projectedHead === undefined)
      throw new Error('closed_loop_replanning_projected_head_missing');
    successorHeadDigest ??= projectedHead.fragmentDigest;
    if (successorHeadDigest !== projectedHead.fragmentDigest)
      throw new Error('closed_loop_replanning_peer_divergence');
    nextStates[peerId] = state;
  }
  if (successorHeadDigest === null)
    throw new Error('closed_loop_replanning_successor_missing');
  return deepFreezePlanning({
    schemaVersion: 1,
    triggerObservationDigest: observation.observationDigest,
    priorHeadDigest,
    successorProposalDigest: proposal.proposalDigest,
    successorHeadDigest,
    successorWorkItemId,
    replannedPeerIds: replanningEntries.map(([peerId]) => peerId),
    planningStates: nextStates,
    events,
  });
}

function planningStateEntries(
  value: Readonly<Record<string, PlanningReducerStateV1>>
): readonly [string, PlanningReducerStateV1][] {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null) ||
    Object.getOwnPropertySymbols(value).length !== 0
  )
    throw new TypeError('closed_loop_replanning_states_invalid');
  const entries = Object.entries(value).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0
  );
  for (const [peerId, state] of entries) {
    const descriptor = Object.getOwnPropertyDescriptor(value, peerId);
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !('value' in descriptor) ||
      state === null ||
      typeof state !== 'object' ||
      state.peerId !== peerId
    )
      throw new TypeError('closed_loop_replanning_state_identity_invalid');
  }
  return entries;
}

function apply(
  state: PlanningReducerStateV1,
  command: ReturnType<typeof createPlanningReducerCommandV1>,
  events: PlanningReducerEventV1[]
): PlanningReducerStateV1 {
  const result = reducePlanningCommandV1(state, command);
  if (result.status !== 'applied')
    throw new Error(
      `closed_loop_replanning_${command.kind}_${result.error?.code ?? result.status}:${result.error?.message ?? result.status}`
    );
  events.push(...result.events);
  return result.state;
}

function exact(value: unknown, keys: readonly string[]): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('closed_loop_replanning_input_invalid');
  const names = Object.getOwnPropertyNames(value).sort();
  const expected = [...keys].sort();
  if (
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null) ||
    Object.getOwnPropertySymbols(value).length !== 0 ||
    names.length !== expected.length ||
    names.some((name, index) => name !== expected[index])
  )
    throw new TypeError('closed_loop_replanning_input_invalid');
}
