import assert from "node:assert/strict";
import test from "node:test";

import { digestPlanningJsonV1 } from "@agentplat/collective-planning";
import {
  CoordinationControlRuntimeV1,
  InMemoryCoordinationControlStoreV1,
  createCoordinationControlEvidenceV1,
  createCoordinationControlPolicyV1,
} from "../packages/collective-runtime/dist/coordination-control.js";

const sha = (value) => digestPlanningJsonV1("mission-observation", { value });
const implementationDigest = sha("implementation");
const registryDigest = sha("source-registry");

function policy(overrides = {}) {
  return createCoordinationControlPolicyV1({
    schemaVersion: 1,
    policyId: "policy",
    policyVersion: 1,
    sourceRegistryDigest: registryDigest,
    sourceBindings: [
      {
        sourceId: "inference-control",
        sourceVersion: 1,
        sourceImplementationDigest: implementationDigest,
      },
    ],
    minimumEvidenceSources: 1,
    freshnessWindowMs: 20,
    cooldownMs: 10,
    hysteresisBps: 100,
    thresholds: {
      minimumRoleAlignmentBps: 6_000,
      minimumRoleCoherenceBps: 6_000,
      minimumContextIntegrityBps: 6_000,
      maximumContextUncertaintyBps: 4_000,
      minimumTrustBps: 6_000,
      minimumCapabilityBps: 6_000,
      minimumExecutionHealthBps: 6_000,
      minimumTeamHealthBps: 6_000,
      minimumOutcomeConfidenceBps: 6_000,
    },
    limits: {
      maximumEvidenceSources: 2,
      maximumOutboxRecords: 4,
      maximumCommitAttempts: 3,
      maximumProposalTtlMs: 20,
    },
    ...overrides,
  });
}

function evidence(now, overrides = {}) {
  return createCoordinationControlEvidenceV1({
    schemaVersion: 1,
    evidenceId: `evidence.${now}`,
    scope: {
      tenantId: "tenant",
      coordinationId: "coordination",
      missionIntentId: "mission",
      teamId: "team",
      workItemId: "work",
    },
    sourceId: "inference-control",
    sourceVersion: 1,
    sourceImplementationDigest: implementationDigest,
    sourceRevision: now + 1,
    sourceRecordDigest: sha(`source.${now}`),
    roleAlignmentBps: 8_000,
    roleCoherenceBps: 8_000,
    contextIntegrityBps: 8_000,
    contextUncertaintyBps: 2_000,
    trustBps: 8_000,
    capabilityBps: 8_000,
    executionHealthBps: 8_000,
    teamHealthBps: 8_000,
    outcomeConfidenceBps: 8_000,
    observedAtLogicalMs: now,
    expiresAtLogicalMs: now + 20,
    ...overrides,
  });
}

function runtime(options = {}) {
  const evidenceResolution = options.evidenceResolution ?? {
    registryId: "source-registry",
    registryVersion: 1,
    registryDigest,
    async resolve({ evidence: value }) {
      return {
        sourceId: value.sourceId,
        sourceVersion: value.sourceVersion,
        sourceImplementationDigest: value.sourceImplementationDigest,
      };
    },
  };
  return new CoordinationControlRuntimeV1({
    stateKey: "state",
    coordinationId: "coordination",
    policy: options.policy ?? policy(),
    store: options.store ?? new InMemoryCoordinationControlStoreV1(),
    evidenceResolution,
    ...(options.dispatch ? { dispatch: options.dispatch } : {}),
  });
}

test("emits a bounded advisory continue proposal and dispatches it once", async () => {
  const delivered = [];
  const loop = runtime({
    dispatch: {
      async dispatch({ proposal }) {
        delivered.push(proposal.proposalId);
        return { status: "delivered" };
      },
    },
  });
  const proposal = await loop.evaluate({
    logicalTimeMs: 1,
    evidence: [evidence(1)],
  });
  assert.equal(proposal.action, "continue");
  assert.equal(proposal.advisoryOnly, true);
  assert.equal(
    (await loop.dispatchPending(2))?.proposalDigest,
    proposal.proposalDigest,
  );
  assert.deepEqual(delivered, [proposal.proposalId]);
  assert.equal(await loop.dispatchPending(3), null);
});

test("fails closed for missing, stale, rollback, and equivocal evidence", async () => {
  const loop = runtime({
    policy: policy({
      limits: {
        maximumEvidenceSources: 2,
        maximumOutboxRecords: 8,
        maximumCommitAttempts: 3,
        maximumProposalTtlMs: 20,
      },
    }),
  });
  assert.equal(
    (await loop.evaluate({ logicalTimeMs: 1, evidence: [] })).action,
    "pause_dispatch",
  );
  assert.equal(
    (await loop.evaluate({ logicalTimeMs: 50, evidence: [evidence(1)] }))
      .action,
    "pause_dispatch",
  );
  const current = evidence(60);
  await loop.evaluate({ logicalTimeMs: 60, evidence: [current] });
  assert.equal(
    (
      await loop.evaluate({
        logicalTimeMs: 61,
        evidence: [
          evidence(61, { sourceRevision: current.sourceRevision - 1 }),
        ],
      })
    ).action,
    "pause_dispatch",
  );
  assert.equal(
    (
      await loop.evaluate({
        logicalTimeMs: 62,
        evidence: [
          evidence(62, {
            sourceRevision: current.sourceRevision,
            sourceRecordDigest: sha("equivocal"),
          }),
        ],
      })
    ).action,
    "pause_dispatch",
  );
});

test("uses threshold actions, cooldown, and hysteresis without blocking safe recovery", async () => {
  const loop = runtime();
  assert.equal(
    (
      await loop.evaluate({
        logicalTimeMs: 1,
        evidence: [evidence(1, { trustBps: 5_000 })],
      })
    ).action,
    "restrict_participation",
  );
  assert.equal(
    (await loop.evaluate({ logicalTimeMs: 2, evidence: [evidence(2)] })).action,
    "restrict_participation",
  );
  assert.equal(
    (await loop.evaluate({ logicalTimeMs: 12, evidence: [evidence(12)] }))
      .action,
    "continue",
  );
  assert.equal(
    (
      await loop.evaluate({
        logicalTimeMs: 23,
        evidence: [evidence(23, { contextIntegrityBps: 5_000 })],
      })
    ).action,
    "request_replanning",
  );
});

test("rejects tampered durable state before using it", async () => {
  const backing = new InMemoryCoordinationControlStoreV1();
  let tamper = false;
  const store = {
    async load(key) {
      const state = await backing.load(key);
      return tamper && state
        ? { ...state, stateDigest: sha("tampered-state") }
        : state;
    },
    save(input) {
      return backing.save(input);
    },
  };
  const loop = runtime({ store });
  await loop.evaluate({ logicalTimeMs: 1, evidence: [evidence(1)] });
  tamper = true;
  await assert.rejects(
    () => loop.evaluate({ logicalTimeMs: 2, evidence: [evidence(2)] }),
    /state digest is invalid/,
  );
});

test("rejects logical-time rollback during evaluation and delivery", async () => {
  const loop = runtime({
    dispatch: {
      async dispatch() {
        return { status: "delivered" };
      },
    },
  });
  await loop.evaluate({ logicalTimeMs: 10, evidence: [evidence(10)] });
  await assert.rejects(
    () => loop.evaluate({ logicalTimeMs: 9, evidence: [evidence(9)] }),
    /logical time rollback/,
  );
  await assert.rejects(() => loop.dispatchPending(9), /logical time rollback/);
});

test("applies backpressure instead of dropping pending proposals", async () => {
  const loop = runtime({
    policy: policy({
      limits: {
        maximumEvidenceSources: 2,
        maximumOutboxRecords: 1,
        maximumCommitAttempts: 3,
        maximumProposalTtlMs: 20,
      },
    }),
  });
  await loop.evaluate({ logicalTimeMs: 1, evidence: [evidence(1)] });
  await assert.rejects(
    () => loop.evaluate({ logicalTimeMs: 2, evidence: [evidence(2)] }),
    /pending outbox capacity exhausted/,
  );
});

test("settled outbox retention remains within the configured bound", async () => {
  const store = new InMemoryCoordinationControlStoreV1();
  const loop = runtime({
    store,
    policy: policy({
      limits: {
        maximumEvidenceSources: 2,
        maximumOutboxRecords: 1,
        maximumCommitAttempts: 3,
        maximumProposalTtlMs: 20,
      },
    }),
    dispatch: {
      async dispatch() {
        return { status: "delivered" };
      },
    },
  });
  await loop.evaluate({ logicalTimeMs: 1, evidence: [evidence(1)] });
  await loop.dispatchPending(2);
  await loop.evaluate({ logicalTimeMs: 3, evidence: [evidence(3)] });

  const state = await store.load("state");
  assert.equal(state.outbox.length, 1);
  assert.equal(state.outbox[0].status, "pending");
});

test("evidence expires at its exclusive logical deadline", async () => {
  const proposal = await runtime().evaluate({
    logicalTimeMs: 21,
    evidence: [evidence(1)],
  });
  assert.equal(proposal.action, "pause_dispatch");
  assert.deepEqual(proposal.reasonCodes, ["stale_evidence"]);
});

test("an expired pending proposal records explicit non-delivery", async () => {
  let dispatches = 0;
  const store = new InMemoryCoordinationControlStoreV1();
  const loop = runtime({
    store,
    dispatch: {
      async dispatch() {
        dispatches += 1;
        return { status: "delivered" };
      },
    },
  });
  const proposal = await loop.evaluate({
    logicalTimeMs: 1,
    evidence: [evidence(1)],
  });

  assert.equal(await loop.dispatchPending(proposal.expiresAtLogicalMs), null);
  assert.equal(dispatches, 0);
  const state = await store.load("state");
  assert.equal(state.outbox[0].status, "expired");
});

test("fails closed when the authenticated source registry cannot resolve evidence", async () => {
  const loop = runtime({
    evidenceResolution: {
      registryId: "source-registry",
      registryVersion: 1,
      registryDigest,
      async resolve() {
        return null;
      },
    },
  });
  const proposal = await loop.evaluate({
    logicalTimeMs: 1,
    evidence: [evidence(1)],
  });
  assert.equal(proposal.action, "pause_dispatch");
  assert.deepEqual(proposal.reasonCodes, ["source_authentication_failed"]);
});

test("closes duplicate source revisions deterministically regardless of arrival order", async () => {
  const first = evidence(1);
  const conflicting = evidence(2, {
    sourceRevision: first.sourceRevision,
    sourceRecordDigest: first.sourceRecordDigest,
  });
  const forward = await runtime().evaluate({
    logicalTimeMs: 2,
    evidence: [first, conflicting],
  });
  const reverse = await runtime().evaluate({
    logicalTimeMs: 2,
    evidence: [conflicting, first],
  });
  assert.equal(forward.action, "pause_dispatch");
  assert.equal(reverse.action, "pause_dispatch");
  assert.deepEqual(reverse.reasonCodes, forward.reasonCodes);
  assert.deepEqual(reverse.evidenceDigests, forward.evidenceDigests);
});

test("rejects a changed projection for an accepted source revision", async () => {
  const loop = runtime();
  const first = evidence(1);
  await loop.evaluate({ logicalTimeMs: 1, evidence: [first] });

  const changedProjection = evidence(2, {
    sourceRevision: first.sourceRevision,
    sourceRecordDigest: first.sourceRecordDigest,
    trustBps: 1_000,
  });
  const proposal = await loop.evaluate({
    logicalTimeMs: 2,
    evidence: [changedProjection],
  });
  assert.equal(proposal.action, "pause_dispatch");
  assert.deepEqual(proposal.reasonCodes, ["source_equivocation"]);
});
