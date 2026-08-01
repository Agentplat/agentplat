import type { SignedMeshEnvelope } from "@agentplat/mesh-protocol";
import {
  createMeshHttpClient,
  createMeshHttpHandler,
  type MeshHttpCorsPolicy,
  type MeshHttpIngressDecision,
  type MeshHttpReceipt,
} from "@agentplat/mesh-http";

declare const envelope: SignedMeshEnvelope;
declare const cors: MeshHttpCorsPolicy;
void cors;

const handler = createMeshHttpHandler({
  target: {
    tenantId: "tenant-a",
    meshId: "mesh-a",
    peerId: "peer-b",
    instanceId: "peer-b-1",
  },
  accept: async (accepted): Promise<MeshHttpIngressDecision> => {
    accepted satisfies SignedMeshEnvelope;
    return { accepted: true };
  },
});

const client = createMeshHttpClient({
  resolveEndpoint: async ({ peerId }) => ({
    url: `https://${peerId}.example/mesh`,
  }),
});

const result = await client.deliver({ envelope });
result.receipt satisfies MeshHttpReceipt;
handler satisfies (request: Request) => Promise<Response>;
