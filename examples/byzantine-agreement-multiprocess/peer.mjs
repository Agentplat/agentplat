import { createServer } from "node:http";
import { Pool } from "pg";
import { createStaticMeshKeyResolver } from "@agentplat/mesh-crypto";
import { MESH_SIGNATURE_ALGORITHM } from "@agentplat/mesh-protocol";
import {
  CollectiveAgreementClientV1,
  CollectiveAgreementHttpTransportV1,
  CollectiveAgreementPeerV1,
  createCollectiveAgreementValueV1,
  handleCollectiveAgreementHttpRequestV1,
} from "@agentplat/collective-quorum/agreement";
import { PostgresCollectiveAgreementRepositoryV1 } from "@agentplat/collective-quorum-postgres/agreement";

const peerId = process.argv[2];
if (!peerId || !process.send) throw new Error("peer id and IPC are required");

let pair;
let privateJwk;
let agreementPeer;
let client;
let repository;
let pool;
let behavior = "honest";

const server = createServer(async (incoming, outgoing) => {
  if (!agreementPeer || behavior === "unavailable") {
    outgoing.writeHead(503).end();
    return;
  }
  try {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of incoming) {
      bytes += chunk.length;
      if (bytes > 1_048_576) {
        outgoing.writeHead(413).end();
        return;
      }
      chunks.push(chunk);
    }
    const request = new Request(
      `http://127.0.0.1:${server.address().port}${incoming.url}`,
      {
        method: incoming.method,
        headers: incoming.headers,
        body:
          incoming.method === "GET" || incoming.method === "HEAD"
            ? undefined
            : Buffer.concat(chunks),
      },
    );
    const response = await handleCollectiveAgreementHttpRequestV1(
      agreementPeer,
      request,
    );
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(500).end();
  }
});

server.listen(0, "127.0.0.1", () => {
  process.send({ type: "awaiting_bootstrap", peerId });
});

process.on("message", async (message) => {
  try {
    if (message.type === "bootstrap") {
      if (message.privateJwk) {
        privateJwk = message.privateJwk;
        pair = {
          privateKey: await crypto.subtle.importKey(
            "jwk",
            privateJwk,
            MESH_SIGNATURE_ALGORITHM,
            true,
            ["sign"],
          ),
          publicKey: await crypto.subtle.importKey(
            "jwk",
            message.publicJwk,
            MESH_SIGNATURE_ALGORITHM,
            true,
            ["verify"],
          ),
        };
      } else {
        pair = await crypto.subtle.generateKey(MESH_SIGNATURE_ALGORITHM, true, [
          "sign",
          "verify",
        ]);
        privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
      }
      process.send({
        type: "booted",
        peerId,
        endpoint: `http://127.0.0.1:${server.address().port}/agreement`,
        publicJwk: await crypto.subtle.exportKey("jwk", pair.publicKey),
        privateJwk,
      });
      return;
    }
    if (message.type === "configure") {
      behavior = message.behavior;
      const records = await Promise.all(
        message.identities.map(async (identity) => ({
          tenantId: "tenant.demo",
          meshId: "mesh.demo",
          peerId: identity.peerId,
          keyId: `key.${identity.peerId}`,
          algorithm: MESH_SIGNATURE_ALGORITHM,
          publicKey: await crypto.subtle.importKey(
            "jwk",
            identity.publicJwk,
            MESH_SIGNATURE_ALGORITHM,
            true,
            ["verify"],
          ),
          validFrom: "2029-01-01T00:00:00.000Z",
          validUntil: "2031-01-01T00:00:00.000Z",
          status: "active",
        })),
      );
      const resolver = createStaticMeshKeyResolver(records);
      const membershipPort = {
        current: async () => message.membership,
        resolve: async (input) =>
          input.epoch === message.membership.epoch &&
          input.configurationDigest === message.membership.configurationDigest
            ? message.membership
            : null,
      };
      pool = new Pool({ connectionString: message.databaseUrl });
      repository = new PostgresCollectiveAgreementRepositoryV1(pool, {
        schema: message.schema,
        tenantId: "tenant.demo",
        meshId: "mesh.demo",
        peerId,
      });
      const scope = {
        tenantId: "tenant.demo",
        meshId: "mesh.demo",
        peerId,
        instanceId: `instance.${peerId}`,
      };
      const signing = {
        privateKey: pair.privateKey,
        keyId: `key.${peerId}`,
        algorithm: MESH_SIGNATURE_ALGORITHM,
      };
      const clock = {
        now: () => ({
          wallTime: "2030-01-01T00:00:00.000Z",
          logicalTimeMs: 100,
        }),
      };
      agreementPeer = new CollectiveAgreementPeerV1({
        scope,
        signing,
        resolver,
        membership: membershipPort,
        repository,
        semantics: {
          evaluate: async () => ({ accepted: true, reasonCode: "accepted" }),
        },
        clock,
      });
      client = new CollectiveAgreementClientV1({
        scope,
        signing,
        resolver,
        membership: membershipPort,
        repository,
        transport: new CollectiveAgreementHttpTransportV1({
          endpointForPeer: (targetPeerId) => message.endpoints[targetPeerId],
        }),
        clock,
        requestTimeoutMs: 1_000,
      });
      process.send({ type: "configured", peerId });
      return;
    }
    if (message.type === "decide") {
      const value = await createCollectiveAgreementValueV1(message.value);
      const certificate = await client.decide({
        membership: message.membership,
        policyDomainId: "policy.demo",
        slotId: "planning.slot.demo",
        height: 1,
        round: 0,
        value,
        logicalTimeMs: 100,
      });
      process.send({
        type: "decided",
        peerId,
        certificate,
      });
      return;
    }
    if (message.type === "inspect") {
      const state = await repository.readState({
        policyDomainId: "policy.demo",
        slotId: "planning.slot.demo",
        height: 1,
      });
      const commit = await repository.getCommit({
        policyDomainId: "policy.demo",
        slotId: "planning.slot.demo",
        height: 1,
      });
      process.send({
        type: "inspected",
        peerId,
        state,
        commitDigest: commit?.certificateDigest ?? null,
      });
      return;
    }
    if (message.type === "shutdown") await shutdown();
  } catch (error) {
    process.send({
      type: "failed",
      peerId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

async function shutdown() {
  await pool?.end().catch(() => undefined);
  server.close(() => process.exit(0));
}

process.on("SIGTERM", () => void shutdown());
