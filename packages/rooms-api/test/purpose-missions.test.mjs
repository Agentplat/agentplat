import assert from "node:assert/strict";
import test from "node:test";
import {
  InMemoryAgentGovernanceStoreV1,
  InMemoryAgentExecutionStoreV1,
  InMemoryPurposeMissionStoreV1,
  InMemoryAgentInceptionStoreV1,
  InMemoryAttentionSignalStoreV1,
  InMemoryAgentRoomPlanStore,
  InMemoryRoomRepository,
  AgentDefinitionRegistry,
  InMemoryAgentDefinitionRegistryStore,
} from "@agentplat/rooms";
import { createRoomsApp } from "../dist/index.js";
import { purposeMissionScenarios } from "../../../tests/helpers/purpose-mission-scenarios.mjs";
test("purpose mission API separates issuer authority, agent evaluation and observed outcome review", async () => {
  const governance = new InMemoryAgentGovernanceStoreV1(),
    missions = new InMemoryPurposeMissionStoreV1(governance);
  const f = await purposeMissionScenarios({
    governance,
    missions,
    execution: new InMemoryAgentExecutionStoreV1(governance, missions),
    plans: new InMemoryAgentRoomPlanStore(),
    repository: new InMemoryRoomRepository(),
    definitions: new AgentDefinitionRegistry(
      new InMemoryAgentDefinitionRegistryStore(),
    ),
    inceptions: new InMemoryAgentInceptionStoreV1(governance),
    signals: new InMemoryAttentionSignalStoreV1(governance),
  });
  const purposeMissions = f.makeService({
    ...f.access,
    authenticate: (r) => f.access.authenticate(r.headers.get("authorization")),
  });
  const app = createRoomsApp({ service: f.protectedRooms, purposeMissions });
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
  await f.planner.create({
    tenantId: "t",
    roomId: "purpose-room",
    planId: "api-plan",
    objective: "Prepare another bounded improvement",
    steps: [
      {
        stepId: "draft",
        kind: "agent_task",
        participantId: "purpose-participant",
        instruction: "Draft a proposal",
        expectedOutput: "Proposal",
        expectedArtifactKind: "proposal",
        actionLevel: "draft",
      },
    ],
  });
  const route = "/agents/agent/purpose-missions/api-mission";
  const input = {
    operationId: "issue-api",
    roomId: "purpose-room",
    planId: "api-plan",
    participantId: "purpose-participant",
    criteria: [
      { criterionId: "retention", description: "Observed retention support" },
    ],
    expiresAt: new Date(f.clock().getTime() + 600000).toISOString(),
    expectedGovernanceRevision: (await governance.load("t", "agent")).revision,
  };
  assert.equal((await post(route, "stranger", input)).status, 403);
  assert.equal(
    (await post(route, "owner", { ...input, tenantId: "spoofed" })).status,
    400,
  );
  assert.equal((await post(route, "owner", input)).status, 200);
  f.setDecision("complete");
  const evaluation = {
    operationId: "evaluate-api",
    expectedRevision: 0,
    trigger: { kind: "review", reason: "Check readiness" },
  };
  assert.equal(
    (await post(`${route}/evaluate`, "owner", evaluation)).status,
    403,
  );
  assert.equal(
    (
      await post(`${route}/evaluate`, "agent", {
        ...evaluation,
        disposition: "complete",
      })
    ).status,
    400,
  );
  const evaluated = await post(`${route}/evaluate`, "agent", evaluation);
  assert.equal(evaluated.status, 200);
  assert.equal(
    (await evaluated.json()).data.result.disposition,
    "needs_evidence",
  );
  const scope = { agentId: "agent", missionId: "api-mission" };
  const review = {
    operationId: "review-api",
    expectedRevision: (await f.service.get("owner", scope)).revision,
    evidence: [],
  };
  const reviewed = await post(`${route}/review`, "agent", review);
  assert.equal(reviewed.status, 200);
  assert.equal(
    (await reviewed.json()).data.result.review.coverage,
    "insufficient",
  );
  assert.equal(
    (await app.request(route, { headers: headers("other") })).status,
    404,
  );
  assert.equal(
    (
      await app.request(`${route}/history?limit=100000`, {
        headers: headers("owner"),
      })
    ).status,
    400,
  );
  const history = await app.request(`${route}/history`, {
    headers: headers("owner"),
  });
  assert.ok((await history.json()).data.length > 1);
  const cancel = {
    operationId: "cancel-api",
    expectedRevision: (await f.service.get("owner", scope)).revision,
  };
  assert.equal((await post(`${route}/cancel`, "stranger", cancel)).status, 403);
  assert.equal((await post(`${route}/cancel`, "owner", cancel)).status, 200);
  assert.equal((await f.service.get("owner", scope)).status, "canceled");
});
