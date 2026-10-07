import { randomUUID } from "node:crypto";
import type { Server, IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import type { RunnerRegistration, RunnerMessage } from "@agentplat/runner";
import { capabilities, nonempty, RunnerService } from "./runnerService.js";
export interface RunnerHubOptions {
  /** Verify the credential AND its authorization for requestedTenant. Never trust the tenant header alone. */
  authenticate: (
    request: IncomingMessage,
    requestedTenant: string,
    credential: string,
  ) => boolean | Promise<boolean>;
  heartbeatMs?: number;
  reaperMs?: number;
  onError?: (error: unknown) => void;
}
interface Connection {
  ws: WebSocket;
  tenant: string;
  session: string;
  runner?: RunnerRegistration;
  alive: boolean;
  active: Map<string, string>;
}
export class RunnerHub {
  private wss = new WebSocketServer({
    noServer: true,
    maxPayload: 1024 * 1024,
  });
  private connections = new Set<Connection>();
  private dispatch?: Promise<void>;
  private closed = false;
  private heartbeat: ReturnType<typeof setInterval>;
  private reaper: ReturnType<typeof setInterval>;
  constructor(
    private server: Server,
    private service: RunnerService,
    private options: RunnerHubOptions,
  ) {
    server.on("upgrade", this.upgrade);
    this.heartbeat = setInterval(() => {
      for (const c of this.connections) {
        if (!c.alive) {
          c.ws.terminate();
          continue;
        }
        c.alive = false;
        c.ws.ping();
        c.ws.send(JSON.stringify({ type: "ping" }));
      }
    }, options.heartbeatMs ?? 20_000);
    this.reaper = setInterval(() => {
      void this.tick().catch((e) => options.onError?.(e));
    }, options.reaperMs ?? 5_000);
    this.heartbeat.unref();
    this.reaper.unref();
  }
  private upgrade = (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): void => {
    const reject = () => {
      socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    };
    void (async () => {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (url.pathname !== "/ws/runners") return;
      const tenant = String(
        request.headers["x-tenant-id"] ??
          url.searchParams.get("tenantId") ??
          "",
      );
      const token = String(
        request.headers["x-agentplat-key"] ??
          url.searchParams.get("token") ??
          "",
      );
      if (
        this.closed ||
        !nonempty(tenant) ||
        !token ||
        !(await this.options.authenticate(request, tenant, token))
      ) {
        reject();
        return;
      }
      if (this.closed || socket.destroyed) {
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(request, socket, head, (ws) =>
        this.accept(ws, tenant),
      );
    })().catch((e) => {
      this.options.onError?.(e);
      reject();
    });
  };
  private accept(ws: WebSocket, tenant: string): void {
    const c: Connection = {
      ws,
      tenant,
      session: randomUUID(),
      alive: true,
      active: new Map(),
    };
    this.connections.add(c);
    const registrationTimeout = setTimeout(() => {
      if (!c.runner) ws.terminate();
    }, 10_000);
    registrationTimeout.unref();
    let chain = Promise.resolve();
    ws.on("message", (data) => {
      chain = chain
        .then(() =>
          this.message(c, JSON.parse(data.toString()) as RunnerMessage),
        )
        .catch((e) => {
          this.options.onError?.(e);
          ws.close(1008, "Invalid runner message");
        });
    });
    ws.on("pong", () => {
      chain = chain
        .then(() => this.touch(c))
        .catch((e) => {
          this.options.onError?.(e);
          ws.terminate();
        });
    });
    ws.on("error", (e) => this.options.onError?.(e));
    ws.on("close", () => {
      clearTimeout(registrationTimeout);
      this.connections.delete(c);
      chain = chain
        .then(async () => {
          if (c.runner)
            await this.service.repository.disconnect(
              tenant,
              c.runner.runnerId,
              c.session,
            );
          await this.tick();
        })
        .catch((e) => this.options.onError?.(e));
    });
  }
  private async touch(c: Connection): Promise<void> {
    if (
      c.runner &&
      !(await this.service.repository.heartbeat(
        c.tenant,
        c.runner.runnerId,
        c.session,
      ))
    ) {
      c.ws.close(1008, "Expired runner session");
      return;
    }
    c.alive = true;
  }
  private async message(c: Connection, m: RunnerMessage): Promise<void> {
    if (m.type === "register") {
      const r = m.runner;
      if (
        c.runner ||
        !r ||
        !nonempty(r.runnerId) ||
        !nonempty(r.name) ||
        !capabilities(r.capabilities) ||
        !Number.isInteger(r.concurrencyLimit) ||
        r.concurrencyLimit < 1 ||
        r.concurrencyLimit > 1024
      )
        throw new TypeError("Invalid runner registration");
      if (!(await this.service.repository.register(c.tenant, r, c.session)))
        throw new Error("Runner already online");
      c.runner = r;
      if (c.ws.readyState === WebSocket.OPEN)
        c.ws.send(JSON.stringify({ type: "registered" }));
      await this.tick();
      return;
    }
    if (!c.runner) throw new Error("Register first");
    if (m.type === "pong") {
      await this.touch(c);
      return;
    }
    if (
      (m.type !== "completed" && m.type !== "failed") ||
      !nonempty(m.taskId) ||
      !nonempty(m.leaseId) ||
      (m.type === "failed" && typeof m.error !== "string")
    )
      throw new TypeError("Invalid result");
    await this.service.repository.complete(
      c.tenant,
      c.runner.runnerId,
      c.session,
      m.taskId,
      m.leaseId,
      m.type,
      m.result ?? null,
      m.error ?? null,
    );
    if (c.active.get(m.leaseId) === m.taskId) c.active.delete(m.leaseId);
    await this.tick();
  }
  tick(): Promise<void> {
    if (this.closed) return Promise.resolve();
    if (this.dispatch) return this.dispatch;
    this.dispatch = this.dispatchTasks().finally(() => {
      this.dispatch = undefined;
    });
    return this.dispatch;
  }
  private async dispatchTasks(): Promise<void> {
    await this.service.repository.reap();
    for (const c of this.connections) {
      if (!c.runner || c.ws.readyState !== WebSocket.OPEN) continue;
      for (let n = 0; n < c.runner.concurrencyLimit; n++) {
        // Expired leases remain locally occupied until the worker finishes or disconnects.
        if (c.active.size >= c.runner.concurrencyLimit) break;
        const task = await this.service.repository.claim(
          c.tenant,
          c.runner.runnerId,
          c.session,
        );
        if (!task) break;
        if (c.ws.readyState !== WebSocket.OPEN) {
          await this.service.repository.disconnect(
            c.tenant,
            c.runner.runnerId,
            c.session,
          );
          break;
        }
        if (!task.leaseId)
          throw new Error("Claimed task is missing its lease token");
        c.active.set(task.leaseId, task.id);
        c.ws.send(JSON.stringify({ type: "task", task }));
      }
    }
  }
  async close(): Promise<void> {
    this.closed = true;
    clearInterval(this.heartbeat);
    clearInterval(this.reaper);
    this.server.off("upgrade", this.upgrade);
    await this.dispatch;
    for (const c of this.connections) {
      c.ws.terminate();
      if (c.runner)
        await this.service.repository.disconnect(
          c.tenant,
          c.runner.runnerId,
          c.session,
        );
    }
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
  }
}
