import {
  validatePlanningReducerStateV1,
  type PlanningDigestV1,
  type PlanningReducerStateV1,
} from "@agentplat/collective-planning";

import type {
  MechanismAllocationAdmissionPortV1,
  MechanismAllocationPolicyRecordV1,
  MechanismAllocationSelectionV1,
  MechanismAllocationStateV1,
  MechanismMissionDecompositionProposalV1,
} from "./mechanism-allocation-contracts.js";
import {
  createMechanismMissionDecompositionProposalV1,
  createMechanismMissionScopeV1,
  createMechanismSemanticWorkSlotV1,
} from "./mechanism-allocation-validation.js";
import { verifyMechanismAllocationStateAdmissionsV1 } from "./mechanism-allocation-runtime.js";
import type {
  TeamFormationPolicyRecordV1,
  TeamFormationRequestV1,
  TeamFormationScopeV1,
} from "./team-formation-contracts.js";
import {
  createTeamCandidateV1,
  createTeamFormationRequestV1,
  createTeamFormationScopeV1,
  createTeamPositionBidV1,
  createTeamPositionV1,
  validateTeamFormationPolicyV1,
} from "./team-formation-validation.js";

export interface MechanismAllocationEligiblePeerV1 {
  readonly peerId: string;
  readonly independenceGroupId: string;
  readonly capabilityKeys: readonly string[];
}

/**
 * Turns one peer's accepted planning view into a bounded local auction
 * proposal. It does not merge a global plan or grant assignment authority.
 */
export function createMechanismDecompositionFromPlanningStateV1(input: {
  readonly proposalId: string;
  readonly planningState: PlanningReducerStateV1;
  readonly teamFormationScope: TeamFormationScopeV1;
  readonly missionEpoch: number;
  readonly causalEpoch: number;
  readonly proposerIndependenceGroupId: string;
  readonly proposerInstanceId: string;
  readonly eligiblePeers: readonly MechanismAllocationEligiblePeerV1[];
  readonly parentProposalDigest: PlanningDigestV1 | null;
  readonly observedAtLogicalMs: number;
  readonly validUntilLogicalMs: number;
}): MechanismMissionDecompositionProposalV1 {
  const planning = validatePlanningReducerStateV1(input.planningState);
  const scope = createTeamFormationScopeV1(input.teamFormationScope);
  if (
    scope.tenantId !== planning.tenantId ||
    scope.policyDomainId !== planning.policyDomainId ||
    scope.missionIntentId !== planning.missionIntent.missionIntentId ||
    scope.objectiveId !== planning.missionIntent.objective.objectiveId
  )
    throw new TypeError("mechanism planning and formation scopes do not match");

  const peers = normalizeEligiblePeers(input.eligiblePeers);
  const selected = new Map(
    planning.planView.selectedHeads.map((head) => {
      const fragment = planning.planView.fragments.find(
        (candidate) => candidate.fragmentDigest === head.fragmentDigest,
      );
      if (!fragment)
        throw new TypeError("selected planning head has no fragment");
      return [fragment.fragmentDigest, fragment] as const;
    }),
  );
  if (selected.size === 0)
    throw new TypeError("mechanism decomposition requires selected work");

  const slots = [...selected.values()]
    .map((fragment) => {
      const eligible = peers.filter((peer) =>
        fragment.requiredCapabilityKeys.every((capability) =>
          peer.capabilityKeys.includes(capability),
        ),
      );
      const dependsOnSlotIds = fragment.dependencyFragmentDigests.map(
        (dependencyDigest) => {
          const dependency = selected.get(dependencyDigest);
          if (!dependency)
            throw new TypeError(
              "mechanism decomposition dependency is outside selected plan",
            );
          return dependency.fragmentId;
        },
      );
      return createMechanismSemanticWorkSlotV1({
        slotId: fragment.fragmentId,
        semanticRoleKey: fragment.roleKey,
        requiredCapabilityKeys: [...fragment.requiredCapabilityKeys].sort(
          compare,
        ),
        dependsOnSlotIds: dependsOnSlotIds.sort(compare),
        eligiblePeerIds: [...new Set(eligible.map((peer) => peer.peerId))].sort(
          compare,
        ),
        eligibleIndependenceGroupIds: [
          ...new Set(eligible.map((peer) => peer.independenceGroupId)),
        ].sort(compare),
        requiredIndependenceGroupId: null,
        budgetCeilingUnits: fragment.requestedBudgetUnits,
      });
    })
    .sort((left, right) => compare(left.slotId, right.slotId));

  return createMechanismMissionDecompositionProposalV1({
    proposalId: input.proposalId,
    proposerPeerId: planning.peerId,
    proposerInstanceId: token(input.proposerInstanceId, "proposer instance"),
    proposerIndependenceGroupId: input.proposerIndependenceGroupId,
    scope: createMechanismMissionScopeV1({
      missionId: planning.missionIntent.missionIntentId,
      missionEpoch: input.missionEpoch,
      teamFormationScope: scope,
      planningDigest: planning.stateDigest,
    }),
    parentProposalDigest: input.parentProposalDigest,
    causalEpoch: input.causalEpoch,
    observedAtLogicalMs: input.observedAtLogicalMs,
    validUntilLogicalMs: input.validUntilLogicalMs,
    slots,
  });
}

export interface MechanismAllocationFormationBindingV1 {
  readonly slotId: string;
  readonly workItemId: string;
  readonly workItemRevision: number;
  readonly completionCriteria: readonly string[];
  readonly maximumActionBudgetUnits: number;
}

/**
 * Projects a complete advisory allocation into the ordinary formation gate.
 * Formation still rechecks evidence, budgets and roster policy, and every
 * selected peer still needs an individual Work Contract before activation.
 */
export async function createTeamFormationRequestFromMechanismAllocationV1(input: {
  readonly state: MechanismAllocationStateV1;
  readonly allocationPolicy: MechanismAllocationPolicyRecordV1;
  readonly formationPolicy: TeamFormationPolicyRecordV1;
  readonly admission: MechanismAllocationAdmissionPortV1;
  readonly requestId: string;
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly bindings: readonly MechanismAllocationFormationBindingV1[];
  readonly logicalTimeMs: number;
  readonly validUntilLogicalMs: number;
}): Promise<TeamFormationRequestV1> {
  const state = await verifyMechanismAllocationStateAdmissionsV1({
    state: input.state,
    policy: input.allocationPolicy,
    admission: input.admission,
  });
  const formationPolicy = validateTeamFormationPolicyV1(input.formationPolicy);
  if (
    !state.proposal ||
    !state.plan ||
    state.plan.round !== state.auction?.round
  )
    throw new TypeError("a current mechanism allocation plan is required");
  if (state.plan.unallocatedSlotIds.length > 0)
    throw new TypeError("mechanism allocation is incomplete");
  if (
    state.proposal.slots.length >
      formationPolicy.policy.limits.maximumPositions ||
    state.plan.selections.reduce(
      (sum, selection) => sum + selection.declaredBudgetUnits,
      0,
    ) > formationPolicy.policy.maximumTotalBudgetUnits
  )
    throw new TypeError("mechanism allocation exceeds formation policy");
  if (
    state.plan.selections.length >
      formationPolicy.policy.limits.maximumMembers ||
    new Set(state.plan.selections.map((selection) => selection.bidderPeerId))
      .size < formationPolicy.policy.minimumDistinctPeers ||
    new Set(
      state.plan.selections.map(
        (selection) => selection.bidderIndependenceGroupId,
      ),
    ).size < formationPolicy.policy.minimumIndependenceGroups ||
    (formationPolicy.policy.requireDistinctPeerPerPosition &&
      new Set(state.plan.selections.map((selection) => selection.bidderPeerId))
        .size !== state.plan.selections.length)
  )
    throw new TypeError(
      "mechanism allocation roster violates formation policy",
    );
  const proposalAdmissionIndex = state.admittedEvents.findIndex(
    (event) =>
      event.kind === "proposal" &&
      event.proposal.proposalDigest === state.proposal!.proposalDigest,
  );
  const proposalAdmission = state.admissions[proposalAdmissionIndex];
  if (
    !proposalAdmission ||
    input.membershipEpoch !== proposalAdmission.membershipEpoch ||
    input.membershipConfigurationDigest !==
      proposalAdmission.membershipConfigurationDigest
  )
    throw new TypeError("mechanism formation membership provenance is invalid");

  const bindings = new Map(
    input.bindings.map((binding) => [binding.slotId, binding] as const),
  );
  if (bindings.size !== input.bindings.length)
    throw new TypeError("mechanism formation bindings must be unique");
  if (bindings.size !== state.proposal.slots.length)
    throw new TypeError("mechanism formation bindings are incomplete");

  const selections = new Map(
    state.plan.selections.map((selection) => [selection.slotId, selection]),
  );
  const positions = state.proposal.slots.map((slot) => {
    const binding = requiredBinding(bindings, slot.slotId);
    const selection = requiredSelection(selections, slot.slotId);
    if (binding.maximumActionBudgetUnits > selection.declaredBudgetUnits)
      throw new TypeError("mechanism action budget exceeds selected budget");
    return createTeamPositionV1({
      schemaVersion: 1,
      positionId: slot.slotId,
      workItemId: binding.workItemId,
      workItemRevision: binding.workItemRevision,
      roleKey: slot.semanticRoleKey,
      requiredCapabilityKeys: slot.requiredCapabilityKeys,
      completionCriteria: [...binding.completionCriteria].sort(compare),
      dependsOnPositionIds: slot.dependsOnSlotIds,
      budgetUnits: selection.declaredBudgetUnits,
      maximumActionBudgetUnits: binding.maximumActionBudgetUnits,
    });
  });
  const bids = state.plan.selections.map((selection) => {
    const slot = state.proposal!.slots.find(
      (candidate) => candidate.slotId === selection.slotId,
    )!;
    const binding = requiredBinding(bindings, selection.slotId);
    const reveal = state.reveals.find(
      (candidate) =>
        candidate.revealId === selection.revealId &&
        candidate.revealDigest === selection.revealDigest,
    );
    const revealEventIndex = reveal
      ? state.admittedEvents.findIndex(
          (event) =>
            event.kind === "reveal" &&
            event.reveal.revealDigest === reveal.revealDigest,
        )
      : -1;
    const revealAdmission = state.admissions[revealEventIndex];
    if (!reveal || !revealAdmission)
      throw new TypeError("mechanism formation reveal provenance is invalid");
    const candidate = createTeamCandidateV1({
      schemaVersion: 1,
      candidateId: `mechanism.${selection.revealId}`,
      peerId: selection.bidderPeerId,
      instanceId: reveal.bidderInstanceId,
      independenceGroupId: selection.bidderIndependenceGroupId,
      sourceCandidateDigest: revealAdmission.capabilityStateDigest,
      sourceRequestDigest: revealAdmission.membershipConfigurationDigest,
      sourceDecisionDigest: revealAdmission.evidenceDigest,
      eligibleWorkItemId: binding.workItemId,
      eligibleWorkItemRevision: binding.workItemRevision,
      requiredCapabilityKeys: slot.requiredCapabilityKeys,
    });
    return createTeamPositionBidV1({
      schemaVersion: 1,
      bidId: `mechanism.${selection.revealId}`,
      positionId: selection.slotId,
      candidate,
      sourceBidDigest: selection.revealDigest,
      capacityReservationUnits: selection.declaredResourceUnits,
      budgetUnits: selection.declaredBudgetUnits,
      expectedCompletionAtLogicalMs: reveal.availabilityUntilLogicalMs,
      locallyEvaluatedScoreMicros: selection.declaredUtilityMicros,
      observedAtLogicalMs: reveal.revealedAtLogicalMs,
      validUntilLogicalMs: reveal.availabilityUntilLogicalMs,
    });
  });

  return createTeamFormationRequestV1({
    schemaVersion: 1,
    requestId: input.requestId,
    scope: state.proposal.scope.teamFormationScope,
    membershipEpoch: input.membershipEpoch,
    membershipConfigurationDigest: input.membershipConfigurationDigest,
    positions,
    bids,
    logicalTimeMs: input.logicalTimeMs,
    validUntilLogicalMs: input.validUntilLogicalMs,
  });
}

function normalizeEligiblePeers(
  input: readonly MechanismAllocationEligiblePeerV1[],
): readonly MechanismAllocationEligiblePeerV1[] {
  const peers = input.map((peer) => ({
    peerId: token(peer.peerId, "eligible peer"),
    independenceGroupId: token(
      peer.independenceGroupId,
      "eligible independence group",
    ),
    capabilityKeys: Object.freeze(
      [
        ...new Set(
          peer.capabilityKeys.map((capability) =>
            token(capability, "eligible capability"),
          ),
        ),
      ].sort(compare),
    ),
  }));
  if (new Set(peers.map((peer) => peer.peerId)).size !== peers.length)
    throw new TypeError("eligible peers must be unique");
  return Object.freeze(
    peers.sort((left, right) => compare(left.peerId, right.peerId)),
  );
}

function requiredBinding(
  bindings: ReadonlyMap<string, MechanismAllocationFormationBindingV1>,
  slotId: string,
): MechanismAllocationFormationBindingV1 {
  const binding = bindings.get(slotId);
  if (!binding) throw new TypeError("mechanism formation binding is missing");
  return binding;
}

function requiredSelection(
  selections: ReadonlyMap<string, MechanismAllocationSelectionV1>,
  slotId: string,
): MechanismAllocationSelectionV1 {
  const selection = selections.get(slotId);
  if (!selection)
    throw new TypeError("mechanism allocation selection is missing");
  return selection;
}

function token(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u.test(value)
  )
    throw new TypeError(`${label} is invalid`);
  return value;
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
