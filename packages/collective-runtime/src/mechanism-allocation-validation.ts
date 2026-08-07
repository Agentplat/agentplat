import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";

import type {
  MechanismAllocationPlanV1,
  MechanismAllocationAdmissionV1,
  MechanismAllocationEventV1,
  MechanismAllocationPolicyRecordV1,
  MechanismAllocationPolicyV1,
  MechanismAllocationSelectionV1,
  MechanismAllocationStateV1,
  MechanismAllocationWithdrawalV1,
  MechanismAuctionRoundV1,
  MechanismBidCommitmentV1,
  MechanismBidRevealV1,
  MechanismMissionDecompositionProposalV1,
  MechanismMissionScopeV1,
  MechanismSemanticWorkSlotV1,
} from "./mechanism-allocation-contracts.js";
import {
  MECHANISM_ALLOCATION_SCHEMA_VERSION_V1,
  MECHANISM_ALLOCATION_STATE_FORMAT_V1,
} from "./mechanism-allocation-contracts.js";
import { validateTeamFormationScopeV1 } from "./team-formation-validation.js";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const REASON = /^[A-Za-z0-9][A-Za-z0-9._:@/+-= ]{0,255}$/u;

/** The planning digest registry is closed; bind our local kind inside a registered envelope. */
const digest = (domain: string, value: unknown): PlanningDigestV1 =>
  digestPlanningJsonV1("planning-reducer-event", {
    mechanismKind: domain,
    value,
  } as PlanningJson);
const freeze = <T>(value: T): T => Object.freeze(value);
const array = <T>(values: readonly T[]): readonly T[] => freeze([...values]);
const fail = (message: string): never => {
  throw new TypeError(message);
};
const exact = (
  input: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> => {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail(`${label} is invalid`);
  const value = input as Record<string, unknown>;
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !(key in value))
  )
    fail(`${label} has unexpected fields`);
  return value;
};
const identifier = (value: unknown, label: string): string =>
  typeof value === "string" && ID.test(value)
    ? value
    : fail(`${label} is invalid`);
const key = (value: unknown, label: string): string =>
  typeof value === "string" && KEY.test(value)
    ? value
    : fail(`${label} is invalid`);
const sha = (value: unknown, label: string): PlanningDigestV1 =>
  typeof value === "string" && DIGEST.test(value)
    ? (value as PlanningDigestV1)
    : fail(`${label} is invalid`);
const nonNegative = (value: unknown, label: string): number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : fail(`${label} is invalid`);
const positive = (value: unknown, label: string): number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : fail(`${label} is invalid`);
const distinctIds = (input: unknown, label: string): readonly string[] => {
  if (!Array.isArray(input)) fail(`${label} is invalid`);
  const result = (input as unknown[]).map((value, index) =>
    identifier(value, `${label}[${index}]`),
  );
  if (
    new Set(result).size !== result.length ||
    result.join("\u0000") !== [...result].sort().join("\u0000")
  )
    fail(`${label} must be sorted and distinct`);
  return array(result);
};
const distinctKeys = (input: unknown, label: string): readonly string[] => {
  if (!Array.isArray(input)) fail(`${label} is invalid`);
  const result = (input as unknown[]).map((value, index) =>
    key(value, `${label}[${index}]`),
  );
  if (
    new Set(result).size !== result.length ||
    result.join("\u0000") !== [...result].sort().join("\u0000")
  )
    fail(`${label} must be sorted and distinct`);
  return array(result);
};

export function createMechanismAllocationPolicyV1(
  input: MechanismAllocationPolicyV1,
): MechanismAllocationPolicyRecordV1 {
  const policy = normalizePolicy(input);
  return freeze({
    schemaVersion: 1,
    policy,
    policyDigest: digest("mechanism-allocation-policy", policy),
  });
}
export function validateMechanismAllocationPolicyV1(
  input: unknown,
): MechanismAllocationPolicyRecordV1 {
  const value = exact(
    input,
    ["policy", "policyDigest", "schemaVersion"],
    "mechanism allocation policy record",
  );
  schema(value.schemaVersion, "mechanism allocation policy record");
  const policy = normalizePolicy(value.policy as MechanismAllocationPolicyV1);
  const policyDigest = digest("mechanism-allocation-policy", policy);
  if (value.policyDigest !== policyDigest)
    fail("mechanism allocation policy digest is invalid");
  return freeze({ schemaVersion: 1, policy, policyDigest });
}

export function createMechanismMissionScopeV1(
  input: Omit<MechanismMissionScopeV1, "scopeDigest" | "schemaVersion">,
): MechanismMissionScopeV1 {
  const body = freeze({
    schemaVersion: 1 as const,
    missionId: identifier(input.missionId, "scope.missionId"),
    missionEpoch: positive(input.missionEpoch, "scope.missionEpoch"),
    teamFormationScope: validateTeamFormationScopeV1(input.teamFormationScope),
    planningDigest: sha(input.planningDigest, "scope.planningDigest"),
  });
  return freeze({
    ...body,
    scopeDigest: digest("mechanism-mission-scope", body),
  });
}
export function validateMechanismMissionScopeV1(
  input: unknown,
): MechanismMissionScopeV1 {
  const value = exact(
    input,
    [
      "missionEpoch",
      "missionId",
      "planningDigest",
      "schemaVersion",
      "scopeDigest",
      "teamFormationScope",
    ],
    "mechanism mission scope",
  );
  const result = createMechanismMissionScopeV1(
    value as unknown as Omit<
      MechanismMissionScopeV1,
      "scopeDigest" | "schemaVersion"
    >,
  );
  if (value.scopeDigest !== result.scopeDigest)
    fail("mechanism mission scope digest is invalid");
  return result;
}

export function createMechanismSemanticWorkSlotV1(
  input: Omit<MechanismSemanticWorkSlotV1, "slotDigest" | "schemaVersion">,
): MechanismSemanticWorkSlotV1 {
  const body = freeze({
    schemaVersion: 1 as const,
    slotId: identifier(input.slotId, "slot.slotId"),
    semanticRoleKey: key(input.semanticRoleKey, "slot.semanticRoleKey"),
    requiredCapabilityKeys: distinctKeys(
      input.requiredCapabilityKeys,
      "slot.requiredCapabilityKeys",
    ),
    dependsOnSlotIds: distinctIds(
      input.dependsOnSlotIds,
      "slot.dependsOnSlotIds",
    ),
    eligiblePeerIds: distinctIds(input.eligiblePeerIds, "slot.eligiblePeerIds"),
    eligibleIndependenceGroupIds: distinctIds(
      input.eligibleIndependenceGroupIds,
      "slot.eligibleIndependenceGroupIds",
    ),
    requiredIndependenceGroupId:
      input.requiredIndependenceGroupId === null
        ? null
        : identifier(
            input.requiredIndependenceGroupId,
            "slot.requiredIndependenceGroupId",
          ),
    budgetCeilingUnits: positive(
      input.budgetCeilingUnits,
      "slot.budgetCeilingUnits",
    ),
  });
  if (body.dependsOnSlotIds.includes(body.slotId))
    fail("slot cannot depend on itself");
  return freeze({
    ...body,
    slotDigest: digest("mechanism-semantic-work-slot", body),
  });
}
export function validateMechanismSemanticWorkSlotV1(
  input: unknown,
): MechanismSemanticWorkSlotV1 {
  const value = exact(
    input,
    [
      "budgetCeilingUnits",
      "dependsOnSlotIds",
      "eligibleIndependenceGroupIds",
      "eligiblePeerIds",
      "requiredCapabilityKeys",
      "requiredIndependenceGroupId",
      "schemaVersion",
      "semanticRoleKey",
      "slotDigest",
      "slotId",
    ],
    "mechanism semantic work slot",
  );
  schema(value.schemaVersion, "mechanism semantic work slot");
  const result = createMechanismSemanticWorkSlotV1(
    value as unknown as Omit<
      MechanismSemanticWorkSlotV1,
      "slotDigest" | "schemaVersion"
    >,
  );
  if (value.slotDigest !== result.slotDigest)
    fail("mechanism semantic work slot digest is invalid");
  return result;
}

export function createMechanismMissionDecompositionProposalV1(
  input: Omit<
    MechanismMissionDecompositionProposalV1,
    "proposalDigest" | "schemaVersion"
  >,
): MechanismMissionDecompositionProposalV1 {
  const slots = (input.slots as readonly unknown[]).map(
    validateMechanismSemanticWorkSlotV1,
  );
  const slotIds = slots.map((slot) => slot.slotId);
  if (
    !slots.length ||
    new Set(slotIds).size !== slots.length ||
    slotIds.join("\u0000") !== [...slotIds].sort().join("\u0000")
  )
    fail("proposal slots must be sorted and distinct");
  const body = freeze({
    schemaVersion: 1 as const,
    proposalId: identifier(input.proposalId, "proposal.proposalId"),
    proposerPeerId: identifier(input.proposerPeerId, "proposal.proposerPeerId"),
    proposerInstanceId: identifier(
      input.proposerInstanceId,
      "proposal.proposerInstanceId",
    ),
    proposerIndependenceGroupId: identifier(
      input.proposerIndependenceGroupId,
      "proposal.proposerIndependenceGroupId",
    ),
    scope: validateMechanismMissionScopeV1(input.scope),
    parentProposalDigest:
      input.parentProposalDigest === null
        ? null
        : sha(input.parentProposalDigest, "proposal.parentProposalDigest"),
    causalEpoch: positive(input.causalEpoch, "proposal.causalEpoch"),
    observedAtLogicalMs: nonNegative(
      input.observedAtLogicalMs,
      "proposal.observedAtLogicalMs",
    ),
    validUntilLogicalMs: positive(
      input.validUntilLogicalMs,
      "proposal.validUntilLogicalMs",
    ),
    slots: array(slots),
  });
  if (body.validUntilLogicalMs <= body.observedAtLogicalMs)
    fail("proposal validity is invalid");
  for (const slot of slots)
    for (const dep of slot.dependsOnSlotIds)
      if (!slotIds.includes(dep)) fail("slot dependency is outside proposal");
  assertAcyclicSlots(slots);
  return freeze({
    ...body,
    proposalDigest: digest("mechanism-mission-decomposition-proposal", body),
  });
}
export function validateMechanismMissionDecompositionProposalV1(
  input: unknown,
): MechanismMissionDecompositionProposalV1 {
  const value = exact(
    input,
    [
      "causalEpoch",
      "observedAtLogicalMs",
      "parentProposalDigest",
      "proposalDigest",
      "proposalId",
      "proposerIndependenceGroupId",
      "proposerInstanceId",
      "proposerPeerId",
      "schemaVersion",
      "scope",
      "slots",
      "validUntilLogicalMs",
    ],
    "mechanism decomposition proposal",
  );
  schema(value.schemaVersion, "mechanism decomposition proposal");
  const result = createMechanismMissionDecompositionProposalV1(
    value as unknown as Omit<
      MechanismMissionDecompositionProposalV1,
      "proposalDigest" | "schemaVersion"
    >,
  );
  if (value.proposalDigest !== result.proposalDigest)
    fail("mechanism decomposition proposal digest is invalid");
  return result;
}

export function createMechanismAuctionRoundV1(
  input: Omit<MechanismAuctionRoundV1, "roundDigest" | "schemaVersion">,
): MechanismAuctionRoundV1 {
  const body = freeze({
    schemaVersion: 1 as const,
    auctionId: identifier(input.auctionId, "auction.auctionId"),
    proposalDigest: sha(input.proposalDigest, "auction.proposalDigest"),
    round: positive(input.round, "auction.round"),
    causalEpoch: positive(input.causalEpoch, "auction.causalEpoch"),
    openedAtLogicalMs: nonNegative(
      input.openedAtLogicalMs,
      "auction.openedAtLogicalMs",
    ),
    commitDeadlineLogicalMs: positive(
      input.commitDeadlineLogicalMs,
      "auction.commitDeadlineLogicalMs",
    ),
    revealDeadlineLogicalMs: positive(
      input.revealDeadlineLogicalMs,
      "auction.revealDeadlineLogicalMs",
    ),
  });
  if (!(
    body.openedAtLogicalMs < body.commitDeadlineLogicalMs &&
    body.commitDeadlineLogicalMs < body.revealDeadlineLogicalMs
  ))
    fail("auction deadlines are invalid");
  return freeze({
    ...body,
    roundDigest: digest("mechanism-auction-round", body),
  });
}
export function validateMechanismAuctionRoundV1(
  input: unknown,
): MechanismAuctionRoundV1 {
  const value = exact(
    input,
    [
      "auctionId",
      "causalEpoch",
      "commitDeadlineLogicalMs",
      "openedAtLogicalMs",
      "proposalDigest",
      "revealDeadlineLogicalMs",
      "round",
      "roundDigest",
      "schemaVersion",
    ],
    "mechanism auction round",
  );
  schema(value.schemaVersion, "mechanism auction round");
  const result = createMechanismAuctionRoundV1(
    value as unknown as Omit<
      MechanismAuctionRoundV1,
      "roundDigest" | "schemaVersion"
    >,
  );
  if (value.roundDigest !== result.roundDigest)
    fail("mechanism auction round digest is invalid");
  return result;
}

export function createMechanismBidCommitmentV1(
  input: Omit<MechanismBidCommitmentV1, "commitmentDigest" | "schemaVersion">,
): MechanismBidCommitmentV1 {
  const body = freeze({
    schemaVersion: 1 as const,
    commitmentId: identifier(input.commitmentId, "commitment.commitmentId"),
    auctionDigest: sha(input.auctionDigest, "commitment.auctionDigest"),
    round: positive(input.round, "commitment.round"),
    bidderPeerId: identifier(input.bidderPeerId, "commitment.bidderPeerId"),
    bidderInstanceId: identifier(
      input.bidderInstanceId,
      "commitment.bidderInstanceId",
    ),
    bidderIndependenceGroupId: identifier(
      input.bidderIndependenceGroupId,
      "commitment.bidderIndependenceGroupId",
    ),
    slotId: identifier(input.slotId, "commitment.slotId"),
    commitmentHash: sha(input.commitmentHash, "commitment.commitmentHash"),
    committedAtLogicalMs: nonNegative(
      input.committedAtLogicalMs,
      "commitment.committedAtLogicalMs",
    ),
  });
  return freeze({
    ...body,
    commitmentDigest: digest("mechanism-bid-commitment", body),
  });
}
export function validateMechanismBidCommitmentV1(
  input: unknown,
): MechanismBidCommitmentV1 {
  const value = exact(
    input,
    [
      "auctionDigest",
      "bidderIndependenceGroupId",
      "bidderInstanceId",
      "bidderPeerId",
      "commitmentDigest",
      "commitmentHash",
      "commitmentId",
      "committedAtLogicalMs",
      "round",
      "schemaVersion",
      "slotId",
    ],
    "mechanism bid commitment",
  );
  schema(value.schemaVersion, "mechanism bid commitment");
  const result = createMechanismBidCommitmentV1(
    value as unknown as Omit<
      MechanismBidCommitmentV1,
      "commitmentDigest" | "schemaVersion"
    >,
  );
  if (value.commitmentDigest !== result.commitmentDigest)
    fail("mechanism bid commitment digest is invalid");
  return result;
}

export function commitmentHashForMechanismBidRevealV1(
  input: Omit<
    MechanismBidRevealV1,
    "revealDigest" | "schemaVersion" | "commitmentId" | "revealedAtLogicalMs"
  >,
): PlanningDigestV1 {
  return digest("mechanism-bid-seal", normalizeRevealBody(input));
}
export function createMechanismBidRevealV1(
  input: Omit<MechanismBidRevealV1, "revealDigest" | "schemaVersion">,
): MechanismBidRevealV1 {
  const body = normalizeRevealBody(input);
  const complete = freeze({
    ...body,
    commitmentId: identifier(input.commitmentId, "reveal.commitmentId"),
    revealedAtLogicalMs: nonNegative(
      input.revealedAtLogicalMs,
      "reveal.revealedAtLogicalMs",
    ),
  });
  return freeze({
    ...complete,
    revealDigest: digest("mechanism-bid-reveal", complete),
  });
}
export function validateMechanismBidRevealV1(
  input: unknown,
): MechanismBidRevealV1 {
  const value = exact(
    input,
    [
      "auctionDigest",
      "availabilityUntilLogicalMs",
      "bidderIndependenceGroupId",
      "bidderInstanceId",
      "bidderPeerId",
      "commitmentId",
      "declaredBudgetUnits",
      "declaredCostUnits",
      "declaredResourceUnits",
      "declaredUtilityMicros",
      "nonceDigest",
      "revealDigest",
      "revealId",
      "revealedAtLogicalMs",
      "round",
      "schemaVersion",
      "slotId",
    ],
    "mechanism bid reveal",
  );
  schema(value.schemaVersion, "mechanism bid reveal");
  const result = createMechanismBidRevealV1(
    value as unknown as Omit<
      MechanismBidRevealV1,
      "revealDigest" | "schemaVersion"
    >,
  );
  if (value.revealDigest !== result.revealDigest)
    fail("mechanism bid reveal digest is invalid");
  return result;
}

export function createMechanismAllocationSelectionV1(
  input: Omit<
    MechanismAllocationSelectionV1,
    "selectionDigest" | "schemaVersion"
  >,
): MechanismAllocationSelectionV1 {
  const body = freeze({
    schemaVersion: 1 as const,
    slotId: identifier(input.slotId, "selection.slotId"),
    revealId: identifier(input.revealId, "selection.revealId"),
    revealDigest: sha(input.revealDigest, "selection.revealDigest"),
    bidderPeerId: identifier(input.bidderPeerId, "selection.bidderPeerId"),
    bidderInstanceId: identifier(
      input.bidderInstanceId,
      "selection.bidderInstanceId",
    ),
    bidderIndependenceGroupId: identifier(
      input.bidderIndependenceGroupId,
      "selection.bidderIndependenceGroupId",
    ),
    declaredUtilityMicros: nonNegative(
      input.declaredUtilityMicros,
      "selection.declaredUtilityMicros",
    ),
    declaredCostUnits: positive(
      input.declaredCostUnits,
      "selection.declaredCostUnits",
    ),
    declaredResourceUnits: positive(
      input.declaredResourceUnits,
      "selection.declaredResourceUnits",
    ),
    declaredBudgetUnits: positive(
      input.declaredBudgetUnits,
      "selection.declaredBudgetUnits",
    ),
  });
  return freeze({
    ...body,
    selectionDigest: digest("mechanism-allocation-selection", body),
  });
}
export function createMechanismAllocationPlanV1(
  input: Omit<
    MechanismAllocationPlanV1,
    "planDigest" | "schemaVersion" | "advisoryOnly"
  >,
): MechanismAllocationPlanV1 {
  const selections = (input.selections as readonly unknown[]).map((value) =>
    createMechanismAllocationSelectionV1(
      value as Omit<
        MechanismAllocationSelectionV1,
        "selectionDigest" | "schemaVersion"
      >,
    ),
  );
  const selectionSlots = selections.map((item) => item.slotId);
  if (
    new Set(selectionSlots).size !== selectionSlots.length ||
    selectionSlots.join("\u0000") !== [...selectionSlots].sort().join("\u0000")
  )
    fail("plan selections must be sorted and distinct");
  const unallocatedSlotIds = distinctIds(
    input.unallocatedSlotIds,
    "plan.unallocatedSlotIds",
  );
  if (selectionSlots.some((id) => unallocatedSlotIds.includes(id)))
    fail("plan slot is both selected and unallocated");
  const totalDeclaredCostUnits = selections.reduce(
    (total, item) => total + item.declaredCostUnits,
    0,
  );
  if (
    totalDeclaredCostUnits !==
    nonNegative(input.totalDeclaredCostUnits, "plan.totalDeclaredCostUnits")
  )
    fail("plan cost is invalid");
  const body = freeze({
    schemaVersion: 1 as const,
    planId: identifier(input.planId, "plan.planId"),
    auctionDigest: sha(input.auctionDigest, "plan.auctionDigest"),
    proposalDigest: sha(input.proposalDigest, "plan.proposalDigest"),
    round: positive(input.round, "plan.round"),
    causalEpoch: positive(input.causalEpoch, "plan.causalEpoch"),
    advisoryOnly: true as const,
    selections: array(selections),
    unallocatedSlotIds,
    totalDeclaredCostUnits,
    decidedAtLogicalMs: nonNegative(
      input.decidedAtLogicalMs,
      "plan.decidedAtLogicalMs",
    ),
  });
  return freeze({
    ...body,
    planDigest: digest("mechanism-allocation-plan", body),
  });
}

export function createMechanismAllocationWithdrawalV1(
  input: Omit<
    MechanismAllocationWithdrawalV1,
    "withdrawalDigest" | "schemaVersion"
  >,
): MechanismAllocationWithdrawalV1 {
  const body = freeze({
    schemaVersion: 1 as const,
    withdrawalId: identifier(input.withdrawalId, "withdrawal.withdrawalId"),
    auctionDigest: sha(input.auctionDigest, "withdrawal.auctionDigest"),
    round: positive(input.round, "withdrawal.round"),
    peerId: identifier(input.peerId, "withdrawal.peerId"),
    peerInstanceId: identifier(
      input.peerInstanceId,
      "withdrawal.peerInstanceId",
    ),
    peerIndependenceGroupId: identifier(
      input.peerIndependenceGroupId,
      "withdrawal.peerIndependenceGroupId",
    ),
    affectedSlotIds: distinctIds(
      input.affectedSlotIds,
      "withdrawal.affectedSlotIds",
    ),
    reasonCode:
      typeof input.reasonCode === "string" && REASON.test(input.reasonCode)
        ? input.reasonCode
        : fail("withdrawal.reasonCode is invalid"),
    observedAtLogicalMs: nonNegative(
      input.observedAtLogicalMs,
      "withdrawal.observedAtLogicalMs",
    ),
  });
  return freeze({
    ...body,
    withdrawalDigest: digest("mechanism-allocation-withdrawal", body),
  });
}
export function validateMechanismAllocationWithdrawalV1(
  input: unknown,
): MechanismAllocationWithdrawalV1 {
  const value = exact(
    input,
    [
      "affectedSlotIds",
      "auctionDigest",
      "observedAtLogicalMs",
      "peerId",
      "peerIndependenceGroupId",
      "peerInstanceId",
      "reasonCode",
      "round",
      "schemaVersion",
      "withdrawalDigest",
      "withdrawalId",
    ],
    "mechanism allocation withdrawal",
  );
  schema(value.schemaVersion, "mechanism allocation withdrawal");
  const result = createMechanismAllocationWithdrawalV1(
    value as unknown as Omit<
      MechanismAllocationWithdrawalV1,
      "withdrawalDigest" | "schemaVersion"
    >,
  );
  if (value.withdrawalDigest !== result.withdrawalDigest)
    fail("mechanism allocation withdrawal digest is invalid");
  return result;
}

export function mechanismAllocationEventDigestV1(
  event: MechanismAllocationEventV1,
): PlanningDigestV1 {
  const record =
    event.kind === "proposal"
      ? validateMechanismMissionDecompositionProposalV1(event.proposal)
      : event.kind === "commitment"
        ? validateMechanismBidCommitmentV1(event.commitment)
        : event.kind === "reveal"
          ? validateMechanismBidRevealV1(event.reveal)
          : event.kind === "withdrawal"
            ? validateMechanismAllocationWithdrawalV1(event.withdrawal)
            : freeze({
                logicalTimeMs: nonNegative(
                  event.logicalTimeMs,
                  "clear.logicalTimeMs",
                ),
                clearingPeerId: identifier(
                  event.clearingPeerId,
                  "clear.clearingPeerId",
                ),
                clearingInstanceId: identifier(
                  event.clearingInstanceId,
                  "clear.clearingInstanceId",
                ),
                clearingIndependenceGroupId: identifier(
                  event.clearingIndependenceGroupId,
                  "clear.clearingIndependenceGroupId",
                ),
              });
  return digest("mechanism-allocation-event", { kind: event.kind, record });
}
export function validateMechanismAllocationEventV1(
  input: unknown,
): MechanismAllocationEventV1 {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail("mechanism allocation event is invalid");
  const event = input as MechanismAllocationEventV1;
  if (event.kind === "proposal")
    return freeze({
      kind: "proposal" as const,
      proposal: validateMechanismMissionDecompositionProposalV1(event.proposal),
    });
  if (event.kind === "commitment")
    return freeze({
      kind: "commitment" as const,
      commitment: validateMechanismBidCommitmentV1(event.commitment),
    });
  if (event.kind === "reveal")
    return freeze({
      kind: "reveal" as const,
      reveal: validateMechanismBidRevealV1(event.reveal),
    });
  if (event.kind === "withdrawal")
    return freeze({
      kind: "withdrawal" as const,
      withdrawal: validateMechanismAllocationWithdrawalV1(event.withdrawal),
    });
  if (event.kind === "clear")
    return freeze({
      kind: "clear" as const,
      logicalTimeMs: nonNegative(event.logicalTimeMs, "clear.logicalTimeMs"),
      clearingPeerId: identifier(event.clearingPeerId, "clear.clearingPeerId"),
      clearingInstanceId: identifier(
        event.clearingInstanceId,
        "clear.clearingInstanceId",
      ),
      clearingIndependenceGroupId: identifier(
        event.clearingIndependenceGroupId,
        "clear.clearingIndependenceGroupId",
      ),
    });
  return fail("mechanism allocation event is invalid");
}

export function createMechanismAllocationAdmissionV1(
  input: Omit<
    MechanismAllocationAdmissionV1,
    "admissionDigest" | "schemaVersion"
  >,
): MechanismAllocationAdmissionV1 {
  const eventKinds = new Set([
    "proposal",
    "commitment",
    "reveal",
    "clear",
    "withdrawal",
  ]);
  const body = freeze({
    schemaVersion: 1 as const,
    admissionId: identifier(input.admissionId, "admission.admissionId"),
    eventKind:
      typeof input.eventKind === "string" && eventKinds.has(input.eventKind)
        ? (input.eventKind as MechanismAllocationEventV1["kind"])
        : fail("admission.eventKind is invalid"),
    eventDigest: sha(input.eventDigest, "admission.eventDigest"),
    actorPeerId: identifier(input.actorPeerId, "admission.actorPeerId"),
    actorInstanceId: identifier(
      input.actorInstanceId,
      "admission.actorInstanceId",
    ),
    actorIndependenceGroupId: identifier(
      input.actorIndependenceGroupId,
      "admission.actorIndependenceGroupId",
    ),
    membershipEpoch: positive(
      input.membershipEpoch,
      "admission.membershipEpoch",
    ),
    membershipConfigurationDigest: sha(
      input.membershipConfigurationDigest,
      "admission.membershipConfigurationDigest",
    ),
    capabilityStateDigest: sha(
      input.capabilityStateDigest,
      "admission.capabilityStateDigest",
    ),
    authorizedCapabilityKeys: distinctKeys(
      input.authorizedCapabilityKeys,
      "admission.authorizedCapabilityKeys",
    ),
    authenticatedAtLogicalMs: nonNegative(
      input.authenticatedAtLogicalMs,
      "admission.authenticatedAtLogicalMs",
    ),
    validUntilLogicalMs: positive(
      input.validUntilLogicalMs,
      "admission.validUntilLogicalMs",
    ),
    evidenceDigest: sha(input.evidenceDigest, "admission.evidenceDigest"),
  });
  if (body.validUntilLogicalMs <= body.authenticatedAtLogicalMs)
    fail("admission validity is invalid");
  return freeze({
    ...body,
    admissionDigest: digest("mechanism-allocation-admission", body),
  });
}
export function validateMechanismAllocationAdmissionV1(
  input: unknown,
): MechanismAllocationAdmissionV1 {
  const value = exact(
    input,
    [
      "actorIndependenceGroupId",
      "actorInstanceId",
      "actorPeerId",
      "admissionDigest",
      "admissionId",
      "authenticatedAtLogicalMs",
      "authorizedCapabilityKeys",
      "capabilityStateDigest",
      "eventDigest",
      "eventKind",
      "evidenceDigest",
      "membershipConfigurationDigest",
      "membershipEpoch",
      "schemaVersion",
      "validUntilLogicalMs",
    ],
    "mechanism allocation admission",
  );
  schema(value.schemaVersion, "mechanism allocation admission");
  const result = createMechanismAllocationAdmissionV1(
    value as unknown as Omit<
      MechanismAllocationAdmissionV1,
      "admissionDigest" | "schemaVersion"
    >,
  );
  if (value.admissionDigest !== result.admissionDigest)
    fail("mechanism allocation admission digest is invalid");
  return result;
}

export function validateMechanismAllocationAdmissionBindingV1(input: {
  readonly event: MechanismAllocationEventV1;
  readonly admission: MechanismAllocationAdmissionV1;
  readonly proposal: MechanismMissionDecompositionProposalV1 | null;
}): MechanismAllocationAdmissionV1 {
  const admission = validateMechanismAllocationAdmissionV1(input.admission);
  const eventDigest = mechanismAllocationEventDigestV1(input.event);
  const actor = mechanismAllocationEventActorV1(input.event);
  const eventTime = mechanismAllocationEventLogicalTimeV1(input.event);
  const required = requiredCapabilitiesForMechanismAllocationEventV1(
    input.event,
    input.proposal,
  );
  if (
    admission.eventKind !== input.event.kind ||
    admission.eventDigest !== eventDigest ||
    admission.actorPeerId !== actor.peerId ||
    admission.actorInstanceId !== actor.instanceId ||
    admission.actorIndependenceGroupId !== actor.independenceGroupId ||
    admission.authenticatedAtLogicalMs > eventTime ||
    admission.validUntilLogicalMs <= eventTime ||
    required.some(
      (capability) => !admission.authorizedCapabilityKeys.includes(capability),
    )
  )
    fail("mechanism allocation admission binding is invalid");
  return admission;
}

export function createMechanismAllocationStateV1(
  input: Omit<
    MechanismAllocationStateV1,
    "stateDigest" | "format" | "schemaVersion"
  >,
): MechanismAllocationStateV1 {
  const proposal =
    input.proposal === null
      ? null
      : validateMechanismMissionDecompositionProposalV1(input.proposal);
  const auction =
    input.auction === null
      ? null
      : validateMechanismAuctionRoundV1(input.auction);
  const commitments = (input.commitments as readonly unknown[]).map(
    validateMechanismBidCommitmentV1,
  );
  const reveals = (input.reveals as readonly unknown[]).map(
    validateMechanismBidRevealV1,
  );
  const withdrawals = (input.withdrawals as readonly unknown[]).map(
    validateMechanismAllocationWithdrawalV1,
  );
  const admissions = (input.admissions as readonly unknown[]).map(
    validateMechanismAllocationAdmissionV1,
  );
  const admittedEvents = (input.admittedEvents as readonly unknown[]).map(
    validateMechanismAllocationEventV1,
  );
  unique(
    commitments.map((item) => item.commitmentId),
    "state commitments",
  );
  unique(
    commitments.map(
      (item) => `${item.round}\u0000${item.bidderPeerId}\u0000${item.slotId}`,
    ),
    "state commitment bidder slots",
  );
  unique(
    reveals.map((item) => item.revealId),
    "state reveals",
  );
  unique(
    reveals.map(
      (item) => `${item.round}\u0000${item.bidderPeerId}\u0000${item.slotId}`,
    ),
    "state reveal bidder slots",
  );
  unique(
    withdrawals.map((item) => item.withdrawalId),
    "state withdrawals",
  );
  unique(
    admissions.map((item) => item.admissionId),
    "state admissions",
  );
  unique(
    admissions.map((item) => item.eventDigest),
    "state admitted events",
  );
  if (
    admissions.length !== admittedEvents.length ||
    admissions.some(
      (admission, index) =>
        admission.eventDigest !==
          mechanismAllocationEventDigestV1(admittedEvents[index]!) ||
        admission.eventKind !== admittedEvents[index]!.kind,
    )
  )
    fail("state admission events are inconsistent");
  const plan =
    input.plan === null ? null : validateMechanismAllocationPlanV1(input.plan);
  const body = freeze({
    format: MECHANISM_ALLOCATION_STATE_FORMAT_V1,
    schemaVersion: MECHANISM_ALLOCATION_SCHEMA_VERSION_V1,
    stateKey: identifier(input.stateKey, "state.stateKey"),
    allocationId: identifier(input.allocationId, "state.allocationId"),
    allocationVersion: positive(
      input.allocationVersion,
      "state.allocationVersion",
    ),
    implementationId: identifier(
      input.implementationId,
      "state.implementationId",
    ),
    policyDigest: sha(input.policyDigest, "state.policyDigest"),
    revision: nonNegative(input.revision, "state.revision"),
    logicalTimeHighWaterMs: nonNegative(
      input.logicalTimeHighWaterMs,
      "state.logicalTimeHighWaterMs",
    ),
    proposal,
    auction,
    commitments: array(commitments),
    reveals: array(reveals),
    plan,
    withdrawals: array(withdrawals),
    equivocations: array(
      input.equivocations.map((item) =>
        freeze({
          schemaVersion: 1 as const,
          peerId: identifier(item.peerId, "equivocation.peerId"),
          round: positive(item.round, "equivocation.round"),
          kind:
            item.kind === "commitment" || item.kind === "reveal"
              ? item.kind
              : fail("equivocation.kind is invalid"),
          firstDigest: sha(item.firstDigest, "equivocation.firstDigest"),
          conflictingDigest: sha(
            item.conflictingDigest,
            "equivocation.conflictingDigest",
          ),
          detectedAtLogicalMs: nonNegative(
            item.detectedAtLogicalMs,
            "equivocation.detectedAtLogicalMs",
          ),
        }),
      ),
    ),
    admissions: array(admissions),
    admittedEvents: array(admittedEvents),
    predecessorStateDigest:
      input.predecessorStateDigest === null
        ? null
        : sha(input.predecessorStateDigest, "state.predecessorStateDigest"),
  });
  return freeze({
    ...body,
    stateDigest: digest("mechanism-allocation-state", body),
  });
}
export function validateMechanismAllocationStateV1(
  input: unknown,
): MechanismAllocationStateV1 {
  const value = exact(
    input,
    [
      "admissions",
      "admittedEvents",
      "allocationId",
      "allocationVersion",
      "auction",
      "commitments",
      "equivocations",
      "format",
      "implementationId",
      "logicalTimeHighWaterMs",
      "plan",
      "policyDigest",
      "predecessorStateDigest",
      "proposal",
      "reveals",
      "revision",
      "schemaVersion",
      "stateDigest",
      "stateKey",
      "withdrawals",
    ],
    "mechanism allocation state",
  );
  if (value.format !== MECHANISM_ALLOCATION_STATE_FORMAT_V1)
    fail("mechanism allocation state format is invalid");
  schema(value.schemaVersion, "mechanism allocation state");
  const result = createMechanismAllocationStateV1(
    value as unknown as Omit<
      MechanismAllocationStateV1,
      "stateDigest" | "format" | "schemaVersion"
    >,
  );
  if (value.stateDigest !== result.stateDigest)
    fail("mechanism allocation state digest is invalid");
  return result;
}

/** Additional restore boundary: a digest-valid snapshot must also be causally usable. */
export function validateMechanismAllocationStateForPolicyV1(
  input: unknown,
  policyInput: MechanismAllocationPolicyRecordV1,
): MechanismAllocationStateV1 {
  const state = validateMechanismAllocationStateV1(input);
  const policy = validateMechanismAllocationPolicyV1(policyInput).policy;
  if (
    state.revision === 0
      ? state.predecessorStateDigest !== null
      : state.predecessorStateDigest === null
  )
    fail("mechanism allocation state predecessor is invalid");
  if (state.revision !== state.admissions.length)
    fail("mechanism allocation state revision is not admission-complete");
  if (state.proposal === null || state.auction === null) {
    if (
      state.proposal !== null ||
      state.auction !== null ||
      state.commitments.length ||
      state.reveals.length ||
      state.plan !== null ||
      state.withdrawals.length ||
      state.equivocations.length ||
      state.admissions.length ||
      state.admittedEvents.length
    )
      fail("mechanism allocation empty state is inconsistent");
    return state;
  }
  const proposal = state.proposal;
  const auction = state.auction;
  if (
    proposal.slots.length > policy.limits.maximumSlots ||
    auction.proposalDigest !== proposal.proposalDigest ||
    auction.round > policy.limits.maximumRounds ||
    auction.causalEpoch < proposal.causalEpoch ||
    auction.revealDeadlineLogicalMs - auction.openedAtLogicalMs >
      policy.limits.maximumRoundDurationLogicalMs
  )
    fail("mechanism allocation proposal or auction binding is invalid");
  const observedTimes = [
    proposal.observedAtLogicalMs,
    ...state.commitments.map((item) => item.committedAtLogicalMs),
    ...state.reveals.map((item) => item.revealedAtLogicalMs),
    ...state.withdrawals.map((item) => item.observedAtLogicalMs),
    ...state.equivocations.map((item) => item.detectedAtLogicalMs),
    ...state.admissions.map((item) => item.authenticatedAtLogicalMs),
    ...state.admittedEvents.map(mechanismAllocationEventLogicalTimeV1),
    ...(state.plan ? [state.plan.decidedAtLogicalMs] : []),
  ];
  if (observedTimes.some((time) => time > state.logicalTimeHighWaterMs))
    fail("mechanism allocation logical time high water is invalid");
  if (
    state.commitments.length > policy.limits.maximumCommitments ||
    state.reveals.length > policy.limits.maximumReveals ||
    state.admissions.length > policy.limits.maximumAdmissions ||
    state.withdrawals.length > policy.limits.maximumRounds - 1
  )
    fail("mechanism allocation collection exceeds policy");
  const membership = state.admissions[0];
  if (
    !membership ||
    state.admissions.some(
      (item) =>
        item.membershipEpoch !== membership.membershipEpoch ||
        item.membershipConfigurationDigest !==
          membership.membershipConfigurationDigest,
    )
  )
    fail("mechanism allocation admission membership changed");
  state.admittedEvents.forEach((event, index) =>
    validateMechanismAllocationAdmissionBindingV1({
      event,
      admission: state.admissions[index]!,
      proposal,
    }),
  );
  for (const commitment of state.commitments) {
    const roundDigest = digestForRound(state, commitment.round);
    if (
      commitment.auctionDigest !== roundDigest ||
      !proposal.slots.some((slot) => slot.slotId === commitment.slotId) ||
      !hasAdmission(state, { kind: "commitment", commitment })
    )
      fail("mechanism allocation commitment binding is invalid");
    if (
      commitment.round === auction.round &&
      (commitment.committedAtLogicalMs < auction.openedAtLogicalMs ||
        commitment.committedAtLogicalMs >= auction.commitDeadlineLogicalMs)
    )
      fail("mechanism allocation commitment deadline is invalid");
  }
  for (const reveal of state.reveals) {
    const slot = proposal.slots.find((item) => item.slotId === reveal.slotId);
    const commitment = state.commitments.find(
      (item) => item.commitmentId === reveal.commitmentId,
    );
    if (
      !slot ||
      !commitment ||
      reveal.auctionDigest !== digestForRound(state, reveal.round) ||
      commitment.bidderPeerId !== reveal.bidderPeerId ||
      commitment.bidderInstanceId !== reveal.bidderInstanceId ||
      commitment.bidderIndependenceGroupId !==
        reveal.bidderIndependenceGroupId ||
      commitment.slotId !== reveal.slotId ||
      commitment.commitmentHash !==
        commitmentHashForMechanismBidRevealV1(reveal) ||
      !selectionEligible(
        slot,
        reveal.bidderPeerId,
        reveal.bidderIndependenceGroupId,
      ) ||
      reveal.declaredBudgetUnits > slot.budgetCeilingUnits ||
      !hasAdmission(state, { kind: "reveal", reveal })
    )
      fail("mechanism allocation reveal binding is invalid");
    if (
      reveal.round === auction.round &&
      (reveal.revealedAtLogicalMs < auction.commitDeadlineLogicalMs ||
        reveal.revealedAtLogicalMs >= auction.revealDeadlineLogicalMs)
    )
      fail("mechanism allocation reveal deadline is invalid");
  }
  if (!hasAdmission(state, { kind: "proposal", proposal }))
    fail("mechanism allocation proposal admission is missing");
  for (const withdrawal of state.withdrawals)
    if (
      withdrawal.round >= auction.round ||
      withdrawal.affectedSlotIds.some(
        (slotId) => !proposal.slots.some((slot) => slot.slotId === slotId),
      ) ||
      !hasAdmission(state, { kind: "withdrawal", withdrawal })
    )
      fail("mechanism allocation withdrawal binding is invalid");
  if (state.plan !== null) validatePlanForState(state, policy);
  return state;
}

export function validateMechanismAllocationPlanV1(
  input: unknown,
): MechanismAllocationPlanV1 {
  const value = exact(
    input,
    [
      "advisoryOnly",
      "auctionDigest",
      "causalEpoch",
      "decidedAtLogicalMs",
      "planDigest",
      "planId",
      "proposalDigest",
      "round",
      "schemaVersion",
      "selections",
      "totalDeclaredCostUnits",
      "unallocatedSlotIds",
    ],
    "mechanism allocation plan",
  );
  if (value.advisoryOnly !== true)
    fail("mechanism allocation plan must be advisory");
  schema(value.schemaVersion, "mechanism allocation plan");
  const result = createMechanismAllocationPlanV1(
    value as unknown as Omit<
      MechanismAllocationPlanV1,
      "planDigest" | "schemaVersion" | "advisoryOnly"
    >,
  );
  if (value.planDigest !== result.planDigest)
    fail("mechanism allocation plan digest is invalid");
  return result;
}

function normalizeRevealBody(
  input: Omit<
    MechanismBidRevealV1,
    "revealDigest" | "schemaVersion" | "commitmentId" | "revealedAtLogicalMs"
  >,
) {
  return freeze({
    schemaVersion: 1 as const,
    revealId: identifier(input.revealId, "reveal.revealId"),
    auctionDigest: sha(input.auctionDigest, "reveal.auctionDigest"),
    round: positive(input.round, "reveal.round"),
    bidderPeerId: identifier(input.bidderPeerId, "reveal.bidderPeerId"),
    bidderInstanceId: identifier(
      input.bidderInstanceId,
      "reveal.bidderInstanceId",
    ),
    bidderIndependenceGroupId: identifier(
      input.bidderIndependenceGroupId,
      "reveal.bidderIndependenceGroupId",
    ),
    slotId: identifier(input.slotId, "reveal.slotId"),
    declaredUtilityMicros: nonNegative(
      input.declaredUtilityMicros,
      "reveal.declaredUtilityMicros",
    ),
    declaredCostUnits: positive(
      input.declaredCostUnits,
      "reveal.declaredCostUnits",
    ),
    declaredResourceUnits: positive(
      input.declaredResourceUnits,
      "reveal.declaredResourceUnits",
    ),
    declaredBudgetUnits: positive(
      input.declaredBudgetUnits,
      "reveal.declaredBudgetUnits",
    ),
    availabilityUntilLogicalMs: positive(
      input.availabilityUntilLogicalMs,
      "reveal.availabilityUntilLogicalMs",
    ),
    nonceDigest: sha(input.nonceDigest, "reveal.nonceDigest"),
  });
}
function normalizePolicy(
  input: MechanismAllocationPolicyV1,
): MechanismAllocationPolicyV1 {
  const policyValue = exact(
    input,
    [
      "limits",
      "maximumResourceUnitsPerPeer",
      "maximumSlotsPerIndependenceGroup",
      "maximumSlotsPerPeer",
      "maximumTotalDeclaredBudgetUnits",
      "maximumTotalDeclaredCostUnits",
      "parentPolicyDigest",
      "policyId",
      "policyVersion",
      "requireDistinctIndependenceGroups",
      "schemaVersion",
    ],
    "mechanism allocation policy",
  );
  schema(policyValue.schemaVersion, "mechanism allocation policy");
  const limitsValue = exact(
    input.limits,
    [
      "maximumAdmissions",
      "maximumBidsPerSlot",
      "maximumCommitAttempts",
      "maximumCommitments",
      "maximumDecompositionProposals",
      "maximumReveals",
      "maximumRoundDurationLogicalMs",
      "maximumRounds",
      "maximumSlots",
    ],
    "mechanism allocation limits",
  );
  const limits = freeze({
    maximumSlots: positive(limitsValue.maximumSlots, "limits.maximumSlots"),
    maximumDecompositionProposals: positive(
      limitsValue.maximumDecompositionProposals,
      "limits.maximumDecompositionProposals",
    ),
    maximumBidsPerSlot: positive(
      limitsValue.maximumBidsPerSlot,
      "limits.maximumBidsPerSlot",
    ),
    maximumCommitments: positive(
      limitsValue.maximumCommitments,
      "limits.maximumCommitments",
    ),
    maximumReveals: positive(
      limitsValue.maximumReveals,
      "limits.maximumReveals",
    ),
    maximumAdmissions: positive(
      limitsValue.maximumAdmissions,
      "limits.maximumAdmissions",
    ),
    maximumRounds: positive(limitsValue.maximumRounds, "limits.maximumRounds"),
    maximumCommitAttempts: positive(
      limitsValue.maximumCommitAttempts,
      "limits.maximumCommitAttempts",
    ),
    maximumRoundDurationLogicalMs: positive(
      limitsValue.maximumRoundDurationLogicalMs,
      "limits.maximumRoundDurationLogicalMs",
    ),
  });
  return freeze({
    schemaVersion: 1,
    policyId: identifier(input.policyId, "policy.policyId"),
    policyVersion: positive(input.policyVersion, "policy.policyVersion"),
    parentPolicyDigest:
      input.parentPolicyDigest === null
        ? null
        : sha(input.parentPolicyDigest, "policy.parentPolicyDigest"),
    maximumTotalDeclaredCostUnits: positive(
      input.maximumTotalDeclaredCostUnits,
      "policy.maximumTotalDeclaredCostUnits",
    ),
    maximumTotalDeclaredBudgetUnits: positive(
      input.maximumTotalDeclaredBudgetUnits,
      "policy.maximumTotalDeclaredBudgetUnits",
    ),
    maximumResourceUnitsPerPeer: positive(
      input.maximumResourceUnitsPerPeer,
      "policy.maximumResourceUnitsPerPeer",
    ),
    maximumSlotsPerPeer: positive(
      input.maximumSlotsPerPeer,
      "policy.maximumSlotsPerPeer",
    ),
    maximumSlotsPerIndependenceGroup: positive(
      input.maximumSlotsPerIndependenceGroup,
      "policy.maximumSlotsPerIndependenceGroup",
    ),
    requireDistinctIndependenceGroups:
      typeof input.requireDistinctIndependenceGroups === "boolean"
        ? input.requireDistinctIndependenceGroups
        : fail("policy.requireDistinctIndependenceGroups is invalid"),
    limits,
  });
}
function assertAcyclicSlots(
  slots: readonly MechanismSemanticWorkSlotV1[],
): void {
  const byId = new Map(slots.map((slot) => [slot.slotId, slot]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (slotId: string): void => {
    if (visiting.has(slotId)) fail("mechanism slot graph contains a cycle");
    if (visited.has(slotId)) return;
    visiting.add(slotId);
    for (const dependency of byId.get(slotId)!.dependsOnSlotIds)
      visit(dependency);
    visiting.delete(slotId);
    visited.add(slotId);
  };
  for (const slot of slots) visit(slot.slotId);
}
function validatePlanForState(
  state: MechanismAllocationStateV1,
  policy: MechanismAllocationPolicyV1,
): void {
  const proposal = state.proposal!;
  const auction = state.auction!;
  const plan = state.plan!;
  const currentPlan = plan.round === auction.round;
  if (
    plan.proposalDigest !== proposal.proposalDigest ||
    plan.round > auction.round ||
    plan.causalEpoch > auction.causalEpoch ||
    (currentPlan && plan.auctionDigest !== auction.roundDigest) ||
    (!currentPlan &&
      !state.withdrawals.some((item) => item.round === plan.round)) ||
    plan.decidedAtLogicalMs > state.logicalTimeHighWaterMs
  )
    fail("mechanism allocation plan binding is invalid");
  const clearEvent = state.admittedEvents.find(
    (
      event,
    ): event is Extract<
      MechanismAllocationEventV1,
      { readonly kind: "clear" }
    > =>
      event.kind === "clear" && event.logicalTimeMs === plan.decidedAtLogicalMs,
  );
  if (!clearEvent || !hasAdmission(state, clearEvent))
    fail("mechanism allocation clear admission is missing");
  const proposalSlotIds = proposal.slots.map((slot) => slot.slotId);
  const covered = [
    ...plan.selections.map((item) => item.slotId),
    ...plan.unallocatedSlotIds,
  ];
  if (
    covered.length !== proposalSlotIds.length ||
    new Set(covered).size !== covered.length ||
    covered.some((slotId) => !proposalSlotIds.includes(slotId))
  )
    fail("mechanism allocation plan coverage is invalid");
  if (
    plan.selections.length > policy.limits.maximumSlots ||
    plan.totalDeclaredCostUnits !==
      plan.selections.reduce((sum, item) => sum + item.declaredCostUnits, 0) ||
    plan.totalDeclaredCostUnits > policy.maximumTotalDeclaredCostUnits ||
    plan.selections.reduce((sum, item) => sum + item.declaredBudgetUnits, 0) >
      policy.maximumTotalDeclaredBudgetUnits
  )
    fail("mechanism allocation plan aggregate is invalid");
  for (const selection of plan.selections) {
    const slot = proposal.slots.find(
      (item) => item.slotId === selection.slotId,
    )!;
    const reveal = state.reveals.find(
      (item) =>
        item.revealId === selection.revealId &&
        item.revealDigest === selection.revealDigest,
    );
    const commitment = reveal
      ? state.commitments.find(
          (item) => item.commitmentId === reveal.commitmentId,
        )
      : undefined;
    if (
      !reveal ||
      !commitment ||
      reveal.round > plan.round ||
      reveal.auctionDigest !== digestForRound(state, reveal.round) ||
      commitment.commitmentHash !==
        commitmentHashForMechanismBidRevealV1(reveal) ||
      commitment.auctionDigest !== reveal.auctionDigest ||
      commitment.round !== reveal.round ||
      commitment.bidderPeerId !== reveal.bidderPeerId ||
      commitment.bidderInstanceId !== reveal.bidderInstanceId ||
      commitment.bidderIndependenceGroupId !==
        reveal.bidderIndependenceGroupId ||
      commitment.slotId !== reveal.slotId ||
      selection.bidderPeerId !== reveal.bidderPeerId ||
      selection.bidderInstanceId !== reveal.bidderInstanceId ||
      selection.bidderIndependenceGroupId !==
        reveal.bidderIndependenceGroupId ||
      selection.declaredUtilityMicros !== reveal.declaredUtilityMicros ||
      selection.declaredCostUnits !== reveal.declaredCostUnits ||
      selection.declaredResourceUnits !== reveal.declaredResourceUnits ||
      selection.declaredBudgetUnits !== reveal.declaredBudgetUnits
    )
      fail("mechanism allocation selection provenance is invalid");
    if (
      !selectionEligible(
        slot,
        selection.bidderPeerId,
        selection.bidderIndependenceGroupId,
      ) ||
      selection.declaredBudgetUnits > slot.budgetCeilingUnits ||
      !slot.dependsOnSlotIds.every((dependency) =>
        plan.selections.some((item) => item.slotId === dependency),
      )
    )
      fail("mechanism allocation selection is invalid");
    const peerSelections = plan.selections.filter(
      (item) => item.bidderPeerId === selection.bidderPeerId,
    );
    const groupSelections = plan.selections.filter(
      (item) =>
        item.bidderIndependenceGroupId === selection.bidderIndependenceGroupId,
    );
    if (
      peerSelections.length > policy.maximumSlotsPerPeer ||
      groupSelections.length > policy.maximumSlotsPerIndependenceGroup ||
      (policy.requireDistinctIndependenceGroups &&
        groupSelections.length > 1) ||
      peerSelections.reduce(
        (sum, item) => sum + item.declaredResourceUnits,
        0,
      ) > policy.maximumResourceUnitsPerPeer
    )
      fail("mechanism allocation concentration is invalid");
  }
}
function digestForRound(
  state: MechanismAllocationStateV1,
  round: number,
): PlanningDigestV1 {
  if (state.auction?.round === round) return state.auction.roundDigest;
  const withdrawal = state.withdrawals.find((item) => item.round === round);
  return (
    withdrawal?.auctionDigest ??
    fail("mechanism allocation round provenance is missing")
  );
}
function hasAdmission(
  state: MechanismAllocationStateV1,
  event: MechanismAllocationEventV1,
): boolean {
  const eventDigest = mechanismAllocationEventDigestV1(event);
  const admission = state.admissions.find(
    (item) => item.eventDigest === eventDigest && item.eventKind === event.kind,
  );
  if (!admission) return false;
  const actor = mechanismAllocationEventActorV1(event);
  const eventTime = mechanismAllocationEventLogicalTimeV1(event);
  return (
    actor.peerId === admission.actorPeerId &&
    actor.instanceId === admission.actorInstanceId &&
    actor.independenceGroupId === admission.actorIndependenceGroupId &&
    admission.authenticatedAtLogicalMs <= eventTime &&
    eventTime < admission.validUntilLogicalMs &&
    requiredCapabilitiesForMechanismAllocationEventV1(
      event,
      state.proposal,
    ).every((capability) =>
      admission.authorizedCapabilityKeys.includes(capability),
    )
  );
}
export function mechanismAllocationEventActorV1(
  event: MechanismAllocationEventV1,
): {
  readonly peerId: string;
  readonly instanceId: string;
  readonly independenceGroupId: string;
} {
  if (event.kind === "proposal")
    return freeze({
      peerId: event.proposal.proposerPeerId,
      instanceId: event.proposal.proposerInstanceId,
      independenceGroupId: event.proposal.proposerIndependenceGroupId,
    });
  if (event.kind === "commitment")
    return freeze({
      peerId: event.commitment.bidderPeerId,
      instanceId: event.commitment.bidderInstanceId,
      independenceGroupId: event.commitment.bidderIndependenceGroupId,
    });
  if (event.kind === "reveal")
    return freeze({
      peerId: event.reveal.bidderPeerId,
      instanceId: event.reveal.bidderInstanceId,
      independenceGroupId: event.reveal.bidderIndependenceGroupId,
    });
  if (event.kind === "withdrawal")
    return freeze({
      peerId: event.withdrawal.peerId,
      instanceId: event.withdrawal.peerInstanceId,
      independenceGroupId: event.withdrawal.peerIndependenceGroupId,
    });
  return freeze({
    peerId: event.clearingPeerId,
    instanceId: event.clearingInstanceId,
    independenceGroupId: event.clearingIndependenceGroupId,
  });
}
export function requiredCapabilitiesForMechanismAllocationEventV1(
  event: MechanismAllocationEventV1,
  proposal: MechanismMissionDecompositionProposalV1 | null,
): readonly string[] {
  if (event.kind === "proposal")
    return freeze(["mission.decomposition.propose"]);
  if (event.kind === "withdrawal")
    return freeze(["mission.allocation.withdraw"]);
  if (event.kind === "clear") return freeze(["mission.allocation.clear"]);
  const slotId =
    event.kind === "commitment" ? event.commitment.slotId : event.reveal.slotId;
  const slot = proposal?.slots.find((item) => item.slotId === slotId);
  return slot?.requiredCapabilityKeys ?? freeze([]);
}
export function mechanismAllocationEventLogicalTimeV1(
  event: MechanismAllocationEventV1,
): number {
  if (event.kind === "proposal") return event.proposal.observedAtLogicalMs;
  if (event.kind === "commitment") return event.commitment.committedAtLogicalMs;
  if (event.kind === "reveal") return event.reveal.revealedAtLogicalMs;
  if (event.kind === "withdrawal") return event.withdrawal.observedAtLogicalMs;
  return event.logicalTimeMs;
}
function selectionEligible(
  slot: MechanismSemanticWorkSlotV1,
  peerId: string,
  groupId: string,
): boolean {
  return (
    (!slot.eligiblePeerIds.length || slot.eligiblePeerIds.includes(peerId)) &&
    (!slot.eligibleIndependenceGroupIds.length ||
      slot.eligibleIndependenceGroupIds.includes(groupId)) &&
    (slot.requiredIndependenceGroupId === null ||
      slot.requiredIndependenceGroupId === groupId)
  );
}
function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) fail(`${label} must be unique`);
}
function schema(value: unknown, label: string): void {
  if (value !== 1) fail(`${label} schema version is invalid`);
}
