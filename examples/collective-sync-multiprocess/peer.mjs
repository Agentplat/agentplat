import { createServer } from "node:http";
import process from "node:process";
import {
  CollectiveSyncClientV1,
  CollectiveSyncHttpTransportV1,
  CollectiveSyncPeerV1,
  CollectiveSyncReadinessGateV1,
  handleCollectiveSyncHttpRequestV1,
} from "@agentplat/collective-sync";
import { MESH_SIGNATURE_ALGORITHM } from "@agentplat/mesh-protocol";
import { PostgresCollectiveSyncRepositoryV1 } from "@agentplat/collective-sync-postgres";
import { Pool } from "pg";

const peerId = required("PEER_ID");
const port = Number(required("PORT"));
const scope = JSON.parse(required("SCOPE"));
const binding = Object.freeze(JSON.parse(required("MEMBERSHIP_BINDING")));
const keyDefinitions = JSON.parse(required("PUBLIC_KEYS"));
const privateDefinition = JSON.parse(required("PRIVATE_KEY"));
const endpoints = JSON.parse(required("ENDPOINTS"));
let logicalTimeMs = Number(process.env.LOGICAL_TIME_MS ?? "100");
const pool = new Pool(databaseOptions());
const repository = new PostgresCollectiveSyncRepositoryV1(pool, {
  schema: required("DATABASE_SCHEMA"),
  tenantId: scope.tenantId,
  meshId: scope.meshId,
  peerId: scope.peerId,
  instanceId: scope.instanceId,
  policyDomainId: scope.policyDomainId,
});

const publicKeys = new Map();
for (const [memberPeerId, definition] of Object.entries(keyDefinitions)) {
  publicKeys.set(memberPeerId, {
    definition,
    publicKey: await crypto.subtle.importKey(
      "jwk",
      definition.publicKey,
      { name: MESH_SIGNATURE_ALGORITHM },
      true,
      ["verify"],
    ),
  });
}
const privateKey = await crypto.subtle.importKey(
  "jwk",
  privateDefinition.privateKey,
  { name: MESH_SIGNATURE_ALGORITHM },
  true,
  ["sign"],
);
const membership = {
  currentBinding: async () => binding,
  resolveBinding: async ({ epoch, configurationDigest }) =>
    epoch === binding.epoch &&
    configurationDigest === binding.configurationDigest
      ? binding
      : null,
  resolve: ({ tenantId, meshId, peerId: senderPeerId, keyId, algorithm }) => {
    const entry = publicKeys.get(senderPeerId);
    if (
      !entry ||
      tenantId !== scope.tenantId ||
      meshId !== scope.meshId ||
      keyId !== entry.definition.keyId ||
      algorithm !== MESH_SIGNATURE_ALGORITHM
    )
      return undefined;
    return {
      tenantId,
      meshId,
      peerId: senderPeerId,
      keyId,
      algorithm,
      publicKey: entry.publicKey,
      validFrom: "2029-01-01T00:00:00.000Z",
      validUntil: "2031-01-01T00:00:00.000Z",
      status: "active",
    };
  },
};
const clock = {
  now: () => ({
    wallTime: "2030-01-01T00:00:00.000Z",
    logicalTimeMs: logicalTimeMs++,
  }),
};
const signing = {
  privateKey,
  keyId: privateDefinition.keyId,
  algorithm: MESH_SIGNATURE_ALGORITHM,
};
const projection = { accepted: [] };
const adapter = {
  validate: async (record) =>
    record.payload !== null &&
    typeof record.payload === "object" &&
    ["objective.accepted", "work.accepted", "result.accepted"].includes(
      record.payload.type,
    ),
  replay: async (records) => {
    for (const record of records)
      if (!projection.accepted.includes(record.recordDigest))
        projection.accepted.push(record.recordDigest);
  },
};
await restoreProjection();
const peer = new CollectiveSyncPeerV1({
  scope,
  signing,
  membership,
  repository,
  clock,
});
const transport = new CollectiveSyncHttpTransportV1({
  endpoints,
  headers: { authorization: `Bearer ${required("CHANNEL_TOKEN")}` },
});
const client = new CollectiveSyncClientV1({
  scope,
  signing,
  membership,
  repository,
  adapter,
  transport,
  clock,
  maximumRecordsPerChunk: 1,
});
const readiness = new CollectiveSyncReadinessGateV1({
  scope,
  membership,
  repository,
  clock,
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
    const response = await handleCollectiveSyncHttpRequestV1(peer, request);
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
    if (message?.kind === "append") {
      const result = await repository.append({
        syncDomain: message.syncDomain,
        membership: binding,
        records: message.records,
      });
      await adapter.replay(message.records);
      respond(message, "append", {
        frontierDigest: result.frontier.frontierDigest,
      });
    } else if (message?.kind === "catch_up") {
      const certificate = await client.catchUp({
        syncDomain: message.syncDomain,
        signal: AbortSignal.timeout(8_000),
      });
      respond(message, "catch_up", {
        ok: true,
        certificateId: certificate.certificateId,
      });
    } else if (message?.kind === "inspect") {
      const frontier = await repository.frontier({
        syncDomain: message.syncDomain,
        membership: binding,
      });
      const decision = await readiness.check({
        syncDomain: message.syncDomain,
      });
      respond(message, "inspect", {
        frontier,
        readiness: decision,
        projection: structuredClone(projection),
      });
    }
  } catch (error) {
    respond(message, message?.kind ?? "command", {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(port, "127.0.0.1", () =>
  process.send?.({ kind: "ready", peerId, epoch: binding.epoch }),
);

async function restoreProjection() {
  let cursors = [];
  while (true) {
    const chunk = await repository.readAfter({
      syncDomain: "mission.1",
      membership: binding,
      cursors,
      maximumRecords: 256,
      maximumBytes: 1_048_576,
    });
    await adapter.replay(chunk.records);
    cursors = chunk.nextCursors;
    if (!chunk.hasMore) break;
  }
}

function respond(message, kind, value) {
  process.send?.({ kind, requestId: message?.requestId, ...value });
}
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
const shutdown = async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
  process.exit(0);
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
