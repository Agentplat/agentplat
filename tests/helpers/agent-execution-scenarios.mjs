import assert from "node:assert/strict";
import {
  AgentGovernanceServiceV1,
  AgentExecutionLimitServiceV1,
  AgentExecutionControllerV1,
} from "@agentplat/rooms";

export async function setupAgentExecution({ store, governance, definitions }) {
  const clock = () => new Date("2026-09-28T12:00:00.000Z");
  await definitions.createAgent({
    tenantId: "t",
    agentId: "agent",
    name: "Agent",
  });
  const definition = await definitions.createRevision({
    tenantId: "t",
    agentId: "agent",
    version: "1.0.0",
    instructions: "Complete authorized work.",
    runtimeProfile: { platform: "mock" },
  });
  await definitions.publishRevision("t", definition.definition.revisionId, 0);
  const profile = {
    adapterId: "adapter:mock",
    runtimePlatform: "mock",
    definitionRevisionId: definition.definition.revisionId,
    preActionCheckpoint: true,
    cooperativeAbort: true,
    gatewayOnlyEffects: true,
    idempotentEffects: true,
  };
  let semanticAllowed = true,
    semanticAge = 0;
  const semantic = {
    assess: async ({ rule, binding, effect }) => ({
      allowed: semanticAllowed,
      assessorId: rule.assessorId,
      configurationDigest: binding.configurationDigest,
      actionDigest: effect.actionDigest,
      assessedAt: new Date(clock().getTime() - semanticAge).toISOString(),
      evidenceRef: "evidence:semantic",
    }),
  };
  const platformLimits = [
    { kind: "destinations", allowed: ["approved-vendor"] },
    { kind: "budget", budgetId: "spend", unit: "USD_cent", maximumUnits: 10 },
  ];
  const controller = new AgentExecutionControllerV1(
    store,
    governance,
    definitions,
    profile,
    platformLimits,
    semantic,
    clock,
  );
  const access = {
    authenticate: async (token) =>
      ["owner", "next", "intruder"].includes(token)
        ? { tenantId: "t", subjectId: token }
        : null,
    authorize: async () => true,
  };
  const government = new AgentGovernanceServiceV1(
    governance,
    access,
    definitions,
    clock,
    controller,
  );
  const limits = new AgentExecutionLimitServiceV1(
    store,
    governance,
    access,
    clock,
  );
  let seq = 0;
  const govern = async (command, actor = "owner") => {
    const h = await governance.load("t", "agent");
    return government.execute(actor, {
      agentId: "agent",
      operationId: `govern-${++seq}`,
      expectedRevision: h?.revision ?? null,
      command,
    });
  };
  await govern({
    kind: "create",
    governanceId: "gov",
    ownerId: "owner",
    purpose: "Complete permitted work",
    definitionRevisionId: definition.definition.revisionId,
  });
  await assert.rejects(controller.open("t", "agent"), { code: "FORBIDDEN" });
  await assert.rejects(
    limits.define("intruder", {
      agentId: "agent",
      expectedGovernanceRevision: 0,
      rule: { kind: "tools", allowed: ["writer"] },
    }),
    { code: "FORBIDDEN" },
  );
  const records = [];
  for (const rule of [
    { kind: "tools", allowed: ["writer"] },
    { kind: "operations", allowed: ["create"] },
    { kind: "budget", budgetId: "spend", unit: "USD_cent", maximumUnits: 100 },
    {
      kind: "semantic",
      assessorId: "assessor:policy",
      policyRef: "policy:safe",
      maximumAgeMs: 1000,
    },
  ])
    records.push(
      await limits.define("owner", {
        agentId: "agent",
        expectedGovernanceRevision: 0,
        rule,
      }),
    );
  await govern({ kind: "limits", refs: records.map((r) => r.limitId) });
  await govern({ kind: "prepare_activation" });
  assert.equal((await governance.load("t", "agent")).status, "transitioning");
  const failed = new AgentGovernanceServiceV1(
    governance,
    access,
    definitions,
    clock,
    new AgentExecutionControllerV1(
      store,
      governance,
      definitions,
      { ...profile, gatewayOnlyEffects: false },
      platformLimits,
      semantic,
      clock,
    ),
  );
  await assert.rejects(
    failed.execute("owner", {
      agentId: "agent",
      operationId: "bad-adapter",
      expectedRevision: 2,
      command: { kind: "activate" },
    }),
    { code: "FORBIDDEN" },
  );
  const missing = new AgentGovernanceServiceV1(
    governance,
    access,
    definitions,
    clock,
  );
  await assert.rejects(
    missing.execute("owner", {
      agentId: "agent",
      operationId: "missing-admission",
      expectedRevision: 2,
      command: { kind: "activate" },
    }),
    { code: "FORBIDDEN" },
  );
  assert.equal((await governance.load("t", "agent")).revision, 2);
  await assert.rejects(govern({ kind: "activate" }, "intruder"), {
    code: "FORBIDDEN",
  });
  const recovered = new AgentGovernanceServiceV1(
    governance,
    access,
    definitions,
    clock,
    controller,
  );
  await recovered.execute("owner", {
    agentId: "agent",
    operationId: "recovered-activation",
    expectedRevision: 2,
    command: { kind: "activate" },
  });
  const binding = await controller.open("t", "agent");
  assert.equal(binding.revision, 3);
  const descriptor = (id, units = 7) => ({
    effectId: id,
    grantId: id,
    reservationId: `reservation:${id}`,
    dispatchAttemptId: `dispatch:${id}`,
    runId: "run",
    downstreamIdempotencyKey: id,
    scopeDigest: `sha256:${"a".repeat(64)}`,
    actionDigest: `sha256:${"b".repeat(64)}`,
    inputDigest: `sha256:${"c".repeat(64)}`,
    toolId: "writer",
    operation: "create",
    destination: "approved-vendor",
    charges: [{ budgetId: "spend", unit: "USD_cent", units }],
  });
  return {
    store,
    governance,
    definitions,
    government,
    govern,
    limits,
    controller,
    binding,
    descriptor,
    profile,
    platformLimits,
    semantic,
    access,
    clock,
    definition: definition.definition,
    records,
    setSemantic: (allowed, age = 0) => {
      semanticAllowed = allowed;
      semanticAge = age;
    },
  };
}

export async function executionScenarios(dependencies) {
  const f = await setupAgentExecution(dependencies);
  const pendingTask = {
    tenantId: "t",
    roomId: "room",
    id: "pending-task",
    stepId: "step",
    assignedParticipantId: "participant",
    instruction: "Work",
    expectedOutput: "Result",
    expectedArtifactKind: "result",
    dependencies: [],
    acceptanceCriteria: [],
    actionLevel: "draft",
    approvalRequired: false,
    toolIds: [],
    status: "pending",
    createdAt: f.clock().toISOString(),
    updatedAt: f.clock().toISOString(),
  };
  const participant = {
    id: "participant",
    tenantId: "t",
    type: "agent",
    metadata: { agentId: "agent" },
    runtime: { platform: "mock", instructions: f.definition.instructions },
  };
  await f.controller.bindRoomTask({
    tenantId: "t",
    participant,
    task: pendingTask,
  });
  const taskBinding = await f.store.taskBinding("t", "room", "pending-task");
  // Failure in the second resource must not reserve any of the first resource.
  assert.equal(
    (
      await f.store.reserve(
        {
          schemaVersion: 1,
          binding: f.binding,
          effect: {
            ...f.descriptor("multi-budget"),
            charges: [
              { budgetId: "spend", unit: "USD_cent", units: 7 },
              { budgetId: "operations", unit: "count", units: 1 },
            ],
          },
          requestDigest: `sha256:${"d".repeat(64)}`,
          status: "admitted",
          semanticEvidenceRefs: [],
          createdAt: f.clock().toISOString(),
          proofRef: null,
        },
        [
          { budgetId: "spend", unit: "USD_cent", maximumUnits: 10 },
          { budgetId: "operations", unit: "count", maximumUnits: 0 },
        ],
      )
    ).status,
    "denied",
  );
  assert.equal(
    (
      await f.controller.reserve(f.binding, {
        ...f.descriptor("wrong-tool"),
        toolId: "unapproved",
      })
    ).code,
    "tool_limit",
  );
  assert.equal(
    (
      await f.controller.reserve(f.binding, {
        ...f.descriptor("wrong-destination"),
        destination: "unapproved-vendor",
      })
    ).code,
    "destination_limit",
  );
  f.setSemantic(false);
  assert.equal(
    (await f.controller.reserve(f.binding, f.descriptor("semantic-deny"))).code,
    "semantic_limit",
  );
  f.setSemantic(true, 2000);
  assert.equal(
    (await f.controller.reserve(f.binding, f.descriptor("semantic-stale")))
      .code,
    "semantic_limit",
  );
  f.setSemantic(true);
  const missingSemantic = new AgentExecutionControllerV1(
    f.store,
    f.governance,
    f.definitions,
    f.profile,
    f.platformLimits,
    undefined,
    f.clock,
  );
  assert.equal(
    (await missingSemantic.reserve(f.binding, f.descriptor("missing-semantic")))
      .code,
    "semantic_guard_unavailable",
  );
  const raced = await Promise.all(
    ["one", "two"].map((id) =>
      f.controller.reserve(f.binding, f.descriptor(id)),
    ),
  );
  assert.equal(raced.filter((r) => r.status === "created").length, 1);
  assert.equal(raced.filter((r) => r.status === "denied").length, 1);
  const admitted = raced.find((r) => r.status === "created").record;
  assert.deepEqual(admitted.semanticEvidenceRefs, ["evidence:semantic"]);
  assert.equal(
    (await f.controller.reserve(f.binding, admitted.effect)).status,
    "replayed",
  );
  assert.equal(
    (
      await f.controller.reserve(f.binding, {
        ...admitted.effect,
        charges: [{ budgetId: "spend", unit: "USD_cent", units: 1 }],
      })
    ).code,
    "effect_identity_conflict",
  );
  await f.controller.recordOutcome(
    admitted,
    "indeterminate",
    "timeout:unknown",
  );
  assert.equal(
    (await f.controller.reserve(f.binding, f.descriptor("held", 4))).code,
    "budget_exhausted_or_unbound",
  );
  await assert.rejects(
    f.controller.reconcile("t", "agent", admitted.effect.effectId, {
      lookup: async () => ({
        requestDigest: "wrong",
        outcome: "not_applied",
        proofRef: "proof",
      }),
    }),
    { code: "CONFLICT" },
  );
  const absent = {
    lookup: async (record) => ({
      requestDigest: record.requestDigest,
      outcome: "not_applied",
      proofRef: "verified:absent",
    }),
  };
  await f.controller.reconcile("t", "agent", admitted.effect.effectId, absent);
  await f.controller.reconcile("t", "agent", admitted.effect.effectId, absent);
  const success = await f.controller.reserve(
    f.binding,
    f.descriptor("success", 6),
  );
  assert.equal(success.status, "created");
  await f.controller.recordOutcome(
    success.record,
    "succeeded",
    "receipt:success",
  );
  const inFlight = await f.controller.reserve(
    f.binding,
    f.descriptor("in-flight", 4),
  );
  assert.equal(inFlight.status, "created");
  await f.govern({ kind: "suspend" });
  await assert.rejects(
    f.controller.reserve(f.binding, f.descriptor("after-suspend", 1)),
    { code: "FORBIDDEN" },
  );
  await f.controller.recordOutcome(
    inFlight.record,
    "indeterminate",
    "receipt:unknown",
  );
  await f.controller.reconcile("t", "agent", "in-flight", absent);
  await f.govern({ kind: "prepare_activation" });
  await f.govern({ kind: "activate" });
  const fresh = await f.controller.open("t", "agent");
  await assert.rejects(
    f.controller.openRoom({
      tenantId: "t",
      participant,
      task: pendingTask,
      supportsPreAction: true,
    }),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(
    f.controller.bindRoomTask({
      tenantId: "t",
      participant,
      task: pendingTask,
    }),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(
    f.controller.reserve(f.binding, f.descriptor("stale", 1)),
    { code: "FORBIDDEN" },
  );
  // Agent-owned cap 100 never widens the construction-bound platform cap 10.
  assert.equal(
    (await f.controller.reserve(fresh, f.descriptor("still-limited", 5))).code,
    "budget_exhausted_or_unbound",
  );
  assert.equal(
    (await f.controller.reserve(fresh, f.descriptor("remaining", 4))).status,
    "created",
  );
  await f.govern({
    kind: "transfer_start",
    targetOwnerId: "next",
    expiresAt: "2026-09-29T12:00:00.000Z",
  });
  const transfer = (await f.governance.load("t", "agent")).pendingTransfer;
  await f.govern(
    { kind: "transfer_accept", transferId: transfer.transferId },
    "next",
  );
  assert.equal((await f.governance.load("t", "agent")).status, "suspended");
  await f.govern({ kind: "prepare_activation" }, "next");
  await f.govern({ kind: "activate" }, "next");
  assert.equal(
    (
      await f.controller.reserve(
        await f.controller.open("t", "agent"),
        f.descriptor("new-owner", 1),
      )
    ).code,
    "budget_exhausted_or_unbound",
  );
  const unknown = await f.store.effect("t", "agent", "remaining");
  assert.equal(unknown.status, "admitted");
  const lastBinding = await f.controller.open("t", "agent");
  const racingStore = {
    limit: f.store.limit.bind(f.store),
    putLimit: f.store.putLimit.bind(f.store),
    effect: f.store.effect.bind(f.store),
    settle: f.store.settle.bind(f.store),
    reserve: async (record, caps) => {
      await f.govern({ kind: "suspend" }, "next");
      return f.store.reserve(record, caps);
    },
  };
  const racingController = new AgentExecutionControllerV1(
    racingStore,
    f.governance,
    f.definitions,
    f.profile,
    f.platformLimits,
    f.semantic,
    f.clock,
  );
  assert.equal(
    (
      await racingController.reserve(
        lastBinding,
        f.descriptor("fenced-at-commit", 0),
      )
    ).code,
    "governance_fence_stale",
  );
  assert.equal(
    await f.store.effect("t", "agent", "fenced-at-commit"),
    undefined,
  );
  return { ...f, lastBinding, unknown, taskBinding };
}
