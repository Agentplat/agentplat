import assert from "node:assert/strict";
import test from "node:test";

import {
  BOUNDED_COLLECTIVE_PROGRESS_PROPERTIES_V1,
  DEFAULT_BOUNDED_COLLECTIVE_PROGRESS_BOUNDS_V1,
  REFERENCE_BOUNDED_COLLECTIVE_PROGRESS_TRANSITION_DIGEST_V1,
  applyBoundedCollectiveProgressTransitionV1,
  checkBoundedCollectiveProgressModelV1,
} from "../packages/collective-control/dist/bounded-progress-model.js";

test("the reference fair scheduler proves all conditional progress properties", () => {
  const result = checkBoundedCollectiveProgressModelV1();

  assert.equal(result.status, "proved_within_bounds");
  assert.equal(result.maximumFairSchedulerTickReached, 4);
  assert.deepEqual(
    result.properties.map(({ property }) => property),
    BOUNDED_COLLECTIVE_PROGRESS_PROPERTIES_V1,
  );
  assert.equal(
    result.transitionImplementationDigest,
    REFERENCE_BOUNDED_COLLECTIVE_PROGRESS_TRANSITION_DIGEST_V1,
  );
  assert.ok(result.acceptedReferenceTransitions > 0);
  assert.ok(result.rejectedReferenceTransitions > 0);
  assert.match(result.eventCorpusDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.match(result.boundedProgressSpaceDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.match(result.exploredStateSetDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.match(result.receiptDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.match(result.limitation, /does not prove real network delivery/u);
});

test("an insufficient fair-scheduler horizon is incomplete, never proof", () => {
  const result = checkBoundedCollectiveProgressModelV1({
    bounds: {
      ...DEFAULT_BOUNDED_COLLECTIVE_PROGRESS_BOUNDS_V1,
      maximumFairSchedulerTicks: 3,
    },
  });

  assert.equal(result.status, "incomplete");
  assert.equal(result.reasonCode, "maximum_fair_scheduler_ticks_insufficient");
  assert.equal(result.maximumFairSchedulerTickReached, 3);
  assert.match(result.exploredStateSetDigest, /^sha256:[0-9a-f]{64}$/u);
});

test("an operational exploration cap is incomplete", () => {
  const result = checkBoundedCollectiveProgressModelV1({
    bounds: {
      ...DEFAULT_BOUNDED_COLLECTIVE_PROGRESS_BOUNDS_V1,
      maximumExploredStates: 1,
    },
  });

  assert.equal(result.status, "incomplete");
  assert.equal(result.reasonCode, "maximum_explored_states_reached");
});

test("rejecting every scheduler tick cannot produce a vacuous proof", () => {
  const result = checkBoundedCollectiveProgressModelV1({
    transition: {
      implementationDigest: sha("a"),
      apply({ state }) {
        return { status: "rejected", reasonCode: "reject_all", state };
      },
    },
  });

  assert.equal(result.status, "counterexample");
  assert.equal(result.property, "progress_transition_conformance");
  assert.equal(result.reasonCode, "valid_progress_transition_rejected");
});

test("a stalled recovery slot returns a property-specific counterexample", () => {
  const result = checkBoundedCollectiveProgressModelV1({
    transition: {
      implementationDigest: sha("b"),
      apply(input) {
        const reference = applyBoundedCollectiveProgressTransitionV1(input);
        if (
          reference.status === "accepted" &&
          input.state.fairSchedulerCursor === 2
        )
          return {
            status: "accepted",
            reasonCode: "incorrectly_stalled",
            state: input.state,
          };
        return reference;
      },
    },
  });

  assert.equal(result.status, "counterexample");
  assert.equal(result.property, "successor_recovery_progress");
  assert.equal(
    result.reasonCode,
    "successor_recovery_did_not_progress_on_fair_slot",
  );
  assert.match(result.traceDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.match(result.counterexampleDigest, /^sha256:[0-9a-f]{64}$/u);
});

test("every stalled fair slot maps to its explicit progress property", () => {
  for (const [slot, property] of [
    [0, "causal_delivery_progress"],
    [1, "quorum_finality_progress"],
    [2, "successor_recovery_progress"],
    [3, "persistent_signal_adaptation_progress"],
  ]) {
    const result = checkBoundedCollectiveProgressModelV1({
      transition: {
        implementationDigest: sha(String(slot)),
        apply(input) {
          const reference = applyBoundedCollectiveProgressTransitionV1(input);
          if (
            reference.status === "accepted" &&
            input.state.fairSchedulerCursor === slot
          )
            return {
              status: "accepted",
              reasonCode: "incorrectly_stalled",
              state: input.state,
            };
          return reference;
        },
      },
    });
    assert.equal(result.status, "counterexample");
    assert.equal(result.property, property);
  }
});

test("malformed runtime events are explored and must fail closed", () => {
  const result = checkBoundedCollectiveProgressModelV1({
    transition: {
      implementationDigest: sha("c"),
      apply(input) {
        if (input.event === null)
          return {
            status: "accepted",
            reasonCode: "incorrectly_accepted",
            state: input.state,
          };
        return applyBoundedCollectiveProgressTransitionV1(input);
      },
    },
  });

  assert.equal(result.status, "counterexample");
  assert.equal(result.property, "fail_closed_progress_transitions");
  assert.equal(result.reasonCode, "invalid_transition_accepted");
  assert.equal(result.trace[0].event, null);
});

test("progress proof receipts are deterministic", () => {
  const first = checkBoundedCollectiveProgressModelV1();
  const second = checkBoundedCollectiveProgressModelV1();

  assert.equal(first.status, "proved_within_bounds");
  assert.equal(second.status, "proved_within_bounds");
  assert.equal(first.exploredStateSetDigest, second.exploredStateSetDigest);
  assert.equal(first.receiptDigest, second.receiptDigest);
});

function sha(character) {
  return `sha256:${character.repeat(64)}`;
}
