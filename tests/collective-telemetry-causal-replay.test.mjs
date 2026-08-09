import assert from "node:assert/strict";
import test from "node:test";

import {
  COLLECTIVE_TELEMETRY_REPLAY_LIMITS_V1,
  CollectiveTelemetryRuntimeV1,
  InMemoryCollectiveTelemetryMonotonicAnchorV1,
  InMemoryCollectiveTelemetryStoreV1,
  createCollectiveTelemetryCausalReplayV1,
  createCollectiveTelemetryPolicyV1,
} from "@agentplat/audit/collective-telemetry";

const digest = (character) => `sha256:${character.repeat(64)}`;

function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isSafeInteger(value))
    return String(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(",")}}`;
}

async function contentDigest(domain, value) {
  const bytes = new TextEncoder().encode(`${domain}\n${canonicalJson(value)}`);
  const output = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(output)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function authenticity(peerId) {
  return {
    peerId,
    instanceId: `instance:${peerId}`,
    keyId: `key:${peerId}`,
    async sign(messageDigest) {
      return `signed:${peerId}:${messageDigest}`;
    },
    async verify(input) {
      return input.signature === `signed:${peerId}:${input.messageDigest}`;
    },
  };
}

async function policy() {
  return createCollectiveTelemetryPolicyV1({
    schemaVersion: 1,
    policyId: "policy:telemetry",
    policyVersion: 1,
    allowedMetricKeys: ["messages"],
    maximumEvidenceDigestsPerEvent: 8,
    maximumMetricsPerEvent: 4,
    maximumRetainedEvents: 32,
    maximumCommitAttempts: 4,
  });
}

async function stream({
  streamId,
  peerId,
  operationDigest,
  tenantId = "tenant:one",
}) {
  const signing = authenticity(peerId);
  const telemetryPolicy = await policy();
  const runtime = new CollectiveTelemetryRuntimeV1({
    streamId,
    anchorKey: `anchor:${streamId}:${peerId}`,
    tenantId,
    collectiveId: "collective:one",
    policy: telemetryPolicy,
    authenticity: signing,
    store: new InMemoryCollectiveTelemetryStoreV1(),
    monotonicAnchor: new InMemoryCollectiveTelemetryMonotonicAnchorV1(),
  });
  await runtime.initialize(1);
  await runtime.record({
    category: "planning",
    operation: "cycle.finalized",
    outcome: "completed",
    logicalTimeMs: 2,
    operationDigest,
    metrics: [{ key: "messages", value: 1 }],
    correlation: { missionId: "mission:one", cycleId: "cycle:one" },
  });
  return {
    bundle: await runtime.exportEvidence({ exportedAtLogicalMs: 3 }),
    policy: telemetryPolicy,
    authenticity: signing,
  };
}

async function sequentialStream(streamId = "stream:sequential") {
  const signing = authenticity("peer:sequential");
  const telemetryPolicy = await policy();
  const runtime = new CollectiveTelemetryRuntimeV1({
    streamId,
    anchorKey: `anchor:${streamId}`,
    tenantId: "tenant:one",
    collectiveId: "collective:one",
    policy: telemetryPolicy,
    authenticity: signing,
    store: new InMemoryCollectiveTelemetryStoreV1(),
    monotonicAnchor: new InMemoryCollectiveTelemetryMonotonicAnchorV1(),
  });
  await runtime.initialize(1);
  return { runtime, policy: telemetryPolicy, authenticity: signing };
}

async function recordMissionEvent(runtime, sequence, operationDigest) {
  await runtime.record({
    category: "planning",
    operation: `cycle.step.${sequence}`,
    outcome: "completed",
    logicalTimeMs: sequence + 1,
    operationDigest,
    correlation: { missionId: "mission:one", cycleId: "cycle:one" },
  });
}

test("causal replay verifies, scopes and merges signed streams", async () => {
  const left = await stream({
    streamId: "stream:left",
    peerId: "peer:left",
    operationDigest: digest("a"),
  });
  const right = await stream({
    streamId: "stream:right",
    peerId: "peer:right",
    operationDigest: digest("b"),
  });
  const replay = await createCollectiveTelemetryCausalReplayV1({
    tenantId: "tenant:one",
    collectiveId: "collective:one",
    missionId: "mission:one",
    cycleId: "cycle:one",
    sources: [right, left],
  });
  assert.equal(replay.events.length, 2);
  assert.deepEqual(replay.metricTotals, [{ key: "messages", value: 2 }]);
  assert.equal(replay.tenantId, "tenant:one");
});

test("causal replay enforces aggregate source ceilings before verification fan-out", async () => {
  const source = await stream({
    streamId: "stream:capacity",
    peerId: "peer:capacity",
    operationDigest: digest("0"),
  });
  await assert.rejects(
    createCollectiveTelemetryCausalReplayV1({
      tenantId: "tenant:one",
      collectiveId: "collective:one",
      missionId: "mission:one",
      sources: Array.from(
        { length: COLLECTIVE_TELEMETRY_REPLAY_LIMITS_V1.maximumSources + 1 },
        () => source,
      ),
    }),
    /requires source bundles/u,
  );
});

test("causal replay snapshots array coordinates without consulting a replaceable iterator", async () => {
  const source = await stream({
    streamId: "stream:iterator",
    peerId: "peer:iterator",
    operationDigest: digest("f"),
  });
  const sources = [source];
  Object.defineProperty(sources, Symbol.iterator, {
    value() {
      throw new Error("replaceable source iterator executed");
    },
  });
  const replay = await createCollectiveTelemetryCausalReplayV1({
    tenantId: "tenant:one",
    collectiveId: "collective:one",
    missionId: "mission:one",
    sources,
  });
  assert.equal(replay.events.length, 1);
});

test("record snapshots nested input before store awaits can mutate the caller", async () => {
  const baseStore = new InMemoryCollectiveTelemetryStoreV1();
  let mutate = () => {};
  const store = {
    async load(streamId) {
      mutate();
      return baseStore.load(streamId);
    },
    save: baseStore.save.bind(baseStore),
  };
  const runtime = new CollectiveTelemetryRuntimeV1({
    streamId: "stream:record-toctou",
    anchorKey: "anchor:record-toctou",
    tenantId: "tenant:one",
    collectiveId: "collective:one",
    policy: await policy(),
    authenticity: authenticity("peer:record-toctou"),
    store,
    monotonicAnchor: new InMemoryCollectiveTelemetryMonotonicAnchorV1(),
  });
  await runtime.initialize(1);
  const input = {
    category: "planning",
    operation: "record.original",
    outcome: "completed",
    logicalTimeMs: 2,
    operationDigest: digest("d"),
    metrics: [{ key: "messages", value: 1 }],
    correlation: { missionId: "mission:one" },
  };
  mutate = () => {
    input.operation = "record.mutated";
    input.metrics[0].value = 999;
  };
  const event = await runtime.record(input);
  assert.equal(event.operation, "record.original");
  assert.deepEqual(event.metrics, [{ key: "messages", value: 1 }]);
});

test("bundle verification rejects signed events with non-canonical extra fields", async () => {
  const source = await stream({
    streamId: "stream:extra-field",
    peerId: "peer:extra-field",
    operationDigest: digest("8"),
  });
  const originalEvent = source.bundle.events[0];
  const {
    eventId: _eventId,
    eventDigest: _eventDigest,
    signature: _signature,
    ...originalEventBody
  } = originalEvent;
  const eventBody = {
    ...originalEventBody,
    secret: { prompt: "raw-sensitive-content" },
  };
  const eventDigest = await contentDigest(
    "collective-telemetry-event-v1",
    eventBody,
  );
  const event = {
    ...eventBody,
    eventId: `telemetry:${eventDigest.slice(7, 47)}`,
    eventDigest,
    signature: await source.authenticity.sign(eventDigest),
  };
  const { bundleDigest: _bundleDigest, ...originalBundleBody } = source.bundle;
  const bundleBody = {
    ...originalBundleBody,
    events: [event],
    chainHeadDigest: eventDigest,
  };
  const bundle = {
    ...bundleBody,
    bundleDigest: await contentDigest(
      "collective-telemetry-bundle-v1",
      bundleBody,
    ),
  };
  await assert.rejects(
    createCollectiveTelemetryCausalReplayV1({
      tenantId: "tenant:one",
      collectiveId: "collective:one",
      missionId: "mission:one",
      sources: [{ ...source, bundle }],
    }),
    /event fields are invalid/u,
  );
});

test("bundle verification snapshots nested evidence before asynchronous checks", async () => {
  const source = await stream({
    streamId: "stream:toctou",
    peerId: "peer:toctou",
    operationDigest: digest("7"),
  });
  const mutableBundle = structuredClone(source.bundle);
  const pending = createCollectiveTelemetryCausalReplayV1({
    tenantId: "tenant:one",
    collectiveId: "collective:one",
    missionId: "mission:one",
    sources: [{ ...source, bundle: mutableBundle }],
  });
  mutableBundle.events[0].operation = "unsigned.mutation";
  mutableBundle.events[0].metrics[0].value = 999;
  const replay = await pending;
  assert.equal(replay.events[0].operation, "cycle.finalized");
  assert.deepEqual(replay.events[0].metrics, [{ key: "messages", value: 1 }]);
});

test("causal replay rejects a signed fork at one stream coordinate", async () => {
  const left = await stream({
    streamId: "stream:fork",
    peerId: "peer:fork",
    operationDigest: digest("c"),
  });
  const right = await stream({
    streamId: "stream:fork",
    peerId: "peer:fork",
    operationDigest: digest("d"),
  });
  await assert.rejects(
    createCollectiveTelemetryCausalReplayV1({
      tenantId: "tenant:one",
      collectiveId: "collective:one",
      missionId: "mission:one",
      sources: [left, right],
    }),
    /stream fork/,
  );
});

test("causal replay rejects cross-tenant source mixing", async () => {
  const source = await stream({
    streamId: "stream:other",
    peerId: "peer:other",
    operationDigest: digest("e"),
    tenantId: "tenant:other",
  });
  await assert.rejects(
    createCollectiveTelemetryCausalReplayV1({
      tenantId: "tenant:one",
      collectiveId: "collective:one",
      missionId: "mission:one",
      sources: [source],
    }),
    /source scope changed/,
  );
});

test("causal replay accepts adjacent bundles only when their stream chain is continuous", async () => {
  const source = await sequentialStream("stream:adjacent");
  await recordMissionEvent(source.runtime, 1, digest("1"));
  const first = await source.runtime.exportEvidence({
    fromSequence: 1,
    exportedAtLogicalMs: 2,
  });
  await recordMissionEvent(source.runtime, 2, digest("2"));
  const second = await source.runtime.exportEvidence({
    fromSequence: 2,
    exportedAtLogicalMs: 3,
  });

  const replay = await createCollectiveTelemetryCausalReplayV1({
    tenantId: "tenant:one",
    collectiveId: "collective:one",
    missionId: "mission:one",
    sources: [
      {
        bundle: second,
        policy: source.policy,
        authenticity: source.authenticity,
      },
      {
        bundle: first,
        policy: source.policy,
        authenticity: source.authenticity,
      },
    ],
  });
  assert.deepEqual(
    replay.events.map(({ sequence }) => sequence),
    [1, 2],
  );
});

test("causal replay rejects individually valid adjacent bundles with a disconnected prior digest", async () => {
  const source = await sequentialStream("stream:disconnected");
  await recordMissionEvent(source.runtime, 1, digest("3"));
  const first = await source.runtime.exportEvidence({
    fromSequence: 1,
    exportedAtLogicalMs: 2,
  });
  await recordMissionEvent(source.runtime, 2, digest("4"));
  const originalSecond = await source.runtime.exportEvidence({
    fromSequence: 2,
    exportedAtLogicalMs: 3,
  });
  const priorEventDigest = digest("9");
  const originalEvent = originalSecond.events[0];
  const {
    eventId: _eventId,
    eventDigest: _eventDigest,
    signature: _signature,
    ...originalBody
  } = originalEvent;
  const eventBody = { ...originalBody, previousEventDigest: priorEventDigest };
  const eventDigest = await contentDigest(
    "collective-telemetry-event-v1",
    eventBody,
  );
  const event = {
    ...eventBody,
    eventId: `telemetry:${eventDigest.slice(7, 47)}`,
    eventDigest,
    signature: await source.authenticity.sign(eventDigest),
  };
  const { bundleDigest: _bundleDigest, ...originalBundleBody } = originalSecond;
  const bundleBody = {
    ...originalBundleBody,
    priorEventDigest,
    chainHeadDigest: eventDigest,
    events: [event],
  };
  const disconnected = {
    ...bundleBody,
    bundleDigest: await contentDigest(
      "collective-telemetry-bundle-v1",
      bundleBody,
    ),
  };

  await assert.rejects(
    createCollectiveTelemetryCausalReplayV1({
      tenantId: "tenant:one",
      collectiveId: "collective:one",
      missionId: "mission:one",
      sources: [
        {
          bundle: first,
          policy: source.policy,
          authenticity: source.authenticity,
        },
        {
          bundle: disconnected,
          policy: source.policy,
          authenticity: source.authenticity,
        },
      ],
    }),
    /stream continuity fork/,
  );
});

test("causal replay rejects disconnected ranges from one stream", async () => {
  const source = await sequentialStream("stream:gap");
  await recordMissionEvent(source.runtime, 1, digest("5"));
  const first = await source.runtime.exportEvidence({
    fromSequence: 1,
    exportedAtLogicalMs: 2,
  });
  await recordMissionEvent(source.runtime, 2, digest("6"));
  await recordMissionEvent(source.runtime, 3, digest("7"));
  const third = await source.runtime.exportEvidence({
    fromSequence: 3,
    exportedAtLogicalMs: 4,
  });

  await assert.rejects(
    createCollectiveTelemetryCausalReplayV1({
      tenantId: "tenant:one",
      collectiveId: "collective:one",
      missionId: "mission:one",
      sources: [
        {
          bundle: first,
          policy: source.policy,
          authenticity: source.authenticity,
        },
        {
          bundle: third,
          policy: source.policy,
          authenticity: source.authenticity,
        },
      ],
    }),
    /stream continuity gap/,
  );
});

test("load rejects state whose exact runtime identity or policy binding changed", async () => {
  const telemetryPolicy = await policy();
  const signing = authenticity("peer:binding");
  const original = new CollectiveTelemetryRuntimeV1({
    streamId: "stream:binding",
    anchorKey: "anchor:binding:original",
    tenantId: "tenant:one",
    collectiveId: "collective:one",
    policy: telemetryPolicy,
    authenticity: signing,
    store: new InMemoryCollectiveTelemetryStoreV1(),
    monotonicAnchor: new InMemoryCollectiveTelemetryMonotonicAnchorV1(),
  });
  const state = await original.initialize(1);
  const { policyDigest: _policyDigest, ...policyBody } = telemetryPolicy;
  const foreignPolicy = await createCollectiveTelemetryPolicyV1({
    ...policyBody,
    policyVersion: 2,
  });
  const passthroughStore = {
    async load() {
      return structuredClone(state);
    },
    async save() {
      return false;
    },
  };
  const variants = [
    { streamId: "stream:other" },
    { tenantId: "tenant:other" },
    { collectiveId: "collective:other" },
    { authenticity: authenticity("peer:other") },
    {
      authenticity: {
        ...signing,
        instanceId: "instance:other",
      },
    },
    {
      authenticity: {
        ...signing,
        keyId: "key:other",
      },
    },
    { policy: foreignPolicy },
  ];
  for (const variant of variants) {
    const runtime = new CollectiveTelemetryRuntimeV1({
      streamId: "stream:binding",
      anchorKey: "anchor:binding:variant",
      tenantId: "tenant:one",
      collectiveId: "collective:one",
      policy: telemetryPolicy,
      authenticity: signing,
      store: passthroughStore,
      monotonicAnchor: new InMemoryCollectiveTelemetryMonotonicAnchorV1(),
      ...variant,
    });
    await assert.rejects(runtime.load(), /binding changed/);
  }
});

test("monotonic anchor rejects a valid but rolled-back state snapshot", async () => {
  const versions = [];
  let current = null;
  const store = {
    async load() {
      return current;
    },
    async save(state, expectedRevision, expectedStateDigest) {
      if (
        (current?.revision ?? null) !== expectedRevision ||
        (current?.stateDigest ?? null) !== expectedStateDigest
      )
        return false;
      current = structuredClone(state);
      versions.push(current);
      return true;
    },
  };
  const signing = authenticity("peer:anchor");
  const telemetryPolicy = await policy();
  const runtime = new CollectiveTelemetryRuntimeV1({
    streamId: "stream:anchor",
    anchorKey: "anchor:rollback",
    tenantId: "tenant:one",
    collectiveId: "collective:one",
    policy: telemetryPolicy,
    authenticity: signing,
    store,
    monotonicAnchor: new InMemoryCollectiveTelemetryMonotonicAnchorV1(),
  });
  await runtime.initialize(1);
  await runtime.record({
    category: "planning",
    operation: "cycle.one",
    outcome: "completed",
    logicalTimeMs: 2,
    operationDigest: digest("f"),
  });
  await runtime.record({
    category: "planning",
    operation: "cycle.two",
    outcome: "completed",
    logicalTimeMs: 3,
    operationDigest: digest("0"),
  });
  current = versions[1];
  await assert.rejects(runtime.load(), /rollback or fork/);
});

async function anchorRaceRuntime(successorCount) {
  let current = null;
  const store = {
    async load() {
      return current && structuredClone(current);
    },
    async save(state, expectedRevision, expectedStateDigest) {
      if (
        (current?.revision ?? null) !== expectedRevision ||
        (current?.stateDigest ?? null) !== expectedStateDigest
      )
        return false;
      current = structuredClone(state);
      return true;
    },
  };
  const durableAnchor = new InMemoryCollectiveTelemetryMonotonicAnchorV1();
  let concurrent;
  let injected = false;
  const anchor = {
    load(anchorKey) {
      return durableAnchor.load(anchorKey);
    },
    async save(input) {
      if (input.anchor.revision === 1 && !injected) {
        injected = true;
        for (let index = 0; index < successorCount; index += 1)
          await concurrent.record({
            category: "planning",
            operation: `concurrent.${index + 1}`,
            outcome: "completed",
            logicalTimeMs: index + 3,
            operationDigest: digest(String(index + 7)),
          });
        return false;
      }
      return durableAnchor.save(input);
    },
  };
  const signing = authenticity("peer:race");
  const telemetryPolicy = await policy();
  const options = {
    streamId: "stream:race",
    anchorKey: "anchor:race",
    tenantId: "tenant:one",
    collectiveId: "collective:one",
    policy: telemetryPolicy,
    authenticity: signing,
    store,
    monotonicAnchor: anchor,
  };
  const runtime = new CollectiveTelemetryRuntimeV1(options);
  await runtime.initialize(1);
  concurrent = new CollectiveTelemetryRuntimeV1(options);
  return runtime;
}

test("anchor reconciliation accepts exactly one state-proven successor", async () => {
  const runtime = await anchorRaceRuntime(1);
  const event = await runtime.record({
    category: "planning",
    operation: "primary.one",
    outcome: "completed",
    logicalTimeMs: 2,
    operationDigest: digest("a"),
  });
  assert.equal(event.sequence, 1);
  assert.equal((await runtime.load()).sequence, 2);
});

test("anchor reconciliation fails closed when direct descent is not provable", async () => {
  const runtime = await anchorRaceRuntime(2);
  await assert.rejects(
    runtime.record({
      category: "planning",
      operation: "primary.one",
      outcome: "completed",
      logicalTimeMs: 2,
      operationDigest: digest("b"),
    }),
    /monotonic anchor update failed/,
  );
});
