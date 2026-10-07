import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import type { CreateRunnerTask } from "@agentplat/runner";
import type { RunnerService } from "./runnerService.js";
export interface RunnerRoutesOptions {
  service: RunnerService;
  authenticate: (request: Request) => Promise<string | null> | string | null;
}
export function createRunnerRoutes(
  options: RunnerRoutesOptions,
): Hono<{ Variables: { tenant: string } }> {
  const app = new Hono<{ Variables: { tenant: string } }>();
  const requireTenant: MiddlewareHandler<{
    Variables: { tenant: string };
  }> = async (c, next) => {
    const tenant = await options.authenticate(c.req.raw);
    if (!tenant?.trim()) return c.json({ error: "Unauthorized" }, 401);
    c.set("tenant", tenant.trim());
    await next();
  };
  app.use("/api/runner-tasks", requireTenant);
  app.use("/api/runner-tasks/*", requireTenant);
  app.use("/api/runners", requireTenant);
  app.post("/api/runner-tasks", async (c) => {
    let input: CreateRunnerTask;
    try {
      input = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }
    try {
      return c.json(
        { data: await options.service.create(c.get("tenant"), input) },
        201,
      );
    } catch (e) {
      if (e instanceof TypeError) return c.json({ error: e.message }, 400);
      throw e;
    }
  });
  app.get("/api/runner-tasks/:id", async (c) => {
    const task = await options.service.get(c.get("tenant"), c.req.param("id"));
    return task
      ? c.json({ data: task })
      : c.json({ error: "Task not found" }, 404);
  });
  app.get("/api/runners", async (c) =>
    c.json({ data: await options.service.list(c.get("tenant")) }),
  );
  return app;
}
