import assert from "node:assert/strict";
import {
  AgentRegistry,
  InMemoryAgentRegistryStore,
} from "../../packages/agent-registry/dist/index.js";
import {
  A2AClient,
  InMemoryA2AStateStore,
  discoverA2AAgent,
} from "../../packages/a2a/dist/index.js";
import {
  RoomA2ABridge,
  createRoomA2AServer,
} from "../../packages/a2a/dist/rooms.js";
import { createMeshA2AAuthorizer } from "../../packages/a2a/dist/mesh.js";
import {
  selectMorphogenesisRegistryCandidates,
  proposeRegistryMorphogenesis,
} from "../../packages/a2a/dist/morphogenesis.js";
import {
  RoomService,
  InMemoryRoomRepository,
  AgentDefinitionRegistry,
  InMemoryAgentDefinitionRegistryStore,
} from "../../packages/rooms/dist/index.js";
import {
  createCapabilityStatePolicyV1,
  createCapabilityStateFusionStateV1,
  reduceCapabilityStateFusionV1,
  createCapabilityStateSignalV1,
} from "../../packages/collective-runtime/dist/capability-state.js";
import { proposalFixture } from "./proposal-fixture.mjs";

// Deterministic host policies and an in-process HTTPS Request/Response transport.
// No model calls, external effects, listening socket or distributed admission.
const principal = { tenantId: "tenant", subjectId: "operator" };
const registry = new AgentRegistry(new InMemoryAgentRegistryStore(), {
  authorize: async (p) => p.subjectId === "operator",
});
const rooms = new RoomService({ repository: new InMemoryRoomRepository() });
const room = await rooms.createRoom("tenant", {
  title: "A2A collaboration",
  goal: "Produce a reviewed research draft",
});
const definitions = new AgentDefinitionRegistry(
  new InMemoryAgentDefinitionRegistryStore(),
);
await definitions.createAgent({
  tenantId: "tenant",
  agentId: "researcher",
  name: "Researcher",
});
const revision = await definitions.createRevision({
  tenantId: "tenant",
  agentId: "researcher",
  version: "1.0.0",
  instructions: "Produce a bounded draft",
  capabilities: ["research"],
  toolIds: [],
  knowledgeRefs: [],
  runtimeProfile: {},
});
await definitions.publishRevision("tenant", revision.definition.revisionId, 0);
const endpoints = new Map();
for (const kind of ["agent", "room_service"]) {
  const service = {
    id: kind,
    name: kind === "agent" ? "Researcher" : "Research team",
    description: "Bounded research",
    version: "1",
    kind,
    endpoint: `https://${kind.replace("_", "-")}.test/rpc`,
    skills: [
      {
        id: "research",
        name: "Research",
        description: "Produce a research draft",
        capability: "research",
      },
    ],
    inputMediaTypes: ["text/plain"],
    outputMediaTypes: ["text/plain"],
    authorize: async (p) => p.tenantId === "tenant",
    bind: async () => ({
      roomId: room.id,
      runId: `run-${kind}`,
      agentRevisionId: revision.definition.revisionId,
    }),
    async *execute() {
      yield { state: "working" };
      yield {
        state: "completed",
        artifacts: [
          {
            id: "report",
            name: "Research draft",
            parts: [{ kind: "text", text: `Draft from ${kind}` }],
          },
        ],
      };
    },
    cancel: async () => false,
    reconcile: async () => undefined,
  };
  endpoints.set(
    new URL(service.endpoint).origin,
    createRoomA2AServer({
      service,
      rooms,
      definitions,
      store: new InMemoryA2AStateStore(),
      authenticate: async (request) =>
        request.headers.get("Authorization") === "Bearer demo"
          ? principal
          : undefined,
      pollIntervalMs: 1,
    }),
  );
}
const network = {
  allow: async (url) => endpoints.has(url.origin),
  credentials: async () => ({ Authorization: "Bearer demo" }),
  fetch: async (input, init) =>
    endpoints
      .get(new URL(String(input)).origin)
      .handle(new Request(input, init)),
};
for (const [origin] of endpoints) {
  const entryId = new URL(origin).hostname;
  const draft = await discoverA2AAgent({
    tenantId: "tenant",
    entryId,
    ownerId: "operator",
    cardUrl: `${origin}/.well-known/agent-card.json`,
    skillCapabilities: { research: "research" },
    validUntil: "2030-01-01",
    network,
  });
  // Explicit fixture admission stands for the host's reviewed administrative workflow.
  await registry.publish(principal, {
    ...draft,
    availability: "available",
    verification: "verified",
    admission: "approved",
  });
}
const authority = {
  assigneePeerId: "peer",
  workItemId: "work",
  assignmentAuthorityId: "assignment",
  fencingToken: "fence",
  workDeadline: "2030-01-01",
};
const authorize = createMeshA2AAuthorizer({
  authority: {
    read: async () => ({
      admission: {
        peerId: "peer",
        instanceIds: ["instance"],
        validUntil: "2030-01-01",
      },
      discovery: {
        identity: {
          tenantId: "tenant",
          peerId: "peer",
          instanceId: "instance",
        },
      },
      assignment: authority,
      lease: {
        ...authority,
        status: "active",
        currentLeaseExpiresAt: "2030-01-01",
      },
      fence: { ...authority, phase: "active" },
    }),
  },
  policy: async () => true,
});
const client = new A2AClient({
  principal,
  registry,
  store: new InMemoryA2AStateStore(),
  network,
  authorize,
});
const bridge = new RoomA2ABridge({
  principal,
  registry,
  client,
  rooms,
  authorize: async () => true,
});
await bridge.propose(room.id, { capabilities: ["research"] });
for (const entryId of ["agent.test", "room-service.test"]) {
  for await (const result of client.sendStream({
    operationId: entryId,
    entryId,
    entryRevision: 1,
    requirements: { capabilities: ["research"] },
    message: {
      messageId: entryId,
      parts: [{ kind: "text", text: "Research this topic" }],
    },
    binding: {
      roomId: room.id,
      runId: entryId,
      peerId: "peer",
      instanceId: "instance",
      workItemId: "work",
      assignmentAuthorityId: "assignment",
      fencingToken: "fence",
    },
  })) {
    if (result.task?.state === "completed")
      console.log(`${entryId}: completed remote task`);
  }
  await bridge.importResult(room.id, entryId, entryId);
}
const hash = `sha256:${"a".repeat(64)}`;
const policy = createCapabilityStatePolicyV1({
  schemaVersion: 1,
  policyId: "policy",
  policyVersion: 1,
  parentPolicyDigest: null,
  requiredDimensions: {
    offer_recipient: ["trust"],
    bid: ["trust"],
    award: ["trust"],
    assignment_acceptance: ["trust"],
    recovery: ["trust"],
  },
  maximumCandidates: 10,
  maximumReasonCodesPerSignal: 8,
  maximumStateHeads: 128,
  maximumDecisionTtlMs: 100,
  maximumCommitAttempts: 4,
});
const fusion = {
  async evaluate(request) {
    return reduceCapabilityStateFusionV1({
      request,
      policy,
      state: createCapabilityStateFusionStateV1({
        stateKey: "state",
        fusionId: "fusion",
        fusionVersion: 1,
        implementationId: "implementation",
        policy,
      }),
      signals: request.candidates.map((c) =>
        createCapabilityStateSignalV1({
          schemaVersion: 1,
          signalId: c.candidateId,
          candidateId: c.candidateId,
          candidateDigest: c.candidateDigest,
          dimension: "trust",
          disposition: "eligible",
          sourceId: "fixture-trust",
          sourceVersion: 1,
          sourceImplementationDigest: hash,
          sourceRevision: 1,
          reasonCodes: [],
          observedAtLogicalMs: 10,
          expiresAtLogicalMs: 100,
        }),
      ),
    }).decision;
  },
};
const selection = await selectMorphogenesisRegistryCandidates({
  principal,
  registry,
  requirements: { capabilities: ["research"] },
  requestId: "recruitment",
  scope: {
    tenantId: "tenant",
    meshId: "mesh:test",
    policyDomainId: "policy-domain:test",
    missionIntentId: "mission-intent:test",
    objectiveId: "objective:test",
    workItemId: null,
    workItemRevision: null,
  },
  logicalTimeMs: 10,
  fusion,
  resolveHost: async (entry) => ({
    peerId: "peer",
    instanceId: "instance",
    agentId: `adapter-${entry.entryId}`,
  }),
});
const proposal = await proposeRegistryMorphogenesis({
  principal,
  missionId: "mission:test",
  selection,
  store: new InMemoryA2AStateStore(),
  compile: async () => proposalFixture(selection.selectionDigest),
});
assert.equal(proposal.proposal.advisoryOnly, true);
const state = await rooms.getRoomState("tenant", room.id);
assert.equal(state.room.status, "active");
assert.ok(state.artifacts.every((a) => a.status === "draft"));
console.log(
  JSON.stringify(
    {
      roomStatus: state.room.status,
      drafts: state.artifacts.length,
      registryCandidates: selection.candidates.length,
      morphogenesisProposal: proposal.proposal.proposalDigest,
      grantsAuthority: proposal.grantsAuthority,
    },
    null,
    2,
  ),
);
