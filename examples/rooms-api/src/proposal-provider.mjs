import { ChatAgentProvider } from "@agentplat/runtime";
import { MockAgentProvider } from "@agentplat/runtime-mock";

// No model call occurs unless the host explicitly selects live mode.
export async function createProposalProvider(env = process.env) {
  const mode = env.PROPOSAL_MODEL_MODE ?? "mock";
  if (mode === "mock")
    return new MockAgentProvider({ outputPrefix: "Deterministic proposal" });
  if (mode !== "live")
    throw new Error("PROPOSAL_MODEL_MODE must be mock or live");
  if (!env.PROPOSAL_MODEL || !env.PROPOSAL_BASE_URL) {
    throw new Error("Live mode requires PROPOSAL_MODEL and PROPOSAL_BASE_URL");
  }
  if (!env.PROPOSAL_API_KEY && env.PROPOSAL_ALLOW_KEYLESS !== "true") {
    throw new Error(
      "Set PROPOSAL_API_KEY or explicitly enable PROPOSAL_ALLOW_KEYLESS",
    );
  }
  const { chatModel } = await import("@agentplat/model-openai-compatible");
  return new ChatAgentProvider(
    chatModel({
      provider: "compatible",
      baseURL: env.PROPOSAL_BASE_URL,
      defaultModel: env.PROPOSAL_MODEL,
      apiKey: env.PROPOSAL_API_KEY,
      requireApiKey: env.PROPOSAL_ALLOW_KEYLESS !== "true",
    }),
  );
}
