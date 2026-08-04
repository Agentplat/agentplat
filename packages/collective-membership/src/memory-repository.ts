import type {
  CollectiveMembershipCertificateV1,
  CollectiveMembershipConfigurationV1,
  CollectiveMembershipRepositoryV1,
  CollectiveMembershipVotePayloadV1,
  SignedCollectiveMembershipEnvelopeV1,
} from "./contracts.js";

/** Atomic reference repository used by tests and single-process deployments. */
export class InMemoryCollectiveMembershipRepositoryV1 implements CollectiveMembershipRepositoryV1 {
  readonly #configurations = new Map<
    number,
    CollectiveMembershipConfigurationV1
  >();
  readonly #voteSlots = new Map<number, string>();
  readonly #responses = new Map<
    string,
    SignedCollectiveMembershipEnvelopeV1<CollectiveMembershipVotePayloadV1>
  >();
  readonly #certificates = new Map<string, CollectiveMembershipCertificateV1>();
  #tail: Promise<void> = Promise.resolve();

  initialize(
    configuration: CollectiveMembershipConfigurationV1,
  ): Promise<void> {
    return this.#exclusive(async () => {
      const existing = this.#configurations.get(configuration.epoch);
      if (existing) {
        if (existing.configurationDigest !== configuration.configurationDigest)
          throw new Error("membership_configuration_conflict");
        return;
      }
      if (this.#configurations.size !== 0 || configuration.epoch !== 1)
        throw new Error("membership_initialization_conflict");
      this.#configurations.set(configuration.epoch, configuration);
    });
  }

  configurations(): Promise<readonly CollectiveMembershipConfigurationV1[]> {
    return Promise.resolve(
      Object.freeze(
        [...this.#configurations.values()].sort(
          (left, right) => left.epoch - right.epoch,
        ),
      ),
    );
  }

  voteTransition(input: {
    readonly fromEpoch: number;
    readonly proposalDigest: string;
    readonly requestMessageId: string;
    readonly create: () => Promise<
      SignedCollectiveMembershipEnvelopeV1<CollectiveMembershipVotePayloadV1>
    >;
  }): Promise<SignedCollectiveMembershipEnvelopeV1<CollectiveMembershipVotePayloadV1> | null> {
    return this.#exclusive(async () => {
      const duplicate = this.#responses.get(input.requestMessageId);
      if (duplicate) return duplicate;
      const selected = this.#voteSlots.get(input.fromEpoch);
      if (selected && selected !== input.proposalDigest) return null;
      const response = await input.create();
      this.#voteSlots.set(input.fromEpoch, input.proposalDigest);
      this.#responses.set(input.requestMessageId, response);
      return response;
    });
  }

  commitTransition(input: {
    readonly expectedEpoch: number;
    readonly certificate: CollectiveMembershipCertificateV1;
  }): Promise<boolean> {
    return this.#exclusive(async () => {
      const next = input.certificate.proposal.nextConfiguration;
      const current = this.#configurations.get(this.#configurations.size);
      if (
        current?.epoch === next.epoch &&
        current.configurationDigest === next.configurationDigest
      ) {
        await this.#saveCertificate(input.certificate);
        return true;
      }
      if (
        !current ||
        current.epoch !== input.expectedEpoch ||
        next.epoch !== current.epoch + 1 ||
        next.previousConfigurationDigest !== current.configurationDigest
      )
        return false;
      this.#configurations.set(next.epoch, next);
      await this.#saveCertificate(input.certificate);
      return true;
    });
  }

  saveCertificate(
    certificate: CollectiveMembershipCertificateV1,
  ): Promise<void> {
    return this.#exclusive(() => this.#saveCertificate(certificate));
  }

  getCertificate(
    certificateId: string,
  ): Promise<CollectiveMembershipCertificateV1 | undefined> {
    return Promise.resolve(this.#certificates.get(certificateId));
  }

  async #saveCertificate(
    certificate: CollectiveMembershipCertificateV1,
  ): Promise<void> {
    const existing = this.#certificates.get(certificate.certificateId);
    if (
      existing &&
      existing.certificateDigest !== certificate.certificateDigest
    )
      throw new Error("membership_certificate_conflict");
    this.#certificates.set(certificate.certificateId, certificate);
  }

  async #exclusive<T>(work: () => Promise<T>): Promise<T> {
    const prior = this.#tail;
    let release!: () => void;
    this.#tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prior;
    try {
      return await work();
    } finally {
      release();
    }
  }
}
