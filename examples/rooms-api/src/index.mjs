import { serve } from '@hono/node-server';
import { InMemoryEventBus } from '@agentplat/events';
import { RoomService } from '@agentplat/rooms';
import { createRoomsApp } from '@agentplat/rooms-api';
import {
  createPostgresPool,
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
});

const app = createRoomsApp({ service });
const server = serve({
  fetch: app.fetch,
  hostname,
  port,
});

console.log(`Agentplat Rooms API listening on http://${hostname}:${port}`);

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; closing the HTTP server and database pool.`);

  try {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await pool.end();
  } catch (error) {
    console.error('Graceful shutdown failed.', error);
    process.exitCode = 1;
  }
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
