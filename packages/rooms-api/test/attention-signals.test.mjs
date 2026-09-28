import assert from "node:assert/strict";
import test from "node:test";
import {
  AttentionSignalServiceV1,
  InMemoryAttentionSignalStoreV1,
  InMemoryAgentGovernanceStoreV1,
  AgentDefinitionRegistry,
  InMemoryAgentDefinitionRegistryStore,
} from "@agentplat/rooms";
import { createRoomsApp } from "../dist/index.js";
import { attentionSignalScenarios } from "../../../tests/helpers/attention-signal-scenarios.mjs";

test("attention HTTP routes authenticate collectors and workers separately from definition ownership", async () => {
  const governance = new InMemoryAgentGovernanceStoreV1(),
    store = new InMemoryAttentionSignalStoreV1(governance);
  const setup = await attentionSignalScenarios({
    store,
    governance,
    definitions: new AgentDefinitionRegistry(
      new InMemoryAgentDefinitionRegistryStore(),
    ),
  });
  const attentionSignals = new AttentionSignalServiceV1(
    store,
    governance,
    {
      authenticate: (r) =>
        setup.access.authenticate(r.headers.get("authorization")),
      authorize: setup.access.authorize,
    },
    setup.clock,
  );
  const app = createRoomsApp({ service: {}, attentionSignals });
  const headers = (token) => ({
    "content-type": "application/json",
    "X-Agentplat-Tenant-Id": "untrusted",
    authorization: token,
  });
  const base = `/agents/agent/attention/streams/${encodeURIComponent(setup.signal.recordId)}`;
  const post = (path, token, body) =>
    app.request(path, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify(body),
    });
  assert.equal(
    (await app.request(base, { headers: headers("invalid") })).status,
    403,
  );
  assert.equal(
    (await app.request(base, { headers: headers("other") })).status,
    404,
  );
  const view = await app.request(base, { headers: headers("owner") });
  assert.equal(view.status, 200);
  assert.ok((await view.json()).data.coverage.length > 0);
  assert.equal(
    (
      await app.request(
        `/agents/agent/attention/catalog/${encodeURIComponent(setup.reference.recordId)}`,
        { headers: headers("owner") },
      )
    ).status,
    200,
  );
  const observation = {
    sourceId: "analytics",
    eventId: "api-observation",
    observedAt: setup.clock().toISOString(),
    availability: "observed",
    value: 20,
    evidenceRefs: [],
  };
  assert.equal(
    (await post(`${base}/observations`, "owner", observation)).status,
    403,
  );
  assert.equal(
    (
      await post(`${base}/observations`, "collector", {
        ...observation,
        tenantId: "spoofed",
      })
    ).status,
    400,
  );
  assert.equal(
    (await post(`${base}/observations`, "collector", observation)).status,
    200,
  );
  assert.equal((await post(`${base}/tick`, "collector", {})).status, 403);
  setup.advance(1000); // The scenario consumed the prior window's budget.
  assert.equal((await post(`${base}/tick`, "worker", {})).status, 200);
  const claim = await post(`${base}/claim`, "worker", {
    claimToken: "api-worker",
    leaseMs: 100,
  });
  assert.equal(claim.status, 200);
  const lease = (await claim.json()).data;
  assert.ok(lease);
  assert.equal(lease.wakeup.executionAuthorized, false);
  assert.equal(
    (
      await post(`${base}/complete`, "worker", {
        wakeupId: lease.wakeup.wakeupId,
        claimToken: lease.claimToken,
        generation: lease.generation,
      })
    ).status,
    200,
  );
  const gov = await governance.load("t", "agent");
  assert.equal(
    (
      await post("/agents/agent/attention/definitions", "intruder", {
        expectedGovernanceRevision: gov.revision,
        definition: setup.signal.content,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await post("/agents/agent/attention/definitions", "owner", {
        expectedGovernanceRevision: gov.revision,
        definition: setup.signal.content,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await post("/agents/agent/attention/references", "owner", {
        expectedGovernanceRevision: gov.revision,
        reference: setup.reference.content,
      })
    ).status,
    200,
  );
});
