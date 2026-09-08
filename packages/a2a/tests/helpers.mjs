import {
  AgentRegistry,
  InMemoryAgentRegistryStore,
} from "@agentplat/agent-registry";
import {
  A2AServer,
  A2AClient,
  InMemoryA2AStateStore,
  discoverA2AAgent,
} from "../dist/index.js";
export const principal = { tenantId: "tenant", subjectId: "user" };
export async function fixture(overrides = {}) {
  let runs = 0;
  const store = new InMemoryA2AStateStore();
  const service = {
    id: "research",
    name: "Research",
    description: "Research service",
    version: "1",
    kind: "room_service",
    endpoint: "https://agent.test/rpc",
    skills: [
      {
        id: "research",
        name: "Research",
        description: "Research",
        capability: "research",
      },
    ],
    inputMediaTypes: ["text/plain"],
    outputMediaTypes: ["text/plain"],
    authorize: async () => true,
    bind: async () => ({ roomId: "room", runId: "run" }),
    async *execute(request) {
      runs++;
      yield {
        state: "completed",
        artifacts: [
          {
            id: "report",
            name: "Report",
            parts: [{ kind: "text", text: "done" }],
          },
        ],
        reply: [{ kind: "text", text: "done" }],
      };
    },
    cancel: async () => true,
    reconcile: async () => undefined,
    ...overrides,
  };
  const errors = [];
  let server = new A2AServer({
    service,
    store,
    authenticate: async (request) =>
      request.headers.get("Authorization") === "Bearer test"
        ? principal
        : undefined,
    pollIntervalMs: 1,
    onError: (e) => errors.push(e),
  });
  const fetchImpl = async (input, init) =>
    server.handle(new Request(input, init));
  const network = {
    allow: async (url) => url.origin === "https://agent.test",
    credentials: async () => ({ Authorization: "Bearer test" }),
    fetch: fetchImpl,
  };
  const registry = new AgentRegistry(new InMemoryAgentRegistryStore(), {
    authorize: async () => true,
  });
  const draft = await discoverA2AAgent({
    tenantId: "tenant",
    entryId: "research",
    ownerId: "owner",
    cardUrl: "https://agent.test/.well-known/agent-card.json",
    skillCapabilities: { research: "research" },
    validUntil: "2030-01-01",
    network,
  });
  await registry.publish(principal, {
    ...draft,
    availability: "available",
    verification: "verified",
    admission: "approved",
  });
  const outbound = new InMemoryA2AStateStore();
  const options = {
    principal,
    registry,
    store: outbound,
    network,
    authorize: async () => true,
  };
  const client = new A2AClient(options);
  return {
    client,
    server,
    service,
    store,
    network,
    registry,
    draft,
    outbound,
    options,
    errors,
    runs: () => runs,
    restart: () => {
      server = new A2AServer({
        service,
        store,
        authenticate: async () => principal,
        pollIntervalMs: 1,
      });
      return server;
    },
  };
}
export const input = (id = "one") => ({
  operationId: id,
  entryId: "research",
  entryRevision: 1,
  requirements: { capabilities: ["research"] },
  message: { messageId: id, parts: [{ kind: "text", text: "research" }] },
  binding: { roomId: "room", runId: "run" },
});
