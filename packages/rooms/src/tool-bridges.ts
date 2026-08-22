import { AgentPlatError } from "@agentplat/core";
import type { JsonObject, JsonValue } from "@agentplat/core";
import type {
  ToolInvocationContext,
  ToolInvocationResult,
  ToolRegistry,
} from "@agentplat/tools";
import type { KnowledgeBundleRegistry } from "./knowledge-bundle.js";
import type { RoomService } from "./service.js";
import type { AgentDefinitionRegistry } from "./agent-registry.js";
import type { AgentRoomHandoffCoordinator } from "./room-handoff.js";

/** Stable identifiers for the standard Agent Room tool bridge surface. */
export const AGENT_ROOM_TOOL_IDS = {
  knowledgeList: "agentplat.knowledge.list",
  knowledgeRead: "agentplat.knowledge.read",
  memorySave: "agentplat.memory.save",
  memorySearch: "agentplat.memory.search",
  artifactEmit: "agentplat.artifact.emit",
  handoffPropose: "agentplat.handoff.propose",
} as const;

/** Governed domain services and optional Handoff support exposed to tools. */
export interface AgentRoomToolBridgeOptions {
  registry: ToolRegistry;
  rooms: Pick<RoomService, "getRoomState" | "createArtifact" | "writeMemory">;
  knowledge: KnowledgeBundleRegistry;
  resolveKnowledgeRefs(context: ToolInvocationContext): Promise<string[]>;
  authorize?(input: {
    toolId: string;
    context: ToolInvocationContext;
  }): Promise<boolean>;
  handoffs?: Pick<AgentRoomHandoffCoordinator, "propose">;
}

/** Registers standard Agent Room tools on a ToolRegistry. */
export async function registerAgentRoomToolBridges(
  options: AgentRoomToolBridgeOptions,
): Promise<void> {
  const register = async (
    id: string,
    description: string,
    invoke: (
      input: JsonObject,
      context: ToolInvocationContext,
    ) => Promise<ToolInvocationResult>,
  ) =>
    options.registry.register(
      {
        id,
        name: id,
        description,
        parameters: {
          type: "object",
          additionalProperties: false,
        },
      },
      {
        invoke: async (input, context) => {
          if (
            options.authorize &&
            !(await options.authorize({ toolId: id, context }))
          ) {
            return {
              ok: false,
              errorMessage: "Tool invocation is not authorized",
            };
          }
          try {
            return await invoke(input, context);
          } catch (error) {
            return {
              ok: false,
              errorMessage:
                error instanceof Error
                  ? error.message
                  : "Tool invocation failed",
            };
          }
        },
      },
    );

  await register(
    AGENT_ROOM_TOOL_IDS.knowledgeList,
    "List documents in an agent knowledge bundle.",
    async (input, context) => {
      const reference = text(input.reference, "reference");
      await requireKnowledgeRef(options, context, reference);
      const bundle = await options.knowledge.get(
        context.tenant.tenantId,
        reference,
      );
      return {
        ok: true,
        value: bundle.documents.map(({ documentId, title, metadata }) => ({
          documentId,
          title,
          metadata,
        })),
      };
    },
  );
  await register(
    AGENT_ROOM_TOOL_IDS.knowledgeRead,
    "Read one document from an authorized agent knowledge bundle.",
    async (input, context) => {
      const reference = text(input.reference, "reference");
      await requireKnowledgeRef(options, context, reference);
      const document = await options.knowledge.readDocument(
        context.tenant.tenantId,
        reference,
        text(input.documentId, "documentId"),
      );
      return {
        ok: true,
        value: {
          documentId: document.documentId,
          title: document.title,
          content: document.content,
          metadata: document.metadata,
        },
      };
    },
  );
  await register(
    AGENT_ROOM_TOOL_IDS.memorySave,
    "Save tenant-scoped memory through the Agent Room domain.",
    async (input, context) => {
      const roomId = room(context);
      const participantId = participant(context);
      const entry = await options.rooms.writeMemory(
        context.tenant.tenantId,
        roomId,
        {
          scope: input.scope === "agent" ? "agent" : "room",
          scopeId: input.scope === "agent" ? participantId : roomId,
          content: input.content as JsonValue,
          source: `tool:${AGENT_ROOM_TOOL_IDS.memorySave}`,
          provenance: { runId: context.runId ?? null },
        },
        participantId,
      );
      return { ok: true, value: { memoryId: entry.id } };
    },
  );
  await register(
    AGENT_ROOM_TOOL_IDS.memorySearch,
    "Search readable memory in the current Agent Room.",
    async (input, context) => {
      const state = await options.rooms.getRoomState(
        context.tenant.tenantId,
        room(context),
      );
      const query = text(input.query, "query").toLowerCase();
      const participantId = participant(context);
      const matches = state.memory
        .filter(
          (entry) =>
            entry.scope === "room" ||
            (entry.scope === "agent" && entry.scopeId === participantId),
        )
        .filter((entry) =>
          JSON.stringify(entry.content).toLowerCase().includes(query),
        )
        .slice(-20)
        .map((entry) => ({
          id: entry.id,
          content: entry.content,
          source: entry.source,
        }));
      return { ok: true, value: matches };
    },
  );
  await register(
    AGENT_ROOM_TOOL_IDS.artifactEmit,
    "Create a durable versioned Agent Room artifact with provenance.",
    async (input, context) => {
      const participantId = participant(context);
      const artifact = await options.rooms.createArtifact(
        context.tenant.tenantId,
        room(context),
        {
          type: text(input.type, "type"),
          title: text(input.title, "title"),
          content: input.content as JsonValue,
          contentType:
            typeof input.contentType === "string"
              ? input.contentType
              : "application/json",
          createdBy: participantId,
          provenance: {
            runId: context.runId,
            sourceMessageIds: strings(input.sourceMessageIds),
            sourceArtifactIds: strings(input.sourceArtifactIds),
            sourceMemoryIds: strings(input.sourceMemoryIds),
          },
        },
      );
      return { ok: true, value: { artifactId: artifact.id, version: 1 } };
    },
  );
  if (options.handoffs) {
    await register(
      AGENT_ROOM_TOOL_IDS.handoffPropose,
      "Propose a governed AgentPlat Handoff to another Room agent participant.",
      async (input, context) => {
        if (!context.runId) {
          throw new AgentPlatError(
            "VALIDATION_ERROR",
            "Handoff requires context.runId",
          );
        }
        const handoff = await options.handoffs!.propose({
          tenantId: context.tenant.tenantId,
          roomId: room(context),
          handoffId: text(input.handoffId, "handoffId"),
          sourceParticipantId: participant(context),
          sourceRunId: context.runId,
          sourceAgentRevisionId: text(
            context.metadata?.agentRevisionId,
            "context.metadata.agentRevisionId",
          ),
          targetParticipantId: text(
            input.targetParticipantId,
            "targetParticipantId",
          ),
          targetAgentRevisionId: text(
            input.targetAgentRevisionId,
            "targetAgentRevisionId",
          ),
          instruction: text(input.instruction, "instruction"),
          contextMessageIds: strings(input.contextMessageIds),
          contextArtifactIds: strings(input.contextArtifactIds),
          authorityCeiling: integer(input.authorityCeiling, "authorityCeiling"),
        });
        return {
          ok: true,
          value: { handoffId: handoff.handoffId, status: handoff.status },
        };
      },
    );
  }
}

/** Resolves only knowledge references bound to the executing agent revision. */
export function createAgentRevisionKnowledgeResolver(
  definitions: Pick<AgentDefinitionRegistry, "resolvePublishedRevision">,
) {
  return async (context: ToolInvocationContext): Promise<string[]> => {
    const revisionId = text(
      context.metadata?.agentRevisionId,
      "context.metadata.agentRevisionId",
    );
    const revision = await definitions.resolvePublishedRevision(
      context.tenant.tenantId,
      revisionId,
    );
    return [...revision.knowledgeRefs];
  };
}

async function requireKnowledgeRef(
  options: AgentRoomToolBridgeOptions,
  context: ToolInvocationContext,
  reference: string,
) {
  if (!(await options.resolveKnowledgeRefs(context)).includes(reference)) {
    throw new AgentPlatError(
      "FORBIDDEN",
      "Knowledge bundle is not bound to this agent revision",
    );
  }
}
function room(context: ToolInvocationContext) {
  return text(context.metadata?.roomId, "context.metadata.roomId");
}
function participant(context: ToolInvocationContext) {
  return text(
    context.metadata?.participantId,
    "context.metadata.participantId",
  );
}
function text(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new AgentPlatError("VALIDATION_ERROR", `${label} is required`);
  }
  return value;
}
function strings(value: JsonValue | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
function integer(value: JsonValue | undefined, label: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new AgentPlatError("VALIDATION_ERROR", `${label} is invalid`);
  }
  return Number(value);
}
