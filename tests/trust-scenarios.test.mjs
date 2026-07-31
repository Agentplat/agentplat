import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_SCENARIO_COUNT,
  TRUST_SCENARIO_RELEASE_VERSION,
  buildTrustScenarioReport,
  verifyTrustScenarioReport,
} from "../scripts/trust-scenarios.mjs";

test("all Alpha 4 adversarial Trust scenarios have deterministic evidence records", async () => {
  const report = await verifyTrustScenarioReport();
  assert.equal(report.length, TRUST_SCENARIO_COUNT);
  assert.equal(report.length, 27);
  assert.deepEqual(buildTrustScenarioReport(), report);
  for (const scenario of report) {
    assert.equal(scenario.releaseVersion, TRUST_SCENARIO_RELEASE_VERSION);
    assert.equal(
      scenario.configuration.releaseVersion,
      TRUST_SCENARIO_RELEASE_VERSION,
    );
    assert.match(scenario.configurationDigest, /^[0-9a-f]{64}$/u);
    assert.match(scenario.faultPlanDigest, /^[0-9a-f]{64}$/u);
    assert.match(scenario.traceDigest, /^[0-9a-f]{64}$/u);
    assert.match(scenario.seed, /^alpha4-trust-seed-\d{2}$/u);
  }
  assert.notEqual(
    report.find((scenario) => scenario.name === "same-group-challenge-reorder")
      .firstReplayDivergence,
    null,
  );
  assert.notEqual(
    report.find(
      (scenario) => scenario.name === "decay-uncertainty-clock-rollback",
    ).firstReplayDivergence,
    null,
  );
});
