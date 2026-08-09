import assert from "node:assert/strict";
import test from "node:test";
import {
  HeterogeneousInferenceInterventionRuntimeV1,
  INFERENCE_INTERVENTION_PAYLOAD_LIMITS_V1,
  InMemoryInferenceInterventionStateStoreV1,
  createBoundedSignalAssessorV1,
  createInferenceInterventionBindingV1,
  createInferenceInterventionPolicyV1,
  createInferenceInterventionReferenceAdapterV1,
  createOpaqueApiInferenceAdapterV1,
  createRepresentationInterventionRequestV1,
  createTokenStreamInferenceAdapterV1,
  digestInferenceInterventionV1,
} from "../packages/inference-control/dist/intervention.js";
import { sha256Hex } from "../packages/inference-control/dist/sha256.js";

const digest = (domain, value) => digestInferenceInterventionV1(domain, value);
const binding = (fence = 1) =>
  createInferenceInterventionBindingV1({
    schemaVersion: 1,
    bindingId: "binding:test",
    missionId: "mission:test",
    agentId: "agent:test",
    sessionId: "session:test",
    roleId: "role:test",
    modelOrAdapterId: "adapter:test",
    modelOrAdapterDigest: digest("model", { fence }),
    authorityDigest: digest("authority", { fence }),
    fence,
  });
const policy = (
  requiredCapabilities = ["pre_input_filter", "output_gate"],
  overrides = {},
) =>
  createInferenceInterventionPolicyV1({
    schemaVersion: 1,
    policyId: "policy:test",
    policyVersion: 1,
    requiredCapabilities,
    thresholds: {
      blockRiskBps: 9_000,
      interventionRiskBps: 5_000,
      maximumUncertaintyBps: 5_000,
      minimumRoleCoherenceBps: 1,
    },
    budget: {
      maximumInterventions: 2,
      maximumRepresentationRequests: 2,
      cooldownLogicalMs: 0,
      recoveryClearAssessments: 1,
      maximumCasAttempts: 3,
    },
    maximumStep: 100,
    maximumWindowTokens: 2,
    sidecarTimeoutMs: 25,
    ...overrides,
  });
const assessor = () =>
  createBoundedSignalAssessorV1({
    assessorId: "assessor:test",
    assessorVersion: 1,
    assessorImplementationDigest: digest("assessor", { test: true }),
    blockedPhrases: ["block-me"],
    interventionPhrases: ["modify-me"],
  });
const invocation = (step, logicalTimeMs, input = "hello", extra = {}) => ({
  invocationId: `invoke:${step}`,
  step,
  logicalTimeMs,
  input,
  context: [],
  roleReinforcement: null,
  requireRepresentationReceipt: false,
  ...extra,
});

test("opaque provider path gates input before invocation", async () => {
  let calls = 0;
  const adapter = createOpaqueApiInferenceAdapterV1({
    schemaVersion: 1,
    adapterId: "adapter:test",
    adapterVersion: 1,
    adapterImplementationDigest: digest("adapter", { opaque: true }),
    invoke: async () => {
      calls++;
      return { output: "ok" };
    },
  });
  const runtime = new HeterogeneousInferenceInterventionRuntimeV1({
    binding: binding(),
    policy: policy(),
    adapter,
    assessors: [assessor()],
  });
  const result = await runtime.invoke(invocation(1, 1, "block-me"));
  assert.equal(result.decision, "blocked");
  assert.equal(calls, 0);
});

test("token streaming assesses each token and emits permitted output", async () => {
  const adapter = createTokenStreamInferenceAdapterV1({
    schemaVersion: 1,
    adapterId: "adapter:test",
    adapterVersion: 1,
    adapterImplementationDigest: digest("adapter", { stream: true }),
    invoke: async () => ({
      tokens: (async function* () {
        yield "hel";
        yield "lo";
      })(),
    }),
  });
  const runtime = new HeterogeneousInferenceInterventionRuntimeV1({
    binding: binding(),
    policy: policy(["token_assessment", "window_assessment"]),
    adapter,
    assessors: [assessor()],
  });
  assert.equal((await runtime.invoke(invocation(1, 1))).output, "hello");
});

test("representation sidecar verifies exact receipt and rejects tampering", async () => {
  const adapter = createInferenceInterventionReferenceAdapterV1({
    schemaVersion: 1,
    adapterId: "adapter:test",
    adapterVersion: 1,
    adapterImplementationDigest: digest("adapter", { representation: true }),
    agentClass: "representation_sidecar_model",
    capabilities: ["representation_intervention"],
    invoke: async () => ({ output: "ok" }),
  });
  const sidecar = {
    sidecarId: "sidecar:test",
    sidecarVersion: 1,
    sidecarImplementationDigest: digest("sidecar", { v: 1 }),
    intervene: async (request) => {
      const unsigned = {
        schemaVersion: 1,
        requestDigest: request.requestDigest,
        sidecarId: "sidecar:test",
        sidecarVersion: 1,
        sidecarImplementationDigest: digest("sidecar", { v: 1 }),
        result: "applied",
      };
      return {
        ...unsigned,
        receiptDigest: digest("representation-receipt", unsigned),
      };
    },
  };
  const runtime = new HeterogeneousInferenceInterventionRuntimeV1({
    binding: binding(),
    policy: policy(["representation_intervention"]),
    adapter,
    assessors: [assessor()],
    sidecar,
  });
  assert.equal(
    (
      await runtime.invoke(
        invocation(1, 1, "ok", { requireRepresentationReceipt: true }),
      )
    ).receipt.result,
    "applied",
  );
  const request = createRepresentationInterventionRequestV1({
    schemaVersion: 1,
    requestId: "r",
    bindingDigest: binding().bindingDigest,
    policyDigest: policy().policyDigest,
    inputDigest: digest("input", {}),
    step: 1,
    requestedAtLogicalMs: 1,
  });
  const badSidecar = {
    ...sidecar,
    intervene: async () => ({
      schemaVersion: 1,
      requestDigest: request.requestDigest,
      sidecarId: "sidecar:test",
      sidecarVersion: 1,
      sidecarImplementationDigest: sidecar.sidecarImplementationDigest,
      result: "applied",
      receiptDigest: digest("wrong", {}),
    }),
  };
  const bad = new HeterogeneousInferenceInterventionRuntimeV1({
    binding: binding(),
    policy: policy(["representation_intervention"]),
    adapter,
    assessors: [assessor()],
    sidecar: badSidecar,
  });
  await assert.rejects(
    bad.invoke(invocation(1, 1, "ok", { requireRepresentationReceipt: true })),
    /sidecar_ambiguous/,
  );
  const slow = new HeterogeneousInferenceInterventionRuntimeV1({
    binding: binding(),
    policy: policy(["representation_intervention"], { sidecarTimeoutMs: 1 }),
    adapter,
    assessors: [assessor()],
    sidecar: { ...sidecar, intervene: async () => new Promise(() => {}) },
  });
  await assert.rejects(
    slow.invoke(invocation(1, 1, "ok", { requireRepresentationReceipt: true })),
    /sidecar_ambiguous/,
  );
});

test("multimodal agent negotiation is closed and missing hooks fail before invocation", () => {
  const adapter = createInferenceInterventionReferenceAdapterV1({
    schemaVersion: 1,
    adapterId: "adapter:test",
    adapterVersion: 1,
    adapterImplementationDigest: digest("adapter", { multi: true }),
    agentClass: "multimodal_action_agent",
    capabilities: ["multimodal_input_filter", "action_gate"],
    invoke: async () => ({ output: "ok" }),
  });
  assert.throws(
    () =>
      new HeterogeneousInferenceInterventionRuntimeV1({
        binding: binding(),
        policy: policy(["tool_gate"]),
        adapter,
        assessors: [assessor()],
      }),
    /required_capability_unavailable/,
  );
  assert.throws(
    () =>
      createInferenceInterventionReferenceAdapterV1({
        schemaVersion: 1,
        adapterId: "bad",
        adapterVersion: 1,
        adapterImplementationDigest: digest("a", {}),
        agentClass: "multimodal_action_agent",
        capabilities: ["unknown"],
        invoke: async () => ({ output: "ok" }),
      }),
    /invalid_closed_capability_set/,
  );
});

test("budget exhaustion, stale step/fence replay, and CAS retry are fail closed", async () => {
  const adapter = createOpaqueApiInferenceAdapterV1({
    schemaVersion: 1,
    adapterId: "adapter:test",
    adapterVersion: 1,
    adapterImplementationDigest: digest("adapter", { budget: true }),
    invoke: async () => ({ output: "ok" }),
  });
  const store = new InMemoryInferenceInterventionStateStoreV1();
  const runtime = new HeterogeneousInferenceInterventionRuntimeV1({
    binding: binding(),
    policy: policy([], {
      budget: {
        maximumInterventions: 0,
        maximumRepresentationRequests: 0,
        cooldownLogicalMs: 0,
        recoveryClearAssessments: 1,
        maximumCasAttempts: 2,
      },
    }),
    adapter,
    assessors: [assessor()],
    store,
  });
  assert.equal(
    (await runtime.invoke(invocation(1, 1, "modify-me"))).decision,
    "blocked",
  );
  await runtime.invoke(invocation(2, 2));
  await assert.rejects(
    runtime.invoke(invocation(2, 3)),
    /stale_step|conflicting_invocation_id/,
  );
  const changedFence = new HeterogeneousInferenceInterventionRuntimeV1({
    binding: binding(2),
    policy: runtime.options.policy,
    adapter,
    assessors: [assessor()],
    store,
  });
  await assert.rejects(
    changedFence.invoke(invocation(3, 3)),
    /durable_state_identity_mismatch|stale_authority_fence|invalid_durable_intervention_state/,
  );
  const neverCommit = {
    read: async () => null,
    compareAndSet: async () => false,
  };
  const retry = new HeterogeneousInferenceInterventionRuntimeV1({
    binding: binding(3),
    policy: policy([], {
      budget: {
        maximumInterventions: 1,
        maximumRepresentationRequests: 1,
        cooldownLogicalMs: 0,
        recoveryClearAssessments: 1,
        maximumCasAttempts: 1,
      },
    }),
    adapter,
    assessors: [assessor()],
    store: neverCommit,
    monotonicAnchor: { readAnchor: async () => null },
  });
  await assert.rejects(retry.invoke(invocation(1, 1)), /cas_retry_exhausted/);
});

test("crash restore validates the durable state digest", async () => {
  const adapter = createOpaqueApiInferenceAdapterV1({
    schemaVersion: 1,
    adapterId: "adapter:test",
    adapterVersion: 1,
    adapterImplementationDigest: digest("adapter", { restore: true }),
    invoke: async () => ({ output: "ok" }),
  });
  const store = new InMemoryInferenceInterventionStateStoreV1();
  const instance = new HeterogeneousInferenceInterventionRuntimeV1({
    binding: binding(),
    policy: policy([]),
    adapter,
    assessors: [assessor()],
    store,
  });
  await instance.invoke(invocation(1, 1));
  const restored = new HeterogeneousInferenceInterventionRuntimeV1({
    binding: binding(),
    policy: policy([]),
    adapter,
    assessors: [assessor()],
    store,
  });
  assert.equal((await restored.invoke(invocation(2, 2))).decision, "allowed");
  const valid = await store.read(
    "inference-intervention:mission:test:agent:test:session:test:role:test:adapter:test",
  );
  const corrupted = { ...valid, stateDigest: digest("corrupted-state", {}) };
  const tamperedStore = {
    read: async () => corrupted,
    compareAndSet: async () => false,
  };
  const tampered = new HeterogeneousInferenceInterventionRuntimeV1({
    binding: binding(),
    policy: policy([]),
    adapter,
    assessors: [assessor()],
    store: tamperedStore,
    monotonicAnchor: { readAnchor: async () => null },
  });
  await assert.rejects(
    tampered.invoke(invocation(3, 3)),
    /durable_state_digest_mismatch|invalid_durable_intervention_state/,
  );
  const { stateDigest, ...rollbackUnsigned } = valid;
  const rollback = {
    ...rollbackUnsigned,
    revision: 0,
    interventionsUsed: 0,
    representationRequestsUsed: 0,
  };
  const rollbackStore = {
    read: async () => ({ ...rollback, stateDigest: digest("state", rollback) }),
    compareAndSet: async () => false,
  };
  const rollbackRuntime = new HeterogeneousInferenceInterventionRuntimeV1({
    binding: binding(),
    policy: policy([]),
    adapter,
    assessors: [assessor()],
    store: rollbackStore,
    monotonicAnchor: store,
  });
  await assert.rejects(
    rollbackRuntime.invoke(invocation(3, 3)),
    /invalid_durable_intervention_state/,
  );
});

test("reservation prevents a CAS loser from invoking the adapter twice", async () => {
  let calls = 0,
    rejectFirst = true;
  const memory = new InMemoryInferenceInterventionStateStoreV1();
  const store = {
    read: memory.read.bind(memory),
    compareAndSet: async (change) =>
      rejectFirst
        ? ((rejectFirst = false), false)
        : memory.compareAndSet(change),
  };
  const adapter = createOpaqueApiInferenceAdapterV1({
    schemaVersion: 1,
    adapterId: "adapter:test",
    adapterVersion: 1,
    adapterImplementationDigest: digest("adapter", { reservation: true }),
    invoke: async () => {
      calls++;
      return { output: "ok" };
    },
  });
  const runtime = new HeterogeneousInferenceInterventionRuntimeV1({
    binding: binding(),
    policy: policy([]),
    adapter,
    assessors: [assessor()],
    store,
    monotonicAnchor: memory,
  });
  assert.equal((await runtime.invoke(invocation(1, 1))).decision, "allowed");
  assert.equal(calls, 1);
});

test("modify requires a bound trusted transformation receipt", async () => {
  let received = "";
  const implementation = digest("adapter", { transform: true });
  const adapter = createInferenceInterventionReferenceAdapterV1({
    schemaVersion: 1,
    adapterId: "adapter:test",
    adapterVersion: 1,
    adapterImplementationDigest: implementation,
    agentClass: "portable_agent",
    capabilities: ["pre_input_filter", "trusted_transformation"],
    invoke: async (value) => {
      received = value.input;
      return { output: "ok" };
    },
  });
  const transformerDigest = digest("transformer", { v: 1 });
  const transformer = {
    transformerId: "transformer:test",
    transformerVersion: 1,
    transformerImplementationDigest: transformerDigest,
    transform: async ({ request }) => {
      const transformed = "safe-input";
      const transformedInputDigest = `sha256:${sha256Hex(new TextEncoder().encode(transformed))}`;
      const unsigned = {
        schemaVersion: 1,
        requestDigest: request.requestDigest,
        transformerId: "transformer:test",
        transformerVersion: 1,
        transformerImplementationDigest: transformerDigest,
        transformedManifestDigest: digest("transformed-manifest", {
          inputDigest: transformedInputDigest,
          contextDigests: [],
          modalities: [],
        }),
      };
      return {
        input: transformed,
        receipt: {
          ...unsigned,
          receiptDigest: digest("transformation-receipt", unsigned),
        },
      };
    },
  };
  const runtime = new HeterogeneousInferenceInterventionRuntimeV1({
    binding: binding(),
    policy: policy([]),
    adapter,
    assessors: [assessor()],
    transformer,
  });
  assert.equal(
    (await runtime.invoke(invocation(1, 1, "modify-me"))).decision,
    "allowed",
  );
  assert.equal(received, "safe-input");
});

test("partial stream window, persisted stream block, empty assessors, and multimodal signals are enforced", async () => {
  const seen = [];
  const stream = createTokenStreamInferenceAdapterV1({
    schemaVersion: 1,
    adapterId: "adapter:test",
    adapterVersion: 1,
    adapterImplementationDigest: digest("adapter", { partial: true }),
    invoke: async () => ({
      tokens: (async function* () {
        yield "block-me";
      })(),
    }),
  });
  const runtime = new HeterogeneousInferenceInterventionRuntimeV1({
    binding: binding(),
    policy: policy(["token_assessment", "window_assessment"]),
    adapter: stream,
    assessors: [assessor()],
  });
  await assert.rejects(
    runtime.invoke(invocation(1, 1)),
    /stream_token_intervention_required/,
  );
  const terminal = await runtime.store.read(
    "inference-intervention:mission:test:agent:test:session:test:role:test:adapter:test",
  );
  assert.equal(terminal.activeInvocation, null);
  assert.equal(terminal.lastInvocation.decision, "blocked");
  const partialKinds = [];
  const partialAssessor = {
    ...assessor(),
    assess: async (value) => {
      partialKinds.push(value.signal.kind);
      return assessor().assess(value);
    },
  };
  const partialAdapter = createTokenStreamInferenceAdapterV1({
    schemaVersion: 1,
    adapterId: "adapter:partial",
    adapterVersion: 1,
    adapterImplementationDigest: digest("adapter", { partialWindow: true }),
    invoke: async () => ({
      tokens: (async function* () {
        yield "ok";
      })(),
    }),
  });
  const partialBinding = createInferenceInterventionBindingV1({
    schemaVersion: 1,
    bindingId: "binding:partial",
    missionId: "mission:partial",
    agentId: "agent:partial",
    sessionId: "session:partial",
    roleId: "role:partial",
    modelOrAdapterId: "adapter:partial",
    modelOrAdapterDigest: digest("model", { partial: true }),
    authorityDigest: digest("authority", { partial: true }),
    fence: 1,
  });
  const partialRuntime = new HeterogeneousInferenceInterventionRuntimeV1({
    binding: partialBinding,
    policy: policy(["token_assessment", "window_assessment"]),
    adapter: partialAdapter,
    assessors: [partialAssessor],
  });
  await partialRuntime.invoke(invocation(1, 1));
  assert.ok(partialKinds.includes("window"));
  assert.throws(
    () =>
      new HeterogeneousInferenceInterventionRuntimeV1({
        binding: binding(),
        policy: policy([]),
        adapter: stream,
        assessors: [],
      }),
    /at_least_one_assessor_required/,
  );
  const multi = createInferenceInterventionReferenceAdapterV1({
    schemaVersion: 1,
    adapterId: "adapter:multi",
    adapterVersion: 1,
    adapterImplementationDigest: digest("adapter", { multi2: true }),
    agentClass: "multimodal_action_agent",
    capabilities: ["multimodal_input_filter"],
    invoke: async () => ({ output: "ok" }),
  });
  const watching = {
    ...assessor(),
    assess: async (value) => {
      seen.push(value.signal.kind);
      return assessor().assess(value);
    },
  };
  const multiRuntime = new HeterogeneousInferenceInterventionRuntimeV1({
    binding: createInferenceInterventionBindingV1({
      schemaVersion: 1,
      bindingId: "binding:multi",
      missionId: "mission:multi",
      agentId: "agent:multi",
      sessionId: "session:multi",
      roleId: "role:multi",
      modelOrAdapterId: "adapter:multi",
      modelOrAdapterDigest: digest("model", { multi: true }),
      authorityDigest: digest("authority", { multi: true }),
      fence: 1,
    }),
    policy: policy(["multimodal_input_filter"]),
    adapter: multi,
    assessors: [watching],
  });
  await multiRuntime.invoke({
    ...invocation(1, 1),
    modalityParts: [
      {
        kind: "image",
        contentDigest: digest("image", { id: 1 }),
        payloadHandle: "volatile://image/1",
      },
    ],
  });
  assert.ok(seen.includes("multimodal_input"));
});

test("action modify never permits dispatch of the original risky payload", async () => {
  const adapter = createInferenceInterventionReferenceAdapterV1({
    schemaVersion: 1,
    adapterId: "adapter:action",
    adapterVersion: 1,
    adapterImplementationDigest: digest("adapter", { action: true }),
    agentClass: "multimodal_action_agent",
    capabilities: ["action_gate", "trusted_transformation"],
    invoke: async () => ({ output: "unused" }),
  });
  const actionBinding = createInferenceInterventionBindingV1({
    schemaVersion: 1,
    bindingId: "binding:action",
    missionId: "mission:action",
    agentId: "agent:action",
    sessionId: "session:action",
    roleId: "role:action",
    modelOrAdapterId: "adapter:action",
    modelOrAdapterDigest: digest("model", { action: true }),
    authorityDigest: digest("authority", { action: true }),
    fence: 1,
  });
  let transforms = 0;
  const transformerImplementationDigest = digest("transformer", {
    action: true,
  });
  const transformer = {
    transformerId: "transformer:action",
    transformerVersion: 1,
    transformerImplementationDigest,
    transform: async ({ request }) => {
      transforms++;
      const transformed = "safe-action";
      const unsigned = {
        schemaVersion: 1,
        requestDigest: request.requestDigest,
        transformerId: "transformer:action",
        transformerVersion: 1,
        transformerImplementationDigest,
        transformedManifestDigest: digest("transformed-manifest", {
          inputDigest: `sha256:${sha256Hex(new TextEncoder().encode(transformed))}`,
          contextDigests: [],
          modalities: [],
        }),
      };
      return {
        input: transformed,
        receipt: {
          ...unsigned,
          receiptDigest: digest("transformation-receipt", unsigned),
        },
      };
    },
  };
  const gatedPolicy = policy([], {
    budget: {
      maximumInterventions: 2,
      maximumRepresentationRequests: 0,
      cooldownLogicalMs: 10,
      recoveryClearAssessments: 1,
      maximumCasAttempts: 3,
    },
  });
  const runtime = new HeterogeneousInferenceInterventionRuntimeV1({
    binding: actionBinding,
    policy: gatedPolicy,
    adapter,
    assessors: [assessor()],
    transformer,
  });
  const request = {
    operationId: "operation:1",
    kind: "action",
    step: 1,
    logicalTimeMs: 1,
    payload: "modify-me",
  };
  assert.equal((await runtime.gateOperation(request)).allowed, false);
  assert.equal((await runtime.gateOperation(request)).allowed, false);
  assert.equal(transforms, 0);
  await assert.rejects(
    runtime.gateOperation({ ...request, payload: "different" }),
    /conflicting_invocation_id/,
  );
  await assert.rejects(
    runtime.gateOperation({ ...request, operationId: "operation:other" }),
    /stale_step/,
  );
  assert.equal(
    (
      await runtime.gateOperation({
        operationId: "operation:2",
        kind: "action",
        step: 2,
        logicalTimeMs: 2,
        payload: "modify-me",
      })
    ).allowed,
    false,
  );
  assert.equal(transforms, 0);
  const noTransformBinding = createInferenceInterventionBindingV1({
    schemaVersion: 1,
    bindingId: "binding:no-transform",
    missionId: "mission:action",
    agentId: "agent:action",
    sessionId: "session:no-transform",
    roleId: "role:action",
    modelOrAdapterId: "adapter:action",
    modelOrAdapterDigest: digest("model", { action: true }),
    authorityDigest: digest("authority", { action: true }),
    fence: 1,
  });
  const withoutTransformer = new HeterogeneousInferenceInterventionRuntimeV1({
    binding: noTransformBinding,
    policy: gatedPolicy,
    adapter,
    assessors: [assessor()],
  });
  assert.equal(
    (
      await withoutTransformer.gateOperation({
        operationId: "operation:no-transform",
        kind: "action",
        step: 1,
        logicalTimeMs: 1,
        payload: "modify-me",
      })
    ).allowed,
    false,
  );
});

test("representation budget zero prevents sidecar calls and timeout aborts cooperatively", async () => {
  const adapter = createInferenceInterventionReferenceAdapterV1({
    schemaVersion: 1,
    adapterId: "adapter:representation-limit",
    adapterVersion: 1,
    adapterImplementationDigest: digest("adapter", { repLimit: true }),
    agentClass: "representation_sidecar_model",
    capabilities: ["representation_intervention"],
    invoke: async () => ({ output: "ok" }),
  });
  const repBinding = createInferenceInterventionBindingV1({
    schemaVersion: 1,
    bindingId: "binding:rep-limit",
    missionId: "mission:rep-limit",
    agentId: "agent:rep-limit",
    sessionId: "session:rep-limit",
    roleId: "role:rep-limit",
    modelOrAdapterId: "adapter:representation-limit",
    modelOrAdapterDigest: digest("model", { repLimit: true }),
    authorityDigest: digest("authority", { repLimit: true }),
    fence: 1,
  });
  let calls = 0;
  const sidecarIdentity = {
    sidecarId: "sidecar:limit",
    sidecarVersion: 1,
    sidecarImplementationDigest: digest("sidecar", { limit: true }),
  };
  const neverCalled = {
    ...sidecarIdentity,
    intervene: async () => {
      calls++;
      throw new Error("unexpected");
    },
  };
  const zeroPolicy = policy(["representation_intervention"], {
    budget: {
      maximumInterventions: 1,
      maximumRepresentationRequests: 0,
      cooldownLogicalMs: 0,
      recoveryClearAssessments: 1,
      maximumCasAttempts: 3,
    },
  });
  const zero = new HeterogeneousInferenceInterventionRuntimeV1({
    binding: repBinding,
    policy: zeroPolicy,
    adapter,
    assessors: [assessor()],
    sidecar: neverCalled,
  });
  assert.equal((await zero.invoke(invocation(1, 1))).decision, "blocked");
  assert.equal(calls, 0);
  let aborted = false;
  const slow = {
    ...sidecarIdentity,
    intervene: async (_request, { signal }) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(new Error("aborted"));
          },
          { once: true },
        ),
      ),
  };
  const timed = new HeterogeneousInferenceInterventionRuntimeV1({
    binding: repBinding,
    policy: policy(["representation_intervention"], { sidecarTimeoutMs: 1 }),
    adapter,
    assessors: [assessor()],
    sidecar: slow,
  });
  await assert.rejects(timed.invoke(invocation(1, 1)), /sidecar_ambiguous/);
  assert.equal(aborted, true);
  const ambiguousState = await timed.store.read(
    "inference-intervention:mission:rep-limit:agent:rep-limit:session:rep-limit:role:rep-limit:adapter:representation-limit",
  );
  assert.equal(ambiguousState.unresolvedEffect.kind, "sidecar_ambiguous");
  assert.match(
    ambiguousState.unresolvedEffect.sidecarRequestDigest,
    /^sha256:/,
  );
  await assert.rejects(
    timed.invoke(invocation(2, 2)),
    /intervention_reconciliation_required/,
  );
  const resolvesOnAbort = {
    ...sidecarIdentity,
    intervene: async (request, { signal }) =>
      new Promise((resolve) =>
        signal.addEventListener(
          "abort",
          () => {
            const unsigned = {
              schemaVersion: 1,
              requestDigest: request.requestDigest,
              ...sidecarIdentity,
              result: "applied",
            };
            resolve({
              ...unsigned,
              receiptDigest: digest("representation-receipt", unsigned),
            });
          },
          { once: true },
        ),
      ),
  };
  const abortRace = new HeterogeneousInferenceInterventionRuntimeV1({
    binding: repBinding,
    policy: policy(["representation_intervention"], { sidecarTimeoutMs: 1 }),
    adapter,
    assessors: [assessor()],
    sidecar: resolvesOnAbort,
  });
  await assert.rejects(abortRace.invoke(invocation(1, 1)), /sidecar_ambiguous/);
  assert.equal(
    (
      await abortRace.store.read(
        "inference-intervention:mission:rep-limit:agent:rep-limit:session:rep-limit:role:rep-limit:adapter:representation-limit",
      )
    ).unresolvedEffect.kind,
    "sidecar_ambiguous",
  );
  const reconcilerImplementationDigest = digest("reconciler", {
    sidecar: true,
  });
  const reconciler = {
    reconcilerId: "reconciler:sidecar",
    reconcilerVersion: 1,
    reconcilerImplementationDigest,
    reconcile: async (request) => {
      const unsigned = {
        schemaVersion: 1,
        requestDigest: request.requestDigest,
        reconcilerId: "reconciler:sidecar",
        reconcilerVersion: 1,
        reconcilerImplementationDigest,
        resolution: request.resolution,
      };
      return {
        ...unsigned,
        receiptDigest: digest("reconciliation-receipt", unsigned),
      };
    },
  };
  const recovery = new HeterogeneousInferenceInterventionRuntimeV1({
    binding: repBinding,
    policy: timed.options.policy,
    adapter,
    assessors: [assessor()],
    sidecar: slow,
    store: timed.store,
    reconciler,
  });
  const effect = ambiguousState.unresolvedEffect;
  const reconciled = await recovery.reconcile({
    invocationId: effect.invocationId,
    invocationDigest: effect.invocationDigest,
    executionDomain: effect.executionDomain,
    step: effect.step,
    resolution: "confirmed_applied_and_contained",
    authorizationDigest: digest("authorization", { sidecar: true }),
    logicalTimeMs: 2,
  });
  assert.equal(reconciled.unresolvedEffect, null);
});

test("runtime rejects tampered contracts, malformed assessments, and oversized payloads", async () => {
  const adapter = createOpaqueApiInferenceAdapterV1({
    schemaVersion: 1,
    adapterId: "adapter:strict",
    adapterVersion: 1,
    adapterImplementationDigest: digest("adapter", { strict: true }),
    invoke: async () => ({ output: "ok" }),
  });
  assert.throws(
    () =>
      new HeterogeneousInferenceInterventionRuntimeV1({
        binding: { ...binding(), bindingDigest: digest("wrong", {}) },
        policy: policy([]),
        adapter,
        assessors: [assessor()],
      }),
    /binding_digest_mismatch/,
  );
  assert.throws(
    () =>
      new HeterogeneousInferenceInterventionRuntimeV1({
        binding: binding(),
        policy: { ...policy([]), policyDigest: digest("wrong", {}) },
        adapter,
        assessors: [assessor()],
      }),
    /policy_digest_mismatch/,
  );
  const malformed = {
    ...assessor(),
    assess: ({ signal }) => {
      const unsigned = {
        schemaVersion: 1,
        assessorId: "assessor:test",
        assessorVersion: 1,
        assessorImplementationDigest: digest("assessor", { test: true }),
        decision: "allow",
        riskBps: 0,
        uncertaintyBps: 0,
        roleCoherenceBps: 10_000,
        reasonCodes: ["bad\nreason"],
        evidenceDigests: [signal.contentDigest],
      };
      return { ...unsigned, assessmentDigest: digest("assessment", unsigned) };
    },
  };
  const strict = new HeterogeneousInferenceInterventionRuntimeV1({
    binding: binding(),
    policy: policy([]),
    adapter,
    assessors: [malformed],
  });
  await assert.rejects(strict.invoke(invocation(1, 1)), /invalid_assessment/);
  const normal = new HeterogeneousInferenceInterventionRuntimeV1({
    binding: binding(),
    policy: policy([]),
    adapter,
    assessors: [assessor()],
  });
  await assert.rejects(
    normal.invoke({
      ...invocation(1, 1),
      context: Array.from({ length: 65 }, () => "x"),
    }),
    /payload_limits/,
  );
});

test("a different invocation cannot overwrite an active prepared reservation", async () => {
  let release;
  let entered;
  const enteredPromise = new Promise((resolve) => {
    entered = resolve;
  });
  const outputPromise = new Promise((resolve) => {
    release = resolve;
  });
  const adapter = createOpaqueApiInferenceAdapterV1({
    schemaVersion: 1,
    adapterId: "adapter:pending",
    adapterVersion: 1,
    adapterImplementationDigest: digest("adapter", { pending: true }),
    invoke: async () => {
      entered();
      return { output: await outputPromise };
    },
  });
  const pendingBinding = createInferenceInterventionBindingV1({
    schemaVersion: 1,
    bindingId: "binding:pending",
    missionId: "mission:pending",
    agentId: "agent:pending",
    sessionId: "session:pending",
    roleId: "role:pending",
    modelOrAdapterId: "adapter:pending",
    modelOrAdapterDigest: digest("model", { pending: true }),
    authorityDigest: digest("authority", { pending: true }),
    fence: 1,
  });
  const runtime = new HeterogeneousInferenceInterventionRuntimeV1({
    binding: pendingBinding,
    policy: policy([]),
    adapter,
    assessors: [assessor()],
  });
  const first = runtime.invoke(invocation(1, 1));
  await enteredPromise;
  await assert.rejects(
    runtime.invoke({ ...invocation(2, 2), invocationId: "invoke:competing" }),
    /inference_invocation_pending/,
  );
  const state = await runtime.store.read(
    "inference-intervention:mission:pending:agent:pending:session:pending:role:pending:adapter:pending",
  );
  assert.equal(state.activeInvocation.invocationId, "invoke:1");
  release("ok");
  assert.equal((await first).decision, "allowed");
});

test("invoke, tool, and action identities cannot replay across domains", async () => {
  const adapter = createInferenceInterventionReferenceAdapterV1({
    schemaVersion: 1,
    adapterId: "adapter:test",
    adapterVersion: 1,
    adapterImplementationDigest: digest("adapter", { domains: true }),
    agentClass: "multimodal_action_agent",
    capabilities: ["tool_gate", "action_gate"],
    invoke: async () => ({ output: "ok" }),
  });
  const runtime = new HeterogeneousInferenceInterventionRuntimeV1({
    binding: binding(),
    policy: policy([]),
    adapter,
    assessors: [assessor()],
  });
  assert.equal(
    (
      await runtime.gateOperation({
        operationId: "identity:shared",
        kind: "action",
        step: 1,
        logicalTimeMs: 1,
        payload: "safe",
      })
    ).allowed,
    true,
  );
  await assert.rejects(
    runtime.invoke({ ...invocation(1, 1), invocationId: "identity:shared" }),
    /conflicting_invocation_id/,
  );
  const toolRuntime = new HeterogeneousInferenceInterventionRuntimeV1({
    binding: binding(),
    policy: policy([]),
    adapter,
    assessors: [assessor()],
  });
  assert.equal(
    (
      await toolRuntime.gateOperation({
        operationId: "identity:tool-action",
        kind: "tool",
        step: 1,
        logicalTimeMs: 1,
        payload: "safe",
      })
    ).allowed,
    true,
  );
  await assert.rejects(
    toolRuntime.gateOperation({
      operationId: "identity:tool-action",
      kind: "action",
      step: 1,
      logicalTimeMs: 1,
      payload: "safe",
    }),
    /conflicting_invocation_id/,
  );
});

test("prepared crash resumes only the exact invocation after not-applied reconciliation", async () => {
  let calls = 0;
  let entered;
  const enteredPromise = new Promise((resolve) => {
    entered = resolve;
  });
  const adapter = createOpaqueApiInferenceAdapterV1({
    schemaVersion: 1,
    adapterId: "adapter:reconcile",
    adapterVersion: 1,
    adapterImplementationDigest: digest("adapter", { reconcile: true }),
    invoke: async () => {
      calls++;
      if (calls === 1) {
        entered();
        return new Promise(() => {});
      }
      return { output: "after-reconcile" };
    },
  });
  const reconcileBinding = createInferenceInterventionBindingV1({
    schemaVersion: 1,
    bindingId: "binding:reconcile",
    missionId: "mission:reconcile",
    agentId: "agent:reconcile",
    sessionId: "session:reconcile",
    roleId: "role:reconcile",
    modelOrAdapterId: "adapter:reconcile",
    modelOrAdapterDigest: digest("model", { reconcile: true }),
    authorityDigest: digest("authority", { reconcile: true }),
    fence: 1,
  });
  const reconcilerImplementationDigest = digest("reconciler", { v: 1 });
  const reconciler = {
    reconcilerId: "reconciler:test",
    reconcilerVersion: 1,
    reconcilerImplementationDigest,
    reconcile: async (request) => {
      const unsigned = {
        schemaVersion: 1,
        requestDigest: request.requestDigest,
        reconcilerId: "reconciler:test",
        reconcilerVersion: 1,
        reconcilerImplementationDigest,
        resolution: request.resolution,
      };
      return {
        ...unsigned,
        receiptDigest: digest("reconciliation-receipt", unsigned),
      };
    },
  };
  const runtime = new HeterogeneousInferenceInterventionRuntimeV1({
    binding: reconcileBinding,
    policy: policy([]),
    adapter,
    assessors: [assessor()],
    reconciler,
  });
  void runtime.invoke(invocation(1, 1));
  await enteredPromise;
  const prepared = await runtime.store.read(
    "inference-intervention:mission:reconcile:agent:reconcile:session:reconcile:role:reconcile:adapter:reconcile",
  );
  assert.equal(prepared.unresolvedEffect.kind, "prepared_crash");
  await assert.rejects(
    runtime.invoke(invocation(1, 1)),
    /intervention_reconciliation_required/,
  );
  const effect = prepared.unresolvedEffect;
  const reconciled = await runtime.reconcile({
    invocationId: effect.invocationId,
    invocationDigest: effect.invocationDigest,
    executionDomain: effect.executionDomain,
    step: effect.step,
    resolution: "confirmed_not_applied",
    authorizationDigest: digest("authorization", { operator: true }),
    logicalTimeMs: 2,
  });
  assert.equal(reconciled.unresolvedEffect.kind, "retry_authorized");
  assert.equal(calls, 1);
  assert.equal(
    (await runtime.invoke(invocation(1, 1))).output,
    "after-reconcile",
  );
  assert.equal(calls, 2);
  const completed = await runtime.store.read(
    "inference-intervention:mission:reconcile:agent:reconcile:session:reconcile:role:reconcile:adapter:reconcile",
  );
  assert.equal(completed.activeInvocation, null);
  assert.equal(completed.unresolvedEffect, null);
});

test("buffered and streaming output limits fail closed", async () => {
  const limits = INFERENCE_INTERVENTION_PAYLOAD_LIMITS_V1;
  const buffered = createOpaqueApiInferenceAdapterV1({
    schemaVersion: 1,
    adapterId: "adapter:test",
    adapterVersion: 1,
    adapterImplementationDigest: digest("adapter", { outputLimit: true }),
    invoke: async () => ({ output: "x".repeat(limits.maximumOutputBytes + 1) }),
  });
  await assert.rejects(
    new HeterogeneousInferenceInterventionRuntimeV1({
      binding: binding(),
      policy: policy([]),
      adapter: buffered,
      assessors: [assessor()],
    }).invoke(invocation(1, 1)),
    /buffered_output_limits/,
  );
  const tokenTooLarge = createTokenStreamInferenceAdapterV1({
    schemaVersion: 1,
    adapterId: "adapter:test",
    adapterVersion: 1,
    adapterImplementationDigest: digest("adapter", { tokenLimit: true }),
    invoke: async () => ({
      tokens: (async function* () {
        yield "x".repeat(limits.maximumTokenBytes + 1);
      })(),
    }),
  });
  await assert.rejects(
    new HeterogeneousInferenceInterventionRuntimeV1({
      binding: binding(),
      policy: policy(["token_assessment"]),
      adapter: tokenTooLarge,
      assessors: [assessor()],
    }).invoke(invocation(1, 1)),
    /stream_output_limits/,
  );
  const totalTooLarge = createTokenStreamInferenceAdapterV1({
    schemaVersion: 1,
    adapterId: "adapter:test",
    adapterVersion: 1,
    adapterImplementationDigest: digest("adapter", { totalLimit: true }),
    invoke: async () => ({
      tokens: (async function* () {
        for (let index = 0; index < 65; index++)
          yield "x".repeat(limits.maximumTokenBytes);
      })(),
    }),
  });
  await assert.rejects(
    new HeterogeneousInferenceInterventionRuntimeV1({
      binding: binding(),
      policy: policy(["token_assessment"]),
      adapter: totalTooLarge,
      assessors: [assessor()],
    }).invoke(invocation(1, 1)),
    /stream_output_limits/,
  );
  const tooManyTokens = createTokenStreamInferenceAdapterV1({
    schemaVersion: 1,
    adapterId: "adapter:test",
    adapterVersion: 1,
    adapterImplementationDigest: digest("adapter", { countLimit: true }),
    invoke: async () => ({
      tokens: (async function* () {
        for (let index = 0; index <= limits.maximumTokenCount; index++)
          yield "";
      })(),
    }),
  });
  await assert.rejects(
    new HeterogeneousInferenceInterventionRuntimeV1({
      binding: binding(),
      policy: policy(["token_assessment"]),
      adapter: tooManyTokens,
      assessors: [assessor()],
    }).invoke(invocation(1, 1)),
    /stream_output_limits/,
  );
});
