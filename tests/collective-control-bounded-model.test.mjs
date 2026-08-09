import assert from "node:assert/strict";
import test from "node:test";

import {
  BOUNDED_COLLECTIVE_CONTROL_PROPERTIES_V1,
  DEFAULT_BOUNDED_COLLECTIVE_CONTROL_BOUNDS_V1,
  REFERENCE_BOUNDED_COLLECTIVE_CONTROL_TRANSITION_DIGEST_V1,
  applyBoundedCollectiveControlTransitionV1,
  checkBoundedCollectiveControlModelV1,
} from "../packages/collective-control/dist/bounded-model.js";

test("the reference model exhausts the configured finite space", () => {
  const result = checkBoundedCollectiveControlModelV1();

  assert.equal(result.status, "proved_within_bounds");
  assert.ok(result.exploredStates > 1);
  assert.ok(result.exploredTransitions > result.exploredStates);
  assert.equal(result.maximumDepthReached, 2);
  assert.deepEqual(
    result.properties.map(({ property }) => property),
    BOUNDED_COLLECTIVE_CONTROL_PROPERTIES_V1,
  );
  assert.match(result.receiptDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(
    result.transitionImplementationDigest,
    REFERENCE_BOUNDED_COLLECTIVE_CONTROL_TRANSITION_DIGEST_V1,
  );
  assert.match(result.commandCorpusDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.match(result.boundedSpaceDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.match(result.exploredStateSetDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.ok(result.acceptedReferenceTransitions > 0);
  assert.ok(result.rejectedReferenceTransitions > 0);
  assert.ok(result.effectAuthorizationCoverage.acceptedEffects > 0);
  assert.ok(
    result.effectAuthorizationCoverage.compoundAllocationTupleWitnesses > 0,
  );
  assert.ok(
    result.effectAuthorizationCoverage.malformedAllocationRejections > 0,
  );
  assert.ok(
    result.properties.find(
      ({ property }) => property === "effect_authorization_binding",
    ).witnessCount > 0,
  );
  assert.match(
    result.limitation,
    /only the configured finite state and trace bounds/u,
  );
});

test("a violating transition returns a digest-bound trace", () => {
  const result = checkBoundedCollectiveControlModelV1({
    bounds: {
      ...DEFAULT_BOUNDED_COLLECTIVE_CONTROL_BOUNDS_V1,
      maximumTraceDepth: 2,
      decisionCoordinateCount: 2,
    },
    transition: {
      implementationDigest: sha("a"),
      apply(input) {
        const reference = applyBoundedCollectiveControlTransitionV1(input);
        if (
          reference.status === "accepted" &&
          input.command.kind === "finalize" &&
          input.command.coordinate === 0 &&
          input.state.finalityValues[1] === null
        ) {
          return {
            ...reference,
            state: {
              ...reference.state,
              finalityValues: [input.command.value, 0],
            },
          };
        }
        return reference;
      },
    },
  });

  assert.equal(result.status, "counterexample");
  assert.equal(result.property, "finality_uniqueness");
  assert.equal(result.reasonCode, "unaddressed_finality_changed");
  assert.equal(result.trace.length, 1);
  assert.match(result.traceDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.match(result.counterexampleDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(result.transitionImplementationDigest, sha("a"));
  assert.match(result.commandCorpusDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.match(result.boundedSpaceDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.match(result.exploredStateSetDigest, /^sha256:[0-9a-f]{64}$/u);
});

test("an insufficient exploration cap is explicit and never reported as proof", () => {
  const result = checkBoundedCollectiveControlModelV1({
    bounds: {
      ...DEFAULT_BOUNDED_COLLECTIVE_CONTROL_BOUNDS_V1,
      maximumExploredStates: 1,
    },
  });

  assert.equal(result.status, "incomplete");
  assert.equal(result.reasonCode, "maximum_explored_states_reached");
  assert.match(result.receiptDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(
    result.transitionImplementationDigest,
    REFERENCE_BOUNDED_COLLECTIVE_CONTROL_TRANSITION_DIGEST_V1,
  );
  assert.match(result.commandCorpusDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.match(result.boundedSpaceDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.match(result.exploredStateSetDigest, /^sha256:[0-9a-f]{64}$/u);
});

test("the transition work cap is also fail-closed", () => {
  const result = checkBoundedCollectiveControlModelV1({
    bounds: {
      ...DEFAULT_BOUNDED_COLLECTIVE_CONTROL_BOUNDS_V1,
      maximumExploredTransitions: 1,
    },
  });

  assert.equal(result.status, "incomplete");
  assert.equal(result.reasonCode, "maximum_explored_transitions_reached");
  assert.equal(result.exploredTransitions, 1);
});

test("the reference reducer rejects stale effects without mutation", () => {
  const bounds = DEFAULT_BOUNDED_COLLECTIVE_CONTROL_BOUNDS_V1;
  const advanced = applyBoundedCollectiveControlTransitionV1({
    state: modelState(),
    command: {
      kind: "advance_authority",
      membershipEpoch: 1,
      assignmentEpoch: 1,
      fencingToken: 1,
    },
    bounds,
  });
  assert.equal(advanced.status, "accepted");
  const stale = applyBoundedCollectiveControlTransitionV1({
    state: advanced.state,
    command: {
      kind: "commit_effect",
      membershipEpoch: 0,
      assignmentEpoch: 0,
      fencingToken: 0,
      assignee: 0,
      capability: 0,
      role: 0,
      effectSink: 0,
      amount: 1,
    },
    bounds,
  });
  assert.equal(stale.status, "rejected");
  assert.equal(stale.reasonCode, "effect_authority_stale");
  assert.strictEqual(stale.state, advanced.state);
});

test("a child budget ceiling limits aggregate delegated spend", () => {
  const bounds = DEFAULT_BOUNDED_COLLECTIVE_CONTROL_BOUNDS_V1;
  const initial = modelState({ childBudgetCeiling: 1 });
  const first = applyBoundedCollectiveControlTransitionV1({
    state: initial,
    command: {
      kind: "commit_effect",
      membershipEpoch: 0,
      assignmentEpoch: 0,
      fencingToken: 0,
      assignee: 0,
      capability: 0,
      role: 0,
      effectSink: 0,
      amount: 1,
    },
    bounds,
  });
  assert.equal(first.status, "accepted");
  assert.equal(first.state.childConsumedBudgetUnits, 1);
  const second = applyBoundedCollectiveControlTransitionV1({
    state: first.state,
    command: {
      kind: "commit_effect",
      membershipEpoch: 0,
      assignmentEpoch: 0,
      fencingToken: 0,
      assignee: 0,
      capability: 0,
      role: 0,
      effectSink: 0,
      amount: 1,
    },
    bounds,
  });
  assert.equal(second.status, "rejected");
  assert.equal(second.reasonCode, "effect_budget_unavailable");
  assert.strictEqual(second.state, first.state);
});

test("an effect requires exact finalized allocation identity", () => {
  const bounds = DEFAULT_BOUNDED_COLLECTIVE_CONTROL_BOUNDS_V1;
  const unfinalized = modelState({
    finalizedMembershipEpoch: null,
    finalizedAssignmentEpoch: null,
    finalizedFencingToken: null,
    finalizedAssignee: null,
    finalizedCapability: null,
    finalizedRole: null,
    finalizedEffectSink: null,
  });
  const premature = applyBoundedCollectiveControlTransitionV1({
    state: unfinalized,
    command: effectCommand(),
    bounds,
  });
  assert.equal(premature.status, "rejected");
  assert.equal(premature.reasonCode, "effect_allocation_not_finalized");
  assert.strictEqual(premature.state, unfinalized);

  const finalized = applyBoundedCollectiveControlTransitionV1({
    state: unfinalized,
    command: {
      kind: "finalize_allocation",
      membershipEpoch: 0,
      assignmentEpoch: 0,
      fencingToken: 0,
      assignee: 0,
      capability: 0,
      role: 0,
      effectSink: 0,
    },
    bounds,
  });
  assert.equal(finalized.status, "accepted");
  const committed = applyBoundedCollectiveControlTransitionV1({
    state: finalized.state,
    command: effectCommand(),
    bounds,
  });
  assert.equal(committed.status, "accepted");
});

test("effect identity mismatches reject without mutation", () => {
  const state = modelState();
  for (const [overrides, reasonCode] of [
    [{ membershipEpoch: 1 }, "effect_authority_stale"],
    [{ assignmentEpoch: 1 }, "effect_authority_stale"],
    [{ fencingToken: 1 }, "effect_authority_stale"],
    [{ assignee: 1 }, "effect_allocation_not_finalized"],
    [{ capability: 1 }, "effect_allocation_not_finalized"],
    [{ role: 1 }, "effect_allocation_not_finalized"],
    [{ effectSink: 1 }, "effect_allocation_not_finalized"],
  ]) {
    const result = applyBoundedCollectiveControlTransitionV1({
      state,
      command: effectCommand(overrides),
      bounds: DEFAULT_BOUNDED_COLLECTIVE_CONTROL_BOUNDS_V1,
    });
    assert.equal(result.status, "rejected");
    assert.equal(result.reasonCode, reasonCode);
    assert.strictEqual(result.state, state);
  }
});

test("the checker explores compound allocation identities", () => {
  const result = checkBoundedCollectiveControlModelV1({
    transition: {
      implementationDigest: sha("d"),
      apply(input) {
        const reference = applyBoundedCollectiveControlTransitionV1(input);
        const command = input.command;
        if (
          reference.status === "rejected" &&
          command !== null &&
          typeof command === "object" &&
          !Array.isArray(command) &&
          command.kind === "commit_effect" &&
          command.assignee === 1 &&
          command.role === 1 &&
          input.state.finalizedAssignee === 0 &&
          input.state.finalizedRole === 0
        )
          return {
            status: "accepted",
            reasonCode: "incorrect_compound_bypass",
            state: input.state,
          };
        return reference;
      },
    },
  });

  assert.equal(result.status, "counterexample");
  assert.equal(result.property, "effect_authorization_binding");
  assert.equal(result.reasonCode, "effect_accepted_without_exact_finality");
  assert.equal(result.trace.at(-1).command.assignee, 1);
  assert.equal(result.trace.at(-1).command.role, 1);
});

test("allocation and effect commands with unexpected fields fail closed", () => {
  const state = modelState();
  for (const command of [
    {
      kind: "finalize_allocation",
      membershipEpoch: 0,
      assignmentEpoch: 0,
      fencingToken: 0,
      assignee: 0,
      capability: 0,
      role: 0,
      effectSink: 0,
      unexpected: true,
    },
    { ...effectCommand(), unexpected: true },
  ]) {
    const result = applyBoundedCollectiveControlTransitionV1({
      state,
      command,
      bounds: DEFAULT_BOUNDED_COLLECTIVE_CONTROL_BOUNDS_V1,
    });
    assert.equal(result.status, "rejected");
    assert.equal(result.reasonCode, "malformed_command");
    assert.strictEqual(result.state, state);
  }
});

test("the checker exercises extra-field allocation rejection", () => {
  for (const [kind, digestCharacter] of [
    ["finalize_allocation", "e"],
    ["commit_effect", "f"],
  ]) {
    const result = checkBoundedCollectiveControlModelV1({
      transition: {
        implementationDigest: sha(digestCharacter),
        apply(input) {
          const command = input.command;
          if (
            command !== null &&
            typeof command === "object" &&
            !Array.isArray(command) &&
            command.kind === kind &&
            command.unexpected === true
          )
            return {
              status: "accepted",
              reasonCode: "incorrect_extra_field_bypass",
              state: input.state,
            };
          return applyBoundedCollectiveControlTransitionV1(input);
        },
      },
    });

    assert.equal(result.status, "counterexample");
    assert.equal(result.property, "fail_closed_transitions");
    assert.equal(result.reasonCode, "invalid_transition_accepted");
    assert.equal(result.trace.at(-1).command.kind, kind);
    assert.equal(result.trace.at(-1).command.unexpected, true);
  }
});

test("insufficient effect-authorization witnesses cannot produce proof", () => {
  const result = checkBoundedCollectiveControlModelV1({
    bounds: {
      ...DEFAULT_BOUNDED_COLLECTIVE_CONTROL_BOUNDS_V1,
      maximumMembershipEpoch: 0,
      maximumEpoch: 0,
      maximumFence: 0,
      assigneeCount: 1,
      capabilityCount: 1,
      roleCount: 1,
      effectSinkCount: 1,
      initialParentAuthorityMask: 1,
    },
  });

  assert.equal(result.status, "incomplete");
  assert.equal(result.reasonCode, "insufficient_effect_authorization_coverage");
});

test("reservations and their consumption share one aggregate child ceiling", () => {
  const bounds = DEFAULT_BOUNDED_COLLECTIVE_CONTROL_BOUNDS_V1;
  const initial = modelState({ childBudgetCeiling: 1 });
  const reserved = applyBoundedCollectiveControlTransitionV1({
    state: initial,
    command: { kind: "reserve_budget", amount: 1 },
    bounds,
  });
  assert.equal(reserved.status, "accepted");
  assert.equal(reserved.state.reservedBudgetUnits, 1);

  const overReserved = applyBoundedCollectiveControlTransitionV1({
    state: reserved.state,
    command: { kind: "reserve_budget", amount: 1 },
    bounds,
  });
  assert.equal(overReserved.status, "rejected");
  assert.equal(overReserved.reasonCode, "budget_reservation_unavailable");
  assert.strictEqual(overReserved.state, reserved.state);

  const directEffectBesideReservation =
    applyBoundedCollectiveControlTransitionV1({
      state: reserved.state,
      command: {
        kind: "commit_effect",
        membershipEpoch: 0,
        assignmentEpoch: 0,
        fencingToken: 0,
        assignee: 0,
        capability: 0,
        role: 0,
        effectSink: 0,
        amount: 1,
      },
      bounds,
    });
  assert.equal(directEffectBesideReservation.status, "rejected");
  assert.equal(
    directEffectBesideReservation.reasonCode,
    "effect_budget_unavailable",
  );
  assert.strictEqual(directEffectBesideReservation.state, reserved.state);

  const consumed = applyBoundedCollectiveControlTransitionV1({
    state: reserved.state,
    command: { kind: "consume_reservation", amount: 1 },
    bounds,
  });
  assert.equal(consumed.status, "accepted");
  assert.equal(consumed.state.reservedBudgetUnits, 0);
  assert.equal(consumed.state.childConsumedBudgetUnits, 1);

  const repeated = applyBoundedCollectiveControlTransitionV1({
    state: consumed.state,
    command: { kind: "reserve_budget", amount: 1 },
    bounds,
  });
  assert.equal(repeated.status, "rejected");
  assert.equal(repeated.reasonCode, "budget_reservation_unavailable");
  assert.strictEqual(repeated.state, consumed.state);
});

test("proof receipts bind the deterministic explored state set", () => {
  const first = checkBoundedCollectiveControlModelV1();
  const second = checkBoundedCollectiveControlModelV1();

  assert.equal(first.status, "proved_within_bounds");
  assert.equal(second.status, "proved_within_bounds");
  assert.equal(first.exploredStateSetDigest, second.exploredStateSetDigest);
  assert.equal(first.receiptDigest, second.receiptDigest);
});

test("runtime-malformed commands reject without mutation", () => {
  const bounds = DEFAULT_BOUNDED_COLLECTIVE_CONTROL_BOUNDS_V1;
  const state = modelState();
  for (const command of [
    null,
    "bad",
    [],
    {},
    { kind: "unknown" },
    { kind: "finalize" },
    { kind: "finalize", coordinate: "0", value: 0 },
    { kind: "reserve_budget", amount: 1, extra: true },
  ]) {
    const result = applyBoundedCollectiveControlTransitionV1({
      state,
      command,
      bounds,
    });
    assert.equal(result.status, "rejected");
    assert.strictEqual(result.state, state);
  }
});

test("invalid child authority state is rejected at the model boundary", () => {
  assert.throws(
    () =>
      applyBoundedCollectiveControlTransitionV1({
        state: modelState({
          parentAuthorityMask: 1,
          childAuthorityMask: 3,
          parentBudgetCeiling: 1,
          childBudgetCeiling: 2,
        }),
        command: { kind: "finalize", coordinate: 0, value: 0 },
        bounds: DEFAULT_BOUNDED_COLLECTIVE_CONTROL_BOUNDS_V1,
      }),
    /state balance/u,
  );
});

test("restored parent authority cannot exceed the configured initial mask", () => {
  const bounds = {
    ...DEFAULT_BOUNDED_COLLECTIVE_CONTROL_BOUNDS_V1,
    initialParentAuthorityMask: 0b01,
  };
  assert.throws(
    () =>
      applyBoundedCollectiveControlTransitionV1({
        state: modelState({
          parentAuthorityMask: 0b11,
          childAuthorityMask: 0b11,
        }),
        command: {
          kind: "commit_effect",
          membershipEpoch: 0,
          assignmentEpoch: 0,
          fencingToken: 0,
          assignee: 0,
          capability: 1,
          role: 0,
          effectSink: 0,
          amount: 1,
        },
        bounds,
      }),
    /state balance/u,
  );
});

test("restored effect count must be backed by child-consumed budget", () => {
  assert.throws(
    () =>
      applyBoundedCollectiveControlTransitionV1({
        state: modelState({
          committedEffectCount: 999,
        }),
        command: { kind: "finalize", coordinate: 0, value: 0 },
        bounds: DEFAULT_BOUNDED_COLLECTIVE_CONTROL_BOUNDS_V1,
      }),
    /state balance/u,
  );
});

test("a reject-all implementation cannot produce a proof", () => {
  const result = checkBoundedCollectiveControlModelV1({
    transition: {
      implementationDigest: sha("b"),
      apply({ state }) {
        return { status: "rejected", reasonCode: "reject_all", state };
      },
    },
  });
  assert.equal(result.status, "counterexample");
  assert.equal(result.property, "transition_conformance");
  assert.equal(result.reasonCode, "valid_transition_rejected");
  assert.equal(result.transitionImplementationDigest, sha("b"));
});

test("the checker explores non-object runtime input", () => {
  const result = checkBoundedCollectiveControlModelV1({
    transition: {
      implementationDigest: sha("c"),
      apply(input) {
        if (input.command === null)
          return {
            status: "accepted",
            reasonCode: "incorrectly_accepted",
            state: input.state,
          };
        return applyBoundedCollectiveControlTransitionV1(input);
      },
    },
  });
  assert.equal(result.status, "counterexample");
  assert.equal(result.property, "fail_closed_transitions");
  assert.equal(result.reasonCode, "invalid_transition_accepted");
  assert.equal(result.trace[0].command, null);
});

test("a custom transition must declare its implementation digest", () => {
  assert.throws(
    () =>
      checkBoundedCollectiveControlModelV1({
        transition: {
          apply: applyBoundedCollectiveControlTransitionV1,
        },
      }),
    /implementation digest/u,
  );
});

function sha(character) {
  return `sha256:${character.repeat(64)}`;
}

function modelState(overrides = {}) {
  return {
    schemaVersion: 1,
    membershipEpoch: 0,
    assignmentEpoch: 0,
    fencingToken: 0,
    finalityValues: [null],
    totalBudgetUnits: 2,
    availableBudgetUnits: 2,
    reservedBudgetUnits: 0,
    consumedBudgetUnits: 0,
    parentAuthorityMask: 0b11,
    childAuthorityMask: 0b11,
    parentBudgetCeiling: 2,
    childBudgetCeiling: 2,
    childConsumedBudgetUnits: 0,
    committedEffectCount: 0,
    finalizedMembershipEpoch: 0,
    finalizedAssignmentEpoch: 0,
    finalizedFencingToken: 0,
    finalizedAssignee: 0,
    finalizedCapability: 0,
    finalizedRole: 0,
    finalizedEffectSink: 0,
    ...overrides,
  };
}

function effectCommand(overrides = {}) {
  return {
    kind: "commit_effect",
    membershipEpoch: 0,
    assignmentEpoch: 0,
    fencingToken: 0,
    assignee: 0,
    capability: 0,
    role: 0,
    effectSink: 0,
    amount: 1,
    ...overrides,
  };
}
