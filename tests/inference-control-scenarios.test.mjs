import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INFERENCE_CONTROL_SCENARIO_COUNT,
  buildInferenceControlScenarioReport,
  verifyInferenceControlScenarioReport,
} from '../scripts/inference-control-scenarios.mjs';

test('all bounded Alpha 3 scenarios have reproducible evidence records', async () => {
  const report = await verifyInferenceControlScenarioReport();
  assert.equal(report.length, INFERENCE_CONTROL_SCENARIO_COUNT);
  assert.equal(report.length, 28);
  assert.deepEqual(buildInferenceControlScenarioReport(), report);
  for (const scenario of report) {
    assert.equal(scenario.configuration.releaseVersion, '0.3.0-alpha.3');
    assert.equal(scenario.configuration.eventLimit, 128);
    assert.equal(scenario.configuration.internalStepLimit, 1_024);
    assert.equal(scenario.configuration.logicalTimeLimitMs, 10_000);
  }
  assert.equal(
    report.find((scenario) => scenario.scenarioId === '13')
      .firstReplayDivergence,
    0,
  );
});
