import type { AgentDefinitionRegistry, RoomService } from "@agentplat/rooms";
import type {
  AgentRegistry,
  AgentRegistryDraft,
  RegistryPrincipal,
  AgentSearchQuery,
} from "@agentplat/agent-registry";
import { A2AServer, type A2AServerOptions } from "./server.js";
import type { A2AClient, A2ADelegateInput } from "./client.js";
import { json, digest } from "./internal.js";
/** Project only a published reference and capabilities; never copy private instructions. */
export async function describePublishedRoomAgent(
  definitions: Pick<AgentDefinitionRegistry, "resolvePublishedRevision">,
  input: Omit<AgentRegistryDraft, "capabilities" | "execution"> & {
    agentRevisionId: string;
  },
): Promise<AgentRegistryDraft> {
  const { agentRevisionId, ...draft } = structuredClone(input);
  const revision = await definitions.resolvePublishedRevision(
    input.tenantId,
    agentRevisionId,
  );
  return {
    ...draft,
    capabilities: [...revision.capabilities],
    execution: {
      kind: "local",
      agentId: revision.agentId,
      revisionId: revision.revisionId,
      digest: revision.digest,
    },
  };
}
/** Require the host's context policy to resolve an existing, tenant-scoped writable Room. */
export function createRoomA2AServer(
  options: A2AServerOptions & {
    rooms: Pick<RoomService, "getRoomState">;
    definitions?: Pick<AgentDefinitionRegistry, "resolvePublishedRevision">;
  },
): A2AServer {
  const original = options.service,
    bind = original.bind.bind(original),
    execute = original.execute.bind(original);
  const verify = async (request: Parameters<typeof execute>[0]) => {
    if (!request.binding.roomId) throw new Error("room_binding_required");
    const state = await options.rooms.getRoomState(
      request.principal.tenantId,
      request.binding.roomId,
    );
    if (
      state.room.tenantId !== request.principal.tenantId ||
      state.room.status !== "active"
    )
      throw new Error("room_not_writable");
    if (original.kind === "agent") {
      if (!options.definitions || !request.binding.agentRevisionId)
        throw new Error("published_agent_required");
      await options.definitions.resolvePublishedRevision(
        request.principal.tenantId,
        request.binding.agentRevisionId,
      );
    }
  };
  return new A2AServer({
    ...options,
    service: {
      ...original,
      async bind(input) {
        const binding = await bind(input);
        await verify({ ...input, binding });
        return binding;
      },
      async *execute(request) {
        await verify(request);
        yield* execute(request);
      },
    },
  });
}
/** RoomService owns persistence and policy. Deterministic IDs allow recovery after a committed timeout. */
export class RoomA2ABridge {
  constructor(
    readonly options: {
      principal: RegistryPrincipal;
      registry: AgentRegistry;
      client: A2AClient;
      rooms: Pick<
        RoomService,
        "getRoomState" | "sendMessage" | "createArtifact"
      >;
      authorize(
        roomId: string,
        operation: "propose" | "delegate" | "import",
      ): Promise<boolean>;
    },
  ) {}
  async #check(roomId: string, operation: "propose" | "delegate" | "import") {
    if (!(await this.options.authorize(roomId, operation)))
      throw new Error("room_action_denied");
  }
  async #artifact(
    roomId: string,
    id: string,
    content: unknown,
    title: string,
    runId?: string,
  ) {
    const hash = digest(content),
      tenant = this.options.principal.tenantId;
    const exists = async () => {
      const state = await this.options.rooms.getRoomState(tenant, roomId);
      const found = state.artifacts.find((a) => a.id === id);
      if (found && found.metadata?.a2aDigest !== hash)
        throw new Error("room_projection_conflict");
      return !!found;
    };
    if (await exists()) return id;
    try {
      await this.options.rooms.createArtifact(tenant, roomId, {
        id,
        type: "a2a",
        title,
        content: json(content),
        contentType: "application/json",
        metadata: { a2aDigest: hash },
        provenance: { runId },
      });
    } catch (error) {
      if (!(await exists())) throw error;
    }
    return id;
  }
  async propose(roomId: string, query: AgentSearchQuery) {
    await this.#check(roomId, "propose");
    const search = await this.options.registry.search(
      this.options.principal,
      query,
    );
    const proposal = {
      kind: "agent_registry_participation",
      candidates: search.candidates.map((c) => ({
        entryId: c.entry.entryId,
        revision: c.entry.revision,
        eligible: c.eligible,
        reasons: c.reasons,
      })),
      nextCursor: search.nextCursor,
      grantsAuthority: false,
    };
    return this.#artifact(
      roomId,
      digest([roomId, proposal]),
      proposal,
      "Agent participation proposal",
    );
  }
  async delegate(roomId: string, input: A2ADelegateInput) {
    await this.#check(roomId, "delegate");
    if (input.binding.roomId !== roomId)
      throw new Error("room_binding_mismatch");
    return this.options.client.send(input);
  }
  /** Import only the client's scoped persisted result, never a caller-supplied remote result. */
  async importResult(roomId: string, entryId: string, operationId: string) {
    await this.#check(roomId, "import");
    const result = await this.options.client.get(entryId, operationId);
    if (result.binding.roomId !== roomId || result.status !== "received")
      throw new Error("result_not_importable");
    const provenance = {
      entryId,
      entryRevision: result.entryRevision,
      operationId,
      taskId: result.task?.taskId,
      contextId: result.task?.contextId ?? result.message?.contextId,
    };
    const ids: string[] = [];
    for (const artifact of result.task?.artifacts ?? [])
      ids.push(
        await this.#artifact(
          roomId,
          digest([roomId, provenance, artifact]),
          { provenance, artifact },
          artifact.name || "A2A result",
          result.binding.runId,
        ),
      );
    const parts = result.message?.parts ?? result.task?.reply;
    if (parts?.length) {
      const content = JSON.stringify({ provenance, parts }),
        id = digest([roomId, content]);
      const tenant = this.options.principal.tenantId;
      const exists = async () => {
        const found = (
          await this.options.rooms.getRoomState(tenant, roomId)
        ).messages.find((m) => m.id === id);
        if (found && found.content !== content)
          throw new Error("room_projection_conflict");
        return !!found;
      };
      if (!(await exists()))
        try {
          await this.options.rooms.sendMessage(tenant, roomId, {
            id,
            role: "agent",
            content,
            metadata: { a2aDigest: digest(content) },
          });
        } catch (error) {
          if (!(await exists())) throw error;
        }
      ids.push(id);
    }
    return { ids, grantsAuthority: false as const };
  }
}
