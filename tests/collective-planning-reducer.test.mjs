import assert from "node:assert/strict";
import test from "node:test";

import {
  CollectivePlanningValidationError,
  createMissionIntentV1,
  createMissionObservationV1,
  createPlanFragmentProposalV1,
  createPlanSelectionPolicyV1,
  createPlanningReducerCommandV1,
  createPlanningReducerSnapshotV1,
  createPlanningReducerStateV1,
  digestPlanningJsonV1,
  planningReducerStateDigestV1,
  reducePlanningCommandV1,
  replayPlanningCommandsV1,
  restorePlanningReducerSnapshotV1,
  validatePlanningReducerStateV1,
} from "@agentplat/collective-planning";

const digest = (domain, label) =>
  digestPlanningJsonV1(domain, { label, schemaVersion: 1 });

function policy(overrides = {}) {
  return createPlanSelectionPolicyV1({
    schemaVersion: 1,
    selectionPolicyId: "policy:reducer",
    revision: 1,
    scoringDimensions: [
      {
        schemaVersion: 1,
        dimension: "outcome_coverage",
        weight: 1,
        direction: "maximize",
      },
    ],
    hardConstraintKeys: ["budget", "dependencies"],
    acceptanceScoreThreshold: 1,
    challengeScoreThreshold: 0,
    tieBreakOrder: [
      "score",
      "requested_budget_units",
      "work_deadline",
      "proposed_at_logical_ms",
      "proposal_digest",
    ],
    ...overrides,
  });
}

const defaultLimits = Object.freeze({
  schemaVersion: 1,
  maximumCandidateFragments: 8,
  maximumActiveFragments: 4,
  maximumFragmentsPerPeer: 4,
  maximumRevisionsPerSemanticSlot: 4,
  maximumDependencyDepth: 4,
  maximumDependencyFanout: 2,
  maximumCapabilityTerms: 2,
  maximumOutcomeTerms: 2,
  maximumProposalBytes: 16_384,
  maximumSnapshotBytes: 131_072,
  maximumTraceBytes: 131_072,
  maximumTotalPlanningBudgetUnits: 40,
  maximumFragmentBudgetUnits: 20,
  budgetShardPolicy: "equal_mandate_subjects",
  maximumConcurrentProposals: 4,
  maximumActiveRoles: 4,
  proposalLogicalWindowMs: 20,
  observationLogicalWindowMs: 20,
  replanningLogicalWindowMs: 20,
});

function intent(selectionPolicy = policy(), overrides = {}) {
  return createMissionIntentV1({
    schemaVersion: 1,
    missionIntentId: "intent:reducer",
    revision: 1,
    predecessorDigest: null,
    tenantId: "tenant:reducer",
    policyDomainId: "policy-domain:reducer",
    objective: {
      schemaVersion: 1,
      meshId: "mesh:reducer",
      objectiveId: "objective:reducer",
      objectiveDocumentId: "objective-document:reducer",
      objectiveRevision: 1,
      acceptedPolicyDigest: digest("mission-intent", "objective-policy"),
    },
    mandateDigest: digest("mission-intent", "mandate"),
    outcomeStatements: ["outcome.done"],
    permittedResourceClasses: ["resource.alpha"],
    permittedCapabilityKeys: ["capability.alpha"],
    planningLimits: defaultLimits,
    selectionPolicyDigest: selectionPolicy.policyDigest,
    validFrom: "2026-01-01T00:00:00Z",
    validUntil: "2026-01-02T00:00:00Z",
    ...overrides,
  });
}

function configuredState({
  policyOverrides = {},
  intentOverrides = {},
  subjects,
} = {}) {
  const selectionPolicy = policy(policyOverrides);
  const missionIntent = intent(selectionPolicy, intentOverrides);
  return createPlanningReducerStateV1({
    schemaVersion: 1,
    peerId: "peer:alpha",
    peerInstanceId: "instance:alpha:1",
    missionIntent,
    selectionPolicy,
    admittedSubjects: subjects ?? [
      {
        schemaVersion: 1,
        peerId: "peer:alpha",
        peerInstanceId: "instance:alpha:1",
      },
      {
        schemaVersion: 1,
        peerId: "peer:beta",
        peerInstanceId: "instance:beta:1",
      },
    ],
    logicalTimeMs: 10,
  });
}

function redigestState(state, changes) {
  const next = { ...structuredClone(state), ...changes };
  delete next.stateDigest;
  next.stateDigest = planningReducerStateDigestV1(next);
  return validatePlanningReducerStateV1(next);
}

function initialState(overrides = {}) {
  const selectionPolicy = policy();
  const missionIntent = intent(selectionPolicy);
  return createPlanningReducerStateV1({
    schemaVersion: 1,
    peerId: "peer:alpha",
    peerInstanceId: "instance:alpha:1",
    missionIntent,
    selectionPolicy,
    admittedSubjects: [
      {
        schemaVersion: 1,
        peerId: "peer:alpha",
        peerInstanceId: "instance:alpha:1",
      },
      {
        schemaVersion: 1,
        peerId: "peer:beta",
        peerInstanceId: "instance:beta:1",
      },
    ],
    logicalTimeMs: 10,
    ...overrides,
  });
}

function observation(state, overrides = {}) {
  return createMissionObservationV1({
    schemaVersion: 1,
    observationId: "observation:alpha:1",
    missionIntentId: state.missionIntent.missionIntentId,
    intentRevision: state.missionIntent.revision,
    intentDigest: state.missionIntent.intentDigest,
    observerPeerId: "peer:alpha",
    observerInstanceId: "instance:alpha:1",
    environmentCursor: "cursor:alpha:1",
    logicalTimeMs: 10,
    visibility: "public",
    observationKind: "availability",
    publicValue: { available: true },
    contentReferenceDigest: null,
    ...overrides,
  });
}

function proposal(state, observationRecord, overrides = {}) {
  return createPlanFragmentProposalV1({
    schemaVersion: 1,
    proposalRevision: 1,
    missionIntentId: state.missionIntent.missionIntentId,
    intentRevision: state.missionIntent.revision,
    intentDigest: state.missionIntent.intentDigest,
    proposerPeerId: "peer:alpha",
    proposerInstanceId: "instance:alpha:1",
    semanticSlotKey: "slot.alpha",
    predecessorFragmentDigest: null,
    parentFragmentDigests: [],
    dependencyFragmentDigests: [],
    outcomeStatements: ["outcome.done"],
    roleKey: "role.alpha",
    requiredCapabilityKeys: ["capability.alpha"],
    inputReferenceDigest: digest("plan-fragment", "input"),
    basisObservationDigests: [observationRecord.observationDigest],
    requestedBudgetUnits: 10,
    workDeadline: "2026-01-01T12:00:00Z",
    proposedAtLogicalMs: 10,
    ...overrides,
  });
}

function command(input) {
  return createPlanningReducerCommandV1({
    schemaVersion: 1,
    expectedStateDigest: null,
    ...input,
  });
}

function applied(state, commandInput) {
  const result = reducePlanningCommandV1(state, commandInput);
  assert.equal(result.status, "applied", result.error?.message);
  assert.ok(result.events.length > 0);
  assert.notEqual(result.state, state);
  return result.state;
}

function nonApplied(state, commandInput, status, code) {
  const result = reducePlanningCommandV1(state, commandInput);
  assert.equal(result.status, status);
  if (code) assert.equal(result.error?.code, code);
  assert.equal(result.state, state);
  assert.equal(result.events.length, 0);
  return result;
}

test("reducer freezes the admitted peer-instance shard layout and preserves it on rejection", () => {
  const state = initialState();
  assert.deepEqual(state.planView.budgetShards, [
    {
      schemaVersion: 1,
      peerId: "peer:alpha",
      peerInstanceId: "instance:alpha:1",
      budgetUnits: 20,
    },
    {
      schemaVersion: 1,
      peerId: "peer:beta",
      peerInstanceId: "instance:beta:1",
      budgetUnits: 20,
    },
  ]);
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.planView.budgetShards), true);

  const changedLayout = structuredClone(state);
  changedLayout.planView.budgetShards[0].budgetUnits = 21;
  assert.throws(
    () => validatePlanningReducerStateV1(changedLayout),
    CollectivePlanningValidationError,
  );

  const unadmitted = observation(state, {
    observerPeerId: "peer:rogue",
    observerInstanceId: "instance:rogue:1",
  });
  nonApplied(
    state,
    command({ kind: "observation.record", observation: unadmitted }),
    "rejected",
    "subject_not_admitted",
  );
});

test("observation and proposal idempotency/conflicts, stale input and exact proposer reservations are atomic", () => {
  let state = initialState();
  const observed = observation(state);
  const observationCommand = command({
    kind: "observation.record",
    observation: observed,
  });
  state = applied(state, observationCommand);
  nonApplied(state, observationCommand, "idempotent");
  const observationRetryWithDifferentExpected = command({
    kind: "observation.record",
    observation: observed,
    expectedStateDigest: state.stateDigest,
  });
  assert.equal(
    observationRetryWithDifferentExpected.commandDigest,
    observationCommand.commandDigest,
  );
  nonApplied(state, observationRetryWithDifferentExpected, "idempotent");

  const changedCursor = observation(state, {
    observationId: "observation:alpha:other",
    publicValue: { available: false },
  });
  nonApplied(
    state,
    command({ kind: "observation.record", observation: changedCursor }),
    "conflict",
    "cursor_high_water_conflict",
  );

  const proposed = proposal(state, observed);
  const proposalCommand = command({
    kind: "proposal.record",
    proposal: proposed,
  });
  state = applied(state, proposalCommand);
  assert.deepEqual(state.planView.budgetReservations, [
    {
      schemaVersion: 1,
      reservationId: `planning-reservation:${proposed.proposalDigest.slice(7)}`,
      peerId: "peer:alpha",
      peerInstanceId: "instance:alpha:1",
      proposalDigest: proposed.proposalDigest,
      fragmentDigest: null,
      units: 10,
      status: "reserved",
    },
  ]);
  nonApplied(state, proposalCommand, "idempotent");
  const mutated = proposal(state, observed, { requestedBudgetUnits: 11 });
  nonApplied(
    state,
    command({ kind: "proposal.record", proposal: mutated }),
    "conflict",
    "logical_identity_conflict",
  );

  const stale = command({
    kind: "logical-time.advance",
    logicalTimeMs: 11,
    expectedStateDigest: digest("planning-reducer-state", "not-current"),
  });
  nonApplied(state, stale, "rejected", "stale_state_digest");
  const absentBasis = proposal(state, observed, {
    proposalRevision: 2,
    basisObservationDigests: [digest("mission-observation", "missing")],
  });
  nonApplied(
    state,
    command({ kind: "proposal.record", proposal: absentBasis }),
    "rejected",
    "basis_observation_missing",
  );
});

test("selection uses complete sorted candidates, converges under candidate insertion permutations and has terminal lifecycle safety", () => {
  const setup = (reverse) => {
    let state = initialState();
    const observed = observation(state);
    state = applied(
      state,
      command({ kind: "observation.record", observation: observed }),
    );
    const first = proposal(state, observed, {
      proposalRevision: 1,
      requestedBudgetUnits: 10,
    });
    const second = proposal(state, observed, {
      proposalRevision: 2,
      requestedBudgetUnits: 5,
    });
    for (const item of reverse ? [second, first] : [first, second])
      state = applied(
        state,
        command({ kind: "proposal.record", proposal: item }),
      );
    const candidates = [first.proposalDigest, second.proposalDigest].sort();
    nonApplied(
      state,
      command({
        kind: "slot.evaluate",
        semanticSlotKey: "slot.alpha",
        candidateProposalDigests: [first.proposalDigest],
        decidedAtLogicalMs: 10,
      }),
      "rejected",
      "candidate_set_incomplete",
    );
    state = applied(
      state,
      command({
        kind: "slot.evaluate",
        semanticSlotKey: "slot.alpha",
        candidateProposalDigests: candidates,
        decidedAtLogicalMs: 10,
      }),
    );
    return state;
  };
  const left = setup(false);
  const right = setup(true);
  assert.equal(left.stateDigest, right.stateDigest);
  const head = left.planView.selectedHeads[0];
  assert.equal(
    left.planView.fragments.find(
      (item) => item.fragmentDigest === head.fragmentDigest,
    )?.requestedBudgetUnits,
    5,
  );
  assert.equal(
    left.planView.budgetReservations.filter(
      (item) => item.status === "committed",
    ).length,
    1,
  );
  assert.equal(
    left.planView.budgetReservations.filter(
      (item) => item.status === "released",
    ).length,
    1,
  );

  const active = left.planView.fragments.find(
    (item) => item.fragmentDigest === head.fragmentDigest,
  );
  const cancelledCommand = command({
    kind: "fragment.transition",
    fragmentId: active.fragmentId,
    previousFragmentDigest: active.fragmentDigest,
    status: "cancelled",
    transitionedAtLogicalMs: 10,
  });
  const transitionBase = applied(
    left,
    command({ kind: "logical-time.advance", logicalTimeMs: 12 }),
  );
  const terminal = applied(transitionBase, cancelledCommand);
  assert.equal(
    terminal.planView.budgetReservations.find(
      (item) => item.proposalDigest === active.proposalDigest,
    )?.status,
    "released",
  );
  const transitionRetryAtDifferentTime = command({
    kind: "fragment.transition",
    fragmentId: active.fragmentId,
    previousFragmentDigest: active.fragmentDigest,
    status: "cancelled",
    transitionedAtLogicalMs: 11,
  });
  assert.equal(
    transitionRetryAtDifferentTime.commandDigest,
    cancelledCommand.commandDigest,
  );
  nonApplied(terminal, transitionRetryAtDifferentTime, "idempotent");
  nonApplied(
    terminal,
    command({
      kind: "fragment.transition",
      fragmentId: active.fragmentId,
      previousFragmentDigest: terminal.planView.fragments.at(-1).fragmentDigest,
      status: "failed",
      transitionedAtLogicalMs: 10,
    }),
    "rejected",
    "fragment_transition_invalid",
  );
});

test("logical time, validation failures, restore rollback and exact replay are deterministic", () => {
  let state = initialState();
  const bad = {
    schemaVersion: 1,
    kind: "logical-time.advance",
    commandId: "bad",
    expectedStateDigest: null,
    commandDigest: digest("planning-reducer-command", "bad"),
    unexpected: true,
  };
  nonApplied(state, bad, "rejected", "invalid_command");
  state = applied(
    state,
    command({ kind: "logical-time.advance", logicalTimeMs: 12 }),
  );
  nonApplied(
    state,
    command({ kind: "logical-time.advance", logicalTimeMs: 11 }),
    "idempotent",
  );

  const snapshot = createPlanningReducerSnapshotV1(state);
  assert.equal(
    restorePlanningReducerSnapshotV1(state, snapshot).stateDigest,
    state.stateDigest,
  );
  const older = initialState();
  assert.throws(
    () =>
      restorePlanningReducerSnapshotV1(
        state,
        createPlanningReducerSnapshotV1(older),
      ),
    /snapshot_rollback/u,
  );

  const observed = observation(state, { logicalTimeMs: 12 });
  const commands = [
    command({ kind: "observation.record", observation: observed }),
    command({
      kind: "proposal.record",
      proposal: proposal(state, observed, { proposedAtLogicalMs: 12 }),
    }),
  ];
  const replayed = replayPlanningCommandsV1(state, [
    ...commands,
    commands[0],
    commands[1],
  ]);
  let stepped = state;
  for (const item of commands) stepped = applied(stepped, item);
  assert.equal(replayed.stateDigest, stepped.stateDigest);
});

test("adversarial command shapes, limits, graph readiness and terminal transitions fail closed", () => {
  let state = initialState();
  let getterCalls = 0;
  const hostile = {
    schemaVersion: 1,
    commandId: "planning-command:hostile",
    expectedStateDigest: null,
    commandDigest: digest("planning-reducer-command", "hostile"),
  };
  Object.defineProperty(hostile, "kind", {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error("getter must not run");
    },
  });
  nonApplied(state, hostile, "rejected", "invalid_command");
  assert.equal(getterCalls, 0);
  const symbolic = {
    schemaVersion: 1,
    kind: "logical-time.advance",
    commandId: "planning-command:symbol",
    expectedStateDigest: null,
    logicalTimeMs: 11,
    commandDigest: digest("planning-reducer-command", "symbol"),
    [Symbol("forbidden")]: true,
  };
  nonApplied(state, symbolic, "rejected", "invalid_command");

  const observed = observation(state);
  state = applied(
    state,
    command({ kind: "observation.record", observation: observed }),
  );
  const missingParent = proposal(state, observed, {
    parentFragmentDigests: [digest("plan-fragment", "missing-parent")],
  });
  nonApplied(
    state,
    command({ kind: "proposal.record", proposal: missingParent }),
    "rejected",
    "graph_invalid",
  );
  const unresolved = proposal(state, observed, {
    proposalRevision: 2,
    semanticSlotKey: "slot.unresolved",
    dependencyFragmentDigests: [digest("plan-fragment", "unresolved")],
  });
  state = applied(
    state,
    command({ kind: "proposal.record", proposal: unresolved }),
  );
  state = applied(
    state,
    command({
      kind: "slot.evaluate",
      semanticSlotKey: unresolved.semanticSlotKey,
      candidateProposalDigests: [unresolved.proposalDigest],
      decidedAtLogicalMs: 10,
    }),
  );
  assert.equal(
    state.planView.selectedHeads.some(
      (item) => item.semanticSlotKey === unresolved.semanticSlotKey,
    ),
    false,
  );

  const exhausted = [];
  for (let revision = 1; revision <= 2; revision += 1) {
    const item = proposal(state, observed, {
      proposalRevision: revision,
      semanticSlotKey: `slot.budget.${revision}`,
      requestedBudgetUnits: 10,
    });
    exhausted.push(item);
    state = applied(
      state,
      command({ kind: "proposal.record", proposal: item }),
    );
  }
  const overBudget = proposal(state, observed, {
    proposalRevision: 3,
    semanticSlotKey: "slot.budget.3",
    requestedBudgetUnits: 1,
  });
  nonApplied(
    state,
    command({ kind: "proposal.record", proposal: overBudget }),
    "rejected",
    "budget_exceeded",
  );

  // Releasing one candidate through a no-winner decision returns only that exact reservation.
  state = applied(
    state,
    command({
      kind: "slot.evaluate",
      semanticSlotKey: exhausted[0].semanticSlotKey,
      candidateProposalDigests: [exhausted[0].proposalDigest],
      decidedAtLogicalMs: 10,
    }),
  );
  assert.equal(
    state.planView.budgetReservations.find(
      (item) => item.proposalDigest === exhausted[0].proposalDigest,
    )?.status,
    "committed",
  );

  const fresh = initialState();
  const freshObservation = observation(fresh);
  let active = applied(
    fresh,
    command({ kind: "observation.record", observation: freshObservation }),
  );
  const activeProposal = proposal(active, freshObservation);
  active = applied(
    active,
    command({ kind: "proposal.record", proposal: activeProposal }),
  );
  active = applied(
    active,
    command({
      kind: "slot.evaluate",
      semanticSlotKey: activeProposal.semanticSlotKey,
      candidateProposalDigests: [activeProposal.proposalDigest],
      decidedAtLogicalMs: 10,
    }),
  );
  const fragment = active.planView.fragments.find(
    (item) => item.status === "active",
  );
  const staleReplan = proposal(active, freshObservation, {
    proposalRevision: 2,
    predecessorFragmentDigest: null,
  });
  nonApplied(
    active,
    command({ kind: "proposal.record", proposal: staleReplan }),
    "rejected",
    "graph_invalid",
  );
  for (const status of ["superseded", "cancelled", "failed"]) {
    const result = reducePlanningCommandV1(
      active,
      command({
        kind: "fragment.transition",
        fragmentId: fragment.fragmentId,
        previousFragmentDigest: fragment.fragmentDigest,
        status,
        transitionedAtLogicalMs: 10,
      }),
    );
    assert.equal(result.status, "applied");
    assert.equal(result.state.planView.fragments.at(-1).status, status);
  }
});

test("snapshot rollback protects command/cursor high waters and frozen budget identity", () => {
  let state = initialState();
  const observed = observation(state);
  state = applied(
    state,
    command({ kind: "observation.record", observation: observed }),
  );
  const snapshot = createPlanningReducerSnapshotV1(state);
  const tampered = structuredClone(snapshot);
  tampered.state.commandHighWaters = [];
  tampered.snapshotDigest = digest("planning-reducer-snapshot", "tampered");
  assert.throws(
    () => restorePlanningReducerSnapshotV1(state, tampered),
    CollectivePlanningValidationError,
  );
  const layoutChanged = structuredClone(snapshot);
  layoutChanged.state.planView.budgetShards[0].peerInstanceId =
    "instance:substituted";
  assert.throws(
    () => restorePlanningReducerSnapshotV1(state, layoutChanged),
    CollectivePlanningValidationError,
  );
  const lessState = initialState();
  assert.throws(
    () =>
      restorePlanningReducerSnapshotV1(
        state,
        createPlanningReducerSnapshotV1(lessState),
      ),
    /snapshot_rollback/u,
  );
});

test("selection applies scoring directions, thresholds and final digest tie-break deterministically", () => {
  const cases = [
    {
      dimension: "budget_efficiency",
      intentOverrides: {},
      left: { requestedBudgetUnits: 4 },
      right: { requestedBudgetUnits: 8 },
      maximize: "left",
    },
    {
      dimension: "deadline_margin",
      intentOverrides: {},
      left: { workDeadline: "2026-01-01T06:00:00Z" },
      right: { workDeadline: "2026-01-01T18:00:00Z" },
      maximize: "right",
    },
    {
      dimension: "outcome_coverage",
      intentOverrides: { outcomeStatements: ["outcome.done", "outcome.extra"] },
      left: { outcomeStatements: ["outcome.done"] },
      right: { outcomeStatements: ["outcome.done", "outcome.extra"] },
      maximize: "right",
    },
    {
      dimension: "capability_confidence",
      intentOverrides: {
        permittedCapabilityKeys: ["capability.alpha", "capability.beta"],
      },
      left: { requiredCapabilityKeys: ["capability.alpha"] },
      right: {
        requiredCapabilityKeys: ["capability.alpha", "capability.beta"],
      },
      maximize: "left",
    },
    {
      dimension: "dependency_readiness",
      intentOverrides: {},
      left: { dependencyFragmentDigests: [] },
      right: {
        dependencyFragmentDigests: [digest("plan-fragment", "not-ready")],
      },
      maximize: "left",
    },
    {
      dimension: "bounded_risk",
      intentOverrides: {},
      left: { dependencyFragmentDigests: [] },
      right: {
        dependencyFragmentDigests: [digest("plan-fragment", "bounded-risk")],
      },
      maximize: "right",
    },
  ];
  for (const fixture of cases)
    for (const direction of ["maximize", "minimize"]) {
      let state = configuredState({
        policyOverrides: {
          scoringDimensions: [
            {
              schemaVersion: 1,
              dimension: fixture.dimension,
              weight: 1,
              direction,
            },
          ],
          hardConstraintKeys: ["budget"],
        },
        intentOverrides: fixture.intentOverrides,
      });
      const observed = observation(state);
      state = applied(
        state,
        command({ kind: "observation.record", observation: observed }),
      );
      const left = proposal(state, observed, {
        proposalRevision: 1,
        requestedBudgetUnits: 4,
        ...fixture.left,
      });
      const right = proposal(state, observed, {
        proposalRevision: 2,
        requestedBudgetUnits: 4,
        ...fixture.right,
      });
      for (const item of [right, left])
        state = applied(
          state,
          command({ kind: "proposal.record", proposal: item }),
        );
      state = applied(
        state,
        command({
          kind: "slot.evaluate",
          semanticSlotKey: "slot.alpha",
          candidateProposalDigests: [
            left.proposalDigest,
            right.proposalDigest,
          ].sort(),
          decidedAtLogicalMs: 10,
        }),
      );
      const expected =
        (direction === "maximize"
          ? fixture.maximize
          : fixture.maximize === "left"
            ? "right"
            : "left") === "left"
          ? left
          : right;
      assert.equal(
        state.planView.fragments.find((item) => item.status === "active")
          ?.proposalDigest,
        expected.proposalDigest,
        `${fixture.dimension}:${direction}`,
      );
    }

  let tied = configuredState({
    policyOverrides: { hardConstraintKeys: ["budget"] },
  });
  const observed = observation(tied);
  tied = applied(
    tied,
    command({ kind: "observation.record", observation: observed }),
  );
  const peers = [
    proposal(tied, observed, { proposalRevision: 1 }),
    proposal(tied, observed, { proposalRevision: 2 }),
  ];
  for (const item of peers)
    tied = applied(tied, command({ kind: "proposal.record", proposal: item }));
  tied = applied(
    tied,
    command({
      kind: "slot.evaluate",
      semanticSlotKey: "slot.alpha",
      candidateProposalDigests: peers.map((item) => item.proposalDigest).sort(),
      decidedAtLogicalMs: 10,
    }),
  );
  assert.equal(
    tied.planView.fragments.find((item) => item.status === "active")
      ?.proposalDigest,
    peers.map((item) => item.proposalDigest).sort()[0],
  );

  let threshold = configuredState({
    policyOverrides: {
      acceptanceScoreThreshold: 500_001,
      challengeScoreThreshold: 500_000,
      hardConstraintKeys: ["budget"],
    },
    intentOverrides: { outcomeStatements: ["outcome.done", "outcome.extra"] },
  });
  const thresholdObservation = observation(threshold);
  threshold = applied(
    threshold,
    command({ kind: "observation.record", observation: thresholdObservation }),
  );
  const halfCoverage = proposal(threshold, thresholdObservation);
  threshold = applied(
    threshold,
    command({ kind: "proposal.record", proposal: halfCoverage }),
  );
  threshold = applied(
    threshold,
    command({
      kind: "slot.evaluate",
      semanticSlotKey: "slot.alpha",
      candidateProposalDigests: [halfCoverage.proposalDigest],
      decidedAtLogicalMs: 10,
    }),
  );
  assert.equal(threshold.planView.selectedHeads.length, 0);
  assert.equal(threshold.planView.decisions[0].status, "challenged");
});

test("reachable rejection codes and exact limit plus one boundaries are atomic", () => {
  let state = initialState();
  const wrongScope = observation(state, {
    missionIntentId: "intent:other",
    intentDigest: digest("mission-intent", "other"),
  });
  nonApplied(
    state,
    command({ kind: "observation.record", observation: wrongScope }),
    "rejected",
    "scope_mismatch",
  );
  state = applied(
    state,
    command({ kind: "logical-time.advance", logicalTimeMs: 31 }),
  );
  nonApplied(
    state,
    command({ kind: "observation.record", observation: observation(state) }),
    "rejected",
    "logical_window_exceeded",
  );

  for (const [limitName, limitValue, firstOverrides, secondOverrides] of [
    ["maximumCandidateFragments", 1, {}, { semanticSlotKey: "slot.second" }],
    ["maximumFragmentsPerPeer", 1, {}, { semanticSlotKey: "slot.second" }],
    ["maximumConcurrentProposals", 1, {}, { semanticSlotKey: "slot.second" }],
    ["maximumRevisionsPerSemanticSlot", 1, {}, { proposalRevision: 2 }],
  ]) {
    const planningLimits = { ...defaultLimits, [limitName]: limitValue };
    if (limitName === "maximumCandidateFragments") {
      planningLimits.maximumActiveFragments = 1;
      planningLimits.maximumActiveRoles = 1;
      planningLimits.maximumFragmentsPerPeer = 1;
      planningLimits.maximumConcurrentProposals = 1;
    }
    let bounded = configuredState({
      intentOverrides: {
        planningLimits,
      },
    });
    const observed = observation(bounded);
    bounded = applied(
      bounded,
      command({ kind: "observation.record", observation: observed }),
    );
    bounded = applied(
      bounded,
      command({
        kind: "proposal.record",
        proposal: proposal(bounded, observed, firstOverrides),
      }),
    );
    nonApplied(
      bounded,
      command({
        kind: "proposal.record",
        proposal: proposal(bounded, observed, {
          proposalRevision: 2,
          ...secondOverrides,
        }),
      }),
      "rejected",
      "planning_limit_exceeded",
    );
  }

  let revisionBound = configuredState({
    intentOverrides: {
      planningLimits: { ...defaultLimits, maximumRevisionsPerSemanticSlot: 1 },
    },
  });
  const revisionObservation = observation(revisionBound);
  revisionBound = applied(
    revisionBound,
    command({ kind: "observation.record", observation: revisionObservation }),
  );
  const revisionProposal = proposal(revisionBound, revisionObservation);
  revisionBound = applied(
    revisionBound,
    command({ kind: "proposal.record", proposal: revisionProposal }),
  );
  nonApplied(
    revisionBound,
    command({
      kind: "slot.evaluate",
      semanticSlotKey: revisionProposal.semanticSlotKey,
      candidateProposalDigests: [revisionProposal.proposalDigest],
      decidedAtLogicalMs: 10,
    }),
    "rejected",
    "planning_limit_exceeded",
  );

  let unsupported = configuredState({
    policyOverrides: { hardConstraintKeys: ["future_constraint"] },
  });
  const unsupportedObservation = observation(unsupported);
  unsupported = applied(
    unsupported,
    command({
      kind: "observation.record",
      observation: unsupportedObservation,
    }),
  );
  const unsupportedProposal = proposal(unsupported, unsupportedObservation);
  unsupported = applied(
    unsupported,
    command({ kind: "proposal.record", proposal: unsupportedProposal }),
  );
  nonApplied(
    unsupported,
    command({
      kind: "slot.evaluate",
      semanticSlotKey: unsupportedProposal.semanticSlotKey,
      candidateProposalDigests: [unsupportedProposal.proposalDigest],
      decidedAtLogicalMs: 10,
    }),
    "rejected",
    "increment_not_supported",
  );
});

test("graph depth, fanout and active-cardinality exact boundaries reject before mutation", () => {
  const activate = (state, item) => {
    state = applied(
      state,
      command({ kind: "proposal.record", proposal: item }),
    );
    return applied(
      state,
      command({
        kind: "slot.evaluate",
        semanticSlotKey: item.semanticSlotKey,
        candidateProposalDigests: [item.proposalDigest],
        decidedAtLogicalMs: 10,
      }),
    );
  };

  let depthState = configuredState({
    intentOverrides: {
      planningLimits: { ...defaultLimits, maximumDependencyDepth: 2 },
    },
  });
  const depthObservation = observation(depthState);
  depthState = applied(
    depthState,
    command({ kind: "observation.record", observation: depthObservation }),
  );
  const first = proposal(depthState, depthObservation, {
    requestedBudgetUnits: 4,
  });
  depthState = activate(depthState, first);
  const second = proposal(depthState, depthObservation, {
    proposalRevision: 2,
    predecessorFragmentDigest:
      depthState.planView.selectedHeads[0].fragmentDigest,
    requestedBudgetUnits: 4,
  });
  depthState = activate(depthState, second);
  const third = proposal(depthState, depthObservation, {
    proposalRevision: 3,
    predecessorFragmentDigest:
      depthState.planView.selectedHeads[0].fragmentDigest,
    requestedBudgetUnits: 4,
  });
  depthState = applied(
    depthState,
    command({ kind: "proposal.record", proposal: third }),
  );
  nonApplied(
    depthState,
    command({
      kind: "slot.evaluate",
      semanticSlotKey: third.semanticSlotKey,
      candidateProposalDigests: [third.proposalDigest],
      decidedAtLogicalMs: 10,
    }),
    "rejected",
    "planning_limit_exceeded",
  );

  let fanoutState = configuredState({
    intentOverrides: {
      planningLimits: { ...defaultLimits, maximumDependencyFanout: 1 },
    },
  });
  const fanoutObservation = observation(fanoutState);
  fanoutState = applied(
    fanoutState,
    command({ kind: "observation.record", observation: fanoutObservation }),
  );
  const parentA = proposal(fanoutState, fanoutObservation, {
    semanticSlotKey: "slot.parent.a",
    requestedBudgetUnits: 2,
  });
  fanoutState = activate(fanoutState, parentA);
  const parentB = proposal(fanoutState, fanoutObservation, {
    proposalRevision: 2,
    semanticSlotKey: "slot.parent.b",
    requestedBudgetUnits: 2,
  });
  fanoutState = activate(fanoutState, parentB);
  const parentDigests = fanoutState.planView.selectedHeads
    .map((item) => item.fragmentDigest)
    .sort();
  const oneParent = proposal(fanoutState, fanoutObservation, {
    proposalRevision: 3,
    semanticSlotKey: "slot.child.one",
    parentFragmentDigests: [parentDigests[0]],
    requestedBudgetUnits: 2,
  });
  fanoutState = applied(
    fanoutState,
    command({ kind: "proposal.record", proposal: oneParent }),
  );
  const twoParents = proposal(fanoutState, fanoutObservation, {
    proposalRevision: 4,
    semanticSlotKey: "slot.child.two",
    parentFragmentDigests: parentDigests,
    requestedBudgetUnits: 2,
  });
  nonApplied(
    fanoutState,
    command({ kind: "proposal.record", proposal: twoParents }),
    "rejected",
    "planning_limit_exceeded",
  );

  let cardinality = configuredState({
    intentOverrides: {
      planningLimits: {
        ...defaultLimits,
        maximumActiveFragments: 1,
        maximumActiveRoles: 1,
      },
    },
  });
  const cardinalityObservation = observation(cardinality);
  cardinality = applied(
    cardinality,
    command({
      kind: "observation.record",
      observation: cardinalityObservation,
    }),
  );
  const activeA = proposal(cardinality, cardinalityObservation, {
    semanticSlotKey: "slot.active.a",
  });
  cardinality = activate(cardinality, activeA);
  const activeB = proposal(cardinality, cardinalityObservation, {
    proposalRevision: 2,
    semanticSlotKey: "slot.active.b",
  });
  cardinality = applied(
    cardinality,
    command({ kind: "proposal.record", proposal: activeB }),
  );
  nonApplied(
    cardinality,
    command({
      kind: "slot.evaluate",
      semanticSlotKey: activeB.semanticSlotKey,
      candidateProposalDigests: [activeB.proposalDigest],
      decidedAtLogicalMs: 10,
    }),
    "rejected",
    "planning_limit_exceeded",
  );
});

test("every budget prefix conserves immutable peer-instance shards across decisions and terminals", () => {
  const assertPrefix = (state) => {
    for (const shard of state.planView.budgetShards) {
      const charged = state.planView.budgetReservations
        .filter(
          (item) =>
            item.peerId === shard.peerId &&
            item.peerInstanceId === shard.peerInstanceId &&
            item.status !== "released",
        )
        .reduce((sum, item) => sum + item.units, 0);
      assert.ok(charged <= shard.budgetUnits);
    }
  };
  let state = initialState();
  const observed = observation(state);
  state = applied(
    state,
    command({ kind: "observation.record", observation: observed }),
  );
  assertPrefix(state);
  const first = proposal(state, observed);
  state = applied(state, command({ kind: "proposal.record", proposal: first }));
  assertPrefix(state);
  state = applied(
    state,
    command({
      kind: "slot.evaluate",
      semanticSlotKey: first.semanticSlotKey,
      candidateProposalDigests: [first.proposalDigest],
      decidedAtLogicalMs: 10,
    }),
  );
  assertPrefix(state);
  const firstHead = state.planView.selectedHeads[0];
  const replacement = proposal(state, observed, {
    proposalRevision: 2,
    predecessorFragmentDigest: firstHead.fragmentDigest,
  });
  state = applied(
    state,
    command({ kind: "proposal.record", proposal: replacement }),
  );
  assertPrefix(state);
  state = applied(
    state,
    command({
      kind: "slot.evaluate",
      semanticSlotKey: replacement.semanticSlotKey,
      candidateProposalDigests: [replacement.proposalDigest],
      decidedAtLogicalMs: 10,
    }),
  );
  assertPrefix(state);
  assert.equal(
    state.planView.budgetReservations.find(
      (item) => item.proposalDigest === first.proposalDigest,
    )?.status,
    "released",
  );
  const activeHead = state.planView.fragments.find(
    (item) =>
      item.fragmentDigest === state.planView.selectedHeads[0].fragmentDigest,
  );
  state = applied(
    state,
    command({
      kind: "fragment.transition",
      fragmentId: activeHead.fragmentId,
      previousFragmentDigest: activeHead.fragmentDigest,
      status: "failed",
      transitionedAtLogicalMs: 10,
    }),
  );
  assertPrefix(state);
  assert.equal(
    state.planView.budgetReservations.find(
      (item) => item.proposalDigest === replacement.proposalDigest,
    )?.status,
    "committed",
  );

  const impersonated = proposal(state, observed, {
    proposalRevision: 3,
    semanticSlotKey: "slot.impersonated",
    proposerPeerId: "peer:beta",
    proposerInstanceId: "instance:beta:forged",
  });
  nonApplied(
    state,
    command({ kind: "proposal.record", proposal: impersonated }),
    "rejected",
    "subject_not_admitted",
  );
  assertPrefix(state);

  let noWinner = configuredState({
    policyOverrides: {
      acceptanceScoreThreshold: 1_000_000,
      challengeScoreThreshold: 1_000_000,
      hardConstraintKeys: ["dependencies"],
    },
  });
  const noWinnerObservation = observation(noWinner);
  noWinner = applied(
    noWinner,
    command({ kind: "observation.record", observation: noWinnerObservation }),
  );
  const blocked = proposal(noWinner, noWinnerObservation, {
    dependencyFragmentDigests: [digest("plan-fragment", "absent")],
  });
  noWinner = applied(
    noWinner,
    command({ kind: "proposal.record", proposal: blocked }),
  );
  assertPrefix(noWinner);
  noWinner = applied(
    noWinner,
    command({
      kind: "slot.evaluate",
      semanticSlotKey: blocked.semanticSlotKey,
      candidateProposalDigests: [blocked.proposalDigest],
      decidedAtLogicalMs: 10,
    }),
  );
  assertPrefix(noWinner);
  assert.equal(noWinner.planView.budgetReservations[0].status, "released");
});

test("valid redigested snapshots reach layout, history, cursor and command rollback checks", () => {
  const currentInitial = initialState();
  const oneSubject = configuredState({
    subjects: [
      {
        schemaVersion: 1,
        peerId: "peer:alpha",
        peerInstanceId: "instance:alpha:1",
      },
    ],
  });
  assert.throws(
    () =>
      restorePlanningReducerSnapshotV1(
        currentInitial,
        createPlanningReducerSnapshotV1(oneSubject),
      ),
    /snapshot_layout_changed/u,
  );

  const observed = observation(currentInitial);
  const current = applied(
    currentInitial,
    command({ kind: "observation.record", observation: observed }),
  );
  const alternate = applied(
    currentInitial,
    command({ kind: "logical-time.advance", logicalTimeMs: 11 }),
  );
  assert.throws(
    () =>
      restorePlanningReducerSnapshotV1(
        current,
        createPlanningReducerSnapshotV1(alternate),
      ),
    /snapshot_rollback/u,
  );

  assert.throws(
    () => redigestState(current, { observationCursorHighWaters: [] }),
    /cursor high-waters must exactly cover observation history/u,
  );
  assert.throws(
    () => redigestState(current, { commandHighWaters: [] }),
    /command high-waters must exactly cover applied reducer revisions/u,
  );
  assert.throws(
    () =>
      redigestState(current, {
        commandHighWaters: alternate.commandHighWaters,
      }),
    /command high-waters do not cover observation history|retained command kinds/u,
  );
  const changedDigest = structuredClone(current.commandHighWaters);
  changedDigest[0].commandDigest = digest(
    "planning-reducer-command",
    "changed-high-water",
  );
  assert.throws(
    () => redigestState(current, { commandHighWaters: changedDigest }),
    /command high-water differs from its (?:canonical )?retained command/u,
  );
  const changedCommand = structuredClone(current.commandHighWaters);
  changedCommand[0].command.observation.publicValue.available = false;
  assert.throws(
    () => redigestState(current, { commandHighWaters: changedCommand }),
    /observationDigest mismatch/u,
  );
});

test("complete command replay, duplicate replay and event digests remain exact", () => {
  const initial = initialState();
  const observed = observation(initial);
  const observationCommand = command({
    kind: "observation.record",
    observation: observed,
  });
  const proposed = proposal(initial, observed);
  const proposalCommand = command({
    kind: "proposal.record",
    proposal: proposed,
  });
  const evaluateCommand = command({
    kind: "slot.evaluate",
    semanticSlotKey: proposed.semanticSlotKey,
    candidateProposalDigests: [proposed.proposalDigest],
    decidedAtLogicalMs: 10,
  });
  let active = replayPlanningCommandsV1(initial, [
    observationCommand,
    proposalCommand,
    evaluateCommand,
  ]);
  const fragment = active.planView.fragments.find(
    (item) => item.status === "active",
  );
  const transitionCommand = command({
    kind: "fragment.transition",
    fragmentId: fragment.fragmentId,
    previousFragmentDigest: fragment.fragmentDigest,
    status: "cancelled",
    transitionedAtLogicalMs: 10,
  });
  const timeCommand = command({
    kind: "logical-time.advance",
    logicalTimeMs: 12,
  });
  const stream = [
    observationCommand,
    proposalCommand,
    evaluateCommand,
    transitionCommand,
    timeCommand,
    observationCommand,
    proposalCommand,
    evaluateCommand,
    transitionCommand,
    timeCommand,
  ];
  const replayed = replayPlanningCommandsV1(initial, stream);
  let stepped = initial;
  const eventDigests = [];
  for (const item of stream) {
    const result = reducePlanningCommandV1(stepped, item);
    assert.ok(result.status === "applied" || result.status === "idempotent");
    eventDigests.push(...result.events.map((event) => event.eventDigest));
    stepped = result.state;
  }
  assert.equal(replayed.stateDigest, stepped.stateDigest);
  assert.equal(
    restorePlanningReducerSnapshotV1(
      replayed,
      createPlanningReducerSnapshotV1(replayed),
    ).stateDigest,
    replayed.stateDigest,
  );
  assert.equal(eventDigests.length, 6);
  assert.equal(
    replayed.stateDigest,
    "sha256:0fb25f9451cf4d8154158a9d2adf8b5bad66318d90357c620ef90e6e509a4cc0",
  );
});

test("semantic commands converge across expected-digest and transition-time preconditions", () => {
  let nullBranch = initialState();
  let digestBranch = initialState();
  const observed = observation(nullBranch);

  nullBranch = applied(
    nullBranch,
    command({
      kind: "observation.record",
      observation: observed,
      expectedStateDigest: null,
    }),
  );
  digestBranch = applied(
    digestBranch,
    command({
      kind: "observation.record",
      observation: observed,
      expectedStateDigest: digestBranch.stateDigest,
    }),
  );
  assert.equal(nullBranch.stateDigest, digestBranch.stateDigest);

  const proposed = proposal(nullBranch, observed);
  nullBranch = applied(
    nullBranch,
    command({
      kind: "proposal.record",
      proposal: proposed,
      expectedStateDigest: null,
    }),
  );
  digestBranch = applied(
    digestBranch,
    command({
      kind: "proposal.record",
      proposal: proposed,
      expectedStateDigest: digestBranch.stateDigest,
    }),
  );
  assert.equal(nullBranch.stateDigest, digestBranch.stateDigest);

  nullBranch = applied(
    nullBranch,
    command({
      kind: "slot.evaluate",
      semanticSlotKey: proposed.semanticSlotKey,
      candidateProposalDigests: [proposed.proposalDigest],
      decidedAtLogicalMs: 10,
      expectedStateDigest: null,
    }),
  );
  digestBranch = applied(
    digestBranch,
    command({
      kind: "slot.evaluate",
      semanticSlotKey: proposed.semanticSlotKey,
      candidateProposalDigests: [proposed.proposalDigest],
      decidedAtLogicalMs: 10,
      expectedStateDigest: digestBranch.stateDigest,
    }),
  );
  assert.equal(nullBranch.stateDigest, digestBranch.stateDigest);

  const head = nullBranch.planView.fragments.find(
    (item) => item.status === "active",
  );
  const advance = command({
    kind: "logical-time.advance",
    logicalTimeMs: 12,
  });
  nullBranch = applied(nullBranch, advance);
  digestBranch = applied(digestBranch, advance);
  nullBranch = applied(
    nullBranch,
    command({
      kind: "fragment.transition",
      fragmentId: head.fragmentId,
      previousFragmentDigest: head.fragmentDigest,
      status: "cancelled",
      transitionedAtLogicalMs: 10,
    }),
  );
  digestBranch = applied(
    digestBranch,
    command({
      kind: "fragment.transition",
      fragmentId: head.fragmentId,
      previousFragmentDigest: head.fragmentDigest,
      status: "cancelled",
      transitionedAtLogicalMs: 11,
    }),
  );
  assert.equal(nullBranch.stateDigest, digestBranch.stateDigest);
});

test("nested command payload accessors and array accessors reject without invocation", () => {
  const state = initialState();
  const observed = observation(state);
  const valid = command({ kind: "observation.record", observation: observed });
  const hostile = structuredClone(valid);
  let getterCalls = 0;
  delete hostile.observation.publicValue.available;
  Object.defineProperty(hostile.observation.publicValue, "available", {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error("nested getter must not execute");
    },
  });
  nonApplied(state, hostile, "rejected", "invalid_command");
  assert.equal(getterCalls, 0);

  const candidates = [digest("plan-fragment-proposal", "candidate")];
  const evaluation = command({
    kind: "slot.evaluate",
    semanticSlotKey: "slot.alpha",
    candidateProposalDigests: candidates,
    decidedAtLogicalMs: 10,
  });
  const hostileArray = structuredClone(evaluation);
  let arrayGetterCalls = 0;
  delete hostileArray.candidateProposalDigests[0];
  Object.defineProperty(hostileArray.candidateProposalDigests, "0", {
    enumerable: true,
    get() {
      arrayGetterCalls += 1;
      throw new Error("array getter must not execute");
    },
  });
  nonApplied(state, hostileArray, "rejected", "invalid_command");
  assert.equal(arrayGetterCalls, 0);
});

test("command factories detach validated nested records before identity derivation", () => {
  const state = initialState();
  const observationInput = structuredClone(observation(state));
  const observationCommand = createPlanningReducerCommandV1({
    schemaVersion: 1,
    kind: "observation.record",
    expectedStateDigest: null,
    observation: observationInput,
  });
  observationInput.publicValue.available = false;
  assert.equal(observationCommand.observation.publicValue.available, true);
  const observedState = applied(state, observationCommand);

  const proposalInput = structuredClone(
    proposal(observedState, observationCommand.observation),
  );
  const proposalCommand = createPlanningReducerCommandV1({
    schemaVersion: 1,
    kind: "proposal.record",
    expectedStateDigest: null,
    proposal: proposalInput,
  });
  proposalInput.requestedBudgetUnits = 19;
  assert.equal(proposalCommand.proposal.requestedBudgetUnits, 10);
  assert.equal(
    reducePlanningCommandV1(observedState, proposalCommand).status,
    "applied",
  );

  const callerCandidates = [
    digest("plan-fragment-proposal", "caller-candidate:a"),
    digest("plan-fragment-proposal", "caller-candidate:b"),
  ].sort();
  const originalCandidates = [...callerCandidates];
  const evaluateCommand = createPlanningReducerCommandV1({
    schemaVersion: 1,
    kind: "slot.evaluate",
    expectedStateDigest: null,
    semanticSlotKey: "slot.caller-owned",
    candidateProposalDigests: callerCandidates,
    decidedAtLogicalMs: 10,
  });
  assert.equal(Object.isFrozen(callerCandidates), false);
  assert.deepEqual(callerCandidates, originalCandidates);
  callerCandidates.push(digest("plan-fragment-proposal", "caller-candidate:c"));
  assert.deepEqual(
    evaluateCommand.candidateProposalDigests,
    originalCandidates,
  );
});

test("no-winner replans preserve heads and lifecycle time/revision bounds are atomic", () => {
  let state = configuredState({
    policyOverrides: {
      acceptanceScoreThreshold: 1_000_000,
      challengeScoreThreshold: 1_000_000,
      hardConstraintKeys: ["dependencies"],
    },
  });
  const observed = observation(state);
  state = applied(
    state,
    command({ kind: "observation.record", observation: observed }),
  );
  const initial = proposal(state, observed);
  state = applied(
    state,
    command({ kind: "proposal.record", proposal: initial }),
  );
  state = applied(
    state,
    command({
      kind: "slot.evaluate",
      semanticSlotKey: initial.semanticSlotKey,
      candidateProposalDigests: [initial.proposalDigest],
      decidedAtLogicalMs: 10,
    }),
  );
  const originalHead = state.planView.selectedHeads[0];
  const blocked = proposal(state, observed, {
    proposalRevision: 2,
    predecessorFragmentDigest: originalHead.fragmentDigest,
    dependencyFragmentDigests: [digest("plan-fragment", "not-completed")],
  });
  state = applied(
    state,
    command({ kind: "proposal.record", proposal: blocked }),
  );
  state = applied(
    state,
    command({
      kind: "slot.evaluate",
      semanticSlotKey: blocked.semanticSlotKey,
      candidateProposalDigests: [blocked.proposalDigest],
      decidedAtLogicalMs: 10,
    }),
  );
  assert.deepEqual(state.planView.selectedHeads, [originalHead]);

  const active = state.planView.fragments.find(
    (item) => item.fragmentDigest === originalHead.fragmentDigest,
  );
  nonApplied(
    state,
    command({
      kind: "fragment.transition",
      fragmentId: active.fragmentId,
      previousFragmentDigest: active.fragmentDigest,
      status: "cancelled",
      transitionedAtLogicalMs: 9,
    }),
    "rejected",
    "fragment_transition_invalid",
  );
  state = applied(
    state,
    command({ kind: "logical-time.advance", logicalTimeMs: 31 }),
  );
  nonApplied(
    state,
    command({
      kind: "fragment.transition",
      fragmentId: active.fragmentId,
      previousFragmentDigest: active.fragmentDigest,
      status: "cancelled",
      transitionedAtLogicalMs: 10,
    }),
    "rejected",
    "logical_window_exceeded",
  );

  let bounded = configuredState({
    intentOverrides: {
      planningLimits: {
        ...defaultLimits,
        maximumRevisionsPerSemanticSlot: 2,
      },
    },
  });
  const boundedObservation = observation(bounded);
  bounded = applied(
    bounded,
    command({ kind: "observation.record", observation: boundedObservation }),
  );
  const boundedProposal = proposal(bounded, boundedObservation);
  bounded = applied(
    bounded,
    command({ kind: "proposal.record", proposal: boundedProposal }),
  );
  bounded = applied(
    bounded,
    command({
      kind: "slot.evaluate",
      semanticSlotKey: boundedProposal.semanticSlotKey,
      candidateProposalDigests: [boundedProposal.proposalDigest],
      decidedAtLogicalMs: 10,
    }),
  );
  const boundedHead = bounded.planView.fragments.find(
    (item) => item.status === "active",
  );
  nonApplied(
    bounded,
    command({
      kind: "fragment.transition",
      fragmentId: boundedHead.fragmentId,
      previousFragmentDigest: boundedHead.fragmentDigest,
      status: "cancelled",
      transitionedAtLogicalMs: 10,
    }),
    "rejected",
    "planning_limit_exceeded",
  );
});

test("deadline tie-break compares instants before textual encodings", () => {
  let state = configuredState({
    policyOverrides: { hardConstraintKeys: ["budget"] },
  });
  const observed = observation(state);
  state = applied(
    state,
    command({ kind: "observation.record", observation: observed }),
  );
  const earlier = proposal(state, observed, {
    proposalRevision: 1,
    workDeadline: "2026-01-01T10:00:00Z",
  });
  const later = proposal(state, observed, {
    proposalRevision: 2,
    workDeadline: "2026-01-01T09:30:00-01:00",
  });
  for (const item of [later, earlier])
    state = applied(
      state,
      command({ kind: "proposal.record", proposal: item }),
    );
  state = applied(
    state,
    command({
      kind: "slot.evaluate",
      semanticSlotKey: earlier.semanticSlotKey,
      candidateProposalDigests: [
        earlier.proposalDigest,
        later.proposalDigest,
      ].sort(),
      decidedAtLogicalMs: 10,
    }),
  );
  assert.equal(
    state.planView.fragments.find((item) => item.status === "active")
      ?.proposalDigest,
    earlier.proposalDigest,
  );
});
