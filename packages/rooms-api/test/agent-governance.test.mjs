import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentDefinitionRegistry,
  InMemoryAgentDefinitionRegistryStore,
  AgentGovernanceServiceV1,
  InMemoryAgentGovernanceStoreV1,
} from "@agentplat/rooms";
import { createRoomsApp } from "../dist/index.js";

test("governance HTTP operations require independent verified identity and ignore owner claims", async () => {
  const definitions = new AgentDefinitionRegistry(
    new InMemoryAgentDefinitionRegistryStore(),
  );
  await definitions.createAgent({
    tenantId: "verified",
    agentId: "agent",
    name: "Agent",
  });
  const candidate = await definitions.createRevision({
    tenantId: "verified",
    agentId: "agent",
    version: "1.0.0",
    instructions: "Work",
    runtimeProfile: {},
  });
  await definitions.publishRevision(
    "verified",
    candidate.definition.revisionId,
    0,
  );
  const agentGovernance = new AgentGovernanceServiceV1(
    new InMemoryAgentGovernanceStoreV1(),
    {
      authenticate: async (request) =>
        request.headers.get("authorization") === "Bearer owner-test-token"
          ? { tenantId: "verified", subjectId: "owner" }
          : null,
      authorize: async (p, request) =>
        request.operation !== "create" ||
        request.command.ownerId === p.subjectId,
    },
    definitions,
  );
  const app = createRoomsApp({ service: {}, agentGovernance });
  const payload = {
    operationId: "create",
    expectedRevision: null,
    command: {
      kind: "create",
      governanceId: "gov",
      ownerId: "owner",
      purpose: "Retention",
      definitionRevisionId: candidate.definition.revisionId,
    },
  };
  const headers = {
    "content-type": "application/json",
    "X-Agentplat-Tenant-Id": "untrusted",
  };
  const send = (body, verified = false) =>
    app.request("/agents/agent/governance/operations", {
      method: "POST",
      headers: {
        ...headers,
        ...(verified ? { authorization: "Bearer owner-test-token" } : {}),
      },
      body: JSON.stringify(body),
    });
  assert.equal((await send(payload)).status, 403);
  assert.equal(
    (await send({ ...payload, tenantId: "untrusted" }, true)).status,
    400,
  );
  assert.equal(
    (
      await send(
        { ...payload, command: { ...payload.command, ownerId: "stranger" } },
        true,
      )
    ).status,
    403,
  );
  const response = await send(payload, true);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.tenantId, "verified");
  const verifiedHeaders = {
    ...headers,
    authorization: "Bearer owner-test-token",
  };
  assert.equal(
    (await app.request("/agents/agent/governance", { headers })).status,
    403,
  );
  assert.equal(
    (
      await app.request("/agents/agent/governance", {
        headers: verifiedHeaders,
      })
    ).status,
    200,
  );
  const history = await app.request("/agents/agent/governance/history", {
    headers: verifiedHeaders,
  });
  assert.equal((await history.json()).data.length, 1);
  assert.equal(
    (
      await app.request("/agents/agent/governance/history?limit=100000", {
        headers: verifiedHeaders,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await send(
        {
          operationId: "resume",
          expectedRevision: 0,
          command: { kind: "resume" },
        },
        true,
      )
    ).status,
    400,
  );
});
