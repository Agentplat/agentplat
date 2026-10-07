import assert from "node:assert/strict";
import vm from "node:vm";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { WebSocket } from "ws";
import { AgentPlatRunnerClient } from "@agentplat/runner";
import { AgentPlatRunnerClient as SubpathClient } from "@agentplat/runner/client";
import {
  PostgresRunnerRepository,
  RunnerService,
  RunnerHub,
  createRunnerRoutes,
} from "@agentplat/runner-hub";
assert.equal(AgentPlatRunnerClient, SubpathClient);
const entry = import.meta.resolve("@agentplat/runner-hub");
for (const direction of ["up", "down"])
  assert.ok(
    (
      await readFile(
        new URL(`../migrations/001_runners.${direction}.sql`, entry),
        "utf8",
      )
    ).length > 0,
  );
if (!process.env.RUNNER_TEST_DATABASE_URL) {
  console.log(
    "Packed imports and migrations verified; PostgreSQL scenario skipped (set RUNNER_TEST_DATABASE_URL).",
  );
} else {
  const pool = new Pool({
    connectionString: process.env.RUNNER_TEST_DATABASE_URL,
  });
  const schema = `runner_consumer_${process.pid}`;
  const repo = new PostgresRunnerRepository(pool, schema);
  const service = new RunnerService(repo);
  const credentials = new Map([
    ["a", "key-a"],
    ["b", "key-b"],
  ]);
  const routes = createRunnerRoutes({
    service,
    authenticate: (request) => {
      const tenant = request.headers.get("x-tenant-id");
      return credentials.get(tenant) === request.headers.get("x-agentplat-key")
        ? tenant
        : null;
    },
  });
  const errors = [];
  const clients = [];
  let hub;
  const server = createServer(async (request, response) => {
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const result = await routes.fetch(
        new Request(`http://localhost${request.url}`, {
          method: request.method,
          headers: request.headers,
          ...(body.length ? { body } : {}),
        }),
      );
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(await result.text());
    } catch (error) {
      errors.push(error);
      response.writeHead(500);
      response.end();
    }
  });
  const wait = async (predicate) => {
    for (let i = 0; i < 300; i++) {
      if (await predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw Error("Consumer condition timed out");
  };
  await pool.query(`CREATE SCHEMA ${schema}`);
  try {
    await repo.migrate();
    await repo.migrate();
    hub = new RunnerHub(server, service, {
      authenticate: (_request, tenant, token) =>
        credentials.get(tenant) === token,
      reaperMs: 30,
      heartbeatMs: 200,
      onError: (e) => errors.push(e),
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    const headers = (tenant) => ({
      "x-tenant-id": tenant,
      "x-agentplat-key": credentials.get(tenant),
      "content-type": "application/json",
    });
    const create = async (body) => {
      const response = await fetch(`${base}/api/runner-tasks`, {
        method: "POST",
        headers: headers("a"),
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 201);
      return (await response.json()).data;
    };
    const get = async (id) =>
      (
        await (
          await fetch(`${base}/api/runner-tasks/${id}`, {
            headers: headers("a"),
          })
        ).json()
      ).data;
    const runner = (id, tenant, handler) => {
      const c = new AgentPlatRunnerClient({
        url: `${base.replace("http:", "ws:")}/ws/runners`,
        tenantId: tenant,
        token: credentials.get(tenant),
        runnerId: id,
        name: id,
        capabilities: ["local"],
        concurrencyLimit: 1,
        socketFactory:
          id === "second" && typeof globalThis.WebSocket === "function"
            ? undefined
            : (url) => new WebSocket(url),
        onError: (e) => errors.push(e),
      });
      c.registerHandler("execute", handler);
      c.connect();
      clients.push(c);
      return c;
    };
    let started = false;
    const first = runner("first", "a", async () => {
      started = true;
      return new Promise(() => {});
    });
    await wait(async () =>
      (await repo.list("a")).some((r) => r.status === "online"),
    );
    const foreign = runner("foreign", "b", async () => {
      throw Error("Cross-tenant dispatch");
    });
    const task = await create({
      action: "execute",
      payload: { value: 7 },
      requiredCapabilities: ["local"],
    });
    await wait(async () => started);
    const replacement = runner("second", "a", async (payload) => ({
      received: payload,
    }));
    await wait(async () => (await repo.list("a")).length === 2);
    first.disconnect();
    await wait(async () => (await get(task.id)).status === "completed");
    const complete = await get(task.id);
    assert.equal(complete.retries, 1);
    assert.deepEqual(complete.result, { received: { value: 7 } });
    assert.equal(
      (
        await fetch(`${base}/api/runner-tasks/${task.id}`, {
          headers: headers("b"),
        })
      ).status,
      404,
    );
    const unmatched = await create({
      action: "execute",
      payload: null,
      requiredCapabilities: ["missing"],
    });
    await hub.tick();
    assert.equal((await get(unmatched.id)).status, "pending");
    replacement.disconnect();
    await wait(async () =>
      (await repo.list("a")).every((r) => r.status === "offline"),
    );
    runner("timeout", "a", async () => new Promise(() => {}));
    await wait(async () =>
      (await repo.list("a")).some((r) => r.status === "online"),
    );
    const timed = await create({
      action: "execute",
      payload: null,
      timeoutSeconds: 1,
      maxRetries: 1,
    });
    await wait(async () => (await get(timed.id)).status === "failed");
    assert.equal((await get(timed.id)).retries, 1);
    if (
      process.env.RUNNER_BROWSER_BUNDLE_PATH ||
      process.env.RUNNER_BROWSER_BRIDGE_PATH
    ) {
      assert.ok(
        process.env.RUNNER_BROWSER_BUNDLE_PATH &&
          process.env.RUNNER_BROWSER_BRIDGE_PATH,
        "Both browser bundle and bridge paths are required",
      );
      let storageListener;
      const context = vm.createContext({
        URL,
        WebSocket: globalThis.WebSocket ?? WebSocket,
        setTimeout,
        clearTimeout,
        console: { warn: (message) => errors.push(message) },
        chrome: {
          runtime: { getManifest: () => ({ version: "test" }) },
          storage: {
            local: {
              get: async () => ({
                agentplatRunnerConfig: {
                  enabled: true,
                  url: `${base.replace("http:", "ws:")}/ws/runners`,
                  tenantId: "a",
                  token: credentials.get("a"),
                  runnerId: "browser-worker",
                },
              }),
            },
            onChanged: {
              addListener: (listener) => {
                storageListener = listener;
              },
            },
          },
        },
      });
      try {
        vm.runInContext(
          await readFile(process.env.RUNNER_BROWSER_BUNDLE_PATH, "utf8"),
          context,
        );
        vm.runInContext(
          await readFile(process.env.RUNNER_BROWSER_BRIDGE_PATH, "utf8"),
          context,
        );
        await wait(async () =>
          (await repo.list("a")).some(
            (r) => r.runnerId === "browser-worker" && r.status === "online",
          ),
        );
        const probe = await create({
          action: "runner.probe",
          payload: { value: 9 },
          requiredCapabilities: ["browser", "chrome-extension"],
        });
        await wait(async () => (await get(probe.id)).status === "completed");
        const completed = await get(probe.id);
        assert.equal(completed.result.runnerId, "browser-worker");
        assert.deepEqual(completed.result.payload, { value: 9 });
        console.log(
          "External classic worker bundle and bridge passed a real Hub task using native WebSocket (Chrome storage simulated).",
        );
      } finally {
        storageListener?.(
          { agentplatRunnerConfig: { newValue: undefined } },
          "local",
        );
      }
    }
    assert.deepEqual(errors, []);
    void foreign;
    console.log(
      "Packed consumer passed real HTTP polling, WebSocket SDK, tenant isolation, disconnect reassignment and lease dead-letter.",
    );
  } finally {
    for (const client of clients) client.disconnect();
    await hub?.close();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    await pool.query(`DROP SCHEMA ${schema} CASCADE`);
    await pool.end();
  }
}
