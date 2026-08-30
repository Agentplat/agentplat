import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";

import {
  createStaticMeshKeyResolver,
  createHttpMeshExternalSignaturePortV1,
  createWebCryptoMeshEnvelopeSigner,
  signMeshEnvelopeExternally,
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
  canonicalizeMeshPayload,
  MESH_PREVIOUS_WIRE_VERSION,
  MESH_PROTOCOL,
  MESH_SIGNATURE_ALGORITHM,
  MESH_WIRE_VERSION,
  validateSignedMeshEnvelope,
} from "@agentplat/mesh-protocol";
import {
  normalizeMeshEvidenceAttestationV1,
  normalizeMeshEvidenceClaimV1,
} from "@agentplat/trust/mesh-records";

const tenantId = process.env.MESH_TENANT_ID ?? "tenant-demo";
const meshId = process.env.MESH_ID ?? "mesh-demo";
const peerId = required("PEER_ID");
const instanceId = process.env.INSTANCE_ID ?? `${peerId}-process-1`;
const keyId = process.env.KEY_ID ?? `${peerId}-key-1`;
const port = Number(required("PEER_PORT"));
const listenHost = process.env.MESH_LISTEN_HOST ?? "127.0.0.1";
const controlToken = process.env.MESH_CONTROL_TOKEN;
const externalSignerEndpoint = process.env.MESH_EXTERNAL_SIGNER_ENDPOINT;
const endpoints = JSON.parse(required("PEER_ENDPOINTS"));
const targetWireVersions = JSON.parse(required("TARGET_WIRE_VERSIONS"));
const localCurrentSigner = createWebCryptoMeshEnvelopeSigner();
const localCompatibilitySigner = createWebCryptoMeshEnvelopeSigner({
  signingPolicy: { allowedWireVersions: [MESH_PREVIOUS_WIRE_VERSION] },
});
const channelToken = required("CHANNEL_TOKEN");
const schema = required("MESH_SCHEMA");
const soakSeed = process.env.MESH_SOAK_SEED ?? "agentplat-beta1-soak";
const processEpoch = Number(process.env.PROCESS_EPOCH ?? "1");
let controlSequence = 0;
const controlEvents = [];
const emit = (event) => {
  process.send?.(event);
  controlSequence += 1;
  controlEvents.push({ sequence: controlSequence, recordedAt: new Date().toISOString(), ...event });
  if (controlEvents.length > 4_096) controlEvents.shift();
};
const pool = createPostgresPool({
  max: 4,
});
const repository = new PostgresMeshDurableRepository(pool, { schema });
const scope = { tenantId, meshId, peerId, instanceId };
const privateKey = externalSignerEndpoint
  ? null
  : await crypto.subtle.importKey(
      "jwk",
      JSON.parse(required("PRIVATE_KEY_JWK")),
      MESH_SIGNATURE_ALGORITHM,
      false,
      ["sign"],
    );
const externalSignaturePort = externalSignerEndpoint
  ? createHttpMeshExternalSignaturePortV1({
      endpoint: externalSignerEndpoint,
      expectedKeyId: keyId,
      ...(process.env.MESH_SIGNER_TOKEN_FILE
        ? {
            authorizationHeader: async () => {
              const token = (await readFile(process.env.MESH_SIGNER_TOKEN_FILE, "utf8")).trim();
              if (!token) throw new TypeError("projected Mesh signer token is empty");
              return `Bearer ${token}`;
            },
          }
        : {}),
    })
  : null;
const publicBindings = process.env.PUBLIC_KEY_BINDINGS
  ? JSON.parse(process.env.PUBLIC_KEY_BINDINGS)
  : Object.fromEntries(
      Object.entries(JSON.parse(required("PUBLIC_KEY_JWKS"))).map(([id, jwk]) => [
        id,
        { keyId: `${id}-key-1`, jwk },
      ]),
    );
const keyRecords = await Promise.all(
  Object.entries(publicBindings).map(async ([subjectPeerId, binding]) => ({
    tenantId,
    meshId,
    peerId: subjectPeerId,
    keyId: binding.keyId,
    algorithm: MESH_SIGNATURE_ALGORITHM,
    publicKey: await crypto.subtle.importKey(
      "jwk",
      binding.jwk,
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
    if (
      payload.type !== "peer.ping" &&
      payload.type !== "peer.ping_ack" &&
      payload.type !== "evidence.claim" &&
      payload.type !== "evidence.attest"
    ) {
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
          ...(payload.type === "evidence.claim"
            ? {
                recordId: payload.claimId,
                assertionDigest: payload.assertionDigest,
                contentDigest: payload.content?.contentDigest ?? null,
              }
            : {}),
          ...(payload.type === "evidence.attest"
            ? {
                recordId: payload.attestationId,
                claimId: payload.claimId,
                claimDigest: payload.claimDigest,
                disposition: payload.disposition,
              }
            : {}),
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
    emit({ kind: "ingress_delayed", messageId: envelope.messageId });
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
    const pathname = requestUrlPath(request);
    let response;
    if (pathname === "/healthz" && method === "GET") {
      response = Response.json({
        status: "ready",
        tenantId,
        meshId,
        peerId,
        instanceId,
        processEpoch,
        controlEnabled: controlToken !== undefined,
        signingCustody: externalSignaturePort ? "external-https" : "process-local",
      });
    } else if (pathname === "/agentplat/staging/v1/events" && method === "GET") {
      if (!authorizedControl(request)) response = new Response(null, { status: 404 });
      else {
        const after = Number(new URL(request.url).searchParams.get("after") ?? "0");
        if (!Number.isSafeInteger(after) || after < 0)
          response = Response.json({ error: "invalid_cursor" }, { status: 400 });
        else response = Response.json({
          peerId,
          instanceId,
          latestSequence: controlSequence,
          events: controlEvents.filter(({ sequence }) => sequence > after),
        });
      }
    } else if (pathname === "/agentplat/staging/v1/commands" && method === "POST") {
      if (!authorizedControl(request)) response = new Response(null, { status: 404 });
      else {
        const bytes = Buffer.from(await request.arrayBuffer());
        if (bytes.byteLength > 65_536)
          response = Response.json({ error: "command_oversized" }, { status: 413 });
        else {
          let command;
          try { command = JSON.parse(bytes.toString("utf8")); }
          catch { command = null; }
          if (!command || typeof command !== "object")
            response = Response.json({ error: "command_invalid" }, { status: 400 });
          else {
            await handleCommand(command);
            response = Response.json({ accepted: true, peerId, latestSequence: controlSequence }, { status: 202 });
          }
        }
      }
    } else {
      response = await (
        pathname === "/agentplat/mesh/v0/envelopes"
          ? compatibilityHandler
          : currentHandler
      )(request);
    }
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(500).end();
  }
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, listenHost, resolve);
});
emit({ kind: "ready", peerId });

let stopped = false;
let paused = process.env.START_PAUSED === "1";
const existingSnapshot = await repository.loadSnapshot(scope);
const notifiedAcknowledgements = new Set(
  existingSnapshot?.state.received
    .filter((entry) => entry.type === "peer.ping_ack")
    .map((entry) => entry.messageId) ?? [],
);
const notifiedEvidence = new Set(
  existingSnapshot?.state.received
    .filter((entry) => entry.type.startsWith("evidence."))
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
      emit({ kind: "acknowledged", ...acknowledgement });
    }
    const evidenceRecords =
      snapshot?.state.received.filter(
        (entry) =>
          entry.type.startsWith("evidence.") &&
          !notifiedEvidence.has(entry.messageId),
      ) ?? [];
    for (const evidence of evidenceRecords) {
      notifiedEvidence.add(evidence.messageId);
      emit({ kind: "evidence_applied", ...evidence });
    }
  }
})();

process.on("message", (command) => {
  handleCommand(command).catch((error) => {
    emit({ kind: "command_failed", code: error?.message ?? "unknown" });
  });
});

async function handleCommand(command) {
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
    emit({ kind: "ping_sent", messageId: envelope.messageId });
  } else if (command?.kind === "evidence") {
    const now = new Date();
    const wireVersion = wireVersionFor(command.peerId);
    const evidenceEnvelope = {
      schemaVersion: 1,
      tenantId,
      meshId,
      objectiveId: null,
      senderPeerId: peerId,
      causationId: command.causationId ?? null,
    };
    const normalized =
      command.payload.type === "evidence.claim"
        ? normalizeMeshEvidenceClaimV1(evidenceEnvelope, {
            subject: command.payload.subject,
            scope: command.payload.scope,
            criterionId: command.payload.criterionId,
            outcome: command.payload.outcome,
            content: command.payload.content,
            basisReferences: command.payload.basisReferences,
            observedAt: command.payload.observedAt,
          })
        : normalizeMeshEvidenceAttestationV1(evidenceEnvelope, {
            scope: command.payload.scope,
            claimId: command.payload.claimId,
            claimDigest: command.payload.claimDigest,
            disposition: command.payload.disposition,
            confidenceBasisPoints: command.payload.confidenceBasisPoints,
            basisReferences: command.payload.basisReferences,
            observedAt: command.payload.observedAt,
          });
    const payload =
      command.payload.type === "evidence.claim"
        ? {
            ...command.payload,
            claimId: normalized.claimId,
            assertionDigest: normalized.assertionDigest,
          }
        : { ...command.payload, attestationId: normalized.attestationId };
    const payloadValidation = canonicalizeMeshPayload(payload);
    if (!payloadValidation.ok)
      throw new TypeError(
        `invalid evidence payload: ${JSON.stringify(payloadValidation.issues)}`,
      );
    const unsignedEnvelope = {
        protocol: MESH_PROTOCOL,
        wireVersion,
        messageId: messageId(),
        tenantId,
        meshId,
        type: payload.type,
        sender: { peerId, instanceId },
        audience: { kind: "peer", peerId: command.peerId },
        sequence: nextLocalSequence(),
        sentAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 30_000).toISOString(),
        ...(command.causationId ? { causationId: command.causationId } : {}),
        payload,
        proof: { algorithm: MESH_SIGNATURE_ALGORITHM, keyId },
      };
    const envelopeValidation = validateSignedMeshEnvelope({
      ...unsignedEnvelope,
      payloadHash: `sha256:${"A".repeat(43)}`,
      proof: { ...unsignedEnvelope.proof, value: "A".repeat(86) },
    });
    if (!envelopeValidation.ok)
      throw new TypeError(
        `invalid evidence envelope: ${JSON.stringify(envelopeValidation.issues)}`,
      );
    const envelope = await signerFor(wireVersion).sign({
      envelope: unsignedEnvelope,
      privateKey,
    });
    const attempts = command.attempts ?? 2;
    for (let attempt = 0; attempt < attempts; attempt += 1)
      await httpClient.deliver({ envelope });
    emit({
      kind: "evidence_sent",
      messageId: envelope.messageId,
      payloadHash: envelope.payloadHash,
      recordDigest:
        payload.type === "evidence.claim"
          ? normalized.claimId.slice("claim:".length)
          : normalized.attestationId.slice("attestation:".length),
      recordId:
        payload.type === "evidence.claim"
          ? payload.claimId
          : payload.attestationId,
    });
  } else if (command?.kind === "delay_next_receipt") {
    delayedReceiptMs = command.delayMs;
    emit({ kind: "fault_armed", fault: command.kind });
  } else if (command?.kind === "delay_next_ingress") {
    delayedIngressMs = command.delayMs;
    emit({ kind: "fault_armed", fault: command.kind });
  } else if (command?.kind === "overload_next_receipt") {
    overloadNextReceipt = true;
    emit({ kind: "fault_armed", fault: command.kind });
  } else if (command?.kind === "state") {
    emit({
      kind: "state",
      snapshot: await repository.loadSnapshot(scope),
    });
  } else if (command?.kind === "resume") {
    paused = false;
    emit({ kind: "resumed", peerId });
  } else if (command?.kind === "shutdown") {
    stopped = true;
    server.close();
    await loop;
    await pool.end();
    process.exit(0);
  } else {
    throw new TypeError("unsupported_mesh_control_command");
  }
}

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
  if (externalSignaturePort) {
    const signingPolicy = {
      allowedWireVersions: [wireVersion],
    };
    return {
      sign(request) {
        return signMeshEnvelopeExternally(
          { envelope: request.envelope, signaturePort: externalSignaturePort },
          signingPolicy,
        );
      },
    };
  }
  return wireVersion === MESH_PREVIOUS_WIRE_VERSION
    ? localCompatibilitySigner
    : localCurrentSigner;
}

function requestUrlPath(request) {
  try {
    return new URL(request.url).pathname;
  } catch {
    return "";
  }
}

function authorizedControl(request) {
  return controlToken !== undefined &&
    request.headers.get("authorization") === `Bearer ${controlToken}`;
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new TypeError(`${name} is required`);
  return value;
}
