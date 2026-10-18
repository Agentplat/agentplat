import { AgentPlatError } from "@agentplat/core";
import type { ToolInvocationContext, ToolRegistry } from "@agentplat/tools";
import type {
  MemoryRevisionServiceV1,
  MemoryRevisionV1,
} from "./memory-revisions.js";

export interface MemoryRevisionSnapshotV1 {
  schemaVersion: 1;
  entries: MemoryRevisionV1[];
  references: Array<{ memoryId: string; revision: number; digest: string }>;
}
/** Persist this snapshot/reference list with the execution's existing evidence artifact. */
export async function resolveMemoryRevisionSnapshotV1<Context>(
  service: Pick<MemoryRevisionServiceV1<Context>, "resolve">,
  context: Context,
  memoryIds: string[],
): Promise<MemoryRevisionSnapshotV1> {
  const entries = await service.resolve(context, [...memoryIds]);
  return {
    schemaVersion: 1,
    entries,
    references: entries.map((r) => ({
      memoryId: r.memoryId,
      revision: r.revision,
      digest: r.digest,
    })),
  };
}

/** Read-only tool; writes/sharing remain explicit authenticated host operations. */
export async function registerMemoryRevisionReadToolV1<Context>(options: {
  registry: ToolRegistry;
  service: Pick<MemoryRevisionServiceV1<Context>, "resolve">;
  /** Host resolves verified credentials, never identities in tool input. */
  context(toolContext: ToolInvocationContext): Promise<Context>;
}) {
  await options.registry.register(
    {
      id: "agentplat.memory.revisions.read",
      name: "agentplat.memory.revisions.read",
      description:
        "Read authorized current memory revisions and exact provenance references.",
      parameters: {
        type: "object",
        properties: {
          memoryIds: {
            type: "array",
            items: { type: "string" },
            maxItems: 128,
            uniqueItems: true,
          },
        },
        required: ["memoryIds"],
        additionalProperties: false,
      },
    },
    {
      async invoke(input, invocation) {
        if (
          Object.keys(input).length !== 1 ||
          !Array.isArray(input.memoryIds) ||
          input.memoryIds.some((id) => typeof id !== "string")
        )
          throw new AgentPlatError(
            "VALIDATION_ERROR",
            "Expected memoryIds only",
          );
        const snapshot = await resolveMemoryRevisionSnapshotV1(
          options.service,
          await options.context(invocation),
          input.memoryIds as string[],
        );
        // JSON boundary intentionally contains evidence, not credentials.
        return { ok: true, value: JSON.parse(JSON.stringify(snapshot)) };
      },
    },
  );
}
