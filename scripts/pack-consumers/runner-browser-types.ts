import { AgentPlatRunnerClient, type RunnerSocket } from "@agentplat/runner";
import { AgentPlatRunnerClient as SubpathClient } from "@agentplat/runner/client";
const socket: RunnerSocket = new WebSocket("wss://localhost/ws/runners");
const client = new AgentPlatRunnerClient({
  url: "wss://localhost/ws/runners",
  tenantId: "tenant",
  token: "test",
  runnerId: "test",
  name: "Test",
  capabilities: ["browser"],
  concurrencyLimit: 1,
  socketFactory: (url) => new WebSocket(url),
});
client.registerHandler("execute", async (payload) => ({ received: payload }));
void socket;
void SubpathClient;
