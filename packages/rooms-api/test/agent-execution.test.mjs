import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentDefinitionRegistry,
  InMemoryAgentDefinitionRegistryStore,
  InMemoryAgentGovernanceStoreV1,
  InMemoryAgentExecutionStoreV1,
  AgentExecutionLimitServiceV1,
  AgentGovernanceServiceV1,
} from "@agentplat/rooms";
import { createRoomsApp } from "../dist/index.js";
import { setupAgentExecution } from "../../../tests/helpers/agent-execution-scenarios.mjs";
test("execution limit candidates and two-phase activation require independently verified owner identity", async () => {
  const governance = new InMemoryAgentGovernanceStoreV1(),
    store = new InMemoryAgentExecutionStoreV1(governance);
  const f = await setupAgentExecution({
    store,
    governance,
    definitions: new AgentDefinitionRegistry(
      new InMemoryAgentDefinitionRegistryStore(),
    ),
  });
  const access = {
    authenticate: (r) => f.access.authenticate(r.headers.get("authorization")),
    authorize: f.access.authorize,
  };
  const app = createRoomsApp({
    service: {},
    executionLimits: new AgentExecutionLimitServiceV1(
      store,
      governance,
      access,
      f.clock,
    ),
    agentGovernance: new AgentGovernanceServiceV1(
      governance,
      access,
      f.definitions,
      f.clock,
      f.controller,
    ),
  });
  const headers = (token) => ({
    "content-type": "application/json",
    "X-Agentplat-Tenant-Id": "untrusted",
    authorization: token,
  });
  const post = (path, token, body) =>
    app.request(path, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify(body),
    });
  const rule = {
    kind: "budget",
    budgetId: "spend",
    unit: "USD_cent",
    maximumUnits: 5,
  };
  const input = { expectedGovernanceRevision: 3, rule };
  assert.equal(
    (await post("/agents/agent/execution-limits", "intruder", input)).status,
    403,
  );
  assert.equal(
    (
      await post("/agents/agent/execution-limits", "owner", {
        ...input,
        tenantId: "spoofed",
      })
    ).status,
    400,
  );
  const created = await post("/agents/agent/execution-limits", "owner", input);
  assert.equal(created.status, 200);
  const limit = (await created.json()).data;
  assert.equal(limit.tenantId, "t");
  assert.equal(
    (
      await app.request(
        `/agents/agent/execution-limits/${encodeURIComponent(limit.limitId)}`,
        { headers: headers("owner") },
      )
    ).status,
    200,
  );
  const route = "/agents/agent/governance/operations";
  assert.equal(
    (
      await post(route, "intruder", {
        operationId: "prepare",
        expectedRevision: 3,
        command: { kind: "prepare_activation" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await post(route, "owner", {
        operationId: "prepare",
        expectedRevision: 3,
        command: { kind: "prepare_activation" },
      })
    ).status,
    200,
  );
  assert.equal((await governance.load("t", "agent")).status, "transitioning");
  await assert.rejects(f.controller.open("t", "agent"));
  const activated = await post(route, "owner", {
    operationId: "activate",
    expectedRevision: 4,
    command: { kind: "activate" },
  });
  assert.equal(activated.status, 200);
  assert.equal((await activated.json()).data.status, "active");
});
