import { AgentPlatRunnerClient } from "../../packages/runner/dist/index.js";

const tenantId = process.env.AGENTPLAT_RUNNER_TENANT;
const token = process.env.AGENTPLAT_RUNNER_KEY;
if (!tenantId || !token)
  throw new Error("Set AGENTPLAT_RUNNER_TENANT and AGENTPLAT_RUNNER_KEY");
const runnerId = process.env.AGENTPLAT_RUNNER_ID ?? "local-backup";
const client = new AgentPlatRunnerClient({
  url: process.env.AGENTPLAT_RUNNER_URL ?? "ws://127.0.0.1:3010/ws/runners",
  tenantId,
  token,
  runnerId,
  name: "Local diagnostic worker",
  capabilities: ["diagnostic"],
  concurrencyLimit: 1,
  onError: () => console.error("Diagnostic worker connection error"),
});
client.registerHandler("runner.probe", async (payload) => ({
  runnerId,
  runtime: "node",
  payload,
}));
client.connect();
console.log(`Diagnostic worker started: ${runnerId}`);
process.once("SIGINT", () => client.disconnect());
process.once("SIGTERM", () => client.disconnect());
