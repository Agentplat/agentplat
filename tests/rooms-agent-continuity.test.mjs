import test from "node:test";
import {
  InMemoryAgentGovernanceStoreV1,
  InMemoryAgentExecutionStoreV1,
  InMemoryAgentContinuityStoreV1,
  AgentDefinitionRegistry,
  InMemoryAgentDefinitionRegistryStore,
} from "@agentplat/rooms";
import { continuityScenarios } from "./helpers/agent-continuity-scenarios.mjs";
test("derived agents intersect ancestor limits, share cumulative budgets and retain origin across replacement", async () => {
  const governance = new InMemoryAgentGovernanceStoreV1(),
    continuity = new InMemoryAgentContinuityStoreV1(governance);
  await continuityScenarios({
    governance,
    continuity,
    execution: new InMemoryAgentExecutionStoreV1(
      governance,
      undefined,
      continuity,
    ),
    definitions: new AgentDefinitionRegistry(
      new InMemoryAgentDefinitionRegistryStore(),
    ),
  });
});

test("required autonomy supervision narrows governed effects and cannot bypass budgets", async () => {
  const assert = (await import("node:assert/strict")).default;
  const { setupAgentExecution } =
    await import("./helpers/agent-execution-scenarios.mjs");
  const { AgentExecutionControllerV1, AgentGovernanceServiceV1 } =
    await import("@agentplat/rooms");
  const governance = new InMemoryAgentGovernanceStoreV1(),
    execution = new InMemoryAgentExecutionStoreV1(governance),
    definitions = new AgentDefinitionRegistry(
      new InMemoryAgentDefinitionRegistryStore(),
    );
  const f = await setupAgentExecution({
    governance,
    store: execution,
    definitions,
  });
  await f.govern({ kind: "suspend" });
  await f.govern({ kind: "prepare_activation" });
  const profile = { ...f.profile, supervisionId: "autonomy:required" };
  const missing = new AgentExecutionControllerV1(
    execution,
    governance,
    definitions,
    profile,
    f.platformLimits,
    f.semantic,
    f.clock,
  );
  const head = await governance.load("t", "agent"),
    command = {
      agentId: "agent",
      operationId: "missing-supervision",
      expectedRevision: head.revision,
      command: { kind: "activate" },
    };
  await assert.rejects(
    new AgentGovernanceServiceV1(
      governance,
      f.access,
      definitions,
      f.clock,
      missing,
    ).execute("owner", command),
    { code: "FORBIDDEN" },
  );
  let allowed = false;
  const port = {
    supports: (id) => id === profile.supervisionId,
    assess: async (input) => {
      assert.equal(input.policyAgentId, "agent");
      return { allowed, decisionDigest: "sha256:" + "d".repeat(64) };
    },
  };
  const controller = new AgentExecutionControllerV1(
    execution,
    governance,
    definitions,
    profile,
    f.platformLimits,
    f.semantic,
    f.clock,
    undefined,
    port,
  );
  await new AgentGovernanceServiceV1(
    governance,
    f.access,
    definitions,
    f.clock,
    controller,
  ).execute("owner", { ...command, operationId: "supervised-activation" });
  const binding = await controller.open("t", "agent");
  assert.equal(
    (await controller.reserve(binding, f.descriptor("blocked", 1))).code,
    "supervision_denied",
  );
  allowed = true;
  assert.equal(
    (await controller.reserve(binding, f.descriptor("too-large", 11))).status,
    "denied",
  );
  const admitted = await controller.reserve(
    binding,
    f.descriptor("permitted", 1),
  );
  assert.equal(admitted.status, "created");
  assert.equal(admitted.record.supervisionDecisionDigests.length, 1);
});
