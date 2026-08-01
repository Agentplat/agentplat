import { createServer } from "node:http";
import { Readable } from "node:stream";

import {
  createStaticMeshKeyResolver,
  signMeshEnvelope,
  verifyMeshEnvelope,
} from "@agentplat/mesh-crypto";
import { createMeshDurableWorker } from "@agentplat/mesh/durability";
import {
  createMeshHttpClient,
  createMeshHttpHandler,
} from "@agentplat/mesh-http";
import {
  createPostgresPool,
  PostgresMeshDurableRepository,
} from "@agentplat/mesh-postgres";
import {
  MESH_PROTOCOL,
  MESH_SIGNATURE_ALGORITHM,
  MESH_WIRE_VERSION,
} from "@agentplat/mesh-protocol";

const tenantId = "tenant-demo";
const meshId = "mesh-demo";
const peerId = required("PEER_ID");
const instanceId = `${peerId}-process-1`;
const keyId = `${peerId}-key-1`;
const port = Number(required("PEER_PORT"));
const endpoints = JSON.parse(required("PEER_ENDPOINTS"));
const channelToken = required("CHANNEL_TOKEN");
const schema = required("MESH_SCHEMA");
const pool = createPostgresPool({
  max: 4,
});
const repository = new PostgresMeshDurableRepository(pool, { schema });
const scope = { tenantId, meshId, peerId, instanceId };
const privateKey = await crypto.subtle.importKey(
  "jwk",
  JSON.parse(required("PRIVATE_KEY_JWK")),
  MESH_SIGNATURE_ALGORITHM,
  false,
  ["sign"],
);
const publicJwks = JSON.parse(required("PUBLIC_KEY_JWKS"));
const keyRecords = await Promise.all(
  Object.entries(publicJwks).map(async ([subjectPeerId, jwk]) => ({
    tenantId,
    meshId,
    peerId: subjectPeerId,
    keyId: `${subjectPeerId}-key-1`,
    algorithm: MESH_SIGNATURE_ALGORITHM,
    publicKey: await crypto.subtle.importKey(
      "jwk",
      jwk,
      MESH_SIGNATURE_ALGORITHM,
      false,
      ["verify"],
    ),
    status: "active",
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: "2030-01-01T00:00:00.000Z",
  })),
);
const resolver = createStaticMeshKeyResolver(keyRecords);
const httpClient = createMeshHttpClient({
  allowedSchemes: ["http:"],
  timeoutMs: 2_000,
  resolveEndpoint: ({ peerId: targetPeerId }) => ({
    url: `${endpoints[targetPeerId]}/agentplat/mesh/v0/envelopes`,
    headers: { authorization: `Bearer ${channelToken}` },
  }),
  onDiagnostic: (diagnostic) =>
    process.stderr.write(
      `${peerId} http ${diagnostic.kind}:${diagnostic.code}\n`,
    ),
});

const worker = createMeshDurableWorker({
  repository,
  scope,
  workerId: `${peerId}-worker`,
  leaseDurationMs: 5_000,
  failureRetryAfterMs: 100,
  onDiagnostic: (diagnostic) =>
    process.stderr.write(
      `${peerId} worker ${diagnostic.kind}:${diagnostic.code ?? "none"}\n`,
    ),
  async processInbox({ inbox, snapshot }) {
    const verified = await verifyMeshEnvelope({
      envelope: inbox.envelope,
      resolver,
      policy: { allowedAlgorithms: [MESH_SIGNATURE_ALGORITHM] },
      verifiedAt: new Date().toISOString(),
    });
    if (!verified.verified) {
      return { outcome: "rejected", reasonCode: verified.code };
    }
    const payload = verified.envelope.payload;
    if (payload.type !== "peer.ping" && payload.type !== "peer.ping_ack") {
      return { outcome: "rejected", reasonCode: "unsupported_message_type" };
    }
    const current = snapshot?.state ?? { received: [], outboundSequence: 0 };
    const nextSequence =
      current.outboundSequence + (payload.type === "peer.ping" ? 1 : 0);
    const nextState = {
      received: [
        ...current.received,
        {
          messageId: verified.envelope.messageId,
          type: payload.type,
          ...(verified.envelope.causationId === undefined
            ? {}
            : { causationId: verified.envelope.causationId }),
        },
      ],
      outboundSequence: nextSequence,
    };
    const outbox = [];
    if (payload.type === "peer.ping") {
      const now = new Date();
      const acknowledgement = await signMeshEnvelope({
        envelope: {
          protocol: MESH_PROTOCOL,
          wireVersion: MESH_WIRE_VERSION,
          messageId: messageId(),
          tenantId,
          meshId,
          type: "peer.ping_ack",
          sender: { peerId, instanceId },
          audience: {
            kind: "peer",
            peerId: verified.envelope.sender.peerId,
          },
          sequence: nextSequence,
          sentAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + 30_000).toISOString(),
          causationId: verified.envelope.messageId,
          payload: { type: "peer.ping_ack" },
          proof: { algorithm: MESH_SIGNATURE_ALGORITHM, keyId },
        },
        privateKey,
      });
      outbox.push({
        effectId: `ack:${verified.envelope.messageId}`,
        envelope: acknowledgement,
      });
    }
    return {
      outcome: "applied",
      transitionId: `inbox:${verified.envelope.messageId}`,
      nextState,
      journal: [
        {
          entryId: `inbox:${verified.envelope.messageId}`,
          kind: "inbox.applied",
        },
      ],
      outbox,
    };
  },
  async deliverOutbox(outbox, signal) {
    const delivery = await httpClient.deliver({
      envelope: outbox.envelope,
      signal,
    });
    if (delivery.receipt.disposition === "accepted") {
      return { disposition: "delivered" };
    }
    if (delivery.receipt.disposition === "permanent_rejection") {
      return {
        disposition: "permanent_rejection",
        reasonCode: "remote_rejection",
      };
    }
    return {
      disposition: "retryable",
      retryAfterMs: delivery.receipt.retryAfterMs ?? 100,
      reasonCode: "remote_retryable",
    };
  },
});

const handler = createMeshHttpHandler({
  target: { ...scope },
  authenticate: (request) =>
    request.headers.get("authorization") === `Bearer ${channelToken}`,
  async accept(envelope) {
    const accepted = await repository.receive({ scope, envelope });
    return accepted.accepted
      ? { accepted: true, duplicate: accepted.duplicate }
      : accepted.code === "capacity_exceeded"
        ? { accepted: false, disposition: "retryable", retryAfterMs: 100 }
        : { accepted: false, disposition: "permanent_rejection" };
  },
});

const server = createServer(async (incoming, outgoing) => {
  try {
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (Array.isArray(value))
        for (const item of value) headers.append(name, item);
      else if (value !== undefined) headers.set(name, value);
    }
    const method = incoming.method ?? "GET";
    const request = new Request(
      `http://127.0.0.1:${port}${incoming.url ?? "/"}`,
      {
        method,
        headers,
        ...(method === "GET" || method === "HEAD"
          ? {}
          : { body: Readable.toWeb(incoming), duplex: "half" }),
      },
    );
    const response = await handler(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(500).end();
  }
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, "127.0.0.1", resolve);
});
process.send?.({ kind: "ready", peerId });

let stopped = false;
const paused = process.env.START_PAUSED === "1";
let notifiedAcknowledgement;
const loop = (async () => {
  while (!stopped) {
    if (paused) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      continue;
    }
    const result = await worker.runOnce();
    if (result.inbox.claimed === 0 && result.outbox.claimed === 0) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const snapshot = await repository.loadSnapshot(scope);
    const acknowledgement = snapshot?.state.received.find(
      (entry) => entry.type === "peer.ping_ack",
    );
    if (
      acknowledgement &&
      acknowledgement.messageId !== notifiedAcknowledgement
    ) {
      notifiedAcknowledgement = acknowledgement.messageId;
      process.send?.({ kind: "acknowledged", ...acknowledgement });
    }
  }
})();

process.on("message", async (command) => {
  if (command?.kind === "ping") {
    const now = new Date();
    const envelope = await signMeshEnvelope({
      envelope: {
        protocol: MESH_PROTOCOL,
        wireVersion: MESH_WIRE_VERSION,
        messageId: messageId(),
        tenantId,
        meshId,
        type: "peer.ping",
        sender: { peerId, instanceId },
        audience: { kind: "peer", peerId: command.peerId },
        sequence: 1,
        sentAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 30_000).toISOString(),
        payload: { type: "peer.ping" },
        proof: { algorithm: MESH_SIGNATURE_ALGORITHM, keyId },
      },
      privateKey,
    });
    await httpClient.deliver({ envelope });
    await httpClient.deliver({ envelope });
    process.send?.({ kind: "ping_sent", messageId: envelope.messageId });
  } else if (command?.kind === "state") {
    process.send?.({
      kind: "state",
      snapshot: await repository.loadSnapshot(scope),
    });
  } else if (command?.kind === "shutdown") {
    stopped = true;
    server.close();
    await loop;
    await pool.end();
    process.exit(0);
  }
});

function messageId() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString(
    "base64url",
  );
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new TypeError(`${name} is required`);
  return value;
}
