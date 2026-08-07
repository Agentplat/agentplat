import assert from "node:assert/strict";
import test from "node:test";

const overlay = await import("../packages/mesh/dist/adaptive-overlay.js");
const sparse = await import("../packages/mesh/dist/sparse-overlay.js");

function fixture(options = {}) {
  const profile = sparse.meshSparseOverlayProfileV2("standard-500");
  const view = sparse.createMeshSparsePeerViewV2({
    schemaVersion: 2,
    profile,
    topologySeed: 7,
    peerIndex: 11,
  });
  const binding = overlay.createMeshAdaptiveOverlayBindingV1({
    overlayId: "overlay-1",
    localPeerIndex: 11,
    membershipDigest: overlay.meshAdaptiveOverlayDigestV1("membership", {
      revision: 1,
    }),
    profileDigest: profile.profileDigest,
    viewDigest: view.viewDigest,
    revision: 0,
  });
  const policy = overlay.createMeshAdaptiveOverlayPolicyV1({
    policyId: "policy-1",
    policyRevision: 1,
    observers: [
      { peerId: "observer-a", groupId: "group-a" },
      { peerId: "observer-b", groupId: "group-b" },
      { peerId: "observer-c", groupId: "group-b" },
    ],
    independentGroupThreshold: 2,
    maximumSignalLifetimeMs: 100,
    maximumExcludedNeighbors: 3,
    validUntilLogicalMs: 100,
  });
  const store = new overlay.InMemoryMeshAdaptiveOverlayStoreV1();
  const runtime = new overlay.MeshAdaptiveOverlayRuntimeV1({
    policy,
    store,
    verifier: {
      verifierId: "test",
      verify: (signal) => signal.authentication.value === "valid",
    },
    certificateVerifier: {
      verifierId: "certificate-test",
      verify: options.verifyCertificate ?? (() => true),
    },
  });
  return {
    profile,
    view,
    binding,
    policy,
    store,
    runtime,
    targetPeerIndex: view.activeNeighborIndexes[0],
  };
}

function signal(
  binding,
  observerPeerId,
  observerGroupId,
  signalId,
  authentication = "valid",
  subjectPeerIndex = 33,
) {
  return overlay.createMeshAdaptiveOverlaySignalV1({
    signalId,
    binding,
    observerPeerId,
    observerGroupId,
    subjectPeerIndex,
    subjectDigest: overlay.meshAdaptiveOverlayDigestV1("peer-health", {
      target: subjectPeerIndex,
    }),
    kind: "unreachable",
    observedAtLogicalMs: 1,
    expiresAtLogicalMs: 50,
    authentication: { algorithm: "test", value: authentication },
  });
}

test("requires an authenticated threshold across independent observer groups", async () => {
  const { runtime, binding, policy, targetPeerIndex } = fixture();
  await runtime.initialize({ binding, logicalTimeMs: 0 });
  const first = signal(
    binding,
    "observer-b",
    "group-b",
    "signal-b",
    "valid",
    targetPeerIndex,
  );
  let outcome = await runtime.observe({
    signal: first,
    expectedRevision: 0,
    logicalTimeMs: 1,
  });
  assert.equal(outcome.decision, "observed");
  const proposalOne = overlay.createMeshAdaptiveOverlayProposalV1({
    proposalId: "proposal-one",
    binding,
    policy,
    excludedNeighborIndexes: [targetPeerIndex],
    signalDigests: [first.signalDigest],
    proposedAtLogicalMs: 2,
    expiresAtLogicalMs: 40,
  });
  outcome = await runtime.certify({
    proposal: proposalOne,
    expectedRevision: 1,
    logicalTimeMs: 2,
  });
  assert.equal(outcome.reasonCode, "independent_group_threshold_not_met");
  const sameGroup = signal(
    binding,
    "observer-c",
    "group-b",
    "signal-c",
    "valid",
    targetPeerIndex,
  );
  outcome = await runtime.observe({
    signal: sameGroup,
    expectedRevision: 1,
    logicalTimeMs: 2,
  });
  assert.equal(outcome.decision, "observed");
  const proposalTwo = overlay.createMeshAdaptiveOverlayProposalV1({
    proposalId: "proposal-two",
    binding,
    policy,
    excludedNeighborIndexes: [targetPeerIndex],
    signalDigests: [first.signalDigest, sameGroup.signalDigest],
    proposedAtLogicalMs: 3,
    expiresAtLogicalMs: 40,
  });
  outcome = await runtime.certify({
    proposal: proposalTwo,
    expectedRevision: 2,
    logicalTimeMs: 3,
  });
  assert.equal(outcome.reasonCode, "independent_group_threshold_not_met");
  const independent = signal(
    binding,
    "observer-a",
    "group-a",
    "signal-a",
    "valid",
    targetPeerIndex,
  );
  outcome = await runtime.observe({
    signal: independent,
    expectedRevision: 2,
    logicalTimeMs: 3,
  });
  assert.equal(outcome.decision, "observed");
  const proposal = overlay.createMeshAdaptiveOverlayProposalV1({
    proposalId: "proposal-final",
    binding,
    policy,
    excludedNeighborIndexes: [targetPeerIndex],
    signalDigests: [first.signalDigest, independent.signalDigest],
    proposedAtLogicalMs: 4,
    expiresAtLogicalMs: 40,
  });
  outcome = await runtime.certify({
    proposal,
    expectedRevision: 3,
    logicalTimeMs: 4,
  });
  assert.equal(outcome.decision, "certified");
  assert.equal(outcome.certificate.observerGroupIds.length, 2);
});

test("rejects unauthenticated and stale signals without turning evidence into authority", async () => {
  const { runtime, binding, targetPeerIndex } = fixture();
  await runtime.initialize({ binding, logicalTimeMs: 0 });
  let outcome = await runtime.observe({
    signal: signal(
      binding,
      "observer-a",
      "group-a",
      "bad",
      "invalid",
      targetPeerIndex,
    ),
    expectedRevision: 0,
    logicalTimeMs: 1,
  });
  assert.equal(outcome.reasonCode, "signal_authentication_rejected");
  outcome = await runtime.observe({
    signal: signal(
      binding,
      "observer-a",
      "group-a",
      "old",
      "valid",
      targetPeerIndex,
    ),
    expectedRevision: 0,
    logicalTimeMs: 51,
  });
  assert.equal(outcome.decision, "stale");
});

test("applies a certified refresh locally with no global graph materialization", async () => {
  const { runtime, binding, policy, profile, view, targetPeerIndex, store } =
    fixture();
  await runtime.initialize({ binding, logicalTimeMs: 0 });
  const a = signal(
    binding,
    "observer-a",
    "group-a",
    "a",
    "valid",
    targetPeerIndex,
  );
  const b = signal(
    binding,
    "observer-b",
    "group-b",
    "b",
    "valid",
    targetPeerIndex,
  );
  await runtime.observe({ signal: a, expectedRevision: 0, logicalTimeMs: 1 });
  await runtime.observe({ signal: b, expectedRevision: 1, logicalTimeMs: 1 });
  const proposal = overlay.createMeshAdaptiveOverlayProposalV1({
    proposalId: "apply",
    binding,
    policy,
    excludedNeighborIndexes: [targetPeerIndex],
    signalDigests: [a.signalDigest, b.signalDigest],
    proposedAtLogicalMs: 2,
    expiresAtLogicalMs: 40,
  });
  const certified = await runtime.certify({
    proposal,
    expectedRevision: 2,
    logicalTimeMs: 2,
  });
  const applied = await runtime.apply({
    certificate: certified.certificate,
    profile,
    view,
    expectedRevision: 3,
    logicalTimeMs: 3,
  });
  assert.equal(applied.decision, "applied");
  assert.equal(applied.state.currentBinding.revision, 1);
  assert.ok(applied.applied.resultingViewDigest.startsWith("sha256:"));
  assert.ok(profile.activeNeighborCount <= 17);
  assert.equal("globalGraph" in applied, false);
  assert.equal(
    await store.compareAndSwap({
      overlayId: binding.overlayId,
      expectedRevision: applied.state.revision,
      expectedStateDigest: overlay.meshAdaptiveOverlayDigestV1("wrong", {}),
      next: applied.state,
    }),
    false,
  );
});

test("detects conflicting certificates and reconciles an isolated certificate safely", async () => {
  const source = fixture();
  await source.runtime.initialize({
    binding: source.binding,
    logicalTimeMs: 0,
  });
  const a = signal(
    source.binding,
    "observer-a",
    "group-a",
    "a",
    "valid",
    source.targetPeerIndex,
  );
  const b = signal(
    source.binding,
    "observer-b",
    "group-b",
    "b",
    "valid",
    source.targetPeerIndex,
  );
  await source.runtime.observe({
    signal: a,
    expectedRevision: 0,
    logicalTimeMs: 1,
  });
  await source.runtime.observe({
    signal: b,
    expectedRevision: 1,
    logicalTimeMs: 1,
  });
  const proposal = overlay.createMeshAdaptiveOverlayProposalV1({
    proposalId: "partition",
    binding: source.binding,
    policy: source.policy,
    excludedNeighborIndexes: [source.targetPeerIndex],
    signalDigests: [a.signalDigest, b.signalDigest],
    proposedAtLogicalMs: 2,
    expiresAtLogicalMs: 40,
  });
  const certified = await source.runtime.certify({
    proposal,
    expectedRevision: 2,
    logicalTimeMs: 2,
  });
  const rejecting = fixture({ verifyCertificate: () => false });
  await rejecting.runtime.initialize({
    binding: rejecting.binding,
    logicalTimeMs: 0,
  });
  const unauthenticated = await rejecting.runtime.reconcile({
    certificate: certified.certificate,
    proposal,
    expectedRevision: 0,
    logicalTimeMs: 3,
  });
  assert.equal(
    unauthenticated.reasonCode,
    "certificate_authentication_rejected",
  );
  const isolated = fixture();
  await isolated.runtime.initialize({
    binding: isolated.binding,
    logicalTimeMs: 0,
  });
  const reconciled = await isolated.runtime.reconcile({
    certificate: certified.certificate,
    proposal,
    expectedRevision: 0,
    logicalTimeMs: 3,
  });
  assert.equal(reconciled.reasonCode, "certificate_reconciled");
  assert.equal(
    reconciled.state.proposals[0].proposalDigest,
    proposal.proposalDigest,
  );
  const conflictProposal = overlay.createMeshAdaptiveOverlayProposalV1({
    ...proposal,
    proposalId: "conflict-proposal",
    proposedAtLogicalMs: 3,
  });
  const conflict = overlay.createMeshAdaptiveOverlayCertificateV1({
    ...certified.certificate,
    certificateId: "conflict",
    proposalId: conflictProposal.proposalId,
    proposalDigest: conflictProposal.proposalDigest,
    issuedAtLogicalMs: 3,
    expiresAtLogicalMs: 40,
  });
  const rejected = await isolated.runtime.reconcile({
    certificate: conflict,
    proposal: conflictProposal,
    expectedRevision: 1,
    logicalTimeMs: 4,
  });
  assert.equal(rejected.decision, "conflict");
  assert.equal(rejected.reasonCode, "certificate_equivocation");
});

test("profile bounds remain local at 500, 5K, and 100K peers", () => {
  for (const id of ["standard-500", "large-5000", "frontier-100000"]) {
    const profile = sparse.meshSparseOverlayProfileV2(id);
    const view = sparse.createMeshSparsePeerViewV2({
      schemaVersion: 2,
      profile,
      topologySeed: 19,
      peerIndex: profile.maximumPeers - 1,
    });
    assert.equal(
      view.activeNeighborIndexes.length,
      profile.activeNeighborCount,
    );
    assert.equal(
      view.reserveNeighborIndexes.length,
      profile.reserveNeighborCount,
    );
    assert.ok(
      view.activeNeighborIndexes.length + view.reserveNeighborIndexes.length <
        40,
    );
  }
});

test("rejects remote quorum policy substitution and future-dated evidence", async () => {
  const source = fixture();
  await source.runtime.initialize({
    binding: source.binding,
    logicalTimeMs: 0,
  });
  const future = signal(
    source.binding,
    "observer-a",
    "group-a",
    "future",
    "valid",
    source.targetPeerIndex,
  );
  const futureSignal = overlay.createMeshAdaptiveOverlaySignalV1({
    ...future,
    observedAtLogicalMs: 10,
    expiresAtLogicalMs: 50,
  });
  const futureResult = await source.runtime.observe({
    signal: futureSignal,
    expectedRevision: 0,
    logicalTimeMs: 9,
  });
  assert.equal(futureResult.decision, "stale");

  const weakPolicy = overlay.createMeshAdaptiveOverlayPolicyV1({
    ...source.policy,
    policyId: "remote-weak-policy",
    observers: [{ peerId: "attacker", groupId: "attacker" }],
    independentGroupThreshold: 1,
  });
  const attackerSignal = signal(
    source.binding,
    "attacker",
    "attacker",
    "attacker-signal",
    "valid",
    source.targetPeerIndex,
  );
  const weakProposal = overlay.createMeshAdaptiveOverlayProposalV1({
    proposalId: "weak-proposal",
    binding: source.binding,
    policy: weakPolicy,
    excludedNeighborIndexes: [source.targetPeerIndex],
    signalDigests: [attackerSignal.signalDigest],
    proposedAtLogicalMs: 2,
    expiresAtLogicalMs: 40,
  });
  const weakCertificate = overlay.createMeshAdaptiveOverlayCertificateV1({
    certificateId: "weak-certificate",
    proposalId: weakProposal.proposalId,
    proposalDigest: weakProposal.proposalDigest,
    binding: source.binding,
    policy: weakPolicy,
    policyDigest: weakPolicy.policyDigest,
    signalDigests: [attackerSignal.signalDigest],
    observerPeerIds: ["attacker"],
    observerGroupIds: ["attacker"],
    issuedAtLogicalMs: 2,
    expiresAtLogicalMs: 40,
  });
  const rejected = await source.runtime.reconcile({
    certificate: weakCertificate,
    proposal: weakProposal,
    expectedRevision: 0,
    logicalTimeMs: 3,
  });
  assert.equal(rejected.reasonCode, "certificate_policy_not_local");
});

test("refuses initialization when a replaceable snapshot vanished behind its anchor", async () => {
  const base = fixture();
  const store = {
    async load() {
      return undefined;
    },
    async readAnchor() {
      return {
        revision: 4,
        bindingRevision: 2,
        lastLogicalTimeMs: 20,
        stateDigest: overlay.meshAdaptiveOverlayDigestV1("prior", {}),
      };
    },
    async compareAndSwap() {
      throw new Error("must not initialize below anchor");
    },
  };
  const runtime = new overlay.MeshAdaptiveOverlayRuntimeV1({
    policy: base.policy,
    store,
    verifier: { verifierId: "test", verify: () => true },
    certificateVerifier: { verifierId: "certificate-test", verify: () => true },
  });
  await assert.rejects(
    runtime.initialize({ binding: base.binding, logicalTimeMs: 0 }),
    /rollback detected before initialization/,
  );
});
