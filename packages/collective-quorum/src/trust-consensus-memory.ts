import type {
  CertifiedCollectiveTrustDecisionV1,
  CollectiveTrustDecisionRepositoryV1,
  CollectiveTrustDecisionSaveResultV1,
} from "./trust-consensus-contracts.js";
import { validateCertifiedCollectiveTrustDecisionV1 } from "./trust-consensus-codec.js";

export class InMemoryCollectiveTrustDecisionRepositoryV1 implements CollectiveTrustDecisionRepositoryV1 {
  readonly #decisions = new Map<string, CertifiedCollectiveTrustDecisionV1>();
  readonly #heads = new Map<string, string>();
  #queue: Promise<void> = Promise.resolve();

  async save(input: {
    readonly decision: CertifiedCollectiveTrustDecisionV1;
    readonly expectedHeadDigest: string | null;
  }): Promise<CollectiveTrustDecisionSaveResultV1> {
    return this.#locked(async () => {
      const decision = await validateCertifiedCollectiveTrustDecisionV1(
        input.decision,
      );
      const existing = this.#decisions.get(decision.decisionDigest);
      if (existing) return "duplicate";
      if (input.expectedHeadDigest !== decision.previousCertifiedDecisionDigest)
        return "conflict";
      const key = headKey(decision);
      const current = this.#heads.get(key) ?? null;
      if (
        input.expectedHeadDigest !== null &&
        !this.#decisions.has(input.expectedHeadDigest)
      )
        return "chain_gap";
      if (current !== input.expectedHeadDigest) return "stale_head";
      this.#decisions.set(decision.decisionDigest, decision);
      this.#heads.set(key, decision.decisionDigest);
      return "stored";
    });
  }

  async get(
    decisionDigest: string,
  ): Promise<CertifiedCollectiveTrustDecisionV1 | null> {
    return this.#decisions.get(decisionDigest) ?? null;
  }

  async head(input: {
    readonly tenantId: string;
    readonly subjectDigest: string;
    readonly scopeDigest: string;
    readonly policyDigest: string;
  }): Promise<CertifiedCollectiveTrustDecisionV1 | null> {
    const digest = this.#heads.get(headKey(input));
    return digest ? (this.#decisions.get(digest) ?? null) : null;
  }

  async list(input: {
    readonly tenantId: string;
    readonly subjectDigest: string;
    readonly scopeDigest: string;
    readonly policyDigest: string;
    readonly maximumCount: number;
  }): Promise<readonly CertifiedCollectiveTrustDecisionV1[]> {
    if (
      !Number.isSafeInteger(input.maximumCount) ||
      input.maximumCount < 1 ||
      input.maximumCount > 10_000
    )
      throw new RangeError("maximumCount is out of range");
    const key = headKey(input);
    const result: CertifiedCollectiveTrustDecisionV1[] = [];
    let cursor = this.#heads.get(key) ?? null;
    while (cursor && result.length < input.maximumCount) {
      const decision = this.#decisions.get(cursor);
      if (!decision) break;
      result.push(decision);
      cursor = decision.previousCertifiedDecisionDigest;
    }
    return Object.freeze(result.reverse());
  }

  async #locked<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.#queue;
    let release!: () => void;
    this.#queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

function headKey(input: {
  readonly tenantId: string;
  readonly subjectDigest: string;
  readonly scopeDigest: string;
  readonly policyDigest: string;
}): string {
  return [
    input.tenantId,
    input.subjectDigest,
    input.scopeDigest,
    input.policyDigest,
  ].join("\0");
}
