import { AgentPlatError } from "@agentplat/core";

/** Definition configuration only; purpose execution requires qualified mission control. */
export type AgentInteractionBindingV1 =
  | { schemaVersion: 1; interactionMode: "instruction" }
  | { schemaVersion: 1; interactionMode: "purpose"; governanceId: string };

/** Validate untrusted API/store input without coercing or discarding fields. */
export function validateAgentInteractionBindingV1(
  input: unknown,
): AgentInteractionBindingV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid();
  const value = input as Record<string, unknown>;
  if (value.schemaVersion !== 1) invalid();
  const keys = Object.keys(value).sort().join(",");
  if (value.interactionMode === "instruction") {
    if (keys !== "interactionMode,schemaVersion") invalid();
    return { schemaVersion: 1, interactionMode: "instruction" };
  }
  if (value.interactionMode === "purpose") {
    if (
      keys !== "governanceId,interactionMode,schemaVersion" ||
      typeof value.governanceId !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/u.test(value.governanceId)
    ) invalid();
    return { schemaVersion: 1, interactionMode: "purpose", governanceId: value.governanceId };
  }
  return invalid();
}

/** Resolve only the definition binding; metadata and runtime profiles cannot override it. */
export function resolveAgentInteractionBindingV1(definition: {
  interaction?: AgentInteractionBindingV1;
}): AgentInteractionBindingV1 {
  return definition.interaction === undefined
    ? { schemaVersion: 1, interactionMode: "instruction" }
    : validateAgentInteractionBindingV1(definition.interaction);
}

/** Publication is not activation. Standalone resolution cannot grant purpose execution. */
export function assertAgentInteractionExecutableV1(definition: {
  interaction?: AgentInteractionBindingV1;
}): void {
  if (resolveAgentInteractionBindingV1(definition).interactionMode === "purpose") {
    throw new AgentPlatError(
      "CONFLICT",
      "Purpose interaction execution is unavailable: qualified purpose mission execution is required",
    );
  }
}

function invalid(): never {
  throw new AgentPlatError("VALIDATION_ERROR", "Agent interaction binding is invalid");
}
