import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  AutonomyControllerV1,
  InMemoryAutonomyStoreV1,
  createAutonomyEvidenceWindowV1,
  createAutonomyPolicyV1,
  createAutonomyStateV1,
  digestAutonomyJsonV1,
} from "@agentplat/autonomy";
import { Pool } from "pg";

import {
  PostgresAutonomyStoreV1,
  getMigrationStatus,
  rollbackMigrations,
  runMigrations,
} from "../dist/index.js";

const integration = process.env.AGENTPLAT_POSTGRES_TEST === "1";

test("store construction and migration import perform no I/O", async () => {
  const pool = new Pool({
    connectionString: "postgresql://invalid.invalid/unused",
  });
  assert.doesNotThrow(
    () => new PostgresAutonomyStoreV1(pool, { schema: "autonomy_import" }),
  );
  await assert.rejects(
    rollbackMigrations(pool, {
      schema: "autonomy_import",
      expectedCurrentVersion: 1,
      confirm: "invalid",
      allowDataLoss: true,
    }),
    /verified external backup/u,
  );
  await pool.end();
});

test(
  "PostgreSQL preserves promotion, degradation, decisions and CAS across restart",
  { skip: !integration },
  async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const schema = `autonomy_${randomUUID().replaceAll("-", "")}`;
    try {
      assert.equal(
        (await runMigrations(pool, { schema, createSchema: true }))
          .currentVersion,
        1,
      );
      assert.deepEqual(
        (await getMigrationStatus(pool, { schema })).pendingVersions,
        [],
      );
      const policy = policyFixture();
      const firstStore = new PostgresAutonomyStoreV1(pool, { schema });
      await firstStore.registerPolicy(policy);
      const first = new AutonomyControllerV1(firstStore);
      assert.equal(
        (await first.evaluate(evaluation(evidence(1), "action:1"))).level,
        "approve_all",
      );

      const restartedStore = new PostgresAutonomyStoreV1(pool, { schema });
      const restarted = new AutonomyControllerV1(restartedStore);
      assert.equal(
        (await restarted.evaluate(evaluation(evidence(2), "action:2"))).level,
        "approve_sample",
      );
      assert.equal(
        (await restarted.evaluate(evaluation(evidence(3), "action:3"))).level,
        "autonomous",
      );
      assert.equal(
        (
          await restarted.evaluate(
            evaluation(
              evidence(4, {
                positive: 0,
                negative: 1,
                reasonCounts: { wrong_target: 1 },
              }),
              "action:critical",
            ),
          )
        ).level,
        "blocked",
      );
      const decisions = await restartedStore.listDecisions({
        tenantId: "tenant-a",
        policyDomainId: "policy-domain-a",
      });
      assert.equal(decisions.length, 4);
      assert.equal(decisions.at(-1).disposition, "deny");

      const raceEvidence = evidence(0, { segmentKey: "segment-race" });
      const initial = createAutonomyStateV1({
        policy,
        evidence: raceEvidence,
        logicalTime: raceEvidence.observedThrough,
      });
      const memory = new InMemoryAutonomyStoreV1();
      await memory.registerPolicy(policy);
      await memory.initializeState(initial);
      await new AutonomyControllerV1(memory).evaluate(
        evaluation(raceEvidence, "action:race", {
          segmentKey: "segment-race",
        }),
      );
      const next = await memory.loadState({
        tenantId: "tenant-a",
        policyDomainId: "policy-domain-a",
        policyId: "policy-a",
        segmentDigest: raceEvidence.segmentDigest,
        actionType: "effect.apply",
      });
      const [decision] = await memory.listDecisions({
        tenantId: "tenant-a",
        policyDomainId: "policy-domain-a",
        segmentDigest: raceEvidence.segmentDigest,
      });
      assert.equal(await restartedStore.initializeState(initial), true);
      const races = await Promise.all([
        restartedStore.compareAndSet({
          expectedRevision: initial.revision,
          expectedStateDigest: initial.stateDigest,
          state: next,
          decision,
        }),
        restartedStore.compareAndSet({
          expectedRevision: initial.revision,
          expectedStateDigest: initial.stateDigest,
          state: next,
          decision,
        }),
      ]);
      assert.deepEqual(races.sort(), [false, true]);
    } finally {
      await pool
        .query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
        .catch(() => undefined);
      await pool.end();
    }
  },
);

function policyFixture() {
  return createAutonomyPolicyV1({
    tenantId: "tenant-a",
    policyDomainId: "policy-domain-a",
    policyId: "policy-a",
    policyVersion: 1,
    segmentNamespace: "risk-band",
    initialLevel: "propose_only",
    maximumLevel: "autonomous",
    minimumConcludedOutcomes: 1,
    minimumPositiveBasisPoints: 10_000,
    maximumNegativeBasisPoints: 0,
    maximumCorrectedBasisPoints: 0,
    maximumUnresolvedBasisPoints: 0,
    consecutiveHealthyWindows: 1,
    promotionCooldownMs: 0,
    sampleApprovalBasisPoints: 10_000,
    criticalReasonCodes: ["wrong_target"],
    criticalDegradationLevel: "blocked",
    coverageFailureLevel: "blocked",
    maximumDecisionHistory: 16,
  });
}

function evidence(sequence, overrides = {}) {
  const positive = overrides.positive ?? 1;
  const negative = overrides.negative ?? 0;
  const corrected = overrides.corrected ?? 0;
  const concludedOutcomes = positive + negative + corrected;
  return createAutonomyEvidenceWindowV1({
    tenantId: "tenant-a",
    policyDomainId: "policy-domain-a",
    segmentNamespace: "risk-band",
    segmentKey: overrides.segmentKey ?? "segment-a",
    actionType: "effect.apply",
    sourceId: "outcomes",
    sourceRevision: sequence,
    windowSequence: sequence,
    observedFrom: "2026-08-28T12:00:00.000Z",
    observedThrough: `2026-08-28T12:00:${String(sequence).padStart(2, "0")}.000Z`,
    coverageStatus: "healthy",
    eligibleTaskRuns: concludedOutcomes,
    concludedOutcomes,
    positive,
    negative,
    corrected,
    inconclusive: 0,
    unresolvedTaskRuns: 0,
    reasonCounts: overrides.reasonCounts ?? {},
    cursor: {
      recordedAt: `2026-08-28T12:00:${String(sequence).padStart(2, "0")}.000Z`,
      outcomeId: `outcome:${overrides.segmentKey ?? "a"}:${sequence}`,
    },
    evidenceReferenceIds: [],
  });
}

function evaluation(window, action, overrides = {}) {
  return {
    tenantId: "tenant-a",
    policyDomainId: "policy-domain-a",
    policyId: "policy-a",
    policyVersion: 1,
    segmentNamespace: "risk-band",
    segmentKey: overrides.segmentKey ?? "segment-a",
    actionType: "effect.apply",
    actionProposalDigest: digestAutonomyJsonV1("test-action", action),
    evidence: window,
    logicalTime: window.observedThrough,
  };
}
