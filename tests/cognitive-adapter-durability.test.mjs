import assert from "node:assert/strict";
import test from "node:test";

import {
  CognitiveAgentRuntimeV2,
  InMemoryCognitiveSessionStateStoreV2,
  createCognitiveOperationRequestV2,
  createWebCryptoCognitiveIntegrityV2,
} from "@agentplat/runtime/cognitive-adapter";
import { PortableAgentErrorV1 } from "@agentplat/runtime/adapter";

const integrity = createWebCryptoCognitiveIntegrityV2();

function portableManifest() {
  return {
    schemaVersion: 1,
    adapterId: "cognitive-adapter",
    adapterVersion: "2.0.0",
    implementationId: "cognitive-adapter.build",
    agentKinds: ["hybrid"],
    inputModalities: ["structured"],
    outputModalities: ["structured"],
    interactionModes: ["invoke"],
    controlPoints: ["post_output", "pre_step"],
    supportsCancellation: true,
    supportsCheckpoint: false,
    supportsRestore: false,
    maximumObservationBytes: 1_000_000,
    maximumOutputBytes: 1_000_000,
    maximumActionBytes: 1_000_000,
    maximumStepsPerSession: 100,
  };
}

function cognitiveManifest() {
  return {
    schemaVersion: 2,
    adapterId: "cognitive-adapter",
    adapterVersion: "2.0.0",
    implementationId: "cognitive-adapter.build",
    portable: portableManifest(),
    operations: ["memory_mutation", "observe", "tool"],
    controlSurfaces: ["memory", "tool"],
    supportsBlackBoxControl: true,
    supportsRepresentationControl: false,
    supportsMultimodalState: false,
    maximumOperationBytes: 1_000_000,
    maximumResultBytes: 1_000_000,
    maximumReceiptHistory: 8,
  };
}

function effectSink({ synchronizeFirstLookups = false } = {}) {
  const effects = new Map();
  let applyAttempts = 0;
  let logicalEffects = 0;
  let lookupCalls = 0;
  let waitingLookups = 0;
  let releaseLookups;
  const lookupBarrier = synchronizeFirstLookups
    ? new Promise((resolve) => {
        releaseLookups = resolve;
      })
    : null;
  return {
    protocol: "idempotent_effect_sink_v2",
    get applyAttempts() {
      return applyAttempts;
    },
    get logicalEffects() {
      return logicalEffects;
    },
    get lookupCalls() {
      return lookupCalls;
    },
    async lookup({ invocation }) {
      lookupCalls += 1;
      const existing = effects.get(invocation.idempotencyKey);
      if (existing && existing.requestDigest !== invocation.requestDigest)
        throw new Error("effect idempotency digest conflict");
      if (!existing && lookupBarrier) {
        waitingLookups += 1;
        if (waitingLookups === 2) releaseLookups();
        await lookupBarrier;
      }
      return effects.get(invocation.idempotencyKey)?.result ?? null;
    },
    async apply({ request, invocation }) {
      applyAttempts += 1;
      const result = await cognitiveResult(
        request.operationId,
        request.payload,
      );
      const existing = effects.get(invocation.idempotencyKey);
      if (existing) {
        if (existing.requestDigest !== invocation.requestDigest)
          throw new Error("effect idempotency digest conflict");
        return existing.result;
      }
      effects.set(invocation.idempotencyKey, {
        requestDigest: invocation.requestDigest,
        result,
      });
      logicalEffects += 1;
      return result;
    },
  };
}

function adapter(sink, directCalls = { count: 0 }) {
  return {
    manifest: cognitiveManifest(),
    portable: {},
    effectSink: sink,
    async execute(request) {
      directCalls.count += 1;
      return cognitiveResult(request.operationId, request.payload);
    },
  };
}

function runtime(store, sink, directCalls) {
  return new CognitiveAgentRuntimeV2({
    adapter: adapter(sink, directCalls),
    guard: { authorize: () => ({ allowed: true }) },
    store,
    maximumCommitAttempts: 8,
  });
}

async function request(overrides = {}) {
  return createCognitiveOperationRequestV2({
    schemaVersion: 2,
    operationId: "operation.effect",
    operation: "memory_mutation",
    tenantId: "tenant.one",
    sessionId: "session.one",
    agentId: "agent.one",
    expectedRevision: 0,
    logicalTimeMs: 10,
    payload: { mutation: "remember", value: 1 },
    authorityDigest: await integrity.digest("test-authority", { value: 1 }),
    roleBindingDigest: await integrity.digest("test-role", { value: 1 }),
    metadata: { source: "durability-test" },
    ...overrides,
  });
}

async function cognitiveResult(operationId, output) {
  return {
    schemaVersion: 2,
    operationId,
    status: "completed",
    output,
    outputDigest: await integrity.digest(
      "cognitive-operation-output-v2",
      output,
    ),
    reasonCode: "effect_applied",
    controlSurface: "memory",
  };
}

async function createSession(controller) {
  return controller.createSession({
    tenantId: "tenant.one",
    sessionId: "session.one",
    agentId: "agent.one",
  });
}

test("replicas share one durable reservation and one logical external effect", async () => {
  const store = new InMemoryCognitiveSessionStateStoreV2();
  const sink = effectSink({ synchronizeFirstLookups: true });
  const directCalls = { count: 0 };
  const firstReplica = runtime(store, sink, directCalls);
  const secondReplica = runtime(store, sink, directCalls);
  await createSession(firstReplica);
  const operation = await request();

  const [first, second] = await Promise.all([
    firstReplica.execute(operation, cognitiveContext()),
    secondReplica.execute(operation, cognitiveContext()),
  ]);

  assert.deepEqual(second, first);
  assert.equal(sink.logicalEffects, 1);
  assert.equal(sink.applyAttempts, 2);
  assert.equal(directCalls.count, 0);
  const journal = await store.loadOperation(operation);
  assert.equal(journal.status, "applied");
  assert.equal(journal.requestDigest.startsWith("sha256:"), true);
  assert.equal((await firstReplica.getSession("session.one")).revision, 1);
});

test("a replica reconciles a crash after the effect and before the atomic applied commit", async () => {
  const backing = new InMemoryCognitiveSessionStateStoreV2();
  let crashBeforeCommit = true;
  const crashingStore = {
    load: (sessionId) => backing.load(sessionId),
    save: (state, expectedRevision) => backing.save(state, expectedRevision),
    loadOperation: (input) => backing.loadOperation(input),
    prepareOperation: (input) => backing.prepareOperation(input),
    async commitOperation(input) {
      if (crashBeforeCommit) {
        crashBeforeCommit = false;
        throw new Error("simulated_crash_before_applied_commit");
      }
      return backing.commitOperation(input);
    },
  };
  const sink = effectSink();
  const firstReplica = runtime(crashingStore, sink);
  await createSession(firstReplica);
  const operation = await request();

  await assert.rejects(
    firstReplica.execute(operation, cognitiveContext()),
    /simulated_crash_before_applied_commit/u,
  );
  assert.equal((await backing.loadOperation(operation)).status, "prepared");
  assert.equal(sink.logicalEffects, 1);

  const successorReplica = runtime(crashingStore, sink);
  const recovered = await successorReplica.execute(
    operation,
    cognitiveContext(),
  );
  assert.equal(recovered.state.revision, 1);
  assert.equal(sink.logicalEffects, 1);
  assert.equal(sink.applyAttempts, 1);
  assert.equal(sink.lookupCalls >= 2, true);
  assert.equal((await backing.loadOperation(operation)).status, "applied");
});

test("the durable operation key rejects a replay with a different request digest", async () => {
  const store = new InMemoryCognitiveSessionStateStoreV2();
  const sink = effectSink();
  const controller = runtime(store, sink);
  await createSession(controller);
  const operation = await request();
  await controller.execute(operation, cognitiveContext());
  const conflicting = await request({
    payload: { mutation: "remember", value: 2 },
  });

  await assert.rejects(
    controller.execute(conflicting, cognitiveContext()),
    (error) =>
      error instanceof PortableAgentErrorV1 &&
      error.code === "STATE_CONFLICT" &&
      /request digest conflicts/u.test(error.message),
  );
  assert.equal(sink.logicalEffects, 1);
});

test("different operation ids cannot race effects for the same session revision", async () => {
  const store = new InMemoryCognitiveSessionStateStoreV2();
  const underlying = effectSink();
  let announceLookup;
  let releaseLookup;
  const lookupStarted = new Promise((resolve) => {
    announceLookup = resolve;
  });
  const lookupRelease = new Promise((resolve) => {
    releaseLookup = resolve;
  });
  const blockingSink = {
    protocol: "idempotent_effect_sink_v2",
    async lookup(input, context) {
      announceLookup();
      await lookupRelease;
      return underlying.lookup(input, context);
    },
    apply: (input, context) => underlying.apply(input, context),
  };
  const firstReplica = runtime(store, blockingSink);
  const secondReplica = runtime(store, blockingSink);
  await createSession(firstReplica);
  const firstRequest = await request({ operationId: "operation.first" });
  const competingRequest = await request({
    operationId: "operation.competing",
    payload: { mutation: "remember", value: 2 },
  });

  const firstExecution = firstReplica.execute(firstRequest, cognitiveContext());
  await lookupStarted;
  await assert.rejects(
    secondReplica.execute(competingRequest, cognitiveContext()),
    /reservation attempts exhausted/u,
  );
  assert.equal(await store.loadOperation(competingRequest), null);
  releaseLookup();
  await firstExecution;
  assert.equal(underlying.logicalEffects, 1);
});

test("an unavailable durable reservation prevents effect dispatch", async () => {
  const backing = new InMemoryCognitiveSessionStateStoreV2();
  const unavailableStore = {
    load: (sessionId) => backing.load(sessionId),
    save: (state, expectedRevision) => backing.save(state, expectedRevision),
    loadOperation: (input) => backing.loadOperation(input),
    async prepareOperation() {
      throw new Error("durable_reservation_unavailable");
    },
    commitOperation: (input) => backing.commitOperation(input),
  };
  const sink = effectSink();
  const controller = runtime(unavailableStore, sink);
  await createSession(controller);

  await assert.rejects(
    controller.execute(await request(), cognitiveContext()),
    /durable_reservation_unavailable/u,
  );
  assert.equal(sink.lookupCalls, 0);
  assert.equal(sink.applyAttempts, 0);
  assert.equal(sink.logicalEffects, 0);
});

test("effect-capable manifests fail closed without both durable store and sink", () => {
  const sink = effectSink();
  assert.throws(
    () =>
      new CognitiveAgentRuntimeV2({
        adapter: adapter(sink),
        guard: { authorize: () => ({ allowed: true }) },
      }),
    /explicit durable operation store/u,
  );
  assert.throws(
    () =>
      new CognitiveAgentRuntimeV2({
        adapter: { ...adapter(sink), effectSink: undefined },
        guard: { authorize: () => ({ allowed: true }) },
        store: new InMemoryCognitiveSessionStateStoreV2(),
      }),
    /idempotent effect sink with lookup/u,
  );
});

function cognitiveContext() {
  return {
    tenant: { tenantId: "tenant.one" },
    signal: new AbortController().signal,
  };
}
