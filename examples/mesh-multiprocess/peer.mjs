import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";

import {
  createStaticMeshKeyResolver,
  createWebCryptoMeshEnvelopeSigner,
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
  MESH_PREVIOUS_WIRE_VERSION,
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
const targetWireVersions = JSON.parse(required("TARGET_WIRE_VERSIONS"));
const currentSigner = createWebCryptoMeshEnvelopeSigner();
const compatibilitySigner = createWebCryptoMeshEnvelopeSigner({
  signingPolicy: { allowedWireVersions: [MESH_PREVIOUS_WIRE_VERSION] },
});
const channelToken = required("CHANNEL_TOKEN");
const schema = required("MESH_SCHEMA");
const soakSeed = process.env.MESH_SOAK_SEED ?? "agentplat-beta1-soak";
const processEpoch = Number(process.env.PROCESS_EPOCH ?? "1");
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
  resolveEndpoint: ({ peerId: targetPeerId }) => {
    const wireVersion = wireVersionFor(targetPeerId);
    return {
      url: `${endpoints[targetPeerId]}/agentplat/mesh/v${wireVersion}/envelopes`,
      ...(wireVersion === MESH_PREVIOUS_WIRE_VERSION ? { wireVersion } : {}),
      headers: { authorization: `Bearer ${channelToken}` },
    };
  },
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
          senderPeerId: verified.envelope.sender.peerId,
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
      const wireVersion = wireVersionFor(verified.envelope.sender.peerId);
      const acknowledgement = await signerFor(wireVersion).sign({
        envelope: {
          protocol: MESH_PROTOCOL,
          wireVersion,
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

let delayedReceiptMs = 0;
let delayedIngressMs = 0;
let overloadNextReceipt = false;
const accept = async (envelope) => {
  if (overloadNextReceipt) {
    overloadNextReceipt = false;
    return { accepted: false, disposition: "retryable", retryAfterMs: 25 };
  }
  const ingressDelay = delayedIngressMs;
  delayedIngressMs = 0;
  if (ingressDelay > 0) {
    process.send?.({ kind: "ingress_delayed", messageId: envelope.messageId });
    await new Promise((resolve) => setTimeout(resolve, ingressDelay));
  }
  const accepted = await repository.receive({ scope, envelope });
  const delay = delayedReceiptMs;
  delayedReceiptMs = 0;
  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return accepted.accepted
    ? { accepted: true, duplicate: accepted.duplicate }
    : accepted.code === "capacity_exceeded"
      ? { accepted: false, disposition: "retryable", retryAfterMs: 100 }
      : { accepted: false, disposition: "permanent_rejection" };
};
const currentHandler = createMeshHttpHandler({
  target: { ...scope },
  authenticate: (request) =>
    request.headers.get("authorization") === `Bearer ${channelToken}`,
  accept,
});
const compatibilityHandler = createMeshHttpHandler({
  target: { ...scope },
  wireVersion: MESH_PREVIOUS_WIRE_VERSION,
  authenticate: (request) =>
    request.headers.get("authorization") === `Bearer ${channelToken}`,
  accept,
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
    const response = await (
      requestUrlPath(request) === "/agentplat/mesh/v0/envelopes"
        ? compatibilityHandler
        : currentHandler
    )(request);
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
const existingSnapshot = await repository.loadSnapshot(scope);
const notifiedAcknowledgements = new Set(
  existingSnapshot?.state.received
    .filter((entry) => entry.type === "peer.ping_ack")
    .map((entry) => entry.messageId) ?? [],
);
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
    const acknowledgements =
      snapshot?.state.received.filter(
        (entry) =>
          entry.type === "peer.ping_ack" &&
          !notifiedAcknowledgements.has(entry.messageId),
      ) ?? [];
    for (const acknowledgement of acknowledgements) {
      notifiedAcknowledgements.add(acknowledgement.messageId);
      process.send?.({ kind: "acknowledged", ...acknowledgement });
    }
  }
})();

process.on("message", async (command) => {
  if (command?.kind === "ping") {
    const now = new Date();
    const wireVersion = wireVersionFor(command.peerId);
    const envelope = await signerFor(wireVersion).sign({
      envelope: {
        protocol: MESH_PROTOCOL,
        wireVersion,
        messageId: messageId(),
        tenantId,
        meshId,
        type: "peer.ping",
        sender: { peerId, instanceId },
        audience: { kind: "peer", peerId: command.peerId },
        sequence: nextLocalSequence(),
        sentAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 30_000).toISOString(),
        payload: { type: "peer.ping" },
        proof: { algorithm: MESH_SIGNATURE_ALGORITHM, keyId },
      },
      privateKey,
    });
    const attempts = command.attempts ?? 2;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      await httpClient.deliver({ envelope });
    }
    process.send?.({ kind: "ping_sent", messageId: envelope.messageId });
  } else if (command?.kind === "delay_next_receipt") {
    delayedReceiptMs = command.delayMs;
    process.send?.({ kind: "fault_armed", fault: command.kind });
  } else if (command?.kind === "delay_next_ingress") {
    delayedIngressMs = command.delayMs;
    process.send?.({ kind: "fault_armed", fault: command.kind });
  } else if (command?.kind === "overload_next_receipt") {
    overloadNextReceipt = true;
    process.send?.({ kind: "fault_armed", fault: command.kind });
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

let localSequence = 0;

function nextLocalSequence() {
  localSequence += 1;
  return localSequence;
}

function messageId() {
  const sequence = nextLocalSequence();
  return createHash("sha256")
    .update(`${soakSeed}:${peerId}:${processEpoch}:${sequence}`)
    .digest()
    .subarray(0, 16)
    .toString("base64url");
}

function wireVersionFor(targetPeerId) {
  const value = targetWireVersions[targetPeerId];
  if (value !== MESH_PREVIOUS_WIRE_VERSION && value !== MESH_WIRE_VERSION) {
    throw new TypeError(`No compatible wire version for ${targetPeerId}`);
  }
  return value;
}

function signerFor(wireVersion) {
  return wireVersion === MESH_PREVIOUS_WIRE_VERSION
    ? compatibilitySigner
    : currentSigner;
}

function requestUrlPath(request) {
  try {
    return new URL(request.url).pathname;
  } catch {
    return "";
  }
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new TypeError(`${name} is required`);
  return value;
}
