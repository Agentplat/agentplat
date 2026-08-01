import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { signMeshEnvelope } from "@agentplat/mesh-crypto";
import { createMeshDurableWorker } from "@agentplat/mesh/durability";
import { createMeshHttpHandler } from "@agentplat/mesh-http";
import {
  createPostgresPool,
  PostgresMeshDurableRepository,
  runMigrations,
} from "@agentplat/mesh-postgres";
import {
  MESH_PROTOCOL,
  MESH_SIGNATURE_ALGORITHM,
  MESH_WIRE_VERSION,
  canonicalizeMeshJsonBytes,
} from "@agentplat/mesh-protocol";

const sampleSize = boundedSample(process.env.MESH_BENCHMARK_SAMPLES ?? "64");
const schema = `mesh_benchmark_${randomBytes(8).toString("hex")}`;
const pool = createPostgresPool({ max: 8 });
const scope = {
  tenantId: "tenant-benchmark",
  meshId: "mesh-benchmark",
  peerId: "peer-b",
  instanceId: "peer-b-instance",
};

try {
  const migrationStarted = performance.now();
  await runMigrations(pool, { schema, createSchema: true });
  const migrationMs = elapsed(migrationStarted);
  const repository = new PostgresMeshDurableRepository(pool, {
    schema,
    maximumPendingInboxRowsPerScope: 1_024,
  });
  const keys = await crypto.subtle.generateKey(MESH_SIGNATURE_ALGORITHM, true, [
    "sign",
    "verify",
  ]);
  const now = Date.now();
  const envelopes = await Promise.all(
    Array.from({ length: sampleSize }, (_, index) =>
      signMeshEnvelope({
        envelope: {
          protocol: MESH_PROTOCOL,
          wireVersion: MESH_WIRE_VERSION,
          messageId: messageId(),
          tenantId: scope.tenantId,
          meshId: scope.meshId,
          type: "peer.ping",
          sender: { peerId: "peer-a", instanceId: "peer-a-instance" },
          audience: { kind: "peer", peerId: scope.peerId },
          sequence: index + 1,
          sentAt: new Date(now).toISOString(),
          expiresAt: new Date(now + 30_000).toISOString(),
          payload: { type: "peer.ping" },
          proof: {
            algorithm: MESH_SIGNATURE_ALGORITHM,
            keyId: "peer-a-key",
          },
        },
        privateKey: keys.privateKey,
      }),
    ),
  );

  const receiptStarted = performance.now();
  for (const envelope of envelopes) {
    const result = await repository.receive({ scope, envelope });
    assert.equal(result.accepted, true);
    assert.equal(result.duplicate, false);
  }
  const durableReceiptMs = elapsed(receiptStarted);

  const claimStarted = performance.now();
  const claimed = await repository.claimInbox({
    scope,
    workerId: "benchmark-claim",
    limit: sampleSize,
    leaseDurationMs: 30_000,
  });
  const claimBatchMs = elapsed(claimStarted);
  assert.equal(claimed.length, sampleSize);
  for (const inbox of claimed) {
    assert.equal(
      await repository.abandonInbox({
        inbox,
        retryAfterMs: 1,
        reasonCode: "benchmark_requeue",
      }),
      true,
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 5));

  const worker = createMeshDurableWorker({
    repository,
    scope,
    workerId: "benchmark-worker",
    inboxBatchSize: sampleSize,
    deliverOutbox: async () => ({ disposition: "delivered" }),
    processInbox: async ({ snapshot }) => ({
      outcome: "applied",
      nextState: { count: Number(snapshot?.state.count ?? 0) + 1 },
    }),
  });
  const transitionStarted = performance.now();
  const transition = await worker.runInboxBatch();
  const transitionBatchMs = elapsed(transitionStarted);
  assert.deepEqual(transition, {
    claimed: sampleSize,
    completed: sampleSize,
    conflicted: 0,
    failed: 0,
  });

  const duplicate = envelopes[0];
  const duplicateBytes = canonicalizeMeshJsonBytes(duplicate);
  assert.equal(duplicateBytes.ok, true);
  const handler = createMeshHttpHandler({
    target: { ...scope },
    accept: async (envelope) => {
      const receipt = await repository.receive({ scope, envelope });
      return receipt.accepted
        ? { accepted: true, duplicate: receipt.duplicate }
        : { accepted: false, disposition: "permanent_rejection" };
    },
  });
  const httpStarted = performance.now();
  for (let index = 0; index < sampleSize; index += 1) {
    const response = await handler(
      new Request("http://127.0.0.1/agentplat/mesh/v0/envelopes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: duplicateBytes.value,
      }),
    );
    assert.equal(response.status, 202);
  }
  const duplicateHttpReceiptMs = elapsed(httpStarted);
  const serverVersion = String(
    (await pool.query("SHOW server_version")).rows[0].server_version,
  );

  console.log(
    JSON.stringify({
      benchmark: "mesh-adapters-alpha5",
      status: "passed",
      samples: sampleSize,
      node: process.version,
      postgres: serverVersion,
      configuredBounds: {
        maximumEnvelopeBytes: 262_144,
        maximumWorkerBatch: 256,
        defaultWorkerBatch: 16,
      },
      elapsedMs: {
        migration: migrationMs,
        durableReceiptBatch: durableReceiptMs,
        claimBatch: claimBatchMs,
        transitionBatch: transitionBatchMs,
        duplicateHttpReceiptBatch: duplicateHttpReceiptMs,
      },
      operationsPerSecond: {
        durableReceipt: rate(sampleSize, durableReceiptMs),
        claim: rate(sampleSize, claimBatchMs),
        transition: rate(sampleSize, transitionBatchMs),
        duplicateHttpReceipt: rate(sampleSize, duplicateHttpReceiptMs),
      },
    }),
  );
} finally {
  if (/^mesh_benchmark_[a-f0-9]{16}$/u.test(schema)) {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  }
  await pool.end();
}

function messageId() {
  return randomBytes(16).toString("base64url");
}

function elapsed(started) {
  return Math.round((performance.now() - started) * 100) / 100;
}

function rate(count, milliseconds) {
  return Math.round((count / Math.max(milliseconds, 0.01)) * 100_000) / 100;
}

function boundedSample(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > 256) {
    throw new RangeError("MESH_BENCHMARK_SAMPLES must be from 1 through 256");
  }
  return number;
}
