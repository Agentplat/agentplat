import type { CollectiveJson } from "./contracts.js";
import {
  canonicalizeCollectiveJsonV1,
  deepFreezeCollective,
  digestCollectiveJsonV1,
} from "./canonical.js";

export const BOUNDED_COLLECTIVE_CONTROL_MODEL_VERSION = 1 as const;
export const BOUNDED_COLLECTIVE_CONTROL_MODEL_ID =
  "agentplat.collective-control.bounded-state-model.v1" as const;
export const BOUNDED_COLLECTIVE_CONTROL_MODEL_LIMITATION =
  "A completed result covers only the configured finite state and trace bounds; it does not prove a deployment, adapter, storage engine, network, or effect sink." as const;
export const REFERENCE_BOUNDED_COLLECTIVE_CONTROL_TRANSITION_CONTENT_V1 =
  deepFreezeCollective({
    modelId: BOUNDED_COLLECTIVE_CONTROL_MODEL_ID,
    implementationId: "reference-transition",
    implementationVersion: 1,
    commandKinds: [
      "advance_authority",
      "commit_effect",
      "consume_reservation",
      "delegate",
      "finalize",
      "finalize_allocation",
      "release_reservation",
      "reserve_budget",
    ],
    rules: [
      "conflicting finality rejects",
      "epoch and fence never regress",
      "available plus reserved plus consumed equals fixed total",
      "parent authority remains within the configured initial mask",
      "child authority and aggregate reserved plus consumed spend remain below parent ceilings",
      "committed effect count does not exceed cumulative child spend",
      "effect requires exact finalized membership assignment fence assignee capability role sink and remaining child budget",
      "malformed unknown stale widening and over-budget input rejects without mutation",
    ],
  });
export const REFERENCE_BOUNDED_COLLECTIVE_CONTROL_TRANSITION_DIGEST_V1 =
  digestCollectiveJsonV1(
    "snapshot",
    REFERENCE_BOUNDED_COLLECTIVE_CONTROL_TRANSITION_CONTENT_V1,
  );

export type BoundedCollectiveControlPropertyV1 =
  | "finality_uniqueness"
  | "monotonic_epoch_and_fence"
  | "budget_conservation"
  | "authority_attenuation"
  | "effect_authorization_binding"
  | "stale_effect_exclusion"
  | "fail_closed_transitions"
  | "transition_conformance";

export const BOUNDED_COLLECTIVE_CONTROL_PROPERTIES_V1 = Object.freeze([
  "finality_uniqueness",
  "monotonic_epoch_and_fence",
  "budget_conservation",
  "authority_attenuation",
  "effect_authorization_binding",
  "stale_effect_exclusion",
  "fail_closed_transitions",
  "transition_conformance",
] as const satisfies readonly BoundedCollectiveControlPropertyV1[]);

export interface BoundedCollectiveControlBoundsV1 {
  readonly schemaVersion: 1;
  readonly maximumTraceDepth: number;
  readonly maximumExploredStates: number;
  readonly maximumExploredTransitions: number;
  readonly maximumEpoch: number;
  readonly maximumFence: number;
  readonly maximumMembershipEpoch: number;
  readonly totalBudgetUnits: number;
  readonly capabilityCount: number;
  readonly assigneeCount: number;
  readonly roleCount: number;
  readonly effectSinkCount: number;
  readonly initialParentAuthorityMask: number;
  readonly decisionCoordinateCount: number;
  readonly finalityValueCount: number;
}

export interface BoundedCollectiveControlStateV1 {
  readonly schemaVersion: 1;
  readonly assignmentEpoch: number;
  readonly fencingToken: number;
  readonly membershipEpoch: number;
  readonly finalityValues: readonly (number | null)[];
  readonly totalBudgetUnits: number;
  readonly availableBudgetUnits: number;
  readonly reservedBudgetUnits: number;
  readonly consumedBudgetUnits: number;
  readonly parentAuthorityMask: number;
  readonly childAuthorityMask: number;
  readonly parentBudgetCeiling: number;
  readonly childBudgetCeiling: number;
  /** Cumulative child spend; active reservations are tracked separately in reservedBudgetUnits. */
  readonly childConsumedBudgetUnits: number;
  readonly committedEffectCount: number;
  readonly finalizedMembershipEpoch: number | null;
  readonly finalizedAssignmentEpoch: number | null;
  readonly finalizedFencingToken: number | null;
  readonly finalizedAssignee: number | null;
  readonly finalizedCapability: number | null;
  readonly finalizedRole: number | null;
  readonly finalizedEffectSink: number | null;
}

export type BoundedCollectiveControlCommandV1 =
  | {
      readonly kind: "finalize";
      readonly coordinate: number;
      readonly value: number;
    }
  | {
      readonly kind: "advance_authority";
      readonly membershipEpoch: number;
      readonly assignmentEpoch: number;
      readonly fencingToken: number;
    }
  | {
      readonly kind: "finalize_allocation";
      readonly membershipEpoch: number;
      readonly assignmentEpoch: number;
      readonly fencingToken: number;
      readonly assignee: number;
      readonly capability: number;
      readonly role: number;
      readonly effectSink: number;
    }
  | { readonly kind: "reserve_budget"; readonly amount: number }
  | { readonly kind: "consume_reservation"; readonly amount: number }
  | { readonly kind: "release_reservation"; readonly amount: number }
  | {
      readonly kind: "delegate";
      readonly authorityMask: number;
      readonly budgetCeiling: number;
    }
  | {
      readonly kind: "commit_effect";
      readonly membershipEpoch: number;
      readonly assignmentEpoch: number;
      readonly fencingToken: number;
      readonly assignee: number;
      readonly capability: number;
      readonly role: number;
      readonly effectSink: number;
      readonly amount: number;
    };

type FinalizedAllocationCommandV1 = Extract<
  BoundedCollectiveControlCommandV1,
  { readonly kind: "finalize_allocation" }
>;
type AllocationTupleV1 = Omit<FinalizedAllocationCommandV1, "kind">;

export interface BoundedCollectiveControlTransitionResultV1 {
  readonly status: "accepted" | "rejected";
  readonly reasonCode: string;
  readonly state: BoundedCollectiveControlStateV1;
}

export interface BoundedCollectiveControlTransitionV1 {
  readonly implementationDigest: `sha256:${string}`;
  apply(input: {
    readonly state: BoundedCollectiveControlStateV1;
    /** Runtime input is intentionally unknown so malformed values are modeled honestly. */
    readonly command: unknown;
    readonly bounds: BoundedCollectiveControlBoundsV1;
  }): BoundedCollectiveControlTransitionResultV1;
}

export interface BoundedCollectiveControlTraceStepV1 {
  readonly index: number;
  readonly command: CollectiveJson;
  readonly outcome: "accepted" | "rejected" | "threw";
  readonly reasonCode: string;
  readonly beforeStateDigest: `sha256:${string}`;
  readonly afterStateDigest: `sha256:${string}` | null;
}

export interface BoundedCollectiveControlCounterexampleV1 {
  readonly schemaVersion: 1;
  readonly modelId: typeof BOUNDED_COLLECTIVE_CONTROL_MODEL_ID;
  readonly status: "counterexample";
  readonly property: BoundedCollectiveControlPropertyV1;
  readonly reasonCode: string;
  readonly bounds: BoundedCollectiveControlBoundsV1;
  readonly transitionImplementationDigest: `sha256:${string}`;
  readonly commandCorpusDigest: `sha256:${string}`;
  readonly boundedSpaceDigest: `sha256:${string}`;
  readonly exploredStateSetDigest: `sha256:${string}`;
  readonly trace: readonly BoundedCollectiveControlTraceStepV1[];
  readonly traceDigest: `sha256:${string}`;
  readonly counterexampleDigest: `sha256:${string}`;
  readonly limitation: typeof BOUNDED_COLLECTIVE_CONTROL_MODEL_LIMITATION;
}

export interface BoundedCollectiveControlPropertyReceiptV1 {
  readonly property: BoundedCollectiveControlPropertyV1;
  readonly checkedTransitions: number;
  readonly witnessCount: number;
}

export interface BoundedEffectAuthorizationCoverageV1 {
  readonly finalizedAllocationAcceptances: number;
  readonly acceptedEffects: number;
  readonly preFinalityEffectRejections: number;
  readonly identityMismatchEffectRejections: number;
  readonly compoundAllocationTupleWitnesses: number;
  readonly malformedAllocationRejections: number;
}

export interface BoundedCollectiveControlProofReceiptV1 {
  readonly schemaVersion: 1;
  readonly modelId: typeof BOUNDED_COLLECTIVE_CONTROL_MODEL_ID;
  readonly status: "proved_within_bounds";
  readonly bounds: BoundedCollectiveControlBoundsV1;
  readonly transitionImplementationDigest: `sha256:${string}`;
  readonly commandCorpusDigest: `sha256:${string}`;
  readonly boundedSpaceDigest: `sha256:${string}`;
  readonly exploredStateSetDigest: `sha256:${string}`;
  readonly exploredStates: number;
  readonly exploredTransitions: number;
  readonly rejectedTransitions: number;
  readonly acceptedReferenceTransitions: number;
  readonly rejectedReferenceTransitions: number;
  readonly maximumDepthReached: number;
  readonly effectAuthorizationCoverage: BoundedEffectAuthorizationCoverageV1;
  readonly properties: readonly BoundedCollectiveControlPropertyReceiptV1[];
  readonly initialStateDigest: `sha256:${string}`;
  readonly receiptDigest: `sha256:${string}`;
  readonly limitation: typeof BOUNDED_COLLECTIVE_CONTROL_MODEL_LIMITATION;
}

export interface BoundedCollectiveControlIncompleteReceiptV1 {
  readonly schemaVersion: 1;
  readonly modelId: typeof BOUNDED_COLLECTIVE_CONTROL_MODEL_ID;
  readonly status: "incomplete";
  readonly reasonCode:
    | "insufficient_effect_authorization_coverage"
    | "maximum_explored_states_reached"
    | "maximum_explored_transitions_reached";
  readonly bounds: BoundedCollectiveControlBoundsV1;
  readonly transitionImplementationDigest: `sha256:${string}`;
  readonly commandCorpusDigest: `sha256:${string}`;
  readonly boundedSpaceDigest: `sha256:${string}`;
  readonly exploredStateSetDigest: `sha256:${string}`;
  readonly exploredStates: number;
  readonly exploredTransitions: number;
  readonly maximumDepthReached: number;
  readonly receiptDigest: `sha256:${string}`;
  readonly limitation: typeof BOUNDED_COLLECTIVE_CONTROL_MODEL_LIMITATION;
}

export type BoundedCollectiveControlCheckResultV1 =
  | BoundedCollectiveControlProofReceiptV1
  | BoundedCollectiveControlCounterexampleV1
  | BoundedCollectiveControlIncompleteReceiptV1;

type BoundedModelIdentityV1 = Pick<
  BoundedCollectiveControlProofReceiptV1,
  | "transitionImplementationDigest"
  | "commandCorpusDigest"
  | "boundedSpaceDigest"
>;

export const DEFAULT_BOUNDED_COLLECTIVE_CONTROL_BOUNDS_V1 =
  Object.freeze<BoundedCollectiveControlBoundsV1>({
    schemaVersion: 1,
    maximumTraceDepth: 2,
    maximumExploredStates: 50_000,
    maximumExploredTransitions: 100_000,
    maximumEpoch: 1,
    maximumFence: 1,
    maximumMembershipEpoch: 1,
    totalBudgetUnits: 2,
    capabilityCount: 2,
    assigneeCount: 2,
    roleCount: 2,
    effectSinkCount: 2,
    initialParentAuthorityMask: 0b11,
    decisionCoordinateCount: 1,
    finalityValueCount: 2,
  });

export function createBoundedCollectiveControlBoundsV1(
  input: BoundedCollectiveControlBoundsV1 = DEFAULT_BOUNDED_COLLECTIVE_CONTROL_BOUNDS_V1,
): BoundedCollectiveControlBoundsV1 {
  if (!input || typeof input !== "object" || input.schemaVersion !== 1)
    throw new TypeError("bounded model bounds are invalid");
  const maximumTraceDepth = boundedInteger(
    input.maximumTraceDepth,
    1,
    12,
    "maximumTraceDepth",
  );
  const maximumExploredStates = boundedInteger(
    input.maximumExploredStates,
    1,
    250_000,
    "maximumExploredStates",
  );
  const maximumExploredTransitions = boundedInteger(
    input.maximumExploredTransitions,
    1,
    5_000_000,
    "maximumExploredTransitions",
  );
  const maximumEpoch = boundedInteger(
    input.maximumEpoch,
    0,
    16,
    "maximumEpoch",
  );
  const maximumFence = boundedInteger(
    input.maximumFence,
    0,
    16,
    "maximumFence",
  );
  const maximumMembershipEpoch = boundedInteger(
    input.maximumMembershipEpoch,
    0,
    16,
    "maximumMembershipEpoch",
  );
  const totalBudgetUnits = boundedInteger(
    input.totalBudgetUnits,
    1,
    32,
    "totalBudgetUnits",
  );
  const capabilityCount = boundedInteger(
    input.capabilityCount,
    1,
    12,
    "capabilityCount",
  );
  const maximumAuthorityMask = 2 ** capabilityCount - 1;
  const initialParentAuthorityMask = boundedInteger(
    input.initialParentAuthorityMask,
    1,
    maximumAuthorityMask,
    "initialParentAuthorityMask",
  );
  return deepFreezeCollective({
    schemaVersion: 1,
    maximumTraceDepth,
    maximumExploredStates,
    maximumExploredTransitions,
    maximumEpoch,
    maximumFence,
    maximumMembershipEpoch,
    totalBudgetUnits,
    capabilityCount,
    assigneeCount: boundedInteger(input.assigneeCount, 1, 16, "assigneeCount"),
    roleCount: boundedInteger(input.roleCount, 1, 16, "roleCount"),
    effectSinkCount: boundedInteger(
      input.effectSinkCount,
      1,
      16,
      "effectSinkCount",
    ),
    initialParentAuthorityMask,
    decisionCoordinateCount: boundedInteger(
      input.decisionCoordinateCount,
      1,
      4,
      "decisionCoordinateCount",
    ),
    finalityValueCount: boundedInteger(
      input.finalityValueCount,
      2,
      4,
      "finalityValueCount",
    ),
  });
}

export function createInitialBoundedCollectiveControlStateV1(
  boundsInput: BoundedCollectiveControlBoundsV1 = DEFAULT_BOUNDED_COLLECTIVE_CONTROL_BOUNDS_V1,
): BoundedCollectiveControlStateV1 {
  const bounds = createBoundedCollectiveControlBoundsV1(boundsInput);
  return freezeState({
    schemaVersion: 1,
    assignmentEpoch: 0,
    fencingToken: 0,
    membershipEpoch: 0,
    finalityValues: Array.from(
      { length: bounds.decisionCoordinateCount },
      () => null,
    ),
    totalBudgetUnits: bounds.totalBudgetUnits,
    availableBudgetUnits: bounds.totalBudgetUnits,
    reservedBudgetUnits: 0,
    consumedBudgetUnits: 0,
    parentAuthorityMask: bounds.initialParentAuthorityMask,
    childAuthorityMask: bounds.initialParentAuthorityMask,
    parentBudgetCeiling: bounds.totalBudgetUnits,
    childBudgetCeiling: bounds.totalBudgetUnits,
    childConsumedBudgetUnits: 0,
    committedEffectCount: 0,
    finalizedMembershipEpoch: null,
    finalizedAssignmentEpoch: null,
    finalizedFencingToken: null,
    finalizedAssignee: null,
    finalizedCapability: null,
    finalizedRole: null,
    finalizedEffectSink: null,
  });
}

/** Reference reducer for the executable finite-state specification. */
export function applyBoundedCollectiveControlTransitionV1(input: {
  readonly state: BoundedCollectiveControlStateV1;
  readonly command: unknown;
  readonly bounds: BoundedCollectiveControlBoundsV1;
}): BoundedCollectiveControlTransitionResultV1 {
  const bounds = createBoundedCollectiveControlBoundsV1(input.bounds);
  const state = validateState(input.state, bounds);
  const parsed = parseCommand(input.command);
  if (!parsed.ok) return reject(state, parsed.reasonCode);
  const command = parsed.command;
  switch (command.kind) {
    case "finalize": {
      if (
        !integerIn(command.coordinate, 0, bounds.decisionCoordinateCount - 1) ||
        !integerIn(command.value, 0, bounds.finalityValueCount - 1)
      )
        return reject(state, "finality_coordinate_or_value_invalid");
      const current = state.finalityValues[command.coordinate];
      if (current !== null && current !== command.value)
        return reject(state, "conflicting_finality");
      if (current === command.value) return accept(state, "finality_replay");
      const finalityValues = [...state.finalityValues];
      finalityValues[command.coordinate] = command.value;
      return accept(freezeState({ ...state, finalityValues }), "finalized");
    }
    case "advance_authority": {
      if (
        !integerIn(command.membershipEpoch, 0, bounds.maximumMembershipEpoch) ||
        !integerIn(command.assignmentEpoch, 0, bounds.maximumEpoch) ||
        !integerIn(command.fencingToken, 0, bounds.maximumFence)
      )
        return reject(state, "authority_coordinate_invalid");
      if (
        command.membershipEpoch < state.membershipEpoch ||
        command.assignmentEpoch < state.assignmentEpoch ||
        command.fencingToken < state.fencingToken
      )
        return reject(state, "authority_coordinate_regressed");
      if (
        command.membershipEpoch === state.membershipEpoch &&
        command.assignmentEpoch === state.assignmentEpoch &&
        command.fencingToken === state.fencingToken
      )
        return reject(state, "authority_coordinate_unchanged");
      return accept(
        freezeState({
          ...state,
          membershipEpoch: command.membershipEpoch,
          assignmentEpoch: command.assignmentEpoch,
          fencingToken: command.fencingToken,
          finalizedMembershipEpoch: null,
          finalizedAssignmentEpoch: null,
          finalizedFencingToken: null,
          finalizedAssignee: null,
          finalizedCapability: null,
          finalizedRole: null,
          finalizedEffectSink: null,
        }),
        "authority_advanced",
      );
    }
    case "finalize_allocation": {
      if (
        !integerIn(command.membershipEpoch, 0, bounds.maximumMembershipEpoch) ||
        !integerIn(command.assignmentEpoch, 0, bounds.maximumEpoch) ||
        !integerIn(command.fencingToken, 0, bounds.maximumFence) ||
        !integerIn(command.assignee, 0, bounds.assigneeCount - 1) ||
        !integerIn(command.capability, 0, bounds.capabilityCount - 1) ||
        !integerIn(command.role, 0, bounds.roleCount - 1) ||
        !integerIn(command.effectSink, 0, bounds.effectSinkCount - 1)
      )
        return reject(state, "allocation_coordinate_invalid");
      if (
        command.membershipEpoch !== state.membershipEpoch ||
        command.assignmentEpoch !== state.assignmentEpoch ||
        command.fencingToken !== state.fencingToken
      )
        return reject(state, "allocation_authority_stale");
      if (state.finalizedMembershipEpoch !== null)
        return allocationMatches(state, command)
          ? accept(state, "allocation_finality_replay")
          : reject(state, "conflicting_allocation_finality");
      return accept(
        freezeState({
          ...state,
          finalizedMembershipEpoch: command.membershipEpoch,
          finalizedAssignmentEpoch: command.assignmentEpoch,
          finalizedFencingToken: command.fencingToken,
          finalizedAssignee: command.assignee,
          finalizedCapability: command.capability,
          finalizedRole: command.role,
          finalizedEffectSink: command.effectSink,
        }),
        "allocation_finalized",
      );
    }
    case "reserve_budget":
      if (
        !positive(command.amount) ||
        command.amount > state.availableBudgetUnits ||
        state.childConsumedBudgetUnits +
          state.reservedBudgetUnits +
          command.amount >
          state.childBudgetCeiling
      )
        return reject(state, "budget_reservation_unavailable");
      return accept(
        freezeState({
          ...state,
          availableBudgetUnits: state.availableBudgetUnits - command.amount,
          reservedBudgetUnits: state.reservedBudgetUnits + command.amount,
        }),
        "budget_reserved",
      );
    case "consume_reservation":
      if (
        !positive(command.amount) ||
        command.amount > state.reservedBudgetUnits
      )
        return reject(state, "budget_reservation_insufficient");
      return accept(
        freezeState({
          ...state,
          reservedBudgetUnits: state.reservedBudgetUnits - command.amount,
          consumedBudgetUnits: state.consumedBudgetUnits + command.amount,
          childConsumedBudgetUnits:
            state.childConsumedBudgetUnits + command.amount,
        }),
        "reservation_consumed",
      );
    case "release_reservation":
      if (
        !positive(command.amount) ||
        command.amount > state.reservedBudgetUnits
      )
        return reject(state, "budget_release_invalid");
      return accept(
        freezeState({
          ...state,
          availableBudgetUnits: state.availableBudgetUnits + command.amount,
          reservedBudgetUnits: state.reservedBudgetUnits - command.amount,
        }),
        "reservation_released",
      );
    case "delegate":
      if (
        !integerIn(command.authorityMask, 0, 2 ** bounds.capabilityCount - 1) ||
        !integerIn(command.budgetCeiling, 0, bounds.totalBudgetUnits) ||
        !isSubset(command.authorityMask, state.parentAuthorityMask) ||
        !isSubset(command.authorityMask, state.childAuthorityMask) ||
        command.budgetCeiling > state.parentBudgetCeiling ||
        command.budgetCeiling > state.childBudgetCeiling ||
        command.budgetCeiling <
          state.childConsumedBudgetUnits + state.reservedBudgetUnits
      )
        return reject(state, "delegation_widens_authority");
      return accept(
        freezeState({
          ...state,
          childAuthorityMask: command.authorityMask,
          childBudgetCeiling: command.budgetCeiling,
        }),
        "authority_attenuated",
      );
    case "commit_effect": {
      if (
        !integerIn(command.membershipEpoch, 0, bounds.maximumMembershipEpoch) ||
        !integerIn(command.assignmentEpoch, 0, bounds.maximumEpoch) ||
        !integerIn(command.fencingToken, 0, bounds.maximumFence) ||
        !integerIn(command.assignee, 0, bounds.assigneeCount - 1) ||
        !integerIn(command.capability, 0, bounds.capabilityCount - 1) ||
        !integerIn(command.role, 0, bounds.roleCount - 1) ||
        !integerIn(command.effectSink, 0, bounds.effectSinkCount - 1) ||
        !positive(command.amount)
      )
        return reject(state, "effect_coordinate_invalid");
      const capabilityMask = 2 ** command.capability;
      if (
        command.membershipEpoch !== state.membershipEpoch ||
        command.assignmentEpoch !== state.assignmentEpoch ||
        command.fencingToken !== state.fencingToken
      )
        return reject(state, "effect_authority_stale");
      if (!allocationMatches(state, command))
        return reject(state, "effect_allocation_not_finalized");
      if (
        !isSubset(capabilityMask, state.parentAuthorityMask) ||
        !isSubset(capabilityMask, state.childAuthorityMask)
      )
        return reject(state, "effect_authority_unavailable");
      if (
        command.amount > state.availableBudgetUnits ||
        state.childConsumedBudgetUnits +
          state.reservedBudgetUnits +
          command.amount >
          state.childBudgetCeiling
      )
        return reject(state, "effect_budget_unavailable");
      return accept(
        freezeState({
          ...state,
          availableBudgetUnits: state.availableBudgetUnits - command.amount,
          consumedBudgetUnits: state.consumedBudgetUnits + command.amount,
          childConsumedBudgetUnits:
            state.childConsumedBudgetUnits + command.amount,
          committedEffectCount: state.committedEffectCount + 1,
        }),
        "effect_committed",
      );
    }
    default:
      return reject(state, "unknown_command");
  }
}

export const REFERENCE_BOUNDED_COLLECTIVE_CONTROL_TRANSITION_V1 =
  Object.freeze<BoundedCollectiveControlTransitionV1>({
    implementationDigest:
      REFERENCE_BOUNDED_COLLECTIVE_CONTROL_TRANSITION_DIGEST_V1,
    apply: applyBoundedCollectiveControlTransitionV1,
  });

export function checkBoundedCollectiveControlModelV1(
  input: {
    readonly bounds?: BoundedCollectiveControlBoundsV1;
    readonly transition?: BoundedCollectiveControlTransitionV1;
  } = {},
): BoundedCollectiveControlCheckResultV1 {
  const bounds = createBoundedCollectiveControlBoundsV1(
    input.bounds ?? DEFAULT_BOUNDED_COLLECTIVE_CONTROL_BOUNDS_V1,
  );
  const transition =
    input.transition ?? REFERENCE_BOUNDED_COLLECTIVE_CONTROL_TRANSITION_V1;
  if (!transition || typeof transition.apply !== "function")
    throw new TypeError("bounded model transition is invalid");
  const transitionImplementationDigest = requiredDigest(
    transition.implementationDigest,
    "transition implementation digest",
  );
  const initial = createInitialBoundedCollectiveControlStateV1(bounds);
  const commands = enumerateCommands(bounds);
  const commandCorpusDigest = digestCollectiveJsonV1(
    "snapshot",
    commands as unknown as CollectiveJson,
  );
  const boundedSpaceDigest = digestCollectiveJsonV1("snapshot", {
    modelId: BOUNDED_COLLECTIVE_CONTROL_MODEL_ID,
    bounds: bounds as unknown as CollectiveJson,
    commandCorpusDigest,
  });
  const identity = Object.freeze({
    transitionImplementationDigest,
    commandCorpusDigest,
    boundedSpaceDigest,
  });
  const initialKey = stateKey(initial);
  const visited = new Map<
    string,
    {
      state: BoundedCollectiveControlStateV1;
      trace: readonly BoundedCollectiveControlTraceStepV1[];
      depth: number;
    }
  >();
  visited.set(initialKey, {
    state: initial,
    trace: Object.freeze([]),
    depth: 0,
  });
  const queue = [initialKey];
  let cursor = 0;
  let exploredTransitions = 0;
  let rejectedTransitions = 0;
  let acceptedReferenceTransitions = 0;
  let rejectedReferenceTransitions = 0;
  let maximumDepthReached = 0;
  let finalizedAllocationAcceptances = 0;
  let acceptedEffects = 0;
  let preFinalityEffectRejections = 0;
  let identityMismatchEffectRejections = 0;
  let malformedAllocationRejections = 0;
  const compoundAllocationTupleWitnesses = new Set<string>();

  while (cursor < queue.length) {
    const entry = visited.get(queue[cursor++]!)!;
    maximumDepthReached = Math.max(maximumDepthReached, entry.depth);
    if (entry.depth >= bounds.maximumTraceDepth) continue;
    for (const command of commands) {
      if (exploredTransitions >= bounds.maximumExploredTransitions)
        return incomplete(
          bounds,
          identity,
          "maximum_explored_transitions_reached",
          visited.size,
          exploredTransitions,
          maximumDepthReached,
          digestExploredStateSet(visited.values()),
        );
      exploredTransitions += 1;
      const expected = applyBoundedCollectiveControlTransitionV1({
        state: entry.state,
        command,
        bounds,
      });
      if (expected.status === "accepted") acceptedReferenceTransitions += 1;
      else rejectedReferenceTransitions += 1;
      const parsedCommand = parseCommand(command);
      if (parsedCommand.ok) {
        const parsed = parsedCommand.command;
        if (
          parsed.kind === "finalize_allocation" ||
          parsed.kind === "commit_effect"
        ) {
          if (
            isCompoundAllocationTuple(parsed) &&
            expected.status === "accepted"
          )
            compoundAllocationTupleWitnesses.add(
              canonicalizeCollectiveJsonV1(command),
            );
          if (
            parsed.kind === "finalize_allocation" &&
            expected.status === "accepted" &&
            expected.reasonCode === "allocation_finalized"
          )
            finalizedAllocationAcceptances += 1;
          if (parsed.kind === "commit_effect") {
            if (expected.status === "accepted") acceptedEffects += 1;
            if (expected.reasonCode === "effect_allocation_not_finalized") {
              if (entry.state.finalizedMembershipEpoch === null)
                preFinalityEffectRejections += 1;
              else identityMismatchEffectRejections += 1;
            }
          }
        }
      } else if (isRawAllocationCommand(command)) {
        malformedAllocationRejections += 1;
      }
      let actual: BoundedCollectiveControlTransitionResultV1;
      try {
        actual = transition.apply({ state: entry.state, command, bounds });
      } catch (error) {
        return counterexample(
          bounds,
          identity,
          "fail_closed_transitions",
          "transition_threw",
          appendTrace(
            entry.trace,
            entry.state,
            command,
            "threw",
            errorReason(error),
            null,
          ),
          digestExploredStateSet(visited.values()),
        );
      }
      const afterDigest = safeStateDigest(actual?.state);
      const trace = appendTrace(
        entry.trace,
        entry.state,
        command,
        actual?.status ?? "threw",
        actual?.reasonCode ?? "invalid_transition_result",
        afterDigest,
      );
      const violation = checkTransition(
        entry.state,
        command,
        actual,
        expected,
        bounds,
      );
      if (violation)
        return counterexample(
          bounds,
          identity,
          violation.property,
          violation.reasonCode,
          trace,
          digestExploredStateSet(visited.values()),
        );
      if (actual.status === "rejected") {
        rejectedTransitions += 1;
        continue;
      }
      const next = validateState(actual.state, bounds);
      const key = stateKey(next);
      if (visited.has(key)) continue;
      if (visited.size >= bounds.maximumExploredStates)
        return incomplete(
          bounds,
          identity,
          "maximum_explored_states_reached",
          visited.size,
          exploredTransitions,
          Math.max(maximumDepthReached, entry.depth + 1),
          digestExploredStateSet(visited.values()),
        );
      visited.set(key, {
        state: next,
        trace,
        depth: entry.depth + 1,
      });
      queue.push(key);
    }
  }

  const effectAuthorizationCoverage = deepFreezeCollective({
    finalizedAllocationAcceptances,
    acceptedEffects,
    preFinalityEffectRejections,
    identityMismatchEffectRejections,
    compoundAllocationTupleWitnesses: compoundAllocationTupleWitnesses.size,
    malformedAllocationRejections,
  });
  if (
    finalizedAllocationAcceptances === 0 ||
    acceptedEffects === 0 ||
    preFinalityEffectRejections === 0 ||
    identityMismatchEffectRejections === 0 ||
    compoundAllocationTupleWitnesses.size === 0 ||
    malformedAllocationRejections === 0
  )
    return incomplete(
      bounds,
      identity,
      "insufficient_effect_authorization_coverage",
      visited.size,
      exploredTransitions,
      maximumDepthReached,
      digestExploredStateSet(visited.values()),
    );

  const body = {
    schemaVersion: 1 as const,
    modelId: BOUNDED_COLLECTIVE_CONTROL_MODEL_ID,
    status: "proved_within_bounds" as const,
    bounds,
    ...identity,
    exploredStateSetDigest: digestExploredStateSet(visited.values()),
    exploredStates: visited.size,
    exploredTransitions,
    rejectedTransitions,
    acceptedReferenceTransitions,
    rejectedReferenceTransitions,
    maximumDepthReached,
    effectAuthorizationCoverage,
    properties: BOUNDED_COLLECTIVE_CONTROL_PROPERTIES_V1.map((property) => ({
      property,
      checkedTransitions: exploredTransitions,
      witnessCount:
        property === "effect_authorization_binding"
          ? finalizedAllocationAcceptances +
            acceptedEffects +
            preFinalityEffectRejections +
            identityMismatchEffectRejections +
            compoundAllocationTupleWitnesses.size +
            malformedAllocationRejections
          : exploredTransitions,
    })),
    initialStateDigest: digestState(initial),
    limitation: BOUNDED_COLLECTIVE_CONTROL_MODEL_LIMITATION,
  };
  return deepFreezeCollective({
    ...body,
    receiptDigest: digestCollectiveJsonV1(
      "snapshot",
      body as unknown as CollectiveJson,
    ),
  });
}

function enumerateCommands(
  bounds: BoundedCollectiveControlBoundsV1,
): readonly CollectiveJson[] {
  const commands: CollectiveJson[] = [
    null,
    false,
    7,
    "not-a-command",
    [],
    {},
    { kind: "unknown" },
    { kind: "finalize" },
    { kind: "finalize", coordinate: "0", value: 0 },
    { kind: "reserve_budget", amount: "1" },
    { kind: "reserve_budget", amount: 1, unexpected: true },
  ];
  for (
    let coordinate = 0;
    coordinate < bounds.decisionCoordinateCount;
    coordinate += 1
  )
    for (let value = 0; value < bounds.finalityValueCount; value += 1)
      commands.push({ kind: "finalize", coordinate, value });
  commands.push(
    { kind: "finalize", coordinate: -1, value: 0 },
    { kind: "finalize", coordinate: bounds.decisionCoordinateCount, value: 0 },
    { kind: "finalize", coordinate: 0, value: -1 },
    { kind: "finalize", coordinate: 0, value: bounds.finalityValueCount },
  );
  for (
    let membershipEpoch = 0;
    membershipEpoch <= bounds.maximumMembershipEpoch;
    membershipEpoch += 1
  )
    for (
      let assignmentEpoch = 0;
      assignmentEpoch <= bounds.maximumEpoch;
      assignmentEpoch += 1
    )
      for (
        let fencingToken = 0;
        fencingToken <= bounds.maximumFence;
        fencingToken += 1
      )
        commands.push({
          kind: "advance_authority",
          membershipEpoch,
          assignmentEpoch,
          fencingToken,
        });
  commands.push(
    {
      kind: "advance_authority",
      membershipEpoch: -1,
      assignmentEpoch: 0,
      fencingToken: 0,
    },
    {
      kind: "advance_authority",
      membershipEpoch: bounds.maximumMembershipEpoch + 1,
      assignmentEpoch: 0,
      fencingToken: 0,
    },
    {
      kind: "advance_authority",
      membershipEpoch: 0,
      assignmentEpoch: -1,
      fencingToken: 0,
    },
    {
      kind: "advance_authority",
      membershipEpoch: 0,
      assignmentEpoch: bounds.maximumEpoch + 1,
      fencingToken: 0,
    },
    {
      kind: "advance_authority",
      membershipEpoch: 0,
      assignmentEpoch: 0,
      fencingToken: -1,
    },
    {
      kind: "advance_authority",
      membershipEpoch: 0,
      assignmentEpoch: 0,
      fencingToken: bounds.maximumFence + 1,
    },
    { kind: "reserve_budget", amount: 0 },
    { kind: "consume_reservation", amount: 0 },
    { kind: "release_reservation", amount: 0 },
  );
  for (let amount = 1; amount <= bounds.totalBudgetUnits + 1; amount += 1) {
    commands.push({ kind: "reserve_budget", amount });
    commands.push({ kind: "consume_reservation", amount });
    commands.push({ kind: "release_reservation", amount });
  }
  const maximumMask = 2 ** bounds.capabilityCount - 1;
  for (let authorityMask = 0; authorityMask <= maximumMask; authorityMask += 1)
    for (
      let budgetCeiling = 0;
      budgetCeiling <= bounds.totalBudgetUnits + 1;
      budgetCeiling += 1
    )
      commands.push({ kind: "delegate", authorityMask, budgetCeiling });
  commands.push(
    { kind: "delegate", authorityMask: -1, budgetCeiling: 0 },
    { kind: "delegate", authorityMask: maximumMask + 1, budgetCeiling: 0 },
  );
  const allocationTuples = finiteAllocationTuples(bounds);
  for (const tuple of allocationTuples) {
    commands.push({ kind: "finalize_allocation", ...tuple });
    for (let amount = 1; amount <= bounds.totalBudgetUnits + 1; amount += 1)
      commands.push({ kind: "commit_effect", ...tuple, amount });
  }
  const baseline = allocationTuples[0]!;
  commands.push(...enumerateAllocationNegativeCommands(bounds, baseline));
  return deepFreezeCollective(commands);
}

function finiteAllocationTuples(
  bounds: BoundedCollectiveControlBoundsV1,
): readonly AllocationTupleV1[] {
  const tuples: AllocationTupleV1[] = [];
  for (
    let membershipEpoch = 0;
    membershipEpoch <= bounds.maximumMembershipEpoch;
    membershipEpoch += 1
  )
    for (
      let assignmentEpoch = 0;
      assignmentEpoch <= bounds.maximumEpoch;
      assignmentEpoch += 1
    )
      for (
        let fencingToken = 0;
        fencingToken <= bounds.maximumFence;
        fencingToken += 1
      )
        for (let assignee = 0; assignee < bounds.assigneeCount; assignee += 1)
          for (
            let capability = 0;
            capability < bounds.capabilityCount;
            capability += 1
          )
            for (let role = 0; role < bounds.roleCount; role += 1)
              for (
                let effectSink = 0;
                effectSink < bounds.effectSinkCount;
                effectSink += 1
              )
                tuples.push({
                  membershipEpoch,
                  assignmentEpoch,
                  fencingToken,
                  assignee,
                  capability,
                  role,
                  effectSink,
                });
  return deepFreezeCollective(tuples);
}

function enumerateAllocationNegativeCommands(
  bounds: BoundedCollectiveControlBoundsV1,
  baseline: AllocationTupleV1,
): readonly CollectiveJson[] {
  const commands: CollectiveJson[] = [];
  const coordinateUpperBounds: Readonly<Record<string, number>> = {
    membershipEpoch: bounds.maximumMembershipEpoch + 1,
    assignmentEpoch: bounds.maximumEpoch + 1,
    fencingToken: bounds.maximumFence + 1,
    assignee: bounds.assigneeCount,
    capability: bounds.capabilityCount,
    role: bounds.roleCount,
    effectSink: bounds.effectSinkCount,
  };
  const finalizeBase: Record<string, CollectiveJson> = {
    kind: "finalize_allocation",
    ...baseline,
  };
  const commitBase: Record<string, CollectiveJson> = {
    kind: "commit_effect",
    ...baseline,
    amount: 1,
  };
  addNegativeCommandVariants(commands, finalizeBase, coordinateUpperBounds);
  addNegativeCommandVariants(commands, commitBase, {
    ...coordinateUpperBounds,
    amount: bounds.totalBudgetUnits + 1,
  });
  commands.push({ ...commitBase, amount: 0 });
  return deepFreezeCollective(commands);
}

function addNegativeCommandVariants(
  commands: CollectiveJson[],
  base: Readonly<Record<string, CollectiveJson>>,
  upperBounds: Readonly<Record<string, number>>,
): void {
  commands.push({ kind: base.kind }, { ...base, unexpected: true });
  for (const field of Object.keys(upperBounds)) {
    const missing = { ...base };
    delete missing[field];
    commands.push(
      missing,
      { ...base, [field]: "wrong-type" },
      { ...base, [field]: -1 },
      { ...base, [field]: upperBounds[field]! },
    );
  }
}

function checkTransition(
  before: BoundedCollectiveControlStateV1,
  command: CollectiveJson,
  actual: BoundedCollectiveControlTransitionResultV1,
  expected: BoundedCollectiveControlTransitionResultV1,
  bounds: BoundedCollectiveControlBoundsV1,
): {
  readonly property: BoundedCollectiveControlPropertyV1;
  readonly reasonCode: string;
} | null {
  if (
    !actual ||
    (actual.status !== "accepted" && actual.status !== "rejected") ||
    typeof actual.reasonCode !== "string"
  )
    return violation("fail_closed_transitions", "transition_result_invalid");
  if (expected.status === "rejected" && actual.status !== "rejected") {
    const parsed = parseCommand(command);
    if (
      parsed.ok &&
      parsed.command.kind === "commit_effect" &&
      expected.reasonCode === "effect_allocation_not_finalized"
    )
      return violation(
        "effect_authorization_binding",
        "effect_accepted_without_exact_finality",
      );
    return violation("fail_closed_transitions", "invalid_transition_accepted");
  }
  if (expected.status === "accepted" && actual.status === "rejected")
    return stateKeySafe(actual.state) === stateKey(before)
      ? violation("transition_conformance", "valid_transition_rejected")
      : violation(
          "fail_closed_transitions",
          "rejected_transition_mutated_state",
        );
  if (actual.status === "rejected")
    return stateKeySafe(actual.state) === stateKey(before)
      ? null
      : violation(
          "fail_closed_transitions",
          "rejected_transition_mutated_state",
        );
  try {
    validateState(actual.state, bounds);
  } catch {
    return violation("fail_closed_transitions", "accepted_state_invalid");
  }
  const after = actual.state;
  const parsed = parseCommand(command);
  if (!parsed.ok)
    return violation(
      "transition_conformance",
      "accepted_command_not_parseable",
    );
  const acceptedCommand = parsed.command;
  for (
    let coordinate = 0;
    coordinate < before.finalityValues.length;
    coordinate += 1
  ) {
    const prior = before.finalityValues[coordinate];
    if (prior !== null && after.finalityValues[coordinate] !== prior)
      return violation("finality_uniqueness", "finality_value_changed");
    if (
      acceptedCommand.kind !== "finalize" ||
      acceptedCommand.coordinate !== coordinate
    ) {
      if (after.finalityValues[coordinate] !== prior)
        return violation("finality_uniqueness", "unaddressed_finality_changed");
    } else if (after.finalityValues[coordinate] !== acceptedCommand.value) {
      return violation("finality_uniqueness", "finality_command_not_bound");
    }
  }
  if (
    after.membershipEpoch < before.membershipEpoch ||
    after.assignmentEpoch < before.assignmentEpoch ||
    after.fencingToken < before.fencingToken
  )
    return violation(
      "monotonic_epoch_and_fence",
      "authority_coordinate_regressed",
    );
  if (
    after.availableBudgetUnits +
      after.reservedBudgetUnits +
      after.consumedBudgetUnits !==
      after.totalBudgetUnits ||
    after.totalBudgetUnits !== before.totalBudgetUnits
  )
    return violation("budget_conservation", "budget_balance_changed");
  if (after.childConsumedBudgetUnits < before.childConsumedBudgetUnits)
    return violation("budget_conservation", "delegated_consumption_regressed");
  if (
    !isSubset(after.childAuthorityMask, after.parentAuthorityMask) ||
    after.childBudgetCeiling > after.parentBudgetCeiling ||
    !isSubset(after.parentAuthorityMask, before.parentAuthorityMask) ||
    after.parentBudgetCeiling > before.parentBudgetCeiling ||
    !isSubset(after.childAuthorityMask, before.childAuthorityMask) ||
    after.childBudgetCeiling > before.childBudgetCeiling
  )
    return violation("authority_attenuation", "child_authority_widened");
  const effectDelta = after.committedEffectCount - before.committedEffectCount;
  if (effectDelta !== 0) {
    if (effectDelta !== 1 || acceptedCommand.kind !== "commit_effect")
      return violation(
        "effect_authorization_binding",
        "effect_committed_without_bound_command",
      );
    if (!allocationMatches(before, acceptedCommand))
      return violation(
        "effect_authorization_binding",
        "effect_identity_not_finalized",
      );
    if (
      acceptedCommand.membershipEpoch !== before.membershipEpoch ||
      acceptedCommand.assignmentEpoch !== before.assignmentEpoch ||
      acceptedCommand.fencingToken !== before.fencingToken
    )
      return violation(
        "stale_effect_exclusion",
        "effect_committed_without_current_fence",
      );
  }
  if (stateKey(after) !== stateKey(expected.state))
    return violation("transition_conformance", "accepted_transition_diverged");
  return null;
}

function validateState(
  input: BoundedCollectiveControlStateV1,
  bounds: BoundedCollectiveControlBoundsV1,
): BoundedCollectiveControlStateV1 {
  if (!input || typeof input !== "object" || input.schemaVersion !== 1)
    throw new TypeError("bounded model state is invalid");
  if (
    !integerIn(input.membershipEpoch, 0, bounds.maximumMembershipEpoch) ||
    !integerIn(input.assignmentEpoch, 0, bounds.maximumEpoch) ||
    !integerIn(input.fencingToken, 0, bounds.maximumFence) ||
    !Array.isArray(input.finalityValues) ||
    input.finalityValues.length !== bounds.decisionCoordinateCount ||
    input.finalityValues.some(
      (value) =>
        value !== null && !integerIn(value, 0, bounds.finalityValueCount - 1),
    )
  )
    throw new TypeError("bounded model state coordinate is invalid");
  const finalizedCoordinates = [
    input.finalizedMembershipEpoch,
    input.finalizedAssignmentEpoch,
    input.finalizedFencingToken,
    input.finalizedAssignee,
    input.finalizedCapability,
    input.finalizedRole,
    input.finalizedEffectSink,
  ];
  const hasNoFinalizedAllocation = finalizedCoordinates.every(
    (value) => value === null,
  );
  const hasValidFinalizedAllocation =
    input.finalizedMembershipEpoch === input.membershipEpoch &&
    input.finalizedAssignmentEpoch === input.assignmentEpoch &&
    input.finalizedFencingToken === input.fencingToken &&
    integerIn(input.finalizedAssignee, 0, bounds.assigneeCount - 1) &&
    integerIn(input.finalizedCapability, 0, bounds.capabilityCount - 1) &&
    integerIn(input.finalizedRole, 0, bounds.roleCount - 1) &&
    integerIn(input.finalizedEffectSink, 0, bounds.effectSinkCount - 1);
  if (!hasNoFinalizedAllocation && !hasValidFinalizedAllocation)
    throw new TypeError("bounded model finalized allocation is invalid");
  const budgetValues = [
    input.totalBudgetUnits,
    input.availableBudgetUnits,
    input.reservedBudgetUnits,
    input.consumedBudgetUnits,
    input.parentBudgetCeiling,
    input.childBudgetCeiling,
    input.childConsumedBudgetUnits,
  ];
  if (
    input.totalBudgetUnits !== bounds.totalBudgetUnits ||
    budgetValues.some(
      (value) => !integerIn(value, 0, bounds.totalBudgetUnits),
    ) ||
    input.availableBudgetUnits +
      input.reservedBudgetUnits +
      input.consumedBudgetUnits !==
      input.totalBudgetUnits ||
    !integerIn(input.parentAuthorityMask, 0, 2 ** bounds.capabilityCount - 1) ||
    !integerIn(input.childAuthorityMask, 0, 2 ** bounds.capabilityCount - 1) ||
    !isSubset(input.parentAuthorityMask, bounds.initialParentAuthorityMask) ||
    !isSubset(input.childAuthorityMask, input.parentAuthorityMask) ||
    input.childBudgetCeiling > input.parentBudgetCeiling ||
    input.childConsumedBudgetUnits + input.reservedBudgetUnits >
      input.childBudgetCeiling ||
    input.childConsumedBudgetUnits > input.consumedBudgetUnits ||
    !Number.isSafeInteger(input.committedEffectCount) ||
    input.committedEffectCount < 0 ||
    input.committedEffectCount > input.childConsumedBudgetUnits
  )
    throw new TypeError("bounded model state balance is invalid");
  return input;
}

function counterexample(
  bounds: BoundedCollectiveControlBoundsV1,
  identity: BoundedModelIdentityV1,
  property: BoundedCollectiveControlPropertyV1,
  reasonCode: string,
  trace: readonly BoundedCollectiveControlTraceStepV1[],
  exploredStateSetDigest: `sha256:${string}`,
): BoundedCollectiveControlCounterexampleV1 {
  const traceDigest = digestCollectiveJsonV1(
    "evidence-chain",
    trace as unknown as CollectiveJson,
  );
  const body = {
    schemaVersion: 1 as const,
    modelId: BOUNDED_COLLECTIVE_CONTROL_MODEL_ID,
    status: "counterexample" as const,
    property,
    reasonCode,
    bounds,
    ...identity,
    exploredStateSetDigest,
    trace,
    traceDigest,
    limitation: BOUNDED_COLLECTIVE_CONTROL_MODEL_LIMITATION,
  };
  return deepFreezeCollective({
    ...body,
    counterexampleDigest: digestCollectiveJsonV1(
      "evidence-chain",
      body as unknown as CollectiveJson,
    ),
  });
}

function incomplete(
  bounds: BoundedCollectiveControlBoundsV1,
  identity: BoundedModelIdentityV1,
  reasonCode: BoundedCollectiveControlIncompleteReceiptV1["reasonCode"],
  exploredStates: number,
  exploredTransitions: number,
  maximumDepthReached: number,
  exploredStateSetDigest: `sha256:${string}`,
): BoundedCollectiveControlIncompleteReceiptV1 {
  const body = {
    schemaVersion: 1 as const,
    modelId: BOUNDED_COLLECTIVE_CONTROL_MODEL_ID,
    status: "incomplete" as const,
    reasonCode,
    bounds,
    ...identity,
    exploredStateSetDigest,
    exploredStates,
    exploredTransitions,
    maximumDepthReached,
    limitation: BOUNDED_COLLECTIVE_CONTROL_MODEL_LIMITATION,
  };
  return deepFreezeCollective({
    ...body,
    receiptDigest: digestCollectiveJsonV1(
      "snapshot",
      body as unknown as CollectiveJson,
    ),
  });
}

function appendTrace(
  trace: readonly BoundedCollectiveControlTraceStepV1[],
  before: BoundedCollectiveControlStateV1,
  command: CollectiveJson,
  outcome: BoundedCollectiveControlTraceStepV1["outcome"],
  reasonCode: string,
  afterStateDigest: `sha256:${string}` | null,
): readonly BoundedCollectiveControlTraceStepV1[] {
  return deepFreezeCollective([
    ...trace,
    {
      index: trace.length,
      command,
      outcome,
      reasonCode,
      beforeStateDigest: digestState(before),
      afterStateDigest,
    },
  ]);
}

function accept(
  state: BoundedCollectiveControlStateV1,
  reasonCode: string,
): BoundedCollectiveControlTransitionResultV1 {
  return deepFreezeCollective({ status: "accepted", reasonCode, state });
}

function reject(
  state: BoundedCollectiveControlStateV1,
  reasonCode: string,
): BoundedCollectiveControlTransitionResultV1 {
  return deepFreezeCollective({ status: "rejected", reasonCode, state });
}

function freezeState(
  state: BoundedCollectiveControlStateV1,
): BoundedCollectiveControlStateV1 {
  return deepFreezeCollective({
    ...state,
    finalityValues: [...state.finalityValues],
  });
}

function digestState(
  state: BoundedCollectiveControlStateV1,
): `sha256:${string}` {
  return digestCollectiveJsonV1("state", state as unknown as CollectiveJson);
}

function digestExploredStateSet(
  entries: Iterable<{ readonly state: BoundedCollectiveControlStateV1 }>,
): `sha256:${string}` {
  const stateDigests = Array.from(entries, ({ state }) => digestState(state));
  stateDigests.sort();
  return digestCollectiveJsonV1(
    "snapshot",
    stateDigests as unknown as CollectiveJson,
  );
}

function safeStateDigest(
  state: BoundedCollectiveControlStateV1 | undefined,
): `sha256:${string}` | null {
  try {
    return state ? digestState(state) : null;
  } catch {
    return null;
  }
}

function stateKey(state: BoundedCollectiveControlStateV1): string {
  return canonicalizeCollectiveJsonV1(state as unknown as CollectiveJson);
}

function stateKeySafe(
  state: BoundedCollectiveControlStateV1 | undefined,
): string | null {
  try {
    return state ? stateKey(state) : null;
  } catch {
    return null;
  }
}

function violation(
  property: BoundedCollectiveControlPropertyV1,
  reasonCode: string,
): {
  readonly property: BoundedCollectiveControlPropertyV1;
  readonly reasonCode: string;
} {
  return { property, reasonCode };
}

function isSubset(candidate: number, ceiling: number): boolean {
  return (candidate & ~ceiling) === 0;
}

function allocationMatches(
  state: BoundedCollectiveControlStateV1,
  command: Extract<
    BoundedCollectiveControlCommandV1,
    { readonly kind: "finalize_allocation" | "commit_effect" }
  >,
): boolean {
  return (
    state.finalizedMembershipEpoch === command.membershipEpoch &&
    state.finalizedAssignmentEpoch === command.assignmentEpoch &&
    state.finalizedFencingToken === command.fencingToken &&
    state.finalizedAssignee === command.assignee &&
    state.finalizedCapability === command.capability &&
    state.finalizedRole === command.role &&
    state.finalizedEffectSink === command.effectSink
  );
}

function isCompoundAllocationTuple(
  command: Extract<
    BoundedCollectiveControlCommandV1,
    { readonly kind: "finalize_allocation" | "commit_effect" }
  >,
): boolean {
  return (
    [
      command.membershipEpoch,
      command.assignmentEpoch,
      command.fencingToken,
      command.assignee,
      command.capability,
      command.role,
      command.effectSink,
    ].filter((value) => value !== 0).length >= 2
  );
}

function isRawAllocationCommand(command: CollectiveJson): boolean {
  return (
    command !== null &&
    typeof command === "object" &&
    !Array.isArray(command) &&
    (command.kind === "finalize_allocation" || command.kind === "commit_effect")
  );
}

function parseCommand(
  input: unknown,
):
  | { readonly ok: true; readonly command: BoundedCollectiveControlCommandV1 }
  | { readonly ok: false; readonly reasonCode: string } {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { ok: false, reasonCode: "malformed_command" };
  try {
    canonicalizeCollectiveJsonV1(input as CollectiveJson);
  } catch {
    return { ok: false, reasonCode: "malformed_command" };
  }
  const value = input as Record<string, unknown>;
  switch (value.kind) {
    case "finalize":
      return exactCommand(value, ["coordinate", "kind", "value"])
        ? {
            ok: true,
            command: {
              kind: "finalize",
              coordinate: value.coordinate as number,
              value: value.value as number,
            },
          }
        : { ok: false, reasonCode: "malformed_command" };
    case "advance_authority":
      return exactCommand(value, [
        "assignmentEpoch",
        "fencingToken",
        "kind",
        "membershipEpoch",
      ])
        ? {
            ok: true,
            command: {
              kind: "advance_authority",
              membershipEpoch: value.membershipEpoch as number,
              assignmentEpoch: value.assignmentEpoch as number,
              fencingToken: value.fencingToken as number,
            },
          }
        : { ok: false, reasonCode: "malformed_command" };
    case "finalize_allocation":
      return exactCommand(value, [
        "assignee",
        "assignmentEpoch",
        "capability",
        "effectSink",
        "fencingToken",
        "kind",
        "membershipEpoch",
        "role",
      ])
        ? {
            ok: true,
            command: {
              kind: "finalize_allocation",
              membershipEpoch: value.membershipEpoch as number,
              assignmentEpoch: value.assignmentEpoch as number,
              fencingToken: value.fencingToken as number,
              assignee: value.assignee as number,
              capability: value.capability as number,
              role: value.role as number,
              effectSink: value.effectSink as number,
            },
          }
        : { ok: false, reasonCode: "malformed_command" };
    case "reserve_budget":
    case "consume_reservation":
    case "release_reservation":
      return exactCommand(value, ["amount", "kind"])
        ? {
            ok: true,
            command: {
              kind: value.kind,
              amount: value.amount as number,
            },
          }
        : { ok: false, reasonCode: "malformed_command" };
    case "delegate":
      return exactCommand(value, ["authorityMask", "budgetCeiling", "kind"])
        ? {
            ok: true,
            command: {
              kind: "delegate",
              authorityMask: value.authorityMask as number,
              budgetCeiling: value.budgetCeiling as number,
            },
          }
        : { ok: false, reasonCode: "malformed_command" };
    case "commit_effect":
      return exactCommand(value, [
        "amount",
        "assignee",
        "assignmentEpoch",
        "capability",
        "effectSink",
        "fencingToken",
        "kind",
        "membershipEpoch",
        "role",
      ])
        ? {
            ok: true,
            command: {
              kind: "commit_effect",
              membershipEpoch: value.membershipEpoch as number,
              assignmentEpoch: value.assignmentEpoch as number,
              fencingToken: value.fencingToken as number,
              assignee: value.assignee as number,
              capability: value.capability as number,
              role: value.role as number,
              effectSink: value.effectSink as number,
              amount: value.amount as number,
            },
          }
        : { ok: false, reasonCode: "malformed_command" };
    default:
      return { ok: false, reasonCode: "unknown_command" };
  }
}

function exactCommand(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  return (
    actual.length === keys.length &&
    actual.every((key, index) => key === keys[index])
  );
}

function positive(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function integerIn(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= minimum &&
    (value as number) <= maximum
  );
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (!integerIn(value, minimum, maximum))
    throw new TypeError(`bounded model ${label} is invalid`);
  return value;
}

function requiredDigest(value: unknown, label: string): `sha256:${string}` {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError(`bounded model ${label} is invalid`);
  return value as `sha256:${string}`;
}

function errorReason(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "transition_threw";
}
