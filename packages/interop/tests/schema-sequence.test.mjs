import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import test from "node:test";

import {
  PortableAgentAdapterRegistryV1,
  PortableAgentSessionRuntimeV1,
} from "@agentplat/runtime/adapter";

import {
  createRestartDurableInteropRouterStoresV1,
  InMemoryInteropOutboundSequenceStoreV1,
  InMemoryInteropPayloadSchemaResolverV1,
  InteropClientV1,
  InteropEndpointRouterV1,
  InteropPortableAgentAdapterV1,
  InteropSimulationEnvironmentClientV1,
  createInteropEndpointManifestV1,
  interopDigestV1,
} from "../dist/index.js";

test("client rejects a completed payload that violates the negotiated output schema", async () => {
  const fixture = await environmentFixture({ validOutput: false });
  const client = new InteropClientV1({
    clientId: "client:schema",
    transport: fixture.transport,
    schemas: fixture.schemas,
  });
  await assert.rejects(
    client.invoke({
      requestId: "request:schema:1",
      idempotencyKey: "idempotency:schema:1",
      sessionId: "session:schema",
      operation: "environment.reset",
      sequence: 1,
      logicalTimeMs: 1,
      deadlineLogicalMs: 10,
      payload: {},
    }),
    /response payload does not match/,
  );
});

test("shared outbound sequence state resumes across environment client instances", async () => {
  const fixture = await environmentFixture({ validOutput: true });
  const sequences = new InMemoryInteropOutboundSequenceStoreV1();
  const firstClient = new InteropClientV1({
    clientId: "client:resume",
    transport: fixture.transport,
    schemas: fixture.schemas,
  });
  const first = new InteropSimulationEnvironmentClientV1(
    firstClient,
    "session:resume",
    sequences,
  );
  await first.reset({}, 1);

  const restartedClient = new InteropClientV1({
    clientId: "client:resume",
    transport: fixture.transport,
    schemas: fixture.schemas,
  });
  const restarted = new InteropSimulationEnvironmentClientV1(
    restartedClient,
    "session:resume",
    sequences,
  );
  await restarted.reset({}, 2);

  assert.deepEqual(fixture.transport.sequences, [1, 2]);
  assert.equal(
    await sequences.current({
      issuerId: "client:resume",
      sessionId: "session:resume",
    }),
    2,
  );
});

test("outbound sequence allocation is stable for an exact idempotent retry", async () => {
  const sequences = new InMemoryInteropOutboundSequenceStoreV1();
  const allocation = {
    issuerId: "client:idempotent",
    sessionId: "session:idempotent",
    maximumSequence: 100,
    idempotencyKey: "request:idempotent:1",
  };

  assert.equal(await sequences.next(allocation), 1);
  assert.equal(await sequences.next(allocation), 1);
  assert.equal(await sequences.current(allocation), 1);
});

test("portable runtime transfers a step-zero checkpoint with positive envelope sequences", async () => {
  const fixture = await portableAgentFixture();
  const sequences = new InMemoryInteropOutboundSequenceStoreV1();
  const client = new InteropClientV1({
    clientId: "client:portable",
    transport: fixture.transport,
    schemas: fixture.schemas,
  });
  const adapter = new InteropPortableAgentAdapterV1(client, sequences);
  const registry = new PortableAgentAdapterRegistryV1().register({
    manifest: portableAdapterManifest(),
    adapter,
  });
  const runtime = new PortableAgentSessionRuntimeV1({
    registry,
    control: {
      controlId: "control:portable",
      controlVersion: 1,
      implementationId: "control:portable:build:1",
      evaluate: () => ({ disposition: "allow", reasonCode: "allowed" }),
    },
    clock: () => new Date("2030-01-01T00:00:00.000Z"),
  });

  await runtime.createSession(
    portableSessionInput("session:portable:source", "agent:portable:source"),
  );
  const paused = await runtime.pause("session:portable:source");
  assert.equal(paused.checkpoint.throughStepSequence, 0);
  const exported = await runtime.exportCheckpoint("session:portable:source");
  // A revision-zero transfer is valid protocol data and used to drive the
  // former import sequence=0 failure path explicitly.
  const transfer = Object.freeze({ ...exported, sourceSessionRevision: 0 });

  const target = await runtime.createSession(
    portableSessionInput("session:portable:target", "agent:portable:target"),
  );
  const imported = await runtime.importCheckpoint(
    target.sessionId,
    transfer,
    target.revision,
  );
  assert.equal(imported.status, "paused");
  assert.equal(imported.checkpoint.throughStepSequence, 0);
  const resumed = await runtime.resume(target.sessionId);
  assert.equal(resumed.status, "active");

  assert.deepEqual(
    fixture.transport.requests.map(({ sessionId, operation, sequence }) => [
      sessionId,
      operation,
      sequence,
    ]),
    [
      ["session:portable:source", "agent.checkpoint", 1],
      ["session:portable:source", "agent.checkpoint.export", 2],
      ["session:portable:target", "agent.checkpoint.import", 1],
      ["session:portable:target", "agent.restore", 2],
    ],
  );
  assert.equal(
    fixture.transport.requests.every(({ sequence }) => sequence >= 1),
    true,
  );
});

test("interop digests order Unicode keys by deterministic UTF-16 code units", async () => {
  const entries = [
    ["\uE000", "private-use"],
    ["💩", "astral"],
    ["é", "composed"],
    ["e\u0301", "decomposed"],
  ];
  const value = Object.fromEntries(entries);
  const reordered = Object.fromEntries([...entries].reverse());
  const ordered = [entries[3], entries[2], entries[1], entries[0]];
  const canonicalJson = `{${ordered
    .map(([key, item]) => `${JSON.stringify(key)}:${JSON.stringify(item)}`)
    .join(",")}}`;
  const expected = `sha256:${createHash("sha256")
    .update(`agentplat-interop-v1\u0000unicode-vector\u0000${canonicalJson}`)
    .digest("hex")}`;

  assert.equal(await interopDigestV1("unicode-vector", value), expected);
  assert.equal(await interopDigestV1("unicode-vector", reordered), expected);
});

test("client and router retain their construction-time digest implementation", async () => {
  const baseCrypto = globalThis.crypto ?? webcrypto;
  let replacementCalls = 0;
  const mutableCrypto = {
    subtle: {
      digest: baseCrypto.subtle.digest.bind(baseCrypto.subtle),
    },
  };
  const manifest = await createInteropEndpointManifestV1(
    {
      endpointId: "endpoint:captured-digest",
      endpointVersion: "1.0.0",
      implementationId: "environment:captured-digest",
      endpointKind: "environment",
      operations: ["environment.reset"],
      inputSchemaDigest: digest("captured-digest-input"),
      outputSchemaDigest: digest("captured-digest-output"),
      supportsCancellation: true,
      supportsDeterministicReplay: true,
      supportsCheckpoint: false,
      requiresRequestSignature: false,
      signsResponses: false,
      maximumRequestBytes: 65_536,
      maximumResponseBytes: 65_536,
      maximumStepsPerSession: 100,
    },
    mutableCrypto,
  );
  const schemas = environmentSchemas(manifest);
  const router = new InteropEndpointRouterV1({
    localOnly: true,
    routerInstanceId: "router:captured-digest",
    manifest,
    handlers: [
      {
        operation: "environment.reset",
        async handle() {
          return {
            status: "completed",
            reasonCode: "completed",
            payload: { reset: true },
          };
        },
      },
    ],
    admission: {
      async admit() {
        return true;
      },
    },
    schemas,
    crypto: mutableCrypto,
  });
  const client = new InteropClientV1({
    clientId: "client:captured-digest",
    transport: {
      async manifest() {
        return manifest;
      },
      exchange(request, options = {}) {
        return router.handle(request, {
          logicalTimeMs: request.logicalTimeMs,
          signal: options.signal ?? new AbortController().signal,
        });
      },
    },
    schemas,
    crypto: mutableCrypto,
  });

  mutableCrypto.subtle.digest = async () => {
    replacementCalls += 1;
    return new ArrayBuffer(32);
  };
  mutableCrypto.subtle = {
    async digest() {
      replacementCalls += 1;
      return new ArrayBuffer(32);
    },
  };

  const response = await client.invoke({
    requestId: "request:captured-digest",
    idempotencyKey: "idempotency:captured-digest",
    sessionId: "session:captured-digest",
    operation: "environment.reset",
    sequence: 1,
    logicalTimeMs: 1,
    deadlineLogicalMs: 10,
    payload: {},
  });
  assert.equal(response.status, "completed");
  assert.equal(replacementCalls, 0);
});

test("interop canonicalization rejects non-JSON object graphs and malformed arrays", async () => {
  const sparse = ["first", , "third"];
  const extended = ["first"];
  extended.extra = "not-json";
  const shared = { value: "shared" };

  for (const value of [
    new Map([["entry", "value"]]),
    Object.create({ inherited: "value" }),
    sparse,
    extended,
    { first: shared, second: shared },
  ])
    await assert.rejects(
      interopDigestV1("canonical-adversarial", value),
      /interop JSON (object prototype|array is sparse or extended|object reference is repeated|value is not canonical JSON)/,
    );
});

test("interop requires exact boolean schema and authenticity decisions", async () => {
  const manifest = await environmentManifest({ signsResponses: true });
  const truthySchemas = new InMemoryInteropPayloadSchemaResolverV1([
    {
      schemaDigest: manifest.inputSchemaDigest,
      validate: async () => "truthy",
    },
    {
      schemaDigest: manifest.outputSchemaDigest,
      validate: async () => true,
    },
  ]);
  const clientWithTruthySchema = new InteropClientV1({
    clientId: "client:truthy-schema",
    transport: {
      async manifest() {
        return manifest;
      },
      async exchange() {
        throw new Error("exchange must not be called");
      },
    },
    schemas: truthySchemas,
    authenticity: {
      localSignerId: "client:truthy-schema",
      async sign() {
        return "signature";
      },
      async verify() {
        return true;
      },
    },
  });
  await assert.rejects(
    invokeReset(clientWithTruthySchema),
    /request payload does not match/,
  );

  const strictSchemas = new InMemoryInteropPayloadSchemaResolverV1([
    {
      schemaDigest: manifest.inputSchemaDigest,
      validate: async () => true,
    },
    {
      schemaDigest: manifest.outputSchemaDigest,
      validate: async () => true,
    },
  ]);
  const clientWithTruthyAuth = new InteropClientV1({
    clientId: "client:truthy-auth",
    transport: {
      async manifest() {
        return manifest;
      },
      async exchange(request) {
        return completedResponse(manifest, request, "signature");
      },
    },
    schemas: strictSchemas,
    authenticity: {
      localSignerId: "client:truthy-auth",
      async sign() {
        return "signature";
      },
      async verify() {
        return "truthy";
      },
    },
  });
  await assert.rejects(
    invokeReset(clientWithTruthyAuth),
    /response signature is invalid/,
  );
});

test("failed negotiation clears its pending manifest before a retry", async () => {
  const manifest = await environmentManifest();
  const schemas = environmentSchemas(manifest);
  let manifestCalls = 0;
  const client = new InteropClientV1({
    clientId: "client:negotiation-retry",
    transport: {
      async manifest() {
        manifestCalls += 1;
        return manifestCalls === 1 ? { schemaVersion: 999 } : manifest;
      },
      async exchange(request) {
        return completedResponse(manifest, request);
      },
    },
    schemas,
  });

  await assert.rejects(client.negotiate(), /endpointId is invalid/);
  const recovered = await client.negotiate();
  assert.equal(recovered.manifestDigest, manifest.manifestDigest);
  assert.equal(manifestCalls, 2);
});

test("truthy idempotency CAS results fail closed before handler execution", async () => {
  const manifest = await environmentManifest();
  const schemas = environmentSchemas(manifest);
  let handlerCalls = 0;
  const router = new InteropEndpointRouterV1({
    routerInstanceId: "router:truthy-cas",
    manifest,
    handlers: [
      {
        operation: "environment.reset",
        async handle() {
          handlerCalls += 1;
          return {
            status: "completed",
            reasonCode: "completed",
            payload: { reset: true },
          };
        },
      },
    ],
    admission: {
      async admit() {
        return true;
      },
    },
    schemas,
    durableStores: createRestartDurableInteropRouterStoresV1({
      idempotency: {
        async load() { return null; },
        async reserve() { return "truthy"; },
        async commit() { return "truthy"; },
      },
      sequences: { async admit() { return "advanced"; } },
    }),
  });
  const client = new InteropClientV1({
    clientId: "client:truthy-cas",
    transport: {
      async manifest() {
        return manifest;
      },
      async exchange(request) {
        return router.handle(request, {
          logicalTimeMs: 1,
          signal: new AbortController().signal,
        });
      },
    },
    schemas,
  });

  await assert.rejects(invokeReset(client), /idempotency reservation conflict/);
  assert.equal(handlerCalls, 0);
});

test("outbound sequence high-water continues when a session client is reopened", async () => {
  const fixture = await environmentFixture({ validOutput: true });
  const sequences = new InMemoryInteropOutboundSequenceStoreV1();
  const initial = new InteropSimulationEnvironmentClientV1(
    new InteropClientV1({
      clientId: "client:reopen",
      transport: fixture.transport,
      schemas: fixture.schemas,
    }),
    "session:reopen",
    sequences,
  );
  await initial.reset({}, 1);
  const reopened = new InteropSimulationEnvironmentClientV1(
    new InteropClientV1({
      clientId: "client:reopen",
      transport: fixture.transport,
      schemas: fixture.schemas,
    }),
    "session:reopen",
    sequences,
  );
  await reopened.reset({}, 2);

  assert.deepEqual(fixture.transport.sequences, [1, 2]);
  assert.equal(
    await sequences.current({
      issuerId: "client:reopen",
      sessionId: "session:reopen",
    }),
    2,
  );
});

async function environmentManifest({ signsResponses = false } = {}) {
  return createInteropEndpointManifestV1({
    endpointId: "endpoint:adversarial",
    endpointVersion: "1.0.0",
    implementationId: "environment:adversarial",
    endpointKind: "environment",
    operations: ["environment.reset"],
    inputSchemaDigest: digest("adversarial-input"),
    outputSchemaDigest: digest("adversarial-output"),
    supportsCancellation: true,
    supportsDeterministicReplay: true,
    supportsCheckpoint: false,
    requiresRequestSignature: false,
    signsResponses,
    maximumRequestBytes: 65_536,
    maximumResponseBytes: 65_536,
    maximumStepsPerSession: 100,
  });
}

function environmentSchemas(manifest) {
  return new InMemoryInteropPayloadSchemaResolverV1([
    {
      schemaDigest: manifest.inputSchemaDigest,
      validate: async ({ direction, payload }) =>
        direction === "request" &&
        payload !== null &&
        typeof payload === "object",
    },
    {
      schemaDigest: manifest.outputSchemaDigest,
      validate: async ({ direction, payload }) =>
        direction === "response" && payload?.reset === true,
    },
  ]);
}

async function invokeReset(client) {
  return client.invoke({
    requestId: "request:adversarial",
    idempotencyKey: "idempotency:adversarial",
    sessionId: "session:adversarial",
    operation: "environment.reset",
    sequence: 1,
    logicalTimeMs: 1,
    deadlineLogicalMs: 10,
    payload: {},
  });
}

async function completedResponse(manifest, request, signature = null) {
  const payload = { reset: true };
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
    reasonCode: "completed",
    payload,
    payloadDigest,
  };
  return {
    ...body,
    responseDigest: await interopDigestV1("response", body),
    signature,
  };
}

async function portableAgentFixture() {
  const inputSchemaDigest = digest("portable-agent-input");
  const outputSchemaDigest = digest("portable-agent-output");
  const manifest = await createInteropEndpointManifestV1({
    endpointId: "endpoint:portable",
    endpointVersion: "1.0.0",
    implementationId: "endpoint:portable:build:1",
    endpointKind: "agent",
    operations: [
      "agent.checkpoint",
      "agent.checkpoint.export",
      "agent.checkpoint.import",
      "agent.restore",
      "agent.step",
    ],
    inputSchemaDigest,
    outputSchemaDigest,
    supportsCancellation: true,
    supportsDeterministicReplay: true,
    supportsCheckpoint: true,
    requiresRequestSignature: false,
    signsResponses: false,
    maximumRequestBytes: 65_536,
    maximumResponseBytes: 65_536,
    maximumStepsPerSession: 100,
  });
  const schemas = new InMemoryInteropPayloadSchemaResolverV1([
    {
      schemaDigest: inputSchemaDigest,
      validate: async ({ direction }) => direction === "request",
    },
    {
      schemaDigest: outputSchemaDigest,
      validate: async ({ direction }) => direction === "response",
    },
  ]);
  const transport = {
    requests: [],
    async manifest() {
      return manifest;
    },
    async exchange(request) {
      this.requests.push(request);
      const payload = portableResponsePayload(request);
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
        reasonCode: "portable_completed",
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
  return { manifest, schemas, transport };
}

function portableResponsePayload(request) {
  const adapter = portableAdapterManifest();
  if (request.operation === "agent.checkpoint") {
    return portableCheckpoint(
      request.sessionId,
      request.payload.throughStepSequence,
      adapter,
    );
  }
  if (request.operation === "agent.checkpoint.export") {
    return {
      schemaVersion: 1,
      contentClass: "portable_application_state",
      state: { counter: 0, phase: "initial" },
    };
  }
  if (request.operation === "agent.checkpoint.import") {
    return {
      ...portableCheckpoint(
        request.sessionId,
        request.payload.transfer.checkpoint.throughStepSequence,
        adapter,
      ),
      checkpointId: `checkpoint:imported:${request.sessionId}`,
      stateDigest: request.payload.transfer.checkpoint.stateDigest,
    };
  }
  if (request.operation === "agent.restore") return null;
  throw new Error(`unexpected portable operation: ${request.operation}`);
}

function portableCheckpoint(sessionId, throughStepSequence, adapter) {
  return {
    schemaVersion: 1,
    checkpointId: `checkpoint:remote:${sessionId}`,
    sessionId,
    adapterId: adapter.adapterId,
    adapterVersion: adapter.adapterVersion,
    implementationId: adapter.implementationId,
    throughStepSequence,
    stateReference: `interop://${sessionId}/state`,
    stateDigest: digest("portable-agent-state"),
    createdAt: "2030-01-01T00:00:00.000Z",
  };
}

function portableAdapterManifest() {
  return {
    schemaVersion: 1,
    adapterId: "adapter:portable:remote",
    adapterVersion: "1.0.0",
    implementationId: "adapter:portable:remote:build:1",
    agentKinds: ["custom"],
    inputModalities: ["structured"],
    outputModalities: ["structured"],
    interactionModes: ["invoke"],
    controlPoints: ["pre_step"],
    supportsCancellation: true,
    supportsCheckpoint: true,
    supportsRestore: true,
    maximumObservationBytes: 1_000_000,
    maximumOutputBytes: 1_000_000,
    maximumActionBytes: 1_000_000,
    maximumStepsPerSession: 100,
  };
}

function portableSessionInput(sessionId, agentId) {
  const adapter = portableAdapterManifest();
  return {
    sessionId,
    tenant: { tenantId: "tenant:portable" },
    agentId,
    adapterId: adapter.adapterId,
    adapterVersion: adapter.adapterVersion,
    requirements: {
      agentKinds: ["custom"],
      inputModalities: ["structured"],
      outputModalities: ["structured"],
      interactionMode: "invoke",
      controlPoints: ["pre_step"],
      requireCancellation: true,
      requireCheckpoint: true,
      requireRestore: true,
    },
    role: {
      schemaVersion: 1,
      roleBindingId: `role:${sessionId}`,
      roleRevision: 1,
      predecessorRoleBindingId: null,
      objectiveId: "objective:portable",
      roleKey: "portable-worker",
      instructions: ["Operate only on portable application state."],
      constraints: {},
      validFromLogicalMs: 0,
      validUntilLogicalMs: Number.MAX_SAFE_INTEGER,
    },
  };
}

async function environmentFixture({ validOutput }) {
  const inputSchemaDigest = digest("environment-input");
  const outputSchemaDigest = digest("environment-output");
  const manifest = await createInteropEndpointManifestV1({
    endpointId: "endpoint:environment",
    endpointVersion: "1.0.0",
    implementationId: "environment:test",
    endpointKind: "environment",
    operations: ["environment.reset"],
    inputSchemaDigest,
    outputSchemaDigest,
    supportsCancellation: true,
    supportsDeterministicReplay: true,
    supportsCheckpoint: false,
    requiresRequestSignature: false,
    signsResponses: false,
    maximumRequestBytes: 65_536,
    maximumResponseBytes: 65_536,
    maximumStepsPerSession: 100,
  });
  const schemas = new InMemoryInteropPayloadSchemaResolverV1([
    {
      schemaDigest: inputSchemaDigest,
      validate: async ({ operation, direction, payload }) =>
        operation === "environment.reset" &&
        direction === "request" &&
        typeof payload === "object" &&
        payload !== null &&
        !Array.isArray(payload),
    },
    {
      schemaDigest: outputSchemaDigest,
      validate: async ({ operation, direction, payload }) =>
        validOutput &&
        operation === "environment.reset" &&
        direction === "response" &&
        typeof payload === "object" &&
        payload !== null &&
        payload.reset === true,
    },
  ]);
  const transport = {
    sequences: [],
    async manifest() {
      return manifest;
    },
    async exchange(request) {
      this.sequences.push(request.sequence);
      const payload = { reset: true };
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
        reasonCode: "environment_reset",
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
  return { manifest, schemas, transport };
}

function digest(value) {
  let state = 0x811c9dc5;
  for (const character of value) {
    state ^= character.codePointAt(0);
    state = Math.imul(state, 0x01000193) >>> 0;
  }
  return `sha256:${state.toString(16).padStart(8, "0").repeat(8)}`;
}
