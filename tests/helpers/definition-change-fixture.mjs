import {
  RoomService,
  InMemoryRoomRepository,
  AgentDefinitionRegistry,
  InMemoryAgentDefinitionRegistryStore,
  AgentGovernanceServiceV1,
  InMemoryAgentGovernanceStoreV1,
  AgentDefinitionChangeServiceV1,
} from "@agentplat/rooms";
export async function definitionChangeFixture(options = {}) {
  const definitions =
    options.definitions ??
    new AgentDefinitionRegistry(new InMemoryAgentDefinitionRegistryStore());
  await definitions.createAgent({ tenantId: "t", agentId: "a", name: "Agent" });
  const revisions = [];
  for (const version of ["1.0.0", "1.1.0"]) {
    const r = await definitions.createRevision({
      tenantId: "t",
      agentId: "a",
      version,
      instructions: "Instructions " + version,
      runtimeProfile: {},
    });
    await definitions.publishRevision("t", r.definition.revisionId, 0);
    revisions.push(r.definition);
  }
  const authenticate = async (user) =>
    user ? { tenantId: "t", subjectId: user } : null;
  const governance = new AgentGovernanceServiceV1(
    options.governanceStore ?? new InMemoryAgentGovernanceStoreV1(),
    { authenticate, authorize: async () => true },
    definitions,
  );
  await governance.execute("owner", {
    agentId: "a",
    operationId: "create",
    expectedRevision: null,
    command: {
      kind: "create",
      governanceId: "g",
      ownerId: "owner",
      purpose: "Research",
      definitionRevisionId: revisions[0].revisionId,
    },
  });
  const rooms =
    options.rooms ??
    new RoomService({
      repository: new InMemoryRoomRepository(),
      clock: options.clock,
    });
  const room = await rooms.createRoom("t", {
    title: "Review",
    goal: "Review instructions",
  });
  const reviewer = await rooms.addParticipant("t", room.id, {
    type: "human",
    displayName: "Reviewer",
    role: "reviewer",
    permissions: ["approve"],
  });
  let passed = true;
  const service = new AgentDefinitionChangeServiceV1({
    clock: options.clock,
    authenticate,
    rooms,
    definitions,
    governance,
    evaluations: {
      verify: async ({ change }) => {
        if (options.onEvaluate) await options.onEvaluate(rooms);
        return {
          passed,
          baseDigest: change.baseDigest,
          candidateDigest: change.candidateDigest,
          evaluationRef: change.evaluationRef,
          expiresAt: options.expiresAt ?? "2099-01-01T00:00:00.000Z",
        };
      },
    },
  });
  async function proposal(
    base,
    candidate,
    expectedGovernanceRevision,
    operationId,
  ) {
    const artifact = await rooms.createArtifact("t", room.id, {
      type: "agent.definition.change.v1",
      title: "Change",
      content: {
        schemaVersion: 1,
        agentId: "a",
        baseRevisionId: base.revisionId,
        baseDigest: base.digest,
        candidateRevisionId: candidate.revisionId,
        candidateDigest: candidate.digest,
        evaluationRef: "eval:1",
        reason: "Measured improvement",
      },
    });
    const approval = await rooms.requestApproval("t", room.id, {
      targetType: "artifact",
      targetId: artifact.id,
      ...(options.approvalExpiresAt
        ? { expiresAt: options.approvalExpiresAt }
        : {}),
    });
    return {
      request: {
        agentId: "a",
        roomId: room.id,
        artifactId: artifact.id,
        artifactVersion: 1,
        approvalId: approval.id,
        expectedGovernanceRevision,
        operationId,
      },
      approve: () =>
        rooms.resolveApproval("t", approval.id, "approved", {
          decidedBy: reviewer.id,
        }),
    };
  }
  return {
    service,
    governance,
    proposal,
    revisions,
    rooms,
    setPassed: (v) => (passed = v),
  };
}
