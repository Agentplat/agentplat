import type { JsonObject, JsonValue, Metadata } from "@agentplat/core";

import type {
  AgentDefinition,
  AgentProvider,
  AgentRunInput,
  AgentRunResult,
  RuntimeExecutionContext,
} from "./index.js";
import type {
  AgentRuntimePortableAdapterOptionsV1,
  PortableAgentAdapterContextV1,
  PortableAgentAdapterManifestV1,
  PortableAgentAdapterStepInputV1,
  PortableAgentAdapterV1,
  PortableAgentOutputV1,
  PortableAgentProviderOptionsV1,
  PortableAgentStepResultV1,
} from "./adapter-contracts.js";
import { PortableAgentErrorV1 } from "./adapter-errors.js";
import {
  cloneAndFreeze,
  identifier,
  normalizeAdapterManifestV1,
  normalizeJson,
  normalizeJsonObject,
  normalizeMetadata,
} from "./adapter-validation.js";

export interface AgentRuntimePortableAdapterV1 {
  readonly manifest: PortableAgentAdapterManifestV1;
  readonly adapter: PortableAgentAdapterV1;
}

/** Adapt an existing AgentRuntime agent to the stateful portable protocol. */
export function createAgentRuntimePortableAdapterV1(
  options: AgentRuntimePortableAdapterOptionsV1,
): AgentRuntimePortableAdapterV1 {
  if (!options || typeof options !== "object") {
    throw validation("AgentRuntime adapter options are required");
  }
  if (!options.runtime || typeof options.runtime.run !== "function") {
    throw validation("runtime.run is required");
  }
  if (!options.agent || typeof options.agent !== "object") {
    throw validation("agent definition is required");
  }
  const manifest = normalizeAdapterManifestV1(options.manifest);
  if (!manifest.interactionModes.includes("invoke")) {
    throw validation("AgentRuntime bridge requires invoke interaction support");
  }
  if (manifest.supportsCheckpoint || manifest.supportsRestore) {
    throw validation(
      "AgentRuntime bridge does not implement checkpoint or restore",
    );
  }
  if (
    manifest.outputModalities.some(
      (modality) => modality !== "text" && modality !== "structured",
    )
  ) {
    throw validation(
      "AgentRuntime bridge can declare only text and structured outputs",
    );
  }

  const adapter: PortableAgentAdapterV1 = Object.freeze({
    async step(
      input: PortableAgentAdapterStepInputV1,
      context: PortableAgentAdapterContextV1,
    ): Promise<PortableAgentStepResultV1> {
      if (
        input.tenantId !== context.tenant.tenantId ||
        input.agentId !== context.agentId ||
        input.sessionId !== context.sessionId ||
        input.request.stepId !== context.stepId
      ) {
        throw validation("portable adapter context binding is invalid");
      }
      if (options.agent.tenantId !== input.tenantId) {
        throw validation("agent definition belongs to a different tenant");
      }
      const structuredInput: JsonObject[] = [
        normalizeJsonObject(
          {
            portableType: "role",
            roleBindingId: input.role.roleBindingId,
            roleRevision: input.role.roleRevision,
            objectiveId: input.role.objectiveId,
            roleKey: input.role.roleKey,
            instructions: input.role.instructions,
            constraints: input.role.constraints,
          },
          "portable role input",
        ),
        ...input.request.observations.map((observation) =>
          normalizeJsonObject(
            {
              portableType: "observation",
              observationId: observation.observationId,
              sourceZone: observation.sourceZone,
              sourceId: observation.sourceId,
              modality: observation.modality,
              content: observation.content,
              contentReference: observation.contentReference,
              provenance: observation.provenance,
              observedAtLogicalMs: observation.observedAtLogicalMs,
            },
            "portable observation input",
          ),
        ),
        ...(input.request.input === null
          ? []
          : [
              normalizeJsonObject(
                {
                  portableType: "step_input",
                  content: input.request.input,
                },
                "portable step input",
              ),
            ]),
      ];
      const result = await options.runtime.run(
        options.agent,
        {
          input: structuredInput,
          mode: "invoke",
          metadata: normalizeMetadata(
            {
              portableSessionId: input.sessionId,
              portableRoleBindingId: input.role.roleBindingId,
              portableStepSequence: input.stepSequence,
            },
            "portable run metadata",
          ),
        },
        {
          tenant: context.tenant,
          runId: input.request.stepId,
          agentId: input.agentId,
          signal: context.signal,
          credentials:
            context.credentials === undefined
              ? undefined
              : { ...context.credentials },
          policies: input.role.constraints,
          metadata: context.metadata,
        },
      );
      return mapAgentRunResult(input, result, manifest);
    },
  });
  return Object.freeze({ manifest, adapter });
}

/**
 * Adapt portable sessions back into an AgentProvider. Register the result on a
 * DefaultAgentRuntime to make collective and workflow callers session-aware.
 */
export function createPortableAgentProviderV1(
  options: PortableAgentProviderOptionsV1,
): AgentProvider {
  if (!options || typeof options !== "object") {
    throw validation("portable provider options are required");
  }
  if (
    !options.sessionRuntime ||
    typeof options.sessionRuntime.getSession !== "function" ||
    typeof options.sessionRuntime.step !== "function"
  ) {
    throw validation("portable session runtime is required");
  }
  if (typeof options.resolveSessionId !== "function") {
    throw validation("resolveSessionId is required");
  }
  const logicalClock = options.logicalClock ?? (() => Date.now());

  return Object.freeze({
    async run(
      agent: AgentDefinition,
      input: AgentRunInput,
      context: RuntimeExecutionContext,
    ): Promise<AgentRunResult> {
      if (!context.runId) {
        throw validation(
          "RuntimeExecutionContext.runId is required for portable session idempotency",
        );
      }
      const sessionId = identifier(
        options.resolveSessionId(agent),
        "sessionId",
      );
      const session = await options.sessionRuntime.getSession(sessionId);
      if (!session) {
        throw new PortableAgentErrorV1(
          "NOT_FOUND",
          `session "${sessionId}" was not found`,
        );
      }
      if (
        session.tenantId !== context.tenant.tenantId ||
        session.agentId !== agent.id ||
        context.agentId !== agent.id
      ) {
        throw validation("portable provider session binding is invalid");
      }
      const requestedOutputModalities = ["text", "structured"].filter(
        (modality) =>
          session.manifest.outputModalities.includes(
            modality as "text" | "structured",
          ),
      ) as Array<"text" | "structured">;
      if (requestedOutputModalities.length === 0) {
        throw new PortableAgentErrorV1(
          "ADAPTER_INCOMPATIBLE",
          "portable AgentProvider requires text or structured output support",
        );
      }
      const logicalTimeMs = logicalClock();
      if (!Number.isSafeInteger(logicalTimeMs) || logicalTimeMs < 0) {
        throw validation(
          "logicalClock must return a non-negative safe integer",
        );
      }
      const mappedInput = options.mapInput
        ? normalizeJsonObject(options.mapInput(input), "mapped agent input")
        : defaultMapInput(input);
      const outcome = await options.sessionRuntime.step(
        sessionId,
        {
          schemaVersion: 1,
          stepId: context.runId,
          expectedSessionRevision: session.revision,
          interactionMode: "invoke",
          observations: [],
          input: mappedInput,
          requestedOutputModalities,
          logicalTimeMs,
        },
        {
          signal: context.signal,
          tenant: context.tenant,
          credentials: context.credentials,
          metadata: context.metadata,
        },
      );
      return mapPortableResult(context.runId, outcome.record.result);
    },
  });
}

function mapAgentRunResult(
  input: Parameters<PortableAgentAdapterV1["step"]>[0],
  result: AgentRunResult,
  manifest: PortableAgentAdapterManifestV1,
): PortableAgentStepResultV1 {
  const base = {
    schemaVersion: 1 as const,
    sessionId: input.sessionId,
    stepId: input.request.stepId,
    stepSequence: input.stepSequence,
    checkpoint: null,
    metadata: normalizeMetadata(result.metadata ?? {}, "agent result metadata"),
  };
  if (result.status !== "completed") {
    return cloneAndFreeze({
      ...base,
      status:
        result.status === "canceled"
          ? ("paused" as const)
          : ("failed" as const),
      outputs: [],
      actionProposals: [],
      reasonCode:
        result.status === "canceled"
          ? "agent_run_canceled"
          : "agent_run_failed",
    });
  }
  const requested = new Set(input.request.requestedOutputModalities);
  const outputs: PortableAgentOutputV1[] = [];
  if (
    result.output !== undefined &&
    requested.has("text") &&
    manifest.outputModalities.includes("text")
  ) {
    outputs.push({
      schemaVersion: 1,
      outputId: `${input.request.stepId}:text`,
      modality: "text",
      content: result.output,
      contentReference: null,
      metadata: {},
    });
  }
  if (
    result.result !== undefined &&
    requested.has("structured") &&
    manifest.outputModalities.includes("structured")
  ) {
    outputs.push({
      schemaVersion: 1,
      outputId: `${input.request.stepId}:structured`,
      modality: "structured",
      content: normalizeJsonObject(result.result, "agent structured result"),
      contentReference: null,
      metadata: {},
    });
  }
  if (outputs.length === 0) {
    return cloneAndFreeze({
      ...base,
      status: "failed" as const,
      outputs: [],
      actionProposals: [],
      reasonCode: "empty_agent_result",
    });
  }
  return cloneAndFreeze({
    ...base,
    status: "completed" as const,
    outputs,
    actionProposals: [],
    reasonCode: null,
  });
}

function mapPortableResult(
  runId: string,
  result: PortableAgentStepResultV1,
): AgentRunResult {
  const textOutput = result.outputs.find(
    (output) =>
      output.modality === "text" && typeof output.content === "string",
  );
  const structuredOutput = result.outputs.find(
    (output) =>
      output.modality === "structured" &&
      output.content !== null &&
      typeof output.content === "object" &&
      !Array.isArray(output.content),
  );
  const status =
    result.status === "completed"
      ? ("completed" as const)
      : result.status === "paused"
        ? ("canceled" as const)
        : ("failed" as const);
  return cloneAndFreeze({
    runId,
    status,
    ...(textOutput === undefined
      ? {}
      : { output: textOutput.content as string }),
    ...(structuredOutput === undefined
      ? {}
      : { result: structuredOutput.content as JsonObject }),
    ...(status === "completed"
      ? {}
      : {
          errorMessage: `Portable agent step ${result.status}: ${result.reasonCode ?? "unknown"}`,
        }),
    metadata: normalizeMetadata(
      {
        portableSessionId: result.sessionId,
        portableStepSequence: result.stepSequence,
        portableStatus: result.status,
        portableActionProposalCount: result.actionProposals.length,
      },
      "portable provider metadata",
    ),
  });
}

function defaultMapInput(input: AgentRunInput): JsonObject {
  const metadata: Metadata = normalizeMetadata(
    input.metadata ?? {},
    "agent input metadata",
  );
  const value: Record<string, JsonValue> = {
    input: normalizeJson(input.input, "agent input"),
    mode: input.mode ?? "invoke",
    metadata,
  };
  if (input.conversationId !== undefined) {
    value.conversationId = input.conversationId;
  }
  if (input.attachments !== undefined) {
    value.attachments = normalizeJson(input.attachments, "agent attachments");
  }
  return normalizeJsonObject(value, "agent input envelope");
}

function validation(message: string): PortableAgentErrorV1 {
  return new PortableAgentErrorV1("VALIDATION_ERROR", message);
}
