import type {
  CollectiveQuorumAcceptedRecoveryValueV1,
  CollectiveQuorumAssignmentAttestationPayloadV1,
  CollectiveQuorumBallotV1,
  CollectiveQuorumCertificateV1,
  CollectiveQuorumRecoveryAcceptedPayloadV1,
  CollectiveQuorumRecoveryPromisePayloadV1,
  CollectiveQuorumRecoveryValueV1,
  CollectiveQuorumRepositoryV1,
  SignedCollectiveQuorumEnvelopeV1,
} from "./contracts.js";
import {
  compareCollectiveQuorumBallotsV1,
  sameCollectiveQuorumRecoveryValueV1,
} from "./codec.js";

interface AssignmentSlot {
  readonly valueDigest: string;
  readonly responses: Map<
    string,
    SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumAssignmentAttestationPayloadV1>
  >;
}

interface RecoverySlot {
  promisedBallot: CollectiveQuorumBallotV1 | null;
  accepted: CollectiveQuorumAcceptedRecoveryValueV1 | null;
  readonly proposerCounters: Map<string, number>;
  readonly promises: Map<
    string,
    SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumRecoveryPromisePayloadV1>
  >;
  readonly acceptances: Map<
    string,
    SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumRecoveryAcceptedPayloadV1>
  >;
}

/**
 * Process-local reference repository with the same atomic non-equivocation
 * semantics as the PostgreSQL adapter. Useful for embedding and simulation.
 */
export class InMemoryCollectiveQuorumRepositoryV1 implements CollectiveQuorumRepositoryV1 {
  readonly #assignments = new Map<string, AssignmentSlot>();
  readonly #recoveries = new Map<string, RecoverySlot>();
  readonly #certificates = new Map<string, CollectiveQuorumCertificateV1>();
  #tail: Promise<void> = Promise.resolve();

  nextBallot(input: {
    readonly scopeDigest: string;
    readonly proposerPeerId: string;
  }): Promise<CollectiveQuorumBallotV1> {
    return this.#locked(() => {
      const slot = this.#recovery(input.scopeDigest);
      const prior = slot.proposerCounters.get(input.proposerPeerId) ?? 0;
      const counter =
        Math.max(
          prior,
          slot.promisedBallot?.counter ?? 0,
          slot.accepted?.ballot.counter ?? 0,
        ) + 1;
      slot.proposerCounters.set(input.proposerPeerId, counter);
      return Object.freeze({ counter, proposerPeerId: input.proposerPeerId });
    });
  }

  attestAssignment(input: {
    readonly assignmentSlotDigest: string;
    readonly valueDigest: string;
    readonly requestMessageId: string;
    readonly create: () => Promise<
      SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumAssignmentAttestationPayloadV1>
    >;
  }): Promise<SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumAssignmentAttestationPayloadV1> | null> {
    return this.#locked(async () => {
      const slot = this.#assignments.get(input.assignmentSlotDigest);
      const duplicate = slot?.responses.get(input.requestMessageId);
      if (duplicate) return duplicate;
      if (slot && slot.valueDigest !== input.valueDigest) return null;
      const response = await input.create();
      if (slot) slot.responses.set(input.requestMessageId, response);
      else
        this.#assignments.set(input.assignmentSlotDigest, {
          valueDigest: input.valueDigest,
          responses: new Map([[input.requestMessageId, response]]),
        });
      return response;
    });
  }

  promiseRecovery(input: {
    readonly scopeDigest: string;
    readonly ballot: CollectiveQuorumBallotV1;
    readonly requestMessageId: string;
    readonly create: (
      accepted: CollectiveQuorumAcceptedRecoveryValueV1 | null,
    ) => Promise<
      SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumRecoveryPromisePayloadV1>
    >;
  }): Promise<SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumRecoveryPromisePayloadV1> | null> {
    return this.#locked(async () => {
      const slot = this.#recovery(input.scopeDigest);
      const duplicate = slot.promises.get(input.requestMessageId);
      if (duplicate) return duplicate;
      if (
        slot.promisedBallot &&
        compareCollectiveQuorumBallotsV1(input.ballot, slot.promisedBallot) < 0
      )
        return null;
      const response = await input.create(slot.accepted);
      slot.promisedBallot = input.ballot;
      slot.promises.set(input.requestMessageId, response);
      return response;
    });
  }

  acceptRecovery(input: {
    readonly scopeDigest: string;
    readonly ballot: CollectiveQuorumBallotV1;
    readonly value: CollectiveQuorumRecoveryValueV1;
    readonly requestMessageId: string;
    readonly create: () => Promise<
      SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumRecoveryAcceptedPayloadV1>
    >;
  }): Promise<SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumRecoveryAcceptedPayloadV1> | null> {
    return this.#locked(async () => {
      const slot = this.#recovery(input.scopeDigest);
      const duplicate = slot.acceptances.get(input.requestMessageId);
      if (duplicate) return duplicate;
      if (
        slot.promisedBallot &&
        compareCollectiveQuorumBallotsV1(input.ballot, slot.promisedBallot) < 0
      )
        return null;
      if (
        slot.accepted &&
        compareCollectiveQuorumBallotsV1(input.ballot, slot.accepted.ballot) ===
          0 &&
        !sameCollectiveQuorumRecoveryValueV1(input.value, slot.accepted.value)
      )
        return null;
      const response = await input.create();
      slot.promisedBallot = input.ballot;
      slot.accepted = Object.freeze({
        ballot: input.ballot,
        value: input.value,
      });
      slot.acceptances.set(input.requestMessageId, response);
      return response;
    });
  }

  saveCertificate(certificate: CollectiveQuorumCertificateV1): Promise<void> {
    return this.#locked(() => {
      const existing = this.#certificates.get(certificate.certificateId);
      if (
        existing &&
        existing.certificateDigest !== certificate.certificateDigest
      )
        throw new Error("certificate_conflict");
      this.#certificates.set(certificate.certificateId, certificate);
    });
  }

  getCertificate(
    certificateId: string,
  ): Promise<CollectiveQuorumCertificateV1 | undefined> {
    return this.#locked(() => this.#certificates.get(certificateId));
  }

  /** Read-only diagnostic snapshot for conformance tests and operators. */
  inspectRecovery(scopeDigest: string): Promise<
    | {
        readonly promisedBallot: CollectiveQuorumBallotV1 | null;
        readonly accepted: CollectiveQuorumAcceptedRecoveryValueV1 | null;
      }
    | undefined
  > {
    return this.#locked(() => {
      const slot = this.#recoveries.get(scopeDigest);
      return slot
        ? Object.freeze({
            promisedBallot: slot.promisedBallot,
            accepted: slot.accepted,
          })
        : undefined;
    });
  }

  #recovery(scopeDigest: string): RecoverySlot {
    let slot = this.#recoveries.get(scopeDigest);
    if (!slot) {
      slot = {
        promisedBallot: null,
        accepted: null,
        proposerCounters: new Map(),
        promises: new Map(),
        acceptances: new Map(),
      };
      this.#recoveries.set(scopeDigest, slot);
    }
    return slot;
  }

  #locked<T>(work: () => T | Promise<T>): Promise<T> {
    const run = this.#tail.then(work, work);
    this.#tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
