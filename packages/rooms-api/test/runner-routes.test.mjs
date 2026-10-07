import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { createRoomsApp } from "../dist/index.js";
test("optionally mounts runner routes on the existing Rooms HTTP application", async () => {
  const runnerRoutes = new Hono();
  runnerRoutes.get("/api/runners", (c) => c.json({ data: [] }));
  const app = createRoomsApp({ service: {}, runnerRoutes });
  const response = await app.request("/api/runners");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: [] });
  assert.equal((await app.request("/health")).status, 200);
});
