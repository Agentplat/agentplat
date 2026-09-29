import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentDefinitionRegistry,
  InMemoryAgentDefinitionRegistryStore,
  InMemoryAgentGovernanceStoreV1,
  InMemoryAgentInceptionStoreV1,
  AgentInceptionServiceV1,
  RoomService,
  InMemoryRoomRepository,
} from "@agentplat/rooms";
import { createRoomsApp } from "../dist/index.js";
import { inceptionScenarios } from "../../../tests/helpers/agent-inception-scenarios.mjs";

test("inception API authenticates source intake and separate assessment permission without dispatch", async () => {
  const governance = new InMemoryAgentGovernanceStoreV1(),
    store = new InMemoryAgentInceptionStoreV1(governance);
  const definitions = new AgentDefinitionRegistry(
    new InMemoryAgentDefinitionRegistryStore(),
  );
  const rooms = new RoomService({ repository: new InMemoryRoomRepository() });
  const setup = await inceptionScenarios({
    governance,
    store,
    definitions,
    rooms,
  });
  const agentInceptions = new AgentInceptionServiceV1(
    store,
    governance,
    rooms,
    {
      authenticate: (request) =>
        setup.access.authenticate(request.headers.get("authorization")),
      authorize: setup.access.authorize,
    },
  );
  const app = createRoomsApp({ service: rooms, agentInceptions });
  const base = "/rooms/room/agents/agent/inceptions";
  const headers = (token) => ({
    "content-type": "application/json",
    "X-Agentplat-Tenant-Id": "untrusted",
    authorization: token,
  });
  const send = (path, token, body) =>
    app.request(path, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify(body),
    });
  const submission = {
    inceptionId: "api",
    sourceMessageId: setup.intake.sourceMessageId,
    expectedGovernanceRevision: 2,
  };
  assert.equal((await send(base, "unknown", submission)).status, 403);
  assert.equal(
    (await send(base, "owner", { ...submission, tenantId: "spoofed" })).status,
    400,
  );
  const saved = await send(base, "owner", submission);
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).data.tenantId, "t");
  const assessment = {
    assessmentId: "api-review",
    expectedGovernanceRevision: 2,
    expectedAssessmentRevision: -1,
    evaluatorRef: "evaluator-v1",
    disposition: "adopted",
    explanation: "Relevant to onboarding",
    uncertainty: "Needs measurement",
    reformulation: null,
    evidence: [],
    proposedWork: [],
  };
  assert.equal(
    (await send(`${base}/api/assessments`, "owner", assessment)).status,
    403,
  );
  assert.equal(
    (
      await send(`${base}/api/assessments`, "evaluator", {
        ...assessment,
        executionAuthorized: true,
      })
    ).status,
    400,
  );
  const evaluated = await send(
    `${base}/api/assessments`,
    "evaluator",
    assessment,
  );
  assert.equal(evaluated.status, 200);
  assert.equal((await evaluated.json()).data.executionAuthorized, false);
  assert.equal(
    (await app.request(`${base}/api`, { headers: headers("owner") })).status,
    200,
  );
  const history = await app.request(`${base}/api/assessments`, {
    headers: headers("owner"),
  });
  assert.equal((await history.json()).data.length, 1);
  assert.equal(
    (
      await app.request(`${base}/api/assessments?limit=100000`, {
        headers: headers("owner"),
      })
    ).status,
    400,
  );
  assert.equal((await rooms.getRoomState("t", "room")).tasks.length, 0);
});
