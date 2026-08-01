import assert from "node:assert/strict";
import test from "node:test";
import {
  MESH_PREVIOUS_WIRE_VERSION,
  MESH_PROTOCOL,
  MESH_SIGNATURE_ALGORITHM,
  MESH_WIRE_VERSION,
  canonicalizeMeshJsonBytes,
} from "@agentplat/mesh-protocol";
import { createWebCryptoMeshEnvelopeSigner } from "@agentplat/mesh-crypto";
import {
  DEFAULT_MESH_HTTP_PATH,
  MESH_HTTP_V0_PATH,
  MESH_HTTP_V1_PATH,
  createMeshHttpClient,
  createMeshHttpHandler,
} from "@agentplat/mesh-http";

async function envelope(overrides = {}) {
  const keys = await crypto.subtle.generateKey(MESH_SIGNATURE_ALGORITHM, true, [
    "sign",
    "verify",
  ]);
  const wireVersion = overrides.wireVersion ?? MESH_WIRE_VERSION;
  const signer = createWebCryptoMeshEnvelopeSigner({
    signingPolicy: { allowedWireVersions: [wireVersion] },
  });
  return signer.sign({
    envelope: {
      protocol: MESH_PROTOCOL,
      wireVersion,
      messageId: "AAAAAAAAAAAAAAAAAAAAAQ",
      tenantId: "tenant-a",
      meshId: "mesh-a",
      type: "peer.ping",
      sender: { peerId: "peer-a", instanceId: "peer-a-1" },
      audience: { kind: "peer", peerId: "peer-b" },
      sequence: 1,
      sentAt: "2026-08-01T00:00:00.000Z",
      expiresAt: "2026-08-01T00:00:30.000Z",
      payload: { type: "peer.ping" },
      proof: { algorithm: MESH_SIGNATURE_ALGORITHM, keyId: "key-a" },
      ...overrides,
    },
    privateKey: keys.privateKey,
  });
}

const target = {
  tenantId: "tenant-a",
  meshId: "mesh-a",
  peerId: "peer-b",
  instanceId: "peer-b-1",
};

test("HTTP paths bind exact wire versions and v0 is explicit", async () => {
  assert.equal(DEFAULT_MESH_HTTP_PATH, MESH_HTTP_V1_PATH);
  const v0 = await envelope({ wireVersion: MESH_PREVIOUS_WIRE_VERSION });
  const bytes = canonicalizeMeshJsonBytes(v0).value;
  let accepted = 0;
  const current = createMeshHttpHandler({
    target,
    accept: async () => ({ accepted: true }),
  });
  assert.equal(
    (
      await current(
        new Request(`https://peer-b.example${MESH_HTTP_V1_PATH}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: bytes,
        }),
      )
    ).status,
    400,
  );

  const compatibility = createMeshHttpHandler({
    target,
    wireVersion: MESH_PREVIOUS_WIRE_VERSION,
    accept: async () => {
      accepted += 1;
      return { accepted: true };
    },
  });
  assert.equal(
    (
      await compatibility(
        new Request(`https://peer-b.example${MESH_HTTP_V0_PATH}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: bytes,
        }),
      )
    ).status,
    202,
  );
  assert.equal(accepted, 1);
  assert.throws(
    () =>
      createMeshHttpHandler({
        target,
        path: MESH_HTTP_V0_PATH,
        accept: async () => ({ accepted: true }),
      }),
    /path and wire version do not match/u,
  );

  let attempts = 0;
  const incompatibleClient = createMeshHttpClient({
    resolveEndpoint: () => ({
      url: `https://peer-b.example${MESH_HTTP_V0_PATH}`,
    }),
    fetch: async () => {
      attempts += 1;
      return new Response(null, { status: 500 });
    },
  });
  assert.equal(
    (await incompatibleClient.deliver({ envelope: v0 })).receipt.disposition,
    "permanent_rejection",
  );
  assert.equal(attempts, 0);

  const compatibilityClient = createMeshHttpClient({
    resolveEndpoint: () => ({
      url: `https://peer-b.example${MESH_HTTP_V0_PATH}`,
      wireVersion: MESH_PREVIOUS_WIRE_VERSION,
    }),
    fetch: async () => {
      attempts += 1;
      return Response.json(
        {
          schemaVersion: 1,
          disposition: "accepted",
          messageId: v0.messageId,
        },
        { status: 202 },
      );
    },
  });
  assert.equal(
    (await compatibilityClient.deliver({ envelope: v0 })).receipt.disposition,
    "accepted",
  );
  assert.equal(attempts, 1);
});

test("HTTP handler durably accepts strict envelopes and coarsens duplicates", async () => {
  const signed = await envelope();
  let calls = 0;
  const handler = createMeshHttpHandler({
    target,
    authenticate: (request) =>
      request.headers.get("authorization") === "Bearer test",
    accept: async () => ({ accepted: true, duplicate: calls++ > 0 }),
  });
  const bytes = canonicalizeMeshJsonBytes(signed);
  assert.equal(bytes.ok, true);
  const request = () =>
    new Request(`https://peer-b.example${DEFAULT_MESH_HTTP_PATH}`, {
      method: "POST",
      headers: {
        authorization: "Bearer test",
        "content-type": "application/json",
      },
      body: bytes.value,
    });
  const first = await handler(request());
  const duplicate = await handler(request());
  assert.equal(first.status, 202);
  assert.equal(duplicate.status, 202);
  assert.deepEqual(await first.json(), await duplicate.json());
  assert.equal(calls, 2);
});

test("HTTP handler rejects auth, route, media, size, malformed and cross-scope input before accept", async () => {
  const signed = await envelope();
  const bytes = canonicalizeMeshJsonBytes(signed).value;
  let calls = 0;
  const handler = createMeshHttpHandler({
    target,
    maximumBodyBytes: bytes.byteLength + 128,
    authenticate: (request) => request.headers.get("x-channel") === "ok",
    accept: async () => {
      calls += 1;
      return { accepted: true };
    },
  });
  const send = (body, init = {}) =>
    handler(
      new Request(
        `https://peer-b.example${init.path ?? DEFAULT_MESH_HTTP_PATH}`,
        {
          method: init.method ?? "POST",
          headers: {
            "content-type": init.contentType ?? "application/json",
            "x-channel": init.channel ?? "ok",
            ...(init.headers ?? {}),
          },
          body,
        },
      ),
    );
  assert.equal((await send(bytes, { channel: "bad" })).status, 401);
  assert.equal((await send(bytes, { path: "/wrong" })).status, 405);
  assert.equal((await send(bytes, { contentType: "text/plain" })).status, 415);
  assert.equal(
    (await send(new Uint8Array(bytes.byteLength + 129))).status,
    413,
  );
  assert.equal((await send(new TextEncoder().encode('{"bad":'))).status, 400);
  const otherScope = canonicalizeMeshJsonBytes(
    await envelope({ tenantId: "tenant-other" }),
  ).value;
  assert.equal((await send(otherScope)).status, 422);
  assert.equal(calls, 0);
});

test("HTTP handler cancels an over-limit request stream", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(32));
    },
    cancel() {
      cancelled = true;
    },
  });
  const handler = createMeshHttpHandler({
    target,
    maximumBodyBytes: 16,
    accept: async () => ({ accepted: true }),
  });
  const response = await handler(
    new Request(`https://peer-b.example${DEFAULT_MESH_HTTP_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stream,
      duplex: "half",
    }),
  );
  assert.equal(response.status, 413);
  assert.equal(cancelled, true);
});

test("HTTP handler never returns accepted when durable intake fails", async () => {
  const signed = await envelope();
  const bytes = canonicalizeMeshJsonBytes(signed).value;
  const handler = createMeshHttpHandler({
    target,
    accept: async () => {
      throw new Error("database unavailable");
    },
  });
  const response = await handler(
    new Request(`https://peer-b.example${DEFAULT_MESH_HTTP_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: bytes,
    }),
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    schemaVersion: 1,
    disposition: "retryable",
    messageId: signed.messageId,
  });
});

test("HTTP handler enables preflight only through an explicit bounded CORS policy", async () => {
  let authenticated = 0;
  const handler = createMeshHttpHandler({
    target,
    cors: {
      allowedOrigins: ["https://console.example"],
      allowedRequestHeaders: ["authorization", "content-type"],
      maxAgeSeconds: 300,
    },
    authenticate: () => {
      authenticated += 1;
      return true;
    },
    accept: async () => ({ accepted: true }),
  });
  const preflight = await handler(
    new Request(`https://peer-b.example${DEFAULT_MESH_HTTP_PATH}`, {
      method: "OPTIONS",
      headers: {
        origin: "https://console.example",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization, content-type",
      },
    }),
  );
  assert.equal(preflight.status, 204);
  assert.equal(
    preflight.headers.get("access-control-allow-origin"),
    "https://console.example",
  );
  assert.equal(preflight.headers.get("access-control-max-age"), "300");
  assert.equal(authenticated, 0);

  const signed = await envelope();
  const accepted = await handler(
    new Request(`https://peer-b.example${DEFAULT_MESH_HTTP_PATH}`, {
      method: "POST",
      headers: {
        origin: "https://console.example",
        "content-type": "application/json",
      },
      body: canonicalizeMeshJsonBytes(signed).value,
    }),
  );
  assert.equal(accepted.status, 202);
  assert.equal(
    accepted.headers.get("access-control-allow-origin"),
    "https://console.example",
  );
  assert.equal(authenticated, 1);

  const denied = await handler(
    new Request(`https://peer-b.example${DEFAULT_MESH_HTTP_PATH}`, {
      method: "OPTIONS",
      headers: {
        origin: "https://untrusted.example",
        "access-control-request-method": "POST",
      },
    }),
  );
  assert.equal(denied.status, 403);

  const defaultHandler = createMeshHttpHandler({
    target,
    accept: async () => ({ accepted: true }),
  });
  assert.equal(
    (
      await defaultHandler(
        new Request(`https://peer-b.example${DEFAULT_MESH_HTTP_PATH}`, {
          method: "OPTIONS",
          headers: {
            origin: "https://console.example",
            "access-control-request-method": "POST",
          },
        }),
      )
    ).status,
    405,
  );

  assert.throws(
    () =>
      createMeshHttpHandler({
        target,
        cors: { allowedOrigins: ["*"] },
        accept: async () => ({ accepted: true }),
      }),
    /CORS origin is invalid/u,
  );
});

test("HTTP client uses one canonical attempt, disables redirects and validates receipts", async () => {
  const signed = await envelope();
  let attempts = 0;
  let captured;
  const client = createMeshHttpClient({
    allowedSchemes: ["https:"],
    resolveEndpoint: (resolvedTarget) => {
      assert.deepEqual(resolvedTarget, {
        tenantId: "tenant-a",
        meshId: "mesh-a",
        peerId: "peer-b",
      });
      return {
        url: "https://peer-b.example/mesh",
        headers: { authorization: "Bearer test" },
      };
    },
    fetch: async (url, init) => {
      attempts += 1;
      captured = { url: String(url), init };
      return Response.json(
        {
          schemaVersion: 1,
          disposition: "accepted",
          messageId: signed.messageId,
        },
        { status: 202 },
      );
    },
  });
  const result = await client.deliver({ envelope: signed });
  assert.equal(result.receipt.disposition, "accepted");
  assert.equal(attempts, 1);
  assert.equal(captured.url, "https://peer-b.example/mesh");
  assert.equal(captured.init.redirect, "manual");
  assert.equal(captured.init.headers.get("authorization"), "Bearer test");
  assert.deepEqual(
    new Uint8Array(captured.init.body),
    canonicalizeMeshJsonBytes(signed).value,
  );
});

test("HTTP client rejects unsafe endpoints, redirects, topic ambiguity and bounded response failures", async () => {
  const signed = await envelope();
  const unsafe = createMeshHttpClient({
    resolveEndpoint: () => ({ url: "https://user:secret@peer-b.example/mesh" }),
    fetch: async () => {
      throw new Error("must not fetch");
    },
  });
  assert.equal(
    (await unsafe.deliver({ envelope: signed })).receipt.disposition,
    "permanent_rejection",
  );

  const redirect = createMeshHttpClient({
    resolveEndpoint: () => ({ url: "https://peer-b.example/mesh" }),
    fetch: async () => new Response(null, { status: 307 }),
  });
  assert.equal(
    (await redirect.deliver({ envelope: signed })).receipt.disposition,
    "permanent_rejection",
  );

  const oversized = createMeshHttpClient({
    maximumResponseBytes: 8,
    resolveEndpoint: () => ({ url: "https://peer-b.example/mesh" }),
    fetch: async () =>
      new Response('{"schemaVersion":1,"disposition":"accepted"}', {
        status: 202,
        headers: { "content-type": "application/json" },
      }),
  });
  assert.equal(
    (await oversized.deliver({ envelope: signed })).receipt.disposition,
    "permanent_rejection",
  );

  const topic = await envelope({
    type: "peer.hello",
    audience: { kind: "mesh", topic: "membership" },
    expiresAt: "2026-08-01T00:02:00.000Z",
    payload: { type: "peer.hello", peerCardId: "card-a", cardRevision: 1 },
  });
  await assert.rejects(
    () => redirect.deliver({ envelope: topic }),
    /targetPeerId/u,
  );
});
