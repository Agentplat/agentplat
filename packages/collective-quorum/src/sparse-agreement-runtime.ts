import { collectiveQuorumDigestV1 } from "./crypto.js";
import {
  createSparseAgreementShareV2,
  createSparseCommitteeCertificateV2,
  createSparseFinalityCertificateV2,
  selectSparseCommitteeV2,
  sparseShareMessageDigestV2,
  validateSparseCommitteeAssignmentDigestV2,
  validateSparseCommitteeCertificateV2,
  type SparseAggregateSignaturePortV2,
  type SparseAgreementMembershipV2,
  type SparseAgreementShareV2,
  type SparseAgreementValidatorV2,
  type SparseCommitteeAssignmentV2,
  type SparseCommitteeCertificateV2,
  type SparseCommitteePolicyV2,
  type SparseFinalityCertificateV2,
} from "./sparse-agreement.js";

export interface SparseAgreementCoordinateV1 {
  readonly schemaVersion: 1;
  readonly agreementId: string;
  readonly height: number;
  readonly round: number;
  readonly view: number;
  readonly purpose: "shard" | "reconciliation";
  readonly shardId: string;
  readonly epoch: number;
  readonly membershipConfigurationDigest: string;
  readonly coordinateDigest: string;
}

export interface SparseAgreementEquivocationEvidenceV1 {
  readonly schemaVersion: 1;
  readonly coordinateDigest: string;
  readonly committeeAssignmentDigest: string;
  readonly phase: SparseAgreementShareV2["phase"];
  readonly signerPeerId: string;
  readonly firstShare: SparseAgreementShareV2;
  readonly conflictingShare: SparseAgreementShareV2;
  readonly evidenceDigest: string;
}

export interface SparseAgreementRoundStateV1 {
  readonly schemaVersion: 1;
  readonly runtimeId: string;
  readonly revision: number;
  readonly status: "idle" | "preparing" | "committing" | "certified" | "view-change-required";
  readonly coordinate: SparseAgreementCoordinateV1 | null;
  readonly assignment: SparseCommitteeAssignmentV2 | null;
  readonly proposalDigest: string | null;
  readonly valueDigest: string | null;
  readonly viewDeadlineLogicalMs: number | null;
  readonly shares: readonly SparseAgreementShareV2[];
  readonly prepareCertificate: SparseCommitteeCertificateV2 | null;
  readonly finalCertificate: SparseCommitteeCertificateV2 | null;
  readonly equivocations: readonly SparseAgreementEquivocationEvidenceV1[];
  readonly logicalTimeHighWaterMs: number;
  readonly previousStateDigest: string | null;
  readonly stateDigest: string;
}

export interface SparseAgreementRoundStoreV1 {
  load(runtimeId: string): Promise<SparseAgreementRoundStateV1 | null>;
  save(state: SparseAgreementRoundStateV1, expectedRevision: number | null): Promise<boolean>;
}

export interface SparseAgreementLocalSignerV1 {
  readonly peerId: string;
  readonly instanceId: string;
  readonly keyId: string;
  sign(messageDigest: string): Promise<string>;
}

export interface SparseAgreementRoundTransportV1 {
  publishShare(input: {
    readonly coordinate: SparseAgreementCoordinateV1;
    readonly assignment: SparseCommitteeAssignmentV2;
    readonly share: SparseAgreementShareV2;
  }): Promise<void>;
  publishCertificate(input: {
    readonly coordinate: SparseAgreementCoordinateV1;
    readonly certificate: SparseCommitteeCertificateV2;
  }): Promise<void>;
  publishEquivocation(input: SparseAgreementEquivocationEvidenceV1): Promise<void>;
}

export interface SparseAgreementAdvanceResultV1 {
  readonly state: SparseAgreementRoundStateV1;
  readonly emittedShare: SparseAgreementShareV2 | null;
  readonly emittedCertificate: SparseCommitteeCertificateV2 | null;
}

export class InMemorySparseAgreementRoundStoreV1 implements SparseAgreementRoundStoreV1 {
  readonly #states = new Map<string, SparseAgreementRoundStateV1>();

  async load(runtimeId: string): Promise<SparseAgreementRoundStateV1 | null> {
    const state = this.#states.get(runtimeId);
    return state ? immutable(state) : null;
  }

  async save(state: SparseAgreementRoundStateV1, expectedRevision: number | null): Promise<boolean> {
    const current = this.#states.get(state.runtimeId);
    if (
      (expectedRevision === null && (current !== undefined || state.revision !== 0)) ||
      (expectedRevision !== null && (!current || current.revision !== expectedRevision || state.revision !== expectedRevision + 1))
    ) return false;
    this.#states.set(state.runtimeId, immutable(state));
    return true;
  }
}

/**
 * Stateful round/view driver for a selected sparse committee. It verifies
 * every share at ingress, locks a shard after a prepare certificate, emits a
 * commit or reconciliation certificate, and records signed equivocations.
 */
export class SparseAgreementRoundRuntimeV1 {
  readonly #store: SparseAgreementRoundStoreV1;
  readonly #maximumCommitAttempts: number;
  readonly #maximumEquivocations: number;

  constructor(readonly options: {
    readonly runtimeId: string;
    readonly membership: SparseAgreementMembershipV2;
    readonly policy: SparseCommitteePolicyV2;
    readonly signatures: SparseAggregateSignaturePortV2;
    readonly signer: SparseAgreementLocalSignerV1;
    readonly transport: SparseAgreementRoundTransportV1;
    readonly store?: SparseAgreementRoundStoreV1;
    readonly maximumCommitAttempts?: number;
    readonly maximumEquivocations?: number;
    readonly crypto?: Crypto;
  }) {
    identifier(options.runtimeId, "runtimeId");
    if (!options.signatures || !options.signer || !options.transport)
      throw new TypeError("sparse agreement runtime ports are required");
    identifier(options.signer.peerId, "signer.peerId");
    identifier(options.signer.instanceId, "signer.instanceId");
    identifier(options.signer.keyId, "signer.keyId");
    this.#store = options.store ?? new InMemorySparseAgreementRoundStoreV1();
    this.#maximumCommitAttempts = integer(options.maximumCommitAttempts ?? 8, "maximumCommitAttempts", 1, 64);
    this.#maximumEquivocations = integer(options.maximumEquivocations ?? 4_096, "maximumEquivocations", 1, 100_000);
  }

  async initialize(logicalTimeMs = 0): Promise<SparseAgreementRoundStateV1> {
    integer(logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    const state = await this.#createState({
      schemaVersion: 1,
      runtimeId: this.options.runtimeId,
      revision: 0,
      status: "idle",
      coordinate: null,
      assignment: null,
      proposalDigest: null,
      valueDigest: null,
      viewDeadlineLogicalMs: null,
      shares: [],
      prepareCertificate: null,
      finalCertificate: null,
      equivocations: [],
      logicalTimeHighWaterMs: logicalTimeMs,
      previousStateDigest: null,
    });
    if (!(await this.#store.save(state, null))) throw new Error("sparse agreement runtime already initialized");
    return state;
  }

  async load(): Promise<SparseAgreementRoundStateV1> {
    const state = await this.#store.load(this.options.runtimeId);
    if (!state) throw new Error("sparse agreement runtime is not initialized");
    await validateState(state, this.options.crypto);
    if (state.equivocations.length > this.#maximumEquivocations)
      throw new RangeError("sparse agreement equivocation capacity exceeded");
    if (state.coordinate && state.assignment) {
      const rebuiltCoordinate = await createCoordinate({
        agreementId: state.coordinate.agreementId,
        height: state.coordinate.height,
        round: state.coordinate.round,
        view: state.coordinate.view,
        purpose: state.coordinate.purpose,
        shardId: state.coordinate.shardId,
        epoch: state.coordinate.epoch,
        membershipConfigurationDigest: state.coordinate.membershipConfigurationDigest,
      }, this.options.crypto);
      if (!sameCoordinate(rebuiltCoordinate, state.coordinate) ||
          state.assignment.purpose !== state.coordinate.purpose ||
          state.assignment.shardId !== state.coordinate.shardId ||
          state.assignment.epoch !== state.coordinate.epoch ||
          state.assignment.membershipConfigurationDigest !== state.coordinate.membershipConfigurationDigest)
        throw new TypeError("sparse agreement persisted coordinate binding is invalid");
      for (const share of state.shares)
        if (share.coordinateDigest !== state.coordinate.coordinateDigest ||
            share.proposalDigest !== state.proposalDigest ||
            share.valueDigest !== state.valueDigest ||
            !(await verifyPersistedShare(share, state.assignment, this.options.signatures, this.options.crypto)))
          throw new TypeError("sparse agreement persisted share is invalid");
      for (const certificate of [state.prepareCertificate, state.finalCertificate])
        if (certificate && (certificate.assignment.assignmentDigest !== state.assignment.assignmentDigest ||
          certificate.proposalDigest !== state.proposalDigest ||
          certificate.valueDigest !== state.valueDigest ||
          (certificate === state.prepareCertificate && certificate.phase !== "prepare") ||
          (certificate === state.finalCertificate && (
            certificate.phase !== (state.coordinate.purpose === "shard" ? "commit" : "reconcile") ||
            certificate.coordinateDigest !== state.coordinate.coordinateDigest
          )) || !(await validateSparseCommitteeCertificateV2({
          certificate,
          membership: this.options.membership,
          policy: this.options.policy,
          signatures: this.options.signatures,
          crypto: this.options.crypto,
        })))) throw new TypeError("sparse agreement persisted certificate is invalid");
    }
    return state;
  }

  async startView(input: {
    readonly agreementId: string;
    readonly height: number;
    readonly round: number;
    readonly view: number;
    readonly purpose: "shard" | "reconciliation";
    readonly shardId: string;
    readonly proposalDigest: string;
    readonly valueDigest: string;
    readonly logicalTimeMs: number;
    readonly viewDeadlineLogicalMs: number;
  }): Promise<SparseAgreementRoundStateV1> {
    identifier(input.agreementId, "agreementId");
    identifier(input.shardId, "shardId");
    integer(input.height, "height", 1, Number.MAX_SAFE_INTEGER);
    integer(input.round, "round", 0, Number.MAX_SAFE_INTEGER);
    integer(input.view, "view", 0, Number.MAX_SAFE_INTEGER);
    quorumDigest(input.proposalDigest, "proposalDigest");
    quorumDigest(input.valueDigest, "valueDigest");
    integer(input.logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    integer(input.viewDeadlineLogicalMs, "viewDeadlineLogicalMs", input.logicalTimeMs + 1, Number.MAX_SAFE_INTEGER);
    const assignment = await selectSparseCommitteeV2({
      membership: this.options.membership,
      policy: this.options.policy,
      purpose: input.purpose,
      shardId: input.shardId,
      crypto: this.options.crypto,
    });
    const coordinate = await createCoordinate({
      agreementId: input.agreementId,
      height: input.height,
      round: input.round,
      view: input.view,
      purpose: input.purpose,
      shardId: input.shardId,
      epoch: this.options.membership.epoch,
      membershipConfigurationDigest: this.options.membership.configurationDigest,
    }, this.options.crypto);
    for (let attempt = 0; attempt < this.#maximumCommitAttempts; attempt += 1) {
      const current = await this.load();
      if (input.logicalTimeMs < current.logicalTimeHighWaterMs)
        throw new Error("sparse agreement logical time rollback");
      if (current.status !== "idle" && current.status !== "view-change-required")
        throw new Error("sparse agreement view is already active");
      if (current.coordinate && (
        input.agreementId !== current.coordinate.agreementId ||
        input.height !== current.coordinate.height ||
        input.round !== current.coordinate.round ||
        input.view !== current.coordinate.view + 1 ||
        input.purpose !== current.coordinate.purpose ||
        input.shardId !== current.coordinate.shardId
      )) throw new TypeError("sparse agreement view lineage is invalid");
      if (current.prepareCertificate && (
        current.prepareCertificate.proposalDigest !== input.proposalDigest ||
        current.prepareCertificate.valueDigest !== input.valueDigest
      )) throw new Error("sparse agreement prepared value is locked");
      const next = await this.#createState({
        ...current,
        revision: current.revision + 1,
        status: input.purpose === "shard" && !current.prepareCertificate ? "preparing" : "committing",
        coordinate,
        assignment,
        proposalDigest: input.proposalDigest,
        valueDigest: input.valueDigest,
        viewDeadlineLogicalMs: input.viewDeadlineLogicalMs,
        shares: [],
        prepareCertificate: current.prepareCertificate,
        finalCertificate: null,
        logicalTimeHighWaterMs: input.logicalTimeMs,
        previousStateDigest: current.stateDigest,
      });
      if (await this.#store.save(next, current.revision)) return next;
    }
    throw new Error("sparse agreement start-view contention exhausted");
  }

  async advance(logicalTimeMs: number): Promise<SparseAgreementAdvanceResultV1> {
    integer(logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    let state = await this.load();
    if (!state.coordinate || !state.assignment || !state.proposalDigest || !state.valueDigest || state.viewDeadlineLogicalMs === null)
      throw new Error("sparse agreement view is not active");
    if (logicalTimeMs < state.logicalTimeHighWaterMs)
      throw new Error("sparse agreement logical time rollback");
    if (state.status === "certified") return frozenResult(state, null, state.finalCertificate);
    if (state.status === "view-change-required") return frozenResult(state, null, null);
    if (logicalTimeMs >= state.viewDeadlineLogicalMs) {
      state = await this.#transition(state, {
        status: "view-change-required",
        logicalTimeHighWaterMs: logicalTimeMs,
      });
      return frozenResult(state, null, null);
    }
    const phase: SparseAgreementShareV2["phase"] = state.coordinate.purpose === "reconciliation"
      ? "reconcile"
      : state.prepareCertificate ? "commit" : "prepare";
    let emittedShare: SparseAgreementShareV2 | null = null;
    if (this.isLocalValidator(state.assignment) && !hasLocalShare(state, phase, this.options.signer.peerId)) {
      emittedShare = await this.#createLocalShare(state, phase);
      state = await this.#appendShare(state, emittedShare, logicalTimeMs);
      await this.options.transport.publishShare({
        coordinate: state.coordinate!,
        assignment: state.assignment!,
        share: emittedShare,
      });
    }
    const shares = matchingShares(state, phase);
    const assignment = state.assignment;
    if (!assignment) throw new Error("sparse agreement assignment is unavailable");
    const certificate = await createSparseCommitteeCertificateV2({
      assignment,
      membership: this.options.membership,
      policy: this.options.policy,
      shares,
      signatures: this.options.signatures,
      certifiedAtLogicalMs: logicalTimeMs,
      crypto: this.options.crypto,
    });
    if (!certificate) return frozenResult(state, emittedShare, null);
    if (phase === "prepare") {
      state = await this.#transition(state, {
        status: "committing",
        prepareCertificate: certificate,
        logicalTimeHighWaterMs: logicalTimeMs,
      });
      await this.options.transport.publishCertificate({ coordinate: state.coordinate!, certificate });
      return frozenResult(state, emittedShare, certificate);
    }
    state = await this.#transition(state, {
      status: "certified",
      finalCertificate: certificate,
      logicalTimeHighWaterMs: logicalTimeMs,
    });
    await this.options.transport.publishCertificate({ coordinate: state.coordinate!, certificate });
    return frozenResult(state, emittedShare, certificate);
  }

  async receiveShare(
    coordinate: SparseAgreementCoordinateV1,
    assignment: SparseCommitteeAssignmentV2,
    share: SparseAgreementShareV2,
    logicalTimeMs: number,
  ): Promise<"accepted" | "duplicate" | "equivocation" | "rejected"> {
    integer(logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    await validateSparseCommitteeAssignmentDigestV2(assignment, this.options.crypto);
    const state = await this.load();
    if (logicalTimeMs < state.logicalTimeHighWaterMs || state.status === "certified" || state.status === "view-change-required")
      return "rejected";
    if (!state.coordinate || !state.assignment ||
        !sameCoordinate(coordinate, state.coordinate) ||
        assignment.assignmentDigest !== state.assignment.assignmentDigest ||
        share.committeeAssignmentDigest !== assignment.assignmentDigest)
      return "rejected";
    const validator = assignment.validators.find((item) =>
      item.peerId === share.signerPeerId && item.instanceId === share.signerInstanceId && item.keyId === share.signerKeyId,
    );
    if (!validator) return "rejected";
    const rebuilt = await createSparseAgreementShareV2({
      assignment,
      coordinateDigest: share.coordinateDigest,
      proposalDigest: share.proposalDigest,
      valueDigest: share.valueDigest,
      phase: share.phase,
      signerPeerId: share.signerPeerId,
      signerInstanceId: share.signerInstanceId,
      signerKeyId: share.signerKeyId,
      signature: share.signature,
      crypto: this.options.crypto,
    });
    if (rebuilt.shareDigest !== share.shareDigest || share.coordinateDigest !== coordinate.coordinateDigest)
      return "rejected";
    if (!(await this.options.signatures.verifyShare({
      validator,
      messageDigest: await sparseShareMessageDigestV2(share, this.options.crypto),
      signature: share.signature,
    }))) return "rejected";
    if (state.shares.some((item) => item.shareDigest === share.shareDigest)) return "duplicate";
    const prior = state.shares.find((item) =>
      item.signerPeerId === share.signerPeerId && item.phase === share.phase,
    );
    if (prior && (prior.proposalDigest !== share.proposalDigest || prior.valueDigest !== share.valueDigest)) {
      const evidence = await createEquivocationEvidence(state.coordinate, assignment, prior, share, this.options.crypto);
      const retained = await this.#transition(state, (latest) => ({
        equivocations: latest.equivocations.some((item) => item.evidenceDigest === evidence.evidenceDigest)
          ? latest.equivocations
          : latest.equivocations.length >= this.#maximumEquivocations
            ? latest.equivocations
            : [...latest.equivocations, evidence],
        logicalTimeHighWaterMs: Math.max(latest.logicalTimeHighWaterMs, logicalTimeMs),
      }));
      if (!retained.equivocations.some((item) => item.evidenceDigest === evidence.evidenceDigest))
        return "rejected";
      await this.options.transport.publishEquivocation(evidence);
      return "equivocation";
    }
    if (
      share.proposalDigest !== state.proposalDigest ||
      share.valueDigest !== state.valueDigest ||
      (state.coordinate.purpose === "shard" && share.phase === "reconcile") ||
      (state.coordinate.purpose === "reconciliation" && share.phase !== "reconcile")
    ) return "rejected";
    await this.#appendShare(state, share, logicalTimeMs);
    return "accepted";
  }

  async #createLocalShare(
    state: SparseAgreementRoundStateV1,
    phase: SparseAgreementShareV2["phase"],
  ): Promise<SparseAgreementShareV2> {
    const binding = {
      committeeAssignmentDigest: state.assignment!.assignmentDigest,
      coordinateDigest: state.coordinate!.coordinateDigest,
      proposalDigest: state.proposalDigest!,
      valueDigest: state.valueDigest!,
      phase,
    };
    const signature = await this.options.signer.sign(
      await sparseShareMessageDigestV2(binding, this.options.crypto),
    );
    return createSparseAgreementShareV2({
      assignment: state.assignment!,
      ...binding,
      signerPeerId: this.options.signer.peerId,
      signerInstanceId: this.options.signer.instanceId,
      signerKeyId: this.options.signer.keyId,
      signature,
      crypto: this.options.crypto,
    });
  }

  async #appendShare(
    state: SparseAgreementRoundStateV1,
    share: SparseAgreementShareV2,
    logicalTimeMs: number,
  ): Promise<SparseAgreementRoundStateV1> {
    if (state.shares.some((item) => item.shareDigest === share.shareDigest)) return state;
    return this.#transition(state, (latest) => ({
      shares: latest.shares.some((item) => item.shareDigest === share.shareDigest)
        ? latest.shares
        : [...latest.shares, share].sort(compareShares),
      logicalTimeHighWaterMs: Math.max(latest.logicalTimeHighWaterMs, logicalTimeMs),
    }));
  }

  async #transition(
    initial: SparseAgreementRoundStateV1,
    patch: Partial<SparseAgreementRoundStateV1> | ((state: SparseAgreementRoundStateV1) => Partial<SparseAgreementRoundStateV1>),
  ): Promise<SparseAgreementRoundStateV1> {
    let current = initial;
    for (let attempt = 0; attempt < this.#maximumCommitAttempts; attempt += 1) {
      const next = await this.#createState({
        ...current,
        ...(typeof patch === "function" ? patch(current) : patch),
        revision: current.revision + 1,
        previousStateDigest: current.stateDigest,
      });
      if (await this.#store.save(next, current.revision)) return next;
      current = await this.load();
    }
    throw new Error("sparse agreement state contention exhausted");
  }

  async #createState(
    input: Omit<SparseAgreementRoundStateV1, "stateDigest">,
  ): Promise<SparseAgreementRoundStateV1> {
    const { stateDigest: _stale, ...body } = input as SparseAgreementRoundStateV1;
    return immutable({
      ...body,
      stateDigest: await collectiveQuorumDigestV1({
        domain: "sparse-agreement-round-state-v1",
        body,
      }, this.options.crypto),
    });
  }

  private isLocalValidator(assignment: SparseCommitteeAssignmentV2): boolean {
    return assignment.validators.some((item) => localValidatorMatches(item, this.options.signer));
  }
}

export interface SparseReconciliationPreparationV1 {
  readonly requiredShardIds: readonly string[];
  readonly coordinateDigest: string;
  readonly proposalDigest: string;
  readonly valueDigest: string;
  readonly shardCertificateRootDigest: string;
  readonly shardCertificates: readonly SparseCommitteeCertificateV2[];
}

/**
 * Verifies independently certified shards, derives the exact reconciliation
 * value, and assembles finality after a reconciliation round certifies it.
 */
export class SparseFinalityAssemblyRuntimeV1 {
  constructor(readonly options: {
    readonly membership: SparseAgreementMembershipV2;
    readonly policy: SparseCommitteePolicyV2;
    readonly signatures: SparseAggregateSignaturePortV2;
    readonly crypto?: Crypto;
  }) {
    if (!options.membership || !options.policy || !options.signatures)
      throw new TypeError("sparse finality assembly ports are required");
  }

  async prepare(input: {
    readonly requiredShardIds: readonly string[];
    readonly shardCertificates: readonly SparseCommitteeCertificateV2[];
  }): Promise<SparseReconciliationPreparationV1> {
    const requiredShardIds = canonicalIdentifiers(input.requiredShardIds, "requiredShardIds");
    if (requiredShardIds.length === 0 || requiredShardIds.length > this.options.policy.maximumCommittees)
      throw new RangeError("sparse finality shard set is invalid");
    const shards = [...input.shardCertificates].sort((left, right) =>
      left.assignment.shardId.localeCompare(right.assignment.shardId));
    if (shards.length !== requiredShardIds.length)
      throw new TypeError("sparse finality shard certificate set is incomplete");
    for (const [index, certificate] of shards.entries()) {
      if (
        certificate.assignment.purpose !== "shard" ||
        certificate.assignment.shardId !== requiredShardIds[index] ||
        certificate.phase !== "commit" ||
        !(await validateSparseCommitteeCertificateV2({
          certificate,
          membership: this.options.membership,
          policy: this.options.policy,
          signatures: this.options.signatures,
          crypto: this.options.crypto,
        }))
      ) throw new TypeError("sparse finality shard certificate is invalid");
    }
    const first = shards[0];
    if (shards.some((certificate) =>
      certificate.coordinateDigest !== first.coordinateDigest ||
      certificate.proposalDigest !== first.proposalDigest ||
      certificate.valueDigest !== first.valueDigest ||
      certificate.assignment.epoch !== first.assignment.epoch ||
      certificate.assignment.membershipConfigurationDigest !== first.assignment.membershipConfigurationDigest ||
      certificate.assignment.policyDigest !== first.assignment.policyDigest,
    )) throw new TypeError("sparse finality shard values diverge");
    const shardCertificateDigests = shards.map((item) => item.certificateDigest).sort();
    const shardCertificateRootDigest = await collectiveQuorumDigestV1({
      domain: "sparse-shard-certificate-root-v2",
      coordinateDigest: first.coordinateDigest,
      proposalDigest: first.proposalDigest,
      valueDigest: first.valueDigest,
      requiredShardIds,
      shardCertificateDigests,
    }, this.options.crypto);
    return immutable({
      requiredShardIds,
      coordinateDigest: first.coordinateDigest,
      proposalDigest: first.proposalDigest,
      valueDigest: first.valueDigest,
      shardCertificateRootDigest,
      shardCertificates: shards,
    });
  }

  async finalize(input: {
    readonly preparation: SparseReconciliationPreparationV1;
    readonly reconciliationCertificate: SparseCommitteeCertificateV2;
    readonly finalizedAtLogicalMs: number;
  }): Promise<SparseFinalityCertificateV2> {
    integer(input.finalizedAtLogicalMs, "finalizedAtLogicalMs", 0, Number.MAX_SAFE_INTEGER);
    if (
      input.reconciliationCertificate.phase !== "reconcile" ||
      input.reconciliationCertificate.coordinateDigest !== input.preparation.coordinateDigest ||
      input.reconciliationCertificate.proposalDigest !== input.preparation.proposalDigest ||
      input.reconciliationCertificate.valueDigest !== input.preparation.shardCertificateRootDigest
    ) throw new TypeError("sparse reconciliation certificate binding is invalid");
    const certificate = await createSparseFinalityCertificateV2({
      requiredShardIds: input.preparation.requiredShardIds,
      shardCertificates: input.preparation.shardCertificates,
      reconciliationCertificate: input.reconciliationCertificate,
      membership: this.options.membership,
      policy: this.options.policy,
      signatures: this.options.signatures,
      finalizedAtLogicalMs: input.finalizedAtLogicalMs,
      crypto: this.options.crypto,
    });
    if (!certificate) throw new Error("sparse finality assembly failed closed");
    return certificate;
  }
}

/**
 * Verifies that two authenticated shares prove a single validator signed two
 * incompatible values for the same agreement coordinate and phase. Malformed
 * accusations fail closed.
 */
export async function validateSparseAgreementEquivocationEvidenceV1(input: {
  readonly evidence: SparseAgreementEquivocationEvidenceV1;
  readonly assignment: SparseCommitteeAssignmentV2;
  readonly signatures: SparseAggregateSignaturePortV2;
  readonly crypto?: Crypto;
}): Promise<SparseAgreementEquivocationEvidenceV1> {
  const { evidence, assignment } = input;
  if (!evidence || evidence.schemaVersion !== 1)
    throw new TypeError("sparse agreement equivocation evidence schema is invalid");
  await validateSparseCommitteeAssignmentDigestV2(assignment, input.crypto);
  if (
    evidence.committeeAssignmentDigest !== assignment.assignmentDigest ||
    evidence.firstShare.committeeAssignmentDigest !== assignment.assignmentDigest ||
    evidence.conflictingShare.committeeAssignmentDigest !== assignment.assignmentDigest ||
    evidence.coordinateDigest !== evidence.firstShare.coordinateDigest ||
    evidence.coordinateDigest !== evidence.conflictingShare.coordinateDigest ||
    evidence.phase !== evidence.firstShare.phase ||
    evidence.phase !== evidence.conflictingShare.phase ||
    evidence.signerPeerId !== evidence.firstShare.signerPeerId ||
    evidence.signerPeerId !== evidence.conflictingShare.signerPeerId ||
    evidence.firstShare.signerInstanceId !== evidence.conflictingShare.signerInstanceId ||
    evidence.firstShare.signerKeyId !== evidence.conflictingShare.signerKeyId ||
    evidence.firstShare.shareDigest === evidence.conflictingShare.shareDigest ||
    (evidence.firstShare.proposalDigest === evidence.conflictingShare.proposalDigest &&
      evidence.firstShare.valueDigest === evidence.conflictingShare.valueDigest)
  ) throw new TypeError("sparse agreement equivocation binding is invalid");
  identifier(evidence.signerPeerId, "equivocation.signerPeerId");
  quorumDigest(evidence.evidenceDigest, "equivocation.evidenceDigest");
  const validator = assignment.validators.find((item) =>
    item.peerId === evidence.signerPeerId &&
    item.instanceId === evidence.firstShare.signerInstanceId &&
    item.keyId === evidence.firstShare.signerKeyId,
  );
  if (!validator) throw new TypeError("sparse agreement equivocator is outside the committee");
  if (
    !(await verifyPersistedShare(evidence.firstShare, assignment, input.signatures, input.crypto)) ||
    !(await verifyPersistedShare(evidence.conflictingShare, assignment, input.signatures, input.crypto))
  ) throw new TypeError("sparse agreement equivocation signature is invalid");
  const ordered = [evidence.firstShare, evidence.conflictingShare]
    .sort((left, right) => left.shareDigest.localeCompare(right.shareDigest));
  const body = {
    schemaVersion: 1 as const,
    coordinateDigest: evidence.coordinateDigest,
    committeeAssignmentDigest: evidence.committeeAssignmentDigest,
    phase: evidence.phase,
    signerPeerId: evidence.signerPeerId,
    firstShare: ordered[0],
    conflictingShare: ordered[1],
  };
  const expected = await collectiveQuorumDigestV1({
    domain: "sparse-agreement-equivocation-v1",
    body,
  }, input.crypto);
  if (expected !== evidence.evidenceDigest)
    throw new TypeError("sparse agreement equivocation evidence digest is invalid");
  return immutable({ ...body, evidenceDigest: expected });
}

async function createCoordinate(
  input: Omit<SparseAgreementCoordinateV1, "schemaVersion" | "coordinateDigest">,
  crypto?: Crypto,
): Promise<SparseAgreementCoordinateV1> {
  const body = { schemaVersion: 1 as const, ...input };
  const { purpose: _purpose, shardId: _shardId, ...sharedCoordinate } = body;
  return immutable({
    ...body,
    coordinateDigest: await collectiveQuorumDigestV1({
      domain: "sparse-agreement-coordinate-v1",
      body: sharedCoordinate,
    }, crypto),
  });
}

function sameCoordinate(
  left: SparseAgreementCoordinateV1,
  right: SparseAgreementCoordinateV1,
): boolean {
  return left.schemaVersion === right.schemaVersion &&
    left.agreementId === right.agreementId &&
    left.height === right.height &&
    left.round === right.round &&
    left.view === right.view &&
    left.purpose === right.purpose &&
    left.shardId === right.shardId &&
    left.epoch === right.epoch &&
    left.membershipConfigurationDigest === right.membershipConfigurationDigest &&
    left.coordinateDigest === right.coordinateDigest;
}

async function verifyPersistedShare(
  share: SparseAgreementShareV2,
  assignment: SparseCommitteeAssignmentV2,
  signatures: SparseAggregateSignaturePortV2,
  crypto?: Crypto,
): Promise<boolean> {
  try {
    const validator = assignment.validators.find((item) =>
      item.peerId === share.signerPeerId &&
      item.instanceId === share.signerInstanceId &&
      item.keyId === share.signerKeyId,
    );
    if (!validator || share.committeeAssignmentDigest !== assignment.assignmentDigest) return false;
    const rebuilt = await createSparseAgreementShareV2({
      assignment,
      coordinateDigest: share.coordinateDigest,
      proposalDigest: share.proposalDigest,
      valueDigest: share.valueDigest,
      phase: share.phase,
      signerPeerId: share.signerPeerId,
      signerInstanceId: share.signerInstanceId,
      signerKeyId: share.signerKeyId,
      signature: share.signature,
      crypto,
    });
    return rebuilt.shareDigest === share.shareDigest && await signatures.verifyShare({
      validator,
      messageDigest: await sparseShareMessageDigestV2(share, crypto),
      signature: share.signature,
    });
  } catch {
    return false;
  }
}

async function createEquivocationEvidence(
  coordinate: SparseAgreementCoordinateV1,
  assignment: SparseCommitteeAssignmentV2,
  firstShare: SparseAgreementShareV2,
  conflictingShare: SparseAgreementShareV2,
  crypto?: Crypto,
): Promise<SparseAgreementEquivocationEvidenceV1> {
  const ordered = [firstShare, conflictingShare].sort((left, right) => left.shareDigest.localeCompare(right.shareDigest));
  const body = {
    schemaVersion: 1 as const,
    coordinateDigest: coordinate.coordinateDigest,
    committeeAssignmentDigest: assignment.assignmentDigest,
    phase: firstShare.phase,
    signerPeerId: firstShare.signerPeerId,
    firstShare: ordered[0],
    conflictingShare: ordered[1],
  };
  return immutable({
    ...body,
    evidenceDigest: await collectiveQuorumDigestV1({
      domain: "sparse-agreement-equivocation-v1",
      body,
    }, crypto),
  });
}

async function validateState(state: SparseAgreementRoundStateV1, crypto?: Crypto): Promise<void> {
  if (!state || state.schemaVersion !== 1) throw new TypeError("sparse agreement state schema is invalid");
  identifier(state.runtimeId, "runtimeId");
  integer(state.revision, "revision", 0, Number.MAX_SAFE_INTEGER);
  integer(state.logicalTimeHighWaterMs, "logicalTimeHighWaterMs", 0, Number.MAX_SAFE_INTEGER);
  if (!["idle", "preparing", "committing", "certified", "view-change-required"].includes(state.status))
    throw new TypeError("sparse agreement state status is invalid");
  if ((state.revision === 0) !== (state.previousStateDigest === null))
    throw new TypeError("sparse agreement state lineage is invalid");
  if (state.previousStateDigest !== null) quorumDigest(state.previousStateDigest, "previousStateDigest");
  quorumDigest(state.stateDigest, "stateDigest");
  const { stateDigest, ...body } = state;
  if (await collectiveQuorumDigestV1({ domain: "sparse-agreement-round-state-v1", body }, crypto) !== stateDigest)
    throw new TypeError("sparse agreement state digest is invalid");
  const active = state.status !== "idle";
  if (active !== Boolean(state.coordinate && state.assignment && state.proposalDigest && state.valueDigest && state.viewDeadlineLogicalMs !== null))
    throw new TypeError("sparse agreement active state is incomplete");
  if (state.assignment) await validateSparseCommitteeAssignmentDigestV2(state.assignment, crypto);
}

function matchingShares(
  state: SparseAgreementRoundStateV1,
  phase: SparseAgreementShareV2["phase"],
): readonly SparseAgreementShareV2[] {
  return state.shares.filter((item) =>
    item.phase === phase &&
    item.coordinateDigest === state.coordinate!.coordinateDigest &&
    item.proposalDigest === state.proposalDigest &&
    item.valueDigest === state.valueDigest,
  );
}

function canonicalIdentifiers(values: readonly string[], label: string): readonly string[] {
  if (!Array.isArray(values) || values.length > 100_000) throw new TypeError(`${label} is invalid`);
  values.forEach((item) => identifier(item, label));
  const canonical = [...new Set(values)].sort();
  if (canonical.length !== values.length || canonical.some((item, index) => item !== values[index]))
    throw new TypeError(`${label} must be canonical and unique`);
  return Object.freeze(canonical);
}

function hasLocalShare(
  state: SparseAgreementRoundStateV1,
  phase: SparseAgreementShareV2["phase"],
  peerId: string,
): boolean {
  return state.shares.some((item) => item.phase === phase && item.signerPeerId === peerId);
}

function localValidatorMatches(
  validator: SparseAgreementValidatorV2,
  signer: SparseAgreementLocalSignerV1,
): boolean {
  return validator.peerId === signer.peerId && validator.instanceId === signer.instanceId && validator.keyId === signer.keyId;
}

function compareShares(left: SparseAgreementShareV2, right: SparseAgreementShareV2): number {
  return left.phase.localeCompare(right.phase) ||
    left.signerPeerId.localeCompare(right.signerPeerId) ||
    left.shareDigest.localeCompare(right.shareDigest);
}

function frozenResult(
  state: SparseAgreementRoundStateV1,
  emittedShare: SparseAgreementShareV2 | null,
  emittedCertificate: SparseCommitteeCertificateV2 | null,
): SparseAgreementAdvanceResultV1 {
  return immutable({ state, emittedShare, emittedCertificate });
}

function identifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u.test(value))
    throw new TypeError(`${label} is invalid`);
}

function quorumDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError(`${label} is invalid`);
}

function integer(value: unknown, label: string, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum)
    throw new RangeError(`${label} is invalid`);
  return value as number;
}

function immutable<T>(value: T): T {
  const clone = structuredClone(value);
  const freeze = (item: unknown): void => {
    if (!item || typeof item !== "object" || Object.isFrozen(item)) return;
    for (const child of Object.values(item as Record<string, unknown>)) freeze(child);
    Object.freeze(item);
  };
  freeze(clone);
  return clone;
}
