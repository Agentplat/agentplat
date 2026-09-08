import assert from "node:assert/strict";
import test from "node:test";
import { createProposalProvider } from "../examples/rooms-api/src/proposal-provider.mjs";
import { DefaultAgentRuntime } from "@agentplat/runtime";

test("proposal defaults to deterministic output without a model endpoint", async () => {
  const runtime = new DefaultAgentRuntime();
  runtime.registerProvider("proposal", await createProposalProvider({}));
  const result = await runtime.run(
    { id: "writer", tenantId: "demo", name: "Writer", platform: "proposal" },
    { input: "Four-week internal pilot" },
    { tenant: { tenantId: "demo" }, agentId: "writer" },
  );
  assert.equal(result.status, "completed");
  assert.match(result.output, /Deterministic proposal/);
  assert.match(result.output, /Four-week internal pilot/);
});

test("proposal rejects unknown modes and incomplete live configuration", async () => {
  await assert.rejects(
    createProposalProvider({ PROPOSAL_MODEL_MODE: "typo" }),
    /must be mock or live/,
  );
  await assert.rejects(
    createProposalProvider({ PROPOSAL_MODEL_MODE: "live" }),
    /requires/,
  );
  await assert.rejects(
    createProposalProvider({
      PROPOSAL_MODEL_MODE: "live",
      PROPOSAL_MODEL: "example",
      PROPOSAL_BASE_URL: "http://localhost:1234/v1",
    }),
    /API_KEY/,
  );
});

test("explicit keyless live provider constructs without issuing inference", async () => {
  const provider = await createProposalProvider({
    PROPOSAL_MODEL_MODE: "live",
    PROPOSAL_MODEL: "example",
    PROPOSAL_BASE_URL: "http://localhost:1234/v1",
    PROPOSAL_ALLOW_KEYLESS: "true",
  });
  assert.equal(typeof provider.run, "function");
});

test("live variant uses the configured adapter against a local fake endpoint", async () => {
  const { createServer } = await import("node:http");
  const { once } = await import("node:events");
  let captured;
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    captured = { url: request.url, body: JSON.parse(body) };
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        id: "local-fixture",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Reviewed local proposal" },
            finish_reason: "stop",
          },
        ],
      }),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const runtime = new DefaultAgentRuntime();
    runtime.registerProvider(
      "proposal",
      await createProposalProvider({
        PROPOSAL_MODEL_MODE: "live",
        PROPOSAL_MODEL: "fixture-model",
        PROPOSAL_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`,
        PROPOSAL_ALLOW_KEYLESS: "true",
      }),
    );
    const result = await runtime.run(
      { id: "writer", tenantId: "demo", name: "Writer", platform: "proposal" },
      { input: "Draft the pilot" },
      { tenant: { tenantId: "demo" }, agentId: "writer" },
    );
    assert.equal(result.output, "Reviewed local proposal");
    assert.equal(captured.url, "/v1/chat/completions");
    assert.equal(captured.body.model, "fixture-model");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
