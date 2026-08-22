import assert from 'node:assert/strict';
import {
  AgentDefinitionRegistry,
  AgentRoomCoordinationRuntime,
  AgentRoomCoordinator,
  AgentRoomHandoffCoordinator,
  AgentRoomLiveViewService,
  AgentRoomPlannerBridge,
  DefaultAgentRoomCoordinationExecutionPort,
  HumanContributionCoordinator,
  KnowledgeBundleRegistry,
  LocalWorkManagementProvider,
  PolicyBoundRoomRoutingStrategy,
  RoomExecutionCoordinator,
  RoomParticipantMembershipCoordinator,
  RepositoryAgentRoomCoordinationStore,
  RoomService,
  WorkManagementDeliveryRuntime,
} from '@agentplat/rooms';
import {
  createPostgresPool,
  PostgresAgentDefinitionRegistryStore,
  PostgresAgentRoomPlanStore,
  PostgresHumanContributionDeliveryStore,
  PostgresHumanContributionStore,
  PostgresKnowledgeBundleStore,
  PostgresRoomExecutionSessionStore,
  PostgresRoomHandoffStore,
  PostgresRoomParticipantMembershipStore,
  PostgresRoomRepository,
  runMigrations,
} from '@agentplat/rooms-postgres';
import { DefaultAgentRuntime } from '@agentplat/runtime';
import { MockAgentProvider } from '@agentplat/runtime-mock';

const pool = createPostgresPool();
const tenantId = `reference-${process.pid}-${Date.now()}`;

try {
  await runMigrations(pool);
  const repository = new PostgresRoomRepository(pool);
  const runtime = new DefaultAgentRuntime();
  runtime.registerProvider('mock', new MockAgentProvider());
  const rooms = new RoomService({
    repository,
    runtime,
    automaticCoordination: {},
  });
  const definitions = new AgentDefinitionRegistry(
    new PostgresAgentDefinitionRegistryStore(pool)
  );
  const knowledge = new KnowledgeBundleRegistry(
    new PostgresKnowledgeBundleStore(pool)
  );
  const bundle = await knowledge.createRevision({
    tenantId,
    bundleId: 'reference-policy',
    version: '1.0.0',
    documents: [
      {
        documentId: 'policy',
        title: 'Reference policy',
        content: 'Produce deterministic, attributable artifacts.',
      },
    ],
  });
  await definitions.createAgent({
    tenantId,
    agentId: 'research-agent',
    name: 'Research Agent',
  });
  const draft = await definitions.createRevision({
    tenantId,
    agentId: 'research-agent',
    version: '1.0.0',
    instructions: 'Produce a concise research brief.',
    capabilities: ['research'],
    knowledgeRefs: [bundle.reference],
    runtimeProfile: { platform: 'mock' },
  });
  await definitions.publishRevision(tenantId, draft.definition.revisionId, 0);

  const room = await rooms.createRoom(tenantId, {
    title: 'Reference Agent Room',
    goal: 'Produce and review a deterministic research brief',
  });
  const agent = await rooms.addParticipant(tenantId, room.id, {
    type: 'agent',
    displayName: 'Research Agent',
    role: 'researcher',
    authorityLevel: 2,
    permissions: ['task.run', 'human_contribution.request'],
    runtime: { platform: 'mock' },
    metadata: { agentId: 'research-agent', aliases: ['research'] },
  });
  const human = await rooms.addParticipant(tenantId, room.id, {
    type: 'human',
    displayName: 'Reviewer',
    role: 'reviewer',
    permissions: ['human_contribution.complete', 'human_contribution.assign'],
  });
  const message = await rooms.sendMessage(tenantId, room.id, {
    role: 'human',
    content: '@research prepare the reference brief.',
  });

  const membershipStore = new PostgresRoomParticipantMembershipStore(pool);
  const memberships = new RoomParticipantMembershipCoordinator(
    rooms,
    membershipStore
  );
  await memberships.create({
    tenantId,
    roomId: room.id,
    participantId: agent.id,
    allowedAgentRevisionIds: [draft.definition.revisionId],
  });
  await memberships.create({
    tenantId,
    roomId: room.id,
    participantId: human.id,
    routingEligible: false,
    acceptsHandoffs: false,
  });

  const executionSessions = new RoomExecutionCoordinator(
    rooms,
    new PostgresRoomExecutionSessionStore(pool),
    { agentRegistry: definitions }
  );
  const handoffs = new AgentRoomHandoffCoordinator(
    rooms,
    new PostgresRoomHandoffStore(pool),
    definitions
  );
  const routing = new AgentRoomCoordinator(
    rooms,
    new PolicyBoundRoomRoutingStrategy(),
    memberships
  );
  const execution = new DefaultAgentRoomCoordinationExecutionPort(
    rooms,
    definitions,
    executionSessions,
    handoffs
  );
  const contributions = new HumanContributionCoordinator(
    rooms,
    new PostgresHumanContributionStore(pool)
  );
  const planStore = new PostgresAgentRoomPlanStore(pool);
  const planner = new AgentRoomPlannerBridge(
    planStore,
    rooms,
    contributions,
    handoffs
  );
  const plan = await planner.create({
    tenantId,
    roomId: room.id,
    planId: 'reference-plan',
    objective: 'Track the deterministic reference execution',
    steps: [],
  });
  await planner.materialize({
    tenantId,
    roomId: room.id,
    planId: plan.planId,
    expectedRevision: plan.revision,
  });
  const coordination = new AgentRoomCoordinationRuntime(
    new RepositoryAgentRoomCoordinationStore(repository),
    routing,
    handoffs,
    execution,
    { humanContributions: contributions }
  );
  const coordinated = await coordination.runNext({
    tenantId,
    roomId: room.id,
    coordinationId: `room:${room.id}`,
    expectedRevision: 0,
    leaseToken: 'reference-worker',
  });
  assert.equal(coordinated.status, 'completed');

  const contribution = await contributions.request({
    tenantId,
    roomId: room.id,
    contributionId: 'review-brief',
    requestedByParticipantId: agent.id,
    assignedParticipantId: human.id,
    instruction: 'Review the generated brief.',
    expectedOutput: 'A structured review decision',
  });
  const started = await contributions.start({
    tenantId,
    roomId: room.id,
    contributionId: contribution.contributionId,
    expectedRevision: contribution.revision,
    participantId: human.id,
  });
  const completed = await contributions.complete({
    tenantId,
    roomId: room.id,
    contributionId: contribution.contributionId,
    expectedRevision: started.revision,
    participantId: human.id,
    result: { approved: true },
  });
  const deliveries = new WorkManagementDeliveryRuntime(
    new PostgresHumanContributionDeliveryStore(pool),
    [new LocalWorkManagementProvider()]
  );
  const queued = await deliveries.enqueue({
    contribution: completed,
    providerId: 'local',
  });
  const synchronized = await deliveries.synchronize({
    contribution: completed,
    providerId: 'local',
    expectedRevision: queued.revision,
    leaseToken: 'reference-delivery-worker',
  });
  assert.equal(synchronized.status, 'synchronized');

  const finalState = await rooms.getRoomState(tenantId, room.id);
  assert.equal(finalState.tasks.length, 1);
  assert.equal(finalState.runs[0].status, 'completed');
  assert.equal(finalState.artifacts.length, 1);
  const live = new AgentRoomLiveViewService(
    rooms,
    new RepositoryAgentRoomCoordinationStore(repository),
    executionSessions,
    handoffs,
    contributions,
    new PostgresHumanContributionDeliveryStore(pool),
    planStore,
    membershipStore
  );
  const liveView = await live.get({
    tenantId,
    roomId: room.id,
    coordinationId: `room:${room.id}`,
    contributionIds: [completed.contributionId],
    planIds: [plan.planId],
  });
  assert.equal(liveView.plans.length, 1);
  assert.equal(liveView.participantMemberships.length, 2);
  console.log(
    JSON.stringify(
      {
        tenantId,
        roomId: room.id,
        coordinationStatus: coordinated.status,
        taskCount: finalState.tasks.length,
        runCount: finalState.runs.length,
        artifactCount: finalState.artifacts.length,
        humanContributionStatus: completed.status,
        deliveryStatus: synchronized.status,
        planCount: liveView.plans.length,
        participantMembershipCount: liveView.participantMemberships.length,
        liveEventCount: liveView.events.length,
      },
      null,
      2
    )
  );
} finally {
  await pool.end();
}
