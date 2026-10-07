import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { Pool } from "pg";
import { Hono } from "hono";
import { createServer } from "node:http";
import { once } from "node:events";
import { WebSocket } from "ws";
import { AgentPlatRunnerClient } from "@agentplat/runner";
import {
  PostgresRunnerRepository,
  RunnerService,
  RunnerHub,
  createRunnerRoutes,
} from "../src/index.js";
const database = process.env.RUNNER_TEST_DATABASE_URL;
const suite = database ? describe : describe.skip;
const wait = async (predicate: () => Promise<boolean>) => {
  for (let i = 0; i < 500; i++) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("Condition timed out");
};
suite("PostgreSQL + real WebSocket runner hub", () => {
  const pool = new Pool({ connectionString: database });
  const schema = `runner_test_${process.pid}`;
  const repo = new PostgresRunnerRepository(pool, schema);
  const service = new RunnerService(repo);
  const server = createServer();
  let hub: RunnerHub;
  let address: string;
  const sockets: WebSocket[] = [];
  const errors: unknown[] = [];
  const connect = async (
    id: string,
    tenant = "a",
    caps = ["browser"],
    concurrency = 1,
  ) => {
    const ws = new WebSocket(
      `${address}?tenantId=${tenant}&token=key-${tenant}`,
    );
    sockets.push(ws);
    const tasks: any[] = [];
    let registered = false;
    ws.on("message", (raw) => {
      const m = JSON.parse(String(raw));
      if (m.type === "registered") registered = true;
      if (m.type === "task") tasks.push(m.task);
      if (m.type === "ping") ws.send('{"type":"pong"}');
    });
    await once(ws, "open");
    ws.send(
      JSON.stringify({
        type: "register",
        runner: {
          runnerId: id,
          name: id,
          capabilities: caps,
          concurrencyLimit: concurrency,
        },
      }),
    );
    await wait(async () => registered);
    return { ws, tasks };
  };
  beforeAll(async () => {
    await pool.query(`CREATE SCHEMA ${schema}`);
    await repo.migrate();
    await repo.migrate();
    hub = new RunnerHub(server, service, {
      authenticate: (_r, t, k) => k === `key-${t}`,
      reaperMs: 50,
      heartbeatMs: 1_000,
      onError: (e) => errors.push(e),
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    address = `ws://127.0.0.1:${(server.address() as { port: number }).port}/ws/runners`;
  });
  beforeEach(async () => {
    for (const ws of sockets) ws.terminate();
    sockets.length = 0;
    await wait(
      async () =>
        !(await repo.list("a")).some((r) => r.status === "online") &&
        !(await repo.list("b")).some((r) => r.status === "online"),
    );
    await pool.query(
      `TRUNCATE ${schema}.agentplat_runners,${schema}.agentplat_runner_tasks`,
    );
  });
  afterAll(async () => {
    await hub?.close();
    server.close();
    await pool.query(`DROP SCHEMA ${schema} CASCADE`);
    await pool.end();
  });
  it("registers runners; tenant and capability isolation; concurrency and completion", async () => {
    const a = await connect("same");
    const b = await connect("same", "b");
    const unmatched = await service.create("a", {
      action: "execute",
      payload: null,
      requiredCapabilities: ["desktop"],
    });
    const task = await service.create("a", {
      action: "execute",
      payload: { value: 1 },
      requiredCapabilities: ["browser"],
    });
    const second = await service.create("a", {
      action: "execute",
      payload: null,
    });
    await hub.tick();
    await wait(async () => a.tasks.length >= 1);
    expect(a.tasks).toHaveLength(1);
    expect(b.tasks).toHaveLength(0);
    expect((await repo.get("a", unmatched.id))?.status).toBe("pending");
    expect(await repo.get("b", task.id)).toBeUndefined();
    const lease = a.tasks[0];
    a.ws.send(
      JSON.stringify({
        type: "completed",
        taskId: task.id,
        leaseId: lease.leaseId,
        result: { ok: true },
      }),
    );
    await wait(
      async () => (await repo.get("a", task.id))?.status === "completed",
    );
    await wait(async () => a.tasks.length >= 2);
    expect(a.tasks[1].id).toBe(second.id);
  });
  it("expires leases, reassigns and rejects old ACKs; dead letters at max retries", async () => {
    const a = await connect("a");
    const b = await connect("b");
    const task = await service.create("a", {
      action: "execute",
      payload: null,
      maxRetries: 2,
    });
    await hub.tick();
    await wait(async () => a.tasks.length >= 1);
    const old = a.tasks[0];
    // Keep the original runner occupied so reassignment selects the other runner.
    a.ws.terminate();
    await wait(async () => b.tasks.length === 1);
    expect(b.tasks[0].leaseId).not.toBe(old.leaseId);
    expect(b.tasks[0].retries).toBe(1);
    expect(
      await repo.complete(
        "a",
        "a",
        "old",
        task.id,
        old.leaseId,
        "completed",
        null,
        null,
      ),
    ).toBe(false);
    await pool.query(
      `UPDATE ${schema}.agentplat_runner_tasks SET lease_expires_at=NOW()-INTERVAL '1 second' WHERE id=$1`,
      [task.id],
    );
    await hub.tick();
    expect((await repo.get("a", task.id))?.status).toBe("failed");
    expect((await repo.get("a", task.id))?.retries).toBe(2);
  });
  it("reassigns expired leases to another available runner and ignores late receipts", async () => {
    const a = await connect("a");
    const b = await connect("b");
    const task = await service.create("a", {
      action: "execute",
      payload: null,
      timeoutSeconds: 1,
    });
    await wait(async () => b.tasks.length === 1);
    expect(a.tasks).toHaveLength(1);
    expect(b.tasks[0].id).toBe(task.id);
    expect(b.tasks[0].retries).toBe(1);
    expect(b.tasks[0].leaseId).not.toBe(a.tasks[0].leaseId);
    a.ws.send(
      JSON.stringify({
        type: "completed",
        taskId: task.id,
        leaseId: a.tasks[0].leaseId,
        result: { late: true },
      }),
    );
    const next = await service.create("a", {
      action: "execute",
      payload: null,
    });
    await wait(async () => a.tasks.length === 2);
    expect(a.tasks[1].id).toBe(next.id);
    expect((await repo.get("a", task.id))?.assignedRunnerId).toBe("b");
    expect((await repo.get("a", task.id))?.status).toBe("leased");
  });
  it("a hung SDK handler does not fail reassignment while a healthy SDK runner is available", async () => {
    const options = {
      url: address,
      tenantId: "a",
      token: "key-a",
      name: "SDK",
      capabilities: [],
      concurrencyLimit: 1,
      socketFactory: (url: string) => new WebSocket(url),
    };
    const slow = new AgentPlatRunnerClient({ ...options, runnerId: "slow" });
    const healthy = new AgentPlatRunnerClient({
      ...options,
      runnerId: "healthy",
    });
    let started = false;
    slow.registerHandler("execute", async () => {
      started = true;
      return new Promise(() => {});
    });
    healthy.registerHandler("execute", async (payload) => ({
      received: payload,
    }));
    slow.connect();
    try {
      await wait(async () =>
        (await repo.list("a")).some((r) => r.runnerId === "slow"),
      );
      healthy.connect();
      await wait(async () => (await repo.list("a")).length === 2);
      const task = await service.create("a", {
        action: "execute",
        payload: { value: 1 },
        timeoutSeconds: 1,
      });
      await wait(async () => started);
      await wait(
        async () => (await repo.get("a", task.id))?.status === "completed",
      );
      const completed = await repo.get("a", task.id);
      expect(completed?.assignedRunnerId).toBe("healthy");
      expect(completed?.retries).toBe(1);
      expect(completed?.result).toEqual({ received: { value: 1 } });
    } finally {
      slow.disconnect();
      healthy.disconnect();
    }
  });
  it("REST authenticates tenants, validates input and supports polling", async () => {
    const routes = createRunnerRoutes({
      service,
      authenticate: (r) =>
        r.headers.get("x-agentplat-key") === "key-a"
          ? r.headers.get("x-tenant-id") === "a"
            ? "a"
            : null
          : null,
    });
    const parent = new Hono();
    parent.route("/", routes);
    parent.get("/health", (c) => c.json({ status: "ok" }));
    expect((await parent.request("/health")).status).toBe(200);
    expect((await routes.request("/api/runners")).status).toBe(401);
    const headers = {
      "x-tenant-id": "a",
      "x-agentplat-key": "key-a",
      "content-type": "application/json",
    };
    expect(
      (
        await routes.request("/api/runner-tasks", {
          method: "POST",
          headers,
          body: "{}",
        })
      ).status,
    ).toBe(400);
    const response = await routes.request("/api/runner-tasks", {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "execute", payload: null, tenantId: "b" }),
    });
    expect(response.status).toBe(201);
    const { data } = await response.json();
    expect(data.tenantId).toBe("a");
    expect(
      (await routes.request(`/api/runner-tasks/${data.id}`, { headers }))
        .status,
    ).toBe(200);
  });
  it("SDK executes registered handlers and reports errors", async () => {
    const client = new AgentPlatRunnerClient({
      url: address,
      tenantId: "a",
      token: "key-a",
      runnerId: "sdk",
      name: "SDK",
      capabilities: [],
      concurrencyLimit: 1,
      socketFactory: (url) =>
        new WebSocket(url) as unknown as globalThis.WebSocket,
    });
    client.registerHandler("execute", async (payload) => payload);
    client.connect();
    try {
      await wait(async () => (await repo.list("a")).length === 1);
      const task = await service.create("a", {
        action: "execute",
        payload: { ok: true },
      });
      await wait(
        async () => (await repo.get("a", task.id))?.status === "completed",
      );
      expect((await repo.get("a", task.id))?.result).toEqual({ ok: true });
      const failed = await service.create("a", {
        action: "unknown",
        payload: null,
      });
      await wait(
        async () => (await repo.get("a", failed.id))?.status === "failed",
      );
    } finally {
      client.disconnect();
    }
  });
  it("rejects unauthorized WebSocket handshakes", async () => {
    const ws = new WebSocket(`${address}?tenantId=b&token=key-a`);
    const code = await new Promise<number>((resolve) => {
      ws.on("unexpected-response", (_request, response) => {
        resolve(response.statusCode!);
        response.resume();
        ws.terminate();
      });
      ws.on("error", () => {});
    });
    expect(code).toBe(401);
  });
  it("claims atomically across concurrent dispatchers and enforces shared capacity", async () => {
    await repo.register(
      "a",
      {
        runnerId: "shared",
        name: "shared",
        capabilities: [],
        concurrencyLimit: 2,
      },
      "session",
    );
    for (let i = 0; i < 4; i++)
      await service.create("a", { action: "execute", payload: null });
    const results = await Promise.all(
      Array.from({ length: 8 }, () => repo.claim("a", "shared", "session")),
    );
    const claimed = results.filter(Boolean);
    expect(claimed).toHaveLength(2);
    expect(new Set(claimed.map((t) => t!.id)).size).toBe(2);
    await repo.disconnect("a", "shared", "session");
  });
  it("recovers orphan leases after Hub heartbeat expiry", async () => {
    await repo.register(
      "a",
      {
        runnerId: "orphan",
        name: "orphan",
        capabilities: [],
        concurrencyLimit: 1,
      },
      "session",
    );
    const task = await service.create("a", {
      action: "execute",
      payload: null,
    });
    await repo.claim("a", "orphan", "session");
    await pool.query(
      `UPDATE ${schema}.agentplat_runners SET last_heartbeat=NOW()-INTERVAL '61 seconds' WHERE id='orphan'`,
    );
    await repo.reap();
    expect((await repo.get("a", task.id))?.status).toBe("pending");
    expect((await repo.list("a"))[0].status).toBe("offline");
  });
  it("fences late receipts and stale sessions, and permits reconnect after disconnect", async () => {
    const registration = {
      runnerId: "fence",
      name: "fence",
      capabilities: [],
      concurrencyLimit: 1,
    };
    expect(await repo.register("a", registration, "first")).toBe(true);
    expect(await repo.register("a", registration, "second")).toBe(false);
    const task = await service.create("a", {
      action: "execute",
      payload: null,
    });
    const lease = await repo.claim("a", "fence", "first");
    expect(
      await repo.complete(
        "a",
        "fence",
        "first",
        task.id,
        "wrong",
        "completed",
        null,
        null,
      ),
    ).toBe(false);
    expect(
      await repo.complete(
        "b",
        "fence",
        "first",
        task.id,
        lease!.leaseId!,
        "completed",
        null,
        null,
      ),
    ).toBe(false);
    await pool.query(
      `UPDATE ${schema}.agentplat_runner_tasks SET lease_expires_at=NOW()-INTERVAL '1 second' WHERE id=$1`,
      [task.id],
    );
    expect(
      await repo.complete(
        "a",
        "fence",
        "first",
        task.id,
        lease!.leaseId!,
        "completed",
        null,
        null,
      ),
    ).toBe(false);
    await repo.disconnect("a", "fence", "first");
    expect(await repo.register("a", registration, "second")).toBe(true);
    await repo.disconnect("a", "fence", "first");
    expect((await repo.list("a"))[0].status).toBe("online");
    await repo.disconnect("a", "fence", "second");
  });
  it("terminates a runner that stops answering heartbeats and reassigns its task", async () => {
    const silent = new WebSocket(`${address}?tenantId=a&token=key-a`, {
      autoPong: false,
    });
    sockets.push(silent);
    let assigned = false;
    silent.on("message", (raw) => {
      if (JSON.parse(String(raw)).type === "task") assigned = true;
    });
    await once(silent, "open");
    silent.send(
      JSON.stringify({
        type: "register",
        runner: {
          runnerId: "silent",
          name: "Silent",
          capabilities: [],
          concurrencyLimit: 1,
        },
      }),
    );
    await wait(async () =>
      (await repo.list("a")).some((r) => r.runnerId === "silent"),
    );
    const task = await service.create("a", {
      action: "execute",
      payload: null,
    });
    await hub.tick();
    await wait(async () => assigned);
    const replacement = await connect("replacement");
    await wait(async () => replacement.tasks.length === 1);
    expect(replacement.tasks[0].id).toBe(task.id);
    expect(replacement.tasks[0].retries).toBe(1);
  });
  it("keeps repository operations free of unexpected errors", () =>
    expect(errors).toEqual([]));
});
describe("task validation", () => {
  it("rejects invalid retries and capabilities before repository access", async () => {
    const service = new RunnerService({} as any);
    await expect(
      service.create("a", { action: "execute", payload: null, maxRetries: 0 }),
    ).rejects.toThrow(TypeError);
    await expect(
      service.create("a", {
        action: "execute",
        payload: null,
        requiredCapabilities: [""],
      }),
    ).rejects.toThrow(TypeError);
  });
});
