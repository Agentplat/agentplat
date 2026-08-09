import { collectiveQuorumDigestV1 } from "./crypto.js";
import type {
  SparseAgreementMembershipV2,
  SparseAgreementValidatorV2,
} from "./sparse-agreement.js";

export interface PartialViewCommitteePolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly candidateCapacity: number;
  readonly committeeSize: number;
  readonly faultThreshold: number;
  readonly maximumValidatorsPerIndependenceGroup: number;
  readonly minimumWitnesses: number;
  readonly witnessFaultThreshold: number;
  readonly minimumWitnessIndependenceGroups: number;
  readonly maximumWitnesses: number;
  readonly maximumClaimsPerBatch: number;
  readonly maximumClaimEvidencePerCandidate: number;
  readonly maximumCommitAttempts: number;
  readonly policyDigest: string;
}

export interface PartialViewValidatorClaimV1 {
  readonly schemaVersion: 1;
  readonly epoch: number;
  readonly membershipConfigurationDigest: string;
  readonly viewSeedDigest: string;
  readonly purpose: "shard" | "reconciliation";
  readonly shardId: string;
  readonly validator: SparseAgreementValidatorV2;
  readonly sourcePeerId: string;
  readonly sourceInstanceId: string;
  readonly sourceKeyId: string;
  readonly sourceIndependenceGroupId: string;
  readonly membershipProofDigest: string;
  readonly rankDigest: string;
  readonly observedAtLogicalMs: number;
  readonly signature: string;
  readonly claimDigest: string;
}

export interface PartialViewCandidateV1 {
  readonly validator: SparseAgreementValidatorV2;
  readonly rankDigest: string;
  readonly claims: readonly PartialViewValidatorClaimV1[];
  readonly claimDigests: readonly string[];
  readonly sourcePeerIds: readonly string[];
  readonly sourceIndependenceGroupIds: readonly string[];
}

export interface PartialViewSnapshotV1 {
  readonly schemaVersion: 1;
  readonly epoch: number;
  readonly membershipConfigurationDigest: string;
  readonly viewSeedDigest: string;
  readonly purpose: "shard" | "reconciliation";
  readonly shardId: string;
  readonly policyDigest: string;
  readonly observedClaimCount: number;
  readonly candidates: readonly PartialViewCandidateV1[];
  readonly createdAtLogicalMs: number;
  readonly snapshotDigest: string;
}

export interface PartialViewSnapshotWitnessV1 {
  readonly schemaVersion: 1;
  readonly snapshotDigest: string;
  readonly witnessPeerId: string;
  readonly witnessInstanceId: string;
  readonly witnessKeyId: string;
  readonly witnessIndependenceGroupId: string;
  readonly witnessedAtLogicalMs: number;
  readonly signature: string;
  readonly witnessDigest: string;
}

export interface PartialViewConvergenceCertificateV1 {
  readonly schemaVersion: 1;
  readonly snapshot: PartialViewSnapshotV1;
  readonly witnesses: readonly PartialViewSnapshotWitnessV1[];
  readonly signerPeerIds: readonly string[];
  readonly witnessIndependenceGroupIds: readonly string[];
  readonly sparseMembership: SparseAgreementMembershipV2;
  readonly certifiedAtLogicalMs: number;
  readonly certificateDigest: string;
}

export interface PartialViewClaimVerificationPortV1 {
  verify(input: {
    readonly claim: PartialViewValidatorClaimV1;
    readonly claimMessageDigest: string;
  }): Promise<boolean>;
}

export interface PartialViewWitnessPortV1 {
  readonly localPeerId: string;
  readonly localInstanceId: string;
  readonly localKeyId: string;
  readonly localIndependenceGroupId: string;
  sign(messageDigest: string): Promise<string>;
  verify(input: {
    readonly witness: PartialViewSnapshotWitnessV1;
    readonly messageDigest: string;
  }): Promise<boolean>;
}

export interface PartialViewAgreementStateV1 {
  readonly schemaVersion: 1;
  readonly stateKey: string;
  readonly epoch: number;
  readonly membershipConfigurationDigest: string;
  readonly viewSeedDigest: string;
  readonly purpose: "shard" | "reconciliation";
  readonly shardId: string;
  readonly policyDigest: string;
  readonly revision: number;
  readonly observedClaimCount: number;
  readonly candidates: readonly PartialViewCandidateV1[];
  readonly snapshot: PartialViewSnapshotV1 | null;
  readonly witnesses: readonly PartialViewSnapshotWitnessV1[];
  readonly certificate: PartialViewConvergenceCertificateV1 | null;
  readonly logicalTimeHighWaterMs: number;
  readonly previousStateDigest: string | null;
  readonly stateDigest: string;
}

export interface PartialViewAgreementStoreV1 {
  load(stateKey: string): Promise<PartialViewAgreementStateV1 | null>;
  save(state: PartialViewAgreementStateV1, expectedRevision: number | null): Promise<boolean>;
}

export class InMemoryPartialViewAgreementStoreV1 implements PartialViewAgreementStoreV1 {
  readonly #states = new Map<string, PartialViewAgreementStateV1>();
  async load(stateKey: string): Promise<PartialViewAgreementStateV1 | null> {
    const state = this.#states.get(stateKey);
    return state ? immutable(state) : null;
  }
  async save(state: PartialViewAgreementStateV1, expectedRevision: number | null): Promise<boolean> {
    const current = this.#states.get(state.stateKey);
    if ((expectedRevision === null && (current !== undefined || state.revision !== 0)) ||
        (expectedRevision !== null && (!current || current.revision !== expectedRevision || state.revision !== expectedRevision + 1)))
      return false;
    this.#states.set(state.stateKey, immutable(state));
    return true;
  }
}

/**
 * Streaming, bounded-memory convergence for committee candidate views. It
 * admits proof-bearing claims, keeps only the best deterministic ranks, and
 * requires independent witnesses before exposing a sparse membership view.
 */
export class PartialViewAgreementRuntimeV1 {
  readonly #policy: PartialViewCommitteePolicyV1;
  readonly #store: PartialViewAgreementStoreV1;
  #policyVerification: Promise<PartialViewCommitteePolicyV1> | null = null;

  constructor(readonly options: {
    readonly stateKey: string;
    readonly epoch: number;
    readonly membershipConfigurationDigest: string;
    readonly viewSeedDigest: string;
    readonly purpose: "shard" | "reconciliation";
    readonly shardId: string;
    readonly policy: PartialViewCommitteePolicyV1;
    readonly claims: PartialViewClaimVerificationPortV1;
    readonly witnesses: PartialViewWitnessPortV1;
    readonly store?: PartialViewAgreementStoreV1;
    readonly crypto?: Crypto;
  }) {
    identifier(options.stateKey, "stateKey");
    integer(options.epoch, "epoch", 1, Number.MAX_SAFE_INTEGER);
    digest(options.membershipConfigurationDigest, "membershipConfigurationDigest");
    digest(options.viewSeedDigest, "viewSeedDigest");
    if (options.purpose !== "shard" && options.purpose !== "reconciliation")
      throw new TypeError("partial-view purpose is invalid");
    identifier(options.shardId, "shardId");
    this.#policy = validatePartialViewCommitteePolicyV1(options.policy);
    if (!options.claims || typeof options.claims.verify !== "function" ||
        !options.witnesses || typeof options.witnesses.sign !== "function" || typeof options.witnesses.verify !== "function")
      throw new TypeError("partial-view agreement verification ports are required");
    identifier(options.witnesses.localPeerId, "witnesses.localPeerId");
    identifier(options.witnesses.localInstanceId, "witnesses.localInstanceId");
    identifier(options.witnesses.localKeyId, "witnesses.localKeyId");
    identifier(options.witnesses.localIndependenceGroupId, "witnesses.localIndependenceGroupId");
    this.#store = options.store ?? new InMemoryPartialViewAgreementStoreV1();
  }

  async initialize(logicalTimeMs = 0): Promise<PartialViewAgreementStateV1> {
    await this.#verifyPolicy();
    integer(logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    const state = await this.#state({
      schemaVersion: 1,
      stateKey: this.options.stateKey,
      epoch: this.options.epoch,
      membershipConfigurationDigest: this.options.membershipConfigurationDigest,
      viewSeedDigest: this.options.viewSeedDigest,
      purpose: this.options.purpose,
      shardId: this.options.shardId,
      policyDigest: this.#policy.policyDigest,
      revision: 0,
      observedClaimCount: 0,
      candidates: [],
      snapshot: null,
      witnesses: [],
      certificate: null,
      logicalTimeHighWaterMs: logicalTimeMs,
      previousStateDigest: null,
    });
    if (!(await this.#store.save(state, null))) throw new Error("partial-view agreement already initialized");
    return state;
  }

  async ingestClaims(
    claims: readonly PartialViewValidatorClaimV1[],
    logicalTimeMs: number,
  ): Promise<PartialViewAgreementStateV1> {
    await this.#verifyPolicy();
    integer(logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    if (claims.length > this.#policy.maximumClaimsPerBatch)
      throw new RangeError("partial-view claim batch exceeds policy");
    const admitted: PartialViewValidatorClaimV1[] = [];
    for (const claim of claims) {
      try {
        const valid = await validateClaim(claim, this.options.crypto);
        if (!claimMatchesRuntime(valid, this.options) || valid.observedAtLogicalMs > logicalTimeMs) continue;
        if (!(await this.options.claims.verify({
          claim: valid,
          claimMessageDigest: await claimMessageDigest(valid, this.options.crypto),
        }))) continue;
        admitted.push(valid);
      } catch { continue; }
    }
    return this.#commit((current) => {
      if (logicalTimeMs < current.logicalTimeHighWaterMs)
        throw new Error("partial-view agreement logical time rollback");
      if (current.snapshot) throw new Error("partial-view snapshot is already sealed");
      const candidates = mergeCandidates(
        current.candidates,
        admitted,
        this.#policy.candidateCapacity,
        this.#policy.maximumClaimEvidencePerCandidate,
      );
      return {
        observedClaimCount: Math.min(Number.MAX_SAFE_INTEGER, current.observedClaimCount + admitted.length),
        candidates,
        logicalTimeHighWaterMs: Math.max(current.logicalTimeHighWaterMs, logicalTimeMs),
      };
    });
  }

  async sealSnapshot(logicalTimeMs: number): Promise<PartialViewSnapshotV1> {
    await this.#verifyPolicy();
    integer(logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    let sealed: PartialViewSnapshotV1 | null = null;
    await this.#commit(async (current) => {
      if (logicalTimeMs < current.logicalTimeHighWaterMs)
        throw new Error("partial-view agreement logical time rollback");
      if (current.snapshot) { sealed = current.snapshot; return {}; }
      const selected = selectIndependentCandidates(current.candidates, this.#policy);
      if (selected.length < this.#policy.committeeSize)
        throw new Error("partial-view candidate coverage is insufficient");
      const body = {
        schemaVersion: 1 as const,
        epoch: current.epoch,
        membershipConfigurationDigest: current.membershipConfigurationDigest,
        viewSeedDigest: current.viewSeedDigest,
        purpose: current.purpose,
        shardId: current.shardId,
        policyDigest: current.policyDigest,
        observedClaimCount: current.observedClaimCount,
        candidates: selected,
        createdAtLogicalMs: logicalTimeMs,
      };
      sealed = immutable({
        ...body,
        snapshotDigest: await collectiveQuorumDigestV1({ domain: "partial-view-snapshot-v1", body }, this.options.crypto),
      });
      return { snapshot: sealed, logicalTimeHighWaterMs: Math.max(current.logicalTimeHighWaterMs, logicalTimeMs) };
    });
    return sealed!;
  }

  async createLocalWitness(logicalTimeMs: number): Promise<PartialViewSnapshotWitnessV1> {
    await this.#verifyPolicy();
    integer(logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    const state = await this.load();
    if (logicalTimeMs < state.logicalTimeHighWaterMs)
      throw new Error("partial-view agreement logical time rollback");
    if (!state.snapshot) throw new Error("partial-view snapshot is not sealed");
    const messageDigest = await witnessMessageDigest(state.snapshot.snapshotDigest, this.options.crypto);
    const body = {
      schemaVersion: 1 as const,
      snapshotDigest: state.snapshot.snapshotDigest,
      witnessPeerId: this.options.witnesses.localPeerId,
      witnessInstanceId: this.options.witnesses.localInstanceId,
      witnessKeyId: this.options.witnesses.localKeyId,
      witnessIndependenceGroupId: this.options.witnesses.localIndependenceGroupId,
      witnessedAtLogicalMs: logicalTimeMs,
      signature: await this.options.witnesses.sign(messageDigest),
    };
    const witness = immutable({
      ...body,
      witnessDigest: await collectiveQuorumDigestV1({ domain: "partial-view-witness-v1", body }, this.options.crypto),
    });
    if (await this.ingestWitness(witness, logicalTimeMs) === "rejected")
      throw new Error("local partial-view witness was not retained");
    return witness;
  }

  async ingestWitness(
    witness: PartialViewSnapshotWitnessV1,
    logicalTimeMs: number,
  ): Promise<"accepted" | "duplicate" | "rejected"> {
    await this.#verifyPolicy();
    integer(logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    const state = await this.load();
    if (logicalTimeMs < state.logicalTimeHighWaterMs) return "rejected";
    if (!state.snapshot || witness.snapshotDigest !== state.snapshot.snapshotDigest || witness.witnessedAtLogicalMs > logicalTimeMs)
      return "rejected";
    if (state.witnesses.some((item) => item.witnessDigest === witness.witnessDigest)) return "duplicate";
    try {
      const rebuilt = await validateWitness(witness, this.options.crypto);
      if (!(await this.options.witnesses.verify({
        witness: rebuilt,
        messageDigest: await witnessMessageDigest(rebuilt.snapshotDigest, this.options.crypto),
      }))) return "rejected";
    } catch { return "rejected"; }
    if (state.witnesses.some((item) => item.witnessPeerId === witness.witnessPeerId)) return "rejected";
    const committed = await this.#commit((current) => {
      if (logicalTimeMs < current.logicalTimeHighWaterMs) return {};
      if (current.certificate) return {};
      if (current.witnesses.some((item) => item.witnessDigest === witness.witnessDigest)) return {};
      if (current.witnesses.some((item) => item.witnessPeerId === witness.witnessPeerId)) return {};
      return {
        witnesses: retainWitnesses([...current.witnesses, witness], this.#policy.maximumWitnesses),
        logicalTimeHighWaterMs: logicalTimeMs,
      };
    });
    return committed.witnesses.some((item) => item.witnessDigest === witness.witnessDigest)
      ? "accepted"
      : "rejected";
  }

  async certify(logicalTimeMs: number): Promise<PartialViewConvergenceCertificateV1 | null> {
    await this.#verifyPolicy();
    integer(logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    let output: PartialViewConvergenceCertificateV1 | null = null;
    await this.#commit(async (current) => {
      if (logicalTimeMs < current.logicalTimeHighWaterMs)
        throw new Error("partial-view agreement logical time rollback");
      if (current.certificate) { output = current.certificate; return {}; }
      if (!current.snapshot || current.witnesses.length < this.#policy.minimumWitnesses) return {};
      const groups = [...new Set(current.witnesses.map((item) => item.witnessIndependenceGroupId))].sort();
      if (groups.length < this.#policy.minimumWitnessIndependenceGroups) return {};
      const validators = current.snapshot.candidates.map((item) => item.validator)
        .sort((left, right) => left.peerId.localeCompare(right.peerId));
      const selectionSeedDigest = await collectiveQuorumDigestV1({
        domain: "partial-view-selection-seed-v1",
        viewSeedDigest: current.viewSeedDigest,
        snapshotDigest: current.snapshot.snapshotDigest,
      }, this.options.crypto);
      const sparseMembership: SparseAgreementMembershipV2 = immutable({
        schemaVersion: 2,
        epoch: current.epoch,
        configurationDigest: current.membershipConfigurationDigest,
        selectionSeedDigest,
        validators,
      });
      const body = {
        schemaVersion: 1 as const,
        snapshot: current.snapshot,
        witnesses: current.witnesses,
        signerPeerIds: current.witnesses.map((item) => item.witnessPeerId).sort(),
        witnessIndependenceGroupIds: groups,
        sparseMembership,
        certifiedAtLogicalMs: logicalTimeMs,
      };
      output = immutable({
        ...body,
        certificateDigest: await collectiveQuorumDigestV1({ domain: "partial-view-convergence-certificate-v1", body }, this.options.crypto),
      });
      return { certificate: output, logicalTimeHighWaterMs: Math.max(current.logicalTimeHighWaterMs, logicalTimeMs) };
    });
    return output;
  }

  async load(): Promise<PartialViewAgreementStateV1> {
    await this.#verifyPolicy();
    const state = await this.#store.load(this.options.stateKey);
    if (!state) throw new Error("partial-view agreement is not initialized");
    if (state.schemaVersion !== 1 || state.stateKey !== this.options.stateKey ||
        state.epoch !== this.options.epoch ||
        state.membershipConfigurationDigest !== this.options.membershipConfigurationDigest ||
        state.viewSeedDigest !== this.options.viewSeedDigest ||
        state.purpose !== this.options.purpose || state.shardId !== this.options.shardId ||
        state.policyDigest !== this.#policy.policyDigest)
      throw new TypeError("partial-view agreement state binding is invalid");
    integer(state.revision, "revision", 0, Number.MAX_SAFE_INTEGER);
    integer(state.observedClaimCount, "observedClaimCount", 0, Number.MAX_SAFE_INTEGER);
    integer(state.logicalTimeHighWaterMs, "logicalTimeHighWaterMs", 0, Number.MAX_SAFE_INTEGER);
    if ((state.revision === 0) !== (state.previousStateDigest === null))
      throw new TypeError("partial-view agreement state lineage is invalid");
    if (state.previousStateDigest !== null) digest(state.previousStateDigest, "previousStateDigest");
    if (state.candidates.length > this.#policy.candidateCapacity || state.witnesses.length > this.#policy.maximumWitnesses)
      throw new RangeError("partial-view agreement durable capacity exceeded");
    if ((!state.snapshot && (state.witnesses.length > 0 || state.certificate)) ||
        new Set(state.witnesses.map((item) => item.witnessPeerId)).size !== state.witnesses.length ||
        (state.snapshot && state.witnesses.some((item) => item.snapshotDigest !== state.snapshot!.snapshotDigest)))
      throw new TypeError("partial-view agreement durable witness binding is invalid");
    for (const candidate of state.candidates)
      await this.#validateCandidate(candidate);
    for (const witness of state.witnesses) {
      const rebuilt = await validateWitness(witness, this.options.crypto);
      if (!(await this.options.witnesses.verify({
        witness: rebuilt,
        messageDigest: await witnessMessageDigest(rebuilt.snapshotDigest, this.options.crypto),
      }))) throw new TypeError("partial-view persisted witness is invalid");
    }
    if (state.snapshot) await this.#validateSnapshot(state.snapshot, state);
    if (state.certificate) await this.#validateCertificate(state.certificate, state);
    const { stateDigest, ...body } = state;
    if (await collectiveQuorumDigestV1({ domain: "partial-view-agreement-state-v1", body }, this.options.crypto) !== stateDigest)
      throw new TypeError("partial-view agreement state digest is invalid");
    return state;
  }

  async #validateCandidate(candidate: PartialViewCandidateV1): Promise<void> {
    validator(candidate.validator);
    digest(candidate.rankDigest, "candidate.rankDigest");
    if (!Array.isArray(candidate.claims) || candidate.claims.length === 0 ||
        candidate.claims.length > this.#policy.maximumClaimEvidencePerCandidate)
      throw new RangeError("partial-view candidate evidence capacity is invalid");
    const verified: PartialViewValidatorClaimV1[] = [];
    for (const claim of candidate.claims) {
      const value = await validateClaim(claim, this.options.crypto);
      if (!claimMatchesRuntime(value, this.options) ||
          !sameValidator(value.validator, candidate.validator) ||
          value.rankDigest !== candidate.rankDigest ||
          !(await this.options.claims.verify({
            claim: value,
            claimMessageDigest: await claimMessageDigest(value, this.options.crypto),
          }))) throw new TypeError("partial-view persisted candidate claim is invalid");
      verified.push(value);
    }
    const claimDigests = verified.map((item) => item.claimDigest).sort();
    const sourcePeerIds = [...new Set(verified.map((item) => item.sourcePeerId))].sort();
    const sourceGroups = [...new Set(verified.map((item) => item.sourceIndependenceGroupId))].sort();
    if (!sameStrings(candidate.claimDigests, claimDigests) ||
        !sameStrings(candidate.sourcePeerIds, sourcePeerIds) ||
        !sameStrings(candidate.sourceIndependenceGroupIds, sourceGroups))
      throw new TypeError("partial-view persisted candidate evidence index is invalid");
  }

  async #validateSnapshot(snapshot: PartialViewSnapshotV1, state: PartialViewAgreementStateV1): Promise<void> {
    const { snapshotDigest, ...body } = snapshot;
    if (snapshot.schemaVersion !== 1 || snapshot.epoch !== state.epoch ||
        snapshot.membershipConfigurationDigest !== state.membershipConfigurationDigest ||
        snapshot.viewSeedDigest !== state.viewSeedDigest || snapshot.purpose !== state.purpose ||
        snapshot.shardId !== state.shardId || snapshot.policyDigest !== state.policyDigest ||
        snapshot.candidates.length !== this.#policy.committeeSize ||
        snapshot.createdAtLogicalMs > state.logicalTimeHighWaterMs ||
        await collectiveQuorumDigestV1({ domain: "partial-view-snapshot-v1", body }, this.options.crypto) !== snapshotDigest)
      throw new TypeError("partial-view persisted snapshot is invalid");
    for (const candidate of snapshot.candidates) await this.#validateCandidate(candidate);
    const expected = selectIndependentCandidates(state.candidates, this.#policy);
    if (!sameStrings(snapshot.candidates.map((item) => item.rankDigest), expected.map((item) => item.rankDigest)))
      throw new TypeError("partial-view persisted snapshot selection is invalid");
  }

  async #validateCertificate(
    certificate: PartialViewConvergenceCertificateV1,
    state: PartialViewAgreementStateV1,
  ): Promise<void> {
    if (!state.snapshot || certificate.snapshot.snapshotDigest !== state.snapshot.snapshotDigest ||
        certificate.certifiedAtLogicalMs > state.logicalTimeHighWaterMs ||
        certificate.witnesses.length < this.#policy.minimumWitnesses ||
        !sameStrings(certificate.witnesses.map((item) => item.witnessDigest), state.witnesses.map((item) => item.witnessDigest)) ||
        !sameStrings(certificate.signerPeerIds, certificate.witnesses.map((item) => item.witnessPeerId).sort()) ||
        !sameStrings(certificate.witnessIndependenceGroupIds, [...new Set(certificate.witnesses.map((item) => item.witnessIndependenceGroupId))].sort()) ||
        certificate.witnessIndependenceGroupIds.length < this.#policy.minimumWitnessIndependenceGroups)
      throw new TypeError("partial-view persisted certificate binding is invalid");
    const expectedSelectionSeed = await collectiveQuorumDigestV1({
      domain: "partial-view-selection-seed-v1",
      viewSeedDigest: state.viewSeedDigest,
      snapshotDigest: state.snapshot.snapshotDigest,
    }, this.options.crypto);
    const expectedValidators = state.snapshot.candidates.map((item) => item.validator)
      .sort((left, right) => left.peerId.localeCompare(right.peerId));
    if (certificate.sparseMembership.schemaVersion !== 2 ||
        certificate.sparseMembership.epoch !== state.epoch ||
        certificate.sparseMembership.configurationDigest !== state.membershipConfigurationDigest ||
        certificate.sparseMembership.selectionSeedDigest !== expectedSelectionSeed ||
        certificate.sparseMembership.validators.length !== expectedValidators.length ||
        certificate.sparseMembership.validators.some((item, index) => !sameValidator(item, expectedValidators[index]!)))
      throw new TypeError("partial-view persisted sparse membership is invalid");
    const { certificateDigest, ...body } = certificate;
    if (await collectiveQuorumDigestV1({ domain: "partial-view-convergence-certificate-v1", body }, this.options.crypto) !== certificateDigest)
      throw new TypeError("partial-view persisted certificate digest is invalid");
  }

  async #commit(
    reduce: (state: PartialViewAgreementStateV1) => Partial<PartialViewAgreementStateV1> | Promise<Partial<PartialViewAgreementStateV1>>,
  ): Promise<PartialViewAgreementStateV1> {
    for (let attempt = 0; attempt < this.#policy.maximumCommitAttempts; attempt += 1) {
      const current = await this.load();
      const patch = await reduce(current);
      if (Object.keys(patch).length === 0) return current;
      const next = await this.#state({
        ...current,
        ...patch,
        revision: current.revision + 1,
        previousStateDigest: current.stateDigest,
      });
      if (await this.#store.save(next, current.revision)) return next;
    }
    throw new Error("partial-view agreement commit contention exhausted");
  }

  async #state(input: Omit<PartialViewAgreementStateV1, "stateDigest">): Promise<PartialViewAgreementStateV1> {
    const { stateDigest: _stale, ...body } = input as PartialViewAgreementStateV1;
    return immutable({
      ...body,
      stateDigest: await collectiveQuorumDigestV1({ domain: "partial-view-agreement-state-v1", body }, this.options.crypto),
    });
  }

  #verifyPolicy(): Promise<PartialViewCommitteePolicyV1> {
    this.#policyVerification ??= verifyPartialViewCommitteePolicyV1(this.#policy, this.options.crypto);
    return this.#policyVerification;
  }
}

export async function createPartialViewCommitteePolicyV1(
  input: Omit<PartialViewCommitteePolicyV1, "schemaVersion" | "policyDigest">,
  crypto?: Crypto,
): Promise<PartialViewCommitteePolicyV1> {
  const provisional = { schemaVersion: 1 as const, ...input, policyDigest: `sha256:${"0".repeat(64)}` };
  validatePartialViewCommitteePolicyV1(provisional);
  const { policyDigest: _digest, ...body } = provisional;
  return immutable({ ...body, policyDigest: await collectiveQuorumDigestV1({ domain: "partial-view-committee-policy-v1", body }, crypto) });
}

export function validatePartialViewCommitteePolicyV1(input: PartialViewCommitteePolicyV1): PartialViewCommitteePolicyV1 {
  if (!input || input.schemaVersion !== 1) throw new TypeError("partial-view committee policy schema is invalid");
  identifier(input.policyId, "policyId"); integer(input.policyVersion, "policyVersion", 1, Number.MAX_SAFE_INTEGER);
  integer(input.committeeSize, "committeeSize", 4, 100_000); integer(input.faultThreshold, "faultThreshold", 1, 33_333);
  if (input.committeeSize < 3 * input.faultThreshold + 1) throw new RangeError("partial-view committee fault model is invalid");
  integer(input.candidateCapacity, "candidateCapacity", input.committeeSize, 1_000_000);
  integer(input.maximumValidatorsPerIndependenceGroup, "maximumValidatorsPerIndependenceGroup", 1, input.committeeSize);
  integer(input.witnessFaultThreshold, "witnessFaultThreshold", 1, 33_333);
  integer(input.minimumWitnesses, "minimumWitnesses", 2 * input.witnessFaultThreshold + 1, 100_000);
  integer(input.minimumWitnessIndependenceGroups, "minimumWitnessIndependenceGroups", input.witnessFaultThreshold + 1, input.minimumWitnesses);
  integer(input.maximumWitnesses, "maximumWitnesses", input.minimumWitnesses, 100_000);
  integer(input.maximumClaimsPerBatch, "maximumClaimsPerBatch", 1, 100_000);
  integer(input.maximumClaimEvidencePerCandidate, "maximumClaimEvidencePerCandidate", 1, 100_000);
  integer(input.maximumCommitAttempts, "maximumCommitAttempts", 1, 64); digest(input.policyDigest, "policyDigest");
  return immutable(input);
}

export async function verifyPartialViewCommitteePolicyV1(input: PartialViewCommitteePolicyV1, crypto?: Crypto): Promise<PartialViewCommitteePolicyV1> {
  validatePartialViewCommitteePolicyV1(input);
  const { schemaVersion: _version, policyDigest, ...body } = input;
  const rebuilt = await createPartialViewCommitteePolicyV1(body, crypto);
  if (rebuilt.policyDigest !== policyDigest) throw new TypeError("partial-view committee policy digest is invalid");
  return rebuilt;
}

export async function createPartialViewValidatorClaimV1(
  input: Omit<PartialViewValidatorClaimV1, "schemaVersion" | "rankDigest" | "claimDigest" | "signature"> & {
    readonly sign: (messageDigest: string) => Promise<string>;
  },
  crypto?: Crypto,
): Promise<PartialViewValidatorClaimV1> {
  const { sign, ...claim } = input;
  const rankDigest = await validatorRank(claim, crypto);
  const body = { schemaVersion: 1 as const, ...claim, rankDigest };
  const signature = await sign(await collectiveQuorumDigestV1({ domain: "partial-view-claim-message-v1", body }, crypto));
  const signed = { ...body, signature };
  return validateClaim(immutable({
    ...signed,
    claimDigest: await collectiveQuorumDigestV1({ domain: "partial-view-validator-claim-v1", body: signed }, crypto),
  }), crypto);
}

function mergeCandidates(
  current: readonly PartialViewCandidateV1[],
  claims: readonly PartialViewValidatorClaimV1[],
  capacity: number,
  evidenceCapacity: number,
): readonly PartialViewCandidateV1[] {
  const byPeer = new Map(current.map((item) => [item.validator.peerId, item]));
  for (const claim of claims) {
    const prior = byPeer.get(claim.validator.peerId);
    if (prior && (prior.validator.instanceId !== claim.validator.instanceId || prior.validator.keyId !== claim.validator.keyId || prior.rankDigest !== claim.rankDigest))
      continue;
    const retainedClaims = [...new Map([
      ...(prior?.claims ?? []),
      claim,
    ].map((item) => [item.claimDigest, item])).values()]
      .sort((left, right) => left.claimDigest.localeCompare(right.claimDigest))
      .slice(0, evidenceCapacity);
    byPeer.set(claim.validator.peerId, immutable({
      validator: claim.validator,
      rankDigest: claim.rankDigest,
      claims: retainedClaims,
      claimDigests: retainedClaims.map((item) => item.claimDigest),
      sourcePeerIds: [...new Set(retainedClaims.map((item) => item.sourcePeerId))].sort(),
      sourceIndependenceGroupIds: [...new Set(retainedClaims.map((item) => item.sourceIndependenceGroupId))].sort(),
    }));
  }
  return [...byPeer.values()].sort((left, right) => left.rankDigest.localeCompare(right.rankDigest) || left.validator.peerId.localeCompare(right.validator.peerId)).slice(0, capacity);
}

function retainWitnesses(
  witnesses: readonly PartialViewSnapshotWitnessV1[],
  maximum: number,
): readonly PartialViewSnapshotWitnessV1[] {
  return [...witnesses]
    .sort((left, right) => left.witnessDigest.localeCompare(right.witnessDigest))
    .slice(0, maximum)
    .sort((left, right) => left.witnessPeerId.localeCompare(right.witnessPeerId));
}

function selectIndependentCandidates(
  candidates: readonly PartialViewCandidateV1[],
  policy: PartialViewCommitteePolicyV1,
): readonly PartialViewCandidateV1[] {
  const selected: PartialViewCandidateV1[] = [];
  const groups = new Map<string, number>();
  for (const candidate of candidates) {
    const group = candidate.validator.independenceGroupId;
    if ((groups.get(group) ?? 0) >= policy.maximumValidatorsPerIndependenceGroup) continue;
    selected.push(candidate); groups.set(group, (groups.get(group) ?? 0) + 1);
    if (selected.length === policy.committeeSize) break;
  }
  return selected.sort((left, right) => left.validator.peerId.localeCompare(right.validator.peerId));
}

async function validatorRank(input: Pick<PartialViewValidatorClaimV1, "epoch" | "membershipConfigurationDigest" | "viewSeedDigest" | "purpose" | "shardId" | "validator">, crypto?: Crypto): Promise<string> {
  return collectiveQuorumDigestV1({
    domain: "partial-view-validator-rank-v1",
    epoch: input.epoch, membershipConfigurationDigest: input.membershipConfigurationDigest,
    viewSeedDigest: input.viewSeedDigest, purpose: input.purpose, shardId: input.shardId,
    peerId: input.validator.peerId, instanceId: input.validator.instanceId,
    eligibilityDigest: input.validator.eligibilityDigest,
  }, crypto);
}

async function validateClaim(input: PartialViewValidatorClaimV1, crypto?: Crypto): Promise<PartialViewValidatorClaimV1> {
  if (!input || input.schemaVersion !== 1) throw new TypeError("partial-view validator claim schema is invalid");
  integer(input.epoch, "epoch", 1, Number.MAX_SAFE_INTEGER); digest(input.membershipConfigurationDigest, "membershipConfigurationDigest");
  digest(input.viewSeedDigest, "viewSeedDigest"); identifier(input.shardId, "shardId");
  validator(input.validator); identifier(input.sourcePeerId, "sourcePeerId");
  identifier(input.sourceInstanceId, "sourceInstanceId"); identifier(input.sourceKeyId, "sourceKeyId");
  identifier(input.sourceIndependenceGroupId, "sourceIndependenceGroupId");
  digest(input.membershipProofDigest, "membershipProofDigest"); digest(input.rankDigest, "rankDigest");
  integer(input.observedAtLogicalMs, "observedAtLogicalMs", 0, Number.MAX_SAFE_INTEGER); token(input.signature, "signature"); digest(input.claimDigest, "claimDigest");
  if (await validatorRank(input, crypto) !== input.rankDigest) throw new TypeError("partial-view validator rank is invalid");
  const { claimDigest, ...body } = input;
  if (await collectiveQuorumDigestV1({ domain: "partial-view-validator-claim-v1", body }, crypto) !== claimDigest)
    throw new TypeError("partial-view validator claim digest is invalid");
  return immutable(input);
}

async function claimMessageDigest(claim: PartialViewValidatorClaimV1, crypto?: Crypto): Promise<string> {
  const { claimDigest: _claim, signature: _signature, ...body } = claim;
  return collectiveQuorumDigestV1({ domain: "partial-view-claim-message-v1", body }, crypto);
}

async function validateWitness(input: PartialViewSnapshotWitnessV1, crypto?: Crypto): Promise<PartialViewSnapshotWitnessV1> {
  if (!input || input.schemaVersion !== 1) throw new TypeError("partial-view witness schema is invalid");
  digest(input.snapshotDigest, "snapshotDigest"); identifier(input.witnessPeerId, "witnessPeerId"); identifier(input.witnessInstanceId, "witnessInstanceId");
  identifier(input.witnessKeyId, "witnessKeyId"); identifier(input.witnessIndependenceGroupId, "witnessIndependenceGroupId");
  integer(input.witnessedAtLogicalMs, "witnessedAtLogicalMs", 0, Number.MAX_SAFE_INTEGER); token(input.signature, "signature"); digest(input.witnessDigest, "witnessDigest");
  const { witnessDigest, ...body } = input;
  if (await collectiveQuorumDigestV1({ domain: "partial-view-witness-v1", body }, crypto) !== witnessDigest)
    throw new TypeError("partial-view witness digest is invalid");
  return immutable(input);
}

function claimMatchesRuntime(claim: PartialViewValidatorClaimV1, runtime: {
  readonly epoch: number; readonly membershipConfigurationDigest: string; readonly viewSeedDigest: string;
  readonly purpose: "shard" | "reconciliation"; readonly shardId: string;
}): boolean {
  return claim.epoch === runtime.epoch && claim.membershipConfigurationDigest === runtime.membershipConfigurationDigest &&
    claim.viewSeedDigest === runtime.viewSeedDigest && claim.purpose === runtime.purpose && claim.shardId === runtime.shardId;
}

async function witnessMessageDigest(snapshotDigest: string, crypto?: Crypto): Promise<string> {
  return collectiveQuorumDigestV1({ domain: "partial-view-snapshot-witness-message-v1", snapshotDigest }, crypto);
}

function validator(input: SparseAgreementValidatorV2): void {
  if (!input) throw new TypeError("partial-view validator is required");
  identifier(input.peerId, "validator.peerId"); identifier(input.instanceId, "validator.instanceId"); identifier(input.keyId, "validator.keyId");
  identifier(input.independenceGroupId, "validator.independenceGroupId"); digest(input.eligibilityDigest, "validator.eligibilityDigest");
}
function sameValidator(left: SparseAgreementValidatorV2, right: SparseAgreementValidatorV2): boolean {
  return left.peerId === right.peerId && left.instanceId === right.instanceId &&
    left.keyId === right.keyId && left.independenceGroupId === right.independenceGroupId &&
    left.eligibilityDigest === right.eligibilityDigest;
}
function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}
function identifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u.test(value)) throw new TypeError(`${label} is invalid`);
}
function digest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value)) throw new TypeError(`${label} is invalid`);
}
function token(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 65_536) throw new TypeError(`${label} is invalid`);
}
function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) throw new RangeError(`${label} is invalid`);
  return value as number;
}
function immutable<T>(value: T): T {
  const clone = structuredClone(value);
  const freeze = (item: unknown): void => {
    if (!item || typeof item !== "object" || Object.isFrozen(item)) return;
    for (const child of Object.values(item as Record<string, unknown>)) freeze(child);
    Object.freeze(item);
  };
  freeze(clone); return clone;
}
