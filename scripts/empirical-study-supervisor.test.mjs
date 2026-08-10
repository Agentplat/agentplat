import assert from "node:assert/strict";
import test from "node:test";

import {
  assertStateEventAnchorV1,
  createSupervisorEventV1,
  renderExecutionReportV1,
  validateEventChainV1,
} from "./empirical-study-supervisor.mjs";

function event(sequence, previousEventDigest, eventType, value) {
  return createSupervisorEventV1({
    configDigest: "sha256:config",
    sequence,
    previousEventDigest,
    eventType,
    recordedAt: `2026-01-01T00:00:0${sequence}.000Z`,
    value,
  });
}

test("validates an exact hash-chained supervisor event stream", () => {
  const first = event(0, null, "supervisor_started", {
    recovered: false,
  });
  const second = event(1, first.eventDigest, "shard_started", {
    shardIndex: 0,
  });
  const third = event(2, second.eventDigest, "shard_completed", {
    shardIndex: 0,
    elapsedMs: 12_345,
    executedSlotCount: 20,
    resumedSlotCount: 0,
    projectionCount: 20,
    receiptDigest: "sha256:receipt",
  });

  assert.deepEqual(validateEventChainV1([first, second, third]), [
    first,
    second,
    third,
  ]);
});

test("rejects tampering, reordering and broken predecessor links", () => {
  const first = event(0, null, "supervisor_started", {
    recovered: false,
  });
  const second = event(1, first.eventDigest, "shard_started", {
    shardIndex: 0,
  });

  assert.throws(
    () =>
      validateEventChainV1([first, { ...second, value: { shardIndex: 47 } }]),
    /empirical_supervisor_event_chain_invalid/,
  );
  assert.throws(
    () => validateEventChainV1([second, first]),
    /empirical_supervisor_event_chain_invalid/,
  );
  assert.throws(
    () => validateEventChainV1([first], "sha256:different-config"),
    /empirical_supervisor_event_chain_invalid/,
  );
});

test("rejects an event-log prefix when durable state anchors a later event", () => {
  const first = event(0, null, "supervisor_started", { recovered: false });
  const second = event(1, first.eventDigest, "shard_started", {
    shardIndex: 0,
  });

  assert.throws(
    () => assertStateEventAnchorV1({ lastEventDigest: second.eventDigest }, [first]),
    /empirical_supervisor_event_log_truncated/,
  );
});

test("renders paper-oriented closure, environment and interruption metadata", () => {
  const started = event(0, null, "supervisor_started", {
    recovered: true,
    environment: {
      platform: "darwin",
      release: "25.2.0",
      arch: "arm64",
      nodeVersion: "v24.14.0",
      cpuModel: "Apple M4 Pro",
      logicalCpuCount: 12,
      totalMemoryBytes: 25_769_803_776,
    },
  });
  const completed = event(1, started.eventDigest, "shard_completed", {
    shardIndex: 2,
    elapsedMs: 523_240,
    executedSlotCount: 12,
    resumedSlotCount: 8,
    projectionCount: 20,
    peakResidentSetBytes: 268_435_456,
    receiptDigest: "sha256:receipt",
  });
  const failure = event(2, completed.eventDigest, "shard_failed", {
    shardIndex: 3,
    reasonCode: "empirical_campaign_authorization_expired",
  });

  const report = renderExecutionReportV1({
    config: {
      campaignId: "paper-study-v3",
      sourceCommit: "a".repeat(40),
      configDigest: "sha256:config",
      executionPolicy: "strictly_sequential_stop_on_failure",
      shardIndices: [0, 1, 2, 3],
    },
    events: [started, completed, failure],
    campaign: {
      status: "partial",
      completedShards: [2],
      missingShards: [0, 1, 3],
      completedProjectionCount: 20,
    },
  });

  assert.match(report, /Status: in progress/);
  assert.match(report, /Apple M4 Pro/);
  assert.match(report, /\| 2 \| 0h 08m 43s \| 12 \| 8 \| 20 \| 256\.0 MiB \|/);
  assert.match(report, /Supervisor process recoveries: 1/);
  assert.match(report, /empirical_campaign_authorization_expired/);
  assert.match(report, /Empirical claim permitted by this report: no/);
  assert.doesNotMatch(report, /Serial Number|Hardware UUID|\/Users\//);
});
