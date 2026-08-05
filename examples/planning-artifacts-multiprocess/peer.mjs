import { createServer } from "node:http";
import process from "node:process";
import {
  CollectiveSyncClientV1,
  CollectiveSyncHttpTransportV1,
  CollectiveSyncPeerV1,
  handleCollectiveSyncHttpRequestV1,
} from "@agentplat/collective-sync";
import { PostgresCollectiveSyncRepositoryV1 } from "@agentplat/collective-sync-postgres";
import { MESH_SIGNATURE_ALGORITHM } from "@agentplat/mesh-protocol";
import {
  CertifiedPlanningArtifactAvailabilityV2,
  CertifiedReplicatedPlanningFragmentRepositoryV2,
  PLANNING_ARTIFACT_SYNC_DOMAIN_V1,
  PlanningArtifactAvailabilitySyncAdapterV2,
  PlanningArtifactReplicationHttpTransportV1,
  PlanningArtifactReplicationPeerV1,
  handlePlanningArtifactReplicationHttpRequestV1,
} from "@agentplat/planning-artifacts";
import {
  PostgresPlanningArtifactReplicationEvidenceRepositoryV1,
  PostgresPlanningFragmentRepositoryV1,
} from "@agentplat/planning-artifacts-postgres";
import { Pool } from "pg";

const peerId = required("PEER_ID");
const port = Number(required("PORT"));
const scope = JSON.parse(required("SCOPE"));
const binding = Object.freeze(JSON.parse(required("MEMBERSHIP_BINDING")));
const keyDefinitions = JSON.parse(required("PUBLIC_KEYS"));
const privateDefinition = JSON.parse(required("PRIVATE_KEY"));
const endpoints = JSON.parse(required("ENDPOINTS"));
const pool = new Pool(databaseOptions());
const logicalTimeMs = 100;
const replicationPolicy = Object.freeze({
  schemaVersion: 1,
  replicaCount: 2,
  writeThreshold: 2,
  receiptLifetimeMs: 10_000,
});

const syncRepository = new PostgresCollectiveSyncRepositoryV1(pool, {
  schema: required("DATABASE_SCHEMA"),
  ...scope,
});
const artifacts = new PostgresPlanningFragmentRepositoryV1(pool, {
  schema: required("DATABASE_SCHEMA"),
  ...scope,
});
const evidence = new PostgresPlanningArtifactReplicationEvidenceRepositoryV1(
  pool,
  {
    schema: required("DATABASE_SCHEMA"),
    ...scope,
  },
);
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
    logicalTimeMs,
  }),
};
const signing = {
  privateKey,
  keyId: privateDefinition.keyId,
  algorithm: MESH_SIGNATURE_ALGORITHM,
};
const adapter = new PlanningArtifactAvailabilitySyncAdapterV2({
  scope: {
    tenantId: scope.tenantId,
    meshId: scope.meshId,
    policyDomainId: scope.policyDomainId,
  },
  repository: artifacts,
  evidenceRepository: evidence,
  membership,
  clock,
  replicationPolicy,
});
const responder = new CollectiveSyncPeerV1({
  scope,
  signing,
  membership,
  repository: syncRepository,
  clock,
});
const client = new CollectiveSyncClientV1({
  scope,
  signing,
  membership,
  repository: syncRepository,
  adapter,
  transport: new CollectiveSyncHttpTransportV1({
    endpoints,
    headers: { authorization: `Bearer ${required("CHANNEL_TOKEN")}` },
  }),
  clock,
});
const availability = new CertifiedPlanningArtifactAvailabilityV2({
  scope,
  repository: artifacts,
  evidenceRepository: evidence,
  client,
  membership,
  clock,
  replicationPolicy,
});
const replicationPeer = new PlanningArtifactReplicationPeerV1({
  scope,
  repository: artifacts,
  evidenceRepository: evidence,
  syncRepository,
  membership,
  signing,
  clock,
  policy: replicationPolicy,
});
const replicated = new CertifiedReplicatedPlanningFragmentRepositoryV2({
  scope,
  repository: artifacts,
  evidenceRepository: evidence,
  syncRepository,
  membership,
  signing,
  clock,
  replicationTransport: new PlanningArtifactReplicationHttpTransportV1({
    endpoints,
    headers: { authorization: `Bearer ${required("CHANNEL_TOKEN")}` },
  }),
  replicationPolicy,
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
    const response = request.url.endsWith(
      "/agentplat/planning-artifacts/v1/replicate",
    )
      ? await handlePlanningArtifactReplicationHttpRequestV1(
          replicationPeer,
          request,
        )
      : await handleCollectiveSyncHttpRequestV1(responder, request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    outgoing.writeHead(500).end();
    process.stderr.write(`${peerId}: ${message(error)}\n`);
  }
});

process.on("message", async (command) => {
  try {
    if (command?.kind === "publish") {
      const record = await replicated.put(command.record);
      const certificate = await evidence.getCertificate({
        fragmentDigest: record.fragmentDigest,
        membershipConfigurationDigest: binding.configurationDigest,
      });
      respond(command, {
        published: true,
        contentReference: record.contentReference,
        certificateId: certificate?.certificateId ?? null,
        certifiedReplicaPeerIds:
          certificate?.receipts.map((receipt) => receipt.senderPeerId) ?? [],
      });
    } else if (command?.kind === "accept_offer") {
      const accepted = await availability.ensureAvailable({
        ...command.request,
        signal: AbortSignal.timeout(8_000),
      });
      const record = accepted
        ? await artifacts.get(command.request.contentReference)
        : null;
      respond(command, {
        accepted,
        fragmentDigest: record?.fragmentDigest ?? null,
        certificateCreated:
          (await syncRepository.latestCertificate(
            PLANNING_ARTIFACT_SYNC_DOMAIN_V1,
          )) !== undefined,
      });
    } else if (command?.kind === "inspect") {
      const record = await artifacts.get(command.contentReference);
      const certificate = command.fragmentDigest
        ? await evidence.getCertificate({
            fragmentDigest: command.fragmentDigest,
            membershipConfigurationDigest: binding.configurationDigest,
          })
        : null;
      respond(command, {
        available: record !== null,
        fragmentDigest: record?.fragmentDigest ?? null,
        certificateId: certificate?.certificateId ?? null,
      });
    }
  } catch (error) {
    respond(command, { accepted: false, error: message(error) });
  }
});

server.listen(port, "127.0.0.1", () =>
  process.send?.({ kind: "ready", peerId }),
);

function respond(command, value) {
  process.send?.({
    kind: command?.kind,
    requestId: command?.requestId,
    ...value,
  });
}
function databaseOptions() {
  if (process.env.DATABASE_URL)
    return { connectionString: process.env.DATABASE_URL, max: 4 };
  return {
    host: process.env.PGHOST ?? "127.0.0.1",
    port: Number(process.env.PGPORT ?? "55433"),
    database: process.env.PGDATABASE ?? "agentplat_mesh_demo",
    user: process.env.PGUSER ?? "agentplat",
    password: process.env.PGPASSWORD ?? "agentplat",
    max: 4,
  };
}
function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
function message(error) {
  return error instanceof Error ? error.message : String(error);
}
const shutdown = async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
  process.exit(0);
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
