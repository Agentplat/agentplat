import {
  InMemorySparseAgreementRoundStoreV1,
  SparseAgreementRoundRuntimeV1,
  SparseFinalityAssemblyRuntimeV1,
  type SparseAgreementLocalSignerV1,
  type SparseAgreementRoundTransportV1,
} from "@agentplat/collective-quorum/sparse-agreement-runtime";
import type {
  SparseAggregateSignaturePortV2,
  SparseAgreementMembershipV2,
  SparseCommitteeCertificateV2,
  SparseCommitteePolicyV2,
} from "@agentplat/collective-quorum/sparse-agreement";

import type { SparseBftFinalityGatewayV1 } from "./reference-integrated-stack.js";

export interface InProcessSparseBftSignerV1 extends SparseAgreementLocalSignerV1 {
  admitProposal(
    input: Parameters<SparseBftFinalityGatewayV1["certify"]>[0] & {
      readonly validator: SparseAgreementMembershipV2["validators"][number];
    },
  ): Promise<boolean>;
}

/**
 * Deterministic in-process sparse-BFT cluster for local composition and tests.
 * It runs the real prepare/commit and reconciliation runtimes with one signer
 * per configured validator; it never fabricates shares or certificates.
 * Production deployments should replace it with a multiprocess gateway.
 */
export class InProcessSparseBftFinalityGatewayV1 implements SparseBftFinalityGatewayV1 {
  readonly #signers: ReadonlyMap<string, InProcessSparseBftSignerV1>;
  readonly #shards = new Map<string, readonly SparseCommitteeCertificateV2[]>();
  readonly #certifications = new Map<
    string,
    {
      readonly certificate: import("@agentplat/collective-quorum/sparse-agreement").SparseFinalityCertificateV2;
      readonly shardCertificates: readonly SparseCommitteeCertificateV2[];
    }
  >();
  #sequence = 0;

  constructor(
    readonly options: {
      readonly membership: SparseAgreementMembershipV2;
      readonly policy: SparseCommitteePolicyV2;
      readonly signatures: SparseAggregateSignaturePortV2;
      readonly signers: readonly InProcessSparseBftSignerV1[];
      readonly requiredShardIds?: readonly string[];
      readonly viewTimeoutMs?: number;
      readonly crypto?: Crypto;
    },
  ) {
    if (!options.membership || !options.policy || !options.signatures)
      throw new TypeError("in-process sparse BFT dependencies are required");
    const signers = new Map(
      options.signers.map((signer) => [signer.peerId, signer]),
    );
    if (signers.size !== options.signers.length)
      throw new TypeError("in-process sparse BFT signer peer is duplicated");
    for (const validator of options.membership.validators) {
      const signer = signers.get(validator.peerId);
      if (
        !signer ||
        signer.instanceId !== validator.instanceId ||
        signer.keyId !== validator.keyId ||
        typeof signer.admitProposal !== "function"
      )
        throw new TypeError(
          "in-process sparse BFT requires the exact signer for every validator",
        );
    }
    const shards = canonicalIds(
      options.requiredShardIds ?? ["mission"],
      "requiredShardIds",
    );
    if (shards.length < 1 || shards.length > options.policy.maximumCommittees)
      throw new RangeError("in-process sparse BFT shard set is invalid");
    integer(
      options.viewTimeoutMs ?? 30_000,
      "viewTimeoutMs",
      1,
      Number.MAX_SAFE_INTEGER,
    );
    this.#signers = signers;
  }

  async certify(input: Parameters<SparseBftFinalityGatewayV1["certify"]>[0]) {
    identifier(input.decisionId, "decisionId");
    digest(input.proposalDigest, "proposalDigest");
    digest(input.valueDigest, "valueDigest");
    if (
      input.commandBindingDigest !== null &&
      input.commandBindingDigest !== undefined
    )
      digest(input.commandBindingDigest, "commandBindingDigest");
    integer(input.logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    const evidenceDigests = canonicalDigests(input.evidenceDigests);
    const admitted = await Promise.all(
      this.options.membership.validators.map((validator) => {
        const signer = this.#signers.get(validator.peerId)!;
        return signer.admitProposal({
          ...input,
          evidenceDigests,
          validator,
        });
      }),
    );
    if (admitted.some((value) => value !== true)) return null;
    this.#sequence += 1;
    const requiredShardIds = canonicalIds(
      this.options.requiredShardIds ?? ["mission"],
      "requiredShardIds",
    );
    const agreementId = `reference:${input.decisionClass}:${input.proposalDigest.slice(7, 39)}:${this.#sequence}`;
    const shardCertificates: SparseCommitteeCertificateV2[] = [];
    for (const shardId of requiredShardIds) {
      const certificate = await this.#runRound({
        runtimeStem: `${agreementId}:shard:${shardId}`,
        agreementId,
        purpose: "shard",
        shardId,
        proposalDigest: input.proposalDigest,
        valueDigest: input.valueDigest,
        logicalTimeMs: input.logicalTimeMs,
      });
      if (!certificate) return null;
      shardCertificates.push(certificate);
    }
    const assembly = new SparseFinalityAssemblyRuntimeV1({
      membership: this.options.membership,
      policy: this.options.policy,
      signatures: this.options.signatures,
      crypto: this.options.crypto,
    });
    const preparation = await assembly.prepare({
      requiredShardIds,
      shardCertificates,
    });
    const reconciliation = await this.#runRound({
      runtimeStem: `${agreementId}:reconciliation`,
      agreementId,
      purpose: "reconciliation",
      shardId: "reconciliation",
      proposalDigest: input.proposalDigest,
      valueDigest: preparation.shardCertificateRootDigest,
      logicalTimeMs: input.logicalTimeMs,
    });
    if (!reconciliation) return null;
    const certificate = await assembly.finalize({
      preparation,
      reconciliationCertificate: reconciliation,
      finalizedAtLogicalMs: input.logicalTimeMs,
    });
    this.#shards.set(
      certificate.certificateDigest,
      immutable(shardCertificates),
    );
    const envelope = immutable({ certificate, shardCertificates });
    if (
      input.commandBindingDigest !== null &&
      input.commandBindingDigest !== undefined
    )
      this.#certifications.set(certificationKey(input), envelope);
    return envelope;
  }

  async shardCertificates(
    input: Parameters<SparseBftFinalityGatewayV1["shardCertificates"]>[0],
  ) {
    return this.#shards.get(input.certificate.certificateDigest) ?? null;
  }

  async reconcileCertification(
    input: Parameters<
      NonNullable<SparseBftFinalityGatewayV1["reconcileCertification"]>
    >[0],
  ) {
    identifier(input.decisionId, "decisionId");
    digest(input.proposalDigest, "proposalDigest");
    digest(input.valueDigest, "valueDigest");
    digest(input.commandBindingDigest, "commandBindingDigest");
    integer(input.logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    return this.#certifications.get(certificationKey(input)) ?? null;
  }

  async #runRound(input: {
    readonly runtimeStem: string;
    readonly agreementId: string;
    readonly purpose: "shard" | "reconciliation";
    readonly shardId: string;
    readonly proposalDigest: string;
    readonly valueDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<SparseCommitteeCertificateV2 | null> {
    const transport: SparseAgreementRoundTransportV1 = {
      publishShare: async () => {},
      publishCertificate: async () => {},
      publishEquivocation: async () => {},
    };
    const runtimes = [...this.#signers.values()].map(
      (signer) =>
        new SparseAgreementRoundRuntimeV1({
          runtimeId: `${input.runtimeStem}:${signer.peerId}`,
          membership: this.options.membership,
          policy: this.options.policy,
          signatures: this.options.signatures,
          signer,
          transport,
          store: new InMemorySparseAgreementRoundStoreV1(),
          crypto: this.options.crypto,
        }),
    );
    const deadline = safeAdd(
      input.logicalTimeMs,
      this.options.viewTimeoutMs ?? 30_000,
    );
    await Promise.all(
      runtimes.map(async (runtime) => {
        await runtime.initialize(input.logicalTimeMs);
        await runtime.startView({
          agreementId: input.agreementId,
          height: 1,
          round: 0,
          view: 0,
          purpose: input.purpose,
          shardId: input.shardId,
          proposalDigest: input.proposalDigest,
          valueDigest: input.valueDigest,
          logicalTimeMs: input.logicalTimeMs,
          viewDeadlineLogicalMs: deadline,
        });
      }),
    );

    await this.#advanceAndFanout(runtimes, input.logicalTimeMs);
    if (input.purpose === "shard") {
      await Promise.all(
        runtimes.map((runtime) => runtime.advance(input.logicalTimeMs)),
      );
      await this.#advanceAndFanout(runtimes, input.logicalTimeMs);
    }
    const results = await Promise.all(
      runtimes.map((runtime) => runtime.advance(input.logicalTimeMs)),
    );
    const certificates = results
      .map((result) => result.state.finalCertificate)
      .filter((value): value is SparseCommitteeCertificateV2 => value !== null);
    if (certificates.length === 0) return null;
    const digest = certificates[0]!.certificateDigest;
    if (
      certificates.some(
        (certificate) => certificate.certificateDigest !== digest,
      )
    )
      throw new Error(
        "in-process sparse BFT validators produced divergent certificates",
      );
    return certificates[0]!;
  }

  async #advanceAndFanout(
    runtimes: readonly SparseAgreementRoundRuntimeV1[],
    logicalTimeMs: number,
  ): Promise<void> {
    const results = await Promise.all(
      runtimes.map((runtime) => runtime.advance(logicalTimeMs)),
    );
    const emitted = results.filter((result) => result.emittedShare !== null);
    for (const target of runtimes) {
      for (const result of emitted) {
        await target.receiveShare(
          result.state.coordinate!,
          result.state.assignment!,
          result.emittedShare!,
          logicalTimeMs,
        );
      }
    }
  }
}

function certificationKey(input: {
  readonly decisionClass: string;
  readonly decisionId: string;
  readonly proposalDigest: string;
  readonly valueDigest: string;
  readonly commandBindingDigest?: string | null;
}): string {
  return [
    input.decisionClass,
    input.decisionId,
    input.proposalDigest,
    input.valueDigest,
    input.commandBindingDigest ?? "",
  ].join("\u0000");
}

function canonicalDigests(values: readonly string[]): readonly string[] {
  const canonical = [...new Set(values)].sort();
  if (
    canonical.length !== values.length ||
    canonical.some((item, index) => item !== values[index])
  )
    throw new TypeError("evidenceDigests is not canonical");
  canonical.forEach((item) => digest(item, "evidenceDigest"));
  return Object.freeze(canonical);
}

function identifier(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u.test(value)
  )
    throw new TypeError(`${label} is invalid`);
}

function digest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError(`${label} is invalid`);
}

function canonicalIds(
  values: readonly string[],
  label: string,
): readonly string[] {
  const canonical = [...new Set(values)].sort();
  if (
    canonical.length !== values.length ||
    canonical.some((item, index) => item !== values[index])
  )
    throw new TypeError(`${label} is not canonical`);
  if (
    canonical.some(
      (item) =>
        typeof item !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u.test(item),
    )
  )
    throw new TypeError(`${label} is invalid`);
  return Object.freeze(canonical);
}

function integer(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  )
    throw new RangeError(`${label} is invalid`);
  return value as number;
}

function safeAdd(left: number, right: number): number {
  return integer(
    left + right,
    "viewDeadlineLogicalMs",
    1,
    Number.MAX_SAFE_INTEGER,
  );
}

function immutable<T>(value: T): T {
  const clone = structuredClone(value);
  const freeze = (item: unknown): void => {
    if (!item || typeof item !== "object" || Object.isFrozen(item)) return;
    for (const child of Object.values(item as Record<string, unknown>))
      freeze(child);
    Object.freeze(item);
  };
  freeze(clone);
  return clone;
}
