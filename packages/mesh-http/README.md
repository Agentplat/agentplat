# `@agentplat/mesh-http`

Bounded, Fetch-compatible HTTP transport for already signed Agentplat Mesh
envelopes. Importing or constructing a client/handler starts no server, performs
no discovery and opens no network connection.

```ts
import {
  createMeshHttpClient,
  createMeshHttpHandler,
} from "@agentplat/mesh-http";

const handler = createMeshHttpHandler({
  target: {
    tenantId: "tenant-a",
    meshId: "mesh-a",
    peerId: "peer-b",
    instanceId: "peer-b-1",
  },
  authenticate: (request) =>
    request.headers.get("authorization") === process.env.MESH_CHANNEL_TOKEN,
  accept: async (envelope) => {
    const receipt = await durableRepository.receive({ scope, envelope });
    return { accepted: true, duplicate: receipt.duplicate };
  },
});

const client = createMeshHttpClient({
  allowedSchemes: ["https:"],
  resolveEndpoint: ({ peerId }) => ({
    url: configuredPeerUrls[peerId],
    headers: { authorization: `Bearer ${channelToken}` },
  }),
});

await client.deliver({ envelope: signedEnvelope });
```

The default handler and client path is `/agentplat/mesh/v1/envelopes`. A v0
compatibility endpoint must explicitly bind both `wireVersion: 0` and
`/agentplat/mesh/v0/envelopes`; path probing and version fallback are refused.
Each handler strictly parses its bound version and acknowledges it only after
the injected acceptor returns success. It does not verify signatures or
admission; the durable worker must use the normal Mesh inbound boundary before
state mutation.

First receipt and exact duplicate receipt are deliberately indistinguishable to
the remote sender. Detailed signature, key, replay, Trust, policy and database
errors must remain in bounded local diagnostics.

No CORS headers or `OPTIONS` handling are enabled by default. Browser-facing
deployments may inject an exact construction-bound `cors` policy with explicit
HTTP(S) origins, lowercase request headers and a bounded preflight age. Wildcard
origins and envelope-supplied origins are not accepted.

Delivery is at least once. The client performs one attempt, never follows
redirects, and returns a coarse receipt. Retry scheduling belongs to the
durable outbox worker, which must retry the exact same signed envelope.
