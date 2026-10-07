import { createServer } from "node:http";
import { Pool } from "pg";
import { WebSocket } from "ws";
import {
  AgentPlatRunnerClient,
  type JsonValue,
  type RunnerSocket,
} from "@agentplat/runner";
import {
  PostgresRunnerRepository,
  RunnerService,
  RunnerHub,
  createRunnerRoutes,
} from "@agentplat/runner-hub";
const pool = new Pool();
const repo = new PostgresRunnerRepository(pool);
const service = new RunnerService(repo);
const hub = new RunnerHub(createServer(), service, {
  authenticate: async (_request, tenant, token) => Boolean(tenant && token),
});
const socket: RunnerSocket = new WebSocket("ws://localhost/ws/runners");
const client = new AgentPlatRunnerClient({
  url: "ws://localhost/ws/runners",
  tenantId: "tenant",
  token: "test",
  runnerId: "test",
  name: "Test",
  capabilities: [],
  concurrencyLimit: 1,
  socketFactory: (url) => new WebSocket(url),
});
client.registerHandler("execute", async (payload: JsonValue) => payload);
const routes = createRunnerRoutes({ service, authenticate: () => null });
void socket;
void routes;
void hub;
