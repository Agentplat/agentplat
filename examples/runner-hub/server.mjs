import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { createPostgresPool } from "../../packages/postgres/dist/index.js";
import {
  PostgresRunnerRepository,
  RunnerService,
  RunnerHub,
  createRunnerRoutes,
} from "../../packages/runner-hub/dist/index.js";

const tenant = process.env.AGENTPLAT_RUNNER_TENANT;
const key = process.env.AGENTPLAT_RUNNER_KEY;
const port = Number(process.env.PORT ?? 3010);
if (!tenant?.trim() || !key || !process.env.DATABASE_URL)
  throw new Error(
    "Set DATABASE_URL, AGENTPLAT_RUNNER_TENANT and AGENTPLAT_RUNNER_KEY",
  );
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid PORT");
const authorize = (requestedTenant, credential) => {
  if (requestedTenant !== tenant || typeof credential !== "string")
    return false;
  const actual = Buffer.from(credential);
  const expected = Buffer.from(key);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
const pool = createPostgresPool();
const repository = new PostgresRunnerRepository(pool);
try {
  await repository.migrate();
} catch (error) {
  await pool.end();
  throw error;
}
const service = new RunnerService(repository);
const routes = createRunnerRoutes({
  service,
  authenticate: (request) =>
    authorize(
      request.headers.get("x-tenant-id"),
      request.headers.get("x-agentplat-key"),
    )
      ? tenant
      : null,
});
const server = createServer(async (request, response) => {
  try {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of request) {
      bytes += chunk.length;
      if (bytes > 1024 * 1024) {
        response.writeHead(413);
        response.end();
        return;
      }
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    const result = await routes.fetch(
      new Request(`http://localhost:${port}${request.url}`, {
        method: request.method,
        headers: request.headers,
        ...(body.length ? { body } : {}),
      }),
    );
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(await result.text());
  } catch (error) {
    console.error("Runner API request failed");
    response.writeHead(500);
    response.end();
  }
});
const hub = new RunnerHub(server, service, {
  authenticate: (_request, requestedTenant, credential) =>
    authorize(requestedTenant, credential),
  onError: (error) => console.error("Runner Hub error", error),
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Runner Hub: http://127.0.0.1:${port}, WebSocket /ws/runners (tenant ${tenant})`,
  ),
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await hub.close();
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
}
process.once(
  "SIGINT",
  () =>
    void stop().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    }),
);
process.once(
  "SIGTERM",
  () =>
    void stop().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    }),
);
