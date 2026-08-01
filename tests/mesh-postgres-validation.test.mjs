import assert from "node:assert/strict";
import test from "node:test";

import { PostgresMeshDurableRepository } from "@agentplat/mesh-postgres";

const scope = {
  tenantId: "tenant-a",
  meshId: "mesh-a",
  peerId: "peer-a",
  instanceId: "instance-a",
};
const claim = {
  workerId: "worker-a",
  leaseToken: "token-a",
  generation: 1,
  expiresAt: "2026-08-01T00:01:00.000Z",
};

function repository() {
  return new PostgresMeshDurableRepository({
    connect() {
      throw new Error("invalid input must fail before database access");
    },
  });
}

test("PostgreSQL adapter rejects malformed direct settlements before I/O", async () => {
  await assert.rejects(
    repository().settleOutbox({
      outbox: {
        scope,
        claim,
        effectId: "effect-a",
        status: "delivering",
      },
      settlement: { disposition: "unexpected" },
    }),
    /settlement is invalid/u,
  );
});

test("PostgreSQL adapter bounds direct reason codes before I/O", async () => {
  await assert.rejects(
    repository().abandonInbox({
      inbox: {
        scope,
        claim,
        messageId: "AAAAAAAAAAAAAAAAAAAAAQ",
        status: "processing",
      },
      retryAfterMs: 100,
      reasonCode: "NOT ALLOWED",
    }),
    /reasonCode is invalid/u,
  );
});

test("PostgreSQL adapter validates the complete commit shape before I/O", async () => {
  await assert.rejects(
    repository().commitInboxTransition({
      inbox: {
        scope,
        claim,
        messageId: "AAAAAAAAAAAAAAAAAAAAAQ",
        status: "processing",
      },
      expectedSnapshotRevision: 0,
      transitionId: "transition-a",
      outcome: "rejected",
      journal: [],
      outbox: [],
    }),
    /commit input is invalid/u,
  );
});
