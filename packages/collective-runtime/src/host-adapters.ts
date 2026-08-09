import type {
  CollectivePeerHostClockV1,
  CollectivePeerHostAdmissionClaimV1,
  CollectivePeerHostClaimOutcomeV1,
  CollectivePeerHostClaimPortV1,
  CollectivePeerHostTopologyFreshnessV1,
  CollectivePeerHostTopologyPortV1,
} from "./host-contracts.js";
import { assertHostIdentifierV1 } from "./host-validation.js";

const DIGEST = /^sha256:[0-9a-f]{64}$/u;

/**
 * Test and single-process embedded adapter. Production deployments must use a
 * durable claim store shared by every worker of the logical peer host.
 */
export class InMemoryCollectivePeerHostClaimPortV1 implements CollectivePeerHostClaimPortV1 {
  readonly #records = new Map<string, CollectivePeerHostAdmissionClaimV1>();

  async claim(input: {
    readonly messageId: string;
    readonly routeId: string;
    readonly envelopeIdentityDigest: `sha256:${string}`;
    readonly claimedAt: string;
  }): Promise<CollectivePeerHostClaimOutcomeV1> {
    const messageId = assertHostIdentifierV1(
      input?.messageId,
      "claim.messageId",
    );
    const routeId = assertHostIdentifierV1(input?.routeId, "claim.routeId");
    const envelopeIdentityDigest = identityDigest(
      input?.envelopeIdentityDigest,
    );
    if (typeof input?.claimedAt !== "string" || !input.claimedAt)
      throw new TypeError("claim.claimedAt is required");
    const existing = this.#records.get(messageId);
    if (existing) {
      if (existing.envelopeIdentityDigest !== envelopeIdentityDigest)
        throw new TypeError("admission claim envelope identity conflicts");
      return Object.freeze({ acquired: false, claim: existing });
    }
    const claim: CollectivePeerHostAdmissionClaimV1 = Object.freeze({
      messageId,
      routeId,
      envelopeIdentityDigest,
      status: "claimed",
      claimedAt: input.claimedAt,
      admittedAt: null,
    });
    this.#records.set(messageId, claim);
    return Object.freeze({ acquired: true, claim });
  }

  async complete(input: {
    readonly messageId: string;
    readonly routeId: string;
    readonly envelopeIdentityDigest: `sha256:${string}`;
    readonly admittedAt: string;
  }): Promise<CollectivePeerHostAdmissionClaimV1> {
    const messageId = assertHostIdentifierV1(
      input?.messageId,
      "claim.messageId",
    );
    const routeId = assertHostIdentifierV1(input?.routeId, "claim.routeId");
    const envelopeIdentityDigest = identityDigest(
      input?.envelopeIdentityDigest,
    );
    if (typeof input?.admittedAt !== "string" || !input.admittedAt)
      throw new TypeError("claim.admittedAt is required");
    const existing = this.#records.get(messageId);
    if (!existing) throw new TypeError("admission claim does not exist");
    if (
      existing.routeId !== routeId ||
      existing.envelopeIdentityDigest !== envelopeIdentityDigest
    )
      throw new TypeError(
        "admission claim route or envelope identity conflicts",
      );
    if (existing.status === "admitted") return existing;
    const completed: CollectivePeerHostAdmissionClaimV1 = Object.freeze({
      ...existing,
      status: "admitted",
      admittedAt: input.admittedAt,
    });
    this.#records.set(messageId, completed);
    return completed;
  }
}

export function createFixedCollectivePeerHostTopologyPortV1(
  freshness: CollectivePeerHostTopologyFreshnessV1 = "fresh",
): CollectivePeerHostTopologyPortV1 {
  return Object.freeze({ freshness: () => freshness });
}

export function createSystemCollectivePeerHostClockV1(): CollectivePeerHostClockV1 {
  return Object.freeze({ now: () => new Date().toISOString() });
}

function identityDigest(value: unknown): `sha256:${string}` {
  if (typeof value !== "string" || !DIGEST.test(value))
    throw new TypeError("claim.envelopeIdentityDigest is invalid");
  return value as `sha256:${string}`;
}
