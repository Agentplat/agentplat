import test from "node:test";
import assert from "node:assert/strict";
import { ClientFactory, JsonRpcTransportFactory } from "@a2a-js/sdk/client";
import { AgentCard, SendMessageRequest, GetTaskRequest } from "@a2a-js/sdk";
import {
  AgentRegistry,
  InMemoryAgentRegistryStore,
} from "@agentplat/agent-registry";
import {
  A2AServer,
  A2AClient,
  InMemoryA2AStateStore,
  discoverA2AAgent,
  createA2AFetch,
} from "../dist/index.js";
import { fixture, input, principal } from "./helpers.mjs";
test("official SDK, AgentPlat client, streamed tasks and durable duplicate protection", async () => {
  const f = await fixture();
  const results = [];
  for await (const event of f.client.sendStream(input())) results.push(event);
  assert.equal(results.at(-1).task.state, "completed");
  assert.equal(f.runs(), 1);
  assert.deepEqual(f.errors, []);
  await new A2AClient(f.options).send(input());
  assert.equal(f.runs(), 1);
  await assert.rejects(
    f.client.send({
      ...input(),
      message: { messageId: "one", parts: [{ kind: "text", text: "changed" }] },
    }),
    /operation_conflict/,
  );
  const official = await new ClientFactory({
    transports: [
      new JsonRpcTransportFactory({
        fetchImpl: createA2AFetch(f.network, "rpc"),
      }),
    ],
  }).createFromAgentCard(
    AgentCard.fromJSON(
      await (
        await f.server.handle(
          new Request("https://agent.test/card", {
            headers: { Authorization: "Bearer test" },
          }),
        )
      ).json(),
    ),
  );
  const wire = SendMessageRequest.fromJSON({
    message: {
      messageId: "sdk",
      role: "ROLE_USER",
      parts: [{ text: "hello" }],
    },
  });
  const completed = await official.sendMessage(wire);
  assert.equal(completed.status.state, 3);
  assert.equal(f.runs(), 2);
  const again = await official.sendMessage(wire);
  assert.equal(again.id, completed.id);
  assert.equal(f.runs(), 2);
  f.restart();
  assert.equal(
    (await official.getTask(GetTaskRequest.fromJSON({ id: completed.id }))).id,
    completed.id,
  );
});
test("tenant/user isolation, authentication and unsupported protocol/card", async () => {
  const f = await fixture();
  assert.equal(
    (await f.server.handle(new Request("https://agent.test/card"))).status,
    401,
  );
  const request = {
    jsonrpc: "2.0",
    id: 1,
    method: "SendMessage",
    params: {
      tenant: "other",
      message: {
        messageId: "m",
        role: "ROLE_USER",
        parts: [{ text: "hello" }],
      },
    },
  };
  assert.equal(
    (
      await f.server.handle(
        new Request("https://agent.test/rpc", {
          method: "POST",
          headers: { Authorization: "Bearer test", "A2A-Version": "1.0" },
          body: JSON.stringify(request),
        }),
      )
    ).status,
    403,
  );
  const result = await f.client.send(input());
  const other = new A2AClient({
    ...f.options,
    principal: { tenantId: "other", subjectId: "user" },
  });
  await assert.rejects(other.get("research", "one"), /operation_missing/);
  const unknown = await f.server.handle(
    new Request("https://agent.test/rpc", {
      method: "POST",
      headers: { Authorization: "Bearer test", "A2A-Version": "1.0" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "GetTask",
        params: { id: "nonexistent" },
      }),
    }),
  );
  assert.ok((await unknown.json()).error);
  await assert.rejects(
    discoverA2AAgent({
      tenantId: "t",
      entryId: "e",
      ownerId: "o",
      cardUrl: "https://agent.test/card",
      skillCapabilities: { research: "research" },
      validUntil: "2030-01-01",
      network: {
        ...f.network,
        fetch: async () =>
          Response.json({
            name: "old",
            supportedInterfaces: [
              {
                url: "https://agent.test/rpc",
                protocolBinding: "JSONRPC",
                protocolVersion: "0.3",
              },
            ],
            skills: [{ id: "research" }],
          }),
      },
    }),
    /incompatible_card/,
  );
});
test("unknown outcome is not resent; known task survives interrupted streaming and restart", async () => {
  const f = await fixture();
  let sends = 0;
  const client = new A2AClient({
    ...f.options,
    network: {
      ...f.network,
      fetch: async (input, init) => {
        if (init?.method === "POST") {
          sends++;
          throw new Error("connection lost");
        }
        return f.network.fetch(input, init);
      },
    },
  });
  assert.equal((await client.send(input())).status, "uncertain");
  await client.send(input());
  assert.equal(sends, 1);
  assert.equal((await client.reconcile("research", "one")).status, "uncertain");
  assert.equal(sends, 1);
});
test("input-required continuation, cancellation and changed registry fence", async () => {
  const f = await fixture({
    async *execute(request) {
      yield {
        state:
          request.message.parts[0].text === "answer"
            ? "completed"
            : "input_required",
        reply: [{ kind: "text", text: "details?" }],
      };
    },
  });
  const events = [];
  for await (const event of f.client.sendStream(input())) events.push(event);
  assert.equal(events.at(-1).task.state, "input_required");
  const continuation = {
    ...input("two"),
    previousOperationId: "one",
    message: { messageId: "two", parts: [{ kind: "text", text: "answer" }] },
  };
  const more = [];
  for await (const e of f.client.sendStream(continuation)) more.push(e);
  assert.equal(more.at(-1).task.state, "completed");
  assert.equal(more.at(-1).task.taskId, events.at(-1).task.taskId);
  const f2 = await fixture({
    async *execute() {
      yield { state: "input_required" };
    },
  });
  for await (const e of f2.client.sendStream(input())) {
  }
  assert.equal(
    (await f2.client.cancel("research", "one")).task.state,
    "canceled",
  );
  await f.registry.withdraw(principal, "research", 1);
  await assert.rejects(f.client.send(input("three")), /conflict/);
});
test("destination, redirect and response-size policy applies before credentials leak", async () => {
  let credentials = 0;
  const policy = {
    allow: async (url) => url.origin === "https://allowed.test",
    credentials: async () => {
      credentials++;
      return {};
    },
    fetch: async () => new Response("123456"),
    maximumResponseBytes: 3,
  };
  await assert.rejects(
    createA2AFetch(policy, "card")("https://blocked.test"),
    /destination_denied/,
  );
  assert.equal(credentials, 0);
  await assert.rejects(
    (await createA2AFetch(policy, "card")("https://allowed.test")).text(),
    /response_too_large/,
  );
  await assert.rejects(
    createA2AFetch(
      {
        ...policy,
        fetch: async () =>
          new Response("", {
            status: 302,
            headers: { Location: "https://blocked.test" },
          }),
      },
      "card",
    )("https://allowed.test"),
    /redirect_denied/,
  );
});

test("disconnect closes SSE consumption promptly but preserves existing execution for restart reconciliation", async () => {
  let finish;
  const gate = new Promise((resolve) => (finish = resolve));
  let executed = 0;
  let bound;
  const f = await fixture({
    async bind(request) {
      bound = request;
      return { runId: "durable-run" };
    },
    async *execute() {
      executed++;
      yield { state: "working" };
      await gate;
      yield { state: "completed" };
    },
    reconcile: async (request) => ({
      taskId: request.taskId,
      contextId: request.contextId,
      state: "completed",
      artifacts: [],
    }),
  });
  const response = await f.server.handle(
    new Request("https://agent.test/rpc", {
      method: "POST",
      headers: { Authorization: "Bearer test", "A2A-Version": "1.0" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "SendStreamingMessage",
        params: {
          message: {
            messageId: "disconnect",
            role: "ROLE_USER",
            parts: [{ text: "go" }],
          },
        },
      }),
    }),
  );
  const reader = response.body.getReader();
  await reader.read();
  await Promise.race([
    reader.cancel(),
    new Promise((_, reject) => {
      const timer = setTimeout(
        () => reject(new Error("cancel blocked by execution")),
        1000,
      );
      timer.unref();
    }),
  ]);
  assert.equal(executed, 1);
  const restarted = f.restart();
  const snapshot = await restarted.reconcile(principal, bound.taskId);
  assert.equal(snapshot.state, "completed");
  assert.equal(executed, 1);
  finish();
});
test("parallel duplicate sends enter the execution boundary once", async () => {
  const f = await fixture();
  const call = () =>
    f.server.handle(
      new Request("https://agent.test/rpc", {
        method: "POST",
        headers: { Authorization: "Bearer test", "A2A-Version": "1.0" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "SendMessage",
          params: {
            configuration: { returnImmediately: true },
            message: {
              messageId: "parallel",
              role: "ROLE_USER",
              parts: [{ text: "go" }],
            },
          },
        }),
      }),
    );
  const responses = await Promise.all(Array.from({ length: 8 }, call));
  const values = await Promise.all(responses.map((r) => r.json()));
  assert.ok(values.every((v) => !v.error));
  assert.equal(f.runs(), 1);
});
