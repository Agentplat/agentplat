import assert from 'node:assert/strict';
import {
  AgentDefinitionRegistry,
  AgentRoomHandoffCoordinator,
  DefaultAgentRoomCoordinationExecutionPort,
  HumanContributionCoordinator,
  LocalWorkManagementProvider,
  RoomExecutionCoordinator,
  RoomService,
  RunInterventionDispatcher,
  WorkManagementDeliveryRuntime,
} from '@agentplat/rooms';
import {
  createPostgresPool,
  PostgresAgentDefinitionRegistryStore,
  PostgresHumanContributionDeliveryStore,
  PostgresHumanContributionStore,
  PostgresRoomExecutionSessionStore,
  PostgresRoomHandoffStore,
  PostgresRoomRepository,
  runMigrations,
} from '@agentplat/rooms-postgres';
import { DefaultAgentRuntime } from '@agentplat/runtime';
import { MockAgentProvider } from '@agentplat/runtime-mock';

const phase = process.argv[2];
const tenantId = process.env.RECOVERY_TENANT_ID ?? 'restart-reference';
const roomId = 'restart-operations-room';
const pool = createPostgresPool();
const repository = new PostgresRoomRepository(pool);
const definitionStore = new PostgresAgentDefinitionRegistryStore(pool);
const executionStore = new PostgresRoomExecutionSessionStore(pool);
const handoffStore = new PostgresRoomHandoffStore(pool);
const contributionStore = new PostgresHumanContributionStore(pool);
const deliveryStore = new PostgresHumanContributionDeliveryStore(pool);

try {
  await runMigrations(pool);
  if (phase === 'prepare') await prepare();
  else if (phase === 'recover') await recover();
  else throw new Error('Expected prepare or recover phase');
} finally {
  await pool.end();
}

async function prepare() {
  const rooms = new RoomService({ repository });
  await rooms.createRoom(tenantId, {
    id: roomId,
    title: 'Restart operations Room',
    goal: 'Recover Agent Room operations',
  });
  const definitions = new AgentDefinitionRegistry(definitionStore);
  const revisions = {};
  for (const agentId of ['source-agent', 'target-agent']) {
    await definitions.createAgent({ tenantId, agentId, name: agentId });
    const draft = await definitions.createRevision({
      tenantId,
      agentId,
      version: '1.0.0',
      instructions: `Instructions for ${agentId}`,
      runtimeProfile: { platform: 'mock' },
    });
    revisions[agentId] = draft.definition.revisionId;
    await definitions.publishRevision(tenantId, draft.definition.revisionId, 0);
  }
  const source = await rooms.addParticipant(tenantId, roomId, {
    id: 'source-participant',
    type: 'agent',
    displayName: 'Source Agent',
    role: 'source',
    authorityLevel: 3,
    permissions: ['task.run', 'human_contribution.request'],
    runtime: { platform: 'mock' },
    metadata: { agentId: 'source-agent' },
  });
  const target = await rooms.addParticipant(tenantId, roomId, {
    id: 'target-participant',
    type: 'agent',
    displayName: 'Target Agent',
    role: 'target',
    authorityLevel: 2,
    permissions: ['task.run', 'handoff.accept'],
    runtime: { platform: 'mock' },
    metadata: { agentId: 'target-agent' },
  });
  const human = await rooms.addParticipant(tenantId, roomId, {
    id: 'human-participant',
    type: 'human',
    displayName: 'Human Reviewer',
    role: 'reviewer',
    permissions: ['human_contribution.complete', 'run.intervene'],
  });
  const task = await rooms.createTask(tenantId, roomId, {
    id: 'stale-task',
    stepId: 'stale-task',
    assignedParticipantId: source.id,
    instruction: 'Recover this expired run.',
    expectedOutput: 'Recovered output',
    expectedArtifactKind: 'recovery-result',
    actionLevel: 'draft',
  });
  const staleRun = {
    id: 'stale-run',
    tenantId,
    roomId,
    taskId: task.id,
    participantId: source.id,
    runtime: 'mock',
    status: 'running',
    startedAt: '2000-01-01T00:00:00.000Z',
    leaseExpiresAt: '2000-01-01T00:00:01.000Z',
  };
  await repository.transaction(tenantId, async (transaction) => {
    await transaction.updateTask({
      ...task,
      status: 'running',
      updatedAt: staleRun.startedAt,
    });
    await transaction.insertRun(staleRun);
  });
  const execution = new RoomExecutionCoordinator(rooms, executionStore, {
    agentRegistry: definitions,
  });
  const session = await execution.openSession({
    tenantId,
    roomId,
    sessionId: 'stale-execution',
    runId: staleRun.id,
    agentRevisionId: revisions['source-agent'],
  });
  const intervention = await execution.requestIntervention({
    tenantId,
    roomId,
    sessionId: session.sessionId,
    expectedRevision: session.revision,
    operationId: 'stale-intervention',
    requestedByParticipantId: human.id,
    instruction: 'Preserve recovery identity.',
    checkpoint: 'pre_step',
  });
  await execution.claimIntervention({
    tenantId,
    roomId,
    sessionId: session.sessionId,
    expectedRevision: intervention.revision,
    checkpoint: 'pre_step',
    dispatchToken: 'terminated-intervention-worker',
    leaseMs: 1,
  });
  const handoffs = new AgentRoomHandoffCoordinator(
    rooms,
    handoffStore,
    definitions
  );
  const proposed = await handoffs.propose({
    tenantId,
    roomId,
    handoffId: 'accepted-handoff',
    sourceParticipantId: source.id,
    sourceRunId: staleRun.id,
    sourceAgentRevisionId: revisions['source-agent'],
    targetParticipantId: target.id,
    targetAgentRevisionId: revisions['target-agent'],
    instruction: 'Continue recovered work.',
    authorityCeiling: 2,
  });
  await handoffs.accept({
    tenantId,
    roomId,
    handoffId: proposed.handoffId,
    expectedRevision: proposed.revision,
    acceptedByParticipantId: target.id,
  });
  const contributions = new HumanContributionCoordinator(
    rooms,
    contributionStore
  );
  const contribution = await contributions.request({
    tenantId,
    roomId,
    contributionId: 'pending-contribution',
    requestedByParticipantId: source.id,
    assignedParticipantId: human.id,
    instruction: 'Confirm restart recovery.',
    expectedOutput: 'A structured confirmation',
  });
  const deliveries = new WorkManagementDeliveryRuntime(deliveryStore, [
    new LocalWorkManagementProvider(),
  ]);
  const delivery = await deliveries.enqueue({
    contribution,
    providerId: 'local',
  });
  await deliveryStore.compareAndSet({
    expectedRevision: delivery.revision,
    state: {
      ...delivery,
      revision: delivery.revision + 1,
      status: 'processing',
      attempts: 1,
      leaseToken: 'terminated-delivery-worker',
      leaseExpiresAt: '2000-01-01T00:00:00.000Z',
      updatedAt: new Date().toISOString(),
    },
  });
  console.log(
    JSON.stringify({
      phase,
      runId: staleRun.id,
      interventionId: 'stale-intervention',
      handoffId: 'accepted-handoff',
      contributionId: contribution.contributionId,
      deliveryId: delivery.deliveryId,
    })
  );
}

async function recover() {
  const runtime = new DefaultAgentRuntime();
  runtime.registerProvider('mock', new MockAgentProvider());
  const rooms = new RoomService({ repository, runtime });
  const definitions = new AgentDefinitionRegistry(definitionStore);
  const execution = new RoomExecutionCoordinator(rooms, executionStore, {
    agentRegistry: definitions,
  });
  const handoffs = new AgentRoomHandoffCoordinator(
    rooms,
    handoffStore,
    definitions
  );
  const recoveredRun = await rooms.runTask(tenantId, roomId, 'stale-task');
  assert.equal(recoveredRun.status, 'completed');
  const dispatcher = new RunInterventionDispatcher(execution, {
    apply: async () => ({ status: 'applied' }),
  });
  const staleSession = await execution.getSession({
    tenantId,
    roomId,
    sessionId: 'stale-execution',
  });
  const applied = await dispatcher.dispatchNext({
    tenantId,
    roomId,
    sessionId: 'stale-execution',
    expectedRevision: staleSession.revision,
    checkpoint: 'pre_step',
    dispatchToken: 'successor-intervention-worker',
  });
  const reconciledSession = await execution.reconcileSession({
    tenantId,
    roomId,
    sessionId: 'stale-execution',
    expectedRevision: applied.revision,
  });
  assert.equal(reconciledSession.status, 'failed');
  const executionPort = new DefaultAgentRoomCoordinationExecutionPort(
    rooms,
    definitions,
    execution,
    handoffs
  );
  const accepted = await handoffs.get({
    tenantId,
    roomId,
    handoffId: 'accepted-handoff',
  });
  await executionPort.dispatchHandoff({
    handoff: accepted,
    operationId: 'restart-handoff-operation',
  });
  const contributions = new HumanContributionCoordinator(
    rooms,
    contributionStore
  );
  const pending = await contributions.get({
    tenantId,
    roomId,
    contributionId: 'pending-contribution',
  });
  const completed = await contributions.complete({
    tenantId,
    roomId,
    contributionId: pending.contributionId,
    expectedRevision: pending.revision,
    participantId: pending.assignedParticipantId,
    result: { recovered: true },
  });
  const deliveries = new WorkManagementDeliveryRuntime(deliveryStore, [
    new LocalWorkManagementProvider(),
  ]);
  const requeued = await deliveries.enqueue({
    contribution: completed,
    providerId: 'local',
  });
  const synchronized = await deliveries.synchronize({
    contribution: completed,
    providerId: 'local',
    expectedRevision: requeued.revision,
    leaseToken: 'successor-delivery-worker',
  });
  console.log(
    JSON.stringify({
      phase,
      recoveredRunId: recoveredRun.id,
      interventionStatus: applied.interventions.at(-1).status,
      staleExecutionStatus: reconciledSession.status,
      handoffStatus: (
        await handoffs.get({ tenantId, roomId, handoffId: 'accepted-handoff' })
      ).status,
      contributionStatus: completed.status,
      deliveryStatus: synchronized.status,
    })
  );
}
