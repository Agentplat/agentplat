import type {
  MeshDurableOutboxDeliver,
  MeshDurableOutboxRecord,
  MeshDurableOutboxSettlement,
} from "@agentplat/mesh/durability";

import type { MeshHttpClient } from "./index.js";

/**
 * Adapts one bounded HTTP client attempt to the durable outbox contract.
 * Retry ownership remains with the durable worker; this adapter never mutates
 * the signed envelope or makes an additional delivery attempt.
 */
export function createMeshHttpDurableOutboxDeliver(input: {
  readonly client: MeshHttpClient;
}): MeshDurableOutboxDeliver {
  if (
    !input ||
    typeof input !== "object" ||
    !input.client ||
    typeof input.client.deliver !== "function"
  ) {
    throw new TypeError("Mesh HTTP durable outbox client is required");
  }
  const client = input.client;
  return async function deliverOutbox(
    outbox: MeshDurableOutboxRecord,
    signal?: AbortSignal,
  ): Promise<MeshDurableOutboxSettlement> {
    const result = await client.deliver({
      envelope: outbox.envelope,
      ...(outbox.targetPeerId === undefined
        ? {}
        : { targetPeerId: outbox.targetPeerId }),
      ...(signal === undefined ? {} : { signal }),
    });
    switch (result.receipt.disposition) {
      case "accepted":
        return Object.freeze({ disposition: "delivered" });
      case "permanent_rejection":
        return Object.freeze({ disposition: "permanent_rejection" });
      case "retryable":
        // The HTTP contract validates retryAfterMs whenever it is supplied.
        return Object.freeze({
          disposition: "retryable",
          retryAfterMs: result.receipt.retryAfterMs ?? 1_000,
        });
    }
    throw new TypeError("Mesh HTTP receipt disposition is invalid");
  };
}
