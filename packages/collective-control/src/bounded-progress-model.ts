import type { CollectiveJson } from "./contracts.js";
import {
  canonicalizeCollectiveJsonV1,
  deepFreezeCollective,
  digestCollectiveJsonV1,
} from "./canonical.js";

export const BOUNDED_COLLECTIVE_PROGRESS_MODEL_VERSION = 1 as const;
export const BOUNDED_COLLECTIVE_PROGRESS_MODEL_ID =
  "agentplat.collective-control.bounded-progress-model.v1" as const;
export const BOUNDED_COLLECTIVE_PROGRESS_MODEL_LIMITATION =
  "A completed result proves only the four conditional progress obligations in the deterministic finite fair-scheduler abstraction and configured bounds; it does not prove real network delivery, quorum availability, recovery infrastructure, signal quality, scheduler fairness, or production liveness." as const;

export const REFERENCE_BOUNDED_COLLECTIVE_PROGRESS_TRANSITION_CONTENT_V1 =
  deepFreezeCollective({
    modelId: BOUNDED_COLLECTIVE_PROGRESS_MODEL_ID,
    implementationId: "reference-progress-transition",
    implementationVersion: 1,
    schedulerSlots: [
      "causal_delivery",
      "quorum_finality",
      "successor_recovery",
      "persistent_signal_adaptation",
    ],
    rules: [
      "every accepted fair tick advances exactly one scheduler slot",
      "causally available input progresses when its delivery slot is scheduled",
      "a decision progresses when its quorum-available slot is scheduled",
      "a certified checkpoint progresses when an available successor slot is scheduled",
      "a persistent admitted signal progresses when its fair adaptation slot is scheduled",
      "malformed and unknown events reject without mutation",
    ],
  });

export const REFERENCE_BOUNDED_COLLECTIVE_PROGRESS_TRANSITION_DIGEST_V1 =
  digestCollectiveJsonV1(
    "snapshot",
    REFERENCE_BOUNDED_COLLECTIVE_PROGRESS_TRANSITION_CONTENT_V1,
  );

export type BoundedCollectiveProgressPropertyV1 =
  | "causal_delivery_progress"
  | "quorum_finality_progress"
  | "successor_recovery_progress"
  | "persistent_signal_adaptation_progress"
  | "fail_closed_progress_transitions"
  | "progress_transition_conformance";

export const BOUNDED_COLLECTIVE_PROGRESS_PROPERTIES_V1 = Object.freeze([
  "causal_delivery_progress",
  "quorum_finality_progress",
  "successor_recovery_progress",
  "persistent_signal_adaptation_progress",
  "fail_closed_progress_transitions",
  "progress_transition_conformance",
] as const satisfies readonly BoundedCollectiveProgressPropertyV1[]);

export interface BoundedCollectiveProgressBoundsV1 {
  readonly schemaVersion: 1;
  /** Semantic horizon for the deterministic four-slot fair scheduler. */
  readonly maximumFairSchedulerTicks: number;
  readonly maximumExploredStates: number;
  readonly maximumExploredTransitions: number;
}

export interface BoundedCollectiveProgressStateV1 {
  readonly schemaVersion: 1;
  readonly fairSchedulerCursor: number;
  readonly elapsedFairSchedulerTicks: number;
  readonly causalInputAvailable: true;
  readonly causalPredecessorDelivered: true;
  readonly deliveryCompleted: boolean;
  readonly quorumAvailable: true;
  readonly finalityCompleted: boolean;
  readonly certifiedCheckpointAvailable: true;
  readonly successorAvailable: true;
  readonly recoveryCompleted: boolean;
  readonly persistentSignalAvailable: true;
  readonly fairSchedulingAssumed: true;
  readonly adaptationCompleted: boolean;
}

export type BoundedCollectiveProgressEventV1 = {
  readonly kind: "fair_scheduler_tick";
};

export interface BoundedCollectiveProgressTransitionResultV1 {
  readonly status: "accepted" | "rejected";
  readonly reasonCode: string;
  readonly state: BoundedCollectiveProgressStateV1;
}

export interface BoundedCollectiveProgressTransitionV1 {
  readonly implementationDigest: `sha256:${string}`;
  apply(input: {
    readonly state: BoundedCollectiveProgressStateV1;
    readonly event: unknown;
    readonly bounds: BoundedCollectiveProgressBoundsV1;
  }): BoundedCollectiveProgressTransitionResultV1;
}

export interface BoundedCollectiveProgressTraceStepV1 {
  readonly index: number;
  readonly event: CollectiveJson;
  readonly outcome: "accepted" | "rejected" | "threw";
  readonly reasonCode: string;
  readonly beforeStateDigest: `sha256:${string}`;
  readonly afterStateDigest: `sha256:${string}` | null;
}

interface BoundedCollectiveProgressIdentityV1 {
  readonly transitionImplementationDigest: `sha256:${string}`;
  readonly eventCorpusDigest: `sha256:${string}`;
  readonly boundedProgressSpaceDigest: `sha256:${string}`;
}

export interface BoundedCollectiveProgressCounterexampleV1 extends BoundedCollectiveProgressIdentityV1 {
  readonly schemaVersion: 1;
  readonly modelId: typeof BOUNDED_COLLECTIVE_PROGRESS_MODEL_ID;
  readonly status: "counterexample";
  readonly property: BoundedCollectiveProgressPropertyV1;
  readonly reasonCode: string;
  readonly bounds: BoundedCollectiveProgressBoundsV1;
  readonly exploredStateSetDigest: `sha256:${string}`;
  readonly trace: readonly BoundedCollectiveProgressTraceStepV1[];
  readonly traceDigest: `sha256:${string}`;
  readonly counterexampleDigest: `sha256:${string}`;
  readonly limitation: typeof BOUNDED_COLLECTIVE_PROGRESS_MODEL_LIMITATION;
}

export interface BoundedCollectiveProgressPropertyReceiptV1 {
  readonly property: BoundedCollectiveProgressPropertyV1;
  readonly checkedTransitions: number;
}

export interface BoundedCollectiveProgressProofReceiptV1 extends BoundedCollectiveProgressIdentityV1 {
  readonly schemaVersion: 1;
  readonly modelId: typeof BOUNDED_COLLECTIVE_PROGRESS_MODEL_ID;
  readonly status: "proved_within_bounds";
  readonly bounds: BoundedCollectiveProgressBoundsV1;
  readonly exploredStateSetDigest: `sha256:${string}`;
  readonly exploredStates: number;
  readonly exploredTransitions: number;
  readonly acceptedReferenceTransitions: number;
  readonly rejectedReferenceTransitions: number;
  readonly maximumFairSchedulerTickReached: number;
  readonly properties: readonly BoundedCollectiveProgressPropertyReceiptV1[];
  readonly initialStateDigest: `sha256:${string}`;
  readonly receiptDigest: `sha256:${string}`;
  readonly limitation: typeof BOUNDED_COLLECTIVE_PROGRESS_MODEL_LIMITATION;
}

export interface BoundedCollectiveProgressIncompleteReceiptV1 extends BoundedCollectiveProgressIdentityV1 {
  readonly schemaVersion: 1;
  readonly modelId: typeof BOUNDED_COLLECTIVE_PROGRESS_MODEL_ID;
  readonly status: "incomplete";
  readonly reasonCode:
    | "maximum_fair_scheduler_ticks_insufficient"
    | "maximum_explored_states_reached"
    | "maximum_explored_transitions_reached";
  readonly bounds: BoundedCollectiveProgressBoundsV1;
  readonly exploredStateSetDigest: `sha256:${string}`;
  readonly exploredStates: number;
  readonly exploredTransitions: number;
  readonly maximumFairSchedulerTickReached: number;
  readonly receiptDigest: `sha256:${string}`;
  readonly limitation: typeof BOUNDED_COLLECTIVE_PROGRESS_MODEL_LIMITATION;
}

export type BoundedCollectiveProgressCheckResultV1 =
  | BoundedCollectiveProgressProofReceiptV1
  | BoundedCollectiveProgressCounterexampleV1
  | BoundedCollectiveProgressIncompleteReceiptV1;

export const DEFAULT_BOUNDED_COLLECTIVE_PROGRESS_BOUNDS_V1 =
  Object.freeze<BoundedCollectiveProgressBoundsV1>({
    schemaVersion: 1,
    maximumFairSchedulerTicks: 4,
    maximumExploredStates: 64,
    maximumExploredTransitions: 1_024,
  });

export function createBoundedCollectiveProgressBoundsV1(
  input: BoundedCollectiveProgressBoundsV1 = DEFAULT_BOUNDED_COLLECTIVE_PROGRESS_BOUNDS_V1,
): BoundedCollectiveProgressBoundsV1 {
  if (!input || typeof input !== "object" || input.schemaVersion !== 1)
    throw new TypeError("bounded progress bounds are invalid");
  return deepFreezeCollective({
    schemaVersion: 1,
    maximumFairSchedulerTicks: boundedInteger(
      input.maximumFairSchedulerTicks,
      1,
      256,
      "maximumFairSchedulerTicks",
    ),
    maximumExploredStates: boundedInteger(
      input.maximumExploredStates,
      1,
      10_000,
      "maximumExploredStates",
    ),
    maximumExploredTransitions: boundedInteger(
      input.maximumExploredTransitions,
      1,
      100_000,
      "maximumExploredTransitions",
    ),
  });
}

export function createInitialBoundedCollectiveProgressStateV1(): BoundedCollectiveProgressStateV1 {
  return freezeState({
    schemaVersion: 1,
    fairSchedulerCursor: 0,
    elapsedFairSchedulerTicks: 0,
    causalInputAvailable: true,
    causalPredecessorDelivered: true,
    deliveryCompleted: false,
    quorumAvailable: true,
    finalityCompleted: false,
    certifiedCheckpointAvailable: true,
    successorAvailable: true,
    recoveryCompleted: false,
    persistentSignalAvailable: true,
    fairSchedulingAssumed: true,
    adaptationCompleted: false,
  });
}

/** Reference reducer for the conditional, deterministic fair-scheduler abstraction. */
export function applyBoundedCollectiveProgressTransitionV1(input: {
  readonly state: BoundedCollectiveProgressStateV1;
  readonly event: unknown;
  readonly bounds: BoundedCollectiveProgressBoundsV1;
}): BoundedCollectiveProgressTransitionResultV1 {
  const bounds = createBoundedCollectiveProgressBoundsV1(input.bounds);
  const state = validateState(input.state, bounds);
  const event = parseEvent(input.event);
  if (!event.ok) return reject(state, event.reasonCode);
  if (state.elapsedFairSchedulerTicks >= bounds.maximumFairSchedulerTicks)
    return reject(state, "fair_scheduler_horizon_reached");
  const next: BoundedCollectiveProgressStateV1 = {
    ...state,
    elapsedFairSchedulerTicks: state.elapsedFairSchedulerTicks + 1,
    fairSchedulerCursor: (state.fairSchedulerCursor + 1) % 4,
    deliveryCompleted:
      state.deliveryCompleted ||
      (state.fairSchedulerCursor === 0 &&
        state.causalInputAvailable &&
        state.causalPredecessorDelivered),
    finalityCompleted:
      state.finalityCompleted ||
      (state.fairSchedulerCursor === 1 && state.quorumAvailable),
    recoveryCompleted:
      state.recoveryCompleted ||
      (state.fairSchedulerCursor === 2 &&
        state.certifiedCheckpointAvailable &&
        state.successorAvailable),
    adaptationCompleted:
      state.adaptationCompleted ||
      (state.fairSchedulerCursor === 3 &&
        state.persistentSignalAvailable &&
        state.fairSchedulingAssumed),
  };
  return accept(freezeState(next), "fair_scheduler_tick_applied");
}

export const REFERENCE_BOUNDED_COLLECTIVE_PROGRESS_TRANSITION_V1 =
  Object.freeze<BoundedCollectiveProgressTransitionV1>({
    implementationDigest:
      REFERENCE_BOUNDED_COLLECTIVE_PROGRESS_TRANSITION_DIGEST_V1,
    apply: applyBoundedCollectiveProgressTransitionV1,
  });

export function checkBoundedCollectiveProgressModelV1(
  input: {
    readonly bounds?: BoundedCollectiveProgressBoundsV1;
    readonly transition?: BoundedCollectiveProgressTransitionV1;
  } = {},
): BoundedCollectiveProgressCheckResultV1 {
  const bounds = createBoundedCollectiveProgressBoundsV1(
    input.bounds ?? DEFAULT_BOUNDED_COLLECTIVE_PROGRESS_BOUNDS_V1,
  );
  const transition =
    input.transition ?? REFERENCE_BOUNDED_COLLECTIVE_PROGRESS_TRANSITION_V1;
  if (!transition || typeof transition.apply !== "function")
    throw new TypeError("bounded progress transition is invalid");
  const events = enumerateEvents();
  const eventCorpusDigest = digestCollectiveJsonV1(
    "snapshot",
    events as unknown as CollectiveJson,
  );
  const identity: BoundedCollectiveProgressIdentityV1 = Object.freeze({
    transitionImplementationDigest: requiredDigest(
      transition.implementationDigest,
      "transition implementation digest",
    ),
    eventCorpusDigest,
    boundedProgressSpaceDigest: digestCollectiveJsonV1("snapshot", {
      modelId: BOUNDED_COLLECTIVE_PROGRESS_MODEL_ID,
      bounds: bounds as unknown as CollectiveJson,
      eventCorpusDigest,
    }),
  });
  const initial = createInitialBoundedCollectiveProgressStateV1();
  const initialKey = stateKey(initial);
  const visited = new Map<
    string,
    {
      readonly state: BoundedCollectiveProgressStateV1;
      readonly trace: readonly BoundedCollectiveProgressTraceStepV1[];
    }
  >([[initialKey, { state: initial, trace: Object.freeze([]) }]]);
  const queue = [initialKey];
  let cursor = 0;
  let exploredTransitions = 0;
  let acceptedReferenceTransitions = 0;
  let rejectedReferenceTransitions = 0;
  let maximumFairSchedulerTickReached = 0;

  while (cursor < queue.length) {
    const entry = visited.get(queue[cursor++]!)!;
    maximumFairSchedulerTickReached = Math.max(
      maximumFairSchedulerTickReached,
      entry.state.elapsedFairSchedulerTicks,
    );
    for (const event of events) {
      if (exploredTransitions >= bounds.maximumExploredTransitions)
        return incomplete(
          bounds,
          identity,
          "maximum_explored_transitions_reached",
          visited,
          exploredTransitions,
          maximumFairSchedulerTickReached,
        );
      exploredTransitions += 1;
      const expected = applyBoundedCollectiveProgressTransitionV1({
        state: entry.state,
        event,
        bounds,
      });
      if (expected.status === "accepted") acceptedReferenceTransitions += 1;
      else rejectedReferenceTransitions += 1;
      let actual: BoundedCollectiveProgressTransitionResultV1;
      try {
        actual = transition.apply({ state: entry.state, event, bounds });
      } catch (error) {
        return counterexample(
          bounds,
          identity,
          "fail_closed_progress_transitions",
          "transition_threw",
          appendTrace(
            entry.trace,
            entry.state,
            event,
            "threw",
            errorReason(error),
            null,
          ),
          visited,
        );
      }
      const trace = appendTrace(
        entry.trace,
        entry.state,
        event,
        actual?.status ?? "threw",
        actual?.reasonCode ?? "invalid_transition_result",
        safeStateDigest(actual?.state),
      );
      const violation = checkTransition(entry.state, actual, expected, bounds);
      if (violation)
        return counterexample(
          bounds,
          identity,
          violation.property,
          violation.reasonCode,
          trace,
          visited,
        );
      if (actual.status === "rejected") continue;
      const next = validateState(actual.state, bounds);
      const key = stateKey(next);
      if (visited.has(key)) continue;
      if (visited.size >= bounds.maximumExploredStates)
        return incomplete(
          bounds,
          identity,
          "maximum_explored_states_reached",
          visited,
          exploredTransitions,
          Math.max(
            maximumFairSchedulerTickReached,
            next.elapsedFairSchedulerTicks,
          ),
        );
      visited.set(key, { state: next, trace });
      queue.push(key);
    }
  }

  const terminal = Array.from(visited.values()).find(
    ({ state }) =>
      state.deliveryCompleted &&
      state.finalityCompleted &&
      state.recoveryCompleted &&
      state.adaptationCompleted,
  );
  if (!terminal)
    return incomplete(
      bounds,
      identity,
      "maximum_fair_scheduler_ticks_insufficient",
      visited,
      exploredTransitions,
      maximumFairSchedulerTickReached,
    );
  if (acceptedReferenceTransitions === 0)
    return counterexample(
      bounds,
      identity,
      "progress_transition_conformance",
      "no_reference_progress_transition_exercised",
      terminal.trace,
      visited,
    );
  const body = {
    schemaVersion: 1 as const,
    modelId: BOUNDED_COLLECTIVE_PROGRESS_MODEL_ID,
    status: "proved_within_bounds" as const,
    bounds,
    ...identity,
    exploredStateSetDigest: digestExploredStateSet(visited.values()),
    exploredStates: visited.size,
    exploredTransitions,
    acceptedReferenceTransitions,
    rejectedReferenceTransitions,
    maximumFairSchedulerTickReached,
    properties: BOUNDED_COLLECTIVE_PROGRESS_PROPERTIES_V1.map((property) => ({
      property,
      checkedTransitions: exploredTransitions,
    })),
    initialStateDigest: digestState(initial),
    limitation: BOUNDED_COLLECTIVE_PROGRESS_MODEL_LIMITATION,
  };
  return deepFreezeCollective({
    ...body,
    receiptDigest: digestCollectiveJsonV1(
      "snapshot",
      body as unknown as CollectiveJson,
    ),
  });
}

function enumerateEvents(): readonly CollectiveJson[] {
  const events: CollectiveJson[] = [
    null,
    false,
    1,
    "not-an-event",
    [],
    {},
    { kind: "unknown" },
    { kind: "fair_scheduler_tick", unexpected: true },
    { kind: "fair_scheduler_tick" },
  ];
  return deepFreezeCollective(events);
}

function checkTransition(
  before: BoundedCollectiveProgressStateV1,
  actual: BoundedCollectiveProgressTransitionResultV1,
  expected: BoundedCollectiveProgressTransitionResultV1,
  bounds: BoundedCollectiveProgressBoundsV1,
): {
  readonly property: BoundedCollectiveProgressPropertyV1;
  readonly reasonCode: string;
} | null {
  if (
    !actual ||
    (actual.status !== "accepted" && actual.status !== "rejected") ||
    typeof actual.reasonCode !== "string"
  )
    return violation(
      "fail_closed_progress_transitions",
      "transition_result_invalid",
    );
  if (expected.status === "rejected" && actual.status !== "rejected")
    return violation(
      "fail_closed_progress_transitions",
      "invalid_transition_accepted",
    );
  if (expected.status === "accepted" && actual.status === "rejected")
    return stateKeySafe(actual.state) === stateKey(before)
      ? violation(
          "progress_transition_conformance",
          "valid_progress_transition_rejected",
        )
      : violation(
          "fail_closed_progress_transitions",
          "rejected_transition_mutated_state",
        );
  if (actual.status === "rejected")
    return stateKeySafe(actual.state) === stateKey(before)
      ? null
      : violation(
          "fail_closed_progress_transitions",
          "rejected_transition_mutated_state",
        );
  try {
    validateState(actual.state, bounds);
  } catch {
    return violation(
      "fail_closed_progress_transitions",
      "accepted_state_invalid",
    );
  }
  const after = actual.state;
  if (expected.state.deliveryCompleted && !after.deliveryCompleted)
    return violation(
      "causal_delivery_progress",
      "causal_delivery_did_not_progress_on_fair_slot",
    );
  if (expected.state.finalityCompleted && !after.finalityCompleted)
    return violation(
      "quorum_finality_progress",
      "quorum_finality_did_not_progress_on_fair_slot",
    );
  if (expected.state.recoveryCompleted && !after.recoveryCompleted)
    return violation(
      "successor_recovery_progress",
      "successor_recovery_did_not_progress_on_fair_slot",
    );
  if (expected.state.adaptationCompleted && !after.adaptationCompleted)
    return violation(
      "persistent_signal_adaptation_progress",
      "adaptation_did_not_progress_on_fair_slot",
    );
  if (
    (before.deliveryCompleted && !after.deliveryCompleted) ||
    (before.finalityCompleted && !after.finalityCompleted) ||
    (before.recoveryCompleted && !after.recoveryCompleted) ||
    (before.adaptationCompleted && !after.adaptationCompleted)
  )
    return violation(
      "fail_closed_progress_transitions",
      "completed_progress_regressed",
    );
  if (stateKey(after) !== stateKey(expected.state))
    return violation(
      "progress_transition_conformance",
      "accepted_progress_transition_diverged",
    );
  return null;
}

function validateState(
  state: BoundedCollectiveProgressStateV1,
  bounds: BoundedCollectiveProgressBoundsV1,
): BoundedCollectiveProgressStateV1 {
  if (!state || typeof state !== "object" || state.schemaVersion !== 1)
    throw new TypeError("bounded progress state is invalid");
  if (
    !integerIn(state.fairSchedulerCursor, 0, 3) ||
    !integerIn(
      state.elapsedFairSchedulerTicks,
      0,
      bounds.maximumFairSchedulerTicks,
    ) ||
    state.fairSchedulerCursor !== state.elapsedFairSchedulerTicks % 4 ||
    state.causalInputAvailable !== true ||
    state.causalPredecessorDelivered !== true ||
    state.quorumAvailable !== true ||
    state.certifiedCheckpointAvailable !== true ||
    state.successorAvailable !== true ||
    state.persistentSignalAvailable !== true ||
    state.fairSchedulingAssumed !== true ||
    typeof state.deliveryCompleted !== "boolean" ||
    typeof state.finalityCompleted !== "boolean" ||
    typeof state.recoveryCompleted !== "boolean" ||
    typeof state.adaptationCompleted !== "boolean"
  )
    throw new TypeError("bounded progress state assumption is invalid");
  return state;
}

function counterexample(
  bounds: BoundedCollectiveProgressBoundsV1,
  identity: BoundedCollectiveProgressIdentityV1,
  property: BoundedCollectiveProgressPropertyV1,
  reasonCode: string,
  trace: readonly BoundedCollectiveProgressTraceStepV1[],
  visited: ReadonlyMap<
    string,
    { readonly state: BoundedCollectiveProgressStateV1 }
  >,
): BoundedCollectiveProgressCounterexampleV1 {
  const traceDigest = digestCollectiveJsonV1(
    "evidence-chain",
    trace as unknown as CollectiveJson,
  );
  const body = {
    schemaVersion: 1 as const,
    modelId: BOUNDED_COLLECTIVE_PROGRESS_MODEL_ID,
    status: "counterexample" as const,
    property,
    reasonCode,
    bounds,
    ...identity,
    exploredStateSetDigest: digestExploredStateSet(visited.values()),
    trace,
    traceDigest,
    limitation: BOUNDED_COLLECTIVE_PROGRESS_MODEL_LIMITATION,
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
  bounds: BoundedCollectiveProgressBoundsV1,
  identity: BoundedCollectiveProgressIdentityV1,
  reasonCode: BoundedCollectiveProgressIncompleteReceiptV1["reasonCode"],
  visited: ReadonlyMap<
    string,
    { readonly state: BoundedCollectiveProgressStateV1 }
  >,
  exploredTransitions: number,
  maximumFairSchedulerTickReached: number,
): BoundedCollectiveProgressIncompleteReceiptV1 {
  const body = {
    schemaVersion: 1 as const,
    modelId: BOUNDED_COLLECTIVE_PROGRESS_MODEL_ID,
    status: "incomplete" as const,
    reasonCode,
    bounds,
    ...identity,
    exploredStateSetDigest: digestExploredStateSet(visited.values()),
    exploredStates: visited.size,
    exploredTransitions,
    maximumFairSchedulerTickReached,
    limitation: BOUNDED_COLLECTIVE_PROGRESS_MODEL_LIMITATION,
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
  trace: readonly BoundedCollectiveProgressTraceStepV1[],
  before: BoundedCollectiveProgressStateV1,
  event: CollectiveJson,
  outcome: BoundedCollectiveProgressTraceStepV1["outcome"],
  reasonCode: string,
  afterStateDigest: `sha256:${string}` | null,
): readonly BoundedCollectiveProgressTraceStepV1[] {
  return deepFreezeCollective([
    ...trace,
    {
      index: trace.length,
      event,
      outcome,
      reasonCode,
      beforeStateDigest: digestState(before),
      afterStateDigest,
    },
  ]);
}

function parseEvent(
  input: unknown,
):
  | { readonly ok: true; readonly event: BoundedCollectiveProgressEventV1 }
  | { readonly ok: false; readonly reasonCode: string } {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { ok: false, reasonCode: "malformed_progress_event" };
  try {
    canonicalizeCollectiveJsonV1(input as CollectiveJson);
  } catch {
    return { ok: false, reasonCode: "malformed_progress_event" };
  }
  const value = input as Record<string, unknown>;
  if (value.kind !== "fair_scheduler_tick")
    return { ok: false, reasonCode: "unknown_progress_event" };
  if (Object.keys(value).length !== 1)
    return { ok: false, reasonCode: "malformed_progress_event" };
  return { ok: true, event: { kind: "fair_scheduler_tick" } };
}

function accept(
  state: BoundedCollectiveProgressStateV1,
  reasonCode: string,
): BoundedCollectiveProgressTransitionResultV1 {
  return deepFreezeCollective({ status: "accepted", reasonCode, state });
}

function reject(
  state: BoundedCollectiveProgressStateV1,
  reasonCode: string,
): BoundedCollectiveProgressTransitionResultV1 {
  return deepFreezeCollective({ status: "rejected", reasonCode, state });
}

function freezeState(
  state: BoundedCollectiveProgressStateV1,
): BoundedCollectiveProgressStateV1 {
  return deepFreezeCollective({ ...state });
}

function digestState(
  state: BoundedCollectiveProgressStateV1,
): `sha256:${string}` {
  return digestCollectiveJsonV1("state", state as unknown as CollectiveJson);
}

function safeStateDigest(
  state: BoundedCollectiveProgressStateV1 | undefined,
): `sha256:${string}` | null {
  try {
    return state ? digestState(state) : null;
  } catch {
    return null;
  }
}

function digestExploredStateSet(
  entries: Iterable<{ readonly state: BoundedCollectiveProgressStateV1 }>,
): `sha256:${string}` {
  const stateDigests = Array.from(entries, ({ state }) => digestState(state));
  stateDigests.sort();
  return digestCollectiveJsonV1(
    "snapshot",
    stateDigests as unknown as CollectiveJson,
  );
}

function stateKey(state: BoundedCollectiveProgressStateV1): string {
  return canonicalizeCollectiveJsonV1(state as unknown as CollectiveJson);
}

function stateKeySafe(
  state: BoundedCollectiveProgressStateV1 | undefined,
): string | null {
  try {
    return state ? stateKey(state) : null;
  } catch {
    return null;
  }
}

function violation(
  property: BoundedCollectiveProgressPropertyV1,
  reasonCode: string,
): {
  readonly property: BoundedCollectiveProgressPropertyV1;
  readonly reasonCode: string;
} {
  return { property, reasonCode };
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
    throw new TypeError(`bounded progress ${label} is invalid`);
  return value;
}

function requiredDigest(value: unknown, label: string): `sha256:${string}` {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError(`bounded progress ${label} is invalid`);
  return value as `sha256:${string}`;
}

function errorReason(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "transition_threw";
}
