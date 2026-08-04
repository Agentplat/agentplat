import { createServer } from "node:http";

import {
  CollectiveQuorumClientV1,
  CollectiveQuorumHttpTransportV1,
  CollectiveQuorumPeerV1,
  handleCollectiveQuorumHttpRequestV1,
} from "@agentplat/collective-quorum";
import { PostgresCollectiveQuorumRepositoryV1 } from "@agentplat/collective-quorum-postgres";
import { createStaticMeshKeyResolver } from "@agentplat/mesh-crypto";
import { MESH_SIGNATURE_ALGORITHM } from "@agentplat/mesh-protocol";
import { Pool } from "pg";

const peerId = required("PEER_ID");
const port = Number(required("PEER_PORT"));
const endpoints = JSON.parse(required("PEER_ENDPOINTS"));
const processEpoch = Number(process.env.PROCESS_EPOCH ?? "1");
const scope = {
  tenantId: "tenant.quorum.demo",
  meshId: "mesh.quorum.demo",
  peerId,
  instanceId: `${peerId}.process.${processEpoch}`,
  policyDomainId: "policy.quorum.demo",
};
const privateKey = await crypto.subtle.importKey(
  "jwk",
  JSON.parse(required("PRIVATE_KEY_JWK")),
  MESH_SIGNATURE_ALGORITHM,
  false,
  ["sign"],
);
const publicJwks = JSON.parse(required("PUBLIC_KEY_JWKS"));
const resolver = createStaticMeshKeyResolver(
  await Promise.all(
    Object.entries(publicJwks).map(async ([subjectPeerId, jwk]) => ({
      tenantId: scope.tenantId,
      meshId: scope.meshId,
      peerId: subjectPeerId,
      keyId: `${subjectPeerId}.key.1`,
      algorithm: MESH_SIGNATURE_ALGORITHM,
      publicKey: await crypto.subtle.importKey(
        "jwk",
        jwk,
        MESH_SIGNATURE_ALGORITHM,
        false,
        ["verify"],
      ),
      validFrom: "2025-01-01T00:00:00.000Z",
      validUntil: "2035-01-01T00:00:00.000Z",
      status: "active",
    })),
  ),
);
const signing = {
  privateKey,
  keyId: `${peerId}.key.1`,
  algorithm: MESH_SIGNATURE_ALGORITHM,
};
const clock = {
  now: () => ({ wallTime: new Date().toISOString(), logicalTimeMs: 100 }),
};
const pool = new Pool(databaseOptions());
const repository = new PostgresCollectiveQuorumRepositoryV1(pool, {
  schema: required("QUORUM_SCHEMA"),
  tenantId: scope.tenantId,
  meshId: scope.meshId,
  peerId,
  policyDomainId: scope.policyDomainId,
});
const transport = new CollectiveQuorumHttpTransportV1({
  endpointForPeer: (targetPeerId) =>
    `${endpoints[targetPeerId]}/agentplat/collective-quorum/v1`,
  headers: { authorization: `Bearer ${required("CHANNEL_TOKEN")}` },
});
const evidence = {
  confirmAssignment: async ({ request, localPeerId }) => ({
    acceptanceId: "acceptance.demo.1",
    confirmedLeaseExpiresAt: "2030-01-01T00:10:00.000Z",
    attesterRole: localPeerId === request.ownerPeerId ? "owner" : "witness",
  }),
  acceptsRecoveryValue: async ({ request, selected }) =>
    request.proposals.some(
      (proposal) =>
        proposal.takeoverProposalId === selected.selectedProposalId &&
        proposal.proposedAssigneePeerId === selected.selectedAssigneePeerId,
    ),
};
const quorumPeer = new CollectiveQuorumPeerV1({
  scope,
  signing,
  resolver,
  repository,
  evidence,
  clock,
});
const quorumClient = new CollectiveQuorumClientV1({
  scope,
  signing,
  resolver,
  repository,
  transport,
  clock,
  maximumAttempts: 3,
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
    const response = await handleCollectiveQuorumHttpRequestV1(
      quorumPeer,
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
  if (message?.kind !== "elect") return;
  try {
    const decision = await quorumClient.select(message.input);
    process.send?.({
      kind: "election",
      requestId: message.requestId,
      decision,
    });
  } catch (error) {
    process.send?.({
      kind: "election_error",
      requestId: message.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(port, "127.0.0.1", () =>
  process.send?.({ kind: "ready", peerId }),
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
