import assert from "node:assert/strict";
import test from "node:test";

import {
  InMemoryInteropIdempotencyStoreV1,
  InMemoryInteropOutboundSequenceStoreV1,
  InteropClientV1,
  InteropEndpointRouterV1,
  InteropPortableAgentAdapterV1,
  InMemoryInteropPayloadSchemaResolverV1,
  InMemoryInteropSequenceStoreV1,
  createRestartDurableInteropRouterStoresV1,
  createInteropEndpointManifestV1,
  interopDigestV1,
} from "../dist/index.js";
import {
  GovernedInteropLifecycleV1,
  GovernedInteropRequestAdmissionV1,
  InMemoryGovernedInteropSessionStoreV1,
  createRestartDurableGovernedInteropRuntimeStoresV1,
  createReferenceGovernedInteropRuntimeV1,
  createInteropCapabilityProfileV1,
  createInteropRoleProfileV1,
  governedInteropSessionRecordKeyV1,
  isReferenceGovernedInteropRuntimeV1,
} from "../dist/governed-lifecycle.js";
import { GovernedAgentLifecycleRuntimeV1 } from "../../collective-membership/dist/governed-agent-lifecycle.js";
import {
  GovernedAgentLineageRuntimeV1,
  InMemoryAgentLineageStoreV1,
  collectiveMembershipDigestV1,
  createAgentCreationPolicyV1,
} from "../../collective-membership/dist/index.js";

function referenceTestStores(sessionStore) {
  return createRestartDurableGovernedInteropRuntimeStoresV1({
    sessionStore,
    outboundSequences: new InMemoryInteropOutboundSequenceStoreV1(),
    routerStores: createRestartDurableInteropRouterStoresV1({
      idempotency: new InMemoryInteropIdempotencyStoreV1(),
      sequences: new InMemoryInteropSequenceStoreV1(),
    }),
  });
}

test("governed interop negotiates, enrolls and gates every active adapter call", async () => {
  const fixture = await setup();
  const session = await fixture.governed.createAndEnroll(fixture.admission);

  assert.ok(session.adapter instanceof InteropPortableAgentAdapterV1);
  assert.equal(session.record.status, "active");
  assert.equal(fixture.lifecycleCalls.createAndEnroll, 0);
  const result = await session.adapter.step(
    {
      sessionId: fixture.admission.sessionId,
      stepSequence: 1,
      request: { stepId: "step:1", logicalTimeMs: 11 },
    },
    { signal: new AbortController().signal },
  );
  assert.deepEqual(result, { accepted: true });
  assert.deepEqual(fixture.lifecycleOverrideCalls, {
    createAndEnroll: 0,
    retirePeer: 0,
    eligibility: 0,
  });
  assert.equal(fixture.transport.exchangeCalls, 1);

  const reopened = await fixture.governed.openSession(
    fixture.admission.sessionId,
  );
  assert.equal(reopened.record.recordDigest, session.record.recordDigest);
  assert.equal(fixture.lifecycleCalls.createAndEnroll, 0);
});

test("governed interop ignores portable-adapter prototype substitution before session creation", async () => {
  const fixture = await setup();
  const prototype = InteropPortableAgentAdapterV1.prototype;
  const priorStep = Object.getOwnPropertyDescriptor(prototype, "step");
  let substitutedCalls = 0;
  Object.defineProperty(prototype, "step", {
    configurable: true,
    writable: true,
    value: async () => {
      substitutedCalls += 1;
      return { bypassed: true };
    },
  });
  try {
    const session = await fixture.governed.createAndEnroll(fixture.admission);
    const result = await session.adapter.step(
      {
        sessionId: fixture.admission.sessionId,
        stepSequence: 1,
        request: { stepId: "step:nominal", logicalTimeMs: 11 },
      },
      { signal: new AbortController().signal },
    );
    assert.deepEqual(result, { accepted: true });
    assert.equal(substitutedCalls, 0);
    assert.equal(fixture.transport.exchangeCalls, 1);
  } finally {
    if (priorStep) Object.defineProperty(prototype, "step", priorStep);
    else delete prototype.step;
  }
});

test("retirement converges idempotently and invalidates retained adapters", async () => {
  const fixture = await setup();
  const session = await fixture.governed.createAndEnroll(fixture.admission);
  const first = await fixture.governed.retire({
    sessionId: fixture.admission.sessionId,
    reasonCode: "operator_retirement",
    cascade: false,
    logicalTimeMs: 20,
  });
  const replay = await fixture.governed.retire({
    sessionId: fixture.admission.sessionId,
    reasonCode: "operator_retirement",
    cascade: false,
    logicalTimeMs: 20,
  });

  assert.equal(first.record.status, "retired");
  assert.equal(replay.record.recordDigest, first.record.recordDigest);
  assert.equal(fixture.lifecycleCalls.retirePeer, 1);
  assert.deepEqual(fixture.lifecycleOverrideCalls, {
    createAndEnroll: 0,
    retirePeer: 0,
    eligibility: 0,
  });
  await assert.rejects(
    session.adapter.step(
      {
        sessionId: fixture.admission.sessionId,
        stepSequence: 2,
        request: { stepId: "step:2", logicalTimeMs: 21 },
      },
      { signal: new AbortController().signal },
    ),
    /session is not active/,
  );
  assert.equal(InteropPortableAgentAdapterV1.prototype.step, undefined);
  assert.equal(fixture.transport.exchangeCalls, 0);
});

test("a governed lifecycle cannot open or retire another client issuer's session", async () => {
  const fixture = await setup();
  await fixture.governed.createAndEnroll(fixture.admission);
  const otherClient = new InteropClientV1({
    clientId: "host:other",
    transport: fixture.transport,
    schemas: fixture.schemas,
  });
  const other = new GovernedInteropLifecycleV1({
    client: otherClient,
    lifecycle: fixture.lifecycle,
    capabilityProfile: fixture.capabilityProfile,
    roleProfile: fixture.roleProfile,
    store: fixture.store,
  });

  await assert.rejects(
    other.openSession(fixture.admission.sessionId),
    /session ownership changed/u,
  );
  await assert.rejects(
    other.retire({
      sessionId: fixture.admission.sessionId,
      reasonCode: "cross_client_retirement",
      cascade: false,
      logicalTimeMs: 20,
    }),
    /session ownership changed/u,
  );
});

test("capability or role mismatch fails before lifecycle creation", async () => {
  const fixture = await setup();
  const incompatible = {
    ...fixture.admission,
    request: {
      ...fixture.admission.request,
      roleDefinitionDigest: digest("different-role"),
    },
  };
  await assert.rejects(
    fixture.governed.createAndEnroll(incompatible),
    /role profile binding/,
  );
  assert.equal(fixture.lifecycleCalls.createAndEnroll, 0);
});

test("authoritative governed interop rejects structural lifecycle adapters", async () => {
  const fixture = await setup();
  const structural = new FakeLifecycle(fixture.agent);

  assert.throws(
    () =>
      new GovernedInteropLifecycleV1({
        ...fixture.governed.options,
        lifecycle: structural,
      }),
    /concrete governed agent lifecycle runtime/,
  );
  assert.throws(
    () =>
      new GovernedInteropRequestAdmissionV1({
        lifecycle: structural,
        store: fixture.store,
        capabilityProfile: fixture.capabilityProfile,
        endpointManifest: fixture.manifest,
        roleProfile: fixture.roleProfile,
      }),
    /concrete governed interop request lifecycle/,
  );
});

test("governed interop uses library-owned lifecycle invokers", async () => {
  const fixture = await setup();

  for (const method of ["createAndEnroll", "retirePeer", "eligibility"])
    assert.throws(() => {
      fixture.lifecycle[method] = async () => {
        throw new Error(`monkey-patched ${method} must not run`);
      };
    }, TypeError);

  await fixture.governed.createAndEnroll(fixture.admission);
  assert.deepEqual(fixture.lifecycleOverrideCalls, {
    createAndEnroll: 0,
    retirePeer: 0,
    eligibility: 0,
  });
});

test("governed interop captures construction-time clients, stores, profiles and lifecycle", async () => {
  const fixture = await setup({ signedRequests: true });
  const structural = new FakeLifecycle(fixture.agent);
  const replacementStore = new InMemoryGovernedInteropSessionStoreV1();
  const lifecycleOptions = {
    ...fixture.governed.options,
    store: replacementStore,
  };
  const governed = new GovernedInteropLifecycleV1(lifecycleOptions);
  lifecycleOptions.client = {
    async negotiate() {
      throw new Error("fake client");
    },
  };
  lifecycleOptions.lifecycle = structural;
  lifecycleOptions.capabilityProfile = {
    profileDigest: digest("fake-profile"),
  };
  lifecycleOptions.roleProfile = { profileDigest: digest("fake-role") };
  lifecycleOptions.store = {
    async load() {
      throw new Error("fake store");
    },
    async compareAndSet() {
      throw new Error("fake store");
    },
  };
  for (const property of [
    "client",
    "lifecycle",
    "capabilityProfile",
    "roleProfile",
    "store",
  ])
    assert.throws(() => {
      governed.options[property] = lifecycleOptions[property];
    }, TypeError);
  assert.throws(() => {
    governed.store = lifecycleOptions.store;
  }, TypeError);

  const session = await governed.createAndEnroll(fixture.admission);
  assert.equal(session.record.status, "active");
  assert.equal(fixture.lifecycleCalls.createAndEnroll, 0);

  const admissionOptions = {
    lifecycle: fixture.lifecycle,
    store: replacementStore,
    capabilityProfile: fixture.capabilityProfile,
    endpointManifest: fixture.manifest,
    roleProfile: fixture.roleProfile,
  };
  const admission = new GovernedInteropRequestAdmissionV1(admissionOptions);
  admissionOptions.lifecycle = structural;
  admissionOptions.store = lifecycleOptions.store;
  admissionOptions.capabilityProfile = lifecycleOptions.capabilityProfile;
  for (const property of ["lifecycle", "store", "capabilityProfile"])
    assert.throws(() => {
      admission.options[property] = admissionOptions[property];
    }, TypeError);

  let handlerCalls = 0;
  installGovernedRouter(
    fixture,
    async () => {
      handlerCalls += 1;
      return {
        status: "completed",
        reasonCode: "step_completed",
        payload: { accepted: true },
      };
    },
    admission,
  );
  const response = await fixture.client.invoke({
    requestId: "request:captured-options",
    idempotencyKey: "idempotency:captured-options",
    sessionId: fixture.admission.sessionId,
    operation: "agent.step",
    sequence: 1,
    logicalTimeMs: 11,
    deadlineLogicalMs: 100,
    payload: { step: 1 },
  });
  assert.equal(response.status, "completed");
  assert.equal(handlerCalls, 1);
});

test("client and router retain construction-time authority under nested method replacement", async () => {
  const fixture = await setup({ signedRequests: true });
  await fixture.governed.createAndEnroll(fixture.admission);
  const admission = new GovernedInteropRequestAdmissionV1({
    lifecycle: fixture.lifecycle,
    store: fixture.store,
    capabilityProfile: fixture.capabilityProfile,
    endpointManifest: fixture.manifest,
    roleProfile: fixture.roleProfile,
  });
  let handlerCalls = 0;
  const handler = {
    operation: "agent.step",
    async handle() {
      handlerCalls += 1;
      return {
        status: "completed",
        reasonCode: "step_completed",
        payload: { accepted: true },
      };
    },
  };
  const routerOptions = {
    localOnly: true,
    routerInstanceId: "router:captured-authority",
    manifest: fixture.manifest,
    handlers: [handler],
    admission,
    schemas: fixture.schemas,
    authenticity: authenticity(fixture.manifest.endpointId),
  };
  const router = new InteropEndpointRouterV1(routerOptions);
  fixture.transport.router = router;

  assert.throws(() => {
    admission.admit = async () => false;
  }, TypeError);
  assert.throws(() => {
    admission.revalidate = async () => false;
  }, TypeError);
  handler.handle = async () => {
    throw new Error("replacement handler must not run");
  };
  routerOptions.schemas.resolve = async () => {
    throw new Error("replacement schema resolver must not run");
  };
  routerOptions.authenticity.verify = async () => false;
  routerOptions.authenticity.sign = async () => "replacement";
  routerOptions.admission = { admit: async () => false };
  routerOptions.handlers = [];
  routerOptions.manifest = { ...fixture.manifest, operations: [] };
  fixture.transport.manifest = async () => {
    throw new Error("replacement transport manifest must not run");
  };
  fixture.transport.exchange = async () => {
    throw new Error("replacement transport exchange must not run");
  };
  for (const method of ["negotiate", "manifest", "invoke"])
    assert.throws(() => {
      fixture.client[method] = async () => {
        throw new Error(`replacement client ${method} must not run`);
      };
    }, TypeError);

  const response = await fixture.client.invoke({
    requestId: "request:captured-authority",
    idempotencyKey: "idempotency:captured-authority",
    sessionId: fixture.admission.sessionId,
    operation: "agent.step",
    sequence: 1,
    logicalTimeMs: 11,
    deadlineLogicalMs: 100,
    payload: { step: 1 },
  });
  assert.equal(response.status, "completed");
  assert.equal(handlerCalls, 1);
});

test("reference governed interop composition forces nominal lifecycle admission and router paths", async () => {
  const fixture = await setup({ signedRequests: true });
  let handlerCalls = 0;
  const referenceOptions = {
    client: fixture.client,
    lifecycle: fixture.lifecycle,
    capabilityProfile: fixture.capabilityProfile,
    roleProfile: fixture.governed.options.roleProfile,
    durableStores: referenceTestStores(fixture.store),
    router: {
      routerInstanceId: "router:reference-governed",
      manifest: fixture.manifest,
      preparers: [
        {
          operation: "agent.step",
          async prepare({ request }) {
            return {
              effectId: request.requestDigest,
              payload: request.payload,
            };
          },
        },
      ],
      effects: {
        async commit() {
          handlerCalls += 1;
          return {
            status: "completed",
            reasonCode: "step_completed",
            payload: { accepted: true },
          };
        },
      },
      schemas: fixture.schemas,
      authenticity: authenticity(fixture.manifest.endpointId),
    },
  };
  assert.throws(
    () =>
      createReferenceGovernedInteropRuntimeV1({
        ...referenceOptions,
        durableStores: undefined,
      }),
    /exactly one localOnly or restart-durable store composition/u,
  );
  assert.throws(
    () =>
      createReferenceGovernedInteropRuntimeV1({
        ...referenceOptions,
        localOnly: true,
      }),
    /exactly one localOnly or restart-durable store composition/u,
  );
  assert.throws(
    () =>
      createReferenceGovernedInteropRuntimeV1({
        ...referenceOptions,
        durableStores: undefined,
        localOnly: true,
        store: fixture.store,
      }),
    /durability must be selected once at the top level/u,
  );
  assert.throws(
    () =>
      createReferenceGovernedInteropRuntimeV1({
        ...referenceOptions,
        router: { ...referenceOptions.router, localOnly: true },
      }),
    /durability must be selected once at the top level/u,
  );
  const localRuntime = createReferenceGovernedInteropRuntimeV1({
    ...referenceOptions,
    durableStores: undefined,
    localOnly: true,
  });
  assert.equal(
    localRuntime.store instanceof InMemoryGovernedInteropSessionStoreV1,
    true,
  );
  const runtime = createReferenceGovernedInteropRuntimeV1(referenceOptions);
  assert.equal(isReferenceGovernedInteropRuntimeV1(runtime), true);
  await runtime.createAndEnroll(fixture.admission);
  fixture.transport.router = { handle: runtime.handle };

  assert.throws(() => {
    runtime.admission.admit = async () => false;
  }, TypeError);
  assert.throws(() => {
    runtime.admission.revalidate = async () => false;
  }, TypeError);
  assert.throws(() => {
    runtime.router.handle = async () => {
      throw new Error("replacement router must not run");
    };
  }, TypeError);
  const response = await fixture.client.invoke({
    requestId: "request:reference-governed",
    idempotencyKey: "idempotency:reference-governed",
    sessionId: fixture.admission.sessionId,
    operation: "agent.step",
    sequence: 1,
    logicalTimeMs: 11,
    deadlineLogicalMs: 100,
    payload: { step: 1 },
  });
  assert.equal(response.status, "completed");
  assert.equal(handlerCalls, 1);
  const reopened = await runtime.openSession(fixture.admission.sessionId);
  assert.equal("gate" in reopened.adapter, false);
  assert.throws(() => {
    reopened.adapter.step = async () => ({ accepted: true });
  }, TypeError);
});

test("reference composition fences effects when lifecycle authority changes during preparation", async () => {
  const fixture = await setup({ signedRequests: true });
  let releasePreparation;
  let preparationEntered;
  let effectCalls = 0;
  const entered = new Promise((resolve) => {
    preparationEntered = resolve;
  });
  const release = new Promise((resolve) => {
    releasePreparation = resolve;
  });
  const runtime = createReferenceGovernedInteropRuntimeV1({
    client: fixture.client,
    lifecycle: fixture.lifecycle,
    capabilityProfile: fixture.capabilityProfile,
    roleProfile: fixture.roleProfile,
    durableStores: referenceTestStores(fixture.store),
    router: {
      routerInstanceId: "router:fenced-effect",
      manifest: fixture.manifest,
      preparers: [
        {
          operation: "agent.step",
          async prepare({ request }) {
            preparationEntered();
            await release;
            return {
              effectId: request.requestDigest,
              payload: request.payload,
            };
          },
        },
      ],
      effects: {
        async commit() {
          effectCalls += 1;
          return {
            status: "completed",
            reasonCode: "step_completed",
            payload: { accepted: true },
          };
        },
      },
      schemas: fixture.schemas,
      authenticity: authenticity(fixture.manifest.endpointId),
    },
  });
  await runtime.createAndEnroll(fixture.admission);
  fixture.transport.router = { handle: runtime.handle };
  const invocation = fixture.client.invoke({
    requestId: "request:fenced-effect",
    idempotencyKey: "idempotency:fenced-effect",
    sessionId: fixture.admission.sessionId,
    operation: "agent.step",
    sequence: 1,
    logicalTimeMs: 11,
    deadlineLogicalMs: 100,
    payload: { step: 1 },
  });
  await entered;
  await runtime.retire({
    sessionId: fixture.admission.sessionId,
    reasonCode: "authority_changed",
    cascade: false,
    logicalTimeMs: 12,
  });
  releasePreparation();

  const response = await invocation;
  assert.equal(response.status, "refused");
  assert.equal(response.reasonCode, "interop_request_admission_expired");
  assert.equal(effectCalls, 0);
});

test("reference composition validates the complete router manifest before lifecycle effects", async () => {
  const fixture = await setup({ signedRequests: true });
  const tamperedManifest = {
    ...fixture.manifest,
    inputSchemaDigest: digest("tampered-input-schema"),
  };
  const runtime = createReferenceGovernedInteropRuntimeV1({
    client: fixture.client,
    lifecycle: fixture.lifecycle,
    capabilityProfile: fixture.capabilityProfile,
    roleProfile: fixture.roleProfile,
    durableStores: referenceTestStores(fixture.store),
    router: {
      routerInstanceId: "router:invalid-manifest",
      manifest: tamperedManifest,
      preparers: [
        {
          operation: "agent.step",
          async prepare() {
            throw new Error("invalid manifest must never reach a preparer");
          },
        },
      ],
      effects: {
        async commit() {
          throw new Error("invalid manifest must never commit an effect");
        },
      },
      schemas: fixture.schemas,
      authenticity: authenticity(fixture.manifest.endpointId),
    },
  });

  await assert.rejects(
    runtime.createAndEnroll(fixture.admission),
    /manifest digest is invalid/,
  );
  assert.equal(fixture.lifecycleCalls.createAndEnroll, 0);
  assert.equal(
    await fixture.store.load(
      governedInteropSessionRecordKeyV1(fixture.admission.sessionId),
    ),
    null,
  );
});

test("reference admission validates the complete role profile before admitting a stored session", async () => {
  const fixture = await setup({ signedRequests: true });
  await fixture.governed.createAndEnroll(fixture.admission);
  let handlerCalls = 0;
  const tamperedRoleProfile = {
    ...fixture.roleProfile,
    roleDefinitionDigest: digest("tampered-role-definition"),
  };
  const runtime = createReferenceGovernedInteropRuntimeV1({
    client: fixture.client,
    lifecycle: fixture.lifecycle,
    capabilityProfile: fixture.capabilityProfile,
    roleProfile: tamperedRoleProfile,
    durableStores: referenceTestStores(fixture.store),
    router: {
      routerInstanceId: "router:invalid-role-profile",
      manifest: fixture.manifest,
      preparers: [
        {
          operation: "agent.step",
          async prepare({ request }) {
            return {
              effectId: request.requestDigest,
              payload: request.payload,
            };
          },
        },
      ],
      effects: {
        async commit() {
          handlerCalls += 1;
          return {
            status: "completed",
            reasonCode: "step_completed",
            payload: { accepted: true },
          };
        },
      },
      schemas: fixture.schemas,
      authenticity: authenticity(fixture.manifest.endpointId),
    },
  });
  fixture.transport.router = { handle: runtime.handle };

  await assert.rejects(
    fixture.client.invoke({
      requestId: "request:invalid-role-profile",
      idempotencyKey: "idempotency:invalid-role-profile",
      sessionId: fixture.admission.sessionId,
      operation: "agent.step",
      sequence: 1,
      logicalTimeMs: 11,
      deadlineLogicalMs: 100,
      payload: { step: 1 },
    }),
    /role profile digest is invalid/,
  );
  assert.equal(handlerCalls, 0);
});

test("in-memory governed session store enforces revision and digest CAS", async () => {
  const fixture = await setup();
  const session = await fixture.governed.createAndEnroll(fixture.admission);
  const key = governedInteropSessionRecordKeyV1(fixture.admission.sessionId);
  const store = fixture.store;
  assert.equal(
    await store.compareAndSet({
      recordKey: key,
      expectedRevision: 0,
      expectedRecordDigest: digest("stale"),
      next: session.record,
    }),
    false,
  );
  assert.equal(
    (await store.load(key)).recordDigest,
    session.record.recordDigest,
  );
});

test("router-side governed admission blocks wrapper bypass and cached output after retirement", async () => {
  const fixture = await setup({ signedRequests: true });
  const session = await fixture.governed.createAndEnroll(fixture.admission);
  let handlerCalls = 0;
  const { admission, grants } = installGovernedRouter(fixture, async () => {
    handlerCalls += 1;
    return {
      status: "completed",
      reasonCode: "step_completed",
      payload: { accepted: true },
    };
  });
  const invocation = {
    requestId: "request:governed:cached",
    idempotencyKey: "idempotency:governed:cached",
    sessionId: fixture.admission.sessionId,
    operation: "agent.step",
    sequence: 1,
    logicalTimeMs: 11,
    deadlineLogicalMs: 100,
    payload: { step: 1 },
  };

  const completed = await fixture.client.invoke(invocation);
  assert.equal(completed.status, "completed");
  assert.equal(handlerCalls, 1);
  assert.equal(grants.length, 1);
  assert.equal(grants[0].admitted, true);
  assert.equal(grants[0].scopeRevision, session.record.revision);
  assert.equal(grants[0].scopeEpoch, session.record.membershipEpoch);
  assert.equal(grants[0].scopeDigest, session.record.recordDigest);

  await fixture.governed.retire({
    sessionId: fixture.admission.sessionId,
    reasonCode: "operator_retirement",
    cascade: false,
    logicalTimeMs: 20,
  });
  const replay = await fixture.client.invoke(invocation);
  assert.equal(replay.status, "refused");
  assert.equal(replay.reasonCode, "interop_request_not_admitted");
  assert.equal(handlerCalls, 1);
  assert.equal(
    await admission.revalidate({
      request: grants[0].request,
      grant: grants[0],
    }),
    false,
  );
});

test("router revalidates lifecycle after the handler and withholds an in-flight result on retirement", async () => {
  const fixture = await setup({ signedRequests: true });
  await fixture.governed.createAndEnroll(fixture.admission);
  let releaseHandler;
  let handlerEntered;
  const entered = new Promise((resolve) => {
    handlerEntered = resolve;
  });
  const blocked = new Promise((resolve) => {
    releaseHandler = resolve;
  });
  let handlerCalls = 0;
  installGovernedRouter(fixture, async () => {
    handlerCalls += 1;
    handlerEntered();
    await blocked;
    return {
      status: "completed",
      reasonCode: "step_completed",
      payload: { accepted: true },
    };
  });

  const inFlight = fixture.client.invoke({
    requestId: "request:governed:race",
    idempotencyKey: "idempotency:governed:race",
    sessionId: fixture.admission.sessionId,
    operation: "agent.step",
    sequence: 1,
    logicalTimeMs: 11,
    deadlineLogicalMs: 100,
    payload: { step: 1 },
  });
  await entered;
  await fixture.governed.retire({
    sessionId: fixture.admission.sessionId,
    reasonCode: "operator_retirement",
    cascade: false,
    logicalTimeMs: 20,
  });
  releaseHandler();

  const response = await inFlight;
  assert.equal(response.status, "refused");
  assert.equal(response.reasonCode, "interop_request_admission_expired");
  assert.equal(response.payload, null);
  assert.equal(handlerCalls, 1);

  const bypass = await fixture.client.invoke({
    requestId: "request:governed:bypass",
    idempotencyKey: "idempotency:governed:bypass",
    sessionId: fixture.admission.sessionId,
    operation: "agent.step",
    sequence: 2,
    logicalTimeMs: 21,
    deadlineLogicalMs: 100,
    payload: { step: 2 },
  });
  assert.equal(bypass.status, "refused");
  assert.equal(bypass.reasonCode, "interop_request_not_admitted");
  assert.equal(handlerCalls, 1);
});

async function setup({ signedRequests = false } = {}) {
  const manifest = await createInteropEndpointManifestV1({
    endpointId: "endpoint:remote-agent",
    endpointVersion: "1.2.0",
    implementationId: "remote-agent:reference",
    endpointKind: "agent",
    operations: ["agent.step"],
    inputSchemaDigest: digest("input-schema"),
    outputSchemaDigest: digest("output-schema"),
    supportsCancellation: true,
    supportsDeterministicReplay: true,
    supportsCheckpoint: false,
    requiresRequestSignature: signedRequests,
    signsResponses: false,
    maximumRequestBytes: 65_536,
    maximumResponseBytes: 65_536,
    maximumStepsPerSession: 1_000,
  });
  const transport = {
    exchangeCalls: 0,
    router: null,
    async manifest() {
      return manifest;
    },
    async exchange(request, options = {}) {
      this.exchangeCalls += 1;
      if (this.router)
        return this.router.handle(request, {
          logicalTimeMs: request.logicalTimeMs,
          signal: options.signal ?? new AbortController().signal,
        });
      const payload = { accepted: true };
      const payloadDigest = await interopDigestV1("response-payload", payload);
      const body = {
        schemaVersion: 1,
        protocol: request.protocol,
        requestDigest: request.requestDigest,
        endpointId: manifest.endpointId,
        sessionId: request.sessionId,
        operation: request.operation,
        sequence: request.sequence,
        status: "completed",
        reasonCode: "step_completed",
        payload,
        payloadDigest,
      };
      return {
        ...body,
        responseDigest: await interopDigestV1("response", body),
        signature: null,
      };
    },
  };
  const schemas = new InMemoryInteropPayloadSchemaResolverV1([
    {
      schemaDigest: manifest.inputSchemaDigest,
      validate: async ({ operation, direction, payload }) =>
        operation === "agent.step" &&
        direction === "request" &&
        typeof payload === "object" &&
        payload !== null,
    },
    {
      schemaDigest: manifest.outputSchemaDigest,
      validate: async ({ operation, direction, payload }) =>
        operation === "agent.step" &&
        direction === "response" &&
        typeof payload === "object" &&
        payload !== null &&
        payload.accepted === true,
    },
  ]);
  const client = new InteropClientV1({
    clientId: "host:local",
    transport,
    schemas,
    ...(signedRequests ? { authenticity: authenticity("host:local") } : {}),
  });
  const capabilityProfile = await createInteropCapabilityProfileV1({
    profileId: "capability-profile:remote-agent",
    profileVersion: 1,
    adapterId: "interop-portable-agent",
    adapterVersion: "1.0.0",
    endpointId: manifest.endpointId,
    endpointVersion: manifest.endpointVersion,
    implementationId: manifest.implementationId,
    allowedEndpointKinds: ["agent"],
    requiredOperations: ["agent.step"],
    operationCapabilities: [
      {
        operation: "agent.step",
        capabilityKey: "capability:step",
      },
    ],
    requireCancellation: true,
    requireDeterministicReplay: true,
    requireCheckpoint: false,
    requireRequestSignature: signedRequests,
    requireResponseSignature: false,
  });
  const roleDefinitionDigest = digest("role-definition");
  const roleProfile = await createInteropRoleProfileV1({
    profileId: "role-profile:worker",
    profileVersion: 1,
    roleDefinitionDigest,
    allowedCapabilityProfileDigests: [capabilityProfile.profileDigest],
    requiredCapabilityKeys: ["capability:step"],
  });
  const request = {
    schemaVersion: 1,
    requestId: "creation:remote-agent",
    parentAgentId: "agent:root",
    requestedAgentId: "agent:remote",
    requestedPeerId: "peer:remote",
    requestedInstanceId: "instance:remote:1",
    factoryId: "factory:interop",
    adapterId: capabilityProfile.adapterId,
    adapterVersion: capabilityProfile.adapterVersion,
    capabilityKeys: ["capability:step"],
    roleDefinitionDigest,
    proposedAuthorityDigest: digest("child-authority"),
    parentAuthorityDigest: digest("parent-authority"),
    localRuleProgramDigest: digest("local-rules"),
    resourceBudgetUnits: 10,
    interactionBudgetUnits: 20,
    requestedAtLogicalMs: 10,
    expiresAtLogicalMs: 100,
    requestDigest: digest("creation-request"),
  };
  const lifecycleCalls = { createAndEnroll: 0, retirePeer: 0 };
  const lifecycleOverrideCalls = {
    createAndEnroll: 0,
    retirePeer: 0,
    eligibility: 0,
  };
  let currentMembership = {
    epoch: 2,
    configurationDigest: digest("membership-active"),
    members: [
      {
        peerId: request.requestedPeerId,
        instanceId: request.requestedInstanceId,
      },
    ],
  };
  const policy = await createAgentCreationPolicyV1({
    schemaVersion: 1,
    policyId: "policy:interop-test",
    policyVersion: 1,
    maximumGeneration: 4,
    maximumChildrenPerAgent: 4,
    maximumActiveDescendants: 8,
    maximumResourceUnitsPerChild: 100,
    maximumInteractionUnitsPerChild: 100,
    allowedAdapterIds: [request.adapterId],
    permittedCapabilityKeys: [...request.capabilityKeys],
    requireRulePolicyInheritance: true,
    requireAuthorityAttenuation: true,
    requestTtlLogicalMs: 100,
    maximumCommitAttempts: 4,
  });
  const root = await createLineageRecord({
    agentId: request.parentAgentId,
    peerId: "peer:root",
    instanceId: "instance:root",
    parentAgentId: null,
    rootAgentId: request.parentAgentId,
    generation: 0,
    factoryId: request.factoryId,
    adapterId: request.adapterId,
    adapterVersion: request.adapterVersion,
    capabilityKeys: [...request.capabilityKeys],
    roleDefinitionDigest,
    authorityDigest: request.parentAuthorityDigest,
    parentAuthorityDigest: null,
    localRuleProgramDigest: request.localRuleProgramDigest,
    resourceBudgetUnits: 100,
    interactionBudgetUnits: 100,
    publicKeyId: "key:root",
    publicKey: "public-key-root",
    creationCertificateDigest: digest("root-certificate"),
    membershipConfigurationDigest: digest("membership-root"),
    membershipEpoch: 1,
    status: "active",
    createdAtLogicalMs: 0,
  });
  const agent = await createLineageRecord({
    agentId: request.requestedAgentId,
    peerId: request.requestedPeerId,
    instanceId: request.requestedInstanceId,
    parentAgentId: request.parentAgentId,
    rootAgentId: request.parentAgentId,
    generation: 1,
    factoryId: request.factoryId,
    adapterId: request.adapterId,
    adapterVersion: request.adapterVersion,
    capabilityKeys: [...request.capabilityKeys],
    roleDefinitionDigest,
    authorityDigest: request.proposedAuthorityDigest,
    parentAuthorityDigest: request.parentAuthorityDigest,
    localRuleProgramDigest: request.localRuleProgramDigest,
    resourceBudgetUnits: request.resourceBudgetUnits,
    interactionBudgetUnits: request.interactionBudgetUnits,
    publicKeyId: "key:remote",
    publicKey: "public-key-remote",
    creationCertificateDigest: digest("certificate"),
    membershipConfigurationDigest: currentMembership.configurationDigest,
    membershipEpoch: currentMembership.epoch,
    status: "active",
    createdAtLogicalMs: request.requestedAtLogicalMs,
  });
  const stateBody = {
    schemaVersion: 1,
    stateKey: "lineage:interop-test",
    policyDigest: policy.policyDigest,
    revision: 0,
    fence: 1,
    agents: [root, agent],
    factoryReceiptDigests: [],
    terminationReceiptDigests: [],
    logicalTimeHighWaterMs: request.requestedAtLogicalMs,
    previousStateDigest: null,
  };
  const lineageStore = new InMemoryAgentLineageStoreV1();
  assert.equal(
    await lineageStore.save(
      {
        ...stateBody,
        stateDigest: await collectiveMembershipDigestV1({
          domain: "agent-lineage-state-v1",
          body: stateBody,
        }),
      },
      null,
    ),
    true,
  );
  const lineage = new GovernedAgentLineageRuntimeV1({
    stateKey: stateBody.stateKey,
    policy,
    store: lineageStore,
    factory: {
      factoryId: request.factoryId,
      factoryVersion: 1,
      factoryImplementationDigest: digest("factory-implementation"),
      async create() {
        lifecycleCalls.createAndEnroll += 1;
        throw new Error("pre-enrolled interop fixture must not create");
      },
      async terminate() {
        lifecycleCalls.retirePeer += 1;
        return { terminated: true, receiptDigest: digest("termination") };
      },
    },
    certification: {
      async verify() {
        return true;
      },
      async verifyAuthorityAttenuation() {
        return true;
      },
    },
    enrollment: {
      async enroll() {
        throw new Error("pre-enrolled interop fixture must not enroll");
      },
      async remove() {
        currentMembership = {
          epoch: 3,
          configurationDigest: digest("membership-retired"),
          members: [],
        };
        return {
          removed: true,
          membershipConfigurationDigest: currentMembership.configurationDigest,
          membershipEpoch: currentMembership.epoch,
        };
      },
    },
  });
  const registry = { current: () => currentMembership };
  class OverridingLifecycle extends GovernedAgentLifecycleRuntimeV1 {
    async createAndEnroll() {
      lifecycleOverrideCalls.createAndEnroll += 1;
      throw new Error("subclass create+enroll override must not run");
    }

    async retirePeer() {
      lifecycleOverrideCalls.retirePeer += 1;
      throw new Error("subclass retirement override must not run");
    }

    async eligibility() {
      lifecycleOverrideCalls.eligibility += 1;
      throw new Error("subclass eligibility override must not run");
    }
  }
  const lifecycle = new OverridingLifecycle({ lineage, registry });
  const store = new InMemoryGovernedInteropSessionStoreV1();
  const governed = new GovernedInteropLifecycleV1({
    client,
    lifecycle,
    capabilityProfile,
    roleProfile,
    store,
  });
  return {
    governed,
    manifest,
    schemas,
    client,
    capabilityProfile,
    roleProfile,
    agent,
    lifecycle,
    lifecycleCalls,
    lifecycleOverrideCalls,
    store,
    transport,
    admission: {
      admissionId: "admission:remote-agent",
      sessionId: "session:remote-agent",
      request,
      certificate: {
        schemaVersion: 1,
        certificateDigest: digest("certificate"),
      },
      activeKeyProof: { keyId: "key:remote", signature: "signed-proof" },
      logicalTimeMs: 10,
    },
  };
}

async function createLineageRecord(input) {
  const body = {
    schemaVersion: 1,
    ...input,
    validFrom: "2030-01-01T00:00:00.000Z",
    validUntil: "2031-01-01T00:00:00.000Z",
    terminatedAtLogicalMs: null,
    retirementMembershipConfigurationDigest: null,
    retirementMembershipEpoch: null,
  };
  return {
    ...body,
    lineageDigest: await collectiveMembershipDigestV1({
      domain: "agent-lineage-record-v1",
      body,
    }),
  };
}

function installGovernedRouter(fixture, handle, providedAdmission) {
  const governedAdmission =
    providedAdmission ??
    new GovernedInteropRequestAdmissionV1({
      lifecycle: fixture.lifecycle,
      store: fixture.store,
      capabilityProfile: fixture.capabilityProfile,
      endpointManifest: fixture.manifest,
      roleProfile: fixture.roleProfile,
    });
  const grants = [];
  const admission = {
    async admit(request) {
      const result = await governedAdmission.admit(request);
      if (result !== false) grants.push({ ...result, request });
      return result;
    },
    revalidate: (input) => governedAdmission.revalidate(input),
  };
  fixture.transport.router = new InteropEndpointRouterV1({
    localOnly: true,
    routerInstanceId: "router:governed",
    manifest: fixture.manifest,
    handlers: [{ operation: "agent.step", handle }],
    admission,
    schemas: fixture.schemas,
    authenticity: authenticity(fixture.manifest.endpointId),
  });
  return { admission: governedAdmission, grants };
}

function authenticity(localSignerId) {
  return {
    localSignerId,
    async sign(value) {
      return `signature:${localSignerId}:${value.slice(7)}`;
    },
    async verify({ signerId, digest: value, signature }) {
      return signature === `signature:${signerId}:${value.slice(7)}`;
    },
  };
}

class FakeLifecycle {
  createCalls = 0;
  retireCalls = 0;
  capabilityChecks = [];
  active = false;
  retired = false;

  constructor(agent) {
    this.agent = agent;
  }

  async createAndEnroll() {
    this.createCalls += 1;
    this.active = true;
    return this.agent;
  }

  async eligibility(input) {
    if (input.capabilityKey) this.capabilityChecks.push(input.capabilityKey);
    if (this.retired)
      return {
        eligible: false,
        reasonCode: "agent_inactive",
        agent: { ...this.agent, status: "terminated" },
        membershipEpoch: null,
        membershipConfigurationDigest: null,
      };
    if (!this.active)
      return {
        eligible: false,
        reasonCode: "agent_unknown",
        agent: null,
        membershipEpoch: null,
        membershipConfigurationDigest: null,
      };
    if (
      input.capabilityKey &&
      !this.agent.capabilityKeys.includes(input.capabilityKey)
    )
      return {
        eligible: false,
        reasonCode: "capability_unavailable",
        agent: this.agent,
        membershipEpoch: null,
        membershipConfigurationDigest: null,
      };
    return {
      eligible: true,
      reasonCode: "active_member",
      agent: this.agent,
      membershipEpoch: this.agent.membershipEpoch,
      membershipConfigurationDigest: this.agent.membershipConfigurationDigest,
    };
  }

  async retirePeer(input) {
    this.retireCalls += 1;
    this.retired = true;
    return {
      retired: true,
      peerId: this.agent.peerId,
      membershipConfigurationDigest: digest("membership-retired"),
      membershipEpoch: 3,
      retirementDigest: digest("lineage-retired"),
      retiredAtLogicalMs: input.logicalTimeMs,
    };
  }
}

function digest(value) {
  let state = 0x811c9dc5;
  for (const char of value) {
    state ^= char.codePointAt(0);
    state = Math.imul(state, 0x01000193) >>> 0;
  }
  return `sha256:${state.toString(16).padStart(8, "0").repeat(8)}`;
}
