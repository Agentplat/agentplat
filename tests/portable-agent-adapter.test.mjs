import assert from "node:assert/strict";
import test from "node:test";

import { DefaultAgentRuntime } from "@agentplat/runtime";
import {
  PortableAgentAdapterRegistryV1,
  PortableAgentErrorV1,
  PortableAgentSessionRuntimeV1,
  createAgentRuntimePortableAdapterV1,
  createPortableAgentProviderV1,
} from "@agentplat/runtime/adapter";

function manifest(overrides = {}) {
  return {
    schemaVersion: 1,
    adapterId: "adapter-a",
    adapterVersion: "1.0.0",
    implementationId: "adapter-a-build-1",
    agentKinds: ["hybrid"],
    inputModalities: ["structured", "sensor"],
    outputModalities: ["action", "structured", "text"],
    interactionModes: ["invoke", "observe_act"],
    controlPoints: ["post_output", "pre_action", "pre_step"],
    supportsCancellation: true,
    supportsCheckpoint: false,
    supportsRestore: false,
    maximumObservationBytes: 1_000_000,
    maximumOutputBytes: 1_000_000,
    maximumActionBytes: 1_000_000,
    maximumStepsPerSession: 100,
    ...overrides,
  };
}

function role(overrides = {}) {
  return {
    schemaVersion: 1,
    roleBindingId: "role-1",
    roleRevision: 1,
    predecessorRoleBindingId: null,
    objectiveId: "objective-1",
    roleKey: "local-observer",
    instructions: ["Inspect only local observations."],
    constraints: { maximumRisk: "moderate" },
    validFromLogicalMs: 0,
    validUntilLogicalMs: 9_999_999_999_999,
    ...overrides,
  };
}

function requirements(overrides = {}) {
  return {
    agentKinds: ["hybrid"],
    inputModalities: ["sensor", "structured"],
    outputModalities: ["action", "text"],
    interactionMode: "observe_act",
    controlPoints: ["post_output", "pre_action", "pre_step"],
    requireCancellation: true,
    ...overrides,
  };
}

function stepRequest(overrides = {}) {
  return {
    schemaVersion: 1,
    stepId: "step-1",
    expectedSessionRevision: 0,
    interactionMode: "observe_act",
    observations: [
      {
        schemaVersion: 1,
        observationId: "observation-1",
        sourceZone: "environment_untrusted",
        sourceId: "sensor-7",
        modality: "sensor",
        content: { temperature: 22 },
        contentReference: null,
        provenance: { transport: "local-mesh" },
        observedAtLogicalMs: 10,
      },
    ],
    input: { question: "What changed?" },
    requestedOutputModalities: ["action", "text"],
    logicalTimeMs: 11,
    ...overrides,
  };
}

function sessionRuntime({ adapter, adapterManifest = manifest(), control }) {
  const registry = new PortableAgentAdapterRegistryV1().register({
    manifest: adapterManifest,
    adapter,
  });
  return new PortableAgentSessionRuntimeV1({
    registry,
    control: control ?? {
      controlId: "control-a",
      controlVersion: 1,
      implementationId: "control-a-build-1",
      evaluate: () => ({ disposition: "allow", reasonCode: "allowed" }),
    },
    clock: sequentialClock(),
  });
}

async function createSession(runtime, overrides = {}) {
  return runtime.createSession({
    sessionId: "session-1",
    tenant: { tenantId: "tenant-a" },
    agentId: "agent-a",
    adapterId: "adapter-a",
    adapterVersion: "1.0.0",
    requirements: requirements(),
    role: role(),
    ...overrides,
  });
}

test("negotiated heterogeneous step is controlled and idempotent", async () => {
  const checkpoints = [];
  let adapterCalls = 0;
  const runtime = sessionRuntime({
    control: {
      controlId: "control-a",
      controlVersion: 1,
      implementationId: "control-a-build-1",
      evaluate(request) {
        checkpoints.push(request.checkpoint);
        return { disposition: "allow", reasonCode: "allowed" };
      },
    },
    adapter: {
      async step(input) {
        adapterCalls += 1;
        assert.equal(input.role.roleKey, "local-observer");
        assert.equal(
          input.request.observations[0].sourceZone,
          "environment_untrusted",
        );
        return {
          schemaVersion: 1,
          sessionId: input.sessionId,
          stepId: input.request.stepId,
          stepSequence: input.stepSequence,
          status: "completed",
          outputs: [
            {
              schemaVersion: 1,
              outputId: "output-1",
              modality: "text",
              content: "Temperature is stable.",
              contentReference: null,
              metadata: {},
            },
          ],
          actionProposals: [
            {
              schemaVersion: 1,
              actionId: "action-1",
              actionClass: "notify.operator",
              input: { message: "Stable" },
              riskClass: "low",
              metadata: {},
            },
          ],
          checkpoint: null,
          reasonCode: null,
          metadata: {},
        };
      },
    },
  });
  await createSession(runtime);

  const request = stepRequest();
  const first = await runtime.step("session-1", request);
  const replay = await runtime.step("session-1", request);

  assert.equal(first.record.status, "completed");
  assert.equal(first.session.revision, 1);
  assert.deepEqual(checkpoints, ["pre_step", "post_output", "pre_action"]);
  assert.equal(adapterCalls, 1);
  assert.deepEqual(replay, first);
  await assert.rejects(
    runtime.step("session-1", {
      ...request,
      input: { question: "Different input" },
    }),
    (error) =>
      error instanceof PortableAgentErrorV1 && error.code === "CONFLICT",
  );
});

test("control failure refuses the step before adapter dispatch", async () => {
  let adapterCalls = 0;
  const runtime = sessionRuntime({
    control: {
      controlId: "control-a",
      controlVersion: 1,
      implementationId: "control-a-build-1",
      evaluate() {
        throw new Error("control offline");
      },
    },
    adapter: {
      async step() {
        adapterCalls += 1;
        throw new Error("must not run");
      },
    },
  });
  await createSession(runtime);

  const outcome = await runtime.step("session-1", stepRequest());

  assert.equal(outcome.record.status, "refused");
  assert.equal(outcome.record.result.reasonCode, "control_unavailable");
  assert.deepEqual(outcome.record.result.outputs, []);
  assert.equal(adapterCalls, 0);
});

test("post-output denial withholds every output and action proposal", async () => {
  const runtime = sessionRuntime({
    control: {
      controlId: "control-a",
      controlVersion: 1,
      implementationId: "control-a-build-1",
      evaluate(request) {
        return request.checkpoint === "post_output"
          ? { disposition: "deny", reasonCode: "output_not_releasable" }
          : { disposition: "allow", reasonCode: "allowed" };
      },
    },
    adapter: {
      async step(input) {
        return {
          schemaVersion: 1,
          sessionId: input.sessionId,
          stepId: input.request.stepId,
          stepSequence: input.stepSequence,
          status: "completed",
          outputs: [
            {
              schemaVersion: 1,
              outputId: "sensitive-output",
              modality: "text",
              content: "withhold me",
              contentReference: null,
              metadata: {},
            },
          ],
          actionProposals: [
            {
              schemaVersion: 1,
              actionId: "sensitive-action",
              actionClass: "external.write",
              input: { value: "withhold me" },
              riskClass: "high",
              metadata: {},
            },
          ],
          checkpoint: null,
          reasonCode: null,
          metadata: {},
        };
      },
    },
  });
  await createSession(runtime);

  const outcome = await runtime.step("session-1", stepRequest());

  assert.equal(outcome.record.status, "refused");
  assert.equal(outcome.record.result.reasonCode, "output_not_releasable");
  assert.deepEqual(outcome.record.result.outputs, []);
  assert.deepEqual(outcome.record.result.actionProposals, []);
});

test("checkpoint, successor role and restore preserve session binding", async () => {
  const restored = [];
  const adapterManifest = manifest({
    supportsCheckpoint: true,
    supportsRestore: true,
  });
  const runtime = sessionRuntime({
    adapterManifest,
    adapter: {
      async step() {
        throw new Error("unused");
      },
      async checkpoint(input) {
        return {
          schemaVersion: 1,
          checkpointId: "checkpoint-1",
          sessionId: input.sessionId,
          adapterId: adapterManifest.adapterId,
          adapterVersion: adapterManifest.adapterVersion,
          implementationId: adapterManifest.implementationId,
          throughStepSequence: input.throughStepSequence,
          stateReference: "memory://checkpoint-1",
          stateDigest: "sha256:abc",
          createdAt: "2026-01-01T00:00:00.000Z",
        };
      },
      async restore(input) {
        restored.push(input.checkpoint.checkpointId);
      },
    },
  });
  await createSession(runtime, {
    requirements: requirements({
      requireCheckpoint: true,
      requireRestore: true,
    }),
  });

  const paused = await runtime.pause("session-1");
  const reassigned = await runtime.updateRole(
    "session-1",
    role({
      roleBindingId: "role-2",
      roleRevision: 2,
      predecessorRoleBindingId: "role-1",
      roleKey: "local-verifier",
    }),
    paused.revision,
  );
  const resumed = await runtime.resume("session-1");

  assert.equal(paused.status, "paused");
  assert.equal(paused.checkpoint.throughStepSequence, 0);
  assert.equal(reassigned.role.roleKey, "local-verifier");
  assert.equal(resumed.status, "active");
  assert.deepEqual(restored, ["checkpoint-1"]);
});

test("role restoration is predecessor-exact and certificate-bound", async () => {
  const runtime = sessionRuntime({
    adapter: {
      async step() {
        throw new Error("unused");
      },
    },
  });
  await createSession(runtime);
  const initial = await runtime.getSession("session-1");
  const successor = await runtime.updateRole(
    "session-1",
    role({
      roleBindingId: "role-2",
      roleRevision: 2,
      predecessorRoleBindingId: "role-1",
      roleKey: "local-verifier",
    }),
    initial.revision,
  );
  const authorization = {
    schemaVersion: 1,
    restorationId: "rollback-1",
    expectedActiveRoleBindingId: "role-2",
    expectedActiveRoleRevision: 2,
    restoredRoleBindingId: "role-1",
    restoredRoleRevision: 1,
    certificateDigest: `sha256:${"a".repeat(64)}`,
  };
  await assert.rejects(
    runtime.restoreRole("session-1", role(), successor.revision, {
      ...authorization,
      certificateDigest: "sha256:invalid",
    }),
    /authorization is invalid/u,
  );
  const restored = await runtime.restoreRole(
    "session-1",
    role(),
    successor.revision,
    authorization,
  );
  assert.equal(restored.role.roleBindingId, "role-1");
  assert.equal(restored.role.roleRevision, 1);
  assert.equal(restored.revision, successor.revision + 1);
});

test("AgentRuntime bridges portable sessions into collective-compatible providers", async () => {
  const sourceRuntime = new DefaultAgentRuntime();
  sourceRuntime.registerProvider("source", {
    async run(agent, input, context) {
      assert.equal(agent.id, "agent-a");
      assert.equal(context.runId, "collective-attempt-1");
      assert.equal(input.input[0].portableType, "role");
      return {
        status: "completed",
        output: "portable output",
        result: { source: "runtime" },
      };
    },
  });
  const adapterManifest = manifest({
    agentKinds: ["language_model"],
    inputModalities: ["structured"],
    outputModalities: ["structured", "text"],
    interactionModes: ["invoke"],
  });
  const portable = createAgentRuntimePortableAdapterV1({
    manifest: adapterManifest,
    runtime: sourceRuntime,
    agent: {
      id: "agent-a",
      tenantId: "tenant-a",
      name: "source agent",
      platform: "source",
    },
  });
  const runtime = sessionRuntime({
    adapterManifest,
    adapter: portable.adapter,
  });
  await createSession(runtime, {
    requirements: requirements({
      agentKinds: ["language_model"],
      inputModalities: ["structured"],
      outputModalities: ["structured", "text"],
      interactionMode: "invoke",
    }),
  });
  const collectiveRuntime = new DefaultAgentRuntime();
  collectiveRuntime.registerProvider(
    "portable",
    createPortableAgentProviderV1({
      sessionRuntime: runtime,
      resolveSessionId: () => "session-1",
      logicalClock: () => 100,
    }),
  );

  const result = await collectiveRuntime.run(
    {
      id: "agent-a",
      tenantId: "tenant-a",
      name: "portable agent",
      platform: "portable",
    },
    { input: "Analyze this." },
    {
      tenant: { tenantId: "tenant-a" },
      agentId: "agent-a",
      runId: "collective-attempt-1",
    },
  );

  assert.equal(result.status, "completed");
  assert.equal(result.output, "portable output");
  assert.deepEqual(result.result, { source: "runtime" });
  assert.equal((await runtime.getSession("session-1")).revision, 1);
});

function sequentialClock() {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++));
}
