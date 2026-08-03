import assert from "node:assert/strict";
import test from "node:test";
import {
  createMissionIntentV1,
  createPlanSelectionPolicyV1,
  createPlanningReducerSnapshotV1,
  createPlanningReducerStateV1,
  digestPlanningJsonV1,
} from "@agentplat/collective-planning";
import {
  InMemoryPlanningRecoveryDurableRepositoryV1,
  PostgresPlanningRecoveryDurableRepositoryV1,
  createPlanningRecoveryDurableStateV1,
  createPlanningRecoveryStateV1,
  createPostgresPool,
  PLANNING_RECOVERY_DURABILITY_GENESIS_DIGEST,
  runMigrations,
  verifyPlanningRecoveryDurableJournalV1,
} from "../dist/index.js";

const digest = (label) =>
  digestPlanningJsonV1("mission-intent", { label, schemaVersion: 1 });

function fixture() {
  const policy = createPlanSelectionPolicyV1({
    schemaVersion: 1,
    selectionPolicyId: "policy:planning-recovery",
    revision: 1,
    scoringDimensions: [
      {
        schemaVersion: 1,
        dimension: "outcome_coverage",
        weight: 1,
        direction: "maximize",
      },
    ],
    hardConstraintKeys: ["budget"],
    acceptanceScoreThreshold: 1,
    challengeScoreThreshold: 0,
    tieBreakOrder: [
      "score",
      "requested_budget_units",
      "work_deadline",
      "proposed_at_logical_ms",
      "proposal_digest",
    ],
  });
  const limits = {
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
  };
  const intent = createMissionIntentV1({
    schemaVersion: 1,
    missionIntentId: "intent:planning-recovery",
    revision: 1,
    predecessorDigest: null,
    tenantId: "tenant:planning-recovery",
    policyDomainId: "policy-domain:planning-recovery",
    objective: {
      schemaVersion: 1,
      meshId: "mesh:planning-recovery",
      objectiveId: "objective:planning-recovery",
      objectiveDocumentId: "doc:planning-recovery",
      objectiveRevision: 1,
      acceptedPolicyDigest: digest("objective"),
    },
    mandateDigest: digest("mandate"),
    outcomeStatements: ["done"],
    permittedResourceClasses: ["resource"],
    permittedCapabilityKeys: ["capability"],
    planningLimits: limits,
    selectionPolicyDigest: policy.policyDigest,
    validFrom: "2026-01-01T00:00:00Z",
    validUntil: "2026-01-02T00:00:00Z",
  });
  const state = createPlanningReducerStateV1({
    schemaVersion: 1,
    peerId: "peer:planning-recovery",
    peerInstanceId: "instance:planning-recovery",
    missionIntent: intent,
    selectionPolicy: policy,
    admittedSubjects: [
      {
        schemaVersion: 1,
        peerId: "peer:planning-recovery",
        peerInstanceId: "instance:planning-recovery",
      },
    ],
    logicalTimeMs: 5,
  });
  const planningSnapshot = createPlanningReducerSnapshotV1(state);
  const scope = {
    tenantId: state.tenantId,
    policyDomainId: state.policyDomainId,
    missionId: intent.missionIntentId,
    intentRevision: intent.revision,
    intentDigest: intent.intentDigest,
    policyDigest: policy.policyDigest,
    peerId: state.peerId,
    peerInstanceId: state.peerInstanceId,
  };
  return { scope, planningSnapshot };
}

async function durableState({
  generation,
  replay = 0,
  epoch = 0,
  revocation = 0,
  fencingToken = `fence:${epoch}`,
} = {}) {
  const { scope, planningSnapshot } = fixture();
  return createPlanningRecoveryDurableStateV1({
    scope,
    generation: generation ?? 1,
    planningSnapshot,
    recovery: await createPlanningRecoveryStateV1({
      schemaVersion: 1,
      assignmentEpochHighWater: epoch,
      replaySequenceHighWater: replay,
      revocationHighWater: revocation,
      budgetReservationHighWater: 0,
      fencingToken,
    }),
  });
}

test("in-memory profile fences stale state, validates real planning snapshots and retains an append-only chain", async () => {
  const initial = await durableState();
  const repository = new InMemoryPlanningRecoveryDurableRepositoryV1(
    initial.scope,
  );
  assert.equal(await repository.initialize(initial), "initialized");
  const next = await durableState({
    generation: 2,
    replay: 1,
    epoch: 1,
    revocation: 1,
  });
  const commit = await repository.commit({
    expectedGeneration: 1,
    expectedStateDigest: initial.stateDigest,
    nextState: next,
    event: {
      eventId: "recovery:1",
      kind: "recovery.committed",
      logicalTimeMs: 5,
      payload: { applied: true },
    },
  });
  assert.equal(commit.committed, true);
  const events = await repository.inspectEvents();
  assert.equal(
    await verifyPlanningRecoveryDurableJournalV1({
      entries: events,
      expectedHeadSequence: 1,
      expectedHeadDigest: events[0].digest,
    }),
    true,
  );
  const empty = new InMemoryPlanningRecoveryDurableRepositoryV1(initial.scope);
  assert.deepEqual(await empty.restore(await repository.read()), {
    restored: true,
    snapshot: await repository.read(),
  });
  assert.deepEqual(
    await repository.commit({
      expectedGeneration: 1,
      expectedStateDigest: initial.stateDigest,
      nextState: next,
      event: {
        eventId: "recovery:again",
        kind: "recovery.committed",
        logicalTimeMs: 5,
        payload: {},
      },
    }),
    { committed: false, code: "state_conflict" },
  );
  const rollback = await durableState({
    generation: 3,
    replay: 0,
    epoch: 0,
    revocation: 0,
  });
  assert.deepEqual(
    await repository.commit({
      expectedGeneration: 2,
      expectedStateDigest: next.stateDigest,
      nextState: rollback,
      event: {
        eventId: "rollback",
        kind: "recovery.rollback",
        logicalTimeMs: 5,
        payload: {},
      },
    }),
    { committed: false, code: "rollback_rejected" },
  );
  const tokenSwap = await durableState({
    generation: 3,
    replay: 2,
    epoch: 1,
    revocation: 2,
    fencingToken: "fence:mutated",
  });
  assert.deepEqual(
    await repository.commit({
      expectedGeneration: 2,
      expectedStateDigest: next.stateDigest,
      nextState: tokenSwap,
      event: {
        eventId: "token-swap",
        kind: "recovery.committed",
        logicalTimeMs: 5,
        payload: {},
      },
    }),
    { committed: false, code: "rollback_rejected" },
  );
  assert.equal(
    await verifyPlanningRecoveryDurableJournalV1({
      entries: [
        events[0],
        {
          ...events[0],
          sequence: 2,
          scope: { ...events[0].scope, peerId: "peer:foreign" },
        },
      ],
    }),
    false,
  );
  const fork = new InMemoryPlanningRecoveryDurableRepositoryV1(initial.scope);
  await fork.initialize(initial);
  assert.equal(
    (
      await fork.commit({
        expectedGeneration: 1,
        expectedStateDigest: initial.stateDigest,
        nextState: next,
        event: {
          eventId: "recovery:fork",
          kind: "recovery.committed",
          logicalTimeMs: 5,
          payload: { applied: true },
        },
      })
    ).committed,
    true,
  );
  const forkSnapshot = await fork.read();
  assert.deepEqual(await repository.restore(forkSnapshot), {
    restored: false,
    code: "rollback_rejected",
  });
  const later = await durableState({
    generation: 3,
    replay: 2,
    epoch: 2,
    revocation: 2,
  });
  assert.equal(
    (
      await fork.commit({
        expectedGeneration: 2,
        expectedStateDigest: next.stateDigest,
        nextState: later,
        event: {
          eventId: "recovery:head-gap",
          kind: "recovery.committed",
          logicalTimeMs: 5,
          payload: { applied: true },
        },
      })
    ).committed,
    true,
  );
  const posteriorEvents = await fork.inspectEvents();
  assert.equal(
    await verifyPlanningRecoveryDurableJournalV1({
      entries: posteriorEvents,
      expectedHeadSequence: 2,
      expectedHeadDigest: posteriorEvents[1].digest,
    }),
    true,
  );
  assert.deepEqual(await repository.restore(await fork.read()), {
    restored: false,
    code: "rollback_rejected",
  });
});

test("rejects accessors before invoking them and rejects cross-scope restores", async () => {
  const state = await durableState();
  let read = false;
  const malicious = { ...state };
  Object.defineProperty(malicious, "scope", {
    enumerable: true,
    get() {
      read = true;
      throw new Error("must not run");
    },
  });
  const repository = new InMemoryPlanningRecoveryDurableRepositoryV1(
    state.scope,
  );
  await assert.rejects(repository.initialize(malicious), /accessor|invalid/u);
  assert.equal(read, false);
  await repository.initialize(state);
  const foreign = new InMemoryPlanningRecoveryDurableRepositoryV1({
    ...state.scope,
    peerId: "peer:foreign",
  });
  await assert.rejects(
    foreign.restore(await repository.read()),
    /scope_mismatch/u,
  );
});

test("PostgreSQL initialization keeps schema out of scope and binds the genesis head", async () => {
  const state = await durableState();
  const calls = [];
  const client = {
    async query(text, values) {
      calls.push({ text, values });
      return { rowCount: /INSERT/u.test(text) ? 1 : 0, rows: [] };
    },
    release() {},
  };
  const pool = {
    async connect() {
      return client;
    },
  };
  const repository = new PostgresPlanningRecoveryDurableRepositoryV1(pool, {
    schema: "planning_recovery_fake",
    ...state.scope,
  });
  assert.equal(await repository.initialize(state), "initialized");
  const insert = calls.find(({ text }) =>
    text.includes("mesh_planning_recovery_states"),
  );
  assert.deepEqual(insert.values.slice(-2), [
    0,
    PLANNING_RECOVERY_DURABILITY_GENESIS_DIGEST,
  ]);
});

test(
  "PostgreSQL profile restores only an empty scope and fences non-empty rollback",
  {
    skip:
      process.env.AGENTPLAT_POSTGRES_TEST === "1"
        ? false
        : "set AGENTPLAT_POSTGRES_TEST=1 for PostgreSQL integration tests",
  },
  async () => {
    const schema = `planning_recovery_${crypto.randomUUID().replaceAll("-", "")}`;
    const initial = await durableState();
    const next = await durableState({
      generation: 2,
      replay: 1,
      epoch: 1,
      revocation: 1,
    });
    const memory = new InMemoryPlanningRecoveryDurableRepositoryV1(
      initial.scope,
    );
    await memory.initialize(initial);
    const initialSnapshot = await memory.read();
    const pool = createPostgresPool({ options: "-c search_path=pg_catalog" });
    let restartedPool;
    let poolClosed = false;
    try {
      await runMigrations(pool, { schema, createSchema: true });
      const first = new PostgresPlanningRecoveryDurableRepositoryV1(pool, {
        schema,
        ...initial.scope,
      });
      assert.equal(await first.initialize(initial), "initialized");
      assert.equal(
        (
          await first.commit({
            expectedGeneration: 1,
            expectedStateDigest: initial.stateDigest,
            nextState: next,
            event: {
              eventId: "postgres:recovery:1",
              kind: "recovery.committed",
              logicalTimeMs: 5,
              payload: { committed: true },
            },
          })
        ).committed,
        true,
      );
      const snapshot = await first.read();
      await pool.end();
      poolClosed = true;
      restartedPool = createPostgresPool({
        options: "-c search_path=pg_catalog",
      });
      try {
        const restarted = new PostgresPlanningRecoveryDurableRepositoryV1(
          restartedPool,
          { schema, ...initial.scope },
        );
        assert.equal(
          (await restarted.read()).snapshotDigest,
          snapshot.snapshotDigest,
        );
        assert.deepEqual(await restarted.restore(snapshot), {
          restored: false,
          code: "existing",
        });
        await assert.rejects(
          restarted.restore({ ...snapshot, state: initialSnapshot.state }),
          /snapshot_digest_invalid/u,
        );
        assert.deepEqual(await restarted.restore(initialSnapshot), {
          restored: false,
          code: "rollback_rejected",
        });
      } finally {
        await restartedPool
          .query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
          .catch(() => undefined);
        await restartedPool.end();
      }
    } finally {
      if (!poolClosed) {
        await pool
          .query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
          .catch(() => undefined);
        await pool.end().catch(() => undefined);
      }
    }
  },
);
