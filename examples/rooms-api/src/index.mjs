import { serve } from '@hono/node-server';
import { InMemoryEventBus } from '@agentplat/events';
import {
  AgentDefinitionRegistry,
  AgentRoomCoordinationRuntime,
  AgentRoomCoordinationWorker,
  AgentRoomCoordinator,
  AgentRoomHandoffCoordinator,
  AgentRoomLiveViewService,
  AgentRoomOperationalEventProjector,
  AgentRoomPlannerBridge,
  DefaultAgentRoomCoordinationExecutionPort,
  HumanContributionCoordinator,
  KnowledgeBundleRegistry,
  LocalWorkManagementProvider,
  PolicyBoundRoomRoutingStrategy,
  RepositoryAgentRoomCoordinationStore,
  RoomExecutionCoordinator,
  RoomParticipantMembershipCoordinator,
  RoomService,
  WorkManagementDeliveryRuntime,
} from '@agentplat/rooms';
import { createRoomsApp } from '@agentplat/rooms-api';
import {
  createPostgresPool,
  PostgresAgentDefinitionRegistryStore,
  PostgresAgentRoomPlanStore,
  PostgresHumanContributionDeliveryStore,
  PostgresHumanContributionStore,
  PostgresKnowledgeBundleStore,
  PostgresRoomExecutionSessionStore,
  PostgresRoomHandoffStore,
  PostgresAgentRoomOperationalEventStore,
  PostgresAgentRoomProjectionCheckpointStore,
  PostgresRoomParticipantMembershipStore,
  PostgresRoomRepository,
} from '@agentplat/rooms-postgres';
import { DefaultAgentRuntime } from '@agentplat/runtime';
import { MockAgentProvider } from '@agentplat/runtime-mock';

function parsePort(value) {
  const port = Number(value ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      `PORT must be an integer between 1 and 65535; got "${value}".`
    );
  }
  return port;
}

const port = parsePort(process.env.PORT);
const hostname = process.env.HOST ?? '0.0.0.0';
const pool = createPostgresPool();

// Fail before accepting traffic when the database configuration is invalid.
await pool.query('SELECT 1');

const repository = new PostgresRoomRepository(pool);
const eventBus = new InMemoryEventBus();
const runtime = new DefaultAgentRuntime();
runtime.registerProvider('mock', new MockAgentProvider());

const service = new RoomService({
  repository,
  eventPublisher: eventBus,
  runtime,
  automaticCoordination: {},
});

const agentRegistry = new AgentDefinitionRegistry(
  new PostgresAgentDefinitionRegistryStore(pool)
);
const executionStore = new PostgresRoomExecutionSessionStore(pool);
const handoffStore = new PostgresRoomHandoffStore(pool);
const contributionStore = new PostgresHumanContributionStore(pool);
const deliveryStore = new PostgresHumanContributionDeliveryStore(pool);
const coordinationStore = new RepositoryAgentRoomCoordinationStore(repository);
const planStore = new PostgresAgentRoomPlanStore(pool);
const membershipStore = new PostgresRoomParticipantMembershipStore(pool);
const operationalEvents = new PostgresAgentRoomOperationalEventStore(pool);
const execution = new RoomExecutionCoordinator(service, executionStore, {
  agentRegistry,
});
const handoffs = new AgentRoomHandoffCoordinator(
  service,
  handoffStore,
  agentRegistry
);
const humanContributions = new HumanContributionCoordinator(
  service,
  contributionStore
);
const workManagement = new WorkManagementDeliveryRuntime(deliveryStore, [
  new LocalWorkManagementProvider(),
]);
const knowledge = new KnowledgeBundleRegistry(
  new PostgresKnowledgeBundleStore(pool)
);
const liveView = new AgentRoomLiveViewService(
  service,
  coordinationStore,
  execution,
  handoffs,
  humanContributions,
  deliveryStore,
  planStore,
  membershipStore,
  operationalEvents
);
const planner = new AgentRoomPlannerBridge(
  planStore,
  service,
  humanContributions,
  handoffs
);
const operationalProjector = new AgentRoomOperationalEventProjector(
  operationalEvents,
  new PostgresAgentRoomProjectionCheckpointStore(pool),
  coordinationStore,
  handoffs,
  planner
);
const participantMembership = new RoomParticipantMembershipCoordinator(
  service,
  membershipStore
);
const routing = new AgentRoomCoordinator(
  service,
  new PolicyBoundRoomRoutingStrategy()
);
const coordinationExecution = new DefaultAgentRoomCoordinationExecutionPort(
  service,
  agentRegistry,
  execution,
  handoffs
);
const coordinationRuntime = new AgentRoomCoordinationRuntime(
  coordinationStore,
  routing,
  handoffs,
  coordinationExecution,
  { humanContributions }
);
const coordinationWorker = new AgentRoomCoordinationWorker(
  coordinationStore,
  coordinationRuntime,
  {
    workerId: `rooms-api:${process.pid}`,
    beforePoll: () => operationalProjector.projectAll().then(() => undefined),
  }
);
const workerAbort = new AbortController();

const app = createRoomsApp({
  service,
  agentRegistry,
  execution,
  handoffs,
  humanContributions,
  workManagement,
  knowledge,
  liveView,
  planner,
  participantMembership,
});
const server = serve({
  fetch: app.fetch,
  hostname,
  port,
});
const workerRun = coordinationWorker
  .start(workerAbort.signal)
  .catch((error) => {
    console.error('Agent Room coordination worker failed.', error);
    process.exitCode = 1;
  });

console.log(`AgentPlat Agent Room API listening on http://${hostname}:${port}`);

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; closing the HTTP server and database pool.`);

  try {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    workerAbort.abort();
    coordinationWorker.stop();
    await workerRun;
    await pool.end();
  } catch (error) {
    console.error('Graceful shutdown failed.', error);
    process.exitCode = 1;
  }
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
