import test from "node:test";
import assert from "node:assert/strict";
import {
  RoomService,
  InMemoryRoomRepository,
  AgentDefinitionRegistry,
  InMemoryAgentDefinitionRegistryStore,
} from "@agentplat/rooms";
import {
  RoomA2ABridge,
  createRoomA2AServer,
  describePublishedRoomAgent,
} from "../dist/rooms.js";
import { createMeshA2AAuthorizer } from "../dist/mesh.js";
import {
  selectMorphogenesisRegistryCandidates,
  proposeRegistryMorphogenesis,
} from "../dist/morphogenesis.js";
import { InMemoryA2AStateStore, A2AClient } from "../dist/index.js";
import {
  createCapabilityStatePolicyV1,
  createCapabilityStateFusionStateV1,
  reduceCapabilityStateFusionV1,
  createCapabilityStateSignalV1,
} from "@agentplat/collective-runtime/capability-state";
import { fixture, input, principal } from "./helpers.mjs";
const hash = `sha256:${"a".repeat(64)}`;
function rooms() {
  return new RoomService({ repository: new InMemoryRoomRepository() });
}
test("Room proposal and idempotent result import preserve draft and Room state", async () => {
  const f = await fixture();
  const service = rooms();
  const room = await service.createRoom("tenant", {
    id: "room",
    title: "Room",
    goal: "Research",
  });
  const bridge = new RoomA2ABridge({
    principal,
    registry: f.registry,
    client: f.client,
    rooms: service,
    authorize: async () => true,
  });
  await bridge.propose(room.id, { capabilities: ["research"] });
  for await (const event of f.client.sendStream({
    ...input(),
    binding: { roomId: room.id },
  })) {
  }
  await bridge.importResult(room.id, "research", "one");
  await bridge.importResult(room.id, "research", "one");
  const state = await service.getRoomState("tenant", room.id);
  assert.equal(state.room.status, "active");
  assert.equal(state.artifacts.length, 2);
  assert.ok(state.artifacts.every((a) => a.status === "draft"));
  assert.equal(state.messages.length, 1);
  assert.equal(state.approvals.length, 0);
  assert.equal(state.tasks.length, 0);
  await assert.rejects(
    bridge.importResult("another-room", "research", "one"),
    /result_not_importable/,
  );
});
test("published definition projection omits instructions; Room-backed agent/service exposure", async () => {
  const definitions = new AgentDefinitionRegistry(
    new InMemoryAgentDefinitionRegistryStore(),
  );
  await definitions.createAgent({
    tenantId: "tenant",
    agentId: "local",
    name: "Local",
  });
  const revision = await definitions.createRevision({
    tenantId: "tenant",
    agentId: "local",
    version: "1.0.0",
    instructions: "private system prompt",
    capabilities: ["research"],
    toolIds: [],
    knowledgeRefs: [],
    runtimeProfile: {},
  });
  await definitions.publishRevision(
    "tenant",
    revision.definition.revisionId,
    0,
  );
  const f = await fixture();
  const { execution, capabilities, ...base } = f.draft;
  const projected = await describePublishedRoomAgent(definitions, {
    ...base,
    agentRevisionId: revision.definition.revisionId,
  });
  assert.equal(projected.execution.revisionId, revision.definition.revisionId);
  assert.ok(!JSON.stringify(projected).includes("private system prompt"));
  const service = rooms();
  const room = await service.createRoom("tenant", {
    title: "Team",
    goal: "Research",
  });
  for (const kind of ["agent", "room_service"]) {
    let count = 0;
    const server = createRoomA2AServer({
      rooms: service,
      definitions,
      service: {
        ...f.service,
        kind,
        bind: async () => ({
          roomId: room.id,
          agentRevisionId: revision.definition.revisionId,
        }),
        async *execute() {
          count++;
          yield { state: "completed" };
        },
      },
      store: new InMemoryA2AStateStore(),
      authenticate: async () => principal,
      pollIntervalMs: 1,
    });
    const response = await server.handle(
      new Request("https://agent.test/rpc", {
        method: "POST",
        headers: { "A2A-Version": "1.0" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "SendMessage",
          params: {
            message: {
              messageId: kind,
              role: "ROLE_USER",
              parts: [{ text: "hi" }],
            },
          },
        }),
      }),
    );
    const data = await response.json();
    assert.ok(!data.error, JSON.stringify(data));
    assert.equal(count, 1);
  }
});
test("Mesh gate checks live authority, tenant, fencing token, lease and application policy", async () => {
  const assignment = {
    assigneePeerId: "peer",
    workItemId: "work",
    assignmentAuthorityId: "assignment",
    fencingToken: "token",
    workDeadline: "2030-01-01",
  };
  const state = {
    admission: {
      peerId: "peer",
      instanceIds: ["instance"],
      validUntil: "2030-01-01",
    },
    discovery: {
      identity: { tenantId: "tenant", peerId: "peer", instanceId: "instance" },
    },
    assignment,
    lease: {
      assignmentAuthorityId: "assignment",
      fencingToken: "token",
      status: "active",
      currentLeaseExpiresAt: "2030-01-01",
    },
    fence: { ...assignment, phase: "active" },
  };
  const gate = createMeshA2AAuthorizer({
    authority: { read: async () => state },
    policy: async () => true,
    clock: () => Date.parse("2026-09-07"),
  });
  const request = {
    principal,
    operation: "send",
    entryId: "research",
    binding: {
      peerId: "peer",
      instanceId: "instance",
      workItemId: "work",
      assignmentAuthorityId: "assignment",
      fencingToken: "token",
    },
  };
  assert.equal(await gate(request), true);
  assert.equal(
    await gate({ ...request, principal: { ...principal, tenantId: "other" } }),
    false,
  );
  assert.equal(
    await gate({
      ...request,
      binding: { ...request.binding, fencingToken: "stale" },
    }),
    false,
  );
  state.lease.status = "expired";
  assert.equal(await gate(request), false);
  assert.equal(await gate({ ...request, operation: "cancel" }), true);
});
test("Morphogenesis uses real fusion, binds revisions, and records uncovered need without genesis", async () => {
  const f = await fixture();
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
      const state = createCapabilityStateFusionStateV1({
        stateKey: "state",
        fusionId: "fusion",
        fusionVersion: 1,
        implementationId: "implementation",
        policy,
      });
      const signals = request.candidates.map((candidate) =>
        createCapabilityStateSignalV1({
          schemaVersion: 1,
          signalId: "signal-" + candidate.candidateId,
          candidateId: candidate.candidateId,
          candidateDigest: candidate.candidateDigest,
          dimension: "trust",
          disposition: "eligible",
          sourceId: "source",
          sourceVersion: 1,
          sourceImplementationDigest: hash,
          sourceRevision: 1,
          reasonCodes: [],
          observedAtLogicalMs: 10,
          expiresAtLogicalMs: 100,
        }),
      );
      return reduceCapabilityStateFusionV1({ state, policy, request, signals })
        .decision;
    },
  };
  const options = {
    principal,
    registry: f.registry,
    requirements: { capabilities: ["research"] },
    requestId: "request",
    scope: {
      tenantId: "tenant",
      meshId: "mesh",
      policyDomainId: "policy",
      missionIntentId: "mission",
      objectiveId: "objective",
      workItemId: null,
      workItemRevision: null,
    },
    logicalTimeMs: 10,
    fusion,
    resolveHost: async () => ({
      peerId: "peer",
      instanceId: "instance",
      agentId: "adapter",
    }),
  };
  const selection = await selectMorphogenesisRegistryCandidates(options);
  assert.equal(selection.candidates.length, 1);
  assert.equal(selection.candidates[0].agentId, "adapter");
  assert.equal(selection.grantsAuthority, false);
  const missing = await selectMorphogenesisRegistryCandidates({
    ...options,
    requirements: { capabilities: ["missing"] },
  });
  assert.equal(missing.uncovered, true);
  let compiled = false;
  const store = new InMemoryA2AStateStore();
  const result = await proposeRegistryMorphogenesis({
    principal,
    missionId: "mission",
    selection: missing,
    store,
    compile: async () => {
      compiled = true;
      throw new Error("must not create");
    },
  });
  assert.equal(compiled, false);
  assert.equal(result.proposal, null);
  await assert.rejects(
    proposeRegistryMorphogenesis({
      principal,
      missionId: "mission",
      selection,
      store,
      compile: async () => ({ context: { need: { evidenceDigests: [] } } }),
    }),
    /selection_evidence_not_bound/,
  );
});

test("canonical recruitment proposal persists bound evidence and remains advisory", async () => {
  const { proposalFixture } =
    await import("../../../examples/a2a-registry/proposal-fixture.mjs");
  const { digest } = await import("../dist/internal.js");
  const selectionBody = {
    requestId: "request",
    scope: {
      tenantId: "tenant",
      meshId: "mesh:test",
      policyDomainId: "policy-domain:test",
      missionIntentId: "mission-intent:test",
      objectiveId: "objective:test",
      workItemId: null,
      workItemRevision: null,
    },
    requirements: { capabilities: ["research"] },
    evidenceDigest: hash,
    candidates: [
      {
        entryId: "research",
        revision: 1,
        candidateDigest: hash,
        agentId: "adapter",
      },
    ],
    uncovered: false,
    incomplete: false,
    grantsAuthority: false,
  };
  const selection = {
    ...selectionBody,
    selectionDigest: `sha256:${digest({ domain: "registry-selection", ...selectionBody })}`,
  };
  const store = new InMemoryA2AStateStore();
  const options = {
    principal,
    missionId: "mission:test",
    selection,
    store,
    compile: async () => proposalFixture(selection.selectionDigest),
  };
  const result = await proposeRegistryMorphogenesis(options);
  assert.equal(result.proposal.advisoryOnly, true);
  assert.equal(result.proposal.operations[0].operator, "recruit_existing");
  assert.equal(result.grantsAuthority, false);
  const again = await proposeRegistryMorphogenesis(options);
  assert.equal(again.proposal.proposalDigest, result.proposal.proposalDigest);
});
test("existing Morphogenesis discovery port keeps membership and bounded-view semantics", async () => {
  const { createRegistryMorphogenesisDiscovery } =
    await import("../dist/morphogenesis.js");
  const { createMorphogenesisCandidateSearchRequestV1 } =
    await import("@agentplat/collective-runtime/morphogenesis");
  const f = await fixture();
  const request = createMorphogenesisCandidateSearchRequestV1({
    requestId: "search",
    scopeDigest: hash,
    positionDigest: hash,
    requiredCapabilityKeys: ["research"],
    membershipConfigurationDigest: hash,
    membershipEpoch: 1,
    viewId: "registry",
    viewDigest: hash,
    searchLimit: 20,
    requestedAtLogicalMs: 10,
    expiresAtLogicalMs: 50,
  });
  const port = createRegistryMorphogenesisDiscovery({
    principal,
    registry: f.registry,
    scopeDigest: hash,
    viewId: "registry",
    viewDigest: hash,
    evaluate: async () => ({
      agentId: "adapter",
      peerId: "peer",
      instanceId: "instance",
      lineageDigest: hash,
      membershipConfigurationDigest: hash,
      membershipEpoch: 1,
      locallyEvaluatedScoreMicros: 1,
      budgetUnits: 1,
      observedAtLogicalMs: 10,
      validUntilLogicalMs: 50,
    }),
  });
  const found = await port.search(request);
  assert.equal(found.status, "eligible_candidates");
  assert.equal(found.candidates[0].agentId, "adapter");
  await assert.rejects(
    port.search({ ...request, scopeDigest: `sha256:${"b".repeat(64)}` }),
    /registry_view_mismatch/,
  );
});
