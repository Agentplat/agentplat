import assert from "node:assert/strict";
import test from "node:test";
import { createMeshHttpDurableOutboxDeliver } from "../dist/index.js";

const outbox = Object.freeze({
  targetPeerId: "peer-target",
  envelope: Object.freeze({ messageId: "message-1" }),
});

test("maps accepted HTTP receipts to delivered and preserves target peer", async () => {
  let received;
  const deliver = createMeshHttpDurableOutboxDeliver({
    client: {
      async deliver(input) {
        received = input;
        return {
          status: 202,
          receipt: { schemaVersion: 1, disposition: "accepted" },
        };
      },
    },
  });
  assert.deepEqual(await deliver(outbox), { disposition: "delivered" });
  assert.equal(received.targetPeerId, "peer-target");
  assert.equal(received.envelope, outbox.envelope);
});

test("maps permanent and retryable HTTP receipts without losing retry-after", async () => {
  for (const [receipt, expected] of [
    [
      { schemaVersion: 1, disposition: "permanent_rejection" },
      { disposition: "permanent_rejection" },
    ],
    [
      { schemaVersion: 1, disposition: "retryable", retryAfterMs: 2345 },
      { disposition: "retryable", retryAfterMs: 2345 },
    ],
    [
      { schemaVersion: 1, disposition: "retryable" },
      { disposition: "retryable", retryAfterMs: 1000 },
    ],
  ]) {
    const deliver = createMeshHttpDurableOutboxDeliver({
      client: {
        async deliver() {
          return { status: 503, receipt };
        },
      },
    });
    assert.deepEqual(await deliver(outbox), expected);
  }
});
