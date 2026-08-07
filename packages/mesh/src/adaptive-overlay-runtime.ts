import {
  createMeshAdaptiveOverlayAppliedViewV1,
  createMeshAdaptiveOverlayBindingV1,
  createMeshAdaptiveOverlayCertificateV1,
  createMeshAdaptiveOverlayProposalV1,
  createMeshAdaptiveOverlayStateV1,
  validateMeshAdaptiveOverlayCertificateV1,
  validateMeshAdaptiveOverlayPolicyV1,
  validateMeshAdaptiveOverlayProposalV1,
  validateMeshAdaptiveOverlaySignalV1,
  validateMeshAdaptiveOverlayStateV1,
} from "./adaptive-overlay-validation.js";
import type {
  MeshAdaptiveOverlayBindingV1,
  MeshAdaptiveOverlayCertificateV1,
  MeshAdaptiveOverlayPolicyV1,
  MeshAdaptiveOverlayProposalV1,
  MeshAdaptiveOverlayResultV1,
  MeshAdaptiveOverlayRuntimeOptionsV1,
  MeshAdaptiveOverlaySignalV1,
  MeshAdaptiveOverlayStateV1,
  MeshAdaptiveOverlayStoreV1,
  MeshAdaptiveOverlayMonotonicAnchorV1,
} from "./adaptive-overlay-contracts.js";
import {
  createMeshSparsePeerViewV2,
  meshSparseOverlayProfileV2,
  validateMeshSparsePeerViewV2,
} from "./sparse-overlay.js";
import type {
  MeshSparseOverlayProfileV2,
  MeshSparsePeerViewV2,
} from "./sparse-overlay-contracts.js";

const DEFAULT_MAXIMUM_SIGNALS = 1_024;
const DEFAULT_MAXIMUM_PROPOSALS = 256;
const DEFAULT_MAXIMUM_CERTIFICATES = 256;

/** CAS-backed governance for independently witnessed local sparse-view refreshes. */
export class MeshAdaptiveOverlayRuntimeV1 {
  private readonly maximumSignals: number;
  private readonly maximumProposals: number;
  private readonly maximumCertificates: number;
  private readonly anchor: MeshAdaptiveOverlayMonotonicAnchorV1;
  private readonly policy: MeshAdaptiveOverlayPolicyV1;

  constructor(private readonly options: MeshAdaptiveOverlayRuntimeOptionsV1) {
    if (
      !options.policy ||
      !options.store ||
      !options.verifier ||
      !options.certificateVerifier
    )
      fail("store and verification ports are required");
    this.policy = validateMeshAdaptiveOverlayPolicyV1(options.policy);
    this.maximumSignals = positive(
      options.maximumSignals ?? DEFAULT_MAXIMUM_SIGNALS,
      "maximumSignals",
    );
    this.maximumProposals = positive(
      options.maximumProposals ?? DEFAULT_MAXIMUM_PROPOSALS,
      "maximumProposals",
    );
    this.maximumCertificates = positive(
      options.maximumCertificates ?? DEFAULT_MAXIMUM_CERTIFICATES,
      "maximumCertificates",
    );
    this.anchor =
      options.monotonicAnchor ??
      (options.store as MeshAdaptiveOverlayStoreV1 &
        MeshAdaptiveOverlayMonotonicAnchorV1);
    if (typeof this.anchor.readAnchor !== "function")
      fail("external monotonic anchor is required");
  }

  async initialize(input: {
    readonly binding: MeshAdaptiveOverlayBindingV1;
    readonly logicalTimeMs: number;
  }): Promise<MeshAdaptiveOverlayStateV1> {
    const binding = createMeshAdaptiveOverlayBindingV1(input.binding);
    const existing = await this.options.store.load(binding.overlayId);
    if (existing) {
      const state = await this.assertCurrentState(existing, binding.overlayId);
      if (state.currentBinding.bindingDigest !== binding.bindingDigest)
        fail("initialize binding conflicts with durable state");
      return state;
    }
    if (await this.anchor.readAnchor(binding.overlayId))
      fail("state rollback detected before initialization");
    const state = createMeshAdaptiveOverlayStateV1({
      revision: 0,
      policyDigest: this.policy.policyDigest,
      currentBinding: binding,
      applied: null,
      signals: [],
      proposals: [],
      certificates: [],
      conflicts: [],
      lastLogicalTimeMs: logical(input.logicalTimeMs),
    });
    if (
      !(await this.options.store.compareAndSwap({
        overlayId: binding.overlayId,
        expectedRevision: null,
        expectedStateDigest: null,
        next: state,
      }))
    ) {
      const raced = await this.options.store.load(binding.overlayId);
      return raced
        ? this.assertCurrentState(raced, binding.overlayId)
        : fail("initialize conflict");
    }
    return state;
  }

  /** Authentication makes a signal admissible; only a certificate can authorize an adaptation. */
  async observe(input: {
    readonly signal: MeshAdaptiveOverlaySignalV1;
    readonly expectedRevision: number;
    readonly logicalTimeMs: number;
  }): Promise<MeshAdaptiveOverlayResultV1> {
    const signal = validateMeshAdaptiveOverlaySignalV1(input.signal);
    const time = logical(input.logicalTimeMs);
    const state = await this.requireState(
      signal.binding.overlayId,
      input.expectedRevision,
    );
    if (!sameBinding(signal.binding, state.currentBinding))
      return result("stale", "binding_stale", state);
    if (
      time < state.lastLogicalTimeMs ||
      time < signal.observedAtLogicalMs ||
      time > signal.expiresAtLogicalMs
    )
      return result("stale", "signal_expired_future_or_clock_regressed", state);
    if (
      time > this.policy.validUntilLogicalMs ||
      signal.expiresAtLogicalMs > this.policy.validUntilLogicalMs ||
      signal.expiresAtLogicalMs - signal.observedAtLogicalMs >
        this.policy.maximumSignalLifetimeMs ||
      !this.policy.observers.some(
        (observer) =>
          observer.peerId === signal.observerPeerId &&
          observer.groupId === signal.observerGroupId,
      )
    )
      return result("rejected", "signal_outside_local_policy", state);
    const profile = meshAdaptiveOverlayProfileForBindingV1(signal.binding);
    if (
      signal.subjectPeerIndex >= profile.maximumPeers ||
      signal.subjectPeerIndex === signal.binding.localPeerIndex
    )
      return result("rejected", "signal_subject_invalid", state);
    if (!(await this.options.verifier.verify(signal)))
      return result("rejected", "signal_authentication_rejected", state);
    const duplicate = state.signals.find(
      (item) => item.signalDigest === signal.signalDigest,
    );
    if (duplicate) return result("duplicate", "signal_duplicate", state);
    if (
      state.signals.some(
        (item) =>
          item.signalId === signal.signalId &&
          item.signalDigest !== signal.signalDigest,
      )
    )
      return this.conflict(
        state,
        time,
        signal.signalDigest,
        "signal_equivocation",
      );
    if (state.signals.length >= this.maximumSignals)
      return result("rejected", "signal_capacity_exceeded", state);
    const next = nextState(state, {
      signals: [...state.signals, signal],
      lastLogicalTimeMs: time,
    });
    if (!(await this.cas(state, next)))
      return result("conflict", "cas_conflict", state);
    return result("observed", "signal_observed", next);
  }

  async certify(input: {
    readonly proposal: MeshAdaptiveOverlayProposalV1;
    readonly expectedRevision: number;
    readonly logicalTimeMs: number;
  }): Promise<MeshAdaptiveOverlayResultV1> {
    const proposal = validateMeshAdaptiveOverlayProposalV1(input.proposal);
    const time = logical(input.logicalTimeMs);
    const state = await this.requireState(
      proposal.binding.overlayId,
      input.expectedRevision,
    );
    if (!sameBinding(proposal.binding, state.currentBinding))
      return result("stale", "binding_stale", state);
    if (
      time < state.lastLogicalTimeMs ||
      time < proposal.proposedAtLogicalMs ||
      time > proposal.expiresAtLogicalMs ||
      time > proposal.policy.validUntilLogicalMs
    )
      return result(
        "stale",
        "proposal_expired_future_or_clock_regressed",
        state,
      );
    if (proposal.policy.policyDigest !== this.policy.policyDigest)
      return result("rejected", "proposal_policy_not_local", state);
    const existing = state.certificates.find(
      (item) => item.proposalDigest === proposal.proposalDigest,
    );
    if (existing)
      return result("duplicate", "certificate_duplicate", state, existing);
    if (
      state.proposals.some(
        (item) =>
          item.proposalId === proposal.proposalId &&
          item.proposalDigest !== proposal.proposalDigest,
      )
    )
      return this.conflict(
        state,
        time,
        proposal.proposalDigest,
        "proposal_equivocation",
      );
    const evidence = proposal.signalDigests.map((digest) =>
      state.signals.find((signal) => signal.signalDigest === digest),
    );
    if (evidence.some((signal) => !signal))
      return result("rejected", "signal_evidence_missing", state);
    const signals = evidence as MeshAdaptiveOverlaySignalV1[];
    if (
      signals.some(
        (signal) =>
          !sameBinding(signal.binding, proposal.binding) ||
          signal.expiresAtLogicalMs < time,
      )
    )
      return result("rejected", "signal_evidence_stale", state);
    const policy = validateMeshAdaptiveOverlayPolicyV1(proposal.policy);
    if (
      proposal.excludedNeighborIndexes.length !== 1 ||
      signals.some(
        (signal) =>
          signal.subjectPeerIndex !== proposal.excludedNeighborIndexes[0],
      )
    )
      return result("rejected", "proposal_subject_binding_invalid", state);
    if (
      signals.some(
        (signal) =>
          signal.expiresAtLogicalMs - signal.observedAtLogicalMs >
          policy.maximumSignalLifetimeMs,
      )
    )
      return result("rejected", "signal_lifetime_exceeds_policy", state);
    const eligible = new Map(
      policy.observers.map((observer) => [observer.peerId, observer.groupId]),
    );
    if (
      signals.some(
        (signal) =>
          eligible.get(signal.observerPeerId) !== signal.observerGroupId,
      )
    )
      return result("rejected", "observer_not_eligible", state);
    if (
      new Set(signals.map((signal) => signal.observerPeerId)).size !==
      signals.length
    )
      return result("rejected", "observer_duplicate", state);
    const groups = [
      ...new Set(signals.map((signal) => signal.observerGroupId)),
    ].sort();
    if (groups.length < policy.independentGroupThreshold)
      return result("rejected", "independent_group_threshold_not_met", state);
    if (
      state.proposals.length >= this.maximumProposals ||
      state.certificates.length >= this.maximumCertificates
    )
      return result("rejected", "certificate_capacity_exceeded", state);
    /* Certificates preserve one signal -> one observer tuple. Group uniqueness was checked above. */
    const witnesses = [...signals].sort((left, right) =>
      left.observerPeerId.localeCompare(right.observerPeerId),
    );
    const certificate = createMeshAdaptiveOverlayCertificateV1({
      certificateId: `overlay-cert:${proposal.proposalId}`,
      proposalId: proposal.proposalId,
      proposalDigest: proposal.proposalDigest,
      binding: proposal.binding,
      policy,
      policyDigest: policy.policyDigest,
      signalDigests: witnesses.map((signal) => signal.signalDigest),
      observerPeerIds: witnesses.map((signal) => signal.observerPeerId),
      observerGroupIds: witnesses.map((signal) => signal.observerGroupId),
      issuedAtLogicalMs: time,
      expiresAtLogicalMs: proposal.expiresAtLogicalMs,
    });
    const next = nextState(state, {
      proposals: appendUnique(state.proposals, proposal, this.maximumProposals),
      certificates: appendUnique(
        state.certificates,
        certificate,
        this.maximumCertificates,
      ),
      lastLogicalTimeMs: time,
    });
    if (!(await this.cas(state, next)))
      return result("conflict", "cas_conflict", state);
    return result("certified", "certificate_issued", next, certificate);
  }

  /** Applies only a current certificate; the new sparse view is generated locally in O(log N). */
  async apply(input: {
    readonly certificate: MeshAdaptiveOverlayCertificateV1;
    readonly profile: MeshSparseOverlayProfileV2;
    readonly view: MeshSparsePeerViewV2;
    readonly expectedRevision: number;
    readonly logicalTimeMs: number;
  }): Promise<MeshAdaptiveOverlayResultV1> {
    const certificate = validateMeshAdaptiveOverlayCertificateV1(
      input.certificate,
    );
    const time = logical(input.logicalTimeMs);
    const state = await this.requireState(
      certificate.binding.overlayId,
      input.expectedRevision,
    );
    if (!sameBinding(certificate.binding, state.currentBinding))
      return result("stale", "binding_stale", state);
    if (
      time < state.lastLogicalTimeMs ||
      time < certificate.issuedAtLogicalMs ||
      time > certificate.expiresAtLogicalMs
    )
      return result(
        "stale",
        "certificate_expired_future_or_clock_regressed",
        state,
      );
    const known = state.certificates.find(
      (item) => item.certificateDigest === certificate.certificateDigest,
    );
    if (!known)
      return result("rejected", "certificate_not_certified_locally", state);
    if (state.applied?.certificateDigest === certificate.certificateDigest)
      return result(
        "duplicate",
        "application_duplicate",
        state,
        certificate,
        state.applied,
      );
    if (
      state.applied &&
      state.applied.binding.revision >= certificate.binding.revision
    )
      return result("stale", "application_antirollback", state);
    const proposal = state.proposals.find(
      (item) => item.proposalDigest === certificate.proposalDigest,
    );
    if (!proposal) return result("rejected", "proposal_missing", state);
    const profile = input.profile;
    const view = validateMeshSparsePeerViewV2(profile, input.view);
    if (
      profile.profileDigest !== certificate.binding.profileDigest ||
      view.viewDigest !== certificate.binding.viewDigest ||
      view.peerIndex !== certificate.binding.localPeerIndex
    )
      return result("rejected", "local_view_binding_mismatch", state);
    const eligibleNeighbors = new Set([
      ...view.activeNeighborIndexes,
      ...view.reserveNeighborIndexes,
    ]);
    if (
      proposal.excludedNeighborIndexes.some(
        (peer) => !eligibleNeighbors.has(peer),
      )
    )
      return result("rejected", "excluded_peer_not_in_local_view", state);
    const refreshed = createMeshSparsePeerViewV2({
      schemaVersion: 2,
      profile,
      topologySeed: view.topologySeed,
      peerIndex: view.peerIndex,
      revision: view.revision + 1,
      excludedNeighborIndexes: proposal.excludedNeighborIndexes,
    });
    const binding = createMeshAdaptiveOverlayBindingV1({
      ...certificate.binding,
      viewDigest: refreshed.viewDigest,
      revision: certificate.binding.revision + 1,
    });
    const applied = createMeshAdaptiveOverlayAppliedViewV1({
      certificateDigest: certificate.certificateDigest,
      binding: certificate.binding,
      resultingViewDigest: refreshed.viewDigest,
      resultingRevision: binding.revision,
      appliedAtLogicalMs: time,
    });
    const next = nextState(state, {
      currentBinding: binding,
      applied,
      lastLogicalTimeMs: time,
    });
    if (!(await this.cas(state, next)))
      return result("conflict", "cas_conflict", state);
    return result("applied", "view_refreshed", next, certificate, applied);
  }

  /** Reconciliation accepts an equal certificate idempotently, detects equivocation, and never regresses a view. */
  async reconcile(input: {
    readonly certificate: MeshAdaptiveOverlayCertificateV1;
    readonly proposal: MeshAdaptiveOverlayProposalV1;
    readonly expectedRevision: number;
    readonly logicalTimeMs: number;
  }): Promise<MeshAdaptiveOverlayResultV1> {
    const certificate = validateMeshAdaptiveOverlayCertificateV1(
      input.certificate,
    );
    const proposal = validateMeshAdaptiveOverlayProposalV1(input.proposal);
    const time = logical(input.logicalTimeMs);
    const state = await this.requireState(
      certificate.binding.overlayId,
      input.expectedRevision,
    );
    if (
      time < state.lastLogicalTimeMs ||
      time < certificate.issuedAtLogicalMs ||
      time > certificate.expiresAtLogicalMs
    )
      return result(
        "stale",
        "certificate_expired_future_or_clock_regressed",
        state,
      );
    if (certificate.binding.revision < state.currentBinding.revision)
      return result("stale", "certificate_antirollback", state);
    if (
      certificate.proposalDigest !== proposal.proposalDigest ||
      certificate.proposalId !== proposal.proposalId ||
      certificate.policyDigest !== proposal.policy.policyDigest ||
      certificate.binding.bindingDigest !== proposal.binding.bindingDigest ||
      certificate.expiresAtLogicalMs !== proposal.expiresAtLogicalMs
    )
      return result("rejected", "certificate_proposal_binding_invalid", state);
    if (
      certificate.policyDigest !== this.policy.policyDigest ||
      proposal.policy.policyDigest !== this.policy.policyDigest
    )
      return result("rejected", "certificate_policy_not_local", state);
    if (
      [...certificate.signalDigests].sort().join("|") !==
      [...proposal.signalDigests].sort().join("|")
    )
      return result("rejected", "certificate_signal_set_invalid", state);
    if (!certificateHasIndependentEligibleWitnesses(certificate))
      return result("rejected", "certificate_witnesses_invalid", state);
    if (
      !(await this.options.certificateVerifier.verify({
        certificate,
        proposal,
      }))
    )
      return result("rejected", "certificate_authentication_rejected", state);
    const sameId = state.certificates.find(
      (item) => item.certificateId === certificate.certificateId,
    );
    if (sameId && sameId.certificateDigest === certificate.certificateDigest)
      return result("duplicate", "certificate_duplicate", state, sameId);
    if (
      sameId ||
      state.certificates.some(
        (item) =>
          item.binding.revision === certificate.binding.revision &&
          item.certificateDigest !== certificate.certificateDigest,
      )
    )
      return this.conflict(
        state,
        time,
        certificate.certificateDigest,
        "certificate_equivocation",
      );
    const sameProposal = state.proposals.find(
      (item) => item.proposalId === proposal.proposalId,
    );
    if (sameProposal && sameProposal.proposalDigest !== proposal.proposalDigest)
      return this.conflict(
        state,
        time,
        proposal.proposalDigest,
        "proposal_equivocation",
      );
    if (!sameBinding(certificate.binding, state.currentBinding))
      return result("stale", "certificate_binding_not_current", state);
    if (state.certificates.length >= this.maximumCertificates)
      return result("rejected", "certificate_capacity_exceeded", state);
    const next = nextState(state, {
      proposals: sameProposal
        ? state.proposals
        : appendUnique(state.proposals, proposal, this.maximumProposals),
      certificates: [...state.certificates, certificate],
      lastLogicalTimeMs: time,
    });
    if (!(await this.cas(state, next)))
      return result("conflict", "cas_conflict", state);
    return result("certified", "certificate_reconciled", next, certificate);
  }

  private async requireState(overlayId: string, expectedRevision: number) {
    const loaded = await this.options.store.load(overlayId);
    if (!loaded) fail("state revision conflict");
    const state = await this.assertCurrentState(loaded, overlayId);
    if (state.revision !== expectedRevision) fail("state revision conflict");
    return state;
  }
  private async assertCurrentState(
    input: MeshAdaptiveOverlayStateV1,
    overlayId: string,
  ) {
    const state = validateMeshAdaptiveOverlayStateV1(input);
    if (
      state.currentBinding.overlayId !== overlayId ||
      state.policyDigest !== this.policy.policyDigest
    )
      fail("state overlay or policy binding invalid");
    const anchor = await this.anchor.readAnchor(overlayId);
    if (
      anchor &&
      (state.revision < anchor.revision ||
        state.currentBinding.revision < anchor.bindingRevision ||
        state.lastLogicalTimeMs < anchor.lastLogicalTimeMs ||
        (state.revision === anchor.revision &&
          state.stateDigest !== anchor.stateDigest))
    )
      fail("state rollback or equivocation detected");
    return state;
  }
  private async cas(
    previous: MeshAdaptiveOverlayStateV1,
    next: MeshAdaptiveOverlayStateV1,
  ) {
    return this.options.store.compareAndSwap({
      overlayId: previous.currentBinding.overlayId,
      expectedRevision: previous.revision,
      expectedStateDigest: previous.stateDigest,
      next,
    });
  }
  private async conflict(
    state: MeshAdaptiveOverlayStateV1,
    time: number,
    digest: string,
    reasonCode: string,
  ): Promise<MeshAdaptiveOverlayResultV1> {
    const next = nextState(state, {
      conflicts: [...state.conflicts, digest as any].slice(
        -this.maximumCertificates,
      ),
      lastLogicalTimeMs: time,
    });
    if (!(await this.cas(state, next)))
      return result("conflict", "cas_conflict", state);
    return result("conflict", reasonCode, next);
  }
}

/** Minimal local store for composition tests; production adapters must persist compare-and-swap atomically. */
export class InMemoryMeshAdaptiveOverlayStoreV1
  implements MeshAdaptiveOverlayStoreV1, MeshAdaptiveOverlayMonotonicAnchorV1
{
  private readonly values = new Map<string, MeshAdaptiveOverlayStateV1>();
  private readonly anchors = new Map<
    string,
    {
      readonly revision: number;
      readonly bindingRevision: number;
      readonly lastLogicalTimeMs: number;
      readonly stateDigest: MeshAdaptiveOverlayStateV1["stateDigest"];
    }
  >();
  async load(overlayId: string) {
    return this.values.get(overlayId);
  }
  async readAnchor(overlayId: string) {
    return this.anchors.get(overlayId);
  }
  async compareAndSwap(input: {
    readonly overlayId: string;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest:
      MeshAdaptiveOverlayStateV1["stateDigest"] | null;
    readonly next: MeshAdaptiveOverlayStateV1;
  }) {
    const current = this.values.get(input.overlayId);
    if (
      (current?.revision ?? null) !== input.expectedRevision ||
      (current?.stateDigest ?? null) !== input.expectedStateDigest
    )
      return false;
    this.values.set(input.overlayId, input.next);
    this.anchors.set(input.overlayId, {
      revision: input.next.revision,
      bindingRevision: input.next.currentBinding.revision,
      lastLogicalTimeMs: input.next.lastLogicalTimeMs,
      stateDigest: input.next.stateDigest,
    });
    return true;
  }
}

export function meshAdaptiveOverlayProfileForBindingV1(
  binding: MeshAdaptiveOverlayBindingV1,
): MeshSparseOverlayProfileV2 {
  const profiles = ["standard-500", "large-5000", "frontier-100000"] as const;
  const profile = profiles
    .map(meshSparseOverlayProfileV2)
    .find((item) => item.profileDigest === binding.profileDigest);
  return profile ?? fail("unknown sparse overlay profile binding");
}

function nextState(
  state: MeshAdaptiveOverlayStateV1,
  patch: Partial<
    Omit<
      MeshAdaptiveOverlayStateV1,
      "schemaVersion" | "revision" | "stateDigest"
    >
  >,
): MeshAdaptiveOverlayStateV1 {
  return createMeshAdaptiveOverlayStateV1({
    ...state,
    ...patch,
    revision: state.revision + 1,
  });
}
function appendUnique<
  T extends {
    readonly proposalDigest?: string;
    readonly certificateDigest?: string;
  },
>(values: readonly T[], value: T, limit: number): readonly T[] {
  if (values.length >= limit) fail("state capacity exceeded");
  return [...values, value];
}
function sameBinding(
  left: MeshAdaptiveOverlayBindingV1,
  right: MeshAdaptiveOverlayBindingV1,
) {
  return left.bindingDigest === right.bindingDigest;
}
function certificateHasIndependentEligibleWitnesses(
  certificate: MeshAdaptiveOverlayCertificateV1,
) {
  const eligible = new Map(
    certificate.policy.observers.map((observer) => [
      observer.peerId,
      observer.groupId,
    ]),
  );
  if (
    new Set(certificate.observerPeerIds).size !==
    certificate.observerPeerIds.length
  )
    return false;
  for (let index = 0; index < certificate.observerPeerIds.length; index += 1) {
    if (
      eligible.get(certificate.observerPeerIds[index]) !==
      certificate.observerGroupIds[index]
    )
      return false;
  }
  return (
    new Set(certificate.observerGroupIds).size >=
    certificate.policy.independentGroupThreshold
  );
}
function logical(value: number) {
  return positive(value, "logicalTimeMs", 0);
}
function positive(value: number, name: string, minimum = 1) {
  if (!Number.isSafeInteger(value) || value < minimum)
    fail(`${name} is invalid`);
  return value;
}
function result(
  decision: MeshAdaptiveOverlayResultV1["decision"],
  reasonCode: string,
  state: MeshAdaptiveOverlayStateV1,
  certificate?: MeshAdaptiveOverlayCertificateV1,
  applied?: MeshAdaptiveOverlayResultV1["applied"],
): MeshAdaptiveOverlayResultV1 {
  return Object.freeze({
    decision,
    reasonCode,
    state,
    ...(certificate ? { certificate } : {}),
    ...(applied ? { applied } : {}),
  });
}
function fail(message: string): never {
  throw new Error(`adaptive_overlay_${message}`);
}
