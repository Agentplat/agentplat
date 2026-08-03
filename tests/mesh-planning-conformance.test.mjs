import assert from "node:assert/strict";
import test from "node:test";

import {
  PLANNING_CONFORMANCE_CAPABILITIES_V1,
  PLANNING_CONFORMANCE_CASES_V1,
  createPlanningConformanceReportV1,
  createPlanningConformanceFixturesV1,
  runPlanningConformanceV1,
  validatePlanningConformanceReportV1,
} from "@agentplat/mesh-conformance/planning";

function implementation() {
  return {
    async assess(challenge) {
      const input = challenge.input;
      const rejected = {
        "intent.validate": "unknown_field",
        "proposal.validate": "scope_widening",
        "reducer.apply": "dependency_cycle",
        "snapshot.restore":
          input.snapshotScope !== input.targetScope
            ? "snapshot_scope_mismatch"
            : "snapshot_rollback",
        "replanning.apply": "causal_predecessor_missing",
        "effect.apply": "stale_fence",
        "mesh-projection.validate": "assignment_binding_mismatch",
        "evaluation.artifact.validate": "private_evidence_disclosed",
      };
      const reasonCode = rejected[input.operation] ?? null;
      if (
        input.operation === "durability.reopen" &&
        input.expectedFenceHighWater !== 2
      ) {
        return {
          schemaVersion: 1,
          caseId: challenge.caseId,
          fixtureDigest: challenge.fixtureDigest,
          verdict: "rejected",
          reasonCode: "high_water_rollback",
          evidenceDigest: challenge.fixtureDigest,
        };
      }
      return {
        schemaVersion: 1,
        caseId: challenge.caseId,
        fixtureDigest: challenge.fixtureDigest,
        verdict: reasonCode === null ? "accepted" : "rejected",
        reasonCode,
        evidenceDigest: challenge.fixtureDigest,
      };
    },
  };
}

test("planning conformance runs public fixtures against a concrete adapter", async () => {
  assert.equal(
    PLANNING_CONFORMANCE_CAPABILITIES_V1.every((capability) =>
      PLANNING_CONFORMANCE_CASES_V1.some(
        (definition) => definition.capability === capability,
      ),
    ),
    true,
  );
  const cases = await runPlanningConformanceV1({
    declaredCapabilities: PLANNING_CONFORMANCE_CAPABILITIES_V1,
    factory: () => implementation(),
    timeoutMs: 100,
  });
  assert.equal(cases.length, PLANNING_CONFORMANCE_CASES_V1.length);
  assert.equal(
    cases.every((entry) => entry.outcome === "passed"),
    true,
  );

  const report = createPlanningConformanceReportV1({
    implementation: { name: "external-planner", version: "1.0.0" },
    declaredCapabilities: PLANNING_CONFORMANCE_CAPABILITIES_V1,
    seed: 11,
    cases,
  });
  assert.equal(report.verdict, "passed");
  assert.deepEqual(validatePlanningConformanceReportV1(report), report);
});

test("planning runner fails widening, cycle, restore and stale-fence controls when an adapter accepts them", async () => {
  const cases = await runPlanningConformanceV1({
    declaredCapabilities: PLANNING_CONFORMANCE_CAPABILITIES_V1,
    factory: () => ({
      assess: (challenge) => ({
        schemaVersion: 1,
        caseId: challenge.caseId,
        fixtureDigest: challenge.fixtureDigest,
        verdict: "accepted",
        reasonCode: null,
        evidenceDigest: challenge.fixtureDigest,
      }),
    }),
    timeoutMs: 100,
  });
  for (const caseId of [
    "planning.proposal.scope-widening",
    "planning.reducer.dependency-cycle",
    "planning.snapshot.cross-scope",
    "planning.snapshot.rollback",
    "planning.fencing.stale-result",
  ]) {
    assert.equal(
      cases.find((entry) => entry.caseId === caseId)?.outcome,
      "failed",
    );
  }
  const report = createPlanningConformanceReportV1({
    implementation: { name: "accept-all", version: "1.0.0" },
    declaredCapabilities: PLANNING_CONFORMANCE_CAPABILITIES_V1,
    seed: 0,
    cases,
  });
  assert.equal(report.verdict, "failed");
});

test("planning report is closed: failed cases, fixture bindings and aggregates cannot be omitted or forged", async () => {
  const fixtures = createPlanningConformanceFixturesV1();
  const cases = await runPlanningConformanceV1({
    declaredCapabilities: PLANNING_CONFORMANCE_CAPABILITIES_V1,
    factory: () => implementation(),
  });
  const report = createPlanningConformanceReportV1({
    implementation: { name: "external-planner", version: "1.0.0" },
    declaredCapabilities: PLANNING_CONFORMANCE_CAPABILITIES_V1,
    seed: 11,
    cases,
  });
  assert.throws(
    () =>
      createPlanningConformanceReportV1({
        implementation: report.implementation,
        declaredCapabilities: report.declaredCapabilities,
        seed: report.seed,
        cases: report.cases.slice(1),
      }),
    /coverage/i,
  );
  const failed = report.cases.map((entry) =>
    entry.caseId === "planning.reducer.exact-replay"
      ? {
          ...entry,
          outcome: "failed",
          reasonCode: "assertion_failed",
          evidenceDigest: null,
        }
      : entry,
  );
  const failedReport = createPlanningConformanceReportV1({
    implementation: report.implementation,
    declaredCapabilities: report.declaredCapabilities,
    seed: report.seed,
    cases: failed,
  });
  assert.throws(
    () =>
      validatePlanningConformanceReportV1({
        ...failedReport,
        verdict: "passed",
      }),
    /aggregate/i,
  );
  assert.equal(
    report.cases.find(
      (entry) => entry.caseId === "planning.reducer.exact-replay",
    )?.fixtureDigest,
    fixtures.get("planning.reducer.exact-replay").fixtureDigest,
  );
});

test("planning report rejects exotic prototypes and accessors without evaluating them", () => {
  const base = {
    schemaVersion: 1,
    conformanceVersion: 1,
    suiteDigest:
      "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    fixtureManifestDigest:
      "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    implementation: { name: "planner", version: "1.0.0" },
    declaredCapabilities: ["planning.portable", "planning.reducer"],
    seed: 0,
    cases: [],
    counts: { passed: 0, failed: 0, notDeclared: 0, total: 0 },
    verdict: "failed",
  };
  let accessed = false;
  Object.defineProperty(base, "seed", {
    enumerable: true,
    get() {
      accessed = true;
      return 0;
    },
  });
  assert.throws(() => validatePlanningConformanceReportV1(base), /accessors/i);
  assert.equal(accessed, false);
  assert.throws(
    () =>
      validatePlanningConformanceReportV1(
        Object.assign(Object.create({}), base),
      ),
    /record/i,
  );
});

test("planning challenges are deeply frozen and adapter accessors are rejected without execution", async () => {
  const fixtures = createPlanningConformanceFixturesV1();
  const fixture = fixtures.get("planning.reducer.dependency-cycle");
  assert.equal(Object.isFrozen(fixture), true);
  assert.equal(Object.isFrozen(fixture.input), true);
  assert.equal(Object.isFrozen(fixture.input.fragments), true);
  assert.equal(Object.isFrozen(fixture.input.fragments[0]), true);

  let accessed = false;
  const cases = await runPlanningConformanceV1({
    declaredCapabilities: ["planning.portable", "planning.reducer"],
    factory: () => {
      const adapter = {};
      Object.defineProperty(adapter, "assess", {
        enumerable: true,
        get() {
          accessed = true;
          return implementation().assess;
        },
      });
      return adapter;
    },
  });
  assert.equal(accessed, false);
  assert.equal(
    cases.find((entry) => entry.caseId === "planning.reducer.dependency-cycle")
      ?.outcome,
    "failed",
  );
});

test("planning options reject getters and unknown fields before reading factory or capabilities", async () => {
  let factoryRead = false;
  const options = {
    declaredCapabilities: ["planning.portable", "planning.reducer"],
  };
  Object.defineProperty(options, "factory", {
    enumerable: true,
    get() {
      factoryRead = true;
      return () => implementation();
    },
  });
  await assert.rejects(
    runPlanningConformanceV1(options),
    /options have accessors/i,
  );
  assert.equal(factoryRead, false);
  await assert.rejects(
    runPlanningConformanceV1({
      declaredCapabilities: ["planning.portable", "planning.reducer"],
      factory: () => implementation(),
      unexpected: true,
    }),
    /options have unknown fields/i,
  );
});

test("planning runner preserves cleanup failure and timeout-cleanup failure codes", async () => {
  const cleanupFailure = await runPlanningConformanceV1({
    declaredCapabilities: ["planning.portable", "planning.reducer"],
    factory: () => ({
      assess: implementation().assess,
      cleanup() {
        throw new Error("cleanup failed");
      },
    }),
  });
  assert.equal(
    cleanupFailure.find(
      (entry) => entry.caseId === "planning.reducer.exact-replay",
    )?.reasonCode,
    "cleanup_failed",
  );

  const timeoutCleanupFailure = await runPlanningConformanceV1({
    declaredCapabilities: ["planning.portable", "planning.reducer"],
    timeoutMs: 10,
    cleanupTimeoutMs: 10,
    factory: () => ({
      assess: () => new Promise(() => undefined),
      cleanup: () => new Promise(() => undefined),
    }),
  });
  assert.equal(
    timeoutCleanupFailure.find(
      (entry) => entry.caseId === "planning.reducer.exact-replay",
    )?.reasonCode,
    "timeout_cleanup_failed",
  );
});
