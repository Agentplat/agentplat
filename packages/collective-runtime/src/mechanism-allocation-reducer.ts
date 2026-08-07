import type {
  MechanismAllocationAdmittedEventV1,
  MechanismAllocationPlanV1,
  MechanismAllocationPolicyRecordV1,
  MechanismAllocationSelectionV1,
  MechanismAllocationStateV1,
  MechanismAuctionRoundV1,
  MechanismBidRevealV1,
  MechanismMissionDecompositionProposalV1,
} from "./mechanism-allocation-contracts.js";
import type { PlanningDigestV1 } from "@agentplat/collective-planning";
import {
  commitmentHashForMechanismBidRevealV1,
  createMechanismAllocationPlanV1,
  createMechanismAllocationSelectionV1,
  createMechanismAllocationStateV1,
  createMechanismAuctionRoundV1,
  validateMechanismAllocationPolicyV1,
  validateMechanismAllocationAdmissionBindingV1,
  validateMechanismAllocationStateForPolicyV1,
} from "./mechanism-allocation-validation.js";

/** Pure deterministic transition. All effects remain outside this reducer. */
/** @internal Only the authenticated runtime may invoke this state transition. */
export function reduceMechanismAllocationV1(input: {
  readonly state: MechanismAllocationStateV1;
  readonly policy: MechanismAllocationPolicyRecordV1;
  readonly event: MechanismAllocationAdmittedEventV1;
}): MechanismAllocationStateV1 {
  const policy = validateMechanismAllocationPolicyV1(input.policy);
  const state = validateMechanismAllocationStateForPolicyV1(
    input.state,
    policy,
  );
  const event = input.event.event;
  const admission = validateMechanismAllocationAdmissionBindingV1({
    event,
    admission: input.event.admission,
    proposal:
      state.proposal ?? (event.kind === "proposal" ? event.proposal : null),
  });
  const replay = state.admissions.find(
    (item) => item.eventDigest === admission.eventDigest,
  );
  if (replay) return state;
  if (state.admissions.length >= policy.policy.limits.maximumAdmissions)
    throw new TypeError("mechanism allocation admissions exceed policy");
  const membership = state.admissions[0];
  if (
    membership &&
    (membership.membershipEpoch !== admission.membershipEpoch ||
      membership.membershipConfigurationDigest !==
        admission.membershipConfigurationDigest)
  )
    throw new TypeError("mechanism allocation admission membership changed");
  const next =
    event.kind === "proposal"
      ? admitProposal(state, policy, event.proposal)
      : event.kind === "commitment"
        ? admitCommitment(state, policy, event.commitment)
        : event.kind === "reveal"
          ? admitReveal(state, policy, event.reveal)
          : event.kind === "clear"
            ? clearRound(state, policy, event.logicalTimeMs)
            : withdraw(state, policy, event.withdrawal);
  if (next === state) return state;
  return createMechanismAllocationStateV1({
    ...next,
    admissions: [...state.admissions, admission],
    admittedEvents: [...state.admittedEvents, event],
  });
}

function admitProposal(
  state: MechanismAllocationStateV1,
  policy: MechanismAllocationPolicyRecordV1,
  proposal: MechanismMissionDecompositionProposalV1,
): MechanismAllocationStateV1 {
  if (state.proposal?.proposalDigest === proposal.proposalDigest) return state;
  if (state.proposal !== null)
    throw new TypeError("mechanism allocation proposal is already fixed");
  if (proposal.observedAtLogicalMs < state.logicalTimeHighWaterMs)
    throw new TypeError("mechanism allocation logical time rollback");
  if (proposal.slots.length > policy.policy.limits.maximumSlots)
    throw new TypeError("mechanism allocation slots exceed policy");
  if (
    proposal.validUntilLogicalMs - proposal.observedAtLogicalMs >
    policy.policy.limits.maximumRoundDurationLogicalMs
  )
    throw new TypeError(
      "mechanism allocation proposal lifetime exceeds policy",
    );
  const auction = createMechanismAuctionRoundV1({
    auctionId: `auction.${proposal.proposalDigest.slice(7, 31)}`,
    proposalDigest: proposal.proposalDigest,
    round: 1,
    causalEpoch: proposal.causalEpoch,
    openedAtLogicalMs: proposal.observedAtLogicalMs,
    commitDeadlineLogicalMs:
      proposal.observedAtLogicalMs +
      Math.floor(
        (proposal.validUntilLogicalMs - proposal.observedAtLogicalMs) / 2,
      ),
    revealDeadlineLogicalMs: proposal.validUntilLogicalMs,
  });
  return commit(state, {
    proposal,
    auction,
    logicalTimeHighWaterMs: proposal.observedAtLogicalMs,
  });
}

function admitCommitment(
  state: MechanismAllocationStateV1,
  policy: MechanismAllocationPolicyRecordV1,
  commitment: MechanismAllocationStateV1["commitments"][number],
): MechanismAllocationStateV1 {
  const auction = currentAuction(state);
  if (state.plan && !hasPendingWithdrawal(state))
    throw new TypeError("mechanism allocation round is already cleared");
  if (
    commitment.auctionDigest !== auction.roundDigest ||
    commitment.round !== auction.round
  )
    throw new TypeError("mechanism commitment round is invalid");
  if (
    commitment.committedAtLogicalMs < state.logicalTimeHighWaterMs ||
    commitment.committedAtLogicalMs < auction.openedAtLogicalMs ||
    commitment.committedAtLogicalMs >= auction.commitDeadlineLogicalMs
  )
    throw new TypeError("mechanism commitment deadline is invalid");
  const same = state.commitments.find(
    (item) => item.commitmentId === commitment.commitmentId,
  );
  if (same?.commitmentDigest === commitment.commitmentDigest) return state;
  if (same)
    return commit(state, {
      equivocations: [
        ...state.equivocations,
        equivocation(
          commitment.bidderPeerId,
          auction.round,
          "commitment",
          same.commitmentDigest,
          commitment.commitmentDigest,
          commitment.committedAtLogicalMs,
        ),
      ],
      logicalTimeHighWaterMs: Math.max(
        state.logicalTimeHighWaterMs,
        commitment.committedAtLogicalMs,
      ),
    });
  const slotCommitment = state.commitments.find(
    (item) =>
      item.bidderPeerId === commitment.bidderPeerId &&
      item.slotId === commitment.slotId &&
      item.round === commitment.round,
  );
  if (slotCommitment)
    return commit(state, {
      equivocations: [
        ...state.equivocations,
        equivocation(
          commitment.bidderPeerId,
          auction.round,
          "commitment",
          slotCommitment.commitmentDigest,
          commitment.commitmentDigest,
          commitment.committedAtLogicalMs,
        ),
      ],
      logicalTimeHighWaterMs: Math.max(
        state.logicalTimeHighWaterMs,
        commitment.committedAtLogicalMs,
      ),
    });
  if (state.commitments.length >= policy.policy.limits.maximumCommitments)
    throw new TypeError("mechanism commitments exceed policy");
  return commit(state, {
    commitments: [...state.commitments, commitment],
    logicalTimeHighWaterMs: Math.max(
      state.logicalTimeHighWaterMs,
      commitment.committedAtLogicalMs,
    ),
  });
}

function admitReveal(
  state: MechanismAllocationStateV1,
  policy: MechanismAllocationPolicyRecordV1,
  reveal: MechanismBidRevealV1,
): MechanismAllocationStateV1 {
  const auction = currentAuction(state);
  if (state.plan && !hasPendingWithdrawal(state))
    throw new TypeError("mechanism allocation round is already cleared");
  if (
    reveal.auctionDigest !== auction.roundDigest ||
    reveal.round !== auction.round
  )
    throw new TypeError("mechanism reveal round is invalid");
  if (
    reveal.revealedAtLogicalMs < state.logicalTimeHighWaterMs ||
    reveal.revealedAtLogicalMs < auction.commitDeadlineLogicalMs ||
    reveal.revealedAtLogicalMs >= auction.revealDeadlineLogicalMs
  )
    throw new TypeError("mechanism reveal deadline is invalid");
  const seal = state.commitments.find(
    (item) => item.commitmentId === reveal.commitmentId,
  );
  if (
    !seal ||
    seal.bidderPeerId !== reveal.bidderPeerId ||
    seal.bidderInstanceId !== reveal.bidderInstanceId ||
    seal.bidderIndependenceGroupId !== reveal.bidderIndependenceGroupId ||
    seal.slotId !== reveal.slotId ||
    seal.commitmentHash !== commitmentHashForMechanismBidRevealV1(reveal)
  )
    throw new TypeError("mechanism reveal does not bind its commitment");
  const slot = state.proposal!.slots.find(
    (item) => item.slotId === reveal.slotId,
  );
  if (
    !slot ||
    !eligible(slot, reveal) ||
    reveal.declaredBudgetUnits > slot.budgetCeilingUnits ||
    reveal.availabilityUntilLogicalMs < auction.revealDeadlineLogicalMs
  )
    throw new TypeError("mechanism reveal is ineligible");
  const same = state.reveals.find(
    (item) =>
      item.bidderPeerId === reveal.bidderPeerId &&
      item.slotId === reveal.slotId &&
      item.round === reveal.round,
  );
  if (same?.revealDigest === reveal.revealDigest) return state;
  if (same)
    return commit(state, {
      equivocations: [
        ...state.equivocations,
        equivocation(
          reveal.bidderPeerId,
          auction.round,
          "reveal",
          same.revealDigest,
          reveal.revealDigest,
          reveal.revealedAtLogicalMs,
        ),
      ],
      logicalTimeHighWaterMs: Math.max(
        state.logicalTimeHighWaterMs,
        reveal.revealedAtLogicalMs,
      ),
    });
  if (
    state.reveals.length >= policy.policy.limits.maximumReveals ||
    state.reveals.filter(
      (item) => item.round === reveal.round && item.slotId === reveal.slotId,
    ).length >= policy.policy.limits.maximumBidsPerSlot
  )
    throw new TypeError("mechanism reveals exceed policy");
  return commit(state, {
    reveals: [...state.reveals, reveal],
    logicalTimeHighWaterMs: Math.max(
      state.logicalTimeHighWaterMs,
      reveal.revealedAtLogicalMs,
    ),
  });
}

function clearRound(
  state: MechanismAllocationStateV1,
  policy: MechanismAllocationPolicyRecordV1,
  logicalTimeMs: number,
): MechanismAllocationStateV1 {
  const auction = currentAuction(state);
  if (
    !Number.isSafeInteger(logicalTimeMs) ||
    logicalTimeMs < auction.revealDeadlineLogicalMs
  )
    throw new TypeError(
      "mechanism allocation cannot clear before reveal deadline",
    );
  if (state.plan && !hasPendingWithdrawal(state)) return state;
  const proposal = state.proposal!;
  const invalid = withdrawnSlots(state, auction.round);
  const carry =
    state.plan?.selections.filter((item) => !invalid.has(item.slotId)) ?? [];
  const pending = proposal.slots.filter(
    (slot) => !carry.some((item) => item.slotId === slot.slotId),
  );
  const selected = select(
    pending,
    state.reveals,
    policy,
    carry,
    state.equivocations,
    auction.round,
  );
  const selections = [...carry, ...selected].sort((a, b) =>
    compare(a.slotId, b.slotId),
  );
  const unallocatedSlotIds = proposal.slots
    .filter((slot) => !selections.some((item) => item.slotId === slot.slotId))
    .map((slot) => slot.slotId)
    .sort(compare);
  const plan = createMechanismAllocationPlanV1({
    planId: `allocation-plan.${auction.roundDigest.slice(7, 31)}`,
    auctionDigest: auction.roundDigest,
    proposalDigest: proposal.proposalDigest,
    round: auction.round,
    causalEpoch: auction.causalEpoch,
    selections,
    unallocatedSlotIds,
    totalDeclaredCostUnits: selections.reduce(
      (sum, item) => sum + item.declaredCostUnits,
      0,
    ),
    decidedAtLogicalMs: logicalTimeMs,
  });
  return commit(state, {
    plan,
    logicalTimeHighWaterMs: Math.max(
      state.logicalTimeHighWaterMs,
      logicalTimeMs,
    ),
  });
}

function withdraw(
  state: MechanismAllocationStateV1,
  policy: MechanismAllocationPolicyRecordV1,
  withdrawal: MechanismAllocationStateV1["withdrawals"][number],
): MechanismAllocationStateV1 {
  const auction = currentAuction(state);
  if (
    withdrawal.auctionDigest !== auction.roundDigest ||
    withdrawal.round !== auction.round
  )
    throw new TypeError("mechanism withdrawal round is invalid");
  if (
    withdrawal.observedAtLogicalMs < state.logicalTimeHighWaterMs ||
    withdrawal.observedAtLogicalMs < auction.revealDeadlineLogicalMs ||
    withdrawal.affectedSlotIds.some(
      (id) => !state.proposal!.slots.some((slot) => slot.slotId === id),
    )
  )
    throw new TypeError("mechanism withdrawal is invalid");
  if (
    !state.plan ||
    withdrawal.affectedSlotIds.length === 0 ||
    withdrawal.affectedSlotIds.some(
      (slotId) =>
        !state.plan!.selections.some(
          (selection) =>
            selection.slotId === slotId &&
            selection.bidderPeerId === withdrawal.peerId &&
            selection.bidderInstanceId === withdrawal.peerInstanceId &&
            selection.bidderIndependenceGroupId ===
              withdrawal.peerIndependenceGroupId,
        ),
    )
  )
    throw new TypeError("mechanism withdrawal must name selected peer slots");
  if (
    state.withdrawals.some(
      (item) => item.withdrawalDigest === withdrawal.withdrawalDigest,
    )
  )
    return state;
  if (auction.round >= policy.policy.limits.maximumRounds)
    throw new TypeError("mechanism allocation rounds exceed policy");
  const duration = auction.revealDeadlineLogicalMs - auction.openedAtLogicalMs;
  const next = createMechanismAuctionRoundV1({
    auctionId: auction.auctionId,
    proposalDigest: auction.proposalDigest,
    round: auction.round + 1,
    causalEpoch: auction.causalEpoch + 1,
    openedAtLogicalMs: withdrawal.observedAtLogicalMs,
    commitDeadlineLogicalMs:
      withdrawal.observedAtLogicalMs + Math.floor(duration / 2),
    revealDeadlineLogicalMs: withdrawal.observedAtLogicalMs + duration,
  });
  return commit(state, {
    auction: next,
    withdrawals: [...state.withdrawals, withdrawal],
    logicalTimeHighWaterMs: Math.max(
      state.logicalTimeHighWaterMs,
      withdrawal.observedAtLogicalMs,
    ),
  });
}

function select(
  slots: readonly MechanismMissionDecompositionProposalV1["slots"][number][],
  reveals: readonly MechanismBidRevealV1[],
  policy: MechanismAllocationPolicyRecordV1,
  carried: readonly MechanismAllocationSelectionV1[],
  equivocations: readonly MechanismAllocationStateV1["equivocations"][number][],
  round: number,
): readonly MechanismAllocationSelectionV1[] {
  const selected: MechanismAllocationSelectionV1[] = [];
  const remaining = [...slots].sort((left, right) =>
    compare(left.slotId, right.slotId),
  );
  let progressed = true;
  while (remaining.length && progressed) {
    progressed = false;
    for (let index = 0; index < remaining.length;) {
      const slot = remaining[index]!;
      if (
        !slot.dependsOnSlotIds.every((dependency) =>
          [...carried, ...selected].some((item) => item.slotId === dependency),
        )
      ) {
        index += 1;
        continue;
      }
      const candidates = reveals
        .filter(
          (reveal) =>
            reveal.round === round &&
            reveal.slotId === slot.slotId &&
            !equivocations.some(
              (item) =>
                item.peerId === reveal.bidderPeerId && item.round === round,
            ),
        )
        .sort(compareReveal);
      const winner = candidates.find((reveal) =>
        admissible([...carried, ...selected], reveal, policy),
      );
      if (winner)
        selected.push(
          createMechanismAllocationSelectionV1({
            slotId: winner.slotId,
            revealId: winner.revealId,
            revealDigest: winner.revealDigest,
            bidderPeerId: winner.bidderPeerId,
            bidderInstanceId: winner.bidderInstanceId,
            bidderIndependenceGroupId: winner.bidderIndependenceGroupId,
            declaredUtilityMicros: winner.declaredUtilityMicros,
            declaredCostUnits: winner.declaredCostUnits,
            declaredResourceUnits: winner.declaredResourceUnits,
            declaredBudgetUnits: winner.declaredBudgetUnits,
          }),
        );
      remaining.splice(index, 1);
      progressed = true;
    }
  }
  return selected;
}

function admissible(
  selected: readonly MechanismAllocationSelectionV1[],
  reveal: MechanismBidRevealV1,
  policy: MechanismAllocationPolicyRecordV1,
): boolean {
  const samePeer = selected.filter(
    (item) => item.bidderPeerId === reveal.bidderPeerId,
  );
  const sameGroup = selected.filter(
    (item) =>
      item.bidderIndependenceGroupId === reveal.bidderIndependenceGroupId,
  );
  if (
    samePeer.length >= policy.policy.maximumSlotsPerPeer ||
    sameGroup.length >= policy.policy.maximumSlotsPerIndependenceGroup
  )
    return false;
  if (policy.policy.requireDistinctIndependenceGroups && sameGroup.length)
    return false;
  if (
    samePeer.reduce((sum, item) => sum + item.declaredResourceUnits, 0) +
      reveal.declaredResourceUnits >
    policy.policy.maximumResourceUnitsPerPeer
  )
    return false;
  if (
    selected.reduce((sum, item) => sum + item.declaredBudgetUnits, 0) +
      reveal.declaredBudgetUnits >
    policy.policy.maximumTotalDeclaredBudgetUnits
  )
    return false;
  return (
    selected.reduce((sum, item) => sum + item.declaredCostUnits, 0) +
      reveal.declaredCostUnits <=
    policy.policy.maximumTotalDeclaredCostUnits
  );
}
function eligible(
  slot: MechanismMissionDecompositionProposalV1["slots"][number],
  reveal: MechanismBidRevealV1,
): boolean {
  return (
    (!slot.eligiblePeerIds.length ||
      slot.eligiblePeerIds.includes(reveal.bidderPeerId)) &&
    (!slot.eligibleIndependenceGroupIds.length ||
      slot.eligibleIndependenceGroupIds.includes(
        reveal.bidderIndependenceGroupId,
      )) &&
    (slot.requiredIndependenceGroupId === null ||
      slot.requiredIndependenceGroupId === reveal.bidderIndependenceGroupId)
  );
}
function currentAuction(
  state: MechanismAllocationStateV1,
): MechanismAuctionRoundV1 {
  if (!state.auction || !state.proposal)
    throw new TypeError("mechanism allocation proposal is required");
  return state.auction;
}
function withdrawnSlots(
  state: MechanismAllocationStateV1,
  round: number,
): Set<string> {
  return new Set(
    state.withdrawals
      .filter((item) => item.round === round - 1)
      .flatMap((item) => item.affectedSlotIds),
  );
}
function hasPendingWithdrawal(state: MechanismAllocationStateV1): boolean {
  return (
    !!state.plan &&
    state.auction !== null &&
    state.plan.round < state.auction.round
  );
}
function equivocation(
  peerId: string,
  round: number,
  kind: "commitment" | "reveal",
  firstDigest: PlanningDigestV1,
  conflictingDigest: PlanningDigestV1,
  detectedAtLogicalMs: number,
) {
  return {
    schemaVersion: 1 as const,
    peerId,
    round,
    kind,
    firstDigest,
    conflictingDigest,
    detectedAtLogicalMs,
  };
}
function commit(
  state: MechanismAllocationStateV1,
  changes: Partial<MechanismAllocationStateV1>,
): MechanismAllocationStateV1 {
  return createMechanismAllocationStateV1({
    ...state,
    ...changes,
    revision: state.revision + 1,
    predecessorStateDigest: state.stateDigest,
  });
}
function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function compareReveal(
  left: MechanismBidRevealV1,
  right: MechanismBidRevealV1,
): number {
  return (
    right.declaredUtilityMicros - left.declaredUtilityMicros ||
    left.declaredCostUnits - right.declaredCostUnits ||
    left.declaredResourceUnits - right.declaredResourceUnits ||
    compare(left.bidderPeerId, right.bidderPeerId) ||
    compare(left.revealId, right.revealId)
  );
}
