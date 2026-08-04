import { createServer } from "node:http";

import {
  CollectiveMembershipClientV1,
  CollectiveMembershipHttpTransportV1,
  CollectiveMembershipPeerV1,
  handleCollectiveMembershipHttpRequestV1,
  restoreCollectiveMembershipRegistryV1,
} from "@agentplat/collective-membership";
import { PostgresCollectiveMembershipRepositoryV1 } from "@agentplat/collective-membership-postgres";
import { MESH_SIGNATURE_ALGORITHM } from "@agentplat/mesh-protocol";
import { Pool } from "pg";

const peerId = required("PEER_ID");
const port = Number(required("PEER_PORT"));
const endpoints = JSON.parse(required("PEER_ENDPOINTS"));
const initialConfiguration = JSON.parse(required("INITIAL_CONFIGURATION"));
const scope = {
  tenantId: initialConfiguration.tenantId,
  meshId: initialConfiguration.meshId,
  peerId,
  instanceId: `instance.${peerId}`,
  policyDomainId: initialConfiguration.policyDomainId,
};
const privateKey = await crypto.subtle.importKey(
  "jwk",
  JSON.parse(required("PRIVATE_KEY_JWK")),
  MESH_SIGNATURE_ALGORITHM,
  false,
  ["sign"],
);
const signing = {
  privateKey,
  keyId: required("SIGNING_KEY_ID"),
  algorithm: MESH_SIGNATURE_ALGORITHM,
};
let logicalTimeMs = 100;
const clock = {
  now: () => ({ wallTime: new Date().toISOString(), logicalTimeMs }),
};
const pool = new Pool(databaseOptions());
const repository = new PostgresCollectiveMembershipRepositoryV1(pool, {
  schema: required("MEMBERSHIP_SCHEMA"),
  tenantId: scope.tenantId,
  meshId: scope.meshId,
  peerId,
  policyDomainId: scope.policyDomainId,
});
if ((await repository.configurations()).length === 0)
  await repository.initialize(initialConfiguration);
const registry = await restoreCollectiveMembershipRegistryV1({ repository });
const transport = new CollectiveMembershipHttpTransportV1({
  endpointForPeer: (targetPeerId) =>
    `${endpoints[targetPeerId]}/agentplat/collective-membership/v1`,
  headers: { authorization: `Bearer ${required("CHANNEL_TOKEN")}` },
  fetch: async (...input) => {
    const response = await fetch(...input);
    if (!response.ok)
      process.stderr.write(
        `${peerId}: membership exchange rejected ${response.status} ${await response.clone().text()}\n`,
      );
    return response;
  },
});
const peer = new CollectiveMembershipPeerV1({
  scope,
  signing,
  registry,
  repository,
  clock,
});
const client = new CollectiveMembershipClientV1({
  scope,
  signing,
  registry,
  repository,
  transport,
  clock,
  requestTimeoutMs: 2_000,
});

const server = createServer(async (incoming, outgoing) => {
  try {
    if (
      incoming.headers.authorization !== `Bearer ${required("CHANNEL_TOKEN")}`
    ) {
      outgoing.writeHead(401).end();
      return;
    }
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const request = new Request(
      `http://127.0.0.1:${port}${incoming.url ?? "/"}`,
      {
        method: incoming.method,
        headers: incoming.headers,
        body: Buffer.concat(chunks),
      },
    );
    const response = await handleCollectiveMembershipHttpRequestV1(
      peer,
      request,
    );
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    outgoing.writeHead(500).end();
    process.stderr.write(
      `${peerId}: ${error instanceof Error ? error.message : error}\n`,
    );
  }
});

process.on("message", async (message) => {
  try {
    if (message?.kind === "set_clock") {
      logicalTimeMs = message.logicalTimeMs;
      process.send?.({ kind: "clock_set", requestId: message.requestId });
    } else if (message?.kind === "transition") {
      const certificate = await client.transition(message.proposal);
      process.send?.({
        kind: "transition",
        requestId: message.requestId,
        certificate,
      });
    } else if (message?.kind === "inspect") {
      const bindings = await Promise.all(
        message.logicalTimes.map((time) =>
          registry.currentBinding({ logicalTimeMs: time }),
        ),
      );
      process.send?.({
        kind: "inspection",
        requestId: message.requestId,
        currentEpoch: registry.current().epoch,
        bindings,
      });
    }
  } catch (error) {
    process.send?.({
      kind: "command_error",
      requestId: message?.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(port, "127.0.0.1", () =>
  process.send?.({ kind: "ready", peerId, epoch: registry.current().epoch }),
);

const shutdown = async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
  process.exit(0);
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

function databaseOptions() {
  if (process.env.DATABASE_URL)
    return { connectionString: process.env.DATABASE_URL, max: 3 };
  return {
    host: process.env.PGHOST ?? "127.0.0.1",
    port: Number(process.env.PGPORT ?? "55433"),
    database: process.env.PGDATABASE ?? "agentplat_mesh_demo",
    user: process.env.PGUSER ?? "agentplat",
    password: process.env.PGPASSWORD ?? "agentplat",
    max: 3,
  };
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
