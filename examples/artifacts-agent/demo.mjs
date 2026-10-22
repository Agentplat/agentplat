import {
  ArtifactService,
  InMemoryArtifactStore,
  registerArtifactTools,
} from "../../packages/artifacts/dist/index.js";
import { InMemoryEventBus } from "../../packages/events/dist/index.js";
import { InMemoryToolRegistry } from "../../packages/tools/dist/index.js";

const tenant = {
  tenantId: "demo-tenant",
  actor: { actorId: "writer-agent", actorType: "machine" },
};
const events = new InMemoryEventBus();
const service = new ArtifactService({
  store: new InMemoryArtifactStore(),
  events,
});
const tools = new InMemoryToolRegistry();
await registerArtifactTools(tools, service);

// This is the same registry supplied to RuntimeExecutionContext.tools. A provider's
// tool loop can invoke these handlers; no artifact content is evaluated.
const create = await tools.get("agentplat.artifacts.create");
const created = await create.handler.invoke(
  {
    name: "proposal.md",
    format: "markdown",
    content: "# Proposal\n\nInitial draft.",
    roomId: "room-42",
  },
  { tenant, toolId: create.definition.id, runId: "run-7" },
);
const artifactId = created.value.reference.id;
const update = await tools.get("agentplat.artifacts.update");
await update.handler.invoke(
  {
    artifactId,
    expectedRevision: 1,
    content: "# Proposal\n\nReviewed draft.",
    roomId: "room-42",
  },
  { tenant, toolId: update.definition.id, runId: "run-7" },
);

// The application resolves references and fetches content through its own API.
const current = await service.read(tenant, artifactId);
console.log(
  JSON.stringify(
    {
      reference: events.listPublished()[1].payload.reference,
      content: current.revision.content,
      eventTypes: events.listPublished().map((event) => event.type),
    },
    null,
    2,
  ),
);
