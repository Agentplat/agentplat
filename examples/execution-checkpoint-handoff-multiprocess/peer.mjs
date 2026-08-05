import { createServer } from "node:http";
import process from "node:process";

import {
  CertifiedExecutionCheckpointAvailabilityV1,
  ExecutionCheckpointHttpTransportV1,
  ExecutionCheckpointReplicationPeerV1,
  handleExecutionCheckpointHttpRequestV1,
} from "@agentplat/collective-runtime/checkpoints";
import { MESH_SIGNATURE_ALGORITHM } from "@agentplat/mesh-protocol";
import { PostgresExecutionCheckpointRepositoryV1 } from "@agentplat/collective-sync-postgres/checkpoints";
import { Pool } from "pg";

const peerId = required("PEER_ID");
const port = Number(required("PORT"));
const scope = JSON.parse(required("SCOPE"));
const binding = Object.freeze(JSON.parse(required("MEMBERSHIP_BINDING")));
const keyDefinitions = JSON.parse(required("PUBLIC_KEYS"));
const privateDefinition = JSON.parse(required("PRIVATE_KEY"));
const endpoints = JSON.parse(required("ENDPOINTS"));
const token = required("CHANNEL_TOKEN");
const pool = new Pool(databaseOptions());
const policy = Object.freeze({
  schemaVersion: 1,
  replicaCount: 2,
  writeThreshold: 2,
  certificateCustodyThreshold: 2,
  evidenceLifetimeMs: 10_000,
  maximumArtifactBytes: 1_048_576,
});
const clock = {
  now: () => ({
    wallTime: "2030-01-01T00:00:00.000Z",
    logicalTimeMs: 100,
  }),
};
const repository = new PostgresExecutionCheckpointRepositoryV1(pool, {
  schema: required("DATABASE_SCHEMA"),
  ...scope,
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
const signing = {
  privateKey,
  keyId: privateDefinition.keyId,
  algorithm: MESH_SIGNATURE_ALGORITHM,
};
const responder = new ExecutionCheckpointReplicationPeerV1({
  scope,
  policy,
  artifacts: repository,
  evidence: repository,
  membership,
  signing,
  clock,
});
const availability = new CertifiedExecutionCheckpointAvailabilityV1({
  scope,
  policy,
  artifacts: repository,
  evidence: repository,
  membership,
  signing,
  clock,
  transport: new ExecutionCheckpointHttpTransportV1({
    endpoints,
    headers: { authorization: `Bearer ${token}` },
  }),
});

const server = createServer(async (incoming, outgoing) => {
  try {
    if (incoming.headers.authorization !== `Bearer ${token}`) {
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
    const response = await handleExecutionCheckpointHttpRequestV1(
      responder,
      request,
      {
        onError: (error) =>
          process.stderr.write(`${peerId}: ${message(error)}\n`),
      },
    );
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
      const certificate = await availability.publish({
        transfer: command.transfer,
        objectiveId: "objective:checkpoint-test",
        workItemId: "work:checkpoint-test",
        workItemRevision: 1,
        assignmentEpoch: 1,
        assignmentAuthorityId: "authority:checkpoint-test:1",
        fencingToken: "fence:checkpoint-test:1",
        workContractDigest: `sha256:${"b".repeat(64)}`,
        roleBindingDigest: `sha256:${"c".repeat(64)}`,
        signal: AbortSignal.timeout(8_000),
      });
      respond(command, {
        published: true,
        certificateId: certificate.certificateId,
        certifiedReplicaPeerIds: certificate.receipts
          .map(({ senderPeerId }) => senderPeerId)
          .sort(),
      });
    } else if (command?.kind === "resolve") {
      const artifact = await availability.resolve({
        checkpointId: command.checkpointId,
        tenantId: scope.tenantId,
        meshId: scope.meshId,
        policyDomainId: scope.policyDomainId,
        objectiveId: "objective:checkpoint-test",
        workItemId: "work:checkpoint-test",
        workItemRevision: 1,
        previousAssignmentEpoch: 1,
        signal: AbortSignal.timeout(8_000),
      });
      const certificate = await repository.getCertificate(command.checkpointId);
      respond(command, {
        resolved: artifact !== null,
        stateDigest: artifact?.transfer.checkpoint.stateDigest ?? null,
        certificateId: certificate?.certificateId ?? null,
      });
    } else if (command?.kind === "inspect") {
      const artifact = await repository.get(command.checkpointId);
      const certificate = await repository.getCertificate(command.checkpointId);
      respond(command, {
        available: artifact !== null,
        certificateId: certificate?.certificateId ?? null,
      });
    }
  } catch (error) {
    respond(command, {
      published: false,
      resolved: false,
      error: message(error),
    });
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
