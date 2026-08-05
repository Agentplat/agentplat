import type {
  CollectiveAgreementCommitCertificateV1,
  CollectiveAgreementEquivocationProofV1,
  CollectiveAgreementLocalStateV1,
  CollectiveAgreementRepositoryV1,
  CollectiveAgreementVotePayloadV1,
  CollectiveAgreementVoteRecordResultV1,
  SignedCollectiveAgreementEnvelopeV1,
} from "./agreement-contracts.js";
import { createCollectiveAgreementEquivocationProofV1 } from "./agreement-certificates.js";

interface MutableState {
  highestRound: number;
  lockedRound: number | null;
  lockedValueDigest: string | null;
}

/** Deterministic reference repository for embeds, tests and simulations. */
export class InMemoryCollectiveAgreementRepositoryV1 implements CollectiveAgreementRepositoryV1 {
  readonly #states = new Map<string, MutableState>();
  readonly #localVotes = new Map<
    string,
    SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementVotePayloadV1>
  >();
  readonly #observedVotes = new Map<
    string,
    SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementVotePayloadV1>
  >();
  readonly #commits = new Map<string, CollectiveAgreementCommitCertificateV1>();
  #tail: Promise<void> = Promise.resolve();

  constructor(readonly crypto?: Crypto) {}

  async readState(input: {
    readonly policyDomainId: string;
    readonly slotId: string;
    readonly height: number;
  }): Promise<CollectiveAgreementLocalStateV1 | null> {
    await this.#tail;
    const state = this.#states.get(stateKey(input));
    return state
      ? Object.freeze({
          ...input,
          highestRound: state.highestRound,
          lockedRound: state.lockedRound,
          lockedValueDigest: state.lockedValueDigest,
        })
      : null;
  }

  recordLocalVote(
    input: Parameters<CollectiveAgreementRepositoryV1["recordLocalVote"]>[0],
  ): Promise<CollectiveAgreementVoteRecordResultV1> {
    return this.#exclusive(async () => {
      const coordinate = input.coordinate;
      const key = voteKey(coordinate, input.phase, "local");
      const prior = this.#localVotes.get(key);
      if (prior) {
        return prior.payload.valueDigest === input.valueDigest &&
          prior.payload.proposalId === input.proposalId
          ? { status: "duplicate" as const, vote: prior }
          : { status: "conflict" as const, vote: prior };
      }
      const stateKeyValue = stateKey(coordinate);
      const state = this.#states.get(stateKeyValue) ?? {
        highestRound: coordinate.round,
        lockedRound: null,
        lockedValueDigest: null,
      };
      if (coordinate.round < state.highestRound)
        return { status: "stale_round" as const };
      state.highestRound = coordinate.round;
      this.#states.set(stateKeyValue, state);
      if (
        input.phase === "prevote" &&
        input.valueDigest !== null &&
        state.lockedRound !== null &&
        state.lockedValueDigest !== input.valueDigest &&
        (input.justifiedRound === null ||
          input.justifiedRound < state.lockedRound)
      )
        return { status: "locked" as const };
      if (
        input.phase === "precommit" &&
        (input.valueDigest === null ||
          input.justifiedRound !== coordinate.round)
      )
        return { status: "locked" as const };
      const vote = await input.create();
      if (
        vote.payload.phase !== input.phase ||
        vote.payload.valueDigest !== input.valueDigest ||
        vote.payload.proposalId !== input.proposalId
      )
        throw new TypeError("created vote does not match repository intent");
      this.#localVotes.set(key, vote);
      if (input.phase === "precommit") {
        state.lockedRound = coordinate.round;
        state.lockedValueDigest = input.valueDigest;
      }
      return { status: "signed" as const, vote };
    });
  }

  observeVote(
    vote: SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementVotePayloadV1>,
  ): Promise<CollectiveAgreementEquivocationProofV1 | null> {
    return this.#exclusive(async () => {
      const key = voteKey(
        vote.payload.coordinate,
        vote.payload.phase,
        vote.senderPeerId,
      );
      const prior = this.#observedVotes.get(key);
      if (!prior) {
        this.#observedVotes.set(key, vote);
        return null;
      }
      if (
        prior.payload.valueDigest === vote.payload.valueDigest &&
        prior.payload.proposalId === vote.payload.proposalId
      )
        return null;
      return createCollectiveAgreementEquivocationProofV1({
        first: prior,
        second: vote,
        crypto: this.crypto,
      });
    });
  }

  saveCommit(
    certificate: CollectiveAgreementCommitCertificateV1,
  ): Promise<"stored" | "duplicate" | "conflict" | "chain_gap"> {
    return this.#exclusive(async () => {
      const key = commitKey(certificate.coordinate);
      const existing = this.#commits.get(key);
      if (existing)
        return existing.certificateDigest === certificate.certificateDigest
          ? "duplicate"
          : "conflict";
      if (certificate.coordinate.height === 1) {
        if (certificate.value.previousCommitDigest !== null) return "chain_gap";
      } else {
        const previous = this.#commits.get(
          commitKey({
            ...certificate.coordinate,
            height: certificate.coordinate.height - 1,
          }),
        );
        if (
          !previous ||
          certificate.value.previousCommitDigest !== previous.certificateDigest
        )
          return "chain_gap";
      }
      this.#commits.set(key, certificate);
      return "stored";
    });
  }

  async getCommit(input: {
    readonly policyDomainId: string;
    readonly slotId: string;
    readonly height: number;
  }): Promise<CollectiveAgreementCommitCertificateV1 | undefined> {
    await this.#tail;
    return this.#commits.get(commitKey(input));
  }

  async listCommits(input: {
    readonly policyDomainId: string;
    readonly slotId: string;
    readonly fromHeightExclusive: number;
    readonly maximumCount: number;
  }): Promise<readonly CollectiveAgreementCommitCertificateV1[]> {
    await this.#tail;
    if (
      !Number.isSafeInteger(input.maximumCount) ||
      input.maximumCount < 1 ||
      input.maximumCount > 1024
    )
      throw new RangeError("maximumCount is out of range");
    const commits: CollectiveAgreementCommitCertificateV1[] = [];
    for (let offset = 1; offset <= input.maximumCount; offset += 1) {
      const commit = this.#commits.get(
        commitKey({
          ...input,
          height: input.fromHeightExclusive + offset,
        }),
      );
      if (!commit) break;
      commits.push(commit);
    }
    return Object.freeze(commits);
  }

  #exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.#tail.then(operation, operation);
    this.#tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

function stateKey(input: {
  readonly policyDomainId: string;
  readonly slotId: string;
  readonly height: number;
}): string {
  return `${input.policyDomainId}\u0000${input.slotId}\u0000${input.height}`;
}

function voteKey(
  coordinate: {
    readonly policyDomainId: string;
    readonly slotId: string;
    readonly height: number;
    readonly round: number;
  },
  phase: string,
  voter: string,
): string {
  return `${stateKey(coordinate)}\u0000${coordinate.round}\u0000${phase}\u0000${voter}`;
}

function commitKey(input: {
  readonly policyDomainId: string;
  readonly slotId: string;
  readonly height: number;
}): string {
  return stateKey(input);
}
