import assert from "node:assert/strict";
import test from "node:test";

import {
  CollectiveHostTelemetryAdapterV1,
  compareCollectiveHostTelemetryOutboxEntriesV1,
  createCollectiveHostTelemetryOutboxEntryV1,
  drainCollectiveHostTelemetryOutboxV1,
  InMemoryAssuranceCoupledExecutionStoreV1,
  InMemoryAutonomousCollectiveNodeStoreV1,
  validateCollectiveHostTelemetryOutboxBatchV1,
  validateCollectiveHostTelemetryOutboxEntryV1,
} from "../dist/index.js";
import {
  claimCollectiveTelemetryDeliveryHandoffV1,
  CollectiveTelemetryRuntimeV1,
  InMemoryCollectiveTelemetryMonotonicAnchorV1,
  InMemoryCollectiveTelemetryStoreV1,
  createCollectiveTelemetryPolicyV1,
} from "../../audit/dist/collective-telemetry.js";

const digest = (character) => `sha256:${character.repeat(64)}`;

function event(operation, operationDigest, logicalTimeMs = 1) {
  return {
    category: operation === "semantic.horizon" ? "inference" : "execution",
    operation,
    outcome: "completed",
    logicalTimeMs,
    operationDigest,
    evidenceDigests: [operationDigest],
  };
}

async function entry({
  sourceKind = "autonomous_node",
  sourceId = "node:one",
  sourceSequence = 1,
  ordinal = 0,
  operation = "node.transition",
  operationDigest = digest("1"),
} = {}) {
  return createCollectiveHostTelemetryOutboxEntryV1({
    sourceKind,
    sourceId,
    sourceSequence,
    ordinal,
    event: event(operation, operationDigest, sourceSequence),
  });
}

class FaultableTelemetryStore extends InMemoryCollectiveTelemetryStoreV1 {
  events = [];
  failBeforeCommit = 0;
  crashAfterCommit = 0;
  crashAfterRelease = 0;

  async commitDelivery(input) {
    if (this.failBeforeCommit > 0) {
      this.failBeforeCommit -= 1;
      throw new Error("record unavailable");
    }
    const result = await super.commitDelivery(input);
    if (result === "committed") this.events.push(input.state.events.at(-1));
    if (this.crashAfterCommit > 0) {
      this.crashAfterCommit -= 1;
      throw new Error("crash after sink commit");
    }
    return result;
  }

  async releaseDelivery(streamId, deliveryDigest) {
    const result = await super.releaseDelivery(streamId, deliveryDigest);
    if (this.crashAfterRelease > 0) {
      this.crashAfterRelease -= 1;
      throw new Error("crash after receipt release");
    }
    return result;
  }
}

async function telemetry({
  failRecord = 0,
  store: suppliedStore,
  anchor: suppliedAnchor,
} = {}) {
  const store = suppliedStore ?? new FaultableTelemetryStore();
  store.failBeforeCommit = failRecord;
  const anchor =
    suppliedAnchor ?? new InMemoryCollectiveTelemetryMonotonicAnchorV1();
  const policy = await createCollectiveTelemetryPolicyV1({
    schemaVersion: 1,
    policyId: "policy:host-outbox",
    policyVersion: 1,
    allowedMetricKeys: [],
    maximumEvidenceDigestsPerEvent: 16,
    maximumMetricsPerEvent: 0,
    maximumRetainedEvents: 2,
    maximumCommitAttempts: 4,
  });
  const options = {
    streamId: "stream:host-outbox",
    anchorKey: "anchor:host-outbox",
    tenantId: "tenant:one",
    collectiveId: "collective:one",
    policy,
    authenticity: {
      peerId: "peer:one",
      instanceId: "instance:one",
      keyId: "key:one",
      async sign(value) {
        return `signed:${value}`;
      },
      async verify(input) {
        return input.signature === `signed:${input.messageDigest}`;
      },
    },
    store,
    monotonicAnchor: anchor,
  };
  const runtime = new CollectiveTelemetryRuntimeV1(options);
  await runtime.initialize(0);
  return {
    adapter: new CollectiveHostTelemetryAdapterV1(runtime),
    runtime,
    options,
    store,
    events: store.events,
    restart() {
      const restarted = new CollectiveTelemetryRuntimeV1(options);
      return {
        runtime: restarted,
        adapter: new CollectiveHostTelemetryAdapterV1(restarted),
      };
    },
  };
}

function nodeState(
  revision,
  previousStateDigest = null,
  runtimeId = "node:one",
) {
  return Object.freeze({
    schemaVersion: 1,
    runtimeId,
    status: revision === 0 ? "idle" : "accepted",
    revision,
    logicalTimeHighWaterMs: revision,
    previousStateDigest,
    stateDigest: revision === 0 ? digest("0") : digest(String(revision)),
  });
}

function receipt(semanticHorizonDecisionDigest) {
  return Object.freeze({
    schemaVersion: 1,
    executionId: "execution:one",
    executionInputDigest: digest("b"),
    receiptDigest: digest("c"),
    ...(semanticHorizonDecisionDigest ? { semanticHorizonDecisionDigest } : {}),
  });
}

async function nodeOutbox() {
  const store = new InMemoryAutonomousCollectiveNodeStoreV1();
  const pending = await entry();
  await store.save(nodeState(0), null);
  await store.saveWithTelemetry(nodeState(1, digest("0")), 0, [pending]);
  return { store, pending };
}

test("node commit survives crash before record and restart drains exactly once", async () => {
  const store = new InMemoryAutonomousCollectiveNodeStoreV1();
  assert.equal(await store.save(nodeState(0), null), true);
  const pending = await entry();
  assert.equal(
    await store.saveWithTelemetry(nodeState(1, digest("0")), 0, [pending]),
    true,
  );

  // Process stops here: domain state and outbox entry were already one commit.
  assert.equal((await store.load("node:one")).revision, 1);
  assert.deepEqual(await store.loadPendingTelemetry(), [pending]);

  const sink = await telemetry();
  assert.equal(
    await drainCollectiveHostTelemetryOutboxV1({
      store,
      telemetry: sink.adapter,
    }),
    1,
  );
  assert.equal(
    await drainCollectiveHostTelemetryOutboxV1({
      store,
      telemetry: sink.adapter,
    }),
    0,
  );
  assert.equal(sink.events.length, 1);
});

test("record failure leaves receipt telemetry pending; retry preserves causal order", async () => {
  const store = new InMemoryAssuranceCoupledExecutionStoreV1();
  const committedReceipt = receipt(digest("d"));
  assert.equal(
    await store.reserve({
      executionId: committedReceipt.executionId,
      executionInputDigest: committedReceipt.executionInputDigest,
      reservationId: "reservation:one",
      logicalTimeMs: 1,
      reservedUntilLogicalMs: 10,
    }),
    true,
  );
  const execution = await entry({
    sourceKind: "assurance_execution",
    sourceId: committedReceipt.executionId,
    operation: "assurance.execution",
    operationDigest: committedReceipt.receiptDigest,
  });
  const horizon = await entry({
    sourceKind: "assurance_execution",
    sourceId: committedReceipt.executionId,
    ordinal: 1,
    operation: "semantic.horizon",
    operationDigest: digest("d"),
  });
  assert.equal(
    await store.completeWithTelemetry({
      executionId: committedReceipt.executionId,
      executionInputDigest: committedReceipt.executionInputDigest,
      reservationId: "reservation:one",
      receipt: committedReceipt,
      telemetry: [execution, horizon],
    }),
    true,
  );

  await assert.rejects(
    drainCollectiveHostTelemetryOutboxV1({
      store,
      telemetry: (await telemetry({ failRecord: 1 })).adapter,
    }),
    /record unavailable/u,
  );
  assert.equal((await store.loadPendingTelemetry()).length, 2);

  // A receipt replay first drains the durable pending facts, then returns it.
  const restartedSink = await telemetry();
  await drainCollectiveHostTelemetryOutboxV1({
    store,
    telemetry: restartedSink.adapter,
  });
  const replayed = (await store.load(committedReceipt.executionId)).receipt;
  assert.equal(replayed.receiptDigest, committedReceipt.receiptDigest);
  assert.deepEqual(
    restartedSink.events.map((value) => value.operation),
    ["assurance.execution", "semantic.horizon"],
  );
  assert.equal((await store.loadPendingTelemetry()).length, 0);
});

test("effect checkpoint survives lease takeover and advances monotonically before completion", async () => {
  const store = new InMemoryAssuranceCoupledExecutionStoreV1();
  const executionInputDigest = digest("b");
  const pendingReceipt = Object.freeze({
    ...receipt(null),
    status: "effect_failed",
    effectReceipt: null,
  });
  const gatePending = Object.freeze({
    schemaVersion: 1,
    phase: "gate_pending",
    executionId: "execution:one",
    executionInputDigest,
    pendingReceipt,
    effectReceipt: null,
    checkpointDigest: digest("d"),
  });
  const prepared = Object.freeze({
    ...gatePending,
    phase: "prepared",
    checkpointDigest: digest("c"),
  });
  assert.equal(
    await store.reserve({
      executionId: "execution:one",
      executionInputDigest,
      reservationId: "reservation:effect:first",
      logicalTimeMs: 1,
      reservedUntilLogicalMs: 2,
    }),
    true,
  );
  assert.equal(
    await store.checkpointEffect({
      executionId: "execution:one",
      executionInputDigest,
      reservationId: "reservation:effect:first",
      checkpoint: gatePending,
    }),
    true,
  );
  assert.equal(
    await store.release({
      executionId: "execution:one",
      executionInputDigest,
      reservationId: "reservation:effect:first",
    }),
    false,
  );
  assert.equal(
    await store.reserve({
      executionId: "execution:one",
      executionInputDigest,
      reservationId: "reservation:effect:restart",
      logicalTimeMs: 3,
      reservedUntilLogicalMs: 4,
    }),
    true,
  );
  assert.equal(
    await store.checkpointEffect({
      executionId: "execution:one",
      executionInputDigest,
      reservationId: "reservation:effect:first",
      checkpoint: gatePending,
    }),
    false,
  );
  assert.deepEqual(
    (await store.load("execution:one")).effectCheckpoint,
    gatePending,
  );
  assert.equal(
    await store.checkpointEffect({
      executionId: "execution:one",
      executionInputDigest,
      reservationId: "reservation:effect:restart",
      checkpoint: prepared,
    }),
    true,
  );
  const effectReceipt = Object.freeze({ receiptDigest: digest("e") });
  const committed = Object.freeze({
    ...prepared,
    phase: "effect_committed",
    effectReceipt,
    checkpointDigest: digest("f"),
  });
  assert.equal(
    await store.checkpointEffect({
      executionId: "execution:one",
      executionInputDigest,
      reservationId: "reservation:effect:restart",
      checkpoint: committed,
    }),
    true,
  );
  assert.equal(
    await store.checkpointEffect({
      executionId: "execution:one",
      executionInputDigest,
      reservationId: "reservation:effect:restart",
      checkpoint: { ...prepared, checkpointDigest: digest("0") },
    }),
    false,
  );
  const terminal = receipt(null);
  assert.equal(
    await store.complete({
      executionId: "execution:one",
      executionInputDigest,
      reservationId: "reservation:effect:restart",
      receipt: terminal,
    }),
    true,
  );
  const completed = await store.load("execution:one");
  assert.deepEqual(completed.effectCheckpoint, committed);
  assert.deepEqual(completed.receipt, terminal);
});

test("delivery receipt reconciles record-before-ACK without a duplicate", async () => {
  const { store } = await nodeOutbox();
  const auditStore = new FaultableTelemetryStore();
  auditStore.crashAfterCommit = 1;
  const sink = await telemetry({ store: auditStore });
  await assert.rejects(
    drainCollectiveHostTelemetryOutboxV1({
      store,
      telemetry: sink.adapter,
    }),
    /crash after sink commit/u,
  );
  assert.equal(
    await drainCollectiveHostTelemetryOutboxV1({
      store,
      telemetry: sink.restart().adapter,
    }),
    1,
  );
  assert.equal(sink.events.length, 1);
});

test("crash after sink commit reconciles anchor and never duplicates", async () => {
  const { store, pending } = await nodeOutbox();
  const auditStore = new FaultableTelemetryStore();
  auditStore.crashAfterCommit = 1;
  const sink = await telemetry({ store: auditStore });
  await assert.rejects(
    drainCollectiveHostTelemetryOutboxV1({
      store,
      telemetry: sink.adapter,
    }),
    /crash after sink commit/u,
  );
  assert.equal(
    (await store.loadPendingTelemetry())[0].deliveryState,
    "pending",
  );
  assert.ok(
    await auditStore.loadDelivery("stream:host-outbox", pending.deliveryDigest),
  );

  const restarted = sink.restart();
  assert.equal(
    await drainCollectiveHostTelemetryOutboxV1({
      store,
      telemetry: restarted.adapter,
    }),
    1,
  );
  assert.equal(auditStore.events.length, 1);
  assert.equal((await restarted.runtime.load()).sequence, 1);
});

test("delivery receipt remains idempotent after its event leaves retention", async () => {
  const { store } = await nodeOutbox();
  const auditStore = new FaultableTelemetryStore();
  auditStore.crashAfterCommit = 1;
  const sink = await telemetry({ store: auditStore });
  await assert.rejects(
    drainCollectiveHostTelemetryOutboxV1({
      store,
      telemetry: sink.adapter,
    }),
    /crash after sink commit/u,
  );
  const restarted = sink.restart();
  for (let logicalTimeMs = 2; logicalTimeMs <= 4; logicalTimeMs += 1) {
    await restarted.runtime.record({
      category: "control",
      operation: `retention.${logicalTimeMs}`,
      outcome: "completed",
      logicalTimeMs,
      operationDigest: digest(String(logicalTimeMs)),
    });
  }
  const before = await restarted.runtime.load();
  assert.equal(before.sequence, 4);
  assert.ok(before.retainedFromSequence > 1);

  assert.equal(
    await drainCollectiveHostTelemetryOutboxV1({
      store,
      telemetry: sink.restart().adapter,
    }),
    1,
  );
  assert.equal((await sink.restart().runtime.load()).sequence, 4);
  assert.equal(auditStore.events.length, 1);
});

test("sink receipt capacity is bounded and release restores progress", async () => {
  const auditStore = new FaultableTelemetryStore(1);
  const sink = await telemetry({ store: auditStore });
  const first = await nodeOutbox();
  const secondStore = new InMemoryAutonomousCollectiveNodeStoreV1();
  const second = await entry({
    sourceId: "node:two",
    operationDigest: digest("1"),
  });
  await secondStore.save(nodeState(0, null, "node:two"), null);
  await secondStore.saveWithTelemetry(
    nodeState(1, digest("0"), "node:two"),
    0,
    [second],
  );
  const refuseMark = {
    loadPendingTelemetry: first.store.loadPendingTelemetry.bind(first.store),
    async markTelemetryRecorded() {
      return false;
    },
    acknowledgeTelemetry: first.store.acknowledgeTelemetry.bind(first.store),
  };
  await assert.rejects(
    drainCollectiveHostTelemetryOutboxV1({
      store: refuseMark,
      telemetry: sink.adapter,
    }),
    /recorded handoff conflict/u,
  );
  await assert.rejects(
    drainCollectiveHostTelemetryOutboxV1({
      store: secondStore,
      telemetry: sink.restart().adapter,
    }),
    /receipt capacity exhausted/u,
  );
  assert.equal((await sink.runtime.load()).sequence, 1);
  assert.equal(
    await drainCollectiveHostTelemetryOutboxV1({
      store: first.store,
      telemetry: sink.restart().adapter,
    }),
    1,
  );
  assert.equal(
    await drainCollectiveHostTelemetryOutboxV1({
      store: secondStore,
      telemetry: sink.restart().adapter,
    }),
    1,
  );
  assert.equal((await sink.runtime.load()).sequence, 2);
});

test("existing receipt cannot bypass a conflicting monotonic anchor", async () => {
  class ConflictingAnchor extends InMemoryCollectiveTelemetryMonotonicAnchorV1 {
    failNextSave = false;
    conflict = false;
    async save(input) {
      if (this.failNextSave) {
        this.failNextSave = false;
        this.conflict = true;
        return false;
      }
      return super.save(input);
    }
    async load(anchorKey) {
      if (this.conflict)
        return {
          revision: 1,
          sequence: 1,
          stateDigest: digest("9"),
          logicalTimeHighWaterMs: 1,
        };
      return super.load(anchorKey);
    }
  }
  const { store, pending } = await nodeOutbox();
  const anchor = new ConflictingAnchor();
  const sink = await telemetry({ anchor });
  anchor.failNextSave = true;
  await assert.rejects(
    drainCollectiveHostTelemetryOutboxV1({
      store,
      telemetry: sink.adapter,
    }),
    /anchor update failed/u,
  );
  assert.ok(
    await sink.store.loadDelivery("stream:host-outbox", pending.deliveryDigest),
  );
  await assert.rejects(
    drainCollectiveHostTelemetryOutboxV1({
      store,
      telemetry: sink.restart().adapter,
    }),
    /rollback or fork/u,
  );
  assert.equal(
    (await store.loadPendingTelemetry())[0].deliveryState,
    "pending",
  );
  assert.ok(
    await sink.store.loadDelivery("stream:host-outbox", pending.deliveryDigest),
  );
});

test("crash after source mark resumes with release and ACK only", async () => {
  const { store, pending } = await nodeOutbox();
  const sink = await telemetry();
  let crash = true;
  const crashingStore = {
    loadPendingTelemetry: store.loadPendingTelemetry.bind(store),
    acknowledgeTelemetry: store.acknowledgeTelemetry.bind(store),
    async markTelemetryRecorded(deliveryDigest) {
      const marked = await store.markTelemetryRecorded(deliveryDigest);
      if (crash) {
        crash = false;
        throw new Error("crash after source mark");
      }
      return marked;
    },
  };
  await assert.rejects(
    drainCollectiveHostTelemetryOutboxV1({
      store: crashingStore,
      telemetry: sink.adapter,
    }),
    /crash after source mark/u,
  );
  assert.equal(
    (await store.loadPendingTelemetry())[0].deliveryState,
    "recorded",
  );
  assert.ok(
    await sink.store.loadDelivery("stream:host-outbox", pending.deliveryDigest),
  );
  assert.equal(
    await drainCollectiveHostTelemetryOutboxV1({
      store,
      telemetry: sink.restart().adapter,
    }),
    1,
  );
  assert.equal(sink.events.length, 1);
});

test("crash after receipt release resumes at idempotent release and ACK", async () => {
  const { store, pending } = await nodeOutbox();
  const auditStore = new FaultableTelemetryStore();
  auditStore.crashAfterRelease = 1;
  const sink = await telemetry({ store: auditStore });
  await assert.rejects(
    drainCollectiveHostTelemetryOutboxV1({
      store,
      telemetry: sink.adapter,
    }),
    /crash after receipt release/u,
  );
  assert.equal(
    (await store.loadPendingTelemetry())[0].deliveryState,
    "recorded",
  );
  assert.equal(
    await auditStore.loadDelivery("stream:host-outbox", pending.deliveryDigest),
    null,
  );
  assert.equal(
    await drainCollectiveHostTelemetryOutboxV1({
      store,
      telemetry: sink.restart().adapter,
    }),
    1,
  );
  assert.equal(auditStore.events.length, 1);
});

test("crash after source ACK leaves no receipt or envelope", async () => {
  const { store, pending } = await nodeOutbox();
  const sink = await telemetry();
  let crash = true;
  const crashingStore = {
    loadPendingTelemetry: store.loadPendingTelemetry.bind(store),
    markTelemetryRecorded: store.markTelemetryRecorded.bind(store),
    async acknowledgeTelemetry(deliveryDigest) {
      const acknowledged = await store.acknowledgeTelemetry(deliveryDigest);
      if (crash) {
        crash = false;
        throw new Error("crash after source ACK");
      }
      return acknowledged;
    },
  };
  await assert.rejects(
    drainCollectiveHostTelemetryOutboxV1({
      store: crashingStore,
      telemetry: sink.adapter,
    }),
    /crash after source ACK/u,
  );
  assert.equal((await store.loadPendingTelemetry()).length, 0);
  assert.equal(
    await sink.store.loadDelivery("stream:host-outbox", pending.deliveryDigest),
    null,
  );
  assert.equal(
    await drainCollectiveHostTelemetryOutboxV1({
      store,
      telemetry: sink.restart().adapter,
    }),
    0,
  );
  assert.equal(sink.events.length, 1);
});

test("mark conflict is fail-closed and retains the sink receipt", async () => {
  const { store, pending } = await nodeOutbox();
  const sink = await telemetry();
  const conflictingStore = {
    loadPendingTelemetry: store.loadPendingTelemetry.bind(store),
    async markTelemetryRecorded() {
      return false;
    },
    acknowledgeTelemetry: store.acknowledgeTelemetry.bind(store),
  };
  await assert.rejects(
    drainCollectiveHostTelemetryOutboxV1({
      store: conflictingStore,
      telemetry: sink.adapter,
    }),
    /recorded handoff conflict/u,
  );
  assert.equal(
    (await store.loadPendingTelemetry())[0].deliveryState,
    "pending",
  );
  assert.ok(
    await sink.store.loadDelivery("stream:host-outbox", pending.deliveryDigest),
  );
});

test("ACK conflict leaves a recorded envelope that retries without recording", async () => {
  const { store, pending } = await nodeOutbox();
  const sink = await telemetry();
  const conflictingStore = {
    loadPendingTelemetry: store.loadPendingTelemetry.bind(store),
    markTelemetryRecorded: store.markTelemetryRecorded.bind(store),
    async acknowledgeTelemetry() {
      return false;
    },
  };
  assert.equal(
    await drainCollectiveHostTelemetryOutboxV1({
      store: conflictingStore,
      telemetry: sink.adapter,
    }),
    0,
  );
  assert.equal(
    (await store.loadPendingTelemetry())[0].deliveryState,
    "recorded",
  );
  assert.equal(
    await sink.store.loadDelivery("stream:host-outbox", pending.deliveryDigest),
    null,
  );
  assert.equal(
    await drainCollectiveHostTelemetryOutboxV1({
      store,
      telemetry: sink.restart().adapter,
    }),
    1,
  );
  assert.equal(sink.events.length, 1);
});

test("durable drain rejects structural ports and ignores adapter overrides", async () => {
  const first = await nodeOutbox();
  const fake = {
    durableDeliveryConfigured: true,
    async record() {},
    async recordDelivery() {},
    async releaseDelivery() {},
  };
  await assert.rejects(
    drainCollectiveHostTelemetryOutboxV1({
      store: first.store,
      telemetry: fake,
    }),
    /receipt lookup|required|nominal/u,
  );

  const fakeRuntimeAdapter = new CollectiveHostTelemetryAdapterV1({
    supportsDurableDelivery() {
      return true;
    },
    async record() {},
  });
  await assert.rejects(
    drainCollectiveHostTelemetryOutboxV1({
      store: first.store,
      telemetry: fakeRuntimeAdapter,
    }),
    /nominal/u,
  );

  const second = await nodeOutbox();
  const sink = await telemetry();
  assert.equal("recordDelivery" in sink.runtime, false);
  assert.equal("releaseDelivery" in sink.runtime, false);
  assert.equal("options" in sink.runtime, false);
  assert.equal("recordDelivery" in sink.adapter, false);
  assert.equal("releaseDelivery" in sink.adapter, false);
  assert.equal("runtime" in sink.adapter, false);
  assert.equal("durableDeliveryConfigured" in sink.adapter, false);
  assert.throws(
    () => claimCollectiveTelemetryDeliveryHandoffV1(sink.runtime),
    /already claimed/u,
  );
  const preemptedRuntime = new CollectiveTelemetryRuntimeV1({
    ...sink.options,
    streamId: "stream:preempted-bridge",
    anchorKey: "anchor:preempted-bridge",
  });
  assert.equal(
    typeof claimCollectiveTelemetryDeliveryHandoffV1(preemptedRuntime),
    "function",
  );
  assert.throws(
    () => new CollectiveHostTelemetryAdapterV1(preemptedRuntime),
    /already claimed/u,
  );
  sink.runtime.record = async () => {
    throw new Error("runtime monkey patch executed");
  };
  sink.runtime.load = async () => {
    throw new Error("runtime load monkey patch executed");
  };
  sink.adapter.record = async () => {
    throw new Error("adapter monkey patch executed");
  };
  sink.options.authenticity.peerId = "peer:patched";
  sink.options.authenticity.sign = async () => {
    throw new Error("authenticity sign monkey patch executed");
  };
  sink.options.authenticity.verify = async () => {
    throw new Error("authenticity verify monkey patch executed");
  };
  sink.options.monotonicAnchor.load = async () => {
    throw new Error("anchor load monkey patch executed");
  };
  sink.options.monotonicAnchor.save = async () => {
    throw new Error("anchor save monkey patch executed");
  };
  sink.options.store.load = async () => {
    throw new Error("store load monkey patch executed");
  };
  sink.options.store.save = async () => {
    throw new Error("store save monkey patch executed");
  };
  sink.options.store.commitDelivery = async () => {
    throw new Error("store commit monkey patch executed");
  };
  sink.options.store.loadDelivery = async () => {
    throw new Error("store receipt load monkey patch executed");
  };
  sink.options.store.releaseDelivery = async () => {
    throw new Error("store receipt release monkey patch executed");
  };
  assert.equal(
    await drainCollectiveHostTelemetryOutboxV1({
      store: second.store,
      telemetry: sink.adapter,
    }),
    1,
  );
  assert.equal(sink.events.length, 1);

  class OverridingRuntime extends CollectiveTelemetryRuntimeV1 {
    supportsDurableDelivery() {
      return false;
    }
    async record() {
      throw new Error("subclass record override executed");
    }
    async load() {
      throw new Error("subclass load override executed");
    }
  }
  const third = await nodeOutbox();
  const subclassSink = await telemetry();
  const overridingRuntime = new OverridingRuntime(subclassSink.options);
  const overridingAdapter = new CollectiveHostTelemetryAdapterV1(
    overridingRuntime,
  );
  assert.equal(
    await drainCollectiveHostTelemetryOutboxV1({
      store: third.store,
      telemetry: overridingAdapter,
    }),
    1,
  );
  assert.equal(subclassSink.events.length, 1);

  class OverridingAdapter extends CollectiveHostTelemetryAdapterV1 {
    async record() {
      throw new Error("adapter subclass override executed");
    }
  }
  const fourth = await nodeOutbox();
  const adapterSubclassSink = await telemetry();
  assert.equal(
    await drainCollectiveHostTelemetryOutboxV1({
      store: fourth.store,
      telemetry: new OverridingAdapter(
        new CollectiveTelemetryRuntimeV1(adapterSubclassSink.options),
      ),
    }),
    1,
  );
  assert.equal(adapterSubclassSink.events.length, 1);
});

test("outbox capacity fails closed and never evicts a pending event", async () => {
  const store = new InMemoryAutonomousCollectiveNodeStoreV1(1);
  const first = await entry();
  const second = await entry({
    sourceSequence: 2,
    operationDigest: digest("2"),
  });
  await store.save(nodeState(0), null);
  await store.saveWithTelemetry(nodeState(1, digest("0")), 0, [first]);
  await assert.rejects(
    store.saveWithTelemetry(nodeState(2, digest("1")), 1, [second]),
    /outbox capacity exhausted/u,
  );
  assert.equal((await store.load("node:one")).revision, 1);
  assert.deepEqual(await store.loadPendingTelemetry(), [first]);
});

test("assurance receipt is not committed when its ordered batch exceeds capacity", async () => {
  const store = new InMemoryAssuranceCoupledExecutionStoreV1(10, 1);
  const committedReceipt = receipt(digest("f"));
  await store.reserve({
    executionId: committedReceipt.executionId,
    executionInputDigest: committedReceipt.executionInputDigest,
    reservationId: "reservation:capacity",
    logicalTimeMs: 1,
    reservedUntilLogicalMs: 10,
  });
  const execution = await entry({
    sourceKind: "assurance_execution",
    sourceId: committedReceipt.executionId,
    operation: "assurance.execution",
    operationDigest: committedReceipt.receiptDigest,
  });
  const horizon = await entry({
    sourceKind: "assurance_execution",
    sourceId: committedReceipt.executionId,
    ordinal: 1,
    operation: "semantic.horizon",
    operationDigest: digest("f"),
  });
  await assert.rejects(
    store.completeWithTelemetry({
      executionId: committedReceipt.executionId,
      executionInputDigest: committedReceipt.executionInputDigest,
      reservationId: "reservation:capacity",
      receipt: committedReceipt,
      telemetry: [execution, horizon],
    }),
    /outbox capacity exhausted/u,
  );
  assert.equal((await store.load(committedReceipt.executionId)).receipt, null);
  assert.equal((await store.loadPendingTelemetry()).length, 0);
});

test("outbox validator rejects corruption and noncanonical envelopes", async () => {
  const valid = await entry();
  assert.equal(
    (await validateCollectiveHostTelemetryOutboxEntryV1(valid)).deliveryDigest,
    valid.deliveryDigest,
  );
  const withCrypto = await createCollectiveHostTelemetryOutboxEntryV1({
    sourceKind: "autonomous_node",
    sourceId: "node:crypto",
    sourceSequence: 1,
    ordinal: 0,
    event: event("node.transition", digest("c")),
    crypto: globalThis.crypto,
  });
  assert.equal(
    (
      await validateCollectiveHostTelemetryOutboxEntryV1(
        withCrypto,
        globalThis.crypto,
      )
    ).deliveryDigest,
    withCrypto.deliveryDigest,
  );

  const corruptedEvent = {
    ...valid,
    event: { ...valid.event, outcome: "failed" },
  };
  await assert.rejects(
    validateCollectiveHostTelemetryOutboxEntryV1(corruptedEvent),
    /delivery digest is invalid/u,
  );

  const reorderedEvidence = {
    ...valid,
    event: {
      ...valid.event,
      evidenceDigests: [...valid.event.evidenceDigests].reverse(),
    },
  };
  await assert.rejects(
    validateCollectiveHostTelemetryOutboxEntryV1(reorderedEvidence),
    /evidence is not canonical/u,
  );

  await assert.rejects(
    validateCollectiveHostTelemetryOutboxEntryV1({ ...valid, extra: true }),
    /entry fields are invalid/u,
  );
  const hiddenExtra = structuredClone(valid);
  Object.defineProperty(hiddenExtra, "hidden", {
    value: "unsigned-content",
    enumerable: false,
  });
  await assert.rejects(
    validateCollectiveHostTelemetryOutboxEntryV1(hiddenExtra),
    /entry fields are invalid/u,
  );
  const symbolExtra = structuredClone(valid);
  Object.defineProperty(symbolExtra, Symbol("unsigned"), {
    value: "unsigned-content",
    enumerable: false,
  });
  await assert.rejects(
    validateCollectiveHostTelemetryOutboxEntryV1(symbolExtra),
    /entry fields are invalid/u,
  );
  await assert.rejects(
    validateCollectiveHostTelemetryOutboxEntryV1({
      ...valid,
      event: { ...valid.event, extra: true },
    }),
    /event fields are invalid/u,
  );
});

test("outbox validation snapshots correlation before asynchronous digest work", async () => {
  const correlated = await createCollectiveHostTelemetryOutboxEntryV1({
    sourceKind: "autonomous_node",
    sourceId: "node:correlated",
    sourceSequence: 1,
    ordinal: 0,
    event: {
      ...event("node.transition", digest("8")),
      correlation: {
        missionId: "mission:one",
        cycleId: "cycle:original",
      },
    },
  });
  const mutable = structuredClone(correlated);
  const pending = validateCollectiveHostTelemetryOutboxEntryV1(mutable);
  mutable.event.correlation.cycleId = "cycle:mutated";
  const validated = await pending;
  assert.equal(validated.event.correlation.cycleId, "cycle:original");
  assert.equal(mutable.event.correlation.cycleId, "cycle:mutated");
});

test("in-memory enqueue rejects corruption before the domain commit", async () => {
  const store = new InMemoryAutonomousCollectiveNodeStoreV1();
  await store.save(nodeState(0), null);
  const valid = await entry();
  const corrupted = {
    ...valid,
    event: { ...valid.event, logicalTimeMs: 2 },
  };
  await assert.rejects(
    store.saveWithTelemetry(nodeState(1, digest("0")), 0, [corrupted]),
    /delivery digest is invalid/u,
  );
  assert.equal((await store.load("node:one")).revision, 0);
  assert.equal((await store.loadPendingTelemetry()).length, 0);
});

test("drain validates loaded envelopes before any sink or source mutation", async () => {
  const valid = await entry();
  const corrupted = {
    ...valid,
    sourceId: "node:corrupted",
  };
  let sourceMutation = false;
  const store = {
    async loadPendingTelemetry() {
      return [corrupted];
    },
    async markTelemetryRecorded() {
      sourceMutation = true;
      return true;
    },
    async acknowledgeTelemetry() {
      sourceMutation = true;
      return true;
    },
  };
  const sink = await telemetry();
  await assert.rejects(
    drainCollectiveHostTelemetryOutboxV1({
      store,
      telemetry: sink.adapter,
    }),
    /delivery digest is invalid/u,
  );
  assert.equal(sourceMutation, false);
  assert.equal((await sink.runtime.load()).sequence, 0);
});

test("canonical ordering is total and preserves each source sequence", async () => {
  const store = new InMemoryAutonomousCollectiveNodeStoreV1();
  for (const sourceId of ["node:z", "node:a"]) {
    await store.save(nodeState(0, null, sourceId), null);
    await store.saveWithTelemetry(nodeState(1, digest("0"), sourceId), 0, [
      await entry({ sourceId }),
    ]);
  }
  await store.saveWithTelemetry(nodeState(2, digest("1"), "node:a"), 1, [
    await entry({
      sourceId: "node:a",
      sourceSequence: 2,
      operationDigest: digest("2"),
    }),
  ]);
  const pending = await store.loadPendingTelemetry();
  assert.deepEqual(
    pending.map((value) => [value.sourceId, value.sourceSequence]),
    [
      ["node:a", 1],
      ["node:a", 2],
      ["node:z", 1],
    ],
  );
  assert.ok(
    pending.every(
      (value, index) =>
        index === 0 ||
        compareCollectiveHostTelemetryOutboxEntriesV1(
          pending[index - 1],
          value,
        ) < 0,
    ),
  );
});

test("batch validation rejects ordering, coordinate conflicts and gaps", async () => {
  const first = await entry({
    sourceKind: "assurance_execution",
    sourceId: "execution:batch",
    operation: "assurance.execution",
    operationDigest: digest("a"),
  });
  const second = await entry({
    sourceKind: "assurance_execution",
    sourceId: "execution:batch",
    ordinal: 1,
    operation: "semantic.horizon",
    operationDigest: digest("b"),
  });
  assert.equal(
    (await validateCollectiveHostTelemetryOutboxBatchV1([first, second]))
      .length,
    2,
  );
  await assert.rejects(
    validateCollectiveHostTelemetryOutboxBatchV1([second, first]),
    /order is not canonical/u,
  );
  await assert.rejects(
    validateCollectiveHostTelemetryOutboxBatchV1([second]),
    /batch is not contiguous/u,
  );

  const conflicting = await entry({ operationDigest: digest("9") });
  const conflictBatch = [await entry(), conflicting].sort(
    compareCollectiveHostTelemetryOutboxEntriesV1,
  );
  await assert.rejects(
    validateCollectiveHostTelemetryOutboxBatchV1(conflictBatch),
    /node telemetry batch is not contiguous/u,
  );
  await assert.rejects(
    validateCollectiveHostTelemetryOutboxBatchV1([
      {
        ...(await entry()),
        deliveryState: "recorded",
      },
    ]),
    /new telemetry outbox entry must be pending/u,
  );
});

test("drain fails closed when a store violates canonical load order", async () => {
  const first = await entry({ sourceId: "node:a" });
  const second = await entry({ sourceId: "node:z" });
  const sink = await telemetry();
  const reverseStore = {
    async loadPendingTelemetry() {
      return [second, first];
    },
    async markTelemetryRecorded() {
      return true;
    },
    async acknowledgeTelemetry() {
      return true;
    },
  };
  await assert.rejects(
    drainCollectiveHostTelemetryOutboxV1({
      store: reverseStore,
      telemetry: sink.adapter,
    }),
    /load order is not canonical/u,
  );
  assert.equal((await sink.runtime.load()).sequence, 0);
});

test("drain rejects two digests claiming the same source coordinate", async () => {
  const conflict = [
    await entry(),
    await entry({ operationDigest: digest("9") }),
  ].sort(compareCollectiveHostTelemetryOutboxEntriesV1);
  const sink = await telemetry();
  const conflictingStore = {
    async loadPendingTelemetry() {
      return conflict;
    },
    async markTelemetryRecorded() {
      return true;
    },
    async acknowledgeTelemetry() {
      return true;
    },
  };
  await assert.rejects(
    drainCollectiveHostTelemetryOutboxV1({
      store: conflictingStore,
      telemetry: sink.adapter,
    }),
    /source coordinate conflict/u,
  );
  assert.equal((await sink.runtime.load()).sequence, 0);
});
